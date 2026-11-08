//! Réponses de l'agent aux rondes d'annotations (`tex_revisions.json`).
//!
//! L'éditeur LaTeX envoie au chat une ronde : ses notes, numérotées par leur
//! id. L'agent répond à chacune avec l'outil `atelier_revision`, sans jamais
//! toucher au fichier : une proposition (le texte qui remplacerait le passage
//! annoté, et sa raison) ou une question. Le runtime écrit ces réponses ici ;
//! la galerie les sert à l'éditeur (`GET /texrevisions`), qui les montre sur
//! place et applique seulement ce que l'utilisateur accepte.
//!
//! Format : `{ "<chemin absolu du fichier>": { "round": "r…", "seq": n,
//! "items": { "<id de note>": { kind, text?, reason?, question?, author,
//! seq, at } } } }`. Un seul écrivain (le runtime), sous `tex_revisions.lock`.

use crate::durable::{self, StoreError};
use serde_json::{json, Map, Value};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const STORE_NAME: &str = "tex_revisions.json";
pub const LOCK_NAME: &str = "tex_revisions.lock";

/// Longueurs admises : un passage réécrit, une raison d'une phrase, une
/// question courte. Au-delà, l'agent reçoit une erreur lisible.
pub const TEXT_MAX: usize = 20_000;
pub const REASON_MAX: usize = 600;
pub const QUESTION_MAX: usize = 1_000;
/// Notes par ronde : bien plus qu'une relecture réelle.
pub const ITEMS_MAX: usize = 300;

/// Réponse de l'agent à une note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Reply {
    Propose { text: String, reason: String },
    Ask { question: String },
}

struct Lock {
    file: File,
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

fn lock(dir: &Path) -> Result<Lock, StoreError> {
    fs::create_dir_all(dir).map_err(|error| StoreError::io(dir, error))?;
    let path = dir.join(LOCK_NAME);
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|error| StoreError::io(&path, error))?;
    file.lock().map_err(|error| StoreError::io(&path, error))?;
    Ok(Lock { file })
}

/// Dossier de l'application, comme le runtime et la galerie le résolvent :
/// `$ATELIER_APP_DIR`, à défaut `~/Library/Application Support/atelier-studio`.
pub fn default_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("ATELIER_APP_DIR").filter(|d| !d.is_empty()) {
        return PathBuf::from(dir);
    }
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
        .join("Library/Application Support/atelier-studio")
}

pub fn store_path(dir: &Path) -> PathBuf {
    dir.join(STORE_NAME)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `r` suivi de chiffres (l'heure de lancement en ms, posée par l'éditeur).
pub fn round_number(round: &str) -> Option<u64> {
    round
        .strip_prefix('r')
        .filter(|digits| !digits.is_empty() && digits.len() <= 20 && digits.bytes().all(|b| b.is_ascii_digit()))
        .and_then(|digits| digits.parse().ok())
}

/// Id de note posé par l'éditeur (`c` + heure, ou un uuid) : court, sans
/// caractère exotique.
pub fn valid_note_id(note: &str) -> bool {
    !note.is_empty()
        && note.len() <= 64
        && note.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Enregistre la réponse de l'agent à une note de la ronde `round` du
/// fichier `file`. Une ronde plus récente remplace l'ancienne ; une réponse
/// à une ronde périmée est refusée (l'utilisateur en a lancé une autre).
pub fn record(dir: &Path, file: &str, round: &str, note: &str, reply: &Reply, author: &str) -> Result<Value, String> {
    let incoming = round_number(round).ok_or("round invalide : reprends l'id « r… » donné dans la demande")?;
    if !valid_note_id(note) {
        return Err("note invalide : reprends l'id entre crochets donné dans la demande".into());
    }
    match reply {
        Reply::Propose { text, reason } => {
            if text.chars().count() > TEXT_MAX {
                return Err(format!("text trop long (plus de {TEXT_MAX} caractères)"));
            }
            if reason.chars().count() > REASON_MAX {
                return Err("reason trop longue : une phrase suffit".into());
            }
        }
        Reply::Ask { question } => {
            if question.trim().is_empty() {
                return Err("question vide".into());
            }
            if question.chars().count() > QUESTION_MAX {
                return Err("question trop longue".into());
            }
        }
    }
    let _lock = lock(dir).map_err(|e| e.to_string())?;
    let path = store_path(dir);
    let mut store = durable::load_object(&path).map_err(|e| e.to_string())?;
    let entry = store.entry(file.to_string()).or_insert_with(|| json!({}));
    let current = entry.get("round").and_then(Value::as_str).and_then(round_number);
    match current {
        Some(stored) if stored > incoming => {
            return Err("ronde périmée : l'utilisateur a lancé une ronde plus récente".into());
        }
        Some(stored) if stored == incoming => {}
        _ => *entry = json!({"round": round, "seq": 0, "items": {}}),
    }
    let seq = entry.get("seq").and_then(Value::as_u64).unwrap_or(0) + 1;
    let items = entry
        .get_mut("items")
        .and_then(Value::as_object_mut)
        .ok_or("store illisible")?;
    if !items.contains_key(note) && items.len() >= ITEMS_MAX {
        return Err("trop de réponses pour cette ronde".into());
    }
    let mut item = Map::new();
    match reply {
        Reply::Propose { text, reason } => {
            item.insert("kind".into(), json!("propose"));
            item.insert("text".into(), json!(text));
            item.insert("reason".into(), json!(reason.trim()));
        }
        Reply::Ask { question } => {
            item.insert("kind".into(), json!("ask"));
            item.insert("question".into(), json!(question.trim()));
        }
    }
    item.insert("author".into(), json!(author));
    item.insert("seq".into(), json!(seq));
    item.insert("at".into(), json!(now_ms()));
    items.insert(note.to_string(), Value::Object(item));
    entry["seq"] = json!(seq);
    durable::save_json_pretty(&path, &store).map_err(|e| e.to_string())?;
    Ok(json!({"seq": seq}))
}

/// Réponses enregistrées pour `file` (objet vide s'il n'y en a pas).
pub fn entry(dir: &Path, file: &str) -> Result<Value, StoreError> {
    let store = durable::load_object(&store_path(dir))?;
    Ok(store.get(file).cloned().unwrap_or_else(|| json!({})))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn propose(text: &str) -> Reply {
        Reply::Propose { text: text.into(), reason: "Plus direct.".into() }
    }

    #[test]
    fn records_replies_per_round_and_note() {
        let dir = tempfile::tempdir().unwrap();
        let file = "/p/main.tex";
        assert_eq!(entry(dir.path(), file).unwrap(), json!({}));
        record(dir.path(), file, "r100", "c1", &propose("Albedo drops."), "Claude").unwrap();
        record(dir.path(), file, "r100", "c2", &Reply::Ask { question: "Quelle étude ?".into() }, "Claude").unwrap();
        let e = entry(dir.path(), file).unwrap();
        assert_eq!(e["round"], "r100");
        assert_eq!(e["seq"], 2);
        assert_eq!(e["items"]["c1"]["kind"], "propose");
        assert_eq!(e["items"]["c1"]["text"], "Albedo drops.");
        assert_eq!(e["items"]["c2"]["question"], "Quelle étude ?");
        // Une nouvelle réponse à la même note la remplace, avec un seq plus grand.
        record(dir.path(), file, "r100", "c1", &propose("Albedo falls."), "Claude").unwrap();
        let e = entry(dir.path(), file).unwrap();
        assert_eq!(e["items"]["c1"]["seq"], 3);
        assert_eq!(e["items"]["c1"]["text"], "Albedo falls.");
    }

    #[test]
    fn a_newer_round_replaces_and_an_older_one_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let file = "/p/main.tex";
        record(dir.path(), file, "r100", "c1", &propose("a"), "Codex").unwrap();
        record(dir.path(), file, "r200", "c9", &propose("b"), "Codex").unwrap();
        let e = entry(dir.path(), file).unwrap();
        assert_eq!(e["round"], "r200");
        assert!(e["items"].get("c1").is_none());
        let err = record(dir.path(), file, "r100", "c1", &propose("a"), "Codex").unwrap_err();
        assert!(err.contains("périmée"), "{err}");
    }

    #[test]
    fn rejects_bad_ids_and_oversized_text() {
        let dir = tempfile::tempdir().unwrap();
        assert!(record(dir.path(), "/p/a.tex", "100", "c1", &propose("a"), "x").is_err());
        assert!(record(dir.path(), "/p/a.tex", "r1", "../c1", &propose("a"), "x").is_err());
        assert!(record(dir.path(), "/p/a.tex", "r1", "c1", &Reply::Ask { question: " ".into() }, "x").is_err());
        let long = "x".repeat(TEXT_MAX + 1);
        assert!(record(dir.path(), "/p/a.tex", "r1", "c1", &propose(&long), "x").is_err());
        assert!(!store_path(dir.path()).exists(), "un refus n'écrit rien");
    }
}
