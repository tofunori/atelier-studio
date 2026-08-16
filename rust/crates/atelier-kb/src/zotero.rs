//! Port des parties de `sidecar/zotero_passages.mjs` propres au binaire
//! `atelier-zotero-passages` (module frère de `kb_cli.mjs`, hors périmètre
//! strict du store KB — voir `plans/065-inventaire-kb.md` §0) : résolution
//! anti-traversée du stockage Zotero, extraction PDF avec métadonnées zotero
//! (cache DÉDIÉ, distinct du cache KB de `pdf.rs`, mêmes chemins par défaut
//! que Node pour rester lisible par les deux CLI), recherche corpus (scan du
//! cache d'extraction) et lien profond de citation. Le chunking/scoring lui
//! même (`search_passages`, `score_candidate_text`, `split_paragraphs`) vit
//! dans `search.rs`, partagé avec le moteur KB.

use crate::search::{self, split_pdf_pages, Page, Passage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const CACHE_VERSION: u32 = 2;

fn home_dir() -> PathBuf {
    std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/"))
}

pub fn default_cache_dir() -> PathBuf {
    home_dir().join("Library").join("Application Support").join("atelier-studio").join("zotero-passages")
}

pub fn default_storage_root() -> PathBuf {
    home_dir().join("Zotero").join("storage")
}

/// Miroir de `resolveZoteroPdf` : le PDF doit exister et vivre SOUS
/// `storage_root` (garde anti-traversée), extension `.pdf`.
pub fn resolve_zotero_pdf(pdf_path: &str, storage_root: &Path) -> Result<PathBuf, String> {
    if pdf_path.is_empty() || !Path::new(pdf_path).exists() {
        return Err("PDF Zotero introuvable".to_string());
    }
    let root = std::fs::canonicalize(storage_root).map_err(|_| "PDF hors du stockage Zotero".to_string())?;
    let actual = std::fs::canonicalize(pdf_path).map_err(|_| "PDF Zotero introuvable".to_string())?;
    let rel = actual.strip_prefix(&root).map_err(|_| "PDF hors du stockage Zotero".to_string())?;
    if rel.as_os_str().is_empty() {
        return Err("PDF hors du stockage Zotero".to_string());
    }
    if !actual.to_string_lossy().to_lowercase().ends_with(".pdf") {
        return Err("Le fichier Zotero doit être un PDF".to_string());
    }
    Ok(actual)
}

fn cache_path_for(pdf_path: &Path, cache_dir: &Path) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(pdf_path.to_string_lossy().as_bytes());
    let digest = hex::encode(hasher.finalize());
    cache_dir.join(format!("{}.json", &digest[..24]))
}

fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

#[derive(Serialize, Deserialize, Clone)]
struct CachedPage {
    page: u32,
    text: String,
}

#[derive(Serialize, Deserialize)]
struct ZCache {
    version: u32,
    size: u64,
    #[serde(rename = "mtimeMs")]
    mtime_ms: f64,
    pages: Vec<CachedPage>,
    #[serde(rename = "zoteroKey", default, skip_serializing_if = "Option::is_none")]
    zotero_key: Option<String>,
    #[serde(rename = "pdfKey", default, skip_serializing_if = "Option::is_none")]
    pdf_key: Option<String>,
    #[serde(rename = "pdfFile", default, skip_serializing_if = "Option::is_none")]
    pdf_file: Option<String>,
}

pub struct Extracted {
    pub pages: Vec<Page>,
    pub cached: bool,
}

fn run_pdftotext(args: &[&str], pdf_path: &Path) -> Result<String, String> {
    let output = std::process::Command::new("pdftotext")
        .args(args)
        .arg(pdf_path)
        .arg("-")
        .output()
        .map_err(|e| format!("pdftotext indisponible: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() { "Extraction PDF impossible".to_string() } else { stderr });
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Miroir de `extractPdfPages` (`zotero_passages.mjs`) : cache dédié
/// (distinct de `pdf::extract_pdf_pages`, qui sert le store KB) portant en
/// plus `zoteroKey`/`pdfKey`/`pdfFile` — consommés par `search_corpus` pour
/// construire les liens profonds sans re-parcourir Zotero.
pub fn extract_pdf_pages(
    pdf_path: &Path,
    cache_dir: &Path,
    zotero_key: &str,
    pdf_key: &str,
    pdf_file: &str,
) -> Result<Extracted, String> {
    let stat = std::fs::metadata(pdf_path).map_err(|e| format!("PDF introuvable: {e}"))?;
    let size = stat.len();
    let mtime = mtime_ms(&stat);
    let cache_path = cache_path_for(pdf_path, cache_dir);
    if let Ok(raw) = std::fs::read_to_string(&cache_path) {
        if let Ok(cached) = serde_json::from_str::<ZCache>(&raw) {
            if cached.version == CACHE_VERSION && cached.size == size && cached.mtime_ms == mtime {
                return Ok(Extracted {
                    pages: cached.pages.into_iter().map(|p| Page { page: p.page, text: p.text }).collect(),
                    cached: true,
                });
            }
        }
    }

    let mut stdout = run_pdftotext(&["-enc", "UTF-8"], pdf_path)?;
    let mut pages = split_pdf_pages(&stdout);
    if pages.is_empty() {
        stdout = run_pdftotext(&["-layout", "-enc", "UTF-8"], pdf_path)?;
        pages = split_pdf_pages(&stdout);
    }
    if pages.is_empty() {
        return Err("Aucun texte extractible dans ce PDF (OCR requis)".to_string());
    }

    std::fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let payload = ZCache {
        version: CACHE_VERSION,
        size,
        mtime_ms: mtime,
        pages: pages.iter().map(|p| CachedPage { page: p.page, text: p.text.clone() }).collect(),
        zotero_key: Some(zotero_key.to_string()),
        pdf_key: Some(pdf_key.to_string()),
        pdf_file: Some(pdf_file.to_string()),
    };
    let tmp = cache_dir.join(format!(".{}.{}.tmp", cache_path.file_name().unwrap().to_string_lossy(), std::process::id()));
    std::fs::write(&tmp, serde_json::to_string(&payload).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &cache_path).map_err(|e| e.to_string())?;

    Ok(Extracted { pages, cached: false })
}

/// Miroir de `bestPageParagraph` : le paragraphe le mieux noté d'une page
/// (jamais la page entière) — `focusPassageQuote` n'est ensuite appliqué qu'à
/// CE paragraphe, pas à la page brute (en-têtes/pieds de page filtrés).
pub(crate) fn best_page_paragraph(text: &str, query_tokens: &[String], normalized_query: &str, generic: bool) -> String {
    let paragraphs = search::split_paragraphs(text);
    if paragraphs.is_empty() {
        return text.to_string();
    }
    let mut best = paragraphs[0].clone();
    let mut best_score = f64::NEG_INFINITY;
    for paragraph in &paragraphs {
        let score = search::score_candidate_text(paragraph, query_tokens, normalized_query, generic);
        if score > best_score {
            best_score = score;
            best = paragraph.clone();
        }
    }
    best
}

pub struct CorpusPassage {
    pub page: u32,
    pub quote: String,
    pub score: f64,
    pub pdf_file: String,
    pub zotero_key: String,
    pub pdf_key: String,
}

/// Miroir de `searchCorpus` : scan de tout le cache d'extraction (pas la
/// bibliothèque Zotero elle-même — l'index existe déjà dès qu'un PDF a été
/// recherché une première fois). Un fichier de cache sans
/// `zoteroKey`/`pdfKey`/`pdfFile` (format legacy) est exclu : aucun lien
/// fiable n'en serait dérivable.
pub fn search_corpus(cache_dir: &Path, query: &str, limit: usize) -> Vec<CorpusPassage> {
    let cap = limit.clamp(1, 10);
    let query_tokens = search::query_tokens(query);
    let normalized_query = search::normalize_search_text(query);
    let generic = query_tokens.is_empty();

    let mut merged: Vec<CorpusPassage> = Vec::new();
    let Ok(entries) = std::fs::read_dir(cache_dir) else {
        return merged;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&path) else { continue };
        let Ok(cache) = serde_json::from_str::<ZCache>(&raw) else { continue };
        if cache.version != CACHE_VERSION {
            continue;
        }
        let (Some(zotero_key), Some(pdf_key), Some(pdf_file)) = (cache.zotero_key, cache.pdf_key, cache.pdf_file) else {
            continue;
        };
        for page in &cache.pages {
            if page.text.is_empty() {
                continue;
            }
            let score = search::score_candidate_text(&page.text, &query_tokens, &normalized_query, generic);
            if !generic && score < 7.0 {
                continue;
            }
            let paragraph = best_page_paragraph(&page.text, &query_tokens, &normalized_query, generic);
            let quote = search::focus_passage_quote(&paragraph, query);
            merged.push(CorpusPassage {
                page: page.page,
                quote,
                score: (score * 100.0).round() / 100.0,
                pdf_file: pdf_file.clone(),
                zotero_key: zotero_key.clone(),
                pdf_key: pdf_key.clone(),
            });
        }
    }
    merged.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    merged.truncate(cap);
    merged
}

/// Miroir de `passageLink` — encodage `application/x-www-form-urlencoded`
/// (même famille que `URLSearchParams.toString()` côté Node).
pub fn passage_link(zotero_key: &str, pdf_key: &str, pdf_file: &str, page: u32, quote: &str) -> String {
    let quote_capped: String = quote.chars().take(900).collect();
    let mut ser = url::form_urlencoded::Serializer::new(String::new());
    ser.append_pair("key", zotero_key);
    ser.append_pair("pdfKey", pdf_key);
    ser.append_pair("file", pdf_file);
    ser.append_pair("page", &page.to_string());
    ser.append_pair("quote", &quote_capped);
    format!("#atelier-zotero-passage?{}", ser.finish())
}

pub struct PdfSearchResult {
    pub pdf: PathBuf,
    pub cached: bool,
    pub passages: Vec<Passage>,
}

/// Recherche mono-PDF (`search --pdf …`) : résolution anti-traversée +
/// extraction (avec métadonnées zotero) + `search_passages` (moteur partagé
/// `search.rs`).
pub fn search_pdf(
    pdf_path: &str,
    zotero_key: &str,
    pdf_key: &str,
    pdf_file: &str,
    query: &str,
    limit: usize,
    cache_dir: &Path,
    storage_root: &Path,
) -> Result<PdfSearchResult, String> {
    let resolved = resolve_zotero_pdf(pdf_path, storage_root)?;
    let extracted = extract_pdf_pages(&resolved, cache_dir, zotero_key, pdf_key, pdf_file)?;
    let passages = search::search_passages(&extracted.pages, query, limit);
    Ok(PdfSearchResult { pdf: resolved, cached: extracted.cached, passages })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolve_zotero_pdf_rejette_hors_stockage_et_extension() {
        let root = tempdir().unwrap();
        let storage = root.path().join("storage");
        std::fs::create_dir_all(&storage).unwrap();
        let inside = storage.join("ABCD1234").join("doc.pdf");
        std::fs::create_dir_all(inside.parent().unwrap()).unwrap();
        std::fs::write(&inside, b"%PDF-1.4").unwrap();
        let outside = root.path().join("outside.pdf");
        std::fs::write(&outside, b"%PDF-1.4").unwrap();
        let not_pdf = storage.join("ABCD1234").join("notes.txt");
        std::fs::write(&not_pdf, b"x").unwrap();

        assert!(resolve_zotero_pdf(&inside.to_string_lossy(), &storage).is_ok());
        assert!(resolve_zotero_pdf(&outside.to_string_lossy(), &storage).is_err());
        assert!(resolve_zotero_pdf(&not_pdf.to_string_lossy(), &storage).is_err());
        assert!(resolve_zotero_pdf("/chemin/inexistant.pdf", &storage).is_err());
    }

    #[test]
    fn passage_link_encode_comme_urlsearchparams() {
        let link = passage_link("ITEM1", "PDFKEY2", "article & notes.pdf", 3, "une citation avec espaces & « guillemets »");
        assert!(link.starts_with("#atelier-zotero-passage?"));
        assert!(link.contains("key=ITEM1"));
        assert!(link.contains("pdfKey=PDFKEY2"));
        // espace -> '+' (form-urlencoded, comme URLSearchParams), '&' encodé.
        assert!(link.contains("file=article+%26+notes.pdf"));
        assert!(link.contains("page=3"));
    }

    #[test]
    fn search_corpus_ignore_le_cache_legacy_sans_metadonnees_zotero() {
        let dir = tempdir().unwrap();
        // fichier legacy : pas de zoteroKey/pdfKey/pdfFile -> exclu.
        std::fs::write(
            dir.path().join("legacy.json"),
            serde_json::json!({"version": 2, "size": 1, "mtimeMs": 1.0, "pages": [{"page":1, "text":"albedo results show a significant decrease over the study period"}]}).to_string(),
        )
        .unwrap();
        // fichier complet : trouvé.
        std::fs::write(
            dir.path().join("full.json"),
            serde_json::json!({
                "version": 2, "size": 1, "mtimeMs": 1.0,
                "pages": [{"page":1, "text":"albedo results show a significant decrease over the study period, roughly 4.2 percent."}],
                "zoteroKey": "IK1", "pdfKey": "PK1", "pdfFile": "doc.pdf",
            })
            .to_string(),
        )
        .unwrap();
        let results = search_corpus(dir.path(), "albedo results", 5);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].pdf_key, "PK1");
    }
}
