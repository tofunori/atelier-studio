//! Send / interrupt orchestration (plan 033 Porte 5).

use crate::state::AppState;
use atelier_harness::EmitFn;
use atelier_providers::{provider_status_list, SendMode, SendRequest};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn with_gallery_tool_instruction(prompt: String, project_root: &str, server_dir: &str) -> String {
    if project_root.is_empty() || server_dir.is_empty() {
        return prompt;
    }
    let tool = std::path::Path::new(server_dir).join("atelier-gallery-tool");
    format!(
        "{prompt}\n\n<atelier-gallery-integration>\nWhen the user explicitly asks to show or display figures or files in the Atelier Gallery, you MUST, after resolving their exact paths, call the terminal tool exactly once with:\n{} show --project-root {} -- <project-relative-file> [more-files...]\nDo not merely list the paths. Use only files inside the active project. Do not call this command when files are only discussed, compared, edited, or summarized.\n</atelier-gallery-integration>",
        serde_json::to_string(&tool.to_string_lossy()).unwrap_or_default(),
        serde_json::to_string(project_root).unwrap_or_default(),
    )
}

fn with_zotero_passage_instruction(prompt: String, server_dir: &str) -> String {
    if server_dir.is_empty() {
        return prompt;
    }
    let tool = std::path::Path::new(server_dir).join("atelier-zotero-passages");
    format!(
        "{prompt}\n\n<atelier-zotero-passages>\nWhen the user asks for important or relevant passages from an attached Zotero article, use the exact PDF metadata inside <zotero-reference> and call the terminal tool exactly once:\n{} search --pdf <absolute-pdf-path> --zotero-key <zotero-key> --pdf-key <pdf-key> --pdf-file <pdf-file> --query <user-question> --limit 5\nRead its JSON stdout. For every passage you cite, reproduce its markdownLink exactly so the user can open the PDF at that page with automatic highlighting. The displayed verbatim excerpt immediately associated with that link MUST be exactly the result's quote field: do not shorten, translate, normalize, or replace it with another sentence from context. You may explain it separately. Never invent a passage or link. If the article has no attached local PDF metadata, ask the user to attach it from Zotero. Do not call this tool for ordinary bibliography or metadata questions.\n</atelier-zotero-passages>",
        serde_json::to_string(&tool.to_string_lossy()).unwrap_or_default(),
    )
}

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

fn first_message_for_title(msg: &Value, provider_prompt: &str) -> String {
    msg.pointer("/displayEvent/text")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or(provider_prompt.trim())
        .to_string()
}

fn is_new_chat_placeholder(title: &str) -> bool {
    matches!(
        title.trim().to_lowercase().as_str(),
        "" | "sans titre" | "nouveau chat" | "new chat"
    )
}

fn should_auto_title(previous: Option<&atelier_store::Thread>, explicit_title: Option<&str>) -> bool {
    if explicit_title.is_some() {
        return false;
    }
    match previous {
        None => true,
        Some(thread) => thread.session_id.is_none() && is_new_chat_placeholder(&thread.title),
    }
}

async fn maybe_title_new_thread(
    state: &AppState,
    thread_id: &str,
    provisional_title: &str,
    first_message: &str,
) {
    let unchanged = state
        .threads()
        .lock()
        .await
        .get(thread_id)
        .is_some_and(|thread| thread.title == provisional_title);
    if !unchanged {
        return;
    }
    let Some(title_provider) = state.provider("claude") else {
        return;
    };
    let Some(title) = title_provider.title_conversation(first_message).await else {
        return;
    };
    let list = {
        let mut store = state.threads().lock().await;
        let still_unchanged = store
            .get(thread_id)
            .is_some_and(|thread| thread.title == provisional_title);
        if !still_unchanged {
            return;
        }
        if store
            .upsert(json!({"id": thread_id, "title": title}), true)
            .is_err()
        {
            return;
        }
        store.list()
    };
    if let Ok(message) = serde_json::to_string(&json!({"type":"threads","threads": list})) {
        state.publish(message);
    }
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
    let inputs = msg.get("inputs").and_then(Value::as_array).cloned();
    let project_root = msg
        .get("projectRoot")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let title = msg.get("title").and_then(|v| v.as_str()).map(str::to_string);
    let first_message = first_message_for_title(msg, &prompt);

    if thread_id.is_empty() {
        return vec![err_json("threadId requis")];
    }

    let previous = state.threads().lock().await.get(&thread_id).cloned();
    let auto_title = should_auto_title(previous.as_ref(), title.as_deref());
    let provisional_title = first_message.chars().take(40).collect::<String>();

    // A conversation belongs to the provider selected when it was created.
    // Reject stale clients as well as deliberate cross-provider handoffs.
    if let Some(previous) = previous.as_ref() {
        if previous.provider != provider {
            return vec![err_json(format!(
                "ce chat appartient à {}; créez un nouveau chat pour utiliser {provider}",
                previous.provider
            ))];
        }
    }

    let provider_prompt = previous
        .as_ref()
        .and_then(|thread| thread.extra.get("forkContext"))
        .and_then(Value::as_str)
        .filter(|context| !context.is_empty())
        .map(|context| format!("{context}{prompt}"))
        .unwrap_or_else(|| prompt.clone());
    let provider_prompt = with_gallery_tool_instruction(provider_prompt, &project_root, state.server_dir());
    let provider_prompt = with_zotero_passage_instruction(provider_prompt, state.server_dir());

    let Some(provider_impl) = state.provider(&provider) else {
        return vec![err_json(format!(
            "provider inconnu ou non branché en Rust: {provider} (fake toujours; claude/codex/grok/opencode si binaires; API via api_providers.json)"
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
            patch
                .as_object_mut()
                .unwrap()
                .insert("title".into(), json!(provisional_title));
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
                inputs: inputs.clone(),
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
                permission_mode: msg
                    .get("permissionMode")
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
    let permission_mode = msg
        .get("permissionMode")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    // Event pump
    let h_pump = Arc::clone(&h2);
    let turn_pump = turn_id.clone();
    let project_root_events = project_root.clone();
    tokio::spawn(async move {
        while let Some(ev) = ev_rx.recv().await {
            let ev = normalize_provider_event(ev, &project_root_events);
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
            prompt: provider_prompt,
            inputs,
            project_root,
            session_id,
            model,
            effort,
            permission_mode,
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
        let succeeded = result.ok;
        if let Some(sid) = result.session_id {
            let mut store = state2.threads().lock().await;
            let mut patch = json!({"id": tid, "sessionId": sid, "status": "idle"});
            if succeeded {
                patch["forkContext"] = Value::Null;
                patch["forkPending"] = Value::Bool(false);
            }
            let _ = store.upsert(patch, false);
        } else {
            let mut store = state2.threads().lock().await;
            let mut patch = json!({"id": tid, "status": "idle"});
            if succeeded {
                patch["forkContext"] = Value::Null;
                patch["forkPending"] = Value::Bool(false);
            }
            let _ = store.upsert(patch, false);
        }
        state2.harness().clear_running(&tid).await;
        let list = state2.threads().lock().await.list();
        if let Ok(s) = serde_json::to_string(&json!({"type":"threads","threads": list})) {
            state2.publish(s);
        }
        if succeeded && auto_title {
            let title_state = state2.clone();
            let title_thread_id = tid.clone();
            tokio::spawn(async move {
                maybe_title_new_thread(
                    &title_state,
                    &title_thread_id,
                    &provisional_title,
                    &first_message,
                )
                .await;
            });
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

fn normalize_provider_event(mut event: Value, project_root: &str) -> Value {
    if event.get("kind").and_then(Value::as_str) != Some("edit") {
        return event;
    }
    let root_prefix = if project_root.is_empty() {
        None
    } else {
        Some(format!("{}/", project_root.trim_end_matches('/')))
    };
    let files = event
        .get("files")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|file| {
            let path = match file {
                Value::String(path) => path.clone(),
                Value::Object(obj) => obj.get("path")?.as_str()?.to_string(),
                _ => return None,
            };
            let path = root_prefix
                .as_deref()
                .and_then(|prefix| path.strip_prefix(prefix))
                .unwrap_or(&path)
                .to_string();
            let add = file.get("add").and_then(Value::as_i64);
            let del = file.get("del").and_then(Value::as_i64);
            Some(json!({"path": path, "add": add, "del": del}))
        })
        .collect::<Vec<_>>();
    if let Some(obj) = event.as_object_mut() {
        obj.insert("files".into(), Value::Array(files));
        obj.insert(
            "projectRoot".into(),
            if project_root.is_empty() {
                Value::Null
            } else {
                Value::String(project_root.to_string())
            },
        );
    }
    event
}

pub async fn handle_provider_status(state: &AppState) -> Vec<String> {
    let mut list = provider_status_list(Some(state.app_dir()));
    // Le catalogue décrit les capacités statiques avec `ok=false` par défaut.
    // Le message WebSocket doit refléter le registre réellement construit au
    // démarrage, sinon React affiche « CLI introuvable » même quand le binaire
    // a été résolu et que le provider est prêt.
    for provider in &mut list {
        let installed = state.provider(&provider.id).is_some();
        provider.ok = installed;
        if installed && provider.version.is_none() {
            provider.version = Some("ok".into());
        }
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

    #[tokio::test]
    async fn rejects_provider_change_for_an_existing_chat() {
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        );
        state
            .threads()
            .lock()
            .await
            .upsert(json!({"id":"t-locked","provider":"claude"}), false)
            .unwrap();

        let out = handle_send(
            &state,
            &json!({
                "type":"send",
                "threadId":"t-locked",
                "provider":"fake",
                "prompt":"handoff",
                "projectRoot":dir.path().to_string_lossy(),
            }),
        )
        .await;

        assert!(out[0].contains("appartient à claude"), "{out:?}");
        assert!(!state.harness().is_running("t-locked").await);
        assert_eq!(
            state
                .threads()
                .lock()
                .await
                .get("t-locked")
                .unwrap()
                .provider,
            "claude"
        );
    }

    #[tokio::test]
    async fn provider_status_reflects_live_registry() {
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        );
        let out = handle_provider_status(&state).await;
        let msg: Value = serde_json::from_str(&out[0]).unwrap();
        for provider in msg["providers"].as_array().unwrap() {
            let id = provider["id"].as_str().unwrap();
            assert_eq!(
                provider["ok"].as_bool(),
                Some(state.provider(id).is_some()),
                "providerStatus doit refléter le registre pour {id}",
            );
        }
    }

    #[test]
    fn edit_events_are_normalized_before_journaling() {
        let event = normalize_provider_event(
            json!({"kind":"edit","files":["/repo/src/App.tsx", {"path":"src/lib/ws.ts","add":2}]}),
            "/repo",
        );
        assert_eq!(
            event["files"],
            json!([
                {"path":"src/App.tsx","add":null,"del":null},
                {"path":"src/lib/ws.ts","add":2,"del":null}
            ])
        );
        assert_eq!(event["projectRoot"], "/repo");
    }

    #[test]
    fn gallery_tool_instruction_is_explicit_and_keeps_the_user_prompt() {
        let enriched = with_gallery_tool_instruction(
            "montre-moi ces figures".into(),
            "/projet",
            "/app/Resources/rust-server",
        );
        assert!(enriched.starts_with("montre-moi ces figures"));
        assert!(enriched.contains("/app/Resources/rust-server/atelier-gallery-tool"));
        assert!(enriched.contains("show --project-root \"/projet\""));
        assert!(enriched.contains("Do not merely list the paths"));
    }

    #[test]
    fn zotero_passage_instruction_points_to_the_bundled_tool() {
        let enriched = with_zotero_passage_instruction(
            "montre les passages importants".into(),
            "/app/Resources/rust-server",
        );
        assert!(enriched.starts_with("montre les passages importants"));
        assert!(enriched.contains("/app/Resources/rust-server/atelier-zotero-passages"));
        assert!(enriched.contains("reproduce its markdownLink exactly"));
    }

    #[test]
    fn titles_use_the_visible_message_not_injected_context() {
        let msg = json!({
            "prompt": "/Users/tofunori/Documents/projet/figure.png\n\nAnalyse cette figure",
            "displayEvent": {"kind":"user", "text":"Analyse cette figure"}
        });
        assert_eq!(
            first_message_for_title(&msg, msg["prompt"].as_str().unwrap()),
            "Analyse cette figure"
        );
    }

    #[test]
    fn automatic_title_never_overwrites_an_explicit_or_existing_title() {
        let dir = tempfile::tempdir().unwrap();
        let mut existing = atelier_store::ThreadStore::open(dir.path().join("threads.json"));
        existing
            .upsert(json!({"id":"t", "title":"Titre manuel", "provider":"codex"}), false)
            .unwrap();
        let thread = existing.get("t").unwrap();
        assert!(!should_auto_title(Some(thread), None));
        assert!(!should_auto_title(None, Some("Titre explicite")));
        assert!(should_auto_title(None, None));
    }
}
