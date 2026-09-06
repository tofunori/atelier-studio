//! Adaptateur NAS : une seule session ssh par instantané, qui concatène
//! `docker ps`, `systemctl --user show` (unités transitoires `systemd-run`
//! et services déclenchés par une minuterie) et les manifestes `atelier-run`
//! du compte NAS. Les logs sont lus par une seconde session à la demande.

use super::exec::{classify_ssh_failure, shell_quote, Exec, ExecError, Output, SSH_OPTIONS};
use super::local::{parse_manifest, run_from_manifest, ManifestContext};
use super::types::{
    format_rfc3339, parse_datetime, parse_relative_duration, truncate_command, Host, HostError,
    LogChunk, Run, RunDetail, RunState, Source, LOG_TAIL_LINES,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SSH_TIMEOUT: Duration = Duration::from_secs(20);
const SEP: &str = "::SEP";
/// Préfixe de chaque ligne de log embarquée : une ligne de log égale à un
/// marqueur (`::END`, `::SEP`…) ne peut donc pas corrompre l'analyse.
const TAIL_PREFIX: &str = "::L ";
const UNIT_PROPERTIES: &str = "Id,Description,ActiveState,SubState,Result,ActiveEnterTimestamp,\
InactiveEnterTimestamp,ExecMainPID,Transient,TriggeredBy,ExecStart";

/// Noms (sous-chaînes, insensibles à la casse) de conteneurs/unités
/// d'infrastructure du NAS : jamais des calculs. Surcharge par
/// `ATELIER_NAS_EXCLUDE` (liste séparée par des virgules).
pub const DEFAULT_EXCLUDED: &[&str] = &[
    "jellyfin", "paperless", "mcp", "redis", "postgres", "gotenberg", "tika", "broker",
    "adb-server", "cloudflared", "gluetun", "wireguard", "qbittorrent", "torrent", "firefox",
    "gbrain", "globus", "homeassistant", "homepage", "matter-server", "minio", "mitmproxy",
    "nextcloud", "portainer", "qinglong", "ttyd", "uptime-kuma", "vaultwarden", "webmap",
    "epico", "albedo-gallery", "albedo-site", "narval-watcher", "-watch",
];

/// Un conteneur `running` créé il y a plus longtemps que ceci est un service
/// permanent (Nextcloud, passerelles…), pas un calcul : masqué. Les calculs
/// de plusieurs jours (exports GEE) restent bien en deçà.
pub const SERVICE_AGE: Duration = Duration::from_secs(30 * 24 * 3600);

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

/// Script distant : trois sections séparées par une ligne `::SEP`. Chaque
/// commande est suivie de `|| true` : un bus systemd absent (ssh non
/// interactif) donne une section vide, jamais une section manquante. Le pid
/// est lu par `sed` sur la ligne `  "pid": N` (manifeste indent=2 écrit par
/// `atelier-run`) ; les lignes de log sont préfixées `::L `.
fn collect_script() -> String {
    format!(
        "docker ps -a --no-trunc --format '{{{{json .}}}}' 2>/dev/null || true; echo {SEP}; \
         TZ=UTC systemctl --user show --all --no-pager --property={UNIT_PROPERTIES} '*.service' 2>/dev/null || true; echo {SEP}; \
         for f in \"$HOME\"/.atelier/runs/*/run.json; do [ -f \"$f\" ] || continue; \
         echo \"::FILE $f\"; cat \"$f\"; echo; d=$(dirname \"$f\"); \
         m=$(stat -c %Y \"$d/log.txt\" 2>/dev/null); \
         p=$(sed -n 's/^  \"pid\": *\\([0-9][0-9]*\\).*/\\1/p' \"$f\" | head -n1); a=?; \
         if [ -n \"$p\" ]; then if kill -0 \"$p\" 2>/dev/null; then a=1; else a=0; fi; fi; \
         echo \"::META mtime=$m alive=$a\"; echo ::TAIL; tail -n {LOG_TAIL_LINES} \"$d/log.txt\" 2>/dev/null | sed 's/^/{TAIL_PREFIX}/'; echo ::END; done"
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

/// État d'une unité `systemctl show` : `ActiveState` + `Result`.
fn unit_state(active: &str, result: &str) -> RunState {
    match active {
        "active" | "activating" | "reloading" | "deactivating" => RunState::Running,
        "failed" => RunState::Failed,
        "inactive" if result == "success" => RunState::Completed,
        _ => RunState::Unknown,
    }
}

/// Blocs `Key=Value` de `systemctl show`, séparés par une ligne vide.
fn unit_blocks(raw: &str) -> Vec<HashMap<&str, &str>> {
    let mut blocks = Vec::new();
    let mut current: HashMap<&str, &str> = HashMap::new();
    for line in raw.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                blocks.push(std::mem::take(&mut current));
            }
        } else if let Some((key, value)) = line.split_once('=') {
            current.insert(key.trim(), value.trim());
        }
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    blocks
}

/// Une unité est un calcul si elle est transitoire (`systemd-run`) ou
/// déclenchée par une minuterie. `TriggeredBy` liste aussi des sockets
/// (dbus.socket, gpg-agent.socket…) : seuls les `.timer` comptent.
fn unit_is_compute(block: &HashMap<&str, &str>) -> bool {
    block.get("Transient").copied() == Some("yes")
        || block
            .get("TriggeredBy")
            .map(|list| list.split_whitespace().any(|unit| unit.ends_with(".timer")))
            .unwrap_or(false)
}

/// Valeur `ExecStart={ path=… ; argv[]=/usr/bin/python3 fit.py ; … }` →
/// `/usr/bin/python3 fit.py`.
fn unit_argv(exec_start: &str) -> Option<String> {
    exec_start
        .split_once("argv[]=")
        .map(|(_, rest)| rest.split(" ; ").next().unwrap_or(rest).trim())
        .filter(|argv| !argv.is_empty())
        .map(str::to_string)
}

fn unit_timestamp(value: Option<&&str>) -> Option<SystemTime> {
    value
        .filter(|raw| !raw.is_empty() && !raw.eq_ignore_ascii_case("n/a"))
        .and_then(|raw| parse_datetime(raw))
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
                if state.is_live() && observed.duration_since(created).unwrap_or_default() > SERVICE_AGE {
                    return None; // service permanent, pas un calcul
                }
                // Une rangée vivante ne doit pas changer à chaque sondage :
                // sa dernière activité reste sa création.
                let last_activity = ended.unwrap_or(created);
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

    /// Unités de `systemctl --user show` : seules les transitoires et les
    /// services déclenchés par une minuterie sont des calculs ; une unité
    /// inactive qui n'a jamais tourné (aucun horodatage) est du bruit, comme
    /// un calcul terminé avant la fenêtre.
    pub fn parse_units(
        &self,
        raw: &str,
        window_start: SystemTime,
        observed: SystemTime,
    ) -> Vec<Run> {
        unit_blocks(raw)
            .into_iter()
            .filter_map(|block| {
                let id = block.get("Id").copied().unwrap_or("").trim();
                if id.is_empty() || self.is_excluded(id) || !unit_is_compute(&block) {
                    return None;
                }
                let active = block.get("ActiveState").copied().unwrap_or("");
                let result = block.get("Result").copied().unwrap_or("");
                let state = unit_state(active, result);
                let started = unit_timestamp(block.get("ActiveEnterTimestamp"));
                let ended = if state.is_live() {
                    None
                } else {
                    unit_timestamp(block.get("InactiveEnterTimestamp"))
                };
                if !state.is_live() {
                    let reference = ended.or(started)?; // jamais tournée → bruit
                    if reference < window_start {
                        return None;
                    }
                }
                let started = started.unwrap_or(observed);
                let last_activity = if state.is_live() {
                    started
                } else {
                    ended.unwrap_or(started)
                };
                let description = block.get("Description").copied().unwrap_or("").trim();
                let command = block
                    .get("ExecStart")
                    .and_then(|exec| unit_argv(exec))
                    .unwrap_or_else(|| id.to_string());
                Some(Run {
                    id: format!("nas:unit:{id}"),
                    source: Source::Nas,
                    host: Host::Nas,
                    label: if description.is_empty() {
                        id.to_string()
                    } else {
                        description.to_string()
                    },
                    command: truncate_command(&command),
                    work_dir: String::new(),
                    state,
                    started_at: format_rfc3339(started),
                    ended_at: ended.map(format_rfc3339),
                    last_activity_at: format_rfc3339(last_activity),
                    progress: None,
                    log_path: None,
                    log_tail: Vec::new(),
                    remote_tasks: Vec::new(),
                    detail: RunDetail::Unit {
                        unit: id.to_string(),
                    },
                })
            })
            .collect()
    }

    /// Blocs `::FILE … ::META … ::TAIL … ::END` produits par le script ; les
    /// lignes de log portent le préfixe `::L ` (retiré ici).
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
                if let Some(text) = line.strip_prefix(TAIL_PREFIX) {
                    tail.push(text.to_string());
                }
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
        // Découpage ligne à ligne : une section vide (bus systemd absent) reste
        // une section, les manifestes ne glissent jamais dans la mauvaise case.
        let mut sections: Vec<String> = vec![String::new()];
        for line in raw.lines() {
            if line == SEP {
                sections.push(String::new());
            } else if let Some(current) = sections.last_mut() {
                current.push_str(line);
                current.push('\n');
            }
        }
        let section = |index: usize| sections.get(index).map(String::as_str).unwrap_or("");
        let mut runs = self.parse_docker(section(0), window_start, observed);
        runs.extend(self.parse_units(section(1), window_start, observed));
        runs.extend(self.parse_manifests(section(2), window_start, observed));
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
            format!("docker logs --tail {tail_lines} -- {} 2>&1", shell_quote(name))
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

    /// Oubli d'un run manifeste NAS (`nas:local:<id>`) : une commande ssh
    /// qui vérifie le manifeste, refuse un état `running`/`queued` (ou un pid
    /// vivant, même sonde que la collecte) et déplace le dossier dans
    /// `~/.atelier/runs/.archive/`. Sortie = un marqueur `::ARCHIVED`,
    /// `::LIVE` ou `::MISSING`. Docker et unités systemd ne s'oublient pas
    /// depuis ici (`unsupported`).
    pub fn forget(&self, exec: &dyn Exec, run_id: &str) -> Result<(), HostError> {
        let host = Host::Nas.as_str();
        let rest = run_id
            .strip_prefix("nas:")
            .ok_or_else(|| HostError::new(host, "invalid_run", "identifiant NAS attendu"))?;
        let Some(id) = rest.strip_prefix("local:") else {
            return Err(HostError::new(
                host,
                "unsupported",
                "seuls les runs manifeste (nas:local:) peuvent être oubliés",
            ));
        };
        let command = forget_script(id);
        let output = self.ssh(exec, &command)?;
        let marker = output
            .stdout
            .lines()
            .map(str::trim)
            .rev()
            .find(|line| line.starts_with("::"))
            .unwrap_or("");
        match marker {
            "::ARCHIVED" => Ok(()),
            "::LIVE" => Err(HostError::new(
                host,
                "run_live",
                "le run est encore en cours : impossible de l'oublier",
            )),
            "::MISSING" => Err(HostError::new(host, "not_found", "run introuvable")),
            other => Err(HostError::new(
                host,
                "command_failed",
                format!("réponse distante inattendue : {other:?}"),
            )),
        }
    }
}

/// Script `sh` d'oubli distant. L'état est lu par `sed` sur la ligne
/// `  "state": "..."` (même approche que le pid) ; l'id a passé
/// `valid_run_id` et est cité quand même.
fn forget_script(id: &str) -> String {
    let q = shell_quote(id);
    format!(
        "d=\"$HOME\"/.atelier/runs/{q}; f=\"$d/run.json\"; \
         if [ ! -f \"$f\" ]; then echo ::MISSING; exit 0; fi; \
         s=$(sed -n 's/^  \"state\": *\"\\([a-z]*\\)\".*/\\1/p' \"$f\" | head -n1); \
         p=$(sed -n 's/^  \"pid\": *\\([0-9][0-9]*\\).*/\\1/p' \"$f\" | head -n1); \
         if [ \"$s\" = running ] || [ \"$s\" = queued ]; then echo ::LIVE; exit 0; fi; \
         if [ -n \"$p\" ] && kill -0 \"$p\" 2>/dev/null; then echo ::LIVE; exit 0; fi; \
         a=\"$HOME\"/.atelier/runs/.archive; mkdir -p \"$a\" || exit 1; \
         t=\"$a\"/{q}; if [ -e \"$t\" ]; then t=\"$t-$(date +%s)\"; fi; \
         mv -- \"$d\" \"$t\" && echo ::ARCHIVED"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::exec::FakeExec;
    use crate::compute::types::window_start;

    const DOCKER: &str = include_str!("../../tests/fixtures/compute/docker_ps.jsonl");
    const UNITS: &str = include_str!("../../tests/fixtures/compute/systemctl_show.txt");
    const COLLECT: &str = include_str!("../../tests/fixtures/compute/nas_collect.txt");

    fn observed() -> SystemTime {
        parse_datetime("2026-09-06T16:00:00Z").unwrap()
    }

    #[test]
    fn docker_running_service_older_than_service_age_is_hidden() {
        let nas = NasAdapter { alias: "nas".into(), excluded: vec![] };
        let old = r#"{"Command":"\"nextcloud\"","CreatedAt":"2026-01-10 08:00:00 -0500 EST","ID":"a","Image":"nextcloud","Names":"cloud-app-1","State":"running","Status":"Up 7 months"}"#;
        let fresh = r#"{"Command":"\"python gee.py\"","CreatedAt":"2026-09-04 08:12:33 -0400 EDT","ID":"b","Image":"albedo-ee:1","Names":"gee_albedo_all","State":"running","Status":"Up 2 days"}"#;
        let raw = format!("{old}\n{fresh}\n");
        let runs = nas.parse_docker(&raw, window_start(observed(), 7), observed());
        assert_eq!(runs.iter().map(|r| r.label.as_str()).collect::<Vec<_>>(), vec!["gee_albedo_all"]);
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
        assert_eq!(
            up.last_activity_at, "2026-09-04T12:12:33Z",
            "vivant : dernière activité = création, pas observed"
        );
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
        assert_eq!(
            runs.len(),
            2,
            "jellyfin reste masqué par la règle SERVICE_AGE (créé il y a 3 mois)"
        );
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
        let runs = nas_default().parse_units(UNITS, window_start(observed(), 7), observed());
        let by_id: Vec<(&str, RunState)> = runs.iter().map(|r| (r.id.as_str(), r.state)).collect();
        assert_eq!(
            by_id,
            vec![
                ("nas:unit:albedo-sync.service", RunState::Running),
                ("nas:unit:run-u1234.service", RunState::Completed),
                ("nas:unit:ragdoc-index.service", RunState::Failed),
                ("nas:unit:run-u999.service", RunState::Unknown),
            ],
            "gbrain-mcp exclu (mcp) ; dbus (socket) et pipewire (démon) ignorés ; \
             nightly-report jamais tourné ; run-u777 hors fenêtre"
        );
        let sync = &runs[0];
        assert_eq!(sync.label, "Synchronisation Drive vers NAS");
        assert_eq!(sync.command, "/usr/bin/rclone sync gdrive:albedo /volume1/albedo");
        assert_eq!(
            sync.started_at, "2026-09-06T12:24:23Z",
            "ActiveEnterTimestamp sans décalage → naïf UTC"
        );
        assert!(sync.ended_at.is_none(), "vivant : InactiveEnterTimestamp (cycle précédent) ignoré");
        assert_eq!(sync.last_activity_at, sync.started_at, "vivant : ancré sur le début");
        assert_eq!(
            sync.detail,
            RunDetail::Unit {
                unit: "albedo-sync.service".into()
            }
        );
        let done = &runs[1];
        assert_eq!(done.started_at, "2026-09-05T20:00:00Z");
        assert_eq!(done.ended_at.as_deref(), Some("2026-09-05T22:30:00Z"));
        assert_eq!(done.last_activity_at, "2026-09-05T22:30:00Z");
        assert_eq!(done.command, "/usr/bin/python3 fit.py --model m42");
        let failed = &runs[2];
        assert_eq!(failed.ended_at.as_deref(), Some("2026-09-06T03:00:09Z"));
        let odd = &runs[3];
        assert_eq!(odd.command, "run-u999.service", "sans ExecStart → l'unité");
        assert_eq!(odd.label, "/usr/bin/python3 odd.py");

        // fenêtre plus large : run-u777 (terminé le 1er août) revient
        let wide = nas_default().parse_units(UNITS, window_start(observed(), 60), observed());
        assert!(wide.iter().any(|r| r.id == "nas:unit:run-u777.service"));

        assert!(nas_default()
            .parse_units("garbage", window_start(observed(), 7), observed())
            .is_empty());
        assert!(nas_default()
            .parse_units("", window_start(observed(), 7), observed())
            .is_empty());
    }

    #[test]
    fn unit_helpers_cover_state_and_argv() {
        assert_eq!(unit_state("active", "success"), RunState::Running);
        assert_eq!(unit_state("activating", ""), RunState::Running);
        assert_eq!(unit_state("inactive", "success"), RunState::Completed);
        assert_eq!(unit_state("inactive", "exit-code"), RunState::Unknown);
        assert_eq!(unit_state("failed", "exit-code"), RunState::Failed);
        assert_eq!(unit_state("", ""), RunState::Unknown);
        assert_eq!(
            unit_argv("{ path=/usr/bin/python3 ; argv[]=/usr/bin/python3 fit.py ; ignore_errors=no }"),
            Some("/usr/bin/python3 fit.py".into())
        );
        assert_eq!(unit_argv("{ path=/x }"), None);
        let mut block = HashMap::new();
        assert!(!unit_is_compute(&block));
        block.insert("TriggeredBy", "dbus.socket gpg-agent.socket");
        assert!(!unit_is_compute(&block), "sockets ≠ minuterie");
        block.insert("TriggeredBy", "dbus.socket nightly.timer");
        assert!(unit_is_compute(&block));
        block.insert("TriggeredBy", "");
        block.insert("Transient", "yes");
        assert!(unit_is_compute(&block));
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
        assert_eq!(
            manifest.log_tail,
            vec![
                "epoch 2 done",
                "::END",
                "::SEP",
                "::FILE /tmp/piege/run.json",
                "epoch 3 done"
            ],
            "préfixe ::L retiré ; une ligne de log égale à un marqueur ne coupe rien"
        );
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

    /// Les trois sections du fixture, pour recomposer des sorties partielles.
    fn collect_sections() -> (String, String, String) {
        // découpage ligne à ligne : `::L ::SEP` dans la queue de log n'est pas
        // un séparateur
        let mut sections = vec![String::new()];
        for line in COLLECT.lines() {
            if line == SEP {
                sections.push(String::new());
            } else {
                let last = sections.last_mut().unwrap();
                last.push_str(line);
                last.push('\n');
            }
        }
        assert_eq!(sections.len(), 3);
        let manifests = sections.pop().unwrap();
        let units = sections.pop().unwrap();
        let docker = sections.pop().unwrap();
        (docker, units, manifests)
    }

    #[test]
    fn collect_with_empty_middle_section_keeps_manifests_in_place() {
        // `systemctl --user` échoue sous ssh non interactif → section vide
        let (docker, _, manifests) = collect_sections();
        let raw = format!("{docker}{SEP}\n{SEP}\n{manifests}");
        let runs = nas_default().parse_collect(&raw, window_start(observed(), 7), observed());
        let ids: Vec<&str> = runs.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["nas:docker:albedo-trends", "nas:local:7788aabbccdd"],
            "aucune unité, mais le manifeste n'est pas avalé"
        );
        assert_eq!(runs[1].log_tail.len(), 5);
    }

    #[test]
    fn collect_with_empty_docker_section_still_parses_units_and_manifests() {
        let (_, units, manifests) = collect_sections();
        let raw = format!("{SEP}\n{units}{SEP}\n{manifests}");
        let runs = nas_default().parse_collect(&raw, window_start(observed(), 7), observed());
        let ids: Vec<&str> = runs.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["nas:unit:albedo-sync.service", "nas:local:7788aabbccdd"]
        );
        // tout vide (hôte sans docker, sans bus, sans manifeste)
        let raw = format!("{SEP}\n{SEP}\n");
        assert!(nas_default()
            .parse_collect(&raw, window_start(observed(), 7), observed())
            .is_empty());
        assert!(nas_default()
            .parse_collect("", window_start(observed(), 7), observed())
            .is_empty());
    }

    #[test]
    fn live_rows_are_identical_across_polls() {
        let first = nas_default().parse_collect(COLLECT, window_start(observed(), 7), observed());
        let later = observed() + Duration::from_secs(3 * 3_600);
        let second = nas_default().parse_collect(COLLECT, window_start(later, 7), later);
        let live = |runs: &[Run]| -> Vec<Run> {
            runs.iter().filter(|r| r.state.is_live()).cloned().collect()
        };
        assert_eq!(live(&first).len(), 3, "docker, unité, manifeste");
        assert_eq!(live(&first), live(&second), "aucun champ ne dépend de observed");
        // idem pour les unités seules et docker seul
        let a = nas_default().parse_units(UNITS, window_start(observed(), 7), observed());
        let b = nas_default().parse_units(UNITS, window_start(later, 7), later);
        assert_eq!(live(&a), live(&b));
        let a = nas_default().parse_docker(DOCKER, window_start(observed(), 7), observed());
        let b = nas_default().parse_docker(DOCKER, window_start(later, 7), later);
        assert_eq!(live(&a), live(&b));
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
        assert!(calls[0].contains("systemctl --user show --all --no-pager --property=Id,"));
        assert!(calls[0].contains("Transient,TriggeredBy,ExecStart '*.service' 2>/dev/null || true; echo ::SEP"));
        assert!(calls[0].contains("2>/dev/null || true; echo ::SEP; TZ=UTC systemctl"));
        assert!(
            calls[0].contains(r#"sed -n 's/^  "pid": *\([0-9][0-9]*\).*/\1/p' "$f" | head -n1"#),
            "pid lu sur la seule ligne indentée de deux espaces : {}",
            calls[0]
        );
        assert!(calls[0].contains("| sed 's/^/::L /'; echo ::END"));

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
        assert!(exec.calls()[0].ends_with("docker logs --tail 200 -- 'albedo-trends' 2>&1"));

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
