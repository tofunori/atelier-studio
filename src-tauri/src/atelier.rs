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

#[tauri::command]
pub fn start_atelier(app: tauri::AppHandle, root: String, gallery_dir: Option<String>) -> Result<String, String> {
    let root_path = Path::new(&root);
    let port = project_port(root_path);
    if !ping(port) {
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
                } else if bundled.join("server/main.mjs").exists() || bundled.join("cmux_gallery.py").exists() {
                    bundled
                } else {
                    home.join("Documents/cmux-gallery") // legacy fallback
                }
            });
        // moteur PRINCIPAL : serveur Node (app autonome, zéro dépendance python3) ;
        // fallback python via ATELIER_GALLERY_ENGINE=python ou si server/main.mjs absent
        let node_server = dir.join("server/main.mjs");
        let force_python = std::env::var("ATELIER_GALLERY_ENGINE").is_ok_and(|v| v == "python");
        if node_server.exists() && !force_python {
            Command::new("node")
                .env("ATELIER_STUDIO", "1")
                .env("GALLERY_ROOT", &root)
                .env("FIG_PORT", port.to_string())
                .arg(&node_server)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            let gallery = dir.join("cmux_gallery.py");
            if !gallery.exists() {
                return Err(format!("ni server/main.mjs ni cmux_gallery.py dans {}", dir.display()));
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
        for _ in 0..60 {
            if ping(port) {
                break;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        if !ping(port) {
            return Err(format!("atelier ne répond pas sur le port {port}"));
        }
    }
    Ok(format!("http://127.0.0.1:{port}/figures_index.html"))
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
