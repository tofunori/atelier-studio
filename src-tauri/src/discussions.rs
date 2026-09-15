//! Persistent, app-managed writing workspaces. No temporary-directory cleanup.
use std::{fs, io::Write, path::{Path, PathBuf}};

fn valid_uuid_component(value: &str) -> bool {
    value.len() == 36 && value.bytes().enumerate().all(|(i, c)| {
        if [8, 13, 18, 23].contains(&i) { c == b'-' } else { c.is_ascii_hexdigit() }
    })
}

fn workspace_at(base: &Path, thread_id: &str) -> Result<PathBuf, String> {
    // One opaque UUID component; never allow a caller-controlled path.
    if !valid_uuid_component(thread_id) { return Err("Identifiant de discussion invalide".into()); }
    let root = base.join(thread_id);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let canonical_base = fs::canonicalize(base).map_err(|e| e.to_string())?;
    let canonical_root = fs::canonicalize(&root).map_err(|e| e.to_string())?;
    if canonical_root.parent() != Some(canonical_base.as_path()) {
        return Err("Dossier de discussion invalide".into());
    }
    Ok(root)
}

fn base_dir() -> Result<PathBuf, String> {
    Ok(dirs::home_dir().ok_or("Dossier personnel introuvable")?
        .join("Library/Application Support/atelier-studio/discussions"))
}

#[tauri::command]
pub fn discussion_workspace(thread_id: String) -> Result<String, String> {
    Ok(workspace_at(&base_dir()?, &thread_id)?.to_string_lossy().into_owned())
}

fn create_document(root: &Path, format: &str) -> Result<String, String> {
    let text = match format {
        "md" => "# Nouveau texte\n\n",
        "tex" => "\\documentclass[11pt]{article}\n\\usepackage[T1]{fontenc}\n\\usepackage[utf8]{inputenc}\n\\usepackage[french]{babel}\n\\begin{document}\n\n\\section*{Nouveau texte}\n\n\\end{document}\n",
        _ => return Err("Format attendu : Markdown ou LaTeX".into()),
    };
    for number in 1..=10000 {
        let name = if number == 1 { format!("brouillon.{format}") } else { format!("brouillon-{number}.{format}") };
        match fs::OpenOptions::new().write(true).create_new(true).open(root.join(&name)) {
            Ok(mut file) => {
                file.write_all(text.as_bytes()).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
                return Ok(name);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
    Err("Trop de brouillons dans cette discussion".into())
}

fn existing_document(root: &Path, format: &str) -> Result<Option<String>, String> {
    let extension = match format {
        "md" => "md",
        "tex" => "tex",
        _ => return Err("Format attendu : Markdown ou LaTeX".into()),
    };
    let mut names = fs::read_dir(root)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            // `Path::is_file` follows symlinks. A linked file outside the
            // managed workspace must never become the permanent draft.
            if !entry.file_type().ok()?.is_file()
                || path.extension()?.to_str()?.eq_ignore_ascii_case(extension) == false
            {
                return None;
            }
            let name = path.file_name()?.to_str()?.to_string();
            // README files are project metadata rather than the discussion
            // draft; hidden/derived files are left to the regular explorer.
            if name.starts_with('.') || name.to_ascii_lowercase().starts_with("readme") {
                return None;
            }
            Some(name)
        })
        .collect::<Vec<_>>();
    names.sort_by(|a, b| {
        // Keep the canonical Markdown/LaTeX name stable even when a numbered
        // draft was created first. This also makes reopening deterministic.
        let a_canonical = a.eq_ignore_ascii_case(&format!("brouillon.{extension}"));
        let b_canonical = b.eq_ignore_ascii_case(&format!("brouillon.{extension}"));
        b_canonical.cmp(&a_canonical).then_with(|| a.cmp(b))
    });
    Ok(names.into_iter().next())
}

fn ensure_document(root: &Path, format: &str) -> Result<String, String> {
    if let Some(existing) = existing_document(root, format)? {
        return Ok(existing);
    }
    // `create_document` already uses create_new for numbered drafts. For the
    // first draft, handle the race explicitly: two reopen operations must
    // converge on the same canonical file rather than one creating a suffix.
    if format == "md" {
        let canonical = root.join("brouillon.md");
        match fs::OpenOptions::new().write(true).create_new(true).open(&canonical) {
            Ok(mut file) => {
                file.write_all(b"# Nouveau texte\n\n")
                    .and_then(|_| file.sync_all())
                    .map_err(|e| e.to_string())?;
                return Ok("brouillon.md".into());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                // Another caller won the create_new race. Confirm that the
                // winner is a regular file before returning its path: a
                // pre-existing symlink or directory must never become the
                // editor's permanent draft.
                match fs::symlink_metadata(&canonical) {
                    Ok(meta) if meta.file_type().is_file() => return Ok("brouillon.md".into()),
                    Ok(_) => return Err("Le brouillon canonique n'est pas un fichier".into()),
                    Err(meta_error) => return Err(meta_error.to_string()),
                }
            }
            Err(error) => return Err(error.to_string()),
        }
    }
    create_document(root, format)
}

/// Return the stable discussion draft when one exists, creating the first
/// Markdown/LaTeX document otherwise. Re-opening a discussion therefore
/// never creates another draft or loses local edits.
#[tauri::command]
pub fn discussion_ensure_document(thread_id: String, format: String) -> Result<String, String> {
    let root = workspace_at(&base_dir()?, &thread_id)?;
    ensure_document(&root, &format)
}

#[tauri::command]
pub fn discussion_create_document(thread_id: String, format: String) -> Result<String, String> {
    create_document(&workspace_at(&base_dir()?, &thread_id)?, &format)
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "12345678-1234-4321-abcd-123456789012";
    #[test]
    fn persistent_and_isolated() {
        let dir = tempfile::tempdir().unwrap();
        let root = workspace_at(dir.path(), ID).unwrap();
        let first = create_document(&root, "md").unwrap();
        fs::write(root.join(&first), "texte conservé").unwrap();
        let reopened = workspace_at(dir.path(), ID).unwrap();
        assert_eq!(root, reopened);
        assert_ne!(first, create_document(&reopened, "md").unwrap());
        assert_eq!(fs::read_to_string(root.join(first)).unwrap(), "texte conservé");
        assert_ne!(root, workspace_at(dir.path(), "87654321-1234-4321-abcd-123456789012").unwrap());
        assert!(create_document(&root, "tex").is_ok());
        assert!(create_document(&root, "../md").is_err());
        assert!(workspace_at(dir.path(), "../escape").is_err());
    }

    #[test]
    fn ensure_reuses_the_same_user_draft_and_ignores_readme() {
        let dir = tempfile::tempdir().unwrap();
        let root = workspace_at(dir.path(), ID).unwrap();
        fs::write(root.join("README.md"), "metadata").unwrap();
        fs::write(root.join("notes.md"), "local edits").unwrap();
        assert_eq!(existing_document(&root, "md").unwrap().as_deref(), Some("notes.md"));
        assert_eq!(existing_document(&root, "tex").unwrap(), None);
        assert_eq!(ensure_document(&root, "md").unwrap(), "notes.md");
        fs::remove_file(root.join("notes.md")).unwrap();
        assert_eq!(ensure_document(&root, "md").unwrap(), "brouillon.md");
        assert_eq!(ensure_document(&root, "md").unwrap(), "brouillon.md");
        assert_eq!(fs::read_to_string(root.join("brouillon.md")).unwrap(), "# Nouveau texte\n\n");
    }

    #[cfg(unix)]
    #[test]
    fn ensure_ignores_a_markdown_symlink_outside_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let root = workspace_at(dir.path(), ID).unwrap();
        fs::write(other.path().join("notes.md"), "outside").unwrap();
        std::os::unix::fs::symlink(other.path().join("notes.md"), root.join("notes.md")).unwrap();
        assert_eq!(existing_document(&root, "md").unwrap(), None);
        assert_eq!(ensure_document(&root, "md").unwrap(), "brouillon.md");
    }

    #[cfg(unix)]
    #[test]
    fn ensure_rejects_a_canonical_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let root = workspace_at(dir.path(), ID).unwrap();
        fs::write(other.path().join("draft.md"), "outside").unwrap();
        std::os::unix::fs::symlink(other.path().join("draft.md"), root.join("brouillon.md")).unwrap();
        assert!(ensure_document(&root, "md").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn refuses_workspace_symlink_outside_base() {
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(other.path(), dir.path().join(ID)).unwrap();
        assert!(workspace_at(dir.path(), ID).is_err());
    }
}
