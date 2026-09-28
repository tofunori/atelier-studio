//! Caractères → mots → lignes → blocs → flux, dans l'ordre du flux du PDF.
//!
//! Les seuils suivent ceux de poppler (`TextOutputDev`) quand il en a un
//! équivalent : c'est sa découpe que les analyseurs d'Atelier ont apprise.

use crate::engine::{Doc, Glyph, PageGlyphs};

#[derive(Debug, Clone)]
pub struct Word {
    pub text: String,
    pub bbox: [f32; 4],
    pub base: f32,
    pub size: f32,
    pub font: usize,
    /// Un blanc sépare ce mot du précédent de la ligne.
    pub space_before: bool,
}

#[derive(Debug, Clone)]
pub struct Line {
    pub words: Vec<Word>,
    pub bbox: [f32; 4],
    /// Taille du plus grand mot : les exposants ne comptent pas.
    pub size: f32,
}

#[derive(Debug, Clone)]
pub struct Block {
    pub lines: Vec<Line>,
    pub bbox: [f32; 4],
}

#[derive(Debug, Clone)]
pub struct Flow {
    pub blocks: Vec<Block>,
}

#[derive(Debug, Clone)]
pub struct Page {
    pub width: f32,
    pub height: f32,
    pub flows: Vec<Flow>,
    pub images: Vec<[f32; 4]>,
}

fn union(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    [a[0].min(b[0]), a[1].min(b[1]), a[2].max(b[2]), a[3].max(b[3])]
}

fn height(b: &[f32; 4]) -> f32 {
    (b[3] - b[1]).max(0.1)
}

/// Recouvrement vertical rapporté à la plus petite des deux hauteurs.
fn v_overlap(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let inter = a[3].min(b[3]) - a[1].max(b[1]);
    inter / height(a).min(height(b))
}

/// Espace minimal entre deux lettres pour couper un mot, en fraction de la
/// taille de police (`minWordBreakSpace` de poppler vaut 0,1 ; PDFium ajoute
/// déjà ses propres blancs, d'où un seuil un peu plus haut).
const WORD_GAP: f32 = 0.15;

fn same_font_size(a: f32, b: f32) -> bool {
    (a - b).abs() <= 0.1 * a.max(b)
}

/// Ascendante et descendante d'une police, en fractions de sa taille
/// (médianes sur tout le document). PDFium donne à chaque lettre un cadre
/// un peu différent ; poppler, lui, pose tous les mots d'une même ligne de
/// base et d'une même police au même `top` — les rangées du mode lecture en
/// dépendent (`top` arrondi).
#[derive(Debug, Clone, Copy)]
pub struct Metrics {
    pub ascent: f32,
    pub descent: f32,
}

fn median(values: &mut [f32]) -> Option<f32> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.total_cmp(b));
    Some(values[values.len() / 2])
}

pub fn font_metrics(doc: &Doc) -> Vec<Metrics> {
    let mut samples: Vec<(Vec<f32>, Vec<f32>)> = vec![(Vec::new(), Vec::new()); doc.fonts.len()];
    for page in &doc.pages {
        for g in &page.glyphs {
            if g.size > 0.5 {
                let (up, down) = &mut samples[g.font];
                up.push((g.base - g.bbox[1]) / g.size);
                down.push((g.bbox[3] - g.base) / g.size);
            }
        }
    }
    samples
        .into_iter()
        .map(|(mut up, mut down)| Metrics {
            ascent: median(&mut up).unwrap_or(0.75),
            descent: median(&mut down).unwrap_or(0.25),
        })
        .collect()
}

pub fn words(page: &PageGlyphs, metrics: &[Metrics]) -> Vec<Word> {
    let mut out: Vec<Word> = Vec::new();
    let mut current: Option<(Word, Glyph)> = None;
    for g in &page.glyphs {
        let continues = current.as_ref().is_some_and(|(word, prev)| {
            if g.space_before {
                return false;
            }
            if !same_font_size(g.size, word.size) {
                return false;
            }
            let gap = g.bbox[0] - prev.bbox[2];
            let size = g.size.max(prev.size).max(1.0);
            // Une ligature (« ﬁ ») rend deux lettres au même cadre : seul un
            // vrai retour en arrière (début avant celui de la lettre
            // précédente) coupe le mot.
            v_overlap(&prev.bbox, &g.bbox) >= 0.5
                && gap <= WORD_GAP * size
                && g.bbox[0] >= prev.bbox[0] - 0.1 * size
        });
        if continues {
            let (word, prev) = current.as_mut().expect("mot en cours");
            word.text.push(g.c);
            word.bbox = union(word.bbox, g.bbox);
            *prev = g.clone();
            continue;
        }
        if let Some((word, _)) = current.take() {
            out.push(word);
        }
        current = Some((
            Word {
                text: g.c.to_string(),
                bbox: g.bbox,
                base: g.base,
                size: g.size,
                font: g.font,
                space_before: g.space_before,
            },
            g.clone(),
        ));
    }
    if let Some((word, _)) = current.take() {
        out.push(word);
    }
    for word in &mut out {
        if let Some(m) = metrics.get(word.font) {
            word.bbox[1] = word.base - m.ascent * word.size;
            word.bbox[3] = word.base + m.descent * word.size;
        }
    }
    // Deux mots sans blanc entre eux mais séparés par un vrai écart restent
    // lisibles comme deux mots (« 1 Introduction » posé sans espace).
    for i in 1..out.len() {
        let (a, b) = (&out[i - 1], &out[i]);
        if !b.space_before && b.bbox[0] - a.bbox[2] > WORD_GAP * a.size.max(b.size) {
            out[i].space_before = true;
        }
    }
    out
}

/// Écart horizontal au-delà duquel un mot ouvre une autre ligne même à la
/// même hauteur (colonnes voisines, cellules de tableau).
const LINE_GAP: f32 = 1.5;

pub fn lines(words: Vec<Word>) -> Vec<Line> {
    let mut out: Vec<Line> = Vec::new();
    for w in words {
        let joins = out.last().is_some_and(|line| {
            let last = line.words.last().expect("ligne non vide");
            let gap = w.bbox[0] - last.bbox[2];
            let size = w.size.max(line.size).max(1.0);
            v_overlap(&line.bbox, &w.bbox) >= 0.5
                && w.bbox[0] >= last.bbox[0] - 0.1 * size
                && gap <= LINE_GAP * size
        });
        if joins {
            let line = out.last_mut().expect("ligne en cours");
            line.bbox = union(line.bbox, w.bbox);
            line.size = line.size.max(w.size);
            line.words.push(w);
        } else {
            out.push(Line { bbox: w.bbox, size: w.size, words: vec![w] });
        }
    }
    out
}

fn h_overlaps(a: &[f32; 4], b: &[f32; 4]) -> bool {
    a[0] < b[2] && b[0] < a[2]
}

pub fn blocks(lines: Vec<Line>) -> Vec<Block> {
    let mut out: Vec<Block> = Vec::new();
    for line in lines {
        let joins = out.last().is_some_and(|block| {
            let last = block.lines.last().expect("bloc non vide");
            let h = height(&last.bbox).max(height(&line.bbox));
            let gap = line.bbox[1] - last.bbox[3];
            same_font_size(line.size, last.size)
                && gap >= -0.3 * h
                && gap <= 0.8 * h
                && h_overlaps(&block.bbox, &line.bbox)
        });
        if joins {
            let block = out.last_mut().expect("bloc en cours");
            block.bbox = union(block.bbox, line.bbox);
            block.lines.push(line);
        } else {
            out.push(Block { bbox: line.bbox, lines: vec![line] });
        }
    }
    out
}

/// Blocs → flux : un flux suit une colonne de haut en bas ; il se referme
/// quand le bloc suivant remonte (colonne suivante), s'écarte trop
/// (pied de page, numéro de page) ou ne se superpose plus horizontalement.
pub fn flows(blocks: Vec<Block>) -> Vec<Flow> {
    let mut out: Vec<Flow> = Vec::new();
    for block in blocks {
        let joins = out.last().is_some_and(|flow| {
            let last = flow.blocks.last().expect("flux non vide");
            let prev_line = last.lines.last().expect("bloc non vide");
            let h = height(&prev_line.bbox).max(height(&block.lines[0].bbox));
            let gap = block.bbox[1] - last.bbox[3];
            gap >= -0.3 * h && gap <= 2.0 * h && h_overlaps(&last.bbox, &block.bbox)
        });
        if joins {
            out.last_mut().expect("flux en cours").blocks.push(block);
        } else {
            out.push(Flow { blocks: vec![block] });
        }
    }
    out
}

pub fn layout(doc: &Doc) -> Vec<Page> {
    let metrics = font_metrics(doc);
    doc.pages
        .iter()
        .map(|page| Page {
            width: page.width,
            height: page.height,
            flows: flows(blocks(lines(words(page, &metrics)))),
            images: page.images.clone(),
        })
        .collect()
}

/// Texte d'une ligne : mots séparés par une espace quand un blanc les
/// sépare dans le PDF.
pub fn line_text(line: &Line) -> String {
    let mut out = String::new();
    for (i, w) in line.words.iter().enumerate() {
        if i > 0 && w.space_before {
            out.push(' ');
        }
        out.push_str(&w.text);
    }
    out
}
