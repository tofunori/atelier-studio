//! Durable scheduled tasks — `automations.json`.

use crate::write_file_atomic;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutomationRun {
    pub id: String,
    pub status: String,
    pub thread_id: String,
    pub created_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Automation {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub status: String,
    pub kind: String,
    pub rrule: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_thread_id: Option<String>,
    #[serde(default)]
    pub project_root: String,
    #[serde(default)]
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permission_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(default)]
    pub runs: Vec<AutomationRun>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug)]
pub struct AutomationStore {
    path: PathBuf,
    items: Vec<Automation>,
}

impl AutomationStore {
    pub fn open(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let items = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Vec<Automation>>(&raw).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(valid)
            .collect();
        Self { path, items }
    }

    pub fn list(&self) -> Vec<Automation> {
        let mut items = self.items.clone();
        items.sort_by(|a, b| {
            a.next_run_at
                .unwrap_or(i64::MAX)
                .cmp(&b.next_run_at.unwrap_or(i64::MAX))
                .then_with(|| b.updated_at.cmp(&a.updated_at))
        });
        items
    }

    pub fn get(&self, id: &str) -> Option<&Automation> {
        self.items.iter().find(|item| item.id == id)
    }

    pub fn active_heartbeat_for_thread(&self, thread_id: &str, except_id: Option<&str>) -> bool {
        self.items.iter().any(|item| {
            item.kind == "heartbeat"
                && item.status == "ACTIVE"
                && item.target_thread_id.as_deref() == Some(thread_id)
                && except_id != Some(item.id.as_str())
        })
    }

    pub fn upsert(&mut self, mut item: Automation) -> Result<Automation, String> {
        if !valid(&item) {
            return Err("automatisation invalide".into());
        }
        item.runs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        item.runs.truncate(50);
        if let Some(current) = self.items.iter_mut().find(|current| current.id == item.id) {
            *current = item.clone();
        } else {
            self.items.push(item.clone());
        }
        self.persist().map_err(|error| error.to_string())?;
        Ok(item)
    }

    pub fn delete(&mut self, id: &str) -> Result<bool, String> {
        let before = self.items.len();
        self.items.retain(|item| item.id != id);
        let deleted = before != self.items.len();
        if deleted {
            self.persist().map_err(|error| error.to_string())?;
        }
        Ok(deleted)
    }

    pub fn due(&self, now: i64, limit: usize) -> Vec<Automation> {
        let mut items = self
            .items
            .iter()
            .filter(|item| item.status == "ACTIVE" && item.next_run_at.is_some_and(|at| at <= now))
            .cloned()
            .collect::<Vec<_>>();
        items.sort_by_key(|item| item.next_run_at.unwrap_or(i64::MAX));
        items.truncate(limit);
        items
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn persist(&self) -> std::io::Result<()> {
        let bytes = serde_json::to_vec_pretty(&self.items).unwrap_or_else(|_| b"[]".to_vec());
        write_file_atomic(&self.path, bytes)
    }
}

fn valid(item: &Automation) -> bool {
    !item.id.trim().is_empty()
        && !item.name.trim().is_empty()
        && !item.prompt.trim().is_empty()
        && matches!(item.status.as_str(), "ACTIVE" | "PAUSED")
        && matches!(item.kind.as_str(), "cron" | "heartbeat")
        && !item.rrule.trim().is_empty()
        && (item.kind != "heartbeat"
            || item
                .target_thread_id
                .as_deref()
                .is_some_and(|id| !id.trim().is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn heartbeat(id: &str, thread: &str, status: &str) -> Automation {
        Automation {
            id: id.into(),
            name: "Veille".into(),
            prompt: "Vérifie le travail".into(),
            status: status.into(),
            kind: "heartbeat".into(),
            rrule: "FREQ=MINUTELY;INTERVAL=30".into(),
            target_thread_id: Some(thread.into()),
            project_root: String::new(),
            provider: String::new(),
            model: None,
            effort: None,
            permission_mode: None,
            next_run_at: Some(100),
            last_run_at: None,
            last_error: None,
            runs: Vec::new(),
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn persists_due_and_detects_active_target() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("automations.json");
        let mut store = AutomationStore::open(&path);
        store.upsert(heartbeat("a", "thread-1", "ACTIVE")).unwrap();
        store.upsert(heartbeat("b", "thread-2", "PAUSED")).unwrap();
        assert_eq!(store.due(100, 3)[0].id, "a");
        assert!(store.active_heartbeat_for_thread("thread-1", None));
        assert!(!store.active_heartbeat_for_thread("thread-2", None));
        assert_eq!(AutomationStore::open(path).list().len(), 2);
    }
}
