//! Dispatch des commandes — miroir de `runKbCommand`/`parseArgs` dans
//! `sidecar/kb_cli.mjs`. Vague 1 (plan 065, groupe a « store local ») et
//! vague 2 (groupes b « gbrain » et c « article-local ») implémentées
//! complet. MinerU réel (API cloud) et `article-doi` en réseau restent hors
//! périmètre au sens strict des fixtures groupe c/d — `article-doi` est tout
//! de même câblé (réutilise `crossref_meta`) car non coûteux, seulement non
//! vérifié par une fixture de parité dédiée (groupe d, réseau réel, skippé
//! contre ce binaire).

use crate::search::Passage;
use crate::store::{default_knowledge_dir, flag, KnowledgeStore};
use serde_json::{json, Map, Value};
use std::io::Read;
use std::path::PathBuf;

const COMMANDS: &[&str] = &[
    "add", "list", "remove", "search", "gbrain-search", "gbrain-page", "kb-text", "promote-page",
    "collection", "tag", "archive", "article-import", "article-write", "article-draft",
    "article-list", "article-doi",
];

const BOOLEAN_FLAGS: &[&str] = &["write", "archived", "off", "ragdoc", "progress"];

fn usage() -> String {
    [
        "Usage: atelier-kb <add|list|remove|search|gbrain-search|promote-page|article-import|article-write> [options]".to_string(),
        "  add    --kind file|pdf|web|youtube|note|folder|gbrain [--origin <chemin|url|slug>] [--title <t>] [--text <t>]".to_string(),
        "         (--text - lit le texte sur stdin — gros contenus, capture browser)".to_string(),
        "  list".to_string(),
        "  remove --id <id>".to_string(),
        "  search --id <id> --query <question> [--limit 5]".to_string(),
        "  gbrain-search --query <mots-clés> [--limit 12]   (corpus NAS)".to_string(),
        "  gbrain-page --slug <articles/…>                  (markdown d'une page, lecture seule)".to_string(),
        "  kb-text --id <id>                                (texte stocké d'une source, lecture seule)".to_string(),
        "  promote-page --id <id> [--slug atelier/…] [--write]   (page directe gbrain)".to_string(),
        "  article-import --path <article.pdf>              (PDF → markdown + fiche, sans écriture)".to_string(),
        "  article-draft --draft <id>                       (texte complet du brouillon)".to_string(),
        "  article-list [--limit 20]                        (articles du corpus, récents d'abord)".to_string(),
        "  article-doi --doi 10.xxxx/yyy                    (fiche de référence Crossref, sans PDF)".to_string(),
        "  article-write --draft <id> --slug <articles/…> [--title/--authors/--year/--journal/--doi]".to_string(),
        "                [--origin <pdf>] [--converter <mineru|local>] [--ragdoc]".to_string(),
        "  collection --add <titre> | --rename <slug> --title <t> | --remove <slug>".to_string(),
        "  tag (--id <id> | --ids a,b,c) --collection <slug> [--off]".to_string(),
        "  archive (--id <id> | --ids a,b,c) [--off]".to_string(),
        format!("Option commune: --dir <répertoire> (défaut: {})", default_knowledge_dir().display()),
    ]
    .join("\n")
}

struct Parsed {
    command: String,
    options: Map<String, Value>,
}

fn parse_args(argv: &[String]) -> Result<Parsed, String> {
    let command = argv.first().cloned().unwrap_or_default();
    if !COMMANDS.contains(&command.as_str()) {
        return Err(usage());
    }
    let mut options = Map::new();
    let mut i = 1usize;
    while i < argv.len() {
        let key = &argv[i];
        let flag_name = key.strip_prefix("--").unwrap_or("");
        if key.starts_with("--") && BOOLEAN_FLAGS.contains(&flag_name) {
            options.insert(flag_name.to_string(), json!(true));
            i += 1;
            continue;
        }
        if !key.starts_with("--") || i + 1 >= argv.len() {
            return Err(format!("Argument invalide: {key}\n{}", usage()));
        }
        options.insert(flag_name.to_string(), json!(argv[i + 1]));
        i += 2;
    }
    Ok(Parsed { command, options })
}

fn opt_str<'a>(options: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    options.get(key).and_then(Value::as_str)
}
fn opt_bool(options: &Map<String, Value>, key: &str) -> bool {
    options.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn read_all_stdin() -> Result<String, String> {
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf).map_err(|e| e.to_string())?;
    Ok(buf)
}

/// Miroir de `decoratePassage` (kb_cli.mjs) : ajoute `location`/`cite` et,
/// selon le kind, un lien ouvrable. Kind `zotero` (lien surligné) et
/// `youtube` (timestamp) restent hors périmètre vague 1 (jamais produits par
/// `store.add`).
fn decorate_passage(source: &Value, passage: &Passage, file: Option<&str>) -> Value {
    let id = source.get("id").and_then(Value::as_str).unwrap_or("");
    let kind = source.get("kind").and_then(Value::as_str).unwrap_or("");
    let origin = source.get("origin").and_then(Value::as_str);
    let mut out = json!({
        "page": passage.page,
        "quote": passage.quote,
        "context": passage.context,
        "score": passage.score,
    });
    let obj = out.as_object_mut().unwrap();
    if let Some(file) = file {
        obj.insert("file".into(), json!(file));
        obj.insert("location".into(), json!(file));
        obj.insert("cite".into(), json!(format!("[kb:{id} · {file}]")));
        return out;
    }
    if kind == "pdf" || kind == "zotero" {
        obj.insert("location".into(), json!(format!("p.{}", passage.page)));
        obj.insert("cite".into(), json!(format!("[kb:{id} · p.{}]", passage.page)));
        return out;
    }
    if kind == "gbrain" {
        if let Some(origin) = origin {
            obj.insert("location".into(), json!(origin));
            obj.insert("cite".into(), json!(format!("[kb:{id} · {origin}]")));
            return out;
        }
    }
    obj.insert("location".into(), Value::Null);
    obj.insert("cite".into(), json!(format!("[kb:{id}]")));
    if kind == "web" {
        if let Some(origin) = origin {
            obj.insert("markdownLink".into(), json!(format!("[Ouvrir la page]({origin})")));
        }
    } else if kind == "file" {
        if let Some(origin) = origin {
            obj.insert("markdownLink".into(), json!(format!("[{origin}]({origin})")));
        }
    }
    out
}

pub fn run(argv: &[String]) -> Result<Value, String> {
    let parsed = parse_args(argv)?;
    let dir: PathBuf = opt_str(&parsed.options, "dir").filter(|s| !s.is_empty()).map(PathBuf::from).unwrap_or_else(default_knowledge_dir);
    let mut store = KnowledgeStore::open(dir);

    match parsed.command.as_str() {
        "list" => {
            let collection = opt_str(&parsed.options, "collection");
            let archived = opt_bool(&parsed.options, "archived");
            let sources = store.list(collection, archived);
            let archived_count = store.list_all().len() as i64 - store.list(None, false).len() as i64;
            let payload = json!({
                "ok": true,
                "count": sources.len(),
                "sources": sources,
                "collections": store.collections,
                "archivedCount": archived_count,
                "archivedSources": store.list(None, true),
            });
            Ok(flag(payload, &store.warning))
        }
        "collection" => {
            if let Some(title) = opt_str(&parsed.options, "add") {
                let slug = store.collection_add(title)?;
                Ok(flag(json!({"ok": true, "slug": slug, "collections": store.collections}), &store.warning))
            } else if let Some(slug) = opt_str(&parsed.options, "rename") {
                let title = opt_str(&parsed.options, "title").unwrap_or_default();
                store.collection_rename(slug, title)?;
                Ok(flag(json!({"ok": true, "slug": slug, "collections": store.collections}), &store.warning))
            } else if let Some(slug) = opt_str(&parsed.options, "remove") {
                store.collection_remove(slug)?;
                Ok(flag(json!({"ok": true, "removed": slug, "collections": store.collections}), &store.warning))
            } else {
                Err(format!("collection: --add, --rename ou --remove requis\n{}", usage()))
            }
        }
        "tag" => {
            let collection = opt_str(&parsed.options, "collection").ok_or("Argument requis: --collection".to_string())?;
            let off = opt_bool(&parsed.options, "off");
            if let Some(ids) = opt_str(&parsed.options, "ids") {
                let ids: Vec<String> = ids.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                let applied = store.tag_many(&ids, collection, off)?;
                return Ok(flag(json!({"ok": true, "applied": applied}), &store.warning));
            }
            let id = opt_str(&parsed.options, "id").ok_or("Argument requis: --id (ou --ids a,b,c)".to_string())?;
            store.tag_source(id, collection, off)?;
            Ok(flag(json!({"ok": true, "source": store.get(id).cloned()}), &store.warning))
        }
        "archive" => {
            let off = opt_bool(&parsed.options, "off");
            if let Some(ids) = opt_str(&parsed.options, "ids") {
                let ids: Vec<String> = ids.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
                let applied = store.archive_many(&ids, off)?;
                return Ok(flag(json!({"ok": true, "applied": applied}), &store.warning));
            }
            let id = opt_str(&parsed.options, "id").ok_or("Argument requis: --id (ou --ids a,b,c)".to_string())?;
            store.archive_source(id, off)?;
            Ok(flag(json!({"ok": true, "source": store.get(id).cloned()}), &store.warning))
        }
        "remove" => {
            let id = opt_str(&parsed.options, "id").ok_or("Argument requis: --id".to_string())?.to_string();
            store.remove(&id)?;
            Ok(flag(json!({"ok": true, "removed": id}), &store.warning))
        }
        "kb-text" => {
            let id = opt_str(&parsed.options, "id").ok_or("Argument requis: --id".to_string())?;
            let entry = store.get(id).cloned().ok_or_else(|| format!("Source inconnue: {id}"))?;
            let base = json!({
                "ok": true,
                "id": entry.get("id").cloned().unwrap_or(Value::Null),
                "kind": entry.get("kind").cloned().unwrap_or(Value::Null),
                "title": entry.get("title").cloned().unwrap_or(Value::Null),
                "origin": entry.get("origin").and_then(Value::as_str).unwrap_or(""),
                "chars": entry.get("chars").cloned().unwrap_or(json!(0)),
            });
            if entry.get("kind").and_then(Value::as_str) == Some("folder") {
                let files = store.folder_files_for(id)?;
                let files_json: Vec<Value> = files
                    .iter()
                    .map(|f| {
                        let chars: usize = f.pages.iter().map(|p| crate::csv_digest::js_len(&p.text)).sum();
                        json!({"rel": f.rel, "chars": chars})
                    })
                    .collect();
                let mut obj = base.as_object().unwrap().clone();
                obj.insert("files".into(), json!(files_json));
                obj.insert("text".into(), json!(""));
                return Ok(Value::Object(obj));
            }
            let text = store.full_text(id)?;
            let mut obj = base.as_object().unwrap().clone();
            obj.insert("text".into(), json!(text));
            Ok(Value::Object(obj))
        }
        "search" => {
            let id = opt_str(&parsed.options, "id").ok_or("Argument requis: --id".to_string())?;
            let query = opt_str(&parsed.options, "query").ok_or("Argument requis: --query".to_string())?;
            let limit_raw = opt_str(&parsed.options, "limit").and_then(|s| s.parse::<i64>().ok()).unwrap_or(5);
            let limit = limit_raw.clamp(1, 10) as usize;
            let (source, passages) = store.search(id, query, limit)?;
            let decorated: Vec<Value> = passages.iter().map(|(p, file)| decorate_passage(&source, p, file.as_deref())).collect();
            Ok(flag(
                json!({"ok": true, "source": source, "query": query, "count": decorated.len(), "passages": decorated}),
                &store.warning,
            ))
        }
        "add" => {
            let kind = opt_str(&parsed.options, "kind").unwrap_or_default().to_string();
            let origin = opt_str(&parsed.options, "origin").map(|s| s.to_string());
            let title = opt_str(&parsed.options, "title").map(|s| s.to_string());
            let text = if opt_str(&parsed.options, "text") == Some("-") {
                Some(read_all_stdin()?)
            } else {
                opt_str(&parsed.options, "text").map(|s| s.to_string())
            };
            let (source, refreshed) = store.add(&kind, origin.as_deref(), title.as_deref(), text.as_deref())?;
            Ok(flag(json!({"ok": true, "source": source, "refreshed": refreshed}), &store.warning))
        }
        // --- gbrain (plan 065, vague 2, groupe b) — wrappers fins autour de
        // `runGbrain` ; jamais wrappés par `flag()` (Node ne le fait pas non
        // plus pour ces commandes).
        "gbrain-search" => {
            let query = opt_str(&parsed.options, "query").ok_or("Argument requis: --query".to_string())?;
            let limit_raw = opt_str(&parsed.options, "limit").and_then(|s| s.parse::<i64>().ok()).unwrap_or(12);
            let limit = limit_raw.clamp(1, 25) as usize;
            let raw = crate::gbrain::run_gbrain(&["search", query], None)?;
            let results: Vec<Value> = crate::gbrain::parse_gbrain_search(&raw)
                .into_iter()
                .take(limit)
                .map(|h| json!({"slug": h.slug, "snippet": h.snippet}))
                .collect();
            Ok(json!({"ok": true, "query": query, "count": results.len(), "results": results}))
        }
        "gbrain-page" => {
            let slug = opt_str(&parsed.options, "slug").ok_or("Argument requis: --slug".to_string())?;
            let markdown = crate::gbrain::run_gbrain(&["get", slug], None)?.trim().to_string();
            if markdown.is_empty() || crate::gbrain::gbrain_not_found(&markdown) {
                return Err(format!("Page gbrain introuvable: {slug}"));
            }
            Ok(json!({"ok": true, "slug": slug, "chars": markdown.chars().count(), "markdown": markdown}))
        }
        "promote-page" => {
            let id = opt_str(&parsed.options, "id").ok_or("Argument requis: --id".to_string())?;
            let entry = store.get(id).cloned().ok_or_else(|| format!("Source inconnue: {id}"))?;
            let full_text = store.full_text(id)?;
            let slug = opt_str(&parsed.options, "slug");
            let write = opt_bool(&parsed.options, "write");
            crate::gbrain::promote_page(&entry, &full_text, slug, write)
        }
        // --- article-* (plan 065, vague 2, groupe c) — MinerU réel hors
        // périmètre, repli local (pdftotext) systématique.
        "article-import" => {
            let path = opt_str(&parsed.options, "path").unwrap_or("").to_string();
            let progress = opt_bool(&parsed.options, "progress");
            let pdf_cache_dir = store.pdf_cache_dir().to_path_buf();
            if progress {
                let mut cb = |stage: &str| {
                    let line = json!({"progress": {"stage": stage}});
                    println!("{}", serde_json::to_string(&line).unwrap());
                };
                crate::article::import_article(&path, &store.dir, &pdf_cache_dir, Some(&mut cb))
            } else {
                crate::article::import_article(&path, &store.dir, &pdf_cache_dir, None)
            }
        }
        "article-doi" => {
            let doi = opt_str(&parsed.options, "doi").unwrap_or("");
            crate::article::import_doi(doi, &store.dir)
        }
        "article-list" => {
            let limit = opt_str(&parsed.options, "limit").and_then(|s| s.parse::<i64>().ok()).unwrap_or(20);
            let articles = crate::article::list_articles(limit)?;
            let arr: Vec<Value> = articles
                .into_iter()
                .map(|a| json!({"slug": a.slug, "type": a.kind, "date": a.date, "title": a.title}))
                .collect();
            Ok(json!({"ok": true, "count": arr.len(), "articles": arr}))
        }
        "article-draft" => {
            let draft = opt_str(&parsed.options, "draft").ok_or("Argument requis: --draft".to_string())?;
            let markdown = crate::article::read_draft(&store.dir, draft)?;
            Ok(json!({"ok": true, "draftId": draft, "chars": markdown.chars().count(), "markdown": markdown}))
        }
        "article-write" => {
            let draft = opt_str(&parsed.options, "draft").ok_or("Argument requis: --draft".to_string())?;
            let slug = opt_str(&parsed.options, "slug");
            let meta = crate::article::ArticleMeta {
                title: opt_str(&parsed.options, "title").unwrap_or("").to_string(),
                authors: opt_str(&parsed.options, "authors").unwrap_or("").to_string(),
                journal: opt_str(&parsed.options, "journal").unwrap_or("").to_string(),
                doi: opt_str(&parsed.options, "doi").unwrap_or("").to_string(),
                year: opt_str(&parsed.options, "year").and_then(|s| s.parse::<i64>().ok()),
            };
            let origin = opt_str(&parsed.options, "origin").unwrap_or("");
            let converter = opt_str(&parsed.options, "converter").unwrap_or("");
            let ragdoc = opt_bool(&parsed.options, "ragdoc");
            crate::article::write_article(&store.dir, draft, slug, &meta, origin, converter, ragdoc)
        }
        other => Err(format!("commande inconnue: {other}\n{}", usage())),
    }
}
