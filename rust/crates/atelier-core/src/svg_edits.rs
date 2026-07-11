//! Re-apply SVG editor deltas (matplotlib id / label text matching).
//! Port of `reapply_svg_edits.py` — pure string transforms, no shell.

use crate::CoreError;
use serde_json::Value;
use std::{collections::HashMap, fs, path::Path};

#[derive(Debug, Clone)]
pub struct ReapplyReport {
    pub applied: usize,
    pub total: usize,
    pub skipped: usize,
    pub missing: usize,
    pub missing_detail: Vec<String>,
}

fn load_edits(path: &Path) -> Result<Vec<Value>, CoreError> {
    let raw = fs::read_to_string(path)?;
    let parsed: Value = serde_json::from_str(&raw)?;
    let list = if let Some(edits) = parsed.get("edits").and_then(Value::as_array) {
        edits.clone()
    } else if let Some(arr) = parsed.as_array() {
        arr.clone()
    } else {
        Vec::new()
    };
    Ok(list
        .into_iter()
        .filter(|e| e.is_object() && e.get("delta").and_then(Value::as_str).is_some())
        .collect())
}

fn comment_id_map(raw: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i + 4 < bytes.len() {
        if &bytes[i..i + 4] == b"<!--" {
            if let Some(end) = raw[i..].find("-->") {
                let comment = raw[i + 4..i + end].trim();
                let after = &raw[i + end + 3..];
                let after_trim = after.trim_start();
                if let Some(id_pos) = after_trim.find("id=\"") {
                    let id_start = id_pos + 4;
                    if let Some(id_end) = after_trim[id_start..].find('"') {
                        let id = &after_trim[id_start..id_start + id_end];
                        map.entry(comment.to_string())
                            .or_insert_with(|| id.to_string());
                    }
                }
                i += end + 3;
                continue;
            }
        }
        i += 1;
    }
    map
}

fn find_open_tag<'a>(raw: &'a str, elid: &str) -> Option<std::ops::Range<usize>> {
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
    if tag.ends_with("/>") {
        let base = tag[..tag.len() - 2].trim_end();
        return (format!("{base} transform=\"{delta}\"/>"), true);
    }
    if tag.ends_with('>') {
        let base = tag[..tag.len() - 1].trim_end();
        return (format!("{base} transform=\"{delta}\">"), true);
    }
    (tag.to_string(), false)
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
            find_open_tag(&out, &elid)
        } else {
            None
        };
        if range.is_none() && !text.is_empty() {
            if let Some(mapped) = by_text.get(&text) {
                elid = mapped.clone();
                range = find_open_tag(&out, &elid);
            }
        }
        let Some(range) = range else {
            missing_detail.push(format!("id={elid} text={text:?}"));
            continue;
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

/// Load edits JSON next to `svg` (or explicit path) and rewrite SVG.
pub fn reapply_file(
    svg_path: &Path,
    edits_path: Option<&Path>,
    output: Option<&Path>,
) -> Result<ReapplyReport, CoreError> {
    let default_edits = svg_path.with_extension("edits.json");
    // Prefer stem.edits.json: plot.svg → plot.edits.json
    let stem_edits = {
        let stem = svg_path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        svg_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(format!("{stem}.edits.json"))
    };
    let edits_file = edits_path
        .map(Path::to_path_buf)
        .unwrap_or_else(|| {
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
    let (patched, report) = reapply(&raw, &edits);
    let out = output.unwrap_or(svg_path);
    crate::atomic_write_text(out, &patched)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
}
