//! Read-only Narval/Slurm bridge used by the desktop workspace.
//!
//! The bridge never persists SSH material and never exposes mutating commands.

use serde::Serialize;
use std::io::Read;
use std::path::{Component, Path};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const MAX_STDOUT: usize = 2 * 1024 * 1024;
const MAX_STDERR: usize = 64 * 1024;
const SSH_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_DIRECTORY_ENTRIES: usize = 500;
const MAX_TAIL_LINES: u32 = 2_000;

#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[error("{message}")]
pub struct NarvalError {
    pub code: String,
    pub message: String,
}

impl NarvalError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct NarvalProfile {
    pub id: String,
    pub host: String,
    pub gateway: Option<String>,
    pub roots: Vec<String>,
}

impl NarvalProfile {
    pub fn from_env(id: &str) -> Result<Self, NarvalError> {
        if id != "narval" {
            return Err(NarvalError::new("invalid_profile", "profil Narval inconnu"));
        }
        let host = std::env::var("ATELIER_NARVAL_HOST").unwrap_or_else(|_| "narval-vpn".into());
        if !valid_ssh_alias(&host) {
            return Err(NarvalError::new(
                "invalid_profile",
                "alias SSH Narval invalide",
            ));
        }
        let gateway = std::env::var("ATELIER_NARVAL_GATEWAY").unwrap_or_else(|_| "nas".into());
        let gateway = if gateway.trim().is_empty() {
            None
        } else {
            Some(gateway)
        };
        if gateway
            .as_deref()
            .is_some_and(|value| !valid_ssh_alias(value))
        {
            return Err(NarvalError::new(
                "invalid_profile",
                "passerelle SSH Narval invalide",
            ));
        }
        let roots = std::env::var("ATELIER_NARVAL_ROOTS")
            .unwrap_or_else(|_| "/home,/project,/scratch,/lustre06,/lustre07".into())
            .split(',')
            .map(str::trim)
            .filter(|root| root.starts_with('/'))
            .map(str::to_string)
            .collect::<Vec<_>>();
        Ok(Self {
            id: id.into(),
            host,
            gateway,
            roots,
        })
    }

    fn validate_path(&self, raw: &str) -> Result<String, NarvalError> {
        if raw.contains('\0') || !raw.starts_with('/') {
            return Err(NarvalError::new(
                "invalid_path",
                "chemin distant absolu requis",
            ));
        }
        let path = Path::new(raw);
        if path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        {
            return Err(NarvalError::new(
                "invalid_path",
                "le chemin distant ne peut pas contenir ..",
            ));
        }
        let normalized = path.to_string_lossy().trim_end_matches('/').to_string();
        let normalized = if normalized.is_empty() {
            "/".into()
        } else {
            normalized
        };
        if !self.roots.iter().any(|root| {
            normalized == *root
                || normalized.starts_with(&format!("{}/", root.trim_end_matches('/')))
        }) {
            return Err(NarvalError::new(
                "invalid_path",
                "chemin hors des racines Narval autorisées",
            ));
        }
        Ok(normalized)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NarvalStatus {
    pub profile: String,
    pub host: String,
    pub gateway: Option<String>,
    pub home: String,
    pub roots: Vec<String>,
    pub connected: bool,
    pub slurm_available: bool,
    pub observed_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified_at: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlurmJob {
    pub id: String,
    pub name: String,
    pub state: String,
    pub elapsed: String,
    pub cpus: u32,
    pub partition: String,
    pub reason: String,
    pub work_dir: String,
    pub started_at: String,
    pub ended_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NarvalSnapshot {
    pub profile: String,
    pub active: Vec<SlurmJob>,
    pub recent: Vec<SlurmJob>,
    pub observed_at_ms: u128,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlurmJobDetail {
    pub job: SlurmJob,
    pub requested_memory: String,
    pub submitted_at: String,
    pub stdout_path: String,
    pub stderr_path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTextPreview {
    pub path: String,
    pub content: String,
    pub truncated: bool,
    pub observed_at_ms: u128,
}

fn observed_at_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn valid_ssh_alias(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b'@'))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn read_bounded(mut reader: impl Read, limit: usize) -> Vec<u8> {
    let mut bytes = Vec::new();
    let _ = reader
        .by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes);
    bytes.truncate(limit);
    bytes
}

fn classify_ssh_error(stderr: &str) -> NarvalError {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("permission denied") || lower.contains("publickey") {
        NarvalError::new("auth", "authentification SSH Narval requise")
    } else if lower.contains("could not resolve")
        || lower.contains("no route")
        || lower.contains("connection refused")
    {
        NarvalError::new(
            "unavailable",
            "Narval est inaccessible depuis cette machine",
        )
    } else {
        NarvalError::new("command_failed", stderr.trim().to_string())
    }
}

fn run_ssh(profile: &NarvalProfile, remote_command: &str) -> Result<String, NarvalError> {
    let (target, command) = match &profile.gateway {
        Some(gateway) => (
            gateway.as_str(),
            format!(
                "ssh -o BatchMode=yes -o ConnectTimeout=8 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 -- {} {}",
                shell_quote(&profile.host),
                shell_quote(remote_command),
            ),
        ),
        None => (profile.host.as_str(), remote_command.to_string()),
    };
    let mut child = Command::new("ssh")
        .args([
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            "-o",
            "ServerAliveInterval=5",
            "-o",
            "ServerAliveCountMax=1",
            "--",
        ])
        .arg(target)
        .arg(command)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            NarvalError::new("unavailable", format!("impossible de lancer ssh: {error}"))
        })?;
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");
    let out_reader = thread::spawn(move || read_bounded(stdout, MAX_STDOUT));
    let err_reader = thread::spawn(move || read_bounded(stderr, MAX_STDERR));
    let deadline = Instant::now() + SSH_TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = out_reader.join();
                let _ = err_reader.join();
                return Err(NarvalError::new(
                    "timeout",
                    "Narval n'a pas répondu dans le délai imparti",
                ));
            }
            Err(error) => return Err(NarvalError::new("command_failed", error.to_string())),
        }
    };
    let stdout = String::from_utf8_lossy(&out_reader.join().unwrap_or_default()).into_owned();
    let stderr = String::from_utf8_lossy(&err_reader.join().unwrap_or_default()).into_owned();
    if status.success() {
        Ok(stdout)
    } else {
        Err(classify_ssh_error(&stderr))
    }
}

pub fn status(profile_id: &str) -> Result<NarvalStatus, NarvalError> {
    let profile = NarvalProfile::from_env(profile_id)?;
    let output = run_ssh(
        &profile,
        "printf '%s\\n' \"$HOME\"; if command -v squeue >/dev/null 2>&1; then printf 'slurm=1\\n'; else printf 'slurm=0\\n'; fi",
    )?;
    let mut lines = output.lines();
    let home = lines.next().unwrap_or("").trim().to_string();
    let slurm_available = lines.any(|line| line.trim() == "slurm=1");
    let mut roots = profile.roots.clone();
    if home.starts_with('/') && !roots.iter().any(|root| home.starts_with(root)) {
        roots.insert(0, home.clone());
    }
    Ok(NarvalStatus {
        profile: profile.id,
        host: profile.host,
        gateway: profile.gateway,
        home,
        roots,
        connected: true,
        slurm_available,
        observed_at_ms: observed_at_ms(),
    })
}

fn parse_job(fields: &[&str], recent: bool) -> Option<SlurmJob> {
    let id = fields.first()?.trim();
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    if recent {
        Some(SlurmJob {
            id: id.into(),
            name: fields.get(1).unwrap_or(&&"").trim().into(),
            state: normalize_state(fields.get(2).unwrap_or(&&"")),
            elapsed: fields.get(3).unwrap_or(&&"").trim().into(),
            cpus: fields.get(4).unwrap_or(&&"0").trim().parse().unwrap_or(0),
            partition: fields.get(5).unwrap_or(&&"").trim().into(),
            reason: String::new(),
            work_dir: fields.get(8).unwrap_or(&&"").trim().into(),
            started_at: fields.get(6).unwrap_or(&&"").trim().into(),
            ended_at: fields.get(7).unwrap_or(&&"").trim().into(),
        })
    } else {
        Some(SlurmJob {
            id: id.into(),
            name: fields.get(1).unwrap_or(&&"").trim().into(),
            state: normalize_state(fields.get(2).unwrap_or(&&"")),
            elapsed: fields.get(3).unwrap_or(&&"").trim().into(),
            cpus: fields.get(4).unwrap_or(&&"0").trim().parse().unwrap_or(0),
            partition: fields.get(5).unwrap_or(&&"").trim().into(),
            reason: fields.get(6).unwrap_or(&&"").trim().into(),
            work_dir: fields.get(7).unwrap_or(&&"").trim().into(),
            started_at: String::new(),
            ended_at: String::new(),
        })
    }
}

fn normalize_state(raw: &str) -> String {
    raw.trim()
        .split(['+', ' '])
        .next()
        .unwrap_or("")
        .to_ascii_uppercase()
}

pub fn parse_snapshot(profile: &str, output: &str) -> NarvalSnapshot {
    let (active_raw, recent_raw) = output
        .split_once("__ATELIER_RECENT__\n")
        .unwrap_or((output, ""));
    let active = active_raw
        .lines()
        .filter_map(|line| parse_job(&line.split('|').collect::<Vec<_>>(), false))
        .collect::<Vec<_>>();
    let active_ids = active
        .iter()
        .map(|job| job.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    let mut seen = std::collections::HashSet::new();
    let recent = recent_raw
        .lines()
        .filter_map(|line| parse_job(&line.split('|').collect::<Vec<_>>(), true))
        .filter(|job| !active_ids.contains(job.id.as_str()) && seen.insert(job.id.clone()))
        .take(50)
        .collect();
    NarvalSnapshot {
        profile: profile.into(),
        active,
        recent,
        observed_at_ms: observed_at_ms(),
    }
}

pub fn snapshot(profile_id: &str) -> Result<NarvalSnapshot, NarvalError> {
    let profile = NarvalProfile::from_env(profile_id)?;
    let output = run_ssh(
        &profile,
        "squeue --noheader --me --format='%i|%j|%T|%M|%C|%P|%R|%Z'; printf '__ATELIER_RECENT__\\n'; sacct -X --allocations --starttime now-7days --user=\"$USER\" --noheader --parsable2 --format=JobIDRaw,JobName,State,Elapsed,AllocCPUS,Partition,Start,End,WorkDir 2>/dev/null || true",
    )?;
    Ok(parse_snapshot(profile_id, &output))
}

pub fn parse_directory(path: &str, output: &str) -> Vec<RemoteEntry> {
    let mut entries = output
        .lines()
        .filter_map(|line| {
            let fields = line.split('\x1f').collect::<Vec<_>>();
            let name = fields.first()?.trim();
            if name.is_empty() {
                return None;
            }
            let kind = match fields.get(1).copied().unwrap_or("") {
                "d" => "directory",
                "l" => "symlink",
                _ => "file",
            };
            Some(RemoteEntry {
                name: name.into(),
                path: format!("{}/{}", path.trim_end_matches('/'), name),
                kind: kind.into(),
                size: fields.get(2).unwrap_or(&&"0").parse().unwrap_or(0),
                modified_at: fields.get(3).unwrap_or(&&"0").parse().unwrap_or(0.0),
            })
        })
        .take(MAX_DIRECTORY_ENTRIES)
        .collect::<Vec<_>>();
    entries.sort_by(|a, b| {
        let a_dir = a.kind == "directory";
        let b_dir = b.kind == "directory";
        b_dir
            .cmp(&a_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

pub fn list_directory(profile_id: &str, path: &str) -> Result<Vec<RemoteEntry>, NarvalError> {
    let profile = NarvalProfile::from_env(profile_id)?;
    let path = profile.validate_path(path)?;
    let command = format!(
        "find {} -mindepth 1 -maxdepth 1 -printf '%f\\037%y\\037%s\\037%T@\\n' 2>/dev/null | head -n {}",
        shell_quote(&path), MAX_DIRECTORY_ENTRIES
    );
    let output = run_ssh(&profile, &command)?;
    Ok(parse_directory(&path, &output))
}

pub fn parse_job_detail(output: &str) -> Option<SlurmJobDetail> {
    let fields = output
        .lines()
        .find(|line| !line.trim().is_empty())?
        .split('|')
        .collect::<Vec<_>>();
    let job = SlurmJob {
        id: fields.first()?.trim().into(),
        name: fields.get(1).unwrap_or(&&"").trim().into(),
        state: normalize_state(fields.get(2).unwrap_or(&&"")),
        elapsed: fields.get(3).unwrap_or(&&"").trim().into(),
        cpus: fields.get(4).unwrap_or(&&"0").trim().parse().unwrap_or(0),
        partition: fields.get(6).unwrap_or(&&"").trim().into(),
        reason: String::new(),
        work_dir: fields.get(10).unwrap_or(&&"").trim().into(),
        started_at: fields.get(8).unwrap_or(&&"").trim().into(),
        ended_at: fields.get(9).unwrap_or(&&"").trim().into(),
    };
    let stdout_path = fields
        .get(11)
        .unwrap_or(&&"")
        .trim()
        .replace("%j", &job.id)
        .replace("%A", &job.id);
    let stderr_path = fields
        .get(12)
        .unwrap_or(&&"")
        .trim()
        .replace("%j", &job.id)
        .replace("%A", &job.id);
    Some(SlurmJobDetail {
        job,
        requested_memory: fields.get(5).unwrap_or(&&"").trim().into(),
        submitted_at: fields.get(7).unwrap_or(&&"").trim().into(),
        stdout_path,
        stderr_path,
    })
}

pub fn inspect_job(profile_id: &str, job_id: &str) -> Result<SlurmJobDetail, NarvalError> {
    if job_id.is_empty() || !job_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(NarvalError::new(
            "invalid_job",
            "identifiant Slurm invalide",
        ));
    }
    let profile = NarvalProfile::from_env(profile_id)?;
    let command = format!(
        "sacct -X -j {} --allocations --noheader --parsable2 --format=JobIDRaw,JobName,State,Elapsed,AllocCPUS,ReqMem,Partition,Submit,Start,End,WorkDir,StdOut,StdErr | head -n 1",
        job_id
    );
    let output = run_ssh(&profile, &command)?;
    parse_job_detail(&output).ok_or_else(|| NarvalError::new("not_found", "job Slurm introuvable"))
}

fn text_extension_allowed(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [
        ".out", ".err", ".log", ".txt", ".md", ".json", ".csv", ".tsv", ".yaml", ".yml", ".toml",
        ".sh", ".py", ".r", ".jl",
    ]
    .iter()
    .any(|extension| lower.ends_with(extension))
}

pub fn read_text(
    profile_id: &str,
    path: &str,
    tail_lines: u32,
) -> Result<RemoteTextPreview, NarvalError> {
    let profile = NarvalProfile::from_env(profile_id)?;
    let path = profile.validate_path(path)?;
    if !text_extension_allowed(&path) {
        return Err(NarvalError::new(
            "unsupported_file",
            "aperçu limité aux fichiers texte",
        ));
    }
    let lines = tail_lines.clamp(1, MAX_TAIL_LINES);
    let command = format!("tail -n {} -- {}", lines, shell_quote(&path));
    let content = run_ssh(&profile, &command)?;
    Ok(RemoteTextPreview {
        path,
        truncated: content.len() >= MAX_STDOUT,
        content,
        observed_at_ms: observed_at_ms(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_parses_active_and_recent_jobs() {
        let snapshot = parse_snapshot(
            "narval",
            "65659188|M42a-full|PENDING|0:00|16|cpubase|Priority|/home/u/m42a\n\
             65659021|M42l-fit|RUNNING|1:43:18|32|cpubase|None|/home/u/m42l\n\
             __ATELIER_RECENT__\n\
             65659021|M42l-fit|RUNNING|01:43:18|32|cpubase|2026-07-15T09:58|Unknown|/home/u/m42l\n\
             65648210|M40-final|COMPLETED|04:18:02|16|cpubase|2026-07-14T22:17|2026-07-15T02:35|/home/u/m40\n",
        );
        assert_eq!(snapshot.active.len(), 2);
        assert_eq!(snapshot.active[0].reason, "Priority");
        assert_eq!(snapshot.recent.len(), 1);
        assert_eq!(snapshot.recent[0].id, "65648210");
    }

    #[test]
    fn directory_parser_sorts_folders_before_files() {
        let entries = parse_directory(
            "/home/u",
            "notes.txt\x1ff\x1f12\x1f1.0\nprojects\x1fd\x1f0\x1f2.0\n",
        );
        assert_eq!(entries[0].name, "projects");
        assert_eq!(entries[0].kind, "directory");
        assert_eq!(entries[1].path, "/home/u/notes.txt");
    }

    #[test]
    fn profile_rejects_traversal_and_unknown_profiles() {
        let profile = NarvalProfile {
            id: "narval".into(),
            host: "narval-vpn".into(),
            gateway: Some("nas".into()),
            roots: vec!["/home".into(), "/scratch".into()],
        };
        assert!(profile.validate_path("/home/u/project").is_ok());
        assert!(profile.validate_path("/home/u/../secret").is_err());
        assert!(profile.validate_path("/etc/passwd").is_err());
        assert!(NarvalProfile::from_env("other").is_err());
    }

    #[test]
    fn job_detail_is_bounded_to_numeric_job_ids_at_the_public_boundary() {
        assert!(inspect_job("narval", "1;touch /tmp/nope").is_err());
        let detail = parse_job_detail("65659188|M42a|PENDING|00:00|16|64G|cpubase|2026-07-15T11:41|Unknown|Unknown|/home/u/m42a|slurm-%j.out|slurm-%A.err\n").unwrap();
        assert_eq!(detail.job.id, "65659188");
        assert_eq!(detail.requested_memory, "64G");
        assert_eq!(detail.stdout_path, "slurm-65659188.out");
    }
}
