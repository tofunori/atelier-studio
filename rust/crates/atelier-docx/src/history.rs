//! Historique sur disque de chaque document : copie des versions reçues de
//! l'extérieur (l'original, puis chaque nouvelle ronde) et pile
//! annuler / rétablir qui survit à la relance d'Atelier et couvre aussi les
//! retouches de l'agent.
//!
//! Tout vit HORS du dossier du document (jamais à côté de la thèse) :
//! `~/Library/Application Support/atelier-studio/docx-historique/<empreinte
//! du chemin>/`, avec `chemin.txt`, `journal.json` et un fichier par version
//! (`<révision>.docx`). Les écritures se font sous le verrou du document.

use crate::{DocxError, Result, err, revision_of, write_atomic};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// Pas d'annulation gardés par document, et leur poids maximal.
const MAX_STEPS: usize = 60;
const MAX_STEP_BYTES: u64 = 600 * 1024 * 1024;
/// Versions reçues gardées : la toute première, puis les plus récentes.
const MAX_BASES: usize = 12;
/// Un historique dont le document a disparu depuis tout ce temps est jeté.
const ORPHAN_DAYS: u64 = 7;

static ROOT: RwLock<Option<PathBuf>> = RwLock::new(None);

/// Dossier racine des historiques (tests, ou réglage de l'app).
pub fn set_root(dir: PathBuf) {
    *ROOT.write().unwrap_or_else(|e| e.into_inner()) = Some(dir);
}

/// `ATELIER_DOCX_HISTORY`, sinon le dossier de l'app dans
/// ~/Library/Application Support (macOS) ou ~/.local/share.
pub fn root() -> PathBuf {
    if let Some(r) = ROOT.read().unwrap_or_else(|e| e.into_inner()).clone() {
        return r;
    }
    if let Some(d) = std::env::var_os("ATELIER_DOCX_HISTORY").filter(|d| !d.is_empty()) {
        return PathBuf::from(d);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from);
    match home {
        Some(h) if cfg!(target_os = "macos") => h.join("Library/Application Support/atelier-studio/docx-historique"),
        Some(h) => std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| h.join(".local/share")).join("atelier-studio/docx-historique"),
        None => std::env::temp_dir().join("atelier-studio-docx-historique"),
    }
}

/// Qui a fait une retouche, et laquelle (pour « Annulé : … »).
#[derive(Clone, Debug)]
pub struct Origin<'a> {
    /// `panneau`, `agent`, `atelier`…
    pub source: &'a str,
    pub author: &'a str,
    pub label: &'a str,
}

impl Origin<'_> {
    pub const UNKNOWN: Origin<'static> = Origin { source: "atelier", author: "", label: "retouche" };
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Step {
    /// Révision du fichier après la retouche.
    pub after: String,
    /// Révision d'avant, à remettre pour annuler (fichier `<before>.docx`).
    pub before: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub at: String,
}

/// Une version arrivée de l'extérieur (Word, un nouveau tour du relecteur),
/// copiée avant la première retouche d'Atelier.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Base {
    pub revision: String,
    pub at: String,
    pub bytes: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Journal {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub bases: Vec<Base>,
    #[serde(default)]
    pub undo: Vec<Step>,
    #[serde(default)]
    pub redo: Vec<Step>,
}

/// Dossier de l'historique d'un document (empreinte du chemin absolu).
pub fn dir_for(path: &Path) -> PathBuf {
    let canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    root().join(hex::encode(&Sha256::digest(canon.to_string_lossy().as_bytes())[..8]))
}

fn blob(dir: &Path, rev: &str) -> PathBuf {
    dir.join(format!("{rev}.docx"))
}

pub fn load(path: &Path) -> Journal {
    let dir = dir_for(path);
    std::fs::read(dir.join("journal.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn store(dir: &Path, j: &Journal) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    let text = serde_json::to_vec_pretty(j).map_err(|e| DocxError(format!("historique : {e}")))?;
    write_atomic(&dir.join("journal.json"), &text)
}

fn keep_blob(dir: &Path, rev: &str, bytes: &[u8]) -> Result<()> {
    let p = blob(dir, rev);
    if !p.is_file() {
        std::fs::create_dir_all(dir)?;
        write_atomic(&p, bytes)?;
    }
    Ok(())
}

/// Note une écriture d'Atelier : `before` (octets d'avant, révision
/// `before_rev`) remplacés par la révision `after`. Si le fichier d'avant
/// ne vient pas d'Atelier (premier passage, ou Word / un nouveau tour l'a
/// remplacé), il est d'abord copié comme version reçue, et la pile
/// d'annulation repart de zéro. Appelé sous le verrou du document.
pub(crate) fn record(path: &Path, before: &[u8], before_rev: &str, after: &str, origin: &Origin) -> Result<()> {
    let dir = dir_for(path);
    let mut j = load(path);
    j.path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf()).to_string_lossy().into_owned();
    if !is_ours(&j, before_rev) {
        if !j.bases.iter().any(|b| b.revision == before_rev) {
            j.bases.push(Base { revision: before_rev.to_string(), at: crate::iso_now(), bytes: before.len() as u64 });
        }
        j.undo.clear();
        j.redo.clear();
    }
    keep_blob(&dir, before_rev, before)?;
    j.undo.push(Step {
        after: after.to_string(),
        before: before_rev.to_string(),
        source: origin.source.to_string(),
        author: origin.author.to_string(),
        label: origin.label.to_string(),
        at: crate::iso_now(),
    });
    j.redo.clear();
    trim(&dir, &mut j);
    store(&dir, &j)?;
    collect(&dir, &j);
    if j.undo.len() == 1 {
        // Premier pas de cette session : l'occasion de ranger les autres.
        prune_orphans(&dir);
    }
    Ok(())
}

/// La révision `rev` est-elle le résultat connu d'une écriture d'Atelier ?
fn is_ours(j: &Journal, rev: &str) -> bool {
    j.undo.last().is_some_and(|s| s.after == rev) || j.redo.last().is_some_and(|s| s.after == rev)
}

fn trim(dir: &Path, j: &mut Journal) {
    let size = |s: &Step| std::fs::metadata(blob(dir, &s.before)).map(|m| m.len()).unwrap_or(0);
    while j.undo.len() > MAX_STEPS || (j.undo.len() > 1 && j.undo.iter().map(size).sum::<u64>() > MAX_STEP_BYTES) {
        j.undo.remove(0);
    }
    while j.bases.len() > MAX_BASES {
        j.bases.remove(1);
    }
}

/// Efface les versions que plus rien ne cite.
fn collect(dir: &Path, j: &Journal) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let live = |rev: &str| j.bases.iter().any(|b| b.revision == rev) || j.undo.iter().chain(&j.redo).any(|s| s.before == rev);
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if let Some(rev) = name.strip_suffix(".docx")
            && !live(rev)
        {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

/// Jette les historiques des documents disparus depuis longtemps (fichiers
/// d'essai, documents supprimés).
fn prune_orphans(current: &Path) {
    let Some(parent) = current.parent() else { return };
    let Ok(entries) = std::fs::read_dir(parent) else { return };
    let old = std::time::Duration::from_secs(ORPHAN_DAYS * 86_400);
    for e in entries.flatten() {
        let dir = e.path();
        if dir == current || !dir.is_dir() {
            continue;
        }
        let Some(j) = std::fs::read(dir.join("journal.json")).ok().and_then(|b| serde_json::from_slice::<Journal>(&b).ok()) else { continue };
        let gone = !j.path.is_empty() && !Path::new(&j.path).exists();
        let stale = std::fs::metadata(dir.join("journal.json")).and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|d| d > old);
        if gone && stale {
            let _ = std::fs::remove_dir_all(&dir);
        }
    }
}

/// Ce que l'historique sait du document.
#[derive(Debug, Serialize)]
pub struct Status {
    pub folder: String,
    pub bases: Vec<Base>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_label: Option<String>,
    pub redo_label: Option<String>,
}

pub fn status(path: &Path, current_rev: &str) -> Status {
    let j = load(path);
    let undo = j.undo.last().filter(|s| s.after == current_rev);
    let redo = j.redo.last().filter(|s| s.after == current_rev);
    Status {
        folder: dir_for(path).to_string_lossy().into_owned(),
        bases: j.bases.clone(),
        can_undo: undo.is_some(),
        can_redo: redo.is_some(),
        undo_label: undo.map(describe),
        redo_label: redo.map(describe),
    }
}

fn describe(s: &Step) -> String {
    match (s.source.as_str(), s.author.is_empty()) {
        ("agent", false) => format!("{} de {}", s.label, s.author),
        _ => s.label.clone(),
    }
}

/// Résultat d'un annuler / rétablir.
#[derive(Debug, Serialize)]
pub struct Undone {
    pub revision: String,
    /// Ce qui a été annulé (« frappe », « commentaire de Claude »…).
    pub label: String,
}

/// Annule (ou rétablit) le dernier pas, si le document est encore à la
/// révision `expected` affichée et que ce pas en est bien l'auteur.
pub fn undo(path: &Path, expected: &str, redo: bool) -> Result<Undone> {
    let lock = crate::lock_file(path)?;
    lock.lock()?;
    crate::refuse_if_open_in_word(path)?;
    let current = std::fs::read(path)?;
    let current_rev = revision_of(&current);
    if current_rev != expected {
        return err(crate::CONFLICT);
    }
    let dir = dir_for(path);
    let mut j = load(path);
    let stack = if redo { &mut j.redo } else { &mut j.undo };
    let Some(step) = stack.last().cloned() else {
        return err(if redo { "rien à rétablir" } else { "rien à annuler" });
    };
    if step.after != current_rev {
        return err("le document a changé hors d'Atelier depuis (Word ou un nouveau tour) : plus rien à annuler ici");
    }
    let bytes = std::fs::read(blob(&dir, &step.before)).map_err(|_| DocxError("la version d'avant manque dans l'historique".into()))?;
    if revision_of(&bytes) != step.before {
        return err("la version d'avant est abîmée dans l'historique : rien n'a été changé");
    }
    crate::Docx::from_bytes(bytes.clone())?;
    keep_blob(&dir, &current_rev, &current)?;
    write_atomic(path, &bytes)?;
    stack.pop();
    let back = Step { after: step.before.clone(), before: current_rev, ..step.clone() };
    if redo { j.undo.push(back) } else { j.redo.push(back) }
    trim(&dir, &mut j);
    store(&dir, &j)?;
    collect(&dir, &j);
    let label = describe(&step);
    Ok(Undone { revision: step.before, label })
}

/// Octets d'une version reçue gardée (pour la rouvrir ou la comparer).
pub fn base_bytes(path: &Path, revision: &str) -> Result<Vec<u8>> {
    let j = load(path);
    if !j.bases.iter().any(|b| b.revision == revision) {
        return err("version introuvable dans l'historique");
    }
    Ok(std::fs::read(blob(&dir_for(path), revision))?)
}
