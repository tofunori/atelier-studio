//! Les trois formats de poppler que lisent les analyseurs d'Atelier.

use crate::layout::{line_text, Line, Page};
use std::fmt::Write as _;

fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            c => out.push(c),
        }
    }
    out
}

/// Ligne coupée par une césure : tiret final précédé d'une lettre.
fn hyphenated(text: &str) -> bool {
    let mut chars = text.chars().rev();
    chars.next() == Some('-') && chars.next().is_some_and(char::is_alphabetic)
}

/// `pdftotext -enc UTF-8` : une ligne par ligne, un blanc entre deux flux,
/// un saut de page (`\f`) après chaque page. Comme poppler, une ligne
/// terminée par une césure perd son tiret et se soude à la suivante du même
/// bloc (« probabilis- / tic » → « probabilistic »).
pub fn text(pages: &[Page]) -> String {
    let mut out = String::new();
    for page in pages {
        for flow in &page.flows {
            for block in &flow.blocks {
                let count = block.lines.len();
                for (i, line) in block.lines.iter().enumerate() {
                    let text = line_text(line);
                    if i + 1 < count && hyphenated(&text) {
                        out.push_str(&text[..text.len() - 1]);
                    } else {
                        out.push_str(&text);
                        out.push('\n');
                    }
                }
            }
            out.push('\n');
        }
        out.push('\u{c}');
    }
    out
}

fn bbox_attrs(b: &[f32; 4]) -> String {
    format!(
        "xMin=\"{:.6}\" yMin=\"{:.6}\" xMax=\"{:.6}\" yMax=\"{:.6}\"",
        b[0], b[1], b[2], b[3]
    )
}

/// `pdftotext -bbox-layout -cropbox` : page, flux, blocs, lignes et mots
/// avec leurs cadres.
pub fn bbox_layout(pages: &[Page]) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<html xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<title></title>\n</head>\n<body>\n<doc>\n",
    );
    for page in pages {
        // Les dimensions de PDFium sont des f32 : 595,276 s'y lit 595,276001.
        let dim = |v: f32| (f64::from(v) * 1000.0).round() / 1000.0;
        let _ = writeln!(out, "  <page width=\"{:.6}\" height=\"{:.6}\">", dim(page.width), dim(page.height));
        for flow in &page.flows {
            out.push_str("    <flow>\n");
            for block in &flow.blocks {
                let _ = writeln!(out, "      <block {}>", bbox_attrs(&block.bbox));
                for line in &block.lines {
                    let _ = writeln!(out, "        <line {}>", bbox_attrs(&line.bbox));
                    for word in &line.words {
                        let _ = writeln!(
                            out,
                            "          <word {}>{}</word>",
                            bbox_attrs(&word.bbox),
                            escape(&word.text)
                        );
                    }
                    out.push_str("        </line>\n");
                }
                out.push_str("      </block>\n");
            }
            out.push_str("    </flow>\n");
        }
        out.push_str("  </page>\n");
    }
    out.push_str("</doc>\n</body>\n</html>\n");
    out
}

/// Un morceau de ligne d'une seule police et d'une seule taille : l'élément
/// `<text>` de pdftohtml.
struct Run {
    bbox: [f32; 4],
    text: String,
    spec: (usize, i32),
}

/// Au-delà d'un écart égal à la hauteur du texte, pdftohtml sépare deux
/// morceaux de la même ligne (« 1 » et « Introduction » d'un titre, deux
/// phrases très espacées) : mesuré sur la fixture `twocol.pdf`, il coupe à
/// 0,91 × la taille de police et pas à 0,87, pour une hauteur de 0,907 ×.
fn runs(line: &Line) -> Vec<Run> {
    let mut out: Vec<Run> = Vec::new();
    for word in &line.words {
        let spec = (word.font, word.size.round() as i32);
        if let Some(run) = out.last_mut() {
            let gap = word.bbox[0] - run.bbox[2];
            if run.spec == spec && gap <= (word.bbox[3] - word.bbox[1]).max(1.0) {
                if word.space_before {
                    run.text.push(' ');
                }
                run.text.push_str(&word.text);
                run.bbox = [
                    run.bbox[0].min(word.bbox[0]),
                    run.bbox[1].min(word.bbox[1]),
                    run.bbox[2].max(word.bbox[2]),
                    run.bbox[3].max(word.bbox[3]),
                ];
                continue;
            }
        }
        out.push(Run { bbox: word.bbox, text: word.text.clone(), spec });
    }
    out
}

/// Coordonnées entières, comme pdftohtml : les seuils du mode lecture
/// (rangées, tri par `top`) ont été réglés sur ces valeurs arrondies.
fn px(b: &[f32; 4]) -> [i32; 4] {
    let (left, top) = (b[0].round() as i32, b[1].round() as i32);
    [left, top, (b[2] - b[0]).round() as i32, (b[3] - b[1]).round() as i32]
}

/// `pdftohtml -xml -zoom 1` : `<fontspec>` à la première page qui l'emploie,
/// un `<text>` par morceau de ligne, un `<image>` par image bitmap.
pub fn pdf2xml(pages: &[Page], fonts: &[String]) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE pdf2xml SYSTEM \"pdf2xml.dtd\">\n\n<pdf2xml producer=\"atelier-pdf\" version=\"1\">\n",
    );
    let mut specs: Vec<(usize, i32)> = Vec::new();
    for (index, page) in pages.iter().enumerate() {
        let _ = writeln!(
            out,
            "<page number=\"{}\" position=\"absolute\" top=\"0\" left=\"0\" height=\"{}\" width=\"{}\">",
            index + 1,
            page.height as i32,
            page.width as i32
        );
        let mut body = String::new();
        for flow in &page.flows {
            for block in &flow.blocks {
                for line in &block.lines {
                    for run in runs(line) {
                        let id = match specs.iter().position(|s| *s == run.spec) {
                            Some(id) => id,
                            None => {
                                specs.push(run.spec);
                                let family = fonts.get(run.spec.0).map(String::as_str).unwrap_or("");
                                let _ = writeln!(
                                    out,
                                    "\t<fontspec id=\"{}\" size=\"{}\" family=\"{}\" color=\"#000000\"/>",
                                    specs.len() - 1,
                                    run.spec.1,
                                    escape(family)
                                );
                                specs.len() - 1
                            }
                        };
                        let [left, top, width, height] = px(&run.bbox);
                        let _ = writeln!(
                            body,
                            "<text top=\"{top}\" left=\"{left}\" width=\"{width}\" height=\"{height}\" font=\"{id}\">{}</text>",
                            escape(&run.text)
                        );
                    }
                }
            }
        }
        for image in &page.images {
            let [left, top, width, height] = px(image);
            let _ = writeln!(
                body,
                "<image top=\"{top}\" left=\"{left}\" width=\"{width}\" height=\"{height}\" src=\"\"/>"
            );
        }
        out.push_str(&body);
        out.push_str("</page>\n");
    }
    out.push_str("</pdf2xml>\n");
    out
}
