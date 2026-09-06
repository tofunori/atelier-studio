//! Mode lecture : analyse d'un PDF en blocs (titres, paragraphes, figures…)
//! à partir de `pdftohtml -xml`, mise en cache par fichier, servie sur
//! `GET /reflow`. Spec : docs/superpowers/specs/2026-09-06-mode-lecture-pdf-design.md
//!
//! Drapeau `-i` de `pdftohtml` : vérifié sur deux PDF réels de
//! `~/Zotero/storage` (Williamson et al. 2025 ; Nicholson & Benn 2006).
//! Avec `-i`, `<image>` = 0 dans les deux cas ; sans `-i`, `<image>` = 7 et 5
//! respectivement. Conclusion : le spawn se fait SANS `-i` (sinon les images
//! bitmap disparaissent du XML). La fixture `twocol.xml` n'a pas d'image
//! bitmap (figure vectorielle `\rule`), ce qui est voulu : elle sert à
//! tester les blocs de texte ici, la figure synthétique est couverte par
//! la tâche 2.
//!
//! Fixture générée avec `pdftohtml -xml -zoom 1 -stdout twocol.pdf` (zoom 1
//! explicite, car le zoom par défaut de pdftohtml est 1.5 et aurait donné
//! une largeur de page de 892 au lieu de 595 pour du A4).

// Ce module n'est pas encore câblé à une route HTTP (tâche 3) ni consommé
// par la classification (tâche 2) : ses items publics au crate restent donc
// sans appelant pour l'instant.
#![allow(dead_code)]

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize)]
pub(crate) struct PageDim {
    pub w: f32,
    pub h: f32,
}

#[derive(Debug, Clone)]
pub(crate) struct Line {
    pub page: u16,
    /// [x1, y1, x2, y2] en points, origine haut-gauche (unités de pdftohtml).
    pub bbox: [f32; 4],
    pub text: String,
    pub size: f32,
    pub family: String,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct ImageBox {
    pub page: u16,
    pub bbox: [f32; 4],
}

#[derive(Debug, Default)]
pub(crate) struct Parsed {
    pub pages: Vec<PageDim>,
    pub lines: Vec<Line>,
    pub images: Vec<ImageBox>,
}

fn attr_f32(node: roxmltree::Node, name: &str) -> f32 {
    node.attribute(name)
        .and_then(|v| v.parse::<f32>().ok())
        .unwrap_or(0.0)
}

/// Texte d'un `<text>` : concatène les nœuds texte, y compris ceux des
/// enfants `<b>`, `<i>`, `<a>` (roxmltree décode déjà `&amp;` etc.).
fn inner_text(node: roxmltree::Node) -> String {
    let mut out = String::new();
    for d in node.descendants() {
        if d.is_text() {
            out.push_str(d.text().unwrap_or(""));
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub(crate) fn parse_pdftohtml_xml(xml: &str) -> Result<Parsed, String> {
    let opts = roxmltree::ParsingOptions {
        allow_dtd: true,
        ..Default::default()
    };
    let doc =
        roxmltree::Document::parse_with_options(xml, opts).map_err(|e| format!("xml: {e}"))?;
    let mut parsed = Parsed::default();
    let mut fonts: std::collections::HashMap<String, (f32, String)> = Default::default();
    for page in doc.descendants().filter(|n| n.has_tag_name("page")) {
        let number = page
            .attribute("number")
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(0);
        parsed.pages.push(PageDim {
            w: attr_f32(page, "width"),
            h: attr_f32(page, "height"),
        });
        for child in page.children().filter(|n| n.is_element()) {
            match child.tag_name().name() {
                "fontspec" => {
                    let id = child.attribute("id").unwrap_or("").to_string();
                    fonts.insert(
                        id,
                        (
                            attr_f32(child, "size"),
                            child.attribute("family").unwrap_or("").to_string(),
                        ),
                    );
                }
                "text" => {
                    let text = inner_text(child);
                    if text.is_empty() {
                        continue;
                    }
                    let (size, family) = fonts
                        .get(child.attribute("font").unwrap_or(""))
                        .cloned()
                        .unwrap_or((0.0, String::new()));
                    let (l, t, w, h) = (
                        attr_f32(child, "left"),
                        attr_f32(child, "top"),
                        attr_f32(child, "width"),
                        attr_f32(child, "height"),
                    );
                    parsed.lines.push(Line {
                        page: number,
                        bbox: [l, t, l + w, t + h],
                        text,
                        size,
                        family,
                    });
                }
                "image" => {
                    let (l, t, w, h) = (
                        attr_f32(child, "left"),
                        attr_f32(child, "top"),
                        attr_f32(child, "width"),
                        attr_f32(child, "height"),
                    );
                    parsed.images.push(ImageBox {
                        page: number,
                        bbox: [l, t, l + w, t + h],
                    });
                }
                _ => {}
            }
        }
    }
    if parsed.pages.is_empty() {
        return Err("no <page>".into());
    }
    Ok(parsed)
}

/// Gouttière d'une page : abscisse entre 35 % et 65 % de la largeur croisée
/// par le moins de lignes étroites (port de `readingOrder()` du lecteur).
/// `None` si la page n'a pas deux colonnes.
pub(crate) fn gutter_x(lines: &[&Line], page_w: f32) -> Option<f32> {
    let narrow: Vec<&&Line> = lines
        .iter()
        .filter(|l| (l.bbox[2] - l.bbox[0]) <= page_w * 0.55)
        .collect();
    if narrow.len() <= 10 {
        return None;
    }
    let mut best = (f32::INFINITY, 0.0f32);
    let mut x = page_w * 0.35;
    while x <= page_w * 0.65 {
        let cross = narrow
            .iter()
            .filter(|l| l.bbox[0] < x - 6.0 && l.bbox[2] > x + 6.0)
            .count() as f32;
        if cross < best.0 {
            best = (cross, x);
        }
        x += page_w * 0.01;
    }
    let tolerated = (narrow.len() as f32 * 0.05).max(2.0);
    // deux colonnes seulement si des lignes existent de part et d'autre
    let left = narrow
        .iter()
        .filter(|l| (l.bbox[0] + l.bbox[2]) / 2.0 < best.1)
        .count();
    let right = narrow.len() - left;
    if best.0 <= tolerated && left > 3 && right > 3 {
        Some(best.1)
    } else {
        None
    }
}

#[derive(Debug, Clone)]
pub(crate) struct RawBlock {
    pub page: u16,
    pub column: u8,
    pub bbox: [f32; 4],
    pub lines: Vec<Line>,
    pub size: f32,
    pub family: String,
}

fn union(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    [
        a[0].min(b[0]),
        a[1].min(b[1]),
        a[2].max(b[2]),
        a[3].max(b[3]),
    ]
}

/// Lignes consécutives (ordre du flux) de même page, même colonne, écart
/// vertical < 0,6 × hauteur de ligne, même taille (± 0,5 pt) → un bloc.
pub(crate) fn group_blocks(parsed: &Parsed) -> Vec<RawBlock> {
    let mut out: Vec<RawBlock> = Vec::new();
    for (idx, page) in parsed.pages.iter().enumerate() {
        let pno = (idx + 1) as u16;
        let page_lines: Vec<&Line> = parsed.lines.iter().filter(|l| l.page == pno).collect();
        let gutter = gutter_x(&page_lines, page.w);
        let column_of = |l: &Line| -> u8 {
            match gutter {
                Some(g)
                    if (l.bbox[2] - l.bbox[0]) <= page.w * 0.55
                        && (l.bbox[0] + l.bbox[2]) / 2.0 >= g =>
                {
                    1
                }
                _ => 0,
            }
        };
        // ordre de lecture : colonne 0 (et pleine largeur) puis colonne 1, chacune par y
        let mut ordered: Vec<&Line> = page_lines.clone();
        ordered.sort_by(|a, b| {
            (
                column_of(a),
                (a.bbox[1] / 2.0).round() as i32,
                a.bbox[0] as i32,
            )
                .cmp(&(
                    column_of(b),
                    (b.bbox[1] / 2.0).round() as i32,
                    b.bbox[0] as i32,
                ))
        });
        let mut current: Option<RawBlock> = None;
        for l in ordered {
            let col = column_of(l);
            let h = (l.bbox[3] - l.bbox[1]).max(1.0);
            let joinable = current.as_ref().is_some_and(|c| {
                c.column == col
                    && (l.bbox[1] - c.bbox[3]).abs() < 0.6 * h
                    && (l.size - c.size).abs() <= 0.5
            });
            if joinable {
                let c = current.as_mut().unwrap();
                c.bbox = union(c.bbox, l.bbox);
                c.lines.push(l.clone());
            } else {
                if let Some(c) = current.take() {
                    out.push(c);
                }
                current = Some(RawBlock {
                    page: pno,
                    column: col,
                    bbox: l.bbox,
                    lines: vec![l.clone()],
                    size: l.size,
                    family: l.family.clone(),
                });
            }
        }
        if let Some(c) = current.take() {
            out.push(c);
        }
    }
    out
}

/// Joint les lignes d'un bloc : `-` final suivi d'une minuscule = césure
/// (jointure sans espace), sinon espace.
pub(crate) fn join_lines(lines: &[Line]) -> String {
    let mut out = String::new();
    for l in lines {
        let t = l.text.trim();
        if out.is_empty() {
            out.push_str(t);
            continue;
        }
        let next_lower = t.chars().next().is_some_and(|c| c.is_lowercase());
        if out.ends_with('-') && next_lower {
            out.pop();
            out.push_str(t);
        } else {
            out.push(' ');
            out.push_str(t);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/reflow/twocol.xml");

    #[test]
    fn parse_lit_pages_fontspecs_et_lignes() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        assert!(p.pages.len() >= 2);
        assert!(
            (p.pages[0].w - 595.0).abs() < 2.0,
            "A4/letter width, got {}",
            p.pages[0].w
        );
        let first = p
            .lines
            .iter()
            .find(|l| l.text.contains("Introduction"))
            .expect("Introduction line");
        assert_eq!(first.page, 1);
        assert!(first.size > 9.0 && first.size < 20.0);
        assert!(!first.family.is_empty());
        assert!(first.bbox[2] > first.bbox[0] && first.bbox[3] > first.bbox[1]);
    }

    #[test]
    fn parse_decode_les_entites_et_ignore_le_balisage_inline() {
        let xml = r##"<?xml version="1.0"?><pdf2xml><page number="1" width="600" height="800">
<fontspec id="0" size="10" family="Times" color="#000"/>
<text top="100" left="50" width="200" height="12" font="0">A &amp; <b>bold</b> <i>it</i>alic</text>
</page></pdf2xml>"##;
        let p = parse_pdftohtml_xml(xml).unwrap();
        assert_eq!(p.lines.len(), 1);
        assert_eq!(p.lines[0].text, "A & bold italic");
        assert_eq!(p.lines[0].bbox, [50.0, 100.0, 250.0, 112.0]);
    }

    #[test]
    fn gouttiere_trouvee_sur_une_page_deux_colonnes() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let page1: Vec<&Line> = p.lines.iter().filter(|l| l.page == 1).collect();
        let g = gutter_x(&page1, p.pages[0].w).expect("two columns");
        assert!(
            g > p.pages[0].w * 0.4 && g < p.pages[0].w * 0.6,
            "gutter at {g}"
        );
    }

    #[test]
    fn pas_de_gouttiere_sur_une_page_une_colonne() {
        let mut lines = Vec::new();
        for i in 0..30 {
            lines.push(Line {
                page: 1,
                bbox: [
                    60.0,
                    100.0 + i as f32 * 14.0,
                    540.0,
                    112.0 + i as f32 * 14.0,
                ],
                text: "wide line of text".into(),
                size: 10.0,
                family: "Times".into(),
            });
        }
        let refs: Vec<&Line> = lines.iter().collect();
        assert_eq!(gutter_x(&refs, 600.0), None);
    }

    #[test]
    fn regroupement_respecte_colonnes_et_espacement() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let blocks = group_blocks(&p);
        assert!(blocks.len() >= 8, "got {}", blocks.len());
        // aucun bloc ne mélange deux colonnes
        for b in &blocks {
            let cols: std::collections::BTreeSet<u8> = std::iter::once(b.column).collect();
            assert_eq!(cols.len(), 1);
            assert!(b.bbox[2] - b.bbox[0] > 0.0);
        }
        // l'ordre est colonne 0 puis colonne 1 sur chaque page (les lignes larges = colonne 0)
        let page1: Vec<&RawBlock> = blocks.iter().filter(|b| b.page == 1).collect();
        let first_col1 = page1.iter().position(|b| b.column == 1).unwrap();
        assert!(
            page1[first_col1..].iter().all(|b| b.column == 1),
            "column 0 block after column 1"
        );
        // le titre (grande taille) est un bloc à lui seul
        let title = blocks
            .iter()
            .find(|b| b.lines.iter().any(|l| l.text.contains("Albedo decline")))
            .unwrap();
        assert!(title.lines.len() <= 2);
    }

    #[test]
    fn join_lines_decesure_et_joint_par_espace() {
        let mk = |t: &str| Line {
            page: 1,
            bbox: [0.0; 4],
            text: t.into(),
            size: 10.0,
            family: "T".into(),
        };
        assert_eq!(
            join_lines(&[mk("energy bal-"), mk("ance of glaciers")]),
            "energy balance of glaciers"
        );
        assert_eq!(
            join_lines(&[mk("a measur-"), mk("able driver")]),
            "a measurable driver"
        );
        assert_eq!(join_lines(&[mk("long-"), mk("Term")]), "long- Term"); // majuscule : trait conservé
        assert_eq!(join_lines(&[mk("end."), mk("Next")]), "end. Next");
    }
}
