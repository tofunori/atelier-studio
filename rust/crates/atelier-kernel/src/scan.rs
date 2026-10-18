//! Fichiers écrits pendant une cellule, vus par leur date de modification.
//!
//! Le crochet d'audit du pilote ne voit pas les bibliothèques qui écrivent en
//! C (netCDF4, GDAL, pyarrow). Après chaque cellule, on parcourt donc le
//! dossier de travail à la recherche des fichiers modifiés depuis son début.
//! Le parcours est borné (entrées et durée) : sur un dossier énorme, on rend
//! ce qu'on a vu plutôt que de bloquer la réponse à l'agent.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime};

const MAX_ENTRIES: usize = 40_000;
const MAX_TIME: Duration = Duration::from_millis(1500);
const MAX_DEPTH: usize = 10;
const MAX_FOUND: usize = 200;

pub fn written_since(root: &Path, since: SystemTime) -> Vec<PathBuf> {
    let deadline = Instant::now() + MAX_TIME;
    // Une seconde de marge : certains systèmes de fichiers (NAS, FAT)
    // arrondissent les dates.
    let since = since
        .checked_sub(Duration::from_secs(1))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let mut found = Vec::new();
    let mut seen = 0usize;
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    'parcours: while let Some((dir, depth)) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in rd.flatten() {
            seen += 1;
            if seen > MAX_ENTRIES || Instant::now() > deadline || found.len() >= MAX_FOUND {
                break 'parcours;
            }
            let Ok(ft) = entry.file_type() else {
                continue;
            };
            if ft.is_symlink() {
                continue;
            }
            let path = entry.path();
            if ft.is_dir() {
                if depth < MAX_DEPTH && !atelier_core::is_excluded_dir_path(&path) {
                    stack.push((path, depth + 1));
                }
                continue;
            }
            let modified = entry.metadata().and_then(|m| m.modified());
            if matches!(modified, Ok(t) if t >= since) {
                found.push(path);
            }
        }
    }
    found.sort();
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trouve_le_fichier_ecrit_apres_le_debut_et_ignore_les_caches() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("ancien.csv"), "a").unwrap();
        let old = SystemTime::now() - Duration::from_secs(3600);
        let f = std::fs::File::options()
            .write(true)
            .open(dir.path().join("ancien.csv"))
            .unwrap();
        f.set_modified(old).unwrap();
        let debut = SystemTime::now();
        std::fs::create_dir_all(dir.path().join("sorties")).unwrap();
        std::fs::write(dir.path().join("sorties/fig.png"), "x").unwrap();
        std::fs::create_dir_all(dir.path().join("__pycache__")).unwrap();
        std::fs::write(dir.path().join("__pycache__/m.pyc"), "x").unwrap();
        let found = written_since(dir.path(), debut);
        assert_eq!(found, vec![dir.path().join("sorties/fig.png")]);
    }
}
