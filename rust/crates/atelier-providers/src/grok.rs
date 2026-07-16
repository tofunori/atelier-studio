//! Grok provider — legacy streaming-json CLI (plan 033 Porte 8).
//! ACP full duplex is deferred; this path matches the Node `runLegacy` fallback.

use crate::grok_parse::parse_grok_jsonl;
use crate::traits::{Provider, ProviderCaps, SendRequest, SendResult};
use async_trait::async_trait;
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub struct GrokProvider {
    bin: PathBuf,
    runs: Mutex<HashMap<String, Child>>,
}

impl GrokProvider {
    pub fn new() -> Option<Self> {
        resolve_bin().map(|bin| Self {
            bin,
            runs: Mutex::new(HashMap::new()),
        })
    }
}

fn resolve_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_GROK_BIN") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    which("grok")
}

fn which(name: &str) -> Option<PathBuf> {
    std::process::Command::new("which")
        .arg(name)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| PathBuf::from(String::from_utf8_lossy(&o.stdout).trim()))
        .filter(|p| !p.as_os_str().is_empty())
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
impl Provider for GrokProvider {
    fn id(&self) -> &str {
        "grok"
    }
    fn label(&self) -> &str {
        "Grok"
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
        vec!["grok-4.5".into(), "grok-composer-2.5-fast".into()]
    }
    fn default_model(&self) -> String {
        "grok-4.5".into()
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
            "--output-format".into(),
            "streaming-json".into(),
            "--cwd".into(),
            cwd.clone(),
            "--always-approve".into(),
        ];
        if let Some(m) = req.model.as_ref().filter(|s| !s.is_empty()) {
            args.push("--model".into());
            args.push(m.clone());
        }
        if let Some(e) = map_effort(req.effort.as_deref()) {
            args.push("--effort".into());
            args.push(e.into());
        }
        if let Some(sid) = req.session_id.as_ref().filter(|s| !s.is_empty()) {
            args.push("--resume".into());
            args.push(sid.clone());
        }
        args.push("-p".into());
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
                (req.on_event)(json!({"kind":"error","message": format!("spawn grok: {e}")}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some(format!("spawn grok: {e}")),
                };
            }
        };
        let stdout = child.stdout.take().expect("stdout");
        if let Some(err) = child.stderr.take() {
            tokio::spawn(async move {
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(_)) = lines.next_line().await {}
            });
        }

        self.runs.lock().await.insert(req.thread_id.clone(), child);

        let mut rest = String::new();
        let mut reader = BufReader::new(stdout).lines();
        let mut sid = req.session_id.clone();
        let mut ok = true;
        let mut err_msg = None;
        let mut saw_done = false;
        let mut full_text = String::new();
        let mut text_flushed = false;

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
                if !saw_done {
                    (req.on_event)(json!({"kind":"error","message":"interrupted"}));
                }
                return SendResult {
                    session_id: sid,
                    ok: false,
                    error: Some("interrupted".into()),
                };
            }
            match reader.next_line().await {
                Ok(Some(line)) => {
                    let (events, r) = parse_grok_jsonl(&format!("{line}\n"), &rest);
                    rest = r;
                    for ev in events {
                        if let Some(s) = ev.get("sessionId").and_then(|v| v.as_str()) {
                            sid = Some(s.to_string());
                        }
                        let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                        if kind == "delta" {
                            if let Some(text) = ev.get("text").and_then(|v| v.as_str()) {
                                full_text.push_str(text);
                            }
                        }
                        if kind == "done" {
                            if !text_flushed && !full_text.is_empty() {
                                (req.on_event)(json!({"kind":"text","text": full_text.clone()}));
                                text_flushed = true;
                            }
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
            if ok {
                if !text_flushed && !full_text.is_empty() {
                    (req.on_event)(json!({"kind":"text","text": full_text.clone()}));
                }
                (req.on_event)(json!({
                    "kind": "done", "ok": true, "result": "",
                    "usage": {"context":0,"output":0,"cost":null,"turns":null}
                }));
            } else {
                (req.on_event)(json!({
                    "kind": "error",
                    "message": err_msg.clone().unwrap_or_else(|| "Grok terminé sans résultat".into())
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
