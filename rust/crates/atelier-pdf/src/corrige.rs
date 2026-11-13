//! Copie corrigée d'un PDF : les commentaires du correcteur imprimés dans la
//! page, pour que l'élève les voie dans n'importe quel lecteur.
//!
//! Un commentaire rangé seulement dans une annotation PDF (`/Contents` d'un
//! surlignage) n'apparaît ni dans Chrome ou Edge (PDFium), ni dans Word, ni à
//! l'impression ; Aperçu et Acrobat ne le montrent qu'au survol. La copie
//! corrigée élargit donc chaque page commentée d'une marge à droite (dans le
//! sens de lecture, quelle que soit la rotation de la page) où chaque
//! commentaire est écrit en face de son passage, avec un numéro repris par une
//! pastille dans la page. Les commentaires restent aussi des annotations PDF
//! classiques (surlignage signé, texte, date) pour la liste des commentaires
//! d'Acrobat et d'Aperçu.
//!
//! Le PDF source n'est jamais modifié : on écrit un autre fichier. Les
//! annotations du source qui portent un commentaire (reprises dans Atelier à
//! l'ouverture) sont retirées de la copie puis réécrites depuis Atelier, ce
//! qui en fait la seule source ; les tampons, dessins et liens restent.

use crate::engine;
use pdfium_render::prelude::*;
use serde::Deserialize;
use std::path::{Path, PathBuf};

/// Largeur de la marge ajoutée (points).
pub const MARGIN: f32 = 210.0;
const PAD: f32 = 14.0;
const TEXT_SIZE: f32 = 10.0;
const META_SIZE: f32 = 8.5;
const LEAD: f32 = 1.3;
const GAP: f32 = 12.0;
const PIN_R: f32 = 6.5;
const PAGE_PIN_R: f32 = 5.5;

/// Un commentaire à imprimer, tel que le lecteur d'Atelier le range
/// (`pdf_annots.json`) : rectangles `[x, y, largeur, hauteur]` en fractions
/// de la page affichée, origine en haut à gauche.
#[derive(Debug, Clone, Deserialize)]
pub struct Comment {
    pub page: u32,
    #[serde(default)]
    pub rects: Vec<[f32; 4]>,
    /// Point d'une note posée sans passage, en fractions de la page.
    #[serde(default)]
    pub pin: Option<[f32; 2]>,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub author: String,
    pub text: String,
    #[serde(default)]
    pub replies: Vec<Reply>,
    /// Date (ms depuis 1970).
    #[serde(default)]
    pub at: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Reply {
    #[serde(default)]
    pub author: String,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Request {
    pub comments: Vec<Comment>,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    pub comments: usize,
    pub pages: usize,
    pub removed: usize,
}

/// Nom de la copie corrigée à côté du source : `<nom>_corrigé.pdf`.
pub fn output_path(src: &Path) -> PathBuf {
    let stem = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "copie".into());
    src.with_file_name(format!("{stem}_corrigé.pdf"))
}

/// Une copie déjà corrigée (on ne la recorrige pas : sa marge doublerait).
pub fn is_corrected(path: &Path) -> bool {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    let stem: String = unicode_normalization::UnicodeNormalization::nfc(stem.as_str()).collect();
    stem.ends_with("_corrigé") || stem.ends_with("_corrige") || stem.ends_with("_corrigée")
}

// ---------------------------------------------------------------------------
// Police : une TrueType embarquée (accents, −, ×, exposants), mesurée par
// ttf-parser pour couper les lignes ; Helvetica intégrée en dernier recours.
// ---------------------------------------------------------------------------

const FONT_CANDIDATES: [&str; 6] = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
];

fn font_bytes() -> Option<Vec<u8>> {
    let env = std::env::var_os("ATELIER_PDF_FONT").map(PathBuf::from);
    env.into_iter()
        .chain(FONT_CANDIDATES.iter().map(PathBuf::from))
        .filter_map(|p| std::fs::read(p).ok())
        .find(|bytes| ttf_parser::Face::parse(bytes, 0).is_ok())
}

struct Metrics {
    face: Option<ttf_parser::Face<'static>>,
}

impl Metrics {
    fn new(bytes: Option<&'static [u8]>) -> Self {
        Metrics { face: bytes.and_then(|b| ttf_parser::Face::parse(b, 0).ok()) }
    }

    /// Le caractère tel qu'on peut l'écrire avec la police : un glyphe
    /// absent devient son équivalent simple (exposants, signes).
    fn printable(&self, c: char) -> String {
        let has = |c: char| match &self.face {
            Some(face) => face.glyph_index(c).is_some(),
            None => (c as u32) < 0x100 || "–—‘’“”…•€".contains(c),
        };
        if has(c) {
            return c.to_string();
        }
        let simple = match c {
            '⁰' => "0", '¹' => "1", '²' => "2", '³' => "3", '⁴' => "4", '⁵' => "5",
            '⁶' => "6", '⁷' => "7", '⁸' => "8", '⁹' => "9", '⁻' | '−' | '‐' => "-", '⁺' => "+",
            '₀' => "0", '₁' => "1", '₂' => "2", '₃' => "3", '₄' => "4", '₅' => "5",
            '₆' => "6", '₇' => "7", '₈' => "8", '₉' => "9",
            '×' => "x", '·' => ".", '≈' => "~", '≤' => "<=", '≥' => ">=", '→' => "->",
            '\u{a0}' | '\u{202f}' | '\u{2009}' => " ",
            _ => "?",
        };
        if simple == " " || has(simple.chars().next().unwrap_or(' ')) { simple.to_string() } else { "?".into() }
    }

    fn clean(&self, text: &str) -> String {
        text.chars()
            .filter(|c| !c.is_control() || *c == '\n')
            .map(|c| if c == '\n' { "\n".to_string() } else { self.printable(c) })
            .collect()
    }

    fn width(&self, text: &str, size: f32) -> f32 {
        match &self.face {
            Some(face) => {
                let upem = face.units_per_em() as f32;
                text.chars()
                    .map(|c| {
                        face.glyph_index(c)
                            .and_then(|g| face.glyph_hor_advance(g))
                            .map(|a| a as f32 / upem)
                            .unwrap_or(0.5)
                    })
                    .sum::<f32>()
                    * size
            }
            None => text.chars().count() as f32 * size * 0.52,
        }
    }

    /// Coupe `text` en lignes de `max` points au plus (mots entiers, un mot
    /// trop long coupé net).
    fn wrap(&self, text: &str, size: f32, max: f32) -> Vec<String> {
        let mut out = Vec::new();
        for para in text.split('\n') {
            let mut line = String::new();
            for word in para.split_whitespace() {
                let candidate = if line.is_empty() { word.to_string() } else { format!("{line} {word}") };
                if self.width(&candidate, size) <= max {
                    line = candidate;
                    continue;
                }
                if !line.is_empty() {
                    out.push(std::mem::take(&mut line));
                }
                let mut rest = word.to_string();
                while self.width(&rest, size) > max && rest.chars().count() > 1 {
                    let mut cut = rest.chars().count() - 1;
                    while cut > 1 && self.width(&rest.chars().take(cut).collect::<String>(), size) > max {
                        cut -= 1;
                    }
                    out.push(rest.chars().take(cut).collect());
                    rest = rest.chars().skip(cut).collect();
                }
                line = rest;
            }
            out.push(line);
        }
        while out.last().is_some_and(|l| l.is_empty()) && out.len() > 1 {
            out.pop();
        }
        out
    }
}

// ---------------------------------------------------------------------------
// Repère : page affichée (origine en haut à gauche, y vers le bas, rotation
// appliquée) ↔ espace de la page PDF.
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
struct Frame {
    left: f32,
    bottom: f32,
    right: f32,
    top: f32,
    rotation: u16,
}

impl Frame {
    fn width(&self) -> f32 {
        if self.rotation % 180 == 90 { self.top - self.bottom } else { self.right - self.left }
    }

    fn height(&self) -> f32 {
        if self.rotation % 180 == 90 { self.right - self.left } else { self.top - self.bottom }
    }

    /// Point affiché → point de la page.
    fn to_page(self, dx: f32, dy: f32) -> (f32, f32) {
        match self.rotation {
            90 => (self.left + dy, self.bottom + dx),
            180 => (self.right - dx, self.bottom + dy),
            270 => (self.right - dy, self.top - dx),
            _ => (self.left + dx, self.top - dy),
        }
    }

    /// Rectangle affiché `[x0, y0, x1, y1]` → rectangle de la page.
    fn rect(self, r: [f32; 4]) -> PdfRect {
        let (ax, ay) = self.to_page(r[0], r[1]);
        let (bx, by) = self.to_page(r[2], r[3]);
        PdfRect::new_from_values(ay.min(by), ax.min(bx), ay.max(by), ax.max(bx))
    }

    /// La boîte élargie de `extra` points vers la droite affichée.
    fn widened(&self, extra: f32) -> Frame {
        let mut f = *self;
        match self.rotation {
            90 => f.top += extra,
            180 => f.left -= extra,
            270 => f.bottom -= extra,
            _ => f.right += extra,
        }
        f
    }

    fn pdf_rect(&self) -> PdfRect {
        PdfRect::new_from_values(self.bottom, self.left, self.top, self.right)
    }
}

fn rgb(value: &str) -> (u8, u8, u8) {
    let nums: Vec<f32> = value
        .trim_start_matches(|c: char| c.is_ascii_alphabetic() || c == '(')
        .trim_end_matches(')')
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();
    if nums.len() >= 3 {
        return (nums[0].clamp(0.0, 255.0) as u8, nums[1].clamp(0.0, 255.0) as u8, nums[2].clamp(0.0, 255.0) as u8);
    }
    if let Some(hex) = value.strip_prefix('#').filter(|h| h.len() == 6) {
        let p = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(200);
        return (p(0), p(2), p(4));
    }
    (255, 213, 74)
}

fn pdf_date(ms: f64) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::from_timestamp_millis(ms as i64)
}

const MARKUP: [PdfPageAnnotationType; 6] = [
    PdfPageAnnotationType::Highlight,
    PdfPageAnnotationType::Underline,
    PdfPageAnnotationType::Strikeout,
    PdfPageAnnotationType::Squiggly,
    PdfPageAnnotationType::Text,
    PdfPageAnnotationType::FreeText,
];

/// Écrit la copie corrigée de `src` dans `out`.
pub fn write(src: &Path, out: &Path, request: &Request) -> Result<Report, String> {
    if is_corrected(src) {
        return Err("ce PDF est déjà une copie corrigée : corrige l'original".into());
    }
    let pdfium = engine::bind()?;
    let mut document = pdfium.load_pdf_from_file(src, None).map_err(|e| match e {
        PdfiumError::PdfiumLibraryInternalError(PdfiumInternalError::PasswordError) => {
            "PDF protégé par mot de passe".to_string()
        }
        e => format!("PDF illisible : {e}"),
    })?;
    let mut comments: Vec<(usize, &Comment)> = request.comments.iter().filter(|c| !c.text.trim().is_empty() || !c.replies.is_empty()).enumerate().collect();
    // ordre de lecture : page, puis haut du passage
    comments.sort_by(|(_, a), (_, b)| {
        let top = |c: &Comment| c.rects.first().map(|r| r[1]).or(c.pin.map(|p| p[1])).unwrap_or(0.0);
        a.page.cmp(&b.page).then(top(a).total_cmp(&top(b)))
    });
    let numbered: Vec<(usize, &Comment)> = comments.iter().enumerate().map(|(n, (_, c))| (n + 1, *c)).collect();

    // police chargée seulement s'il y a quelque chose à écrire
    let font_data: Option<&'static [u8]> =
        if numbered.is_empty() { None } else { font_bytes().map(|b| &*Box::leak(b.into_boxed_slice())) };
    let metrics = Metrics::new(font_data);
    let font = {
        let fonts = document.fonts_mut();
        match font_data {
            Some(bytes) => fonts.load_true_type_from_bytes(bytes, true).map_err(|e| format!("police illisible : {e}"))?,
            None => fonts.helvetica(),
        }
    };

    let mut report = Report { comments: numbered.len(), ..Default::default() };
    let pages = document.pages();
    for index in 0..pages.len() {
        let page_no = index as u32 + 1;
        let mut page = pages.get(index).map_err(|e| format!("page {page_no} illisible : {e}"))?;

        // 1. les annotations commentées du source : reprises dans Atelier, réécrites plus bas
        let mut doomed = Vec::new();
        for (i, annot) in page.annotations().iter().enumerate() {
            let ty = annot.annotation_type();
            let has_text = annot.contents().is_some_and(|c| !c.trim().is_empty());
            if (MARKUP.contains(&ty) && has_text) || ty == PdfPageAnnotationType::Popup {
                doomed.push(i);
            }
        }
        let had_comments = doomed.iter().any(|&i| page.annotations().get(i).is_ok_and(|a| a.annotation_type() != PdfPageAnnotationType::Popup));
        if had_comments {
            for &i in doomed.iter().rev() {
                let annotations = page.annotations_mut();
                if let Ok(annot) = annotations.get(i) {
                    annotations.delete_annotation(annot).map_err(|e| format!("page {page_no} : {e}"))?;
                    report.removed += 1;
                }
            }
        }

        let here: Vec<&(usize, &Comment)> = numbered.iter().filter(|(_, c)| c.page == page_no).collect();
        if here.is_empty() {
            continue;
        }
        report.pages += 1;
        let crop = page
            .boundaries()
            .crop()
            .or_else(|_| page.boundaries().media())
            .map(|b| b.bounds)
            .unwrap_or_else(|_| page.page_size());
        let rotation = match page.rotation() {
            Ok(PdfPageRenderRotation::Degrees90) => 90,
            Ok(PdfPageRenderRotation::Degrees180) => 180,
            Ok(PdfPageRenderRotation::Degrees270) => 270,
            _ => 0,
        };
        let frame = Frame { left: crop.left().value, bottom: crop.bottom().value, right: crop.right().value, top: crop.top().value, rotation };
        let (dw, dh) = (frame.width(), frame.height());

        // 2. la page s'élargit d'une marge à droite (boîte visible et média)
        let wide = frame.widened(MARGIN);
        let media = page.boundaries().media().map(|b| b.bounds).unwrap_or(crop);
        let union = PdfRect::new_from_values(
            media.bottom().value.min(wide.bottom),
            media.left().value.min(wide.left),
            media.top().value.max(wide.top),
            media.right().value.max(wide.right),
        );
        page.boundaries_mut().set_media(union).map_err(|e| format!("page {page_no} : {e}"))?;
        page.boundaries_mut().set_crop(wide.pdf_rect()).map_err(|e| format!("page {page_no} : {e}"))?;

        // 3. fond de la marge et filet
        let paper = PdfColor::new(246, 246, 243, 255);
        let rule = PdfColor::new(214, 214, 208, 255);
        let ink = PdfColor::new(33, 33, 31, 255);
        let muted = PdfColor::new(110, 110, 104, 255);
        page.objects_mut()
            .create_path_object_rect(frame.rect([dw, 0.0, dw + MARGIN, dh]), None, None, Some(paper))
            .map_err(|e| format!("page {page_no} : {e}"))?;
        page.objects_mut()
            .create_path_object_rect(frame.rect([dw, 0.0, dw + 0.6, dh]), None, None, Some(rule))
            .map_err(|e| format!("page {page_no} : {e}"))?;

        // 4. fiches : position voulue = haut du passage, puis tassées sans chevauchement
        let text_w = MARGIN - 2.0 * PAD - 2.0 * PIN_R - 6.0;
        let mut size = TEXT_SIZE;
        let mut cards: Vec<Card> = Vec::new();
        for _attempt in 0..3 {
            cards = here.iter().map(|(n, c)| Card::new(*n, c, &metrics, size, text_w, dw, dh)).collect();
            if layout(&mut cards, PAD + 4.0, dh - PAD) || size <= 7.5 {
                break;
            }
            size -= 1.0;
        }
        let tx = dw + PAD + 2.0 * PIN_R + 6.0;
        for card in &cards {
            let (r, g, b) = rgb(&card.color);
            let pin = PdfColor::new(r, g, b, 255);
            // chiffre lisible sur la pastille : sombre sur clair, clair sur sombre
            let light = 0.299 * r as f32 + 0.587 * g as f32 + 0.114 * b as f32 > 150.0;
            let digit = if light { ink } else { PdfColor::new(250, 250, 248, 255) };
            draw_pin(&mut page, &frame, font, &metrics, dw + PAD + PIN_R, card.y + PIN_R, PIN_R, card.n, pin, digit, page_no)?;
            let mut y = card.y + META_SIZE;
            draw_text(&mut page, &frame, font, &card.author, tx, y, META_SIZE, muted)?;
            y += META_SIZE * 0.6;
            for line in &card.lines {
                y += card.size * LEAD;
                draw_text(&mut page, &frame, font, &line.0, tx + line.1, y, card.size, if line.2 { muted } else { ink })?;
            }
            // pastille dans la page, à gauche du passage
            if let Some((px, py)) = card.anchor {
                draw_pin(&mut page, &frame, font, &metrics, px, py, PAGE_PIN_R, card.n, pin, digit, page_no)?;
            }
        }

        // 5. annotations PDF classiques : surlignage (ou note) signé, avec le texte
        for (_, c) in &here {
            add_annotation(&mut page, &frame, c, dw, dh).map_err(|e| format!("page {page_no} : {e}"))?;
        }
    }
    document.save_to_file(out).map_err(|e| format!("écriture impossible : {e}"))?;
    Ok(report)
}

struct Card {
    n: usize,
    y: f32,
    want: f32,
    height: f32,
    size: f32,
    color: String,
    author: String,
    /// (texte, retrait, éteint)
    lines: Vec<(String, f32, bool)>,
    anchor: Option<(f32, f32)>,
}

impl Card {
    fn new(n: usize, c: &Comment, metrics: &Metrics, size: f32, width: f32, dw: f32, dh: f32) -> Card {
        let mut lines: Vec<(String, f32, bool)> = metrics
            .wrap(&metrics.clean(c.text.trim()), size, width)
            .into_iter()
            .map(|l| (l, 0.0, false))
            .collect();
        for reply in &c.replies {
            let who = metrics.clean(reply.author.trim());
            let body = metrics.clean(reply.text.trim());
            let text = if who.is_empty() { body } else { format!("{who} : {body}") };
            lines.extend(metrics.wrap(&text, size, width - 8.0).into_iter().map(|l| (l, 8.0, true)));
        }
        let height = META_SIZE * 1.6 + lines.len() as f32 * size * LEAD + 2.0;
        let (want, anchor) = match c.rects.first() {
            Some(r) => {
                let x0 = c.rects.iter().map(|r| r[0]).fold(f32::MAX, f32::min) * dw;
                let mid = (r[1] + r[3] / 2.0) * dh;
                let px = (x0 - PAGE_PIN_R - 4.0).min(dw * 0.07).max(PAGE_PIN_R + 2.0);
                ((r[1] * dh - 2.0).max(0.0), Some((px, mid)))
            }
            None => match c.pin {
                Some(p) => ((p[1] * dh - PIN_R).max(0.0), Some(((p[0] * dw).clamp(PAGE_PIN_R + 2.0, dw - PAGE_PIN_R - 2.0), p[1] * dh))),
                None => (0.0, None),
            },
        };
        let author = metrics.clean(c.author.trim());
        Card {
            n,
            y: want,
            want,
            height,
            size,
            color: if c.color.is_empty() { "rgba(255,213,74,1)".into() } else { c.color.clone() },
            author: if author.is_empty() { "Correcteur".into() } else { author },
            lines,
            anchor,
        }
    }
}

/// Place les fiches au plus près de leur passage sans chevauchement, entre
/// `top` et `bottom`. Faux si elles ne tiennent pas.
fn layout(cards: &mut [Card], top: f32, bottom: f32) -> bool {
    let mut y = top;
    for card in cards.iter_mut() {
        card.y = card.want.max(y);
        y = card.y + card.height + GAP;
    }
    // remonter depuis le bas ce qui déborde
    let mut limit = bottom;
    for card in cards.iter_mut().rev() {
        if card.y + card.height > limit {
            card.y = limit - card.height;
        }
        limit = card.y - GAP;
    }
    cards.first().is_none_or(|c| c.y >= top - 0.5)
}

#[allow(clippy::too_many_arguments)]
fn draw_pin(page: &mut PdfPage, frame: &Frame, font: PdfFontToken, metrics: &Metrics, x: f32, y: f32, r: f32, n: usize, fill: PdfColor, ink: PdfColor, page_no: u32) -> Result<(), String> {
    let (cx, cy) = frame.to_page(x, y);
    page.objects_mut()
        .create_path_object_circle_at(PdfPoints::new(cx), PdfPoints::new(cy), PdfPoints::new(r), None, None, Some(fill))
        .map_err(|e| format!("page {page_no} : {e}"))?;
    let label = n.to_string();
    let size = if r > 6.0 { 7.5 } else { 6.5 };
    let w = metrics.width(&label, size);
    draw_text(page, frame, font, &label, x - w / 2.0, y + size * 0.36, size, ink)
}

/// Écrit `text` avec sa ligne de base en (x, y) affichés, horizontal à l'écran.
#[allow(clippy::too_many_arguments)]
fn draw_text(page: &mut PdfPage, frame: &Frame, font: PdfFontToken, text: &str, x: f32, y: f32, size: f32, color: PdfColor) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }
    let (px, py) = frame.to_page(x, y);
    let mut object = page
        .objects_mut()
        .create_text_object(PdfPoints::new(0.0), PdfPoints::new(0.0), text, font, PdfPoints::new(size))
        .map_err(|e| e.to_string())?;
    object.set_fill_color(color).map_err(|e| e.to_string())?;
    if frame.rotation != 0 {
        object.rotate_counter_clockwise_degrees(frame.rotation as f32).map_err(|e| e.to_string())?;
    }
    object.translate(PdfPoints::new(px), PdfPoints::new(py)).map_err(|e| e.to_string())?;
    Ok(())
}

fn add_annotation(page: &mut PdfPage, frame: &Frame, c: &Comment, dw: f32, dh: f32) -> Result<(), PdfiumError> {
    let mut contents = c.text.trim().to_string();
    for reply in &c.replies {
        contents.push_str(&format!("\n\n{} : {}", reply.author.trim(), reply.text.trim()));
    }
    let (r, g, b) = rgb(&c.color);
    let color = PdfColor::new(r, g, b, 255);
    let date = c.at.and_then(pdf_date);
    let rects: Vec<PdfRect> = c
        .rects
        .iter()
        .map(|q| frame.rect([q[0] * dw, q[1] * dh, (q[0] + q[2]) * dw, (q[1] + q[3]) * dh]))
        .collect();
    if rects.is_empty() {
        let Some(p) = c.pin else { return Ok(()) };
        let (x, y) = frame.to_page(p[0] * dw, p[1] * dh);
        let mut note = page.annotations_mut().create_text_annotation(&contents)?;
        note.set_bounds(PdfRect::new_from_values(y - 18.0, x, y, x + 18.0))?;
        note.set_creator(&c.author)?;
        note.set_stroke_color(color)?;
        note.set_is_printed(true)?;
        if let Some(d) = date {
            note.set_creation_date(d)?;
            note.set_modification_date(d)?;
        }
        return Ok(());
    }
    let union = rects.iter().skip(1).fold(rects[0], |u, r| {
        PdfRect::new_from_values(u.bottom().value.min(r.bottom().value), u.left().value.min(r.left().value), u.top().value.max(r.top().value), u.right().value.max(r.right().value))
    });
    macro_rules! markup {
        ($annot:expr) => {{
            let mut a = $annot;
            for r in &rects {
                // ordre d'Acrobat (haut gauche, haut droit, bas gauche, bas
                // droit) : `from_rect` tourne autour du rectangle, ce que
                // poppler et Aperçu dessinent en nœud papillon
                a.attachment_points_mut().create_attachment_point_at_end(PdfQuadPoints::new(
                    r.left(), r.top(), r.right(), r.top(), r.left(), r.bottom(), r.right(), r.bottom(),
                ))?;
            }
            a.set_bounds(union)?;
            a.set_stroke_color(color)?;
            a.set_contents(&contents)?;
            a.set_creator(&c.author)?;
            a.set_is_printed(true)?;
            if let Some(d) = date {
                a.set_creation_date(d)?;
                a.set_modification_date(d)?;
            }
        }};
    }
    match c.kind.as_str() {
        "ul" => markup!(page.annotations_mut().create_underline_annotation()?),
        "st" => markup!(page.annotations_mut().create_strikeout_annotation()?),
        _ => markup!(page.annotations_mut().create_highlight_annotation()?),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_maps_display_corners_for_every_rotation() {
        let f = |rotation| Frame { left: 0.0, bottom: 0.0, right: 600.0, top: 800.0, rotation };
        assert_eq!(f(0).to_page(0.0, 0.0), (0.0, 800.0));
        assert_eq!(f(90).to_page(0.0, 0.0), (0.0, 0.0));
        assert_eq!(f(90).to_page(800.0, 0.0), (0.0, 800.0));
        assert_eq!(f(180).to_page(0.0, 0.0), (600.0, 0.0));
        assert_eq!(f(270).to_page(0.0, 0.0), (600.0, 800.0));
        assert_eq!((f(90).width(), f(90).height()), (800.0, 600.0));
        // la marge va toujours à droite de l'écran
        assert_eq!(f(0).widened(10.0).right, 610.0);
        assert_eq!(f(90).widened(10.0).top, 810.0);
        assert_eq!(f(180).widened(10.0).left, -10.0);
        assert_eq!(f(270).widened(10.0).bottom, -10.0);
    }

    #[test]
    fn colours_names_and_corrected_copies() {
        assert_eq!(rgb("rgba(255,213,74,.40)"), (255, 213, 74));
        assert_eq!(rgb("#3366cc"), (0x33, 0x66, 0xcc));
        assert_eq!(output_path(Path::new("/a/tp6_X.pdf")), PathBuf::from("/a/tp6_X_corrigé.pdf"));
        assert!(is_corrected(Path::new("/a/tp6_X_corrigé.pdf")));
        assert!(is_corrected(Path::new("/a/tp6_X_corrige.pdf")));
        assert!(!is_corrected(Path::new("/a/tp6_X.pdf")));
    }

    #[test]
    fn cards_stay_near_their_passage_without_overlapping() {
        let card = |want: f32, height: f32| Card { n: 1, y: want, want, height, size: 10.0, color: String::new(), author: String::new(), lines: vec![], anchor: None };
        let mut cards = vec![card(100.0, 50.0), card(110.0, 50.0), card(700.0, 80.0)];
        assert!(layout(&mut cards, 10.0, 760.0));
        assert_eq!(cards[0].y, 100.0);
        assert_eq!(cards[1].y, 100.0 + 50.0 + GAP);
        // la dernière remonte pour tenir dans la page
        assert_eq!(cards[2].y, 760.0 - 80.0);
    }

    #[test]
    fn wrapping_respects_the_width_and_unknown_glyphs_are_replaced() {
        let m = Metrics::new(None);
        let lines = m.wrap("Attention aux arrondis : 794,227 / 167 904 = 0,00473", 10.0, 100.0);
        assert!(lines.len() > 1);
        assert!(lines.iter().all(|l| m.width(l, 10.0) <= 100.0 + 0.01));
        assert_eq!(m.clean("10⁻⁵"), "10-5");
    }
}
