use crate::identity::{self, ProcessHealth};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Manager;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarInfo {
    port: u16,
    token: String,
    identity: Option<ProcessHealth>,
}

static SIDECAR: Mutex<Option<SidecarInfo>> = Mutex::new(None);

fn session_token() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|e| format!("token sidecar: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn lockfile_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Library/Application Support/atelier-studio/sidecar.lock"))
}

fn resolve_script(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dev_script = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("../sidecar/index.mjs");
    if dev_script.exists() {
        Ok(dev_script)
    } else {
        Ok(app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("sidecar/index.mjs"))
    }
}

fn fetch_health(info: &SidecarInfo, expected_hash: &str) -> Result<ProcessHealth, String> {
    let value = identity::http_json(
        info.port,
        "/health",
        &[("x-atelier-token", &info.token)],
        Duration::from_millis(900),
    )?;
    let health = identity::parse_health(value)?;
    if health.token_required != Some(true) {
        return Err(format!("tokenRequired={:?}", health.token_required));
    }
    if let Some(reason) =
        identity::health_mismatch(&health, identity::SIDECAR_SERVICE, expected_hash, None)
    {
        return Err(reason);
    }
    Ok(health)
}

fn verified_info(mut info: SidecarInfo, expected_hash: &str) -> Option<SidecarInfo> {
    match fetch_health(&info, expected_hash) {
        Ok(health) => {
            info.identity = Some(health);
            Some(info)
        }
        Err(_) => None,
    }
}

/// Verrou d'instance unique : {port, token} du sidecar vivant, partagé entre
/// les instances (dev + build). Une app réutilise le sidecar existant au lieu
/// d'en lancer un rival seulement si son identité correspond au build courant.
fn read_lockfile(expected_hash: &str) -> Option<SidecarInfo> {
    let p = lockfile_path()?;
    let raw = std::fs::read_to_string(p).ok()?;
    let info: SidecarInfo = serde_json::from_str(&raw).ok()?;
    verified_info(info, expected_hash)
}

fn write_lockfile(info: &SidecarInfo) {
    if let Some(p) = lockfile_path() {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&p, serde_json::to_string(info).unwrap_or_default());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600));
        }
    }
}

fn capture_stderr<R: Read + Send + 'static>(mut reader: R) -> Arc<Mutex<String>> {
    let buf = Arc::new(Mutex::new(String::new()));
    let out = Arc::clone(&buf);
    thread::spawn(move || {
        let mut chunk = [0u8; 1024];
        loop {
            match reader.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&chunk[..n]);
                    if let Ok(mut s) = out.lock() {
                        if s.len() < 12_000 {
                            s.push_str(&text);
                            if s.len() > 12_000 {
                                s.truncate(12_000);
                            }
                        }
                    }
                }
            }
        }
    });
    buf
}

fn stderr_snapshot(buf: &Arc<Mutex<String>>) -> String {
    buf.lock().map(|s| s.trim().to_string()).unwrap_or_default()
}

fn read_startup_line<R: Read + Send + 'static>(
    stdout: R,
    child: &mut Child,
    stderr: &Arc<Mutex<String>>,
) -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
        let _ = tx.send(result);
    });
    match rx.recv_timeout(Duration::from_secs(4)) {
        Ok(Ok(line)) if !line.trim().is_empty() => Ok(line),
        Ok(Ok(_)) => Err(format!(
            "sidecar stdout vide; stderr: {}",
            stderr_snapshot(stderr)
        )),
        Ok(Err(e)) => Err(format!(
            "lecture sidecar: {e}; stderr: {}",
            stderr_snapshot(stderr)
        )),
        Err(_) => {
            let _ = child.kill();
            Err(format!(
                "timeout au démarrage du sidecar; stderr: {}",
                stderr_snapshot(stderr)
            ))
        }
    }
}

fn parse_startup(line: &str) -> Result<ProcessHealth, String> {
    let value: serde_json::Value =
        serde_json::from_str(line.trim()).map_err(|e| format!("sortie sidecar: {e}: {line}"))?;
    let health = identity::parse_health(value)?;
    if health.port.is_none() {
        return Err(format!("port manquant dans la sortie sidecar: {line}"));
    }
    Ok(health)
}

#[tauri::command]
pub fn sidecar_port(app: tauri::AppHandle) -> Result<SidecarInfo, String> {
    let script = resolve_script(&app)?;
    let sidecar_dir = script
        .parent()
        .ok_or_else(|| format!("chemin sidecar invalide: {}", script.display()))?;
    let bundle_hash = identity::dir_fingerprint(sidecar_dir)?;

    let mut guard = SIDECAR.lock().unwrap();
    if let Some(info) = guard.clone() {
        // Le sidecar peut être mort ou appartenir à un ancien bundle.
        if let Some(info) = verified_info(info, &bundle_hash) {
            return Ok(info);
        }
        *guard = None;
    }
    // un sidecar d'une AUTRE instance tourne déjà ? le réutiliser (verrou partagé)
    if let Some(info) = read_lockfile(&bundle_hash) {
        *guard = Some(info.clone());
        return Ok(info);
    }

    let token = session_token()?;
    let mut child = Command::new("node")
        .arg(&script)
        .env("ATELIER_TOKEN", &token)
        .env("ATELIER_APP_VERSION", identity::APP_VERSION)
        .env("ATELIER_BUNDLE_HASH", &bundle_hash)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn sidecar: {e}"))?;
    let stdout = child.stdout.take().ok_or("pas de stdout")?;
    let stderr = child
        .stderr
        .take()
        .map(capture_stderr)
        .unwrap_or_else(|| Arc::new(Mutex::new(String::new())));
    let line = read_startup_line(stdout, &mut child, &stderr)?;
    let startup =
        parse_startup(&line).map_err(|e| format!("{e}; stderr: {}", stderr_snapshot(&stderr)))?;
    let port = startup.port.ok_or("port manquant")?;
    let mut info = SidecarInfo {
        port,
        token,
        identity: Some(startup),
    };
    let health = fetch_health(&info, &bundle_hash).map_err(|e| {
        format!(
            "sidecar démarré mais health invalide: {e}; stderr: {}",
            stderr_snapshot(&stderr)
        )
    })?;
    info.identity = Some(health);
    write_lockfile(&info);
    *guard = Some(info.clone());
    Ok(info)
}
