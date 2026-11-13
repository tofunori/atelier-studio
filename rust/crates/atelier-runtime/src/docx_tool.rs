//! Outil `atelier_docx` : l'agent lit un .docx du projet et y propose des
//! retouches, toujours en suivi des modifications. Elles sont signées du nom
//! de l'utilisateur, comme s'il les avait tapées (Thierry, 2026-11-13), et
//! Atelier se souvient qu'elles viennent de l'agent (`atelier_docx::marks`) ;
//! ses commentaires et réponses aussi (« je veux que ça soit mon nom »,
//! 2026-11-13). Il n'accepte ni ne refuse aucun suivi et ne
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
        // Réunit `paragraph` au paragraphe qui le précède (sa marque de fin
        // est supprimée en suivi), comme Suppr en fin du paragraphe d'avant.
        "join" => Op::Join { paragraph: paragraph.ok_or("paragraph manquant : le second des deux paragraphes à réunir (p8 pour réunir p7 et p8)")? },
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

/// Nom sous lequel l'agent signe ses retouches en suivi : celui de
/// l'utilisateur (voir `atelier_docx::marks::signer`).
fn signer(project_root: &str, path: &Path) -> Result<String, String> {
    let model = Docx::open(path).and_then(|mut d| d.model()).map_err(|e| e.0)?;
    Ok(atelier_docx::marks::signer(path, Path::new(project_root), &model))
}

/// Atelier se souvient que ces suivis viennent de l'agent : le panneau les
/// montre « proposés par Claude » alors que le fichier dit « Thierry ».
fn remember(path: &Path, sig: &Signature, provider: &str) -> Result<(), String> {
    let model = Docx::open(path).and_then(|mut d| d.model()).map_err(|e| e.0)?;
    atelier_docx::marks::record(path, &model, sig, author_for(provider)).map(|_| ()).map_err(|e| e.0)
}

fn run(project_root: &str, provider: &str, action: &str, req: &Value) -> Result<Value, String> {
    let path = resolve(project_root, str_arg(req, "path").unwrap_or(""))?;
    if action == "read" {
        // Les retouches du panneau encore dans le journal de sa séance
        // passent d'abord : l'agent lit le document tel que Thierry le voit.
        let mut docx = atelier_docx::open_settled(&path).map_err(|e| e.0)?;
        let model = docx.model().map_err(|e| e.0)?;
        let from = usize_arg(req, "from").unwrap_or(0);
        let to = usize_arg(req, "to").map(|t| t + 1);
        return Ok(json!({"revision": model.revision, "text": ops::outline(&model, from, to, READ_MAX_CHARS)}));
    }
    if action == "split" {
        // Coupe juste après `find` : la fin du paragraphe devient un nouveau
        // paragraphe, en suivi (marque de paragraphe insérée).
        let find = str_arg(req, "find").ok_or("find manquant : le texte juste avant la coupure")?.to_string();
        let sig = Signature::now(&signer(project_root, &path)?);
        let paragraph = str_arg(req, "paragraph").map(str::to_string);
        let occurrence = usize_arg(req, "occurrence");
        let origin = atelier_docx::history::Origin { source: "agent", author: &sig.author, label: "paragraphe" };
        let (p, revision) = atelier_docx::edit_file_as(&path, str_arg(req, "revision"), &origin, |d| {
            let (p, at) = ops::place_after(d, paragraph.as_deref(), &find, occurrence)?;
            ops::apply(d, &Op::Split { paragraph: p.clone(), at }, true, &sig)?;
            Ok(p)
        })
        .map_err(|e| e.0)?;
        remember(&path, &sig, provider)?;
        return Ok(json!({
            "ok": true, "author": sig.author, "proposed_by": author_for(provider), "revision": revision, "result": {"paragraph": p},
            "note": "Coupure proposée en suivi des modifications : l'utilisateur l'accepte ou la refuse."
        }));
    }
    if action == "draft_reply" {
        // Brouillon dans la carte du commentaire, hors du document :
        // l'utilisateur le relit et l'envoie sous son nom.
        let comment = req.get("comment").and_then(Value::as_u64).ok_or("comment manquant : numéro du commentaire (c3 → 3)")? as u32;
        let text = str_arg(req, "text").ok_or("text manquant : le brouillon de réponse")?;
        let draft = atelier_docx::drafts::put(&path, comment, text, author_for(provider)).map_err(|e| e.0)?;
        return Ok(json!({
            "ok": true, "author": draft.author, "comment": comment,
            "note": "Brouillon posé dans la carte du commentaire, pas dans le .docx : l'utilisateur le relit, le retouche et l'envoie sous son nom. Ne le recopie pas dans ta réponse."
        }));
    }
    // Retouches, commentaires et réponses portent le nom de l'utilisateur
    // (Thierry, 2026-11-13) : l'étudiant ou le relecteur ne voit que lui.
    let speaks = matches!(action, "comment" | "reply");
    let sig = Signature::now(&signer(project_root, &path)?);
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
        let origin = atelier_docx::history::Origin { source: "agent", author: &sig.author, label: if action == "insert_note" { "note" } else { "figure" } };
        atelier_docx::edit_file_as(&path, expected, &origin, |d| {
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
        let origin = atelier_docx::history::Origin { source: "agent", author: &sig.author, label: op.label() };
        atelier_docx::edit_file_as(&path, expected, &origin, |d| ops::apply(d, &op, true, &sig)).map_err(|e| e.0)?
    };
    if !speaks {
        remember(&path, &sig, provider)?;
    }
    // Le paragraphe touché, relu tel qu'il est maintenant sur le disque.
    let para = result.get("paragraph").and_then(Value::as_str).map(str::to_string).or_else(|| str_arg(req, "paragraph").map(str::to_string));
    let mut out = json!({"ok": true, "author": sig.author, "proposed_by": author_for(provider), "revision": revision, "result": result});
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
    fn l_agent_lit_puis_propose_en_suivi_signe_du_nom_de_l_utilisateur() {
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        // Le nom choisi dans le panneau : l'agent signe sous celui-là.
        std::fs::create_dir_all(dir.path().join(".fig_thumbs")).unwrap();
        std::fs::write(dir.path().join(".fig_thumbs/docx_prefs.json"), r#"{"author":"Thierry"}"#).unwrap();
        let root = dir.path().to_str().unwrap();
        let read = run(root, "codex", "read", &json!({"path": "article.docx"})).unwrap();
        assert!(read["text"].as_str().unwrap().contains("c1 Christophe"));
        let rev = read["revision"].as_str().unwrap();

        let r = run(root, "claude", "edit", &json!({"path": "article.docx", "find": "compromis", "with": "équilibre", "revision": rev})).unwrap();
        assert_eq!(r["author"], "Thierry");
        assert_eq!(r["proposed_by"], "Claude");
        // Le fichier ne dit que « Thierry » ; Atelier sait que c'est Claude.
        let m = Docx::open(&path).unwrap().model().unwrap();
        let marks = atelier_docx::marks::list(&path, &m).unwrap();
        assert!(!marks.is_empty() && marks.values().all(|a| a == "Claude"), "{marks:?}");
        assert!(m.changes.iter().filter(|c| marks.contains_key(&c.id)).all(|c| c.author == "Thierry"));
        assert!(!m.changes.iter().any(|c| c.author == "Claude"));
        assert!(r["now"].as_str().unwrap().contains("[+équilibre+]"), "{r}");
        // Version périmée : refusée.
        let e = run(root, "claude", "edit", &json!({"path": "article.docx", "find": "pureté", "with": "netteté", "revision": rev})).unwrap_err();
        assert!(e.contains("conflit"), "{e}");

        // Brouillon de réponse : dans la carte du commentaire, pas dans le fichier.
        let before = std::fs::read(&path).unwrap();
        let r = run(root, "claude", "draft_reply", &json!({"path": "article.docx", "comment": 1, "text": "Le seuil est justifié en 2.3."})).unwrap();
        assert_eq!(r["author"], "Claude");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert_eq!(atelier_docx::drafts::list(&path).unwrap()[&1].text, "Le seuil est justifié en 2.3.");
        assert!(run(root, "claude", "draft_reply", &json!({"path": "article.docx", "comment": 2, "text": "x"})).unwrap_err().contains("c1"));
        assert!(run(root, "claude", "draft_reply", &json!({"path": "article.docx", "text": "x"})).unwrap_err().contains("comment manquant"));
        atelier_docx::drafts::clear(&path, 1).unwrap();

        let r = run(root, "codex", "reply", &json!({"path": path.to_str().unwrap(), "comment": 1, "text": "Seuil justifié en 2.3."})).unwrap();
        assert_eq!((r["author"].as_str(), r["proposed_by"].as_str()), (Some("Thierry"), Some("Codex")));
        run(root, "claude", "format", &json!({"path": "article.docx", "find": "MOD09GA", "bold": true})).unwrap();
        run(root, "claude", "format", &json!({"path": "article.docx", "paragraph": "p2", "align": "both"})).unwrap();
        run(root, "claude", "insert_paragraph", &json!({"path": "article.docx", "after": "p2", "text": "Nouveau."})).unwrap();

        let mut d = Docx::open(&path).unwrap();
        let m = d.model().unwrap();
        assert!(m.changes.iter().filter(|c| c.author == "Thierry").count() >= 4);
        assert!(atelier_docx::marks::list(&path, &m).unwrap().len() >= 4);
        // Une réponse à Christophe porte aussi le nom de l'utilisateur.
        assert!(m.comments.iter().any(|c| c.author == "Thierry" && c.parent == Some(1) && c.text == "Seuil justifié en 2.3."));
        assert!(!m.comments.iter().any(|c| atelier_docx::marks::is_agent(&c.author)));
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
        assert!(m.changes.iter().any(|c| c.kind == "row-ins" && c.author == "Thierry"));
        assert!(m.changes.iter().any(|c| c.kind == "row-del" && c.author == "Thierry"));

        // Réunir deux paragraphes coupés par une marque de paragraphe, puis
        // couper un paragraphe : toujours en suivi signé.
        let n = Docx::open(&path).unwrap().model().unwrap().paragraphs.len();
        run(root, "claude", "join", &json!({"path": "article.docx", "paragraph": "p2"})).unwrap();
        let m = Docx::open(&path).unwrap().model().unwrap();
        assert!(m.changes.iter().any(|c| c.kind == "paragraph-del" && c.author == "Thierry"), "{:?}", m.changes);
        assert!(m.paragraphs.len() >= n, "la marque reste, supprimée en suivi");
        let r = run(root, "claude", "split", &json!({"path": "article.docx", "find": "réflectances de surface"})).unwrap();
        assert_eq!(r["author"], "Thierry");
        let m = Docx::open(&path).unwrap().model().unwrap();
        assert!(m.changes.iter().any(|c| c.kind == "paragraph-ins" && c.author == "Thierry"), "{:?}", m.changes);
        assert!(run(root, "claude", "join", &json!({"path": "article.docx"})).unwrap_err().contains("paragraph manquant"));

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
