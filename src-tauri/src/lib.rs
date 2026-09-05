mod appsnap;
mod atelier;
mod boot_metrics;
mod browser;
mod identity;
mod local_image;
mod macos_badge_permission;
mod process_registry;
mod remote_gateway;
mod sidecar;
mod ui_state;

use std::path::{Path, PathBuf};
use tauri::Manager;

/// Ancien identifiant de bundle (scaffold Tauri), avant le renommage vers
/// `com.tofunori.atelier`. Les vraies données applicatives (projets, réglages,
/// threads) vivent hors identifiant (`~/Library/Application Support/atelier-studio`,
/// voir `rust/crates/atelier-runtime/src/paths.rs`) et ne sont pas concernées.
/// Seul le dossier de captures AppSnap est dérivé de `app_data_dir()`, donc de
/// l'identifiant (`src-tauri/src/appsnap.rs`) : on le migre une fois vers le
/// nouveau dossier pour ne pas perdre les captures existantes.
const OLD_BUNDLE_IDENTIFIER: &str = "com.tofunori.tauri-app";

/// Renomme `<support_root>/<old_identifier>` en `<support_root>/<new_identifier>`
/// si l'ancien dossier existe et que le nouveau n'existe pas encore. Chemins
/// injectés pour rester testable sans toucher au vrai `~/Library`.
fn migrate_app_data_dir(support_root: &Path, old_identifier: &str, new_identifier: &str) {
    let old_dir = support_root.join(old_identifier);
    let new_dir = support_root.join(new_identifier);
    if old_dir.is_dir() && !new_dir.exists() {
        if let Err(error) = std::fs::rename(&old_dir, &new_dir) {
            eprintln!(
                "[migrate_app_data_dir] could not migrate {} -> {}: {error}",
                old_dir.display(),
                new_dir.display()
            );
        }
    }
}

fn application_support_root() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join("Library/Application Support"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let boot_clock = boot_metrics::BootClock::new();
    let _ = fix_path_env::fix();
    tauri::Builder::default()
        .manage(boot_clock)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let new_identifier = app.config().identifier.clone();
            if let Some(support_root) = application_support_root() {
                migrate_app_data_dir(&support_root, OLD_BUNDLE_IDENTIFIER, &new_identifier);
            }
            app.manage(appsnap::AppSnapManager::new(app.handle()));
            macos_badge_permission::request_badge_authorization_native();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            atelier::start_atelier,
            remote_gateway::remote_device_action,
            atelier::gallery_token,
            appsnap::appsnap_get_state,
            appsnap::appsnap_read_capture,
            appsnap::appsnap_request_permissions,
            appsnap::appsnap_set_enabled,
            local_image::local_image_read,
            macos_badge_permission::request_badge_authorization,
            macos_badge_permission::set_badge_count,
            sidecar::sidecar_port,
            browser::browser_show,
            browser::browser_bounds,
            browser::browser_hide,
            browser::browser_show_again,
            browser::browser_close,
            browser::browser_eval,
            browser::browser_capture_selection,
            browser::browser_capture_page,
            browser::browser_import_vivaldi,
            browser::browser_url,
            browser::browser_probe,
            boot_metrics::boot_clock_elapsed_ms,
            boot_metrics::record_boot_metrics,
            ui_state::ui_state_snapshot
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Les serveurs galerie sont détachés (un par projet visité) ;
            // sans ce hook ils survivent à la fermeture de l'app. Seule la
            // sortie ACTÉE (Exit, pas ExitRequested) déclenche le SIGTERM.
            if let tauri::RunEvent::Exit = event {
                process_registry::kill_all();
            }
        });
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn renames_old_dir_when_new_absent() {
        let root = tempdir().unwrap();
        let old_dir = root.path().join("com.tofunori.tauri-app");
        std::fs::create_dir_all(old_dir.join("appsnap")).unwrap();
        std::fs::write(old_dir.join("appsnap/capture.png"), b"png").unwrap();

        migrate_app_data_dir(root.path(), "com.tofunori.tauri-app", "com.tofunori.atelier");

        let new_dir = root.path().join("com.tofunori.atelier");
        assert!(!old_dir.exists());
        assert!(new_dir.join("appsnap/capture.png").exists());
    }

    #[test]
    fn leaves_new_dir_untouched_when_it_already_exists() {
        let root = tempdir().unwrap();
        let old_dir = root.path().join("com.tofunori.tauri-app");
        let new_dir = root.path().join("com.tofunori.atelier");
        std::fs::create_dir_all(&old_dir).unwrap();
        std::fs::write(old_dir.join("stale.txt"), b"old").unwrap();
        std::fs::create_dir_all(&new_dir).unwrap();
        std::fs::write(new_dir.join("fresh.txt"), b"new").unwrap();

        migrate_app_data_dir(root.path(), "com.tofunori.tauri-app", "com.tofunori.atelier");

        // both dirs remain — no data loss, no clobbering of the new dir
        assert!(old_dir.join("stale.txt").exists());
        assert!(new_dir.join("fresh.txt").exists());
    }

    #[test]
    fn no_op_when_old_dir_absent() {
        let root = tempdir().unwrap();
        migrate_app_data_dir(root.path(), "com.tofunori.tauri-app", "com.tofunori.atelier");
        assert!(!root.path().join("com.tofunori.atelier").exists());
    }
}
