//! Installer et connecter un agent (Claude Code, Codex) depuis Atelier, sans
//! passer par Terminal : la fenêtre de bienvenue et Réglages > Environnement
//! envoient `setupRun`, ce module lance l'installeur officiel puis la
//! commande de connexion du CLI, et publie l'avancement.
//!
//!   → { type:"setupRun", agent }            installe si besoin, puis connecte
//!   → { type:"setupRunInput", agent, text } une ligne pour la connexion
//!                                            (code à coller, si le CLI en veut un)
//!   → { type:"setupRunCancel", agent }
//!   ← { type:"setupRun", agent, phase, detail, url, error }
//!     phase : "installing" | "signing_in" | "ready" | "failed" | "cancelled"
//!
//! L'installeur tourne sans terminal ni mot de passe (il pose le binaire dans
//! le dossier personnel). La connexion tourne dans un pseudo-terminal : le CLI
//! ouvre lui-même le navigateur ; l'adresse qu'il affiche est relayée (`url`)
//! pour « Rouvrir la page ». La vérité sur « connecté » vient de la sonde
//! (`setup_probe`), jamais de la sortie du CLI.

use super::*;
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::{Mutex as StdMutex, OnceLock};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::sync::{mpsc, watch};

const INSTALL_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const LOGIN_POLL: Duration = Duration::from_secs(2);
/// Dernières lignes gardées pour expliquer un échec.
const TAIL_LINES: usize = 12;
const LINE_MAX: usize = 200;

pub(super) struct AgentSetup {
    /// Installeur officiel, sans Homebrew ni sudo.
    pub install: &'static str,
    /// Arguments de connexion, après le binaire.
    pub login: &'static [&'static str],
}

pub(super) fn agent_setup(id: &str) -> Option<AgentSetup> {
    match id {
        "claude" => Some(AgentSetup {
            install: "curl -fsSL https://claude.ai/install.sh | bash",
            login: &["auth", "login"],
        }),
        "codex" => Some(AgentSetup {
            install: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
            login: &["login"],
        }),
        _ => None,
    }
}

#[derive(Debug, PartialEq)]
pub(super) enum Stop {
    Cancelled,
    Failed(String),
}

struct Run {
    cancel: watch::Sender<bool>,
    input: mpsc::UnboundedSender<String>,
    last: Value,
}

fn runs() -> &'static StdMutex<HashMap<String, Run>> {
    static RUNS: OnceLock<StdMutex<HashMap<String, Run>>> = OnceLock::new();
    RUNS.get_or_init(Default::default)
}

fn lock_runs() -> std::sync::MutexGuard<'static, HashMap<String, Run>> {
    runs().lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn event(agent: &str, phase: &str, detail: Option<&str>, url: Option<&str>, error: Option<&str>) -> Value {
    json!({ "type": "setupRun", "agent": agent, "phase": phase, "detail": detail, "url": url, "error": error })
}

/// Retire les séquences d'échappement ANSI (couleurs, curseur, titres) et les
/// caractères de contrôle, en gardant les fins de ligne.
pub(super) fn strip_ansi(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            match chars.peek() {
                Some('[') => {
                    chars.next();
                    for d in chars.by_ref() {
                        if ('@'..='~').contains(&d) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    while let Some(d) = chars.next() {
                        if d == '\u{7}' {
                            break;
                        }
                        if d == '\u{1b}' {
                            chars.next();
                            break;
                        }
                    }
                }
                Some(_) => {
                    chars.next();
                }
                None => {}
            }
        } else if c == '\r' {
            out.push('\n');
        } else if c == '\n' || c == '\t' || !c.is_control() {
            out.push(c);
        }
    }
    out
}

/// Dernière adresse https COMPLÈTE du texte (suivie d'un blanc) : une
/// adresse coupée par la lecture attend la suite.
pub(super) fn last_complete_url(text: &str) -> Option<&str> {
    let mut found = None;
    let mut from = 0;
    while let Some(at) = text[from..].find("https://") {
        let start = from + at;
        let rest = &text[start..];
        match rest.find(|c: char| c.is_whitespace()) {
            Some(end) => {
                found = Some(rest[..end].trim_end_matches(['.', ',', ')', '"', '\'']));
                from = start + end;
            }
            None => break,
        }
    }
    found.filter(|url| url.len() > "https://".len())
}

fn push_lines(tail: &mut VecDeque<String>, text: &str, mut each: impl FnMut(&str)) {
    for line in text.lines() {
        let line: String = line.trim().chars().take(LINE_MAX).collect();
        if line.is_empty() {
            continue;
        }
        each(&line);
        if tail.len() == TAIL_LINES {
            tail.pop_front();
        }
        tail.push_back(line);
    }
}

fn tail_text(tail: &VecDeque<String>, fallback: &str) -> String {
    if tail.is_empty() {
        fallback.to_string()
    } else {
        tail.iter().cloned().collect::<Vec<_>>().join("\n")
    }
}

#[cfg(unix)]
fn kill_group(pid: Option<u32>) {
    if let Some(pid) = pid {
        // Le shell est chef de son groupe : le tuyau entier (curl | bash) part.
        unsafe {
            libc::killpg(pid as libc::pid_t, libc::SIGKILL);
        }
    }
}

#[cfg(not(unix))]
fn kill_group(_pid: Option<u32>) {}

/// Lance la ligne d'installation dans bash, sans terminal ni saisie, et
/// rapporte chaque ligne affichée. Échec = dernières lignes de la sortie.
pub(super) async fn run_install(
    line: &str,
    mut on_line: impl FnMut(&str),
    cancel: &mut watch::Receiver<bool>,
    timeout: Duration,
) -> Result<(), Stop> {
    let mut command = tokio::process::Command::new("/bin/bash");
    command
        .arg("-c")
        .arg(format!("set -o pipefail; {{ {line}; }} 2>&1"))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command
        .spawn()
        .map_err(|e| Stop::Failed(format!("bash introuvable : {e}")))?;
    let pid = child.id();
    let mut stdout = child.stdout.take().expect("stdout piped");
    let mut tail = VecDeque::new();
    let mut buf = [0u8; 4096];
    let deadline = tokio::time::sleep(timeout);
    tokio::pin!(deadline);
    loop {
        tokio::select! {
            read = stdout.read(&mut buf) => match read {
                Ok(0) | Err(_) => break,
                Ok(n) => push_lines(&mut tail, &strip_ansi(&String::from_utf8_lossy(&buf[..n])), &mut on_line),
            },
            _ = cancel.changed() => {
                kill_group(pid);
                let _ = child.kill().await;
                return Err(Stop::Cancelled);
            }
            _ = &mut deadline => {
                kill_group(pid);
                let _ = child.kill().await;
                return Err(Stop::Failed(tail_text(&tail, "L'installation n'a pas fini à temps.")));
            }
        }
    }
    match child.wait().await {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(Stop::Failed(tail_text(&tail, &format!("L'installeur s'est arrêté ({status}).")))),
        Err(e) => Err(Stop::Failed(e.to_string())),
    }
}

/// Lance la connexion du CLI dans un pseudo-terminal. `ready` est la sonde :
/// dès qu'elle répond vrai, la connexion est faite et le CLI est arrêté.
pub(super) async fn run_login<R, F>(
    bin: &Path,
    args: &[&str],
    mut on_url: impl FnMut(&str),
    mut ready: R,
    input: &mut mpsc::UnboundedReceiver<String>,
    cancel: &mut watch::Receiver<bool>,
    poll: Duration,
    timeout: Duration,
) -> Result<(), Stop>
where
    R: FnMut() -> F,
    F: std::future::Future<Output = bool>,
{
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    let pair = native_pty_system()
        .openpty(PtySize { rows: 40, cols: 200, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| Stop::Failed(format!("pseudo-terminal indisponible : {e}")))?;
    let mut command = CommandBuilder::new(bin);
    command.args(args);
    if let Some(home) = std::env::var_os("HOME") {
        command.cwd(home);
    }
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| Stop::Failed(format!("{} : {e}", bin.display())))?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| Stop::Failed(e.to_string()))?;
    let mut writer = pair.master.take_writer().map_err(|e| Stop::Failed(e.to_string()))?;
    let (tx, mut output) = mpsc::unbounded_channel::<String>();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        while let Ok(n) = reader.read(&mut buf) {
            if n == 0 || tx.send(String::from_utf8_lossy(&buf[..n]).into_owned()).is_err() {
                break;
            }
        }
    });

    let mut tail = VecDeque::new();
    let mut seen = String::new();
    let mut shown_url = String::new();
    let mut output_open = true;
    let started = tokio::time::Instant::now();
    let mut tick = tokio::time::interval(poll);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let outcome = loop {
        tokio::select! {
            chunk = output.recv(), if output_open => match chunk {
                Some(text) => {
                    let clean = strip_ansi(&text);
                    push_lines(&mut tail, &clean, |_| {});
                    seen.push_str(&clean);
                    if seen.len() > 16 * 1024 {
                        let cut = seen.len() - 8 * 1024;
                        let cut = (cut..seen.len()).find(|i| seen.is_char_boundary(*i)).unwrap_or(seen.len());
                        seen.drain(..cut);
                    }
                    if let Some(url) = last_complete_url(&seen) {
                        if url != shown_url {
                            shown_url = url.to_string();
                            on_url(url);
                        }
                    }
                }
                None => output_open = false,
            },
            Some(text) = input.recv() => {
                let _ = writer.write_all(text.trim_end_matches(['\r', '\n']).as_bytes());
                let _ = writer.write_all(b"\r");
                let _ = writer.flush();
            }
            _ = cancel.changed() => break Err(Stop::Cancelled),
            _ = tick.tick() => {
                if ready().await {
                    break Ok(());
                }
                if matches!(child.try_wait(), Ok(Some(_))) {
                    // Le CLI a fini : une dernière sonde, l'écriture des
                    // identifiants peut suivre de peu la sortie.
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    while let Ok(text) = output.try_recv() {
                        push_lines(&mut tail, &strip_ansi(&text), |_| {});
                    }
                    break if ready().await {
                        Ok(())
                    } else {
                        Err(Stop::Failed(tail_text(&tail, "La connexion s'est arrêtée sans aboutir.")))
                    };
                }
                if started.elapsed() >= timeout {
                    break Err(Stop::Failed("La connexion n'a pas été confirmée à temps.".into()));
                }
            }
        }
    };
    let _ = child.kill();
    let _ = child.wait();
    outcome
}

fn remember(agent: &str, value: &Value) {
    if let Some(run) = lock_runs().get_mut(agent) {
        run.last = value.clone();
    }
}

fn publish(state: &AppState, agent: &str, phase: &str, detail: Option<&str>, url: Option<&str>, error: Option<&str>) {
    let value = event(agent, phase, detail, url, error);
    remember(agent, &value);
    state.publish(json_msg(value));
}

async fn probe_state(state: &AppState, agent: &str) -> Option<Value> {
    state.provider(agent)?.setup_probe().await
}

async fn refresh(state: &AppState) {
    let refreshed = state.clone();
    let _ = crate::ws_dispatch::blocking(move || refreshed.refresh_providers()).await;
}

async fn drive(
    state: AppState,
    agent: String,
    setup: AgentSetup,
    mut cancel: watch::Receiver<bool>,
    mut input: mpsc::UnboundedReceiver<String>,
) -> Result<(), Stop> {
    refresh(&state).await;
    if state.provider(&agent).is_none() {
        publish(&state, &agent, "installing", None, None, None);
        let mut last_sent = tokio::time::Instant::now() - Duration::from_secs(1);
        run_install(
            setup.install,
            |line| {
                // Une barre de progression peut écrire cent lignes par seconde.
                if last_sent.elapsed() >= Duration::from_millis(250) {
                    last_sent = tokio::time::Instant::now();
                    publish(&state, &agent, "installing", Some(line), None, None);
                }
            },
            &mut cancel,
            INSTALL_TIMEOUT,
        )
        .await?;
        refresh(&state).await;
        if state.provider(&agent).is_none() {
            return Err(Stop::Failed(
                "L'installation a fini, mais Atelier ne trouve pas l'agent. Quitte Atelier et rouvre-le.".into(),
            ));
        }
    }
    let probe = probe_state(&state, &agent).await;
    let auth = probe.as_ref().and_then(|p| p.get("state")).and_then(Value::as_str).unwrap_or("ready");
    if auth == "login_needed" {
        let bin = probe
            .as_ref()
            .and_then(|p| p.get("binPath"))
            .and_then(Value::as_str)
            .map(std::path::PathBuf::from)
            .ok_or_else(|| Stop::Failed("Binaire de l'agent introuvable.".into()))?;
        publish(&state, &agent, "signing_in", None, None, None);
        run_login(
            &bin,
            setup.login,
            |url| publish(&state, &agent, "signing_in", None, Some(url), None),
            || async {
                probe_state(&state, &agent)
                    .await
                    .and_then(|p| p.get("state").and_then(Value::as_str).map(|s| s == "ready"))
                    .unwrap_or(false)
            },
            &mut input,
            &mut cancel,
            LOGIN_POLL,
            LOGIN_TIMEOUT,
        )
        .await?;
    }
    Ok(())
}

pub(super) fn handle_setup_run(state: &AppState, msg: &Value) -> Vec<String> {
    let agent = msg.get("agent").and_then(Value::as_str).unwrap_or_default().to_string();
    let Some(setup) = agent_setup(&agent) else {
        return vec![err(format!("setupRun : agent inconnu « {agent} »"))];
    };
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let (input_tx, input_rx) = mpsc::unbounded_channel();
    let first = event(&agent, "starting", None, None, None);
    {
        let mut runs = lock_runs();
        if let Some(run) = runs.get(&agent) {
            // Déjà en cours (deuxième clic, autre fenêtre) : l'état courant.
            return vec![json_msg(run.last.clone())];
        }
        runs.insert(agent.clone(), Run { cancel: cancel_tx, input: input_tx, last: first.clone() });
    }
    let task_state = state.clone();
    let task_agent = agent.clone();
    tokio::spawn(async move {
        let outcome = drive(task_state.clone(), task_agent.clone(), setup, cancel_rx, input_rx).await;
        let done = match &outcome {
            Ok(()) => event(&task_agent, "ready", None, None, None),
            Err(Stop::Cancelled) => event(&task_agent, "cancelled", None, None, None),
            Err(Stop::Failed(error)) => event(&task_agent, "failed", None, None, Some(error)),
        };
        lock_runs().remove(&task_agent);
        task_state.publish(json_msg(done));
        // Les rangées (installé, connecté, version) se remettent à jour.
        for message in handle_refresh_providers(&task_state).await {
            task_state.publish(message);
        }
    });
    vec![json_msg(first)]
}

pub(super) fn handle_setup_run_cancel(msg: &Value) -> Vec<String> {
    let agent = msg.get("agent").and_then(Value::as_str).unwrap_or_default();
    if let Some(run) = lock_runs().get(agent) {
        let _ = run.cancel.send(true);
    }
    vec![]
}

pub(super) fn handle_setup_run_input(msg: &Value) -> Vec<String> {
    let agent = msg.get("agent").and_then(Value::as_str).unwrap_or_default();
    let text = msg.get("text").and_then(Value::as_str).unwrap_or_default();
    // Une ligne, bornée : c'est un code de connexion, pas une commande.
    let line: String = text.lines().next().unwrap_or_default().chars().take(512).collect();
    if !line.trim().is_empty() {
        if let Some(run) = lock_runs().get(agent) {
            let _ = run.input.send(line);
        }
    }
    vec![]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_two_agents_install_without_homebrew() {
        for id in ["claude", "codex"] {
            let setup = agent_setup(id).unwrap();
            assert!(setup.install.starts_with("curl -fsSL https://"), "{id}");
            assert!(!setup.install.contains("brew") && !setup.install.contains("sudo"), "{id}");
            assert!(!setup.login.is_empty(), "{id}");
        }
        assert!(agent_setup("kimi").is_none());
    }

    #[test]
    fn ansi_sequences_and_carriage_returns_are_removed() {
        assert_eq!(strip_ansi("\u{1b}[32mok\u{1b}[0m\r\n"), "ok\n\n");
        assert_eq!(strip_ansi("\u{1b}]0;titre\u{7}a\u{1b}[2Kb"), "ab");
        assert_eq!(strip_ansi("10 %\r20 %"), "10 %\n20 %");
    }

    #[test]
    fn only_a_complete_url_is_reported() {
        assert_eq!(last_complete_url("Ouvre https://exemple.test/auth?x=1 puis"), Some("https://exemple.test/auth?x=1"));
        assert_eq!(last_complete_url("Ouvre https://exemple.test/au"), None);
        assert_eq!(last_complete_url("https://a.test/1 et https://b.test/2.\n"), Some("https://b.test/2"));
        assert_eq!(last_complete_url("rien ici\n"), None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn install_reports_lines_then_succeeds_or_explains_the_failure() {
        let (_tx, mut cancel) = watch::channel(false);
        let mut lines = Vec::new();
        let ok = run_install("echo un; echo deux >&2", |l| lines.push(l.to_string()), &mut cancel, Duration::from_secs(20)).await;
        assert_eq!(ok, Ok(()));
        assert_eq!(lines, ["un", "deux"]);

        let failed = run_install("echo boum; exit 3", |_| {}, &mut cancel, Duration::from_secs(20)).await;
        assert_eq!(failed, Err(Stop::Failed("boum".into())));

        // Un téléchargement raté (premier maillon du tuyau) est un échec.
        let piped = run_install("false | cat", |_| {}, &mut cancel, Duration::from_secs(20)).await;
        assert!(matches!(piped, Err(Stop::Failed(_))), "{piped:?}");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn install_stops_when_cancelled_or_too_long() {
        let (tx, mut cancel) = watch::channel(false);
        let started = std::time::Instant::now();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(150)).await;
            let _ = tx.send(true);
        });
        let stopped = run_install("sleep 30 | cat", |_| {}, &mut cancel, Duration::from_secs(60)).await;
        assert_eq!(stopped, Err(Stop::Cancelled));
        assert!(started.elapsed() < Duration::from_secs(10));

        let (_tx, mut cancel) = watch::channel(false);
        let late = run_install("echo lent; sleep 30", |_| {}, &mut cancel, Duration::from_millis(400)).await;
        assert_eq!(late, Err(Stop::Failed("lent".into())));
    }

    #[cfg(unix)]
    fn fake_cli(dir: &Path, body: &str) -> std::path::PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join("faux-cli");
        std::fs::write(&path, format!("#!/bin/bash\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn login_relays_the_url_takes_a_code_and_trusts_the_probe() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("connecte");
        // Comme un vrai CLI : exige un terminal, affiche l'adresse en couleur,
        // attend un code, puis écrit ses identifiants.
        let cli = fake_cli(
            dir.path(),
            &format!(
                "[ -t 0 ] || {{ echo 'pas de terminal'; exit 2; }}\n\
                 printf '\\033[1mOuvre https://exemple.test/auth?state=abc pour te connecter\\033[0m\\n'\n\
                 read -r code\n\
                 [ \"$code\" = 1234 ] && touch '{}'\n\
                 sleep 30",
                marker.display()
            ),
        );
        let (_ctx, mut cancel) = watch::channel(false);
        let (input_tx, mut input) = mpsc::unbounded_channel();
        let mut urls = Vec::new();
        let probe = marker.clone();
        let outcome = run_login(
            &cli,
            &["login"],
            |url| {
                urls.push(url.to_string());
                let _ = input_tx.send("1234\n".into());
            },
            || {
                let probe = probe.clone();
                async move { probe.exists() }
            },
            &mut input,
            &mut cancel,
            Duration::from_millis(100),
            Duration::from_secs(20),
        )
        .await;
        assert_eq!(outcome, Ok(()));
        assert_eq!(urls, ["https://exemple.test/auth?state=abc"]);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn login_that_ends_without_credentials_fails_with_its_last_words() {
        let dir = tempfile::tempdir().unwrap();
        let cli = fake_cli(dir.path(), "echo 'Connexion refusée'; exit 1");
        let (_ctx, mut cancel) = watch::channel(false);
        let (_input_tx, mut input) = mpsc::unbounded_channel();
        let outcome = run_login(
            &cli,
            &[],
            |_| {},
            || async { false },
            &mut input,
            &mut cancel,
            Duration::from_millis(100),
            Duration::from_secs(20),
        )
        .await;
        assert_eq!(outcome, Err(Stop::Failed("Connexion refusée".into())));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn login_stops_when_cancelled() {
        let dir = tempfile::tempdir().unwrap();
        let cli = fake_cli(dir.path(), "sleep 30");
        let (tx, mut cancel) = watch::channel(false);
        let (_input_tx, mut input) = mpsc::unbounded_channel();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            let _ = tx.send(true);
        });
        let started = std::time::Instant::now();
        let outcome = run_login(
            &cli,
            &[],
            |_| {},
            || async { false },
            &mut input,
            &mut cancel,
            Duration::from_millis(100),
            Duration::from_secs(60),
        )
        .await;
        assert_eq!(outcome, Err(Stop::Cancelled));
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn an_unknown_agent_is_refused_and_inputs_without_a_run_are_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        );
        let out = handle_setup_run(&state, &json!({ "agent": "kimi" }));
        assert!(out[0].contains("agent inconnu"), "{out:?}");
        assert!(handle_setup_run_cancel(&json!({ "agent": "claude" })).is_empty());
        assert!(handle_setup_run_input(&json!({ "agent": "claude", "text": "1234" })).is_empty());
    }
}
