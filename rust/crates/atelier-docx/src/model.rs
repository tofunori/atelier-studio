//! Vue du document pour l'interface et pour l'agent.

use crate::story::{ENDNOTES, FOOTNOTES, Scope};
use crate::walk::{self, Fmt, Kind};
use crate::xml::{self, R, W, W14, W15, id_of, is_w, w_attr, w_child};
use crate::{COMMENTS, COMMENTS_EXT, Docx, Result};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

#[derive(Serialize, Debug)]
pub struct DocModel {
    pub revision: String,
    pub paragraphs: Vec<Para>,
    /// Notes de bas de page et de fin, dans l'ordre de leurs appels.
    pub notes: Vec<Note>,
    /// En-têtes et pieds de page.
    pub headers: Vec<HeaderFooter>,
    pub changes: Vec<Change>,
    pub comments: Vec<Comment>,
    pub authors: Vec<Author>,
    /// Parties à suivis que le panneau ne montre pas : à traiter dans Word.
    pub other_parts: Vec<OtherPart>,
}

#[derive(Serialize, Debug)]
pub struct Note {
    /// `n3` (note de bas de page `w:id="3"`) ou `e3` (note de fin) : ses
    /// paragraphes sont `n3.p0`, `n3.p1`…
    pub id: String,
    /// footnote, endnote
    pub kind: &'static str,
    /// Numéro affiché (ordre des appels), absent pour une note sans appel.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number: Option<usize>,
    pub paragraphs: Vec<Para>,
}

#[derive(Serialize, Debug)]
pub struct HeaderFooter {
    /// `header1`, `footer2`… : ses paragraphes sont `header1.p0`…
    pub id: String,
    /// header, footer
    pub kind: &'static str,
    /// default, first (première page), even (pages paires)
    pub which: String,
    pub paragraphs: Vec<Para>,
}

#[derive(Serialize, Debug)]
pub struct Para {
    /// `p<indice>` dans l'ordre de lecture.
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub para_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,
    /// 0 = titre du document, 1-9 = niveau de titre.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<u8>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub list: bool,
    /// left, center, right, both (justifié)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub align: Option<String>,
    /// [tableau, ligne, cellule]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cell: Option<[u32; 3]>,
    /// Suivi sur la marque de paragraphe (paragraphe inséré ou fusionné).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mark_change: Option<u32>,
    /// Texte courant : suivis d'insertion compris, suppressions exclues.
    pub text: String,
    pub segments: Vec<Segment>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Segment {
    pub text: String,
    /// text, tab, break, field, object
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change: Option<u32>,
    /// ins, del, moveTo, moveFrom
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rev: Option<&'static str>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub editable: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub b: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub i: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub u: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub strike: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub sup: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub sub: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// Taille en points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub comments: Vec<u32>,
    /// Appel de note : numéro affiché.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number: Option<usize>,
    /// Objet ou champ supprimable d'un bloc (figure, note, citation, équation).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub whole: bool,
    /// Image : relation (`/docx/media?rel=`), taille affichée en pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    /// Équation en LaTeX (affichée avec KaTeX, corrigée comme un .tex).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latex: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct Change {
    pub id: u32,
    /// ins, del, moveTo, moveFrom, paragraph-ins, paragraph-del, row-ins,
    /// row-del, format, cell
    pub kind: String,
    pub author: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub date: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paragraph: Option<String>,
    pub text: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct Comment {
    pub id: u32,
    pub author: String,
    pub initials: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub date: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<u32>,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paragraph: Option<String>,
    /// Passage commenté (texte courant).
    pub quote: String,
}

#[derive(Serialize, Debug)]
pub struct Author {
    pub name: String,
    pub changes: usize,
    pub comments: usize,
}

#[derive(Serialize, Debug)]
pub struct OtherPart {
    pub part: String,
    pub changes: usize,
}

impl DocModel {
    /// Tous les paragraphes : corps, puis notes, puis en-têtes et pieds.
    pub fn all_paragraphs(&self) -> impl Iterator<Item = &Para> {
        self.paragraphs.iter().chain(self.notes.iter().flat_map(|n| &n.paragraphs)).chain(self.headers.iter().flat_map(|h| &h.paragraphs))
    }
}

pub(crate) fn change_kind(node: roxmltree::Node) -> Option<String> {
    if node.tag_name().namespace() != Some(W) {
        return None;
    }
    let name = node.tag_name().name();
    let parent = node.parent()?;
    let parent_name = if parent.tag_name().namespace() == Some(W) { parent.tag_name().name() } else { "" };
    match name {
        "ins" | "del" | "moveFrom" | "moveTo" => Some(match parent_name {
            "rPr" if parent.parent().is_some_and(|g| is_w(g, "pPr")) => {
                if name == "ins" || name == "moveTo" { "paragraph-ins".into() } else { "paragraph-del".into() }
            }
            "rPr" => return None, // propriété de run hors marque : rare, ignorée
            "trPr" => if name == "ins" { "row-ins".into() } else { "row-del".into() },
            _ => name.to_string(),
        }),
        "rPrChange" | "pPrChange" | "sectPrChange" | "tblPrChange" | "trPrChange" | "tcPrChange" | "tblGridChange" | "tblPrExChange" | "numberingChange" => {
            Some("format".into())
        }
        "cellIns" | "cellDel" | "cellMerge" => Some("cell".into()),
        _ => None,
    }
}

pub(crate) fn heading_levels(styles_xml: Option<&str>) -> HashMap<String, u8> {
    let mut out = HashMap::new();
    let Some(text) = styles_xml else { return out };
    let Ok(doc) = xml::parse(text) else { return out };
    for st in doc.root_element().children().filter(|n| is_w(*n, "style")) {
        let Some(id) = w_attr(st, "styleId") else { continue };
        let name = w_child(st, "name").and_then(|n| w_attr(n, "val")).unwrap_or("").to_lowercase();
        let lvl = if name == "title" {
            Some(0)
        } else if let Some(n) = name.strip_prefix("heading ") {
            n.trim().parse::<u8>().ok()
        } else {
            w_child(st, "pPr").and_then(|p| w_child(p, "outlineLvl")).and_then(|o| w_attr(o, "val")).and_then(|v| v.parse::<u8>().ok()).filter(|v| *v < 9).map(|v| v + 1)
        };
        if let Some(l) = lvl {
            out.insert(id.to_string(), l);
        }
    }
    out
}

fn seg_of(p: &walk::Piece) -> Segment {
    let (kind, label) = match &p.kind {
        Kind::Text => ("text", None),
        Kind::Tab => ("tab", None),
        Kind::Break => ("break", None),
        Kind::Field(k) => ("field", Some(k.clone())),
        Kind::Object(k) => ("object", Some(k.clone())),
    };
    let Fmt { b, i, u, strike, sup, sub, font, size } = p.fmt.clone();
    Segment {
        text: p.text.clone(),
        kind,
        label,
        change: p.rev.map(|r| r.1),
        rev: p.rev.map(|r| r.0.name()),
        editable: p.run.is_some(),
        b,
        i,
        u,
        strike,
        sup,
        sub,
        font,
        size: size.map(|s| s as f32 / 2.0),
        comments: p.comments.clone(),
        number: None,
        whole: p.unit.is_some(),
        media: p.media.as_ref().map(|m| m.rel.clone()),
        width: p.media.as_ref().filter(|m| m.cx > 0).map(|m| (m.cx / 9525) as u32),
        height: p.media.as_ref().filter(|m| m.cy > 0).map(|m| (m.cy / 9525) as u32),
        alt: p.media.as_ref().map(|m| m.descr.clone()).filter(|d| !d.is_empty()),
        latex: p.math.clone(),
    }
}

/// Ce que les histoires partagent pendant la lecture : suivis (numérotés
/// une seule fois), passages commentés et ancrages.
#[derive(Default)]
struct Acc {
    changes: Vec<Change>,
    by_id: HashMap<u32, usize>,
    quotes: BTreeMap<u32, String>,
    anchors: HashMap<u32, String>,
}

/// Paragraphes d'une histoire (corps, note, en-tête), suivis compris.
fn story_paragraphs(src: &str, scope: &Scope, prefix: &str, levels: &HashMap<String, u8>, acc: &mut Acc) -> Result<Vec<Para>> {
    let doc = xml::parse(src)?;
    let Some(root) = crate::story::container(&doc, scope) else { return Ok(Vec::new()) };
    // Le corps compte aussi les suivis de sections (sectPr hors de body).
    let scan = if *scope == Scope::Body { doc.root_element() } else { root };
    for node in scan.descendants().filter(|n| n.is_element()) {
        if let Some(kind) = change_kind(node) {
            let id = id_of(node).unwrap_or(0);
            if acc.by_id.contains_key(&id) {
                continue;
            }
            acc.by_id.insert(id, acc.changes.len());
            let text = match kind.as_str() {
                "paragraph-ins" | "paragraph-del" => "¶".into(),
                "row-ins" | "row-del" => "ligne de tableau".into(),
                "format" => "mise en forme".into(),
                "cell" => "cellule".into(),
                _ => String::new(),
            };
            acc.changes.push(Change {
                id,
                kind,
                author: w_attr(node, "author").unwrap_or("").to_string(),
                date: w_attr(node, "date").unwrap_or("").to_string(),
                paragraph: None,
                text,
            });
        }
    }

    let para_nodes = walk::paragraphs_in(&doc, scope);
    let para_index: HashMap<roxmltree::NodeId, usize> = para_nodes.iter().enumerate().map(|(i, p)| (p.node.id(), i)).collect();
    // Mises en forme : rattachées à leur paragraphe, avec le texte touché.
    for node in root.descendants().filter(|n| is_w(*n, "rPrChange") || is_w(*n, "pPrChange")) {
        let Some(&i) = id_of(node).and_then(|id| acc.by_id.get(&id)) else { continue };
        // LibreOffice réutilise parfois un identifiant d'un suivi à l'autre.
        if acc.changes[i].kind != "format" {
            continue;
        }
        if let Some(pi) = node.ancestors().find_map(|a| para_index.get(&a.id())) {
            acc.changes[i].paragraph.get_or_insert_with(|| format!("{prefix}p{pi}"));
        }
        if is_w(node, "rPrChange")
            && let Some(run) = node.parent().and_then(|r| r.parent()).filter(|r| is_w(*r, "r")) {
                let t: String = run.children().filter(|c| is_w(*c, "t")).filter_map(|c| c.text()).collect();
                if !t.is_empty() {
                    if acc.changes[i].text == "mise en forme" {
                        acc.changes[i].text.clear();
                    }
                    acc.changes[i].text.push_str(&t);
                }
            }
    }

    let mut paragraphs = Vec::new();
    let mut state = walk::State::default();
    for (index, pref) in para_nodes.into_iter().enumerate() {
        let p = pref.node;
        let id = format!("{prefix}p{index}");
        let inline = walk::inline(src, p, &mut state);
        let ppr = w_child(p, "pPr");
        let style = ppr.and_then(|n| w_child(n, "pStyle")).and_then(|n| w_attr(n, "val")).map(str::to_string);
        let heading = style.as_ref().and_then(|s| levels.get(s).copied()).or_else(|| {
            ppr.and_then(|n| w_child(n, "outlineLvl")).and_then(|o| w_attr(o, "val")).and_then(|v| v.parse::<u8>().ok()).filter(|v| *v < 9).map(|v| v + 1)
        });
        let mark_change = walk::mark_rev(p).map(|(_, rid, _)| rid);
        if let Some(rid) = mark_change
            && let Some(&i) = acc.by_id.get(&rid) {
                acc.changes[i].paragraph.get_or_insert_with(|| id.clone());
            }
        let mut text = String::new();
        let mut segments: Vec<Segment> = Vec::new();
        for piece in &inline.pieces {
            if let Some((_, rid)) = piece.rev
                && let Some(&i) = acc.by_id.get(&rid) {
                    acc.changes[i].text.push_str(&piece.text);
                    acc.changes[i].paragraph.get_or_insert_with(|| id.clone());
                }
            let removed = piece.rev.is_some_and(|(k, _)| k.removes());
            if !removed {
                text.push_str(&piece.text);
                for c in &piece.comments {
                    acc.quotes.entry(*c).or_default().push_str(&piece.text);
                }
            }
            let seg = seg_of(piece);
            match segments.last_mut() {
                Some(last) if last.kind == "text" && seg.kind == "text" && Segment { text: String::new(), ..last.clone() } == Segment { text: String::new(), ..seg.clone() } => {
                    last.text.push_str(&seg.text)
                }
                _ => segments.push(seg),
            }
        }
        for c in inline.comment_starts.iter().chain(&inline.comment_refs) {
            acc.anchors.entry(*c).or_insert_with(|| id.clone());
        }
        paragraphs.push(Para {
            id,
            para_id: p.attribute((W14, "paraId")).map(str::to_string),
            style,
            heading,
            list: ppr.and_then(|n| w_child(n, "numPr")).is_some(),
            align: ppr.and_then(|n| w_child(n, "jc")).and_then(|n| w_attr(n, "val")).map(|v| match v {
                "start" => "left".to_string(),
                "end" => "right".to_string(),
                "distribute" => "both".to_string(),
                v => v.to_string(),
            }),
            cell: pref.cell.map(|(t, r, c)| [t, r, c]),
            mark_change,
            text,
            segments,
        });
    }
    Ok(paragraphs)
}

pub fn build(docx: &mut Docx) -> Result<DocModel> {
    let styles = docx.part("word/styles.xml")?;
    let levels = heading_levels(styles.as_deref());
    let comments_xml = docx.part(COMMENTS)?;
    let ext_xml = docx.part(COMMENTS_EXT)?;
    let src = docx.document_xml().to_string();
    let mut acc = Acc::default();
    let mut paragraphs = story_paragraphs(&src, &Scope::Body, "", &levels, &mut acc)?;

    // Notes, numérotées dans l'ordre de leurs appels dans le corps.
    let mut notes = Vec::new();
    for (part, tag, label, letter) in [(FOOTNOTES, "footnote", "note", 'n'), (ENDNOTES, "endnote", "note de fin", 'e')] {
        let Some(nsrc) = docx.part(part)? else { continue };
        let ndoc = xml::parse(&nsrc)?;
        let mut order: Vec<i64> = Vec::new();
        for p in paragraphs.iter_mut() {
            for s in p.segments.iter_mut().filter(|s| s.kind == "object" && s.label.as_deref() == Some(label)) {
                if let Ok(id) = s.text.trim().parse::<i64>() {
                    if !order.contains(&id) {
                        order.push(id);
                    }
                    s.number = order.iter().position(|x| *x == id).map(|i| i + 1);
                }
            }
        }
        let mut ids: Vec<i64> = ndoc
            .root_element()
            .children()
            .filter(|n| is_w(*n, tag) && crate::story::is_real_note(*n))
            .filter_map(|n| w_attr(n, "id").and_then(|v| v.trim().parse::<i64>().ok()))
            .collect();
        ids.sort_by_key(|id| order.iter().position(|x| x == id).unwrap_or(usize::MAX));
        drop(ndoc);
        for id in ids {
            let prefix = format!("{letter}{id}.");
            let paras = story_paragraphs(&nsrc, &Scope::Note(tag, id), &prefix, &levels, &mut acc)?;
            let number = order.iter().position(|x| *x == id).map(|i| i + 1);
            notes.push(Note { id: format!("{letter}{id}"), kind: tag, number, paragraphs: paras });
        }
    }

    // En-têtes et pieds de page, dans l'ordre où les sections y renvoient.
    let mut headers = Vec::new();
    let rels = docx.part("word/_rels/document.xml.rels")?.unwrap_or_default();
    let targets: HashMap<String, String> = xml::parse(&rels)
        .map(|d| {
            d.root_element()
                .children()
                .filter(|n| n.is_element())
                .filter_map(|n| Some((n.attribute("Id")?.to_string(), n.attribute("Target")?.trim_start_matches('/').trim_start_matches("word/").to_string())))
                .collect()
        })
        .unwrap_or_default();
    let mut seen: Vec<(String, &'static str, String)> = Vec::new();
    {
        let doc = xml::parse(&src)?;
        for r in doc.descendants().filter(|n| is_w(*n, "headerReference") || is_w(*n, "footerReference")) {
            let Some(target) = r.attribute((R, "id")).and_then(|id| targets.get(id)) else { continue };
            let Some(name) = target.strip_suffix(".xml").filter(|n| !n.contains('/')) else { continue };
            if seen.iter().any(|(n, _, _)| n == name) {
                continue;
            }
            let kind = if is_w(r, "headerReference") { "header" } else { "footer" };
            seen.push((name.to_string(), kind, w_attr(r, "type").unwrap_or("default").to_string()));
        }
    }
    for (name, kind, which) in seen {
        let part = format!("word/{name}.xml");
        let Some(hsrc) = docx.part(&part)? else { continue };
        let paras = story_paragraphs(&hsrc, &Scope::Root, &format!("{name}."), &levels, &mut acc)?;
        headers.push(HeaderFooter { id: name, kind, which, paragraphs: paras });
    }

    let Acc { changes, quotes, anchors, .. } = acc;
    let comments = read_comments(comments_xml.as_deref(), ext_xml.as_deref(), &quotes, &anchors)?;

    let mut authors: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for c in &changes {
        authors.entry(c.author.clone()).or_default().0 += 1;
    }
    for c in &comments {
        authors.entry(c.author.clone()).or_default().1 += 1;
    }

    // Parties à suivis qu'on ne lit pas (en-tête d'une section absente…).
    let mut other_parts = Vec::new();
    let read: Vec<String> = headers.iter().map(|h| format!("word/{}.xml", h.id)).chain([crate::DOCUMENT.to_string(), FOOTNOTES.to_string(), ENDNOTES.to_string()]).collect();
    for name in docx.story_parts().into_iter().filter(|n| !read.contains(n)) {
        if let Some(t) = docx.part(&name)? {
            let n = t.matches("<w:ins ").count() + t.matches("<w:del ").count();
            if n > 0 {
                other_parts.push(OtherPart { part: name.clone(), changes: n });
            }
        }
    }

    Ok(DocModel {
        revision: docx.revision(),
        paragraphs,
        notes,
        headers,
        changes,
        comments,
        authors: authors.into_iter().map(|(name, (changes, comments))| Author { name, changes, comments }).collect(),
        other_parts,
    })
}

fn read_comments(xml_text: Option<&str>, ext: Option<&str>, quotes: &BTreeMap<u32, String>, anchors: &HashMap<u32, String>) -> Result<Vec<Comment>> {
    let Some(text) = xml_text else { return Ok(Vec::new()) };
    let doc = xml::parse(text)?;
    // paraId du dernier paragraphe d'un commentaire → id du commentaire
    let mut by_para: HashMap<String, u32> = HashMap::new();
    let mut out = Vec::new();
    for c in doc.root_element().children().filter(|n| is_w(*n, "comment")) {
        let Some(id) = id_of(c) else { continue };
        let paras: Vec<_> = c.children().filter(|n| is_w(*n, "p")).collect();
        if let Some(last) = paras.last().and_then(|p| p.attribute((W14, "paraId"))) {
            by_para.insert(last.to_string(), id);
        }
        let body = paras
            .iter()
            .map(|p| p.descendants().filter(|n| is_w(*n, "t")).filter_map(|n| n.text()).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n");
        out.push(Comment {
            id,
            author: w_attr(c, "author").unwrap_or("").to_string(),
            initials: w_attr(c, "initials").unwrap_or("").to_string(),
            date: w_attr(c, "date").unwrap_or("").to_string(),
            text: body,
            parent: None,
            done: false,
            paragraph: anchors.get(&id).cloned(),
            quote: quotes.get(&id).cloned().unwrap_or_default(),
        });
    }
    if let Some(ext) = ext {
        let doc = xml::parse(ext)?;
        let index: HashMap<u32, usize> = out.iter().enumerate().map(|(i, c)| (c.id, i)).collect();
        for e in doc.descendants().filter(|n| n.tag_name().name() == "commentEx" && n.tag_name().namespace() == Some(W15)) {
            let Some(cid) = e.attribute((W15, "paraId")).and_then(|p| by_para.get(p)) else { continue };
            let Some(&i) = index.get(cid) else { continue };
            out[i].done = matches!(e.attribute((W15, "done")), Some("1" | "true"));
            out[i].parent = e.attribute((W15, "paraIdParent")).and_then(|p| by_para.get(p)).copied();
        }
    }
    Ok(out)
}


