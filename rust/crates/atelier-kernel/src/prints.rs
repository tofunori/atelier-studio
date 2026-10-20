//! Empreintes des fichiers lus et écrits par une cellule.
//!
//! Une cellule qui a lu `panel.parquet` garde sa taille, sa date et son
//! sha256 : on peut dire plus tard si la donnée a changé depuis. Le sha est
//! mis en cache par (chemin, taille, date) : relire dix fois le même parquet
//! ne le rehache pas dix fois.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::SystemTime;

/// Au-delà (gros NetCDF du NAS), taille et date seulement.
const HASH_FILE_MAX_BYTES: u64 = 256 << 20;
/// Budget de hachage d'une cellule : une cellule qui lit 300 fichiers ne
/// retarde pas sa réponse de plusieurs minutes.
pub const HASH_CELL_BUDGET_BYTES: u64 = 1 << 30;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePrint {
    pub path: String,
    pub size: u64,
    /// Date de modification, en millisecondes depuis l'époque Unix.
    pub mtime_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
}

/// État actuel d'un fichier lu par une cellule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Staleness {
    pub path: String,
    /// `same`, `modified` ou `missing`.
    pub state: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime_ms: Option<u64>,
}

fn mtime_ms(t: SystemTime) -> u64 {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn sha256_file(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(hex::encode(hasher.finalize()))
}

#[derive(Default)]
pub struct PrintCache {
    known: Mutex<HashMap<PathBuf, (u64, u64, String)>>,
}

impl PrintCache {
    /// Empreinte d'un fichier ; `budget` est décompté des octets hachés.
    pub fn print(&self, path: &Path, budget: &mut u64) -> Option<FilePrint> {
        let meta = std::fs::metadata(path).ok().filter(|m| m.is_file())?;
        let size = meta.len();
        let mtime = meta.modified().map(mtime_ms).unwrap_or(0);
        let cached = self
            .known
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(path)
            .filter(|(s, m, _)| *s == size && *m == mtime)
            .map(|(_, _, sha)| sha.clone());
        let sha256 = cached.or_else(|| {
            if size > HASH_FILE_MAX_BYTES || size > *budget {
                return None;
            }
            let sha = sha256_file(path)?;
            *budget -= size;
            self.known
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(path.to_path_buf(), (size, mtime, sha.clone()));
            Some(sha)
        });
        Some(FilePrint {
            path: path.display().to_string(),
            size,
            mtime_ms: mtime,
            sha256,
        })
    }

    /// Le fichier a-t-il changé depuis l'empreinte ? Une date différente à
    /// taille égale est confirmée par le sha (une copie à l'identique ne
    /// rend pas une cellule périmée).
    pub fn staleness(&self, print: &FilePrint) -> Staleness {
        let path = Path::new(&print.path);
        let Ok(meta) = std::fs::metadata(path) else {
            return Staleness {
                path: print.path.clone(),
                state: "missing",
                mtime_ms: None,
            };
        };
        let mtime = meta.modified().map(mtime_ms).unwrap_or(0);
        let mut state = "same";
        if meta.len() != print.size {
            state = "modified";
        } else if mtime != print.mtime_ms {
            state = match &print.sha256 {
                Some(old) => {
                    let mut budget = HASH_FILE_MAX_BYTES;
                    match self.print(path, &mut budget).and_then(|p| p.sha256) {
                        Some(now) if &now == old => "same",
                        _ => "modified",
                    }
                }
                None => "modified",
            };
        }
        Staleness {
            path: print.path.clone(),
            state,
            mtime_ms: Some(mtime),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn empreinte_puis_fichier_modifie_ou_retouche_a_l_identique() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("panel.csv");
        std::fs::write(&f, "a,b\n1,2\n").unwrap();
        let cache = PrintCache::default();
        let mut budget = HASH_CELL_BUDGET_BYTES;
        let p = cache.print(&f, &mut budget).unwrap();
        assert_eq!(p.size, 8);
        assert_eq!(p.sha256.as_deref(), sha256_file(&f).as_deref());
        assert_eq!(cache.staleness(&p).state, "same");

        // Même contenu, date neuve : toujours « same ».
        let later = SystemTime::now() + Duration::from_secs(5);
        std::fs::File::options().write(true).open(&f).unwrap().set_modified(later).unwrap();
        assert_eq!(cache.staleness(&p).state, "same");

        std::fs::write(&f, "a,b\n1,3\n").unwrap();
        std::fs::File::options().write(true).open(&f).unwrap().set_modified(later + Duration::from_secs(5)).unwrap();
        assert_eq!(cache.staleness(&p).state, "modified");
        std::fs::remove_file(&f).unwrap();
        assert_eq!(cache.staleness(&p).state, "missing");
    }

    #[test]
    fn budget_epuise_garde_taille_et_date() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("gros.nc");
        std::fs::write(&f, vec![0u8; 100]).unwrap();
        let mut budget = 10;
        let p = PrintCache::default().print(&f, &mut budget).unwrap();
        assert!(p.sha256.is_none());
        assert_eq!(p.size, 100);
    }
}
