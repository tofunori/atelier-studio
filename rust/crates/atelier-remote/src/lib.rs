//! Atelier remote gateway — plan 034 jalon C.
//!
//! Separate process from the desktop loopback sidecar. Authenticates **per device**,
//! enforces scopes, path policy, and never exposes terminal/git/shell routes.

pub mod auth;
pub mod error;
pub mod hostcheck;
pub mod path_policy;
pub mod rate_limit;
pub mod routes;
pub mod scopes;
pub mod state;

pub use state::{GatewayConfig, GatewayState};

use axum::http::{header, HeaderValue, Method};
use axum::Router;
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

pub struct GatewayHandle {
    pub port: u16,
    pub addr: SocketAddr,
    pub state: GatewayState,
    /// Admin token plaintext (only available if generated this process).
    pub admin_token: Option<String>,
    shutdown: Option<oneshot::Sender<()>>,
    join: Option<tokio::task::JoinHandle<()>>,
    mobile_shutdown: Option<oneshot::Sender<()>>,
    mobile_join: Option<tokio::task::JoinHandle<()>>,
}

impl GatewayHandle {
    pub async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
        if let Some(join) = self.join.take() {
            let _ = join.await;
        }
        if let Some(tx) = self.mobile_shutdown.take() {
            let _ = tx.send(());
        }
        if let Some(join) = self.mobile_join.take() {
            let _ = join.await;
        }
    }

    pub fn base_url(&self) -> String {
        format!("http://{}:{}", self.addr.ip(), self.port)
    }
}

pub fn app_router(state: GatewayState, allowed_hosts: Vec<String>) -> Router {
    let cors_hosts = allowed_hosts.clone();
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin
                .to_str()
                .ok()
                .is_some_and(|value| hostcheck::origin_allowed(value, &cors_hosts))
        }))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            header::RANGE,
            header::HeaderName::from_static("x-atelier-device-token"),
        ])
        .expose_headers([
            header::CONTENT_TYPE,
            header::CONTENT_LENGTH,
            header::CONTENT_RANGE,
            header::ACCEPT_RANGES,
            header::ETAG,
        ])
        .max_age(Duration::from_secs(600));

    routes::router(state).layer(cors)
}

/// Bind and serve. Does **not** bind 0.0.0.0 unless config allows.
pub async fn serve(
    config: GatewayConfig,
) -> Result<GatewayHandle, Box<dyn std::error::Error + Send + Sync>> {
    validate_bind(&config)?;
    let state = GatewayState::open(config.clone())?;
    let admin_token = {
        let g = state.inner.lock().await;
        g.auth.admin_token_plain().map(|s| s.to_string())
    };

    let mut app = app_router(state.clone(), config.allowed_hosts.clone());
    if let Some(dir) = config.mobile_dir.as_ref() {
        let index = dir.join("index.html");
        if !index.is_file() {
            return Err(format!("interface mobile introuvable: {}", index.display()).into());
        }
        app = app.fallback_service(ServeDir::new(dir).fallback(ServeFile::new(index)));
    }
    let app = app.into_make_service_with_connect_info::<SocketAddr>();

    let listener = TcpListener::bind(config.bind).await?;
    let addr = listener.local_addr()?;
    let port = addr.port();
    info!(%addr, "atelier-remote-gateway listening");

    let (tx, rx) = oneshot::channel::<()>();
    let join = tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await
            .ok();
    });

    let (mobile_shutdown, mobile_join) =
        if let (Some(dir), Some(bind)) = (config.mobile_dir.as_ref(), config.mobile_bind) {
            let index = dir.join("index.html");
            if !index.is_file() {
                return Err(format!("interface mobile introuvable: {}", index.display()).into());
            }
            let mobile_listener = TcpListener::bind(bind).await?;
            let mobile_app =
                Router::new().fallback_service(ServeDir::new(dir).fallback(ServeFile::new(index)));
            let (mobile_tx, mobile_rx) = oneshot::channel::<()>();
            let mobile_task = tokio::spawn(async move {
                axum::serve(mobile_listener, mobile_app)
                    .with_graceful_shutdown(async {
                        let _ = mobile_rx.await;
                    })
                    .await
                    .ok();
            });
            (Some(mobile_tx), Some(mobile_task))
        } else {
            (None, None)
        };

    Ok(GatewayHandle {
        port,
        addr,
        state,
        admin_token,
        shutdown: Some(tx),
        join: Some(join),
        mobile_shutdown,
        mobile_join,
    })
}

fn validate_bind(config: &GatewayConfig) -> Result<(), String> {
    if config.bind.ip().is_unspecified() && config.require_explicit_any_bind {
        let allow = std::env::var("ATELIER_REMOTE_ALLOW_ANY_BIND")
            .ok()
            .as_deref()
            == Some("1");
        if !allow {
            return Err(
                "refus de bind 0.0.0.0 — utiliser une IP Tailscale ou 127.0.0.1 (tests); \
                 ATELIER_REMOTE_ALLOW_ANY_BIND=1 pour forcer (déconseillé)"
                    .into(),
            );
        }
    }
    Ok(())
}

pub fn config_from_env() -> GatewayConfig {
    let mut c = GatewayConfig::default();
    if let Ok(dir) = std::env::var("ATELIER_REMOTE_DIR") {
        c.data_dir = dir.into();
    }
    if let Ok(dir) = std::env::var("ATELIER_APP_DIR") {
        c.atelier_dir = dir.into();
        if std::env::var("ATELIER_REMOTE_DIR").is_err() {
            c.data_dir = c.atelier_dir.join("remote");
        }
    }
    if let Ok(bind) = std::env::var("ATELIER_REMOTE_BIND") {
        if let Ok(addr) = bind.parse() {
            c.bind = addr;
        }
    }
    if let Ok(hosts) = std::env::var("ATELIER_REMOTE_ALLOWED_HOSTS") {
        c.allowed_hosts = hosts
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
    }
    if let Ok(base) = std::env::var("ATELIER_SIDECAR_BASE") {
        c.sidecar_base = Some(base);
    }
    if let Ok(tok) = std::env::var("ATELIER_TOKEN") {
        c.sidecar_token = Some(tok);
    }
    if let Ok(dir) = std::env::var("ATELIER_MOBILE_DIR") {
        c.mobile_dir = Some(dir.into());
    }
    if let Ok(bind) = std::env::var("ATELIER_MOBILE_BIND") {
        c.mobile_bind = bind.parse().ok();
    }
    c
}
