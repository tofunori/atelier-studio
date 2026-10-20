//! Lignes changées entre une cellule et sa version modifiée à la main.

use serde::Serialize;

/// Au-delà, pas de diff : la cellule est montrée entière.
const DIFF_LINES_MAX: usize = 2000;
/// Lignes gardées de chaque côté dans le résumé.
const SHOWN_MAX: usize = 20;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineDiff {
    pub removed: Vec<String>,
    pub added: Vec<String>,
    /// Lignes changées au total (retirées + ajoutées), au-delà des lignes
    /// gardées dans `removed` et `added`.
    pub changed: usize,
}

/// Diff ligne à ligne (plus longue sous-suite commune).
pub fn line_diff(before: &str, after: &str) -> Option<LineDiff> {
    let a: Vec<&str> = before.lines().collect();
    let b: Vec<&str> = after.lines().collect();
    if a.len() > DIFF_LINES_MAX || b.len() > DIFF_LINES_MAX {
        return None;
    }
    let (n, m) = (a.len(), b.len());
    let mut lcs = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[i][j] = if a[i] == b[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }
    let mut diff = LineDiff::default();
    let (mut i, mut j) = (0, 0);
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            i += 1;
            j += 1;
        } else if j < m && (i == n || lcs[i][j + 1] >= lcs[i + 1][j]) {
            if diff.added.len() < SHOWN_MAX {
                diff.added.push(b[j].to_string());
            }
            diff.changed += 1;
            j += 1;
        } else {
            if diff.removed.len() < SHOWN_MAX {
                diff.removed.push(a[i].to_string());
            }
            diff.changed += 1;
            i += 1;
        }
    }
    Some(diff)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_ligne_changee() {
        let d = line_diff("a = 1\nplot(s=9)\nsave()", "a = 1\nplot(s=14)\nsave()").unwrap();
        assert_eq!(d.removed, vec!["plot(s=9)"]);
        assert_eq!(d.added, vec!["plot(s=14)"]);
        assert_eq!(d.changed, 2);
        assert_eq!(line_diff("x", "x").unwrap(), LineDiff::default());
    }
}
