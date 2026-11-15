//! Signet « où j'en étais » (Thierry, 2026-11-15 : « quelque chose pour me
//! rappeler le commentaire sur lequel je travaillais »).
//!
//! Des rubans de couleur posés à la main sur les fils de commentaires
//! (« marquer des commentaires avec différentes couleurs d'onglet »), et en
//! repli le dernier fil ouvert. Rien n'entre dans le .docx : l'état
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

/// Teintes permises, dans l'ordre du menu (⌘1 à ⌘5).
pub const COLORS: [&str; 5] = ["gris", "rouge", "jaune", "vert", "bleu"];

fn default_color() -> String {
    COLORS[0].into()
}

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

/// Un ruban posé.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Ribbon {
    #[serde(flatten)]
    sig: Sig,
    #[serde(default = "default_color")]
    color: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
struct Entry {
    /// Rubans posés par l'utilisateur.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    marks: Vec<Ribbon>,
    /// Ancien signet unique (avant les couleurs) : relu comme un ruban gris.
    #[serde(default, skip_serializing)]
    manual: Option<Sig>,
    /// Dernier fil ouvert (repli quand aucun ruban n'est posé).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last: Option<Sig>,
}

/// Un ruban, en numéro du modèle courant.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Mark {
    pub id: u32,
    pub color: String,
}

/// Les rubans et le dernier fil ouvert, en numéros du modèle courant.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Place {
    /// Fils marqués d'un ruban encore présents dans le document.
    pub marks: Vec<Mark>,
    /// Dernier fil ouvert.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last: Option<u32>,
}

fn store_for(doc: &Path) -> PathBuf {
    crate::history::dir_for(doc).join("signet.json")
}

fn read(store: &Path) -> Entry {
    let mut e: Entry = std::fs::read(store).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    if let Some(sig) = e.manual.take().filter(|s| !e.marks.iter().any(|r| &r.sig == s)) {
        e.marks.push(Ribbon { sig, color: default_color() });
    }
    e
}

fn write(store: &Path, e: &Entry) -> Result<()> {
    if e.marks.is_empty() && e.last.is_none() {
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

fn find(model: &DocModel, sig: &Sig) -> Option<u32> {
    model.comments.iter().find(|c| sig.is(c)).map(|c| c.id)
}

fn place_of(model: &DocModel, e: &Entry) -> Place {
    Place {
        marks: e.marks.iter().filter_map(|r| Some(Mark { id: find(model, &r.sig)?, color: r.color.clone() })).collect(),
        last: e.last.as_ref().and_then(|s| find(model, s)),
    }
}

/// Les rubans et le dernier fil ouvert, retrouvés dans `model`.
pub fn place(doc: &Path, model: &DocModel) -> Place {
    place_of(model, &read(&store_for(doc)))
}

/// Ce que le panneau demande.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Action {
    /// Pose un ruban sur le fil, ou change sa couleur.
    Set(u32, String),
    /// Retire le ruban du fil.
    Clear(u32),
    /// Note le dernier fil ouvert.
    Opened(u32),
}

/// Vrai si `color` est une teinte du menu.
pub fn is_color(color: &str) -> bool {
    COLORS.contains(&color)
}

/// Applique `action` et rend la nouvelle place. Un fil inconnu (déjà
/// supprimé) ou une teinte hors palette ne change rien.
pub fn update(doc: &Path, model: &DocModel, action: Action) -> Result<Place> {
    let store = store_for(doc);
    let lock = crate::lock_file(doc)?;
    lock.lock()?;
    let mut e = read(&store);
    let head = |id: u32| model.comments.iter().find(|c| c.id == id && c.parent.is_none()).map(Sig::of);
    let before = e.clone();
    match action {
        Action::Set(id, color) => {
            if let (Some(sig), true) = (head(id), is_color(&color)) {
                match e.marks.iter_mut().find(|r| r.sig == sig) {
                    Some(r) => r.color = color,
                    None => e.marks.push(Ribbon { sig, color }),
                }
            }
        }
        Action::Clear(id) => {
            if let Some(sig) = head(id) {
                e.marks.retain(|r| r.sig != sig);
            }
        }
        Action::Opened(id) => {
            if let Some(s) = head(id) {
                e.last = Some(s);
            }
        }
    }
    // Un ancien fichier (signet unique) se réécrit au nouveau format.
    let legacy = std::fs::read(&store).ok().is_some_and(|b| b.windows(9).any(|w| w == b"\"manual\":"));
    if e != before || legacy {
        write(&store, &e)?;
    }
    Ok(place_of(model, &e))
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

    fn mk(id: u32, color: &str) -> Mark {
        Mark { id, color: color.into() }
    }

    #[test]
    fn des_rubans_de_couleur_qui_suivent_les_fils_quand_word_renumerote() {
        let (_d, doc) = doc();
        let m = model(vec![
            c(1, "Christophe", "2026-10-14T09:00:00Z", "Pourquoi 0,6 et pas 0,5 ?", None),
            c(2, "Thierry", "2026-10-15T09:00:00Z", "D'accord.", Some(1)),
            // Deux fils de la même seconde : le texte les distingue.
            c(3, "Christophe", "2026-11-15T09:00:00Z", "Donner l'écart moyen.", None),
            c(4, "Christophe", "2026-11-15T09:00:00Z", "Préciser la collection.", None),
        ]);
        assert_eq!(place(&doc, &m), Place::default());
        assert_eq!(update(&doc, &m, Action::Set(3, "gris".into())).unwrap().marks, vec![mk(3, "gris")]);
        // Plusieurs rubans par document ; recolorer ne duplique pas.
        update(&doc, &m, Action::Set(4, "rouge".into())).unwrap();
        assert_eq!(update(&doc, &m, Action::Set(3, "bleu".into())).unwrap().marks, vec![mk(3, "bleu"), mk(4, "rouge")]);
        // Une réponse ne porte pas de ruban ; une teinte hors palette non plus.
        update(&doc, &m, Action::Set(2, "vert".into())).unwrap();
        assert_eq!(update(&doc, &m, Action::Set(1, "orange".into())).unwrap().marks.len(), 2);
        assert_eq!(update(&doc, &m, Action::Opened(1)).unwrap().last, Some(1));
        // Word renumérote : la signature retrouve les fils.
        let renum = model(vec![
            c(10, "Christophe", "2026-11-15T09:00:00Z", "Préciser la collection.", None),
            c(11, "Christophe", "2026-10-14T09:00:00Z", "Pourquoi 0,6 et pas 0,5 ?", None),
        ]);
        assert_eq!(place(&doc, &renum), Place { marks: vec![mk(10, "rouge")], last: Some(11) });
        assert_eq!(update(&doc, &renum, Action::Clear(10)).unwrap(), Place { marks: vec![], last: Some(11) });
        // Le ruban du fil absent (3) reste gardé pour un retour du fil.
        assert_eq!(place(&doc, &m).marks, vec![mk(3, "bleu")]);
    }

    #[test]
    fn rien_a_garder_rien_sur_le_disque() {
        let (_d, doc) = doc();
        let m = model(vec![c(1, "Christophe", "2026-10-14T09:00:00Z", "Texte", None)]);
        update(&doc, &m, Action::Set(1, "jaune".into())).unwrap();
        assert!(store_for(&doc).exists());
        update(&doc, &m, Action::Clear(1)).unwrap();
        assert!(!store_for(&doc).exists());
        // Un fil inconnu ne pose rien.
        update(&doc, &m, Action::Set(99, "gris".into())).unwrap();
        assert!(!store_for(&doc).exists());
        assert!(!doc.with_file_name("signet.json").exists(), "jamais à côté du document");
    }

    #[test]
    fn l_ancien_signet_unique_devient_un_ruban_gris() {
        let (_d, doc) = doc();
        let m = model(vec![c(1, "Christophe", "2026-10-14T09:00:00Z", "Texte", None)]);
        let store = store_for(&doc);
        std::fs::create_dir_all(store.parent().unwrap()).unwrap();
        std::fs::write(&store, br#"{"manual":{"author":"Christophe","date":"2026-10-14T09:00:00Z","text":"Texte"}}"#).unwrap();
        assert_eq!(place(&doc, &m).marks, vec![mk(1, "gris")]);
        update(&doc, &m, Action::Opened(1)).unwrap();
        let s = std::fs::read_to_string(&store).unwrap();
        assert!(s.contains("\"marks\"") && !s.contains("\"manual\""), "{s}");
    }
}
