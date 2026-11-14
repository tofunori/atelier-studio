//! Outil `atelier_docx` : l'agent lit un .docx du projet et y propose des
//! retouches, toujours en suivi des modifications. Elles sont signées du nom
//! de l'utilisateur, comme s'il les avait tapées (Thierry, 2026-11-13), et
//! Atelier se souvient qu'elles viennent de l'agent (`atelier_docx::marks`) ;
//! ses commentaires et réponses aussi (« je veux que ça soit mon nom »,
//! 2026-11-13). Il n'accepte ni ne refuse aucun suivi et ne
//! résout aucun commentaire : ces décisions restent à l'utilisateur, dans le
//! panneau .docx ou dans Word.

use atelier_docx::ops::{self, Op};
use atelier_docx::unread::Mark;
use atelier_docx::{Docx, Signature};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

use crate::state::AppState;
use atelier_protocol::agent_mcp_limits as lim;

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

fn comment_id(req: &Value) -> Result<u32, String> {
    req.get("comment").and_then(Value::as_u64).map(|n| n as u32).ok_or_else(|| "comment manquant : numéro du commentaire (c3 → 3)".to_string())
}

fn norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Avant d'ajouter un commentaire : le même, au même endroit, est déjà là
/// (rend son numéro, rien n'est écrit) ; ou l'agent en a déjà posé un sur
/// ce passage (refus : le corriger avec `edit_comment`, sauf `again`).
fn duplicate_of(path: &Path, d: &mut Docx, paragraph: Option<&str>, find: &str, text: &str, again: bool) -> atelier_docx::Result<Option<u32>> {
    let model = d.model()?;
    let mine = atelier_docx::marks::comments(path, &model).unwrap_or_default();
    let (find, text) = (norm(find), norm(text));
    for c in model.comments.iter().filter(|c| c.parent.is_none() && !c.done) {
        let quote = norm(&c.quote);
        let here = paragraph.is_none_or(|p| c.paragraph.as_deref() == Some(p));
        if !here || quote.is_empty() || !(quote.contains(&find) || find.contains(&quote)) {
            continue;
        }
        if norm(&c.text) == text {
            return Ok(Some(c.id));
        }
        if mine.contains_key(&c.id) && !again {
            return Err(atelier_docx::DocxError(format!(
                "tu as déjà commenté ce passage (c{}) : pour le corriger, action edit_comment avec comment={} et le nouveau text (ou withdraw_comment pour le retirer) ; again=true seulement pour un second commentaire distinct",
                c.id, c.id
            )));
        }
    }
    Ok(None)
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
        // Ses propres commentaires seulement (contrôlé dans `run`) : corriger
        // plutôt qu'en poser un second au même endroit (Thierry, 2026-11-13).
        "edit_comment" => Op::EditComment { id: comment_id(req)?, text: need("text")? },
        "withdraw_comment" => Op::DeleteComment { id: comment_id(req)? },
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

/// Côté long d'une image montrée à l'agent, en px : deux fois le cadre de
/// Word (une formule collée reste lisible), jamais plus que ce que le modèle
/// garde (au-delà il réduit lui-même).
const IMAGE_LONG_MIN: f64 = 256.0;
const IMAGE_LONG_MAX: f64 = 1200.0;
/// Une image du paquet déjà lisible (PNG, JPEG, GIF, WebP) part telle quelle
/// sous ce poids ; au-dessus, elle est redessinée à la taille de son cadre.
const IMAGE_PASS_MAX: usize = 1024 * 1024;
/// Base64 cumulé d'une réponse : sous le plafond du pont, qui sinon ne
/// joindrait aucune image.
const IMAGES_BUDGET: usize = lim::BRIDGE_IMAGES_MAX_BYTES - 512 * 1024;

/// Polices du système, chargées une fois : le texte des graphiques d'Excel
/// (axes, légendes) se dessine avec elles.
fn fonts() -> std::sync::Arc<resvg::usvg::fontdb::Database> {
    static DB: std::sync::OnceLock<std::sync::Arc<resvg::usvg::fontdb::Database>> = std::sync::OnceLock::new();
    DB.get_or_init(|| {
        let mut db = resvg::usvg::fontdb::Database::new();
        db.load_system_fonts();
        // Calibri manque hors de Windows : la première sans-serif présente la remplace.
        let have = |f: &str| db.faces().any(|face| face.families.iter().any(|(n, _)| n == f));
        if let Some(f) = ["Helvetica Neue", "Helvetica", "Arial", "Carlito", "Liberation Sans", "DejaVu Sans"].into_iter().find(|f| have(f)) {
            db.set_sans_serif_family(f);
        }
        std::sync::Arc::new(db)
    })
    .clone()
}

/// SVG (graphique, EMF rejoué, image recadrée) → PNG, étiré au cadre `frame`
/// comme dans Word, sur fond blanc comme la page. Aucune ressource hors du
/// SVG n'est lue : seules les images en data: passent.
fn svg_to_png(svg: &[u8], frame: Option<(f64, f64)>, long: f64) -> Option<Vec<u8>> {
    use resvg::{tiny_skia, usvg};
    let mut opt = usvg::Options { font_family: "Arial".into(), fontdb: fonts(), ..Default::default() };
    opt.image_href_resolver.resolve_string = Box::new(|_, _| None);
    let tree = usvg::Tree::from_data(svg, &opt).ok()?;
    let size = tree.size();
    let (fw, fh) = frame.filter(|(w, h)| *w > 0.0 && *h > 0.0).unwrap_or((size.width() as f64, size.height() as f64));
    let k = long / fw.max(fh);
    let (w, h) = (((fw * k).round() as u32).max(1), ((fh * k).round() as u32).max(1));
    let mut pixmap = tiny_skia::Pixmap::new(w, h)?;
    pixmap.fill(tiny_skia::Color::WHITE);
    let t = tiny_skia::Transform::from_scale(w as f32 / size.width(), h as f32 / size.height());
    resvg::render(&tree, t, &mut pixmap.as_mut());
    pixmap.encode_png().ok()
}

/// Une figure telle que le modèle peut la lire : PNG, JPEG, GIF ou WebP.
/// `Err` : la raison, dite à l'agent (format que rien ne dessine).
fn for_model((bytes, mime): (Vec<u8>, &'static str), frame: Option<(f64, f64)>) -> Result<(Vec<u8>, &'static str), String> {
    use base64::Engine as _;
    let readable = matches!(mime, "image/png" | "image/jpeg" | "image/gif" | "image/webp");
    if readable && bytes.len() <= IMAGE_PASS_MAX {
        return Ok((bytes, mime));
    }
    let long = frame.map_or(IMAGE_LONG_MAX, |(w, h)| (w.max(h) * 2.0).clamp(IMAGE_LONG_MIN, IMAGE_LONG_MAX));
    let svg = if mime == "image/svg+xml" {
        bytes
    } else if readable {
        // Trop lourde : redessinée à la taille de son cadre.
        let (w, h) = frame.unwrap_or((long, long));
        let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
        format!(r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><image href="data:{mime};base64,{data}" width="{w}" height="{h}" preserveAspectRatio="none"/></svg>"#).into_bytes()
    } else {
        return Err(format!("format {mime} que rien ne dessine ici : à ouvrir dans Word"));
    };
    let mut png = svg_to_png(&svg, frame, long).ok_or("rendu impossible de cette figure")?;
    if png.len() > IMAGE_PASS_MAX {
        png = svg_to_png(&svg, frame, long / 2.0).unwrap_or(png);
    }
    Ok((png, "image/png"))
}

/// `images` : les figures du document, rendues comme sur la surface .docx
/// (graphiques d'Excel, EMF/WMF, recadrage de Word) puis jointes au résultat
/// pour que l'agent les voie. Lecture seule. Numérotées dans l'ordre de
/// lecture (corps, notes, en-têtes et pieds) ; `paragraph`, `from`/`to`
/// bornent le passage, `start` reprend à la figure N.
fn images(path: &Path, req: &Value) -> Result<Value, String> {
    use base64::Engine as _;
    let mut docx = atelier_docx::open_settled(path).map_err(|e| e.0)?;
    let model = docx.model().map_err(|e| e.0)?;
    let only = str_arg(req, "paragraph");
    let (from, to) = (usize_arg(req, "from").unwrap_or(0), usize_arg(req, "to").unwrap_or(usize::MAX));
    let start = usize_arg(req, "start").unwrap_or(1).max(1);
    let body = model.paragraphs.iter();
    let notes = model.notes.iter().flat_map(|n| n.paragraphs.iter());
    let heads = model.headers.iter().flat_map(|h| h.paragraphs.iter());
    let all: Vec<(usize, &atelier_docx::model::Para, &atelier_docx::model::Segment)> = body
        .chain(notes)
        .chain(heads)
        .flat_map(|p| p.segments.iter().filter(|s| s.media.is_some()).map(move |s| (p, s)))
        .enumerate()
        .map(|(i, (p, s))| (i + 1, p, s))
        .collect();
    let in_scope = |p: &atelier_docx::model::Para| match only {
        Some(id) => p.id == id,
        None if req.get("from").is_some() || req.get("to").is_some() => {
            p.id.strip_prefix('p').and_then(|n| n.parse::<usize>().ok()).is_some_and(|n| (from..=to).contains(&n))
        }
        None => true,
    };
    let scope: Vec<_> = all.iter().filter(|(_, p, _)| in_scope(p)).collect();
    let mut theme: Option<Option<Vec<u8>>> = None;
    let (mut listed, mut attached, mut budget, mut next) = (Vec::new(), Vec::new(), 0usize, None);
    for (n, p, s) in scope.iter().filter(|(n, _, _)| *n >= start) {
        let frame = s.width.zip(s.height).map(|(w, h)| (w as f64, h as f64));
        let mut entry = json!({"image": n, "paragraph": p.id, "alt": s.alt});
        if let Some((w, h)) = s.width.zip(s.height) {
            entry["frame"] = json!(format!("{w}×{h} px"));
        }
        // Plus de place, ou la suite déjà annoncée : listée, pas jointe.
        if attached.len() >= lim::BRIDGE_IMAGES_MAX || next.is_some() {
            next.get_or_insert(*n);
            listed.push(entry);
            continue;
        }
        let rel = s.media.as_deref().unwrap_or("");
        let shown = match atelier_docx::objects::media_raw(&mut docx, &p.id, rel).map_err(|e| e.0)? {
            None => Err("image absente du paquet".to_string()),
            Some(raw) => {
                entry["kind"] = json!(match raw.1 {
                    m if m == atelier_docx::chart::MIME => "graphique Excel",
                    "image/x-emf" => "EMF",
                    "image/x-wmf" => "WMF",
                    m => m.trim_start_matches("image/"),
                });
                let th = if raw.1 == atelier_docx::chart::MIME {
                    if theme.is_none() {
                        theme = Some(atelier_docx::objects::theme(&mut docx).map_err(|e| e.0)?);
                    }
                    theme.as_ref().and_then(|t| t.as_deref())
                } else {
                    None
                };
                let img = atelier_docx::objects::render(raw, th, frame);
                let img = match (s.crop, frame) {
                    (Some(c), Some(_)) => atelier_docx::objects::cropped(img, c),
                    _ => img,
                };
                for_model(img, frame)
            }
        };
        match shown {
            Ok((bytes, mime)) => {
                let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
                if budget + data.len() > IMAGES_BUDGET && !attached.is_empty() {
                    next.get_or_insert(*n);
                } else {
                    budget += data.len();
                    entry["shown"] = json!(attached.len() + 1);
                    attached.push(json!({"mimeType": mime, "data": data}));
                }
            }
            Err(why) => entry["error"] = json!(why),
        }
        listed.push(entry);
    }
    let note = if all.is_empty() {
        "Ce document ne contient aucune figure.".to_string()
    } else if scope.is_empty() {
        format!("Aucune figure dans ce passage ({} dans le document).", all.len())
    } else {
        let mut t = format!(
            "{} figure(s) jointe(s) ci-dessous, dans l'ordre de la liste (« shown »), dessinées comme sur la page Word. Lecture seule : pour une remarque, comment sur le texte voisin.",
            attached.len()
        );
        if let Some(k) = next {
            let _ = std::fmt::Write::write_fmt(&mut t, format_args!(" Suite : images avec start={k}."));
        }
        t
    };
    let mut out = json!({"revision": model.revision, "total": all.len(), "images": listed, "note": note});
    if !attached.is_empty() {
        out[lim::BRIDGE_IMAGES_KEY] = Value::Array(attached);
    }
    Ok(out)
}

fn run(project_root: &str, provider: &str, action: &str, req: &Value) -> Result<Value, String> {
    let path = resolve(project_root, str_arg(req, "path").unwrap_or(""))?;
    if action == "images" {
        return images(&path, req);
    }
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
    if action == "checked" {
        // Fin d'une vérification de commentaire demandée depuis la carte :
        // l'icône du panneau s'arrête, corrigé ou non. Rien dans le fichier.
        let comment = req.get("comment").and_then(Value::as_u64).ok_or("comment manquant : numéro du commentaire (c3 → 3)")? as u32;
        atelier_docx::drafts::checked(&path, comment).map_err(|e| e.0)?;
        return Ok(json!({"ok": true, "comment": comment, "note": "Vérification notée dans la carte. Réponds à l'utilisateur en une ou deux phrases."}));
    }
    // Retouches, commentaires et réponses portent le nom de l'utilisateur
    // (Thierry, 2026-11-13) : l'étudiant ou le relecteur ne voit que lui.
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
        // Bulle écrite, répondue ou corrigée : un point « non lu » dans la
        // carte jusqu'à ce que l'utilisateur l'ouvre (Thierry, 2026-11-14).
        // Noté AVANT l'écriture, pour que le panneau qui relit le fichier le trouve.
        let touches_comment = matches!(op, Op::Comment { .. } | Op::Reply { .. } | Op::EditComment { .. });
        let before = if touches_comment || matches!(op, Op::DeleteComment { .. }) {
            Some(Docx::open(&path).and_then(|mut d| d.model()).map_err(|e| e.0)?)
        } else {
            None
        };
        if let Op::EditComment { id, .. } | Op::DeleteComment { id } = &op {
            // Ceux de l'agent et ceux de l'utilisateur (Thierry, 2026-11-13 :
            // « les miennes oui ») ; jamais ceux du relecteur ni d'un autre auteur.
            let model = before.as_ref().expect("modèle relu pour un commentaire");
            let Some(c) = model.comments.iter().find(|c| c.id == *id) else {
                return Err(format!("commentaire c{id} introuvable (relis le document : read)"));
            };
            let mine = atelier_docx::marks::comments(&path, model).map_err(|e| e.0)?;
            if !mine.contains_key(id) && c.author != sig.author && !atelier_docx::marks::is_agent(&c.author) {
                return Err(format!(
                    "c{id} est de {} : tu ne corriges ou ne retires que les commentaires de l'utilisateur et les tiens (pour lui répondre : reply ou draft_reply)",
                    c.author
                ));
            }
        }
        if let (true, Some(model)) = (touches_comment, before.as_ref()) {
            let mark = match &op {
                Op::EditComment { id, .. } => model.comments.iter().find(|c| c.id == *id).map(|c| Mark { author: c.author.clone(), date: c.date.clone() }),
                _ => Some(Mark { author: sig.author.clone(), date: sig.date.clone() }),
            };
            if let Some(m) = mark {
                atelier_docx::unread::touch(&path, model, &[m]).map_err(|e| e.0)?;
            }
        }
        let origin = atelier_docx::history::Origin { source: "agent", author: &sig.author, label: op.label() };
        let again = req.get("again").and_then(Value::as_bool).unwrap_or(false);
        atelier_docx::edit_file_as(&path, expected, &origin, |d| {
            if let Op::Comment { paragraph, find, text, .. } = &op {
                if let Some(id) = duplicate_of(&path, d, paragraph.as_deref(), find, text, again)? {
                    return Ok(json!({"comment": id, "already": true}));
                }
            }
            ops::apply(d, &op, true, &sig)
        })
        .map_err(|e| e.0)?
    };
    if result.get("already").is_some() {
        return Ok(json!({"ok": true, "result": result, "note": "Ce commentaire est déjà dans le document : rien n'a été ajouté."}));
    }
    // Suivis et commentaires : Atelier se souvient qu'ils viennent de l'agent.
    remember(&path, &sig, provider)?;
    // Le paragraphe touché, relu tel qu'il est maintenant sur le disque.
    let para = result.get("paragraph").and_then(Value::as_str).map(str::to_string).or_else(|| str_arg(req, "paragraph").map(str::to_string));
    let mut out = json!({"ok": true, "author": sig.author, "proposed_by": author_for(provider), "revision": revision, "result": result});
    if let Some(p) = para.and_then(|p| p.strip_prefix('p').and_then(|n| n.parse::<usize>().ok())) {
        let mut docx = Docx::open(&path).map_err(|e| e.0)?;
        let model = docx.model().map_err(|e| e.0)?;
        let text = ops::outline(&model, p, Some(p + 1), READ_MAX_CHARS);
        out["now"] = json!(text.lines().find(|l| l.starts_with(&format!("p{p} "))).unwrap_or(""));
    }
    out["note"] = json!(if action == "edit_comment" {
        "Commentaire de l'utilisateur corrigé dans le .docx, toujours à son nom : dis-lui en une phrase ce que tu as changé."
    } else if action == "withdraw_comment" {
        "Bulle retirée du .docx, c'est fait (rien à valider) : dis-le à l'utilisateur en une phrase."
    } else {
        "Proposé en suivi des modifications : l'utilisateur l'accepte ou le refuse dans le panneau .docx ou dans Word."
    });
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
        // Son propre commentaire, vérifié puis corrigé par l'agent ; jamais celui de Christophe.
        let mine = m.comments.iter().find(|c| c.text == "Seuil justifié en 2.3.").unwrap().id;
        let r = run(root, "claude", "edit_comment", &json!({"path": "article.docx", "comment": mine, "text": "Seuil justifié en 2.4."})).unwrap();
        assert_eq!(r["author"], "Thierry");
        assert!(r["note"].as_str().unwrap().contains("corrigé"), "{r}");
        assert!(run(root, "claude", "edit_comment", &json!({"path": "article.docx", "comment": 1, "text": "x"})).unwrap_err().contains("est de Christophe"));
        let m = Docx::open(&path).unwrap().model().unwrap();
        assert!(m.comments.iter().any(|c| c.id == mine && c.author == "Thierry" && c.text == "Seuil justifié en 2.4."));
        assert!(atelier_docx::marks::list(&path, &m).unwrap().len() >= 4);
        // Fin de la vérification : notée hors du fichier, pour la carte.
        let before = std::fs::read(&path).unwrap();
        run(root, "claude", "checked", &json!({"path": "article.docx", "comment": mine})).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), before);
        assert!(atelier_docx::drafts::checks(&path).unwrap().contains_key(&mine));
        assert!(run(root, "claude", "checked", &json!({"path": "article.docx", "comment": 999})).unwrap_err().contains("introuvable"));
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
    fn une_bulle_ecrite_repondue_ou_corrigee_par_l_agent_est_non_lue() {
        // Thierry, 2026-11-14 : un point sur la carte tant qu'il ne l'a pas ouverte.
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        std::fs::create_dir_all(dir.path().join(".fig_thumbs")).unwrap();
        std::fs::write(dir.path().join(".fig_thumbs/docx_prefs.json"), r#"{"author":"Thierry"}"#).unwrap();
        let root = dir.path().to_str().unwrap();
        let model = || Docx::open(&path).unwrap().model().unwrap();
        let unread = || atelier_docx::unread::list(&path, &model()).unwrap();
        assert!(unread().is_empty());
        // Une retouche du texte ne touche aucune bulle.
        run(root, "claude", "edit", &json!({"path": "article.docx", "find": "réflectances de surface", "with": "réflectances de la surface"})).unwrap();
        assert!(unread().is_empty());
        let r = run(root, "claude", "comment", &json!({"path": "article.docx", "find": "MOD09GA", "text": "Bande 1 ?"})).unwrap();
        let id = r["result"]["id"].as_u64().unwrap_or_else(|| panic!("{r}")) as u32;
        assert_eq!(unread(), vec![id]);
        // Ouverte : le point s'efface ; corrigée ensuite : il revient.
        assert!(atelier_docx::unread::seen(&path, &model(), id).unwrap());
        assert!(unread().is_empty());
        run(root, "claude", "edit_comment", &json!({"path": "article.docx", "comment": id, "text": "Bande 1 ou 2 ?"})).unwrap();
        assert_eq!(unread(), vec![id]);
        // Une réponse sous la bulle de Christophe : c'est son fil qui porte le point.
        run(root, "claude", "reply", &json!({"path": "article.docx", "comment": 1, "text": "Seuil justifié en 2.3."})).unwrap();
        assert_eq!(unread(), { let mut v = vec![1, id]; v.sort(); v });
        assert!(atelier_docx::unread::seen(&path, &model(), 1).unwrap());
        assert_eq!(unread(), vec![id]);
        // Retirée : plus rien à signaler.
        run(root, "claude", "withdraw_comment", &json!({"path": "article.docx", "comment": id})).unwrap();
        assert!(unread().is_empty());
    }

    #[test]
    fn l_agent_corrige_son_commentaire_au_lieu_d_en_poser_un_second() {
        // 2026-11-13, copies de TP : pour corriger une bulle, l'agent en
        // ajoutait une nouvelle au même endroit ; l'ancienne restait.
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        std::fs::create_dir_all(dir.path().join(".fig_thumbs")).unwrap();
        std::fs::write(dir.path().join(".fig_thumbs/docx_prefs.json"), r#"{"author":"Thierry"}"#).unwrap();
        let root = dir.path().to_str().unwrap();
        let count = || Docx::open(&path).unwrap().model().unwrap().comments.len();
        let n0 = count();
        let r = run(root, "claude", "comment", &json!({"path": "article.docx", "find": "réflectances de surface", "text": "Calcul juste."})).unwrap();
        let id = r["result"]["id"].as_u64().unwrap_or_else(|| panic!("{r}"));
        assert_eq!(count(), n0 + 1);
        // Le même commentaire une seconde fois (nouvelle tentative) : rien n'est ajouté.
        let before = std::fs::read(&path).unwrap();
        let r = run(root, "claude", "comment", &json!({"path": "article.docx", "find": "réflectances de surface", "text": "Calcul  juste."})).unwrap();
        assert_eq!((r["result"]["already"].as_bool(), r["result"]["comment"].as_u64()), (Some(true), Some(id)), "{r}");
        assert_eq!(std::fs::read(&path).unwrap(), before);
        // Une autre version au même endroit : refusée, avec le moyen de corriger.
        let e = run(root, "claude", "comment", &json!({"path": "article.docx", "find": "réflectances de surface", "text": "Calcul juste (h2 = 0,11 m)."})).unwrap_err();
        assert!(e.contains(&format!("c{id}")) && e.contains("edit_comment"), "{e}");
        assert_eq!(count(), n0 + 1);
        // Corriger : le même commentaire, nouveau texte, même signature.
        run(root, "claude", "edit_comment", &json!({"path": "article.docx", "comment": id, "text": "Calcul juste (h2 = 0,11 m)."})).unwrap();
        let m = Docx::open(&path).unwrap().model().unwrap();
        let c = m.comments.iter().find(|c| c.id == id as u32).unwrap();
        assert_eq!((c.text.as_str(), c.author.as_str()), ("Calcul juste (h2 = 0,11 m).", "Thierry"));
        assert_eq!(m.comments.len(), n0 + 1);
        // Un second commentaire distinct, demandé explicitement.
        run(root, "claude", "comment", &json!({"path": "article.docx", "find": "réflectances de surface", "text": "Unités ?", "again": true})).unwrap();
        assert_eq!(count(), n0 + 2);
        // Jamais ceux du relecteur.
        let e = run(root, "claude", "edit_comment", &json!({"path": "article.docx", "comment": 1, "text": "x"})).unwrap_err();
        assert!(e.contains("c1 est de Christophe"), "{e}");
        assert!(run(root, "claude", "withdraw_comment", &json!({"path": "article.docx", "comment": 1})).unwrap_err().contains("est de Christophe"));
        // Ceux de l'utilisateur, oui (« les miennes oui »).
        let (r, _) = atelier_docx::edit_file_as(&path, None, &atelier_docx::history::Origin { source: "panneau", author: "Thierry", label: "commentaire" }, |d| {
            ops::apply(d, &Op::Comment { paragraph: None, find: "MOD09GA".into(), occurrence: None, text: "À vérifier".into() }, true, &Signature::now("Thierry"))
        })
        .unwrap();
        let his = r["id"].as_u64().unwrap();
        run(root, "claude", "edit_comment", &json!({"path": "article.docx", "comment": his, "text": "À vérifier (bande 1)."})).unwrap();
        let m = Docx::open(&path).unwrap().model().unwrap();
        assert_eq!(m.comments.iter().find(|c| c.id == his as u32).unwrap().text, "À vérifier (bande 1).");
        run(root, "claude", "withdraw_comment", &json!({"path": "article.docx", "comment": his})).unwrap();
        // Retirer le sien.
        let gone = run(root, "claude", "withdraw_comment", &json!({"path": "article.docx", "comment": id})).unwrap();
        assert!(gone["note"].as_str().unwrap().contains("retirée"), "pas « proposé en suivi » : c'est fait ({gone})");
        let m = Docx::open(&path).unwrap().model().unwrap();
        assert!(!m.comments.iter().any(|c| c.id == id as u32));
        assert_eq!(m.comments.len(), n0 + 1);
    }

    /// Largeur et hauteur d'un PNG (en-tête IHDR).
    fn png_size(b: &[u8]) -> (u32, u32) {
        assert_eq!(&b[1..4], b"PNG");
        (u32::from_be_bytes(b[16..20].try_into().unwrap()), u32::from_be_bytes(b[20..24].try_into().unwrap()))
    }

    /// La fixture, sa figure (p10) remplacée par un graphique d'Excel au
    /// cadre de 624 × 345 px. Valeurs synthétiques.
    fn with_chart(path: &Path) {
        use std::io::{Read, Write};
        const C: &str = "http://schemas.openxmlformats.org/drawingml/2006/chart";
        const A: &str = "http://schemas.openxmlformats.org/drawingml/2006/main";
        const R: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        let src = std::fs::read(path).unwrap();
        let mut zin = zip::ZipArchive::new(std::io::Cursor::new(src)).unwrap();
        let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for i in 0..zin.len() {
            let mut f = zin.by_index(i).unwrap();
            let name = f.name().to_string();
            let mut bytes = Vec::new();
            f.read_to_end(&mut bytes).unwrap();
            let text = String::from_utf8_lossy(&bytes).to_string();
            let bytes = match name.as_str() {
                "word/media/image1.png" => continue,
                "word/_rels/document.xml.rels" => text
                    .replace(
                        r#"Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png""#,
                        r#"Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart1.xml""#,
                    )
                    .into_bytes(),
                "word/document.xml" => {
                    let start = text.find(r#"<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">"#).unwrap();
                    let end = text[start..].find("</a:graphicData>").unwrap() + start + "</a:graphicData>".len();
                    let chart = format!(r#"<a:graphicData uri="{C}"><c:chart xmlns:c="{C}" xmlns:r="{R}" r:id="rId5"/></a:graphicData>"#);
                    format!("{}{}{}", &text[..start], chart, &text[end..])
                        .replacen(r#"<wp:extent cx="914400" cy="914400"/>"#, r#"<wp:extent cx="5943600" cy="3291840"/>"#, 1)
                        .into_bytes()
                }
                "[Content_Types].xml" => text
                    .replace("</Types>", r#"<Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>"#)
                    .into_bytes(),
                _ => bytes,
            };
            out.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(&bytes).unwrap();
        }
        let data = [(120.0, 1.0), (540.0, 0.63), (1380.0, 0.27), (3480.0, 0.04)];
        let pts = |f: fn(&(f64, f64)) -> f64| -> String {
            data.iter().enumerate().map(|(i, d)| format!(r#"<c:pt idx="{i}"><c:v>{}</c:v></c:pt>"#, f(d))).collect()
        };
        let (xs, ys) = (pts(|d| d.0), pts(|d| d.1));
        let chart = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="{C}" xmlns:a="{A}" xmlns:r="{R}"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>H/Ho en fonction du temps</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:scatterChart><c:scatterStyle val="lineMarker"/><c:ser><c:idx val="0"/><c:order val="0"/><c:spPr><a:ln w="25400"><a:solidFill><a:srgbClr val="1F4E79"/></a:solidFill></a:ln></c:spPr><c:xVal><c:numRef><c:numCache><c:ptCount val="4"/>{xs}</c:numCache></c:numRef></c:xVal><c:yVal><c:numRef><c:numCache><c:ptCount val="4"/>{ys}</c:numCache></c:numRef></c:yVal></c:ser><c:axId val="1"/><c:axId val="2"/></c:scatterChart><c:valAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:crossAx val="2"/></c:valAx><c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:crossAx val="1"/></c:valAx></c:plotArea></c:chart></c:chartSpace>"#
        );
        out.start_file("word/charts/chart1.xml", zip::write::SimpleFileOptions::default()).unwrap();
        out.write_all(chart.as_bytes()).unwrap();
        std::fs::write(path, out.finish().unwrap().into_inner()).unwrap();
    }

    #[test]
    fn l_agent_voit_les_figures_comme_sur_la_page() {
        use base64::Engine as _;
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        let root = dir.path().to_str().unwrap();
        let before = std::fs::read(&path).unwrap();
        // La lecture annonce la figure et l'action qui la montre.
        let read = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap();
        let text = read["text"].as_str().unwrap();
        assert!(text.contains("p10 ") && text.contains("{image : ") && text.contains("action images"), "{text}");

        // Une image déjà lisible (PNG) part telle quelle.
        let out = run(root, "claude", "images", &json!({"path": "article.docx"})).unwrap();
        assert_eq!(out["total"], 1, "{out}");
        assert_eq!(out["images"][0]["paragraph"], "p10");
        assert_eq!(out["images"][0]["kind"], "png");
        assert_eq!(out["images"][0]["shown"], 1);
        let att = &out[lim::BRIDGE_IMAGES_KEY][0];
        assert_eq!(att["mimeType"], "image/png");
        let png = base64::engine::general_purpose::STANDARD.decode(att["data"].as_str().unwrap()).unwrap();
        assert_eq!(png_size(&png), (1, 1), "l'image du paquet, sans retouche");

        // Hors du passage demandé : rien de joint, la raison est dite.
        let none = run(root, "claude", "images", &json!({"path": "article.docx", "paragraph": "p3"})).unwrap();
        assert!(none.get(lim::BRIDGE_IMAGES_KEY).is_none(), "{none}");
        assert!(none["note"].as_str().unwrap().contains("Aucune figure dans ce passage"), "{none}");
        let range = run(root, "claude", "images", &json!({"path": "article.docx", "from": 9, "to": 11})).unwrap();
        assert_eq!(range["images"][0]["shown"], 1, "{range}");
        let later = run(root, "claude", "images", &json!({"path": "article.docx", "start": 2})).unwrap();
        assert!(later.get(lim::BRIDGE_IMAGES_KEY).is_none(), "{later}");

        // Un graphique d'Excel : dessiné comme sur la surface, puis en PNG au
        // double de son cadre (624 × 345), le côté long borné à 1200 px.
        with_chart(&path);
        let out = run(root, "claude", "images", &json!({"path": "article.docx", "paragraph": "p10"})).unwrap();
        assert_eq!(out["images"][0]["kind"], "graphique Excel", "{out}");
        assert_eq!(out["images"][0]["frame"], "624×345 px");
        let att = &out[lim::BRIDGE_IMAGES_KEY][0];
        assert_eq!(att["mimeType"], "image/png");
        let png = base64::engine::general_purpose::STANDARD.decode(att["data"].as_str().unwrap()).unwrap();
        assert_eq!(png_size(&png), (1200, 663));
        // Du dessin, pas une page blanche : la courbe bleue est là.
        let mut dec = png::Decoder::new(std::io::Cursor::new(&png));
        dec.set_transformations(png::Transformations::EXPAND);
        let mut reader = dec.read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).unwrap();
        let px = info.color_type.samples();
        assert!(buf.chunks(px).any(|c| c[2] > 100 && c[0] < 80), "pas de trait bleu dans le graphique");

        // Lecture seule : le fichier n'a pas bougé.
        let after_chart = std::fs::read(&path).unwrap();
        run(root, "claude", "images", &json!({"path": "article.docx"})).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), after_chart);
        assert_ne!(before, after_chart);
    }

    #[test]
    fn une_image_trop_lourde_est_redessinee_a_la_taille_de_son_cadre() {
        // Une photo de 900 × 900 en PNG (bruit : plusieurs Mo).
        let mut pixmap = resvg::tiny_skia::Pixmap::new(900, 900).unwrap();
        let mut seed = 7u32;
        for b in pixmap.data_mut().chunks_mut(4) {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            b.copy_from_slice(&[(seed >> 24) as u8, (seed >> 16) as u8, (seed >> 8) as u8, 255]);
        }
        let big = pixmap.encode_png().unwrap();
        assert!(big.len() > IMAGE_PASS_MAX);
        let (small, mime) = for_model((big, "image/png"), Some((300.0, 200.0))).unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(png_size(&small), (600, 400), "étirée au cadre de Word, au double");
        // Un format que rien ne dessine : la raison, pas une image cassée.
        let err = for_model((vec![0x49, 0x49, 0x2A, 0], "image/tiff"), None).unwrap_err();
        assert!(err.contains("image/tiff"), "{err}");
        // Un SVG qui pointe hors du paquet : le fichier n'est jamais lu.
        let svg = br#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="/etc/hosts" width="10" height="10"/></svg>"#;
        assert!(svg_to_png(svg, None, 20.0).is_some());
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
