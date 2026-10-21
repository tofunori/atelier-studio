//! Store original generated images in the project's normal gallery scan tree.
use std::{fs, io::Write, path::Path};
use md5::{Digest, Md5};

pub fn save_generated_image(root: &Path, bytes: &[u8], extension: &str) -> Result<String, String> {
    save_named(root, bytes, extension, None)
}

/// Figure du chat ou du noyau envoyée vers la galerie. Une image déjà rangée
/// dans le projet garde son chemin : la recopier créait une deuxième carte de
/// la même figure (`images-generees/image-<md5>.png`). Une image du dehors est
/// copiée sous le nom de sa source suivi d'un court hachage, pour que la
/// galerie la range avec les autres fichiers de la même figure.
pub fn gallery_rel_for_image(root: &Path, source: &Path, bytes: &[u8], extension: &str) -> Result<String, String> {
    if let Some(rel) = indexed_rel(root, source) { return Ok(rel); }
    let stem = source.file_stem().and_then(|s| s.to_str()).and_then(figure_stem);
    save_named(root, bytes, extension, stem)
}

fn indexed_rel(root: &Path, source: &Path) -> Option<String> {
    let root = fs::canonicalize(root).ok()?;
    let source = fs::canonicalize(source).ok()?;
    let rel = source.strip_prefix(&root).ok()?;
    let mut parts = rel.components().map(|c| c.as_os_str().to_str()).collect::<Option<Vec<_>>>()?;
    parts.pop()?;
    // Dossier que le scan de la galerie saute : la figure n'y aurait pas de carte.
    if parts.iter().any(|p| p.starts_with('.') || atelier_core::is_excluded_dir(p)) { return None; }
    Some(rel.to_str()?.replace('\\', "/"))
}

fn figure_stem(stem: &str) -> Option<String> {
    let clean: String = stem.chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '_' })
        .take(80).collect();
    let clean = clean.trim_matches(|c| matches!(c, '.' | '_' | '-')).to_string();
    (!clean.is_empty()).then_some(clean)
}

fn save_named(root: &Path, bytes: &[u8], extension: &str, stem: Option<String>) -> Result<String, String> {
    if !root.is_absolute() || !root.is_dir() { return Err("Projet local introuvable".into()); }
    if bytes.is_empty() || bytes.len() > 64 * 1024 * 1024 { return Err("Taille d’image invalide".into()); }
    if !matches!(extension, "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg") { return Err("Format d’image invalide".into()); }
    let root = fs::canonicalize(root).map_err(|e| e.to_string())?;
    let folder = root.join("images-generees");
    match fs::create_dir(&folder) {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => (),
        Err(e) => return Err(e.to_string()),
    }
    let metadata = fs::symlink_metadata(&folder).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() { return Err("Le dossier galerie doit être un dossier du projet".into()); }
    let digest = hex::encode(Md5::digest(bytes));
    let name = match stem {
        Some(stem) => format!("{stem}-{}.{extension}", &digest[..8]),
        None => format!("image-{digest}.{extension}"),
    };
    let destination = folder.join(&name);
    let existing = || -> Result<String, String> {
        let meta = fs::symlink_metadata(&destination).map_err(|e| e.to_string())?;
        if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != bytes.len() as u64
            || fs::read(&destination).map_err(|e| e.to_string())? != bytes {
            return Err("Un autre fichier occupe déjà cette destination".into());
        }
        Ok(format!("images-generees/{name}"))
    };
    if destination.symlink_metadata().is_ok() { return existing(); }
    let mut temporary = tempfile::NamedTempFile::new_in(&folder).map_err(|e| e.to_string())?;
    temporary.write_all(bytes).map_err(|e| e.to_string())?;
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    match temporary.persist_noclobber(&destination) {
        Ok(_) => Ok(format!("images-generees/{name}")),
        Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => existing(),
        Err(e) => Err(e.error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_original_and_deduplicates() {
        let root = tempfile::tempdir().unwrap();
        let a = save_generated_image(root.path(), b"original", "png").unwrap();
        assert_eq!(a, save_generated_image(root.path(), b"original", "png").unwrap());
        assert_eq!(fs::read(root.path().join(a)).unwrap(), b"original");
        assert_eq!(fs::read_dir(root.path().join("images-generees")).unwrap().count(), 1);
    }
    #[test]
    fn project_figure_keeps_its_path_and_outside_copy_keeps_its_name() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("figures/supp")).unwrap();
        let inside = root.path().join("figures/supp/figS_surface.png");
        fs::write(&inside, b"png").unwrap();
        assert_eq!(gallery_rel_for_image(root.path(), &inside, b"png", "png").unwrap(), "figures/supp/figS_surface.png");
        assert!(!root.path().join("images-generees").exists());

        let outside = tempfile::tempdir().unwrap();
        let preview = outside.path().join("figS surface (aperçu).png");
        fs::write(&preview, b"apercu").unwrap();
        let rel = gallery_rel_for_image(root.path(), &preview, b"apercu", "png").unwrap();
        let digest = hex::encode(Md5::digest(b"apercu"));
        assert_eq!(rel, format!("images-generees/figS_surface__aperçu-{}.png", &digest[..8]));
        assert_eq!(rel, gallery_rel_for_image(root.path(), &preview, b"apercu", "png").unwrap());
    }

    #[test]
    fn hidden_or_skipped_folders_are_copied() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join(".fig_thumbs")).unwrap();
        let thumb = root.path().join(".fig_thumbs/fig.png");
        fs::write(&thumb, b"thumb").unwrap();
        let rel = gallery_rel_for_image(root.path(), &thumb, b"thumb", "png").unwrap();
        assert!(rel.starts_with("images-generees/fig-"), "{rel}");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_destination() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("images-generees")).unwrap();
        assert!(save_generated_image(root.path(), b"original", "png").is_err());
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }
}
