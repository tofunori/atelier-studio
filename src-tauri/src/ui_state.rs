use std::{collections::HashMap, fs, path::Path};

const MAX_UI_STATE_BYTES: u64 = 2 * 1024 * 1024;
const UI_STATE_PREFIX: &str = "atelier-studio";

pub fn read_ui_state(path: &Path) -> Result<HashMap<String, String>, String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(HashMap::new()),
        Err(error) => {
            return Err(format!(
                "impossible de lire les métadonnées de {}: {error}",
                path.display()
            ))
        }
    };
    if metadata.len() > MAX_UI_STATE_BYTES {
        return Err(format!(
            "{} dépasse la limite de {} octets",
            path.display(),
            MAX_UI_STATE_BYTES
        ));
    }

    let bytes = fs::read(path)
        .map_err(|error| format!("impossible de lire {}: {error}", path.display()))?;
    if bytes.len() as u64 > MAX_UI_STATE_BYTES {
        return Err(format!(
            "{} dépasse la limite de {} octets",
            path.display(),
            MAX_UI_STATE_BYTES
        ));
    }

    let value: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("{} contient un JSON invalide: {error}", path.display()))?;
    let object = value
        .as_object()
        .ok_or_else(|| format!("{} doit contenir un objet JSON", path.display()))?;

    let mut snapshot = HashMap::new();
    for (key, value) in object {
        let string = value.as_str().ok_or_else(|| {
            format!(
                "{} contient une valeur non textuelle pour la clé {key}",
                path.display()
            )
        })?;
        if key.starts_with(UI_STATE_PREFIX) {
            snapshot.insert(key.clone(), string.to_owned());
        }
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn ui_state_snapshot() -> Result<HashMap<String, String>, String> {
    let home = dirs::home_dir().ok_or_else(|| "répertoire utilisateur introuvable".to_string())?;
    read_ui_state(&home.join("Library/Application Support/atelier-studio/ui.json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn absent_file_returns_empty_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_ui_state(&dir.path().join("missing.json"))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn valid_file_filters_unrelated_keys_without_deleting_local_state() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.json");
        fs::write(
            &path,
            r#"{"atelier-studio.theme":"dark","other-app.key":"ignored"}"#,
        )
        .unwrap();

        let snapshot = read_ui_state(&path).unwrap();
        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot.get("atelier-studio.theme"), Some(&"dark".into()));
    }

    #[test]
    fn corrupt_json_is_reported_without_mutating_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.json");
        fs::write(&path, b"{broken").unwrap();

        let error = read_ui_state(&path).unwrap_err();
        assert!(error.contains("JSON invalide"));
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
    }

    #[test]
    fn oversized_file_is_rejected_before_parsing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.json");
        let mut file = fs::File::create(&path).unwrap();
        file.set_len(MAX_UI_STATE_BYTES + 1).unwrap();
        file.flush().unwrap();

        assert!(read_ui_state(&path)
            .unwrap_err()
            .contains("dépasse la limite"));
    }

    #[test]
    fn array_root_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.json");
        fs::write(&path, b"[]").unwrap();

        assert!(read_ui_state(&path).unwrap_err().contains("objet JSON"));
    }

    #[test]
    fn non_string_value_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ui.json");
        fs::write(&path, br#"{"atelier-studio.theme":42}"#).unwrap();

        assert!(read_ui_state(&path)
            .unwrap_err()
            .contains("valeur non textuelle"));
    }
}
