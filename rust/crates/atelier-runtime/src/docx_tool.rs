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

/// Image du projet à insérer (PNG, JPEG, GIF, ou PDF rendu en PNG).
fn resolve_figure(project_root: &str, requested: &str) -> Result<PathBuf, String> {
    let root = Path::new(project_root).canonicalize().map_err(|e| format!("projet illisible : {e}"))?;
    let p = Path::new(requested);
    let candidate = if p.is_absolute() { p.to_path_buf() } else { root.join(p) };
    let resolved = candidate.canonicalize().map_err(|_| format!("figure introuvable : {requested}"))?;
    if !resolved.starts_with(&root) {
        return Err("la figure doit être dans le projet".into());
    }
    let ok = resolved.extension().and_then(|e| e.to_str()).is_some_and(|e| ["png", "jpg", "jpeg", "gif", "pdf"].iter().any(|x| e.eq_ignore_ascii_case(x)));
    if !ok {
        return Err("figure : PNG, JPEG, GIF ou PDF".into());
    }
    Ok(resolved)
}

/// Largeur (px) d'une figure PDF rendue pour Word : nette à pleine largeur
/// de texte (environ 370 ppp sur 16,5 cm).
const PDF_FIGURE_WIDTH: u16 = 2400;
const PDF_FIGURE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// Octets de la figure à poser dans le .docx. Word n'affiche pas un PDF
/// comme une image : sa première page est rendue en PNG (outil atelier-pdf).
fn figure_bytes(project_root: &str, requested: &str, pdf_tool: Option<&Path>) -> Result<Vec<u8>, String> {
    let path = resolve_figure(project_root, requested)?;
    let bytes = std::fs::read(&path).map_err(|e| format!("figure illisible : {e}"))?;
    if !path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
        return Ok(bytes);
    }
    let tool = pdf_tool.ok_or("figure PDF : l'outil de rendu d'Atelier (atelier-pdf) est introuvable ; donne une version PNG de la figure")?;
    atelier_pdf::tool::memory_page_png(tool, &bytes, PDF_FIGURE_WIDTH, PDF_FIGURE_TIMEOUT).map_err(|e| format!("figure PDF : {e}"))
}

fn str_arg<'a>(req: &'a Value, key: &str) -> Option<&'a str> {
    req.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn usize_arg(req: &Value, key: &str) -> Option<usize> {
    req.get(key).and_then(Value::as_u64).map(|n| n as usize)
}

/// `image` : la N-ième figure du paragraphe ({image N : …} dans read), 1 par défaut.
fn figure_index(req: &Value) -> Result<usize, String> {
    usize_arg(req, "image").unwrap_or(1).checked_sub(1).ok_or_else(|| "image : numéro à partir de 1 ({image 1 : …} dans read)".to_string())
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
        // Équation de Word ({équation N : …} dans read) réécrite d'après son
        // LaTeX, en suivi noté comme Word : seuls les symboles changés.
        "equation" => Op::ReplaceMath {
            paragraph: paragraph.ok_or("paragraph manquant : le paragraphe de l'équation (p65)")?,
            index: usize_arg(req, "equation").unwrap_or(1).checked_sub(1).ok_or("equation : numéro à partir de 1 ({équation 1 : …} dans read)")?,
            latex: need("latex")?,
        },
        // Figure ({image N : …} dans read) effacée d'un bloc, en suivi.
        "delete_figure" => Op::DeleteImage {
            paragraph: paragraph.ok_or("paragraph manquant : le paragraphe de la figure (p65)")?,
            index: figure_index(req)?,
        },
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
/// Page PDF collée dans un EMF : rendue au côté long de [`IMAGE_LONG_MAX`],
/// dans les proportions de son cadre Word.
const PASTED_PAGE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

fn pasted_page_width(frame: Option<(f64, f64)>) -> u16 {
    match frame {
        Some((w, h)) if w > 0.0 && h > w => (IMAGE_LONG_MAX * w / h).round().max(IMAGE_LONG_MIN) as u16,
        _ => IMAGE_LONG_MAX as u16,
    }
}

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

/// Ce que `images` montre : une figure du paquet (avec les zones de texte et
/// formes que l'auteur a posées dessus) ou, seuls, les dessins d'un paragraphe.
enum Shown<'a> {
    Figure { seg: &'a atelier_docx::model::Segment, over: Vec<&'a atelier_docx::shapes::Shape>, rect: Option<[f32; 4]> },
    Drawing(Vec<&'a atelier_docx::shapes::Shape>),
}

/// Figures et dessins d'un paragraphe, dans l'ordre de la page. Les zones de
/// texte qui flottent sur un paragraphe fait d'une seule figure se dessinent
/// sur elle ; les autres dessins suivent, à part (`drawings` : hors en-têtes
/// et pieds, dont les filets et logos ne sont pas des figures).
fn shown_in<'a>(p: &'a atelier_docx::model::Para, page: Option<&atelier_docx::layout::Page>, drawings: bool) -> Vec<Shown<'a>> {
    let lone = atelier_docx::shapes::lone_figure(p, page);
    let on_figure = |s: &atelier_docx::shapes::Shape| lone.is_some() && s.floats() && !s.page_y;
    let mut out: Vec<Shown> = Vec::new();
    for (i, seg) in p.segments.iter().enumerate().filter(|(_, s)| s.media.is_some()) {
        let rect = lone.filter(|(at, _)| *at == i).map(|(_, r)| r);
        let over = if rect.is_some() { p.shapes.iter().filter(|s| on_figure(s)).collect() } else { Vec::new() };
        out.push(Shown::Figure { seg, over, rect });
    }
    let rest: Vec<_> = p.shapes.iter().filter(|s| !on_figure(s)).collect();
    if drawings && !rest.is_empty() {
        out.push(Shown::Drawing(rest));
    }
    out
}

/// Textes des zones de texte, pour la liste jointe aux images.
fn box_texts(shapes: &[&atelier_docx::shapes::Shape]) -> Vec<String> {
    shapes.iter().map(|s| s.text()).filter(|t| !t.is_empty()).collect()
}

/// Où une zone hors figure est posée, dit en clair : sans figure dessous,
/// l'image seule ne montre pas ce qu'elle côtoie (un tableau, un passage).
fn placement(sh: &atelier_docx::shapes::Shape, page: Option<&atelier_docx::layout::Page>) -> Option<String> {
    if !sh.floats() || sh.page_y {
        return None;
    }
    let column = page.map(|p| p.width - p.left - p.right);
    let side = if sh.align.is_some() {
        None
    } else if sh.x + sh.w <= 1.0 {
        Some("dans la marge gauche".to_string())
    } else if column.is_some_and(|c| sh.x >= c - 1.0) {
        Some("dans la marge droite".to_string())
    } else {
        Some(format!("à {:.0} pt du bord gauche du texte", sh.x))
    };
    let text = sh.text();
    let name: String = text.lines().next().unwrap_or("").chars().take(40).collect();
    let name = if name.is_empty() { sh.label().to_string() } else { format!("« {name} »") };
    let down = format!("{:.0} pt sous le début du paragraphe", sh.y);
    Some(match side {
        Some(side) => format!("{name} : {side}, {down}"),
        None => format!("{name} : {down}"),
    })
}

/// Dessins (et figure dessous, s'il y en a une) en PNG pour le modèle.
fn drawn_png(shapes: &[&atelier_docx::shapes::Shape], back: Option<atelier_docx::shapes::Backdrop>, pictures: &atelier_docx::shapes::Pictures) -> Result<(Vec<u8>, &'static str), String> {
    let (svg, w, h) = atelier_docx::shapes::compose(shapes, back, pictures).ok_or("dessin vide")?;
    let long = (w.max(h) * 2.0).clamp(IMAGE_LONG_MIN, IMAGE_LONG_MAX);
    let mut png = svg_to_png(svg.as_bytes(), Some((w, h)), long).ok_or("rendu impossible de ce dessin")?;
    if png.len() > IMAGE_PASS_MAX {
        png = svg_to_png(svg.as_bytes(), Some((w, h)), long / 2.0).unwrap_or(png);
    }
    Ok((png, "image/png"))
}

/// `images` : les figures du document, rendues comme sur la surface .docx
/// (graphiques d'Excel, EMF/WMF, recadrage de Word, zones de texte et formes
/// posées dessus) puis jointes au résultat pour que l'agent les voie. Lecture
/// seule. Numérotées dans l'ordre de lecture (corps, notes, en-têtes et
/// pieds) ; `paragraph`, `from`/`to` bornent le passage, `start` reprend à la
/// figure N.
fn images(path: &Path, req: &Value, pdf_tool: Option<&Path>) -> Result<Value, String> {
    use base64::Engine as _;
    let mut docx = atelier_docx::open_settled(path).map_err(|e| e.0)?;
    let model = docx.model().map_err(|e| e.0)?;
    let only = str_arg(req, "paragraph");
    let (from, to) = (usize_arg(req, "from").unwrap_or(0), usize_arg(req, "to").unwrap_or(usize::MAX));
    let start = usize_arg(req, "start").unwrap_or(1).max(1);
    let page = model.page.as_ref();
    let body = model.paragraphs.iter().map(|p| (p, true));
    let notes = model.notes.iter().flat_map(|n| n.paragraphs.iter()).map(|p| (p, true));
    let heads = model.headers.iter().flat_map(|h| h.paragraphs.iter()).map(|p| (p, false));
    let all: Vec<(usize, &atelier_docx::model::Para, Shown)> = body
        .chain(notes)
        .chain(heads)
        .flat_map(|(p, drawings)| shown_in(p, page, drawings).into_iter().map(move |s| (p, s)))
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
    for (n, p, what) in scope.iter().filter(|(n, _, _)| *n >= start) {
        let mut entry = json!({"image": n, "paragraph": p.id});
        let shapes: &[&atelier_docx::shapes::Shape] = match what {
            Shown::Figure { seg, over, .. } => {
                entry["alt"] = json!(seg.alt);
                if let Some((w, h)) = seg.width.zip(seg.height) {
                    entry["frame"] = json!(format!("{w}×{h} px"));
                }
                over
            }
            Shown::Drawing(shapes) => {
                entry["kind"] = json!("zones de texte et formes dessinées dans Word");
                let placed: Vec<String> = shapes.iter().filter_map(|s| placement(s, page)).collect();
                if !placed.is_empty() {
                    entry["placed"] = json!(placed);
                }
                shapes
            }
        };
        let texts = box_texts(shapes);
        if !texts.is_empty() {
            entry["text_boxes"] = json!(texts);
        }
        // Plus de place, ou la suite déjà annoncée : listée, pas jointe.
        if attached.len() >= lim::BRIDGE_IMAGES_MAX || next.is_some() {
            next.get_or_insert(*n);
            listed.push(entry);
            continue;
        }
        // Images des groupes de formes, lisibles par le rendu.
        let mut pictures = atelier_docx::shapes::Pictures::new();
        for part in shapes.iter().flat_map(|s| s.parts.iter()) {
            let Some(rel) = part.media.as_deref().filter(|rel| !pictures.contains_key(*rel)) else { continue };
            let frame = Some((part.w as f64 * 4.0 / 3.0, part.h as f64 * 4.0 / 3.0));
            if let Ok(Some(raw)) = atelier_docx::objects::media_raw(&mut docx, &p.id, rel) {
                if let Ok(img) = for_model(atelier_docx::objects::render(raw, None, frame), frame) {
                    pictures.insert(rel.to_string(), img);
                }
            }
        }
        let shown = match what {
            Shown::Drawing(shapes) => drawn_png(shapes, None, &pictures),
            Shown::Figure { seg: s, over, rect } => {
                let frame = s.width.zip(s.height).map(|(w, h)| (w as f64, h as f64));
                let rel = s.media.as_deref().unwrap_or("");
                let figure = match atelier_docx::objects::media_raw(&mut docx, &p.id, rel).map_err(|e| e.0)? {
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
                        // Page PDF collée (EMF de Word pour Mac) : la page elle-même,
                        // nette, plutôt que l'aperçu à 72 ppp de l'EMF.
                        let sharp = (raw.1 == "image/x-emf")
                            .then(|| atelier_docx::objects::pdf_in_emf(&raw.0))
                            .flatten()
                            .zip(pdf_tool)
                            .and_then(|(pdf, tool)| atelier_pdf::tool::memory_page_png(tool, pdf, pasted_page_width(frame), PASTED_PAGE_TIMEOUT).ok());
                        let img = match sharp {
                            Some(png) => {
                                entry["kind"] = json!("page PDF collée (pleine résolution)");
                                (png, "image/png")
                            }
                            None => atelier_docx::objects::render(raw, th, frame),
                        };
                        let img = match (s.crop, frame) {
                            (Some(c), Some(_)) => atelier_docx::objects::cropped(img, c),
                            _ => img,
                        };
                        for_model(img, frame)
                    }
                };
                // Zones de texte et formes posées sur la figure : dessinées
                // par-dessus, à leur place, comme sur la page.
                match (figure, rect) {
                    (Ok((bytes, mime)), Some(rect)) if !over.is_empty() => {
                        let back = atelier_docx::shapes::Backdrop { bytes: &bytes, mime, rect: *rect };
                        match drawn_png(over, Some(back), &pictures) {
                            Ok(img) => {
                                entry["overlay"] = json!(format!("{} zone(s) de texte ou forme(s) que l'auteur a posée(s) sur cette figure, dessinée(s) par-dessus comme dans Word", over.len()));
                                Ok(img)
                            }
                            Err(_) => Ok((bytes, mime)),
                        }
                    }
                    (figure, _) => figure,
                }
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
            "{} figure(s) jointe(s) ci-dessous, dans l'ordre de la liste (« shown »), dessinées comme sur la page Word, zones de texte et formes posées dessus comprises (leur texte : « text_boxes » ; hors d'une figure, « placed » dit où elles sont posées par rapport à leur paragraphe, souvent en regard du tableau ou du passage qui suit). Lecture seule : pour une remarque, comment sur le texte voisin.",
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

/// La bibliothèque Zotero vue par l'outil (la vraie dans l'app, une
/// factice dans les tests) : notices à citer, recherche, styles installés.
pub(crate) struct Library<'a> {
    pub notices: &'a dyn Fn(&[String]) -> Result<std::collections::HashMap<String, (i64, String, Value)>, String>,
    pub search: &'a dyn Fn(&str, usize) -> Result<Vec<Value>, String>,
    pub styles: &'a dyn Fn() -> Vec<atelier_cite::Style>,
}

fn keys_arg(req: &Value) -> Option<Vec<String>> {
    match req.get("keys") {
        Some(Value::Array(a)) => Some(a.iter().filter_map(Value::as_str).map(|k| k.trim().to_string()).filter(|k| !k.is_empty()).collect()),
        Some(Value::String(k)) => Some(k.split([',', ' ']).map(str::trim).filter(|k| !k.is_empty()).map(str::to_string).collect()),
        _ => None,
    }
}

/// Style demandé par l'agent : identifiant complet, fin d'identifiant
/// (`apa`, `ieee`, `the-cryosphere`) ou morceau du titre.
fn find_style(styles: &[atelier_cite::Style], wanted: &str) -> Result<atelier_docx::cite::StyleRef, String> {
    let w = wanted.trim().to_lowercase();
    let usable = |s: &&atelier_cite::Style| s.format != "note";
    let hit = styles
        .iter()
        .filter(usable)
        .find(|s| s.id.to_lowercase() == w)
        .or_else(|| styles.iter().filter(usable).find(|s| s.id.to_lowercase().ends_with(&format!("/{w}"))))
        .or_else(|| styles.iter().filter(usable).find(|s| s.title.to_lowercase().contains(&w)));
    match hit {
        Some(s) => Ok(atelier_docx::cite::StyleRef { id: s.id.clone(), format: Some(s.format.clone()), locale: None }),
        None if w.starts_with("http") => Ok(atelier_docx::cite::StyleRef { id: wanted.trim().to_string(), format: None, locale: None }),
        None => {
            let some: Vec<String> = styles.iter().filter(usable).take(12).map(|s| s.id.rsplit('/').next().unwrap_or(&s.id).to_string()).collect();
            Err(format!("style « {wanted} » absent de Zotero ; installés : {}", some.join(", ")))
        }
    }
}

/// Citations Zotero : `cite_search`, `cite`, `bibliography`.
fn cite_action(project_root: &str, provider: &str, action: &str, req: &Value, path: &Path, lib: &Library) -> Result<Value, String> {
    use atelier_docx::cite::{self, CiteItem};
    if action == "cite_search" {
        let q = str_arg(req, "query").ok_or("query manquant : auteur, année ou mots du titre")?;
        let limit = usize_arg(req, "limit").unwrap_or(8).clamp(1, 20);
        let found = (lib.search)(q, limit)?;
        let items: Vec<Value> = found
            .iter()
            .map(|it| {
                let s = |k: &str| it.get(k).and_then(Value::as_str).unwrap_or("").to_string();
                json!({"key": s("key"), "authors": s("creators"), "year": s("year"), "title": s("title"), "in": s("publication"), "doi": s("doi")})
            })
            .collect();
        let mut docx = atelier_docx::open_settled(path).map_err(|e| e.0)?;
        let style = cite::doc_style(&mut docx).map_err(|e| e.0)?;
        let note = if items.is_empty() {
            "Rien dans le Zotero de l'utilisateur pour cette recherche : essaie un autre nom ou un mot du titre ; n'invente jamais de référence."
        } else {
            "Notices du Zotero de l'utilisateur. Pour citer : action cite avec keys=[key] (et locator pour une page), juste après le passage (find)."
        };
        return Ok(json!({"items": items, "style": style.id, "note": note}));
    }
    let sig = Signature::now(&signer(project_root, path)?);
    let expected = str_arg(req, "revision");
    let origin_label = if action == "cite" { "citation" } else { "bibliographie" };
    let origin = atelier_docx::history::Origin { source: "agent", author: &sig.author, label: origin_label };
    let (result, revision) = if action == "cite" {
        let keys = keys_arg(req).ok_or("keys manquant : clés Zotero à citer (cite_search), [] avec citation pour la retirer")?;
        let mut items: Vec<CiteItem> = keys.iter().map(|k| CiteItem { key: k.clone(), ..Default::default() }).collect();
        if let (Some(first), Some(loc)) = (items.first_mut(), str_arg(req, "locator")) {
            first.locator = Some(loc.to_string());
        }
        let mut raw = serde_json::to_value(json!({"op": "insert_citation", "items": items})).map_err(|e| e.to_string())?;
        let notices = (lib.notices)(&cite::keys_to_resolve(&raw))?;
        cite::fill(&mut raw, &notices).map_err(|e| e.0)?;
        let items: Vec<CiteItem> = serde_json::from_value(raw["items"].clone()).map_err(|e| e.to_string())?;
        let citation = str_arg(req, "citation").map(str::to_string);
        let find = str_arg(req, "find").map(str::to_string);
        let (paragraph, occurrence) = (str_arg(req, "paragraph").map(str::to_string), usize_arg(req, "occurrence"));
        if citation.is_none() && items.is_empty() {
            return Err("keys vide : au moins une clé Zotero (cite_search)".into());
        }
        if citation.is_none() && find.is_none() {
            return Err("find manquant : le texte juste avant la citation (ou citation = son id, vu dans read, pour la changer)".into());
        }
        atelier_docx::edit_file_as(path, expected, &origin, |d| {
            if let Some(id) = &citation {
                return ops::apply(d, &Op::EditCitation { citation: id.clone(), items: items.clone() }, true, &sig);
            }
            let (p, mut at) = ops::place_after(d, paragraph.as_deref(), find.as_deref().unwrap_or(""), occurrence)?;
            // « glaciers (Williamson, 2021) » : une espace avant, comme on la tape.
            let model = d.model()?;
            let before = model.all_paragraphs().find(|x| x.id == p).and_then(|x| x.text.chars().nth(at.wrapping_sub(1)));
            if before.is_some_and(|c| !c.is_whitespace() && !"([«“'\u{a0}".contains(c)) {
                ops::apply(d, &Op::Insert { paragraph: p.clone(), at, with: " ".into() }, true, &sig)?;
                at += 1;
            }
            let mut r = ops::apply(d, &Op::InsertCitation { paragraph: p.clone(), at, items: items.clone() }, true, &sig)?;
            r["paragraph"] = json!(p);
            Ok(r)
        })
        .map_err(|e| e.0)?
    } else {
        let style = match str_arg(req, "style") {
            Some(w) => Some(find_style(&(lib.styles)(), w)?),
            None => None,
        };
        let after = str_arg(req, "after").or_else(|| str_arg(req, "paragraph")).map(str::to_string);
        atelier_docx::edit_file_as(path, expected, &origin, |d| {
            let mut out = json!({"tracked": false});
            if let Some(st) = &style {
                out["style"] = ops::apply(d, &Op::SetCitationStyle { style: st.clone() }, false, &sig)?["style"].clone();
            }
            if cite::has_bibliography(d)? {
                if style.is_none() {
                    out["updated"] = ops::apply(d, &Op::RefreshCitations {}, false, &sig)?["updated"].clone();
                }
            } else {
                let after = match &after {
                    Some(a) => a.clone(),
                    None => d.model()?.paragraphs.last().map(|p| p.id.clone()).ok_or_else(|| atelier_docx::DocxError("document vide".into()))?,
                };
                out["entries"] = ops::apply(d, &Op::InsertBibliography { after: after.clone() }, false, &sig)?["entries"].clone();
                out["after"] = json!(after);
            }
            Ok(out)
        })
        .map_err(|e| e.0)?
    };
    remember(path, &sig, provider)?;
    let mut out = json!({"ok": true, "author": sig.author, "proposed_by": author_for(provider), "revision": revision, "result": result});
    if let Some(p) = out["result"].get("paragraph").and_then(Value::as_str).and_then(|p| p.strip_prefix('p')).and_then(|n| n.parse::<usize>().ok()) {
        let model = Docx::open(path).and_then(|mut d| d.model()).map_err(|e| e.0)?;
        let text = ops::outline(&model, p, Some(p + 1), READ_MAX_CHARS);
        out["now"] = json!(text.lines().find(|l| l.starts_with(&format!("p{p} "))).unwrap_or(""));
    }
    out["note"] = json!(if action == "cite" {
        "Citation Zotero vivante (champ du module Zotero de Word), en suivi des modifications à son nom : elle s'actualise dans Word avec Zotero. Pense à la bibliographie (action bibliography) si le document n'en a pas."
    } else {
        "Bibliographie Zotero posée ou remise à jour, hors suivi (Zotero la refait de toute façon) : dis-le à l'utilisateur en une phrase."
    });
    Ok(out)
}

#[cfg(test)]
fn run(project_root: &str, provider: &str, action: &str, req: &Value) -> Result<Value, String> {
    run_with(project_root, provider, action, req, None)
}

fn run_with(project_root: &str, provider: &str, action: &str, req: &Value, lib: Option<&Library>) -> Result<Value, String> {
    let path = resolve(project_root, str_arg(req, "path").unwrap_or(""))?;
    if matches!(action, "cite_search" | "cite" | "bibliography") {
        let none = Library { notices: &|_| Err("Zotero inaccessible".into()), search: &|_, _| Err("Zotero inaccessible".into()), styles: &Vec::new };
        return cite_action(project_root, provider, action, req, &path, lib.unwrap_or(&none));
    }
    if action == "images" {
        return images(&path, req, atelier_pdf::tool::locate_tool().as_deref());
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
    let (result, revision) = if action == "replace_figure" {
        // Même place, même largeur, même paragraphe (donc même style).
        let paragraph = str_arg(req, "paragraph").ok_or("paragraph manquant : le paragraphe de la figure à remplacer (p65)")?.to_string();
        let index = figure_index(req)?;
        let fig = str_arg(req, "figure").ok_or("figure manquant : chemin de la nouvelle image dans le projet")?;
        let bytes = figure_bytes(project_root, fig, atelier_pdf::tool::locate_tool().as_deref())?;
        let origin = atelier_docx::history::Origin { source: "agent", author: &sig.author, label: "figure" };
        atelier_docx::edit_file_as(&path, expected, &origin, |d| {
            let mut op = Op::ReplaceImage { paragraph: paragraph.clone(), index, path: fig.to_string(), alt: str_arg(req, "text").unwrap_or("").to_string(), bytes: None };
            op.load_images(&mut |_| Ok(bytes.clone()))?;
            let mut r = ops::apply(d, &op, true, &sig)?;
            r["paragraph"] = json!(paragraph);
            Ok(r)
        })
        .map_err(|e| e.0)?
    } else if action == "insert_note" || action == "insert_figure" {
        // Placé juste après `find` ; la figure vient du projet.
        let find = str_arg(req, "find").ok_or("find manquant : le texte juste avant l'appel de note ou la figure")?.to_string();
        let mut bytes = None;
        if action == "insert_figure" {
            let fig = str_arg(req, "figure").ok_or("figure manquant : chemin de l'image dans le projet")?;
            bytes = Some(figure_bytes(project_root, fig, atelier_pdf::tool::locate_tool().as_deref())?);
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
    } else if action == "insert_equation" {
        // En ligne juste après `find`, ou centrée seule sur sa ligne dans un
        // paragraphe neuf après `paragraph` (display) ; en suivi comme Word.
        let latex = str_arg(req, "latex").ok_or("latex manquant : l'équation en LaTeX")?.to_string();
        let display = req.get("display").and_then(Value::as_bool).unwrap_or(false);
        let find = str_arg(req, "find").map(str::to_string);
        let (paragraph, occurrence) = (str_arg(req, "paragraph").map(str::to_string), usize_arg(req, "occurrence"));
        if find.is_none() && !(display && paragraph.is_some()) {
            return Err("find manquant : le texte juste avant l'équation (ou display=true et paragraph = celui après lequel la poser)".into());
        }
        let origin = atelier_docx::history::Origin { source: "agent", author: &sig.author, label: "équation" };
        atelier_docx::edit_file_as(&path, expected, &origin, |d| {
            let (p, at) = match &find {
                Some(f) => ops::place_after(d, paragraph.as_deref(), f, occurrence)?,
                None => (paragraph.clone().unwrap_or_default(), 0),
            };
            ops::apply(d, &Op::InsertMath { paragraph: p, at, latex: latex.clone(), display }, true, &sig)
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
    out["note"] = json!(if action == "replace_figure" {
        "Figure remplacée en suivi, à la même place et à la même largeur, dans le même paragraphe (même style) : l'ancienne barrée, la nouvelle ajoutée juste après. Regarde-la avec images (paragraph) avant de le dire à l'utilisateur ; il accepte ou refuse."
    } else if action == "delete_figure" {
        "Figure effacée en suivi (barrée) : l'utilisateur accepte ou refuse. Sa légende et le paragraphe restent : retouche-les à part si besoin."
    } else if action == "edit_comment" {
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
    let app_dir = state.app_dir().to_path_buf();
    let job = move || {
        let notices = |keys: &[String]| atelier_workspace::zotero_notices(&app_dir, keys);
        let search = |q: &str, limit: usize| atelier_workspace::zotero_search(&app_dir, q, None, None, limit);
        let lib = Library { notices: &notices, search: &search, styles: &atelier_workspace::zotero_cite_styles };
        run_with(&project_root, &provider, &action, &req, Some(&lib))
    };
    match tokio::task::spawn_blocking(job).await {
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

    /// Bibliothèque Zotero factice : deux notices.
    fn library_notices(keys: &[String]) -> Result<std::collections::HashMap<String, (i64, String, Value)>, String> {
        let all = [
            ("WILLIAMS", 11, json!({"id": 11, "type": "article-journal", "title": "Wildfire darkening", "author": [{"family": "Williamson", "given": "Scott"}, {"family": "Menounos", "given": "Brian"}], "issued": {"date-parts": [[2021]]}})),
            ("AUBRYWAK", 12, json!({"id": 12, "type": "article-journal", "title": "Fire and ice", "author": [{"family": "Aubry-Wake", "given": "Caroline"}, {"family": "Bertoncini", "given": "André"}, {"family": "Pomeroy", "given": "John"}], "issued": {"date-parts": [[2022]]}})),
        ];
        Ok(all.into_iter().filter(|(k, _, _)| keys.iter().any(|x| x == k)).map(|(k, id, d)| (k.to_string(), (id, format!("http://zotero.org/users/1/items/{k}"), d))).collect())
    }

    #[test]
    fn l_agent_cite_zotero_et_pose_la_bibliographie() {
        let dir = tempfile::tempdir().unwrap();
        fixture(dir.path());
        std::fs::create_dir_all(dir.path().join(".fig_thumbs")).unwrap();
        std::fs::write(dir.path().join(".fig_thumbs/docx_prefs.json"), r#"{"author":"Thierry"}"#).unwrap();
        let root = dir.path().to_str().unwrap();
        let search = |q: &str, _: usize| -> Result<Vec<Value>, String> {
            Ok(if q.contains("Williamson") { vec![json!({"key": "WILLIAMS", "creators": "Williamson, Menounos", "year": "2021", "title": "Wildfire darkening"})] } else { vec![] })
        };
        let styles = || vec![atelier_cite::Style { id: "http://www.zotero.org/styles/ieee".into(), title: "IEEE".into(), format: "numeric".into() }];
        let lib = Library { notices: &library_notices, search: &search, styles: &styles };
        let found = run_with(root, "claude", "cite_search", &json!({"path": "article.docx", "query": "Williamson 2021"}), Some(&lib)).unwrap();
        assert_eq!(found["items"][0]["key"], "WILLIAMS");

        let r = run_with(root, "claude", "cite", &json!({"path": "article.docx", "find": "réflectances de surface", "keys": ["WILLIAMS"], "locator": "4"}), Some(&lib)).unwrap();
        assert_eq!(r["author"], "Thierry", "{r}");
        assert_eq!(r["result"]["text"], "(Williamson & Menounos, 2021, p. 4)");
        let now = r["now"].as_str().unwrap();
        assert!(now.contains("réflectances de surface [+ +]") || now.contains("réflectances de surface"), "{now}");
        assert!(now.contains("{citation "), "{now}");
        let path = dir.path().join("article.docx");
        let xml = Docx::open(&path).unwrap().document_xml().to_string();
        assert!(xml.contains("ADDIN ZOTERO_ITEM CSL_CITATION"));
        assert!(xml.contains("http://zotero.org/users/1/items/WILLIAMS"));
        // Une clé inconnue : refus net, rien d'écrit.
        let e = run_with(root, "claude", "cite", &json!({"path": "article.docx", "find": "réflectances de surface", "keys": ["NOPE1234"]}), Some(&lib)).unwrap_err();
        assert!(e.contains("NOPE1234"), "{e}");

        let b = run_with(root, "claude", "bibliography", &json!({"path": "article.docx"}), Some(&lib)).unwrap();
        assert_eq!(b["result"]["entries"], 1, "sans notice embarquée, Ren et al. reste hors bibliographie : {b}");
        let b = run_with(root, "claude", "bibliography", &json!({"path": "article.docx", "style": "ieee"}), Some(&lib)).unwrap();
        assert_eq!(b["result"]["style"]["id"], "http://www.zotero.org/styles/ieee", "{b}");
        let read = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap();
        let text = read["text"].as_str().unwrap();
        assert!(text.contains("[1, p. 4]}"), "{text}");
        // Changer la citation par son identifiant, puis la retirer.
        let id = cite_id(text, "[1, p. 4]");
        run_with(root, "claude", "cite", &json!({"path": "article.docx", "citation": id, "keys": ["WILLIAMS", "AUBRYWAK"]}), Some(&lib)).unwrap();
        let text = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap()["text"].as_str().unwrap().to_string();
        assert!(text.contains("[1], [2]") || text.contains("[1, 2]"), "{text}");
        assert!(run(root, "claude", "cite", &json!({"path": "article.docx", "find": "x", "keys": ["WILLIAMS"]})).unwrap_err().contains("Zotero inaccessible"));
    }

    /// Identifiant de la citation qui affiche `shown` (vu dans read).
    fn cite_id(text: &str, shown: &str) -> String {
        let end = text.find(&format!(" : {shown}}}")).unwrap();
        let at = text[..end].rfind("{citation ").unwrap() + 10;
        text[at..end].to_string()
    }

    #[test]
    fn l_agent_lit_et_corrige_une_equation_word_en_suivi() {
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        std::fs::create_dir_all(dir.path().join(".fig_thumbs")).unwrap();
        std::fs::write(dir.path().join(".fig_thumbs/docx_prefs.json"), r#"{"author":"Thierry"}"#).unwrap();
        let root = dir.path().to_str().unwrap();
        // read montre le LaTeX de l'équation et son numéro, pas son texte aplati.
        let text = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap()["text"].as_str().unwrap().to_string();
        let line = text.lines().find(|l| l.contains("{équation 1 : ")).unwrap_or_else(|| panic!("{text}"));
        assert!(line.contains(r"{équation 1 : \alpha =0,356\rho_{1}}"), "{line}");
        let para = line.split(' ').next().unwrap().to_string();

        let r = run(root, "claude", "equation", &json!({"path": "article.docx", "paragraph": para, "latex": r"\beta =0,356\rho_{1}"})).unwrap();
        assert_eq!((r["author"].as_str(), r["proposed_by"].as_str()), (Some("Thierry"), Some("Claude")), "{r}");
        let now = r["now"].as_str().unwrap();
        assert!(now.contains(r"[-{équation : \alpha =0,356\rho_{1}}-]") && now.contains(r"[+{équation 1 : \beta =0,356\rho_{1}}+]"), "{now}");
        // Seul le symbole changé est en suivi, et Atelier sait que c'est l'agent.
        let m = Docx::open(&path).unwrap().model().unwrap();
        let mine: Vec<_> = m.changes.iter().filter(|c| c.author == "Thierry").map(|c| (c.kind.as_str(), c.text.as_str())).collect();
        assert_eq!(mine, [("del", "α"), ("ins", "β")]);
        let marks = atelier_docx::marks::list(&path, &m).unwrap();
        assert!(m.changes.iter().filter(|c| c.author == "Thierry").all(|c| marks.get(&c.id).map(String::as_str) == Some("Claude")), "{marks:?}");

        let e = run(root, "claude", "equation", &json!({"path": "article.docx", "paragraph": para, "equation": 2, "latex": "x"})).unwrap_err();
        assert!(e.contains("introuvable"), "{e}");
        let e = run(root, "claude", "equation", &json!({"path": "article.docx", "paragraph": para, "latex": r"\frac{a}{b"})).unwrap_err();
        assert!(e.contains("LaTeX non converti"), "{e}");
        assert!(run(root, "claude", "equation", &json!({"path": "article.docx", "latex": "x"})).unwrap_err().contains("paragraph manquant"));
    }

    #[test]
    fn l_agent_ajoute_une_equation_word_en_suivi() {
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        std::fs::create_dir_all(dir.path().join(".fig_thumbs")).unwrap();
        std::fs::write(dir.path().join(".fig_thumbs/docx_prefs.json"), r#"{"author":"Thierry"}"#).unwrap();
        let root = dir.path().to_str().unwrap();
        let text = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap()["text"].as_str().unwrap().to_string();
        let line = text.lines().find(|l| l.starts_with("p0 ")).unwrap_or_else(|| panic!("{text}"));
        let word = line[3..].split_whitespace().find(|w| w.chars().all(char::is_alphabetic) && w.len() > 3).unwrap().to_string();

        // En ligne, juste après un mot.
        let r = run(root, "claude", "insert_equation", &json!({"path": "article.docx", "find": word, "paragraph": "p0", "latex": r"a_{z}"})).unwrap();
        let now = r["now"].as_str().unwrap();
        assert!(now.contains(&format!(r"{word}[+{{équation 1 : a_{{z}}}}+]")), "{now}");
        // Centrée dans un paragraphe neuf.
        let r = run(root, "claude", "insert_equation", &json!({"path": "article.docx", "paragraph": "p0", "display": true, "latex": r"\tau^{a}_{z}"})).unwrap();
        assert_eq!(r["result"]["paragraph"], "p1", "{r}");
        let m = Docx::open(&path).unwrap().model().unwrap();
        let s = m.paragraphs[1].segments.iter().find(|s| s.latex.is_some()).unwrap();
        assert!(s.display && s.rev == Some("ins"), "{s:?}");
        assert!(m.changes.iter().filter(|c| c.author == "Thierry").count() >= 4);
        let e = run(root, "claude", "insert_equation", &json!({"path": "article.docx", "latex": "x"})).unwrap_err();
        assert!(e.contains("find manquant"), "{e}");
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

    /// Thierry, 2026-11-15 : l'agent posait la nouvelle figure à côté de
    /// l'ancienne, dans un paragraphe au mauvais style, et lui demandait
    /// d'effacer l'ancienne à la main.
    #[test]
    fn l_agent_remplace_ou_efface_une_figure_en_suivi() {
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        std::fs::create_dir_all(dir.path().join(".fig_thumbs")).unwrap();
        std::fs::write(dir.path().join(".fig_thumbs/docx_prefs.json"), r#"{"author":"Thierry"}"#).unwrap();
        let root = dir.path().to_str().unwrap();
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&[0, 0, 0, 40, 0, 0, 0, 20, 8, 6, 0, 0, 0]);
        std::fs::create_dir_all(dir.path().join("figures")).unwrap();
        std::fs::write(dir.path().join("figures/barres.png"), &png).unwrap();
        let read = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap();
        let line = read["text"].as_str().unwrap().lines().find(|l| l.contains("{image 1 : Figure 2.4}")).unwrap().to_string();
        let p = line.split(' ').next().unwrap().to_string();
        assert!(read["text"].as_str().unwrap().contains("replace_figure"), "la notation dit comment la remplacer");

        // Mauvais numéro, format refusé : rien n'est écrit.
        let before = std::fs::read(&path).unwrap();
        let e = run(root, "claude", "replace_figure", &json!({"path": "article.docx", "paragraph": p, "image": 2, "figure": "figures/barres.png"})).unwrap_err();
        assert!(e.contains("n'a que 1 figure"), "{e}");
        std::fs::write(dir.path().join("figures/barres.svg"), "<svg/>").unwrap();
        assert!(run(root, "claude", "replace_figure", &json!({"path": "article.docx", "paragraph": p, "figure": "figures/barres.svg"})).unwrap_err().contains("PNG, JPEG, GIF ou PDF"));
        assert_eq!(std::fs::read(&path).unwrap(), before);

        let r = run(root, "claude", "replace_figure", &json!({"path": "article.docx", "paragraph": p, "image": 1, "figure": "figures/barres.png"})).unwrap();
        assert_eq!(r["author"], "Thierry", "{r}");
        let now = r["now"].as_str().unwrap();
        assert!(now.contains("[-{image : Figure 2.4}-]#") && now.contains("[+{image 1 : Figure 2.4}+]#"), "{now}");
        assert!(r["note"].as_str().unwrap().contains("même place"), "{r}");
        let m = Docx::open(&path).unwrap().model().unwrap();
        let para = m.paragraphs.iter().find(|x| x.id == p).unwrap();
        let new = para.segments.iter().find(|s| s.media.is_some() && s.rev == Some("ins")).unwrap();
        // Largeur de l'ancienne (96 px), proportions de la nouvelle.
        assert_eq!((new.width, new.height), (Some(96), Some(48)));
        // Les deux suivis sont notés comme venant de l'agent.
        assert!(atelier_docx::marks::list(&path, &m).unwrap().len() >= 2);

        // Effacer la nouvelle, la sienne : sans trace ; l'ancienne reste barrée.
        run(root, "claude", "delete_figure", &json!({"path": "article.docx", "paragraph": p})).unwrap();
        let m = Docx::open(&path).unwrap().model().unwrap();
        let figs: Vec<_> = m.paragraphs.iter().find(|x| x.id == p).unwrap().segments.iter().filter(|s| s.media.is_some()).map(|s| s.rev).collect();
        assert_eq!(figs, [Some("del")]);
        assert!(run(root, "claude", "delete_figure", &json!({"path": "article.docx"})).unwrap_err().contains("paragraph manquant"));
    }

    #[test]
    fn une_figure_pdf_demande_l_outil_de_rendu() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("fig.pdf"), b"%PDF-1.4\n%%EOF").unwrap();
        let root = dir.path().to_str().unwrap();
        let e = figure_bytes(root, "fig.pdf", None).unwrap_err();
        assert!(e.contains("atelier-pdf") && e.contains("PNG"), "{e}");
        std::fs::write(dir.path().join("fig.PNG"), b"x").unwrap();
        assert_eq!(figure_bytes(root, "fig.PNG", None).unwrap(), b"x");
        // Faux atelier-pdf : la page 1, rendue à 2400 px de large.
        use std::os::unix::fs::PermissionsExt;
        let calls = dir.path().join("calls.txt");
        let tool = dir.path().join("atelier-pdf");
        std::fs::write(&tool, format!("#!/bin/sh\necho \"$1 $3 $4\" >> '{c}'\nprintf rendu > \"$5\"\n", c = calls.display())).unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(figure_bytes(root, "fig.pdf", Some(&tool)).unwrap(), b"rendu");
        assert_eq!(std::fs::read_to_string(&calls).unwrap(), "page 1 2400\n");
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
        assert!(text.contains("p10 ") && text.contains("{image 1 : ") && text.contains("action images"), "{text}");

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

    /// La figure p10 remplacée par un EMF de Word pour Mac qui garde, dans un
    /// commentaire, la page PDF collée (cadre portrait 300 × 400 px).
    fn with_pasted_pdf(path: &Path) {
        use std::io::{Read, Write};
        let rec = |kind: u32, data: &[u8]| {
            let mut r = kind.to_le_bytes().to_vec();
            let pad = (4 - data.len() % 4) % 4;
            r.extend(((8 + data.len() + pad) as u32).to_le_bytes());
            r.extend(data);
            r.extend(vec![0; pad]);
            r
        };
        let mut head = vec![0u8; 80];
        head[32..36].copy_from_slice(b" EMF");
        let mut emf = rec(1, &head);
        let pdf = b"%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n";
        let mut data = (pdf.len() as u32).to_le_bytes().to_vec();
        data.extend(pdf);
        emf.extend(rec(70, &data));
        emf.extend(rec(14, &[0; 12]));
        let src = std::fs::read(path).unwrap();
        let mut zin = zip::ZipArchive::new(std::io::Cursor::new(src)).unwrap();
        let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for i in 0..zin.len() {
            let mut f = zin.by_index(i).unwrap();
            let mut name = f.name().to_string();
            let mut bytes = Vec::new();
            f.read_to_end(&mut bytes).unwrap();
            let text = String::from_utf8_lossy(&bytes).to_string();
            let bytes = match name.as_str() {
                "word/media/image1.png" => {
                    name = "word/media/image1.emf".into();
                    emf.clone()
                }
                "word/_rels/document.xml.rels" => text.replace("media/image1.png", "media/image1.emf").into_bytes(),
                "word/document.xml" => text.replacen(r#"<wp:extent cx="914400" cy="914400"/>"#, r#"<wp:extent cx="2857500" cy="3810000"/>"#, 1).into_bytes(),
                "[Content_Types].xml" => text.replace("</Types>", r#"<Default Extension="emf" ContentType="image/x-emf"/></Types>"#).into_bytes(),
                _ => bytes,
            };
            out.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(&bytes).unwrap();
        }
        std::fs::write(path, out.finish().unwrap().into_inner()).unwrap();
    }

    /// Une copie photographiée et collée en PDF dans Word pour Mac : l'agent
    /// reçoit la page elle-même, rendue nette par atelier-pdf, et non l'aperçu
    /// à 72 ppp de l'EMF. Sans l'outil, l'aperçu reste.
    #[cfg(unix)]
    #[test]
    fn une_page_pdf_collee_se_voit_nette() {
        use base64::Engine as _;
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        with_pasted_pdf(&path);
        // Faux atelier-pdf : note ses arguments, rend un PNG de 900 × 1200.
        let page = dir.path().join("page.png");
        let mut png_bytes = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut png_bytes, 900, 1200);
            enc.set_color(png::ColorType::Grayscale);
            enc.write_header().unwrap().write_image_data(&vec![200u8; 900 * 1200]).unwrap();
        }
        std::fs::write(&page, &png_bytes).unwrap();
        let calls = dir.path().join("calls.txt");
        let tool = dir.path().join("atelier-pdf");
        std::fs::write(&tool, format!("#!/bin/sh\nhead -c 8 \"$2\" >> '{c}'; echo \" $1 $3 $4\" >> '{c}'\ncp '{p}' \"$5\"\n", c = calls.display(), p = page.display())).unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();

        let out = images(&path, &json!({"path": "article.docx"}), Some(&tool)).unwrap();
        assert_eq!(out["images"][0]["kind"], "page PDF collée (pleine résolution)", "{out}");
        assert_eq!(out["images"][0]["frame"], "300×400 px");
        // Le PDF extrait de l'EMF, page 1, au côté long de 1200 px (900 de large).
        assert_eq!(std::fs::read_to_string(&calls).unwrap(), "%PDF-1.4 page 1 900\n");
        let att = &out[lim::BRIDGE_IMAGES_KEY][0];
        let png = base64::engine::general_purpose::STANDARD.decode(att["data"].as_str().unwrap()).unwrap();
        assert_eq!(png_size(&png), (900, 1200));

        // Sans atelier-pdf : l'EMF tel quel (ici sans dessin), jamais d'échec muet.
        let out = images(&path, &json!({"path": "article.docx"}), None).unwrap();
        assert_eq!(out["images"][0]["kind"], "EMF", "{out}");
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

    /// Une zone de texte ancrée à la colonne (`x`) et au paragraphe (`y`), en
    /// points, comme Word l'écrit ; trait orange de 2 points, fond blanc.
    fn text_box(x: u32, y: u32, w: u32, h: u32, z: u32, text: &str) -> String {
        let e = |pt: u32| pt * 12_700;
        format!(
            r##"<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor behindDoc="0" relativeHeight="{z}"><wp:positionH relativeFrom="column"><wp:posOffset>{}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>{}</wp:posOffset></wp:positionV><wp:extent cx="{}" cy="{}"/><wp:wrapNone/><wp:docPr id="{z}" name="Rectangle {z}"/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="F79646"/></a:solidFill></a:ln></wps:spPr><wps:txbx><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{text}</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr anchor="ctr"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r>"##,
            e(x),
            e(y),
            e(w),
            e(h)
        )
    }

    /// La fixture, son `word/document.xml` passé par `doc`.
    fn rewrite_document(path: &Path, doc: impl Fn(String) -> String) {
        use std::io::{Read, Write};
        let mut zin = zip::ZipArchive::new(std::io::Cursor::new(std::fs::read(path).unwrap())).unwrap();
        let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for i in 0..zin.len() {
            let mut f = zin.by_index(i).unwrap();
            let name = f.name().to_string();
            let mut bytes = Vec::new();
            f.read_to_end(&mut bytes).unwrap();
            if name == "word/document.xml" {
                bytes = doc(String::from_utf8(bytes).unwrap()).into_bytes();
            }
            out.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(&bytes).unwrap();
        }
        std::fs::write(path, out.finish().unwrap().into_inner()).unwrap();
    }

    /// Un élève pose des zones de texte, avec ses valeurs, sur le schéma d'un
    /// exemple : l'agent les lit et les voit sur la figure, comme dans Word
    /// (2026-11-14, un TP noté « schéma recopié » faute de les voir).
    #[test]
    fn l_agent_voit_les_zones_de_texte_posees_sur_une_figure() {
        use base64::Engine as _;
        let dir = tempfile::tempdir().unwrap();
        let path = fixture(dir.path());
        let root = dir.path().to_str().unwrap();
        // La figure de la fixture : 72 points de côté, centrée dans la colonne
        // de 468 points (de x = 198 à 270). Une zone la recouvre en partie,
        // l'autre est à sa gauche.
        rewrite_document(&path, |doc| {
            let at = doc.find("<w:r><w:drawing><wp:inline").unwrap();
            format!("{}{}{}{}", &doc[..at], text_box(190, 20, 100, 36, 2, "H = 0,4 m"), text_box(0, 60, 150, 30, 3, "Niveau initial = 12,5 m"), &doc[at..])
        });
        let before = std::fs::read(&path).unwrap();

        let read = run(root, "claude", "read", &json!({"path": "article.docx"})).unwrap();
        let text = read["text"].as_str().unwrap();
        assert!(text.contains("Zones de texte : 2."), "{text}");
        assert!(text.contains("{zone de texte : H = 0,4 m}{zone de texte : Niveau initial = 12,5 m}{image 1 : "), "{text}");

        let out = run(root, "claude", "images", &json!({"path": "article.docx"})).unwrap();
        assert_eq!(out["total"], 1, "{out}");
        let entry = &out["images"][0];
        assert_eq!(entry["text_boxes"], json!(["H = 0,4 m", "Niveau initial = 12,5 m"]), "{out}");
        assert!(entry["overlay"].as_str().unwrap().starts_with("2 zone(s) de texte"), "{out}");
        assert!(out["note"].as_str().unwrap().contains("text_boxes"), "{out}");
        let att = &out[lim::BRIDGE_IMAGES_KEY][0];
        assert_eq!(att["mimeType"], "image/png");
        let png = base64::engine::general_purpose::STANDARD.decode(att["data"].as_str().unwrap()).unwrap();
        // Le cadre couvre la figure et les deux zones : de x = 0 à 290, de
        // y = 0 à 90 points, plus 4 points de marge, à 2 pixels par pixel de Word.
        let (w, h) = png_size(&png);
        assert_eq!((w, h), (795, 261));
        let pixmap = resvg::tiny_skia::Pixmap::decode_png(&png).unwrap();
        let k = w as f32 / 298.0;
        let at = |x: f32, y: f32| {
            let c = pixmap.pixel(((x + 4.0) * k) as u32, ((y + 4.0) * k) as u32).unwrap();
            (c.red(), c.green(), c.blue())
        };
        // Le trait orange de la zone posée sur la figure, son fond blanc qui
        // cache la figure dessous, et la seconde zone à sa place.
        assert_eq!(at(190.0, 38.0), (0xF7, 0x96, 0x46));
        assert_eq!(at(194.0, 24.0), (255, 255, 255));
        assert_eq!(at(150.0, 75.0), (0xF7, 0x96, 0x46));
        assert_eq!(at(75.0, 30.0), (255, 255, 255), "hors de la figure et des zones : la page");
        // La figure reste dessous, là où aucune zone ne la couvre.
        let plain = {
            let d2 = tempfile::tempdir().unwrap();
            fixture(d2.path());
            run(d2.path().to_str().unwrap(), "claude", "images", &json!({"path": "article.docx"})).unwrap()
        };
        assert!(plain["images"][0].get("overlay").is_none() && plain["images"][0].get("text_boxes").is_none(), "{plain}");
        let alone = base64::engine::general_purpose::STANDARD.decode(plain[lim::BRIDGE_IMAGES_KEY][0]["data"].as_str().unwrap()).unwrap();
        let fig = resvg::tiny_skia::Pixmap::decode_png(&alone).unwrap();
        let c = fig.pixel(fig.width() * 3 / 4, fig.height() / 8).unwrap();
        assert_eq!(at(198.0 + 54.0, 9.0), (c.red(), c.green(), c.blue()));
        // Lecture seule.
        assert_eq!(std::fs::read(&path).unwrap(), before);

        // Des zones de texte sans figure dessous : dessinées seules, à part.
        rewrite_document(&path, |doc| {
            let at = doc.find("<w:t>Ces valeurs sont").map(|i| doc[..i].rfind("<w:r>").unwrap()).unwrap();
            format!("{}{}{}", &doc[..at], text_box(36, 12, 120, 30, 4, "Note en marge"), &doc[at..])
        });
        let out = run(root, "claude", "images", &json!({"path": "article.docx"})).unwrap();
        assert_eq!(out["total"], 2, "{out}");
        let drawing = out["images"].as_array().unwrap().iter().find(|e| e.get("alt").is_none()).unwrap();
        assert_eq!(drawing["text_boxes"], json!(["Note en marge"]), "{out}");
        assert_eq!(drawing["kind"], "zones de texte et formes dessinées dans Word");
        assert_eq!(drawing["placed"], json!(["« Note en marge » : à 36 pt du bord gauche du texte, 12 pt sous le début du paragraphe"]), "{out}");
        assert!(drawing["shown"].as_u64().is_some(), "{out}");
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
