//! Lecture et retouche chirurgicale des .docx.
//!
//! Principe : le paquet (zip) et chaque partie XML restent identiques à
//! l'octet près, sauf les passages que l'on touche. Les retouches sont des
//! épissures de texte sur le XML d'origine (positions données par roxmltree),
//! jamais une resérialisation : styles, champs Zotero, figures, équations,
//! espaces de noms et attributs inconnus traversent l'aller-retour intacts.
//! Les entrées du zip non modifiées sont recopiées brutes (`raw_copy_file`).
//!
//! - [`model`] : vue du document (paragraphes, segments, suivis, commentaires).
//! - [`review`] : accepter ou refuser un suivi.
//! - [`edit`] : remplacer un passage, en suivi ou non.
//! - [`comments`] : ajouter, répondre, résoudre, supprimer un commentaire.
//! - [`drafts`] : brouillons de réponse de l'agent, hors du document.
//! - [`feedback`] : retour d'un relecteur posé sur le .tex dont le .docx est issu.
//! - [`structure`] : Entrée et retour arrière entre paragraphes.
//! - [`format`] : police, taille, gras…, style et alignement.
//! - [`ops`] : une retouche en JSON (panneau et agent), et le texte pour l'agent.
//! - [`objects`] : appels de note et figures insérés.
//! - [`table`] : lignes (en suivi) et colonnes de tableau.
//! - [`math`] : équations (OMML) ↔ LaTeX, et leur correction dans le document.
//! - [`paste`] : collage riche (mise en forme de base, équations).
//! - [`story`] : corps, notes, en-têtes et pieds de page, chacun dans sa partie.
//! - [`check`] : contrôle à chaque écriture (ce que Word refuserait).
//! - [`history`] : versions reçues et annuler / rétablir, sur disque.
//! - [`triage`] : tri des suivis par nature (fond, nombres, ponctuation, espaces).

pub mod check;
pub mod comments;
pub mod drafts;
pub mod edit;
pub mod feedback;
pub mod layout;
pub mod math;
pub mod model;
pub mod new;
pub mod objects;
pub mod review;
pub mod structure;
pub mod format;
pub mod history;
pub mod versions;
pub mod ops;
pub mod paste;
pub mod story;
pub mod table;
pub mod triage;
mod walk;
mod xml;

use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub use model::DocModel;

pub const DOCUMENT: &str = "word/document.xml";
pub const COMMENTS: &str = "word/comments.xml";
pub const COMMENTS_EXT: &str = "word/commentsExtended.xml";
pub(crate) const CONTENT_TYPES: &str = "[Content_Types].xml";

#[derive(Debug)]
pub struct DocxError(pub String);

impl fmt::Display for DocxError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for DocxError {}

impl From<zip::result::ZipError> for DocxError {
    fn from(e: zip::result::ZipError) -> Self {
        DocxError(format!("zip : {e}"))
    }
}

impl From<std::io::Error> for DocxError {
    fn from(e: std::io::Error) -> Self {
        DocxError(format!("fichier : {e}"))
    }
}

pub type Result<T> = std::result::Result<T, DocxError>;

pub(crate) fn err<T>(msg: impl Into<String>) -> Result<T> {
    Err(DocxError(msg.into()))
}

/// Auteur et date d'une retouche (suivi ou commentaire).
#[derive(Clone, Debug)]
pub struct Signature {
    pub author: String,
    pub initials: String,
    /// Comme Word : l'heure LOCALE suivie de « Z » (`2026-10-19T14:00:00Z`
    /// à Montréal pour 19 h UTC). Word l'affiche telle quelle : une vraie
    /// heure UTC paraîtrait décalée de 4 ou 5 h chez le relecteur.
    pub date: String,
    /// La vraie heure UTC, pour les parties qui la demandent
    /// (`commentsExtensible.xml`).
    pub date_utc: String,
}

impl Signature {
    pub fn now(author: &str) -> Self {
        Signature { author: author.to_string(), initials: initials(author), date: word_now(), date_utc: iso_now() }
    }
}

pub fn initials(name: &str) -> String {
    let s: String = name.split_whitespace().filter_map(|w| w.chars().find(|c| c.is_alphabetic())).collect();
    if s.is_empty() { "?".into() } else { s.to_uppercase() }
}

/// Date UTC courante, ISO 8601 sans fraction.
pub fn iso_now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Date courante telle que Word l'écrit dans `w:date` : heure locale, « Z ».
pub fn word_now() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Un .docx ouvert en mémoire. Les parties lues sont gardées en cache ;
/// seules les parties modifiées sont réécrites à l'enregistrement.
#[derive(Clone)]
pub struct Docx {
    bytes: Vec<u8>,
    names: Vec<String>,
    parts: BTreeMap<String, String>,
    dirty: BTreeSet<String>,
    /// Parties binaires ajoutées (figures insérées).
    binaries: BTreeMap<String, Vec<u8>>,
}

impl Docx {
    pub fn open(path: &Path) -> Result<Self> {
        Self::from_bytes(std::fs::read(path)?)
    }

    pub fn from_bytes(bytes: Vec<u8>) -> Result<Self> {
        let archive = ZipArchive::new(Cursor::new(bytes.as_slice()))?;
        let names: Vec<String> = archive.file_names().map(str::to_string).collect();
        if !names.iter().any(|n| n == DOCUMENT) {
            return err("ce fichier n'est pas un document Word (.docx) : word/document.xml manque");
        }
        let mut docx = Docx { bytes, names, parts: BTreeMap::new(), dirty: BTreeSet::new(), binaries: BTreeMap::new() };
        docx.load(DOCUMENT)?;
        Ok(docx)
    }

    /// Empreinte du fichier tel qu'ouvert : sert à refuser une retouche
    /// calculée sur une version que Word ou l'agent a remplacée depuis.
    pub fn revision(&self) -> String {
        revision_of(&self.bytes)
    }

    /// Révision qu'aurait le paquet enregistré tel qu'il est maintenant.
    pub(crate) fn revision_of_bytes(&self) -> Result<String> {
        if self.is_dirty() { Ok(revision_of(&self.to_bytes()?)) } else { Ok(self.revision()) }
    }

    pub fn has_part(&self, name: &str) -> bool {
        self.parts.contains_key(name) || self.binaries.contains_key(name) || self.names.iter().any(|n| n == name)
    }

    /// Octets d'une partie (image…), ou `None` si elle n'existe pas.
    pub fn binary(&self, name: &str) -> Result<Option<Vec<u8>>> {
        if let Some(b) = self.binaries.get(name) {
            return Ok(Some(b.clone()));
        }
        if !self.names.iter().any(|n| n == name) {
            return Ok(None);
        }
        let mut archive = ZipArchive::new(Cursor::new(self.bytes.as_slice()))?;
        let mut file = archive.by_name(name)?;
        let mut raw = Vec::new();
        file.read_to_end(&mut raw)?;
        Ok(Some(raw))
    }

    pub(crate) fn add_binary(&mut self, name: &str, bytes: Vec<u8>) {
        self.binaries.insert(name.to_string(), bytes);
    }

    /// Ajoute une relation depuis `part` (`word/document.xml`…) et rend son
    /// identifiant ; `target` est relatif au dossier de la partie.
    pub(crate) fn add_rel(&mut self, part: &str, rel_type: &str, target: &str) -> Result<String> {
        let rels_name = rels_of(part);
        let rels = self.part(&rels_name)?.unwrap_or_else(|| {
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>"#
                .to_string()
        });
        let mut n = 1;
        while rels.contains(&format!("Id=\"rIdAtelier{n}\"")) {
            n += 1;
        }
        let id = format!("rIdAtelier{n}");
        let rel = format!(r#"<Relationship Id="{id}" Type="{rel_type}" Target="{}"/>"#, xml::escape_attr(target));
        let close = rels.rfind("</Relationships>").ok_or_else(|| DocxError(format!("{rels_name} illisible")))?;
        self.set_part(&rels_name, format!("{}{rel}{}", &rels[..close], &rels[close..]));
        Ok(id)
    }

    /// Cible (chemin dans le paquet) de la relation `id` de `part`.
    pub(crate) fn rel_target(&mut self, part: &str, id: &str) -> Result<Option<String>> {
        let Some(rels) = self.part(&rels_of(part))? else { return Ok(None) };
        let doc = xml::parse(&rels)?;
        let Some(r) = doc.descendants().find(|n| n.tag_name().name() == "Relationship" && n.attribute("Id") == Some(id)) else {
            return Ok(None);
        };
        if r.attribute("TargetMode") == Some("External") {
            return Ok(None);
        }
        let target = r.attribute("Target").unwrap_or("");
        Ok(Some(resolve(part, target)))
    }

    /// Déclare un type de contenu par extension s'il manque (`png`…).
    pub(crate) fn ensure_default_type(&mut self, ext: &str, content_type: &str) -> Result<()> {
        let ct = self.part(CONTENT_TYPES)?.ok_or_else(|| DocxError("[Content_Types].xml manque".into()))?;
        if ct.to_ascii_lowercase().contains(&format!("extension=\"{}\"", ext.to_ascii_lowercase())) {
            return Ok(());
        }
        let close = ct.rfind("</Types>").ok_or_else(|| DocxError("[Content_Types].xml illisible".into()))?;
        let tag = format!(r#"<Default Extension="{ext}" ContentType="{content_type}"/>"#);
        self.set_part(CONTENT_TYPES, format!("{}{tag}{}", &ct[..close], &ct[close..]));
        Ok(())
    }

    /// Noms des entrées du paquet (lues et ajoutées).
    pub(crate) fn entry_names(&self) -> Vec<String> {
        let mut v = self.names.clone();
        v.extend(self.binaries.keys().cloned());
        v.extend(self.parts.keys().filter(|k| !self.names.contains(k)).cloned());
        v
    }

    fn load(&mut self, name: &str) -> Result<Option<&String>> {
        if !self.parts.contains_key(name) {
            if !self.names.iter().any(|n| n == name) {
                return Ok(None);
            }
            let mut archive = ZipArchive::new(Cursor::new(self.bytes.as_slice()))?;
            let mut file = archive.by_name(name)?;
            let mut raw = Vec::new();
            file.read_to_end(&mut raw)?;
            let text = String::from_utf8(raw).map_err(|_| DocxError(format!("{name} n'est pas en UTF-8")))?;
            self.parts.insert(name.to_string(), text);
        }
        Ok(self.parts.get(name))
    }

    /// Texte d'une partie XML, ou `None` si elle n'existe pas.
    pub fn part(&mut self, name: &str) -> Result<Option<String>> {
        Ok(self.load(name)?.cloned())
    }

    pub fn document_xml(&self) -> &str {
        &self.parts[DOCUMENT]
    }

    pub(crate) fn set_part(&mut self, name: &str, text: String) {
        if self.parts.get(name) != Some(&text) {
            self.parts.insert(name.to_string(), text);
            self.dirty.insert(name.to_string());
        }
    }

    pub fn is_dirty(&self) -> bool {
        !self.dirty.is_empty() || !self.binaries.is_empty()
    }

    /// Ajoute une partie absente (commentaires) avec son type de contenu et
    /// sa relation depuis document.xml.
    pub(crate) fn create_part(&mut self, name: &str, content_type: &str, rel_type: &str, text: String) -> Result<()> {
        if self.has_part(name) {
            self.set_part(name, text);
            return Ok(());
        }
        let target = name.strip_prefix("word/").unwrap_or(name);
        let ct = self.part(CONTENT_TYPES)?.ok_or_else(|| DocxError("[Content_Types].xml manque".into()))?;
        let override_tag = format!(r#"<Override PartName="/{name}" ContentType="{content_type}"/>"#);
        let close = ct.rfind("</Types>").ok_or_else(|| DocxError("[Content_Types].xml illisible".into()))?;
        self.set_part(CONTENT_TYPES, format!("{}{override_tag}{}", &ct[..close], &ct[close..]));

        self.add_rel(DOCUMENT, rel_type, target)?;
        self.set_part(name, text);
        Ok(())
    }

    /// Le paquet complet : entrées intactes recopiées brutes, parties
    /// modifiées recompressées à leur place, parties nouvelles à la fin.
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut archive = ZipArchive::new(Cursor::new(self.bytes.as_slice()))?;
        let mut out = ZipWriter::new(Cursor::new(Vec::with_capacity(self.bytes.len() + 4096)));
        for i in 0..archive.len() {
            let file = archive.by_index_raw(i)?;
            let name = file.name().to_string();
            if self.dirty.contains(&name) {
                let mut options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
                if let Some(t) = file.last_modified() {
                    options = options.last_modified_time(t);
                }
                drop(file);
                out.start_file(name.as_str(), options)?;
                out.write_all(self.parts[&name].as_bytes())?;
            } else {
                out.raw_copy_file(file)?;
            }
        }
        for name in self.dirty.iter().filter(|n| !self.names.contains(n)) {
            out.start_file(name.as_str(), SimpleFileOptions::default().compression_method(CompressionMethod::Deflated))?;
            out.write_all(self.parts[name].as_bytes())?;
        }
        for (name, bytes) in &self.binaries {
            // Images déjà compressées : stockées telles quelles, comme Word.
            out.start_file(name.as_str(), SimpleFileOptions::default().compression_method(CompressionMethod::Stored))?;
            out.write_all(bytes)?;
        }
        Ok(out.finish()?.into_inner())
    }

    /// Écrit à côté puis renomme : jamais de .docx à moitié écrit.
    pub fn save(&self, path: &Path) -> Result<()> {
        write_atomic(path, &self.to_bytes()?)
    }

    pub fn model(&mut self) -> Result<DocModel> {
        model::build(self)
    }
}

pub(crate) const CONFLICT: &str = "conflit : le document a changé depuis (Word, l'agent ou un autre onglet) ; recharger puis refaire la retouche";
const OPEN_IN_WORD: &str = "Word a ce document ouvert : ferme-le dans Word avant de le retoucher ici (Word écraserait ces retouches à son prochain enregistrement). Si Word est déjà fermé, supprime le fichier « ~$… » resté à côté du document.";

impl DocxError {
    /// La retouche visait une version remplacée depuis : rien n'a été écrit.
    pub fn is_conflict(&self) -> bool {
        self.0 == CONFLICT
    }

    /// Word a le fichier ouvert : rien n'a été écrit.
    pub fn is_open_in_word(&self) -> bool {
        self.0 == OPEN_IN_WORD
    }
}

/// Word pose `~$` + la fin du nom à côté d'un document ouvert (il garde les
/// derniers caractères des noms longs) ; enregistrer dans Word écraserait
/// alors toute retouche faite ailleurs.
pub fn open_in_word(path: &Path) -> bool {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name().and_then(|n| n.to_str())) else { return false };
    let dir = if dir.as_os_str().is_empty() { Path::new(".") } else { dir };
    let tail: String = name.chars().skip(2).collect();
    let Ok(entries) = std::fs::read_dir(dir) else { return false };
    entries.flatten().any(|e| {
        let n = e.file_name();
        let n = n.to_string_lossy();
        n.starts_with("~$") && (n[2..] == *name || (!tail.is_empty() && n.ends_with(&tail)))
    })
}

pub(crate) fn refuse_if_open_in_word(path: &Path) -> Result<()> {
    if open_in_word(path) { err(OPEN_IN_WORD) } else { Ok(()) }
}

/// Ouvre `path`, applique `f` et enregistre, sous un verrou exclusif : le
/// panneau (serveur de la galerie) et l'agent (runtime) sont deux processus.
/// `expected` = révision sur laquelle la retouche a été calculée ; si le
/// fichier a changé depuis, rien n'est écrit ([`DocxError::is_conflict`]).
/// Rend le résultat de `f` et la nouvelle révision.
pub fn edit_file<T>(path: &Path, expected: Option<&str>, f: impl FnOnce(&mut Docx) -> Result<T>) -> Result<(T, String)> {
    edit_file_as(path, expected, &history::Origin::UNKNOWN, f)
}

/// Comme [`edit_file`], en notant qui a fait la retouche dans l'historique.
///
/// Avant d'écrire : refus si Word a le fichier ouvert, relecture complète
/// du paquet produit et contrôle qu'il n'introduit aucun défaut que Word
/// refuserait ([`check`]). Après : la version d'avant rejoint l'historique
/// sur disque ([`history`]) ; la première fois, l'original reçu y est copié.
pub fn edit_file_as<T>(path: &Path, expected: Option<&str>, origin: &history::Origin, f: impl FnOnce(&mut Docx) -> Result<T>) -> Result<(T, String)> {
    let lock = lock_file(path)?;
    lock.lock()?;
    refuse_if_open_in_word(path)?;
    let mut docx = Docx::open(path)?;
    let before_rev = docx.revision();
    if expected.is_some_and(|e| e != before_rev) {
        return err(CONFLICT);
    }
    let value = f(&mut docx)?;
    if !docx.is_dirty() {
        return Ok((value, before_rev));
    }
    let bytes = docx.to_bytes()?;
    // Relire ce qu'on vient de produire : un paquet illisible, ou qui
    // ajoute un défaut, ne remplace jamais l'original.
    let mut fresh = Docx::from_bytes(bytes.clone())?;
    fresh.model()?;
    check::guard(&docx.bytes, &before_rev, &mut fresh)?;
    write_atomic(path, &bytes)?;
    let rev = revision_of(&bytes);
    // L'historique ne doit jamais faire échouer une retouche déjà écrite.
    if let Err(e) = history::record(path, &docx.bytes, &before_rev, &bytes, &rev, origin) {
        eprintln!("atelier-docx : historique non tenu pour {} : {e}", path.display());
    }
    Ok((value, rev))
}

/// Verrou dans le dossier temporaire, nommé d'après le chemin : rien ne
/// s'ajoute à côté du document de l'utilisateur.
pub(crate) fn lock_file(path: &Path) -> Result<std::fs::File> {
    let canon = path.canonicalize()?;
    let name = format!("atelier-docx-{}.lock", hex::encode(&Sha256::digest(canon.to_string_lossy().as_bytes())[..8]));
    Ok(std::fs::OpenOptions::new().create(true).truncate(false).write(true).open(std::env::temp_dir().join(name))?)
}

/// Écrit à côté, force l'écriture sur le disque, recopie droits et
/// attributs étendus (étiquettes du Finder…) de l'original, puis remplace
/// d'un seul geste : après une coupure, on retrouve l'ancien fichier ou le
/// nouveau, jamais un fichier vide ou à moitié écrit.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("document.docx");
    let tmp = dir.join(format!(".{name}.atelier-tmp"));
    let result = (|| -> Result<()> {
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).open(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        if let Ok(meta) = std::fs::metadata(path) {
            let _ = std::fs::set_permissions(&tmp, meta.permissions());
            copy_xattrs(path, &tmp);
        }
        std::fs::rename(&tmp, path)?;
        // Le renommage lui-même doit survivre à une coupure.
        #[cfg(unix)]
        if let Ok(d) = std::fs::File::open(dir) {
            let _ = d.sync_all();
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

/// Recopie les attributs étendus (étiquettes et commentaires du Finder,
/// provenance) : un fichier neuf les perdrait au renommage.
#[cfg(unix)]
fn copy_xattrs(from: &Path, to: &Path) {
    let Ok(names) = xattr::list(from) else { return };
    for name in names {
        if let Ok(Some(value)) = xattr::get(from, &name) {
            let _ = xattr::set(to, &name, &value);
        }
    }
}

#[cfg(not(unix))]
fn copy_xattrs(_: &Path, _: &Path) {}

/// `word/document.xml` → `word/_rels/document.xml.rels`.
pub(crate) fn rels_of(part: &str) -> String {
    match part.rsplit_once('/') {
        Some((dir, f)) => format!("{dir}/_rels/{f}.rels"),
        None => format!("_rels/{part}.rels"),
    }
}

/// Résout une cible de relation relative au dossier de `part`.
pub(crate) fn resolve(part: &str, target: &str) -> String {
    if let Some(abs) = target.strip_prefix('/') {
        return abs.to_string();
    }
    let mut segs: Vec<&str> = part.rsplit_once('/').map(|(d, _)| d.split('/').collect()).unwrap_or_default();
    for s in target.split('/') {
        match s {
            ".." => {
                segs.pop();
            }
            "." | "" => {}
            s => segs.push(s),
        }
    }
    segs.join("/")
}

pub fn revision_of(bytes: &[u8]) -> String {
    hex::encode(&Sha256::digest(bytes)[..12])
}
