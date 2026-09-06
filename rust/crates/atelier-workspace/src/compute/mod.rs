//! Surface Calculs : instantanés sans état des calculs longs sur les trois
//! hôtes (Mac = manifestes `atelier-run`, NAS = docker/systemd/manifestes,
//! Narval = Slurm via `narval.rs`). Lecture seule, une session ssh par hôte
//! et par cycle, résultats bornés (≤ 200 runs, 40 lignes de log embarquées).

mod exec;
mod local;
mod nas;
mod slurm;
mod types;

pub use exec::{Exec, SystemExec};
pub use types::{Host, HostError, LogChunk, Run, RunState, Snapshot};

use local::LocalAdapter;
use nas::NasAdapter;
use slurm::SlurmAdapter;
use std::path::PathBuf;
use std::time::SystemTime;
use types::{format_rfc3339, window_start};

pub const MAX_RUNS: usize = 200;
pub const MAX_LOG_LINES: u32 = 400;

/// Configuration des adaptateurs. `Default` lit l'environnement UNE fois
/// (`ATELIER_RUNS_DIR`, `ATELIER_NAS_HOST`, `ATELIER_NAS_EXCLUDE`,
/// `ATELIER_COMPUTE_SLURM_PROFILE`) : les tests construisent la struct à la
/// main et n'appellent jamais `Default` — aucune mutation d'env (course
/// entre tests, vécu 2026).
#[derive(Debug, Clone)]
pub struct ComputeConfig {
    pub runs_dir: PathBuf,
    pub nas_alias: String,
    pub nas_excluded: Vec<String>,
    pub slurm_profile: String,
}

impl Default for ComputeConfig {
    fn default() -> Self {
        let runs_dir = std::env::var_os("ATELIER_RUNS_DIR")
            .map(PathBuf::from)
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| {
                let home = std::env::var_os("HOME")
                    .map(PathBuf::from)
                    .unwrap_or_else(|| PathBuf::from("/"));
                home.join(".atelier").join("runs")
            });
        let nas_alias = std::env::var("ATELIER_NAS_HOST")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| valid_ssh_alias(value))
            .unwrap_or_else(|| "nas".into());
        let nas_excluded = std::env::var("ATELIER_NAS_EXCLUDE")
            .ok()
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .filter(|list| !list.is_empty())
            .unwrap_or_else(|| {
                nas::DEFAULT_EXCLUDED
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            });
        let slurm_profile = std::env::var("ATELIER_COMPUTE_SLURM_PROFILE")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "narval".into());
        Self {
            runs_dir,
            nas_alias,
            nas_excluded,
            slurm_profile,
        }
    }
}

impl ComputeConfig {
    fn local(&self) -> LocalAdapter {
        LocalAdapter {
            runs_dir: self.runs_dir.clone(),
        }
    }

    fn nas(&self) -> NasAdapter {
        NasAdapter {
            alias: self.nas_alias.clone(),
            excluded: self.nas_excluded.clone(),
        }
    }

    fn slurm(&self) -> SlurmAdapter {
        SlurmAdapter {
            profile: self.slurm_profile.clone(),
        }
    }
}

fn valid_ssh_alias(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b'@'))
}

/// Identifiants de run acceptés : `[A-Za-z0-9_.:-]`, jamais vide. Vérifié
/// AVANT toute construction de commande distante.
pub fn valid_run_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 256
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b':' | b'-'))
}

/// Instantané multi-hôtes : les adaptateurs demandés tournent en parallèle,
/// chaque échec devient une `HostError`, les autres hôtes sont renvoyés.
pub fn snapshot(cfg: &ComputeConfig, hosts: &[Host], days: u32, exec: &dyn Exec) -> Snapshot {
    let observed = SystemTime::now();
    snapshot_at(cfg, hosts, days, exec, observed)
}

fn snapshot_at(
    cfg: &ComputeConfig,
    hosts: &[Host],
    days: u32,
    exec: &dyn Exec,
    observed: SystemTime,
) -> Snapshot {
    let days = days.clamp(1, 30);
    let window = window_start(observed, days);
    let wanted = |host: Host| hosts.contains(&host);
    let (local, nas, slurm) = std::thread::scope(|scope| {
        let local = wanted(Host::Mac).then(|| {
            let adapter = cfg.local();
            scope.spawn(move || adapter.collect(window, observed))
        });
        let nas = wanted(Host::Nas).then(|| {
            let adapter = cfg.nas();
            scope.spawn(move || adapter.collect(exec, window, observed))
        });
        let slurm = wanted(Host::Narval).then(|| {
            let adapter = cfg.slurm();
            scope.spawn(move || adapter.collect(days, observed))
        });
        let join = |host: Host,
                    handle: Option<
            std::thread::ScopedJoinHandle<'_, Result<Vec<Run>, HostError>>,
        >| {
            handle.map(|handle| {
                handle.join().unwrap_or_else(|_| {
                    Err(HostError::new(
                        host.as_str(),
                        "internal",
                        "collecte interrompue",
                    ))
                })
            })
        };
        (
            join(Host::Mac, local),
            join(Host::Nas, nas),
            join(Host::Narval, slurm),
        )
    });
    let mut runs = Vec::new();
    let mut errors = Vec::new();
    for result in [local, nas, slurm].into_iter().flatten() {
        match result {
            Ok(host_runs) => runs.extend(host_runs),
            Err(error) => errors.push(error),
        }
    }
    sort_and_cap(&mut runs);
    Snapshot {
        observed_at: format_rfc3339(observed),
        runs,
        errors,
    }
}

/// `running` d'abord, puis dernière activité décroissante ; plafond 200.
fn sort_and_cap(runs: &mut Vec<Run>) {
    runs.sort_by(|a, b| {
        let a_running = a.state == RunState::Running;
        let b_running = b.state == RunState::Running;
        b_running
            .cmp(&a_running)
            .then_with(|| b.last_activity_at.cmp(&a.last_activity_at))
            .then_with(|| a.id.cmp(&b.id))
    });
    runs.truncate(MAX_RUNS);
}

/// Lecture d'un log par préfixe d'identifiant : `local:` (fichier lu
/// directement), `nas:` (ssh), `slurm:` (non pris en charge ici — passer par
/// `narvalReadText` avec le chemin StdOut du job).
pub fn read_log(
    cfg: &ComputeConfig,
    run_id: &str,
    tail_lines: u32,
    exec: &dyn Exec,
) -> Result<LogChunk, HostError> {
    if !valid_run_id(run_id) {
        return Err(HostError::new(
            "",
            "invalid_run",
            "identifiant de run invalide",
        ));
    }
    let tail_lines = tail_lines.clamp(1, MAX_LOG_LINES);
    if let Some(id) = run_id.strip_prefix("local:") {
        let path = cfg.local().log_path(id);
        if !path.is_file() {
            return Err(HostError::new(
                Host::Mac.as_str(),
                "not_found",
                "journal du run introuvable",
            ));
        }
        let lines = local::read_tail(&path, tail_lines as usize);
        let truncated = lines.len() >= tail_lines as usize;
        return Ok(LogChunk { lines, truncated });
    }
    if run_id.starts_with("nas:") {
        return cfg.nas().read_log(exec, run_id, tail_lines);
    }
    if run_id.starts_with("slurm:") {
        return Err(HostError::new(
            Host::Narval.as_str(),
            "unsupported",
            "journal Slurm : utiliser narvalReadText avec le chemin StdOut du job",
        ));
    }
    Err(HostError::new("", "invalid_run", "préfixe de run inconnu"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use exec::{FakeExec, Output};
    use types::{parse_datetime, Progress, RunDetail, Source};

    const RUNNING: &str = include_str!("../../tests/fixtures/compute/manifest_running.json");
    const COLLECT: &str = include_str!("../../tests/fixtures/compute/nas_collect.txt");

    fn cfg(runs_dir: &std::path::Path) -> ComputeConfig {
        ComputeConfig {
            runs_dir: runs_dir.to_path_buf(),
            nas_alias: "nas".into(),
            nas_excluded: nas::DEFAULT_EXCLUDED
                .iter()
                .map(|s| s.to_string())
                .collect(),
            slurm_profile: "narval".into(),
        }
    }

    fn write_local_run(root: &std::path::Path, id: &str, pid: u32, log: &str) {
        let mut value: serde_json::Value = serde_json::from_str(RUNNING).unwrap();
        value["id"] = serde_json::json!(id);
        value["pid"] = serde_json::json!(pid);
        let dir = root.join(id);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("run.json"), value.to_string()).unwrap();
        std::fs::write(dir.join("log.txt"), log).unwrap();
    }

    #[test]
    fn nas_failure_keeps_local_runs_and_reports_the_host() {
        let dir = tempfile::tempdir().unwrap();
        write_local_run(dir.path(), "aaaa0001", std::process::id(), "salut\n");
        let exec = FakeExec::new().on(
            "ssh",
            Ok(Output::failed(255, "ssh: Could not resolve hostname nas")),
        );
        let snap = snapshot(&cfg(dir.path()), &[Host::Mac, Host::Nas], 7, &exec);
        assert_eq!(snap.runs.len(), 1);
        assert_eq!(snap.runs[0].id, "local:aaaa0001");
        assert_eq!(snap.errors.len(), 1);
        assert_eq!(snap.errors[0].host, "nas");
        assert_eq!(snap.errors[0].code, "unavailable");
        assert!(snap.observed_at.ends_with('Z'));
        // hôte non demandé → ni run ni erreur, aucun ssh
        let exec = FakeExec::new();
        let snap = snapshot(&cfg(dir.path()), &[Host::Mac], 7, &exec);
        assert!(snap.errors.is_empty());
        assert!(exec.calls().is_empty());
    }

    #[test]
    fn snapshot_merges_hosts_sorts_running_first_and_caps() {
        let dir = tempfile::tempdir().unwrap();
        // 250 runs locaux terminés avec des dates échelonnées + 1 vivant
        for i in 0..250u32 {
            let mut value: serde_json::Value = serde_json::from_str(RUNNING).unwrap();
            let id = format!("done{i:04}");
            value["id"] = serde_json::json!(id);
            value["state"] = serde_json::json!("completed");
            value["ended_at"] = serde_json::json!(format!(
                "2026-09-{:02}T{:02}:{:02}:00Z",
                1 + i / 100,
                (i / 10) % 24,
                i % 60
            ));
            let run_dir = dir.path().join(&id);
            std::fs::create_dir_all(&run_dir).unwrap();
            std::fs::write(run_dir.join("run.json"), value.to_string()).unwrap();
        }
        write_local_run(dir.path(), "zzzzlive", std::process::id(), "en cours\n");
        let exec = FakeExec::new().on("docker ps -a", Ok(Output::ok(COLLECT)));
        let observed = parse_datetime("2026-09-06T16:00:00Z").unwrap();
        let snap = snapshot_at(
            &cfg(dir.path()),
            &Host::ALL.to_vec()[..2],
            7,
            &exec,
            observed,
        );
        assert_eq!(snap.runs.len(), MAX_RUNS, "plafond 200");
        assert!(snap.errors.is_empty());
        let running: Vec<&Run> = snap
            .runs
            .iter()
            .filter(|r| r.state == RunState::Running)
            .collect();
        // vivants en tête : local vivant, docker albedo-trends, unité, manifeste NAS
        assert_eq!(running.len(), 4);
        assert!(snap.runs[..4].iter().all(|r| r.state == RunState::Running));
        for pair in snap.runs[4..].windows(2) {
            assert!(
                pair[0].last_activity_at >= pair[1].last_activity_at,
                "tri par activité décroissante"
            );
        }
        let hosts: std::collections::HashSet<Host> = snap.runs.iter().map(|r| r.host).collect();
        assert!(hosts.contains(&Host::Mac) && hosts.contains(&Host::Nas));
    }

    #[test]
    fn days_window_drops_old_completed_runs() {
        let dir = tempfile::tempdir().unwrap();
        let mut value: serde_json::Value = serde_json::from_str(RUNNING).unwrap();
        value["id"] = serde_json::json!("ancien01");
        value["state"] = serde_json::json!("completed");
        value["ended_at"] = serde_json::json!("2026-08-01T00:00:00Z");
        let run_dir = dir.path().join("ancien01");
        std::fs::create_dir_all(&run_dir).unwrap();
        std::fs::write(run_dir.join("run.json"), value.to_string()).unwrap();
        let observed = parse_datetime("2026-09-06T16:00:00Z").unwrap();
        let exec = FakeExec::new();
        assert!(
            snapshot_at(&cfg(dir.path()), &[Host::Mac], 7, &exec, observed)
                .runs
                .is_empty()
        );
        let old = parse_datetime("2026-08-02T00:00:00Z").unwrap();
        assert_eq!(
            snapshot_at(&cfg(dir.path()), &[Host::Mac], 7, &exec, old)
                .runs
                .len(),
            1
        );
    }

    #[test]
    fn read_log_routes_by_prefix_and_validates_ids() {
        let dir = tempfile::tempdir().unwrap();
        write_local_run(dir.path(), "aaaa0001", 1, "l1\nl2\nl3\n");
        let cfg = cfg(dir.path());
        let exec = FakeExec::new().on("docker logs", Ok(Output::ok("d1\n")));

        let chunk = read_log(&cfg, "local:aaaa0001", 2, &exec).unwrap();
        assert_eq!(chunk.lines, vec!["l2", "l3"]);
        assert!(chunk.truncated);
        let chunk = read_log(&cfg, "local:aaaa0001", 400, &exec).unwrap();
        assert_eq!(chunk.lines.len(), 3);
        assert!(!chunk.truncated);
        assert_eq!(
            read_log(&cfg, "local:absent01", 10, &exec)
                .unwrap_err()
                .code,
            "not_found"
        );

        let chunk = read_log(&cfg, "nas:docker:albedo-trends", 900, &exec).unwrap();
        assert_eq!(chunk.lines, vec!["d1"]);
        assert!(
            exec.calls()[0].contains("--tail 400"),
            "tailLines plafonné à 400"
        );

        let err = read_log(&cfg, "slurm:65659021", 10, &exec).unwrap_err();
        assert_eq!(err.code, "unsupported");
        assert_eq!(err.host, "narval");
        assert!(err.message.contains("narvalReadText"));

        for bad in [
            "",
            "local:../etc/passwd",
            "nas:docker:a;rm -rf /",
            "nas:docker:$(id)",
            "other:x",
            "nas:docker:a b",
        ] {
            let err = read_log(&cfg, bad, 10, &exec).unwrap_err();
            assert_eq!(err.code, "invalid_run", "{bad:?}");
        }
        assert_eq!(exec.calls().len(), 1, "aucun ssh pour les ids refusés");
    }

    #[test]
    fn run_serializes_to_the_frozen_contract() {
        let run = Run {
            id: "local:abc".into(),
            source: Source::Local,
            host: Host::Mac,
            label: "fit".into(),
            command: "python fit.py".into(),
            work_dir: "/w".into(),
            state: RunState::Running,
            started_at: "2026-09-06T13:02:11Z".into(),
            ended_at: None,
            last_activity_at: "2026-09-06T13:05:00Z".into(),
            progress: Some(Progress {
                current: 1,
                total: 2,
                unit: "x".into(),
            }),
            log_path: Some("/w/log.txt".into()),
            log_tail: vec!["a".into()],
            remote_tasks: vec![],
            detail: RunDetail::Local { pid: Some(7) },
        };
        let value = serde_json::to_value(&run).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "id": "local:abc", "source": "local", "host": "mac", "label": "fit",
                "command": "python fit.py", "workDir": "/w", "state": "running",
                "startedAt": "2026-09-06T13:02:11Z", "lastActivityAt": "2026-09-06T13:05:00Z",
                "progress": {"current": 1, "total": 2, "unit": "x"},
                "logPath": "/w/log.txt", "logTail": ["a"], "remoteTasks": [],
                "detail": {"kind": "local", "pid": 7}
            })
        );
        let keys: Vec<&str> = value
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert!(!keys.contains(&"endedAt"), "endedAt absent quand None");
        let snap = serde_json::to_value(Snapshot {
            observed_at: "2026-09-06T16:00:00Z".into(),
            runs: vec![],
            errors: vec![HostError::new("nas", "unavailable", "x")],
        })
        .unwrap();
        assert_eq!(snap["observedAt"], "2026-09-06T16:00:00Z");
        assert_eq!(
            snap["errors"][0],
            serde_json::json!({"host":"nas","code":"unavailable","message":"x"})
        );
    }

    #[test]
    fn host_parsing_is_lenient() {
        assert_eq!(Host::parse(" NAS "), Some(Host::Nas));
        assert_eq!(Host::parse("narval"), Some(Host::Narval));
        assert_eq!(Host::parse("mac"), Some(Host::Mac));
        assert_eq!(Host::parse("pluton"), None);
    }
}
