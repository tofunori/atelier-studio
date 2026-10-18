//! Journal des cellules : un fichier JSONL par fil.
//!
//! Une ligne par cellule finie, ajoutée à la fin : code, sorties, erreur,
//! fichiers lus et écrits, env. C'est ce que montre le panneau « Cellules »
//! du fil, et la recette d'un fichier qu'une cellule a écrit (la cellule qui
//! l'a produit, avec son code exact et son env).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Au-delà, le fichier est réécrit avec ses dernières cellules seulement.
const FILE_MAX: u64 = 32 * 1024 * 1024;
const KEEP_AFTER_ROTATION: usize = 2000;
/// Ce qu'on garde des sorties dans le journal (la réponse à l'agent peut en
/// porter davantage).
pub const STORED_STREAM_MAX: usize = 64 * 1024;
const STORED_CODE_MAX: usize = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellRecord {
    /// Numéro de la cellule dans le fil, croissant, jamais réutilisé.
    pub id: u64,
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    pub started_at: String,
    #[serde(default)]
    pub duration_ms: u64,
    /// `ok` ou `error`.
    pub status: String,
    pub code: String,
    /// sha256 du code, pour relier un fichier produit à sa cellule exacte.
    pub code_sha256: String,
    #[serde(default)]
    pub stdout: String,
    #[serde(default)]
    pub stderr: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
    #[serde(default)]
    pub files_read: Vec<String>,
    #[serde(default)]
    pub files_written: Vec<String>,
    /// PNG des figures matplotlib captées à la fin de la cellule.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub figures: Vec<String>,
    /// Octets de sortie perdus aux plafonds.
    #[serde(default)]
    pub truncated: u64,
    pub env: String,
    pub python: String,
    pub python_version: String,
    pub cwd: String,
}

pub fn code_sha256(code: &str) -> String {
    hex::encode(Sha256::digest(code.as_bytes()))
}

pub fn clip(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut head = max / 2;
    while !text.is_char_boundary(head) {
        head -= 1;
    }
    let mut tail = text.len() - max / 2;
    while !text.is_char_boundary(tail) {
        tail += 1;
    }
    format!(
        "{}\n… ({} octets coupés) …\n{}",
        &text[..head],
        tail - head,
        &text[tail..]
    )
}

#[derive(Debug, Clone)]
pub struct CellJournal {
    dir: PathBuf,
}

impl CellJournal {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn path_for(&self, thread_id: &str) -> PathBuf {
        self.dir.join(format!("{}.jsonl", thread_key(thread_id)))
    }

    /// Ajoute un fichier aux écritures d'une cellule déjà journalisée (une
    /// figure copiée dans le projet depuis le panneau) : la copie garde ainsi
    /// sa recette. La cellule est réécrite en fin de journal ; `list` et `get`
    /// ne gardent que sa dernière version.
    pub fn add_written(&self, thread_id: &str, id: u64, file: &str) -> std::io::Result<bool> {
        let Some(mut record) = self.get(thread_id, id) else {
            return Ok(false);
        };
        if !record.files_written.iter().any(|w| w == file) {
            record.files_written.push(file.to_string());
            record.files_written.sort();
            self.append(&record)?;
        }
        Ok(true)
    }

    pub fn append(&self, record: &CellRecord) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let path = self.path_for(&record.thread_id);
        let mut stored = record.clone();
        stored.code = clip(&stored.code, STORED_CODE_MAX);
        stored.stdout = clip(&stored.stdout, STORED_STREAM_MAX);
        stored.stderr = clip(&stored.stderr, STORED_STREAM_MAX);
        let mut line = Vec::new();
        // Une ligne laissée à moitié par un arrêt brutal ne doit pas avaler
        // la suivante : on repart sur une ligne neuve.
        if ends_mid_line(&path) {
            line.push(b'\n');
        }
        line.extend(serde_json::to_vec(&stored)?);
        line.push(b'\n');
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        f.write_all(&line)?;
        f.sync_data()?;
        drop(f);
        if std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > FILE_MAX {
            self.rotate(&path)?;
        }
        Ok(())
    }

    fn rotate(&self, path: &Path) -> std::io::Result<()> {
        let all = read_records(path);
        let keep = &all[all.len().saturating_sub(KEEP_AFTER_ROTATION)..];
        let mut buf = Vec::new();
        for r in keep {
            buf.extend(serde_json::to_vec(r)?);
            buf.push(b'\n');
        }
        let tmp = path.with_extension("jsonl.tmp");
        std::fs::write(&tmp, buf)?;
        std::fs::rename(tmp, path)
    }

    /// Les `limit` dernières cellules du fil, de la plus ancienne à la plus récente.
    pub fn list(&self, thread_id: &str, limit: usize) -> Vec<CellRecord> {
        let all = latest(read_records(&self.path_for(thread_id)));
        all[all.len().saturating_sub(limit)..].to_vec()
    }

    pub fn get(&self, thread_id: &str, id: u64) -> Option<CellRecord> {
        read_records(&self.path_for(thread_id))
            .into_iter()
            .rev()
            .find(|r| r.id == id)
    }

    pub fn last_id(&self, thread_id: &str) -> u64 {
        read_records(&self.path_for(thread_id))
            .iter()
            .map(|r| r.id)
            .max()
            .unwrap_or(0)
    }

    /// Cellules qui ont écrit ce fichier, la plus récente en dernier : la
    /// recette d'un fichier produit dans le noyau.
    pub fn writers_of(&self, thread_id: &str, file: &str) -> Vec<CellRecord> {
        latest(read_records(&self.path_for(thread_id)))
            .into_iter()
            .filter(|r| r.files_written.iter().any(|w| w == file))
            .collect()
    }

    pub fn delete_thread(&self, thread_id: &str) {
        let _ = std::fs::remove_file(self.path_for(thread_id));
    }
}

fn ends_mid_line(path: &Path) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(path) else {
        return false;
    };
    let mut last = [0u8; 1];
    f.seek(SeekFrom::End(-1)).is_ok() && f.read_exact(&mut last).is_ok() && last[0] != b'\n'
}

/// Clé de fichier d'un fil : sha256 tronqué, pour ne pas mettre son id brut
/// dans un nom de fichier.
pub fn thread_key(thread_id: &str) -> String {
    let h = Sha256::digest(thread_id.as_bytes());
    hex::encode(&h[..16])
}

/// Une cellule réécrite (voir `add_written`) remplace sa version précédente,
/// à la place de celle-ci.
fn latest(records: Vec<CellRecord>) -> Vec<CellRecord> {
    let mut out: Vec<CellRecord> = Vec::with_capacity(records.len());
    let mut index = std::collections::HashMap::new();
    for r in records {
        match index.get(&r.id) {
            Some(&i) => out[i] = r,
            None => {
                index.insert(r.id, out.len());
                out.push(r);
            }
        }
    }
    out
}

fn read_records(path: &Path) -> Vec<CellRecord> {
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    // Une ligne abîmée (arrêt brutal en pleine écriture) est sautée, pas
    // fatale : le reste du journal reste lisible.
    text.lines()
        .filter_map(|l| serde_json::from_str::<CellRecord>(l).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn record(thread: &str, id: u64, written: &[&str]) -> CellRecord {
        CellRecord {
            id,
            thread_id: thread.into(),
            turn_id: None,
            started_at: "2026-10-18T00:00:00.000Z".into(),
            duration_ms: 3,
            status: "ok".into(),
            code: format!("x = {id}"),
            code_sha256: code_sha256(&format!("x = {id}")),
            stdout: String::new(),
            stderr: String::new(),
            result: None,
            error: None,
            files_read: vec![],
            files_written: written.iter().map(|s| s.to_string()).collect(),
            figures: vec![],
            truncated: 0,
            env: "base".into(),
            python: "/usr/bin/python3".into(),
            python_version: "3.12.0".into(),
            cwd: "/tmp".into(),
        }
    }

    #[test]
    fn ajoute_relit_et_trouve_l_auteur_d_un_fichier() {
        let dir = tempfile::tempdir().unwrap();
        let j = CellJournal::new(dir.path());
        j.append(&record("t1", 1, &[])).unwrap();
        j.append(&record("t1", 2, &["/p/fig.png"])).unwrap();
        j.append(&record("t2", 1, &[])).unwrap();
        assert_eq!(j.list("t1", 10).len(), 2);
        assert_eq!(j.last_id("t1"), 2);
        assert_eq!(j.get("t1", 2).unwrap().files_written, vec!["/p/fig.png"]);
        assert_eq!(j.writers_of("t1", "/p/fig.png")[0].id, 2);
        assert_eq!(j.list("t1", 1)[0].id, 2, "limit garde les plus récentes");
        j.delete_thread("t1");
        assert!(j.list("t1", 10).is_empty());
        assert_eq!(j.list("t2", 10).len(), 1);
    }

    #[test]
    fn une_ligne_abimee_n_empeche_pas_de_lire_les_autres() {
        let dir = tempfile::tempdir().unwrap();
        let j = CellJournal::new(dir.path());
        j.append(&record("t", 1, &[])).unwrap();
        let mut f = std::fs::OpenOptions::new()
            .append(true)
            .open(j.path_for("t"))
            .unwrap();
        f.write_all(b"{\"id\": 2, \"trunc").unwrap();
        drop(f);
        j.append(&record("t", 3, &[])).unwrap();
        let ids: Vec<u64> = j.list("t", 10).iter().map(|r| r.id).collect();
        assert_eq!(ids, vec![1, 3]);
    }

    #[test]
    fn clip_garde_le_debut_et_la_fin() {
        let t = format!("{}{}", "a".repeat(100), "b".repeat(100));
        let c = clip(&t, 20);
        assert!(c.starts_with("aaaaaaaaaa") && c.ends_with("bbbbbbbbbb"));
        assert!(c.contains("octets coupés"));
    }
}
