//! Manual reading status shared by every project, without writing to Zotero.
use atelier_core::atomic_write_text;
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use fs2::FileExt;
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::BTreeSet,
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

fn store_path() -> Result<PathBuf, String> {
    let app_dir = std::env::var_os("ATELIER_APP_DIR")
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .map(|home| PathBuf::from(home).join("Library/Application Support/atelier-studio"))
        })
        .ok_or("Atelier data directory unavailable")?;
    Ok(app_dir.join("zotero-read.json"))
}

fn load(path: &Path) -> Result<BTreeSet<String>, String> {
    match fs::read_to_string(path) {
        Ok(raw) => serde_json::from_str(&raw).map_err(|e| e.to_string()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(BTreeSet::new()),
        Err(e) => Err(e.to_string()),
    }
}

fn save(path: &Path, key: &str, read: bool) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Invalid store path")?).map_err(|e| e.to_string())?;
    // Each project has its own server process: lock the read/modify/write cycle.
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path.with_extension("lock"))
        .map_err(|e| e.to_string())?;
    lock.lock_exclusive().map_err(|e| e.to_string())?;
    let mut keys = load(path)?; // Never overwrite unreadable/corrupt existing data.
    if read {
        keys.insert(key.to_owned());
    } else {
        keys.remove(key);
    }
    let raw = serde_json::to_string(&keys).map_err(|e| e.to_string())?;
    atomic_write_text(path, &raw).map_err(|e| e.to_string())
}

fn failure(error: impl std::fmt::Display) -> Response {
    eprintln!("Zotero reading status: {error}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({"error": "reading-status-unavailable"})),
    )
        .into_response()
}

pub async fn get() -> Response {
    match tokio::task::spawn_blocking(|| load(&store_path()?)).await {
        Ok(Ok(keys)) => Json(json!({"readKeys": keys})).into_response(),
        Ok(Err(e)) => failure(e),
        Err(e) => failure(e),
    }
}

#[derive(Deserialize)]
pub struct Update {
    key: String,
    read: bool,
}

pub async fn post(Json(update): Json<Update>) -> Response {
    if update.key.len() != 8 || !update.key.bytes().all(|c| c.is_ascii_alphanumeric()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid-zotero-key"})),
        )
            .into_response();
    }
    match tokio::task::spawn_blocking(move || {
        save(&store_path()?, &update.key, update.read)?;
        Ok::<_, String>(json!({"key": update.key, "read": update.read}))
    })
    .await
    {
        Ok(Ok(result)) => Json(result).into_response(),
        Ok(Err(e)) => failure(e),
        Err(e) => failure(e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_and_unmarks_without_affecting_other_articles() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("shared/zotero-read.json");
        assert!(load(&path).unwrap().is_empty());
        save(&path, "ARTICLE1", true).unwrap();
        save(&path, "ARTICLE2", true).unwrap();
        save(&path, "ARTICLE1", false).unwrap();
        assert_eq!(load(&path).unwrap(), BTreeSet::from(["ARTICLE2".into()]));
    }

    #[test]
    fn concurrent_project_writes_are_merged() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("zotero-read.json");
        std::thread::scope(|scope| {
            for n in 0..24 {
                let path = &path;
                scope.spawn(move || save(path, &format!("ITEM{n:04}"), true).unwrap());
            }
        });
        assert_eq!(load(&path).unwrap().len(), 24);
    }

    #[test]
    fn corrupt_store_is_preserved_and_reported() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("zotero-read.json");
        fs::write(&path, "broken data").unwrap();
        assert!(load(&path).is_err());
        assert!(save(&path, "ARTICLE1", true).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "broken data");
    }

    #[tokio::test]
    async fn rejects_invalid_keys_before_writing() {
        let response = post(Json(Update {
            key: "../invalid".into(),
            read: true,
        }))
        .await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
