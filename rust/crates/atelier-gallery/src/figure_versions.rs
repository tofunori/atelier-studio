//! Immutable, project-local history of raster figures. A version is kept each
//! time a figure's bytes change: when the catalog is rebuilt after a write
//! (watcher, boot, rescan) and when the viewer asks for a figure's history.
//! Copies of the same figure in several folders share one history: identical
//! bytes count once, and each copy is reported with the version it holds.
//! Replacing the source never rewrites an earlier version. SQLite commits the
//! image and its metadata together, including across concurrent gallery panes.
//! The notes drawn on a version (`figure_notes`) live in the same database,
//! keyed by the version's hash; a version that carries notes is never thinned.
use crate::{AppState, request_allowed};
use atelier_core::safe_project_path;
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: u64 = 32 * 1024 * 1024;
/// Above this many stored bytes, the oldest versions are thinned out (the
/// first and the last [`KEEP_RECENT`] versions of each file always stay).
const STORE_CAP: i64 = 1024 * 1024 * 1024;
const KEEP_RECENT: i64 = 10;
const RASTER: [&str; 3] = ["png", "jpg", "jpeg"];
type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Deserialize)]
pub struct FigureQuery {
    path: Option<String>,
    version: Option<i64>,
    hash: Option<String>,
}

#[derive(Deserialize)]
pub struct HistoryBody {
    paths: Vec<String>,
}

pub(crate) fn database(root: &Path) -> Result<Connection> {
    let dir = safe_project_path(root, ".fig_thumbs")?;
    fs::create_dir_all(&dir)?;
    let path = safe_project_path(root, ".fig_thumbs/figure_versions.sqlite")?;
    let db = Connection::open(path)?;
    db.busy_timeout(Duration::from_secs(5))?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS figure_versions (
        path TEXT NOT NULL, version INTEGER NOT NULL, hash TEXT NOT NULL,
        created INTEGER NOT NULL, mime TEXT NOT NULL, image BLOB NOT NULL,
        PRIMARY KEY(path, version));
        CREATE INDEX IF NOT EXISTS figure_versions_hash ON figure_versions(hash);
        CREATE TABLE IF NOT EXISTS figure_seen (
        path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS figure_notes (
        hash TEXT NOT NULL, id TEXT NOT NULL, n INTEGER NOT NULL, kind TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
        text TEXT NOT NULL, status TEXT NOT NULL, t INTEGER NOT NULL,
        sent INTEGER, done INTEGER, PRIMARY KEY(hash, id));",
    )?;
    Ok(db)
}

fn image_type(path: &Path, bytes: &[u8]) -> Result<&'static str> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    // Do not snapshot an in-progress save or serve active content under an image MIME.
    if ext == "png"
        && bytes.starts_with(b"\x89PNG\r\n\x1a\n")
        && bytes.ends_with(b"\0\0\0\0IEND\xaeB`\x82")
    {
        return Ok("image/png");
    }
    if (ext == "jpg" || ext == "jpeg")
        && bytes.starts_with(b"\xff\xd8\xff")
        && bytes.ends_with(b"\xff\xd9")
    {
        return Ok("image/jpeg");
    }
    Err("Image absente, incomplète ou format non pris en charge".into())
}

fn millis(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

/// Reads a file only when it is not being written: size and mtime must not
/// move during the read.
fn read_stable(path: &Path) -> Result<(Vec<u8>, fs::Metadata)> {
    let file = fs::File::open(path)?;
    let before = file.metadata()?;
    if !before.is_file() || before.len() > MAX_BYTES {
        return Err("Image trop volumineuse (32 Mio maximum)".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    let after = fs::metadata(path)?;
    if bytes.len() as u64 > MAX_BYTES
        || before.len() != bytes.len() as u64
        || before.len() != after.len()
        || before.modified()? != after.modified()?
    {
        return Err("Image en cours d’écriture".into());
    }
    Ok((bytes, after))
}

/// Stores the file's current bytes as a new version when they differ from the
/// last stored version of that file. Returns whether a version was added.
fn capture_path(db: &mut Connection, path: &Path) -> Result<bool> {
    let (bytes, meta) = read_stable(path)?;
    let mime = image_type(path, &bytes)?;
    let hash = hex::encode(Sha256::digest(&bytes));
    let key = path.to_string_lossy().to_string();
    let mtime = millis(meta.modified()?);
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let last: Option<(i64, String, i64)> = tx
        .query_row(
            "SELECT version, hash, created FROM figure_versions WHERE path=?1 ORDER BY version DESC LIMIT 1",
            [&key],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let added = last.as_ref().is_none_or(|(_, old, _)| old != &hash);
    if added {
        let version = last.as_ref().map_or(1, |(v, _, _)| v + 1);
        // The file's own time dates the version (a figure seen for the first
        // time keeps the day it was made); it never goes back in time.
        let created = last.as_ref().map_or(mtime, |(_, _, c)| mtime.max(c + 1));
        tx.execute(
            "INSERT INTO figure_versions VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![key, version, hash, created, mime, bytes],
        )?;
    }
    tx.execute(
        "INSERT INTO figure_seen VALUES (?1, ?2, ?3) ON CONFLICT(path) DO UPDATE SET size=?2, mtime=?3",
        params![key, meta.len() as i64, mtime],
    )?;
    tx.commit()?;
    Ok(added)
}

/// The file's size and mtime are those recorded at its last capture.
fn seen_unchanged(db: &Connection, path: &Path) -> bool {
    let Ok(meta) = fs::metadata(path) else {
        return false;
    };
    let stamp = (meta.len() as i64, meta.modified().map_or(0, millis));
    db.query_row(
        "SELECT size, mtime FROM figure_seen WHERE path=?1",
        [path.to_string_lossy()],
        |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
    )
    .optional()
    .ok()
    .flatten()
        == Some(stamp)
}

/// Thins the oldest versions out once the store exceeds `cap` bytes.
fn prune(db: &Connection, cap: i64) -> Result<usize> {
    let mut total: i64 = db.query_row(
        "SELECT COALESCE(SUM(length(image)),0) FROM figure_versions",
        [],
        |r| r.get(0),
    )?;
    if total <= cap {
        return Ok(0);
    }
    let candidates: Vec<(String, i64, i64)> = {
        let mut query = db.prepare(
            "SELECT v.path, v.version, length(v.image) FROM figure_versions v
             WHERE v.version > (SELECT MIN(version) FROM figure_versions m WHERE m.path=v.path)
               AND v.version <= (SELECT MAX(version) FROM figure_versions m WHERE m.path=v.path) - ?1
               AND NOT EXISTS (SELECT 1 FROM figure_notes n WHERE n.hash=v.hash)
             ORDER BY v.created, v.path, v.version",
        )?;
        query
            .query_map([KEEP_RECENT], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<std::result::Result<_, _>>()?
    };
    let mut removed = 0;
    for (path, version, size) in candidates {
        if total <= cap {
            break;
        }
        db.execute(
            "DELETE FROM figure_versions WHERE path=?1 AND version=?2",
            params![path, version],
        )?;
        total -= size;
        removed += 1;
    }
    Ok(removed)
}

fn store_cap() -> i64 {
    std::env::var("ATELIER_FIGURE_HISTORY_CAP_MB")
        .ok()
        .and_then(|v| v.parse::<i64>().ok())
        .filter(|v| *v > 0)
        .map_or(STORE_CAP, |mb| mb * 1024 * 1024)
}

fn is_history_figure(rel: &str, ext: &str, archive: bool) -> bool {
    !archive
        && RASTER.contains(&ext.to_ascii_lowercase().as_str())
        && !rel.starts_with("images-generees/")
        && !rel.starts_with(".fig_thumbs/")
}

/// Captures every catalogued raster figure whose size or mtime moved since
/// it was last seen. Unchanged files cost one `stat`.
pub(crate) fn capture_catalog(root: &Path) -> Result<usize> {
    let data: Value = serde_json::from_slice(&fs::read(root.join("figures_data.json"))?)?;
    let mut db = database(root)?;
    let seen: HashMap<String, (i64, i64)> = {
        let mut query = db.prepare("SELECT path, size, mtime FROM figure_seen")?;
        query
            .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get(1)?, r.get(2)?))))?
            .collect::<std::result::Result<_, _>>()?
    };
    let mut added = 0;
    for row in data["files"].as_array().into_iter().flatten() {
        let (Some(rel), Some(ext)) = (row["rel"].as_str(), row["ext"].as_str()) else {
            continue;
        };
        if !is_history_figure(rel, ext, row["archive"].as_bool().unwrap_or(false)) {
            continue;
        }
        let Ok(path) = safe_project_path(root, rel) else {
            continue;
        };
        let Ok(meta) = fs::metadata(&path) else {
            continue;
        };
        let stamp = (meta.len() as i64, meta.modified().map_or(0, millis));
        if seen.get(path.to_string_lossy().as_ref()) == Some(&stamp) {
            continue;
        }
        // A file still being written is retried at the next rebuild.
        if let Ok(true) = capture_path(&mut db, &path) {
            added += 1;
        }
    }
    prune(&db, store_cap())?;
    Ok(added)
}

static CATALOG_RUNNING: AtomicBool = AtomicBool::new(false);

/// Runs [`capture_catalog`] off the request path; overlapping runs collapse.
pub(crate) fn capture_catalog_in_background(root: PathBuf) {
    if CATALOG_RUNNING.swap(true, Ordering::AcqRel) {
        return;
    }
    tokio::task::spawn_blocking(move || {
        if let Err(error) = capture_catalog(&root) {
            eprintln!("[figure-history] {error}");
        }
        CATALOG_RUNNING.store(false, Ordering::Release);
    });
}

/// Dossier où le chat range ses figures (`atelier_workspace::gallery_rel_for_image`).
const CHAT_DIR: &str = "images-generees/";

fn is_chat_snapshot(rel: &str) -> bool {
    rel.starts_with(CHAT_DIR)
}

/// Nom d'une figure, tel que la galerie la range en pile : le nom du fichier
/// sans extension, et pour une copie du chat sans son court hachage
/// (`<nom>-<8 hex>`).
fn figure_key(rel: &str) -> Option<(String, String)> {
    let name = rel.rsplit('/').next()?;
    let (stem, ext) = name.rsplit_once('.')?;
    let ext = ext.to_ascii_lowercase();
    if !RASTER.contains(&ext.as_str()) {
        return None;
    }
    let mut stem = stem.to_lowercase();
    if is_chat_snapshot(rel) {
        match stem.rsplit_once('-') {
            Some((base, hash))
                if hash.len() == 8 && hash.bytes().all(|b| b.is_ascii_hexdigit()) =>
            {
                stem = base.to_string()
            }
            _ => return None,
        }
    }
    (!stem.is_empty()).then_some((stem, ext))
}

/// Chaque figure enregistrée depuis le chat est une copie neuve
/// (`images-generees/<nom>-<hachage>.png`) : la version suivante d'une figure
/// du chat arrivait donc sous un autre nom, avec un historique d'une seule
/// version, et les notes de la précédente semblaient perdues. Ces copies sont
/// des instantanés de la même figure : on les joint à son historique, même
/// quand la page ne les connaît pas encore (enregistrées pendant que la
/// visionneuse est ouverte).
fn with_chat_snapshots(root: &Path, rels: &[String]) -> Vec<String> {
    let mut all: Vec<String> = Vec::with_capacity(rels.len());
    for rel in rels {
        if !all.contains(rel) {
            all.push(rel.clone());
        }
    }
    let keys: Vec<(String, String)> = all.iter().filter_map(|r| figure_key(r)).collect();
    if keys.is_empty() {
        return all;
    }
    let Ok(dir) = safe_project_path(root, CHAT_DIR.trim_end_matches('/')) else {
        return all;
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return all;
    };
    let mut found: Vec<(SystemTime, String)> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| {
            let rel = format!("{CHAT_DIR}{}", e.file_name().to_str()?);
            let key = figure_key(&rel)?;
            if all.contains(&rel) || !keys.contains(&key) {
                return None;
            }
            Some((e.metadata().ok()?.modified().ok()?, rel))
        })
        .collect();
    // Les plus récentes d'abord, dans la limite d'une requête.
    found.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    let room = 64usize.saturating_sub(all.len());
    all.extend(found.into_iter().take(room).map(|(_, rel)| rel));
    all
}

/// One history for a figure and all its copies (`rels`, lead first): versions
/// ordered by date, a version that repeats the previous bytes counts once.
/// The chat's saved copies of the figure join it ([`with_chat_snapshots`]); a
/// chat copy whose bytes already are a version adds nothing.
fn history(root: &Path, rels: &[String]) -> Result<Value> {
    if rels.is_empty() || rels.len() > 64 {
        return Err("Liste de fichiers invalide".into());
    }
    let joined = with_chat_snapshots(root, rels);
    let rels = joined.as_slice();
    let mut db = database(root)?;
    struct Stored {
        file: usize,
        version: i64,
        hash: String,
        created: i64,
        size: i64,
    }
    let mut stored: Vec<Stored> = Vec::new();
    let mut latest: Vec<Option<String>> = vec![None; rels.len()];
    for (file, rel) in rels.iter().enumerate() {
        let path = safe_project_path(root, rel)?;
        // A copy being rewritten keeps its previous versions. A chat copy is
        // written once: after its first capture, a `stat` is enough.
        if !(is_chat_snapshot(rel) && seen_unchanged(&db, &path)) {
            let _ = capture_path(&mut db, &path);
        }
        let mut query = db.prepare_cached(
            "SELECT version, hash, created, length(image) FROM figure_versions WHERE path=?1 ORDER BY version",
        )?;
        let found = query.query_map([path.to_string_lossy()], |r| {
            Ok(Stored {
                file,
                version: r.get(0)?,
                hash: r.get(1)?,
                created: r.get(2)?,
                size: r.get(3)?,
            })
        })?;
        for item in found {
            let item = item?;
            latest[file] = Some(item.hash.clone());
            stored.push(item);
        }
    }
    // Date, then the lead before its copies, then each file's own order.
    stored.sort_by_key(|s| (s.created, s.file, s.version));
    let mut versions: Vec<Value> = Vec::new();
    let mut previous = "";
    let mut bytes = 0i64;
    let mut known: std::collections::HashSet<&str> = stored
        .iter()
        .filter(|s| !is_chat_snapshot(&rels[s.file]))
        .map(|s| s.hash.as_str())
        .collect();
    for item in &stored {
        if item.hash == previous {
            continue;
        }
        // Instantané du chat : une version de plus seulement s'il apporte du neuf.
        if is_chat_snapshot(&rels[item.file]) && !known.insert(item.hash.as_str()) {
            continue;
        }
        previous = &item.hash;
        bytes += item.size;
        let mut version = json!({"version": versions.len() + 1, "hash": item.hash, "created": item.created, "rel": rels[item.file], "bytes": item.size});
        // Les notes posées sur cette version voyagent avec elle.
        let notes = crate::figure_notes::stored(&db, &item.hash)?;
        if !notes.is_empty() {
            version["notes"] = Value::Array(notes);
        }
        versions.push(version);
    }
    if versions.is_empty() {
        return Err("Aucune version lisible".into());
    }
    // Une copie du chat est un instantané figé, jamais « en retard » : seule
    // celle qu'on a ouverte (la première) dit quelle version elle montre.
    let copies: Vec<Value> = rels
        .iter()
        .zip(&latest)
        .enumerate()
        .filter(|(i, (rel, _))| *i == 0 || !is_chat_snapshot(rel))
        .filter_map(|(_, (rel, hash))| {
            let hash = hash.as_deref()?;
            let version = versions.iter().rev().find(|v| v["hash"] == hash)?["version"].clone();
            Some(json!({"rel": rel, "version": version}))
        })
        .collect();
    Ok(json!({"versions": versions, "copies": copies, "bytes": bytes}))
}

pub async fn figure_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<HistoryBody>,
) -> Response {
    if !request_allowed(&headers, &state) {
        return StatusCode::FORBIDDEN.into_response();
    }
    match tokio::task::spawn_blocking(move || history(&state.root, &body.paths)).await {
        Ok(Ok(value)) => ([("Cache-Control", "no-store")], Json(value)).into_response(),
        _ => (StatusCode::CONFLICT, Json(json!({"error":"Historique indisponible : image en cours d’écriture, non prise en charge ou stockage inaccessible."}))).into_response(),
    }
}

pub async fn image(State(state): State<AppState>, Query(query): Query<FigureQuery>) -> Response {
    let result = tokio::task::spawn_blocking(move || -> Result<(String, Vec<u8>)> {
        let db = database(&state.root)?;
        if let Some(hash) = query
            .hash
            .filter(|h| h.len() == 64 && h.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Ok(db.query_row(
                "SELECT mime, image FROM figure_versions WHERE hash=?1 LIMIT 1",
                [hash],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?);
        }
        let path = safe_project_path(&state.root, query.path.as_deref().unwrap_or(""))?;
        Ok(db.query_row(
            "SELECT mime, image FROM figure_versions WHERE path=?1 AND version=?2",
            params![path.to_string_lossy(), query.version.unwrap_or(0)],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?)
    })
    .await;
    match result {
        Ok(Ok((mime, bytes))) => (
            [
                ("Content-Type", mime),
                (
                    "Cache-Control",
                    "private, max-age=31536000, immutable".into(),
                ),
                ("X-Content-Type-Options", "nosniff".into()),
            ],
            bytes,
        )
            .into_response(),
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn png(marker: u8) -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.push(marker);
        bytes.extend_from_slice(b"\0\0\0\0IEND\xaeB`\x82");
        bytes
    }
    fn write(path: &Path, bytes: &[u8]) {
        fs::write(path, bytes).unwrap();
        // distinct mtimes on coarse file systems
        std::thread::sleep(Duration::from_millis(5));
    }
    fn hist(root: &Path, rels: &[&str]) -> Value {
        history(
            root,
            &rels.iter().map(|r| r.to_string()).collect::<Vec<_>>(),
        )
        .unwrap()
    }
    #[test]
    fn snapshots_survive_overwrite_and_reopen_without_duplicate_versions() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("figure.png");
        write(&path, &png(1));
        assert_eq!(
            hist(root.path(), &["figure.png"])["versions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            hist(root.path(), &["figure.png"])["versions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        write(&path, &png(2));
        assert_eq!(
            hist(root.path(), &["figure.png"])["versions"][1]["version"],
            2
        );
        let db = database(root.path()).unwrap();
        let old: Vec<u8> = db
            .query_row(
                "SELECT image FROM figure_versions WHERE version=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(old, png(1));
        // going back to earlier bytes is a new step of the history
        write(&path, &png(1));
        let value = hist(root.path(), &["figure.png"]);
        assert_eq!(value["versions"][2]["version"], 3);
        assert_eq!(value["copies"][0]["version"], 3);
    }
    #[test]
    fn copies_share_one_history_and_report_the_version_they_hold() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("manuscrit")).unwrap();
        let lead = root.path().join("fig.png");
        let copy = root.path().join("manuscrit/fig.png");
        write(&lead, &png(1));
        write(&copy, &png(1));
        hist(root.path(), &["fig.png", "manuscrit/fig.png"]);
        write(&lead, &png(2));
        let value = hist(root.path(), &["fig.png", "manuscrit/fig.png"]);
        let versions = value["versions"].as_array().unwrap();
        assert_eq!(versions.len(), 2, "identical copy counts once: {value}");
        assert_eq!(value["copies"][0], json!({"rel":"fig.png","version":2}));
        assert_eq!(
            value["copies"][1],
            json!({"rel":"manuscrit/fig.png","version":1})
        );
        assert!(value["bytes"].as_i64().unwrap() > 0);
    }
    #[test]
    fn catalog_capture_keeps_versions_written_while_the_viewer_is_closed() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("plot.png");
        fs::write(
            root.path().join("figures_data.json"),
            r#"{"files":[{"rel":"plot.png","ext":"png"},{"rel":"images-generees/x.png","ext":"png"},{"rel":"_archives/plot.png","ext":"png","archive":true}]}"#,
        )
        .unwrap();
        write(&path, &png(1));
        assert_eq!(capture_catalog(root.path()).unwrap(), 1);
        assert_eq!(
            capture_catalog(root.path()).unwrap(),
            0,
            "unchanged file is only stat'ed"
        );
        write(&path, &png(2));
        assert_eq!(capture_catalog(root.path()).unwrap(), 1);
        write(&path, &png(3));
        assert_eq!(capture_catalog(root.path()).unwrap(), 1);
        assert_eq!(
            hist(root.path(), &["plot.png"])["versions"]
                .as_array()
                .unwrap()
                .len(),
            3
        );
    }
    #[test]
    fn prune_keeps_first_and_recent_versions() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("big.png");
        let mut db = database(root.path()).unwrap();
        for i in 0..20u8 {
            write(&path, &png(i));
            capture_path(&mut db, &path).unwrap();
        }
        let removed = prune(&db, 1).unwrap();
        assert_eq!(removed, 20 - 1 - KEEP_RECENT as usize);
        let kept: Vec<i64> = db
            .prepare("SELECT version FROM figure_versions ORDER BY version")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(|v| v.unwrap())
            .collect();
        assert_eq!(kept[0], 1);
        assert_eq!(kept.len(), 1 + KEEP_RECENT as usize);
        assert_eq!(*kept.last().unwrap(), 20);
    }
    #[test]
    fn history_carries_each_version_notes_and_pruning_spares_a_noted_version() {
        let root = tempfile::tempdir().unwrap();
        // The history reads versions under the canonical path (/private/var on macOS).
        let dir = root.path().canonicalize().unwrap();
        let path = dir.join("fig.png");
        let mut db = database(&dir).unwrap();
        for i in 0..20u8 {
            write(&path, &png(i));
            capture_path(&mut db, &path).unwrap();
        }
        let hash: String = db
            .query_row("SELECT hash FROM figure_versions WHERE version=4", [], |r| r.get(0))
            .unwrap();
        db.execute(
            "INSERT INTO figure_notes VALUES (?1, 'n1', 1, 'box', 0.1, 0.2, 0.3, 0.4, 'Titre trop long', 'sent', 5, 6, NULL)",
            [&hash],
        )
        .unwrap();
        let versions = hist(&dir, &["fig.png"])["versions"].clone();
        assert_eq!(versions[3]["notes"][0]["text"], "Titre trop long");
        assert_eq!(versions[3]["notes"][0]["status"], "sent");
        assert!(versions[2].get("notes").is_none(), "une version sans note n'en annonce pas");
        // v4 is old enough to be thinned out, but it carries a note.
        assert_eq!(prune(&db, 1).unwrap(), 20 - 1 - KEEP_RECENT as usize - 1);
        let kept: i64 = db
            .query_row("SELECT COUNT(*) FROM figure_versions WHERE hash=?1", [&hash], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, 1);
    }
    #[test]
    fn chat_copies_of_a_figure_stack_as_versions_and_keep_their_notes() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().canonicalize().unwrap();
        fs::create_dir_all(dir.join("images-generees")).unwrap();
        let first = "images-generees/fig_tests_droite_courbe-f5616df8.png";
        let second = "images-generees/fig_tests_droite_courbe-b5b5ca0d.png";
        write(&dir.join(first), &png(1));
        // Une autre figure du chat et l'ancien nommage par hachage seul restent à part.
        write(&dir.join("images-generees/fig_autre-0123abcd.png"), &png(7));
        write(&dir.join("images-generees/image-0123456789abcdef0123456789abcdef.png"), &png(8));
        let one = hist(&dir, &[first]);
        assert_eq!(one["versions"].as_array().unwrap().len(), 1, "{one}");
        let hash = one["versions"][0]["hash"].as_str().unwrap().to_string();
        let db = database(&dir).unwrap();
        db.execute(
            "INSERT INTO figure_notes VALUES (?1, 'n1', 1, 'box', 0.1, 0.2, 0.3, 0.4, 'Surligner 2023', 'sent', 5, 6, NULL)",
            [&hash],
        )
        .unwrap();
        // Le chat refait la figure ; elle est enregistrée sous un autre nom.
        write(&dir.join(second), &png(2));
        for (opened, held) in [(second, 2), (first, 1)] {
            let value = hist(&dir, &[opened]);
            let versions = value["versions"].as_array().unwrap();
            assert_eq!(versions.len(), 2, "{value}");
            assert_eq!(versions[0]["rel"], first);
            assert_eq!(versions[0]["notes"][0]["text"], "Surligner 2023");
            assert_eq!(versions[1]["rel"], second);
            assert!(versions[1].get("notes").is_none());
            // Seule la copie ouverte est rapportée : un instantané n'est jamais « en retard ».
            assert_eq!(value["copies"], json!([{"rel": opened, "version": held}]));
        }
        // Enregistrer de nouveau une figure déjà connue n'ajoute pas de version.
        write(&dir.join("images-generees/fig_tests_droite_courbe-0000aaaa.png"), &png(1));
        assert_eq!(hist(&dir, &[second])["versions"].as_array().unwrap().len(), 2);
    }
    #[test]
    fn a_project_figure_gains_the_chat_versions_saved_beside_it() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().canonicalize().unwrap();
        fs::create_dir_all(dir.join("images-generees")).unwrap();
        write(&dir.join("Fig4.png"), &png(1));
        hist(&dir, &["Fig4.png"]);
        write(&dir.join("images-generees/fig4-1111aaaa.png"), &png(1));
        write(&dir.join("images-generees/fig4-2222bbbb.png"), &png(2));
        let value = hist(&dir, &["Fig4.png"]);
        let versions = value["versions"].as_array().unwrap();
        assert_eq!(versions.len(), 2, "{value}");
        assert_eq!(versions[1]["rel"], "images-generees/fig4-2222bbbb.png");
        assert_eq!(value["copies"], json!([{"rel": "Fig4.png", "version": 1}]));
    }
    #[test]
    fn rejects_partial_files_and_paths_outside_project() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        fs::write(root.path().join("bad.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        assert!(history(root.path(), &["bad.png".into()]).is_err());
        let outside = other.path().join("secret.png");
        fs::write(&outside, png(1)).unwrap();
        assert!(history(root.path(), &[outside.to_string_lossy().to_string()]).is_err());
        #[cfg(unix)]
        {
            let linked = tempfile::tempdir().unwrap();
            std::os::unix::fs::symlink(other.path(), linked.path().join(".fig_thumbs")).unwrap();
            assert!(database(linked.path()).is_err());
        }
    }
}
