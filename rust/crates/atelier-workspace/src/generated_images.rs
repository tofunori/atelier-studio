//! Store original generated images in the project's normal gallery scan tree.
use std::{fs, io::Write, path::Path};
use md5::{Digest, Md5};

pub fn save_generated_image(root: &Path, bytes: &[u8], extension: &str) -> Result<String, String> {
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
    let name = format!("image-{}.{extension}", hex::encode(Md5::digest(bytes)));
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
