//! Project file / command listing (Node `catalog.mjs`).

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const BUILTINS: &[&str] = &[
    "goal",
    "loop",
    "clear",
    "compact",
    "review",
    "context",
    "status",
    "model",
    "permissions",
    "plan",
    "diff",
    "usage",
    "resume",
    "plugins",
];

pub fn list_files(project_root: &str) -> Vec<String> {
    if project_root.is_empty() {
        return Vec::new();
    }
    let root = Path::new(project_root);
    if !root.is_dir() {
        return Vec::new();
    }
    // `git` can block indefinitely in a bundled macOS app while TCC asks for
    // access to the project directory. Keep stdout drained on a helper thread
    // so a large repository cannot deadlock the child before the timeout.
    if let Some(files) = git_files_bounded(root) {
        return files;
    }
    // The fallback can hit the same macOS TCC suspension as `git`, so keep
    // the directory read off the WebSocket worker and return an empty catalog
    // rather than making the whole sidecar unresponsive.
    read_dir_bounded(root)
}

fn git_files_bounded(root: &Path) -> Option<Vec<String>> {
    let mut child = Command::new("git")
        .args(["ls-files", "--cached", "--others", "--exclude-standard"])
        .current_dir(root)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        stdout.read_to_end(&mut bytes).ok().map(|_| bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return None;
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return None;
            }
        }
    };
    let bytes = reader.join().ok().flatten()?;
    if !status.success() {
        return None;
    }
    Some(
        String::from_utf8_lossy(&bytes)
            .lines()
            .filter(|line| !line.is_empty())
            .take(5000)
            .map(str::to_string)
            .collect(),
    )
}

fn read_dir_bounded(root: &Path) -> Vec<String> {
    let root = root.to_path_buf();
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    thread::spawn(move || {
        let files = std::fs::read_dir(root)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .filter(|name| !name.starts_with('.'))
                    .collect()
            })
            .unwrap_or_default();
        let _ = tx.send(files);
    });
    rx.recv_timeout(Duration::from_secs(1)).unwrap_or_default()
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CommandEntry {
    pub name: String,
    pub source: String,
    /// SKILL.md (skill) ou fichier .md (commande) — absent pour les builtins.
    /// Consommé par les providers skillsAttach (kimi) qui joignent le fichier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
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
                let skill_md = p.join("SKILL.md");
                let path = skill_md
                    .is_file()
                    .then(|| skill_md.to_string_lossy().into_owned());
                map.entry(name.clone()).or_insert(CommandEntry {
                    name,
                    source: source.into(),
                    path,
                });
            } else if kind == "commands" && name.ends_with(".md") {
                let n = name.trim_end_matches(".md").to_string();
                map.entry(n.clone()).or_insert(CommandEntry {
                    name: n,
                    source: source.into(),
                    path: Some(p.to_string_lossy().into_owned()),
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
            path: None,
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

    #[test]
    fn list_commands_expose_le_path_skill_et_commande() {
        let dir = tempdir().unwrap();
        let skills = dir.path().join(".claude/skills/mon-skill");
        std::fs::create_dir_all(&skills).unwrap();
        std::fs::write(skills.join("SKILL.md"), b"instructions").unwrap();
        let vide = dir.path().join(".claude/skills/skill-vide");
        std::fs::create_dir_all(&vide).unwrap();
        let commands = dir.path().join(".claude/commands");
        std::fs::create_dir_all(&commands).unwrap();
        std::fs::write(commands.join("ma-commande.md"), b"prompt").unwrap();

        let out = list_commands(Some(dir.path().to_str().unwrap()));
        let skill = out.iter().find(|c| c.name == "mon-skill").unwrap();
        assert_eq!(
            skill.path.as_deref(),
            Some(skills.join("SKILL.md").to_str().unwrap())
        );
        let sans_md = out.iter().find(|c| c.name == "skill-vide").unwrap();
        assert!(sans_md.path.is_none(), "pas de SKILL.md ⇒ pas de path");
        let cmd = out.iter().find(|c| c.name == "ma-commande").unwrap();
        assert_eq!(
            cmd.path.as_deref(),
            Some(commands.join("ma-commande.md").to_str().unwrap())
        );
        let builtin = out.iter().find(|c| c.source == "builtin").unwrap();
        assert!(builtin.path.is_none());
    }
}
