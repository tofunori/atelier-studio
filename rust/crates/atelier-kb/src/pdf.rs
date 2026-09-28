//! Extraction PDF (`extractPdfPages` de `sidecar/zotero_passages.mjs`) —
//! spawn externe de l'outil `atelier-pdf` (PDFium livré avec l'app ; repli
//! `pdftotext`), voir `atelier_pdf::tool::extract_text`.

use crate::search::{split_pdf_pages, Page};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const CACHE_VERSION: u32 = 2;

#[derive(Serialize, Deserialize)]
struct PdfCache {
    version: u32,
    size: u64,
    #[serde(rename = "mtimeMs")]
    mtime_ms: f64,
    pages: Vec<CachedPage>,
}

#[derive(Serialize, Deserialize, Clone)]
struct CachedPage {
    page: u32,
    text: String,
}

pub struct Extracted {
    pub pages: Vec<Page>,
}

fn cache_path_for(pdf_path: &Path, cache_dir: &Path) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(pdf_path.to_string_lossy().as_bytes());
    let digest = hasher.finalize();
    let key = hex::encode(digest);
    cache_dir.join(format!("{}.json", &key[..24]))
}

fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0)
}

/// Extrait les pages d'un PDF, avec cache par sha256(chemin)[..24] dans
/// `cache_dir` (clé sur `size`+`mtimeMs`, version 2). Par poppler, repli
/// `-layout` si la première passe ne rend aucun texte (voir
/// `atelier_pdf::tool`).
pub fn extract_pdf_pages(pdf_path: &Path, cache_dir: &Path) -> Result<Extracted, String> {
    let stat = std::fs::metadata(pdf_path).map_err(|e| format!("PDF introuvable: {e}"))?;
    let size = stat.len();
    let mtime = mtime_ms(&stat);
    let cache_path = cache_path_for(pdf_path, cache_dir);
    if let Ok(raw) = std::fs::read_to_string(&cache_path) {
        if let Ok(cached) = serde_json::from_str::<PdfCache>(&raw) {
            if cached.version == CACHE_VERSION && cached.size == size && cached.mtime_ms == mtime {
                return Ok(Extracted {
                    pages: cached.pages.into_iter().map(|p| Page { page: p.page, text: p.text }).collect(),
                });
            }
        }
    }

    let stdout = atelier_pdf::tool::extract_text(pdf_path)?;
    let pages = split_pdf_pages(&stdout);
    if pages.is_empty() {
        return Err("Aucun texte extractible dans ce PDF (OCR requis)".to_string());
    }

    std::fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
    let payload = PdfCache {
        version: CACHE_VERSION,
        size,
        mtime_ms: mtime,
        pages: pages.iter().map(|p| CachedPage { page: p.page, text: p.text.clone() }).collect(),
    };
    let tmp = cache_dir.join(format!(".{}.{}.tmp", cache_path.file_name().unwrap().to_string_lossy(), std::process::id()));
    std::fs::write(&tmp, serde_json::to_string(&payload).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &cache_path).map_err(|e| e.to_string())?;

    Ok(Extracted { pages })
}
