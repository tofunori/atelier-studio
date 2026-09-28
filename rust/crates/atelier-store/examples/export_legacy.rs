//! Explicit compatibility checkpoint; never runs against the default app directory.
use atelier_store::{CommandReceiptStore, ThreadStore};
use std::path::{Path, PathBuf};

fn export(app_dir: &Path) -> Result<(), String> {
    let app_dir = app_dir.canonicalize().map_err(|error| error.to_string())?;
    if !app_dir.is_dir() {
        return Err("app directory is not a directory".into());
    }
    let threads = app_dir.join("threads.json");
    if !threads.exists() && !app_dir.join("threads.json.baseline").exists() {
        return Err("no thread store found; check --app-dir".into());
    }
    ThreadStore::open(&threads).export_legacy().map_err(|error| format!("threads export failed: {error}"))?;
    CommandReceiptStore::open(app_dir.join("chat-receipts.json"))
        .export_legacy()
        .map_err(|error| format!("receipt export failed (threads already exported): {error}"))?;
    Ok(())
}

fn main() -> Result<(), String> {
    let mut args = std::env::args_os().skip(1);
    let mut app_dir: Option<PathBuf> = None;
    let mut stopped = false;
    while let Some(arg) = args.next() {
        if arg == "--app-dir" {
            app_dir = Some(args.next().ok_or("--app-dir requires a directory")?.into());
        } else if arg == "--all-processes-stopped" {
            stopped = true;
        } else {
            return Err("usage: export_legacy --app-dir DIR --all-processes-stopped".into());
        }
    }
    let app_dir = app_dir.ok_or("explicit --app-dir required; no default directory is used")?;
    if !stopped {
        return Err("stop all Atelier processes first, then pass --all-processes-stopped".into());
    }
    export(&app_dir)?;
    println!("Exported threads.json and chat-receipts.json in {}. Keep their .baseline and .journal files together with the JSON checkpoints.", app_dir.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn exports_both_stores_from_an_isolated_app_directory() {
        let dir = tempfile::tempdir().unwrap();
        ThreadStore::open(dir.path().join("threads.json")).upsert(json!({"id":"thread","title":"Current"}), false).unwrap();
        let receipts = CommandReceiptStore::open(dir.path().join("chat-receipts.json"));
        receipts.reserve("message", "fingerprint", "thread", "codex").unwrap();
        drop(receipts);
        export(dir.path()).unwrap();
        let threads: serde_json::Value = serde_json::from_slice(&std::fs::read(dir.path().join("threads.json")).unwrap()).unwrap();
        let receipts: serde_json::Value = serde_json::from_slice(&std::fs::read(dir.path().join("chat-receipts.json")).unwrap()).unwrap();
        assert_eq!(threads[0]["title"], "Current");
        assert_eq!(receipts["receipts"]["message"]["status"], "uncertain");
        assert_eq!(std::fs::metadata(dir.path().join("threads.json.journal")).unwrap().len(), 0);
        assert_eq!(std::fs::metadata(dir.path().join("chat-receipts.json.journal")).unwrap().len(), 0);
        assert_eq!(ThreadStore::open(dir.path().join("threads.json")).list().len(), 1);
    }

    #[test]
    fn wrong_directory_does_not_create_an_empty_store() {
        let dir = tempfile::tempdir().unwrap();
        assert!(export(dir.path()).is_err());
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }
}
