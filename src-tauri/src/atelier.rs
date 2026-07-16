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
        let cmd = pid_command(pid);
        if cmd.contains("server/main.mjs") || cmd.contains("atelier-gallery-server") {
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

/// Temporary selector (plan 033 Porte 2). Default = node. Remove after soak.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GalleryBackend {
    Node,
    Rust,
    Python,
}

fn gallery_backend_kind() -> GalleryBackend {
    // Défaut Rust (bascule 2026-07-16) — fallback soak : ATELIER_GALLERY_BACKEND=node
    match std::env::var("ATELIER_GALLERY_BACKEND")
        .or_else(|_| std::env::var("ATELIER_GALLERY_ENGINE"))
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "node" => GalleryBackend::Node,
        "python" => GalleryBackend::Python,
        _ => GalleryBackend::Rust,
    }
}

fn resolve_gallery_rust_bin(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(explicit) = std::env::var("ATELIER_GALLERY_SERVER") {
        let p = PathBuf::from(explicit);
        if p.is_file() {
            return Ok(p);
        }
        return Err(format!(
            "ATELIER_GALLERY_SERVER introuvable: {}",
            p.display()
        ));
    }
    let candidates = [
        std::env::current_dir()
            .ok()
            .map(|c| c.join("../rust/target/debug/atelier-gallery-server")),
        std::env::current_dir()
            .ok()
            .map(|c| c.join("../rust/target/release/atelier-gallery-server")),
        std::env::current_dir()
            .ok()
            .map(|c| c.join("rust/target/debug/atelier-gallery-server")),
        std::env::current_dir()
            .ok()
            .map(|c| c.join("rust/target/release/atelier-gallery-server")),
        dirs::home_dir().map(|h| {
            h.join("Documents/atelier-studio/rust/target/debug/atelier-gallery-server")
        }),
        dirs::home_dir().map(|h| {
            h.join("Documents/atelier-studio/rust/target/release/atelier-gallery-server")
        }),
    ];
    for c in candidates.into_iter().flatten() {
        if c.is_file() {
            return Ok(c);
        }
    }
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    // binaire stagé avec les autres serveurs Rust (scripts/stage-rust-server.sh)
    for candidate in [
        resource_dir.join("rust-server/atelier-gallery-server"),
        resource_dir.join("atelier-gallery-server"),
    ] {
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(
        "atelier-gallery-server introuvable (cargo build -p atelier-gallery --manifest-path rust/Cargo.toml)"
            .into(),
    )
}

fn file_fingerprint(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("hash {}: {e}", path.display()))?;
    Ok(format!("{:x}", md5::compute(bytes)))
}

fn resolve_assets_dir(gallery_dir: &Path) -> PathBuf {
    let assets = gallery_dir.join("assets");
    if assets.is_dir() {
        return assets;
    }
    gallery_dir.to_path_buf()
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

    // Backend: Node (défaut) | Rust (plan 033 Porte 2) | Python (legacy).
    // Sélecteurs: ATELIER_GALLERY_BACKEND=node|rust|python
    //             ATELIER_GALLERY_ENGINE=python (alias historique)
    let backend = gallery_backend_kind();
    let node_server = dir.join("server/main.mjs");
    let rust_bin = if backend == GalleryBackend::Rust {
        Some(resolve_gallery_rust_bin(&app)?)
    } else {
        None
    };

    let bundle_hash: Option<String> = match backend {
        GalleryBackend::Node if node_server.exists() => {
            Some(identity::dir_fingerprint(&dir)?)
        }
        GalleryBackend::Rust => {
            let bin = rust_bin.as_ref().ok_or("rust bin missing")?;
            Some(file_fingerprint(bin)?)
        }
        GalleryBackend::Python => None,
        GalleryBackend::Node => {
            // pas de main.mjs → bascule python si présent
            None
        }
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

    match backend {
        GalleryBackend::Rust => {
            let bin = rust_bin.ok_or("atelier-gallery-server introuvable")?;
            let assets = resolve_assets_dir(&dir);
            Command::new(&bin)
                .env("ATELIER_STUDIO", "1")
                .env("GALLERY_ROOT", &root)
                .env("GALLERY_EXTS", gallery_exts.as_deref().unwrap_or(""))
                .env("FIG_PORT", port.to_string())
                .env("ATELIER_APP_VERSION", identity::APP_VERSION)
                .env("ATELIER_BUNDLE_HASH", bundle_hash.as_deref().unwrap_or(""))
                .env("ATELIER_ASSETS_DIR", &assets)
                .arg("--root")
                .arg(&root)
                .arg("--port")
                .arg(port.to_string())
                .arg("--host")
                .arg("127.0.0.1")
                .spawn()
                .map_err(|e| format!("spawn atelier-gallery-server: {e}"))?;
        }
        GalleryBackend::Node if node_server.exists() => {
            let node = crate::bin_resolver::node_bin(&app)?;
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
        }
        GalleryBackend::Node | GalleryBackend::Python => {
            let gallery = dir.join("cmux_gallery.py");
            if !gallery.exists() {
                return Err(format!(
                    "ni server/main.mjs ni atelier-gallery-server ni cmux_gallery.py dans {}",
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
    }

    // le serveur se détache ; attendre qu'il réponde (build de la galerie inclus)
    // Rust initial build peut être long → budget un peu plus large.
    let attempts = if backend == GalleryBackend::Rust {
        120
    } else {
        60
    };
    let mut last_health = String::from("aucune réponse");
    for _ in 0..attempts {
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
