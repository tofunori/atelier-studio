//! Les « histoires » d'un document Word : le corps, chaque note de bas de
//! page ou de fin, chaque en-tête et pied de page. Chacune vit dans sa
//! partie XML et a ses propres paragraphes, numérotés à partir de zéro.
//!
//! Désignation d'un paragraphe :
//! - `p12` (ou un `w14:paraId`) : corps du document ;
//! - `n3.p0` : premier paragraphe de la note de bas de page `w:id="3"` ;
//! - `e3.p0` : note de fin ;
//! - `header1.p0`, `footer2.p0` : en-tête ou pied de page (`word/header1.xml`…).

use crate::xml::{id_of, is_w, w_attr};
use crate::{DOCUMENT, Docx, Result, err};
use roxmltree::{Document, Node};

pub const FOOTNOTES: &str = "word/footnotes.xml";
pub const ENDNOTES: &str = "word/endnotes.xml";

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Scope {
    Body,
    /// `footnote` ou `endnote`, et son `w:id`.
    Note(&'static str, i64),
    /// En-tête ou pied de page : la racine contient les paragraphes.
    Root,
}

#[derive(Clone, Debug)]
pub(crate) struct StoryRef {
    pub part: String,
    pub scope: Scope,
    /// `p<i>` ou un `w14:paraId`.
    pub local: String,
}

/// Décode une référence de paragraphe.
pub(crate) fn parse_ref(r: &str) -> Result<StoryRef> {
    let Some((story, local)) = r.rsplit_once('.') else {
        return Ok(StoryRef { part: DOCUMENT.into(), scope: Scope::Body, local: r.to_string() });
    };
    let num = |s: &str| s.parse::<i64>().ok();
    let (part, scope) = if let Some(id) = story.strip_prefix('n').and_then(num) {
        (FOOTNOTES.to_string(), Scope::Note("footnote", id))
    } else if let Some(id) = story.strip_prefix('e').and_then(num) {
        (ENDNOTES.to_string(), Scope::Note("endnote", id))
    } else if (story.starts_with("header") || story.starts_with("footer")) && story.chars().all(|c| c.is_ascii_alphanumeric()) {
        (format!("word/{story}.xml"), Scope::Root)
    } else {
        return err(format!("paragraphe {r} introuvable"));
    };
    Ok(StoryRef { part, scope, local: local.to_string() })
}

/// Conteneur des paragraphes d'une histoire dans sa partie.
pub(crate) fn container<'a, 'i>(doc: &'a Document<'i>, scope: &Scope) -> Option<Node<'a, 'i>> {
    match scope {
        Scope::Body => crate::xml::w_child(doc.root_element(), "body"),
        Scope::Note(tag, id) => doc.root_element().children().find(|n| is_w(*n, tag) && w_attr(*n, "id").and_then(|v| v.trim().parse::<i64>().ok()) == Some(*id)),
        Scope::Root => Some(doc.root_element()),
    }
}

/// Note ordinaire (pas un séparateur) ?
pub(crate) fn is_real_note(n: Node) -> bool {
    matches!(w_attr(n, "type"), None | Some("normal")) && id_of(n).is_some()
}

impl Docx {
    /// Partie et texte XML de l'histoire du paragraphe `paragraph`.
    pub(crate) fn story_src(&mut self, paragraph: &str) -> Result<(StoryRef, String)> {
        let story = parse_ref(paragraph)?;
        let Some(src) = self.part(&story.part)? else {
            return err(format!("paragraphe {paragraph} introuvable"));
        };
        Ok((story, src))
    }

    /// Parties qui portent des histoires (corps, notes, en-têtes, pieds).
    pub(crate) fn story_parts(&self) -> Vec<String> {
        let mut out = vec![DOCUMENT.to_string()];
        for n in &self.names {
            let f = n.strip_prefix("word/").unwrap_or("");
            if f.ends_with(".xml") && !f.contains('/') && (f.starts_with("footnotes") || f.starts_with("endnotes") || f.starts_with("header") || f.starts_with("footer")) {
                out.push(n.clone());
            }
        }
        for n in self.parts.keys() {
            if !out.contains(n) && (n == FOOTNOTES || n == ENDNOTES) {
                out.push(n.clone());
            }
        }
        out
    }
}

/// Retire les notes dont l'appel a disparu (appel effacé sans suivi, ou
/// suppression acceptée) : Word ne garde pas de note orpheline.
pub(crate) fn drop_orphan_notes(docx: &mut Docx) -> Result<()> {
    for (part, tag) in [(FOOTNOTES, "footnote"), (ENDNOTES, "endnote")] {
        let Some(src) = docx.part(part)? else { continue };
        let mut refs = String::new();
        for p in docx.story_parts().into_iter().filter(|p| p != part) {
            refs.push_str(&docx.part(&p)?.unwrap_or_default());
        }
        let doc = crate::xml::parse(&src)?;
        let edits: Vec<_> = doc
            .root_element()
            .children()
            .filter(|n| is_w(*n, tag) && is_real_note(*n))
            .filter(|n| {
                let id = w_attr(*n, "id").unwrap_or("").trim();
                !refs.contains(&format!("{tag}Reference w:id=\"{id}\""))
            })
            .map(|n| (n.range(), String::new()))
            .collect();
        if edits.is_empty() {
            continue;
        }
        drop(doc);
        let out = crate::xml::splice(&src, edits)?;
        docx.set_part(part, out);
    }
    Ok(())
}
