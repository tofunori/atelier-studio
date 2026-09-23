//! Phase 4 — LaTeX, PDF, annotations documentaires, export PNG.
//!
//! Outils externes en argv séparé (jamais de shell) : latexmk/tectonic, synctex,
//! rsvg-convert, ruff. Chemins pinnés sous le projet.

use atelier_core::{atomic_write, atomic_write_text, find_tex_root, safe_project_path};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use fs2::FileExt;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    fs::OpenOptions,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::process::Command;

use crate::{AppState, request_allowed};

// ---------------------------------------------------------------------------
// Tool discovery
// ---------------------------------------------------------------------------

fn which(bin: &str) -> Option<PathBuf> {
    std::process::Command::new("which")
        .arg(bin)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

/// Ordre de fallback : chemin MacTeX Python → PATH → (compile) tectonic.
fn latexmk_bin() -> Option<PathBuf> {
    const FIXED: &str = "/Library/TeX/texbin/latexmk";
    if Path::new(FIXED).is_file() {
        return Some(PathBuf::from(FIXED));
    }
    which("latexmk")
}

fn tectonic_bin() -> Option<PathBuf> {
    which("tectonic")
}

fn synctex_bin() -> Option<PathBuf> {
    const FIXED: &str = "/Library/TeX/texbin/synctex";
    if Path::new(FIXED).is_file() {
        return Some(PathBuf::from(FIXED));
    }
    which("synctex")
}

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

/// Neutralise l'injection d'options argv pour latexmk/tectonic (plan 063,
/// finding SEC-07) : un nom de fichier commençant par `-` (ex. `-evil.tex`)
/// serait interprété comme une option par les deux outils plutôt qu'un nom
/// de fichier. `current_dir` est déjà posé sur `cwd` ; préfixer `./` suffit à
/// lever l'ambiguïté pour n'importe quel basename, y compris hostile.
fn prefix_argv_basename(basename: &str) -> String {
    format!("./{basename}")
}

/// Ceinture-bretelles au-dessus de `prefix_argv_basename` (qui suffirait déjà
/// seul à neutraliser l'injection) : refuse explicitement, avec un message
/// clair, tout basename commençant par `-` avant même de construire l'argv.
fn safe_argv_basename(basename: &str) -> Result<String, String> {
    if basename.starts_with('-') {
        return Err(format!(
            "nom de fichier invalide (commence par '-'): {basename}"
        ));
    }
    Ok(prefix_argv_basename(basename))
}

fn project_rel(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

// ---------------------------------------------------------------------------
// POST /compile
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CompileBody {
    path: String,
}

pub async fn compile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CompileBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(p) = safe_project_path(&state.root, &body.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let root = find_tex_root(&p);
    let pdf = {
        let mut p = root.clone();
        p.set_extension("pdf");
        p
    };
    let cwd = root.parent().unwrap_or_else(|| Path::new("."));
    let raw_basename = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("main.tex");
    let basename = match safe_argv_basename(raw_basename) {
        Ok(b) => b,
        Err(err) => {
            return (StatusCode::OK, Json(json!({"ok": false, "error": err}))).into_response();
        }
    };

    // 1) latexmk (parité Python) 2) tectonic
    if let Some(latexmk) = latexmk_bin() {
        let mut cmd = Command::new(&latexmk);
        cmd.args([
            "-pdf",
            "-synctex=1",
            "-g",
            "-interaction=nonstopmode",
            "-halt-on-error",
            basename.as_str(),
        ])
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
        #[cfg(unix)]
        unsafe {
            cmd.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
        return match tokio::time::timeout(Duration::from_secs(180), cmd.output()).await {
            Ok(Ok(output)) => {
                let log = format!(
                    "{}{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                let ok = output.status.success() && pdf.is_file();
                let err = if ok {
                    String::new()
                } else {
                    compile_error_excerpt(&log)
                };
                (
                    StatusCode::OK,
                    Json(json!({
                        "ok": ok,
                        "pdf": if ok { json!(pdf.to_string_lossy()) } else { Value::Null },
                        "root": root.to_string_lossy(),
                        "error": err,
                    })),
                )
                    .into_response()
            }
            Ok(Err(error)) => (
                StatusCode::OK,
                Json(json!({
                    "ok": false,
                    "error": error.to_string(),
                })),
            )
                .into_response(),
            Err(_) => (
                StatusCode::OK,
                Json(json!({"ok": false, "error": "compilation > 180 s"})),
            )
                .into_response(),
        };
    }

    if let Some(tectonic) = tectonic_bin() {
        let mut cmd = Command::new(&tectonic);
        cmd.args(["-X", "compile", basename.as_str()])
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        return match tokio::time::timeout(Duration::from_secs(180), cmd.output()).await {
            Ok(Ok(output)) => {
                let log = format!(
                    "{}{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
                let ok = output.status.success() && pdf.is_file();
                let err = if ok {
                    String::new()
                } else {
                    compile_error_excerpt(&log)
                };
                (
                    StatusCode::OK,
                    Json(json!({
                        "ok": ok,
                        "pdf": if ok { json!(pdf.to_string_lossy()) } else { Value::Null },
                        "root": root.to_string_lossy(),
                        "error": err,
                    })),
                )
                    .into_response()
            }
            Ok(Err(error)) => (
                StatusCode::OK,
                Json(json!({"ok": false, "error": error.to_string()})),
            )
                .into_response(),
            Err(_) => (
                StatusCode::OK,
                Json(json!({"ok": false, "error": "compilation > 180 s"})),
            )
                .into_response(),
        };
    }

    (
        StatusCode::OK,
        Json(json!({
            "ok": false,
            "error": "latexmk not found at /Library/TeX/texbin/latexmk — install MacTeX or TeX Live"
        })),
    )
        .into_response()
}

fn compile_error_excerpt(log: &str) -> String {
    let lines: Vec<&str> = log
        .lines()
        .filter(|l| l.starts_with('!') || l.contains("Error"))
        .take(8)
        .collect();
    if !lines.is_empty() {
        return lines.join("\n");
    }
    let count = log.chars().count();
    log.chars().skip(count.saturating_sub(1500)).collect()
}

// ---------------------------------------------------------------------------
// POST /synctex
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SynctexBody {
    tex: String,
    pdf: String,
    dir: String,
    line: Option<Value>,
    col: Option<Value>,
    page: Option<Value>,
    x: Option<Value>,
    y: Option<Value>,
}

fn value_as_i64(v: Option<&Value>) -> Option<i64> {
    v.and_then(|val| {
        val.as_i64()
            .or_else(|| val.as_f64().map(|f| f as i64))
            .or_else(|| val.as_str().and_then(|s| s.parse().ok()))
    })
}

fn value_as_f64(v: Option<&Value>) -> Option<f64> {
    v.and_then(|val| {
        val.as_f64()
            .or_else(|| val.as_i64().map(|i| i as f64))
            .or_else(|| val.as_str().and_then(|s| s.parse().ok()))
    })
}

pub async fn synctex(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SynctexBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(tex) = safe_project_path(&state.root, &body.tex) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let Ok(pdf) = safe_project_path(&state.root, &body.pdf) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let Some(synctex) = synctex_bin() else {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "synctex not found — install MacTeX or TeX Live",
        );
    };

    if body.dir == "view" {
        let line = value_as_i64(body.line.as_ref()).unwrap_or(1);
        let col = value_as_i64(body.col.as_ref()).unwrap_or(1);
        let input = format!("{line}:{col}:{}", tex.display());
        let mut cmd = Command::new(&synctex);
        cmd.args(["view", "-i", &input, "-o"])
            .arg(&pdf)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let output = match tokio::time::timeout(Duration::from_secs(10), cmd.output()).await {
            Ok(Ok(o)) => o,
            Ok(Err(e)) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "synctex timed out"),
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut out = serde_json::Map::new();
        for ln in stdout.lines() {
            for key in ["Page:", "x:", "y:"] {
                if let Some(rest) = ln.strip_prefix(key)
                    && let Ok(v) = rest.trim().parse::<f64>()
                {
                    let name = key.trim_end_matches(':').to_ascii_lowercase();
                    out.insert(name, json!(v));
                }
            }
        }
        if out.is_empty() {
            return (StatusCode::OK, Json(json!({"error": "no match"}))).into_response();
        }
        (StatusCode::OK, Json(Value::Object(out))).into_response()
    } else {
        // PDF -> source (edit)
        let page = value_as_i64(body.page.as_ref()).unwrap_or(1);
        let x = value_as_f64(body.x.as_ref()).unwrap_or(0.0);
        let y = value_as_f64(body.y.as_ref()).unwrap_or(0.0);
        let o_arg = format!("{page}:{x}:{y}:{}", pdf.display());
        let mut cmd = Command::new(&synctex);
        cmd.args(["edit", "-o", &o_arg])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let output = match tokio::time::timeout(Duration::from_secs(10), cmd.output()).await {
            Ok(Ok(o)) => o,
            Ok(Err(e)) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            Err(_) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "synctex timed out"),
        };
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut out = serde_json::Map::new();
        for ln in stdout.lines() {
            if let Some(rest) = ln.strip_prefix("Line:")
                && let Ok(v) = rest.trim().parse::<i64>()
            {
                out.insert("line".into(), json!(v));
            }
            if let Some(rest) = ln.strip_prefix("Input:") {
                out.insert("input".into(), json!(rest.to_string()));
            }
        }
        if out.is_empty() {
            return (StatusCode::OK, Json(json!({"error": "no match"}))).into_response();
        }
        (StatusCode::OK, Json(Value::Object(out))).into_response()
    }
}

// ---------------------------------------------------------------------------
// GET/POST /pdfannot
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PdfAnnotQuery {
    rel: Option<String>,
}

/// Store commun aux serveurs de projets. Seules les cles Zotero y sont
/// ecrites : les chemins relatifs ordinaires ne sont pas globalement uniques.
fn shared_pdf_annots_path(root: &Path) -> PathBuf {
    if let Some(dir) = std::env::var_os("ATELIER_APP_DIR") {
        let dir = PathBuf::from(dir);
        if !dir.as_os_str().is_empty() {
            return dir.join("pdf_annots.json");
        }
    }
    root.join(".fig_thumbs").join("pdf_annots.json")
}

/// Ancien emplacement (par projet) : lu en secours pour ne pas perdre les
/// annotations posées avant le passage au store partagé. La première
/// écriture les recopie dans le store partagé.
fn legacy_pdf_annots_path(root: &Path) -> PathBuf {
    root.join(".fig_thumbs").join("pdf_annots.json")
}

fn is_zotero_pdf_rel(rel: &str) -> bool {
    let Some(rest) = rel.strip_prefix("zotero/") else {
        return false;
    };
    let Some((key, file)) = rest.split_once('/') else {
        return false;
    };
    key.len() == 8
        && key.chars().all(|c| c.is_ascii_alphanumeric())
        && !file.contains('/')
        && !file.contains('\\')
        && file.to_ascii_lowercase().ends_with(".pdf")
}

fn read_pdf_store(path: &Path) -> Value {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|_| json!({})),
        Err(_) => json!({}),
    }
}

fn write_pdf_store(path: &Path, store: &Value) -> Result<(), String> {
    let payload = format!(
        "{}\n",
        serde_json::to_string_pretty(store).unwrap_or_else(|_| "{}".into())
    );
    atomic_write_text(path, &payload).map_err(|error| error.to_string())
}

fn annotation_id(value: &Value) -> Option<String> {
    value.get("id").and_then(|id| match id {
        Value::String(id) => Some(id.clone()),
        Value::Number(id) => Some(id.to_string()),
        _ => None,
    })
}

/// Fusion additive d'un ancien store de projet vers le store Zotero commun.
/// Le commun gagne en cas de meme id : il contient l'etat le plus recent
/// (par exemple une note modifiee apres migration).
fn merge_legacy_zotero_entries(shared: &mut Value, legacy: &Value) -> bool {
    if !shared.is_object() {
        *shared = json!({});
    }
    let Some(shared) = shared.as_object_mut() else {
        return false;
    };
    let Some(legacy) = legacy.as_object() else {
        return false;
    };
    let mut changed = false;
    for (rel, old_value) in legacy {
        if !is_zotero_pdf_rel(rel) {
            continue;
        }
        let Some(old_annots) = old_value.as_array() else {
            continue;
        };
        let current = shared.entry(rel.clone()).or_insert_with(|| json!([]));
        let Some(current_annots) = current.as_array_mut() else {
            *current = json!([]);
            let Some(current_annots) = current.as_array_mut() else {
                continue;
            };
            for annot in old_annots {
                current_annots.push(annot.clone());
            }
            changed |= !old_annots.is_empty();
            continue;
        };
        for annot in old_annots {
            let duplicate = annotation_id(annot)
                .map(|id| {
                    current_annots
                        .iter()
                        .any(|item| annotation_id(item).as_deref() == Some(&id))
                })
                .unwrap_or_else(|| current_annots.contains(annot));
            if !duplicate {
                current_annots.push(annot.clone());
                changed = true;
            }
        }
    }
    changed
}

fn migration_key(root: &Path) -> String {
    fs::canonicalize(root)
        .unwrap_or_else(|_| root.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// Ouvre le store Zotero sous verrou inter-processus, puis importe une seule
/// fois l'ancien store du projet courant. Plusieurs serveurs Galerie peuvent
/// ainsi partager le fichier sans perdre la derniere ecriture.
fn with_shared_pdf_store<T>(
    root: &Path,
    operation: impl FnOnce(&mut Value) -> Result<(T, bool), String>,
) -> Result<T, String> {
    let shared_path = shared_pdf_annots_path(root);
    let legacy_path = legacy_pdf_annots_path(root);
    if let Some(parent) = shared_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let lock_path = shared_path.with_file_name("pdf_annots.lock");
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&lock_path)
        .map_err(|error| error.to_string())?;
    lock.lock_exclusive().map_err(|error| error.to_string())?;

    let result = (|| {
        let mut store = read_pdf_store(&shared_path);
        let ledger_path = shared_path.with_file_name("pdf_annots_migrations.json");
        let mut ledger = read_pdf_store(&ledger_path);
        if !ledger.is_object() {
            ledger = json!({});
        }
        let key = migration_key(root);
        let should_migrate =
            shared_path != legacy_path && ledger.get(&key).and_then(Value::as_bool) != Some(true);
        let migrated = should_migrate
            && merge_legacy_zotero_entries(&mut store, &read_pdf_store(&legacy_path));
        let (value, changed) = operation(&mut store)?;
        if migrated || changed {
            write_pdf_store(&shared_path, &store)?;
        }
        if should_migrate {
            if let Some(entries) = ledger.as_object_mut() {
                entries.insert(key, Value::Bool(true));
            }
            write_pdf_store(&ledger_path, &ledger)?;
        }
        Ok(value)
    })();

    let _ = FileExt::unlock(&lock);
    result
}

fn updated_annotations(store: &Value, rel: &str, body: &Value) -> Result<Value, String> {
    if let Some(ids) = body.get("removeIds") {
        let Some(ids) = ids
            .as_array()
            .filter(|ids| ids.iter().all(Value::is_string))
        else {
            return Err("removeIds must be an array of strings".into());
        };
        let existing = store.get(rel).cloned().unwrap_or_else(|| json!([]));
        return Ok(json!(
            existing
                .as_array()
                .into_iter()
                .flatten()
                .filter(|annot| {
                    let Some(id) = annotation_id(annot) else {
                        return true;
                    };
                    !ids.iter()
                        .any(|remove| remove.as_str() == Some(id.as_str()))
                })
                .collect::<Vec<_>>()
        ));
    }
    Ok(body.get("annots").cloned().unwrap_or_else(|| json!([])))
}

fn apply_pdf_store_update(
    path: &Path,
    store: &mut Value,
    rel: &str,
    body: &Value,
) -> Result<(), String> {
    let new_annots = updated_annotations(store, rel, body)?;
    if !new_annots.is_array() {
        return Err("annots must be an array".into());
    }
    let clearing = new_annots
        .as_array()
        .is_some_and(|annots| annots.is_empty())
        && store
            .get(rel)
            .and_then(Value::as_array)
            .is_some_and(|annots| !annots.is_empty());
    if clearing {
        let backup = PathBuf::from(format!("{}.bak", path.display()));
        atomic_write(
            &backup,
            serde_json::to_vec(store).unwrap_or_default().as_slice(),
        )
        .map_err(|error| error.to_string())?;
    }
    if !store.is_object() {
        *store = json!({});
    }
    store
        .as_object_mut()
        .ok_or_else(|| "invalid annotation store".to_string())?
        .insert(rel.to_string(), new_annots);
    Ok(())
}

pub async fn get_pdfannot(
    State(state): State<AppState>,
    Query(query): Query<PdfAnnotQuery>,
) -> impl IntoResponse {
    let rel = query.rel.unwrap_or_default();
    let annots = if is_zotero_pdf_rel(&rel) {
        match with_shared_pdf_store(&state.root, |store| {
            Ok((store.get(&rel).cloned().unwrap_or_else(|| json!([])), false))
        }) {
            Ok(annots) => annots,
            Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
        }
    } else {
        read_pdf_store(&legacy_pdf_annots_path(&state.root))
            .get(&rel)
            .cloned()
            .unwrap_or_else(|| json!([]))
    };
    (StatusCode::OK, Json(json!({"annots": annots}))).into_response()
}

/// GET /pdfannot-all — les annotations Zotero communes, superposees aux
/// annotations des PDF du projet courant pour la portee « Bibliotheque ».
pub async fn get_pdfannot_all(State(state): State<AppState>) -> impl IntoResponse {
    let shared = match with_shared_pdf_store(&state.root, |store| Ok((store.clone(), false))) {
        Ok(store) => store,
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    };
    let mut combined = read_pdf_store(&legacy_pdf_annots_path(&state.root));
    if !combined.is_object() {
        combined = json!({});
    }
    if let (Some(combined), Some(shared)) = (combined.as_object_mut(), shared.as_object()) {
        for (rel, annots) in shared {
            if is_zotero_pdf_rel(rel) {
                combined.insert(rel.clone(), annots.clone());
            }
        }
    }
    (StatusCode::OK, Json(json!({"annots": combined}))).into_response()
}

pub async fn post_pdfannot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    // Amélioration de sécurité vs Python (pas de garde) : loopback + cap 64 Mo.
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "loopback origin required");
    }
    if let Some(len) = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        && len > 64 * 1024 * 1024
    {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "payload too large"})),
        )
            .into_response();
    }
    let rel_key = body
        .get("rel")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if rel_key.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "rel required");
    }
    let result = if is_zotero_pdf_rel(&rel_key) {
        let shared_path = shared_pdf_annots_path(&state.root);
        with_shared_pdf_store(&state.root, |store| {
            apply_pdf_store_update(&shared_path, store, &rel_key, &body)?;
            Ok(((), true))
        })
    } else {
        let store_path = legacy_pdf_annots_path(&state.root);
        let mut store = read_pdf_store(&store_path);
        apply_pdf_store_update(&store_path, &mut store, &rel_key, &body)
            .and_then(|()| write_pdf_store(&store_path, &store))
    };
    match result {
        Ok(()) => (StatusCode::OK, Json(json!({"ok": true}))).into_response(),
        Err(error)
            if error == "removeIds must be an array of strings"
                || error == "annots must be an array" =>
        {
            json_error(StatusCode::BAD_REQUEST, error)
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

// ---------------------------------------------------------------------------
// POST /export-png
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ExportPngBody {
    rel: Option<String>,
    name: Option<String>,
    svg: String,
    dpi: Option<Value>,
}

pub async fn export_png(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ExportPngBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if body.svg.is_empty() || body.svg.len() > 64 * 1024 * 1024 {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "empty or oversized svg"})),
        )
            .into_response();
    }
    let head = if body.svg.len() > 4000 {
        &body.svg[..4000]
    } else {
        &body.svg
    };
    if !head.contains("<svg") {
        return json_error(StatusCode::BAD_REQUEST, "not an svg payload");
    }
    let dpi = body
        .dpi
        .as_ref()
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_f64().map(|f| f as i64))
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .map(|d| d.clamp(72, 1200))
        .unwrap_or(300);

    let rel = body
        .rel
        .as_deref()
        .or(body.name.as_deref())
        .unwrap_or("")
        .to_string();
    let Ok(dst) = safe_project_path(&state.root, &rel) else {
        return json_error(StatusCode::BAD_REQUEST, "svg not found / non-svg / symlink");
    };
    let is_svg = dst
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("svg"));
    if !is_svg || !dst.is_file() || dst.is_symlink() {
        return json_error(StatusCode::BAD_REQUEST, "svg not found / non-svg / symlink");
    }
    // Sibling .png (Python: dst[:-4] + ".png" for paths ending in .svg).
    let mut png = dst.clone();
    png.set_extension("png");
    if png.is_symlink() || safe_project_path(&state.root, &png.to_string_lossy()).is_err() {
        return json_error(StatusCode::BAD_REQUEST, "bad png output path");
    }

    let Some(rsvg) = which("rsvg-convert") else {
        return (
            StatusCode::NOT_IMPLEMENTED,
            Json(json!({
                "error": "rsvg-convert not installed (brew install librsvg / apt install librsvg2-bin)"
            })),
        )
            .into_response();
    };

    let parent = dst.parent().unwrap_or_else(|| Path::new("."));
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_svg = parent.join(format!(".exp.{nonce}.svg"));
    let tmp_png = parent.join(format!(".exp.{nonce}.png"));
    if let Err(error) = fs::write(&tmp_svg, body.svg.as_bytes()) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    // Create empty tmp_png so path exists for -o (like mkstemp + close).
    let _ = fs::File::create(&tmp_png);

    let mut cmd = Command::new(&rsvg);
    cmd.args([
        "--dpi-x",
        &dpi.to_string(),
        "--dpi-y",
        &dpi.to_string(),
        "-o",
    ])
    .arg(&tmp_png)
    .arg(&tmp_svg)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true);

    let result = tokio::time::timeout(Duration::from_secs(120), cmd.output()).await;
    let cleanup = || {
        let _ = fs::remove_file(&tmp_svg);
        let _ = fs::remove_file(&tmp_png);
    };

    match result {
        Ok(Ok(output)) => {
            let size = fs::metadata(&tmp_png).map(|m| m.len()).unwrap_or(0);
            if !output.status.success() || size == 0 {
                let err = String::from_utf8_lossy(&output.stderr);
                let count = err.chars().count();
                let tail: String = err.chars().skip(count.saturating_sub(300)).collect();
                cleanup();
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("rsvg-convert failed: {tail}"),
                );
            }
            if let Err(error) = fs::rename(&tmp_png, &png) {
                cleanup();
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
            }
            let _ = fs::remove_file(&tmp_svg);
            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "path": project_rel(&state.root, &png),
                    "dpi": dpi,
                })),
            )
                .into_response()
        }
        Ok(Err(error)) => {
            cleanup();
            json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        }
        Err(_) => {
            cleanup();
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "rsvg-convert timed out")
        }
    }
}

// ---------------------------------------------------------------------------
// GET /lint (STUDIO side-car ; always registered, available:false otherwise)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct LintQuery {
    path: Option<String>,
}

pub async fn lint(Query(query): Query<LintQuery>) -> impl IntoResponse {
    // Python only exposes this under STUDIO; when registered we still apply the
    // same path policy: ~/Documents or ~/Desktop, *.py only.
    let requested = query.path.as_deref().unwrap_or("");
    let expanded = if requested.starts_with('~') {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        if requested == "~" {
            home
        } else if let Some(rest) = requested.strip_prefix("~/") {
            format!("{home}/{rest}")
        } else {
            requested.to_string()
        }
    } else {
        requested.to_string()
    };
    let Ok(p) = fs::canonicalize(&expanded) else {
        return (StatusCode::OK, Json(json!({"available": false}))).into_response();
    };
    let home = std::env::var("HOME").unwrap_or_default();
    let allowed = ["Documents", "Desktop"].iter().any(|d| {
        let base = PathBuf::from(&home).join(d);
        p.starts_with(&base)
    });
    if !allowed || p.extension().and_then(|e| e.to_str()) != Some("py") || !p.is_file() {
        return (StatusCode::OK, Json(json!({"available": false}))).into_response();
    }
    let Some(ruff) = which("ruff") else {
        return (StatusCode::OK, Json(json!({"available": false}))).into_response();
    };
    let mut cmd = Command::new(ruff);
    cmd.args(["check", "--output-format", "json", "--quiet"])
        .arg(&p)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let output = match tokio::time::timeout(Duration::from_secs(5), cmd.output()).await {
        Ok(Ok(o)) => o,
        _ => return (StatusCode::OK, Json(json!({"available": false}))).into_response(),
    };
    let diags: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap_or_default();
    let out: Vec<Value> = diags
        .into_iter()
        .take(200)
        .map(|d| {
            let loc = d.get("location").cloned().unwrap_or(Value::Null);
            json!({
                "row": loc.get("row").and_then(Value::as_i64).unwrap_or(1),
                "col": loc.get("column").and_then(Value::as_i64).unwrap_or(1),
                "code": d.get("code").and_then(Value::as_str).unwrap_or(""),
                "message": d.get("message").and_then(Value::as_str).unwrap_or(""),
            })
        })
        .collect();
    (
        StatusCode::OK,
        Json(json!({"available": true, "diagnostics": out})),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compile_error_prefers_bang_lines() {
        let log = "normal\n! Undefined control sequence\nmore\nError: foo\n";
        let err = compile_error_excerpt(log);
        assert!(err.contains('!'));
    }

    #[test]
    fn latexmk_or_tectonic_discovery_does_not_panic() {
        let _ = latexmk_bin();
        let _ = tectonic_bin();
        let _ = synctex_bin();
    }

    #[test]
    fn prefix_argv_basename_neutralizes_dash_prefixed_names() {
        // plan 063, SEC-07 : ./ seul suffit déjà à lever l'ambiguïté argv,
        // même pour un nom hostile qui commencerait par '-'.
        assert_eq!(prefix_argv_basename("-evil.tex"), "./-evil.tex");
    }

    #[test]
    fn safe_argv_basename_prefixes_dot_slash() {
        assert_eq!(safe_argv_basename("main.tex").unwrap(), "./main.tex");
    }

    #[test]
    fn safe_argv_basename_refuses_dash_prefixed_name_upfront() {
        // Ceinture-bretelles : refus explicite en amont, avec message clair,
        // même si `./` seul lèverait déjà l'ambiguïté.
        let err = safe_argv_basename("-evil.tex").unwrap_err();
        assert!(err.contains("-evil.tex"));
    }

    #[test]
    fn zotero_identity_is_global_but_project_paths_are_not() {
        assert!(is_zotero_pdf_rel("zotero/ABCD1234/article.pdf"));
        assert!(!is_zotero_pdf_rel("article.pdf"));
        assert!(!is_zotero_pdf_rel("zotero/SHORT/article.pdf"));
        assert!(!is_zotero_pdf_rel("zotero/ABCD1234/folder/article.pdf"));
    }

    #[test]
    fn legacy_zotero_merge_is_additive_and_idempotent() {
        let mut shared = json!({
            "zotero/ABCD1234/article.pdf": [
                {"id": "a1", "note": "version commune"}
            ]
        });
        let legacy = json!({
            "zotero/ABCD1234/article.pdf": [
                {"id": "a1", "note": "ancienne version"},
                {"id": "a2", "note": "annotation d'un autre projet"}
            ],
            "article.pdf": [
                {"id": "local", "note": "reste dans le projet"}
            ]
        });

        assert!(merge_legacy_zotero_entries(&mut shared, &legacy));
        let annots = shared["zotero/ABCD1234/article.pdf"].as_array().unwrap();
        assert_eq!(annots.len(), 2);
        assert_eq!(annots[0]["note"], "version commune");
        assert!(shared.get("article.pdf").is_none());
        assert!(!merge_legacy_zotero_entries(&mut shared, &legacy));
    }
}
