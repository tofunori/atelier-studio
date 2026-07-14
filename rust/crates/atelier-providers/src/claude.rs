//! Claude Code provider via system CLI stream-json (plan 033 Porte 6).
//!
//! Spawns `claude -p --verbose --output-format stream-json` (and optional
//! `--resume`). Steering uses a new one-shot with resume when a session exists;
//! interrupt kills the active child process group.

use crate::claude_parse::{flush_pending, parse_line, ClaudeStreamState};
use crate::traits::{Provider, ProviderCaps, SendRequest, SendResult};
use async_trait::async_trait;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

struct ActiveRun {
    child: Child,
}

pub struct ClaudeProvider {
    bin: PathBuf,
    /// Active child per thread (for interrupt).
    runs: Mutex<HashMap<String, ActiveRun>>,
}

impl ClaudeProvider {
    pub fn new() -> Option<Self> {
        resolve_claude_bin().map(|bin| Self {
            bin,
            runs: Mutex::new(HashMap::new()),
        })
    }

    pub fn with_bin(bin: PathBuf) -> Self {
        Self {
            bin,
            runs: Mutex::new(HashMap::new()),
        }
    }
}

impl Default for ClaudeProvider {
    fn default() -> Self {
        Self::new().unwrap_or_else(|| Self {
            bin: PathBuf::from("claude"),
            runs: Mutex::new(HashMap::new()),
        })
    }
}

fn resolve_claude_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_CLAUDE_BIN") {
        let pb = PathBuf::from(&p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    // PATH lookup
    if let Ok(out) = std::process::Command::new("which").arg("claude").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(PathBuf::from(p));
            }
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    for rel in [
        ".local/bin/claude",
        ".claude/local/claude",
        "node_modules/.bin/claude",
    ] {
        let p = home.join(rel);
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

fn build_args(req: &SendRequest) -> Vec<String> {
    let mut args = vec![
        "-p".into(),
        "--verbose".into(),
        "--output-format".into(),
        "stream-json".into(),
        "--include-partial-messages".into(),
        "--permission-mode".into(),
        "bypassPermissions".into(),
        "--dangerously-skip-permissions".into(),
    ];
    // Prefer full settings (CLAUDE.md, skills) unless bare requested.
    if std::env::var("ATELIER_CLAUDE_BARE").is_ok() {
        args.push("--bare".into());
    }
    if let Some(model) = &req.model {
        if !model.is_empty() {
            args.push("--model".into());
            args.push(model.clone());
        }
    }
    if let Some(sid) = &req.session_id {
        if !sid.is_empty()
            && regex_is_uuid(sid)
        {
            args.push("--resume".into());
            args.push(sid.clone());
        }
    }
    // Prompt as final arg (one-shot). Steer = same with resume.
    args.push(req.prompt.clone());
    args
}

fn regex_is_uuid(s: &str) -> bool {
    let s = s.trim();
    if s.len() != 36 {
        return false;
    }
    let b = s.as_bytes();
    // 8-4-4-4-12
    for (i, c) in b.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if *c != b'-' {
                    return false;
                }
            }
            _ => {
                if !c.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

#[async_trait]
impl Provider for ClaudeProvider {
    fn id(&self) -> &str {
        "claude"
    }
    fn label(&self) -> &str {
        "Claude Code"
    }
    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            resume: true,
            steering: true,
            queue: true,
            goals: false,
            tools: true,
        }
    }
    fn models(&self) -> Vec<String> {
        vec![
            "claude-fable-5".into(),
            "claude-opus-4-8".into(),
            "claude-sonnet-5".into(),
            "claude-haiku-4-5-20251001".into(),
        ]
    }
    fn default_model(&self) -> String {
        "claude-sonnet-5[1m]".into()
    }
    fn efforts(&self) -> Vec<String> {
        vec![
            "low".into(),
            "medium".into(),
            "high".into(),
            "xhigh".into(),
            "max".into(),
        ]
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        // Kill any previous child for this thread
        {
            let mut runs = self.runs.lock().await;
            if let Some(mut prev) = runs.remove(&req.thread_id) {
                let _ = prev.child.kill().await;
                let _ = prev.child.wait().await;
            }
        }

        let cwd = if req.project_root.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        } else {
            req.project_root.clone()
        };

        let args = build_args(&req);
        let mut cmd = Command::new(&self.bin);
        cmd.args(&args)
            .current_dir(&cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .kill_on_drop(true);

        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                (req.on_event)(json!({
                    "kind": "error",
                    "message": format!("spawn claude: {e}")
                }));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some(format!("spawn claude: {e}")),
                };
            }
        };

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                (req.on_event)(json!({"kind":"error","message":"pas de stdout claude"}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some("pas de stdout".into()),
                };
            }
        };
        if let Some(err) = child.stderr.take() {
            tokio::spawn(async move {
                let mut lines = BufReader::new(err).lines();
                let log_dir = dirs_log();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = append_log(&log_dir, &line);
                }
            });
        }

        let mut state = ClaudeStreamState::default();
        if let Some(sid) = &req.session_id {
            state.session_id = Some(sid.clone());
        }

        let thread_id = req.thread_id.clone();
        let is_cancelled = Arc::clone(&req.is_cancelled);
        let on_event = Arc::clone(&req.on_event);

        let pid = child.id();
        self.runs
            .lock()
            .await
            .insert(thread_id.clone(), ActiveRun { child });

        let mut reader = BufReader::new(stdout).lines();
        let mut ok = true;
        let mut err_msg = None;

        loop {
            if is_cancelled() {
                // kill process group
                if let Some(pid) = pid {
                    kill_process_group(pid);
                }
                let mut runs = self.runs.lock().await;
                if let Some(mut r) = runs.remove(&thread_id) {
                    let _ = r.child.kill().await;
                    let _ = r.child.wait().await;
                }
                let mut flush = Vec::new();
                flush_pending(&mut state, &mut flush);
                for ev in flush {
                    on_event(ev);
                }
                if !state.saw_terminal {
                    on_event(json!({"kind":"error","message":"interrupted"}));
                }
                return SendResult {
                    session_id: state.session_id,
                    ok: false,
                    error: Some("interrupted".into()),
                };
            }

            match reader.next_line().await {
                Ok(Some(line)) => {
                    let events = parse_line(&mut state, &line);
                    for ev in events {
                        let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                        if kind == "error" {
                            ok = false;
                            err_msg = ev
                                .get("message")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                        }
                        if kind == "done"
                            && ev.get("ok").and_then(|v| v.as_bool()) == Some(false)
                        {
                            ok = false;
                            err_msg = ev
                                .get("result")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                        }
                        on_event(ev);
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    ok = false;
                    err_msg = Some(format!("read claude stdout: {e}"));
                    break;
                }
            }
        }

        // Reap child
        {
            let mut runs = self.runs.lock().await;
            if let Some(mut r) = runs.remove(&thread_id) {
                let _ = r.child.wait().await;
            }
        }

        if !state.saw_terminal {
            let mut flush = Vec::new();
            flush_pending(&mut state, &mut flush);
            for ev in flush {
                on_event(ev);
            }
            on_event(json!({
                "kind": "error",
                "message": err_msg.clone().unwrap_or_else(|| "session terminée sans résultat".into())
            }));
            ok = false;
        }

        SendResult {
            session_id: state.session_id,
            ok,
            error: err_msg,
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        let mut runs = self.runs.lock().await;
        if let Some(mut r) = runs.remove(thread_id) {
            if let Some(pid) = r.child.id() {
                kill_process_group(pid);
            }
            let _ = r.child.kill().await;
            let _ = r.child.wait().await;
            true
        } else {
            false
        }
    }
}

fn kill_process_group(pid: u32) {
    #[cfg(unix)]
    {
        unsafe {
            // negative pid = process group
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
    }
}

fn dirs_log() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    home.join("Library/Logs/atelier-studio")
}

fn append_log(dir: &std::path::Path, line: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("claude-cli.log"))?;
    writeln!(f, "{line}")
}
