//! Port de `sidecar/article_meta.mjs` — métadonnées d'article : Zotero
//! (sqlite local, spawn inchangé) → Crossref (réseau réel, `reqwest`) → texte
//! deviné. Ordre et dégradation identiques : toute erreur réseau/sqlite se
//! résorbe en `None` (jamais un throw), miroir des `try { } catch { return
//! null }` de knowledge.mjs/article_meta.mjs.

use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
use std::path::Path;
use std::time::Duration;
use unicode_normalization::UnicodeNormalization;

const CROSSREF_TIMEOUT_MS: u64 = 8000;
const ZOTERO_TIMEOUT_MS: u64 = 5000;
const MAILTO: &str = "laurentstpierrethierry@gmail.com";
pub const TITLE_MATCH_MIN: f64 = 0.75;

#[derive(Clone, Debug, Default)]
pub struct ArticleMeta {
    pub title: String,
    pub authors: String,
    pub journal: String,
    pub doi: String,
    pub year: Option<i64>,
}

#[derive(Clone, Debug, Default)]
pub struct ShapedWork {
    pub abstract_text: String,
    pub title: String,
    pub authors: String,
    pub journal: String,
    pub doi: String,
    pub year: Option<i64>,
}

impl ShapedWork {
    fn as_meta(&self) -> ArticleMeta {
        ArticleMeta {
            title: self.title.clone(),
            authors: self.authors.clone(),
            journal: self.journal.clone(),
            doi: self.doi.clone(),
            year: self.year,
        }
    }
}

/// Une source ne vaut que par ce qu'elle apporte : on ne remplace un champ
/// deviné que par un champ non vide — miroir de `merge()`.
pub fn merge(base: &ArticleMeta, extra: &ArticleMeta) -> ArticleMeta {
    let mut out = base.clone();
    if !extra.title.is_empty() {
        out.title = extra.title.clone();
    }
    if !extra.authors.is_empty() {
        out.authors = extra.authors.clone();
    }
    if !extra.journal.is_empty() {
        out.journal = extra.journal.clone();
    }
    if !extra.doi.is_empty() {
        out.doi = extra.doi.clone();
    }
    if extra.year.is_some() {
        out.year = extra.year;
    }
    out
}

/// Miroir approximatif d'`encodeURIComponent` (octet par octet, alphabet non
/// réservé identique) — utilisé pour composer les URLs Crossref sans tirer de
/// dépendance supplémentaire.
fn encode_uri_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || "-_.!~*'()".contains(c) {
            out.push(c);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// « …/Zotero/storage/8KQ2/aoki-2011.pdf » → clé `8KQ2` — miroir de
/// `zoteroStorageRef`.
fn zotero_storage_key(path: &str) -> Option<String> {
    static RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)[/\\]Zotero[/\\]storage[/\\]([A-Z0-9]{8,})[/\\][^/\\]+$").unwrap());
    RE.captures(path).map(|c| c[1].to_string())
}

fn zotero_db_path() -> String {
    std::env::var("ATELIER_ZOTERO_DB").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
        format!("{home}/Zotero/zotero.sqlite")
    })
}

fn sql_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// `sqlite3 file:<db>?immutable=1 -json <sql>` — miroir de `sqliteJson`.
/// Base verrouillée / sqlite3 absent / timeout / JSON invalide -> liste vide
/// (jamais un throw, comme côté Node).
fn sqlite_json(db: &str, sql: &str) -> Vec<Value> {
    let uri = format!("file:{db}?immutable=1");
    let out = match crate::gbrain::spawn_with_timeout("sqlite3", &[uri.as_str(), "-json", sql], None, Duration::from_millis(ZOTERO_TIMEOUT_MS)) {
        crate::gbrain::SpawnOutcome::Finished { code: 0, stdout, .. } => String::from_utf8_lossy(&stdout).trim().to_string(),
        _ => return Vec::new(),
    };
    if out.is_empty() {
        return Vec::new();
    }
    match serde_json::from_str::<Value>(&out) {
        Ok(Value::Array(items)) => items,
        _ => Vec::new(),
    }
}

/// Métadonnées de l'entrée parente d'une pièce jointe Zotero — miroir de
/// `zoteroMeta`. Jamais exercé en pratique sans bibliothèque Zotero locale
/// (`existsSync(db)` garde), ce qui est le cas de toute machine de test.
pub fn zotero_meta(path: &str) -> Option<ArticleMeta> {
    let key = zotero_storage_key(path)?;
    let db = zotero_db_path();
    if !Path::new(&db).exists() {
        return None;
    }
    let key_q = sql_quote(&key);
    let rows = sqlite_json(
        &db,
        &format!(
            "select f.fieldName as name, v.value as value \
             from items a \
             join itemAttachments ia on ia.itemID = a.itemID \
             join itemData d on d.itemID = ia.parentItemID \
             join itemDataValues v on v.valueID = d.valueID \
             join fields f on f.fieldID = d.fieldID \
             where a.key = {key_q} and f.fieldName in ('title', 'date', 'publicationTitle', 'DOI');"
        ),
    );
    if rows.is_empty() {
        return None;
    }
    let value = |name: &str| -> String {
        rows.iter()
            .find(|r| r.get("name").and_then(Value::as_str) == Some(name))
            .and_then(|r| r.get("value").and_then(Value::as_str))
            .unwrap_or("")
            .to_string()
    };
    let title = value("title");
    if title.is_empty() {
        return None;
    }
    let authors_rows = sqlite_json(
        &db,
        &format!(
            "select c.lastName as last, c.firstName as first \
             from items a \
             join itemAttachments ia on ia.itemID = a.itemID \
             join itemCreators ic on ic.itemID = ia.parentItemID \
             join creators c on c.creatorID = ic.creatorID \
             where a.key = {key_q} \
             order by ic.orderIndex;"
        ),
    );
    let authors = authors_rows
        .iter()
        .filter_map(|r| {
            let last = r.get("last").and_then(Value::as_str).unwrap_or("");
            let first = r.get("first").and_then(Value::as_str).unwrap_or("");
            let parts: Vec<&str> = [last, first].into_iter().filter(|s| !s.is_empty()).collect();
            if parts.is_empty() {
                None
            } else {
                Some(parts.join(", "))
            }
        })
        .collect::<Vec<_>>()
        .join("; ");
    let date = value("date");
    static YEAR_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(19|20)\d{2}\b").unwrap());
    let year = YEAR_RE.find(&date).and_then(|m| m.as_str().parse::<i64>().ok());
    Some(ArticleMeta { title, authors, journal: value("publicationTitle"), doi: value("DOI"), year })
}

fn strip_html_and_entities(raw: &str) -> String {
    static TAG_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<[^>]+>").unwrap());
    static WS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());
    let no_tags = TAG_RE.replace_all(raw, " ");
    let unescaped = no_tags.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&");
    WS_RE.replace_all(&unescaped, " ").trim().to_string()
}

/// Crossref rend parfois le résumé en JATS (`<jats:p>…</jats:p>`) — miroir de
/// `abstractText`.
pub fn abstract_text(raw: &str) -> String {
    strip_html_and_entities(raw)
}

/// Une entrée Crossref → nos champs — miroir de `shapeWork`.
fn shape_work(work: &Value, fallback_doi: &str) -> Option<ShapedWork> {
    let title = match work.get("title") {
        Some(Value::Array(arr)) => arr.first().and_then(Value::as_str).map(str::to_string),
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    }?;
    if title.is_empty() {
        return None;
    }
    static WS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());
    let title = WS_RE.replace_all(&title, " ").trim().to_string();

    let date_parts = ["published", "published-print", "published-online", "issued"]
        .iter()
        .find_map(|key| work.get(key).and_then(|v| v.get("date-parts")).and_then(|v| v.get(0)));
    let year = date_parts.and_then(|v| v.get(0)).and_then(Value::as_i64);

    let container = match work.get("container-title") {
        Some(Value::Array(arr)) => arr.first().and_then(Value::as_str).map(str::to_string),
        Some(Value::String(s)) => Some(s.clone()),
        _ => None,
    };

    let authors = work
        .get("author")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|person| {
                    let family = person.get("family").and_then(Value::as_str);
                    if let Some(family) = family {
                        let given = person.get("given").and_then(Value::as_str);
                        Some(match given {
                            Some(g) if !g.is_empty() => format!("{family}, {g}"),
                            _ => family.to_string(),
                        })
                    } else {
                        person.get("name").and_then(Value::as_str).map(str::to_string)
                    }
                })
                .collect::<Vec<_>>()
                .join("; ")
        })
        .unwrap_or_default();

    let doi = work.get("DOI").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string).unwrap_or_else(|| fallback_doi.to_string());

    Some(ShapedWork {
        abstract_text: work.get("abstract").and_then(Value::as_str).unwrap_or("").to_string(),
        title,
        authors,
        journal: container.unwrap_or_default(),
        doi,
        year,
    })
}

static DOI_PREFIX_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)^https?://(dx\.)?doi\.org/").unwrap());
static DOI_SHAPE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^10\.\d{4,9}/").unwrap());

pub fn clean_doi(doi: &str) -> String {
    DOI_PREFIX_RE.replace(doi.trim(), "").to_string()
}

pub fn is_valid_doi_shape(doi: &str) -> bool {
    DOI_SHAPE_RE.is_match(doi)
}

fn http_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder().build().unwrap_or_else(|_| reqwest::blocking::Client::new())
}

/// Crossref par DOI — appel réseau réel (aucun moyen de le désactiver sans
/// mocker, voir `kb_parity/README.md`). Toute erreur (hors ligne, DOI
/// inconnu, timeout) dégrade en silence vers `None`, jamais un throw.
pub fn crossref_meta(doi: &str) -> Option<ShapedWork> {
    let clean = clean_doi(doi);
    if !DOI_SHAPE_RE.is_match(&clean) {
        return None;
    }
    let url = format!("https://api.crossref.org/works/{}?mailto={}", encode_uri_component(&clean), encode_uri_component(MAILTO));
    let resp = http_client()
        .get(&url)
        .header("User-Agent", format!("atelier-studio (mailto:{MAILTO})"))
        .timeout(Duration::from_millis(CROSSREF_TIMEOUT_MS))
        .send()
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let payload: Value = resp.json().ok()?;
    shape_work(payload.get("message")?, &clean)
}

fn first_family(authors: &str) -> String {
    static SPLIT_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"[;&]").unwrap());
    // Miroir de `/[;&]|(?:,\s*(?=[A-Z][a-z]))/` — le second bras (lookahead)
    // n'est pas supporté par `regex` ; approximé par une recherche manuelle
    // d'une virgule suivie d'espace(s) puis d'une majuscule+minuscule.
    let first_chunk = SPLIT_RE.split(authors).next().unwrap_or(authors);
    let cut = comma_before_capitalized(first_chunk).unwrap_or(first_chunk.len());
    let first = &first_chunk[..cut];
    let family = if first.contains(',') {
        first.split(',').next().unwrap_or(first).to_string()
    } else {
        first.split_whitespace().next_back().unwrap_or(first).to_string()
    };
    let decomposed: String = family.to_lowercase().nfd().collect();
    decomposed.chars().filter(|c| !('\u{0300}'..='\u{036f}').contains(c)).collect::<String>().trim().to_string()
}

/// Trouve la première coupure `,\s*(?=[A-Z][a-z])` dans `s` (index en octets).
fn comma_before_capitalized(s: &str) -> Option<usize> {
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    for (i, (byte_idx, c)) in chars.iter().enumerate() {
        if *c != ',' {
            continue;
        }
        let mut j = i + 1;
        while j < chars.len() && chars[j].1.is_whitespace() {
            j += 1;
        }
        if j + 1 < chars.len() && chars[j].1.is_ascii_uppercase() && chars[j + 1].1.is_ascii_lowercase() {
            return Some(*byte_idx);
        }
    }
    None
}

/// Recouvrement de mots entre deux titres, 0 → 1 — miroir de `titleOverlap`.
pub fn title_overlap(a: &str, b: &str) -> f64 {
    fn words(s: &str) -> std::collections::HashSet<String> {
        let lower = s.to_lowercase();
        let decomposed: String = lower.nfd().collect();
        let stripped: String = decomposed.chars().filter(|c| !('\u{0300}'..='\u{036f}').contains(c)).collect();
        stripped
            .split(|c: char| !(c.is_ascii_lowercase() || c.is_ascii_digit()))
            .filter(|w| w.len() > 3)
            .map(str::to_string)
            .collect()
    }
    let left = words(a);
    let right = words(b);
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let hits = left.iter().filter(|w| right.contains(*w)).count();
    hits as f64 / left.len().min(right.len()) as f64
}

/// Crossref par titre — dernier recours quand le PDF n'imprime pas son DOI.
/// Miroir de `crossrefByTitle` : recouvrement de titre ≥ `TITLE_MATCH_MIN` et
/// accord du premier auteur quand on le connaît.
pub fn crossref_by_title(guessed: &ArticleMeta) -> Option<ShapedWork> {
    static WS_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());
    let title = WS_RE.replace_all(guessed.title.trim(), " ").trim().to_string();
    if title.chars().count() < 20 {
        return None;
    }
    let url = format!(
        "https://api.crossref.org/works?rows=5&query.bibliographic={}&mailto={}",
        encode_uri_component(&title),
        encode_uri_component(MAILTO)
    );
    let resp = http_client()
        .get(&url)
        .header("User-Agent", format!("atelier-studio (mailto:{MAILTO})"))
        .timeout(Duration::from_millis(CROSSREF_TIMEOUT_MS))
        .send()
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let payload: Value = resp.json().ok()?;
    let family = first_family(&guessed.authors);
    let items = payload.get("message").and_then(|m| m.get("items")).and_then(Value::as_array).cloned().unwrap_or_default();
    for work in &items {
        let Some(shaped) = shape_work(work, "") else { continue };
        if title_overlap(&title, &shaped.title) < TITLE_MATCH_MIN {
            continue;
        }
        if !family.is_empty() {
            let families: Vec<String> = work
                .get("author")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| p.get("family").and_then(Value::as_str))
                        .map(|f| {
                            let decomposed: String = f.to_lowercase().nfd().collect();
                            decomposed.chars().filter(|c| !('\u{0300}'..='\u{036f}').contains(c)).collect::<String>()
                        })
                        .collect()
                })
                .unwrap_or_default();
            if !families.is_empty() && !families.contains(&family) {
                continue;
            }
        }
        return Some(shaped);
    }
    None
}

/// Enrichit les métadonnées devinées — miroir de `resolveArticleMeta`.
/// Retourne `(meta, source)` où `source` vaut `"zotero"`, `"crossref"`,
/// `"crossref-titre"` ou `"texte"`.
pub fn resolve_article_meta(path: &str, guessed: &ArticleMeta) -> (ArticleMeta, &'static str) {
    if let Some(z) = zotero_meta(path) {
        return (merge(guessed, &z), "zotero");
    }
    let doi_or_basename = if !guessed.doi.is_empty() {
        guessed.doi.clone()
    } else {
        Path::new(path).file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default()
    };
    if let Some(cr) = crossref_meta(&doi_or_basename) {
        return (merge(guessed, &cr.as_meta()), "crossref");
    }
    if let Some(bt) = crossref_by_title(guessed) {
        return (merge(guessed, &bt.as_meta()), "crossref-titre");
    }
    (guessed.clone(), "texte")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_overlap_mots_communs() {
        let score = title_overlap("Melting of Alpine Glaciers", "Melting of Alpine Snowpacks");
        assert!(score > 0.5, "score={score}");
        assert_eq!(title_overlap("", "quelque chose"), 0.0);
    }

    #[test]
    fn shape_work_extrait_titre_annee_auteurs() {
        let work = serde_json::json!({
            "title": ["A Real Paper"],
            "published": {"date-parts": [[2020, 3]]},
            "container-title": ["Journal of Testing"],
            "DOI": "10.1234/abc",
            "author": [{"family": "Smith", "given": "J."}, {"name": "Consortium"}],
        });
        let shaped = shape_work(&work, "fallback").unwrap();
        assert_eq!(shaped.title, "A Real Paper");
        assert_eq!(shaped.year, Some(2020));
        assert_eq!(shaped.journal, "Journal of Testing");
        assert_eq!(shaped.doi, "10.1234/abc");
        assert_eq!(shaped.authors, "Smith, J.; Consortium");
    }

    #[test]
    fn crossref_meta_rejette_doi_mal_forme_sans_reseau() {
        // Aucun appel réseau ne doit partir pour un DOI mal formé : le test
        // reste rapide et déterministe même hors-ligne.
        assert!(crossref_meta("pas-un-doi").is_none());
    }

    #[test]
    fn zotero_meta_absente_sans_bibliotheque_locale() {
        std::env::set_var("ATELIER_ZOTERO_DB", "/chemin/inexistant/zotero.sqlite");
        assert!(zotero_meta("/x/Zotero/storage/ABCD1234/paper.pdf").is_none());
        std::env::remove_var("ATELIER_ZOTERO_DB");
    }
}
