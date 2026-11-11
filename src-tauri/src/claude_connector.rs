//! Connecteur Claude (`atelier-annots-mcp --http`), lancé par Atelier.
//!
//! claude.ai joint ce connecteur par Tailscale Funnel pour ouvrir les projets
//! LaTeX du Mac dans l'éditeur de l'artefact. Avant, il fallait le garder
//! ouvert dans un onglet du Terminal et le relancer à chaque nouvelle
//! version. Atelier le démarre maintenant au lancement, comme la passerelle
//! iPhone, et le remplace quand son binaire change (nouvelle version
//! installée) ; il survit à la fermeture d'Atelier.
//!
//! Réglage : `claude-connector/config.json` dans Application Support,
//! `{"enabled": true, "roots": ["~/Documents/These"]}`. Sans réglage, le
//! connecteur est lancé seulement s'il a déjà été relié à Claude (présence de
//! `claude-connector/state.json`). Le connecteur relit `roots` à chaque
//! requête : aucun dossier n'est servi tant qu'il n'y en a pas.

use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use tauri::Manager;

const PORT: u16 = 8791;
const BINARY: &str = "atelier-annots-mcp";

#[derive(Debug, Default, Deserialize)]
struct Settings {
    enabled: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ConnectorLock {
    pid: u32,
    /// Chemin, taille et date du binaire lancé : un autre binaire (nouvelle
    /// version) remplace le connecteur.
    binary: String,
}

fn app_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Library/Application Support/atelier-studio"))
}

fn dir() -> Option<PathBuf> {
    app_dir().map(|p| p.join("claude-connector"))
}

fn read_settings(dir: &Path) -> Settings {
    std::fs::read(dir.join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or_default()
}

/// Lancé si le réglage le dit ; sans réglage, seulement si Claude a déjà été
/// relié (un code choisi et des jetons dans `state.json`).
fn enabled(dir: &Path) -> bool {
    read_settings(dir)
        .enabled
        .unwrap_or_else(|| dir.join("state.json").is_file())
}

fn candidates(resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(resource) = resource_dir {
        paths.push(resource.join("rust-server").join(BINARY));
        paths.push(resource.join(BINARY));
    }
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join("../rust/target/release").join(BINARY));
        paths.push(cwd.join("rust/target/release").join(BINARY));
        paths.push(cwd.join("src-tauri/rust-server-dist").join(BINARY));
    }
    paths
}

/// Identité d'un binaire : chemin, taille, date.
fn identity(binary: &Path) -> String {
    let meta = std::fs::metadata(binary).ok();
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime = meta
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{}|{size}|{mtime}", binary.display())
}

fn read_lock(dir: &Path) -> Option<ConnectorLock> {
    serde_json::from_slice(&std::fs::read(dir.join("connector.lock")).ok()?).ok()
}

fn write_lock(dir: &Path, lock: &ConnectorLock) -> Result<(), String> {
    let raw = serde_json::to_vec(lock).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("connector.lock"), raw).map_err(|e| e.to_string())
}

fn bind() -> String {
    format!("127.0.0.1:{PORT}")
}

fn healthy() -> bool {
    let addr: SocketAddr = ([127, 0, 0, 1], PORT).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(350)).is_ok()
}

/// Un connecteur à nous : même utilisateur, exécutable `atelier-annots-mcp`
/// (lancé par Atelier ou, avant, à la main dans le Terminal).
fn managed(pid: u32) -> bool {
    let output = Command::new("/bin/ps")
        .args(["-p", &pid.to_string(), "-o", "uid=,comm="])
        .output();
    let Ok(output) = output else { return false };
    let text = String::from_utf8_lossy(&output.stdout);
    let mut parts = text.trim().splitn(2, char::is_whitespace);
    let uid = parts.next().and_then(|s| s.parse::<u32>().ok());
    let path = parts.next().unwrap_or("").trim();
    uid == Some(unsafe { libc::geteuid() })
        && Path::new(path).file_name().is_some_and(|s| s == BINARY)
}

fn terminate(pid: u32) {
    // Un PID réutilisé ne doit jamais recevoir de signal.
    if pid > 0 && managed(pid) {
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

fn append_log(dir: &Path, line: &str) {
    use std::io::Write;
    if let Ok(mut file) = log_file(dir) {
        let _ = writeln!(file, "{line}");
    }
}

fn log_file(dir: &Path) -> Result<File, String> {
    let path = dir.join("connector.log");
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(&path).map_err(|e| e.to_string())
}

/// Lance le connecteur hors du démarrage de l'app.
pub fn schedule(app: tauri::AppHandle) {
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = ensure(&app) {
            eprintln!("[atelier] connecteur Claude non disponible: {error}");
            if let Some(dir) = dir() {
                append_log(
                    &dir,
                    &format!("[atelier] connecteur Claude non disponible: {error}"),
                );
            }
        }
    });
}

/// Le connecteur tourne avec le binaire de cette version d'Atelier, ou rien
/// si le réglage le coupe.
pub fn ensure(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = dir().ok_or("dossier utilisateur introuvable")?;
    let bind = bind();
    if !enabled(&dir) {
        // Coupé dans le réglage : un connecteur encore lancé s'arrête.
        if let Some(lock) = read_lock(&dir) {
            terminate(lock.pid);
            let _ = std::fs::remove_file(dir.join("connector.lock"));
        }
        return Ok(());
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let resource = app.path().resource_dir().ok();
    let binary = candidates(resource.as_deref())
        .into_iter()
        .find(|p| p.is_file())
        .ok_or("atelier-annots-mcp introuvable dans le bundle")?;
    let wanted = identity(&binary);
    let listeners = crate::remote_gateway::listener_pids(&bind)?;
    if let Some(lock) = read_lock(&dir) {
        if lock.binary == wanted && listeners.contains(&lock.pid) && managed(lock.pid) && healthy()
        {
            return Ok(());
        }
    }
    // Ancienne version, ou connecteur lancé à la main : on le remplace. Un
    // autre programme sur le port n'est jamais touché.
    for pid in &listeners {
        if !managed(*pid) {
            return Err(format!("le port {PORT} est utilisé par un autre programme"));
        }
        terminate(*pid);
    }
    for _ in 0..20 {
        if crate::remote_gateway::listener_pids(&bind)?.is_empty() {
            break;
        }
        thread::sleep(Duration::from_millis(150));
    }
    if !crate::remote_gateway::listener_pids(&bind)?.is_empty() {
        return Err("l'ancien connecteur ne s'est pas encore arrêté".into());
    }

    let stderr = log_file(&dir)?;
    let stdout = File::open("/dev/null").map_err(|e| e.to_string())?;
    let app_dir = app_dir().ok_or("dossier utilisateur introuvable")?;
    let mut command = Command::new(&binary);
    command
        .args(["--http", &PORT.to_string()])
        .env("ATELIER_APP_DIR", &app_dir)
        // Les dossiers viennent du réglage, relu à chaque requête.
        .env_remove("ATELIER_CONNECTOR_ROOTS")
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    if let Some(dns) = crate::remote_gateway::tailscale_dns_name() {
        command.env("ATELIER_CONNECTOR_URL", format!("https://{dns}"));
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("démarrage du connecteur : {e}"))?;
    let lock = ConnectorLock {
        pid: child.id(),
        binary: wanted,
    };
    for _ in 0..20 {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!(
                "le connecteur a quitté ({status}) : voir claude-connector/connector.log"
            ));
        }
        if crate::remote_gateway::listener_pids(&bind)?.contains(&child.id()) {
            write_lock(&dir, &lock)?;
            return Ok(());
        }
        thread::sleep(Duration::from_millis(150));
    }
    let _ = child.kill();
    let _ = child.wait();
    Err(format!("connecteur non joignable sur {bind}"))
}

// ——— Page « Claude » des réglages ———

/// Réécrit `config.json` en gardant les clés inconnues (fichier en 600).
fn update_config(
    dir: &Path,
    change: impl FnOnce(&mut serde_json::Map<String, serde_json::Value>),
) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let path = dir.join("config.json");
    let mut value: serde_json::Value = std::fs::read(&path)
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .filter(serde_json::Value::is_object)
        .unwrap_or_else(|| serde_json::json!({}));
    change(value.as_object_mut().expect("objet"));
    let tmp = path.with_extension("json.tmp");
    std::fs::write(
        &tmp,
        serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn roots_of(dir: &Path) -> Vec<String> {
    std::fs::read(dir.join("config.json"))
        .ok()
        .and_then(|raw| serde_json::from_slice::<serde_json::Value>(&raw).ok())
        .and_then(|v| v["roots"].as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect()
}

/// Ajoute ou retire un dossier ouvert à Claude. Un dossier ajouté doit
/// exister ; le chemin est gardé tel quel (absolu).
fn edit_roots(dir: &Path, path: &str, add: bool) -> Result<Vec<String>, String> {
    let path = path.trim().trim_end_matches('/').to_string();
    if add {
        let p = Path::new(&path);
        if !p.is_absolute() || !p.is_dir() {
            return Err(format!("{path} : dossier introuvable"));
        }
    }
    let mut roots = roots_of(dir);
    roots.retain(|r| r.trim_end_matches('/') != path);
    if add {
        roots.push(path);
    }
    let list = roots.clone();
    update_config(dir, |m| {
        m.insert("roots".into(), serde_json::json!(list));
    })?;
    Ok(roots)
}

fn binary_for(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource = app.path().resource_dir().ok();
    candidates(resource.as_deref())
        .into_iter()
        .find(|p| p.is_file())
        .ok_or_else(|| "atelier-annots-mcp introuvable dans le bundle".to_string())
}

/// Lance le binaire avec une option (`--status`, `--disconnect`,
/// `--set-code`), l'entrée standard donnée.
fn run_binary(app: &tauri::AppHandle, arg: &str, input: Option<&str>) -> Result<String, String> {
    use std::io::Write;
    let binary = binary_for(app)?;
    let app_dir = app_dir().ok_or("dossier utilisateur introuvable")?;
    let mut child = Command::new(&binary)
        .arg(arg)
        .env("ATELIER_APP_DIR", &app_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{BINARY} : {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.unwrap_or("").as_bytes());
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(err
            .trim()
            .trim_start_matches("atelier-annots-mcp: ")
            .to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Arrête le connecteur d'Atelier et le relance (le code ou les accès ont
/// changé : le connecteur les garde en mémoire).
fn restart(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = dir().ok_or("dossier utilisateur introuvable")?;
    if let Some(lock) = read_lock(&dir) {
        terminate(lock.pid);
        let _ = std::fs::remove_file(dir.join("connector.lock"));
    }
    ensure(app)
}

fn status(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let dir = dir().ok_or("dossier utilisateur introuvable")?;
    let mut value: serde_json::Value = run_binary(app, "--status", None)
        .ok()
        .and_then(|raw| serde_json::from_str(raw.trim()).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    let lock = read_lock(&dir);
    value["enabled"] = serde_json::json!(enabled(&dir));
    value["running"] = serde_json::json!(healthy());
    value["byAtelier"] = serde_json::json!(lock.is_some());
    value["roots"] = serde_json::json!(roots_of(&dir));
    value["url"] = serde_json::json!(
        crate::remote_gateway::tailscale_dns_name().map(|dns| format!("https://{dns}/mcp"))
    );
    value["home"] = serde_json::json!(dirs::home_dir().map(|h| h.display().to_string()));
    Ok(value)
}

/// Actions de la page « Claude » : `status`, `enable` {on}, `addRoot` /
/// `removeRoot` {path}, `setCode` {code}, `disconnect`. Répond l'état à jour.
#[tauri::command]
pub async fn claude_connector_action(
    app: tauri::AppHandle,
    action: String,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = dir().ok_or("dossier utilisateur introuvable")?;
        let arg = |k: &str| payload.as_ref().map(|p| p[k].clone()).unwrap_or_default();
        match action.as_str() {
            "status" => {}
            "enable" => {
                let on = arg("on").as_bool().unwrap_or(false);
                update_config(&dir, |m| {
                    m.insert("enabled".into(), serde_json::json!(on));
                })?;
                ensure(&app)?;
            }
            "addRoot" | "removeRoot" => {
                let path = arg("path");
                let path = path.as_str().ok_or("chemin manquant")?;
                edit_roots(&dir, path, action == "addRoot")?;
                // Le connecteur relit les dossiers à chaque requête.
            }
            "setCode" => {
                let code = arg("code");
                let code = code.as_str().ok_or("code manquant")?;
                if code.contains('\n') {
                    return Err("le code tient sur une ligne".into());
                }
                run_binary(&app, "--set-code", Some(&format!("{code}\n")))?;
                if enabled(&dir) {
                    restart(&app)?;
                }
            }
            "disconnect" => {
                run_binary(&app, "--disconnect", None)?;
                if enabled(&dir) {
                    restart(&app)?;
                }
            }
            _ => return Err("action inconnue".into()),
        }
        status(&app)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_settings_it_starts_only_once_claude_was_linked() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!enabled(dir.path()));
        std::fs::write(dir.path().join("state.json"), "{}").unwrap();
        assert!(enabled(dir.path()));
        std::fs::write(dir.path().join("config.json"), r#"{"enabled": false}"#).unwrap();
        assert!(!enabled(dir.path()));
        std::fs::remove_file(dir.path().join("state.json")).unwrap();
        std::fs::write(
            dir.path().join("config.json"),
            r#"{"enabled": true, "roots": []}"#,
        )
        .unwrap();
        assert!(enabled(dir.path()));
    }

    #[test]
    fn folders_are_added_once_removed_and_other_settings_kept() {
        let dir = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        let path = project.path().display().to_string();
        std::fs::write(
            dir.path().join("config.json"),
            r#"{"enabled": true, "x": 1}"#,
        )
        .unwrap();
        assert!(edit_roots(dir.path(), "/pas/la", true).is_err());
        assert!(edit_roots(dir.path(), "relatif", true).is_err());
        assert_eq!(
            edit_roots(dir.path(), &path, true).unwrap(),
            vec![path.clone()]
        );
        assert_eq!(
            edit_roots(dir.path(), &format!("{path}/"), true).unwrap(),
            vec![path.clone()]
        );
        let raw: serde_json::Value =
            serde_json::from_slice(&std::fs::read(dir.path().join("config.json")).unwrap())
                .unwrap();
        assert_eq!(raw["x"], 1);
        assert_eq!(raw["enabled"], true);
        assert!(edit_roots(dir.path(), &path, false).unwrap().is_empty());
        // Un dossier disparu se retire quand même.
        std::fs::write(dir.path().join("config.json"), r#"{"roots": ["/disparu"]}"#).unwrap();
        assert!(edit_roots(dir.path(), "/disparu", false)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn a_new_binary_has_a_new_identity() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join(BINARY);
        std::fs::write(&bin, "v1").unwrap();
        let first = identity(&bin);
        std::fs::write(&bin, "version 2").unwrap();
        assert_ne!(identity(&bin), first);
    }

    #[test]
    fn the_bundle_copy_comes_first() {
        let list = candidates(Some(Path::new("/App/Resources")));
        assert_eq!(
            list[0],
            Path::new("/App/Resources/rust-server/atelier-annots-mcp")
        );
    }
}
