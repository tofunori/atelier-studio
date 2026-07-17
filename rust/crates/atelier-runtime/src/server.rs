//! Axum HTTP + WebSocket server (R1 surface).

use crate::atomic::write_file_atomic;
use crate::instance::{clear_pid_if_ours, write_lock, write_pid};
use crate::paths::AppPaths;
use crate::state::AppState;
use atelier_protocol::{
    ClientMessage, ErrorMessage, PongMessage, SetupProviderRow, SetupRuntime, SetupSidecar,
    SetupStatus,
};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::Value;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::{error, info, warn};

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub paths: AppPaths,
    pub token: Option<String>,
    pub app_version: String,
    pub bundle_hash: String,
    pub server_dir: String,
    /// When true, write sidecar.lock after bind (standalone / tests).
    pub write_lock: bool,
    /// Skip single-instance (tests with isolated dirs).
    pub skip_single_instance: bool,
    pub bind: SocketAddr,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            paths: AppPaths::default_mac(),
            token: None,
            app_version: "dev".into(),
            bundle_hash: "dev".into(),
            server_dir: std::env::current_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| ".".into()),
            write_lock: false,
            skip_single_instance: false,
            bind: SocketAddr::from(([127, 0, 0, 1], 0)),
        }
    }
}

pub struct ServerHandle {
    pub port: u16,
    pub state: AppState,
    shutdown: Option<oneshot::Sender<()>>,
    join: Option<tokio::task::JoinHandle<()>>,
    automation_join: Option<tokio::task::JoinHandle<()>>,
}

impl ServerHandle {
    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
        if let Some(join) = self.join.take() {
            let _ = join.await;
        }
        if let Some(join) = self.automation_join.take() {
            join.abort();
        }
        clear_pid_if_ours(self.state.paths(), std::process::id());
    }
}

/// Build the Axum router (used by tests and production).
pub fn app_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health_handler))
        .route("/providers", get(providers_handler))
        .route("/setup", get(setup_handler))
        .route("/uistate", get(uistate_get).post(uistate_post))
        .route("/gallery-command", post(gallery_command_handler))
        .route("/", get(ws_upgrade))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Serve until shutdown signal. Prints health JSON on stdout (Tauri bootstrap).
pub async fn run_server(
    config: ServerConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let handle = serve_once(config).await?;
    // Block until SIGTERM / Ctrl-C.
    let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("SIGINT — graceful shutdown");
        }
        _ = sigterm.recv() => {
            info!("SIGTERM — graceful shutdown");
        }
    }
    handle.shutdown().await;
    Ok(())
}

/// Start listening once; return handle for tests.
pub async fn serve_once(
    config: ServerConfig,
) -> Result<ServerHandle, Box<dyn std::error::Error + Send + Sync>> {
    std::fs::create_dir_all(&config.paths.app_dir)?;

    let started_at = make_started_at();
    let pid = std::process::id();

    if !config.skip_single_instance {
        let action = crate::instance::resolve_single_instance(
            &config.paths,
            pid,
            &config.bundle_hash,
            Duration::from_millis(800),
        )
        .await;
        if let crate::instance::InstanceAction::Defer { old_pid } = action {
            error!(
                old_pid,
                "sidecar healthy already active (same bundle) — exiting without claiming"
            );
            std::process::exit(0);
        }
    }

    write_pid(&config.paths, pid)?;

    let state = AppState::new(
        config.paths.clone(),
        config.token.clone(),
        started_at,
        config.app_version.clone(),
        config.bundle_hash.clone(),
        config.server_dir.clone(),
    );

    let listener = TcpListener::bind(config.bind).await?;
    let port = listener.local_addr()?.port();
    state.set_port(port).await;

    let health = state.health().await;
    // First stdout line must be JSON health — Tauri parse_startup depends on it.
    println!("{}", serde_json::to_string(&health)?);

    if config.write_lock {
        if let Some(token) = config.token.as_deref() {
            write_lock(&config.paths, port, token, &health)?;
        } else {
            write_lock(&config.paths, port, "", &health)?;
        }
    }

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let app = app_router(state.clone());
    let paths = config.paths.clone();

    let join = tokio::spawn(async move {
        let serve = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            let _ = shutdown_rx.await;
        });
        if let Err(e) = serve.await {
            error!(error = %e, "server error");
        }
        clear_pid_if_ours(&paths, std::process::id());
        info!("server stopped");
    });

    info!(port, "atelier-studio-server listening");
    let automation_join = crate::automations::spawn_scheduler(state.clone());

    Ok(ServerHandle {
        port,
        state,
        shutdown: Some(shutdown_tx),
        join: Some(join),
        automation_join: Some(automation_join),
    })
}

fn chrono_iso_now_fixed() -> String {
    // Node uses `new Date().toISOString()` — UTC with millis.
    use std::time::{SystemTime, UNIX_EPOCH};
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = d.as_secs() as i64;
    let millis = d.subsec_millis();
    let (y, mo, day, h, mi, s) = civil_from_days(secs);
    format!("{y:04}-{mo:02}-{day:02}T{h:02}:{mi:02}:{s:02}.{millis:03}Z")
}

/// Algorithm from Howard Hinnant — civil calendar from Unix days.
fn civil_from_days(unix_secs: i64) -> (i32, u32, u32, u32, u32, u32) {
    let z = unix_secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    let tod = unix_secs.rem_euclid(86_400) as u32;
    let h = tod / 3600;
    let mi = (tod % 3600) / 60;
    let s = tod % 60;
    (y as i32, m, d, h, mi, s)
}

fn make_started_at() -> String {
    chrono_iso_now_fixed()
}

fn auth_or_401(state: &AppState, headers: &HeaderMap) -> Result<(), StatusCode> {
    let token = headers.get("x-atelier-token").and_then(|v| v.to_str().ok());
    if state.authorized(token) {
        Ok(())
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

async fn health_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    auth_or_401(&state, &headers)?;
    Ok(Json(state.health().await))
}

async fn providers_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    auth_or_401(&state, &headers)?;
    let mut providers = atelier_providers::provider_status_list(Some(state.app_dir()));
    for provider in &mut providers {
        let installed = state.provider(&provider.id).is_some();
        provider.ok = installed;
        if installed && provider.version.is_none() {
            provider.version = Some("ok".into());
        }
    }
    Ok(Json(providers))
}

async fn setup_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    auth_or_401(&state, &headers)?;
    let mut providers = Vec::new();
    for p in atelier_providers::provider_status_list(Some(state.app_dir())) {
        let live = state.provider(&p.id);
        // Sonde dédiée (kimi, plan 046) : mêmes états que la route WS
        // setupStatus — l'endpoint HTTP /setup doit rester en parité.
        if let Some(probe) = match &live {
            Some(provider) => provider.setup_probe().await,
            None => None,
        } {
            let state_str = probe
                .get("state")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            providers.push(SetupProviderRow {
                id: p.id,
                label: p.label,
                kind: p.kind,
                installed: state_str != "not_installed",
                version: probe
                    .get("version")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                bin_path: probe
                    .get("binPath")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                auth: state_str,
                models: probe
                    .get("models")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or(0) as usize,
                default_model: p.default_model,
                model_error: probe
                    .get("error")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
            });
            continue;
        }
        let installed = live.is_some();
        providers.push(SetupProviderRow {
            id: p.id,
            label: p.label,
            kind: p.kind,
            installed,
            version: installed.then(|| "ok".into()),
            bin_path: None,
            auth: if installed { "ready" } else { "not_installed" }.into(),
            models: p.models.len(),
            default_model: p.default_model,
            model_error: None,
        });
    }
    let status = SetupStatus {
        runtime: SetupRuntime {
            node: "rust".into(),
            version: env!("CARGO_PKG_VERSION").into(),
            bundled: false,
        },
        sidecar: SetupSidecar {
            pid: std::process::id(),
            started_at: state.started_at().to_string(),
            app_version: state.app_version().to_string(),
            bundle_hash: state.bundle_hash().to_string(),
            dir: state.server_dir().to_string(),
        },
        providers,
    };
    Ok(Json(status))
}

async fn uistate_get(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, StatusCode> {
    auth_or_401(&state, &headers)?;
    let body = std::fs::read_to_string(&state.paths().ui_file).unwrap_or_else(|_| "{}".into());
    Ok(([(header::CONTENT_TYPE, "application/json")], body))
}

async fn uistate_post(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> Result<&'static str, StatusCode> {
    auth_or_401(&state, &headers)?;
    if serde_json::from_str::<serde_json::Value>(&body).is_ok() {
        if let Err(e) = write_file_atomic(&state.paths().ui_file, body.as_bytes()) {
            warn!(error = %e, "uistate write failed");
        }
    }
    Ok("ok")
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GalleryCommand {
    action: String,
    mode: String,
    #[serde(rename = "projectRoot")]
    project_root: String,
    #[serde(rename = "requestId")]
    request_id: String,
    rels: Vec<String>,
}

impl GalleryCommand {
    fn valid(&self) -> bool {
        let shape_ok = match self.action.as_str() {
            "show" => self.mode == "focus" && !self.rels.is_empty(),
            "open" => self.mode == "viewer" && self.rels.len() == 1,
            "compare" => self.mode == "selection" && self.rels.len() >= 2,
            "reset" => self.mode == "all" && self.rels.is_empty(),
            _ => false,
        };
        shape_ok
            && std::path::Path::new(&self.project_root).is_absolute()
            && !self.request_id.is_empty()
            && self.request_id.len() <= 128
            && self.rels.len() <= 100
            && self.rels.iter().all(|rel| {
                !rel.is_empty()
                    && rel.len() <= 2048
                    && !std::path::Path::new(rel).is_absolute()
                    && !rel.split('/').any(|part| part == "..")
            })
    }
}

async fn gallery_command_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(command): Json<GalleryCommand>,
) -> Result<(StatusCode, Json<Value>), StatusCode> {
    auth_or_401(&state, &headers)?;
    if !command.valid() {
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"ok":false,"error":"gallery-command-invalid"})),
        ));
    }
    let payload = serde_json::json!({
        "type": "galleryCommand",
        "command": {
            "action": command.action,
            "mode": command.mode,
            "projectRoot": command.project_root,
            "requestId": command.request_id,
            "rels": command.rels,
        }
    });
    state.publish(payload.to_string());
    Ok((
        StatusCode::ACCEPTED,
        Json(serde_json::json!({
            "ok": true,
            "queued": true,
            "requestId": payload["command"]["requestId"],
        })),
    ))
}

#[derive(Debug, Deserialize)]
struct WsQuery {
    token: Option<String>,
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(q): Query<WsQuery>,
) -> impl IntoResponse {
    if !state.authorized_ws_token(q.token.as_deref()) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state))
        .into_response()
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    // Bus delivers harness stream events (`type: event`) and thread updates
    // from background tasks. Direct replies cover request/response WS types.
    let mut bus_rx = state.subscribe_bus();
    loop {
        tokio::select! {
            bus = bus_rx.recv() => {
                match bus {
                    Ok(text) => {
                        if sender.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let replies = crate::ws_router::route_ws(&state, &text).await;
                        for reply in replies {
                            if sender.send(Message::Text(reply.into())).await.is_err() {
                                return;
                            }
                        }
                    }
                    Some(Ok(Message::Ping(p))) => {
                        if sender.send(Message::Pong(p)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }
}

/// Route a single WS text frame (sync wrapper for unit tests of ping).
pub fn route_ws_text(text: &str) -> String {
    // Minimal sync path for tests that only need ping/error shape.
    if let Ok(msg) = serde_json::from_str::<ClientMessage>(text) {
        if msg.msg_type == "ping" {
            return serde_json::to_string(&PongMessage::new())
                .unwrap_or_else(|_| r#"{"type":"pong"}"#.into());
        }
        return serde_json::to_string(&ErrorMessage::new(format!(
            "type inconnu: {}",
            msg.msg_type
        )))
        .unwrap_or_else(|_| r#"{"type":"error","message":"type inconnu"}"#.into());
    }
    serde_json::to_string(&ErrorMessage::new("JSON invalide"))
        .unwrap_or_else(|_| r#"{"type":"error","message":"JSON invalide"}"#.into())
}

/// Config from environment (production entry).
pub fn config_from_env() -> ServerConfig {
    let token = std::env::var("ATELIER_TOKEN")
        .ok()
        .filter(|s| !s.is_empty());
    if token.is_none() {
        warn!("ATELIER_TOKEN absent: mode dev, HTTP/WS acceptés sans token");
    }
    let app_version = std::env::var("ATELIER_APP_VERSION").unwrap_or_else(|_| "dev".into());
    let bundle_hash = std::env::var("ATELIER_BUNDLE_HASH").unwrap_or_else(|_| "dev".into());
    let write_lock = std::env::var("ATELIER_WRITE_LOCK")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let app_dir = std::env::var("ATELIER_APP_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| AppPaths::default_mac().app_dir);
    let server_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.display().to_string()))
        .unwrap_or_else(|| ".".into());

    ServerConfig {
        paths: AppPaths::from_app_dir(app_dir),
        token,
        app_version,
        bundle_hash,
        server_dir,
        write_lock,
        skip_single_instance: std::env::var("ATELIER_SKIP_SINGLE_INSTANCE").is_ok(),
        bind: SocketAddr::from(([127, 0, 0, 1], 0)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode as Sc};
    use http_body_util::BodyExt;
    use tempfile::tempdir;
    use tower::ServiceExt;

    async fn test_state(token: Option<&str>) -> (AppState, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let paths = AppPaths::from_app_dir(dir.path().to_path_buf());
        let state = AppState::new(
            paths,
            token.map(str::to_string),
            "2026-01-01T00:00:00.000Z".into(),
            "0.1.0".into(),
            "testhash".into(),
            "/tmp/server".into(),
        );
        state.set_port(9).await;
        (state, dir)
    }

    #[tokio::test]
    async fn health_requires_token_when_set() {
        let (state, _dir) = test_state(Some("secret")).await;
        let app = app_router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), Sc::UNAUTHORIZED);

        let (state, _dir) = test_state(Some("secret")).await;
        let app = app_router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .header("x-atelier-token", "secret")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), Sc::OK);
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(v["service"], "atelier-sidecar");
        assert_eq!(v["tokenRequired"], true);
        assert_eq!(v["bundleHash"], "testhash");
    }

    #[tokio::test]
    async fn providers_is_array() {
        let (state, _dir) = test_state(None).await;
        let app = app_router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/providers")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), Sc::OK);
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert!(v.is_array());
        assert_eq!(v[0]["id"], "claude");
        assert!(v[0]["capabilities"]["resume"].as_bool().unwrap());
        assert_eq!(
            v[0]["ok"].as_bool(),
            state.provider("claude").map(|_| true).or(Some(false)),
        );
    }

    #[tokio::test]
    async fn uistate_roundtrip() {
        let (state, _dir) = test_state(None).await;
        let app = app_router(state.clone());
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/uistate")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"projects":[]}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), Sc::OK);

        let app = app_router(state);
        let res = app
            .oneshot(
                Request::builder()
                    .uri("/uistate")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(&bytes[..], br#"{"projects":[]}"#);
    }

    #[tokio::test]
    async fn gallery_command_requires_token_and_is_broadcast() {
        let (state, _dir) = test_state(Some("secret")).await;
        let mut bus = state.subscribe_bus();
        let app = app_router(state);
        let body = r#"{"action":"show","mode":"focus","projectRoot":"/p","requestId":"req-1","rels":["figures/a.png"]}"#;
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/gallery-command")
                    .header("content-type", "application/json")
                    .header("x-atelier-token", "secret")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), Sc::ACCEPTED);
        let pushed: serde_json::Value = serde_json::from_str(&bus.recv().await.unwrap()).unwrap();
        assert_eq!(pushed["type"], "galleryCommand");
        assert_eq!(pushed["command"]["rels"][0], "figures/a.png");
    }

    #[test]
    fn gallery_command_validates_each_action_shape() {
        let make = |action: &str, mode: &str, rels: &[&str]| GalleryCommand {
            action: action.into(),
            mode: mode.into(),
            project_root: "/p".into(),
            request_id: format!("req-{action}"),
            rels: rels.iter().map(|rel| (*rel).into()).collect(),
        };
        assert!(make("show", "focus", &["a.png"]).valid());
        assert!(make("open", "viewer", &["a.png"]).valid());
        assert!(make("compare", "selection", &["a.png", "b.png"]).valid());
        assert!(make("reset", "all", &[]).valid());
        assert!(!make("open", "viewer", &["a.png", "b.png"]).valid());
        assert!(!make("compare", "focus", &["a.png", "b.png"]).valid());
        assert!(!make("reset", "all", &["a.png"]).valid());
    }

    #[test]
    fn route_ws_ping_pong() {
        let out = route_ws_text(r#"{"type":"ping"}"#);
        assert_eq!(out, r#"{"type":"pong"}"#);
    }

    #[test]
    fn route_ws_unknown() {
        let out = route_ws_text(r#"{"type":"nope"}"#);
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["type"], "error");
        assert!(v["message"].as_str().unwrap().contains("nope"));
    }

    #[test]
    fn route_ws_invalid_json() {
        let out = route_ws_text("not-json");
        let v: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["message"], "JSON invalide");
    }

    #[test]
    fn iso_formatter_plausible() {
        let s = chrono_iso_now_fixed();
        assert!(s.ends_with('Z'));
        assert_eq!(s.len(), 24); // YYYY-MM-DDTHH:MM:SS.mmmZ
    }
}
