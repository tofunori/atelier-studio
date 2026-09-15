//! Immutable, project-local snapshots of raster figures observed by the viewer.
//! Replacing the source never rewrites an earlier version. SQLite commits the
//! image and its metadata together, including across concurrent gallery panes.
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
    fs,
    io::Read,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: u64 = 32 * 1024 * 1024;
type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Deserialize)]
pub struct FigureQuery {
    path: String,
    version: Option<i64>,
}

fn database(root: &Path) -> Result<Connection> {
    let dir = safe_project_path(root, ".fig_thumbs")?;
    fs::create_dir_all(&dir)?;
    let path = safe_project_path(root, ".fig_thumbs/figure_versions.sqlite")?;
    let db = Connection::open(path)?;
    db.busy_timeout(Duration::from_secs(5))?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS figure_versions (
        path TEXT NOT NULL, version INTEGER NOT NULL, hash TEXT NOT NULL,
        created INTEGER NOT NULL, mime TEXT NOT NULL, image BLOB NOT NULL,
        PRIMARY KEY(path, version));",
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

fn capture(root: &Path, requested: &str) -> Result<Value> {
    let path = safe_project_path(root, requested)?;
    let mut db = database(root)?;
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    let file = fs::File::open(&path)?;
    let before = file.metadata()?;
    if !before.is_file() || before.len() > MAX_BYTES {
        return Err("Image trop volumineuse (32 Mio maximum)".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    let after = fs::metadata(&path)?;
    if bytes.len() as u64 > MAX_BYTES
        || before.len() != bytes.len() as u64
        || before.len() != after.len()
        || before.modified()? != after.modified()?
    {
        return Err("Image en cours d’écriture".into());
    }
    let mime = image_type(&path, &bytes)?;
    let hash = hex::encode(Sha256::digest(&bytes));
    let key = path.to_string_lossy().to_string();
    let last: Option<(i64, String)> = tx
        .query_row(
            "SELECT version, hash FROM figure_versions WHERE path=?1 ORDER BY version DESC LIMIT 1",
            [&key],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    if last.as_ref().is_none_or(|(_, old)| old != &hash) {
        let version = last.as_ref().map_or(1, |(v, _)| v + 1);
        let created = SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as i64;
        tx.execute(
            "INSERT INTO figure_versions VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![key, version, hash, created, mime, bytes],
        )?;
    }
    let versions = {
        let mut query = tx.prepare(
            "SELECT version, hash, created FROM figure_versions WHERE path=?1 ORDER BY version",
        )?;
        query.query_map([&key], |r| Ok(json!({"version":r.get::<_, i64>(0)?, "hash":r.get::<_, String>(1)?, "created":r.get::<_, i64>(2)?})))?
            .collect::<std::result::Result<Vec<_>, _>>()?
    };
    tx.commit()?;
    Ok(json!({"versions": versions}))
}

pub async fn snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<FigureQuery>,
) -> Response {
    if !request_allowed(&headers, &state) {
        return StatusCode::FORBIDDEN.into_response();
    }
    match tokio::task::spawn_blocking(move || capture(&state.root, &query.path)).await {
        Ok(Ok(value)) => ([("Cache-Control", "no-store")], Json(value)).into_response(),
        _ => (StatusCode::CONFLICT, Json(json!({"error":"Historique indisponible : image en cours d’écriture, non prise en charge ou stockage inaccessible."}))).into_response(),
    }
}

pub async fn image(State(state): State<AppState>, Query(query): Query<FigureQuery>) -> Response {
    let result = tokio::task::spawn_blocking(move || -> Result<(String, Vec<u8>)> {
        let path = safe_project_path(&state.root, &query.path)?;
        let db = database(&state.root)?;
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
    #[test]
    fn snapshots_survive_overwrite_and_reopen_without_duplicate_versions() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("figure.png");
        fs::write(&path, png(1)).unwrap();
        assert_eq!(
            capture(root.path(), "figure.png").unwrap()["versions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            capture(root.path(), "figure.png").unwrap()["versions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        fs::write(&path, png(2)).unwrap();
        assert_eq!(
            capture(root.path(), "figure.png").unwrap()["versions"][1]["version"],
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
        fs::write(&path, png(1)).unwrap();
        assert_eq!(
            capture(root.path(), "figure.png").unwrap()["versions"][2]["version"],
            3
        );
    }
    #[test]
    fn rejects_partial_files_and_paths_outside_project() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        fs::write(root.path().join("bad.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        assert!(capture(root.path(), "bad.png").is_err());
        let outside = other.path().join("secret.png");
        fs::write(&outside, png(1)).unwrap();
        assert!(capture(root.path(), outside.to_str().unwrap()).is_err());
        #[cfg(unix)]
        {
            let linked = tempfile::tempdir().unwrap();
            std::os::unix::fs::symlink(other.path(), linked.path().join(".fig_thumbs")).unwrap();
            assert!(database(linked.path()).is_err());
        }
    }
}
