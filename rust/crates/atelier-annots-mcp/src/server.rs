//! Boucle MCP stdio (JSON-RPC, un message par ligne) et les trois outils.

use crate::library::{sort_by_reference, Article, Config, Filter, Hit, Library, Source};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{BufRead, Write};

const DEFAULT_LIMIT: usize = 100;
/// En recherche thématique, passages gardés par article, pour que quelques
/// articles très annotés n'occupent pas toute la réponse.
const DEFAULT_PER_ARTICLE: usize = 5;
const MAX_LIMIT: usize = 1000;

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
indique à quoi le passage lui servira (discussion, introduction, méthode…).\n\
Faire le moins d'appels possible : search_annotations couvre TOUS les articles en un seul appel \
et renvoie les passages groupés par article, avec référence et page. Ne jamais ouvrir les \
articles un par un avec get_article_annotations.\n\
- « Les passages que j'ai notés pour X » : search_annotations avec only_with_note=true et sans \
query, puis garder les notes qui concernent X, même formulées autrement.\n\
- « Des passages utiles pour ma discussion (sur tel sujet) » : UN search_annotations avec \
match=\"any\" et une query de 8 à 15 mots-clés du sujet en anglais ET en français (les articles \
sont en anglais, les notes en français), par exemple « albedo impurities soot black carbon \
wildfire smoke deposition feux suie ». Les passages les plus pertinents viennent en premier, 5 au plus \
par article (per_article pour en voir plus). \
Relancer au plus une fois avec d'autres mots si c'est trop maigre.\n\
- Tout relire : search_annotations sans query (limit jusqu'à 1000, par tranches si besoin).\n\
- get_article_annotations : seulement quand Thierry nomme des articles précis ; les passer \
tous dans un seul appel (articles: [...]).\n\
Citer chaque élément avec sa référence et sa page.";

fn tools() -> Value {
    json!([
        {
            "name": "search_annotations",
            "description": "Cherche en un seul appel dans les passages surlignés et les notes personnelles \
    de Thierry, sur tous ses articles. Résultats groupés par article (référence, titre), avec la page, \
    le passage et la note. Sans accents ni casse. match=\"all\" (défaut) : tous les mots de `query` \
    doivent apparaître ; match=\"any\" : un mot suffit et les articles qui en portent le plus viennent \
    en premier, pour une recherche thématique large.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Mots à trouver dans le passage, la note ou la référence. Vide = tout."},
                    "match": {"type": "string", "enum": ["all", "any"], "description": "all : tous les mots requis (défaut). any : un mot suffit, classement par nombre de mots trouvés.", "default": "all"},
                    "only_with_note": {"type": "boolean", "description": "Ne garder que les passages qui ont une note personnelle.", "default": false},
                    "articles": {"type": "array", "items": {"type": "string"}, "description": "Limiter à ces articles : clé Zotero, nom d'auteur, année ou mot du titre."},
                    "color": {"type": "string", "description": "Couleur de surlignage : jaune, vert, bleu, rose."},
                    "limit": {"type": "integer", "description": "Nombre maximal de passages (100 par défaut).", "minimum": 1, "maximum": MAX_LIMIT},
                    "per_article": {"type": "integer", "description": "Avec match=any : passages gardés par article (5 par défaut).", "minimum": 1}
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
            "description": "Toutes les annotations d'un ou de plusieurs articles nommés, dans l'ordre des pages. \
    Passer tous les articles voulus dans un seul appel. Pour une recherche par thème, utiliser plutôt search_annotations.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "articles": {"type": "array", "items": {"type": "string"}, "description": "Clés Zotero, noms d'auteur, années ou mots du titre."},
                    "article": {"type": "string", "description": "Un seul article (ancienne forme de `articles`)."}
                }
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

/// `articles` (liste ou texte) et l'ancien `article`, réunis.
fn arg_articles(args: &Value) -> Vec<String> {
    let mut out = Vec::new();
    for key in ["articles", "article"] {
        match args.get(key) {
            Some(Value::String(s)) => out.push(s.clone()),
            Some(Value::Array(list)) => {
                out.extend(list.iter().filter_map(Value::as_str).map(str::to_string))
            }
            _ => {}
        }
    }
    out.retain(|a| !a.trim().is_empty());
    out
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
            let any = arg_str(args, "match").trim().eq_ignore_ascii_case("any");
            let filter = Filter {
                query: arg_str(args, "query"),
                any,
                articles: arg_articles(args),
                color: arg_str(args, "color"),
                only_with_note: args
                    .get("only_with_note")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            };
            let mut hits = lib.search(&filter);
            let total = hits.len();
            let total_articles = distinct_articles(&hits);
            let mut capped = 0;
            let per_article = args
                .get("per_article")
                .and_then(Value::as_u64)
                .map(|n| (n as usize).max(1))
                .unwrap_or(DEFAULT_PER_ARTICLE);
            if any {
                // Les passages qui portent le plus de mots d'abord (tri
                // stable : à égalité, l'ordre des références), au plus
                // `per_article` par article, puis les articles dans l'ordre de
                // leur meilleur passage.
                hits.sort_by(|x, y| y.score.cmp(&x.score));
                let mut seen: BTreeMap<String, usize> = BTreeMap::new();
                hits.retain(|h| {
                    let n = seen.entry(h.article.key.clone()).or_default();
                    *n += 1;
                    *n <= per_article
                });
                capped = total - hits.len();
                hits.truncate(limit);
                sort_by_reference(&mut hits);
                let mut best: BTreeMap<String, usize> = BTreeMap::new();
                for h in &hits {
                    let b = best.entry(h.article.key.clone()).or_default();
                    *b = (*b).max(h.score);
                }
                hits.sort_by(|x, y| best[&y.article.key].cmp(&best[&x.article.key]));
            } else {
                hits.truncate(limit);
            }
            let mut out = format!("{total} passage(s) dans {total_articles} article(s)");
            if hits.len() < total {
                out.push_str(&format!(
                    " ; {} affichés dans {} article(s)",
                    hits.len(),
                    distinct_articles(&hits)
                ));
                if capped > 0 {
                    out.push_str(&format!(
                        " (les plus pertinents, {per_article} au plus par article)"
                    ));
                } else {
                    out.push_str(" (affiner la recherche ou augmenter limit)");
                }
            }
            out.push_str(".\n");
            out.push_str(&format_groups(&hits));
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
            let wanted = arg_articles(args);
            if wanted.is_empty() {
                return Err("Paramètre `articles` requis.".into());
            }
            let mut out = String::new();
            let mut hits = Vec::new();
            let mut missing = Vec::new();
            for w in &wanted {
                let found = lib.search(&Filter {
                    query: String::new(),
                    any: false,
                    articles: vec![w.clone()],
                    color: String::new(),
                    only_with_note: false,
                });
                let keys: std::collections::BTreeSet<&str> =
                    found.iter().map(|h| h.article.key.as_str()).collect();
                match keys.len() {
                    0 => missing.push(w.as_str()),
                    1 => {}
                    n => out.push_str(&format!(
                        "{n} articles correspondent à « {w} » ; préciser avec la clé entre crochets.\n"
                    )),
                }
                for h in found {
                    if !hits
                        .iter()
                        .any(|seen: &Hit| std::ptr::eq(seen.annotation, h.annotation))
                    {
                        hits.push(h);
                    }
                }
            }
            if !missing.is_empty() {
                out.push_str(&format!(
                    "Aucun article annoté ne correspond à « {} ».\n",
                    missing.join(" », « ")
                ));
            }
            sort_by_reference(&mut hits);
            out.push_str(&format_groups(&hits));
            Ok(with_warnings(out.trim_start().to_string(), &lib))
        }
        _ => Err(format!("Outil inconnu : {name}")),
    }
}

fn distinct_articles(hits: &[Hit]) -> usize {
    hits.iter()
        .map(|h| h.article.key.as_str())
        .collect::<std::collections::BTreeSet<_>>()
        .len()
}

/// Passages groupés par article : l'en-tête (référence, clé, titre) une fois,
/// puis une ligne par passage.
fn format_groups(hits: &[Hit]) -> String {
    let mut out = String::new();
    let mut current = "";
    for h in hits {
        let art = &h.article;
        if art.key != current {
            current = &art.key;
            out.push_str(&format!("\n## {} [{}]\n", art.citation, art.key));
            if !art.title.is_empty() {
                out.push_str(&format!("{}\n", art.title));
            }
        }
        out.push_str(&format_annotation(h.annotation));
    }
    out
}

fn format_annotation(a: &crate::library::Annotation) -> String {
    let mut s = format!("- p. {}", if a.page.is_empty() { "?" } else { &a.page });
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
    if !a.passage.is_empty() {
        s.push_str(&format!(" « {} »", a.passage));
    }
    s.push('\n');
    if !a.note.is_empty() {
        s.push_str(&format!("  Note : {}\n", a.note.replace('\n', "\n    ")));
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
        assert!(
            text.starts_with("2 passage(s) dans 1 article(s)."),
            "{text}"
        );
        assert!(
            text.contains(
                "## Warren & Wiscombe 1980 [ABCD1234]\nA model for the spectral albedo of snow\n"
            ),
            "{text}"
        );
        assert!(
            text.contains("- p. 12 (jaune) « In a remote-sensing measurement"),
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
        assert!(
            text.starts_with("3 passage(s) dans 1 article(s) ; 1 affichés"),
            "{text}"
        );
    }

    #[test]
    fn thematic_search_takes_one_call_and_ranks_by_matched_words() {
        let (_dir, config) = setup();
        let (text, is_error) = call_tool(
            &config,
            "search_annotations",
            json!({"query": "remote-sensing misinterpreted grain glaciers", "match": "any"}),
        );
        assert!(!is_error);
        assert!(
            text.starts_with("3 passage(s) dans 1 article(s)."),
            "{text}"
        );
        let (all, _) = call_tool(
            &config,
            "search_annotations",
            json!({"query": "remote-sensing misinterpreted grain glaciers"}),
        );
        assert!(all.starts_with("0 passage(s)"), "{all}");
        let (top, _) = call_tool(
            &config,
            "search_annotations",
            json!({"query": "remote-sensing misinterpreted grain", "match": "any", "limit": 1}),
        );
        assert!(
            top.contains("p. 12") && !top.contains("p. 3 "),
            "the passage with the most words wins: {top}"
        );
    }

    #[test]
    fn thematic_search_caps_passages_per_article() {
        let (_dir, config) = setup();
        let (text, _) = call_tool(
            &config,
            "search_annotations",
            json!({"query": "remote-sensing grain glaciers", "match": "any", "per_article": 2}),
        );
        assert!(
            text.starts_with("3 passage(s) dans 1 article(s) ; 2 affichés dans 1 article(s) (les plus pertinents, 2 au plus par article)"),
            "{text}"
        );
    }

    #[test]
    fn several_articles_in_one_call() {
        let (_dir, config) = setup();
        let (text, is_error) = call_tool(
            &config,
            "get_article_annotations",
            json!({"articles": ["ABCD1234", "Nobody"]}),
        );
        assert!(!is_error);
        assert!(
            text.contains("Aucun article annoté ne correspond à « Nobody »"),
            "{text}"
        );
        assert!(
            text.contains("## Warren & Wiscombe 1980 [ABCD1234]"),
            "{text}"
        );
        assert_eq!(text.matches("## ").count(), 1, "{text}");
    }
}
