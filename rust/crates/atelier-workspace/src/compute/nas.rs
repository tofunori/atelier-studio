//! Adaptateur NAS : une seule session ssh par instantané, qui concatène
//! `docker ps`, `systemctl --user list-units` et les manifestes `atelier-run`
//! du compte NAS. Les logs sont lus par une seconde session à la demande.

use super::exec::{classify_ssh_failure, shell_quote, Exec, ExecError, Output, SSH_OPTIONS};
use super::local::{parse_manifest, run_from_manifest, ManifestContext};
use super::types::{
    format_rfc3339, parse_datetime, parse_relative_duration, truncate_command, Host, HostError,
    LogChunk, Run, RunDetail, RunState, Source, LOG_TAIL_LINES,
};
use serde::Deserialize;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SSH_TIMEOUT: Duration = Duration::from_secs(20);
const SEP: &str = "::SEP";

pub const DEFAULT_EXCLUDED: &[&str] = &[
    "jellyfin",
    "paperless",
    "mcp",
    "redis",
    "postgres",
    "gotenberg",
    "tika",
    "broker",
];

#[derive(Debug, Clone)]
pub struct NasAdapter {
    pub alias: String,
    pub excluded: Vec<String>,
}

impl Default for NasAdapter {
    fn default() -> Self {
        Self {
            alias: "nas".into(),
            excluded: DEFAULT_EXCLUDED.iter().map(|s| s.to_string()).collect(),
        }
    }
}

fn collect_script() -> String {
    format!(
        "docker ps -a --no-trunc --format '{{{{json .}}}}' 2>/dev/null; echo {SEP}; \
         systemctl --user list-units --type=service,timer --all --output=json --no-pager 2>/dev/null; echo {SEP}; \
         for f in \"$HOME\"/.atelier/runs/*/run.json; do [ -f \"$f\" ] || continue; \
         echo \"::FILE $f\"; cat \"$f\"; echo; d=$(dirname \"$f\"); \
         m=$(stat -c %Y \"$d/log.txt\" 2>/dev/null); \
         p=$(grep -o '\"pid\": *[0-9]*' \"$f\" | grep -o '[0-9]*$'); a=?; \
         if [ -n \"$p\" ]; then if kill -0 \"$p\" 2>/dev/null; then a=1; else a=0; fi; fi; \
         echo \"::META mtime=$m alive=$a\"; echo ::TAIL; tail -n {LOG_TAIL_LINES} \"$d/log.txt\" 2>/dev/null; echo ::END; done"
    )
}

#[derive(Debug, Deserialize)]
#[allow(non_snake_case)]
struct DockerRow {
    #[serde(default)]
    Names: String,
    #[serde(default)]
    Image: String,
    #[serde(default)]
    Command: String,
    #[serde(default)]
    Status: String,
    #[serde(default)]
    CreatedAt: String,
    #[serde(default)]
    State: String,
}

#[derive(Debug, Deserialize)]
struct UnitRow {
    #[serde(default)]
    unit: String,
    #[serde(default)]
    load: String,
    #[serde(default)]
    active: String,
    #[serde(default)]
    sub: String,
    #[serde(default)]
    description: String,
}

/// État docker → état de run, plus la date de fin déduite du libellé
/// (`Exited (137) 3 hours ago`).
fn docker_state(status: &str, state: &str, observed: SystemTime) -> (RunState, Option<SystemTime>) {
    let status = status.trim();
    let lower = status.to_ascii_lowercase();
    let ago = || {
        status
            .split_once(')')
            .map(|(_, tail)| tail)
            .and_then(parse_relative_duration)
            .map(|d| observed - d)
    };
    if lower.starts_with("up") || lower.starts_with("paused") || state == "running" {
        (RunState::Running, None)
    } else if lower.starts_with("exited") {
        let code = status
            .split_once('(')
            .and_then(|(_, rest)| rest.split_once(')'))
            .and_then(|(code, _)| code.trim().parse::<i64>().ok());
        let ended = ago();
        match code {
            Some(0) => (RunState::Completed, ended),
            Some(_) => (RunState::Failed, ended),
            None => (RunState::Unknown, ended),
        }
    } else if lower.starts_with("created") {
        (RunState::Queued, None)
    } else if lower.starts_with("restarting") || lower.starts_with("dead") {
        (RunState::Failed, ago())
    } else {
        (RunState::Unknown, None)
    }
}

fn unit_state(active: &str, sub: &str) -> Option<RunState> {
    match (active, sub) {
        (_, "waiting") => Some(RunState::Queued),
        ("active" | "activating" | "reloading" | "deactivating", _) => Some(RunState::Running),
        ("failed", _) | (_, "failed") => Some(RunState::Failed),
        // `inactive (dead)` = unité chargée qui n'a rien fait de récent : bruit
        ("inactive", "dead") => None,
        ("inactive", _) => Some(RunState::Completed),
        _ => Some(RunState::Unknown),
    }
}

impl NasAdapter {
    fn is_excluded(&self, name: &str) -> bool {
        let lower = name.to_ascii_lowercase();
        self.excluded
            .iter()
            .any(|needle| !needle.is_empty() && lower.contains(&needle.to_ascii_lowercase()))
    }

    pub fn parse_docker(
        &self,
        raw: &str,
        window_start: SystemTime,
        observed: SystemTime,
    ) -> Vec<Run> {
        raw.lines()
            .filter_map(|line| serde_json::from_str::<DockerRow>(line.trim()).ok())
            .filter(|row| !row.Names.is_empty() && !self.is_excluded(&row.Names))
            .filter_map(|row| {
                let (state, ended) = docker_state(&row.Status, &row.State, observed);
                if !state.is_live() {
                    if let Some(ended) = ended {
                        if ended < window_start {
                            return None;
                        }
                    }
                }
                let created = parse_datetime(&row.CreatedAt).unwrap_or(observed);
                let last_activity = match state {
                    RunState::Running | RunState::Queued => observed,
                    _ => ended.unwrap_or(created),
                };
                let command = row.Command.trim().trim_matches('"').to_string();
                Some(Run {
                    id: format!("nas:docker:{}", row.Names),
                    source: Source::Nas,
                    host: Host::Nas,
                    label: row.Names.clone(),
                    command: truncate_command(if command.is_empty() {
                        &row.Image
                    } else {
                        &command
                    }),
                    work_dir: String::new(),
                    state,
                    started_at: format_rfc3339(created),
                    ended_at: ended.map(format_rfc3339),
                    last_activity_at: format_rfc3339(last_activity),
                    progress: None,
                    log_path: None,
                    log_tail: Vec::new(),
                    remote_tasks: Vec::new(),
                    detail: RunDetail::Docker {
                        container: row.Names,
                    },
                })
            })
            .collect()
    }

    pub fn parse_units(&self, raw: &str, observed: SystemTime) -> Vec<Run> {
        let rows: Vec<UnitRow> = serde_json::from_str(raw.trim()).unwrap_or_default();
        rows.into_iter()
            .filter(|row| {
                !row.unit.is_empty() && row.load == "loaded" && !self.is_excluded(&row.unit)
            })
            .filter_map(|row| {
                let state = unit_state(&row.active, &row.sub)?;
                let now = format_rfc3339(observed);
                Some(Run {
                    id: format!("nas:unit:{}", row.unit),
                    source: Source::Nas,
                    host: Host::Nas,
                    label: if row.description.trim().is_empty() {
                        row.unit.clone()
                    } else {
                        row.description.trim().to_string()
                    },
                    command: row.unit.clone(),
                    work_dir: String::new(),
                    state,
                    started_at: now.clone(),
                    ended_at: None,
                    last_activity_at: now,
                    progress: None,
                    log_path: None,
                    log_tail: Vec::new(),
                    remote_tasks: Vec::new(),
                    detail: RunDetail::Unit { unit: row.unit },
                })
            })
            .collect()
    }

    /// Blocs `::FILE … ::META … ::TAIL … ::END` produits par le script.
    pub fn parse_manifests(
        &self,
        raw: &str,
        window_start: SystemTime,
        observed: SystemTime,
    ) -> Vec<Run> {
        let mut runs = Vec::new();
        let mut path: Option<String> = None;
        let mut json = String::new();
        let mut meta = String::new();
        let mut tail: Vec<String> = Vec::new();
        let mut in_tail = false;
        let mut flush = |path: &mut Option<String>,
                         json: &mut String,
                         meta: &mut String,
                         tail: &mut Vec<String>| {
            if let Some(file) = path.take() {
                if let Some(manifest) = parse_manifest(json) {
                    let mut mtime = None;
                    let mut alive = None;
                    for token in meta.split_whitespace() {
                        if let Some(value) = token.strip_prefix("mtime=") {
                            mtime = value
                                .parse::<u64>()
                                .ok()
                                .map(|secs| UNIX_EPOCH + Duration::from_secs(secs));
                        } else if let Some(value) = token.strip_prefix("alive=") {
                            alive = match value {
                                "1" => Some(true),
                                "0" => Some(false),
                                _ => None,
                            };
                        }
                    }
                    let log_path = file
                        .strip_suffix("run.json")
                        .map(|dir| format!("{dir}log.txt"));
                    let ctx = ManifestContext {
                        host: Host::Nas,
                        id_prefix: "nas:local:",
                        alive,
                        log_mtime: mtime,
                        log_path,
                        log_tail: std::mem::take(tail),
                    };
                    if let Some(run) = run_from_manifest(&manifest, ctx, window_start, observed) {
                        runs.push(run);
                    }
                }
            }
            json.clear();
            meta.clear();
            tail.clear();
        };
        for line in raw.lines() {
            if let Some(file) = line.strip_prefix("::FILE ") {
                flush(&mut path, &mut json, &mut meta, &mut tail);
                path = Some(file.trim().to_string());
                in_tail = false;
            } else if let Some(rest) = line.strip_prefix("::META") {
                meta = rest.trim().to_string();
                in_tail = false;
            } else if line == "::TAIL" {
                in_tail = true;
            } else if line == "::END" {
                flush(&mut path, &mut json, &mut meta, &mut tail);
                in_tail = false;
            } else if in_tail {
                tail.push(line.to_string());
            } else if path.is_some() {
                json.push_str(line);
                json.push('\n');
            }
        }
        flush(&mut path, &mut json, &mut meta, &mut tail);
        runs
    }

    pub fn parse_collect(
        &self,
        raw: &str,
        window_start: SystemTime,
        observed: SystemTime,
    ) -> Vec<Run> {
        let separator = format!("\n{SEP}\n");
        let mut sections = raw.split(separator.as_str());
        let docker = sections.next().unwrap_or("");
        let docker = docker.strip_prefix(&format!("{SEP}\n")).unwrap_or(docker);
        let units = sections.next().unwrap_or("");
        let manifests = sections.next().unwrap_or("");
        let mut runs = self.parse_docker(docker, window_start, observed);
        runs.extend(self.parse_units(units, observed));
        runs.extend(self.parse_manifests(manifests, window_start, observed));
        runs
    }

    fn ssh(&self, exec: &dyn Exec, remote: &str) -> Result<Output, HostError> {
        let mut args: Vec<&str> = SSH_OPTIONS.to_vec();
        args.push(&self.alias);
        args.push(remote);
        let host = Host::Nas.as_str();
        match exec.run("ssh", &args, SSH_TIMEOUT) {
            Ok(output) if output.success => Ok(output),
            Ok(output) => {
                let (code, message) = classify_ssh_failure(&output.stderr);
                Err(HostError::new(host, &code, message))
            }
            Err(ExecError { code, message }) => Err(HostError::new(host, &code, message)),
        }
    }

    pub fn collect(
        &self,
        exec: &dyn Exec,
        window_start: SystemTime,
        observed: SystemTime,
    ) -> Result<Vec<Run>, HostError> {
        let output = self.ssh(exec, &collect_script())?;
        Ok(self.parse_collect(&output.stdout, window_start, observed))
    }

    /// Lecture de log selon le genre de run (`docker`, `unit`, `local`). L'id
    /// a déjà passé `valid_run_id` : il ne contient aucun métacaractère, et il
    /// est quand même cité.
    pub fn read_log(
        &self,
        exec: &dyn Exec,
        run_id: &str,
        tail_lines: u32,
    ) -> Result<LogChunk, HostError> {
        let host = Host::Nas.as_str();
        let rest = run_id
            .strip_prefix("nas:")
            .ok_or_else(|| HostError::new(host, "invalid_run", "identifiant NAS attendu"))?;
        let command = if let Some(name) = rest.strip_prefix("docker:") {
            format!("docker logs --tail {tail_lines} {} 2>&1", shell_quote(name))
        } else if let Some(unit) = rest.strip_prefix("unit:") {
            format!(
                "journalctl --user -u {} -n {tail_lines} --no-pager 2>&1",
                shell_quote(unit)
            )
        } else if let Some(id) = rest.strip_prefix("local:") {
            format!(
                "tail -n {tail_lines} -- \"$HOME\"/.atelier/runs/{}/log.txt",
                shell_quote(id)
            )
        } else {
            return Err(HostError::new(
                host,
                "invalid_run",
                "genre de run NAS inconnu",
            ));
        };
        let output = self.ssh(exec, &command)?;
        let lines: Vec<String> = output.stdout.lines().map(str::to_string).collect();
        let truncated =
            lines.len() >= tail_lines as usize || output.stdout.len() >= super::exec::MAX_STDOUT;
        Ok(LogChunk { lines, truncated })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::exec::FakeExec;
    use crate::compute::types::window_start;

    const DOCKER: &str = include_str!("../../tests/fixtures/compute/docker_ps.jsonl");
    const UNITS: &str = include_str!("../../tests/fixtures/compute/systemctl_units.json");
    const COLLECT: &str = include_str!("../../tests/fixtures/compute/nas_collect.txt");

    fn observed() -> SystemTime {
        parse_datetime("2026-09-06T16:00:00Z").unwrap()
    }

    #[test]
    fn docker_rows_are_mapped_filtered_and_dated() {
        let nas = NasAdapter::default();
        let runs = nas.parse_docker(DOCKER, window_start(observed(), 7), observed());
        let ids: Vec<&str> = runs.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![
                "nas:docker:albedo-trends",
                "nas:docker:m42-fit",
                "nas:docker:duckdb-build"
            ],
            "jellyfin exclu"
        );
        let up = &runs[0];
        assert_eq!(up.state, RunState::Running);
        assert_eq!(
            up.started_at, "2026-09-04T12:12:33Z",
            "CreatedAt -0400 → UTC"
        );
        assert_eq!(up.last_activity_at, "2026-09-06T16:00:00Z");
        assert_eq!(
            up.command,
            "python3 scripts/albedo_trends.py --region saint-elias --years 2000-2025"
        );
        assert_eq!(
            up.detail,
            RunDetail::Docker {
                container: "albedo-trends".into()
            }
        );
        assert!(up.ended_at.is_none());
        let killed = &runs[1];
        assert_eq!(killed.state, RunState::Failed, "Exited (137) → failed");
        assert_eq!(killed.ended_at.as_deref(), Some("2026-09-06T13:00:00Z"));
        assert_eq!(killed.last_activity_at, "2026-09-06T13:00:00Z");
        let done = &runs[2];
        assert_eq!(done.state, RunState::Completed);
        assert_eq!(done.ended_at.as_deref(), Some("2026-09-06T15:35:00Z"));

        // fenêtre : un conteneur sorti il y a 3 h disparaît avec une fenêtre qui
        // commence il y a 2 h ; le conteneur `Up` reste
        let narrow = observed() - Duration::from_secs(2 * 3_600);
        let runs = nas.parse_docker(DOCKER, narrow, observed());
        let ids: Vec<&str> = runs.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["nas:docker:albedo-trends", "nas:docker:duckdb-build"]
        );

        // exclusion insensible à la casse, sous-chaîne
        let strict = NasAdapter {
            alias: "nas".into(),
            excluded: vec!["TRENDS".into()],
        };
        let runs = strict.parse_docker(DOCKER, window_start(observed(), 7), observed());
        assert!(runs.iter().all(|r| !r.id.contains("albedo-trends")));
        assert_eq!(runs.len(), 3, "jellyfin revient quand il n'est plus exclu");
    }

    #[test]
    fn docker_states_cover_created_and_unparsable() {
        let now = observed();
        assert_eq!(docker_state("Created", "created", now).0, RunState::Queued);
        assert_eq!(
            docker_state("Up 5 minutes (healthy)", "running", now).0,
            RunState::Running
        );
        assert_eq!(
            docker_state("Restarting (1) 5 seconds ago", "restarting", now).0,
            RunState::Failed
        );
        assert_eq!(docker_state("???", "", now).0, RunState::Unknown);
        assert!(nas_default()
            .parse_docker("pas du json\n{}\n", now, now)
            .is_empty());
    }

    fn nas_default() -> NasAdapter {
        NasAdapter::default()
    }

    #[test]
    fn units_are_mapped_and_noise_dropped() {
        let runs = nas_default().parse_units(UNITS, observed());
        let by_id: Vec<(&str, RunState)> = runs.iter().map(|r| (r.id.as_str(), r.state)).collect();
        assert_eq!(
            by_id,
            vec![
                ("nas:unit:albedo-sync.service", RunState::Running),
                ("nas:unit:albedo-sync.timer", RunState::Queued),
                ("nas:unit:ragdoc-index.service", RunState::Failed),
                ("nas:unit:nightly-report.service", RunState::Completed),
            ],
            "gbrain-mcp exclu (mcp), dbus inactive/dead ignoré"
        );
        assert_eq!(runs[0].label, "Synchronisation Drive vers NAS");
        assert_eq!(
            runs[0].detail,
            RunDetail::Unit {
                unit: "albedo-sync.service".into()
            }
        );
        assert!(nas_default().parse_units("garbage", observed()).is_empty());
    }

    #[test]
    fn collect_output_is_split_in_three_sections() {
        let runs = nas_default().parse_collect(COLLECT, window_start(observed(), 7), observed());
        let ids: Vec<&str> = runs.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            vec![
                "nas:docker:albedo-trends",
                "nas:unit:albedo-sync.service",
                "nas:local:7788aabbccdd"
            ]
        );
        let manifest = &runs[2];
        assert_eq!(manifest.source, Source::Nas);
        assert_eq!(manifest.host, Host::Nas);
        assert_eq!(manifest.state, RunState::Running);
        assert_eq!(manifest.log_tail, vec!["epoch 2 done", "epoch 3 done"]);
        assert_eq!(
            manifest.last_activity_at,
            format_rfc3339(UNIX_EPOCH + Duration::from_secs(1788700000))
        );
        assert_eq!(
            manifest.log_path.as_deref(),
            Some("/home/thierry/.atelier/runs/7788aabbccdd/log.txt")
        );
        assert_eq!(manifest.progress.as_ref().unwrap().unit, "modèles");
        assert_eq!(manifest.detail, RunDetail::Local { pid: Some(9001) });

        // manifeste `running` dont le pid est mort côté NAS → unknown
        let dead = COLLECT.replace("alive=1", "alive=0");
        let runs = nas_default().parse_collect(&dead, window_start(observed(), 7), observed());
        assert_eq!(runs[2].state, RunState::Unknown);
    }

    #[test]
    fn collect_goes_through_one_ssh_session_and_maps_failures() {
        let exec = FakeExec::new().on("docker ps -a", Ok(Output::ok(COLLECT)));
        let nas = nas_default();
        let runs = nas
            .collect(&exec, window_start(observed(), 7), observed())
            .unwrap();
        assert_eq!(runs.len(), 3);
        let calls = exec.calls();
        assert_eq!(calls.len(), 1);
        assert!(calls[0].starts_with("ssh -o BatchMode=yes -o ConnectTimeout=8"));
        assert!(calls[0].contains(" -- nas "));
        assert!(calls[0].contains("systemctl --user list-units"));

        let exec = FakeExec::new().on(
            "ssh",
            Ok(Output::failed(255, "Permission denied (publickey)")),
        );
        let err = nas
            .collect(&exec, window_start(observed(), 7), observed())
            .unwrap_err();
        assert_eq!((err.host.as_str(), err.code.as_str()), ("nas", "auth"));

        let exec = FakeExec::new().on("ssh", Err(ExecError::new("timeout", "trop long")));
        let err = nas
            .collect(&exec, window_start(observed(), 7), observed())
            .unwrap_err();
        assert_eq!(err.code, "timeout");
    }

    #[test]
    fn logs_are_read_with_the_right_remote_command() {
        let nas = nas_default();
        let exec = FakeExec::new().on("docker logs", Ok(Output::ok("a\nb\n")));
        let chunk = nas
            .read_log(&exec, "nas:docker:albedo-trends", 200)
            .unwrap();
        assert_eq!(chunk.lines, vec!["a", "b"]);
        assert!(!chunk.truncated);
        assert!(exec.calls()[0].ends_with("docker logs --tail 200 'albedo-trends' 2>&1"));

        let exec = FakeExec::new().on("journalctl", Ok(Output::ok("x\ny\n")));
        let chunk = nas
            .read_log(&exec, "nas:unit:albedo-sync.service", 2)
            .unwrap();
        assert!(
            chunk.truncated,
            "autant de lignes que demandé → peut-être coupé"
        );
        assert!(
            exec.calls()[0].contains("journalctl --user -u 'albedo-sync.service' -n 2 --no-pager")
        );

        let exec = FakeExec::new().on("tail -n", Ok(Output::ok("fin\n")));
        nas.read_log(&exec, "nas:local:7788aabbccdd", 10).unwrap();
        assert!(exec.calls()[0]
            .contains("tail -n 10 -- \"$HOME\"/.atelier/runs/'7788aabbccdd'/log.txt"));

        let exec = FakeExec::new();
        assert_eq!(
            nas.read_log(&exec, "nas:other:x", 10).unwrap_err().code,
            "invalid_run"
        );
        assert!(exec.calls().is_empty(), "aucun ssh pour un id inconnu");
    }
}
