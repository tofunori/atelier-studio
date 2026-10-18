//! Per-project turn ledger — `ledger/<slug>--<hash>.jsonl`.
//!
//! Plan 048 (lot A) puis chantier 2a du rattrapage Claude Science
//! (2026-10-18) : le runtime Rust écrit une entrée par tour terminé. Le nom
//! du fichier porte un hash de la racine canonique — `slug_for` seul ne
//! garde que le dernier segment, et deux projets `…/A/these` et
//! `…/B/these` partageaient le même `these.jsonl`. L'ancien fichier sans
//! hash (écrit par le sidecar Node) reste lu, jamais réécrit ni supprimé.

use std::path::{Path, PathBuf};

pub fn slug_for(project_root: &str) -> String {
    let base = Path::new(project_root.trim())
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("default");
    let mut s: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    while s.starts_with('-') {
        s.remove(0);
    }
    while s.ends_with('-') {
        s.pop();
    }
    if s.is_empty() {
        "default".into()
    } else {
        s.chars().take(80).collect()
    }
}

/// Racine telle qu'elle sert d'identité : sans `/` final, sans espaces de
/// bord. Pas de `canonicalize` : un NAS démonté ne doit pas changer l'identité
/// d'un projet, et le runtime reçoit déjà la racine canonique du client.
fn canonical_root(project_root: &str) -> &str {
    let trimmed = project_root.trim();
    let stripped = trimmed.trim_end_matches('/');
    if stripped.is_empty() { trimmed } else { stripped }
}

/// `sha256(racine)` en hexadécimal : identité stable d'un projet.
pub fn project_id(project_root: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(canonical_root(project_root).as_bytes()))
}

fn ledger_path(base_dir: &Path, project_root: &str) -> PathBuf {
    let id = project_id(project_root);
    base_dir.join(format!("{}--{}.jsonl", slug_for(project_root), &id[..12]))
}

fn legacy_ledger_path(base_dir: &Path, project_root: &str) -> PathBuf {
    base_dir.join(format!("{}.jsonl", slug_for(project_root)))
}

pub fn append_ledger(
    base_dir: &Path,
    project_root: &str,
    entry: &serde_json::Value,
) -> std::io::Result<()> {
    std::fs::create_dir_all(base_dir)?;
    let path = ledger_path(base_dir, project_root);
    let mut line = serde_json::to_string(entry).unwrap_or_else(|_| "{}".into());
    line.push('\n');
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    f.write_all(line.as_bytes())
}

fn read_tail(path: PathBuf, max: usize) -> Vec<serde_json::Value> {
    let Ok(lines) = crate::ReverseLines::open(path) else { return Vec::new(); };
    lines.filter_map(Result::ok).filter(|line| !line.trim().is_empty()).take(max)
        .filter_map(|line| serde_json::from_str(&line).ok()).collect()
}

/// Entrées du projet, la plus récente en tête : le fichier hashé, puis
/// l'ancien fichier sans hash. Une entrée qui porte un `turnId` déjà vu est
/// écartée (finalisation rappelée, double écriture) ; les lignes legacy sans
/// `turnId` passent telles quelles.
pub fn get_ledger(base_dir: &Path, project_root: &str, limit: usize) -> Vec<serde_json::Value> {
    let max = limit.clamp(1, 1000);
    let mut entries = read_tail(ledger_path(base_dir, project_root), max);
    entries.extend(read_tail(legacy_ledger_path(base_dir, project_root), max));
    // Tri stable par horodatage décroissant : les deux fichiers sont chacun
    // déjà du plus récent au plus ancien, il reste à les entrelacer.
    entries.sort_by(|a, b| {
        let ts = |v: &serde_json::Value| v.get("ts").and_then(|t| t.as_str()).unwrap_or("").to_string();
        ts(b).cmp(&ts(a))
    });
    let mut seen = std::collections::HashSet::new();
    entries.retain(|entry| match entry.get("turnId").and_then(|t| t.as_str()) {
        Some(turn) if !turn.is_empty() => seen.insert(turn.to_string()),
        _ => true,
    });
    entries.truncate(max);
    entries
}

/// All ledger entries across projects (newest files last), capped.
pub fn get_all_ledgers(base_dir: &Path, limit: usize) -> Vec<serde_json::Value> {
    let max = limit.clamp(1, 5000);
    let Ok(rd) = std::fs::read_dir(base_dir) else {
        return Vec::new();
    };
    let mut all = std::collections::VecDeque::with_capacity(max);
    for ent in rd.flatten() {
        let path = ent.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(tail) = crate::ReverseLines::open(path) else { continue; };
        let mut lines: Vec<_> = tail.filter_map(Result::ok).filter(|line| !line.trim().is_empty()).take(max).collect();
        lines.reverse();
        for line in lines {
            if let Ok(v) = serde_json::from_str(&line) {
                if all.len() == max { all.pop_front(); }
                all.push_back(v);
            }
        }
    }
    all.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn append_and_get() {
        let dir = tempdir().unwrap();
        let root = "/tmp/My Project!";
        append_ledger(dir.path(), root, &serde_json::json!({"ts":"1","n":1})).unwrap();
        append_ledger(dir.path(), root, &serde_json::json!({"ts":"2","n":2})).unwrap();
        let entries = get_ledger(dir.path(), root, 10);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0]["n"], 2); // newest first
    }

    #[test]
    fn deux_projets_de_meme_nom_ont_chacun_leur_fichier() {
        let dir = tempdir().unwrap();
        append_ledger(dir.path(), "/Volumes/A/these", &serde_json::json!({"ts":"1","turnId":"a"})).unwrap();
        append_ledger(dir.path(), "/Users/me/these/", &serde_json::json!({"ts":"2","turnId":"b"})).unwrap();
        let a = get_ledger(dir.path(), "/Volumes/A/these", 10);
        let b = get_ledger(dir.path(), "/Users/me/these", 10);
        assert_eq!(a.len(), 1);
        assert_eq!(a[0]["turnId"], "a");
        assert_eq!(b.len(), 1, "le / final ne change pas l'identité");
        assert_eq!(b[0]["turnId"], "b");
        let files: Vec<_> = std::fs::read_dir(dir.path()).unwrap().flatten().collect();
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn lit_aussi_l_ancien_fichier_et_deduplique_par_tour() {
        let dir = tempdir().unwrap();
        let root = "/p/these";
        std::fs::write(
            dir.path().join("these.jsonl"),
            "{\"ts\":\"2026-01-01T00:00:00Z\",\"n\":\"legacy\"}\n{pas du json\n",
        )
        .unwrap();
        append_ledger(dir.path(), root, &serde_json::json!({"ts":"2026-02-01T00:00:00Z","turnId":"t1"})).unwrap();
        append_ledger(dir.path(), root, &serde_json::json!({"ts":"2026-02-01T00:00:00Z","turnId":"t1"})).unwrap();
        let entries = get_ledger(dir.path(), root, 10);
        assert_eq!(entries.len(), 2, "{entries:?}");
        assert_eq!(entries[0]["turnId"], "t1");
        assert_eq!(entries[1]["n"], "legacy");
        assert_eq!(get_ledger(dir.path(), root, 1).len(), 1, "la limite tient");
    }

    #[test]
    fn get_all_ledgers_keeps_only_the_tail() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("proj.jsonl");
        let lines: Vec<String> = (0..1000).map(|i| format!("{{\"i\":{i}}}")).collect();
        std::fs::write(&file, lines.join("\n")).unwrap();
        let all = get_all_ledgers(dir.path(), 500);
        assert_eq!(all.len(), 500);
        assert_eq!(all.first().unwrap()["i"], 500); // la queue, pas la tête
        assert_eq!(all.last().unwrap()["i"], 999);
    }
}
