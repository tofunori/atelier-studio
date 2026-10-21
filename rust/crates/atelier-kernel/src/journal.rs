//! Journal des cellules : un fichier JSONL par fil.
//!
//! Une ligne par cellule finie, ajoutée à la fin : code, sorties, erreur,
//! fichiers lus et écrits, env. C'est ce que montre le panneau « Cellules »
//! du fil, et la recette d'un fichier qu'une cellule a écrit (la cellule qui
//! l'a produit, avec son code exact et son env).

use crate::prints::FilePrint;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Au-delà, le fichier est archivé (renommé, jamais effacé) et le journal
/// repart de ses dernières cellules.
const FILE_MAX: u64 = 32 * 1024 * 1024;
const KEEP_AFTER_ROTATION: usize = 2000;
/// Ce qu'on garde des sorties dans le journal (la réponse à l'agent peut en
/// porter davantage).
pub const STORED_STREAM_MAX: usize = 64 * 1024;
const STORED_CODE_MAX: usize = 256 * 1024;

/// Variables touchées par une cellule, vues par le pilote (espace de noms
/// avant et après, plus l'arbre du code).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lineage {
    /// Noms (ré)assignés : un nouvel objet derrière le nom.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub created: Vec<String>,
    /// Même objet, modifié en place (`d["x"] = …`, `l.append`, forme changée).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub modified: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deleted: Vec<String>,
    /// Variables existantes lues par la cellule, avec la cellule qui les a
    /// créées ou modifiées en dernier.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub uses: Vec<VarUse>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VarUse {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cell: Option<u64>,
}

/// Résultat du dernier « Rejouer à neuf » qui a repassé la cellule.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayMark {
    pub at: String,
    /// `same`, `differs`, `error` ou `skipped`.
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Origine d'une cellule reprise d'un autre fil du même projet : le fil (et
/// son titre au moment de la reprise) et le numéro de la cellule là-bas.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumedFrom {
    pub thread_id: String,
    #[serde(default)]
    pub title: String,
    pub cell: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
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
    /// Phrase de but écrite par l'agent (reprise de l'originale pour une
    /// cellule modifiée à la main).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub purpose: Option<String>,
    /// `user` pour une cellule relancée à la main depuis le panneau ; absent
    /// pour l'agent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    /// Cellule d'origine d'une cellule modifiée à la main.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_cell: Option<u64>,
    /// Cellule reprise d'un autre fil du même projet.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resumed_from: Option<ResumedFrom>,
    /// Début de la demande du tour qui a lancé la cellule.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_prompt: Option<String>,
    /// Démarrage du noyau qui a exécuté la cellule : les cellules d'une même
    /// session partagent leurs variables.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    /// Empreintes des fichiers lus et écrits, prises à la fin de la cellule.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub prints: Vec<FilePrint>,
    /// Modules tiers chargés dans le noyau à la fin de la cellule.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub imports: Vec<String>,
    /// Instantané de l'env (`kernel/envs/<sha>.json`) : versions de tous
    /// les paquets au démarrage du noyau.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env_sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lineage: Option<Lineage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replay: Option<ReplayMark>,
    /// sha256 de la ligne précédente du journal : une ligne retouchée ou
    /// retirée après coup casse la chaîne.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prev_sha256: Option<String>,
}

/// État de la chaîne d'empreintes d'un journal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChainCheck {
    /// Lignes chaînées vérifiées.
    pub checked: usize,
    /// Première cellule dont la ligne ne suit pas la précédente.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broken_at: Option<u64>,
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
    /// sha256 de la dernière ligne de chaque fil ; le verrou sérialise aussi
    /// les ajouts d'un même journal.
    last: Arc<Mutex<HashMap<String, Option<String>>>>,
}

impl CellJournal {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self {
            dir: dir.into(),
            last: Arc::default(),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
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
        let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        let prev = last
            .entry(record.thread_id.clone())
            .or_insert_with(|| last_line_sha(&path))
            .clone();
        let mut stored = record.clone();
        stored.code = clip(&stored.code, STORED_CODE_MAX);
        stored.stdout = clip(&stored.stdout, STORED_STREAM_MAX);
        stored.stderr = clip(&stored.stderr, STORED_STREAM_MAX);
        stored.prev_sha256 = prev;
        let body = serde_json::to_vec(&stored)?;
        let mut line = Vec::new();
        // Une ligne laissée à moitié par un arrêt brutal ne doit pas avaler
        // la suivante : on repart sur une ligne neuve.
        if ends_mid_line(&path) {
            line.push(b'\n');
        }
        line.extend(&body);
        line.push(b'\n');
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        f.write_all(&line)?;
        f.sync_data()?;
        drop(f);
        last.insert(record.thread_id.clone(), Some(hex::encode(Sha256::digest(&body))));
        if std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > FILE_MAX {
            self.rotate(&path)?;
        }
        Ok(())
    }

    /// Le journal plein est renommé à côté (`<clé>.<date>.jsonl`), jamais
    /// effacé ; le journal courant repart de ses dernières lignes, recopiées
    /// telles quelles pour que leur chaîne reste vérifiable.
    fn rotate(&self, path: &Path) -> std::io::Result<()> {
        let text = std::fs::read_to_string(path)?;
        let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
        let keep = &lines[lines.len().saturating_sub(KEEP_AFTER_ROTATION)..];
        let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ");
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("journal");
        std::fs::rename(path, self.dir.join(format!("{stem}.{stamp}.jsonl")))?;
        let mut buf = keep.join("\n");
        buf.push('\n');
        let tmp = path.with_extension("jsonl.tmp");
        std::fs::write(&tmp, buf)?;
        std::fs::rename(tmp, path)
    }

    /// Journaux archivés d'un fil, du plus ancien au plus récent.
    fn archives(&self, thread_id: &str) -> Vec<PathBuf> {
        let prefix = format!("{}.", thread_key(thread_id));
        let mut found: Vec<PathBuf> = std::fs::read_dir(&self.dir)
            .map(|rd| {
                rd.flatten()
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".jsonl") && n.len() > prefix.len() + 6)
                    })
                    .collect()
            })
            .unwrap_or_default();
        found.sort();
        found
    }

    /// Vérifie la chaîne d'empreintes du journal courant. Les lignes
    /// écrites avant la chaîne (sans `prevSha256`) ne comptent pas.
    pub fn verify_chain(&self, thread_id: &str) -> ChainCheck {
        let text = std::fs::read_to_string(self.path_for(thread_id)).unwrap_or_default();
        let mut previous: Option<String> = None;
        let mut checked = 0;
        for (i, raw) in text.lines().filter(|l| !l.trim().is_empty()).enumerate() {
            let Ok(record) = serde_json::from_str::<CellRecord>(raw) else {
                previous = Some(hex::encode(Sha256::digest(raw.as_bytes())));
                continue;
            };
            // La première ligne gardée après une rotation pointe vers une
            // ligne archivée : on ne peut pas la juger ici.
            if i > 0 {
                if let Some(prev) = &record.prev_sha256 {
                    if previous.as_ref() != Some(prev) {
                        return ChainCheck { checked, broken_at: Some(record.id) };
                    }
                    checked += 1;
                }
            }
            previous = Some(hex::encode(Sha256::digest(raw.as_bytes())));
        }
        ChainCheck { checked, broken_at: None }
    }

    /// Les `limit` dernières cellules du fil, de la plus ancienne à la plus récente.
    pub fn list(&self, thread_id: &str, limit: usize) -> Vec<CellRecord> {
        let all = latest(read_records(&self.path_for(thread_id)));
        all[all.len().saturating_sub(limit)..].to_vec()
    }

    pub fn get(&self, thread_id: &str, id: u64) -> Option<CellRecord> {
        let find = |path: &Path| read_records(path).into_iter().rev().find(|r| r.id == id);
        find(&self.path_for(thread_id)).or_else(|| {
            self.archives(thread_id).iter().rev().find_map(|p| find(p))
        })
    }

    /// Cellules d'une session de noyau, dans l'ordre d'exécution.
    pub fn session_cells(&self, thread_id: &str, session: &str) -> Vec<CellRecord> {
        latest(read_records(&self.path_for(thread_id)))
            .into_iter()
            .filter(|r| r.session.as_deref() == Some(session))
            .collect()
    }

    /// Remplace une cellule par une version complétée (marque de rejeu) :
    /// la nouvelle ligne s'ajoute, `list` et `get` ne gardent qu'elle.
    pub fn rewrite(&self, record: &CellRecord) -> std::io::Result<()> {
        self.append(record)
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
        for archive in self.archives(thread_id) {
            let _ = std::fs::remove_file(archive);
        }
        self.last
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(thread_id);
    }
}

/// sha256 de la dernière ligne complète du fichier (la tête de la chaîne).
fn last_line_sha(path: &Path) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let last = text.lines().rev().find(|l| !l.trim().is_empty())?;
    serde_json::from_str::<CellRecord>(last).ok()?;
    Some(hex::encode(Sha256::digest(last.as_bytes())))
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
            ..Default::default()
        }
    }

    #[test]
    fn la_chaine_d_empreintes_repere_une_ligne_retouchee() {
        let dir = tempfile::tempdir().unwrap();
        let j = CellJournal::new(dir.path());
        for id in 1..=3 {
            j.append(&record("t", id, &[])).unwrap();
        }
        assert_eq!(j.verify_chain("t"), ChainCheck { checked: 2, broken_at: None });
        // Un journal rouvert (nouvel objet) reprend la chaîne où elle était.
        let j2 = CellJournal::new(dir.path());
        j2.append(&record("t", 4, &[])).unwrap();
        assert_eq!(j2.verify_chain("t").checked, 3);
        let path = j.path_for("t");
        let text = std::fs::read_to_string(&path).unwrap().replace("x = 2", "x = 9");
        std::fs::write(&path, text).unwrap();
        assert_eq!(j.verify_chain("t").broken_at, Some(3));
    }

    #[test]
    fn la_rotation_archive_au_lieu_d_effacer() {
        let dir = tempfile::tempdir().unwrap();
        let j = CellJournal::new(dir.path());
        j.append(&record("t", 1, &["/p/a.png"])).unwrap();
        j.append(&record("t", 2, &[])).unwrap();
        j.rotate(&j.path_for("t")).unwrap();
        assert_eq!(j.archives("t").len(), 1);
        assert!(j.get("t", 1).is_some(), "une cellule archivée se relit");
        j.append(&record("t", 3, &[])).unwrap();
        assert_eq!(j.verify_chain("t").broken_at, None);
        j.delete_thread("t");
        assert!(j.archives("t").is_empty());
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
