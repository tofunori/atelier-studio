//! Shared application state for the HTTP/WS runtime.

use crate::paths::AppPaths;
use atelier_protocol::Health;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

struct Inner {
    paths: AppPaths,
    token: Option<String>,
    started_at: String,
    app_version: String,
    bundle_hash: String,
    server_dir: String,
    port: RwLock<Option<u16>>,
}

impl AppState {
    pub fn new(
        paths: AppPaths,
        token: Option<String>,
        started_at: String,
        app_version: String,
        bundle_hash: String,
        server_dir: String,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                paths,
                token,
                started_at,
                app_version,
                bundle_hash,
                server_dir,
                port: RwLock::new(None),
            }),
        }
    }

    pub fn paths(&self) -> &AppPaths {
        &self.inner.paths
    }

    pub fn token(&self) -> Option<&str> {
        self.inner.token.as_deref()
    }

    pub fn token_required(&self) -> bool {
        self.inner.token.is_some()
    }

    pub fn authorized(&self, header: Option<&str>) -> bool {
        match &self.inner.token {
            None => true,
            Some(t) => header == Some(t.as_str()),
        }
    }

    pub fn authorized_ws_token(&self, query_token: Option<&str>) -> bool {
        match &self.inner.token {
            None => true,
            Some(t) => query_token == Some(t.as_str()),
        }
    }

    pub async fn set_port(&self, port: u16) {
        *self.inner.port.write().await = Some(port);
    }

    pub async fn port(&self) -> Option<u16> {
        *self.inner.port.read().await
    }

    pub async fn health(&self) -> Health {
        Health::new(
            std::process::id(),
            self.port().await,
            self.inner.started_at.clone(),
            self.inner.app_version.clone(),
            self.inner.bundle_hash.clone(),
            self.token_required(),
        )
    }

    pub fn started_at(&self) -> &str {
        &self.inner.started_at
    }

    pub fn app_version(&self) -> &str {
        &self.inner.app_version
    }

    pub fn bundle_hash(&self) -> &str {
        &self.inner.bundle_hash
    }

    pub fn server_dir(&self) -> &str {
        &self.inner.server_dir
    }
}
