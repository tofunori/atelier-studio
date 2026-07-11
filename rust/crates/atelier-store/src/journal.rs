//! Harness journal — `harness-history/<sha256(threadId)>.jsonl`
//! (Node `sidecar/harness_journal.mjs` load/materialize/delete/append).

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

const EPHEMERAL: &[&str] = &[
    "delta",
    "thinking_delta",
    "thinking_live",
    "stream_set",
    "streaming",
    "started",
    "heartbeat",
];
const ITEM_COMPACT: &[&str] = &["tool_update", "activity"];
const SINGLETON: &[&str] = &["todos", "goal"];

#[derive(Debug, Clone)]
pub struct HarnessJournal {
    dir: PathBuf,
}
// Clone is intentional: journal is path-based, safe to share across harnesses.

impl HarnessJournal {
    pub fn new(base_dir: impl AsRef<Path>) -> Self {
        Self {
            dir: base_dir.as_ref().join("harness-history"),
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

    pub fn has_journal(&self, thread_id: &str) -> bool {
        let p = self.path_of(thread_id);
        match std::fs::symlink_metadata(&p) {
            Ok(m) => m.file_type().is_file() && !m.file_type().is_symlink(),
            Err(_) => false,
        }
    }

    pub fn delete_thread(&self, thread_id: &str) -> bool {
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
        Self::parse(&text)
    }

    /// Largest journaled sequence (0 if empty) — harness resume.
    pub fn last_sequence(&self, thread_id: &str) -> u64 {
        let (_, events) = self.read_thread(thread_id);
        events
            .iter()
            .filter_map(|e| e.pointer("/meta/sequence").and_then(|v| v.as_u64()))
            .max()
            .unwrap_or(0)
    }

    /// Semantic replay — Node `materialize`.
    pub fn materialize(&self, thread_id: &str) -> Vec<Value> {
        let (_, events) = self.read_thread(thread_id);
        let mut sorted = events;
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
                let item = e
                    .pointer("/meta/itemId")
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
        let line = json!({
            "tombstone": true,
            "fromEventId": event_id,
            "ts": crate::iso_now(),
        });
        let Ok(s) = serde_json::to_string(&line) else {
            return false;
        };
        use std::io::Write;
        let mut f = match std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            Ok(f) => f,
            Err(_) => return false,
        };
        f.write_all(s.as_bytes()).is_ok() && f.write_all(b"\n").is_ok()
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
            "forkedFrom": src_thread_id,
        });
        if let Some(upto) = upto_event_id {
            new_header
                .as_object_mut()
                .unwrap()
                .insert("forkPoint".into(), json!(upto));
        }
        let _ = std::fs::create_dir_all(&self.dir);
        let path = self.path_of(dst_thread_id);
        let mut body = String::new();
        body.push_str(&serde_json::to_string(&new_header).unwrap_or_else(|_| "{}".into()));
        body.push('\n');
        for mut e in slice {
            if let Some(meta) = e.get_mut("meta").and_then(|m| m.as_object_mut()) {
                meta.insert("threadId".into(), json!(dst_thread_id));
            }
            if let Ok(s) = serde_json::to_string(&e) {
                body.push_str(&s);
                body.push('\n');
            }
        }
        if std::fs::write(&path, body).is_err() {
            return false;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
        true
    }

    /// Append-only event (best-effort). Creates header if missing.
    pub fn append(&self, event: &Value) -> bool {
        let thread_id = event
            .pointer("/meta/threadId")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if thread_id.is_empty() {
            return false;
        }
        if event.pointer("/meta/durable") == Some(&Value::Bool(false)) {
            return false;
        }
        let _ = std::fs::create_dir_all(&self.dir);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&self.dir, std::fs::Permissions::from_mode(0o700));
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
            });
            if std::fs::write(&path, format!("{}\n", header)).is_err() {
                return false;
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
            }
        }
        let line = match serde_json::to_string(event) {
            Ok(s) => s,
            Err(_) => return false,
        };
        if line.len() > 512 * 1024 {
            return false;
        }
        use std::io::Write;
        let mut f = match std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            Ok(f) => f,
            Err(_) => return false,
        };
        f.write_all(line.as_bytes()).is_ok() && f.write_all(b"\n").is_ok()
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
}
