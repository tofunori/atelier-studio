//! Git operations — Node `gitops.mjs` parity (core surface).

use serde::Serialize;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GitError {
    #[error("{0}")]
    Msg(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
}

type Result<T> = std::result::Result<T, GitError>;

fn msg(s: impl Into<String>) -> GitError {
    GitError::Msg(s.into())
}

fn confined_root(root: &str) -> Result<PathBuf> {
    if root.is_empty() {
        return Err(msg("root requis"));
    }
    let p = Path::new(root);
    if !p.exists() {
        return Err(msg(format!("repo absent: {root}")));
    }
    Ok(std::fs::canonicalize(p)?)
}

fn assert_relative(root: &Path, file_path: &str) -> Result<String> {
    if file_path.is_empty() || file_path.contains('\0') {
        return Err(msg("path relatif requis"));
    }
    let p = Path::new(file_path);
    if p.is_absolute() {
        return Err(msg("path relatif requis"));
    }
    for c in p.components() {
        if matches!(c, Component::ParentDir) {
            return Err(msg("path hors repo"));
        }
    }
    let abs = root.join(file_path);
    let canon_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    // Don't require file to exist for stage of new files
    if let Ok(canon) = std::fs::canonicalize(&abs) {
        if !canon.starts_with(&canon_root) {
            return Err(msg("path hors repo"));
        }
    }
    Ok(file_path.replace('\\', "/"))
}

fn git(root: &Path, args: &[&str], env: &[(&str, &str)]) -> Result<std::process::Output> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(root);
    for (k, v) in env {
        cmd.env(k, v);
    }
    Ok(cmd.output()?)
}

fn git_ok(root: &Path, args: &[&str]) -> Result<String> {
    let out = git(root, args, &[])?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        Err(msg(if !err.trim().is_empty() {
            err.trim().to_string()
        } else {
            stdout.trim().to_string()
        }))
    }
}

fn has_head(root: &Path) -> bool {
    git(root, &["rev-parse", "--verify", "HEAD"], &[])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn is_repo(root: &str) -> bool {
    let Ok(real) = confined_root(root) else {
        return false;
    };
    let Ok(out) = git(&real, &["rev-parse", "--show-toplevel"], &[]) else {
        return false;
    };
    if !out.status.success() {
        return false;
    }
    let top = String::from_utf8_lossy(&out.stdout).trim().to_string();
    std::fs::canonicalize(&top).ok().as_ref() == Some(&real)
}

fn ensure_repo(root: &Path) -> Result<()> {
    let s = root.to_string_lossy();
    if !is_repo(&s) {
        return Err(msg(format!("repo git introuvable: {s}")));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    pub path: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub add: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub del: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct GitStatus {
    pub branch: Option<String>,
    pub ahead: i64,
    pub behind: i64,
    pub files: Vec<GitFile>,
}

fn parse_status(output: &str) -> GitStatus {
    let mut result = GitStatus::default();
    let records: Vec<&str> = output.split('\0').filter(|s| !s.is_empty()).collect();
    let mut i = 0;
    while i < records.len() {
        let record = records[i];
        if let Some(rest) = record.strip_prefix("# branch.head ") {
            result.branch = Some(rest.to_string());
        } else if let Some(rest) = record.strip_prefix("# branch.ab ") {
            // +N -M
            let parts: Vec<_> = rest.split_whitespace().collect();
            if parts.len() >= 2 {
                result.ahead = parts[0].trim_start_matches('+').parse().unwrap_or(0);
                result.behind = parts[1].trim_start_matches('-').parse().unwrap_or(0);
            }
        } else if record.starts_with("? ") || record.starts_with("! ") {
            result.files.push(GitFile {
                path: record[2..].to_string(),
                status: record[..1].to_string(),
                original_path: None,
                add: None,
                del: None,
            });
        } else if record.starts_with("1 ") {
            let parts: Vec<_> = record.splitn(9, ' ').collect();
            if parts.len() >= 9 {
                result.files.push(GitFile {
                    path: parts[8].to_string(),
                    status: parts[1].to_string(),
                    original_path: None,
                    add: None,
                    del: None,
                });
            }
        } else if record.starts_with("u ") {
            let parts: Vec<_> = record.splitn(11, ' ').collect();
            if parts.len() >= 11 {
                result.files.push(GitFile {
                    path: parts[10].to_string(),
                    status: parts[1].to_string(),
                    original_path: None,
                    add: None,
                    del: None,
                });
            }
        } else if record.starts_with("2 ") {
            let parts: Vec<_> = record.splitn(10, ' ').collect();
            let path = if parts.len() >= 10 {
                parts[9].to_string()
            } else {
                String::new()
            };
            let original = records.get(i + 1).map(|s| s.to_string());
            if original.is_some() {
                i += 1;
            }
            result.files.push(GitFile {
                path,
                status: parts.get(1).unwrap_or(&"").to_string(),
                original_path: original,
                add: None,
                del: None,
            });
        }
        i += 1;
    }
    result
}

pub fn status(root: &str) -> Result<GitStatus> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let out = git(
        &real,
        &["status", "--porcelain=v2", "--branch", "-z"],
        &[],
    )?;
    // porcelain -z mixes nulls; include stderr empty path
    let text = String::from_utf8_lossy(&out.stdout);
    let mut parsed = parse_status(&text);
    if has_head(&real) {
        if let Ok(ns) = git_ok(&real, &["diff", "--numstat", "HEAD", "--"]) {
            let mut stats = std::collections::HashMap::new();
            for line in ns.lines() {
                let mut parts = line.splitn(3, '\t');
                let a = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                let d = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                if let Some(p) = parts.next() {
                    stats.insert(p.to_string(), (a, d));
                }
            }
            for f in &mut parsed.files {
                if let Some(&(a, d)) = stats.get(&f.path) {
                    f.add = Some(a);
                    f.del = Some(d);
                }
            }
        }
    }
    Ok(parsed)
}

pub fn diff(root: &str, file_path: Option<&str>) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let rel = match file_path {
        Some(p) => Some(assert_relative(&real, p)?),
        None => None,
    };
    let mut args = vec![
        "diff".to_string(),
        "--no-ext-diff".into(),
        "--no-color".into(),
        "--binary".into(),
    ];
    if has_head(&real) {
        args.push("HEAD".into());
    }
    args.push("--".into());
    if let Some(r) = &rel {
        args.push(r.clone());
    }
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = git(&real, &arg_refs, &[])?;
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    // untracked
    let st = status(root)?;
    for f in st.files.iter().filter(|f| f.status == "?") {
        if let Some(r) = &rel {
            if &f.path != r && !f.path.starts_with(&format!("{r}/")) {
                continue;
            }
        }
        let abs = real.join(&f.path);
        let out = git(
            &real,
            &[
                "diff",
                "--no-index",
                "--no-color",
                "--binary",
                "--",
                "/dev/null",
                abs.to_str().unwrap_or(""),
            ],
            &[],
        )?;
        // git diff --no-index exits 1 on differences
        let chunk = String::from_utf8_lossy(&out.stdout);
        if !chunk.is_empty() {
            if !text.is_empty() && !text.ends_with('\n') {
                text.push('\n');
            }
            text.push_str(&chunk);
        }
    }
    Ok(text)
}

pub fn stage_file(root: &str, file_path: &str) -> Result<()> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let rel = assert_relative(&real, file_path)?;
    git_ok(&real, &["add", "--", &rel])?;
    Ok(())
}

pub fn unstage_file(root: &str, file_path: &str) -> Result<()> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let rel = assert_relative(&real, file_path)?;
    if has_head(&real) {
        git_ok(&real, &["restore", "--staged", "--", &rel])?;
    } else {
        let _ = git_ok(&real, &["rm", "--cached", "--ignore-unmatch", "--", &rel]);
    }
    Ok(())
}

pub fn revert_file(root: &str, file_path: &str) -> Result<()> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let rel = assert_relative(&real, file_path)?;
    if has_head(&real) {
        if git_ok(
            &real,
            &[
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
                &rel,
            ],
        )
        .is_ok()
        {
            return Ok(());
        }
    } else {
        let _ = git_ok(&real, &["rm", "--cached", "--ignore-unmatch", "--", &rel]);
    }
    let abs = real.join(&rel);
    if abs.exists() {
        if abs.is_dir() {
            std::fs::remove_dir_all(&abs)?;
        } else {
            std::fs::remove_file(&abs)?;
        }
    }
    Ok(())
}

pub fn commit(root: &str, message: &str, files: Option<&[String]>) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let msg_s = message.trim();
    if msg_s.is_empty() {
        return Err(msg("message de commit vide"));
    }
    if let Some(files) = files {
        if !files.is_empty() {
            let mut args = vec!["add".to_string(), "--".into()];
            for f in files {
                args.push(assert_relative(&real, f)?);
            }
            let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            git_ok(&real, &refs)?;
        }
    } else {
        let st = status(root)?;
        if st.files.is_empty() {
            return Err(msg("rien à commiter"));
        }
        git_ok(&real, &["add", "-A"])?;
    }
    git_ok(&real, &["commit", "-m", msg_s])?;
    Ok(git_ok(&real, &["rev-parse", "HEAD"])?.trim().to_string())
}

pub fn push(root: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let out = git(&real, &["push"], &[])?;
    Ok(format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string())
}

pub fn pull(root: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let out = git(&real, &["pull", "--ff-only"], &[])?;
    if !out.status.success() {
        return Err(msg(String::from_utf8_lossy(&out.stderr).trim().to_string()));
    }
    Ok(format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string())
}

pub fn ignore_pattern(root: &str, pattern: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let p = real.join(".gitignore");
    let cur = std::fs::read_to_string(&p).unwrap_or_default();
    if cur.lines().any(|l| l == pattern) {
        return Ok("déjà présent".into());
    }
    let mut next = cur;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(pattern);
    next.push('\n');
    std::fs::write(p, next)?;
    Ok("ajouté".into())
}

pub fn snapshot(root: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let dir = tempfile::tempdir().map_err(|e| msg(e.to_string()))?;
    let index = dir.path().join("index");
    let env = [
        ("GIT_INDEX_FILE", index.to_str().unwrap_or("")),
        ("GIT_AUTHOR_NAME", "Atelier"),
        ("GIT_AUTHOR_EMAIL", "atelier@example.invalid"),
        ("GIT_COMMITTER_NAME", "Atelier"),
        ("GIT_COMMITTER_EMAIL", "atelier@example.invalid"),
    ];
    if has_head(&real) {
        let out = git(&real, &["read-tree", "HEAD"], &env)?;
        if !out.status.success() {
            return Err(msg("read-tree HEAD failed"));
        }
    }
    let out = git(&real, &["add", "-A"], &env)?;
    if !out.status.success() {
        return Err(msg("snapshot add failed"));
    }
    let tree_out = git(&real, &["write-tree"], &env)?;
    if !tree_out.status.success() {
        return Err(msg("write-tree failed"));
    }
    let tree = String::from_utf8_lossy(&tree_out.stdout).trim().to_string();
    let mut args = vec!["commit-tree".to_string(), tree, "-m".into(), "atelier snapshot".into()];
    if has_head(&real) {
        let head = git(&real, &["rev-parse", "HEAD"], &env)?;
        let h = String::from_utf8_lossy(&head.stdout).trim().to_string();
        args.push("-p".into());
        args.push(h);
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = git(&real, &refs, &env)?;
    if !out.status.success() {
        return Err(msg("commit-tree failed"));
    }
    let sha = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let refname = format!("refs/atelier/snapshots/{sha}");
    let out = git(&real, &["update-ref", &refname, &sha], &env)?;
    if !out.status.success() {
        return Err(msg("update-ref snapshot failed"));
    }
    Ok(sha)
}

pub fn restore(root: &str, sha: &str) -> Result<()> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if !sha.chars().all(|c| c.is_ascii_hexdigit()) || sha.len() < 4 {
        return Err(msg("sha invalide"));
    }
    let dir = tempfile::tempdir().map_err(|e| msg(e.to_string()))?;
    let index = dir.path().join("index");
    let env = [
        ("GIT_INDEX_FILE", index.to_str().unwrap_or("")),
        ("GIT_AUTHOR_NAME", "Atelier"),
        ("GIT_AUTHOR_EMAIL", "atelier@example.invalid"),
        ("GIT_COMMITTER_NAME", "Atelier"),
        ("GIT_COMMITTER_EMAIL", "atelier@example.invalid"),
    ];
    let commit_ref = format!("{sha}^{{commit}}");
    let out = git(&real, &["cat-file", "-e", &commit_ref], &env)?;
    if !out.status.success() {
        return Err(msg("snapshot inconnu"));
    }
    let tree_ref = format!("{sha}^{{tree}}");
    let snap_out = git(&real, &["ls-tree", "-r", "--name-only", "-z", &tree_ref], &env)?;
    let snap_paths: std::collections::HashSet<_> = String::from_utf8_lossy(&snap_out.stdout)
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    let now_out = git(
        &real,
        &["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        &[],
    )?;
    let now_paths: Vec<_> = String::from_utf8_lossy(&now_out.stdout)
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    let new_paths: Vec<_> = now_paths
        .into_iter()
        .filter(|p| !snap_paths.contains(p))
        .collect();
    if !new_paths.is_empty() {
        let shown = new_paths.iter().take(10).cloned().collect::<Vec<_>>().join(", ");
        return Err(msg(format!(
            "restauration refusée : {} chemin(s) créé(s) après le snapshot ({shown}{}). Rien n'a été modifié.",
            new_paths.len(),
            if new_paths.len() > 10 { ", …" } else { "" }
        )));
    }
    let out = git(&real, &["read-tree", &tree_ref], &env)?;
    if !out.status.success() {
        return Err(msg("read-tree failed"));
    }
    let out = git(&real, &["checkout-index", "-a", "-f"], &env)?;
    if !out.status.success() {
        return Err(msg("checkout-index failed"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use tempfile::tempdir;

    fn init_repo() -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        Command::new("git")
            .args(["init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.email", "t@test"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["config", "user.name", "t"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        std::fs::write(dir.path().join("a.txt"), b"hello").unwrap();
        Command::new("git")
            .args(["add", "a.txt"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        dir
    }

    #[test]
    fn status_and_diff() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"hello world").unwrap();
        let st = status(root).unwrap();
        assert!(!st.files.is_empty());
        let d = diff(root, Some("a.txt")).unwrap();
        assert!(d.contains("hello") || d.contains("diff"));
    }

    #[test]
    fn path_escape_rejected() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        assert!(stage_file(root, "../outside").is_err());
    }
}
