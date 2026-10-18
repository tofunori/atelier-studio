//! Magasins de données durables : le seul lecteur et le seul écrivain des
//! fichiers JSON de Thierry (annotations PDF, livre de codes, souvenirs,
//! réglages, appareils appairés…), partagés par la galerie, le MCP des
//! annotations, la passerelle iPhone, le livre de codes et le serveur de
//! l'app.
//!
//! Règles :
//! - fichier absent : magasin vide ;
//! - fichier présent mais illisible (vide, tronqué, JSON invalide, forme
//!   inattendue) : erreur [`StoreError::Unreadable`]. Le fichier reste en
//!   place, une copie est mise de côté en `<nom>.corrupt-<horodatage UTC>` (jamais
//!   par-dessus une copie existante, et une seule par contenu), et l'appelant
//!   refuse d'écrire tant qu'il n'est pas réparé. Un échec n'est jamais mis
//!   en cache : la lecture suivante relit le disque ;
//! - écriture : fichier temporaire du même dossier, fsync, rename, fsync du
//!   dossier ([`write_durable`]) ;
//! - avant de réécrire un magasin ([`save`]), une sauvegarde datée par jour
//!   (date UTC) dans `backups/<nom>.<AAAA-MM-JJ>.<ext>` à côté du fichier,
//!   les [`BACKUPS_KEPT`] dernières gardées.
//!
//! Le format des fichiers ne change pas : d'autres lecteurs (app iPhone via
//! la passerelle, MCP, anciennes versions de l'app) les lisent.

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Dossier des sauvegardes tournantes, à côté du magasin.
pub const BACKUP_DIR: &str = "backups";
/// Nombre de sauvegardes quotidiennes gardées par magasin.
pub const BACKUPS_KEPT: usize = 7;
/// Marque des copies d'un fichier illisible : `<nom>.corrupt-<horodatage>`.
pub const CORRUPT_MARK: &str = ".corrupt-";

/// Forme attendue de la racine d'un fichier JSON.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Shape {
    Object,
    Array,
    Any,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    /// Fichier présent mais illisible : il reste en place et rien n'est écrit.
    /// `copy` est la copie mise de côté (absente si la copie a échoué).
    Unreadable {
        path: PathBuf,
        reason: String,
        copy: Option<PathBuf>,
    },
    /// Lecture, écriture ou verrou impossible (droits, disque plein…).
    Io { path: PathBuf, message: String },
}

impl StoreError {
    pub fn io(path: &Path, error: impl fmt::Display) -> Self {
        Self::Io {
            path: path.to_path_buf(),
            message: error.to_string(),
        }
    }

    pub fn path(&self) -> &Path {
        match self {
            Self::Unreadable { path, .. } | Self::Io { path, .. } => path,
        }
    }

    pub fn is_unreadable(&self) -> bool {
        matches!(self, Self::Unreadable { .. })
    }
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unreadable {
                path,
                reason,
                copy: Some(copy),
            } => write!(
                f,
                "{} est illisible ({reason}) : rien n'est écrit tant qu'il n'est pas réparé ; copie mise de côté dans {}",
                path.display(),
                copy.display()
            ),
            Self::Unreadable {
                path,
                reason,
                copy: None,
            } => write!(
                f,
                "{} est illisible ({reason}) : rien n'est écrit tant qu'il n'est pas réparé ; la copie de côté a échoué",
                path.display()
            ),
            Self::Io { path, message } => write!(f, "{} : {message}", path.display()),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<StoreError> for String {
    fn from(error: StoreError) -> Self {
        error.to_string()
    }
}

impl From<StoreError> for io::Error {
    fn from(error: StoreError) -> Self {
        let kind = if error.is_unreadable() {
            io::ErrorKind::InvalidData
        } else {
            io::ErrorKind::Other
        };
        io::Error::new(kind, error.to_string())
    }
}

/// Dossier d'un chemin, `.` pour un nom nu.
pub fn parent_dir(path: &Path) -> &Path {
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "store".to_owned())
}

static TMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// `.<nom>.<pid>.<nanos>.<n>.tmp` : le motif que `atelier_core::clean_stale_tmp`
/// balaie après une écriture interrompue.
fn tmp_path(path: &Path) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    parent_dir(path).join(format!(
        ".{}.{}.{nanos}.{seq}.tmp",
        file_name(path),
        std::process::id()
    ))
}

/// fsync du dossier : rend le rename durable. Le rename a déjà eu lieu, donc
/// un système de fichiers qui refuse ce fsync n'annule pas l'écriture.
fn sync_dir(dir: &Path) {
    #[cfg(unix)]
    if let Ok(directory) = File::open(dir) {
        let _ = directory.sync_all();
    }
    #[cfg(not(unix))]
    let _ = dir;
}

/// Écrit `data` d'un bloc : fichier temporaire du même dossier, fsync,
/// rename, fsync du dossier. En cas d'échec, l'ancien fichier reste intact.
pub fn write_durable(path: &Path, data: &[u8]) -> io::Result<()> {
    let parent = parent_dir(path);
    fs::create_dir_all(parent)?;
    let tmp = tmp_path(path);
    let written = (|| {
        let mut file = OpenOptions::new().write(true).create_new(true).open(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if let Err(error) = written {
        let _ = fs::remove_file(&tmp);
        return Err(error);
    }
    sync_dir(parent);
    Ok(())
}

/// Lit `path` et le décode avec `parse`. Absent : `Ok(None)`. Présent mais
/// vide ou refusé par `parse` : copie mise de côté et [`StoreError::Unreadable`].
pub fn load_with<T>(
    path: &Path,
    parse: impl FnOnce(&[u8]) -> Result<T, String>,
) -> Result<Option<T>, StoreError> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(StoreError::io(path, error)),
    };
    let parsed = if bytes.is_empty() {
        Err("fichier vide".to_owned())
    } else {
        parse(&bytes)
    };
    parsed.map(Some).map_err(|reason| unreadable(path, &bytes, reason))
}

/// Erreur d'un fichier illisible, après avoir mis `bytes` de côté.
pub fn unreadable(path: &Path, bytes: &[u8], reason: impl Into<String>) -> StoreError {
    let copy = match quarantine(path, bytes) {
        Ok(copy) => Some(copy),
        Err(error) => {
            eprintln!("[atelier] copie de côté de {} impossible : {error}", path.display());
            None
        }
    };
    let error = StoreError::Unreadable {
        path: path.to_path_buf(),
        reason: reason.into(),
        copy,
    };
    eprintln!("[atelier] {error}");
    error
}

fn check_shape(value: Value, shape: Shape) -> Result<Value, String> {
    match shape {
        Shape::Object if !value.is_object() => Err("ce n'est pas un objet JSON".to_owned()),
        Shape::Array if !value.is_array() => Err("ce n'est pas un tableau JSON".to_owned()),
        _ => Ok(value),
    }
}

/// JSON de forme `shape` ; absent : `Ok(None)`.
pub fn load_json(path: &Path, shape: Shape) -> Result<Option<Value>, StoreError> {
    load_with(path, |bytes| {
        let value = serde_json::from_slice::<Value>(bytes).map_err(|e| format!("JSON invalide : {e}"))?;
        check_shape(value, shape)
    })
}

/// Objet JSON ; absent : objet vide.
pub fn load_object(path: &Path) -> Result<Map<String, Value>, StoreError> {
    Ok(match load_json(path, Shape::Object)? {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    })
}

/// Tableau JSON ; absent : tableau vide.
pub fn load_array(path: &Path) -> Result<Vec<Value>, StoreError> {
    Ok(match load_json(path, Shape::Array)? {
        Some(Value::Array(list)) => list,
        _ => Vec::new(),
    })
}

/// Entrées d'un magasin-liste : celles que le lecteur reconnaît, et les
/// autres, gardées telles quelles pour être réécrites sans perte (une version
/// plus récente ou plus ancienne de l'app peut les avoir écrites).
#[derive(Debug)]
pub struct ListEntries<T> {
    pub items: Vec<T>,
    pub kept: Vec<Value>,
}

impl<T> Default for ListEntries<T> {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            kept: Vec::new(),
        }
    }
}

/// Lit un magasin-liste (tableau JSON) ; absent : vide ; illisible : erreur
/// et copie de côté. Une entrée que `parse` refuse va dans `kept`.
pub fn load_list<T>(
    path: &Path,
    mut parse: impl FnMut(&Value) -> Option<T>,
) -> Result<ListEntries<T>, StoreError> {
    let mut entries = ListEntries::default();
    for value in load_array(path)? {
        match parse(&value) {
            Some(item) => entries.items.push(item),
            None => entries.kept.push(value),
        }
    }
    Ok(entries)
}

/// Refus d'écrire d'un magasin dont le chargement a échoué : le message dit
/// quel fichier réparer et où est sa copie.
pub fn writable(load_error: &Option<String>) -> Result<(), String> {
    match load_error {
        Some(error) => Err(error.clone()),
        None => Ok(()),
    }
}

/// Liste à écrire : les entrées reconnues puis celles gardées telles quelles.
pub fn with_kept<T: Serialize>(items: &[T], kept: &[Value]) -> Result<Vec<Value>, String> {
    let mut out = Vec::with_capacity(items.len() + kept.len());
    for item in items {
        out.push(serde_json::to_value(item).map_err(|e| e.to_string())?);
    }
    out.extend(kept.iter().cloned());
    Ok(out)
}

/// Valeur typée ; absent : `Ok(None)`. Un JSON valide qui ne correspond pas
/// au type est illisible lui aussi : le réécrire perdrait ce qu'il contient.
pub fn load_typed<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, StoreError> {
    load_with(path, |bytes| {
        serde_json::from_slice::<T>(bytes).map_err(|e| format!("contenu inattendu : {e}"))
    })
}

/// Met `bytes` de côté en `<nom>.corrupt-<horodatage>` dans le dossier de
/// `path`, sans jamais écraser une copie existante. Une copie au contenu
/// identique est réutilisée : chaque lecture refusée n'en refait pas une.
pub fn quarantine(path: &Path, bytes: &[u8]) -> io::Result<PathBuf> {
    // 2026-10-18T22:41:28.123Z → 20261018-224128
    let iso = crate::iso_now();
    let digits = |range: std::ops::Range<usize>| iso[range].replace(['-', ':'], "");
    let stamp = format!("{}-{}", digits(0..10), digits(11..19));
    quarantine_at(path, bytes, &stamp)
}

fn quarantine_at(path: &Path, bytes: &[u8], stamp: &str) -> io::Result<PathBuf> {
    let dir = parent_dir(path);
    let prefix = format!("{}{CORRUPT_MARK}", file_name(path));
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if !entry.file_name().to_string_lossy().starts_with(&prefix) {
                continue;
            }
            let candidate = entry.path();
            let same_size = fs::symlink_metadata(&candidate)
                .is_ok_and(|meta| meta.is_file() && meta.len() == bytes.len() as u64);
            if same_size && fs::read(&candidate).is_ok_and(|old| old == bytes) {
                return Ok(candidate);
            }
        }
    }
    for n in 0..1000 {
        let name = if n == 0 {
            format!("{prefix}{stamp}")
        } else {
            format!("{prefix}{stamp}-{n}")
        };
        let candidate = dir.join(name);
        let mut file = match OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        };
        if let Err(error) = file.write_all(bytes).and_then(|()| file.sync_all()) {
            drop(file);
            let _ = fs::remove_file(&candidate);
            return Err(error);
        }
        sync_dir(dir);
        return Ok(candidate);
    }
    Err(io::Error::other("trop de copies de côté portent cet horodatage"))
}

/// `pdf_annots.json` → (`pdf_annots`, `Some("json")`).
fn split_name(path: &Path) -> (String, Option<String>) {
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| file_name(path));
    let ext = path.extension().map(|ext| ext.to_string_lossy().into_owned());
    (stem, ext)
}

fn backup_name(stem: &str, date: &str, ext: Option<&str>) -> String {
    match ext {
        Some(ext) => format!("{stem}.{date}.{ext}"),
        None => format!("{stem}.{date}"),
    }
}

/// Date `AAAA-MM-JJ` d'une sauvegarde de `stem`, si `name` en est une.
fn backup_date<'a>(name: &'a str, stem: &str, ext: Option<&str>) -> Option<&'a str> {
    let rest = name.strip_prefix(stem)?.strip_prefix('.')?;
    let date = match ext {
        Some(ext) => rest.strip_suffix(ext)?.strip_suffix('.')?,
        None => rest,
    };
    let bytes = date.as_bytes();
    let shaped = bytes.len() == 10
        && bytes.iter().enumerate().all(|(i, b)| match i {
            4 | 7 => *b == b'-',
            _ => b.is_ascii_digit(),
        });
    shaped.then_some(date)
}

/// Sauvegarde du jour de `path` dans `backups/`, si elle n'existe pas encore,
/// puis élagage aux [`BACKUPS_KEPT`] plus récentes. La première écriture du
/// jour garde donc l'état de la veille. Rien si `path` est absent.
pub fn backup_daily(path: &Path) -> io::Result<Option<PathBuf>> {
    let today = crate::iso_now()[..10].to_owned();
    backup_daily_at(path, &today)
}

fn backup_daily_at(path: &Path, today: &str) -> io::Result<Option<PathBuf>> {
    let dir = parent_dir(path).join(BACKUP_DIR);
    let (stem, ext) = split_name(path);
    let target = dir.join(backup_name(&stem, today, ext.as_deref()));
    if target.exists() {
        return Ok(None);
    }
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    write_durable(&target, &bytes)?;
    prune_backups(&dir, &stem, ext.as_deref(), BACKUPS_KEPT);
    Ok(Some(target))
}

fn prune_backups(dir: &Path, stem: &str, ext: Option<&str>, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut dated: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let date = backup_date(&name, stem, ext)?.to_owned();
            Some((date, entry.path()))
        })
        .collect();
    dated.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, old) in dated.into_iter().skip(keep) {
        let _ = fs::remove_file(old);
    }
}

/// Réécrit un magasin : sauvegarde du jour, puis écriture durable. Sans
/// sauvegarde possible, rien n'est écrit.
pub fn save(path: &Path, data: &[u8]) -> Result<(), StoreError> {
    backup_daily(path).map_err(|error| {
        StoreError::io(&parent_dir(path).join(BACKUP_DIR), format!("sauvegarde impossible : {error}"))
    })?;
    write_durable(path, data).map_err(|error| StoreError::io(path, error))
}

/// [`save`] en JSON indenté suivi d'un saut de ligne : le format de
/// `pdf_annots.json` et `codebook.json` chez tous leurs écrivains.
pub fn save_json_pretty<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), StoreError> {
    let mut payload = serde_json::to_string_pretty(value).map_err(|error| StoreError::io(path, error))?;
    payload.push('\n');
    save(path, payload.as_bytes())
}

/// [`save`] en JSON compact (format des magasins écrits sans indentation).
pub fn save_json_compact<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), StoreError> {
    let payload = serde_json::to_vec(value).map_err(|error| StoreError::io(path, error))?;
    save(path, &payload)
}

/// Les quatre façons d'être illisible pour un magasin-objet, rejouées par
/// les tests de chaque écrivain (galerie, MCP, passerelle, livre de codes).
#[doc(hidden)]
pub const UNREADABLE_SAMPLES: [(&str, &str); 4] = [
    ("vide", ""),
    ("tronqué", "{\"zotero/ABCD1234/a.pdf\": [{\"id\": \"1\", \"te"),
    ("JSON invalide", "{pas du json}"),
    ("non-objet", "[1, 2, 3]"),
];

/// Les mêmes pour un magasin-liste : la mauvaise forme est un objet.
#[doc(hidden)]
pub const UNREADABLE_LIST_SAMPLES: [(&str, &str); 4] = [
    ("vide", ""),
    ("tronqué", "[{\"id\": \"mem_1\", \"text\": \"Albé"),
    ("JSON invalide", "[pas du json]"),
    ("non-tableau", "{\"id\": \"mem_1\"}"),
];

/// Nombre de copies `<nom>.corrupt-*` de `path` qui portent exactement `raw`
/// (aide aux tests des magasins).
#[doc(hidden)]
pub fn corrupt_copies_of(path: &Path, raw: &[u8]) -> usize {
    let prefix = format!("{}{CORRUPT_MARK}", file_name(path));
    fs::read_dir(parent_dir(path))
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
                .filter(|e| fs::read(e.path()).is_ok_and(|b| b == raw))
                .count()
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn corrupt_copies(dir: &Path, name: &str) -> Vec<PathBuf> {
        let prefix = format!("{name}{CORRUPT_MARK}");
        let mut out: Vec<PathBuf> = fs::read_dir(dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
            .map(|e| e.path())
            .collect();
        out.sort();
        out
    }

    #[test]
    fn absent_is_empty_and_valid_is_read() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.json");
        assert!(load_object(&path).unwrap().is_empty());
        assert!(load_array(&path).unwrap().is_empty());
        assert_eq!(load_json(&path, Shape::Any).unwrap(), None);
        fs::write(&path, r#"{"a": [1]}"#).unwrap();
        assert_eq!(load_object(&path).unwrap()["a"], serde_json::json!([1]));
        assert!(corrupt_copies(dir.path(), "store.json").is_empty());
    }

    #[test]
    fn unreadable_files_are_refused_kept_and_copied_once() {
        for (case, raw) in UNREADABLE_SAMPLES {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("store.json");
            fs::write(&path, raw).unwrap();
            let error = load_object(&path).unwrap_err();
            assert!(error.is_unreadable(), "{case}: {error}");
            assert_eq!(fs::read_to_string(&path).unwrap(), raw, "{case}: le fichier reste en place");
            let copies = corrupt_copies(dir.path(), "store.json");
            assert_eq!(copies.len(), 1, "{case}");
            assert_eq!(fs::read_to_string(&copies[0]).unwrap(), raw, "{case}");
            // store.json.corrupt-AAAAMMJJ-HHMMSS (UTC)
            let name = copies[0].file_name().unwrap().to_string_lossy().into_owned();
            let stamp = name.strip_prefix("store.json.corrupt-").unwrap();
            assert!(stamp.len() == 15 && stamp.as_bytes()[8] == b'-', "{case}: {name}");
            assert!(stamp.bytes().enumerate().all(|(i, b)| i == 8 || b.is_ascii_digit()), "{name}");
            assert!(error.to_string().contains(".corrupt-"), "{case}: {error}");
            // une deuxième lecture refusée ne refait pas de copie
            assert!(load_object(&path).is_err());
            assert_eq!(corrupt_copies(dir.path(), "store.json").len(), 1, "{case}");
        }
    }

    #[test]
    fn a_typed_store_that_no_longer_matches_is_unreadable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("jobs.json");
        fs::write(&path, r#"{"not": "a list"}"#).unwrap();
        let error = load_typed::<Vec<String>>(&path).unwrap_err();
        assert!(error.is_unreadable());
        assert_eq!(corrupt_copies(dir.path(), "jobs.json").len(), 1);
    }

    #[test]
    fn quarantine_never_overwrites_an_existing_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("store.json");
        let taken = dir.path().join("store.json.corrupt-20261018-120000");
        fs::write(&taken, "autre contenu").unwrap();
        let copy = quarantine_at(&path, b"{cass", "20261018-120000").unwrap();
        assert_eq!(copy, dir.path().join("store.json.corrupt-20261018-120000-1"));
        assert_eq!(fs::read_to_string(&taken).unwrap(), "autre contenu");
        assert_eq!(fs::read_to_string(&copy).unwrap(), "{cass");
        // même contenu : la copie existante sert
        assert_eq!(quarantine_at(&path, b"{cass", "20261018-130000").unwrap(), copy);
    }

    #[test]
    fn write_durable_replaces_without_leaving_tmp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join("store.json");
        write_durable(&path, b"one").unwrap();
        write_durable(&path, b"two").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "two");
        let leftovers = fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn backups_rotate_daily_and_keep_seven() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("pdf_annots.json");
        let backups = dir.path().join(BACKUP_DIR);
        // rien à sauvegarder tant que le magasin n'existe pas
        assert_eq!(backup_daily_at(&path, "2026-10-01").unwrap(), None);
        fs::create_dir_all(&backups).unwrap();
        for day in 1..=9 {
            fs::write(backups.join(format!("pdf_annots.2026-09-{day:02}.json")), "{}").unwrap();
        }
        // un autre magasin du même dossier n'est jamais élagué
        fs::write(backups.join("codebook.2026-09-01.json"), "{}").unwrap();
        fs::write(&path, r#"{"v": 1}"#).unwrap();
        let made = backup_daily_at(&path, "2026-10-18").unwrap().unwrap();
        assert_eq!(made, backups.join("pdf_annots.2026-10-18.json"));
        // une seule sauvegarde par jour : celle d'avant la première écriture
        fs::write(&path, r#"{"v": 2}"#).unwrap();
        assert_eq!(backup_daily_at(&path, "2026-10-18").unwrap(), None);
        assert_eq!(fs::read_to_string(&made).unwrap(), r#"{"v": 1}"#);
        let mut kept: Vec<String> = fs::read_dir(&backups)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("pdf_annots."))
            .collect();
        kept.sort();
        assert_eq!(
            kept,
            vec![
                "pdf_annots.2026-09-04.json",
                "pdf_annots.2026-09-05.json",
                "pdf_annots.2026-09-06.json",
                "pdf_annots.2026-09-07.json",
                "pdf_annots.2026-09-08.json",
                "pdf_annots.2026-09-09.json",
                "pdf_annots.2026-10-18.json",
            ]
        );
        assert!(backups.join("codebook.2026-09-01.json").exists());
    }

    #[test]
    fn save_backs_up_the_previous_content_before_rewriting() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("memories.json");
        save_json_compact(&path, &serde_json::json!([1])).unwrap();
        // premier écrit : rien à sauvegarder encore
        assert!(!dir.path().join(BACKUP_DIR).exists());
        save_json_compact(&path, &serde_json::json!([1, 2])).unwrap();
        let backups: Vec<PathBuf> = fs::read_dir(dir.path().join(BACKUP_DIR))
            .unwrap()
            .flatten()
            .map(|e| e.path())
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read_to_string(&backups[0]).unwrap(), "[1]");
        assert_eq!(fs::read_to_string(&path).unwrap(), "[1,2]");
    }
}
