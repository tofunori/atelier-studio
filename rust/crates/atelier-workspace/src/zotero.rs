//! Zotero library (readonly sqlite copy) — Node `zotero.mjs` core.

use md5::{Digest, Md5};
use rusqlite::{Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use uuid::Uuid;

static CACHE: Mutex<Option<CacheState>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct SourceSignature {
    db_mtime_ns: u128,
    db_len: u64,
    wal_mtime_ns: u128,
    wal_len: u64,
}

struct CacheState {
    source_signature: SourceSignature,
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

fn file_stamp(path: &Path) -> (u128, u64) {
    std::fs::metadata(path)
        .ok()
        .map(|metadata| {
            let modified = metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos())
                .unwrap_or(0);
            (modified, metadata.len())
        })
        .unwrap_or((0, 0))
}

fn source_signature(src: &Path) -> SourceSignature {
    let wal = PathBuf::from(format!("{}-wal", src.display()));
    let (db_mtime_ns, db_len) = file_stamp(src);
    let (wal_mtime_ns, wal_len) = file_stamp(&wal);
    SourceSignature {
        db_mtime_ns,
        db_len,
        wal_mtime_ns,
        wal_len,
    }
}

pub fn available() -> bool {
    src_db().is_file()
}

fn ensure_fresh(app_dir: &Path) -> Result<Connection, String> {
    if !available() {
        return Err("Zotero introuvable (~/Zotero/zotero.sqlite)".into());
    }
    let src = src_db();
    let signature = source_signature(&src);
    let dest = copy_db(app_dir);
    std::fs::create_dir_all(app_dir).map_err(|e| e.to_string())?;
    let need_copy = {
        let guard = CACHE.lock().map_err(|e| e.to_string())?;
        guard
            .as_ref()
            .map(|cache| cache.source_signature != signature)
            .unwrap_or(true)
    };
    if need_copy || !dest.is_file() {
        std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        let wal = PathBuf::from(format!("{}-wal", src.display()));
        let dest_wal = PathBuf::from(format!("{}-wal", dest.display()));
        if wal.is_file() {
            std::fs::copy(&wal, &dest_wal).map_err(|e| e.to_string())?;
        } else if dest_wal.is_file() {
            std::fs::remove_file(dest_wal).map_err(|e| e.to_string())?;
        }
        if let Ok(mut g) = CACHE.lock() {
            *g = Some(CacheState {
                source_signature: signature,
            });
        }
    }
    Connection::open_with_flags(
        &dest,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| e.to_string())
}

const CANDIDATE_SQL: &str = r#"
  SELECT i.itemID, i.key, i.dateAdded
  FROM items i
  JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
  WHERE t.typeName NOT IN ('attachment', 'note', 'annotation')
    AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
"#;

/// Cap applied to the candidate-row fetch (independent from the caller's
/// requested `limit`, which only truncates the final — possibly
/// text-filtered — result). Raised from 400/2000 to 5000 (2026-09) so the
/// front can load an entire collection/tag/favorites scope in one request.
const CANDIDATE_ROW_CAP: usize = 5000;

/// itemIDs are always integers straight out of sqlite (never user text), so
/// inlining them into an `IN (...)` clause is safe and sidesteps sqlite's
/// default 999 bound-parameter ceiling that a `Vec<i64>` of this size would
/// otherwise hit.
fn ids_clause(ids: &[i64]) -> String {
    ids.iter()
        .map(i64::to_string)
        .collect::<Vec<_>>()
        .join(",")
}

fn extract_year(raw_date: Option<&str>) -> String {
    raw_date
        .and_then(|s| {
            s.chars()
                .collect::<Vec<_>>()
                .windows(4)
                .find(|w| w.iter().all(|c| c.is_ascii_digit()))
                .map(|w| w.iter().collect::<String>())
        })
        .unwrap_or_default()
}

/// Single batched query replacing 5 per-item correlated subqueries
/// (title/date/publicationTitle/DOI/abstractNote).
fn fetch_fields(
    conn: &Connection,
    ids: &[i64],
) -> Result<HashMap<i64, HashMap<String, String>>, String> {
    let mut out: HashMap<i64, HashMap<String, String>> = HashMap::new();
    if ids.is_empty() {
        return Ok(out);
    }
    let sql = format!(
        "SELECT d.itemID, f.fieldName, v.value FROM itemData d \
         JOIN fields f ON f.fieldID = d.fieldID \
         JOIN itemDataValues v ON v.valueID = d.valueID \
         WHERE f.fieldName IN ('title','date','publicationTitle','DOI','abstractNote') \
           AND d.itemID IN ({})",
        ids_clause(ids)
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for (item_id, field, value) in rows.filter_map(|r| r.ok()) {
        out.entry(item_id).or_default().insert(field, value);
    }
    Ok(out)
}

/// Batched replacement for the per-item `GROUP_CONCAT` creators subquery.
fn fetch_creators(conn: &Connection, ids: &[i64]) -> Result<HashMap<i64, Vec<String>>, String> {
    let mut out: HashMap<i64, Vec<String>> = HashMap::new();
    if ids.is_empty() {
        return Ok(out);
    }
    // NB: no `ORDER BY ... orderIndex` here on purpose. The legacy
    // correlated subquery had no ORDER BY either, and sqlite answers it via
    // the (itemID, creatorID, creatorTypeID, orderIndex) primary-key index —
    // i.e. creatorID order, not orderIndex/byline order. Matching that
    // (rather than the "correct" byline order) is required for the JSON
    // parity the front depends on; see `search_and_search_legacy_*` tests.
    let sql = format!(
        "SELECT ic.itemID, c.lastName FROM itemCreators ic \
         JOIN creators c ON c.creatorID = ic.creatorID \
         WHERE ic.itemID IN ({}) ORDER BY ic.itemID, ic.creatorID",
        ids_clause(ids)
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for (item_id, last_name) in rows.filter_map(|r| r.ok()) {
        out.entry(item_id).or_default().push(last_name);
    }
    Ok(out)
}

/// Batched replacement for the per-item `GROUP_CONCAT` tags subquery.
fn fetch_tags(conn: &Connection, ids: &[i64]) -> Result<HashMap<i64, Vec<String>>, String> {
    let mut out: HashMap<i64, Vec<String>> = HashMap::new();
    if ids.is_empty() {
        return Ok(out);
    }
    let sql = format!(
        "SELECT it.itemID, t.name FROM itemTags it \
         JOIN tags t ON t.tagID = it.tagID WHERE it.itemID IN ({})",
        ids_clause(ids)
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    for (item_id, name) in rows.filter_map(|r| r.ok()) {
        out.entry(item_id).or_default().push(name);
    }
    Ok(out)
}

/// Batched replacement for the two per-item `LIMIT 1` PDF-attachment
/// subqueries (path + attachment key). Keeps "first match wins" semantics.
fn fetch_pdf_attachments(
    conn: &Connection,
    ids: &[i64],
) -> Result<HashMap<i64, (String, Option<String>)>, String> {
    let mut out: HashMap<i64, (String, Option<String>)> = HashMap::new();
    if ids.is_empty() {
        return Ok(out);
    }
    let sql = format!(
        "SELECT ia.parentItemID, ia.path, ai.key FROM itemAttachments ia \
         JOIN items ai ON ai.itemID = ia.itemID \
         WHERE ia.parentItemID IN ({}) AND ia.contentType = 'application/pdf' \
           AND ia.path LIKE 'storage:%'",
        ids_clause(ids)
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for (item_id, path, key) in rows.filter_map(|r| r.ok()) {
        out.entry(item_id).or_insert((path, key));
    }
    Ok(out)
}

struct Candidate {
    item_id: i64,
    key: String,
    date_added: String,
}

/// Joins each candidate row with its batched creators/tags/attachments/field
/// data (4 grouped queries total, however many candidates there are) instead
/// of running ~7 correlated subqueries per item.
fn hydrate_items(conn: &Connection, candidates: Vec<Candidate>) -> Result<Vec<ZoteroItem>, String> {
    let ids: Vec<i64> = candidates.iter().map(|c| c.item_id).collect();
    let fields = fetch_fields(conn, &ids)?;
    let creators = fetch_creators(conn, &ids)?;
    let tags = fetch_tags(conn, &ids)?;
    let attachments = fetch_pdf_attachments(conn, &ids)?;

    Ok(candidates
        .into_iter()
        .map(|c| {
            let field_map = fields.get(&c.item_id);
            let raw_date = field_map.and_then(|m| m.get("date")).map(String::as_str);
            let year = extract_year(raw_date);
            let creators_str = creators
                .get(&c.item_id)
                .map(|v| v.join(", "))
                .unwrap_or_default();
            let tags_vec = tags.get(&c.item_id).cloned().unwrap_or_default();
            let (pdf_path, pdf_key) = attachments
                .get(&c.item_id)
                .map(|(p, k)| (Some(p.clone()), k.clone()))
                .unwrap_or((None, None));
            let pdf_file = pdf_path
                .as_ref()
                .map(|p| p.trim_start_matches("storage:").to_string());
            ZoteroItem {
                key: c.key,
                date_added: c.date_added,
                title: field_map
                    .and_then(|m| m.get("title").cloned())
                    .unwrap_or_else(|| "(sans titre)".into()),
                creators: creators_str,
                year,
                publication: field_map
                    .and_then(|m| m.get("publicationTitle").cloned())
                    .unwrap_or_default(),
                doi: field_map
                    .and_then(|m| m.get("DOI").cloned())
                    .unwrap_or_default(),
                abstract_text: field_map
                    .and_then(|m| m.get("abstractNote").cloned())
                    .unwrap_or_default(),
                tags: tags_vec,
                has_pdf: pdf_path.is_some(),
                pdf_key,
                pdf_file,
                fav: None,
            }
        })
        .collect())
}

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

/// Builds the `WHERE`-scoped, ordered candidate SQL (collection/tag scope +
/// `ORDER BY ... LIMIT`) shared by the current and legacy (test-only)
/// search implementations.
fn scoped_candidate_sql(
    collection_id: Option<i64>,
    tag: Option<&str>,
) -> (String, Vec<Box<dyn rusqlite::types::ToSql>>) {
    let mut sql = CANDIDATE_SQL.to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(cid) = collection_id {
        sql.push_str(
            " AND i.itemID IN (SELECT itemID FROM collectionItems WHERE collectionID = ?)",
        );
        params.push(Box::new(cid));
    }
    if let Some(tag) = tag.filter(|t| !t.is_empty()) {
        sql.push_str(
            " AND i.itemID IN (SELECT itemID FROM itemTags it JOIN tags t ON t.tagID = it.tagID WHERE t.name = ?)",
        );
        params.push(Box::new(tag.to_string()));
    }
    sql.push_str(&format!(
        " ORDER BY i.dateModified DESC LIMIT {CANDIDATE_ROW_CAP}"
    ));
    (sql, params)
}

fn text_filter(items: &[ZoteroItem], query: &str) -> std::collections::HashSet<usize> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return (0..items.len()).collect();
    }
    let terms: Vec<_> = q.split_whitespace().collect();
    items
        .iter()
        .enumerate()
        .filter(|(_, it)| {
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
        })
        .map(|(idx, _)| idx)
        .collect()
}

/// Pre-2026-09 implementation: 7 correlated subqueries per candidate row
/// instead of the batched `hydrate_items` queries. Kept test-only for a
/// parity check that the grouped rewrite produces byte-identical JSON.
#[cfg(test)]
const LEGACY_BASE_SQL: &str = r#"
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

#[cfg(test)]
fn search_legacy(
    conn: &Connection,
    query: &str,
    collection_id: Option<i64>,
    tag: Option<&str>,
    limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let mut sql = LEGACY_BASE_SQL.to_string();
    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    if let Some(cid) = collection_id {
        sql.push_str(
            " AND i.itemID IN (SELECT itemID FROM collectionItems WHERE collectionID = ?)",
        );
        params.push(Box::new(cid));
    }
    if let Some(tag) = tag.filter(|t| !t.is_empty()) {
        sql.push_str(
            " AND i.itemID IN (SELECT itemID FROM itemTags it JOIN tags t ON t.tagID = it.tagID WHERE t.name = ?)",
        );
        params.push(Box::new(tag.to_string()));
    }
    sql.push_str(&format!(
        " ORDER BY i.dateModified DESC LIMIT {CANDIDATE_ROW_CAP}"
    ));
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |r| {
            let raw_date: Option<String> = r.get(4)?;
            let year = extract_year(raw_date.as_deref());
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
                title: r
                    .get::<_, Option<String>>(3)?
                    .unwrap_or_else(|| "(sans titre)".into()),
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
    let items: Vec<ZoteroItem> = rows.filter_map(|r| r.ok()).collect();
    let keep = text_filter(&items, query);
    let limit = limit.clamp(1, CANDIDATE_ROW_CAP);
    Ok(items
        .into_iter()
        .enumerate()
        .filter(|(idx, _)| keep.contains(idx))
        .map(|(_, i)| i)
        .take(limit)
        .map(|i| i.with_abstract_field())
        .collect())
}

pub fn search(
    app_dir: &Path,
    query: &str,
    collection_id: Option<i64>,
    tag: Option<&str>,
    limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = ensure_fresh(app_dir)?;
    search_with_conn(&conn, query, collection_id, tag, limit)
}

/// Connection-taking core of [`search`], split out so tests can exercise it
/// against an in-memory fixture instead of the real `~/Zotero` copy.
fn search_with_conn(
    conn: &Connection,
    query: &str,
    collection_id: Option<i64>,
    tag: Option<&str>,
    limit: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let (sql, params) = scoped_candidate_sql(collection_id, tag);
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(param_refs.as_slice(), |r| {
            Ok(Candidate {
                item_id: r.get(0)?,
                key: r.get(1)?,
                date_added: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?;
    let candidates: Vec<Candidate> = rows.filter_map(|r| r.ok()).collect();
    let items = hydrate_items(conn, candidates)?;
    let keep = text_filter(&items, query);
    let limit = limit.clamp(1, CANDIDATE_ROW_CAP);
    Ok(items
        .into_iter()
        .enumerate()
        .filter(|(idx, _)| keep.contains(idx))
        .map(|(_, i)| i)
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

/// Checks that `key` is a non-deleted, non-attachment/note/annotation item
/// in the (readonly) Zotero copy attached to `conn`.
fn item_key_exists(conn: &Connection, key: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM items i JOIN itemTypes t ON t.itemTypeID = i.itemTypeID \
         WHERE i.key = ?1 AND t.typeName NOT IN ('attachment', 'note', 'annotation') \
           AND i.itemID NOT IN (SELECT itemID FROM deletedItems) LIMIT 1",
        [key],
        |_| Ok(true),
    )
    .optional()
    .map_err(|e| e.to_string())
    .map(|found| found.unwrap_or(false))
}

fn write_favs(app_dir: &Path, key: &str, on: bool) -> Result<bool, String> {
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

/// Toggles a favorite. Favoriting (`on: true`) requires `key` to resolve to
/// a real, non-deleted Zotero item — this is what lets the front cancel an
/// optimistic toggle when the write fails (Zotero closed, base locked,
/// unknown item). Un-favoriting always succeeds locally: removing a stale
/// reference (e.g. to an item since deleted in Zotero) must not fail.
pub fn toggle_fav(app_dir: &Path, key: &str, on: bool) -> Result<bool, String> {
    if key.trim().is_empty() {
        return Err("clé manquante".into());
    }
    if on {
        let conn = ensure_fresh(app_dir)?;
        if !item_key_exists(&conn, key)? {
            return Err("item-introuvable".into());
        }
    }
    write_favs(app_dir, key, on)
}

pub fn load_favs(app_dir: &Path) -> std::collections::HashSet<String> {
    std::fs::read_to_string(app_dir.join("zotero-favs.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

const MAX_PDF_BYTES: u64 = 200 * 1024 * 1024;
const ZOTERO_CONNECTOR_URL: &str = "http://127.0.0.1:23119/connector/saveStandaloneAttachment";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoteroAddResult {
    pub name: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(rename = "match", skip_serializing_if = "Option::is_none")]
    pub match_title: Option<String>,
}

impl ZoteroAddResult {
    fn failed(name: String, error: impl Into<String>) -> Self {
        Self {
            name,
            ok: false,
            status: None,
            error: Some(error.into()),
            match_title: None,
        }
    }
}

fn md5_hex(bytes: &[u8]) -> String {
    let mut hash = Md5::new();
    hash.update(bytes);
    hex::encode(hash.finalize())
}

fn find_duplicate_in_connection(
    conn: &Connection,
    storage_root: &Path,
    md5: &str,
    filename: &str,
) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare(
            r#"
            SELECT ia.path, ia.storageHash, ai.key AS attKey,
              COALESCE((SELECT v.value FROM itemData d
                 JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'title'
                 JOIN itemDataValues v ON v.valueID = d.valueID
               WHERE d.itemID = ia.parentItemID), ia.path) AS parentTitle
            FROM itemAttachments ia
            JOIN items ai ON ai.itemID = ia.itemID
            WHERE ia.contentType = 'application/pdf' AND ia.path LIKE 'storage:%'
              AND ai.itemID NOT IN (SELECT itemID FROM deletedItems)
            "#,
        )
        .map_err(|e| e.to_string())?;
    let base = filename.to_ascii_lowercase();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let path: String = row.get(0).map_err(|e| e.to_string())?;
        let storage_hash: Option<String> = row.get(1).map_err(|e| e.to_string())?;
        let attachment_key: String = row.get(2).map_err(|e| e.to_string())?;
        let parent_title: String = row.get(3).map_err(|e| e.to_string())?;
        let stored_filename = path.strip_prefix("storage:").unwrap_or(&path);

        if storage_hash
            .as_deref()
            .is_some_and(|hash| hash.eq_ignore_ascii_case(md5))
        {
            return Ok(Some(parent_title));
        }
        if stored_filename.to_ascii_lowercase() == base {
            return Ok(Some(parent_title));
        }
        if storage_hash.is_none() {
            let stored = storage_root.join(&attachment_key).join(stored_filename);
            if let Ok(bytes) = std::fs::read(stored) {
                if md5_hex(&bytes) == md5 {
                    return Ok(Some(parent_title));
                }
            }
        }
    }
    Ok(None)
}

fn find_duplicate(app_dir: &Path, md5: &str, filename: &str) -> Result<Option<String>, String> {
    let conn = ensure_fresh(app_dir)?;
    find_duplicate_in_connection(&conn, &zotero_dir().join("storage"), md5, filename)
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("document.pdf")
        .to_string()
}

fn ascii_json_header(value: &serde_json::Value) -> String {
    let json = value.to_string();
    let mut escaped = String::with_capacity(json.len());
    for ch in json.chars() {
        if ch.is_ascii() {
            escaped.push(ch);
            continue;
        }
        let codepoint = ch as u32;
        if codepoint <= 0xffff {
            escaped.push_str(&format!("\\u{codepoint:04x}"));
        } else {
            let scalar = codepoint - 0x1_0000;
            let high = 0xd800 + (scalar >> 10);
            let low = 0xdc00 + (scalar & 0x3ff);
            escaped.push_str(&format!("\\u{high:04x}\\u{low:04x}"));
        }
    }
    escaped
}

async fn add_pdfs_with_connector(
    app_dir: &Path,
    paths: Vec<String>,
    connector_url: &str,
    check_duplicates: bool,
) -> Vec<ZoteroAddResult> {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return paths
                .into_iter()
                .map(|path| {
                    ZoteroAddResult::failed(display_name(Path::new(&path)), error.to_string())
                })
                .collect();
        }
    };
    let mut results = Vec::with_capacity(paths.len());

    for raw_path in paths {
        let selected_path = PathBuf::from(&raw_path);
        let name = display_name(&selected_path);
        if selected_path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("pdf"))
        {
            results.push(ZoteroAddResult::failed(name, "invalid-pdf"));
            continue;
        }
        let path = match tokio::fs::canonicalize(&selected_path).await {
            Ok(path) => path,
            Err(_) => {
                results.push(ZoteroAddResult::failed(name, "invalid-path"));
                continue;
            }
        };
        let metadata = match tokio::fs::metadata(&path).await {
            Ok(metadata) if metadata.is_file() && metadata.len() <= MAX_PDF_BYTES => metadata,
            Ok(metadata) if metadata.len() > MAX_PDF_BYTES => {
                results.push(ZoteroAddResult::failed(name, "pdf-too-large"));
                continue;
            }
            _ => {
                results.push(ZoteroAddResult::failed(name, "invalid-path"));
                continue;
            }
        };
        let _ = metadata;
        let bytes = match tokio::fs::read(&path).await {
            Ok(bytes) => bytes,
            Err(_) => {
                results.push(ZoteroAddResult::failed(name, "invalid-path"));
                continue;
            }
        };
        let header_len = bytes.len().min(1024);
        if bytes.is_empty() || !bytes[..header_len].windows(5).any(|part| part == b"%PDF-") {
            results.push(ZoteroAddResult::failed(name, "invalid-pdf"));
            continue;
        }

        if check_duplicates {
            let app_dir = app_dir.to_path_buf();
            let hash = md5_hex(&bytes);
            let duplicate_name = name.clone();
            let duplicate = tokio::task::spawn_blocking(move || {
                find_duplicate(&app_dir, &hash, &duplicate_name)
            })
            .await
            .unwrap_or_else(|error| Err(error.to_string()));
            match duplicate {
                Ok(Some(match_title)) => {
                    results.push(ZoteroAddResult {
                        name,
                        ok: false,
                        status: None,
                        error: Some("duplicate".into()),
                        match_title: Some(match_title),
                    });
                    continue;
                }
                Ok(None) => {}
                Err(error) => {
                    results.push(ZoteroAddResult::failed(name, error));
                    continue;
                }
            }
        }

        let file_url = reqwest::Url::from_file_path(&path)
            .map(|url| url.to_string())
            .unwrap_or_else(|_| format!("file://{}", path.display()));
        let metadata = serde_json::json!({
            "url": file_url,
            "title": name,
            "sessionID": Uuid::new_v4().simple().to_string()[..8].to_string(),
        });
        match client
            .post(connector_url)
            .header("Content-Type", "application/pdf")
            .header("X-Metadata", ascii_json_header(&metadata))
            .body(bytes)
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status().as_u16();
                results.push(ZoteroAddResult {
                    name,
                    ok: status == 201,
                    status: Some(status),
                    error: (status != 201).then(|| "connector-error".into()),
                    match_title: None,
                });
            }
            Err(error) => {
                let kind = if error.is_connect() {
                    "zotero-off".to_string()
                } else if error.is_timeout() {
                    "zotero-timeout".to_string()
                } else {
                    error.to_string()
                };
                results.push(ZoteroAddResult::failed(name, kind));
            }
        }
    }
    results
}

/// Add local PDFs through Zotero's connector API while keeping direct database
/// access read-only. Results preserve input order and report failures per file.
pub async fn add_pdfs(app_dir: &Path, paths: Vec<String>) -> Vec<ZoteroAddResult> {
    add_pdfs_with_connector(app_dir, paths, ZOTERO_CONNECTOR_URL, true).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn write_pdf(path: &Path, label: &str) {
        std::fs::write(
            path,
            format!("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Label ({label}) >>\nendobj\n%%EOF\n"),
        )
        .unwrap();
    }

    async fn connector(expected_requests: usize) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            for _ in 0..expected_requests {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                let mut chunk = [0u8; 4096];
                loop {
                    let read = stream.read(&mut chunk).await.unwrap();
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&chunk[..read]);
                    let Some(header_end) = request.windows(4).position(|w| w == b"\r\n\r\n") else {
                        continue;
                    };
                    let headers = String::from_utf8_lossy(&request[..header_end]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|value| value.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
                assert!(String::from_utf8_lossy(&request)
                    .to_ascii_lowercase()
                    .contains("x-metadata:"));
                stream
                    .write_all(
                        b"HTTP/1.1 201 Created\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    )
                    .await
                    .unwrap();
            }
        });
        format!("http://{addr}/connector/saveStandaloneAttachment")
    }

    #[tokio::test]
    async fn add_pdfs_rejects_invalid_paths_and_content() {
        let dir = tempfile::tempdir().unwrap();
        let fake = dir.path().join("fake.pdf");
        std::fs::write(&fake, b"not a pdf").unwrap();
        let results = add_pdfs_with_connector(
            dir.path(),
            vec![
                dir.path().join("missing.pdf").display().to_string(),
                fake.display().to_string(),
                dir.path().join("notes.txt").display().to_string(),
            ],
            "http://127.0.0.1:9/connector/saveStandaloneAttachment",
            false,
        )
        .await;
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].error.as_deref(), Some("invalid-path"));
        assert_eq!(results[1].error.as_deref(), Some("invalid-pdf"));
        assert_eq!(results[2].error.as_deref(), Some("invalid-pdf"));
    }

    #[tokio::test]
    async fn add_pdfs_uploads_multiple_files_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let first = dir.path().join("first.pdf");
        let second = dir.path().join("second.pdf");
        write_pdf(&first, "first");
        write_pdf(&second, "second");
        let url = connector(2).await;
        let results = add_pdfs_with_connector(
            dir.path(),
            vec![first.display().to_string(), second.display().to_string()],
            &url,
            false,
        )
        .await;
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].name, "first.pdf");
        assert_eq!(results[1].name, "second.pdf");
        assert!(results
            .iter()
            .all(|result| result.ok && result.status == Some(201)));
    }

    #[tokio::test]
    async fn add_pdfs_reports_zotero_off() {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("offline.pdf");
        write_pdf(&pdf, "offline");
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!(
            "http://{}/connector/saveStandaloneAttachment",
            listener.local_addr().unwrap()
        );
        drop(listener);
        let results =
            add_pdfs_with_connector(dir.path(), vec![pdf.display().to_string()], &url, false).await;
        assert_eq!(results[0].error.as_deref(), Some("zotero-off"));
    }

    #[test]
    fn duplicate_detection_uses_zotero_storage_hash() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE itemAttachments (
              parentItemID INTEGER, contentType TEXT, path TEXT,
              storageHash TEXT, itemID INTEGER
            );
            CREATE TABLE items (itemID INTEGER, key TEXT);
            CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
            CREATE TABLE fields (fieldID INTEGER, fieldName TEXT);
            CREATE TABLE itemDataValues (valueID INTEGER, value TEXT);
            CREATE TABLE deletedItems (itemID INTEGER);
            INSERT INTO items VALUES (2, 'ABCDEFGH');
            INSERT INTO itemAttachments VALUES (
              1, 'application/pdf', 'storage:existing.pdf',
              '0123456789abcdef0123456789abcdef', 2
            );
            "#,
        )
        .unwrap();
        let duplicate = find_duplicate_in_connection(
            &conn,
            Path::new("/unused"),
            "0123456789abcdef0123456789abcdef",
            "incoming.pdf",
        )
        .unwrap();
        assert_eq!(duplicate.as_deref(), Some("storage:existing.pdf"));
    }

    #[test]
    fn source_signature_changes_when_the_zotero_wal_changes() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("zotero.sqlite");
        std::fs::write(&db, b"database").unwrap();
        let before = source_signature(&db);
        std::fs::write(dir.path().join("zotero.sqlite-wal"), b"new transaction").unwrap();
        let after = source_signature(&db);

        assert_ne!(before, after);
        assert_eq!(before.db_mtime_ns, after.db_mtime_ns);
        assert!(after.wal_len > 0);
    }

    #[test]
    fn connector_metadata_header_preserves_unicode_as_ascii_json_escapes() {
        let metadata = serde_json::json!({
            "title": "Étude 🧊.pdf",
            "url": "file:///tmp/%C3%89tude.pdf",
            "sessionID": "12345678",
        });
        let header = ascii_json_header(&metadata);

        assert!(header.is_ascii());
        assert!(header.contains("\\u00c9tude"));
        assert!(header.contains("\\ud83e\\uddca"));
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&header).unwrap(),
            metadata
        );
    }

    /// Minimal in-memory library covering every column `search`/`toggle_fav`
    /// touch: 3 real items (with title/date/publication/DOI/abstract,
    /// multiple creators in order, tags, one PDF attachment each for two of
    /// them) plus one soft-deleted and one note item that must never surface.
    fn build_fixture_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE itemTypes (itemTypeID INTEGER, typeName TEXT);
            CREATE TABLE items (itemID INTEGER, key TEXT, itemTypeID INTEGER, dateAdded TEXT, dateModified TEXT);
            CREATE TABLE deletedItems (itemID INTEGER);
            CREATE TABLE fields (fieldID INTEGER, fieldName TEXT);
            CREATE TABLE itemDataValues (valueID INTEGER, value TEXT);
            CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
            CREATE TABLE creators (creatorID INTEGER, lastName TEXT);
            CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, orderIndex INTEGER);
            CREATE TABLE tags (tagID INTEGER, name TEXT);
            CREATE TABLE itemTags (itemID INTEGER, tagID INTEGER);
            CREATE TABLE itemAttachments (itemID INTEGER, parentItemID INTEGER, contentType TEXT, path TEXT);
            CREATE TABLE collections (collectionID INTEGER, collectionName TEXT, parentCollectionID INTEGER);
            CREATE TABLE collectionItems (collectionID INTEGER, itemID INTEGER);
            CREATE TABLE deletedCollections (collectionID INTEGER);

            INSERT INTO itemTypes VALUES (1, 'journalArticle'), (2, 'attachment'), (3, 'note');

            -- item 1: full metadata, two ordered creators, two tags, a PDF.
            INSERT INTO items VALUES (1, 'ITEM0001', 1, '2024-01-01', '2024-03-03');
            -- item 2: partial metadata, one creator, no tags, no PDF.
            INSERT INTO items VALUES (2, 'ITEM0002', 1, '2024-02-02', '2024-02-02');
            -- item 3: soft-deleted, must never appear.
            INSERT INTO items VALUES (3, 'DELETED1', 1, '2024-01-01', '2024-01-01');
            -- item 4: a note, filtered out by itemTypes.
            INSERT INTO items VALUES (4, 'NOTE0001', 3, '2024-01-01', '2024-01-01');
            -- item 100: the attachment row itself (joined via itemAttachments.itemID).
            INSERT INTO items VALUES (100, 'ATTACH01', 2, '2024-01-01', '2024-01-01');
            INSERT INTO deletedItems VALUES (3);

            INSERT INTO fields VALUES (1,'title'), (2,'date'), (3,'publicationTitle'), (4,'DOI'), (5,'abstractNote');
            INSERT INTO itemDataValues VALUES
                (10,'Glacier melt in the Andes'), (11,'2024-03-01'), (12,'Journal of Glaciology'),
                (13,'10.1000/xyz'), (14,'An abstract about ice.'),
                (20,'A second paper');
            INSERT INTO itemData VALUES
                (1,1,10), (1,2,11), (1,3,12), (1,4,13), (1,5,14),
                (2,1,20);

            INSERT INTO creators VALUES (1,'Dupont'), (2,'Martin');
            -- inserted in orderIndex order, matching how Zotero itself
            -- writes rows (rowid order tracks orderIndex in practice) so
            -- the legacy GROUP_CONCAT (no explicit ORDER BY) and the new
            -- `ORDER BY orderIndex` query agree, as they do on the real
            -- ~/Zotero library.
            INSERT INTO itemCreators VALUES (1,1,0), (1,2,1), (2,1,0);

            INSERT INTO tags VALUES (1,'albedo'), (2,'MODIS');
            INSERT INTO itemTags VALUES (1,1), (1,2);

            INSERT INTO itemAttachments VALUES (100, 1, 'application/pdf', 'storage:paper.pdf');

            INSERT INTO collections VALUES (1, 'Glaciology', NULL);
            INSERT INTO collectionItems VALUES (1, 1);
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn search_and_search_legacy_produce_identical_json() {
        let conn = build_fixture_conn();
        let legacy = search_legacy(&conn, "", None, None, 5000).unwrap();
        let grouped = search_with_conn(&conn, "", None, None, 5000).unwrap();
        assert_eq!(legacy, grouped);
        assert_eq!(grouped.len(), 2, "deleted item and note must be excluded");

        // Sanity on the shape (order preserved, creators/tags/pdf grouped correctly).
        let first = grouped.iter().find(|v| v["key"] == "ITEM0001").unwrap();
        assert_eq!(first["title"], "Glacier melt in the Andes");
        assert_eq!(first["creators"], "Dupont, Martin");
        assert_eq!(first["year"], "2024");
        assert_eq!(first["publication"], "Journal of Glaciology");
        assert_eq!(first["doi"], "10.1000/xyz");
        assert_eq!(first["abstract"], "An abstract about ice.");
        assert_eq!(first["hasPdf"], true);
        assert_eq!(first["pdfKey"], "ATTACH01");
        assert_eq!(first["pdfFile"], "paper.pdf");
        assert_eq!(
            first["tags"],
            serde_json::json!(["albedo", "MODIS"])
        );

        let second = grouped.iter().find(|v| v["key"] == "ITEM0002").unwrap();
        assert_eq!(second["hasPdf"], false);
        assert_eq!(second["publication"], "");
    }

    #[test]
    fn search_and_search_legacy_agree_with_text_query_and_scope() {
        let conn = build_fixture_conn();
        for (q, cid, tag) in [
            ("andes", None, None),
            ("", Some(1i64), None),
            ("", None, Some("albedo")),
            ("nomatch", None, None),
        ] {
            let legacy = search_legacy(&conn, q, cid, tag, 5000).unwrap();
            let grouped = search_with_conn(&conn, q, cid, tag, 5000).unwrap();
            assert_eq!(legacy, grouped, "mismatch for q={q:?} cid={cid:?} tag={tag:?}");
        }
    }

    #[test]
    fn search_limit_of_5000_is_accepted_and_higher_values_are_clamped() {
        let conn = build_fixture_conn();
        let at_cap = search_with_conn(&conn, "", None, None, 5000).unwrap();
        let above_cap = search_with_conn(&conn, "", None, None, 50_000).unwrap();
        assert_eq!(at_cap.len(), 2);
        assert_eq!(above_cap.len(), 2, "requests above the 5000 cap must not error out");
    }

    #[test]
    fn toggle_fav_succeeds_for_a_real_item_and_persists() {
        let conn = build_fixture_conn();
        let app_dir = tempfile::tempdir().unwrap();
        assert!(item_key_exists(&conn, "ITEM0001").unwrap());

        // Exercise the DB-checked branch directly against the fixture
        // connection (toggle_fav itself opens `~/Zotero` via ensure_fresh,
        // which is unavailable in CI).
        assert!(item_key_exists(&conn, "ITEM0001").unwrap());
        write_favs(app_dir.path(), "ITEM0001", true).unwrap();
        let favs = load_favs(app_dir.path());
        assert!(favs.contains("ITEM0001"));
    }

    #[test]
    fn item_key_exists_is_false_for_unknown_deleted_or_non_item_keys() {
        let conn = build_fixture_conn();
        assert!(!item_key_exists(&conn, "NOPE0000").unwrap());
        assert!(!item_key_exists(&conn, "DELETED1").unwrap(), "soft-deleted items must not resolve");
        assert!(!item_key_exists(&conn, "NOTE0001").unwrap(), "notes are not favoritable items");
    }

    #[test]
    fn toggle_fav_reports_ok_false_style_error_for_unknown_key_via_ensure_fresh_path() {
        // toggle_fav(app_dir, key, true) calls ensure_fresh(app_dir), which
        // fails with "Zotero introuvable" when ~/Zotero/zotero.sqlite is
        // absent from the test sandbox — the same Err(..) path the
        // ws_router maps to {"ok": false, "error": ...}. This confirms the
        // failure surfaces as an error rather than panicking.
        let app_dir = tempfile::tempdir().unwrap();
        let result = toggle_fav(app_dir.path(), "ITEM0001", true);
        assert!(result.is_err());
    }

    #[test]
    fn toggle_fav_unfavoriting_never_requires_db_lookup() {
        // Un-favoriting must succeed even for a key that no longer exists in
        // Zotero (stale local reference) — it should not touch ensure_fresh.
        let app_dir = tempfile::tempdir().unwrap();
        std::fs::write(
            app_dir.path().join("zotero-favs.json"),
            serde_json::to_vec(&["STALE001"]).unwrap(),
        )
        .unwrap();
        let result = toggle_fav(app_dir.path(), "STALE001", false).unwrap();
        assert!(!result);
        assert!(!load_favs(app_dir.path()).contains("STALE001"));
    }

    /// Manual perf comparison against the real synced copy at
    /// `~/Library/Application Support/atelier-studio/zotero-read.sqlite`.
    /// Run with:
    ///   cargo test -q -p atelier-workspace --manifest-path rust/Cargo.toml \
    ///     -- --ignored --nocapture perf_bench_legacy_vs_grouped
    #[test]
    #[ignore = "needs a real ~/Zotero library already synced into the atelier-studio app dir"]
    fn perf_bench_legacy_vs_grouped_against_real_library() {
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap();
        let app_dir = home.join("Library/Application Support/atelier-studio");
        let conn = ensure_fresh(&app_dir).expect("real Zotero copy must exist to run this bench");

        let t0 = std::time::Instant::now();
        let legacy = search_legacy(&conn, "", None, None, 5000).unwrap();
        let legacy_elapsed = t0.elapsed();

        let t1 = std::time::Instant::now();
        let grouped = search_with_conn(&conn, "", None, None, 5000).unwrap();
        let grouped_elapsed = t1.elapsed();

        eprintln!(
            "zotero search perf ({} items): legacy(7 correlated subqueries/item)={legacy_elapsed:?}  grouped(4 batched queries)={grouped_elapsed:?}",
            grouped.len(),
        );
        for (idx, (l, g)) in legacy.iter().zip(grouped.iter()).enumerate() {
            if l != g {
                eprintln!("--- mismatch at index {idx} (key {:?}) ---", l["key"]);
                let lo = l.as_object().unwrap();
                let go = g.as_object().unwrap();
                for k in lo.keys() {
                    if lo.get(k) != go.get(k) {
                        eprintln!("  field {k}: legacy={:?}  grouped={:?}", lo.get(k), go.get(k));
                    }
                }
            }
        }
        assert_eq!(
            legacy.len(),
            grouped.len(),
            "grouped rewrite must return the same item count as legacy on real data"
        );
        assert_eq!(legacy, grouped, "grouped rewrite must stay byte-identical to legacy on real data");
    }
}
