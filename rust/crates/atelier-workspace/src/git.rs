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
    pub branches: Vec<String>,
    pub ahead: i64,
    pub behind: i64,
    pub files: Vec<GitFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitSummary {
    pub sha: String,
    pub short_sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub author_email: String,
    pub authored_at: String,
    pub subject: String,
    pub decorations: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitFile {
    pub status: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogPage { pub commits: Vec<GitCommitSummary>, pub has_more: bool, pub skip: usize }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDetails {
    #[serde(flatten)] pub commit: GitCommitSummary,
    pub body: String, pub files: Vec<GitCommitFile>, pub diff: String,
    pub head: String, pub upstream: Option<String>, pub is_head: bool, pub is_published: bool,
}

fn valid_sha(sha: &str) -> bool { (4..=64).contains(&sha.len()) && sha.chars().all(|c| c.is_ascii_hexdigit()) }

fn parse_commit_records(output: &str) -> Vec<GitCommitSummary> {
    output.split('\x1e').filter_map(|record| {
        let fields: Vec<_> = record.trim_start_matches('\n').split('\x1f').collect();
        if fields.len() < 8 || !valid_sha(fields[0]) { return None; }
        Some(GitCommitSummary {
            sha: fields[0].into(), short_sha: fields[1].into(),
            parents: fields[2].split_whitespace().map(str::to_string).collect(),
            author: fields[3].into(), author_email: fields[4].into(), authored_at: fields[5].into(),
            subject: fields[6].into(), decorations: fields[7].split(", ").filter(|s| !s.is_empty()).map(str::to_string).collect(),
        })
    }).collect()
}

fn head_sha(root: &Path) -> Result<String> { Ok(git_ok(root, &["rev-parse", "HEAD"])?.trim().into()) }
fn upstream_sha(root: &Path) -> Option<String> { git_ok(root, &["rev-parse", "--verify", "@{upstream}"]).ok().map(|s| s.trim().into()) }
fn is_ancestor(root: &Path, a: &str, b: &str) -> bool { git(root, &["merge-base", "--is-ancestor", a, b], &[]).map(|o| o.status.success()).unwrap_or(false) }
fn assert_clean(root: &Path) -> Result<()> { if !status(&root.to_string_lossy())?.files.is_empty() { Err(msg("opération refusée : l’arbre de travail doit être propre")) } else { Ok(()) } }
fn assert_expected_head(root: &Path, expected: Option<&str>) -> Result<String> {
    let head = head_sha(root)?;
    if expected.is_some_and(|value| value != head) { return Err(msg("opération refusée : HEAD a changé, actualise l’historique")); }
    Ok(head)
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
    let out = git(&real, &["status", "--porcelain=v2", "--branch", "-z"], &[])?;
    // porcelain -z mixes nulls; include stderr empty path
    let text = String::from_utf8_lossy(&out.stdout);
    let mut parsed = parse_status(&text);
    if let Ok(branches) = git_ok(
        &real,
        &[
            "for-each-ref",
            "--format=%(refname:short)",
            "--sort=refname",
            "refs/heads/",
        ],
    ) {
        parsed.branches = branches
            .lines()
            .map(str::trim)
            .filter(|branch| !branch.is_empty())
            .map(str::to_string)
            .collect();
    }
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

pub fn log(root: &str, all: bool, skip: usize, limit: usize, query: &str) -> Result<GitLogPage> {
    let real = confined_root(root)?; ensure_repo(&real)?;
    let page = limit.clamp(1, 100); let count = format!("--max-count={}", page + 1); let offset = format!("--skip={skip}");
    let mut args = vec!["log", "--topo-order", count.as_str(), offset.as_str(), "--format=%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D"];
    let search = query.trim().chars().take(200).collect::<String>(); let grep = format!("--grep={search}");
    if !search.is_empty() { args.extend(["--regexp-ignore-case", grep.as_str()]); }
    if all { args.push("--all"); }
    let mut commits = parse_commit_records(&git_ok(&real, &args)?); let has_more = commits.len() > page; commits.truncate(page);
    Ok(GitLogPage { commits, has_more, skip })
}

pub fn commit_details(root: &str, sha: &str) -> Result<GitCommitDetails> {
    let real = confined_root(root)?; ensure_repo(&real)?; if !valid_sha(sha) { return Err(msg("sha invalide")); }
    let cref = format!("{sha}^{{commit}}"); git_ok(&real, &["cat-file", "-e", &cref])?;
    let commit = parse_commit_records(&git_ok(&real, &["show", "-s", "--format=%x1e%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%D", sha])?).into_iter().next().ok_or_else(|| msg("commit invalide"))?;
    let body = git_ok(&real, &["show", "-s", "--format=%B", sha])?.trim().into();
    let files = git_ok(&real, &["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-M", sha])?.lines().filter_map(|line| {
        let fields: Vec<_> = line.split('\t').collect(); if fields.len() < 2 { return None; }
        Some(GitCommitFile { status: fields[0].into(), path: fields.last()?.to_string(), previous_path: (fields.len() > 2).then(|| fields[1].into()) })
    }).collect();
    let diff = git_ok(&real, &["show", "--no-ext-diff", "--no-color", "--format=", "--binary", sha])?;
    let head = head_sha(&real)?; let upstream = upstream_sha(&real); let is_published = upstream.as_deref().is_some_and(|up| is_ancestor(&real, sha, up));
    Ok(GitCommitDetails { is_head: head == commit.sha, commit, body, files, diff, head, upstream, is_published })
}

/// Exact before/after documents for one file in a historical commit.
pub fn commit_file_contents(root: &str, sha: &str, path: &str, previous_path: Option<&str>) -> Result<DiffContents> {
    let real = confined_root(root)?; ensure_repo(&real)?;
    if !valid_sha(sha) { return Err(msg("sha invalide")); }
    let rel = assert_relative(&real, path)?;
    let previous = assert_relative(&real, previous_path.unwrap_or(path))?;
    let cref = format!("{sha}^{{commit}}"); git_ok(&real, &["cat-file", "-e", &cref])?;
    let parents = git_ok(&real, &["show", "-s", "--format=%P", sha])?;
    let before_bytes = parents.split_whitespace().next()
        .map(|parent| git_object(&real, &format!("{parent}:{previous}")))
        .unwrap_or_default();
    let after_bytes = git_object(&real, &format!("{sha}:{rel}"));
    let (before, before_binary) = decode_diff_content(before_bytes);
    let (after, after_binary) = decode_diff_content(after_bytes);
    Ok(DiffContents { before, after, binary: before_binary || after_binary })
}

pub fn create_branch_at(root: &str, branch: &str, sha: &str) -> Result<String> {
    let real = confined_root(root)?; ensure_repo(&real)?; assert_clean(&real)?; if !valid_sha(sha) { return Err(msg("sha invalide")); }
    git_ok(&real, &["check-ref-format", "--branch", branch])?; let cref = format!("{sha}^{{commit}}"); git_ok(&real, &["cat-file", "-e", &cref])?;
    git_ok(&real, &["switch", "-c", branch, sha])?; Ok(branch.into())
}

pub fn restore_file_from_commit(root: &str, sha: &str, path: &str, expected: Option<&str>) -> Result<String> {
    let real = confined_root(root)?; ensure_repo(&real)?; assert_clean(&real)?; assert_expected_head(&real, expected)?;
    if !valid_sha(sha) { return Err(msg("sha invalide")); } let rel = assert_relative(&real, path)?; let source = format!("--source={sha}");
    git_ok(&real, &["restore", &source, "--worktree", "--", &rel])?; Ok(rel)
}

pub fn revert_commit(root: &str, sha: &str, expected: Option<&str>) -> Result<String> {
    let real = confined_root(root)?; ensure_repo(&real)?; assert_clean(&real)?; assert_expected_head(&real, expected)?; if !valid_sha(sha) { return Err(msg("sha invalide")); }
    if git_ok(&real, &["show", "-s", "--format=%P", sha])?.split_whitespace().count() > 1 { return Err(msg("revert d’un commit de fusion non pris en charge")); }
    if let Err(error) = git_ok(&real, &["revert", "--no-edit", sha]) { let _ = git_ok(&real, &["revert", "--abort"]); return Err(error); }
    head_sha(&real)
}

pub fn undo_last_commit(root: &str, expected: Option<&str>) -> Result<String> {
    let real = confined_root(root)?; ensure_repo(&real)?; assert_clean(&real)?; let head = assert_expected_head(&real, expected)?;
    if upstream_sha(&real).as_deref().is_some_and(|up| is_ancestor(&real, &head, up)) { return Err(msg("annulation refusée : ce commit est déjà publié, utilise Revert")); }
    git_ok(&real, &["rev-parse", "--verify", "HEAD^"])?; git_ok(&real, &["reset", "--mixed", "HEAD^"])?; head_sha(&real)
}

pub fn reset_to_commit(root: &str, sha: &str, mode: &str, expected: Option<&str>) -> Result<(String, String)> {
    let real = confined_root(root)?; ensure_repo(&real)?; assert_clean(&real)?; let head = assert_expected_head(&real, expected)?;
    if !valid_sha(sha) { return Err(msg("sha invalide")); } if !matches!(mode, "soft" | "mixed" | "hard") { return Err(msg("mode reset invalide")); }
    if upstream_sha(&real).as_deref().is_some_and(|up| !is_ancestor(&real, up, sha)) { return Err(msg("reset refusé avant le dernier commit publié, utilise Revert")); }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(); let safety = format!("refs/atelier/safety/reset-{stamp}");
    git_ok(&real, &["update-ref", &safety, &head])?; let flag = format!("--{mode}"); git_ok(&real, &["reset", &flag, sha])?; Ok((head_sha(&real)?, safety))
}

pub fn fetch_all(root: &str) -> Result<String> { let real = confined_root(root)?; ensure_repo(&real)?; git_ok(&real, &["fetch", "--all", "--prune"]).map(|s| s.trim().into()) }

pub fn switch_branch(root: &str, branch: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if branch.is_empty() || branch.contains('\0') {
        return Err(msg("branche requise"));
    }
    let current = status(root)?;
    if !current.files.is_empty() {
        return Err(msg(
            "changement de branche refusé : l’arbre de travail doit être propre",
        ));
    }
    git_ok(&real, &["check-ref-format", "--branch", branch])?;
    let reference = format!("refs/heads/{branch}");
    let exists = git(&real, &["show-ref", "--verify", "--quiet", &reference], &[])?;
    if !exists.status.success() {
        return Err(msg(format!("branche locale introuvable : {branch}")));
    }
    if current.branch.as_deref() == Some(branch) {
        return Ok(branch.to_string());
    }
    git_ok(&real, &["switch", "--", branch])?;
    Ok(branch.to_string())
}

pub fn create_branch(root: &str, branch: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if branch.is_empty() || branch.contains('\0') {
        return Err(msg("branche requise"));
    }
    git_ok(&real, &["check-ref-format", "--branch", branch])?;
    let reference = format!("refs/heads/{branch}");
    let exists = git(&real, &["show-ref", "--verify", "--quiet", &reference], &[])?;
    if exists.status.success() {
        return Err(msg(format!("branche locale déjà existante : {branch}")));
    }
    git_ok(&real, &["switch", "-c", branch])?;
    Ok(branch.to_string())
}

pub fn delete_branch(root: &str, branch: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if branch.is_empty() || branch.contains('\0') {
        return Err(msg("branche requise"));
    }
    let current = status(root)?;
    git_ok(&real, &["check-ref-format", "--branch", branch])?;
    if current.branch.as_deref() == Some(branch) {
        return Err(msg("suppression de la branche active refusée"));
    }
    let reference = format!("refs/heads/{branch}");
    let exists = git(&real, &["show-ref", "--verify", "--quiet", &reference], &[])?;
    if !exists.status.success() {
        return Err(msg(format!("branche locale introuvable : {branch}")));
    }
    git_ok(&real, &["branch", "-d", "--", branch])?;
    Ok(branch.to_string())
}

pub fn merge_branch(root: &str, branch: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if branch.is_empty() || branch.contains('\0') {
        return Err(msg("branche requise"));
    }
    let current = status(root)?;
    if !current.files.is_empty() {
        return Err(msg("fusion refusée : l’arbre de travail doit être propre"));
    }
    git_ok(&real, &["check-ref-format", "--branch", branch])?;
    if current.branch.as_deref() == Some(branch) {
        return Err(msg("fusion de la branche active avec elle-même refusée"));
    }
    let reference = format!("refs/heads/{branch}");
    let exists = git(&real, &["show-ref", "--verify", "--quiet", &reference], &[])?;
    if !exists.status.success() {
        return Err(msg(format!("branche locale introuvable : {branch}")));
    }
    git_ok(&real, &["merge", "--no-edit", branch])?;
    Ok(branch.to_string())
}

pub fn diff(root: &str, file_path: Option<&str>) -> Result<String> {
    let project = confined_root(root)?;
    // Un projet Atelier peut légitimement être un sous-dossier d'un dépôt
    // (p. ex. manuscript_ch1). Résoudre la vraie racine Git, puis préfixer le
    // chemin demandé relativement à celle-ci sans relâcher le confinement.
    let top = git_ok(&project, &["rev-parse", "--show-toplevel"])
        .map_err(|_| msg(format!("repo git introuvable: {}", project.display())))?;
    let real = std::fs::canonicalize(top.trim())?;
    if !project.starts_with(&real) {
        return Err(msg("projet hors repo git"));
    }
    let project_prefix = project
        .strip_prefix(&real)
        .unwrap_or(Path::new(""))
        .to_string_lossy()
        .replace('\\', "/");
    let rel = match file_path {
        Some(p) => {
            let within_project = assert_relative(&project, p)?;
            Some(if project_prefix.is_empty() {
                within_project
            } else {
                format!("{project_prefix}/{within_project}")
            })
        }
        None if !project_prefix.is_empty() => Some(project_prefix),
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
    // `git status` résume parfois un dossier non suivi en `dir/` au lieu de
    // lister ses fichiers. Pour une demande ciblée, détecter directement si
    // le fichier existe mais n'est pas suivi afin de produire son vrai diff.
    if let Some(r) = &rel {
        let abs = real.join(r);
        let tracked = git(&real, &["ls-files", "--error-unmatch", "--", r], &[])?
            .status
            .success();
        if !tracked && abs.is_file() {
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
            let chunk = String::from_utf8_lossy(&out.stdout);
            if !chunk.is_empty() {
                text.push_str(&chunk);
                return Ok(text);
            }
        }
    }
    // untracked
    let st = status(real.to_string_lossy().as_ref())?;
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

pub fn diff_staged(root: &str, file_path: Option<&str>) -> Result<String> {
    let project = confined_root(root)?;
    let top = git_ok(&project, &["rev-parse", "--show-toplevel"])
        .map_err(|_| msg(format!("repo git introuvable: {}", project.display())))?;
    let real = std::fs::canonicalize(top.trim())?;
    if !project.starts_with(&real) {
        return Err(msg("projet hors repo git"));
    }
    let project_prefix = project
        .strip_prefix(&real)
        .unwrap_or(Path::new(""))
        .to_string_lossy()
        .replace('\\', "/");
    let rel = match file_path {
        Some(path) => {
            let within_project = assert_relative(&project, path)?;
            Some(if project_prefix.is_empty() {
                within_project
            } else {
                format!("{project_prefix}/{within_project}")
            })
        }
        None if !project_prefix.is_empty() => Some(project_prefix),
        None => None,
    };
    let mut args = vec![
        "diff".to_string(),
        "--cached".into(),
        "--no-ext-diff".into(),
        "--no-color".into(),
        "--binary".into(),
        "--".into(),
    ];
    if let Some(rel) = rel {
        args.push(rel);
    }
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    git_ok(&real, &refs)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffContents {
    pub before: String,
    pub after: String,
    pub binary: bool,
}

fn git_object(root: &Path, spec: &str) -> Vec<u8> {
    git(root, &["show", spec], &[])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| output.stdout)
        .unwrap_or_default()
}

fn decode_diff_content(bytes: Vec<u8>) -> (String, bool) {
    if bytes.contains(&0) {
        (String::new(), true)
    } else {
        (String::from_utf8_lossy(&bytes).into_owned(), false)
    }
}

/// Exact before/after documents used by the shared CodeMirror merge view.
pub fn diff_contents(
    root: &str,
    file_path: &str,
    scope: &str,
    base: Option<&str>,
) -> Result<DiffContents> {
    let project = confined_root(root)?;
    let top = git_ok(&project, &["rev-parse", "--show-toplevel"])
        .map_err(|_| msg(format!("repo git introuvable: {}", project.display())))?;
    let real = std::fs::canonicalize(top.trim())?;
    if !project.starts_with(&real) {
        return Err(msg("projet hors repo git"));
    }
    let within_project = assert_relative(&project, file_path)?;
    let prefix = project
        .strip_prefix(&real)
        .unwrap_or(Path::new(""))
        .to_string_lossy()
        .replace('\\', "/");
    let rel = if prefix.is_empty() {
        within_project
    } else {
        format!("{prefix}/{within_project}")
    };
    if let Some(sha) = base {
        if sha.len() < 4 || sha.len() > 64 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(msg("sha invalide"));
        }
        let commit = format!("{sha}^{{commit}}");
        if !git(&real, &["cat-file", "-e", &commit], &[])?
            .status
            .success()
        {
            return Err(msg("sha introuvable"));
        }
    }
    let before_bytes = if let Some(sha) = base {
        git_object(&real, &format!("{sha}:{rel}"))
    } else if has_head(&real) {
        git_object(&real, &format!("HEAD:{rel}"))
    } else {
        Vec::new()
    };
    let after_bytes = if scope == "staged" {
        git_object(&real, &format!(":{rel}"))
    } else {
        std::fs::read(real.join(&rel)).unwrap_or_default()
    };
    let (before, before_binary) = decode_diff_content(before_bytes);
    let (after, after_binary) = decode_diff_content(after_bytes);
    Ok(DiffContents {
        before,
        after,
        binary: before_binary || after_binary,
    })
}

fn scoped_paths(root: &str, file_paths: &[String]) -> Result<(PathBuf, Vec<String>)> {
    let project = confined_root(root)?;
    let top = git_ok(&project, &["rev-parse", "--show-toplevel"])
        .map_err(|_| msg(format!("repo git introuvable: {}", project.display())))?;
    let real = std::fs::canonicalize(top.trim())?;
    if !project.starts_with(&real) {
        return Err(msg("projet hors repo git"));
    }
    let prefix = project
        .strip_prefix(&real)
        .unwrap_or(Path::new(""))
        .to_string_lossy()
        .replace('\\', "/");
    let paths = file_paths
        .iter()
        .map(|path| {
            let rel = assert_relative(&project, path)?;
            Ok(if prefix.is_empty() {
                rel
            } else {
                format!("{prefix}/{rel}")
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok((real, paths))
}

pub fn stage_files(root: &str, file_paths: &[String]) -> Result<()> {
    if file_paths.is_empty() {
        return Ok(());
    }
    let (real, paths) = scoped_paths(root, file_paths)?;
    let mut args = vec!["add".to_string(), "--".into()];
    args.extend(paths);
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    git_ok(&real, &refs)?;
    Ok(())
}

pub fn unstage_files(root: &str, file_paths: &[String]) -> Result<()> {
    if file_paths.is_empty() {
        return Ok(());
    }
    let (real, paths) = scoped_paths(root, file_paths)?;
    let mut args = if has_head(&real) {
        vec!["restore".to_string(), "--staged".into(), "--".into()]
    } else {
        vec![
            "rm".to_string(),
            "--cached".into(),
            "--ignore-unmatch".into(),
            "--".into(),
        ]
    };
    args.extend(paths);
    let refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    git_ok(&real, &refs)?;
    Ok(())
}

pub fn stage_file(root: &str, file_path: &str) -> Result<()> {
    stage_files(root, &[file_path.to_string()])
}

pub fn unstage_file(root: &str, file_path: &str) -> Result<()> {
    unstage_files(root, &[file_path.to_string()])
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
    let Some(files) = files else {
        return Err(msg(
            "sélection explicite requise : indexe les fichiers à committer",
        ));
    };
    if !files.is_empty() {
        let mut args = vec!["add".to_string(), "--".into()];
        for f in files {
            args.push(assert_relative(&real, f)?);
        }
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        git_ok(&real, &refs)?;
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

/// Arbre git du worktree COMPLET (untracked inclus) via un index temporaire —
/// même séquence que le snapshot de début de tour (read-tree HEAD puis add -A),
/// pour que deux arbres pris avant/après un tour soient comparables.
fn worktree_tree(real: &std::path::Path) -> Result<String> {
    let dir = tempfile::tempdir().map_err(|e| msg(e.to_string()))?;
    let index = dir.path().join("index");
    let env = [
        ("GIT_INDEX_FILE", index.to_str().unwrap_or("")),
        ("GIT_AUTHOR_NAME", "Atelier"),
        ("GIT_AUTHOR_EMAIL", "atelier@example.invalid"),
        ("GIT_COMMITTER_NAME", "Atelier"),
        ("GIT_COMMITTER_EMAIL", "atelier@example.invalid"),
    ];
    if has_head(real) {
        let out = git(real, &["read-tree", "HEAD"], &env)?;
        if !out.status.success() {
            return Err(msg("read-tree HEAD failed"));
        }
    }
    let out = git(real, &["add", "-A"], &env)?;
    if !out.status.success() {
        return Err(msg("snapshot add failed"));
    }
    let tree_out = git(real, &["write-tree"], &env)?;
    if !tree_out.status.success() {
        return Err(msg("write-tree failed"));
    }
    Ok(String::from_utf8_lossy(&tree_out.stdout).trim().to_string())
}

pub fn snapshot(root: &str) -> Result<String> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let env = [
        ("GIT_AUTHOR_NAME", "Atelier"),
        ("GIT_AUTHOR_EMAIL", "atelier@example.invalid"),
        ("GIT_COMMITTER_NAME", "Atelier"),
        ("GIT_COMMITTER_EMAIL", "atelier@example.invalid"),
    ];
    let tree = worktree_tree(&real)?;
    let mut args = vec![
        "commit-tree".to_string(),
        tree,
        "-m".into(),
        "atelier snapshot".into(),
    ];
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

pub fn changed_since(root: &str, sha: &str) -> Result<Vec<String>> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if sha.len() < 4 || sha.len() > 64 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(msg("sha invalide"));
    }
    let commit_ref = format!("{sha}^{{commit}}");
    let exists = git(&real, &["cat-file", "-e", &commit_ref], &[])?;
    if !exists.status.success() {
        return Err(msg("snapshot inconnu"));
    }
    // Comparer l'ARBRE du snapshot à l'arbre ACTUEL du worktree (untracked
    // inclus des deux côtés) : seuls les fichiers réellement changés PENDANT
    // le tour ressortent. L'ancien `git diff <sha>` + ajout de tous les
    // untracked comptait les untracked PRÉEXISTANTS à chaque tour (carte
    // « N files modified » mensongère sur un repo sale, vue le 2026-07-16).
    let now_tree = worktree_tree(&real)?;
    let snap_tree = format!("{sha}^{{tree}}");
    let out = git(
        &real,
        &["diff-tree", "-r", "--name-only", &snap_tree, &now_tree],
        &[],
    )?;
    if !out.status.success() {
        return Err(msg("diff snapshot impossible"));
    }
    let mut changed = String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    changed.sort();
    changed.dedup();
    Ok(changed)
}

pub fn restore(root: &str, sha: &str, paths: Option<&[String]>) -> Result<()> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if !sha.chars().all(|c| c.is_ascii_hexdigit()) || sha.len() < 4 {
        return Err(msg("sha invalide"));
    }
    let scoped: Option<Vec<String>> = match paths {
        Some(list) if !list.is_empty() => Some(
            list.iter()
                .map(|p| assert_relative(&real, p))
                .collect::<Result<Vec<_>>>()?,
        ),
        _ => None,
    };
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
    let snap_out = git(
        &real,
        &["ls-tree", "-r", "--name-only", "-z", &tree_ref],
        &env,
    )?;
    let snap_paths: std::collections::HashSet<_> = String::from_utf8_lossy(&snap_out.stdout)
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    if let Some(targets) = scoped {
        // Restauration CIBLÉE (annulation d'un tour : fichiers du checkpoint) —
        // les créations d'autres sessions ailleurs dans le dépôt ne bloquent
        // plus l'annulation. Fichiers créés PAR le tour (absents du snapshot) :
        // laissés en place, jamais supprimés (même politique que le mode complet).
        let mut keep: Vec<String> = targets
            .into_iter()
            .filter(|p| snap_paths.contains(p))
            .collect();
        keep.sort();
        keep.dedup();
        let out = git(&real, &["read-tree", &tree_ref], &env)?;
        if !out.status.success() {
            return Err(msg("read-tree failed"));
        }
        for chunk in keep.chunks(50) {
            let mut args: Vec<&str> = vec!["checkout-index", "-f", "--"];
            args.extend(chunk.iter().map(String::as_str));
            let out = git(&real, &args, &env)?;
            if !out.status.success() {
                return Err(msg("checkout-index failed"));
            }
        }
        return Ok(());
    }
    let now_out = git(
        &real,
        &[
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
        ],
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
        let shown = new_paths
            .iter()
            .take(10)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
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
    fn changed_since_includes_tracked_and_new_untracked_paths() {
        let dir = init_repo();
        let sha = snapshot(dir.path().to_str().unwrap()).unwrap();
        std::fs::write(dir.path().join("a.txt"), b"changed").unwrap();
        std::fs::write(dir.path().join("new.txt"), b"new").unwrap();
        assert_eq!(
            changed_since(dir.path().to_str().unwrap(), &sha).unwrap(),
            vec!["a.txt".to_string(), "new.txt".to_string()],
        );
    }

    /// Un untracked présent AVANT le snapshot ne doit plus compter comme
    /// « modifié par le tour » (carte gitops mensongère, 2026-07-16) — mais
    /// une modification réelle de ce même fichier pendant le tour, si.
    #[test]
    fn changed_since_ignores_preexisting_untracked() {
        let dir = init_repo();
        std::fs::write(dir.path().join("deja_la.txt"), b"untracked avant tour").unwrap();
        let sha = snapshot(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(
            changed_since(dir.path().to_str().unwrap(), &sha).unwrap(),
            Vec::<String>::new(),
        );
        std::fs::write(dir.path().join("deja_la.txt"), b"modifie pendant le tour").unwrap();
        assert_eq!(
            changed_since(dir.path().to_str().unwrap(), &sha).unwrap(),
            vec!["deja_la.txt".to_string()],
        );
    }

    #[test]
    fn restore_scoped_ignores_foreign_creations_and_keeps_turn_files() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("other.txt"), b"other snapshot").unwrap();
        let sha = snapshot(root).unwrap();
        std::fs::write(dir.path().join("a.txt"), b"turn change").unwrap();
        std::fs::write(dir.path().join("created-by-turn.txt"), b"created").unwrap();
        std::fs::write(dir.path().join("appeared.txt"), b"keep me").unwrap();
        std::fs::write(dir.path().join("other.txt"), b"other change").unwrap();
        let scope = vec!["a.txt".to_string(), "created-by-turn.txt".to_string()];
        restore(root, &sha, Some(&scope)).unwrap();
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"hello");
        assert_eq!(std::fs::read(dir.path().join("created-by-turn.txt")).unwrap(), b"created");
        assert_eq!(std::fs::read(dir.path().join("appeared.txt")).unwrap(), b"keep me");
        assert_eq!(std::fs::read(dir.path().join("other.txt")).unwrap(), b"other change");
    }

    #[test]
    fn restore_full_still_refuses_on_new_paths() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        let sha = snapshot(root).unwrap();
        std::fs::write(dir.path().join("appeared.txt"), b"keep me").unwrap();
        let err = restore(root, &sha, None).unwrap_err().to_string();
        assert!(err.contains("refus"), "{err}");
        assert_eq!(std::fs::read(dir.path().join("appeared.txt")).unwrap(), b"keep me");
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
    fn lists_and_switches_local_branches_only_when_clean() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        git_ok(dir.path(), &["branch", "topic"]).unwrap();
        let initial = status(root).unwrap();
        let original = initial.branch.clone().unwrap();
        assert!(initial.branches.contains(&"topic".to_string()));

        assert_eq!(switch_branch(root, "topic").unwrap(), "topic");
        assert_eq!(status(root).unwrap().branch.as_deref(), Some("topic"));

        std::fs::write(dir.path().join("a.txt"), b"dirty").unwrap();
        let error = switch_branch(root, &original).unwrap_err().to_string();
        assert!(
            error.contains("arbre de travail doit être propre"),
            "{error}"
        );
        assert_eq!(status(root).unwrap().branch.as_deref(), Some("topic"));
    }

    #[test]
    fn creates_and_deletes_only_merged_inactive_branches() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"dirty but preserved").unwrap();

        assert_eq!(create_branch(root, "figures-2026").unwrap(), "figures-2026");
        assert_eq!(status(root).unwrap().branch.as_deref(), Some("figures-2026"));
        assert_eq!(
            std::fs::read(dir.path().join("a.txt")).unwrap(),
            b"dirty but preserved"
        );
        assert!(delete_branch(root, "figures-2026")
            .unwrap_err()
            .to_string()
            .contains("branche active"));

        git_ok(dir.path(), &["restore", "--", "a.txt"]).unwrap();
        switch_branch(root, "main").unwrap();
        assert_eq!(delete_branch(root, "figures-2026").unwrap(), "figures-2026");
        assert_eq!(status(root).unwrap().branches, vec!["main"]);
    }

    #[test]
    fn merges_selected_branch_into_current_branch_only_when_clean() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        git_ok(dir.path(), &["switch", "-c", "topic"]).unwrap();
        std::fs::write(dir.path().join("merged.txt"), b"from topic").unwrap();
        git_ok(dir.path(), &["add", "merged.txt"]).unwrap();
        git_ok(dir.path(), &["commit", "-m", "topic change"]).unwrap();
        git_ok(dir.path(), &["switch", "main"]).unwrap();

        assert_eq!(merge_branch(root, "topic").unwrap(), "topic");
        assert_eq!(status(root).unwrap().branch.as_deref(), Some("main"));
        assert_eq!(
            std::fs::read(dir.path().join("merged.txt")).unwrap(),
            b"from topic"
        );

        std::fs::write(dir.path().join("a.txt"), b"dirty").unwrap();
        assert!(merge_branch(root, "topic")
            .unwrap_err()
            .to_string()
            .contains("arbre de travail doit être propre"));
    }

    #[test]
    fn diff_accepts_project_nested_inside_repo() {
        let dir = init_repo();
        let nested = dir.path().join("manuscript_ch1");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(nested.join("figure.html"), b"<h1>figure</h1>").unwrap();
        let d = diff(nested.to_str().unwrap(), Some("figure.html")).unwrap();
        assert!(d.contains("figure.html"));
        assert!(d.contains("<h1>figure</h1>"));
    }

    #[test]
    fn path_escape_rejected() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        assert!(stage_file(root, "../outside").is_err());
    }

    #[test]
    fn staged_diff_excludes_unstaged_changes() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"staged version").unwrap();
        stage_file(root, "a.txt").unwrap();
        std::fs::write(dir.path().join("a.txt"), b"unstaged version").unwrap();
        let staged = diff_staged(root, Some("a.txt")).unwrap();
        assert!(staged.contains("staged version"));
        assert!(!staged.contains("unstaged version"));
    }

    #[test]
    fn diff_contents_distinguishes_head_index_and_worktree() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"staged version").unwrap();
        stage_file(root, "a.txt").unwrap();
        std::fs::write(dir.path().join("a.txt"), b"working version").unwrap();
        let staged = diff_contents(root, "a.txt", "staged", None).unwrap();
        assert_eq!(staged.before, "hello");
        assert_eq!(staged.after, "staged version");
        let working = diff_contents(root, "a.txt", "changes", None).unwrap();
        assert_eq!(working.before, "hello");
        assert_eq!(working.after, "working version");
        assert!(!working.binary);
    }

    #[test]
    fn empty_file_list_commits_only_the_existing_index() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"staged version").unwrap();
        stage_file(root, "a.txt").unwrap();
        std::fs::write(dir.path().join("b.txt"), b"leave me untracked").unwrap();
        commit(root, "test staged only", Some(&[])).unwrap();
        let st = status(root).unwrap();
        assert!(st
            .files
            .iter()
            .any(|file| file.path == "b.txt" && file.status == "?"));
        assert!(!st.files.iter().any(|file| file.path == "a.txt"));
    }

    #[test]
    fn missing_file_list_refuses_without_staging_everything() {
        let dir = init_repo();
        let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"changed").unwrap();
        std::fs::write(dir.path().join("b.txt"), b"untracked").unwrap();
        let error = commit(root, "must fail", None).unwrap_err().to_string();
        assert!(error.contains("sélection explicite"), "{error}");
        assert!(git_ok(dir.path(), &["diff", "--cached", "--name-only"])
            .unwrap()
            .trim()
            .is_empty());
    }

    #[test]
    fn log_and_details_expose_commit_diff() {
        let dir = init_repo(); let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"second").unwrap();
        git_ok(dir.path(), &["add", "."]).unwrap(); git_ok(dir.path(), &["commit", "-m", "second commit"]).unwrap();
        let page = log(root, false, 0, 1, "").unwrap();
        assert_eq!(page.commits.len(), 1); assert!(page.has_more);
        let details = commit_details(root, &page.commits[0].sha).unwrap();
        assert_eq!(details.commit.subject, "second commit"); assert!(details.diff.contains("+second"));
        let contents = commit_file_contents(root, &page.commits[0].sha, "a.txt", None).unwrap();
        assert_eq!(contents.before, "hello"); assert_eq!(contents.after, "second"); assert!(!contents.binary);
    }

    #[test]
    fn branch_from_commit_preserves_the_original_branch_tip() {
        let dir = init_repo(); let root = dir.path().to_str().unwrap(); let old = head_sha(dir.path()).unwrap(); let original = status(root).unwrap().branch.unwrap();
        std::fs::write(dir.path().join("a.txt"), b"new").unwrap(); git_ok(dir.path(), &["add", "."]).unwrap(); git_ok(dir.path(), &["commit", "-m", "new"]).unwrap();
        let main_tip = head_sha(dir.path()).unwrap(); create_branch_at(root, "inspect-old", &old).unwrap();
        assert_eq!(status(root).unwrap().branch.as_deref(), Some("inspect-old"));
        assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"hello");
        assert_eq!(git_ok(dir.path(), &["rev-parse", &original]).unwrap().trim(), main_tip);
    }

    #[test]
    fn published_commit_requires_revert_instead_of_undo() {
        let dir = init_repo(); let root = dir.path().to_str().unwrap();
        std::fs::write(dir.path().join("a.txt"), b"published").unwrap(); git_ok(dir.path(), &["add", "."]).unwrap(); git_ok(dir.path(), &["commit", "-m", "published"]).unwrap();
        let published = head_sha(dir.path()).unwrap(); let original = status(root).unwrap().branch.unwrap(); git_ok(dir.path(), &["branch", "published-tip", &published]).unwrap(); git_ok(dir.path(), &["branch", "--set-upstream-to=published-tip", &original]).unwrap();
        assert!(undo_last_commit(root, Some(&published)).unwrap_err().to_string().contains("déjà publié"));
        let reverted = revert_commit(root, &published, Some(&published)).unwrap();
        assert_ne!(reverted, published); assert_eq!(std::fs::read(dir.path().join("a.txt")).unwrap(), b"hello");
    }

    #[test]
    fn reset_creates_safety_ref() {
        let dir = init_repo(); let root = dir.path().to_str().unwrap(); let target = head_sha(dir.path()).unwrap();
        std::fs::write(dir.path().join("a.txt"), b"later").unwrap(); git_ok(dir.path(), &["add", "."]).unwrap(); git_ok(dir.path(), &["commit", "-m", "later"]).unwrap();
        let head = head_sha(dir.path()).unwrap(); let (_, safety) = reset_to_commit(root, &target, "hard", Some(&head)).unwrap();
        assert_eq!(git_ok(dir.path(), &["rev-parse", &safety]).unwrap().trim(), head);
    }

    #[test]
    fn reset_refuses_to_cross_upstream_or_a_stale_head() {
        let dir = init_repo(); let root = dir.path().to_str().unwrap(); let initial = head_sha(dir.path()).unwrap();
        std::fs::write(dir.path().join("a.txt"), b"published").unwrap(); git_ok(dir.path(), &["add", "."]).unwrap(); git_ok(dir.path(), &["commit", "-m", "published"]).unwrap();
        let published = head_sha(dir.path()).unwrap(); let original = status(root).unwrap().branch.unwrap(); git_ok(dir.path(), &["branch", "published-tip", &published]).unwrap(); git_ok(dir.path(), &["branch", "--set-upstream-to=published-tip", &original]).unwrap();
        std::fs::write(dir.path().join("a.txt"), b"local").unwrap(); git_ok(dir.path(), &["add", "."]).unwrap(); git_ok(dir.path(), &["commit", "-m", "local"]).unwrap(); let head = head_sha(dir.path()).unwrap();
        assert!(reset_to_commit(root, &initial, "hard", Some(&head)).unwrap_err().to_string().contains("avant le dernier commit publié"));
        assert!(reset_to_commit(root, &published, "mixed", Some(&"f".repeat(40))).unwrap_err().to_string().contains("HEAD a changé"));
        assert_eq!(head_sha(dir.path()).unwrap(), head);
    }
}
