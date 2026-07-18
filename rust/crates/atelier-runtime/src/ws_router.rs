//! WebSocket message routing (plan 033 — full Node case inventory, Porte 9).

use crate::codex_history::{list_codex_sessions, load_codex_history};
use crate::grok_history::{load_grok_history, prefer_richer_dialogue};
use crate::state::{AppState, QaSession};
use atelier_protocol::{ErrorMessage, PongMessage};
use atelier_store::{get_all_ledgers, get_ledger, iso_now, read_settings, write_settings};
use atelier_workspace::{
    check_frame, clear_pasted, commit as git_commit, diff as git_diff,
    diff_contents as git_diff_contents, diff_staged as git_diff_staged, ignore_pattern,
    list_commands, list_files, list_pasted, narval_inspect_job, narval_list_directory,
    narval_read_text, narval_snapshot, narval_status, pdf_absolute_path, pull as git_pull,
    push as git_push, restore as git_restore, revert_file, save_image, scan_local, stage_files,
    status as git_status, unstage_files, zotero_available, zotero_collections, zotero_load_favs,
    zotero_search, zotero_toggle_fav, GitStatus, NarvalError, TermEvent,
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
    "getAgentHistory",
    "listHighlights",
    "listAutomations",
    "createAutomation",
    "updateAutomation",
    "deleteAutomation",
    "runAutomationNow",
    "addHighlight",
    "removeHighlight",
    "getSettings",
    "saveSettings",
    "getLedger",
    "upsertThread",
    "listFiles",
    "narvalStatus",
    "narvalSnapshot",
    "narvalListDirectory",
    "narvalInspectJob",
    "narvalReadText",
    "listCommands",
    "listPlugins",
    "listPasted",
    "clearPasted",
    "saveImage",
    "kbAdd",
    "kbList",
    "kbCollection",
    "kbTag",
    "kbArchive",
    "kbRemove",
    "kbPromote",
    "kbPromotePage",
    "gbrainSearch",
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
    "savePlan",
    "exportPlan",
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

fn commit_generation_context(status: &GitStatus, staged_only: bool) -> Option<String> {
    let files = status
        .files
        .iter()
        .filter(|file| {
            file.status != "!"
                && (!staged_only || (file.status != "?" && !file.status.starts_with('.')))
        })
        .collect::<Vec<_>>();
    if files.is_empty() {
        return None;
    }

    let untracked = files.iter().filter(|file| file.status == "?").count();
    let deleted = files
        .iter()
        .filter(|file| file.status.contains('D'))
        .count();
    let modified = files.len().saturating_sub(untracked + deleted);
    let shown = files.len().min(120);
    let mut lines = Vec::with_capacity(shown + 4);
    lines.push(format!(
        "Git change summary for branch {}: {} files ({} modified, {} deleted, {} untracked).",
        status.branch.as_deref().unwrap_or("unknown"),
        files.len(),
        modified,
        deleted,
        untracked,
    ));
    lines.push(format!("Changed files ({shown} shown):"));
    for file in files.iter().take(shown) {
        let stats = match (file.add, file.del) {
            (Some(add), Some(del)) => format!(" (+{add} -{del})"),
            _ => String::new(),
        };
        lines.push(format!("{} {}{}", file.status, file.path, stats));
    }
    if shown < files.len() {
        lines.push(format!("… and {} more files", files.len() - shown));
    }
    Some(lines.join("\n"))
}

fn narval_reply<T: serde::Serialize>(
    response_type: &str,
    request_id: Value,
    result: Result<Result<T, NarvalError>, tokio::task::JoinError>,
) -> Vec<String> {
    narval_reply_with(response_type, request_id, json!({}), result)
}

fn narval_reply_with<T: serde::Serialize>(
    response_type: &str,
    request_id: Value,
    extra: Value,
    result: Result<Result<T, NarvalError>, tokio::task::JoinError>,
) -> Vec<String> {
    let mut base = extra.as_object().cloned().unwrap_or_default();
    base.insert("type".into(), json!(response_type));
    base.insert("requestId".into(), request_id);
    match result {
        Ok(Ok(data)) => {
            base.insert(
                "data".into(),
                serde_json::to_value(data).unwrap_or(Value::Null),
            );
        }
        Ok(Err(error)) => {
            base.insert(
                "error".into(),
                serde_json::to_value(error).unwrap_or(Value::Null),
            );
        }
        Err(error) => {
            base.insert(
                "error".into(),
                json!({"code":"internal", "message": format!("tâche Narval interrompue: {error}")}),
            );
        }
    }
    vec![json_msg(Value::Object(base))]
}

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
            let journal = if state.journal().has_journal(id) {
                state.journal().materialize(id)
            } else {
                Vec::new()
            };
            let thread = state.threads().lock().await.get(id).cloned();
            let events = match thread {
                Some(t) if t.provider == "codex" => {
                    if let Some(session_id) = t.session_id {
                        let native =
                            tokio::task::spawn_blocking(move || load_codex_history(&session_id))
                                .await
                                .unwrap_or_default();
                        prefer_richer_dialogue(journal, native)
                    } else {
                        journal
                    }
                }
                Some(t) if t.provider == "grok" => {
                    if let Some(session_id) = t.session_id.as_deref() {
                        prefer_richer_dialogue(journal, load_grok_history(session_id))
                    } else {
                        journal
                    }
                }
                Some(t) if t.provider == "kimi" => {
                    // Import une seule fois : native_history rend None quand la
                    // session est déjà ouverte/importée — le journal Atelier
                    // reste alors la source (pas de doublon après reprise).
                    let native = match (t.session_id.as_deref(), state.provider("kimi")) {
                        (Some(session_id), Some(p)) => {
                            p.native_history(session_id, &t.project_root).await
                        }
                        _ => None,
                    };
                    match native {
                        Some(native) if !native.is_empty() => {
                            prefer_richer_dialogue(journal, native)
                        }
                        _ => journal,
                    }
                }
                _ => journal,
            };
            // Les reloads natifs (jsonl des CLIs) portent le prompt réellement
            // envoyé, bloc <atelier-kb> inclus — jamais dans l'affichage.
            let events: Vec<Value> = events
                .into_iter()
                .map(|mut event| {
                    if event.get("kind").and_then(Value::as_str) == Some("user") {
                        if let Some(text) = event.get("text").and_then(Value::as_str) {
                            if text.contains("<atelier-kb") {
                                let stripped = crate::kb_block::strip_kb_block(text);
                                event["text"] = json!(stripped);
                            }
                        }
                    }
                    event
                })
                .collect();
            vec![json_msg(json!({
                "type": "history",
                "threadId": id,
                "events": events,
            }))]
        }
        // Chaque sous-agent Codex a son propre rollout. Le panneau Atelier
        // demande ce transcript directement, sans dupliquer le prompt parent.
        "getAgentHistory" => {
            let agent_thread_id = msg
                .get("agentThreadId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let parent_thread_id = msg
                .get("parentThreadId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let events = tokio::task::spawn_blocking(move || load_codex_history(&agent_thread_id))
                .await
                .unwrap_or_default()
                .into_iter()
                .filter(|event| event.get("kind").and_then(|v| v.as_str()) != Some("user"))
                .collect::<Vec<_>>();
            vec![json_msg(json!({
                "type": "agentHistory",
                "parentThreadId": parent_thread_id,
                "agentThreadId": msg.get("agentThreadId").and_then(|v| v.as_str()).unwrap_or(""),
                "events": events,
            }))]
        }
        "listHighlights" => {
            let list = state.highlights().lock().await.list();
            vec![json_msg(json!({"type":"highlights","highlights": list}))]
        }
        "listAutomations" => crate::automations::list(state).await,
        "createAutomation" => crate::automations::create(state, &msg).await,
        "updateAutomation" => crate::automations::update(state, &msg).await,
        "deleteAutomation" => crate::automations::delete(state, &msg).await,
        "runAutomationNow" => crate::automations::run_now(state, &msg).await,
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
            vec![json_msg(
                json!({"type":"settingsFile","settings": settings}),
            )]
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
            vec![json_msg(
                json!({"type":"files","projectRoot": root, "files": files}),
            )]
        }
        "narvalStatus" => {
            let profile = msg
                .get("profile")
                .and_then(Value::as_str)
                .unwrap_or("narval")
                .to_string();
            let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
            narval_reply(
                "narvalStatus",
                request_id,
                tokio::task::spawn_blocking(move || narval_status(&profile)).await,
            )
        }
        "narvalSnapshot" => {
            let profile = msg
                .get("profile")
                .and_then(Value::as_str)
                .unwrap_or("narval")
                .to_string();
            let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
            narval_reply(
                "narvalSnapshot",
                request_id,
                tokio::task::spawn_blocking(move || narval_snapshot(&profile)).await,
            )
        }
        "narvalListDirectory" => {
            let profile = msg
                .get("profile")
                .and_then(Value::as_str)
                .unwrap_or("narval")
                .to_string();
            let path = msg
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
            let path_out = path.clone();
            narval_reply_with(
                "narvalDirectory",
                request_id,
                json!({"path": path_out}),
                tokio::task::spawn_blocking(move || narval_list_directory(&profile, &path)).await,
            )
        }
        "narvalInspectJob" => {
            let profile = msg
                .get("profile")
                .and_then(Value::as_str)
                .unwrap_or("narval")
                .to_string();
            let job_id = msg
                .get("jobId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
            narval_reply(
                "narvalJobDetail",
                request_id,
                tokio::task::spawn_blocking(move || narval_inspect_job(&profile, &job_id)).await,
            )
        }
        "narvalReadText" => {
            let profile = msg
                .get("profile")
                .and_then(Value::as_str)
                .unwrap_or("narval")
                .to_string();
            let path = msg
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let tail_lines = msg.get("tailLines").and_then(Value::as_u64).unwrap_or(400) as u32;
            let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
            narval_reply(
                "narvalText",
                request_id,
                tokio::task::spawn_blocking(move || narval_read_text(&profile, &path, tail_lines))
                    .await,
            )
        }
        "listCommands" => {
            let root = msg.get("projectRoot").and_then(|v| v.as_str());
            let commands = list_commands(root);
            vec![json_msg(json!({"type":"commands","commands": commands}))]
        }
        "listPlugins" => {
            let root = msg.get("projectRoot").and_then(Value::as_str).unwrap_or("");
            let Some(provider) = state.provider("codex") else {
                return vec![err("plugins: provider Codex absent")];
            };
            match provider
                .native_command("pluginsInstalled", json!({"projectRoot": root}))
                .await
            {
                Ok(value) => vec![json_msg(json!({
                    "type": "plugins",
                    "plugins": value.get("plugins").cloned().unwrap_or_else(|| json!([])),
                }))],
                Err(error) => vec![err(format!("plugins: {error}"))],
            }
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
        "kbAdd" => handle_kb_add(state, &msg),
        "kbList" => handle_kb_list(state),
        "kbCollection" | "kbTag" | "kbArchive" => handle_kb_organize(state, msg_type, &msg),
        "kbRemove" => handle_kb_remove(state, &msg).await,
        "kbPromote" => handle_kb_promote(state, &msg).await,
        "gbrainSearch" => handle_gbrain_search(state, &msg),
        "kbPromotePage" => handle_kb_promote_page(state, &msg),
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
            let url = msg
                .get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let blocked = tokio::task::spawn_blocking(move || check_frame(&url))
                .await
                .unwrap_or(false);
            let url = msg.get("url").and_then(|v| v.as_str()).unwrap_or("");
            vec![json_msg(
                json!({"type":"frameChecked","url": url, "blocked": blocked}),
            )]
        }
        "gitStatus" => {
            let root = git_root(state, &msg).await;
            match git_status(&root) {
                Ok(status) => {
                    vec![json_msg(
                        json!({"type":"gitStatus","projectRoot": root, "status": status}),
                    )]
                }
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitDiff" => {
            let root = git_root(state, &msg).await;
            let path = msg.get("path").and_then(|v| v.as_str());
            let scope = msg
                .get("scope")
                .and_then(|v| v.as_str())
                .unwrap_or("changes");
            let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
            let base_sha = msg.get("baseSha").and_then(|v| v.as_str());
            let result = if scope == "staged" {
                git_diff_staged(&root, path)
            } else {
                git_diff(&root, path)
            };
            match result {
                Ok(diff) => {
                    let contents =
                        path.and_then(|file| git_diff_contents(&root, file, scope, base_sha).ok());
                    vec![json_msg(json!({
                        "type": "gitDiff",
                        "requestId": request_id,
                        "projectRoot": root,
                        "path": path,
                        "scope": scope,
                        "diff": diff,
                        "before": contents.as_ref().map(|item| item.before.as_str()),
                        "after": contents.as_ref().map(|item| item.after.as_str()),
                        "binary": contents.as_ref().map(|item| item.binary).unwrap_or(false),
                    }))]
                }
                Err(e) => vec![json_msg(json!({
                    "type": "gitDiff",
                    "requestId": request_id,
                    "projectRoot": root,
                    "path": path,
                    "scope": scope,
                    "diff": "",
                    "error": e.to_string(),
                }))],
            }
        }
        "gitStage" => {
            let root = git_root(state, &msg).await;
            let paths = git_paths(&msg);
            match stage_files(&root, &paths) {
                Ok(()) => {
                    let mut out = vec![json_msg(
                        json!({"type":"gitStageDone","projectRoot": root, "paths": paths}),
                    )];
                    out.extend(git_changed(state, &msg, &root).await);
                    out
                }
                Err(e) => vec![err(e.to_string())],
            }
        }
        "gitUnstage" => {
            let root = git_root(state, &msg).await;
            let paths = git_paths(&msg);
            match unstage_files(&root, &paths) {
                Ok(()) => {
                    let mut out = vec![json_msg(
                        json!({"type":"gitUnstageDone","projectRoot": root, "paths": paths}),
                    )];
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
                    let mut out = vec![json_msg(
                        json!({"type":"gitCommitDone","projectRoot": root, "hash": hash}),
                    )];
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
            let op = if msg_type == "gitPush" {
                "push"
            } else {
                "pull"
            };
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
            let query = msg
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tag = msg.get("tag").and_then(|v| v.as_str()).map(str::to_string);
            let collection_id = msg.get("collectionId").and_then(|v| v.as_i64());
            let limit = msg.get("limit").and_then(|v| v.as_u64()).unwrap_or(400) as usize;
            let app_dir = state.app_dir().to_path_buf();
            let items = tokio::task::spawn_blocking(move || {
                zotero_search(&app_dir, &query, collection_id, tag.as_deref(), limit)
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
                Err(e) => vec![json_msg(
                    json!({"type":"zoteroItems","items": [], "error": e}),
                )],
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
                Ok(c) => vec![json_msg(
                    json!({"type":"zoteroCollections","collections": c}),
                )],
                Err(e) => {
                    vec![json_msg(
                        json!({"type":"zoteroCollections","collections": [], "error": e}),
                    )]
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
            let key = msg
                .get("key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
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
        "savePlan" => handle_save_plan(state, &msg, false).await,
        "exportPlan" => handle_save_plan(state, &msg, true).await,
        "listSessions" => {
            let provider = msg.get("provider").and_then(Value::as_str).unwrap_or("");
            let sessions = if provider == "codex" {
                tokio::task::spawn_blocking(list_codex_sessions)
                    .await
                    .unwrap_or_default()
            } else if let Some(p) = state.provider(provider) {
                // Listing natif (kimi : session/list ACP) — jamais le parser
                // de fichiers Codex pour un provider qui a le sien (plan 046).
                let project_root = msg
                    .get("projectRoot")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                p.list_sessions(&project_root).await.unwrap_or_default()
            } else {
                Vec::new()
            };
            vec![json_msg(json!({
                "type": "sessions",
                "provider": provider,
                "sessions": sessions,
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
            if id.len() >= 20 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
                *state.client_instance_id().lock().await = Some(id.to_string());
            }
            vec![]
        }
        "permissionResponse" => vec![],
        "interactionResponse" => {
            let request_id = msg.get("requestId").and_then(Value::as_str).unwrap_or("");
            let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
            let client_id = msg.get("clientInstanceId").and_then(Value::as_str);
            let response = msg.get("response").cloned().unwrap_or(Value::Null);
            let waiter = {
                let mut waiters = state.interaction_waiters().lock().await;
                let valid = waiters.get(request_id).is_some_and(|waiter| {
                    waiter.thread_id == thread_id
                        && waiter.client_instance_id.as_deref() == client_id
                });
                if valid {
                    waiters.remove(request_id)
                } else {
                    None
                }
            };
            if let Some(waiter) = waiter {
                if response.get("allow").and_then(Value::as_bool) == Some(true)
                    && response.get("scope").and_then(Value::as_str) == Some("session")
                {
                    state
                        .approval_sessions()
                        .lock()
                        .await
                        .insert(thread_id.to_string());
                }
                let _ = waiter.tx.send(response);
            }
            vec![]
        }
        "retitleAll" => handle_retitle_all(state).await,
        "requestReview" => {
            let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let thread = state.threads().lock().await.get(thread_id).cloned();
            let provider = state.provider("codex");
            let Some(thread) = thread else {
                return vec![err_thread(thread_id, "review: chat absent")];
            };
            let Some(provider) = provider else {
                return vec![err_thread(thread_id, "review: provider Codex absent")];
            };
            let state_review = state.clone();
            let thread_id_owned = thread_id.to_string();
            tokio::spawn(async move {
                let result = provider
                    .native_command(
                        "review",
                        json!({
                            "sessionId": thread.session_id,
                            "projectRoot": thread.project_root,
                        }),
                    )
                    .await;
                let message = match result {
                    Ok(value) => {
                        let review = value
                            .get("review")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .trim();
                        let lower = review.to_lowercase();
                        let clean = review.is_empty()
                            || lower.contains("no findings")
                            || lower.contains("aucun problème")
                            || lower.contains("aucun probleme");
                        json!({
                            "type": "reviewResult",
                            "threadId": thread_id_owned,
                            "status": "done",
                            "verdict": if clean { "ok" } else { "issues" },
                            "issues": if clean { json!([]) } else { json!([{
                                "claim": "Revue Codex",
                                "problem": review,
                                "severity": "review",
                            }]) },
                        })
                    }
                    Err(error) => json!({
                        "type": "reviewResult",
                        "threadId": thread_id_owned,
                        "status": "done",
                        "verdict": "error",
                        "issues": [],
                        "error": error,
                    }),
                };
                state_review.publish(message.to_string());
            });
            vec![json_msg(json!({
                "type": "reviewResult",
                "threadId": thread_id,
                "status": "running",
            }))]
        }
        "getUsage" => handle_get_usage(state).await,
        "quickAsk" => handle_quick_ask(state, &msg).await,
        "qaPromote" => handle_qa_promote(state, &msg).await,
        "codexCompact" => {
            let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let thread = state.threads().lock().await.get(thread_id).cloned();
            let Some(thread) = thread else {
                return vec![err_thread(thread_id, "compact: chat absent")];
            };
            let Some(provider) = state.provider("codex") else {
                return vec![err_thread(thread_id, "compact: provider Codex absent")];
            };
            match provider
                .native_command(
                    "compact",
                    json!({"sessionId": thread.session_id, "projectRoot": thread.project_root}),
                )
                .await
            {
                Ok(_) => vec![json_msg(json!({
                    "type": "event",
                    "threadId": thread_id,
                    "event": {"kind": "tool", "name": "__compacted"},
                }))],
                Err(error) => vec![err_thread(thread_id, format!("compact: {error}"))],
            }
        }
        "codexClear" => handle_codex_clear(state, &msg).await,
        "goalSet" | "goalGet" | "goalClear" => {
            let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let thread = state.threads().lock().await.get(thread_id).cloned();
            let Some(thread) = thread else {
                return vec![err_thread(thread_id, "goal: chat absent")];
            };
            if thread.provider != "codex" {
                return vec![err_thread(
                    thread_id,
                    "goals disponibles seulement pour un chat Codex",
                )];
            }
            let Some(provider) = state.provider("codex") else {
                return vec![err_thread(thread_id, "goal: provider Codex absent")];
            };
            let command = match msg.get("type").and_then(Value::as_str) {
                Some("goalSet") => "goalSet",
                Some("goalClear") => "goalClear",
                _ => "goalGet",
            };
            let mut params = json!({
                "sessionId": thread.session_id,
                "projectRoot": thread.project_root,
            });
            if command == "goalSet" {
                params["objective"] = msg.get("objective").cloned().unwrap_or(Value::Null);
                params["status"] = msg.get("status").cloned().unwrap_or(json!("active"));
                params["tokenBudget"] = msg.get("tokenBudget").cloned().unwrap_or(Value::Null);
            }
            match provider.native_command(command, params).await {
                Ok(value) => {
                    let cleared = command == "goalClear";
                    let goal = value.get("goal").cloned().unwrap_or(value);
                    vec![json_msg(json!({
                        "type": "event",
                        "threadId": thread_id,
                        "event": {
                            "kind": "goal",
                            "cleared": cleared || goal.is_null(),
                            "goal": if cleared { Value::Null } else { goal },
                        },
                    }))]
                }
                Err(error) => vec![err_thread(thread_id, format!("goal: {error}"))],
            }
        }
        "generateCommitMsg" => {
            let root = git_root(state, &msg).await;
            let scope = msg
                .get("scope")
                .and_then(Value::as_str)
                .filter(|scope| *scope == "changes")
                .unwrap_or("staged");
            let status = match git_status(&root) {
                Ok(status) => status,
                Err(error) => {
                    return vec![json_msg(json!({
                        "type": "commitMsg",
                        "projectRoot": root,
                        "error": error.to_string(),
                    }))]
                }
            };
            let Some(context) = commit_generation_context(&status, scope == "staged") else {
                let error = if scope == "staged" {
                    "Indexe au moins un fichier avant de générer le message."
                } else {
                    "Aucune modification à résumer."
                };
                return vec![json_msg(json!({
                    "type": "commitMsg",
                    "projectRoot": root,
                    "error": error,
                }))];
            };
            {
                let Some(provider) = state.provider("claude") else {
                    return vec![json_msg(json!({
                        "type": "commitMsg",
                        "projectRoot": root,
                        "error": "Claude Code est indisponible pour générer le message.",
                    }))];
                };
                match provider.commit_message(&context, &root).await {
                    Ok(Some(message)) => vec![json_msg(json!({
                        "type": "commitMsg",
                        "projectRoot": root,
                        "message": message,
                        "provider": provider.id(),
                    }))],
                    Ok(None) => vec![json_msg(json!({
                        "type": "commitMsg",
                        "projectRoot": root,
                        "error": "L’IA n’a retourné aucun message de commit.",
                    }))],
                    Err(error) => vec![json_msg(json!({
                        "type": "commitMsg",
                        "projectRoot": root,
                        "error": error,
                    }))],
                }
            }
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

fn git_paths(msg: &Value) -> Vec<String> {
    if let Some(paths) = msg.get("paths").and_then(Value::as_array) {
        return paths
            .iter()
            .filter_map(Value::as_str)
            .filter(|path| !path.is_empty())
            .map(str::to_string)
            .collect();
    }
    msg.get("path")
        .and_then(Value::as_str)
        .filter(|path| !path.is_empty())
        .map(|path| vec![path.to_string()])
        .unwrap_or_default()
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

/// Base de connaissances (plan 049 T2) : l'écriture passe par le CLI Node
/// `kb_cli.mjs` stagé dans server_dir — une seule implémentation du store
/// (verrou inter-processus, registre, extraction) au lieu d'un portage double.
/// Le texte transite par stdin (`--text -`) pour éviter la limite ARG_MAX.
fn kb_node_bin() -> Option<std::path::PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_TEST_NODE") {
        let pb = std::path::PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    if let Ok(out) = std::process::Command::new("which").arg("node").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(std::path::PathBuf::from(p));
            }
        }
    }
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        let pb = std::path::PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    None
}

/// Exécute une commande du CLI kb (`kb_cli.mjs` stagé dans server_dir) et
/// parse sa sortie JSON. `stdin_text` non vide est transmis via `--text -`
/// ajouté par l'appelant ; l'APP_DIR du serveur est propagé au CLI.
fn kb_cli_run(
    server_dir: &str,
    app_dir: &std::path::Path,
    args: &[&str],
    stdin_text: &str,
) -> Result<Value, String> {
    let cli = std::path::Path::new(server_dir).join("kb_cli.mjs");
    if !cli.is_file() {
        return Err(format!("kb_cli.mjs introuvable dans {server_dir}"));
    }
    let node = kb_node_bin().ok_or("node introuvable pour atelier-kb")?;
    let mut cmd = std::process::Command::new(node);
    cmd.arg(&cli)
        .args(args)
        .env("ATELIER_APP_DIR", app_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if stdin_text.is_empty() {
        cmd.stdin(std::process::Stdio::null());
    } else {
        cmd.stdin(std::process::Stdio::piped());
    }
    let mut child = cmd.spawn().map_err(|e| format!("spawn atelier-kb: {e}"))?;
    if !stdin_text.is_empty() {
        use std::io::Write;
        let mut stdin = child.stdin.take().ok_or("stdin atelier-kb indisponible")?;
        stdin.write_all(stdin_text.as_bytes()).map_err(|e| e.to_string())?;
        drop(stdin);
    }
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        let message = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if message.is_empty() { "atelier-kb: échec".into() } else { message });
    }
    serde_json::from_slice::<Value>(&out.stdout).map_err(|e| format!("sortie atelier-kb invalide: {e}"))
}

fn kb_error(message: String) -> Vec<String> {
    vec![json_msg(json!({"type": "kbError", "message": message}))]
}

#[cfg(test)]
pub(crate) fn kb_node_bin_for_tests() -> Option<std::path::PathBuf> {
    kb_node_bin()
}

/// Résout le binaire gbrain (PATH Finder minimal → repl. usuels).
fn gbrain_bin() -> Option<std::path::PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_TEST_GBRAIN") {
        let pb = std::path::PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    if let Ok(out) = std::process::Command::new("which").arg("gbrain").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(std::path::PathBuf::from(p));
            }
        }
    }
    let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
    let mut candidates = vec![
        std::path::PathBuf::from("/opt/homebrew/bin/gbrain"),
        std::path::PathBuf::from("/usr/local/bin/gbrain"),
    ];
    if let Some(home) = home {
        candidates.push(home.join("bin/gbrain"));
        candidates.push(home.join(".local/bin/gbrain"));
        // installation bun (cas réel de Thierry) : jamais dans le PATH GUI
        candidates.push(home.join(".bun/bin/gbrain"));
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// Promotion d'une source vers le corpus gbrain (plan 049 T7) — miroir du
/// routeur Node : titre + origine + extrait (700 scalaires), timeout 15 s.
async fn handle_kb_promote(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return kb_error("kbPromote: id requis".into());
    }
    let knowledge_dir = state.app_dir().join("knowledge");
    let Some((title, origin, kind)) = crate::kb_block::source_meta(&knowledge_dir, id) else {
        return kb_error(format!("Source inconnue: {id}"));
    };
    let Some(gbrain) = gbrain_bin() else {
        return kb_error("gbrain indisponible: introuvable sur le PATH".into());
    };
    let mut text = format!("{title} — {}", origin.unwrap_or(kind));
    if let Some(excerpt) = crate::kb_block::cache_excerpt(&knowledge_dir, id, 700) {
        if !excerpt.is_empty() {
            text.push_str("\n\n");
            text.push_str(&excerpt);
        }
    }
    let run = tokio::process::Command::new(gbrain)
        .arg("capture")
        .arg(&text)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();
    match tokio::time::timeout(std::time::Duration::from_secs(15), run).await {
        Err(_) => kb_error("gbrain: délai dépassé (NAS injoignable ?)".into()),
        Ok(Err(e)) => kb_error(format!("gbrain indisponible: {e}")),
        Ok(Ok(out)) if !out.status.success() => {
            let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let message = if !stderr.is_empty() { stderr } else { stdout };
            kb_error(if message.is_empty() { "gbrain capture: échec".into() } else { message })
        }
        Ok(Ok(_)) => vec![json_msg(json!({"type": "kbPromoted", "id": id}))],
    }
}

/// Recherche du corpus gbrain (plan 050 P3) — relais du CLI `atelier-kb
/// gbrain-search`. Échec (NAS coupé, binaire absent) = `gbrainResults` avec
/// `error`, jamais un kbError générique : la section du panneau l'affiche en
/// place sans polluer le flux d'épinglage.
fn handle_gbrain_search(state: &AppState, msg: &Value) -> Vec<String> {
    let query = msg
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if query.is_empty() {
        return vec![json_msg(
            json!({"type": "gbrainResults", "query": "", "results": [], "error": "requête vide"}),
        )];
    }
    let limit = msg
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(12)
        .clamp(1, 25)
        .to_string();
    match kb_cli_run(
        state.server_dir(),
        state.app_dir(),
        &["gbrain-search", "--query", &query, "--limit", &limit],
        "",
    ) {
        Ok(v) => vec![json_msg(json!({
            "type": "gbrainResults",
            "query": v.get("query").cloned().unwrap_or_else(|| json!(query)),
            "results": v.get("results").cloned().unwrap_or_else(|| json!([])),
        }))],
        Err(e) => vec![json_msg(
            json!({"type": "gbrainResults", "query": query, "results": [], "error": e}),
        )],
    }
}

/// Page directe gbrain (plan 050 P4) — relais du CLI `promote-page` :
/// aperçu sans `--write`, écriture uniquement sur confirmation UI.
fn handle_kb_promote_page(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return kb_error("kbPromotePage: id requis".into());
    }
    let slug = msg.get("slug").and_then(|v| v.as_str()).unwrap_or("");
    let write = msg.get("write").and_then(Value::as_bool).unwrap_or(false);
    let mut args = vec!["promote-page", "--id", id];
    if !slug.is_empty() {
        args.extend_from_slice(&["--slug", slug]);
    }
    if write {
        args.push("--write");
    }
    match kb_cli_run(state.server_dir(), state.app_dir(), &args, "") {
        Ok(v) if v.get("written").and_then(Value::as_bool) == Some(true) => {
            vec![json_msg(json!({
                "type": "kbPageWritten",
                "id": v.get("id").cloned().unwrap_or(json!(id)),
                "slug": v.get("slug").cloned().unwrap_or(json!(null)),
                "updated": v.get("updated").cloned().unwrap_or(json!(false)),
            }))]
        }
        Ok(v) => vec![json_msg(json!({
            "type": "kbPagePreview",
            "id": v.get("id").cloned().unwrap_or(json!(id)),
            "slug": v.get("slug").cloned().unwrap_or(json!(null)),
            "exists": v.get("exists").cloned().unwrap_or(json!(false)),
            "title": v.get("title").cloned().unwrap_or(json!(null)),
            "chars": v.get("chars").cloned().unwrap_or(json!(null)),
            "preview": v.get("preview").cloned().unwrap_or(json!("")),
        }))],
        Err(e) => kb_error(e),
    }
}

fn handle_kb_add(state: &AppState, msg: &Value) -> Vec<String> {
    let get = |key: &str| msg.get(key).and_then(|v| v.as_str()).unwrap_or("");
    let (kind, origin, title, text) = (get("kind"), get("origin"), get("title"), get("text"));
    if kind.is_empty() {
        return kb_error("kbAdd: kind requis".into());
    }
    let mut args = vec!["add", "--kind", kind];
    if !origin.is_empty() {
        args.extend_from_slice(&["--origin", origin]);
    }
    if !title.is_empty() {
        args.extend_from_slice(&["--title", title]);
    }
    if !text.is_empty() {
        args.extend_from_slice(&["--text", "-"]);
    }
    match kb_cli_run(state.server_dir(), state.app_dir(), &args, text) {
        Ok(v) => {
            let mut out = json!({
                "type": "kbAdded",
                "source": v.get("source").cloned().unwrap_or(Value::Null),
                "refreshed": v.get("refreshed").cloned().unwrap_or(Value::Bool(false)),
            });
            if let Some(warning) = v.get("warning") {
                out["warning"] = warning.clone();
            }
            vec![json_msg(out)]
        }
        Err(message) => {
            // échec du repli fetch alors que l'utilisateur vient DÉJÀ du
            // bouton livre : message non circulaire (miroir router.mjs)
            let via_browser = msg.get("via").and_then(|v| v.as_str()) == Some("browser");
            if via_browser && message.contains("bloque le téléchargement direct") {
                kb_error("La capture du texte n'a rien donné et le site bloque le téléchargement direct — recharge la page, attends la fin du chargement, puis reclique le livre.".into())
            } else {
                kb_error(message)
            }
        }
    }
}

fn kb_sources_msg(v: &Value) -> Vec<String> {
    let mut out = json!({
        "type": "kbSources",
        "sources": v.get("sources").cloned().unwrap_or(json!([])),
        "collections": v.get("collections").cloned().unwrap_or(json!([])),
        "archivedCount": v.get("archivedCount").cloned().unwrap_or(json!(0)),
        "archivedSources": v.get("archivedSources").cloned().unwrap_or(json!([])),
    });
    if let Some(warning) = v.get("warning") {
        out["warning"] = warning.clone();
    }
    vec![json_msg(out)]
}

fn handle_kb_list(state: &AppState) -> Vec<String> {
    match kb_cli_run(state.server_dir(), state.app_dir(), &["list"], "") {
        Ok(v) => kb_sources_msg(&v),
        Err(message) => kb_error(message),
    }
}

// Organisation de la base (plan 051 P1) : mutation via le CLI (une seule
// implémentation d'écriture) puis liste complète relue.
fn handle_kb_organize(state: &AppState, msg_type: &str, msg: &Value) -> Vec<String> {
    let arg = |k: &str| msg.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let off = msg.get("off").and_then(Value::as_bool).unwrap_or(false);
    let mut args: Vec<String> = Vec::new();
    match msg_type {
        "kbCollection" => {
            args.push("collection".into());
            match arg("op").as_str() {
                "add" => { args.push("--add".into()); args.push(arg("title")); }
                "rename" => {
                    args.push("--rename".into()); args.push(arg("slug"));
                    args.push("--title".into()); args.push(arg("title"));
                }
                "remove" => { args.push("--remove".into()); args.push(arg("slug")); }
                other => return kb_error(format!("kbCollection: op inconnue {other}")),
            }
        }
        "kbTag" => {
            args.extend(["tag".into(), "--id".into(), arg("id"), "--collection".into(), arg("collection")]);
            if off { args.push("--off".into()); }
        }
        _ => {
            args.extend(["archive".into(), "--id".into(), arg("id")]);
            if off { args.push("--off".into()); }
        }
    }
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    if let Err(message) = kb_cli_run(state.server_dir(), state.app_dir(), &refs, "") {
        return kb_error(message);
    }
    handle_kb_list(state)
}

async fn handle_kb_remove(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(|v| v.as_str()).unwrap_or("");
    if id.is_empty() {
        return kb_error("kbRemove: id requis".into());
    }
    if let Err(message) = kb_cli_run(state.server_dir(), state.app_dir(), &["remove", "--id", id], "") {
        return kb_error(message);
    }
    let mut out = handle_kb_list(state);
    // purge des références dans les threads (miroir du routeur Node) — sinon
    // les conversations non actives gardent des pilules orphelines
    let strip = |value: Option<&Value>| -> (Vec<String>, bool) {
        let items: Vec<String> = value
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        let had = items.iter().any(|x| x == id);
        (items.into_iter().filter(|x| x != id).collect(), had)
    };
    let patches: Vec<Value> = {
        let store = state.threads().lock().await;
        store
            .list()
            .iter()
            .filter_map(|thread| {
                let raw = serde_json::to_value(thread).ok()?;
                let (ids, had_ids) = strip(raw.get("kbSourceIds"));
                let (full, had_full) = strip(raw.get("kbFullContent"));
                if !had_ids && !had_full {
                    return None;
                }
                Some(json!({
                    "id": raw.get("id").cloned().unwrap_or(Value::Null),
                    "kbSourceIds": ids,
                    "kbFullContent": full,
                }))
            })
            .collect()
    };
    if !patches.is_empty() {
        {
            let mut store = state.threads().lock().await;
            for patch in patches {
                let _ = store.upsert(patch, true);
            }
        }
        out.extend(broadcast_threads(state).await);
    }
    out
}

async fn handle_setup_status(state: &AppState) -> Vec<String> {
    let mut providers: Vec<Value> = Vec::new();
    for p in atelier_providers::provider_status_list(Some(state.app_dir())) {
        let live = state.provider(&p.id);
        // Sonde dédiée (kimi, plan 046 étape 10) : états
        // not_installed/version_unsupported/login_needed/model_config_needed/
        // ready/protocol_error, chemin réel du binaire et masquage signalé.
        if let Some(probe) = match &live {
            Some(provider) => provider.setup_probe().await,
            None => None,
        } {
            let shadowed = probe.get("shadowed").and_then(Value::as_str);
            providers.push(json!({
                "id": p.id,
                "label": p.label,
                "kind": p.kind,
                "installed": probe.get("state").and_then(Value::as_str) != Some("not_installed"),
                "version": probe.get("version").cloned().unwrap_or(Value::Null),
                "binPath": probe.get("binPath").cloned().unwrap_or(Value::Null),
                "auth": probe.get("state").cloned().unwrap_or(json!("unknown")),
                "models": probe.get("models").cloned().unwrap_or(json!(0)),
                "defaultModel": p.default_model,
                "loginCommand": probe.get("loginCommand").cloned().unwrap_or(Value::Null),
                "modelError": match shadowed {
                    Some(official) => json!(format!(
                        "installation officielle masquée : {official} (binaire utilisé : {})",
                        probe.get("binPath").and_then(Value::as_str).unwrap_or("?")
                    )),
                    None => probe.get("error").cloned().unwrap_or(Value::Null),
                },
            }));
            continue;
        }
        let installed = live.is_some() || p.kind == "api";
        providers.push(json!({
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
        }));
    }
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

async fn handle_save_plan(state: &AppState, msg: &Value, export: bool) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    let markdown = msg.get("markdown").and_then(Value::as_str).unwrap_or("");
    if markdown.trim().is_empty() || markdown.len() > 1_000_000 {
        return vec![err_thread(thread_id, "plan: contenu invalide")];
    }
    let path = if export {
        let raw = msg.get("path").and_then(Value::as_str).unwrap_or("");
        let path = std::path::PathBuf::from(raw);
        if !path.is_absolute()
            || path
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref()
                != Some("md")
        {
            return vec![err_thread(thread_id, "plan: destination invalide")];
        }
        path
    } else {
        let thread = state.threads().lock().await.get(thread_id).cloned();
        let Some(thread) = thread.filter(|thread| !thread.project_root.is_empty()) else {
            return vec![err_thread(thread_id, "plan: projet introuvable")];
        };
        let raw = msg
            .get("fileName")
            .and_then(Value::as_str)
            .unwrap_or("plan");
        let raw = raw.strip_suffix(".md").unwrap_or(raw);
        let stem = raw
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                    character
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .trim_matches('-')
            .chars()
            .take(80)
            .collect::<String>();
        std::path::PathBuf::from(thread.project_root)
            .join(".plan")
            .join(format!(
                "{}.md",
                if stem.is_empty() { "plan" } else { &stem }
            ))
    };
    if let Some(parent) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return vec![err_thread(thread_id, format!("plan: {error}"))];
        }
    }
    if let Err(error) = std::fs::write(&path, markdown) {
        return vec![err_thread(thread_id, format!("plan: {error}"))];
    }
    vec![json_msg(json!({
        "type":"planSaved",
        "threadId":thread_id,
        "planId":msg.get("planId"),
        "path":path.to_string_lossy(),
        "scope":if export { "export" } else { "project" },
    }))]
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
    let stamp = iso_now()
        .chars()
        .take(16)
        .collect::<String>()
        .replace([':', 'T'], "-");
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
    let from = msg
        .get("fromThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let new_id = msg
        .get("newThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if from.is_empty() || new_id.is_empty() {
        return vec![err("fork: fromThreadId et newThreadId requis")];
    }
    let src = state.threads().lock().await.get(from).cloned();
    let Some(src) = src else {
        return vec![err("fork indisponible pour ce chat")];
    };
    let lines = msg
        .get("contextEvents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|event| {
            let text = event.get("text")?.as_str()?.trim();
            if text.is_empty() {
                return None;
            }
            match event.get("kind").and_then(Value::as_str) {
                Some("user") => Some(format!("Utilisateur : {text}")),
                Some("text") => Some(format!("Agent ({}) : {text}", src.provider)),
                _ => None,
            }
        })
        .collect::<Vec<_>>();
    let mut transcript = lines.join("\n\n");
    const MAX_CONTEXT_CHARS: usize = 400_000;
    if transcript.chars().count() > MAX_CONTEXT_CHARS {
        transcript = format!(
            "[…début tronqué…]\n{}",
            transcript
                .chars()
                .rev()
                .take(MAX_CONTEXT_CHARS)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        );
    }
    let fork_context = if transcript.is_empty() {
        Value::Null
    } else {
        Value::String(format!(
            "Tu reprends une conversation commencée avec un autre agent. Voici le fil jusqu'ici — prends-le comme contexte acquis, ne le résume pas, ne le répète pas :\n\n---\n{transcript}\n=== fin du fil transmis — message réel ci-dessous ===\n\n"
        ))
    };
    let title = format!(
        "⑂ {}",
        if src.title.is_empty() {
            "fork"
        } else {
            &src.title
        }
    );
    let patch = json!({
        "id": new_id,
        "projectRoot": src.project_root,
        "provider": src.provider,
        "title": title,
        // Le backend Rust emploie un fork contextuel sûr pour tous les
        // providers : aucune session native n'est partagée avec la branche.
        "sessionId": null,
        "forkPending": false,
        "forkContext": fork_context,
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
    let thread = state.threads().lock().await.get(thread_id).cloned();
    let Some(thread) = thread else {
        return vec![err_thread(thread_id, "revert indisponible")];
    };
    let scope = if msg.get("scope").and_then(Value::as_str) == Some("files") {
        "files"
    } else {
        "thread"
    };
    if let Some(sha) = msg.get("snapshotSha").and_then(Value::as_str) {
        let turn_id = msg.get("turnId").and_then(Value::as_str);
        let valid = state.journal().materialize(thread_id).iter().any(|event| {
            event.get("kind").and_then(Value::as_str) == Some("done")
                && event
                    .pointer("/checkpoint/snapshotSha")
                    .and_then(Value::as_str)
                    == Some(sha)
                && turn_id.is_none_or(|turn| {
                    event.pointer("/meta/turnId").and_then(Value::as_str) == Some(turn)
                })
        });
        if !valid || thread.project_root.is_empty() {
            return vec![err_thread(thread_id, "checkpoint introuvable")];
        }
        let root = thread.project_root.clone();
        let sha_owned = sha.to_string();
        match tokio::task::spawn_blocking(move || git_restore(&root, &sha_owned)).await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => return vec![err_thread(thread_id, error.to_string())],
            Err(error) => return vec![err_thread(thread_id, error.to_string())],
        }
        let git_changed = json_msg(json!({
            "type":"gitChanged","threadId":thread_id,"projectRoot":thread.project_root,
        }));
        state.publish(git_changed);
        if scope == "files" {
            return vec![json_msg(json!({
                "type":"reverted","threadId":thread_id,"scope":"files","snapshotSha":sha,
            }))];
        }
    } else if scope == "files" {
        return vec![err_thread(thread_id, "checkpoint introuvable")];
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
    let out = json_msg(json!({"type":"reverted","threadId": thread_id,"scope":"thread"}));
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
            inputs: None,
            project_root: std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()),
            session_id: prev.map(|s| s.session_id),
            model,
            effort,
            permission_mode: Some("bypassPermissions".into()),
            mode: atelier_providers::SendMode::Normal,
            on_event,
            on_interaction: None,
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
    let title = msg.get("title").and_then(|v| v.as_str()).unwrap_or("");
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
            let _ = store.upsert(json!({"id": thread_id, "sessionId": Value::Null}), false);
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
        let result =
            atelier_providers::generate_image(&app_dir, &prompt, &size, edit_uri.as_deref()).await;
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
    format!(
        "{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{:03}Z",
        ms % 1000
    )
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
        // `api_providers.json` contient aussi des credentials spécialisés
        // (ex. byteplus-images) qui ne sont pas des providers de chat. Le
        // frontend Providers attend un endpoint + au moins un modèle : ne
        // jamais lui exposer ces entrées auxiliaires.
        .filter(|p| {
            p.get("baseURL")
                .or_else(|| p.get("baseUrl"))
                .or_else(|| p.get("base_url"))
                .and_then(Value::as_str)
                .is_some_and(|base| !base.trim().is_empty())
                && p.get("models")
                    .and_then(Value::as_array)
                    .is_some_and(|models| !models.is_empty())
        })
        .map(|mut p| {
            if let Some(obj) = p.as_object_mut() {
                let has_key = obj
                    .get("apiKey")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                let env_key_set = obj
                    .get("apiKeyEnv")
                    .and_then(|v| v.as_str())
                    .and_then(|name| std::env::var(name).ok())
                    .is_some_and(|value| !value.is_empty());
                let model_entries = obj
                    .get("models")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut model_ids = Vec::new();
                let mut model_reasoning = serde_json::Map::new();
                for model in model_entries {
                    let (id, reasoning) = if let Some(id) = model.as_str() {
                        (Some(id.to_string()), None)
                    } else {
                        (
                            model
                                .get("id")
                                .or_else(|| model.get("name"))
                                .and_then(Value::as_str)
                                .map(str::to_string),
                            model.get("reasoning").cloned(),
                        )
                    };
                    let Some(id) = id.filter(|id| !id.is_empty()) else {
                        continue;
                    };
                    if let Some(reasoning) = reasoning {
                        model_reasoning.insert(id.clone(), reasoning);
                    }
                    model_ids.push(id);
                }
                obj.remove("apiKey");
                // Nom partagé avec le backend Node et le contrat Settings.
                obj.insert("keySet".into(), json!(has_key || env_key_set));
                obj.insert("models".into(), json!(model_ids));
                obj.insert("modelReasoning".into(), Value::Object(model_reasoning));
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
        if let Some(prev) = list
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
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
    use crate::state::InteractionWaiter;
    use atelier_workspace::GitFile;
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

    fn state_with_server_dir(dir: &std::path::Path, server_dir: String) -> AppState {
        AppState::new(
            AppPaths::from_app_dir(dir.to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            server_dir,
        )
    }

    #[tokio::test]
    async fn kb_add_erreurs_propres_kind_et_cli_absent() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        // kind manquant → kbError local, sans spawn
        let out = route_ws(&s, r#"{"type":"kbAdd"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbError");
        assert!(v["message"].as_str().unwrap().contains("kind requis"));
        // server_dir=/tmp sans kb_cli.mjs → kbError explicite
        let out = route_ws(&s, r#"{"type":"kbAdd","kind":"web","origin":"https://x.org","text":"t"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbError");
        assert!(v["message"].as_str().unwrap().contains("kb_cli.mjs introuvable"));
    }

    #[tokio::test]
    async fn gbrain_search_echec_en_place_jamais_kb_error() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        // requête vide → réponse en place
        let out = route_ws(&s, r#"{"type":"gbrainSearch","query":"  "}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "gbrainResults");
        assert_eq!(v["results"].as_array().unwrap().len(), 0);
        // server_dir=/tmp sans kb_cli.mjs → error portée par gbrainResults
        let out = route_ws(&s, r#"{"type":"gbrainSearch","query":"albédo"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "gbrainResults");
        assert!(v["error"].as_str().unwrap().contains("kb_cli.mjs introuvable"));
    }

    #[tokio::test]
    async fn kb_promote_page_erreurs_propres() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let out = route_ws(&s, r#"{"type":"kbPromotePage"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbError");
        assert!(v["message"].as_str().unwrap().contains("id requis"));
        // server_dir=/tmp sans kb_cli.mjs → kbError explicite, jamais d'écriture
        let out = route_ws(&s, r#"{"type":"kbPromotePage","id":"x","write":true}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbError");
        assert!(v["message"].as_str().unwrap().contains("kb_cli.mjs introuvable"));
    }

    #[tokio::test]
    async fn kb_promote_erreurs_propres() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        // id manquant
        let out = route_ws(&s, r#"{"type":"kbPromote"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbError");
        assert!(v["message"].as_str().unwrap().contains("id requis"));
        // source inconnue (registre vide) — testé AVANT la résolution gbrain
        let out = route_ws(&s, r#"{"type":"kbPromote","id":"absent"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbError");
        assert!(v["message"].as_str().unwrap().contains("Source inconnue"));
    }

    #[tokio::test]
    async fn kb_add_reel_via_cli_node_stdin() {
        // Gated : sans node on ne peut pas exercer le CLI réel.
        if kb_node_bin().is_none() {
            return;
        }
        let sidecar = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../sidecar");
        if !sidecar.join("kb_cli.mjs").is_file() {
            return;
        }
        let dir = tempdir().unwrap();
        let s = state_with_server_dir(dir.path(), sidecar.to_string_lossy().into_owned());
        let msg = json!({
            "type": "kbAdd",
            "kind": "web",
            "origin": "https://exemple.org/parite",
            "title": "Parité Rust",
            "text": "Texte capturé transmis par stdin au CLI, assez long pour être indexé sans problème.",
        });
        let out = route_ws(&s, &msg.to_string()).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbAdded", "réponse: {v}");
        assert_eq!(v["source"]["kind"], "web");
        assert_eq!(v["source"]["title"], "Parité Rust");
        assert_eq!(v["refreshed"], false);
        // le CLI a bien écrit dans l'APP_DIR du serveur (env ATELIER_APP_DIR)
        assert!(dir.path().join("knowledge/knowledge.json").is_file());

        // list → la source épinglée est visible
        let source_id = v["source"]["id"].as_str().unwrap().to_string();
        let out = route_ws(&s, r#"{"type":"kbList"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbSources", "réponse: {v}");
        assert_eq!(v["sources"].as_array().unwrap().len(), 1);
        assert_eq!(v["sources"][0]["id"], source_id.as_str());

        // un thread référence la source → remove doit purger ses champs kb
        let attach = json!({"type": "upsertThread", "thread": {
            "id": "t-purge", "provider": "codex",
            "kbSourceIds": [source_id, "autre"], "kbFullContent": [source_id],
        }});
        route_ws(&s, &attach.to_string()).await;

        // remove → liste à jour vide + threads purgés broadcastés
        let remove = json!({"type": "kbRemove", "id": source_id});
        let out = route_ws(&s, &remove.to_string()).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "kbSources", "réponse: {v}");
        assert_eq!(v["sources"].as_array().unwrap().len(), 0);
        let threads: Value = serde_json::from_str(&out[1]).unwrap();
        assert_eq!(threads["type"], "threads", "réponse: {threads}");
        let thread = threads["threads"].as_array().unwrap().iter()
            .find(|t| t["id"] == "t-purge").expect("thread présent");
        assert_eq!(thread["kbSourceIds"], json!(["autre"]));
        assert_eq!(thread["kbFullContent"], json!([]));
    }

    #[tokio::test]
    async fn upsert_thread_persiste_les_champs_kb() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let msg = json!({"type": "upsertThread", "thread": {
            "id": "t-kb", "provider": "codex",
            "kbSourceIds": ["9c81", "gbrain"], "kbFullContent": ["9c81"],
        }});
        let out = route_ws(&s, &msg.to_string()).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "threads", "réponse: {v}");
        let thread = v["threads"].as_array().unwrap().iter()
            .find(|t| t["id"] == "t-kb").expect("thread présent");
        assert_eq!(thread["kbSourceIds"], json!(["9c81", "gbrain"]));
        assert_eq!(thread["kbFullContent"], json!(["9c81"]));
        // patch partiel ultérieur : les champs kb survivent au merge
        let rename = json!({"type": "upsertThread", "thread": {"id": "t-kb", "title": "Renommé"}});
        let out = route_ws(&s, &rename.to_string()).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        let thread = v["threads"].as_array().unwrap().iter()
            .find(|t| t["id"] == "t-kb").expect("thread présent");
        assert_eq!(thread["title"], "Renommé");
        assert_eq!(thread["kbSourceIds"], json!(["9c81", "gbrain"]));
    }

    #[test]
    fn api_provider_public_list_excludes_auxiliary_image_credentials() {
        let dir = tempdir().unwrap();
        std::fs::write(
            dir.path().join("api_providers.json"),
            serde_json::to_vec(&json!([
                {
                    "id": "openrouter",
                    "label": "OpenRouter",
                    "baseURL": "https://openrouter.ai/api/v1",
                    "models": [{
                        "id": "openrouter/auto",
                        "reasoning": {"supported_efforts": ["low", "high"]}
                    }],
                    "apiKey": "secret"
                },
                {
                    "id": "byteplus-images",
                    "apiKey": "image-secret",
                    "apiKeyEnv": "ARK_API_KEY"
                }
            ]))
            .unwrap(),
        )
        .unwrap();

        let list = list_api_providers_public(dir.path());
        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["id"], "openrouter");
        assert_eq!(list[0]["keySet"], true);
        assert_eq!(list[0]["models"], json!(["openrouter/auto"]));
        assert_eq!(
            list[0]["modelReasoning"]["openrouter/auto"]["supported_efforts"],
            json!(["low", "high"])
        );
        assert!(list[0].get("apiKey").is_none());
    }

    #[test]
    fn commit_context_is_bounded_and_does_not_read_file_contents() {
        let status = GitStatus {
            branch: Some("main".into()),
            ahead: 0,
            behind: 0,
            files: vec![
                GitFile {
                    path: "scripts/analysis/model.py".into(),
                    status: ".M".into(),
                    original_path: None,
                    add: Some(12),
                    del: Some(2),
                },
                GitFile {
                    path: "outputs/large-result.bin".into(),
                    status: "?".into(),
                    original_path: None,
                    add: None,
                    del: None,
                },
            ],
        };
        let context = commit_generation_context(&status, false).unwrap();
        assert!(context.contains("2 files"));
        assert!(context.contains("scripts/analysis/model.py (+12 -2)"));
        assert!(context.contains("outputs/large-result.bin"));
        assert!(commit_generation_context(&status, true).is_none());
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
    async fn narval_status_preserves_request_id_and_rejects_unknown_profiles() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let out = route_ws(
            &s,
            r#"{"type":"narvalStatus","profile":"other","requestId":"narval-1"}"#,
        )
        .await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["type"], "narvalStatus");
        assert_eq!(v["requestId"], "narval-1");
        assert_eq!(v["error"]["code"], "invalid_profile");
        assert!(v.get("data").is_none());
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

        let out = route_ws(&s, r#"{"type":"renameThread","threadId":"t1","title":"B"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(v["threads"][0]["title"], "B");

        let out = route_ws(&s, r#"{"type":"deleteThread","threadId":"t1"}"#).await;
        let v: Value = serde_json::from_str(&out[0]).unwrap();
        assert!(v["threads"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn fork_grok_creates_an_independent_contextual_thread() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        s.threads()
            .lock()
            .await
            .upsert(
                json!({
                    "id":"grok-source",
                    "title":"Source Grok",
                    "provider":"grok",
                    "sessionId":"native-source"
                }),
                false,
            )
            .unwrap();

        let out = route_ws(
            &s,
            &json!({
                "type":"forkThread",
                "fromThreadId":"grok-source",
                "newThreadId":"grok-fork",
                "contextEvents":[
                    {"kind":"user","text":"question source"},
                    {"kind":"text","text":"réponse source"}
                ]
            })
            .to_string(),
        )
        .await;

        assert!(out[0].contains("grok-fork"), "{out:?}");
        let fork = s.threads().lock().await.get("grok-fork").cloned().unwrap();
        assert_eq!(fork.provider, "grok");
        assert!(fork.session_id.is_none());
        assert!(fork.extra["forkContext"]
            .as_str()
            .unwrap()
            .contains("réponse source"));
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

        let out = route_ws(&s, r#"{"type":"saveSettings","settings":{"theme":"dark"}}"#).await;
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

    #[tokio::test]
    async fn interaction_response_requires_the_matching_thread_and_client() {
        let dir = tempdir().unwrap();
        let s = state(dir.path());
        let (tx, rx) = tokio::sync::oneshot::channel();
        s.interaction_waiters().lock().await.insert(
            "request-1".into(),
            InteractionWaiter {
                thread_id: "thread-1".into(),
                client_instance_id: Some("11111111-1111-4111-8111-111111111111".into()),
                tx,
            },
        );

        route_ws(&s, r#"{"type":"interactionResponse","threadId":"other","clientInstanceId":"11111111-1111-4111-8111-111111111111","requestId":"request-1","response":{"allow":false}}"#).await;
        assert!(s
            .interaction_waiters()
            .lock()
            .await
            .contains_key("request-1"));

        route_ws(&s, r#"{"type":"interactionResponse","threadId":"thread-1","clientInstanceId":"11111111-1111-4111-8111-111111111111","requestId":"request-1","response":{"allow":true,"scope":"session"}}"#).await;
        assert_eq!(rx.await.unwrap(), json!({"allow":true,"scope":"session"}));
        assert!(s.approval_sessions().lock().await.contains("thread-1"));
    }

    #[tokio::test]
    async fn save_plan_writes_a_project_plan_artifact() {
        let dir = tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let s = state(dir.path());
        s.threads()
            .lock()
            .await
            .upsert(
                json!({
                    "id":"plan-thread",
                    "provider":"claude",
                    "projectRoot":project.to_string_lossy(),
                }),
                false,
            )
            .unwrap();

        let out = route_ws(
            &s,
            &json!({
                "type":"savePlan",
                "threadId":"plan-thread",
                "planId":"plan-1",
                "fileName":"audit complet",
                "markdown":"# Plan\n\n1. Auditer",
            })
            .to_string(),
        )
        .await;
        let value: Value = serde_json::from_str(&out[0]).unwrap();
        let path = std::path::PathBuf::from(value["path"].as_str().unwrap());
        assert_eq!(value["type"], "planSaved");
        assert_eq!(path, project.join(".plan/audit-complet.md"));
        assert_eq!(
            std::fs::read_to_string(path).unwrap(),
            "# Plan\n\n1. Auditer"
        );
    }

    #[tokio::test]
    async fn files_only_revert_restores_checkpoint_and_keeps_journal() {
        let dir = tempdir().unwrap();
        let project = dir.path().join("repo");
        std::fs::create_dir_all(&project).unwrap();
        std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&project)
            .status()
            .unwrap();
        let file = project.join("note.txt");
        std::fs::write(&file, "avant\n").unwrap();
        let sha = atelier_workspace::snapshot(project.to_str().unwrap()).unwrap();
        std::fs::write(&file, "après\n").unwrap();

        let s = state(dir.path());
        s.threads()
            .lock()
            .await
            .upsert(
                json!({
                    "id":"revert-thread",
                    "provider":"codex",
                    "projectRoot":project.to_string_lossy(),
                }),
                false,
            )
            .unwrap();
        s.journal().append(&json!({
            "kind":"done",
            "ok":true,
            "result":"fait",
            "checkpoint":{"snapshotSha":sha,"filesChanged":["note.txt"]},
            "meta":{
                "eventId":"done-1","sequence":1,"threadId":"revert-thread",
                "turnId":"turn-1","durable":true,"provider":"codex"
            }
        }));

        let before = s.journal().materialize("revert-thread");
        let out = route_ws(
            &s,
            &json!({
                "type":"revert","scope":"files","threadId":"revert-thread",
                "turnId":"turn-1","snapshotSha":sha,
            })
            .to_string(),
        )
        .await;
        let value: Value = serde_json::from_str(&out[0]).unwrap();
        assert_eq!(value["type"], "reverted");
        assert_eq!(value["scope"], "files");
        assert_eq!(std::fs::read_to_string(file).unwrap(), "avant\n");
        assert_eq!(s.journal().materialize("revert-thread"), before);
    }
}
