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
use axum::extract::{ConnectInfo, DefaultBodyLimit, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{Html, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[path = "zotero_routes.rs"]
mod zotero_routes;
#[path = "compute_routes.rs"]
mod compute_routes;
#[path = "composer_routes.rs"]
mod composer_routes;
#[path = "image_routes.rs"]
mod image_routes;

pub fn router(state: GatewayState) -> Router {
    Router::new()
        .route("/remote/health", get(health))
        .route("/remote/v1/health", get(health))
        .route("/remote/v1/pair", post(pair_complete))
        .route("/remote/v1/projects", get(list_projects))
        .route("/remote/v1/providers", get(live_providers))
        .route("/remote/v1/compute", get(compute_routes::snapshot))
        .route("/remote/v1/compute/log", get(compute_routes::log))
        .route("/remote/v1/zotero", get(zotero_routes::library))
        .route("/remote/v1/zotero/note/{key}", post(zotero_routes::save_note))
        .route("/remote/v1/zotero/pdf/{key}", get(zotero_routes::pdf))
        .route("/remote/v1/threads/{thread_id}/live", get(live_events))
        .route("/remote/v1/threads", get(list_threads).post(create_thread))
        .route("/remote/v1/threads/{thread_id}/history", get(get_history))
        .route(
            "/remote/v1/threads/{thread_id}/images/{event_id}",
            get(image_routes::image),
        )
        .route("/remote/v1/threads/{thread_id}/images/{event_id}/gallery", post(image_routes::save_to_gallery))
        .route("/remote/v1/threads/{thread_id}/commands", get(composer_routes::commands))
        .route("/remote/v1/threads/{thread_id}/edit", post(edit_message))
        .route("/remote/v1/send", post(send_msg))
        .route("/remote/v1/attachments/{name}", post(upload_attachment).layer(DefaultBodyLimit::max(8 * 1024 * 1024)))
        .route("/remote/v1/document/{file_id}", post(save_document))
        .route("/remote/v1/interrupt", post(interrupt_msg))
        .route("/remote/v1/interaction", post(interaction_msg))
        .route("/remote/v1/gallery/{project_id}", get(gallery_index))
        .route("/remote/v1/file/{file_id}/favorite", post(set_gallery_favorite))
        .route(
            "/remote/v1/files/{project_id}/{*rel}",
            get(get_file_by_path),
        )
        .route(
            "/remote/v1/file/{file_id}",
            get(get_file_by_id).delete(trash_file_by_id),
        )
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
        (
            g.config.sidecar_base.clone(),
            g.config.sidecar_token.clone(),
        )
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
        .map_err(|_| {
            ApiError::new(
                StatusCode::BAD_GATEWAY,
                "sidecar_hello_failed",
                "commande impossible",
            )
        })?;
    socket
        .send(Message::Text(payload.to_string().into()))
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::BAD_GATEWAY,
                "sidecar_send_failed",
                "commande impossible",
            )
        })?;
    if payload["type"] == "send" {
        let accepted = tokio::time::timeout(std::time::Duration::from_secs(15), async {
            while let Some(Ok(frame)) = socket.next().await {
                if let Message::Text(text) = frame {
                    if let Ok(value) = serde_json::from_str::<Value>(&text) {
                        if value["type"] == "error" {
                            return Err(ApiError::new(StatusCode::BAD_GATEWAY, "send_rejected",
                                value["message"].as_str().unwrap_or("Le moteur a refusé le message")));
                        }
                        if value["type"] == "event" && value["threadId"] == payload["threadId"] {
                            let event = &value["event"];
                            if event["kind"] == "user" && (payload["clientMessageId"].is_null() ||
                                event["meta"]["messageId"] == payload["clientMessageId"]) { return Ok(()); }
                            if event["kind"] == "error" {
                                return Err(ApiError::new(StatusCode::BAD_GATEWAY, "send_rejected", "Le moteur a refusé le message"));
                            }
                        }
                    }
                }
            }
            Err(ApiError::new(StatusCode::BAD_GATEWAY, "send_unconfirmed", "Transmission non confirmée ; vérifiez l’historique"))
        }).await.map_err(|_| ApiError::new(StatusCode::GATEWAY_TIMEOUT, "send_unconfirmed", "Transmission non confirmée ; vérifiez l’historique"))?;
        accepted?;
    }
    let _ = socket.close(None).await;
    Ok(true)
}

/// `/remote/health` doit rester joignable sans authentification (sonde de
/// disponibilité avant appairage), mais un appelant non authentifié ne doit
/// pas apprendre le nombre d'appareils appairés ni l'heure de démarrage du
/// gateway (SEC-08 : Host/Origin seuls, sans jeton, sont falsifiables).
async fn health(
    State(state): State<GatewayState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let mut g = state.inner.lock().await;
    let authenticated = extract_bearer(&headers)
        .is_some_and(|token| g.auth.authenticate_token(&token).is_some());
    if !authenticated {
        return Ok(Json(json!({
            "ok": true,
            "service": "atelier-remote-gateway",
            "protocolVersion": PROTOCOL_VERSION,
        })));
    }
    Ok(Json(json!({
        "ok": true,
        "service": "atelier-remote-gateway",
        "protocolVersion": PROTOCOL_VERSION,
        "minProtocolVersion": MIN_PROTOCOL_VERSION,
        "maxProtocolVersion": MAX_PROTOCOL_VERSION,
        "startedAt": g.started_at,
        "devices": g.auth.list_devices().iter().filter(|d| d.revoked_at.is_none()).count(),
    })))
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
    let mut g = state.inner.lock().await;
    g.refresh_catalog();
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
    let mut g = state.inner.lock().await;
    g.refresh_catalog();
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
                "messageRevision": t.extra.get("messageRevision"),
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
    if !matches!(
        provider,
        "claude" | "codex" | "grok" | "opencode" | "gemini"
    ) {
        return Err(ApiError::bad_request(
            "invalid_provider",
            "provider inconnu",
        ));
    }
    let mut g = state.inner.lock().await;
    g.threads = atelier_store::ThreadStore::open(g.config.atelier_dir.join("threads.json"));
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
    if g.config.sidecar_base.is_some() {
        let patch = json!({"id":id,"title":if title.is_empty() {"Nouveau chat"} else {title},
            "provider":provider,"model":body.model.as_deref().unwrap_or(""),"projectRoot":project_root,"status":"idle"});
        drop(g);
        let response = query_readonly(&state, &format!("mobile-create-{id}"),
            json!({"type":"upsertThread","thread":patch}), "threads").await?;
        let thread = response["threads"].as_array().and_then(|rows| rows.iter().find(|row| row["id"] == id))
            .ok_or_else(|| ApiError::new(StatusCode::BAD_GATEWAY,"thread_create_failed","création non confirmée"))?;
        return Ok(Json(json!({"id":id,"title":thread["title"],"provider":provider,
            "model":body.model,"status":thread["status"],"projectId":body.project_id,
            "updatedAt":thread["updatedAt"],"lastSequence":0})));
    }
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

    let mut events = if let Some(fix) = g.fixture_history.get(&thread_id) {
        fix.clone()
    } else {
        g.journal.materialize(&thread_id)
    };

    let has_sidecar = g.config.sidecar_base.is_some();
    drop(g);
    if after == 0 && has_sidecar {
        if let Ok(history) = query_readonly(&state, "mobile-history", json!({"type":"getHistory","threadId":thread_id}), "history").await {
            if let Some(native) = history.get("events").and_then(Value::as_array) { if native.len() >= events.len() { events = native.clone(); } }
        }
    }
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
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    file_ids: Vec<String>,
    thread_id: String,
    prompt: String,
    client_request_id: String,
    #[serde(default)]
    client_message_id: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    effort: Option<String>,
    #[serde(default)]
    permission_mode: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EditMessageBody {
    event_id: String,
    original_text: String,
    prompt: String,
    request_id: String,
    #[serde(default)] file_ids: Vec<String>,
    model: Option<String>,
    effort: Option<String>,
    #[serde(default)] permission_mode: Option<String>,
}

fn requested_permission_mode(mode: Option<&str>) -> ApiResult<&'static str> {
    match mode {
        None | Some("default") => Ok("default"),
        Some("acceptEdits") => Ok("acceptEdits"),
        Some("bypassPermissions") => Ok("bypassPermissions"),
        _ => Err(ApiError::bad_request("invalid_permission_mode", "Mode d’autorisation invalide")),
    }
}

fn check_provider_permission(provider: &str, mode: &str) -> ApiResult<()> {
    if mode != "default" && !atelier_protocol::builtin_providers().iter().any(|p|
        p.id == provider && p.capabilities.permission_modes.iter().any(|m| m == mode)) {
        return Err(ApiError::bad_request("unsupported_permission_mode", "Ce mode d’autorisation n’est pas proposé par cet assistant"));
    }
    Ok(())
}

async fn edit_message(State(state): State<GatewayState>, headers: HeaderMap,
    Path(thread_id): Path<String>, Json(body): Json<EditMessageBody>) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let device = require_device(&state, &headers, Scope::ChatSend).await?;
    let permission_mode = requested_permission_mode(body.permission_mode.as_deref())?;
    require_device(&state, &headers, Scope::ChatRead).await?;
    if uuid::Uuid::parse_str(&body.request_id).is_err() || body.event_id.is_empty()
        || body.original_text.len() > 120_000 || body.prompt.len() > 100_000
        || (body.prompt.trim().is_empty() && body.file_ids.is_empty()) {
        return Err(ApiError::bad_request("invalid_edit", "Modification de message invalide"));
    }
    if body.file_ids.len() > 6 { return Err(ApiError::bad_request("too_many_files", "Six pièces jointes maximum")); }
    if let Some(effort) = body.effort.as_deref() {
        if !["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].contains(&effort) {
            return Err(ApiError::bad_request("invalid_effort", "Niveau de réflexion invalide"));
        }
    }
    {
        let mut g = state.inner.lock().await;
        g.threads = atelier_store::ThreadStore::open(g.config.atelier_dir.join("threads.json"));
        let thread = g.threads.get(&thread_id).ok_or_else(|| ApiError::not_found("conversation introuvable"))?;
        check_provider_permission(&thread.provider, permission_mode)?;
        if !body.file_ids.is_empty() && !has_scope(&device.scopes, Scope::FilesRead) {
            return Err(ApiError::forbidden_scope("files:read"));
        }
        for id in &body.file_ids { let (_, path, _) = g.projects.resolve_file_id(id)?; check_file_readable(&path)?; }
    }
    let fingerprint = hash_token(&json!([thread_id, body.event_id, body.original_text,
        body.prompt, body.file_ids, body.model, body.effort, permission_mode, device.device_id]).to_string());
    let prepared = query_readonly(&state, &format!("{}-edit", device.device_id), json!({
        "type":"prepareMessageEdit", "requestId":body.request_id, "threadId":thread_id,
        "newThreadId":body.request_id, "messageId":body.request_id, "eventId":body.event_id,
        "originalText":body.original_text, "fingerprint":fingerprint,
    }), "messageEditPrepared").await?;
    let result = &prepared["result"];
    if let Some(error) = result["error"].as_str() { return Err(ApiError::new(StatusCode::CONFLICT, "edit_conflict", error)); }
    let thread = &result["thread"];
    if thread["id"] != body.request_id { return Err(ApiError::new(StatusCode::BAD_GATEWAY, "edit_unconfirmed", "Modification non confirmée")); }
    // After a lost HTTP acknowledgement, the durable user event confirms the
    // previous send. Never generate a second response for the same revision.
    if result["sent"] != true {
        let sent = send_msg(State(state.clone()), headers.clone(), Json(SendBody {
            mode: None,
            thread_id:body.request_id.clone(), prompt:body.prompt, client_request_id:body.request_id.clone(),
            client_message_id:Some(body.request_id.clone()), file_ids:body.file_ids,
            model:body.model.clone(), effort:body.effort, permission_mode:body.permission_mode,
        })).await?;
        if sent.0["proxied"] != true { return Err(ApiError::new(StatusCode::BAD_GATEWAY, "edit_unconfirmed", "Envoi non confirmé. La version originale est conservée ; réessayez pour vérifier.")); }
    }
    let project_id = thread["projectRoot"].as_str().filter(|s| !s.is_empty())
        .map(|root| crate::path_policy::project_id_for(std::path::Path::new(root)));
    Ok(Json(json!({"proxied":true, "thread":{
        "id":thread["id"], "title":thread["title"], "provider":thread["provider"],
        "model":body.model.or_else(|| thread["model"].as_str().map(str::to_owned)),
        "status":"idle", "projectId":project_id, "messageRevision":thread["messageRevision"],
    }})))
}

async fn send_msg(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Json(body): Json<SendBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let dev = require_device(&state, &headers, Scope::ChatSend).await?;
    if body.mode.as_deref().is_some_and(|mode| mode != "steer") {
        return Err(ApiError::bad_request("invalid_mode", "Mode d’envoi invalide"));
    }
    let requested_permission = requested_permission_mode(body.permission_mode.as_deref())?;
    if body.mode.as_deref() == Some("steer") && body.permission_mode.is_some() {
        return Err(ApiError::bad_request("invalid_permission_mode", "Le travail en cours conserve son mode d’autorisation"));
    }
    if body.prompt.len() > 100_000 {
        return Err(ApiError::payload_too_large());
    }
    let mut g = state.inner.lock().await;
    g.threads = atelier_store::ThreadStore::open(g.config.atelier_dir.join("threads.json"));
    if g.threads.get(&body.thread_id).is_none() && !g.fixture_history.contains_key(&body.thread_id) {
        return Err(ApiError::not_found("conversation introuvable"));
    }
    let permission_mode = if body.mode.as_deref() == Some("steer") {
        // A late steer may fall back to a new turn in a provider. Never
        // inherit a previous full-access grant for that implicit send.
        "default"
    } else {
        if let Some(thread) = g.threads.get(&body.thread_id) { check_provider_permission(&thread.provider, requested_permission)?; }
        requested_permission
    };
    if let Some(effort) = body.effort.as_deref() {
        if !["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].contains(&effort) {
            return Err(ApiError::bad_request("invalid_effort", "niveau de réflexion invalide"));
        }
    }
    if body.file_ids.len() > 6 { return Err(ApiError::bad_request("too_many_files", "six pièces jointes maximum")); }
    let mut files = Vec::new();
    if !body.file_ids.is_empty() {
        if !has_scope(&dev.scopes, Scope::FilesRead) { return Err(ApiError::forbidden_scope("files:read")); }
        for id in &body.file_ids {
            let (_, path, _) = g.projects.resolve_file_id(id)?;
            let (_, mime) = check_file_readable(&path)?;
            files.push((path, mime));
        }
    }
    let fp = hash_token(&json!([body.thread_id, body.prompt, body.model, body.effort, body.file_ids, body.mode, permission_mode]).to_string());
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
            let confirmed = body.client_message_id.as_deref().is_some_and(|id|
                g.journal.materialize(&body.thread_id).iter().any(|event|
                    event["kind"] == "user" && event["meta"]["messageId"].as_str() == Some(id)));
            if !confirmed {
                return Err(ApiError::new(StatusCode::CONFLICT, "send_unconfirmed",
                    "La transmission précédente est encore à vérifier. Le message est conservé."));
            }
            return Ok(Json(json!({"ok":true, "accepted":true, "proxied":true,
                "replay":true, "clientRequestId":body.client_request_id})));
        }
        IdempotencyResult::Fresh => {}
    }
    let should_title = g
        .threads
        .get(&body.thread_id)
        .is_some_and(|thread| matches!(thread.title.as_str(), "Nouveau chat" | "Sans titre"));
    if should_title && g.config.sidecar_base.is_none() {
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
    let imports = g.config.atelier_dir.join("mobile-uploads");
    let names: Vec<_> = files.iter().map(|(p,_)| {
        let name = p.file_name().unwrap_or_default().to_string_lossy();
        if p.starts_with(&imports) { name.get(65..).unwrap_or(&name).to_string() } else { name.into_owned() }
    }).collect();
    drop(g);
    let display = if names.is_empty() { body.prompt.clone() } else { format!("{}\n\nPièces jointes : {}",body.prompt,names.join(", ")) };
    let prompt = if files.is_empty() { body.prompt.clone() } else {
        format!("{}\n\nFichiers joints par l’utilisateur, à consulter pour répondre :\n{}", body.prompt,
            files.iter().map(|(path,_)| serde_json::to_string(&path.to_string_lossy()).unwrap()).collect::<Vec<_>>().join("\n"))
    };
    let (prompt, skill_input) = if let Some(thread) = &thread {
        composer_routes::skill_prompt(thread.project_root.clone(), &body.prompt, prompt).await
    } else { (prompt, None) };
    let image_paths: Vec<_> = files.iter().filter(|(_,mime)| mime.starts_with("image/") && mime != "image/svg+xml")
        .map(|(p,_)| p.to_string_lossy().into_owned()).collect();
    let mut inputs = vec![json!({"type":"text","text":prompt})];
    inputs.extend(image_paths.iter().map(|path| json!({"type":"local_image","path":path})));
    if let Some(skill) = skill_input { inputs.push(skill); }
    let relay = if let Some(thread) = thread {
        let model = body.model.as_deref().unwrap_or_else(|| thread.extra.get("model").and_then(Value::as_str).unwrap_or(""));
        relay_sidecar(
            &state,
            &dev.device_id,
            json!({
                "type": "send",
                "mode": body.mode,
                "threadId": body.thread_id,
                "projectRoot": thread.project_root,
                "provider": thread.provider,
                "model": model,
                "effort": body.effort,
                "prompt": prompt,
                "displayEvent": {"kind":"user","text":display,"imagePaths":image_paths},
                "inputs": inputs,
                "attachments": image_paths.iter().map(|path| json!({"path":path})).collect::<Vec<_>>(),
                "title": thread.title,
                "permissionMode": permission_mode,
                "clientMessageId": body.client_message_id,
            }),
        )
        .await
    } else {
        Ok(false)
    };
    let proxied = match relay {
        Ok(true) => true,
        Ok(false) => {
            state.inner.lock().await.idempotency.release(&body.client_request_id, &dev.device_id, &fp);
            false
        }
        Err(error) => {
            if matches!(error.code.as_str(), "sidecar_unavailable" | "sidecar_hello_failed") {
                state.inner.lock().await.idempotency.release(&body.client_request_id, &dev.device_id, &fp);
            }
            return Err(error);
        }
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

#[derive(Deserialize, Default)]
struct GalleryQuery {
    snapshot: Option<String>,
    #[serde(default)]
    offset: usize,
}

async fn gallery_index(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Path(project_id): Path<String>,
    Query(query): Query<GalleryQuery>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::GalleryRead).await?;
    let (snapshot, items) = if let Some(key) = query.snapshot {
        let g = state.inner.lock().await;
        let (project, created, items) = g.gallery_snapshots.get(&key)
            .ok_or_else(|| ApiError::bad_request("gallery_expired", "Actualisez la galerie"))?;
        if project != &project_id || created.elapsed().as_secs() > 600 {
            return Err(ApiError::bad_request("gallery_expired", "Actualisez la galerie"));
        }
        (key, items.clone())
    } else {
        if query.offset != 0 { return Err(ApiError::bad_request("gallery_cursor", "Instantané de galerie requis")); }
        let proj = state.inner.lock().await.projects.get(&project_id).cloned()
            .ok_or_else(|| ApiError::not_found("projet inconnu"))?;
        let items = std::sync::Arc::new(tokio::task::spawn_blocking(move || scan_gallery(proj)).await
            .map_err(|_| ApiError::bad_request("gallery_scan", "Lecture du projet interrompue"))?);
        let key = uuid::Uuid::new_v4().to_string();
        let mut g = state.inner.lock().await;
        g.gallery_snapshots.retain(|_, (_, created, _)| created.elapsed().as_secs() <= 600);
        if g.gallery_snapshots.len() >= 8 {
            if let Some(oldest) = g.gallery_snapshots.iter().min_by_key(|(_, (_, time, _))| *time).map(|(key, _)| key.clone()) { g.gallery_snapshots.remove(&oldest); }
        }
        g.gallery_snapshots.insert(key.clone(), (project_id.clone(), std::time::Instant::now(), items.clone()));
        (key, items)
    };
    let total = items.len();
    let offset = query.offset.min(total);
    let mut page: Vec<Value> = items.iter().skip(offset).take(500).cloned().collect();
    let mut g = state.inner.lock().await;
    let project = g.projects.get(&project_id).ok_or_else(|| ApiError::not_found("projet inconnu"))?;
    let favorites = atelier_core::gallery_favorites::read(&project.root)
        .map(|value| atelier_core::gallery_favorites::favorites(&value))
        .map_err(|_| ApiError::bad_request("gallery_state", "Lecture des favoris impossible"))?;
    for item in &mut page {
        if let Some(rel) = item.as_object_mut().and_then(|obj| obj.remove("_relative")) {
            item["favorite"] = json!(favorites.contains(rel.as_str().unwrap_or_default()));
            g.projects.register_file(&project_id, rel.as_str().unwrap_or_default())?;
        }
    }
    let end = offset + page.len();
    Ok(Json(json!({"projectId": project_id, "count": page.len(), "total": total,
        "snapshot": snapshot, "nextOffset": if end < total { Some(end) } else { None }, "items": page})))
}

#[derive(Deserialize)]
struct FavoriteBody { on: bool }
async fn set_gallery_favorite(
    State(state): State<GatewayState>, headers: HeaderMap,
    Path(file_id): Path<String>, Json(body): Json<FavoriteBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::GalleryRead).await?;
    require_device(&state, &headers, Scope::FilesWrite).await?;
    let (project, _, relative) = state.inner.lock().await.projects.resolve_file_id(&file_id)?;
    tokio::task::spawn_blocking(move || atelier_core::gallery_favorites::set(&project.root, &relative, body.on))
        .await.map_err(|_| ApiError::bad_request("gallery_state", "Enregistrement interrompu"))?
        .map_err(|_| ApiError::bad_request("gallery_state", "Enregistrement du favori impossible"))?;
    Ok(Json(json!({"favorite": body.on})))
}

fn scan_gallery(proj: crate::path_policy::ProjectEntry) -> Vec<Value> {
    let mut items = Vec::new();
    // Scan outside the async runtime and registry lock; paginate only after sorting.
    let mut pending = vec![proj.root.clone()];
    while let Some(dir) = pending.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for ent in rd.flatten() {
            let path = ent.path();
            let Ok(file_type) = ent.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !matches!(
                    name,
                    ".git"
                        | "node_modules"
                        | "target"
                        | ".atelier-trash"
                        | ".venv"
                        | "venv"
                        | "__pycache__"
                ) && !name.starts_with('.')
                {
                    pending.push(path);
                }
                continue;
            }
            if path.file_name().is_some_and(|name| name == ".fig_state.json") { continue; }
            if !file_type.is_file() {
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
            let fid = crate::path_policy::file_id_for(&proj.project_id, &rel);
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
                "_relative": rel, // Removed before returning the page.
                "size": size,
                "ext": ext,
                "kind": kind,
                "modifiedAt": modified,
                "etag": format!("{:x}-{}", size, modified.unwrap_or(0)),
            }));
        }
    }
    // stable sort: newest first, then name
    items.sort_by(|a, b| {
        let ma = a.get("modifiedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let mb = b.get("modifiedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        mb.cmp(&ma).then_with(|| {
            let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
            na.cmp(nb).then_with(|| a["fileId"].as_str().cmp(&b["fileId"].as_str()))
        })
    });
    items
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveDocumentBody { original: String, content: String }

async fn save_document(
    State(state): State<GatewayState>, headers: HeaderMap,
    Path(file_id): Path<String>, Json(body): Json<SaveDocumentBody>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesWrite).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    let g = state.inner.lock().await;
    let (_, path, _) = g.projects.resolve_file_id(&file_id)?;
    save_text_version(&path, &body.original, &body.content)?;
    Ok(Json(json!({"ok": true})))
}

fn save_text_version(path: &std::path::Path, original: &str, content: &str) -> ApiResult<()> {
    use std::io::Write;
    let ext = path.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["tex", "bib", "txt", "md"].contains(&ext.as_str()) || content.len() > 100_000 {
        return Err(ApiError::bad_request("unsupported_document", "Sauvegarde limitée aux textes et LaTeX de 100 Ko."));
    }
    let current = std::fs::read_to_string(path).map_err(|_| ApiError::not_found("Document UTF-8 introuvable"))?;
    if current != original {
        return Err(ApiError::new(StatusCode::CONFLICT, "document_changed", "Le document a changé sur le Mac. Rechargez-le avant de réappliquer votre modification."));
    }
    let parent = path.parent().ok_or_else(|| ApiError::bad_request("invalid_path", "Document invalide"))?;
    let temp = parent.join(format!(".atelier-edit-{}", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temp)?;
        file.set_permissions(std::fs::metadata(path)?.permissions())?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        // Check again immediately before replacing: also catches edits made while preparing the new file.
        if std::fs::read_to_string(path)? != original {
            return Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "document changed"));
        }
        std::fs::rename(&temp, path)
    })();
    let _ = std::fs::remove_file(&temp);
    result.map_err(|error| ApiError::new(
        if error.kind() == std::io::ErrorKind::AlreadyExists { StatusCode::CONFLICT } else { StatusCode::INTERNAL_SERVER_ERROR },
        "save_failed", "Le fichier n’a pas été enregistré. Conservez votre brouillon et rechargez le document."))
}

async fn trash_file_by_id(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::FilesWrite).await?;
    let g = state.inner.lock().await;
    let (project, abs, rel) = g.projects.resolve_file_id(&file_id)?;
    if !abs.is_file() {
        return Err(ApiError::not_found("fichier introuvable"));
    }

    let trash_dir = project.root.join(".atelier-trash");
    std::fs::create_dir_all(&trash_dir).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "trash_unavailable",
            "impossible de préparer la corbeille Atelier",
        )
    })?;
    let original_name = abs
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("fichier");
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let destination = trash_dir.join(format!("{stamp}-{original_name}"));
    std::fs::rename(&abs, &destination).map_err(|_| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "trash_failed",
            "impossible de déplacer le fichier dans la corbeille Atelier",
        )
    })?;
    Ok(Json(json!({
        "ok": true,
        "fileId": file_id,
        "name": original_name,
        "original": rel,
        "recoverable": true,
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

async fn read_socket(state: &GatewayState, device: &str) -> ApiResult<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>> {
    let (base, token) = { let g = state.inner.lock().await; (g.config.sidecar_base.clone(), g.config.sidecar_token.clone()) };
    let base = base.ok_or_else(|| ApiError::new(StatusCode::BAD_GATEWAY, "offline", "Atelier est déconnecté"))?;
    let base = base.replacen("http://", "ws://", 1).replacen("https://", "wss://", 1);
    let url = match token { Some(token) => format!("{}/?token={token}", base.trim_end_matches('/')), None => format!("{}/",base.trim_end_matches('/')) };
    let (mut socket, _) = connect_async(url).await.map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY,"offline","Atelier est déconnecté"))?;
    socket.send(Message::Text(json!({"type":"clientHello","clientInstanceId":device}).to_string().into())).await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY,"offline","Connexion impossible"))?;
    Ok(socket)
}

async fn query_readonly(state: &GatewayState, device: &str, query: Value, expected: &str) -> ApiResult<Value> {
    let mut socket = read_socket(state, device).await?;
    socket.send(Message::Text(query.to_string().into())).await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY,"offline","Lecture indisponible"))?;
    tokio::time::timeout(std::time::Duration::from_secs(15), async {
        while let Some(Ok(frame)) = socket.next().await {
            if let Message::Text(text) = frame {
                if let Ok(value) = serde_json::from_str::<Value>(&text) {
                    if value.get("type").and_then(Value::as_str) == Some(expected) {
                        let confirms_creation = query["type"] != "upsertThread" ||
                            value["threads"].as_array().is_some_and(|rows| rows.iter().any(|row| row["id"] == query["thread"]["id"]));
                        let confirms_edit = query["type"] != "prepareMessageEdit" || value["requestId"] == query["requestId"];
                        if confirms_creation && confirms_edit { return Some(value); }
                    }
                }
            }
        }
        None
    }).await.ok().flatten().ok_or_else(|| ApiError::new(StatusCode::BAD_GATEWAY,"offline","Lecture indisponible"))
}

async fn live_providers(State(state): State<GatewayState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let device = require_device(&state, &headers, Scope::ChatRead).await?;
    query_readonly(&state, &format!("{}-catalog",device.device_id), json!({"type":"providerStatus"}), "providerStatus").await.map(Json)
}

async fn live_events(State(state): State<GatewayState>, headers: HeaderMap, Path(thread_id): Path<String>) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    let device = require_device(&state, &headers, Scope::ChatRead).await?;
    let socket = read_socket(&state, &format!("{}-live",device.device_id)).await?;
    let token = extract_bearer(&headers).ok_or_else(ApiError::unauthorized)?;
    let stream = futures_util::stream::unfold((socket, thread_id, state, token), |(mut socket, thread_id, state, token)| async move {
        loop {
            match tokio::time::timeout(std::time::Duration::from_secs(15), socket.next()).await {
                Err(_) => {
                    if state.inner.lock().await.auth.lookup_token(&token).is_none() { return None; }
                    return Some((Ok::<Bytes,std::io::Error>(Bytes::from_static(b"{}\n")), (socket,thread_id,state,token)));
                },
                Ok(Some(Ok(Message::Text(text)))) => {
                    if let Ok(value) = serde_json::from_str::<Value>(&text) {
                        if value.get("type").and_then(Value::as_str) == Some("event") && value.get("threadId").and_then(Value::as_str) == Some(&thread_id) {
                            if state.inner.lock().await.auth.lookup_token(&token).is_none() { return None; }
                            let event = value.get("event").cloned().unwrap_or(Value::Null);
                            return Some((Ok(Bytes::from(format!("{}\n",event))), (socket,thread_id,state,token)));
                        }
                    }
                }
                Ok(Some(Ok(_))) => {},
                _ => return None,
            }
        }
    });
    let stream = futures_util::stream::once(async { Ok::<Bytes,std::io::Error>(Bytes::from_static(b"{}\n")) }).chain(stream);
    Ok(Response::builder().header(header::CONTENT_TYPE,"application/x-ndjson")
        .header(header::CACHE_CONTROL,"no-store").body(axum::body::Body::from_stream(stream)).unwrap())
}

/// Imports are isolated from project sources. Clients never choose a Mac path.
async fn upload_attachment(
    State(state): State<GatewayState>, headers: HeaderMap, Path(name): Path<String>, bytes: Bytes
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let device = require_device(&state, &headers, Scope::FilesWrite).await?;
    let name = normalize_relative(&name)?;
    if name.contains('/') || name.len() > 180 || bytes.is_empty() || bytes.len() > 8 * 1024 * 1024 {
        return Err(ApiError::bad_request("invalid_attachment", "fichier invalide ou supérieur à 8 Mo"));
    }
    let ext = std::path::Path::new(&name).extension().and_then(|v| v.to_str()).unwrap_or("");
    if !crate::path_policy::is_allowed_ext(ext) {
        return Err(ApiError::bad_request("mime_not_allowed", "type de fichier non autorisé"));
    }
    let mut g = state.inner.lock().await;
    let root = g.config.atelier_dir.join("mobile-uploads").join(&device.device_id);
    std::fs::create_dir_all(&root).map_err(|_| ApiError::bad_request("upload_failed", "import impossible"))?;
    use sha2::{Digest, Sha256};
    let stored_name = format!("{}-{}", hex::encode(Sha256::digest(&bytes)), name);
    let path = root.join(&stored_name);
    if !path.is_file() {
        let used: u64 = std::fs::read_dir(&root).into_iter().flatten().flatten()
            .filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum();
        if used + bytes.len() as u64 > 128 * 1024 * 1024 {
            return Err(ApiError::bad_request("upload_quota", "quota des imports atteint (128 Mo)"));
        }
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)
            .map_err(|_| ApiError::bad_request("upload_failed", "import impossible"))?;
        if file.write_all(&bytes).is_err() {
            let _ = std::fs::remove_file(&path);
            return Err(ApiError::bad_request("upload_failed", "import impossible"));
        }
    }
    let project = g.projects.register_project(&root, Some("Imports iPhone".into()));
    let id = g.projects.register_file(&project.project_id, &stored_name)?;
    Ok(Json(json!({"fileId":id,"name":name,"size":bytes.len()})))
}
