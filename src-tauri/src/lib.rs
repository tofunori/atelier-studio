mod atelier;
mod sidecar;
mod browser;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = fix_path_env::fix();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            atelier::start_atelier,
            sidecar::sidecar_port,
            browser::browser_show,
            browser::browser_bounds,
            browser::browser_hide,
            browser::browser_show_again,
            browser::browser_eval,
            browser::browser_url,
            browser::browser_probe
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
