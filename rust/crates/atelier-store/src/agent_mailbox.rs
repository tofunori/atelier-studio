//! Durable inter-agent mailbox (plan 057).

use crate::write_file_atomic;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MailboxMessage {
    pub id: String,
    pub request_id: String,
    pub trace_id: String,
    pub hop: u32,
    pub from_thread_id: String,
    pub to_thread_id: String,
    /// "parent_to_child" | "child_to_parent"
    pub relation: String,
    /// "message" | "report"
    pub kind: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured: Option<Value>,
    /// queued | delivering | delivered | paused | failed
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

#[derive(Debug)]
pub struct AgentMailboxStore {
    file_path: PathBuf,
    /// id → message
    messages: HashMap<String, MailboxMessage>,
    /// pair + request_id → message id (idempotence is scoped to one link)
    by_request: HashMap<String, String>,
}

fn request_key(from: &str, to: &str, request_id: &str) -> String {
    format!("{from}\u{1f}{to}\u{1f}{request_id}")
}

impl AgentMailboxStore {
    pub fn open(file_path: impl Into<PathBuf>) -> Self {
        let file_path = file_path.into();
        let mut messages = HashMap::new();
        let mut by_request = HashMap::new();
        if let Ok(raw) = std::fs::read_to_string(&file_path) {
            if let Ok(Value::Array(arr)) = serde_json::from_str(&raw) {
                for item in arr {
                    if let Ok(m) = serde_json::from_value::<MailboxMessage>(item) {
                        by_request.insert(
                            request_key(&m.from_thread_id, &m.to_thread_id, &m.request_id),
                            m.id.clone(),
                        );
                        messages.insert(m.id.clone(), m);
                    }
                }
            }
        }
        Self {
            file_path,
            messages,
            by_request,
        }
    }

    pub fn path(&self) -> &Path {
        &self.file_path
    }

    pub fn get(&self, id: &str) -> Option<&MailboxMessage> {
        self.messages.get(id)
    }

    pub fn get_by_request(
        &self,
        from: &str,
        to: &str,
        request_id: &str,
    ) -> Option<&MailboxMessage> {
        self.by_request
            .get(&request_key(from, to, request_id))
            .and_then(|id| self.messages.get(id))
    }

    pub fn list_for_link(&self, a: &str, b: &str) -> Vec<MailboxMessage> {
        let mut v: Vec<_> = self
            .messages
            .values()
            .filter(|m| {
                (m.from_thread_id == a && m.to_thread_id == b)
                    || (m.from_thread_id == b && m.to_thread_id == a)
            })
            .cloned()
            .collect();
        v.sort_by(|x, y| x.created_at.cmp(&y.created_at));
        v
    }

    pub fn queued(&self) -> Vec<MailboxMessage> {
        let mut v: Vec<_> = self
            .messages
            .values()
            .filter(|m| m.status == "queued")
            .cloned()
            .collect();
        v.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        v
    }

    pub fn count_queued_for_link(&self, parent: &str, child: &str) -> usize {
        self.messages
            .values()
            .filter(|m| {
                matches!(m.status.as_str(), "queued" | "delivering" | "paused")
                    && ((m.from_thread_id == parent && m.to_thread_id == child)
                        || (m.from_thread_id == child && m.to_thread_id == parent))
            })
            .count()
    }

    /// Insert or return existing message for the same pair + request_id.
    pub fn enqueue(&mut self, msg: MailboxMessage) -> Result<MailboxMessage, String> {
        if let Some(existing) = self
            .get_by_request(&msg.from_thread_id, &msg.to_thread_id, &msg.request_id)
            .cloned()
        {
            return Ok(existing);
        }
        self.by_request.insert(
            request_key(&msg.from_thread_id, &msg.to_thread_id, &msg.request_id),
            msg.id.clone(),
        );
        self.messages.insert(msg.id.clone(), msg.clone());
        self.persist().map_err(|e| e.to_string())?;
        Ok(msg)
    }

    pub fn update_status(
        &mut self,
        id: &str,
        status: &str,
        error_code: Option<String>,
        updated_at: &str,
    ) -> Result<Option<MailboxMessage>, String> {
        let Some(m) = self.messages.get_mut(id) else {
            return Ok(None);
        };
        m.status = status.to_string();
        m.updated_at = updated_at.to_string();
        m.error_code = error_code;
        let out = m.clone();
        self.persist().map_err(|e| e.to_string())?;
        Ok(Some(out))
    }

    pub fn fail_queued_for_threads(
        &mut self,
        thread_ids: &[&str],
        error_code: &str,
        updated_at: &str,
    ) -> Result<usize, String> {
        let mut n = 0;
        for m in self.messages.values_mut() {
            if m.status != "queued" {
                continue;
            }
            if thread_ids.contains(&m.from_thread_id.as_str())
                || thread_ids.contains(&m.to_thread_id.as_str())
            {
                m.status = "failed".into();
                m.error_code = Some(error_code.into());
                m.updated_at = updated_at.into();
                n += 1;
            }
        }
        if n > 0 {
            self.persist().map_err(|e| e.to_string())?;
        }
        Ok(n)
    }

    pub fn fail_pending_for_link(
        &mut self,
        a: &str,
        b: &str,
        error_code: &str,
        updated_at: &str,
    ) -> Result<usize, String> {
        let mut n = 0;
        for m in self.messages.values_mut() {
            if !matches!(m.status.as_str(), "queued" | "delivering" | "paused") {
                continue;
            }
            if (m.from_thread_id == a && m.to_thread_id == b)
                || (m.from_thread_id == b && m.to_thread_id == a)
            {
                m.status = "failed".into();
                m.error_code = Some(error_code.into());
                m.updated_at = updated_at.into();
                n += 1;
            }
        }
        if n > 0 {
            self.persist().map_err(|e| e.to_string())?;
        }
        Ok(n)
    }

    pub fn recover_delivering(&mut self, updated_at: &str) -> Result<usize, String> {
        let mut n = 0;
        for m in self.messages.values_mut() {
            if m.status == "delivering" {
                m.status = "queued".into();
                m.updated_at = updated_at.into();
                m.error_code = None;
                n += 1;
            }
        }
        if n > 0 {
            self.persist().map_err(|e| e.to_string())?;
        }
        Ok(n)
    }

    pub fn resume_link_paused(
        &mut self,
        a: &str,
        b: &str,
        paused_error_code: &str,
        updated_at: &str,
    ) -> Result<usize, String> {
        let mut n = 0;
        for message in self.messages.values_mut() {
            let same_link = (message.from_thread_id == a && message.to_thread_id == b)
                || (message.from_thread_id == b && message.to_thread_id == a);
            if same_link
                && message.status == "paused"
                && message.error_code.as_deref() == Some(paused_error_code)
            {
                message.status = "queued".into();
                message.error_code = None;
                message.updated_at = updated_at.into();
                n += 1;
            }
        }
        if n > 0 {
            self.persist().map_err(|error| error.to_string())?;
        }
        Ok(n)
    }

    fn persist(&self) -> std::io::Result<()> {
        let mut list: Vec<_> = self.messages.values().cloned().collect();
        list.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        let data = serde_json::to_vec_pretty(&list).unwrap_or_else(|_| b"[]".to_vec());
        write_file_atomic(&self.file_path, data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn enqueue_idempotent_and_reload() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mailbox.json");
        let mut store = AgentMailboxStore::open(&path);
        let msg = MailboxMessage {
            id: "m1".into(),
            request_id: "r1".into(),
            trace_id: "t1".into(),
            hop: 0,
            from_thread_id: "a".into(),
            to_thread_id: "b".into(),
            relation: "parent_to_child".into(),
            kind: "message".into(),
            text: "hello".into(),
            structured: None,
            status: "queued".into(),
            created_at: "2026-01-01T00:00:00.000Z".into(),
            updated_at: "2026-01-01T00:00:00.000Z".into(),
            error_code: None,
        };
        store.enqueue(msg.clone()).unwrap();
        let again = store.enqueue(msg.clone()).unwrap();
        assert_eq!(again.id, "m1");
        assert_eq!(store.queued().len(), 1);

        let reloaded = AgentMailboxStore::open(&path);
        assert_eq!(
            reloaded.get_by_request("a", "b", "r1").unwrap().text,
            "hello"
        );
    }

    #[test]
    fn request_id_and_unlink_are_pair_scoped() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mailbox.json");
        let mut store = AgentMailboxStore::open(&path);
        let base = MailboxMessage {
            id: "m1".into(),
            request_id: "same".into(),
            trace_id: "t".into(),
            hop: 0,
            from_thread_id: "parent".into(),
            to_thread_id: "child-1".into(),
            relation: "parent_to_child".into(),
            kind: "message".into(),
            text: "one".into(),
            structured: None,
            status: "queued".into(),
            created_at: "2026-01-01T00:00:00.000Z".into(),
            updated_at: "2026-01-01T00:00:00.000Z".into(),
            error_code: None,
        };
        store.enqueue(base.clone()).unwrap();
        let mut sibling = base.clone();
        sibling.id = "m2".into();
        sibling.to_thread_id = "child-2".into();
        sibling.text = "two".into();
        assert_eq!(store.enqueue(sibling).unwrap().id, "m2");
        assert_eq!(
            store
                .fail_pending_for_link("parent", "child-1", "unlinked", "now")
                .unwrap(),
            1
        );
        assert_eq!(store.get("m1").unwrap().status, "failed");
        assert_eq!(store.get("m2").unwrap().status, "queued");
    }

    #[test]
    fn restart_recovers_inflight_delivery_and_pending_count_includes_paused() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("mailbox.json");
        let mut store = AgentMailboxStore::open(&path);
        let message = MailboxMessage {
            id: "inflight".into(),
            request_id: "request".into(),
            trace_id: "trace".into(),
            hop: 0,
            from_thread_id: "parent".into(),
            to_thread_id: "child".into(),
            relation: "parent_to_child".into(),
            kind: "message".into(),
            text: "work".into(),
            structured: None,
            status: "delivering".into(),
            created_at: "2026-01-01T00:00:00.000Z".into(),
            updated_at: "2026-01-01T00:00:00.000Z".into(),
            error_code: None,
        };
        store.enqueue(message).unwrap();
        assert_eq!(store.count_queued_for_link("parent", "child"), 1);
        assert_eq!(store.recover_delivering("restart").unwrap(), 1);
        assert_eq!(store.get("inflight").unwrap().status, "queued");
        store
            .update_status("inflight", "paused", Some("budget".into()), "later")
            .unwrap();
        assert_eq!(store.count_queued_for_link("parent", "child"), 1);
    }
}
