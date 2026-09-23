//! Chargement et recherche des annotations (Atelier + Zotero).

use crate::zotero::{self, ArticleMeta};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

pub struct Config {
    pub app_dir: PathBuf,
    pub zotero_dir: PathBuf,
    /// Où copier `zotero.sqlite` (Zotero garde un verrou sur l'original).
    pub cache_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Self {
        let home = PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| ".".into()));
        let var = |name: &str| {
            std::env::var_os(name)
                .filter(|v| !v.is_empty())
                .map(PathBuf::from)
        };
        Self {
            app_dir: var("ATELIER_APP_DIR")
                .unwrap_or_else(|| home.join("Library/Application Support/atelier-studio")),
            zotero_dir: var("ATELIER_ZOTERO_DIR").unwrap_or_else(|| home.join("Zotero")),
            cache_dir: std::env::temp_dir().join("atelier-annots-mcp"),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Source {
    Atelier,
    Zotero,
}

#[derive(Debug, Clone)]
pub struct Annotation {
    pub source: Source,
    /// Clé de l'article (clé Zotero de la pièce jointe PDF, ou chemin du PDF).
    pub article: String,
    pub page: String,
    pub passage: String,
    pub note: String,
    pub color: String,
    /// Surlignage posé par Claude (`highlight_passage`) : le seul genre que
    /// `update_highlights` / `remove_highlights` peuvent toucher.
    pub by_claude: bool,
}

#[derive(Debug, Clone, Default)]
pub struct Article {
    pub key: String,
    pub citation: String,
    pub title: String,
    pub authors: String,
    pub year: String,
}

pub struct Library {
    pub annotations: Vec<Annotation>,
    pub articles: HashMap<String, Article>,
    pub warnings: Vec<String>,
}

/// `zotero/<clé>/<fichier>.pdf` → clé de la pièce jointe.
fn attachment_key(rel: &str) -> Option<&str> {
    let (key, _) = rel.strip_prefix("zotero/")?.split_once('/')?;
    (key.len() == 8 && key.chars().all(|c| c.is_ascii_alphanumeric())).then_some(key)
}

/// « Williamson et al. - 2025 - Titre.pdf » → « Williamson et al. 2025 », même
/// règle que le panneau d'annotations d'Atelier (`annotCiteRef`).
pub fn citation_from_file(rel: &str) -> String {
    let base = rel.rsplit('/').next().unwrap_or(rel);
    let base = base
        .strip_suffix(".pdf")
        .or_else(|| base.strip_suffix(".PDF"))
        .unwrap_or(base);
    let parts: Vec<&str> = base.splitn(3, " - ").collect();
    if parts.len() == 3 && parts[1].len() == 4 && parts[1].chars().all(|c| c.is_ascii_digit()) {
        return format!("{} {}", parts[0].trim(), parts[1]);
    }
    base.to_string()
}

/// Couleurs du lecteur (données stockées dans les annotations) → nom lisible.
pub fn color_name(color: &str) -> String {
    let c: String = color
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase();
    let named = [
        ("255,213,74", "jaune"),
        ("#ffd400", "jaune"),
        ("120,220,140", "vert"),
        ("#5fb236", "vert"),
        ("120,170,255", "bleu"),
        ("#2ea8e5", "bleu"),
        ("255,140,160", "rose"),
        ("#ff6666", "rouge"),
        ("#e56eee", "magenta"),
        ("#a28ae5", "violet"),
        ("#f19837", "orange"),
        ("#aaaaaa", "gris"),
    ];
    named
        .iter()
        .find(|(needle, _)| c.contains(needle))
        .map(|(_, name)| name.to_string())
        .unwrap_or_default()
}

fn text(v: &Value, key: &str) -> String {
    match v.get(key) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// Annotations du lecteur d'Atelier, depuis `pdf_annots.json`.
pub fn atelier_annotations(store: &Value) -> Vec<Annotation> {
    let mut out = Vec::new();
    let Some(map) = store.as_object() else {
        return out;
    };
    for (rel, list) in map {
        let article = attachment_key(rel)
            .map(str::to_string)
            .unwrap_or_else(|| rel.clone());
        for a in list.as_array().into_iter().flatten() {
            let kind = text(a, "kind");
            // Le champ `note` est celui du chat ; seule une note libre (pastille
            // posée sur la page) est une note par nature.
            let note = if kind == "note" {
                text(a, "note")
            } else {
                text(a, "memo")
            };
            let passage = text(a, "text")
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if passage.is_empty() && note.is_empty() {
                continue;
            }
            out.push(Annotation {
                source: Source::Atelier,
                article: article.clone(),
                page: text(a, "page"),
                passage,
                note,
                color: color_name(&text(a, "color")),
                by_claude: text(a, "by") == "claude",
            });
        }
    }
    out
}

impl Library {
    pub fn load(config: &Config) -> Self {
        let mut warnings = Vec::new();
        let path = config.app_dir.join("pdf_annots.json");
        let store = match std::fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str(&raw).unwrap_or_else(|e| {
                warnings.push(format!("{} illisible : {e}", path.display()));
                Value::Null
            }),
            Err(_) => {
                warnings.push(format!(
                    "aucune annotation Atelier ({} absent)",
                    path.display()
                ));
                Value::Null
            }
        };
        let mut annotations = atelier_annotations(&store);
        let rels: Vec<String> = store
            .as_object()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();

        let (meta, zotero_annots) = match zotero::read(&config.zotero_dir, &config.cache_dir) {
            Ok(found) => found,
            Err(e) => {
                warnings.push(format!(
                    "Zotero non lu ({e}) : titres tirés des noms de fichier"
                ));
                (HashMap::new(), Vec::new())
            }
        };
        annotations.extend(zotero_annots);

        let mut articles = HashMap::new();
        for rel in &rels {
            let key = attachment_key(rel)
                .map(str::to_string)
                .unwrap_or_else(|| rel.clone());
            articles.insert(key.clone(), article(&key, meta.get(&key), Some(rel)));
        }
        for a in &annotations {
            if !articles.contains_key(&a.article) {
                articles.insert(
                    a.article.clone(),
                    article(&a.article, meta.get(&a.article), None),
                );
            }
        }
        Library {
            annotations,
            articles,
            warnings,
        }
    }

    pub fn article(&self, key: &str) -> Article {
        self.articles.get(key).cloned().unwrap_or_else(|| Article {
            key: key.to_string(),
            citation: citation_from_file(key),
            ..Default::default()
        })
    }
}

pub fn article(key: &str, meta: Option<&ArticleMeta>, rel: Option<&str>) -> Article {
    let from_file = citation_from_file(rel.unwrap_or(key));
    match meta {
        Some(m) => {
            let names: Vec<&str> = m
                .authors
                .split(", ")
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .collect();
            let who = match names.as_slice() {
                [] => String::new(),
                [one] => one.to_string(),
                [one, two] => format!("{one} & {two}"),
                [one, ..] => format!("{one} et al."),
            };
            let citation = if who.is_empty() || m.year.is_empty() {
                from_file
            } else {
                format!("{who} {}", m.year)
            };
            Article {
                key: key.to_string(),
                citation,
                title: m.title.clone(),
                authors: m.authors.clone(),
                year: m.year.clone(),
            }
        }
        None => Article {
            key: key.to_string(),
            citation: from_file,
            ..Default::default()
        },
    }
}

/// Minuscules sans accents : « Écart » et « ecart » se trouvent l'un l'autre.
pub fn fold(s: &str) -> String {
    s.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'à' | 'â' | 'ä' | 'á' | 'ã' => 'a',
            'ç' => 'c',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' | 'ì' => 'i',
            'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ÿ' => 'y',
            'œ' => 'o',
            other => other,
        })
        .collect()
}

pub struct Filter {
    pub query: String,
    /// Vrai : un seul mot de `query` suffit, les annotations qui en portent
    /// le plus passent en premier. Faux : tous les mots sont requis.
    pub any: bool,
    /// Articles voulus (clé, auteur, année ou mot du titre) ; vide = tous.
    pub articles: Vec<String>,
    pub color: String,
    pub only_with_note: bool,
}

pub struct Hit<'a> {
    pub annotation: &'a Annotation,
    pub article: Article,
    /// Nombre de mots de la requête trouvés.
    pub score: usize,
}

impl Library {
    /// Cherche `query` dans le passage, la note, la référence et le titre ;
    /// `articles` filtre sur la clé, la référence, les auteurs, l'année ou le
    /// titre. Résultats dans l'ordre des références puis des pages.
    pub fn search(&self, filter: &Filter) -> Vec<Hit<'_>> {
        let words: Vec<String> = fold(&filter.query)
            .split(|c: char| c.is_whitespace() || c == ',' || c == ';')
            // En mode « un mot suffit », « de » ou « la » prendraient tout.
            .filter(|w| !w.is_empty() && (!filter.any || w.chars().count() >= 3))
            .map(str::to_string)
            .collect();
        let wanted_articles: Vec<String> = filter
            .articles
            .iter()
            .map(|a| fold(a.trim()))
            .filter(|a| !a.is_empty())
            .collect();
        let wanted_color = fold(filter.color.trim());
        let mut hits: Vec<Hit> = self
            .annotations
            .iter()
            .filter(|a| !filter.only_with_note || !a.note.is_empty())
            .filter(|a| wanted_color.is_empty() || fold(&a.color) == wanted_color)
            .filter_map(|a| {
                let art = self.article(&a.article);
                // Une clé qui est un chemin de fichier (PDF hors Zotero) ne
                // compte pas : ses dossiers (« neige/… ») prendraient tout.
                let key = if art.key.contains('/') { "" } else { &art.key };
                let ident = fold(&format!(
                    "{key} {} {} {} {}",
                    art.citation, art.title, art.authors, art.year
                ));
                if !wanted_articles.is_empty()
                    && !wanted_articles.iter().any(|w| ident.contains(w.as_str()))
                {
                    return None;
                }
                // Le score ne compte que le passage et la note : un titre qui
                // contient les mots ferait remonter tout l'article.
                let text = fold(&format!("{} {}", a.passage, a.note));
                let score = words.iter().filter(|w| text.contains(w.as_str())).count();
                let keep = if filter.any {
                    words.is_empty() || score > 0
                } else {
                    words
                        .iter()
                        .all(|w| text.contains(w.as_str()) || ident.contains(w.as_str()))
                };
                keep.then_some(Hit {
                    annotation: a,
                    article: art,
                    score,
                })
            })
            .collect();
        sort_by_reference(&mut hits);
        hits
    }
}

pub fn sort_by_reference(hits: &mut [Hit]) {
    hits.sort_by(|x, y| {
        x.article
            .citation
            .cmp(&y.article.citation)
            .then(x.article.key.cmp(&y.article.key))
            .then(page_num(&x.annotation.page).cmp(&page_num(&y.annotation.page)))
    });
}

fn page_num(page: &str) -> u32 {
    page.trim().parse().unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn only_the_personal_note_counts_as_a_note() {
        let store = json!({"zotero/ABCD1234/Warren et al. - 1982 - Optical.pdf": [
            {"id": 1, "page": 3, "kind": "hl", "text": "grain  size\nmatters", "note": "Explique ce passage", "memo": "Pour la discussion", "color": "rgba(255,213,74,.40)"},
            {"id": 2, "page": 4, "kind": "hl", "text": "chat only", "note": "Question au chat"},
            {"id": 3, "page": 5, "kind": "note", "text": "", "note": "Note libre posée sur la page"},
            {"id": 4, "page": 6, "kind": "area", "text": "", "note": ""}
        ]});
        let annots = atelier_annotations(&store);
        assert_eq!(annots.len(), 3, "an empty area has nothing to show");
        assert_eq!(annots[0].article, "ABCD1234");
        assert_eq!(annots[0].passage, "grain size matters");
        assert_eq!(annots[0].note, "Pour la discussion");
        assert_eq!(annots[0].color, "jaune");
        assert_eq!(annots[1].note, "", "chat text is never exposed as a note");
        assert_eq!(annots[2].note, "Note libre posée sur la page");
    }

    #[test]
    fn citation_follows_the_zotero_file_name() {
        assert_eq!(
            citation_from_file("zotero/ABCD1234/Warren et al. - 1982 - Optical properties.pdf"),
            "Warren et al. 1982"
        );
        assert_eq!(citation_from_file("docs/paper.pdf"), "paper");
    }

    #[test]
    fn search_is_accent_insensitive_and_filters_notes() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("pdf_annots.json"),
            json!({"zotero/ABCD1234/Warren - 1982 - Snow.pdf": [
                {"id": 1, "page": 12, "kind": "hl", "text": "Black carbon lowers albedo", "memo": "Élément clé pour la discussion"},
                {"id": 2, "page": 2, "kind": "hl", "text": "Grain size", "note": "discussion ?"}
            ]})
            .to_string(),
        )
        .unwrap();
        let config = Config {
            app_dir: dir.path().into(),
            zotero_dir: dir.path().join("no-zotero"),
            cache_dir: dir.path().join("cache"),
        };
        let lib = Library::load(&config);
        let filter = |query: &str, only_with_note| Filter {
            query: query.into(),
            any: false,
            articles: Vec::new(),
            color: String::new(),
            only_with_note,
        };
        let hits = lib.search(&filter("element DISCUSSION", false));
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].article.citation, "Warren 1982");
        assert_eq!(
            lib.search(&filter("discussion", false)).len(),
            1,
            "chat text is not searched as a note"
        );
        assert_eq!(lib.search(&filter("", true)).len(), 1);
        assert_eq!(lib.search(&filter("", false)).len(), 2);
        assert!(lib.warnings.iter().any(|w| w.contains("Zotero non lu")));
        let any = |query: &str| Filter {
            query: query.into(),
            any: true,
            articles: Vec::new(),
            color: String::new(),
            only_with_note: false,
        };
        assert_eq!(
            lib.search(&any("soot, carbon grain")).len(),
            2,
            "one word is enough"
        );
        assert_eq!(
            lib.search(&any("warren snow")).len(),
            0,
            "words of the reference or title do not rank passages"
        );
        assert_eq!(
            lib.search(&any("de la carbon")).len(),
            1,
            "short words do not match everything"
        );
    }
}
