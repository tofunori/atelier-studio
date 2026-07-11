//! Project file / command listing (Node `catalog.mjs`).

use std::path::{Path, PathBuf};
use std::process::Command;

const BUILTINS: &[&str] = &["goal", "loop", "clear", "compact", "review", "context"];

pub fn list_files(project_root: &str) -> Vec<String> {
    if project_root.is_empty() {
        return Vec::new();
    }
    let root = Path::new(project_root);
    if !root.is_dir() {
        return Vec::new();
    }
    let out = Command::new("git")
        .args(["ls-files", "--cached", "--others", "--exclude-standard"])
        .current_dir(root)
        .output();
    if let Ok(o) = out {
        if o.status.success() {
            let text = String::from_utf8_lossy(&o.stdout);
            return text
                .lines()
                .filter(|l| !l.is_empty())
                .take(5000)
                .map(str::to_string)
                .collect();
        }
    }
    // fallback: top-level names only
    std::fs::read_dir(root)
        .map(|rd| {
            rd.filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| !n.starts_with('.'))
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandEntry {
    pub name: String,
    pub source: String,
}

pub fn list_commands(project_root: Option<&str>) -> Vec<CommandEntry> {
    use std::collections::BTreeMap;
    let mut out: BTreeMap<String, CommandEntry> = BTreeMap::new();
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let scan = |dir: &Path, kind: &str, map: &mut BTreeMap<String, CommandEntry>| {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        let source = if home.as_ref().is_some_and(|h| dir.starts_with(h)) {
            "user"
        } else {
            "project"
        };
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let p = e.path();
            if kind == "skills" && p.is_dir() {
                map.entry(name.clone()).or_insert(CommandEntry {
                    name,
                    source: source.into(),
                });
            } else if kind == "commands" && name.ends_with(".md") {
                let n = name.trim_end_matches(".md").to_string();
                map.entry(n.clone()).or_insert(CommandEntry {
                    name: n,
                    source: source.into(),
                });
            }
        }
    };
    if let Some(ref h) = home {
        scan(&h.join(".claude/skills"), "skills", &mut out);
        scan(&h.join(".claude/commands"), "commands", &mut out);
    }
    if let Some(pr) = project_root.filter(|s| !s.is_empty()) {
        let root = Path::new(pr);
        scan(&root.join(".claude/skills"), "skills", &mut out);
        scan(&root.join(".claude/commands"), "commands", &mut out);
    }
    for name in BUILTINS {
        out.entry((*name).into()).or_insert(CommandEntry {
            name: (*name).into(),
            source: "builtin".into(),
        });
    }
    out.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn list_files_fallback() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("a.py"), b"x").unwrap();
        let files = list_files(dir.path().to_str().unwrap());
        assert!(files.iter().any(|f| f == "a.py"));
    }
}
