//! Une retouche décrite en JSON, appliquée par le panneau comme par l'agent.
//!
//! Le panneau parle en positions (caractères du texte courant d'un
//! paragraphe) ; l'agent parle en passages cités (`find`), avec ou sans
//! paragraphe : sans paragraphe, le passage doit être unique dans le document.

use crate::format::{self, ParaProps, RunProps};
use crate::review::{self, Decision};
use crate::model::{DocModel, Segment};
use crate::{Docx, Result, Signature, comments, edit, err, structure};
use std::fmt::Write as _;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Op {
    Accept { id: u32 },
    Reject { id: u32 },
    AcceptAll { author: Option<String> },
    RejectAll { author: Option<String> },
    /// Remplace un passage cité (`with` vide = supprimer).
    Replace { paragraph: Option<String>, find: String, occurrence: Option<usize>, with: String },
    /// Remplace les caractères [start, end) (frappe, retour arrière, Suppr).
    ReplaceRange { paragraph: String, start: usize, end: usize, with: String },
    Insert { paragraph: String, at: usize, with: String },
    /// Entrée : coupe le paragraphe à la position `at`.
    Split { paragraph: String, at: usize },
    /// Retour arrière en début de paragraphe : le recolle au précédent.
    Join { paragraph: String },
    /// Nouveau paragraphe après `after` (même style que lui, ou le style
    /// suivant d'un titre), contenant `text`.
    InsertParagraph { after: String, text: String },
    Comment { paragraph: Option<String>, find: String, occurrence: Option<usize>, text: String },
    CommentRange { paragraph: String, start: usize, end: usize, text: String },
    Reply { parent: u32, text: String },
    /// Réécrit un commentaire ou une réponse de l'auteur qui signe.
    EditComment { id: u32, text: String },
    Resolve { id: u32, done: Option<bool> },
    DeleteComment { id: u32 },
    FormatRange { paragraph: String, start: usize, end: usize, props: RunProps },
    FormatText { paragraph: Option<String>, find: String, occurrence: Option<usize>, props: RunProps },
    FormatParagraph { paragraph: String, props: ParaProps },
    /// Ligne vide au-dessus ou en dessous de celle du paragraphe (cellule).
    InsertRow { paragraph: String, #[serde(default)] above: bool },
    DeleteRow { paragraph: String },
    /// Colonne vide à gauche ou à droite (jamais en suivi).
    InsertColumn { paragraph: String, #[serde(default)] left: bool },
    DeleteColumn { paragraph: String },
    /// Appel de note à la position `at`, et la note qui porte `text`.
    InsertNote { paragraph: String, at: usize, text: String, #[serde(default)] endnote: bool },
    /// Figure du projet (`path`, chargé par l'appelant via [`Op::load_images`]).
    InsertImage {
        paragraph: String,
        at: usize,
        path: String,
        #[serde(default)]
        alt: String,
        #[serde(skip)]
        bytes: Option<Vec<u8>>,
    },
    /// Remplace la `index`-ième figure (depuis 0) du paragraphe par celle du
    /// projet (`path`, chargée via [`Op::load_images`]) : même place, même
    /// largeur, même paragraphe (et donc même style). En suivi, l'ancienne
    /// barrée et la nouvelle ajoutée. `alt` vide : celui de l'ancienne.
    ReplaceImage {
        paragraph: String,
        index: usize,
        path: String,
        #[serde(default)]
        alt: String,
        #[serde(skip)]
        bytes: Option<Vec<u8>>,
    },
    /// Efface la `index`-ième figure (depuis 0) du paragraphe d'un bloc.
    DeleteImage { paragraph: String, index: usize },
    /// Corrige la `index`-ième équation (depuis 0) du paragraphe d'après
    /// son LaTeX : en suivi, l'ancienne supprimée et la nouvelle insérée.
    ReplaceMath { paragraph: String, index: usize, latex: String },
    /// Nouvelle équation écrite en LaTeX : à la position `at` du paragraphe,
    /// ou, avec `display`, seule et centrée dans un paragraphe neuf après
    /// `paragraph` (`at` ignoré). En suivi, notée comme Word.
    InsertMath { paragraph: String, #[serde(default)] at: usize, latex: String, #[serde(default)] display: bool },
    /// Collage riche : morceaux mis en forme et équations, un paragraphe
    /// par élément de `paragraphs`.
    InsertRuns { paragraph: String, at: usize, paragraphs: Vec<Vec<crate::paste::RunIn>> },
    /// Citation Zotero vivante à la position `at` (champ du module Zotero de
    /// Word) ; les notices sont chargées par l'appelant (`cite::fill`).
    InsertCitation { paragraph: String, at: usize, items: Vec<crate::cite::CiteItem> },
    /// Réécrit la citation `citation` (`items` vide = la retirer).
    EditCitation { citation: String, items: Vec<crate::cite::CiteItem> },
    /// Bibliographie Zotero après le paragraphe `after` (hors suivi).
    InsertBibliography { after: String },
    /// Style de citation du document ; tout est remis à jour (hors suivi).
    SetCitationStyle { style: crate::cite::StyleRef },
    /// Remet à jour les citations et la bibliographie (hors suivi).
    RefreshCitations {},
    /// Plusieurs retouches d'un seul geste (sélection sur plusieurs
    /// paragraphes, collage de plusieurs lignes) : tout ou rien, un seul
    /// enregistrement, une seule annulation.
    Batch { ops: Vec<Op> },
}

impl Op {
    /// Nom court pour le journal et les messages d'erreur.
    pub fn label(&self) -> &'static str {
        match self {
            Op::Accept { .. } => "accepter",
            Op::Reject { .. } => "refuser",
            Op::AcceptAll { .. } => "tout accepter",
            Op::RejectAll { .. } => "tout refuser",
            Op::Replace { .. } | Op::ReplaceRange { .. } | Op::Insert { .. } => "retouche",
            Op::Split { .. } | Op::Join { .. } | Op::InsertParagraph { .. } => "paragraphe",
            Op::Comment { .. } | Op::CommentRange { .. } | Op::Reply { .. } | Op::EditComment { .. } => "commentaire",
            Op::Resolve { .. } => "résolution",
            Op::DeleteComment { .. } => "suppression de commentaire",
            Op::FormatRange { .. } | Op::FormatText { .. } | Op::FormatParagraph { .. } => "mise en forme",
            Op::InsertNote { .. } => "note",
            Op::InsertRow { .. } | Op::DeleteRow { .. } | Op::InsertColumn { .. } | Op::DeleteColumn { .. } => "tableau",
            Op::InsertImage { .. } | Op::ReplaceImage { .. } | Op::DeleteImage { .. } => "figure",
            Op::ReplaceMath { .. } | Op::InsertMath { .. } => "équation",
            Op::InsertRuns { .. } => "collage",
            Op::InsertCitation { .. } | Op::EditCitation { .. } => "citation",
            Op::InsertBibliography { .. } | Op::SetCitationStyle { .. } | Op::RefreshCitations {} => "bibliographie",
            Op::Batch { .. } => "retouches groupées",
        }
    }

    /// Le commentaire ou le suivi que vise une retouche désignée par son
    /// identifiant (résoudre, répondre, réécrire ou supprimer un
    /// commentaire ; accepter ou refuser un suivi) : `(est un suivi, id)`.
    fn aimed_at(&self) -> Option<(bool, u32)> {
        match self {
            Op::Resolve { id, .. } | Op::EditComment { id, .. } | Op::DeleteComment { id } => Some((false, *id)),
            Op::Reply { parent, .. } => Some((false, *parent)),
            Op::Accept { id } | Op::Reject { id } => Some((true, *id)),
            _ => None,
        }
    }

    /// Charge les figures à insérer : `read` valide le chemin (dans le
    /// projet) et rend ses octets. Le moteur ne lit jamais le disque seul.
    pub fn load_images(&mut self, read: &mut dyn FnMut(&str) -> Result<Vec<u8>>) -> Result<()> {
        match self {
            Op::InsertImage { path, bytes, .. } | Op::ReplaceImage { path, bytes, .. } => *bytes = Some(read(path)?),
            Op::Batch { ops } => {
                for op in ops {
                    op.load_images(read)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
}

/// Une retouche calculée sur une révision dépassée (l'agent, Word ou un
/// autre panneau a écrit entre-temps, séance refermée puis rouverte) garde
/// son sens si elle vise un commentaire ou un suivi par son identifiant et
/// que cette cible est toujours la même : `raw.expect` porte l'auteur et le
/// texte (et la date, s'il y en a une) tels que le panneau les a vus. On
/// l'applique alors sur la révision courante au lieu de la jeter (409) :
/// une résolution ou une réponse ne se perd plus parce que l'agent a écrit
/// une autre bulle pendant ce temps.
pub fn still_aimed(model: &DocModel, raw: &Value) -> bool {
    let Ok(op) = serde_json::from_value::<Op>(raw.clone()) else { return false };
    if let Op::Batch { .. } = op {
        // Plusieurs décisions d'un geste : chacune doit viser toujours la même cible.
        return raw.get("ops").and_then(Value::as_array).is_some_and(|ops| !ops.is_empty() && ops.iter().all(|o| still_aimed(model, o)));
    }
    let Some((change, id)) = op.aimed_at() else { return false };
    let Some(expect) = raw.get("expect") else { return false };
    let s = |k: &str| expect.get(k).and_then(Value::as_str);
    let (Some(author), Some(text)) = (s("author"), s("text")) else { return false };
    let date_ok = |d: &str| s("date").is_none_or(|e| e == d);
    if change {
        model.changes.iter().any(|c| c.id == id && c.author == author && c.text == text && date_ok(&c.date) && s("kind").is_none_or(|k| k == c.kind))
    } else {
        model.comments.iter().any(|c| c.id == id && c.author == author && c.text.trim() == text.trim() && date_ok(&c.date))
    }
}

/// Paragraphe où se trouve `find` : celui donné, sinon l'unique paragraphe
/// qui le contient (avec `occurrence`, la n-ième apparition dans le document).
fn locate(docx: &mut Docx, paragraph: Option<&str>, find: &str, occurrence: Option<usize>) -> Result<(String, Option<usize>)> {
    if let Some(p) = paragraph.filter(|p| !p.is_empty()) {
        return Ok((p.to_string(), occurrence));
    }
    if find.is_empty() {
        return err("passage vide : citer le texte à retoucher");
    }
    let model = docx.model()?;
    let mut hits: Vec<(String, usize)> = Vec::new();
    for p in model.all_paragraphs() {
        let n = p.text.matches(find).count();
        for k in 1..=n {
            hits.push((p.id.clone(), k));
        }
    }
    match (hits.len(), occurrence) {
        (0, _) => err(format!("« {find} » introuvable dans le document")),
        (1, None) => Ok((hits[0].0.clone(), Some(1))),
        (n, None) => {
            let ids: Vec<&str> = hits.iter().map(|(p, _)| p.as_str()).collect();
            err(format!("« {find} » apparaît {n} fois ({}) : préciser le paragraphe ou l'occurrence", ids.join(", ")))
        }
        (n, Some(k)) if k == 0 || k > n => err(format!("« {find} » n'apparaît que {n} fois")),
        (_, Some(k)) => Ok((hits[k - 1].0.clone(), Some(hits[k - 1].1))),
    }
}

/// `r` désigne-t-il ce paragraphe ? Par son identifiant (`p3`, `n1.p0`), son
/// `w14:paraId` nu ou la forme `id:<paraId>` du panneau.
fn designates(p: &crate::model::Para, r: &str) -> bool {
    let pid = r.strip_prefix("id:").unwrap_or(r);
    p.id == r || (!pid.is_empty() && p.para_id.as_deref().is_some_and(|v| v.eq_ignore_ascii_case(pid)))
}

/// Position juste après `find` (agent : « appel de note après tel mot »).
pub fn place_after(docx: &mut Docx, paragraph: Option<&str>, find: &str, occurrence: Option<usize>) -> Result<(String, usize)> {
    let (p, occ) = locate(docx, paragraph, find, occurrence)?;
    let model = docx.model()?;
    let Some(para) = model.all_paragraphs().find(|x| designates(x, &p)) else {
        return err(format!("paragraphe {p} introuvable"));
    };
    let k = occ.unwrap_or(1);
    let Some((byte, _)) = para.text.match_indices(find).nth(k.saturating_sub(1)) else {
        return err(format!("« {find} » introuvable dans {p}"));
    };
    Ok((para.id.clone(), para.text[..byte].chars().count() + find.chars().count()))
}

/// Applique `op` ; `tracked` = suivi des modifications, signé `sig`.
pub fn apply(docx: &mut Docx, op: &Op, tracked: bool, sig: &Signature) -> Result<Value> {
    Ok(match op {
        Op::Accept { id } => json!({"decided": review::decide_group(docx, *id, Decision::Accept)?}),
        Op::Reject { id } => json!({"decided": review::decide_group(docx, *id, Decision::Reject)?}),
        Op::AcceptAll { author } => json!(review::decide_all(docx, Decision::Accept, author.as_deref())?),
        Op::RejectAll { author } => json!(review::decide_all(docx, Decision::Reject, author.as_deref())?),
        Op::Replace { paragraph, find, occurrence, with } => {
            let (p, occ) = locate(docx, paragraph.as_deref(), find, *occurrence)?;
            json!({"paragraph": p, "result": edit::replace(docx, &p, find, occ, with, tracked, sig)?})
        }
        Op::ReplaceRange { paragraph, start, end, with } => {
            json!(edit::replace_range(docx, paragraph, *start, *end, with, tracked, sig)?)
        }
        Op::Insert { paragraph, at, with } => json!(edit::insert(docx, paragraph, *at, with, tracked, sig)?),
        Op::Split { paragraph, at } => {
            structure::split(docx, paragraph, *at, tracked, sig)?;
            json!({})
        }
        Op::Join { paragraph } => {
            structure::join(docx, paragraph, tracked, sig)?;
            json!({})
        }
        Op::InsertParagraph { after, text } => {
            let model = docx.model()?;
            let Some(p) = model.all_paragraphs().find(|p| designates(p, after)) else {
                return err(format!("paragraphe {after} introuvable"));
            };
            let end = p.text.chars().count();
            let id = p.id.clone();
            structure::split(docx, &id, end, tracked, sig)?;
            let (prefix, local) = id.rsplit_once('.').map(|(a, b)| (format!("{a}."), b.to_string())).unwrap_or((String::new(), id.clone()));
            let i: usize = local.trim_start_matches('p').parse().unwrap_or(0);
            let new_id = format!("{prefix}p{}", i + 1);
            if !text.is_empty() {
                edit::insert(docx, &new_id, 0, text, tracked, sig)?;
            }
            json!({"paragraph": new_id})
        }
        Op::Comment { paragraph, find, occurrence, text } => {
            let (p, occ) = locate(docx, paragraph.as_deref(), find, *occurrence)?;
            json!(comments::add(docx, &p, find, occ, text, sig)?)
        }
        Op::CommentRange { paragraph, start, end, text } => json!(comments::add_range(docx, paragraph, *start, *end, text, sig)?),
        Op::Reply { parent, text } => json!(comments::reply(docx, *parent, text, sig)?),
        Op::EditComment { id, text } => {
            comments::edit(docx, *id, text, sig)?;
            json!({})
        }
        Op::Resolve { id, done } => {
            comments::resolve(docx, *id, done.unwrap_or(true))?;
            json!({})
        }
        Op::DeleteComment { id } => {
            comments::delete(docx, *id)?;
            json!({})
        }
        Op::FormatRange { paragraph, start, end, props } => {
            json!(format::format_range(docx, paragraph, *start, *end, props, tracked, sig)?)
        }
        Op::FormatText { paragraph, find, occurrence, props } => {
            let (p, occ) = locate(docx, paragraph.as_deref(), find, *occurrence)?;
            json!(format::format_text(docx, &p, find, occ, props, tracked, sig)?)
        }
        Op::FormatParagraph { paragraph, props } => {
            format::format_paragraph(docx, paragraph, props, tracked, sig)?;
            json!({})
        }
        Op::InsertRow { paragraph, above } => {
            crate::table::insert_row(docx, paragraph, *above, tracked, sig)?;
            json!({})
        }
        Op::DeleteRow { paragraph } => {
            crate::table::delete_row(docx, paragraph, tracked, sig)?;
            json!({})
        }
        Op::InsertColumn { paragraph, left } => {
            crate::table::insert_column(docx, paragraph, *left)?;
            json!({"tracked": false})
        }
        Op::DeleteColumn { paragraph } => {
            crate::table::delete_column(docx, paragraph)?;
            json!({"tracked": false})
        }
        Op::InsertNote { paragraph, at, text, endnote } => json!(crate::objects::insert_note(docx, paragraph, *at, text, *endnote, tracked, sig)?),
        Op::InsertImage { paragraph, at, path, alt, bytes } => {
            let Some(b) = bytes else { return err("figure non chargée") };
            let name = std::path::Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or("figure");
            json!(crate::objects::insert_image(docx, paragraph, *at, b.clone(), name, alt, tracked, sig)?)
        }
        Op::ReplaceImage { paragraph, index, path, alt, bytes } => {
            let Some(b) = bytes else { return err("figure non chargée") };
            let name = std::path::Path::new(path).file_name().and_then(|n| n.to_str()).unwrap_or("figure");
            json!(crate::objects::replace_image(docx, paragraph, *index, b.clone(), name, alt, tracked, sig)?)
        }
        Op::DeleteImage { paragraph, index } => json!(crate::objects::delete_image(docx, paragraph, *index, tracked, sig)?),
        Op::ReplaceMath { paragraph, index, latex } => {
            json!({"changes": crate::math::replace_math(docx, paragraph, *index, latex, tracked, sig)?})
        }
        Op::InsertMath { paragraph, at, latex, display } => json!(crate::math::insert_math(docx, paragraph, *at, latex, *display, tracked, sig)?),
        Op::InsertRuns { paragraph, at, paragraphs } => json!(crate::paste::insert_runs(docx, paragraph, *at, paragraphs, tracked, sig)?),
        Op::InsertCitation { paragraph, at, items } => json!(crate::cite::insert_citation(docx, paragraph, *at, items, tracked, sig)?),
        Op::EditCitation { citation, items } => json!(crate::cite::edit_citation(docx, citation, items, tracked, sig)?),
        Op::InsertBibliography { after } => json!({"entries": crate::cite::insert_bibliography(docx, after)?, "tracked": false}),
        Op::SetCitationStyle { style } => json!({"style": crate::cite::set_style(docx, style)?, "tracked": false}),
        Op::RefreshCitations {} => json!({"updated": crate::cite::refresh_all(docx)?, "tracked": false}),
        Op::Batch { ops } => {
            // Sur une copie : une étape qui échoue n'en laisse aucune à moitié.
            let mut results = Vec::with_capacity(ops.len());
            let mut work = docx.clone();
            // Suivis déjà décidés avec un autre (le geste d'une équation).
            let mut decided: std::collections::BTreeSet<u64> = std::collections::BTreeSet::new();
            for (k, op) in ops.iter().enumerate() {
                if let Op::Accept { id } | Op::Reject { id } = op
                    && decided.contains(&(*id as u64)) {
                        results.push(json!({"decided": [], "already": id}));
                        continue;
                    }
                let r = apply(&mut work, op, tracked, sig).map_err(|e| crate::DocxError(format!("étape {} ({}) : {}", k + 1, op.label(), e.0)))?;
                decided.extend(r.get("decided").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_u64));
                results.push(r);
            }
            *docx = work;
            json!({"results": results})
        }
    })
}

/// Une ligne du texte pour l'agent : identifiant, style, contenu annoté.
/// Zone de texte ou forme dessinée, pour l'agent : `{zone de texte : ligne
/// 1 / ligne 2}`, `{trait}`, `{forme}`.
fn shape_note(sh: &crate::shapes::Shape) -> String {
    let text = sh.text().replace('\n', " / ");
    if text.is_empty() { format!("{{{}}}", sh.label()) } else { format!("{{{} : {text}}}", sh.label()) }
}

fn para_line(p: &crate::model::Para) -> String {
    let mut line = String::new();
    let mut open: Vec<u32> = Vec::new();
    // Équations et figures comptées comme `replace_math` et
    // `replace_image` : celles qui ne sont pas barrées.
    let mut equations = 0;
    let mut figures = 0;
    // Zones de texte et formes sans morceau à elles : devant le segment où
    // elles sont ancrées.
    let drawn = |line: &mut String, at: Option<usize>| {
        for (k, sh) in p.shapes.iter().enumerate() {
            let own = p.segments.iter().any(|s| s.shape == Some(k));
            let here = match at {
                Some(i) => sh.seg == Some(i),
                None => sh.seg.is_none_or(|i| i >= p.segments.len()),
            };
            if !own && here {
                line.push_str(&shape_note(sh));
            }
        }
    };
    for (si, s) in p.segments.iter().enumerate() {
        drawn(&mut line, Some(si));
        for c in open.clone() {
            if !s.comments.contains(&c) {
                let _ = write!(line, "⟦/c{c}⟧");
                open.retain(|x| *x != c);
            }
        }
        for c in &s.comments {
            if !open.contains(c) {
                let _ = write!(line, "⟦c{c}⟧");
                open.push(*c);
            }
        }
        let body = match s.kind {
            "tab" => "\t".to_string(),
            "break" => "↵".to_string(),
            "field" => match s.label.as_deref() {
                Some(_) if s.cite.is_some() => {
                    // Une citation = un seul bloc, même sur plusieurs morceaux.
                    let first = si == 0 || p.segments[si - 1].cite != s.cite;
                    let last = p.segments.get(si + 1).is_none_or(|n| n.cite != s.cite);
                    let head = if first { format!("{{citation {} : ", s.cite.as_deref().unwrap_or("")) } else { String::new() };
                    format!("{head}{}{}", s.text, if last { "}" } else { "" })
                }
                Some("zotero-bibliographie") => format!("{{bibliographie Zotero : {}}}", s.text),
                Some(l) if l.starts_with("zotero") => format!("{{citation : {}}}", s.text),
                Some(l) => format!("{{champ {l} : {}}}", s.text),
                None => format!("{{champ : {}}}", s.text),
            },
            // Équation de Word : son LaTeX, et son numéro dans le paragraphe
            // pour la corriger (action equation).
            "object" if s.latex.is_some() => {
                let latex = s.latex.as_deref().unwrap_or("");
                if matches!(s.rev, Some("del" | "moveFrom")) {
                    format!("{{équation : {latex}}}")
                } else {
                    equations += 1;
                    format!("{{équation {equations} : {latex}}}")
                }
            }
            "object" => match (s.label.as_deref(), s.number) {
                (Some("note"), Some(k)) => format!("{{note {k} : n{}}}", s.text),
                (Some("note de fin"), Some(k)) => format!("{{note de fin {k} : e{}}}", s.text),
                // Figure : son texte de remplacement ; `images` la montre telle que la page.
                // Numérotée dans le paragraphe pour la remplacer ou l'effacer
                // (actions replace_figure, delete_figure).
                (Some("image"), _) if s.media.is_some() => {
                    let what = if s.chart { "graphique Excel" } else { "image" };
                    let alt = s.alt.as_deref().unwrap_or("sans texte de remplacement");
                    if matches!(s.rev, Some("del" | "moveFrom")) {
                        format!("{{{what} : {alt}}}")
                    } else {
                        figures += 1;
                        format!("{{{what} {figures} : {alt}}}")
                    }
                }
                // Zone de texte ou forme dessinée : son texte, pas un caractère de remplacement.
                _ if s.shape.and_then(|k| p.shapes.get(k)).is_some() => shape_note(&p.shapes[s.shape.unwrap()]),
                (l, _) => format!("{{{} : {}}}", l.unwrap_or("objet"), s.text),
            },
            _ => s.text.clone(),
        };
        match (s.rev, s.change) {
            (Some("ins" | "moveTo"), Some(id)) => { let _ = write!(line, "[+{body}+]#{id}"); }
            (Some(_), Some(id)) => { let _ = write!(line, "[-{body}-]#{id}"); }
            _ => line.push_str(&body),
        }
    }
    for c in open {
        let _ = write!(line, "⟦/c{c}⟧");
    }
    drawn(&mut line, None);
    let mut head = p.id.clone();
    if let Some(h) = p.heading {
        let _ = write!(head, " [titre {h}]");
    } else if let Some(st) = &p.style
        && st != "Normal" {
            let _ = write!(head, " [{st}]");
        }
    if let Some([t, r, c]) = p.cell {
        let _ = write!(head, " [tableau {t} ligne {r} cellule {c}]");
    }
    if let Some(id) = p.mark_change {
        let _ = write!(head, " [marque de paragraphe #{id}]");
    }
    format!("{head} : {line}\n")
}

/// Le document en texte pour l'agent : un paragraphe par ligne, préfixé de
/// son identifiant, suivis et commentaires marqués en ligne, puis la liste
/// des suivis et des fils de commentaires. `from..to` borne les paragraphes ;
/// au-delà de `max_chars`, la suite est annoncée plutôt que coupée en silence.
pub fn outline(model: &DocModel, from: usize, to: Option<usize>, max_chars: usize) -> String {
    let mut out = String::new();
    let n = model.paragraphs.len();
    let to = to.unwrap_or(n).min(n);
    let by_author: Vec<String> = model.authors.iter().map(|a| format!("{} ({} suivis, {} commentaires)", a.name, a.changes, a.comments)).collect();
    let _ = writeln!(out, "Document : {n} paragraphes, {} suivis, {} commentaires. Auteurs : {}.", model.changes.len(), model.comments.len(), if by_author.is_empty() { "aucun".into() } else { by_author.join(", ") });
    // Figures (corps, notes, en-têtes) : l'agent les regarde au lieu de
    // conclure, d'après un texte de remplacement, qu'il ne peut pas les voir.
    let figures: Vec<&Segment> = model.all_paragraphs().flat_map(|p| p.segments.iter().filter(|s| s.media.is_some())).collect();
    if !figures.is_empty() {
        let charts = figures.iter().filter(|s| s.chart).count();
        let dont = if charts > 0 { format!(", dont {charts} graphique{} Excel", if charts > 1 { "s" } else { "" }) } else { String::new() };
        let _ = writeln!(
            out,
            "Figures : {}{dont}. Tu peux les voir telles que sur la page avec l'action images : regarde-les avant d'en parler, ne dis jamais que tu ne peux pas voir une figure ou un graphique.",
            figures.len()
        );
    }
    // Zones de texte : l'auteur y écrit souvent sa réponse par-dessus une
    // figure ; sans elles, on croit la figure recopiée telle quelle.
    let boxes = model.all_paragraphs().flat_map(|p| p.shapes.iter()).filter(|s| !s.text().is_empty()).count();
    if boxes > 0 {
        let _ = writeln!(
            out,
            "Zones de texte : {boxes}. L'auteur les a posées sur la page, souvent par-dessus une figure pour y écrire ses propres valeurs : leur texte ({{zone de texte : …}}) fait partie du document au même titre que le reste, et l'action images montre chaque figure avec les zones posées dessus."
        );
    }
    let _ = writeln!(out, "Notation : [+ajout+]#id, [-suppression-]#id, ⟦c#id⟧…⟦/c#id⟧ = passage commenté, {{citation <id> : …}} = citation Zotero vivante (la changer avec l'action cite et son id, jamais à la main), {{équation N : LaTeX}} = équation Word (objet OMML), la N-ième du paragraphe, écrite en LaTeX (la corriger avec l'action equation : paragraph, equation=N, latex) ; {{objet : …}} non retouchable ; {{image N : …}} et {{graphique Excel N : …}} = N-ième figure du paragraphe, à voir avec l'action images, à remplacer (replace_figure : paragraph, image=N, figure) ou effacer (delete_figure) ; {{zone de texte : …}} = texte d'un cadre posé sur la page (lignes séparées par /), non retouchable ici.\n");
    let mut shown = 0;
    let mut cut_at = None;
    for p in model.paragraphs.iter().take(to).skip(from) {
        let entry = para_line(p);
        if shown + entry.len() > max_chars && shown > 0 {
            cut_at = Some(p.id.clone());
            break;
        }
        shown += entry.len();
        out.push_str(&entry);
    }
    // Notes, en-têtes et pieds : avec la fin du corps.
    if cut_at.is_none() && to == n {
        if !model.notes.is_empty() {
            out.push_str("\nNotes (appel {note N : nK} dans le corps ; paragraphes nK.p0…) :\n");
            for note in &model.notes {
                let num = note.number.map(|k| k.to_string()).unwrap_or_else(|| "sans appel".into());
                let kind = if note.kind == "endnote" { "note de fin" } else { "note" };
                let _ = writeln!(out, "[{kind} {num}]");
                for p in &note.paragraphs {
                    out.push_str(&para_line(p));
                }
            }
        }
        if !model.headers.is_empty() {
            out.push_str("\nEn-têtes et pieds de page :\n");
            for h in &model.headers {
                let kind = if h.kind == "header" { "en-tête" } else { "pied de page" };
                let which = match h.which.as_str() { "first" => " (première page)", "even" => " (pages paires)", _ => "" };
                let _ = writeln!(out, "[{kind}{which}]");
                for p in &h.paragraphs {
                    out.push_str(&para_line(p));
                }
            }
        }
    }
    if let Some(id) = cut_at {
        let _ = writeln!(out, "… suite à partir de {id} : relire avec from={}.", id.trim_start_matches('p'));
    }
    if !model.changes.is_empty() {
        out.push_str("\nSuivis :\n");
        for c in &model.changes {
            let _ = writeln!(out, "#{} {} {} {}{} « {} »", c.id, c.kind, c.author, c.date.get(..10).unwrap_or(""), c.paragraph.as_deref().map(|p| format!(" ({p})")).unwrap_or_default(), c.text);
        }
    }
    if !model.comments.is_empty() {
        out.push_str("\nCommentaires :\n");
        for c in model.comments.iter().filter(|c| c.parent.is_none()) {
            let state = if c.done { " [résolu]" } else { "" };
            let _ = writeln!(out, "c{} {} {}{}{} sur « {} » : {}", c.id, c.author, c.date.get(..10).unwrap_or(""), c.paragraph.as_deref().map(|p| format!(" ({p})")).unwrap_or_default(), state, c.quote, c.text);
            for r in model.comments.iter().filter(|r| r.parent == Some(c.id)) {
                let _ = writeln!(out, "  ↳ c{} {} : {}", r.id, r.author, r.text);
            }
        }
    }
    if !model.other_parts.is_empty() {
        let parts: Vec<String> = model.other_parts.iter().map(|o| format!("{} ({})", o.part, o.changes)).collect();
        let _ = writeln!(out, "\nSuivis dans des parties non lues, à traiter dans Word : {}.", parts.join(", "));
    }
    out
}
