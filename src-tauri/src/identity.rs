use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SIDECAR_SERVICE: &str = "atelier-sidecar";
pub const GALLERY_SERVICE: &str = "atelier-gallery";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessHealth {
    pub ok: Option<bool>,
    pub service: Option<String>,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub started_at: Option<String>,
    pub project_root: Option<String>,
    pub app_version: Option<String>,
    pub bundle_hash: Option<String>,
    pub token_required: Option<bool>,
}

pub fn dir_fingerprint(root: &Path) -> Result<String, String> {
    let root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let mut files = Vec::new();
    collect_files(&root, &mut files)?;
    files.sort();

    let mut bytes = Vec::new();
    for file in files {
        let rel = file
            .strip_prefix(&root)
            .map_err(|e| e.to_string())?
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        bytes.extend_from_slice(rel.as_bytes());
        bytes.push(0);
        bytes.extend(fs::read(&file).map_err(|e| format!("hash {}: {e}", file.display()))?);
        bytes.push(0);
    }
    Ok(format!("{:x}", md5::compute(bytes)))
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| format!("read {}: {e}", dir.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if ignored_name(&name) {
            continue;
        }
        let meta = entry
            .metadata()
            .map_err(|e| format!("stat {}: {e}", path.display()))?;
        if meta.is_dir() {
            collect_files(&path, out)?;
        } else if meta.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

fn ignored_name(name: &str) -> bool {
    matches!(
        name,
        ".git"
            | ".fig_thumbs"
            | ".pytest_cache"
            | ".conductor"
            | "annotations"
            | "logs"
            | "node_modules"
            | "test-results"
    )
}

pub fn http_json(
    port: u16,
    path: &str,
    headers: &[(&str, &str)],
    timeout: Duration,
) -> Result<Value, String> {
    let addr = format!("127.0.0.1:{port}");
    let mut stream = TcpStream::connect_timeout(&addr.parse().unwrap(), timeout)
        .map_err(|e| format!("connect {addr}: {e}"))?;
    stream
        .set_read_timeout(Some(timeout))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(timeout))
        .map_err(|e| e.to_string())?;

    let mut req = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nAccept: application/json\r\n"
    );
    for (k, v) in headers {
        req.push_str(k);
        req.push_str(": ");
        req.push_str(v);
        req.push_str("\r\n");
    }
    req.push_str("\r\n");
    stream
        .write_all(req.as_bytes())
        .map_err(|e| format!("write {path}: {e}"))?;

    let mut raw = String::new();
    stream
        .read_to_string(&mut raw)
        .map_err(|e| format!("read {path}: {e}"))?;
    let (head, body) = raw
        .split_once("\r\n\r\n")
        .ok_or_else(|| format!("bad HTTP response from {path}"))?;
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return Err(head.lines().next().unwrap_or("HTTP error").to_string());
    }
    serde_json::from_str(body.trim()).map_err(|e| format!("json {path}: {e}"))
}

pub fn parse_health(value: Value) -> Result<ProcessHealth, String> {
    serde_json::from_value(value).map_err(|e| format!("health: {e}"))
}

pub fn health_mismatch(
    health: &ProcessHealth,
    service: &str,
    bundle_hash: &str,
    project_root: Option<&Path>,
) -> Option<String> {
    if health.service.as_deref() != Some(service) {
        return Some(format!("service={:?}", health.service));
    }
    if health.app_version.as_deref() != Some(APP_VERSION) {
        return Some(format!("appVersion={:?}", health.app_version));
    }
    if health.bundle_hash.as_deref() != Some(bundle_hash) {
        return Some(format!("bundleHash={:?}", health.bundle_hash));
    }
    if let Some(root) = project_root {
        let expected = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
        let got = health
            .project_root
            .as_deref()
            .map(PathBuf::from)
            .map(|p| fs::canonicalize(&p).unwrap_or(p));
        if got.as_deref() != Some(expected.as_path()) {
            return Some(format!("projectRoot={:?}", health.project_root));
        }
    }
    None
}
