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
const GRANT_TTL: Duration = Duration::from_secs(6 * 3600);

#[derive(Debug, Clone)]
pub struct AgentCapabilityGrant {
    pub token_hash: [u8; 32],
    pub caller_thread_id: String,
    pub project_root: String,
    pub provider: String,
    pub session_id: Option<String>,
    pub issued_at: Instant,
    pub expires_at: Instant,
    pub generation: u64,
}

#[derive(Debug, Default)]
pub struct CapabilityRegistry {
    grants: HashMap<String, AgentCapabilityGrant>, // thread_id → grant
    hash_index: HashMap<[u8; 32], String>,        // hash → thread_id
    generation: AtomicU64,
}

impl CapabilityRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn issue(
        &mut self,
        thread_id: &str,
        project_root: &str,
        provider: &str,
        session_id: Option<String>,
    ) -> String {
        // revoke previous
        if let Some(prev) = self.grants.remove(thread_id) {
            self.hash_index.remove(&prev.token_hash);
        }
        let bearer = random_bearer();
        let token_hash = hash_bearer(&bearer);
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let now = Instant::now();
        let grant = AgentCapabilityGrant {
            token_hash,
            caller_thread_id: thread_id.to_string(),
            project_root: project_root.to_string(),
            provider: provider.to_string(),
            session_id,
            issued_at: now,
            expires_at: now + GRANT_TTL,
            generation,
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

    pub fn revoke_pair(&mut self, a: &str, b: &str) {
        self.revoke_thread(a);
        self.revoke_thread(b);
    }

    pub fn resolve(&self, bearer: &str) -> Result<&AgentCapabilityGrant, &'static str> {
        if bearer.is_empty() {
            return Err(err::CAPABILITY_INVALID);
        }
        let h = hash_bearer(bearer);
        let tid = self
            .hash_index
            .get(&h)
            .ok_or(err::CAPABILITY_INVALID)?;
        let g = self.grants.get(tid).ok_or(err::CAPABILITY_INVALID)?;
        if Instant::now() > g.expires_at {
            return Err(err::CAPABILITY_EXPIRED);
        }
        // constant-time compare already via hash map lookup of full hash
        if g.token_hash != h {
            return Err(err::CAPABILITY_INVALID);
        }
        Ok(g)
    }

    pub fn active_count(&self) -> usize {
        self.grants.len()
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
        PathBuf::from(server_dir).join("rust-server").join("atelier-agent-mcp"),
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
) -> Result<AtelierMcpLaunch, String> {
    let port = state
        .port()
        .await
        .ok_or_else(|| err::BACKEND_UNAVAILABLE.to_string())?;
    let bearer = {
        let mut reg = state.capabilities().lock().await;
        reg.issue(thread_id, project_root, provider, session_id)
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
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error": code})),
                );
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

    let action = req
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("");
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

async fn action_inspect(
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

async fn action_wait(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
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
        let changed = after_seq.map(|a| seq > a).unwrap_or(false)
            || status.as_deref() == Some("done")
            || status.as_deref() == Some("idle");
        if changed && after_seq.is_some() {
            return Ok(json!({
                "status": status,
                "sequence": seq,
                "reason": "sequence_or_status",
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

async fn would_deadlock(state: &AppState, caller_id: &str, target_id: &str) -> bool {
    let store = state.threads().lock().await;
    let Some(caller) = store.get(caller_id) else {
        return false;
    };
    let root = caller.project_root.trim_end_matches('/').to_string();
    drop(store);
    if root.is_empty() {
        return false;
    }
    // if caller owns project writer lock and target is same project, wait would block delivery
    let writers = state.project_writers_snapshot().await;
    writers.get(&root).map(|o| o == caller_id).unwrap_or(false)
        && {
            let store = state.threads().lock().await;
            store
                .get(target_id)
                .map(|t| t.project_root.trim_end_matches('/') == root)
                .unwrap_or(false)
        }
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

/// Mark envelope as seeded after successful provider open.
pub async fn mark_context_seeded(state: &AppState, thread_id: &str) {
    let now = atelier_store::iso_now();
    let mut store = state.threads().lock().await;
    let _ = store.upsert(
        json!({"id": thread_id, "agentContextSeededAt": now}),
        true,
    );
}


