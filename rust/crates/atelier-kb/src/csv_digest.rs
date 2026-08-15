//! Port de `sidecar/csv_digest.mjs` (plan 065, C3) — miroir fonctionnel
//! (pas octet-pour-octet visé, mais vérifié par les fixtures de parité
//! `gallery/server/tests/kb_parity/fixtures/a-local-store.json`).
//! Aucun réseau/spawn — fonction pure.

use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

pub const CSV_FULL_MAX: usize = 40_000;
pub const CSV_HEAD_ROWS: usize = 15;
pub const CSV_TAIL_ROWS: usize = 5;
const CSV_SNIFF_LINES: usize = 20;
const CSV_EXAMPLES: usize = 3;

static NUM_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?$").unwrap());
static DATE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^\d{4}-\d{2}(?:-\d{2})?(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$").unwrap());
static BOOL_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^(true|false|vrai|faux|oui|non|yes|no)$").unwrap());

/// Longueur "JS" (UTF-16 code units) — les .length du mjs opèrent dessus.
pub fn js_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Séparateur le plus régulier sur les premières lignes non vides.
pub fn sniff_delimiter(raw: &str) -> char {
    let lines: Vec<&str> = raw
        .split('\n')
        .filter(|l| !l.trim().is_empty())
        .take(CSV_SNIFF_LINES)
        .collect();
    if lines.is_empty() {
        return ',';
    }
    let mut best_delim = ',';
    let mut best_score: i64 = -1;
    for delim in [',', ';', '\t', '|'] {
        let counts: Vec<usize> = lines.iter().map(|line| split_line(line, delim).len()).collect();
        let first = counts[0];
        if first < 2 {
            continue;
        }
        let constant = counts.iter().all(|&n| n == first);
        let score = if constant { 1000 + first as i64 } else { first as i64 };
        if score > best_score {
            best_score = score;
            best_delim = delim;
        }
    }
    best_delim
}

/// Découpe une ligne en respectant les guillemets doubles (`""` échappe `"`).
pub fn split_line(line: &str, delim: char) -> Vec<String> {
    let mut out = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if quoted {
            if c == '"' {
                if chars.get(i + 1) == Some(&'"') {
                    field.push('"');
                    i += 1;
                } else {
                    quoted = false;
                }
            } else {
                field.push(c);
            }
        } else if c == '"' {
            quoted = true;
        } else if c == delim {
            out.push(std::mem::take(&mut field));
        } else {
            field.push(c);
        }
        i += 1;
    }
    out.push(field);
    out.into_iter().map(|f| f.trim().to_string()).collect()
}

/// Lignes logiques : un champ entre guillemets peut contenir des retours.
pub fn parse_rows(raw: &str, delim: char) -> Vec<Vec<String>> {
    let text = raw.replace("\r\n", "\n").replace('\r', "\n");
    let mut rows = Vec::new();
    let mut line = String::new();
    let mut quotes = 0usize;
    for chunk in text.split('\n') {
        if line.is_empty() {
            line = chunk.to_string();
        } else {
            line.push('\n');
            line.push_str(chunk);
        }
        quotes += chunk.matches('"').count();
        if quotes % 2 == 0 {
            if !line.trim().is_empty() {
                rows.push(split_line(&line, delim));
            }
            line = String::new();
        }
    }
    if !line.trim().is_empty() {
        rows.push(split_line(&line, delim));
    }
    rows
}

enum ColKind {
    Empty,
    Number { min: f64, max: f64, mean: f64, filled: usize },
    Date { min: String, max: String, filled: usize },
    Bool { filled: usize },
    Text { filled: usize, distinct: usize, examples: Vec<String> },
}

fn classify(values: &[Option<&str>]) -> ColKind {
    let filled: Vec<&str> = values
        .iter()
        .filter_map(|v| v.and_then(|s| if s.is_empty() { None } else { Some(s) }))
        .collect();
    if filled.is_empty() {
        return ColKind::Empty;
    }
    let nums: Vec<&str> = filled.iter().copied().filter(|v| NUM_RE.is_match(v)).collect();
    if nums.len() == filled.len() {
        let parsed: Vec<f64> = nums
            .iter()
            .map(|v| v.replace(',', ".").parse::<f64>().unwrap_or(f64::NAN))
            .collect();
        let min = parsed.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = parsed.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let mean = parsed.iter().sum::<f64>() / parsed.len() as f64;
        return ColKind::Number { min, max, mean, filled: filled.len() };
    }
    if filled.iter().all(|v| DATE_RE.is_match(v)) {
        let mut sorted: Vec<&str> = filled.clone();
        sorted.sort();
        return ColKind::Date {
            min: sorted[0].to_string(),
            max: sorted[sorted.len() - 1].to_string(),
            filled: filled.len(),
        };
    }
    if filled.iter().all(|v| BOOL_RE.is_match(v)) {
        return ColKind::Bool { filled: filled.len() };
    }
    let mut seen = HashSet::new();
    let mut distinct_ordered = Vec::new();
    for v in &filled {
        if seen.insert(*v) {
            distinct_ordered.push(v.to_string());
        }
    }
    let distinct = distinct_ordered.len();
    distinct_ordered.truncate(CSV_EXAMPLES);
    ColKind::Text { filled: filled.len(), distinct, examples: distinct_ordered }
}

fn cell(v: Option<&str>) -> String {
    v.unwrap_or("").replace('|', "\\|")
}

/// Miroir de `round()` : entier -> forme entière, sinon arrondi 4 décimales
/// puis représentation la plus courte (comme `String(Number(n.toFixed(4)))`).
fn round(n: f64) -> String {
    if n.is_finite() && n.fract() == 0.0 {
        format!("{}", n as i64)
    } else {
        let rounded = (n * 10_000.0).round() / 10_000.0;
        // Rust f64 Display produit déjà la représentation la plus courte qui
        // round-trip (comme le moteur JS) pour les valeurs décimales usuelles.
        format!("{rounded}")
    }
}

fn md_table(header: &[String], rows: &[Vec<Option<&str>>]) -> String {
    let head = format!(
        "| {} |",
        header.iter().map(|h| cell(Some(h.as_str()))).collect::<Vec<_>>().join(" | ")
    );
    let rule = format!("| {} |", header.iter().map(|_| "---").collect::<Vec<_>>().join(" | "));
    let mut lines = vec![head, rule];
    for r in rows {
        let cells: Vec<String> = (0..header.len())
            .map(|i| cell(r.get(i).copied().flatten()))
            .collect();
        lines.push(format!("| {} |", cells.join(" | ")));
    }
    lines.join("\n")
}

/// Rend le texte à stocker pour un CSV. Petit fichier -> passthrough intégral.
/// Gros fichier -> profil par colonne + échantillon (tête/queue), jamais un
/// déversement silencieux tronqué.
pub fn csv_digest(raw: &str, name: &str, full_max: usize) -> Result<String, String> {
    let text = raw.trim();
    if text.is_empty() {
        return Err("Fichier CSV vide".to_string());
    }
    let delim = sniff_delimiter(text);
    let rows = parse_rows(text, delim);
    if rows.is_empty() {
        return Err("Fichier CSV vide".to_string());
    }
    let nom = match delim {
        ',' => "virgule",
        ';' => "point-virgule",
        '\t' => "tabulation",
        '|' => "barre",
        other => return Err(format!("séparateur inattendu: {other}")),
    };
    let header = rows[0].clone();
    let body = &rows[1..];
    let entete = format!(
        "{name} — {} ligne{} × {} colonne{} (séparateur : {nom})",
        body.len(),
        if body.len() > 1 { "s" } else { "" },
        header.len(),
        if header.len() > 1 { "s" } else { "" },
    );

    if js_len(text) <= full_max {
        return Ok(format!("{entete}\n\n```csv\n{text}\n```"));
    }

    let mut profil_owned: Vec<[String; 4]> = Vec::new();
    for (i, col) in header.iter().enumerate() {
        let values: Vec<Option<&str>> = body.iter().map(|r| r.get(i).map(|s| s.as_str())).collect();
        let info = classify(&values);
        let filled = match &info {
            ColKind::Empty => 0,
            ColKind::Number { filled, .. } => *filled,
            ColKind::Date { filled, .. } => *filled,
            ColKind::Bool { filled } => *filled,
            ColKind::Text { filled, .. } => *filled,
        };
        let trous = body.len().saturating_sub(filled);
        let (type_label, apercu) = match &info {
            ColKind::Empty => ("vide".to_string(), String::new()),
            ColKind::Number { min, max, mean, .. } => {
                ("nombre".to_string(), format!("{} → {} (moy. {})", round(*min), round(*max), round(*mean)))
            }
            ColKind::Date { min, max, .. } => ("date".to_string(), format!("{min} → {max}")),
            ColKind::Bool { .. } => ("booléen".to_string(), String::new()),
            ColKind::Text { distinct, examples, .. } => {
                ("texte".to_string(), format!("{distinct} valeurs · {}", examples.join(", ")))
            }
        };
        let remplissage = if trous > 0 { format!("{trous} vides") } else { "complète".to_string() };
        let label = if col.is_empty() { format!("(colonne {})", i + 1) } else { col.clone() };
        profil_owned.push([label, type_label, remplissage, apercu]);
    }
    let profil_header = ["colonne".to_string(), "type".to_string(), "remplissage".to_string(), "étendue / valeurs".to_string()];
    let profil_body: Vec<Vec<Option<&str>>> = profil_owned
        .iter()
        .map(|row| row.iter().map(|s| Some(s.as_str())).collect())
        .collect();

    let head_rows: Vec<Vec<Option<&str>>> = body
        .iter()
        .take(CSV_HEAD_ROWS)
        .map(|r| (0..header.len()).map(|i| r.get(i).map(|s| s.as_str())).collect())
        .collect();
    let tail_start = body.len().saturating_sub(CSV_TAIL_ROWS);
    let tail_rows: Vec<Vec<Option<&str>>> = body[tail_start..]
        .iter()
        .map(|r| (0..header.len()).map(|i| r.get(i).map(|s| s.as_str())).collect())
        .collect();

    let out = [
        entete.clone(),
        String::new(),
        "## Colonnes".to_string(),
        String::new(),
        md_table(&profil_header, &profil_body),
        String::new(),
        format!("## {CSV_HEAD_ROWS} premières lignes"),
        String::new(),
        md_table(&header, &head_rows),
        String::new(),
        format!("## {CSV_TAIL_ROWS} dernières lignes"),
        String::new(),
        md_table(&header, &tail_rows),
        String::new(),
        format!(
            "> Aperçu : {} des {} lignes sont montrées. Le fichier complet est sur disque, à l'origine de cette source.",
            CSV_HEAD_ROWS + CSV_TAIL_ROWS,
            body.len(),
        ),
    ]
    .join("\n");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_csv_est_un_passthrough_integral() {
        let raw = "year,value,flag\n2020,1.2,TRUE\n2021,1.5,FALSE\n2022,1.9,TRUE\n";
        let out = csv_digest(raw, "small.csv", CSV_FULL_MAX).unwrap();
        assert!(out.starts_with("small.csv — 3 lignes × 3 colonnes (séparateur : virgule)"));
        assert!(out.contains("```csv\nyear,value,flag\n2020,1.2,TRUE"));
        assert!(out.trim_end().ends_with("```"));
    }

    #[test]
    fn sniff_delimiter_choisit_le_separateur_regulier() {
        assert_eq!(sniff_delimiter("a,b,c\n1,2,3\n4,5,6"), ',');
        assert_eq!(sniff_delimiter("a;b;c\n1;2;3\n4;5;6"), ';');
        assert_eq!(sniff_delimiter("a\tb\tc\n1\t2\t3"), '\t');
    }

    #[test]
    fn split_line_gere_les_guillemets_doubles() {
        assert_eq!(split_line(r#"a,"b, c",d"#, ','), vec!["a", "b, c", "d"]);
        assert_eq!(split_line(r#""il dit ""bonjour""""#, ','), vec![r#"il dit "bonjour""#]);
    }

    #[test]
    fn fichier_vide_echoue() {
        assert_eq!(csv_digest("   \n  ", "x.csv", CSV_FULL_MAX).unwrap_err(), "Fichier CSV vide");
    }

    /// Capture réelle de `sidecar/csv_digest.mjs::csvDigest` sur
    /// `gallery/server/tests/kb_parity/inputs/large.csv` (node -e, 2026-08-15)
    /// — embarquée en dur pour que le test reste autonome (pas de dépendance
    /// à Node à l'exécution de `cargo test`). Vérifie notamment l'arrondi
    /// flottant (`moy. 2012`, `moy. 0.5034`) octet pour octet.
    const LARGE_CSV_EXPECTED: &str = "large.csv — 3000 lignes × 4 colonnes (séparateur : virgule)\n\n## Colonnes\n\n| colonne | type | remplissage | étendue / valeurs |\n| --- | --- | --- | --- |\n| year | nombre | complète | 2000 → 2024 (moy. 2012) |\n| site | texte | complète | 7 valeurs · site-0, site-1, site-2 |\n| albedo | nombre | complète | 0.1 → 0.9 (moy. 0.5034) |\n| flag | booléen | complète |  |\n\n## 15 premières lignes\n\n| year | site | albedo | flag |\n| --- | --- | --- | --- |\n| 2000 | site-0 | 0.612 | FALSE |\n| 2001 | site-1 | 0.12 | TRUE |\n| 2002 | site-2 | 0.32 | TRUE |\n| 2003 | site-3 | 0.279 | FALSE |\n| 2004 | site-4 | 0.689 | TRUE |\n| 2005 | site-5 | 0.641 | TRUE |\n| 2006 | site-6 | 0.814 | FALSE |\n| 2007 | site-0 | 0.17 | TRUE |\n| 2008 | site-1 | 0.438 | TRUE |\n| 2009 | site-2 | 0.124 | FALSE |\n| 2010 | site-3 | 0.275 | TRUE |\n| 2011 | site-4 | 0.504 | TRUE |\n| 2012 | site-5 | 0.121 | FALSE |\n| 2013 | site-6 | 0.259 | TRUE |\n| 2014 | site-0 | 0.62 | TRUE |\n\n## 5 dernières lignes\n\n| year | site | albedo | flag |\n| --- | --- | --- | --- |\n| 2020 | site-6 | 0.494 | TRUE |\n| 2021 | site-0 | 0.403 | TRUE |\n| 2022 | site-1 | 0.537 | FALSE |\n| 2023 | site-2 | 0.181 | TRUE |\n| 2024 | site-3 | 0.484 | TRUE |\n\n> Aperçu : 20 des 3000 lignes sont montrées. Le fichier complet est sur disque, à l'origine de cette source.";

    #[test]
    fn large_csv_matches_node_capture() {
        let raw = std::fs::read_to_string("../../../gallery/server/tests/kb_parity/inputs/large.csv").unwrap();
        let out = csv_digest(&raw, "large.csv", CSV_FULL_MAX).unwrap();
        assert_eq!(out, LARGE_CSV_EXPECTED);
        assert_eq!(js_len(&out), 1299);
    }
}
