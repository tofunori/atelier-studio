//! Modèle de données de la surface Calculs (contrat WS gelé, camelCase).

use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Hôte observé. Sérialisé en minuscules (`"mac"`, `"nas"`, `"narval"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Host {
    Mac,
    Nas,
    Narval,
}

impl Host {
    pub const ALL: [Host; 3] = [Host::Mac, Host::Nas, Host::Narval];

    pub fn as_str(self) -> &'static str {
        match self {
            Host::Mac => "mac",
            Host::Nas => "nas",
            Host::Narval => "narval",
        }
    }

    /// Analyse tolérante d'un nom d'hôte reçu du front ; `None` si inconnu.
    pub fn parse(raw: &str) -> Option<Host> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "mac" | "local" => Some(Host::Mac),
            "nas" => Some(Host::Nas),
            "narval" | "slurm" => Some(Host::Narval),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Local,
    Nas,
    Slurm,
    Provider,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunState {
    Queued,
    Running,
    Completed,
    Failed,
    Unknown,
}

impl RunState {
    /// Analyse d'un état de manifeste `atelier-run` (`queued|running|completed|failed`).
    pub fn parse(raw: &str) -> RunState {
        match raw.trim().to_ascii_lowercase().as_str() {
            "queued" => RunState::Queued,
            "running" => RunState::Running,
            "completed" => RunState::Completed,
            "failed" => RunState::Failed,
            _ => RunState::Unknown,
        }
    }

    pub fn is_live(self) -> bool {
        matches!(self, RunState::Running | RunState::Queued)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub current: u64,
    pub total: u64,
    pub unit: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RunDetail {
    Local {
        pid: Option<u32>,
    },
    Docker {
        container: String,
    },
    Unit {
        unit: String,
    },
    #[serde(rename_all = "camelCase")]
    Slurm {
        job_id: String,
        profile: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteTaskSummary {
    pub provider: String,
    pub active: u32,
    pub completed: u32,
    pub failed: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub source: Source,
    pub host: Host,
    pub label: String,
    pub command: String,
    pub work_dir: String,
    pub state: RunState,
    pub started_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    pub last_activity_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<Progress>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
    pub log_tail: Vec<String>,
    pub remote_tasks: Vec<RemoteTaskSummary>,
    pub detail: RunDetail,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, thiserror::Error)]
#[error("{host}: {message}")]
pub struct HostError {
    pub host: String,
    pub code: String,
    pub message: String,
}

impl HostError {
    pub fn new(host: &str, code: &str, message: impl Into<String>) -> Self {
        Self {
            host: host.into(),
            code: code.into(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub observed_at: String,
    pub runs: Vec<Run>,
    pub errors: Vec<HostError>,
}

/// Résultat d'un oubli de run : le dossier a été déplacé dans `.archive/`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForgetOutcome {
    pub run_id: String,
    pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogChunk {
    pub lines: Vec<String>,
    pub truncated: bool,
}

/// Longueur maximale d'une commande affichée (spec : ≤ 200 caractères).
pub const MAX_COMMAND_CHARS: usize = 200;
/// Lignes de log embarquées dans un instantané.
pub const LOG_TAIL_LINES: usize = 40;

pub fn truncate_command(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().count() <= MAX_COMMAND_CHARS {
        trimmed.to_string()
    } else {
        let mut out: String = trimmed.chars().take(MAX_COMMAND_CHARS - 1).collect();
        out.push('…');
        out
    }
}

pub fn last_lines(text: &str, n: usize) -> Vec<String> {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].iter().map(|line| line.to_string()).collect()
}

// ---- temps ---------------------------------------------------------------

/// Formate un instant en RFC 3339 UTC à la seconde (`2026-09-06T13:02:11Z`),
/// le même format que celui écrit par `scripts/atelier-run`.
pub fn format_rfc3339(time: SystemTime) -> String {
    let secs = time
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%SZ").to_string())
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".into())
}

/// Analyse tolérante d'une date : RFC 3339 avec décalage, format docker
/// (`2026-09-04 08:12:33 -0400 EDT`), format systemd
/// (`Sat 2026-09-06 12:24:23 EDT` — jour de semaine ignoré, abréviation de
/// fuseau sans décalage → naïf), ou naïf `YYYY-MM-DDTHH:MM[:SS]` (interprété
/// en UTC, faute de mieux). `None` si rien ne colle.
pub fn parse_datetime(raw: &str) -> Option<SystemTime> {
    use chrono::{DateTime, NaiveDateTime};
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    // systemd : `Sat 2026-09-06 …` → on retire le jour de semaine
    let raw = raw
        .split_once(' ')
        .filter(|(day, rest)| {
            day.len() == 3
                && day.chars().all(|c| c.is_ascii_alphabetic())
                && rest.starts_with(|c: char| c.is_ascii_digit())
        })
        .map(|(_, rest)| rest.trim_start())
        .unwrap_or(raw);
    if let Ok(dt) = DateTime::parse_from_rfc3339(raw) {
        return Some(to_system_time(dt.timestamp()));
    }
    // docker : `2026-09-04 08:12:33 -0400 EDT` → on retire l'abréviation finale
    let without_abbrev = raw
        .rsplit_once(' ')
        .filter(|(_, tail)| tail.chars().all(|c| c.is_ascii_alphabetic()))
        .map(|(head, _)| head)
        .unwrap_or(raw);
    for fmt in ["%Y-%m-%d %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z"] {
        if let Ok(dt) = DateTime::parse_from_str(without_abbrev, fmt) {
            return Some(to_system_time(dt.timestamp()));
        }
    }
    for fmt in [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
    ] {
        if let Ok(dt) = NaiveDateTime::parse_from_str(without_abbrev, fmt) {
            return Some(to_system_time(dt.and_utc().timestamp()));
        }
    }
    None
}

fn to_system_time(secs: i64) -> SystemTime {
    if secs >= 0 {
        UNIX_EPOCH + Duration::from_secs(secs as u64)
    } else {
        UNIX_EPOCH - Duration::from_secs(secs.unsigned_abs())
    }
}

/// Renormalise une date lisible en RFC 3339 UTC ; renvoie la chaîne brute si
/// elle n'est pas analysable (jamais de valeur inventée).
pub fn normalize_datetime(raw: &str) -> String {
    parse_datetime(raw)
        .map(format_rfc3339)
        .unwrap_or_else(|| raw.trim().to_string())
}

/// Analyse une durée relative docker (`3 hours ago`, `About a minute ago`,
/// `Less than a second ago`, `2 days`). `None` si non reconnue.
pub fn parse_relative_duration(raw: &str) -> Option<Duration> {
    let lower = raw
        .trim()
        .trim_end_matches(" ago")
        .trim()
        .to_ascii_lowercase();
    if lower.starts_with("less than") {
        return Some(Duration::from_secs(0));
    }
    let mut parts = lower.split_whitespace();
    let first = parts.next()?;
    let (count, unit) = if first == "about" || first == "a" || first == "an" {
        let unit = if first == "about" {
            parts.next()?
        } else {
            first
        };
        if unit == "a" || unit == "an" {
            (1u64, parts.next()?)
        } else if let Ok(n) = unit.parse::<u64>() {
            (n, parts.next()?)
        } else {
            (1u64, unit)
        }
    } else {
        (first.parse::<u64>().ok()?, parts.next()?)
    };
    let unit = unit.trim_end_matches('s');
    let secs = match unit {
        "second" => 1,
        "minute" => 60,
        "hour" => 3_600,
        "day" => 86_400,
        "week" => 7 * 86_400,
        "month" => 30 * 86_400,
        "year" => 365 * 86_400,
        _ => return None,
    };
    Some(Duration::from_secs(count * secs))
}

/// Date limite de la fenêtre d'observation (`days` jours avant `now`).
pub fn window_start(now: SystemTime, days: u32) -> SystemTime {
    now - Duration::from_secs(u64::from(days.max(1)) * 86_400)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_are_normalized_to_utc_rfc3339() {
        assert_eq!(
            normalize_datetime("2026-09-04 08:12:33 -0400 EDT"),
            "2026-09-04T12:12:33Z"
        );
        assert_eq!(
            normalize_datetime("2026-09-06T13:02:11Z"),
            "2026-09-06T13:02:11Z"
        );
        assert_eq!(
            normalize_datetime("2026-07-15T09:58"),
            "2026-07-15T09:58:00Z"
        );
        assert_eq!(
            normalize_datetime("Sat 2026-09-06 12:24:23 EDT"),
            "2026-09-06T12:24:23Z",
            "systemd : jour de semaine ignoré, abréviation sans décalage → naïf UTC"
        );
        assert_eq!(
            normalize_datetime("Sat 2026-09-06 12:24:23 -0400 EDT"),
            "2026-09-06T16:24:23Z"
        );
        assert_eq!(normalize_datetime("Unknown"), "Unknown");
        assert_eq!(normalize_datetime("n/a"), "n/a");
        assert!(parse_datetime("").is_none());
    }

    #[test]
    fn relative_durations_cover_docker_phrasing() {
        assert_eq!(
            parse_relative_duration("3 hours ago"),
            Some(Duration::from_secs(3 * 3_600))
        );
        assert_eq!(
            parse_relative_duration("About a minute ago"),
            Some(Duration::from_secs(60))
        );
        assert_eq!(
            parse_relative_duration("About an hour ago"),
            Some(Duration::from_secs(3_600))
        );
        assert_eq!(
            parse_relative_duration("2 days"),
            Some(Duration::from_secs(2 * 86_400))
        );
        assert_eq!(
            parse_relative_duration("Less than a second ago"),
            Some(Duration::from_secs(0))
        );
        assert_eq!(parse_relative_duration("bientôt"), None);
    }

    #[test]
    fn run_detail_is_tagged_by_kind() {
        let local = serde_json::to_value(RunDetail::Local { pid: Some(12) }).unwrap();
        assert_eq!(local, serde_json::json!({"kind":"local","pid":12}));
        let slurm = serde_json::to_value(RunDetail::Slurm {
            job_id: "1".into(),
            profile: "narval".into(),
        })
        .unwrap();
        assert_eq!(
            slurm,
            serde_json::json!({"kind":"slurm","jobId":"1","profile":"narval"})
        );
        let unit = serde_json::to_value(RunDetail::Unit {
            unit: "a.service".into(),
        })
        .unwrap();
        assert_eq!(unit, serde_json::json!({"kind":"unit","unit":"a.service"}));
    }

    #[test]
    fn command_is_capped_at_200_chars() {
        let long = "x".repeat(500);
        assert_eq!(truncate_command(&long).chars().count(), MAX_COMMAND_CHARS);
        assert_eq!(truncate_command("  ls -la "), "ls -la");
    }
}
