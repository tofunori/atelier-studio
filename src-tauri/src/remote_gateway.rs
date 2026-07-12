//! Lifecycle of the private iPhone gateway.
//!
//! The gateway is started after the chat sidecar is healthy.  Its device store
//! lives in Application Support, so an iPhone remains paired across app and Mac
//! restarts.  We bind the stable Tailscale address directly: no LAN address,
//! Funnel, port forwarding, or repeated manual setup.

use crate::sidecar::SidecarInfo;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::net::{IpAddr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::Manager;

const GATEWAY_PORT: u16 = 18765;
static REMOTE_GATEWAY: Mutex<Option<GatewayLock>> = Mutex::new(None);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct GatewayLock {
    pid: u32,
    bind: String,
    sidecar_port: u16,
    sidecar_token_hash: String,
}

fn app_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Library/Application Support/atelier-studio"))
}

fn lock_path() -> Option<PathBuf> {
    app_dir().map(|p| p.join("remote/gateway.lock"))
}

fn token_hash(token: &str) -> String {
    format!("{:x}", md5::compute(token.as_bytes()))
}

fn read_lock() -> Option<GatewayLock> {
    let raw = std::fs::read_to_string(lock_path()?).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_lock(info: &GatewayLock) -> Result<(), String> {
    let path = lock_path().ok_or("dossier utilisateur introuvable")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_vec(info).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn gateway_candidates(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(explicit) = std::env::var("ATELIER_REMOTE_GATEWAY") {
        paths.push(PathBuf::from(explicit));
    }
    if let Some(resource) = resource_dir {
        paths.push(resource.join("rust-server/atelier-remote-gateway"));
        paths.push(resource.join("atelier-remote-gateway"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join("../rust/target/release/atelier-remote-gateway"));
        paths.push(cwd.join("rust/target/release/atelier-remote-gateway"));
        paths.push(cwd.join("src-tauri/rust-server-dist/atelier-remote-gateway"));
    }
    if let Some(home) = dirs::home_dir() {
        paths
            .push(home.join("Documents/atelier-studio/rust/target/release/atelier-remote-gateway"));
    }
    paths
}

fn resolve_gateway(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource = app.path().resource_dir().ok();
    gateway_candidates(resource.as_deref())
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| "atelier-remote-gateway introuvable dans le bundle".into())
}

fn tailscale_ip() -> Result<IpAddr, String> {
    let candidates = [
        "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        "/opt/homebrew/bin/tailscale",
        "/usr/local/bin/tailscale",
    ];
    for binary in candidates {
        if !Path::new(binary).is_file() {
            continue;
        }
        let Ok(output) = Command::new(binary).args(["ip", "-4"]).output() else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        if let Some(ip) = text
            .lines()
            .find_map(|line| line.trim().parse::<IpAddr>().ok())
        {
            return Ok(ip);
        }
    }
    Err("Tailscale n'est pas connecté sur ce Mac".into())
}

fn tailscale_dns_name() -> Option<String> {
    let candidates = [
        "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        "/opt/homebrew/bin/tailscale",
        "/usr/local/bin/tailscale",
    ];
    for binary in candidates {
        if !Path::new(binary).is_file() {
            continue;
        }
        let output = Command::new(binary)
            .args(["status", "--json"])
            .output()
            .ok()?;
        let value: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
        if let Some(name) = value
            .pointer("/Self/DNSName")
            .and_then(|v| v.as_str())
            .map(|v| v.trim_end_matches('.').to_string())
        {
            return Some(name);
        }
    }
    None
}

fn gateway_healthy(bind: &str) -> bool {
    bind.parse::<SocketAddr>()
        .ok()
        .map(|addr| {
            if addr.ip().is_unspecified() {
                SocketAddr::from(([127, 0, 0, 1], addr.port()))
            } else {
                addr
            }
        })
        .and_then(|addr| TcpStream::connect_timeout(&addr, Duration::from_millis(350)).ok())
        .is_some()
}

fn terminate(info: &GatewayLock) {
    if info.pid > 0 {
        let _ = Command::new("kill")
            .args(["-TERM", &info.pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        thread::sleep(Duration::from_millis(250));
    }
    if let Some(path) = lock_path() {
        let _ = std::fs::remove_file(path);
    }
}

/// Ensure the private gateway matches the current sidecar session.
pub fn ensure(app: &tauri::AppHandle, sidecar: &SidecarInfo) -> Result<(), String> {
    let ip = tailscale_ip()?;
    let bind = format!("0.0.0.0:{GATEWAY_PORT}");
    let expected_hash = token_hash(&sidecar.token);
    let mut process_guard = REMOTE_GATEWAY.lock().map_err(|e| e.to_string())?;

    let existing = process_guard.clone().or_else(read_lock);
    if let Some(info) = existing {
        if info.bind == bind
            && info.sidecar_port == sidecar.port
            && info.sidecar_token_hash == expected_hash
            && gateway_healthy(&bind)
        {
            *process_guard = Some(info);
            return Ok(());
        }
        terminate(&info);
    }

    let binary = resolve_gateway(app)?;
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let mobile_dir = resource_dir.join("mobile");
    let root = app_dir().ok_or("dossier utilisateur introuvable")?;
    let remote_dir = root.join("remote");
    std::fs::create_dir_all(&remote_dir).map_err(|e| e.to_string())?;
    let log_path = remote_dir.join("gateway.log");
    let stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|e| e.to_string())?;
    let stdout = File::open("/dev/null").map_err(|e| e.to_string())?;
    let dns = tailscale_dns_name().unwrap_or_default();
    let allowed_hosts =
        format!("127.0.0.1,localhost,tauri.localhost,{ip},{ip}:{GATEWAY_PORT},{dns},{dns}:8443");
    let child = Command::new(binary)
        .env("ATELIER_REMOTE_BIND", &bind)
        .env("ATELIER_REMOTE_ALLOW_ANY_BIND", "1")
        .env("ATELIER_REMOTE_ALLOWED_HOSTS", allowed_hosts)
        .env("ATELIER_APP_DIR", &root)
        .env(
            "ATELIER_SIDECAR_BASE",
            format!("http://127.0.0.1:{}", sidecar.port),
        )
        .env("ATELIER_TOKEN", &sidecar.token)
        .env("ATELIER_MOBILE_DIR", mobile_dir)
        .env("ATELIER_MOBILE_BIND", "0.0.0.0:1421")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|e| format!("démarrage gateway: {e}"))?;
    let info = GatewayLock {
        pid: child.id(),
        bind: bind.clone(),
        sidecar_port: sidecar.port,
        sidecar_token_hash: expected_hash,
    };
    write_lock(&info)?;
    for _ in 0..20 {
        if gateway_healthy(&bind) {
            *process_guard = Some(info);
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    terminate(&info);
    let mut log = String::new();
    if let Some(path) = app_dir().map(|p| p.join("remote/gateway.log")) {
        let _ = File::open(path).and_then(|mut f| f.read_to_string(&mut log));
    }
    Err(format!(
        "gateway non joignable sur {bind}: {}",
        log.lines().last().unwrap_or("aucun diagnostic")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_gateway_candidate_has_priority() {
        let paths = gateway_candidates(Some(Path::new("/App/Resources")));
        assert_eq!(
            paths[0],
            Path::new("/App/Resources/rust-server/atelier-remote-gateway")
        );
    }
}
