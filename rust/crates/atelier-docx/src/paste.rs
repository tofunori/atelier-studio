//! Collage riche : des morceaux de texte mis en forme (gras, italique,
//! souligné, exposant, indice) et des équations en LaTeX, sur un ou
//! plusieurs paragraphes. Le panneau extrait les morceaux du presse-papiers
//! (HTML de Word, d'une page web, d'un PDF ou d'Atelier) ; tout ce qui
//! touche le XML se fait ici. En suivi, le collage est une insertion suivie
//! signée, comme la frappe ; chaque nouveau paragraphe naît d'une coupe
//! suivie (Entrée).

use crate::edit::{insert_raw, run_len, run_starts, run_xml, target, toks_of};
use crate::{Docx, Result, Signature, err, math, structure, xml};
use serde::{Deserialize, Serialize};

/// Un morceau collé : du texte et sa mise en forme, ou une équation.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct RunIn {
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub b: bool,
    #[serde(default)]
    pub i: bool,
    #[serde(default)]
    pub u: bool,
    #[serde(default)]
    pub sup: bool,
    #[serde(default)]
    pub sub: bool,
    /// Équation (LaTeX) : convertie en équation Word native.
    #[serde(default)]
    pub latex: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Pasted {
    /// Paragraphe et position juste après le collage (pour le curseur).
    pub paragraph: String,
    pub at: usize,
    pub changes: Vec<u32>,
}

/// `p12` (ou `n1.p0`) : la forme par rang, seule à suivre une coupe.
fn by_rank(docx: &mut Docx, paragraph: &str) -> Result<String> {
    let local = paragraph.rsplit('.').next().unwrap_or(paragraph);
    if local.strip_prefix('p').is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())) {
        return Ok(paragraph.to_string());
    }
    let model = docx.model()?;
    match model.all_paragraphs().find(|p| p.para_id.as_deref() == Some(paragraph)) {
        Some(p) => Ok(p.id.clone()),
        None => err(format!("paragraphe {paragraph} introuvable")),
    }
}

/// Paragraphe suivant (celui qu'une coupe vient de créer).
fn next_rank(id: &str) -> String {
    let (prefix, local) = id.rsplit_once('.').map(|(a, b)| (format!("{a}."), b.to_string())).unwrap_or((String::new(), id.to_string()));
    let i: usize = local.trim_start_matches('p').parse().unwrap_or(0);
    format!("{prefix}p{}", i + 1)
}

/// `w:rPr` du run où l'on colle (celui qui contient la position, sinon celui
/// qui finit ou commence là), et la balise racine de sa partie.
fn anchor(docx: &mut Docx, paragraph: &str, at: usize) -> Result<(String, String)> {
    let (_, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    let root = xml::open_tag(&src, doc.root_element());
    let t = target(&src, &doc, paragraph)?;
    let starts = run_starts(&t);
    let span = |ri: usize| starts[ri].map(|s| (s, s + run_len(&t, ri)));
    let n = t.inline.runs.len();
    let pick = (0..n)
        .find(|&ri| span(ri).is_some_and(|(s, e)| s < at && at < e))
        .or_else(|| (0..n).rev().find(|&ri| span(ri).is_some_and(|(s, e)| e == at && e > s)))
        .or_else(|| (0..n).find(|&ri| span(ri).is_some_and(|(s, _)| s == at)));
    Ok((root, pick.map(|ri| t.inline.runs[ri].rpr.clone()).unwrap_or_default()))
}

/// Colle `paragraphs` (des morceaux par paragraphe) à la position `at` de
/// `paragraph` : le premier se glisse à cet endroit, chacun des suivants
/// naît d'une coupe. Toutes les équations sont vérifiées avant d'écrire.
pub fn insert_runs(docx: &mut Docx, paragraph: &str, at: usize, paragraphs: &[Vec<RunIn>], tracked: bool, sig: &Signature) -> Result<Pasted> {
    if paragraphs.is_empty() || paragraphs.iter().all(|p| p.iter().all(|r| r.text.is_empty() && r.latex.is_none())) && paragraphs.len() < 2 {
        return err("rien à coller");
    }
    let mut eqs = 0;
    for r in paragraphs.iter().flatten() {
        if let Some(l) = &r.latex {
            eqs += 1;
            math::check_latex(l).map_err(|e| crate::DocxError(format!("équation {eqs} du collage : {e}")))?;
        }
    }
    let first = by_rank(docx, paragraph)?;
    // Les coupes d'abord, dans le texte d'origine (jamais dans le collage
    // qu'on vient d'écrire) : le premier paragraphe garde le début, le
    // dernier la fin, ceux du milieu naissent vides.
    let mut ids = vec![first.clone()];
    for k in 1..paragraphs.len() {
        let prev = ids[k - 1].clone();
        structure::split(docx, &prev, if k == 1 { at } else { 0 }, tracked, sig)?;
        ids.push(next_rank(&prev));
    }
    let mut p = first;
    let mut pos = at;
    let mut changes = Vec::new();
    for (k, runs) in paragraphs.iter().enumerate() {
        if k > 0 {
            p = ids[k].clone();
            pos = 0;
        }
        if runs.iter().all(|r| r.text.is_empty() && r.latex.is_none()) {
            continue;
        }
        let (root, rpr) = anchor(docx, &p, pos)?;
        let mut raw = String::new();
        let mut len = 0;
        for r in runs {
            if let Some(l) = &r.latex {
                let omml = math::from_latex(l);
                len += math::text_of(&omml).chars().count();
                raw.push_str(&omml);
            } else if !r.text.is_empty() {
                // Une fin de ligne isolée devient une espace : les paragraphes
                // viennent de la liste, pas du texte.
                let text = r.text.replace(['\r', '\n'], " ");
                let props = crate::format::paste_rpr(&root, &rpr, r.b, r.i, r.u, r.sup, r.sub && !r.sup)?;
                raw.push_str(&run_xml("<w:r>", &props, &toks_of(&text), false));
                len += text.chars().count();
            }
        }
        if raw.is_empty() {
            continue;
        }
        changes.extend(insert_raw(docx, &p, pos, &raw, tracked, sig)?.changes);
        pos += len;
    }
    changes.sort_unstable();
    changes.dedup();
    Ok(Pasted { paragraph: p, at: pos, changes })
}
