//! Settings mirror — `settings.json` (Node index.mjs getSettings/saveSettings).

use crate::write_file_atomic;
use serde_json::Value;
use std::path::Path;

pub fn read_settings(path: &Path) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn write_settings(path: &Path, settings: &Value) -> bool {
    if !settings.is_object() {
        return false;
    }
    let Ok(data) = serde_json::to_vec_pretty(settings) else {
        return false;
    };
    write_file_atomic(path, data).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn roundtrip() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("settings.json");
        assert!(write_settings(
            &p,
            &serde_json::json!({"theme":"dark","fontSize":13})
        ));
        let v = read_settings(&p).unwrap();
        assert_eq!(v["theme"], "dark");
    }
}
