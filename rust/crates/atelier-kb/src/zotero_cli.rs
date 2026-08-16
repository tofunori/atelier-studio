//! Dispatch du binaire `atelier-zotero-passages-rs` — miroir de
//! `runPassageSearch`/`parseArgs` (`sidecar/zotero_passage_cli.mjs`). Même
//! contrat argv/stdout que le wrapper sh existant (`sidecar/atelier-zotero-passages`,
//! qui spawn `node zotero_passage_cli.mjs`) : une seule commande, `search`,
//! en mode mono-PDF ou corpus.

use crate::zotero;
use serde_json::{json, Value};
use std::collections::HashMap;

const USAGE: &str = "Usage: atelier-zotero-passages search --pdf <path> --zotero-key <key> --pdf-key <key> --pdf-file <name> --query <question> [--limit 5]\n   or: atelier-zotero-passages search --corpus --query <question> [--limit 5]";

struct Opts {
    map: HashMap<String, String>,
    corpus: bool,
}

fn parse_args(argv: &[String]) -> Result<Opts, String> {
    if argv.first().map(String::as_str) != Some("search") {
        return Err(USAGE.to_string());
    }
    let mut map = HashMap::new();
    let mut corpus = false;
    let mut i = 1usize;
    while i < argv.len() {
        let key = &argv[i];
        if !key.starts_with("--") {
            return Err(format!("Argument invalide: {key}"));
        }
        let name = &key[2..];
        if name == "corpus" {
            corpus = true;
            i += 1;
            continue;
        }
        if i + 1 >= argv.len() {
            return Err(format!("Argument invalide: {key}"));
        }
        map.insert(name.to_string(), argv[i + 1].clone());
        i += 2;
    }
    let required: &[&str] = if corpus { &["query"] } else { &["pdf", "zotero-key", "pdf-key", "pdf-file", "query"] };
    for name in required {
        if !map.contains_key(*name) {
            return Err(format!("Argument requis: --{name}"));
        }
    }
    Ok(Opts { map, corpus })
}

pub fn run(argv: &[String]) -> Result<Value, String> {
    let opts = parse_args(argv)?;
    let limit_raw = opts.map.get("limit").and_then(|s| s.parse::<i64>().ok()).unwrap_or(5);
    let limit = limit_raw.clamp(1, 10) as usize;
    let query = opts.map.get("query").cloned().unwrap_or_default();

    if opts.corpus {
        let cache_dir = zotero::default_cache_dir();
        let results = zotero::search_corpus(&cache_dir, &query, limit);
        let arr: Vec<Value> = results
            .iter()
            .map(|r| {
                let link = zotero::passage_link(&r.zotero_key, &r.pdf_key, &r.pdf_file, r.page, &r.quote);
                json!({
                    "page": r.page,
                    "quote": r.quote,
                    "score": r.score,
                    "pdfFile": r.pdf_file,
                    "zoteroKey": r.zotero_key,
                    "pdfKey": r.pdf_key,
                    "markdownLink": format!("[Ouvrir le passage — p. {}]({link})", r.page),
                })
            })
            .collect();
        return Ok(json!({"ok": true, "corpus": true, "query": query, "count": arr.len(), "results": arr}));
    }

    let pdf = opts.map.get("pdf").cloned().unwrap_or_default();
    let zotero_key = opts.map.get("zotero-key").cloned().unwrap_or_default();
    let pdf_key = opts.map.get("pdf-key").cloned().unwrap_or_default();
    let pdf_file = opts.map.get("pdf-file").cloned().unwrap_or_default();
    let storage_root = zotero::default_storage_root();
    let cache_dir = zotero::default_cache_dir();
    let result = zotero::search_pdf(&pdf, &zotero_key, &pdf_key, &pdf_file, &query, limit, &cache_dir, &storage_root)?;
    let passages: Vec<Value> = result
        .passages
        .iter()
        .map(|p| {
            let link = zotero::passage_link(&zotero_key, &pdf_key, &pdf_file, p.page, &p.quote);
            json!({
                "page": p.page,
                "quote": p.quote,
                "context": p.context,
                "score": p.score,
                "markdownLink": format!("[Ouvrir le passage — p. {}]({link})", p.page),
            })
        })
        .collect();
    Ok(json!({
        "ok": true,
        "pdf": result.pdf.to_string_lossy(),
        "cached": result.cached,
        "query": query,
        "count": passages.len(),
        "passages": passages,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_args_exige_search_et_les_champs_requis() {
        assert!(run(&["list".to_string()]).unwrap_err().starts_with("Usage:"));
        let err = run(&["search".to_string(), "--pdf".to_string(), "/x.pdf".to_string()]).unwrap_err();
        assert!(err.contains("Argument requis"), "{err}");
        let err = run(&["search".to_string(), "--corpus".to_string()]).unwrap_err();
        assert_eq!(err, "Argument requis: --query");
    }

    #[test]
    fn corpus_vide_repond_ok_sans_resultats() {
        // ATELIER_TEST_HOME n'existe pas côté zotero (module frère, pas de
        // hook de test) — le cache par défaut n'existant presque certainement
        // pas sur la machine de CI, `search_corpus` doit dégrader en liste
        // vide plutôt que paniquer.
        let out = run(&["search".to_string(), "--corpus".to_string(), "--query".to_string(), "improbable-query-xyz".to_string()]).unwrap();
        assert_eq!(out["ok"], true);
        assert_eq!(out["corpus"], true);
        assert!(out["results"].as_array().unwrap().len() <= 10);
    }
}
