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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileCatalog {
    pub files: Vec<String>,
    pub recent_files: Vec<String>,
}

pub fn list_files(project_root: &str) -> Vec<String> {
    list_file_catalog(project_root).files
}

pub fn list_file_catalog(project_root: &str) -> FileCatalog {
    if project_root.is_empty() {
        return FileCatalog {
            files: Vec::new(),
            recent_files: Vec::new(),
        };
    }
    let root = Path::new(project_root);
    if !root.is_dir() {
        return FileCatalog {
            files: Vec::new(),
            recent_files: Vec::new(),
        };
    }
    // `git` can block indefinitely in a bundled macOS app while TCC asks for
    // access to the project directory. Keep stdout drained on a helper thread
    // so a large repository cannot deadlock the child before the timeout.
    if let Some(all) = git_files_bounded(root) {
        let recent_files = recent_project_files(root, &all, 12);
        return FileCatalog {
            files: all.into_iter().take(5000).collect(),
            recent_files,
        };
    }
    // The fallback can hit the same macOS TCC suspension as `git`, so keep
    // the directory read off the WebSocket worker and return an empty catalog
    // rather than making the whole sidecar unresponsive.
    let all = read_dir_bounded(root);
    let recent_files = recent_project_files(root, &all, 12);
    FileCatalog {
        files: all,
        recent_files,
    }
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
            .map(str::to_string)
            .collect(),
    )
}

fn recent_project_files(root: &Path, files: &[String], limit: usize) -> Vec<String> {
    const HIDDEN: &[&str] = &["figures_index.html", "figures_data.json"];
    const GENERATED_PREFIXES: &[&str] = &[
        "dist/",
        "mobile/dist/",
        "src-tauri/mobile-dist/",
        "src-tauri/rust-server-dist/",
        "src-tauri/sidecar-dist/",
        "src-tauri/appsnap-dist/",
        "src-tauri/gallery-dist/",
        "gallery/assets/shadcn-ui/",
    ];
    const JUNK_SUFFIXES: &[&str] = &[
        ".aux",
        ".log",
        ".synctex",
        ".synctex.gz",
        ".fls",
        ".fdb_latexmk",
        ".out",
        ".toc",
        ".bbl",
        ".blg",
        ".bak",
    ];
    let mut ranked: Vec<(u128, String)> = files
        .iter()
        .filter(|rel| {
            let lower = rel.to_ascii_lowercase();
            !rel.is_empty()
                && !HIDDEN.contains(&rel.as_str())
                && !rel.split('/').any(|part| part.starts_with('.'))
                && !rel.split('/').any(|part| part == "target")
                && !GENERATED_PREFIXES
                    .iter()
                    .any(|prefix| rel.starts_with(prefix))
                && !(rel.starts_with("gallery/assets/cm6/") && rel.ends_with(".bundle.js"))
                && !JUNK_SUFFIXES.iter().any(|suffix| lower.ends_with(suffix))
        })
        .filter_map(|rel| {
            let metadata = std::fs::metadata(root.join(rel)).ok()?;
            if !metadata.is_file() {
                return None;
            }
            let modified = metadata
                .modified()
                .ok()?
                .duration_since(std::time::UNIX_EPOCH)
                .ok()?
                .as_nanos();
            Some((modified, rel.clone()))
        })
        .collect();
    ranked.sort_by(|(mtime_a, rel_a), (mtime_b, rel_b)| {
        mtime_b.cmp(mtime_a).then_with(|| rel_a.cmp(rel_b))
    });
    ranked.into_iter().take(limit).map(|(_, rel)| rel).collect()
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
    use std::fs::{File, FileTimes};
    use std::time::{Duration, UNIX_EPOCH};
    use tempfile::tempdir;

    #[test]
    fn list_files_fallback() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("a.py"), b"x").unwrap();
        let files = list_files(dir.path().to_str().unwrap());
        assert!(files.iter().any(|f| f == "a.py"));
    }

    #[test]
    fn recent_files_use_mtime_and_exclude_generated_noise() {
        let dir = tempdir().unwrap();
        for (name, seconds) in [
            ("ancien.md", 10),
            ("frais.ts", 20),
            ("compile.log", 30),
            ("figures_data.json", 40),
        ] {
            let path = dir.path().join(name);
            std::fs::write(&path, name.as_bytes()).unwrap();
            File::options()
                .write(true)
                .open(path)
                .unwrap()
                .set_times(FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(seconds)))
                .unwrap();
        }
        std::fs::create_dir_all(dir.path().join("dist")).unwrap();
        let generated = dir.path().join("dist/index.html");
        std::fs::write(&generated, b"generated").unwrap();
        File::options()
            .write(true)
            .open(generated)
            .unwrap()
            .set_times(FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(50)))
            .unwrap();

        let catalog = list_file_catalog(dir.path().to_str().unwrap());
        assert_eq!(catalog.recent_files, vec!["frais.ts", "ancien.md"]);
        assert!(catalog.files.iter().any(|file| file == "frais.ts"));
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
