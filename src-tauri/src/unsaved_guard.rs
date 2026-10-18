//! Branchement Tauri de la garde de sortie (`atelier_workspace::QuitGuard`) :
//! documents modifiés non enregistrés dans les éditeurs de l'atelier (audit
//! du 2026-10-18, problème 1). L'app React publie leur nombre ; fermer la
//! fenêtre principale ou une sortie demandée par l'utilisateur est retenu et
//! l'app reçoit `atelier-quit-requested`, demande confirmation, puis appelle
//! `confirm_quit`.
//!
//! Limite connue : l'élément de menu natif « Quitter » (⌘Q, `terminate:`)
//! ne passe ni par CloseRequested ni par ExitRequested ; les brouillons de
//! secours, écrits pendant la frappe, couvrent ce cas.

use atelier_workspace::QuitGuard;
use tauri::{AppHandle, Emitter, ExitRequestApi, Manager, State, Window, WindowEvent};

pub const QUIT_REQUESTED_EVENT: &str = "atelier-quit-requested";
const MAIN_WINDOW: &str = "main";

#[tauri::command]
pub fn set_unsaved_documents(guard: State<'_, QuitGuard>, count: usize) {
    guard.set_unsaved(count);
}

#[tauri::command]
pub fn confirm_quit(app: AppHandle, guard: State<'_, QuitGuard>) {
    guard.confirm();
    app.exit(0);
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let Some(guard) = window.try_state::<QuitGuard>() else {
            return;
        };
        if guard.should_hold_close() {
            api.prevent_close();
            let _ = window.emit(QUIT_REQUESTED_EVENT, ());
        }
    }
}

pub fn on_exit_requested(app: &AppHandle, code: Option<i32>, api: &ExitRequestApi) {
    let Some(guard) = app.try_state::<QuitGuard>() else {
        return;
    };
    let main_window_open = app.get_webview_window(MAIN_WINDOW).is_some();
    if guard.should_hold_exit(code.is_some(), main_window_open) {
        api.prevent_exit();
        let _ = app.emit(QUIT_REQUESTED_EVENT, ());
    }
}
