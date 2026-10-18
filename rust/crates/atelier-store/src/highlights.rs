//! Highlights store — `highlights.json` (Node `sidecar/highlights.mjs`).

use crate::durable;
use crate::iso_now;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub context: String,
    #[serde(default = "default_kind")]
    pub kind: String,
    #[serde(default)]
    pub project_root: String,
    #[serde(default)]
    pub project_name: String,
    #[serde(default)]
    pub thread_id: String,
    #[serde(default)]
    pub thread_title: String,
    #[serde(default)]
    pub provider: String,
    pub created_at: String,
}

fn default_kind() -> String {
    "hl".into()
}

fn str_field(v: Option<&serde_json::Value>) -> String {
    v.and_then(|x| x.as_str()).unwrap_or("").to_string()
}

fn normalize(raw: &serde_json::Value, id: String, created_at: String) -> Option<Highlight> {
    let text = str_field(raw.get("text")).trim().to_string();
    if text.is_empty() {
        return None;
    }
    let kind = str_field(raw.get("kind"));
    let kind = if kind == "hl" || kind == "ul" {
        kind
    } else {
        "hl".into()
    };
    Some(Highlight {
        id,
        text,
        context: str_field(raw.get("context")),
        kind,
        project_root: str_field(raw.get("projectRoot")),
        project_name: str_field(raw.get("projectName")),
        thread_id: str_field(raw.get("threadId")),
        thread_title: str_field(raw.get("threadTitle")),
        provider: str_field(raw.get("provider")),
        created_at,
    })
}

#[derive(Debug)]
pub struct HighlightStore {
    file_path: PathBuf,
    items: HashMap<String, Highlight>,
    /// Entrées sans id ou sans texte : réécrites telles quelles.
    kept: Vec<serde_json::Value>,
    /// `highlights.json` présent mais illisible : aucune écriture.
    load_error: Option<String>,
}

impl HighlightStore {
    pub fn open(file_path: impl Into<PathBuf>) -> Self {
        let file_path = file_path.into();
        let loaded = durable::load_list(&file_path, |item| {
            let id = item.get("id").and_then(|v| v.as_str())?;
            let created = item
                .get("createdAt")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(iso_now);
            normalize(item, id.to_string(), created)
        });
        let (entries, load_error) = match loaded {
            Ok(entries) => (entries, None),
            Err(error) => (durable::ListEntries::default(), Some(error.to_string())),
        };
        let items = entries
            .items
            .into_iter()
            .map(|h| (h.id.clone(), h))
            .collect();
        Self {
            file_path,
            items,
            kept: entries.kept,
            load_error,
        }
    }

    /// Pourquoi le magasin refuse d'écrire (fichier illisible), s'il le refuse.
    pub fn load_error(&self) -> Option<&str> {
        self.load_error.as_deref()
    }

    pub fn list(&self) -> Vec<Highlight> {
        let mut v: Vec<_> = self.items.values().cloned().collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    pub fn add(&mut self, entry: serde_json::Value) -> Result<Highlight, String> {
        durable::writable(&self.load_error)?;
        let h = normalize(&entry, Uuid::new_v4().to_string(), iso_now())
            .ok_or_else(|| "surlignage invalide (texte requis)".to_string())?;
        self.items.insert(h.id.clone(), h.clone());
        if let Err(error) = self.persist() {
            self.items.remove(&h.id);
            return Err(error);
        }
        Ok(h)
    }

    pub fn remove(&mut self, id: &str) -> Result<bool, String> {
        durable::writable(&self.load_error)?;
        let existed = self.items.remove(id).is_some();
        if existed {
            self.persist()?;
        }
        Ok(existed)
    }

    fn persist(&self) -> Result<(), String> {
        durable::writable(&self.load_error)?;
        let list = durable::with_kept(&self.list(), &self.kept)?;
        let data = serde_json::to_vec_pretty(&list).map_err(|e| e.to_string())?;
        durable::save(&self.file_path, &data).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn add_list_remove() {
        let dir = tempdir().unwrap();
        let mut s = HighlightStore::open(dir.path().join("h.json"));
        s.add(serde_json::json!({"text":"hello","kind":"hl"}))
            .unwrap();
        assert_eq!(s.list().len(), 1);
        let id = s.list()[0].id.clone();
        s.remove(&id).unwrap();
        assert!(s.list().is_empty());
    }

    #[test]
    fn an_unreadable_file_is_never_rewritten() {
        for (case, raw) in crate::durable::UNREADABLE_LIST_SAMPLES {
            let dir = tempdir().unwrap();
            let path = dir.path().join("highlights.json");
            std::fs::write(&path, raw).unwrap();
            let mut s = HighlightStore::open(&path);
            assert!(s.load_error().is_some(), "{case}");
            assert!(s.add(serde_json::json!({"text": "nouveau"})).is_err(), "{case}");
            assert!(s.list().is_empty(), "{case}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), raw, "{case}");
            assert_eq!(crate::durable::corrupt_copies_of(&path, raw.as_bytes()), 1, "{case}");
        }
    }

    #[test]
    fn entries_without_text_survive_a_rewrite() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("highlights.json");
        std::fs::write(&path, r#"[{"id": "old", "image": "x.png"}]"#).unwrap();
        let mut s = HighlightStore::open(&path);
        s.add(serde_json::json!({"text": "hello"})).unwrap();
        let disk: Vec<serde_json::Value> = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(disk.len(), 2);
        assert!(disk.contains(&serde_json::json!({"id": "old", "image": "x.png"})));
    }
}
