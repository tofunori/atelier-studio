//! Port de `sidecar/zotero_passages.mjs` (recherche lexicale par source) —
//! algorithme pur, déterministe, sans réseau ni spawn (mis à part le refresh
//! mtime géré côté `store.rs`, pas ici).

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Debug)]
pub struct Page {
    pub page: u32,
    pub text: String,
}

#[derive(Clone, Debug)]
pub struct Passage {
    pub page: u32,
    pub quote: String,
    pub context: String,
    pub score: f64,
}

static STOP_WORDS: Lazy<HashSet<&'static str>> = Lazy::new(|| {
    [
        "a", "an", "and", "are", "as", "at", "be", "by", "de", "des", "du", "en", "et", "for",
        "from", "in", "is", "la", "le", "les", "of", "on", "or", "ou", "par", "pour", "que",
        "qui", "sur", "the", "to", "un", "une", "what", "with", "important", "importants",
        "passage", "passages", "article", "papier", "montre", "montrer", "show", "find",
        "trouve", "trouver", "leur", "leurs", "main", "key",
    ]
    .into_iter()
    .collect()
});

fn query_expansions(word: &str) -> Option<&'static [&'static str]> {
    match word {
        "resultat" | "resultats" | "result" | "results" => {
            Some(&["results", "finding", "findings", "conclusion", "conclusions", "concluded"])
        }
        "limite" | "limites" => Some(&["limit", "limitation", "limitations", "caveat", "uncertainty"]),
        "methode" | "methodologie" => Some(&["method", "methods", "methodology", "approach"]),
        "conclusion" | "conclusions" => Some(&["conclusion", "conclusions", "implication", "implications"]),
        _ => None,
    }
}

/// Miroir de `normalizeSearchText` : NFKD, retrait des diacritiques,
/// minuscule, non alphanum -> espace, espaces compactés.
pub fn normalize_search_text(value: &str) -> String {
    let decomposed: String = value.nfkd().collect();
    let stripped: String = decomposed.chars().filter(|c| !is_combining_diacritic(*c)).collect();
    let lower = stripped.to_lowercase();
    let mut out = String::with_capacity(lower.len());
    let mut last_space = false;
    for c in lower.chars() {
        let is_alnum = c.is_ascii_alphanumeric();
        if is_alnum {
            out.push(c);
            last_space = false;
        } else if !last_space {
            out.push(' ');
            last_space = true;
        }
    }
    out.trim().to_string()
}

fn is_combining_diacritic(c: char) -> bool {
    ('\u{0300}'..='\u{036f}').contains(&c)
}

/// Jetons de requête dédoublonnés (miroir de `[...new Set(tokens(query))]`) —
/// exposé pour `zotero::search_corpus`/`best_page_paragraph`, qui calculent
/// ces jetons UNE fois avant de scorer chaque page (même motif que
/// `search_passages` ci-dessous).
pub(crate) fn query_tokens(query: &str) -> Vec<String> {
    dedup_preserve_order(tokens(query))
}

fn tokens(value: &str) -> Vec<String> {
    normalize_search_text(value)
        .split(' ')
        .filter(|w| w.chars().count() > 1 && !STOP_WORDS.contains(*w))
        .flat_map(|w| match query_expansions(w) {
            Some(exp) => exp.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            None => vec![w.to_string()],
        })
        .collect()
}

fn dedup_preserve_order(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            out.push(item);
        }
    }
    out
}

fn word_regex(token: &str) -> Regex {
    let escaped = regex::escape(token);
    // (?-u) : \b ASCII (miroir du \b JS, non Unicode-aware).
    Regex::new(&format!(r"(?-u)\b{escaped}\b")).unwrap_or_else(|_| Regex::new("$^").unwrap())
}

fn count_matches(re: &Regex, haystack: &str) -> usize {
    re.find_iter(haystack).count()
}

pub fn split_pdf_pages(text: &str) -> Vec<Page> {
    let cr = Regex::new(r"\r").unwrap();
    let trailing_ws = Regex::new(r"[ \t]+\n").unwrap();
    text.split('\u{000c}')
        .enumerate()
        .map(|(i, page)| {
            let no_cr = cr.replace_all(page, "");
            let cleaned = trailing_ws.replace_all(&no_cr, "\n");
            Page { page: (i + 1) as u32, text: cleaned.trim().to_string() }
        })
        .filter(|p| !p.text.is_empty())
        .collect()
}

struct Chunk {
    page: u32,
    text: String,
}

/// Miroir de `text.replace(/([^\n])\n(?=[^\n])/g, "$1 ")` : un saut de ligne
/// SEUL (ni précédé ni suivi d'un autre `\n`) devient un espace — seuls les
/// doubles sauts de ligne restent des frontières de paragraphe. Le crate
/// `regex` ne supporte pas le lookahead, donc implémenté à la main.
fn collapse_single_newlines(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    for (i, &c) in chars.iter().enumerate() {
        if c == '\n' {
            let prev_ok = i > 0 && chars[i - 1] != '\n';
            let next_ok = i + 1 < chars.len() && chars[i + 1] != '\n';
            if prev_ok && next_ok {
                out.push(' ');
                continue;
            }
        }
        out.push(c);
    }
    out
}

static MULTI_NL: Lazy<Regex> = Lazy::new(|| Regex::new(r"\n{3,}").unwrap());
static WS: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").unwrap());

/// Miroir de `splitParagraphs` (`zotero_passages.mjs`) : un saut de ligne
/// seul devient un espace, 3+ deviennent une frontière `\n\n`, puis split sur
/// cette frontière. Partagé par `passage_chunks` (ci-dessous) et
/// `zotero::best_page_paragraph` (recherche corpus, hors chunking).
pub(crate) fn split_paragraphs(text: &str) -> Vec<String> {
    let collapsed = MULTI_NL.replace_all(&collapse_single_newlines(text), "\n\n").to_string();
    collapsed
        .split("\n\n")
        .map(|p| WS.replace_all(p.trim(), " ").trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

fn passage_chunks(pages: &[Page], target: usize, overlap: usize) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    for entry in pages {
        let paragraphs = split_paragraphs(&entry.text);
        for paragraph in paragraphs {
            let chars: Vec<char> = paragraph.chars().collect();
            if chars.len() <= target {
                if chars.len() >= 70 {
                    chunks.push(Chunk { page: entry.page, text: paragraph.clone() });
                }
                continue;
            }
            let mut start = 0usize;
            while start < chars.len() {
                let mut end = (start + target).min(chars.len());
                if end < chars.len() {
                    // dernier ". " avant `end`, si situé après start+target*0.55
                    if let Some(boundary) = last_index_of(&chars, ". ", end) {
                        if boundary as f64 > start as f64 + target as f64 * 0.55 {
                            end = boundary + 1;
                        }
                    }
                }
                let piece: String = chars[start..end].iter().collect::<String>().trim().to_string();
                if piece.chars().count() >= 70 {
                    chunks.push(Chunk { page: entry.page, text: piece });
                }
                if end >= chars.len() {
                    break;
                }
                start = (start + 1).max(end.saturating_sub(overlap));
                if let Some(next_space) = index_of(&chars, ' ', start) {
                    if next_space < start + 40 {
                        start = next_space + 1;
                    }
                }
            }
        }
    }
    chunks
}

fn last_index_of(chars: &[char], needle: &str, before: usize) -> Option<usize> {
    let needle_chars: Vec<char> = needle.chars().collect();
    if needle_chars.is_empty() || before < needle_chars.len() {
        return None;
    }
    let mut i = (before - needle_chars.len()) as isize;
    while i >= 0 {
        let idx = i as usize;
        if chars[idx..idx + needle_chars.len()] == needle_chars[..] {
            return Some(idx);
        }
        i -= 1;
    }
    None
}

fn index_of(chars: &[char], needle: char, from: usize) -> Option<usize> {
    chars.iter().skip(from).position(|&c| c == needle).map(|p| p + from)
}

static SECTION_BONUS: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(abstract|summary|conclusion|conclusions|discussion|results?|findings?|limitations?|implications?|resume|resultats?)\b").unwrap()
});
static STRONG_CLAIM: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(we (find|found|show|demonstrate|estimate)|our results|we conclude|nous (montrons|estimons)|results? (show|indicate|suggest))\b").unwrap()
});
static STRONG_CLAIM_SHORT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(we (find|found|show|demonstrate|estimate)|our results|nous (montrons|estimons)|principal result)\b").unwrap()
});
static NUM_UNIT: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)\b\d+(?:[.,]\d+)?\s*(?:%|km|kg|gt|w\s*m|years?|ans?)\b").unwrap());
static NUM_DECIMAL: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b\d+[.,]\d+\b").unwrap());
static RMSE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?i)root-mean-square").unwrap());
static SIGNIFICANT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)significant|increase|decrease|difference|correction|applicable|limitation").unwrap()
});

/// Miroir de `scoreCandidateText` — partagé par `search_passages`
/// (ci-dessous, sur des chunks) et `zotero::search_corpus`/
/// `best_page_paragraph` (sur des pages/paragraphes entiers).
pub(crate) fn score_candidate_text(text: &str, query_tokens: &[String], normalized_query: &str, generic: bool) -> f64 {
    let normalized = normalize_search_text(text);
    let mut matched = 0f64;
    let mut occurrences = 0f64;
    for token in query_tokens {
        let re = word_regex(token);
        let count = count_matches(&re, &normalized);
        if count > 0 {
            matched += 1.0;
        }
        occurrences += count.min(4) as f64;
    }
    let mut score = matched * 7.0 + occurrences * 1.5;
    if query_tokens.len() > 1 {
        score += (matched / query_tokens.len() as f64) * 8.0;
    }
    if normalized_query.chars().count() > 12 && normalized.contains(normalized_query) {
        score += 14.0;
    }
    if SECTION_BONUS.is_match(text) {
        score += if generic { 8.0 } else { 2.0 };
    }
    if STRONG_CLAIM_SHORT.is_match(text) {
        score += 3.0;
    }
    if NUM_UNIT.is_match(text) {
        score += 1.5;
    }
    score += (text.chars().count().min(800) as f64) / 1600.0;
    score
}

fn sentence_list(text: &str) -> Vec<String> {
    let ws = Regex::new(r"\s+").unwrap();
    let collapsed = ws.replace_all(text, " ").trim().to_string();
    // Approximation du split JS `(?<=[.!?])\s+(?=[A-Z0-9“"'‘])` : on scinde
    // après . ! ? suivi d'espace(s) puis d'une majuscule/chiffre/guillemet.
    let mut sentences = Vec::new();
    let chars: Vec<char> = collapsed.chars().collect();
    let mut start = 0usize;
    let mut i = 0usize;
    while i < chars.len() {
        if matches!(chars[i], '.' | '!' | '?') {
            let mut j = i + 1;
            let ws_start = j;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j > ws_start && j < chars.len() && is_sentence_start(chars[j]) {
                let sentence: String = chars[start..i + 1].iter().collect();
                sentences.push(sentence);
                start = j;
                i = j;
                continue;
            }
        }
        i += 1;
    }
    if start < chars.len() {
        sentences.push(chars[start..].iter().collect());
    }
    sentences
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| s.chars().count() >= 35 && s.chars().next().map(is_sentence_start).unwrap_or(false))
        .collect()
}

fn is_sentence_start(c: char) -> bool {
    c.is_ascii_uppercase() || c.is_ascii_digit() || matches!(c, '\u{201c}' | '"' | '\'' | '\u{2018}')
}

pub fn focus_passage_quote(text: &str, query: &str) -> String {
    let query_tokens = dedup_preserve_order(tokens(query));
    let candidates = sentence_list(text);
    if candidates.is_empty() {
        let ws = Regex::new(r"\s+").unwrap();
        let collapsed = ws.replace_all(text, " ").trim().to_string();
        return take_chars(&collapsed, 500);
    }
    let mut ranked: Vec<(usize, f64, f64)> = Vec::new(); // (index dans candidates, score, matched)
    for (index, sentence) in candidates.iter().enumerate() {
        let normalized = normalize_search_text(sentence);
        let mut matched = 0f64;
        let mut occurrences = 0f64;
        for token in &query_tokens {
            let re = word_regex(token);
            let count = count_matches(&re, &normalized);
            if count > 0 {
                matched += 1.0;
            }
            occurrences += count.min(3) as f64;
        }
        let mut score = matched * 8.0 + occurrences;
        if STRONG_CLAIM.is_match(sentence) {
            score += 5.0;
        }
        if NUM_UNIT.is_match(sentence) {
            score += 3.0;
        } else if NUM_DECIMAL.is_match(sentence) {
            score += 3.0;
        }
        if RMSE.is_match(sentence) {
            score += 7.0;
        } else if SIGNIFICANT.is_match(sentence) {
            score += 2.0;
        }
        ranked.push((index, score, matched));
    }
    ranked.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then(a.0.cmp(&b.0)));
    // Garde (B6, plans/065-revue-findings.md ; miroir de
    // sidecar/zotero_passages.mjs:113-122) : une phrase qui ne contient
    // AUCUN token de la requête ne doit jamais l'emporter sur une phrase
    // pertinente uniquement grâce à ses bonus structurels (« we show »,
    // motif numérique, root-mean-square…) — sinon un fragment hors sujet
    // mais à fort bonus devient la citation affichée. Repli sur le
    // meilleur score brut seulement si aucune phrase n'a de token, ou si
    // la requête est générique (aucun token exploitable).
    let chosen = if !query_tokens.is_empty() {
        ranked.iter().find(|(_, _, matched)| *matched > 0.0).unwrap_or(&ranked[0])
    } else {
        &ranked[0]
    };
    take_chars(&candidates[chosen.0], 500)
}

fn take_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Recherche par passages sur un ensemble de pages — miroir de
/// `searchPassages` (chunking + score + dédoublonnage par page/préfixe).
pub fn search_passages(pages: &[Page], query: &str, limit: usize) -> Vec<Passage> {
    let query_tokens = query_tokens(query);
    let normalized_query = normalize_search_text(query);
    let generic = query_tokens.is_empty();
    let chunks = passage_chunks(pages, 760, 150);

    struct Ranked {
        page: u32,
        text: String,
        score: f64,
        index: usize,
    }
    let mut ranked: Vec<Ranked> = Vec::new();
    for (index, chunk) in chunks.iter().enumerate() {
        let score = score_candidate_text(&chunk.text, &query_tokens, &normalized_query, generic);
        if generic || score >= 7.0 {
            ranked.push(Ranked { page: chunk.page, text: chunk.text.clone(), score, index });
        }
    }
    ranked.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap()
            .then(a.page.cmp(&b.page))
            .then(a.index.cmp(&b.index))
    });

    let capped_limit = limit.clamp(1, 10);
    let mut out: Vec<Passage> = Vec::new();
    let mut per_page: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
    for entry in &ranked {
        if *per_page.get(&entry.page).unwrap_or(&0) >= 2 {
            continue;
        }
        // Miroir fidèle d'une particularité du mjs : `out.some((other) =>
        // normalizeSearchText(other.text)...)` lit `other.text`, un champ qui
        // n'existe PAS sur les éléments de `out` (ils portent `context`, pas
        // `text`) — le dédoublonnage par préfixe est donc inerte en pratique
        // dans kb_cli.mjs (`other.text` vaut toujours `undefined`). Reproduit
        // tel quel (jamais de dédoublonnage ici) plutôt que "corrigé", pour
        // rester en parité avec la sortie réelle du CLI Node.
        let score = (entry.score * 100.0).round() / 100.0;
        out.push(Passage {
            page: entry.page,
            quote: focus_passage_quote(&entry.text, query),
            context: take_chars(&entry.text, 900),
            score,
        });
        *per_page.entry(entry.page).or_insert(0) += 1;
        if out.len() >= capped_limit {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_accents_and_case() {
        assert_eq!(normalize_search_text("Étude d'Impact — 2024"), "etude d impact 2024");
    }

    #[test]
    fn court_texte_ne_produit_aucun_passage() {
        // chunk < 70 caractères => rejeté par passage_chunks (miroir du
        // seuil réel de kb_cli.mjs) : c'est le cas exercé par la fixture
        // `search-note` (57 caractères de texte).
        let pages = vec![Page { page: 1, text: "Ceci est une note de test pour les fixtures de parite KB.".to_string() }];
        let out = search_passages(&pages, "fixture", 5);
        assert!(out.is_empty());
    }

    #[test]
    fn split_pdf_pages_decoupe_sur_form_feed() {
        let pages = split_pdf_pages("page un\u{000c}page deux\u{000c}\u{000c}");
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].page, 1);
        assert_eq!(pages[0].text, "page un");
        assert_eq!(pages[1].page, 2);
        assert_eq!(pages[1].text, "page deux");
    }

    #[test]
    fn search_passages_trouve_un_chunk_pertinent_et_borne_le_score() {
        let long_text = "Introduction générale sur le sujet, sans rapport direct. ".repeat(3)
            + "Results show that albedo decreases significantly by 2.4 percent in August 2024, a clear finding for the glacier surface energy balance. "
            + &"Texte de remplissage sans lien avec la requête, juste pour allonger le passage un peu plus. ".repeat(2);
        let pages = vec![Page { page: 3, text: long_text }];
        let out = search_passages(&pages, "albedo results", 5);
        assert!(!out.is_empty(), "un passage pertinent devrait être trouvé");
        assert_eq!(out[0].page, 3);
        assert!(out[0].context.to_lowercase().contains("albedo"));
    }

    // --- B6 (plans/065-revue-findings.md, KBC-03) : le garde « jamais une
    // citation sans token » — miroir des deux mêmes cas de
    // sidecar/zotero_passages.test.mjs (« focalise le lien… » /
    // « une phrase sans aucun token… »). ---

    #[test]
    fn focus_passage_quote_focalise_sur_une_phrase_exacte_plutot_que_le_paragraphe() {
        let paragraph = "Reference context before the result. These equations describe measurements with root-mean-square differences of 0.016. More discussion follows.";
        assert_eq!(
            focus_passage_quote(paragraph, "main results root mean square"),
            "These equations describe measurements with root-mean-square differences of 0.016."
        );
    }

    #[test]
    fn focus_passage_quote_ne_laisse_jamais_un_bonus_structurel_seul_lemporter() {
        // "root-mean-square" (bonus +7) apparaît dans la DEUXIÈME phrase, qui
        // ne contient aucun token de la requête ("albedo") — sans le garde
        // matched>0, elle l'emporterait sur la première phrase, pertinente
        // mais sans bonus structurel. C'est exactement le bug B6/KBC-03.
        let text = "Fire aerosol deposition reduced summer albedo. We show root-mean-square differences of 0.016 for the calibration set.";
        assert_eq!(focus_passage_quote(text, "albedo"), "Fire aerosol deposition reduced summer albedo.");
    }
}
