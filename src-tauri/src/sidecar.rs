//! Chat backend spawn (plan 033 Porte 10).
//!
//! **Default backend = Rust** (`atelier-studio-server`).  
//! Explicit soak fallback: `ATELIER_BACKEND=node` (Node sidecar remains staged).
//!
//! Lifecycle: reuse in-process handle → reuse lockfile when health+identity match
//! → spawn new → kill child on failed health (no orphan loops).

use crate::identity::{self, ProcessHealth};
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
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
    /// Diagnostic only — "rust" | "node" (optional for old lock files).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    backend: Option<String>,
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

/// Backend selector (plan 033). Default **Rust** since Porte 10.
/// Soak: set `ATELIER_BACKEND=node` to force the historical Node sidecar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BackendKind {
    Node,
    Rust,
}

impl BackendKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Node => "node",
            Self::Rust => "rust",
        }
    }
}

fn parse_backend_kind(raw: &str) -> BackendKind {
    match raw.trim().to_ascii_lowercase().as_str() {
        "node" => BackendKind::Node,
        // empty / "rust" / unknown → Rust (default). Unknown values do not
        // silently re-enable Node; use explicit "node" for the soak fallback.
        _ => BackendKind::Rust,
    }
}

fn backend_kind() -> BackendKind {
    let kind = parse_backend_kind(&std::env::var("ATELIER_BACKEND").unwrap_or_default());
    if kind == BackendKind::Node {
        eprintln!(
            "[atelier] ATELIER_BACKEND=node — fallback soak (plan 033). \
             Défaut production = Rust. Voir docs/SOAK_033_RUST_BACKEND.md"
        );
    }
    kind
}

/// Candidate paths for `atelier-studio-server` (dev tree + staged resource).
fn rust_server_candidates(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(explicit) = std::env::var("ATELIER_RUST_SERVER") {
        out.push(PathBuf::from(explicit));
    }
    let cwd = std::env::current_dir().ok();
    if let Some(c) = &cwd {
        out.push(c.join("../rust/target/debug/atelier-studio-server"));
        out.push(c.join("../rust/target/release/atelier-studio-server"));
        out.push(c.join("rust/target/debug/atelier-studio-server"));
        out.push(c.join("rust/target/release/atelier-studio-server"));
        out.push(c.join("../src-tauri/rust-server-dist/atelier-studio-server"));
        out.push(c.join("src-tauri/rust-server-dist/atelier-studio-server"));
    }
    if let Some(h) = dirs::home_dir() {
        out.push(h.join("Documents/atelier-studio/rust/target/debug/atelier-studio-server"));
        out.push(h.join("Documents/atelier-studio/rust/target/release/atelier-studio-server"));
        out.push(
            h.join("Documents/atelier-studio/src-tauri/rust-server-dist/atelier-studio-server"),
        );
    }
    if let Some(res) = resource_dir {
        // staged as resources "rust-server-dist" → "rust-server"
        out.push(res.join("rust-server/atelier-studio-server"));
        // flat alias if present
        out.push(res.join("atelier-studio-server"));
    }
    out
}

/// Resolve `atelier-studio-server` for the Rust backend (dev or resource).
fn resolve_rust_server(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource = app.path().resource_dir().ok();
    for c in rust_server_candidates(resource.as_deref()) {
        if c.is_file() {
            return Ok(c);
        }
    }
    Err(
        "atelier-studio-server introuvable. Build: cargo build -p atelier-server --release \
         --manifest-path rust/Cargo.toml  (ou scripts/stage-rust-server.sh). \
         Fallback soak: ATELIER_BACKEND=node"
            .into(),
    )
}

fn file_fingerprint(path: &std::path::Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("hash {}: {e}", path.display()))?;
    Ok(format!("{:x}", md5::compute(bytes)))
}

enum HealthError {
    /// Réseau/timeout — peut réussir au prochain essai (machine chargée).
    Transport(String),
    /// Le process répond mais n'est pas le bon sidecar — déterministe, ne pas réessayer.
    Identity(String),
}

fn fetch_health(info: &SidecarInfo, expected_hash: &str) -> Result<ProcessHealth, HealthError> {
    let value = identity::http_json(
        info.port,
        "/health",
        &[("x-atelier-token", &info.token)],
        Duration::from_millis(900),
    )
    .map_err(HealthError::Transport)?;
    let health = identity::parse_health(value).map_err(HealthError::Identity)?;
    if health.token_required != Some(true) {
        return Err(HealthError::Identity(format!(
            "tokenRequired={:?}",
            health.token_required
        )));
    }
    if let Some(reason) =
        identity::health_mismatch(&health, identity::SIDECAR_SERVICE, expected_hash, None)
    {
        return Err(HealthError::Identity(reason));
    }
    Ok(health)
}

/// Au premier lancement post-build (caches froids, TCC, CPU chargé), une sonde
/// de 900 ms peut expirer alors que le sidecar est sain.
fn fetch_health_retry(info: &SidecarInfo, expected_hash: &str) -> Result<ProcessHealth, String> {
    const ATTEMPTS: u32 = 5;
    let mut last = String::new();
    for attempt in 0..ATTEMPTS {
        if attempt > 0 {
            thread::sleep(Duration::from_millis(400));
        }
        match fetch_health(info, expected_hash) {
            Ok(health) => return Ok(health),
            Err(HealthError::Identity(reason)) => return Err(reason),
            Err(HealthError::Transport(reason)) => last = reason,
        }
    }
    Err(format!("health après {ATTEMPTS} tentatives: {last}"))
}

fn verified_info(mut info: SidecarInfo, expected_hash: &str) -> Option<SidecarInfo> {
    match fetch_health_retry(&info, expected_hash) {
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

/// If lock exists but is not healthy/compatible, best-effort SIGTERM of the
/// recorded pid so a fresh spawn is not racing a zombie Node or old Rust.
fn terminate_stale_lock(expected_hash: &str) {
    let Some(p) = lockfile_path() else {
        return;
    };
    let Ok(raw) = std::fs::read_to_string(&p) else {
        return;
    };
    let Ok(info) = serde_json::from_str::<SidecarInfo>(&raw) else {
        return;
    };
    // Compatible live instance — leave it (read_lockfile will reuse).
    if verified_info(info.clone(), expected_hash).is_some() {
        return;
    }
    let pid = info.identity.as_ref().and_then(|h| h.pid);
    if let Some(pid) = pid {
        if pid > 0 {
            // Best-effort: only kill a pid we previously wrote into our own lock.
            let _ = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            // brief wait so the port frees before we re-bind
            thread::sleep(Duration::from_millis(200));
        }
    }
    let _ = std::fs::remove_file(p);
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
    stderr: &Arc<Mutex<String>>,
    timeout: Duration,
) -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut line = String::new();
        let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
        let _ = tx.send(result);
    });
    match rx.recv_timeout(timeout) {
        Ok(Ok(line)) if !line.trim().is_empty() => Ok(line),
        Ok(Ok(_)) => Err(format!(
            "sidecar stdout vide; stderr: {}",
            stderr_snapshot(stderr)
        )),
        Ok(Err(e)) => Err(format!(
            "lecture sidecar: {e}; stderr: {}",
            stderr_snapshot(stderr)
        )),
        Err(_) => Err(format!(
            "timeout au démarrage du sidecar; stderr: {}",
            stderr_snapshot(stderr)
        )),
    }
}

fn kill_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait(); // reap — sinon zombie jusqu'à la fin de l'app
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
    let backend = backend_kind();
    let (bundle_hash, mut spawn_cmd, startup_timeout): (String, Command, Duration) = match backend {
        BackendKind::Node => {
            let script = resolve_script(&app)?;
            let sidecar_dir = script
                .parent()
                .ok_or_else(|| format!("chemin sidecar invalide: {}", script.display()))?;
            let bundle_hash = identity::dir_fingerprint(sidecar_dir)?;
            let node = crate::bin_resolver::node_bin(&app)?;
            let mut cmd = Command::new(node);
            cmd.arg(&script);
            (bundle_hash, cmd, Duration::from_secs(4))
        }
        BackendKind::Rust => {
            let bin = resolve_rust_server(&app)?;
            let bundle_hash = file_fingerprint(&bin)?;
            let cmd = Command::new(&bin);
            // First post-build boot can be slow (TCC / cold caches).
            (bundle_hash, cmd, Duration::from_secs(10))
        }
    };

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

    // Lock présent mais incompatible (ex. Node → bascule Rust) : terminer
    // l'orphelin identifié avant de spawner, sinon course sur le port / pid.
    terminate_stale_lock(&bundle_hash);

    let token = session_token()?;
    // Runtime du bundle en production; PATH réparé uniquement en secours dev.
    let mut child = spawn_cmd
        .env("ATELIER_TOKEN", &token)
        .env("ATELIER_APP_VERSION", identity::APP_VERSION)
        .env("ATELIER_BUNDLE_HASH", &bundle_hash)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn sidecar ({}): {e}", backend.as_str()))?;
    let Some(stdout) = child.stdout.take() else {
        kill_child(&mut child);
        return Err("pas de stdout".into());
    };
    let stderr = child
        .stderr
        .take()
        .map(capture_stderr)
        .unwrap_or_else(|| Arc::new(Mutex::new(String::new())));
    // Tout échec post-spawn TUE le child : un sidecar non vérifié laissé vivant
    // devient l'orphelin que le spawn suivant SIGTERM via sidecar.pid, pile
    // pendant que Rust attend son health — boucle « Sidecar déconnecté ».
    let verified: Result<SidecarInfo, String> = (|| {
        let line = read_startup_line(stdout, &stderr, startup_timeout)?;
        let startup = parse_startup(&line)
            .map_err(|e| format!("{e}; stderr: {}", stderr_snapshot(&stderr)))?;
        let port = startup.port.ok_or("port manquant")?;
        let mut info = SidecarInfo {
            port,
            token,
            identity: Some(startup),
            backend: Some(backend.as_str().into()),
        };
        let health = fetch_health_retry(&info, &bundle_hash).map_err(|e| {
            format!(
                "sidecar démarré mais health invalide: {e}; stderr: {}",
                stderr_snapshot(&stderr)
            )
        })?;
        info.identity = Some(health);
        Ok(info)
    })();
    let info = match verified {
        Ok(info) => info,
        Err(e) => {
            kill_child(&mut child);
            return Err(e);
        }
    };
    write_lockfile(&info);
    *guard = Some(info.clone());
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_backend_is_rust() {
        assert_eq!(parse_backend_kind(""), BackendKind::Rust);
        assert_eq!(parse_backend_kind("  "), BackendKind::Rust);
        assert_eq!(parse_backend_kind("rust"), BackendKind::Rust);
        assert_eq!(parse_backend_kind("RUST"), BackendKind::Rust);
    }

    #[test]
    fn explicit_node_fallback() {
        assert_eq!(parse_backend_kind("node"), BackendKind::Node);
        assert_eq!(parse_backend_kind("Node"), BackendKind::Node);
    }

    #[test]
    fn unknown_is_not_node() {
        // Avoid accidental Node re-enable via typos.
        assert_eq!(parse_backend_kind("nodejs"), BackendKind::Rust);
        assert_eq!(parse_backend_kind("default"), BackendKind::Rust);
    }

    #[test]
    fn rust_candidates_include_staged_and_resource() {
        let list = rust_server_candidates(Some(Path::new("/App/Resources")));
        assert!(list.iter().any(|p| p.ends_with("rust-server/atelier-studio-server")));
        assert!(list.iter().any(|p| p.ends_with("atelier-studio-server")));
    }
}
