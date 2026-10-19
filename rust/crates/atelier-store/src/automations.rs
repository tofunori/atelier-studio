//! Durable scheduled tasks — `automations.json`.

use crate::durable;
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
    /// Entrées que cette version ne sait pas lire : réécrites telles quelles.
    kept: Vec<serde_json::Value>,
    /// `automations.json` présent mais illisible : aucune écriture.
    load_error: Option<String>,
}

impl AutomationStore {
    pub fn open(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        // Une entrée d'une autre version (champ en plus ou en moins) ne fait
        // plus perdre toutes les autres : elle est gardée telle quelle.
        let loaded = durable::load_list(&path, |v| {
            serde_json::from_value::<Automation>(v.clone()).ok().filter(valid)
        });
        let (entries, load_error) = match loaded {
            Ok(entries) => (entries, None),
            Err(error) => (durable::ListEntries::default(), Some(error.to_string())),
        };
        Self {
            path,
            items: entries.items,
            kept: entries.kept,
            load_error,
        }
    }

    /// Pourquoi le magasin refuse d'écrire (fichier illisible), s'il le refuse.
    pub fn load_error(&self) -> Option<&str> {
        self.load_error.as_deref()
    }

    /// Fichier illisible à l'ouverture : on le relit, au cas où il a été
    /// réparé depuis (sans relancer l'app). Encore illisible : l'erreur reste,
    /// et la copie de côté identique est réutilisée. Lisible : le magasin
    /// repart de son contenu et accepte de nouveau les écritures.
    pub fn refresh(&mut self) {
        if self.load_error.is_some() {
            *self = Self::open(self.path.clone());
        }
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
        self.refresh();
        durable::writable(&self.load_error)?;
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
        self.persist()?;
        Ok(item)
    }

    pub fn delete(&mut self, id: &str) -> Result<bool, String> {
        self.refresh();
        durable::writable(&self.load_error)?;
        let before = self.items.len();
        self.items.retain(|item| item.id != id);
        let deleted = before != self.items.len();
        if deleted {
            self.persist()?;
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

    fn persist(&self) -> Result<(), String> {
        durable::writable(&self.load_error)?;
        let list = durable::with_kept(&self.items, &self.kept)?;
        let bytes = serde_json::to_vec_pretty(&list).map_err(|e| e.to_string())?;
        durable::save(&self.path, &bytes).map_err(|e| e.to_string())
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

    #[test]
    fn an_unreadable_file_is_never_rewritten() {
        for (case, raw) in crate::durable::UNREADABLE_LIST_SAMPLES {
            let dir = tempdir().unwrap();
            let path = dir.path().join("automations.json");
            std::fs::write(&path, raw).unwrap();
            let mut store = AutomationStore::open(&path);
            assert!(store.load_error().is_some(), "{case}");
            assert!(store.upsert(heartbeat("a", "thread-1", "ACTIVE")).is_err(), "{case}");
            assert!(store.list().is_empty(), "{case}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), raw, "{case}");
            assert_eq!(crate::durable::corrupt_copies_of(&path, raw.as_bytes()), 1, "{case}");
        }
    }

    #[test]
    fn an_entry_from_another_version_no_longer_drops_the_others() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("automations.json");
        let foreign = serde_json::json!({"id": "z", "name": "Sans prompt"});
        let good = serde_json::to_value(heartbeat("a", "thread-1", "ACTIVE")).unwrap();
        std::fs::write(&path, serde_json::to_vec(&serde_json::json!([good, foreign])).unwrap()).unwrap();
        let mut store = AutomationStore::open(&path);
        assert_eq!(store.list().len(), 1);
        store.upsert(heartbeat("b", "thread-2", "PAUSED")).unwrap();
        let disk: Vec<serde_json::Value> = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(disk.len(), 3);
        assert!(disk.contains(&foreign));
    }
}
