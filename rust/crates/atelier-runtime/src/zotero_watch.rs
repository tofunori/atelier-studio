//! Guetteur `zotero.sqlite` — pousse `{"type":"zoteroChanged"}` sur le bus WS
//! quand Thierry ajoute/modifie une référence Zotero, pour que le front
//! (`src/App.tsx`) rafraîchisse la bibliothèque de lui-même (le lecteur
//! `atelier-workspace::zotero` invalide déjà sa copie SQLite en lecture seule
//! sur changement de stamp — il ne manquait que le déclencheur).
//!
//! Zotero écrit en rafale (plusieurs touches de `zotero.sqlite-wal` par
//! opération de métadonnées) : on débounce pour ne publier qu'un seul
//! événement par rafale. Le callback `notify` tourne sur son propre thread —
//! on le relaie via un canal tokio mpsc pour ne jamais bloquer le runtime.

use crate::state::AppState;
use crate::ws_router::json_msg;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde_json::json;
use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

const WATCHED_FILES: [&str; 3] = [
    "zotero.sqlite",
    "zotero.sqlite-wal",
    "zotero.sqlite-journal",
];

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

/// Démarre le guetteur avec le débounce par défaut (2 s).
pub fn spawn_zotero_watcher(state: AppState, dir: PathBuf) -> Option<JoinHandle<()>> {
    spawn_zotero_watcher_with(state, dir, Duration::from_secs(2))
}

/// Démarre le guetteur sur `dir` (non récursif) ; débounce configurable pour
/// les tests. Retourne `None` (non fatal) si `dir` n'existe pas.
pub fn spawn_zotero_watcher_with(
    state: AppState,
    dir: PathBuf,
    debounce: Duration,
) -> Option<JoinHandle<()>> {
    if !dir.is_dir() {
        eprintln!(
            "Zotero: répertoire absent ({}) — guetteur désactivé",
            dir.display()
        );
        return None;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<notify::Result<Event>>();
    let watcher_result: notify::Result<RecommendedWatcher> =
        notify::recommended_watcher(move |event| {
            let _ = tx.send(event);
        });
    let mut watcher = match watcher_result {
        Ok(watcher) => watcher,
        Err(error) => {
            eprintln!("Zotero: échec création du guetteur ({error}) — désactivé");
            return None;
        }
    };
    if let Err(error) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
        eprintln!(
            "Zotero: échec attache du guetteur sur {} ({error}) — désactivé",
            dir.display()
        );
        return None;
    }

    eprintln!("Zotero: guetteur actif sur {}", dir.display());

    let handle = tokio::spawn(async move {
        // Garder le watcher vivant pour la durée de la tâche.
        let _watcher = watcher;
        let mut pending = false;
        loop {
            if pending {
                tokio::select! {
                    Some(event) = rx.recv() => {
                        if matches!(event, Ok(event) if is_relevant(&event)) {
                            // Une nouvelle rafale repousse le débounce.
                        }
                    }
                    _ = tokio::time::sleep(debounce) => {
                        state.publish(json_msg(json!({"type":"zoteroChanged"})));
                        pending = false;
                    }
                }
            } else {
                match rx.recv().await {
                    Some(Ok(event)) if is_relevant(&event) => {
                        pending = true;
                    }
                    Some(_) => {}
                    None => break,
                }
            }
        }
    });

    Some(handle)
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

        let _handle = spawn_zotero_watcher_with(
            state.clone(),
            zotero_dir.path().to_path_buf(),
            StdDuration::from_millis(200),
        )
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

        let _handle = spawn_zotero_watcher_with(
            state.clone(),
            zotero_dir.path().to_path_buf(),
            StdDuration::from_millis(200),
        )
        .expect("watcher should start on a real directory");

        fs::write(zotero_dir.path().join("notes.txt"), "hello").unwrap();
        fs::write(zotero_dir.path().join("zotero.sqlite.bak"), "hello").unwrap();

        assert!(
            !recv_zotero_changed(&mut bus, StdDuration::from_millis(600)).await,
            "unrelated files must not trigger zoteroChanged"
        );
    }

    #[tokio::test]
    async fn missing_dir_is_not_fatal() {
        let app_dir = tempdir().unwrap();
        let state = test_state(app_dir.path().to_path_buf());
        let missing = app_dir.path().join("does-not-exist");

        let handle = spawn_zotero_watcher_with(state, missing, StdDuration::from_millis(200));
        assert!(handle.is_none());
    }
}
