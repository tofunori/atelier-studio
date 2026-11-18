// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // Évite les fenêtres blanches/crashs EGL de WebKitGTK sous Wayland (NVIDIA / VM VirGL).
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    // Lancée depuis le Finder, l'app hérite de `maxfiles 256` (launchd GUI) ;
    // les CLIs agents spawnes en héritent et finissent en EMFILE. À relever
    // avant tout spawn — les serveurs bundlés le refont pour leurs propres
    // lancements standalone.
    atelier_fdlimit::raise_nofile_limit();
    tauri_app_lib::run()
}
