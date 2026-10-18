//! Store des annotations PDF du lecteur (`pdf_annots.json`) : un objet
//! `{rel: [annotation, …]}`. Ses quatre écrivains — le serveur galerie, le
//! MCP des annotations, la passerelle iPhone et le livre de codes — le lisent
//! et le réécrivent tous ici, sous le même verrou `pdf_annots.lock` (flock,
//! le même que les versions précédentes prenaient avec fs2).
//!
//! Un store illisible n'est jamais remplacé : ce serait perdre tous les
//! surlignages et notes de la thèse (voir [`crate::durable`]).

use crate::durable::{self, StoreError};
use serde_json::{Map, Value};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};

pub const STORE_NAME: &str = "pdf_annots.json";
pub const LOCK_NAME: &str = "pdf_annots.lock";

/// Verrou exclusif inter-processus du store, relâché à la destruction.
pub struct StoreLock {
    file: File,
}

impl Drop for StoreLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

/// Prend le verrou du store de `dir` (bloquant).
pub fn lock(dir: &Path) -> Result<StoreLock, StoreError> {
    fs::create_dir_all(dir).map_err(|error| StoreError::io(dir, error))?;
    let path = dir.join(LOCK_NAME);
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|error| StoreError::io(&path, error))?;
    file.lock().map_err(|error| StoreError::io(&path, error))?;
    Ok(StoreLock { file })
}

pub fn store_path(dir: &Path) -> PathBuf {
    dir.join(STORE_NAME)
}

/// Lit le store de `dir` : absent = vide, illisible = erreur (et copie de côté).
pub fn read(dir: &Path) -> Result<Map<String, Value>, StoreError> {
    durable::load_object(&store_path(dir))
}

/// Réécrit le store de `dir` (sauvegarde du jour, puis écriture durable).
/// À appeler sous [`lock`].
pub fn write(dir: &Path, store: &Map<String, Value>) -> Result<(), StoreError> {
    durable::save_json_pretty(&store_path(dir), store)
}

/// Ouvre le store sous le verrou, laisse `op` le modifier et ne le réécrit
/// que si `op` dit l'avoir changé. Un store illisible n'atteint jamais `op`.
pub fn with_store<T, E: From<StoreError>>(
    dir: &Path,
    op: impl FnOnce(&mut Map<String, Value>) -> Result<(T, bool), E>,
) -> Result<T, E> {
    let _lock = lock(dir)?;
    let mut store = read(dir)?;
    let (value, changed) = op(&mut store)?;
    if changed {
        write(dir, &store)?;
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::durable::{BACKUP_DIR, CORRUPT_MARK, UNREADABLE_SAMPLES};
    use serde_json::json;

    fn corrupt_copies(dir: &Path) -> usize {
        fs::read_dir(dir)
            .unwrap()
            .flatten()
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(&format!("{STORE_NAME}{CORRUPT_MARK}"))
            })
            .count()
    }

    #[test]
    fn an_unreadable_store_is_never_rewritten() {
        for (case, raw) in UNREADABLE_SAMPLES {
            let dir = tempfile::tempdir().unwrap();
            fs::write(store_path(dir.path()), raw).unwrap();
            let mut called = false;
            let result: Result<(), String> = with_store(dir.path(), |store| {
                called = true;
                store.insert("zotero/ABCD1234/b.pdf".into(), json!([{"id": "new"}]));
                Ok(((), true))
            });
            assert!(result.is_err(), "{case}");
            assert!(!called, "{case}: l'opération ne voit jamais un store illisible");
            assert_eq!(fs::read_to_string(store_path(dir.path())).unwrap(), raw, "{case}");
            assert_eq!(corrupt_copies(dir.path()), 1, "{case}");
            assert!(!dir.path().join(BACKUP_DIR).exists(), "{case}");
        }
    }

    #[test]
    fn absent_store_is_created_and_unchanged_store_is_not_rewritten() {
        let dir = tempfile::tempdir().unwrap();
        let n: usize = with_store::<_, String>(dir.path(), |store| Ok((store.len(), false))).unwrap();
        assert_eq!(n, 0);
        assert!(!store_path(dir.path()).exists());
        with_store::<_, String>(dir.path(), |store| {
            store.insert("a.pdf".into(), json!([{"id": "1"}]));
            Ok(((), true))
        })
        .unwrap();
        let raw = fs::read_to_string(store_path(dir.path())).unwrap();
        assert!(raw.ends_with("]\n}\n"), "JSON indenté suivi d'un saut de ligne : {raw:?}");
        assert_eq!(read(dir.path()).unwrap()["a.pdf"][0]["id"], "1");
    }

    #[test]
    fn the_lock_excludes_another_opener_of_the_lock_file() {
        let dir = tempfile::tempdir().unwrap();
        let held = lock(dir.path()).unwrap();
        let other = OpenOptions::new()
            .read(true)
            .write(true)
            .open(dir.path().join(LOCK_NAME))
            .unwrap();
        assert!(other.try_lock().is_err());
        drop(held);
        assert!(other.try_lock().is_ok());
    }
}
