//! Shared project favorites. The state lock covers each read/modify/write transaction.
use serde_json::{json, Value};
use std::{collections::BTreeSet, fs::{File, OpenOptions}, io, path::Path};

pub fn lock(root: &Path) -> io::Result<File> {
    let path = root.join(".fig_state.lock");
    reject_symlink(&path)?;
    let file = OpenOptions::new().create(true).truncate(false).write(true).open(path)?;
    file.lock()?;
    Ok(file)
}
fn reject_symlink(path: &Path) -> io::Result<()> {
    if std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "gallery state is a symlink"));
    }
    Ok(())
}
pub fn read(root: &Path) -> io::Result<Value> {
    let path = root.join(".fig_state.json");
    reject_symlink(&path)?;
    match std::fs::read(path) {
        Ok(bytes) => {
            let value: Value = serde_json::from_slice(&bytes)?;
            if !value.is_object() { return Err(io::Error::new(io::ErrorKind::InvalidData, "invalid gallery state")); }
            Ok(value)
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(json!({})),
        Err(e) => Err(e),
    }
}
pub fn favorites(value: &Value) -> BTreeSet<String> {
    value.get("favs").and_then(Value::as_array).into_iter().flatten()
        .filter_map(|v| v.as_str().map(str::to_owned)).collect()
}
pub fn set(root: &Path, relative: &str, on: bool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let _lock = lock(root)?;
    let mut value = read(root)?;
    let mut favs = favorites(&value);
    if on { favs.insert(relative.into()); } else { favs.remove(relative); }
    value["favs"] = json!(favs);
    crate::atomic_write_json(&root.join(".fig_state.json"), &value)?;
    Ok(())
}
/// Apply only changes since the UI last read favorites, keeping other devices' changes.
pub fn merge(current: &Value, base: &Value, requested: &Value) -> Value {
    let mut result = favorites(current);
    let base = favorites(&json!({"favs": base}));
    let requested = favorites(&json!({"favs": requested}));
    for removed in base.difference(&requested) { result.remove(removed); }
    result.extend(requested.difference(&base).cloned());
    json!(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merge_preserves_remote_additions_and_removals() {
        assert_eq!(merge(&json!({"favs":["phone.py"]}), &json!(["old.pdf"]), &json!(["old.pdf","mac.py"])), json!(["mac.py","phone.py"]));
        assert_eq!(merge(&json!({"favs":["phone.py","old.pdf"]}), &json!(["old.pdf"]), &json!([])), json!(["phone.py"]));
    }
    #[test]
    fn malformed_or_symlink_state_is_never_overwritten() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(".fig_state.json");
        std::fs::write(&path, "broken").unwrap();
        assert!(set(root.path(), "a.py", true).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "broken");
        #[cfg(unix)] {
            std::fs::remove_file(&path).unwrap();
            let outside = root.path().join("outside");
            std::fs::write(&outside, "{}").unwrap();
            std::os::unix::fs::symlink(&outside, &path).unwrap();
            assert!(set(root.path(), "a.py", true).is_err());
            assert_eq!(std::fs::read_to_string(outside).unwrap(), "{}");
        }
    }
}
