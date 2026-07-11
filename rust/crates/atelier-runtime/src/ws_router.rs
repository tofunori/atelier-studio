//! WebSocket message routing for Porte 3 persistence surface.

use crate::state::AppState;
use atelier_protocol::{ErrorMessage, PongMessage};
use atelier_store::{get_ledger, read_settings, write_settings};
use serde_json::{json, Value};

/// Route one client JSON text frame.
///
/// Returns messages for the **requesting** client only.
/// When all connected clients must see an update, the message is also
/// `state.publish`ed (subscribers receive it; the requester gets it via the
/// returned list only — handle_socket must not also echo bus to self for the
/// same payload). Currently handle_socket sends returns only and uses bus for
/// *other* sockets: we publish for multi-client and also return so the
/// requester always gets a reply even without bus subscription.
pub async fn route_ws(state: &AppState, text: &str) -> Vec<String> {
    let msg: Value = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(_) => return vec![err("JSON invalide")],
    };
    let msg_type = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match msg_type {
        "ping" => vec![ok(PongMessage::new())],
        "listThreads" => {
            let list = state.threads().lock().await.list();
            vec![json_msg(json!({"type":"threads","threads": list}))]
        }
        "renameThread" => {
            let id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let title = msg.get("title").cloned().unwrap_or(Value::Null);
            {
                let mut store = state.threads().lock().await;
                if store.get(id).is_some() {
                    let _ = store.upsert(json!({"id": id, "title": title}), false);
                }
            }
            broadcast_threads(state).await
        }
        "moveThread" => {
            let id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let target = msg.get("projectRoot").and_then(|v| v.as_str());
            {
                let mut store = state.threads().lock().await;
                let Some(t) = store.get(id).cloned() else {
                    return vec![err_thread(id, "thread introuvable")];
                };
                if t.status == "running" {
                    return vec![err_thread(
                        id,
                        "chat en cours d'exécution — attendre la fin du tour",
                    )];
                }
                let Some(target) = target.filter(|s| s.starts_with('/')) else {
                    return vec![err_thread(id, "projet cible invalide")];
                };
                if target == t.project_root {
                    return vec![];
                }
                let _ = store.upsert(json!({"id": id, "projectRoot": target}), false);
            }
            broadcast_threads(state).await
        }
        "deleteThread" => {
            let id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let _ = state.threads().lock().await.delete(id);
            let _ = state.journal().delete_thread(id);
            broadcast_threads(state).await
        }
        "getHistory" => {
            let id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            if state.journal().has_journal(id) {
                let events = state.journal().materialize(id);
                return vec![json_msg(json!({
                    "type": "history",
                    "threadId": id,
                    "events": events,
                }))];
            }
            vec![json_msg(json!({
                "type": "history",
                "threadId": id,
                "events": [],
            }))]
        }
        "listHighlights" => {
            let list = state.highlights().lock().await.list();
            vec![json_msg(json!({"type":"highlights","highlights": list}))]
        }
        "addHighlight" => {
            let entry = msg.get("highlight").cloned().unwrap_or(json!({}));
            // Drop the mutex before broadcast_highlights (tokio Mutex is not reentrant).
            let result = {
                let mut store = state.highlights().lock().await;
                store.add(entry)
            };
            match result {
                Ok(_) => broadcast_highlights(state).await,
                Err(e) => vec![err(format!("surlignage: {e}"))],
            }
        }
        "removeHighlight" => {
            let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let _ = state.highlights().lock().await.remove(id);
            broadcast_highlights(state).await
        }
        "getSettings" => {
            let settings = read_settings(&state.settings_path());
            vec![json_msg(json!({"type":"settingsFile","settings": settings}))]
        }
        "saveSettings" => {
            let settings = msg.get("settings").cloned().unwrap_or(Value::Null);
            let ok_flag = write_settings(&state.settings_path(), &settings);
            vec![json_msg(json!({"type":"settingsSaved","ok": ok_flag}))]
        }
        "getLedger" => {
            let root = msg
                .get("projectRoot")
                .or_else(|| msg.get("root"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let limit = msg.get("limit").and_then(|v| v.as_u64()).unwrap_or(200) as usize;
            let entries = get_ledger(&state.ledger_dir(), root, limit);
            vec![json_msg(json!({
                "type": "ledger",
                "projectRoot": root,
                "entries": entries,
            }))]
        }
        "upsertThread" => {
            let patch = msg.get("thread").cloned().unwrap_or(msg.clone());
            let result = {
                let mut store = state.threads().lock().await;
                store.upsert(patch, false)
            };
            match result {
                Ok(_) => broadcast_threads(state).await,
                Err(e) => vec![err(e)],
            }
        }
        other => vec![err(format!("type inconnu: {other}"))],
    }
}

async fn broadcast_threads(state: &AppState) -> Vec<String> {
    let list = state.threads().lock().await.list();
    let out = json_msg(json!({"type":"threads","threads": list}));
    state.publish(out.clone());
    vec![out]
}

async fn broadcast_highlights(state: &AppState) -> Vec<String> {
    let list = state.highlights().lock().await.list();
    let out = json_msg(json!({"type":"highlights","highlights": list}));
    state.publish(out.clone());
    vec![out]
}

fn ok<T: serde::Serialize>(v: T) -> String {
    serde_json::to_string(&v).unwrap_or_else(|_| r#"{"type":"error","message":"serialize"}"#.into())
}

fn json_msg(v: Value) -> String {
    serde_json::to_string(&v).unwrap_or_else(|_| r#"{"type":"error","message":"serialize"}"#.into())
}

fn err(message: impl Into<String>) -> String {
    ok(ErrorMessage::new(message))
}

fn err_thread(thread_id: &str, message: impl Into<String>) -> String {
    json_msg(json!({
        "type": "error",
        "threadId": thread_id,
        "message": message.into(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use tempfile::tempdir;

    fn state(dir: &std::path::Path) -> AppState {
        AppState::new(
            AppPaths::from_app_dir(dir.to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        )
    }

    #[tokio::test]
    async fn list_threads_empty() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let out = route_ws(&s, r#"{"type":"listThreads"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "threads");
        assert!(v["threads"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn upsert_rename_delete() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let out = route_ws(
            &s,
            r#"{"type":"upsertThread","thread":{"id":"t1","title":"A","provider":"codex"}}"#,
        )
        .await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["threads"][0]["title"], "A");

        let out = route_ws(
            &s,
            r#"{"type":"renameThread","threadId":"t1","title":"B"}"#,
        )
        .await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["threads"][0]["title"], "B");

        let out = route_ws(&s, r#"{"type":"deleteThread","threadId":"t1"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert!(v["threads"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn highlights_and_settings() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let out = route_ws(
            &s,
            r#"{"type":"addHighlight","highlight":{"text":"hi","kind":"hl"}}"#,
        )
        .await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "highlights");
        assert_eq!(v["highlights"].as_array().unwrap().len(), 1);

        let out = route_ws(
            &s,
            r#"{"type":"saveSettings","settings":{"theme":"dark"}}"#,
        )
        .await;
        assert!(out[0].contains(r#""ok":true"#) || out[0].contains(r#""ok": true"#));
        let out = route_ws(&s, r#"{"type":"getSettings"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["settings"]["theme"], "dark");
    }

    #[tokio::test]
    async fn history_from_journal() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        s.journal().append(&json!({
            "kind": "user",
            "text": "hello",
            "meta": {
                "eventId": "e1",
                "sequence": 1,
                "threadId": "t1",
                "turnId": "u1",
                "durable": true,
                "provider": "codex"
            }
        }));
        let out = route_ws(&s, r#"{"type":"getHistory","threadId":"t1"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "history");
        assert_eq!(v["events"].as_array().unwrap().len(), 1);
    }
}
