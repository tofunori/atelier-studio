use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

/// Même algo que cmux_gallery.py::project_port : md5 du realpath en grand
/// entier, mod 1000, + 8790 — port stable par projet (8790–9789).
pub fn project_port(root: &Path) -> u16 {
    let real: PathBuf = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let digest = md5::compute(real.to_string_lossy().as_bytes());
    let rem = digest.0.iter().fold(0u64, |acc, b| (acc * 256 + *b as u64) % 1000);
    8790 + rem as u16
}

fn ping(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    std::net::TcpStream::connect_timeout(&addr.parse().unwrap(), Duration::from_millis(500))
        .is_ok()
}

#[tauri::command]
pub fn start_atelier(root: String) -> Result<String, String> {
    let root_path = Path::new(&root);
    let port = project_port(root_path);
    if !ping(port) {
        let gallery = dirs::home_dir()
            .ok_or("no home")?
            .join("Documents/cmux-gallery/cmux_gallery.py");
        Command::new("python3")
            .arg(gallery)
            .arg("run")
            .arg("--root")
            .arg(&root)
            .arg("--no-open")
            .spawn()
            .map_err(|e| e.to_string())?;
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
        assert!((8790..=9789).contains(&p));
    }
}

#[cfg(test)]
mod cross_tests {
    use super::*;
    #[test]
    fn port_matches_python_for_thesis_project() {
        let p = project_port(Path::new(
            "/Users/tofunori/Documents/UTQR/Master/Albedo-Modis-Pipeline-Analysis"));
        assert_eq!(p, 9000); // valeur calculée par cmux_gallery.py::project_port
    }
}
