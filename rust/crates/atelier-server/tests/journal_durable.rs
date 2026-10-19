//! Problème 13 (audit 2026-10-18) : un serveur dont le lecteur de stdout et
//! de stderr a disparu (app quittée, serveur réutilisé par la suivante) doit
//! continuer à répondre et à journaliser dans son fichier.
#![cfg(unix)]

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

fn health_status(port: u16) -> String {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connexion");
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    write!(
        stream,
        "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nx-atelier-token: jeton\r\nConnection: close\r\n\r\n"
    )
    .unwrap();
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    response.lines().next().unwrap_or_default().to_string()
}

#[test]
fn le_serveur_survit_a_la_fermeture_de_ses_pipes_et_journalise_sur_disque() {
    let dir = tempfile::tempdir().unwrap();
    let log_path = dir.path().join("logs").join("studio-server.log");
    // Comme sidecar.rs : le journal est ouvert par le parent et donné comme
    // stderr (fichier, jamais pipe), avec son chemin dans ATELIER_LOG_FILE.
    let parent_log =
        atelier_logs::ChildLog::open_at(&log_path, atelier_logs::Rotation::DEFAULT).unwrap();
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_atelier-studio-server"));
    cmd.env("HOME", dir.path().join("home"))
        .env("ATELIER_APP_DIR", dir.path().join("app"))
        .env("ATELIER_SKIP_SINGLE_INSTANCE", "1")
        .env("ATELIER_TOKEN", "jeton")
        // debug : chaque requête écrit deux lignes tracing (TraceLayer).
        .env("RUST_LOG", "debug")
        .stdout(Stdio::piped());
    assert!(parent_log.attach(&mut cmd));
    let mut child = cmd.spawn().expect("spawn atelier-studio-server");
    drop(cmd);

    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        let mut line = String::new();
        let _ = BufReader::new(stdout).read_line(&mut line);
        let _ = tx.send(line);
    });
    let line = rx
        .recv_timeout(Duration::from_secs(30))
        .expect("ligne de démarrage");
    reader.join().unwrap();
    let port: u16 = line
        .split("\"port\":")
        .nth(1)
        .and_then(|rest| rest.split(|c: char| !c.is_ascii_digit()).next())
        .and_then(|digits| digits.parse().ok())
        .unwrap_or_else(|| panic!("port absent de {line:?}"));

    // L'app « quitte » : plus personne ne lit stdout (le lecteur est fini)
    // et le parent lâche son descripteur du journal.
    drop(parent_log);
    std::thread::sleep(Duration::from_millis(200));

    for _ in 0..3 {
        assert_eq!(health_status(port), "HTTP/1.1 200 OK");
    }

    let status = Command::new("kill")
        .args(["-TERM", &child.id().to_string()])
        .status()
        .unwrap();
    assert!(status.success());
    let mut exited = None;
    for _ in 0..100 {
        if let Some(code) = child.try_wait().unwrap() {
            exited = Some(code);
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    let exited = exited.unwrap_or_else(|| {
        let _ = child.kill();
        panic!("le serveur ne s'est pas arrêté sur SIGTERM")
    });
    assert!(exited.success(), "sortie {exited:?}");

    let text = std::fs::read_to_string(&log_path).unwrap();
    assert!(
        text.contains("atelier-studio-server démarre (pid "),
        "{text}"
    );
    assert!(text.matches("uri=/health").count() >= 6, "{text}");
    assert!(text.contains("SIGTERM — graceful shutdown"), "{text}");
    assert!(
        !text.contains("\u{1b}["),
        "pas de couleurs ANSI dans le fichier"
    );
}

#[test]
fn la_variable_seule_ne_fait_pas_ecrire_dans_le_journal_d_un_autre() {
    // Un CLI d'agent hérite d'ATELIER_LOG_FILE du serveur de chat ; un
    // serveur qu'il lance avec un stderr à lui (pipe) ne doit pas écrire
    // dans le journal du serveur de chat de Thierry.
    let dir = tempfile::tempdir().unwrap();
    let log_path = dir.path().join("studio-server.log");
    std::fs::write(&log_path, "journal du vrai serveur\n").unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_atelier-studio-server"))
        .env("HOME", dir.path().join("home"))
        .env("ATELIER_APP_DIR", dir.path().join("app"))
        .env("ATELIER_SKIP_SINGLE_INSTANCE", "1")
        .env("ATELIER_TOKEN", "jeton")
        .env("ATELIER_LOG_FILE", &log_path)
        .env("RUST_LOG", "debug")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn atelier-studio-server");
    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let _ = BufReader::new(stdout).read_line(&mut line);
        let _ = tx.send(line);
    });
    let line = rx
        .recv_timeout(Duration::from_secs(30))
        .expect("ligne de démarrage");
    assert!(line.contains("\"port\":"), "{line:?}");
    let _ = child.kill();
    let out = child.wait_with_output().unwrap();
    assert_eq!(
        std::fs::read_to_string(&log_path).unwrap(),
        "journal du vrai serveur\n"
    );
    // Les journaux tracing sont restés sur son propre stderr.
    assert!(!out.stderr.is_empty(), "{out:?}");
}
