//! Branchement Tauri de la garde de sortie (`atelier_workspace::QuitGuard`) :
//! documents modifiés non enregistrés dans les éditeurs de l'atelier (audit
//! du 2026-10-18, problème 1). L'app React publie leur nombre ; fermer la
//! fenêtre principale ou une sortie demandée par l'utilisateur est retenu et
//! l'app reçoit `atelier-quit-requested`, demande confirmation, puis appelle
//! `confirm_quit`.
//!
//! L'élément de menu natif « Quitter » (⌘Q) envoie `terminate:` à NSApp :
//! tao 0.35.3 n'implémente pas `applicationShouldTerminate`, ce chemin ne
//! passe donc ni par CloseRequested ni par ExitRequested et l'app partait
//! sans dialogue (relecture du 2026-10-19). Sur macOS, le menu par défaut de
//! Tauri garde tous ses éléments, sauf ce Quitter prédéfini, remplacé par un
//! élément ordinaire (même raccourci ⌘Q) qui passe par la même garde.

use atelier_workspace::QuitGuard;
#[cfg(target_os = "macos")]
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, MenuItemKind},
    Runtime,
};
use tauri::{AppHandle, Emitter, ExitRequestApi, Manager, State, Window, WindowEvent};

pub const QUIT_REQUESTED_EVENT: &str = "atelier-quit-requested";
/// Identifiant de l'élément « Quitter » qui remplace le prédéfini.
#[cfg(target_os = "macos")]
const QUIT_MENU_ID: &str = "atelier-quit";
const MAIN_WINDOW: &str = "main";

#[tauri::command]
pub fn set_unsaved_documents(guard: State<'_, QuitGuard>, count: usize) {
    guard.set_unsaved(count);
}

/// L'app a reçu `atelier-quit-requested` : sans cet accusé, une nouvelle
/// demande après `ACK_TIMEOUT` passe (interface qui n'écoute plus).
#[tauri::command]
pub fn ack_quit_request(guard: State<'_, QuitGuard>) {
    guard.acknowledge();
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
        if guard.hold_close() {
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
    if guard.hold_exit(code.is_some(), main_window_open) {
        api.prevent_exit();
        let _ = app.emit(QUIT_REQUESTED_EVENT, ());
    }
}

/// Sortie demandée par l'utilisateur hors événement Tauri (⌘Q) : même règle
/// que `on_exit_requested`, puis `AppHandle::exit`, dont l'ExitRequested
/// porte un code et n'est donc pas retenu.
#[cfg(target_os = "macos")]
fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let main_window_open = app.get_webview_window(MAIN_WINDOW).is_some();
    let hold = app
        .try_state::<QuitGuard>()
        .is_some_and(|guard| guard.hold_exit(false, main_window_open));
    if hold {
        let _ = app.emit(QUIT_REQUESTED_EVENT, ());
    } else {
        app.exit(0);
    }
}

/// Menu de l'app : `Menu::default` de Tauri (Édition, Fenêtre… inchangés),
/// dont le dernier élément du menu de l'app — le Quitter prédéfini — est
/// remplacé par `QUIT_MENU_ID`. Si la forme attendue n'est pas là, le menu
/// par défaut est rendu tel quel (on retombe sur l'ancien comportement).
#[cfg(target_os = "macos")]
pub fn app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let Some(MenuItemKind::Submenu(app_submenu)) = menu.items()?.into_iter().next() else {
        return Ok(menu);
    };
    let items = app_submenu.items()?;
    let Some(last) = items.len().checked_sub(1) else {
        return Ok(menu);
    };
    if !matches!(items[last], MenuItemKind::Predefined(_)) {
        return Ok(menu);
    }
    // le libellé du prédéfini retiré est repris : même langue que le reste
    // du menu
    let label = match app_submenu.remove_at(last)? {
        Some(MenuItemKind::Predefined(predefined)) => predefined.text().ok(),
        _ => None,
    }
    .filter(|text| !text.is_empty())
    .unwrap_or_else(|| format!("Quit {}", app.package_info().name));
    let quit = MenuItem::with_id(app, QUIT_MENU_ID, label, true, Some("CmdOrCtrl+Q"))?;
    app_submenu.append(&quit)?;
    Ok(menu)
}

#[cfg(target_os = "macos")]
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id() == QUIT_MENU_ID {
        request_quit(app);
    }
}
