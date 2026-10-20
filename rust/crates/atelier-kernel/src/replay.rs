//! « Rejouer à neuf » : les cellules réussies d'une session, repassées dans
//! un noyau vierge, sorties et fichiers comparés à l'original.
//!
//! Les fichiers que les cellules écrivent sont mis de côté avant le rejeu et
//! remis en place après : rejouer ne change rien au projet, même quand le
//! rejeu donne autre chose.

use crate::journal::CellRecord;
use crate::kernel::CellProgress;
use crate::prints::sha256_file;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Au-delà, le rejeu refuse de partir plutôt que de copier des gigaoctets.
pub const BACKUP_MAX_BYTES: u64 = 2 << 30;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaySummary {
    pub total: usize,
    pub same: usize,
    /// Sortie identique, mais un fichier écrit diffère (souvent une date
    /// interne de PDF).
    pub files: usize,
    pub differs: usize,
    pub error: usize,
    pub skipped: usize,
    /// Le noyau rejoué est devenu le noyau du fil (aucun ne tournait).
    pub adopted: bool,
    pub cancelled: bool,
}

/// Sortie comparable : adresses mémoire et blancs de fin effacés.
pub fn normalize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for line in text.lines() {
        let mut rest = line.trim_end();
        while let Some(pos) = rest.find("0x") {
            out.push_str(&rest[..pos]);
            let tail = &rest[pos + 2..];
            let hex = tail.find(|c: char| !c.is_ascii_hexdigit()).unwrap_or(tail.len());
            if hex >= 6 {
                out.push_str("0x…");
            } else {
                out.push_str(&rest[pos..pos + 2 + hex]);
            }
            rest = &tail[hex..];
        }
        out.push_str(rest);
        out.push('\n');
    }
    out.trim_end().to_string()
}

fn visible(stdout: &str, result: Option<&str>) -> String {
    let mut text = stdout.to_string();
    if let Some(r) = result {
        text.push('\n');
        text.push_str(r);
    }
    normalize(&text)
}

fn quote(line: &str) -> String {
    let line: String = line.trim().chars().take(80).collect();
    format!("« {line} »")
}

/// Verdict d'une cellule rejouée : statut et détail lisible.
pub fn compare(original: &CellRecord, replay: &CellProgress) -> (&'static str, Option<String>) {
    if let Some(error) = &replay.error {
        let name = error["ename"].as_str().unwrap_or("Erreur");
        let value = error["evalue"].as_str().unwrap_or("");
        return ("error", Some(format!("{name} : {}", value.chars().take(160).collect::<String>())));
    }
    let before = visible(&original.stdout, original.result.as_deref());
    let after = visible(&replay.stdout, replay.result.as_deref());
    if before != after {
        let (a, b): (Vec<&str>, Vec<&str>) = (before.lines().collect(), after.lines().collect());
        let at = a.iter().zip(b.iter()).position(|(x, y)| x != y).unwrap_or(a.len().min(b.len()));
        let detail = format!(
            "ligne {} : attendu {}, obtenu {}",
            at + 1,
            a.get(at).map(|l| quote(l)).unwrap_or_else(|| "rien".into()),
            b.get(at).map(|l| quote(l)).unwrap_or_else(|| "rien".into()),
        );
        return ("differs", Some(detail));
    }
    // Fichiers : l'empreinte prise à la fin de la cellule d'origine contre
    // celle du fichier réécrit par le rejeu.
    let changed: Vec<String> = original
        .prints
        .iter()
        .filter(|p| original.files_written.contains(&p.path))
        .filter_map(|p| {
            let old = p.sha256.as_ref()?;
            let now = sha256_file(Path::new(&p.path));
            (now.as_ref() != Some(old)).then(|| file_name(&p.path))
        })
        .collect();
    if changed.is_empty() {
        ("same", None)
    } else {
        ("files", Some(format!("fichier différent : {}", changed.join(", "))))
    }
}

fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// Fichiers mis de côté avant le rejeu ; `restore` les remet tels quels et
/// retire ceux que le rejeu a créés.
pub struct Backup {
    dir: PathBuf,
    saved: Vec<(PathBuf, Option<PathBuf>)>,
}

impl Backup {
    pub fn take(dir: &Path, cells: &[CellRecord]) -> Result<Backup, String> {
        let mut files: Vec<PathBuf> = cells
            .iter()
            .flat_map(|c| c.files_written.iter().map(PathBuf::from))
            .collect();
        files.sort();
        files.dedup();
        let total: u64 = files
            .iter()
            .filter_map(|f| std::fs::metadata(f).ok())
            .map(|m| m.len())
            .sum();
        if total > BACKUP_MAX_BYTES {
            return Err(format!(
                "les cellules écrivent {} Mo de fichiers : trop pour les mettre de côté pendant le rejeu",
                total >> 20
            ));
        }
        let _ = std::fs::remove_dir_all(dir);
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let mut saved = Vec::new();
        for (i, file) in files.into_iter().enumerate() {
            if file.is_file() {
                let copy = dir.join(i.to_string());
                std::fs::copy(&file, &copy).map_err(|e| format!("{} : {e}", file.display()))?;
                saved.push((file, Some(copy)));
            } else {
                saved.push((file, None));
            }
        }
        Ok(Backup { dir: dir.to_path_buf(), saved })
    }

    pub fn restore(self) {
        for (file, copy) in &self.saved {
            match copy {
                Some(copy) => {
                    let _ = std::fs::copy(copy, file);
                }
                None => {
                    let _ = std::fs::remove_file(file);
                }
            }
        }
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prints::FilePrint;

    #[test]
    fn adresses_memoire_et_blancs_ne_comptent_pas() {
        assert_eq!(
            normalize("<Figure at 0x7f3a2b1c0d10>  \nok"),
            normalize("<Figure at 0x10a3f4e5b6c7>\nok")
        );
        assert_ne!(normalize("0x10"), normalize("0x11"));
    }

    #[test]
    fn verdicts_sortie_et_fichiers() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("out.csv");
        std::fs::write(&f, "1").unwrap();
        let original = CellRecord {
            stdout: "r = 0.61\n".into(),
            files_written: vec![f.display().to_string()],
            prints: vec![FilePrint {
                path: f.display().to_string(),
                size: 1,
                mtime_ms: 0,
                sha256: sha256_file(&f),
            }],
            ..Default::default()
        };
        let mut replay = CellProgress { stdout: "r = 0.61\n".into(), ..Default::default() };
        assert_eq!(compare(&original, &replay).0, "same");
        std::fs::write(&f, "2").unwrap();
        assert_eq!(compare(&original, &replay).0, "files");
        replay.stdout = "r = 0.64\n".into();
        let (status, detail) = compare(&original, &replay);
        assert_eq!(status, "differs");
        assert!(detail.unwrap().contains("« r = 0.64 »"));
    }

    #[test]
    fn la_sauvegarde_remet_les_fichiers_et_retire_les_nouveaux() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.png");
        let b = dir.path().join("b.png");
        std::fs::write(&a, "original").unwrap();
        let cells = vec![CellRecord {
            files_written: vec![a.display().to_string(), b.display().to_string()],
            ..Default::default()
        }];
        let backup = Backup::take(&dir.path().join("bak"), &cells).unwrap();
        std::fs::write(&a, "rejoué").unwrap();
        std::fs::write(&b, "nouveau").unwrap();
        backup.restore();
        assert_eq!(std::fs::read_to_string(&a).unwrap(), "original");
        assert!(!b.exists());
    }
}
