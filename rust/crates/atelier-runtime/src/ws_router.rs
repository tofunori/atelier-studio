//! WebSocket message routing (Porte 3 persistence + Porte 4 workspace).

use crate::state::AppState;
use atelier_protocol::{ErrorMessage, PongMessage};
use atelier_store::{get_ledger, read_settings, write_settings};
use atelier_workspace::{
    check_frame, clear_pasted, commit as git_commit, diff as git_diff, ignore_pattern,
    list_commands, list_files, list_pasted, pull as git_pull, push as git_push, restore as git_restore,
    revert_file, save_image, scan_local, stage_file, status as git_status, unstage_file,
    zotero_available, zotero_collections, zotero_load_favs, zotero_search, zotero_toggle_fav,
    pdf_absolute_path, TermEvent,
};
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
    let mut out = match msg_type {
        "ping" => vec![ok(PongMessage::new())],
        "send" => crate::send::handle_send(state, &msg).await,
        "interrupt" => crate::send::handle_interrupt(state, &msg).await,
        "providerStatus" => crate::send::handle_provider_status(state).await,
        "status" => crate::send::handle_status(state).await,
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

        // --- Porte 4: files / pasted / scan / git / zotero / terminal ---
        "listFiles" => {
            let root = msg
                .get("projectRoot")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let files = list_files(root);
            vec![json_msg(json!({"type":"files","projectRoot": root, "files": files}))]
        }
        "listCommands" => {
            let root = msg.get("projectRoot").and_then(|v| v.as_str());
            let commands = list_commands(root);
            vec![json_msg(json!({"type":"commands","commands": commands}))]
        }
        "listPasted" => {
            let files = list_pasted(state.app_dir());
            vec![json_msg(json!({"type":"pastedList","files": files}))]
        }
        "clearPasted" => {
            let removed = clear_pasted(state.app_dir());
            vec![json_msg(json!({"type":"pastedCleared","removed": removed}))]
        }
        "saveImage" => {
            let data_url = msg.get("dataURL").and_then(|v| v.as_str()).unwrap_or("");
            let re = data_url.strip_prefix("data:image/").and_then(|rest| {
                let (ext, b64) = rest.split_once(";base64,")?;
                Some((ext, b64))
            });
            match re {
                Some((ext, b64)) => match save_image(state.app_dir(), ext, b64) {
                    Ok(path) => {
                        vec![json_msg(json!({"type":"imageSaved","path": path}))]
                    }
                    Err(e) => vec![err(e)],
                },
                None => vec![err("dataURL d'image invalide")],
            }
        }
        "scanLocal" => {
            let servers = tokio::task::spawn_blocking(scan_local)
                .await
                .unwrap_or_default();
            vec![json_msg(json!({"type":"localServers","servers": servers}))]
        }
        "checkFrame" => {
            let url = msg.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let blocked = tokio::task::spawn_blocking(move || check_frame(&url))
                .await
                .unwrap_or(false);
            let url = msg.get("url").and_then(|v| v.as_str()).unwrap_or("");
            vec![json_msg(json!({"type":"frameChecked","url": url, "blocked": blocked}))]
        }
        "gitStatus" => {
            let root = git_root(state, &msg).await;
            match git_status(&root) {
                Ok(status) => {
                    vec![json_msg(json!({"type":"gitStatus","projectRoot": root, "status": status}))]
                }
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitDiff" => {
            let root = git_root(state, &msg).await;
            let path = msg.get("path").and_then(|v| v.as_str());
            match git_diff(&root, path) {
                Ok(diff) => vec![json_msg(json!({
                    "type": "gitDiff",
                    "projectRoot": root,
                    "path": path,
                    "diff": diff,
                }))],
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitStage" => {
            let root = git_root(state, &msg).await;
            let path = msg.get("path").and_then(|v| v.as_str()).unwrap_or("");
            match stage_file(&root, path) {
                Ok(()) => {
                    let mut out = vec![json_msg(json!({"type":"gitStageDone","projectRoot": root, "path": path}))];
                    out.extend(git_changed(state, &msg, &root).await);
                    out
                }
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitUnstage" => {
            let root = git_root(state, &msg).await;
            let path = msg.get("path").and_then(|v| v.as_str()).unwrap_or("");
            match unstage_file(&root, path) {
                Ok(()) => {
                    let mut out =
                        vec![json_msg(json!({"type":"gitUnstageDone","projectRoot": root, "path": path}))];
                    out.extend(git_changed(state, &msg, &root).await);
                    out
                }
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitRevertFile" => {
            let root = git_root(state, &msg).await;
            let path = msg.get("path").and_then(|v| v.as_str()).unwrap_or("");
            match revert_file(&root, path) {
                Ok(()) => {
                    let mut out = vec![json_msg(
                        json!({"type":"gitRevertFileDone","projectRoot": root, "path": path}),
                    )];
                    out.extend(git_changed(state, &msg, &root).await);
                    out
                }
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitCommit" => {
            let root = git_root(state, &msg).await;
            let message = msg.get("message").and_then(|v| v.as_str()).unwrap_or("");
            let files: Option<Vec<String>> = msg.get("files").and_then(|v| {
                v.as_array().map(|a| {
                    a.iter()
                        .filter_map(|x| x.as_str().map(str::to_string))
                        .collect()
                })
            });
            match git_commit(&root, message, files.as_deref()) {
                Ok(hash) => {
                    let mut out =
                        vec![json_msg(json!({"type":"gitCommitDone","projectRoot": root, "hash": hash}))];
                    out.extend(git_changed(state, &msg, &root).await);
                    out
                }
                Err(e) => vec![json_msg(json!({
                    "type": "gitCommitError",
                    "projectRoot": root,
                    "message": e.to_string(),
                }))],
            }
        }
        "gitPush" | "gitPull" => {
            let root = git_root(state, &msg).await;
            let op = if msg_type == "gitPush" { "push" } else { "pull" };
            let result = if msg_type == "gitPush" {
                git_push(&root)
            } else {
                git_pull(&root)
            };
            let mut out = match result {
                Ok(out) => vec![json_msg(json!({
                    "type": "gitSyncDone",
                    "op": op,
                    "projectRoot": root,
                    "out": out,
                }))],
                Err(e) => vec![json_msg(json!({
                    "type": "gitSyncDone",
                    "op": op,
                    "projectRoot": root,
                    "error": e.to_string(),
                }))],
            };
            out.extend(git_changed(state, &msg, &root).await);
            out
        }
        "gitIgnore" => {
            let root = git_root(state, &msg).await;
            let pattern = msg.get("pattern").and_then(|v| v.as_str()).unwrap_or("");
            match ignore_pattern(&root, pattern) {
                Ok(_) => {
                    let mut out = Vec::new();
                    out.extend(git_changed(state, &msg, &root).await);
                    out
                }
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitUndoLastTurn" => {
            let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let store = state.threads().lock().await;
            let Some(t) = store.get(thread_id).cloned() else {
                return vec![err_thread(thread_id, "snapshot introuvable")];
            };
            drop(store);
            let sha = t
                .extra
                .get("lastSnapshot")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if t.project_root.is_empty() || sha.is_empty() {
                return vec![err_thread(thread_id, "snapshot introuvable")];
            }
            match git_restore(&t.project_root, sha) {
                Ok(()) => {
                    let mut out = vec![json_msg(json!({
                        "type": "gitUndoLastTurnDone",
                        "threadId": thread_id,
                        "sha": sha,
                    }))];
                    out.push(json_msg(json!({
                        "type": "gitChanged",
                        "threadId": thread_id,
                        "projectRoot": t.project_root,
                    })));
                    out
                }
                Err(e) => vec![json_msg(json!({
                    "type": "gitUndoLastTurnError",
                    "threadId": thread_id,
                    "projectRoot": t.project_root,
                    "sha": sha,
                    "message": e.to_string(),
                }))],
            }
        }
        "zoteroSearch" => {
            if !zotero_available() {
                return vec![json_msg(json!({
                    "type": "zoteroItems",
                    "items": [],
                    "error": "zotero-introuvable",
                }))];
            }
            let query = msg.get("query").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let tag = msg.get("tag").and_then(|v| v.as_str()).map(str::to_string);
            let collection_id = msg.get("collectionId").and_then(|v| v.as_i64());
            let limit = msg.get("limit").and_then(|v| v.as_u64()).unwrap_or(400) as usize;
            let app_dir = state.app_dir().to_path_buf();
            let items = tokio::task::spawn_blocking(move || {
                zotero_search(
                    &app_dir,
                    &query,
                    collection_id,
                    tag.as_deref(),
                    limit,
                )
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
            match items {
                Ok(mut items) => {
                    let favs = zotero_load_favs(state.app_dir());
                    for it in &mut items {
                        if let Some(obj) = it.as_object_mut() {
                            if let Some(k) = obj.get("key").and_then(|v| v.as_str()) {
                                obj.insert("fav".into(), json!(favs.contains(k)));
                            }
                        }
                    }
                    vec![json_msg(json!({"type":"zoteroItems","items": items}))]
                }
                Err(e) => vec![json_msg(json!({"type":"zoteroItems","items": [], "error": e}))],
            }
        }
        "zoteroCollections" => {
            if !zotero_available() {
                return vec![json_msg(json!({
                    "type": "zoteroCollections",
                    "collections": [],
                    "error": "zotero-introuvable",
                }))];
            }
            let app_dir = state.app_dir().to_path_buf();
            match tokio::task::spawn_blocking(move || zotero_collections(&app_dir))
                .await
                .unwrap_or_else(|e| Err(e.to_string()))
            {
                Ok(c) => vec![json_msg(json!({"type":"zoteroCollections","collections": c}))],
                Err(e) => {
                    vec![json_msg(json!({"type":"zoteroCollections","collections": [], "error": e}))]
                }
            }
        }
        "zoteroFav" => {
            let key = msg.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let on = msg.get("on").and_then(|v| v.as_bool()).unwrap_or(true);
            match zotero_toggle_fav(state.app_dir(), key, on) {
                Ok(fav) => vec![json_msg(json!({"type":"zoteroFav","key": key, "fav": fav}))],
                Err(e) => vec![err(e)],
            }
        }
        "zoteroDigest" => {
            let key = msg.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let cite_key = msg
                .get("citeKey")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let slug: String = if !cite_key.is_empty() {
                cite_key.clone()
            } else {
                key.clone()
            }
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '_' || *c == '-')
            .collect();
            let path = if slug.is_empty() {
                None
            } else {
                Some(
                    state
                        .app_dir()
                        .join("paper-digests")
                        .join(format!("{slug}.md")),
                )
            };
            let digest = path.as_ref().and_then(|p| std::fs::read_to_string(p).ok());
            let pdf_key = msg.get("pdfKey").and_then(|v| v.as_str()).unwrap_or("");
            let pdf_file = msg.get("pdfFile").and_then(|v| v.as_str()).unwrap_or("");
            let pdf_path = pdf_absolute_path(pdf_key, pdf_file);
            vec![json_msg(json!({
                "type": "zoteroDigest",
                "key": key,
                "citeKey": cite_key,
                "digest": digest,
                "path": path,
                "pdfPath": pdf_path,
            }))]
        }
        "termOpen" => {
            let term_id = msg.get("termId").and_then(|v| v.as_str()).unwrap_or("");
            let cwd = msg.get("cwd").and_then(|v| v.as_str());
            let cols = msg.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let rows = msg.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            state.terminals().open(term_id, cwd, cols, rows);
            // Flush any immediate data
            term_events(state)
        }
        "termInput" => {
            let term_id = msg.get("termId").and_then(|v| v.as_str()).unwrap_or("");
            let data = msg.get("data").and_then(|v| v.as_str()).unwrap_or("");
            state.terminals().input(term_id, data);
            term_events(state)
        }
        "termResize" => {
            let term_id = msg.get("termId").and_then(|v| v.as_str()).unwrap_or("");
            let cols = msg.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;
            let rows = msg.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
            state.terminals().resize(term_id, cols, rows);
            vec![]
        }
        "termClose" => {
            let term_id = msg.get("termId").and_then(|v| v.as_str()).unwrap_or("");
            state.terminals().close(term_id);
            term_events(state)
        }
        other => vec![err(format!("type inconnu: {other}"))],
    };
    // Always flush PTY output that arrived since last message.
    if msg_type != "termOpen" && msg_type != "termInput" && msg_type != "termClose" {
        out.extend(term_events(state));
    }
    out
}

async fn git_root(state: &AppState, msg: &Value) -> String {
    if let Some(r) = msg
        .get("root")
        .or_else(|| msg.get("projectRoot"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return r.to_string();
    }
    if let Some(tid) = msg.get("threadId").and_then(|v| v.as_str()) {
        if let Some(t) = state.threads().lock().await.get(tid) {
            return t.project_root.clone();
        }
    }
    String::new()
}

async fn git_changed(state: &AppState, msg: &Value, root: &str) -> Vec<String> {
    let thread_id = msg.get("threadId").cloned().unwrap_or(Value::Null);
    let out = json_msg(json!({
        "type": "gitChanged",
        "threadId": thread_id,
        "projectRoot": root,
    }));
    state.publish(out.clone());
    vec![out]
}

fn term_events(state: &AppState) -> Vec<String> {
    state
        .terminals()
        .drain_events()
        .into_iter()
        .map(|ev| match ev {
            TermEvent::Data { term_id, data } => {
                json_msg(json!({"type":"termData","termId": term_id, "data": data}))
            }
            TermEvent::Exit { term_id, exit_code } => {
                json_msg(json!({"type":"termExit","termId": term_id, "exitCode": exit_code}))
            }
        })
        .collect()
}

async fn broadcast_threads(state: &AppState) -> Vec<String> {
    let list = state.threads().lock().await.list();
    // Direct reply only (avoid bus double-delivery on the requesting socket).
    vec![json_msg(json!({"type":"threads","threads": list}))]
}

async fn broadcast_highlights(state: &AppState) -> Vec<String> {
    let list = state.highlights().lock().await.list();
    vec![json_msg(json!({"type":"highlights","highlights": list}))]
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
