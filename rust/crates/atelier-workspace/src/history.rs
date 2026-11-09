//! Historique du projet (2026-11-09, variante A) : les briques Git du fil du
//! temps — versions nommées, restaurations d'un fichier, commits avec leurs
//! ±, lecture d'un fichier à un instant donné et comparaison de deux arbres.
//!
//! Tout vit dans le dépôt du projet, sous des refs privées qui ne touchent ni
//! les branches ni l'index de l'utilisateur :
//! - `refs/atelier/versions/<ms>` : une version nommée (« Envoyé à
//!   Christophe »), commit de l'arbre COMPLET du worktree (non suivis inclus),
//!   message = nom ;
//! - `refs/atelier/restores/<ms>` : une restauration faite depuis
//!   l'historique, commit de l'arbre APRÈS l'écriture dont le parent est
//!   l'arbre AVANT ; le message nomme le fichier. Une restauration est donc
//!   toujours réversible depuis le même historique.
//!
//! Les arbres sont pris comme le snapshot de début de tour
//! ([`crate::snapshot`]) pour rester comparables aux points de reprise.

use crate::git::{
    assert_relative, confined_root, ensure_repo, git, git_ok, git_object, has_head, msg, valid_sha,
    worktree_tree, ChangedStat, GitError,
};
use serde::Serialize;
use std::path::Path;

type Result<T> = std::result::Result<T, GitError>;

const ATELIER_ENV: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "Atelier"),
    ("GIT_AUTHOR_EMAIL", "atelier@example.invalid"),
    ("GIT_COMMITTER_NAME", "Atelier"),
    ("GIT_COMMITTER_EMAIL", "atelier@example.invalid"),
];
const VERSIONS_REF: &str = "refs/atelier/versions";
const RESTORES_REF: &str = "refs/atelier/restores";
/// Au-delà, le texte n'est pas rendu au diff (un PDF compilé suivi par
/// erreur, un jeu de données) : l'interface dit « trop volumineux ».
pub const HISTORY_TEXT_LIMIT: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFileStat {
    pub path: String,
    pub add: Option<i64>,
    pub del: Option<i64>,
}

impl From<ChangedStat> for HistoryFileStat {
    fn from(stat: ChangedStat) -> Self {
        Self { path: stat.path, add: stat.add, del: stat.del }
    }
}

/// Une version nommée. `previous` = la version nommée précédente (ou le
/// commit parent pour la toute première), base de ses fichiers changés.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryVersion {
    pub sha: String,
    pub ts: i64,
    pub name: String,
    pub previous: Option<String>,
    pub files: Vec<HistoryFileStat>,
}

/// Une restauration faite depuis l'historique : `before` = commit de l'arbre
/// avant l'écriture, `sha` = commit de l'arbre après.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRestore {
    pub sha: String,
    pub before: String,
    pub ts: i64,
    pub path: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryCommit {
    pub sha: String,
    pub short_sha: String,
    pub parent: Option<String>,
    pub ts: i64,
    pub author: String,
    pub subject: String,
    pub files: Vec<HistoryFileStat>,
}

/// Contenu d'un fichier à un instant : `None` = absent à cet instant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HistoryText {
    Missing,
    Binary,
    TooLarge,
    Text(String),
}

/// Dossier racine du dépôt (ou le projet lui-même hors Git) et préfixe du
/// projet dans le dépôt (`""` ou `"these/"`). Tous les chemins de
/// l'historique sont relatifs à la racine du DÉPÔT, comme ceux que rend Git.
pub fn history_base(root: &str) -> Result<(std::path::PathBuf, String)> {
    let real = confined_root(root)?;
    if !crate::git::is_repo(&real.to_string_lossy()) {
        return Ok((real, String::new()));
    }
    let top = git_ok(&real, &["rev-parse", "--show-toplevel"])?.trim().to_string();
    let prefix = git_ok(&real, &["rev-parse", "--show-prefix"])?.trim().to_string();
    let top = if top.is_empty() { real } else { std::fs::canonicalize(top)? };
    Ok((top, prefix))
}

fn repo_top(root: &str) -> Result<std::path::PathBuf> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    Ok(history_base(root)?.0)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn parse_numstat(output: &str) -> Vec<HistoryFileStat> {
    let mut files: Vec<HistoryFileStat> = output
        .lines()
        .filter_map(|line| {
            let mut cols = line.splitn(3, '\t');
            let add = cols.next()?.trim();
            let del = cols.next()?.trim();
            let path = cols.next()?.trim();
            (!path.is_empty()).then(|| HistoryFileStat {
                path: path.to_string(),
                add: add.parse().ok(),
                del: del.parse().ok(),
            })
        })
        .collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files.dedup_by(|a, b| a.path == b.path);
    files
}

/// `git diff-tree --numstat` entre deux arbres quelconques (commits ou
/// arbres) ; `from = None` compare à l'arbre vide (première version).
fn tree_stats(real: &Path, from: Option<&str>, to: &str) -> Result<Vec<HistoryFileStat>> {
    let to_tree = format!("{to}^{{tree}}");
    let from_tree = match from {
        Some(from) => format!("{from}^{{tree}}"),
        // Arbre vide, connu de tous les dépôts Git.
        None => "4b825dc642cb6eb9a060e54bf8d69288fbee4904".to_string(),
    };
    let out = git(real, &["diff-tree", "-r", "--numstat", &from_tree, &to_tree], &[])?;
    if !out.status.success() {
        return Err(msg("comparaison impossible"));
    }
    Ok(parse_numstat(&String::from_utf8_lossy(&out.stdout)))
}

fn object_exists(real: &Path, spec: &str) -> bool {
    git(real, &["cat-file", "-e", spec], &[])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn commit_tree(real: &Path, tree: &str, parent: Option<&str>, message: &str) -> Result<String> {
    let mut args = vec!["commit-tree", tree, "-m", message];
    if let Some(parent) = parent {
        args.push("-p");
        args.push(parent);
    }
    let out = git(real, &args, &ATELIER_ENV)?;
    if !out.status.success() {
        return Err(msg("commit-tree failed"));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn head(real: &Path) -> Option<String> {
    has_head(real)
        .then(|| git_ok(real, &["rev-parse", "HEAD"]).ok())
        .flatten()
        .map(|s| s.trim().to_string())
}

fn update_ref(real: &Path, name: &str, sha: &str) -> Result<()> {
    let out = git(real, &["update-ref", name, sha], &ATELIER_ENV)?;
    if out.status.success() { Ok(()) } else { Err(msg("update-ref failed")) }
}

/// Refs privées sous `prefix`, triées de la plus récente à la plus ancienne
/// par l'horodatage en millisecondes porté par leur nom.
fn private_refs(real: &Path, prefix: &str) -> Result<Vec<(i64, String, String)>> {
    let out = git_ok(
        real,
        &["for-each-ref", "--format=%(refname)%1f%(objectname)%1f%(contents)%1e", prefix],
    )?;
    let mut refs: Vec<(i64, String, String)> = out
        .split('\x1e')
        .filter_map(|record| {
            let mut cols = record.trim_start_matches('\n').splitn(3, '\x1f');
            let name = cols.next()?;
            let sha = cols.next()?.trim();
            let body = cols.next().unwrap_or("").trim().to_string();
            let ts = name.rsplit('/').next()?.parse::<i64>().ok()?;
            valid_sha(sha).then(|| (ts, sha.to_string(), body))
        })
        .collect();
    refs.sort_by_key(|b| std::cmp::Reverse(b.0));
    Ok(refs)
}

fn ref_name_for(real: &Path, prefix: &str) -> String {
    // Deux enregistrements dans la même milliseconde ne s'écrasent pas.
    let mut ts = now_ms();
    loop {
        let name = format!("{prefix}/{ts}");
        if !object_exists(real, &name) {
            return name;
        }
        ts += 1;
    }
}

/// Versions nommées du projet, la plus récente en tête, avec les fichiers
/// changés depuis la précédente.
pub fn history_versions(root: &str) -> Result<Vec<HistoryVersion>> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let refs = private_refs(&real, VERSIONS_REF)?;
    let mut versions = Vec::with_capacity(refs.len());
    for (index, (ts, sha, body)) in refs.iter().enumerate() {
        // Précédente = la version nommée plus ancienne ; pour la première, le
        // commit parent (HEAD au moment de l'enregistrement).
        let previous = refs.get(index + 1).map(|(_, sha, _)| sha.clone()).or_else(|| {
            git_ok(&real, &["rev-parse", "--verify", "--quiet", &format!("{sha}^")])
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| valid_sha(s))
        });
        let files = tree_stats(&real, previous.as_deref(), sha).unwrap_or_default();
        versions.push(HistoryVersion {
            sha: sha.clone(),
            ts: *ts,
            name: body.lines().next().unwrap_or("").trim().to_string(),
            previous,
            files,
        });
    }
    Ok(versions)
}

/// Pose une version nommée de tout le projet (worktree complet).
pub fn save_history_version(root: &str, name: &str) -> Result<HistoryVersion> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    let name: String = name.trim().chars().filter(|c| !c.is_control()).take(120).collect();
    if name.is_empty() {
        return Err(msg("nom de version requis"));
    }
    let tree = worktree_tree(&real)?;
    let parent = head(&real);
    let sha = commit_tree(&real, &tree, parent.as_deref(), &name)?;
    let refname = ref_name_for(&real, VERSIONS_REF);
    update_ref(&real, &refname, &sha)?;
    history_versions(root)?
        .into_iter()
        .find(|v| v.sha == sha)
        .ok_or_else(|| msg("version introuvable après enregistrement"))
}

/// Retire une version nommée (sa ref seulement : l'objet reste jusqu'au gc).
pub fn delete_history_version(root: &str, sha: &str) -> Result<()> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if !valid_sha(sha) {
        return Err(msg("sha invalide"));
    }
    let refs = private_refs(&real, VERSIONS_REF)?;
    let Some((ts, _, _)) = refs.iter().find(|(_, s, _)| s == sha) else {
        return Err(msg("version introuvable"));
    };
    let name = format!("{VERSIONS_REF}/{ts}");
    let out = git(&real, &["update-ref", "-d", &name, sha], &ATELIER_ENV)?;
    if out.status.success() { Ok(()) } else { Err(msg("suppression impossible")) }
}

/// Restaurations faites depuis l'historique, la plus récente en tête.
pub fn history_restores(root: &str) -> Result<Vec<HistoryRestore>> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    Ok(private_refs(&real, RESTORES_REF)?
        .into_iter()
        .filter_map(|(ts, sha, body)| {
            let mut lines = body.lines();
            let path = lines.next()?.trim().to_string();
            let label = lines.map(str::trim).find(|l| !l.is_empty()).unwrap_or("").to_string();
            let before = git_ok(&real, &["rev-parse", "--verify", "--quiet", &format!("{sha}^")])
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| valid_sha(s))?;
            Some(HistoryRestore { sha, before, ts, path, label })
        })
        .collect())
}

/// Réécrit `path` avec `text`, en posant avant et après un arbre du projet :
/// la restauration apparaît dans l'historique et se défait de la même façon.
pub fn restore_history_text(root: &str, path: &str, text: &str, label: &str) -> Result<HistoryRestore> {
    let real = repo_top(root)?;
    let rel = assert_relative(&real, path)?;
    let abs = real.join(&rel);
    if abs.is_dir() {
        return Err(msg("chemin de dossier"));
    }
    let parent = head(&real);
    let before_tree = worktree_tree(&real)?;
    let before = commit_tree(&real, &before_tree, parent.as_deref(), "atelier: avant restauration")?;
    if let Some(dir) = abs.parent() {
        std::fs::create_dir_all(dir)?;
    }
    // Écriture atomique : un éditeur ouvert ne lit jamais un fichier à moitié.
    let tmp = abs.with_file_name(format!(
        ".{}.atelier-restore.{}",
        abs.file_name().and_then(|n| n.to_str()).unwrap_or("fichier"),
        std::process::id()
    ));
    std::fs::write(&tmp, text.as_bytes())?;
    if let Ok(meta) = std::fs::metadata(&abs) {
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }
    std::fs::rename(&tmp, &abs)?;
    let after_tree = worktree_tree(&real)?;
    let label: String = label.trim().chars().filter(|c| *c != '\n' && *c != '\r').take(160).collect();
    let message = format!("{rel}\n\n{label}");
    let sha = commit_tree(&real, &after_tree, Some(&before), &message)?;
    let refname = ref_name_for(&real, RESTORES_REF);
    update_ref(&real, &refname, &sha)?;
    let ts = refname.rsplit('/').next().and_then(|s| s.parse().ok()).unwrap_or_else(now_ms);
    Ok(HistoryRestore { sha, before, ts, path: rel, label })
}

/// Commits de la branche courante, du plus récent au plus ancien, avec les
/// ± de chaque fichier.
pub fn history_commits(root: &str, limit: usize) -> Result<Vec<HistoryCommit>> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if !has_head(&real) {
        return Ok(Vec::new());
    }
    let count = format!("--max-count={}", limit.clamp(1, 300));
    let out = git_ok(
        &real,
        &["log", &count, "--numstat", "--no-renames", "--format=%x1e%H%x1f%h%x1f%P%x1f%ct%x1f%an%x1f%s"],
    )?;
    Ok(out
        .split('\x1e')
        .filter_map(|record| {
            let (header, stats) = record.split_once('\n').unwrap_or((record, ""));
            let cols: Vec<&str> = header.split('\x1f').collect();
            if cols.len() < 6 || !valid_sha(cols[0]) {
                return None;
            }
            Some(HistoryCommit {
                sha: cols[0].to_string(),
                short_sha: cols[1].to_string(),
                parent: cols[2].split_whitespace().next().map(str::to_string),
                ts: cols[3].trim().parse::<i64>().unwrap_or(0) * 1000,
                author: cols[4].to_string(),
                subject: cols[5].to_string(),
                files: parse_numstat(stats),
            })
        })
        .collect())
}

/// Contenu de `path` dans l'objet `treeish` (commit, arbre, ref privée).
pub fn history_read(root: &str, treeish: &str, path: &str) -> Result<HistoryText> {
    let real = repo_top(root)?;
    if !valid_sha(treeish) {
        return Err(msg("sha invalide"));
    }
    let rel = assert_relative(&real, path)?;
    let spec = format!("{treeish}:{rel}");
    if !object_exists(&real, &spec) {
        return Ok(HistoryText::Missing);
    }
    let size = git_ok(&real, &["cat-file", "-s", &spec])?.trim().parse::<usize>().unwrap_or(0);
    if size > HISTORY_TEXT_LIMIT {
        return Ok(HistoryText::TooLarge);
    }
    Ok(decode_text(git_object(&real, &spec)?))
}

/// Contenu actuel de `path` sur le disque.
pub fn history_read_disk(root: &str, path: &str) -> Result<HistoryText> {
    let (real, _) = history_base(root)?;
    let rel = assert_relative(&real, path)?;
    let abs = real.join(rel);
    let Ok(meta) = std::fs::metadata(&abs) else {
        return Ok(HistoryText::Missing);
    };
    if !meta.is_file() {
        return Ok(HistoryText::Missing);
    }
    if meta.len() as usize > HISTORY_TEXT_LIMIT {
        return Ok(HistoryText::TooLarge);
    }
    Ok(decode_text(std::fs::read(abs)?))
}

pub fn decode_text(bytes: Vec<u8>) -> HistoryText {
    if bytes.contains(&0) {
        return HistoryText::Binary;
    }
    match String::from_utf8(bytes) {
        Ok(text) => HistoryText::Text(text),
        Err(_) => HistoryText::Binary,
    }
}

/// Vérifie qu'un objet existe encore (un arbre de fin de tour peut avoir été
/// élagué par `git gc`).
pub fn history_object_exists(root: &str, sha: &str) -> bool {
    let Ok(real) = confined_root(root) else { return false };
    valid_sha(sha) && object_exists(&real, &format!("{sha}^{{tree}}"))
}

/// Fichiers changés entre deux instants ; `to = None` = le projet maintenant.
pub fn history_compare(root: &str, from: &str, to: Option<&str>) -> Result<(Vec<HistoryFileStat>, String)> {
    let real = confined_root(root)?;
    ensure_repo(&real)?;
    if !valid_sha(from) || to.is_some_and(|to| !valid_sha(to)) {
        return Err(msg("sha invalide"));
    }
    let to = match to {
        Some(to) => to.to_string(),
        None => worktree_tree(&real)?,
    };
    Ok((tree_stats(&real, Some(from), &to)?, to))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn repo() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let run = |args: &[&str]| {
            let ok = Command::new("git").args(args).current_dir(dir.path())
                .env("GIT_AUTHOR_NAME", "T").env("GIT_AUTHOR_EMAIL", "t@t")
                .env("GIT_COMMITTER_NAME", "T").env("GIT_COMMITTER_EMAIL", "t@t")
                .status().unwrap().success();
            assert!(ok, "git {args:?}");
        };
        run(&["init", "-q"]);
        std::fs::write(dir.path().join("main.tex"), "a\nb\nc\n").unwrap();
        run(&["add", "-A"]);
        run(&["commit", "-q", "-m", "premier"]);
        dir
    }

    fn root(dir: &tempfile::TempDir) -> String {
        dir.path().to_string_lossy().to_string()
    }

    #[test]
    fn une_version_nommee_garde_le_worktree_et_ses_fichiers_changes() {
        let dir = repo();
        std::fs::write(dir.path().join("main.tex"), "a\nB\nc\nd\n").unwrap();
        std::fs::write(dir.path().join("notes.md"), "non suivi\n").unwrap();
        let v = save_history_version(&root(&dir), "  Envoyé à Christophe \n").unwrap();
        assert_eq!(v.name, "Envoyé à Christophe");
        let paths: Vec<_> = v.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["main.tex", "notes.md"]);
        assert_eq!(history_read(&root(&dir), &v.sha, "notes.md").unwrap(), HistoryText::Text("non suivi\n".into()));
        // La branche et l'index de l'utilisateur ne bougent pas.
        let status = Command::new("git").args(["status", "--porcelain"]).current_dir(dir.path()).output().unwrap();
        assert!(String::from_utf8_lossy(&status.stdout).contains("?? notes.md"));

        std::fs::write(dir.path().join("main.tex"), "z\n").unwrap();
        let second = save_history_version(&root(&dir), "Deux").unwrap();
        assert_eq!(second.previous.as_deref(), Some(v.sha.as_str()));
        assert_eq!(second.files.len(), 1);
        let all = history_versions(&root(&dir)).unwrap();
        assert_eq!(all.iter().map(|v| v.name.as_str()).collect::<Vec<_>>(), ["Deux", "Envoyé à Christophe"]);

        delete_history_version(&root(&dir), &second.sha).unwrap();
        assert_eq!(history_versions(&root(&dir)).unwrap().len(), 1);
        assert!(save_history_version(&root(&dir), "   ").is_err());
    }

    #[test]
    fn une_restauration_ecrit_le_fichier_et_se_defait() {
        let dir = repo();
        let r = restore_history_text(&root(&dir), "main.tex", "ancien\n", "Tour de Codex, 14 h 32").unwrap();
        assert_eq!(std::fs::read_to_string(dir.path().join("main.tex")).unwrap(), "ancien\n");
        assert_eq!(history_read(&root(&dir), &r.before, "main.tex").unwrap(), HistoryText::Text("a\nb\nc\n".into()));
        assert_eq!(history_read(&root(&dir), &r.sha, "main.tex").unwrap(), HistoryText::Text("ancien\n".into()));
        let list = history_restores(&root(&dir)).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].path, "main.tex");
        assert_eq!(list[0].label, "Tour de Codex, 14 h 32");
        assert_eq!(list[0].before, r.before);
        assert!(restore_history_text(&root(&dir), "../dehors.txt", "x", "").is_err());
    }

    #[test]
    fn commits_avec_leurs_plus_et_moins() {
        let dir = repo();
        let commits = history_commits(&root(&dir), 10).unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].subject, "premier");
        assert_eq!(commits[0].files[0].path, "main.tex");
        assert_eq!(commits[0].files[0].add, Some(3));
        assert!(commits[0].ts > 0);
    }

    #[test]
    fn comparer_un_instant_au_projet_maintenant() {
        let dir = repo();
        let head = commits_head(&dir);
        std::fs::write(dir.path().join("main.tex"), "a\nc\n").unwrap();
        let (files, tree) = history_compare(&root(&dir), &head, None).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].del, Some(1));
        assert!(history_object_exists(&root(&dir), &tree));
        assert_eq!(history_read(&root(&dir), &head, "absent.tex").unwrap(), HistoryText::Missing);
        assert_eq!(history_read_disk(&root(&dir), "main.tex").unwrap(), HistoryText::Text("a\nc\n".into()));
    }

    fn commits_head(dir: &tempfile::TempDir) -> String {
        history_commits(&root(dir), 1).unwrap()[0].sha.clone()
    }
}
