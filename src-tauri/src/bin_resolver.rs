// Résolution robuste des binaires externes (node…) : l'app lancée depuis le
// Finder n'hérite pas du PATH du shell. `fix_path_env::fix()` (lib.rs) répare
// le PATH au démarrage via le login shell ; ce module ajoute un filet :
// balayage du PATH courant puis des emplacements standards macOS.
use std::path::{Path, PathBuf};
use tauri::Manager;

fn standard_dirs() -> Vec<PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from(format!("{home}/.local/bin")),
        PathBuf::from(format!("{home}/.volta/bin")),
    ];
    // nvm : prendre la version la plus récente installée
    if let Ok(entries) = std::fs::read_dir(format!("{home}/.nvm/versions/node")) {
        let mut versions: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path().join("bin"))
            .filter(|p| p.is_dir())
            .collect();
        versions.sort();
        if let Some(latest) = versions.pop() {
            dirs.push(latest);
        }
    }
    dirs
}

fn is_executable(p: &PathBuf) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return std::fs::metadata(p)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false);
    }
    #[allow(unreachable_code)]
    p.is_file()
}

/// Chemin absolu du binaire, ou None s'il est introuvable partout.
pub fn resolve_bin(name: &str) -> Option<PathBuf> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(name);
            if is_executable(&candidate) {
                return Some(candidate);
            }
        }
    }
    standard_dirs()
        .into_iter()
        .map(|d| d.join(name))
        .find(is_executable)
}

fn embedded_node(resource_dir: &Path) -> Option<PathBuf> {
    let candidate = resource_dir.join("node-runtime/bin/node");
    is_executable(&candidate).then_some(candidate)
}

fn choose_node(
    resource_dir: Option<&Path>,
    system_node: Option<PathBuf>,
    allow_system_fallback: bool,
) -> Option<PathBuf> {
    resource_dir.and_then(embedded_node).or_else(|| {
        if allow_system_fallback {
            system_node
        } else {
            None
        }
    })
}

/// Commande Node prête à spawner. Le runtime du bundle est toujours prioritaire;
/// le PATH système ne sert que de secours pour `npm run tauri dev`.
pub fn node_bin(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app.path().resource_dir().ok();
    let allow_system_fallback = cfg!(debug_assertions);
    choose_node(
        resource_dir.as_deref(),
        allow_system_fallback.then(|| resolve_bin("node")).flatten(),
        allow_system_fallback,
    )
    .ok_or_else(|| {
        if allow_system_fallback {
            "runtime Node embarqué introuvable et aucun Node système disponible — installe Node.js pour le développement".to_string()
        } else {
            "runtime Node embarqué introuvable — l'installation Atelier est incomplète ou endommagée; réinstalle l'application".to_string()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn executable(path: &Path) {
        std::fs::write(path, b"node").unwrap();
        let mut permissions = std::fs::metadata(path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(path, permissions).unwrap();
    }

    #[test]
    fn embedded_node_wins_over_system_node() {
        let temp = tempfile::tempdir().unwrap();
        let embedded = temp.path().join("node-runtime/bin/node");
        std::fs::create_dir_all(embedded.parent().unwrap()).unwrap();
        executable(&embedded);
        let system = PathBuf::from("/usr/local/bin/node");

        assert_eq!(
            choose_node(Some(temp.path()), Some(system), true),
            Some(embedded)
        );
    }

    #[test]
    fn system_node_is_development_fallback() {
        let temp = tempfile::tempdir().unwrap();
        let system = PathBuf::from("/usr/local/bin/node");
        assert_eq!(
            choose_node(Some(temp.path()), Some(system.clone()), true),
            Some(system)
        );
    }

    #[test]
    fn missing_nodes_are_reported() {
        let temp = tempfile::tempdir().unwrap();
        assert_eq!(choose_node(Some(temp.path()), None, true), None);
    }

    #[test]
    fn release_mode_fails_closed_without_embedded_node() {
        let temp = tempfile::tempdir().unwrap();
        let system = PathBuf::from("/usr/local/bin/node");
        assert_eq!(choose_node(Some(temp.path()), Some(system), false), None);
    }
}
