use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Clone, serde::Serialize)]
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

#[tauri::command]
pub fn sidecar_port(app: tauri::AppHandle) -> Result<SidecarInfo, String> {
    let mut guard = SIDECAR.lock().unwrap();
    if let Some(info) = guard.clone() {
        // le sidecar peut être mort (kill, crash) : vérifier avant de réutiliser
        let alive = std::net::TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", info.port).parse().unwrap(),
            std::time::Duration::from_millis(400),
        )
        .is_ok();
        if alive {
            return Ok(info);
        }
        *guard = None;
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
    *guard = Some(info.clone());
    Ok(info)
}
