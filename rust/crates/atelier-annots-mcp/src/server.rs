//! Boucle MCP stdio (JSON-RPC, un message par ligne) et les trois outils.

use crate::library::{Article, Config, Filter, Library, Source};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{BufRead, Write};

const DEFAULT_LIMIT: usize = 60;
const MAX_LIMIT: usize = 400;

pub fn run(config: &Config) -> Result<(), String> {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => handle(config, &msg),
            Err(e) => Some(json!({"jsonrpc": "2.0", "id": null,
                "error": {"code": -32700, "message": format!("JSON invalide : {e}")}})),
        };
        if let Some(reply) = reply {
            writeln!(stdout, "{reply}").map_err(|e| e.to_string())?;
            stdout.flush().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Une requête → sa réponse ; une notification (sans `id`) → rien.
pub fn handle(config: &Config, msg: &Value) -> Option<Value> {
    let id = msg.get("id")?.clone();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or_else(|| json!({}));
    let result = match method {
        "initialize" => json!({
            "protocolVersion": params.get("protocolVersion").cloned().unwrap_or(json!("2024-11-05")),
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "atelier-annotations", "version": env!("CARGO_PKG_VERSION")},
            "instructions": INSTRUCTIONS,
        }),
        "ping" => json!({}),
        "tools/list" => json!({"tools": tools()}),
        "resources/list" => json!({"resources": []}),
        "prompts/list" => json!({"prompts": []}),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| json!({}));
            match call(config, name, &args) {
                Ok(text) => json!({"content": [{"type": "text", "text": text}], "isError": false}),
                Err(text) => json!({"content": [{"type": "text", "text": text}], "isError": true}),
            }
        }
        _ => {
            return Some(json!({"jsonrpc": "2.0", "id": id,
                "error": {"code": -32601, "message": format!("méthode inconnue : {method}")}}))
        }
    };
    Some(json!({"jsonrpc": "2.0", "id": id, "result": result}))
}

const INSTRUCTIONS: &str =
    "Annotations de Thierry sur ses articles (lecteur PDF d'Atelier et Zotero), \
en lecture seule. « Note » = ce que Thierry a écrit pour lui-même sur le passage : c'est là qu'il \
indique à quoi le passage lui servira (discussion, introduction, méthode…). Pour « les passages \
que j'ai notés pour X », appeler search_annotations avec only_with_note=true (sans query ou avec \
des mots larges), puis lire les notes pour garder celles qui concernent X, même formulées \
autrement. Citer chaque élément avec sa référence et sa page.";

fn tools() -> Value {
    json!([
        {
            "name": "search_annotations",
            "description": "Cherche dans les passages surlignés et les notes personnelles de Thierry. \
    Chaque résultat donne l'article (référence, titre), la page, le passage et la note. \
    Tous les mots de `query` doivent apparaître (sans tenir compte des accents ni de la casse).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Mots à trouver dans le passage, la note ou la référence. Vide = tout."},
                    "only_with_note": {"type": "boolean", "description": "Ne garder que les passages qui ont une note personnelle.", "default": false},
                    "article": {"type": "string", "description": "Limiter à un article : clé Zotero, nom d'auteur, année ou mot du titre."},
                    "color": {"type": "string", "description": "Couleur de surlignage : jaune, vert, bleu, rose."},
                    "limit": {"type": "integer", "description": "Nombre maximal de résultats (60 par défaut).", "minimum": 1, "maximum": MAX_LIMIT}
                }
            },
            "annotations": {"readOnlyHint": true}
        },
        {
            "name": "list_annotated_articles",
            "description": "Liste les articles annotés, avec le nombre de passages et de notes de chacun.",
            "inputSchema": {"type": "object", "properties": {}},
            "annotations": {"readOnlyHint": true}
        },
        {
            "name": "get_article_annotations",
            "description": "Toutes les annotations d'un article, dans l'ordre des pages.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "article": {"type": "string", "description": "Clé Zotero, nom d'auteur, année ou mot du titre."}
                },
                "required": ["article"]
            },
            "annotations": {"readOnlyHint": true}
        }
    ])
}

fn arg_str(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn call(config: &Config, name: &str, args: &Value) -> Result<String, String> {
    let lib = Library::load(config);
    match name {
        "search_annotations" => {
            let limit = args
                .get("limit")
                .and_then(Value::as_u64)
                .map(|n| (n as usize).clamp(1, MAX_LIMIT))
                .unwrap_or(DEFAULT_LIMIT);
            let filter = Filter {
                query: arg_str(args, "query"),
                article: arg_str(args, "article"),
                color: arg_str(args, "color"),
                only_with_note: args
                    .get("only_with_note")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            };
            let hits = lib.search(&filter);
            let mut out = format!("{} résultat(s)", hits.len());
            if hits.len() > limit {
                out.push_str(&format!(
                    ", {limit} affichés (affiner la recherche ou augmenter limit)"
                ));
            }
            out.push_str(".\n");
            for (a, art) in hits.iter().take(limit) {
                out.push('\n');
                out.push_str(&format_annotation(a, art, true));
            }
            Ok(with_warnings(out, &lib))
        }
        "list_annotated_articles" => {
            let mut counts: BTreeMap<String, (Article, usize, usize)> = BTreeMap::new();
            for a in &lib.annotations {
                let art = lib.article(&a.article);
                let entry = counts
                    .entry(format!("{}\u{0}{}", art.citation, art.key))
                    .or_insert((art, 0, 0));
                entry.1 += 1;
                if !a.note.is_empty() {
                    entry.2 += 1;
                }
            }
            let mut out = format!("{} article(s) annoté(s).\n", counts.len());
            for (art, passages, notes) in counts.values() {
                out.push_str(&format!(
                    "\n- {} [{}] : {passages} passage(s), {notes} note(s)",
                    art.citation, art.key
                ));
                if !art.title.is_empty() {
                    out.push_str(&format!("\n  {}", art.title));
                }
            }
            Ok(with_warnings(out, &lib))
        }
        "get_article_annotations" => {
            let wanted = arg_str(args, "article");
            if wanted.trim().is_empty() {
                return Err("Paramètre `article` requis.".into());
            }
            let filter = Filter {
                query: String::new(),
                article: wanted.clone(),
                color: String::new(),
                only_with_note: false,
            };
            let hits = lib.search(&filter);
            let keys: std::collections::BTreeSet<&str> =
                hits.iter().map(|(a, _)| a.article.as_str()).collect();
            if hits.is_empty() {
                return Ok(with_warnings(
                    format!("Aucun article annoté ne correspond à « {wanted} »."),
                    &lib,
                ));
            }
            let mut out = String::new();
            if keys.len() > 1 {
                out.push_str(&format!("{} articles correspondent à « {wanted} » ; préciser avec la clé entre crochets.\n", keys.len()));
            }
            let mut current = "";
            for (a, art) in &hits {
                if a.article != current {
                    current = &a.article;
                    out.push_str(&format!("\n## {} [{}]\n", art.citation, art.key));
                    if !art.title.is_empty() {
                        out.push_str(&format!("{}\n", art.title));
                    }
                }
                out.push('\n');
                out.push_str(&format_annotation(a, art, false));
            }
            Ok(with_warnings(out, &lib))
        }
        _ => Err(format!("Outil inconnu : {name}")),
    }
}

fn format_annotation(a: &crate::library::Annotation, art: &Article, with_article: bool) -> String {
    let mut s = String::new();
    if with_article {
        s.push_str(&format!("- {} [{}]", art.citation, art.key));
        if !a.page.is_empty() {
            s.push_str(&format!(", p. {}", a.page));
        }
    } else {
        s.push_str(&format!(
            "- p. {}",
            if a.page.is_empty() { "?" } else { &a.page }
        ));
    }
    let mut tags = Vec::new();
    if !a.color.is_empty() {
        tags.push(a.color.clone());
    }
    if a.source == Source::Zotero {
        tags.push("annoté dans Zotero".into());
    }
    if !tags.is_empty() {
        s.push_str(&format!(" ({})", tags.join(", ")));
    }
    s.push('\n');
    if with_article && !art.title.is_empty() {
        s.push_str(&format!("  Titre : {}\n", art.title));
    }
    if !a.passage.is_empty() {
        s.push_str(&format!("  Passage : « {} »\n", a.passage));
    }
    if !a.note.is_empty() {
        s.push_str(&format!(
            "  Note : {}\n",
            a.note.replace('\n', "\n        ")
        ));
    }
    s
}

fn with_warnings(mut out: String, lib: &Library) -> String {
    for w in &lib.warnings {
        out.push_str(&format!("\n\n(Remarque : {w}.)"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, Config) {
        let dir = tempfile::tempdir().unwrap();
        crate::zotero::tests::fixture(dir.path());
        std::fs::write(
            dir.path().join("pdf_annots.json"),
            json!({"zotero/ABCD1234/Warren and Wiscombe - 1980 - A model.pdf": [
                {"id": 1, "page": 12, "kind": "hl", "text": "In a remote-sensing measurement this spectral pattern could be misinterpreted", "memo": "Contredit notre hypothèse, à reprendre dans la discussion", "note": "Explique ce passage", "color": "rgba(255,213,74,.40)"},
                {"id": 2, "page": 3, "kind": "hl", "text": "Grain size evolves with time", "color": "rgba(120,220,140,.40)"}
            ]})
            .to_string(),
        )
        .unwrap();
        let config = Config {
            app_dir: dir.path().into(),
            zotero_dir: dir.path().into(),
            cache_dir: dir.path().join("cache"),
        };
        (dir, config)
    }

    fn call_tool(config: &Config, name: &str, args: Value) -> (String, bool) {
        let reply = handle(
            config,
            &json!({"jsonrpc": "2.0", "id": 7, "method": "tools/call",
            "params": {"name": name, "arguments": args}}),
        )
        .unwrap();
        assert_eq!(reply["id"], 7);
        let result = &reply["result"];
        (
            result["content"][0]["text"].as_str().unwrap().to_string(),
            result["isError"].as_bool().unwrap(),
        )
    }

    #[test]
    fn initialize_and_list_tools() {
        let (_dir, config) = setup();
        let init = handle(
            &config,
            &json!({"jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2025-06-18"}}),
        )
        .unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(init["result"]["serverInfo"]["name"], "atelier-annotations");
        assert!(handle(
            &config,
            &json!({"jsonrpc": "2.0", "method": "notifications/initialized"})
        )
        .is_none());
        let list = handle(
            &config,
            &json!({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}),
        )
        .unwrap();
        let names: Vec<&str> = list["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            [
                "search_annotations",
                "list_annotated_articles",
                "get_article_annotations"
            ]
        );
        let unknown = handle(
            &config,
            &json!({"jsonrpc": "2.0", "id": 3, "method": "nope"}),
        )
        .unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
    }

    #[test]
    fn notes_for_the_discussion_come_back_with_reference_and_page() {
        let (_dir, config) = setup();
        let (text, is_error) = call_tool(
            &config,
            "search_annotations",
            json!({"only_with_note": true}),
        );
        assert!(!is_error);
        assert!(text.starts_with("2 résultat(s)"), "{text}");
        assert!(
            text.contains("Warren & Wiscombe 1980 [ABCD1234], p. 12 (jaune)"),
            "{text}"
        );
        assert!(text.contains("Note : Contredit notre hypothèse, à reprendre dans la discussion"));
        assert!(
            text.contains("Note : Comparer avec nos glaciers"),
            "Zotero comments are notes too"
        );
        assert!(text.contains("annoté dans Zotero"));
        assert!(
            !text.contains("Explique ce passage"),
            "chat text never leaks as a note"
        );
        assert!(
            !text.contains("Grain size"),
            "passages without a note are filtered"
        );
    }

    #[test]
    fn article_view_is_in_page_order() {
        let (_dir, config) = setup();
        let (text, _) = call_tool(
            &config,
            "get_article_annotations",
            json!({"article": "wiscombe"}),
        );
        assert!(
            text.contains("## Warren & Wiscombe 1980 [ABCD1234]"),
            "{text}"
        );
        assert!(text.contains("A model for the spectral albedo of snow"));
        let p3 = text.find("p. 3").unwrap();
        let p7 = text.find("p. 7").unwrap();
        let p12 = text.find("p. 12").unwrap();
        assert!(p3 < p7 && p7 < p12, "{text}");
        let (missing, _) = call_tool(
            &config,
            "get_article_annotations",
            json!({"article": "Nobody"}),
        );
        assert!(missing.starts_with("Aucun article"));
        let (_, is_error) = call_tool(&config, "get_article_annotations", json!({}));
        assert!(is_error);
    }

    #[test]
    fn list_counts_passages_and_notes() {
        let (_dir, config) = setup();
        let (text, _) = call_tool(&config, "list_annotated_articles", json!({}));
        assert!(text.contains("1 article(s) annoté(s)."), "{text}");
        assert!(
            text.contains("Warren & Wiscombe 1980 [ABCD1234] : 3 passage(s), 2 note(s)"),
            "{text}"
        );
    }

    #[test]
    fn search_limit_is_reported() {
        let (_dir, config) = setup();
        let (text, _) = call_tool(&config, "search_annotations", json!({"limit": 1}));
        assert!(text.starts_with("3 résultat(s), 1 affichés"), "{text}");
    }
}
