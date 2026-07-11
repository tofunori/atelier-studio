//! Shared Codex `app-server` JSON-RPC client (one process, many threads).

use crate::codex_parse::build_approval_response;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot, Mutex};

type NotifHandler = Arc<dyn Fn(&str, &Value) + Send + Sync>;

struct Pending {
    tx: oneshot::Sender<Result<Value, String>>,
}

struct Inner {
    child: Child,
    stdin: ChildStdin,
    pending: HashMap<u64, Pending>,
    /// codexThreadId → notification handler for active turns
    handlers: HashMap<String, NotifHandler>,
    /// sandbox per codex thread for auto-approvals
    sandboxes: HashMap<String, String>,
    next_id: AtomicU64,
}

pub struct CodexAppServer {
    inner: Arc<Mutex<Option<Inner>>>,
}

impl CodexAppServer {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    fn resolve_bin() -> PathBuf {
        if let Ok(p) = std::env::var("ATELIER_CODEX_BIN") {
            let pb = PathBuf::from(&p);
            if pb.is_file() {
                return pb;
            }
        }
        if let Ok(out) = std::process::Command::new("which").arg("codex").output() {
            if out.status.success() {
                let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !p.is_empty() {
                    return PathBuf::from(p);
                }
            }
        }
        PathBuf::from("codex")
    }

    pub async fn ensure(&self) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            return Ok(());
        }
        let bin = Self::resolve_bin();
        let mut cmd = Command::new(&bin);
        cmd.arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }
        let mut child = cmd.spawn().map_err(|e| format!("spawn codex app-server: {e}"))?;
        let stdin = child.stdin.take().ok_or("pas de stdin")?;
        let stdout = child.stdout.take().ok_or("pas de stdout")?;

        let inner_slot = Arc::clone(&self.inner);
        let (line_tx, mut line_rx) = mpsc::unbounded_channel::<String>();

        // Reader task
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line_tx.send(line).is_err() {
                    break;
                }
            }
            // process died
            let mut g = inner_slot.lock().await;
            if let Some(mut inn) = g.take() {
                for (_, p) in inn.pending.drain() {
                    let _ = p.tx.send(Err("codex app-server terminé".into()));
                }
                for (_, h) in inn.handlers.drain() {
                    h(
                        "turn/completed",
                        &json!({"turn":{"status":"failed","error":{"message":"app-server terminé"}}}),
                    );
                }
                let _ = inn.child.kill().await;
            }
        });

        // Dispatcher task — needs access to inner
        let inner_for_disp = Arc::clone(&self.inner);
        tokio::spawn(async move {
            while let Some(line) = line_rx.recv().await {
                let msg: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let mut g = inner_for_disp.lock().await;
                let Some(inn) = g.as_mut() else { continue };

                // Server → client request (has id + method)
                if msg.get("id").is_some() && msg.get("method").is_some() {
                    let id = msg.get("id").cloned().unwrap_or(json!(null));
                    let method = msg
                        .get("method")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let params = msg.get("params").cloned().unwrap_or(json!({}));
                    let tid = params
                        .get("threadId")
                        .or_else(|| params.get("conversationId"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let full = inn
                        .sandboxes
                        .get(tid)
                        .map(|s| s == "danger-full-access")
                        .unwrap_or(false);
                    let result = build_approval_response(&method, full);
                    let reply = json!({"id": id, "result": result});
                    if let Ok(s) = serde_json::to_string(&reply) {
                        let _ = inn.stdin.write_all(s.as_bytes()).await;
                        let _ = inn.stdin.write_all(b"\n").await;
                    }
                    continue;
                }

                // Response to our request
                if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                    if let Some(p) = inn.pending.remove(&id) {
                        if let Some(err) = msg.get("error") {
                            let m = err
                                .get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("erreur app-server");
                            let _ = p.tx.send(Err(m.to_string()));
                        } else {
                            let _ = p
                                .tx
                                .send(Ok(msg.get("result").cloned().unwrap_or(Value::Null)));
                        }
                    }
                    continue;
                }

                // Notification
                if let Some(method) = msg.get("method").and_then(|v| v.as_str()) {
                    let params = msg.get("params").cloned().unwrap_or(json!({}));
                    let codex_tid = params
                        .get("threadId")
                        .or_else(|| params.pointer("/thread/id"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !codex_tid.is_empty() {
                        if let Some(h) = inn.handlers.get(&codex_tid) {
                            h(method, &params);
                        }
                    }
                }
            }
        });

        let inn = Inner {
            child,
            stdin,
            pending: HashMap::new(),
            handlers: HashMap::new(),
            sandboxes: HashMap::new(),
            next_id: AtomicU64::new(1),
        };
        *guard = Some(inn);
        drop(guard);

        // initialize (without re-entering ensure)
        let _ = self
            .request_raw(
                "initialize",
                json!({
                    "clientInfo": {
                        "name": "atelier-studio",
                        "title": "Atelier Studio",
                        "version": "0.1.0"
                    },
                    "capabilities": null
                }),
            )
            .await?;

        {
            let mut g = self.inner.lock().await;
            if let Some(inn) = g.as_mut() {
                let s = r#"{"method":"initialized"}"#;
                inn.stdin
                    .write_all(s.as_bytes())
                    .await
                    .map_err(|e| e.to_string())?;
                inn.stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    async fn request_raw(&self, method: &str, params: Value) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel();
        {
            let mut g = self.inner.lock().await;
            let inn = g.as_mut().ok_or("app-server absent")?;
            let id = inn.next_id.fetch_add(1, Ordering::SeqCst);
            inn.pending.insert(id, Pending { tx });
            let msg = json!({"id": id, "method": method, "params": params});
            let s = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
            inn.stdin
                .write_all(s.as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            inn.stdin.write_all(b"\n").await.map_err(|e| e.to_string())?;
        }
        rx.await.map_err(|_| "rpc cancelled".to_string())?
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.ensure().await?;
        self.request_raw(method, params).await
    }

    pub async fn set_handler(&self, codex_thread_id: &str, handler: NotifHandler) {
        let mut g = self.inner.lock().await;
        if let Some(inn) = g.as_mut() {
            inn.handlers
                .insert(codex_thread_id.to_string(), handler);
        }
    }

    pub async fn clear_handler(&self, codex_thread_id: &str) {
        let mut g = self.inner.lock().await;
        if let Some(inn) = g.as_mut() {
            inn.handlers.remove(codex_thread_id);
        }
    }

    pub async fn set_sandbox(&self, codex_thread_id: &str, sandbox: &str) {
        let mut g = self.inner.lock().await;
        if let Some(inn) = g.as_mut() {
            inn.sandboxes
                .insert(codex_thread_id.to_string(), sandbox.to_string());
        }
    }
}

impl Default for CodexAppServer {
    fn default() -> Self {
        Self::new()
    }
}
