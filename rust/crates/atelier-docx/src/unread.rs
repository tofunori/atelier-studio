//! Bulles que l'agent a écrites ou modifiées et que l'utilisateur n'a pas
//! encore ouvertes (Thierry, 2026-11-14 : « le petit point quand Claude a
//! fait une modification et que je ne l'ai pas lue »).
//!
//! Comme les brouillons et les retouches de l'agent, cet état reste dans
//! Atelier : rien n'entre dans le .docx. Le fichier temporaire garde la
//! signature (nom et heure) de chaque commentaire touché par l'agent ; Word
//! renumérote les commentaires mais garde `w:author` et `w:date`. Le panneau
//! montre un point sur le FIL (commentaire de tête) et l'efface quand
//! l'utilisateur ouvre la carte.

use crate::model::DocModel;
use crate::Result;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

/// Signature d'un commentaire (ou d'une réponse) touché par l'agent.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct Mark {
    pub author: String,
    pub date: String,
}

/// Une marque et les fils déjà ouverts qui la portent : deux bulles écrites
/// dans la même seconde partagent une signature, et ouvrir l'une ne doit
/// pas effacer le point de l'autre.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Entry {
    author: String,
    date: String,
    /// Signatures des commentaires de tête déjà ouverts.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    read: Vec<Mark>,
}

impl Entry {
    fn is(&self, author: &str, date: &str) -> bool {
        self.author == author && self.date == date
    }
}

fn store_for(doc: &Path) -> Result<PathBuf> {
    let canon = doc.canonicalize()?;
    let name = format!("atelier-docx-{}.unread.json", hex::encode(&Sha256::digest(canon.to_string_lossy().as_bytes())[..8]));
    Ok(std::env::temp_dir().join(name))
}

fn read(store: &Path) -> Vec<Entry> {
    std::fs::read(store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn write(store: &Path, marks: &[Entry]) -> Result<()> {
    if marks.is_empty() {
        return match std::fs::remove_file(store) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        };
    }
    let bytes = serde_json::to_vec(marks).map_err(|e| crate::DocxError(format!("bulles non lues : {e}")))?;
    crate::write_atomic(store, &bytes)
}

/// Commentaire de tête du fil de `id` (lui-même s'il n'est pas une réponse).
fn head_of(model: &DocModel, id: u32) -> Option<u32> {
    let mut cur = model.comments.iter().find(|c| c.id == id)?;
    // Un fil de réponses ne remonte jamais bien loin ; la borne protège d'une boucle.
    for _ in 0..64 {
        match cur.parent.and_then(|p| model.comments.iter().find(|c| c.id == p)) {
            Some(up) => cur = up,
            None => break,
        }
    }
    Some(cur.id)
}

fn alive(model: &DocModel, m: &Entry) -> bool {
    model.comments.iter().any(|c| m.is(&c.author, &c.date))
}

fn sig_of(model: &DocModel, id: u32) -> Option<Mark> {
    model.comments.iter().find(|c| c.id == id).map(|c| Mark { author: c.author.clone(), date: c.date.clone() })
}

/// Note des bulles que l'agent est sur le point d'écrire ou de corriger :
/// `marks` sont leurs signatures. À appeler AVANT d'écrire le .docx, pour
/// que le panneau qui relit le fichier trouve déjà le point ; `model` est
/// le document d'avant, sur lequel on oublie les marques mortes (sauf
/// celles qu'on pose, que l'écriture va faire vivre).
pub fn touch(doc: &Path, model: &DocModel, marks: &[Mark]) -> Result<()> {
    let marks: Vec<Mark> = marks.iter().filter(|m| !m.date.is_empty()).cloned().collect();
    if marks.is_empty() {
        return Ok(());
    }
    let store = store_for(doc)?;
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut all = read(&store);
    all.retain(|e| alive(model, e) || marks.iter().any(|m| e.is(&m.author, &m.date)));
    for m in marks {
        match all.iter_mut().find(|e| e.is(&m.author, &m.date)) {
            // Touchée de nouveau : non lue partout où elle se trouve.
            Some(e) => e.read.clear(),
            None => all.push(Entry { author: m.author, date: m.date, read: Vec::new() }),
        }
    }
    write(&store, &all)
}

/// Fils (commentaires de tête) qui portent une bulle non lue.
pub fn list(doc: &Path, model: &DocModel) -> Result<Vec<u32>> {
    let all = read(&store_for(doc)?);
    if all.is_empty() {
        return Ok(Vec::new());
    }
    let heads: BTreeSet<u32> = model
        .comments
        .iter()
        .filter(|c| !c.date.is_empty())
        .filter_map(|c| {
            let e = all.iter().find(|e| e.is(&c.author, &c.date))?;
            let head = head_of(model, c.id)?;
            let sig = sig_of(model, head)?;
            (!e.read.contains(&sig)).then_some(head)
        })
        .collect();
    Ok(heads.into_iter().collect())
}

/// L'utilisateur a ouvert le fil `id` : ses bulles ne sont plus « non lues ».
/// Rend vrai s'il en portait.
pub fn seen(doc: &Path, model: &DocModel, id: u32) -> Result<bool> {
    let store = store_for(doc)?;
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let all = read(&store);
    if all.is_empty() {
        return Ok(false);
    }
    let head = head_of(model, id).unwrap_or(id);
    let Some(head_sig) = sig_of(model, head) else { return Ok(false) };
    let in_thread = |e: &Entry| model.comments.iter().any(|c| e.is(&c.author, &c.date) && head_of(model, c.id) == Some(head));
    let elsewhere = |e: &Entry| model.comments.iter().any(|c| e.is(&c.author, &c.date) && head_of(model, c.id) != Some(head));
    let mut had = false;
    let mut keep = Vec::new();
    for mut e in all.iter().cloned() {
        if !alive(model, &e) {
            continue;
        }
        if in_thread(&e) && !e.read.contains(&head_sig) {
            had = true;
            if !elsewhere(&e) {
                continue;
            }
            e.read.push(head_sig.clone());
        }
        keep.push(e);
    }
    if keep != all {
        write(&store, &keep)?;
    }
    Ok(had)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Comment;

    fn c(id: u32, author: &str, date: &str, parent: Option<u32>) -> Comment {
        Comment { id, author: author.into(), initials: "TL".into(), date: date.into(), text: "x".into(), parent, done: false, paragraph: None, quote: String::new() }
    }

    fn model(comments: Vec<Comment>) -> DocModel {
        DocModel { revision: "r".into(), page: None, paragraphs: vec![], notes: vec![], headers: vec![], changes: vec![], comments, authors: vec![], other_parts: vec![] }
    }

    #[test]
    fn le_point_suit_le_fil_et_s_efface_a_l_ouverture() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("tp.docx");
        std::fs::write(&doc, b"x").unwrap();
        let before = model(vec![c(0, "Thierry", "2026-11-13T10:00:00Z", None), c(1, "Thierry", "2026-11-13T10:01:00Z", None)]);
        // Une réponse posée par l'agent sous c1, et c0 corrigé.
        let reply = Mark { author: "Thierry".into(), date: "2026-11-14T08:00:00Z".into() };
        let edited = Mark { author: "Thierry".into(), date: "2026-11-13T10:00:00Z".into() };
        touch(&doc, &before, &[reply.clone(), edited]).unwrap();
        let after = model(vec![
            c(0, "Thierry", "2026-11-13T10:00:00Z", None),
            c(1, "Thierry", "2026-11-13T10:01:00Z", None),
            c(2, "Thierry", "2026-11-14T08:00:00Z", Some(1)),
        ]);
        assert_eq!(list(&doc, &after).unwrap(), vec![0, 1]);
        // Ouvrir le fil c1 efface sa réponse, pas c0.
        assert!(seen(&doc, &after, 1).unwrap());
        assert_eq!(list(&doc, &after).unwrap(), vec![0]);
        assert!(!seen(&doc, &after, 1).unwrap());
        // Word renumérote : la signature suit le commentaire.
        let renum = model(vec![c(5, "Thierry", "2026-11-13T10:00:00Z", None)]);
        assert_eq!(list(&doc, &renum).unwrap(), vec![5]);
        assert!(seen(&doc, &renum, 5).unwrap());
        assert!(list(&doc, &renum).unwrap().is_empty());
        assert!(!store_for(&doc).unwrap().exists(), "plus rien à montrer : le fichier temporaire disparaît");
    }

    #[test]
    fn deux_bulles_de_la_meme_seconde_se_lisent_separement() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("tp.docx");
        std::fs::write(&doc, b"x").unwrap();
        let d = "2026-11-14T08:00:00Z";
        let m = model(vec![c(0, "Thierry", "2026-11-13T10:00:00Z", None), c(1, "Thierry", d, None), c(2, "Thierry", d, Some(0))]);
        touch(&doc, &m, &[Mark { author: "Thierry".into(), date: d.into() }]).unwrap();
        assert_eq!(list(&doc, &m).unwrap(), vec![0, 1]);
        assert!(seen(&doc, &m, 0).unwrap());
        assert_eq!(list(&doc, &m).unwrap(), vec![1]);
        assert!(seen(&doc, &m, 1).unwrap());
        assert!(list(&doc, &m).unwrap().is_empty());
        // Touchée de nouveau : non lue partout.
        touch(&doc, &m, &[Mark { author: "Thierry".into(), date: d.into() }]).unwrap();
        assert_eq!(list(&doc, &m).unwrap(), vec![0, 1]);
    }

    #[test]
    fn une_marque_sans_bulle_s_oublie() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("tp.docx");
        std::fs::write(&doc, b"x").unwrap();
        let m0 = model(vec![]);
        touch(&doc, &m0, &[Mark { author: "Thierry".into(), date: "2026-11-14T08:00:00Z".into() }]).unwrap();
        // Écriture refusée : la bulle n'existe pas, la marque tombe au prochain passage.
        touch(&doc, &m0, &[Mark { author: "Thierry".into(), date: "2026-11-14T09:00:00Z".into() }]).unwrap();
        assert_eq!(read(&store_for(&doc).unwrap()).len(), 1);
        // Une date vide ne marque rien (elle désignerait trop de bulles).
        touch(&doc, &m0, &[Mark { author: "Thierry".into(), date: String::new() }]).unwrap();
        assert_eq!(read(&store_for(&doc).unwrap()).len(), 1);
    }
}
