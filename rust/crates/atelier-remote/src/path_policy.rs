//! Bounded file access: projectId + relative/opaque id only.
//! Never accept absolute client paths or `..` escapes.

use crate::error::ApiError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

const MAX_FILE_BYTES: u64 = 50 * 1024 * 1024; // 50 MiB default
const ALLOWED_EXTS: &[&str] = &[
    "pdf", "png", "jpg", "jpeg", "svg", "gif", "webp", "md", "tex", "bib", "txt", "csv", "json",
    "html", "css", "rs", "py", "r", "jl", "ts", "tsx", "js", "jsx", "toml", "yaml", "yml",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    pub project_id: String,
    pub name: String,
    /// Absolute path on Mac — never returned raw to mobile clients.
    #[serde(skip_serializing)]
    pub root: PathBuf,
}

#[derive(Debug, Clone, Default)]
pub struct ProjectRegistry {
    by_id: HashMap<String, ProjectEntry>,
    /// opaque file id -> (project_id, relative posix path)
    files: HashMap<String, (String, String)>,
}

impl ProjectRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register_project(
        &mut self,
        root: impl AsRef<Path>,
        name: Option<String>,
    ) -> ProjectEntry {
        let root = root.as_ref().to_path_buf();
        let project_id = project_id_for(&root);
        let name = name.unwrap_or_else(|| {
            root.file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| project_id.clone())
        });
        let entry = ProjectEntry {
            project_id: project_id.clone(),
            name,
            root,
        };
        self.by_id.insert(project_id, entry.clone());
        entry
    }

    pub fn get(&self, project_id: &str) -> Option<&ProjectEntry> {
        self.by_id.get(project_id)
    }

    pub fn list(&self) -> Vec<ProjectEntry> {
        self.by_id.values().cloned().collect()
    }

    pub fn register_file(&mut self, project_id: &str, relative: &str) -> Result<String, ApiError> {
        let rel = normalize_relative(relative)?;
        let _ = self
            .get(project_id)
            .ok_or_else(|| ApiError::not_found("projet inconnu"))?;
        let fid = file_id_for(project_id, &rel);
        self.files
            .insert(fid.clone(), (project_id.to_string(), rel));
        Ok(fid)
    }

    pub fn resolve_file_id(
        &self,
        file_id: &str,
    ) -> Result<(ProjectEntry, PathBuf, String), ApiError> {
        let (pid, rel) = self
            .files
            .get(file_id)
            .cloned()
            .ok_or_else(|| ApiError::not_found("fichier inconnu"))?;
        let proj = self
            .get(&pid)
            .cloned()
            .ok_or_else(|| ApiError::not_found("projet inconnu"))?;
        let abs = resolve_under_root(&proj.root, &rel)?;
        Ok((proj, abs, rel))
    }
}

pub fn project_id_for(root: &Path) -> String {
    let mut h = Sha256::new();
    h.update(root.to_string_lossy().as_bytes());
    format!("p_{}", &hex::encode(h.finalize())[..16])
}

pub fn file_id_for(project_id: &str, relative: &str) -> String {
    let mut h = Sha256::new();
    h.update(project_id.as_bytes());
    h.update(b"\0");
    h.update(relative.as_bytes());
    format!("f_{}", &hex::encode(h.finalize())[..20])
}

/// Reject absolute paths, `..`, empty, null bytes, and Windows drives.
pub fn normalize_relative(input: &str) -> Result<String, ApiError> {
    let s = input.trim();
    if s.is_empty() {
        return Err(ApiError::bad_request("invalid_path", "chemin vide"));
    }
    if s.contains('\0') {
        return Err(ApiError::bad_request("invalid_path", "chemin invalide"));
    }
    // Reject percent-encoded traversal before decode
    let lower = s.to_ascii_lowercase();
    if lower.contains("%2e%2e") || lower.contains("%2f") || lower.contains("%5c") {
        // allow single encoded slash? No — reject double-encoding attempts
        if lower.contains("%2e%2e") || lower.contains("..%2f") || lower.contains("%2e%2e%2f") {
            return Err(ApiError::bad_request("path_escape", "traversée refusée"));
        }
    }
    // Decode once for validation; reject if decode introduces ..
    let decoded = percent_decode_light(s);
    if decoded.starts_with('/') || decoded.starts_with('\\') {
        return Err(ApiError::bad_request("path_escape", "chemin absolu refusé"));
    }
    if decoded.chars().nth(1) == Some(':') {
        return Err(ApiError::bad_request("path_escape", "chemin absolu refusé"));
    }

    let path = Path::new(&decoded);
    let mut parts = Vec::new();
    for c in path.components() {
        match c {
            Component::Normal(p) => {
                let t = p.to_string_lossy();
                if t == ".." || t == "." {
                    return Err(ApiError::bad_request("path_escape", "traversée refusée"));
                }
                parts.push(t.into_owned());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                return Err(ApiError::bad_request("path_escape", "traversée refusée"));
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(ApiError::bad_request("path_escape", "chemin absolu refusé"));
            }
        }
    }
    if parts.is_empty() {
        return Err(ApiError::bad_request("invalid_path", "chemin vide"));
    }
    Ok(parts.join("/"))
}

fn percent_decode_light(s: &str) -> String {
    // Minimal decode for validation only
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(a), Some(b)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((a << 4) | b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Canonicalize and ensure result stays under project root (symlink-safe).
pub fn resolve_under_root(root: &Path, relative: &str) -> Result<PathBuf, ApiError> {
    let rel = normalize_relative(relative)?;
    let root_canon = std::fs::canonicalize(root)
        .map_err(|_| ApiError::bad_request("project_unavailable", "projet inaccessible"))?;
    let candidate = root_canon.join(&rel);
    // If file does not exist yet, canonicalize parent + append
    let resolved = if candidate.exists() {
        std::fs::canonicalize(&candidate)
            .map_err(|_| ApiError::bad_request("path_escape", "résolution refusée"))?
    } else {
        // For listing we require existence for GET
        return Err(ApiError::not_found("fichier introuvable"));
    };
    if !resolved.starts_with(&root_canon) {
        return Err(ApiError::bad_request(
            "path_escape",
            "fichier hors projet refusé",
        ));
    }
    Ok(resolved)
}

pub fn check_file_readable(path: &Path) -> Result<(u64, String), ApiError> {
    let meta = std::fs::metadata(path).map_err(|_| ApiError::not_found("fichier introuvable"))?;
    if !meta.is_file() {
        return Err(ApiError::bad_request("not_a_file", "pas un fichier"));
    }
    let len = meta.len();
    if len > MAX_FILE_BYTES {
        return Err(ApiError::bad_request(
            "file_too_large",
            format!("fichier trop volumineux (max {MAX_FILE_BYTES} octets)"),
        ));
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !ext.is_empty() && !ALLOWED_EXTS.contains(&ext.as_str()) {
        return Err(ApiError::bad_request(
            "mime_not_allowed",
            "type de fichier non autorisé",
        ));
    }
    let mime = mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    Ok((len, mime))
}

pub fn max_file_bytes() -> u64 {
    MAX_FILE_BYTES
}

pub fn is_allowed_ext(ext: &str) -> bool {
    ALLOWED_EXTS.contains(&ext.to_ascii_lowercase().as_str())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_dotdot() {
        assert!(normalize_relative("../etc/passwd").is_err());
        assert!(normalize_relative("foo/../../etc").is_err());
        assert!(normalize_relative("%2e%2e/secret").is_err());
    }

    #[test]
    fn rejects_absolute() {
        assert!(normalize_relative("/etc/passwd").is_err());
        assert!(normalize_relative("C:\\Windows").is_err());
    }

    #[test]
    fn accepts_normal() {
        assert_eq!(normalize_relative("docs/a.pdf").unwrap(), "docs/a.pdf");
        assert_eq!(normalize_relative("./docs/a.pdf").unwrap(), "docs/a.pdf");
    }

    #[test]
    fn symlink_escape_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let proj = dir.path().join("proj");
        let outside = dir.path().join("outside.txt");
        fs::create_dir_all(&proj).unwrap();
        fs::write(&outside, "secret").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, proj.join("link.txt")).unwrap();
            let err = resolve_under_root(&proj, "link.txt");
            // canonicalize follows symlink → path outside root → escape
            assert!(err.is_err());
        }
    }
}
