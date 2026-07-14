//! Codex provider via `codex app-server` JSON-RPC (plan 033 Porte 7).

use crate::codex_parse::{map_turn_notification, TurnMapState};
use crate::codex_rpc::CodexAppServer;
use crate::traits::{Provider, ProviderCaps, SendMode, SendRequest, SendResult};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{oneshot, Mutex};

#[derive(Clone)]
struct ActiveTurn {
    codex_id: String,
    turn_id: Option<String>,
}

pub struct CodexProvider {
    server: Arc<CodexAppServer>,
    /// Sync mutex: updated from notification callback + async interrupt.
    active: Arc<StdMutex<HashMap<String, ActiveTurn>>>,
}

impl CodexProvider {
    pub fn new() -> Option<Self> {
        let present = std::env::var("ATELIER_CODEX_BIN")
            .map(|p| std::path::Path::new(&p).is_file())
            .unwrap_or(false)
            || std::process::Command::new("which")
                .arg("codex")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
        if !present {
            return None;
        }
        Some(Self {
            server: Arc::new(CodexAppServer::new()),
            active: Arc::new(StdMutex::new(HashMap::new())),
        })
    }

    async fn run_native_review(&self, codex_id: &str) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel::<String>();
        let tx = Arc::new(StdMutex::new(Some(tx)));
        let tx_handler = Arc::clone(&tx);
        let handler = Arc::new(move |method: &str, params: &Value| {
            if method != "item/completed" {
                return;
            }
            let item = params.get("item").unwrap_or(&Value::Null);
            if item.get("type").and_then(Value::as_str) != Some("exitedReviewMode") {
                return;
            }
            let review = item
                .get("review")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if let Ok(mut slot) = tx_handler.lock() {
                if let Some(sender) = slot.take() {
                    let _ = sender.send(review);
                }
            }
        });
        self.server.set_handler(codex_id, handler).await;
        let started = self
            .server
            .request(
                "review/start",
                json!({
                    "threadId": codex_id,
                    "target": {"type": "uncommittedChanges"},
                    "delivery": "inline",
                }),
            )
            .await;
        if let Err(error) = started {
            self.server.clear_handler(codex_id).await;
            return Err(error);
        }
        let review = tokio::time::timeout(std::time::Duration::from_secs(600), rx).await;
        self.server.clear_handler(codex_id).await;
        let review = review
            .map_err(|_| "review Codex: délai dépassé".to_string())?
            .map_err(|_| "review Codex annulée".to_string())?;
        Ok(json!({"review": review}))
    }
}

impl Default for CodexProvider {
    fn default() -> Self {
        Self {
            server: Arc::new(CodexAppServer::new()),
            active: Arc::new(StdMutex::new(HashMap::new())),
        }
    }
}

fn codex_safety(permission_mode: Option<&str>) -> (&'static str, &'static str) {
    match permission_mode {
        Some("bypassPermissions") => ("danger-full-access", "never"),
        Some("acceptEdits") => ("workspace-write", "on-request"),
        Some("default") => ("workspace-write", "untrusted"),
        Some("plan") => ("read-only", "never"),
        _ => ("read-only", "on-request"),
    }
}

fn thread_opts(req: &SendRequest) -> Value {
    let (sandbox, approval_policy) = codex_safety(req.permission_mode.as_deref());
    let mut opts = json!({
        "cwd": if req.project_root.is_empty() { Value::Null } else { json!(req.project_root) },
        "sandbox": sandbox,
        "approvalPolicy": approval_policy,
    });
    if let Some(model) = req.model.as_ref().filter(|m| !m.is_empty()) {
        opts.as_object_mut()
            .unwrap()
            .insert("model".into(), json!(model));
    }
    if let Some(effort) = req.effort.as_ref().filter(|e| !e.is_empty()) {
        opts.as_object_mut().unwrap().insert(
            "config".into(),
            json!({"model_reasoning_effort": effort}),
        );
    }
    opts
}

async fn resolve_plan_mode(server: &CodexAppServer) -> Option<Value> {
    let response = server.request("collaborationMode/list", json!({})).await.ok()?;
    response
        .get("modes")
        .or_else(|| response.get("collaborationModes"))
        .and_then(Value::as_array)?
        .iter()
        .find(|mode| mode.get("mode").and_then(Value::as_str) == Some("plan"))
        .cloned()
}

fn build_input(prompt: &str) -> Value {
    json!([{ "type": "text", "text": prompt }])
}

async fn open_thread(
    server: &CodexAppServer,
    session_id: Option<&str>,
    opts: Value,
) -> Result<String, String> {
    if let Some(sid) = session_id.filter(|s| !s.is_empty()) {
        let mut params = opts;
        params
            .as_object_mut()
            .unwrap()
            .insert("threadId".into(), json!(sid));
        let resp = server.request("thread/resume", params).await?;
        Ok(resp
            .pointer("/thread/id")
            .and_then(|v| v.as_str())
            .unwrap_or(sid)
            .to_string())
    } else {
        let resp = server.request("thread/start", opts).await?;
        resp.pointer("/thread/id")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .ok_or_else(|| "thread/start sans id".into())
    }
}

#[async_trait]
impl Provider for CodexProvider {
    fn id(&self) -> &str {
        "codex"
    }
    fn label(&self) -> &str {
        "Codex"
    }
    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            resume: true,
            steering: true,
            queue: true,
            goals: true,
            tools: true,
        }
    }
    fn models(&self) -> Vec<String> {
        vec![
            "gpt-5.6-sol".into(),
            "gpt-5.6-terra".into(),
            "gpt-5.6-luna".into(),
            "gpt-5.5".into(),
            "gpt-5.1-codex-max".into(),
            "gpt-5.1-codex".into(),
        ]
    }
    fn default_model(&self) -> String {
        "gpt-5.6-sol".into()
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
        if let Err(e) = self.server.ensure().await {
            (req.on_event)(json!({"kind":"error","message": e}));
            return SendResult {
                session_id: req.session_id,
                ok: false,
                error: Some(e),
            };
        }

        // Native steer
        if req.mode == SendMode::Steer {
            let snap = self.active.lock().ok().and_then(|g| g.get(&req.thread_id).cloned());
            if let Some(t) = snap {
                if let Some(turn_id) = t.turn_id {
                    if self
                        .server
                        .request(
                            "turn/steer",
                            json!({
                                "threadId": t.codex_id,
                                "input": build_input(&req.prompt),
                                "expectedTurnId": turn_id,
                            }),
                        )
                        .await
                        .is_ok()
                    {
                        (req.on_event)(json!({"kind":"tool","name":"__steered"}));
                        return SendResult {
                            session_id: Some(t.codex_id),
                            ok: true,
                            error: None,
                        };
                    }
                }
            }
        }

        let opts = thread_opts(&req);
        let codex_id = match open_thread(&self.server, req.session_id.as_deref(), opts).await {
            Ok(id) => id,
            Err(e) => {
                (req.on_event)(json!({"kind":"error","message": e}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some(e),
                };
            }
        };
        self.server
            .set_sandbox(&codex_id, "danger-full-access")
            .await;

        if let Ok(mut a) = self.active.lock() {
            a.insert(
                req.thread_id.clone(),
                ActiveTurn {
                    codex_id: codex_id.clone(),
                    turn_id: None,
                },
            );
        }

        let (done_tx, done_rx) = oneshot::channel::<(bool, Option<String>)>();
        let done_slot = Arc::new(Mutex::new(Some(done_tx)));
        let finished = Arc::new(AtomicBool::new(false));
        let map_state = Arc::new(StdMutex::new(TurnMapState::default()));
        let on_event = Arc::clone(&req.on_event);
        let active = Arc::clone(&self.active);
        let thread_id = req.thread_id.clone();
        let codex_for_h = codex_id.clone();
        let finished2 = Arc::clone(&finished);
        let done_slot2 = Arc::clone(&done_slot);

        let handler: Arc<dyn Fn(&str, &Value) + Send + Sync> = Arc::new(move |method, params| {
            if method == "turn/started" {
                if let Some(tid) = params.pointer("/turn/id").and_then(|v| v.as_str()) {
                    if let Ok(mut a) = active.lock() {
                        a.insert(
                            thread_id.clone(),
                            ActiveTurn {
                                codex_id: codex_for_h.clone(),
                                turn_id: Some(tid.to_string()),
                            },
                        );
                    }
                }
            }
            let events = {
                let Ok(mut st) = map_state.lock() else {
                    return;
                };
                map_turn_notification(method, params, &mut st)
            };
            for ev in events {
                let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                if kind == "done" || kind == "error" {
                    if finished2.swap(true, Ordering::SeqCst) {
                        continue;
                    }
                    let ok =
                        kind == "done" && ev.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
                    let err = if ok {
                        None
                    } else {
                        Some(
                            ev.get("result")
                                .or_else(|| ev.get("message"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("échec")
                                .to_string(),
                        )
                    };
                    on_event(ev);
                    // complete oneshot from sync context
                    if let Ok(mut slot) = done_slot2.try_lock() {
                        if let Some(tx) = slot.take() {
                            let _ = tx.send((ok, err));
                        }
                    }
                } else {
                    on_event(ev);
                }
            }
        });

        self.server.set_handler(&codex_id, handler).await;

        let mut turn_params = json!({
            "threadId": codex_id,
            "input": build_input(&req.prompt),
        });
        if req.permission_mode.as_deref() == Some("plan") {
            if let Some(plan_mode) = resolve_plan_mode(&self.server).await {
                turn_params
                    .as_object_mut()
                    .unwrap()
                    .insert("collaborationMode".into(), plan_mode);
            }
        }
        if let Err(e) = self.server.request("turn/start", turn_params).await {
            self.server.clear_handler(&codex_id).await;
            if let Ok(mut a) = self.active.lock() {
                a.remove(&req.thread_id);
            }
            (req.on_event)(json!({"kind":"error","message": e}));
            return SendResult {
                session_id: Some(codex_id),
                ok: false,
                error: Some(e),
            };
        }

        // Cancel watcher
        let cancel_server = Arc::clone(&self.server);
        let cancel_active = Arc::clone(&self.active);
        let cancel_tid = req.thread_id.clone();
        let is_cancelled = Arc::clone(&req.is_cancelled);
        tokio::spawn(async move {
            loop {
                if is_cancelled() {
                    let snap = cancel_active.lock().ok().and_then(|g| g.get(&cancel_tid).cloned());
                    if let Some(t) = snap {
                        if let Some(turn_id) = t.turn_id {
                            let _ = cancel_server
                                .request(
                                    "turn/interrupt",
                                    json!({"threadId": t.codex_id, "turnId": turn_id}),
                                )
                                .await;
                        }
                    }
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            }
        });

        let result = match tokio::time::timeout(std::time::Duration::from_secs(600), done_rx).await
        {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => (false, Some("rpc cancelled".into())),
            Err(_) => {
                (req.on_event)(json!({"kind":"error","message":"timeout Codex (600s)"}));
                (false, Some("timeout".into()))
            }
        };

        self.server.clear_handler(&codex_id).await;
        if let Ok(mut a) = self.active.lock() {
            a.remove(&req.thread_id);
        }

        if !finished.load(Ordering::SeqCst) {
            // ensure a terminal event reached the harness
            if result.0 {
                (req.on_event)(json!({"kind":"done","ok": true, "result": ""}));
            } else if result.1.as_deref() != Some("timeout") {
                // error already emitted or interrupted
                if !finished.load(Ordering::SeqCst) {
                    (req.on_event)(json!({
                        "kind": "error",
                        "message": result.1.clone().unwrap_or_else(|| "session terminée".into())
                    }));
                }
            }
        }

        SendResult {
            session_id: Some(codex_id),
            ok: result.0,
            error: result.1,
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        let snap = self
            .active
            .lock()
            .ok()
            .and_then(|g| g.get(thread_id).cloned());
        let Some(t) = snap else {
            return false;
        };
        let Some(turn_id) = t.turn_id else {
            return false;
        };
        self.server
            .request(
                "turn/interrupt",
                json!({"threadId": t.codex_id, "turnId": turn_id}),
            )
            .await
            .is_ok()
    }

    async fn native_command(&self, name: &str, params: Value) -> Result<Value, String> {
        let session_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{name}: session Codex absente"))?;
        let cwd = params.get("projectRoot").and_then(Value::as_str).unwrap_or("");
        let sandbox = if name == "review" { "read-only" } else { "danger-full-access" };
        let codex_id = open_thread(
            &self.server,
            Some(session_id),
            json!({
                "cwd": if cwd.is_empty() { Value::Null } else { json!(cwd) },
                "sandbox": sandbox,
                "approvalPolicy": "never",
            }),
        )
        .await?;
        match name {
            "compact" => self
                .server
                .request("thread/compact/start", json!({"threadId": codex_id}))
                .await,
            "goalSet" => self
                .server
                .request(
                    "thread/goal/set",
                    json!({
                        "threadId": codex_id,
                        "objective": params.get("objective").cloned().unwrap_or(Value::Null),
                        "status": params.get("status").cloned().unwrap_or(json!("active")),
                        "tokenBudget": params.get("tokenBudget").cloned().unwrap_or(Value::Null),
                    }),
                )
                .await,
            "goalGet" => self
                .server
                .request("thread/goal/get", json!({"threadId": codex_id}))
                .await,
            "goalClear" => self
                .server
                .request("thread/goal/clear", json!({"threadId": codex_id}))
                .await,
            "review" => self.run_native_review(&codex_id).await,
            _ => Err(format!("commande Codex inconnue: {name}")),
        }
    }
}

#[cfg(test)]
mod command_tests {
    use super::*;

    #[test]
    fn permission_modes_map_to_real_codex_policies() {
        assert_eq!(codex_safety(Some("bypassPermissions")), ("danger-full-access", "never"));
        assert_eq!(codex_safety(Some("acceptEdits")), ("workspace-write", "on-request"));
        assert_eq!(codex_safety(Some("default")), ("workspace-write", "untrusted"));
        assert_eq!(codex_safety(Some("plan")), ("read-only", "never"));
        assert_eq!(codex_safety(None), ("read-only", "on-request"));
    }
}
