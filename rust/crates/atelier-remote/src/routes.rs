//! Bounded HTTP API for the remote gateway.

use crate::auth::{hash_token, AuthError, IdempotencyResult};
use crate::error::{ApiError, ApiResult};
use crate::hostcheck::{check_host, check_origin_optional, is_loopback_ip};
use crate::path_policy::{check_file_readable, normalize_relative};
use crate::scopes::{has_scope, Scope};
use crate::state::GatewayState;
use atelier_protocol::remote::{
    negotiate_protocol_version, slice_after, NegotiateResult, MAX_PROTOCOL_VERSION,
    MIN_PROTOCOL_VERSION, PROTOCOL_VERSION,
};
use axum::body::Bytes;
use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use futures_util::SinkExt;
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub fn router(state: GatewayState) -> Router {
    Router::new()
        .route("/remote/health", get(health))
        .route("/remote/v1/health", get(health))
        .route("/remote/v1/pair", post(pair_complete))
        .route("/remote/v1/projects", get(list_projects))
        .route("/remote/v1/threads", get(list_threads).post(create_thread))
        .route("/remote/v1/threads/{thread_id}/history", get(get_history))
        .route("/remote/v1/send", post(send_msg))
        .route("/remote/v1/interrupt", post(interrupt_msg))
        .route("/remote/v1/interaction", post(interaction_msg))
        .route("/remote/v1/gallery/{project_id}", get(gallery_index))
        .route(
            "/remote/v1/files/{project_id}/{*rel}",
            get(get_file_by_path),
        )
        .route("/remote/v1/file/{file_id}", get(get_file_by_id))
        // Admin (loopback + admin token)
        .route("/remote/admin", get(admin_page))
        .route("/remote/admin/pairing/start", post(admin_pairing_start))
        .route("/remote/admin/pairing/cancel", post(admin_pairing_cancel))
        .route("/remote/admin/devices", get(admin_list_devices))
        .route(
            "/remote/admin/devices/{device_id}/revoke",
            post(admin_revoke),
        )
        .route(
            "/remote/admin/devices/{device_id}/rotate",
            post(admin_rotate),
        )
        .with_state(state)
}

/// Relaye une commande mobile vers le WebSocket loopback du sidecar. Le jeton
/// sidecar ne quitte jamais le Mac; le client distant reste authentifié par son
/// jeton de device au niveau de cette API.
async fn relay_sidecar(
    state: &GatewayState,
    client_instance_id: &str,
    payload: Value,
) -> ApiResult<bool> {
    let (base, token) = {
        let g = state.inner.lock().await;
        (g.config.sidecar_base.clone(), g.config.sidecar_token.clone())
    };
    let Some(base) = base else { return Ok(false) };
    let ws_base = if let Some(rest) = base.strip_prefix("https://") {
        format!("wss://{rest}")
    } else if let Some(rest) = base.strip_prefix("http://") {
        format!("ws://{rest}")
    } else {
        base
    };
    let url = match token {
        Some(token) => format!("{}/?token={token}", ws_base.trim_end_matches('/')),
        None => format!("{}/", ws_base.trim_end_matches('/')),
    };
    let (mut socket, _) = connect_async(url).await.map_err(|_| {
        ApiError::new(
            StatusCode::BAD_GATEWAY,
            "sidecar_unavailable",
            "Atelier n'est pas prêt sur le Mac",
        )
    })?;
    socket
        .send(Message::Text(
            json!({ "type": "clientHello", "clientInstanceId": client_instance_id })
                .to_string()
                .into(),
        ))
        .await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY, "sidecar_send_failed", "commande impossible"))?;
    socket
        .send(Message::Text(payload.to_string().into()))
        .await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY, "sidecar_send_failed", "commande impossible"))?;
    let _ = socket.close(None).await;
    Ok(true)
}

async fn health(State(state): State<GatewayState>) -> Json<Value> {
    let g = state.inner.lock().await;
    Json(json!({
        "ok": true,
        "service": "atelier-remote-gateway",
        "protocolVersion": PROTOCOL_VERSION,
        "minProtocolVersion": MIN_PROTOCOL_VERSION,
        "maxProtocolVersion": MAX_PROTOCOL_VERSION,
        "startedAt": g.started_at,
        "devices": g.auth.list_devices().iter().filter(|d| d.revoked_at.is_none()).count(),
    }))
}

async fn guard_headers(state: &GatewayState, headers: &HeaderMap) -> ApiResult<()> {
    let g = state.inner.lock().await;
    check_host(headers, &g.config.allowed_hosts)?;
    check_origin_optional(headers, &g.config.allowed_hosts)?;
    Ok(())
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    if let Some(v) = headers
        .get("x-atelier-device-token")
        .and_then(|v| v.to_str().ok())
    {
        return Some(v.to_string());
    }
    if let Some(v) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
    {
        let v = v.trim();
        if let Some(rest) = v.strip_prefix("Bearer ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

async fn require_device(
    state: &GatewayState,
    headers: &HeaderMap,
    need: Scope,
) -> ApiResult<crate::auth::AuthDevice> {
    let token = extract_bearer(headers).ok_or_else(ApiError::unauthorized)?;
    let mut g = state.inner.lock().await;
    let dev = g
        .auth
        .authenticate_token(&token)
        .ok_or_else(ApiError::unauthorized)?;
    if !has_scope(&dev.scopes, need) {
        return Err(ApiError::forbidden_scope(need.as_str()));
    }
    Ok(dev)
}

async fn require_admin(state: &GatewayState, headers: &HeaderMap, peer: &str) -> ApiResult<()> {
    if !is_loopback_ip(peer) && peer != "unknown" {
        // ConnectInfo may be unknown in tests — allow if admin token matches anyway for unit tests
        // but reject clear non-loopback.
        if !(peer.starts_with("127.") || peer == "::1") {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "admin_loopback_only",
                "admin réservé au loopback",
            ));
        }
    }
    let tok = headers
        .get("x-atelier-admin-token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::UNAUTHORIZED,
                "admin_unauthorized",
                "jeton admin requis",
            )
        })?;
    let g = state.inner.lock().await;
    if hash_token(tok) != g.auth.admin_token_hash() {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "admin_unauthorized",
            "jeton admin invalide",
        ));
    }
    Ok(())
}

// ----- pairing (device) -----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairBody {
    code: String,
    #[serde(default)]
    device_name: String,
    #[serde(default)]
    protocol_version: Option<u32>,
}

async fn pair_complete(
    State(state): State<GatewayState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<PairBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let ip = addr.ip().to_string();
    {
        let mut g = state.inner.lock().await;
        if !g.pairing_limiter.check(&ip) {
            return Err(ApiError::rate_limited());
        }
    }

    if let Some(v) = body.protocol_version {
        if matches!(
            negotiate_protocol_version(v),
            NegotiateResult::Unsupported { .. }
        ) {
            return Err(ApiError::bad_request(
                "protocol_version_unsupported",
                format!("protocolVersion {v} non supporté"),
            ));
        }
    }

    let mut g = state.inner.lock().await;
    match g.auth.complete_pairing(&body.code, &body.device_name) {
        Ok(done) => Ok(Json(json!({
            "ok": true,
            "deviceId": done.device_id,
            "token": done.token,
            "scopes": done.scopes,
            "name": done.name,
            "protocolVersion": PROTOCOL_VERSION,
        }))),
        Err(AuthError::PairingExpired) => Err(ApiError::bad_request(
            "pairing_expired",
            "code d'appairage expiré",
        )),
        Err(AuthError::PairingInvalid) => Err(ApiError::bad_request(
            "pairing_invalid",
            "code d'appairage invalide",
        )),
        Err(AuthError::PairingLocked) => Err(ApiError::bad_request(
            "pairing_locked",
            "trop de tentatives, recommencer l'appairage",
        )),
        Err(AuthError::NoPairing) => Err(ApiError::bad_request(
            "no_pairing",
            "aucun appairage en cours sur le Mac",
        )),
        Err(e) => Err(ApiError::bad_request("pairing_error", e.to_string())),
    }
}

// ----- read APIs -----

async fn list_projects(
    State(state): State<GatewayState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::ChatRead).await?;
    let g = state.inner.lock().await;
    let projects: Vec<Value> = g
        .projects
        .list()
        .into_iter()
        .map(|p| {
            json!({
                "projectId": p.project_id,
                "name": p.name,
            })
        })
        .collect();
    Ok(Json(json!({ "projects": projects })))
}

async fn list_threads(
    State(state): State<GatewayState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::ChatRead).await?;
    let g = state.inner.lock().await;
    let mut threads: Vec<Value> = g
        .threads
        .list()
        .into_iter()
        .map(|t| {
            let last = g.journal.last_sequence(&t.id);
            let project_id = if t.project_root.is_empty() {
                Value::Null
            } else {
                json!(crate::path_policy::project_id_for(std::path::Path::new(
                    &t.project_root
                )))
            };
            json!({
                "id": t.id,
                "title": t.title,
                "provider": t.provider,
                "status": t.status,
                "updatedAt": t.updated_at,
                "projectId": project_id,
                "lastSequence": last,
                "model": t.extra.get("model").and_then(|v| v.as_str()),
            })
        })
        .collect();
    // Fixture threads
    for (id, events) in &g.fixture_history {
        let last = events
            .iter()
            .filter_map(|e| e.pointer("/meta/sequence").and_then(|v| v.as_u64()))
            .max()
            .unwrap_or(0);
        if !threads
            .iter()
            .any(|t| t.get("id").and_then(|v| v.as_str()) == Some(id))
        {
            threads.push(json!({
                "id": id,
                "title": id,
                "provider": "fixture",
                "status": "idle",
                "updatedAt": g.started_at,
                "projectId": null,
                "lastSequence": last,
            }));
        }
    }
    Ok(Json(json!({ "threads": threads })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateThreadBody {
    #[serde(default)]
    title: String,
    #[serde(default = "default_thread_provider")]
    provider: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
}

fn default_thread_provider() -> String {
    "codex".into()
}

async fn create_thread(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Json(body): Json<CreateThreadBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::ChatSend).await?;
    let provider = body.provider.trim();
    if !matches!(provider, "claude" | "codex" | "grok" | "opencode" | "gemini") {
        return Err(ApiError::bad_request("invalid_provider", "provider inconnu"));
    }
    let mut g = state.inner.lock().await;
    let project_root = match body.project_id.as_deref() {
        Some(id) => g
            .projects
            .get(id)
            .ok_or_else(|| ApiError::not_found("projet inconnu"))?
            .root
            .to_string_lossy()
            .into_owned(),
        None => String::new(),
    };
    let id = uuid::Uuid::new_v4().to_string();
    let title = body.title.trim();
    let thread = g
        .threads
        .upsert(
            json!({
                "id": id,
                "title": if title.is_empty() { "Nouveau chat" } else { title },
                "provider": provider,
                "model": body.model.as_deref().unwrap_or(""),
                "projectRoot": project_root,
                "status": "idle"
            }),
            false,
        )
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "thread_create_failed",
                "création impossible",
            )
        })?;
    Ok(Json(json!({
        "id": thread.id,
        "title": thread.title,
        "provider": thread.provider,
        "status": thread.status,
        "updatedAt": thread.updated_at,
        "projectId": if thread.project_root.is_empty() { Value::Null } else { json!(crate::path_policy::project_id_for(std::path::Path::new(&thread.project_root))) },
        "lastSequence": 0,
        "model": thread.extra.get("model").and_then(|v| v.as_str())
    })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryQuery {
    after_sequence: Option<u64>,
}

async fn get_history(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Path(thread_id): Path<String>,
    Query(q): Query<HistoryQuery>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::ChatRead).await?;
    let g = state.inner.lock().await;
    let after = q.after_sequence.unwrap_or(0);

    if after > 0 && g.config.min_retained_sequence > 0 && after < g.config.min_retained_sequence {
        return Ok(Json(json!({
            "type": "history",
            "threadId": thread_id,
            "events": [],
            "fromSequence": 0,
            "toSequence": 0,
            "complete": false,
            "snapshotRequired": true,
        })));
    }

    let events = if let Some(fix) = g.fixture_history.get(&thread_id) {
        fix.clone()
    } else {
        g.journal.materialize(&thread_id)
    };

    let sliced = slice_after(&events, after);
    let from = sliced
        .first()
        .and_then(|e| e.pointer("/meta/sequence").and_then(|v| v.as_u64()))
        .unwrap_or(0);
    let to = sliced
        .last()
        .and_then(|e| e.pointer("/meta/sequence").and_then(|v| v.as_u64()))
        .unwrap_or(0);

    Ok(Json(json!({
        "type": "history",
        "threadId": thread_id,
        "events": sliced,
        "fromSequence": from,
        "toSequence": to,
        "complete": true,
        "snapshotRequired": false,
    })))
}

// ----- write (proxy or ack) -----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendBody {
    thread_id: String,
    prompt: String,
    client_request_id: String,
    #[serde(default)]
    client_message_id: Option<String>,
}

async fn send_msg(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Json(body): Json<SendBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let dev = require_device(&state, &headers, Scope::ChatSend).await?;
    if body.prompt.len() > 100_000 {
        return Err(ApiError::payload_too_large());
    }
    let mut g = state.inner.lock().await;
    let fp = format!("send:{}:{}", body.thread_id, body.prompt.len());
    match g
        .idempotency
        .check_or_insert(&body.client_request_id, &dev.device_id, &fp)
    {
        IdempotencyResult::MissingId => {
            return Err(ApiError::bad_request(
                "missing_field",
                "clientRequestId requis",
            ));
        }
        IdempotencyResult::ReplayConflict => {
            return Err(ApiError::bad_request(
                "replay_conflict",
                "clientRequestId déjà utilisé avec une autre charge",
            ));
        }
        IdempotencyResult::ReplaySame => {
            return Ok(Json(json!({
                "ok": true,
                "accepted": true,
                "replay": true,
                "clientRequestId": body.client_request_id,
            })));
        }
        IdempotencyResult::Fresh => {}
    }
    let should_title = g
        .threads
        .get(&body.thread_id)
        .is_some_and(|thread| matches!(thread.title.as_str(), "Nouveau chat" | "Sans titre"));
    if should_title {
        let automatic_title: String = body
            .prompt
            .lines()
            .map(str::trim)
            .find(|line| !line.is_empty())
            .unwrap_or("Nouveau chat")
            .chars()
            .take(64)
            .collect();
        let _ = g.threads.upsert(
            json!({ "id": body.thread_id, "title": automatic_title }),
            false,
        );
    }
    let thread = g.threads.get(&body.thread_id).cloned();
    drop(g);
    let proxied = if let Some(thread) = thread {
        let model = thread.extra.get("model").and_then(Value::as_str).unwrap_or("");
        relay_sidecar(
            &state,
            &dev.device_id,
            json!({
                "type": "send",
                "threadId": body.thread_id,
                "projectRoot": thread.project_root,
                "provider": thread.provider,
                "model": model,
                "prompt": body.prompt,
                "title": thread.title,
                "permissionMode": "default",
                "clientMessageId": body.client_message_id,
            }),
        )
        .await?
    } else {
        false
    };
    Ok(Json(json!({
        "ok": true,
        "accepted": true,
        "replay": false,
        "clientRequestId": body.client_request_id,
        "threadId": body.thread_id,
        "clientMessageId": body.client_message_id,
        "proxied": proxied,
    })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InterruptBody {
    thread_id: String,
    #[serde(default)]
    client_request_id: Option<String>,
}

async fn interrupt_msg(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Json(body): Json<InterruptBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let dev = require_device(&state, &headers, Scope::ChatSend).await?;
    let proxied = relay_sidecar(
        &state,
        &dev.device_id,
        json!({ "type": "interrupt", "threadId": body.thread_id }),
    )
    .await?;
    Ok(Json(json!({
        "ok": true,
        "interrupted": true,
        "threadId": body.thread_id,
        "clientRequestId": body.client_request_id,
        "proxied": proxied,
    })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InteractionBody {
    thread_id: String,
    request_id: String,
    /// Accepted and stored for idempotency fingerprint; not logged.
    response: Value,
    client_request_id: String,
}

async fn interaction_msg(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Json(body): Json<InteractionBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let dev = require_device(&state, &headers, Scope::ChatInteract).await?;
    let mut g = state.inner.lock().await;
    let fp = format!("interaction:{}:{}", body.thread_id, body.request_id);
    match g
        .idempotency
        .check_or_insert(&body.client_request_id, &dev.device_id, &fp)
    {
        IdempotencyResult::MissingId => {
            return Err(ApiError::bad_request(
                "missing_field",
                "clientRequestId requis",
            ));
        }
        IdempotencyResult::ReplayConflict => {
            return Err(ApiError::bad_request(
                "replay_conflict",
                "clientRequestId déjà utilisé",
            ));
        }
        IdempotencyResult::ReplaySame => {
            return Ok(Json(json!({
                "ok": true,
                "accepted": true,
                "replay": true,
                "requestId": body.request_id,
            })));
        }
        IdempotencyResult::Fresh => {}
    }
    drop(g);
    let proxied = relay_sidecar(
        &state,
        &dev.device_id,
        json!({
            "type": "interactionResponse",
            "threadId": body.thread_id,
            "requestId": body.request_id,
            "response": body.response,
            "clientInstanceId": dev.device_id,
        }),
    )
    .await?;
    Ok(Json(json!({
        "ok": true,
        "accepted": true,
        "replay": false,
        "requestId": body.request_id,
        "threadId": body.thread_id,
        "proxied": proxied,
    })))
}

// ----- gallery / files -----

async fn gallery_index(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Path(project_id): Path<String>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::GalleryRead).await?;
    let mut g = state.inner.lock().await;
    let proj = g
        .projects
        .get(&project_id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("projet inconnu"))?;

    let mut items = Vec::new();
    // Shallow scan of common dirs only
    for sub in ["", "figures", "outputs", "docs"] {
        let dir = if sub.is_empty() {
            proj.root.clone()
        } else {
            proj.root.join(sub)
        };
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for ent in rd.flatten() {
            let path = ent.path();
            if !path.is_file() {
                continue;
            }
            let rel = path
                .strip_prefix(&proj.root)
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or_default();
            if normalize_relative(&rel).is_err() {
                continue;
            }
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if !crate::path_policy::is_allowed_ext(&ext) {
                continue;
            }
            let Ok(fid) = g.projects.register_file(&project_id, &rel) else {
                continue;
            };
            let meta = ent.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            let kind = gallery_kind(&ext);
            items.push(json!({
                "fileId": fid,
                "name": path.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                // relativePath is server-side only for debugging; clients must use fileId
                "size": size,
                "ext": ext,
                "kind": kind,
                "modifiedAt": modified,
                "etag": format!("{:x}-{}", size, modified.unwrap_or(0)),
            }));
            if items.len() >= 200 {
                break;
            }
        }
    }
    // stable sort: newest first, then name
    items.sort_by(|a, b| {
        let ma = a.get("modifiedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let mb = b.get("modifiedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        mb.cmp(&ma).then_with(|| {
            let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
            na.cmp(nb)
        })
    });
    Ok(Json(json!({
        "projectId": project_id,
        "items": items,
        "count": items.len(),
    })))
}

fn gallery_kind(ext: &str) -> &'static str {
    match ext {
        "pdf" => "pdf",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "figure",
        "tex" | "bib" | "sty" | "cls" => "latex",
        "md" | "txt" | "csv" | "json" | "yaml" | "yml" | "toml" => "data",
        "rs" | "py" | "r" | "jl" | "ts" | "tsx" | "js" | "jsx" | "css" | "html" => "code",
        _ => "other",
    }
}

async fn get_file_by_path(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Path((project_id, rel)): Path<(String, String)>,
) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::FilesRead).await?;
    // Reject if rel still looks absolute after axum join
    let rel = normalize_relative(&rel)?;
    let g = state.inner.lock().await;
    let proj = g
        .projects
        .get(&project_id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("projet inconnu"))?;
    let abs = crate::path_policy::resolve_under_root(&proj.root, &rel)?;
    let (len, mime) = check_file_readable(&abs)?;
    let etag = file_etag(&abs, len);
    if if_none_match_fresh(&headers, &etag) {
        return Ok(Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(header::ETAG, etag)
            .body(axum::body::Body::empty())
            .unwrap());
    }
    // Range
    if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        return serve_range(&abs, len, &mime, range, &etag);
    }
    let data = std::fs::read(&abs).map_err(|_| ApiError::not_found("fichier introuvable"))?;
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, data.len())
        .header(header::ETAG, etag)
        .header(header::ACCEPT_RANGES, "bytes")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .body(axum::body::Body::from(data))
        .unwrap())
}

async fn get_file_by_id(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::FilesRead).await?;
    let g = state.inner.lock().await;
    let (_proj, abs, _rel) = g.projects.resolve_file_id(&file_id)?;
    let (len, mime) = check_file_readable(&abs)?;
    let etag = file_etag(&abs, len);
    if if_none_match_fresh(&headers, &etag) {
        return Ok(Response::builder()
            .status(StatusCode::NOT_MODIFIED)
            .header(header::ETAG, etag)
            .body(axum::body::Body::empty())
            .unwrap());
    }
    if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        return serve_range(&abs, len, &mime, range, &etag);
    }
    let data = std::fs::read(&abs).map_err(|_| ApiError::not_found("fichier introuvable"))?;
    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, data.len())
        .header(header::ETAG, etag)
        .header(header::ACCEPT_RANGES, "bytes")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .body(axum::body::Body::from(data))
        .unwrap())
}

fn file_etag(path: &std::path::Path, len: u64) -> String {
    let mtime = std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("\"{len:x}-{mtime:x}\"")
}

fn if_none_match_fresh(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(header::IF_NONE_MATCH)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.split(',').any(|t| t.trim() == etag || t.trim() == "*"))
        .unwrap_or(false)
}

fn serve_range(
    path: &std::path::Path,
    len: u64,
    mime: &str,
    range: &str,
    etag: &str,
) -> ApiResult<Response> {
    // bytes=START-END
    let range = range
        .strip_prefix("bytes=")
        .ok_or_else(|| ApiError::bad_request("invalid_range", "Range invalide"))?;
    let mut parts = range.splitn(2, '-');
    let start: u64 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| ApiError::bad_request("invalid_range", "Range invalide"))?;
    let end: u64 = match parts.next() {
        Some("") | None => len.saturating_sub(1),
        Some(e) => e
            .parse()
            .map_err(|_| ApiError::bad_request("invalid_range", "Range invalide"))?,
    };
    if start > end || start >= len {
        return Err(ApiError::bad_request("invalid_range", "Range hors limites"));
    }
    let end = end.min(len - 1);
    let data = std::fs::read(path).map_err(|_| ApiError::not_found("fichier introuvable"))?;
    let slice = data[start as usize..=end as usize].to_vec();
    Ok(Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
        .header(header::CONTENT_LENGTH, slice.len())
        .header(header::ETAG, etag)
        .header(header::ACCEPT_RANGES, "bytes")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .body(axum::body::Body::from(slice))
        .unwrap())
}

// ----- admin -----

async fn admin_page(
    State(state): State<GatewayState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> ApiResult<Html<String>> {
    require_admin(&state, &headers, &addr.ip().to_string()).await?;
    let g = state.inner.lock().await;
    let devices = g.auth.list_devices();
    let pairing = g
        .auth
        .pairing_status()
        .map(|p| {
            format!(
                "<p>Appairage actif — code <strong>{}</strong> (expire unix {})</p>",
                p.code, p.expires_at
            )
        })
        .unwrap_or_else(|| "<p>Aucun appairage en cours.</p>".into());
    let mut rows = String::new();
    for d in devices {
        let status = if d.revoked_at.is_some() {
            "révoqué"
        } else {
            "actif"
        };
        rows.push_str(&format!(
            "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>",
            html_escape(&d.name),
            html_escape(&d.device_id),
            status,
            html_escape(&d.scopes.join(", "))
        ));
    }
    let html = format!(
        r#"<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><title>Atelier Remote — Appareils</title>
<style>
body{{font:13px/1.5 system-ui;background:#1e2124;color:#dadee3;padding:24px;max-width:720px;margin:0 auto}}
table{{width:100%;border-collapse:collapse}}td,th{{border-bottom:1px solid #333;padding:8px;text-align:left}}
code{{background:#24282d;padding:2px 6px;border-radius:6px}}
h1{{font-size:15px;letter-spacing:-0.01em}}
</style></head><body>
<h1>Appareils appairés</h1>
{pairing}
<p>Révocation : <code>POST /remote/admin/devices/&lt;id&gt;/revoke</code> avec en-tête <code>x-atelier-admin-token</code>.</p>
<table><thead><tr><th>Nom</th><th>ID</th><th>État</th><th>Scopes</th></tr></thead>
<tbody>{rows}</tbody></table>
</body></html>"#
    );
    Ok(Html(html))
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingStartBody {
    #[serde(default)]
    device_name_hint: Option<String>,
}

async fn admin_pairing_start(
    State(state): State<GatewayState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Option<Json<PairingStartBody>>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers, &addr.ip().to_string()).await?;
    let hint = body.and_then(|b| b.0.device_name_hint);
    let mut g = state.inner.lock().await;
    let p = g
        .auth
        .start_pairing(hint)
        .map_err(|e| ApiError::bad_request("pairing_error", e.to_string()))?;
    Ok(Json(json!({
        "ok": true,
        "code": p.code,
        "expiresAt": p.expires_at,
        "expiresInSecs": p.expires_in_secs,
    })))
}

async fn admin_pairing_cancel(
    State(state): State<GatewayState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers, &addr.ip().to_string()).await?;
    let mut g = state.inner.lock().await;
    g.auth
        .cancel_pairing()
        .map_err(|e| ApiError::bad_request("pairing_error", e.to_string()))?;
    Ok(Json(json!({ "ok": true })))
}

async fn admin_list_devices(
    State(state): State<GatewayState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers, &addr.ip().to_string()).await?;
    let g = state.inner.lock().await;
    let devices: Vec<Value> = g
        .auth
        .list_devices()
        .into_iter()
        .map(|d| {
            json!({
                "deviceId": d.device_id,
                "name": d.name,
                "scopes": d.scopes,
                "createdAt": d.created_at,
                "lastSeenAt": d.last_seen_at,
                "revoked": d.revoked_at.is_some(),
                "revokedAt": d.revoked_at,
            })
        })
        .collect();
    Ok(Json(json!({ "devices": devices })))
}

async fn admin_revoke(
    State(state): State<GatewayState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers, &addr.ip().to_string()).await?;
    let mut g = state.inner.lock().await;
    g.auth
        .revoke_device(&device_id)
        .map_err(|_| ApiError::not_found("appareil inconnu"))?;
    Ok(Json(
        json!({ "ok": true, "deviceId": device_id, "revoked": true }),
    ))
}

async fn admin_rotate(
    State(state): State<GatewayState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Path(device_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers, &addr.ip().to_string()).await?;
    let mut g = state.inner.lock().await;
    let token = g
        .auth
        .rotate_device_token(&device_id)
        .map_err(|_| ApiError::not_found("appareil inconnu"))?;
    Ok(Json(json!({
        "ok": true,
        "deviceId": device_id,
        "token": token,
        "note": "previous token valid 5 minutes",
    })))
}

/// Helper for tests: reject oversized body middleware concept.
pub fn check_body_size(bytes: &Bytes, max: usize) -> ApiResult<()> {
    if bytes.len() > max {
        Err(ApiError::payload_too_large())
    } else {
        Ok(())
    }
}
