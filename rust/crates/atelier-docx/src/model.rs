//! Vue du document pour l'interface et pour l'agent.

use crate::walk::{self, Fmt, Kind};
use crate::xml::{self, W, W14, W15, id_of, is_w, w_attr, w_child};
use crate::{COMMENTS, COMMENTS_EXT, Docx, Result};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};

#[derive(Serialize, Debug)]
pub struct DocModel {
    pub revision: String,
    pub paragraphs: Vec<Para>,
    pub changes: Vec<Change>,
    pub comments: Vec<Comment>,
    pub authors: Vec<Author>,
    /// Suivis hors du corps (notes, en-têtes) : visibles dans Word, pas ici.
    pub other_parts: Vec<OtherPart>,
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
    }
}

pub fn build(docx: &mut Docx) -> Result<DocModel> {
    let styles = docx.part("word/styles.xml")?;
    let levels = heading_levels(styles.as_deref());
    let comments_xml = docx.part(COMMENTS)?;
    let ext_xml = docx.part(COMMENTS_EXT)?;
    let src = docx.document_xml().to_string();
    let doc = xml::parse(&src)?;

    let mut changes: Vec<Change> = Vec::new();
    let mut by_id: HashMap<u32, usize> = HashMap::new();
    for node in doc.descendants().filter(|n| n.is_element()) {
        if let Some(kind) = change_kind(node) {
            let id = id_of(node).unwrap_or(0);
            if by_id.contains_key(&id) {
                continue;
            }
            by_id.insert(id, changes.len());
            let text = match kind.as_str() {
                "paragraph-ins" | "paragraph-del" => "¶".into(),
                "row-ins" | "row-del" => "ligne de tableau".into(),
                "format" => "mise en forme".into(),
                "cell" => "cellule".into(),
                _ => String::new(),
            };
            changes.push(Change {
                id,
                kind,
                author: w_attr(node, "author").unwrap_or("").to_string(),
                date: w_attr(node, "date").unwrap_or("").to_string(),
                paragraph: None,
                text,
            });
        }
    }

    let para_nodes = walk::paragraphs(&doc);
    let para_index: HashMap<roxmltree::NodeId, usize> = para_nodes.iter().enumerate().map(|(i, p)| (p.node.id(), i)).collect();
    // Mises en forme : rattachées à leur paragraphe, avec le texte touché.
    for node in doc.descendants().filter(|n| is_w(*n, "rPrChange") || is_w(*n, "pPrChange")) {
        let Some(&i) = id_of(node).and_then(|id| by_id.get(&id)) else { continue };
        // LibreOffice réutilise parfois un identifiant d'un suivi à l'autre.
        if changes[i].kind != "format" {
            continue;
        }
        if let Some(pi) = node.ancestors().find_map(|a| para_index.get(&a.id())) {
            changes[i].paragraph.get_or_insert_with(|| format!("p{pi}"));
        }
        if is_w(node, "rPrChange")
            && let Some(run) = node.parent().and_then(|r| r.parent()).filter(|r| is_w(*r, "r")) {
                let t: String = run.children().filter(|c| is_w(*c, "t")).filter_map(|c| c.text()).collect();
                if !t.is_empty() {
                    if changes[i].text == "mise en forme" {
                        changes[i].text.clear();
                    }
                    changes[i].text.push_str(&t);
                }
            }
    }

    let mut paragraphs = Vec::new();
    let mut quotes: BTreeMap<u32, String> = BTreeMap::new();
    let mut anchors: HashMap<u32, String> = HashMap::new();
    let mut state = walk::State::default();
    for (index, pref) in para_nodes.into_iter().enumerate() {
        let p = pref.node;
        let id = format!("p{index}");
        let inline = walk::inline(&src, p, &mut state);
        let ppr = w_child(p, "pPr");
        let style = ppr.and_then(|n| w_child(n, "pStyle")).and_then(|n| w_attr(n, "val")).map(str::to_string);
        let heading = style.as_ref().and_then(|s| levels.get(s).copied()).or_else(|| {
            ppr.and_then(|n| w_child(n, "outlineLvl")).and_then(|o| w_attr(o, "val")).and_then(|v| v.parse::<u8>().ok()).filter(|v| *v < 9).map(|v| v + 1)
        });
        let mark_change = walk::mark_rev(p).map(|(_, rid, _)| rid);
        if let Some(rid) = mark_change
            && let Some(&i) = by_id.get(&rid) {
                changes[i].paragraph.get_or_insert_with(|| id.clone());
            }
        let mut text = String::new();
        let mut segments: Vec<Segment> = Vec::new();
        for piece in &inline.pieces {
            if let Some((_, rid)) = piece.rev
                && let Some(&i) = by_id.get(&rid) {
                    changes[i].text.push_str(&piece.text);
                    changes[i].paragraph.get_or_insert_with(|| id.clone());
                }
            let removed = piece.rev.is_some_and(|(k, _)| k.removes());
            if !removed {
                text.push_str(&piece.text);
                for c in &piece.comments {
                    quotes.entry(*c).or_default().push_str(&piece.text);
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
            anchors.entry(*c).or_insert_with(|| id.clone());
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

    let comments = read_comments(comments_xml.as_deref(), ext_xml.as_deref(), &quotes, &anchors)?;

    let mut authors: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for c in &changes {
        authors.entry(c.author.clone()).or_default().0 += 1;
    }
    for c in &comments {
        authors.entry(c.author.clone()).or_default().1 += 1;
    }

    let mut other_parts = Vec::new();
    let names: Vec<String> = docx.names.clone();
    for name in names.iter().filter(|n| {
        let f = n.strip_prefix("word/").unwrap_or("");
        f.ends_with(".xml") && !f.contains('/') && (f.starts_with("footnotes") || f.starts_with("endnotes") || f.starts_with("header") || f.starts_with("footer"))
    }) {
        if let Some(t) = docx.part(name)? {
            let n = t.matches("<w:ins ").count() + t.matches("<w:del ").count();
            if n > 0 {
                other_parts.push(OtherPart { part: name.clone(), changes: n });
            }
        }
    }

    Ok(DocModel {
        revision: docx.revision(),
        paragraphs,
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


