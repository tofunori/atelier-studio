//! Port de `sidecar/article.mjs` (plan 065, vague 2, groupe c) : import
//! d'article PDF → brouillon + fiche vérifiable → page gbrain. MinerU réel
//! (API cloud) est HORS PÉRIMÈTRE de cette vague — `resolve_mineru` détecte
//! juste son absence (comme sur toute machine sans jeton configuré) et le
//! moteur retombe TOUJOURS sur l'extraction locale (`pdftotext`, motif
//! "spawns inchangés"), exactement le chemin fixturé par
//! `kb_parity/fixtures/c-article-local.json`.

use crate::gbrain::{self, SpawnOutcome};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

pub use crate::article_meta::ArticleMeta;

pub const ARTICLE_DRAFT_DIR: &str = "article-drafts";
const ARTICLE_PAGE_MAX: usize = 400_000;
const ARTICLE_PREVIEW_MAX: usize = 4000;
const DRAFT_TTL_MS: u128 = 7 * 24 * 3600 * 1000;
pub const DUPLICATE_OVERLAP: f64 = 0.6;
const RAGDOC_TIMEOUT_MS: u64 = 120_000;
const RAGDOC_DIR: &str = "/volume1/Services/mcp/ragdoc";
const RAGDOC_PYTHON: &str = "/volume1/Services/mcp/ragdoc/ragdoc-env-new/bin/python";

fn take_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

// --- conversion -------------------------------------------------------

pub struct MineruResolution {
    pub script: Option<String>,
    pub reason: Option<String>,
}

/// Miroir de `resolveMineru` : détecte seulement l'absence du script/jeton
/// (comme sur toute machine sans MinerU configuré). Ne spawn JAMAIS le
/// script Python — la conversion cloud réelle reste hors périmètre (voir
/// l'en-tête du module).
pub fn resolve_mineru() -> MineruResolution {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    let script = std::env::var("ATELIER_MINERU_SCRIPT")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("{home}/.claude/skills/mineru-pdf/mineru_convert.py"));
    if !Path::new(&script).exists() {
        return MineruResolution { script: None, reason: Some(format!("script MinerU introuvable ({script})")) };
    }
    if !Path::new(&format!("{home}/.mineru_token")).exists() {
        return MineruResolution { script: None, reason: Some("token MinerU absent (~/.mineru_token)".to_string()) };
    }
    MineruResolution { script: Some(script), reason: None }
}

pub struct ConvertResult {
    pub markdown: String,
    pub converter: String,
    pub warning: Option<String>,
}

/// PDF → markdown, miroir de la branche locale de `convertPdf` (le repli
/// utilisé dès que MinerU est indisponible — TOUJOURS le cas ici).
pub fn convert_pdf(path: &Path, pdf_cache_dir: &Path) -> Result<ConvertResult, String> {
    if !path.exists() {
        return Err(format!("PDF introuvable: {}", path.display()));
    }
    static PDF_EXT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\.pdf$").unwrap());
    if !PDF_EXT_RE.is_match(&path.to_string_lossy()) {
        return Err(format!("Un PDF est attendu: {}", path.display()));
    }
    let mineru = resolve_mineru();
    let warning = Some(mineru.reason.clone().unwrap_or_else(|| {
        "MinerU non pris en charge par ce moteur (vague 2, plan 065) — extraction locale".to_string()
    }));
    let extracted = crate::pdf::extract_pdf_pages(path, pdf_cache_dir)?;
    let markdown = extracted
        .pages
        .iter()
        .map(|p| p.text.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string();
    if markdown.is_empty() {
        return Err("Aucun texte extrait de ce PDF (scan sans couche texte ?)".to_string());
    }
    Ok(ConvertResult { markdown, converter: "local".to_string(), warning })
}

// --- métadonnées devinées (heuristiques texte) -------------------------

static STOPWORDS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "the", "a", "an", "of", "for", "and", "on", "in", "to", "with", "from", "by", "using", "based", "over", "at",
        "its", "their", "un", "une", "des", "les", "la", "le", "de", "du", "et", "dans", "sur", "pour", "par", "aux",
        "can", "may", "are", "is", "was", "were", "how", "what", "why", "not", "but", "into", "via", "toward",
        "towards", "between", "among", "peut",
    ]
    .into_iter()
    .collect()
});

static HTML_TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());
static LEADING_HASH_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^#+\s*").unwrap());
static ESCAPE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\\([*_])").unwrap());
static MARKDOWN_EMPH_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[*_`]").unwrap());
static DOI_IN_TEXT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\b10\.\d{4,9}/\S+").unwrap());
static TRAILING_PUNCT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[.,;:)\]]+$").unwrap());
static HASH_HEADING_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^#\s+\S").unwrap());
static BOILERPLATE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)^(published|received|accepted|doi|abstract|keywords?|citation|edited by|reviewed by|correspondence|specialty section|open access|methods|results|introduction|original research|this article was submitted)\b").unwrap()
});
static AFFILIATION_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)universit|institut|department|départ|laborator|\blab\b|research cent|centre|college|academy|school of|@").unwrap()
});
static NAMES_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[A-ZÀ-Ý][a-zà-ÿ'’-]{1,}").unwrap());
static SEMI_COMMA_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[;,]").unwrap());
static AND_ET_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\band\b|\bet\b").unwrap());
static STARTS_DIGIT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\d").unwrap());
static FOOTNOTE_DIGIT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(\p{L})\d+").unwrap());
static SPACE_COMMA_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+,").unwrap());
static MULTI_WS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());
static PUBLISHED_YEAR_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b(?:published|publié)\b[^\n]{0,40}?\b((?:19|20)\d{2})\b").unwrap());
static YEAR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(19|20)\d{2}\b").unwrap());
static JOURNAL_NAMED_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\bjournal\s+([A-ZÀ-Ý][^\n.;]{3,60})").unwrap());
static JOURNAL_KEYWORD_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)journal|revue|proc\.|trans\.|letters|rev\.|geophys|cryosphere|remote sens|frontiers").unwrap());
static FILENAME_EXT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\.(pdf|md)$").unwrap());
static UNDERSCORE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[_-]+").unwrap());

/// MinerU rend les appels de note en `<sup>1</sup>` et échappe les
/// astérisques : sans nettoyage, la ligne d'auteurs ressemble à du bruit
/// numéroté — miroir de `cleanLine`.
fn clean_line(line: &str) -> String {
    let s = HTML_TAG_RE.replace_all(line, "");
    let s = LEADING_HASH_RE.replace(&s, "");
    let s = ESCAPE_RE.replace_all(&s, "");
    let s = MARKDOWN_EMPH_RE.replace_all(&s, "");
    s.trim().to_string()
}

fn looks_like_authors(line: &str) -> bool {
    let len = line.chars().count();
    if !(6..=400).contains(&len) {
        return false;
    }
    if BOILERPLATE_RE.is_match(line) || AFFILIATION_RE.is_match(line) {
        return false;
    }
    let names_count = NAMES_RE.find_iter(line).count();
    names_count >= 2 && (SEMI_COMMA_RE.is_match(line) || AND_ET_RE.is_match(line)) && !STARTS_DIGIT_RE.is_match(line)
}

/// Heuristiques volontairement simples (miroir de `parseArticleMeta`) : tout
/// est éditable dans la fiche, une devinette approximative fait gagner plus
/// de temps qu'un champ vide.
pub fn parse_article_meta(markdown: &str, filename: &str) -> ArticleMeta {
    let head: String = markdown.chars().take(6000).collect();
    let lines: Vec<String> = head.split('\n').map(clean_line).filter(|l| !l.is_empty()).collect();

    let doi_raw = DOI_IN_TEXT_RE.find(&head).map(|m| m.as_str().to_string()).unwrap_or_default();
    let doi = TRAILING_PUNCT_RE.replace(&doi_raw, "").to_string();

    let from_hash = head.split('\n').find(|line| HASH_HEADING_RE.is_match(line));
    let mut title = if let Some(fh) = from_hash {
        clean_line(fh)
    } else {
        let start = lines
            .iter()
            .position(|line| line.chars().count() >= 12 && !BOILERPLATE_RE.is_match(line) && !AFFILIATION_RE.is_match(line));
        match start {
            Some(start_idx) => {
                let mut block: Vec<String> = Vec::new();
                let end_idx = (start_idx + 5).min(lines.len());
                for line in &lines[start_idx..end_idx] {
                    if BOILERPLATE_RE.is_match(line) || AFFILIATION_RE.is_match(line) || looks_like_authors(line) {
                        break;
                    }
                    block.push(line.clone());
                    let ends_punct = line.ends_with('.') || line.ends_with('?') || line.ends_with('!');
                    if ends_punct || block.join(" ").chars().count() > 120 {
                        break;
                    }
                }
                block.join(" ")
            }
            None => String::new(),
        }
    };
    if title.is_empty() {
        let base = Path::new(filename).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
        let no_ext = FILENAME_EXT_RE.replace(&base, "");
        title = UNDERSCORE_RE.replace_all(&no_ext, " ").trim().to_string();
    }
    title = MULTI_WS_RE.replace_all(&title, " ").to_string();
    title = title.chars().take(300).collect();

    let title_at: i64 = lines
        .iter()
        .position(|line| title.starts_with(line.as_str()) || line == &title)
        .map(|i| i as i64)
        .unwrap_or(-1);
    let ta = title_at.max(0) as usize;
    let slice_start = (ta + 1).min(lines.len());
    let slice_end = (ta + 8).min(lines.len());
    let author_line = if slice_start < slice_end {
        lines[slice_start..slice_end].iter().find(|l| looks_like_authors(l)).cloned().unwrap_or_default()
    } else {
        String::new()
    };
    let authors = {
        let stripped = FOOTNOTE_DIGIT_RE.replace_all(&author_line, "$1");
        let fixed = SPACE_COMMA_RE.replace_all(&stripped, ",");
        fixed.trim().to_string()
    };

    let year: Option<i64> = if let Some(caps) = PUBLISHED_YEAR_RE.captures(&head) {
        caps[1].parse::<i64>().ok()
    } else {
        YEAR_RE.find_iter(&head).filter_map(|m| m.as_str().parse::<i64>().ok()).max()
    };
    let current_year_plus1 = chrono::Utc::now().format("%Y").to_string().parse::<i64>().unwrap_or(9999) + 1;
    let year = year.filter(|&y| y <= current_year_plus1);

    let named = JOURNAL_NAMED_RE.captures(&head).map(|c| c[1].trim().to_string());
    let journal = named.unwrap_or_else(|| {
        lines
            .iter()
            .take(25)
            .find(|line| line.as_str() != title && line.chars().count() < 120 && !AFFILIATION_RE.is_match(line) && JOURNAL_KEYWORD_RE.is_match(line))
            .cloned()
            .unwrap_or_default()
    });

    ArticleMeta { title, authors, journal, doi, year }
}

// --- slugs ---------------------------------------------------------------

/// Nom de famille du premier auteur, quelle que soit la forme d'écriture —
/// miroir de `firstAuthorSlug`.
pub fn first_author_slug(authors: &str) -> String {
    let clean = FOOTNOTE_DIGIT_RE.replace_all(authors, "$1").trim().to_string();
    if clean.is_empty() {
        return String::new();
    }
    static INITIALS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^([^,;]+),\s*(?:[A-ZÀ-Ý]\.?\s*){1,4}(?:[;,]|$)").unwrap());
    static SPLIT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i);|\band\b|\bet\b|,").unwrap());
    static INITIAL_TOKEN_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[A-ZÀ-Ý]\.?$").unwrap());

    let first = if let Some(caps) = INITIALS_RE.captures(&clean) {
        caps[1].to_string()
    } else {
        SPLIT_RE.split(&clean).next().unwrap_or(&clean).to_string()
    };
    let family = first
        .split_whitespace()
        .rfind(|part| !INITIAL_TOKEN_RE.is_match(part))
        .unwrap_or_else(|| first.trim())
        .to_string();
    gbrain::slugify_title(&family).split('-').next().unwrap_or("").to_string()
}

/// Miroir de `titleWords`.
pub fn title_words(title: &str, max: usize) -> String {
    gbrain::slugify_title(title)
        .split('-')
        .filter(|w| w.len() > 2 && !STOPWORDS.contains(w))
        .take(max)
        .collect::<Vec<_>>()
        .join("-")
}

/// Miroir de `articleSlug`.
pub fn article_slug(meta: &ArticleMeta) -> String {
    let author = first_author_slug(&meta.authors);
    let year = meta.year.map(|y| y.to_string()).unwrap_or_default();
    let words = title_words(&meta.title, 4);
    let parts: Vec<String> = [author, year, words].into_iter().filter(|s| !s.is_empty()).collect();
    let joined = parts.join("-");
    let tail = if joined.is_empty() { gbrain::slugify_title(&meta.title) } else { joined };
    let capped: String = tail.chars().take(70).collect();
    let trimmed = capped.trim_end_matches('-');
    format!("articles/{trimmed}")
}

fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

/// Convention de nommage du corpus ragdoc — miroir de `ragdocName`.
pub fn ragdoc_name(meta: &ArticleMeta) -> String {
    let author = first_author_slug(&meta.authors);
    let words_cap = title_words(&meta.title, 4).split('-').filter(|s| !s.is_empty()).map(capitalize).collect::<Vec<_>>().join("_");
    let author_part = if author.is_empty() { "Article".to_string() } else { capitalize(&author) };
    let year_part = meta.year.map(|y| y.to_string()).unwrap_or_else(|| "sd".to_string());
    let words_part = if words_cap.is_empty() { "Sans_Titre".to_string() } else { words_cap };
    let joined = [author_part, year_part, words_part].join("_");
    joined.chars().take(100).collect()
}

// --- page markdown ---------------------------------------------------------

/// Trouve la coupure `,\s*(?=[A-ZÀ-Ý])` la plus proche dans `s` — approxime
/// (sans lookahead, non supporté par `regex`) `/;|(?<=\.)\s*,\s*(?=[A-ZÀ-Ý])/`
/// pour `yamlList`.
fn yaml_list_items(value: &str) -> Vec<String> {
    let chars: Vec<char> = value.chars().collect();
    let mut items = Vec::new();
    let mut start = 0usize;
    let mut i = 0usize;
    while i < chars.len() {
        if chars[i] == ';' {
            items.push(chars[start..i].iter().collect::<String>());
            start = i + 1;
            i += 1;
            continue;
        }
        if chars[i] == ',' && i > 0 && chars[i - 1] == '.' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j].is_ascii_uppercase() || ('\u{00C0}'..='\u{00DD}').contains(&chars[j])) {
                items.push(chars[start..i].iter().collect::<String>());
                start = j;
                i = j;
                continue;
            }
        }
        i += 1;
    }
    items.push(chars[start..].iter().collect::<String>());
    items.into_iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
}

fn yaml_list(value: &str) -> String {
    let items = yaml_list_items(value);
    if items.is_empty() {
        "[]".to_string()
    } else {
        format!("[{}]", items.iter().map(|it| serde_json::to_string(it).unwrap()).collect::<Vec<_>>().join(", "))
    }
}

/// Miroir de `buildArticlePage`.
pub fn build_article_page(meta: &ArticleMeta, body: &str, origin: &str, converter: &str) -> String {
    let scalars: Vec<char> = body.chars().collect();
    let capped = if scalars.len() > ARTICLE_PAGE_MAX {
        format!("{}\n[…tronqué]", scalars[..ARTICLE_PAGE_MAX].iter().collect::<String>())
    } else {
        body.to_string()
    };
    let mut front = vec![
        "---".to_string(),
        format!("title: {}", serde_json::to_string(meta.title.trim()).unwrap()),
        format!("authors: {}", yaml_list(&meta.authors)),
    ];
    if let Some(y) = meta.year {
        if y != 0 {
            front.push(format!("year: {y}"));
        }
    }
    if !meta.journal.trim().is_empty() {
        front.push(format!("journal: {}", serde_json::to_string(meta.journal.trim()).unwrap()));
    }
    if !meta.doi.trim().is_empty() {
        front.push(format!("doi: {}", serde_json::to_string(meta.doi.trim()).unwrap()));
    }
    if !origin.is_empty() {
        front.push(format!("origin: {}", serde_json::to_string(origin).unwrap()));
    }
    front.push(format!("captured: {}", chrono::Utc::now().format("%Y-%m-%d")));
    front.push("from: atelier".to_string());
    if !converter.is_empty() {
        front.push(format!("converter: {converter}"));
    }
    front.push("type: article".to_string());
    front.push("---".to_string());
    format!("{}\n\n{}\n", front.join("\n"), capped)
}

// --- brouillons --------------------------------------------------------

pub fn draft_dir(dir: &Path) -> PathBuf {
    dir.join(ARTICLE_DRAFT_DIR)
}

/// Un brouillon oublié (dialogue fermé, app tuée) ne doit pas s'accumuler —
/// miroir de `pruneDrafts`.
pub fn prune_drafts(dir: &Path) -> usize {
    let root = draft_dir(dir);
    if !root.exists() {
        return 0;
    }
    let mut dropped = 0usize;
    let now = SystemTime::now();
    if let Ok(entries) = std::fs::read_dir(&root) {
        for entry in entries.flatten() {
            let path = entry.path();
            let age_ms = std::fs::metadata(&path)
                .ok()
                .and_then(|meta| meta.modified().ok())
                .and_then(|modified| now.duration_since(modified).ok())
                .map(|d| d.as_millis());
            if let Some(age) = age_ms {
                if age > DRAFT_TTL_MS {
                    let _ = std::fs::remove_file(&path);
                    dropped += 1;
                }
            }
        }
    }
    dropped
}

/// Miroir de `saveDraft` : id déterministe `sha1(markdown).slice(0,12)` —
/// même contenu -> même draftId.
pub fn save_draft(dir: &Path, markdown: &str) -> Result<String, String> {
    let root = draft_dir(dir);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    prune_drafts(dir);
    let mut hasher = Sha1::new();
    hasher.update(markdown.as_bytes());
    let digest = hasher.finalize();
    let id = hex::encode(digest)[..12].to_string();
    std::fs::write(root.join(format!("{id}.md")), markdown).map_err(|e| e.to_string())?;
    Ok(id)
}

static DRAFT_ID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-f0-9]{12}$").unwrap());

/// Miroir de `readDraft`.
pub fn read_draft(dir: &Path, id: &str) -> Result<String, String> {
    if !DRAFT_ID_RE.is_match(id) {
        return Err(format!("Brouillon invalide: {id}"));
    }
    let file = draft_dir(dir).join(format!("{id}.md"));
    std::fs::read_to_string(&file).map_err(|_| "Brouillon expiré — relancer la conversion du PDF".to_string())
}

pub fn drop_draft(dir: &Path, id: &str) {
    let _ = std::fs::remove_file(draft_dir(dir).join(format!("{id}.md")));
}

// --- orchestration -------------------------------------------------------

fn probe_exists(slug: &str) -> Result<bool, String> {
    let probe = gbrain::run_gbrain(&["get", slug], None)?;
    let probe = probe.trim();
    Ok(!probe.is_empty() && !gbrain::gbrain_not_found(probe))
}

pub struct ArticleListItem {
    pub slug: String,
    pub kind: String,
    pub date: String,
    pub title: String,
}

/// Miroir de `parseArticleList` : lignes `slug<TAB>type<TAB>date<TAB>titre` ;
/// les bannières d'auto-mise à jour du CLI gbrain (sans 4 colonnes) sont
/// ignorées.
pub fn parse_article_list(output: &str) -> Vec<ArticleListItem> {
    output
        .split('\n')
        .filter_map(|line| {
            let cells: Vec<&str> = line.split('\t').collect();
            if cells.len() < 4 || !cells[0].contains('/') {
                return None;
            }
            Some(ArticleListItem {
                slug: cells[0].trim().to_string(),
                kind: cells[1].trim().to_string(),
                date: cells[2].trim().to_string(),
                title: cells[3..].join("\t").trim().to_string(),
            })
        })
        .collect()
}

/// Miroir de `listArticles` — les plus récents d'abord (tri texte sur
/// `date`, pas une vraie date).
pub fn list_articles(limit: i64) -> Result<Vec<ArticleListItem>, String> {
    let capped = limit.clamp(1, 100);
    let output = gbrain::run_gbrain(&["list", "--type", "article", "-n", &capped.to_string()], None)?;
    let mut articles = parse_article_list(&output);
    articles.sort_by(|a, b| b.date.cmp(&a.date));
    articles.truncate(capped as usize);
    Ok(articles)
}

fn add_duplicate(found: &mut Vec<Value>, seen: &mut HashSet<String>, slug_out: &str, snippet: &str, why: &str, own_slug: &str) {
    if slug_out.is_empty() || slug_out == own_slug || seen.contains(slug_out) {
        return;
    }
    seen.insert(slug_out.to_string());
    found.push(json!({"slug": slug_out, "snippet": snippet, "why": why}));
}

/// Doublons : sonde par DOI puis par mots du titre — miroir de
/// `findDuplicates`. Erreurs réseau/spawn absorbées (liste vide), jamais un
/// throw : un corpus injoignable ne doit pas casser l'import.
pub fn find_duplicates(meta: &ArticleMeta, slug: &str, limit: usize) -> Vec<Value> {
    let mut found: Vec<Value> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let search = |query: &str| -> Vec<gbrain::GbrainHit> {
        gbrain::run_gbrain(&["search", query], None).map(|out| gbrain::parse_gbrain_search(&out)).unwrap_or_default()
    };
    if !meta.doi.is_empty() {
        for hit in search(&meta.doi) {
            add_duplicate(&mut found, &mut seen, &hit.slug, &hit.snippet, "doi", slug);
        }
    }
    let words: Vec<String> = title_words(&meta.title, 8).split('-').filter(|s| !s.is_empty()).map(str::to_string).collect();
    if words.len() >= 3 {
        let query = words.join(" ");
        for hit in search(&query) {
            let hay = format!("{} {}", hit.slug, hit.snippet).to_lowercase();
            let hit_count = words.iter().filter(|w| hay.contains(w.as_str())).count();
            if hit_count as f64 / words.len() as f64 >= DUPLICATE_OVERLAP {
                add_duplicate(&mut found, &mut seen, &hit.slug, &hit.snippet, "titre", slug);
            }
        }
    }
    found.into_iter().take(limit).collect()
}

/// Étape 1 : PDF → brouillon + fiche — miroir de `importArticle`. Aucune
/// écriture gbrain, seulement la sonde d'existence du slug proposé et la
/// recherche de doublons.
pub fn import_article(path: &str, dir: &Path, pdf_cache_dir: &Path, mut on_progress: Option<&mut dyn FnMut(&str)>) -> Result<Value, String> {
    if path.is_empty() {
        return Err("Argument requis: --path".to_string());
    }
    let convert = convert_pdf(Path::new(path), pdf_cache_dir)?;
    let guessed = parse_article_meta(&convert.markdown, path);
    if let Some(cb) = on_progress.as_deref_mut() {
        cb("meta");
    }
    let (meta, meta_source) = crate::article_meta::resolve_article_meta(path, &guessed);
    let slug = article_slug(&meta);
    let draft_id = save_draft(dir, &convert.markdown)?;
    let page = build_article_page(&meta, &convert.markdown, path, &convert.converter);
    let preview = if page.chars().count() > ARTICLE_PREVIEW_MAX {
        format!("{}\n[…]", take_chars(&page, ARTICLE_PREVIEW_MAX))
    } else {
        page
    };
    if let Some(cb) = on_progress.as_deref_mut() {
        cb("duplicates");
    }
    let (exists, probe_error) = match probe_exists(&slug) {
        Ok(e) => (e, None),
        Err(msg) => (false, Some(msg)),
    };
    let duplicates = if probe_error.is_some() { Vec::new() } else { find_duplicates(&meta, &slug, 5) };
    Ok(json!({
        "ok": true,
        "draftId": draft_id,
        "path": path,
        "meta": {
            "title": meta.title, "authors": meta.authors, "journal": meta.journal,
            "doi": meta.doi, "year": meta.year,
        },
        "slug": slug,
        "exists": exists,
        "converter": convert.converter,
        "duplicates": duplicates,
        "metaSource": meta_source,
        "chars": convert.markdown.chars().count(),
        "preview": preview,
        "warning": convert.warning.or(probe_error),
    }))
}

/// Import par DOI (sans PDF) — miroir de `importDoi`.
pub fn import_doi(doi: &str, dir: &Path) -> Result<Value, String> {
    let clean = crate::article_meta::clean_doi(doi);
    if !crate::article_meta::is_valid_doi_shape(&clean) {
        return Err(format!("DOI invalide: {doi}"));
    }
    let shaped = crate::article_meta::crossref_meta(&clean).ok_or_else(|| format!("DOI introuvable chez Crossref (ou hors ligne) : {clean}"))?;
    // `meta` renvoyé au call site porte le résumé BRUT (JATS non nettoyé) —
    // miroir de Node (`importDoi` renvoie directement l'objet `shapeWork`,
    // qui inclut `abstract`) ; seul le corps du brouillon utilise la version
    // nettoyée (`abstractText`).
    let raw_abstract = shaped.abstract_text.clone();
    let meta = ArticleMeta { title: shaped.title, authors: shaped.authors, journal: shaped.journal, doi: shaped.doi, year: shaped.year };
    let abstract_text = crate::article_meta::abstract_text(&raw_abstract);
    let body = if abstract_text.is_empty() {
        "_Fiche de référence — aucun texte intégral. Déposer le PDF pour l'ajouter._\n".to_string()
    } else {
        format!("## Résumé\n\n{abstract_text}\n")
    };
    let draft_id = save_draft(dir, &body)?;
    let slug = article_slug(&meta);
    let page = build_article_page(&meta, &body, &format!("doi:{clean}"), "crossref");
    let (exists, probe_error) = match probe_exists(&slug) {
        Ok(e) => (e, None),
        Err(msg) => (false, Some(msg)),
    };
    let duplicates = if probe_error.is_some() { Vec::new() } else { find_duplicates(&meta, &slug, 5) };
    let warning = probe_error.or_else(|| {
        if abstract_text.is_empty() {
            Some("Aucun résumé chez Crossref — fiche de référence sans texte".to_string())
        } else {
            None
        }
    });
    Ok(json!({
        "ok": true,
        "draftId": draft_id,
        "path": format!("doi:{clean}"),
        "meta": { "title": meta.title, "authors": meta.authors, "journal": meta.journal, "doi": meta.doi, "year": meta.year, "abstract": raw_abstract },
        "slug": slug,
        "exists": exists,
        "converter": "crossref",
        "metaSource": "crossref",
        "duplicates": duplicates,
        "chars": body.chars().count(),
        "preview": page,
        "warning": warning,
    }))
}

/// Copie vers le corpus ragdoc du NAS — transfert synchrone puis indexation
/// détachée, miroir de `copyToRagdoc`. Échec non bloquant, toujours rapporté.
fn copy_to_ragdoc(name: &str, markdown: &str) -> Value {
    static SAFE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[^A-Za-z0-9_.-]").unwrap());
    let safe = SAFE_RE.replace_all(name, "_").to_string();
    let remote_write = format!("cat > '{RAGDOC_DIR}/articles_markdown/{safe}.md'");
    let timeout = Duration::from_millis(RAGDOC_TIMEOUT_MS);
    match gbrain::spawn_with_timeout("ssh", &["nas", &remote_write], Some(markdown), timeout) {
        SpawnOutcome::Finished { code: 0, stderr, .. } => {
            let index_cmd = format!("cd '{RAGDOC_DIR}' && nohup '{RAGDOC_PYTHON}' scripts/index_incremental.py >/dev/null 2>&1 &");
            let indexing = matches!(
                gbrain::spawn_with_timeout("ssh", &["nas", &index_cmd], None, Duration::from_millis(20_000)),
                SpawnOutcome::Finished { code: 0, .. }
            );
            let _ = stderr;
            json!({"ok": true, "file": format!("{safe}.md"), "indexing": indexing})
        }
        SpawnOutcome::Finished { stderr, .. } => {
            let detail = take_chars(String::from_utf8_lossy(&stderr).trim(), 160);
            json!({"ok": false, "message": format!("ragdoc: transfert impossible ({detail})")})
        }
        SpawnOutcome::TimedOut => json!({"ok": false, "message": "ragdoc: transfert impossible (délai dépassé)"}),
        SpawnOutcome::SpawnError(e) => {
            json!({"ok": false, "message": format!("ragdoc: transfert impossible ({})", take_chars(&e, 160))})
        }
    }
}

/// Étape 2 : brouillon + métadonnées corrigées → page gbrain — miroir de
/// `writeArticle`. `probeExists` n'est PAS absorbé ici (contrairement à
/// import*) : un corpus injoignable doit faire échouer l'écriture, pas
/// l'annoncer comme réussie.
#[allow(clippy::too_many_arguments)]
pub fn write_article(dir: &Path, draft_id: &str, slug: Option<&str>, meta: &ArticleMeta, origin: &str, converter: &str, ragdoc: bool) -> Result<Value, String> {
    let body = read_draft(dir, draft_id)?;
    let target = slug.map(str::trim).filter(|s| !s.is_empty()).map(str::to_string).unwrap_or_else(|| article_slug(meta));
    if !gbrain::is_valid_gbrain_slug(&target) {
        return Err(format!("Slug invalide: {target}"));
    }
    let markdown = build_article_page(meta, &body, origin, converter);
    let existed = probe_exists(&target)?;
    let out = gbrain::run_gbrain(&["put", &target], Some(&markdown))?;
    if gbrain::gbrain_not_found(&out) || gbrain::is_error_bracket(&out) {
        return Err(take_chars(out.trim(), 300));
    }
    let ragdoc_result = if ragdoc { Some(copy_to_ragdoc(&ragdoc_name(meta), &markdown)) } else { None };
    drop_draft(dir, draft_id);
    Ok(json!({"ok": true, "slug": target, "written": true, "updated": existed, "ragdoc": ragdoc_result}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_article_meta_sur_texte_fixture() {
        let markdown = "Melting of Alpine Glaciers Under Recent Warming\nT. Aoki and K. Kuchiki\nPublished: 11 January 2022 DOI: 10.1234/fixture.2022.001\nAbstract\nWe present a fixture article used only to test the Atelier knowledge base CLI. It\nis not a real scientific publication.\nIntroduction\nAlbedo decline drives melt. Results show significant increase in melt rate during\nthe study period, with root-mean-square error below 5 percent.\nConclusion\nWe conclude that fixture PDFs are sufficient for CLI parity testing.\n\n1";
        let meta = parse_article_meta(markdown, "/tmp/sample.pdf");
        assert_eq!(meta.title, "Melting of Alpine Glaciers Under Recent Warming");
        assert_eq!(meta.authors, "T. Aoki and K. Kuchiki");
        assert_eq!(meta.doi, "10.1234/fixture.2022.001");
        assert_eq!(meta.year, Some(2022));
        assert_eq!(meta.journal, "");
    }

    #[test]
    fn article_slug_combine_auteur_annee_mots_cles() {
        let meta = ArticleMeta {
            title: "Melting of Alpine Glaciers Under Recent Warming".to_string(),
            authors: "T. Aoki and K. Kuchiki".to_string(),
            journal: String::new(),
            doi: "10.1234/fixture.2022.001".to_string(),
            year: Some(2022),
        };
        assert_eq!(article_slug(&meta), "articles/aoki-2022-melting-alpine-glaciers-under");
    }

    #[test]
    fn save_draft_est_deterministe() {
        let dir = tempfile::tempdir().unwrap();
        let id1 = save_draft(dir.path(), "contenu identique").unwrap();
        let id2 = save_draft(dir.path(), "contenu identique").unwrap();
        assert_eq!(id1, id2);
        assert_eq!(id1.len(), 12);
    }

    #[test]
    fn read_draft_rejette_id_mal_forme() {
        let dir = tempfile::tempdir().unwrap();
        let err = read_draft(dir.path(), "not-an-id").unwrap_err();
        assert_eq!(err, "Brouillon invalide: not-an-id");
        let err2 = read_draft(dir.path(), "aaaaaaaaaaaa").unwrap_err();
        assert_eq!(err2, "Brouillon expiré — relancer la conversion du PDF");
    }

    #[test]
    fn parse_article_list_ignore_les_lignes_sans_quatre_colonnes() {
        let items = parse_article_list("bannière ignorée\narticles/x\tarticle\t2026-08-15\tTitre X\n");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].slug, "articles/x");
        assert_eq!(items[0].title, "Titre X");
    }
}
