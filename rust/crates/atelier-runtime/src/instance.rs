//! Single-instance resolution matching `sidecar/single_instance.mjs`.

use crate::atomic::write_file_atomic;
use crate::paths::AppPaths;
use atelier_protocol::Health;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tracing::{info, warn};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstanceAction {
    /// No healthy peer — continue and claim the pid file.
    None { old_pid: Option<u32> },
    /// Peer was alive but not verified — SIGTERM sent; continue.
    Kill { old_pid: u32 },
    /// Peer is healthy same-bundle — exit without mutating pid/lock.
    Defer { old_pid: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockFile {
    port: u16,
    token: String,
    #[serde(default)]
    identity: Option<LockIdentity>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockIdentity {
    pid: Option<u32>,
    bundle_hash: Option<String>,
}

pub fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    #[cfg(unix)]
    {
        // SAFETY: signal 0 is a standard existence probe (no delivery).
        unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

fn read_pid_file(path: &Path) -> Option<u32> {
    let raw = fs::read_to_string(path).ok()?;
    let n: u32 = raw.trim().parse().ok()?;
    if n == 0 {
        None
    } else {
        Some(n)
    }
}

fn read_lock(path: &Path) -> Option<LockFile> {
    let raw = fs::read_to_string(path).ok()?;
    let lock: LockFile = serde_json::from_str(&raw).ok()?;
    if lock.port == 0 {
        None
    } else {
        Some(lock)
    }
}

async fn probe_health(lock: &LockFile, timeout: Duration) -> Option<Health> {
    let client = reqwest_like_get(lock.port, &lock.token, timeout).await?;
    serde_json::from_str(&client).ok()
}

/// Minimal HTTP GET without pulling reqwest — raw tokio TcpStream.
async fn reqwest_like_get(port: u16, token: &str, timeout: Duration) -> Option<String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;
    use tokio::time::timeout as to;

    let fut = async {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).await.ok()?;
        let mut req = format!(
            "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nAccept: application/json\r\n"
        );
        if !token.is_empty() {
            req.push_str("x-atelier-token: ");
            req.push_str(token);
            req.push_str("\r\n");
        }
        req.push_str("\r\n");
        stream.write_all(req.as_bytes()).await.ok()?;
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.ok()?;
        let raw = String::from_utf8_lossy(&buf);
        let body = raw.split("\r\n\r\n").nth(1)?;
        Some(body.trim().to_string())
    };
    to(timeout, fut).await.ok().flatten()
}

fn sigterm(pid: u32) {
    #[cfg(unix)]
    {
        // SAFETY: SIGTERM to a previously observed process.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGTERM);
        }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
    }
}

/// Decide fate of any existing sidecar referenced by the pid file.
pub async fn resolve_single_instance(
    paths: &AppPaths,
    self_pid: u32,
    bundle_hash: &str,
    timeout: Duration,
) -> InstanceAction {
    let Some(old_pid) = read_pid_file(&paths.pid_file) else {
        return InstanceAction::None { old_pid: None };
    };
    if old_pid == self_pid || !pid_alive(old_pid) {
        return InstanceAction::None {
            old_pid: Some(old_pid),
        };
    }

    if let Some(lock) = read_lock(&paths.lock_file) {
        if lock.identity.as_ref().and_then(|i| i.pid) == Some(old_pid) {
            if let Some(health) = probe_health(&lock, timeout).await {
                if health.ok && health.pid == old_pid && health.bundle_hash == bundle_hash {
                    info!(old_pid, "healthy same-bundle peer — deferring without kill");
                    return InstanceAction::Defer { old_pid };
                }
            }
        }
    }

    warn!(old_pid, "terminating stale peer");
    sigterm(old_pid);
    InstanceAction::Kill { old_pid }
}

/// Claim the pid file after instance resolution.
pub fn write_pid(paths: &AppPaths, pid: u32) -> std::io::Result<()> {
    write_file_atomic(&paths.pid_file, pid.to_string())
}

/// Remove pid file if it still points at us.
pub fn clear_pid_if_ours(paths: &AppPaths, pid: u32) {
    if read_pid_file(&paths.pid_file) == Some(pid) {
        let _ = fs::remove_file(&paths.pid_file);
    }
}

/// Write lock file (port + token + identity). Used when the server self-manages
/// the lock (standalone / tests). Tauri also writes this after health verify.
pub fn write_lock(
    paths: &AppPaths,
    port: u16,
    token: &str,
    health: &Health,
) -> std::io::Result<()> {
    let payload = serde_json::json!({
        "port": port,
        "token": token,
        "identity": {
            "ok": health.ok,
            "service": health.service,
            "pid": health.pid,
            "port": health.port,
            "startedAt": health.started_at,
            "appVersion": health.app_version,
            "bundleHash": health.bundle_hash,
            "tokenRequired": health.token_required,
        }
    });
    write_file_atomic(
        &paths.lock_file,
        serde_json::to_vec_pretty(&payload).unwrap_or_default(),
    )?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&paths.lock_file, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn pid_file_roundtrip() {
        let dir = tempdir().unwrap();
        let paths = AppPaths::from_app_dir(dir.path().to_path_buf());
        write_pid(&paths, 99999).unwrap();
        assert_eq!(read_pid_file(&paths.pid_file), Some(99999));
        clear_pid_if_ours(&paths, 99999);
        assert!(read_pid_file(&paths.pid_file).is_none());
    }

    #[tokio::test]
    async fn none_when_no_pid() {
        let dir = tempdir().unwrap();
        let paths = AppPaths::from_app_dir(dir.path().to_path_buf());
        let action = resolve_single_instance(&paths, 1, "hash", Duration::from_millis(50)).await;
        assert_eq!(action, InstanceAction::None { old_pid: None });
    }
}
