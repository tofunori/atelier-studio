//! Garde le Mac éveillé pendant qu'un tour tourne.
//!
//! Toutes les 5 s : si au moins un tour tourne (`HarnessManager`), un
//! `caffeinate -i -w {pid du runtime}` reste en vie (macOS seulement) ; il
//! est tué 30 s après la fin du dernier tour, et à l'arrêt du serveur
//! (`abort` → `kill_on_drop`). `-w pid` le fait aussi sortir si le runtime
//! meurt sans passer par l'arrêt propre. `ATELIER_KEEP_AWAKE=0` désactive.

use crate::state::AppState;
use std::time::{Duration, Instant};
use tokio::task::JoinHandle;

const POLL: Duration = Duration::from_secs(5);
/// Délai de grâce après le dernier tour : un enchaînement de tours (file
/// d'attente, relance) ne relance pas `caffeinate` à chaque fois.
const GRACE: Duration = Duration::from_secs(30);
const CAFFEINATE: &str = "/usr/bin/caffeinate";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Action {
    Start,
    Stop,
    Keep,
}

/// Décision pure : `running` tours en cours, `holding` = caffeinate vivant,
/// `last_busy` = dernier instant où un tour tournait.
pub(crate) fn decide(running: usize, holding: bool, last_busy: Option<Instant>, now: Instant) -> Action {
    if running > 0 {
        return if holding { Action::Keep } else { Action::Start };
    }
    let quiet_long_enough = last_busy.is_none_or(|at| now.saturating_duration_since(at) >= GRACE);
    if holding && quiet_long_enough {
        Action::Stop
    } else {
        Action::Keep
    }
}

/// `ATELIER_KEEP_AWAKE=0` (ou false/off/no) désactive ; absent = actif.
pub(crate) fn enabled(value: Option<&str>) -> bool {
    !matches!(
        value.map(|v| v.trim().to_ascii_lowercase()).as_deref(),
        Some("0" | "false" | "off" | "no")
    )
}

/// Démarre le gardien (macOS, sauf désactivation). `abort()` du handle tue
/// `caffeinate`.
pub fn spawn(state: AppState) -> Option<JoinHandle<()>> {
    if !cfg!(target_os = "macos") || !enabled(std::env::var("ATELIER_KEEP_AWAKE").ok().as_deref()) {
        return None;
    }
    Some(tokio::spawn(run(state)))
}

async fn run(state: AppState) {
    let mut ticker = tokio::time::interval(POLL);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut child: Option<tokio::process::Child> = None;
    let mut last_busy: Option<Instant> = None;
    let mut warned = false;
    loop {
        ticker.tick().await;
        // Un caffeinate sorti de lui-même (tué à la main) sera relancé.
        if let Some(running) = child.as_mut() {
            if !matches!(running.try_wait(), Ok(None)) {
                child = None;
            }
        }
        let running = state.harness().running_count().await;
        let now = Instant::now();
        if running > 0 {
            last_busy = Some(now);
        }
        match decide(running, child.is_some(), last_busy, now) {
            Action::Start => match caffeinate() {
                Ok(started) => {
                    tracing::info!(running, "tour en cours : Mac tenu éveillé (caffeinate)");
                    child = Some(started);
                }
                Err(error) => {
                    if !warned {
                        tracing::warn!(%error, "caffeinate indisponible — le Mac peut se mettre en veille");
                        warned = true;
                    }
                }
            },
            Action::Stop => {
                if let Some(mut started) = child.take() {
                    let _ = started.kill().await;
                    tracing::info!("plus aucun tour : veille de nouveau permise");
                }
            }
            Action::Keep => {}
        }
    }
}

fn caffeinate() -> std::io::Result<tokio::process::Child> {
    tokio::process::Command::new(CAFFEINATE)
        .args(["-i", "-w", &std::process::id().to_string()])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_once_while_a_turn_runs() {
        let now = Instant::now();
        assert_eq!(decide(1, false, Some(now), now), Action::Start);
        assert_eq!(decide(3, true, Some(now), now), Action::Keep);
        assert_eq!(decide(0, false, None, now), Action::Keep);
    }

    #[test]
    fn stops_only_after_thirty_quiet_seconds() {
        let busy_at = Instant::now();
        assert_eq!(decide(0, true, Some(busy_at), busy_at + Duration::from_secs(5)), Action::Keep);
        assert_eq!(decide(0, true, Some(busy_at), busy_at + Duration::from_secs(29)), Action::Keep);
        assert_eq!(decide(0, true, Some(busy_at), busy_at + GRACE), Action::Stop);
        assert_eq!(decide(0, true, None, busy_at), Action::Stop);
        // Un nouveau tour pendant la grâce garde le même caffeinate.
        assert_eq!(decide(1, true, Some(busy_at), busy_at + Duration::from_secs(10)), Action::Keep);
        // Déjà arrêté : rien à faire.
        assert_eq!(decide(0, false, Some(busy_at), busy_at + GRACE * 2), Action::Keep);
    }

    #[test]
    fn env_switch() {
        assert!(enabled(None));
        assert!(enabled(Some("1")));
        assert!(enabled(Some("")));
        for off in ["0", "false", "OFF", " no "] {
            assert!(!enabled(Some(off)), "{off}");
        }
    }

    #[cfg(not(target_os = "macos"))]
    #[tokio::test]
    async fn never_spawns_outside_macos() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "test".into(),
            "h".into(),
            "/tmp".into(),
        );
        assert!(spawn(state).is_none());
    }
}
