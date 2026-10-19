//! Phase 5 — notes.md + whiteboard tldraw + file de commandes + open-surface.

use atelier_core::{atomic_write, atomic_write_text, safe_project_path};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    fs,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::process::Command;

use crate::{AppState, request_allowed};

pub const BOARD_QUEUE_MAX: usize = 500;
const NOTES_MAX: u64 = 16 * 1024 * 1024;
const BOARD_MAX: u64 = 64 * 1024 * 1024;
const COMMAND_MAX: u64 = 8 * 1024 * 1024;

#[derive(Default)]
pub(crate) struct BoardQueue {
    cmds: VecDeque<Value>,
}

impl BoardQueue {
    pub fn push(&mut self, cmd: Value) -> Result<(), ()> {
        if self.cmds.len() >= BOARD_QUEUE_MAX {
            return Err(());
        }
        self.cmds.push_back(cmd);
        Ok(())
    }

    pub fn drain(&mut self) -> Vec<Value> {
        self.cmds.drain(..).collect()
    }

    pub fn len(&self) -> usize {
        self.cmds.len()
    }
}

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

fn body_len_ok(headers: &HeaderMap, limit: u64) -> bool {
    headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        .map(|n| n > 0 && n <= limit)
        .unwrap_or(false)
}

fn agent_or_no_push(state: &AppState) -> bool {
    !state.agent_token.is_empty()
        || std::env::var("ATELIER_AGENT_HOST")
            .map(|v| !v.is_empty())
            .unwrap_or(false)
        || std::env::var("ATELIER_STUDIO").as_deref() == Ok("1")
        || std::env::var("CLAUDE_PREVIEW").as_deref() == Ok("1")
}

fn keep_previous(path: &Path) {
    if path.is_file() {
        let bak = PathBuf::from(format!("{}.bak", path.display()));
        let _ = fs::copy(path, bak);
    }
}

/// Version d'un fichier de l'atelier (notes.md, tableau blanc) : empreinte
/// du contenu, absent valant vide. L'éditeur la renvoie en `base` à chaque
/// sauvegarde ; un écart veut dire qu'un autre écrivain (agent, autre
/// fenêtre) a changé le fichier depuis le chargement (audit du 2026-10-18,
/// problème 6).
pub(crate) fn content_version(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().take(12).map(|b| format!("{b:02x}")).collect()
}

/// Contenu actuel du fichier, `None` si absent ; erreur d'E/S remontée.
fn read_current(path: &Path) -> std::io::Result<Option<Vec<u8>>> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Dernière version écrite par chaque fenêtre d'éditeur (`writer`, tiré au
/// hasard à l'ouverture), par fichier. Une sauvegarde envoyée par
/// `sendBeacon` (onglet caché ou fermé) écrit le fichier sans que l'éditeur
/// lise jamais la réponse : sa `base` reste l'ancienne version. Sans cette
/// mémoire, la sauvegarde suivante de la même fenêtre recevait un 409 alors
/// que personne d'autre n'avait écrit, et la frappe suivante restait non
/// enregistrée (relecture du 2026-10-19). Perdue au redémarrage du serveur :
/// on retombe alors sur le 409, jamais sur un écrasement.
#[derive(Default)]
pub(crate) struct WorkspaceWriters {
    last: HashMap<(&'static str, String), String>,
}

/// Plafond de fenêtres mémorisées ; au-delà on repart de zéro (409 au pire).
const WRITERS_MAX: usize = 256;

impl WorkspaceWriters {
    fn wrote(&mut self, file: &'static str, writer: Option<&str>, version: &str) {
        let Some(writer) = writer.filter(|w| !w.is_empty()) else {
            return;
        };
        if self.last.len() >= WRITERS_MAX {
            self.last.clear();
        }
        self.last
            .insert((file, writer.to_string()), version.to_string());
    }

    fn last_write(&self, file: &'static str, writer: Option<&str>) -> Option<&str> {
        let writer = writer.filter(|w| !w.is_empty())?;
        self.last
            .get(&(file, writer.to_string()))
            .map(String::as_str)
    }
}

/// `Some(contenu du disque)` quand `base` est donné et ne correspond plus au
/// disque, sauf si le disque porte encore la dernière écriture de cette même
/// fenêtre : sa base est seulement en retard sur sa propre sauvegarde (beacon
/// ou réponse pas encore lue), aucun autre écrivain n'est passé entre-temps.
/// Sans `base` (agents, scripts, anciens clients), pas de contrôle.
fn stale_base(
    path: &Path,
    base: Option<&str>,
    own_last: Option<&str>,
) -> Result<Option<Vec<u8>>, axum::response::Response> {
    let Some(base) = base else { return Ok(None) };
    let current = read_current(path)
        .map_err(|error| json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?
        .unwrap_or_default();
    let version = content_version(&current);
    if version == base || own_last == Some(version.as_str()) {
        Ok(None)
    } else {
        Ok(Some(current))
    }
}

/// Une sauvegarde refusée (409) n'est pas jetée : elle est gardée à côté du
/// fichier (`<fichier>.conflit`), qui n'est jamais relu en silence. Ainsi la
/// frappe envoyée à la fermeture d'un onglet en conflit survit.
fn keep_rejected(path: &Path, bytes: &[u8]) -> Option<String> {
    let rescue = PathBuf::from(format!("{}.conflit", path.display()));
    atomic_write(&rescue, bytes).ok()?;
    rescue
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

pub async fn notes_load(State(state): State<AppState>) -> impl IntoResponse {
    let path = state.root.join("notes.md");
    match tokio::fs::read(&path).await {
        Ok(bytes) => {
            let markdown = String::from_utf8_lossy(&bytes).into_owned();
            let version = content_version(&bytes);
            (
                StatusCode::OK,
                Json(json!({"markdown": markdown, "version": version})),
            )
                .into_response()
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let version = content_version(b"");
            (
                StatusCode::OK,
                Json(json!({"markdown": "", "version": version})),
            )
                .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

#[derive(Deserialize)]
pub struct NotesSaveBody {
    markdown: Value,
    /// Version chargée par l'éditeur (`content_version`) ; absente = pas de
    /// contrôle de conflit.
    #[serde(default)]
    base: Option<String>,
    /// Identifiant de la fenêtre (voir `WorkspaceWriters`).
    #[serde(default)]
    writer: Option<String>,
}

pub async fn notes_save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<NotesSaveBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if !body_len_ok(&headers, NOTES_MAX) {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "empty or oversized notes"})),
        )
            .into_response();
    }
    let Some(md) = body.markdown.as_str() else {
        return json_error(StatusCode::BAD_REQUEST, "markdown must be a string");
    };
    let path = state.root.join("notes.md");
    let writer = body.writer.as_deref();
    let mut writers = state.workspace_lock.lock().await;
    match stale_base(
        &path,
        body.base.as_deref(),
        writers.last_write("notes", writer),
    ) {
        Err(response) => return response,
        Ok(Some(current)) => {
            // le fichier a changé depuis le chargement : rien n'est écrit,
            // l'éditeur garde sa version et reçoit celle du disque
            return (
                StatusCode::CONFLICT,
                Json(json!({
                    "error": "conflict",
                    "markdown": String::from_utf8_lossy(&current),
                    "version": content_version(&current),
                    "rescue": keep_rejected(&path, md.as_bytes()),
                })),
            )
                .into_response();
        }
        Ok(None) => {}
    }
    keep_previous(&path);
    match atomic_write_text(&path, md) {
        Ok(()) => {
            let version = content_version(md.as_bytes());
            writers.wrote("notes", writer, &version);
            (
                StatusCode::OK,
                Json(json!({"ok": true, "version": version})),
            )
                .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

pub async fn board_load(State(state): State<AppState>) -> impl IntoResponse {
    let path = state.root.join(".fig_thumbs").join("board.tldr.json");
    match tokio::fs::read_to_string(&path).await {
        Ok(raw) => match serde_json::from_str::<Value>(&raw) {
            Ok(snapshot) => (
                StatusCode::OK,
                Json(json!({"snapshot": snapshot, "version": content_version(raw.as_bytes())})),
            )
                .into_response(),
            Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (
            StatusCode::OK,
            Json(json!({"snapshot": null, "version": content_version(b"")})),
        )
            .into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

#[derive(Deserialize)]
pub struct BoardSaveBody {
    snapshot: Value,
    /// Version chargée (`content_version`) ; absente = pas de contrôle.
    #[serde(default)]
    base: Option<String>,
    /// Identifiant de la fenêtre (voir `WorkspaceWriters`).
    #[serde(default)]
    writer: Option<String>,
}

pub async fn board_save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<BoardSaveBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if !body_len_ok(&headers, BOARD_MAX) {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "empty or oversized snapshot"})),
        )
            .into_response();
    }
    if !body.snapshot.is_object() {
        return json_error(StatusCode::BAD_REQUEST, "snapshot must be an object");
    }
    let dir = state.root.join(".fig_thumbs");
    let path = dir.join("board.tldr.json");
    let writer = body.writer.as_deref();
    let mut writers = state.workspace_lock.lock().await;
    if let Err(error) = fs::create_dir_all(&dir) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    // Python: json.dump without indent — compact is fine for parity of content.
    let payload = match serde_json::to_vec(&body.snapshot) {
        Ok(bytes) => bytes,
        Err(error) => return json_error(StatusCode::BAD_REQUEST, error.to_string()),
    };
    match stale_base(
        &path,
        body.base.as_deref(),
        writers.last_write("board", writer),
    ) {
        Err(response) => return response,
        Ok(Some(current)) => {
            return (
                StatusCode::CONFLICT,
                Json(json!({
                    "error": "conflict",
                    "version": content_version(&current),
                    "rescue": keep_rejected(&path, &payload),
                })),
            )
                .into_response();
        }
        Ok(None) => {}
    }
    keep_previous(&path);
    match atomic_write(&path, &payload) {
        Ok(()) => {
            let version = content_version(&payload);
            writers.wrote("board", writer, &version);
            (
                StatusCode::OK,
                Json(json!({"ok": true, "version": version})),
            )
                .into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

pub async fn board_poll(State(state): State<AppState>) -> impl IntoResponse {
    let cmds = state.board.lock().await.drain();
    (StatusCode::OK, Json(json!({"commands": cmds}))).into_response()
}

pub async fn board_command(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(mut cmd): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if !body_len_ok(&headers, COMMAND_MAX) {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "empty or oversized command"})),
        )
            .into_response();
    }
    let Some(obj) = cmd.as_object_mut() else {
        return json_error(StatusCode::BAD_REQUEST, "command needs a string 'type'");
    };
    let Some(cmd_type) = obj.get("type").and_then(Value::as_str).map(str::to_string) else {
        return json_error(StatusCode::BAD_REQUEST, "command needs a string 'type'");
    };
    if cmd_type == "add_image" {
        let rel = obj
            .get("url")
            .or_else(|| obj.get("rel"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim_start_matches('/')
            .to_string();
        let Ok(full) = safe_project_path(&state.root, &rel) else {
            return json_error(StatusCode::NOT_FOUND, "image not found in project");
        };
        if !full.is_file() {
            return json_error(StatusCode::NOT_FOUND, "image not found in project");
        }
        let rel = full
            .strip_prefix(&state.root)
            .unwrap_or(&full)
            .to_string_lossy()
            .replace('\\', "/");
        obj.insert("url".into(), json!(format!("/{rel}")));
    }
    match state.board.lock().await.push(cmd) {
        Ok(()) => (StatusCode::OK, Json(json!({"ok": true, "queued": true}))).into_response(),
        Err(()) => (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": "board queue full (canvas not open?)"})),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// Open surface (cmux / muxy / orca) — no-push en mode agent
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
pub struct OpenSurfaceBody {
    host: Option<String>,
}

pub async fn open_surface(
    State(state): State<AppState>,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: Option<Json<OpenSurfaceBody>>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if agent_or_no_push(&state) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"ok": false, "error": "no-push mode"})),
        )
            .into_response();
    }
    let page = if uri.path().starts_with("/board") {
        "whiteboard"
    } else {
        "notes"
    };
    let url = format!(
        "http://127.0.0.1:{}/.fig_thumbs/{page}/index.html",
        state.port
    );
    let host = body
        .and_then(|Json(b)| b.host)
        .unwrap_or_default()
        .chars()
        .take(64)
        .collect::<String>();

    // Order: prefer host hint, then cmux, muxy, orca.
    let mut candidates: Vec<(Option<PathBuf>, Vec<String>, &str)> = vec![
        (
            which("cmux").or_else(|| {
                let p = PathBuf::from("/usr/local/bin/cmux");
                p.is_file().then_some(p)
            }),
            vec!["browser".into(), "open".into(), url.clone()],
            "cmux",
        ),
        (
            which("muxy"),
            vec!["browser".into(), "open".into(), url.clone()],
            "muxy",
        ),
        (
            which("orca").or_else(|| {
                let p = PathBuf::from("/usr/local/bin/orca");
                p.is_file().then_some(p)
            }),
            vec![
                "tab".into(),
                "create".into(),
                "--url".into(),
                url,
                "--json".into(),
            ],
            "orca",
        ),
    ];
    candidates.sort_by_key(|c| c.2 != host.as_str());

    for (exe, args, name) in candidates {
        let Some(exe) = exe else {
            continue;
        };
        let mut cmd = Command::new(&exe);
        cmd.args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let output = match tokio::time::timeout(Duration::from_secs(10), cmd.output()).await {
            Ok(Ok(o)) => o,
            _ => continue,
        };
        if !output.status.success() {
            continue;
        }
        if name == "orca" {
            let ok = serde_json::from_slice::<Value>(&output.stdout)
                .ok()
                .and_then(|v| v.get("ok").and_then(Value::as_bool))
                .unwrap_or(false);
            if !ok {
                continue;
            }
        }
        return (StatusCode::OK, Json(json!({"ok": true, "via": name}))).into_response();
    }
    (
        StatusCode::BAD_GATEWAY,
        Json(json!({
            "error": "no embedded browser available (muxy/orca/cmux)"
        })),
    )
        .into_response()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn board_queue_caps_at_max() {
        let mut q = BoardQueue::default();
        for i in 0..BOARD_QUEUE_MAX {
            assert!(q.push(json!({"type": format!("t{i}")})).is_ok());
        }
        assert!(q.push(json!({"type": "overflow"})).is_err());
        assert_eq!(q.len(), BOARD_QUEUE_MAX);
        let drained = q.drain();
        assert_eq!(drained.len(), BOARD_QUEUE_MAX);
        assert_eq!(q.len(), 0);
    }
}
