//! Contrôle de validité à chaque écriture : ce qui ferait dire à Word que
//! le fichier est « illisible » ou le pousserait à le « réparer ».
//!
//! On compte les défauts du paquet (identifiants en double, bornes de
//! commentaire ou de signet orphelines, relations ou types de contenu
//! manquants, texte mal emboîté…) avant et après la retouche, et l'on
//! refuse toute retouche qui en AJOUTE : un fichier un peu irrégulier à
//! l'arrivée reste retouchable, mais Atelier ne l'abîme jamais davantage.

use crate::xml::{self, W, W14, W15, is_w};
use crate::{COMMENTS, COMMENTS_EXT, CONTENT_TYPES, Docx, DocxError, Result};
use roxmltree::Node;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Mutex;

const REL_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const W16CID: &str = "http://schemas.microsoft.com/office/word/2016/wordml/cid";

/// Défauts du paquet, par genre : nombre d'occurrences.
pub type Problems = BTreeMap<String, usize>;

/// Défauts de la dernière version contrôlée, par révision : le contrôle
/// d'avant une retouche est presque toujours celui d'après la précédente.
static CACHE: Mutex<Vec<(String, Problems)>> = Mutex::new(Vec::new());

fn cached(rev: &str) -> Option<Problems> {
    CACHE.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(r, _)| r == rev).map(|(_, p)| p.clone())
}

fn remember(rev: String, p: Problems) {
    let mut c = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    c.retain(|(r, _)| *r != rev);
    c.push((rev, p));
    if c.len() > 16 {
        c.remove(0);
    }
}

/// Refuse `after` s'il porte un défaut que `before` n'avait pas.
pub(crate) fn guard(before: &[u8], before_rev: &str, after: &mut Docx) -> Result<()> {
    let old = match cached(before_rev) {
        Some(p) => p,
        None => problems(&mut Docx::from_bytes(before.to_vec())?)?,
    };
    let new = problems(after)?;
    let added: Vec<String> = new.iter().filter(|(k, n)| **n > old.get(*k).copied().unwrap_or(0)).map(|(k, _)| k.clone()).collect();
    if !added.is_empty() {
        return Err(DocxError(format!(
            "retouche refusée, le fichier n'a pas été touché : elle aurait laissé un défaut que Word pourrait refuser ({})",
            added.join(" ; ")
        )));
    }
    remember(before_rev.to_string(), old);
    remember(after.revision_of_bytes()?, new);
    Ok(())
}

/// Tous les défauts du paquet.
pub fn problems(docx: &mut Docx) -> Result<Problems> {
    let mut p = Problems::new();
    let bump = |p: &mut Problems, k: &str| *p.entry(k.to_string()).or_default() += 1;

    // Un geste qui couvre plusieurs runs garde un seul identifiant (même
    // auteur, même date) ; deux retouches distinctes ne le partagent jamais.
    let mut rev_ids: HashMap<(String, u32), BTreeSet<(String, String)>> = HashMap::new();
    let mut para_ids: HashMap<String, usize> = HashMap::new();
    let mut c_start: BTreeSet<u32> = BTreeSet::new();
    let mut c_end: BTreeSet<u32> = BTreeSet::new();
    let mut c_ref: BTreeSet<u32> = BTreeSet::new();

    let mut parts = docx.story_parts();
    parts.push(COMMENTS.to_string());
    for part in &parts {
        let Some(src) = docx.part(part)? else { continue };
        let Ok(doc) = xml::parse(&src) else {
            bump(&mut p, &format!("XML illisible ({part})"));
            continue;
        };
        let story = part != COMMENTS;
        let mut b_start: BTreeSet<String> = BTreeSet::new();
        let mut b_end: BTreeSet<String> = BTreeSet::new();
        let rel_ids = rel_ids(docx, part)?;
        for n in doc.descendants().filter(|n| n.is_element()) {
            if let Some(pid) = n.attribute((W14, "paraId")) {
                *para_ids.entry(pid.to_string()).or_default() += 1;
                if u32::from_str_radix(pid, 16).map_or(true, |v| v >= 0x8000_0000) {
                    bump(&mut p, "identifiant de paragraphe hors limites");
                }
            }
            for a in n.attributes().filter(|a| a.namespace() == Some(REL_NS)) {
                if !rel_ids.contains(a.value()) {
                    bump(&mut p, &format!("relation {} manquante ({part})", a.value()));
                }
            }
            if n.tag_name().namespace() != Some(W) {
                continue;
            }
            let name = n.tag_name().name();
            match name {
                "t" if !n.parent().is_some_and(|r| is_w(r, "r")) => bump(&mut p, "texte hors d'un run"),
                // Un déplacement garde des w:t ; seule la suppression exige w:delText.
                "t" if inside(n, &["del"]) => bump(&mut p, "texte ordinaire dans une suppression"),
                "delText" if !inside(n, &["del", "moveFrom"]) => bump(&mut p, "texte effacé hors d'une suppression"),
                "r" if n.ancestors().skip(1).take_while(|a| !is_w(*a, "p")).any(|a| is_w(a, "r") && !has_txbx_between(n, a)) => {
                    bump(&mut p, "run dans un run")
                }
                "p" if n.ancestors().skip(1).any(|a| is_w(a, "p") && !has_txbx_between(n, a)) => bump(&mut p, "paragraphe dans un paragraphe"),
                "ins" | "del" | "moveFrom" | "moveTo" | "rPrChange" | "pPrChange" | "sectPrChange" | "tblPrChange" | "trPrChange" | "tcPrChange"
                | "numberingChange" | "cellIns" | "cellDel" => {
                    if let Some(id) = xml::id_of(n) {
                        let who = (xml::w_attr(n, "author").unwrap_or("").to_string(), xml::w_attr(n, "date").unwrap_or("").to_string());
                        rev_ids.entry((name.to_string(), id)).or_default().insert(who);
                    }
                }
                "commentRangeStart" if story => c_start.extend(xml::id_of(n)),
                "commentRangeEnd" if story => c_end.extend(xml::id_of(n)),
                "commentReference" if story => c_ref.extend(xml::id_of(n)),
                "bookmarkStart" => b_start.extend(xml::w_attr(n, "id").map(str::to_string)),
                "bookmarkEnd" => b_end.extend(xml::w_attr(n, "id").map(str::to_string)),
                _ => {}
            }
        }
        for _ in b_start.symmetric_difference(&b_end) {
            bump(&mut p, &format!("signet sans début ou sans fin ({part})"));
        }
    }
    for who in rev_ids.values().filter(|w| w.len() > 1) {
        *p.entry("identifiant de suivi en double".into()).or_default() += who.len() - 1;
    }
    for n in para_ids.values().filter(|n| **n > 1) {
        *p.entry("identifiant de paragraphe en double".into()).or_default() += n - 1;
    }

    // Commentaires : chaque ancrage a son texte, et l'inverse.
    let comment_ids: BTreeSet<u32> = match docx.part(COMMENTS)? {
        Some(src) => xml::parse(&src).map(|d| d.root_element().children().filter(|c| is_w(*c, "comment")).filter_map(xml::id_of).collect()).unwrap_or_default(),
        None => BTreeSet::new(),
    };
    for _ in c_start.symmetric_difference(&c_end) {
        bump(&mut p, "commentaire ouvert sans fin, ou fermé sans début");
    }
    for id in c_start.iter().chain(&c_ref) {
        if !comment_ids.contains(id) {
            bump(&mut p, "ancrage d'un commentaire qui n'existe pas");
        }
    }
    let comment_pids = comment_para_ids(docx)?;
    for (part, ns, el) in [(COMMENTS_EXT, W15, "commentEx"), ("word/commentsIds.xml", W16CID, "commentId")] {
        let Some(src) = docx.part(part)? else { continue };
        let Ok(doc) = xml::parse(&src) else {
            bump(&mut p, &format!("XML illisible ({part})"));
            continue;
        };
        for n in doc.descendants().filter(|n| n.tag_name().name() == el) {
            if n.attribute((ns, "paraId")).is_some_and(|pid| !comment_pids.contains(pid)) {
                bump(&mut p, &format!("entrée de {part} sans commentaire"));
            }
        }
    }

    // Paquet : chaque partie a un type de contenu.
    if let Some(ct) = docx.part(CONTENT_TYPES)? {
        let doc = xml::parse(&ct)?;
        let defaults: BTreeSet<String> = doc.descendants().filter(|n| n.tag_name().name() == "Default").filter_map(|n| n.attribute("Extension")).map(str::to_ascii_lowercase).collect();
        let overrides: BTreeSet<String> = doc.descendants().filter(|n| n.tag_name().name() == "Override").filter_map(|n| n.attribute("PartName")).map(str::to_ascii_lowercase).collect();
        for name in docx.entry_names() {
            if name.ends_with('/') || name == CONTENT_TYPES {
                continue;
            }
            let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default();
            if !defaults.contains(&ext) && !overrides.contains(&format!("/{}", name.to_ascii_lowercase())) {
                bump(&mut p, &format!("type de contenu manquant pour {name}"));
            }
        }
    }
    Ok(p)
}

/// Dans l'un de ces suivis, avant la fin du paragraphe.
fn inside(n: Node, kinds: &[&str]) -> bool {
    n.ancestors().skip(1).take_while(|a| !is_w(*a, "p")).any(|a| kinds.iter().any(|k| is_w(a, k)))
}

/// Une zone de texte (dessin) sépare-t-elle `inner` de son ancêtre `outer` ?
fn has_txbx_between(inner: Node, outer: Node) -> bool {
    inner.ancestors().skip(1).take_while(|a| *a != outer).any(|a| a.tag_name().name() == "txbxContent")
}

fn rel_ids(docx: &mut Docx, part: &str) -> Result<BTreeSet<String>> {
    let Some(rels) = docx.part(&crate::rels_of(part))? else { return Ok(BTreeSet::new()) };
    let Ok(doc) = xml::parse(&rels) else { return Ok(BTreeSet::new()) };
    Ok(doc.descendants().filter(|n| n.tag_name().name() == "Relationship").filter_map(|n| n.attribute("Id")).map(str::to_string).collect())
}

fn comment_para_ids(docx: &mut Docx) -> Result<BTreeSet<String>> {
    let Some(src) = docx.part(COMMENTS)? else { return Ok(BTreeSet::new()) };
    let Ok(doc) = xml::parse(&src) else { return Ok(BTreeSet::new()) };
    Ok(doc.descendants().filter(|n| is_w(*n, "p")).filter_map(|n| n.attribute((W14, "paraId"))).map(str::to_string).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_run_dans_une_zone_de_texte_n_est_pas_un_defaut() {
        let xml = r#"<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p></w:body></w:document>"#;
        let doc = xml::parse(xml).unwrap();
        let inner = doc.descendants().filter(|n| is_w(*n, "r")).nth(1).unwrap();
        let outer = doc.descendants().find(|n| is_w(*n, "r")).unwrap();
        assert!(has_txbx_between(inner, outer));
    }
}
