//! Capability grants + internal loopback bridge for linked-agent MCP (plan 057).

use crate::state::AppState;
use atelier_protocol::{agent_mcp_errors as err, agent_mcp_limits as lim, AtelierMcpLaunch};
use atelier_store::{build_child_envelope, project_events};
use axum::body::Bytes;
use axum::extract::ConnectInfo;
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};
use uuid::Uuid;

const SERVER_NAME: &str = "atelier-sessions";

#[derive(Clone)]
pub struct AgentCapabilityGrant {
    /// Jeton porteur en clair, gardé pour pouvoir le RÉÉMETTRE tel quel au
    /// tour suivant (voir `issue`). Privé au module et redacté dans `Debug` :
    /// il ne doit jamais fuiter dans une trace.
    bearer: String,
    pub token_hash: [u8; 32],
    pub caller_thread_id: String,
    pub project_root: String,
    pub provider: String,
    pub session_id: Option<String>,
    pub issued_at: Instant,
    pub generation: u64,
    /// Widgets déjà affichés sous CE grant. Un grant neuf = un tour neuf.
    pub widgets_this_turn: u32,
    /// Tour du harness qui a émis ce grant. Porté jusqu'à `meta.turnId` des
    /// events produits par l'outil MCP : sans lui, le frontend ouvre un tour
    /// fantôme et le panneau s'évapore au repli (relecture 2026-08-28).
    pub turn_id: Option<String>,
}

impl std::fmt::Debug for AgentCapabilityGrant {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AgentCapabilityGrant")
            .field("bearer", &"<redacted>")
            .field("caller_thread_id", &self.caller_thread_id)
            .field("project_root", &self.project_root)
            .field("provider", &self.provider)
            .field("session_id", &self.session_id)
            .field("issued_at", &self.issued_at)
            .field("generation", &self.generation)
            .field("widgets_this_turn", &self.widgets_this_turn)
            .field("turn_id", &self.turn_id)
            .finish()
    }
}

#[derive(Debug, Default)]
pub struct CapabilityRegistry {
    grants: HashMap<String, AgentCapabilityGrant>, // thread_id → grant
    hash_index: HashMap<[u8; 32], String>,         // hash → thread_id
    generation: AtomicU64,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Prépare le grant du fil pour un nouveau tour et rend le jeton porteur
    /// à passer au CLI.
    ///
    /// Le JETON appartient au FIL, pas au tour. Jusqu'au 2026-08-28 chaque
    /// appel révoquait et refrappait : le `mcpServers` déclaré aux providers
    /// ACP changeait donc à chaque envoi, ce qui condamnait leurs voies
    /// rapides (grok rejouait tout l'historique via `session/load`, kimi
    /// risquait un `session/resume` fatal là où le cache répondait).
    ///
    /// Le jeton vit donc AUSSI LONGTEMPS QUE LE FIL : tant qu'un grant
    /// existe, on garde le même porteur et on ne remet à jour que ce qui
    /// varie — la portée du fil (projet, provider, session, sinon une
    /// autorisation survivrait à un déplacement de fil) et l'état de tour
    /// (`turn_id`, plafond de widgets remis à zéro).
    ///
    /// AUCUNE ÉCHÉANCE D'HORLOGE (incident du 2026-09-03, quatrième récidive
    /// de « le widget ne marche plus »). Le jeton n'est LIVRÉ qu'au démarrage
    /// du processus CLI ; le backend ne sait pas le re-livrer en cours de
    /// session — l'app-server codex n'applique `config.mcp_servers` qu'à la
    /// PREMIÈRE ouverture d'une session (codex.rs::native_open_opts), tout
    /// resume ultérieur l'ignore. Une rotation par TTL ne protégeait donc
    /// rien : elle rendait juste muet, et pour de bon, un `atelier-agent-mcp`
    /// toujours vivant (relevé : dernier tour 22:38, tour suivant 08:17,
    /// 9 h 39 de trou > TTL de 6 h, puis `capability_invalid` à chaque appel
    /// widget jusqu'à la relance de l'app).
    ///
    /// Ce qui borne la capacité, ce sont les deux bornes RÉELLES du canal :
    /// la révocation explicite (`revoke_thread` — fil supprimé, lien défait)
    /// et la vie du backend, dont le registre est en mémoire et dont TOUS les
    /// CLI sont des processus enfants.
    pub fn issue(
        &mut self,
        thread_id: &str,
        project_root: &str,
        provider: &str,
        session_id: Option<String>,
        turn_id: Option<String>,
    ) -> String {
        if let Some(g) = self.grants.get_mut(thread_id) {
            g.project_root = project_root.to_string();
            g.provider = provider.to_string();
            g.session_id = session_id;
            // turn_id=None = appel HORS tour (commande native goalGet/compact,
            // qui injecte la config MCP à l'ouverture) : il ne doit ni voler
            // le turnId du tour en cours (l'event widget le porte — C1), ni
            // remettre le budget de widgets à zéro en plein tour.
            if turn_id.is_some() {
                g.turn_id = turn_id;
                g.widgets_this_turn = 0;
            }
            return g.bearer.clone();
        }
        let bearer = random_bearer();
        let token_hash = hash_bearer(&bearer);
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let now = Instant::now();
        let grant = AgentCapabilityGrant {
            bearer: bearer.clone(),
            token_hash,
            caller_thread_id: thread_id.to_string(),
            project_root: project_root.to_string(),
            provider: provider.to_string(),
            session_id,
            issued_at: now,
            generation,
            widgets_this_turn: 0,
            turn_id,
        };
        self.hash_index.insert(token_hash, thread_id.to_string());
        self.grants.insert(thread_id.to_string(), grant);
        bearer
    }

    pub fn revoke_thread(&mut self, thread_id: &str) {
        if let Some(g) = self.grants.remove(thread_id) {
            self.hash_index.remove(&g.token_hash);
        }
    }

    pub fn resolve(&self, bearer: &str) -> Result<&AgentCapabilityGrant, &'static str> {
        if bearer.is_empty() {
            return Err(err::CAPABILITY_INVALID);
        }
        let h = hash_bearer(bearer);
        let tid = self.hash_index.get(&h).ok_or(err::CAPABILITY_INVALID)?;
        let g = self.grants.get(tid).ok_or(err::CAPABILITY_INVALID)?;
        // Pas de test d'échéance : un jeton vit tant que son grant vit (voir
        // `issue`). Seules la révocation et l'arrêt du backend le tuent.
        // constant-time compare already via hash map lookup of full hash
        if g.token_hash != h {
            return Err(err::CAPABILITY_INVALID);
        }
        Ok(g)
    }

    pub fn active_count(&self) -> usize {
        self.grants.len()
    }

    /// Vieillit le grant d'un fil : sert à prouver qu'une longue inactivité
    /// (une nuit, un week-end) ne coupe pas un canal dont le processus CLI
    /// est toujours vivant.
    #[cfg(test)]
    fn force_age_for_test(&mut self, thread_id: &str, age: Duration) {
        if let Some(g) = self.grants.get_mut(thread_id) {
            g.issued_at = Instant::now() - age;
        }
    }

    /// Tour courant du fil, tel que porté par son grant. `None` si le fil n'a
    /// pas de grant ou si l'appelant n'a pas su fournir le turnId.
    pub fn turn_id_of(&self, thread_id: &str) -> Option<String> {
        self.grants.get(thread_id).and_then(|g| g.turn_id.clone())
    }

    /// Consomme un emplacement de widget pour le tour courant. Le compteur vit
    /// dans le grant : un nouveau grant repart à zéro sans réinitialisation
    /// explicite. Un fil sans grant ne consomme rien.
    pub fn try_consume_widget_slot(&mut self, thread_id: &str, max: u32) -> bool {
        match self.grants.get_mut(thread_id) {
            Some(g) if g.widgets_this_turn < max => {
                g.widgets_this_turn += 1;
                true
            }
            _ => false,
        }
    }
}

fn random_bearer() -> String {
    use std::fmt::Write;
    let mut bytes = [0u8; 32];
    // getrandom via uuid bits + process entropy
    let u1 = Uuid::new_v4();
    let u2 = Uuid::new_v4();
    bytes[..16].copy_from_slice(u1.as_bytes());
    bytes[16..].copy_from_slice(u2.as_bytes());
    let mut s = String::with_capacity(64);
    for b in bytes {
        let _ = write!(s, "{b:02x}");
    }
    s
}

fn hash_bearer(bearer: &str) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(bearer.as_bytes());
    let d = h.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&d);
    out
}

/// Journal de bord MCP — `<app_dir>/logs/agent-mcp.log`. Le stderr du
/// backend part dans Stdio::null (src-tauri/sidecar.rs) : trois récidives de
/// « l'outil widget a disparu » ont été diagnostiquées à l'aveugle faute de
/// cette ligne (2026-08-29 → 31). Append best-effort, jamais bloquant.
pub(crate) fn journal_mcp(state: &AppState, ligne: &str) {
    let dir = state.app_dir().join("logs");
    let _ = std::fs::create_dir_all(&dir);
    let ts = chrono::Local::now().format("%m-%d %H:%M:%S");
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("agent-mcp.log"))
    {
        let _ = writeln!(f, "{ts} {ligne}");
    }
}

/// Empreinte tronquée d'un jeton, pour le journal : jamais le jeton lui-même.
fn empreinte_courte(bearer: &str) -> String {
    if bearer.is_empty() {
        return "absent".into();
    }
    hex::encode(&hash_bearer(bearer)[..4])
}

/// Resolve path to `atelier-agent-mcp` binary.
pub fn resolve_mcp_binary(server_dir: &str) -> PathBuf {
    if let Ok(p) = std::env::var("ATELIER_AGENT_MCP_BIN") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return pb;
        }
    }
    // staged next to server
    let candidates = [
        PathBuf::from(server_dir).join("atelier-agent-mcp"),
        PathBuf::from(server_dir)
            .join("rust-server")
            .join("atelier-agent-mcp"),
        PathBuf::from("rust/target/release/atelier-agent-mcp"),
        PathBuf::from("rust/target/debug/atelier-agent-mcp"),
    ];
    for c in candidates {
        if c.is_file() {
            return c;
        }
    }
    PathBuf::from("atelier-agent-mcp")
}

/// Build AtelierMcpLaunch for a thread (issues a fresh capability).
pub async fn issue_mcp_launch(
    state: &AppState,
    thread_id: &str,
    project_root: &str,
    provider: &str,
    session_id: Option<String>,
    caller_label: &str,
    turn_id: Option<String>,
    linked: bool,
) -> Result<AtelierMcpLaunch, String> {
    let port = state
        .port()
        .await
        .ok_or_else(|| err::BACKEND_UNAVAILABLE.to_string())?;
    let bearer = {
        let mut reg = state.capabilities().lock().await;
        reg.issue(thread_id, project_root, provider, session_id, turn_id)
    };
    let command = resolve_mcp_binary(state.server_dir());
    let mut env = HashMap::new();
    env.insert(
        "ATELIER_MCP_ENDPOINT".into(),
        format!("http://127.0.0.1:{port}/internal/agent-mcp"),
    );
    env.insert("ATELIER_MCP_CAPABILITY".into(), bearer);
    env.insert("ATELIER_MCP_CALLER_LABEL".into(), caller_label.into());
    Ok(AtelierMcpLaunch {
        command: command.display().to_string(),
        server_name: SERVER_NAME.into(),
        env,
        linked,
    })
}

/// Write Claude per-thread mcp-config (0600) under Application Support.
pub fn write_claude_mcp_config(
    app_dir: &Path,
    thread_id: &str,
    launch: &AtelierMcpLaunch,
) -> Result<PathBuf, String> {
    let dir = app_dir.join("mcp-configs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
    }
    let mut h = Sha256::new();
    h.update(thread_id.as_bytes());
    let name = format!("{}.json", hex::encode(&h.finalize()[..16]));
    let path = dir.join(name);
    let cfg = json!({
        "mcpServers": {
            launch.server_name.clone(): {
                "command": launch.command,
                "args": [],
                "env": launch.env,
            }
        }
    });
    let data = serde_json::to_vec_pretty(&cfg).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, &data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(path)
}

pub fn remove_claude_mcp_config(app_dir: &Path, thread_id: &str) {
    let dir = app_dir.join("mcp-configs");
    let mut h = Sha256::new();
    h.update(thread_id.as_bytes());
    let name = format!("{}.json", hex::encode(&h.finalize()[..16]));
    let _ = std::fs::remove_file(dir.join(name));
}

pub fn cleanup_orphan_mcp_configs(app_dir: &Path, live_thread_ids: &[String]) {
    let dir = app_dir.join("mcp-configs");
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return;
    };
    let live: std::collections::HashSet<String> = live_thread_ids
        .iter()
        .map(|id| {
            let mut h = Sha256::new();
            h.update(id.as_bytes());
            format!("{}.json", hex::encode(&h.finalize()[..16]))
        })
        .collect();
    for entry in rd.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.ends_with(".json") && !live.contains(name.as_ref()) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// HTTP handler: POST /internal/agent-mcp
pub async fn agent_mcp_handler(
    State(state): axum::extract::State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    // loopback only
    if !addr.ip().is_loopback() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": err::BACKEND_UNAVAILABLE, "message": "loopback only"})),
        );
    }
    if headers.get(axum::http::header::ORIGIN).is_some() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": err::BACKEND_UNAVAILABLE, "message": "origin forbidden"})),
        );
    }
    if body.len() > lim::REQUEST_BODY_MAX {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": err::PAYLOAD_TOO_LARGE})),
        );
    }
    let bearer = headers
        .get("x-atelier-agent-capability")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let grant_thread = {
        let reg = state.capabilities().lock().await;
        match reg.resolve(bearer) {
            Ok(g) => g.caller_thread_id.clone(),
            Err(code) => {
                // Un refus ici veut dire qu'un `atelier-agent-mcp` VIVANT
                // présente un jeton que le registre ne connaît pas : la panne
                // est muette côté agent (« capability_invalid ») et invisible
                // côté backend sans cette ligne. L'empreinte tronquée n'est
                // pas un secret et suffit à distinguer un jeton périmé d'un
                // appel sans en-tête.
                drop(reg);
                journal_mcp(
                    &state,
                    &format!("REFUS {code} jeton={}", empreinte_courte(bearer)),
                );
                return (StatusCode::UNAUTHORIZED, Json(json!({"error": code})));
            }
        }
    };

    let req: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "malformed_body"})),
            );
        }
    };

    let action = req.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let result = match handle_action(&state, &grant_thread, action, &req).await {
        Ok(v) => v,
        Err(code) => json!({"error": code}),
    };

    let serialized = serde_json::to_vec(&result).unwrap_or_else(|_| b"{}".to_vec());
    if serialized.len() > lim::BRIDGE_RESPONSE_MAX {
        return (
            StatusCode::OK,
            Json(json!({"error": err::PAYLOAD_TOO_LARGE, "truncated": true})),
        );
    }
    (StatusCode::OK, Json(result))
}

// re-export State for handler signature convenience
use axum::extract::State;

async fn handle_action(
    state: &AppState,
    caller_id: &str,
    action: &str,
    req: &Value,
) -> Result<Value, String> {
    match action {
        "help" => Ok(help_doc()),
        "current" => action_current(state, caller_id).await,
        "list" => action_list(state, caller_id).await,
        "inspect" => action_inspect(state, caller_id, req).await,
        "read_context" => action_read_context(state, caller_id, req).await,
        "wait" => action_wait(state, caller_id, req).await,
        "send_message" => crate::agent_mailbox::action_send_message(state, caller_id, req).await,
        "report_to_parent" => {
            crate::agent_mailbox::action_report_to_parent(state, caller_id, req).await
        }
        "show_widget" => crate::widgets::action_show_widget(state, caller_id, req).await,
        "" => Err("missing_action".into()),
        _ => Err("unknown_action".into()),
    }
}

fn help_doc() -> Value {
    json!({
        "tool": "atelier_sessions",
        "actions": [
            {"action":"help","mutation":false},
            {"action":"current","mutation":false},
            {"action":"list","mutation":false},
            {"action":"inspect","mutation":false,"params":["targetThreadId"]},
            {"action":"read_context","mutation":false,"params":["targetThreadId","afterSequence","beforeSequence","limit","includeTools"]},
            {"action":"wait","mutation":false,"params":["targetThreadId","timeoutMs","afterSequence"]},
            {"action":"send_message","mutation":true,"params":["targetThreadId","text","requestId"]},
            {"action":"report_to_parent","mutation":true,"params":["requestId","report"]}
        ]
    })
}

async fn action_current(state: &AppState, caller_id: &str) -> Result<Value, String> {
    let store = state.threads().lock().await;
    let caller = store
        .get(caller_id)
        .cloned()
        .ok_or_else(|| err::CALLER_UNKNOWN.to_string())?;
    let parent = caller
        .agent_link
        .as_ref()
        .and_then(|l| store.get(&l.parent_thread_id).cloned())
        .map(|t| compact_thread(&t));
    let children: Vec<Value> = store
        .children_of(caller_id)
        .into_iter()
        .map(|t| compact_thread(&t))
        .collect();
    let link = caller.agent_link.clone();
    Ok(json!({
        "callerThreadId": caller.id,
        "provider": caller.provider,
        "title": caller.title,
        "status": caller.status,
        "projectRoot": caller.project_root,
        "agentLink": link,
        "parent": parent,
        "children": children,
        "limits": {
            "maxHop": lim::MAX_HOP,
            "maxQueue": lim::MAX_QUEUE_PER_LINK,
            "inspectMaxEvents": lim::INSPECT_MAX_EVENTS,
            "readContextMaxEvents": lim::READ_CONTEXT_MAX_EVENTS,
        }
    }))
}

async fn action_list(state: &AppState, caller_id: &str) -> Result<Value, String> {
    let store = state.threads().lock().await;
    let caller = store
        .get(caller_id)
        .cloned()
        .ok_or_else(|| err::CALLER_UNKNOWN.to_string())?;
    let mut related = Vec::new();
    if let Some(link) = &caller.agent_link {
        if let Some(p) = store.get(&link.parent_thread_id) {
            related.push(compact_thread(p));
        }
    }
    for c in store.children_of(caller_id) {
        related.push(compact_thread(&c));
    }
    Ok(json!({"threads": related}))
}

async fn action_inspect(state: &AppState, caller_id: &str, req: &Value) -> Result<Value, String> {
    let target_id = req
        .get("targetThreadId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing_targetThreadId".to_string())?;
    authorize_target(state, caller_id, target_id).await?;
    let store = state.threads().lock().await;
    let target = store
        .get(target_id)
        .cloned()
        .ok_or_else(|| err::THREAD_NOT_FOUND.to_string())?;
    drop(store);
    let events = state.journal().materialize(target_id);
    let projection = project_events(
        &events,
        None,
        None,
        lim::INSPECT_MAX_EVENTS,
        true,
        lim::INSPECT_MAX_CHARS,
        &target.project_root,
    );
    Ok(json!({
        "thread": compact_thread(&target),
        "projection": projection,
    }))
}

async fn action_read_context(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let target_id = req
        .get("targetThreadId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing_targetThreadId".to_string())?;
    authorize_target(state, caller_id, target_id).await?;
    let store = state.threads().lock().await;
    let project_root = store
        .get(target_id)
        .map(|t| t.project_root.clone())
        .ok_or_else(|| err::THREAD_NOT_FOUND.to_string())?;
    drop(store);
    let after = req.get("afterSequence").and_then(|v| v.as_u64());
    let before = req.get("beforeSequence").and_then(|v| v.as_u64());
    let limit = req
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(lim::READ_CONTEXT_MAX_EVENTS as u64)
        .min(lim::READ_CONTEXT_MAX_EVENTS as u64) as usize;
    let include_tools = req
        .get("includeTools")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let events = state.journal().materialize(target_id);
    Ok(project_events(
        &events,
        after,
        before,
        limit,
        include_tools,
        lim::MCP_RESPONSE_MAX_BYTES,
        &project_root,
    ))
}

async fn action_wait(state: &AppState, caller_id: &str, req: &Value) -> Result<Value, String> {
    let target_id = req
        .get("targetThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or(caller_id)
        .to_string();
    if target_id != caller_id {
        authorize_target(state, caller_id, &target_id).await?;
    }
    // deadlock: caller holds writer and target would need it
    if would_deadlock(state, caller_id, &target_id).await {
        return Err(err::WOULD_DEADLOCK.into());
    }
    let timeout_ms = req
        .get("timeoutMs")
        .and_then(|v| v.as_u64())
        .unwrap_or(lim::WAIT_DEFAULT_MS)
        .min(lim::WAIT_MAX_MS);
    let after_seq = req.get("afterSequence").and_then(|v| v.as_u64());
    let start = Instant::now();
    let mut bus = state.subscribe_bus();
    loop {
        let store = state.threads().lock().await;
        let status = store.get(&target_id).map(|t| t.status.clone());
        drop(store);
        let seq = state.journal().last_sequence(&target_id);
        let mailbox_status = if target_id == caller_id {
            None
        } else {
            state
                .mailbox()
                .lock()
                .await
                .list_for_link(caller_id, &target_id)
                .last()
                .map(|message| message.status.clone())
        };
        let terminal_status = matches!(status.as_deref(), Some("done" | "idle"));
        let changed = after_seq
            .map(|after| seq > after || terminal_status)
            .unwrap_or(terminal_status || mailbox_status.is_some());
        if changed {
            let reason = if mailbox_status.is_some() {
                "mailbox"
            } else {
                "sequence_or_status"
            };
            return Ok(json!({
                "status": status,
                "sequence": seq,
                "mailboxStatus": mailbox_status,
                "reason": reason,
            }));
        }
        if start.elapsed() >= Duration::from_millis(timeout_ms) {
            return Ok(json!({
                "status": status,
                "sequence": seq,
                "reason": "timeout",
            }));
        }
        let remaining = timeout_ms.saturating_sub(start.elapsed().as_millis() as u64);
        let wait = remaining.min(500).max(50);
        let _ = tokio::time::timeout(Duration::from_millis(wait), bus.recv()).await;
    }
}

async fn would_deadlock(_state: &AppState, _caller_id: &str, _target_id: &str) -> bool {
    // Le verrou d'écrivain par projet est retiré (2026-08-25) : attendre un
    // fil du même projet ne peut plus interbloquer, les tours y coexistent.
    false
}

pub async fn authorize_target(
    state: &AppState,
    caller_id: &str,
    target_id: &str,
) -> Result<(), String> {
    if caller_id == target_id {
        return Err(err::SELF_TARGET_DENIED.into());
    }
    let store = state.threads().lock().await;
    let caller = store
        .get(caller_id)
        .cloned()
        .ok_or_else(|| err::CALLER_UNKNOWN.to_string())?;
    let target = store
        .get(target_id)
        .cloned()
        .ok_or_else(|| err::THREAD_NOT_FOUND.to_string())?;
    if caller.project_root != target.project_root {
        return Err(err::CROSS_PROJECT_DENIED.into());
    }
    // direct lineage only
    let is_parent = caller
        .agent_link
        .as_ref()
        .map(|l| l.parent_thread_id == target_id)
        .unwrap_or(false);
    let is_child = target
        .agent_link
        .as_ref()
        .map(|l| l.parent_thread_id == caller_id)
        .unwrap_or(false);
    if !is_parent && !is_child {
        return Err(err::RELATION_REQUIRED.into());
    }
    Ok(())
}

fn compact_thread(t: &atelier_store::Thread) -> Value {
    json!({
        "id": t.id,
        "title": t.title,
        "provider": t.provider,
        "status": t.status,
        "agentLink": t.agent_link,
    })
}

/// Build envelope text if child not yet seeded.
pub async fn maybe_child_envelope(state: &AppState, child_id: &str) -> Option<String> {
    let store = state.threads().lock().await;
    let child = store.get(child_id)?.clone();
    let link = child.agent_link.as_ref()?;
    // already seeded?
    if child
        .extra
        .get("agentContextSeededAt")
        .and_then(|v| v.as_str())
        .is_some()
    {
        return None;
    }
    let parent = store.get(&link.parent_thread_id)?.clone();
    drop(store);
    let events = state.journal().materialize(&parent.id);
    let label = provider_label(&parent.provider);
    Some(build_child_envelope(
        &parent.title,
        label,
        &parent.project_root,
        &parent.status,
        &events,
        lim::ENVELOPE_MAX_CHARS,
    ))
}

pub fn provider_label(id: &str) -> &'static str {
    match id {
        "claude" => "Claude Code",
        "codex" => "Codex",
        "kimi" => "Kimi",
        "grok" => "Grok",
        "opencode" => "OpenCode",
        _ => "Agent",
    }
}

pub fn is_mcp_compatible_provider(id: &str) -> bool {
    matches!(id, "claude" | "codex" | "kimi" | "grok" | "opencode")
}

/// Faut-il équiper ce fil du serveur MCP Atelier ?
///
/// Jusqu'au 2026-08-28 la réponse exigeait AUSSI que le fil soit lié (parent
/// ou enfants) : `atelier_sessions` ne sert qu'à la coordination, un fil seul
/// n'avait rien à coordonner. `atelier_widget` vit dans le même serveur, et
/// son cas d'usage moteur est un fil NORMAL à qui Thierry demande un panneau
/// — la condition de lien privait donc l'outil de sa raison d'être : l'agent
/// ne le voyait pas et répondait en prose.
///
/// Il ne reste que la compatibilité du provider. Les fils liés ne perdent
/// rien : ils remplissaient déjà cette condition.
pub fn should_launch_mcp(provider: &str) -> bool {
    is_mcp_compatible_provider(provider)
}

/// Mark envelope as seeded after successful provider open.
pub async fn mark_context_seeded(state: &AppState, thread_id: &str) {
    let now = atelier_store::iso_now();
    let mut store = state.threads().lock().await;
    let _ = store.upsert(json!({"id": thread_id, "agentContextSeededAt": now}), true);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_serveur_mcp_part_meme_sur_un_fil_sans_lien() {
        // Régression de conception (relecture finale 2026-08-28, I1) : la
        // condition « fil lié » rendait `atelier_widget` invisible dans un
        // fil normal — le cas d'usage moteur de la spec.
        for provider in ["claude", "codex", "kimi", "grok", "opencode"] {
            assert!(
                should_launch_mcp(provider),
                "{provider} : un fil sans lien doit tout de même avoir l'outil"
            );
            // ce que faisait l'ancienne condition, gardé explicite : les fils
            // liés remplissaient déjà cette condition, ils ne perdent rien.
            assert!(is_mcp_compatible_provider(provider));
        }
        for provider in ["fake", "", "inconnu"] {
            assert!(!should_launch_mcp(provider), "{provider} ne porte pas de MCP");
        }
    }

    /// Régression 2026-08-28 : `issue` révoquait et refrappait le jeton à
    /// CHAQUE tour. Le `mcpServers` déclaré changeait donc à chaque envoi, ce
    /// qui condamnait les voies rapides ACP (grok rejouait tout l'historique
    /// via `session/load`, kimi risquait un `session/resume` fatal). Le jeton
    /// appartient au FIL ; seul ce qui est vraiment par-tour varie.
    #[test]
    fn le_jeton_reste_stable_dun_tour_a_lautre() {
        let mut reg = CapabilityRegistry::new();
        let tour1 = reg.issue("t1", "/tmp/proj", "claude", None, Some("turn-1".into()));
        assert!(reg.try_consume_widget_slot("t1", 8));
        assert!(reg.try_consume_widget_slot("t1", 8));

        let tour2 = reg.issue("t1", "/tmp/proj", "claude", None, Some("turn-2".into()));
        assert_eq!(tour1, tour2, "le jeton porteur du fil ne doit pas changer");
        assert_eq!(
            reg.turn_id_of("t1").as_deref(),
            Some("turn-2"),
            "le turnId, lui, suit le tour"
        );
        for i in 0..8 {
            assert!(
                reg.try_consume_widget_slot("t1", 8),
                "le plafond repart à zéro au tour suivant (slot {i})"
            );
        }
        assert!(!reg.try_consume_widget_slot("t1", 8));
        assert!(reg.resolve(&tour1).is_ok(), "le jeton réutilisé résout");

        // Deux fils n'ont jamais le même jeton.
        let autre = reg.issue("t2", "/tmp/proj", "claude", None, Some("turn-1".into()));
        assert_ne!(autre, tour1);
    }

    /// Réutiliser le jeton ne doit pas figer la portée du grant : si le fil a
    /// changé de projet, de provider ou de session, l'autorisation doit suivre.
    #[test]
    fn la_portee_du_grant_suit_le_fil_meme_quand_le_jeton_est_reutilise() {
        let mut reg = CapabilityRegistry::new();
        let jeton = reg.issue("t1", "/tmp/a", "claude", Some("s1".into()), Some("t-1".into()));
        let rejeton = reg.issue("t1", "/tmp/b", "codex", Some("s2".into()), Some("t-2".into()));
        assert_eq!(jeton, rejeton);

        let g = reg.resolve(&jeton).expect("grant vivant");
        assert_eq!(g.project_root, "/tmp/b");
        assert_eq!(g.provider, "codex");
        assert_eq!(g.session_id.as_deref(), Some("s2"));
    }

    #[test]
    fn widget_slots_are_bounded_per_turn_and_reset_on_the_next_one() {
        let mut reg = CapabilityRegistry::new();
        reg.issue("t1", "/tmp/proj", "claude", None, Some("turn-1".into()));

        for i in 0..8 {
            assert!(reg.try_consume_widget_slot("t1", 8), "le slot {i} devait passer");
        }
        assert!(!reg.try_consume_widget_slot("t1", 8), "le 9e doit être refusé");

        // tour suivant : nouveau grant, compteur remis à zéro
        reg.issue("t1", "/tmp/proj", "claude", None, Some("turn-1".into()));
        assert!(reg.try_consume_widget_slot("t1", 8), "le tour suivant repart à zéro");

        // un fil sans grant ne consomme rien
        assert!(!reg.try_consume_widget_slot("inconnu", 8));
    }
}

#[cfg(test)]
mod journal_des_refus_tests {
    use super::*;
    use crate::paths::AppPaths;
    use axum::response::IntoResponse;
    use tempfile::tempdir;

    /// Un jeton refusé était jusqu'ici un silence total côté backend : le
    /// stderr part dans Stdio::null, et l'agent ne voyait qu'un
    /// `capability_invalid` sans cause. La trace doit exister — et ne jamais
    /// contenir le jeton lui-même.
    #[tokio::test]
    async fn un_jeton_inconnu_laisse_une_trace_qui_ne_contient_pas_le_jeton() {
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "hash".into(),
            "/tmp".into(),
        );
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-atelier-agent-capability",
            "jeton-perime-de-la-veille".parse().unwrap(),
        );

        let reponse = agent_mcp_handler(
            State(state),
            ConnectInfo("127.0.0.1:52000".parse().unwrap()),
            headers,
            Bytes::from_static(b"{\"action\":\"current\"}"),
        )
        .await
        .into_response();
        assert_eq!(reponse.status(), StatusCode::UNAUTHORIZED);

        let journal = std::fs::read_to_string(dir.path().join("logs/agent-mcp.log"))
            .expect("le refus doit laisser une ligne de journal");
        assert!(
            journal.contains("REFUS capability_invalid"),
            "la cause doit être lisible : {journal}"
        );
        assert!(
            !journal.contains("jeton-perime-de-la-veille"),
            "le jeton ne doit JAMAIS être écrit : {journal}"
        );
    }
}

#[cfg(test)]
mod duree_de_vie_du_jeton_tests {
    use super::*;

    fn issue(r: &mut CapabilityRegistry, tour: &str) -> String {
        r.issue("t1", "/p", "codex", Some("s1".into()), Some(tour.into()))
    }

    /// Incident du 2026-09-03, quatrième récidive de « le widget ne marche
    /// plus » : dernier tour à 22:38, tour suivant à 08:17. Le grant avait
    /// expiré dans l'intervalle, donc `issue` refrappait — mais le jeton
    /// n'est LIVRÉ qu'au démarrage du processus CLI, et l'app-server codex
    /// n'applique `config.mcp_servers` qu'à la première ouverture d'une
    /// session (codex.rs::native_open_opts). Le processus `atelier-agent-mcp`
    /// vivant depuis la veille gardait donc l'ancien jeton et TOUT appel
    /// widget répondait `capability_invalid`, définitivement.
    #[test]
    fn un_jeton_deja_livre_survit_a_une_nuit_dinactivite() {
        let mut r = CapabilityRegistry::new();
        let livre = issue(&mut r, "tour-1");
        // la nuit : bien au-delà de l'ancien TTL de 6 h ET de l'ancien
        // plafond absolu de 24 h — aucune horloge ne doit couper un fil
        // dont le processus CLI, lui, est toujours en vie
        r.force_age_for_test("t1", Duration::from_secs(30 * 3600));

        let apres = issue(&mut r, "tour-2");
        assert_eq!(
            apres, livre,
            "le jeton du fil ne doit pas changer sous le processus qui le détient"
        );
        assert!(
            r.resolve(&livre).is_ok(),
            "le jeton déjà livré au serveur MCP doit continuer de résoudre"
        );
    }

    /// Le même piège hors tour : une commande native (goalGet, compact) ou
    /// une remise de boîte aux lettres appelle le pont SANS `issue`
    /// préalable. Une échéance d'horloge rendrait ces appels invalides sans
    /// que rien ne puisse re-livrer un jeton neuf.
    #[test]
    fn un_appel_hors_tour_resout_encore_apres_une_longue_pause() {
        let mut r = CapabilityRegistry::new();
        let livre = issue(&mut r, "tour-1");
        r.force_age_for_test("t1", Duration::from_secs(30 * 3600));

        assert!(
            r.resolve(&livre).is_ok(),
            "sans nouveau tour, le jeton doit rester résolvable"
        );
    }

    /// Ce qui doit TOUJOURS tuer un jeton : la révocation explicite (fil
    /// supprimé, lien défait). C'est, avec l'arrêt du backend, la seule
    /// borne — et elle survit au retrait de l'échéance d'horloge.
    #[test]
    fn la_revocation_explicite_tue_toujours_le_jeton() {
        let mut r = CapabilityRegistry::new();
        let avant = issue(&mut r, "tour-1");
        r.revoke_thread("t1");
        assert!(r.resolve(&avant).is_err(), "révoqué = plus résolvable");
        let apres = issue(&mut r, "tour-2");
        assert_ne!(avant, apres, "après révocation, jeton neuf");
        assert!(r.resolve(&avant).is_err(), "l'ancien reste mort");
    }
}
