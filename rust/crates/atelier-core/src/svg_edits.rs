//! Re-apply SVG editor deltas (matplotlib id / label text matching).
//! Port of `reapply_svg_edits.py` — pure string transforms, no shell.

use crate::CoreError;
use serde_json::{Map, Value};
use std::{collections::HashMap, fs, ops::Range, path::Path};

#[derive(Debug, Clone)]
pub struct ReapplyReport {
    pub applied: usize,
    pub total: usize,
    pub skipped: usize,
    pub missing: usize,
    pub missing_detail: Vec<String>,
}

/// Les quatre listes du calque v2, dans l'ordre du contrat `.edits.json`.
pub const V2_SECTIONS: [&str; 4] = ["transforms", "added", "removed", "styles"];

/// Calque de retouches lu depuis un `.edits.json`.
///
/// v1 (hérité) : une liste nue, ou `{"svg": …, "edits": [...]}` — seulement
/// des deltas de transformation. v2 : `{"version": 2, "transforms", "added",
/// "removed", "styles"}` à la racine, tel que l'éditeur SVG l'envoie et que
/// `POST /save-svg` l'écrit.
#[derive(Debug, Clone, PartialEq)]
pub enum Edits {
    Transforms(Vec<Value>),
    V2 {
        transforms: Vec<Value>,
        added: Vec<Value>,
        removed: Vec<Value>,
        styles: Vec<Value>,
    },
}

/// Vrai si `value` est un calque v2 : `version == 2`, ou l'une des quatre
/// listes présente (même reconnaissance que `load_edits` en Python).
pub fn is_v2(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    object.get("version").and_then(Value::as_f64) == Some(2.0)
        || V2_SECTIONS.iter().any(|key| object.contains_key(*key))
}

fn has_delta(edit: &Value) -> bool {
    edit.is_object()
        && edit
            .get("delta")
            .and_then(Value::as_str)
            .is_some_and(|delta| !delta.is_empty())
}

/// Normalise un `.edits.json` déjà décodé. Les entrées inutilisables (pas un
/// objet, delta vide, `props` vide) sont écartées, comme en Python.
pub fn parse_edits(parsed: &Value) -> Edits {
    if is_v2(parsed) {
        let section = |key: &str| -> Vec<Value> {
            parsed
                .get(key)
                .and_then(Value::as_array)
                .map(|list| list.iter().filter(|e| e.is_object()).cloned().collect())
                .unwrap_or_default()
        };
        return Edits::V2 {
            transforms: section("transforms")
                .into_iter()
                .filter(has_delta)
                .collect(),
            added: section("added"),
            removed: section("removed"),
            styles: section("styles")
                .into_iter()
                .filter(|e| {
                    e.get("props")
                        .and_then(Value::as_object)
                        .is_some_and(|props| !props.is_empty())
                })
                .collect(),
        };
    }
    let list = if let Some(edits) = parsed.get("edits").and_then(Value::as_array) {
        edits.clone()
    } else if let Some(arr) = parsed.as_array() {
        arr.clone()
    } else {
        Vec::new()
    };
    Edits::Transforms(list.into_iter().filter(has_delta).collect())
}

fn load_edits(path: &Path) -> Result<Edits, CoreError> {
    let raw = fs::read_to_string(path)?;
    let parsed: Value = serde_json::from_str(&raw)?;
    Ok(parse_edits(&parsed))
}

/// `{texte du libellé -> id}` pour les paires `<!-- libellé --> <g id="…">` de
/// matplotlib. Même règle que la regex Python
/// `<!--\s*(.*?)\s*-->\s*<\w+\s+id="([^"]+)"` : l'`id` doit être le PREMIER
/// attribut de la balise qui suit immédiatement le commentaire. Sinon le
/// libellé désignerait un élément plus loin dans le document, et un delta ou
/// une suppression tomberait sur le mauvais élément.
fn comment_id_map(raw: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let mut i = 0;
    while let Some(rel) = raw[i..].find("<!--") {
        let start = i + rel + 4;
        let Some(end) = raw[start..].find("-->") else {
            break;
        };
        let comment = raw[start..start + end].trim();
        let after = start + end + 3;
        if let Some(id) = leading_id_attribute(raw[after..].trim_start()) {
            map.entry(comment.to_string())
                .or_insert_with(|| id.to_string());
        }
        i = after;
    }
    map
}

/// Valeur de `id` si `text` commence par `<nom id="valeur"` (id en premier).
fn leading_id_attribute(text: &str) -> Option<&str> {
    let rest = text.strip_prefix('<')?;
    let name_len = rest
        .find(|c: char| !(c.is_alphanumeric() || c == '_'))
        .unwrap_or(rest.len());
    if name_len == 0 {
        return None;
    }
    let after_name = &rest[name_len..];
    let attrs = after_name.trim_start();
    if attrs.len() == after_name.len() {
        return None; // pas d'espace entre le nom et l'attribut
    }
    let value = attrs.strip_prefix("id=\"")?;
    let end = value.find('"')?;
    (end > 0).then(|| &value[..end])
}

fn find_open_tag(raw: &str, elid: &str) -> Option<Range<usize>> {
    let needle = format!("id=\"{elid}\"");
    let mut search = 0;
    while let Some(rel) = raw[search..].find(&needle) {
        let abs = search + rel;
        // Walk back to '<'
        let start = raw[..abs].rfind('<')?;
        let end = raw[abs..].find('>')? + abs + 1;
        let tag = &raw[start..end];
        // Prefer real id= not href
        if tag.contains(&needle) && !tag.contains(&format!("href=\"#{elid}\"")) {
            return Some(start..end);
        }
        search = abs + needle.len();
    }
    None
}

fn with_delta(tag: &str, delta: &str) -> (String, bool) {
    if let Some(start) = tag.find("transform=\"") {
        let value_start = start + "transform=\"".len();
        if let Some(rel_end) = tag[value_start..].find('"') {
            let value_end = value_start + rel_end;
            let fresh = tag[value_start..value_end].trim();
            let delta_compact = delta.replace(' ', "");
            let fresh_compact = fresh.replace(' ', "");
            if fresh_compact.starts_with(&delta_compact) {
                return (tag.to_string(), false);
            }
            let combined = format!("{delta} {fresh}").trim().to_string();
            let mut out = String::new();
            out.push_str(&tag[..value_start]);
            out.push_str(&combined);
            out.push_str(&tag[value_end..]);
            return (out, true);
        }
    }
    if let Some(stripped) = tag.strip_suffix("/>") {
        let base = stripped.trim_end();
        return (format!("{base} transform=\"{delta}\"/>"), true);
    }
    if let Some(stripped) = tag.strip_suffix('>') {
        let base = stripped.trim_end();
        return (format!("{base} transform=\"{delta}\">"), true);
    }
    (tag.to_string(), false)
}

/// Balise ouvrante visée par une retouche : par `id` matplotlib d'abord, puis
/// par libellé (même libellé, nouvel id). `Err` porte le détail de l'élément
/// introuvable — jamais de devinette.
fn match_open_tag(
    raw: &str,
    edit: &Value,
    by_text: &HashMap<String, String>,
) -> Result<Range<usize>, String> {
    let mut elid = edit
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let text = edit
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let mut range = if !elid.is_empty() {
        find_open_tag(raw, &elid)
    } else {
        None
    };
    if range.is_none()
        && !text.is_empty()
        && let Some(mapped) = by_text.get(&text)
    {
        elid = mapped.clone();
        range = find_open_tag(raw, &elid);
    }
    range.ok_or_else(|| format!("id={elid} text={text:?}"))
}

fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// Étendue de l'élément entier dont `open` est la balise ouvrante. Les balises
/// imbriquées de même nom sont équilibrées ; une balise auto-fermante est
/// l'élément lui-même ; un document déséquilibré ne rend que la balise.
fn element_span(raw: &str, open: Range<usize>) -> Range<usize> {
    let tag = &raw[open.clone()];
    if tag.ends_with("/>") {
        return open;
    }
    let name_len = tag[1..]
        .find(|c: char| !(c.is_alphanumeric() || matches!(c, '_' | ':' | '.' | '-')))
        .unwrap_or(tag.len() - 1);
    let name = &tag[1..1 + name_len];
    if name.is_empty() {
        return open;
    }
    let opener = format!("<{name}");
    let closer = format!("</{name}");
    let bytes = raw.as_bytes();
    let mut depth = 1usize;
    let mut i = open.end;
    while let Some(rel) = raw[i..].find('<') {
        let at = i + rel;
        let rest = &raw[at..];
        if let Some(tail) = rest.strip_prefix(&closer) {
            // `</nom\s*>` exactement : `</nomAutre>` ne ferme rien.
            let trimmed = tail.trim_start();
            if trimmed.starts_with('>') {
                depth -= 1;
                let end = at + rest.len() - trimmed.len() + 1;
                if depth == 0 {
                    return open.start..end;
                }
                i = end;
                continue;
            }
        } else if rest.starts_with(&opener)
            && bytes
                .get(at + opener.len())
                .is_some_and(|next| !is_word_byte(*next))
            && let Some(close) = rest.find('>')
        {
            if !rest[..=close].ends_with("/>") {
                depth += 1;
            }
            i = at + close + 1;
            continue;
        }
        i = at + 1;
    }
    open
}

fn xml_escape_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn xml_escape_attr(text: &str) -> String {
    xml_escape_text(text).replace('"', "&quot;")
}

/// Décode les entités d'une valeur d'attribut (les cinq nommées et les
/// références numériques). Le script Python fusionne le style sans décoder :
/// un `&quot;` existant y est coupé au `;` puis ré-échappé en `&amp;quot`. On
/// décode avant de fusionner pour ne pas abîmer un style déjà présent.
fn xml_unescape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let decoded = tail.find(';').and_then(|end| {
            let name = &tail[1..end];
            let ch = match name {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ => {
                    let code = if let Some(hex) =
                        name.strip_prefix("#x").or_else(|| name.strip_prefix("#X"))
                    {
                        u32::from_str_radix(hex, 16).ok()
                    } else {
                        name.strip_prefix('#').and_then(|dec| dec.parse::<u32>().ok())
                    };
                    code.and_then(char::from_u32)
                }
            };
            ch.map(|ch| (ch, end + 1))
        });
        match decoded {
            Some((ch, used)) => {
                out.push(ch);
                rest = &tail[used..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Valeur d'une propriété de style venue du JSON : une chaîne telle quelle,
/// tout le reste sous sa forme JSON (nombre, booléen).
fn prop_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        other => other.to_string(),
    }
}

/// `prop: val; …` → paires ordonnées ; un nom répété garde sa première place
/// et prend la dernière valeur.
fn parse_style(style: &str) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> = Vec::new();
    for part in style.split(';') {
        if let Some((key, value)) = part.split_once(':') {
            let key = key.trim();
            if !key.is_empty() {
                set_style(&mut pairs, key, value.trim());
            }
        }
    }
    pairs
}

fn set_style(pairs: &mut Vec<(String, String)>, key: &str, value: &str) {
    match pairs.iter_mut().find(|(name, _)| name == key) {
        Some(pair) => pair.1 = value.to_string(),
        None => pairs.push((key.to_string(), value.to_string())),
    }
}

/// Fusionne `props` dans le style `existing` : une propriété déjà présente est
/// remplacée sur place, les nouvelles s'ajoutent à la fin.
fn merge_style(existing: &str, props: &Map<String, Value>) -> String {
    let mut pairs = parse_style(existing);
    for (key, value) in props {
        set_style(&mut pairs, key, &prop_text(value));
    }
    pairs
        .iter()
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>()
        .join("; ")
}

/// Étendue de la valeur de l'attribut `style="…"` d'une balise ouvrante.
/// L'attribut doit suivre un blanc : `font-style="…"` n'est pas `style`.
fn style_value_range(tag: &str) -> Option<Range<usize>> {
    let needle = "style=\"";
    let bytes = tag.as_bytes();
    let mut search = 0;
    while let Some(rel) = tag[search..].find(needle) {
        let at = search + rel;
        let start = at + needle.len();
        if at > 0 && bytes[at - 1].is_ascii_whitespace() {
            let end = tag[start..].find('"')?;
            return Some(start..start + end);
        }
        search = start;
    }
    None
}

/// Fusionne `props` dans l'attribut `style` de la balise (créé s'il manque).
fn with_style(tag: &str, props: &Map<String, Value>) -> String {
    if let Some(value) = style_value_range(tag) {
        let merged = merge_style(&xml_unescape(&tag[value.clone()]), props);
        return format!(
            "{}{}{}",
            &tag[..value.start],
            xml_escape_attr(&merged),
            &tag[value.end..]
        );
    }
    let merged = xml_escape_attr(&merge_style("", props));
    if let Some(stripped) = tag.strip_suffix("/>") {
        return format!("{} style=\"{merged}\"/>", stripped.trim_end());
    }
    match tag.strip_suffix('>') {
        Some(stripped) => format!("{} style=\"{merged}\">", stripped.trim_end()),
        None => tag.to_string(),
    }
}

/// Style d'une forme nue (sans id ni libellé), repérée par l'ancêtre porteur
/// d'un id (`anchor`), le nom de balise (`tag`) et le rang (`index`, depuis 0)
/// parmi les descendants de même nom, dans l'ordre du document. `None` si
/// l'ancre ou le rang manque : l'entrée est alors signalée, jamais devinée.
fn apply_anchored_style(raw: &str, edit: &Value, props: &Map<String, Value>) -> Option<String> {
    let anchor = edit.get("anchor").and_then(Value::as_str)?;
    let tag = edit.get("tag").and_then(Value::as_str)?.trim();
    let index = usize::try_from(edit.get("index").and_then(Value::as_u64)?).ok()?;
    if anchor.is_empty() || tag.is_empty() {
        return None;
    }
    let open = find_open_tag(raw, anchor)?;
    let span = element_span(raw, open.clone());
    // Descendants seulement : on cherche après la balise ouvrante de l'ancre.
    let inside = &raw[open.end..span.end];
    let needle = format!("<{tag}");
    let mut seen = 0usize;
    let mut search = 0;
    while let Some(rel) = inside[search..].find(&needle) {
        let at = search + rel;
        let next = at + needle.len();
        // Le caractère suivant ne doit pas prolonger le nom : `<text` ne
        // désigne pas `<textPath`.
        if inside
            .as_bytes()
            .get(next)
            .is_some_and(|byte| !byte.is_ascii_alphanumeric())
        {
            if seen == index {
                let start = open.end + at;
                let end = start + raw[start..].find('>')? + 1;
                let styled = with_style(&raw[start..end], props);
                return Some(format!("{}{styled}{}", &raw[..start], &raw[end..]));
            }
            seen += 1;
        }
        search = next;
    }
    None
}

/// Élément `<text>` neuf pour une entrée `added` (id, x, y, style et
/// transform sont facultatifs).
fn build_added(edit: &Value) -> String {
    let mut attrs = String::new();
    if let Some(id) = edit
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
    {
        attrs.push_str(&format!(" id=\"{}\"", xml_escape_attr(id)));
    }
    for key in ["x", "y"] {
        if let Some(value) = edit.get(key).filter(|value| !value.is_null()) {
            attrs.push_str(&format!(
                " {key}=\"{}\"",
                xml_escape_attr(&prop_text(value))
            ));
        }
    }
    for key in ["style", "transform"] {
        let value = edit.get(key).and_then(Value::as_str).unwrap_or("").trim();
        if !value.is_empty() {
            attrs.push_str(&format!(" {key}=\"{}\"", xml_escape_attr(value)));
        }
    }
    let content = edit
        .get("content")
        .filter(|value| !value.is_null())
        .map(prop_text)
        .unwrap_or_default();
    format!("<text{attrs}>{}</text>", xml_escape_text(&content))
}

/// Apply editor deltas onto SVG source; returns patched text + report.
pub fn reapply(raw: &str, edits: &[Value]) -> (String, ReapplyReport) {
    let by_text = comment_id_map(raw);
    let mut out = raw.to_string();
    let mut applied = 0usize;
    let mut skipped = 0usize;
    let mut missing_detail = Vec::new();
    for edit in edits {
        let delta = edit
            .get("delta")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if delta.is_empty() {
            continue;
        }
        let range = match match_open_tag(&out, edit, &by_text) {
            Ok(range) => range,
            Err(detail) => {
                missing_detail.push(detail);
                continue;
            }
        };
        let tag = &out[range.clone()];
        let (new_tag, changed) = with_delta(tag, delta);
        if !changed {
            skipped += 1;
            continue;
        }
        out.replace_range(range, &new_tag);
        applied += 1;
    }
    let total = edits.len();
    (
        out,
        ReapplyReport {
            applied,
            total,
            skipped,
            missing: missing_detail.len(),
            missing_detail,
        },
    )
}

/// Réapplique un calque complet. v1 : les deltas seuls. v2, dans l'ordre du
/// contrat : transformations → styles → suppressions → ajouts. Tout élément
/// introuvable est rapporté dans `missing_detail`, le reste est appliqué.
pub fn reapply_edits(raw: &str, edits: &Edits) -> (String, ReapplyReport) {
    let (transforms, added, removed, styles) = match edits {
        Edits::Transforms(list) => return reapply(raw, list),
        Edits::V2 {
            transforms,
            added,
            removed,
            styles,
        } => (transforms, added, removed, styles),
    };
    // Les ids et libellés ne bougent pas pendant les passes qui suivent.
    let by_text = comment_id_map(raw);
    let (mut out, mut report) = reapply(raw, transforms);

    for edit in styles {
        let Some(props) = edit.get("props").and_then(Value::as_object) else {
            continue;
        };
        if edit
            .get("anchor")
            .and_then(Value::as_str)
            .is_some_and(|anchor| !anchor.is_empty())
        {
            match apply_anchored_style(&out, edit, props) {
                Some(patched) => {
                    out = patched;
                    report.applied += 1;
                }
                None => report.missing_detail.push(format!(
                    "style anchor={} tag={} index={}",
                    edit.get("anchor").map(prop_text).unwrap_or_default(),
                    edit.get("tag").map(prop_text).unwrap_or_default(),
                    edit.get("index").map(prop_text).unwrap_or_default(),
                )),
            }
            continue;
        }
        match match_open_tag(&out, edit, &by_text) {
            Ok(range) => {
                let styled = with_style(&out[range.clone()], props);
                out.replace_range(range, &styled);
                report.applied += 1;
            }
            Err(detail) => report.missing_detail.push(format!("style {detail}")),
        }
    }

    for edit in removed {
        match match_open_tag(&out, edit, &by_text) {
            Ok(range) => {
                let span = element_span(&out, range);
                out.replace_range(span, "");
                report.applied += 1;
            }
            Err(detail) => report.missing_detail.push(format!("removed {detail}")),
        }
    }

    if !added.is_empty() {
        // Avant `</svg>` : les textes ajoutés héritent de l'espace de noms.
        let fragments: String = added.iter().map(build_added).collect();
        let at = out.rfind("</svg>").unwrap_or(out.len());
        out.insert_str(at, &fragments);
        report.applied += added.len();
    }

    report.total = transforms.len() + added.len() + removed.len() + styles.len();
    report.missing = report.missing_detail.len();
    (out, report)
}

/// Load edits JSON next to `svg` (or explicit path) and rewrite SVG.
pub fn reapply_file(
    svg_path: &Path,
    edits_path: Option<&Path>,
    output: Option<&Path>,
) -> Result<ReapplyReport, CoreError> {
    let default_edits = svg_path.with_extension("edits.json");
    // Prefer stem.edits.json: plot.svg → plot.edits.json
    let stem_edits = {
        let stem = svg_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("file");
        svg_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(format!("{stem}.edits.json"))
    };
    let edits_file = edits_path.map(Path::to_path_buf).unwrap_or_else(|| {
        if stem_edits.is_file() {
            stem_edits
        } else {
            default_edits
        }
    });
    if !edits_file.is_file() {
        return Ok(ReapplyReport {
            applied: 0,
            total: 0,
            skipped: 0,
            missing: 0,
            missing_detail: Vec::new(),
        });
    }
    let edits = load_edits(&edits_file)?;
    let raw = fs::read_to_string(svg_path)?;
    let (patched, report) = reapply_edits(&raw, &edits);
    let out = output.unwrap_or(svg_path);
    crate::atomic_write_text(out, &patched)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Le SVG et les cas viennent de `gallery/tests/test_reapply_edits.py` :
    /// le port Rust doit produire les mêmes sorties que la référence Python.
    const SVG: &str = concat!(
        "<?xml version=\"1.0\"?>\n",
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\">\n",
        " <!-- x axis label -->\n",
        " <g id=\"label_x\" transform=\"translate(10 20)\"><text style=\"font: 12px sans\">X axis</text></g>\n",
        " <!-- title -->\n",
        " <text id=\"title_1\" style=\"fill: #000; font: 14px sans\">My Title</text>\n",
        " <!-- legend box -->\n",
        " <g id=\"legend_1\"><rect x=\"0\" y=\"0\" width=\"30\" height=\"20\"/></g>\n",
        "</svg>\n",
    );

    const ANCHOR_SVG: &str = concat!(
        "<?xml version=\"1.0\"?>\n",
        "<svg xmlns=\"http://www.w3.org/2000/svg\">\n",
        " <g id=\"legend_1\">\n",
        "  <path d=\"M0 0h10\"/>\n",
        "  <path d=\"M0 5h10\"/>\n",
        " </g>\n",
        " <textPath id=\"tp\" href=\"#p\">not a text tag</textPath>\n",
        "</svg>\n",
    );

    fn v2_edits() -> Value {
        json!({
            "version": 2,
            "transforms": [{"id": "label_x", "text": "x axis label", "delta": "translate(3,4) "}],
            "styles": [{"id": "title_1", "text": "title", "props": {"fill": "#c00", "font-size": "20px"}}],
            "removed": [{"id": "legend_1", "text": "legend box"}],
            "added": [{"id": "added_text_1", "x": 120.5, "y": 88.2, "content": "New Label",
                       "style": "font: 12px sans-serif; fill: #000", "transform": ""}],
        })
    }

    #[test]
    fn reapply_prepends_transform() {
        let svg = r#"<svg><g id="text_1" transform="scale(1)"></g></svg>"#;
        let edits = vec![json!({"id": "text_1", "delta": "translate(10,20)", "text": "A"})];
        let (out, report) = reapply(svg, &edits);
        assert_eq!(report.applied, 1);
        assert!(out.contains("translate(10,20) scale(1)"));
    }

    #[test]
    fn reapply_is_idempotent() {
        let svg = r#"<svg><g id="t" transform="translate(1,2) scale(1)"></g></svg>"#;
        let edits = vec![json!({"id": "t", "delta": "translate(1,2)"})];
        let (out, report) = reapply(svg, &edits);
        assert_eq!(report.skipped, 1);
        assert_eq!(out, svg);
    }

    #[test]
    fn une_liste_nue_et_une_liste_enveloppee_restent_des_transformations() {
        let bare = json!([{"id": "label_x", "text": "x axis label", "delta": "translate(3,4) "}]);
        let wrapped = json!({"svg": "fig.svg", "edits": [{"id": "label_x", "delta": "translate(1,1) "}]});
        for (parsed, expected) in [
            (bare, "transform=\"translate(3,4)  translate(10 20)\""),
            (wrapped, "transform=\"translate(1,1)  translate(10 20)\""),
        ] {
            let edits = parse_edits(&parsed);
            assert!(matches!(edits, Edits::Transforms(ref list) if list.len() == 1));
            let (out, report) = reapply_edits(SVG, &edits);
            assert_eq!((report.applied, report.missing), (1, 0));
            assert!(out.contains(expected), "{out}");
        }
    }

    #[test]
    fn le_libelle_retrouve_un_element_dont_l_id_a_change() {
        let edits = vec![json!({"id": "gone_id", "text": "x axis label", "delta": "translate(5,5) "})];
        let (out, report) = reapply(SVG, &edits);
        assert_eq!((report.applied, report.missing), (1, 0));
        assert!(out.contains("translate(5,5)  translate(10 20)"));
    }

    #[test]
    fn un_libelle_ne_designe_que_la_balise_qui_le_suit() {
        // Le commentaire précède un groupe SANS id : il ne doit pas désigner
        // le premier id rencontré plus loin (ici `other`).
        let svg = "<svg><!-- tick --><g transform=\"scale(1)\"/><g id=\"other\"/></svg>";
        assert!(comment_id_map(svg).is_empty());
        let edits = vec![json!({"id": "gone", "text": "tick", "delta": "translate(1,1)"})];
        let (out, report) = reapply(svg, &edits);
        assert_eq!((report.applied, report.missing), (0, 1));
        assert_eq!(out, svg);
    }

    #[test]
    fn un_calque_v2_est_reconnu_a_la_racine() {
        let Edits::V2 {
            transforms,
            added,
            removed,
            styles,
        } = parse_edits(&v2_edits())
        else {
            panic!("calque v2 attendu");
        };
        assert_eq!(
            (transforms.len(), added.len(), removed.len(), styles.len()),
            (1, 1, 1, 1)
        );
        // Sans `version`, une seule des quatre listes suffit.
        assert!(is_v2(&json!({"styles": []})));
        assert!(!is_v2(&json!({"svg": "fig.svg", "edits": []})));
        assert!(!is_v2(&json!([])));
    }

    #[test]
    fn un_calque_v2_complet_est_reapplique() {
        let (out, report) = reapply_edits(SVG, &parse_edits(&v2_edits()));
        assert_eq!(report.missing, 0, "{:?}", report.missing_detail);
        assert_eq!((report.applied, report.total), (4, 4));

        // transformation : delta préfixé à la transformation existante
        assert!(out.contains("transform=\"translate(3,4)  translate(10 20)\""));

        // style : `fill` remplacé sur place, `font` conservé, nouvelle clé ajoutée
        assert!(out.contains("style=\"fill: #c00; font: 14px sans; font-size: 20px\""), "{out}");

        // suppression : le groupe de légende a disparu, enfant compris
        assert!(!out.contains("id=\"legend_1\""));
        assert!(!out.contains("<rect"));

        // ajout : un <text> neuf avant </svg>
        assert!(out.contains(
            "<text id=\"added_text_1\" x=\"120.5\" y=\"88.2\" style=\"font: 12px sans-serif; fill: #000\">New Label</text></svg>"
        ), "{out}");

        // Sortie de `reapply_svg_edits.py` sur le même calque, à l'octet près.
        let python = concat!(
            "<?xml version=\"1.0\"?>\n",
            "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\">\n",
            " <!-- x axis label -->\n",
            " <g id=\"label_x\" transform=\"translate(3,4)  translate(10 20)\"><text style=\"font: 12px sans\">X axis</text></g>\n",
            " <!-- title -->\n",
            " <text id=\"title_1\" style=\"fill: #c00; font: 14px sans; font-size: 20px\">My Title</text>\n",
            " <!-- legend box -->\n",
            " \n",
            "<text id=\"added_text_1\" x=\"120.5\" y=\"88.2\" style=\"font: 12px sans-serif; fill: #000\">New Label</text></svg>\n",
        );
        assert_eq!(out, python);
    }

    #[test]
    fn une_suppression_introuvable_est_signalee_sans_bloquer_le_reste() {
        let mut edits = v2_edits();
        edits["removed"] = json!([{"id": "nope", "text": "not here"}]);
        let (out, report) = reapply_edits(SVG, &parse_edits(&edits));
        assert_eq!(report.missing, 1);
        assert!(out.contains("id=\"legend_1\""));
        assert!(out.contains("id=\"added_text_1\""));
    }

    #[test]
    fn la_fusion_de_style_garde_l_ordre_et_remplace_sur_place() {
        assert_eq!(
            parse_style("a: 1; b:2"),
            vec![("a".to_string(), "1".to_string()), ("b".to_string(), "2".to_string())]
        );
        let props = json!({"fill": "#c00", "y": "2"});
        assert_eq!(
            merge_style("fill: #000; x: 1", props.as_object().unwrap()),
            "fill: #c00; x: 1; y: 2"
        );
    }

    #[test]
    fn un_style_existant_avec_entites_n_est_pas_abime() {
        let tag = "<text font-style=\"italic\" style=\"font-family: &quot;DejaVu Sans&quot;; fill: #000\">";
        let props = json!({"fill": "#c00"});
        assert_eq!(
            with_style(tag, props.as_object().unwrap()),
            "<text font-style=\"italic\" style=\"font-family: &quot;DejaVu Sans&quot;; fill: #c00\">"
        );
    }

    #[test]
    fn seule_la_forme_du_rang_demande_est_stylee() {
        let edits = json!({"version": 2, "styles": [
            {"id": null, "text": null, "anchor": "legend_1", "tag": "path",
             "index": 1, "props": {"stroke": "#c00"}}]});
        let (out, report) = reapply_edits(ANCHOR_SVG, &parse_edits(&edits));
        assert_eq!((report.applied, report.missing), (1, 0));
        assert!(out.contains("<path d=\"M0 0h10\"/>"), "{out}");
        assert!(out.contains("<path d=\"M0 5h10\" style=\"stroke: #c00\"/>"), "{out}");
    }

    #[test]
    fn une_ancre_text_ne_designe_pas_textpath() {
        let edits = json!({"version": 2, "styles": [
            {"id": null, "text": null, "anchor": "legend_1", "tag": "text",
             "index": 0, "props": {"fill": "#c00"}}]});
        let (out, report) = reapply_edits(ANCHOR_SVG, &parse_edits(&edits));
        assert_eq!((report.applied, report.missing), (0, 1));
        assert_eq!(out, ANCHOR_SVG);
    }

    #[test]
    fn une_ancre_absente_est_signalee_sans_rien_modifier() {
        let edits = json!({"version": 2, "styles": [
            {"id": null, "text": null, "anchor": "nope", "tag": "path",
             "index": 0, "props": {"stroke": "#c00"}}]});
        let (out, report) = reapply_edits(ANCHOR_SVG, &parse_edits(&edits));
        assert_eq!((report.applied, report.missing), (0, 1));
        assert_eq!(out, ANCHOR_SVG);
    }

    #[test]
    fn une_suppression_equilibre_les_balises_imbriquees_de_meme_nom() {
        let svg = "<svg><g id=\"a\"><g><g/></g><gx/></g><g id=\"b\"/></svg>";
        let edits = json!({"version": 2, "removed": [{"id": "a"}]});
        let (out, report) = reapply_edits(svg, &parse_edits(&edits));
        assert_eq!((report.applied, report.missing), (1, 0));
        assert_eq!(out, "<svg><g id=\"b\"/></svg>");
    }

    #[test]
    fn reapply_file_lit_un_calque_v2_a_cote_de_la_figure() {
        let dir = tempfile::tempdir().unwrap();
        let svg = dir.path().join("fig.svg");
        fs::write(&svg, SVG).unwrap();
        fs::write(dir.path().join("fig.edits.json"), v2_edits().to_string()).unwrap();
        let report = reapply_file(&svg, None, None).unwrap();
        assert_eq!((report.applied, report.total, report.missing), (4, 4, 0));
        let out = fs::read_to_string(&svg).unwrap();
        assert!(out.contains("id=\"added_text_1\""));
        assert!(!out.contains("id=\"legend_1\""));
    }
}
