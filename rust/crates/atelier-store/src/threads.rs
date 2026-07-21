//! Thread list store — `threads.json` (Node `sidecar/store.mjs`).

use crate::{iso_now, write_file_atomic};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const VALID_STATUSES: &[&str] = &["idle", "running", "done"];

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    file_path: PathBuf,
    threads: HashMap<String, Thread>,
}

impl ThreadStore {
    pub fn open(file_path: impl Into<PathBuf>) -> Self {
        let file_path = file_path.into();
        let mut threads = HashMap::new();
        if let Ok(raw) = std::fs::read_to_string(&file_path) {
            if let Ok(Value::Array(arr)) = serde_json::from_str(&raw) {
                for item in arr {
                    if let Some(t) = normalize(item) {
                        threads.insert(t.id.clone(), t);
                    }
                }
            }
        }
        Self { file_path, threads }
    }

    pub fn list(&self) -> Vec<Thread> {
        let mut v: Vec<_> = self.threads.values().cloned().collect();
        v.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        v
    }

    pub fn get(&self, id: &str) -> Option<&Thread> {
        self.threads.get(id)
    }

    pub fn delete(&mut self, id: &str) -> std::io::Result<bool> {
        let existed = self.threads.remove(id).is_some();
        if existed {
            self.persist()?;
        }
        Ok(existed)
    }

    pub fn upsert(&mut self, patch: Value, preserve_updated_at: bool) -> Result<Thread, String> {
        let id = patch
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "thread id manquant".to_string())?
            .to_string();
        let prev = self.threads.get(&id).cloned();
        let mut merged = match prev {
            Some(p) => serde_json::to_value(p).unwrap_or(Value::Object(Default::default())),
            None => Value::Object(Default::default()),
        };
        if let (Some(mo), Some(po)) = (merged.as_object_mut(), patch.as_object()) {
            for (k, v) in po {
                mo.insert(k.clone(), v.clone());
            }
        }
        if preserve_updated_at {
            if let Some(prev_at) = self.threads.get(&id).map(|t| t.updated_at.clone()) {
                if let Some(mo) = merged.as_object_mut() {
                    mo.insert("updatedAt".into(), Value::String(prev_at));
                }
            }
        } else if let Some(mo) = merged.as_object_mut() {
            mo.insert("updatedAt".into(), Value::String(iso_now()));
        }
        let t = normalize(merged).ok_or_else(|| "thread id manquant".to_string())?;
        self.threads.insert(t.id.clone(), t.clone());
        self.persist().map_err(|e| e.to_string())?;
        Ok(t)
    }

    fn persist(&self) -> std::io::Result<()> {
        let list = self.list();
        let data = serde_json::to_vec_pretty(&list).unwrap_or_else(|_| b"[]".to_vec());
        write_file_atomic(&self.file_path, data)
    }

    /// Children of `parent_id` derived from `agent_link.parent_thread_id`.
    pub fn children_of(&self, parent_id: &str) -> Vec<Thread> {
        let mut v: Vec<_> = self
            .threads
            .values()
            .filter(|t| {
                t.agent_link
                    .as_ref()
                    .map(|l| l.parent_thread_id == parent_id)
                    .unwrap_or(false)
            })
            .cloned()
            .collect();
        v.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        v
    }

    /// True if the thread is a parent or child of an active agent link.
    pub fn is_linked(&self, id: &str) -> bool {
        if self
            .threads
            .get(id)
            .and_then(|t| t.agent_link.as_ref())
            .is_some()
        {
            return true;
        }
        !self.children_of(id).is_empty()
    }

    pub fn path(&self) -> &Path {
        &self.file_path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

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
