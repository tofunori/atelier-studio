//! Thread catalog with a legacy JSON checkpoint and a durable incremental journal.

use crate::iso_now;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

const VALID_STATUSES: &[&str] = &["idle", "running", "done"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    #[serde(default)]
    pub project_root: String,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default)]
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
    pub updated_at: String,
    pub created_at: String,
    /// Linked-agent relation (plan 057) — only on child threads.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_link: Option<AgentLink>,
    /// Preserve unknown Node fields (resumeAt, lastTurn, goals, …).
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// Local copy of the protocol shape so the store stays independent of
/// atelier-protocol (avoids a circular dep). Mirrors plan 057 AgentLink.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentLink {
    pub parent_thread_id: String,
    #[serde(default = "default_link_role")]
    pub role: String,
    #[serde(default = "default_link_access")]
    pub access: String,
    pub created_at: String,
    #[serde(default = "default_link_created_by")]
    pub created_by: String,
    pub auto_delivery_limit: u32,
    #[serde(default)]
    pub auto_delivery_used: u32,
    #[serde(default)]
    pub paused: bool,
}

fn default_link_role() -> String {
    "collaborator".into()
}
fn default_link_access() -> String {
    "read_write".into()
}
fn default_link_created_by() -> String {
    "user".into()
}

fn default_provider() -> String {
    "claude".into()
}
fn default_status() -> String {
    "idle".into()
}

fn known_provider(id: &str) -> bool {
    matches!(
        id,
        "claude" | "codex" | "grok" | "kimi" | "opencode" | "gemini" | "fake"
    ) || id.starts_with("api-")
        || id.starts_with("openai")
}

fn normalize(mut raw: Value) -> Option<Thread> {
    let obj = raw.as_object_mut()?;
    let id = obj.get("id")?.as_str()?.to_string();
    if id.is_empty() {
        return None;
    }
    let session_id = obj
        .get("sessionId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let provider = obj
        .get("provider")
        .and_then(|v| v.as_str())
        .filter(|p| known_provider(p))
        .unwrap_or("claude")
        .to_string();
    let updated_at = obj
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(iso_now);
    let created_at = obj
        .get("createdAt")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| updated_at.clone());
    let title = {
        let t = obj
            .get("title")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        t.unwrap_or_else(|| {
            if let Some(ref sid) = session_id {
                let short: String = sid.chars().take(8).collect();
                format!("Session {short}")
            } else {
                "Sans titre".into()
            }
        })
    };
    let status = obj
        .get("status")
        .and_then(|v| v.as_str())
        .filter(|s| VALID_STATUSES.contains(s))
        .unwrap_or("idle")
        .to_string();
    let project_root = obj
        .get("projectRoot")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Flatten extras: everything except known keys
    let known = [
        "id",
        "projectRoot",
        "provider",
        "title",
        "sessionId",
        "status",
        "updatedAt",
        "createdAt",
        "agentLink",
    ];
    let mut extra = HashMap::new();
    for (k, v) in obj.iter() {
        if !known.contains(&k.as_str()) {
            extra.insert(k.clone(), v.clone());
        }
    }

    let agent_link = obj
        .get("agentLink")
        .and_then(|v| serde_json::from_value::<AgentLink>(v.clone()).ok());

    Some(Thread {
        id,
        project_root,
        provider,
        title,
        session_id,
        status,
        updated_at,
        created_at,
        agent_link,
        extra,
    })
}

#[derive(Debug)]
pub struct ThreadStore {
    storage: RecordJournal<Thread>,
    snapshot: OnceLock<Arc<Vec<Thread>>>,
}

fn thread_records(value: Value) -> io::Result<BTreeMap<String, Thread>> {
    let Value::Array(items) = value else {
        return Err(invalid("invalid thread catalog"));
    };
    Ok(items
        .into_iter()
        .filter_map(normalize)
        .map(|thread| (thread.id.clone(), thread))
        .collect())
}
fn thread_json(records: &BTreeMap<String, Thread>) -> io::Result<Vec<u8>> {
    let mut list: Vec<_> = records.values().collect();
    list.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.id.cmp(&b.id))
    });
    serde_json::to_vec_pretty(&list).map_err(invalid)
}

impl ThreadStore {
    pub fn open(file_path: impl Into<PathBuf>) -> Self {
        Self {
            storage: RecordJournal::open(file_path.into(), thread_records, thread_json),
            snapshot: OnceLock::new(),
        }
    }
    /// Includes both the legacy checkpoint and every authoritative journal file.
    /// Consumers must compare before/after opening to avoid caching a mixed read.
    pub fn storage_revision(path: impl AsRef<Path>) -> io::Result<String> {
        storage_revision(path.as_ref())
    }
    pub fn snapshot(&self) -> Arc<Vec<Thread>> {
        self.snapshot
            .get_or_init(|| {
                let mut list: Vec<_> = self.storage.records.values().cloned().collect();
                list.sort_by(|a, b| {
                    b.updated_at
                        .cmp(&a.updated_at)
                        .then_with(|| a.id.cmp(&b.id))
                });
                Arc::new(list)
            })
            .clone()
    }
    pub fn list(&self) -> Vec<Thread> {
        self.snapshot().as_ref().clone()
    }
    pub fn get(&self, id: &str) -> Option<&Thread> {
        self.storage.records.get(id)
    }
    fn refresh(&mut self) -> io::Result<()> {
        match self.storage.refresh() {
            Ok(false) => Ok(()),
            result => {
                // A valid journal prefix may have been replayed before a later
                // corrupt record is rejected. Never expose two different views
                // through get() and the cached snapshot after such an error.
                self.snapshot.take();
                result.map(|_| ())
            }
        }
    }
    pub fn delete(&mut self, id: &str) -> io::Result<bool> {
        let _lock = self.storage.lock()?;
        self.refresh()?;
        if !self.storage.records.contains_key(id) {
            return Ok(false);
        }
        self.storage
            .append(vec![RecordChange::Delete { id: id.into() }], None)?;
        self.snapshot.take();
        Ok(true)
    }
    pub fn upsert(&mut self, patch: Value, preserve_updated_at: bool) -> Result<Thread, String> {
        self.upsert_durable(patch, preserve_updated_at)
    }
    /// Every acknowledged mutation is a synced transaction; the map changes
    /// only after the append succeeds. Concurrent instances merge from disk.
    pub fn upsert_durable(
        &mut self,
        patch: Value,
        preserve_updated_at: bool,
    ) -> Result<Thread, String> {
        let _lock = self.storage.lock().map_err(|error| error.to_string())?;
        self.refresh().map_err(|error| error.to_string())?;
        let id = patch
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or("thread id manquant")?;
        let previous = self.storage.records.get(id);
        let mut merged = previous
            .map(serde_json::to_value)
            .transpose()
            .map_err(|error| error.to_string())?
            .unwrap_or_else(|| serde_json::json!({}));
        let object = merged.as_object_mut().ok_or("thread invalide")?;
        for (key, value) in patch.as_object().ok_or("thread invalide")? {
            object.insert(key.clone(), value.clone());
        }
        if preserve_updated_at {
            if let Some(previous) = previous {
                object.insert(
                    "updatedAt".into(),
                    Value::String(previous.updated_at.clone()),
                );
            }
        } else {
            object.insert("updatedAt".into(), Value::String(iso_now()));
        }
        let thread = normalize(merged).ok_or("thread id manquant")?;
        if previous == Some(&thread) {
            return Ok(thread);
        }
        self.storage
            .append(
                vec![RecordChange::Put {
                    id: thread.id.clone(),
                    value: thread.clone(),
                }],
                None,
            )
            .map_err(|error| error.to_string())?;
        self.snapshot.take();
        Ok(thread)
    }
    /// Writes a complete JSON checkpoint for an older binary. Call while that
    /// binary is stopped; new journal writes after this export are not visible
    /// to old versions. Tombstones remain in the authoritative baseline.
    pub fn export_legacy(&mut self) -> io::Result<()> {
        let _lock = self.storage.lock()?;
        self.refresh()?;
        self.storage.compact()
    }
    pub fn children_of(&self, parent_id: &str) -> Vec<Thread> {
        let mut list: Vec<_> = self
            .storage
            .records
            .values()
            .filter(|thread| {
                thread
                    .agent_link
                    .as_ref()
                    .is_some_and(|link| link.parent_thread_id == parent_id)
            })
            .cloned()
            .collect();
        list.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        list
    }
    pub fn is_linked(&self, id: &str) -> bool {
        self.get(id)
            .and_then(|thread| thread.agent_link.as_ref())
            .is_some()
            || !self.children_of(id).is_empty()
    }
    pub fn path(&self) -> &Path {
        &self.storage.path
    }
}

fn invalid(error: impl std::fmt::Display) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, error.to_string())
}
pub(crate) fn auxiliary(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}
fn file_revision(path: &Path) -> io::Result<String> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok("missing".into()),
        Err(error) => return Err(error),
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Ok(format!(
            "{}:{}:{}:{}:{}:{}:{}",
            metadata.dev(),
            metadata.ino(),
            metadata.len(),
            metadata.mtime(),
            metadata.mtime_nsec(),
            metadata.ctime(),
            metadata.ctime_nsec()
        ))
    }
    #[cfg(not(unix))]
    {
        Ok(format!(
            "{}:{:?}:{:?}",
            metadata.len(),
            metadata.modified()?,
            metadata.created().ok()
        ))
    }
}
fn storage_revision(path: &Path) -> io::Result<String> {
    Ok(format!(
        "{}|{}|{}",
        file_revision(path)?,
        file_revision(&auxiliary(path, ".baseline"))?,
        file_revision(&auxiliary(path, ".journal"))?
    ))
}
fn file_identity(path: &Path) -> io::Result<String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = std::fs::metadata(path)?;
        Ok(format!("{}:{}", metadata.dev(), metadata.ino()))
    }
    #[cfg(not(unix))]
    {
        file_revision(path)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub(crate) enum RecordChange<T> {
    Put { id: String, value: T },
    Delete { id: String },
}
#[derive(Serialize, Deserialize)]
struct RecordTransaction<T> {
    version: u32,
    changes: Vec<RecordChange<T>>,
    legacy: Option<BTreeMap<String, T>>,
    #[serde(default)]
    legacy_revision: Option<String>,
}
#[derive(Serialize, Deserialize)]
struct RecordBaseline<T> {
    version: u32,
    records: BTreeMap<String, T>,
    tombstones: BTreeSet<String>,
    #[serde(default)]
    protected: BTreeSet<String>,
    legacy: BTreeMap<String, T>,
    #[serde(default)]
    legacy_revision: Option<String>,
}

/// Shared engine for thread and receipt transactions. The lock is held by the
/// caller across refresh/read/append so two instances cannot lose each other's
/// writes. JSONL contains one complete transaction per line, including deletes.
#[derive(Debug)]
pub(crate) struct RecordJournal<T> {
    pub(crate) path: PathBuf,
    pub(crate) records: BTreeMap<String, T>,
    tombstones: BTreeSet<String>,
    protected: BTreeSet<String>,
    legacy: BTreeMap<String, T>,
    legacy_revision: Option<String>,
    baseline_revision: Option<String>,
    journal_revision: Option<String>,
    journal_identity: Option<String>,
    offset: u64,
    transactions: usize,
    parse: fn(Value) -> io::Result<BTreeMap<String, T>>,
    encode: fn(&BTreeMap<String, T>) -> io::Result<Vec<u8>>,
    pub(crate) load_error: Option<String>,
}
impl<T> RecordJournal<T>
where
    T: Clone + PartialEq + Serialize + serde::de::DeserializeOwned,
{
    pub(crate) fn open(
        path: PathBuf,
        parse: fn(Value) -> io::Result<BTreeMap<String, T>>,
        encode: fn(&BTreeMap<String, T>) -> io::Result<Vec<u8>>,
    ) -> Self {
        let mut store = Self {
            path,
            records: BTreeMap::new(),
            tombstones: BTreeSet::new(),
            protected: BTreeSet::new(),
            legacy: BTreeMap::new(),
            legacy_revision: None,
            baseline_revision: None,
            journal_revision: None,
            journal_identity: None,
            offset: 0,
            transactions: 0,
            parse,
            encode,
            load_error: None,
        };
        let result = store.lock().and_then(|_lock| store.refresh().map(|_| ()));
        if let Err(error) = result {
            store.load_error = Some(error.to_string());
        }
        store
    }
    pub(crate) fn lock(&self) -> io::Result<std::fs::File> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let file = std::fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(auxiliary(&self.path, ".lock"))?;
        fs2::FileExt::lock_exclusive(&file)?;
        Ok(file)
    }
    fn read_legacy(&self) -> io::Result<BTreeMap<String, T>> {
        match std::fs::read(&self.path) {
            Ok(bytes) => (self.parse)(serde_json::from_slice(&bytes).map_err(invalid)?),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
            Err(error) => Err(error),
        }
    }
    fn apply(&mut self, transaction: RecordTransaction<T>) {
        let legacy_import = transaction.legacy.is_some();
        for change in transaction.changes {
            match change {
                RecordChange::Put { id, value } => {
                    if !legacy_import {
                        self.protected.insert(id.clone());
                    }
                    self.tombstones.remove(&id);
                    self.records.insert(id, value);
                }
                RecordChange::Delete { id } => {
                    if !legacy_import {
                        self.protected.insert(id.clone());
                    }
                    self.records.remove(&id);
                    self.tombstones.insert(id);
                }
            }
        }
        if let Some(legacy) = transaction.legacy {
            self.legacy = legacy;
            self.legacy_revision = transaction.legacy_revision;
        }
    }
    pub(crate) fn refresh(&mut self) -> io::Result<bool> {
        let baseline = auxiliary(&self.path, ".baseline");
        let journal = auxiliary(&self.path, ".journal");
        let baseline_revision = file_revision(&baseline)?;
        let journal_revision = file_revision(&journal)?;
        let legacy_revision = file_revision(&self.path)?;
        if self.load_error.is_none()
            && self.baseline_revision.as_ref() == Some(&baseline_revision)
            && self.journal_revision.as_ref() == Some(&journal_revision)
            && self.legacy_revision.as_ref() == Some(&legacy_revision)
        {
            return Ok(false);
        }
        if baseline_revision == "missing" && journal_revision != "missing" {
            return Err(invalid("record journal exists without its baseline"));
        }
        let journal_identity = file_identity(&journal).ok();
        let journal_length = std::fs::metadata(&journal).map(|m| m.len()).unwrap_or(0);
        let reload = (baseline_revision == "missing"
            && self.legacy_revision.as_ref() != Some(&legacy_revision))
            || self.baseline_revision.as_ref() != Some(&baseline_revision)
            || self.journal_identity != journal_identity
            || journal_length < self.offset
            || (journal_length == self.offset
                && self.journal_revision.as_ref() != Some(&journal_revision));
        if reload || self.load_error.is_some() {
            if baseline_revision == "missing" {
                let legacy = self.read_legacy()?;
                self.records = legacy.clone();
                self.legacy = legacy;
                self.tombstones.clear();
                self.protected.clear();
            } else {
                let baseline: RecordBaseline<T> =
                    serde_json::from_slice(&std::fs::read(&baseline)?).map_err(invalid)?;
                if baseline.version != 1 {
                    return Err(invalid("unsupported record baseline version"));
                }
                self.records = baseline.records;
                self.tombstones = baseline.tombstones;
                self.protected = baseline.protected;
                self.legacy = baseline.legacy;
                self.legacy_revision = baseline.legacy_revision;
            }
            self.offset = 0;
            self.transactions = 0;
        }
        if journal_revision != "missing" {
            let mut file = std::fs::File::open(&journal)?;
            file.seek(SeekFrom::Start(self.offset))?;
            let mut tail = Vec::new();
            file.read_to_end(&mut tail)?;
            let complete = tail
                .iter()
                .rposition(|byte| *byte == b'\n')
                .map(|end| end + 1)
                .unwrap_or(0);
            for line in tail[..complete]
                .split(|byte| *byte == b'\n')
                .filter(|line| !line.is_empty())
            {
                let transaction: RecordTransaction<T> =
                    serde_json::from_slice(line).map_err(invalid)?;
                if transaction.version != 1 {
                    return Err(invalid("unsupported record journal version"));
                }
                self.apply(transaction);
                self.transactions += 1;
            }
            self.offset += complete as u64;
        }
        self.baseline_revision = Some(baseline_revision.clone());
        self.journal_revision = Some(journal_revision);
        self.journal_identity = journal_identity;
        if baseline_revision != "missing" && self.legacy_revision.as_ref() != Some(&legacy_revision)
        {
            let legacy = self.read_legacy()?;
            if legacy != self.legacy {
                // Apply only legacy edits to records untouched by the journal.
                // A stale legacy snapshot must never resurrect a tombstone or
                // overwrite a newer title/session/receipt in the authoritative state.
                let keys: BTreeSet<_> = self.legacy.keys().chain(legacy.keys()).cloned().collect();
                let mut changes = Vec::new();
                for id in keys {
                    let old = self.legacy.get(&id);
                    let new = legacy.get(&id);
                    if new == old
                        || self.tombstones.contains(&id)
                        || self.protected.contains(&id)
                        || self.records.get(&id) != old
                    {
                        continue;
                    }
                    changes.push(match new {
                        Some(value) => RecordChange::Put {
                            id,
                            value: value.clone(),
                        },
                        None => RecordChange::Delete { id },
                    });
                }
                self.append(changes, Some(legacy))?;
            }
        }
        self.legacy_revision = Some(legacy_revision);
        self.load_error = None;
        Ok(true)
    }
    fn ensure_baseline(&mut self) -> io::Result<()> {
        if self.baseline_revision.as_deref() != Some("missing") {
            return Ok(());
        }
        if !self.path.exists() {
            crate::write_file_atomic_durable(&self.path, (self.encode)(&self.legacy)?)?;
        }
        let baseline = RecordBaseline {
            version: 1,
            records: self.records.clone(),
            tombstones: self.tombstones.clone(),
            protected: self.protected.clone(),
            legacy: self.legacy.clone(),
            legacy_revision: Some(file_revision(&self.path)?),
        };
        crate::write_file_atomic_durable(
            &auxiliary(&self.path, ".baseline"),
            serde_json::to_vec(&baseline).map_err(invalid)?,
        )?;
        self.baseline_revision = Some(file_revision(&auxiliary(&self.path, ".baseline"))?);
        self.legacy_revision = Some(file_revision(&self.path)?);
        Ok(())
    }
    pub(crate) fn append(
        &mut self,
        changes: Vec<RecordChange<T>>,
        legacy: Option<BTreeMap<String, T>>,
    ) -> io::Result<()> {
        self.ensure_baseline()?;
        if legacy.is_none() && (self.transactions >= 1024 || self.offset > 16 * 1024 * 1024) {
            self.compact()?;
        }
        let transaction = RecordTransaction {
            version: 1,
            changes,
            legacy_revision: if legacy.is_some() {
                Some(file_revision(&self.path)?)
            } else {
                None
            },
            legacy,
        };
        let mut bytes = serde_json::to_vec(&transaction).map_err(invalid)?;
        bytes.push(b'\n');
        let journal = auxiliary(&self.path, ".journal");
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .truncate(false)
            .open(&journal)?;
        // Remove only an incomplete crash tail; every complete transaction was
        // already replayed under the same interprocess lock.
        file.set_len(self.offset)?;
        file.seek(SeekFrom::Start(self.offset))?;
        if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
            let _ = file.set_len(self.offset).and_then(|_| file.sync_all());
            return Err(error);
        }
        if let Some(parent) = journal.parent() {
            std::fs::File::open(parent)?.sync_all()?;
        }
        self.apply(transaction);
        self.offset += bytes.len() as u64;
        self.transactions += 1;
        self.journal_revision = Some(file_revision(&journal)?);
        self.journal_identity = Some(file_identity(&journal)?);
        Ok(())
    }
    pub(crate) fn compact(&mut self) -> io::Result<()> {
        // Publish the legacy export first, then the authoritative checkpoint,
        // finally replace the journal. Replaying the old log after a crash is
        // idempotent. Tombstones survive compaction and stale legacy imports.
        crate::write_file_atomic_durable(&self.path, (self.encode)(&self.records)?)?;
        let baseline = RecordBaseline {
            version: 1,
            records: self.records.clone(),
            tombstones: self.tombstones.clone(),
            protected: self.protected.clone(),
            legacy: self.records.clone(),
            legacy_revision: Some(file_revision(&self.path)?),
        };
        crate::write_file_atomic_durable(
            &auxiliary(&self.path, ".baseline"),
            serde_json::to_vec(&baseline).map_err(invalid)?,
        )?;
        crate::write_file_atomic_durable(&auxiliary(&self.path, ".journal"), [])?;
        self.legacy = self.records.clone();
        self.offset = 0;
        self.transactions = 0;
        self.baseline_revision = Some(file_revision(&auxiliary(&self.path, ".baseline"))?);
        self.journal_revision = Some(file_revision(&auxiliary(&self.path, ".journal"))?);
        self.journal_identity = Some(file_identity(&auxiliary(&self.path, ".journal"))?);
        self.legacy_revision = Some(file_revision(&self.path)?);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn legacy_migration_updates_only_the_journal_and_exports_for_old_versions() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let original = br#"[{"id":"old","title":"Legacy","provider":"codex","custom":7}]"#;
        std::fs::write(&path, original).unwrap();
        let mut store = ThreadStore::open(&path);
        store
            .upsert(serde_json::json!({"id":"new","title":"New"}), false)
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert_eq!(ThreadStore::open(&path).list().len(), 2);
        store.export_legacy().unwrap();
        let exported: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(exported.as_array().unwrap().len(), 2);
        assert_eq!(
            ThreadStore::open(&path).get("old").unwrap().extra["custom"],
            7
        );
        assert_eq!(
            std::fs::metadata(auxiliary(&path, ".journal"))
                .unwrap()
                .len(),
            0
        );
    }
    #[test]
    fn independent_instances_merge_and_snapshots_are_cached() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut first = ThreadStore::open(&path);
        let mut second = ThreadStore::open(&path);
        first
            .upsert(serde_json::json!({"id":"a","title":"A"}), false)
            .unwrap();
        second
            .upsert(serde_json::json!({"id":"b","title":"B"}), false)
            .unwrap();
        first
            .upsert(serde_json::json!({"id":"a","title":"A2"}), true)
            .unwrap();
        assert_eq!(first.list().len(), 2);
        let snapshot = first.snapshot();
        assert!(Arc::ptr_eq(&snapshot, &first.snapshot()));
        let revision = ThreadStore::storage_revision(&path).unwrap();
        first
            .upsert(serde_json::json!({"id":"a","title":"A2"}), true)
            .unwrap();
        assert!(Arc::ptr_eq(&snapshot, &first.snapshot()));
        assert_eq!(revision, ThreadStore::storage_revision(&path).unwrap());
        assert_eq!(ThreadStore::open(&path).get("b").unwrap().title, "B");
    }
    #[test]
    fn stale_legacy_cannot_resurrect_tombstones_or_replace_newer_records() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        std::fs::write(&path,br#"[{"id":"a","title":"Old"},{"id":"b","title":"Deleted"},{"id":"c","title":"Unchanged"}]"#).unwrap();
        let mut store = ThreadStore::open(&path);
        store
            .upsert(serde_json::json!({"id":"a","title":"Newer"}), true)
            .unwrap();
        store.delete("b").unwrap();
        store.export_legacy().unwrap();
        std::fs::write(&path,br#"[{"id":"a","title":"Old"},{"id":"b","title":"Deleted"},{"id":"c","title":"Edited by old version"},{"id":"d","title":"Legacy addition"}]"#).unwrap();
        let reopened = ThreadStore::open(&path);
        assert_eq!(reopened.get("a").unwrap().title, "Newer");
        assert!(reopened.get("b").is_none());
        assert_eq!(reopened.get("c").unwrap().title, "Edited by old version");
        assert!(reopened.get("d").is_some());
        assert!(ThreadStore::open(&path).get("b").is_none());
    }
    #[test]
    fn torn_tail_is_repaired_but_complete_corruption_is_refused() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut store = ThreadStore::open(&path);
        store.upsert(serde_json::json!({"id":"a"}), false).unwrap();
        let log = auxiliary(&path, ".journal");
        std::fs::OpenOptions::new()
            .append(true)
            .open(&log)
            .unwrap()
            .write_all(b"{partial")
            .unwrap();
        let mut recovered = ThreadStore::open(&path);
        assert!(recovered.get("a").is_some());
        recovered
            .upsert(serde_json::json!({"id":"b"}), false)
            .unwrap();
        assert_eq!(ThreadStore::open(&path).list().len(), 2);
        std::fs::OpenOptions::new()
            .append(true)
            .open(&log)
            .unwrap()
            .write_all(b"invalid complete record\n")
            .unwrap();
        let mut corrupt = ThreadStore::open(&path);
        assert!(
            corrupt
                .upsert(serde_json::json!({"id":"c"}), false)
                .is_err()
        );
    }
    #[test]
    fn migration_metadata_prevents_reimport_of_missing_legacy_timestamps() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        std::fs::write(&path, br#"[{"id":"a","title":"Legacy"}]"#).unwrap();
        let mut store = ThreadStore::open(&path);
        store.upsert(serde_json::json!({"id":"b"}), false).unwrap();
        let revision = ThreadStore::storage_revision(&path).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        assert_eq!(ThreadStore::open(&path).list().len(), 2);
        assert_eq!(ThreadStore::storage_revision(&path).unwrap(), revision);
    }
    #[test]
    fn checkpoint_before_journal_reset_recovers_idempotently() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut store = ThreadStore::open(&path);
        store
            .upsert(serde_json::json!({"id":"a","title":"Initial"}), false)
            .unwrap();
        store
            .upsert(serde_json::json!({"id":"b","title":"Delete"}), false)
            .unwrap();
        store
            .upsert(serde_json::json!({"id":"a","title":"Final"}), false)
            .unwrap();
        store.delete("b").unwrap();
        let log = auxiliary(&path, ".journal");
        let previous_log = std::fs::read(&log).unwrap();
        store.export_legacy().unwrap();
        // Crash after publishing the checkpoint but before clearing the log.
        std::fs::write(&log, previous_log).unwrap();
        let reopened = ThreadStore::open(&path);
        assert_eq!(reopened.get("a").unwrap().title, "Final");
        assert!(reopened.get("b").is_none());
        assert_eq!(reopened.list().len(), 1);
    }

    #[test]
    fn first_mutation_imports_legacy_edits_made_since_open() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        std::fs::write(&path, br#"[{"id":"a","title":"Before"}]"#).unwrap();
        let mut store = ThreadStore::open(&path);
        let cached = store.snapshot();
        // No .baseline/.journal exists yet: an old process can still update JSON.
        std::fs::write(&path, br#"[{"id":"a","title":"Legacy edit"},{"id":"b"}]"#).unwrap();
        store.upsert(serde_json::json!({"id":"c"}), false).unwrap();
        assert_eq!(cached[0].title, "Before");
        assert_eq!(store.get("a").unwrap().title, "Legacy edit");
        assert_eq!(store.list().len(), 3);
        assert_eq!(ThreadStore::open(&path).list().len(), 3);
    }

    #[test]
    fn failed_refresh_keeps_snapshot_consistent_with_replayed_records() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut reader = ThreadStore::open(&path);
        reader.upsert(serde_json::json!({"id":"a","title":"Before"}), false).unwrap();
        let cached = reader.snapshot();
        let mut writer = ThreadStore::open(&path);
        writer.upsert(serde_json::json!({"id":"a","title":"After"}), false).unwrap();
        let mut log = std::fs::OpenOptions::new().append(true).open(auxiliary(&path, ".journal")).unwrap();
        log.write_all(b"{corrupt}\n").unwrap();
        assert!(reader.upsert(serde_json::json!({"id":"b"}), false).is_err());
        assert_eq!(cached[0].title, "Before");
        assert_eq!(reader.get("a").unwrap().title, "After");
        assert_eq!(reader.snapshot()[0].title, "After");
        assert!(reader.get("b").is_none());
    }

    #[test]
    fn journal_child_writer() {
        let Ok(path) = std::env::var("ATELIER_TEST_RECORD_PATH") else {
            return;
        };
        let id = std::env::var("ATELIER_TEST_RECORD_ID").unwrap();
        let mut store = ThreadStore::open(path);
        for n in 0..8 {
            store
                .upsert(
                    serde_json::json!({"id":format!("{id}-{n}"),"title":id}),
                    false,
                )
                .unwrap();
        }
    }
    #[test]
    fn processes_share_the_append_lock_without_lost_records() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut processes = Vec::new();
        for id in ["one", "two", "three"] {
            processes.push(
                std::process::Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--exact",
                        "threads::tests::journal_child_writer",
                        "--nocapture",
                    ])
                    .env("ATELIER_TEST_RECORD_PATH", &path)
                    .env("ATELIER_TEST_RECORD_ID", id)
                    .stdout(std::process::Stdio::null())
                    .spawn()
                    .unwrap(),
            );
        }
        for mut process in processes {
            assert!(process.wait().unwrap().success());
        }
        assert_eq!(ThreadStore::open(&path).list().len(), 24);
    }

    #[test]
    fn upsert_list_delete() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut store = ThreadStore::open(&path);
        store
            .upsert(
                serde_json::json!({"id":"t1","title":"Hello","provider":"codex"}),
                false,
            )
            .unwrap();
        assert_eq!(store.list().len(), 1);
        assert_eq!(store.get("t1").unwrap().title, "Hello");
        store.delete("t1").unwrap();
        assert!(store.list().is_empty());
        // reload
        let store2 = ThreadStore::open(&path);
        assert!(store2.list().is_empty());
    }

    #[test]
    fn durable_upsert_rolls_back_memory_after_failure_and_can_retry() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut store = ThreadStore::open(&path);
        store
            .upsert_durable(
                serde_json::json!({"id":"t1","provider":"codex","sessionId":"old"}),
                false,
            )
            .unwrap();
        std::fs::remove_file(&path).unwrap();
        std::fs::create_dir(&path).unwrap();
        assert!(
            store
                .upsert_durable(serde_json::json!({"id":"t1","sessionId":"new"}), true)
                .is_err()
        );
        assert_eq!(store.get("t1").unwrap().session_id.as_deref(), Some("old"));

        std::fs::remove_dir(&path).unwrap();
        store
            .upsert_durable(serde_json::json!({"id":"t1","sessionId":"new"}), true)
            .unwrap();
        assert_eq!(
            ThreadStore::open(&path)
                .get("t1")
                .unwrap()
                .session_id
                .as_deref(),
            Some("new")
        );
    }

    #[test]
    fn upsert_keeps_kimi_provider() {
        // Régression plan 046 : « kimi » absent de known_provider ⇒ chaque
        // upsert dégradait le fil en « claude » (l'UI retombait sur Claude).
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut store = ThreadStore::open(&path);
        let t = store
            .upsert(serde_json::json!({"id":"t1","provider":"kimi"}), false)
            .unwrap();
        assert_eq!(t.provider, "kimi");
        // survit au rechargement disque (normalize au open aussi)
        let store2 = ThreadStore::open(&path);
        assert_eq!(store2.get("t1").unwrap().provider, "kimi");
    }

    #[test]
    fn preserves_extra_fields() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("threads.json");
        let mut store = ThreadStore::open(&path);
        store
            .upsert(
                serde_json::json!({"id":"t1","resumeAt":42,"custom":"x"}),
                false,
            )
            .unwrap();
        let t = store.get("t1").unwrap();
        assert_eq!(t.extra.get("resumeAt").and_then(|v| v.as_i64()), Some(42));
    }
}
