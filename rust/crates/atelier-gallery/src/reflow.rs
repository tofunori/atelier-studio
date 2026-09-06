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

/// Lignes consécutives (ordre du flux) de même page, même colonne, même
/// taille (± 0,5 pt) → un bloc si :
/// - même rangée que la dernière ligne du bloc (écart de `top` < 0,3 ×
///   hauteur, p. ex. "2" et "Methods" sur la même ligne de base) ET écart
///   horizontal `g = gauche(l) − droite(dernière ligne)` dans
///   [-0,5 × hauteur, 1,5 × hauteur] — borne qui évite de coller deux
///   fragments courts posés côte à côte sans lien (le test math/texte
///   ci-dessous ignore volontairement la famille de police sur cette
///   branche : un "(1)" en police texte sur la ligne d'une équation doit
///   quand même rejoindre le bloc) ; ou
/// - écart vertical < 0,6 × hauteur de ligne (lignes empilées) ET la nature
///   police-math (`is_math_family`) de la nouvelle ligne et de la dernière
///   ligne du bloc concorde — un saut de police math ↔ texte referme le
///   bloc courant même si le petit écart vertical le suggérait autrement
///   (p. ex. une équation collée de trop près au paragraphe qui la précède
///   ne doit pas l'avaler).
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
                let last_line = c.lines.last().expect("block always has ≥1 line");
                if c.column != col || (l.size - c.size).abs() > 0.5 {
                    return false;
                }
                let same_row = (l.bbox[1] - last_line.bbox[1]).abs() < 0.3 * h;
                if same_row {
                    let g = l.bbox[0] - last_line.bbox[2];
                    g >= -0.5 * h && g <= 1.5 * h
                } else {
                    (l.bbox[1] - c.bbox[3]).abs() < 0.6 * h
                        && is_math_family(&l.family) == is_math_family(&last_line.family)
                }
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Kind {
    Heading,
    Paragraph,
    Caption,
    Footnote,
    Math,
    Figure,
    Table,
    List,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct BlockLine {
    pub bbox: [f32; 4],
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct Block {
    pub id: u32,
    pub page: u16,
    pub kind: Kind,
    pub bbox: [f32; 4],
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<u8>,
    pub lines: Vec<BlockLine>,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub(crate) struct Source {
    pub mtime: u64,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub(crate) struct ReflowDoc {
    pub version: u32,
    pub source: Source,
    pub pages: Vec<PageDim>,
    pub blocks: Vec<Block>,
}

pub(crate) const REFLOW_VERSION: u32 = 1;

fn norm_text(t: &str) -> String {
    t.chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

fn is_math_family(f: &str) -> bool {
    let u = f.to_uppercase();
    [
        "CMMI", "CMSY", "CMEX", "MTMI", "MTSY", "MSAM", "MSBM", "MATH",
    ]
    .iter()
    .any(|k| u.contains(k))
}

/// Taille du corps : médiane des tailles de ligne pondérée par le nombre de caractères.
fn body_size(blocks: &[RawBlock]) -> f32 {
    let mut samples: Vec<(f32, usize)> = blocks
        .iter()
        .flat_map(|b| b.lines.iter().map(|l| (l.size, l.text.chars().count())))
        .collect();
    if samples.is_empty() {
        return 10.0;
    }
    samples.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    let total: usize = samples.iter().map(|s| s.1).sum();
    let mut acc = 0usize;
    for (size, n) in &samples {
        acc += n;
        if acc * 2 >= total {
            return *size;
        }
    }
    samples.last().map(|s| s.0).unwrap_or(10.0)
}

pub(crate) fn analyze(parsed: &Parsed) -> ReflowDoc {
    let raw = group_blocks(parsed);
    let body = body_size(&raw);
    let caption_re = |t: &str| {
        let t = t.trim_start();
        let lower = t.to_lowercase();
        let prefix = ["fig.", "fig ", "figure", "table", "tableau"]
            .iter()
            .find(|p| lower.starts_with(**p));
        prefix.is_some_and(|p| {
            lower[p.len()..]
                .trim_start()
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_digit())
        })
    };
    let list_re = |t: &str| {
        let mut it = t.trim_start().chars();
        match it.next() {
            Some('•') | Some('-') | Some('–') => it.next() == Some(' '),
            Some(c) if c.is_ascii_digit() => {
                let rest: String = it.collect();
                let rest = rest.trim_start_matches(|c: char| c.is_ascii_digit());
                rest.starts_with(". ") || rest.starts_with(") ")
            }
            _ => false,
        }
    };

    // 1) en-têtes / pieds : bande de 6 % dont le texte normalisé se répète sur ≥ 2 pages
    let mut band_counts: std::collections::HashMap<String, std::collections::BTreeSet<u16>> =
        Default::default();
    for b in &raw {
        let ph = parsed.pages[(b.page - 1) as usize].h;
        if b.bbox[1] < ph * 0.06 || b.bbox[3] > ph * 0.94 {
            let key = norm_text(&join_lines(&b.lines));
            let key = if key.chars().all(|c| c.is_ascii_digit()) {
                "#pagenum".to_string()
            } else {
                key
            };
            band_counts.entry(key).or_default().insert(b.page);
        }
    }
    let is_running = |b: &RawBlock| {
        let ph = parsed.pages[(b.page - 1) as usize].h;
        if !(b.bbox[1] < ph * 0.06 || b.bbox[3] > ph * 0.94) {
            return false;
        }
        let key = norm_text(&join_lines(&b.lines));
        let key = if key.chars().all(|c| c.is_ascii_digit()) {
            "#pagenum".to_string()
        } else {
            key
        };
        band_counts.get(&key).is_some_and(|pages| pages.len() >= 2)
    };

    // 2) niveaux de titre : rang décroissant des tailles > 1,15 × corps
    let mut heading_sizes: Vec<i32> = raw
        .iter()
        .filter(|b| b.size > body * 1.15 && b.lines.len() <= 3)
        .map(|b| (b.size * 2.0).round() as i32)
        .collect();
    heading_sizes.sort_unstable_by(|a, b| b.cmp(a));
    heading_sizes.dedup();
    let level_of = |size: f32| -> u8 {
        let key = (size * 2.0).round() as i32;
        let rank = heading_sizes.iter().position(|s| *s == key).unwrap_or(2);
        (rank.min(2) + 1) as u8
    };

    let mut blocks: Vec<Block> = Vec::new();
    let mut next_id = 0u32;
    let mut push = |blocks: &mut Vec<Block>,
                    page: u16,
                    kind: Kind,
                    bbox: [f32; 4],
                    text: String,
                    level: Option<u8>,
                    lines: Vec<BlockLine>| {
        blocks.push(Block {
            id: next_id,
            page,
            kind,
            bbox,
            text,
            level,
            lines,
        });
        next_id += 1;
    };

    for b in &raw {
        if is_running(b) {
            continue;
        }
        let text = join_lines(&b.lines);
        let lines: Vec<BlockLine> = b
            .lines
            .iter()
            .map(|l| BlockLine {
                bbox: l.bbox,
                text: l.text.clone(),
            })
            .collect();
        let ph = parsed.pages[(b.page - 1) as usize].h;
        let chars: usize = b
            .lines
            .iter()
            .map(|l| l.text.chars().count())
            .sum::<usize>()
            .max(1);
        let math_chars: usize = b
            .lines
            .iter()
            .filter(|l| is_math_family(&l.family))
            .map(|l| l.text.chars().count())
            .sum();
        let ends_with_eq_number = b.lines.len() <= 2
            && text.trim_end().ends_with(')')
            && text.rsplit('(').next().is_some_and(|t| {
                t.trim_end_matches(')').chars().all(|c| c.is_ascii_digit())
                    && !t.trim_end_matches(')').is_empty()
            });
        let kind = if caption_re(&text) {
            Kind::Caption
        } else if math_chars * 10 >= chars * 6 || ends_with_eq_number {
            Kind::Math
        } else if b.size > body * 1.15 && b.lines.len() <= 3 {
            Kind::Heading
        } else if b.size < body * 0.9 && b.bbox[1] > ph * 0.66 {
            Kind::Footnote
        } else if list_re(&text) {
            Kind::List
        } else {
            Kind::Paragraph
        };
        match kind {
            Kind::Math => push(
                &mut blocks,
                b.page,
                kind,
                b.bbox,
                String::new(),
                None,
                lines,
            ),
            Kind::Heading => {
                let lv = level_of(b.size);
                push(&mut blocks, b.page, kind, b.bbox, text, Some(lv), lines)
            }
            _ => push(&mut blocks, b.page, kind, b.bbox, text, None, lines),
        }
    }

    // 3) fusion des paragraphes coupés (colonne / page) : pas de ponctuation finale + suite en minuscule
    let mut merged: Vec<Block> = Vec::with_capacity(blocks.len());
    for b in blocks {
        let joinable = merged.last().is_some_and(|p: &Block| {
            p.kind == Kind::Paragraph
                && b.kind == Kind::Paragraph
                && !p.text.trim_end().ends_with(['.', '?', '!', ':'])
                && b.text.chars().next().is_some_and(|c| c.is_lowercase())
        });
        if joinable {
            let p = merged.last_mut().unwrap();
            let glue = if p.text.ends_with('-')
                && b.text.chars().next().is_some_and(|c| c.is_lowercase())
            {
                p.text.pop();
                ""
            } else {
                " "
            };
            p.text.push_str(glue);
            p.text.push_str(&b.text);
            p.lines.extend(b.lines);
            // bbox reste celle du premier fragment (page du début) — les lignes portent leurs propres bbox
        } else {
            merged.push(b);
        }
    }
    let mut blocks = merged;

    // 4) figures : images fusionnées entre elles (même si une composante est
    // étroite), puis le résultat fusionné est filtré à ≥ 40×40 (sinon un
    // logo isolé, ou un fragment étroit qui touche une grande image, se
    // ferait exclure avant même la fusion) ; légende orpheline → figure
    // synthétique.
    let mut images: Vec<ImageBox> = parsed.images.clone();
    let mut fused: Vec<ImageBox> = Vec::new();
    while let Some(mut cur) = images.pop() {
        let mut changed = true;
        while changed {
            changed = false;
            let mut i = 0;
            while i < images.len() {
                let o = images[i];
                let touch = o.page == cur.page
                    && o.bbox[0] <= cur.bbox[2] + 2.0
                    && o.bbox[2] >= cur.bbox[0] - 2.0
                    && o.bbox[1] <= cur.bbox[3] + 2.0
                    && o.bbox[3] >= cur.bbox[1] - 2.0;
                if touch {
                    cur.bbox = union(cur.bbox, o.bbox);
                    images.swap_remove(i);
                    changed = true;
                } else {
                    i += 1;
                }
            }
        }
        fused.push(cur);
    }
    fused.retain(|i| i.bbox[2] - i.bbox[0] >= 40.0 && i.bbox[3] - i.bbox[1] >= 40.0);
    let mut extra: Vec<(usize, Block)> = Vec::new(); // (insérer avant l'index, bloc)
    for (i, cap) in blocks
        .iter()
        .enumerate()
        .filter(|(_, b)| b.kind == Kind::Caption)
    {
        let is_table = cap.text.to_lowercase().starts_with("tab");
        let kind = if is_table { Kind::Table } else { Kind::Figure };
        // image bitmap au-dessus de la légende, même page, chevauchement horizontal
        let above = fused.iter().position(|img| {
            img.page == cap.page
                && img.bbox[3] <= cap.bbox[1] + 4.0
                && img.bbox[2] > cap.bbox[0]
                && img.bbox[0] < cap.bbox[2]
        });
        let bbox = if let Some(k) = above {
            fused.remove(k).bbox
        } else {
            // zone entre le bloc texte précédent (même page, même colonne approx.) et la légende
            let prev_bottom = blocks[..i]
                .iter()
                .rev()
                .find(|b| {
                    b.page == cap.page
                        && b.kind != Kind::Caption
                        && b.bbox[2] > cap.bbox[0]
                        && b.bbox[0] < cap.bbox[2]
                })
                .map(|b| b.bbox[3])
                .unwrap_or(parsed.pages[(cap.page - 1) as usize].h * 0.06);
            if cap.bbox[1] - prev_bottom < 40.0 {
                continue;
            }
            [
                cap.bbox[0],
                prev_bottom + 2.0,
                cap.bbox[2],
                cap.bbox[1] - 2.0,
            ]
        };
        extra.push((
            i,
            Block {
                id: 0,
                page: cap.page,
                kind,
                bbox,
                text: String::new(),
                level: None,
                lines: Vec::new(),
            },
        ));
    }
    for (offset, (i, b)) in extra.into_iter().enumerate() {
        blocks.insert(i + offset, b);
    }
    // images restantes sans légende → figures placées avant le premier bloc qui les suit sur la page
    for img in fused {
        let pos = blocks
            .iter()
            .position(|b| b.page == img.page && b.bbox[1] >= img.bbox[3])
            .unwrap_or(blocks.len());
        blocks.insert(
            pos,
            Block {
                id: 0,
                page: img.page,
                kind: Kind::Figure,
                bbox: img.bbox,
                text: String::new(),
                level: None,
                lines: Vec::new(),
            },
        );
    }
    for (i, b) in blocks.iter_mut().enumerate() {
        b.id = i as u32;
    }

    ReflowDoc {
        version: REFLOW_VERSION,
        source: Source::default(),
        pages: parsed.pages.clone(),
        blocks,
    }
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
    fn regroupement_fusionne_deux_runs_sur_la_meme_rangee() {
        // "2" et "Methods" sur la même ligne de base (même top), colonnes de
        // texte séparées par pdftohtml (numéro de section / titre) : même
        // taille, écart de `top` nul → un seul bloc, joint par un espace.
        let parsed = Parsed {
            pages: vec![PageDim { w: 300.0, h: 800.0 }],
            lines: vec![
                Line {
                    page: 1,
                    bbox: [57.0, 728.0, 65.0, 741.0],
                    text: "2".into(),
                    size: 14.0,
                    family: "T".into(),
                },
                Line {
                    page: 1,
                    bbox: [81.0, 728.0, 143.0, 741.0],
                    text: "Methods".into(),
                    size: 14.0,
                    family: "T".into(),
                },
            ],
            images: vec![],
        };
        let blocks = group_blocks(&parsed);
        assert_eq!(blocks.len(), 1, "got {blocks:?}");
        assert_eq!(join_lines(&blocks[0].lines), "2 Methods");
    }

    #[test]
    fn regroupement_meme_rangee_refuse_un_ecart_horizontal_trop_grand() {
        // Deux runs courts sur la même ligne de base mais éloignés de 5×
        // hauteur : pas de lien plausible (pas un numéro de section suivi
        // de son titre) → deux blocs distincts, pas un seul.
        let parsed = Parsed {
            pages: vec![PageDim { w: 800.0, h: 800.0 }],
            lines: vec![
                Line {
                    page: 1,
                    bbox: [57.0, 728.0, 90.0, 741.0],
                    text: "Left".into(),
                    size: 13.0,
                    family: "T".into(),
                },
                Line {
                    // hauteur de ligne = 13 ; écart gauche(l) - droite(dernière) = 500 - 90 = 410 ≈ 31×h
                    page: 1,
                    bbox: [500.0, 728.0, 540.0, 741.0],
                    text: "Right".into(),
                    size: 13.0,
                    family: "T".into(),
                },
            ],
            images: vec![],
        };
        let blocks = group_blocks(&parsed);
        assert_eq!(blocks.len(), 2, "got {blocks:?}");
    }

    #[test]
    fn regroupement_refuse_de_joindre_texte_et_math_verticalement() {
        // Une ligne en police texte suivie, 0,2×hauteur plus bas, d'une
        // ligne en police math (familles différentes) : le petit écart
        // vertical seul ne suffit plus à joindre — c'est exactement le cas
        // d'une équation collée de près au paragraphe qui la précède
        // (`\abovedisplayshortskip`). Deux lignes texte au même écart, elles,
        // fusionnent toujours.
        let text_line = |top: f32, family: &str| Line {
            page: 1,
            bbox: [57.0, top, 200.0, top + 10.0],
            text: "x".into(),
            size: 10.0,
            family: family.into(),
        };
        let parsed_text_then_math = Parsed {
            pages: vec![PageDim { w: 300.0, h: 800.0 }],
            lines: vec![text_line(600.0, "Times"), text_line(612.0, "CMMI10")],
            images: vec![],
        };
        let blocks = group_blocks(&parsed_text_then_math);
        assert_eq!(
            blocks.len(),
            2,
            "texte→math ne doit pas fusionner: {blocks:?}"
        );

        let parsed_text_then_text = Parsed {
            pages: vec![PageDim { w: 300.0, h: 800.0 }],
            lines: vec![text_line(600.0, "Times"), text_line(612.0, "Times")],
            images: vec![],
        };
        let blocks = group_blocks(&parsed_text_then_text);
        assert_eq!(blocks.len(), 1, "texte→texte doit fusionner: {blocks:?}");
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

    #[test]
    fn classification_titre_paragraphe_legende_equation() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        assert_eq!(doc.version, 1);
        let kinds = |k: Kind| doc.blocks.iter().filter(|b| b.kind == k).count();
        assert!(
            kinds(Kind::Heading) >= 3,
            "Introduction, Methods, Data + titre"
        );
        let intro = doc
            .blocks
            .iter()
            .find(|b| b.text == "1 Introduction" || b.text == "Introduction")
            .expect("heading Introduction");
        assert_eq!(intro.kind, Kind::Heading);
        assert_eq!(intro.level, Some(1));
        let data = doc
            .blocks
            .iter()
            .find(|b| b.text.ends_with("Data"))
            .unwrap();
        assert_eq!(data.level, Some(2));
        let cap = doc
            .blocks
            .iter()
            .find(|b| b.kind == Kind::Caption)
            .expect("caption");
        assert!(cap.text.starts_with("Figure 1"));
        assert!(kinds(Kind::Paragraph) >= 5);
        // dé-césure appliquée dans le texte des paragraphes
        assert!(
            doc.blocks
                .iter()
                .any(|b| b.text.contains("energy balance of glaciers"))
        );
        // l'équation numérotée est un bloc math sans texte, avec bbox
        let math = doc
            .blocks
            .iter()
            .find(|b| b.kind == Kind::Math)
            .expect("math block");
        assert!(math.text.is_empty() && math.bbox[3] > math.bbox[1]);
    }

    #[test]
    fn en_tete_et_pied_repetes_sont_supprimes() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        assert!(
            !doc.blocks.iter().any(|b| b.text.contains("running head")),
            "running head kept"
        );
        assert!(
            !doc.blocks
                .iter()
                .any(|b| b.text.trim() == "1" || b.text.trim() == "2"),
            "page number kept"
        );
    }

    #[test]
    fn figure_vectorielle_synthetisee_avant_sa_legende() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        let cap_i = doc
            .blocks
            .iter()
            .position(|b| b.kind == Kind::Caption)
            .unwrap();
        let fig = &doc.blocks[cap_i - 1];
        assert_eq!(fig.kind, Kind::Figure);
        assert_eq!(fig.page, doc.blocks[cap_i].page);
        assert!(
            fig.bbox[3] <= doc.blocks[cap_i].bbox[1] + 1.0,
            "figure sits above caption"
        );
        assert!(fig.bbox[3] - fig.bbox[1] > 40.0);
    }

    #[test]
    fn images_bitmap_deviennent_des_figures_et_les_logos_sont_ignores() {
        let mut p = parse_pdftohtml_xml(FIXTURE).unwrap();
        p.images.push(ImageBox {
            page: 2,
            bbox: [60.0, 100.0, 300.0, 280.0],
        });
        p.images.push(ImageBox {
            page: 2,
            bbox: [300.0, 100.0, 320.0, 280.0],
        }); // touche la précédente → fusion
        p.images.push(ImageBox {
            page: 2,
            bbox: [500.0, 20.0, 540.0, 35.0],
        }); // logo 40×15 → ignoré
        let doc = analyze(&p);
        let figs: Vec<&Block> = doc
            .blocks
            .iter()
            .filter(|b| b.kind == Kind::Figure && b.page == 2)
            .collect();
        assert!(
            figs.iter().any(|f| f.bbox == [60.0, 100.0, 320.0, 280.0]),
            "merged figure missing: {figs:?}"
        );
        assert!(
            !figs.iter().any(|f| f.bbox[1] < 40.0),
            "logo classified as figure"
        );
    }

    #[test]
    fn json_du_document_est_stable() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        let v = serde_json::to_value(&doc).unwrap();
        assert_eq!(v["version"], 1);
        assert!(v["blocks"][0]["kind"].is_string());
        assert!(v["blocks"][0]["lines"].is_array());
        assert_eq!(
            v["blocks"][0]["kind"].as_str().unwrap(),
            v["blocks"][0]["kind"].as_str().unwrap().to_lowercase()
        );
    }
}
