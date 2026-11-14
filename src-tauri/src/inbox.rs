//! Arrivées depuis le reste du Mac (Atelier partout, lot 1) : Service
//! « Envoyer à Atelier », « Ouvrir avec → Atelier », dépôt sur le Dock et
//! liens `atelier://send?…`.
//!
//! Tout passe par la file d'`atelier-inbox` : on y range l'envoi, on ramène
//! Atelier au premier plan, puis on signale à l'interface de vider la file
//! (`inbox_drain`). Un envoi qui arrive avant que React écoute (lancement à
//! froid) attend donc dans la file au lieu de se perdre.

use atelier_inbox::{Arrival, Inbox, Payload, Via};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

/// Signal « la file d'arrivée a du nouveau » ; la charge utile est l'id.
pub const EVENT_ARRIVAL: &str = "inbox:arrival";

#[derive(Default)]
pub struct InboxState(Mutex<Inbox>);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

pub fn receive(app: &AppHandle, via: Via, source_app: Option<String>, payload: Payload) {
    let id = {
        let state = app.state::<InboxState>();
        let mut inbox = state
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inbox.push(via, source_app, payload, now_ms())
    };
    crate::appsnap::focus_atelier(app);
    let _ = app.emit(EVENT_ARRIVAL, id);
}

/// `RunEvent::Opened` : fichiers (Ouvrir avec, Dock) et liens `atelier://`.
pub fn on_opened(app: &AppHandle, urls: &[tauri::Url]) {
    for (via, payload) in atelier_inbox::from_opened(urls) {
        receive(app, via, None, payload);
    }
}

/// Branche le Service macOS « Envoyer à Atelier » (voir macos_services).
pub fn install_services(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let app = app.clone();
        crate::macos_services::install(Box::new(move |source, payload| {
            receive(&app, Via::Service, source, payload);
        }));
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// Rend les envois en attente et vide la file.
#[tauri::command]
pub fn inbox_drain(state: State<'_, InboxState>) -> Vec<Arrival> {
    state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .drain()
}
