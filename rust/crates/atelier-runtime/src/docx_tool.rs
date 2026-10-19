//! Outil `atelier_docx` : l'agent lit un .docx du projet et y propose des
//! retouches, toujours en suivi des modifications et signées de son nom
//! (« Claude », « Codex »…). Il n'accepte ni ne refuse aucun suivi et ne
//! résout aucun commentaire : ces décisions restent à l'utilisateur, dans le
//! panneau .docx ou dans Word.

use atelier_docx::ops::{self, Op};
use atelier_docx::{Docx, Signature};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

use crate::state::AppState;

/// Plafond du texte rendu par `read` : au-delà, la suite est annoncée.
const READ_MAX_CHARS: usize = 60_000;

/// Nom porté par les suivis et les commentaires de l'agent.
pub fn author_for(provider: &str) -> &'static str {
    match provider {
        "claude" => "Claude",
        other => crate::agent_mcp::provider_label(other),
    }
}

/// Chemin du document : relatif au projet ou absolu, mais toujours dedans.
fn resolve(project_root: &str, requested: &str) -> Result<PathBuf, String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err("path manquant : chemin du .docx dans le projet".into());
    }
    let p = Path::new(requested);
    if !p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("docx")) {
        return Err("ce n'est pas un fichier .docx".into());
    }
    let root = Path::new(project_root).canonicalize().map_err(|e| format!("projet illisible : {e}"))?;
    let candidate = if p.is_absolute() { p.to_path_buf() } else { root.join(p) };
    let resolved = candidate.canonicalize().map_err(|_| format!("fichier introuvable : {requested}"))?;
    if !resolved.starts_with(&root) {
        return Err("le document doit être dans le projet".into());
    }
    Ok(resolved)
}

/// Image du projet à insérer (PNG, JPEG, GIF).
fn resolve_figure(project_root: &str, requested: &str) -> Result<PathBuf, String> {
    let root = Path::new(project_root).canonicalize().map_err(|e| format!("projet illisible : {e}"))?;
    let p = Path::new(requested);
    let candidate = if p.is_absolute() { p.to_path_buf() } else { root.join(p) };
    let resolved = candidate.canonicalize().map_err(|_| format!("figure introuvable : {requested}"))?;
    if !resolved.starts_with(&root) {
        return Err("la figure doit être dans le projet".into());
    }
    let ok = resolved.extension().and_then(|e| e.to_str()).is_some_and(|e| ["png", "jpg", "jpeg", "gif"].iter().any(|x| e.eq_ignore_ascii_case(x)));
    if !ok {
        return Err("figure : PNG, JPEG ou GIF".into());
    }
    Ok(resolved)
}

fn str_arg<'a>(req: &'a Value, key: &str) -> Option<&'a str> {
    req.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn usize_arg(req: &Value, key: &str) -> Option<usize> {
    req.get(key).and_then(Value::as_u64).map(|n| n as usize)
}

/// Traduit l'appel de l'agent en retouche. Seules les retouches proposables
/// sont exposées : jamais accepter, refuser, résoudre ni supprimer.
fn op_of(action: &str, req: &Value) -> Result<Op, String> {
    let need = |k: &str| str_arg(req, k).map(str::to_string).ok_or_else(|| format!("{k} manquant"));
    let paragraph = str_arg(req, "paragraph").map(str::to_string);
    let occurrence = usize_arg(req, "occurrence");
    Ok(match action {
        "edit" => Op::Replace {
            paragraph,
            find: need("find")?,
            occurrence,
            with: req.get("with").and_then(Value::as_str).unwrap_or("").to_string(),
        },
        "insert_paragraph" => Op::InsertParagraph { after: need("after")?, text: need("text")? },
        "insert_row" => Op::InsertRow { paragraph: paragraph.ok_or("paragraph manquant : une cellule du tableau (p7)")?, above: req.get("above").and_then(Value::as_bool).unwrap_or(false) },
        "delete_row" => Op::DeleteRow { paragraph: paragraph.ok_or("paragraph manquant : une cellule du tableau (p7)")? },
        "comment" => Op::Comment { paragraph, find: need("find")?, occurrence, text: need("text")? },
        "reply" => Op::Reply {
            parent: req.get("comment").and_then(Value::as_u64).ok_or("comment manquant : numéro du commentaire (c3 → 3)")? as u32,
            text: need("text")?,
        },
        "format" => {
            let has_para = req.get("style").is_some() || req.get("align").is_some();
            let has_run = ["bold", "italic", "underline", "strike", "superscript", "subscript", "font", "size", "highlight"].iter().any(|k| req.get(*k).is_some());
            if has_para == has_run {
                return Err("format : soit style/align (paragraphe entier, avec paragraph), soit bold/italic/… (passage find)".into());
            }
            if has_para {
                let props = serde_json::from_value(json!({"style": req.get("style"), "align": req.get("align")})).map_err(|e| e.to_string())?;
                Op::FormatParagraph { paragraph: paragraph.ok_or("paragraph manquant")?, props }
            } else {
                let props = serde_json::from_value(json!({
                    "b": req.get("bold"), "i": req.get("italic"), "u": req.get("underline"), "strike": req.get("strike"),
                    "sup": req.get("superscript"), "sub": req.get("subscript"), "font": req.get("font"), "size": req.get("size"),
                    "highlight": req.get("highlight"),
                }))
                .map_err(|e| e.to_string())?;
                Op::FormatText { paragraph, find: need("find")?, occurrence, props }
            }
        }
        _ => return Err(format!("action inconnue : {action}")),
    })
}

fn run(project_root: &str, provider: &str, action: &str, req: &Value) -> Result<Value, String> {
    let path = resolve(project_root, str_arg(req, "path").unwrap_or(""))?;
    if action == "read" {
        let mut docx = Docx::open(&path).map_err(|e| e.0)?;
        let model = docx.model().map_err(|e| e.0)?;
        let from = usize_arg(req, "from").unwrap_or(0);
        let to = usize_arg(req, "to").map(|t| t + 1);
        return Ok(json!({"revision": model.revision, "text": ops::outline(&model, from, to, READ_MAX_CHARS)}));
    }
    let sig = Signature::now(author_for(provider));
    let expected = str_arg(req, "revision");
    let (result, revision) = if action == "insert_note" || action == "insert_figure" {
        // Placé juste après `find` ; la figure vient du projet.
        let find = str_arg(req, "find").ok_or("find manquant : le texte juste avant l'appel de note ou la figure")?.to_string();
        let mut bytes = None;
        if action == "insert_figure" {
            let fig = str_arg(req, "figure").ok_or("figure manquant : chemin de l'image dans le projet")?;
            let fpath = resolve_figure(project_root, fig)?;
            bytes = Some(std::fs::read(&fpath).map_err(|e| format!("figure illisible : {e}"))?);
        }
        let (paragraph, occurrence) = (str_arg(req, "paragraph").map(str::to_string), usize_arg(req, "occurrence"));
        atelier_docx::edit_file(&path, expected, |d| {
            let (p, at) = ops::place_after(d, paragraph.as_deref(), &find, occurrence)?;
            let mut op = if action == "insert_note" {
                Op::InsertNote { paragraph: p.clone(), at, text: str_arg(req, "text").unwrap_or("").to_string(), endnote: false }
            } else {
                Op::InsertImage { paragraph: p.clone(), at, path: str_arg(req, "figure").unwrap_or("").to_string(), alt: str_arg(req, "text").unwrap_or("").to_string(), bytes: None }
            };
            op.load_images(&mut |_| Ok(bytes.clone().unwrap_or_default()))?;
            let mut r = ops::apply(d, &op, true, &sig)?;
            r["paragraph"] = json!(p);
            Ok(r)
        })
        .map_err(|e| e.0)?
    } else {
        let op = op_of(action, req)?;
        atelier_docx::edit_file(&path, expected, |d| ops::apply(d, &op, true, &sig)).map_err(|e| e.0)?
    };
    // Le paragraphe touché, relu tel qu'il est maintenant sur le disque.
    let para = result.get("paragraph").and_then(Value::as_str).map(str::to_string).or_else(|| str_arg(req, "paragraph").map(str::to_string));
    let mut out = json!({"ok": true, "author": sig.author, "revision": revision, "result": result});
    if let Some(p) = para.and_then(|p| p.strip_prefix('p').and_then(|n| n.parse::<usize>().ok())) {
        let mut docx = Docx::open(&path).map_err(|e| e.0)?;
        let model = docx.model().map_err(|e| e.0)?;
        let text = ops::outline(&model, p, Some(p + 1), READ_MAX_CHARS);
        out["now"] = json!(text.lines().find(|l| l.starts_with(&format!("p{p} "))).unwrap_or(""));
    }
    out["note"] = json!("Proposé en suivi des modifications : l'utilisateur l'accepte ou le refuse dans le panneau .docx ou dans Word.");
    Ok(out)
}

/// Point d'entrée du pont : `docx_<action>`.
pub async fn action(state: &AppState, caller_id: &str, action: &str, req: &Value) -> Result<Value, String> {
    let (project_root, provider) = {
        let store = state.threads().lock().await;
        let caller = store.get(caller_id).ok_or_else(|| atelier_protocol::agent_mcp_errors::CALLER_UNKNOWN.to_string())?;
        (caller.project_root.clone(), caller.provider.clone())
    };
    let action = action.trim_start_matches("docx_").to_string();
    let req = req.clone();
    match tokio::task::spawn_blocking(move || run(&project_root, &provider, &action, &req)).await {
        Ok(Ok(v)) => Ok(v),
        // Une retouche refusée n'est pas une panne : l'agent lit la raison et corrige.
        Ok(Err(message)) => Ok(json!({"ok": false, "error": message})),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(root: &Path) -> PathBuf {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../atelier-docx/tests/fixtures/christophe");
        let mut files = Vec::new();
        fn walk(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
            for e in std::fs::read_dir(dir).unwrap() {
                let p = e.unwrap().path();
                if p.is_dir() {
                    walk(root, &p, out);
                } else {
                    out.push((p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/"), p));
                }
            }
        }
        walk(&dir, &dir, &mut files);
        files.sort_by_key(|(rel, _)| (rel != "[Content_Types].xml", rel.clone()));
        let mut z = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (rel, p) in files {
            use std::io::Write;
            z.start_file(rel, zip::write::SimpleFileOptions::default()).unwrap();
            z.write_all(&std::fs::read(p).unwrap()).unwrap();
        }
        let path = root.join("article.docx");
        std::fs::write(&path, z.finish().unwrap().into_inner()).unwrap();
        path
    }

    #[test]
    fn l_agent_lit_puis_propose_en_suivi_signe_de_son_nom() {
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        let root = dir.path().to_str().unwrap();
        let read = run(root, "codex", "read", &json!({"path": "article.docx"})).unwrap();
        assert!(read["text"].as_str().unwrap().contains("c1 Christophe"));
        let rev = read["revision"].as_str().unwrap();

        let r = run(root, "claude", "edit", &json!({"path": "article.docx", "find": "compromis", "with": "équilibre", "revision": rev})).unwrap();
        assert_eq!(r["author"], "Claude");
        assert!(r["now"].as_str().unwrap().contains("[+équilibre+]"), "{r}");
        // Version périmée : refusée.
        let e = run(root, "claude", "edit", &json!({"path": "article.docx", "find": "pureté", "with": "netteté", "revision": rev})).unwrap_err();
        assert!(e.contains("conflit"), "{e}");

        let r = run(root, "codex", "reply", &json!({"path": path.to_str().unwrap(), "comment": 1, "text": "Seuil justifié en 2.3."})).unwrap();
        assert_eq!(r["author"], "Codex");
        run(root, "claude", "format", &json!({"path": "article.docx", "find": "MOD09GA", "bold": true})).unwrap();
        run(root, "claude", "format", &json!({"path": "article.docx", "paragraph": "p2", "align": "both"})).unwrap();
        run(root, "claude", "insert_paragraph", &json!({"path": "article.docx", "after": "p2", "text": "Nouveau."})).unwrap();

        let mut d = Docx::open(&path).unwrap();
        let m = d.model().unwrap();
        assert!(m.changes.iter().filter(|c| c.author == "Claude").count() >= 4);
        assert!(m.comments.iter().any(|c| c.author == "Codex" && c.parent == Some(1)));
        // Notes et figures, en suivi signé ; la note de Christophe se retouche.
        let r = run(root, "claude", "insert_note", &json!({"path": "article.docx", "find": "réflectances de surface", "text": "Bandes 1 à 7."})).unwrap();
        assert_eq!(r["result"]["id"], "n2", "{r}");
        run(root, "claude", "edit", &json!({"path": "article.docx", "paragraph": "n1.p0", "find": "juillet", "with": "juin"})).unwrap();
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&[0, 0, 0, 4, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
        std::fs::create_dir_all(dir.path().join("figures")).unwrap();
        std::fs::write(dir.path().join("figures/a.png"), &png).unwrap();
        run(root, "claude", "insert_figure", &json!({"path": "article.docx", "find": "Nouveau.", "figure": "figures/a.png", "text": "Albédo"})).unwrap();
        assert!(run(root, "claude", "insert_figure", &json!({"path": "article.docx", "find": "Nouveau.", "figure": "../a.png"})).unwrap_err().contains("introuvable") );
        let read = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap();
        assert!(read["text"].as_str().unwrap().contains("Bandes 1 à 7.+]"), "{}", read["text"]);
        let cell = read["text"].as_str().unwrap().lines().find(|l| l.contains("[tableau 0 ligne 0 cellule 0]")).unwrap().split(' ').next().unwrap().to_string();
        run(root, "claude", "insert_row", &json!({"path": "article.docx", "paragraph": cell})).unwrap();
        run(root, "claude", "delete_row", &json!({"path": "article.docx", "paragraph": cell})).unwrap();
        let m = Docx::open(&path).unwrap().model().unwrap();
        assert!(m.changes.iter().any(|c| c.kind == "row-ins" && c.author == "Claude"));
        assert!(m.changes.iter().any(|c| c.kind == "row-del" && c.author == "Claude"));

        // Les décisions ne sont pas exposées.
        for forbidden in ["accept", "reject", "accept_all", "resolve", "delete_comment"] {
            assert!(op_of(forbidden, &json!({})).is_err());
        }
    }

    #[test]
    fn hors_du_projet_ou_autre_extension_refuses() {
        let dir = tempfile::tempdir().unwrap();
        fixture(dir.path());
        let root = dir.path().join("sous");
        std::fs::create_dir(&root).unwrap();
        let r = root.to_str().unwrap();
        assert!(run(r, "claude", "read", &json!({"path": "../article.docx"})).unwrap_err().contains("dans le projet"));
        assert!(run(r, "claude", "read", &json!({"path": "notes.md"})).unwrap_err().contains(".docx"));
    }
}
