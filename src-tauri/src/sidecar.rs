//! Chat backend spawn (plan 033 Porte 10; Node fallback retired — plan 065 phase A).
//!
//! Rust only (`atelier-studio-server`) — the historical `ATELIER_BACKEND=node`
//! chat fallback (Node sidecar `index.mjs`) has been removed after soak; see
//! `docs/soak/033-COMPLETE.md`. No Node runtime is spawned anywhere any more:
//! the KB engine is in-process Rust and the gallery backend is
//! `atelier-gallery-server` (plan 065 closed 2026-09-14).
//!
//! Lifecycle: reuse in-process handle → reuse lockfile when health+identity match
//! → spawn new → kill child on failed health (no orphan loops).
//!
//! Journal : le stderr du serveur est le fichier
//! `~/Library/Logs/Atelier/studio-server.log` (crate atelier-logs), et non plus un
//! pipe. stdout reste un pipe pour la seule ligne de démarrage, puis le
//! serveur le rebranche sur ce journal.

use crate::identity::{self, ProcessHealth};
use atelier_logs::ChildLog;
use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::Manager;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarInfo {
    pub(crate) port: u16,
    pub(crate) token: String,
    identity: Option<ProcessHealth>,
    /// Diagnostic only — always "rust" now (plan 065 phase A). Kept
    /// optional/nullable so lockfiles from older builds ("node") still
    /// deserialize.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    backend: Option<String>,
    /// Diagnostic P0 plan 053 — chemin ayant fourni cette réponse.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    lifecycle: Option<String>,
    /// Plan 053 P3 — le gateway est planifié après cette réponse.
    #[serde(default)]
    gateway_deferred: bool,
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

/// Candidate paths for `atelier-studio-server` (dev tree + staged resource).
fn rust_server_candidates(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(explicit) = std::env::var("ATELIER_RUST_SERVER") {
        out.push(PathBuf::from(explicit));
    }
    if let Some(res) = resource_dir {
        // Une app buildée doit utiliser le binaire signé/stagé de son propre
        // bundle. Chercher le checkout avant Resources peut lancer un
        // target/debug local et désynchroniser l'app de son backend.
        out.push(res.join("rust-server/atelier-studio-server"));
        // Alias plat toléré pour les anciens bundles.
        out.push(res.join("atelier-studio-server"));
    }
    let cwd = std::env::current_dir().ok();
    if let Some(c) = &cwd {
        out.push(c.join("../rust/target/release/atelier-studio-server"));
        out.push(c.join("../rust/target/debug/atelier-studio-server"));
        out.push(c.join("rust/target/release/atelier-studio-server"));
        out.push(c.join("rust/target/debug/atelier-studio-server"));
        out.push(c.join("../src-tauri/rust-server-dist/atelier-studio-server"));
        out.push(c.join("src-tauri/rust-server-dist/atelier-studio-server"));
    }
    if let Some(h) = dirs::home_dir() {
        out.push(h.join("Documents/atelier-studio/rust/target/release/atelier-studio-server"));
        out.push(h.join("Documents/atelier-studio/rust/target/debug/atelier-studio-server"));
        out.push(
            h.join("Documents/atelier-studio/src-tauri/rust-server-dist/atelier-studio-server"),
        );
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
         --manifest-path rust/Cargo.toml  (ou scripts/stage-rust-server.sh)."
            .into(),
    )
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

fn with_lifecycle(mut info: SidecarInfo, lifecycle: &str) -> SidecarInfo {
    info.lifecycle = Some(lifecycle.to_string());
    info.gateway_deferred = true;
    info
}

fn process_alive(pid: u32) -> bool {
    pid > 0
        && Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
}

enum LockInspection {
    Missing,
    Compatible(SidecarInfo),
    Stale {
        path: PathBuf,
        info: Option<SidecarInfo>,
    },
}

/// Inspecte une seule fois le verrou partagé. Un PID déjà mort est classé
/// périmé immédiatement; un PID vivant conserve tous les retries health/TCC.
fn inspect_lockfile(expected_hash: &str) -> LockInspection {
    let Some(path) = lockfile_path() else {
        return LockInspection::Missing;
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return LockInspection::Missing
        }
        Err(_) => return LockInspection::Stale { path, info: None },
    };
    let info = match serde_json::from_str::<SidecarInfo>(&raw) {
        Ok(info) => info,
        Err(_) => return LockInspection::Stale { path, info: None },
    };
    let pid = info.identity.as_ref().and_then(|health| health.pid);
    if pid.is_some_and(|pid| !process_alive(pid)) {
        return LockInspection::Stale {
            path,
            info: Some(info),
        };
    }
    match verified_info(info.clone(), expected_hash) {
        Some(info) => LockInspection::Compatible(info),
        None => LockInspection::Stale {
            path,
            info: Some(info),
        },
    }
}

/// Best-effort SIGTERM d'un verrou inspecté comme incompatible, sans refaire
/// une deuxième série de health retries.
fn terminate_stale_lock(path: PathBuf, info: Option<SidecarInfo>) {
    let pid = info
        .as_ref()
        .and_then(|info| info.identity.as_ref())
        .and_then(|health| health.pid);
    if let Some(pid) = pid {
        if process_alive(pid) {
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
    let _ = std::fs::remove_file(path);
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

/// Fin de la sortie du serveur citée dans une erreur de démarrage.
const STARTUP_OUTPUT_BYTES: usize = 4_000;

/// Journal durable du serveur de chat (problème 13 de l'audit 2026-10-18).
/// Avant, son stderr était un pipe drainé par un fil qui paniquait quand sa
/// troncature à 12 000 octets coupait un caractère accentué, et qui était
/// mort à coup sûr quand une autre instance de l'app réutilisait ce serveur
/// (lock-reuse après ⌘Q) : chaque log du serveur paniquait ensuite. Un
/// fichier reste valide quelle que soit l'app qui a lancé le serveur, et le
/// serveur le fait tourner lui-même (5 Mio, 3 anciens gardés).
fn open_server_log() -> Option<ChildLog> {
    match ChildLog::open("studio-server") {
        Ok(mut log) => {
            log.mark(&format!(
                "tauri-app (pid {}) lance atelier-studio-server",
                std::process::id()
            ));
            Some(log)
        }
        Err(e) => {
            eprintln!("[atelier] journal du serveur de chat indisponible : {e}");
            None
        }
    }
}

/// Ce que le serveur a écrit depuis son lancement (coupé sur une frontière
/// de caractère), pour les erreurs de démarrage.
fn server_output(log: Option<&ChildLog>) -> String {
    match log {
        Some(log) => format!(
            "{} (journal : {})",
            log.output_since_open(STARTUP_OUTPUT_BYTES),
            log.path().display()
        ),
        None => "journal indisponible".into(),
    }
}

fn read_startup_line<R: Read + Send + 'static>(
    stdout: R,
    log: Option<&ChildLog>,
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
            server_output(log)
        )),
        Ok(Err(e)) => Err(format!(
            "lecture sidecar: {e}; stderr: {}",
            server_output(log)
        )),
        Err(_) => Err(format!(
            "timeout au démarrage du sidecar; stderr: {}",
            server_output(log)
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

// Hors du thread principal : sondes health et attente du démarrage (jusqu'à
// 10 s) figeaient l'interface à chaque reconnexion. Le verrou SIDECAR
// sérialise déjà les appels concurrents.
#[tauri::command]
pub async fn sidecar_port(app: tauri::AppHandle) -> Result<SidecarInfo, String> {
    tauri::async_runtime::spawn_blocking(move || sidecar_port_blocking(app))
        .await
        .map_err(|e| e.to_string())?
}

fn sidecar_port_blocking(app: tauri::AppHandle) -> Result<SidecarInfo, String> {
    let bin = resolve_rust_server(&app)?;
    // empreinte en cache (chemin + mtime + taille) : appelée à chaque reconnexion
    let bundle_hash = crate::atelier::file_fingerprint(&bin)?;
    let mut spawn_cmd = Command::new(&bin);
    // First post-build boot can be slow (TCC / cold caches).
    let startup_timeout = Duration::from_secs(10);

    let mut guard = SIDECAR.lock().unwrap();
    if let Some(info) = guard.clone() {
        // Le sidecar peut être mort ou appartenir à un ancien bundle.
        if let Some(info) = verified_info(info, &bundle_hash) {
            let info = with_lifecycle(info, "in-process");
            crate::remote_gateway::schedule(app.clone(), info.clone());
            return Ok(info);
        }
        *guard = None;
    }
    // Un sidecar d'une AUTRE instance tourne déjà ? Inspection unique : le
    // réutiliser s'il est compatible, sinon nettoyer le verrou sans doubler
    // les retries health (et sans attendre du tout si son PID est mort).
    match inspect_lockfile(&bundle_hash) {
        LockInspection::Compatible(info) => {
            let info = with_lifecycle(info, "lock-reuse");
            *guard = Some(info.clone());
            crate::remote_gateway::schedule(app.clone(), info.clone());
            return Ok(info);
        }
        LockInspection::Stale { path, info } => terminate_stale_lock(path, info),
        LockInspection::Missing => {}
    }

    let token = session_token()?;
    let server_log = open_server_log();
    // Runtime du bundle en production; PATH réparé uniquement en secours dev.
    spawn_cmd
        .env("ATELIER_TOKEN", &token)
        .env("ATELIER_APP_VERSION", identity::APP_VERSION)
        .env("ATELIER_BUNDLE_HASH", &bundle_hash)
        .stdout(Stdio::piped());
    // stderr = le fichier du journal (et ATELIER_LOG_FILE), sinon /dev/null :
    // jamais un pipe dont le lecteur meurt avec cette instance de l'app.
    match &server_log {
        Some(log) => {
            let _ = log.attach(&mut spawn_cmd);
        }
        None => {
            spawn_cmd.stderr(Stdio::null());
        }
    }
    let mut child = spawn_cmd
        .spawn()
        .map_err(|e| format!("spawn sidecar (rust): {e}"))?;
    let Some(stdout) = child.stdout.take() else {
        kill_child(&mut child);
        return Err("pas de stdout".into());
    };
    // Tout échec post-spawn TUE le child : un sidecar non vérifié laissé vivant
    // devient l'orphelin que le spawn suivant SIGTERM via sidecar.pid, pile
    // pendant que Rust attend son health — boucle « Sidecar déconnecté ».
    let verified: Result<SidecarInfo, String> = (|| {
        let line = read_startup_line(stdout, server_log.as_ref(), startup_timeout)?;
        let startup = parse_startup(&line)
            .map_err(|e| format!("{e}; stderr: {}", server_output(server_log.as_ref())))?;
        let port = startup.port.ok_or("port manquant")?;
        let mut info = SidecarInfo {
            port,
            token,
            identity: Some(startup),
            backend: Some("rust".into()),
            lifecycle: Some("spawn".into()),
            gateway_deferred: false,
        };
        let health = fetch_health_retry(&info, &bundle_hash).map_err(|e| {
            format!(
                "sidecar démarré mais health invalide: {e}; stderr: {}",
                server_output(server_log.as_ref())
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
    let info = with_lifecycle(info, "spawn");
    write_lockfile(&info);
    *guard = Some(info.clone());
    crate::remote_gateway::schedule(app, info.clone());
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Le sélecteur de backend (BackendKind / parse_backend_kind /
    // ATELIER_BACKEND) a été retiré en plan 065 phase A : il n'y a plus
    // qu'un backend chat (Rust), donc plus rien à tester ici — les anciens
    // tests default_backend_is_rust / explicit_node_fallback /
    // unknown_is_not_node testaient une fonction qui n'existe plus. La seule
    // résolution restante (`resolve_rust_server` / `rust_server_candidates`)
    // reste couverte ci-dessous.

    #[test]
    fn rust_candidates_include_staged_and_resource() {
        let list = rust_server_candidates(Some(Path::new("/App/Resources")));
        assert!(list
            .iter()
            .any(|p| p.ends_with("rust-server/atelier-studio-server")));
        assert!(list.iter().any(|p| p.ends_with("atelier-studio-server")));
        assert_eq!(
            list.first().map(PathBuf::as_path),
            Some(Path::new(
                "/App/Resources/rust-server/atelier-studio-server"
            )),
            "le binaire du bundle doit précéder les fallbacks du checkout",
        );
    }

    #[test]
    fn process_liveness_distinguishes_current_and_impossible_pid() {
        assert!(process_alive(std::process::id()));
        assert!(!process_alive(u32::MAX));
    }
}
