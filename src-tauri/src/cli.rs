//! Commande `atelier [dossier]` : ouvre un projet dans Atelier.
//!
//! Deux cas, un seul comportement visible :
//! - **Atelier est fermé** : le dossier (déjà résolu en absolu par le script)
//!   arrive en argument, le frontend le prend au démarrage via `cli_project`.
//! - **Atelier tourne déjà** : le verrou d'instance (`single_instance`) refuse
//!   le second processus, qui se contente d'envoyer le chemin sur la socket
//!   Unix de l'instance vivante ; celle-ci émet `atelier-open-project` et le
//!   frontend ajoute/active le projet. Sans socket joignable, on ne fait rien
//!   plutôt que d'ouvrir une seconde instance qui se battrait pour les mêmes
//!   fichiers d'état.
#![cfg(unix)]

use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter};

pub const EVENT_OPEN_PROJECT: &str = "atelier-open-project";

/// Dossier demandé au lancement, consommé une seule fois par le frontend.
fn pending() -> &'static Mutex<Option<String>> {
    static PENDING: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(None))
}

/// Premier argument qui désigne un dossier existant, en chemin absolu.
/// `atelier`, `atelier .`, `atelier ./these` ; les options (`--help`) sont
/// ignorées par le script, qui ne passe que des dossiers.
pub fn project_from_args() -> Option<String> {
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|candidate| candidate.is_dir())
        .and_then(|dir| std::fs::canonicalize(dir).ok())
        .map(|dir| dir.to_string_lossy().into_owned())
}

pub fn remember(path: Option<String>) {
    if let Ok(mut slot) = pending().lock() {
        *slot = path;
    }
}

/// Chemin demandé au lancement, puis oublié : un rechargement du frontend ne
/// doit pas rouvrir un projet que l'utilisateur a refermé entre-temps.
#[tauri::command]
pub fn cli_project() -> Option<String> {
    pending().lock().ok().and_then(|mut slot| slot.take())
}

fn socket_path() -> Option<PathBuf> {
    crate::atelier_data_dir().map(|dir| dir.join("open-project.sock"))
}

/// Envoie `path` à l'instance déjà lancée. Faux si personne n'écoute.
pub fn forward(path: &str) -> bool {
    let Some(socket) = socket_path() else { return false };
    // L'instance vivante a eu le temps de démarrer (verrou posé avant Tauri) ;
    // une socket absente veut dire « pas d'instance », pas « réessaie ».
    let Ok(mut stream) = UnixStream::connect(socket) else { return false };
    stream.write_all(path.as_bytes()).is_ok() && stream.write_all(b"\n").is_ok()
}

/// Écoute les demandes d'ouverture, dans un fil dédié. Le verrou d'instance
/// est déjà tenu : cette socket est donc la seule autorisée à exister.
pub fn listen(app: AppHandle) {
    let Some(socket) = socket_path() else { return };
    if let Some(parent) = socket.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // Socket laissée par une instance morte (kill -9, plantage).
    let _ = std::fs::remove_file(&socket);
    let Ok(listener) = UnixListener::bind(&socket) else {
        eprintln!("[atelier] socket d'ouverture indisponible : {}", socket.display());
        return;
    };
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            let mut buffer = String::new();
            // Un client qui n'écrit rien (fermeture du terminal) ne bloque pas
            // la boucle : la lecture rend la main à la fin du flux.
            if stream.read_to_string(&mut buffer).is_err() {
                continue;
            }
            let path = buffer.trim();
            if path.is_empty() || !Path::new(path).is_dir() {
                continue;
            }
            let _ = app.emit(EVENT_OPEN_PROJECT, path.to_string());
        }
    });
}

pub fn cleanup() {
    if let Some(socket) = socket_path() {
        let _ = std::fs::remove_file(socket);
    }
}
