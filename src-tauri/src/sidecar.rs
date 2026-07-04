use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

static PORT: Mutex<Option<u16>> = Mutex::new(None);

#[tauri::command]
pub fn sidecar_port(app: tauri::AppHandle) -> Result<u16, String> {
    let mut guard = PORT.lock().unwrap();
    if let Some(p) = *guard {
        // le sidecar peut être mort (kill, crash) : vérifier avant de réutiliser
        let alive = std::net::TcpStream::connect_timeout(
            &format!("127.0.0.1:{p}").parse().unwrap(),
            std::time::Duration::from_millis(400),
        )
        .is_ok();
        if alive {
            return Ok(p);
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
    let mut child = Command::new("node")
        .arg(&script)
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
    *guard = Some(port);
    Ok(port)
}
