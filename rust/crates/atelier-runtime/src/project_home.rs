//! Écran d'ouverture des projets (bureau, 2026-11-08).
//!
//! `cards` décrit chaque dossier de projet pour sa carte : la première page
//! du PDF compilé (vignette PNG en data URL), la revue lue dans la source
//! LaTeX et la date de la dernière modification de cette source. Un projet
//! sans PDF compilé montre son document le plus récent (première page d'un
//! .docx, comme la vignette Word de la galerie, ou d'un .pdf), sinon ses
//! premiers fichiers (grille de l'accueil, 2026-11-13). Rien n'est
//! écrit dans le dossier du projet : les vignettes vivent dans le cache de
//! l'app (`{app_dir}/project-thumbs/`), rendues par `atelier-pdf thumb`
//! (PDFium ; `qlmanage` seulement si l'outil manque, sur macOS).
//!
//! `create` fait d'un dossier choisi un nouveau projet, sans créer de
//! sous-dossier (Thierry, 2026-11-13 : « le dossier choisi devient le
//! projet ») ; il y ajoute au besoin l'arborescence (dossiers seulement,
//! aucun fichier) d'un projet existant, sans toucher à ce qui s'y trouve.
use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use atelier_pdf::tool::Thumbnailer;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, UNIX_EPOCH};

/// Au plus autant de cartes par demande (la grille de l'accueil).
pub const MAX_CARDS: usize = 24;
/// Fichiers montrés sur la carte d'un dossier sans document.
const MAX_FILES: usize = 6;
const MAX_PREVIEW_BYTES: u64 = 1024 * 1024;
const THUMB_SIZE: u16 = 480;
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

/// La racine du projet et ses sous-dossiers directs (ni cachés, ni lourds,
/// ni liens symboliques).
fn project_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = vec![root.to_path_buf()];
    for path in visible_dir_entries(root) {
        let skipped = path.file_name().and_then(OsStr::to_str).is_some_and(|n| SKIPPED_DIRS.contains(&n));
        if path.is_dir() && !path.is_symlink() && !skipped {
            dirs.push(path);
        }
    }
    dirs
}

/// Racines LaTeX du projet : fichiers `.tex` qui déclarent `\documentclass`,
/// à la racine ou un niveau en dessous. Les plus probables d'abord.
fn main_tex_candidates(root: &Path) -> Vec<(PathBuf, String)> {
    let mut found = Vec::new();
    for dir in project_dirs(root) {
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
/// `program` (écrit `<dossier>/<nom du pdf>.png`). Un échec laisse un
/// marqueur `.fail` : on ne relance pas le rendu avant que le PDF change.
fn thumbnail(pdf: &Path, cache: &Path, program: Option<&Thumbnailer>) -> Option<Vec<u8>> {
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
        &mut program.command(pdf, &work, THUMB_SIZE),
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

/// Document le plus récent du projet (`.docx` ou `.pdf`, à la racine ou un
/// niveau en dessous), pour un projet sans PDF compilé. Les fichiers de
/// verrou de Word (`~$…`) sont ignorés.
fn latest_document(root: &Path) -> Option<PathBuf> {
    let mut best: Option<(u64, PathBuf)> = None;
    for dir in project_dirs(root) {
        for path in visible_dir_entries(&dir) {
            let ext = path.extension().and_then(OsStr::to_str).map(str::to_ascii_lowercase);
            if !matches!(ext.as_deref(), Some("docx" | "pdf")) || path.is_symlink() {
                continue;
            }
            if path.file_name().and_then(OsStr::to_str).is_some_and(|n| n.starts_with("~$")) {
                continue;
            }
            let Ok(meta) = fs::metadata(&path) else { continue };
            if !meta.is_file() {
                continue;
            }
            let at = mtime(&path).unwrap_or(0);
            if best.as_ref().is_none_or(|(t, _)| at > *t) {
                best = Some((at, path));
            }
        }
    }
    best.map(|(_, path)| path)
}

/// Première page d'un `.docx` (format, marges, paragraphes allégés : la même
/// donnée que `/docx/peek` de la galerie), gardée dans le cache tant que le
/// fichier ne change pas. Un échec laisse un marqueur `.fail`.
fn docx_preview(docx: &Path, cache: &Path) -> Option<Value> {
    let key = cache_key(docx)?;
    let target = cache.join(format!("{key}.docx.json"));
    if fs::metadata(&target).is_ok_and(|m| m.is_file() && m.len() <= MAX_PREVIEW_BYTES) {
        if let Some(value) = fs::read_to_string(&target).ok().and_then(|t| serde_json::from_str(&t).ok()) {
            return Some(value);
        }
    }
    let failed = cache.join(format!("{key}.fail"));
    if failed.exists() {
        return None;
    }
    fs::create_dir_all(cache).ok()?;
    let value = atelier_docx::Docx::open(docx)
        .and_then(|mut d| d.model())
        .ok()
        .and_then(|model| serde_json::to_value(atelier_docx::preview::first_page(&model)).ok());
    match &value {
        Some(v) => {
            let text = v.to_string();
            if text.len() as u64 <= MAX_PREVIEW_BYTES {
                let _ = fs::write(&target, text);
            }
        }
        None => {
            let _ = fs::write(&failed, []);
        }
    }
    value
}

/// Premiers éléments du dossier (sous-dossiers d'abord), pour la carte
/// d'un projet sans document.
fn first_entries(root: &Path) -> Vec<Value> {
    let mut entries: Vec<(bool, String)> = visible_dir_entries(root)
        .into_iter()
        .filter_map(|p| Some((!p.is_dir(), p.file_name()?.to_string_lossy().into_owned())))
        .collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.to_lowercase().cmp(&b.1.to_lowercase())));
    entries
        .into_iter()
        .take(MAX_FILES)
        .map(|(file, name)| json!({"name": name, "dir": !file}))
        .collect()
}

fn renderer() -> Option<Thumbnailer> {
    Thumbnailer::locate()
}

/// Carte d'un dossier de projet. `missing` quand le dossier n'existe plus.
pub fn card(root: &str, cache: &Path, program: Option<&Thumbnailer>) -> Value {
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
    let as_data_url = |png: Vec<u8>| {
        format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png))
    };
    let mut thumb = pdf.as_deref().and_then(|pdf| thumbnail(pdf, cache, program)).map(as_data_url);
    // Sans PDF compilé : le document le plus récent du dossier.
    let document = if pdf.is_none() { latest_document(path) } else { None };
    let mut docx = None;
    if let Some(doc) = &document {
        if doc.extension().and_then(OsStr::to_str).is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
            thumb = thumbnail(doc, cache, program).map(as_data_url);
        } else {
            docx = docx_preview(doc, cache);
        }
    }
    let files = if thumb.is_none() && docx.is_none() { first_entries(path) } else { Vec::new() };
    let rel = |p: &Path| p.strip_prefix(path).unwrap_or(p).to_string_lossy().replace('\\', "/");
    json!({
        "root": root,
        "missing": false,
        "tex": main.map(|(tex, _)| rel(tex)),
        "pdf": pdf.as_deref().map(rel),
        "doc": document.as_deref().map(rel),
        "thumb": thumb,
        "docx": docx,
        "files": files,
        "journal": main.and_then(|(_, text)| journal(text)),
        "modifiedAt": main.and_then(|(tex, _)| mtime(tex)).or_else(|| document.as_deref().and_then(mtime)),
    })
}

/// Cartes de plusieurs projets, rendues en parallèle (un rendu lent ne
/// retient pas les autres).
pub fn cards(roots: &[String], app_dir: &Path) -> Vec<Value> {
    let cache = app_dir.join("project-thumbs");
    let roots: Vec<&String> = roots.iter().take(MAX_CARDS).collect();
    let program = renderer();
    std::thread::scope(|scope| {
        let handles: Vec<_> = roots
            .iter()
            .map(|root| {
                let (cache, program) = (&cache, program.as_ref());
                scope.spawn(move || card(root, cache, program))
            })
            .collect();
        handles
            .into_iter()
            .zip(&roots)
            .map(|(h, root)| h.join().unwrap_or_else(|_| json!({"root": root, "missing": false})))
            .collect()
    })
}

/// Recopie l'arborescence de `from` dans `to` : dossiers seulement, sans
/// dossiers cachés ni lourds, sans suivre les liens, bornée. Un dossier qui
/// existe déjà dans `to` est gardé tel quel ; un fichier du même nom n'est
/// jamais remplacé (la branche est sautée).
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
            match fs::symlink_metadata(&next) {
                Ok(existing) if existing.is_dir() => {}
                Ok(_) => continue,
                Err(_) => {
                    fs::create_dir(&next)?;
                    created += 1;
                }
            }
            pending.push((path, next, depth + 1));
        }
    }
    Ok(created)
}

/// Fait de `folder` (dossier existant, chemin absolu) un projet : rien n'y
/// est créé ni déplacé, sauf l'arborescence de `template` s'il est donné.
/// Renvoie le chemin du projet, c'est-à-dire `folder`.
pub fn create(folder: &str, template: Option<&str>) -> Result<String, String> {
    let trimmed = folder.trim_end_matches(['/', '\\']);
    let root = Path::new(if trimmed.is_empty() { folder } else { trimmed });
    if !root.is_absolute() || !root.is_dir() {
        return Err("Dossier introuvable".into());
    }
    if let Some(template) = template.filter(|t| !t.is_empty()) {
        let template = Path::new(template);
        if template.is_absolute() && template.is_dir() && template != root {
            copy_structure(template, root).map_err(|e| format!("Copie de la structure impossible : {e}"))?;
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
    fn a_project_without_compiled_pdf_shows_its_latest_word_document() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("2026");
        fs::create_dir_all(root.join("TP6")).unwrap();
        let docx = atelier_docx::new::create(atelier_docx::new::Template::Blank).unwrap();
        fs::write(root.join("TP6/commentaires.docx"), &docx).unwrap();
        fs::write(root.join("TP6/~$commentaires.docx"), b"lock").unwrap();
        let cache = dir.path().join("cache");
        let found = card(root.to_str().unwrap(), &cache, None);
        assert_eq!(found["doc"], "TP6/commentaires.docx");
        assert!(found["pdf"].is_null());
        assert_eq!(found["docx"]["page"]["width"], 612.0);
        assert!(found["docx"]["paragraphs"].is_array());
        assert_eq!(found["files"], json!([]));
        assert!(found["modifiedAt"].is_u64());
        // relu du cache ensuite
        let cached: Vec<_> = fs::read_dir(&cache).unwrap().flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(".docx.json")).collect();
        assert_eq!(cached.len(), 1);
        assert_eq!(card(root.to_str().unwrap(), &cache, None)["docx"], found["docx"]);
    }

    #[test]
    fn an_unreadable_word_document_is_not_retried() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("p");
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("abime.docx"), b"pas un zip").unwrap();
        let cache = dir.path().join("cache");
        let found = card(root.to_str().unwrap(), &cache, None);
        assert_eq!(found["doc"], "abime.docx");
        assert!(found["docx"].is_null());
        // pas d'aperçu : la carte montre les fichiers du dossier
        assert_eq!(found["files"], json!([{"name": "abime.docx", "dir": false}]));
        assert!(fs::read_dir(&cache).unwrap().flatten().any(|e| e.file_name().to_string_lossy().ends_with(".fail")));
    }

    #[test]
    fn a_folder_without_document_lists_its_first_entries() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("atelier");
        for d in ["src", "docs", ".git"] {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        for f in ["README.md", "b.txt", ".env"] {
            fs::write(root.join(f), "x").unwrap();
        }
        let found = card(root.to_str().unwrap(), &dir.path().join("cache"), None);
        assert!(found["doc"].is_null() && found["thumb"].is_null() && found["docx"].is_null());
        assert_eq!(found["files"], json!([
            {"name": "docs", "dir": true}, {"name": "src", "dir": true},
            {"name": "b.txt", "dir": false}, {"name": "README.md", "dir": false},
        ]));
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
        let tool = dir.path().join("fake-atelier-pdf");
        // atelier-pdf thumb 480 <dossier> <pdf> → <dossier>/<nom du pdf>.png
        fs::write(&tool, format!("#!/bin/sh\necho x >> '{}'\ncp '{}' \"$3/$(basename \"$4\").png\"\n", count.display(), png.display())).unwrap();
        fs::set_permissions(&tool, fs::Permissions::from_mode(0o755)).unwrap();
        let cache = dir.path().join("cache");
        let first = card(root.to_str().unwrap(), &cache, Some(&Thumbnailer::Tool(tool.clone())));
        assert!(first["thumb"].as_str().unwrap().starts_with("data:image/png;base64,"));
        let second = card(root.to_str().unwrap(), &cache, Some(&Thumbnailer::Tool(tool.clone())));
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
        assert!(thumbnail(&pdf, &cache, Some(&Thumbnailer::Tool(tool.clone()))).is_none());
        assert!(thumbnail(&pdf, &cache, Some(&Thumbnailer::Tool(tool.clone()))).is_none());
        assert_eq!(fs::read_to_string(&count).unwrap().lines().count(), 1);
    }

    #[test]
    fn the_chosen_folder_becomes_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("2026");
        fs::create_dir_all(folder.join("cours")).unwrap();
        fs::write(folder.join("plan.docx"), "x").unwrap();
        let path = folder.to_str().unwrap();
        // aucun sous-dossier, rien de touché : le projet est le dossier choisi
        assert_eq!(create(path, None).unwrap(), path);
        assert_eq!(create(&format!("{path}/"), None).unwrap(), path);
        let mut names: Vec<_> = fs::read_dir(&folder).unwrap().flatten().map(|e| e.file_name()).collect();
        names.sort();
        assert_eq!(names, vec!["cours", "plan.docx"]);
        assert!(create(dir.path().join("absent").to_str().unwrap(), None).is_err());
        assert!(create("relative", None).is_err());
        assert!(create(folder.join("plan.docx").to_str().unwrap(), None).is_err());
    }

    #[test]
    fn adds_the_structure_of_another_project_without_touching_what_is_there() {
        let dir = tempfile::tempdir().unwrap();
        let model = dir.path().join("Chapitre1");
        fs::create_dir_all(model.join("figures/brutes")).unwrap();
        fs::create_dir_all(model.join(".git")).unwrap();
        fs::create_dir_all(model.join("sections")).unwrap();
        fs::create_dir_all(model.join("notes")).unwrap();
        fs::write(model.join("main.tex"), "x").unwrap();
        fs::write(model.join("sections/intro.tex"), "x").unwrap();
        let folder = dir.path().join("Chapitre3");
        fs::create_dir_all(folder.join("figures")).unwrap();
        fs::write(folder.join("figures/fig1.pdf"), "garde").unwrap();
        fs::write(folder.join("notes"), "un fichier, pas un dossier").unwrap();
        let root = create(folder.to_str().unwrap(), Some(model.to_str().unwrap())).unwrap();
        let root = Path::new(&root);
        assert_eq!(root, folder);
        assert!(root.join("figures/brutes").is_dir());
        assert_eq!(fs::read_to_string(root.join("figures/fig1.pdf")).unwrap(), "garde");
        assert!(root.join("sections").is_dir());
        assert_eq!(fs::read_to_string(root.join("notes")).unwrap(), "un fichier, pas un dossier");
        assert!(!root.join(".git").exists());
        assert!(!root.join("main.tex").exists());
        assert!(!root.join("sections/intro.tex").exists());
        // une seconde fois ne change rien et ne bute pas sur l'existant
        assert!(create(folder.to_str().unwrap(), Some(model.to_str().unwrap())).is_ok());
    }
}
