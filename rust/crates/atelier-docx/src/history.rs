//! Historique sur disque de chaque document : copie des versions reçues de
//! l'extérieur (l'original, puis chaque nouvelle ronde) et pile
//! annuler / rétablir qui survit à la relance d'Atelier et couvre aussi les
//! retouches de l'agent.
//!
//! Tout vit HORS du dossier du document (jamais à côté de la thèse) :
//! `~/Library/Application Support/atelier-studio/docx-historique/<empreinte
//! du chemin>/`, avec `chemin.txt`, `journal.json` et un fichier par version
//! (`<révision>.docx`). Les écritures se font sous le verrou du document.
//!
//! Rien de ce qui compte ne se perd : chaque version reçue et chaque fin de
//! séance dans Atelier restent pour toujours (jalons) ; un journal illisible
//! est mis de côté, jamais remplacé à vide ; aucun historique n'est jeté
//! parce que son document a disparu ; un document déplacé retrouve le sien
//! par son contenu. Seuls les pas fins d'annulation au-delà de la fenêtre
//! (`MAX_STEPS`) cèdent leur place.

use crate::{DocxError, Result, err, revision_of, write_atomic, write_atomic_as};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// Pas d'annulation gardés par document, et leur poids maximal.
const MAX_STEPS: usize = 60;
const MAX_STEP_BYTES: u64 = 600 * 1024 * 1024;

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

/// Un état du document gardé pour toujours (fin d'une séance dans Atelier,
/// avant que Word ou un nouveau tour ne le remplace).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Milestone {
    pub revision: String,
    pub at: String,
    /// `seance` : dernier état laissé par Atelier.
    pub kind: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Journal {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub bases: Vec<Base>,
    #[serde(default)]
    pub milestones: Vec<Milestone>,
    /// Dernière révision écrite par Atelier (retouche, annuler, rétablir).
    #[serde(default)]
    pub last: String,
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

/// Lecture seule du journal (vide s'il manque ou ne se lit pas).
pub fn load(path: &Path) -> Journal {
    read_journal(&dir_for(path)).unwrap_or_default()
}

/// `None` si le journal existe mais ne se lit pas.
fn read_journal(dir: &Path) -> Option<Journal> {
    match std::fs::read(dir.join("journal.json")) {
        Err(_) => Some(Journal::default()),
        Ok(b) => serde_json::from_slice(&b).ok(),
    }
}

/// Journal à mettre à jour. Illisible, il est mis de côté
/// (`journal-illisible-<date>.json`) et rien de ce qu'il citait n'est
/// effacé : on repart d'un journal vide, à côté des anciennes versions.
fn open_journal(dir: &Path) -> Journal {
    if let Some(j) = read_journal(dir) {
        return j;
    }
    let stamp = crate::iso_now().replace([':', '-'], "");
    let _ = std::fs::rename(dir.join("journal.json"), dir.join(format!("journal-illisible-{stamp}.json")));
    Journal::default()
}

/// Dossier de l'historique du document, en reprenant celui d'un document
/// déplacé ou renommé : un historique dont le chemin n'existe plus et dont
/// le dernier état connu a exactement le contenu actuel (`rev`) est le sien.
pub fn attach(path: &Path, rev: &str) -> PathBuf {
    let dir = dir_for(path);
    if dir.join("journal.json").is_file() || rev.is_empty() {
        return dir;
    }
    let Ok(entries) = std::fs::read_dir(root()) else { return dir };
    for e in entries.flatten() {
        let old = e.path();
        if old == dir || !old.is_dir() {
            continue;
        }
        let Some(mut j) = std::fs::read(old.join("journal.json")).ok().and_then(|b| serde_json::from_slice::<Journal>(&b).ok()) else { continue };
        if j.path.is_empty() || Path::new(&j.path).exists() || !latest(&j).contains(&rev) {
            continue;
        }
        if dir.exists() || std::fs::rename(&old, &dir).is_err() {
            return dir;
        }
        j.path = canonical(path);
        let _ = store(&dir, &j);
        return dir;
    }
    dir
}

/// Les révisions où le document a pu être laissé en dernier : celle
/// qu'Atelier a écrite en dernier (journaux d'avant ce champ : le haut des
/// piles, ou la dernière version reçue).
fn latest(j: &Journal) -> Vec<&str> {
    if !j.last.is_empty() {
        return vec![j.last.as_str()];
    }
    let mut v: Vec<&str> = Vec::new();
    v.extend(j.undo.last().map(|s| s.after.as_str()));
    v.extend(j.redo.last().map(|s| s.after.as_str()));
    v.extend(j.bases.last().map(|b| b.revision.as_str()));
    v
}

fn canonical(path: &Path) -> String {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf()).to_string_lossy().into_owned()
}

/// Le journal n'est pas forcé sur le disque : l'écriture du document l'a
/// déjà été, et un journal perdu ou illisible après une coupure est mis de
/// côté sans rien effacer ([`open_journal`]).
fn store(dir: &Path, j: &Journal) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    let text = serde_json::to_vec_pretty(j).map_err(|e| DocxError(format!("historique : {e}")))?;
    write_atomic_as(&dir.join("journal.json"), &text, false)
}

/// Garde une version. `durable` : forcée sur le disque (version reçue de
/// l'extérieur, qui n'existe nulle part ailleurs) ; sinon elle double le
/// document, déjà forcé.
fn keep_blob(dir: &Path, rev: &str, bytes: &[u8], durable: bool) -> Result<()> {
    let p = blob(dir, rev);
    if !p.is_file() {
        std::fs::create_dir_all(dir)?;
        write_atomic_as(&p, bytes, durable)?;
    }
    Ok(())
}

/// Garde l'état que `path` vient de recevoir (`bytes`, révision `rev`) en le
/// clonant : sur APFS (`clonefile`) les données ne sont pas recopiées, ni
/// forcées sur le disque (le document l'a été). Sinon, copie ordinaire.
fn keep_clone(dir: &Path, rev: &str, path: &Path, bytes: &[u8]) -> Result<()> {
    let p = blob(dir, rev);
    if p.is_file() {
        return Ok(());
    }
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join(format!(".{rev}.clone-tmp"));
    let _ = std::fs::remove_file(&tmp);
    let cloned = std::fs::copy(path, &tmp).ok().is_some_and(|n| n == bytes.len() as u64) && std::fs::rename(&tmp, &p).is_ok();
    if !cloned {
        let _ = std::fs::remove_file(&tmp);
        write_atomic_as(&p, bytes, false)?;
    }
    Ok(())
}

/// Note une écriture d'Atelier : `before` (octets d'avant, révision
/// `before_rev`) remplacés par `after_bytes` (révision `after`). Si le
/// fichier d'avant ne vient pas d'Atelier (premier passage, ou Word / un
/// nouveau tour l'a remplacé), il est d'abord copié comme version reçue ;
/// le dernier état laissé par Atelier devient un jalon gardé pour toujours,
/// et la pile d'annulation repart de là. Appelé sous le verrou du document.
pub(crate) fn record(path: &Path, before: &[u8], before_rev: &str, after_bytes: &[u8], after: &str, origin: &Origin) -> Result<()> {
    let dir = attach(path, before_rev);
    let mut j = open_journal(&dir);
    j.path = canonical(path);
    let mut dropped = Vec::new();
    let received = !is_ours(&j, before_rev);
    if received {
        if !j.bases.iter().any(|b| b.revision == before_rev) {
            j.bases.push(Base { revision: before_rev.to_string(), at: crate::iso_now(), bytes: before.len() as u64 });
        }
        close_session(&dir, &mut j);
        dropped.extend(j.undo.drain(..).chain(j.redo.drain(..)));
    }
    // Une version reçue n'existe nulle part ailleurs : forcée sur le disque.
    // Sinon c'est l'état d'après du pas précédent, en général déjà gardé.
    keep_blob(&dir, before_rev, before, received)?;
    // L'état d'après est gardé aussi : si Word le remplace ensuite, la fin
    // de séance reste récupérable. Il double le document qu'on vient
    // d'écrire : cloné, sans recopie des données ni attente du disque.
    keep_clone(&dir, after, path, after_bytes)?;
    j.undo.push(Step {
        after: after.to_string(),
        before: before_rev.to_string(),
        source: origin.source.to_string(),
        author: origin.author.to_string(),
        label: origin.label.to_string(),
        at: crate::iso_now(),
    });
    dropped.append(&mut j.redo);
    j.last = after.to_string();
    dropped.extend(trim(&dir, &mut j));
    store(&dir, &j)?;
    forget(&dir, &j, &dropped);
    Ok(())
}

/// Le document a quitté Atelier (Word, un nouveau tour) : son dernier état
/// connu d'Atelier devient un jalon permanent, s'il est bien gardé.
fn close_session(dir: &Path, j: &mut Journal) {
    let last = if j.last.is_empty() { j.undo.last().map(|s| s.after.clone()).unwrap_or_default() } else { j.last.clone() };
    if last.is_empty() || j.bases.iter().any(|b| b.revision == last) || j.milestones.iter().any(|m| m.revision == last) || !blob(dir, &last).is_file() {
        return;
    }
    j.milestones.push(Milestone { revision: last, at: crate::iso_now(), kind: "seance".into(), label: "Fin de séance dans Atelier".into() });
}

/// La révision `rev` est-elle le résultat connu d'une écriture d'Atelier ?
fn is_ours(j: &Journal, rev: &str) -> bool {
    j.last == rev || j.undo.last().is_some_and(|s| s.after == rev) || j.redo.last().is_some_and(|s| s.after == rev)
}

/// Garde la fenêtre d'annulation ; rend les pas sortis.
fn trim(dir: &Path, j: &mut Journal) -> Vec<Step> {
    let size = |s: &Step| std::fs::metadata(blob(dir, &s.before)).map(|m| m.len()).unwrap_or(0);
    let mut out = Vec::new();
    while j.undo.len() > MAX_STEPS || (j.undo.len() > 1 && j.undo.iter().map(size).sum::<u64>() > MAX_STEP_BYTES) {
        out.push(j.undo.remove(0));
    }
    out
}

/// Une révision encore citée par le journal (version reçue, jalon, pas).
fn live(j: &Journal, rev: &str) -> bool {
    j.last == rev
        || j.bases.iter().any(|b| b.revision == rev)
        || j.milestones.iter().any(|m| m.revision == rev)
        || j.undo.iter().chain(&j.redo).any(|s| s.before == rev || s.after == rev)
}

/// Efface seulement les versions des pas qui viennent de sortir et que
/// plus rien ne cite. Un fichier que le journal ne connaît pas (par exemple
/// cité par un journal mis de côté) n'est jamais touché.
fn forget(dir: &Path, j: &Journal, dropped: &[Step]) {
    for s in dropped {
        for rev in [&s.before, &s.after] {
            if !live(j, rev) {
                let _ = std::fs::remove_file(blob(dir, rev));
            }
        }
    }
}

/// Ce que l'historique sait du document.
#[derive(Debug, Serialize)]
pub struct Status {
    pub folder: String,
    pub bases: Vec<Base>,
    pub milestones: Vec<Milestone>,
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_label: Option<String>,
    pub redo_label: Option<String>,
}

pub fn status(path: &Path, current_rev: &str) -> Status {
    let dir = attach(path, current_rev);
    let j = read_journal(&dir).unwrap_or_default();
    let undo = j.undo.last().filter(|s| s.after == current_rev);
    let redo = j.redo.last().filter(|s| s.after == current_rev);
    Status {
        folder: dir.to_string_lossy().into_owned(),
        bases: j.bases.clone(),
        milestones: j.milestones.clone(),
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
    let dir = attach(path, &current_rev);
    let mut j = open_journal(&dir);
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
    // Le document va être remplacé : sa copie doit tenir seule.
    keep_blob(&dir, &current_rev, &current, true)?;
    write_atomic(path, &bytes)?;
    stack.pop();
    let back = Step { after: step.before.clone(), before: current_rev, ..step.clone() };
    if redo { j.undo.push(back) } else { j.redo.push(back) }
    j.last = step.before.clone();
    let dropped = trim(&dir, &mut j);
    store(&dir, &j)?;
    forget(&dir, &j, &dropped);
    let label = describe(&step);
    Ok(Undone { revision: step.before, label })
}

/// Octets d'une version reçue ou d'un jalon gardés (pour les rouvrir ou
/// les comparer).
pub fn base_bytes(path: &Path, revision: &str) -> Result<Vec<u8>> {
    let j = load(path);
    if !j.bases.iter().any(|b| b.revision == revision) && !j.milestones.iter().any(|m| m.revision == revision) {
        return err("version introuvable dans l'historique");
    }
    Ok(std::fs::read(blob(&dir_for(path), revision))?)
}
