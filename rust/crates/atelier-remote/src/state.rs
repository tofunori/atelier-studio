//! Shared gateway state.

use crate::auth::{AuthStore, IdempotencyCache};
use crate::path_policy::ProjectRegistry;
use crate::rate_limit::RateLimiter;
use atelier_store::{HarnessJournal, ThreadStore};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct GatewayConfig {
    /// Directory for remote state (devices.json).
    pub data_dir: PathBuf,
    /// Atelier Application Support dir (threads, harness-history).
    pub atelier_dir: PathBuf,
    /// Bind address — prefer Tailscale IP or 127.0.0.1 for tests.
    pub bind: std::net::SocketAddr,
    /// Allowed Host headers (empty = only reject empty/suspicious).
    pub allowed_hosts: Vec<String>,
    /// Optional loopback sidecar base URL for proxy (e.g. http://127.0.0.1:18790).
    pub sidecar_base: Option<String>,
    pub sidecar_token: Option<String>,
    /// When true, refuse binding 0.0.0.0 unless ATELIER_REMOTE_ALLOW_ANY_BIND=1.
    pub require_explicit_any_bind: bool,
    /// Max JSON body bytes.
    pub max_body_bytes: usize,
    /// Min retained sequence for history window (snapshot if afterSequence below).
    pub min_retained_sequence: u64,
    /// Native Codex image artifacts. The route only accepts paths resolved
    /// below this configured directory; clients never provide this value.
    pub generated_images_dir: PathBuf,
}

impl Default for GatewayConfig {
    fn default() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        let codex_home = std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(&home).join(".codex"));
        let atelier = PathBuf::from(format!("{home}/Library/Application Support/atelier-studio"));
        Self {
            data_dir: atelier.join("remote"),
            atelier_dir: atelier,
            bind: std::net::SocketAddr::from(([127, 0, 0, 1], 18765)),
            allowed_hosts: vec![
                "127.0.0.1".into(),
                "localhost".into(),
                "127.0.0.1:18765".into(),
                "localhost:18765".into(),
            ],
            sidecar_base: None,
            sidecar_token: None,
            require_explicit_any_bind: true,
            max_body_bytes: 256 * 1024,
            min_retained_sequence: 0,
            generated_images_dir: codex_home.join("generated_images"),
        }
    }
}

pub struct GatewayInner {
    pub config: GatewayConfig,
    pub auth: AuthStore,
    pub projects: ProjectRegistry,
    pub threads: ThreadStore,
    pub journal: HarnessJournal,
    pub pairing_limiter: RateLimiter,
    pub api_limiter: RateLimiter,
    /// Per-device budget of `/remote/v1/thumb`, separate from `api_limiter`.
    pub thumb_limiter: RateLimiter,
    pub idempotency: IdempotencyCache,
    /// In-memory fixture threads for tests (thread_id -> events).
    pub fixture_history: HashMap<String, Vec<Value>>,
    pub started_at: String,
    pub gallery_snapshots: HashMap<String, (String, std::time::Instant, Arc<Vec<Value>>)>,
}

#[derive(Clone)]
pub struct GatewayState {
    pub inner: Arc<Mutex<GatewayInner>>,
    pub(crate) catalog_flight: Arc<Mutex<()>>,
    catalog_revision: Arc<Mutex<Option<String>>>,
    pub(crate) live_channels: Arc<Mutex<HashMap<String, std::sync::Weak<tokio::sync::broadcast::Sender<Option<axum::body::Bytes>>>>>>,
    pub(crate) live_flights: Arc<Mutex<HashMap<String, std::sync::Weak<Mutex<()>>>>>,
    pub(crate) scans: Arc<tokio::sync::Semaphore>,
    pub(crate) read_calls: Arc<tokio::sync::Semaphore>,
    pub(crate) live_calls: Arc<tokio::sync::Semaphore>,
    pub(crate) file_calls: Arc<tokio::sync::Semaphore>,
    /// Concurrent `sips`/`qlmanage` thumbnail renders.
    pub(crate) thumb_jobs: Arc<tokio::sync::Semaphore>,
    pub(crate) gallery_flights: Arc<Mutex<HashMap<String, std::sync::Weak<Mutex<()>>>>>,
}


impl GatewayState {
    pub(crate) async fn refresh_catalog(&self) -> Result<(), crate::error::ApiError> {
        let _flight = self.catalog_flight.lock().await;
        let path = self.inner.lock().await.config.atelier_dir.join("threads.json");
        let cached = self.catalog_revision.lock().await.clone();
        let changed = tokio::task::spawn_blocking(move || {
            let before = ThreadStore::storage_revision(&path).ok();
            if before.is_some() && before==cached { return None; }
            let threads = ThreadStore::open(&path);
            let roots = threads.snapshot().iter().filter_map(|thread| {
                let root = PathBuf::from(&thread.project_root);
                (!thread.project_root.is_empty() && root.is_dir()).then_some(root)
            }).collect::<Vec<_>>();
            let after = ThreadStore::storage_revision(&path).ok();
            let revision = before.filter(|revision| Some(revision)==after.as_ref());
            Some((threads,roots,revision))
        }).await.map_err(|_| crate::error::ApiError::not_found("catalogue indisponible"))?;
        if let Some((threads,roots,revision)) = changed {
            let mut g = self.inner.lock().await;
            g.threads = threads;
            for root in roots {
                if g.projects.get(&crate::path_policy::project_id_for(&root)).is_none() { g.projects.register_project(root,None); }
            }
            *self.catalog_revision.lock().await = revision;
        }
        Ok(())
    }

    pub fn open(config: GatewayConfig) -> Result<Self, String> {
        std::fs::create_dir_all(&config.data_dir).map_err(|e| e.to_string())?;
        let auth =
            AuthStore::open(config.data_dir.join("devices.json")).map_err(|e| e.to_string())?;
        let threads = ThreadStore::open(config.atelier_dir.join("threads.json"));
        let journal = HarnessJournal::new(&config.atelier_dir);
        let mut projects = ProjectRegistry::new();

        // Register project roots from threads
        for t in threads.list() {
            if !t.project_root.is_empty() {
                let p = PathBuf::from(&t.project_root);
                if p.is_dir() {
                    projects.register_project(&p, None);
                }
            }
        }

        // Optional projects file: [{ "path": "...", "name": "..." }]
        let proj_file = config.data_dir.join("projects.json");
        if let Ok(text) = std::fs::read_to_string(&proj_file) {
            if let Ok(arr) = serde_json::from_str::<Vec<Value>>(&text) {
                for item in arr {
                    if let Some(path) = item.get("path").and_then(|v| v.as_str()) {
                        let name = item
                            .get("name")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let p = PathBuf::from(path);
                        if p.is_dir() {
                            projects.register_project(&p, name);
                        }
                    }
                }
            }
        }

        Ok(Self {
            catalog_flight:Arc::new(Mutex::new(())),
            catalog_revision:Arc::new(Mutex::new(None)),
            live_channels:Arc::new(Mutex::new(HashMap::new())),
            live_flights:Arc::new(Mutex::new(HashMap::new())),
            scans:Arc::new(tokio::sync::Semaphore::new(2)),
            read_calls:Arc::new(tokio::sync::Semaphore::new(16)),
            live_calls:Arc::new(tokio::sync::Semaphore::new(8)),
            file_calls:Arc::new(tokio::sync::Semaphore::new(16)),
            thumb_jobs:Arc::new(tokio::sync::Semaphore::new(2)),
            gallery_flights:Arc::new(Mutex::new(HashMap::new())),
            inner: Arc::new(Mutex::new(GatewayInner {
                config,
                auth,
                projects,
                threads,
                journal,
                pairing_limiter: RateLimiter::pairing_default(),
                api_limiter: RateLimiter::api_default(),
                thumb_limiter: RateLimiter::thumb_default(),
                idempotency: IdempotencyCache::default(),
                fixture_history: HashMap::new(),
                gallery_snapshots: HashMap::new(),
                started_at: atelier_store::iso_now(),
            })),
        })
    }
}
