//! Une retouche décrite en JSON, appliquée par le panneau comme par l'agent.
//!
//! Le panneau parle en positions (caractères du texte courant d'un
//! paragraphe) ; l'agent parle en passages cités (`find`), avec ou sans
//! paragraphe : sans paragraphe, le passage doit être unique dans le document.

use crate::format::{self, ParaProps, RunProps};
use crate::review::{self, Decision};
use crate::model::DocModel;
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
    Resolve { id: u32, done: Option<bool> },
    DeleteComment { id: u32 },
    FormatRange { paragraph: String, start: usize, end: usize, props: RunProps },
    FormatText { paragraph: Option<String>, find: String, occurrence: Option<usize>, props: RunProps },
    FormatParagraph { paragraph: String, props: ParaProps },
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
            Op::Comment { .. } | Op::CommentRange { .. } | Op::Reply { .. } => "commentaire",
            Op::Resolve { .. } => "résolution",
            Op::DeleteComment { .. } => "suppression de commentaire",
            Op::FormatRange { .. } | Op::FormatText { .. } | Op::FormatParagraph { .. } => "mise en forme",
        }
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
    for p in &model.paragraphs {
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

/// Applique `op` ; `tracked` = suivi des modifications, signé `sig`.
pub fn apply(docx: &mut Docx, op: &Op, tracked: bool, sig: &Signature) -> Result<Value> {
    Ok(match op {
        Op::Accept { id } => {
            review::decide(docx, *id, Decision::Accept)?;
            json!({})
        }
        Op::Reject { id } => {
            review::decide(docx, *id, Decision::Reject)?;
            json!({})
        }
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
            let Some(i) = model.paragraphs.iter().position(|p| p.id == *after || p.para_id.as_deref() == Some(after.as_str())) else {
                return err(format!("paragraphe {after} introuvable"));
            };
            let end = model.paragraphs[i].text.chars().count();
            structure::split(docx, &model.paragraphs[i].id, end, tracked, sig)?;
            let new_id = format!("p{}", i + 1);
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
    })
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
    let _ = writeln!(out, "Notation : [+ajout+]#id, [-suppression-]#id, ⟦c#id⟧…⟦/c#id⟧ = passage commenté, {{citation : …}} et {{objet : …}} non retouchables.\n");
    let mut shown = 0;
    let mut cut_at = None;
    for p in model.paragraphs.iter().take(to).skip(from) {
        let mut line = String::new();
        let mut open: Vec<u32> = Vec::new();
        for s in &p.segments {
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
                    Some(l) if l.starts_with("zotero") => format!("{{citation : {}}}", s.text),
                    Some(l) => format!("{{champ {l} : {}}}", s.text),
                    None => format!("{{champ : {}}}", s.text),
                },
                "object" => format!("{{{} : {}}}", s.label.as_deref().unwrap_or("objet"), s.text),
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
        let entry = format!("{head} : {line}\n");
        if shown + entry.len() > max_chars && shown > 0 {
            cut_at = Some(p.id.clone());
            break;
        }
        shown += entry.len();
        out.push_str(&entry);
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
        let _ = writeln!(out, "\nSuivis hors du corps, à traiter dans Word : {}.", parts.join(", "));
    }
    out
}
