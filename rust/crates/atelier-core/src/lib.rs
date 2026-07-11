use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub mod gallery_builder;
pub mod svg_edits;

pub const ARTIFACT_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "svg", "pdf", "html", "htm", "docx", "xlsx", "xls", "csv", "md", "py",
    "r", "jl", "tex", "sh", "rs", "mp4", "m4v", "mov", "webm",
];

pub const EXCLUDED_DIRECTORIES: &[&str] = &[
    ".git",
    ".fig_thumbs",
    ".venv",
    ".venv-era5",
    ".venv-codex",
    "node_modules",
    "__pycache__",
    ".ipynb_checkpoints",
    "worktrees",
    ".claude",
    "_gallery_exports",
    ".prism",
];

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("path escapes project root")]
    OutsideProject,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AnnotationAnchor {
    Artifact,
    TextRange {
        start_line: u32,
        end_line: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        start_column: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        end_column: Option<u32>,
    },
    PdfPage {
        page: String,
    },
    PdfRegion {
        page: String,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    ImageRegion {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    },
    SvgElement {
        selector: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AnnotationStatus {
    Staged,
    Queued,
    Received,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Annotation {
    pub id: String,
    pub project: String,
    pub artifact: String,
    pub anchor: AnnotationAnchor,
    pub comment: String,
    pub destination: Option<String>,
    pub status: AnnotationStatus,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub ok: bool,
    pub service: &'static str,
    pub backend: &'static str,
    pub project: String,
    pub revision: u64,
    pub watcher: WatcherStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_bridge_protocol: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_inbox: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WatcherStatus {
    pub enabled: bool,
    pub running: bool,
    pub last_event_at: Option<u64>,
    pub last_build_at: Option<u64>,
    pub last_changed: Vec<String>,
    pub error: Option<String>,
}

/// Expand `~` / `~/…` like Python's `os.path.expanduser`, then pin the
/// result under `project` (realpath). Symlinks that leave the project are
/// rejected — same contract as `fig_annotate_server._safe_path`.
pub fn safe_project_path(project: &Path, requested: &str) -> Result<PathBuf, CoreError> {
    let expanded = expand_user(requested);
    let candidate = if Path::new(&expanded).is_absolute() {
        PathBuf::from(&expanded)
    } else {
        project.join(&expanded)
    };
    let root = fs::canonicalize(project)?;
    let resolved = if candidate.exists() {
        fs::canonicalize(&candidate)?
    } else {
        // Non-existent final component is allowed (codesave can create files);
        // the parent must still resolve inside the project.
        let parent = candidate
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or(project);
        let parent = fs::canonicalize(parent)?;
        parent.join(candidate.file_name().unwrap_or_default())
    };
    if resolved == root || resolved.starts_with(&root) {
        Ok(resolved)
    } else {
        Err(CoreError::OutsideProject)
    }
}

fn expand_user(requested: &str) -> String {
    if requested == "~" {
        return std::env::var("HOME").unwrap_or_else(|_| requested.to_string());
    }
    if let Some(rest) = requested.strip_prefix("~/")
        && let Ok(home) = std::env::var("HOME")
    {
        return format!("{home}/{rest}");
    }
    requested.to_string()
}

/// mtime as fractional seconds since the Unix epoch — matches Python
/// `os.path.getmtime` / JSON float encoding used by `/code` and `/codesave`.
pub fn file_mtime_secs(path: &Path) -> Result<f64, CoreError> {
    let metadata = fs::metadata(path)?;
    let modified = metadata.modified()?;
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| CoreError::Io(std::io::Error::other(error.to_string())))?;
    Ok(duration.as_secs_f64())
}

/// Root document of a `.tex` file: itself if it has `\documentclass`, else the
/// `% !TEX root` directive, else a sibling/parent `.tex` that `\input`/`\include`s it.
pub fn find_tex_root(path: &Path) -> PathBuf {
    let Ok(txt) = fs::read_to_string(path) else {
        return path.to_path_buf();
    };
    if txt.contains("\\documentclass") {
        return path.to_path_buf();
    }
    for line in txt.lines() {
        // % !TEX root = <path>  (case-insensitive, as in Python)
        let lower = line.to_ascii_lowercase();
        if let Some(idx) = lower.find("!tex") {
            let after = lower[idx + 4..].trim_start();
            if let Some(after_root) = after.strip_prefix("root") {
                let after_root = after_root.trim_start();
                if let Some(value) = after_root.strip_prefix('=') {
                    // Use the original line's value slice (same offsets — ASCII markers only).
                    let orig_after = line[idx + 4..].trim_start();
                    let orig_value = orig_after
                        .get(orig_after.len().saturating_sub(value.len())..)
                        .unwrap_or(value)
                        .trim();
                    // Prefer the portion after '=' on the original line.
                    let orig_value = line
                        .split_once('=')
                        .map(|(_, v)| v.trim())
                        .unwrap_or(orig_value);
                    let cand = path
                        .parent()
                        .unwrap_or_else(|| Path::new("."))
                        .join(orig_value);
                    if let Ok(resolved) = fs::canonicalize(&cand)
                        && resolved.is_file()
                    {
                        return resolved;
                    }
                }
            }
        }
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    if stem.is_empty() {
        return path.to_path_buf();
    }
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let parent = dir.parent().unwrap_or(dir);
    for folder in [dir, parent] {
        let Ok(entries) = fs::read_dir(folder) else {
            continue;
        };
        for entry in entries.flatten() {
            let cand = entry.path();
            if cand.extension().and_then(|e| e.to_str()) != Some("tex") {
                continue;
            }
            let Ok(t) = fs::read_to_string(&cand) else {
                continue;
            };
            if !t.contains("\\documentclass") {
                continue;
            }
            // Match \input{…stem…} or \include{…stem…} like Python's regex.
            if tex_includes_stem(&t, stem) {
                return cand;
            }
        }
    }
    path.to_path_buf()
}

fn tex_includes_stem(source: &str, stem: &str) -> bool {
    for cmd in ["\\input{", "\\include{"] {
        let mut rest = source;
        while let Some(idx) = rest.find(cmd) {
            let after = &rest[idx + cmd.len()..];
            if let Some(end) = after.find('}') {
                let arg = &after[..end];
                if arg.contains(stem) {
                    return true;
                }
                rest = &after[end + 1..];
            } else {
                break;
            }
        }
    }
    false
}

pub fn is_artifact(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|v| v.to_str())
        .unwrap_or_default();
    if name == ".atelier-provenance.json" {
        return true;
    }
    path.extension()
        .and_then(|v| v.to_str())
        .map(|ext| {
            ARTIFACT_EXTENSIONS
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(ext))
        })
        .unwrap_or(false)
}

pub fn is_excluded_dir(name: &str) -> bool {
    EXCLUDED_DIRECTORIES.contains(&name)
}

pub fn artifact_snapshot(project: &Path) -> Result<BTreeMap<String, (u128, u64)>, CoreError> {
    let root = fs::canonicalize(project)?;
    let mut out = BTreeMap::new();
    let mut stack = vec![root.clone()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if path.is_dir() {
                if !is_excluded_dir(&name) {
                    stack.push(path);
                }
                continue;
            }
            if !is_artifact(&path) || name == "figures_index.html" {
                continue;
            }
            let metadata = entry.metadata()?;
            let modified = metadata
                .modified()
                .ok()
                .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|value| value.as_nanos())
                .unwrap_or_default();
            let rel = path
                .strip_prefix(&root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            out.insert(rel, (modified, metadata.len()));
        }
    }
    Ok(out)
}

/// Write `data` via a same-directory temp file + rename (atomic on the same FS).
/// Never truncates an existing destination on failure mid-write.
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), CoreError> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let tmp = parent.join(format!(
        ".{}.{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        std::process::id(),
        nonce
    ));
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn atomic_write_text(path: &Path, text: &str) -> Result<(), CoreError> {
    atomic_write(path, text.as_bytes())
}

pub fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), CoreError> {
    let payload = serde_json::to_vec_pretty(value)?;
    atomic_write(path, &payload)
}

/// One-time pristine backup `path.orig.bak` (hard-link publish, race-safe).
/// No-op if the backup already exists or is a symlink.
/// Python path: `dst + ".orig.bak"` (e.g. `plot.svg.orig.bak`).
pub fn ensure_orig_backup(path: &Path) -> Result<(), CoreError> {
    let bak = PathBuf::from(format!("{}.orig.bak", path.display()));
    if bak.is_symlink() || bak.exists() {
        return Ok(());
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let tmp = parent.join(format!(
        ".bak.{}.{}.{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy(),
        std::process::id(),
        nonce
    ));
    fs::copy(path, &tmp)?;
    match fs::hard_link(&tmp, &bak) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => {
            let _ = fs::remove_file(&tmp);
            return Err(error.into());
        }
    }
    let _ = fs::remove_file(&tmp);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn rejects_paths_outside_project() {
        let root = std::env::temp_dir().join(format!("atelier-core-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        assert!(safe_project_path(&root, "../outside.tex").is_err());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn snapshot_includes_provenance_but_not_generated_tree() {
        let root = std::env::temp_dir().join(format!(
            "atelier-core-snapshot-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join(".fig_thumbs")).unwrap();
        fs::write(root.join("figure.png"), b"x").unwrap();
        fs::write(root.join(".atelier-provenance.json"), b"{}").unwrap();
        fs::write(root.join(".fig_thumbs/copy.png"), b"x").unwrap();
        let snapshot = artifact_snapshot(&root).unwrap();
        assert!(snapshot.contains_key("figure.png"));
        assert!(snapshot.contains_key(".atelier-provenance.json"));
        assert!(!snapshot.contains_key(".fig_thumbs/copy.png"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn health_uses_the_gallery_camel_case_contract() {
        let health = Health {
            ok: true,
            service: "atelier",
            backend: "rust",
            project: "/tmp/project".to_string(),
            revision: 3,
            watcher: WatcherStatus::default(),
            agent_host: Some("codex".to_string()),
            agent_bridge_protocol: Some(2),
            agent_inbox: Some(1),
        };
        let value = serde_json::to_value(health).unwrap();
        assert_eq!(value["agentBridgeProtocol"], 2);
        assert!(value.get("agent_bridge_protocol").is_none());
        assert!(value["watcher"].get("lastChanged").is_some());
    }

    #[test]
    fn atomic_write_replaces_without_leaving_tmp() {
        let root = std::env::temp_dir().join(format!(
            "atelier-core-atomic-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("note.md");
        fs::write(&path, b"old").unwrap();
        atomic_write_text(&path, "new content").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new content");
        let leftovers: Vec<_> = fs::read_dir(&root)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp"))
            .collect();
        assert!(leftovers.is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn orig_backup_created_once() {
        let root = std::env::temp_dir().join(format!(
            "atelier-core-bak-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("plot.svg");
        fs::write(&path, b"<svg/>").unwrap();
        ensure_orig_backup(&path).unwrap();
        ensure_orig_backup(&path).unwrap();
        let bak = PathBuf::from(format!("{}.orig.bak", path.display()));
        assert!(bak.is_file());
        assert_eq!(fs::read(&bak).unwrap(), b"<svg/>");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn find_tex_root_detects_documentclass() {
        let root = std::env::temp_dir().join(format!(
            "atelier-core-tex-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("doc.tex");
        fs::write(
            &path,
            "\\documentclass{article}\n\\begin{document}\\end{document}\n",
        )
        .unwrap();
        assert_eq!(find_tex_root(&path), path);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn empty_relative_path_resolves_to_project_root() {
        let root = std::env::temp_dir().join(format!(
            "atelier-core-empty-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let resolved = safe_project_path(&root, "").unwrap();
        assert_eq!(resolved, fs::canonicalize(&root).unwrap());
        let _ = fs::remove_dir_all(root);
    }
}
