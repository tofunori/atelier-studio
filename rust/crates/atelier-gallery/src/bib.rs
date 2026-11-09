//! Lecture d'une `.bib`, comparaison d'une entrée avec une fiche Crossref et
//! réécriture d'une entrée — logique pure, sans réseau, testée ici.
//!
//! Utilisé par la vérification des références (`bibcheck.rs`). Le principe :
//! ne signaler que ce qui mérite l'œil de l'auteur. Les simples différences
//! d'écriture (majuscules, accolades, accents en LaTeX, `--` contre `–`,
//! « J. Glaciol. » contre « Journal of Glaciology ») ne comptent pas.

use serde::Serialize;
use serde_json::Value;
use unicode_normalization::UnicodeNormalization;

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct BibField {
    /// Nom en minuscules.
    pub name: String,
    /// Valeur sans ses délimiteurs (parties `#` concaténées).
    pub value: String,
    /// Début du nom (octets, relatif au texte lu).
    pub start: usize,
    /// Position du `=`.
    pub eq: usize,
    /// Valeur brute, délimiteurs compris : `[value_start, value_end)`.
    pub value_start: usize,
    pub value_end: usize,
    /// Valeur faite d'un seul mot nu non numérique : une macro `@string`
    /// (`journal = tc`) qu'on ne sait pas juger.
    pub bare: bool,
}

#[derive(Debug, Clone)]
pub struct BibEntry {
    /// Type en minuscules (`article`, `book`…).
    pub kind: String,
    pub key: String,
    /// `[start, end)` couvre `@type{…}` en entier.
    pub start: usize,
    pub end: usize,
    pub fields: Vec<BibField>,
}

impl BibEntry {
    pub fn field(&self, name: &str) -> Option<&BibField> {
        self.fields.iter().find(|field| field.name == name)
    }
    pub fn value(&self, name: &str) -> Option<&str> {
        self.field(name)
            .map(|field| field.value.trim())
            .filter(|value| !value.is_empty())
    }
}

/// Fin (exclusive) du groupe ouvert en `open` (`{` ou `"`), accolades
/// échappées (`\{`) ignorées. `None` si le groupe ne se ferme pas.
fn group_end(bytes: &[u8], open: usize) -> Option<usize> {
    let quote = bytes[open] == b'"';
    let mut depth = 0i32;
    let mut i = open + 1;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => {
                i += 2;
                continue;
            }
            b'{' => depth += 1,
            b'}' => {
                if !quote && depth == 0 {
                    return Some(i + 1);
                }
                depth -= 1;
            }
            b'"' if quote && depth == 0 => return Some(i + 1),
            _ => {}
        }
        i += 1;
    }
    None
}

fn skip_ws(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    i
}

/// `@` en début de ligne commentée par `%` : biber l'ignore, nous aussi.
fn in_percent_comment(text: &str, at: usize) -> bool {
    let line_start = text[..at].rfind('\n').map_or(0, |i| i + 1);
    text[line_start..at].trim_start().starts_with('%')
}

pub fn parse_bib(text: &str) -> Vec<BibEntry> {
    let bytes = text.as_bytes();
    let mut entries = Vec::new();
    let mut i = 0;
    while let Some(offset) = text[i..].find('@') {
        let at = i + offset;
        i = at + 1;
        if in_percent_comment(text, at) {
            continue;
        }
        let mut j = at + 1;
        while j < bytes.len() && bytes[j].is_ascii_alphabetic() {
            j += 1;
        }
        let kind = text[at + 1..j].to_ascii_lowercase();
        if kind.is_empty() {
            continue;
        }
        j = skip_ws(bytes, j);
        if j >= bytes.len() || (bytes[j] != b'{' && bytes[j] != b'(') {
            continue;
        }
        let close = if bytes[j] == b'{' { b'}' } else { b')' };
        if matches!(kind.as_str(), "comment" | "preamble" | "string") {
            if bytes[j] == b'{'
                && let Some(end) = group_end(bytes, j)
            {
                i = end;
            }
            continue;
        }
        j += 1;
        let key_start = skip_ws(bytes, j);
        let mut k = key_start;
        while k < bytes.len()
            && bytes[k] != b','
            && bytes[k] != close
            && !bytes[k].is_ascii_whitespace()
        {
            k += 1;
        }
        let key = text[key_start..k].to_string();
        k = skip_ws(bytes, k);
        let mut fields = Vec::new();
        let mut end = bytes.len();
        loop {
            while k < bytes.len() && (bytes[k].is_ascii_whitespace() || bytes[k] == b',') {
                k += 1;
            }
            if k >= bytes.len() {
                break;
            }
            if bytes[k] == close {
                end = k + 1;
                break;
            }
            if bytes[k] == b'@' {
                // Entrée non fermée : on s'arrête avant la suivante.
                end = k;
                break;
            }
            let name_start = k;
            while k < bytes.len()
                && bytes[k] != b'='
                && bytes[k] != b','
                && bytes[k] != close
                && !bytes[k].is_ascii_whitespace()
            {
                k += 1;
            }
            let name = text[name_start..k].to_ascii_lowercase();
            k = skip_ws(bytes, k);
            if k >= bytes.len() || bytes[k] != b'=' {
                // Champ mal formé : passer au séparateur suivant.
                while k < bytes.len() && bytes[k] != b',' && bytes[k] != close {
                    k += 1;
                }
                continue;
            }
            let eq = k;
            k = skip_ws(bytes, k + 1);
            let value_start = k;
            let mut value = String::new();
            let mut value_end = k;
            let mut grouped = false;
            loop {
                if k >= bytes.len() {
                    break;
                }
                match bytes[k] {
                    b'{' | b'"' => {
                        let Some(group) = group_end(bytes, k) else {
                            k = bytes.len();
                            value_end = k;
                            break;
                        };
                        value.push_str(&text[k + 1..group - 1]);
                        grouped = true;
                        k = group;
                    }
                    _ => {
                        let token_start = k;
                        while k < bytes.len()
                            && !bytes[k].is_ascii_whitespace()
                            && bytes[k] != b','
                            && bytes[k] != b'#'
                            && bytes[k] != close
                        {
                            k += 1;
                        }
                        value.push_str(&text[token_start..k]);
                        if k == token_start {
                            break;
                        }
                    }
                }
                value_end = k;
                let after = skip_ws(bytes, k);
                if after < bytes.len() && bytes[after] == b'#' {
                    k = skip_ws(bytes, after + 1);
                    continue;
                }
                k = after;
                break;
            }
            if !name.is_empty() {
                let bare =
                    !grouped && !value.is_empty() && !value.chars().all(|c| c.is_ascii_digit());
                fields.push(BibField {
                    name,
                    value,
                    start: name_start,
                    eq,
                    value_start,
                    value_end,
                    bare,
                });
            }
        }
        i = end.max(at + 1);
        entries.push(BibEntry {
            kind,
            key,
            start: at,
            end,
            fields,
        });
    }
    entries
}

pub fn line_of(text: &str, offset: usize) -> usize {
    text[..offset.min(text.len())]
        .bytes()
        .filter(|b| *b == b'\n')
        .count()
        + 1
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/// LaTeX → texte : accents en commandes (`\'{e}`, `{\"o}`), symboles
/// échappés, commandes de mise en forme retirées (leur argument reste).
pub fn delatex(source: &str) -> String {
    let chars: Vec<char> = source.chars().collect();
    let mut out = String::with_capacity(source.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' && i + 1 < chars.len() {
            let next = chars[i + 1];
            if "'\"^`~=.".contains(next) {
                // Accent : on garde la lettre, l'accent tombe (comme NFD plus bas).
                i += 2;
                continue;
            }
            if "&%_$#{}".contains(next) {
                out.push(next);
                i += 2;
                continue;
            }
            if next.is_ascii_alphabetic() {
                let mut j = i + 1;
                while j < chars.len() && chars[j].is_ascii_alphabetic() {
                    j += 1;
                }
                let name: String = chars[i + 1..j].iter().collect();
                let replacement = match name.as_str() {
                    "ss" => "ss",
                    "o" | "O" => "o",
                    "aa" | "AA" => "a",
                    "ae" | "AE" => "ae",
                    "oe" | "OE" => "oe",
                    "l" | "L" => "l",
                    "i" | "j" => "i",
                    _ => "",
                };
                out.push_str(replacement);
                i = j;
                continue;
            }
            i += 1;
            continue;
        }
        match c {
            '{' | '}' | '$' => {}
            '~' => out.push(' '),
            _ => out.push(c),
        }
        i += 1;
    }
    out
}

/// Balises (JATS/MathML/HTML) retirées et entités usuelles décodées : forme
/// des titres renvoyés par Crossref.
pub fn strip_markup(source: &str) -> String {
    let mut out = String::with_capacity(source.len());
    let mut in_tag = false;
    for c in source.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&nbsp;", " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Forme de comparaison : sans LaTeX ni balises, sans accents, minuscules,
/// ponctuation remplacée par des espaces.
pub fn norm(source: &str) -> String {
    let plain = delatex(&strip_markup(source));
    let folded: String = plain
        .nfd()
        .filter(|c| !('\u{0300}'..='\u{036f}').contains(c))
        .flat_map(char::to_lowercase)
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect();
    folded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Similarité de 0 à 1 (distance d'édition normalisée).
pub fn similarity(a: &str, b: &str) -> f64 {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0; b.len() + 1];
    for (i, ca) in a.iter().enumerate() {
        current[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            current[j + 1] = (previous[j + 1] + 1)
                .min(current[j] + 1)
                .min(previous[j] + cost);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    1.0 - previous[b.len()] as f64 / a.len().max(b.len()) as f64
}

pub fn clean_doi(raw: &str) -> String {
    let mut doi = raw.trim();
    for prefix in [
        "https://doi.org/",
        "http://doi.org/",
        "https://dx.doi.org/",
        "http://dx.doi.org/",
        "doi.org/",
        "doi:",
        "DOI:",
    ] {
        if doi.len() >= prefix.len() && doi[..prefix.len()].eq_ignore_ascii_case(prefix) {
            doi = &doi[prefix.len()..];
        }
    }
    doi.trim().trim_end_matches(['.', ',']).to_string()
}

/// DOI de l'entrée : champ `doi`, sinon un `url` qui pointe vers doi.org.
pub fn entry_doi(entry: &BibEntry) -> Option<String> {
    if let Some(doi) = entry.value("doi") {
        let doi = clean_doi(doi);
        if doi.starts_with("10.") {
            return Some(doi);
        }
    }
    let url = entry.value("url")?;
    let lower = url.to_ascii_lowercase();
    if lower.contains("doi.org/10.") {
        let doi = clean_doi(&url[lower.find("10.")?..]);
        return Some(doi);
    }
    None
}

// ---------------------------------------------------------------------------
// Auteurs
// ---------------------------------------------------------------------------

/// Découpe `author` sur les ` and ` hors accolades.
pub fn split_authors(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut current = String::new();
    let chars: Vec<char> = raw.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c == '{' {
            depth += 1;
        } else if c == '}' {
            depth -= 1;
        }
        if depth == 0 && c.is_whitespace() {
            let is_and = chars.get(i + 1..i + 4).is_some_and(|word| {
                word.iter()
                    .map(|c| c.to_ascii_lowercase())
                    .eq(['a', 'n', 'd'])
            }) && chars.get(i + 4).is_some_and(|c| c.is_whitespace());
            if is_and {
                out.push(current.trim().to_string());
                current.clear();
                i += 5;
                continue;
            }
        }
        current.push(c);
        i += 1;
    }
    if !current.trim().is_empty() {
        out.push(current.trim().to_string());
    }
    out.into_iter().filter(|name| !name.is_empty()).collect()
}

/// Nom de famille normalisé d'un nom BibTeX (« Family, Given », « Given
/// Family » ou « {Organisation} »).
pub fn family_of(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        return norm(trimmed);
    }
    let mut depth = 0i32;
    for (index, c) in trimmed.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth -= 1,
            ',' if depth == 0 => return norm(&trimmed[..index]),
            _ => {}
        }
    }
    norm(trimmed)
        .split(' ')
        .next_back()
        .unwrap_or("")
        .to_string()
}

fn families_match(a: &str, b: &str) -> bool {
    if a.is_empty() || b.is_empty() {
        return false;
    }
    if a == b {
        return true;
    }
    let last_a = a.split(' ').next_back().unwrap_or(a);
    let last_b = b.split(' ').next_back().unwrap_or(b);
    last_a == last_b || a.ends_with(&format!(" {b}")) || b.ends_with(&format!(" {a}"))
}

// ---------------------------------------------------------------------------
// Lecture d'une fiche Crossref
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, Serialize)]
pub struct Work {
    pub doi: String,
    pub kind: String,
    pub title: String,
    pub subtitle: String,
    /// (famille, prénom) ; organisation : (nom, "").
    pub authors: Vec<(String, String)>,
    /// Année préférée (version papier, sinon publication).
    pub year: Option<i64>,
    /// Toutes les années admises (papier, en ligne, publication).
    pub years: Vec<i64>,
    pub journal: String,
    pub journal_short: Vec<String>,
    pub volume: String,
    pub issue: String,
    pub pages: String,
    /// `(type, "mars 2024")` pour une rétractation ou un retrait.
    pub retraction: Option<(String, String)>,
}

fn first_string(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::Array(items)) => items
            .iter()
            .find_map(Value::as_str)
            .unwrap_or("")
            .to_string(),
        Some(Value::String(text)) => text.clone(),
        _ => String::new(),
    }
}

fn date_year(value: &Value, key: &str) -> Option<i64> {
    value.get(key)?.get("date-parts")?.get(0)?.get(0)?.as_i64()
}

const MOIS: [&str; 12] = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
];

pub fn work_from(message: &Value) -> Work {
    let authors = message
        .get("author")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|author| {
                    let family = author.get("family").and_then(Value::as_str).unwrap_or("");
                    let given = author.get("given").and_then(Value::as_str).unwrap_or("");
                    if !family.is_empty() {
                        Some((strip_markup(family), strip_markup(given)))
                    } else {
                        author
                            .get("name")
                            .and_then(Value::as_str)
                            .map(|name| (strip_markup(name), String::new()))
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let mut years = Vec::new();
    for key in ["published-print", "issued", "published-online", "published"] {
        if let Some(year) = date_year(message, key)
            && !years.contains(&year)
        {
            years.push(year);
        }
    }
    let retraction = message
        .get("updated-by")
        .and_then(Value::as_array)
        .and_then(|updates| {
            updates.iter().find_map(|update| {
                let kind = update
                    .get("type")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if !matches!(kind.as_str(), "retraction" | "withdrawal" | "removal") {
                    return None;
                }
                let parts = update
                    .get("updated")
                    .and_then(|u| u.get("date-parts"))
                    .and_then(|p| p.get(0));
                let year = parts.and_then(|p| p.get(0)).and_then(Value::as_i64);
                let month = parts.and_then(|p| p.get(1)).and_then(Value::as_i64);
                let when = match (year, month) {
                    (Some(y), Some(m)) if (1..=12).contains(&m) => {
                        format!("{} {y}", MOIS[(m - 1) as usize])
                    }
                    (Some(y), _) => y.to_string(),
                    _ => String::new(),
                };
                Some((kind, when))
            })
        });
    let pages = {
        let page = first_string(message, "page");
        if page.is_empty() {
            first_string(message, "article-number")
        } else {
            page
        }
    };
    Work {
        doi: first_string(message, "DOI"),
        kind: first_string(message, "type"),
        title: strip_markup(&first_string(message, "title")),
        subtitle: strip_markup(&first_string(message, "subtitle")),
        authors,
        year: years.first().copied(),
        years,
        journal: strip_markup(&first_string(message, "container-title")),
        journal_short: message
            .get("short-container-title")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(strip_markup)
                    .collect()
            })
            .unwrap_or_default(),
        volume: first_string(message, "volume"),
        issue: first_string(message, "issue"),
        pages,
        retraction,
    }
}

impl Work {
    pub fn full_title(&self) -> String {
        if self.subtitle.is_empty() {
            self.title.clone()
        } else {
            format!("{}: {}", self.title, self.subtitle)
        }
    }
    pub fn authors_bibtex(&self) -> String {
        self.authors
            .iter()
            .map(|(family, given)| {
                if given.is_empty() {
                    format!("{{{family}}}")
                } else {
                    format!("{family}, {given}")
                }
            })
            .collect::<Vec<_>>()
            .join(" and ")
    }
    pub fn pages_bibtex(&self) -> String {
        let pages = self.pages.trim();
        match pages.split_once(['-', '–', '—']) {
            Some((first, last)) if !first.is_empty() && !last.is_empty() => {
                format!(
                    "{}--{}",
                    first.trim(),
                    last.trim_start_matches(['-', '–', '—']).trim()
                )
            }
            _ => pages.to_string(),
        }
    }
}

// ---------------------------------------------------------------------------
// Comparaison
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Change {
    pub field: String,
    pub label: String,
    /// `None` : champ absent de la .bib (sera ajouté).
    pub old: Option<String>,
    pub new: String,
}

fn label(field: &str) -> &'static str {
    match field {
        "title" => "Titre",
        "author" => "Auteurs",
        "year" => "Année",
        "journal" | "journaltitle" => "Revue",
        "volume" => "Volume",
        "number" => "Numéro",
        "pages" => "Pages",
        "doi" => "DOI",
        _ => "Champ",
    }
}

/// « Année différente, pages manquantes ».
pub fn summary(changes: &[Change]) -> String {
    let parts: Vec<&str> = changes
        .iter()
        .map(
            |change| match (change.field.as_str(), change.old.is_some()) {
                ("title", true) => "titre différent",
                ("title", false) => "titre manquant",
                ("author", true) => "auteurs différents",
                ("author", false) => "auteurs manquants",
                ("year", true) => "année différente",
                ("year", false) => "année manquante",
                ("journal" | "journaltitle", true) => "revue différente",
                ("journal" | "journaltitle", false) => "revue manquante",
                ("volume", true) => "volume différent",
                ("volume", false) => "volume manquant",
                ("number", _) => "numéro différent",
                ("pages", true) => "pages différentes",
                ("pages", false) => "pages manquantes",
                ("doi", true) => "DOI différent",
                ("doi", false) => "DOI manquant",
                _ => "champ différent",
            },
        )
        .collect();
    let mut text = parts.join(", ");
    if let Some(first) = text.get(..1) {
        let upper = first.to_uppercase();
        text.replace_range(..1, &upper);
    }
    text
}

fn norm_pages(raw: &str) -> String {
    raw.chars()
        .filter(|c| !c.is_whitespace())
        .map(|c| {
            if matches!(c, '–' | '—' | '−') {
                '-'
            } else {
                c
            }
        })
        .collect::<String>()
        .replace("--", "-")
        .to_lowercase()
}

const STOP_WORDS: [&str; 7] = ["of", "the", "and", "for", "in", "on", "a"];

/// « J. Glaciol. » ≈ « Journal of Glaciology » : chaque mot abrégé est le
/// début du mot correspondant, mots vides ignorés.
fn abbreviation_matches(short: &str, long: &str) -> bool {
    let words = |text: &str| -> Vec<String> {
        norm(text)
            .split(' ')
            .filter(|w| !w.is_empty() && !STOP_WORDS.contains(w))
            .map(str::to_string)
            .collect()
    };
    let short = words(short);
    let long = words(long);
    !short.is_empty()
        && short.len() == long.len()
        && short
            .iter()
            .zip(&long)
            .all(|(s, l)| l.starts_with(s.as_str()))
}

pub fn journal_matches(bib: &str, work: &Work) -> bool {
    let bib_norm = norm(bib);
    let mut names = vec![work.journal.clone()];
    names.extend(work.journal_short.iter().cloned());
    names.iter().filter(|name| !name.is_empty()).any(|name| {
        let name_norm = norm(name);
        name_norm == bib_norm
            || similarity(&name_norm, &bib_norm) >= 0.92
            || abbreviation_matches(bib, name)
            || abbreviation_matches(name, bib)
    })
}

pub fn title_similarity(bib: &str, work: &Work) -> f64 {
    let bib = norm(bib);
    let theirs = norm(&work.title);
    let mut score = similarity(&bib, &theirs);
    if !work.subtitle.is_empty() {
        score = score.max(similarity(&bib, &norm(&work.full_title())));
    }
    // Un titre complet de quatre mots ou plus, prolongé d'un complément
    // (« …, 2000–2018 ») : même article.
    let (short, long) = if bib.len() <= theirs.len() {
        (&bib, &theirs)
    } else {
        (&theirs, &bib)
    };
    if short.split(' ').count() >= 4 && long.starts_with(&format!("{short} ")) {
        score = score.max(0.95);
    }
    score
}

fn is_article(entry: &BibEntry, work: &Work) -> bool {
    entry.kind == "article" || work.kind == "journal-article"
}

/// Ce qui diffère réellement entre l'entrée et la fiche Crossref.
pub fn compare(entry: &BibEntry, work: &Work) -> Vec<Change> {
    let mut changes = Vec::new();
    let article = is_article(entry, work);

    // Titre
    let work_title = if work.subtitle.is_empty() {
        work.title.clone()
    } else {
        work.full_title()
    };
    match entry.value("title") {
        Some(title) if !work.title.is_empty() && title_similarity(title, work) < 0.9 => {
            let new = if similarity(&norm(title), &norm(&work.title))
                >= similarity(&norm(title), &norm(&work.full_title()))
            {
                work.title.clone()
            } else {
                work_title.clone()
            };
            changes.push(Change {
                field: "title".into(),
                label: label("title").into(),
                old: Some(title.to_string()),
                new,
            });
        }
        None if !work.title.is_empty() => {
            changes.push(Change {
                field: "title".into(),
                label: label("title").into(),
                old: None,
                new: work_title.clone(),
            });
        }
        _ => {}
    }

    // Auteurs
    if !work.authors.is_empty() {
        match entry.value("author") {
            Some(raw) => {
                let names = split_authors(raw);
                let truncated = names.last().is_some_and(|name| norm(name) == "others");
                let families: Vec<String> = names
                    .iter()
                    .filter(|name| norm(name) != "others")
                    .map(|name| family_of(name))
                    .collect();
                let theirs: Vec<String> = work
                    .authors
                    .iter()
                    .map(|(family, _)| norm(family))
                    .collect();
                let pairwise_ok = families
                    .iter()
                    .zip(&theirs)
                    .all(|(a, b)| families_match(a, b));
                let count_ok = if truncated {
                    families.len() <= theirs.len()
                } else {
                    families.len() == theirs.len()
                };
                if !pairwise_ok || !count_ok {
                    changes.push(Change {
                        field: "author".into(),
                        label: label("author").into(),
                        old: Some(raw.to_string()),
                        new: work.authors_bibtex(),
                    });
                }
            }
            None => changes.push(Change {
                field: "author".into(),
                label: label("author").into(),
                old: None,
                new: work.authors_bibtex(),
            }),
        }
    }

    // Année
    if let Some(year) = work.year {
        let bib_year = entry
            .value("year")
            .or_else(|| entry.value("date"))
            .and_then(|raw| raw.trim().get(..4).and_then(|y| y.parse::<i64>().ok()));
        match bib_year {
            Some(have) if !work.years.contains(&have) => changes.push(Change {
                field: "year".into(),
                label: label("year").into(),
                old: entry
                    .value("year")
                    .map(str::to_string)
                    .or(Some(have.to_string())),
                new: year.to_string(),
            }),
            None if entry.value("date").is_none() => changes.push(Change {
                field: "year".into(),
                label: label("year").into(),
                old: None,
                new: year.to_string(),
            }),
            _ => {}
        }
    }

    // Revue
    if article && !work.journal.is_empty() {
        let field = if entry.field("journaltitle").is_some() {
            "journaltitle"
        } else {
            "journal"
        };
        let macro_value = entry.field(field).is_some_and(|f| f.bare);
        match entry.value(field).filter(|_| !macro_value) {
            None if macro_value => {}
            Some(journal) if !journal_matches(journal, work) => changes.push(Change {
                field: field.into(),
                label: label(field).into(),
                old: Some(journal.to_string()),
                new: work.journal.clone(),
            }),
            None => changes.push(Change {
                field: field.into(),
                label: label(field).into(),
                old: None,
                new: work.journal.clone(),
            }),
            _ => {}
        }
    }

    // Volume
    if !work.volume.is_empty() {
        match entry.value("volume") {
            Some(volume) if norm(volume) != norm(&work.volume) => changes.push(Change {
                field: "volume".into(),
                label: label("volume").into(),
                old: Some(volume.to_string()),
                new: work.volume.clone(),
            }),
            None if article => changes.push(Change {
                field: "volume".into(),
                label: label("volume").into(),
                old: None,
                new: work.volume.clone(),
            }),
            _ => {}
        }
    }

    // Numéro : signalé seulement s'il contredit (beaucoup de styles l'omettent).
    if !work.issue.is_empty()
        && let Some(number) = entry.value("number").or_else(|| entry.value("issue"))
        && norm(number) != norm(&work.issue)
    {
        let field = if entry.field("number").is_some() {
            "number"
        } else {
            "issue"
        };
        changes.push(Change {
            field: field.into(),
            label: label("number").into(),
            old: Some(number.to_string()),
            new: work.issue.clone(),
        });
    }

    // Pages
    if !work.pages.is_empty() {
        let theirs = norm_pages(&work.pages);
        match entry.value("pages") {
            Some(pages) => {
                let ours = norm_pages(pages);
                let first_only =
                    !theirs.contains('-') && ours.split('-').next() == Some(theirs.as_str());
                if ours != theirs && !first_only {
                    changes.push(Change {
                        field: "pages".into(),
                        label: label("pages").into(),
                        old: Some(pages.to_string()),
                        new: work.pages_bibtex(),
                    });
                }
            }
            None if article && entry.value("eid").is_none() => changes.push(Change {
                field: "pages".into(),
                label: label("pages").into(),
                old: None,
                new: work.pages_bibtex(),
            }),
            _ => {}
        }
    }

    // DOI : une entrée dont le DOI est un alias renvoyé vers un autre.
    if !work.doi.is_empty() {
        match entry.value("doi") {
            Some(doi) if !clean_doi(doi).eq_ignore_ascii_case(&work.doi) => changes.push(Change {
                field: "doi".into(),
                label: label("doi").into(),
                old: Some(doi.to_string()),
                new: work.doi.clone(),
            }),
            _ => {}
        }
    }
    changes
}

/// Une fiche trouvée par recherche correspond-elle à l'entrée sans DOI ?
pub fn candidate_matches(entry: &BibEntry, work: &Work) -> bool {
    let Some(title) = entry.value("title") else {
        return false;
    };
    let score = title_similarity(title, work);
    let first_family = entry
        .value("author")
        .and_then(|raw| split_authors(raw).into_iter().next())
        .map(|name| family_of(&name));
    let family_ok = match (&first_family, work.authors.first()) {
        (Some(ours), Some((theirs, _))) => families_match(ours, &norm(theirs)),
        _ => false,
    };
    let year_ok = entry
        .value("year")
        .and_then(|raw| raw.trim().get(..4).and_then(|y| y.parse::<i64>().ok()))
        .is_some_and(|year| work.years.contains(&year));
    if first_family.is_none() {
        return score >= 0.95 && year_ok;
    }
    score >= 0.92 && (family_ok || year_ok) || score >= 0.85 && family_ok && year_ok
}

// ---------------------------------------------------------------------------
// Réécriture
// ---------------------------------------------------------------------------

/// Valeur Crossref → valeur BibTeX sûre (caractères spéciaux échappés,
/// accolades retirées).
pub fn escape_value(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut previous = '\0';
    for c in value.chars() {
        match c {
            '{' | '}' => {}
            '&' | '%' | '#' | '_' if previous != '\\' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
        previous = c;
    }
    out
}

/// Applique `changes` au texte d'UNE entrée (`@type{key, …}`) et rend le
/// nouveau texte. La mise en page de l'auteur est gardée : indentation,
/// alignement des `=`, virgule finale.
pub fn rewrite_entry(entry_text: &str, changes: &[(String, String)]) -> Option<String> {
    let entry = parse_bib(entry_text).into_iter().next()?;
    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    let mut missing: Vec<(&str, String)> = Vec::new();
    for (name, new) in changes {
        let escaped = if name == "doi" {
            new.trim().to_string()
        } else {
            escape_value(new)
        };
        match entry.field(name) {
            Some(field) => {
                let raw = &entry_text[field.value_start..field.value_end];
                let wrapped = if raw.starts_with("{{") && raw.ends_with("}}") {
                    format!("{{{{{escaped}}}}}")
                } else if raw.starts_with('"') {
                    format!("\"{escaped}\"")
                } else {
                    format!("{{{escaped}}}")
                };
                edits.push((field.value_start, field.value_end, wrapped));
            }
            None => missing.push((name.as_str(), escaped)),
        }
    }
    if !missing.is_empty() {
        let bytes = entry_text.as_bytes();
        let (indent, name_width, after_eq, insert_at, trailing_comma) = match entry.fields.last() {
            Some(last) => {
                let line_start = entry_text[..last.start].rfind('\n').map_or(0, |i| i + 1);
                let lead = &entry_text[line_start..last.start];
                let indent = if lead.trim().is_empty() && line_start > entry.start {
                    lead.to_string()
                } else {
                    "  ".to_string()
                };
                let before_eq = &entry_text[last.start..last.eq];
                let aligned = before_eq.len() > last.name.len() + 1;
                let name_width = if aligned { before_eq.len() } else { 0 };
                let after_eq = entry_text[last.eq + 1..last.value_start].to_string();
                let after = skip_ws(bytes, last.value_end);
                if after < bytes.len() && bytes[after] == b',' {
                    (indent, name_width, after_eq, after + 1, true)
                } else {
                    (indent, name_width, after_eq, last.value_end, false)
                }
            }
            None => {
                let comma = entry_text
                    .find(',')
                    .map_or(entry_text.len().saturating_sub(1), |i| i + 1);
                ("  ".to_string(), 0, " ".to_string(), comma, true)
            }
        };
        let after_eq = if after_eq.contains('\n') || after_eq.is_empty() {
            " ".to_string()
        } else {
            after_eq
        };
        let mut insertion = String::new();
        for (name, value) in &missing {
            let padded = if name_width > 0 {
                format!("{name:<width$}", width = name_width.max(name.len() + 1))
            } else {
                format!("{name} ")
            };
            let line = format!("{indent}{padded}={after_eq}{{{value}}}");
            if trailing_comma {
                insertion.push('\n');
                insertion.push_str(&line);
                insertion.push(',');
            } else {
                insertion.push_str(",\n");
                insertion.push_str(&line);
            }
        }
        edits.push((insert_at, insert_at, insertion));
    }
    edits.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    let mut text = entry_text.to_string();
    for (start, end, replacement) in edits {
        text.replace_range(start..end, &replacement);
    }
    Some(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const BIB: &str = r#"% Références de l'article
@string{tc = "The Cryosphere"}

@article{tremblay2021,
  author  = {Tremblay, Julie and Morin, Paul},
  title   = {Wildfire soot darkens glaciers of the {Coast Mountains}},
  journal = tc,
  year    = {2020},
  volume  = {15},
  doi     = {10.5194/tc-15-2281-2021}
}

@Book{cuffey2010, author = "Cuffey, K. M. and Paterson, W. S. B.", title = {The Physics of Glaciers}, year = 2010, publisher = {Academic Press}}
% @article{commented, title={x}}
@article{roy2018,
  author = {Roy, Claire and others},
  title = {{Albedo feedbacks in a warming cryosphere}},
  journal = {J. Glaciol.},
  year = {2018},
  pages = {12--20},
}
"#;

    fn work() -> Work {
        work_from(&json!({
            "DOI": "10.5194/tc-15-2281-2021",
            "type": "journal-article",
            "title": ["Wildfire soot darkens glaciers of the Coast Mountains"],
            "author": [{"family": "Tremblay", "given": "Julie"}, {"family": "Morin", "given": "Paul"}],
            "issued": {"date-parts": [[2021, 5, 12]]},
            "published-online": {"date-parts": [[2021, 5, 12]]},
            "container-title": ["The Cryosphere"],
            "short-container-title": ["The Cryosphere"],
            "volume": "15",
            "issue": "5",
            "page": "2281-2297"
        }))
    }

    #[test]
    fn parses_entries_strings_comments_and_both_value_styles() {
        let entries = parse_bib(BIB);
        let keys: Vec<&str> = entries.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, ["tremblay2021", "cuffey2010", "roy2018"]);
        let first = &entries[0];
        assert_eq!(first.kind, "article");
        assert_eq!(first.value("journal"), Some("tc"));
        assert_eq!(
            first.value("title"),
            Some("Wildfire soot darkens glaciers of the {Coast Mountains}")
        );
        let book = &entries[1];
        assert_eq!(book.kind, "book");
        assert_eq!(
            book.value("author"),
            Some("Cuffey, K. M. and Paterson, W. S. B.")
        );
        assert_eq!(book.value("year"), Some("2010"));
        assert_eq!(line_of(BIB, first.start), 4);
        assert!(BIB[first.start..first.end].ends_with('}'));
    }

    #[test]
    fn normalisation_ignores_latex_case_and_accents() {
        assert_eq!(
            norm(r"{\'E}tude des {glaciers} --- l'alb\'{e}do"),
            "etude des glaciers l albedo"
        );
        assert_eq!(
            norm("Étude des Glaciers — l’albédo"),
            "etude des glaciers l albedo"
        );
        assert_eq!(
            norm("<i>In situ</i> albedo &amp; melt"),
            "in situ albedo melt"
        );
        assert!(similarity("abc", "abc") > 0.99);
    }

    #[test]
    fn reports_only_the_real_differences() {
        let entries = parse_bib(BIB);
        let changes = compare(&entries[0], &work());
        let fields: Vec<&str> = changes.iter().map(|c| c.field.as_str()).collect();
        // `journal = tc` est une macro @string : on ne la juge pas.
        assert_eq!(fields, ["year", "pages"]);
        assert_eq!(changes[0].new, "2021");
        assert_eq!(changes[1].old, None);
        assert_eq!(changes[1].new, "2281--2297");
        assert_eq!(summary(&changes), "Année différente, pages manquantes");
    }

    #[test]
    fn accepts_online_year_abbreviated_journal_and_truncated_authors() {
        let entries = parse_bib(BIB);
        let roy = &entries[2];
        let crossref = work_from(&json!({
            "DOI": "10.1017/jog.2018.4", "type": "journal-article",
            "title": ["Albedo feedbacks in a warming cryosphere"],
            "author": [{"family": "Roy", "given": "Claire"}, {"family": "Salas", "given": "Ana"}],
            "published-print": {"date-parts": [[2019, 2]]},
            "published-online": {"date-parts": [[2018, 11]]},
            "container-title": ["Journal of Glaciology"],
            "volume": "65", "page": "12-20"
        }));
        let changes = compare(roy, &crossref);
        let fields: Vec<&str> = changes.iter().map(|c| c.field.as_str()).collect();
        assert_eq!(fields, ["volume"], "{changes:?}");
    }

    #[test]
    fn flags_a_wrong_title_and_a_missing_author() {
        let text = "@article{k, author={Roy, C.}, title={Something else entirely about dust}, year={2018}}";
        let entry = &parse_bib(text)[0];
        let crossref = work_from(&json!({
            "type": "journal-article", "title": ["Albedo feedbacks in a warming cryosphere"],
            "author": [{"family": "Roy"}, {"family": "Salas"}], "issued": {"date-parts": [[2018]]}
        }));
        let fields: Vec<String> = compare(entry, &crossref)
            .into_iter()
            .map(|c| c.field)
            .collect();
        assert_eq!(fields, ["title", "author"]);
    }

    #[test]
    fn reads_retractions() {
        let crossref = work_from(&json!({
            "title": ["x"],
            "updated-by": [{"type": "retraction", "DOI": "10.1/r", "updated": {"date-parts": [[2024, 3, 3]]}}]
        }));
        assert_eq!(
            crossref.retraction,
            Some(("retraction".into(), "mars 2024".into()))
        );
    }

    #[test]
    fn rewrite_keeps_alignment_and_adds_missing_fields() {
        let entries = parse_bib(BIB);
        let first = &entries[0];
        let old = &BIB[first.start..first.end];
        let new = rewrite_entry(
            old,
            &[
                ("year".into(), "2021".into()),
                ("pages".into(), "2281--2297".into()),
            ],
        )
        .unwrap();
        assert_eq!(
            new,
            "@article{tremblay2021,\n  author  = {Tremblay, Julie and Morin, Paul},\n  title   = {Wildfire soot darkens glaciers of the {Coast Mountains}},\n  journal = tc,\n  year    = {2021},\n  volume  = {15},\n  doi     = {10.5194/tc-15-2281-2021},\n  pages   = {2281--2297}\n}"
        );
        // Virgule finale conservée, double accolade gardée sur le titre.
        let roy = &entries[2];
        let old = &BIB[roy.start..roy.end];
        let new = rewrite_entry(
            old,
            &[
                ("title".into(), "Albedo & melt".into()),
                ("volume".into(), "65".into()),
            ],
        )
        .unwrap();
        assert!(new.contains("title = {{Albedo \\& melt}},"), "{new}");
        assert!(
            new.ends_with("pages = {12--20},\n  volume = {65},\n}"),
            "{new}"
        );
        // Entrée sur une ligne.
        let book = &entries[1];
        let old = &BIB[book.start..book.end];
        let new = rewrite_entry(old, &[("doi".into(), "10.1016/C2009-0-14802-X".into())]).unwrap();
        assert!(
            new.ends_with("publisher = {Academic Press},\n  doi = {10.1016/C2009-0-14802-X}}"),
            "{new}"
        );
        assert_eq!(
            parse_bib(&new)[0].value("doi"),
            Some("10.1016/C2009-0-14802-X")
        );
    }

    #[test]
    fn doi_from_url_and_candidate_matching() {
        let entry = &parse_bib(
            "@article{a, author={Nguyen, Anh and Roy, Claire}, title={Black carbon deposition on Andean glaciers}, year={2019}, url={https://doi.org/10.1017/JOG.2019.54}}",
        )[0];
        assert_eq!(entry_doi(entry).as_deref(), Some("10.1017/JOG.2019.54"));
        let candidate = work_from(&json!({
            "title": ["Black carbon deposition on Andean glaciers, 2000–2018"],
            "author": [{"family": "Nguyen"}], "issued": {"date-parts": [[2019]]}
        }));
        assert!(candidate_matches(entry, &candidate));
        let other = work_from(
            &json!({"title": ["Dust on Alpine glaciers"], "author": [{"family": "Nguyen"}]}),
        );
        assert!(!candidate_matches(entry, &other));
    }
}
