//! Chiffres cités par l'agent, vérifiés dans la sortie de leur cellule.
//!
//! L'agent écrit « 1,51 écart type [cellule 29](atelier-cell:29) » ; le chat
//! demande si 1,51 figure bien dans ce que la cellule 29 a affiché. Le chiffre
//! cité compte comme trouvé quand une valeur de la sortie, arrondie au même
//! nombre de décimales, lui est égale (0,6 cite bien 0.6412). Un pourcentage
//! se compare aussi à la fraction (64 % ↔ 0.64).

use crate::journal::CellRecord;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimCheck {
    /// `found` (dans la sortie), `code` (seulement dans le code, un
    /// paramètre), `missing`, `unknown` (sortie coupée, chiffre illisible).
    pub status: &'static str,
    /// Valeur de la sortie la plus proche, telle qu'affichée, quand le
    /// chiffre manque.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closest: Option<String>,
}

struct Claim {
    value: f64,
    decimals: i32,
    percent: bool,
}

fn parse_claim(text: &str) -> Option<Claim> {
    let mut t: String = text
        .trim()
        .replace(['\u{2212}', '\u{2013}'], "-")
        .chars()
        .filter(|c| !matches!(c, ' ' | '\u{a0}' | '\u{202f}' | '\''))
        .collect();
    let percent = t.ends_with('%');
    if percent {
        t.pop();
    }
    // Virgule décimale française ; une virgule suivie de trois chiffres
    // exactement et sans autre séparateur reste ambiguë : on la lit en
    // décimale, comme l'écrit l'agent en français.
    let t = t.replace(',', ".");
    let value: f64 = t.parse().ok()?;
    let decimals = t.split_once('.').map(|(_, d)| d.len() as i32).unwrap_or(0);
    Some(Claim { value, decimals, percent })
}

/// Nombres d'un texte, avec leur forme affichée.
fn numbers(text: &str) -> Vec<(f64, String)> {
    let b = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let starts = b[i].is_ascii_digit()
            || (b[i] == b'-' && i + 1 < b.len() && (b[i + 1].is_ascii_digit() || b[i + 1] == b'.'))
            || (b[i] == b'.' && i + 1 < b.len() && b[i + 1].is_ascii_digit());
        // Un chiffre collé à une lettre (x2, v1) n'est pas une valeur.
        let glued = starts && i > 0 && (b[i - 1].is_ascii_alphabetic() || b[i - 1] == b'_');
        if glued {
            // Tout le mot est un identifiant (x2, region_01_02) : on le saute.
            i += 1;
            while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_') {
                i += 1;
            }
            continue;
        }
        if !starts {
            i += 1;
            continue;
        }
        let start = i;
        if b[i] == b'-' {
            i += 1;
        }
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i < b.len() && b[i] == b'.' && i + 1 < b.len() && b[i + 1].is_ascii_digit() {
            i += 1;
            while i < b.len() && b[i].is_ascii_digit() {
                i += 1;
            }
        }
        if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
            let mut j = i + 1;
            if j < b.len() && (b[j] == b'+' || b[j] == b'-') {
                j += 1;
            }
            if j < b.len() && b[j].is_ascii_digit() {
                while j < b.len() && b[j].is_ascii_digit() {
                    j += 1;
                }
                i = j;
            }
        }
        let shown = &text[start..i];
        if let Ok(v) = shown.parse::<f64>() {
            out.push((v, shown.to_string()));
        }
    }
    out
}

fn matches(claim: &Claim, x: f64) -> bool {
    let tolerance = 0.5 * 10f64.powi(-claim.decimals) + 1e-9 * claim.value.abs();
    (x - claim.value).abs() <= tolerance
        || (claim.percent && (x * 100.0 - claim.value).abs() <= tolerance)
}

/// Le chiffre `claim`, tel que l'agent l'a écrit, figure-t-il dans la
/// sortie de la cellule ?
pub fn check_claim(cell: &CellRecord, claim: &str) -> ClaimCheck {
    let Some(claim) = parse_claim(claim) else {
        return ClaimCheck { status: "unknown", closest: None };
    };
    let mut output = cell.stdout.clone();
    if let Some(result) = &cell.result {
        output.push('\n');
        output.push_str(result);
    }
    let found = numbers(&output);
    if found.iter().any(|(x, _)| matches(&claim, *x)) {
        return ClaimCheck { status: "found", closest: None };
    }
    if numbers(&cell.code).iter().any(|(x, _)| matches(&claim, *x)) {
        return ClaimCheck { status: "code", closest: None };
    }
    let clipped = cell.truncated > 0 || output.contains("octets coupés") || output.contains("caractères coupés");
    let scale = |x: f64| if claim.percent && x.abs() <= 1.0 { x * 100.0 } else { x };
    let closest = found
        .iter()
        .filter(|(x, _)| x.is_finite())
        .min_by(|a, b| {
            let da = (scale(a.0) - claim.value).abs();
            let db = (scale(b.0) - claim.value).abs();
            da.total_cmp(&db)
        })
        .filter(|(x, _)| {
            // Au-delà d'un facteur deux, ce n'est plus « la même » valeur.
            let x = scale(*x);
            claim.value != 0.0 && (x - claim.value).abs() <= claim.value.abs()
        })
        .map(|(_, shown)| shown.clone());
    ClaimCheck {
        status: if clipped { "unknown" } else { "missing" },
        closest,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cell(stdout: &str) -> CellRecord {
        CellRecord {
            stdout: stdout.into(),
            code: "s = 14\nprint(d.round(2))".into(),
            ..Default::default()
        }
    }

    #[test]
    fn chiffres_trouves_arrondis_et_pourcentages() {
        let c = cell("     GULKANA  01_02   0.62   17  22  -0.88   0.73\nr = 0.6412\n");
        assert_eq!(check_claim(&c, "−0,88").status, "found");
        assert_eq!(check_claim(&c, "0,73").status, "found");
        assert_eq!(check_claim(&c, "0,64").status, "found");
        assert_eq!(check_claim(&c, "0,6").status, "found");
        assert_eq!(check_claim(&c, "64 %").status, "found");
        assert_eq!(check_claim(&c, "17").status, "found");
        assert_eq!(check_claim(&c, "14").status, "code");
        assert_eq!(check_claim(&c, "pas un chiffre").status, "unknown");
    }

    #[test]
    fn chiffre_absent_avec_la_valeur_la_plus_proche() {
        let c = cell("r = 0.61\nn = 211\n");
        let r = check_claim(&c, "0,64");
        assert_eq!(r.status, "missing");
        assert_eq!(r.closest.as_deref(), Some("0.61"));
        // 01_02 n'est pas lu comme 1 puis 2 : le chiffre est collé au « _ ».
        let sans_code = CellRecord { stdout: "region 01_02".into(), ..Default::default() };
        assert_eq!(check_claim(&sans_code, "2").status, "missing");
    }

    #[test]
    fn sortie_coupee_rend_inconnu() {
        let mut c = cell("début\n… (5000 octets coupés) …\nfin");
        c.truncated = 5000;
        assert_eq!(check_claim(&c, "0,64").status, "unknown");
    }
}
