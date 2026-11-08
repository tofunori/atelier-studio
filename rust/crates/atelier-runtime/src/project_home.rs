//! Écran d'ouverture des projets (bureau, 2026-11-08).
//!
//! `cards` décrit chaque dossier de projet pour sa carte : la première page
//! du PDF compilé (vignette PNG en data URL), la revue lue dans la source
//! LaTeX et la date de la dernière modification de cette source. Rien n'est
//! écrit dans le dossier du projet : les vignettes vivent dans le cache de
//! l'app (`{app_dir}/project-thumbs/`), rendues par `qlmanage` sur macOS.
//!
//! `create` fabrique le dossier d'un nouveau projet, en recopiant au besoin
//! l'arborescence (dossiers seulement, aucun fichier) d'un projet existant.
use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, UNIX_EPOCH};

/// Au plus autant de cartes par demande : le bureau en montre trois.
pub const MAX_CARDS: usize = 12;
const THUMB_SIZE: &str = "480";
const MAX_THUMB_BYTES: u64 = 2 * 1024 * 1024;
const MAX_TEX_BYTES: u64 = 512 * 1024;
const RENDER_TIMEOUT: Duration = Duration::from_secs(15);
const PNG_MAGIC: &[u8] = b"\x89PNG\r\n\x1a\n";
const SKIPPED_DIRS: &[&str] = &["node_modules", "target", "__pycache__", "dist", "venv", "build", "out"];

fn mtime(path: &Path) -> Option<u64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

fn visible_dir_entries(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut out: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .map(|e| e.path())
        .collect();
    out.sort();
    out
}

/// Racines LaTeX du projet : fichiers `.tex` qui déclarent `\documentclass`,
/// à la racine ou un niveau en dessous. Les plus probables d'abord.
fn main_tex_candidates(root: &Path) -> Vec<(PathBuf, String)> {
    let mut dirs = vec![root.to_path_buf()];
    for path in visible_dir_entries(root) {
        let skipped = path.file_name().and_then(OsStr::to_str).is_some_and(|n| SKIPPED_DIRS.contains(&n));
        if path.is_dir() && !path.is_symlink() && !skipped {
            dirs.push(path);
        }
    }
    let mut found = Vec::new();
    for dir in dirs {
        for path in visible_dir_entries(&dir) {
            if path.extension().and_then(OsStr::to_str) != Some("tex") || path.is_symlink() {
                continue;
            }
            let Ok(meta) = fs::metadata(&path) else { continue };
            if !meta.is_file() || meta.len() > MAX_TEX_BYTES {
                continue;
            }
            let Ok(text) = fs::read_to_string(&path) else { continue };
            if text.lines().any(|l| l.trim_start().starts_with("\\documentclass")) {
                found.push((path, text));
            }
        }
    }
    let project = root.file_name().and_then(OsStr::to_str).unwrap_or("").to_lowercase();
    let rank = |p: &Path| {
        let stem = p.file_stem().and_then(OsStr::to_str).unwrap_or("").to_lowercase();
        let depth = usize::from(p.parent() != Some(root));
        let name = if stem == "main" { 0 } else if stem == project { 1 } else { 2 };
        (name, depth)
    };
    found.sort_by(|a, b| rank(&a.0).cmp(&rank(&b.0)).then_with(|| mtime(&b.0).cmp(&mtime(&a.0))));
    found
}

/// Revues de Copernicus, désignées par une option de `\documentclass`.
const COPERNICUS: &[(&str, &str)] = &[
    ("tc", "The Cryosphere"),
    ("acp", "Atmos. Chem. Phys."),
    ("amt", "Atmos. Meas. Tech."),
    ("bg", "Biogeosciences"),
    ("cp", "Climate of the Past"),
    ("esd", "Earth Syst. Dynam."),
    ("essd", "Earth Syst. Sci. Data"),
    ("esurf", "Earth Surf. Dynam."),
    ("gmd", "Geosci. Model Dev."),
    ("hess", "Hydrol. Earth Syst. Sci."),
    ("nhess", "Nat. Hazards Earth Syst. Sci."),
    ("os", "Ocean Science"),
    ("se", "Solid Earth"),
    ("wcd", "Weather Clim. Dynam."),
];

fn braced_after(text: &str, command: &str) -> Option<String> {
    for line in text.lines() {
        let line = line.trim_start();
        if line.starts_with('%') {
            continue;
        }
        if let Some(rest) = line.strip_prefix(command) {
            let rest = rest.trim_start().strip_prefix('{')?;
            let value: String = rest.chars().take_while(|c| *c != '}').collect();
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Revue visée par la source : `\journal{…}` (Elsevier), `\journalname{…}`
/// (AGU), ou l'option de revue de la classe `copernicus`.
pub fn journal(tex: &str) -> Option<String> {
    if let Some(name) = braced_after(tex, "\\journalname").or_else(|| braced_after(tex, "\\journal")) {
        return Some(name);
    }
    let line = tex.lines().find(|l| l.trim_start().starts_with("\\documentclass"))?;
    let class: String = line.rsplit_once('{')?.1.chars().take_while(|c| *c != '}').collect();
    if class.trim() != "copernicus" {
        return None;
    }
    let options = line.split_once('[')?.1.split_once(']')?.0;
    options.split(',').map(str::trim).find_map(|option| {
        COPERNICUS.iter().find(|(code, _)| *code == option).map(|(_, name)| name.to_string())
    })
}

/// PDF compilé d'une source : à côté d'elle, sous le même nom.
fn compiled_pdf(tex: &Path) -> Option<PathBuf> {
    let pdf = tex.with_extension("pdf");
    fs::metadata(&pdf).is_ok_and(|m| m.is_file()).then_some(pdf)
}

fn cache_key(pdf: &Path) -> Option<String> {
    let meta = fs::metadata(pdf).ok()?;
    let modified = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
    let canonical = fs::canonicalize(pdf).ok()?;
    let mut hash = Sha256::new();
    hash.update(format!("{}:{modified}:{}:{THUMB_SIZE}", canonical.to_string_lossy(), meta.len()));
    Some(hex::encode(&hash.finalize()[..16]))
}

fn read_png(path: &Path) -> Option<Vec<u8>> {
    let meta = fs::symlink_metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_THUMB_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    bytes.starts_with(PNG_MAGIC).then_some(bytes)
}

fn run_with_timeout(command: &mut Command, timeout: Duration) -> bool {
    let Ok(mut child) = command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn() else {
        return false;
    };
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.success(),
            Ok(None) if started.elapsed() < timeout => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}

/// Vignette de la première page : relue du cache, sinon rendue par
/// `program` (`qlmanage -t -s 480 -o <dossier> <pdf>`). Un échec laisse un
/// marqueur `.fail` : on ne relance pas le rendu avant que le PDF change.
fn thumbnail(pdf: &Path, cache: &Path, program: Option<&OsStr>) -> Option<Vec<u8>> {
    let key = cache_key(pdf)?;
    let target = cache.join(format!("{key}.png"));
    if let Some(bytes) = read_png(&target) {
        return Some(bytes);
    }
    let failed = cache.join(format!("{key}.fail"));
    let program = program?;
    if failed.exists() {
        return None;
    }
    fs::create_dir_all(cache).ok()?;
    let work = cache.join(format!("tmp-{key}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&work);
    fs::create_dir(&work).ok()?;
    let ok = run_with_timeout(
        Command::new(program).args(["-t", "-s", THUMB_SIZE, "-o"]).arg(&work).arg(pdf),
        RENDER_TIMEOUT,
    );
    let name = format!("{}.png", pdf.file_name()?.to_string_lossy());
    let produced = work.join(name);
    let bytes = if ok { read_png(&produced) } else { None };
    if bytes.is_some() {
        let _ = fs::rename(&produced, &target);
    } else {
        let _ = fs::write(&failed, []);
    }
    let _ = fs::remove_dir_all(&work);
    bytes
}

fn renderer() -> Option<&'static OsStr> {
    cfg!(target_os = "macos").then(|| OsStr::new("qlmanage"))
}

/// Carte d'un dossier de projet. `missing` quand le dossier n'existe plus.
pub fn card(root: &str, cache: &Path, program: Option<&OsStr>) -> Value {
    let path = Path::new(root);
    if !path.is_absolute() || !path.is_dir() {
        return json!({"root": root, "missing": true});
    }
    let candidates = main_tex_candidates(path);
    let main = candidates.first();
    // Le PDF le plus récent parmi les sources, la principale d'abord à égalité.
    let pdf = candidates
        .iter()
        .filter_map(|(tex, _)| compiled_pdf(tex))
        .max_by_key(|pdf| mtime(pdf).unwrap_or(0));
    let thumb = pdf.as_deref().and_then(|pdf| thumbnail(pdf, cache, program)).map(|png| {
        format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png))
    });
    let rel = |p: &Path| p.strip_prefix(path).unwrap_or(p).to_string_lossy().replace('\\', "/");
    json!({
        "root": root,
        "missing": false,
        "tex": main.map(|(tex, _)| rel(tex)),
        "pdf": pdf.as_deref().map(rel),
        "thumb": thumb,
        "journal": main.and_then(|(_, text)| journal(text)),
        "modifiedAt": main.and_then(|(tex, _)| mtime(tex)),
    })
}

/// Cartes de plusieurs projets, rendues en parallèle (un `qlmanage` lent ne
/// retient pas les autres).
pub fn cards(roots: &[String], app_dir: &Path) -> Vec<Value> {
    let cache = app_dir.join("project-thumbs");
    let roots: Vec<&String> = roots.iter().take(MAX_CARDS).collect();
    std::thread::scope(|scope| {
        let handles: Vec<_> = roots
            .iter()
            .map(|root| {
                let cache = &cache;
                scope.spawn(move || card(root, cache, renderer()))
            })
            .collect();
        handles
            .into_iter()
            .zip(&roots)
            .map(|(h, root)| h.join().unwrap_or_else(|_| json!({"root": root, "missing": false})))
            .collect()
    })
}

/// Nom de dossier acceptable pour un nouveau projet.
fn valid_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty()
        && trimmed == name
        && trimmed.chars().count() <= 120
        && trimmed != "."
        && trimmed != ".."
        && !trimmed.starts_with('.')
        && !trimmed.contains(['/', '\\', ':', '\0'])
}

/// Recopie l'arborescence de `from` dans `to` : dossiers seulement, sans
/// dossiers cachés ni lourds, sans suivre les liens, bornée.
fn copy_structure(from: &Path, to: &Path) -> std::io::Result<usize> {
    let mut pending = vec![(from.to_path_buf(), to.to_path_buf(), 0usize)];
    let mut created = 0usize;
    while let Some((src, dst, depth)) = pending.pop() {
        if depth >= 6 {
            continue;
        }
        for path in visible_dir_entries(&src) {
            let Ok(meta) = fs::symlink_metadata(&path) else { continue };
            let name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
            if !meta.is_dir() || SKIPPED_DIRS.contains(&name.to_string_lossy().as_ref()) {
                continue;
            }
            if created >= 500 {
                return Ok(created);
            }
            let next = dst.join(&name);
            fs::create_dir(&next)?;
            created += 1;
            pending.push((path, next, depth + 1));
        }
    }
    Ok(created)
}

/// Crée `{parent}/{name}` (refusé s'il existe déjà) ; `template`, s'il est
/// donné, prête son arborescence. Renvoie le chemin du nouveau projet.
pub fn create(parent: &str, name: &str, template: Option<&str>) -> Result<String, String> {
    if !valid_name(name) {
        return Err("Nom de projet invalide".into());
    }
    let parent = Path::new(parent);
    if !parent.is_absolute() || !parent.is_dir() {
        return Err("Emplacement introuvable".into());
    }
    let root = parent.join(name);
    if fs::symlink_metadata(&root).is_ok() {
        return Err("Un dossier de ce nom existe déjà à cet emplacement".into());
    }
    fs::create_dir(&root).map_err(|e| format!("Création impossible : {e}"))?;
    if let Some(template) = template.filter(|t| !t.is_empty()) {
        let template = Path::new(template);
        if template.is_absolute() && template.is_dir() {
            copy_structure(template, &root).map_err(|e| format!("Copie de la structure impossible : {e}"))?;
        }
    }
    Ok(root.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nfake";

    #[test]
    fn reads_the_journal_from_common_classes() {
        assert_eq!(journal("\\documentclass[tc, manuscript]{copernicus}\n").as_deref(), Some("The Cryosphere"));
        assert_eq!(journal("\\documentclass{elsarticle}\n\\journal{Remote Sensing of Environment}\n").as_deref(), Some("Remote Sensing of Environment"));
        assert_eq!(journal("\\documentclass{agujournal2019}\n\\journalname{JGR: Earth Surface}\n").as_deref(), Some("JGR: Earth Surface"));
        assert_eq!(journal("\\documentclass{article}\n% \\journal{Ignored}\n"), None);
    }

    #[test]
    fn finds_main_source_and_its_compiled_pdf() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Chapitre1");
        fs::create_dir_all(root.join("annexes")).unwrap();
        fs::create_dir_all(root.join("node_modules")).unwrap();
        fs::write(root.join("notes.tex"), "\\section{x}").unwrap();
        fs::write(root.join("annexes/supp.tex"), "\\documentclass{article}").unwrap();
        fs::write(root.join("node_modules/x.tex"), "\\documentclass{article}").unwrap();
        fs::write(root.join("main.tex"), "\\documentclass[tc]{copernicus}").unwrap();
        fs::write(root.join("main.pdf"), b"%PDF").unwrap();
        let cache = dir.path().join("cache");
        let found = card(root.to_str().unwrap(), &cache, None);
        assert_eq!(found["tex"], "main.tex");
        assert_eq!(found["pdf"], "main.pdf");
        assert_eq!(found["journal"], "The Cryosphere");
        assert!(found["thumb"].is_null());
        assert!(found["modifiedAt"].is_u64());
        assert_eq!(card(dir.path().join("absent").to_str().unwrap(), &cache, None)["missing"], true);
    }

    #[cfg(unix)]
    #[test]
    fn renders_once_then_reads_the_cache() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("main.tex"), "\\documentclass{article}").unwrap();
        fs::write(root.join("main.pdf"), b"%PDF").unwrap();
        let png = dir.path().join("page.png");
        fs::write(&png, PNG).unwrap();
        let count = dir.path().join("count");
        let tool = dir.path().join("fake-qlmanage");
        // qlmanage -t -s 480 -o <dossier> <pdf> → <dossier>/<nom du pdf>.png
        fs::write(&tool, format!("#!/bin/sh\necho x >> '{}'\ncp '{}' \"$5/$(basename \"$6\").png\"\n", count.display(), png.display())).unwrap();
        fs::set_permissions(&tool, fs::Permissions::from_mode(0o755)).unwrap();
        let cache = dir.path().join("cache");
        let first = card(root.to_str().unwrap(), &cache, Some(tool.as_os_str()));
        assert!(first["thumb"].as_str().unwrap().starts_with("data:image/png;base64,"));
        let second = card(root.to_str().unwrap(), &cache, Some(tool.as_os_str()));
        assert_eq!(first["thumb"], second["thumb"]);
        assert_eq!(fs::read_to_string(&count).unwrap().lines().count(), 1);
        // le dossier du projet n'a rien reçu
        let mut names: Vec<_> = fs::read_dir(&root).unwrap().flatten().map(|e| e.file_name()).collect();
        names.sort();
        assert_eq!(names, vec!["main.pdf", "main.tex"]);
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_render_is_not_retried_until_the_pdf_changes() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("main.pdf");
        fs::write(&pdf, b"%PDF").unwrap();
        let count = dir.path().join("count");
        let tool = dir.path().join("broken");
        fs::write(&tool, format!("#!/bin/sh\necho x >> '{}'\nexit 1\n", count.display())).unwrap();
        fs::set_permissions(&tool, fs::Permissions::from_mode(0o755)).unwrap();
        let cache = dir.path().join("cache");
        assert!(thumbnail(&pdf, &cache, Some(tool.as_os_str())).is_none());
        assert!(thumbnail(&pdf, &cache, Some(tool.as_os_str())).is_none());
        assert_eq!(fs::read_to_string(&count).unwrap().lines().count(), 1);
    }

    #[test]
    fn creates_a_project_with_the_structure_of_another() {
        let dir = tempfile::tempdir().unwrap();
        let model = dir.path().join("Chapitre1");
        fs::create_dir_all(model.join("figures/brutes")).unwrap();
        fs::create_dir_all(model.join(".git")).unwrap();
        fs::create_dir_all(model.join("sections")).unwrap();
        fs::write(model.join("main.tex"), "x").unwrap();
        fs::write(model.join("sections/intro.tex"), "x").unwrap();
        let parent = dir.path().to_str().unwrap();
        let root = create(parent, "Chapitre3", Some(model.to_str().unwrap())).unwrap();
        let root = Path::new(&root);
        assert!(root.join("figures/brutes").is_dir());
        assert!(root.join("sections").is_dir());
        assert!(!root.join(".git").exists());
        assert!(!root.join("main.tex").exists());
        assert!(!root.join("sections/intro.tex").exists());
        assert!(create(parent, "Chapitre3", None).unwrap_err().contains("existe déjà"));
        for bad in ["", " x", "a/b", "..", ".cache"] {
            assert!(create(parent, bad, None).is_err(), "{bad:?}");
        }
        assert!(create("relative", "x", None).is_err());
    }
}
