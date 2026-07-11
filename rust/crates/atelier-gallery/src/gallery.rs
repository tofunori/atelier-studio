//! Phase 2 — galerie, miniatures, actions fichiers, événements toast.

use atelier_core::safe_project_path;
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::IntoResponse,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use md5::{Digest, Md5};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::process::Command;
use zip::{ZipWriter, write::SimpleFileOptions};

use crate::{AppState, request_allowed};

const SNIP_EXTS: &[&str] = &["py", "r", "jl", "sh", "tex", "md", "csv"];
const EVENT_CAP: usize = 100;

// ---------------------------------------------------------------------------
// Toast event store (GET/POST /agent-events, /claude-events)
// ---------------------------------------------------------------------------

#[derive(Default)]
pub(crate) struct EventStore {
    next_id: u64,
    events: VecDeque<Value>,
}

impl EventStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            events: VecDeque::new(),
        }
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    fn push(&mut self, rel: &str, note: &str, row: Value) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0);
        self.events.push_back(json!({
            "id": id,
            "ts": ts,
            "rel": rel,
            "note": note,
            "row": row,
        }));
        while self.events.len() > EVENT_CAP {
            self.events.pop_front();
        }
        id
    }

    fn since(&self, since: u64) -> (Vec<Value>, u64) {
        let events: Vec<Value> = self
            .events
            .iter()
            .filter(|e| e.get("id").and_then(Value::as_u64).unwrap_or(0) > since)
            .cloned()
            .collect();
        let last = self
            .events
            .back()
            .and_then(|e| e.get("id").and_then(Value::as_u64))
            .unwrap_or(0);
        (events, last)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

fn now_secs_f64() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

fn export_stamp() -> String {
    // Local wall-clock stamp like Python time.strftime("%Y%m%d_%H%M%S").
    // Best-effort via `date`; fallback to unix seconds for uniqueness.
    std::process::Command::new("date")
        .arg("+%Y%m%d_%H%M%S")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|_| "0".into())
        })
}

fn project_rel(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

fn event_row(full: &Path, rel: &str) -> Value {
    let meta = fs::metadata(full).ok();
    let mtime = meta
        .as_ref()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let btime = meta
        .as_ref()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(mtime);
    let size = meta.map(|m| m.len()).unwrap_or(0);
    let ext = Path::new(rel)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let name = Path::new(rel)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(rel);
    let folder = Path::new(rel)
        .parent()
        .map(|p| {
            let s = p.to_string_lossy();
            if s.is_empty() {
                ".".into()
            } else {
                s.replace('\\', "/")
            }
        })
        .unwrap_or_else(|| ".".into());
    let mdate = format_local(mtime);
    let bdate = format_local(btime);
    json!({
        "thumb": null,
        "code": SNIP_EXTS.iter().any(|e| *e == ext),
        "name": name,
        "rel": rel,
        "folder": folder,
        "ext": ext,
        "mtime": mtime,
        "btime": btime,
        "mdate": mdate,
        "bdate": bdate,
        "size": size,
        "archive": false,
    })
}

fn format_local(secs: i64) -> String {
    std::process::Command::new("date")
        .args(["-r", &secs.to_string(), "+%Y-%m-%d %H:%M"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "1970-01-01 00:00".into())
}

fn agent_mode(state: &AppState) -> bool {
    !state.agent_token.is_empty()
        || std::env::var("ATELIER_AGENT_HOST")
            .map(|v| !v.is_empty())
            .unwrap_or(false)
        || std::env::var("ATELIER_STUDIO").as_deref() == Ok("1")
        || std::env::var("CLAUDE_PREVIEW").as_deref() == Ok("1")
}

fn find_chrome() -> Option<PathBuf> {
    const CANDIDATES: &[&str] = &[
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for path in CANDIDATES {
        if Path::new(path).is_file() {
            return Some(PathBuf::from(path));
        }
    }
    for name in ["google-chrome", "chromium-browser", "chromium", "chrome"] {
        if let Ok(output) = std::process::Command::new("which").arg(name).output()
            && output.status.success()
        {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }
    None
}

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

async fn run_timeout(mut cmd: Command, timeout: Duration) -> Result<std::process::Output, String> {
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("timed out".into()),
    }
}

fn serve_bytes(path: &Path, cache: &'static str) -> axum::response::Response {
    let Ok(data) = fs::read(path) else {
        return json_error(StatusCode::NOT_FOUND, "not found");
    };
    let ctype = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    (
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_str(&ctype)
                    .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static(cache)),
        ],
        data,
    )
        .into_response()
}

fn md5_hex(input: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct EventsQuery {
    since: Option<String>,
}

#[derive(Deserialize)]
pub struct AgentEventBody {
    rel: Option<String>,
    note: Option<String>,
}

pub async fn agent_events(
    State(state): State<AppState>,
    Query(query): Query<EventsQuery>,
) -> impl IntoResponse {
    let since = query
        .since
        .as_deref()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    let store = state.events.lock().await;
    let (events, last) = store.since(since);
    (
        StatusCode::OK,
        Json(json!({"events": events, "last": last})),
    )
        .into_response()
}

pub async fn post_agent_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<AgentEventBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let raw_rel = body
        .rel
        .as_deref()
        .unwrap_or("")
        .trim()
        .trim_start_matches('/');
    let Ok(full) = safe_project_path(&state.root, raw_rel) else {
        return json_error(StatusCode::NOT_FOUND, format!("file not found: {raw_rel}"));
    };
    if !full.is_file() {
        return json_error(StatusCode::NOT_FOUND, format!("file not found: {raw_rel}"));
    }
    let rel = project_rel(&state.root, &full);
    let note: String = body
        .note
        .as_deref()
        .unwrap_or("")
        .trim()
        .chars()
        .take(500)
        .collect();
    let row = event_row(&full, &rel);
    let id = state.events.lock().await.push(&rel, &note, row);
    (StatusCode::OK, Json(json!({"ok": true, "id": id}))).into_response()
}

// ---------------------------------------------------------------------------
// Quote / targets
// ---------------------------------------------------------------------------

pub async fn get_quote() -> impl IntoResponse {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let qf = PathBuf::from(&home)
        .join(".claude")
        .join("fig-last-quote.txt");
    let pending = match (fs::metadata(&qf), fs::read(&qf)) {
        (Ok(meta), Ok(bytes)) => {
            let age = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| now_secs_f64() - d.as_secs_f64())
                .unwrap_or(f64::MAX);
            let head = String::from_utf8_lossy(&bytes[..bytes.len().min(500)]);
            head.contains("Annotations") && age < 900.0
        }
        _ => false,
    };
    (StatusCode::OK, Json(json!({"pending": pending}))).into_response()
}

pub async fn clear_quote(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let dir = PathBuf::from(&home).join(".claude");
    let _ = fs::create_dir_all(&dir);
    let qf = dir.join("fig-last-quote.txt");
    match fs::write(&qf, b"") {
        Ok(()) => (StatusCode::OK, Json(json!({"ok": true}))).into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

pub async fn claude_targets(State(state): State<AppState>) -> impl IntoResponse {
    // NO_PUSH equivalent: mode agent / studio / preview → empty without CLI.
    if agent_mode(&state) {
        return (StatusCode::OK, Json(json!({"targets": []}))).into_response();
    }
    // Hors mode agent : liste vide pour l'instant (muxy/orca/cmux = phase 7).
    // Python peuplerait via CLI ; sans CLI installé le résultat est aussi [].
    (StatusCode::OK, Json(json!({"targets": []}))).into_response()
}

// ---------------------------------------------------------------------------
// Thumbnails + rasterize
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ThumbQuery {
    path: String,
    w: Option<String>,
}

#[derive(Deserialize)]
pub struct RasterizeQuery {
    path: String,
    w: Option<String>,
    h: Option<String>,
}

pub async fn thumb(
    State(state): State<AppState>,
    Query(query): Query<ThumbQuery>,
) -> impl IntoResponse {
    let Ok(src) = safe_project_path(&state.root, &query.path) else {
        return json_error(StatusCode::NOT_FOUND, "not found");
    };
    if !src.is_file() {
        return json_error(StatusCode::NOT_FOUND, "not found");
    }
    let w = query
        .w
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .map(|v| v.clamp(64, 2000))
        .unwrap_or(480) as u32;

    let mtime = src
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let real = fs::canonicalize(&src).unwrap_or_else(|_| src.clone());
    let is_svg = src
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("svg"));
    let key_src = format!(
        "{}:{}:{}{}",
        real.display(),
        mtime,
        w,
        if is_svg { ":svg-rsvg" } else { "" }
    );
    let key = md5_hex(&key_src);
    let td = state.root.join(".fig_thumbs");
    let _ = fs::create_dir_all(&td);
    let out = td.join(format!("imgthumb_{key}.png"));

    if !out.exists() {
        let ext = src
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let _permit = state.thumb_sem.acquire().await.ok();
        let serve_src = match ext.as_str() {
            "svg" => match which("rsvg-convert") {
                Some(rsvg) => {
                    let mut cmd = Command::new(rsvg);
                    cmd.args(["-w", &w.to_string(), "-o"]).arg(&out).arg(&src);
                    match run_timeout(cmd, Duration::from_secs(20)).await {
                        Ok(o) if o.status.success() && out.exists() => None,
                        _ => Some(src.clone()),
                    }
                }
                None => Some(src.clone()),
            },
            "html" | "htm" => {
                let Some(chrome) = find_chrome() else {
                    return json_error(StatusCode::NOT_FOUND, "no html preview (chrome not found)");
                };
                let tmp = match chrome_screenshot(
                    &chrome,
                    &src,
                    &out,
                    1000,
                    750,
                    4000,
                    Duration::from_secs(25),
                    &state.chrome_sem,
                )
                .await
                {
                    Some(p) => p,
                    None => {
                        return json_error(StatusCode::NOT_FOUND, "html preview failed");
                    }
                };
                // Downscale with sips
                let mut sips = Command::new("sips");
                sips.args(["-Z", &w.to_string(), "-s", "format", "png"])
                    .arg(&tmp)
                    .args(["--out"])
                    .arg(&out);
                if run_timeout(sips, Duration::from_secs(15))
                    .await
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                    && out.exists()
                {
                    let _ = fs::remove_file(&tmp);
                } else if tmp.exists() {
                    let _ = fs::rename(&tmp, &out);
                    let _ = fs::remove_file(&tmp);
                }
                if !out.exists() {
                    return json_error(StatusCode::NOT_FOUND, "html preview failed");
                }
                None
            }
            _ => {
                let mut sips = Command::new("sips");
                sips.args(["-Z", &w.to_string(), "-s", "format", "png"])
                    .arg(&src)
                    .args(["--out"])
                    .arg(&out);
                match run_timeout(sips, Duration::from_secs(20)).await {
                    Ok(o) if o.status.success() && out.exists() => None,
                    _ => Some(src.clone()),
                }
            }
        };
        if let Some(fallback) = serve_src {
            return serve_bytes(&fallback, "max-age=86400");
        }
    }
    serve_bytes(&out, "max-age=86400")
}

pub async fn rasterize(
    State(state): State<AppState>,
    Query(query): Query<RasterizeQuery>,
) -> impl IntoResponse {
    let Ok(src) = safe_project_path(&state.root, &query.path) else {
        return json_error(StatusCode::NOT_FOUND, "not found");
    };
    if !src.is_file() {
        return json_error(StatusCode::NOT_FOUND, "not found");
    }
    let w = query
        .w
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .map(|v| v.clamp(320, 2400))
        .unwrap_or(1000) as u32;
    let h = query
        .h
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .map(|v| v.clamp(200, 20000))
        .unwrap_or(750) as u32;

    let mtime = src
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let real = fs::canonicalize(&src).unwrap_or_else(|_| src.clone());
    let key = md5_hex(&format!("{}:{}:rast:{w}x{h}", real.display(), mtime));
    let td = state.root.join(".fig_thumbs");
    let _ = fs::create_dir_all(&td);
    let out = td.join(format!("rast_{key}.png"));
    if !out.exists() {
        let Some(chrome) = find_chrome() else {
            return json_error(StatusCode::NOT_IMPLEMENTED, "no chrome available");
        };
        let shot = match chrome_screenshot(
            &chrome,
            &src,
            &out,
            w,
            h,
            6000,
            Duration::from_secs(30),
            &state.chrome_sem,
        )
        .await
        {
            Some(p) => p,
            None => return json_error(StatusCode::INTERNAL_SERVER_ERROR, "render failed"),
        };
        if let Err(error) = fs::rename(&shot, &out) {
            let _ = fs::remove_file(&shot);
            return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
        }
    }
    serve_bytes(&out, "max-age=86400")
}

#[allow(clippy::too_many_arguments)]
async fn chrome_screenshot(
    chrome: &Path,
    src: &Path,
    out_png: &Path,
    w: u32,
    h: u32,
    virtual_ms: u32,
    timeout: Duration,
    chrome_sem: &tokio::sync::Semaphore,
) -> Option<PathBuf> {
    let shot = PathBuf::from(format!("{}.tmp.png", out_png.display()));
    let _permit = chrome_sem.acquire().await.ok()?;
    let url = format!("file://{}", src.display());
    let mut cmd = Command::new(chrome);
    cmd.args([
        "--headless=new",
        "--hide-scrollbars",
        &format!("--screenshot={}", shot.display()),
        &format!("--window-size={w},{h}"),
        &format!("--virtual-time-budget={virtual_ms}"),
        &url,
    ])
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .kill_on_drop(true);
    // Process group for killpg-like behaviour via kill_on_drop on timeout.
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    let child = cmd.spawn().ok()?;
    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(_)) => {}
        _ => {
            // kill_on_drop on timeout drop of child — already handled when wait fails
        }
    }
    if shot.is_file() { Some(shot) } else { None }
}

// ---------------------------------------------------------------------------
// Delete / export / open
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct DeleteBody {
    rels: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct ExportBody {
    rels: Option<Vec<String>>,
    mode: Option<String>,
}

#[derive(Deserialize)]
pub struct OpenBody {
    rel: Option<String>,
}

pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DeleteBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let trash = PathBuf::from(home).join(".Trash");
    let _ = fs::create_dir_all(&trash);
    let mut deleted = Vec::new();
    for rel in body.rels.unwrap_or_default() {
        let joined = state.root.join(&rel);
        let Ok(full) = fs::canonicalize(&joined) else {
            continue;
        };
        if !full.starts_with(&state.root) || !full.is_file() {
            continue;
        }
        let base = full
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_default();
        let mut dest = trash.join(&base);
        let mut i = 1u32;
        while dest.exists() {
            let stem = Path::new(&base)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("file");
            let ext = Path::new(&base)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| format!(".{e}"))
                .unwrap_or_default();
            dest = trash.join(format!("{stem}_{i}{ext}"));
            i += 1;
        }
        if fs::rename(&full, &dest).is_ok() {
            deleted.push(rel);
        }
    }
    if !deleted.is_empty() {
        let root = state.root.clone();
        let watcher = state.watcher.clone();
        let revision = state.revision.clone();
        let lock = state.rebuild_lock.clone();
        tokio::spawn(async move {
            crate::rebuild(&root, &watcher, &revision, &lock).await;
        });
    }
    (StatusCode::OK, Json(json!({"deleted": deleted}))).into_response()
}

pub async fn export(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ExportBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let mode = body.mode.as_deref().unwrap_or("folder");
    let mut files: Vec<(String, PathBuf)> = Vec::new();
    for rel in body.rels.unwrap_or_default() {
        let joined = state.root.join(&rel);
        let Ok(full) = fs::canonicalize(&joined) else {
            continue;
        };
        if (full == state.root || full.starts_with(&state.root)) && full.is_file() {
            files.push((rel, full));
        }
    }
    if files.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "no valid files selected");
    }
    let exp = state.root.join("_gallery_exports");
    if let Err(error) = fs::create_dir_all(&exp) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    let ts = export_stamp();
    let out = match mode {
        "zip" => {
            let out = exp.join(format!("export_{ts}.zip"));
            if let Err(error) = write_zip(&out, &files) {
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, error);
            }
            // Manifest alongside archive content (inside zip).
            out
        }
        "contact" => {
            let out = exp.join(format!("contact_{ts}.html"));
            if let Err(error) = write_contact_sheet(&out, &files).await {
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, error);
            }
            out
        }
        _ => {
            let out = exp.join(format!("export_{ts}"));
            if let Err(error) = fs::create_dir_all(&out) {
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
            }
            let mut manifest = Vec::new();
            for (rel, src) in &files {
                let base = src.file_name().unwrap_or_default();
                let mut dest = out.join(base);
                let mut i = 1u32;
                while dest.exists() {
                    let stem = Path::new(base)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("file");
                    let ext = Path::new(base)
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| format!(".{e}"))
                        .unwrap_or_default();
                    dest = out.join(format!("{stem}_{i}{ext}"));
                    i += 1;
                }
                if let Err(error) = fs::copy(src, &dest) {
                    return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
                }
                manifest.push(json!({
                    "rel": rel,
                    "name": dest.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                }));
            }
            let _ = fs::write(
                out.join("manifest.json"),
                serde_json::to_vec_pretty(&json!({
                    "mode": "folder",
                    "count": files.len(),
                    "files": manifest,
                }))
                .unwrap_or_default(),
            );
            out
        }
    };

    // Reveal in Finder (best-effort, same as Python).
    let mut open_cmd = Command::new("open");
    if out.is_file() {
        open_cmd.args(["-R"]).arg(&out);
    } else {
        open_cmd.arg(&out);
    }
    let _ = tokio::time::timeout(Duration::from_secs(10), open_cmd.output()).await;

    let rel = project_rel(&state.root, &out);
    (
        StatusCode::OK,
        Json(json!({"ok": true, "path": rel, "count": files.len()})),
    )
        .into_response()
}

fn write_zip(out: &Path, files: &[(String, PathBuf)]) -> Result<(), String> {
    let file = fs::File::create(out).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut seen = std::collections::HashMap::<String, u32>::new();
    let mut manifest = Vec::new();
    for (rel, path) in files {
        let mut arc = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let n = *seen.get(&arc).unwrap_or(&0);
        seen.insert(arc.clone(), n + 1);
        if n > 0 {
            let (b, e) = match arc.rsplit_once('.') {
                Some((b, e)) => (b.to_string(), format!(".{e}")),
                None => (arc.clone(), String::new()),
            };
            arc = format!("{b}_{n}{e}");
        }
        let data = fs::read(path).map_err(|e| e.to_string())?;
        zip.start_file(&arc, options).map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
        manifest.push(json!({"rel": rel, "name": arc}));
    }
    // Manifest inside the zip (plan phase 2).
    let manifest_bytes = serde_json::to_vec_pretty(&json!({
        "mode": "zip",
        "count": files.len(),
        "files": manifest,
    }))
    .map_err(|e| e.to_string())?;
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&manifest_bytes).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

async fn write_contact_sheet(out: &Path, files: &[(String, PathBuf)]) -> Result<(), String> {
    const RASTER: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];
    let mut cells = String::new();
    for (_rel, p) in files.iter().take(80) {
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let name = html_escape(p.file_name().and_then(|n| n.to_str()).unwrap_or("file"));
        let label = if ext.is_empty() {
            "FILE".to_string()
        } else {
            ext.to_ascii_uppercase()
        };
        let mut thumb = format!(r#"<div class="ph">{}</div>"#, html_escape(&label));
        if RASTER.iter().any(|e| *e == ext) {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default();
            let tmp_dir = std::env::temp_dir()
                .join(format!("atelier-contact-{}-{nonce}", std::process::id()));
            fs::create_dir(&tmp_dir).map_err(|e| e.to_string())?;
            let tmp = tmp_dir.join("preview.jpg");
            let mut sips = Command::new("sips");
            sips.args(["-Z", "460", "-s", "format", "jpeg"])
                .arg(p)
                .args(["--out"])
                .arg(&tmp);
            if run_timeout(sips, Duration::from_secs(20))
                .await
                .map(|o| o.status.success())
                .unwrap_or(false)
                && tmp.is_file()
                && let Ok(bytes) = fs::read(&tmp)
            {
                thumb = format!(
                    r#"<img src="data:image/jpeg;base64,{}">"#,
                    BASE64.encode(bytes)
                );
            }
            let _ = fs::remove_file(&tmp);
            let _ = fs::remove_dir(&tmp_dir);
        }
        cells.push_str(&format!(
            "<figure>{thumb}<figcaption>{name}</figcaption></figure>"
        ));
    }
    let doc = format!(
        r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contact sheet</title><style>body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:24px;background:#fff;color:#111}}h1{{font-size:15px;font-weight:600;margin:0 0 14px}}.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}}figure{{margin:0;border:1px solid #ddd;border-radius:8px;overflow:hidden;break-inside:avoid}}figure img{{width:100%;height:165px;object-fit:contain;background:#f6f6f6;display:block}}.ph{{height:165px;display:flex;align-items:center;justify-content:center;background:#f0f0f0;color:#999;font-size:13px}}figcaption{{font-size:10.5px;padding:6px 8px;word-break:break-all;color:#333}}</style></head><body><h1>Contact sheet — {} file(s)</h1><div class="grid">{}</div></body></html>"#,
        files.len(),
        cells
    );
    fs::write(out, doc).map_err(|e| e.to_string())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

pub async fn open_path(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<OpenBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Some(rel) = body.rel.as_deref() else {
        return json_error(StatusCode::BAD_REQUEST, "bad request: missing rel");
    };
    let joined = state.root.join(rel);
    let Ok(full) = fs::canonicalize(&joined) else {
        return json_error(StatusCode::NOT_FOUND, "not found");
    };
    if !full.starts_with(&state.root) || !full.exists() {
        return json_error(StatusCode::NOT_FOUND, "not found");
    }
    let mut cmd = Command::new("open");
    cmd.arg(&full);
    match tokio::time::timeout(Duration::from_secs(10), cmd.output()).await {
        Ok(Ok(_)) => (StatusCode::OK, Json(json!({"ok": true}))).into_response(),
        Ok(Err(error)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "open timed out"),
    }
}
