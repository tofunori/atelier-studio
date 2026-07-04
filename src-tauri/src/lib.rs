mod atelier;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = fix_path_env::fix();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![atelier::start_atelier])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
