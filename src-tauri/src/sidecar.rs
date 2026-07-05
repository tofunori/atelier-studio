use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct SidecarInfo {
    port: u16,
    token: String,
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

fn port_alive(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(
        &format!("127.0.0.1:{port}").parse().unwrap(),
        std::time::Duration::from_millis(400),
    )
    .is_ok()
}

/// Verrou d'instance unique : {port, token} du sidecar vivant, partagé entre
/// les instances (dev + build). Une app réutilise le sidecar existant au lieu
/// d'en lancer un rival (leurs PID-files s'entretuaient).
fn read_lockfile() -> Option<SidecarInfo> {
    let p = lockfile_path()?;
    let raw = std::fs::read_to_string(p).ok()?;
    let info: SidecarInfo = serde_json::from_str(&raw).ok()?;
    if port_alive(info.port) {
        Some(info)
    } else {
        None
    }
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

#[tauri::command]
pub fn sidecar_port(app: tauri::AppHandle) -> Result<SidecarInfo, String> {
    let mut guard = SIDECAR.lock().unwrap();
    if let Some(info) = guard.clone() {
        // le sidecar peut être mort (kill, crash) : vérifier avant de réutiliser
        if port_alive(info.port) {
            return Ok(info);
        }
        *guard = None;
    }
    // un sidecar d'une AUTRE instance tourne déjà ? le réutiliser (verrou partagé)
    if let Some(info) = read_lockfile() {
        *guard = Some(info.clone());
        return Ok(info);
    }
    // dev : sidecar/ à la racine du repo (cwd = src-tauri) ; bundle : ressources
    let dev_script = std::env::current_dir()
        .map_err(|e| e.to_string())?
        .join("../sidecar/index.mjs");
    let script = if dev_script.exists() {
        dev_script
    } else {
        app.path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("sidecar/index.mjs")
    };
    let token = session_token()?;
    let mut child = Command::new("node")
        .arg(&script)
        .env("ATELIER_TOKEN", &token)
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn sidecar: {e}"))?;
    let stdout = child.stdout.take().ok_or("pas de stdout")?;
    let mut line = String::new();
    BufReader::new(stdout)
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    let v: serde_json::Value =
        serde_json::from_str(line.trim()).map_err(|e| format!("sortie sidecar: {e}"))?;
    let port = v["port"].as_u64().ok_or("port manquant")? as u16;
    let info = SidecarInfo { port, token };
    write_lockfile(&info);
    *guard = Some(info.clone());
    Ok(info)
}
