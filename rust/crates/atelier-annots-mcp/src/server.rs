//! Boucle MCP stdio (JSON-RPC, un message par ligne) et les outils.

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
    "Annotations de Thierry sur ses articles (lecteur PDF d'Atelier et Zotero). « Note » = ce que Thierry a écrit pour lui-même sur le passage : c'est là qu'il \
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
Citer chaque élément avec sa référence et sa page.\n\
- read_article : le texte du PDF Zotero d'un article (annoté ou non), page par page ; le lire avant \
de surligner si l'article n'est pas déjà dans la conversation.\n\
- highlight_passage : SEULEMENT quand Thierry demande de surligner. Il voit le surlignage apparaître \
dans le lecteur d'Atelier. La citation doit être recopiée mot pour mot du texte de l'article (une \
phrase ou un court paragraphe), avec sa page si elle est connue ; tous les passages d'un même \
article dans un seul appel (passages: [...]), chacun avec sa couleur (color) et son style \
(style : surligner par défaut, souligner pour une phrase à citer mot pour mot) s'ils diffèrent. \
Ne jamais surligner un passage paraphrasé. Donner à \
chaque passage un memo : une note courte en français disant pourquoi il est surligné (« pour la \
discussion : … »), jamais le mot « Claude » (l'origine est enregistrée à part).\n\
- update_highlights / remove_highlights : SEULEMENT sur demande de Thierry, et seulement pour les \
surlignages faits par Claude ; ceux de Thierry sont intouchables. Désigner chaque surlignage par un \
extrait de son texte (et sa page), ou all=true pour tous ceux de Claude dans l'article.";

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
                    "color": {"type": "string", "description": "Couleur de surlignage : jaune, vert, bleu, rose, orange, violet."},
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
        },
        {
            "name": "read_article",
            "description": "Texte intégral du PDF Zotero d'un article, page par page (un paragraphe par ligne), \
    pour le lire et en recopier des passages mot pour mot avant highlight_passage. Marche pour tout article \
    de Zotero qui a un PDF, annoté ou non : si plusieurs correspondent, la réponse les liste avec leur clé.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "article": {"type": "string", "description": "Clé Zotero de l'article, ou nom d'auteur et année, ou mots du titre."},
                    "pages": {"type": "string", "description": "Pages voulues : « 3 », « 2-4 », « 1, 5-6 ». Absent = tout l'article."}
                },
                "required": ["article"]
            },
            "annotations": {"readOnlyHint": true}
        },
        {
            "name": "highlight_passage",
            "description": "Surligne (ou souligne, style=\"souligner\") un ou plusieurs passages cités mot pour mot dans le PDF Zotero d'un article ; \
    Thierry les voit apparaître dans le lecteur d'Atelier. Le passage est retrouvé dans le texte du PDF \
    (accents, ligatures et césures tolérés) ; s'il est introuvable, rien n'est surligné et la réponse le dit. \
    Un passage déjà surligné n'est pas doublé. À n'utiliser que sur demande explicite.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "article": {"type": "string", "description": "Clé Zotero de l'article, ou nom d'auteur et année, ou mots du titre."},
                    "passages": {
                        "type": "array",
                        "maxItems": crate::highlight::MAX_PASSAGES,
                        "description": "Passages à surligner dans cet article.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "quote": {"type": "string", "description": "Texte exact du passage, recopié de l'article."},
                                "page": {"type": "integer", "minimum": 1, "description": "Page du PDF (1 = première), si connue."},
                                "memo": {"type": "string", "description": "Note affichée dans la bulle : une phrase courte en français disant pourquoi ce passage compte (par exemple « pour la discussion : limite de la quantification »), sans paraphraser le passage. Ne pas y écrire « Claude » : l'origine est déjà enregistrée."},
                                "color": {"type": "string", "enum": ["jaune", "vert", "bleu", "rose", "orange", "violet"], "description": "Couleur de ce passage (absente = `color` de l'appel)."},
                                "style": {"type": "string", "enum": ["surligner", "souligner"], "description": "Style de ce passage (absent = `style` de l'appel)."}
                            },
                            "required": ["quote"]
                        }
                    },
                    "quote": {"type": "string", "description": "Un seul passage (forme courte de `passages`)."},
                    "page": {"type": "integer", "minimum": 1, "description": "Avec `quote` : sa page."},
                    "memo": {"type": "string", "description": "Avec `quote` : sa note (pourquoi ce passage compte)."},
                    "color": {"type": "string", "enum": ["jaune", "vert", "bleu", "rose", "orange", "violet"], "description": "Couleur par défaut des passages (jaune si absente) ; chaque passage peut donner la sienne."},
                    "style": {"type": "string", "enum": ["surligner", "souligner"], "description": "Style par défaut des passages : surligner (défaut) ou souligner, par exemple pour la phrase à citer mot pour mot ; chaque passage peut donner le sien."}
                },
                "required": ["article"]
            },
            "annotations": {"readOnlyHint": false, "destructiveHint": false, "idempotentHint": true}
        },
        {
            "name": "update_highlights",
            "description": "Change la couleur, le style (surligné ou souligné) et/ou la note personnelle de surlignages FAITS PAR CLAUDE dans un article \
    (jamais ceux de Thierry). Le changement apparaît dans le lecteur d'Atelier. À n'utiliser que sur demande explicite.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "article": {"type": "string", "description": "Clé Zotero de l'article, ou nom d'auteur et année, ou mots du titre."},
                    "passages": {
                        "type": "array",
                        "maxItems": crate::highlight::MAX_PASSAGES,
                        "description": "Surlignages visés, chacun désigné par un extrait de son texte (12 caractères au moins).",
                        "items": {
                            "type": "object",
                            "properties": {
                                "quote": {"type": "string", "description": "Extrait du texte surligné."},
                                "page": {"type": "integer", "minimum": 1, "description": "Sa page, pour lever une ambiguïté."}
                            },
                            "required": ["quote"]
                        }
                    },
                    "quote": {"type": "string", "description": "Un seul surlignage (forme courte de `passages`)."},
                    "page": {"type": "integer", "minimum": 1, "description": "Avec `quote` : sa page."},
                    "all": {"type": "boolean", "description": "Tous les surlignages de Claude dans cet article.", "default": false},
                    "color": {"type": "string", "enum": ["jaune", "vert", "bleu", "rose", "orange", "violet"], "description": "Nouvelle couleur (absente = inchangée)."},
                    "style": {"type": "string", "enum": ["surligner", "souligner"], "description": "Nouveau style (absent = inchangé)."},
                    "memo": {"type": "string", "description": "Nouvelle note personnelle (absente = inchangée, vide = retirée)."}
                },
                "required": ["article"]
            },
            "annotations": {"readOnlyHint": false, "destructiveHint": false, "idempotentHint": true}
        },
        {
            "name": "remove_highlights",
            "description": "Supprime des surlignages FAITS PAR CLAUDE dans un article (jamais ceux de Thierry). \
    Ils disparaissent du lecteur d'Atelier. À n'utiliser que sur demande explicite.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "article": {"type": "string", "description": "Clé Zotero de l'article, ou nom d'auteur et année, ou mots du titre."},
                    "passages": {
                        "type": "array",
                        "maxItems": crate::highlight::MAX_PASSAGES,
                        "description": "Surlignages visés, chacun désigné par un extrait de son texte (12 caractères au moins).",
                        "items": {
                            "type": "object",
                            "properties": {
                                "quote": {"type": "string", "description": "Extrait du texte surligné."},
                                "page": {"type": "integer", "minimum": 1, "description": "Sa page, pour lever une ambiguïté."}
                            },
                            "required": ["quote"]
                        }
                    },
                    "quote": {"type": "string", "description": "Un seul surlignage (forme courte de `passages`)."},
                    "page": {"type": "integer", "minimum": 1, "description": "Avec `quote` : sa page."},
                    "all": {"type": "boolean", "description": "Tous les surlignages de Claude dans cet article.", "default": false}
                },
                "required": ["article"]
            },
            "annotations": {"readOnlyHint": false, "destructiveHint": true, "idempotentHint": true}
        }
    ])
}

/// `passages` et la forme courte `quote` / `page` / `memo`, réunis. Chaque
/// élément de `passages` peut porter sa propre `color` et son propre `style`.
fn arg_passages(args: &Value) -> Result<Vec<crate::highlight::Request>, String> {
    let one = |v: &Value, own_color: bool| -> Result<Option<crate::highlight::Request>, String> {
        let quote = arg_str(v, "quote");
        if quote.trim().is_empty() {
            return Ok(None);
        }
        let color = match v.get("color").and_then(Value::as_str) {
            Some(c) if own_color && !c.trim().is_empty() => Some(crate::highlight::color_value(c)?),
            _ => None,
        };
        let style = match v.get("style").and_then(Value::as_str) {
            Some(s) if own_color && !s.trim().is_empty() => Some(crate::highlight::style_value(s)?),
            _ => None,
        };
        Ok(Some(crate::highlight::Request {
            quote,
            page: v
                .get("page")
                .and_then(Value::as_u64)
                .filter(|&p| p >= 1)
                .map(|p| p as u32),
            memo: arg_str(v, "memo"),
            color,
            style,
        }))
    };
    let mut out = Vec::new();
    for v in args
        .get("passages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        out.extend(one(v, true)?);
    }
    // la couleur et le style de premier niveau sont ceux de l'appel, pas du passage court
    out.extend(one(args, false)?);
    Ok(out)
}

/// `pages` : « 3 », « 2-4 », « 1, 5-6 » ; vide = toutes.
fn parse_pages(spec: &str, count: u32) -> Result<Vec<u32>, String> {
    let bad = || format!("`pages` illisible « {spec} » : par exemple « 3 », « 2-4 » ou « 1, 5-6 »");
    let mut out = Vec::new();
    for part in spec.split(',').map(str::trim).filter(|p| !p.is_empty()) {
        let (a, b) = match part.split_once('-') {
            Some((a, b)) => (a.trim(), b.trim()),
            None => (part, part),
        };
        let a: u32 = a.parse().map_err(|_| bad())?;
        let b: u32 = if b.is_empty() {
            count
        } else {
            b.parse().map_err(|_| bad())?
        };
        if a == 0 || a > b {
            return Err(bad());
        }
        for p in a..=b.min(count) {
            if !out.contains(&p) {
                out.push(p);
            }
        }
    }
    if out.is_empty() {
        out = (1..=count).collect();
    }
    Ok(out)
}

/// Au-delà, le texte est coupé à une fin de page et la réponse dit où reprendre.
const READ_MAX_CHARS: usize = 120_000;

fn read_article(config: &Config, args: &Value) -> Result<String, String> {
    let target = crate::highlight::resolve(config, &arg_str(args, "article"))?;
    let pages = crate::highlight::read_pdf(&target.pdf)?;
    let wanted = parse_pages(&arg_str(args, "pages"), pages.len() as u32)?;
    let art = &target.article;
    let mut out = format!("{} [{}]", art.citation, art.key);
    if !art.title.is_empty() {
        out.push_str(&format!(" : {}", art.title));
    }
    out.push_str(&format!(
        "\n{} page(s). Texte extrait du PDF, un paragraphe par ligne : recopier les passages mot pour mot dans highlight_passage, avec leur page.\n",
        pages.len()
    ));
    for (i, &p) in wanted.iter().enumerate() {
        let text = crate::highlight::page_text(&pages[p as usize - 1]);
        if i > 0 && out.len() + text.len() > READ_MAX_CHARS {
            let rest: Vec<String> = wanted[i..].iter().map(u32::to_string).collect();
            out.push_str(&format!(
                "\n(Texte coupé ici : relancer avec pages=\"{}\" pour la suite.)",
                rest.join(",")
            ));
            break;
        }
        out.push_str(&format!("\n--- p. {p} ---\n{text}\n"));
    }
    Ok(out)
}

fn highlight_passage(config: &Config, args: &Value) -> Result<String, String> {
    let passages = arg_passages(args)?;
    if passages.is_empty() {
        return Err(
            "Paramètre `passages` (ou `quote`) requis : le texte exact à surligner.".into(),
        );
    }
    if passages.len() > crate::highlight::MAX_PASSAGES {
        return Err(format!(
            "{} passages au plus par appel.",
            crate::highlight::MAX_PASSAGES
        ));
    }
    let color = crate::highlight::color_value(&arg_str(args, "color"))?;
    let style = crate::highlight::style_value(&arg_str(args, "style"))?;
    let target = crate::highlight::resolve(config, &arg_str(args, "article"))?;
    let pages = crate::highlight::read_pdf(&target.pdf)?;
    crate::highlight::highlight(config, &target, &pages, &passages, color, style)
}

fn edit_highlights(config: &Config, name: &str, args: &Value) -> Result<String, String> {
    let passages = arg_passages(args)?;
    let all = args.get("all").and_then(Value::as_bool).unwrap_or(false);
    if passages.is_empty() && !all {
        return Err(
            "Désigner les surlignages : `passages` (ou `quote`) avec un extrait de leur texte, ou all=true."
                .into(),
        );
    }
    if passages.len() > crate::highlight::MAX_PASSAGES {
        return Err(format!(
            "{} passages au plus par appel.",
            crate::highlight::MAX_PASSAGES
        ));
    }
    let edit = if name == "remove_highlights" {
        crate::highlight::Edit::Remove
    } else {
        let color = match args.get("color").and_then(Value::as_str) {
            Some(c) if !c.trim().is_empty() => Some(crate::highlight::color_value(c)?),
            _ => None,
        };
        let style = match args.get("style").and_then(Value::as_str) {
            Some(s) if !s.trim().is_empty() => Some(crate::highlight::style_value(s)?),
            _ => None,
        };
        let memo = args.get("memo").and_then(Value::as_str).map(str::to_string);
        if color.is_none() && memo.is_none() && style.is_none() {
            return Err("Rien à changer : donner `color`, `style` et/ou `memo`.".into());
        }
        crate::highlight::Edit::Update { color, memo, style }
    };
    let target = crate::highlight::resolve(config, &arg_str(args, "article"))?;
    crate::highlight::edit_highlights(config, &target, &passages, all, &edit)
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
    if name == "highlight_passage" {
        return highlight_passage(config, args);
    }
    if name == "read_article" {
        return read_article(config, args);
    }
    if name == "update_highlights" || name == "remove_highlights" {
        return edit_highlights(config, name, args);
    }
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
    if a.underline {
        tags.push("souligné".into());
    }
    if a.by_claude {
        tags.push(
            if a.underline {
                "par Claude"
            } else {
                "surligné par Claude"
            }
            .into(),
        );
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
                "get_article_annotations",
                "read_article",
                "highlight_passage",
                "update_highlights",
                "remove_highlights"
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

    #[test]
    fn highlight_passage_writes_line_rects_into_the_store_once() {
        let pdftotext_ok = std::process::Command::new("pdftotext")
            .arg("-v")
            .output()
            .is_ok();
        if !pdftotext_ok && std::env::var_os("ATELIER_PDFTOTEXT").is_none() {
            eprintln!("pdftotext absent : test sauté");
            return;
        }
        let (dir, config) = setup();
        let storage = dir.path().join("storage/ABCD1234");
        std::fs::create_dir_all(&storage).unwrap();
        std::fs::copy(
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../atelier-gallery/tests/fixtures/reflow/twocol.pdf"
            ),
            storage.join("paper.pdf"),
        )
        .unwrap();
        // « ia-culis » est coupé en fin de ligne dans le PDF.
        let args = json!({"article": "Warren 1980", "color": "vert", "passages": [
            {"quote": "Integer sapien est, iaculis in, pretium quis, viverra ac, nunc.", "page": 1, "memo": "pour la discussion"},
            {"quote": "a sentence that this article never contains anywhere"},
            {"quote": "Surface albedo controls the energy balance of glaciers", "color": "rose"}
        ]});
        let (text, is_error) = call_tool(&config, "highlight_passage", args.clone());
        assert!(!is_error, "{text}");
        assert!(text.contains("surligné p. 1"), "{text}");
        assert!(text.contains("introuvable"), "{text}");

        let store: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("pdf_annots.json")).unwrap(),
        )
        .unwrap();
        let annots = store["zotero/ABCD1234/paper.pdf"].as_array().unwrap();
        assert_eq!(annots.len(), 2);
        assert_eq!(
            annots[1]["color"], "rgba(255,140,160,.40)",
            "a passage's own color wins over the call's"
        );
        let a = &annots[0];
        assert_eq!(a["kind"], "hl");
        assert_eq!(a["page"], 1);
        assert_eq!(a["memo"], "pour la discussion");
        assert_eq!(a["color"], "rgba(120,220,140,.40)");
        assert_eq!(
            a["text"],
            "Integer sapien est, iaculis in, pretium quis, viverra ac, nunc."
        );
        let rects = a["rects"].as_array().unwrap();
        assert_eq!(rects.len(), 2, "one rect per line: {rects:?}");
        for r in rects {
            let r: Vec<f64> = r
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_f64().unwrap())
                .collect();
            assert!(r[0] > 0.0 && r[0] + r[2] < 0.55, "left column: {r:?}");
            assert!(r[3] > 0.005 && r[3] < 0.03, "one text line high: {r:?}");
        }
        // L'autre article du store n'a pas bougé.
        assert_eq!(
            store["zotero/ABCD1234/Warren and Wiscombe - 1980 - A model.pdf"]
                .as_array()
                .unwrap()
                .len(),
            2
        );

        let (text, _) = call_tool(&config, "highlight_passage", args);
        assert!(text.contains("déjà surligné"), "{text}");

        // soulignement, orange : la phrase à citer, même déjà surlignée
        let (text, is_error) = call_tool(
            &config,
            "highlight_passage",
            json!({"article": "Warren 1980", "color": "orange", "passages": [
                {"quote": "Integer sapien est, iaculis in, pretium quis, viverra ac, nunc.", "page": 1, "style": "souligner", "memo": "à citer"},
                {"quote": "Surface albedo controls the energy balance of glaciers", "style": "souligner", "color": "violet"}
            ]}),
        );
        assert!(!is_error, "{text}");
        assert!(text.contains("souligné p. 1"), "{text}");
        assert!(
            !text.contains("déjà surligné"),
            "an underline is not a duplicate of a highlight: {text}"
        );
        let store: Value = serde_json::from_str(
            &std::fs::read_to_string(dir.path().join("pdf_annots.json")).unwrap(),
        )
        .unwrap();
        let annots = store["zotero/ABCD1234/paper.pdf"].as_array().unwrap();
        assert_eq!(annots.len(), 4);
        assert_eq!(annots[2]["kind"], "ul");
        assert_eq!(annots[2]["color"], "rgba(255,160,80,.40)");
        assert_eq!(annots[3]["kind"], "ul");
        assert_eq!(annots[3]["color"], "rgba(185,150,255,.40)");
        let (text, _) = call_tool(
            &config,
            "search_annotations",
            json!({"query": "iaculis", "color": "orange"}),
        );
        assert!(text.contains("(orange, souligné, par Claude)"), "{text}");
        assert_eq!(text.matches("iaculis").count(), 1, "{text}");
        let (text, is_error) = call_tool(
            &config,
            "highlight_passage",
            json!({"article": "Warren 1980", "quote": "Surface albedo controls the energy", "style": "barrer"}),
        );
        assert!(is_error && text.contains("style inconnu"), "{text}");
        let (text, is_error) = call_tool(
            &config,
            "highlight_passage",
            json!({"article": "Nobody 2099", "quote": "anything at all long enough"}),
        );
        assert!(is_error && text.contains("Aucun PDF"), "{text}");
        let (text, is_error) = call_tool(
            &config,
            "highlight_passage",
            json!({"article": "Warren 1980", "passages": [{"quote": "Surface albedo controls the energy", "color": "noir"}]}),
        );
        assert!(is_error && text.contains("couleur inconnue"), "{text}");

        // read_article : n'importe quel PDF de Zotero, page par page
        let (text, is_error) = call_tool(
            &config,
            "read_article",
            json!({"article": "Wiscombe 1980", "pages": "1"}),
        );
        assert!(!is_error, "{text}");
        assert!(
            text.starts_with("Warren & Wiscombe 1980 [ABCD1234] : A model for the spectral albedo of snow\n2 page(s)."),
            "{text}"
        );
        assert!(text.contains("--- p. 1 ---\n"), "{text}");
        assert!(!text.contains("--- p. 2 ---"), "{text}");
        assert!(
            text.contains("Integer sapien est, iaculis in, pretium quis"),
            "hyphenated words are rejoined: {text}"
        );
        let (all, _) = call_tool(&config, "read_article", json!({"article": "ABCD1234"}));
        assert!(all.contains("--- p. 2 ---"), "{all}");
        let (text, is_error) = call_tool(
            &config,
            "read_article",
            json!({"article": "ABCD1234", "pages": "deux"}),
        );
        assert!(is_error && text.contains("`pages` illisible"), "{text}");
    }

    #[test]
    fn a_title_phrase_picks_one_article_among_word_matches() {
        let (dir, config) = setup();
        let db = rusqlite::Connection::open(dir.path().join("zotero.sqlite")).unwrap();
        db.execute_batch(
            "INSERT INTO items VALUES (5, 'PARENT02'), (6, 'EFGH5678');
             INSERT INTO itemAttachments VALUES (6, 5, 'application/pdf', 'storage:other.pdf');
             INSERT INTO itemDataValues VALUES (3, 'Snow albedo and the model of it');
             INSERT INTO itemData VALUES (5, 1, 3);",
        )
        .unwrap();
        drop(db);
        for (key, file) in [("ABCD1234", "paper.pdf"), ("EFGH5678", "other.pdf")] {
            let d = dir.path().join("storage").join(key);
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join(file), b"%PDF").unwrap();
        }
        let err = crate::highlight::resolve(&config, "snow model")
            .err()
            .unwrap();
        assert!(err.starts_with("2 articles correspondent"), "{err}");
        let t = crate::highlight::resolve(&config, "albedo of snow")
            .ok()
            .unwrap();
        assert_eq!(t.article.key, "ABCD1234");
    }

    #[test]
    fn page_ranges() {
        assert_eq!(parse_pages("", 3).unwrap(), [1, 2, 3]);
        assert_eq!(parse_pages("2-", 4).unwrap(), [2, 3, 4]);
        assert_eq!(parse_pages("1, 3-9", 4).unwrap(), [1, 3, 4]);
        assert!(parse_pages("0", 4).is_err());
        assert!(parse_pages("3-1", 4).is_err());
    }

    #[test]
    fn only_claude_highlights_can_be_updated_or_removed() {
        let (dir, config) = setup();
        let rel = crate::highlight::resolve(&config, "ABCD1234").unwrap().rel;
        let store_path = dir.path().join("pdf_annots.json");
        let mut store: Value =
            serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
        store[&rel] = json!([
            {"id": "t1", "page": 2, "kind": "hl", "text": "Snow albedo decreases with grain size", "color": "y"},
            {"id": "9-c0p4", "page": 4, "kind": "hl", "by": "claude", "text": "Black carbon lowers the albedo", "color": "y", "memo": "intro"},
            {"id": "9-c0p5", "page": 5, "kind": "hl", "by": "claude", "text": "of fresh snow in visible light", "color": "y"},
            {"id": "9-c1p6", "page": 6, "kind": "hl", "by": "claude", "text": "Dust matters less than soot here", "color": "y"}
        ]);
        std::fs::write(&store_path, store.to_string()).unwrap();
        let read = || -> Vec<Value> {
            let s: Value =
                serde_json::from_str(&std::fs::read_to_string(&store_path).unwrap()).unwrap();
            s[&rel].as_array().unwrap().clone()
        };

        let (text, is_error) = call_tool(
            &config,
            "update_highlights",
            json!({
                "article": "ABCD1234", "color": "bleu", "memo": "pour la discussion",
                "passages": [{"quote": "lowers the albedo of fresh snow"}, {"quote": "albedo decreases with grain size"}]
            }),
        );
        assert!(!is_error, "{text}");
        assert!(text.contains("modifié p. 4-5"), "{text}");
        assert!(text.contains("surlignage de Thierry"), "{text}");
        let annots = read();
        assert_eq!(annots[0]["color"], "y", "Thierry's highlight is untouched");
        assert_eq!(annots[1]["color"], "rgba(120,170,255,.40)");
        assert_eq!(annots[2]["color"], "rgba(120,170,255,.40)");
        assert_eq!(annots[1]["memo"], "pour la discussion");
        assert!(annots[2].get("memo").is_none());
        assert_eq!(annots[3]["color"], "y");

        let (text, is_error) = call_tool(
            &config,
            "update_highlights",
            json!({"article": "ABCD1234", "quote": "Dust matters less than soot", "style": "souligner", "color": "violet"}),
        );
        assert!(!is_error, "{text}");
        let annots = read();
        assert_eq!(annots[3]["kind"], "ul");
        assert_eq!(annots[3]["color"], "rgba(185,150,255,.40)");
        assert_eq!(annots[0]["kind"], "hl");
        let (text, _) = call_tool(
            &config,
            "update_highlights",
            json!({"article": "ABCD1234", "quote": "Dust matters less than soot", "style": "surligner"}),
        );
        assert!(text.contains("modifié p. 6"), "{text}");
        assert_eq!(read()[3]["kind"], "hl");

        let (text, _) = call_tool(
            &config,
            "remove_highlights",
            json!({
                "article": "ABCD1234", "quote": "Black carbon lowers the albedo", "page": 4
            }),
        );
        assert!(text.contains("supprimé p. 4-5"), "{text}");
        let ids: Vec<String> = read()
            .iter()
            .map(|a| a["id"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(ids, ["t1", "9-c1p6"], "both pages of the passage go");

        let (text, _) = call_tool(&config, "search_annotations", json!({"query": "soot"}));
        assert!(text.contains("surligné par Claude"), "{text}");
        let (text, _) = call_tool(
            &config,
            "remove_highlights",
            json!({"article": "ABCD1234", "all": true}),
        );
        assert!(text.contains("1 surlignage(s) de Claude"), "{text}");
        let ids: Vec<String> = read()
            .iter()
            .map(|a| a["id"].as_str().unwrap().to_string())
            .collect();
        assert_eq!(ids, ["t1"]);
        let (text, is_error) =
            call_tool(&config, "remove_highlights", json!({"article": "ABCD1234"}));
        assert!(is_error && text.contains("all=true"), "{text}");
        let (text, is_error) = call_tool(
            &config,
            "update_highlights",
            json!({"article": "ABCD1234", "all": true}),
        );
        assert!(is_error && text.contains("Rien à changer"), "{text}");
    }
}
