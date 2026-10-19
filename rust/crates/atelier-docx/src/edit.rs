//! Remplacer un passage d'un paragraphe, en suivi de modifications ou non.
//!
//! Seuls les runs « simples » hors suivi et hors champ sont découpés ; un
//! passage qui traverse une citation Zotero, une figure ou le suivi d'un
//! autre auteur est refusé avec une explication.

use crate::walk::{self, Inline, Kind, Piece, Tok};
use crate::xml::{self, W14, escape_attr, escape_text};
use crate::{COMMENTS, DOCUMENT, Docx, DocxError, Result, Signature, err};
use roxmltree::Document;
use std::ops::Range;

/// Paragraphe ciblé, avec son contenu et la position de chaque morceau
/// dans le texte courant (en caractères).
pub(crate) struct Target {
    pub inline: Inline,
    /// (début, fin) en caractères ; `None` pour un morceau supprimé.
    pub spans: Vec<Option<(usize, usize)>>,
    pub text: String,
    pub p_range: Range<usize>,
    pub p_open: String,
    pub ppr_end: Option<usize>,
    pub p_inner_end: Option<usize>,
}

pub(crate) fn target(src: &str, doc: &Document, paragraph: &str) -> Result<Target> {
    let paras = walk::paragraphs(doc);
    let index = match paragraph.strip_prefix('p').and_then(|n| n.parse::<usize>().ok()) {
        Some(i) => Some(i),
        None => paras.iter().position(|p| p.node.attribute((W14, "paraId")) == Some(paragraph)),
    };
    let Some(index) = index.filter(|i| *i < paras.len()) else {
        return err(format!("paragraphe {paragraph} introuvable"));
    };
    let mut state = walk::State::default();
    for p in &paras[..index] {
        walk::inline(src, p.node, &mut state);
    }
    let p = paras[index].node;
    let inline = walk::inline(src, p, &mut state);
    let mut spans = Vec::with_capacity(inline.pieces.len());
    let mut text = String::new();
    let mut at = 0;
    for piece in &inline.pieces {
        if piece.rev.is_some_and(|(k, _)| k.removes()) {
            spans.push(None);
            continue;
        }
        let n = piece.text.chars().count();
        spans.push(Some((at, at + n)));
        at += n;
        text.push_str(&piece.text);
    }
    Ok(Target {
        inline,
        spans,
        text,
        p_range: p.range(),
        p_open: xml::open_tag(src, p),
        ppr_end: xml::w_child(p, "pPr").map(|n| n.range().end),
        p_inner_end: xml::inner_range(p).map(|r| r.end),
    })
}

/// Position (en caractères) de la `occurrence`-ième apparition de `find`.
pub(crate) fn find_in(text: &str, find: &str, occurrence: Option<usize>, paragraph: &str) -> Result<(usize, usize)> {
    if find.is_empty() {
        return err("passage à chercher vide");
    }
    let hits: Vec<usize> = text.match_indices(find).map(|(b, _)| text[..b].chars().count()).collect();
    let len = find.chars().count();
    match (hits.len(), occurrence) {
        (0, _) => err(format!("passage introuvable dans {paragraph} : « {find} »")),
        (1, None) => Ok((hits[0], hits[0] + len)),
        (n, None) => err(format!("passage présent {n} fois dans {paragraph} : préciser l'occurrence")),
        (n, Some(k)) if k == 0 || k > n => err(format!("occurrence {k} hors limites ({n} dans {paragraph})")),
        (_, Some(k)) => Ok((hits[k - 1], hits[k - 1] + len)),
    }
}

fn obstacle(p: &Piece) -> String {
    if p.rev.is_some() {
        return "une modification en suivi d'un autre auteur (l'accepter ou la refuser d'abord)".into();
    }
    match &p.kind {
        Kind::Field(k) if k.starts_with("zotero") => "une citation Zotero".into(),
        Kind::Field(_) => "un champ (renvoi, numéro…)".into(),
        Kind::Object(k) => format!("un objet ({k})"),
        _ => "un passage qu'on ne sait pas découper sans risque".into(),
    }
}

pub(crate) fn toks_of(text: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut buf = String::new();
    for c in text.chars() {
        let special = match c {
            '\t' => Some(Tok::Tab),
            '\n' => Some(Tok::Br),
            _ => None,
        };
        match special {
            Some(t) => {
                if !buf.is_empty() {
                    out.push(Tok::Text(std::mem::take(&mut buf)));
                }
                out.push(t);
            }
            None => buf.push(c),
        }
    }
    if !buf.is_empty() {
        out.push(Tok::Text(buf));
    }
    out
}

pub(crate) fn run_xml(start_tag: &str, rpr: &str, toks: &[Tok], deleted: bool) -> String {
    let mut out = String::from(start_tag);
    out.push_str(rpr);
    for t in toks {
        match t {
            Tok::Text(s) if deleted => out.push_str(&format!("<w:delText xml:space=\"preserve\">{}</w:delText>", escape_text(s))),
            Tok::Text(s) => out.push_str(&format!("<w:t xml:space=\"preserve\">{}</w:t>", escape_text(s))),
            Tok::Tab => out.push_str("<w:tab/>"),
            Tok::Br => out.push_str("<w:br/>"),
            Tok::Cr => out.push_str("<w:cr/>"),
            Tok::NoBreakHyphen => out.push_str("<w:noBreakHyphen/>"),
            Tok::SoftHyphen => out.push_str("<w:softHyphen/>"),
        }
    }
    out.push_str("</w:r>");
    out
}

/// Jetons d'un run coupés aux positions `a` et `b` (relatives au run, en
/// caractères) : avant, milieu, après.
pub(crate) fn cut(toks: &[Tok], a: usize, b: usize) -> (Vec<Tok>, Vec<Tok>, Vec<Tok>) {
    let (mut before, mut mid, mut after) = (Vec::new(), Vec::new(), Vec::new());
    let mut at = 0;
    for t in toks {
        let n = t.text().chars().count();
        let (s, e) = (at, at + n);
        at = e;
        match t {
            Tok::Text(txt) if s < a.max(s) || e > b.min(e) => {
                let chars: Vec<char> = txt.chars().collect();
                let take = |from: usize, to: usize| -> Option<Tok> {
                    let (from, to) = (from.clamp(s, e) - s, to.clamp(s, e) - s);
                    (from < to).then(|| Tok::Text(chars[from..to].iter().collect()))
                };
                before.extend(take(s, a));
                mid.extend(take(a, b));
                after.extend(take(b, e));
            }
            _ if n == 0 => {
                // Trait d'union conditionnel : suit le caractère précédent.
                if s <= a { before.push(t.clone()) } else if s < b { mid.push(t.clone()) } else { after.push(t.clone()) }
            }
            _ if e <= a => before.push(t.clone()),
            _ if s >= b => after.push(t.clone()),
            _ => mid.push(t.clone()),
        }
    }
    (before, mid, after)
}

/// Début (en caractères) de chaque run retouchable dans le texte courant.
pub(crate) fn run_starts(t: &Target) -> Vec<Option<usize>> {
    let mut starts = vec![None; t.inline.runs.len()];
    for (piece, span) in t.inline.pieces.iter().zip(&t.spans) {
        if let (Some((ri, ti)), Some((s, _))) = (piece.run, span)
            && starts[ri].is_none() {
                let before: usize = t.inline.runs[ri].toks[..ti].iter().map(|k| k.text().chars().count()).sum();
                starts[ri] = Some(s - before);
            }
    }
    starts
}

pub(crate) fn run_len(t: &Target, ri: usize) -> usize {
    t.inline.runs[ri].toks.iter().map(|k| k.text().chars().count()).sum()
}

fn attrs(id: u32, sig: &Signature) -> String {
    format!("w:id=\"{id}\" w:author=\"{}\" w:date=\"{}\"", escape_attr(&sig.author), escape_attr(&sig.date))
}

pub(crate) fn next_ids(docx: &mut Docx, n: u32) -> Result<Vec<u32>> {
    let comments = docx.part(COMMENTS)?.unwrap_or_default();
    let base = xml::max_w_id(docx.document_xml()).max(xml::max_w_id(&comments));
    Ok((1..=n).map(|k| base + k).collect())
}

#[derive(Debug, serde::Serialize)]
pub struct EditResult {
    /// Identifiants des suivis créés (suppression puis insertion).
    pub changes: Vec<u32>,
}

/// Remplace `find` par `with` dans le paragraphe `paragraph` (`p12` ou un
/// `w14:paraId`). `with` vide = suppression ; en suivi, signé `sig`.
pub fn replace(docx: &mut Docx, paragraph: &str, find: &str, occurrence: Option<usize>, with: &str, tracked: bool, sig: &Signature) -> Result<EditResult> {
    let src = docx.document_xml().to_string();
    let doc = xml::parse(&src)?;
    let t = target(&src, &doc, paragraph)?;
    let (s, e) = find_in(&t.text, find, occurrence, paragraph)?;
    drop(doc);
    replace_span(docx, &src, &t, s, e, with, tracked, sig)
}

/// Insère `with` à la position `at` (en caractères) du texte courant.
pub fn insert(docx: &mut Docx, paragraph: &str, at: usize, with: &str, tracked: bool, sig: &Signature) -> Result<EditResult> {
    let src = docx.document_xml().to_string();
    let doc = xml::parse(&src)?;
    let t = target(&src, &doc, paragraph)?;
    if at > t.text.chars().count() {
        return err("position au-delà de la fin du paragraphe");
    }
    drop(doc);
    replace_span(docx, &src, &t, at, at, with, tracked, sig)
}

/// Remplace les caractères `start..end` du texte courant par `with`
/// (frappe dans le panneau : sélection remplacée, retour arrière, Suppr).
#[allow(clippy::too_many_arguments)]
pub fn replace_range(docx: &mut Docx, paragraph: &str, start: usize, end: usize, with: &str, tracked: bool, sig: &Signature) -> Result<EditResult> {
    let src = docx.document_xml().to_string();
    let doc = xml::parse(&src)?;
    let t = target(&src, &doc, paragraph)?;
    if start > end || end > t.text.chars().count() {
        return err("passage au-delà de la fin du paragraphe");
    }
    drop(doc);
    replace_span(docx, &src, &t, start, end, with, tracked, sig)
}

#[allow(clippy::too_many_arguments)]
fn replace_span(docx: &mut Docx, src: &str, t: &Target, s: usize, e: usize, with: &str, tracked: bool, sig: &Signature) -> Result<EditResult> {
    if s == e && with.is_empty() {
        return Ok(EditResult { changes: Vec::new() });
    }
    xml::require_w_prefix(&xml::parse(src)?)?;
    // Tout ce qui est couvert doit être retouchable par cet auteur.
    let allowed = |ri: usize| t.inline.runs[ri].ins.as_ref().is_none_or(|(_, a)| *a == sig.author);
    for (piece, span) in t.inline.pieces.iter().zip(&t.spans) {
        if let Some((ps, pe)) = span
            && *ps < e && *pe > s && ps != pe && !piece.run.is_some_and(|(ri, _)| allowed(ri)) {
                return err(format!("le passage touche {} : retouche refusée", obstacle(piece)));
            }
    }
    let starts = run_starts(t);
    let mut touched: Vec<usize> = (0..t.inline.runs.len())
        .filter(|&ri| allowed(ri))
        .filter(|&ri| {
            let Some(rs) = starts[ri] else { return false };
            let re = rs + run_len(t, ri);
            if s == e { rs < s && s < re } else { rs < e && re > s }
        })
        .collect();
    // Insertion pure à une frontière : accrocher au run qui finit en `s`,
    // sinon à celui qui commence en `s`.
    let mut anchor_after = true;
    if touched.is_empty() && s == e {
        // Une insertion de l'auteur au même endroit passe devant : la frappe
        // prolonge son propre ajout.
        let ends_here = |ri: &usize| allowed(*ri) && starts[*ri].is_some_and(|rs| rs + run_len(t, *ri) == s);
        let own_end = (0..t.inline.runs.len()).rev().filter(ends_here).find(|ri| t.inline.runs[*ri].ins.is_some());
        let own_start = (0..t.inline.runs.len()).find(|&ri| allowed(ri) && t.inline.runs[ri].ins.is_some() && starts[ri] == Some(s));
        if let Some(ri) = own_end {
            touched.push(ri);
        } else if let Some(ri) = own_start {
            touched.push(ri);
            anchor_after = false;
        } else if let Some(ri) = (0..t.inline.runs.len()).rev().find(ends_here) {
            touched.push(ri);
        } else if let Some(ri) = (0..t.inline.runs.len()).find(|&ri| allowed(ri) && starts[ri] == Some(s)) {
            touched.push(ri);
            anchor_after = false;
        }
    }
    let ids = next_ids(docx, 2)?;
    let (del_id, ins_id) = (ids[0], ids[1]);
    let mut made = Vec::new();
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();

    let new_run = |rpr: &str| -> String {
        let r = run_xml("<w:r>", rpr, &toks_of(with), false);
        if tracked { format!("<w:ins {}>{r}</w:ins>", attrs(ins_id, sig)) } else { r }
    };

    if touched.is_empty() {
        // Paragraphe sans texte retouchable autour : fin du paragraphe ou
        // juste après ses propriétés.
        if s != e {
            return err("aucun texte retouchable à cet endroit");
        }
        let at = if s == 0 { t.ppr_end.or(t.p_inner_end) } else { t.p_inner_end };
        match at {
            Some(a) => edits.push((a..a, new_run(""))),
            // `<w:p/>` ou `<w:p></w:p>` : on réécrit le paragraphe entier.
            None => edits.push((t.p_range.clone(), format!("{}{}</w:p>", t.p_open, new_run("")))),
        }
        if tracked {
            made.push(ins_id);
        }
    } else {
        let first_rpr = t.inline.runs[touched[0]].rpr.clone();
        let last = *touched.last().unwrap();
        let mut deleted_any = false;
        let mut inserted = false;
        for &ri in &touched {
            let run = &t.inline.runs[ri];
            let rs = starts[ri].unwrap();
            let (before, mid, after) = if s == e && touched.len() == 1 && !(rs < s && s < rs + run_len(t, ri)) {
                // Accroche à une frontière.
                if anchor_after { (run.toks.clone(), vec![], vec![]) } else { (vec![], vec![], run.toks.clone()) }
            } else {
                cut(&run.toks, s.saturating_sub(rs), e.saturating_sub(rs).min(run_len(t, ri)))
            };
            let mut out = String::new();
            if !before.is_empty() {
                out.push_str(&run_xml(&run.start_tag, &run.rpr, &before, false));
            }
            // Dans son propre ajout, l'auteur efface et ajoute sans suivi.
            let own = run.ins.is_some();
            if !mid.is_empty() && tracked && !own {
                deleted_any = true;
                out.push_str(&format!("<w:del {}>{}</w:del>", attrs(del_id, sig), run_xml(&run.start_tag, &run.rpr, &mid, true)));
            }
            if ri == last && !with.is_empty() {
                if own {
                    out.push_str(&run_xml("<w:r>", &first_rpr, &toks_of(with), false));
                } else {
                    out.push_str(&new_run(&first_rpr));
                    inserted = tracked;
                }
            }
            if !after.is_empty() {
                out.push_str(&run_xml(&run.start_tag, &run.rpr, &after, false));
            }
            edits.push((run.range.clone(), out));
        }
        if deleted_any {
            made.push(del_id);
        }
        if inserted {
            made.push(ins_id);
        }
    }
    let out = drop_empty_revisions(&xml::splice(src, edits)?)?;
    docx.set_part(DOCUMENT, out);
    Ok(EditResult { changes: made })
}

/// Retire les enveloppes de suivi vidées par une retouche (pas les marques
/// de paragraphe ou de ligne, vides par nature).
pub(crate) fn drop_empty_revisions(text: &str) -> Result<String> {
    let doc = xml::parse(text)?;
    let edits: Vec<_> = doc
        .descendants()
        .filter(|n| {
            (xml::is_w(*n, "ins") || xml::is_w(*n, "del"))
                && n.parent().is_some_and(|p| xml::is_w(p, "p") || xml::is_w(p, "hyperlink"))
                && !n.children().any(|c| c.is_element())
        })
        .map(|n| (n.range(), String::new()))
        .collect();
    if edits.is_empty() {
        return Ok(text.to_string());
    }
    xml::splice(text, edits)
}

impl From<std::fmt::Error> for DocxError {
    fn from(e: std::fmt::Error) -> Self {
        DocxError(e.to_string())
    }
}
