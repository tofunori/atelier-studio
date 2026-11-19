//! Projet d'exemple livré avec l'app (visite guidée, 2026-11-19).
//!
//! « Commencer » dans l'invitation de la visite crée — ou retrouve —
//! `~/Documents/Atelier/Glacier-Exemple` : un glacier fictif avec ses
//! données, une figure à annoter, un rapport Word avec une modification
//! suivie, un article LaTeX et un cahier. Les fichiers sont embarqués dans
//! le binaire ; un fichier déjà présent n'est JAMAIS réécrit, pour que les
//! essais de l'utilisateur survivent à une nouvelle visite. Même chemin sur
//! macOS et Linux.

use std::path::{Path, PathBuf};

/// Nom du dossier, aussi nom du projet dans la colonne.
pub const NAME: &str = "Glacier-Exemple";

const FILES: &[(&str, &[u8])] = &[
    (
        "LISEZMOI.md",
        include_bytes!("../assets/glacier-exemple/LISEZMOI.md"),
    ),
    (
        "analyse.ipynb",
        include_bytes!("../assets/glacier-exemple/analyse.ipynb"),
    ),
    (
        "donnees/bilan_masse_annuel.csv",
        include_bytes!("../assets/glacier-exemple/donnees/bilan_masse_annuel.csv"),
    ),
    (
        "scripts/trace_bilan.py",
        include_bytes!("../assets/glacier-exemple/scripts/trace_bilan.py"),
    ),
    (
        "figures/bilan_masse_annuel.png",
        include_bytes!("../assets/glacier-exemple/figures/bilan_masse_annuel.png"),
    ),
    (
        "documents/rapport.docx",
        include_bytes!("../assets/glacier-exemple/documents/rapport.docx"),
    ),
    (
        "documents/article.tex",
        include_bytes!("../assets/glacier-exemple/documents/article.tex"),
    ),
];

/// `~/Documents/Atelier/Glacier-Exemple`, le même sur les deux systèmes.
pub fn default_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").filter(|h| !h.is_empty())?;
    Some(
        PathBuf::from(home)
            .join("Documents")
            .join("Atelier")
            .join(NAME),
    )
}

/// Écrit les fichiers manquants sous `root` et renvoie son chemin. Ce qui
/// existe déjà est laissé tel quel.
pub fn ensure(root: &Path) -> Result<String, String> {
    for (rel, bytes) in FILES {
        let path = root.join(rel);
        if path.exists() {
            continue;
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Création du dossier impossible : {e}"))?;
        }
        std::fs::write(&path, bytes).map_err(|e| format!("Écriture impossible ({rel}) : {e}"))?;
    }
    Ok(root.to_string_lossy().into_owned())
}

/// Le projet d'exemple à son emplacement habituel.
pub fn create() -> Result<String, String> {
    let root = default_root().ok_or_else(|| "Dossier personnel introuvable".to_string())?;
    ensure(&root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_every_file_of_the_example() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join(NAME);
        let created = ensure(&root).unwrap();
        assert_eq!(created, root.to_string_lossy());
        for (rel, bytes) in FILES {
            assert_eq!(std::fs::read(root.join(rel)).unwrap(), *bytes, "{rel}");
        }
    }

    #[test]
    fn never_overwrites_what_the_user_changed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join(NAME);
        std::fs::create_dir_all(root.join("documents")).unwrap();
        std::fs::write(root.join("documents/article.tex"), "mon texte").unwrap();
        ensure(&root).unwrap();
        assert_eq!(
            std::fs::read_to_string(root.join("documents/article.tex")).unwrap(),
            "mon texte"
        );
        assert!(root.join("figures/bilan_masse_annuel.png").is_file());
    }

    #[test]
    fn a_removed_file_comes_back_on_the_next_tour() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join(NAME);
        ensure(&root).unwrap();
        std::fs::remove_file(root.join("analyse.ipynb")).unwrap();
        ensure(&root).unwrap();
        assert!(root.join("analyse.ipynb").is_file());
    }

    #[test]
    fn the_example_lives_in_documents() {
        let root = default_root().expect("HOME");
        assert!(root.ends_with("Documents/Atelier/Glacier-Exemple"));
    }
}
