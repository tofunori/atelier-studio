use crate::identity::{self, ProcessHealth};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::Manager;

/// Espace de ports PROPRE à Studio (18790-19789) : même hash que
/// cmux_gallery.py mais base décalée — le serveur Studio (isolé, ATELIER_STUDIO=1)
/// coexiste avec le serveur cmux normal (8790-9789) du même projet.
const STUDIO_PORT_BASE: u16 = 18790;

pub fn project_port(root: &Path) -> u16 {
    let real: PathBuf = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let digest = md5::compute(real.to_string_lossy().as_bytes());
    let rem = digest
        .0
        .iter()
        .fold(0u64, |acc, b| (acc * 256 + *b as u64) % 1000);
    STUDIO_PORT_BASE + rem as u16
}

fn ping(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    std::net::TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(500)).is_ok()
}

fn gallery_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/figures_index.html")
}

fn gallery_health(port: u16) -> Result<ProcessHealth, String> {
    let value = identity::http_json(port, "/health", &[], Duration::from_millis(900))?;
    identity::parse_health(value)
}

fn gallery_mismatch(health: &ProcessHealth, root: &Path, bundle_hash: &str) -> Option<String> {
    identity::health_mismatch(health, identity::GALLERY_SERVICE, bundle_hash, Some(root))
}

fn kill_pid(pid: u32) {
    let _ = Command::new("kill").arg("-9").arg(pid.to_string()).status();
}

fn listener_pids(port: u16) -> Vec<u32> {
    let output = Command::new("lsof")
        .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-t"])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.trim().parse::<u32>().ok())
        .collect()
}

fn pid_command(pid: u32) -> String {
    Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "command="])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_default()
}

fn stop_stale_gallery(port: u16, health: Option<&ProcessHealth>) {
    if let Some(pid) = health
        .filter(|h| h.service.as_deref() == Some(identity::GALLERY_SERVICE))
        .and_then(|h| h.pid)
    {
        kill_pid(pid);
    }
    for pid in listener_pids(port) {
        if pid_command(pid).contains("server/main.mjs") {
            kill_pid(pid);
        }
    }
    for _ in 0..20 {
        if !ping(port) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Jeton local d'accès éditeur hors projet — créé par le serveur galerie au
/// boot (~/.atelier-studio/gallery_token, 0600). L'app le lit et l'ajoute aux
/// URLs des onglets éditeur ; une page web locale ne peut pas lire ce fichier.
#[tauri::command]
pub fn gallery_token() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("no home")?;
    let file = home.join(".atelier-studio/gallery_token");
    let tok = std::fs::read_to_string(&file)
        .map_err(|e| format!("jeton galerie illisible ({}): {e}", file.display()))?;
    let tok = tok.trim().to_string();
    if tok.is_empty() {
        return Err("jeton galerie vide".into());
    }
    Ok(tok)
}

#[tauri::command]
pub fn start_atelier(
    app: tauri::AppHandle,
    root: String,
    gallery_dir: Option<String>,
    gallery_exts: Option<String>,
) -> Result<String, String> {
    let root_path = Path::new(&root);
    let port = project_port(root_path);

    let home = dirs::home_dir().ok_or("no home")?;
    let dir = gallery_dir
        .filter(|s| !s.trim().is_empty())
        .map(|s| {
            if let Some(stripped) = s.strip_prefix("~/") {
                home.join(stripped)
            } else {
                std::path::PathBuf::from(s)
            }
        })
        .unwrap_or_else(|| {
            // galerie VENDORISÉE : gallery/ du repo en dev, ressource bundlée en prod
            let dev = std::env::current_dir()
                .map(|d| d.join("../gallery"))
                .unwrap_or_default();
            let bundled = app
                .path()
                .resource_dir()
                .map(|r| r.join("gallery"))
                .unwrap_or_default();
            if dev.join("server/main.mjs").exists() || dev.join("cmux_gallery.py").exists() {
                dev
            } else if bundled.join("server/main.mjs").exists()
                || bundled.join("cmux_gallery.py").exists()
            {
                bundled
            } else {
                home.join("Documents/cmux-gallery") // legacy fallback
            }
        });

    // moteur PRINCIPAL : serveur Node (app autonome, zéro dépendance python3) ;
    // fallback python via ATELIER_GALLERY_ENGINE=python ou si server/main.mjs absent
    let node_server = dir.join("server/main.mjs");
    let force_python = std::env::var("ATELIER_GALLERY_ENGINE").is_ok_and(|v| v == "python");
    let use_node = node_server.exists() && !force_python;
    let bundle_hash = if use_node {
        Some(identity::dir_fingerprint(&dir)?)
    } else {
        None
    };

    if ping(port) {
        if let Some(expected_hash) = bundle_hash.as_deref() {
            match gallery_health(port) {
                Ok(health) => {
                    if gallery_mismatch(&health, root_path, expected_hash).is_none() {
                        return Ok(gallery_url(port));
                    }
                    stop_stale_gallery(port, Some(&health));
                }
                Err(_) => stop_stale_gallery(port, None),
            }
            if ping(port) {
                return Err(format!(
                    "serveur galerie périmé toujours vivant sur le port {port}"
                ));
            }
        } else {
            return Ok(gallery_url(port));
        }
    }

    if use_node {
        let node = crate::bin_resolver::node_bin()?;
        Command::new(node)
            .env("ATELIER_STUDIO", "1")
            .env("GALLERY_ROOT", &root)
            .env("GALLERY_EXTS", gallery_exts.as_deref().unwrap_or(""))
            .env("FIG_PORT", port.to_string())
            .env("ATELIER_APP_VERSION", identity::APP_VERSION)
            .env("ATELIER_BUNDLE_HASH", bundle_hash.as_deref().unwrap_or(""))
            .arg(&node_server)
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        let gallery = dir.join("cmux_gallery.py");
        if !gallery.exists() {
            return Err(format!(
                "ni server/main.mjs ni cmux_gallery.py dans {}",
                dir.display()
            ));
        }
        Command::new("python3")
            .env("ATELIER_STUDIO", "1") // serveur en mode Studio : aucun push cmux/muxy/orca
            .arg(gallery)
            .arg("run")
            .arg("--root")
            .arg(&root)
            .arg("--no-open")
            .arg("--port")
            .arg(port.to_string())
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    // le serveur se détache ; attendre qu'il réponde (build de la galerie inclus)
    let mut last_health = String::from("aucune réponse");
    for _ in 0..60 {
        if let Some(expected_hash) = bundle_hash.as_deref() {
            match gallery_health(port) {
                Ok(health) => {
                    if let Some(reason) = gallery_mismatch(&health, root_path, expected_hash) {
                        last_health = reason;
                    } else {
                        return Ok(gallery_url(port));
                    }
                }
                Err(e) => last_health = e,
            }
        } else if ping(port) {
            return Ok(gallery_url(port));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err(format!(
        "atelier ne répond pas avec la bonne identité sur le port {port}: {last_health}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn port_is_stable_and_in_range() {
        let p = project_port(Path::new("/tmp"));
        assert_eq!(p, project_port(Path::new("/tmp")));
        assert!((18790..=19789).contains(&p));
    }

    #[test]
    fn gallery_identity_rejects_wrong_bundle_hash() {
        let health = ProcessHealth {
            service: Some(identity::GALLERY_SERVICE.to_string()),
            project_root: Some("/tmp".to_string()),
            app_version: Some(identity::APP_VERSION.to_string()),
            bundle_hash: Some("old".to_string()),
            ..ProcessHealth::default()
        };
        assert!(gallery_mismatch(&health, Path::new("/tmp"), "new")
            .unwrap()
            .contains("bundleHash"));
    }

    #[test]
    fn gallery_identity_accepts_matching_health() {
        let health = ProcessHealth {
            service: Some(identity::GALLERY_SERVICE.to_string()),
            project_root: Some("/tmp".to_string()),
            app_version: Some(identity::APP_VERSION.to_string()),
            bundle_hash: Some("same".to_string()),
            ..ProcessHealth::default()
        };
        assert!(gallery_mismatch(&health, Path::new("/tmp"), "same").is_none());
    }
}

#[cfg(test)]
mod cross_tests {
    use super::*;
    #[test]
    fn port_matches_python_for_thesis_project() {
        let p = project_port(Path::new(
            "/Users/tofunori/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis",
        ));
        assert_eq!(p, 19000); // hash python 9000 + base Studio décalée (18790 vs 8790)
    }
}
