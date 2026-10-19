//! Accepter ou refuser un suivi de modifications.

use crate::model::change_kind;
use crate::walk::content_after_ppr;
use crate::xml::{self, W, id_of, inner_range, is_w, open_tag, w_attr, w_child};
use crate::{Docx, Result, err};
use roxmltree::Node;
use std::collections::BTreeSet;
use std::ops::Range;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Accept,
    Reject,
}

/// Bilan d'un « tout accepter / tout refuser ».
#[derive(Debug, Default, serde::Serialize)]
pub struct Batch {
    pub done: usize,
    /// Suivis laissés en place (cellules, sections…) : à traiter dans Word.
    pub skipped: Vec<u32>,
}

/// Accepte ou refuse le suivi `id` du corps du document.
pub fn decide(docx: &mut Docx, id: u32, decision: Decision) -> Result<()> {
    // La partie (corps, note, en-tête) qui porte ce suivi.
    let mut found = None;
    for part in docx.story_parts() {
        if let Some(src) = docx.part(&part)?
            && xml::parse(&src)?.descendants().any(|n| n.is_element() && id_of(n) == Some(id) && change_kind(n).is_some()) {
                found = Some((part, src));
                break;
            }
    }
    let Some((part, src)) = found else {
        return err(format!("suivi {id} introuvable (déjà traité ?)"));
    };
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let node = doc.descendants().find(|n| n.is_element() && id_of(*n) == Some(id) && change_kind(*n).is_some()).unwrap();
    let kind = change_kind(node);
    let edits = plan(&src, node, decision)?;
    let mut out = xml::splice(&src, edits)?;
    drop(doc);
    // Une mise en forme appliquée d'un geste couvre plusieurs runs sous le
    // même identifiant : on les traite tous.
    for _ in 0..10_000 {
        let doc = xml::parse(&out)?;
        // Même genre seulement : LibreOffice réutilise des identifiants.
        let Some(node) = doc.descendants().find(|n| n.is_element() && id_of(*n) == Some(id) && change_kind(*n) == kind) else { break };
        let next = xml::splice(&out, plan(&out, node, decision)?)?;
        drop(doc);
        out = next;
    }
    docx.set_part(&part, out);
    crate::story::drop_orphan_notes(docx)
}

/// Tous les suivis (d'un auteur, si précisé).
pub fn decide_all(docx: &mut Docx, decision: Decision, author: Option<&str>) -> Result<Batch> {
    let mut batch = Batch::default();
    let mut skipped: BTreeSet<u32> = BTreeSet::new();
    let mut done: BTreeSet<u32> = BTreeSet::new();
    for part in docx.story_parts() {
    loop {
        let Some(src) = docx.part(&part)? else { break };
        let doc = xml::parse(&src)?;
        let next = doc.descendants().find(|n| {
            n.is_element()
                && change_kind(*n).is_some()
                && !id_of(*n).is_some_and(|i| skipped.contains(&i))
                && author.is_none_or(|a| w_attr(*n, "author") == Some(a))
        });
        let Some(node) = next else { break };
        let id = id_of(node).unwrap_or(0);
        match plan(&src, node, decision).and_then(|e| xml::splice(&src, e)) {
            Ok(out) => {
                docx.set_part(&part, out);
                done.insert(id);
            }
            Err(_) => {
                skipped.insert(id);
            }
        }
        if done.len() + skipped.len() > 100_000 {
            break;
        }
    }
    }
    crate::story::drop_orphan_notes(docx)?;
    batch.done = done.len();
    batch.skipped = skipped.into_iter().collect();
    Ok(batch)
}

fn plan(src: &str, node: Node, decision: Decision) -> Result<Vec<(Range<usize>, String)>> {
    let kind = change_kind(node).unwrap_or_default();
    use Decision::*;
    Ok(match (kind.as_str(), decision) {
        ("ins" | "moveTo", Accept) | ("del" | "moveFrom", Reject) => vec![(node.range(), unwrap(src, node, decision == Reject))],
        ("ins" | "moveTo", Reject) | ("del" | "moveFrom", Accept) => vec![(node.range(), kept_markers(src, node))],
        ("paragraph-ins", Accept) | ("paragraph-del", Reject) => vec![(node.range(), String::new())],
        ("paragraph-ins", Reject) | ("paragraph-del", Accept) => merge_with_next(src, node)?,
        ("row-ins", Accept) | ("row-del", Reject) => vec![(node.range(), String::new())],
        ("row-ins", Reject) | ("row-del", Accept) => {
            let tr = node.parent().and_then(|p| p.parent()).filter(|n| is_w(*n, "tr"));
            match tr {
                Some(tr) => vec![(tr.range(), String::new())],
                None => return err("ligne de tableau introuvable"),
            }
        }
        ("format", Accept) => vec![(node.range(), String::new())],
        ("format", Reject) => reject_format(src, node)?,
        _ => return err("ce type de modification se traite dans Word (cellules de tableau)"),
    })
}

/// Contenu d'un suivi sans son enveloppe ; pour une suppression refusée,
/// le texte supprimé redevient du texte.
fn unwrap(src: &str, node: Node, restore_deleted: bool) -> String {
    let Some(r) = inner_range(node) else { return String::new() };
    let inner = &src[r];
    if restore_deleted {
        inner
            .replace("<w:delText", "<w:t")
            .replace("</w:delText>", "</w:t>")
            .replace("<w:delInstrText", "<w:instrText")
            .replace("</w:delInstrText>", "</w:instrText>")
    } else {
        inner.to_string()
    }
}

/// Ce qu'on garde d'un passage effacé : les bornes de commentaires et de
/// signets, et les appels de commentaire, pour ne rien laisser de bancal.
fn kept_markers(src: &str, node: Node) -> String {
    let mut out = String::new();
    let mut skip_until = 0;
    for d in node.descendants().filter(|n| n.is_element()) {
        if d.range().start < skip_until {
            continue;
        }
        if d.tag_name().namespace() != Some(W) {
            continue;
        }
        match d.tag_name().name() {
            "commentRangeStart" | "commentRangeEnd" | "bookmarkStart" | "bookmarkEnd" | "permStart" | "permEnd" | "moveFromRangeStart" | "moveFromRangeEnd" | "moveToRangeStart"
            | "moveToRangeEnd" => out.push_str(&src[d.range()]),
            "r" if w_child(d, "commentReference").is_some() => {
                let rpr = w_child(d, "rPr").map(|n| &src[n.range()]).unwrap_or("");
                let reference = &src[w_child(d, "commentReference").unwrap().range()];
                out.push_str(&format!("<w:r>{rpr}{reference}</w:r>"));
                skip_until = d.range().end;
            }
            _ => {}
        }
    }
    out
}

/// Supprime la marque de fin du paragraphe : son texte rejoint le suivant,
/// qui garde ses propriétés (c'est la marque qui porte la mise en forme).
fn merge_with_next(src: &str, marker: Node) -> Result<Vec<(Range<usize>, String)>> {
    let p = marker.ancestors().find(|n| is_w(*n, "p")).ok_or_else(|| crate::DocxError("paragraphe introuvable".into()))?;
    let next = p.next_siblings().skip(1).find(|n| n.is_element());
    let Some(next) = next.filter(|n| is_w(*n, "p")) else {
        // Dernier paragraphe d'une cellule ou suivi d'un tableau : Word garde
        // la marque ; on retire seulement le suivi.
        return Ok(vec![(marker.range(), String::new())]);
    };
    if w_child(p, "pPr").and_then(|ppr| w_child(ppr, "sectPr")).is_some() {
        return err("cette marque porte un saut de section : à traiter dans Word");
    }
    let mut out = open_tag(src, next);
    if let Some(ppr) = w_child(next, "pPr") {
        out.push_str(&src[ppr.range()]);
    }
    if let Some(r) = content_after_ppr(p) {
        out.push_str(&src[r]);
    }
    if let Some(r) = content_after_ppr(next) {
        out.push_str(&src[r]);
    }
    out.push_str("</w:p>");
    Ok(vec![(p.range().start..next.range().end, out)])
}

fn reject_format(src: &str, change: Node) -> Result<Vec<(Range<usize>, String)>> {
    let name = change.tag_name().name();
    let parent = change.parent().ok_or_else(|| crate::DocxError("mise en forme orpheline".into()))?;
    let old = change.children().find(|n| n.is_element());
    let old_inner = old.and_then(inner_range).map(|r| src[r].to_string()).unwrap_or_default();
    let Some(parent_inner) = inner_range(parent) else { return err("mise en forme vide") };
    let keep = |names: &[&str]| -> String {
        parent.children().filter(|n| n.is_element() && n.tag_name().namespace() == Some(W) && names.contains(&n.tag_name().name())).map(|n| &src[n.range()]).collect()
    };
    let new_inner = match name {
        "rPrChange" => format!("{}{old_inner}", keep(&["ins", "del", "moveFrom", "moveTo"])),
        "pPrChange" => format!("{old_inner}{}", keep(&["rPr", "sectPr"])),
        _ => return err("cette mise en forme se traite dans Word (tableau ou section)"),
    };
    Ok(vec![(parent_inner, new_inner)])
}
