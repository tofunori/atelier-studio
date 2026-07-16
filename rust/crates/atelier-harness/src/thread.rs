//! Per-thread harness serializer.

use crate::kinds::is_durable;
use crate::EmitFn;
use atelier_store::HarnessJournal;
use serde_json::{json, Value};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnStatus {
    Active,
    Queued,
    Done,
}

struct Turn {
    status: TurnStatus,
    terminal: bool,
    native_turn_id: Option<String>,
}

pub struct HarnessThread {
    thread_id: String,
    provider: String,
    emit: EmitFn,
    journal: Option<HarnessJournal>,
    sequence: u64,
    active: Option<String>,
    turns: HashMap<String, Turn>,
    /// Dedup seen eventIds (reconnection safety within process).
    seen_event_ids: std::collections::HashSet<String>,
}

impl HarnessThread {
    pub fn new(
        thread_id: impl Into<String>,
        provider: impl Into<String>,
        emit: EmitFn,
        journal: Option<HarnessJournal>,
        initial_sequence: u64,
    ) -> Self {
        Self {
            thread_id: thread_id.into(),
            provider: provider.into(),
            emit,
            journal,
            sequence: initial_sequence,
            active: None,
            turns: HashMap::new(),
            seen_event_ids: std::collections::HashSet::new(),
        }
    }

    pub fn thread_id(&self) -> &str {
        &self.thread_id
    }

    pub fn provider(&self) -> &str {
        &self.provider
    }

    pub fn set_provider(&mut self, p: &str) {
        if !p.is_empty() {
            self.provider = p.to_string();
        }
    }

    pub fn active_turn_id(&self) -> Option<&str> {
        self.active.as_deref()
    }

    pub fn turn_status(&self, turn_id: &str) -> Option<TurnStatus> {
        self.turns.get(turn_id).map(|t| t.status.clone())
    }

    fn decorate(
        &mut self,
        mut event: Value,
        turn_id: &str,
        message_id: Option<&str>,
        item_id: Option<&str>,
        origin: &str,
        durable_override: Option<bool>,
    ) -> Value {
        let kind = event
            .get("kind")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        self.sequence += 1;
        let event_id = Uuid::new_v4().to_string();
        let native = self
            .turns
            .get(turn_id)
            .and_then(|t| t.native_turn_id.clone());
        let durable = durable_override.unwrap_or_else(|| is_durable(&kind));
        let mut meta = json!({
            "schemaVersion": 1,
            "eventId": event_id,
            "provider": self.provider,
            "threadId": self.thread_id,
            "turnId": turn_id,
            "sequence": self.sequence,
            "ts": now_ms(),
            "durable": durable,
            "origin": origin,
        });
        if let Some(mid) = message_id {
            meta.as_object_mut()
                .unwrap()
                .insert("messageId".into(), json!(mid));
        }
        if let Some(iid) = item_id {
            meta.as_object_mut()
                .unwrap()
                .insert("itemId".into(), json!(iid));
        }
        if let Some(nt) = native {
            meta.as_object_mut()
                .unwrap()
                .insert("nativeTurnId".into(), json!(nt));
        }
        if let Some(obj) = event.as_object_mut() {
            obj.insert("meta".into(), meta);
        }
        event
    }

    fn dispatch(&mut self, out: Value) {
        // Dedup by eventId (ignore duplicates)
        if let Some(eid) = out.pointer("/meta/eventId").and_then(|v| v.as_str()) {
            if !self.seen_event_ids.insert(eid.to_string()) {
                return;
            }
        }
        let durable = out
            .pointer("/meta/durable")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        // Journal BEFORE UI acknowledgement (plan 033 Porte 5).
        if durable {
            if let Some(j) = &self.journal {
                let _ = j.append(&out);
            }
        }
        (self.emit)(out);
    }

    pub fn start_turn(
        &mut self,
        turn_id: Option<&str>,
        message_id: Option<&str>,
        user_event: Option<Value>,
    ) -> String {
        let id = turn_id
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        self.turns.insert(
            id.clone(),
            Turn {
                status: TurnStatus::Active,
                terminal: false,
                native_turn_id: None,
            },
        );
        self.active = Some(id.clone());
        if let Some(user) = user_event {
            let decorated = self.decorate(user, &id, message_id, None, "atelier", Some(true));
            self.dispatch(decorated);
        }
        id
    }

    pub fn steer(&mut self, message_id: Option<&str>, user_event: Option<Value>) -> Option<String> {
        let id = self.active.clone()?;
        if let Some(user) = user_event {
            let decorated = self.decorate(user, &id, message_id, None, "atelier", Some(true));
            self.dispatch(decorated);
        }
        Some(id)
    }

    pub fn queue(
        &mut self,
        turn_id: Option<&str>,
        message_id: Option<&str>,
        user_event: Option<Value>,
    ) -> String {
        let id = turn_id
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        self.turns.insert(
            id.clone(),
            Turn {
                status: TurnStatus::Queued,
                terminal: false,
                native_turn_id: None,
            },
        );
        if let Some(user) = user_event {
            let decorated = self.decorate(user, &id, message_id, None, "atelier", Some(true));
            self.dispatch(decorated);
        }
        id
    }

    pub fn activate_queued(&mut self, turn_id: &str) -> bool {
        let Some(t) = self.turns.get_mut(turn_id) else {
            return false;
        };
        if t.status != TurnStatus::Queued {
            return false;
        }
        t.status = TurnStatus::Active;
        self.active = Some(turn_id.to_string());
        true
    }

    pub fn emit(&mut self, turn_id: &str, event: Value, item_id: Option<&str>) {
        let decorated = self.decorate(event, turn_id, None, item_id, "provider", None);
        self.dispatch(decorated);
    }

    pub fn emit_global(&mut self, event: Value, origin: &str) {
        let turn_id = self
            .active
            .clone()
            .unwrap_or_else(|| format!("thread:{}", self.thread_id));
        let decorated = self.decorate(event, &turn_id, None, None, origin, Some(true));
        self.dispatch(decorated);
    }

    /// Terminal done/error — exactly one per turn.
    pub fn terminal(&mut self, turn_id: &str, event: Value) -> bool {
        let Some(t) = self.turns.get_mut(turn_id) else {
            return false;
        };
        if t.terminal {
            return false;
        }
        t.terminal = true;
        t.status = TurnStatus::Done;
        if self.active.as_deref() == Some(turn_id) {
            self.active = None;
        }
        let decorated = self.decorate(event, turn_id, None, None, "provider", Some(true));
        self.dispatch(decorated);
        true
    }

    pub fn set_native_turn_id(&mut self, turn_id: &str, native: &str) {
        if let Some(t) = self.turns.get_mut(turn_id) {
            t.native_turn_id = Some(native.to_string());
        }
    }
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use atelier_store::HarnessJournal;
    use serde_json::json;
    use std::sync::{Arc, Mutex as StdMutex};
    use tempfile::tempdir;

    #[test]
    fn sequence_and_journal() {
        let dir = tempdir().unwrap();
        let journal = HarnessJournal::new(dir.path());
        let captured = Arc::new(StdMutex::new(Vec::new()));
        let cap = Arc::clone(&captured);
        let emit: EmitFn = Arc::new(move |e| {
            cap.lock().unwrap().push(e);
        });
        let mut h = HarnessThread::new("t1", "fake", emit, Some(journal.clone()), 0);
        let turn = h.start_turn(None, Some("m1"), Some(json!({"kind":"user","text":"hi"})));
        h.emit(&turn, json!({"kind":"text","text":"hello"}), None);
        assert!(h.terminal(&turn, json!({"kind":"done"})));
        assert!(!h.terminal(&turn, json!({"kind":"done"}))); // duplicate rejected
        let events = captured.lock().unwrap();
        assert_eq!(events.len(), 3);
        assert_eq!(events[0]["meta"]["sequence"], 1);
        assert_eq!(events[2]["meta"]["sequence"], 3);
        let mat = journal.materialize("t1");
        assert_eq!(mat.len(), 3);
    }

    #[test]
    fn ephemeral_not_journaled() {
        let dir = tempdir().unwrap();
        let journal = HarnessJournal::new(dir.path());
        let captured = Arc::new(StdMutex::new(Vec::new()));
        let cap = Arc::clone(&captured);
        let emit: EmitFn = Arc::new(move |e| {
            cap.lock().unwrap().push(e);
        });
        let mut h = HarnessThread::new("t1", "fake", emit, Some(journal.clone()), 0);
        let turn = h.start_turn(None, None, None);
        h.emit(&turn, json!({"kind":"delta","text":"x"}), None);
        h.terminal(&turn, json!({"kind":"done"}));
        let ui = captured.lock().unwrap();
        assert!(ui.iter().any(|e| e["kind"] == "delta"));
        let mat = journal.materialize("t1");
        assert!(!mat.iter().any(|e| e["kind"] == "delta"));
        assert!(mat.iter().any(|e| e["kind"] == "done"));
    }
}
