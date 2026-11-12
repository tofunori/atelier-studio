//! Versions d'un document à côté de lui, sans jamais rien écraser :
//! « Enregistrer une nouvelle version » (`nom_v2.docx`, `nom_v3.docx`…) et
//! « Ouvrir la version reçue » (`nom_recu.docx`, la dernière version reçue de
//! l'extérieur que garde l'historique, telle qu'elle est arrivée).

use crate::{DocxError, Result, history, revision_of};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Nom sans `.docx` ni suffixe de version (`_v2`, `_recu`) : la racine
/// commune à toutes les versions d'un même document.
fn root_name(path: &Path) -> String {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
    if let Some(base) = stem.strip_suffix("_recu") {
        return base.to_string();
    }
    match stem.rfind("_v") {
        Some(i) if i > 0 && stem[i + 2..].len() <= 4 && !stem[i + 2..].is_empty() && stem[i + 2..].bytes().all(|b| b.is_ascii_digit()) => stem[..i].to_string(),
        _ => stem.to_string(),
    }
}

/// Numéro de version d'un fichier frère `racine_vN.docx`, s'il en est un.
fn version_number(name: &str, root: &str) -> Option<u32> {
    let rest = name.strip_prefix(root)?.strip_prefix("_v")?;
    let num = rest.strip_suffix(".docx").or_else(|| rest.strip_suffix(".DOCX"))?;
    (!num.is_empty() && num.len() <= 4 && num.bytes().all(|b| b.is_ascii_digit())).then(|| num.parse().ok()).flatten()
}

/// Crée `path` avec ces octets, seulement s'il n'existe pas encore.
fn create_new(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(path)?;
    f.write_all(bytes)?;
    f.sync_all()
}

/// Premier numéro de version libre après la plus haute déjà à côté (2 au moins).
fn next_number(path: &Path) -> Result<u32> {
    let dir = path.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let root = root_name(path);
    let mut next = 2;
    for entry in std::fs::read_dir(dir)?.flatten() {
        if let Some(n) = entry.file_name().to_str().and_then(|name| version_number(name, &root)) {
            next = next.max(n + 1);
        }
    }
    Ok(next)
}

/// Nom que prendra la prochaine version (`racine_vN.docx`), pour l'annoncer.
pub fn next_version_name(path: &Path) -> Option<String> {
    Some(format!("{}_v{}.docx", root_name(path), next_number(path).ok()?))
}

/// Copie le document tel qu'il est sur le disque en `racine_vN.docx`, N
/// étant le premier numéro libre après la plus haute version déjà là (2 au
/// moins). Le document ouvert n'est pas touché. Rend le chemin créé.
pub fn save_version(path: &Path) -> Result<PathBuf> {
    let lock = crate::lock_file(path)?;
    lock.lock()?;
    let bytes = std::fs::read(path)?;
    crate::Docx::from_bytes(bytes.clone())?;
    let dir = path.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let root = root_name(path);
    let next = next_number(path)?;
    for n in next..next + 100 {
        let target = dir.join(format!("{root}_v{n}.docx"));
        match create_new(&target, &bytes) {
            Ok(()) => return Ok(target),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.into()),
        }
    }
    Err(DocxError("trop de versions portent déjà ce nom".into()))
}

/// La dernière version reçue de l'extérieur que garde l'historique, si elle
/// diffère du document actuel : `(révision, date)`.
pub fn received(path: &Path) -> Option<(String, String)> {
    let current = revision_of(&std::fs::read(path).ok()?);
    let j = history::load(path);
    let base = j.bases.last()?;
    (base.revision != current).then(|| (base.revision.clone(), base.at.clone()))
}

/// Écrit la dernière version reçue en `racine_recu.docx` (ou `racine_recu
/// 2.docx`… si ce nom est pris par un autre contenu) et rend son chemin.
/// Une copie identique déjà là est reprise telle quelle.
pub fn open_received(path: &Path) -> Result<PathBuf> {
    let Some((revision, _)) = received(path) else {
        return Err(DocxError("aucune autre version reçue : le document est encore tel qu'il est arrivé".into()));
    };
    let bytes = history::base_bytes(path, &revision)?;
    if revision_of(&bytes) != revision {
        return Err(DocxError("la version reçue est abîmée dans l'historique".into()));
    }
    crate::Docx::from_bytes(bytes.clone())?;
    let dir = path.parent().filter(|d| !d.as_os_str().is_empty()).unwrap_or(Path::new("."));
    let root = root_name(path);
    for n in 1..100 {
        let target = if n == 1 { dir.join(format!("{root}_recu.docx")) } else { dir.join(format!("{root}_recu {n}.docx")) };
        match create_new(&target, &bytes) {
            Ok(()) => return Ok(target),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if std::fs::read(&target).map(|b| revision_of(&b) == revision).unwrap_or(false) {
                    return Ok(target);
                }
            }
            Err(e) => return Err(e.into()),
        }
    }
    Err(DocxError("trop de copies portent déjà ce nom".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_drops_version_suffixes() {
        assert_eq!(root_name(Path::new("/d/Chap_revCK.docx")), "Chap_revCK");
        assert_eq!(root_name(Path::new("/d/Chap_revCK_v3.docx")), "Chap_revCK");
        assert_eq!(root_name(Path::new("/d/Chap_revCK_recu.docx")), "Chap_revCK");
        assert_eq!(root_name(Path::new("/d/rapport_vert.docx")), "rapport_vert");
        assert_eq!(root_name(Path::new("/d/_v2.docx")), "_v2");
    }

    #[test]
    fn version_numbers_belong_to_their_root() {
        assert_eq!(version_number("Chap_v12.docx", "Chap"), Some(12));
        assert_eq!(version_number("Chap_v.docx", "Chap"), None);
        assert_eq!(version_number("Chapitre_v2.docx", "Chap"), None);
        assert_eq!(version_number("Chap_vert.docx", "Chap"), None);
    }
}
