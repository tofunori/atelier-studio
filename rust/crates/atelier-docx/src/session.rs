//! Séance du panneau : le document reste ouvert en mémoire, chaque retouche
//! s'y applique et se confirme sans relire ni réécrire le .docx.
//!
//! - **Journal avant écriture.** Chaque retouche est ajoutée à un journal
//!   (`seance.jsonl`, dans le dossier d'historique du document, jamais à
//!   côté de lui) et forcée sur le disque AVANT la réponse. Rien de ce que
//!   le panneau a vu confirmé ne se perd sur un arrêt brutal : au démarrage
//!   du serveur, à l'ouverture, ou avant toute écriture par un autre (agent,
//!   autre processus : [`settle`] sous le verrou du document), un journal en
//!   avance sur le fichier est rejoué puis écrit.
//! - **Écriture coalescée.** Le .docx est réécrit après [`IDLE`] sans
//!   retouche, au plus tard [`MAX_WAIT`] après la première en attente, ou à
//!   la demande ([`Session::flush`]), toujours avec le contrôle complet
//!   (relecture, défauts que Word refuserait) et l'écriture atomique. Chaque
//!   retouche reste un pas d'annulation à part dans l'historique.
//! - **Dernier état sain.** Si le contrôle refuse l'état à écrire, on écrit
//!   le dernier état qui passe (les retouches suivantes sont retirées) ;
//!   l'erreur est rendue au prochain appel. Aucun fichier abîmé n'est écrit.
//! - **Deux écrivains.** L'agent (autre processus) écrit sous le même verrou
//!   après [`settle`]. La séance compare à chaque appel la date, la taille
//!   et l'inode du fichier : s'il a changé, elle le relit, et la retouche
//!   calculée sur l'ancienne révision échoue en conflit (409).
//! - **Réponses en delta.** [`Session::apply`] rend ce qui change dans le
//!   modèle (plages de paragraphes, suivis, commentaires…) par rapport à la
//!   révision précédente : quelques Ko au lieu de tout le modèle.
//!
//! Les révisions de la séance sont virtuelles (`s…-n`) tant que rien n'est
//! relu du disque : le panneau les renvoie, la séance les compare.

use crate::history::{self, Chained, Origin};
use crate::model::{DocModel, Para};
use crate::ops::{self, Op};
use crate::{CONFLICT, Docx, DocxError, Result, Signature, err, format, lock_file, prepare, refuse_if_open_in_word, revision_of, write_atomic};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime};

/// Inactivité après laquelle les retouches en attente sont écrites.
pub const IDLE: Duration = Duration::from_millis(1500);
/// Attente maximale d'une retouche avant écriture, même en pleine frappe.
pub const MAX_WAIT: Duration = Duration::from_secs(10);
/// Au-delà, on écrit tout de suite.
const MAX_PENDING: usize = 200;
const JOURNAL: &str = "seance.jsonl";
const RESET: &str = "séance relue : ";

impl DocxError {
    /// La séance a dû revenir en arrière ou relire le disque : rien de ce
    /// que la retouche visait n'existe plus (à traiter comme un conflit).
    pub fn is_reset(&self) -> bool {
        self.0.starts_with(RESET)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "t", rename_all = "snake_case")]
enum Entry {
    /// Le fichier sur lequel les retouches qui suivent s'appliquent.
    Base { rev: String, path: String, at: String },
    Op { op: Value, tracked: bool, author: String, initials: String, date: String, date_utc: String, rev: String },
    /// Écriture du fichier en cours, à cette révision.
    Flush { rev: String },
}

/// Identité du fichier sur le disque : un autre écrivain la change.
#[derive(Clone, Debug, PartialEq)]
struct Stamp {
    len: u64,
    modified: Option<SystemTime>,
    ino: u64,
}

fn stamp(path: &Path) -> Option<Stamp> {
    let m = std::fs::metadata(path).ok()?;
    #[cfg(unix)]
    let ino = std::os::unix::fs::MetadataExt::ino(&m);
    #[cfg(not(unix))]
    let ino = 0;
    Some(Stamp { len: m.len(), modified: m.modified().ok(), ino })
}

fn journal_of(path: &Path) -> PathBuf {
    history::dir_for(path).join(JOURNAL)
}

/// Force le journal sur le disque. Sur macOS, `fsync` simple (le contenu
/// part vers le disque ; survit à l'arrêt d'Atelier ou du système) plutôt
/// que `F_FULLFSYNC`, qui viderait le cache du disque entier à chaque frappe.
fn sync_journal(f: &File) -> std::io::Result<()> {
    #[cfg(target_vendor = "apple")]
    {
        use std::os::fd::AsRawFd;
        if unsafe { libc::fsync(f.as_raw_fd()) } != 0 {
            return Err(std::io::Error::last_os_error());
        }
        Ok(())
    }
    #[cfg(not(target_vendor = "apple"))]
    f.sync_data()
}

fn read_journal(path: &Path) -> Option<Vec<Entry>> {
    let text = std::fs::read_to_string(journal_of(path)).ok()?;
    // Une dernière ligne coupée (arrêt pendant l'ajout) n'avait pas été
    // confirmée : on s'arrête à la première ligne illisible.
    Some(text.lines().map_while(|l| serde_json::from_str::<Entry>(l).ok()).collect())
}

/// Met le journal de côté (`seance-mise-de-cote-<date>.jsonl`), jamais
/// effacé : ses retouches restent lisibles à la main.
fn set_aside(path: &Path) {
    let j = journal_of(path);
    let stamp = crate::iso_now().replace([':', '-'], "");
    let _ = std::fs::rename(&j, j.with_file_name(format!("seance-mise-de-cote-{stamp}.jsonl")));
}

fn drop_journal(path: &Path) {
    let _ = std::fs::remove_file(journal_of(path));
}

/// Verrou du document tenu le temps d'une portée.
struct Held<'a>(&'a File);

impl<'a> Held<'a> {
    fn new(f: &'a File) -> Result<Self> {
        f.lock()?;
        Ok(Held(f))
    }
}

impl Drop for Held<'_> {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

/// Un état de la séance pas encore écrit : celui d'après une retouche.
#[derive(Clone)]
struct Pending {
    docx: Docx,
    rev: String,
    label: String,
    author: String,
}

/// Ce qu'une retouche rend au panneau.
#[derive(Debug)]
pub struct Applied {
    pub result: Value,
    pub revision: String,
    /// Changements du modèle depuis la révision envoyée (`base`).
    pub delta: Value,
}

pub struct Session {
    path: PathBuf,
    lock: File,
    /// Le fichier tel que la séance l'a lu ou écrit en dernier.
    disk: Arc<Vec<u8>>,
    disk_rev: String,
    stamp: Option<Stamp>,
    docx: Docx,
    model: DocModel,
    styles: Value,
    rev: String,
    nonce: String,
    counter: u64,
    pending: Vec<Pending>,
    first_pending: Option<Instant>,
    last_change: Instant,
    last_use: Instant,
    /// Erreur à rendre au prochain appel (retour au dernier état sain).
    error: Option<String>,
}

fn styles_of(docx: &mut Docx) -> Result<Value> {
    Ok(json!(format::styles(docx)?))
}

impl Session {
    /// Ouvre le document : refus si Word l'a ouvert, retouches d'une séance
    /// interrompue rejouées d'abord.
    pub fn open(path: &Path) -> Result<Session> {
        let path = path.canonicalize()?;
        let lock = lock_file(&path)?;
        let held = Held::new(&lock)?;
        refuse_if_open_in_word(&path)?;
        settle(&path)?;
        let bytes = Arc::new(std::fs::read(&path)?);
        let st = stamp(&path);
        drop(held);
        let mut docx = Docx::from_bytes(bytes.to_vec())?;
        let disk_rev = docx.revision();
        let mut model = docx.model()?;
        model.revision = disk_rev.clone();
        let styles = styles_of(&mut docx)?;
        let nonce = format!("s{:x}", SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        let now = Instant::now();
        Ok(Session {
            path,
            lock,
            disk: bytes,
            disk_rev: disk_rev.clone(),
            stamp: st,
            docx,
            model,
            styles,
            rev: disk_rev,
            nonce,
            counter: 0,
            pending: Vec::new(),
            first_pending: None,
            last_change: now,
            last_use: now,
            error: None,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Révision montrée au panneau.
    pub fn revision(&self) -> &str {
        &self.rev
    }

    pub fn model(&self) -> &DocModel {
        &self.model
    }

    pub fn styles(&self) -> &Value {
        &self.styles
    }

    /// Le document en mémoire (images d'un paragraphe…).
    pub fn docx_mut(&mut self) -> &mut Docx {
        &mut self.docx
    }

    pub fn pending(&self) -> usize {
        self.pending.len()
    }

    /// Des retouches attendent et c'est le moment de les écrire.
    pub fn due(&self, now: Instant) -> bool {
        !self.pending.is_empty()
            && (now.duration_since(self.last_change) >= IDLE || self.first_pending.is_some_and(|t| now.duration_since(t) >= MAX_WAIT) || self.pending.len() >= MAX_PENDING)
    }

    /// Temps depuis le dernier appel du panneau.
    pub fn idle_for(&self, now: Instant) -> Duration {
        now.duration_since(self.last_use)
    }

    fn next_rev(&mut self) -> String {
        self.counter += 1;
        format!("{}-{}", self.nonce, self.counter)
    }

    /// Applique une retouche (`raw` : l'op JSON du panneau) en mémoire,
    /// l'ajoute au journal et rend le delta du modèle. `expected` : révision
    /// affichée par le panneau ; autre que celle de la séance = conflit.
    pub fn apply(&mut self, expected: Option<&str>, raw: &Value, tracked: bool, sig: &Signature) -> Result<Applied> {
        self.last_use = Instant::now();
        let lock = self.lock.try_clone()?;
        let _held = Held::new(&lock)?;
        refuse_if_open_in_word(&self.path)?;
        self.sync_locked()?;
        if let Some(e) = self.error.take() {
            return Err(DocxError(format!("{RESET}{e}")));
        }
        if expected.is_some_and(|e| e != self.rev) {
            return err(CONFLICT);
        }
        let op: Op = serde_json::from_value(raw.clone()).map_err(|e| DocxError(format!("retouche illisible : {e}")))?;
        let before = self.docx.clone();
        let edits = self.docx.edits();
        let result = match ops::apply(&mut self.docx, &op, tracked, sig) {
            Ok(v) => v,
            Err(e) => {
                self.docx = before;
                return Err(e);
            }
        };
        let base = self.rev.clone();
        if self.docx.edits() == edits {
            return Ok(Applied { result, revision: base.clone(), delta: json!({"base": base, "revision": base}) });
        }
        // Le modèle se construit avant de confirmer : un paquet que l'on ne
        // sait plus lire n'est jamais confirmé.
        let rev = self.next_rev();
        let built = self.docx.model().and_then(|mut m| {
            m.revision = rev.clone();
            Ok((m, styles_of(&mut self.docx)?))
        });
        let (model, styles) = match built {
            Ok(x) => x,
            Err(e) => {
                self.docx = before;
                return Err(e);
            }
        };
        let entry = Entry::Op {
            op: raw.clone(),
            tracked,
            author: sig.author.clone(),
            initials: sig.initials.clone(),
            date: sig.date.clone(),
            date_utc: sig.date_utc.clone(),
            rev: rev.clone(),
        };
        if let Err(e) = self.append(&entry) {
            self.docx = before;
            return Err(e);
        }
        let delta = delta(&self.model, &model, &self.styles, &styles, &base);
        self.model = model;
        self.styles = styles;
        self.rev = rev.clone();
        self.pending.push(Pending { docx: self.docx.clone(), rev: rev.clone(), label: op.label().to_string(), author: sig.author.clone() });
        let now = Instant::now();
        self.first_pending.get_or_insert(now);
        self.last_change = now;
        Ok(Applied { result, revision: rev, delta })
    }

    /// Ajoute au journal (créé avec sa base au premier ajout) et le force
    /// sur le disque.
    fn append(&self, entry: &Entry) -> Result<()> {
        let jpath = journal_of(&self.path);
        let mut text = String::new();
        let fresh = self.pending.is_empty() || !jpath.is_file();
        if fresh {
            let base = Entry::Base { rev: self.disk_rev.clone(), path: self.path.to_string_lossy().into_owned(), at: crate::iso_now() };
            text.push_str(&serde_json::to_string(&base).map_err(|e| DocxError(e.to_string()))?);
            text.push('\n');
            if !self.pending.is_empty() {
                // Journal disparu en cours de séance : les retouches en
                // attente y reviennent.
                return err("journal de la séance introuvable : rien n'a été confirmé ; recharger le document");
            }
        }
        text.push_str(&serde_json::to_string(entry).map_err(|e| DocxError(e.to_string()))?);
        text.push('\n');
        if let Some(dir) = jpath.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let mut f = std::fs::OpenOptions::new().create(true).append(!fresh).write(true).truncate(fresh).open(&jpath)?;
        f.write_all(text.as_bytes())?;
        sync_journal(&f)?;
        #[cfg(all(unix, not(target_vendor = "apple")))]
        if fresh && let Some(dir) = jpath.parent() && let Ok(d) = File::open(dir) {
            let _ = d.sync_all();
        }
        Ok(())
    }

    /// Le fichier a-t-il changé hors de la séance ? Alors on le relit (et
    /// l'on rend le delta du modèle), sinon `None`.
    pub fn sync(&mut self) -> Result<Option<Value>> {
        self.last_use = Instant::now();
        if stamp(&self.path) == self.stamp {
            return Ok(None);
        }
        let lock = self.lock.try_clone()?;
        let _held = Held::new(&lock)?;
        let base = self.rev.clone();
        let (old_model, old_styles) = (self.model.clone(), self.styles.clone());
        if !self.sync_locked()? {
            return Ok(None);
        }
        Ok(Some(delta(&old_model, &self.model, &old_styles, &self.styles, &base)))
    }

    /// Sous le verrou : relit le fichier s'il a changé ; `true` si relu.
    fn sync_locked(&mut self) -> Result<bool> {
        let now = stamp(&self.path);
        if now == self.stamp {
            return Ok(false);
        }
        let bytes = std::fs::read(&self.path)?;
        let rev = revision_of(&bytes);
        if rev == self.disk_rev {
            self.stamp = now;
            return Ok(false);
        }
        if !self.pending.is_empty() {
            // Nos retouches en attente : écrites par un autre (journal
            // rejoué), ou perdues sous l'écriture d'un autre programme.
            let settled = match read_journal(&self.path) {
                None => true,
                Some(entries) => !entries.iter().any(|e| matches!(e, Entry::Op { .. })),
            };
            if !settled {
                set_aside(&self.path);
                self.error = Some(format!(
                    "le document a été remplacé (Word ou un autre programme) alors que {} retouche(s) attendaient d'être écrites : elles sont gardées à part dans {} ; le document est relu.",
                    self.pending.len(),
                    history::dir_for(&self.path).display()
                ));
            }
        }
        self.reload(bytes, now)?;
        Ok(true)
    }

    fn reload(&mut self, bytes: Vec<u8>, st: Option<Stamp>) -> Result<()> {
        let mut docx = Docx::from_bytes(bytes)?;
        let rev = docx.revision();
        let mut model = docx.model()?;
        model.revision = rev.clone();
        self.styles = styles_of(&mut docx)?;
        self.disk = docx.bytes.clone();
        self.disk_rev = rev.clone();
        self.stamp = st;
        self.docx = docx;
        self.model = model;
        self.rev = rev;
        self.pending.clear();
        self.first_pending = None;
        Ok(())
    }

    /// Écrit les retouches en attente (contrôle complet, écriture atomique,
    /// un pas d'historique par retouche). Word ouvert : rien n'est écrit,
    /// elles restent dans le journal.
    pub fn flush(&mut self) -> Result<()> {
        if self.pending.is_empty() {
            return Ok(());
        }
        let lock = self.lock.try_clone()?;
        let _held = Held::new(&lock)?;
        if crate::open_in_word(&self.path) {
            return Ok(());
        }
        self.sync_locked()?;
        if self.pending.is_empty() {
            return Ok(());
        }
        let written = write_states(&self.path, &self.disk, &self.disk_rev, &self.pending)?;
        let n = self.pending.len();
        match written {
            Some((k, fresh, model)) => {
                if k < n {
                    let kept = &self.pending[k - 1];
                    self.error = Some(format!(
                        "« {} » aurait laissé un défaut que Word refuserait : {} retouche(s) retirée(s), le document est revenu au dernier état sain ; elles sont gardées à part dans {}.",
                        self.pending[k].label,
                        n - k,
                        history::dir_for(&self.path).display()
                    ));
                    self.rev = kept.rev.clone();
                    let mut model = model;
                    model.revision = self.rev.clone();
                    self.model = model;
                }
                self.disk = fresh.bytes.clone();
                self.disk_rev = fresh.revision();
                self.docx = fresh;
                self.styles = styles_of(&mut self.docx)?;
                self.stamp = stamp(&self.path);
                self.pending.clear();
                self.first_pending = None;
            }
            None => {
                self.error = Some(format!("aucune des {n} retouche(s) en attente ne passait le contrôle : le document est revenu à la version enregistrée."));
                set_aside(&self.path);
                let bytes = std::fs::read(&self.path)?;
                let st = stamp(&self.path);
                self.reload(bytes, st)?;
            }
        }
        Ok(())
    }

    /// Erreur en attente (retour au dernier état sain), rendue une fois.
    pub fn take_error(&mut self) -> Option<String> {
        self.error.take()
    }
}

/// Écrit le dernier état de `states` qui passe le contrôle (du plus récent
/// au plus ancien) et note chaque état jusqu'à lui dans l'historique. Rend
/// le nombre d'états gardés, le document écrit et son modèle ; `None` si
/// aucun ne passe. Sous le verrou du document.
fn write_states(path: &Path, disk: &[u8], disk_rev: &str, states: &[Pending]) -> Result<Option<(usize, Docx, DocModel)>> {
    let mut chosen = None;
    for k in (1..=states.len()).rev() {
        match prepare(&states[k - 1].docx, disk, disk_rev) {
            Ok((fresh, model)) => {
                chosen = Some((k, fresh, model));
                break;
            }
            Err(e) => eprintln!("atelier-docx : séance de {} : état {k} refusé : {e}", path.display()),
        }
    }
    let Some((k, fresh, model)) = chosen else { return Ok(None) };
    let rev = fresh.revision();
    // Le journal sait qu'une écriture à cette révision est en cours : après
    // un arrêt brutal, un fichier déjà à `rev` n'est pas rejoué deux fois.
    let jpath = journal_of(path);
    if jpath.is_file() {
        let mut f = std::fs::OpenOptions::new().append(true).open(&jpath)?;
        f.write_all(format!("{}\n", serde_json::to_string(&Entry::Flush { rev: rev.clone() }).unwrap_or_default()).as_bytes())?;
        sync_journal(&f)?;
    }
    write_atomic(path, &fresh.bytes)?;
    // Un pas d'annulation par retouche : les états intermédiaires sont
    // reconstitués depuis la mémoire.
    let mut bytes: Vec<Vec<u8>> = Vec::with_capacity(k);
    for st in &states[..k - 1] {
        bytes.push(st.docx.to_bytes()?);
    }
    let mut steps: Vec<Chained> = Vec::with_capacity(k);
    for (i, st) in states[..k].iter().enumerate() {
        let (b, r) = if i + 1 == k { (fresh.original_bytes(), rev.clone()) } else { (bytes[i].as_slice(), revision_of(&bytes[i])) };
        steps.push(Chained { bytes: b, rev: r, origin: Origin { source: "panneau", author: &st.author, label: &st.label } });
    }
    if let Err(e) = history::record_steps(path, disk, disk_rev, &steps) {
        eprintln!("atelier-docx : historique non tenu pour {} : {e}", path.display());
    }
    // Retouches retirées (refusées par le contrôle) : leur journal est gardé
    // à part, jamais effacé, pour qu'aucune frappe ne se perde.
    if k < states.len() { set_aside(path) } else { drop_journal(path) }
    Ok(Some((k, fresh, model)))
}

/// Rejoue et écrit les retouches d'une séance restées dans le journal
/// (arrêt brutal, ou séance d'un autre processus), si le fichier est encore
/// celui sur lequel elles s'appliquent. Sinon le journal est mis de côté.
/// Appelé sous le verrou du document.
pub fn settle(path: &Path) -> Result<()> {
    // Word a le document ouvert : rien n'est écrit (son prochain
    // enregistrement l'écraserait) ; le journal attend.
    if crate::open_in_word(path) {
        return Ok(());
    }
    let Some(entries) = read_journal(path) else { return Ok(()) };
    let ops: Vec<&Entry> = entries.iter().filter(|e| matches!(e, Entry::Op { .. })).collect();
    let bytes = std::fs::read(path)?;
    let rev = revision_of(&bytes);
    let base = entries.iter().find_map(|e| if let Entry::Base { rev, .. } = e { Some(rev.clone()) } else { None });
    let flushed = matches!(entries.last(), Some(Entry::Flush { rev: r }) if *r == rev);
    if ops.is_empty() || flushed {
        drop_journal(path);
        return Ok(());
    }
    if base.as_deref() != Some(rev.as_str()) {
        eprintln!("atelier-docx : {} a changé depuis la séance interrompue : journal mis de côté", path.display());
        set_aside(path);
        return Ok(());
    }
    let mut docx = Docx::from_bytes(bytes.clone())?;
    let mut states: Vec<Pending> = Vec::new();
    let mut set_aside_after = false;
    for e in ops {
        let Entry::Op { op, tracked, author, initials, date, date_utc, rev } = e else { continue };
        let sig = Signature { author: author.clone(), initials: initials.clone(), date: date.clone(), date_utc: date_utc.clone() };
        let parsed: Option<Op> = serde_json::from_value(op.clone()).ok();
        let Some(parsed) = parsed else { break };
        // Rejouée à l'identique, une retouche ne devrait pas échouer : sinon
        // on garde ce qui précède (le journal entier est mis de côté).
        if ops::apply(&mut docx, &parsed, *tracked, &sig).is_err() {
            set_aside_after = true;
            break;
        }
        states.push(Pending { docx: docx.clone(), rev: rev.clone(), label: parsed.label().to_string(), author: author.clone() });
    }
    if states.is_empty() {
        set_aside(path);
        return Ok(());
    }
    if set_aside_after {
        let j = journal_of(path);
        let _ = std::fs::copy(&j, j.with_file_name(format!("seance-mise-de-cote-{}.jsonl", crate::iso_now().replace([':', '-'], ""))));
    }
    match write_states(path, &bytes, &rev, &states)? {
        Some(_) => Ok(()),
        None => {
            set_aside(path);
            Ok(())
        }
    }
}

/// Au démarrage : rejoue les séances interrompues de tous les documents.
pub fn recover_all() {
    let Ok(dirs) = std::fs::read_dir(history::root()) else { return };
    for d in dirs.flatten() {
        let j = d.path().join(JOURNAL);
        let Ok(text) = std::fs::read_to_string(&j) else { continue };
        let Some(Ok(Entry::Base { path, .. })) = text.lines().next().map(serde_json::from_str::<Entry>) else { continue };
        let path = PathBuf::from(path);
        if !path.is_file() {
            continue;
        }
        let Ok(lock) = lock_file(&path) else { continue };
        let Ok(_held) = Held::new(&lock) else { continue };
        if let Err(e) = settle(&path) {
            eprintln!("atelier-docx : séance interrompue de {} non rejouée : {e}", path.display());
        }
    }
}

/// Deux paragraphes identiques, à leur rang près (`id` = `p<rang>`).
fn same_para(a: &Para, b: &Para) -> bool {
    if a.id == b.id {
        return a == b;
    }
    a.para_id == b.para_id && a.text == b.text && *a == Para { id: a.id.clone(), ..b.clone() }
}

/// Ce qui remplace `a` par `b` : `{start, remove, insert}` (préfixe et
/// suffixe communs ôtés), ou `None` si rien ne change.
fn splice<T: Serialize>(a: &[T], b: &[T], same: impl Fn(&T, &T) -> bool) -> Option<Value> {
    if a.len() == b.len() && a.iter().zip(b).all(|(x, y)| same(x, y)) {
        return None;
    }
    let mut start = 0;
    while start < a.len() && start < b.len() && same(&a[start], &b[start]) {
        start += 1;
    }
    let mut end = 0;
    while end < a.len() - start && end < b.len() - start && same(&a[a.len() - 1 - end], &b[b.len() - 1 - end]) {
        end += 1;
    }
    Some(json!({"start": start, "remove": a.len() - start - end, "insert": &b[start..b.len() - end]}))
}

/// Delta du modèle `a` (révision `base`) au modèle `b` : les listes longues
/// en plages à remplacer, le reste en entier quand il change. Les
/// paragraphes du corps se renumérotent (`p<rang>`) après application.
pub fn delta(a: &DocModel, b: &DocModel, styles_a: &Value, styles_b: &Value, base: &str) -> Value {
    let mut d = json!({"base": base, "revision": b.revision});
    if let Some(s) = splice(&a.paragraphs, &b.paragraphs, same_para) {
        d["paragraphs"] = s;
    }
    if let Some(s) = splice(&a.changes, &b.changes, |x, y| x == y) {
        d["changes"] = s;
    }
    if let Some(s) = splice(&a.comments, &b.comments, |x, y| x == y) {
        d["comments"] = s;
    }
    if a.notes != b.notes {
        d["notes"] = json!(b.notes);
    }
    if a.headers != b.headers {
        d["headers"] = json!(b.headers);
    }
    if a.authors != b.authors {
        d["authors"] = json!(b.authors);
    }
    if a.other_parts != b.other_parts {
        d["other_parts"] = json!(b.other_parts);
    }
    if a.page != b.page {
        d["page"] = json!(b.page);
    }
    if styles_a != styles_b {
        d["styles"] = styles_b.clone();
    }
    d
}

/// Applique un delta à un modèle en JSON (tel que le panneau le reçoit) ;
/// `None` si le delta ne part pas de sa révision. Sert aux tests ; le
/// panneau fait de même en TypeScript.
pub fn apply_delta(model: &Value, d: &Value) -> Option<Value> {
    if model.get("revision")? != d.get("base")? {
        return None;
    }
    let mut m = model.clone();
    for key in ["paragraphs", "changes", "comments"] {
        if let Some(s) = d.get(key) {
            let list = m.get_mut(key)?.as_array_mut()?;
            let start = s.get("start")?.as_u64()? as usize;
            let remove = s.get("remove")?.as_u64()? as usize;
            if start + remove > list.len() {
                return None;
            }
            let insert = s.get("insert")?.as_array()?.clone();
            list.splice(start..start + remove, insert);
        }
    }
    if let Some(list) = m.get_mut("paragraphs").and_then(Value::as_array_mut) {
        for (i, p) in list.iter_mut().enumerate() {
            p["id"] = json!(format!("p{i}"));
        }
    }
    for key in ["notes", "headers", "authors", "other_parts", "page", "styles"] {
        if let Some(v) = d.get(key) {
            m[key] = v.clone();
        }
    }
    m["revision"] = d["revision"].clone();
    Some(m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn un_etat_qui_ajouterait_un_defaut_n_est_jamais_ecrit() {
        history::set_root(std::env::temp_dir().join(format!("atelier-docx-seance-unit-{}", std::process::id())));
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.docx");
        std::fs::write(&path, crate::new::create(crate::new::Template::Article).unwrap()).unwrap();
        let rev0 = revision_of(&std::fs::read(&path).unwrap());
        let mut s = Session::open(&path).unwrap();
        let sig = Signature::now("Thierry");
        let a = s.apply(Some(&rev0), &json!({"op": "insert", "paragraph": "p0", "at": 0, "with": "Sain "}), true, &sig).unwrap();
        // Un état abîmé (borne de commentaire orpheline) arrive ensuite.
        let mut bad = s.docx.clone();
        let xml = bad.document_xml().replacen("<w:body>", "<w:body><w:p><w:commentRangeStart w:id=\"9999\"/></w:p>", 1);
        bad.set_part(crate::DOCUMENT, xml);
        s.pending.push(Pending { docx: bad, rev: "abime".into(), label: "geste abîmé".into(), author: "Thierry".into() });
        s.rev = "abime".into();
        s.flush().unwrap();
        let on_disk = Docx::open(&path).unwrap().model().unwrap();
        assert!(on_disk.paragraphs[0].text.starts_with("Sain "), "le dernier état sain est écrit");
        assert!(!Docx::open(&path).unwrap().document_xml().contains("9999"));
        assert_eq!(s.revision(), a.revision);
        let e = s.apply(Some("abime"), &json!({"op": "insert", "paragraph": "p0", "at": 0, "with": "x"}), true, &sig).unwrap_err();
        assert!(e.is_reset() && e.0.contains("geste abîmé"), "{e}");
    }
}
