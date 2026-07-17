mod agent;
mod documents;
mod files;
mod gallery;
mod git;
mod host;
mod suggest;
mod workspace;
mod zotero;

use agent::AgentStore;
use atelier_core::{WatcherStatus, artifact_snapshot, is_artifact, is_excluded_dir};
use axum::{
    Json, Router,
    body::Body,
    extract::{Query, Request, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode, Uri, header},
    middleware::{self, Next},
    response::IntoResponse,
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use clap::Parser;
use gallery::EventStore;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::{
    process::Command,
    sync::{Mutex, RwLock, Semaphore, mpsc},
    time::sleep,
};
use tower_http::trace::TraceLayer;
use workspace::BoardQueue;
use zotero::ZoteroCache;

#[derive(Parser, Debug, Clone)]
#[command(
    name = "atelier-gallery-server",
    about = "Gallery HTTP server for Atelier Studio (plan 033 Porte 2)"
)]
struct Args {
    #[arg(long, default_value = ".")]
    root: PathBuf,
    #[arg(long, default_value_t = 9360)]
    port: u16,
    #[arg(long, default_value = "127.0.0.1")]
    host: String,
    #[arg(long, default_value_t = true)]
    watch: bool,
    #[arg(long, hide = true)]
    no_watch: bool,
}

#[derive(Clone)]
pub(crate) struct AppState {
    root: PathBuf,
    port: u16,
    revision: Arc<RwLock<u64>>,
    watcher: Arc<RwLock<WatcherStatus>>,
    agent: Arc<Mutex<AgentStore>>,
    rebuild_lock: Arc<Mutex<()>>,
    agent_token: String,
    remote: bool,
    /// Toast events for GET/POST /agent-events (cap 100, like Python).
    events: Arc<Mutex<EventStore>>,
    /// Concurrency caps for thumbnail tools and headless Chrome.
    thumb_sem: Arc<Semaphore>,
    chrome_sem: Arc<Semaphore>,
    /// Whiteboard command queue (drained by GET /board/poll).
    board: Arc<Mutex<BoardQueue>>,
    /// Serialize notes/board disk writes.
    workspace_lock: Arc<Mutex<()>>,
    /// Zotero readonly copy mtime cache.
    zotero: Arc<std::sync::Mutex<ZoteroCache>>,
    /// Coquille live `/` (+`/figures_index.html`) rendue au boot depuis le
    /// template bundlé — parité Node serveLiveShell, immune au fichier disque.
    live_shell: Option<Arc<str>>,
    /// Studio identity fields (parity with gallery/server Node).
    started_at: String,
    app_version: String,
    bundle_hash: String,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn relevant_change(root: &PathBuf, path: &std::path::Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    if path.file_name().and_then(|name| name.to_str()) == Some("figures_index.html") {
        return None;
    }
    if relative.components().any(|component| {
        matches!(component, std::path::Component::Normal(name)
            if is_excluded_dir(&name.to_string_lossy()))
    }) {
        return None;
    }
    if !is_artifact(path) {
        return None;
    }
    Some(relative.to_string_lossy().replace('\\', "/"))
}

async fn ping(State(state): State<AppState>) -> Json<Value> {
    // Node Studio: { ok, service: "fig-annotate", project }
    Json(json!({
        "ok": true,
        "service": "fig-annotate",
        "project": state.root.to_string_lossy(),
        "backend": "rust",
        "revision": *state.revision.read().await,
        "watcher": state.watcher.read().await.clone(),
    }))
}

async fn health(State(state): State<AppState>) -> Json<Value> {
    // Contract required by Tauri `identity::GALLERY_SERVICE` + Node core.mjs.
    let rebuild_busy = state.rebuild_lock.try_lock().is_err();
    let payload = json!({
        "ok": true,
        "service": "atelier-gallery",
        "pid": std::process::id(),
        "port": state.port,
        "startedAt": state.started_at,
        "projectRoot": state.root,
        "appVersion": state.app_version,
        "bundleHash": state.bundle_hash,
        "tokenRequired": false,
        "backend": "rust",
        "revision": *state.revision.read().await,
        "watcher": state.watcher.read().await.clone(),
        "tasks": {
            "rebuildBusy": rebuild_busy,
            "thumbPermits": state.thumb_sem.available_permits(),
            "chromePermits": state.chrome_sem.available_permits(),
            "toastEvents": state.events.lock().await.len(),
            "boardQueue": state.board.lock().await.len(),
        },
    });
    Json(payload)
}

async fn revision(State(state): State<AppState>) -> Json<Value> {
    Json(serde_json::json!({ "rev": *state.revision.read().await }))
}

async fn data(State(state): State<AppState>) -> impl IntoResponse {
    let path = state.root.join("figures_data.json");
    match tokio::fs::read(path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [
                ("content-type", "application/json"),
                ("cache-control", "no-cache"),
            ],
            bytes,
        )
            .into_response(),
        Err(error) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": error.to_string() })),
        )
            .into_response(),
    }
}

fn default_gallery_state() -> Value {
    json!({
        "favs": [], "ratings": {}, "hidden": [], "tags": {},
        "hideRules": [], "collections": {}, "workflow": {}
    })
}

async fn gallery_state(State(state): State<AppState>) -> impl IntoResponse {
    let path = state.root.join(".fig_state.json");
    match tokio::fs::read_to_string(path).await {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(value) => (StatusCode::OK, Json(value)).into_response(),
            Err(_) => (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"invalid gallery state"})),
            )
                .into_response(),
        },
        Err(_) => (StatusCode::OK, Json(default_gallery_state())).into_response(),
    }
}

async fn save_gallery_state(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(value): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    if !value.is_object() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"state must be an object"})),
        )
            .into_response();
    }
    if serde_json::to_vec(&value)
        .map(|bytes| bytes.len())
        .unwrap_or(usize::MAX)
        > 8 * 1024 * 1024
    {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error":"state is too large"})),
        )
            .into_response();
    }
    let sanitized = sanitize_gallery_state(&value);
    let counts = json!({
        "ok": true,
        "favs": sanitized["favs"].as_array().map(Vec::len).unwrap_or(0),
        "ratings": sanitized["ratings"].as_object().map(serde_json::Map::len).unwrap_or(0),
        "hidden": sanitized["hidden"].as_array().map(Vec::len).unwrap_or(0),
    });
    match atelier_core::atomic_write_json(&state.root.join(".fig_state.json"), &sanitized) {
        Ok(()) => (StatusCode::OK, Json(counts)).into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":error.to_string()})),
        )
            .into_response(),
    }
}

/// Réplique la sanitisation du POST /state Python : mêmes troncatures,
/// mêmes tris, mêmes valeurs autorisées — la validation vit côté serveur.
fn sanitize_gallery_state(request: &Value) -> Value {
    fn scalar(value: &Value) -> String {
        match value {
            Value::String(text) => text.clone(),
            other => other.to_string(),
        }
    }
    fn sorted_strings(value: Option<&Value>) -> Vec<String> {
        let Some(list) = value.and_then(Value::as_array) else {
            return Vec::new();
        };
        let set: std::collections::BTreeSet<String> = list.iter().map(scalar).collect();
        set.into_iter().collect()
    }

    let favs = sorted_strings(request.get("favs"));
    let hidden = sorted_strings(request.get("hidden"));

    let mut ratings = serde_json::Map::new();
    if let Some(map) = request.get("ratings").and_then(Value::as_object) {
        for (key, value) in map {
            if let Some(score) = value.as_i64()
                && (1..=5).contains(&score)
            {
                ratings.insert(key.clone(), json!(score));
            }
        }
    }

    let mut tags = serde_json::Map::new();
    if let Some(map) = request.get("tags").and_then(Value::as_object) {
        for (key, value) in map {
            let Some(list) = value.as_array().filter(|list| !list.is_empty()) else {
                continue;
            };
            let clean: Vec<String> = list
                .iter()
                .map(|tag| scalar(tag).trim().to_string())
                .filter(|tag| !tag.is_empty())
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .take(30)
                .collect();
            if !clean.is_empty() {
                tags.insert(key.clone(), json!(clean));
            }
        }
    }

    let hide_rules: Vec<String> = request
        .get("hideRules")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(Value::as_str)
                .map(|rule| rule.trim().to_string())
                .filter(|rule| !rule.is_empty())
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .take(200)
                .collect()
        })
        .unwrap_or_default();

    let mut collections = serde_json::Map::new();
    if let Some(map) = request.get("collections").and_then(Value::as_object) {
        for (key, value) in map {
            let name: String = key.trim().chars().take(80).collect();
            let Some(list) = value.as_array() else {
                continue;
            };
            if name.is_empty() {
                continue;
            }
            let clean: Vec<String> = list
                .iter()
                .filter_map(Value::as_str)
                .filter(|rel| !rel.trim().is_empty())
                .map(str::to_string)
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .take(1000)
                .collect();
            collections.insert(name, json!(clean));
        }
    }

    let mut workflow = serde_json::Map::new();
    if let Some(map) = request.get("workflow").and_then(Value::as_object) {
        const ALLOWED: [&str; 4] = ["draft", "candidate", "final", "rejected"];
        for (key, value) in map {
            if let Some(status) = value.as_str()
                && ALLOWED.contains(&status)
            {
                workflow.insert(key.clone(), json!(status));
            }
        }
    }

    json!({
        "favs": favs,
        "ratings": ratings,
        "hidden": hidden,
        "tags": tags,
        "hideRules": hide_rules,
        "collections": collections,
        "workflow": workflow,
    })
}

#[derive(serde::Deserialize, Default)]
struct AgentStatusQuery {
    limit: Option<usize>,
}

async fn agent_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AgentStatusQuery>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let mut payload = state.agent.lock().await.status(limit);
    if state.agent_token.is_empty() {
        payload["agentHost"] = Value::Null;
    }
    (StatusCode::OK, Json(payload)).into_response()
}

#[derive(serde::Deserialize)]
struct ProvenanceQuery {
    rel: String,
}

#[derive(serde::Deserialize)]
struct RegenerateRequest {
    rel: String,
}

async fn provenance(
    State(state): State<AppState>,
    Query(query): Query<ProvenanceQuery>,
) -> impl IntoResponse {
    let path = state.root.join("figures_data.json");
    let Ok(raw) = tokio::fs::read_to_string(path).await else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"figures_data.json not found"})),
        )
            .into_response();
    };
    let Ok(data) = serde_json::from_str::<Value>(&raw) else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":"invalid figures_data.json"})),
        )
            .into_response();
    };
    let item = data
        .get("files")
        .and_then(Value::as_array)
        .and_then(|files| {
            files
                .iter()
                .find(|file| file.get("rel").and_then(Value::as_str) == Some(query.rel.as_str()))
        });
    match item {
        Some(item) => (
            StatusCode::OK,
            Json(json!({"ok":true,"rel":query.rel,"provenance":item.get("provenance")})),
        )
            .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"artifact not found"})),
        )
            .into_response(),
    }
}

async fn regenerate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RegenerateRequest>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let data_path = state.root.join("figures_data.json");
    let Ok(raw) = tokio::fs::read_to_string(data_path).await else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"figures_data.json not found"})),
        )
            .into_response();
    };
    let Ok(data) = serde_json::from_str::<Value>(&raw) else {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":"invalid figures_data.json"})),
        )
            .into_response();
    };
    let Some(command) = data
        .get("files")
        .and_then(Value::as_array)
        .and_then(|files| {
            files
                .iter()
                .find(|file| file.get("rel").and_then(Value::as_str) == Some(request.rel.as_str()))
        })
        .and_then(|file| file.get("provenance"))
        .and_then(|provenance| provenance.get("command"))
        .and_then(Value::as_array)
    else {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"no declared argv command for this artifact"})),
        )
            .into_response();
    };
    // Même validation que Python : 1-32 arguments, chacun une chaîne de
    // 1 à 2000 caractères, et un seul message d'erreur pour tous les cas.
    let valid = !command.is_empty()
        && command.len() <= 32
        && command.iter().all(|arg| {
            arg.as_str()
                .is_some_and(|text| !text.is_empty() && text.chars().count() <= 2000)
        });
    if !valid {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"no declared argv command for this artifact"})),
        )
            .into_response();
    }
    let program = command[0].as_str().unwrap_or_default();
    let args: Vec<&str> = command.iter().skip(1).filter_map(Value::as_str).collect();
    let result = tokio::time::timeout(
        Duration::from_secs(900),
        Command::new(program)
            .args(args)
            .current_dir(&state.root)
            .output(),
    )
    .await;
    match result {
        Ok(Ok(output)) => {
            let ok = output.status.success();
            let mut combined = String::from_utf8_lossy(&output.stdout).into_owned();
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
            if ok {
                // Python relance le rebuild en arrière-plan sans bloquer la réponse.
                let root = state.root.clone();
                let watcher = state.watcher.clone();
                let revision = state.revision.clone();
                let lock = state.rebuild_lock.clone();
                tokio::spawn(async move {
                    rebuild(&root, &watcher, &revision, &lock).await;
                });
            }
            (
                StatusCode::OK,
                Json(json!({
                    "ok": ok,
                    "returncode": output.status.code().unwrap_or(-1),
                    "output": tail_chars(&combined, 6000),
                })),
            )
                .into_response()
        }
        Ok(Err(error)) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":error.to_string()})),
        )
            .into_response(),
        Err(_) => (
            StatusCode::REQUEST_TIMEOUT,
            Json(json!({"error":"regeneration timed out"})),
        )
            .into_response(),
    }
}

/// Derniers `limit` caractères (pas octets) d'un texte — équivalent du
/// slicing négatif Python utilisé pour borner les sorties de subprocess.
fn tail_chars(text: &str, limit: usize) -> String {
    let count = text.chars().count();
    text.chars().skip(count.saturating_sub(limit)).collect()
}

/// Même garde que les routes Python à cap explicite : Content-Length requis,
/// non nul et sous la limite (sinon 400 « bad size »).
fn body_size_allowed(headers: &HeaderMap, limit: u64) -> bool {
    headers
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|length| length > 0 && length <= limit)
        .unwrap_or(false)
}

#[derive(serde::Deserialize)]
struct IdsRequest {
    ids: Vec<String>,
    destination: Option<String>,
    consumer: Option<String>,
    status: Option<String>,
    result: Option<String>,
    error: Option<String>,
}

#[derive(serde::Deserialize)]
struct RegisterRequest {
    consumer: String,
    destination: String,
    label: Option<String>,
    #[serde(rename = "threadId", alias = "thread_id")]
    thread_id: Option<String>,
    automatic: Option<bool>,
    pid: Option<Value>,
}

#[derive(serde::Deserialize)]
struct SelectionQuery {
    consumer: String,
    destination: Option<String>,
}

fn loopback_origin(headers: &HeaderMap, own_port: u16) -> bool {
    let Some(origin) = headers.get("origin").and_then(|value| value.to_str().ok()) else {
        return true; // probes, navigation, fetch même origine : pas d'Origin
    };
    // webview de l'app (parité Node plan 005 : « origine webview autorisée »)
    if origin == "tauri://localhost" {
        return true;
    }
    let Some(rest) = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
    else {
        return false; // schémas inconnus et Origin « null » (iframe sandboxée)
    };
    let authority = rest.split('/').next().unwrap_or_default();
    let (host, port) = if let Some(value) = authority.strip_prefix('[') {
        let host = value.split(']').next().unwrap_or_default();
        let port = authority
            .split("]:")
            .nth(1)
            .and_then(|p| p.parse::<u16>().ok());
        (host, port)
    } else {
        let mut parts = authority.split(':');
        let host = parts.next().unwrap_or_default();
        let port = parts.next().and_then(|p| p.parse::<u16>().ok());
        (host, port)
    };
    // MÊME origine seulement, port compris : un autre serveur loopback ne peut
    // pas piloter la galerie (parité Node plan 005 — l'autre port → 403)
    let default_port = if origin.starts_with("https://") {
        443
    } else {
        80
    };
    matches!(host, "127.0.0.1" | "localhost" | "::1") && port.unwrap_or(default_port) == own_port
}

fn authorized(headers: &HeaderMap, token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    let expected = format!("Bearer {token}");
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == expected)
}

pub(crate) fn request_allowed(headers: &HeaderMap, state: &AppState) -> bool {
    (!state.remote && loopback_origin(headers, state.port))
        || authorized(headers, &state.agent_token)
}

fn trusted_static_path(requested: &str, bytes: &[u8]) -> bool {
    if requested.is_empty() || requested == "figures_index.html" {
        return true;
    }
    let Some(rel) = requested.strip_prefix(".fig_thumbs/") else {
        return false;
    };
    let Some(assets) = std::env::var_os("ATELIER_ASSETS_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("ATELIER_TOOL_ROOT").map(|root| PathBuf::from(root).join("assets"))
        })
    else {
        return false;
    };
    let Ok(candidate) = atelier_core::safe_project_path(&assets, rel) else {
        return false;
    };
    fs::read(candidate).is_ok_and(|bundled| bundled == bytes)
}

const VIDEO_EXTS: &[&str] = &["mp4", "m4v", "mov", "webm"];

fn is_video_path(path: &std::path::Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| VIDEO_EXTS.iter().any(|v| v.eq_ignore_ascii_case(e)))
}

/// Préflight CORS global (parité Python `do_OPTIONS` → 200 `{}`).
async fn options_middleware(req: Request, next: Next) -> axum::response::Response {
    if req.method() == Method::OPTIONS {
        return (StatusCode::OK, Json(json!({}))).into_response();
    }
    next.run(req).await
}

/// Frontière d'origine (plan 005) appliquée AVANT tout routage — parité avec
/// le serveur Node qui refuse l'inter-origines en amont. Les vérifications
/// locales des handlers restent (défense en profondeur), mais plus aucune
/// route ne peut être oubliée (vu : /data servi à une origine externe).
async fn origin_guard_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> axum::response::Response {
    if !request_allowed(req.headers(), &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "loopback origin required"})),
        )
            .into_response();
    }
    next.run(req).await
}

async fn remote_auth_middleware(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> axum::response::Response {
    if state.remote && !authorized(req.headers(), &state.agent_token) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "bearer token required"})),
        )
            .into_response();
    }
    next.run(req).await
}

/// `/` et `/figures_index.html` — coquille LIVE depuis le template bundlé
/// (parité Node serveLiveShell) ; fallback disque si les assets manquent.
async fn live_shell_route(State(state): State<AppState>) -> axum::response::Response {
    let headers = [
        ("content-type", "text/html; charset=utf-8"),
        ("cache-control", "no-cache"),
    ];
    if let Some(html) = &state.live_shell {
        return (StatusCode::OK, headers, html.to_string()).into_response();
    }
    match tokio::fs::read(state.root.join("figures_index.html")).await {
        Ok(bytes) => (StatusCode::OK, headers, bytes).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

async fn static_asset(
    State(state): State<AppState>,
    method: Method,
    headers: HeaderMap,
    uri: Uri,
) -> impl IntoResponse {
    if method != Method::GET && method != Method::HEAD {
        return (StatusCode::METHOD_NOT_ALLOWED, "method not allowed").into_response();
    }
    let requested = uri.path().trim_start_matches('/');
    let requested = if requested.is_empty() {
        "figures_index.html"
    } else {
        requested
    };
    let bundled = requested.strip_prefix(".fig_thumbs/").and_then(|rel| {
        std::env::var_os("ATELIER_ASSETS_DIR")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("ATELIER_TOOL_ROOT").map(|root| PathBuf::from(root).join("assets"))
            })
            .and_then(|assets| atelier_core::safe_project_path(&assets, rel).ok())
            .filter(|path| path.is_file())
    });
    let path = match bundled {
        Some(path) => path,
        None => match atelier_core::safe_project_path(&state.root, requested) {
            Ok(path) => path,
            Err(_) => return (StatusCode::NOT_FOUND, "not found").into_response(),
        },
    };
    let Ok(metadata) = tokio::fs::metadata(&path).await else {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    };
    if !metadata.is_file() {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }

    // HTTP Range for video (seek in <video>).
    if is_video_path(&path) {
        return serve_video(&path, &metadata, method, &headers).await;
    }

    let Ok(mut bytes) = tokio::fs::read(&path).await else {
        return (StatusCode::INTERNAL_SERVER_ERROR, "read failed").into_response();
    };
    let mut content_type = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    // Inject sel_overlay.js into project HTML (parité Python).
    let is_html = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"));
    let trusted = trusted_static_path(requested, &bytes);
    if is_html && !trusted {
        let tag = br#"<script defer src="/.fig_thumbs/sel_overlay.js?v=3"></script>"#;
        let lower = bytes.to_ascii_lowercase();
        if let Some(i) = find_subslice(&lower, b"</body>") {
            let mut out = Vec::with_capacity(bytes.len() + tag.len());
            out.extend_from_slice(&bytes[..i]);
            out.extend_from_slice(tag);
            out.extend_from_slice(&bytes[i..]);
            bytes = out;
        } else {
            bytes.extend_from_slice(tag);
        }
        content_type = "text/html; charset=utf-8".into();
    }

    let mut response = (
        StatusCode::OK,
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_str(&content_type)
                    .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        ],
        if method == Method::HEAD {
            Vec::new()
        } else {
            bytes
        },
    )
        .into_response();
    let executable = content_type.starts_with("text/html")
        || content_type == "application/xhtml+xml"
        || content_type == "image/svg+xml";
    if !trusted && executable {
        response.headers_mut().insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static("sandbox allow-scripts allow-forms allow-modals allow-popups"),
        );
    }
    response
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).rposition(|w| w == needle)
}

async fn serve_video(
    path: &std::path::Path,
    metadata: &std::fs::Metadata,
    method: Method,
    headers: &HeaderMap,
) -> axum::response::Response {
    let fsize = metadata.len();
    let ctype = mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string();
    let mut start = 0u64;
    let mut end = fsize.saturating_sub(1);
    let mut partial = false;
    if let Some(rng) = headers.get(header::RANGE).and_then(|v| v.to_str().ok())
        && let Some(spec) = rng.strip_prefix("bytes=")
    {
        let (s, e) = spec.split_once('-').unwrap_or((spec, ""));
        if !s.is_empty() {
            if let Ok(s) = s.parse::<u64>() {
                start = s;
                end = if e.is_empty() {
                    fsize.saturating_sub(1)
                } else {
                    e.parse::<u64>().unwrap_or(fsize.saturating_sub(1))
                };
                partial = true;
            }
        } else if let Ok(suffix) = e.parse::<u64>() {
            start = fsize.saturating_sub(suffix);
            end = fsize.saturating_sub(1);
            partial = true;
        }
        if start > end || start >= fsize {
            return (
                StatusCode::RANGE_NOT_SATISFIABLE,
                [(
                    header::CONTENT_RANGE,
                    HeaderValue::from_str(&format!("bytes */{fsize}"))
                        .unwrap_or_else(|_| HeaderValue::from_static("bytes */0")),
                )],
                Body::empty(),
            )
                .into_response();
        }
        end = end.min(fsize.saturating_sub(1));
    }
    let length = end - start + 1;
    let Ok(mut file) = tokio::fs::File::open(path).await else {
        return (StatusCode::INTERNAL_SERVER_ERROR, "read failed").into_response();
    };
    use tokio::io::{AsyncReadExt, AsyncSeekExt};
    if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "seek failed").into_response();
    }
    let mut buf = vec![0u8; length as usize];
    if method != Method::HEAD {
        let _ = file.read_exact(&mut buf).await;
    } else {
        buf.clear();
    }
    let status = if partial {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    let mut builder = axum::response::Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, ctype)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(
            header::CONTENT_LENGTH,
            if method == Method::HEAD {
                length
            } else {
                buf.len() as u64
            },
        );
    if partial {
        builder = builder.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{fsize}"),
        );
    }
    builder
        .body(Body::from(buf))
        .unwrap_or_else(|_| (StatusCode::INTERNAL_SERVER_ERROR, "response").into_response())
}

async fn quote(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    // Mêmes règles que le /quote Python : corps borné à 1 Mo, rel + text
    // obligatoires (chaînes), text tronqué à 100 000, comment à 10 000,
    // message « chemin (p.X) : « … » ».
    if !body_size_allowed(&headers, 1024 * 1024) {
        return (StatusCode::BAD_REQUEST, Json(json!({"error":"bad size"}))).into_response();
    }
    let (Some(raw_rel), Some(raw_text)) = (
        request.get("rel").and_then(Value::as_str),
        request.get("text").and_then(Value::as_str),
    ) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"rel and text must be strings"})),
        )
            .into_response();
    };
    let Ok(full) = atelier_core::safe_project_path(&state.root, raw_rel.trim()) else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"file not found"})),
        )
            .into_response();
    };
    if !full.is_file() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"file not found"})),
        )
            .into_response();
    }
    let rel = full
        .strip_prefix(&state.root)
        .unwrap_or(&full)
        .to_string_lossy()
        .replace('\\', "/");
    let text: String = raw_text.trim().chars().take(100_000).collect();
    if text.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"text is required"})),
        )
            .into_response();
    }
    let page = request.get("page").cloned().unwrap_or(Value::Null);
    let page_text = match &page {
        Value::String(value) => value.clone(),
        Value::Number(value) => value.to_string(),
        _ => String::new(),
    };
    let loc = if !page_text.is_empty() && page_text != "html" {
        format!(" (p.{page_text})")
    } else {
        String::new()
    };
    let mut message = format!("{}{loc} : \u{ab} {text} \u{bb} ", full.to_string_lossy());
    let comment: String = request
        .get("comment")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(10_000)
        .collect();
    if !comment.is_empty() {
        message = format!("{}\nCommentaire : {comment}", message.trim_end());
    }
    let direct = request
        .get("direct")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let held = request
        .get("held")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if state.agent_token.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({
                "ok": true, "message": message, "queuedForAgent": false,
                "agentHost": Value::Null,
            })),
        )
            .into_response();
    }
    let mut agent = state.agent.lock().await;
    let mut payload = serde_json::Map::new();
    payload.insert("type".to_string(), json!("text_annotation"));
    payload.insert("path".to_string(), json!(rel));
    payload.insert("page".to_string(), page);
    payload.insert("selection".to_string(), json!(text));
    payload.insert("comment".to_string(), json!(comment));
    payload.insert(
        "anchor".to_string(),
        agent::normalize_anchor(&request, &rel),
    );
    payload.insert("message".to_string(), json!(message));
    payload.insert("requestedDirect".to_string(), json!(direct));
    payload.extend(agent.delivery(
        request.get("action").and_then(Value::as_str),
        direct,
        request.get("destination").and_then(Value::as_str),
        request.get("batchId").and_then(Value::as_str),
        held,
    ));
    match agent.enqueue_event(payload) {
        Ok(event) => (
            StatusCode::OK,
            Json(json!({
                "embedded": true,
                "message": message,
                "agentHost": "codex",
                "queuedForAgent": true,
                "agentSelectionId": event["id"],
                "agentSelectionStatus": event["status"],
            })),
        )
            .into_response(),
        Err(error) => (StatusCode::CONFLICT, Json(json!({"error": error}))).into_response(),
    }
}

fn safe_annotation_stem(value: &str) -> String {
    let stem = std::path::Path::new(value)
        .file_stem()
        .and_then(|part| part.to_str())
        .unwrap_or("figure");
    let clean: String = stem
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if clean.is_empty() {
        "figure".to_string()
    } else {
        clean.chars().take(120).collect()
    }
}

async fn save_annotation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let Some(name) = request.get("name").and_then(Value::as_str) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"name and dataURL are required"})),
        )
            .into_response();
    };
    let Some(data_url) = request.get("dataURL").and_then(Value::as_str) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"name and dataURL are required"})),
        )
            .into_response();
    };
    let Some((prefix, encoded)) = data_url.split_once(',') else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"PNG dataURL required"})),
        )
            .into_response();
    };
    if !prefix.starts_with("data:image/png;base64") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"PNG dataURL required"})),
        )
            .into_response();
    }
    let Ok(raw) = BASE64.decode(encoded) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid PNG dataURL"})),
        )
            .into_response();
    };
    if raw.is_empty() || raw.len() > 64 * 1024 * 1024 {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error":"bad image size"})),
        )
            .into_response();
    }
    let out_dir = state.root.join(".fig_thumbs").join("annotation-previews");
    if let Err(error) = fs::create_dir_all(&out_dir) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":error.to_string()})),
        )
            .into_response();
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let rel = format!(
        ".fig_thumbs/annotation-previews/{}_annot_{}.png",
        safe_annotation_stem(name),
        stamp
    );
    let Ok(path) = atelier_core::safe_project_path(&state.root, &rel) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid annotation path"})),
        )
            .into_response();
    };
    if let Err(error) = tokio::fs::write(&path, raw).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":error.to_string()})),
        )
            .into_response();
    }
    let direct = request
        .get("direct")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let notes = request.get("notes").cloned().unwrap_or_else(|| json!([]));
    let mut message = rel.clone();
    if let Some(items) = notes.as_array() {
        let lines: Vec<String> = items
            .iter()
            .filter_map(|item| {
                let number = item.get("n").map(Value::to_string)?;
                let text = item.get("text").and_then(Value::as_str)?;
                Some(format!("{}. {}", number.trim_matches('"'), text))
            })
            .collect();
        if !lines.is_empty() {
            message.push_str("\nAnnotations (badges numerotes sur l'image) :\n");
            message.push_str(&lines.join("\n"));
        }
    }
    if direct {
        message.push_str("\nApplique directement ces annotations : retrouve le script qui genere cette figure, fais les corrections demandees et regenere la figure.");
    }
    if state.agent_token.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({
                "embedded": request.get("embed").and_then(Value::as_bool).unwrap_or(false),
                "message": message,
                "agentHost": Value::Null,
                "queuedForAgent": false,
                "path": rel,
            })),
        )
            .into_response();
    }
    let held = request
        .get("held")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut agent = state.agent.lock().await;
    let mut payload = serde_json::Map::new();
    payload.insert("type".to_string(), json!("image_annotation"));
    payload.insert("path".to_string(), json!(rel));
    payload.insert(
        "original".to_string(),
        request.get("name").cloned().unwrap_or(Value::Null),
    );
    payload.insert(
        "notes".to_string(),
        agent::normalize_notes(request.get("notes")),
    );
    payload.insert(
        "anchor".to_string(),
        json!({"kind": "image-region", "x": 0, "y": 0, "width": 1, "height": 1}),
    );
    payload.insert("message".to_string(), json!(message));
    payload.insert("requestedDirect".to_string(), json!(direct));
    payload.extend(agent.delivery(
        request.get("action").and_then(Value::as_str),
        direct,
        request.get("destination").and_then(Value::as_str),
        request.get("batchId").and_then(Value::as_str),
        held,
    ));
    let queued = match agent.enqueue_event(payload) {
        Ok(event) => event,
        Err(error) => return (StatusCode::CONFLICT, Json(json!({"error":error}))).into_response(),
    };
    (
        StatusCode::OK,
        Json(json!({
            "embedded": request.get("embed").and_then(Value::as_bool).unwrap_or(false),
            "message": message,
            "agentHost": "codex",
            "queuedForAgent": true,
            "agentSelectionId": queued["id"],
            "agentSelectionStatus": queued["status"],
            "path": rel,
        })),
    )
        .into_response()
}

async fn get_agent_selection(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) || !authorized(&headers, &state.agent_token) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"agent authorization required"})),
        )
            .into_response();
    }
    let agent = state.agent.lock().await;
    let (pending, latest) = agent.peek();
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "usage": "POST an annotation here; Codex reads it through the Atelier MCP tool",
            "pending": pending,
            "latest": latest,
        })),
    )
        .into_response()
}

#[derive(serde::Deserialize)]
struct PreferencesRequest {
    destination: String,
    automatic: Option<bool>,
    label: Option<String>,
}

async fn agent_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PreferencesRequest>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let mut agent = state.agent.lock().await;
    match agent.set_preferences(&request.destination, request.automatic, request.label) {
        Ok(destination) => (
            StatusCode::OK,
            Json(json!({"ok": true, "destination": destination})),
        )
            .into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct BatchRequest {
    #[serde(rename = "batchId", alias = "batch_id")]
    batch_id: Option<String>,
}

async fn batch_release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BatchRequest>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let batch_id = request.batch_id.unwrap_or_default();
    let mut agent = state.agent.lock().await;
    match agent.release_batch(&batch_id) {
        Ok(released) => {
            let ids: Vec<_> = released
                .iter()
                .filter_map(|item| item.get("id").cloned())
                .collect();
            (
                StatusCode::OK,
                Json(json!({"ok": true, "released": released.len(), "ids": ids})),
            )
                .into_response()
        }
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response(),
    }
}

async fn batch_cancel(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BatchRequest>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let batch_id = request.batch_id.unwrap_or_default();
    let mut agent = state.agent.lock().await;
    match agent.cancel_batch(&batch_id) {
        Ok(cancelled) => {
            let ids: Vec<_> = cancelled
                .iter()
                .filter_map(|item| item.get("id").cloned())
                .collect();
            (
                StatusCode::OK,
                Json(json!({"ok": true, "cancelled": cancelled.len(), "ids": ids})),
            )
                .into_response()
        }
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error": error}))).into_response(),
    }
}

async fn selection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<Value>,
) -> impl IntoResponse {
    if !authorized(&headers, &state.agent_token) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"agent authorization required"})),
        )
            .into_response();
    }
    // Même contrat que le /agent-selection Python : corps borné à 1 Mo,
    // path|rel obligatoire, type par défaut "annotation", aucun champ texte
    // requis (les annotations d'artefact n'en ont pas) — la sélection texte
    // passe par /quote. source/region/anchor/notes suivent les mêmes
    // normalisations.
    if !body_size_allowed(&headers, 1024 * 1024) {
        return (StatusCode::BAD_REQUEST, Json(json!({"error":"bad size"}))).into_response();
    }
    let raw_rel = request
        .get("path")
        .or_else(|| request.get("rel"))
        .cloned()
        .unwrap_or(json!(""));
    let Some(requested_path) = raw_rel.as_str().map(str::trim) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"path must be a string"})),
        )
            .into_response();
    };
    let mut agent = state.agent.lock().await;
    let rel = match agent.resolve_rel(requested_path) {
        Ok(rel) if !requested_path.is_empty() => rel,
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": format!("file not found: {requested_path}")})),
            )
                .into_response();
        }
    };
    let source = request
        .get("source")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| agent.resolve_rel(value).ok());
    let event_type: String = request
        .get("type")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("annotation")
        .chars()
        .take(80)
        .collect();
    let comment: String = request
        .get("comment")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .chars()
        .take(10_000)
        .collect();
    let direct = request
        .get("direct")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let held = request
        .get("held")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let region = request
        .get("region")
        .filter(|value| value.is_object())
        .cloned()
        .unwrap_or(Value::Null);
    let mut payload = serde_json::Map::new();
    payload.insert("type".to_string(), json!(event_type));
    payload.insert("path".to_string(), json!(rel));
    payload.insert(
        "source".to_string(),
        source.map(|s| json!(s)).unwrap_or(Value::Null),
    );
    payload.insert("comment".to_string(), json!(comment));
    payload.insert("region".to_string(), region);
    payload.insert(
        "anchor".to_string(),
        agent::normalize_anchor(&request, &rel),
    );
    payload.insert(
        "notes".to_string(),
        agent::normalize_notes(request.get("notes")),
    );
    payload.insert("requestedDirect".to_string(), json!(direct));
    payload.extend(agent.delivery(
        request.get("action").and_then(Value::as_str),
        direct,
        request.get("destination").and_then(Value::as_str),
        request.get("batchId").and_then(Value::as_str),
        held,
    ));
    match agent.enqueue_event(payload) {
        Ok(event) => (
            StatusCode::OK,
            Json(json!({"ok":true,"queuedForAgent":true,"id":event["id"]})),
        )
            .into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn register_consumer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RegisterRequest>,
) -> impl IntoResponse {
    if !authorized(&headers, &state.agent_token) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"agent authorization required"})),
        )
            .into_response();
    }
    let mut agent = state.agent.lock().await;
    match agent.register(
        request.destination,
        request.consumer,
        request.label,
        request.thread_id,
        request.automatic,
        request.pid,
    ) {
        Ok(destination) => (
            StatusCode::OK,
            Json(json!({"ok":true,"destination":destination})),
        )
            .into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn selections(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SelectionQuery>,
) -> impl IntoResponse {
    if !authorized(&headers, &state.agent_token) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"agent authorization required"})),
        )
            .into_response();
    }
    let destination = query.destination.unwrap_or_else(|| query.consumer.clone());
    let mut agent = state.agent.lock().await;
    match agent.claim(&query.consumer, &destination) {
        Ok(items) => {
            let count = items.len();
            (StatusCode::OK, Json(json!({"items":items,"count":count}))).into_response()
        }
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn acknowledge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<IdsRequest>,
) -> impl IntoResponse {
    if !authorized(&headers, &state.agent_token) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"agent authorization required"})),
        )
            .into_response();
    }
    let mut agent = state.agent.lock().await;
    match agent.acknowledge(
        &request.ids,
        request.consumer.as_deref().unwrap_or_default(),
    ) {
        Ok(count) => (
            StatusCode::OK,
            Json(json!({"ok":true,"acknowledged":count})),
        )
            .into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn release(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<IdsRequest>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let Some(destination) = request.destination else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"destination is required"})),
        )
            .into_response();
    };
    let mut agent = state.agent.lock().await;
    match agent.release(&request.ids, destination) {
        Ok(count) => (StatusCode::OK, Json(json!({"ok":true,"released":count}))).into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn delete_annotations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<IdsRequest>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let mut agent = state.agent.lock().await;
    match agent.delete(&request.ids) {
        Ok(count) => (StatusCode::OK, Json(json!({"ok":true,"deleted":count}))).into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn restore_annotations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<IdsRequest>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let mut agent = state.agent.lock().await;
    match agent.restore(&request.ids) {
        Ok(count) => (StatusCode::OK, Json(json!({"ok":true,"restored":count}))).into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn annotation_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<IdsRequest>,
) -> impl IntoResponse {
    if !authorized(&headers, &state.agent_token) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"agent authorization required"})),
        )
            .into_response();
    }
    let mut agent = state.agent.lock().await;
    match agent.update_status(
        &request.ids,
        request.status.as_deref().unwrap_or_default(),
        request.result.as_deref().unwrap_or_default(),
        request.error.as_deref().unwrap_or_default(),
    ) {
        Ok(count) => (StatusCode::OK, Json(json!({"ok":true,"updated":count}))).into_response(),
        Err(error) => (StatusCode::BAD_REQUEST, Json(json!({"error":error}))).into_response(),
    }
}

async fn rescan(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let outcome = rebuild(
        &state.root,
        &state.watcher,
        &state.revision,
        &state.rebuild_lock,
    )
    .await;
    (
        StatusCode::OK,
        Json(json!({"ok": outcome.ok, "out": outcome.out})),
    )
        .into_response()
}

/// Résultat d'un rebuild — ce que /rescan renvoie au client, aligné sur le
/// contrat Python `{"ok": rc == 0, "out": derniers 200 caractères}`.
pub(crate) struct RebuildOutcome {
    ok: bool,
    out: String,
}

impl RebuildOutcome {
    fn failure(message: impl Into<String>) -> Self {
        Self {
            ok: false,
            out: message.into(),
        }
    }
}

pub(crate) async fn rebuild(
    root: &std::path::Path,
    status: &Arc<RwLock<WatcherStatus>>,
    revision: &Arc<RwLock<u64>>,
    rebuild_lock: &Arc<Mutex<()>>,
) -> RebuildOutcome {
    let _guard = rebuild_lock.lock().await;
    let assets = std::env::var_os("ATELIER_ASSETS_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("ATELIER_TOOL_ROOT").map(|path| PathBuf::from(path).join("assets"))
        });
    let Some(assets) = assets.filter(|path| path.join("gallery_template.html").is_file()) else {
        let message = "Atelier assets directory is not configured";
        status.write().await.error = Some(message.to_string());
        return RebuildOutcome::failure(message);
    };
    let options = atelier_core::gallery_builder::GalleryBuildOptions {
        root: root.to_path_buf(),
        template: assets.join("gallery_template.html"),
        title: std::env::var("GALLERY_TITLE").unwrap_or_else(|_| "Atelier".into()),
        extensions: atelier_core::gallery_builder::parse_extensions(
            std::env::var("GALLERY_EXTS").ok().as_deref(),
        ),
        show_frames: std::env::var_os("GALLERY_SHOW_FRAMES").is_some(),
        no_thumbs: std::env::var_os("GALLERY_NO_THUMBS").is_some(),
        // cache-bust des assets UI par version d'app (parité Node ver:BUNDLE_HASH)
        version_tag: std::env::var("ATELIER_BUNDLE_HASH")
            .ok()
            .filter(|hash| !hash.is_empty() && hash != "dev"),
    };
    let result =
        tokio::task::spawn_blocking(move || atelier_core::gallery_builder::build(&options)).await;
    let mut current = status.write().await;
    match result {
        Ok(Ok(built)) => {
            *revision.write().await += 1;
            current.last_build_at = Some(now());
            current.error = None;
            RebuildOutcome {
                ok: true,
                out: format!("{} files indexed -> {}", built.count, built.index.display()),
            }
        }
        Ok(Err(error)) => {
            let message = error.to_string();
            current.error = Some(message.clone());
            RebuildOutcome::failure(message)
        }
        Err(error) => RebuildOutcome::failure(error.to_string()),
    }
}

async fn start_watcher(state: AppState) -> Result<(), String> {
    let (tx, mut rx) = mpsc::unbounded_channel::<Result<Event, notify::Error>>();
    let root = state.root.clone();
    let tx_for_watcher = tx.clone();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx_for_watcher.send(event);
    })
    .map_err(|error| error.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;
    {
        let mut status = state.watcher.write().await;
        status.running = true;
    }
    let _keep_watcher_alive = watcher;
    let mut pending: Vec<String> = Vec::new();
    loop {
        tokio::select! {
            Some(event) = rx.recv() => {
                match event {
                    Ok(event) if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) => {
                        let changed: Vec<String> = event.paths.iter().filter_map(|path| relevant_change(&root, path)).collect();
                        pending.extend(changed);
                        pending.sort();
                        pending.dedup();
                        let mut status = state.watcher.write().await;
                        status.last_event_at = Some(now());
                        status.last_changed = pending.iter().take(50).cloned().collect();
                    }
                    Err(error) => state.watcher.write().await.error = Some(error.to_string()),
                    _ => {}
                }
            }
            _ = sleep(Duration::from_millis(900)), if !pending.is_empty() => {
                let changed = std::mem::take(&mut pending);
                rebuild(
                    &root,
                    &state.watcher,
                    &state.revision,
                    &state.rebuild_lock,
                )
                .await;
                state.watcher.write().await.last_changed = changed.into_iter().take(50).collect();
            }
        }
    }
}

/// Studio local editor token — mirrors `gallery/server/shared.mjs` galleryToken().
fn ensure_gallery_token() {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return;
    };
    let dir = home.join(".atelier-studio");
    let file = dir.join("gallery_token");
    if file.is_file() {
        return;
    }
    let _ = fs::create_dir_all(&dir);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
    }
    use std::io::Write;
    let mut bytes = [0u8; 32];
    if let Ok(mut f) = fs::File::open("/dev/urandom") {
        use std::io::Read;
        let _ = f.read_exact(&mut bytes);
    }
    let tok = hex::encode(bytes);
    // wx: first process wins
    if let Ok(mut out) = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file)
    {
        let _ = out.write_all(tok.as_bytes());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&file, fs::Permissions::from_mode(0o600));
        }
    }
}

fn expand_home(path: &str) -> PathBuf {
    if path == "~" {
        return std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
    }
    if let Some(rest) = path.strip_prefix("~/")
        && let Ok(home) = std::env::var("HOME")
    {
        return PathBuf::from(home).join(rest);
    }
    PathBuf::from(path)
}

fn resolve_root(args: &Args) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let raw = std::env::var("GALLERY_ROOT")
        .map(|s| expand_home(&s))
        .unwrap_or_else(|_| args.root.clone());
    Ok(fs::canonicalize(&raw).unwrap_or(raw))
}

fn resolve_port(args: &Args) -> u16 {
    std::env::var("FIG_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|p| *p > 0)
        .unwrap_or(args.port)
}

fn iso_now() -> String {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs() as i64;
    let millis = d.subsec_millis();
    // Minimal UTC formatter (same approach as atelier-runtime).
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let tod = secs.rem_euclid(86_400) as u32;
    let h = tod / 3600;
    let mi = (tod % 3600) / 60;
    let s = tod % 60;
    format!("{y:04}-{m:02}-{day:02}T{h:02}:{mi:02}:{s:02}.{millis:03}Z")
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let root = resolve_root(&args)?;
    let port = resolve_port(&args);
    let remote = !matches!(
        args.host.as_str(),
        "127.0.0.1" | "localhost" | "::1" | "[::1]"
    );
    if remote && std::env::var("ATELIER_ALLOW_REMOTE").as_deref() != Ok("1") {
        return Err("refusing non-loopback bind; set ATELIER_ALLOW_REMOTE=1 explicitly".into());
    }
    let agent_token = std::env::var("ATELIER_AGENT_TOKEN").unwrap_or_default();
    if remote && agent_token.is_empty() {
        return Err("remote bind requires ATELIER_AGENT_TOKEN".into());
    }

    // Studio mode: always mint/read gallery_token for out-of-project editor URLs.
    if std::env::var("ATELIER_STUDIO").as_deref() == Ok("1") {
        ensure_gallery_token();
    }

    let started_at = iso_now();
    let app_version = std::env::var("ATELIER_APP_VERSION").unwrap_or_else(|_| "dev".into());
    let bundle_hash = std::env::var("ATELIER_BUNDLE_HASH").unwrap_or_else(|_| "dev".into());

    // Boot rebuild if index/data missing (parity with gallery/server/main.mjs).
    let data_path = root.join("figures_data.json");
    let shell_path = root.join("figures_index.html");
    if !data_path.is_file() || !shell_path.is_file() {
        eprintln!("[gallery] initial build for {}", root.display());
        let lock = Arc::new(Mutex::new(()));
        let watcher = Arc::new(RwLock::new(WatcherStatus::default()));
        let revision = Arc::new(RwLock::new(0u64));
        let _ = rebuild(&root, &watcher, &revision, &lock).await;
    }

    let initial_revision = artifact_snapshot(&root)
        .map(|snapshot| snapshot.len() as u64)
        .unwrap_or_default();
    let cpu = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let thumb_permits = cpu.clamp(2, 8);
    // Coquille live (parité Node serveLiveShell) : `/` et `/figures_index.html`
    // rendus depuis le TEMPLATE BUNDLÉ, jamais le fichier disque du projet —
    // un autre outil (cmux sur le même dossier) peut écraser celui-ci avec un
    // template dont les assets n'existent pas côté Atelier (page cassée).
    let live_shell: Option<Arc<str>> = std::env::var_os("ATELIER_ASSETS_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("ATELIER_TOOL_ROOT").map(|r| PathBuf::from(r).join("assets")))
        .map(|assets| assets.join("gallery_template.html"))
        .filter(|template| template.is_file())
        .and_then(|template| {
            atelier_core::gallery_builder::render_live_shell(
                &atelier_core::gallery_builder::GalleryBuildOptions {
                    root: root.clone(),
                    template,
                    title: std::env::var("GALLERY_TITLE").unwrap_or_else(|_| "Atelier".into()),
                    extensions: None,
                    show_frames: false,
                    no_thumbs: true,
                    version_tag: Some(bundle_hash.clone())
                        .filter(|hash| !hash.is_empty() && hash != "dev"),
                },
            )
            .ok()
        })
        .map(Arc::from);
    let state = AppState {
        root: root.clone(),
        port,
        revision: Arc::new(RwLock::new(initial_revision)),
        watcher: Arc::new(RwLock::new(WatcherStatus {
            enabled: args.watch && !args.no_watch,
            ..Default::default()
        })),
        agent: Arc::new(Mutex::new(AgentStore::load(&root))),
        rebuild_lock: Arc::new(Mutex::new(())),
        agent_token,
        remote,
        events: Arc::new(Mutex::new(EventStore::new())),
        thumb_sem: Arc::new(Semaphore::new(thumb_permits)),
        chrome_sem: Arc::new(Semaphore::new(2)),
        board: Arc::new(Mutex::new(BoardQueue::default())),
        workspace_lock: Arc::new(Mutex::new(())),
        zotero: Arc::new(std::sync::Mutex::new(ZoteroCache::default())),
        started_at,
        app_version,
        bundle_hash,
        live_shell,
    };
    if args.watch && !args.no_watch {
        let watcher_state = state.clone();
        tokio::spawn(async move {
            if let Err(error) = start_watcher(watcher_state.clone()).await {
                let mut status = watcher_state.watcher.write().await;
                status.error = Some(error);
                status.running = false;
            }
        });
    }
    let app = Router::new()
        .route("/", get(live_shell_route))
        .route("/figures_index.html", get(live_shell_route))
        .route("/ping", get(ping))
        .route("/health", get(health))
        .route("/rev", get(revision))
        .route("/data", get(data))
        .route("/state", get(gallery_state).post(save_gallery_state))
        // Phase 1 — fichiers, état, éditeurs
        .route("/ls", get(files::ls))
        .route("/snippet", get(files::snippet))
        .route("/raw", get(files::raw))
        .route("/code", get(files::code))
        .route("/texroot", get(files::texroot))
        .route("/findscript", get(files::findscript))
        .route("/findfile", get(files::findfile))
        .route("/codesave", post(files::codesave))
        .route("/save-svg", post(files::save_svg))
        .route("/selinfo", post(files::selinfo))
        // Phase 2 — galerie, miniatures, actions, toast events
        .route("/thumb", get(gallery::thumb))
        .route("/rasterize", get(gallery::rasterize))
        .route("/delete", post(gallery::delete))
        .route("/export", post(gallery::export))
        .route("/open", post(gallery::open_path))
        .route("/clear-quote", post(gallery::clear_quote))
        .route("/claude-targets", get(gallery::claude_targets))
        .route("/quote", get(gallery::get_quote).post(quote))
        .route("/agent-events", get(gallery::agent_events))
        .route("/claude-events", get(gallery::agent_events))
        .route("/agent-event", post(gallery::post_agent_event))
        .route("/claude-event", post(gallery::post_agent_event))
        // Phase 3 — Git + historique de versions
        .route("/githead", get(git::githead))
        .route("/gitlog", get(git::gitlog))
        .route("/gitshow", get(git::gitshow))
        .route("/commitmsg", get(git::commitmsg))
        .route("/gitcommit", post(git::gitcommit))
        .route("/versions", get(git::get_versions).post(git::post_versions))
        // Phase 4 — LaTeX / PDF / export PNG
        .route("/latex-suggest", post(suggest::latex_suggest))
        .route("/compile", post(documents::compile))
        .route("/synctex", post(documents::synctex))
        .route(
            "/pdfannot",
            get(documents::get_pdfannot).post(documents::post_pdfannot),
        )
        .route("/export-png", post(documents::export_png))
        .route("/lint", get(documents::lint))
        // Phase 5 — notes + whiteboard
        .route("/notes/load", get(workspace::notes_load))
        .route("/notes/save", post(workspace::notes_save))
        .route("/board/load", get(workspace::board_load))
        .route("/board/save", post(workspace::board_save))
        .route("/board/poll", get(workspace::board_poll))
        .route("/board/command", post(workspace::board_command))
        .route("/notes/open-surface", post(workspace::open_surface))
        .route("/board/open-surface", post(workspace::open_surface))
        // Phase 6 — Zotero
        .route("/zotero-items", get(zotero::zotero_items))
        .route("/zotero-collections", get(zotero::zotero_collections))
        .route("/zotero-fav", post(zotero::zotero_fav))
        .route("/zotero-add", post(zotero::zotero_add))
        .route("/zotero/{key}/{fname}", get(zotero::zotero_pdf))
        // Phase 7 — hôte macOS
        .route("/orca-fullscreen-exit", post(host::orca_fullscreen_exit))
        .route(
            "/orca-native-fullscreen",
            post(host::orca_native_fullscreen),
        )
        // Phase 8 — agent bridge remaining endpoints
        .route("/agent-status", get(agent_status))
        .route("/provenance", get(provenance))
        .route("/regenerate", post(regenerate))
        .route("/rescan", post(rescan))
        .route("/save", post(save_annotation))
        .route("/agent-selection", get(get_agent_selection).post(selection))
        .route("/agent-consumers/register", post(register_consumer))
        .route("/agent-selections", get(selections))
        .route("/agent-selections/ack", post(acknowledge))
        .route("/agent-annotations/release", post(release))
        .route("/agent-annotations/delete", post(delete_annotations))
        .route("/agent-annotations/restore", post(restore_annotations))
        .route("/agent-annotations/status", post(annotation_status))
        .route("/agent-preferences", post(agent_preferences))
        .route("/agent-batches/release", post(batch_release))
        .route("/agent-batches/cancel", post(batch_cancel))
        .fallback(static_asset)
        // couche la plus INTERNE : s'exécute après options/remote-auth, avant les routes
        .layer(middleware::from_fn_with_state(
            state.clone(),
            origin_guard_middleware,
        ))
        .layer(middleware::from_fn(options_middleware))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            remote_auth_middleware,
        ))
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    let address = format!("{}:{port}", args.host);
    let listener = tokio::net::TcpListener::bind(&address).await?;
    eprintln!(
        "atelier-gallery-server listening on http://{address} root={} backend=rust",
        root.display()
    );
    axum::serve(listener, app).await?;
    Ok(())
}
