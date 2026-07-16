//! Universal turn harness (Node `harness_events.mjs` parity).
//!
//! One harness per thread: monotone `sequence`, exactly one terminal per turn,
//! durable events journaled before UI sees them (when a journal is attached).

mod kinds;
mod thread;

pub use kinds::{is_durable, is_ephemeral, DURABLE_KINDS};
pub use thread::{HarnessThread, TurnStatus};

use atelier_store::HarnessJournal;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Callback for emitting decorated events to the UI (WS).
pub type EmitFn = Arc<dyn Fn(Value) + Send + Sync>;

/// Manages per-thread harnesses and active runs.
pub struct HarnessManager {
    threads: Mutex<HashMap<String, Arc<Mutex<HarnessThread>>>>,
    runs: Mutex<HashMap<String, RunState>>,
    journal: HarnessJournal,
    /// Cancel flags per threadId.
    cancel: Mutex<HashMap<String, bool>>,
}

#[derive(Debug, Clone)]
pub struct RunState {
    pub turn_id: String,
    pub provider: String,
    pub status: String, // "running" | "done"
}

impl HarnessManager {
    pub fn new(journal: HarnessJournal) -> Self {
        Self {
            threads: Mutex::new(HashMap::new()),
            runs: Mutex::new(HashMap::new()),
            journal,
            cancel: Mutex::new(HashMap::new()),
        }
    }

    pub fn journal(&self) -> &HarnessJournal {
        &self.journal
    }

    pub async fn harness_for(
        &self,
        thread_id: &str,
        provider: &str,
        emit: EmitFn,
    ) -> Arc<Mutex<HarnessThread>> {
        let mut map = self.threads.lock().await;
        if let Some(h) = map.get(thread_id) {
            h.lock().await.set_provider(provider);
            return Arc::clone(h);
        }
        let initial = self.journal.last_sequence(thread_id);
        let h = Arc::new(Mutex::new(HarnessThread::new(
            thread_id,
            provider,
            emit,
            Some(self.journal.clone()),
            initial,
        )));
        map.insert(thread_id.to_string(), Arc::clone(&h));
        h
    }

    pub async fn is_running(&self, thread_id: &str) -> bool {
        self.runs
            .lock()
            .await
            .get(thread_id)
            .map(|r| r.status == "running")
            .unwrap_or(false)
    }

    pub async fn run_provider(&self, thread_id: &str) -> Option<String> {
        self.runs
            .lock()
            .await
            .get(thread_id)
            .map(|r| r.provider.clone())
    }

    pub async fn set_running(&self, thread_id: &str, turn_id: &str, provider: &str) {
        self.runs.lock().await.insert(
            thread_id.to_string(),
            RunState {
                turn_id: turn_id.to_string(),
                provider: provider.to_string(),
                status: "running".into(),
            },
        );
        self.cancel
            .lock()
            .await
            .insert(thread_id.to_string(), false);
    }

    pub async fn clear_running(&self, thread_id: &str) {
        if let Some(r) = self.runs.lock().await.get_mut(thread_id) {
            r.status = "done".into();
        }
        self.runs.lock().await.remove(thread_id);
    }

    pub async fn request_cancel(&self, thread_id: &str) {
        self.cancel.lock().await.insert(thread_id.to_string(), true);
    }

    pub async fn is_cancelled(&self, thread_id: &str) -> bool {
        self.cancel
            .lock()
            .await
            .get(thread_id)
            .copied()
            .unwrap_or(false)
    }
}
