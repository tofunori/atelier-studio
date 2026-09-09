//! Durable command receipts for chat sends.
//!
//! A receipt is deliberately stored before a provider is invoked.  A process
//! restart turns an in-flight receipt into `uncertain`; the runtime can then
//! report that state to the client without guessing whether the external
//! provider observed the request.

use crate::{iso_now, write_file_atomic_durable};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

#[cfg(not(test))]
// 30 days × 512 sends/day leaves headroom for active/uncertain receipts while
// keeping the bounded JSON store below the scale where a retention sweep is
// accidental data loss. A full store is still refused until terminal entries
// are safely older than the retention window.
const MAX_RECEIPTS: usize = 16_384;
#[cfg(test)]
const MAX_RECEIPTS: usize = 32;
const TERMINAL_RETENTION_SECS: u64 = 30 * 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommandReceipt {
    pub client_message_id: String,
    pub fingerprint: String,
    pub thread_id: String,
    pub provider: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issue: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReceiptReservation {
    New(CommandReceipt),
    Existing(CommandReceipt),
    Collision(CommandReceipt),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReceiptError {
    Storage(String),
    Invalid(String),
}

impl std::fmt::Display for ReceiptError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Storage(message) | Self::Invalid(message) => f.write_str(message),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct ReceiptFile {
    schema_version: u32,
    #[serde(default)]
    receipts: BTreeMap<String, CommandReceipt>,
}

#[derive(Debug, Default)]
struct ReceiptState {
    receipts: BTreeMap<String, CommandReceipt>,
    load_error: Option<String>,
}

/// Thread-safe, path-backed receipt store.  Clones share the same lock and
/// therefore reserve an id exactly once across concurrent WS sockets.
#[derive(Debug, Clone)]
pub struct CommandReceiptStore {
    path: PathBuf,
    state: Arc<Mutex<ReceiptState>>,
}

impl CommandReceiptStore {
    pub fn open(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let mut state = ReceiptState::default();
        match std::fs::read_to_string(&path) {
            Ok(text) => match serde_json::from_str::<ReceiptFile>(&text) {
                Ok(file) => state.receipts = file.receipts,
                Err(error) => state.load_error = Some(format!("invalid receipt store: {error}")),
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => state.load_error = Some(format!("cannot read receipt store: {error}")),
        }
        let store = Self {
            path,
            state: Arc::new(Mutex::new(state)),
        };
        // A previous process may have died after admission and before the
        // provider result.  Persist the conservative conclusion immediately.
        store.recover_inflight();
        store
    }

    fn recover_inflight(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if guard.load_error.is_some() {
            return;
        }
        let now = iso_now();
        let mut changed = false;
        for receipt in guard.receipts.values_mut() {
            if matches!(receipt.status.as_str(), "received" | "started") {
                receipt.status = "uncertain".into();
                receipt.issue = Some(
                    "Le processus a redémarré pendant cette demande; l'effet fournisseur est incertain."
                        .into(),
                );
                receipt.updated_at = now.clone();
                changed = true;
            }
        }
        if changed {
            let _ = Self::persist_locked(&self.path, &guard.receipts)
                .map_err(|error| guard.load_error = Some(error));
        }
    }

    fn persist_locked(
        path: &Path,
        receipts: &BTreeMap<String, CommandReceipt>,
    ) -> Result<(), String> {
        let data = serde_json::to_vec_pretty(&ReceiptFile {
            schema_version: 1,
            receipts: receipts.clone(),
        })
        .map_err(|error| format!("serialize receipt store: {error}"))?;
        write_file_atomic_durable(path, data)
            .map_err(|error| format!("write receipt store: {error}"))
    }

    fn ensure_usable(guard: &ReceiptState) -> Result<(), ReceiptError> {
        guard
            .load_error
            .as_ref()
            .map_or(Ok(()), |error| Err(ReceiptError::Storage(error.clone())))
    }

    /// Reserve a client id before any provider operation.  The fingerprint is
    /// the idempotency boundary: reusing an id for another payload is a
    /// collision and is never silently treated as a retry.
    pub fn reserve(
        &self,
        client_message_id: &str,
        fingerprint: &str,
        thread_id: &str,
        provider: &str,
    ) -> Result<ReceiptReservation, ReceiptError> {
        if client_message_id.trim().is_empty() {
            return Err(ReceiptError::Invalid("clientMessageId requis".into()));
        }
        if thread_id.trim().is_empty() {
            return Err(ReceiptError::Invalid("threadId requis".into()));
        }
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Self::ensure_usable(&guard)?;
        let previous_receipts = guard.receipts.clone();
        if let Some(existing) = guard.receipts.get(client_message_id) {
            return Ok(if existing.fingerprint == fingerprint {
                ReceiptReservation::Existing(existing.clone())
            } else {
                ReceiptReservation::Collision(existing.clone())
            });
        }
        if guard.receipts.len() >= MAX_RECEIPTS {
            self.prune_locked(&mut guard);
        }
        if guard.receipts.len() >= MAX_RECEIPTS {
            return Err(ReceiptError::Storage(
                "receipt store capacity reached; retry after retention pruning".into(),
            ));
        }
        let now = iso_now();
        let receipt = CommandReceipt {
            client_message_id: client_message_id.into(),
            fingerprint: fingerprint.into(),
            thread_id: thread_id.into(),
            provider: provider.into(),
            status: "received".into(),
            created_at: now.clone(),
            updated_at: now,
            turn_id: None,
            terminal_event_id: None,
            issue: None,
        };
        guard
            .receipts
            .insert(client_message_id.into(), receipt.clone());
        if let Err(error) = Self::persist_locked(&self.path, &guard.receipts) {
            guard.receipts = previous_receipts;
            return Err(ReceiptError::Storage(error));
        }
        Ok(ReceiptReservation::New(receipt))
    }

    fn prune_locked(&self, guard: &mut ReceiptState) {
        // Retention is explicit and conservative: only terminal receipts
        // older than 30 days may leave the idempotency set.  Active and
        // uncertain receipts are never evicted.  A full store is refused
        // rather than risking a duplicate external effect.
        let cutoff = std::time::SystemTime::now()
            .checked_sub(std::time::Duration::from_secs(TERMINAL_RETENTION_SECS))
            .map(crate::iso_at);
        let Some(cutoff) = cutoff else { return };
        let expired: Vec<String> = guard
            .receipts
            .iter()
            .filter(|(_, receipt)| {
                matches!(
                    receipt.status.as_str(),
                    "completed" | "failed" | "cancelled"
                ) && receipt.updated_at < cutoff
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in expired {
            guard.receipts.remove(&id);
        }
    }

    pub fn get(&self, client_message_id: &str) -> Option<CommandReceipt> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .receipts
            .get(client_message_id)
            .cloned()
    }

    /// Update a receipt while preserving a conservative terminal state.  A
    /// late provider callback must never turn `cancelled` or `uncertain` into
    /// an apparently successful retry.
    pub fn update(
        &self,
        client_message_id: &str,
        status: &str,
        turn_id: Option<&str>,
        terminal_event_id: Option<&str>,
        issue: Option<&str>,
    ) -> Result<Option<CommandReceipt>, ReceiptError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Self::ensure_usable(&guard)?;
        let Some(previous) = guard.receipts.get(client_message_id).cloned() else {
            return Ok(None);
        };
        if matches!(previous.status.as_str(), "cancelled" | "uncertain")
            && matches!(status, "completed" | "failed" | "started" | "received")
        {
            return Ok(Some(previous));
        }
        let Some(_) = guard.receipts.get(client_message_id) else {
            return Ok(None);
        };
        let mut updated = previous.clone();
        updated.status = status.to_string();
        updated.updated_at = iso_now();
        if let Some(turn_id) = turn_id.filter(|value| !value.is_empty()) {
            updated.turn_id = Some(turn_id.into());
        }
        if let Some(event_id) = terminal_event_id.filter(|value| !value.is_empty()) {
            updated.terminal_event_id = Some(event_id.into());
        }
        updated.issue = issue.map(str::to_string);
        guard
            .receipts
            .insert(client_message_id.to_string(), updated.clone());
        if let Err(error) = Self::persist_locked(&self.path, &guard.receipts) {
            // The caller can still report the previous durable state; no
            // in-memory transition is safe to claim after a write failure.
            guard
                .receipts
                .insert(client_message_id.to_string(), previous.clone());
            return Err(ReceiptError::Storage(error));
        }
        Ok(Some(updated))
    }

    /// Stop wins over a retry that has not reached the provider yet.
    pub fn cancel_thread(&self, thread_id: &str) -> Result<Vec<CommandReceipt>, ReceiptError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Self::ensure_usable(&guard)?;
        let previous = guard.receipts.clone();
        let mut changed = false;
        let now = iso_now();
        let mut out = Vec::new();
        for receipt in guard.receipts.values_mut() {
            if receipt.thread_id == thread_id && matches!(receipt.status.as_str(), "received" | "started") {
                receipt.status = "cancelled".into();
                receipt.updated_at = now.clone();
                receipt.issue = Some("Arrêt demandé avant la confirmation du fournisseur.".into());
                out.push(receipt.clone());
                changed = true;
            }
        }
        if changed {
            if let Err(error) = Self::persist_locked(&self.path, &guard.receipts) {
                guard.receipts = previous;
                return Err(ReceiptError::Storage(error));
            }
        }
        Ok(out)
    }
}

/// Stable SHA-256 identity for the request fields that can affect provider
/// behaviour.  Volatile transport/display fields are excluded deliberately.
pub fn request_fingerprint(message: &Value) -> String {
    let mut selected = match message {
        Value::Object(object) => object
            .iter()
            .filter(|(key, _)| {
                !matches!(
                    key.as_str(),
                    "requestId" | "displayEvent" | "clientMessageId"
                )
            })
            .map(|(key, value)| (key.clone(), canonicalize(value)))
            .collect::<BTreeMap<_, _>>(),
        _ => BTreeMap::new(),
    };
    selected.insert("schemaVersion".into(), Value::from(1));
    let bytes = serde_json::to_vec(&selected).unwrap_or_default();
    let mut hash = Sha256::new();
    hash.update(bytes);
    hex::encode(hash.finalize())
}

fn canonicalize(value: &Value) -> Value {
    match value {
        Value::Object(object) => {
            let mut sorted = Map::new();
            for (key, value) in object {
                sorted.insert(key.clone(), canonicalize(value));
            }
            // serde_json::Map is insertion ordered in this workspace; sort
            // through BTreeMap before rebuilding it for deterministic bytes.
            let mut ordered = BTreeMap::new();
            for (key, value) in sorted {
                ordered.insert(key, value);
            }
            Value::Object(ordered.into_iter().collect())
        }
        Value::Array(values) => Value::Array(values.iter().map(canonicalize).collect()),
        _ => value.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn reserve_is_idempotent_and_detects_collision() {
        let dir = tempdir().unwrap();
        let store = CommandReceiptStore::open(dir.path().join("receipts.json"));
        let first = store.reserve("m1", "fp1", "t1", "fake").unwrap();
        assert!(matches!(first, ReceiptReservation::New(_)));
        let same = store.reserve("m1", "fp1", "t1", "fake").unwrap();
        assert!(matches!(same, ReceiptReservation::Existing(_)));
        let collision = store.reserve("m1", "fp2", "t1", "fake").unwrap();
        assert!(matches!(collision, ReceiptReservation::Collision(_)));
    }

    #[test]
    fn restart_marks_inflight_uncertain_and_keeps_terminal() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("receipts.json");
        let store = CommandReceiptStore::open(&path);
        store.reserve("m1", "fp1", "t1", "fake").unwrap();
        store.reserve("m2", "fp2", "t1", "fake").unwrap();
        store.update("m2", "completed", Some("turn"), None, None).unwrap();
        drop(store);
        let recovered = CommandReceiptStore::open(&path);
        assert_eq!(recovered.get("m1").unwrap().status, "uncertain");
        assert_eq!(recovered.get("m2").unwrap().status, "completed");
    }

    #[test]
    fn fingerprint_ignores_transport_and_display_identity() {
        let a = json!({"type":"send","prompt":"hi","clientMessageId":"a","requestId":"x","displayEvent":{"ts":1}});
        let b = json!({"type":"send","prompt":"hi","clientMessageId":"b","requestId":"y","displayEvent":{"ts":2}});
        assert_eq!(request_fingerprint(&a), request_fingerprint(&b));
    }

    #[test]
    fn capacity_refuses_when_protected_receipts_fill_the_store() {
        let dir = tempdir().unwrap();
        let store = CommandReceiptStore::open(dir.path().join("receipts.json"));
        for index in 0..MAX_RECEIPTS {
            let id = format!("active-{index}");
            store.reserve(&id, &id, "t1", "fake").unwrap();
        }
        let result = store.reserve("one-too-many", "fp", "t1", "fake");
        assert!(matches!(result, Err(ReceiptError::Storage(_))));
        assert!(store.get("active-0").is_some());
    }

    #[test]
    fn retention_prunes_expired_terminal_but_keeps_recent_terminal() {
        let dir = tempdir().unwrap();
        let store = CommandReceiptStore::open(dir.path().join("receipts.json"));
        for index in 0..MAX_RECEIPTS {
            let id = format!("terminal-{index}");
            store.reserve(&id, &id, "t1", "fake").unwrap();
            store.update(&id, "completed", Some("turn"), None, None).unwrap();
        }
        let expired = crate::iso_at(
            std::time::SystemTime::now()
                .checked_sub(std::time::Duration::from_secs(TERMINAL_RETENTION_SECS + 1))
                .unwrap(),
        );
        {
            let mut guard = store.state.lock().unwrap();
            for index in 0..(MAX_RECEIPTS - 1) {
                guard.receipts.get_mut(&format!("terminal-{index}")).unwrap().updated_at = expired.clone();
            }
        }
        store.reserve("after-retention", "fp", "t1", "fake").unwrap();
        assert!(store.get("terminal-0").is_none());
        assert!(store.get(&format!("terminal-{}", MAX_RECEIPTS - 1)).is_some());
        assert!(store.get("after-retention").is_some());
    }
}
