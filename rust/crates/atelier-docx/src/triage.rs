//! Tri des suivis par nature, pour la revue (chantier 4).
//!
//! Chaque suivi du modèle (ajout, retrait, remplacement = retrait puis ajout
//! adjacents du même auteur, mise en forme, marque de paragraphe,
//! déplacement, tableau) est rangé dans un groupe :
//!
//! - **fond** : des mots, donc du sens ;
//! - **nombres et renvois** : un chiffre, une unité, un signe, un renvoi de
//!   figure, de tableau, d'équation ou une citation change ; jamais mineur ;
//! - **ponctuation et orthographe** : seulement la ponctuation, la casse,
//!   une ou deux lettres d'un même mot, les apostrophes, guillemets, tirets ;
//! - **espaces et mise en forme** : espaces (insécables comprises), mise en
//!   forme pure, marques de paragraphe vides.
//!
//! Règles déterministes, sans modèle de langue. Dans le doute, le suivi
//! monte vers le groupe le plus sérieux : un mineur mal rangé s'accepterait
//! d'un geste sans être lu.

use crate::model::{DocModel, Para, Segment};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Class {
    Fond,
    Nombres,
    Ponctuation,
    Espaces,
}

impl Class {
    pub const ALL: [Class; 4] = [Class::Fond, Class::Nombres, Class::Ponctuation, Class::Espaces];

    pub fn key(self) -> &'static str {
        match self {
            Class::Fond => "fond",
            Class::Nombres => "nombres",
            Class::Ponctuation => "ponctuation",
            Class::Espaces => "espaces",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Class::Fond => "Fond",
            Class::Nombres => "Nombres et renvois",
            Class::Ponctuation => "Ponctuation et orthographe",
            Class::Espaces => "Espaces et mise en forme",
        }
    }

    /// Les deux groupes qu'« Accepter les mineurs » prend d'un geste.
    pub fn minor(self) -> bool {
        matches!(self, Class::Ponctuation | Class::Espaces)
    }
}

/// Un suivi à revoir : un identifiant, ou deux pour un remplacement.
#[derive(Serialize, Debug, Clone)]
pub struct Item {
    pub ids: Vec<u32>,
    /// remplacement, insertion, suppression, déplacement, mise en forme,
    /// paragraphe, tableau
    pub kind: &'static str,
    pub author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paragraph: Option<String>,
    /// Extrait avant → après, élargi au mot entier.
    pub before: String,
    pub after: String,
}

#[derive(Serialize, Debug)]
pub struct Group {
    pub key: &'static str,
    pub label: &'static str,
    pub minor: bool,
    pub items: Vec<Item>,
}

#[derive(Serialize, Debug)]
pub struct Triage {
    pub revision: String,
    /// Suivis en attente (identifiants), tous groupes confondus.
    pub total: usize,
    pub groups: Vec<Group>,
}

/// Objet ou champ pris dans un suivi.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Special {
    None,
    /// Citation, renvoi, équation : un nombre ou un renvoi.
    Ref,
    /// Note, figure, autre objet : du fond.
    Other,
}

struct Run {
    change: Option<u32>,
    removes: bool,
    moved: bool,
    text: String,
    special: Special,
}

fn special_of(s: &Segment) -> Special {
    match s.kind {
        "field" => Special::Ref,
        "object" if s.latex.is_some() || s.label.as_deref() == Some("équation") => Special::Ref,
        "object" => Special::Other,
        _ => Special::None,
    }
}

fn runs_of(p: &Para) -> Vec<Run> {
    let mut runs: Vec<Run> = Vec::new();
    for s in &p.segments {
        let change = if s.rev.is_some() { s.change } else { None };
        let removes = matches!(s.rev, Some("del" | "moveFrom"));
        let moved = matches!(s.rev, Some("moveFrom" | "moveTo"));
        let text = match s.kind {
            "tab" => "\t".to_string(),
            "break" if s.text.is_empty() => "\n".to_string(),
            _ => s.text.clone(),
        };
        let special = special_of(s);
        if let Some(last) = runs.last_mut()
            && last.change == change
            && last.removes == removes
        {
            last.text.push_str(&text);
            if special != Special::None && last.special != Special::Ref {
                last.special = special;
            }
            continue;
        }
        runs.push(Run { change, removes, moved, text, special });
    }
    runs
}

/// Range tous les suivis du modèle.
pub fn triage(model: &DocModel) -> Triage {
    let by_id: HashMap<u32, &crate::model::Change> = model.changes.iter().map(|c| (c.id, c)).collect();
    let mut placed: Vec<(Class, Item)> = Vec::new();
    // id → rang dans `placed` : un suivi coupé en morceaux reste une fiche.
    let mut seen: HashMap<u32, usize> = HashMap::new();
    let paras: Vec<&Para> = model.all_paragraphs().collect();

    for p in &paras {
        let runs = runs_of(p);
        let cur: Vec<&str> = runs.iter().map(|r| if r.removes { "" } else { r.text.as_str() }).collect();
        let mut i = 0;
        while i < runs.len() {
            let Some(id) = runs[i].change else {
                i += 1;
                continue;
            };
            let author = by_id.get(&id).map(|c| c.author.clone()).unwrap_or_default();
            // Remplacement : retrait et ajout côte à côte, du même auteur.
            let pair = runs.get(i + 1).filter(|n| {
                n.change.is_some_and(|nid| nid != id && !seen.contains_key(&nid))
                    && n.removes != runs[i].removes
                    && !n.moved
                    && !runs[i].moved
                    && by_id.get(&n.change.unwrap()).map(|c| c.author.as_str()) == Some(author.as_str())
            });
            let end = if pair.is_some() { i + 1 } else { i };
            let ids: Vec<u32> = runs[i..=end].iter().filter_map(|r| r.change).collect();
            let old: String = runs[i..=end].iter().filter(|r| r.removes).map(|r| r.text.as_str()).collect();
            let new: String = runs[i..=end].iter().filter(|r| !r.removes).map(|r| r.text.as_str()).collect();
            if let Some(&k) = seen.get(&id) {
                // Suite d'un suivi déjà rencontré (coupé par un autre).
                let item = &mut placed[k].1;
                item.before.push_str(&old);
                item.after.push_str(&new);
                i = end + 1;
                continue;
            }
            let prefix: String = cur[..i].concat();
            let suffix: String = cur[end + 1..].concat();
            let specials: Vec<Special> = runs[i..=end].iter().map(|r| r.special).collect();
            let moved = runs[i].moved;
            let class = if specials.contains(&Special::Ref) {
                Class::Nombres
            } else if specials.contains(&Special::Other) || moved {
                // Note, figure ou déplacement : du fond, sauf nombre touché.
                match classify(&prefix, &old, &new, &suffix) {
                    Class::Nombres if !moved => Class::Nombres,
                    _ => Class::Fond,
                }
            } else {
                classify(&prefix, &old, &new, &suffix)
            };
            let (before, after) = expand(&prefix, &old, &new, &suffix);
            let kind = if moved {
                "déplacement"
            } else if ids.len() == 2 {
                "remplacement"
            } else if runs[i].removes {
                "suppression"
            } else {
                "insertion"
            };
            for id in &ids {
                seen.insert(*id, placed.len());
            }
            placed.push((class, Item { ids, kind, author, paragraph: Some(p.id.clone()), before: clip(&before), after: clip(&after) }));
            i = end + 1;
        }
    }

    // Suivis sans texte dans la page : mise en forme, marques, tableaux.
    let para_of: HashMap<&str, &Para> = paras.iter().map(|p| (p.id.as_str(), *p)).collect();
    for c in &model.changes {
        if seen.contains_key(&c.id) {
            continue;
        }
        let para = c.paragraph.as_deref().and_then(|id| para_of.get(id));
        let (class, kind, before, after) = match c.kind.as_str() {
            "format" => {
                let t = if c.text == "mise en forme" { String::new() } else { c.text.clone() };
                // Exposant ou indice sur un chiffre : 102 devient 10².
                let class = if t.chars().any(|ch| ch.is_numeric()) { Class::Nombres } else { Class::Espaces };
                (class, "mise en forme", t.clone(), t)
            }
            "paragraph-ins" | "paragraph-del" => {
                let empty = para.is_none_or(|p| p.text.chars().all(is_space));
                let (b, a) = if c.kind == "paragraph-ins" { ("", "¶") } else { ("¶", "") };
                (if empty { Class::Espaces } else { Class::Fond }, "paragraphe", b.to_string(), a.to_string())
            }
            "row-ins" | "row-del" | "cell" => (Class::Fond, "tableau", String::new(), String::new()),
            "del" | "moveFrom" => (classify("", &c.text, "", ""), if c.kind == "del" { "suppression" } else { "déplacement" }, c.text.clone(), String::new()),
            _ => (classify("", "", &c.text, ""), if c.kind == "moveTo" { "déplacement" } else { "insertion" }, String::new(), c.text.clone()),
        };
        let class = if kind == "déplacement" { Class::Fond } else { class };
        seen.insert(c.id, placed.len());
        placed.push((class, Item { ids: vec![c.id], kind, author: c.author.clone(), paragraph: c.paragraph.clone(), before: clip(&before), after: clip(&after) }));
    }

    let total = placed.iter().map(|(_, it)| it.ids.len()).sum();
    let groups = Class::ALL
        .iter()
        .map(|&class| Group {
            key: class.key(),
            label: class.label(),
            minor: class.minor(),
            items: placed.iter().filter(|(c, _)| *c == class).map(|(_, it)| it.clone()).collect(),
        })
        .collect();
    Triage { revision: model.revision.clone(), total, groups }
}

fn clip(s: &str) -> String {
    const MAX: usize = 160;
    if s.chars().count() <= MAX { s.to_string() } else { format!("{}…", s.chars().take(MAX).collect::<String>()) }
}

// ------------------------------------------------------------ classement

/// Espaces de toute sorte : insécables, fines, sans chasse, tabulations.
pub(crate) fn is_space(c: char) -> bool {
    c.is_whitespace() || matches!(c, '\u{200B}' | '\u{2060}' | '\u{FEFF}')
}

/// Signes et symboles de nombres et de formules : jamais mineurs.
fn is_symbol(c: char) -> bool {
    matches!(
        c,
        '+' | '−' | '±' | '∓' | '×' | '÷' | '=' | '≠' | '<' | '>' | '≤' | '≥' | '≈' | '≃' | '≅' | '∼' | '~' | '%' | '‰' | '°' | '′' | '″' | '^' | '∝' | '∞' | '√'
            | '∑' | '∫' | '∂' | '∆' | '∇' | '⁻' | '⁺' | '·' | '⋅' | 'µ' | '§' | '$' | '€' | '£' | '#'
    ) || ('\u{0391}'..='\u{03C9}').contains(&c)
        || ('\u{2070}'..='\u{209F}').contains(&c)
        || ('\u{2200}'..='\u{22FF}').contains(&c)
}

/// Ponctuation, apostrophes, guillemets, tirets.
fn is_punct(c: char) -> bool {
    (c.is_ascii_punctuation() && !is_symbol(c))
        || matches!(
            c,
            '‘' | '’' | '‚' | '‛' | '“' | '”' | '„' | '‟' | '«' | '»' | '‹' | '›' | '–' | '—' | '‒' | '―' | '‐' | '‑' | '…' | '•' | '¿' | '¡' | '¶'
        )
}

fn is_word(c: char) -> bool {
    c.is_alphanumeric()
}

/// Le passage changé, élargi aux lettres collées de part et d'autre quand
/// le changement touche un mot (« decline » + « s » → « declines »).
pub fn expand(prefix: &str, old: &str, new: &str, suffix: &str) -> (String, String) {
    let starts_word = old.chars().next().is_some_and(is_word) || new.chars().next().is_some_and(is_word);
    let ends_word = old.chars().last().is_some_and(is_word) || new.chars().last().is_some_and(is_word);
    let left: String = if starts_word {
        let rev: Vec<char> = prefix.chars().rev().take_while(|c| is_word(*c)).collect();
        rev.into_iter().rev().collect()
    } else {
        String::new()
    };
    let right: String = if ends_word { suffix.chars().take_while(|c| is_word(*c)).collect() } else { String::new() };
    (format!("{left}{old}{right}"), format!("{left}{new}{right}"))
}

/// Range un changement de texte : `old` remplacé par `new` entre `prefix`
/// et `suffix` (texte courant du paragraphe autour).
pub fn classify(prefix: &str, old: &str, new: &str, suffix: &str) -> Class {
    if old == new {
        return Class::Espaces;
    }
    let pre: Vec<char> = prefix.chars().collect();
    let tail: String = pre[pre.len().saturating_sub(48)..].iter().collect();
    let head: String = suffix.chars().take(48).collect();

    // 1. Nombres, unités, signes, renvois, citations.
    if numbers(&format!("{tail}{old}{head}")) != numbers(&format!("{tail}{new}{head}")) {
        return Class::Nombres;
    }
    let (ow, nw) = expand(prefix, old, new, suffix);
    if ow.chars().chain(nw.chars()).any(|c| c.is_numeric()) {
        return Class::Nombres;
    }
    if old.chars().chain(new.chars()).any(is_symbol) {
        return Class::Nombres;
    }
    let (owords, nwords) = (words(&ow), words(&nw));
    if number_words(&owords) != number_words(&nwords) {
        return Class::Nombres;
    }
    if owords.iter().chain(&nwords).any(|w| is_ref_word(w)) || has_et_al(&owords) || has_et_al(&nwords) {
        return Class::Nombres;
    }
    if citation_context(&tail, &ow, &nw, &head) {
        return Class::Nombres;
    }

    // 2. Espaces seuls.
    let without = |s: &str, f: fn(char) -> bool| s.chars().filter(|c| !f(*c)).collect::<String>();
    if without(&ow, is_space) == without(&nw, is_space) {
        return Class::Espaces;
    }
    // 3. Ponctuation seule (apostrophes, guillemets, tirets compris).
    let core = |s: &str| s.chars().filter(|c| !is_space(*c) && !is_punct(*c)).collect::<String>();
    if core(&ow) == core(&nw) {
        return Class::Ponctuation;
    }
    // 4. Orthographe : casse, accents, une ou deux lettres d'un même mot.
    if spelling_only(&owords, &nwords) {
        return Class::Ponctuation;
    }
    Class::Fond
}

fn words(s: &str) -> Vec<String> {
    s.split(|c: char| !is_word(c)).filter(|w| !w.is_empty()).map(str::to_string).collect()
}

const UNITS: &[&str] = &[
    "m", "km", "cm", "mm", "µm", "um", "nm", "m2", "m²", "km2", "km²", "m3", "m³", "km3", "km³", "ha", "kg", "g", "mg", "t", "gt", "mt", "kt", "pg", "yr", "yrs",
    "a", "ka", "ma", "ga", "s", "ms", "h", "d", "min", "k", "°c", "°f", "c", "w", "kw", "mw", "gw", "j", "kj", "mj", "gj", "pa", "hpa", "kpa", "mpa", "bar", "mbar", "ppm",
    "ppb", "ppt", "mol", "l", "ml", "hz", "khz", "mhz", "ghz", "w.e.", "w.e", "we", "m.w.e.", "eq", "days", "day", "years", "year", "months", "month", "hours",
    "hour", "ans", "an", "jours", "jour", "mois", "heures", "heure", "nm.", "sr", "px", "pixels", "mm/d", "mm/yr", "m/s",
];

fn is_digitish(c: char) -> bool {
    c.is_numeric()
}

/// Nombres du texte, avec leur signe, leurs séparateurs et l'unité qui les
/// suit, espaces retirées (« 2 400 m » et « 2 400 m » sont le même).
fn numbers(s: &str) -> Vec<String> {
    let chars: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !is_digitish(chars[i]) {
            i += 1;
            continue;
        }
        let mut tok = String::new();
        // Signe devant : début, espace ou parenthèse avant lui.
        if i > 0 && matches!(chars[i - 1], '-' | '−' | '–' | '+' | '±' | '‑' | '<' | '>' | '≤' | '≥' | '~' | '≈') {
            let lone = i < 2 || is_space(chars[i - 2]) || matches!(chars[i - 2], '(' | '[' | '=' | ',' | ';');
            if lone {
                tok.push(chars[i - 1]);
            }
        }
        let mut j = i;
        loop {
            while j < chars.len() && is_digitish(chars[j]) {
                tok.push(chars[j]);
                j += 1;
            }
            // Séparateur entre deux chiffres : décimale, milliers, intervalle.
            let mut k = j;
            let mut sep = String::new();
            while k < chars.len() && (matches!(chars[k], '.' | ',' | '-' | '–' | '−' | '‑' | '/' | ':' | '×' | '^') || is_space(chars[k])) && sep.chars().count() < 3 {
                sep.push(chars[k]);
                k += 1;
            }
            let space_only = !sep.is_empty() && sep.chars().all(is_space);
            if k < chars.len() && is_digitish(chars[k]) && !sep.is_empty() && (!space_only || digit_run(&chars, k) == 3) {
                tok.push_str(&sep);
                j = k;
                continue;
            }
            break;
        }
        // Lettre collée (3a, 2020s), puis unité, pourcentage, degré.
        while j < chars.len() && (chars[j].is_alphabetic() || matches!(chars[j], '%' | '‰' | '°' | '′' | '″' | '²' | '³')) {
            tok.push(chars[j]);
            j += 1;
        }
        let mut k = j;
        while k < chars.len() && is_space(chars[k]) {
            k += 1;
        }
        let unit: String = chars[k..].iter().take_while(|c| c.is_alphanumeric() || matches!(c, '°' | '.' | '/' | '²' | '³' | '⁻' | 'µ')).collect();
        let unit_clean = unit.trim_end_matches(['.', ',']).to_lowercase();
        if !unit.is_empty() && (UNITS.contains(&unit_clean.as_str()) || UNITS.contains(&unit.to_lowercase().as_str())) {
            tok.push(' ');
            tok.push_str(&unit_clean);
            j = k + unit.chars().count();
        }
        out.push(tok.chars().filter(|c| !is_space(*c)).collect::<String>().replace(['−', '–', '‑'], "−"));
        i = j.max(i + 1);
    }
    out
}

fn digit_run(chars: &[char], at: usize) -> usize {
    chars[at..].iter().take_while(|c| c.is_ascii_digit()).count()
}

/// Mots-nombres (anglais et français), ramenés à leur valeur.
fn number_words(ws: &[String]) -> Vec<&'static str> {
    const TABLE: &[(&str, &str)] = &[
        ("zero", "0"), ("zéro", "0"), ("one", "1"), ("un", "1"), ("une", "1"), ("two", "2"), ("deux", "2"), ("three", "3"), ("trois", "3"), ("four", "4"),
        ("quatre", "4"), ("five", "5"), ("cinq", "5"), ("six", "6"), ("seven", "7"), ("sept", "7"), ("eight", "8"), ("huit", "8"), ("nine", "9"), ("neuf", "9"),
        ("ten", "10"), ("dix", "10"), ("eleven", "11"), ("onze", "11"), ("twelve", "12"), ("douze", "12"), ("thirteen", "13"), ("treize", "13"),
        ("fourteen", "14"), ("quatorze", "14"), ("fifteen", "15"), ("quinze", "15"), ("sixteen", "16"), ("seize", "16"), ("seventeen", "17"),
        ("eighteen", "18"), ("nineteen", "19"), ("twenty", "20"), ("vingt", "20"), ("thirty", "30"), ("trente", "30"), ("forty", "40"), ("quarante", "40"),
        ("fifty", "50"), ("cinquante", "50"), ("sixty", "60"), ("soixante", "60"), ("seventy", "70"), ("eighty", "80"), ("ninety", "90"), ("hundred", "100"),
        ("hundreds", "100"), ("cent", "100"), ("cents", "100"), ("thousand", "1000"), ("thousands", "1000"), ("mille", "1000"), ("million", "1e6"),
        ("millions", "1e6"), ("billion", "1e9"), ("billions", "1e9"), ("milliard", "1e9"), ("milliards", "1e9"), ("half", "1/2"), ("moitié", "1/2"),
        ("demi", "1/2"), ("quarter", "1/4"), ("quart", "1/4"), ("third", "3e"), ("tiers", "1/3"), ("twice", "x2"), ("double", "x2"), ("triple", "x3"),
        ("dozen", "12"), ("dozens", "12"), ("douzaine", "12"), ("dizaine", "10"), ("dizaines", "10"), ("centaine", "100"), ("centaines", "100"),
        ("first", "1e"), ("premier", "1e"), ("première", "1e"), ("premiers", "1e"), ("premières", "1e"), ("second", "2e"), ("seconde", "2e"),
        ("deuxième", "2e"), ("fourth", "4e"), ("troisième", "3e"), ("quatrième", "4e"), ("fifth", "5e"), ("cinquième", "5e"), ("last", "der"),
        ("dernier", "der"), ("dernière", "der"), ("single", "1"), ("both", "2"), ("none", "0"), ("aucun", "0"), ("aucune", "0"),
    ];
    let mut out: Vec<&'static str> = ws.iter().filter_map(|w| {
        let l = w.to_lowercase();
        TABLE.iter().find(|(k, _)| *k == l).map(|(_, v)| *v)
    }).collect();
    out.sort_unstable();
    out
}

/// Renvois : figure, tableau, équation, section, annexe.
fn is_ref_word(w: &str) -> bool {
    const CAP: &[&str] = &[
        "Fig", "Figs", "Figure", "Figures", "Table", "Tables", "Tab", "Tableau", "Tableaux", "Eq", "Eqs", "Equation", "Equations", "Équation", "Équations",
        "Éq", "Section", "Sections", "Sect", "Sec", "Appendix", "Annexe", "Supplement", "Chapter", "Chapitre", "Panel", "Panneau",
    ];
    const LOW: &[&str] = &["fig", "figs", "eq", "eqs", "éq", "tab", "sect", "cf"];
    CAP.contains(&w) || LOW.contains(&w)
}

fn has_et_al(ws: &[String]) -> bool {
    ws.windows(2).any(|p| p[0].eq_ignore_ascii_case("et") && p[1].eq_ignore_ascii_case("al")) || ws.iter().any(|w| w == "al" || w == "al.")
}

/// Nom d'auteur d'une citation en clair : « Williamson et al. (2020) »,
/// « (Hall and Riggs, 2007) ».
fn citation_context(tail: &str, ow: &str, nw: &str, head: &str) -> bool {
    let capital = |s: &str| s.trim_start().chars().next().is_some_and(|c| c.is_uppercase());
    if !(capital(ow) || capital(nw)) {
        return false;
    }
    let h = head.trim_start_matches(|c: char| is_space(c) || c == ',');
    let after_name = h.starts_with("et al") || h.starts_with("and ") || h.starts_with("& ") || h.starts_with("et ") && h[3..].chars().next().is_some_and(char::is_uppercase)
        || h.starts_with('(') && h[1..].chars().take(4).all(|c| c.is_ascii_digit()) && h.len() > 4
        || h.chars().take(4).all(|c| c.is_ascii_digit()) && h.chars().take(4).count() == 4;
    // Entre parenthèses avec une année : « (Hall and Riggs, 2007) ».
    let open = tail.rfind('(').is_some_and(|o| tail.rfind(')').is_none_or(|c| c < o));
    let year_inside = head.split(')').next().is_some_and(|s| {
        let c: Vec<char> = s.chars().collect();
        c.windows(4).any(|w| w.iter().all(|d| d.is_ascii_digit()))
    }) && head.contains(')');
    after_name || (open && year_inside)
}

/// Lettres accentuées ramenées à leur base (é → e, ç → c).
fn base(c: char) -> char {
    match c {
        'à' | 'â' | 'ä' | 'á' | 'ã' | 'å' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'î' | 'ï' | 'í' | 'ì' => 'i',
        'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
        'û' | 'ü' | 'ù' | 'ú' => 'u',
        'ç' => 'c',
        'ñ' => 'n',
        'ÿ' => 'y',
        c => c,
    }
}

fn fold(w: &str) -> String {
    w.chars().flat_map(char::to_lowercase).map(base).collect()
}

/// Les mots ne diffèrent que par la casse, les accents, ou une ou deux
/// lettres d'un seul mot (coquille, accord), sans en inverser le sens.
fn spelling_only(a: &[String], b: &[String]) -> bool {
    if a.len() != b.len() || a.is_empty() {
        return false;
    }
    let mut letters = 0;
    for (x, y) in a.iter().zip(b) {
        if x == y || fold(x) == fold(y) {
            continue;
        }
        letters += 1;
        if letters > 1 || !small_typo(&fold(x), &fold(y)) {
            return false;
        }
    }
    true
}

/// Préfixes et suffixes qui changent le sens : « in-significant »,
/// « inter/intra », « hyper/hypo », « care-ful/care-less ».
fn meaning_affix(a: &str, b: &str) -> bool {
    const NEG: &[&str] = &["un", "in", "im", "il", "ir", "non", "dis", "de", "a", "anti", "mis", "ab"];
    const PAIRS: &[(&str, &str)] = &[
        ("inter", "intra"), ("hyper", "hypo"), ("over", "under"), ("pre", "post"), ("sub", "super"), ("micro", "macro"), ("in", "ex"), ("im", "ex"),
        ("up", "down"), ("min", "max"), ("endo", "exo"), ("homo", "hetero"), ("sur", "sous"), ("pré", "post"),
    ];
    const SUF: &[(&str, &str)] = &[("ful", "less"), ("able", "less"), ("est", "er")];
    let (s, l) = if a.chars().count() <= b.chars().count() { (a, b) } else { (b, a) };
    if NEG.iter().any(|p| l.strip_prefix(p) == Some(s)) {
        return true;
    }
    let pair = |x: &str, y: &str| PAIRS.iter().any(|(p, q)| (x.strip_prefix(p).is_some_and(|r| y.strip_prefix(q) == Some(r))) || (x.strip_prefix(q).is_some_and(|r| y.strip_prefix(p) == Some(r))));
    let suf = |x: &str, y: &str| SUF.iter().any(|(p, q)| (x.strip_suffix(p).is_some_and(|r| y.strip_suffix(q) == Some(r))) || (x.strip_suffix(q).is_some_and(|r| y.strip_suffix(p) == Some(r))));
    pair(a, b) || suf(a, b)
}

/// Une ou deux lettres d'un même mot assez long, le début du mot gardé.
fn small_typo(a: &str, b: &str) -> bool {
    let (ac, bc): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let short = ac.len().min(bc.len());
    if short < 4 || meaning_affix(a, b) {
        return false;
    }
    let common = ac.iter().zip(&bc).take_while(|(x, y)| x == y).count();
    if common < 2 {
        return false;
    }
    let max = if short >= 7 { 2 } else { 1 };
    edit_distance(&ac, &bc) <= max
}

/// Distance d'édition avec transposition (Damerau, version restreinte).
fn edit_distance(a: &[char], b: &[char]) -> usize {
    let (n, m) = (a.len(), b.len());
    let mut d = vec![vec![0usize; m + 1]; n + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for j in 0..=m {
        d[0][j] = j;
    }
    for i in 1..=n {
        for j in 1..=m {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[n][m]
}

#[cfg(test)]
mod tests {
    use super::*;
    use Class::*;

    /// `avant[ancien→nouveau]après`
    fn c(s: &str) -> Class {
        let (pre, rest) = s.split_once('[').unwrap();
        let (mid, post) = rest.split_once(']').unwrap();
        let (old, new) = mid.split_once('→').unwrap();
        classify(pre, old, new, post)
    }

    #[test]
    fn fond_anglais() {
        assert_eq!(c("declined on [almost all→most] glaciers"), Fond);
        assert_eq!(c("where [smoke from wildfires deposited→wildfire smoke deposited] light"), Fond);
        assert_eq!(c("that [late-lying→] snow"), Fond);
        assert_eq!(c("snow [→that persists late into summer ]buffers"), Fond);
        assert_eq!(c("dependence [is consistent with→matches] the"), Fond);
        assert_eq!(c("Albedo [increased→decreased] sharply"), Fond);
        assert_eq!(c("the [maximum→minimum] value"), Fond);
        assert_eq!(c("a [significant→insignificant] trend"), Fond);
        assert_eq!(c("it is [possible→impossible] here"), Fond);
        assert_eq!(c("[interannual→intraannual] variability"), Fond);
        assert_eq!(c("this [can→can't] be"), Fond);
        assert_eq!(c("glaciers [in→on] the range"), Fond);
        assert_eq!(c("it does [now→not] hold"), Fond);
        assert_eq!(c("the [→ entire] basin"), Fond);
        assert_eq!(c("we [affect→effect] change"), Fond);
    }

    #[test]
    fn fond_francais() {
        assert_eq!(c("L'albédo [a diminué→s'est effondré] sur"), Fond);
        assert_eq!(c("[Ensuite, on→On] ne conserve"), Fond);
        assert_eq!(c("les glaciers [le→la] plus"), Fond);
        assert_eq!(c("une hausse [hyperbolique→hypobolique] de"), Fond);
        assert_eq!(c("un effet [significatif→non significatif] sur"), Fond);
    }

    #[test]
    fn nombres_et_renvois_jamais_mineurs() {
        assert_eq!(c("impurities in [5→five] of the"), Nombres);
        assert_eq!(c("in [five→six] of the"), Nombres);
        assert_eq!(c("glaciers above [2400→2500] m"), Nombres);
        assert_eq!(c("above 2 400 [m→km] darkened"), Nombres);
        assert_eq!(c("a slope of [-→]0.5 per"), Nombres);
        assert_eq!(c("a slope of [-→−]0.5 per"), Nombres);
        assert_eq!(c("from 2002[-→–]2023, the"), Nombres);
        assert_eq!(c("a value of 0[.→,]5 was"), Nombres);
        assert_eq!(c("see Fig. 3[a→b] for"), Nombres);
        assert_eq!(c("see [Fig.→Figure] 3"), Nombres);
        assert_eq!(c("shown in [Table→Figure] 2"), Nombres);
        assert_eq!(c("given by [Eq.→Eq] (4)"), Nombres);
        assert_eq!(c("identified by [Williamson→Williams] et al. (2020)"), Nombres);
        assert_eq!(c("as in (Hall and [Riggs→Rigg], 2007)"), Nombres);
        assert_eq!(c("Williamson [→et al. ](2020)"), Nombres);
        assert_eq!(c("explained [31→35] % of"), Nombres);
        assert_eq!(c("explained 31 [%→‰] of"), Nombres);
        assert_eq!(c("where [α→β] is"), Nombres);
        assert_eq!(c("if x [<→≤] y"), Nombres);
        assert_eq!(c("in the [2020→2020s] summers"), Nombres);
        assert_eq!(c("dans [cinq→quatre] des sept"), Nombres);
        assert_eq!(c("voir le [tableau→Tableau] 2"), Nombres);
        assert_eq!(c("la [moitié→totalité] des"), Nombres);
        assert_eq!(c("[twice→three times] as"), Nombres);
    }

    #[test]
    fn ponctuation_et_orthographe() {
        assert_eq!(c("in the Coast Range[→,] where"), Ponctuation);
        assert_eq!(c("uniform[→:] glaciers"), Ponctuation);
        assert_eq!(c("Williamson et al. (2020)[.→;] it also"), Ponctuation);
        assert_eq!(c("in 2020[→,] the"), Ponctuation);
        assert_eq!(c("largest decline[s→] in"), Ponctuation);
        assert_eq!(c("the [Arctic→arctic] basin"), Ponctuation);
        assert_eq!(c("the [glacier's→glacier’s] tongue"), Ponctuation);
        assert_eq!(c("a [\"dark\"→“dark”] surface"), Ponctuation);
        assert_eq!(c("[late lying→late-lying] snow"), Ponctuation);
        assert_eq!(c("the [seperate→separate] runs"), Ponctuation);
        assert_eq!(c("we [recieve→receive] data"), Ponctuation);
        assert_eq!(c("the [modelling→modeling] chain"), Ponctuation);
        assert_eq!(c("this [colour→color] map"), Ponctuation);
        assert_eq!(c("the effect[ - → — ]and"), Ponctuation);
        assert_eq!(c("its [its→it's] own"), Ponctuation);
        assert_eq!(c("le [role→rôle] des"), Ponctuation);
        assert_eq!(c("[a→à] partir"), Ponctuation);
        assert_eq!(c("les surfaces [modélisé→modélisées] par"), Ponctuation);
        assert_eq!(c("les glaciers[→,] dont"), Ponctuation);
        assert_eq!(c("l['→’]albédo"), Ponctuation);
        assert_eq!(c("une [« sombre »→“sombre”] surface"), Ponctuation);
    }

    #[test]
    fn espaces() {
        assert_eq!(c("above 2[ →]400 m"), Espaces);
        assert_eq!(c("above 2[ →\u{202F}]400 m"), Espaces);
        assert_eq!(c("le [→\u{00A0}]: deux"), Espaces);
        assert_eq!(c("the  [ →]glacier"), Espaces);
        assert_eq!(c("glaciers[→ ]darkened"), Espaces);
        assert_eq!(c("same[x→x]text"), Espaces);
    }

    #[test]
    fn un_espace_dans_un_nombre_change_le_nombre() {
        // « 1 5 » n'est pas « 15 » : seul un groupe de trois chiffres est un
        // séparateur de milliers.
        assert_eq!(c("values of 1[ →]5 were"), Nombres);
    }

    #[test]
    fn extrait_elargi_au_mot() {
        assert_eq!(expand("largest decline", "s", "", " in"), ("declines".into(), "decline".into()));
        assert_eq!(expand("Range", "", ",", " where"), ("".into(), ",".into()));
        assert_eq!(expand("on ", "almost all", "most", " glaciers"), ("almost all".into(), "most".into()));
    }
}
