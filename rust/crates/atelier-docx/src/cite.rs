//! Citations Zotero VIVANTES : les champs du module Zotero de Word.
//!
//! Une citation est un champ complexe `ADDIN ZOTERO_ITEM CSL_CITATION {json}`
//! dont le JSON porte, pour chaque référence, l'URI de la notice dans la
//! bibliothèque Zotero et la notice complète (`itemData`) ; la
//! bibliographie est un champ `ADDIN ZOTERO_BIBL {...} CSL_BIBLIOGRAPHY` qui
//! couvre ses paragraphes ; le style du document vit dans les propriétés
//! personnalisées `ZOTERO_PREF_1…` (`docProps/custom.xml`). Écrits ainsi, le
//! document reste rafraîchissable et modifiable dans Word avec Zotero.
//!
//! Le texte affiché est un rendu simple du style (auteur-date ou
//! numérique) : Zotero le recalcule au Refresh. La seule exigence dure est
//! que `plainCitation` égale le texte affiché, sinon Zotero croit à une
//! retouche manuelle. Le moteur ne lit jamais Zotero : l'appelant fournit
//! les notices (`CiteItem::data`, `uri`, `id`), via `atelier-cite`.

use crate::xml::{self, escape_attr, escape_text, is_w, w_attr};
use crate::{DOCUMENT, Docx, DocxError, Result, Signature, edit, err};
use roxmltree::Node;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::ops::Range;

pub const DEFAULT_STYLE: &str = "http://www.zotero.org/styles/apa";
const CUSTOM: &str = "docProps/custom.xml";
const CT_CUSTOM: &str = "application/vnd.openxmlformats-officedocument.custom-properties+xml";
const REL_CUSTOM: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties";
const FMTID: &str = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";
const SCHEMA: &str = "https://github.com/citation-style-language/schema/raw/master/csl-citation.json";
/// Famille du style choisi dans Atelier, à côté des préférences de Zotero
/// (`<id du style>|<famille>`) : Zotero l'ignore.
const FORMAT_PROP: &str = "AtelierCiteFormat";

/// Une référence d'une citation : la clé Zotero et ses précisions ; `id`,
/// `uri` et `data` sont remplis par l'appelant (notice Zotero) et
/// sérialisés, pour qu'un journal de séance se rejoue sans Zotero.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Default)]
pub struct CiteItem {
    pub key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locator: Option<String>,
    /// `page` par défaut ; `chapter`, `figure`, `section`…
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub suffix: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub suppress_author: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// Style choisi pour le document.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct StyleRef {
    pub id: String,
    /// `author-date` ou `numeric` (les styles `note` sont refusés).
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
}

/// Ce que le document dit de son style.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DocStyle {
    pub id: String,
    pub format: String,
    pub locale: Option<String>,
    /// Les préférences de Zotero sont-elles déjà écrites ?
    pub stored: bool,
}

// ---------------------------------------------------------------------------
// Champs dans le XML
// ---------------------------------------------------------------------------

/// Un champ Zotero trouvé dans une partie : ses bornes et ses textes.
#[derive(Debug, Clone)]
pub(crate) struct FieldLoc {
    pub part: String,
    /// Instruction recollée.
    pub instr: String,
    pub bibl: bool,
    /// Dans une suppression en suivi (`w:delInstrText`).
    pub deleted: bool,
    /// Éléments `w:instrText` (bornes de l'élément entier).
    pub instr_nodes: Vec<Range<usize>>,
    /// Éléments `w:t` du résultat (champ de premier niveau seulement).
    pub result_t: Vec<Range<usize>>,
    /// Run de `fldChar end` : début (pour y glisser un run manquant).
    pub end_run: Range<usize>,
    /// Paragraphes du début et de la fin du champ.
    pub first_p: Range<usize>,
    pub last_p: Range<usize>,
    /// Note qui le porte (citation dans une note : `noteIndex`).
    pub note: Option<u32>,
}

impl FieldLoc {
    pub fn json(&self) -> Option<Value> {
        parse_instr(&self.instr)
    }
    pub fn citation_id(&self) -> Option<String> {
        self.json()?.get("citationID").and_then(Value::as_str).map(str::to_string)
    }
}

/// JSON d'une instruction Zotero (entre la première `{` et la dernière `}`).
pub(crate) fn parse_instr(instr: &str) -> Option<Value> {
    let a = instr.find('{')?;
    let b = instr.rfind('}')?;
    if b <= a {
        return None;
    }
    let body = &instr[a..=b];
    // ZOTERO_BIBL : `{...} CSL_BIBLIOGRAPHY` — un seul objet, rfind suffit.
    serde_json::from_str(body).ok()
}

/// `citationID` d'une instruction de citation.
pub(crate) fn citation_id_of(instr: &str) -> Option<String> {
    if !instr.contains("ZOTERO_ITEM") && !instr.contains("CSL_CITATION") {
        return None;
    }
    parse_instr(instr)?.get("citationID").and_then(Value::as_str).map(str::to_string)
}

fn ancestor_p<'a, 'i>(n: Node<'a, 'i>) -> Option<Node<'a, 'i>> {
    n.ancestors().find(|a| is_w(*a, "p"))
}

fn run_of<'a, 'i>(n: Node<'a, 'i>) -> Node<'a, 'i> {
    n.ancestors().find(|a| is_w(*a, "r")).unwrap_or(n)
}

/// Champs Zotero d'une partie, dans l'ordre.
fn fields_in(part: &str, src: &str) -> Result<Vec<FieldLoc>> {
    if !src.contains("ZOTERO_") {
        return Ok(Vec::new());
    }
    let doc = xml::parse(src)?;
    struct Frame<'a, 'i> {
        instr: String,
        deleted: bool,
        nodes: Vec<Range<usize>>,
        ts: Vec<Range<usize>>,
        separated: bool,
        begin: Node<'a, 'i>,
    }
    let mut stack: Vec<Frame> = Vec::new();
    let mut out = Vec::new();
    for n in doc.descendants().filter(|n| n.is_element()) {
        let name = n.tag_name().name();
        if n.tag_name().namespace() != Some(xml::W) {
            continue;
        }
        match name {
            "fldChar" => match w_attr(n, "fldCharType") {
                Some("begin") => stack.push(Frame { instr: String::new(), deleted: false, nodes: Vec::new(), ts: Vec::new(), separated: false, begin: n }),
                Some("separate") => {
                    if let Some(f) = stack.last_mut() {
                        f.separated = true;
                    }
                }
                Some("end") => {
                    let Some(f) = stack.pop() else { continue };
                    let t = f.instr.trim_start();
                    let zotero = t.starts_with("ADDIN ZOTERO_ITEM") || t.starts_with("ADDIN ZOTERO_BIBL") || t.contains("CSL_CITATION");
                    if !zotero {
                        continue;
                    }
                    let (Some(p0), Some(p1)) = (ancestor_p(f.begin), ancestor_p(n)) else { continue };
                    let note = p0.ancestors().find(|a| is_w(*a, "footnote") || is_w(*a, "endnote")).and_then(|a| w_attr(a, "id")).and_then(|v| v.parse().ok());
                    out.push(FieldLoc {
                        part: part.to_string(),
                        bibl: t.contains("ZOTERO_BIBL"),
                        instr: f.instr,
                        deleted: f.deleted,
                        instr_nodes: f.nodes,
                        result_t: f.ts,
                        end_run: run_of(n).range(),
                        first_p: p0.range(),
                        last_p: p1.range(),
                        note,
                    });
                }
                _ => {}
            },
            "instrText" | "delInstrText" => {
                if let Some(f) = stack.last_mut().filter(|f| !f.separated) {
                    f.instr.push_str(n.text().unwrap_or(""));
                    f.nodes.push(n.range());
                    f.deleted |= name == "delInstrText";
                }
            }
            "t" => {
                if stack.len() == 1 && stack[0].separated {
                    stack[0].ts.push(n.range());
                }
            }
            _ => {}
        }
    }
    Ok(out)
}

/// Tous les champs Zotero du document : corps, puis notes de bas de page et
/// de fin.
pub(crate) fn all_fields(docx: &mut Docx) -> Result<Vec<FieldLoc>> {
    let mut out = Vec::new();
    for part in [DOCUMENT, "word/footnotes.xml", "word/endnotes.xml"] {
        if let Some(src) = docx.part(part)? {
            out.extend(fields_in(part, &src)?);
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Préférences du document
// ---------------------------------------------------------------------------

/// Propriétés personnalisées : `(nom, valeur)` dans l'ordre.
fn custom_props(docx: &mut Docx) -> Result<Vec<(String, String)>> {
    let Some(src) = docx.part(CUSTOM)? else { return Ok(Vec::new()) };
    let doc = xml::parse(&src)?;
    Ok(doc
        .root_element()
        .children()
        .filter(|n| n.tag_name().name() == "property")
        .map(|p| {
            let name = p.attribute("name").unwrap_or("").to_string();
            let value: String = p.descendants().filter(|d| d.is_text()).filter_map(|d| d.text()).collect();
            (name, value)
        })
        .collect())
}

/// Préférences Zotero recollées (`ZOTERO_PREF_1` + `_2`…).
fn zotero_pref(props: &[(String, String)]) -> Option<String> {
    let mut parts: Vec<(u32, &str)> = props.iter().filter_map(|(n, v)| n.strip_prefix("ZOTERO_PREF_").and_then(|k| k.parse().ok()).map(|k| (k, v.as_str()))).collect();
    if parts.is_empty() {
        return None;
    }
    parts.sort_by_key(|(k, _)| *k);
    Some(parts.into_iter().map(|(_, v)| v).collect())
}

fn attr_in(xml_text: &str, tag: &str, attr: &str) -> Option<String> {
    let at = xml_text.find(&format!("<{tag} "))?;
    let rest = &xml_text[at..];
    let end = rest.find('>')?;
    let open = &rest[..end];
    let key = format!("{attr}=\"");
    let a = open.find(&key)? + key.len();
    let b = open[a..].find('"')? + a;
    Some(open[a..b].replace("&amp;", "&").replace("&quot;", "\""))
}

/// Famille d'un style d'après son identifiant (styles numériques courants).
pub fn guess_format(id: &str) -> &'static str {
    let s = id.to_ascii_lowercase();
    const NUMERIC: &[&str] = &[
        "ieee", "vancouver", "/nature", "/science", "american-medical-association", "numeric", "elsevier-with-titles", "elsevier-without-titles",
        "american-chemical-society", "/acs-", "american-institute-of-physics", "/aip", "american-physics-society", "springer-basic-brackets",
        "springer-vancouver", "plos", "/bmc", "royal-society-of-chemistry", "proceedings-of-the-national-academy-of-sciences", "/pnas", "cell-numeric",
        "frontiers-in", "mdpi", "multidisciplinary-digital-publishing-institute", "optica", "spie",
    ];
    if s.contains("chicago-note") || s.contains("-note-") || s.ends_with("-note") || s.contains("oscola") || s.contains("bluebook") {
        return "note";
    }
    if NUMERIC.iter().any(|k| s.contains(k)) { "numeric" } else { "author-date" }
}

/// Style du document : préférences Zotero, sinon APA.
pub fn doc_style(docx: &mut Docx) -> Result<DocStyle> {
    let props = custom_props(docx)?;
    let pref = zotero_pref(&props);
    let id = pref.as_deref().and_then(|p| attr_in(p, "style", "id")).unwrap_or_else(|| DEFAULT_STYLE.to_string());
    let locale = pref.as_deref().and_then(|p| attr_in(p, "style", "locale"));
    let stored_fmt = props.iter().find(|(n, _)| n == FORMAT_PROP).and_then(|(_, v)| v.split_once('|').filter(|(sid, _)| *sid == id).map(|(_, f)| f.to_string()));
    let format = stored_fmt.unwrap_or_else(|| guess_format(&id).to_string());
    Ok(DocStyle { id, format, locale, stored: pref.is_some() })
}

fn rand_id(seed: &str, n: usize) -> String {
    use sha2::{Digest, Sha256};
    const A: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let h = Sha256::digest(format!("{seed}{nanos}{}", std::process::id()).as_bytes());
    h.iter().take(n).map(|b| A[(*b as usize) % A.len()] as char).collect()
}

/// Écrit (ou met à jour) les préférences Zotero du document : session,
/// style, langue, champs Word ; ne touche pas aux autres propriétés.
fn write_prefs(docx: &mut Docx, style: &DocStyle) -> Result<()> {
    let props = custom_props(docx)?;
    let old = zotero_pref(&props);
    let session = old.as_deref().and_then(|p| attr_in(p, "session", "id")).unwrap_or_else(|| rand_id("session", 8));
    let version = old.as_deref().and_then(|p| attr_in(p, "data", "zotero-version")).unwrap_or_else(|| "7.0".into());
    let other_prefs = old
        .as_deref()
        .and_then(|p| {
            let a = p.find("<prefs>")? + 7;
            let b = p.find("</prefs>")?;
            Some(p[a..b].to_string())
        })
        .unwrap_or_else(|| r#"<pref name="fieldType" value="Field"/>"#.into());
    let locale = style.locale.as_deref().map(|l| format!(r#" locale="{}""#, escape_attr(l))).unwrap_or_default();
    let pref = format!(
        r#"<data data-version="3" zotero-version="{}"><session id="{}"/><style id="{}"{locale} hasBibliography="1" bibliographyStyleHasBeenSet="1"/><prefs>{other_prefs}</prefs></data>"#,
        escape_attr(&version),
        escape_attr(&session),
        escape_attr(&style.id)
    );
    // Tranches de 255 caractères, comme Word.
    let chars: Vec<char> = pref.chars().collect();
    let chunks: Vec<String> = chars.chunks(255).map(|c| c.iter().collect()).collect();
    let mut kept: Vec<(String, String)> = props.into_iter().filter(|(n, _)| !n.starts_with("ZOTERO_PREF_") && n != FORMAT_PROP).collect();
    for (k, c) in chunks.into_iter().enumerate() {
        kept.push((format!("ZOTERO_PREF_{}", k + 1), c));
    }
    kept.push((FORMAT_PROP.into(), format!("{}|{}", style.id, style.format)));
    // Réécrit custom.xml : les propriétés d'autres outils gardent leur type
    // (`vt:lpwstr` suffit pour Zotero ; on relit le XML d'origine pour les autres).
    let original = docx.part(CUSTOM)?;
    let mut body = String::new();
    let mut pid = 2;
    let kept_raw: HashMap<String, String> = match &original {
        Some(src) => {
            let doc = xml::parse(src)?;
            doc.root_element()
                .children()
                .filter(|n| n.tag_name().name() == "property")
                .filter_map(|p| {
                    let name = p.attribute("name")?.to_string();
                    let inner = p.first_element_child().map(|c| src[c.range()].to_string())?;
                    Some((name, inner))
                })
                .collect()
        }
        None => HashMap::new(),
    };
    for (name, value) in kept {
        let inner = if name.starts_with("ZOTERO_PREF_") || name == FORMAT_PROP {
            format!("<vt:lpwstr>{}</vt:lpwstr>", escape_text(&value))
        } else {
            kept_raw.get(&name).cloned().unwrap_or_else(|| format!("<vt:lpwstr>{}</vt:lpwstr>", escape_text(&value)))
        };
        body.push_str(&format!(r#"<property fmtid="{FMTID}" pid="{pid}" name="{}">{inner}</property>"#, escape_attr(&name)));
        pid += 1;
    }
    let text = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">{body}</Properties>"#
    );
    if docx.has_part(CUSTOM) {
        docx.set_part(CUSTOM, text);
    } else {
        docx.create_package_part(CUSTOM, CT_CUSTOM, REL_CUSTOM, text)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

struct Lang {
    and: &'static str,
    nd: &'static str,
    page: &'static str,
    pages: &'static str,
}

fn lang(locale: Option<&str>) -> Lang {
    if locale.is_some_and(|l| l.to_ascii_lowercase().starts_with("fr")) {
        Lang { and: "et", nd: "s. d.", page: "p.", pages: "p." }
    } else {
        Lang { and: "&", nd: "n.d.", page: "p.", pages: "pp." }
    }
}

fn family(n: &Value) -> String {
    n.get("family").or_else(|| n.get("literal")).and_then(Value::as_str).unwrap_or("").to_string()
}

fn names(data: &Value) -> Vec<&Value> {
    ["author", "editor"].iter().find_map(|k| data.get(*k).and_then(Value::as_array).filter(|a| !a.is_empty())).map(|a| a.iter().collect()).unwrap_or_default()
}

fn year(data: &Value) -> Option<String> {
    let v = data.pointer("/issued/date-parts/0/0")?;
    v.as_i64().map(|y| y.to_string()).or_else(|| v.as_str().map(str::to_string)).filter(|s| !s.is_empty())
}

fn short_names(data: &Value, l: &Lang) -> String {
    let ns: Vec<String> = names(data).into_iter().map(family).collect();
    match ns.len() {
        0 => data.get("title").and_then(Value::as_str).map(|t| t.split_whitespace().take(4).collect::<Vec<_>>().join(" ")).unwrap_or_default(),
        1 => ns[0].clone(),
        2 => format!("{} {} {}", ns[0], l.and, ns[1]),
        _ => format!("{} et al.", ns[0]),
    }
}

fn locator(it: &CiteItem, l: &Lang) -> Option<String> {
    let loc = it.locator.as_deref().map(str::trim).filter(|s| !s.is_empty())?;
    let label = match it.label.as_deref().unwrap_or("page") {
        "page" => if loc.contains(['-', '–', ',']) { l.pages } else { l.page },
        "chapter" => "chap.",
        "figure" => "fig.",
        "section" => "sect.",
        "table" => "tabl.",
        "paragraph" => "para.",
        "line" => "l.",
        "equation" => "éq.",
        "volume" => "vol.",
        _ => "",
    };
    Some(if label.is_empty() { loc.to_string() } else { format!("{label} {loc}") })
}

fn affix(it: &CiteItem, body: String) -> String {
    let mut s = String::new();
    if let Some(p) = it.prefix.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        s.push_str(p);
        s.push(' ');
    }
    s.push_str(&body);
    if let Some(x) = it.suffix.as_deref().map(str::trim).filter(|x| !x.is_empty()) {
        if !x.starts_with([',', ';', '.']) {
            s.push_str(", ");
        }
        s.push_str(x);
    }
    s
}

/// Texte affiché d'une citation. `numbers` : numéro de chaque notice
/// (styles numériques), par URI ou clé.
fn render_citation(items: &[CiteItem], style: &DocStyle, numbers: &HashMap<String, usize>) -> String {
    let l = lang(style.locale.as_deref());
    let empty = json!({});
    if style.format == "numeric" {
        let parts: Vec<String> = items
            .iter()
            .map(|it| {
                let n = numbers.get(&ident(it)).map(|n| n.to_string()).unwrap_or_else(|| "?".into());
                let body = match locator(it, &l) {
                    Some(loc) => format!("{n}, {loc}"),
                    None => n,
                };
                format!("[{}]", affix(it, body))
            })
            .collect();
        // Comme IEEE : « [1], [2, p. 4] ».
        return parts.join(", ");
    }
    let parts: Vec<String> = items
        .iter()
        .map(|it| {
            let d = it.data.as_ref().unwrap_or(&empty);
            let y = year(d).unwrap_or_else(|| l.nd.to_string());
            let mut body = if it.suppress_author { y } else { format!("{}, {y}", short_names(d, &l)) };
            if let Some(loc) = locator(it, &l) {
                body.push_str(", ");
                body.push_str(&loc);
            }
            affix(it, body)
        })
        .collect();
    format!("({})", parts.join("; "))
}

fn ident(it: &CiteItem) -> String {
    it.uri.clone().unwrap_or_else(|| it.key.clone())
}

/// Un morceau d'entrée de bibliographie : texte, italique.
type Run = (String, bool);

fn initials(given: &str) -> String {
    given
        .split(|c: char| c.is_whitespace())
        .filter(|w| !w.is_empty())
        .map(|w| {
            // « Jean-Pierre » → « J.-P. »
            w.split('-').filter(|p| !p.is_empty()).map(|p| format!("{}.", p.chars().next().unwrap())).collect::<Vec<_>>().join("-")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn bib_entry(it: &CiteItem, style: &DocStyle, number: Option<usize>) -> Vec<Run> {
    let l = lang(style.locale.as_deref());
    let empty = json!({});
    let d = it.data.as_ref().unwrap_or(&empty);
    let s = |k: &str| d.get(k).and_then(Value::as_str).map(str::trim).filter(|v| !v.is_empty()).map(str::to_string);
    let kind = d.get("type").and_then(Value::as_str).unwrap_or("document");
    let ns = names(d);
    let mut out: Vec<Run> = Vec::new();
    let push = |out: &mut Vec<Run>, t: String, i: bool| {
        if let Some(last) = out.last_mut().filter(|(_, li)| *li == i) {
            last.0.push_str(&t);
        } else {
            out.push((t, i));
        }
    };
    let title = s("title");
    let container = s("container-title");
    let whole = matches!(kind, "book" | "report" | "thesis" | "dataset" | "software" | "webpage" | "map" | "document" | "manuscript") && container.is_none();
    let doi = s("DOI").map(|d| if d.starts_with("http") { d } else { format!("https://doi.org/{d}") });
    if style.format == "numeric" {
        push(&mut out, format!("[{}] ", number.unwrap_or(0)), false);
        let list: Vec<String> = ns
            .iter()
            .map(|n| match n.get("given").and_then(Value::as_str).filter(|g| !g.is_empty()) {
                Some(g) => format!("{} {}", initials(g), family(n)),
                None => family(n),
            })
            .collect();
        let who = match list.len() {
            0 => String::new(),
            1 => list[0].clone(),
            2 => format!("{} and {}", list[0], list[1]),
            k if k > 6 => format!("{} et al.", list[0]),
            _ => format!("{}, and {}", list[..list.len() - 1].join(", "), list[list.len() - 1]),
        };
        if !who.is_empty() {
            push(&mut out, format!("{who}, "), false);
        }
        if let Some(t) = &title {
            if whole {
                push(&mut out, t.clone(), true);
                push(&mut out, ", ".into(), false);
            } else {
                push(&mut out, format!("“{t},” "), false);
            }
        }
        if let Some(c) = &container {
            push(&mut out, c.clone(), true);
            push(&mut out, ", ".into(), false);
        }
        for (k, pre) in [("volume", "vol. "), ("issue", "no. ")] {
            if let Some(v) = s(k) {
                push(&mut out, format!("{pre}{v}, "), false);
            }
        }
        if let Some(p) = s("page") {
            push(&mut out, format!("{} {p}, ", if p.contains(['-', '–']) { "pp." } else { "p." }), false);
        }
        if let Some(p) = s("publisher").filter(|_| container.is_none()) {
            push(&mut out, format!("{p}, "), false);
        }
        push(&mut out, year(d).unwrap_or_else(|| l.nd.into()), false);
        if let Some(doi) = &doi {
            push(&mut out, format!(", doi: {}", doi.trim_start_matches("https://doi.org/")), false);
        }
        push(&mut out, ".".into(), false);
        return out;
    }
    // Auteur-date (proche d'APA).
    let list: Vec<String> = ns
        .iter()
        .map(|n| match n.get("given").and_then(Value::as_str).filter(|g| !g.is_empty()) {
            Some(g) => format!("{}, {}", family(n), initials(g)),
            None => family(n),
        })
        .collect();
    let who = match list.len() {
        0 => String::new(),
        1 => list[0].clone(),
        k if k <= 20 => format!("{}, {} {}", list[..k - 1].join(", "), l.and, list[k - 1]),
        _ => format!("{}, … {}", list[..19].join(", "), list[list.len() - 1]),
    };
    let y = year(d).unwrap_or_else(|| l.nd.into());
    match (who.is_empty(), &title) {
        (false, _) => push(&mut out, format!("{who} ({y}). "), false),
        (true, Some(t)) => {
            push(&mut out, t.clone(), whole);
            push(&mut out, format!(". ({y}). "), false);
        }
        (true, None) => push(&mut out, format!("({y}). "), false),
    }
    if !who.is_empty()
        && let Some(t) = &title {
            let t = t.trim_end_matches('.');
            push(&mut out, t.to_string(), whole);
            push(&mut out, ". ".into(), false);
        }
    if let Some(c) = &container {
        if kind == "chapter" || kind == "paper-conference" && s("event-title").is_none() && d.get("editor").is_some() {
            push(&mut out, "In ".into(), false);
        }
        push(&mut out, c.clone(), true);
        let vol = s("volume");
        if let Some(v) = &vol {
            push(&mut out, ", ".into(), false);
            push(&mut out, v.clone(), true);
        }
        if let Some(i) = s("issue") {
            push(&mut out, format!("({i})"), false);
        }
        if let Some(p) = s("page") {
            push(&mut out, format!(", {p}"), false);
        }
        push(&mut out, ". ".into(), false);
    } else if let Some(p) = s("publisher") {
        push(&mut out, format!("{p}. "), false);
    }
    if let Some(doi) = &doi {
        push(&mut out, doi.clone(), false);
    } else if let Some(u) = s("URL") {
        push(&mut out, u, false);
    }
    if let Some(last) = out.last_mut() {
        let t = last.0.trim_end().to_string();
        last.0 = t;
    }
    out
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

fn instr_json(id: &str, items: &[CiteItem], text: &str, note: Option<u32>) -> Result<String> {
    let mut cites = Vec::new();
    for it in items {
        let (Some(nid), Some(uri), Some(data)) = (it.id, it.uri.as_ref(), it.data.as_ref()) else {
            return err(format!("notice Zotero {} non chargée", it.key));
        };
        let mut c = json!({"id": nid, "uris": [uri], "itemData": data});
        if let Some(loc) = it.locator.as_deref().filter(|s| !s.trim().is_empty()) {
            c["locator"] = json!(loc.trim());
            c["label"] = json!(it.label.as_deref().unwrap_or("page"));
        }
        if let Some(p) = it.prefix.as_deref().filter(|s| !s.trim().is_empty()) {
            c["prefix"] = json!(p);
        }
        if let Some(p) = it.suffix.as_deref().filter(|s| !s.trim().is_empty()) {
            c["suffix"] = json!(p);
        }
        if it.suppress_author {
            c["suppress-author"] = json!(true);
        }
        cites.push(c);
    }
    let v = json!({
        "citationID": id,
        "properties": {"formattedCitation": text, "plainCitation": text, "noteIndex": note.unwrap_or(0)},
        "citationItems": cites,
        "schema": SCHEMA,
    });
    Ok(format!(" ADDIN ZOTERO_ITEM CSL_CITATION {} ", serde_json::to_string(&v).map_err(|e| DocxError(e.to_string()))?))
}

fn field_xml(instr: &str, text: &str) -> String {
    format!(
        r#"<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">{}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:noProof/></w:rPr><w:t xml:space="preserve">{}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>"#,
        escape_text(instr),
        escape_text(text)
    )
}

/// Les références d'une citation existante, relues de son JSON.
pub(crate) fn items_of(v: &Value) -> Vec<CiteItem> {
    v.get("citationItems")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|c| {
                    let uri = c.get("uris").and_then(Value::as_array).and_then(|u| u.first()).and_then(Value::as_str).or_else(|| c.get("uri").and_then(Value::as_array).and_then(|u| u.first()).and_then(Value::as_str)).map(str::to_string);
                    let key = uri.as_deref().and_then(|u| u.rsplit('/').next()).unwrap_or("").to_string();
                    let st = |k: &str| c.get(k).and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_i64().map(|n| n.to_string())));
                    CiteItem {
                        key,
                        locator: st("locator"),
                        label: st("label"),
                        prefix: st("prefix"),
                        suffix: st("suffix"),
                        suppress_author: c.get("suppress-author").and_then(Value::as_bool).unwrap_or(false),
                        id: c.get("id").and_then(Value::as_i64).or_else(|| c.pointer("/itemData/id").and_then(Value::as_i64)),
                        uri,
                        data: c.get("itemData").cloned(),
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Numéros (styles numériques) par ordre de première apparition.
fn numbering(fields: &[FieldLoc], extra: Option<&[CiteItem]>) -> HashMap<String, usize> {
    let mut map = HashMap::new();
    let mut add = |it: &CiteItem| {
        let n = map.len() + 1;
        map.entry(ident(it)).or_insert(n);
    };
    for f in fields.iter().filter(|f| !f.bibl && !f.deleted) {
        if let Some(v) = f.json() {
            // Sans notice embarquée (rare : Zotero l'écrit toujours), la
            // citation est laissée telle quelle et ne prend pas de numéro.
            for it in items_of(&v).iter().filter(|it| it.data.is_some()) {
                add(it);
            }
        }
    }
    if let Some(x) = extra {
        for it in x {
            add(it);
        }
    }
    map
}

fn check_items(items: &[CiteItem], style: &DocStyle) -> Result<()> {
    if items.is_empty() {
        return err("aucune référence à citer");
    }
    if style.format == "note" {
        return err("style en notes de bas de page : pas encore pris en charge dans Atelier (choisir un style auteur-date ou numérique)");
    }
    Ok(())
}

/// Résultat d'une citation posée ou réécrite.
#[derive(Debug, Serialize)]
pub struct Cited {
    pub citation: String,
    pub text: String,
    pub changes: Vec<u32>,
}

/// Pose une citation à la position `at` de `paragraph`.
pub fn insert_citation(docx: &mut Docx, paragraph: &str, at: usize, items: &[CiteItem], tracked: bool, sig: &Signature) -> Result<Cited> {
    let style = doc_style(docx)?;
    check_items(items, &style)?;
    let fields = all_fields(docx)?;
    let numbers = numbering(&fields, Some(items));
    let text = render_citation(items, &style, &numbers);
    let mut id = rand_id(paragraph, 8);
    while fields.iter().any(|f| f.citation_id().as_deref() == Some(id.as_str())) {
        id = rand_id(&id, 8);
    }
    let note = crate::story::parse_ref(paragraph).ok().and_then(|s| match s.scope {
        crate::story::Scope::Note(_, n) => u32::try_from(n).ok(),
        _ => None,
    });
    let raw = field_xml(&instr_json(&id, items, &text, note)?, &text);
    let changes = edit::insert_raw(docx, paragraph, at, &raw, tracked, sig)?.changes;
    if !style.stored {
        write_prefs(docx, &style)?;
    }
    // Numérique : les numéros des suivantes changent ; bibliographie : à jour.
    refresh(docx, &style)?;
    Ok(Cited { citation: id.clone(), text: current_text(docx, &id)?.unwrap_or(text), changes })
}

fn current_text(docx: &mut Docx, id: &str) -> Result<Option<String>> {
    Ok(all_fields(docx)?.into_iter().find(|f| f.citation_id().as_deref() == Some(id)).and_then(|f| f.json()).and_then(|v| v.pointer("/properties/plainCitation").and_then(Value::as_str).map(str::to_string)))
}

/// Réécrit en place l'instruction et le texte affiché d'un champ (sans
/// suivi) : la structure (suivis qui l'enveloppent, mise en forme) reste.
fn rewrite_in_place(src: &str, f: &FieldLoc, instr: &str, text: &str) -> Vec<(Range<usize>, String)> {
    let mut edits = Vec::new();
    for (k, r) in f.instr_nodes.iter().enumerate() {
        let body = if k == 0 { escape_text(instr) } else { String::new() };
        edits.push((r.clone(), format!(r#"<w:instrText xml:space="preserve">{body}</w:instrText>"#)));
    }
    if f.result_t.is_empty() {
        let at = f.end_run.start;
        edits.push((at..at, format!(r#"<w:r><w:rPr><w:noProof/></w:rPr><w:t xml:space="preserve">{}</w:t></w:r>"#, escape_text(text))));
    } else {
        for (k, r) in f.result_t.iter().enumerate() {
            let body = if k == 0 { escape_text(text) } else { String::new() };
            edits.push((r.clone(), format!(r#"<w:t xml:space="preserve">{body}</w:t>"#)));
        }
    }
    let _ = src;
    edits
}

/// Remplace (ou retire, `items` vide) la citation `citation`. En suivi,
/// l'ancienne est supprimée et la nouvelle insérée, comme Word.
pub fn edit_citation(docx: &mut Docx, citation: &str, items: &[CiteItem], tracked: bool, sig: &Signature) -> Result<Cited> {
    let style = doc_style(docx)?;
    if !items.is_empty() {
        check_items(items, &style)?;
    }
    let model = docx.model()?;
    let found = model.all_paragraphs().find_map(|p| {
        let mut at = 0usize;
        let mut span: Option<(usize, usize)> = None;
        let mut inside_ins: Option<u32> = None;
        for s in &p.segments {
            let removed = matches!(s.rev, Some("del" | "moveFrom"));
            let n = if removed { 0 } else { s.text.chars().count() };
            if s.cite.as_deref() == Some(citation) && !removed {
                span = Some(match span {
                    Some((a, _)) => (a, at + n),
                    None => (at, at + n),
                });
                if s.rev == Some("ins") {
                    inside_ins = s.change;
                }
            }
            at += n;
        }
        span.map(|sp| (p.id.clone(), sp, inside_ins))
    });
    let Some((paragraph, (start, end), ins)) = found else {
        return err(format!("citation {citation} introuvable"));
    };
    let ins_author = ins.and_then(|id| model.changes.iter().find(|c| c.id == id).map(|c| c.author.clone()));
    let fields = all_fields(docx)?;
    let Some(f) = fields.iter().find(|f| f.citation_id().as_deref() == Some(citation)).cloned() else {
        return err(format!("citation {citation} introuvable"));
    };
    let note = f.note;
    // Sans suivi, ou dans son propre ajout : réécrite en place (ou effacée).
    let in_place = !tracked || ins_author.as_deref() == Some(sig.author.as_str());
    if items.is_empty() {
        let changes = edit::replace_range(docx, &paragraph, start, end, "", tracked, sig)?.changes;
        refresh(docx, &style)?;
        return Ok(Cited { citation: citation.to_string(), text: String::new(), changes });
    }
    let numbers = numbering(&fields, Some(items));
    let text = render_citation(items, &style, &numbers);
    let instr = instr_json(citation, items, &text, note)?;
    let changes = if in_place {
        let src = docx.part(&f.part)?.unwrap_or_default();
        let edits = rewrite_in_place(&src, &f, &instr, &text);
        docx.set_part(&f.part, xml::splice(&src, edits)?);
        Vec::new()
    } else {
        if let Some(a) = ins_author {
            return err(format!("citation ajoutée en suivi par {a} : refuser son ajout plutôt que la modifier"));
        }
        let raw = field_xml(&instr, &text);
        let mut ch = edit::replace_range(docx, &paragraph, start, end, "", true, sig)?.changes;
        ch.extend(edit::insert_raw(docx, &paragraph, start, &raw, true, sig)?.changes);
        ch
    };
    refresh(docx, &style)?;
    Ok(Cited { citation: citation.to_string(), text: current_text(docx, citation)?.unwrap_or(text), changes })
}

fn bibliography_style(docx: &mut Docx) -> Result<String> {
    for name in ["Bibliography", "Bibliographie"] {
        if let Some(id) = crate::objects::style_id(docx, name)? {
            return Ok(id);
        }
    }
    // Comme Word : retrait suspendu d'un demi-pouce.
    if let Some(src) = docx.part(crate::objects::STYLES)? {
        let close = src.rfind("</w:styles>").ok_or_else(|| DocxError("styles.xml illisible".into()))?;
        let st = r#"<w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="37"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style>"#;
        docx.set_part(crate::objects::STYLES, format!("{}{st}{}", &src[..close], &src[close..]));
        return Ok("Bibliography".into());
    }
    Ok(String::new())
}

fn bib_paragraphs(entries: &[Vec<Run>], pstyle: &str, instr: &str) -> String {
    let ppr = if pstyle.is_empty() { String::new() } else { format!(r#"<w:pPr><w:pStyle w:val="{}"/></w:pPr>"#, escape_attr(pstyle)) };
    let run = |t: &str, i: bool| {
        let rpr = if i { "<w:rPr><w:i/><w:iCs/></w:rPr>" } else { "" };
        format!(r#"<w:r>{rpr}<w:t xml:space="preserve">{}</w:t></w:r>"#, escape_text(t))
    };
    let begin = format!(
        r#"<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">{}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>"#,
        escape_text(instr)
    );
    let end = r#"<w:r><w:fldChar w:fldCharType="end"/></w:r>"#;
    let rows: Vec<Vec<Run>> = if entries.is_empty() { vec![vec![("{Bibliographie}".into(), false)]] } else { entries.to_vec() };
    let n = rows.len();
    rows.iter()
        .enumerate()
        .map(|(k, e)| {
            let mut s = format!("<w:p>{ppr}");
            if k == 0 {
                s.push_str(&begin);
            }
            for (t, i) in e {
                s.push_str(&run(t, *i));
            }
            if k == n - 1 {
                s.push_str(end);
            }
            s.push_str("</w:p>");
            s
        })
        .collect()
}

/// Entrées de bibliographie de toutes les références citées.
fn entries(fields: &[FieldLoc], style: &DocStyle, bibl_json: Option<&Value>) -> Vec<Vec<Run>> {
    let numbers = numbering(fields, None);
    let mut seen: HashMap<String, CiteItem> = HashMap::new();
    for f in fields.iter().filter(|f| !f.bibl && !f.deleted) {
        if let Some(v) = f.json() {
            for it in items_of(&v).into_iter().filter(|it| it.data.is_some()) {
                seen.entry(ident(&it)).or_insert(it);
            }
        }
    }
    // Références retirées à la main dans Zotero (`omitted`) : on les respecte.
    let omitted: Vec<String> = bibl_json
        .and_then(|b| b.get("omitted"))
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|o| o.get("uris").and_then(Value::as_array).and_then(|u| u.first()).and_then(Value::as_str).map(str::to_string)).collect())
        .unwrap_or_default();
    let mut list: Vec<CiteItem> = seen.into_values().filter(|it| !it.uri.as_ref().is_some_and(|u| omitted.contains(u))).collect();
    if style.format == "numeric" {
        list.sort_by_key(|it| numbers.get(&ident(it)).copied().unwrap_or(usize::MAX));
    } else {
        let empty = json!({});
        let sort_key = |it: &CiteItem| {
            let d = it.data.as_ref().unwrap_or(&empty);
            let first = names(d).first().map(|n| family(n)).unwrap_or_else(|| d.get("title").and_then(Value::as_str).unwrap_or("").to_string());
            (first.to_lowercase(), year(d).unwrap_or_default(), d.get("title").and_then(Value::as_str).unwrap_or("").to_lowercase())
        };
        list.sort_by_key(sort_key);
    }
    list.iter().map(|it| bib_entry(it, style, numbers.get(&ident(it)).copied())).collect()
}

/// Pose la bibliographie après `after` (jamais en suivi : Zotero la refait).
pub fn insert_bibliography(docx: &mut Docx, after: &str) -> Result<usize> {
    let fields = all_fields(docx)?;
    if fields.iter().any(|f| f.bibl && !f.deleted) {
        return err("le document a déjà une bibliographie Zotero : l'actualiser plutôt");
    }
    let style = doc_style(docx)?;
    if !style.stored {
        write_prefs(docx, &style)?;
    }
    let pstyle = bibliography_style(docx)?;
    let list = entries(&fields, &style, None);
    let n = list.len();
    let xml_text = bib_paragraphs(&list, &pstyle, r#" ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY "#);
    let (story, src) = docx.story_src(after)?;
    let doc = xml::parse(&src)?;
    let t = edit::target(&src, &doc, after)?;
    let at = t.p_range.end;
    drop(doc);
    docx.set_part(&story.part, xml::splice(&src, vec![(at..at, xml_text)])?);
    Ok(n)
}

/// Recalcule le texte de toutes les citations (numéros, style) et la
/// bibliographie, sans suivi. Rend le nombre de champs réécrits.
pub fn refresh(docx: &mut Docx, style: &DocStyle) -> Result<usize> {
    let fields = all_fields(docx)?;
    if fields.is_empty() {
        return Ok(0);
    }
    let numbers = numbering(&fields, None);
    let mut by_part: HashMap<String, Vec<(Range<usize>, String)>> = HashMap::new();
    let mut touched = 0;
    for f in fields.iter().filter(|f| !f.bibl && !f.deleted) {
        let Some(mut v) = f.json() else { continue };
        let items = items_of(&v);
        if items.iter().any(|it| it.data.is_none()) {
            continue; // citation sans notice embarquée : laissée à Zotero
        }
        let text = render_citation(&items, style, &numbers);
        let plain = v.pointer("/properties/plainCitation").and_then(Value::as_str).unwrap_or("");
        let shown = shown_text(docx, f)?;
        if plain == text && shown == text {
            continue;
        }
        // Retouche manuelle dans Word (texte ≠ plainCitation) : on la garde.
        if !plain.is_empty() && shown != plain && v.pointer("/properties/dontUpdate").is_some() {
            continue;
        }
        v["properties"]["formattedCitation"] = json!(text);
        v["properties"]["plainCitation"] = json!(text);
        let instr = format!(" ADDIN ZOTERO_ITEM CSL_CITATION {} ", serde_json::to_string(&v).map_err(|e| DocxError(e.to_string()))?);
        let src = docx.part(&f.part)?.unwrap_or_default();
        by_part.entry(f.part.clone()).or_default().extend(rewrite_in_place(&src, f, &instr, &text));
        touched += 1;
    }
    // Bibliographie : paragraphes refaits d'un bloc.
    for f in fields.iter().filter(|f| f.bibl && !f.deleted) {
        let list = entries(&fields, style, f.json().as_ref());
        let src = docx.part(&f.part)?.unwrap_or_default();
        let pstyle = {
            let doc = xml::parse(&src)?;
            doc.descendants()
                .find(|n| n.range() == f.first_p)
                .and_then(|p| xml::w_child(p, "pPr"))
                .and_then(|ppr| xml::w_child(ppr, "pStyle"))
                .and_then(|s| w_attr(s, "val"))
                .map(str::to_string)
        };
        let pstyle = match pstyle {
            Some(s) => s,
            None => bibliography_style(docx)?,
        };
        let instr = f.instr.clone();
        let new = bib_paragraphs(&list, &pstyle, &instr);
        let range = f.first_p.start..f.last_p.end;
        if src[range.clone()] == new {
            continue;
        }
        by_part.entry(f.part.clone()).or_default().push((range, new));
        touched += 1;
    }
    for (part, edits) in by_part {
        let src = docx.part(&part)?.unwrap_or_default();
        docx.set_part(&part, xml::splice(&src, edits)?);
    }
    Ok(touched)
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

fn shown_text(docx: &mut Docx, f: &FieldLoc) -> Result<String> {
    let src = docx.part(&f.part)?.unwrap_or_default();
    Ok(f.result_t
        .iter()
        .map(|r| {
            let el = &src[r.clone()];
            let a = el.find('>').map(|i| i + 1).unwrap_or(el.len());
            let b = el.rfind("</").unwrap_or(el.len()).max(a);
            unescape(&el[a..b])
        })
        .collect())
}

/// Change le style du document et met tout à jour (hors suivi).
pub fn set_style(docx: &mut Docx, style: &StyleRef) -> Result<DocStyle> {
    let current = doc_style(docx)?;
    let format = style.format.clone().unwrap_or_else(|| guess_format(&style.id).to_string());
    if format == "note" {
        return err("style en notes de bas de page : pas encore pris en charge dans Atelier (choisir un style auteur-date ou numérique)");
    }
    let next = DocStyle { id: style.id.clone(), format, locale: style.locale.clone().or(current.locale), stored: true };
    write_prefs(docx, &next)?;
    refresh(docx, &next)?;
    Ok(next)
}

/// Le document a-t-il déjà une bibliographie Zotero ?
pub fn has_bibliography(docx: &mut Docx) -> Result<bool> {
    Ok(all_fields(docx)?.iter().any(|f| f.bibl && !f.deleted))
}

/// Remet à jour citations et bibliographie dans le style du document.
pub fn refresh_all(docx: &mut Docx) -> Result<usize> {
    let style = doc_style(docx)?;
    refresh(docx, &style)
}

/// Citations du document pour l'agent et le panneau : identifiant, texte,
/// clés citées.
#[derive(Debug, Serialize, Clone)]
pub struct CitationInfo {
    pub citation: String,
    pub text: String,
    pub items: Vec<CiteItem>,
    /// Étiquette courte de chaque référence (« Williamson & Menounos, 2021 »).
    pub labels: Vec<String>,
}

pub fn citations(docx: &mut Docx) -> Result<Vec<CitationInfo>> {
    let fields = all_fields(docx)?;
    let mut out = Vec::new();
    for f in fields.iter().filter(|f| !f.bibl && !f.deleted) {
        let Some(v) = f.json() else { continue };
        let Some(id) = v.get("citationID").and_then(Value::as_str) else { continue };
        let text = shown_text(docx, f)?;
        let l = lang(None);
        let mut labels = Vec::new();
        let items = items_of(&v)
            .into_iter()
            .map(|mut it| {
                labels.push(match &it.data {
                    Some(d) => format!("{}, {}", short_names(d, &l), year(d).unwrap_or_else(|| l.nd.into())),
                    None => it.key.clone(),
                });
                it.data = None;
                it
            })
            .collect();
        out.push(CitationInfo { citation: id.to_string(), text, items, labels });
    }
    Ok(out)
}

/// Clés à charger depuis Zotero pour une retouche (JSON brut, lots compris) :
/// les références sans notice embarquée.
pub fn keys_to_resolve(raw: &Value) -> Vec<String> {
    let mut out = Vec::new();
    walk_ops(raw, &mut |op| {
        if let Some(items) = op.get("items").and_then(Value::as_array) {
            for it in items {
                if it.get("data").is_none()
                    && let Some(k) = it.get("key").and_then(Value::as_str)
                    && !out.iter().any(|x| x == k) {
                        out.push(k.to_string());
                    }
            }
        }
    });
    out
}

/// Remplit `id`, `uri` et `data` des références d'une retouche avec les
/// notices chargées (`key` → `(id, uri, data)`).
pub fn fill(raw: &mut Value, notices: &HashMap<String, (i64, String, Value)>) -> Result<()> {
    let mut missing = None;
    walk_ops_mut(raw, &mut |op| {
        if let Some(items) = op.get_mut("items").and_then(Value::as_array_mut) {
            for it in items {
                if it.get("data").is_some() {
                    continue;
                }
                let Some(k) = it.get("key").and_then(Value::as_str).map(str::to_string) else { continue };
                match notices.get(&k) {
                    Some((id, uri, data)) => {
                        it["id"] = json!(id);
                        it["uri"] = json!(uri);
                        it["data"] = data.clone();
                    }
                    None => missing = Some(k),
                }
            }
        }
    });
    match missing {
        Some(k) => err(format!("notice Zotero {k} introuvable : chercher la bonne clé")),
        None => Ok(()),
    }
}

fn is_cite_op(v: &Value) -> bool {
    matches!(v.get("op").and_then(Value::as_str), Some("insert_citation" | "edit_citation"))
}

fn walk_ops(v: &Value, f: &mut dyn FnMut(&Value)) {
    if is_cite_op(v) {
        f(v);
    }
    if let Some(ops) = v.get("ops").and_then(Value::as_array) {
        for o in ops {
            walk_ops(o, f);
        }
    }
}

fn walk_ops_mut(v: &mut Value, f: &mut dyn FnMut(&mut Value)) {
    if is_cite_op(v) {
        f(v);
    }
    if let Some(ops) = v.get_mut("ops").and_then(Value::as_array_mut) {
        for o in ops {
            walk_ops_mut(o, f);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(key: &str, fam: &[&str], y: i64) -> CiteItem {
        let author: Vec<Value> = fam.iter().map(|f| json!({"family": f, "given": "Ann B."})).collect();
        CiteItem {
            key: key.into(),
            id: Some(1),
            uri: Some(format!("http://zotero.org/users/1/items/{key}")),
            data: Some(json!({"id": 1, "type": "article-journal", "title": "Glacier albedo.", "container-title": "The Cryosphere", "volume": "15", "issue": "2", "page": "1-20", "DOI": "10.5194/tc-15-1-2021", "author": author, "issued": {"date-parts": [[y, 3]]}})),
            ..Default::default()
        }
    }

    fn apa() -> DocStyle {
        DocStyle { id: DEFAULT_STYLE.into(), format: "author-date".into(), locale: None, stored: false }
    }

    #[test]
    fn rendu_auteur_date() {
        let mut b = item("B", &["Aubry-Wake", "Bertoncini", "Pomeroy"], 2022);
        b.locator = Some("4".into());
        let a = item("A", &["Williamson", "Menounos"], 2021);
        let t = render_citation(&[a.clone(), b], &apa(), &HashMap::new());
        assert_eq!(t, "(Williamson & Menounos, 2021; Aubry-Wake et al., 2022, p. 4)");
        let mut s = a.clone();
        s.suppress_author = true;
        s.prefix = Some("voir".into());
        assert_eq!(render_citation(&[s], &apa(), &HashMap::new()), "(voir 2021)");
        let fr = DocStyle { locale: Some("fr-CA".into()), ..apa() };
        assert_eq!(render_citation(&[a], &fr, &HashMap::new()), "(Williamson et Menounos, 2021)");
    }

    #[test]
    fn rendu_numerique_et_bibliographie() {
        let a = item("A", &["Williamson", "Menounos"], 2021);
        let st = DocStyle { format: "numeric".into(), ..apa() };
        let mut n = HashMap::new();
        n.insert(ident(&a), 3);
        assert_eq!(render_citation(&[a.clone()], &st, &n), "[3]");
        let e: String = bib_entry(&a, &apa(), None).into_iter().map(|(t, _)| t).collect();
        assert_eq!(e, "Williamson, A. B., & Menounos, A. B. (2021). Glacier albedo. The Cryosphere, 15(2), 1-20. https://doi.org/10.5194/tc-15-1-2021");
        let runs = bib_entry(&a, &apa(), None);
        assert!(runs.iter().any(|(t, i)| *i && t == "The Cryosphere"));
        let e: String = bib_entry(&a, &st, Some(3)).into_iter().map(|(t, _)| t).collect();
        assert_eq!(e, "[3] A. B. Williamson and A. B. Menounos, “Glacier albedo.,” The Cryosphere, vol. 15, no. 2, pp. 1-20, 2021, doi: 10.5194/tc-15-1-2021.");
    }

    #[test]
    fn familles_de_styles() {
        assert_eq!(guess_format("http://www.zotero.org/styles/apa"), "author-date");
        assert_eq!(guess_format("http://www.zotero.org/styles/the-cryosphere"), "author-date");
        assert_eq!(guess_format("http://www.zotero.org/styles/ieee"), "numeric");
        assert_eq!(guess_format("http://www.zotero.org/styles/nature"), "numeric");
        assert_eq!(guess_format("http://www.zotero.org/styles/chicago-note-bibliography"), "note");
    }

    #[test]
    fn retouche_enrichie_avec_les_notices() {
        let mut raw = json!({"op": "batch", "ops": [{"op": "insert_citation", "paragraph": "p0", "at": 3, "items": [{"key": "AAA"}, {"key": "BBB", "data": {}}]}]});
        assert_eq!(keys_to_resolve(&raw), vec!["AAA".to_string()]);
        let mut m = HashMap::new();
        m.insert("AAA".to_string(), (7, "http://zotero.org/users/1/items/AAA".to_string(), json!({"id": 7})));
        fill(&mut raw, &m).unwrap();
        assert_eq!(raw["ops"][0]["items"][0]["uri"], "http://zotero.org/users/1/items/AAA");
        let mut bad = json!({"op": "insert_citation", "paragraph": "p0", "at": 0, "items": [{"key": "ZZZ"}]});
        assert!(fill(&mut bad, &m).unwrap_err().0.contains("ZZZ"));
    }
}
