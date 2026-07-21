//! Shared application state for the HTTP/WS runtime.

use crate::agent_mcp::CapabilityRegistry;
use crate::paths::AppPaths;
use atelier_harness::HarnessManager;
use atelier_protocol::Health;
use atelier_providers::{build_registry, Provider};
use atelier_store::{
    AgentMailboxStore, AutomationStore, HarnessJournal, HighlightStore, ThreadStore,
};
use atelier_workspace::{TermEvent, TerminalHub};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, oneshot, Mutex, RwLock};

#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

#[derive(Debug, Clone)]
pub struct QaSession {
    pub provider: String,
    pub session_id: String,
}

pub struct InteractionWaiter {
    pub thread_id: String,
    pub client_instance_id: Option<String>,
    pub tx: oneshot::Sender<Value>,
}

pub struct AgentDelivery {
    pub payload: Value,
    pub accepted: oneshot::Sender<Result<(), String>>,
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
    automations: Mutex<AutomationStore>,
    automation_runs: Mutex<HashMap<String, (String, String)>>,
    journal: HarnessJournal,
    /// Fan-out for multi-client WS (threads/highlights broadcasts).
    bus: broadcast::Sender<String>,
    terminals: Arc<TerminalHub>,
    harness: Arc<HarnessManager>,
    providers: HashMap<String, Arc<dyn Provider>>,
    client_instance_id: Mutex<Option<String>>,
    interaction_waiters: Mutex<HashMap<String, InteractionWaiter>>,
    approval_sessions: Mutex<HashSet<String>>,
    /// Un seul tour potentiellement écrivant à la fois par projet. Les tours
    /// `plan` restent concurrents car ils sont forcés en lecture seule.
    project_writers: Mutex<HashMap<String, String>>,
    qa_sessions: Mutex<HashMap<String, QaSession>>,
    retitle_running: AtomicBool,
    /// Capability grants for atelier-agent-mcp (plan 057) — ephemeral, hashed.
    capabilities: Mutex<CapabilityRegistry>,
    /// Durable inter-agent mailbox (plan 057).
    mailbox: Mutex<AgentMailboxStore>,
    /// Pending agent-link deliveries. The worker must acknowledge handle_send
    /// acceptance before the durable mailbox can mark a message delivered.
    delivery_tx: tokio::sync::mpsc::UnboundedSender<AgentDelivery>,
    delivery_rx: Mutex<Option<tokio::sync::mpsc::UnboundedReceiver<AgentDelivery>>>,
    mailbox_drain_lock: Mutex<()>,
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
        let automations = AutomationStore::open(paths.app_dir.join("automations.json"));
        let journal = HarnessJournal::new(&paths.app_dir);
        let mailbox = AgentMailboxStore::open(paths.app_dir.join("agent-mailbox.json"));
        let (delivery_tx, delivery_rx) = tokio::sync::mpsc::unbounded_channel();
        let (bus, _) = broadcast::channel(128);
        let terminal_bus = bus.clone();
        let terminals = Arc::new(TerminalHub::with_event_sink(move |event| {
            let message = match event {
                TermEvent::Data { term_id, data } => serde_json::json!({
                    "type": "termData",
                    "termId": term_id,
                    "data": data,
                }),
                TermEvent::Exit { term_id, exit_code } => serde_json::json!({
                    "type": "termExit",
                    "termId": term_id,
                    "exitCode": exit_code,
                }),
            };
            let _ = terminal_bus.send(message.to_string());
        }));
        let harness = Arc::new(HarnessManager::new(journal.clone()));
        let providers = build_registry(&paths.app_dir);
        // Purge ghost "running" status from previous process (Node index.mjs boot).
        let mut threads = threads;
        for t in threads.list() {
            if t.status == "running" {
                let _ = threads.upsert(serde_json::json!({"id": t.id, "status": "idle"}), true);
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
                automations: Mutex::new(automations),
                automation_runs: Mutex::new(HashMap::new()),
                journal,
                bus,
                terminals,
                harness,
                providers,
                client_instance_id: Mutex::new(None),
                interaction_waiters: Mutex::new(HashMap::new()),
                approval_sessions: Mutex::new(HashSet::new()),
                project_writers: Mutex::new(HashMap::new()),
                qa_sessions: Mutex::new(HashMap::new()),
                retitle_running: AtomicBool::new(false),
                capabilities: Mutex::new(CapabilityRegistry::new()),
                mailbox: Mutex::new(mailbox),
                delivery_tx,
                delivery_rx: Mutex::new(Some(delivery_rx)),
                mailbox_drain_lock: Mutex::new(()),
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

    pub fn automations(&self) -> &Mutex<AutomationStore> {
        &self.inner.automations
    }

    pub fn automation_runs(&self) -> &Mutex<HashMap<String, (String, String)>> {
        &self.inner.automation_runs
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

    pub fn client_instance_id(&self) -> &Mutex<Option<String>> {
        &self.inner.client_instance_id
    }

    pub fn interaction_waiters(&self) -> &Mutex<HashMap<String, InteractionWaiter>> {
        &self.inner.interaction_waiters
    }

    pub fn approval_sessions(&self) -> &Mutex<HashSet<String>> {
        &self.inner.approval_sessions
    }

    pub async fn acquire_project_writer(
        &self,
        project_root: &str,
        thread_id: &str,
        writable: bool,
    ) -> Result<(), String> {
        let root = project_root.trim_end_matches('/');
        if !writable || root.is_empty() {
            return Ok(());
        }
        let mut writers = self.inner.project_writers.lock().await;
        if let Some(owner) = writers.get(root) {
            if owner != thread_id {
                return Err(format!(
                    "projet verrouillé par une autre tâche ({owner}) — attends sa fin ou arrête-la avant toute écriture"
                ));
            }
            return Ok(());
        }
        writers.insert(root.to_string(), thread_id.to_string());
        Ok(())
    }

    pub async fn release_project_writer(&self, project_root: &str, thread_id: &str) {
        let root = project_root.trim_end_matches('/');
        let mut writers = self.inner.project_writers.lock().await;
        if writers.get(root).is_some_and(|owner| owner == thread_id) {
            writers.remove(root);
        }
    }

    pub fn qa_sessions(&self) -> &Mutex<HashMap<String, QaSession>> {
        &self.inner.qa_sessions
    }

    pub fn try_begin_retitle(&self) -> bool {
        self.inner
            .retitle_running
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    }

    pub fn end_retitle(&self) {
        self.inner.retitle_running.store(false, Ordering::SeqCst);
    }

    pub fn capabilities(&self) -> &Mutex<CapabilityRegistry> {
        &self.inner.capabilities
    }

    pub fn mailbox(&self) -> &Mutex<AgentMailboxStore> {
        &self.inner.mailbox
    }

    pub async fn project_writers_snapshot(&self) -> HashMap<String, String> {
        self.inner.project_writers.lock().await.clone()
    }

    pub fn enqueue_agent_delivery(
        &self,
        payload: Value,
    ) -> Result<oneshot::Receiver<Result<(), String>>, String> {
        let (tx, rx) = oneshot::channel();
        self.inner
            .delivery_tx
            .send(AgentDelivery {
                payload,
                accepted: tx,
            })
            .map_err(|_| "agent_delivery_worker_unavailable".to_string())?;
        Ok(rx)
    }

    /// Take the delivery receiver once (server boot).
    pub async fn take_delivery_rx(
        &self,
    ) -> Option<tokio::sync::mpsc::UnboundedReceiver<AgentDelivery>> {
        self.inner.delivery_rx.lock().await.take()
    }

    pub fn mailbox_drain_lock(&self) -> &Mutex<()> {
        &self.inner.mailbox_drain_lock
    }
}

#[cfg(test)]
mod writer_tests {
    use super::*;
    use crate::paths::AppPaths;
    use tempfile::tempdir;

    fn test_state() -> AppState {
        let dir = tempdir().unwrap().keep();
        AppState::new(
            AppPaths::from_app_dir(dir),
            None,
            "t".into(),
            "0.1.0".into(),
            "hash".into(),
            "/tmp".into(),
        )
    }

    #[tokio::test]
    async fn one_writer_per_project_while_plan_readers_remain_allowed() {
        let state = test_state();
        state
            .acquire_project_writer("/repo", "writer-1", true)
            .await
            .unwrap();
        let error = state
            .acquire_project_writer("/repo/", "writer-2", true)
            .await
            .unwrap_err();
        assert!(error.contains("projet verrouillé"), "{error}");
        state
            .acquire_project_writer("/repo", "reader", false)
            .await
            .unwrap();
        state.release_project_writer("/repo", "writer-1").await;
        state
            .acquire_project_writer("/repo", "writer-2", true)
            .await
            .unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use tokio::time::{timeout, Duration, Instant};

    #[tokio::test]
    async fn terminal_output_is_published_without_a_followup_ws_message() {
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "test".into(),
            "/tmp".into(),
        );
        let mut bus = state.subscribe_bus();
        state
            .terminals()
            .open("term-live", Some(dir.path().to_str().unwrap()), 80, 24);
        state
            .terminals()
            .input("term-live", "printf '__ATELIER_TERM_LIVE__\\n'\r");

        let deadline = Instant::now() + Duration::from_secs(5);
        let mut output = String::new();
        while Instant::now() < deadline && !output.contains("__ATELIER_TERM_LIVE__") {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let Ok(Ok(message)) = timeout(remaining, bus.recv()).await else {
                break;
            };
            let value: serde_json::Value = serde_json::from_str(&message).unwrap();
            if value.get("type").and_then(|v| v.as_str()) == Some("termData") {
                output.push_str(value.get("data").and_then(|v| v.as_str()).unwrap_or(""));
            }
        }

        state.terminals().close("term-live");
        assert!(output.contains("__ATELIER_TERM_LIVE__"), "{output:?}");
    }
}
