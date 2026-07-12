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
    /// Optional bundled companion web app, served on the Tailscale address.
    pub mobile_dir: Option<PathBuf>,
    pub mobile_bind: Option<std::net::SocketAddr>,
    /// When true, refuse binding 0.0.0.0 unless ATELIER_REMOTE_ALLOW_ANY_BIND=1.
    pub require_explicit_any_bind: bool,
    /// Max JSON body bytes.
    pub max_body_bytes: usize,
    /// Min retained sequence for history window (snapshot if afterSequence below).
    pub min_retained_sequence: u64,
}

impl Default for GatewayConfig {
    fn default() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
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
            mobile_dir: None,
            mobile_bind: None,
            require_explicit_any_bind: true,
            max_body_bytes: 256 * 1024,
            min_retained_sequence: 0,
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
    pub idempotency: IdempotencyCache,
    /// In-memory fixture threads for tests (thread_id -> events).
    pub fixture_history: HashMap<String, Vec<Value>>,
    pub started_at: String,
}

#[derive(Clone)]
pub struct GatewayState {
    pub inner: Arc<Mutex<GatewayInner>>,
}

impl GatewayState {
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
            inner: Arc::new(Mutex::new(GatewayInner {
                config,
                auth,
                projects,
                threads,
                journal,
                pairing_limiter: RateLimiter::pairing_default(),
                api_limiter: RateLimiter::api_default(),
                idempotency: IdempotencyCache::default(),
                fixture_history: HashMap::new(),
                started_at: atelier_store::iso_now(),
            })),
        })
    }
}
