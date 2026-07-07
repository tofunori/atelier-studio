mod atelier;
mod bin_resolver;
mod browser;
mod identity;
mod macos_badge_permission;
mod sidecar;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = fix_path_env::fix();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            macos_badge_permission::request_badge_authorization_native();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            atelier::start_atelier,
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
            browser::browser_import_vivaldi,
            browser::browser_url,
            browser::browser_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
