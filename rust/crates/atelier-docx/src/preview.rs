//! Première page d'un document, pour la vignette de la galerie.
//!
//! La galerie dessine la page à l'échelle (format, marges, tailles en
//! points) comme le panneau Word, mais n'a besoin que de ce qui tient sur la
//! première feuille : on garde les paragraphes jusqu'au premier saut de page
//! ou jusqu'à ce que l'estimation de hauteur dépasse la feuille, sans suivis
//! supprimés, sans commentaires ni identifiants de révision.

use crate::DocModel;
use crate::layout::Page;
use crate::model::{Para, Segment};
use serde::Serialize;

/// Plafond de paragraphes, même pour une page de lignes très courtes.
const MAX_PARAGRAPHS: usize = 80;
/// Plafond de caractères par segment : la vignette n'en montre jamais plus.
const MAX_SEGMENT_CHARS: usize = 1500;
/// Lettre US par défaut quand le document ne déclare pas de section.
const LETTER: Page = Page {
    width: 612.0,
    height: 792.0,
    top: 72.0,
    right: 72.0,
    bottom: 72.0,
    left: 72.0,
    header: 36.0,
    footer: 36.0,
    line_numbers: None,
};

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Preview {
    pub page: Page,
    pub paragraphs: Vec<Para>,
}

/// Paragraphes de la première feuille, allégés pour la vignette.
pub fn first_page(model: &DocModel) -> Preview {
    let mut page = model.page.clone().unwrap_or(LETTER);
    page.line_numbers = None;
    // L'estimation est grossière : on garde un quart de feuille de plus et
    // la vignette coupe au bas de la page, comme Word.
    let room = (page.height - page.top - page.bottom).max(72.0) * 1.25;
    let width = (page.width - page.left - page.right).max(72.0);
    let mut used = 0.0f32;
    let mut paragraphs = Vec::new();
    for para in &model.paragraphs {
        if paragraphs.len() >= MAX_PARAGRAPHS || used > room {
            break;
        }
        if para.look.page_break_before && !paragraphs.is_empty() {
            break;
        }
        let (kept, page_break) = light(para);
        used += estimate(&kept, width);
        paragraphs.push(kept);
        if page_break {
            break;
        }
    }
    Preview { page, paragraphs }
}

/// Le paragraphe tel qu'on le lit (suppressions retirées), et s'il finit
/// sur un saut de page.
fn light(para: &Para) -> (Para, bool) {
    let mut out = para.clone();
    out.para_id = None;
    out.mark_change = None;
    let mut segments: Vec<Segment> = Vec::new();
    let mut page_break = false;
    for seg in &para.segments {
        if matches!(seg.rev, Some("del" | "moveFrom")) {
            continue;
        }
        if seg.kind == "break" && seg.label.as_deref() == Some("page") {
            page_break = true;
            break;
        }
        let mut seg = seg.clone();
        seg.change = None;
        seg.rev = None;
        seg.editable = false;
        seg.comments.clear();
        if seg.text.chars().count() > MAX_SEGMENT_CHARS {
            seg.text = seg.text.chars().take(MAX_SEGMENT_CHARS).collect();
        }
        segments.push(seg);
    }
    out.text = segments.iter().map(|s| s.text.as_str()).collect();
    out.segments = segments;
    (out, page_break)
}

/// Hauteur approximative en points : lignes de texte (un caractère moyen
/// vaut un demi-corps), images, espaces avant et après.
fn estimate(para: &Para, width: f32) -> f32 {
    let size = para.look.size.unwrap_or(11.0).max(4.0);
    let line = para
        .look
        .line_exact
        .unwrap_or(size * 1.2 * para.look.line.unwrap_or(1.0))
        .max(para.look.line_min.unwrap_or(0.0));
    let indent = para.look.left.unwrap_or(0.0) + para.look.right.unwrap_or(0.0);
    let per_line = ((width - indent).max(36.0) / (size * 0.5)).max(1.0);
    let chars = para
        .segments
        .iter()
        .filter(|s| s.media.is_none())
        .map(|s| s.text.chars().count())
        .sum::<usize>();
    let lines = (chars as f32 / per_line).ceil().max(1.0);
    let images: f32 = para
        .segments
        .iter()
        .filter_map(|s| s.media.as_ref().and(s.height))
        .map(|h| h as f32 * 0.75)
        .sum();
    para.look.before.unwrap_or(0.0) + lines * line + images + para.look.after.unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout::Look;

    fn seg(text: &str) -> Segment {
        Segment {
            text: text.into(),
            kind: "text",
            label: None,
            change: None,
            rev: None,
            editable: true,
            b: false,
            i: false,
            u: false,
            strike: false,
            sup: false,
            sub: false,
            font: None,
            size: None,
            highlight: None,
            comments: vec![],
            number: None,
            whole: false,
            media: None,
            width: None,
            height: None,
            alt: None,
            crop: None,
            latex: None,
            display: false,
        }
    }

    fn para(id: usize, segments: Vec<Segment>) -> Para {
        Para {
            id: format!("p{id}"),
            para_id: Some("1A2B".into()),
            style: None,
            heading: None,
            list: false,
            align: None,
            cell: None,
            mark_change: Some(3),
            text: segments.iter().map(|s| s.text.clone()).collect(),
            segments,
            look: Look::default(),
        }
    }

    fn model(paragraphs: Vec<Para>) -> DocModel {
        DocModel {
            revision: String::new(),
            page: None,
            paragraphs,
            notes: vec![],
            headers: vec![],
            changes: vec![],
            comments: vec![],
            authors: vec![],
            other_parts: vec![],
        }
    }

    #[test]
    fn coupe_au_saut_de_page() {
        let mut brk = seg("");
        brk.kind = "break";
        brk.label = Some("page".into());
        let m = model(vec![
            para(0, vec![seg("Titre"), brk, seg("caché")]),
            para(1, vec![seg("page deux")]),
        ]);
        let p = first_page(&m);
        assert_eq!(p.paragraphs.len(), 1);
        assert_eq!(p.paragraphs[0].text, "Titre");
    }

    #[test]
    fn retire_suppressions_et_commentaires() {
        let mut del = seg("effacé ");
        del.rev = Some("del");
        let mut ins = seg("ajouté");
        ins.rev = Some("ins");
        ins.change = Some(7);
        ins.comments = vec![2];
        let p = first_page(&model(vec![para(0, vec![seg("Texte "), del, ins])]));
        let only = &p.paragraphs[0];
        assert_eq!(only.text, "Texte ajouté");
        assert!(
            only.segments
                .iter()
                .all(|s| s.rev.is_none() && s.change.is_none() && s.comments.is_empty())
        );
        assert!(only.para_id.is_none() && only.mark_change.is_none());
    }

    #[test]
    fn s_arrete_quand_la_feuille_est_pleine() {
        let long = "mot ".repeat(400);
        let m = model((0..40).map(|i| para(i, vec![seg(&long)])).collect());
        let p = first_page(&m);
        assert!(p.paragraphs.len() < 10, "{}", p.paragraphs.len());
        assert_eq!(p.page.width, 612.0);
    }

    #[test]
    fn saut_de_page_avant_ferme_la_feuille() {
        let mut second = para(1, vec![seg("Chapitre 2")]);
        second.look.page_break_before = true;
        let p = first_page(&model(vec![para(0, vec![seg("Chapitre 1")]), second]));
        assert_eq!(p.paragraphs.len(), 1);
    }
}
