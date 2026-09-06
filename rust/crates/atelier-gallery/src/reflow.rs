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

use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

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
    /// Police de la première ligne du bloc : consommée par `analyze` pour
    /// repérer les titres en gras à la taille du corps.
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
        // (a) une ligne qui TRAVERSE la gouttière appartient à la manchette
        // pleine largeur, quelle que soit sa largeur : un titre centré tient
        // souvent sous les 55 % de la page et son centre tombe à droite de la
        // gouttière — il se retrouvait alors en colonne 1, donc lu APRÈS tout
        // le corps de la colonne 0 (revue de branche, constat C1).
        let crosses = |l: &Line| gutter.is_some_and(|g| l.bbox[0] < g - 6.0 && l.bbox[2] > g + 6.0);
        let narrow_right = |l: &Line| match gutter {
            Some(g) => {
                !crosses(l)
                    && (l.bbox[2] - l.bbox[0]) <= page.w * 0.55
                    && (l.bbox[0] + l.bbox[2]) / 2.0 >= g
            }
            None => false,
        };
        // (b) coupure de manchette : le haut RÉEL de la colonne 1 est le plus
        // petit `top` parmi ses lignes alignées sur son bord gauche modal.
        // Tout ce qui flotte au-dessus (auteurs, affiliations posés à droite
        // du titre) est de la manchette, pas de la colonne 1.
        let col1_top = {
            let cand: Vec<&&Line> = page_lines.iter().filter(|l| narrow_right(l)).collect();
            let mut counts: std::collections::HashMap<i32, usize> = Default::default();
            for l in &cand {
                *counts.entry(l.bbox[0].round() as i32).or_insert(0) += 1;
            }
            match counts.iter().max_by_key(|(left, n)| (**n, -**left)) {
                Some((modal, _)) => {
                    let modal = *modal as f32;
                    cand.iter()
                        .filter(|l| (l.bbox[0] - modal).abs() <= 3.0)
                        .map(|l| l.bbox[1])
                        .fold(f32::INFINITY, f32::min)
                }
                None => f32::INFINITY,
            }
        };
        let column_of = |l: &Line| -> u8 {
            if narrow_right(l) && l.bbox[1] >= col1_top {
                1
            } else {
                0
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
    /// Page de la ligne. Redondant avec `Block.page` SAUF pour un paragraphe
    /// fusionné d'une page à l'autre : le front en a besoin pour normaliser
    /// les rectangles d'une sélection avec les bonnes dimensions de page.
    pub page: u16,
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

// 2 : vague finale du plan 078 — ordre de lecture de la manchette, titres en
// gras, fragments d'exposant supprimés, numéro d'équation à 3 chiffres max.
// 3 : chaque ligne porte sa page (`BlockLine.page`).
pub(crate) const REFLOW_VERSION: u32 = 3;

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

/// Police grasse. Les articles composés en Times/Nimbus donnent leurs titres
/// de section à la taille du corps : seule la graisse les distingue.
fn is_bold_family(f: &str) -> bool {
    let u = f.to_uppercase();
    // « MEDI » couvre les familles Nimbus/URW (`NimbusRomNo9L-Medi`), la
    // graisse des titres de section des articles Copernicus : sans elle la
    // règle ne trouvait AUCUN titre sur un vrai article (mesuré 2026-09-06).
    ["BOLD", "-B", "CMBX", "HEAVY", "SEMIBOLD", "MEDI"]
        .iter()
        .any(|k| u.contains(k))
}

/// Numéro de section en tête (`2 Methods`, `2.3.1 Albedo`) → nombre de points
/// du numéro (`2` → 0, `2.3` → 1). `None` si le texte ne commence pas par
/// `\d+(\.\d+)*` suivi d'une espace et d'un caractère non blanc.
fn section_dots(t: &str) -> Option<usize> {
    let t = t.trim_start();
    let head: String = t
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    if head.is_empty() {
        return None;
    }
    let parts: Vec<&str> = head.split('.').collect();
    if parts
        .iter()
        .any(|p| p.is_empty() || !p.chars().all(|c| c.is_ascii_digit()))
    {
        return None;
    }
    let rest = &t[head.len()..];
    if !rest.starts_with(' ') || rest.trim_start().is_empty() {
        return None;
    }
    Some(parts.len() - 1)
}

/// Marqueur d'affiliation en exposant (« 1 », « 1,2 », « * », « † ») laissé
/// seul par `pdftohtml` : un bloc minuscule et plus petit que le corps, qui
/// n'apporte rien à la lecture (140 blocs de ce genre sur un article
/// Copernicus de 19 pages).
/// La classe de caractères est volontairement large (pas seulement des
/// chiffres) : les indices de variables (`Q_G`, `S_N`, `d_sd`) sont laissés
/// par pdftohtml sous la même forme — un fragment orphelin plus petit que le
/// corps et large de quelques points. Un « 1 » à la taille du corps (numéro de
/// liste, chiffre de tableau) est protégé par le seuil de taille, une cellule
/// de tableau par celui de largeur.
fn is_superscript_marker(text: &str, size: f32, body: f32, width: f32) -> bool {
    let compact: String = text.chars().filter(|c| !c.is_whitespace()).collect();
    size < body * 0.9 && width < 25.0 && !compact.is_empty() && compact.chars().count() <= 3
}

/// Clé d'en-tête / de pied : `None` hors des bandes de 6 % en haut et en bas
/// de page ; sinon le texte normalisé, un numéro de page seul étant ramené à
/// `#pagenum` (il change d'une page à l'autre mais désigne la même chose).
/// UNE seule définition, utilisée pour compter les répétitions ET pour décider
/// de la suppression : les deux ne peuvent plus diverger.
fn band_key(b: &RawBlock, page_h: f32) -> Option<String> {
    if !(b.bbox[1] < page_h * 0.06 || b.bbox[3] > page_h * 0.94) {
        return None;
    }
    let key = norm_text(&join_lines(&b.lines));
    Some(if key.chars().all(|c| c.is_ascii_digit()) {
        "#pagenum".to_string()
    } else {
        key
    })
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
        if let Some(key) = band_key(b, parsed.pages[(b.page - 1) as usize].h) {
            band_counts.entry(key).or_default().insert(b.page);
        }
    }
    let is_running = |b: &RawBlock| {
        band_key(b, parsed.pages[(b.page - 1) as usize].h)
            .and_then(|key| band_counts.get(&key))
            .is_some_and(|pages| pages.len() >= 2)
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
                page: l.page,
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
        // 1 à 3 chiffres seulement : `(12)` est un numéro d'équation, `(2014)`
        // une année de citation en fin de phrase.
        let ends_with_eq_number = b.lines.len() <= 2
            && text.trim_end().ends_with(')')
            && text.rsplit('(').next().is_some_and(|t| {
                let n = t.trim_end_matches(')');
                (1..=3).contains(&n.chars().count()) && n.chars().all(|c| c.is_ascii_digit())
            });
        // Fragment de math EN LIGNE isolé par pdftohtml (un « α », un « ◦ »,
        // une flèche de quelques points de large) : la spec veut que les
        // équations inline restent du texte et que seules les équations en
        // ligne isolée deviennent des découpes. Rendu en bloc, un tel
        // fragment donnait une découpe bitmap de 5 pt de large au milieu du
        // flux (104 sur un article Copernicus de 19 pages) : on le laisse
        // tomber plutôt que d'en faire une image.
        let inline_math_scrap = math_chars == chars
            && text.chars().filter(|c| !c.is_whitespace()).count() <= 3
            && b.bbox[2] - b.bbox[0] < 25.0
            && !ends_with_eq_number;
        if inline_math_scrap || is_superscript_marker(&text, b.size, body, b.bbox[2] - b.bbox[0]) {
            continue;
        }
        let big_heading = b.size > body * 1.15 && b.lines.len() <= 3;
        // Titre en gras à la taille du corps : ≤ 3 lignes, graisse, et soit un
        // numéro de section, soit un intitulé court sans point final.
        let bold_heading = b.lines.len() <= 3
            && b.size >= body * 0.95
            && is_bold_family(&b.family)
            && (section_dots(&text).is_some()
                || (text.chars().count() <= 60 && !text.trim_end().ends_with('.')));
        // Précédence de la chaîne ci-dessous, du plus spécifique au plus
        // générique : une légende gagne sur tout (elle porte son propre
        // préfixe) ; une équation gagne sur un titre (les deux sont courts,
        // mais la police math ou le numéro d'équation tranchent) ; un titre
        // gagne sur une note de bas de page (une note est PLUS petite que le
        // corps, un titre jamais) ; une liste gagne sur un paragraphe.
        let kind = if caption_re(&text) {
            Kind::Caption
        } else if math_chars * 10 >= chars * 6 || ends_with_eq_number {
            Kind::Math
        } else if big_heading || bold_heading {
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
                // Un titre repéré par la TAILLE garde son rang de taille ; un
                // titre repéré par la GRAISSE tient son niveau de son numéro
                // de section (`2.3` → 2), plafonné à 3, faute de numéro → 2.
                let lv = if big_heading {
                    level_of(b.size)
                } else {
                    section_dots(&text).map_or(2, |d| (d + 1).min(3) as u8)
                };
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

fn json_error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(serde_json::json!({"error": message.into()}))).into_response()
}

pub(crate) fn source_of(pdf: &Path) -> Option<Source> {
    let md = std::fs::metadata(pdf).ok()?;
    let mtime = md
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs();
    Some(Source {
        mtime,
        size: md.len(),
    })
}

pub(crate) fn cache_path_for(pdf: &Path, project_root: &Path, is_zotero: bool) -> PathBuf {
    use sha2::{Digest, Sha256};
    let key = hex::encode(Sha256::digest(pdf.to_string_lossy().as_bytes()));
    let dir = if is_zotero {
        crate::zotero::zotero_cache_dir().join("reflow")
    } else {
        project_root.join(".fig_thumbs").join("reflow")
    };
    dir.join(format!("{key}.json"))
}

pub(crate) fn read_cache(path: &Path, expected: Source) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let ok = v["version"].as_u64() == Some(REFLOW_VERSION as u64)
        && v["source"]["mtime"].as_u64() == Some(expected.mtime)
        && v["source"]["size"].as_u64() == Some(expected.size);
    ok.then_some(raw)
}

pub(crate) fn write_cache(path: &Path, doc: &ReflowDoc) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(doc).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    // un rename raté laisserait un .json.tmp orphelin à chaque analyse
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

/// Spawn `pdftohtml -xml -zoom 1 -stdout -q` : le zoom 1 explicite est
/// obligatoire (le défaut de pdftohtml est 1.5 et mettrait à l'échelle
/// toutes les bbox — la fixture `twocol.xml` et les tests d'analyse
/// supposent le zoom 1). Ne JAMAIS ajouter `-i` : voir le commentaire de
/// tête du module — `-i` fait disparaître les `<image>` du XML.
/// Le binaire vient de `ATELIER_PDFTOHTML` (tests) ou du PATH.
/// Échéance du spawn. `ATELIER_PDFTOHTML_TIMEOUT_MS` la raccourcit pour les
/// tests (lu par le PROCESSUS SERVEUR, jamais muté depuis un test unitaire).
fn pdftohtml_timeout() -> std::time::Duration {
    std::env::var("ATELIER_PDFTOHTML_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .map(std::time::Duration::from_millis)
        .unwrap_or_else(|| std::time::Duration::from_secs(60))
}

pub(crate) const PDFTOHTML_TIMEOUT_MSG: &str = "pdftohtml: délai dépassé (60 s)";

pub(crate) fn run_pdftohtml(pdf: &Path) -> Result<String, String> {
    use std::io::Read;
    let bin = std::env::var("ATELIER_PDFTOHTML").unwrap_or_else(|_| "pdftohtml".to_string());
    let mut child = std::process::Command::new(&bin)
        .args(["-xml", "-zoom", "1", "-stdout", "-q"])
        .arg(pdf)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("pdftohtml introuvable ({bin}): {e}"))?;
    // Les deux tuyaux sont VIDÉS dans des threads : sans ça, un XML plus gros
    // que le tampon du noyau bloquerait l'enfant et l'échéance ci-dessous
    // tuerait un processus en bonne santé.
    let mut out_pipe = child.stdout.take().expect("stdout piped");
    let mut err_pipe = child.stderr.take().expect("stderr piped");
    let out_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = out_pipe.read_to_end(&mut buf);
        buf
    });
    let err_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = err_pipe.read_to_end(&mut buf);
        buf
    });
    let deadline = std::time::Instant::now() + pdftohtml_timeout();
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) => break status,
            None if std::time::Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(PDFTOHTML_TIMEOUT_MSG.to_string());
            }
            None => std::thread::sleep(std::time::Duration::from_millis(25)),
        }
    };
    let stdout = out_reader.join().unwrap_or_default();
    let stderr = err_reader.join().unwrap_or_default();
    if !status.success() {
        return Err(format!(
            "pdftohtml a échoué: {}",
            String::from_utf8_lossy(&stderr).trim()
        ));
    }
    String::from_utf8(stdout).map_err(|e| format!("pdftohtml: sortie non UTF-8: {e}"))
}

#[derive(Deserialize)]
pub(crate) struct ReflowQuery {
    pub path: String,
}

/// `GET /reflow?path=<rel>` → JSON des blocs ; `HEAD` → 200 si le cache
/// existe, 404 sinon (ne déclenche jamais l'analyse).
pub async fn reflow(
    State(state): State<crate::AppState>,
    method: Method,
    headers: HeaderMap,
    Query(query): Query<ReflowQuery>,
) -> Response {
    if !crate::request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "forbidden");
    }
    let rel = query.path.trim();
    let (pdf, is_zotero) = match crate::zotero::zotero_pdf_path(rel) {
        Some(p) => (p, true),
        None => match atelier_core::safe_project_path(&state.root, rel) {
            Ok(p) => (p, false),
            Err(_) => return json_error(StatusCode::FORBIDDEN, "outside the project"),
        },
    };
    let Some(source) = source_of(&pdf) else {
        return json_error(StatusCode::NOT_FOUND, "not found");
    };
    if !pdf
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
    {
        return json_error(StatusCode::BAD_REQUEST, "not a pdf");
    }
    let cache = cache_path_for(&pdf, &state.root, is_zotero);
    if let Some(raw) = read_cache(&cache, source) {
        if method == Method::HEAD {
            return StatusCode::OK.into_response();
        }
        return (
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            raw,
        )
            .into_response();
    }
    if method == Method::HEAD {
        return StatusCode::NOT_FOUND.into_response();
    }
    let analysed = tokio::task::spawn_blocking(move || -> Result<ReflowDoc, String> {
        let xml = run_pdftohtml(&pdf)?;
        let parsed = parse_pdftohtml_xml(&xml)?;
        let mut doc = analyze(&parsed);
        doc.source = source;
        Ok(doc)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    match analysed {
        Ok(doc) => {
            // un cache non écrit n'empêche pas la réponse, mais il fait
            // respawner pdftohtml à chaque ouverture : il faut le voir passer.
            if let Err(e) = write_cache(&cache, &doc) {
                eprintln!("reflow: cache non écrit ({}): {e}", cache.display());
            }
            Json(doc).into_response()
        }
        Err(msg) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": msg})),
        )
            .into_response(),
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
    fn ordre_de_lecture_titre_auteurs_puis_colonnes() {
        // Manchette (titre pleine largeur + auteurs côte à côte) AVANT les
        // deux colonnes : une ligne qui traverse la gouttière est colonne 0
        // quelle que soit sa largeur, et tout ce qui est au-dessus du haut
        // réel de la colonne 1 (`col1_top`) l'est aussi.
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let blocks = group_blocks(&p);
        for b in blocks.iter().filter(|b| b.page == 1) {
            assert!(
                !(b.column == 1 && b.bbox[1] < 250.0),
                "bloc de manchette laissé en colonne 1: {:?}",
                b.lines.first().map(|l| l.text.clone())
            );
        }
        let doc = analyze(&p);
        let page1: Vec<&Block> = doc.blocks.iter().filter(|b| b.page == 1).collect();
        assert!(
            page1[0].text.contains("Albedo decline"),
            "premier bloc = titre, obtenu {:?}",
            page1[0].text
        );
        let intro = page1
            .iter()
            .position(|b| b.text.starts_with("1 Introduction"))
            .expect("bloc « 1 Introduction »");
        assert!(
            intro <= 3,
            "« 1 Introduction » doit tomber dans les 4 premiers blocs (index {intro}): {:?}",
            page1
                .iter()
                .take(5)
                .map(|b| b.text.clone())
                .collect::<Vec<_>>()
        );
        for b in &page1[1..intro] {
            assert!(
                b.text.contains("Fixture") || b.text.contains("Sample"),
                "entre le titre et l'introduction, seuls les auteurs: {:?}",
                b.text
            );
        }
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
        assert_eq!(doc.version, REFLOW_VERSION);
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

    /// Petit document synthétique : `body` lignes de corps 10 pt (pour que la
    /// taille de corps soit 10) plus les lignes passées en argument.
    fn doc_with(extra: Vec<Line>) -> Parsed {
        let mut lines: Vec<Line> = (0..40)
            .map(|i| Line {
                page: 1,
                bbox: [
                    57.0,
                    200.0 + i as f32 * 12.0,
                    293.0,
                    209.0 + i as f32 * 12.0,
                ],
                text: "corps de texte ordinaire assez long pour peser".into(),
                size: 10.0,
                family: "Times".into(),
            })
            .collect();
        lines.extend(extra);
        Parsed {
            pages: vec![PageDim { w: 595.0, h: 841.0 }],
            lines,
            images: vec![],
        }
    }

    #[test]
    fn titre_gras_de_taille_corps_est_un_titre_numerote() {
        let bold = |top: f32, t: &str| Line {
            page: 1,
            bbox: [57.0, top, 200.0, top + 10.0],
            text: t.into(),
            size: 10.0,
            family: "NimbusSanL-Bold".into(),
        };
        let doc = analyze(&doc_with(vec![
            bold(700.0, "2 Methods"),
            bold(730.0, "2.1 Study site"),
            bold(760.0, "Note that the results."),
        ]));
        let by = |t: &str| {
            doc.blocks
                .iter()
                .find(|b| b.text == t)
                .unwrap_or_else(|| panic!("bloc « {t} » absent"))
        };
        assert_eq!(by("2 Methods").kind, Kind::Heading);
        assert_eq!(by("2 Methods").level, Some(1));
        assert_eq!(by("2.1 Study site").kind, Kind::Heading);
        assert_eq!(by("2.1 Study site").level, Some(2));
        assert_eq!(
            by("Note that the results.").kind,
            Kind::Paragraph,
            "une phrase grasse finissant par un point n'est pas un titre"
        );
    }

    #[test]
    fn fragments_dexposant_supprimes_mais_pas_les_chiffres_de_corps() {
        let mark = |top: f32, t: &str, size: f32| Line {
            page: 1,
            bbox: [57.0, top, 70.0, top + size],
            text: t.into(),
            size,
            family: "Times".into(),
        };
        let wide = Line {
            page: 1,
            bbox: [57.0, 760.0, 100.0, 767.0],
            text: "0.62".into(),
            size: 7.0,
            family: "Times".into(),
        };
        let doc = analyze(&doc_with(vec![
            mark(700.0, "1,2", 7.0),
            mark(730.0, "1", 10.0),
            mark(745.0, "sd", 7.0),
            wide,
        ]));
        assert!(
            !doc.blocks.iter().any(|b| b.text == "1,2"),
            "marqueur d'affiliation gardé"
        );
        assert!(
            !doc.blocks.iter().any(|b| b.text == "sd"),
            "indice de variable orphelin gardé"
        );
        assert!(
            doc.blocks.iter().any(|b| b.text == "1"),
            "un « 1 » de corps ne doit pas disparaître"
        );
        assert!(
            doc.blocks.iter().any(|b| b.text == "0.62"),
            "une cellule de tableau (large) ne doit pas disparaître"
        );
    }

    #[test]
    fn fragment_de_math_en_ligne_ne_devient_pas_une_decoupe() {
        // Une équation EN LIGNE laissée seule par pdftohtml (un « α » de 5 pt
        // de large) donnait une découpe bitmap au milieu du flux ; une vraie
        // équation en ligne isolée, elle, reste `math`.
        let math = |top: f32, t: &str, x2: f32| Line {
            page: 1,
            bbox: [200.0, top, x2, top + 10.0],
            text: t.into(),
            size: 10.0,
            family: "XNZQWU+MTMI".into(),
        };
        let doc = analyze(&doc_with(vec![
            math(700.0, "\u{3b1}", 205.0),
            math(730.0, "Q = Q ( 1 \u{2212} \u{3b1} ) + Q", 400.0),
        ]));
        assert!(
            !doc.blocks
                .iter()
                .any(|b| b.kind == Kind::Math && b.bbox[2] - b.bbox[0] < 25.0),
            "fragment inline gardé comme découpe"
        );
        assert!(
            doc.blocks
                .iter()
                .any(|b| b.kind == Kind::Math && b.bbox[2] - b.bbox[0] > 100.0),
            "équation isolée perdue"
        );
    }

    #[test]
    fn numero_dequation_au_plus_trois_chiffres() {
        let line = |top: f32, t: &str| Line {
            page: 1,
            bbox: [57.0, top, 200.0, top + 10.0],
            text: t.into(),
            size: 10.0,
            family: "Times".into(),
        };
        let doc = analyze(&doc_with(vec![
            line(700.0, "Marshall (2014)"),
            line(730.0, "\u{3b1} = 1 (1)"),
        ]));
        let kind = |t: &str| {
            doc.blocks
                .iter()
                .find(|b| b.lines.iter().any(|l| l.text == t))
                .map(|b| b.kind)
        };
        assert_eq!(
            kind("Marshall (2014)"),
            Some(Kind::Paragraph),
            "une année de citation n'est pas un numéro d'équation"
        );
        assert_eq!(kind("\u{3b1} = 1 (1)"), Some(Kind::Math));
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
    fn un_paragraphe_fusionne_garde_la_page_de_chaque_ligne() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        let cross = doc
            .blocks
            .iter()
            .find(|b| {
                b.lines
                    .iter()
                    .any(|l| l.page != b.lines.first().map(|f| f.page).unwrap_or(0))
            })
            .expect("un paragraphe fusionné d'une page à l'autre");
        assert_eq!(cross.kind, Kind::Paragraph);
        let pages: std::collections::BTreeSet<u16> = cross.lines.iter().map(|l| l.page).collect();
        assert_eq!(pages.len(), 2, "lignes des deux pages: {pages:?}");
    }

    #[test]
    fn json_du_document_est_stable() {
        let p = parse_pdftohtml_xml(FIXTURE).unwrap();
        let doc = analyze(&p);
        let v = serde_json::to_value(&doc).unwrap();
        assert_eq!(v["version"], REFLOW_VERSION);
        assert!(v["blocks"][0]["kind"].is_string());
        assert!(v["blocks"][0]["lines"].is_array());
        assert!(
            v["blocks"][0]["lines"][0]["page"].is_number(),
            "chaque ligne porte sa page (paragraphe fusionné d'une page à l'autre)"
        );
        assert_eq!(
            v["blocks"][0]["kind"].as_str().unwrap(),
            v["blocks"][0]["kind"].as_str().unwrap().to_lowercase()
        );
    }

    #[test]
    fn message_de_delai_depasse_du_spawn() {
        // Le message exact que le handler renvoie en 502 (couvert de bout en
        // bout par `reflow_tue_un_pdftohtml_qui_traine_et_repond_502`).
        assert!(PDFTOHTML_TIMEOUT_MSG.contains("délai dépassé"));
        assert!(PDFTOHTML_TIMEOUT_MSG.contains("60 s"));
    }

    #[test]
    fn cache_valide_seulement_si_version_mtime_taille_correspondent() {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("a.pdf");
        std::fs::write(&pdf, b"%PDF-1.4 fixture").unwrap();
        let cache = cache_path_for(&pdf, dir.path(), false);
        assert!(cache.starts_with(dir.path().join(".fig_thumbs/reflow")));
        assert!(cache.extension().is_some_and(|e| e == "json"));
        let src = source_of(&pdf).unwrap();
        let doc = ReflowDoc {
            version: REFLOW_VERSION,
            source: src,
            pages: vec![],
            blocks: vec![],
        };
        write_cache(&cache, &doc).unwrap();
        assert!(read_cache(&cache, src).is_some());
        assert!(
            read_cache(
                &cache,
                Source {
                    mtime: src.mtime + 1,
                    ..src
                }
            )
            .is_none()
        );
        let mut stale = serde_json::to_value(&doc).unwrap();
        stale["version"] = serde_json::json!(0);
        std::fs::write(&cache, stale.to_string()).unwrap();
        assert!(read_cache(&cache, src).is_none());
    }

    #[test]
    fn cache_zotero_va_dans_application_support() {
        let pdf = std::path::Path::new("/tmp/x/storage/ABCD1234/a.pdf");
        let cache = cache_path_for(pdf, std::path::Path::new("/tmp/proj"), true);
        assert!(cache.starts_with(crate::zotero::zotero_cache_dir().join("reflow")));
    }
}
