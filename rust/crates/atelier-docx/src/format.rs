//! Mise en forme de base : caractères (gras, italique, souligné, barré,
//! exposant, indice, police, taille) et paragraphes (style, alignement).
//! En suivi, l'ancienne mise en forme est gardée dans `w:rPrChange` ou
//! `w:pPrChange`, comme le fait Word.

use crate::edit::{cut, find_in, run_len, run_starts, run_xml, target};
use crate::xml::{self, W, escape_attr, is_w, w_attr, w_child};
use crate::{Docx, Result, Signature, err};
use serde::{Deserialize, Serialize};
use std::ops::Range;

/// Ordre des enfants de `w:rPr` (CT_RPr) : Word refuse un ordre fantaisiste.
const RPR_ORDER: &[&str] = &[
    "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike", "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden", "color", "spacing", "w", "kern",
    "position", "sz", "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath",
];
/// Ordre des enfants de `w:pPr` (CT_PPr).
const PPR_ORDER: &[&str] = &[
    "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct",
    "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection", "textAlignment",
    "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr",
];

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct RunProps {
    pub b: Option<bool>,
    pub i: Option<bool>,
    pub u: Option<bool>,
    pub strike: Option<bool>,
    pub sup: Option<bool>,
    pub sub: Option<bool>,
    pub font: Option<String>,
    /// Taille en points.
    pub size: Option<f32>,
    /// Surlignage de Word (`yellow`, `green`, `cyan`, `magenta`…) ; `none`
    /// ou chaîne vide le retire.
    pub highlight: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct ParaProps {
    /// Identifiant de style (`Titre1`, `Normal`…), voir [`styles`].
    pub style: Option<String>,
    /// left, center, right, both
    pub align: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct StyleInfo {
    pub id: String,
    /// Nom interne de Word (`heading 1`, `Normal`, `caption`…).
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<u8>,
}

/// Enfant de propriétés : (nom local, XML brut, espace de noms W ?).
type Child = (String, String, bool);

/// Découpe un `w:rPr`/`w:pPr` brut en enfants. Le fragment est relu dans
/// la balise racine du document pour hériter de ses espaces de noms.
fn children_of(root_open: &str, raw: &str) -> Result<(Vec<Child>, Option<String>)> {
    if raw.is_empty() {
        return Ok((Vec::new(), None));
    }
    // Racine de la partie (w:document, w:footnotes, w:hdr…) refermée.
    let name: String = root_open[1..].chars().take_while(|c| !c.is_whitespace() && *c != '>' && *c != '/').collect();
    let close = format!("</{name}>");
    let wrapped = format!("{root_open}{raw}{close}");
    let doc = xml::parse(&wrapped)?;
    let el = doc.root_element().first_element_child().ok_or_else(|| crate::DocxError("propriétés illisibles".into()))?;
    let mut kids = Vec::new();
    let mut change = None;
    for c in el.children().filter(|n| n.is_element()) {
        let name = c.tag_name().name().to_string();
        let is_w_ns = c.tag_name().namespace() == Some(W);
        let text = wrapped[c.range()].to_string();
        if is_w_ns && (name == "rPrChange" || name == "pPrChange") {
            change = Some(text);
        } else {
            kids.push((name, text, is_w_ns));
        }
    }
    Ok((kids, change))
}

fn set(kids: &mut Vec<Child>, name: &str, value: Option<String>) {
    kids.retain(|(n, _, w)| !(*w && n == name));
    if let Some(v) = value {
        kids.push((name.to_string(), v, true));
    }
}

fn has(kids: &[Child], name: &str) -> bool {
    kids.iter().any(|(n, _, w)| *w && n == name)
}

fn val(kids: &[Child], name: &str) -> Option<String> {
    kids.iter().find(|(n, _, w)| *w && n == name).and_then(|(_, raw, _)| raw.split("w:val=\"").nth(1).and_then(|r| r.split('"').next()).map(str::to_string))
}

fn ordered(mut kids: Vec<Child>, order: &[&str]) -> String {
    let rank = |k: &Child| if k.2 { order.iter().position(|o| *o == k.0).unwrap_or(order.len()) } else { order.len() };
    kids.sort_by_key(rank);
    kids.into_iter().map(|k| k.1).collect()
}

fn toggle(kids: &mut Vec<Child>, name: &str, on: Option<bool>) {
    match on {
        Some(true) => set(kids, name, Some(format!("<w:{name}/>"))),
        // Retirer la mise en forme directe ; si elle venait du style, la
        // neutraliser explicitement.
        Some(false) if has(kids, name) && val(kids, name).is_none() => set(kids, name, None),
        Some(false) => set(kids, name, Some(format!("<w:{name} w:val=\"0\"/>"))),
        None => {}
    }
}

fn apply_run(kids: &mut Vec<Child>, p: &RunProps) {
    toggle(kids, "b", p.b);
    toggle(kids, "i", p.i);
    toggle(kids, "strike", p.strike);
    match p.u {
        Some(true) => set(kids, "u", Some("<w:u w:val=\"single\"/>".into())),
        Some(false) => set(kids, "u", None),
        None => {}
    }
    match p.highlight.as_deref() {
        Some("" | "none") => set(kids, "highlight", None),
        Some(c) => set(kids, "highlight", Some(format!("<w:highlight w:val=\"{}\"/>", escape_attr(c)))),
        None => {}
    }
    let va = val(kids, "vertAlign");
    match (p.sup, p.sub) {
        (Some(true), _) => set(kids, "vertAlign", Some("<w:vertAlign w:val=\"superscript\"/>".into())),
        (_, Some(true)) => set(kids, "vertAlign", Some("<w:vertAlign w:val=\"subscript\"/>".into())),
        (Some(false), _) if va.as_deref() == Some("superscript") => set(kids, "vertAlign", None),
        (_, Some(false)) if va.as_deref() == Some("subscript") => set(kids, "vertAlign", None),
        _ => {}
    }
    if let Some(f) = &p.font {
        let f = escape_attr(f);
        set(kids, "rFonts", Some(format!("<w:rFonts w:ascii=\"{f}\" w:hAnsi=\"{f}\" w:cs=\"{f}\"/>")));
    }
    if let Some(s) = p.size {
        let half = (s * 2.0).round().clamp(2.0, 3276.0) as u32;
        set(kids, "sz", Some(format!("<w:sz w:val=\"{half}\"/>")));
        set(kids, "szCs", Some(format!("<w:szCs w:val=\"{half}\"/>")));
    }
}

fn change_attrs(id: u32, sig: &Signature) -> String {
    format!("w:id=\"{id}\" w:author=\"{}\" w:date=\"{}\"", escape_attr(&sig.author), escape_attr(&sig.date))
}

/// Nouveau `w:rPr` d'un run.
fn new_rpr(root_open: &str, rpr: &str, p: &RunProps, tracked: bool, id: u32, sig: &Signature) -> Result<String> {
    let (mut kids, change) = children_of(root_open, rpr)?;
    let old: String = kids.iter().map(|k| k.1.clone()).collect();
    apply_run(&mut kids, p);
    let mut inner = ordered(kids, RPR_ORDER);
    match change {
        // Le premier état d'origine reste la référence, comme chez Word.
        Some(c) => inner.push_str(&c),
        None if tracked && inner != old => inner.push_str(&format!("<w:rPrChange {}><w:rPr>{old}</w:rPr></w:rPrChange>", change_attrs(id, sig))),
        None => {}
    }
    Ok(if inner.is_empty() { String::new() } else { format!("<w:rPr>{inner}</w:rPr>") })
}

fn root_open(src: &str) -> Result<String> {
    let doc = xml::parse(src)?;
    Ok(xml::open_tag(src, doc.root_element()))
}

#[derive(Debug, Default, Serialize)]
pub struct FormatResult {
    /// Passages laissés tels quels (citations, figures, suivis d'autrui).
    pub skipped: usize,
}

/// Met en forme les caractères [start, end) du texte courant.
pub fn format_range(docx: &mut Docx, paragraph: &str, start: usize, end: usize, props: &RunProps, tracked: bool, sig: &Signature) -> Result<FormatResult> {
    if start >= end {
        return err("sélection vide");
    }
    let (story, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let t = target(&src, &doc, paragraph)?;
    let open = root_open(&src)?;
    drop(doc);
    let starts = run_starts(&t);
    let id = crate::edit::next_ids(docx, 1)?[0];
    let mut skipped = 0;
    for (piece, span) in t.inline.pieces.iter().zip(&t.spans) {
        if let Some((ps, pe)) = span
            && *ps < end && *pe > start && ps != pe && piece.run.is_none() {
                skipped += 1;
            }
    }
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    for (ri, run) in t.inline.runs.iter().enumerate() {
        let Some(rs) = starts[ri] else { continue };
        let re = rs + run_len(&t, ri);
        if re <= start || rs >= end {
            continue;
        }
        let (before, mid, after) = cut(&run.toks, start.saturating_sub(rs), end.min(re) - rs);
        let rpr = new_rpr(&open, &run.rpr, props, tracked, id, sig)?;
        let mut out = String::new();
        if !before.is_empty() {
            out.push_str(&run_xml(&run.start_tag, &run.rpr, &before, false));
        }
        out.push_str(&run_xml(&run.start_tag, &rpr, &mid, false));
        if !after.is_empty() {
            out.push_str(&run_xml(&run.start_tag, &run.rpr, &after, false));
        }
        edits.push((run.range.clone(), out));
    }
    if edits.is_empty() {
        return Ok(FormatResult { skipped });
    }
    let out = xml::splice(&src, edits)?;
    docx.set_part(&story.part, out);
    Ok(FormatResult { skipped })
}

/// Met en forme la `occurrence`-ième apparition de `find` (pour l'agent).
pub fn format_text(docx: &mut Docx, paragraph: &str, find: &str, occurrence: Option<usize>, props: &RunProps, tracked: bool, sig: &Signature) -> Result<FormatResult> {
    let (_, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    let t = target(&src, &doc, paragraph)?;
    let (s, e) = find_in(&t.text, find, occurrence, paragraph)?;
    drop(doc);
    format_range(docx, paragraph, s, e, props, tracked, sig)
}

/// Style et alignement d'un paragraphe.
pub fn format_paragraph(docx: &mut Docx, paragraph: &str, props: &ParaProps, tracked: bool, sig: &Signature) -> Result<()> {
    if let Some(a) = &props.align
        && !["left", "center", "right", "both"].contains(&a.as_str()) {
            return err(format!("alignement inconnu : {a}"));
        }
    if let Some(s) = &props.style
        && !styles(docx)?.iter().any(|x| &x.id == s) {
            return err(format!("style absent du document : {s}"));
        }
    let (story, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let t = target(&src, &doc, paragraph)?;
    let p = doc.descendants().find(|n| is_w(*n, "p") && n.range() == t.p_range).unwrap();
    let open = xml::open_tag(&src, doc.root_element());
    let ppr = w_child(p, "pPr");
    let raw = ppr.map(|n| src[n.range()].to_string()).unwrap_or_default();
    let (mut kids, change) = children_of(&open, &raw)?;
    let old: String = kids.iter().filter(|k| !(k.2 && (k.0 == "rPr" || k.0 == "sectPr"))).map(|k| k.1.clone()).collect();
    if let Some(s) = &props.style {
        set(&mut kids, "pStyle", if s == "Normal" { None } else { Some(format!("<w:pStyle w:val=\"{}\"/>", escape_attr(s))) });
    }
    if let Some(a) = &props.align {
        set(&mut kids, "jc", Some(format!("<w:jc w:val=\"{a}\"/>")));
    }
    let new_props: String = kids.iter().filter(|k| !(k.2 && (k.0 == "rPr" || k.0 == "sectPr"))).map(|k| k.1.clone()).collect();
    let mut inner = ordered(kids, PPR_ORDER);
    match change {
        Some(c) => inner.push_str(&c),
        None if tracked && new_props != old => {
            let id = crate::edit::next_ids(docx, 1)?[0];
            inner.push_str(&format!("<w:pPrChange {}><w:pPr>{old}</w:pPr></w:pPrChange>", change_attrs(id, sig)));
        }
        None => {}
    }
    let new_ppr = if inner.is_empty() { String::new() } else { format!("<w:pPr>{inner}</w:pPr>") };
    let edit = match ppr {
        Some(n) => (n.range(), new_ppr),
        None => match p.first_child() {
            Some(c) => (c.range().start..c.range().start, new_ppr),
            None => (p.range(), format!("{}{new_ppr}</w:p>", xml::open_tag(&src, p))),
        },
    };
    drop(doc);
    let out = xml::splice(&src, vec![edit])?;
    docx.set_part(&story.part, out);
    Ok(())
}

/// Styles de paragraphe définis dans le document.
pub fn styles(docx: &mut Docx) -> Result<Vec<StyleInfo>> {
    let Some(text) = docx.part("word/styles.xml")? else { return Ok(vec![StyleInfo { id: "Normal".into(), name: "Normal".into(), heading: None }]) };
    let levels = crate::model::heading_levels(Some(&text));
    let doc = xml::parse(&text)?;
    let mut out: Vec<StyleInfo> = doc
        .root_element()
        .children()
        .filter(|n| is_w(*n, "style") && w_attr(*n, "type") == Some("paragraph"))
        .filter(|n| w_child(*n, "semiHidden").is_none() || w_child(*n, "qFormat").is_some())
        .filter_map(|n| {
            let id = w_attr(n, "styleId")?.to_string();
            let name = w_child(n, "name").and_then(|x| w_attr(x, "val")).unwrap_or(&id).to_string();
            Some(StyleInfo { heading: levels.get(&id).copied(), id, name })
        })
        .collect();
    if !out.iter().any(|s| s.id == "Normal") {
        out.insert(0, StyleInfo { id: "Normal".into(), name: "Normal".into(), heading: None });
    }
    Ok(out)
}
