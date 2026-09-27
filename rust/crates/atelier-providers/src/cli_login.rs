//! Sonde de connexion SANS quota des CLI officiels (Claude Code, Codex) :
//! « trouvé » ne vaut plus « prêt ». Chaque sonde lance une sous-commande
//! locale qui lit l'authentification enregistrée, sans requête au modèle.
//!
//! Une réponse illisible (CLI trop ancien pour connaître la sous-commande,
//! sortie inattendue) retombe sur « prêt » : mieux vaut le comportement
//! historique qu'un faux « connexion requise ».

use serde_json::{json, Value};
use std::path::Path;
use std::process::{Output, Stdio};
use std::time::Duration;

const PROBE_TIMEOUT: Duration = Duration::from_secs(8);

pub(crate) const CLAUDE_LOGIN_COMMAND: &str = "claude auth login";
pub(crate) const CODEX_LOGIN_COMMAND: &str = "codex login";

async fn run(bin: &Path, args: &[&str]) -> Option<Output> {
    let child = tokio::process::Command::new(bin)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .ok()?;
    tokio::time::timeout(PROBE_TIMEOUT, child.wait_with_output())
        .await
        .ok()?
        .ok()
}

/// Premier mot qui commence par un chiffre (« 2.1.283 (Claude Code) »,
/// « codex-cli 0.155.1 »).
fn version_token(output: &Output) -> Option<String> {
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .find(|token| token.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(str::to_string)
}

/// `claude auth status --json` : `{"loggedIn": bool, …}` sur stdout, quel
/// que soit le code de sortie.
pub(crate) fn claude_logged_in(stdout: &[u8]) -> Option<bool> {
    serde_json::from_slice::<Value>(stdout)
        .ok()?
        .get("loggedIn")?
        .as_bool()
}

/// `codex login status` : code 0 = connecté ; « Not logged in » sur stderr
/// avec le code 1 = à connecter ; tout le reste est inconnu.
pub(crate) fn codex_logged_in(output: &Output) -> Option<bool> {
    if output.status.success() {
        return Some(true);
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    stderr.contains("Not logged in").then_some(false)
}

fn probe_json(bin: &Path, version: Option<String>, logged_in: Option<bool>, login: &str) -> Value {
    json!({
        "state": if logged_in == Some(false) { "login_needed" } else { "ready" },
        "version": version,
        "binPath": bin.to_string_lossy(),
        "loginCommand": login,
        "error": null,
    })
}

pub(crate) async fn claude_probe(bin: &Path) -> Value {
    let (version, status) = tokio::join!(
        run(bin, &["--version"]),
        run(bin, &["auth", "status", "--json"]),
    );
    let logged_in = status.and_then(|output| claude_logged_in(&output.stdout));
    probe_json(
        bin,
        version.as_ref().and_then(version_token),
        logged_in,
        CLAUDE_LOGIN_COMMAND,
    )
}

pub(crate) async fn codex_probe(bin: &Path) -> Value {
    let (version, status) = tokio::join!(run(bin, &["--version"]), run(bin, &["login", "status"]));
    let logged_in = status.as_ref().and_then(codex_logged_in);
    probe_json(
        bin,
        version.as_ref().and_then(version_token),
        logged_in,
        CODEX_LOGIN_COMMAND,
    )
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn fake_cli(dir: &Path, script: &str) -> std::path::PathBuf {
        let path = dir.join("cli");
        std::fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[test]
    fn claude_status_json_is_read_whatever_the_exit_code() {
        assert_eq!(
            claude_logged_in(br#"{"loggedIn": true, "authMethod": "claude.ai"}"#),
            Some(true)
        );
        assert_eq!(claude_logged_in(br#"{"loggedIn": false}"#), Some(false));
        assert_eq!(claude_logged_in(b"error: unknown command 'auth'"), None);
    }

    #[tokio::test]
    async fn claude_logged_out_asks_for_login() {
        let dir = tempfile::tempdir().unwrap();
        let bin = fake_cli(
            dir.path(),
            r#"case "$1" in --version) echo "2.1.283 (Claude Code)";; auth) echo '{"loggedIn": false}'; exit 1;; esac"#,
        );
        let probe = claude_probe(&bin).await;
        assert_eq!(probe["state"], "login_needed");
        assert_eq!(probe["version"], "2.1.283");
        assert_eq!(probe["loginCommand"], CLAUDE_LOGIN_COMMAND);
    }

    #[tokio::test]
    async fn an_old_claude_without_auth_status_stays_ready() {
        let dir = tempfile::tempdir().unwrap();
        let bin = fake_cli(
            dir.path(),
            r#"case "$1" in --version) echo "1.0.0 (Claude Code)";; *) echo "error: unknown command" >&2; exit 1;; esac"#,
        );
        assert_eq!(claude_probe(&bin).await["state"], "ready");
    }

    #[tokio::test]
    async fn codex_states_follow_login_status() {
        let dir = tempfile::tempdir().unwrap();
        let ready = fake_cli(
            dir.path(),
            r#"case "$1" in --version) echo "codex-cli 0.155.1";; login) echo "Logged in using ChatGPT" >&2;; esac"#,
        );
        let probe = codex_probe(&ready).await;
        assert_eq!(probe["state"], "ready");
        assert_eq!(probe["version"], "0.155.1");

        let out_dir = tempfile::tempdir().unwrap();
        let logged_out = fake_cli(
            out_dir.path(),
            r#"case "$1" in --version) echo "codex-cli 0.155.1";; login) echo "Not logged in" >&2; exit 1;; esac"#,
        );
        let probe = codex_probe(&logged_out).await;
        assert_eq!(probe["state"], "login_needed");
        assert_eq!(probe["loginCommand"], CODEX_LOGIN_COMMAND);

        let old_dir = tempfile::tempdir().unwrap();
        let old = fake_cli(
            old_dir.path(),
            r#"echo "error: unrecognized subcommand" >&2; exit 2"#,
        );
        assert_eq!(codex_probe(&old).await["state"], "ready");
    }
}
