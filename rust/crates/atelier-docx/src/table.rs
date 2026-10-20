//! Lignes et colonnes de tableau.
//!
//! Une ligne s'ajoute ou se supprime en suivi comme dans Word (marque
//! `w:ins`/`w:del` dans `w:trPr`, contenu barré). Les colonnes changent
//! directement : Word ne les suit pas de façon fiable d'une version à l'autre.

use crate::story::parse_ref;
use crate::xml::{self, W14, escape_attr, is_w, w_attr, w_child};
use crate::{Docx, Result, Signature, err, walk};
use roxmltree::{Document, Node};
use std::ops::Range;

/// Le paragraphe `paragraph`, s'il est dans une cellule : sa cellule, sa
/// ligne et son tableau (le plus proche).
fn cell_of<'a, 'i>(doc: &'a Document<'i>, paragraph: &str) -> Result<(Node<'a, 'i>, Node<'a, 'i>, Node<'a, 'i>)> {
    let story = parse_ref(paragraph)?;
    let paras = walk::paragraphs_in(doc, &story.scope);
    let local = story.local.as_str();
    let index = match local.strip_prefix('p').and_then(|n| n.parse::<usize>().ok()) {
        Some(i) => Some(i),
        None => paras.iter().position(|p| p.node.attribute((W14, "paraId")) == Some(local)),
    };
    let Some(p) = index.and_then(|i| paras.get(i)) else {
        return err(format!("paragraphe {paragraph} introuvable"));
    };
    let tc = p.node.ancestors().find(|n| is_w(*n, "tc"));
    let tr = tc.and_then(|c| c.ancestors().find(|n| is_w(*n, "tr")));
    let tbl = tr.and_then(|r| r.ancestors().find(|n| is_w(*n, "tbl")));
    match (tc, tr, tbl) {
        (Some(c), Some(r), Some(t)) => Ok((c, r, t)),
        _ => err(format!("le paragraphe {paragraph} n'est pas dans un tableau")),
    }
}

fn cells<'a, 'i>(tr: Node<'a, 'i>) -> Vec<Node<'a, 'i>> {
    tr.children().filter(|n| is_w(*n, "tc")).collect()
}

/// Cellules fusionnées ou imbriquées : la grille n'est plus régulière.
fn irregular(tbl: Node) -> bool {
    tbl.children().filter(|n| is_w(*n, "tr")).any(|tr| {
        tr.children().any(|c| !is_w(c, "tc") && c.is_element() && !is_w(c, "trPr") && !is_w(c, "tblPrEx"))
            || cells(tr).iter().any(|tc| w_child(*tc, "tcPr").is_some_and(|p| w_child(p, "gridSpan").is_some() || w_child(p, "vMerge").is_some() || w_child(p, "hMerge").is_some()))
    })
}

/// Un paragraphe vide qui garde le style et l'alignement du premier de la cellule.
fn empty_para(src: &str, tc: Node) -> String {
    let first = tc.children().find(|n| is_w(*n, "p"));
    let ppr = first.and_then(|p| w_child(p, "pPr"));
    let keep: String = ppr
        .map(|ppr| ppr.children().filter(|c| is_w(*c, "pStyle") || is_w(*c, "jc")).map(|c| &src[c.range()]).collect())
        .unwrap_or_default();
    if keep.is_empty() { "<w:p/>".into() } else { format!("<w:p><w:pPr>{keep}</w:pPr></w:p>") }
}

/// Propriétés de cellule sans fusion verticale (une cellule neuve est seule).
fn tcpr_of(src: &str, tc: Node) -> String {
    let Some(p) = w_child(tc, "tcPr") else { return String::new() };
    let inner: String = p.children().filter(|c| c.is_element() && !is_w(*c, "vMerge") && !is_w(*c, "cellIns") && !is_w(*c, "cellDel")).map(|c| &src[c.range()]).collect();
    format!("<w:tcPr>{inner}</w:tcPr>")
}

fn rev_attrs(id: u32, sig: &Signature) -> String {
    format!(r#"w:id="{id}" w:author="{}" w:date="{}""#, escape_attr(&sig.author), escape_attr(&sig.date))
}

/// Ligne vide au-dessus ou en dessous de celle du paragraphe.
pub fn insert_row(docx: &mut Docx, paragraph: &str, above: bool, tracked: bool, sig: &Signature) -> Result<()> {
    let (story, src) = docx.story_src(paragraph)?;
    let id = crate::edit::next_ids(docx, 1)?[0];
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let (_, tr, _) = cell_of(&doc, paragraph)?;
    let mut trpr = String::new();
    if let Some(p) = w_child(tr, "trPr") {
        trpr = p.children().filter(|c| c.is_element() && !is_w(*c, "ins") && !is_w(*c, "del")).map(|c| &src[c.range()]).collect();
    }
    if tracked {
        trpr.push_str(&format!("<w:ins {}/>", rev_attrs(id, sig)));
    }
    let mut row = String::from("<w:tr>");
    if !trpr.is_empty() {
        row.push_str(&format!("<w:trPr>{trpr}</w:trPr>"));
    }
    for tc in cells(tr) {
        row.push_str(&format!("<w:tc>{}{}</w:tc>", tcpr_of(&src, tc), empty_para(&src, tc)));
    }
    row.push_str("</w:tr>");
    let at = if above { tr.range().start } else { tr.range().end };
    let out = xml::splice(&src, vec![(at..at, row)])?;
    drop(doc);
    docx.set_part(&story.part, out);
    Ok(())
}

/// Supprime la ligne du paragraphe. En suivi : marquée supprimée, son texte
/// barré ; une ligne que l'auteur avait lui-même ajoutée part sans trace.
pub fn delete_row(docx: &mut Docx, paragraph: &str, tracked: bool, sig: &Signature) -> Result<()> {
    let (story, src) = docx.story_src(paragraph)?;
    // Une marque pour la ligne, une par run barré (comme Word).
    let ids = crate::edit::next_ids(docx, 1 + src.matches("<w:r").count() as u32)?;
    let id = ids[0];
    let mut text_ids = ids[1..].iter();
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let (_, tr, tbl) = cell_of(&doc, paragraph)?;
    let trpr = w_child(tr, "trPr");
    let row_ins = trpr.and_then(|p| w_child(p, "ins"));
    if trpr.and_then(|p| w_child(p, "del")).is_some() {
        return err("cette ligne est déjà supprimée en suivi : accepter ou refuser la suppression");
    }
    let own = row_ins.is_some_and(|i| w_attr(i, "author") == Some(sig.author.as_str()));
    if let Some(i) = row_ins.filter(|_| !own) {
        return err(format!("ligne ajoutée en suivi par {} : refuser cet ajout plutôt que la supprimer", w_attr(i, "author").unwrap_or("un autre auteur")));
    }
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    if !tracked || own {
        let rows = tbl.children().filter(|n| is_w(*n, "tr")).count();
        // La dernière ligne emporte le tableau, avec un paragraphe à sa place
        // si rien ne le suit dans la cellule ou le corps.
        if rows == 1 {
            let needs_p = tbl.next_sibling_element().is_none_or(|n| !is_w(n, "p"));
            edits.push((tbl.range(), if needs_p { "<w:p/>".into() } else { String::new() }));
        } else {
            edits.push((tr.range(), String::new()));
        }
    } else {
        let mark = format!("<w:del {}/>", rev_attrs(id, sig));
        match trpr {
            Some(p) => {
                let end = xml::inner_range(p).map_or(p.range().end, |r| r.end);
                if xml::inner_range(p).is_some() {
                    edits.push((end..end, mark));
                } else {
                    edits.push((p.range(), format!("<w:trPr>{mark}</w:trPr>")));
                }
            }
            None => {
                let after = tr.children().find(|n| is_w(*n, "tblPrEx")).map_or_else(|| xml::inner_range(tr).map_or(tr.range().end, |r| r.start), |n| n.range().end);
                edits.push((after..after, format!("<w:trPr>{mark}</w:trPr>")));
            }
        }
        // Le texte de la ligne, barré : runs hors suivi seulement.
        for r in tr.descendants().filter(|n| is_w(*n, "r")) {
            let parent = r.parent().unwrap();
            if !(is_w(parent, "p") || is_w(parent, "hyperlink") || is_w(parent, "smartTag")) {
                continue;
            }
            let raw = &src[r.range()];
            let inner = raw
                .replace("<w:t>", "<w:delText>")
                .replace("<w:t ", "<w:delText ")
                .replace("</w:t>", "</w:delText>")
                .replace("<w:instrText", "<w:delInstrText")
                .replace("</w:instrText>", "</w:delInstrText>");
            edits.push((r.range(), format!("<w:del {}>{inner}</w:del>", rev_attrs(*text_ids.next().unwrap_or(&id), sig))));
        }
    }
    let out = xml::splice(&src, edits)?;
    drop(doc);
    docx.set_part(&story.part, out);
    if !tracked || own {
        crate::story::drop_orphan_notes(docx)?;
    }
    Ok(())
}

/// Index de la cellule `tc` dans sa ligne.
fn col_index(tr: Node, tc: Node) -> usize {
    cells(tr).iter().position(|c| *c == tc).unwrap_or(0)
}

/// Largeur de cellule en twips (`w:tcW` de type dxa).
fn tcw<'a, 'i>(n: Node<'a, 'i>) -> Option<Node<'a, 'i>> {
    w_child(n, "tcPr").and_then(|p| w_child(p, "tcW")).filter(|t| w_attr(*t, "type").is_none_or(|v| v == "dxa"))
}

fn width_of(n: Node) -> Option<u64> {
    w_attr(n, "w").and_then(|v| v.parse().ok())
}

/// Colonne vide à gauche ou à droite de celle du paragraphe ; elle prend la
/// moitié de la largeur de sa voisine (le tableau garde sa largeur).
pub fn insert_column(docx: &mut Docx, paragraph: &str, left: bool) -> Result<()> {
    let (story, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let (tc, tr, tbl) = cell_of(&doc, paragraph)?;
    if irregular(tbl) {
        return err("tableau à cellules fusionnées : ajouter la colonne dans Word");
    }
    let c = col_index(tr, tc);
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    let half = |w: u64| (w / 2).max(1);
    if let Some(grid) = w_child(tbl, "tblGrid") {
        let cols: Vec<Node> = grid.children().filter(|n| is_w(*n, "gridCol")).collect();
        if let Some(col) = cols.get(c) {
            let w = width_of(*col).map(half);
            let tag = w.map_or("<w:gridCol/>".to_string(), |w| format!(r#"<w:gridCol w:w="{w}"/>"#));
            edits.push((col.range(), format!("{tag}{tag}")));
        }
    }
    for row in tbl.children().filter(|n| is_w(*n, "tr")) {
        let Some(cell) = cells(row).get(c).copied() else { continue };
        // Cellule d'origine et nouvelle à moitié de largeur chacune.
        let tcw = w_child(cell, "tcPr").and_then(|p| w_child(p, "tcW"));
        let w = tcw.and_then(width_of).filter(|_| tcw.and_then(|n| w_attr(n, "type")).is_none_or(|t| t == "dxa"));
        let mut tcpr = tcpr_of(&src, cell);
        let mut old = src[cell.range()].to_string();
        if let (Some(n), Some(w)) = (tcw, w) {
            let new_tcw = format!(r#"<w:tcW w:w="{}" w:type="dxa"/>"#, half(w));
            tcpr = tcpr.replacen(&src[n.range()], &new_tcw, 1);
            old = old.replacen(&src[n.range()], &new_tcw, 1);
        }
        let new = format!("<w:tc>{tcpr}{}</w:tc>", empty_para(&src, cell));
        edits.push((cell.range(), if left { format!("{new}{old}") } else { format!("{old}{new}") }));
    }
    let out = xml::splice(&src, edits)?;
    drop(doc);
    docx.set_part(&story.part, out);
    Ok(())
}

/// Supprime la colonne du paragraphe ; sa largeur va à la voisine.
pub fn delete_column(docx: &mut Docx, paragraph: &str) -> Result<()> {
    let (story, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let (tc, tr, tbl) = cell_of(&doc, paragraph)?;
    if irregular(tbl) {
        return err("tableau à cellules fusionnées : supprimer la colonne dans Word");
    }
    let c = col_index(tr, tc);
    if cells(tr).len() <= 1 {
        return err("dernière colonne : supprimer le tableau ligne par ligne");
    }
    let has_revs = tbl.children().filter(|n| is_w(*n, "tr")).filter_map(|r| cells(r).get(c).copied()).any(|cell| cell.descendants().any(|n| walk::RevKind::of(n).is_some()));
    if has_revs {
        return err("cette colonne porte des modifications en suivi : les accepter ou les refuser d'abord");
    }
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    if let Some(grid) = w_child(tbl, "tblGrid") {
        let cols: Vec<Node> = grid.children().filter(|n| is_w(*n, "gridCol")).collect();
        if let Some(col) = cols.get(c) {
            edits.push((col.range(), String::new()));
            let k = if c > 0 { c - 1 } else { c + 1 };
            if let (Some(nb), Some(w), Some(wn)) = (cols.get(k), width_of(*col), cols.get(k).and_then(|n| width_of(*n))) {
                edits.push((nb.range(), format!(r#"<w:gridCol w:w="{}"/>"#, w + wn)));
            }
        }
    }
    let k = if c > 0 { c - 1 } else { c + 1 };
    for row in tbl.children().filter(|n| is_w(*n, "tr")) {
        let cs = cells(row);
        let Some(cell) = cs.get(c) else { continue };
        edits.push((cell.range(), String::new()));
        // La voisine reprend la largeur de la cellule supprimée.
        if let (Some(nb), Some(a), Some(b)) = (cs.get(k).and_then(|n| tcw(*n)), tcw(*cell).and_then(width_of), cs.get(k).and_then(|n| tcw(*n)).and_then(width_of)) {
            edits.push((nb.range(), format!(r#"<w:tcW w:w="{}" w:type="dxa"/>"#, a + b)));
        }
    }
    let out = xml::splice(&src, edits)?;
    drop(doc);
    docx.set_part(&story.part, out);
    crate::story::drop_orphan_notes(docx)?;
    Ok(())
}
