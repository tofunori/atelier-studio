//! Atomic file writes (tmp + rename), matching `sidecar/store.mjs` `writeFileAtomic`.
//! Délègue à `atelier_store::durable::write_durable` : fsync du fichier
//! temporaire avant le rename, puis fsync du dossier, droits conservés.

use std::path::Path;

/// Write `data` to `path` via temp file + rename. Creates parent dirs.
pub fn write_file_atomic(path: &Path, data: impl AsRef<[u8]>) -> std::io::Result<()> {
    atelier_store::durable::write_durable(path, data.as_ref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn atomic_write_creates_and_overwrites() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join("f.txt");
        write_file_atomic(&path, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "hello");
        write_file_atomic(&path, b"world").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "world");
    }
}
