//! Port de `sidecar/article.mjs` (plan 065, vague 2 groupe c, puis vague 4
//! B4) : import d'article PDF → brouillon + fiche vérifiable → page gbrain.
//! MinerU réel (API cloud) est maintenant spawné quand `resolve_mineru` le
//! fournit (script + jeton présents) — miroir de `convertPdf`
//! (`sidecar/article.mjs:142-191`), stages `--progress` compris. Sur toute
//! machine sans jeton configuré (dont le harnais de fixtures, MinerU
//! toujours désactivé via `ATELIER_MINERU_SCRIPT`), le moteur retombe sur
//! l'extraction locale (`pdftotext`) — chemin fixturé par
//! `kb_parity/fixtures/c-article-local.json`, inchangé par B4.

use crate::gbrain::{self, SpawnOutcome};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Value};
use sha1::{Digest, Sha1};
use std::collections::HashSet;
use std::io::{BufRead, Read};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime};

pub use crate::article_meta::ArticleMeta;

pub const ARTICLE_DRAFT_DIR: &str = "article-drafts";
const ARTICLE_PAGE_MAX: usize = 400_000;
const ARTICLE_PREVIEW_MAX: usize = 4000;
const DRAFT_TTL_MS: u128 = 7 * 24 * 3600 * 1000;
pub const DUPLICATE_OVERLAP: f64 = 0.6;
// MinerU passe par l'API cloud : upload + conversion + téléchargement. Le
// script python plafonne son propre polling à 600 s ; on garde de la marge
// (miroir de MINERU_TIMEOUT_MS, sidecar/article.mjs:18).
const MINERU_TIMEOUT_MS: u64 = 900_000;
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

/// Miroir de `resolveMineru` : script python du skill `mineru-pdf` (API
/// cloud, jeton dans `~/.mineru_token`). Absent ou sans jeton : `script`
/// reste `None`, `convert_pdf` retombe sur l'extraction locale — un article
/// lisible vaut mieux qu'un dialogue vide.
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

// --- MinerU : progression, spawn bavard, résolution d'échec ---------------

// Le script MinerU raconte ce qu'il fait sur stdout ; chaque ligne connue
// devient une étape nommée — miroir de MINERU_STAGES/mineruStage
// (sidecar/article.mjs:47-64). Table vérifiée DANS CET ORDRE (premier match
// gagne), comme le tableau Node.
static MINERU_UPLOADING_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^Uploading\b").unwrap());
static MINERU_UPLOAD_COMPLETE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^Upload complete").unwrap());
static MINERU_PROCESSING_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^Processing\.\.\.\s*\((\d+)s\)").unwrap());
static MINERU_CONVERSION_COMPLETE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^Conversion complete").unwrap());
static MINERU_DOWNLOADING_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^Downloading result").unwrap());
static MINERU_FIGURES_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^Extracted (\d+) figures?").unwrap());
static MINERU_OCR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^Couche texte:.*is_ocr=(\w+)").unwrap());

pub fn mineru_stage(line: &str) -> Option<Value> {
    let text = line.trim();
    if MINERU_UPLOADING_RE.is_match(text) {
        return Some(json!({"stage": "upload"}));
    }
    if MINERU_UPLOAD_COMPLETE_RE.is_match(text) {
        return Some(json!({"stage": "converting"}));
    }
    if let Some(c) = MINERU_PROCESSING_RE.captures(text) {
        let seconds: i64 = c[1].parse().unwrap_or(0);
        return Some(json!({"stage": "converting", "seconds": seconds}));
    }
    if MINERU_CONVERSION_COMPLETE_RE.is_match(text) {
        return Some(json!({"stage": "download"}));
    }
    if MINERU_DOWNLOADING_RE.is_match(text) {
        return Some(json!({"stage": "download"}));
    }
    if let Some(c) = MINERU_FIGURES_RE.captures(text) {
        let count: i64 = c[1].parse().unwrap_or(0);
        return Some(json!({"stage": "figures", "count": count}));
    }
    if let Some(c) = MINERU_OCR_RE.captures(text) {
        return Some(json!({"stage": "ocr", "ocr": &c[1] == "True"}));
    }
    None
}

/// Nom de sortie déterministe — miroir de `outputName`
/// (`sidecar/article.mjs:118-122`) : slug tronqué à 40 + 6 caractères de
/// hash sha1 du chemin (désambiguïse deux PDF au même nom de fichier).
pub fn output_name(path: &Path) -> String {
    static PDF_EXT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\.pdf$").unwrap());
    let base = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let without_ext = PDF_EXT_RE.replace(&base, "").into_owned();
    let stem: String = gbrain::slugify_title(&without_ext).chars().take(40).collect();
    let mut hasher = Sha1::new();
    hasher.update(path.to_string_lossy().as_bytes());
    let hash = hex::encode(hasher.finalize())[..6].to_string();
    let stem = if stem.is_empty() { "article".to_string() } else { stem };
    format!("atelier-{stem}-{hash}")
}

/// Résultat d'un `run_streaming` — même forme que `spawnSync`
/// ({status, stdout, stderr, error}), miroir de `runStreaming`
/// (`sidecar/article.mjs:69-116`).
pub(crate) struct StreamedRun {
    pub status: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub spawn_error: Option<String>,
}

/// Spawn bavard, ligne par ligne — `on_line` est appelé pour CHAQUE ligne de
/// stdout dès qu'elle est disponible (MinerU écrit sa progression au fil de
/// l'eau), pas seulement à la fin comme `gbrain::spawn_with_timeout`.
pub(crate) fn run_streaming(bin: &str, args: &[&str], timeout: Duration, mut on_line: impl FnMut(&str)) -> StreamedRun {
    let mut cmd = std::process::Command::new(bin);
    cmd.args(args);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return StreamedRun {
                status: None,
                stdout: String::new(),
                stderr: String::new(),
                timed_out: false,
                spawn_error: Some(e.to_string()),
            }
        }
    };
    let stdout_pipe = child.stdout.take();
    let stderr_pipe = child.stderr.take();
    let (tx, rx) = mpsc::channel::<String>();
    let stdout_thread = std::thread::spawn(move || {
        let mut full = String::new();
        if let Some(pipe) = stdout_pipe {
            for line in std::io::BufReader::new(pipe).lines().map_while(Result::ok) {
                full.push_str(&line);
                full.push('\n');
                let _ = tx.send(line);
            }
        }
        full
    });
    let stderr_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(mut s) = stderr_pipe {
            let _ = s.read_to_end(&mut buf);
        }
        buf
    });

    let start = Instant::now();
    let mut timed_out = false;
    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(line) => {
                on_line(&line);
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    timed_out = true;
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    timed_out = true;
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    while let Ok(line) = rx.try_recv() {
        on_line(&line);
    }
    let status = child.wait().ok().and_then(|s| s.code());
    let stdout = stdout_thread.join().unwrap_or_default();
    let stderr = String::from_utf8_lossy(&stderr_thread.join().unwrap_or_default()).into_owned();
    StreamedRun { status, stdout, stderr, timed_out, spawn_error: None }
}

/// Raison d'échec lisible — miroir de `mineruFailure`
/// (`sidecar/article.mjs:126-138`). Surtout PAS la dernière ligne de
/// stdout : le script finit par « ✓ Figures: … », ce qui donnerait des
/// messages d'échec triomphants.
pub(crate) fn mineru_failure(run: &StreamedRun) -> String {
    if run.timed_out {
        return "délai dépassé".to_string();
    }
    static ERR_RE_STDERR: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)error|exception|traceback|refus|denied|quota").unwrap());
    static ERR_RE_STDOUT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)error|échec|failed|quota").unwrap());
    let stderr_lines: Vec<&str> = run.stderr.trim().split('\n').filter(|l| !l.is_empty()).collect();
    let spoken: Option<&str> = stderr_lines
        .iter()
        .rev()
        .find(|l| ERR_RE_STDERR.is_match(l))
        .copied()
        .or_else(|| stderr_lines.last().copied())
        .or_else(|| {
            let stdout_lines: Vec<&str> = run.stdout.trim().split('\n').filter(|l| !l.is_empty()).collect();
            stdout_lines.iter().rev().find(|l| ERR_RE_STDOUT.is_match(l)).copied()
        });
    if let Some(s) = spoken {
        return s.trim().chars().take(160).collect();
    }
    if let Some(err) = &run.spawn_error {
        return err.chars().take(160).collect();
    }
    match run.status {
        Some(code) if code != 0 => format!("code {code}"),
        _ => "markdown introuvable en sortie".to_string(),
    }
}

/// PDF → markdown — miroir de `convertPdf` (`sidecar/article.mjs:142-191`).
/// Spawn réel du script MinerU quand `mineru.script` est fourni (B4,
/// plans/065-revue-findings.md) ; repli sur l'extraction locale
/// (`pdftotext`) inchangé, que MinerU soit indisponible OU qu'il échoue.
pub fn convert_pdf(
    path: &Path,
    pdf_cache_dir: &Path,
    on_progress: &mut dyn FnMut(Value),
) -> Result<ConvertResult, String> {
    convert_pdf_with(path, pdf_cache_dir, resolve_mineru(), "python3", on_progress)
}

pub(crate) fn convert_pdf_with(
    path: &Path,
    pdf_cache_dir: &Path,
    mineru: MineruResolution,
    python: &str,
    on_progress: &mut dyn FnMut(Value),
) -> Result<ConvertResult, String> {
    if !path.exists() {
        return Err(format!("PDF introuvable: {}", path.display()));
    }
    static PDF_EXT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)\.pdf$").unwrap());
    if !PDF_EXT_RE.is_match(&path.to_string_lossy()) {
        return Err(format!("Un PDF est attendu: {}", path.display()));
    }
    let mut warning = mineru.reason.clone();
    if let Some(script) = mineru.script.as_deref() {
        let name = output_name(path);
        let path_str = path.to_string_lossy().into_owned();
        // `-u` OBLIGATOIRE : sans lui, Python bufferise stdout sur un pipe
        // (pas de TTY) et les 20 print() du script n'arrivent qu'à la fin —
        // aucune étape en direct, l'UI reste sur le libellé générique
        // pendant toute la conversion (vécu 2026-08-16, sonde WS : zéro
        // articleProgress en 30 s avec 5 conversions vivantes).
        let run = run_streaming(python, &["-u", script, &path_str, &name], Duration::from_millis(MINERU_TIMEOUT_MS), |line| {
            if let Some(stage) = mineru_stage(line) {
                on_progress(stage);
            }
        });
        // PIÈGE (vécu côté Node) : le script du skill écrit en dur dans
        // /tmp/<nom>.md, alors que le tmpdir système vaut autre chose sur
        // macOS (/var/folders/…). Chercher au seul tmpdir ferait passer
        // TOUTE conversion réussie pour un échec.
        let produced = [PathBuf::from("/tmp"), std::env::temp_dir()]
            .into_iter()
            .map(|root| root.join(format!("{name}.md")))
            .find(|file| file.exists());
        if run.spawn_error.is_none() && !run.timed_out {
            if let Some(file) = &produced {
                if let Ok(markdown) = std::fs::read_to_string(file) {
                    let trimmed = markdown.trim().to_string();
                    if !trimmed.is_empty() {
                        let _ = std::fs::remove_file(file);
                        return Ok(ConvertResult { markdown: trimmed, converter: "mineru".to_string(), warning: None });
                    }
                }
            }
        }
        warning = Some(format!("MinerU a échoué ({}) — texte extrait localement", mineru_failure(&run)));
    }
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
    // `gbrain get` sort avec un code non nul ET `Error [page_not_found]`
    // pour une page qui n'existe pas encore — c'est le cas ATTENDU de toute
    // première écriture, pas une panne (vécu 2026-08-16 : chaque write
    // d'article neuf échouait ici). Seules les autres erreurs (ssh coupé,
    // délai, brain injoignable) doivent faire échouer l'écriture.
    match gbrain::run_gbrain(&["get", slug], None) {
        Ok(probe) => {
            let probe = probe.trim();
            Ok(!probe.is_empty() && !gbrain::gbrain_not_found(probe))
        }
        Err(message) if gbrain::gbrain_not_found(&message) => Ok(false),
        Err(message) => Err(message),
    }
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
pub fn import_article(
    path: &str,
    dir: &Path,
    pdf_cache_dir: &Path,
    on_progress: Option<&mut dyn FnMut(Value)>,
) -> Result<Value, String> {
    if path.is_empty() {
        return Err("Argument requis: --path".to_string());
    }
    // Miroir de `const step = typeof deps.onProgress === "function" ?
    // deps.onProgress : () => {};` (sidecar/article.mjs:467) : un seul
    // callback non-Option en interne, normalisé ici — un abonné aux étapes
    // ne change rien au résultat, seulement à ce que l'interface en sait.
    let mut noop = |_v: Value| {};
    let step: &mut dyn FnMut(Value) = match on_progress {
        Some(cb) => cb,
        None => &mut noop,
    };
    let convert = convert_pdf(Path::new(path), pdf_cache_dir, step)?;
    let guessed = parse_article_meta(&convert.markdown, path);
    step(json!({"stage": "meta"}));
    let (meta, meta_source) = crate::article_meta::resolve_article_meta(path, &guessed);
    let slug = article_slug(&meta);
    let draft_id = save_draft(dir, &convert.markdown)?;
    let page = build_article_page(&meta, &convert.markdown, path, &convert.converter);
    let preview = if page.chars().count() > ARTICLE_PREVIEW_MAX {
        format!("{}\n[…]", take_chars(&page, ARTICLE_PREVIEW_MAX))
    } else {
        page
    };
    step(json!({"stage": "duplicates"}));
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

    // --- B4 (plans/065-revue-findings.md) : spawn MinerU réel — stages,
    // nom de sortie, résolution d'échec, spawn bavard avec timeout. ---

    #[test]
    fn mineru_stage_reconnait_les_lignes_connues_dans_lordre() {
        assert_eq!(mineru_stage("Uploading document.pdf"), Some(json!({"stage": "upload"})));
        assert_eq!(mineru_stage("Upload complete"), Some(json!({"stage": "converting"})));
        assert_eq!(mineru_stage("Processing... (42s)"), Some(json!({"stage": "converting", "seconds": 42})));
        assert_eq!(mineru_stage("Conversion complete"), Some(json!({"stage": "download"})));
        assert_eq!(mineru_stage("Downloading result archive"), Some(json!({"stage": "download"})));
        assert_eq!(mineru_stage("Extracted 3 figures"), Some(json!({"stage": "figures", "count": 3})));
        assert_eq!(mineru_stage("Extracted 1 figure"), Some(json!({"stage": "figures", "count": 1})));
        assert_eq!(mineru_stage("Couche texte: is_ocr=True"), Some(json!({"stage": "ocr", "ocr": true})));
        assert_eq!(mineru_stage("Couche texte: is_ocr=False"), Some(json!({"stage": "ocr", "ocr": false})));
        assert_eq!(mineru_stage("✓ Figures: 3 extraites"), None);
        assert_eq!(mineru_stage(""), None);
    }

    #[test]
    fn output_name_est_deterministe_et_borne_le_stem() {
        let a = output_name(Path::new("/tmp/Article Long Titre Avec Beaucoup De Mots En Trop.pdf"));
        let b = output_name(Path::new("/tmp/Article Long Titre Avec Beaucoup De Mots En Trop.pdf"));
        assert_eq!(a, b, "même chemin -> même nom (hash déterministe)");
        assert!(a.starts_with("atelier-"));
        // stem <= 40 caractères + "atelier-" (8) + "-" (1) + hash (6)
        assert!(a.len() <= 8 + 40 + 1 + 6, "nom trop long: {a}");
        let other = output_name(Path::new("/tmp/autre.pdf"));
        assert_ne!(a, other, "chemins différents -> hash différent");
    }

    #[test]
    fn mineru_failure_prefere_une_ligne_stderr_parlante_a_la_derniere_ligne_stdout() {
        let run = StreamedRun {
            status: Some(1),
            stdout: "Uploading\n✓ Figures: 3 extraites (triomphant malgré l'échec)\n".to_string(),
            stderr: "warming up\nError: quota dépassé\ntrailer sans intérêt\n".to_string(),
            timed_out: false,
            spawn_error: None,
        };
        assert_eq!(mineru_failure(&run), "Error: quota dépassé");
    }

    #[test]
    fn mineru_failure_replie_sur_la_derniere_ligne_stderr_sans_motif() {
        let run = StreamedRun {
            status: Some(1),
            stdout: String::new(),
            stderr: "premiere ligne\nderniere ligne sans motif reconnu\n".to_string(),
            timed_out: false,
            spawn_error: None,
        };
        assert_eq!(mineru_failure(&run), "derniere ligne sans motif reconnu");
    }

    #[test]
    fn mineru_failure_delai_dépasse_prioritaire() {
        let run = StreamedRun { status: None, stdout: String::new(), stderr: "Error: peu importe".to_string(), timed_out: true, spawn_error: None };
        assert_eq!(mineru_failure(&run), "délai dépassé");
    }

    #[test]
    fn mineru_failure_replie_sur_le_code_de_sortie_sans_aucune_ligne() {
        let run = StreamedRun { status: Some(2), stdout: String::new(), stderr: String::new(), timed_out: false, spawn_error: None };
        assert_eq!(mineru_failure(&run), "code 2");
        let run_ok_vide = StreamedRun { status: Some(0), stdout: String::new(), stderr: String::new(), timed_out: false, spawn_error: None };
        assert_eq!(mineru_failure(&run_ok_vide), "markdown introuvable en sortie");
    }

    #[test]
    fn run_streaming_appelle_on_line_au_fil_de_leau_et_capture_stdout() {
        let mut seen = Vec::new();
        let run = run_streaming(
            "/bin/sh",
            &["-c", "echo Uploading; echo 'Upload complete'; echo 'Conversion complete' 1>&2"],
            Duration::from_secs(5),
            |line| seen.push(line.to_string()),
        );
        assert_eq!(run.spawn_error, None);
        assert!(!run.timed_out);
        assert_eq!(run.status, Some(0));
        assert_eq!(seen, vec!["Uploading".to_string(), "Upload complete".to_string()]);
        assert!(run.stdout.contains("Uploading"));
        assert!(run.stderr.contains("Conversion complete"));
    }

    #[test]
    fn run_streaming_tue_le_process_et_signale_timed_out_au_dela_du_delai() {
        let run = run_streaming("/bin/sh", &["-c", "sleep 5"], Duration::from_millis(100), |_| {});
        assert!(run.timed_out, "le process qui dort 5 s doit être tué après 100 ms");
        assert_eq!(run.spawn_error, None);
    }

    #[test]
    fn convert_pdf_with_spawne_reellement_un_faux_script_mineru_et_transmet_les_etapes() {
        let tmp = tempfile::tempdir().unwrap();
        // Un vrai PDF minimal n'est pas nécessaire : la branche MinerU ne lit
        // jamais le contenu du fichier, seulement son chemin (passé en argv).
        let pdf_path = tmp.path().join("mon-article.pdf");
        std::fs::write(&pdf_path, b"%PDF-1.4 fixture").unwrap();
        let out_name = output_name(&pdf_path);
        // Écrit dans le tmpdir système plutôt que /tmp en dur : les deux sont
        // vérifiés par convert_pdf_with (voir le piège documenté dans le
        // code), le tmpdir système évite de polluer /tmp pendant les tests.
        let target_md = std::env::temp_dir().join(format!("{out_name}.md"));
        let script_path = tmp.path().join("fake_mineru.sh");
        std::fs::write(
            &script_path,
            format!(
                "#!/bin/sh\necho Uploading\necho 'Upload complete'\necho 'Processing... (3s)'\necho 'Conversion complete'\nprintf 'Texte converti par MinerU (fixture de test).' > '{}'\n",
                target_md.display()
            ),
        )
        .unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&script_path).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&script_path, perms).unwrap();
        }

        let mineru = MineruResolution { script: Some(script_path.to_string_lossy().into_owned()), reason: None };
        let mut stages: Vec<Value> = Vec::new();
        let result = convert_pdf_with(&pdf_path, tmp.path(), mineru, "/bin/sh", &mut |v| stages.push(v)).unwrap();

        assert_eq!(result.converter, "mineru");
        assert_eq!(result.markdown, "Texte converti par MinerU (fixture de test).");
        assert_eq!(result.warning, None);
        assert!(stages.contains(&json!({"stage": "upload"})), "stages: {stages:?}");
        assert!(stages.contains(&json!({"stage": "converting"})), "stages: {stages:?}");
        assert!(stages.contains(&json!({"stage": "converting", "seconds": 3})), "stages: {stages:?}");
        assert!(stages.contains(&json!({"stage": "download"})), "stages: {stages:?}");
        // Le fichier produit est consommé (supprimé) par convert_pdf_with au
        // passage — sinon le tmpdir système ramasse des .md orphelins.
        assert!(!target_md.exists());
    }

    #[test]
    fn convert_pdf_with_replie_sur_lextraction_locale_quand_mineru_echoue() {
        let tmp = tempfile::tempdir().unwrap();
        let script_path = tmp.path().join("fake_mineru_echec.sh");
        std::fs::write(&script_path, "#!/bin/sh\necho 'Uploading'\n>&2 echo 'Error: quota dépassé'\nexit 1\n").unwrap();
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&script_path).unwrap().permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&script_path, perms).unwrap();
        }
        let mineru = MineruResolution { script: Some(script_path.to_string_lossy().into_owned()), reason: None };
        // PDF réel (fixture de parité) : la conversion locale doit réussir
        // ensuite, avec le warning MinerU qui documente la tentative ratée —
        // même contrat que Node (repli, jamais un échec sec).
        let pdf_path = PathBuf::from("../../../gallery/server/tests/kb_parity/inputs/sample.pdf");
        assert!(pdf_path.exists(), "fixture PDF introuvable: {}", pdf_path.display());
        let convert = convert_pdf_with(&pdf_path, tmp.path(), mineru, "/bin/sh", &mut |_| {}).unwrap();
        assert_eq!(convert.converter, "local");
        assert!(!convert.markdown.is_empty());
        let warning = convert.warning.expect("un échec MinerU doit produire un warning");
        assert!(warning.starts_with("MinerU a échoué (Error: quota dépassé)"), "warning: {warning}");
        assert!(warning.ends_with("— texte extrait localement"), "warning: {warning}");
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
