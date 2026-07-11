use atelier_core::{atomic_write_json, safe_project_path};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{:x}", nanos / 1_000_000, nanos)
}

const MAX_INBOX: usize = 100;
const CLAIM_LEASE_SECONDS: f64 = 300.0;
const CONSUMER_RETENTION_SECONDS: f64 = 604_800.0;
const CONSUMER_ACTIVE_SECONDS: f64 = 180.0;

/// Réplique normalize_agent_notes (Python) : liste de {n, text} bornée à
/// 100 entrées, textes tronqués à 2000 caractères, tout le reste ignoré.
pub fn normalize_notes(value: Option<&Value>) -> Value {
    let Some(list) = value.and_then(Value::as_array) else {
        return json!([]);
    };
    let mut notes = Vec::new();
    for raw in list.iter().take(100) {
        let Some(object) = raw.as_object() else {
            continue;
        };
        let Some(text) = object.get("text").and_then(Value::as_str) else {
            continue;
        };
        notes.push(json!({
            "n": object.get("n").cloned().unwrap_or(Value::Null),
            "text": text.chars().take(2000).collect::<String>(),
        }));
    }
    json!(notes)
}

/// Vue publique d'un événement d'annotation — mêmes clés que le
/// `_public_event` du serveur Python, valeurs nulles omises.
fn public_event(item: &Value) -> Value {
    const ALLOWED: [&str; 24] = [
        "id",
        "ts",
        "type",
        "path",
        "page",
        "selection",
        "comment",
        "notes",
        "original",
        "source",
        "region",
        "anchor",
        "restoredFrom",
        "status",
        "statusAt",
        "destination",
        "destinationLabel",
        "action",
        "batchId",
        "held",
        "claimedBy",
        "claimedAt",
        "result",
        "error",
    ];
    let mut out = serde_json::Map::new();
    for key in ALLOWED {
        if let Some(value) = item.get(key)
            && !value.is_null()
        {
            out.insert(key.to_string(), value.clone());
        }
    }
    Value::Object(out)
}

/// Vue publique d'un consommateur — même contrat que `_public_consumer`
/// (Python) : `online` est calculé (pid vivant ou vu depuis <180 s).
fn public_consumer(item: &Value, now: f64) -> Value {
    let process_online = item
        .get("pid")
        .and_then(Value::as_i64)
        .filter(|pid| *pid > 0)
        .map(|pid| unsafe { libc::kill(pid as libc::pid_t, 0) == 0 })
        .unwrap_or(false);
    let last_seen = item.get("lastSeen").and_then(Value::as_f64).unwrap_or(0.0);
    let online = process_online || last_seen > now - CONSUMER_ACTIVE_SECONDS;
    const ALLOWED: [&str; 9] = [
        "id",
        "label",
        "lastSeen",
        "online",
        "automatic",
        "wakeState",
        "lastWake",
        "lastWakeFinished",
        "wakeError",
    ];
    let mut out = serde_json::Map::new();
    for key in ALLOWED {
        if key == "online" {
            // Python inclut online même à false (False n'est pas None).
            out.insert("online".to_string(), json!(online));
            continue;
        }
        if let Some(value) = item.get(key)
            && !value.is_null()
        {
            out.insert(key.to_string(), value.clone());
        }
    }
    Value::Object(out)
}

fn project_key(root: &Path) -> String {
    let mut digest = Sha256::new();
    digest.update(
        fs::canonicalize(root)
            .unwrap_or_else(|_| root.to_path_buf())
            .to_string_lossy()
            .as_bytes(),
    );
    format!("{:x}", digest.finalize())[..24].to_string()
}

fn paths(root: &Path) -> (PathBuf, PathBuf, PathBuf) {
    let base = env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Library/Application Support/Atelier/agent-inbox");
    let key = project_key(root);
    (
        base.join(format!("{key}.json")),
        base.join(format!("{key}-history.json")),
        base.join(format!("{key}-consumers.json")),
    )
}

#[derive(Debug)]
pub struct AgentStore {
    root: PathBuf,
    inbox_path: PathBuf,
    history_path: PathBuf,
    consumers_path: PathBuf,
    inbox: Vec<Value>,
    history: Vec<Value>,
    consumers: BTreeMap<String, Value>,
}

impl AgentStore {
    pub fn load(root: &Path) -> Self {
        let (inbox_path, history_path, consumers_path) = paths(root);
        let inbox = read_list(&inbox_path);
        let history = read_list(&history_path);
        let consumers = read_object(&consumers_path);
        Self {
            root: root.to_path_buf(),
            inbox_path,
            history_path,
            consumers_path,
            inbox,
            history,
            consumers,
        }
    }

    pub fn status(&self, limit: usize) -> Value {
        // Mêmes vues publiques que le serveur Python : les champs internes
        // (pid, consumer, threadId côté consommateurs) ne sortent jamais.
        let now = now();
        let mut consumers: Vec<Value> = self
            .consumers
            .values()
            .map(|item| public_consumer(item, now))
            .collect();
        consumers.sort_by(|a, b| {
            let key = |v: &Value| v.get("lastSeen").and_then(Value::as_f64).unwrap_or(0.0);
            key(b)
                .partial_cmp(&key(a))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        json!({
            "ok": true,
            "agentHost": "codex",
            "pending": self.inbox.iter().map(public_event).collect::<Vec<_>>(),
            "history": self.history.iter().rev().take(limit).map(public_event).collect::<Vec<_>>(),
            "consumers": consumers,
            "counts": {
                "staged": self.inbox.iter().filter(|item| item.get("status") == Some(&json!("staged"))).count(),
                "queued": self.inbox.iter().filter(|item| item.get("status") != Some(&json!("staged"))).count(),
            }
        })
    }

    #[allow(dead_code)] // used by diagnostic health payloads when re-enabled
    pub fn pending_count(&self) -> usize {
        self.inbox.len()
    }

    /// Résout un chemin d'artefact en chemin relatif projet (ou erreur),
    /// comme le fait chaque handler Python avant d'appeler l'enqueue.
    pub fn resolve_rel(&self, artifact: &str) -> Result<String, String> {
        let full = safe_project_path(&self.root, artifact).map_err(|error| error.to_string())?;
        if !full.is_file() {
            return Err("file not found".to_string());
        }
        Ok(full
            .strip_prefix(&self.root)
            .unwrap_or(&full)
            .to_string_lossy()
            .replace('\\', "/"))
    }

    /// Réplique normalize_agent_delivery (Python) : action ask/apply,
    /// destination validée contre le registre (sinon abandonnée), label
    /// résolu, batchId borné, held tel quel.
    pub fn delivery(
        &self,
        action: Option<&str>,
        direct: bool,
        destination: Option<&str>,
        batch_id: Option<&str>,
        held: bool,
    ) -> serde_json::Map<String, Value> {
        let action = match action {
            Some("ask") => "ask",
            Some("apply") => "apply",
            _ => {
                if direct {
                    "apply"
                } else {
                    "ask"
                }
            }
        };
        let destination: String = destination
            .map(|value| value.trim().chars().take(240).collect())
            .unwrap_or_default();
        let matched = self.consumers.get(&destination);
        let batch_id: String = batch_id
            .map(|value| value.trim().chars().take(120).collect())
            .unwrap_or_default();
        let mut delivery = serde_json::Map::new();
        delivery.insert(
            "destination".to_string(),
            if matched.is_some() {
                json!(destination)
            } else {
                Value::Null
            },
        );
        delivery.insert(
            "destinationLabel".to_string(),
            matched
                .and_then(|consumer| consumer.get("label").cloned())
                .unwrap_or(Value::Null),
        );
        delivery.insert("action".to_string(), json!(action));
        delivery.insert(
            "batchId".to_string(),
            if batch_id.is_empty() {
                Value::Null
            } else {
                json!(batch_id)
            },
        );
        delivery.insert("held".to_string(), json!(held));
        delivery
    }

    /// Réplique enqueue_agent_annotation (Python) : le handler fournit le
    /// payload propre à sa route, ici on ajoute id/ts/project/status et on
    /// borne la boîte à 100 annotations.
    pub fn enqueue_event(
        &mut self,
        mut payload: serde_json::Map<String, Value>,
    ) -> Result<Value, String> {
        if self.inbox.len() >= MAX_INBOX {
            return Err("agent inbox is full; acknowledge pending annotations first".to_string());
        }
        let now_ts = now();
        let held = payload
            .get("held")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        payload.insert("id".to_string(), json!(id()));
        payload.insert("ts".to_string(), json!(now_ts));
        payload.insert("project".to_string(), json!(self.root));
        payload.insert(
            "status".to_string(),
            json!(if held { "staged" } else { "queued" }),
        );
        payload.insert("statusAt".to_string(), json!(now_ts));
        let event = Value::Object(payload);
        let event_id = event["id"].as_str().unwrap_or_default().to_string();
        let status = event["status"].as_str().unwrap_or("queued").to_string();
        self.inbox.push(event.clone());
        self.history_update(&event_id, &status, &event);
        self.persist()?;
        Ok(event)
    }

    pub fn register(
        &mut self,
        destination: String,
        consumer: String,
        label: Option<String>,
        thread_id: Option<String>,
        automatic: Option<bool>,
        pid: Option<Value>,
    ) -> Result<Value, String> {
        // Mêmes règles que register_agent_consumer (Python) : fusion avec
        // l'entrée existante, troncatures, purge des consommateurs éphémères.
        let consumer: String = consumer.trim().chars().take(200).collect();
        let destination: String = destination.trim().chars().take(240).collect();
        if consumer.is_empty() || destination.is_empty() {
            return Err("consumer and destination are required".to_string());
        }
        let now = now();
        let current = self
            .consumers
            .get(&destination)
            .cloned()
            .unwrap_or(Value::Null);
        let label: String = label
            .filter(|value| !value.is_empty())
            .or_else(|| {
                current
                    .get("label")
                    .and_then(Value::as_str)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| "Codex task".to_string())
            .chars()
            .take(160)
            .collect();
        let thread_id: Option<String> = thread_id
            .filter(|value| !value.is_empty())
            .or_else(|| {
                current
                    .get("threadId")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .map(|value| value.chars().take(120).collect::<String>())
            .filter(|value| !value.is_empty());
        // Python : int(pid) si chiffres seulement, sinon on conserve l'ancien.
        let pid = pid
            .as_ref()
            .and_then(|value| {
                value.as_i64().filter(|p| *p >= 0).or_else(|| {
                    value
                        .as_str()
                        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
                        .and_then(|s| s.parse::<i64>().ok())
                })
            })
            .map(|p| json!(p))
            .unwrap_or_else(|| current.get("pid").cloned().unwrap_or(Value::Null));
        let automatic = automatic.unwrap_or_else(|| {
            current
                .get("automatic")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        });
        let item = json!({
            "id": destination, "consumer": consumer, "label": label,
            "threadId": thread_id, "pid": pid, "lastSeen": now,
            "automatic": automatic,
        });
        self.consumers.insert(destination, item.clone());
        self.consumers.retain(|_, value| {
            let thread_backed = value
                .get("threadId")
                .and_then(Value::as_str)
                .is_some_and(|s| !s.is_empty());
            let last_seen = value.get("lastSeen").and_then(Value::as_f64).unwrap_or(0.0);
            thread_backed || last_seen > now - CONSUMER_RETENTION_SECONDS
        });
        self.persist()?;
        Ok(item)
    }

    pub fn release(&mut self, ids: &[String], destination: String) -> Result<usize, String> {
        if !self.consumers.contains_key(&destination) {
            return Err("unknown destination".to_string());
        }
        let mut released = Vec::new();
        for item in &mut self.inbox {
            if ids
                .iter()
                .any(|id| item.get("id").and_then(Value::as_str) == Some(id))
                && item.get("claimedBy").is_none()
                && item.get("held").and_then(Value::as_bool).unwrap_or(false)
            {
                item["destination"] = json!(destination);
                item["held"] = json!(false);
                item["status"] = json!("queued");
                item["statusAt"] = json!(now());
                released.push(item.clone());
            }
        }
        for item in &released {
            let id = item["id"].as_str().unwrap_or_default().to_string();
            self.history_update(&id, "queued", item);
        }
        self.persist()?;
        Ok(released.len())
    }

    pub fn delete(&mut self, ids: &[String]) -> Result<usize, String> {
        let before = self.inbox.len();
        let mut deleted = Vec::new();
        self.inbox.retain(|item| {
            let matches = ids
                .iter()
                .any(|id| item.get("id").and_then(Value::as_str) == Some(id))
                && item.get("held").and_then(Value::as_bool).unwrap_or(false)
                && item.get("claimedBy").is_none();
            if matches {
                deleted.push(item.clone());
            }
            !matches
        });
        for item in &deleted {
            let id = item["id"].as_str().unwrap_or_default().to_string();
            self.history_update(&id, "cancelled", item);
        }
        self.persist()?;
        Ok(before - self.inbox.len())
    }

    pub fn restore(&mut self, ids: &[String]) -> Result<usize, String> {
        let mut restored = Vec::new();
        for item in &self.history {
            if ids
                .iter()
                .any(|id| item.get("id").and_then(Value::as_str) == Some(id))
                && item.get("status").and_then(Value::as_str) == Some("cancelled")
            {
                let mut copy = item.clone();
                copy["id"] = json!(id());
                copy["held"] = json!(true);
                copy["status"] = json!("staged");
                copy["statusAt"] = json!(now());
                copy["restoredFrom"] = item["id"].clone();
                if let Some(object) = copy.as_object_mut() {
                    object.remove("claimedBy");
                    object.remove("claimedAt");
                }
                restored.push(copy);
            }
        }
        if self.inbox.len() + restored.len() > MAX_INBOX {
            return Err("agent inbox is full; acknowledge pending annotations first".to_string());
        }
        let count = restored.len();
        self.inbox.extend(restored.clone());
        for item in &restored {
            let id = item["id"].as_str().unwrap_or_default().to_string();
            let status = item["status"].as_str().unwrap_or("staged").to_string();
            self.history_update(&id, &status, item);
        }
        self.persist()?;
        Ok(count)
    }

    pub fn update_status(
        &mut self,
        ids: &[String],
        status: &str,
        result: &str,
        error: &str,
    ) -> Result<usize, String> {
        let allowed = [
            "queued",
            "received",
            "processing",
            "completed",
            "failed",
            "cancelled",
        ];
        if !allowed.contains(&status) {
            return Err("invalid annotation status".to_string());
        }
        let mut changed = 0;
        for item in &mut self.history {
            if ids
                .iter()
                .any(|id| item.get("id").and_then(Value::as_str) == Some(id))
            {
                item["status"] = json!(status);
                item["statusAt"] = json!(now());
                if !result.is_empty() {
                    item["result"] = json!(result.chars().take(2_000).collect::<String>());
                }
                if !error.is_empty() {
                    item["error"] = json!(error.chars().take(2_000).collect::<String>());
                }
                changed += 1;
            }
        }
        for item in &mut self.inbox {
            if ids
                .iter()
                .any(|id| item.get("id").and_then(Value::as_str) == Some(id))
            {
                item["status"] = json!(status);
                item["statusAt"] = json!(now());
                if !result.is_empty() {
                    item["result"] = json!(result.chars().take(2_000).collect::<String>());
                }
                if !error.is_empty() {
                    item["error"] = json!(error.chars().take(2_000).collect::<String>());
                }
            }
        }
        if matches!(status, "completed" | "failed" | "cancelled") {
            self.inbox.retain(|item| {
                !ids.iter()
                    .any(|id| item.get("id").and_then(Value::as_str) == Some(id))
            });
        }
        self.persist()?;
        Ok(changed)
    }

    pub fn claim(&mut self, consumer: &str, destination: &str) -> Result<Vec<Value>, String> {
        // Réplique claim_agent_annotations (Python) : les items staged/held
        // sont ignorés, un bail de 300 s protège le propriétaire, et l'item
        // reste rendu au même consommateur tant que le bail court.
        let now = now();
        let mut changed = false;
        let mut claimed = Vec::new();
        for item in &mut self.inbox {
            if item.get("status").and_then(Value::as_str) == Some("staged")
                || item.get("held").and_then(Value::as_bool).unwrap_or(false)
            {
                continue;
            }
            let target = item
                .get("destination")
                .and_then(Value::as_str)
                .unwrap_or("");
            if !target.is_empty() && target != "auto" && target != destination {
                continue;
            }
            let mut owner = item
                .get("claimedBy")
                .and_then(Value::as_str)
                .map(str::to_string);
            let claimed_at = item
                .get("claimedAt")
                .and_then(Value::as_f64)
                .unwrap_or_default();
            if owner.is_none() || claimed_at < now - CLAIM_LEASE_SECONDS {
                item["claimedBy"] = json!(consumer);
                item["claimedAt"] = json!(now);
                item["status"] = json!("received");
                item["statusAt"] = json!(now);
                owner = Some(consumer.to_string());
                changed = true;
            }
            if owner.as_deref() == Some(consumer) {
                claimed.push(item.clone());
            }
        }
        if changed {
            for item in claimed.clone() {
                let id = item["id"].as_str().unwrap_or_default().to_string();
                self.history_update(&id, "received", &item);
            }
            self.persist()?;
        }
        Ok(claimed)
    }

    pub fn acknowledge(&mut self, ids: &[String], consumer: &str) -> Result<usize, String> {
        let before = self.inbox.len();
        let mut acknowledged = Vec::new();
        self.inbox.retain(|item| {
            let matches = ids
                .iter()
                .any(|id| item.get("id").and_then(Value::as_str) == Some(id))
                && item.get("claimedBy").and_then(Value::as_str) == Some(consumer);
            if matches {
                acknowledged.push(item.clone());
            }
            !matches
        });
        for item in &acknowledged {
            let id = item["id"].as_str().unwrap_or_default().to_string();
            self.history_update(&id, "acknowledged", item);
        }
        self.persist()?;
        Ok(before - self.inbox.len())
    }

    /// Peek inbox without claiming (GET /agent-selection).
    pub fn peek(&self) -> (usize, Option<Value>) {
        let pending = self.inbox.len();
        let latest = self.inbox.last().cloned();
        (pending, latest)
    }

    pub fn set_preferences(
        &mut self,
        destination: &str,
        automatic: Option<bool>,
        label: Option<String>,
    ) -> Result<Value, String> {
        let destination: String = destination.trim().chars().take(240).collect();
        let Some(current) = self.consumers.get_mut(&destination) else {
            return Err("unknown destination".to_string());
        };
        if let Some(auto) = automatic {
            current["automatic"] = json!(auto);
        }
        if let Some(label) = label {
            let clean: String = label.trim().chars().take(160).collect();
            if !clean.is_empty() {
                current["label"] = json!(clean);
            }
        }
        let result = current.clone();
        self.persist()?;
        Ok(result)
    }

    /// Release all held items in a batch (POST /agent-batches/release).
    pub fn release_batch(&mut self, batch_id: &str) -> Result<Vec<Value>, String> {
        let batch_id: String = batch_id.trim().chars().take(120).collect();
        if batch_id.is_empty() {
            return Err("batchId is required".to_string());
        }
        let mut released = Vec::new();
        for item in &mut self.inbox {
            if item.get("batchId").and_then(Value::as_str) == Some(batch_id.as_str())
                && item.get("held").and_then(Value::as_bool).unwrap_or(false)
            {
                item["held"] = json!(false);
                item["status"] = json!("queued");
                item["statusAt"] = json!(now());
                released.push(item.clone());
            }
        }
        for item in &released {
            let id = item["id"].as_str().unwrap_or_default().to_string();
            self.history_update(&id, "queued", item);
        }
        if !released.is_empty() {
            self.persist()?;
        }
        Ok(released)
    }

    /// Cancel held items in a batch (POST /agent-batches/cancel).
    pub fn cancel_batch(&mut self, batch_id: &str) -> Result<Vec<Value>, String> {
        let batch_id: String = batch_id.trim().chars().take(120).collect();
        if batch_id.is_empty() {
            return Err("batchId is required".to_string());
        }
        let mut cancelled = Vec::new();
        self.inbox.retain(|item| {
            let matches = item.get("batchId").and_then(Value::as_str) == Some(batch_id.as_str())
                && item.get("held").and_then(Value::as_bool).unwrap_or(false);
            if matches {
                cancelled.push(item.clone());
            }
            !matches
        });
        for item in &cancelled {
            let id = item["id"].as_str().unwrap_or_default().to_string();
            self.history_update(&id, "cancelled", item);
        }
        if !cancelled.is_empty() {
            self.persist()?;
        }
        Ok(cancelled)
    }

    /// Réplique _history_update_unlocked (Python) : fusionne le snapshot
    /// public de l'événement dans l'entrée d'historique (créée au besoin),
    /// puis fixe status/statusAt. L'historique ne stocke donc que la forme
    /// publique, comme côté Python.
    fn history_update(&mut self, event_id: &str, new_status: &str, snapshot: &Value) {
        let position = self
            .history
            .iter()
            .position(|item| item.get("id").and_then(Value::as_str) == Some(event_id));
        let index = match position {
            Some(index) => index,
            None => {
                self.history
                    .push(json!({"id": event_id, "project": self.root}));
                self.history.len() - 1
            }
        };
        let public = public_event(snapshot);
        if let (Some(entry), Some(extra)) =
            (self.history[index].as_object_mut(), public.as_object())
        {
            for (key, value) in extra {
                entry.insert(key.clone(), value.clone());
            }
            entry.insert("status".to_string(), json!(new_status));
            entry.insert("statusAt".to_string(), json!(now()));
        }
    }

    fn persist(&self) -> Result<(), String> {
        atomic_write_json(&self.inbox_path, &self.inbox).map_err(|error| error.to_string())?;
        atomic_write_json(&self.history_path, &self.history).map_err(|error| error.to_string())?;
        atomic_write_json(&self.consumers_path, &self.consumers)
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

/// Réplique normalize_agent_anchor (Python) : un seul contrat d'anchor
/// portable quel que soit le viewer d'origine.
pub fn normalize_anchor(request: &Value, rel: &str) -> Value {
    fn scalar_capped(value: &Value) -> Option<Value> {
        match value {
            Value::String(text) => Some(json!(text.chars().take(2000).collect::<String>())),
            Value::Number(_) => Some(value.clone()),
            _ => None,
        }
    }
    if let Some(raw) = request.get("anchor").and_then(Value::as_object)
        && let Some(kind) = raw.get("kind").and_then(Value::as_str)
    {
        let mut anchor = serde_json::Map::new();
        anchor.insert(
            "kind".to_string(),
            json!(kind.chars().take(80).collect::<String>()),
        );
        for key in [
            "startLine",
            "endLine",
            "startColumn",
            "endColumn",
            "page",
            "x",
            "y",
            "width",
            "height",
            "selector",
        ] {
            if let Some(value) = raw.get(key).and_then(scalar_capped) {
                anchor.insert(key.to_string(), value);
            }
        }
        return Value::Object(anchor);
    }
    let page = request.get("page");
    let page_text = match page {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    };
    if let Some(rest) = page_text.strip_prefix('L')
        && let Some((start, end)) = rest.split_once('-')
        && start.chars().all(|c| c.is_ascii_digit())
        && end.chars().all(|c| c.is_ascii_digit())
        && let (Ok(start_line), Ok(end_line)) = (start.parse::<i64>(), end.parse::<i64>())
    {
        return json!({"kind": "text-range", "startLine": start_line, "endLine": end_line});
    }
    if let Some(region) = request.get("region").and_then(Value::as_object) {
        let mut anchor = serde_json::Map::new();
        anchor.insert("kind".to_string(), json!("image-region"));
        for key in ["x", "y", "width", "height", "selector"] {
            if let Some(value) = region.get(key).and_then(scalar_capped) {
                anchor.insert(key.to_string(), value);
            }
        }
        if !page_text.is_empty() {
            anchor.insert("page".to_string(), page.cloned().unwrap_or(Value::Null));
            anchor.insert("kind".to_string(), json!("pdf-region"));
        }
        return Value::Object(anchor);
    }
    if !page_text.is_empty() && page_text != "html" {
        let kind = if rel.to_lowercase().ends_with(".pdf") {
            "pdf-page"
        } else {
            "document-location"
        };
        return json!({"kind": kind, "page": page.cloned().unwrap_or(Value::Null)});
    }
    json!({"kind": "artifact"})
}

fn read_list(path: &Path) -> Vec<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn read_object(path: &Path) -> BTreeMap<String, Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}
