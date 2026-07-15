//! Zotero library (readonly sqlite copy) — Node `zotero.mjs` core.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static CACHE: Mutex<Option<CacheState>> = Mutex::new(None);

struct CacheState {
    mtime_ms: u128,
    // We re-open on each ensure for simplicity with bundled sqlite
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn zotero_dir() -> PathBuf {
    home().join("Zotero")
}

fn src_db() -> PathBuf {
    zotero_dir().join("zotero.sqlite")
}

fn copy_db(app_dir: &Path) -> PathBuf {
    app_dir.join("zotero-read.sqlite")
}

pub fn available() -> bool {
    src_db().is_file()
}

fn ensure_fresh(app_dir: &Path) -> Result<Connection, String> {
    if !available() {
        return Err("Zotero introuvable (~/Zotero/zotero.sqlite)".into());
    }
    let src = src_db();
    let mtime = std::fs::metadata(&src)
        .map_err(|e| e.to_string())?
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = copy_db(app_dir);
    std::fs::create_dir_all(app_dir).map_err(|e| e.to_string())?;
    let need_copy = {
        let guard = CACHE.lock().map_err(|e| e.to_string())?;
        guard.as_ref().map(|c| c.mtime_ms != mtime).unwrap_or(true)
    };
    if need_copy || !dest.is_file() {
        std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        let wal = PathBuf::from(format!("{}-wal", src.display()));
        if wal.is_file() {
            let _ = std::fs::copy(&wal, format!("{}-wal", dest.display()));
        }
        if let Ok(mut g) = CACHE.lock() {
            *g = Some(CacheState { mtime_ms: mtime });
        }
    }
    Connection::open_with_flags(
        &dest,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| e.to_string())
}

const BASE_SQL: &str = r#"
  SELECT i.itemID, i.key, i.dateAdded,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'title'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS title,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'date'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS rawDate,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'publicationTitle'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS publication,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'DOI'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS doi,
    (SELECT v.value FROM itemData d
       JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'abstractNote'
       JOIN itemDataValues v ON v.valueID = d.valueID
     WHERE d.itemID = i.itemID) AS abstract,
    (SELECT GROUP_CONCAT(c.lastName, ', ') FROM itemCreators ic
       JOIN creators c ON c.creatorID = ic.creatorID
     WHERE ic.itemID = i.itemID) AS creators,
    (SELECT GROUP_CONCAT(t.name, char(31)) FROM itemTags it
       JOIN tags t ON t.tagID = it.tagID WHERE it.itemID = i.itemID) AS tags,
    (SELECT ia.path FROM itemAttachments ia
     WHERE ia.parentItemID = i.itemID AND ia.contentType = 'application/pdf'
       AND ia.path LIKE 'storage:%' LIMIT 1) AS pdfPath,
    (SELECT ai.key FROM itemAttachments ia JOIN items ai ON ai.itemID = ia.itemID
     WHERE ia.parentItemID = i.itemID AND ia.contentType = 'application/pdf'
       AND ia.path LIKE 'storage:%' LIMIT 1) AS pdfKey
  FROM items i
  JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
  WHERE t.typeName NOT IN ('attachment', 'note', 'annotation')
    AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroItem {
    pub key: String,
    pub date_added: String,
    pub title: String,
    pub creators: String,
    pub year: String,
    pub publication: String,
    pub doi: String,
    pub abstract_text: String,
    pub tags: Vec<String>,
    pub has_pdf: bool,
    pub pdf_key: Option<String>,
    pub pdf_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fav: Option<bool>,
}

// Serde rename abstract is keyword — use alias
impl ZoteroItem {
    fn with_abstract_field(mut self) -> serde_json::Value {
        let mut v = serde_json::to_value(&self).unwrap_or(serde_json::json!({}));
        if let Some(obj) = v.as_object_mut() {
            obj.insert("abstract".into(), serde_json::json!(self.abstract_text));
            obj.remove("abstractText");
        }
        let _ = &mut self;
        v
    }
}

pub fn search(
    app_dir: &Path,
    query: &str,
    collection_id: Option<i64>,
    tag: Option<&str>,
    limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = ensure_fresh(app_dir)?;
    let mut sql = BASE_SQL.to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(cid) = collection_id {
        sql.push_str(" AND i.itemID IN (SELECT itemID FROM collectionItems WHERE collectionID = ?)");
        params.push(Box::new(cid));
    }
    if let Some(tag) = tag.filter(|t| !t.is_empty()) {
        sql.push_str(
            " AND i.itemID IN (SELECT itemID FROM itemTags it JOIN tags t ON t.tagID = it.tagID WHERE t.name = ?)",
        );
        params.push(Box::new(tag.to_string()));
    }
    sql.push_str(" ORDER BY i.dateModified DESC LIMIT 2000");
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |r| {
            let raw_date: Option<String> = r.get(4)?;
            let year = raw_date
                .as_deref()
                .and_then(|s| {
                    s.chars()
                        .collect::<Vec<_>>()
                        .windows(4)
                        .find(|w| w.iter().all(|c| c.is_ascii_digit()))
                        .map(|w| w.iter().collect::<String>())
                })
                .unwrap_or_default();
            let tags_raw: Option<String> = r.get(9)?;
            let tags: Vec<String> = tags_raw
                .unwrap_or_default()
                .split('\u{001f}')
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect();
            let pdf_path: Option<String> = r.get(10)?;
            let pdf_key: Option<String> = r.get(11)?;
            let pdf_file = pdf_path
                .as_ref()
                .map(|p| p.trim_start_matches("storage:").to_string());
            Ok(ZoteroItem {
                key: r.get(1)?,
                date_added: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                title: r.get::<_, Option<String>>(3)?.unwrap_or_else(|| "(sans titre)".into()),
                creators: r.get::<_, Option<String>>(8)?.unwrap_or_default(),
                year,
                publication: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
                doi: r.get::<_, Option<String>>(6)?.unwrap_or_default(),
                abstract_text: r.get::<_, Option<String>>(7)?.unwrap_or_default(),
                tags,
                has_pdf: pdf_path.is_some(),
                pdf_key,
                pdf_file,
                fav: None,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut items: Vec<ZoteroItem> = rows.filter_map(|r| r.ok()).collect();
    let q = query.trim().to_lowercase();
    if !q.is_empty() {
        let terms: Vec<_> = q.split_whitespace().collect();
        items.retain(|it| {
            let hay = format!(
                "{} {} {} {} {} {} {} {}",
                it.key,
                it.pdf_key.as_deref().unwrap_or(""),
                it.pdf_file.as_deref().unwrap_or(""),
                it.title,
                it.creators,
                it.year,
                it.publication,
                it.tags.join(" ")
            )
            .to_lowercase();
            terms.iter().all(|t| hay.contains(t))
        });
    }
    let limit = limit.clamp(1, 2000);
    Ok(items
        .into_iter()
        .take(limit)
        .map(|i| i.with_abstract_field())
        .collect())
}

pub fn collections(app_dir: &Path) -> Result<Vec<serde_json::Value>, String> {
    let conn = ensure_fresh(app_dir)?;
    let mut stmt = conn
        .prepare(
            r#"
        SELECT collectionID AS id, collectionName AS name, parentCollectionID AS parent
        FROM collections
        WHERE collectionID NOT IN (SELECT collectionID FROM deletedCollections)
        ORDER BY collectionName COLLATE NOCASE
        "#,
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, i64>(0)?,
                "name": r.get::<_, String>(1)?,
                "parent": r.get::<_, Option<i64>>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn pdf_absolute_path(pdf_key: &str, pdf_file: &str) -> Option<PathBuf> {
    if pdf_key.len() != 8 || !pdf_key.chars().all(|c| c.is_ascii_alphanumeric()) {
        return None;
    }
    let clean = pdf_file.replace(['/', '\\'], "");
    if !clean.to_lowercase().ends_with(".pdf") {
        return None;
    }
    let p = zotero_dir().join("storage").join(pdf_key).join(&clean);
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

pub fn toggle_fav(app_dir: &Path, key: &str, on: bool) -> Result<bool, String> {
    let path = app_dir.join("zotero-favs.json");
    let mut favs: Vec<String> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    if on {
        if !favs.iter().any(|k| k == key) {
            favs.push(key.to_string());
            favs.sort();
        }
    } else {
        favs.retain(|k| k != key);
    }
    let data = serde_json::to_vec_pretty(&favs).map_err(|e| e.to_string())?;
    // atomic-ish
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())?;
    Ok(on)
}

pub fn load_favs(app_dir: &Path) -> std::collections::HashSet<String> {
    std::fs::read_to_string(app_dir.join("zotero-favs.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
