//! Extraction PDF (`extractPdfPages` de `sidecar/zotero_passages.mjs`) —
//! spawn externe `pdftotext` inchangé (motif "spawns inchangés" du plan 065).

use crate::search::{split_pdf_pages, Page};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;

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

fn run_pdftotext(pdftotext_bin: &str, args: &[&str], pdf_path: &Path) -> Result<String, String> {
    let output = Command::new(pdftotext_bin)
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

/// Extrait les pages d'un PDF, avec cache par sha256(chemin)[..24] dans
/// `cache_dir` (clé sur `size`+`mtimeMs`, version 2). Repli `-layout` si la
/// première passe ne rend aucun texte.
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

    let pdftotext = "pdftotext";
    let mut stdout = run_pdftotext(pdftotext, &["-enc", "UTF-8"], pdf_path)?;
    let mut pages = split_pdf_pages(&stdout);
    if pages.is_empty() {
        stdout = run_pdftotext(pdftotext, &["-layout", "-enc", "UTF-8"], pdf_path)?;
        pages = split_pdf_pages(&stdout);
    }
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
