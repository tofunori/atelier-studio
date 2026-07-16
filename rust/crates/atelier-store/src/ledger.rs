//! Per-project turn ledger — `ledger/<slug>.jsonl` (Node `sidecar/ledger.mjs`).

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

fn ledger_path(base_dir: &Path, project_root: &str) -> PathBuf {
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

pub fn get_ledger(base_dir: &Path, project_root: &str, limit: usize) -> Vec<serde_json::Value> {
    let max = limit.clamp(1, 1000);
    let path = ledger_path(base_dir, project_root);
    let Ok(text) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut lines: Vec<_> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.len() > max {
        lines = lines[lines.len() - max..].to_vec();
    }
    let mut out: Vec<serde_json::Value> = lines
        .into_iter()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    out.reverse();
    out
}

/// All ledger entries across projects (newest files last), capped.
pub fn get_all_ledgers(base_dir: &Path, limit: usize) -> Vec<serde_json::Value> {
    let max = limit.clamp(1, 5000);
    let Ok(rd) = std::fs::read_dir(base_dir) else {
        return Vec::new();
    };
    let mut all = Vec::new();
    for ent in rd.flatten() {
        let path = ent.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(path) else {
            continue;
        };
        for line in text.lines().filter(|l| !l.trim().is_empty()) {
            if let Ok(v) = serde_json::from_str(line) {
                all.push(v);
            }
        }
    }
    if all.len() > max {
        all = all[all.len() - max..].to_vec();
    }
    all
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
}
