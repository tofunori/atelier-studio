//! Outil `highlight_passage` : surligner un passage cité dans un PDF Zotero,
//! dans le store du lecteur d'Atelier (`pdf_annots.json`).
//!
//! La citation est retrouvée dans la couche texte de poppler
//! (`pdftotext -bbox-layout -cropbox`, un cadre par mot, en points depuis le
//! coin haut-gauche de la page) avec la même normalisation que la visionneuse
//! (`gallery/assets/pdf_passage.js` : NFKD, sans accents ni ponctuation), mais
//! en ignorant aussi les espaces, pour qu'une césure de fin de ligne
//! (« glaci- ers ») retrouve « glaciers ». Un rectangle par ligne, en fractions
//! de la page : le format que la visionneuse produit après `mergeLineRects`.
//!
//! L'écriture prend le même verrou que le serveur galerie
//! (`pdf_annots.lock`, `documents.rs`) puis remplace le fichier d'un bloc ; la
//! visionneuse ouverte le voit à la date du fichier (`/pdfannot-stamp`).

use crate::library::{self, fold, Config};
use crate::zotero;
use fs2::FileExt;
use serde_json::{json, Value};
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

/// En dessous, une citation désigne trop de passages pour être surlignée.
const MIN_NEEDLE_CHARS: usize = 12;
pub const MAX_PASSAGES: usize = 20;
const PDFTOTEXT_TIMEOUT: Duration = Duration::from_secs(60);

/// Les teintes du lecteur (`HL_COLORS` de `pdf_viewer.html`).
pub const COLORS: [(&str, &str); 4] = [
    ("jaune", "rgba(255,213,74,.40)"),
    ("vert", "rgba(120,220,140,.40)"),
    ("bleu", "rgba(120,170,255,.40)"),
    ("rose", "rgba(255,140,160,.40)"),
];

#[derive(Debug, Clone)]
pub struct Word {
    /// Ligne de poppler (numérotée sur tout le document).
    pub line: usize,
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
    let doc = roxmltree::Document::parse_with_options(xhtml, options)
        .map_err(|e| format!("sortie de pdftotext illisible : {e}"))?;
    let mut pages = Vec::new();
    let mut line_no = 0;
    for page in doc.descendants().filter(|n| n.tag_name().name() == "page") {
        let mut words = Vec::new();
        for line in page.descendants().filter(|n| n.tag_name().name() == "line") {
            line_no += 1;
            for word in line.children().filter(|n| n.tag_name().name() == "word") {
                let text = word.text().unwrap_or("").to_string();
                if text.trim().is_empty() {
                    continue;
                }
                words.push(Word {
                    line: line_no,
                    bbox: [
                        attr(word, "xMin"),
                        attr(word, "yMin"),
                        attr(word, "xMax"),
                        attr(word, "yMax"),
                    ],
                    text,
                });
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

/// Texte lisible d'une suite de mots : ligatures dépliées (NFKC) et césure
/// de fin de ligne recollée (« glaci- » + « ers » → « glaciers ») quand la
/// suite commence par une minuscule.
fn join_words(words: &[Word]) -> String {
    let mut out = String::new();
    let mut glue = false;
    for (i, w) in words.iter().enumerate() {
        let text: String = w.text.nfkc().collect();
        if i > 0 && !glue {
            out.push(' ');
        }
        let next = words.get(i + 1);
        let hyphen_break = text.ends_with('-')
            && next.is_some_and(|n| {
                n.line != w.line && n.text.chars().next().is_some_and(char::is_lowercase)
            });
        if hyphen_break {
            out.push_str(&text[..text.len() - 1]);
        } else {
            out.push_str(&text);
        }
        glue = hyphen_break;
    }
    out
}

fn pdftotext_bin() -> String {
    if let Some(bin) = std::env::var_os("ATELIER_PDFTOTEXT").filter(|v| !v.is_empty()) {
        return bin.to_string_lossy().into_owned();
    }
    // Claude Desktop lance le serveur avec un PATH réduit : poppler de
    // Homebrew n'y est pas.
    ["/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext"]
        .into_iter()
        .find(|p| Path::new(p).is_file())
        .unwrap_or("pdftotext")
        .to_string()
}

pub fn read_pdf(pdf: &Path) -> Result<Vec<Page>, String> {
    let bin = pdftotext_bin();
    let mut child = Command::new(&bin)
        .args(["-bbox-layout", "-cropbox", "-enc", "UTF-8", "-q"])
        .arg(pdf)
        .arg("-")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("pdftotext introuvable ({bin}) : {e} ; installer poppler"))?;
    let mut stdout = child.stdout.take().expect("stdout piped");
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut stdout, &mut buf).map(|_| buf)
    });
    let deadline = Instant::now() + PDFTOTEXT_TIMEOUT;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if Instant::now() > deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("pdftotext : délai dépassé (60 s)".into());
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let out = reader
        .join()
        .map_err(|_| "pdftotext : lecture interrompue".to_string())?
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!(
            "pdftotext a échoué ({status}) sur {}",
            pdf.display()
        ));
    }
    let pages = parse_bbox_layout(&String::from_utf8_lossy(&out))?;
    if pages.iter().all(|p| p.words.is_empty()) {
        return Err("aucun texte dans ce PDF (scan sans OCR ?)".into());
    }
    Ok(pages)
}

/// Un PDF Zotero : sa clé, son chemin dans le store (`zotero/<clé>/<fichier>`)
/// et sur disque.
pub struct Target {
    pub article: library::Article,
    pub rel: String,
    pub pdf: PathBuf,
}

/// Retrouve l'article voulu parmi les PDF de Zotero : clé exacte, ou tous
/// les mots de `wanted` dans la clé, la référence, le titre, les auteurs ou
/// l'année.
pub fn resolve(config: &Config, wanted: &str) -> Result<Target, String> {
    let (meta, _) = zotero::read(&config.zotero_dir, &config.cache_dir)
        .map_err(|e| format!("Zotero illisible : {e}"))?;
    let words: Vec<String> = fold(wanted)
        .split_whitespace()
        .map(str::to_string)
        .collect();
    if words.is_empty() {
        return Err(
            "Paramètre `article` requis (clé Zotero, auteur, année ou mots du titre).".into(),
        );
    }
    let mut found: Vec<Target> = meta
        .iter()
        .filter(|(_, m)| !m.file.is_empty())
        .filter_map(|(key, m)| {
            let rel = format!("zotero/{key}/{}", m.file);
            let article = library::article(key, Some(m), Some(&rel));
            let exact = key.eq_ignore_ascii_case(wanted.trim());
            let ident = fold(&format!(
                "{key} {} {} {} {}",
                article.citation, article.title, article.authors, article.year
            ));
            (exact || words.iter().all(|w| ident.contains(w.as_str()))).then(|| Target {
                pdf: config.zotero_dir.join("storage").join(key).join(&m.file),
                rel,
                article,
            })
        })
        .collect();
    if let Some(i) = found
        .iter()
        .position(|t| t.article.key.eq_ignore_ascii_case(wanted.trim()))
    {
        return Ok(found.swap_remove(i));
    }
    found.retain(|t| t.pdf.is_file());
    match found.len() {
        0 => Err(format!("Aucun PDF de Zotero ne correspond à « {wanted} ».")),
        1 => Ok(found.remove(0)),
        n => {
            found.sort_by(|a, b| a.article.citation.cmp(&b.article.citation));
            let list: Vec<String> = found
                .iter()
                .take(8)
                .map(|t| {
                    format!(
                        "- {} [{}] {}",
                        t.article.citation, t.article.key, t.article.title
                    )
                })
                .collect();
            Err(format!(
                "{n} articles correspondent à « {wanted} » ; relancer avec la clé entre crochets :\n{}",
                list.join("\n")
            ))
        }
    }
}

/// Ajoute `new` aux annotations de `rel`, sous le verrou du serveur galerie.
/// Un passage déjà surligné sur la même page n'est pas doublé : son index est
/// renvoyé dans la liste des doublons.
pub fn add_to_store(app_dir: &Path, rel: &str, new: Vec<Value>) -> Result<Vec<usize>, String> {
    std::fs::create_dir_all(app_dir).map_err(|e| e.to_string())?;
    let path = app_dir.join("pdf_annots.json");
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(app_dir.join("pdf_annots.lock"))
        .map_err(|e| e.to_string())?;
    lock.lock_exclusive().map_err(|e| e.to_string())?;
    let result = (|| {
        let mut store = match std::fs::read_to_string(&path) {
            // Un store illisible n'est jamais remplacé : ce serait tout perdre.
            Ok(raw) => serde_json::from_str::<Value>(&raw)
                .map_err(|e| format!("{} illisible, rien n'est écrit : {e}", path.display()))?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
            Err(e) => return Err(e.to_string()),
        };
        let Some(map) = store.as_object_mut() else {
            return Err(format!("{} n'est pas un objet JSON", path.display()));
        };
        let list = map.entry(rel.to_string()).or_insert_with(|| json!([]));
        let Some(list) = list.as_array_mut() else {
            return Err(format!("annotations de {rel} illisibles"));
        };
        let key = |a: &Value| {
            (
                a.get("page").and_then(Value::as_u64),
                norm(a.get("text").and_then(Value::as_str).unwrap_or("")),
            )
        };
        let mut duplicates = Vec::new();
        for (i, annot) in new.into_iter().enumerate() {
            if list.iter().any(|old| key(old) == key(&annot)) {
                duplicates.push(i);
            } else {
                list.push(annot);
            }
        }
        let payload = format!(
            "{}\n",
            serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?
        );
        let tmp = app_dir.join(format!(".pdf_annots.json.{}.mcp.tmp", std::process::id()));
        std::fs::write(&tmp, payload).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        Ok(duplicates)
    })();
    let _ = FileExt::unlock(&lock);
    result
}

pub struct Request {
    pub quote: String,
    pub page: Option<u32>,
    pub memo: String,
}

/// Surligne chaque passage de `requests` dans `target` ; renvoie le compte
/// rendu pour Claude.
pub fn highlight(
    config: &Config,
    target: &Target,
    pages: &[Page],
    requests: &[Request],
    color: &str,
) -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let mut report = Vec::new();
    let mut new = Vec::new();
    // index dans `new` → passage demandé
    let mut origin = Vec::new();
    for (i, req) in requests.iter().enumerate() {
        let label = short(&req.quote);
        let found = match find(pages, &req.quote, req.page) {
            Ok(found) => found,
            Err(e) => {
                report.push(format!("- « {label} » : {e}."));
                continue;
            }
        };
        let parts = parts(pages, &found);
        let where_ = parts
            .iter()
            .map(|p| p.page.to_string())
            .collect::<Vec<_>>()
            .join("-");
        let mut line = format!("- « {label} » : surligné p. {where_}");
        if !found.exact {
            line.push_str(" (début et fin retrouvés, milieu différent de la citation : vérifier)");
        }
        if found.occurrences > 1 {
            line.push_str(&format!(
                " ({} occurrences, {} ; préciser `page` pour une autre)",
                found.occurrences,
                if req.page.is_some() {
                    "la plus proche de la page donnée"
                } else {
                    "la première"
                }
            ));
        }
        report.push(line);
        for (k, part) in parts.into_iter().enumerate() {
            let mut annot = json!({
                "id": format!("{stamp}-c{i}p{}{}", part.page, if k > 0 { format!("-{k}") } else { String::new() }),
                "page": part.page,
                "rects": part.rects,
                "text": part.text,
                "kind": "hl",
                "color": color,
                "note": "",
                "by": "claude",
            });
            // la note va sur la première page du passage seulement
            if k == 0 && !req.memo.trim().is_empty() {
                annot["memo"] = json!(req.memo.trim());
            }
            new.push(annot);
            origin.push(report.len() - 1);
        }
    }
    if !new.is_empty() {
        let duplicates = add_to_store(&config.app_dir, &target.rel, new)?;
        let mut already: Vec<usize> = duplicates.iter().map(|&d| origin[d]).collect();
        already.dedup();
        for r in already {
            report[r].push_str(" — déjà surligné, rien d'ajouté");
        }
    }
    Ok(format!(
        "{} [{}] :\n{}\nVisible dans le lecteur d'Atelier en quelques secondes si l'article y est ouvert, sinon à sa prochaine ouverture.",
        target.article.citation,
        target.article.key,
        report.join("\n")
    ))
}

fn short(quote: &str) -> String {
    let words: Vec<&str> = quote.split_whitespace().collect();
    if words.len() <= 8 {
        words.join(" ")
    } else {
        format!("{} …", words[..8].join(" "))
    }
}

pub fn color_value(name: &str) -> Result<&'static str, String> {
    let name = fold(name.trim());
    if name.is_empty() {
        return Ok(COLORS[0].1);
    }
    COLORS
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, v)| *v)
        .ok_or_else(|| format!("couleur inconnue « {name} » : jaune, vert, bleu ou rose"))
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

    #[test]
    fn the_store_gets_new_highlights_once_and_keeps_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let rel = "zotero/ABCD1234/paper.pdf";
        std::fs::write(
            dir.path().join("pdf_annots.json"),
            json!({"other.pdf": [{"id": "x"}], rel: [{"id": "a", "page": 1, "text": "Old"}]})
                .to_string(),
        )
        .unwrap();
        let hl = |id: &str| json!({"id": id, "page": 2, "text": "Black carbon", "kind": "hl"});
        assert!(add_to_store(dir.path(), rel, vec![hl("b")])
            .unwrap()
            .is_empty());
        assert_eq!(
            add_to_store(dir.path(), rel, vec![hl("c")]).unwrap(),
            vec![0]
        );
        let store: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("pdf_annots.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(store["other.pdf"][0]["id"], "x");
        let ids: Vec<&str> = store[rel]
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["a", "b"]);
    }

    #[test]
    fn an_unreadable_store_is_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("pdf_annots.json"), "{ cassé").unwrap();
        assert!(add_to_store(dir.path(), "zotero/ABCD1234/p.pdf", vec![json!({})]).is_err());
        assert_eq!(
            std::fs::read_to_string(dir.path().join("pdf_annots.json")).unwrap(),
            "{ cassé"
        );
    }
}
