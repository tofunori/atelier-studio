mod appsnap;
mod atelier;
mod boot_metrics;
mod browser;
#[cfg(unix)]
mod cli;
/// Pas de lancement par argument hors Unix pour l'instant : la commande
/// répond « aucun dossier », le frontend reste le même partout.
#[cfg(not(unix))]
mod cli {
    #[tauri::command]
    pub fn cli_project() -> Option<String> {
        None
    }
}
mod claude_connector;
mod clipboard;
mod dictation;
mod discussions;
mod identity;
mod inbox;
mod local_image;
mod macos_badge_permission;
#[cfg(target_os = "macos")]
mod macos_services;
mod process_registry;
mod remote_gateway;
mod sidecar;
#[cfg(unix)]
mod single_instance;
mod ui_state;
mod unsaved_guard;
mod updater;

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
    dirs::home_dir().map(|home| {
        if cfg!(target_os = "macos") {
            home.join("Library/Application Support")
        } else {
            home.join(".local/share")
        }
    })
}

pub(crate) fn atelier_data_dir() -> Option<PathBuf> {
    application_support_root().map(|root| root.join("atelier-studio"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(unix)]
    let _instance = match single_instance::enter() {
        Ok(Some(guard)) => guard,
        Ok(None) => {
            // Une instance tourne déjà : lui transmettre le dossier
            // (`atelier ./these`) ou les fichiers (Ouvrir avec) demandés,
            // puis sortir, au lieu de sortir en silence.
            cli::forward(&cli::Launch::from_args(std::env::args_os()));
            return;
        }
        Err(error) => {
            eprintln!("Atelier ne peut pas protéger ses conversations : {error}");
            return;
        }
    };
    #[cfg(unix)]
    cli::remember(cli::Launch::from_args(std::env::args_os()));
    let boot_clock = boot_metrics::BootClock::new();
    #[cfg(target_os = "linux")]
    let saved_linux_session: Vec<(&str, Option<std::ffi::OsString>)> = [
        "XDG_RUNTIME_DIR",
        "DBUS_SESSION_BUS_ADDRESS",
        "WAYLAND_DISPLAY",
        "DISPLAY",
        "XDG_CURRENT_DESKTOP",
        "XDG_SESSION_TYPE",
    ]
    .into_iter()
    .map(|k| (k, std::env::var_os(k)))
    .collect();
    let _ = fix_path_env::fix();
    #[cfg(target_os = "linux")]
    {
        for (k, v) in saved_linux_session {
            if std::env::var_os(k).is_none() {
                if let Some(val) = v {
                    std::env::set_var(k, val);
                }
            }
        }
        let uid = unsafe { libc::geteuid() };
        let runtime_dir = PathBuf::from(format!("/run/user/{uid}"));
        if runtime_dir.is_dir() {
            if std::env::var_os("XDG_RUNTIME_DIR").is_none() {
                std::env::set_var("XDG_RUNTIME_DIR", &runtime_dir);
            }
            let bus = runtime_dir.join("bus");
            if std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_none() && bus.exists() {
                std::env::set_var(
                    "DBUS_SESSION_BUS_ADDRESS",
                    format!("unix:path={}", bus.display()),
                );
            }
            if std::env::var_os("WAYLAND_DISPLAY").is_none() && runtime_dir.join("wayland-0").exists() {
                std::env::set_var("WAYLAND_DISPLAY", "wayland-0");
            }
        }
        if std::env::var_os("SSL_CERT_FILE").is_none() {
            for cert in [
                "/etc/ssl/certs/ca-certificates.crt",
                "/etc/pki/tls/certs/ca-bundle.crt",
                "/etc/ssl/ca-bundle.pem",
            ] {
                if PathBuf::from(cert).is_file() {
                    std::env::set_var("SSL_CERT_FILE", cert);
                    break;
                }
            }
        }
    }
    if let Some(app_dir) = atelier_data_dir() {
        let tectonic_dir = app_dir.join("tools").join("tectonic-0.17.0");
        let home_bins = std::env::var("HOME")
            .ok()
            .map(|h| format!("{h}/.local/bin:{h}/.opencode/bin:"))
            .unwrap_or_default();
        let current_path = std::env::var("PATH").unwrap_or_default();
        std::env::set_var(
            "PATH",
            format!("{home_bins}{}:{current_path}", tectonic_dir.display()),
        );
    }
    let builder = tauri::Builder::default()
        .manage(boot_clock)
        .manage(atelier_workspace::QuitGuard::new())
        .manage(inbox::InboxState::default())
        .manage(updater::PendingUpdate::default())
        .on_window_event(unsaved_guard::on_window_event);
    // ⌘Q passe par la garde des documents modifiés (voir unsaved_guard)
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(unsaved_guard::app_menu)
        .on_menu_event(unsaved_guard::on_menu_event);
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let new_identifier = app.config().identifier.clone();
            if let Some(support_root) = application_support_root() {
                migrate_app_data_dir(&support_root, OLD_BUNDLE_IDENTIFIER, &new_identifier);
            }
            app.manage(appsnap::AppSnapManager::new(app.handle()));
            // « Envoyer à Atelier » (Finder, texte sélectionné) : branché dès
            // le setup, avant qu'un lancement à froid par le service livre
            // son appel en attente.
            inbox::install_services(app.handle());
            macos_badge_permission::request_badge_authorization_native();
            // Connecteur Claude : lancé (ou remplacé par la nouvelle version)
            // à chaque démarrage, sans onglet Terminal.
            claude_connector::schedule(app.handle().clone());
            // `atelier [dossier]` et « Ouvrir avec » (Linux) : chemins du
            // lancement, puis ceux des relances pendant qu'Atelier tourne.
            #[cfg(unix)]
            cli::listen(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dictation::dictation_start,
            dictation::dictation_stop,
            dictation::dictation_cancel,
            atelier::start_atelier,
            discussions::discussion_workspace,
            discussions::discussion_ensure_document,
            discussions::discussion_create_document,
            remote_gateway::remote_device_action,
            claude_connector::claude_connector_action,
            clipboard::clipboard_read_text,
            clipboard::clipboard_write_text,
            atelier::gallery_token,
            appsnap::appsnap_get_state,
            appsnap::appsnap_read_capture,
            appsnap::appsnap_request_permissions,
            appsnap::appsnap_set_enabled,
            inbox::inbox_drain,
            local_image::local_image_read,
            local_image::local_image_save_to_gallery,
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
            ui_state::ui_state_snapshot,
            unsaved_guard::set_unsaved_documents,
            unsaved_guard::ack_quit_request,
            unsaved_guard::confirm_quit,
            cli::cli_project,
            updater::update_status,
            updater::update_check,
            updater::update_install,
            updater::update_open_releases
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Documents modifiés non enregistrés : la sortie demandée par
            // l'utilisateur attend la confirmation de l'app.
            if let tauri::RunEvent::ExitRequested { code, api, .. } = &event {
                unsaved_guard::on_exit_requested(app_handle, *code, api);
            }
            // Les serveurs galerie sont détachés (un par projet visité) ;
            // sans ce hook ils survivent à la fermeture de l'app. Seule la
            // sortie ACTÉE (Exit, pas ExitRequested) déclenche le SIGTERM.
            // Ouvrir avec → Atelier, dépôt sur le Dock, liens atelier://.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = &event {
                inbox::on_opened(app_handle, urls);
            }
            if let tauri::RunEvent::Exit = event {
                process_registry::kill_all();
                #[cfg(unix)]
                cli::cleanup();
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
