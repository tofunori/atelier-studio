//! WebSocket message routing (plan 033 — full Node case inventory, Porte 9).

use crate::state::{AppState, QaSession};
use atelier_protocol::{ErrorMessage, PongMessage};
use atelier_store::{get_all_ledgers, get_ledger, iso_now, read_settings, write_settings};
use atelier_workspace::{
    check_frame, clear_pasted, commit as git_commit, diff as git_diff, ignore_pattern,
    list_commands, list_files, list_pasted, pull as git_pull, push as git_push, restore as git_restore,
    revert_file, save_image, scan_local, stage_file, status as git_status, unstage_file,
    zotero_available, zotero_collections, zotero_load_favs, zotero_search, zotero_toggle_fav,
    pdf_absolute_path, TermEvent,
};
use serde_json::{json, Value};

/// Exhaustive list of handled WS types (must cover Node `router.mjs` cases).
pub const ALL_MESSAGE_TYPES: &[&str] = &[
    "ping",
    "send",
    "interrupt",
    "providerStatus",
    "status",
    "setupStatus",
    "listThreads",
    "renameThread",
    "moveThread",
    "deleteThread",
    "getHistory",
    "listHighlights",
    "addHighlight",
    "removeHighlight",
    "getSettings",
    "saveSettings",
    "getLedger",
    "upsertThread",
    "listFiles",
    "listCommands",
    "listPasted",
    "clearPasted",
    "saveImage",
    "generateImage",
    "apiProviders",
    "saveApiProvider",
    "deleteApiProvider",
    "listApiModels",
    "scanLocal",
    "checkFrame",
    "gitStatus",
    "gitDiff",
    "gitStage",
    "gitUnstage",
    "gitRevertFile",
    "gitCommit",
    "gitPush",
    "gitPull",
    "gitIgnore",
    "gitUndoLastTurn",
    "generateCommitMsg",
    "zoteroSearch",
    "zoteroCollections",
    "zoteroFav",
    "zoteroDigest",
    "zoteroAddPdf",
    "termOpen",
    "termInput",
    "termResize",
    "termClose",
    "exportThread",
    "listSessions",
    "importSession",
    "forkThread",
    "revert",
    "clientLog",
    "clientHello",
    "permissionResponse",
    "interactionResponse",
    "retitleAll",
    "requestReview",
    "getUsage",
    "quickAsk",
    "qaPromote",
    "codexCompact",
    "codexClear",
    "goalSet",
    "goalGet",
    "goalClear",
];

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
        "generateImage" => handle_generate_image(state, &msg).await,
        "apiProviders" => {
            let list = list_api_providers_public(state.app_dir());
            vec![json_msg(json!({"type":"apiProviders","providers": list}))]
        }
        "saveApiProvider" => {
            let provider = msg.get("provider").cloned().unwrap_or(json!({}));
            match save_api_provider(state.app_dir(), provider) {
                Ok(list) => {
                    let mut out = vec![json_msg(json!({"type":"apiProviders","providers": list}))];
                    out.extend(crate::send::handle_provider_status(state).await);
                    out
                }
                Err(e) => vec![err(e)],
            }
        }
        "deleteApiProvider" => {
            let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
            match delete_api_provider(state.app_dir(), id) {
                Ok(list) => {
                    let mut out = vec![json_msg(json!({"type":"apiProviders","providers": list}))];
                    out.extend(crate::send::handle_provider_status(state).await);
                    out
                }
                Err(e) => vec![err(e)],
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

        // --- Porte 9: remaining Node router cases ---
        "setupStatus" => handle_setup_status(state).await,
        "listApiModels" => handle_list_api_models(state, &msg).await,
        "exportThread" => handle_export_thread(state, &msg).await,
        "listSessions" => {
            // Session filesystem scan deferred; shape-compatible empty list.
            let provider = msg.get("provider").cloned().unwrap_or(Value::Null);
            vec![json_msg(json!({
                "type": "sessions",
                "provider": provider,
                "sessions": [],
            }))]
        }
        "importSession" => {
            let short = msg
                .get("title")
                .and_then(|v| v.as_str())
                .map(str::to_string)
                .or_else(|| {
                    msg.get("sessionId")
                        .and_then(|v| v.as_str())
                        .map(|s| s.chars().take(8).collect::<String>())
                })
                .unwrap_or_else(|| "session".into());
            let title = format!("⤓ {short}");
            let patch = json!({
                "id": msg.get("newThreadId"),
                "projectRoot": msg.get("projectRoot").cloned().unwrap_or(json!("")),
                "provider": msg.get("provider"),
                "title": title,
                "sessionId": msg.get("sessionId"),
                "status": "idle",
            });
            let result = {
                let mut store = state.threads().lock().await;
                store.upsert(patch, false)
            };
            match result {
                Ok(_) => broadcast_threads(state).await,
                Err(e) => vec![err(e)],
            }
        }
        "forkThread" => handle_fork_thread(state, &msg).await,
        "revert" => handle_revert(state, &msg).await,
        "clientLog" => {
            let note = msg
                .get("note")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .chars()
                .take(300)
                .collect::<String>();
            let out = json_msg(json!({"type":"clientLog","note": note}));
            state.publish(out.clone());
            vec![out]
        }
        "clientHello" => {
            let id = msg
                .get("clientInstanceId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if id.len() >= 20
                && id
                    .chars()
                    .all(|c| c.is_ascii_hexdigit() || c == '-')
            {
                *state.client_instance_id().lock().await = Some(id.to_string());
            }
            vec![]
        }
        "permissionResponse" | "interactionResponse" => {
            // Waiters not yet wired (interactive approvals deferred) — idempotent no-op.
            vec![]
        }
        "retitleAll" => handle_retitle_all(state).await,
        "requestReview" => {
            let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            vec![json_msg(json!({
                "type": "reviewResult",
                "threadId": thread_id,
                "status": "done",
                "verdict": "unavailable",
                "issues": [],
            }))]
        }
        "getUsage" => handle_get_usage(state).await,
        "quickAsk" => handle_quick_ask(state, &msg).await,
        "qaPromote" => handle_qa_promote(state, &msg).await,
        "codexCompact" => {
            let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            vec![err_thread(
                thread_id,
                "codexCompact: non encore porté (session Codex native) — ATELIER_BACKEND=node",
            )]
        }
        "codexClear" => handle_codex_clear(state, &msg).await,
        "goalSet" | "goalGet" | "goalClear" => {
            let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            vec![err_thread(
                thread_id,
                "goals disponibles seulement pour un chat Codex (API goals non encore portée en Rust)",
            )]
        }
        "generateCommitMsg" => {
            let root = git_root(state, &msg).await;
            // Claude title helper not ported; empty message is valid UI fallback.
            vec![json_msg(json!({
                "type": "commitMsg",
                "projectRoot": root,
                "message": "",
            }))]
        }
        "zoteroAddPdf" => {
            vec![err(
                "zoteroAddPdf: non encore porté en Rust — ATELIER_BACKEND=node",
            )]
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

async fn handle_setup_status(state: &AppState) -> Vec<String> {
    let providers: Vec<Value> = atelier_providers::provider_status_list(Some(state.app_dir()))
        .into_iter()
        .map(|p| {
            let installed = state.provider(&p.id).is_some() || p.kind == "api";
            json!({
                "id": p.id,
                "label": p.label,
                "kind": p.kind,
                "installed": installed,
                "version": if installed { json!("ok") } else { Value::Null },
                "binPath": Value::Null,
                "auth": if installed { "ready" } else { "not_installed" },
                "models": p.models.len(),
                "defaultModel": p.default_model,
                "modelError": Value::Null,
            })
        })
        .collect();
    vec![json_msg(json!({
        "type": "setupStatus",
        "status": {
            "runtime": {
                "node": "rust",
                "version": env!("CARGO_PKG_VERSION"),
                "bundled": false,
            },
            "sidecar": {
                "pid": std::process::id(),
                "startedAt": state.started_at(),
                "appVersion": state.app_version(),
                "bundleHash": state.bundle_hash(),
                "dir": state.server_dir(),
            },
            "providers": providers,
        }
    }))]
}

async fn handle_list_api_models(_state: &AppState, msg: &Value) -> Vec<String> {
    let provider = msg.get("provider").cloned().unwrap_or(json!({}));
    let base = provider
        .get("baseURL")
        .or_else(|| provider.get("baseUrl"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_end_matches('/');
    if base.is_empty() {
        return vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": "baseURL requise",
        }))];
    }
    let api_key = provider
        .get("apiKey")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            provider
                .get("apiKeyEnv")
                .and_then(|v| v.as_str())
                .and_then(|e| std::env::var(e).ok())
                .filter(|s| !s.is_empty())
        });
    let Some(api_key) = api_key else {
        return vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": "clé API requise pour lister les modèles",
        }))];
    };
    let anthropic = provider.get("protocol").and_then(|v| v.as_str()) == Some("anthropic");
    let url = if anthropic {
        format!("{base}/v1/models")
    } else if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return vec![json_msg(json!({
                "type": "apiModels",
                "models": null,
                "error": e.to_string(),
            }))];
        }
    };
    let mut req = client.get(&url);
    req = if anthropic {
        req.header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
    } else {
        req.bearer_auth(&api_key)
    };
    match req.send().await {
        Ok(res) if res.status().is_success() => {
            let json: Value = res.json().await.unwrap_or(json!({}));
            let list = json
                .get("data")
                .or_else(|| json.get("models"))
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let mut models: Vec<Value> = list
                .into_iter()
                .filter_map(|m| {
                    let id = m
                        .get("id")
                        .or_else(|| m.get("name"))
                        .and_then(|v| v.as_str())?
                        .to_string();
                    if id.is_empty() {
                        return None;
                    }
                    Some(json!({
                        "id": id,
                        "label": m.get("display_name").or_else(|| m.get("name")).or_else(|| m.get("id")).cloned().unwrap_or(json!(id)),
                        "reasoning": m.get("reasoning"),
                    }))
                })
                .collect();
            models.sort_by(|a, b| {
                a.get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .cmp(b.get("id").and_then(|v| v.as_str()).unwrap_or(""))
            });
            vec![json_msg(json!({"type":"apiModels","models": models}))]
        }
        Ok(res) => vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": format!("HTTP {}", res.status()),
        }))],
        Err(e) => vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": e.to_string(),
        }))],
    }
}

async fn handle_export_thread(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
    let t = match state.threads().lock().await.get(thread_id).cloned() {
        Some(t) => t,
        None => return vec![err("thread introuvable")],
    };
    let mut events = msg
        .get("events")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if events.is_empty() && state.journal().has_journal(thread_id) {
        events = state.journal().materialize(thread_id);
    }
    let title = if t.title.is_empty() {
        "conversation".into()
    } else {
        t.title.clone()
    };
    let mut md = format!(
        "# {title}\n\n- Provider : {}\n- Projet : {}\n- Session : {}\n- Exporté : {}\n\n",
        t.provider,
        if t.project_root.is_empty() {
            "(aucun)"
        } else {
            &t.project_root
        },
        t.session_id.as_deref().unwrap_or("-"),
        iso_now(),
    );
    for e in &events {
        let kind = e.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        let text = e.get("text").and_then(|v| v.as_str()).unwrap_or("");
        match kind {
            "user" => md.push_str(&format!("**Utilisateur :**\n\n{text}\n\n")),
            "text" => md.push_str(&format!("**Agent :**\n\n{text}\n\n")),
            _ => {}
        }
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let dir = std::path::PathBuf::from(home).join("Downloads");
    let _ = std::fs::create_dir_all(&dir);
    let safe: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(60)
        .collect();
    let safe = safe.trim().to_string();
    let safe = if safe.is_empty() {
        "conversation".into()
    } else {
        safe
    };
    let stamp = iso_now().chars().take(16).collect::<String>().replace([':', 'T'], "-");
    let base = dir.join(format!("atelier-{safe}-{stamp}"));
    let md_path = base.with_extension("md");
    let json_path = base.with_extension("json");
    if std::fs::write(&md_path, &md).is_err() {
        return vec![err("export: écriture markdown impossible")];
    }
    let payload = json!({"thread": t, "events": events});
    let _ = std::fs::write(
        &json_path,
        serde_json::to_string_pretty(&payload).unwrap_or_default(),
    );
    vec![json_msg(json!({
        "type": "exported",
        "threadId": thread_id,
        "path": md_path.to_string_lossy(),
    }))]
}

async fn handle_fork_thread(state: &AppState, msg: &Value) -> Vec<String> {
    let from = msg.get("fromThreadId").and_then(|v| v.as_str()).unwrap_or("");
    let new_id = msg.get("newThreadId").and_then(|v| v.as_str()).unwrap_or("");
    if from.is_empty() || new_id.is_empty() {
        return vec![err("fork: fromThreadId et newThreadId requis")];
    }
    let src = state.threads().lock().await.get(from).cloned();
    let Some(src) = src else {
        return vec![err("fork indisponible pour ce chat")];
    };
    if src.session_id.is_none() || src.provider != "claude" {
        return vec![err("fork indisponible pour ce chat")];
    }
    let title = format!("⑂ {}", if src.title.is_empty() { "fork" } else { &src.title });
    let patch = json!({
        "id": new_id,
        "projectRoot": src.project_root,
        "provider": "claude",
        "title": title,
        "sessionId": src.session_id,
        "forkPending": true,
        "status": "idle",
    });
    {
        let mut store = state.threads().lock().await;
        if let Err(e) = store.upsert(patch, false) {
            return vec![err(e)];
        }
    }
    let event_id = msg.get("eventId").and_then(|v| v.as_str());
    let _ = state.journal().copy_thread(from, new_id, event_id);
    broadcast_threads(state).await
}

async fn handle_revert(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
    if thread_id.is_empty() {
        return vec![err_thread("", "revert indisponible")];
    }
    let exists = state.threads().lock().await.get(thread_id).is_some();
    if !exists {
        return vec![err_thread(thread_id, "revert indisponible")];
    }
    let mut truncated = false;
    if state.journal().has_journal(thread_id) {
        let mut event_id = msg
            .get("eventId")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        if event_id.is_none() {
            if let Some(text) = msg.get("text").and_then(|v| v.as_str()) {
                let events = state.journal().materialize(thread_id);
                event_id = events.iter().find_map(|e| {
                    if e.get("kind").and_then(|v| v.as_str()) == Some("user")
                        && e.get("text").and_then(|v| v.as_str()).map(str::trim)
                            == Some(text.trim())
                    {
                        e.pointer("/meta/eventId")
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                    } else {
                        None
                    }
                });
            }
        }
        if let Some(eid) = event_id {
            truncated = state.journal().truncate_from(thread_id, &eid);
        }
    }
    let _ = truncated;
    let out = json_msg(json!({"type":"reverted","threadId": thread_id}));
    let mut replies = broadcast_threads(state).await;
    replies.insert(0, out);
    replies
}

async fn handle_retitle_all(state: &AppState) -> Vec<String> {
    if !state.try_begin_retitle() {
        return vec![json_msg(json!({
            "type": "retitleAllDone",
            "scanned": 0,
            "renamed": 0,
            "running": true,
        }))];
    }
    // Without Claude titleConversation: heuristic from journal first user message.
    let threads = state.threads().lock().await.list();
    let mut scanned = 0usize;
    let mut renamed = 0usize;
    for t in threads {
        let title = t.title.trim();
        let is_raw = title.is_empty()
            || title == "Sans titre"
            || title.starts_with("Session ")
            || title.chars().count() >= 40;
        if !is_raw {
            continue;
        }
        scanned += 1;
        let events = if state.journal().has_journal(&t.id) {
            state.journal().materialize(&t.id)
        } else {
            Vec::new()
        };
        let Some(first) = events.iter().find_map(|e| {
            if e.get("kind").and_then(|v| v.as_str()) == Some("user") {
                e.get("text").and_then(|v| v.as_str()).map(str::to_string)
            } else {
                None
            }
        }) else {
            continue;
        };
        let new_title: String = first.chars().take(48).collect();
        if new_title.is_empty() {
            continue;
        }
        let _ = state
            .threads()
            .lock()
            .await
            .upsert(json!({"id": t.id, "title": new_title}), true);
        renamed += 1;
    }
    state.end_retitle();
    let mut out = broadcast_threads(state).await;
    out.push(json_msg(json!({
        "type": "retitleAllDone",
        "scanned": scanned,
        "renamed": renamed,
    })));
    out
}

async fn handle_get_usage(state: &AppState) -> Vec<String> {
    let entries = get_all_ledgers(&state.ledger_dir(), 500);
    let today = iso_now().chars().take(10).collect::<String>(); // YYYY-MM-DD
    let mut models = serde_json::Map::new();
    for e in entries {
        let ts = e.get("ts").and_then(|v| v.as_str()).unwrap_or("");
        if !ts.starts_with(&today) && !ts.is_empty() {
            // also accept Date.toDateString-ish by checking calendar day via ISO only
            continue;
        }
        // Node uses toDateString local; we use UTC day of ISO — acceptable R9 PARTIAL.
        if ts.is_empty() {
            continue;
        }
        let key = e
            .get("model")
            .or_else(|| e.get("provider"))
            .and_then(|v| v.as_str())
            .unwrap_or("?")
            .to_string();
        let entry = models.entry(key).or_insert(json!({"turns":0,"output":0}));
        if let Some(obj) = entry.as_object_mut() {
            let turns = obj.get("turns").and_then(|v| v.as_u64()).unwrap_or(0) + 1;
            let out = obj.get("output").and_then(|v| v.as_u64()).unwrap_or(0)
                + e.pointer("/usage/output")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
            obj.insert("turns".into(), json!(turns));
            obj.insert("output".into(), json!(out));
        }
    }
    vec![json_msg(json!({
        "type": "usage",
        "claude": Value::Null,
        "codex": Value::Null,
        "models": models,
    }))]
}

async fn handle_quick_ask(state: &AppState, msg: &Value) -> Vec<String> {
    let qa_id = msg
        .get("qaId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if qa_id.is_empty() {
        return vec![err("qaId requis")];
    }
    let provider = msg
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("claude")
        .to_string();
    let prompt = msg
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let Some(p) = state.provider(&provider) else {
        return vec![json_msg(json!({
            "type": "qaEvent",
            "qaId": qa_id,
            "event": {"kind":"error","message":"provider inconnu"},
        }))];
    };
    let prev = state.qa_sessions().lock().await.get(&qa_id).cloned();
    let state_bg = state.clone();
    let qa_id_bg = qa_id.clone();
    let model = msg
        .get("model")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let effort = msg
        .get("effort")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    tokio::spawn(async move {
        let emit_state = state_bg.clone();
        let qid = qa_id_bg.clone();
        let on_event: std::sync::Arc<dyn Fn(Value) + Send + Sync> =
            std::sync::Arc::new(move |event: Value| {
                if let Ok(s) = serde_json::to_string(&json!({
                    "type": "qaEvent",
                    "qaId": qid,
                    "event": event,
                })) {
                    emit_state.publish(s);
                }
            });
        let req = atelier_providers::SendRequest {
            thread_id: format!("qa:{qa_id_bg}"),
            turn_id: uuid_v4(),
            prompt,
            project_root: std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()),
            session_id: prev.map(|s| s.session_id),
            model,
            effort,
            mode: atelier_providers::SendMode::Normal,
            on_event,
            is_cancelled: std::sync::Arc::new(|| false),
        };
        let result = p.send(req).await;
        if let Some(sid) = result.session_id {
            state_bg.qa_sessions().lock().await.insert(
                qa_id_bg,
                QaSession {
                    provider,
                    session_id: sid,
                },
            );
        }
    });
    vec![]
}

async fn handle_qa_promote(state: &AppState, msg: &Value) -> Vec<String> {
    let qa_id = msg.get("qaId").and_then(|v| v.as_str()).unwrap_or("");
    let new_id = msg
        .get("newThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let session = state.qa_sessions().lock().await.get(qa_id).cloned();
    let Some(s) = session else {
        return vec![json_msg(json!({
            "type": "qaPromoteError",
            "qaId": qa_id,
            "message": "session éphémère expirée — pose une nouvelle question puis promeus",
        }))];
    };
    let title = msg
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let patch = json!({
        "id": new_id,
        "projectRoot": msg.get("projectRoot").cloned().unwrap_or(json!("")),
        "provider": s.provider,
        "title": format!("Quick Ask — {title}"),
        "sessionId": s.session_id,
        "status": "idle",
    });
    {
        let mut store = state.threads().lock().await;
        if let Err(e) = store.upsert(patch, false) {
            return vec![err(e)];
        }
    }
    state.qa_sessions().lock().await.remove(qa_id);
    broadcast_threads(state).await
}

async fn handle_codex_clear(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
    if thread_id.is_empty() {
        return vec![err("threadId requis")];
    }
    {
        let mut store = state.threads().lock().await;
        if store.get(thread_id).is_some() {
            let _ = store.upsert(
                json!({"id": thread_id, "sessionId": Value::Null}),
                false,
            );
        }
    }
    // Journal frontier marker (best-effort).
    let _ = state.journal().append(&json!({
        "kind": "tool",
        "name": "__session-cleared",
        "meta": {
            "threadId": thread_id,
            "provider": "codex",
            "eventId": uuid_v4(),
            "sequence": state.journal().last_sequence(thread_id) + 1,
            "durable": true,
            "origin": "atelier",
        }
    }));
    broadcast_threads(state).await
}

fn uuid_v4() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Seedream image gen (broadcast-friendly). Codex engine deferred → clear error.
async fn handle_generate_image(state: &AppState, msg: &Value) -> Vec<String> {
    let prompt = msg
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let size = msg
        .get("size")
        .and_then(|v| v.as_str())
        .unwrap_or("2K")
        .to_string();
    let engine = msg
        .get("engine")
        .and_then(|v| v.as_str())
        .unwrap_or("seedream");
    let edit_from = msg
        .get("editFrom")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let root = {
        let r = msg
            .get("projectDir")
            .or_else(|| msg.get("projectRoot"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        match r {
            Some(r) => r,
            None => git_root(state, msg).await,
        }
    };

    if engine == "codex" {
        let out = json_msg(json!({
            "type": "imageGenerated",
            "projectRoot": root,
            "path": null,
            "error": "engine=codex (gpt-image) non encore porté en Rust — utilisez engine=seedream ou ATELIER_BACKEND=node",
        }));
        state.publish(out.clone());
        return vec![out];
    }
    if prompt.is_empty() {
        let out = json_msg(json!({
            "type": "imageGenerated",
            "projectRoot": root,
            "path": null,
            "error": "prompt requis",
        }));
        state.publish(out.clone());
        return vec![out];
    }

    // Long request (~minutes): run in background, deliver via bus so a socket
    // reconnect still receives the result (Node uses broadcast for the same reason).
    let state_bg = state.clone();
    let app_dir = state.app_dir().to_path_buf();
    let root_bg = root.clone();
    tokio::spawn(async move {
        let edit_uri = edit_from.as_ref().and_then(|path| {
            let bytes = std::fs::read(path).ok()?;
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
            Some(format!("data:image/png;base64,{b64}"))
        });
        let result = atelier_providers::generate_image(
            &app_dir,
            &prompt,
            &size,
            edit_uri.as_deref(),
        )
        .await;
        let payload = match result {
            Ok(r) => {
                let dir = std::path::Path::new(&root_bg).join("generated");
                let write = (|| -> Result<(String, String, Value), String> {
                    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                    let ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0);
                    let base = format!("fig_{ts}");
                    let image_path = dir.join(format!("{base}.png"));
                    let meta_path = dir.join(format!("{base}.json"));
                    let b64 = r
                        .get("b64")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| "b64 manquant".to_string())?;
                    use base64::Engine;
                    let bytes = base64::engine::general_purpose::STANDARD
                        .decode(b64)
                        .map_err(|e| e.to_string())?;
                    std::fs::write(&image_path, bytes).map_err(|e| e.to_string())?;
                    let meta = json!({
                        "prompt": prompt,
                        "engine": "seedream",
                        "model": r.get("model"),
                        "size": r.get("size").cloned().unwrap_or(json!(size)),
                        "editFrom": edit_from,
                        "createdAt": chrono_like_iso(ts),
                        "usage": r.get("usage"),
                    });
                    std::fs::write(
                        &meta_path,
                        serde_json::to_string_pretty(&meta).unwrap_or_default(),
                    )
                    .map_err(|e| e.to_string())?;
                    Ok((
                        image_path.to_string_lossy().into_owned(),
                        meta_path.to_string_lossy().into_owned(),
                        meta,
                    ))
                })();
                match write {
                    Ok((path, meta_path, meta)) => {
                        let mut o = json!({
                            "type": "imageGenerated",
                            "projectRoot": root_bg,
                            "path": path,
                            "metaPath": meta_path,
                        });
                        if let Some(map) = o.as_object_mut() {
                            if let Some(m) = meta.as_object() {
                                for (k, v) in m {
                                    map.insert(k.clone(), v.clone());
                                }
                            }
                        }
                        o
                    }
                    Err(e) => json!({
                        "type": "imageGenerated",
                        "projectRoot": root_bg,
                        "path": null,
                        "error": e,
                    }),
                }
            }
            Err(e) => json!({
                "type": "imageGenerated",
                "projectRoot": root_bg,
                "path": null,
                "error": e,
            }),
        };
        if let Ok(s) = serde_json::to_string(&payload) {
            state_bg.publish(s);
        }
    });
    // No immediate reply — result arrives on bus as imageGenerated.
    vec![]
}

fn chrono_like_iso(ms: u128) -> String {
    // RFC3339-ish without chrono dep: enough for meta JSON.
    let secs = (ms / 1000) as i64;
    let days = secs.div_euclid(86_400);
    let tod = secs.rem_euclid(86_400) as u32;
    let h = tod / 3600;
    let m = (tod % 3600) / 60;
    let s = tod % 60;
    // 1970-01-01 + days — approximate Y-M-D via civil algorithm
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{:03}Z", ms % 1000)
}

/// Howard Hinnant civil_from_days (proleptic Gregorian).
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

/// Public list: strip raw apiKey for UI (keep apiKeyEnv + presence flag).
fn list_api_providers_public(app_dir: &std::path::Path) -> Vec<Value> {
    let path = app_dir.join("api_providers.json");
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(val) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let list = if let Some(arr) = val.as_array() {
        arr.clone()
    } else {
        val.get("providers")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
    };
    list.into_iter()
        .map(|mut p| {
            if let Some(obj) = p.as_object_mut() {
                let has_key = obj
                    .get("apiKey")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                obj.remove("apiKey");
                obj.insert("hasApiKey".into(), json!(has_key));
            }
            p
        })
        .collect()
}

fn save_api_provider(app_dir: &std::path::Path, provider: Value) -> Result<Vec<Value>, String> {
    let id = provider
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "id requis".to_string())?
        .to_string();
    let path = app_dir.join("api_providers.json");
    let mut list: Vec<Value> = if let Ok(raw) = std::fs::read_to_string(&path) {
        let val: Value = serde_json::from_str(&raw).unwrap_or(json!([]));
        if let Some(arr) = val.as_array() {
            arr.clone()
        } else {
            val.get("providers")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        }
    } else {
        Vec::new()
    };
    // If UI omitted apiKey but entry exists, keep previous key.
    let mut provider = provider;
    if provider
        .get("apiKey")
        .and_then(|v| v.as_str())
        .map(|s| s.is_empty())
        .unwrap_or(true)
    {
        if let Some(prev) = list.iter().find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
        {
            if let Some(k) = prev.get("apiKey").cloned() {
                if let Some(obj) = provider.as_object_mut() {
                    obj.insert("apiKey".into(), k);
                }
            }
        }
    }
    if let Some(pos) = list
        .iter()
        .position(|p| p.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
    {
        list[pos] = provider;
    } else {
        list.push(provider);
    }
    atelier_providers::write_api_configs(app_dir, &list)?;
    Ok(list_api_providers_public(app_dir))
}

fn delete_api_provider(app_dir: &std::path::Path, id: &str) -> Result<Vec<Value>, String> {
    if id.is_empty() {
        return Err("id requis".into());
    }
    let path = app_dir.join("api_providers.json");
    let mut list: Vec<Value> = if let Ok(raw) = std::fs::read_to_string(&path) {
        let val: Value = serde_json::from_str(&raw).unwrap_or(json!([]));
        if let Some(arr) = val.as_array() {
            arr.clone()
        } else {
            val.get("providers")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        }
    } else {
        Vec::new()
    };
    list.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(id));
    atelier_providers::write_api_configs(app_dir, &list)?;
    Ok(list_api_providers_public(app_dir))
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
