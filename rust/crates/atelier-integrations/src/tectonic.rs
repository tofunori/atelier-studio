//! tectonic téléchargé par Atelier au premier « Compiler » (sans MacTeX ni
//! Homebrew) : une version épinglée, rangée dans le dossier de l'app. Le
//! serveur galerie l'y installe ; Réglages > Environnement l'y cherche.

use std::path::{Path, PathBuf};

pub const VERSION: &str = "0.17.0";

/// `<dossier de l'app>/tools/tectonic-<VERSION>/tectonic`.
pub fn installed_path(app_dir: &Path) -> PathBuf {
    app_dir
        .join("tools")
        .join(format!("tectonic-{VERSION}"))
        .join("tectonic")
}

/// Dossiers `bin` d'une TeX Live déjà installée hors du PATH de l'app :
/// MacTeX (`/Library/TeX/texbin`), puis l'installeur officiel de TeX Live
/// sous Linux (`/usr/local/texlive/<année>/bin/<arch>`, ou `~/texlive/…`
/// installé sans sudo), l'année la plus récente d'abord. Une app lancée
/// depuis le Dock ou le menu des applications n'a pas le PATH réglé dans
/// `.bashrc` ou `.zshrc` : sans eux, cette TeX Live passerait inaperçue.
pub fn tex_bin_dirs(home: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = vec![PathBuf::from("/Library/TeX/texbin")];
    let roots = [Some(PathBuf::from("/usr/local/texlive")), home.map(|h| h.join("texlive"))];
    for root in roots.into_iter().flatten() {
        let Ok(entries) = std::fs::read_dir(&root) else { continue };
        let mut years: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.len() == 4 && n.chars().all(|c| c.is_ascii_digit()))
            })
            .collect();
        years.sort();
        for year in years.into_iter().rev() {
            let Ok(arches) = std::fs::read_dir(year.join("bin")) else { continue };
            let mut arches: Vec<PathBuf> = arches.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
            arches.sort();
            dirs.extend(arches);
        }
    }
    dirs
}

#[cfg(test)]
mod tex_dirs_tests {
    use super::*;

    #[test]
    fn la_tex_live_installee_a_la_main_est_trouvee_la_plus_recente_d_abord() {
        let home = tempfile::tempdir().unwrap();
        for year in ["2024", "2025"] {
            std::fs::create_dir_all(home.path().join(format!("texlive/{year}/bin/x86_64-linux"))).unwrap();
        }
        std::fs::create_dir_all(home.path().join("texlive/texmf-local")).unwrap();
        let dirs = tex_bin_dirs(Some(home.path()));
        assert_eq!(dirs[0], PathBuf::from("/Library/TeX/texbin"));
        let mine: Vec<_> = dirs.iter().filter(|d| d.starts_with(home.path())).collect();
        assert_eq!(
            mine,
            [
                &home.path().join("texlive/2025/bin/x86_64-linux"),
                &home.path().join("texlive/2024/bin/x86_64-linux")
            ]
        );
    }
}
