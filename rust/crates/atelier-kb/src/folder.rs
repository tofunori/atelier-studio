//! Port de `walkFolder`/`scanFolder` (`sidecar/knowledge.mjs`) — parcours
//! récursif déterministe (trié), fichiers texte seulement, cache réutilisé
//! quand mtime/size n'ont pas bougé.

use std::collections::{HashMap, HashSet};
use std::path::Path;

pub const FOLDER_MAX_FILES: usize = 2000;
pub const FOLDER_MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

fn folder_exts() -> HashSet<&'static str> {
    [".md", ".tex", ".txt"].into_iter().collect()
}
fn skip_dirs() -> HashSet<&'static str> {
    ["node_modules", "target", "dist", "build", "__pycache__"].into_iter().collect()
}

#[derive(Clone)]
pub struct FolderFile {
    pub rel: String,
    pub mtime_ms: f64,
    pub size: u64,
    pub chars: usize,
    pub pages: Vec<crate::search::Page>,
}

fn ext_lower(name: &str) -> String {
    match name.rfind('.') {
        Some(i) => name[i..].to_lowercase(),
        None => String::new(),
    }
}

/// Parcours trié (déterministe), dotfiles/répertoires bruyants exclus,
/// plafond `FOLDER_MAX_FILES`.
pub fn walk_folder(root: &Path) -> Vec<String> {
    let exts = folder_exts();
    let skips = skip_dirs();
    let mut out = Vec::new();
    let mut stack = vec![String::new()];
    while let Some(rel) = stack.pop() {
        if out.len() >= FOLDER_MAX_FILES {
            break;
        }
        let dir = if rel.is_empty() { root.to_path_buf() } else { root.join(&rel) };
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let child_rel = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if file_type.is_dir() {
                if !skips.contains(name.as_str()) {
                    stack.push(child_rel);
                }
            } else if file_type.is_file() && exts.contains(ext_lower(&name).as_str()) {
                out.push(child_rel);
                if out.len() >= FOLDER_MAX_FILES {
                    break;
                }
            }
        }
    }
    out.sort();
    out
}

fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

fn pages_from_text(text: &str) -> Vec<crate::search::Page> {
    let clean = text.replace('\r', "");
    let clean = clean.trim();
    if clean.is_empty() {
        Vec::new()
    } else {
        vec![crate::search::Page { page: 1, text: clean.to_string() }]
    }
}

/// Balaye un dossier en réutilisant les extractions dont mtime/size n'ont pas
/// bougé (re-scan bon marché à chaque attache/recherche).
pub fn scan_folder(root: &Path, previous: &[FolderFile]) -> (Vec<FolderFile>, usize) {
    let prev_by_rel: HashMap<&str, &FolderFile> =
        previous.iter().map(|f| (f.rel.as_str(), f)).collect();
    let mut files = Vec::new();
    let mut skipped = 0usize;
    for rel in walk_folder(root) {
        let path = root.join(&rel);
        let stat = match std::fs::metadata(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        if stat.len() > FOLDER_MAX_FILE_BYTES {
            skipped += 1;
            continue;
        }
        let mtime = mtime_ms(&stat);
        let size = stat.len();
        if let Some(prev) = prev_by_rel.get(rel.as_str()) {
            if prev.mtime_ms == mtime && prev.size == size {
                files.push((*prev).clone());
                continue;
            }
        }
        let text = match std::fs::read_to_string(&path) {
            Ok(t) => t,
            Err(_) => continue,
        };
        let pages = pages_from_text(&text);
        if pages.is_empty() {
            continue;
        }
        let chars = crate::csv_digest::js_len(&pages[0].text);
        files.push(FolderFile { rel, mtime_ms: mtime, size, chars, pages });
    }
    (files, skipped)
}

pub fn folder_fingerprint(files: &[FolderFile]) -> String {
    files
        .iter()
        .map(|f| format!("{}:{}:{}", f.rel, f.mtime_ms, f.size))
        .collect::<Vec<_>>()
        .join("|")
}
