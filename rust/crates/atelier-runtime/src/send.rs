//! Send / interrupt orchestration (plan 033 Porte 5).

use crate::state::AppState;
use atelier_harness::EmitFn;
use atelier_providers::{provider_status_list, SendMode, SendRequest};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn normalize_display_event(msg: &Value) -> Value {
    if let Some(d) = msg.get("displayEvent") {
        if d.get("kind").and_then(|v| v.as_str()) == Some("user")
            && d.get("text").and_then(|v| v.as_str()).is_some()
        {
            return d.clone();
        }
    }
    json!({
        "kind": "user",
        "text": msg.get("prompt").and_then(|v| v.as_str()).unwrap_or(""),
        "ts": now_ms(),
    })
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn make_emit(state: AppState, thread_id: String) -> EmitFn {
    Arc::new(move |event: Value| {
        let payload = json!({
            "type": "event",
            "threadId": thread_id,
            "event": event,
        });
        if let Ok(s) = serde_json::to_string(&payload) {
            state.publish(s);
        }
    })
}

/// Handle `send` WS message. Returns immediate replies; streaming events go via bus.
pub async fn handle_send(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg
        .get("threadId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let provider = msg
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("fake")
        .to_string();
    let prompt = msg
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let project_root = msg
        .get("projectRoot")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let title = msg.get("title").and_then(|v| v.as_str()).map(str::to_string);

    if thread_id.is_empty() {
        return vec![err_json("threadId requis")];
    }

    let Some(provider_impl) = state.provider(&provider) else {
        // Helpful message: real providers not yet ported
        return vec![err_json(format!(
            "provider inconnu ou non branché en Rust: {provider} (porte 5: 'fake' disponible avec ATELIER_ENABLE_FAKE=1; Claude/Codex Portes 6–7)"
        ))];
    };

    // Provider change while running: refuse
    if state.harness().is_running(&thread_id).await {
        if let Some(running_p) = state.harness().run_provider(&thread_id).await {
            if running_p != provider {
                return vec![err_json(format!(
                    "changement de provider ({running_p} → {provider}) impossible pendant un run"
                ))];
            }
        }
    }

    // Upsert thread
    {
        let mut store = state.threads().lock().await;
        let prev = store.get(&thread_id).cloned();
        let mut patch = json!({
            "id": thread_id,
            "projectRoot": project_root,
            "provider": provider,
            "status": "running",
        });
        if let Some(t) = title.or_else(|| {
            prev.as_ref()
                .map(|p| p.title.clone())
                .filter(|s| !s.is_empty())
        }) {
            patch
                .as_object_mut()
                .unwrap()
                .insert("title".into(), json!(t));
        } else {
            let t: String = prompt.chars().take(40).collect();
            patch
                .as_object_mut()
                .unwrap()
                .insert("title".into(), json!(t));
        }
        // session clear on provider switch
        if let Some(prev) = &prev {
            if prev.provider != provider && prev.session_id.is_some() {
                patch
                    .as_object_mut()
                    .unwrap()
                    .insert("sessionId".into(), Value::Null);
            }
        }
        let _ = store.upsert(patch, false);
    }

    let emit = make_emit(state.clone(), thread_id.clone());
    let h = state
        .harness()
        .harness_for(&thread_id, &provider, emit)
        .await;

    let mode = msg.get("mode").and_then(|v| v.as_str()).unwrap_or("");
    let running = state.harness().is_running(&thread_id).await;
    let user_event = normalize_display_event(msg);
    let client_mid = msg
        .get("clientMessageId")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    // Channel for provider → harness (async-safe; avoids try_lock races).
    let (ev_tx, mut ev_rx) = tokio::sync::mpsc::unbounded_channel::<Value>();

    // Steer on active run
    if running && mode != "queue" {
        let turn_id = {
            let mut guard = h.lock().await;
            guard.steer(client_mid.as_deref(), Some(user_event.clone()))
        };
        if let Some(turn_id) = turn_id {
            let cancelled = Arc::new(AtomicBool::new(false));
            let cancelled_probe = Arc::clone(&cancelled);
            let pimpl = Arc::clone(&provider_impl);
            let session_id = state
                .threads()
                .lock()
                .await
                .get(&thread_id)
                .and_then(|t| t.session_id.clone());
            let tx = ev_tx.clone();
            let req = SendRequest {
                thread_id: thread_id.clone(),
                turn_id: turn_id.clone(),
                prompt: prompt.clone(),
                project_root: project_root.clone(),
                session_id,
                model: msg
                    .get("model")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                effort: msg
                    .get("effort")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                mode: SendMode::Steer,
                on_event: Arc::new(move |ev| {
                    let _ = tx.send(ev);
                }),
                is_cancelled: Arc::new(move || cancelled_probe.load(Ordering::SeqCst)),
            };
            // Pump events into harness
            let h_pump = Arc::clone(&h);
            let turn_pump = turn_id.clone();
            tokio::spawn(async move {
                while let Some(ev) = ev_rx.recv().await {
                    let mut g = h_pump.lock().await;
                    let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                    if kind == "done" || kind == "error" {
                        g.terminal(&turn_pump, ev);
                    } else {
                        g.emit(&turn_pump, ev, None);
                    }
                }
            });
            let state_c = state.clone();
            let tid_c = thread_id.clone();
            tokio::spawn(async move {
                // wire cancel flag from harness manager
                loop {
                    if state_c.harness().is_cancelled(&tid_c).await {
                        cancelled.store(true, Ordering::SeqCst);
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                    if !state_c.harness().is_running(&tid_c).await {
                        break;
                    }
                }
            });
            tokio::spawn(async move {
                let _ = pimpl.send(req).await;
            });
            return threads_reply(state).await;
        }
    }

    // Start new turn
    let turn_id = {
        let mut guard = h.lock().await;
        guard.start_turn(None, client_mid.as_deref(), Some(user_event))
    };
    state
        .harness()
        .set_running(&thread_id, &turn_id, &provider)
        .await;

    let cancelled = Arc::new(AtomicBool::new(false));
    let cancelled_probe = Arc::clone(&cancelled);
    let state2 = state.clone();
    let tid = thread_id.clone();
    let h2 = Arc::clone(&h);
    let pimpl = Arc::clone(&provider_impl);
    let session_id = state
        .threads()
        .lock()
        .await
        .get(&thread_id)
        .and_then(|t| t.session_id.clone());
    let model = msg
        .get("model")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let effort = msg
        .get("effort")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    // Event pump
    let h_pump = Arc::clone(&h2);
    let turn_pump = turn_id.clone();
    tokio::spawn(async move {
        while let Some(ev) = ev_rx.recv().await {
            let mut g = h_pump.lock().await;
            let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            if kind == "done" || kind == "error" {
                g.terminal(&turn_pump, ev);
            } else {
                g.emit(&turn_pump, ev, None);
            }
        }
    });

    // Cancel watcher
    let state_w = state.clone();
    let tid_w = thread_id.clone();
    let cancelled_w = Arc::clone(&cancelled);
    tokio::spawn(async move {
        loop {
            if state_w.harness().is_cancelled(&tid_w).await {
                cancelled_w.store(true, Ordering::SeqCst);
                break;
            }
            if !state_w.harness().is_running(&tid_w).await {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    });

    tokio::spawn(async move {
        let req = SendRequest {
            thread_id: tid.clone(),
            turn_id: turn_id.clone(),
            prompt,
            project_root,
            session_id,
            model,
            effort,
            mode: SendMode::Normal,
            on_event: Arc::new(move |ev| {
                let _ = ev_tx.send(ev);
            }),
            is_cancelled: Arc::new(move || cancelled_probe.load(Ordering::SeqCst)),
        };
        let result = pimpl.send(req).await;
        // drop sender by ending — force terminal if needed
        {
            let mut g = h2.lock().await;
            if g.turn_status(&turn_id) != Some(atelier_harness::TurnStatus::Done) {
                if result.ok {
                    g.terminal(&turn_id, json!({"kind":"done"}));
                } else {
                    g.terminal(
                        &turn_id,
                        json!({
                            "kind": "error",
                            "message": result.error.unwrap_or_else(|| "failed".into())
                        }),
                    );
                }
            }
        }
        if let Some(sid) = result.session_id {
            let mut store = state2.threads().lock().await;
            let _ = store.upsert(
                json!({"id": tid, "sessionId": sid, "status": "idle"}),
                false,
            );
        } else {
            let mut store = state2.threads().lock().await;
            let _ = store.upsert(json!({"id": tid, "status": "idle"}), false);
        }
        state2.harness().clear_running(&tid).await;
        let list = state2.threads().lock().await.list();
        if let Ok(s) = serde_json::to_string(&json!({"type":"threads","threads": list})) {
            state2.publish(s);
        }
    });

    threads_reply(state).await
}

pub async fn handle_interrupt(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
    if thread_id.is_empty() {
        return vec![err_json("threadId requis")];
    }
    state.harness().request_cancel(thread_id).await;
    if let Some(t) = state.threads().lock().await.get(thread_id) {
        if let Some(p) = state.provider(&t.provider) {
            let _ = p.interrupt(thread_id).await;
        }
    }
    vec![]
}

pub async fn handle_provider_status(_state: &AppState) -> Vec<String> {
    // Always include fake when env set; catalog from protocol
    let mut list = provider_status_list();
    // Force fake ok when in registry
    if std::env::var("ATELIER_ENABLE_FAKE").is_ok() {
        // already in list from registry
    } else {
        // inject fake only for internal tests via direct registry — keep catalog
        // as builtin providers for UI parity
        let _ = &mut list;
    }
    vec![serde_json::to_string(&json!({"type":"providerStatus","providers": list}))
        .unwrap_or_else(|_| r#"{"type":"error","message":"serialize"}"#.into())]
}

pub async fn handle_status(state: &AppState) -> Vec<String> {
    let port = state.port().await;
    let paste_dir = state.app_dir().join("pasted");
    let pasted_count = std::fs::read_dir(&paste_dir)
        .map(|rd| rd.count())
        .unwrap_or(0);
    vec![serde_json::to_string(&json!({
        "type": "status",
        "port": port,
        "pastedCount": pasted_count,
        "pasteDir": paste_dir,
    }))
    .unwrap_or_else(|_| r#"{"type":"error","message":"serialize"}"#.into())]
}

async fn threads_reply(state: &AppState) -> Vec<String> {
    let list = state.threads().lock().await.list();
    // Direct reply only — bus would double-deliver to the requesting socket.
    let out = serde_json::to_string(&json!({"type":"threads","threads": list}))
        .unwrap_or_else(|_| r#"{"type":"error","message":"serialize"}"#.into());
    vec![out]
}

fn err_json(message: impl Into<String>) -> String {
    serde_json::to_string(&json!({"type":"error","message": message.into()}))
        .unwrap_or_else(|_| r#"{"type":"error","message":"error"}"#.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use tempfile::tempdir;

    #[tokio::test]
    async fn send_fake_completes_and_journals() {
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        );
        let msg = json!({
            "type": "send",
            "threadId": "t-send",
            "provider": "fake",
            "prompt": "hello",
            "projectRoot": dir.path().to_string_lossy(),
        });
        let out = handle_send(&state, &msg).await;
        assert!(out[0].contains("threads"));
        // wait for fake turn
        for _ in 0..50 {
            if !state.harness().is_running("t-send").await {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        assert!(!state.harness().is_running("t-send").await);
        let events = state.harness().journal().materialize("t-send");
        assert!(
            events.iter().any(|e| e["kind"] == "user"),
            "user event missing: {events:?}"
        );
        assert!(
            events.iter().any(|e| e["kind"] == "text" || e["kind"] == "done"),
            "text/done missing: {events:?}"
        );
    }
}
