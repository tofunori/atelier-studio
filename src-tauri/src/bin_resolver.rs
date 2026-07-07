// Résolution robuste des binaires externes (node…) : l'app lancée depuis le
// Finder n'hérite pas du PATH du shell. `fix_path_env::fix()` (lib.rs) répare
// le PATH au démarrage via le login shell ; ce module ajoute un filet :
// balayage du PATH courant puis des emplacements standards macOS.
use std::path::PathBuf;

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

/// Commande node prête à spawner, ou une erreur explicite à afficher dans l'UI.
pub fn node_bin() -> Result<PathBuf, String> {
    resolve_bin("node").ok_or_else(|| {
        "node introuvable — installe Node.js (https://nodejs.org ou `brew install node`) puis relance l'app".to_string()
    })
}
