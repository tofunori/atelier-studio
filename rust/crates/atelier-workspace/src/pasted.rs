//! Pasted images — Node index.mjs paste dir.

use base64::Engine;
use serde::Serialize;
use std::path::{Path, PathBuf};

fn paste_dir(app_dir: &Path) -> PathBuf {
    app_dir.join("pasted")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PastedFile {
    pub name: String,
    pub size: u64,
    pub mtime: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_url: Option<String>,
}

pub fn save_image(app_dir: &Path, ext: &str, base64: &str) -> Result<PathBuf, String> {
    let dir = paste_dir(app_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ext = if ext == "jpeg" { "jpg" } else { ext };
    let name = format!("coller-{}.{}", now_ms(), ext);
    let path = dir.join(&name);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64.trim())
        .map_err(|e| format!("base64: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path)
}

pub fn list_pasted(app_dir: &Path) -> Vec<PastedFile> {
    let dir = paste_dir(app_dir);
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut entries: Vec<_> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            Some((e.file_name().to_string_lossy().into_owned(), meta))
        })
        .collect();
    entries.sort_by(|a, b| b.1.modified().ok().cmp(&a.1.modified().ok()));
    entries.truncate(48);
    let mut out = Vec::new();
    for (name, meta) in entries {
        let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
        let size = meta.len();
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0);
        let mut data_url = None;
        if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp") && size <= 4_000_000 {
            if let Ok(bytes) = std::fs::read(dir.join(&name)) {
                let mime = if ext == "jpg" { "jpeg" } else { &ext };
                let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
                data_url = Some(format!("data:image/{mime};base64,{b64}"));
            }
        }
        out.push(PastedFile {
            name,
            size,
            mtime,
            data_url,
        });
    }
    out
}

pub fn clear_pasted(app_dir: &Path) -> usize {
    let dir = paste_dir(app_dir);
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return 0;
    };
    let mut n = 0;
    for e in rd.flatten() {
        if std::fs::remove_file(e.path()).is_ok() {
            n += 1;
        }
    }
    n
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}
