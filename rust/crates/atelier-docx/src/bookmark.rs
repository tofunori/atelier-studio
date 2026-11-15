//! Signet « où j'en étais » (Thierry, 2026-11-15 : « quelque chose pour me
//! rappeler le commentaire sur lequel je travaillais »).
//!
//! Un seul signet par document, posé à la main sur un fil de commentaires,
//! et en repli le dernier fil ouvert. Rien n'entre dans le .docx : l'état
//! vit dans le dossier d'historique du document (`history::dir_for`), qui
//! survit à la relance d'Atelier et suit un document déplacé.
//!
//! Word renumérote les commentaires : on retient la signature du fil (nom,
//! date, début du texte), comme les marques de l'agent.

use crate::model::{Comment, DocModel};
use crate::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Caractères du texte gardés pour distinguer deux fils de la même seconde.
const TEXT_KEY: usize = 60;

/// Signature d'un commentaire de tête.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Sig {
    pub author: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub text: String,
}

impl Sig {
    fn of(c: &Comment) -> Self {
        Sig { author: c.author.clone(), date: c.date.clone(), text: key_text(&c.text) }
    }
    fn is(&self, c: &Comment) -> bool {
        c.parent.is_none() && self.author == c.author && self.date == c.date && self.text == key_text(&c.text)
    }
}

fn key_text(t: &str) -> String {
    t.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(TEXT_KEY).collect()
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
struct Entry {
    /// Signet posé par l'utilisateur.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    manual: Option<Sig>,
    /// Dernier fil ouvert (repli quand aucun signet n'est posé).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last: Option<Sig>,
}

/// Où reprendre dans le document, en numéros du modèle courant.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Place {
    /// Fil marqué d'un signet (absent s'il n'y en a pas ou s'il a disparu).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manual: Option<u32>,
    /// Dernier fil ouvert.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last: Option<u32>,
}

fn store_for(doc: &Path) -> PathBuf {
    crate::history::dir_for(doc).join("signet.json")
}

fn read(store: &Path) -> Entry {
    std::fs::read(store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn write(store: &Path, e: &Entry) -> Result<()> {
    if e.manual.is_none() && e.last.is_none() {
        return match std::fs::remove_file(store) {
            Err(err) if err.kind() != std::io::ErrorKind::NotFound => Err(err.into()),
            _ => Ok(()),
        };
    }
    if let Some(dir) = store.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let bytes = serde_json::to_vec(e).map_err(|err| crate::DocxError(format!("signet : {err}")))?;
    crate::write_atomic(store, &bytes)
}

fn find(model: &DocModel, sig: &Option<Sig>) -> Option<u32> {
    let sig = sig.as_ref()?;
    model.comments.iter().find(|c| sig.is(c)).map(|c| c.id)
}

/// Le signet et le dernier fil ouvert, retrouvés dans `model`.
pub fn place(doc: &Path, model: &DocModel) -> Place {
    let e = read(&store_for(doc));
    Place { manual: find(model, &e.manual), last: find(model, &e.last) }
}

/// Ce que le panneau demande.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    /// Pose le signet sur le fil (et le retire d'ailleurs : un seul par document).
    Set(u32),
    /// Retire le signet.
    Clear,
    /// Note le dernier fil ouvert.
    Opened(u32),
}

/// Applique `action` et rend la nouvelle place. Un fil inconnu (déjà
/// supprimé) ne change rien.
pub fn update(doc: &Path, model: &DocModel, action: Action) -> Result<Place> {
    let store = store_for(doc);
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut e = read(&store);
    let head = |id: u32| model.comments.iter().find(|c| c.id == id && c.parent.is_none()).map(Sig::of);
    let before = e.clone();
    match action {
        Action::Set(id) => {
            if let Some(s) = head(id) {
                e.manual = Some(s);
            }
        }
        Action::Clear => e.manual = None,
        Action::Opened(id) => {
            if let Some(s) = head(id) {
                e.last = Some(s);
            }
        }
    }
    if e != before {
        write(&store, &e)?;
    }
    Ok(Place { manual: find(model, &e.manual), last: find(model, &e.last) })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn c(id: u32, author: &str, date: &str, text: &str, parent: Option<u32>) -> Comment {
        Comment { id, author: author.into(), initials: "CK".into(), date: date.into(), text: text.into(), parent, done: false, paragraph: None, quote: String::new() }
    }

    fn model(comments: Vec<Comment>) -> DocModel {
        DocModel { revision: "r".into(), page: None, paragraphs: vec![], notes: vec![], headers: vec![], changes: vec![], comments, authors: vec![], other_parts: vec![] }
    }

    fn doc() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        // Même racine que les autres tests unitaires du processus (réglage global).
        crate::history::set_root(std::env::temp_dir().join(format!("atelier-docx-seance-unit-{}", std::process::id())));
        let doc = dir.path().join("chapitre.docx");
        std::fs::write(&doc, b"x").unwrap();
        (dir, doc)
    }

    #[test]
    fn un_seul_signet_qui_suit_le_fil_quand_word_renumerote() {
        let (_d, doc) = doc();
        let m = model(vec![
            c(1, "Christophe", "2026-10-14T09:00:00Z", "Pourquoi 0,6 et pas 0,5 ?", None),
            c(2, "Thierry", "2026-10-15T09:00:00Z", "D'accord.", Some(1)),
            // Deux fils de la même seconde : le texte les distingue.
            c(3, "Christophe", "2026-11-15T09:00:00Z", "Donner l'écart moyen.", None),
            c(4, "Christophe", "2026-11-15T09:00:00Z", "Préciser la collection.", None),
        ]);
        assert_eq!(place(&doc, &m), Place::default());
        assert_eq!(update(&doc, &m, Action::Set(3)).unwrap(), Place { manual: Some(3), last: None });
        // Un second signet remplace le premier.
        assert_eq!(update(&doc, &m, Action::Set(4)).unwrap().manual, Some(4));
        // Une réponse ne porte pas de signet.
        assert_eq!(update(&doc, &m, Action::Set(2)).unwrap().manual, Some(4));
        assert_eq!(update(&doc, &m, Action::Opened(1)).unwrap(), Place { manual: Some(4), last: Some(1) });
        // Word renumérote : la signature retrouve les fils.
        let renum = model(vec![
            c(10, "Christophe", "2026-11-15T09:00:00Z", "Préciser la collection.", None),
            c(11, "Christophe", "2026-10-14T09:00:00Z", "Pourquoi 0,6 et pas 0,5 ?", None),
        ]);
        assert_eq!(place(&doc, &renum), Place { manual: Some(10), last: Some(11) });
        // Fil supprimé : plus de signet, sans erreur.
        let gone = model(vec![c(11, "Christophe", "2026-10-14T09:00:00Z", "Pourquoi 0,6 et pas 0,5 ?", None)]);
        assert_eq!(place(&doc, &gone), Place { manual: None, last: Some(11) });
        assert_eq!(update(&doc, &renum, Action::Clear).unwrap(), Place { manual: None, last: Some(11) });
        assert!(store_for(&doc).exists(), "le dernier fil ouvert reste");
    }

    #[test]
    fn rien_a_garder_rien_sur_le_disque() {
        let (_d, doc) = doc();
        let m = model(vec![c(1, "Christophe", "2026-10-14T09:00:00Z", "Texte", None)]);
        update(&doc, &m, Action::Set(1)).unwrap();
        assert!(store_for(&doc).exists());
        update(&doc, &m, Action::Clear).unwrap();
        assert!(!store_for(&doc).exists());
        // Un fil inconnu ne pose rien.
        update(&doc, &m, Action::Set(99)).unwrap();
        assert!(!store_for(&doc).exists());
        assert!(!doc.with_file_name("signet.json").exists(), "jamais à côté du document");
    }
}
