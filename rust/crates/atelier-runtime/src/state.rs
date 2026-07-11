//! Shared application state for the HTTP/WS runtime.

use crate::paths::AppPaths;
use atelier_protocol::Health;
use atelier_harness::HarnessManager;
use atelier_providers::{build_registry, Provider};
use atelier_store::{HarnessJournal, HighlightStore, ThreadStore};
use atelier_workspace::TerminalHub;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};

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
    threads: Mutex<ThreadStore>,
    highlights: Mutex<HighlightStore>,
    journal: HarnessJournal,
    /// Fan-out for multi-client WS (threads/highlights broadcasts).
    bus: broadcast::Sender<String>,
    terminals: Arc<TerminalHub>,
    harness: Arc<HarnessManager>,
    providers: HashMap<String, Arc<dyn Provider>>,
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
        let threads = ThreadStore::open(paths.app_dir.join("threads.json"));
        let highlights = HighlightStore::open(paths.app_dir.join("highlights.json"));
        let journal = HarnessJournal::new(&paths.app_dir);
        let (bus, _) = broadcast::channel(128);
        let terminals = Arc::new(TerminalHub::new());
        let harness = Arc::new(HarnessManager::new(journal.clone()));
        let providers = build_registry(&paths.app_dir);
        // Purge ghost "running" status from previous process (Node index.mjs boot).
        let mut threads = threads;
        for t in threads.list() {
            if t.status == "running" {
                let _ = threads.upsert(
                    serde_json::json!({"id": t.id, "status": "idle"}),
                    true,
                );
            }
        }
        Self {
            inner: Arc::new(Inner {
                paths,
                token,
                started_at,
                app_version,
                bundle_hash,
                server_dir,
                port: RwLock::new(None),
                threads: Mutex::new(threads),
                highlights: Mutex::new(highlights),
                journal,
                bus,
                terminals,
                harness,
                providers,
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

    pub fn threads(&self) -> &Mutex<ThreadStore> {
        &self.inner.threads
    }

    pub fn highlights(&self) -> &Mutex<HighlightStore> {
        &self.inner.highlights
    }

    pub fn journal(&self) -> &HarnessJournal {
        &self.inner.journal
    }

    pub fn subscribe_bus(&self) -> broadcast::Receiver<String> {
        self.inner.bus.subscribe()
    }

    pub fn publish(&self, msg: String) {
        let _ = self.inner.bus.send(msg);
    }

    pub fn settings_path(&self) -> std::path::PathBuf {
        self.inner.paths.app_dir.join("settings.json")
    }

    pub fn ledger_dir(&self) -> std::path::PathBuf {
        self.inner.paths.app_dir.join("ledger")
    }

    pub fn terminals(&self) -> &TerminalHub {
        &self.inner.terminals
    }

    pub fn app_dir(&self) -> &std::path::Path {
        &self.inner.paths.app_dir
    }

    pub fn harness(&self) -> &HarnessManager {
        &self.inner.harness
    }

    pub fn provider(&self, id: &str) -> Option<Arc<dyn Provider>> {
        self.inner.providers.get(id).cloned()
    }
}
