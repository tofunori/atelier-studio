//! Couper un paragraphe en deux (Entrée) ou le joindre au précédent
//! (Retour arrière en tête de paragraphe), en suivi ou non.
//!
//! Chez Word, la marque insérée par Entrée est celle de la première moitié :
//! c'est elle qui porte `w:pPr/w:rPr/w:ins`. Joindre deux paragraphes
//! supprime la marque du premier.

use crate::edit::{cut, run_len, run_starts, run_xml, target};
use crate::walk::content_after_ppr;
use crate::xml::{self, W14, escape_attr, inner_range, is_w, open_tag, w_attr, w_child};
use crate::{DOCUMENT, Docx, Result, Signature, err};
use std::ops::Range;

fn marker(kind: &str, id: u32, sig: &Signature) -> String {
    format!("<w:{kind} w:id=\"{id}\" w:author=\"{}\" w:date=\"{}\"/>", escape_attr(&sig.author), escape_attr(&sig.date))
}

/// Propriétés d'un paragraphe sans saut de section ni historique, avec un
/// suivi éventuel sur la marque.
fn ppr_for_first_half(src: &str, ppr: Option<roxmltree::Node>, mark: Option<&str>) -> String {
    let mut inner = String::new();
    let mut rpr: Option<String> = None;
    if let Some(ppr) = ppr {
        for c in ppr.children().filter(|n| n.is_element()) {
            match c.tag_name().name() {
                "sectPr" | "pPrChange" if is_w(c, c.tag_name().name()) => {}
                "rPr" if is_w(c, "rPr") => {
                    // Marques déjà présentes : on repart des propriétés seules.
                    let props: String = c
                        .children()
                        .filter(|n| n.is_element() && !["ins", "del", "moveFrom", "moveTo"].iter().any(|k| is_w(*n, k)))
                        .map(|n| &src[n.range()])
                        .collect();
                    rpr = Some(props);
                }
                _ => inner.push_str(&src[c.range()]),
            }
        }
    }
    match (mark, rpr) {
        (Some(m), Some(props)) => inner.push_str(&format!("<w:rPr>{m}{props}</w:rPr>")),
        (Some(m), None) => inner.push_str(&format!("<w:rPr>{m}</w:rPr>")),
        (None, Some(props)) if !props.is_empty() => inner.push_str(&format!("<w:rPr>{props}</w:rPr>")),
        _ => {}
    }
    if inner.is_empty() { String::new() } else { format!("<w:pPr>{inner}</w:pPr>") }
}

/// Style qui suit `style` après Entrée (`w:next`), s'il diffère.
fn next_style(docx: &mut Docx, style: &str) -> Result<Option<String>> {
    let Some(styles) = docx.part("word/styles.xml")? else { return Ok(None) };
    let doc = xml::parse(&styles)?;
    let next = doc
        .root_element()
        .children()
        .find(|n| is_w(*n, "style") && w_attr(*n, "styleId") == Some(style))
        .and_then(|st| w_child(st, "next"))
        .and_then(|n| w_attr(n, "val"))
        .filter(|v| *v != style)
        .map(str::to_string);
    Ok(next)
}

/// Coupe le paragraphe à la position `at` (en caractères du texte courant).
pub fn split(docx: &mut Docx, paragraph: &str, at: usize, tracked: bool, sig: &Signature) -> Result<()> {
    let src = docx.document_xml().to_string();
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let t = target(&src, &doc, paragraph)?;
    let len = t.text.chars().count();
    if at > len {
        return err("position au-delà de la fin du paragraphe");
    }
    let p = doc.descendants().find(|n| is_w(*n, "p") && n.range() == t.p_range).unwrap();
    let starts = run_starts(&t);

    // Point de coupe dans le XML : (position, run découpé éventuel).
    let mut cut_at: Option<(usize, Option<(usize, usize)>)> = None;
    for (ri, run) in t.inline.runs.iter().enumerate() {
        let Some(rs) = starts[ri] else { continue };
        let re = rs + run_len(&t, ri);
        if rs < at && at < re {
            cut_at = Some((run.range.start, Some((ri, at - rs))));
            break;
        }
    }
    if cut_at.is_none() {
        // Frontière : après le dernier morceau qui finit en `at`.
        let mut pos = None;
        for (piece, span) in t.inline.pieces.iter().zip(&t.spans) {
            if let Some((ps, pe)) = span
                && *pe <= at && pe > ps {
                    pos = Some(match piece.run {
                        Some((ri, _)) if starts[ri].is_some_and(|rs| rs + run_len(&t, ri) == *pe) => t.inline.runs[ri].range.end,
                        Some(_) => return err("coupe impossible à cet endroit"),
                        None => piece.top.end,
                    });
                }
        }
        let content = content_after_ppr(p);
        let pos = pos.or_else(|| content.as_ref().map(|r| r.start)).unwrap_or_else(|| t.ppr_end.or(t.p_inner_end).unwrap_or(t.p_range.end));
        cut_at = Some((pos, None));
    }
    let (mut pos, split_run) = cut_at.unwrap();
    if t.inline.pieces.iter().any(|pc| pc.top.start < pos && pos < pc.top.end && pc.run.is_none()) {
        return err("coupe au milieu d'un champ ou d'un suivi : placer le curseur ailleurs");
    }
    // Coupe dans un enveloppant (w:ins d'une frappe, w:hyperlink…) : collée à
    // un bord, elle passe dehors ; au milieu, il est fermé puis rouvert.
    let mut wrap: Option<(String, String, Option<String>)> = None;
    if let Some(top) = t.inline.pieces.iter().find(|pc| pc.run.is_some() && pc.top.start < pos && pos < pc.top.end).map(|pc| pc.top.clone()) {
        let spans = || t.inline.pieces.iter().zip(&t.spans).filter(|(pc, _)| pc.top == top).filter_map(|(_, s)| *s).filter(|(s, e)| e > s);
        let before = spans().any(|(s, _)| s < at);
        let after = spans().any(|(_, e)| e > at);
        if split_run.is_none() && !after {
            pos = top.end;
        } else if split_run.is_none() && !before {
            pos = top.start;
        } else {
            let node = doc.descendants().find(|n| n.is_element() && n.range() == top).unwrap();
            let direct = node.children().any(|c| is_w(c, "r") && (c.range().start == pos || c.range().end == pos));
            if !direct {
                return err("coupe impossible à cet endroit : placer le curseur ailleurs");
            }
            let open = open_tag(&src, node);
            let name: String = open[1..].chars().take_while(|c| !c.is_whitespace() && *c != '>' && *c != '/').collect();
            let rev = ["ins", "del", "moveFrom", "moveTo"].iter().any(|k| is_w(node, k));
            wrap = Some((format!("</{name}>"), open, w_attr(node, "id").filter(|_| rev).map(str::to_string)));
        }
    }

    let ppr = w_child(p, "pPr");
    let content: Range<usize> = content_after_ppr(p).unwrap_or(pos..pos);
    let (first_tail, second_head, resume) = match split_run {
        Some((ri, rel)) => {
            let run = &t.inline.runs[ri];
            let (before, _, after) = cut(&run.toks, rel, rel);
            (run_xml(&run.start_tag, &run.rpr, &before, false), run_xml(&run.start_tag, &run.rpr, &after, false), run.range.end)
        }
        None => (String::new(), String::new(), pos),
    };
    let first_content = if content.start < pos { &src[content.start..pos] } else { "" };
    let second_content = if resume < content.end { &src[resume..content.end] } else { "" };

    let ids = crate::edit::next_ids(docx, 2)?;
    let id = ids[0];
    // La moitié rouverte d'un suivi prend un identifiant neuf.
    let (wrap_close, wrap_open) = match wrap {
        Some((close, open, Some(old))) => (close, open.replacen(&format!("w:id=\"{old}\""), &format!("w:id=\"{}\"", ids[1]), 1)),
        Some((close, open, None)) => (close, open),
        None => (String::new(), String::new()),
    };
    let mark = tracked.then(|| marker("ins", id, sig));
    // Première moitié : nouveau paragraphe (paraId neuf), mêmes propriétés.
    let pid = xml::new_para_id(&format!("{}{at}{}", t.text, sig.date), id);
    let first_open = match p.attribute((W14, "paraId")) {
        Some(old) => open_tag(&src, p).replace(&format!("w14:paraId=\"{old}\""), &format!("w14:paraId=\"{pid}\"")),
        None => open_tag(&src, p),
    };
    let first = format!("{first_open}{}{first_content}{first_tail}{wrap_close}</w:p>", ppr_for_first_half(&src, ppr, mark.as_deref()));
    // Seconde moitié : garde l'identité du paragraphe et sa marque. Entrée
    // en fin de titre : la suite prend le style suivant (Normal).
    let style = ppr.and_then(|n| w_child(n, "pStyle")).and_then(|n| w_attr(n, "val")).map(str::to_string);
    let next = match (&style, at == len) {
        (Some(s), true) => next_style(docx, s)?,
        _ => None,
    };
    let second_ppr = match (ppr, next) {
        (Some(ppr), Some(next)) => {
            let keep: String = ppr.children().filter(|n| is_w(*n, "sectPr") || is_w(*n, "rPr")).map(|n| &src[n.range()]).collect();
            if next == "Normal" { if keep.is_empty() { String::new() } else { format!("<w:pPr>{keep}</w:pPr>") } } else { format!("<w:pPr><w:pStyle w:val=\"{next}\"/>{keep}</w:pPr>") }
        }
        (Some(ppr), None) => src[ppr.range()].to_string(),
        (None, _) => String::new(),
    };
    let second = format!("{}{second_ppr}{wrap_open}{second_head}{second_content}</w:p>", open_tag(&src, p));
    drop(doc);
    let out = xml::splice(&src, vec![(t.p_range.clone(), format!("{first}{second}"))])?;
    docx.set_part(DOCUMENT, out);
    Ok(())
}

/// Joint le paragraphe à celui qui le précède (sa marque est supprimée).
pub fn join(docx: &mut Docx, paragraph: &str, tracked: bool, sig: &Signature) -> Result<()> {
    let src = docx.document_xml().to_string();
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let t = target(&src, &doc, paragraph)?;
    let q = doc.descendants().find(|n| is_w(*n, "p") && n.range() == t.p_range).unwrap();
    let Some(p) = q.prev_siblings().skip(1).find(|n| n.is_element()).filter(|n| is_w(*n, "p")) else {
        return err("pas de paragraphe juste avant (début de cellule ou après un tableau)");
    };
    let ppr = w_child(p, "pPr");
    let mark = ppr.and_then(|n| w_child(n, "rPr")).and_then(|r| r.children().find(|c| is_w(*c, "ins") || is_w(*c, "del")));
    // Marque insérée par l'auteur lui-même : on défait simplement son Entrée.
    let own_insert = mark.is_some_and(|m| is_w(m, "ins") && w_attr(m, "author") == Some(sig.author.as_str()));
    // Déjà supprimée en suivi : rien à ajouter. Sans suivi, on fusionne pour
    // de bon (la marque supprimée disparaît avec le paragraphe).
    if tracked && mark.is_some_and(|m| is_w(m, "del")) {
        return Ok(());
    }
    if tracked && !own_insert {
        let id = crate::edit::next_ids(docx, 1)?[0];
        let m = marker("del", id, sig);
        let edit = match ppr {
            Some(ppr) => match w_child(ppr, "rPr") {
                Some(rpr) => match inner_range(rpr) {
                    // L'ordre du schéma veut ins avant del.
                    Some(r) => {
                        let at = rpr.children().rfind(|n| is_w(*n, "ins")).map(|n| n.range().end).unwrap_or(r.start);
                        (at..at, m)
                    }
                    None => (rpr.range(), format!("<w:rPr>{m}</w:rPr>")),
                },
                None => {
                    // rPr se place avant sectPr et pPrChange.
                    let at = ppr
                        .children()
                        .find(|n| is_w(*n, "sectPr") || is_w(*n, "pPrChange"))
                        .map(|n| n.range().start)
                        .or_else(|| inner_range(ppr).map(|r| r.end))
                        .unwrap_or(ppr.range().end);
                    match inner_range(ppr) {
                        Some(_) => (at..at, format!("<w:rPr>{m}</w:rPr>")),
                        None => (ppr.range(), format!("<w:pPr><w:rPr>{m}</w:rPr></w:pPr>")),
                    }
                }
            },
            None => {
                let at = p.first_child().map(|c| c.range().start);
                match at {
                    Some(a) => (a..a, format!("<w:pPr><w:rPr>{m}</w:rPr></w:pPr>")),
                    None => (p.range(), format!("{}<w:pPr><w:rPr>{m}</w:rPr></w:pPr></w:p>", open_tag(&src, p))),
                }
            }
        };
        drop(doc);
        let out = xml::splice(&src, vec![edit])?;
        docx.set_part(DOCUMENT, out);
        return Ok(());
    }
    if ppr.and_then(|n| w_child(n, "sectPr")).is_some() {
        return err("la marque précédente porte un saut de section : à joindre dans Word");
    }
    // Sans suivi : le texte du premier rejoint le second, qui garde ses
    // propriétés… sauf si l'on défait sa propre Entrée : le premier garde
    // alors les siennes, comme avant la coupe.
    let style_of = |n: roxmltree::Node| w_child(n, "pPr").and_then(|x| w_child(x, "pStyle")).and_then(|x| w_attr(x, "val")).map(str::to_string);
    let qppr = w_child(q, "pPr");
    let keep_ppr = if own_insert && style_of(p) != style_of(q) {
        // Entrée en fin de titre défaite : le titre retrouve son style.
        let first = ppr_for_first_half(&src, ppr, None);
        match qppr.and_then(|n| w_child(n, "sectPr")) {
            Some(sect) if first.is_empty() => format!("<w:pPr>{}</w:pPr>", &src[sect.range()]),
            Some(sect) => first.replacen("</w:pPr>", &format!("{}</w:pPr>", &src[sect.range()]), 1),
            None => first,
        }
    } else {
        qppr.map(|n| src[n.range()].to_string()).unwrap_or_default()
    };
    let mut out = open_tag(&src, q);
    out.push_str(&keep_ppr);
    if let Some(r) = content_after_ppr(p) {
        out.push_str(&src[r]);
    }
    if let Some(r) = content_after_ppr(q) {
        out.push_str(&src[r]);
    }
    out.push_str("</w:p>");
    let range = p.range().start..q.range().end;
    drop(doc);
    let text = xml::splice(&src, vec![(range, out)])?;
    docx.set_part(DOCUMENT, text);
    Ok(())
}
