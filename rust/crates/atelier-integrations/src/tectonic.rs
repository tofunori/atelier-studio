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
