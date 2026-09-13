//! Harness journal — `harness-history/<sha256(threadId)>.jsonl`
//! (Node `sidecar/harness_journal.mjs` load/materialize/delete/append).

use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

const EPHEMERAL: &[&str] = &[
    "delta",
    "thinking_delta",
    "thinking_progress",
    "thinking_live",
    "stream_set",
    "streaming",
    "started",
    "heartbeat",
];
const ITEM_COMPACT: &[&str] = &["tool_update", "activity"];
const SINGLETON: &[&str] = &["todos", "goal"];
const MAX_INLINE_BYTES: usize = 512 * 1024;
const MAX_PAYLOAD_BYTES: u64 = 64 * 1024 * 1024;
const PAYLOAD_REF_KIND: &str = "__atelier_payload_ref";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JournalError {
    pub operation: &'static str,
    pub message: String,
}

impl JournalError {
    fn new(operation: &'static str, error: impl fmt::Display) -> Self {
        Self { operation, message: error.to_string() }
    }
}

impl fmt::Display for JournalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.operation, self.message)
    }
}

impl std::error::Error for JournalError {}

#[derive(Debug, Clone)]
pub struct HarnessJournal {
    dir: PathBuf,
    // Allocateur de séquences partagé : trois écrivains concurrents
    // (mirror des fils liés, boîte aux lettres agent, @mentions) faisaient
    // chacun `last_sequence(id) + 1` sans coordination — deux écritures
    // concurrentes pouvaient obtenir la même séquence et corrompre l'ordre
    // de `materialize` (course vécue, revue finale 2026-08-28). Arc<Mutex<_>>
    // pour que tout clone de `HarnessJournal` (HarnessManager, HarnessThread,
    // `state.journal()`) partage le MÊME compteur, pas une copie divergente.
    sequence_counters: Arc<Mutex<HashMap<String, u64>>>,
    /// Serialize first-header creation and line appends for one thread. O_APPEND
    /// does not make two separate writes (JSON then newline) one transaction.
    write_locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
}
// Clone is intentional: journal is path-based, safe to share across harnesses
// (le compteur de séquences est lui-même partagé via Arc, voir ci-dessus).

impl HarnessJournal {
    pub fn new(base_dir: impl AsRef<Path>) -> Self {
        Self {
            dir: base_dir.as_ref().join("harness-history"),
            sequence_counters: Arc::new(Mutex::new(HashMap::new())),
            write_locks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn hash_of(thread_id: &str) -> String {
        let mut h = Sha256::new();
        h.update(thread_id.as_bytes());
        hex::encode(h.finalize())
    }

    fn path_of(&self, thread_id: &str) -> PathBuf {
        self.dir.join(format!("{}.jsonl", Self::hash_of(thread_id)))
    }

    fn payload_dir(&self) -> PathBuf {
        self.dir.join("payloads")
    }

    fn write_lock(&self, thread_id: &str) -> Arc<Mutex<()>> {
        self.write_locks
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .entry(thread_id.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    fn payload_path(&self, digest: &str) -> Option<PathBuf> {
        (digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()))
            .then(|| self.payload_dir().join(format!("{digest}.json")))
    }

    pub fn has_journal(&self, thread_id: &str) -> bool {
        let p = self.path_of(thread_id);
        match std::fs::symlink_metadata(&p) {
            Ok(m) => m.file_type().is_file() && !m.file_type().is_symlink(),
            Err(_) => false,
        }
    }

    pub fn delete_thread(&self, thread_id: &str) -> bool {
        let write_lock = self.write_lock(thread_id);
        let _write = write_lock.lock().unwrap_or_else(|error| error.into_inner());
        // Hygiène mémoire : sequence_counters grossit sans borne sinon
        // (un fil supprimé n'écrit plus jamais, mais son entrée restait) —
        // revue finale 2026-08-28.
        self.sequence_counters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(thread_id);
        let p = self.path_of(thread_id);
        match std::fs::remove_file(&p) {
            Ok(()) => true,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => false,
            Err(_) => false,
        }
    }

    /// Parse journal text: header, events, apply tombstones (Node parseJournalText).
    pub fn parse(text: &str) -> (Option<Value>, Vec<Value>) {
        let mut header = None;
        let mut events = Vec::new();
        if text.is_empty() {
            return (header, events);
        }
        let complete = text.ends_with('\n');
        let mut lines: Vec<&str> = text.split('\n').collect();
        if lines.last() == Some(&"") {
            lines.pop();
        }
        for (i, raw) in lines.iter().enumerate() {
            if raw.trim().is_empty() {
                continue;
            }
            let obj: Value = match serde_json::from_str(raw) {
                Ok(v) => v,
                Err(_) => continue, // truncated / corrupt
            };
            if i == 0
                && obj.get("kind").is_none()
                && obj.get("tombstone") != Some(&Value::Bool(true))
                && obj.get("legacySeed") != Some(&Value::Bool(true))
            {
                header = Some(obj);
                continue;
            }
            if obj.get("legacySeed") == Some(&Value::Bool(true)) {
                continue;
            }
            if obj.get("tombstone") == Some(&Value::Bool(true)) {
                let from = obj
                    .get("fromEventId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let cutoff = events.iter().find_map(|e| {
                    let eid = e
                        .pointer("/meta/eventId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if eid == from {
                        e.pointer("/meta/sequence").and_then(|v| v.as_i64())
                    } else {
                        None
                    }
                });
                if let Some(cutoff) = cutoff {
                    events.retain(|e| {
                        e.pointer("/meta/sequence")
                            .and_then(|v| v.as_i64())
                            .map(|s| s < cutoff)
                            .unwrap_or(true)
                    });
                }
                continue;
            }
            if obj.get("kind").and_then(|v| v.as_str()).is_none()
                || obj.get("meta").is_none()
                || obj
                    .pointer("/meta/sequence")
                    .and_then(|v| v.as_i64())
                    .is_none()
            {
                continue;
            }
            // skip incomplete last line marker already handled
            let _ = complete;
            events.push(obj);
        }
        (header, events)
    }

    fn read_thread(&self, thread_id: &str) -> (Option<Value>, Vec<Value>) {
        let p = self.path_of(thread_id);
        let Ok(text) = std::fs::read_to_string(p) else {
            return (None, Vec::new());
        };
        let (header, events) = Self::parse(&text);
        let events = events
            .into_iter()
            .map(|event| self.resolve_payload(event))
            .collect();
        (header, events)
    }

    fn payload_fault(reference: &Value, code: &str, detail: impl fmt::Display) -> Value {
        let id = reference
            .pointer("/meta/eventId")
            .and_then(Value::as_str)
            .map(|event_id| format!("journal-payload-{event_id}"))
            .unwrap_or_else(|| "journal-payload-fault".to_string());
        json!({
            "kind": "activity",
            "id": id,
            "name": "journal",
            "status": "failed",
            "title": format!("Historique Atelier incomplet: payload {code} ({detail})"),
            "storageFault": {"code": code, "detail": detail.to_string()},
            "meta": reference.get("meta").cloned().unwrap_or_else(|| json!({})),
        })
    }

    fn resolve_payload(&self, reference: Value) -> Value {
        if reference.get("kind").and_then(Value::as_str) != Some(PAYLOAD_REF_KIND) {
            return reference;
        }
        let Some(payload_ref) = reference.get("payloadRef") else {
            return Self::payload_fault(&reference, "reference_invalide", "payloadRef absent");
        };
        let Some(digest) = payload_ref.get("sha256").and_then(Value::as_str) else {
            return Self::payload_fault(&reference, "reference_invalide", "sha256 absent");
        };
        let Some(expected_len) = payload_ref.get("bytes").and_then(Value::as_u64) else {
            return Self::payload_fault(&reference, "reference_invalide", "taille absente");
        };
        if expected_len > MAX_PAYLOAD_BYTES {
            return Self::payload_fault(&reference, "payload_trop_grand", expected_len);
        }
        let Some(path) = self.payload_path(digest) else {
            return Self::payload_fault(&reference, "reference_invalide", "identité non hexadécimale");
        };
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.file_type().is_file() && !metadata.file_type().is_symlink() => metadata,
            Ok(_) => return Self::payload_fault(&reference, "payload_invalide", "type de fichier refusé"),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Self::payload_fault(&reference, "payload_absent", digest)
            }
            Err(error) => return Self::payload_fault(&reference, "lecture_impossible", error),
        };
        if metadata.len() != expected_len || metadata.len() > MAX_PAYLOAD_BYTES {
            return Self::payload_fault(
                &reference,
                "taille_invalide",
                format!("attendu {expected_len}, trouvé {}", metadata.len()),
            );
        }
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(error) => return Self::payload_fault(&reference, "lecture_impossible", error),
        };
        let actual = hex::encode(Sha256::digest(&bytes));
        if actual != digest {
            return Self::payload_fault(&reference, "integrite_invalide", digest);
        }
        let mut event: Value = match serde_json::from_slice(&bytes) {
            Ok(event) => event,
            Err(error) => return Self::payload_fault(&reference, "json_invalide", error),
        };
        // Forks keep their own thread/sequence identity in the bounded journal
        // line while the immutable payload body can remain content-addressed.
        if let Some(meta) = reference.get("meta") {
            if let Some(object) = event.as_object_mut() {
                object.insert("meta".into(), meta.clone());
            }
        }
        event
    }

    fn ensure_payload(&self, bytes: &[u8]) -> Result<Value, JournalError> {
        if bytes.len() as u64 > MAX_PAYLOAD_BYTES {
            return Err(JournalError::new("payload", format!("{} octets excèdent la limite de {MAX_PAYLOAD_BYTES}", bytes.len())));
        }
        let digest = hex::encode(Sha256::digest(bytes));
        let path = self.payload_path(&digest).expect("empreinte SHA-256 valide");
        std::fs::create_dir_all(self.payload_dir())
            .map_err(|error| JournalError::new("création du répertoire payloads", error))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(self.payload_dir(), std::fs::Permissions::from_mode(0o700))
                .map_err(|error| JournalError::new("permissions du répertoire payloads", error))?;
        }
        let valid_existing = std::fs::symlink_metadata(&path).ok().is_some_and(|metadata| {
            metadata.file_type().is_file()
                && !metadata.file_type().is_symlink()
                && metadata.len() == bytes.len() as u64
                && std::fs::read(&path).ok().is_some_and(|stored| stored == bytes)
        });
        if !valid_existing {
            crate::write_file_atomic_durable(&path, bytes)
                .map_err(|error| JournalError::new("écriture durable du payload", error))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
                    .map_err(|error| JournalError::new("permissions du payload", error))?;
            }
        }
        Ok(json!({"version": 1, "sha256": digest, "bytes": bytes.len()}))
    }

    fn encoded_line(&self, event: &Value) -> Result<String, JournalError> {
        let bytes = serde_json::to_vec(event)
            .map_err(|error| JournalError::new("sérialisation de l'événement", error))?;
        if bytes.len() <= MAX_INLINE_BYTES {
            return String::from_utf8(bytes)
                .map_err(|error| JournalError::new("encodage de l'événement", error));
        }
        if bytes.len() as u64 > MAX_PAYLOAD_BYTES {
            return Err(JournalError::new(
                "externalisation du payload",
                format!(
                    "événement trop volumineux: {} octets (maximum {MAX_PAYLOAD_BYTES})",
                    bytes.len()
                ),
            ));
        }
        let payload_ref = self.ensure_payload(&bytes)?;
        let reference = serde_json::to_string(&json!({
            "kind": PAYLOAD_REF_KIND,
            "payloadRef": payload_ref,
            "meta": event.get("meta").cloned().unwrap_or_else(|| json!({})),
        }))
        .map_err(|error| JournalError::new("sérialisation de la référence payload", error))?;
        if reference.len() > MAX_INLINE_BYTES {
            return Err(JournalError::new(
                "référence payload",
                format!("métadonnées trop volumineuses: {} octets", reference.len()),
            ));
        }
        Ok(reference)
    }

    fn repair_incomplete_tail(path: &Path) -> Result<(), JournalError> {
        let metadata = std::fs::metadata(path)
            .map_err(|error| JournalError::new("inspection du journal", error))?;
        if metadata.len() == 0 {
            return Err(JournalError::new("inspection du journal", "fichier vide sans en-tête"));
        }
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .map_err(|error| JournalError::new("ouverture du journal", error))?;
        file.seek(SeekFrom::End(-1))
            .map_err(|error| JournalError::new("inspection de la queue", error))?;
        let mut last = [0_u8; 1];
        file.read_exact(&mut last)
            .map_err(|error| JournalError::new("inspection de la queue", error))?;
        if last[0] == b'\n' {
            return Ok(());
        }
        let inspected = std::cmp::min(metadata.len(), (MAX_INLINE_BYTES + 1) as u64) as usize;
        let start = metadata.len() - inspected as u64;
        file.seek(SeekFrom::Start(start))
            .map_err(|error| JournalError::new("inspection de la queue", error))?;
        let mut tail = vec![0_u8; inspected];
        file.read_exact(&mut tail)
            .map_err(|error| JournalError::new("inspection de la queue", error))?;
        let Some(newline) = tail.iter().rposition(|byte| *byte == b'\n') else {
            return Err(JournalError::new(
                "réparation du journal",
                "queue tronquée trop longue ou en-tête incomplet",
            ));
        };
        let final_line = &tail[newline + 1..];
        if serde_json::from_slice::<Value>(final_line).is_ok() {
            use std::io::Write as _;
            file.seek(SeekFrom::End(0))
                .and_then(|_| file.write_all(b"\n"))
                .and_then(|_| file.sync_data())
                .map_err(|error| JournalError::new("finalisation durable de la queue", error))?;
            return Ok(());
        }
        file.set_len(start + newline as u64 + 1)
            .and_then(|_| file.sync_data())
            .map_err(|error| JournalError::new("réparation durable de la queue", error))
    }

    /// Largest journaled sequence (0 if empty) — harness resume.
    pub fn last_sequence(&self, thread_id: &str) -> u64 {
        let (_, events) = self.read_thread(thread_id);
        events
            .iter()
            .filter(|event| {
                !EPHEMERAL.contains(&event.get("kind").and_then(Value::as_str).unwrap_or(""))
            })
            .filter_map(|e| e.pointer("/meta/sequence").and_then(|v| v.as_u64()))
            .max()
            .unwrap_or(0)
    }

    /// Materialized events, durable head and journal identity from one file
    /// read.  Returning these together avoids announcing a cursor for an
    /// append that raced between two independent reads.
    pub fn durable_snapshot(
        &self,
        thread_id: &str,
    ) -> (Vec<Value>, u64, Option<String>, Option<String>) {
        let (header, events) = self.read_thread(thread_id);
        let mut durable = events;
        durable.retain(|event| {
            !EPHEMERAL.contains(&event.get("kind").and_then(Value::as_str).unwrap_or(""))
        });
        durable.sort_by_key(|event| {
            event
                .pointer("/meta/sequence")
                .and_then(Value::as_u64)
                .unwrap_or(0)
        });
        let head = durable
            .iter()
            .filter_map(|event| event.pointer("/meta/sequence").and_then(Value::as_u64))
            .max()
            .unwrap_or(0);
        let head_event_id = durable
            .iter()
            .rev()
            .find(|event| {
                event.pointer("/meta/sequence").and_then(Value::as_u64) == Some(head)
            })
            .and_then(|event| event.pointer("/meta/eventId"))
            .and_then(Value::as_str)
            .map(str::to_string);
        let epoch = header
            .as_ref()
            .and_then(|value| value.get("journalEpoch"))
            .and_then(Value::as_str)
            .map(str::to_string);
        (Self::materialize_events(durable), head, epoch, head_event_id)
    }

    /// Stable identity of this journal file.  A cursor from a deleted and
    /// recreated thread must never be interpreted as a cursor into the new
    /// history, so the epoch lives in the journal header rather than in a
    /// process-only counter.
    pub fn journal_epoch(&self, thread_id: &str) -> Option<String> {
        self.read_thread(thread_id).0.and_then(|header| {
            header
                .get("journalEpoch")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
    }

    /// Return actual journaled events after a durable cursor.  Sequence
    /// numbers are allocated for ephemeral stream events too, so a cursor is
    /// valid only when its sequence/event identity exists in the durable file;
    /// the returned list itself is selected by `sequence > cursor`, without
    /// ever requiring contiguous sequence numbers.
    pub fn replay_after(
        &self,
        thread_id: &str,
        cursor_sequence: u64,
        cursor_event_id: Option<&str>,
        limit: usize,
    ) -> Option<(Vec<Value>, u64)> {
        if !self.has_journal(thread_id) || limit == 0 {
            return None;
        }
        let (_, mut events) = self.read_thread(thread_id);
        events.retain(|event| {
            !EPHEMERAL.contains(&event.get("kind").and_then(Value::as_str).unwrap_or(""))
        });
        if events.windows(2).any(|pair| {
            let left = pair[0].pointer("/meta/sequence").and_then(Value::as_u64).unwrap_or(0);
            let right = pair[1].pointer("/meta/sequence").and_then(Value::as_u64).unwrap_or(0);
            right < left
        }) {
            // Concurrent writers can reserve sequences before taking the file
            // lock. A delta cursor over a physically out-of-order journal can
            // omit a late lower sequence, so force the caller's snapshot path.
            return None;
        }
        events.sort_by_key(|event| {
            event
                .pointer("/meta/sequence")
                .and_then(Value::as_u64)
                .unwrap_or(0)
        });
        let head = events
            .iter()
            .filter_map(|event| event.pointer("/meta/sequence").and_then(Value::as_u64))
            .max()
            .unwrap_or(0);
        if cursor_sequence > head {
            return None;
        }
        if cursor_sequence > 0 {
            let cursor_found = events.iter().any(|event| {
                event.pointer("/meta/sequence").and_then(Value::as_u64) == Some(cursor_sequence)
                    && cursor_event_id.map_or(true, |expected| {
                        event.pointer("/meta/eventId").and_then(Value::as_str) == Some(expected)
                    })
            });
            if !cursor_found {
                // The durable event may have been truncated/deleted.  A
                // missing durable identity is a safe snapshot fallback; a
                // numeric gap caused by ephemeral events is accepted only
                // when the durable cursor itself is present.
                return None;
            }
        }
        let after = events
            .into_iter()
            .filter(|event| {
                event
                    .pointer("/meta/sequence")
                    .and_then(Value::as_u64)
                    .is_some_and(|sequence| sequence > cursor_sequence)
            })
            .collect::<Vec<_>>();
        if after.len() > limit {
            return None;
        }
        Some((after, head))
    }

    /// Prochaine séquence à écrire pour `thread_id`, allouée de façon
    /// atomique. Remplace le pattern racé `last_sequence(id) + 1` : trois
    /// écrivains concurrents (mirror des fils liés, boîte aux lettres agent,
    /// @mentions) pouvaient chacun lire le même `last_sequence` avant que
    /// l'un d'eux n'ait écrit, obtenant la même valeur (course vécue, revue
    /// finale 2026-08-28). Le compteur est initialisé paresseusement depuis
    /// le fichier (UNE seule lecture disque par thread_id), puis incrémenté
    /// sous verrou — section critique courte, aucun await sous le lock.
    ///
    /// `decorate()` (atelier-harness/src/thread.rs) appelle désormais cette
    /// fonction à CHAQUE delta de streaming, pas seulement au démarrage d'un
    /// fil : la première version faisait le parse paresseux du fichier
    /// (`last_sequence`, coûteux) SOUS le verrou global, ce qui bloquait les
    /// écrivains de TOUS les autres thread_id pendant la lecture disque d'un
    /// seul fil (revue finale 2026-08-28). Ici, le fast path (compteur déjà
    /// connu) reste sous verrou court sans I/O ; seule la première allocation
    /// d'un thread_id lit le disque, et ce hors verrou. Deux racers peuvent
    /// alors calculer `computed` en même temps avant qu'aucun n'ait pris le
    /// verrou : le max()+incrément sous verrou reste correct dans tous les
    /// cas — que la course vienne de deux lectures disque concurrentes ou
    /// d'un fast path croisant une init tardive, chaque entrée dans la
    /// section critique repart du dernier compteur connu, jamais d'une
    /// valeur périmée, donc les séquences restent denses et uniques.
    pub fn next_sequence(&self, thread_id: &str) -> u64 {
        // Fast path : compteur déjà initialisé pour ce fil, aucune lecture
        // disque — c'est le chemin emprunté à chaque delta après la
        // première allocation.
        {
            let mut counters = self.sequence_counters.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(seq) = counters.get_mut(thread_id) {
                *seq += 1;
                return *seq;
            }
        }
        // Lent, une seule fois par thread_id : le parse du journal se fait
        // HORS verrou pour ne pas bloquer les écrivains des autres fils.
        let computed = self.last_sequence(thread_id);
        let mut counters = self.sequence_counters.lock().unwrap_or_else(|e| e.into_inner());
        let seq = counters.entry(thread_id.to_string()).or_insert(0);
        *seq = (*seq).max(computed);
        *seq += 1;
        *seq
    }

    /// Semantic replay — Node `materialize`.
    pub fn materialize(&self, thread_id: &str) -> Vec<Value> {
        let (_, events) = self.read_thread(thread_id);
        Self::materialize_events(events)
    }

    fn materialize_events(mut sorted: Vec<Value>) -> Vec<Value> {
        sorted.sort_by_key(|e| {
            e.pointer("/meta/sequence")
                .and_then(|v| v.as_i64())
                .unwrap_or(0)
        });
        let mut seen = HashSet::new();
        let mut out: Vec<Option<Value>> = Vec::new();
        let mut slots: HashMap<String, usize> = HashMap::new();
        for e in sorted {
            let kind = e.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            if let Some(id) = e.pointer("/meta/eventId").and_then(|v| v.as_str()) {
                if !seen.insert(id.to_string()) {
                    continue;
                }
            }
            if EPHEMERAL.contains(&kind) {
                continue;
            }
            if ITEM_COMPACT.contains(&kind) {
                let turn = e
                    .pointer("/meta/turnId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let item = (kind == "activity")
                    .then(|| e.get("id"))
                    .flatten()
                    .or_else(|| e.pointer("/meta/itemId"))
                    .or_else(|| e.pointer("/meta/eventId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let key = format!("item:{turn}:{item}");
                if let Some(&idx) = slots.get(&key) {
                    out[idx] = Some(e);
                } else {
                    slots.insert(key, out.len());
                    out.push(Some(e));
                }
                continue;
            }
            if kind == "interaction" {
                let rid = e
                    .get("requestId")
                    .or_else(|| e.pointer("/meta/itemId"))
                    .or_else(|| e.pointer("/meta/eventId"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let key = format!("interaction:{rid}");
                if let Some(&idx) = slots.get(&key) {
                    out[idx] = Some(e);
                } else {
                    slots.insert(key, out.len());
                    out.push(Some(e));
                }
                continue;
            }
            if SINGLETON.contains(&kind) {
                let key = format!("single:{kind}");
                if let Some(&idx) = slots.get(&key) {
                    out[idx] = None;
                }
                slots.insert(key, out.len());
                out.push(Some(e));
                continue;
            }
            out.push(Some(e));
        }
        out.into_iter().flatten().collect()
    }

    /// Tombstone truncate (Node `truncateFrom`) — non-destructive.
    pub fn truncate_from(&self, thread_id: &str, event_id: &str) -> bool {
        let write_lock = self.write_lock(thread_id);
        let _write = write_lock.lock().unwrap_or_else(|error| error.into_inner());
        if event_id.is_empty() || !self.has_journal(thread_id) {
            return false;
        }
        let (_, events) = self.read_thread(thread_id);
        let found = events.iter().any(|e| {
            e.pointer("/meta/eventId")
                .and_then(|v| v.as_str())
                .map(|s| s == event_id)
                .unwrap_or(false)
        });
        if !found {
            return false;
        }
        let path = self.path_of(thread_id);
        if Self::repair_incomplete_tail(&path).is_err() {
            return false;
        }
        let line = json!({
            "tombstone": true,
            "fromEventId": event_id,
            "ts": crate::iso_now(),
        });
        let Ok(s) = serde_json::to_string(&line) else {
            return false;
        };
        use std::io::Write;
        let mut f = match std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            Ok(f) => f,
            Err(_) => return false,
        };
        f.write_all(s.as_bytes()).is_ok()
            && f.write_all(b"\n").is_ok()
            && f.sync_data().is_ok()
    }

    /// Fork journal into a new thread file (Node `copyThread`).
    pub fn copy_thread(
        &self,
        src_thread_id: &str,
        dst_thread_id: &str,
        upto_event_id: Option<&str>,
    ) -> bool {
        if src_thread_id.is_empty()
            || dst_thread_id.is_empty()
            || Self::hash_of(src_thread_id) == Self::hash_of(dst_thread_id)
        {
            return false;
        }
        let source_lock = self.write_lock(src_thread_id);
        let destination_lock = self.write_lock(dst_thread_id);
        let (first_lock, second_lock) = if src_thread_id < dst_thread_id {
            (&source_lock, &destination_lock)
        } else {
            (&destination_lock, &source_lock)
        };
        let _first = first_lock.lock().unwrap_or_else(|error| error.into_inner());
        let _second = second_lock.lock().unwrap_or_else(|error| error.into_inner());
        if !self.has_journal(src_thread_id) || self.has_journal(dst_thread_id) {
            return false;
        }
        let (header, events) = self.read_thread(src_thread_id);
        let slice: Vec<Value> = if let Some(upto) = upto_event_id {
            let Some(target_seq) = events.iter().find_map(|e| {
                let eid = e.pointer("/meta/eventId").and_then(|v| v.as_str())?;
                if eid == upto {
                    e.pointer("/meta/sequence").and_then(|v| v.as_i64())
                } else {
                    None
                }
            }) else {
                return false;
            };
            events
                .into_iter()
                .filter(|e| {
                    e.pointer("/meta/sequence")
                        .and_then(|v| v.as_i64())
                        .map(|s| s <= target_seq)
                        .unwrap_or(true)
                })
                .collect()
        } else {
            events
        };
        let provider = header
            .as_ref()
            .and_then(|h| h.get("provider"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        let mut new_header = json!({
            "schemaVersion": 1,
            "threadId": dst_thread_id,
            "createdAt": crate::iso_now(),
            "provider": provider,
            "journalEpoch": uuid::Uuid::new_v4().to_string(),
            "forkedFrom": src_thread_id,
        });
        if let Some(upto) = upto_event_id {
            new_header
                .as_object_mut()
                .unwrap()
                .insert("forkPoint".into(), json!(upto));
        }
        if std::fs::create_dir_all(&self.dir).is_err() {
            return false;
        }
        let path = self.path_of(dst_thread_id);
        let mut body = String::new();
        body.push_str(&serde_json::to_string(&new_header).unwrap_or_else(|_| "{}".into()));
        body.push('\n');
        for mut e in slice {
            if let Some(meta) = e.get_mut("meta").and_then(|m| m.as_object_mut()) {
                meta.insert("threadId".into(), json!(dst_thread_id));
            }
            let Ok(line) = self.encoded_line(&e) else { return false; };
            body.push_str(&line);
            body.push('\n');
        }
        if crate::write_file_atomic_durable(&path, body).is_err() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
        true
    }

    /// Append-only durable event. The result is the durability acknowledgement:
    /// callers must not expose `meta.durable=true` when it is an error.
    pub fn try_append(&self, event: &Value) -> Result<(), JournalError> {
        let thread_id = event
            .pointer("/meta/threadId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if thread_id.is_empty() {
            return Err(JournalError::new("validation", "threadId absent"));
        }
        if event.pointer("/meta/durable") == Some(&Value::Bool(false)) {
            return Err(JournalError::new("validation", "événement non durable"));
        }
        let write_lock = self.write_lock(thread_id);
        let _write = write_lock.lock().unwrap_or_else(|error| error.into_inner());
        std::fs::create_dir_all(&self.dir)
            .map_err(|error| JournalError::new("création du journal", error))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&self.dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|error| JournalError::new("permissions du journal", error))?;
        }
        let path = self.path_of(thread_id);
        if !path.exists() {
            let provider = event
                .pointer("/meta/provider")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let header = json!({
                "schemaVersion": 1,
                "threadId": thread_id,
                "createdAt": crate::iso_now(),
                "provider": provider,
                "journalEpoch": uuid::Uuid::new_v4().to_string(),
            });
            crate::write_file_atomic_durable(&path, format!("{}\n", header))
                .map_err(|error| JournalError::new("création durable du journal", error))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
                    .map_err(|error| JournalError::new("permissions du fichier journal", error))?;
            }
        } else {
            Self::repair_incomplete_tail(&path)?;
        }
        let line = self.encoded_line(event)?;
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| JournalError::new("ouverture du journal", error))?;
        f.write_all(line.as_bytes())
            .and_then(|_| f.write_all(b"\n"))
            .map_err(|error| JournalError::new("ajout au journal", error))?;
        // The receipt is acknowledged before this method returns to the
        // harness.  Ask the filesystem to persist the append so a process
        // crash cannot acknowledge a line that only lived in the page cache.
        f.sync_data()
            .map_err(|error| JournalError::new("synchronisation du journal", error))
    }

    /// Compatibility wrapper for older auxiliary writers. New durability
    /// boundaries use [`HarnessJournal::try_append`] and surface its error.
    pub fn append(&self, event: &Value) -> bool {
        self.try_append(event).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn ev(kind: &str, seq: i64, event_id: &str) -> Value {
        json!({
            "kind": kind,
            "text": format!("{kind}-{seq}"),
            "meta": {
                "eventId": event_id,
                "sequence": seq,
                "threadId": "t1",
                "turnId": "turn-1",
                "durable": true,
            }
        })
    }

    #[test]
    fn append_materialize_delete() {
        let dir = tempdir().unwrap();
        let j = HarnessJournal::new(dir.path());
        assert!(j.append(&ev("user", 1, "e1")));
        assert!(j.append(&ev("text", 2, "e2")));
        assert!(j.append(&ev("delta", 3, "e3"))); // ephemeral
        let mat = j.materialize("t1");
        assert_eq!(mat.len(), 2);
        assert!(j.has_journal("t1"));
        assert!(j.delete_thread("t1"));
        assert!(!j.has_journal("t1"));
    }

    #[test]
    fn truncate_and_copy() {
        let dir = tempdir().unwrap();
        let j = HarnessJournal::new(dir.path());
        j.append(&ev("user", 1, "e1"));
        j.append(&ev("text", 2, "e2"));
        j.append(&ev("user", 3, "e3"));
        assert!(j.truncate_from("t1", "e3"));
        let mat = j.materialize("t1");
        assert_eq!(mat.len(), 2);
        assert!(j.copy_thread("t1", "t2", Some("e2")));
        let mat2 = j.materialize("t2");
        assert_eq!(mat2.len(), 2);
        assert_eq!(
            mat2[0].pointer("/meta/threadId").and_then(|v| v.as_str()),
            Some("t2")
        );
    }

    #[test]
    fn tool_update_compacts() {
        let dir = tempdir().unwrap();
        let j = HarnessJournal::new(dir.path());
        let mut a = ev("tool_update", 1, "a");
        a.as_object_mut()
            .unwrap()
            .get_mut("meta")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("itemId".into(), json!("tool-1"));
        a.as_object_mut()
            .unwrap()
            .insert("output".into(), json!("partial"));
        let mut b = ev("tool_update", 2, "b");
        b.as_object_mut()
            .unwrap()
            .get_mut("meta")
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert("itemId".into(), json!("tool-1"));
        b.as_object_mut()
            .unwrap()
            .insert("output".into(), json!("final"));
        j.append(&a);
        j.append(&b);
        let mat = j.materialize("t1");
        assert_eq!(mat.len(), 1);
        assert_eq!(mat[0]["output"], "final");
    }

    #[test]
    fn activity_compacts_by_stable_protocol_id() {
        let first = json!({
            "kind":"activity", "id":"codex-supervision", "status":"running",
            "meta":{"threadId":"t1","turnId":"turn","eventId":"a1","sequence":1,"durable":true}
        });
        let completed = json!({
            "kind":"activity", "id":"codex-supervision", "status":"completed",
            "meta":{"threadId":"t1","turnId":"turn","eventId":"a2","sequence":2,"durable":true}
        });
        let materialized = HarnessJournal::materialize_events(vec![first, completed]);
        assert_eq!(materialized.len(), 1);
        assert_eq!(materialized[0]["status"], "completed");
    }

    /// Trois écrivains concurrents (mirror des fils liés, boîte aux lettres
    /// agent, @mentions) faisaient chacun `last_sequence(id) + 1` sans
    /// coordination : deux écritures concurrentes pouvaient obtenir la même
    /// séquence et corrompre l'ordre de `materialize` (revue finale
    /// 2026-08-28). `next_sequence` doit être atomique et dense même sous
    /// contention (std::thread, pas de dépendance tokio ici : la fonction
    /// est synchrone).
    #[test]
    fn next_sequence_is_dense_under_concurrency() {
        let dir = tempdir().unwrap();
        let journal = std::sync::Arc::new(HarnessJournal::new(dir.path()));
        let mut handles = Vec::new();
        for _ in 0..8 {
            let j = journal.clone();
            handles.push(std::thread::spawn(move || {
                (0..50).map(|_| j.next_sequence("t1")).collect::<Vec<u64>>()
            }));
        }
        let mut all: Vec<u64> = Vec::new();
        for h in handles {
            all.extend(h.join().unwrap());
        }
        all.sort_unstable();
        let expected: Vec<u64> = (1..=400).collect();
        assert_eq!(all, expected, "les séquences doivent être uniques et denses");
    }

    /// Base : sur un journal vide, la première allocation vaut 1 (cohérent
    /// avec l'ancien pattern `last_sequence(id) + 1` où `last_sequence`
    /// d'un fil vide vaut 0).
    #[test]
    fn next_sequence_starts_at_one_on_empty_journal() {
        let dir = tempdir().unwrap();
        let j = HarnessJournal::new(dir.path());
        assert_eq!(j.next_sequence("t1"), 1);
        assert_eq!(j.next_sequence("t1"), 2);
    }

    /// L'allocateur s'initialise paresseusement depuis le fichier existant :
    /// s'il y a déjà des événements sur disque (écrits sans passer par
    /// `next_sequence`, p. ex. `copy_thread`), la première allocation
    /// reprend après le dernier `last_sequence` observé.
    #[test]
    fn next_sequence_resumes_from_existing_journal() {
        let dir = tempdir().unwrap();
        let j = HarnessJournal::new(dir.path());
        j.append(&ev("user", 1, "e1"));
        j.append(&ev("text", 2, "e2"));
        assert_eq!(j.last_sequence("t1"), 2);
        assert_eq!(j.next_sequence("t1"), 3);
        assert_eq!(j.next_sequence("t1"), 4);
    }

    #[test]
    fn replay_accepts_ephemeral_sequence_gaps_without_assuming_contiguity() {
        let dir = tempdir().unwrap();
        let j = HarnessJournal::new(dir.path());
        assert!(j.append(&ev("user", 1, "e1")));
        // This sequence was allocated to a delta but the delta is not a
        // durable journal line.  The next durable event may therefore be 3.
        assert!(j.append(&ev("text", 3, "e3")));
        let (events, head) = j.replay_after("t1", 1, Some("e1"), 32).unwrap();
        assert_eq!(head, 3);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["meta"]["sequence"], 3);
        assert!(j.replay_after("t1", 2, None, 32).is_none());
    }

    #[test]
    fn large_unicode_event_survives_reopen_replay_and_fork() {
        let dir = tempdir().unwrap();
        let event = json!({
            "kind":"text",
            "text":"é🧊".repeat(150_000),
            "meta":{"eventId":"large","sequence":1,"threadId":"source","turnId":"turn","durable":true}
        });
        let journal = HarnessJournal::new(dir.path());
        journal.try_append(&event).unwrap();
        let journal_path = journal.path_of("source");
        let journal_text = std::fs::read_to_string(&journal_path).unwrap();
        assert!(journal_text.contains(PAYLOAD_REF_KIND));
        assert!(journal_text.len() < MAX_INLINE_BYTES);

        let reopened = HarnessJournal::new(dir.path());
        assert_eq!(reopened.materialize("source"), vec![event.clone()]);
        let (replay, head) = reopened.replay_after("source", 0, None, 8).unwrap();
        assert_eq!(head, 1);
        assert_eq!(replay, vec![event.clone()]);

        assert!(reopened.copy_thread("source", "fork", None));
        let forked = reopened.materialize("fork");
        assert_eq!(forked.len(), 1);
        assert_eq!(forked[0]["text"], event["text"]);
        assert_eq!(forked[0]["meta"]["threadId"], "fork");
    }

    #[test]
    fn missing_and_corrupt_payloads_are_explicit() {
        for corrupt in [false, true] {
            let dir = tempdir().unwrap();
            let journal = HarnessJournal::new(dir.path());
            let event = json!({
                "kind":"text",
                "text":"x".repeat(MAX_INLINE_BYTES + 100),
                "meta":{"eventId":"large","sequence":1,"threadId":"t1","turnId":"turn","durable":true}
            });
            journal.try_append(&event).unwrap();
            let payload = std::fs::read_dir(journal.payload_dir()).unwrap().next().unwrap().unwrap().path();
            if corrupt {
                std::fs::write(payload, vec![b'z'; serde_json::to_vec(&event).unwrap().len()]).unwrap();
            } else {
                std::fs::remove_file(payload).unwrap();
            }
            let materialized = HarnessJournal::new(dir.path()).materialize("t1");
            assert_eq!(materialized.len(), 1);
            assert_eq!(materialized[0]["kind"], "activity");
            assert_eq!(materialized[0]["status"], "failed");
            let code = materialized[0].pointer("/storageFault/code").and_then(Value::as_str).unwrap();
            assert_eq!(code, if corrupt { "integrite_invalide" } else { "payload_absent" });
        }
    }

    #[test]
    fn concurrent_first_appends_keep_one_header_and_all_lines() {
        let dir = tempdir().unwrap();
        let journal = Arc::new(HarnessJournal::new(dir.path()));
        let mut workers = Vec::new();
        for sequence in 1..=16 {
            let journal = journal.clone();
            workers.push(std::thread::spawn(move || {
                journal.try_append(&ev("text", sequence, &format!("e{sequence}"))).unwrap();
            }));
        }
        for worker in workers { worker.join().unwrap(); }
        let text = std::fs::read_to_string(journal.path_of("t1")).unwrap();
        assert_eq!(text.lines().count(), 17);
        assert_eq!(journal.materialize("t1").len(), 16);
    }

    #[test]
    fn incomplete_tail_is_removed_before_next_durable_append() {
        let dir = tempdir().unwrap();
        let journal = HarnessJournal::new(dir.path());
        journal.try_append(&ev("text", 1, "e1")).unwrap();
        let path = journal.path_of("t1");
        use std::io::Write;
        std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(br#"{"kind":"text"#)
            .unwrap();
        journal.try_append(&ev("text", 2, "e2")).unwrap();
        let materialized = journal.materialize("t1");
        assert_eq!(materialized.len(), 2);
        assert_eq!(materialized[1]["meta"]["eventId"], "e2");
        assert!(std::fs::read_to_string(path).unwrap().ends_with('\n'));
    }

    #[test]
    fn complete_event_without_newline_is_preserved_before_next_append() {
        let dir = tempdir().unwrap();
        let journal = HarnessJournal::new(dir.path());
        journal.try_append(&ev("text", 1, "e1")).unwrap();
        let path = journal.path_of("t1");
        let second = serde_json::to_string(&ev("text", 2, "e2")).unwrap();
        use std::io::Write;
        std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(second.as_bytes())
            .unwrap();
        journal.try_append(&ev("text", 3, "e3")).unwrap();
        let materialized = journal.materialize("t1");
        assert_eq!(materialized.len(), 3);
        assert_eq!(materialized[1]["meta"]["eventId"], "e2");
        assert_eq!(materialized[2]["meta"]["eventId"], "e3");
    }

    #[test]
    fn out_of_order_physical_sequences_force_snapshot_fallback() {
        let dir = tempdir().unwrap();
        let journal = HarnessJournal::new(dir.path());
        journal.try_append(&ev("text", 2, "e2")).unwrap();
        journal.try_append(&ev("text", 1, "e1")).unwrap();
        assert!(journal.replay_after("t1", 2, Some("e2"), 8).is_none());
        let (snapshot, head, _, _) = journal.durable_snapshot("t1");
        assert_eq!(head, 2);
        assert_eq!(snapshot.len(), 2);
    }
}
