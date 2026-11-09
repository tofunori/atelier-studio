//! Retrouver un passage cité dans la couche texte d'un PDF.
//!
//! La citation est retrouvée dans la sortie de `atelier-pdf bbox` (le format
//! de `pdftotext -bbox-layout -cropbox` : un cadre par mot, en points depuis
//! le coin haut-gauche de la page) avec la même normalisation que la
//! visionneuse (`gallery/assets/pdf_passage.js` : NFKD, sans accents ni
//! ponctuation), mais en ignorant aussi les espaces, pour qu'une césure de fin
//! de ligne (« glaci- ers ») retrouve « glaciers ». Un rectangle par ligne, en
//! fractions de la page : le format que la visionneuse produit après
//! `mergeLineRects`.
//!
//! Partagé par le serveur MCP des annotations (Claude Desktop) et l'outil
//! d'annotation de l'agent du chat (`atelier-runtime`).

use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

/// En dessous, une citation désigne trop de passages pour être annotée.
pub const MIN_NEEDLE_CHARS: usize = 12;
const READ_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone)]
pub struct Word {
    /// Ligne de poppler (numérotée sur tout le document).
    pub line: usize,
    /// Bloc de poppler (paragraphe ; numéroté sur tout le document).
    pub block: usize,
    /// Exposant ou indice collé au mot précédent (« g−1 », « km2 », « 1◦ ») :
    /// petit, décalé de la ligne de base et sans vraie espace avant.
    pub attached: bool,
    /// [x0, y0, x1, y1] en points, origine haut-gauche.
    pub bbox: [f64; 4],
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct Page {
    pub number: u32,
    pub width: f64,
    pub height: f64,
    pub words: Vec<Word>,
}

fn attr(node: roxmltree::Node, name: &str) -> f64 {
    node.attribute(name)
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0)
}

/// Sortie XHTML de `pdftotext -bbox-layout` → pages et mots.
pub fn parse_bbox_layout(xhtml: &str) -> Result<Vec<Page>, String> {
    let options = roxmltree::ParsingOptions {
        allow_dtd: true,
        ..Default::default()
    };
    // poppler laisse passer des caractères de contrôle (« \u{7} » dans certains
    // PDF Wiley) que XML interdit : ils deviennent des espaces.
    let cleaned: String;
    let xhtml = if xhtml
        .chars()
        .any(|c| c.is_control() && !matches!(c, '\t' | '\n' | '\r'))
    {
        cleaned = xhtml
            .chars()
            .map(|c| {
                if c.is_control() && !matches!(c, '\t' | '\n' | '\r') {
                    ' '
                } else {
                    c
                }
            })
            .collect();
        &cleaned
    } else {
        xhtml
    };
    let doc = roxmltree::Document::parse_with_options(xhtml, options)
        .map_err(|e| format!("sortie de pdftotext illisible : {e}"))?;
    let mut pages = Vec::new();
    let mut line_no = 0;
    let mut block_no = 0;
    for page in doc.descendants().filter(|n| n.tag_name().name() == "page") {
        let mut words = Vec::new();
        for block in page
            .descendants()
            .filter(|n| n.tag_name().name() == "block")
        {
            block_no += 1;
            for line in block.children().filter(|n| n.tag_name().name() == "line") {
                line_no += 1;
                let first = words.len();
                for word in line.children().filter(|n| n.tag_name().name() == "word") {
                    let text = word.text().unwrap_or("").to_string();
                    if text.trim().is_empty() {
                        continue;
                    }
                    words.push(Word {
                        line: line_no,
                        block: block_no,
                        attached: false,
                        bbox: [
                            attr(word, "xMin"),
                            attr(word, "yMin"),
                            attr(word, "xMax"),
                            attr(word, "yMax"),
                        ],
                        text,
                    });
                }
                mark_scripts(&mut words[first..]);
            }
        }
        pages.push(Page {
            number: pages.len() as u32 + 1,
            width: attr(page, "width"),
            height: attr(page, "height"),
            words,
        });
    }
    Ok(pages)
}

/// Marque les exposants et indices d'une ligne : nettement plus petits que le
/// plus grand mot de la ligne, décalés de sa ligne de base ou de son haut, et
/// presque collés au mot précédent.
fn mark_scripts(line: &mut [Word]) {
    let height = |w: &Word| w.bbox[3] - w.bbox[1];
    let Some(tall) = line.iter().map(height).reduce(f64::max) else {
        return;
    };
    let bottom = line.iter().map(|w| w.bbox[3]).fold(f64::MIN, f64::max);
    let top = line.iter().map(|w| w.bbox[1]).fold(f64::MAX, f64::min);
    for i in 1..line.len() {
        let w = &line[i];
        let small = height(w) < 0.75 * tall;
        let shifted = w.bbox[3] < bottom - 0.15 * tall || w.bbox[1] > top + 0.15 * tall;
        let close = w.bbox[0] - line[i - 1].bbox[2] < 0.5 * tall;
        line[i].attached = small && shifted && close;
    }
}

/// Lettres et chiffres seulement, sans accents, en minuscules ; les ligatures
/// (« ﬁ ») redeviennent deux lettres.
pub fn norm(text: &str) -> String {
    text.nfkd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Un passage retrouvé : indices (page, mot) du premier et du dernier mot.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Found {
    pub start: (usize, usize),
    pub end: (usize, usize),
    /// Faux quand seuls le début et la fin de la citation ont été retrouvés.
    pub exact: bool,
    /// Nombre d'endroits où la citation exacte apparaît.
    pub occurrences: usize,
}

struct Stream {
    chars: Vec<char>,
    owner: Vec<(usize, usize)>,
}

fn stream(pages: &[Page]) -> Stream {
    let mut chars = Vec::new();
    let mut owner = Vec::new();
    for (p, page) in pages.iter().enumerate() {
        for (w, word) in page.words.iter().enumerate() {
            for c in norm(&word.text).chars() {
                chars.push(c);
                owner.push((p, w));
            }
        }
    }
    Stream { chars, owner }
}

fn positions(hay: &[char], needle: &[char], from: usize, to: usize) -> Vec<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return Vec::new();
    }
    let last = hay.len() - needle.len();
    (from..=last.min(to))
        .filter(|&i| hay[i..i + needle.len()] == *needle)
        .collect()
}

/// Cherche `quote` ; à plusieurs endroits, garde celui de la page `page`
/// (ou la plus proche), sinon le premier. Faute de citation exacte (un mot
/// mal recopié, une note de bas de page intercalée), accepte un passage dont
/// le début et la fin correspondent et dont la longueur reste proche.
pub fn find(pages: &[Page], quote: &str, page: Option<u32>) -> Result<Found, String> {
    let needle: Vec<char> = norm(quote).chars().collect();
    if needle.len() < MIN_NEEDLE_CHARS {
        return Err("citation trop courte : donner au moins quelques mots exacts".into());
    }
    let s = stream(pages);
    let page_of = |i: usize| pages[s.owner[i].0].number;
    let pick = |starts: &[usize]| -> Option<usize> {
        match page {
            Some(p) => starts
                .iter()
                .copied()
                .min_by_key(|&i| (page_of(i) as i64 - p as i64).abs()),
            None => starts.first().copied(),
        }
    };
    let exact = positions(&s.chars, &needle, 0, usize::MAX);
    if let Some(start) = pick(&exact) {
        return Ok(Found {
            start: s.owner[start],
            end: s.owner[start + needle.len() - 1],
            exact: true,
            occurrences: exact.len(),
        });
    }
    let words: Vec<String> = quote
        .split_whitespace()
        .map(norm)
        .filter(|w| !w.is_empty())
        .collect();
    let max_n = words.len().saturating_sub(1).min(12);
    for n in (4..=max_n).rev() {
        let head: Vec<char> = words[..n].concat().chars().collect();
        let tail: Vec<char> = words[words.len() - n..].concat().chars().collect();
        let mut spans = Vec::new();
        for h in positions(&s.chars, &head, 0, usize::MAX) {
            let lo = h + needle.len() * 7 / 10;
            let hi = h + needle.len() * 3 / 2;
            if let Some(t) = positions(&s.chars, &tail, lo.saturating_sub(tail.len()), hi)
                .into_iter()
                .find(|&t| t + tail.len() >= lo && t + tail.len() <= hi)
            {
                spans.push((h, t + tail.len() - 1));
            }
        }
        let starts: Vec<usize> = spans.iter().map(|(h, _)| *h).collect();
        if let Some(start) = pick(&starts) {
            let end = spans
                .iter()
                .find(|(h, _)| *h == start)
                .map(|(_, e)| *e)
                .unwrap_or(start);
            return Ok(Found {
                start: s.owner[start],
                end: s.owner[end],
                exact: false,
                occurrences: 0,
            });
        }
    }
    Err("passage introuvable dans le texte du PDF".into())
}

/// Une annotation par page couverte : rectangles par ligne et texte.
pub struct PagePart {
    pub page: u32,
    pub rects: Vec<[f64; 4]>,
    pub text: String,
}

fn round(v: f64) -> f64 {
    (v * 1e6).round() / 1e6
}

pub fn parts(pages: &[Page], found: &Found) -> Vec<PagePart> {
    let mut out = Vec::new();
    for p in found.start.0..=found.end.0 {
        let page = &pages[p];
        let first = if p == found.start.0 { found.start.1 } else { 0 };
        let last = if p == found.end.0 {
            found.end.1
        } else {
            page.words.len().saturating_sub(1)
        };
        if page.words.is_empty() || first > last || page.width <= 0.0 || page.height <= 0.0 {
            continue;
        }
        let words = &page.words[first..=last];
        let mut rects: Vec<[f64; 4]> = Vec::new();
        let mut current: Option<(usize, [f64; 4])> = None;
        for w in words {
            current = match current {
                Some((line, b)) if line == w.line => Some((
                    line,
                    [
                        b[0].min(w.bbox[0]),
                        b[1].min(w.bbox[1]),
                        b[2].max(w.bbox[2]),
                        b[3].max(w.bbox[3]),
                    ],
                )),
                other => {
                    if let Some((_, b)) = other {
                        rects.push(b);
                    }
                    Some((w.line, w.bbox))
                }
            };
        }
        if let Some((_, b)) = current {
            rects.push(b);
        }
        let (w, h) = (page.width, page.height);
        out.push(PagePart {
            page: page.number,
            rects: rects
                .iter()
                .map(|b| {
                    [
                        round(b[0] / w),
                        round(b[1] / h),
                        round((b[2] - b[0]) / w),
                        round((b[3] - b[1]) / h),
                    ]
                })
                .collect(),
            text: join_words(words),
        });
    }
    out
}

/// Texte lisible d'une suite de mots : ligatures dépliées (NFKC), césure de
/// fin de ligne recollée (« glaci- » + « ers » → « glaciers » quand la suite
/// commence par une minuscule ; toujours pour un trait d'union conditionnel,
/// « al\u{ad} » + « bedo » → « albedo ») et exposants collés (« g−1 »).
pub fn join_words(words: &[Word]) -> String {
    let mut out = String::new();
    let mut glue = false;
    for (i, w) in words.iter().enumerate() {
        let text: String = w.text.nfkc().collect();
        if i > 0 && !glue && !w.attached {
            out.push(' ');
        }
        let next_line = words.get(i + 1).filter(|n| n.line != w.line);
        let soft = text.ends_with('\u{ad}') && next_line.is_some();
        let hard = text.ends_with('-')
            && next_line.is_some_and(|n| n.text.chars().next().is_some_and(char::is_lowercase));
        let body = if soft || hard {
            &text[..text.len() - text.chars().last().map_or(0, char::len_utf8)]
        } else {
            &text[..]
        };
        out.push_str(&body.replace('\u{ad}', ""));
        glue = soft || hard;
    }
    out
}

/// Texte d'une page, un paragraphe (bloc de poppler) par ligne.
pub fn page_text(page: &Page) -> String {
    let mut out = Vec::new();
    let mut start = 0;
    for i in 1..=page.words.len() {
        if i == page.words.len() || page.words[i].block != page.words[start].block {
            out.push(join_words(&page.words[start..i]));
            start = i;
        }
    }
    out.retain(|p| !p.trim().is_empty());
    out.join("\n\n")
}

pub fn read_pdf(pdf: &Path) -> Result<Vec<Page>, String> {
    let (mut command, program) = crate::tool::command(crate::tool::Output::WordBoxes, pdf);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| crate::tool::spawn_error(&program, &e))?;
    let mut stdout = child.stdout.take().expect("stdout piped");
    let mut stderr = child.stderr.take().expect("stderr piped");
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut stdout, &mut buf).map(|_| buf)
    });
    let errors = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::Read::read_to_end(&mut stderr, &mut buf);
        buf
    });
    let deadline = Instant::now() + READ_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("lecture du PDF : délai dépassé (60 s)".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let out = reader
        .join()
        .map_err(|_| "lecture du PDF interrompue".to_string())?
        .map_err(|e| e.to_string())?;
    if !status.success() {
        let why = String::from_utf8_lossy(&errors.join().unwrap_or_default()).trim().to_string();
        return Err(format!(
            "lecture du PDF impossible ({status}) : {}{}",
            pdf.display(),
            if why.is_empty() { String::new() } else { format!(" ; {why}") }
        ));
    }
    let pages = parse_bbox_layout(&String::from_utf8_lossy(&out))?;
    if pages.iter().all(|p| p.words.is_empty()) {
        return Err("aucun texte dans ce PDF (scan sans OCR ?)".into());
    }
    Ok(pages)
}


#[cfg(test)]
mod tests {
    use super::*;

    const XHTML: &str = r#"<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml">
<head><title></title></head><body><doc>
  <page width="600.000000" height="800.000000"><flow><block>
    <line><word xMin="100" yMin="100" xMax="140" yMax="110">Black</word><word xMin="145" yMin="100" xMax="190" yMax="110">carbon</word><word xMin="195" yMin="100" xMax="240" yMax="110">lowers</word><word xMin="245" yMin="100" xMax="300" yMax="110">glaci-</word></line>
    <line><word xMin="100" yMin="114" xMax="130" yMax="124">ers&#8217;</word><word xMin="135" yMin="114" xMax="200" yMax="124">ﬁrst-order</word><word xMin="205" yMin="114" xMax="250" yMax="124">albedo.</word></line>
  </block></flow></page>
  <page width="600.000000" height="800.000000"><flow><block>
    <line><word xMin="50" yMin="40" xMax="90" yMax="50">Black</word><word xMin="95" yMin="40" xMax="140" yMax="50">carbon</word><word xMin="145" yMin="40" xMax="190" yMax="50">lowers</word><word xMin="195" yMin="40" xMax="260" yMax="50">glaciers</word></line>
    <line><word xMin="50" yMin="54" xMax="90" yMax="64">again</word><word xMin="95" yMin="54" xMax="140" yMax="64">here.</word></line>
  </block></flow></page>
  <page width="600.000000" height="800.000000"><flow><block>
    <line><word xMin="50" yMin="40" xMax="80" yMax="50">Snow</word><word xMin="85" yMin="40" xMax="110" yMax="50">grain</word><word xMin="115" yMin="40" xMax="140" yMax="50">size</word><word xMin="145" yMin="40" xMax="190" yMax="50">increases</word><word xMin="195" yMin="40" xMax="215" yMax="50">with</word><word xMin="220" yMin="40" xMax="240" yMax="50">age</word></line>
    <line><word xMin="50" yMin="54" xMax="70" yMax="64">and</word><word xMin="75" yMin="54" xMax="95" yMax="64">this</word><word xMin="100" yMin="54" xMax="140" yMax="64">reduces</word><word xMin="145" yMin="54" xMax="160" yMax="64">the</word><word xMin="165" yMin="54" xMax="240" yMax="64">near-infrared</word><word xMin="245" yMin="54" xMax="285" yMax="64">albedo</word><word xMin="290" yMin="54" xMax="340" yMax="64">strongly.</word></line>
  </block></flow></page>
</doc></body></html>"#;

    #[test]
    fn parses_pages_words_and_lines() {
        let pages = parse_bbox_layout(XHTML).unwrap();
        assert_eq!(pages.len(), 3);
        assert_eq!(pages[0].words.len(), 7);
        assert_eq!(pages[0].words[4].text, "ers\u{2019}");
        assert_ne!(pages[0].words[0].line, pages[0].words[4].line);
        assert_eq!(pages[1].number, 2);
    }

    #[test]
    fn a_hyphenated_quote_with_a_ligature_becomes_one_rect_per_line() {
        let pages = parse_bbox_layout(XHTML).unwrap();
        let found = find(&pages, "carbon lowers glaciers' first-order albedo", None).unwrap();
        assert!(found.exact);
        assert_eq!(found.occurrences, 1);
        let parts = parts(&pages, &found);
        assert_eq!(parts.len(), 1);
        assert_eq!(parts[0].page, 1);
        assert_eq!(
            parts[0].text,
            "carbon lowers glaciers\u{2019} first-order albedo."
        );
        assert_eq!(
            parts[0].rects,
            vec![
                [round(145.0 / 600.0), 0.125, round(155.0 / 600.0), 0.0125],
                [round(100.0 / 600.0), round(114.0 / 800.0), 0.25, 0.0125],
            ]
        );
    }

    #[test]
    fn several_occurrences_follow_the_page_hint() {
        let pages = parse_bbox_layout(XHTML).unwrap();
        let first = find(&pages, "Black carbon lowers glaciers", None).unwrap();
        assert_eq!(first.occurrences, 2);
        assert_eq!(first.start.0, 0);
        let second = find(&pages, "Black carbon lowers glaciers", Some(2)).unwrap();
        assert_eq!(second.start, (1, 0));
        assert_eq!(second.end, (1, 3));
    }

    #[test]
    fn a_quote_with_a_different_middle_is_anchored_by_its_ends() {
        let pages = parse_bbox_layout(XHTML).unwrap();
        let found = find(
            &pages,
            "Snow grain size increases as it ages, and this reduces the near-infrared albedo strongly",
            None,
        )
        .unwrap();
        assert!(!found.exact);
        assert_eq!(found.start, (2, 0));
        assert_eq!(found.end, (2, 12));
        assert!(
            find(
                &pages,
                "Black carbon lowers glaciers again here now",
                Some(2)
            )
            .is_err(),
            "the end must match too"
        );
        assert!(find(&pages, "something that is not in the text at all", None).is_err());
        assert!(find(&pages, "Black", None).is_err(), "too short");
    }

    /// Deux paragraphes : un trait d'union conditionnel en fin de ligne, puis
    /// des exposants (« g−1 », « km2 ») comme dans les articles Elsevier.
    const SCRIPTS: &str = r#"<html xmlns="http://www.w3.org/1999/xhtml"><body><doc>
  <page width="600.000000" height="800.000000"><flow>
    <block>
      <line><word xMin="37" yMin="700" xMax="60" yMax="713">low</word><word xMin="64" yMin="700" xMax="80" yMax="713">al&#173;</word></line>
      <line><word xMin="37" yMin="714" xMax="55" yMax="727">bedo</word><word xMin="58" yMin="714" xMax="80" yMax="727">values</word></line>
    </block>
    <block>
      <line><word xMin="75" yMin="433.46" xMax="83.76" yMax="446.49">ng</word><word xMin="87.19" yMin="433.46" xMax="91.37" yMax="446.49">g</word><word xMin="91.33" yMin="435.17" xMax="92.82" yMax="440.56">&#8722;</word><word xMin="95.98" yMin="432.33" xMax="99.34" yMax="442.10">1</word><word xMin="103" yMin="433.46" xMax="120" yMax="446.49">over</word><word xMin="124" yMin="433.46" xMax="140" yMax="446.49">km</word><word xMin="140.5" yMin="432.33" xMax="143.5" yMax="440.1">2</word></line>
    </block>
  </flow></page>
</doc></body></html>"#;

    #[test]
    fn control_characters_from_poppler_do_not_break_parsing() {
        let xhtml = XHTML.replace(
            ">Black</word><word xMin=\"145\"",
            ">Bl\u{7}ack</word><word xMin=\"145\"",
        );
        let pages = parse_bbox_layout(&xhtml).unwrap();
        assert_eq!(pages[0].words[0].text, "Bl ack");
    }

    #[test]
    fn soft_hyphens_and_exponents_read_like_the_article() {
        let pages = parse_bbox_layout(SCRIPTS).unwrap();
        let words = &pages[0].words;
        assert!(!words[1].attached && !words[5].attached);
        assert!(
            words[6].attached && words[7].attached,
            "− and 1 are an exponent"
        );
        assert!(!words[8].attached, "the next word keeps its space");
        assert_eq!(
            page_text(&pages[0]),
            "low albedo values\n\nng g\u{2212}1 over km2"
        );
        let found = find(&pages, "low albedo values", None).unwrap();
        assert!(found.exact);
        assert_eq!(parts(&pages, &found)[0].text, "low albedo values");
    }
}
