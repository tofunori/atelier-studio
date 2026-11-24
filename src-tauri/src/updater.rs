//! Mises à jour d'Atelier (2026-11-24) : vérifie la dernière release GitHub,
//! télécharge le paquet signé, l'installe et redémarre.
//!
//! Tout passe par `tauri-plugin-updater` piloté depuis Rust (règle
//! Rust-first) : l'interface n'appelle que les commandes de ce module.
//! - macOS : remplace `Atelier.app` par `Atelier.app.tar.gz` de la release ;
//! - Linux AppImage : réécrit l'AppImage en place ;
//! - Linux .deb : `pkexec dpkg -i` (le système demande le mot de passe).
//!
//! Le manifeste `latest.json` est assemblé par `.github/workflows/release.yml`
//! (`scripts/updater-manifest.sh`) ; la signature de chaque paquet est
//! vérifiée contre la clé publique de `tauri.conf.json` avant installation.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Page des versions : repli « Télécharger » quand l'installation échoue.
pub const RELEASES_URL: &str = "https://github.com/tofunori/atelier-studio/releases/latest";
pub const PROGRESS_EVENT: &str = "atelier-update-progress";
pub const INSTALLING_EVENT: &str = "atelier-update-installing";

/// Vérification automatique : seulement dans les builds de release (variable
/// posée par release.yml à la compilation). Les builds locaux (relance
/// depuis main) ne proposent pas d'écraser l'app par la release ; le bouton
/// « Rechercher » des réglages marche partout. `ATELIER_UPDATE_CHECK=1` force
/// la vérification automatique pour un essai.
fn auto_check_enabled(release_build: bool, forced: Option<&str>) -> bool {
    match forced.map(str::trim) {
        Some("1") | Some("true") => true,
        Some("0") | Some("false") => false,
        _ => release_build,
    }
}

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    current_version: String,
    auto_check: bool,
    releases_url: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current_version: String,
    notes: Option<String>,
    date: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

#[tauri::command]
pub fn update_status(app: AppHandle) -> UpdateStatus {
    UpdateStatus {
        current_version: app.package_info().version.to_string(),
        auto_check: auto_check_enabled(
            option_env!("ATELIER_RELEASE_BUILD").is_some_and(|v| v == "1"),
            std::env::var("ATELIER_UPDATE_CHECK").ok().as_deref(),
        ),
        releases_url: RELEASES_URL,
    }
}

/// `None` : Atelier est à jour. L'adresse du manifeste peut être remplacée
/// par `ATELIER_UPDATE_ENDPOINT` (essais) : la signature reste vérifiée
/// contre la clé compilée, un faux manifeste ne fait rien installer.
#[tauri::command]
pub async fn update_check(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let mut builder = app.updater_builder().timeout(Duration::from_secs(30));
    if let Ok(endpoint) = std::env::var("ATELIER_UPDATE_ENDPOINT") {
        let url = endpoint
            .parse()
            .map_err(|e| format!("ATELIER_UPDATE_ENDPOINT : {e}"))?;
        builder = builder.endpoints(vec![url]).map_err(|e| e.to_string())?;
    }
    let update = builder
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    });
    *pending.0.lock().map_err(|e| e.to_string())? = update;
    Ok(info)
}

/// Télécharge, vérifie, installe puis redémarre. L'interface a déjà fait
/// confirmer les documents modifiés et vidé leurs brouillons : la garde de
/// sortie est levée pour que le redémarrage ne soit pas retenu.
#[tauri::command]
pub async fn update_install(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "aucune mise à jour en attente".to_string())?;
    let mut downloaded: u64 = 0;
    let mut last_emit: Option<Instant> = None;
    let progress_app = app.clone();
    let installing_app = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let due = last_emit.is_none_or(|t| t.elapsed() >= Duration::from_millis(100));
                if due || total == Some(downloaded) {
                    last_emit = Some(Instant::now());
                    let _ = progress_app.emit(PROGRESS_EVENT, Progress { downloaded, total });
                }
            },
            move || {
                let _ = installing_app.emit(INSTALLING_EVENT, ());
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    if let Some(guard) = app.try_state::<atelier_workspace::QuitGuard>() {
        guard.confirm();
    }
    app.restart();
}

#[tauri::command]
pub fn update_open_releases(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(RELEASES_URL, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::auto_check_enabled;

    #[test]
    fn release_builds_check_by_default() {
        assert!(auto_check_enabled(true, None));
        assert!(!auto_check_enabled(false, None));
    }

    #[test]
    fn environment_forces_either_way() {
        assert!(auto_check_enabled(false, Some("1")));
        assert!(auto_check_enabled(false, Some(" true ")));
        assert!(!auto_check_enabled(true, Some("0")));
        assert!(auto_check_enabled(true, Some("autre")));
    }
}
