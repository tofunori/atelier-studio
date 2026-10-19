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
/// État du projet. Absent : `{}`. Présent mais illisible (vide, tronqué, pas
/// un objet) : erreur, et ses octets sont mis de côté en
/// `.fig_state.json.corrupt-<horodatage>` — jamais lu comme vide puis réécrit.
pub fn read(root: &Path) -> io::Result<Value> {
    let path = root.join(".fig_state.json");
    reject_symlink(&path)?;
    let loaded = crate::durable::load_json(&path, crate::durable::Shape::Object).map_err(io::Error::from)?;
    Ok(loaded.unwrap_or_else(|| json!({})))
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
    write(root, &value)?;
    Ok(())
}
/// Dossier des sauvegardes quotidiennes de `.fig_state.json` : sous
/// `.fig_thumbs/`, à côté de `pdf_annots.json`, plutôt qu'un `backups/` à la
/// racine du projet, au milieu des figures de Thierry.
pub fn backup_dir(root: &Path) -> std::path::PathBuf {
    root.join(".fig_thumbs").join(crate::durable::BACKUP_DIR)
}
/// Réécrit `.fig_state.json` (même format indenté qu'avant) : sauvegarde du
/// jour, puis écriture durable. L'appelant tient [`lock`] et a relu l'état.
pub fn write(root: &Path, value: &Value) -> io::Result<()> {
    let path = root.join(".fig_state.json");
    reject_symlink(&path)?;
    let payload = serde_json::to_vec_pretty(value).map_err(io::Error::other)?;
    crate::durable::save_in(&path, &payload, &backup_dir(root)).map_err(io::Error::from)
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
    fn each_rewrite_keeps_the_day_backup_under_fig_thumbs() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(".fig_state.json");
        std::fs::write(&path, r#"{"favs":["old.py"],"notes":{"a.py":"garder"}}"#).unwrap();
        set(root.path(), "new.py", true).unwrap();
        let backups: Vec<_> = std::fs::read_dir(backup_dir(root.path())).unwrap().flatten().map(|e| e.path()).collect();
        assert_eq!(backups.len(), 1);
        let name = backups[0].file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with(".fig_state.") && name.ends_with(".json"), "{name}");
        assert!(std::fs::read_to_string(&backups[0]).unwrap().contains("old.py"));
        assert!(!std::fs::read_to_string(&backups[0]).unwrap().contains("new.py"));
        assert!(!root.path().join(crate::durable::BACKUP_DIR).exists(), "rien à la racine du projet");
        // le format reste l'indentation de serde_json, sans saut de ligne final
        let written = std::fs::read_to_string(&path).unwrap();
        assert!(written.contains("\n  \"favs\"") && !written.ends_with('\n'), "{written}");
        assert_eq!(read(root.path()).unwrap()["notes"]["a.py"], "garder");
    }
    #[test]
    fn malformed_or_symlink_state_is_never_overwritten() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(".fig_state.json");
        for (label, raw) in crate::durable::UNREADABLE_SAMPLES {
            std::fs::write(&path, raw).unwrap();
            assert!(read(root.path()).is_err(), "{label}");
            assert!(set(root.path(), "a.py", true).is_err(), "{label}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), raw, "{label} : intact");
            assert_eq!(crate::durable::corrupt_copies_of(&path, raw.as_bytes()), 1, "{label} : copie");
        }
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
