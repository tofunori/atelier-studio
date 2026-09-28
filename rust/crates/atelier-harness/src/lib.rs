//! Universal turn harness (Node `harness_events.mjs` parity).
//!
//! One harness per thread: monotone `sequence` allocated by the shared
//! `Journal::next_sequence` (coordinated with the other runtime writers —
//! fix 2026-08-28), exactly one terminal per turn, durable events journaled
//! before UI sees them.

mod kinds;
mod thread;

pub use kinds::{is_durable, is_ephemeral, DURABLE_KINDS};
pub use thread::{HarnessThread, TurnStatus};

use atelier_store::HarnessJournal;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Weak};
use tokio::sync::Mutex;

/// Callback for emitting decorated events to the UI (WS).
pub type EmitFn = Arc<dyn Fn(Value) + Send + Sync>;

/// Manages per-thread harnesses and active runs.
pub struct HarnessManager {
    threads: Mutex<HashMap<String, Weak<Mutex<HarnessThread>>>>,
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
        map.retain(|_, harness| harness.strong_count() > 0);
        if let Some(h) = map.get(thread_id).and_then(Weak::upgrade) {
            h.lock().await.set_provider(provider);
            return h;
        }
        // `initial_sequence` a disparu : `HarnessThread::decorate()` route
        // désormais l'allocation par `Journal::next_sequence`, qui fait
        // elle-même sa propre initialisation paresseuse depuis le fichier
        // (fix septième écrivain, revue finale 2026-08-28).
        let h = Arc::new(Mutex::new(HarnessThread::new(
            thread_id,
            provider,
            emit,
            self.journal.clone(),
        )));
        map.insert(thread_id.to_string(), Arc::downgrade(&h));
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

    /// Nombre de fils dont un tour tourne (tenir le Mac éveillé, etc.).
    pub async fn running_count(&self) -> usize {
        self.runs
            .lock()
            .await
            .values()
            .filter(|r| r.status == "running")
            .count()
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

    /// Comme `clear_running`, mais seulement si le run en cours est encore
    /// `turn_id` : la fin tardive d'un ancien tour ne doit pas effacer l'état
    /// d'un tour plus récent du même fil.
    pub async fn clear_running_turn(&self, thread_id: &str, turn_id: &str) {
        let mut runs = self.runs.lock().await;
        if runs.get(thread_id).is_some_and(|r| r.turn_id == turn_id) {
            runs.remove(thread_id);
            self.cancel.lock().await.remove(thread_id);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn idle_harness_is_released_but_live_callbacks_share_the_same_instance() {
        let dir = tempfile::tempdir().unwrap();
        let manager = HarnessManager::new(HarnessJournal::new(dir.path()));
        let emit: EmitFn = Arc::new(|_| {});
        let h = manager.harness_for("fil", "fake", emit.clone()).await;
        let late = h.clone();
        drop(h);
        let resumed = manager.harness_for("fil", "fake", emit.clone()).await;
        assert!(Arc::ptr_eq(&late, &resumed));
        let weak = Arc::downgrade(&late);
        drop(late);
        drop(resumed);
        assert!(weak.upgrade().is_none());
        let _new = manager.harness_for("new", "fake", emit).await;
        assert_eq!(manager.threads.lock().await.len(), 1);
    }

    #[tokio::test]
    async fn la_fin_d_un_ancien_tour_n_efface_pas_le_tour_suivant() {
        let dir = tempfile::tempdir().unwrap();
        let manager = HarnessManager::new(HarnessJournal::new(dir.path()));
        manager.set_running("fil", "tour-2", "claude").await;
        manager.clear_running_turn("fil", "tour-1").await;
        assert!(manager.is_running("fil").await);
        manager.clear_running_turn("fil", "tour-2").await;
        assert!(!manager.is_running("fil").await);
    }

    #[tokio::test]
    async fn running_count_suit_les_tours_en_cours() {
        let dir = tempfile::tempdir().unwrap();
        let manager = HarnessManager::new(HarnessJournal::new(dir.path()));
        assert_eq!(manager.running_count().await, 0);
        manager.set_running("a", "t1", "claude").await;
        manager.set_running("b", "t2", "codex").await;
        manager.set_running("a", "t3", "claude").await;
        assert_eq!(manager.running_count().await, 2);
        manager.clear_running("a").await;
        assert_eq!(manager.running_count().await, 1);
        manager.clear_running_turn("b", "t2").await;
        assert_eq!(manager.running_count().await, 0);
    }
}
