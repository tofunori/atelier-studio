//! « Ouvrir avec → Atelier » sous Linux.
//!
//! Sur Mac, le système livre les fichiers ouverts par `RunEvent::Opened`.
//! Sous Linux, le fichier .desktop (`src-tauri/linux/atelier.desktop`,
//! `Exec=… %F`) les passe en arguments du programme :
//! - Atelier fermé : le nouveau processus les lit au démarrage ;
//! - Atelier déjà ouvert : le second processus (refusé par single_instance)
//!   les transmet au premier par une socket Unix privée, puis s'arrête.
//!
//! Dans les deux cas, ils rejoignent la même file d'arrivée que sur Mac
//! (`inbox::on_opened`) : l'interface les ouvre dans l'atelier.

use std::ffi::OsString;
use std::io::{Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Url};

const SOCKET_NAME: &str = "desktop-open.sock";
/// Une liste de chemins, jamais un contenu : 256 Ko suffisent largement.
const MAX_MESSAGE: u64 = 256 * 1024;

fn socket_path() -> Option<PathBuf> {
    crate::atelier_data_dir().map(|dir| dir.join(SOCKET_NAME))
}

/// Fichiers et dossiers existants passés en arguments (le premier argument
/// est le programme ; les options `-…` sont ignorées). Accepte un chemin
/// relatif (lancement depuis un terminal) ou une adresse `file://`.
pub fn file_args<I: IntoIterator<Item = OsString>>(args: I) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter(|arg| !arg.to_string_lossy().starts_with('-'))
        .filter_map(|arg| {
            let text = arg.to_string_lossy();
            let path = if text.starts_with("file://") {
                Url::parse(&text).ok()?.to_file_path().ok()?
            } else {
                PathBuf::from(&arg)
            };
            std::fs::canonicalize(path).ok()
        })
        .collect()
}

fn encode(paths: &[PathBuf]) -> String {
    paths
        .iter()
        .filter_map(|path| path.to_str())
        .filter(|path| !path.contains('\n'))
        .collect::<Vec<_>>()
        .join("\n")
}

fn decode(text: &str) -> Vec<PathBuf> {
    text.lines()
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .collect()
}

fn send(socket: &Path, paths: &[PathBuf]) -> bool {
    match UnixStream::connect(socket) {
        Ok(mut stream) => stream.write_all(encode(paths).as_bytes()).is_ok(),
        Err(_) => false,
    }
}

/// Second processus : confie les fichiers (ou, sans fichier, le simple
/// « reviens au premier plan ») à l'Atelier déjà ouvert. Le premier peut
/// encore démarrer : on réessaie pendant deux secondes.
pub fn forward(paths: &[PathBuf]) {
    let Some(socket) = socket_path() else { return };
    for _ in 0..40 {
        if send(&socket, paths) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn deliver(app: &AppHandle, paths: &[PathBuf]) {
    let urls: Vec<Url> = paths
        .iter()
        .filter_map(|path| Url::from_file_path(path).ok())
        .collect();
    crate::inbox::on_opened(app, &urls);
}

fn bind(socket: &Path) -> std::io::Result<UnixListener> {
    // Ce processus détient le verrou d'instance unique : une socket restée
    // là vient d'un Atelier arrêté brutalement.
    let _ = std::fs::remove_file(socket);
    let listener = UnixListener::bind(socket)?;
    std::fs::set_permissions(socket, std::fs::Permissions::from_mode(0o600))?;
    Ok(listener)
}

fn serve(listener: UnixListener, mut on_message: impl FnMut(Vec<PathBuf>) + Send + 'static) {
    let _ = std::thread::Builder::new()
        .name("atelier-open-with".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut text = String::new();
                if stream.take(MAX_MESSAGE).read_to_string(&mut text).is_ok() {
                    on_message(decode(&text));
                }
            }
        });
}

/// Processus principal : fichiers du lancement, puis écoute des suivants.
pub fn start(app: &AppHandle) {
    let launch = file_args(std::env::args_os());
    if !launch.is_empty() {
        deliver(app, &launch);
    }
    let Some(socket) = socket_path() else { return };
    let listener = match bind(&socket) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!(
                "[linux_open] écoute impossible sur {} : {error}",
                socket.display()
            );
            return;
        }
    };
    let app = app.clone();
    serve(listener, move |paths| {
        if paths.is_empty() {
            crate::appsnap::focus_atelier(&app);
        } else {
            deliver(&app, &paths);
        }
    });
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
    fn keeps_existing_files_and_skips_options() {
        let dir = tempfile::tempdir().unwrap();
        let note = dir.path().join("notes de terrain.txt");
        std::fs::write(&note, b"glacier").unwrap();
        let url = Url::from_file_path(&note).unwrap().to_string();
        let found = file_args(args(&[
            "--flag",
            note.to_str().unwrap(),
            &url,
            dir.path().join("absent.txt").to_str().unwrap(),
        ]));
        let expected = std::fs::canonicalize(&note).unwrap();
        assert_eq!(found, vec![expected.clone(), expected]);
        assert!(
            file_args(args(&[])).is_empty(),
            "le programme lui-même n'est pas un fichier"
        );
    }

    #[test]
    fn message_round_trip_keeps_absolute_paths_only() {
        let paths = vec![
            PathBuf::from("/tmp/a b.txt"),
            PathBuf::from("/home/x/notes.txt"),
        ];
        assert_eq!(decode(&encode(&paths)), paths);
        assert!(decode("relatif.txt\n\n").is_empty());
    }

    #[test]
    fn second_instance_hands_files_to_the_first() {
        let dir = tempfile::tempdir().unwrap();
        let socket = dir.path().join(SOCKET_NAME);
        std::fs::write(&socket, b"reste d'un arret brutal").unwrap();
        let listener = bind(&socket).unwrap();
        let mode = std::fs::metadata(&socket).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "socket privée");
        let (sender, received) = mpsc::channel();
        serve(listener, move |paths| {
            let _ = sender.send(paths);
        });

        let note = PathBuf::from("/home/collegue/Documents/mesures.txt");
        assert!(send(&socket, std::slice::from_ref(&note)));
        assert_eq!(
            received.recv_timeout(Duration::from_secs(5)).unwrap(),
            vec![note]
        );
        // Relancer Atelier sans fichier : message vide = revenir au premier plan.
        assert!(send(&socket, &[]));
        assert!(received
            .recv_timeout(Duration::from_secs(5))
            .unwrap()
            .is_empty());
    }
}
