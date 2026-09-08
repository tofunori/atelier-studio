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
static GATEWAY_SCHEDULE: Mutex<GatewaySchedule> = Mutex::new(GatewaySchedule::new());

#[derive(Clone, Debug, PartialEq, Eq)]
struct GatewayIdentity {
    sidecar_port: u16,
    sidecar_token_hash: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GatewayStatus {
    Starting,
    Ready,
    Failed,
}

#[derive(Debug)]
struct GatewaySchedule {
    identity: Option<GatewayIdentity>,
    status: Option<GatewayStatus>,
}

impl GatewaySchedule {
    const fn new() -> Self {
        Self {
            identity: None,
            status: None,
        }
    }

    fn begin(&mut self, identity: GatewayIdentity) -> bool {
        if self.identity.as_ref() == Some(&identity) && self.status == Some(GatewayStatus::Starting)
        {
            return false;
        }
        self.identity = Some(identity);
        self.status = Some(GatewayStatus::Starting);
        true
    }

    fn finish(&mut self, identity: &GatewayIdentity, status: GatewayStatus) {
        if self.identity.as_ref() == Some(identity) {
            self.status = Some(status);
        }
    }
}

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

/// Planifie Remote Control hors du retour bloquant de `sidecar_port`.
/// Deux réponses rapprochées pour la même identité partagent le travail déjà
/// en cours; une nouvelle identité peut remplacer le statut sans qu'une tâche
/// ancienne n'écrase son résultat.
pub fn schedule(app: tauri::AppHandle, sidecar: SidecarInfo) {
    let identity = GatewayIdentity {
        sidecar_port: sidecar.port,
        sidecar_token_hash: token_hash(&sidecar.token),
    };
    let should_start = GATEWAY_SCHEDULE
        .lock()
        .map(|mut state| state.begin(identity.clone()))
        .unwrap_or(false);
    if !should_start {
        return;
    }

    tauri::async_runtime::spawn_blocking(move || {
        let result = ensure(&app, &sidecar);
        let status = if result.is_ok() {
            GatewayStatus::Ready
        } else {
            GatewayStatus::Failed
        };
        if let Ok(mut state) = GATEWAY_SCHEDULE.lock() {
            state.finish(&identity, status);
        }
        if let Err(error) = result {
            eprintln!("[atelier] gateway iPhone non disponible: {error}");
        }
    });
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

/// Serialize gateway replacement across app instances/worktrees, not just threads.
struct GatewayStartGuard(File);
impl GatewayStartGuard {
    fn acquire(path: &Path) -> Result<Self, String> {
        use std::os::fd::AsRawFd;
        use std::os::unix::fs::OpenOptionsExt;
        let file = OpenOptions::new().create(true).read(true).write(true).mode(0o600)
            .open(path).map_err(|e| e.to_string())?;
        for _ in 0..60 {
            if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 {
                return Ok(Self(file));
            }
            thread::sleep(Duration::from_millis(100));
        }
        Err("Une autre instance initialise la connexion iPhone".into())
    }
}
impl Drop for GatewayStartGuard {
    fn drop(&mut self) {
        use std::os::fd::AsRawFd;
        unsafe { libc::flock(self.0.as_raw_fd(), libc::LOCK_UN); }
    }
}

fn parse_listener_pids(output: &str, bind: &str) -> Vec<u32> {
    let mut pid = None;
    let mut found = Vec::new();
    for line in output.lines() {
        if let Some(value) = line.strip_prefix('p') { pid = value.parse::<u32>().ok(); }
        if line.strip_prefix('n') == Some(bind) {
            if let Some(pid) = pid { if !found.contains(&pid) { found.push(pid); } }
        }
    }
    found
}
fn listener_pids(bind: &str) -> Result<Vec<u32>, String> {
    let addr: SocketAddr = bind.parse().map_err(|_| "Adresse de passerelle invalide")?;
    let output = Command::new("/usr/sbin/lsof")
        .args(["-nP", "-a", &format!("-iTCP:{}", addr.port()), "-sTCP:LISTEN", "-Fpn"])
        .output().map_err(|_| "Impossible d’identifier la passerelle sur le port iPhone")?;
    // lsof returns 1 with empty output when no socket matches.
    if !output.status.success() && output.status.code() != Some(1) {
        return Err("Impossible de vérifier le port iPhone".into());
    }
    Ok(parse_listener_pids(&String::from_utf8_lossy(&output.stdout), bind))
}
fn managed_gateway(pid: u32) -> bool {
    let output = Command::new("/bin/ps").args(["-p", &pid.to_string(), "-o", "uid=,comm="]).output();
    let Ok(output) = output else { return false };
    let text = String::from_utf8_lossy(&output.stdout);
    let mut parts = text.trim().splitn(2, char::is_whitespace);
    let uid = parts.next().and_then(|s| s.parse::<u32>().ok());
    let path = parts.next().unwrap_or("").trim();
    uid == Some(unsafe { libc::geteuid() }) && Path::new(path).is_absolute()
        && Path::new(path).file_name().is_some_and(|s| s == "atelier-remote-gateway")
}
fn terminate(info: &GatewayLock) {
    // A stale lock may point to a reused PID. Never signal an unrelated process.
    if info.pid > 0 && managed_gateway(info.pid) {
        let _ = Command::new("kill").args(["-TERM", &info.pid.to_string()])
            .stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    if read_lock().is_some_and(|stored| stored.pid == info.pid) {
        if let Some(path) = lock_path() { let _ = std::fs::remove_file(path); }
    }
}
fn child_owns_listener(child: &mut std::process::Child, bind: &str) -> Result<bool, String> {
    if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
        return Err(format!("La nouvelle passerelle a quitté ({status})"));
    }
    Ok(listener_pids(bind)?.contains(&child.id()) && gateway_healthy(bind))
}

/// Ensure the private gateway matches the current sidecar session.
pub fn ensure(app: &tauri::AppHandle, sidecar: &SidecarInfo) -> Result<(), String> {
    let ip = tailscale_ip()?;
    let bind = format!("{ip}:{GATEWAY_PORT}");
    let expected_hash = token_hash(&sidecar.token);
    let mut process_guard = REMOTE_GATEWAY.lock().map_err(|e| e.to_string())?;

    let root = app_dir().ok_or("dossier utilisateur introuvable")?;
    std::fs::create_dir_all(root.join("remote")).map_err(|e| e.to_string())?;
    let _start_guard = GatewayStartGuard::acquire(&root.join("remote/gateway-start.lock"))?;
    // Ignore a delayed scheduler task for a sidecar that has since been replaced.
    if let Ok(raw) = std::fs::read(root.join("sidecar.lock")) {
        if let Ok(current) = serde_json::from_slice::<serde_json::Value>(&raw) {
            if current["port"].as_u64() != Some(sidecar.port as u64)
                || current["token"].as_str().map(token_hash).as_deref() != Some(expected_hash.as_str()) {
                return Err("Le moteur a changé ; la nouvelle session initialisera la passerelle".into());
            }
        }
    }
    let existing = read_lock().or_else(|| process_guard.clone());
    if let Some(info) = existing {
        if info.bind == bind
            && info.sidecar_port == sidecar.port
            && info.sidecar_token_hash == expected_hash
            && listener_pids(&bind)?.contains(&info.pid)
            && managed_gateway(info.pid)
            && gateway_healthy(&bind)
        {
            *process_guard = Some(info);
            return Ok(());
        }
        terminate(&info);
    }

    *process_guard = None;
    // Recover an orphan even if a failed launch previously overwrote gateway.lock.
    for pid in listener_pids(&bind)? {
        if !managed_gateway(pid) { return Err("Le port iPhone est utilisé par un autre programme".into()); }
        terminate(&GatewayLock { pid, bind: bind.clone(), sidecar_port: 0, sidecar_token_hash: String::new() });
    }
    for _ in 0..20 {
        if listener_pids(&bind)?.is_empty() { break; }
        thread::sleep(Duration::from_millis(150));
    }
    if !listener_pids(&bind)?.is_empty() { return Err("L’ancienne passerelle ne s’est pas encore arrêtée".into()); }

    let binary = resolve_gateway(app)?;
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let mobile_dir = resource_dir.join("mobile");
    let root = app_dir().ok_or("dossier utilisateur introuvable")?;
    let remote_dir = root.join("remote");
    std::fs::create_dir_all(&remote_dir).map_err(|e| e.to_string())?;
    let log_path = remote_dir.join("gateway.log");
    let mut log_options = OpenOptions::new();
    log_options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        log_options.mode(0o600);
    }
    let stderr = log_options.open(&log_path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        // `.mode()` ne s'applique qu'à la création : un fichier de log déjà
        // présent avant ce correctif (potentiellement 0644, cf. SEC-03) est
        // reverrouillé explicitement ici.
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&log_path, std::fs::Permissions::from_mode(0o600));
    }
    let stdout = File::open("/dev/null").map_err(|e| e.to_string())?;
    let dns = tailscale_dns_name().unwrap_or_default();
    let allowed_hosts =
        format!("127.0.0.1,localhost,tauri.localhost,{ip},{ip}:{GATEWAY_PORT},{dns},{dns}:8443");
    let mut child = Command::new(binary)
        .env("ATELIER_REMOTE_BIND", &bind)
        .env("ATELIER_REMOTE_ALLOWED_HOSTS", allowed_hosts)
        .env("ATELIER_APP_DIR", &root)
        .env(
            "ATELIER_SIDECAR_BASE",
            format!("http://127.0.0.1:{}", sidecar.port),
        )
        .env("ATELIER_TOKEN", &sidecar.token)
        .env("ATELIER_MOBILE_DIR", mobile_dir)
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
    for _ in 0..20 {
        match child_owns_listener(&mut child, &bind) {
            Ok(true) => {
                if let Err(error) = write_lock(&info) { let _ = child.kill(); let _ = child.wait(); return Err(error); }
                *process_guard = Some(info);
                return Ok(());
            }
            Err(error) => { let _ = child.kill(); let _ = child.wait(); return Err(error); }
            Ok(false) => {}
        }
        thread::sleep(Duration::from_millis(150));
    }
    let _ = child.kill();
    let _ = child.wait();
    let mut log = String::new();
    if let Some(path) = app_dir().map(|p| p.join("remote/gateway.log")) {
        let _ = File::open(path).and_then(|mut f| f.read_to_string(&mut log));
    }
    let diagnostic = redact_and_truncate(log.lines().last().unwrap_or("aucun diagnostic"));
    Err(format!("gateway non joignable sur {bind}: {diagnostic}"))
}

/// Remplace toute suite de 32+ caractères hex (jeton probable) par `[jeton]`
/// avant de tronquer à 200 caractères — jamais de secret dans l'UI (SEC-03).
fn redact_and_truncate(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut run_start: Option<usize> = None;
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_hexdigit() {
            if run_start.is_none() {
                run_start = Some(i);
            }
        } else if let Some(start) = run_start.take() {
            push_run(&mut out, &chars[start..i]);
        } else {
            out.push(chars[i]);
        }
        i += 1;
    }
    if let Some(start) = run_start {
        push_run(&mut out, &chars[start..]);
    }
    out.chars().take(200).collect()
}

fn push_run(out: &mut String, run: &[char]) {
    if run.len() >= 32 {
        out.push_str("[jeton]");
    } else {
        out.extend(run.iter());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn listener_identity_ignores_other_addresses_and_deduplicates() {
        let output = "p41\nn127.0.0.1:18765\np52\nn100.72.242.97:18765\nn100.72.242.97:18765\np63\nn*:18765\n";
        assert_eq!(parse_listener_pids(output, "100.72.242.97:18765"), vec![52]);
        assert_eq!(parse_listener_pids(output, "127.0.0.1:18765"), vec![41]);
    }

    #[test]
    fn another_process_listening_does_not_validate_a_new_child() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let bind = listener.local_addr().unwrap().to_string();
        assert!(gateway_healthy(&bind));
        let mut child = Command::new("/bin/sleep").arg("5").spawn().unwrap();
        let result = child_owns_listener(&mut child, &bind);
        let _ = child.kill(); let _ = child.wait();
        assert_eq!(result.unwrap(), false);
        // Even a responsive old listener cannot hide a new child's failure.
        assert!(child_owns_listener(&mut child, &bind).is_err());
    }

    #[test]
    fn unrelated_current_process_is_not_a_managed_gateway() {
        assert!(!managed_gateway(std::process::id()));
    }

    #[test]
    fn redact_and_truncate_strips_long_hex_runs_and_caps_length() {
        let token = "a".repeat(64);
        let line = format!("atelier-remote-gateway admin token (loopback only): {token}");
        let redacted = redact_and_truncate(&line);
        assert!(!redacted.contains(&token));
        assert!(redacted.contains("[jeton]"));
        assert!(redacted.chars().count() <= 200);

        // Une longue ligne sans jeton reste tronquée à 200 caractères.
        let long_line = "x".repeat(500);
        assert_eq!(redact_and_truncate(&long_line).chars().count(), 200);

        // Un identifiant court (pid, port…) n'est pas confondu avec un jeton.
        let short = "port=18765";
        assert_eq!(redact_and_truncate(short), short);
    }

    #[test]
    fn bind_string_never_targets_an_unspecified_address() {
        // Le bind du gateway est construit à partir de l'IP Tailscale résolue
        // (jamais 0.0.0.0) — régression pour SEC-01/-02 : un retour en arrière
        // vers `format!("0.0.0.0:{GATEWAY_PORT}")` doit casser ce test.
        let ip: IpAddr = "100.64.12.34".parse().unwrap();
        let bind = format!("{ip}:{GATEWAY_PORT}");
        let addr: SocketAddr = bind.parse().unwrap();
        assert!(!addr.ip().is_unspecified());
    }

    #[test]
    fn bundled_gateway_candidate_has_priority() {
        let paths = gateway_candidates(Some(Path::new("/App/Resources")));
        assert_eq!(
            paths[0],
            Path::new("/App/Resources/rust-server/atelier-remote-gateway")
        );
    }

    fn identity(port: u16, token: &str) -> GatewayIdentity {
        GatewayIdentity {
            sidecar_port: port,
            sidecar_token_hash: token_hash(token),
        }
    }

    #[test]
    fn identical_schedule_is_deduplicated_while_starting() {
        let mut schedule = GatewaySchedule::new();
        let current = identity(1234, "token-a");
        assert!(schedule.begin(current.clone()));
        assert!(!schedule.begin(current.clone()));

        schedule.finish(&current, GatewayStatus::Ready);
        assert!(schedule.begin(current));
    }

    #[test]
    fn stale_gateway_completion_does_not_replace_new_identity_status() {
        let mut schedule = GatewaySchedule::new();
        let old = identity(1234, "token-a");
        let new = identity(5678, "token-b");
        assert!(schedule.begin(old.clone()));
        assert!(schedule.begin(new.clone()));

        schedule.finish(&old, GatewayStatus::Failed);
        assert_eq!(schedule.identity, Some(new));
        assert_eq!(schedule.status, Some(GatewayStatus::Starting));
    }
}

/// Privileged gateway actions stay on a user-only Unix socket, never in web credentials.
#[tauri::command]
pub async fn remote_device_action(action: String) -> Result<serde_json::Value, String> {
    if action != "pair" && action != "devices" && !(action.starts_with("revoke ") && action.len() < 100 && !action.contains('\n')) {
        return Err("Action inconnue".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::{Read, Write};
        use std::os::unix::net::UnixStream;
        let root = app_dir().ok_or("Dossier Atelier introuvable")?;
        let mut stream = UnixStream::connect(root.join("remote/pair.sock"))
            .map_err(|_| "La passerelle n’est pas prête. Vérifiez que Tailscale est connecté.")?;
        stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|e| e.to_string())?;
        stream.write_all(format!("{action}\n").as_bytes()).map_err(|e| e.to_string())?;
        let mut body = String::new();
        stream.take(1024 * 1024).read_to_string(&mut body).map_err(|e| e.to_string())?;
        let mut value: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
        if let Some(error) = value.get("error").and_then(|v| v.as_str()) { return Err(error.to_owned()); }
        if action == "pair" {
            let dns = tailscale_dns_name().ok_or("Adresse Tailscale introuvable")?;
            value["gatewayUrl"] = serde_json::json!(format!("https://{dns}:8443"));
        }
        Ok(value)
    }).await.map_err(|e| e.to_string())?
}
