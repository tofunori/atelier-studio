//! Ses modifications de texte (suivis de Word) posées sur le .tex, une
//! phrase à la fois (lot 2 de la révision avec le relecteur, maquette
//! « lot2 » choisie par Thierry le 2026-11-12).
//!
//! Chaque phrase du .docx qui porte un suivi devient une [`Edit`] :
//! - `apply` : la phrase du .tex est encore celle qu'il a lue ; sa version
//!   est réécrite en LaTeX à partir du .tex (commandes, citations et
//!   équations gardées telles quelles), prête à accepter ;
//! - `done` : le .tex dit déjà ce qu'il propose ;
//! - `changed` : le passage a bougé depuis (ou sa retouche touche une
//!   citation, une équation) ; sa version s'affiche à côté et Claude peut
//!   fusionner ;
//! - `note` : ce qu'il a tapé en français dans le texte, qui n'est pas du
//!   texte de l'article mais une consigne : il devient un commentaire.
//!
//! Rien n'est écrit dans le .tex ici.

use super::{Fit, Place, TexText, align, cluster, line_span, position};
use crate::model::{DocModel, Para};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct Edit {
    /// Rang dans le document (1, 2…), stable pour un même .docx.
    pub n: usize,
    /// apply, done, changed, note
    pub status: &'static str,
    /// La phrase telle qu'il l'a lue (sans ses ajouts).
    pub before: String,
    /// Sa version.
    pub after: String,
    /// Sa retouche mot à mot : ("", texte gardé), ("-", retiré), ("+", ajouté).
    pub diff: Vec<(&'static str, String)>,
    /// Phrase du .tex réécrite à sa façon (`apply`) : remplace `place.text`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latex: Option<String>,
    pub author: String,
    pub date: String,
    pub place: Place,
    /// Phrase déplacée : la retouche jumelle (retrait ↔ ajout), à accepter
    /// ensemble.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pair: Option<usize>,
}

/// Un mot du paragraphe : ce qu'il était, ce qu'il est devenu, et ce qui le
/// sépare du précédent avant et après ses retouches.
#[derive(Debug, Clone, Default)]
struct Word {
    old: String,
    new: String,
    gap_old: String,
    gap_new: String,
    changed: bool,
    /// Champ de Word (citation Zotero) : le .tex a un \cite à la place.
    field: bool,
    /// Équation (OMML) : un seul « mot ».
    math: bool,
    /// Citation écrite en clair par Word (« (Pu et al. 2021) »), réécrite
    /// en \\citep / \\citet quand ses clés se retrouvent dans le .tex.
    cite: Option<String>,
    /// Citation (en clair ou champ Zotero) : le .tex a un \cite à sa place.
    is_cite: bool,
    changes: Vec<u32>,
}

impl Word {
    fn norm(text: &str, math: bool) -> String {
        if math && !text.is_empty() {
            "math".into()
        } else {
            text.to_lowercase()
        }
    }
    fn old_norm(&self) -> String {
        Self::norm(&self.old, self.math)
    }
    fn new_norm(&self) -> String {
        Self::norm(&self.new, self.math)
    }
}

const MATH: char = '\u{1}';

/// Clés de citation du .tex (telles qu'écrites dans \cite{…}).
fn cite_keys(tex: &TexText) -> Vec<String> {
    let mut keys: Vec<String> = tex
        .tokens
        .iter()
        .filter(|t| t.word.starts_with("cite"))
        .map(|t| tex.files[t.file].text[t.start..t.end].to_string())
        .collect();
    keys.sort();
    keys.dedup();
    keys
}

/// Minuscules ASCII sans accents ni ponctuation : « Sierra-Hernández » →
/// « sierrahernandez ».
fn fold(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars().flat_map(char::to_lowercase) {
        let c = match c {
            'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'ø' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            _ => c,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        }
    }
    out
}

/// Année d'une référence : « 2021 », « 2021a ».
fn is_year(word: &str) -> bool {
    let b = word.as_bytes();
    (b.len() == 4 || (b.len() == 5 && b[4].is_ascii_lowercase()))
        && (word.starts_with("19") || word.starts_with("20"))
        && b[..4].iter().all(u8::is_ascii_digit)
}

/// « Pu et al. 2021 », « Warren and Wiscombe 1980 », « Jain 2024 » : la clé
/// du .tex qui commence par le nom du premier auteur et l'année, si une
/// seule convient.
fn resolve_item(item: &str, keys: &[String]) -> Option<String> {
    let item = item.trim().trim_end_matches(['.', ',']);
    let year = item.rsplit([' ', '\u{a0}']).next()?;
    if !is_year(year) {
        return None;
    }
    let names = item[..item.len() - year.len()].trim().trim_end_matches(',');
    let first = names
        .split(" et al")
        .next()?
        .split(" and ")
        .next()?
        .split(" & ")
        .next()?
        .trim();
    if !first.chars().next()?.is_uppercase() {
        return None;
    }
    let want = format!("{}{}", fold(first), &year[..4]);
    let suffix = year.get(4..).unwrap_or("");
    let hits: Vec<&String> = keys.iter().filter(|k| fold(k).starts_with(&want)).collect();
    match hits.as_slice() {
        [one] => Some((*one).clone()),
        many if !suffix.is_empty() => many
            .iter()
            .find(|k| fold(k) == format!("{want}{suffix}"))
            .map(|k| (*k).clone()),
        _ => None,
    }
}

/// Une citation en clair réécrite en LaTeX : « (A et al. 2020; B 2021) » →
/// \citep{a2020,b2021}, « A et al. (2020) » → \citet{a2020}.
fn cite_latex(text: &str, keys: &[String]) -> Option<String> {
    let text = text.trim();
    if let Some(inner) = text.strip_prefix('(').and_then(|t| t.strip_suffix(')')) {
        let (pre, inner) = match inner
            .strip_prefix("e.g.,")
            .or_else(|| inner.strip_prefix("e.g."))
        {
            Some(rest) => ("[e.g.,][]", rest),
            None => ("", inner),
        };
        let found: Option<Vec<String>> = inner.split(';').map(|i| resolve_item(i, keys)).collect();
        return Some(format!("\\citep{pre}{{{}}}", found?.join(",")));
    }
    let open = text.rfind('(')?;
    let year = text[open + 1..].strip_suffix(')')?.trim();
    let key = resolve_item(&format!("{} {year}", text[..open].trim()), keys)?;
    Some(format!("\\citet{{{key}}}"))
}

/// Citations écrites en clair dans le texte de Word : (début, fin incluse)
/// en caractères. Entre parenthèses, chaque élément (séparé par « ; ») finit
/// par une année et commence par un nom ; sinon « Nom et al. (2021) ».
fn cite_ranges(chars: &[char]) -> Vec<(usize, usize)> {
    let mut out: Vec<(usize, usize)> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '(' {
            i += 1;
            continue;
        }
        let Some(len) = chars[i + 1..]
            .iter()
            .take(400)
            .position(|&c| c == ')' || c == '(')
        else {
            i += 1;
            continue;
        };
        let j = i + 1 + len;
        if chars[j] != ')' {
            i = j;
            continue;
        }
        let inner: String = chars[i + 1..j].iter().collect();
        let inner = inner.trim();
        if is_year(inner) {
            // narrative : le nom avant la parenthèse
            let before: String = chars[..i].iter().collect();
            let before = before.trim_end();
            let word_start = |t: &str| -> usize {
                t.char_indices()
                    .rev()
                    .take_while(|(_, c)| c.is_alphabetic() || *c == '-')
                    .last()
                    .map_or(t.len(), |(k, _)| k)
            };
            let start = if let Some(t) = before.strip_suffix("et al.") {
                word_start(t.trim_end())
            } else {
                let w = word_start(before);
                let t = before[..w].trim_end();
                match t.strip_suffix(" and").or_else(|| t.strip_suffix(" &")) {
                    Some(t) => word_start(t.trim_end()),
                    None => w,
                }
            };
            let name = &before[start..];
            if name.chars().next().is_some_and(char::is_uppercase) {
                let start = before[..start].chars().count();
                if out.last().is_none_or(|l| l.1 < start) {
                    out.push((start, j));
                }
            }
        } else {
            let items: Vec<&str> = inner
                .trim_start_matches("e.g.,")
                .trim_start_matches("e.g.")
                .split(';')
                .map(str::trim)
                .collect();
            let cite = !items.is_empty()
                && items.iter().all(|it| {
                    let it = it.trim_end_matches(['.', ',']);
                    it.chars().next().is_some_and(char::is_uppercase)
                        && it.rsplit([' ', '\u{a0}']).next().is_some_and(is_year)
                        && it.split_whitespace().count() >= 2
                });
            if cite {
                out.push((i, j));
            }
        }
        i = j + 1;
    }
    out
}

/// Mots d'un paragraphe, avec la ponctuation finale à part.
fn words_of(p: &Para, keys: &[String]) -> (Vec<Word>, (String, String)) {
    // (caractère, suivi, champ, numéro du suivi)
    let mut cs: Vec<(char, &str, bool, Option<u32>)> = Vec::new();
    for s in &p.segments {
        let rev = match s.rev {
            Some("ins" | "moveTo") => "ins",
            Some("del" | "moveFrom") => "del",
            _ => "",
        };
        if s.kind == "object" && s.latex.is_some() {
            cs.push((' ', rev, false, s.change));
            cs.push((MATH, rev, false, s.change));
            cs.push((' ', rev, false, s.change));
        } else if matches!(s.kind, "text" | "field") {
            for c in s.text.chars() {
                cs.push((c, rev, s.kind == "field", s.change));
            }
        } else {
            cs.push((' ', rev, false, s.change));
        }
    }
    let chars: Vec<char> = cs.iter().map(|c| c.0).collect();
    let mut ranges = cite_ranges(&chars);
    // Champs de Word (Zotero) : un seul mot chacun.
    let mut k = 0;
    while k < cs.len() {
        if !cs[k].2 {
            k += 1;
            continue;
        }
        let start = k;
        while k < cs.len() && cs[k].2 {
            k += 1;
        }
        if !ranges.iter().any(|r| r.0 < k && start <= r.1) {
            ranges.push((start, k - 1));
        }
    }
    let cites: HashMap<usize, usize> = ranges.into_iter().collect();
    let mut out = Vec::new();
    let (mut gap_old, mut gap_new) = (String::new(), String::new());
    let mut gap_changed = false;
    let mut gap_changes = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i].0;
        if let Some(&end) = cites.get(&i) {
            let mut w = Word {
                field: true,
                gap_old: std::mem::take(&mut gap_old),
                gap_new: std::mem::take(&mut gap_new),
                changes: std::mem::take(&mut gap_changes),
                changed: std::mem::take(&mut gap_changed),
                ..Word::default()
            };
            for &(ch, rev, _, change) in &cs[i..=end] {
                if rev != "ins" {
                    w.old.push(ch);
                }
                if rev != "del" {
                    w.new.push(ch);
                }
                if !rev.is_empty() && !ch.is_whitespace() {
                    w.changed = true;
                    w.changes.extend(change);
                }
            }
            let seen: String = cs[i..=end].iter().map(|c| c.0).collect();
            w.is_cite = seen.split(|c: char| !c.is_alphanumeric()).any(is_year);
            w.cite = cite_latex(&w.new, keys);
            // « (Wang et al. 2022) » devenu « (Wang et al., 2022) » : même \cite.
            if w.changed
                && !w.old.trim().is_empty()
                && w.cite.is_some()
                && cite_latex(&w.old, keys) == w.cite
            {
                w.changed = false;
            }
            out.push(w);
            i = end + 1;
            continue;
        }
        if c.is_alphanumeric() || c == MATH {
            let math = c == MATH;
            let mut w = Word {
                field: cs[i].2,
                math,
                gap_old: std::mem::take(&mut gap_old),
                gap_new: std::mem::take(&mut gap_new),
                changes: std::mem::take(&mut gap_changes),
                ..Word::default()
            };
            while i < cs.len()
                && (if math {
                    cs[i].0 == MATH
                } else {
                    cs[i].0.is_alphanumeric()
                })
            {
                let (ch, rev, _, change) = cs[i];
                let ch = if ch == MATH { '§' } else { ch };
                if rev != "ins" {
                    w.old.push(ch);
                }
                if rev != "del" {
                    w.new.push(ch);
                }
                if !rev.is_empty() {
                    w.changed = true;
                    w.changes.extend(change);
                }
                i += 1;
            }
            // Une ponctuation retouchée devant un mot gardé compte comme une
            // retouche du mot ; un blanc ajouté ou retiré non (Word découpe
            // ses suivis au milieu des espaces).
            if gap_changed {
                w.changed = true;
            }
            gap_changed = false;
            if math && w.changed {
                // l'équation entière, pas seulement son symbole
                w.old = if w.old.is_empty() {
                    String::new()
                } else {
                    "§".into()
                };
                w.new = if w.new.is_empty() {
                    String::new()
                } else {
                    "§".into()
                };
            }
            out.push(w);
        } else {
            let (ch, rev, _, change) = cs[i];
            if rev != "ins" {
                gap_old.push(ch);
            }
            if rev != "del" {
                gap_new.push(ch);
            }
            if !rev.is_empty() && !ch.is_whitespace() {
                gap_changed = true;
                gap_changes.extend(change);
            }
            i += 1;
        }
    }
    (refs_and_exponents(out), (gap_old, gap_new))
}

const SUPERSCRIPTS: &str = "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺";

/// Ce que le .tex écrit autrement : le numéro de « Fig. 1b » est un \ref
/// (seul « b » reste un mot du .tex), « yr⁻¹ » une équation.
fn refs_and_exponents(words: Vec<Word>) -> Vec<Word> {
    const REFS: [&str; 14] = [
        "fig",
        "figs",
        "figure",
        "figures",
        "table",
        "tables",
        "eq",
        "eqs",
        "equation",
        "equations",
        "section",
        "sections",
        "sect",
        "s",
    ];
    let mut out: Vec<Word> = Vec::with_capacity(words.len());
    for mut w in words {
        if !w.field
            && !w.math
            && w.old
                .chars()
                .chain(w.new.chars())
                .all(|c| SUPERSCRIPTS.contains(c))
        {
            w.math = true;
        }
        let after_ref = out.last().is_some_and(|p: &Word| {
            !p.field
                && (REFS.contains(&p.new.to_lowercase().as_str())
                    || REFS.contains(&p.old.to_lowercase().as_str()))
        });
        let digits = |t: &str| t.chars().take_while(char::is_ascii_digit).count();
        let is_num = |t: &str| {
            let d = digits(t);
            d > 0 && t.len() - d <= 1 && t[d..].chars().all(|c| c.is_ascii_lowercase())
        };
        if after_ref
            && !w.field
            && (is_num(&w.old) || w.old.is_empty())
            && (is_num(&w.new) || w.new.is_empty())
        {
            let (dold, dnew) = (digits(&w.old), digits(&w.new));
            let letter = Word {
                old: w.old[dold..].to_string(),
                new: w.new[dnew..].to_string(),
                changed: w.changed,
                changes: w.changes.clone(),
                ..Word::default()
            };
            w.old.truncate(dold);
            w.new.truncate(dnew);
            w.field = true;
            out.push(w);
            if !letter.old.is_empty() || !letter.new.is_empty() {
                out.push(letter);
            }
            continue;
        }
        out.push(w);
    }
    out
}

/// Abréviations après lesquelles un point ne finit pas la phrase.
const ABBREV: [&str; 16] = [
    "al", "e", "g", "i", "fig", "figs", "eq", "eqs", "sect", "approx", "vs", "ca", "resp", "ref",
    "refs", "no",
];

/// Coupe un séparateur en fin de phrase : (ponctuation finale, reste) quand
/// il contient « . », « ? » ou « ! » suivi d'un blanc.
fn split_end(gap: &str) -> Option<(String, String)> {
    let mut seen = false;
    for (i, c) in gap.char_indices() {
        if matches!(c, '.' | '?' | '!') {
            seen = true;
        } else if seen && c.is_whitespace() {
            let rest = gap[i..].trim_start();
            return Some((gap[..i].to_string(), rest.to_string()));
        } else if seen && !matches!(c, ')' | '"' | '\'' | '\u{201d}' | '\u{2019}') {
            seen = false;
        }
    }
    None
}

/// Une phrase : ses mots (le séparateur du premier ôté) et sa ponctuation
/// finale avant et après ses retouches.
struct Sentence {
    words: Vec<Word>,
    end_old: String,
    end_new: String,
}

fn sentences(words: Vec<Word>, tail: (String, String)) -> Vec<Sentence> {
    let mut out = Vec::new();
    let mut cur: Vec<Word> = Vec::new();
    for mut w in words {
        if let Some(prev) = cur.last() {
            let abbrev = ABBREV.contains(&prev.new.to_lowercase().as_str())
                || ABBREV.contains(&prev.old.to_lowercase().as_str())
                || (prev.new.chars().count() == 1 && prev.new.chars().all(char::is_uppercase));
            let cut_new = split_end(&w.gap_new);
            let cut_old = split_end(&w.gap_old);
            if !abbrev && (cut_new.is_some() || cut_old.is_some()) {
                // Un côté seul coupe (« zones. » suivi de son ajout) : la
                // ponctuation finale de l'autre côté finit aussi la phrase.
                let only_end = |gap: &str| -> Option<(String, String)> {
                    let t = gap.trim();
                    (!t.is_empty()
                        && t.chars()
                            .all(|c| matches!(c, '.' | '?' | '!' | ')' | '"' | '\u{201d}'))
                        && t.contains(['.', '?', '!']))
                    .then(|| (t.to_string(), String::new()))
                };
                let (end_new, rest_new) = cut_new
                    .or_else(|| only_end(&w.gap_new))
                    .unwrap_or_else(|| (String::new(), w.gap_new.clone()));
                let (end_old, rest_old) = cut_old
                    .or_else(|| only_end(&w.gap_old))
                    .unwrap_or_else(|| (String::new(), w.gap_old.clone()));
                w.gap_new = rest_new;
                w.gap_old = rest_old;
                out.push(Sentence {
                    words: std::mem::take(&mut cur),
                    end_old,
                    end_new,
                });
            }
        } else {
            w.gap_old = w.gap_old.trim_start().to_string();
            w.gap_new = w.gap_new.trim_start().to_string();
        }
        cur.push(w);
    }
    if !cur.is_empty() {
        out.push(Sentence {
            words: cur,
            end_old: tail.0.trim_end().to_string(),
            end_new: tail.1.trim_end().to_string(),
        });
    }
    out
}

/// Ce que Word a écrit, en LaTeX : tirets, espaces insécables, caractères
/// spéciaux.
pub fn to_latex(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '\u{2013}' => out.push_str("--"),
            '\u{2014}' => out.push_str("---"),
            '\u{a0}' | '\u{202f}' => out.push('~'),
            '%' | '&' | '#' | '_' | '$' => {
                out.push('\\');
                out.push(c);
            }
            '\u{2019}' => out.push('\''),
            '\u{2018}' => out.push('`'),
            '\u{201c}' => out.push_str("``"),
            '\u{201d}' => out.push_str("''"),
            _ => out.push(c),
        }
    }
    out
}

/// Séparateur du .tex qu'on peut réécrire sans perdre de commande : blancs,
/// ponctuation, espaces insécables et caractères échappés (« \_ », « \% »).
fn plain(chunk: &str) -> bool {
    let b = chunk.as_bytes();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'\\' => {
                if !b
                    .get(i + 1)
                    .is_some_and(|c| matches!(c, b'_' | b'%' | b'&' | b'#' | b',' | b'$'))
                {
                    return false;
                }
                i += 2;
            }
            b'{' | b'}' | b'$' | b'%' => return false,
            _ => i += 1,
        }
    }
    true
}

const FRENCH: [&str; 24] = [
    "le",
    "la",
    "les",
    "des",
    "du",
    "pour",
    "est",
    "une",
    "ici",
    "ton",
    "ta",
    "tes",
    "dans",
    "avec",
    "que",
    "qui",
    "pas",
    "ce",
    "cette",
    "mettre",
    "expliquer",
    "important",
    "sur",
    "au",
];

/// Phrase ajoutée par lui, en français : une consigne, pas du texte.
fn is_french_note(s: &Sentence) -> bool {
    if s.words.iter().any(|w| !w.old.is_empty()) {
        return false;
    }
    let mut hits: Vec<String> = s
        .words
        .iter()
        .map(|w| w.new.to_lowercase())
        .filter(|w| FRENCH.contains(&w.as_str()))
        .collect();
    hits.sort();
    hits.dedup();
    hits.len() >= 3
}

/// Fin de la phrase du .tex qui commence avant `start` et finit après
/// `end` : jusqu'à la ponctuation finale, une ligne vide ou un commentaire.
fn tex_sentence(text: &str, start: usize, end: usize) -> (usize, usize) {
    let b = text.as_bytes();
    // début : après « . » + blanc, en début de ligne quand la ligne d'avant
    // finit une phrase, est vide ou est un commentaire
    let mut s = start;
    while s > 0 {
        let c = b[s - 1];
        if c == b'\n' {
            let line_start = text[..s - 1].rfind('\n').map_or(0, |i| i + 1);
            let prev = text[line_start..s - 1].trim();
            if prev.is_empty()
                || prev.starts_with('%')
                || prev.ends_with(['.', '?', '!', '}'])
                || prev.starts_with('\\')
            {
                break;
            }
        } else if c.is_ascii_whitespace() && s >= 2 && matches!(b[s - 2], b'.' | b'?' | b'!') {
            let before = &text[..s - 2];
            let word: String = before
                .chars()
                .rev()
                .take_while(|c| c.is_alphanumeric())
                .collect::<String>()
                .chars()
                .rev()
                .collect();
            if !ABBREV.contains(&word.to_lowercase().as_str()) {
                break;
            }
        } else if c == b'%' {
            break;
        }
        s -= 1;
    }
    while s < start && b[s].is_ascii_whitespace() {
        s += 1;
    }
    // fin : la ponctuation finale (avec une parenthèse ou un guillemet)
    let mut e = end;
    while e < b.len() {
        let c = b[e];
        if matches!(c, b'.' | b'?' | b'!') {
            let mut k = e + 1;
            while k < b.len() && matches!(b[k], b')' | b'\'' | b'"') {
                k += 1;
            }
            let word: String = text[..e]
                .chars()
                .rev()
                .take_while(|c| c.is_alphanumeric())
                .collect::<String>()
                .chars()
                .rev()
                .collect();
            if (k >= b.len() || b[k].is_ascii_whitespace())
                && !ABBREV.contains(&word.to_lowercase().as_str())
            {
                return (s, k);
            }
        } else if (c == b'\n' && text[e + 1..].starts_with('\n'))
            || (c == b'%' && (e == 0 || b[e - 1] != b'\\'))
        {
            break;
        }
        e += 1;
    }
    (s, text[..e].trim_end().len().max(end))
}

/// La phrase du .tex réécrite à sa façon, mot à mot, sans toucher aux
/// commandes, citations et équations qui l'entourent. `None` quand ce n'est
/// pas sûr (champ ou équation retouchés, mots qui ne se suivent pas).
fn rewrite(s: &Sentence, tex: &TexText, file: usize, span: (usize, usize)) -> Option<String> {
    if s.words.iter().any(|w| w.changed && w.math) {
        return None;
    }
    let text = &tex.files[file].text;
    let inside = |t: &&super::TexToken| t.file == file && t.start >= span.0 && t.end <= span.1;
    let toks: Vec<&super::TexToken> = tex
        .tokens
        .iter()
        .filter(inside)
        .filter(|t| !t.word.starts_with("cite"))
        .collect();
    // Commandes \cite… de la phrase : (début de la commande, fin).
    let mut cites: Vec<(usize, usize)> = Vec::new();
    for t in tex
        .tokens
        .iter()
        .filter(inside)
        .filter(|t| t.word.starts_with("cite"))
    {
        let start = text[..t.start].rfind("\\cite")?;
        let end = t.end + text[t.end..].find('}')? + 1;
        if cites.last().is_none_or(|l| l.0 != start) {
            cites.push((start, end));
        }
    }
    let mut w_out = Writer {
        text,
        out: String::new(),
        cursor: span.0,
        buf: String::new(),
        dirty: false,
    };
    let mut j = 0;
    let mut c = 0;
    for w in &s.words {
        let gap_same = w.gap_old == w.gap_new;
        let has_old = !w.old.trim().is_empty();
        let has_new = !w.new.trim().is_empty();
        if w.is_cite {
            // citation : celle du .tex qui lui répond, gardée, remplacée ou ôtée
            if !has_old {
                w_out.add(&w.gap_new, w.cite.as_deref()?);
                continue;
            }
            let (c0, c1) = *cites.get(c)?;
            if toks.get(j).is_some_and(|t| t.start < c0) {
                return None;
            }
            c += 1;
            let latex = if !w.changed {
                text[c0..c1].to_string()
            } else if has_new {
                w.cite.clone()?
            } else {
                String::new()
            };
            w_out.take(c0, c1, &w.gap_new, &latex, !w.changed && gap_same)?;
            continue;
        }
        if w.field {
            // numéro d'un \ref : le .tex le garde dans son séparateur
            if w.changed {
                return None;
            }
            w_out.buf.push_str(&to_latex(&w.gap_new));
            continue;
        }
        if !has_old && w.old.is_empty() {
            w_out.add(&w.gap_new, &to_latex(&w.new));
            continue;
        }
        let tok = toks.get(j)?;
        j += 1;
        if tok.word != w.old_norm() {
            return None;
        }
        let word = if w.changed {
            to_latex(&w.new)
        } else {
            text[tok.start..tok.end].to_string()
        };
        w_out.take(
            tok.start,
            tok.end,
            &w.gap_new,
            &word,
            !w.changed && gap_same,
        )?;
    }
    if j != toks.len() || c != cites.len() {
        return None;
    }
    let rest = &text[w_out.cursor..span.1];
    let mut out = w_out.out;
    let buf = w_out.buf;
    if plain(rest) {
        if w_out.dirty || s.end_old != s.end_new {
            out.push_str(&buf);
            out.push_str(&to_latex(s.end_new.trim()));
        } else {
            out.push_str(rest);
        }
    } else if s.end_old == s.end_new && !w_out.dirty {
        out.push_str(rest);
    } else {
        let stem = rest.strip_suffix(to_latex(s.end_old.trim()).as_str())?;
        out.push_str(stem);
        out.push_str(&buf);
        out.push_str(&to_latex(s.end_new.trim()));
    }
    // Un mot retiré laisse parfois deux espaces.
    if !text[span.0..span.1].contains("  ") {
        while out.contains("  ") {
            out = out.replace("  ", " ");
        }
    }
    Some(out.trim().trim_end_matches('~').to_string())
}

/// Réécriture d'une phrase du .tex : le texte du .tex là où rien n'a changé,
/// le sien ailleurs, les commandes du .tex gardées.
struct Writer<'a> {
    text: &'a str,
    out: String,
    cursor: usize,
    /// Son texte en attente (ajouts, séparateurs des mots retirés).
    buf: String,
    /// Le texte en attente vient de ses retouches.
    dirty: bool,
}

impl Writer<'_> {
    fn add(&mut self, gap: &str, word: &str) {
        self.buf.push_str(&to_latex(gap));
        self.buf.push_str(word);
        self.dirty = true;
    }

    /// Le mot du .tex `start..end` devient `word` (vide : retiré).
    fn take(&mut self, start: usize, end: usize, gap: &str, word: &str, same: bool) -> Option<()> {
        let chunk = &self.text[self.cursor..start];
        if same && !self.dirty {
            self.out.push_str(&self.text[self.cursor..end]);
            self.buf.clear();
        } else if plain(chunk) {
            self.buf.push_str(&to_latex(gap));
            self.dirty = true;
            if !word.is_empty() {
                self.out.push_str(&std::mem::take(&mut self.buf));
                self.out.push_str(word);
                self.dirty = false;
            }
        } else {
            let lead = chunk.len()
                - chunk
                    .trim_start_matches(|c: char| c.is_whitespace() || ",.;:()~".contains(c))
                    .len();
            let trail = chunk.len()
                - chunk
                    .trim_end_matches(|c: char| c.is_whitespace() || ",.;:()~".contains(c))
                    .len();
            let core = &chunk[lead..chunk.len() - trail];
            if lead > 0 && trail > 0 || word.is_empty() {
                return None;
            }
            let sep = format!("{}{}", std::mem::take(&mut self.buf), to_latex(gap));
            if lead > 0 {
                self.out.push_str(&sep);
                self.out.push_str(core);
            } else {
                self.out.push_str(core);
                self.out.push_str(&sep);
            }
            self.out.push_str(word);
            self.dirty = false;
        }
        self.cursor = end;
        Some(())
    }
}

fn diff_of(s: &Sentence) -> (Vec<(&'static str, String)>, String, String) {
    let (mut before, mut after) = (String::new(), String::new());
    let shown = |w: &Word, new: bool| {
        let (g, t) = if new {
            (&w.gap_new, &w.new)
        } else {
            (&w.gap_old, &w.old)
        };
        let t = if w.math && !t.is_empty() {
            "[équation]"
        } else {
            t.as_str()
        };
        format!("{g}{t}")
    };
    for w in &s.words {
        before.push_str(&shown(w, false));
        after.push_str(&shown(w, true));
    }
    before.push_str(&s.end_old);
    after.push_str(&s.end_new);
    let (before, after) = (before.trim().to_string(), after.trim().to_string());
    (word_diff(&before, &after), before, after)
}

/// Mots retirés (-) et ajoutés (+) entre ses deux phrases, espaces compris
/// (plus longue sous-suite commune) : ce que montrent l'éditeur et le chat.
fn word_diff(before: &str, after: &str) -> Vec<(&'static str, String)> {
    let split = |t: &str| -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        for c in t.chars() {
            match out.last_mut() {
                Some(last) if last.chars().last().is_some_and(char::is_whitespace) == c.is_whitespace() => last.push(c),
                _ => out.push(c.to_string()),
            }
        }
        out
    };
    let (a, b) = (split(before), split(after));
    let mut out: Vec<(&'static str, String)> = Vec::new();
    let mut push = |op: &'static str, t: &str| match out.last_mut() {
        Some((o, prev)) if *o == op => prev.push_str(t),
        _ => out.push((op, t.to_string())),
    };
    if a.len() * b.len() > 250_000 {
        push("-", before);
        push("+", after);
        return out;
    }
    let mut lcs = vec![vec![0u16; b.len() + 1]; a.len() + 1];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            lcs[i][j] = if a[i] == b[j] { lcs[i + 1][j + 1] + 1 } else { lcs[i + 1][j].max(lcs[i][j + 1]) };
        }
    }
    let (mut i, mut j) = (0, 0);
    while i < a.len() || j < b.len() {
        if i < a.len() && j < b.len() && a[i] == b[j] {
            push("", &a[i]);
            i += 1;
            j += 1;
        } else if i < a.len() && (j == b.len() || lcs[i + 1][j] >= lcs[i][j + 1]) {
            // le mot retiré d'abord, puis celui qui le remplace
            push("-", &a[i]);
            i += 1;
        } else {
            push("+", &b[j]);
            j += 1;
        }
    }
    out
}

/// Ses modifications, phrase par phrase, dans l'ordre du document.
pub fn edits(model: &DocModel, tex: &TexText, reviewer: &str) -> Vec<Edit> {
    if tex.tokens.is_empty() {
        return Vec::new();
    }
    let keys = cite_keys(tex);
    let paras: Vec<Vec<Sentence>> = model
        .paragraphs
        .iter()
        .map(|p| {
            let (w, tail) = words_of(p, &keys);
            sentences(w, tail)
        })
        .collect();
    // Alignement du texte qu'il a lu (sans ses ajouts ni les citations) sur le .tex.
    let mut orig: Vec<(usize, usize, usize)> = Vec::new(); // (paragraphe, phrase, mot)
    for (pi, ss) in paras.iter().enumerate() {
        for (si, s) in ss.iter().enumerate() {
            for (wi, w) in s.words.iter().enumerate() {
                if !w.old.is_empty() && !w.field {
                    orig.push((pi, si, wi));
                }
            }
        }
    }
    let a: Vec<String> = orig
        .iter()
        .map(|&(p, s, w)| paras[p][s].words[w].old_norm())
        .collect();
    let a: Vec<&str> = a.iter().map(String::as_str).collect();
    let b: Vec<&str> = tex.tokens.iter().map(|t| t.word.as_str()).collect();
    let map = align(&a, &b);
    let mut hit: HashMap<(usize, usize, usize), usize> = HashMap::new();
    for (k, key) in orig.iter().enumerate() {
        if let Some(t) = map[k] {
            hit.insert(*key, t);
        }
    }
    let changes: HashMap<u32, (&str, &str)> = model
        .changes
        .iter()
        .map(|c| (c.id, (c.author.as_str(), c.date.as_str())))
        .collect();
    let place_at = |file: usize, start: usize, end: usize, fit: Fit| -> Place {
        let text = &tex.files[file].text;
        Place {
            file,
            start,
            end,
            from: position(text, start),
            to: position(text, end),
            text: text[start..end].to_string(),
            fit,
        }
    };
    // Mot du .tex le plus proche d'une phrase sans mot retrouvé : avant elle
    // dans son paragraphe, sinon après, sinon dans les paragraphes voisins.
    let near = |pi: usize, si: usize| -> Option<usize> {
        let in_para = |p: usize, range: &mut dyn Iterator<Item = usize>| -> Option<usize> {
            for s in range {
                let words = paras[p][s].words.len();
                let found = (0..words).rev().find_map(|w| hit.get(&(p, s, w)).copied());
                if found.is_some() {
                    return found;
                }
            }
            None
        };
        in_para(pi, &mut (0..si).rev())
            .or_else(|| in_para(pi, &mut (si + 1..paras[pi].len())))
            .or_else(|| {
                (0..pi)
                    .rev()
                    .find_map(|p| in_para(p, &mut (0..paras[p].len()).rev()))
            })
            .or_else(|| (pi + 1..paras.len()).find_map(|p| in_para(p, &mut (0..paras[p].len()))))
    };
    // Où poser une phrase ajoutée : (fichier, blanc du .tex, côté) — après
    // la phrase retrouvée qui la précède (1), avant la suivante (-1), ou en
    // nouveau paragraphe après le précédent (2).
    let insert_at = |pi: usize, si: usize| -> Option<(usize, (usize, usize), i8)> {
        let anchor = (0..si)
            .rev()
            .find_map(|k| sentence_hits(&hit, &paras, pi, k, &tex.tokens).map(|r| (r, true)))
            .or_else(|| {
                (si + 1..paras[pi].len()).find_map(|k| {
                    sentence_hits(&hit, &paras, pi, k, &tex.tokens).map(|r| (r, false))
                })
            });
        match anchor {
            Some(((first, last), after_it)) => {
                let file = tex.tokens[first].file;
                let text = &tex.files[file].text;
                let span = tex_sentence(text, tex.tokens[first].start, tex.tokens[last].end);
                let gap = if after_it {
                    gap_after(text, span.1)
                } else {
                    gap_before(text, span.0)
                };
                gap.map(|g| (file, g, if after_it { 1 } else { -1 }))
            }
            None => (0..pi)
                .rev()
                .find_map(|p| {
                    (0..paras[p].len())
                        .rev()
                        .find_map(|k| sentence_hits(&hit, &paras, p, k, &tex.tokens))
                })
                .and_then(|(first, last)| {
                    let file = tex.tokens[first].file;
                    let text = &tex.files[file].text;
                    let span = tex_sentence(text, tex.tokens[first].start, tex.tokens[last].end);
                    gap_after(text, span.1).map(|g| (file, g, 2))
                }),
        }
    };
    let pairs = moves(&paras);
    let mut out: Vec<Edit> = Vec::new();
    for (pi, ss) in paras.iter().enumerate() {
        let mut note_open = false;
        let mut insert_open = false;
        for (si, s) in ss.iter().enumerate() {
            let touched = s.words.iter().any(|w| w.changed) || s.end_old != s.end_new;
            if !touched {
                note_open = false;
                insert_open = false;
                continue;
            }
            let (diff, before, after) = diff_of(s);
            let mut ids: Vec<u32> = s
                .words
                .iter()
                .flat_map(|w| w.changes.iter().copied())
                .collect();
            ids.sort_unstable();
            ids.dedup();
            let mut by: HashMap<&str, usize> = HashMap::new();
            let mut date = "";
            for id in &ids {
                if let Some((a, d)) = changes.get(id) {
                    *by.entry(a).or_default() += 1;
                    if *d > date {
                        date = d;
                    }
                }
            }
            let author = by
                .iter()
                .max_by_key(|(n, k)| (**k, std::cmp::Reverse(**n)))
                .map_or(reviewer.to_string(), |(n, _)| n.to_string());
            let near_place = |fit: Fit| -> Option<Place> {
                let t = near(pi, si)?;
                let tok = &tex.tokens[t];
                let (a, b) = line_span(&tex.files[tok.file].text, tok.start);
                Some(place_at(tok.file, a, b, fit))
            };
            if is_french_note(s) {
                // Deux phrases de consigne qui se suivent : une seule note.
                if note_open && let Some(last) = out.last_mut() {
                    last.after = format!("{} {}", last.after, after);
                    last.diff.push(("+", format!(" {after}")));
                    continue;
                }
                let Some(place) = near_place(Fit::Paragraph) else {
                    continue;
                };
                out.push(Edit {
                    n: out.len() + 1,
                    status: "note",
                    before: String::new(),
                    after,
                    diff,
                    latex: None,
                    author,
                    date: date.to_string(),
                    place,
                    pair: None,
                });
                note_open = true;
                continue;
            }
            note_open = false;
            let push =
                |status: &'static str, latex: Option<String>, place: Place, out: &mut Vec<Edit>| {
                    out.push(Edit {
                        n: out.len() + 1,
                        status,
                        before: before.clone(),
                        after: after.clone(),
                        diff: diff.clone(),
                        latex,
                        author: author.clone(),
                        date: date.to_string(),
                        place,
                        pair: None,
                    });
                };
            if pairs.get(&(pi, si)) == Some(&(usize::MAX, usize::MAX)) {
                insert_open = false;
                let place = sentence_hits(&hit, &paras, pi, si, &tex.tokens)
                    .map(|(a, b)| {
                        let file = tex.tokens[a].file;
                        let span = tex_sentence(
                            &tex.files[file].text,
                            tex.tokens[a].start,
                            tex.tokens[b].end,
                        );
                        place_at(file, span.0, span.1, Fit::Changed)
                    })
                    .or_else(|| near_place(Fit::Near));
                if let Some(place) = place {
                    push("changed", None, place, &mut out);
                }
                continue;
            }
            if let Some(&(pj, sj)) = pairs.get(&(pi, si)) {
                // Phrase déplacée : traitée une fois, à la première des deux.
                insert_open = false;
                if (pj, sj) < (pi, si) {
                    continue;
                }
                let deleted_first = s.words.iter().all(|w| w.new.trim().is_empty());
                let (d, i) = if deleted_first {
                    ((pi, si), (pj, sj))
                } else {
                    ((pj, sj), (pi, si))
                };
                let moved = &paras[i.0][i.1];
                // une phrase déplacée se montre telle quelle, sans rouge ni vert
                let (_, _, mafter) = diff_of(moved);
                let mdiff = vec![("", mafter.clone())];
                let words: Vec<String> = moved
                    .words
                    .iter()
                    .filter(|w| !w.new.is_empty() && !w.field)
                    .map(Word::new_norm)
                    .collect();
                let mk = |status: &'static str,
                          latex: Option<String>,
                          place: Place,
                          diff: Vec<(&'static str, String)>,
                          before: &str,
                          after: &str,
                          n: usize,
                          pair: Option<usize>| Edit {
                    n,
                    status,
                    before: before.to_string(),
                    after: after.to_string(),
                    diff,
                    latex,
                    author: author.clone(),
                    date: date.to_string(),
                    place,
                    pair,
                };
                let Some((first, last)) = find_run(&tex.tokens, &words) else {
                    if let Some(place) = near_place(Fit::Near) {
                        out.push(mk(
                            "changed",
                            None,
                            place,
                            mdiff,
                            &mafter,
                            &mafter,
                            out.len() + 1,
                            None,
                        ));
                    }
                    continue;
                };
                let file = tex.tokens[first].file;
                let text = &tex.files[file].text;
                let span = tex_sentence(text, tex.tokens[first].start, tex.tokens[last].end);
                let here = place_at(file, span.0, span.1, Fit::Exact);
                let tex_pred: Vec<String> = tex.tokens[..first]
                    .iter()
                    .rev()
                    .filter(|t| t.file == file && !t.word.starts_with("cite"))
                    .take(3)
                    .map(|t| t.word.clone())
                    .collect();
                let new_pred = pred_words(&paras, i, true);
                let old_pred = pred_words(&paras, d, false);
                let n = out.len() + 1;
                // Déjà déplacée dans le .tex ; sinon, Claude la déplace avec
                // ses voisines (un paragraphe réorganisé ne se rejoue pas
                // phrase par phrase sans risque).
                if new_pred != old_pred && tex_pred == new_pred {
                    out.push(mk("done", None, here, mdiff, &mafter, &mafter, n, None));
                } else {
                    out.push(mk("changed", None, here, mdiff, &mafter, &mafter, n, None));
                }
                continue;
            }
            let olds: Vec<String> = s
                .words
                .iter()
                .filter(|w| !w.old.is_empty() && !w.field)
                .map(Word::old_norm)
                .collect();
            let news: Vec<String> = s
                .words
                .iter()
                .filter(|w| !w.new.is_empty() && !w.field)
                .map(Word::new_norm)
                .collect();
            if olds.is_empty() && s.words.iter().all(|w| w.old.is_empty()) {
                // Phrase ajoutée : déjà dans le .tex, ou à poser après la
                // phrase retrouvée qui la précède (avant la suivante sinon).
                if let Some((first, last)) = find_run(&tex.tokens, &news) {
                    let file = tex.tokens[first].file;
                    let span = tex_sentence(
                        &tex.files[file].text,
                        tex.tokens[first].start,
                        tex.tokens[last].end,
                    );
                    push(
                        "done",
                        None,
                        place_at(file, span.0, span.1, Fit::Exact),
                        &mut out,
                    );
                    continue;
                }
                let latex = inserted_latex(s);
                // Deux phrases ajoutées qui se suivent : une seule retouche.
                if insert_open
                    && let Some(prev) = out.last_mut()
                    && prev.before.is_empty()
                    && prev.status != "note"
                {
                    prev.after = format!("{} {}", prev.after, after);
                    prev.diff.push(("+", format!(" {after}")));
                    prev.latex = match (prev.latex.take(), latex, prev.status) {
                        (Some(l), Some(n), "apply") => Some(join_insert(&l, &prev.place.text, &n)),
                        _ => None,
                    };
                    if prev.latex.is_none() {
                        prev.status = "changed";
                    }
                    continue;
                }
                insert_open = true;
                let placed = insert_at(pi, si);
                match (placed, latex) {
                    (Some((file, g, side)), Some(latex)) => {
                        let sep = &tex.files[file].text[g.0..g.1];
                        let latex = match side {
                            1 => format!("{}{latex}{sep}", unit(sep)),
                            -1 => format!("{sep}{latex}{}", unit(sep)),
                            _ => format!("\n\n{latex}{sep}"),
                        };
                        push(
                            "apply",
                            Some(latex),
                            place_at(file, g.0, g.1, Fit::Exact),
                            &mut out,
                        );
                    }
                    (Some((file, g, _)), None) => push(
                        "changed",
                        None,
                        place_at(file, g.0, g.1, Fit::Paragraph),
                        &mut out,
                    ),
                    (None, _) => {
                        if let Some(place) = near_place(Fit::Near) {
                            push("changed", None, place, &mut out);
                        }
                    }
                }
                continue;
            }
            insert_open = false;
            let mut hits: Vec<usize> = (0..s.words.len())
                .filter_map(|wi| hit.get(&(pi, si, wi)).copied())
                .collect();
            let found = cluster(&mut hits, &tex.tokens);
            let deleted = news.is_empty() && s.words.iter().all(|w| w.new.is_empty());
            match found {
                Some((first, last, _)) => {
                    let file = tex.tokens[first].file;
                    let text = &tex.files[file].text;
                    let span = tex_sentence(text, tex.tokens[first].start, tex.tokens[last].end);
                    let tex_words: Vec<String> = tex
                        .tokens
                        .iter()
                        .filter(|t| {
                            t.file == file
                                && t.start >= span.0
                                && t.end <= span.1
                                && !t.word.starts_with("cite")
                        })
                        .map(|t| t.word.clone())
                        .collect();
                    if deleted && tex_words == olds {
                        // Phrase retirée : avec le blanc qui la sépare de sa voisine.
                        let (a, b) = deleted_span(text, span);
                        push(
                            "apply",
                            Some(String::new()),
                            place_at(file, a, b, Fit::Exact),
                            &mut out,
                        );
                    } else if deleted {
                        push(
                            "changed",
                            None,
                            place_at(file, span.0, span.1, Fit::Changed),
                            &mut out,
                        );
                    } else if tex_words == olds
                        && let Some(latex) = rewrite(s, tex, file, span)
                    {
                        push(
                            "apply",
                            Some(latex),
                            place_at(file, span.0, span.1, Fit::Exact),
                            &mut out,
                        );
                    } else if tex_words == news {
                        push(
                            "done",
                            None,
                            place_at(file, span.0, span.1, Fit::Exact),
                            &mut out,
                        );
                    } else {
                        push(
                            "changed",
                            None,
                            place_at(file, span.0, span.1, Fit::Changed),
                            &mut out,
                        );
                    }
                }
                None => {
                    if let Some(place) = near_place(Fit::Near) {
                        push("changed", None, place, &mut out);
                    }
                }
            }
        }
    }
    out
}

/// Phrases qu'il a déplacées : une phrase retirée et la même ajoutée
/// ailleurs (au moins quatre mots, une seule fois chacune).
fn moves(paras: &[Vec<Sentence>]) -> HashMap<(usize, usize), (usize, usize)> {
    let mut gone: HashMap<String, Vec<(usize, usize)>> = HashMap::new();
    let mut added: HashMap<String, Vec<(usize, usize)>> = HashMap::new();
    for (p, ss) in paras.iter().enumerate() {
        for (k, s) in ss.iter().enumerate() {
            let olds: Vec<String> = s
                .words
                .iter()
                .filter(|w| !w.old.is_empty() && !w.field)
                .map(Word::old_norm)
                .collect();
            let news: Vec<String> = s
                .words
                .iter()
                .filter(|w| !w.new.is_empty() && !w.field)
                .map(Word::new_norm)
                .collect();
            if news.is_empty() && olds.len() >= 4 {
                gone.entry(olds.join(" ")).or_default().push((p, k));
            } else if olds.is_empty() && news.len() >= 4 {
                added.entry(news.join(" ")).or_default().push((p, k));
            }
        }
    }
    let mut out = HashMap::new();
    for (key, d) in gone {
        match (added.get(&key), d.as_slice()) {
            (Some(i), [d]) if i.len() == 1 => {
                out.insert(*d, i[0]);
                out.insert(i[0], *d);
            }
            // retirée deux fois, ajoutée deux fois : on ne sait pas laquelle
            // va où (la sienne est hors de ce document).
            (Some(i), d) => {
                for k in d.iter().chain(i) {
                    out.insert(*k, (usize::MAX, usize::MAX));
                }
            }
            _ => {}
        }
    }
    out
}

/// Les trois derniers mots avant une phrase, dans son texte (`new`) ou
/// dans celui qu'il a lu.
fn pred_words(paras: &[Vec<Sentence>], at: (usize, usize), new: bool) -> Vec<String> {
    let mut out = Vec::new();
    let mut p = at.0;
    let mut s = at.1;
    loop {
        if s == 0 {
            if p == 0 {
                return out;
            }
            p -= 1;
            s = paras[p].len();
            continue;
        }
        s -= 1;
        for w in paras[p][s].words.iter().rev() {
            let t = if new { &w.new } else { &w.old };
            if t.is_empty() || w.field {
                continue;
            }
            out.push(if new { w.new_norm() } else { w.old_norm() });
            if out.len() == 3 {
                return out;
            }
        }
    }
}

/// Premier et dernier mot du .tex d'une phrase du document qui n'a pas
/// bougé d'ici là (ses mots d'origine retrouvés).
fn sentence_hits(
    hit: &HashMap<(usize, usize, usize), usize>,
    paras: &[Vec<Sentence>],
    p: usize,
    s: usize,
    tokens: &[super::TexToken],
) -> Option<(usize, usize)> {
    let mut found: Vec<usize> = (0..paras[p][s].words.len())
        .filter_map(|w| hit.get(&(p, s, w)).copied())
        .collect();
    cluster(&mut found, tokens).map(|(a, b, _)| (a, b))
}

/// Ces mots, à la suite, quelque part dans le .tex (citations sautées).
fn find_run(tokens: &[super::TexToken], words: &[String]) -> Option<(usize, usize)> {
    if words.len() < 4 {
        return None;
    }
    let idx: Vec<usize> = (0..tokens.len())
        .filter(|&i| !tokens[i].word.starts_with("cite"))
        .collect();
    idx.windows(words.len())
        .find(|w| {
            w.iter()
                .zip(words)
                .all(|(&i, word)| tokens[i].word == *word)
                && tokens[w[0]].file == tokens[w[w.len() - 1]].file
        })
        .map(|w| (w[0], w[w.len() - 1]))
}

/// La phrase qu'il a ajoutée, en LaTeX ; `None` si elle porte une équation
/// ou une citation introuvable dans le .tex.
fn inserted_latex(s: &Sentence) -> Option<String> {
    let mut out = String::new();
    for w in &s.words {
        if w.new.is_empty() {
            continue;
        }
        if w.math {
            return None;
        }
        let word = if w.field {
            w.cite.clone()?
        } else {
            to_latex(&w.new)
        };
        out.push_str(&to_latex(&w.gap_new));
        out.push_str(&word);
    }
    out.push_str(&to_latex(s.end_new.trim()));
    let out = out.trim().to_string();
    (!out.is_empty()).then_some(out)
}

/// Le séparateur d'une phrase ajoutée : un saut de ligne si le .tex met une
/// phrase par ligne, une espace sinon.
fn unit(sep: &str) -> &'static str {
    if sep.contains('\n') { "\n" } else { " " }
}

/// Un ajout de plus derrière un ajout déjà posé sur le séparateur `sep`.
fn join_insert(latex: &str, sep: &str, next: &str) -> String {
    let tail = latex.len() - latex.trim_end().len();
    let (head, end) = latex.split_at(latex.len() - tail);
    let end = if end.is_empty() { sep } else { end };
    format!("{head}{}{next}{end}", unit(sep))
}

/// Blanc qui suit (ou précède) une phrase du .tex : là où une phrase ajoutée
/// se pose sans toucher aux phrases voisines.
fn gap_after(text: &str, end: usize) -> Option<(usize, usize)> {
    let n = text[end..].len() - text[end..].trim_start().len();
    (n > 0).then_some((end, end + n))
}

fn gap_before(text: &str, start: usize) -> Option<(usize, usize)> {
    let n = text[..start].len() - text[..start].trim_end().len();
    (n > 0).then_some((start - n, start))
}

/// Une phrase retirée avec le blanc qui la sépare de la précédente (de la
/// suivante en début de paragraphe), sans fondre deux paragraphes.
fn deleted_span(text: &str, span: (usize, usize)) -> (usize, usize) {
    if let Some(g) = gap_before(text, span.0)
        && !text[g.0..g.1].contains("\n\n")
        && g.0 > 0
    {
        return (g.0, span.1);
    }
    if let Some(g) = gap_after(text, span.1)
        && !text[g.0..g.1].contains("\n\n")
    {
        return (span.0, g.1);
    }
    span
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn end_of_sentence_needs_a_blank_after_the_point() {
        assert_eq!(split_end(". Here"), Some((".".into(), "Here".into())));
        assert!(split_end(".").is_none());
        assert_eq!(split_end("). "), Some((").".into(), String::new())));
        assert!(split_end(", ").is_none());
    }

    #[test]
    fn word_latex_keeps_dashes_and_escapes() {
        assert_eq!(
            to_latex("2002–2023 is 5% \u{a0}w.e."),
            "2002--2023 is 5\\% ~w.e."
        );
    }

    #[test]
    fn tex_sentence_stops_at_points_lines_and_comments() {
        let t = "First one.\nIn a model, we combine 22 years.\n% note\nNext. Again e.g. this.";
        let s = t.find("we").unwrap();
        assert_eq!(
            &t[tex_sentence(t, s, s + 2).0..tex_sentence(t, s, s + 2).1],
            "In a model, we combine 22 years."
        );
        let s = t.find("this").unwrap();
        assert_eq!(
            &t[tex_sentence(t, s, s + 4).0..tex_sentence(t, s, s + 4).1],
            "Again e.g. this."
        );
    }
}
