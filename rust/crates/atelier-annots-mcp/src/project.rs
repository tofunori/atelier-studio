//! Le projet LaTeX vu par l'éditeur de l'artefact : la liste de ses fichiers
//! (`list_tex_project`) et les propositions de Claude encore en attente
//! (`list_revisions`, `resolve_revision`), que l'éditeur affiche dans le
//! texte avec Accepter / Refuser.
//!
//! Une proposition est notée à `propose_revision` dans
//! `$ATELIER_APP_DIR/mcp-pending-revisions.json` et retirée dès qu'elle est
//! acceptée (ici ou dans la carte de la conversation), refusée, ou que son
//! passage n'existe plus dans le fichier.

use crate::revision::{self, EDITABLE_EXT};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const FIGURE_EXT: [&str; 6] = ["pdf", "png", "jpg", "jpeg", "eps", "svg"];
const SKIPPED_DIRS: [&str; 5] = ["node_modules", "__pycache__", "build", "out", "target"];
const MAX_FILES: usize = 3_000;
const MAX_DEPTH: usize = 8;
const MAIN_CANDIDATES: usize = 200;
const MAIN_HEAD_BYTES: usize = 64_000;
const PENDING_KEPT: usize = 200;
const PENDING_MAX_AGE_MS: u64 = 7 * 24 * 3600 * 1000;

static PENDING_LOCK: Mutex<()> = Mutex::new(());

fn ext_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default()
}

fn kind_of(ext: &str) -> Option<&'static str> {
    match ext {
        "tex" | "ltx" | "tikz" => Some("tex"),
        "bib" => Some("bib"),
        "sty" | "cls" | "bst" => Some("style"),
        e if FIGURE_EXT.contains(&e) => Some("figure"),
        _ => None,
    }
}

struct Entry {
    path: PathBuf,
    rel: String,
    kind: &'static str,
    size: u64,
}

/// Parcours du dossier : fichiers du projet seulement, sans suivre les liens
/// (un lien ne doit pas faire sortir du dossier ouvert), sans dossiers cachés.
fn walk(base: &Path, dir: &Path, depth: usize, out: &mut Vec<Entry>, truncated: &mut bool) {
    let Ok(read) = std::fs::read_dir(dir) else {
        return;
    };
    let mut items: Vec<_> = read.filter_map(Result::ok).collect();
    items.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
    for item in items {
        if out.len() >= MAX_FILES {
            *truncated = true;
            return;
        }
        let name = item.file_name().to_string_lossy().to_string();
        let Ok(meta) = std::fs::symlink_metadata(item.path()) else {
            continue;
        };
        if name.starts_with('.') || meta.file_type().is_symlink() {
            continue;
        }
        let path = item.path();
        if meta.is_dir() {
            if depth < MAX_DEPTH
                && !SKIPPED_DIRS.contains(&name.as_str())
                && !name.starts_with("_minted")
            {
                walk(base, &path, depth + 1, out, truncated);
            }
        } else if let Some(kind) = kind_of(&ext_of(&path)) {
            let rel = path
                .strip_prefix(base)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(Entry {
                path,
                rel,
                kind,
                size: meta.len(),
            });
        }
    }
}

/// Le fichier principal : un .tex qui porte un `\documentclass` hors
/// commentaire, le moins profond ; à égalité, celui qui inclut d'autres
/// fichiers (`\input`, `\include`, `\subfile`), puis `main.tex`, puis
/// l'ordre alphabétique. Un document d'essai posé à côté du vrai projet ne
/// passe donc pas devant lui.
fn main_file(entries: &[Entry]) -> Option<&Entry> {
    let mut tex: Vec<&Entry> = entries
        .iter()
        .filter(|e| ext_of(&e.path) == "tex")
        .collect();
    tex.sort_by_key(|e| (e.rel.matches('/').count(), e.rel.to_lowercase()));
    tex.into_iter()
        .take(MAIN_CANDIDATES)
        .filter_map(|e| {
            let bytes = std::fs::read(&e.path).ok()?;
            let head = String::from_utf8_lossy(&bytes[..bytes.len().min(MAIN_HEAD_BYTES)]);
            let code: Vec<&str> = head
                .lines()
                .map(|line| line.trim_start())
                .filter(|line| !line.starts_with('%'))
                .collect();
            if !code.iter().any(|line| line.contains("\\documentclass")) {
                return None;
            }
            let includes = code.iter().any(|line| {
                ["\\input{", "\\include{", "\\subfile{", "\\input "]
                    .iter()
                    .any(|cmd| line.contains(cmd))
            });
            let named_main = matches!(
                revision::file_name(&e.path).to_lowercase().as_str(),
                "main.tex" | "these.tex" | "thesis.tex" | "manuscript.tex"
            );
            Some((
                (
                    e.rel.matches('/').count(),
                    !includes,
                    !named_main,
                    e.rel.to_lowercase(),
                ),
                e,
            ))
        })
        .min_by(|a, b| a.0.cmp(&b.0))
        .map(|(_, e)| e)
}

/// `list_tex_project` (réservé aux vues) : les fichiers du projet. `dir`
/// absent, le connecteur distant liste ses dossiers ouverts.
pub fn list(args: &Value, roots: Option<&[PathBuf]>) -> Result<Value, String> {
    let dir = revision::str_arg(args, "dir").trim();
    let bases: Vec<PathBuf> = if !dir.is_empty() {
        let path = revision::expand_home(dir);
        if !path.is_absolute() || !path.is_dir() {
            return Err(format!("{dir} : dossier introuvable"));
        }
        if let Some(roots) = roots {
            if !dir_allowed(&path, roots) {
                return Err(format!("{dir} : hors des dossiers ouverts au connecteur"));
            }
        }
        vec![path]
    } else if let Some(roots) = roots {
        roots.to_vec()
    } else {
        return Err("dir manquant : le chemin absolu du dossier du projet".into());
    };
    let mut projects = Vec::new();
    let mut count = 0;
    for base in &bases {
        let mut entries = Vec::new();
        let mut truncated = false;
        walk(base, base, 0, &mut entries, &mut truncated);
        count += entries.len();
        let main = main_file(&entries).map(|e| e.path.display().to_string());
        projects.push(json!({
            "path": base.display().to_string(),
            "name": revision::file_name(base),
            "main": main,
            "truncated": truncated,
            "files": entries.iter().map(|e| json!({
                "path": e.path.display().to_string(),
                "rel": e.rel,
                "kind": e.kind,
                "size": e.size,
                "editable": EDITABLE_EXT.contains(&ext_of(&e.path).as_str()),
            })).collect::<Vec<_>>(),
        }));
    }
    Ok(json!({
        "content": [{"type": "text", "text": format!("{count} fichiers de projet.")}],
        "structuredContent": {"projects": projects},
        "isError": false,
    }))
}

fn dir_allowed(dir: &Path, roots: &[PathBuf]) -> bool {
    let Ok(real) = dir.canonicalize() else {
        return false;
    };
    roots.iter().any(|root| {
        root.canonicalize()
            .map(|root| real.starts_with(root))
            .unwrap_or(false)
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn pending_file(app_dir: &Path) -> PathBuf {
    app_dir.join("mcp-pending-revisions.json")
}

fn read_pending(app_dir: &Path) -> Vec<Value> {
    std::fs::read_to_string(pending_file(app_dir))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
}

fn write_pending(app_dir: &Path, list: &[Value]) -> Result<(), String> {
    std::fs::create_dir_all(app_dir).map_err(|e| format!("écriture impossible ({e})"))?;
    let tmp = app_dir.join(".mcp-pending-revisions.json.tmp");
    let raw = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, raw).map_err(|e| format!("écriture impossible ({e})"))?;
    std::fs::rename(&tmp, pending_file(app_dir)).map_err(|e| format!("écriture impossible ({e})"))
}

fn same(entry: &Value, path: &str, quote: &str, text: &str) -> bool {
    entry["path"] == path && entry["quote"] == quote && entry["text"] == text
}

/// `propose_revision` : la proposition part à la carte de la conversation
/// et reste en attente pour l'éditeur de l'artefact.
pub fn propose(app_dir: &Path, args: &Value) -> Result<Value, String> {
    let mut out = revision::propose(args)?;
    let sc = out["structuredContent"].clone();
    let (path, quote, text) = (
        sc["path"].as_str().unwrap_or(""),
        sc["quote"].as_str().unwrap_or(""),
        sc["text"].as_str().unwrap_or(""),
    );
    let created = sc["createdAt"].as_u64().unwrap_or_else(now_ms);
    let _guard = PENDING_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = read_pending(app_dir);
    list.retain(|e| {
        created.saturating_sub(e["createdAt"].as_u64().unwrap_or(0)) < PENDING_MAX_AGE_MS
    });
    // La même proposition redonnée garde son identifiant.
    let known = list
        .iter()
        .find(|e| same(e, path, quote, text))
        .and_then(|e| e["id"].as_str().map(str::to_string));
    let id = known.unwrap_or_else(|| {
        let id = format!("{created:x}-{:08x}", rand::random::<u32>());
        list.push(json!({
            "id": id, "path": path, "file": sc["file"], "quote": quote, "text": text,
            "reason": sc["reason"], "createdAt": created,
        }));
        id
    });
    if list.len() > PENDING_KEPT {
        let extra = list.len() - PENDING_KEPT;
        list.drain(..extra);
    }
    // Sans liste d'attente, la carte de la conversation marche quand même.
    let _ = write_pending(app_dir, &list);
    out["structuredContent"]["id"] = json!(id);
    Ok(out)
}

/// `apply_revision` / `undo_revision` : la révision acceptée dans la carte
/// quitte aussi la liste d'attente.
pub fn apply(app_dir: &Path, args: &Value, undo: bool) -> Result<Value, String> {
    let out = revision::replace_once(app_dir, args, undo)?;
    if !undo {
        let (path, quote, text) = (
            revision::expand_home(revision::str_arg(args, "path").trim())
                .display()
                .to_string(),
            revision::str_arg(args, "quote"),
            revision::str_arg(args, "text"),
        );
        let _guard = PENDING_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let mut list = read_pending(app_dir);
        let before = list.len();
        list.retain(|e| !same(e, &path, quote, text));
        if list.len() != before {
            let _ = write_pending(app_dir, &list);
        }
    }
    Ok(out)
}

fn allowed(path: &str, roots: Option<&[PathBuf]>) -> bool {
    roots.is_none_or(|roots| revision::within_roots(path, roots).is_ok())
}

/// `list_revisions` (réservé aux vues) : les propositions en attente dont le
/// passage existe encore, une seule fois, dans le fichier. Les autres
/// (déjà appliquées, fichier changé) quittent la liste.
pub fn list_revisions(
    app_dir: &Path,
    args: &Value,
    roots: Option<&[PathBuf]>,
) -> Result<Value, String> {
    let only = revision::str_arg(args, "path").trim();
    let only = (!only.is_empty()).then(|| revision::expand_home(only).display().to_string());
    let _guard = PENDING_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let list = read_pending(app_dir);
    let mut kept = Vec::with_capacity(list.len());
    let mut shown = Vec::new();
    for entry in &list {
        let path = entry["path"].as_str().unwrap_or("");
        let quote = entry["quote"].as_str().unwrap_or("");
        let located = revision::read(Path::new(path)).ok().and_then(|content| {
            let range = revision::find_unique(&content, quote, "Le passage").ok()?;
            let line = revision::line_of(&content, range.start);
            let end = revision::line_of(&content, range.end.saturating_sub(1).max(range.start));
            Some((line, end, content[range].to_string()))
        });
        let Some((line, end, original)) = located else {
            continue;
        };
        kept.push(entry.clone());
        if only.as_deref().is_some_and(|p| p != path) || !allowed(path, roots) {
            continue;
        }
        let mut item = entry.clone();
        item["line"] = json!(line);
        item["endLine"] = json!(end);
        item["quote"] = json!(original);
        shown.push(item);
    }
    if kept.len() != list.len() {
        let _ = write_pending(app_dir, &kept);
    }
    Ok(json!({
        "content": [{"type": "text", "text": format!("{} proposition(s) en attente.", shown.len())}],
        "structuredContent": {"revisions": shown},
        "isError": false,
    }))
}

/// `resolve_revision` (réservé aux vues) : le clic de l'utilisateur dans
/// l'éditeur. `accept` écrit la révision (avec copie), sinon elle est retirée.
pub fn resolve(app_dir: &Path, args: &Value, roots: Option<&[PathBuf]>) -> Result<Value, String> {
    let id = revision::str_arg(args, "id").trim();
    if id.is_empty() {
        return Err("id manquant : l'identifiant de la proposition".into());
    }
    let accept = args.get("accept").and_then(Value::as_bool).unwrap_or(false);
    let entry = {
        let _guard = PENDING_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        read_pending(app_dir)
            .into_iter()
            .find(|e| e["id"] == id)
            .ok_or("Cette proposition n'est plus en attente.")?
    };
    let path = entry["path"].as_str().unwrap_or("");
    if !allowed(path, roots) {
        return Err(format!("{path} : hors des dossiers ouverts au connecteur"));
    }
    if accept {
        return apply(
            app_dir,
            &json!({"path": path, "quote": entry["quote"], "text": entry["text"]}),
            false,
        );
    }
    let _guard = PENDING_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut list = read_pending(app_dir);
    list.retain(|e| e["id"] != id);
    write_pending(app_dir, &list)?;
    Ok(json!({
        "content": [{"type": "text", "text": "Proposition refusée."}],
        "structuredContent": {"ok": true, "refused": true},
        "isError": false,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_main_file_is_the_one_that_includes_the_others() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::write(
            root.join("essai.tex"),
            "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
        )
        .unwrap();
        std::fs::write(root.join("aaa.tex"), "\\documentclass{article}\n").unwrap();
        std::fs::write(
            root.join("main.tex"),
            "\\documentclass{article}\n\\input{sections/intro}\n",
        )
        .unwrap();
        let roots = vec![root.to_path_buf()];
        let out = list(&json!({}), Some(&roots)).unwrap();
        assert_eq!(
            out["structuredContent"]["projects"][0]["main"],
            root.join("main.tex").display().to_string()
        );

        // Sans inclusion nulle part : main.tex passe devant l'ordre alphabétique.
        std::fs::write(root.join("main.tex"), "\\documentclass{article}\n").unwrap();
        let out = list(&json!({}), Some(&roots)).unwrap();
        assert_eq!(
            out["structuredContent"]["projects"][0]["main"],
            root.join("main.tex").display().to_string()
        );
    }

    #[test]
    fn lists_project_files_and_finds_the_main_one() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("article");
        std::fs::create_dir_all(root.join("sections")).unwrap();
        std::fs::create_dir_all(root.join("figures")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(
            root.join("main.tex"),
            "% \\documentclass{old}\n\\documentclass{article}\n",
        )
        .unwrap();
        std::fs::write(root.join("sections/intro.tex"), "\\section{Intro}\n").unwrap();
        std::fs::write(root.join("refs.bib"), "@article{a,}\n").unwrap();
        std::fs::write(root.join("figures/fig1.pdf"), "x").unwrap();
        std::fs::write(root.join("notes.docx"), "x").unwrap();
        std::fs::write(root.join(".git/config.tex"), "x").unwrap();
        let roots = vec![root.clone()];

        let out = list(&json!({}), Some(&roots)).unwrap();
        let project = &out["structuredContent"]["projects"][0];
        let rels: Vec<&str> = project["files"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| f["rel"].as_str().unwrap())
            .collect();
        assert_eq!(
            rels,
            [
                "figures/fig1.pdf",
                "main.tex",
                "refs.bib",
                "sections/intro.tex"
            ]
        );
        assert_eq!(project["main"], root.join("main.tex").display().to_string());
        assert_eq!(project["files"][0]["editable"], false);
        assert_eq!(project["files"][2]["kind"], "bib");

        // Un dossier hors des dossiers ouverts est refusé ; sans dossiers
        // (serveur local), `dir` est exigé.
        let outside = dir.path().display().to_string();
        assert!(list(&json!({"dir": outside}), Some(&roots)).is_err());
        assert!(list(&json!({}), None).is_err());
        let inside = root.join("sections").display().to_string();
        assert!(list(&json!({"dir": inside}), Some(&roots)).is_ok());
    }

    #[test]
    fn pending_proposals_are_listed_then_accepted_or_refused() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("app");
        let tex = dir.path().join("ch1.tex");
        std::fs::write(&tex, "Line one.\nAlbedo decreased a lot.\nLine three.\n").unwrap();
        let path = tex.display().to_string();

        let a = propose(&app, &json!({"path": path, "quote": "decreased a lot", "text": "declined by 0.02", "reason": "Chiffrer."})).unwrap();
        let b = propose(
            &app,
            &json!({"path": path, "quote": "Line three.", "text": "Third line.", "reason": ""}),
        )
        .unwrap();
        // La même proposition redonnée ne s'ajoute pas deux fois.
        propose(
            &app,
            &json!({"path": path, "quote": "Line three.", "text": "Third line.", "reason": ""}),
        )
        .unwrap();

        let listed = list_revisions(&app, &json!({"path": path}), None).unwrap();
        let revs = listed["structuredContent"]["revisions"]
            .as_array()
            .unwrap()
            .clone();
        assert_eq!(revs.len(), 2, "{revs:?}");
        assert_eq!(revs[0]["line"], 2);
        assert_eq!(revs[0]["endLine"], 2);

        let id_a = a["structuredContent"]["id"].as_str().unwrap();
        resolve(&app, &json!({"id": id_a, "accept": true}), None).unwrap();
        assert!(std::fs::read_to_string(&tex)
            .unwrap()
            .contains("declined by 0.02"));

        let id_b = b["structuredContent"]["id"].as_str().unwrap();
        // Hors des dossiers ouverts : refusé, rien ne bouge.
        let elsewhere = vec![dir.path().join("ailleurs")];
        assert!(resolve(&app, &json!({"id": id_b, "accept": true}), Some(&elsewhere)).is_err());
        let out = resolve(&app, &json!({"id": id_b, "accept": false}), None).unwrap();
        assert_eq!(out["structuredContent"]["refused"], true);
        assert!(std::fs::read_to_string(&tex)
            .unwrap()
            .contains("Line three."));

        let listed = list_revisions(&app, &json!({}), None).unwrap();
        assert_eq!(
            listed["structuredContent"]["revisions"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
        assert!(resolve(&app, &json!({"id": id_b, "accept": true}), None).is_err());
    }

    #[test]
    fn a_proposal_whose_passage_is_gone_leaves_the_list() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("app");
        let tex = dir.path().join("ch1.tex");
        std::fs::write(&tex, "Albedo decreased a lot.\n").unwrap();
        let path = tex.display().to_string();
        propose(
            &app,
            &json!({"path": path, "quote": "decreased a lot", "text": "declined"}),
        )
        .unwrap();
        // Acceptée dans la carte de la conversation : plus en attente.
        apply(
            &app,
            &json!({"path": path, "quote": "decreased a lot", "text": "declined"}),
            false,
        )
        .unwrap();
        assert!(read_pending(&app).is_empty());

        propose(
            &app,
            &json!({"path": path, "quote": "Albedo declined.", "text": "Albedo fell."}),
        )
        .unwrap();
        std::fs::write(&tex, "Rewritten by hand.\n").unwrap();
        let listed = list_revisions(&app, &json!({}), None).unwrap();
        assert_eq!(
            listed["structuredContent"]["revisions"]
                .as_array()
                .unwrap()
                .len(),
            0
        );
        assert!(read_pending(&app).is_empty());
    }
}
