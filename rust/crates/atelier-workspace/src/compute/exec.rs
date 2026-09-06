//! Exécuteur de commandes injectable : `SystemExec` en production (sortie
//! bornée, arrêt à l'échéance), `FakeExec` dans les tests (aucun processus).

use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

pub const MAX_STDOUT: usize = 2 * 1024 * 1024;
pub const MAX_STDERR: usize = 64 * 1024;

/// Options ssh partagées avec `narval.rs` : jamais d'invite interactive,
/// connexion bornée, détection rapide d'un lien mort.
pub const SSH_OPTIONS: [&str; 9] = [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "-o",
    "ServerAliveInterval=5",
    "-o",
    "ServerAliveCountMax=1",
    "--",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Output {
    pub stdout: String,
    pub stderr: String,
    pub status: Option<i32>,
    pub success: bool,
}

impl Output {
    pub fn ok(stdout: impl Into<String>) -> Self {
        Self {
            stdout: stdout.into(),
            stderr: String::new(),
            status: Some(0),
            success: true,
        }
    }

    pub fn failed(status: i32, stderr: impl Into<String>) -> Self {
        Self {
            stdout: String::new(),
            stderr: stderr.into(),
            status: Some(status),
            success: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{message}")]
pub struct ExecError {
    /// `unavailable` (lancement impossible), `timeout`, `command_failed`.
    pub code: String,
    pub message: String,
}

impl ExecError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

pub trait Exec: Send + Sync {
    fn run(&self, program: &str, args: &[&str], timeout: Duration) -> Result<Output, ExecError>;
}

/// Exécuteur réel : spawn direct, lecture bornée, kill à l'échéance.
#[derive(Debug, Default, Clone, Copy)]
pub struct SystemExec;

fn read_bounded(mut reader: impl Read, limit: usize) -> Vec<u8> {
    let mut bytes = Vec::new();
    let _ = reader
        .by_ref()
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes);
    bytes.truncate(limit);
    bytes
}

impl Exec for SystemExec {
    fn run(&self, program: &str, args: &[&str], timeout: Duration) -> Result<Output, ExecError> {
        let mut child = Command::new(program)
            .args(args)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                ExecError::new(
                    "unavailable",
                    format!("impossible de lancer {program}: {error}"),
                )
            })?;
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take().expect("stderr piped");
        let out_reader = thread::spawn(move || read_bounded(stdout, MAX_STDOUT));
        let err_reader = thread::spawn(move || read_bounded(stderr, MAX_STDERR));
        let deadline = Instant::now() + timeout;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(20)),
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = out_reader.join();
                    let _ = err_reader.join();
                    return Err(ExecError::new(
                        "timeout",
                        format!("{program} n'a pas répondu dans le délai imparti"),
                    ));
                }
                Err(error) => return Err(ExecError::new("command_failed", error.to_string())),
            }
        };
        let stdout = String::from_utf8_lossy(&out_reader.join().unwrap_or_default()).into_owned();
        let stderr = String::from_utf8_lossy(&err_reader.join().unwrap_or_default()).into_owned();
        Ok(Output {
            stdout,
            stderr,
            status: status.code(),
            success: status.success(),
        })
    }
}

/// Classement d'une erreur ssh (même grille que `narval.rs`).
pub fn classify_ssh_failure(stderr: &str) -> (String, String) {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("permission denied") || lower.contains("publickey") {
        ("auth".into(), "authentification SSH requise".into())
    } else if lower.contains("could not resolve")
        || lower.contains("no route")
        || lower.contains("connection refused")
        || lower.contains("connection timed out")
        || lower.contains("operation timed out")
    {
        (
            "unavailable".into(),
            "hôte inaccessible depuis cette machine".into(),
        )
    } else {
        let message = stderr.trim();
        (
            "command_failed".into(),
            if message.is_empty() {
                "commande distante en échec".into()
            } else {
                message.to_string()
            },
        )
    }
}

pub fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// Exécuteur de test : chaque réponse est associée à un motif recherché dans la
/// ligne de commande complète (`programme + arguments`). Première
/// correspondance gagnante ; sans correspondance → `command_failed`.
#[cfg(test)]
#[derive(Debug, Default)]
pub struct FakeExec {
    responses: std::sync::Mutex<Vec<(String, Result<Output, ExecError>)>>,
    pub calls: std::sync::Mutex<Vec<String>>,
}

#[cfg(test)]
impl FakeExec {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn on(self, pattern: &str, response: Result<Output, ExecError>) -> Self {
        self.responses
            .lock()
            .unwrap()
            .push((pattern.to_string(), response));
        self
    }

    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }
}

#[cfg(test)]
impl Exec for FakeExec {
    fn run(&self, program: &str, args: &[&str], _timeout: Duration) -> Result<Output, ExecError> {
        let line = std::iter::once(program)
            .chain(args.iter().copied())
            .collect::<Vec<_>>()
            .join(" ");
        self.calls.lock().unwrap().push(line.clone());
        let responses = self.responses.lock().unwrap();
        responses
            .iter()
            .find(|(pattern, _)| line.contains(pattern.as_str()))
            .map(|(_, response)| response.clone())
            .unwrap_or_else(|| {
                Err(ExecError::new(
                    "command_failed",
                    format!("FakeExec : aucune réponse pour `{line}`"),
                ))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_exec_bounds_and_times_out() {
        let exec = SystemExec;
        let out = exec
            .run(
                "/bin/sh",
                &["-c", "printf abc; exit 3"],
                Duration::from_secs(5),
            )
            .unwrap();
        assert_eq!(out.stdout, "abc");
        assert_eq!(out.status, Some(3));
        assert!(!out.success);
        let err = exec
            .run("/bin/sh", &["-c", "sleep 5"], Duration::from_millis(100))
            .unwrap_err();
        assert_eq!(err.code, "timeout");
        let err = exec
            .run("/nonexistent/binary", &[], Duration::from_secs(1))
            .unwrap_err();
        assert_eq!(err.code, "unavailable");
    }

    #[test]
    fn ssh_failures_are_classified() {
        assert_eq!(
            classify_ssh_failure("Permission denied (publickey)").0,
            "auth"
        );
        assert_eq!(
            classify_ssh_failure("ssh: Could not resolve hostname nas").0,
            "unavailable"
        );
        assert_eq!(classify_ssh_failure("boom").0, "command_failed");
        assert_eq!(shell_quote("a'b"), "'a'\\''b'");
    }
}
