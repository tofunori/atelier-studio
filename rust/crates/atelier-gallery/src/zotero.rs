//! Phase 6 — lecture seule Zotero (copie mtime) + favoris locaux + connecteur add.

use crate::{AppState, request_allowed};
use axum::{
    Json,
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use md5::{Digest, Md5};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

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
     WHERE ic.itemID = i.itemID ORDER BY ic.orderIndex) AS creators,
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

#[derive(Default)]
pub(crate) struct ZoteroCache {
    mtime: f64,
}

fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()))
}

fn zotero_dir() -> PathBuf {
    home().join("Zotero")
}

fn zotero_src() -> PathBuf {
    zotero_dir().join("zotero.sqlite")
}

fn zotero_cache_dir() -> PathBuf {
    home()
        .join("Library")
        .join("Application Support")
        .join("cmux-gallery")
}

fn zotero_copy() -> PathBuf {
    zotero_cache_dir().join("zotero-read.sqlite")
}

fn zotero_favs_path() -> PathBuf {
    zotero_cache_dir().join("zotero-favs.json")
}

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

fn ensure_readonly_copy(cache: &Mutex<ZoteroCache>) -> Result<PathBuf, String> {
    let src = zotero_src();
    if !src.is_file() {
        return Err("Zotero introuvable (~/Zotero/zotero.sqlite)".into());
    }
    let mtime = src
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0);
    let copy = zotero_copy();
    let mut guard = cache.lock().map_err(|e| e.to_string())?;
    if mtime != guard.mtime || !copy.is_file() {
        fs::create_dir_all(zotero_cache_dir()).map_err(|e| e.to_string())?;
        fs::copy(&src, &copy).map_err(|e| e.to_string())?;
        let wal = PathBuf::from(format!("{}-wal", src.display()));
        if wal.is_file() {
            let _ = fs::copy(&wal, format!("{}-wal", copy.display()));
        }
        guard.mtime = mtime;
    }
    Ok(copy)
}

fn open_ro(path: &Path) -> Result<rusqlite::Connection, String> {
    let uri = format!("file:{}?mode=ro", path.display());
    rusqlite::Connection::open_with_flags(
        &uri,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| e.to_string())
}

fn cite_key(creators: &str, year: &str) -> String {
    let first = creators
        .split(',')
        .next()
        .unwrap_or("")
        .trim()
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_lowercase())
        .collect::<String>();
    let first = if first.is_empty() {
        "ref".to_string()
    } else {
        first
    };
    format!("{first}{year}")
}

fn row_to_item(row: &rusqlite::Row<'_>) -> Result<Value, rusqlite::Error> {
    let key: String = row.get("key")?;
    let date_added: Option<String> = row.get("dateAdded")?;
    let title: Option<String> = row.get("title")?;
    let raw_date: Option<String> = row.get("rawDate")?;
    let publication: Option<String> = row.get("publication")?;
    let doi: Option<String> = row.get("doi")?;
    let abstract_note: Option<String> = row.get("abstract")?;
    let creators: Option<String> = row.get("creators")?;
    let tags_raw: Option<String> = row.get("tags")?;
    let pdf_path: Option<String> = row.get("pdfPath")?;
    let pdf_key: Option<String> = row.get("pdfKey")?;

    let year = extract_year(raw_date.as_deref().unwrap_or(""));
    let tags: Vec<String> = tags_raw
        .unwrap_or_default()
        .split('\u{1f}')
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect();
    let creators = creators.unwrap_or_default();
    let pdf_path = pdf_path.unwrap_or_default();
    let has_pdf = !pdf_path.is_empty();
    let pdf_file = pdf_path.strip_prefix("storage:").map(str::to_string);
    Ok(json!({
        "key": key,
        "dateAdded": date_added.unwrap_or_default(),
        "title": title.unwrap_or_else(|| "(sans titre)".into()),
        "creators": creators.clone(),
        "year": year.clone(),
        "publication": publication.unwrap_or_default(),
        "doi": doi.unwrap_or_default(),
        "abstract": abstract_note.unwrap_or_default(),
        "tags": tags,
        "hasPdf": has_pdf,
        "pdfKey": pdf_key,
        "pdfFile": pdf_file,
        "citeKey": cite_key(&creators, &year),
    }))
}

fn extract_year(raw: &str) -> String {
    let bytes = raw.as_bytes();
    for i in 0..bytes.len().saturating_sub(3) {
        if bytes[i..i + 4].iter().all(|b| b.is_ascii_digit()) {
            return String::from_utf8_lossy(&bytes[i..i + 4]).into_owned();
        }
    }
    String::new()
}

fn load_favs() -> BTreeSet<String> {
    let path = zotero_favs_path();
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str::<Vec<String>>(&raw)
            .unwrap_or_default()
            .into_iter()
            .collect(),
        Err(_) => BTreeSet::new(),
    }
}

fn save_favs(favs: &BTreeSet<String>) -> Result<(), String> {
    let dir = zotero_cache_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = zotero_favs_path();
    let tmp = dir.join(format!("zotero-favs.json.tmp.{}", std::process::id()));
    let list: Vec<&String> = favs.iter().collect();
    let payload = serde_json::to_vec(&list).map_err(|e| e.to_string())?;
    fs::write(&tmp, payload).map_err(|e| e.to_string())?;
    fs::rename(tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

fn search_items(
    cache: &Mutex<ZoteroCache>,
    query: &str,
    collection_id: Option<&str>,
    limit: usize,
) -> Result<Vec<Value>, String> {
    let copy = ensure_readonly_copy(cache)?;
    let con = open_ro(&copy)?;
    let mut sql = BASE_SQL.to_string();
    let mut rows_out = Vec::new();
    if let Some(cid) = collection_id {
        sql.push_str(
            " AND i.itemID IN (SELECT itemID FROM collectionItems WHERE collectionID = ?)",
        );
        sql.push_str(" ORDER BY i.dateModified DESC LIMIT 2000");
        let mut stmt = con.prepare(&sql).map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(rusqlite::params![cid], row_to_item)
            .map_err(|e| e.to_string())?;
        for row in mapped {
            rows_out.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        sql.push_str(" ORDER BY i.dateModified DESC LIMIT 2000");
        let mut stmt = con.prepare(&sql).map_err(|e| e.to_string())?;
        let mapped = stmt.query_map([], row_to_item).map_err(|e| e.to_string())?;
        for row in mapped {
            rows_out.push(row.map_err(|e| e.to_string())?);
        }
    }

    let q = query.trim().to_ascii_lowercase();
    if !q.is_empty() {
        let terms: Vec<&str> = q.split_whitespace().collect();
        rows_out.retain(|it| {
            let blob = format!(
                "{} {} {} {} {}",
                it.get("title").and_then(Value::as_str).unwrap_or(""),
                it.get("creators").and_then(Value::as_str).unwrap_or(""),
                it.get("year").and_then(Value::as_str).unwrap_or(""),
                it.get("publication").and_then(Value::as_str).unwrap_or(""),
                it.get("tags")
                    .and_then(Value::as_array)
                    .map(|a| a
                        .iter()
                        .filter_map(Value::as_str)
                        .collect::<Vec<_>>()
                        .join(" "))
                    .unwrap_or_default()
            )
            .to_ascii_lowercase();
            terms.iter().all(|t| blob.contains(t))
        });
    }
    let favs = load_favs();
    for it in &mut rows_out {
        if let Some(obj) = it.as_object_mut() {
            let key = obj
                .get("key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            obj.insert("fav".into(), json!(favs.contains(&key)));
        }
    }
    rows_out.truncate(limit);
    Ok(rows_out)
}

fn list_collections(cache: &Mutex<ZoteroCache>) -> Result<Vec<Value>, String> {
    let copy = ensure_readonly_copy(cache)?;
    let con = open_ro(&copy)?;
    let mut stmt = con
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
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "parent": row.get::<_, Option<i64>>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

#[derive(Deserialize, Default)]
pub struct ItemsQuery {
    q: Option<String>,
    collection: Option<String>,
}

pub async fn zotero_items(
    State(state): State<AppState>,
    Query(query): Query<ItemsQuery>,
) -> impl IntoResponse {
    let q = query.q.unwrap_or_default();
    let collection = query.collection.filter(|s| !s.is_empty());
    match search_items(&state.zotero, &q, collection.as_deref(), 400) {
        Ok(items) => (StatusCode::OK, Json(json!({"items": items}))).into_response(),
        Err(error) if error.contains("introuvable") => {
            (StatusCode::OK, Json(json!({"items": [], "error": error}))).into_response()
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

pub async fn zotero_collections(State(state): State<AppState>) -> impl IntoResponse {
    match list_collections(&state.zotero) {
        Ok(collections) => {
            (StatusCode::OK, Json(json!({"collections": collections}))).into_response()
        }
        Err(error) if error.contains("introuvable") => (
            StatusCode::OK,
            Json(json!({"collections": [], "error": error})),
        )
            .into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

#[derive(Deserialize)]
pub struct FavBody {
    key: Option<String>,
    on: Option<Value>,
}

pub async fn zotero_fav(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<FavBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let key = body.key.as_deref().unwrap_or("").trim().to_string();
    if key.len() != 8 || !key.chars().all(|c| c.is_ascii_alphanumeric()) {
        return json_error(StatusCode::BAD_REQUEST, "bad key");
    }
    let on = match &body.on {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Value::String(s)) => s == "1" || s.eq_ignore_ascii_case("true"),
        _ => false,
    };
    let mut favs = load_favs();
    if on {
        favs.insert(key.clone());
    } else {
        favs.remove(&key);
    }
    match save_favs(&favs) {
        Ok(()) => (StatusCode::OK, Json(json!({"key": key, "fav": on}))).into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

/// POST /zotero-add?name=*.pdf — body = raw PDF bytes.
pub async fn zotero_add(
    State(state): State<AppState>,
    headers: HeaderMap,
    uri: axum::http::Uri,
    body: Bytes,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let name = {
        let q = uri.query().unwrap_or("");
        let mut name = "document.pdf".to_string();
        for pair in q.split('&') {
            if let Some(v) = pair.strip_prefix("name=") {
                name = urlencoding_decode(v);
                break;
            }
        }
        Path::new(&name)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("document.pdf")
            .to_string()
    };
    if !name.to_ascii_lowercase().ends_with(".pdf") {
        return json_error(StatusCode::BAD_REQUEST, "PDF only");
    }
    if body.is_empty() || body.len() > 200 * 1024 * 1024 {
        return json_error(StatusCode::BAD_REQUEST, "bad size");
    }
    let md5 = {
        let mut h = Md5::new();
        h.update(&body);
        hex::encode(h.finalize())
    };
    // Duplicate check best-effort (requires Zotero DB).
    if let Ok(dup) = find_duplicate(&state.zotero, &md5, &name) {
        return (
            StatusCode::OK,
            Json(json!({"name": name, "ok": false, "error": "duplicate", "match": dup})),
        )
            .into_response();
    }
    // POST to local Zotero connector — never shell.
    let session: String = {
        let mut h = Md5::new();
        h.update(std::process::id().to_string().as_bytes());
        hex::encode(h.finalize())[..8].to_string()
    };
    let metadata = json!({
        "url": format!("file:///{name}"),
        "title": name,
        "sessionID": session,
    });
    // Use curl-free: tokio + hyper would need extra dep; use std::process? No —
    // use `reqwest`? Prefer std TCP is heavy. Use `Command` curl? Plan says no shell.
    // Use raw TCP with minimal HTTP or tokio::net.
    match post_connector_pdf(&body, &metadata.to_string()).await {
        Ok(status) => (
            StatusCode::OK,
            Json(json!({"name": name, "ok": status == 201, "status": status})),
        )
            .into_response(),
        Err(_) => (
            StatusCode::OK,
            Json(json!({"name": name, "ok": false, "error": "zotero-off"})),
        )
            .into_response(),
    }
}

fn urlencoding_decode(s: &str) -> String {
    // Minimal percent-decode for filenames.
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && let (Ok(h), Ok(l)) = (
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 2]).unwrap_or(""), 16),
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 2..i + 3]).unwrap_or(""), 16),
            )
        {
            out.push((h << 4) | l);
            i += 3;
            continue;
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn find_duplicate(cache: &Mutex<ZoteroCache>, md5: &str, fname: &str) -> Result<String, String> {
    let copy = ensure_readonly_copy(cache)?;
    let con = open_ro(&copy)?;
    let mut stmt = con
        .prepare(
            r#"
            SELECT ia.path, ia.storageHash, ai.key AS attKey,
              COALESCE((SELECT v.value FROM itemData dd
                 JOIN fields f ON f.fieldID = dd.fieldID AND f.fieldName = 'title'
                 JOIN itemDataValues v ON v.valueID = dd.valueID
               WHERE dd.itemID = ia.parentItemID), ia.path) AS parentTitle
            FROM itemAttachments ia
            JOIN items ai ON ai.itemID = ia.itemID
            WHERE ia.contentType = 'application/pdf' AND ia.path LIKE 'storage:%'
              AND ai.itemID NOT IN (SELECT itemID FROM deletedItems)
            "#,
        )
        .map_err(|e| e.to_string())?;
    let base = fname.to_ascii_lowercase();
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let path: String = row.get(0).map_err(|e| e.to_string())?;
        let storage_hash: Option<String> = row.get(1).map_err(|e| e.to_string())?;
        let att_key: String = row.get(2).map_err(|e| e.to_string())?;
        let parent_title: String = row.get(3).map_err(|e| e.to_string())?;
        let f = path.strip_prefix("storage:").unwrap_or(&path);
        if storage_hash.as_deref() == Some(md5) {
            return Ok(parent_title);
        }
        if f.to_ascii_lowercase() == base {
            return Ok(parent_title);
        }
        if storage_hash.is_none() {
            let stored = zotero_dir().join("storage").join(&att_key).join(f);
            if stored.is_file()
                && let Ok(bytes) = fs::read(&stored)
            {
                let mut h = Md5::new();
                h.update(&bytes);
                if hex::encode(h.finalize()) == md5 {
                    return Ok(parent_title);
                }
            }
        }
    }
    Err("no duplicate".into())
}

async fn post_connector_pdf(data: &[u8], metadata: &str) -> Result<u16, String> {
    // Minimal HTTP/1.1 client via tokio TCP — no extra HTTP crate.
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut stream = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::net::TcpStream::connect("127.0.0.1:23119"),
    )
    .await
    .map_err(|_| "timeout".to_string())?
    .map_err(|e| e.to_string())?;

    let header = format!(
        "POST /connector/saveStandaloneAttachment HTTP/1.1\r\n\
         Host: 127.0.0.1:23119\r\n\
         Content-Type: application/pdf\r\n\
         Content-Length: {}\r\n\
         X-Metadata: {}\r\n\
         Connection: close\r\n\
         \r\n",
        data.len(),
        metadata.replace('\n', " ")
    );
    stream
        .write_all(header.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stream.write_all(data).await.map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; 4096];
    let n = tokio::time::timeout(Duration::from_secs(30), stream.read(&mut buf))
        .await
        .map_err(|_| "timeout".to_string())?
        .map_err(|e| e.to_string())?;
    let resp = String::from_utf8_lossy(&buf[..n]);
    // HTTP/1.1 201 Created
    let status = resp
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    Ok(status)
}

/// GET /zotero/<KEY>/<file>.pdf — only meaningful in studio; always registered.
pub async fn zotero_pdf(
    axum::extract::Path((key, fname)): axum::extract::Path<(String, String)>,
) -> impl IntoResponse {
    if key.len() != 8 || !key.chars().all(|c| c.is_ascii_alphanumeric()) {
        return json_error(StatusCode::NOT_FOUND, "not found");
    }
    if !fname.to_ascii_lowercase().ends_with(".pdf") || fname.contains('/') || fname.contains('\\')
    {
        return json_error(StatusCode::NOT_FOUND, "not found");
    }
    let zroot = match fs::canonicalize(zotero_dir().join("storage")) {
        Ok(p) => p,
        Err(_) => return json_error(StatusCode::NOT_FOUND, "not found"),
    };
    let candidate = zroot.join(&key).join(&fname);
    let Ok(rp) = fs::canonicalize(&candidate) else {
        return json_error(StatusCode::NOT_FOUND, "not found");
    };
    if !rp.starts_with(&zroot) || !rp.is_file() {
        return json_error(StatusCode::NOT_FOUND, "not found");
    }
    match fs::read(&rp) {
        Ok(data) => (
            StatusCode::OK,
            [(
                header::CONTENT_TYPE,
                header::HeaderValue::from_static("application/pdf"),
            )],
            data,
        )
            .into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "read error"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cite_key_strips_non_alpha() {
        assert_eq!(cite_key("Dupont, Jean", "2020"), "dupont2020");
        assert_eq!(cite_key("", ""), "ref");
    }

    #[test]
    fn extract_year_finds_four_digits() {
        assert_eq!(extract_year("2020-05-01"), "2020");
        assert_eq!(extract_year("no year"), "");
    }

    #[test]
    fn key_validation_shape() {
        let key = "ABCD1234";
        assert_eq!(key.len(), 8);
        assert!(key.chars().all(|c| c.is_ascii_alphanumeric()));
    }
}
