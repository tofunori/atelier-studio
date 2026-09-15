//! Durable isolated reviews (plan 080 A2).
//!
//! `<app_dir>/reviews/<reviewId>.json` and `inputs/<inputHash>.json`.
//! Never written into the analyzed project.

use crate::{iso_now, write_file_atomic_durable};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

pub const REVIEW_SCHEMA_VERSION: u32 = 1;
pub const REVIEW_PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewStoreError {
    Io(String),
    Invalid(String),
    UnsupportedVersion(u32),
}

impl std::fmt::Display for ReviewStoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(message) | Self::Invalid(message) => f.write_str(message),
            Self::UnsupportedVersion(version) => {
                write!(f, "version de revue non supportée: {version}")
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewConfig {
    pub provider: String,
    pub model: String,
    pub effort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPolicy {
    pub enabled: bool,
    pub trigger: String,
    pub autofix: bool,
    pub max_corrections: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCheck {
    pub id: String,
    pub claim: String,
    pub outcome: String,
    #[serde(default)]
    pub evidence_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewErrorInfo {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRecord {
    pub schema_version: u32,
    pub review_id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub input_hash: String,
    pub config_hash: String,
    pub dedup_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_request_id: Option<String>,
    pub mode: String,
    pub trigger: String,
    pub config: ReviewConfig,
    pub policy: ReviewPolicy,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<String>,
    pub coverage: String,
    #[serde(default)]
    pub checks: Vec<ReviewCheck>,
    #[serde(default)]
    pub limitations: Vec<String>,
    pub attempt: u32,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ReviewErrorInfo>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RequiredCheck {
    pub id: String,
    pub claim: String,
    #[serde(default)]
    pub target_evidence_ids: Vec<String>,
    #[serde(default)]
    pub required_evidence_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewEvidence {
    pub evidence_id: String,
    pub origin: String,
    pub sha256: String,
    pub bytes: u64,
    pub kind: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInput {
    pub schema_version: u32,
    pub thread_id: String,
    pub turn_id: String,
    pub mode: String,
    pub scope_id: String,
    pub prompt: String,
    #[serde(default)]
    pub responses: Vec<String>,
    #[serde(default)]
    pub evidence: Vec<ReviewEvidence>,
    #[serde(default)]
    pub required_checks: Vec<RequiredCheck>,
    #[serde(default)]
    pub missing: Vec<String>,
    #[serde(default)]
    pub truncated: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<String>,
    pub diff_scope: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReviewReservation {
    New(ReviewRecord),
    Existing(ReviewRecord),
    Collision(ReviewRecord),
}

#[derive(Default)]
struct ReviewIndex {
    records: HashMap<String, ReviewRecord>,
    by_request: HashMap<String, String>,
    load_error: Option<ReviewStoreError>,
}

#[derive(Clone)]
pub struct ReviewStore {
    dir: PathBuf,
    state: Arc<Mutex<ReviewIndex>>,
}

impl ReviewStore {
    pub fn open(dir: impl AsRef<Path>) -> Self {
        let dir = dir.as_ref().to_path_buf();
        let mut index = ReviewIndex::default();
        match std::fs::read_dir(&dir) {
            Ok(entries) => {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) != Some("json") {
                        continue;
                    }
                    if path.parent() != Some(dir.as_path()) {
                        continue;
                    }
                    match std::fs::read(&path) {
                        Ok(bytes) => match serde_json::from_slice::<ReviewRecord>(&bytes) {
                            Ok(record) => {
                                if record.schema_version != REVIEW_SCHEMA_VERSION {
                                    index.load_error = Some(ReviewStoreError::UnsupportedVersion(
                                        record.schema_version,
                                    ));
                                    continue;
                                }
                                if let Some(request_id) = record.client_request_id.as_ref() {
                                    index
                                        .by_request
                                        .insert(request_id.clone(), record.review_id.clone());
                                }
                                index.records.insert(record.review_id.clone(), record);
                            }
                            Err(error) => {
                                index.load_error =
                                    Some(ReviewStoreError::Invalid(error.to_string()));
                            }
                        },
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                        Err(error) => {
                            index.load_error = Some(ReviewStoreError::Io(error.to_string()));
                        }
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                index.load_error = Some(ReviewStoreError::Io(error.to_string()));
            }
        }
        Self {
            dir,
            state: Arc::new(Mutex::new(index)),
        }
    }

    pub fn load_error(&self) -> Option<ReviewStoreError> {
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .load_error
            .clone()
    }

    fn record_path(&self, review_id: &str) -> Result<PathBuf, ReviewStoreError> {
        if Uuid::parse_str(review_id).is_err() {
            return Err(ReviewStoreError::Invalid("reviewId invalide".into()));
        }
        Ok(self.dir.join(format!("{review_id}.json")))
    }

    fn input_path(&self, input_hash: &str) -> Result<PathBuf, ReviewStoreError> {
        if !is_sha256_hex(input_hash) {
            return Err(ReviewStoreError::Invalid("inputHash invalide".into()));
        }
        Ok(self.dir.join("inputs").join(format!("{input_hash}.json")))
    }

    pub fn put_input(&self, input: &ReviewInput) -> Result<String, ReviewStoreError> {
        validate_input(input)?;
        let hash = hash_input(input);
        let path = self.input_path(&hash)?;
        match std::fs::metadata(&path) {
            Ok(_) => {
                // Never replace corrupt evidence with a fresh copy on a retry.
                self.get_input(&hash)?;
                return Ok(hash);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(ReviewStoreError::Io(error.to_string())),
        }
        let data = serde_json::to_vec_pretty(input)
            .map_err(|e| ReviewStoreError::Invalid(e.to_string()))?;
        write_file_atomic_durable(&path, data).map_err(|e| ReviewStoreError::Io(e.to_string()))?;
        Ok(hash)
    }

    pub fn get_input(&self, input_hash: &str) -> Result<ReviewInput, ReviewStoreError> {
        let path = self.input_path(input_hash)?;
        let bytes = std::fs::read(&path).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                ReviewStoreError::Invalid("entrée de revue absente".into())
            } else {
                ReviewStoreError::Io(e.to_string())
            }
        })?;
        let input: ReviewInput =
            serde_json::from_slice(&bytes).map_err(|e| ReviewStoreError::Invalid(e.to_string()))?;
        if input.schema_version != REVIEW_SCHEMA_VERSION {
            return Err(ReviewStoreError::UnsupportedVersion(input.schema_version));
        }
        if hash_input(&input) != input_hash {
            return Err(ReviewStoreError::Invalid(
                "empreinte du dossier de revue incorrecte".into(),
            ));
        }
        validate_input(&input)?;
        Ok(input)
    }

    pub fn get_by_request(
        &self,
        request_id: &str,
    ) -> Result<Option<ReviewRecord>, ReviewStoreError> {
        if !valid_request_id(request_id) {
            return Err(ReviewStoreError::Invalid("requestId invalide".into()));
        }
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(error) = &guard.load_error {
            return Err(error.clone());
        }
        guard
            .by_request
            .get(request_id)
            .map(|id| {
                guard
                    .records
                    .get(id)
                    .cloned()
                    .ok_or_else(|| ReviewStoreError::Invalid("réservation orpheline".into()))
            })
            .transpose()
    }

    pub fn reserve(&self, record: ReviewRecord) -> Result<ReviewReservation, ReviewStoreError> {
        if let Some(error) = self.load_error() {
            return Err(error);
        }
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(request_id) = record.client_request_id.as_ref() {
            if !valid_request_id(request_id) {
                return Err(ReviewStoreError::Invalid("requestId invalide".into()));
            }
            if let Some(existing_id) = guard.by_request.get(request_id).cloned() {
                let existing = guard
                    .records
                    .get(&existing_id)
                    .cloned()
                    .ok_or_else(|| ReviewStoreError::Invalid("réservation orpheline".into()))?;
                if same_reservation(&existing, &record) {
                    return Ok(ReviewReservation::Existing(existing));
                }
                return Ok(ReviewReservation::Collision(existing));
            }
        }
        self.persist_locked(&record)?;
        if let Some(request_id) = record.client_request_id.as_ref() {
            guard
                .by_request
                .insert(request_id.clone(), record.review_id.clone());
        }
        guard
            .records
            .insert(record.review_id.clone(), record.clone());
        Ok(ReviewReservation::New(record))
    }

    pub fn put(&self, record: ReviewRecord) -> Result<ReviewRecord, ReviewStoreError> {
        if let Some(error) = self.load_error() {
            return Err(error);
        }
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        self.persist_locked(&record)?;
        if let Some(request_id) = record.client_request_id.as_ref() {
            guard
                .by_request
                .insert(request_id.clone(), record.review_id.clone());
        }
        guard
            .records
            .insert(record.review_id.clone(), record.clone());
        Ok(record)
    }

    pub fn get(&self, review_id: &str) -> Result<ReviewRecord, ReviewStoreError> {
        if let Some(error) = self.load_error() {
            return Err(error);
        }
        self.state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .records
            .get(review_id)
            .cloned()
            .ok_or_else(|| ReviewStoreError::Invalid("revue absente".into()))
    }

    pub fn list_thread(
        &self,
        thread_id: &str,
        before: Option<&str>,
        limit: usize,
    ) -> Result<Vec<ReviewRecord>, ReviewStoreError> {
        if let Some(error) = self.load_error() {
            return Err(error);
        }
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let mut records: Vec<_> = guard
            .records
            .values()
            .filter(|record| record.thread_id == thread_id)
            .cloned()
            .collect();
        records.sort_by(|a, b| {
            b.created_at
                .cmp(&a.created_at)
                .then(b.review_id.cmp(&a.review_id))
        });
        if let Some(before) = before {
            if let Some(index) = records.iter().position(|record| record.review_id == before) {
                records = records.split_off(index + 1);
            }
        }
        records.truncate(limit);
        Ok(records)
    }

    fn persist_locked(&self, record: &ReviewRecord) -> Result<(), ReviewStoreError> {
        if record.schema_version != REVIEW_SCHEMA_VERSION {
            return Err(ReviewStoreError::UnsupportedVersion(record.schema_version));
        }
        let path = self.record_path(&record.review_id)?;
        let data = serde_json::to_vec_pretty(record)
            .map_err(|e| ReviewStoreError::Invalid(e.to_string()))?;
        write_file_atomic_durable(&path, data).map_err(|e| ReviewStoreError::Io(e.to_string()))
    }
}

fn valid_request_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && !id.contains('/')
        && !id.contains('\\')
        && !id.contains("..")
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

fn same_reservation(existing: &ReviewRecord, incoming: &ReviewRecord) -> bool {
    if let (Some(a), Some(b)) = (
        existing
            .extra
            .get("requestFingerprint")
            .and_then(Value::as_str),
        incoming
            .extra
            .get("requestFingerprint")
            .and_then(Value::as_str),
    ) {
        // Concurrent admissions may have resolved different implicit turns. The
        // first durable reservation owns that resolution for this exact request.
        return existing.thread_id == incoming.thread_id && a == b;
    }
    existing.thread_id == incoming.thread_id
        && existing.turn_id == incoming.turn_id
        && existing.mode == incoming.mode
        && existing.config == incoming.config
        && existing.policy == incoming.policy
}

fn validate_input(input: &ReviewInput) -> Result<(), ReviewStoreError> {
    if input.schema_version != REVIEW_SCHEMA_VERSION {
        return Err(ReviewStoreError::UnsupportedVersion(input.schema_version));
    }
    for evidence in &input.evidence {
        if let Some(content) = &evidence.content {
            let hash = evidence_sha256(content);
            if evidence.bytes != content.len() as u64
                || evidence.sha256 != hash
                || evidence
                    .payload_ref
                    .as_ref()
                    .is_some_and(|value| value != &hash)
            {
                return Err(ReviewStoreError::Invalid(format!(
                    "preuve de revue corrompue: {}",
                    evidence.evidence_id
                )));
            }
        }
    }
    Ok(())
}

pub fn hash_input(input: &ReviewInput) -> String {
    canonical_sha256(&serde_json::to_value(input).unwrap_or(Value::Null))
}

pub fn hash_config(config: &ReviewConfig, policy: &ReviewPolicy) -> String {
    canonical_sha256(&json!({
        "config": config,
        "policy": policy,
        "protocolVersion": REVIEW_PROTOCOL_VERSION,
    }))
}

pub fn dedup_key(
    thread_id: &str,
    turn_id: &str,
    input_hash: &str,
    config_hash: &str,
    mode: &str,
) -> String {
    canonical_sha256(&json!({
        "threadId": thread_id,
        "turnId": turn_id,
        "inputHash": input_hash,
        "configHash": config_hash,
        "mode": mode,
    }))
}

pub fn canonical_sha256(value: &Value) -> String {
    let bytes = serde_json::to_vec(&canonicalize(value)).unwrap_or_default();
    hex::encode(Sha256::digest(bytes))
}

pub fn evidence_sha256(content: &str) -> String {
    hex::encode(Sha256::digest(content.as_bytes()))
}

fn canonicalize(value: &Value) -> Value {
    match value {
        Value::Object(object) => {
            let ordered: BTreeMap<_, _> = object
                .iter()
                .map(|(key, value)| (key.clone(), canonicalize(value)))
                .collect();
            Value::Object(ordered.into_iter().collect())
        }
        Value::Array(values) => Value::Array(values.iter().map(canonicalize).collect()),
        _ => value.clone(),
    }
}

pub fn new_review_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn now_iso() -> String {
    iso_now()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_input() -> ReviewInput {
        ReviewInput {
            schema_version: 1,
            thread_id: "thread-a".into(),
            turn_id: "turn-1".into(),
            mode: "claims".into(),
            scope_id: "claims:turn-1".into(),
            prompt: "analyse".into(),
            responses: vec!["ok".into()],
            evidence: vec![],
            required_checks: vec![],
            missing: vec![],
            truncated: vec![],
            diff: None,
            diff_scope: "turn".into(),
            extra: Map::new(),
        }
    }

    fn sample_record(request_id: Option<&str>, turn_id: &str) -> ReviewRecord {
        let config = ReviewConfig {
            provider: "codex".into(),
            model: "gpt-5.5".into(),
            effort: "high".into(),
        };
        let policy = ReviewPolicy {
            enabled: true,
            trigger: "always".into(),
            autofix: false,
            max_corrections: 1,
        };
        let input_hash = hash_input(&sample_input());
        let config_hash = hash_config(&config, &policy);
        ReviewRecord {
            schema_version: 1,
            review_id: new_review_id(),
            thread_id: "thread-a".into(),
            turn_id: turn_id.into(),
            input_hash: input_hash.clone(),
            config_hash: config_hash.clone(),
            dedup_key: dedup_key("thread-a", turn_id, &input_hash, &config_hash, "claims"),
            client_request_id: request_id.map(str::to_string),
            mode: "claims".into(),
            trigger: "manual".into(),
            config,
            policy,
            status: "queued".into(),
            outcome: None,
            coverage: "partial".into(),
            checks: vec![],
            limitations: vec![],
            attempt: 1,
            created_at: "2026-09-14T00:00:00.000Z".into(),
            updated_at: "2026-09-14T00:00:00.000Z".into(),
            error: None,
            extra: Map::new(),
        }
    }

    #[test]
    fn reserve_is_idempotent_for_the_same_request() {
        let dir = tempdir().unwrap();
        let store = ReviewStore::open(dir.path());
        let record = sample_record(Some("req-1"), "turn-1");
        let first = store.reserve(record.clone()).unwrap();
        let ReviewReservation::New(saved) = first else {
            panic!("expected new");
        };
        let mut retry = record.clone();
        retry.review_id = new_review_id();
        let second = store.reserve(retry).unwrap();
        let ReviewReservation::Existing(existing) = second else {
            panic!("expected existing");
        };
        assert_eq!(existing.review_id, saved.review_id);
        assert_eq!(existing.turn_id, "turn-1");
    }

    #[test]
    fn same_request_id_and_other_payload_is_a_collision() {
        let dir = tempdir().unwrap();
        let store = ReviewStore::open(dir.path());
        store
            .reserve(sample_record(Some("req-1"), "turn-1"))
            .unwrap();
        let collided = store
            .reserve(sample_record(Some("req-1"), "turn-2"))
            .unwrap();
        assert!(matches!(collided, ReviewReservation::Collision(_)));
    }

    #[test]
    fn unknown_schema_version_is_rejected() {
        let dir = tempdir().unwrap();
        let store = ReviewStore::open(dir.path());
        let mut record = sample_record(None, "turn-1");
        record.schema_version = 9;
        let err = store.put(record).unwrap_err();
        assert!(matches!(err, ReviewStoreError::UnsupportedVersion(9)));
    }

    #[test]
    fn list_is_filtered_to_the_thread() {
        let dir = tempdir().unwrap();
        let store = ReviewStore::open(dir.path());
        let mut other = sample_record(None, "turn-1");
        other.thread_id = "thread-b".into();
        store.put(sample_record(None, "turn-1")).unwrap();
        store.put(other).unwrap();
        let listed = store.list_thread("thread-a", None, 20).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].thread_id, "thread-a");
    }

    #[test]
    fn input_roundtrip_is_content_addressed() {
        let dir = tempdir().unwrap();
        let store = ReviewStore::open(dir.path());
        let hash = store.put_input(&sample_input()).unwrap();
        assert!(is_sha256_hex(&hash));
        let loaded = store.get_input(&hash).unwrap();
        assert_eq!(loaded.prompt, "analyse");
    }

    #[test]
    fn path_traversal_request_id_is_rejected() {
        let dir = tempdir().unwrap();
        let store = ReviewStore::open(dir.path());
        let err = store
            .reserve(sample_record(Some("../escape"), "turn-1"))
            .unwrap_err();
        assert!(matches!(err, ReviewStoreError::Invalid(_)));
    }
}
