//! Guetteur `zotero.sqlite` — pousse `{"type":"zoteroChanged"}` sur le bus WS
//! quand Thierry ajoute/modifie une référence Zotero, pour que le front
//! (`src/App.tsx`) rafraîchisse la bibliothèque de lui-même (le lecteur
//! `atelier-workspace::zotero` invalide déjà sa copie SQLite en lecture seule
//! sur changement de stamp — il ne manquait que le déclencheur).
//!
//! Deux sources de déclenchement :
//! - `notify` (FSEvents sur macOS) : créations, suppressions, renommages ;
//! - un relevé périodique de la taille et de la date des fichiers de la base.
//!   Indispensable sur macOS : Zotero garde `zotero.sqlite` (et, en verrou
//!   exclusif, son `-journal`) ouverts en permanence, et FSEvents ne signale
//!   une écriture qu'à la FERMETURE du descripteur. Sans ce relevé, un article
//!   ajouté dans Zotero n'apparaissait qu'au prochain rechargement manuel.
//!
//! Zotero écrit en rafale (plusieurs touches par opération de métadonnées) :
//! on débounce pour ne publier qu'un seul événement par rafale, avec une
//! attente maximale pour qu'une longue activité (indexation plein texte,
//! synchronisation) n'empêche pas l'article d'apparaître. Le callback `notify`
//! tourne sur son propre thread — on le relaie via un canal tokio mpsc pour ne
//! jamais bloquer le runtime.

use crate::state::AppState;
use crate::ws_router::json_msg;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::{Instant, MissedTickBehavior};

const WATCHED_FILES: [&str; 3] = [
    "zotero.sqlite",
    "zotero.sqlite-wal",
    "zotero.sqlite-journal",
];

/// Réglages du guetteur ; [`WatchConfig::default`] en production, valeurs
/// courtes dans les tests.
#[derive(Clone, Copy, Debug)]
pub struct WatchConfig {
    /// Silence requis après la dernière écriture avant de publier.
    pub debounce: Duration,
    /// Délai maximal entre la première écriture d'une rafale et la publication.
    pub max_wait: Duration,
    /// Intervalle du relevé taille/date des fichiers de la base.
    pub poll_every: Duration,
    /// Brancher aussi `notify` (désactivable pour tester le relevé seul).
    pub fs_events: bool,
}

impl Default for WatchConfig {
    fn default() -> Self {
        Self {
            debounce: Duration::from_secs(2),
            max_wait: Duration::from_secs(8),
            poll_every: Duration::from_secs(1),
            fs_events: true,
        }
    }
}

fn is_relevant(event: &Event) -> bool {
    if !matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    ) {
        return false;
    }
    event.paths.iter().any(|path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| WATCHED_FILES.contains(&name))
    })
}

/// Taille et date de modification de chaque fichier de la base (absent =
/// `None`). `stat` voit les écritures faites par un descripteur resté ouvert,
/// contrairement à FSEvents.
type Stamp = [Option<(SystemTime, u64)>; 3];

fn stamp(dir: &Path) -> Stamp {
    WATCHED_FILES.map(|name| {
        std::fs::metadata(dir.join(name)).ok().map(|meta| {
            (
                meta.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                meta.len(),
            )
        })
    })
}

/// Démarre le guetteur avec les réglages par défaut.
pub fn spawn_zotero_watcher(state: AppState, dir: PathBuf) -> Option<JoinHandle<()>> {
    spawn_zotero_watcher_with(state, dir, WatchConfig::default())
}

/// Démarre le guetteur sur `dir` (non récursif). Retourne `None` (non fatal)
/// si `dir` n'existe pas. Un échec de `notify` n'est pas fatal non plus : le
/// relevé périodique suffit à lui seul.
pub fn spawn_zotero_watcher_with(
    state: AppState,
    dir: PathBuf,
    config: WatchConfig,
) -> Option<JoinHandle<()>> {
    if !dir.is_dir() {
        eprintln!(
            "Zotero: répertoire absent ({}) — guetteur désactivé",
            dir.display()
        );
        return None;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<notify::Result<Event>>();
    let watcher = if config.fs_events {
        start_fs_events(&dir, tx)
    } else {
        drop(tx);
        None
    };

    eprintln!("Zotero: guetteur actif sur {}", dir.display());

    let handle = tokio::spawn(async move {
        // Garder le watcher vivant pour la durée de la tâche.
        let mut events_open = watcher.is_some();
        let _watcher = watcher;
        let mut last_stamp = stamp(&dir);
        let mut poll = tokio::time::interval(config.poll_every);
        poll.set_missed_tick_behavior(MissedTickBehavior::Delay);
        // (début de la rafale, dernière écriture vue)
        let mut burst: Option<(Instant, Instant)> = None;
        loop {
            let deadline =
                burst.map(|(first, last)| (last + config.debounce).min(first + config.max_wait));
            let changed = tokio::select! {
                event = rx.recv(), if events_open => match event {
                    Some(Ok(event)) => is_relevant(&event),
                    Some(Err(_)) => false,
                    None => {
                        events_open = false;
                        false
                    }
                },
                _ = poll.tick() => {
                    let current = stamp(&dir);
                    let changed = current != last_stamp;
                    last_stamp = current;
                    changed
                }
                _ = sleep_until_opt(deadline) => {
                    state.publish(json_msg(json!({"type":"zoteroChanged"})));
                    burst = None;
                    continue;
                }
            };
            if changed {
                let now = Instant::now();
                burst = Some(match burst {
                    Some((first, _)) => (first, now),
                    None => (now, now),
                });
            }
        }
    });

    Some(handle)
}

async fn sleep_until_opt(deadline: Option<Instant>) {
    match deadline {
        Some(deadline) => tokio::time::sleep_until(deadline).await,
        None => std::future::pending().await,
    }
}

fn start_fs_events(
    dir: &Path,
    tx: mpsc::UnboundedSender<notify::Result<Event>>,
) -> Option<RecommendedWatcher> {
    let watcher_result: notify::Result<RecommendedWatcher> =
        notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        });
    let mut watcher = match watcher_result {
        Ok(watcher) => watcher,
        Err(error) => {
            eprintln!("Zotero: échec création du guetteur ({error}) — relevé seul");
            return None;
        }
    };
    if let Err(error) = watcher.watch(dir, RecursiveMode::NonRecursive) {
        eprintln!(
            "Zotero: échec attache du guetteur sur {} ({error}) — relevé seul",
            dir.display()
        );
        return None;
    }
    Some(watcher)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use serde_json::Value;
    use std::fs;
    use std::time::Duration as StdDuration;
    use tempfile::tempdir;
    use tokio::time::timeout;

    fn test_state(app_dir: PathBuf) -> AppState {
        AppState::new(
            AppPaths::from_app_dir(app_dir),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        )
    }

    fn fast(fs_events: bool) -> WatchConfig {
        WatchConfig {
            debounce: StdDuration::from_millis(200),
            max_wait: StdDuration::from_millis(1500),
            poll_every: StdDuration::from_millis(50),
            fs_events,
        }
    }

    async fn recv_zotero_changed(
        bus: &mut tokio::sync::broadcast::Receiver<String>,
        wait: StdDuration,
    ) -> bool {
        match timeout(wait, bus.recv()).await {
            Ok(Ok(raw)) => {
                let value: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
                value.get("type").and_then(|v| v.as_str()) == Some("zoteroChanged")
            }
            _ => false,
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn burst_of_wal_writes_publishes_one_zotero_changed() {
        let app_dir = tempdir().unwrap();
        let zotero_dir = tempdir().unwrap();
        let state = test_state(app_dir.path().to_path_buf());
        let mut bus = state.subscribe_bus();

        let _handle =
            spawn_zotero_watcher_with(state.clone(), zotero_dir.path().to_path_buf(), fast(true))
                .expect("watcher should start on a real directory");

        let wal_path = zotero_dir.path().join("zotero.sqlite-wal");
        for i in 0..3 {
            fs::write(&wal_path, format!("burst-{i}")).unwrap();
            tokio::time::sleep(StdDuration::from_millis(30)).await;
        }

        assert!(
            recv_zotero_changed(&mut bus, StdDuration::from_millis(3000)).await,
            "expected exactly one zoteroChanged after the burst"
        );
        assert!(
            !recv_zotero_changed(&mut bus, StdDuration::from_millis(400)).await,
            "no second zoteroChanged should follow within 400ms"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn unrelated_files_are_ignored() {
        let app_dir = tempdir().unwrap();
        let zotero_dir = tempdir().unwrap();
        let state = test_state(app_dir.path().to_path_buf());
        let mut bus = state.subscribe_bus();

        let _handle =
            spawn_zotero_watcher_with(state.clone(), zotero_dir.path().to_path_buf(), fast(true))
                .expect("watcher should start on a real directory");

        fs::write(zotero_dir.path().join("notes.txt"), "hello").unwrap();
        fs::write(zotero_dir.path().join("zotero.sqlite.bak"), "hello").unwrap();

        assert!(
            !recv_zotero_changed(&mut bus, StdDuration::from_millis(600)).await,
            "unrelated files must not trigger zoteroChanged"
        );
    }

    /// Le cas macOS : Zotero garde `zotero.sqlite` ouvert et FSEvents ne dit
    /// rien avant la fermeture. Le relevé taille/date doit suffire seul.
    #[tokio::test(flavor = "multi_thread")]
    async fn writes_through_a_held_open_file_are_seen_without_fs_events() {
        use std::io::Write;
        let app_dir = tempdir().unwrap();
        let zotero_dir = tempdir().unwrap();
        let db_path = zotero_dir.path().join("zotero.sqlite");
        let mut db = fs::File::create(&db_path).unwrap();
        db.write_all(b"initial").unwrap();
        db.sync_all().unwrap();
        let state = test_state(app_dir.path().to_path_buf());
        let mut bus = state.subscribe_bus();

        let _handle =
            spawn_zotero_watcher_with(state.clone(), zotero_dir.path().to_path_buf(), fast(false))
                .expect("watcher should start on a real directory");
        tokio::time::sleep(StdDuration::from_millis(150)).await;
        assert!(
            !recv_zotero_changed(&mut bus, StdDuration::from_millis(400)).await,
            "an untouched database must not trigger zoteroChanged"
        );

        db.write_all(b" + new item").unwrap();
        db.sync_all().unwrap();

        assert!(
            recv_zotero_changed(&mut bus, StdDuration::from_millis(3000)).await,
            "a write through the open handle must trigger zoteroChanged"
        );
        drop(db);
    }

    /// Une activité continue (indexation plein texte, synchro) repousse le
    /// débounce indéfiniment : l'attente maximale force quand même la
    /// publication.
    #[tokio::test(flavor = "multi_thread")]
    async fn continuous_writes_still_publish_after_max_wait() {
        let app_dir = tempdir().unwrap();
        let zotero_dir = tempdir().unwrap();
        let state = test_state(app_dir.path().to_path_buf());
        let mut bus = state.subscribe_bus();

        let _handle =
            spawn_zotero_watcher_with(state.clone(), zotero_dir.path().to_path_buf(), fast(false))
                .expect("watcher should start on a real directory");

        let db_path = zotero_dir.path().join("zotero.sqlite");
        let writer = tokio::spawn(async move {
            for i in 0..60 {
                fs::write(&db_path, format!("write-{i}")).unwrap();
                tokio::time::sleep(StdDuration::from_millis(100)).await;
            }
        });

        assert!(
            recv_zotero_changed(&mut bus, StdDuration::from_millis(3000)).await,
            "max_wait must publish while writes keep coming"
        );
        writer.abort();
    }

    #[tokio::test]
    async fn missing_dir_is_not_fatal() {
        let app_dir = tempdir().unwrap();
        let state = test_state(app_dir.path().to_path_buf());
        let missing = app_dir.path().join("does-not-exist");

        let handle = spawn_zotero_watcher_with(state, missing, fast(true));
        assert!(handle.is_none());
    }
}
