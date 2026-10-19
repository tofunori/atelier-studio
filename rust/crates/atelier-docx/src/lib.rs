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
//! - [`structure`] : Entrée et retour arrière entre paragraphes.
//! - [`format`] : police, taille, gras…, style et alignement.
//! - [`ops`] : une retouche en JSON (panneau et agent), et le texte pour l'agent.
//! - [`story`] : corps, notes, en-têtes et pieds de page, chacun dans sa partie.

pub mod comments;
pub mod edit;
pub mod model;
pub mod review;
pub mod structure;
pub mod format;
pub mod ops;
pub mod story;
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
const CONTENT_TYPES: &str = "[Content_Types].xml";
const DOCUMENT_RELS: &str = "word/_rels/document.xml.rels";

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
    /// ISO 8601 sans fraction, comme Word : `2026-10-19T19:00:00Z`.
    pub date: String,
}

impl Signature {
    pub fn now(author: &str) -> Self {
        Signature { author: author.to_string(), initials: initials(author), date: iso_now() }
    }
}

pub fn initials(name: &str) -> String {
    let s: String = name.split_whitespace().filter_map(|w| w.chars().find(|c| c.is_alphabetic())).collect();
    if s.is_empty() { "?".into() } else { s.to_uppercase() }
}

/// Date UTC courante au format de Word, sans dépendance de date.
pub fn iso_now() -> String {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) as i64;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Howard Hinnant, civil_from_days.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// Un .docx ouvert en mémoire. Les parties lues sont gardées en cache ;
/// seules les parties modifiées sont réécrites à l'enregistrement.
#[derive(Clone)]
pub struct Docx {
    bytes: Vec<u8>,
    names: Vec<String>,
    parts: BTreeMap<String, String>,
    dirty: BTreeSet<String>,
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
        let mut docx = Docx { bytes, names, parts: BTreeMap::new(), dirty: BTreeSet::new() };
        docx.load(DOCUMENT)?;
        Ok(docx)
    }

    /// Empreinte du fichier tel qu'ouvert : sert à refuser une retouche
    /// calculée sur une version que Word ou l'agent a remplacée depuis.
    pub fn revision(&self) -> String {
        revision_of(&self.bytes)
    }

    pub fn has_part(&self, name: &str) -> bool {
        self.parts.contains_key(name) || self.names.iter().any(|n| n == name)
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
        !self.dirty.is_empty()
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

        let rels = self.part(DOCUMENT_RELS)?.unwrap_or_else(|| {
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>"#
                .to_string()
        });
        let mut n = 1;
        while rels.contains(&format!("Id=\"rIdAtelier{n}\"")) {
            n += 1;
        }
        let rel = format!(r#"<Relationship Id="rIdAtelier{n}" Type="{rel_type}" Target="{target}"/>"#);
        let close = rels.rfind("</Relationships>").ok_or_else(|| DocxError("relations de document.xml illisibles".into()))?;
        self.set_part(DOCUMENT_RELS, format!("{}{rel}{}", &rels[..close], &rels[close..]));
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

const CONFLICT: &str = "conflit : le document a changé depuis (Word, l'agent ou un autre onglet) ; recharger puis refaire la retouche";

impl DocxError {
    /// La retouche visait une version remplacée depuis : rien n'a été écrit.
    pub fn is_conflict(&self) -> bool {
        self.0 == CONFLICT
    }
}

/// Ouvre `path`, applique `f` et enregistre, sous un verrou exclusif : le
/// panneau (serveur de la galerie) et l'agent (runtime) sont deux processus.
/// `expected` = révision sur laquelle la retouche a été calculée ; si le
/// fichier a changé depuis, rien n'est écrit ([`DocxError::is_conflict`]).
/// Rend le résultat de `f` et la nouvelle révision.
pub fn edit_file<T>(path: &Path, expected: Option<&str>, f: impl FnOnce(&mut Docx) -> Result<T>) -> Result<(T, String)> {
    edit_file_keep(path, expected, f).map(|(v, rev, _)| (v, rev))
}

/// Comme [`edit_file`], et rend en plus le paquet d'avant quand le fichier a
/// été réécrit (pour annuler).
pub fn edit_file_keep<T>(path: &Path, expected: Option<&str>, f: impl FnOnce(&mut Docx) -> Result<T>) -> Result<(T, String, Option<Vec<u8>>)> {
    let lock = lock_file(path)?;
    lock.lock()?;
    let mut docx = Docx::open(path)?;
    if expected.is_some_and(|e| e != docx.revision()) {
        return err(CONFLICT);
    }
    let value = f(&mut docx)?;
    if !docx.is_dirty() {
        return Ok((value, docx.revision(), None));
    }
    let bytes = docx.to_bytes()?;
    // Relire ce qu'on vient d'écrire : un paquet illisible ne remplace jamais l'original.
    Docx::from_bytes(bytes.clone())?.model()?;
    write_atomic(path, &bytes)?;
    let rev = revision_of(&bytes);
    Ok((value, rev, Some(docx.bytes)))
}

/// Remet `bytes` à la place du fichier (annuler, rétablir), seulement s'il
/// est encore à la révision `expected`. Rend la révision d'avant et le
/// paquet remplacé.
pub fn replace_file(path: &Path, expected: &str, bytes: &[u8]) -> Result<Vec<u8>> {
    let lock = lock_file(path)?;
    lock.lock()?;
    let current = std::fs::read(path)?;
    if revision_of(&current) != expected {
        return err(CONFLICT);
    }
    Docx::from_bytes(bytes.to_vec())?;
    write_atomic(path, bytes)?;
    Ok(current)
}

/// Verrou dans le dossier temporaire, nommé d'après le chemin : rien ne
/// s'ajoute à côté du document de l'utilisateur.
fn lock_file(path: &Path) -> Result<std::fs::File> {
    let canon = path.canonicalize()?;
    let name = format!("atelier-docx-{}.lock", hex::encode(&Sha256::digest(canon.to_string_lossy().as_bytes())[..8]));
    Ok(std::fs::OpenOptions::new().create(true).truncate(false).write(true).open(std::env::temp_dir().join(name))?)
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path.parent().unwrap_or(Path::new("."));
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("document.docx");
    let tmp = dir.join(format!(".{name}.atelier-tmp"));
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })?;
    Ok(())
}

pub fn revision_of(bytes: &[u8]) -> String {
    hex::encode(&Sha256::digest(bytes)[..12])
}
