//! Atomic file writes (tmp + rename), matching `sidecar/store.mjs` `writeFileAtomic`.

use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Write `data` to `path` via temp file + rename. Creates parent dirs.
pub fn write_file_atomic(path: &Path, data: impl AsRef<[u8]>) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = path.with_extension(format!("{pid}.{nanos}.tmp"));
    {
        let mut f = File::create(&tmp)?;
        f.write_all(data.as_ref())?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path).inspect_err(|_| {
        let _ = fs::remove_file(&tmp);
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
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
