//! Durable command receipts for chat sends.
//!
//! A receipt is deliberately stored before a provider is invoked.  A process
//! restart turns an in-flight receipt into `uncertain`; the runtime can then
//! report that state to the client without guessing whether the external
//! provider observed the request.

use crate::iso_now;
use crate::threads::{RecordChange, RecordJournal, auxiliary};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::Path;
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

#[derive(Debug)]
struct ReceiptState {
    storage: RecordJournal<CommandReceipt>,
    // Shared lifetime lock: recovery runs only when no other live instance is
    // using these receipts, including another process. Transaction writes use
    // the separate short exclusive journal lock.
    _owner: Option<std::fs::File>,
}

/// Clones share a mutex; independently opened instances additionally serialize
/// durable record transactions with an interprocess lock.
#[derive(Debug, Clone)]
pub struct CommandReceiptStore {
    state: Arc<Mutex<ReceiptState>>,
}

fn receipt_records(value: Value) -> std::io::Result<BTreeMap<String, CommandReceipt>> {
    let file: ReceiptFile = serde_json::from_value(value).map_err(std::io::Error::other)?;
    if file.schema_version > 1 {
        return Err(std::io::Error::other("unsupported receipt schema"));
    }
    Ok(file.receipts)
}
fn receipt_json(receipts: &BTreeMap<String, CommandReceipt>) -> std::io::Result<Vec<u8>> {
    #[derive(Serialize)]
    struct Snapshot<'a> {
        schema_version: u32,
        receipts: &'a BTreeMap<String, CommandReceipt>,
    }
    serde_json::to_vec_pretty(&Snapshot {
        schema_version: 1,
        receipts,
    })
    .map_err(std::io::Error::other)
}
fn storage_error(error: impl std::fmt::Display) -> ReceiptError {
    ReceiptError::Storage(error.to_string())
}

impl CommandReceiptStore {
    pub fn open(path: impl AsRef<Path>) -> Self {
        let path = path.as_ref().to_path_buf();
        let owner = (|| -> std::io::Result<_> {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let file = std::fs::OpenOptions::new()
                .create(true)
                .read(true)
                .write(true)
                .truncate(false)
                .open(auxiliary(&path, ".owners"))?;
            let recover = match fs2::FileExt::try_lock_exclusive(&file) {
                Ok(()) => true,
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    fs2::FileExt::lock_shared(&file)?;
                    false
                }
                Err(error) => return Err(error),
            };
            Ok((file, recover))
        })();
        let mut storage = RecordJournal::open(path, receipt_records, receipt_json);
        let (owner, recover) = match owner {
            Ok((file, recover)) => (Some(file), recover),
            Err(error) => {
                storage.load_error = Some(error.to_string());
                (None, false)
            }
        };
        let store = Self {
            state: Arc::new(Mutex::new(ReceiptState {
                storage,
                _owner: owner,
            })),
        };
        if recover {
            store.recover_inflight();
        }
        let mut guard = store.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(owner) = &guard._owner {
            if let Err(error) = fs2::FileExt::lock_shared(owner) {
                guard.storage.load_error = Some(error.to_string());
                guard._owner = None;
            }
        }
        drop(guard);
        store
    }
    fn recover_inflight(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let result = (|| -> std::io::Result<()> {
            let _lock = guard.storage.lock()?;
            guard.storage.refresh()?;
            let now = iso_now();
            let changes=guard.storage.records.values().filter(|receipt|matches!(receipt.status.as_str(),"received"|"started"))
                .map(|receipt| {
                    let mut value=receipt.clone();value.status="uncertain".into();value.updated_at=now.clone();
                    value.issue=Some("Le processus a redémarré pendant cette demande; l'effet fournisseur est incertain.".into());
                    RecordChange::Put{id:value.client_message_id.clone(),value}
                }).collect::<Vec<_>>();
            if !changes.is_empty() {
                guard.storage.append(changes, None)?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            guard.storage.load_error = Some(error.to_string());
        }
    }
    fn ensure_owner(guard: &ReceiptState) -> Result<(), ReceiptError> {
        if guard._owner.is_none() {
            return Err(ReceiptError::Storage(
                "receipt ownership lock unavailable".into(),
            ));
        }
        Ok(())
    }
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
        Self::ensure_owner(&guard)?;
        let _lock = guard.storage.lock().map_err(storage_error)?;
        guard.storage.refresh().map_err(storage_error)?;
        if let Some(existing) = guard.storage.records.get(client_message_id) {
            return Ok(if existing.fingerprint == fingerprint {
                ReceiptReservation::Existing(existing.clone())
            } else {
                ReceiptReservation::Collision(existing.clone())
            });
        }
        let mut changes = Vec::new();
        if guard.storage.records.len() >= MAX_RECEIPTS {
            let cutoff = std::time::SystemTime::now()
                .checked_sub(std::time::Duration::from_secs(TERMINAL_RETENTION_SECS))
                .map(crate::iso_at);
            if let Some(cutoff) = cutoff {
                changes = guard
                    .storage
                    .records
                    .iter()
                    .filter(|(_, receipt)| {
                        matches!(
                            receipt.status.as_str(),
                            "completed" | "failed" | "cancelled"
                        ) && receipt.updated_at < cutoff
                    })
                    .map(|(id, _)| RecordChange::Delete { id: id.clone() })
                    .collect();
            }
        }
        if guard.storage.records.len() - changes.len() >= MAX_RECEIPTS {
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
        changes.push(RecordChange::Put {
            id: client_message_id.into(),
            value: receipt.clone(),
        });
        guard.storage.append(changes, None).map_err(storage_error)?;
        Ok(ReceiptReservation::New(receipt))
    }
    pub fn get(&self, client_message_id: &str) -> Option<CommandReceipt> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(_lock) = guard.storage.lock() {
            let _ = guard.storage.refresh();
        }
        guard.storage.records.get(client_message_id).cloned()
    }
    pub fn update(
        &self,
        client_message_id: &str,
        status: &str,
        turn_id: Option<&str>,
        terminal_event_id: Option<&str>,
        issue: Option<&str>,
    ) -> Result<Option<CommandReceipt>, ReceiptError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Self::ensure_owner(&guard)?;
        let _lock = guard.storage.lock().map_err(storage_error)?;
        guard.storage.refresh().map_err(storage_error)?;
        let Some(previous) = guard.storage.records.get(client_message_id) else {
            return Ok(None);
        };
        if matches!(previous.status.as_str(), "cancelled" | "uncertain")
            && matches!(status, "completed" | "failed" | "started" | "received")
        {
            return Ok(Some(previous.clone()));
        }
        let mut updated = previous.clone();
        updated.status = status.into();
        if let Some(turn_id) = turn_id.filter(|value| !value.is_empty()) {
            updated.turn_id = Some(turn_id.into());
        }
        if let Some(event_id) = terminal_event_id.filter(|value| !value.is_empty()) {
            updated.terminal_event_id = Some(event_id.into());
        }
        updated.issue = issue.map(str::to_string);
        if updated == *previous {
            return Ok(Some(updated));
        }
        updated.updated_at = iso_now();
        guard
            .storage
            .append(
                vec![RecordChange::Put {
                    id: client_message_id.into(),
                    value: updated.clone(),
                }],
                None,
            )
            .map_err(storage_error)?;
        Ok(Some(updated))
    }
    pub fn cancel_thread(&self, thread_id: &str) -> Result<Vec<CommandReceipt>, ReceiptError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Self::ensure_owner(&guard)?;
        let _lock = guard.storage.lock().map_err(storage_error)?;
        guard.storage.refresh().map_err(storage_error)?;
        let now = iso_now();
        let out = guard
            .storage
            .records
            .values()
            .filter(|receipt| {
                receipt.thread_id == thread_id
                    && matches!(receipt.status.as_str(), "received" | "started")
            })
            .map(|receipt| {
                let mut receipt = receipt.clone();
                receipt.status = "cancelled".into();
                receipt.updated_at = now.clone();
                receipt.issue = Some("Arrêt demandé avant la confirmation du fournisseur.".into());
                receipt
            })
            .collect::<Vec<_>>();
        if !out.is_empty() {
            guard
                .storage
                .append(
                    out.iter()
                        .map(|receipt| RecordChange::Put {
                            id: receipt.client_message_id.clone(),
                            value: receipt.clone(),
                        })
                        .collect(),
                    None,
                )
                .map_err(storage_error)?;
        }
        Ok(out)
    }
    /// Complete checkpoint for an older binary, with the same caveat as
    /// ThreadStore::export_legacy: later journal writes require another export.
    pub fn export_legacy(&self) -> Result<(), ReceiptError> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Self::ensure_owner(&guard)?;
        let _lock = guard.storage.lock().map_err(storage_error)?;
        guard.storage.refresh().map_err(storage_error)?;
        guard.storage.compact().map_err(storage_error)
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
    fn independent_live_instances_do_not_run_restart_recovery() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("receipts.json");
        let first = CommandReceiptStore::open(&path);
        first.reserve("m", "fp", "t", "fake").unwrap();
        let second = CommandReceiptStore::open(&path);
        assert_eq!(second.get("m").unwrap().status, "received");
        second
            .update("m", "started", Some("turn"), None, None)
            .unwrap();
        assert_eq!(first.get("m").unwrap().status, "started");
        drop(first);
        drop(second);
        assert_eq!(
            CommandReceiptStore::open(&path).get("m").unwrap().status,
            "uncertain"
        );
    }
    #[test]
    fn independent_instances_reserve_an_id_exactly_once() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("receipts.json");
        let first = CommandReceiptStore::open(&path);
        let second = CommandReceiptStore::open(&path);
        let one = std::thread::spawn(move || first.reserve("shared", "fp", "t", "fake").unwrap());
        let two = std::thread::spawn(move || second.reserve("shared", "fp", "t", "fake").unwrap());
        let results = [one.join().unwrap(), two.join().unwrap()];
        assert_eq!(
            results
                .iter()
                .filter(|result| matches!(result, ReceiptReservation::New(_)))
                .count(),
            1
        );
        assert_eq!(
            results
                .iter()
                .filter(|result| matches!(result, ReceiptReservation::Existing(_)))
                .count(),
            1
        );
    }
    #[test]
    fn cancellation_is_one_durable_batch_and_stale_legacy_cannot_undo_it() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("receipts.json");
        let store = CommandReceiptStore::open(&path);
        for id in ["a", "b", "c"] {
            store.reserve(id, id, "t", "fake").unwrap();
        }
        store.export_legacy().unwrap();
        let old = std::fs::read(&path).unwrap();
        assert_eq!(store.cancel_thread("t").unwrap().len(), 3);
        let log = std::fs::read_to_string(auxiliary(&path, ".journal")).unwrap();
        assert_eq!(log.lines().count(), 1);
        store.export_legacy().unwrap();
        std::fs::write(&path, old).unwrap();
        let reopened = CommandReceiptStore::open(&path);
        for id in ["a", "b", "c"] {
            assert_eq!(reopened.get(id).unwrap().status, "cancelled");
        }
    }
    #[test]
    fn receipt_export_and_failed_append_preserve_acknowledgement_boundary() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("receipts.json");
        let store = CommandReceiptStore::open(&path);
        store.reserve("a", "fp", "t", "fake").unwrap();
        store.export_legacy().unwrap();
        let legacy: ReceiptFile = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert!(legacy.receipts.contains_key("a"));
        let log = auxiliary(&path, ".journal");
        std::fs::remove_file(&log).unwrap();
        std::fs::create_dir(&log).unwrap();
        assert!(store.reserve("b", "fp", "t", "fake").is_err());
        assert!(store.get("b").is_none());
        std::fs::remove_dir(&log).unwrap();
        assert!(matches!(
            store.reserve("b", "fp", "t", "fake").unwrap(),
            ReceiptReservation::New(_)
        ));
    }

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
        store
            .update("m2", "completed", Some("turn"), None, None)
            .unwrap();
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
            store
                .update(&id, "completed", Some("turn"), None, None)
                .unwrap();
        }
        let expired = crate::iso_at(
            std::time::SystemTime::now()
                .checked_sub(std::time::Duration::from_secs(TERMINAL_RETENTION_SECS + 1))
                .unwrap(),
        );
        {
            let mut guard = store.state.lock().unwrap();
            for index in 0..(MAX_RECEIPTS - 1) {
                guard
                    .storage
                    .records
                    .get_mut(&format!("terminal-{index}"))
                    .unwrap()
                    .updated_at = expired.clone();
            }
        }
        store
            .reserve("after-retention", "fp", "t1", "fake")
            .unwrap();
        assert!(store.get("terminal-0").is_none());
        assert!(
            store
                .get(&format!("terminal-{}", MAX_RECEIPTS - 1))
                .is_some()
        );
        assert!(store.get("after-retention").is_some());
    }
}
