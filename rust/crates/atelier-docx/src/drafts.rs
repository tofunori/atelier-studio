//! Brouillons de réponse de l'agent, posés dans la carte d'un commentaire.
//!
//! L'agent ne répond pas à un relecteur en son nom : il propose un brouillon
//! que l'utilisateur relit dans le panneau et envoie sous le sien (Thierry,
//! 2026-11-12, « Brouillon, signé Thierry »). Le brouillon n'entre donc pas
//! dans le .docx : il vit dans le dossier temporaire, nommé d'après le chemin
//! du document, comme le verrou (rien ne s'ajoute à côté du fichier de
//! l'utilisateur). Le serveur de l'agent l'écrit, celui du panneau le lit et
//! l'efface une fois la réponse envoyée.

use crate::{err, Docx, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Au-delà, ce n'est plus une réponse à un commentaire.
pub const MAX_CHARS: usize = 4000;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Draft {
    pub text: String,
    /// Agent qui l'a rédigé (« Claude », « Codex »…).
    pub author: String,
    /// Millisecondes depuis l'époque Unix.
    pub at: u64,
}

pub type Drafts = BTreeMap<u32, Draft>;

fn store_for(doc: &Path) -> Result<PathBuf> {
    store_named(doc, "drafts")
}

fn store_named(doc: &Path, kind: &str) -> Result<PathBuf> {
    let canon = doc.canonicalize()?;
    let name = format!("atelier-docx-{}.{kind}.json", hex::encode(&Sha256::digest(canon.to_string_lossy().as_bytes())[..8]));
    Ok(std::env::temp_dir().join(name))
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Vérifications terminées (2026-11-13) : quand l'utilisateur fait vérifier
/// son commentaire dans le chat, l'agent signale qu'il a fini, qu'il l'ait
/// corrigé ou non ; l'icône de la carte quitte alors ses trois points.
/// Commentaire → heure de fin (millisecondes Unix), même dossier temporaire.
pub type Checks = BTreeMap<u32, u64>;

pub fn checks(doc: &Path) -> Result<Checks> {
    let store = store_named(doc, "checks")?;
    Ok(std::fs::read(&store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default())
}

/// Note la fin de la vérification du commentaire `comment`.
pub fn checked(doc: &Path, comment: u32) -> Result<u64> {
    let model = Docx::open(doc)?.model()?;
    if !model.comments.iter().any(|c| c.id == comment) {
        return err(format!("commentaire c{comment} introuvable"));
    }
    let store = store_named(doc, "checks")?;
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut all: Checks = std::fs::read(&store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    let at = now_ms();
    all.insert(comment, at);
    let bytes = serde_json::to_vec(&all).map_err(|e| crate::DocxError(format!("vérifications : {e}")))?;
    crate::write_atomic(&store, &bytes)?;
    Ok(at)
}

fn read(store: &Path) -> Drafts {
    std::fs::read(store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn write(store: &Path, drafts: &Drafts) -> Result<()> {
    if drafts.is_empty() {
        match std::fs::remove_file(store) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => return Ok(()),
        }
    }
    let bytes = serde_json::to_vec(drafts).map_err(|e| crate::DocxError(format!("brouillons : {e}")))?;
    crate::write_atomic(store, &bytes)
}

/// Brouillons en attente pour ce document (aucun si le fichier manque).
pub fn list(doc: &Path) -> Result<Drafts> {
    Ok(read(&store_for(doc)?))
}

/// Pose (ou remplace) le brouillon de réponse au commentaire `comment`.
/// Seul un commentaire de tête existant en reçoit un : une réponse se
/// rattache au fil, jamais à une autre réponse.
pub fn put(doc: &Path, comment: u32, text: &str, author: &str) -> Result<Draft> {
    let text = text.trim();
    if text.is_empty() {
        return err("brouillon vide");
    }
    if text.chars().count() > MAX_CHARS {
        return err(format!("brouillon trop long (plus de {MAX_CHARS} caractères) : une réponse à un commentaire reste courte"));
    }
    let model = Docx::open(doc)?.model()?;
    let Some(c) = model.comments.iter().find(|c| c.id == comment) else {
        return err(format!("commentaire c{comment} introuvable"));
    };
    if let Some(parent) = c.parent {
        return err(format!("c{comment} est une réponse : pose le brouillon sur le commentaire c{parent}"));
    }
    let store = store_for(doc)?;
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut drafts = read(&store);
    let at = now_ms();
    let draft = Draft { text: text.to_string(), author: author.trim().to_string(), at };
    drafts.insert(comment, draft.clone());
    write(&store, &drafts)?;
    Ok(draft)
}

/// Retire le brouillon (envoyé, ou écarté par l'utilisateur). Vrai s'il y en avait un.
pub fn clear(doc: &Path, comment: u32) -> Result<bool> {
    let store = store_for(doc)?;
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut drafts = read(&store);
    let had = drafts.remove(&comment).is_some();
    if had {
        write(&store, &drafts)?;
    }
    Ok(had)
}
