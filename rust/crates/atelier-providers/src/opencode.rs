//! OpenCode provider via CLI JSON stream (plan 033 Porte 8).

use crate::opencode_parse::parse_opencode_jsonl;
use crate::traits::{Provider, ProviderCaps, SendRequest, SendResult};
use async_trait::async_trait;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub struct OpenCodeProvider {
    bin: PathBuf,
    runs: Mutex<HashMap<String, Child>>,
}

impl OpenCodeProvider {
    pub fn new() -> Option<Self> {
        resolve_bin().map(|bin| Self {
            bin,
            runs: Mutex::new(HashMap::new()),
        })
    }
}

fn resolve_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_OPENCODE_BIN") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    for name in ["opencode", "oc"] {
        if let Ok(out) = std::process::Command::new("which").arg(name).output() {
            if out.status.success() {
                let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
                if !p.as_os_str().is_empty() {
                    return Some(p);
                }
            }
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let p = home.join(".opencode/bin/opencode");
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

fn map_effort(effort: Option<&str>) -> Option<&'static str> {
    match effort? {
        "minimal" | "low" => Some("low"),
        "medium" => Some("medium"),
        "high" | "xhigh" | "max" => Some("high"),
        _ => None,
    }
}

#[async_trait]
impl Provider for OpenCodeProvider {
    fn id(&self) -> &str {
        "opencode"
    }
    fn label(&self) -> &str {
        "OpenCode"
    }
    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            resume: true,
            steering: false,
            queue: true,
            goals: false,
            tools: true,
        }
    }
    fn models(&self) -> Vec<String> {
        vec![
            "openrouter/z-ai/glm-5.2".into(),
            "openrouter/minimax/minimax-m3".into(),
            "openrouter/openrouter/auto".into(),
        ]
    }
    fn default_model(&self) -> String {
        "openrouter/z-ai/glm-5.2".into()
    }
    fn efforts(&self) -> Vec<String> {
        vec![
            "minimal".into(),
            "low".into(),
            "medium".into(),
            "high".into(),
            "xhigh".into(),
            "max".into(),
        ]
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        {
            let mut runs = self.runs.lock().await;
            if let Some(mut prev) = runs.remove(&req.thread_id) {
                let _ = prev.kill().await;
            }
        }
        let cwd = if req.project_root.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        } else {
            req.project_root.clone()
        };
        let mut args = vec![
            "--pure".into(),
            "run".into(),
            "--format".into(),
            "json".into(),
            "--dir".into(),
            cwd.clone(),
            "--auto".into(),
        ];
        if let Some(m) = req.model.as_ref().filter(|s| !s.is_empty()) {
            args.push("--model".into());
            args.push(m.clone());
        }
        if let Some(e) = map_effort(req.effort.as_deref()) {
            args.push("--variant".into());
            args.push(e.into());
        }
        if let Some(sid) = req.session_id.as_ref().filter(|s| !s.is_empty()) {
            args.push("--session".into());
            args.push(sid.clone());
        }
        args.push(req.prompt.clone());

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
                (req.on_event)(json!({"kind":"error","message": format!("spawn opencode: {e}")}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some(e.to_string()),
                };
            }
        };
        let stdout = child.stdout.take().expect("stdout");
        let _ = child.stderr.take();
        self.runs
            .lock()
            .await
            .insert(req.thread_id.clone(), child);

        let mut rest = String::new();
        let mut reader = BufReader::new(stdout).lines();
        let mut sid = req.session_id.clone();
        let mut ok = true;
        let mut err_msg = None;
        let mut saw_done = false;
        let mut last_usage = json!({"context":0,"output":0,"cost":null,"turns":null});
        let mut full_text = String::new();

        loop {
            if (req.is_cancelled)() {
                if let Some(mut c) = self.runs.lock().await.remove(&req.thread_id) {
                    #[cfg(unix)]
                    if let Some(pid) = c.id() {
                        unsafe {
                            libc::kill(-(pid as i32), libc::SIGTERM);
                        }
                    }
                    let _ = c.kill().await;
                }
                if !full_text.is_empty() {
                    (req.on_event)(json!({"kind":"text","text": full_text}));
                }
                (req.on_event)(json!({"kind":"done","ok": false, "result": full_text, "usage": last_usage}));
                return SendResult {
                    session_id: sid,
                    ok: false,
                    error: Some("interrupted".into()),
                };
            }
            match reader.next_line().await {
                Ok(Some(line)) => {
                    let (events, r) = parse_opencode_jsonl(&format!("{line}\n"), &rest);
                    rest = r;
                    for ev in events {
                        if let Some(s) = ev.get("sessionId").and_then(|v| v.as_str()) {
                            sid = Some(s.to_string());
                        }
                        let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                        if kind == "delta" {
                            if let Some(t) = ev.get("text").and_then(|v| v.as_str()) {
                                full_text.push_str(t);
                            }
                        }
                        if kind == "usage" {
                            if let Some(u) = ev.get("usage") {
                                last_usage = u.clone();
                            }
                        }
                        if kind == "done" {
                            saw_done = true;
                            ok = ev.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
                        }
                        if kind == "error" {
                            ok = false;
                            err_msg = ev
                                .get("message")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                        }
                        (req.on_event)(ev);
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    ok = false;
                    err_msg = Some(e.to_string());
                    break;
                }
            }
        }

        if let Some(mut c) = self.runs.lock().await.remove(&req.thread_id) {
            let _ = c.wait().await;
        }

        if !saw_done {
            if !full_text.is_empty() {
                (req.on_event)(json!({"kind":"text","text": full_text}));
            }
            if ok {
                (req.on_event)(json!({
                    "kind":"done","ok":true,"result": full_text, "usage": last_usage
                }));
            } else {
                (req.on_event)(json!({
                    "kind":"error",
                    "message": err_msg.clone().unwrap_or_else(|| "OpenCode terminé en erreur".into())
                }));
            }
        }

        SendResult {
            session_id: sid,
            ok,
            error: err_msg,
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        if let Some(mut c) = self.runs.lock().await.remove(thread_id) {
            #[cfg(unix)]
            if let Some(pid) = c.id() {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
            }
            let _ = c.kill().await;
            true
        } else {
            false
        }
    }
}
