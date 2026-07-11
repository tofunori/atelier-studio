//! Highlights store — `highlights.json` (Node `sidecar/highlights.mjs`).

use crate::{iso_now, write_file_atomic};
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
}

impl HighlightStore {
    pub fn open(file_path: impl Into<PathBuf>) -> Self {
        let file_path = file_path.into();
        let mut items = HashMap::new();
        if let Ok(raw) = std::fs::read_to_string(&file_path) {
            if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) {
                for item in arr {
                    if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                        let created = item
                            .get("createdAt")
                            .and_then(|v| v.as_str())
                            .filter(|s| !s.is_empty())
                            .map(str::to_string)
                            .unwrap_or_else(iso_now);
                        if let Some(h) = normalize(&item, id.to_string(), created) {
                            items.insert(h.id.clone(), h);
                        }
                    }
                }
            }
        }
        Self { file_path, items }
    }

    pub fn list(&self) -> Vec<Highlight> {
        let mut v: Vec<_> = self.items.values().cloned().collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    pub fn add(&mut self, entry: serde_json::Value) -> Result<Highlight, String> {
        let h = normalize(&entry, Uuid::new_v4().to_string(), iso_now())
            .ok_or_else(|| "surlignage invalide (texte requis)".to_string())?;
        self.items.insert(h.id.clone(), h.clone());
        self.persist().map_err(|e| e.to_string())?;
        Ok(h)
    }

    pub fn remove(&mut self, id: &str) -> Result<bool, String> {
        let existed = self.items.remove(id).is_some();
        if existed {
            self.persist().map_err(|e| e.to_string())?;
        }
        Ok(existed)
    }

    fn persist(&self) -> std::io::Result<()> {
        let data = serde_json::to_vec_pretty(&self.list()).unwrap_or_else(|_| b"[]".to_vec());
        write_file_atomic(&self.file_path, data)
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
}
