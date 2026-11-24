//! Chemins reçus en arguments : `atelier [dossier]` et « Ouvrir avec → Atelier ».
//!
//! - Un **dossier** (`atelier ./these`) ouvre ce projet.
//! - Un **fichier** rejoint la file d'arrivée (`inbox::on_opened`), comme un
//!   « Ouvrir avec » sur Mac : l'interface l'ouvre dans l'atelier. Sous Linux,
//!   le lanceur .desktop (`src-tauri/linux/atelier.desktop`, `Exec=… %F`)
//!   passe ainsi les fichiers choisis dans le gestionnaire de fichiers ; sur
//!   Mac, le système passe par `RunEvent::Opened` et cette voie ne sert qu'au
//!   terminal.
//!
//! Atelier fermé : le processus lit ses propres arguments au démarrage.
//! Atelier déjà ouvert : le verrou d'instance (`single_instance`) refuse le
//! second processus, qui envoie ses chemins sur la socket Unix privée de
//! l'instance vivante puis s'arrête. Un message vide ramène simplement la
//! fenêtre au premier plan.
#![cfg(unix)]

use std::ffi::OsString;
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Url};

pub const EVENT_OPEN_PROJECT: &str = "atelier-open-project";

const SOCKET_NAME: &str = "open.sock";
/// Une liste de chemins, jamais un contenu : 256 Ko suffisent largement.
const MAX_MESSAGE: u64 = 256 * 1024;
const READ_TIMEOUT: Duration = Duration::from_secs(2);

/// Ce que demandent les arguments : un projet (le premier dossier) et des
/// fichiers, en chemins absolus résolus.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct Launch {
    pub project: Option<PathBuf>,
    pub files: Vec<PathBuf>,
}

impl Launch {
    /// Le premier argument est le programme ; les options `-…` sont ignorées.
    /// Accepte un chemin relatif (terminal) ou une adresse `file://`.
    pub fn from_args<I: IntoIterator<Item = OsString>>(args: I) -> Self {
        Self::from_paths(args.into_iter().skip(1).filter_map(|arg| {
            let text = arg.to_string_lossy();
            if text.starts_with('-') {
                return None;
            }
            if text.starts_with("file://") {
                return Url::parse(&text).ok()?.to_file_path().ok();
            }
            Some(PathBuf::from(&arg))
        }))
    }

    fn from_paths<I: IntoIterator<Item = PathBuf>>(paths: I) -> Self {
        let mut launch = Self::default();
        for path in paths
            .into_iter()
            .filter_map(|p| std::fs::canonicalize(p).ok())
        {
            if path.is_dir() {
                launch.project.get_or_insert(path);
            } else if path.is_file() {
                launch.files.push(path);
            }
        }
        launch
    }

    fn encode(&self) -> String {
        self.project
            .iter()
            .chain(&self.files)
            .filter_map(|path| path.to_str())
            .filter(|path| !path.contains('\n'))
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn decode(text: &str) -> Self {
        Self::from_paths(text.lines().map(PathBuf::from).filter(|p| p.is_absolute()))
    }

    fn is_empty(&self) -> bool {
        self.project.is_none() && self.files.is_empty()
    }
}

fn pending() -> &'static Mutex<Launch> {
    static PENDING: OnceLock<Mutex<Launch>> = OnceLock::new();
    PENDING.get_or_init(Default::default)
}

/// Garde les demandes du lancement jusqu'à ce que l'app les prenne.
pub fn remember(launch: Launch) {
    if let Ok(mut slot) = pending().lock() {
        *slot = launch;
    }
}

/// Dossier demandé au lancement, puis oublié : un rechargement du frontend ne
/// doit pas rouvrir un projet que l'utilisateur a refermé entre-temps.
#[tauri::command]
pub fn cli_project() -> Option<String> {
    pending()
        .lock()
        .ok()
        .and_then(|mut slot| slot.project.take())
        .map(|dir| dir.to_string_lossy().into_owned())
}

fn socket_path() -> Option<PathBuf> {
    crate::atelier_data_dir().map(|dir| dir.join(SOCKET_NAME))
}

fn send(socket: &Path, launch: &Launch) -> bool {
    match UnixStream::connect(socket) {
        Ok(mut stream) => stream.write_all(launch.encode().as_bytes()).is_ok(),
        Err(_) => false,
    }
}

/// Second processus : confie ses chemins à l'Atelier déjà ouvert. Celui-ci
/// peut encore démarrer (deux lancements rapprochés) : on réessaie pendant
/// deux secondes avant d'abandonner.
pub fn forward(launch: &Launch) {
    let Some(socket) = socket_path() else { return };
    for _ in 0..40 {
        if send(&socket, launch) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    if !launch.is_empty() {
        eprintln!("[atelier] une instance tourne déjà ; demande non transmise (socket absente)");
    }
}

fn deliver(app: &AppHandle, launch: Launch) {
    // Toute relance ramène la fenêtre : sans argument, c'est tout ce qu'elle
    // demande ; avec un dossier ou des fichiers, on veut les voir s'ouvrir.
    // Appelé depuis le fil de la socket : AppKit veut le fil principal.
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || crate::appsnap::focus_atelier(&handle));
    if let Some(project) = launch.project {
        let _ = app.emit(EVENT_OPEN_PROJECT, project.to_string_lossy().into_owned());
    }
    let urls: Vec<Url> = launch
        .files
        .iter()
        .filter_map(|path| Url::from_file_path(path).ok())
        .collect();
    if !urls.is_empty() {
        crate::inbox::on_opened(app, &urls);
    }
}

fn bind(socket: &Path) -> std::io::Result<UnixListener> {
    if let Some(parent) = socket.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Ce processus détient le verrou d'instance : une socket restée là vient
    // d'un Atelier arrêté brutalement (kill -9, plantage).
    let _ = std::fs::remove_file(socket);
    let listener = UnixListener::bind(socket)?;
    std::fs::set_permissions(socket, std::fs::Permissions::from_mode(0o600))?;
    Ok(listener)
}

fn serve(listener: UnixListener, mut on_message: impl FnMut(Launch) + Send + 'static) {
    let _ = std::thread::Builder::new()
        .name("atelier-open".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                // Un client qui n'écrit rien rend la main à la fin du flux ;
                // un client bloqué ne doit pas boucher la file pour les autres.
                let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
                let mut text = String::new();
                if stream.take(MAX_MESSAGE).read_to_string(&mut text).is_ok() {
                    on_message(Launch::decode(&text));
                }
            }
        });
}

/// Processus principal : fichiers du lancement, puis écoute des demandes
/// suivantes. Le projet du lancement, lui, attend `cli_project`.
pub fn listen(app: AppHandle) {
    let files = pending()
        .lock()
        .map(|mut slot| std::mem::take(&mut slot.files))
        .unwrap_or_default();
    if !files.is_empty() {
        deliver(
            &app,
            Launch {
                project: None,
                files,
            },
        );
    }
    let Some(socket) = socket_path() else { return };
    let listener = match bind(&socket) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!(
                "[atelier] socket d'ouverture indisponible ({}) : {error}",
                socket.display()
            );
            return;
        }
    };
    serve(listener, move |launch| deliver(&app, launch));
}

pub fn cleanup() {
    if let Some(socket) = socket_path() {
        let _ = std::fs::remove_file(socket);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn args(items: &[&str]) -> Vec<OsString> {
        std::iter::once("atelier")
            .chain(items.iter().copied())
            .map(OsString::from)
            .collect()
    }

    #[test]
    fn sorts_project_and_files_and_skips_options() {
        let dir = tempfile::tempdir().unwrap();
        let these = dir.path().join("these");
        std::fs::create_dir(&these).unwrap();
        let note = dir.path().join("notes de terrain.txt");
        std::fs::write(&note, b"glacier").unwrap();
        let url = Url::from_file_path(&note).unwrap().to_string();
        let launch = Launch::from_args(args(&[
            "--flag",
            note.to_str().unwrap(),
            these.to_str().unwrap(),
            &url,
            dir.path().join("absent.txt").to_str().unwrap(),
        ]));
        let note = std::fs::canonicalize(&note).unwrap();
        assert_eq!(launch.project, Some(std::fs::canonicalize(&these).unwrap()));
        assert_eq!(launch.files, vec![note.clone(), note]);
        assert!(
            Launch::from_args(args(&[])).is_empty(),
            "le programme lui-même n'est pas un chemin"
        );
    }

    #[test]
    fn message_round_trip_keeps_existing_absolute_paths() {
        let dir = tempfile::tempdir().unwrap();
        let note = std::fs::canonicalize(dir.path()).unwrap().join("a b.txt");
        std::fs::write(&note, b"x").unwrap();
        let launch = Launch {
            project: Some(std::fs::canonicalize(dir.path()).unwrap()),
            files: vec![note],
        };
        assert_eq!(Launch::decode(&launch.encode()), launch);
        assert!(Launch::decode("relatif.txt\n\n").is_empty());
    }

    #[test]
    fn second_instance_hands_its_paths_to_the_first() {
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join(SOCKET_NAME);
        std::fs::write(&socket, b"reste d'un arret brutal").unwrap();
        let listener = bind(&socket).unwrap();
        let mode = std::fs::metadata(&socket).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "socket privée");
        let (sender, received) = mpsc::channel();
        serve(listener, move |launch| {
            let _ = sender.send(launch);
        });

        let note = std::fs::canonicalize(dir.path())
            .unwrap()
            .join("mesures.txt");
        std::fs::write(&note, b"0.42").unwrap();
        let launch = Launch {
            project: None,
            files: vec![note],
        };
        assert!(send(&socket, &launch));
        assert_eq!(
            received.recv_timeout(Duration::from_secs(5)).unwrap(),
            launch
        );
        // Relancer Atelier sans argument : message vide = premier plan.
        assert!(send(&socket, &Launch::default()));
        assert!(received
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .is_empty());
    }
}
