//! Settings mirror — `settings.json` (Node index.mjs getSettings/saveSettings).

use crate::durable::{self, Shape, StoreError};
use serde_json::Value;
use std::path::Path;

/// Settings for the readers that only need a value: absent or unreadable both
/// read as `None`. The front and every writer go through [`load_settings`].
pub fn read_settings(path: &Path) -> Option<Value> {
    load_settings(path).ok().flatten()
}

/// `Ok(None)`: no settings yet (first launch). `Err`: the file is present but
/// unreadable — a copy is set aside and nothing may overwrite it, otherwise
/// the front would take it for a first launch and push its local state.
pub fn load_settings(path: &Path) -> Result<Option<Value>, StoreError> {
    durable::load_json(path, Shape::Object)
}

/// Writes the settings (day's backup, then durable write). Refused when the
/// value is not an object or when the file on disk is unreadable.
pub fn write_settings(path: &Path, settings: &Value) -> bool {
    if !settings.is_object() {
        return false;
    }
    if load_settings(path).is_err() {
        return false;
    }
    let Ok(data) = serde_json::to_vec_pretty(settings) else {
        return false;
    };
    durable::save(path, &data).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn roundtrip() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("settings.json");
        assert_eq!(load_settings(&p).unwrap(), None);
        assert!(write_settings(
            &p,
            &serde_json::json!({"theme":"dark","fontSize":13})
        ));
        let v = read_settings(&p).unwrap();
        assert_eq!(v["theme"], "dark");
    }

    #[test]
    fn unreadable_settings_are_not_a_first_launch_and_are_never_overwritten() {
        for (case, raw) in durable::UNREADABLE_SAMPLES {
            let dir = tempdir().unwrap();
            let p = dir.path().join("settings.json");
            std::fs::write(&p, raw).unwrap();
            assert!(load_settings(&p).unwrap_err().is_unreadable(), "{case}");
            assert!(!write_settings(&p, &serde_json::json!({"projects": []})), "{case}");
            assert_eq!(std::fs::read_to_string(&p).unwrap(), raw, "{case}");
            assert_eq!(durable::corrupt_copies_of(&p, raw.as_bytes()), 1, "{case}");
        }
    }
}
