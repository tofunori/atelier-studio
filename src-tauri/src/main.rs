// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Lancée depuis le Finder, l'app hérite de `maxfiles 256` (launchd GUI) ;
    // les CLIs agents spawnes en héritent et finissent en EMFILE. À relever
    // avant tout spawn — les serveurs bundlés le refont pour leurs propres
    // lancements standalone.
    atelier_fdlimit::raise_nofile_limit();
    tauri_app_lib::run()
}
