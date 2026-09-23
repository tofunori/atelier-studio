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
    // « Fire and Ice » : chaque mot se retrouve dans plusieurs articles, mais
    // un seul titre (ou référence) contient l'expression entière.
    if found.len() > 1 {
        let phrase = fold(wanted.trim());
        let whole: Vec<usize> = (0..found.len())
            .filter(|&i| {
                let a = &found[i].article;
                fold(&a.title).contains(&phrase) || fold(&a.citation).contains(&phrase)
            })
            .collect();
        if let [i] = whole[..] {
            return Ok(found.swap_remove(i));
        }
    }
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

/// Ouvre le store sous le verrou du serveur galerie, laisse `op` changer les
/// annotations, et ne réécrit le fichier (d'un bloc) que si `op` dit l'avoir
/// changé.
fn with_store<T>(
    app_dir: &Path,
    op: impl FnOnce(&mut serde_json::Map<String, Value>) -> Result<(T, bool), String>,
) -> Result<T, String> {
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
        let (value, changed) = op(map)?;
        if changed {
            let payload = format!(
                "{}\n",
                serde_json::to_string_pretty(&store).map_err(|e| e.to_string())?
            );
            let tmp = app_dir.join(format!(".pdf_annots.json.{}.mcp.tmp", std::process::id()));
            std::fs::write(&tmp, payload).map_err(|e| e.to_string())?;
            std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        }
        Ok(value)
    })();
    let _ = FileExt::unlock(&lock);
    result
}

/// Ajoute `new` aux annotations de `rel`, sous le verrou du serveur galerie.
/// Un passage déjà surligné sur la même page n'est pas doublé : son index est
/// renvoyé dans la liste des doublons.
pub fn add_to_store(app_dir: &Path, rel: &str, new: Vec<Value>) -> Result<Vec<usize>, String> {
    with_store(app_dir, |map| {
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
        Ok((duplicates, true))
    })
}

/// Ce que `edit_highlights` fait aux surlignages retrouvés.
pub enum Edit {
    Remove,
    /// `None` = inchangé ; une note vide retire la note.
    Update {
        color: Option<&'static str>,
        memo: Option<String>,
    },
}

/// Un passage surligné par Claude peut couvrir plusieurs pages, donc plusieurs
/// annotations (`{ms}-c{i}p{page}`, `…p{page}-{k}`) : elles partagent tout ce
/// qui précède le dernier `p`.
fn highlight_group(id: &str) -> &str {
    id.rfind('p').map_or(id, |i| &id[..i])
}

fn by_claude(a: &Value) -> bool {
    a.get("by").and_then(Value::as_str) == Some("claude")
}

/// Modifie ou supprime des surlignages POSÉS PAR CLAUDE (`by: "claude"`) :
/// ceux que Thierry a faits lui-même ne sont jamais touchés. `requests` les
/// désigne par leur texte (et leur page) ; `all` les prend tous dans l'article.
pub fn edit_highlights(
    config: &Config,
    target: &Target,
    requests: &[Request],
    all: bool,
    edit: &Edit,
) -> Result<String, String> {
    let rel = target.rel.clone();
    let report = with_store(&config.app_dir, |map| {
        let Some(list) = map.get_mut(&rel).and_then(Value::as_array_mut) else {
            return Ok((
                vec!["- aucun surlignage dans cet article.".to_string()],
                false,
            ));
        };
        // groupes de Claude, dans l'ordre du store : (clé, pages, texte normalisé)
        let mut groups: Vec<(String, Vec<u64>, String)> = Vec::new();
        for a in list.iter().filter(|a| by_claude(a)) {
            let Some(id) = a.get("id").and_then(Value::as_str) else {
                continue;
            };
            let key = highlight_group(id).to_string();
            let page = a.get("page").and_then(Value::as_u64).unwrap_or(0);
            let text = norm(a.get("text").and_then(Value::as_str).unwrap_or(""));
            match groups.iter_mut().find(|g| g.0 == key) {
                Some(g) => {
                    g.1.push(page);
                    g.2.push_str(&text);
                }
                None => groups.push((key, vec![page], text)),
            }
        }
        let mut chosen: Vec<String> = Vec::new();
        let mut report = Vec::new();
        let verb = match edit {
            Edit::Remove => "supprimé",
            Edit::Update { .. } => "modifié",
        };
        let pages_of = |g: &(String, Vec<u64>, String)| {
            let mut pages = g.1.clone();
            pages.sort_unstable();
            pages.dedup();
            pages
                .iter()
                .map(u64::to_string)
                .collect::<Vec<_>>()
                .join("-")
        };
        if all {
            for g in &groups {
                chosen.push(g.0.clone());
            }
            report.push(format!(
                "- {} surlignage(s) de Claude {verb}(s).",
                groups.len()
            ));
        }
        for req in requests {
            let label = short(&req.quote);
            let needle = norm(&req.quote);
            if needle.chars().count() < MIN_NEEDLE_CHARS {
                report.push(format!(
                    "- « {label} » : citation trop courte pour désigner un surlignage."
                ));
                continue;
            }
            let matches = |text: &str, pages: &[u64]| {
                !text.is_empty()
                    && (text.contains(&needle) || needle.contains(text))
                    && req.page.is_none_or(|p| pages.contains(&(p as u64)))
            };
            let hits: Vec<&(String, Vec<u64>, String)> =
                groups.iter().filter(|g| matches(&g.2, &g.1)).collect();
            if hits.is_empty() {
                let theirs = list.iter().any(|a| {
                    !by_claude(a)
                        && matches(
                            &norm(a.get("text").and_then(Value::as_str).unwrap_or("")),
                            &[a.get("page").and_then(Value::as_u64).unwrap_or(0)],
                        )
                });
                report.push(if theirs {
                    format!(
                        "- « {label} » : c'est un surlignage de Thierry, Claude n'y touche pas."
                    )
                } else {
                    format!("- « {label} » : aucun surlignage de Claude ne correspond.")
                });
                continue;
            }
            let pages: Vec<String> = hits.iter().map(|g| pages_of(g)).collect();
            report.push(format!("- « {label} » : {verb} p. {}", pages.join(", p. ")));
            for g in hits {
                if !chosen.contains(&g.0) {
                    chosen.push(g.0.clone());
                }
            }
        }
        if chosen.is_empty() {
            return Ok((report, false));
        }
        let in_chosen = |a: &Value| {
            by_claude(a)
                && a.get("id")
                    .and_then(Value::as_str)
                    .is_some_and(|id| chosen.iter().any(|k| k == highlight_group(id)))
        };
        match edit {
            Edit::Remove => list.retain(|a| !in_chosen(a)),
            Edit::Update { color, memo } => {
                let mut first_seen: Vec<String> = Vec::new();
                for a in list.iter_mut().filter(|a| in_chosen(a)) {
                    let key = highlight_group(a["id"].as_str().unwrap_or("")).to_string();
                    let first = !first_seen.contains(&key);
                    if first {
                        first_seen.push(key);
                    }
                    let Some(obj) = a.as_object_mut() else {
                        continue;
                    };
                    if let Some(color) = color {
                        obj.insert("color".into(), json!(color));
                    }
                    if let Some(memo) = memo {
                        // la note vit sur la première annotation du passage
                        if first && is_real_memo(memo) {
                            obj.insert("memo".into(), json!(memo.trim()));
                        } else {
                            obj.remove("memo");
                        }
                    }
                }
            }
        }
        Ok((report, true))
    })?;
    Ok(format!(
        "{} [{}] :\n{}\nVisible dans le lecteur d'Atelier en quelques secondes si l'article y est ouvert.",
        target.article.citation,
        target.article.key,
        report.join("\n")
    ))
}

pub struct Request {
    pub quote: String,
    pub page: Option<u32>,
    pub memo: String,
    /// Couleur propre à ce passage (`None` = celle de l'appel).
    pub color: Option<&'static str>,
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
                "color": req.color.unwrap_or(color),
                "note": "",
                "by": "claude",
            });
            // la note va sur la première page du passage seulement ; « Claude »
            // n'en est pas une (l'origine est dans `by`)
            if k == 0 && is_real_memo(&req.memo) {
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

fn is_real_memo(memo: &str) -> bool {
    let memo = fold(memo.trim());
    !memo.is_empty() && memo != "claude"
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

    #[test]
    fn claude_is_not_a_note() {
        assert!(!is_real_memo(" Claude "));
        assert!(!is_real_memo(""));
        assert!(is_real_memo(
            "pour la discussion : limite de la quantification"
        ));
    }
}
