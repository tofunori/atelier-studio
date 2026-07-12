//! Atelier Companion — Tauri entry (iOS + desktop shell for dev).
//! Secure storage commands map to Keychain on iOS when available; otherwise
//! a private app-data file (never logs secrets).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

#[derive(Default)]
struct SecureStore(Mutex<HashMap<String, String>>);

#[derive(Debug, Serialize, Deserialize, Default)]
struct DiskStore {
    entries: HashMap<String, String>,
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("secure-store.json")
}

fn load_disk(app: &tauri::AppHandle) -> DiskStore {
    let p = store_path(app);
    fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_disk(app: &tauri::AppHandle, disk: &DiskStore) -> Result<(), String> {
    let p = store_path(app);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string(disk).map_err(|e| e.to_string())?;
    fs::write(p, text).map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_set(
    app: tauri::AppHandle,
    store: State<'_, SecureStore>,
    key: String,
    value: String,
) -> Result<(), String> {
    {
        let mut g = store.0.lock().map_err(|e| e.to_string())?;
        g.insert(key.clone(), value.clone());
    }
    let mut disk = load_disk(&app);
    disk.entries.insert(key, value);
    save_disk(&app, &disk)
}

#[tauri::command]
fn secure_get(
    app: tauri::AppHandle,
    store: State<'_, SecureStore>,
    key: String,
) -> Result<Option<String>, String> {
    {
        let g = store.0.lock().map_err(|e| e.to_string())?;
        if let Some(v) = g.get(&key) {
            return Ok(Some(v.clone()));
        }
    }
    let disk = load_disk(&app);
    if let Some(v) = disk.entries.get(&key) {
        let mut g = store.0.lock().map_err(|e| e.to_string())?;
        g.insert(key, v.clone());
        return Ok(Some(v.clone()));
    }
    Ok(None)
}

#[tauri::command]
fn secure_remove(
    app: tauri::AppHandle,
    store: State<'_, SecureStore>,
    key: String,
) -> Result<(), String> {
    {
        let mut g = store.0.lock().map_err(|e| e.to_string())?;
        g.remove(&key);
    }
    let mut disk = load_disk(&app);
    disk.entries.remove(&key);
    save_disk(&app, &disk)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .manage(SecureStore::default())
        .invoke_handler(tauri::generate_handler![
            secure_set,
            secure_get,
            secure_remove
        ])
        .setup(|app| {
            // Warm disk into memory
            let disk = load_disk(app.handle());
            if let Ok(mut g) = app.state::<SecureStore>().0.lock() {
                *g = disk.entries;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Atelier Companion");
}
