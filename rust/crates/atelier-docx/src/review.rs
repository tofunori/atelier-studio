//! Accepter ou refuser un suivi de modifications.

use crate::model::change_kind;
use crate::walk::content_after_ppr;
use crate::xml::{self, W, id_of, inner_range, is_w, open_tag, w_attr, w_child};
use crate::{Docx, Result, err};
use roxmltree::Node;
use std::collections::{BTreeMap, BTreeSet};
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
    // Un suivi imbriqué traité (effacement d'un autre dans un ajout) peut
    // laisser l'ajout vide.
    let out = crate::edit::drop_empty_revisions(&out)?;
    docx.set_part(&part, out);
    crate::story::drop_orphan_notes(docx)
}

/// Tous les suivis (d'un auteur, si précisé).
///
/// En quelques passes sur le XML, pas une par suivi : chaque passe relit la
/// partie une fois et traite d'un coup tous les suivis dont les retouches
/// ne se chevauchent pas ; ceux qu'une autre retouche englobe (suivi
/// imbriqué, paragraphes fusionnés à la suite) attendent la passe suivante,
/// qui les voit dans le XML déjà retouché, comme un traitement un par un.
pub fn decide_all(docx: &mut Docx, decision: Decision, author: Option<&str>) -> Result<Batch> {
    decide_where(docx, decision, &|n: Node| author.is_none_or(|a| w_attr(n, "author") == Some(a)))
}

/// Les suivis `ids` d'un coup (« accepter les retouches mineures ») : même
/// traitement que [`decide`] pour chacun (tous les éléments qui portent cet
/// identifiant et le genre de son premier élément), en quelques passes.
/// Un identifiant introuvable est rendu dans `skipped`.
pub fn decide_set(docx: &mut Docx, ids: &[u32], decision: Decision) -> Result<Batch> {
    let wanted: BTreeSet<u32> = ids.iter().copied().collect();
    // Genre du premier élément de chaque suivi (LibreOffice réutilise des
    // identifiants d'un genre à l'autre).
    let mut kinds: BTreeMap<u32, String> = BTreeMap::new();
    for part in docx.story_parts() {
        let Some(src) = docx.part(&part)? else { continue };
        let doc = xml::parse(&src)?;
        for n in doc.descendants().filter(|n| n.is_element()) {
            if let (Some(id), Some(kind)) = (id_of(n), change_kind(n))
                && wanted.contains(&id)
            {
                kinds.entry(id).or_insert(kind);
            }
        }
    }
    let mut batch = decide_where(docx, decision, &|n: Node| id_of(n).is_some_and(|id| kinds.get(&id).is_some_and(|k| change_kind(n).as_ref() == Some(k))))?;
    batch.skipped.extend(wanted.iter().filter(|id| !kinds.contains_key(id)));
    batch.skipped.sort_unstable();
    batch.skipped.dedup();
    Ok(batch)
}

fn decide_where(docx: &mut Docx, decision: Decision, keep: &dyn Fn(Node) -> bool) -> Result<Batch> {
    let mut skipped: BTreeSet<u32> = BTreeSet::new();
    let mut done: BTreeSet<u32> = BTreeSet::new();
    for part in docx.story_parts() {
        let Some(mut src) = docx.part(&part)? else { continue };
        // Chaque passe traite au moins un suivi ; une longue suite de
        // paragraphes fusionnés se règle en log(n) passes.
        for _ in 0..10_000 {
            let doc = xml::parse(&src)?;
            let mut edits: Vec<(Range<usize>, String)> = Vec::new();
            let mut taken: Vec<Range<usize>> = Vec::new();
            let mut deferred = false;
            for node in doc.descendants() {
                if !node.is_element() || change_kind(node).is_none() || id_of(node).is_some_and(|i| skipped.contains(&i)) || !keep(node) {
                    continue;
                }
                let r = node.range();
                if overlaps(&taken, &r) {
                    deferred = true;
                    continue;
                }
                let id = id_of(node).unwrap_or(0);
                match plan(&src, node, decision) {
                    Ok(plan) => {
                        if plan.iter().any(|(pr, _)| overlaps(&taken, pr)) {
                            deferred = true;
                            continue;
                        }
                        for (pr, text) in plan {
                            insert_sorted(&mut taken, pr.clone());
                            edits.push((pr, text));
                        }
                        done.insert(id);
                    }
                    Err(_) => {
                        skipped.insert(id);
                    }
                }
            }
            drop(doc);
            if edits.is_empty() {
                break;
            }
            src = xml::splice(&src, edits)?;
            if !deferred {
                break;
            }
        }
        let out = crate::edit::drop_empty_revisions(&src)?;
        docx.set_part(&part, out);
    }
    crate::story::drop_orphan_notes(docx)?;
    Ok(Batch { done: done.len(), skipped: skipped.into_iter().collect() })
}

/// `r` chevauche-t-il l'une des plages (triées, disjointes) de `taken` ?
/// Deux plages qui se touchent ne se chevauchent pas.
fn overlaps(taken: &[Range<usize>], r: &Range<usize>) -> bool {
    let i = taken.partition_point(|t| t.end <= r.start);
    taken.get(i).is_some_and(|t| t.start < r.end)
}

fn insert_sorted(taken: &mut Vec<Range<usize>>, r: Range<usize>) {
    let i = taken.partition_point(|t| t.start < r.start);
    taken.insert(i, r);
}

/// Ancien traitement, un suivi après l'autre (une relecture du XML par
/// suivi) : gardé comme référence pour les tests de [`decide_all`].
#[doc(hidden)]
pub fn decide_all_one_by_one(docx: &mut Docx, decision: Decision, author: Option<&str>) -> Result<Batch> {
    let mut batch = Batch::default();
    let mut skipped: BTreeSet<u32> = BTreeSet::new();
    let mut done: BTreeSet<u32> = BTreeSet::new();
    for part in docx.story_parts() {
    while let Some(src) = docx.part(&part)? {
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
    if let Some(src) = docx.part(&part)? {
        let out = crate::edit::drop_empty_revisions(&src)?;
        docx.set_part(&part, out);
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
