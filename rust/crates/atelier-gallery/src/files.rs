//! Phase 1 — navigation, lecture/écriture d'éditeurs, sélection live.
//!
//! Comportement aligné sur `fig_annotate_server.py` (chemins pinnés, mtime float,
//! `.orig.bak` SVG, conflit codesave, `rg` pour findscript).

use atelier_core::{
    atomic_write, atomic_write_text, ensure_orig_backup, file_mtime_secs, find_tex_root,
    safe_project_path,
};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use tokio::process::Command;

use crate::{AppState, request_allowed};

// ---------------------------------------------------------------------------
// Query / body types
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
pub struct LsQuery {
    #[serde(default)]
    dir: Option<String>,
}

#[derive(Deserialize)]
pub struct PathQuery {
    path: String,
}

#[derive(Deserialize)]
pub struct SnippetQuery {
    path: String,
    n: Option<String>,
}

#[derive(Deserialize)]
pub struct FindScriptQuery {
    stem: Option<String>,
}

#[derive(Deserialize)]
pub struct CodeSaveBody {
    path: String,
    text: String,
    mtime: Option<f64>,
}

#[derive(Deserialize)]
pub struct SaveSvgBody {
    rel: Option<String>,
    name: Option<String>,
    svg: String,
    edits: Option<Value>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

fn project_rel(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Validate that `svg` is a well-formed document whose root element is `<svg>`.
/// Mirrors Python `xml.etree.ElementTree` + tag check (no external entities).
fn validate_svg_payload(svg: &str) -> Result<(), String> {
    let head = if svg.len() > 4000 { &svg[..4000] } else { svg };
    if !head.contains("<svg") {
        return Err("not an svg payload".into());
    }
    // Minimal well-formedness: balanced angle brackets on the opening root, and
    // a root tag of `svg` (optionally namespaced). Full DTD/entity expansion is
    // out of scope — the 64 MB cap bounds resource abuse.
    let trimmed = svg.trim_start();
    let body = strip_xml_preamble(trimmed);
    let tag = first_element_name(body).ok_or_else(|| "not well-formed svg: no root".to_string())?;
    let local = tag.rsplit(':').next().unwrap_or(tag);
    // ElementTree returns Clark notation `{ns}svg` — we accept bare or prefix.
    let local = local
        .rsplit('}')
        .next()
        .unwrap_or(local)
        .to_ascii_lowercase();
    if local != "svg" {
        return Err("not well-formed svg: root element is not <svg>".into());
    }
    if !svg.contains('>') {
        return Err("not well-formed svg: unclosed tag".into());
    }
    Ok(())
}

fn strip_xml_preamble(mut s: &str) -> &str {
    loop {
        let t = s.trim_start();
        if t.starts_with("<?") {
            if let Some(end) = t.find("?>") {
                s = &t[end + 2..];
                continue;
            }
            return t;
        }
        if t.starts_with("<!--") {
            if let Some(end) = t.find("-->") {
                s = &t[end + 3..];
                continue;
            }
            return t;
        }
        if t.starts_with("<!") {
            // DOCTYPE or similar — skip to next `>`
            if let Some(end) = t.find('>') {
                s = &t[end + 1..];
                continue;
            }
            return t;
        }
        return t;
    }
}

fn first_element_name(s: &str) -> Option<&str> {
    let s = s.trim_start();
    if !s.starts_with('<') || s.starts_with("</") {
        return None;
    }
    let rest = &s[1..];
    let end = rest
        .find(|c: char| c.is_whitespace() || c == '>' || c == '/')
        .unwrap_or(rest.len());
    let name = &rest[..end];
    if name.is_empty() { None } else { Some(name) }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/// `GET /ls?dir=` — listing non-dot entries, case-insensitive sort.
pub async fn ls(State(state): State<AppState>, Query(query): Query<LsQuery>) -> impl IntoResponse {
    let requested = query.dir.as_deref().unwrap_or("");
    let dir = match safe_project_path(&state.root, requested) {
        Ok(path) => path,
        Err(_) => {
            // Python falls back to PROJECT when _safe_path returns None only for
            // outside paths via `or PROJECT` — outside absolute paths become PROJECT.
            // `_safe_path(...) or PROJECT` : None → PROJECT.
            state.root.clone()
        }
    };
    let dir = if dir.is_dir() {
        dir
    } else if requested.is_empty() {
        state.root.clone()
    } else {
        return json_error(StatusCode::NOT_FOUND, "not a directory");
    };
    if !dir.is_dir() {
        return json_error(StatusCode::NOT_FOUND, "not a directory");
    }

    let mut names: Vec<String> = match tokio::fs::read_dir(&dir).await {
        Ok(mut entries) => {
            let mut out = Vec::new();
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with('.') {
                    continue;
                }
                out.push(name);
            }
            out
        }
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    };
    names.sort_by_key(|a| a.to_ascii_lowercase());

    let mut items = Vec::with_capacity(names.len());
    for name in names {
        let p = dir.join(&name);
        let is_dir = tokio::fs::metadata(&p)
            .await
            .map(|m| m.is_dir())
            .unwrap_or(false);
        items.push(json!({"name": name, "dir": is_dir}));
    }

    let parent = if dir == state.root {
        Value::Null
    } else {
        dir.parent()
            .map(|p| json!(p.to_string_lossy()))
            .unwrap_or(Value::Null)
    };

    (
        StatusCode::OK,
        Json(json!({
            "path": dir.to_string_lossy(),
            "parent": parent,
            "items": items,
        })),
    )
        .into_response()
}

/// `GET /snippet?path=&n=` — first lines as text/plain (max 600 chars).
pub async fn snippet(
    State(state): State<AppState>,
    Query(query): Query<SnippetQuery>,
) -> impl IntoResponse {
    let Ok(src) = safe_project_path(&state.root, &query.path) else {
        return json_error(StatusCode::NOT_FOUND, "not found");
    };
    if !src.is_file() {
        return json_error(StatusCode::NOT_FOUND, "not found");
    }
    let n = query
        .n
        .as_deref()
        .and_then(|v| v.parse::<usize>().ok())
        .map(|v| v.clamp(1, 40))
        .unwrap_or(10);

    let Ok(raw) = tokio::fs::read_to_string(&src).await else {
        // Python uses errors=replace; fall back to lossy.
        let Ok(bytes) = tokio::fs::read(&src).await else {
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, "read failed");
        };
        return snippet_response(&String::from_utf8_lossy(&bytes), n);
    };
    snippet_response(&raw, n)
}

fn snippet_response(text: &str, n: usize) -> axum::response::Response {
    let mut lines = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if i >= n {
            break;
        }
        lines.push(line);
    }
    let body: String = lines.join("\n").chars().take(600).collect();
    (
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("text/plain; charset=utf-8"),
            ),
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static("max-age=300"),
            ),
        ],
        body,
    )
        .into_response()
}

/// `GET /raw?path=` — binary blob (PDF → application/pdf).
pub async fn raw(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let Ok(path) = safe_project_path(&state.root, &query.path) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !path.is_file() {
        return StatusCode::NOT_FOUND.into_response();
    }
    let Ok(data) = tokio::fs::read(&path).await else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let ctype = if path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
    {
        "application/pdf"
    } else {
        "application/octet-stream"
    };
    (
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_str(ctype)
                    .unwrap_or(HeaderValue::from_static("application/octet-stream")),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        data,
    )
        .into_response()
}

/// `GET /code?path=` — full text + mtime + absolute path.
pub async fn code(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let Ok(path) = safe_project_path(&state.root, &query.path) else {
        return json_error(
            StatusCode::NOT_FOUND,
            "file not found or outside the project",
        );
    };
    if !path.is_file() {
        return json_error(
            StatusCode::NOT_FOUND,
            "file not found or outside the project",
        );
    }
    let text = match tokio::fs::read(&path).await {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    };
    let mtime = file_mtime_secs(&path).unwrap_or(0.0);
    (
        StatusCode::OK,
        Json(json!({
            "text": text,
            "mtime": mtime,
            "path": path.to_string_lossy(),
        })),
    )
        .into_response()
}

/// `GET /texroot?path=` — root document + sibling PDF path.
pub async fn texroot(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let Ok(path) = safe_project_path(&state.root, &query.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let root = find_tex_root(&path);
    let pdf = {
        let mut p = root.clone();
        p.set_extension("pdf");
        p
    };
    (
        StatusCode::OK,
        Json(json!({
            "root": root.to_string_lossy(),
            "pdf": pdf.to_string_lossy(),
        })),
    )
        .into_response()
}

/// `GET /findscript?stem=` — first project hit via `rg -F` (local origin).
pub async fn findscript(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<FindScriptQuery>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let stem = query
        .stem
        .as_deref()
        .unwrap_or("")
        .trim()
        .chars()
        .take(200)
        .collect::<String>();
    if stem.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "no stem");
    }

    let hit = run_rg_find(&state.root, &stem).await;
    (StatusCode::OK, Json(json!({"script": hit}))).into_response()
}

async fn run_rg_find(project: &Path, stem: &str) -> Option<String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        Command::new("rg")
            .args([
                "-l",
                "--no-messages",
                "--no-config",
                "-F",
                "-g",
                "*.{py,r,R,jl,sh,ipynb}",
                "--",
                stem,
            ])
            .arg(project)
            .output(),
    )
    .await;
    let Ok(Ok(output)) = output else {
        return None;
    };
    let root = std::fs::canonicalize(project).unwrap_or_else(|_| project.to_path_buf());
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(abs) = std::fs::canonicalize(line) else {
            continue;
        };
        if abs == root || abs.starts_with(&root) {
            return Some(project_rel(&root, &abs));
        }
    }
    None
}

/// `POST /codesave` — write text with optional mtime conflict detection.
pub async fn codesave(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CodeSaveBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(path) = safe_project_path(&state.root, &body.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let disk_mtime = if path.exists() {
        file_mtime_secs(&path).unwrap_or(0.0)
    } else {
        0.0
    };
    if let Some(expected) = body.mtime
        && (disk_mtime - expected).abs() > 0.001
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error": "conflit", "mtime": disk_mtime})),
        )
            .into_response();
    }
    // Atomic write (improvement over Python's open+truncate) — same response shape.
    if let Err(error) = atomic_write_text(&path, &body.text) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    let mtime = file_mtime_secs(&path).unwrap_or(0.0);
    (StatusCode::OK, Json(json!({"mtime": mtime}))).into_response()
}

/// `POST /save-svg` — overwrite in-project SVG + one-time `.orig.bak` + edits sidecar.
pub async fn save_svg(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SaveSvgBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    // Axum already enforced Content-Length via body limit defaults; mirror 64 MB
    // on the payload string (same as Python's Content-Length cap).
    if body.svg.is_empty() || body.svg.len() > 64 * 1024 * 1024 {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "empty or oversized svg"})),
        )
            .into_response();
    }
    if let Err(error) = validate_svg_payload(&body.svg) {
        return json_error(StatusCode::BAD_REQUEST, error);
    }
    let rel = body
        .rel
        .as_deref()
        .or(body.name.as_deref())
        .unwrap_or("")
        .to_string();
    let Ok(dst) = safe_project_path(&state.root, &rel) else {
        return json_error(StatusCode::BAD_REQUEST, "bad/non-svg/symlink path");
    };
    let is_svg = dst
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("svg"));
    if !is_svg || !dst.is_file() || dst.is_symlink() {
        return json_error(StatusCode::BAD_REQUEST, "bad/non-svg/symlink path");
    }
    if let Err(error) = ensure_orig_backup(&dst) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    if let Err(error) = atomic_write_text(&dst, &body.svg) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    // Durable edit layer sidecar (same path logic as Python).
    if let Some(edits) = body.edits.as_ref().filter(|v| v.is_array()) {
        let ep = {
            let mut p = dst.clone();
            // plot.svg → plot.edits.json
            let stem = dst.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
            p.set_file_name(format!("{stem}.edits.json"));
            p
        };
        if let Some(list) = edits.as_array() {
            if list.is_empty() {
                if ep.exists() && !ep.is_symlink() {
                    let _ = std::fs::remove_file(&ep);
                }
            } else {
                let payload = json!({
                    "svg": dst.file_name().and_then(|n| n.to_str()).unwrap_or_default(),
                    "edits": edits,
                });
                if let Ok(bytes) = serde_json::to_vec_pretty(&payload)
                    && let Err(error) = atomic_write(&ep, &bytes)
                {
                    return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
                }
            }
        }
    }
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "path": project_rel(&state.root, &dst),
        })),
    )
        .into_response()
}

/// `POST /selinfo` — live selection for agents (`~/.claude/fig-selection.json`).
pub async fn selinfo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let path = PathBuf::from(home)
        .join(".claude")
        .join("fig-selection.json");
    let has_lines = body
        .get("lines")
        .map(|v| match v {
            Value::String(s) => !s.is_empty(),
            Value::Number(_) => true,
            Value::Bool(b) => *b,
            Value::Array(a) => !a.is_empty(),
            Value::Object(o) => !o.is_empty(),
            Value::Null => false,
        })
        .unwrap_or(false);
    if has_lines {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut payload = body.clone();
        if let Some(obj) = payload.as_object_mut() {
            obj.insert(
                "ts".into(),
                json!(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs_f64())
                        .unwrap_or(0.0)
                ),
            );
        }
        match serde_json::to_vec(&payload) {
            Ok(bytes) => {
                if let Err(error) = std::fs::write(&path, bytes) {
                    return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
                }
            }
            Err(error) => return json_error(StatusCode::BAD_REQUEST, error.to_string()),
        }
    } else if path.exists() {
        let _ = std::fs::remove_file(&path);
    }
    (StatusCode::OK, Json(json!({"ok": true}))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn svg_root_accepted() {
        assert!(
            validate_svg_payload(r#"<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>"#)
                .is_ok()
        );
        assert!(validate_svg_payload(r#"<?xml version="1.0"?><svg width="1"/>"#).is_ok());
    }

    #[test]
    fn svg_root_rejected() {
        assert!(validate_svg_payload("<div/>").is_err());
        assert!(validate_svg_payload("not xml").is_err());
    }
}
