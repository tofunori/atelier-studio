//! Adaptateur Slurm : délègue la collecte à `narval::snapshot` et ne fait que
//! projeter `SlurmJob → Run`. Les logs passent par `narvalReadText`.

use super::types::{
    format_rfc3339, normalize_datetime, Host, HostError, Run, RunDetail, RunState, Source,
};
use crate::narval::{self, NarvalSnapshot, SlurmJob};
use std::time::SystemTime;

pub fn normalize_slurm_state(raw: &str) -> RunState {
    match raw.trim().to_ascii_uppercase().as_str() {
        "RUNNING" | "COMPLETING" | "SUSPENDED" => RunState::Running,
        "PENDING" | "CONFIGURING" | "REQUEUED" | "RESIZING" => RunState::Queued,
        "COMPLETED" => RunState::Completed,
        "FAILED" | "CANCELLED" | "TIMEOUT" | "OUT_OF_MEMORY" | "NODE_FAIL" | "BOOT_FAIL"
        | "DEADLINE" | "PREEMPTED" | "REVOKED" => RunState::Failed,
        _ => RunState::Unknown,
    }
}

fn known(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()
        && !value.eq_ignore_ascii_case("unknown")
        && !value.eq_ignore_ascii_case("none"))
    .then_some(value)
}

fn run_from_job(profile: &str, job: &SlurmJob, observed: SystemTime) -> Run {
    let state = normalize_slurm_state(&job.state);
    let now = format_rfc3339(observed);
    // Les dates sacct sont en heure locale de la grappe, sans décalage : on les
    // renormalise telles quelles (UTC supposé) plutôt que d'inventer un fuseau.
    let started_at = known(&job.started_at)
        .map(normalize_datetime)
        .unwrap_or_else(|| now.clone());
    let ended_at = known(&job.ended_at).map(normalize_datetime);
    let last_activity_at = if state.is_live() {
        now
    } else {
        ended_at.clone().unwrap_or_else(|| started_at.clone())
    };
    let mut command = job.partition.clone();
    if job.cpus > 0 {
        command = format!("{} · {} cpus", command, job.cpus);
    }
    if let Some(reason) = known(&job.reason) {
        command = format!("{command} · {reason}");
    }
    Run {
        id: format!("slurm:{}", job.id),
        source: Source::Slurm,
        host: Host::Narval,
        label: if job.name.trim().is_empty() {
            job.id.clone()
        } else {
            job.name.clone()
        },
        command: command.trim_matches([' ', '·']).to_string(),
        work_dir: job.work_dir.clone(),
        state,
        started_at,
        ended_at,
        last_activity_at,
        progress: None,
        log_path: None,
        log_tail: Vec::new(),
        remote_tasks: Vec::new(),
        detail: RunDetail::Slurm {
            job_id: job.id.clone(),
            profile: profile.to_string(),
        },
    }
}

pub fn runs_from_snapshot(
    profile: &str,
    snapshot: &NarvalSnapshot,
    observed: SystemTime,
) -> Vec<Run> {
    snapshot
        .active
        .iter()
        .chain(snapshot.recent.iter())
        .map(|job| run_from_job(profile, job, observed))
        .collect()
}

#[derive(Debug, Clone)]
pub struct SlurmAdapter {
    pub profile: String,
}

impl SlurmAdapter {
    pub fn collect(&self, days: u32, observed: SystemTime) -> Result<Vec<Run>, HostError> {
        let snapshot = narval::snapshot(&self.profile, days)
            .map_err(|error| HostError::new(Host::Narval.as_str(), &error.code, error.message))?;
        Ok(runs_from_snapshot(&self.profile, &snapshot, observed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::types::parse_datetime;

    #[test]
    fn slurm_jobs_are_projected_to_runs() {
        let snapshot = narval::parse_snapshot(
            "narval",
            "65659188|M42a-full|PENDING|0:00|16|cpubase|Priority|/home/u/m42a\n\
             65659021|M42l-fit|RUNNING|1:43:18|32|cpubase|None|/home/u/m42l\n\
             __ATELIER_RECENT__\n\
             65648210|M40-final|COMPLETED|04:18:02|16|cpubase|2026-07-14T22:17|2026-07-15T02:35|/home/u/m40\n\
             65658211|M41-newer|OUT_OF_MEMORY|00:18:02|16|cpubase|2026-07-15T07:17|2026-07-15T07:35|/home/u/m41\n\
             65658212|M41-odd|WEIRD|00:18:02|16|cpubase|2026-07-15T07:17|Unknown|/home/u/m41\n",
        );
        let observed = parse_datetime("2026-07-15T12:00:00Z").unwrap();
        let runs = runs_from_snapshot("narval", &snapshot, observed);
        assert_eq!(runs.len(), 5);
        let queued = &runs[0];
        assert_eq!(queued.id, "slurm:65659188");
        assert_eq!(queued.state, RunState::Queued);
        assert_eq!(queued.host, Host::Narval);
        assert_eq!(queued.source, Source::Slurm);
        assert_eq!(
            queued.started_at, "2026-07-15T12:00:00Z",
            "squeue ne donne pas de début"
        );
        assert_eq!(queued.last_activity_at, "2026-07-15T12:00:00Z");
        assert_eq!(queued.command, "cpubase · 16 cpus · Priority");
        assert_eq!(
            queued.detail,
            RunDetail::Slurm {
                job_id: "65659188".into(),
                profile: "narval".into()
            }
        );
        assert_eq!(runs[1].state, RunState::Running);
        assert_eq!(runs[1].command, "cpubase · 32 cpus", "reason None omis");
        let by_id = |id: &str| runs.iter().find(|r| r.id == id).unwrap();
        let oom = by_id("slurm:65658211");
        assert_eq!(oom.state, RunState::Failed);
        assert_eq!(oom.ended_at.as_deref(), Some("2026-07-15T07:35:00Z"));
        assert_eq!(oom.last_activity_at, "2026-07-15T07:35:00Z");
        let done = by_id("slurm:65648210");
        assert_eq!(done.state, RunState::Completed);
        assert_eq!(done.started_at, "2026-07-14T22:17:00Z");
        assert_eq!(done.work_dir, "/home/u/m40");
        let odd = by_id("slurm:65658212");
        assert_eq!(odd.state, RunState::Unknown);
        assert!(odd.ended_at.is_none(), "Unknown n'est pas une date");
        assert_eq!(odd.last_activity_at, odd.started_at);
    }

    #[test]
    fn state_normalization_table() {
        assert_eq!(normalize_slurm_state("running"), RunState::Running);
        assert_eq!(normalize_slurm_state("CONFIGURING"), RunState::Queued);
        assert_eq!(normalize_slurm_state("CANCELLED"), RunState::Failed);
        assert_eq!(normalize_slurm_state("TIMEOUT"), RunState::Failed);
        assert_eq!(normalize_slurm_state("NODE_FAIL"), RunState::Failed);
        assert_eq!(normalize_slurm_state("COMPLETED"), RunState::Completed);
        assert_eq!(normalize_slurm_state(""), RunState::Unknown);
    }

    #[test]
    fn unknown_profile_becomes_a_host_error() {
        let err = SlurmAdapter {
            profile: "other".into(),
        }
        .collect(7, SystemTime::now())
        .unwrap_err();
        assert_eq!(err.host, "narval");
        assert_eq!(err.code, "invalid_profile");
    }
}
