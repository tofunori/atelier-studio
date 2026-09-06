//! Adaptateur local : lit les manifestes écrits par `scripts/atelier-run`
//! dans `<runs_dir>/<id>/run.json` (+ `log.txt` à côté).

use super::types::{
    format_rfc3339, last_lines, normalize_datetime, parse_datetime, truncate_command, Host,
    HostError, Progress, Run, RunDetail, RunState, Source, LOG_TAIL_LINES,
};
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

pub const MANIFEST_VERSION: u64 = 1;

/// Manifeste `run.json` version 1 (champs de `scripts/atelier-run`).
#[derive(Debug, Clone, Deserialize)]
pub struct Manifest {
    #[serde(default)]
    pub version: u64,
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub work_dir: String,
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub started_at: String,
    #[serde(default)]
    pub ended_at: Option<String>,
    #[serde(default)]
    pub progress: Option<Progress>,
}

pub fn parse_manifest(raw: &str) -> Option<Manifest> {
    let manifest: Manifest = serde_json::from_str(raw.trim()).ok()?;
    if manifest.version != MANIFEST_VERSION || manifest.id.is_empty() {
        return None;
    }
    if !super::valid_run_id(&manifest.id) {
        return None;
    }
    Some(manifest)
}

/// Vivacité d'un PID par `kill(pid, 0)` : ESRCH → mort, EPERM → vivant
/// (le processus existe, il appartient à un autre compte).
pub fn pid_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    // SAFETY : signal 0 ne délivre rien, il ne fait que vérifier l'existence.
    let rc = unsafe { libc::kill(pid as libc::pid_t, 0) };
    if rc == 0 {
        return true;
    }
    std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

/// Contexte d'un manifeste observé : ce qui distingue un run local d'un run
/// NAS (mêmes champs, sondes différentes).
pub struct ManifestContext<'a> {
    pub host: Host,
    pub id_prefix: &'a str,
    pub alive: Option<bool>,
    pub log_mtime: Option<SystemTime>,
    pub log_path: Option<String>,
    pub log_tail: Vec<String>,
}

/// Convertit un manifeste en `Run`. Règle : `running` dont le processus a
/// disparu → `unknown`, jamais `completed`. Renvoie `None` si le run est
/// terminé hors de la fenêtre d'observation.
pub fn run_from_manifest(
    manifest: &Manifest,
    ctx: ManifestContext<'_>,
    window_start: SystemTime,
    observed: SystemTime,
) -> Option<Run> {
    let mut state = RunState::parse(&manifest.state);
    if state == RunState::Running && ctx.alive == Some(false) {
        state = RunState::Unknown;
    }
    let started_at = if manifest.started_at.trim().is_empty() {
        format_rfc3339(observed)
    } else {
        normalize_datetime(&manifest.started_at)
    };
    let ended_at = manifest
        .ended_at
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(normalize_datetime);
    let ended_time = ended_at.as_deref().and_then(parse_datetime);
    let last_activity = ctx
        .log_mtime
        .or(ended_time)
        .or_else(|| parse_datetime(&started_at))
        .unwrap_or(observed);
    if !state.is_live() {
        let reference = ended_time.unwrap_or(last_activity);
        if reference < window_start {
            return None;
        }
    }
    let progress = manifest
        .progress
        .clone()
        .filter(|progress| progress.total > 0 || progress.current > 0);
    Some(Run {
        id: format!("{}{}", ctx.id_prefix, manifest.id),
        source: if ctx.host == Host::Mac {
            Source::Local
        } else {
            Source::Nas
        },
        host: ctx.host,
        label: if manifest.label.trim().is_empty() {
            manifest.id.clone()
        } else {
            manifest.label.trim().to_string()
        },
        command: truncate_command(&manifest.command),
        work_dir: manifest.work_dir.clone(),
        state,
        started_at,
        ended_at,
        last_activity_at: format_rfc3339(last_activity),
        progress,
        log_path: ctx.log_path,
        log_tail: ctx.log_tail,
        remote_tasks: Vec::new(),
        detail: RunDetail::Local { pid: manifest.pid },
    })
}

#[derive(Debug, Clone)]
pub struct LocalAdapter {
    pub runs_dir: PathBuf,
}

impl LocalAdapter {
    pub fn collect(
        &self,
        window_start: SystemTime,
        observed: SystemTime,
    ) -> Result<Vec<Run>, HostError> {
        let entries = match fs::read_dir(&self.runs_dir) {
            Ok(entries) => entries,
            // Aucun run enregistré : dossier absent = liste vide, pas une erreur.
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                return Err(HostError::new(
                    Host::Mac.as_str(),
                    "io",
                    format!(
                        "lecture de {} impossible : {error}",
                        self.runs_dir.display()
                    ),
                ))
            }
        };
        let mut runs = Vec::new();
        for entry in entries.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let Ok(raw) = fs::read_to_string(dir.join("run.json")) else {
                continue;
            };
            let Some(mut manifest) = parse_manifest(&raw) else {
                continue;
            };
            // le nom du dossier fait foi : c'est lui que `read_log` résout
            if let Some(name) = dir.file_name().and_then(|n| n.to_str()) {
                if super::valid_run_id(name) {
                    manifest.id = name.to_string();
                }
            }
            if let Some(run) = self.run_from_dir(&dir, &manifest, window_start, observed) {
                runs.push(run);
            }
        }
        Ok(runs)
    }

    fn run_from_dir(
        &self,
        dir: &Path,
        manifest: &Manifest,
        window_start: SystemTime,
        observed: SystemTime,
    ) -> Option<Run> {
        let log_path = dir.join("log.txt");
        let log_meta = fs::metadata(&log_path).ok();
        let log_mtime = log_meta.as_ref().and_then(|meta| meta.modified().ok());
        let log_tail = log_meta
            .as_ref()
            .map(|_| read_tail(&log_path, LOG_TAIL_LINES))
            .unwrap_or_default();
        let alive = manifest.pid.map(pid_alive);
        run_from_manifest(
            manifest,
            ManifestContext {
                host: Host::Mac,
                id_prefix: "local:",
                alive,
                log_mtime,
                log_path: log_meta.map(|_| log_path.to_string_lossy().into_owned()),
                log_tail,
            },
            window_start,
            observed,
        )
    }

    pub fn log_path(&self, run_id: &str) -> PathBuf {
        self.runs_dir.join(run_id).join("log.txt")
    }
}

/// Dernières `n` lignes d'un fichier, lu par la fin (borne mémoire : 1 MiB).
pub fn read_tail(path: &Path, n: usize) -> Vec<String> {
    use std::io::{Read, Seek, SeekFrom};
    const MAX_BYTES: u64 = 1024 * 1024;
    let Ok(mut file) = fs::File::open(path) else {
        return Vec::new();
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(MAX_BYTES);
    if file.seek(SeekFrom::Start(start)).is_err() {
        return Vec::new();
    }
    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }
    let text = String::from_utf8_lossy(&bytes);
    let mut lines = last_lines(&text, n + usize::from(start > 0));
    if start > 0 && lines.len() > n {
        // la première ligne lue peut être coupée en plein milieu
        lines.remove(0);
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::types::window_start;
    use std::time::Duration;

    const RUNNING: &str = include_str!("../../tests/fixtures/compute/manifest_running.json");
    const COMPLETED: &str = include_str!("../../tests/fixtures/compute/manifest_completed.json");

    fn write_run(root: &Path, id: &str, manifest: &str, log: Option<&str>) {
        let dir = root.join(id);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("run.json"), manifest).unwrap();
        if let Some(log) = log {
            fs::write(dir.join("log.txt"), log).unwrap();
        }
    }

    fn with_pid_and_id(manifest: &str, id: &str, pid: u32) -> String {
        let mut value: serde_json::Value = serde_json::from_str(manifest).unwrap();
        value["id"] = serde_json::json!(id);
        value["pid"] = serde_json::json!(pid);
        value.to_string()
    }

    #[test]
    fn manifest_parser_reads_atelier_run_fields() {
        let manifest = parse_manifest(RUNNING).unwrap();
        assert_eq!(manifest.id, "a1b2c3d4e5f6");
        assert_eq!(manifest.pid, Some(48213));
        assert_eq!(manifest.progress.as_ref().unwrap().total, 40);
        assert_eq!(manifest.progress.as_ref().unwrap().unit, "tuiles");
        assert!(parse_manifest("{\"version\":2,\"id\":\"x\"}").is_none());
        assert!(parse_manifest("{\"version\":1,\"id\":\"../x\"}").is_none());
        assert!(parse_manifest("pas du json").is_none());
    }

    #[test]
    fn local_adapter_reports_alive_dead_completed_and_windowed_runs() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let now = SystemTime::now();
        let alive_pid = std::process::id();
        write_run(
            root,
            "alive001",
            &with_pid_and_id(RUNNING, "alive001", alive_pid),
            Some("ligne 1\nligne 2\nligne 3\n"),
        );
        write_run(
            root,
            "dead0001",
            &with_pid_and_id(RUNNING, "dead0001", 999_999),
            Some("dernière ligne avant la mort\n"),
        );
        write_run(root, "done0001", COMPLETED, Some("fini\n"));
        let mut old: serde_json::Value = serde_json::from_str(COMPLETED).unwrap();
        old["id"] = serde_json::json!("old00001");
        old["ended_at"] = serde_json::json!("2020-01-01T00:00:00Z");
        write_run(root, "old00001", &old.to_string(), None);
        // dossier sans manifeste : ignoré
        fs::create_dir_all(root.join("garbage")).unwrap();

        // fenêtre : le run terminé a une date de fin 2026-09-05 dans le fixture,
        // on prend une fenêtre assez large pour l'inclure quelle que soit la date du test
        let window = window_start(now, 30).min(parse_datetime("2026-09-01T00:00:00Z").unwrap());
        let adapter = LocalAdapter {
            runs_dir: root.to_path_buf(),
        };
        let mut runs = adapter.collect(window, now).unwrap();
        runs.sort_by(|a, b| a.id.cmp(&b.id));
        let ids: Vec<&str> = runs.iter().map(|run| run.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["local:alive001", "local:dead0001", "local:done0001"]
        );

        let alive = &runs[0];
        assert_eq!(alive.state, RunState::Running);
        assert_eq!(alive.host, Host::Mac);
        assert_eq!(alive.source, Source::Local);
        assert_eq!(alive.log_tail, vec!["ligne 1", "ligne 2", "ligne 3"]);
        assert_eq!(
            alive.detail,
            RunDetail::Local {
                pid: Some(alive_pid)
            }
        );
        assert!(alive
            .log_path
            .as_deref()
            .unwrap()
            .ends_with("alive001/log.txt"));
        assert_eq!(alive.progress.as_ref().unwrap().current, 12);
        // dernière activité = mtime du log (≈ maintenant), pas started_at
        assert!(alive.last_activity_at > alive.started_at);

        let dead = &runs[1];
        assert_eq!(
            dead.state,
            RunState::Unknown,
            "pid mort → unknown, jamais completed"
        );

        let done = &runs[2];
        assert_eq!(done.state, RunState::Completed);
        assert_eq!(done.ended_at.as_deref(), Some("2026-09-05T21:14:32Z"));
        assert!(done.progress.is_none(), "progression vide non remontée");

        // dossier de runs absent → aucune erreur, liste vide
        let missing = LocalAdapter {
            runs_dir: root.join("nope"),
        };
        assert_eq!(missing.collect(window, now).unwrap(), Vec::<Run>::new());
    }

    #[test]
    fn manifest_conversion_uses_log_mtime_and_window() {
        let manifest = parse_manifest(COMPLETED).unwrap();
        let observed = parse_datetime("2026-09-06T12:00:00Z").unwrap();
        let ctx = |mtime: Option<SystemTime>| ManifestContext {
            host: Host::Nas,
            id_prefix: "nas:local:",
            alive: None,
            log_mtime: mtime,
            log_path: None,
            log_tail: vec![],
        };
        let run =
            run_from_manifest(&manifest, ctx(None), window_start(observed, 7), observed).unwrap();
        assert_eq!(run.id, "nas:local:0f9e8d7c6b5a");
        assert_eq!(run.source, Source::Nas);
        assert_eq!(run.last_activity_at, "2026-09-05T21:14:32Z");
        // hors fenêtre : fin le 5 à 21 h 14, fenêtre ouverte le 6 à 00 h
        let late = parse_datetime("2026-09-06T00:00:00Z").unwrap();
        assert!(run_from_manifest(&manifest, ctx(None), late, observed).is_none());
        // un run vivant reste visible quelle que soit la fenêtre
        let running = parse_manifest(RUNNING).unwrap();
        let run = run_from_manifest(
            &running,
            ctx(Some(observed - Duration::from_secs(60))),
            window_start(observed, 1),
            observed,
        )
        .unwrap();
        assert_eq!(run.state, RunState::Running);
        assert_eq!(run.last_activity_at, "2026-09-06T11:59:00Z");
    }

    #[test]
    fn pid_probe_distinguishes_self_from_ghost() {
        assert!(pid_alive(std::process::id()));
        assert!(!pid_alive(999_999));
        assert!(!pid_alive(0));
    }

    #[test]
    fn read_tail_keeps_last_lines_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("log.txt");
        let body = (1..=100)
            .map(|i| format!("l{i}"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&path, body).unwrap();
        let tail = read_tail(&path, 3);
        assert_eq!(tail, vec!["l98", "l99", "l100"]);
        assert!(read_tail(&dir.path().join("absent"), 3).is_empty());
    }
}
