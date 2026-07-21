//! Send / interrupt orchestration (plan 033 Porte 5).

use crate::state::AppState;
use atelier_harness::EmitFn;
use atelier_providers::{provider_status_list, InteractionFn, SendMode, SendRequest};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

fn with_file_scope_instruction(prompt: String) -> String {
    format!(
        "{prompt}\n\n<atelier-file-scope>\nRepository safety policy for the current turn:\n- Treat every pre-existing worktree change as user-owned or owned by another task. Never modify, stage, commit, restore, or delete it.\n- Modify only files directly required by the user's current request. Before expanding scope, stop and ask for approval with the exact paths and reason.\n- Automated, heartbeat, monitoring, status, and wait turns are read-only. If they discover a defect, report it and stop; a standing goal or automation is not permission to patch source files.\n- Never use git add -A, git commit -a, stage all, or commit unrelated changes.\n- Do not include a file-change summary or mention whether files were modified in the final response.\n</atelier-file-scope>"
    )
}

pub(crate) fn strip_file_scope_instruction(text: &str) -> String {
    let mut out = text.to_string();
    const OPEN: &str = "<atelier-file-scope>";
    const CLOSE: &str = "</atelier-file-scope>";
    while let Some(start) = out.find(OPEN) {
        let Some(rel_end) = out[start + OPEN.len()..].find(CLOSE) else {
            break;
        };
        let end = start + OPEN.len() + rel_end + CLOSE.len();
        let remove_from = out[..start].trim_end_matches(['\r', '\n']).len();
        out.replace_range(remove_from..end, "");
    }
    out.trim().to_string()
}

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

fn should_auto_title(
    previous: Option<&atelier_store::Thread>,
    explicit_title: Option<&str>,
) -> bool {
    if explicit_title.is_some() {
        return false;
    }
    match previous {
        None => true,
        Some(thread) => thread.session_id.is_none() && is_new_chat_placeholder(&thread.title),
    }
}

fn handoff_context(events: &[Value], provider: &str) -> Option<String> {
    let mut lines = Vec::new();
    for event in events {
        let Some(text) = event
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            continue;
        };
        match event.get("kind").and_then(Value::as_str) {
            Some("user") => lines.push(format!("Utilisateur : {text}")),
            Some("text") => lines.push(format!("Agent ({provider}) : {text}")),
            _ => {}
        }
    }
    let mut transcript = lines.join("\n\n");
    if transcript.is_empty() {
        return None;
    }
    const MAX_CONTEXT_CHARS: usize = 400_000;
    if transcript.chars().count() > MAX_CONTEXT_CHARS {
        let tail = transcript
            .chars()
            .rev()
            .take(MAX_CONTEXT_CHARS)
            .collect::<String>();
        transcript = format!(
            "[…début tronqué…]\n{}",
            tail.chars().rev().collect::<String>()
        );
    }
    Some(format!(
        "Tu reprends une conversation commencée avec un autre agent. Voici le fil jusqu'ici — prends-le comme contexte acquis, ne le résume pas, ne le répète pas :\n\n---\n{transcript}\n=== fin du fil transmis — message réel ci-dessous ===\n\n"
    ))
}

async fn prepare_provider_handoff(
    state: &AppState,
    msg: &Value,
    thread_id: &str,
    provider: &str,
    project_root: &str,
) -> Result<(), String> {
    let source_id = msg
        .get("handoffFromThreadId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if source_id.is_empty() {
        return Ok(());
    }
    if source_id == thread_id {
        return Err("handoff: le fil source et la destination doivent être différents".into());
    }
    let source = {
        let store = state.threads().lock().await;
        if store.get(thread_id).is_some() {
            return Err("handoff: la destination existe déjà".into());
        }
        store
            .get(source_id)
            .cloned()
            .ok_or_else(|| "handoff: fil source introuvable".to_string())?
    };
    if source.status == "running" || state.harness().is_running(source_id).await {
        return Err("handoff: arrêter le tour source avant de changer de provider".into());
    }
    if source.provider == provider {
        return Err("handoff: le provider cible doit être différent du provider source".into());
    }
    let events = if state.journal().has_journal(source_id) {
        state.journal().materialize(source_id)
    } else {
        Vec::new()
    };
    if state.journal().has_journal(source_id)
        && !state.journal().copy_thread(source_id, thread_id, None)
    {
        return Err("handoff: copie atomique du journal impossible".into());
    }
    let patch = json!({
        "id": thread_id,
        "projectRoot": if source.project_root.is_empty() { project_root } else { &source.project_root },
        "provider": provider,
        "title": format!("↪ {}", if source.title.is_empty() { "handoff" } else { &source.title }),
        "sessionId": null,
        "status": "idle",
        "forkContext": handoff_context(&events, &source.provider),
        "handoff": {
            "sourceThreadId": source_id,
            "sourceProvider": source.provider,
            "targetProvider": provider,
        },
    });
    state
        .threads()
        .lock()
        .await
        .upsert(patch, false)
        .map(|_| ())
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
        let automation_state = state.clone();
        let automation_thread_id = thread_id.clone();
        let automation_event = event.clone();
        tokio::spawn(async move {
            crate::automations::record_thread_event(
                &automation_state,
                &automation_thread_id,
                &automation_event,
            )
            .await;
        });
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

/// `session/request_permission` ACP (Kimi) → spec d'interaction fidèle
/// (plan 046 étape 5) : les `optionId` traversent OPAQUES.
///
/// - AskUserQuestion (`toolCall.title` ou optionIds `q<i>_opt_<j>`/`q<i>_skip`)
///   ⇒ `user_input` à UNE question dont les options portent `value` = optionId
///   (l'UI affiche le label, renvoie l'id) ; Skip/fermeture ⇒ le provider
///   traduit en `cancelled`.
/// - Permission ordinaire et review de plan ⇒ `approval` avec `choices[]`
///   dynamiques dans l'ordre EXACT reçu.
/// - Sans options ⇒ None (refus sûr côté provider).
fn describe_acp_permission(params: &Value) -> Option<Value> {
    let options = params
        .get("options")
        .and_then(Value::as_array)
        .filter(|o| !o.is_empty())?;
    let title = params
        .pointer("/toolCall/title")
        .and_then(Value::as_str)
        .unwrap_or("Permission");
    // Premier contenu texte du toolCall = description/question, borné.
    let detail: String = params
        .pointer("/toolCall/content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|c| {
            c.pointer("/content/text")
                .and_then(Value::as_str)
                .or_else(|| {
                    c.get("path").and_then(Value::as_str) // diff → chemin seul, jamais le contenu
                })
        })
        .collect::<Vec<_>>()
        .join(" · ")
        .chars()
        .take(400)
        .collect();

    let is_question_id = |id: &str| {
        id.starts_with('q')
            && id[1..]
                .split_once('_')
                .map(|(n, rest)| {
                    !n.is_empty()
                        && n.chars().all(|c| c.is_ascii_digit())
                        && (rest == "skip" || rest.starts_with("opt_"))
                })
                .unwrap_or(false)
    };
    let all_question_ids = options.iter().all(|o| {
        o.get("optionId")
            .and_then(Value::as_str)
            .map(is_question_id)
            .unwrap_or(false)
    });
    if title == "AskUserQuestion" || all_question_ids {
        // Une seule question (Kimi 0.26 dégrade le multi-question) ; le Skip
        // n'est pas une option de champ : le bouton Annuler du formulaire fait
        // ce chemin (⇒ cancelled côté provider).
        let field_options: Vec<Value> = options
            .iter()
            .filter(|o| {
                o.get("kind").and_then(Value::as_str) != Some("reject_once")
                    && o.get("kind").and_then(Value::as_str) != Some("reject_always")
            })
            .map(|o| {
                json!({
                    "label": o.get("name").and_then(Value::as_str).unwrap_or("?"),
                    "value": o.get("optionId").cloned().unwrap_or(Value::Null),
                })
            })
            .collect();
        return Some(json!({
            "interactionType": "user_input",
            "title": "Kimi — question",
            "fields": [{
                "id": "q0",
                "question": if detail.is_empty() { title.to_string() } else { detail },
                "options": field_options,
                "allowOther": false,
                "secret": false,
            }],
        }));
    }

    let choices: Vec<Value> = options
        .iter()
        .map(|o| {
            json!({
                "optionId": o.get("optionId").cloned().unwrap_or(Value::Null),
                "label": o.get("name").and_then(Value::as_str).unwrap_or("?"),
                "kind": o.get("kind").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    Some(json!({
        "interactionType": "approval",
        "title": title,
        "detail": detail,
        "choices": choices,
    }))
}

fn describe_server_request(method: &str, params: &Value) -> Option<Value> {
    if method == "session/request_permission" {
        return describe_acp_permission(params);
    }
    let approval = matches!(
        method,
        "execCommandApproval"
            | "applyPatchApproval"
            | "item/commandExecution/requestApproval"
            | "item/fileChange/requestApproval"
            | "item/permissions/requestApproval"
    );
    if approval {
        let detail = params
            .get("command")
            .and_then(Value::as_str)
            .or_else(|| params.get("path").and_then(Value::as_str))
            .or_else(|| params.get("file").and_then(Value::as_str))
            .map(str::to_string)
            .or_else(|| params.get("permissions").map(Value::to_string))
            .unwrap_or_default();
        return Some(json!({
            "interactionType": "approval",
            "title": if method.contains("fileChange") || method == "applyPatchApproval" {
                "Modification de fichiers"
            } else if method == "item/permissions/requestApproval" {
                "Permissions additionnelles"
            } else {
                "Exécution de commande"
            },
            "detail": detail.chars().take(400).collect::<String>(),
            "itemId": params.get("itemId").cloned().unwrap_or(Value::Null),
        }));
    }
    if method == "item/tool/requestUserInput" {
        let fields = params
            .get("questions")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .take(3)
            .map(|question| {
                json!({
                    "id": question.get("id").and_then(Value::as_str).unwrap_or(""),
                    "question": question.get("question").and_then(Value::as_str).unwrap_or(""),
                    "header": question.get("header").cloned().unwrap_or(Value::Null),
                    "options": question.get("options").cloned().unwrap_or_else(|| json!([])),
                    "allowOther": question.get("isOther").and_then(Value::as_bool).unwrap_or(false),
                    "secret": question.get("isSecret").and_then(Value::as_bool).unwrap_or(false),
                })
            })
            .collect::<Vec<_>>();
        return Some(json!({
            "interactionType":"user_input",
            "title":"L'agent a besoin d'une réponse",
            "fields": fields,
            "itemId": params.get("itemId").cloned().unwrap_or(Value::Null),
        }));
    }
    if method == "mcpServer/elicitation/request" {
        return Some(json!({
            "interactionType":"mcp_elicitation",
            "title": format!("MCP {}", params.get("serverName").and_then(Value::as_str).unwrap_or("?")),
            "detail": params.get("message").and_then(Value::as_str).unwrap_or(""),
            "urlDomain": params.get("url").and_then(Value::as_str).unwrap_or(""),
        }));
    }
    None
}

fn summarize_interaction(spec: &Value, response: &Value) -> String {
    match spec.get("interactionType").and_then(Value::as_str) {
        Some("approval") => {
            // Choix dynamique (Kimi) : afficher le LABEL du choix, jamais un
            // contenu sensible — l'optionId brut n'apparaît qu'en repli borné.
            if let Some(oid) = response.get("optionId").and_then(Value::as_str) {
                let label = spec
                    .get("choices")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .find(|c| c.get("optionId").and_then(Value::as_str) == Some(oid))
                    .and_then(|c| c.get("label").and_then(Value::as_str))
                    .unwrap_or(oid);
                let mut out: String = label.chars().take(80).collect();
                if response.get("cancelTurn").and_then(Value::as_bool) == Some(true) {
                    out.push_str(" · tour annulé");
                }
                return out;
            }
            if response.get("cancelTurn").and_then(Value::as_bool) == Some(true) {
                "tour annulé".into()
            } else if response.get("allow").and_then(Value::as_bool) == Some(true) {
                if response.get("scope").and_then(Value::as_str) == Some("session") {
                    "toujours autorisé pour cette session".into()
                } else {
                    "autorisé une fois".into()
                }
            } else {
                "refusé".into()
            }
        }
        Some("mcp_elicitation") => {
            if response.get("action").and_then(Value::as_str) == Some("accept") {
                "accepté".into()
            } else {
                "refusé".into()
            }
        }
        _ => {
            let answers = response.get("answers").and_then(Value::as_object);
            spec.get("fields")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|field| {
                    let id = field.get("id").and_then(Value::as_str)?;
                    let answer = answers?.get(id)?.as_str()?;
                    let label = field.get("header").and_then(Value::as_str).unwrap_or(id);
                    let shown: String =
                        if field.get("secret").and_then(Value::as_bool) == Some(true) {
                            "•••".into()
                        } else {
                            // Option à valeur opaque (Kimi) : afficher le label
                            // du choix, pas l'id wire.
                            field
                                .get("options")
                                .and_then(Value::as_array)
                                .into_iter()
                                .flatten()
                                .find(|o| o.get("value").and_then(Value::as_str) == Some(answer))
                                .and_then(|o| o.get("label").and_then(Value::as_str))
                                .unwrap_or(answer)
                                .chars()
                                .take(60)
                                .collect()
                        };
                    Some(format!("{label}: {shown}"))
                })
                .collect::<Vec<_>>()
                .join(" · ")
                .chars()
                .take(200)
                .collect()
        }
    }
}

fn make_interaction_relay(
    state: AppState,
    thread_id: String,
    tx: tokio::sync::mpsc::UnboundedSender<Value>,
) -> InteractionFn {
    Arc::new(move |method: String, params: Value| {
        let state = state.clone();
        let thread_id = thread_id.clone();
        let tx = tx.clone();
        Box::pin(async move {
            let spec = describe_server_request(&method, &params)?;
            // Le cache « toujours autoriser » d'Atelier ne répond JAMAIS à la
            // place d'une permission à choix dynamiques (Kimi) : seul le choix
            // `approve_always` transmis à Kimi installe la règle de session
            // (plan 046 étape 5). Il ne court-circuite que les approbations
            // legacy oui/non (Codex).
            if spec.get("interactionType").and_then(Value::as_str) == Some("approval")
                && spec.get("choices").is_none()
                && state.approval_sessions().lock().await.contains(&thread_id)
            {
                return Some(json!({"allow":true,"scope":"session"}));
            }
            let request_id = format!("int-{}", uuid::Uuid::new_v4());
            let (answer_tx, answer_rx) = tokio::sync::oneshot::channel();
            let client_instance_id = state.client_instance_id().lock().await.clone();
            state.interaction_waiters().lock().await.insert(
                request_id.clone(),
                crate::state::InteractionWaiter {
                    thread_id: thread_id.clone(),
                    client_instance_id,
                    tx: answer_tx,
                },
            );
            let mut pending = spec.clone();
            if let Some(obj) = pending.as_object_mut() {
                obj.insert("kind".into(), json!("interaction"));
                obj.insert("requestId".into(), json!(request_id));
                obj.insert("state".into(), json!("pending"));
            }
            let _ = tx.send(pending);
            match tokio::time::timeout(std::time::Duration::from_secs(120), answer_rx).await {
                Ok(Ok(response)) => {
                    let answer_summary = summarize_interaction(&spec, &response);
                    let mut answered = spec;
                    if let Some(obj) = answered.as_object_mut() {
                        obj.insert("kind".into(), json!("interaction"));
                        obj.insert("requestId".into(), json!(request_id));
                        obj.insert("state".into(), json!("answered"));
                        obj.insert("answerSummary".into(), json!(answer_summary));
                    }
                    let _ = tx.send(answered);
                    Some(response)
                }
                _ => {
                    state.interaction_waiters().lock().await.remove(&request_id);
                    let mut expired = spec;
                    if let Some(obj) = expired.as_object_mut() {
                        obj.insert("kind".into(), json!("interaction"));
                        obj.insert("requestId".into(), json!(request_id));
                        obj.insert("state".into(), json!("expired"));
                    }
                    let _ = tx.send(expired);
                    None
                }
            }
        })
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
    let title = msg
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let first_message = first_message_for_title(msg, &prompt);

    if thread_id.is_empty() {
        return vec![err_json("threadId requis")];
    }

    let Some(provider_impl) = state.provider(&provider) else {
        return vec![err_json(format!(
            "provider inconnu ou non branché en Rust: {provider} (fake toujours; claude/codex/grok/opencode si binaires; API via api_providers.json)"
        ))];
    };
    if let Err(error) =
        prepare_provider_handoff(state, msg, &thread_id, &provider, &project_root).await
    {
        return vec![err_json(error)];
    }

    let previous = state.threads().lock().await.get(&thread_id).cloned();
    if msg.get("origin").and_then(Value::as_str) == Some("agent_link") {
        let from = msg
            .get("agentFromThreadId")
            .and_then(Value::as_str)
            .unwrap_or("");
        let to = msg
            .get("agentToThreadId")
            .and_then(Value::as_str)
            .unwrap_or("");
        let relation_is_live = {
            let store = state.threads().lock().await;
            store.get(from).is_some()
                && store.get(to).is_some()
                && (store
                    .get(to)
                    .and_then(|thread| thread.agent_link.as_ref())
                    .is_some_and(|link| link.parent_thread_id == from)
                    || store
                        .get(from)
                        .and_then(|thread| thread.agent_link.as_ref())
                        .is_some_and(|link| link.parent_thread_id == to))
        };
        if !relation_is_live {
            return vec![err_json("agent_link_relation_revoked")];
        }
    }
    if previous.as_ref().is_some_and(|thread| {
        thread.provider != provider
            && (thread.session_id.is_some() || state.journal().has_journal(&thread_id))
    }) {
        let current = previous
            .as_ref()
            .map(|thread| thread.provider.as_str())
            .unwrap_or("unknown");
        return vec![err_json(format!(
            "provider immuable pour ce fil ({current}); créer un handoff vers {provider}"
        ))];
    }
    let auto_title = should_auto_title(previous.as_ref(), title.as_deref());
    let last_turn = previous
        .as_ref()
        .and_then(|thread| thread.extra.get("lastTurn"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    let same_provider =
        last_turn.get("provider").and_then(Value::as_str) == Some(provider.as_str());
    let permission_mode = msg
        .get("permissionMode")
        .and_then(|v| v.as_str())
        .or_else(|| last_turn.get("permissionMode").and_then(Value::as_str))
        .map(str::to_string);
    let provisional_title = first_message.chars().take(40).collect::<String>();

    let provider_prompt = previous
        .as_ref()
        .and_then(|thread| thread.extra.get("forkContext"))
        .and_then(Value::as_str)
        .filter(|context| !context.is_empty())
        .map(|context| format!("{context}{prompt}"))
        .unwrap_or_else(|| prompt.clone());
    let provider_prompt = with_file_scope_instruction(provider_prompt);
    // Cadence d'injection (2026-07-19) : ces blocs étaient REcollés à chaque
    // message alors que l'historique natif du provider les conserve tous — une
    // conversation Kimi à 7 sources a dépassé les 2 Mo de la limite API. Les
    // instructions statiques (galerie, zotero) ne partent qu'au PREMIER tour de
    // la session provider ; le bloc KB repart seulement si son hash change.
    // blocksSeededFor suit la session réellement utilisée : une session neuve
    // (repli provider) re-sème tout au tour suivant.
    let prev_session = previous
        .as_ref()
        .and_then(|t| t.session_id.clone())
        .filter(|s| !s.is_empty());
    let seeded = prev_session.is_some()
        && previous
            .as_ref()
            .and_then(|t| t.extra.get("blocksSeededFor"))
            .and_then(Value::as_str)
            == prev_session.as_deref();
    let provider_prompt = if seeded {
        provider_prompt
    } else {
        let p = with_gallery_tool_instruction(provider_prompt, &project_root, state.server_dir());
        with_zotero_passage_instruction(p, state.server_dir())
    };
    // Bloc base de connaissances (plan 049 T4) : sources attachées au thread —
    // ne bloque jamais un envoi (dégrade en prompt inchangé / fiches).
    let pre_kb = provider_prompt.clone();
    let kb_enriched = crate::kb_block::with_kb_block_for_thread(
        provider_prompt,
        state.app_dir(),
        state.server_dir(),
        previous.as_ref().map(|thread| &thread.extra),
    );
    let mut turn_kb_hash: Option<String> = None;
    let provider_prompt = if kb_enriched.len() > pre_kb.len() {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        kb_enriched[pre_kb.len()..].hash(&mut hasher);
        let hash = format!("{:016x}", hasher.finish());
        let prev_hash = previous
            .as_ref()
            .and_then(|t| t.extra.get("kbBlockHash"))
            .and_then(Value::as_str);
        let inject = !seeded || prev_hash != Some(hash.as_str());
        turn_kb_hash = Some(hash);
        if inject {
            kb_enriched
        } else {
            pre_kb
        }
    } else {
        kb_enriched
    };

    // Plan 057: first-turn envelope for linked child (not shown in user bubble).
    let needs_agent_seed = previous
        .as_ref()
        .and_then(|t| t.agent_link.as_ref())
        .is_some()
        && previous
            .as_ref()
            .and_then(|t| t.extra.get("agentContextSeededAt"))
            .is_none();
    let provider_prompt = if needs_agent_seed {
        if let Some(env) = crate::agent_mcp::maybe_child_envelope(state, &thread_id).await {
            format!("{env}{provider_prompt}")
        } else {
            provider_prompt
        }
    } else {
        provider_prompt
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
    let origin_agent = msg.get("origin").and_then(|v| v.as_str()) == Some("agent_link");
    // Linked-agent deliveries must not create a second user bubble.
    let user_event = if origin_agent {
        json!({"kind":"agent_message","text": prompt, "status":"delivering", "direction":"received"})
    } else {
        normalize_display_event(msg)
    };
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
            let interaction =
                make_interaction_relay(state.clone(), thread_id.clone(), ev_tx.clone());
            let req = SendRequest {
                thread_id: thread_id.clone(),
                turn_id: turn_id.clone(),
                prompt: with_file_scope_instruction(prompt.clone()),
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
                on_interaction: Some(interaction),
                is_cancelled: Arc::new(move || cancelled_probe.load(Ordering::SeqCst)),
                atelier_mcp: None,
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
    if let Err(error) = state
        .acquire_project_writer(
            &project_root,
            &thread_id,
            permission_mode.as_deref() != Some("plan"),
        )
        .await
    {
        let _ = state
            .threads()
            .lock()
            .await
            .upsert(json!({"id":thread_id,"status":"idle"}), true);
        return vec![err_json(error)];
    }
    let snapshot_sha = if project_root.is_empty() {
        None
    } else {
        let root = project_root.clone();
        tokio::task::spawn_blocking(move || atelier_workspace::snapshot(&root))
            .await
            .ok()
            .and_then(Result::ok)
    };
    if let Some(snapshot) = snapshot_sha.as_ref() {
        let _ = state
            .threads()
            .lock()
            .await
            .upsert(json!({"id":thread_id,"lastSnapshot":snapshot}), true);
    }
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
        .or_else(|| {
            same_provider
                .then(|| last_turn.get("model").and_then(Value::as_str))
                .flatten()
        })
        .map(str::to_string);
    let effort = msg
        .get("effort")
        .and_then(|v| v.as_str())
        .or_else(|| {
            same_provider
                .then(|| last_turn.get("effort").and_then(Value::as_str))
                .flatten()
        })
        .map(str::to_string);
    if msg.get("permissionMode").and_then(Value::as_str).is_some() {
        let _ = state.threads().lock().await.upsert(
            json!({
                "id": thread_id,
                "lastTurn": {
                    "provider": provider,
                    "model": msg.get("model").cloned().unwrap_or(Value::Null),
                    "effort": msg.get("effort").cloned().unwrap_or(Value::Null),
                    "permissionMode": msg.get("permissionMode").cloned().unwrap_or(Value::Null),
                }
            }),
            true,
        );
    }

    // Event pump
    let h_pump = Arc::clone(&h2);
    let turn_pump = turn_id.clone();
    let project_root_events = project_root.clone();
    let permission_mode_events = permission_mode.clone();
    let snapshot_events = snapshot_sha.clone();
    let linked_reply = if origin_agent {
        let from = msg
            .get("agentFromThreadId")
            .and_then(Value::as_str)
            .unwrap_or("");
        let to = msg
            .get("agentToThreadId")
            .and_then(Value::as_str)
            .unwrap_or("");
        (to == thread_id && !from.is_empty()).then(|| {
            (
                from.to_string(),
                thread_id.clone(),
                provider.clone(),
                client_mid
                    .as_deref()
                    .and_then(|id| id.strip_prefix("agent:"))
                    .unwrap_or(&turn_id)
                    .to_string(),
            )
        })
    } else {
        None
    };
    let linked_reply_state = state.clone();
    let pump = tokio::spawn(async move {
        let mut linked_reply_text = String::new();
        while let Some(ev) = ev_rx.recv().await {
            let ev = normalize_provider_event(
                ev,
                &project_root_events,
                permission_mode_events.as_deref(),
                snapshot_events.as_deref(),
            );
            if let Some((source_thread_id, peer_thread_id, peer_provider, message_id)) =
                linked_reply.as_ref()
            {
                let kind = ev.get("kind").and_then(Value::as_str).unwrap_or("");
                let mirrored_text = match kind {
                    "text" => ev.get("text").and_then(Value::as_str).map(|text| {
                        if !linked_reply_text.is_empty() {
                            linked_reply_text.push('\n');
                        }
                        linked_reply_text.push_str(text);
                        linked_reply_text.as_str()
                    }),
                    "error" => ev.get("message").and_then(Value::as_str),
                    _ => None,
                };
                if let Some(text) = mirrored_text.filter(|text| !text.trim().is_empty()) {
                    let sequence = linked_reply_state.journal().last_sequence(source_thread_id) + 1;
                    let mirrored = json!({
                        "kind": "agent_message",
                        "messageId": message_id,
                        "direction": "received",
                        "peerThreadId": peer_thread_id,
                        "peerProvider": peer_provider,
                        "messageKind": "report",
                        "text": text,
                        "status": if kind == "error" { "failed" } else { "delivered" },
                        "meta": {
                            "threadId": source_thread_id,
                            "sequence": sequence,
                            "eventId": uuid::Uuid::new_v4().to_string(),
                            "ts": std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|duration| duration.as_millis() as i64)
                                .unwrap_or(0),
                        }
                    });
                    let _ = linked_reply_state.journal().append(&mirrored);
                    linked_reply_state.publish(crate::ws_router::json_msg(json!({
                        "type": "event",
                        "threadId": source_thread_id,
                        "event": mirrored,
                    })));
                }
            }
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

    // Plan 057: issue scoped MCP capability for linked threads on compatible providers.
    let atelier_mcp = {
        let linked = previous
            .as_ref()
            .and_then(|t| t.agent_link.as_ref())
            .is_some()
            || {
                let store = state.threads().lock().await;
                !store.children_of(&thread_id).is_empty()
            };
        if linked && crate::agent_mcp::is_mcp_compatible_provider(&provider) {
            match crate::agent_mcp::issue_mcp_launch(
                state,
                &thread_id,
                &project_root,
                &provider,
                session_id.clone(),
                crate::agent_mcp::provider_label(&provider),
            )
            .await
            {
                Ok(launch) => Some(atelier_providers::AtelierMcpLaunch {
                    command: std::path::PathBuf::from(launch.command),
                    server_name: launch.server_name,
                    env: launch.env,
                }),
                Err(e) => {
                    tracing::warn!(error = %e, "atelier MCP launch unavailable");
                    None
                }
            }
        } else {
            None
        }
    };

    tokio::spawn(async move {
        let fallback_root = project_root.clone();
        let fallback_snapshot = snapshot_sha.clone();
        let interaction = make_interaction_relay(state2.clone(), tid.clone(), ev_tx.clone());
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
            on_interaction: Some(interaction),
            is_cancelled: Arc::new(move || cancelled_probe.load(Ordering::SeqCst)),
            atelier_mcp,
        };
        let result = pimpl.send(req).await;
        // Quand send() retourne, tous les clones d'ev_tx (on_event, relais
        // d'interaction) sont droppés → le channel se ferme et la pompe finit
        // de transférer TOUT ce que le provider a émis. L'attendre avant le
        // check évite la course « done synthétique avant le text final du
        // provider » (bulle dupliquée + usage perdu, vu en réel avec opencode
        // ACP le 2026-07-16). Borné : un provider qui retiendrait son
        // on_event ne doit pas geler le tour (comportement d'avant en repli).
        let _ = tokio::time::timeout(std::time::Duration::from_secs(2), pump).await;
        // force terminal if needed (providers sans done natif, ex. fake)
        {
            let mut g = h2.lock().await;
            if g.turn_status(&turn_id) != Some(atelier_harness::TurnStatus::Done) {
                if result.ok {
                    g.terminal(
                        &turn_id,
                        normalize_provider_event(
                            json!({"kind":"done","ok":true,"result":""}),
                            &fallback_root,
                            None,
                            fallback_snapshot.as_deref(),
                        ),
                    );
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
        if succeeded && needs_agent_seed {
            crate::agent_mcp::mark_context_seeded(&state2, &tid).await;
        }
        if let Some(sid) = result.session_id {
            let mut store = state2.threads().lock().await;
            let mut patch = json!({"id": tid, "sessionId": sid.clone(), "status": "idle",
                "blocksSeededFor": sid, "kbBlockHash": turn_kb_hash});
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
        state2.release_project_writer(&fallback_root, &tid).await;
        // Plan 057: schedule mailbox drain on a detached task (handle_send is re-entrant).
        let drain_state = state2.clone();
        tokio::spawn(async move {
            crate::agent_mailbox::drain_mailbox(&drain_state).await;
        });
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

fn normalize_provider_event(
    mut event: Value,
    project_root: &str,
    permission_mode: Option<&str>,
    snapshot_sha: Option<&str>,
) -> Value {
    if permission_mode == Some("plan") && event.get("kind").and_then(Value::as_str) == Some("text")
    {
        return json!({
            "kind":"proposed_plan",
            "planId": format!("plan-{}", uuid::Uuid::new_v4()),
            "markdown": event.get("text").and_then(Value::as_str).unwrap_or(""),
            "source":"plan-mode",
        });
    }
    if event.get("kind").and_then(Value::as_str) == Some("done") {
        let files_changed = snapshot_sha
            .and_then(|sha| atelier_workspace::changed_since(project_root, sha).ok())
            .unwrap_or_default();
        if let Some(obj) = event.as_object_mut() {
            obj.insert("projectRoot".into(), json!(project_root));
            obj.insert("filesChanged".into(), json!(files_changed));
            if let Some(sha) = snapshot_sha {
                obj.insert(
                    "checkpoint".into(),
                    json!({
                        "snapshotSha":sha,
                        "filesChanged":files_changed,
                    }),
                );
            }
        }
        return event;
    }
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
            let original = match file {
                Value::String(path) => path.clone(),
                Value::Object(obj) => obj.get("path")?.as_str()?.to_string(),
                _ => return None,
            };
            let path = root_prefix
                .as_deref()
                .and_then(|prefix| original.strip_prefix(prefix))
                .unwrap_or(&original)
                .to_string();
            let add = file.get("add").and_then(Value::as_i64);
            let del = file.get("del").and_then(Value::as_i64);
            let mut entry = json!({"path": path, "add": add, "del": del});
            // avant/après fournis par le provider (diff immédiat sans git) —
            // clé = chemin ORIGINAL de event.files, porté sur l'entrée normalisée
            if let Some(sn) = event.get("snippets").and_then(|s| s.get(&original)) {
                if let Some(new_text) = sn.get("newText").and_then(Value::as_str) {
                    let obj = entry.as_object_mut().expect("entry objet");
                    obj.insert("newText".into(), json!(new_text));
                    if let Some(old_text) = sn.get("oldText").and_then(Value::as_str) {
                        obj.insert("oldText".into(), json!(old_text));
                    }
                }
            }
            Some(entry)
        })
        .collect::<Vec<_>>();
    if let Some(obj) = event.as_object_mut() {
        obj.insert("files".into(), Value::Array(files));
        // le canal provider `snippets` ne fait pas partie du contrat AgentEvent :
        // son contenu vit désormais dans files[].oldText/newText
        obj.remove("snippets");
        obj.insert(
            "projectRoot".into(),
            if project_root.is_empty() {
                Value::Null
            } else {
                Value::String(project_root.to_string())
            },
        );
        obj.insert(
            "baseSha".into(),
            snapshot_sha
                .map(|sha| Value::String(sha.to_string()))
                .unwrap_or(Value::Null),
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
        let live = state.provider(&provider.id);
        let installed = live.is_some();
        provider.ok = installed;
        if installed && provider.version.is_none() {
            provider.version = Some("ok".into());
        }
        // Catalogue vivant (kimi, plan 046 étape 6) : modèles découverts +
        // thinking off/on par modèle confirmé — jamais de liste en dur.
        if let Some(p) = live {
            if let Some(dynamic) = p.dynamic_models().await {
                if let Some(models) = dynamic.get("models").and_then(Value::as_array) {
                    if !models.is_empty() {
                        provider.models = models
                            .iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect();
                        if let Some(default) = dynamic
                            .get("defaultModel")
                            .and_then(Value::as_str)
                            .filter(|value| !value.is_empty())
                        {
                            // Un catalogue vivant prime sur le fallback
                            // statique (Grok/Kimi peuvent changer de défaut
                            // après une mise à jour ou une configuration CLI).
                            provider.default_model = default.to_string();
                        }
                    }
                }
                if let Some(reasoning) = dynamic.get("modelReasoning") {
                    if reasoning
                        .as_object()
                        .map(|o| !o.is_empty())
                        .unwrap_or(false)
                    {
                        provider.model_reasoning = reasoning.clone();
                    }
                }
            }
        }
    }
    vec![
        serde_json::to_string(&json!({"type":"providerStatus","providers": list}))
            .unwrap_or_else(|_| r#"{"type":"error","message":"serialize"}"#.into()),
    ]
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
            events
                .iter()
                .any(|e| e["kind"] == "text" || e["kind"] == "done"),
            "text/done missing: {events:?}"
        );
    }

    /// Régression (2026-07-16, vu en réel avec opencode ACP) : le `done`
    /// synthétique du runtime doublait le tour en court-circuitant la pompe
    /// d'events — au journal, `done` précédait le `text` final du provider,
    /// et le front dupliquait la bulle. L'ordre text < done doit être
    /// déterministe : la pompe est drainée AVANT le check de fin de tour.
    #[tokio::test]
    async fn provider_events_drain_before_synthetic_done() {
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
            "threadId": "t-order",
            "provider": "fake",
            "prompt": "hello",
            "projectRoot": dir.path().to_string_lossy(),
        });
        let _ = handle_send(&state, &msg).await;
        for _ in 0..50 {
            if !state.harness().is_running("t-order").await {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        let events = state.harness().journal().materialize("t-order");
        let pos_text = events.iter().position(|e| e["kind"] == "text");
        let pos_done = events.iter().position(|e| e["kind"] == "done");
        let dones = events.iter().filter(|e| e["kind"] == "done").count();
        assert_eq!(dones, 1, "exactement un done attendu: {events:?}");
        let (Some(pos_text), Some(pos_done)) = (pos_text, pos_done) else {
            panic!("text et done attendus au journal: {events:?}");
        };
        assert!(
            pos_text < pos_done,
            "le text du provider doit précéder le done (course pompe/synthèse): {events:?}"
        );
    }

    #[tokio::test]
    async fn provider_is_immutable_and_handoff_creates_a_linked_thread() {
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
            .upsert(
                json!({"id":"t-locked","provider":"claude","sessionId":"claude-session"}),
                false,
            )
            .unwrap();
        assert!(state.journal().append(&json!({
            "kind":"user","text":"question source",
            "meta":{"threadId":"t-locked","provider":"claude","eventId":"e1","turnId":"turn-source","sequence":1,"durable":true}
        })));
        assert!(state.journal().append(&json!({
            "kind":"text","text":"réponse source",
            "meta":{"threadId":"t-locked","provider":"claude","eventId":"e2","turnId":"turn-source","sequence":2,"durable":true}
        })));

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

        assert!(out[0].contains("provider immuable"), "{out:?}");
        let source = state
            .threads()
            .lock()
            .await
            .get("t-locked")
            .cloned()
            .unwrap();
        assert_eq!(source.provider, "claude");
        assert_eq!(source.session_id.as_deref(), Some("claude-session"));

        let out = handle_send(
            &state,
            &json!({
                "type":"send",
                "threadId":"t-handoff",
                "handoffFromThreadId":"t-locked",
                "provider":"fake",
                "prompt":"handoff",
                "projectRoot":dir.path().to_string_lossy(),
            }),
        )
        .await;

        assert!(out[0].contains("threads"), "{out:?}");
        for _ in 0..50 {
            if !state.harness().is_running("t-handoff").await {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        let thread = state
            .threads()
            .lock()
            .await
            .get("t-handoff")
            .cloned()
            .unwrap();
        assert_eq!(thread.provider, "fake");
        assert_eq!(thread.extra["handoff"]["sourceThreadId"], "t-locked");
        assert_eq!(thread.extra["handoff"]["sourceProvider"], "claude");
        let copied = state.journal().materialize("t-handoff");
        assert!(copied
            .iter()
            .any(|event| event["text"] == "question source"));
        assert!(copied.iter().any(|event| event["text"] == "réponse source"));
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
        let snapshot = "a".repeat(40);
        let event = normalize_provider_event(
            json!({"kind":"edit","files":["/repo/src/App.tsx", {"path":"src/lib/ws.ts","add":2}]}),
            "/repo",
            None,
            Some(&snapshot),
        );
        assert_eq!(
            event["files"],
            json!([
                {"path":"src/App.tsx","add":null,"del":null},
                {"path":"src/lib/ws.ts","add":2,"del":null}
            ])
        );
        assert_eq!(event["projectRoot"], "/repo");
        assert_eq!(event["baseSha"], snapshot);
    }

    #[test]
    fn edit_snippets_ride_on_normalized_file_entries() {
        let event = normalize_provider_event(
            json!({
                "kind":"edit",
                "files":["/repo/src/a.py", "/repo/b.md"],
                "snippets":{"/repo/src/a.py":{"oldText":"x = 1","newText":"x = 2"}}
            }),
            "/repo",
            None,
            None,
        );
        assert_eq!(
            event["files"],
            json!([
                {"path":"src/a.py","add":null,"del":null,"newText":"x = 2","oldText":"x = 1"},
                {"path":"b.md","add":null,"del":null}
            ])
        );
        assert!(
            event.get("snippets").is_none(),
            "le canal provider est retiré du contrat avant broadcast/journal"
        );
    }

    #[test]
    fn plan_mode_turns_final_text_into_a_durable_plan_artifact() {
        let event = normalize_provider_event(
            json!({"kind":"text","text":"# Plan\n\n1. Auditer"}),
            "/repo",
            Some("plan"),
            None,
        );
        assert_eq!(event["kind"], "proposed_plan");
        assert_eq!(event["markdown"], "# Plan\n\n1. Auditer");
        assert!(event["planId"].as_str().unwrap().starts_with("plan-"));
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
    fn file_scope_instruction_is_injected_on_every_turn() {
        let enriched = with_file_scope_instruction("surveille ERA5".into());
        assert!(enriched.starts_with("surveille ERA5"));
        assert!(enriched
            .contains("Automated, heartbeat, monitoring, status, and wait turns are read-only"));
        assert!(enriched.contains("Never use git add -A"));
        assert!(enriched.contains("pre-existing worktree change"));
        assert!(enriched.contains("Do not include a file-change summary"));
    }

    #[test]
    fn file_scope_instruction_is_never_part_of_displayed_history() {
        let text = "question\n\n<atelier-file-scope>old</atelier-file-scope>\n\n<atelier-file-scope>new</atelier-file-scope>";
        assert_eq!(strip_file_scope_instruction(text), "question");
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
            .upsert(
                json!({"id":"t", "title":"Titre manuel", "provider":"codex"}),
                false,
            )
            .unwrap();
        let thread = existing.get("t").unwrap();
        assert!(!should_auto_title(Some(thread), None));
        assert!(!should_auto_title(None, Some("Titre explicite")));
        assert!(should_auto_title(None, None));
    }

    #[test]
    fn acp_permission_ordinaire_choices_dans_l_ordre() {
        let params = json!({
            "sessionId": "s1",
            "toolCall": {"toolCallId": "3:c1", "title": "Bash", "content": [
                {"type": "content", "content": {"type": "text", "text": "Requesting approval to run `ls`"}}
            ]},
            "options": [
                {"optionId": "approve_once", "name": "Approve once", "kind": "allow_once"},
                {"optionId": "approve_always", "name": "Approve for this session", "kind": "allow_always"},
                {"optionId": "reject", "name": "Reject", "kind": "reject_once"}
            ]
        });
        let spec = describe_server_request("session/request_permission", &params).unwrap();
        assert_eq!(spec["interactionType"], "approval");
        assert_eq!(spec["title"], "Bash");
        assert!(spec["detail"]
            .as_str()
            .unwrap()
            .contains("Requesting approval"));
        let choices = spec["choices"].as_array().unwrap();
        let ids: Vec<&str> = choices
            .iter()
            .map(|c| c["optionId"].as_str().unwrap())
            .collect();
        assert_eq!(ids, vec!["approve_once", "approve_always", "reject"]);
        assert_eq!(choices[1]["label"], "Approve for this session");
        assert_eq!(choices[2]["kind"], "reject_once");
    }

    #[test]
    fn acp_plan_review_garde_l_ordre_et_les_ids() {
        let params = json!({
            "toolCall": {"title": "ExitPlanMode", "content": []},
            "options": [
                {"optionId": "plan_opt_0", "name": "A", "kind": "allow_once"},
                {"optionId": "plan_opt_1", "name": "B", "kind": "allow_once"},
                {"optionId": "plan_revise", "name": "Revise", "kind": "reject_once"},
                {"optionId": "plan_reject_and_exit", "name": "Reject and Exit", "kind": "reject_once"}
            ]
        });
        let spec = describe_server_request("session/request_permission", &params).unwrap();
        assert_eq!(spec["interactionType"], "approval");
        let ids: Vec<&str> = spec["choices"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["optionId"].as_str().unwrap())
            .collect();
        assert_eq!(
            ids,
            vec![
                "plan_opt_0",
                "plan_opt_1",
                "plan_revise",
                "plan_reject_and_exit"
            ]
        );
    }

    #[test]
    fn acp_question_devient_user_input_avec_values_opaques() {
        let params = json!({
            "toolCall": {"title": "AskUserQuestion", "content": [
                {"type": "content", "content": {"type": "text", "text": "Quelle couleur ?"}}
            ]},
            "options": [
                {"optionId": "q0_opt_0", "name": "Rouge", "kind": "allow_once"},
                {"optionId": "q0_opt_1", "name": "Vert", "kind": "allow_once"},
                {"optionId": "q0_skip", "name": "Skip", "kind": "reject_once"}
            ]
        });
        let spec = describe_server_request("session/request_permission", &params).unwrap();
        assert_eq!(spec["interactionType"], "user_input");
        let fields = spec["fields"].as_array().unwrap();
        assert_eq!(fields.len(), 1, "une seule question (limitation Kimi 0.26)");
        assert_eq!(fields[0]["question"], "Quelle couleur ?");
        let opts = fields[0]["options"].as_array().unwrap();
        // Skip exclu des options — le bouton Annuler couvre la dismissal.
        assert_eq!(opts.len(), 2);
        assert_eq!(opts[0]["label"], "Rouge");
        assert_eq!(opts[0]["value"], "q0_opt_0");
        assert_eq!(opts[1]["value"], "q0_opt_1");
    }

    #[test]
    fn acp_permission_sans_options_refus_sur() {
        let params = json!({"toolCall": {"title": "Bash"}, "options": []});
        assert!(describe_server_request("session/request_permission", &params).is_none());
    }

    #[test]
    fn summary_optionid_affiche_le_label_du_choix() {
        let spec = json!({
            "interactionType": "approval",
            "choices": [
                {"optionId": "plan_opt_1", "label": "Variante B", "kind": "allow_once"}
            ]
        });
        let s = summarize_interaction(&spec, &json!({"optionId": "plan_opt_1"}));
        assert_eq!(s, "Variante B");
        let s2 = summarize_interaction(
            &spec,
            &json!({"optionId": "plan_opt_1", "cancelTurn": true}),
        );
        assert!(s2.contains("tour annulé"));
    }

    #[test]
    fn summary_user_input_value_opaque_affiche_le_label() {
        let spec = json!({
            "interactionType": "user_input",
            "fields": [{
                "id": "q0", "question": "Couleur ?",
                "options": [{"label": "Vert", "value": "q0_opt_1"}]
            }]
        });
        let s = summarize_interaction(&spec, &json!({"answers": {"q0": "q0_opt_1"}}));
        assert!(s.contains("Vert"), "label affiché, pas l'id wire: {s}");
        assert!(!s.contains("q0_opt_1"));
    }
}
