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
    let tool = std::path::Path::new(server_dir).join("atelier-zotero-passages-rs");  // bascule soak 065
    let base = format!(
        "{prompt}\n\n<atelier-zotero-passages>\nWhen the user asks for important or relevant passages from an attached Zotero article, use the exact PDF metadata inside <zotero-reference> and call the terminal tool exactly once:\n{} search --pdf <absolute-pdf-path> --zotero-key <zotero-key> --pdf-key <pdf-key> --pdf-file <pdf-file> --query <user-question> --limit 5\nRead its JSON stdout. For every passage you cite, reproduce its markdownLink exactly so the user can open the PDF at that page with automatic highlighting. The displayed verbatim excerpt immediately associated with that link MUST be exactly the result's quote field: do not shorten, translate, normalize, or replace it with another sentence from context. You may explain it separately. Never invent a passage or link. If the article has no attached local PDF metadata, ask the user to attach it from Zotero. Do not call this tool for ordinary bibliography or metadata questions.\n\nWhen the user asks for a reference or supporting evidence for a sentence they are writing and no PARTICULAR article is in play, call the tool once with `search --corpus --query <the-claim> --limit 5` instead — do not ask them to attach anything. Asking the user to attach a PDF from Zotero applies ONLY when they name a specific article whose local PDF metadata is missing. When you present a found passage as the answer, put its markdownLink ALONE in its own paragraph (blank line before and after) so the app renders it as a passage card; keep your explanation in separate paragraphs.\n</atelier-zotero-passages>",
        serde_json::to_string(&tool.to_string_lossy()).unwrap_or_default(),
    );
    format!(
        "{base}\n\n<atelier-gbrain-passages>\nA second, separate evidence source exists: the gbrain knowledge corpus (NAS-hosted notes and papers, reached through its own MCP tools — distinct from the Zotero PDFs above). When you consult it and a page contains a passage that directly supports what you are writing, cite it with a markdown link built from that exact page's slug and an exact verbatim excerpt: [« quoted excerpt »](#atelier-gbrain-passage?slug=<page-slug>&quote=<url-encoded-exact-quote>). The quote MUST be copied verbatim from the page — never paraphrase, translate, shorten, or invent it, and never invent a slug. The verbatim excerpt MUST be copied from literal page content returned by mcp__gbrain__get_page or mcp__gbrain__get_chunks — NEVER from mcp__gbrain__query answers, which are synthesized. If you only have a query answer, fetch the page first. Put this markdownLink ALONE in its own paragraph (blank line before and after) so the app renders it as a passage card; keep any explanation in a separate paragraph. Use atelier-gbrain-passage links only for gbrain corpus pages — Zotero PDF passages keep using atelier-zotero-passage links as described above.\n</atelier-gbrain-passages>"
    )
}

/// Widgets du fil : la description d'outil ne suffit pas aux petits modèles
/// (GLM 5.3 Flash avait atelier_widget ET son guide dans sa liste, et a quand
/// même écrit une page dans /tmp puis ouvert le navigateur — deux fois). La
/// consigne doit vivre dans le MESSAGE, comme la galerie et Zotero : c'est le
/// seul canal que tous les providers et tous les modèles respectent.
/// N'est injectée que si le fil a le serveur MCP (provider compatible).
/// Render-then-verify des figures matplotlib — le §9 de Claude Science,
/// transposé dans le levier qui marche pour tous les providers : la consigne
/// dans le MESSAGE (cf. galerie, zotero, widgets). Le module consolidé vit
/// dans le bundle (rust/assets/atelier_figure_qc.py, stagé par
/// stage-rust-server.sh) — l'agent ne redérive pas le code du contrôle, il
/// l'importe. La porte est DURE : verify() lève tant que la figure n'est pas
/// propre, et la consigne interdit de conclure le tour sur un échec.
fn with_figure_qc_instruction(prompt: String, server_dir: &str) -> String {
    if server_dir.is_empty() {
        return prompt;
    }
    let module_dir = serde_json::to_string(server_dir).unwrap_or_default();
    format!(
        "{prompt}\n\n<atelier-figure-qc>\nRender-then-verify for every matplotlib figure you \
create or modify. Immediately after EACH savefig call, in the SAME Python session, run:\n\
import sys; sys.path.insert(0, {module_dir}); from atelier_figure_qc import verify; \
verify(fig, \"<the path you just saved>\")\n\
It raises AssertionError listing label overlaps, texts crossing panel frames, and texts \
clipped at the canvas edge. Fix the layout (spacing, rotation, label placement — not by \
deleting information) and re-save until verify passes. Do NOT end the turn while a figure \
fails verification, and do not use tight_layout/constrained_layout/bbox_inches='tight' to \
silence it — they resize the canvas and verify will say so. Skip only when the user set \
ATELIER_FIGURE_QC=off.\n</atelier-figure-qc>"
    )
}

fn with_widget_tool_instruction(prompt: String, provider: &str) -> String {
    if !crate::agent_mcp::is_mcp_compatible_provider(provider) {
        return prompt;
    }
    format!(
        "{prompt}\n\n<atelier-widget-integration>\nWhen the user asks for a widget, an interactive panel, a slider, an interactive \
visualization, or anything they want to manipulate live in the chat, you MUST use the \
MCP tool `atelier_widget` (on your first use in this session, call `atelier_widget_guide` \
first and follow it). The panel renders directly inside the conversation. For such \
requests: never write an HTML file to disk, never open a browser, never send the result \
to the Atelier Gallery — those are the wrong channels and the user will see nothing in \
the chat. A static figure or saved file is only appropriate when the user explicitly \
asks for a file or a gallery figure.\n</atelier-widget-integration>"
    )
}

/// Capacité MCP scopée du tour (plan 057 + spec widgets-chat).
/// Partagée par le tour normal ET le steer : un steer codex qui échoue
/// retombe sur `thread/resume` DANS le provider, et sans cette config le fil
/// était repris SANS les serveurs MCP d'Atelier — l'agent perdait
/// `atelier_widget` et `atelier_sessions` en cours de session (sonde
/// 2026-08-29). Coût nul quand le steer réussit : le champ n'est pas lu.
/// Journal de bord MCP — `<app_dir>/logs/agent-mcp.log`. Le stderr du
/// backend part dans Stdio::null (src-tauri/sidecar.rs) : trois récidives de
/// « l'outil widget a disparu » ont été diagnostiquées à l'aveugle faute de
/// cette ligne (2026-08-29 → 31). Append best-effort, jamais bloquant.
fn journal_mcp(state: &AppState, ligne: &str) {
    let dir = state.app_dir().join("logs");
    let _ = std::fs::create_dir_all(&dir);
    let ts = chrono::Local::now().format("%m-%d %H:%M:%S");
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("agent-mcp.log"))
    {
        let _ = writeln!(f, "{ts} {ligne}");
    }
}

async fn atelier_mcp_for_turn(
    state: &AppState,
    thread_id: &str,
    project_root: &str,
    provider: &str,
    session_id: Option<String>,
    turn_id: &str,
    previous: Option<&atelier_store::Thread>,
) -> Option<atelier_providers::AtelierMcpLaunch> {
    if !crate::agent_mcp::should_launch_mcp(provider) {
        return None;
    }
    // Le lien ne décide plus du LANCEMENT, seulement de l'ISOLATION de la
    // session MCP côté provider (un fil ordinaire garde la config MCP
    // personnelle de l'utilisateur).
    let linked = previous.and_then(|t| t.agent_link.as_ref()).is_some() || {
        let store = state.threads().lock().await;
        !store.children_of(thread_id).is_empty()
    };
    match crate::agent_mcp::issue_mcp_launch(
        state,
        thread_id,
        project_root,
        provider,
        session_id,
        crate::agent_mcp::provider_label(provider),
        Some(turn_id.to_string()),
        linked,
    )
    .await
    {
        Ok(launch) => {
            journal_mcp(
                state,
                &format!(
                    "OK issue fil={thread_id} provider={provider} serveur={} cmd={}",
                    launch.server_name, launch.command
                ),
            );
            Some(atelier_providers::AtelierMcpLaunch {
                command: std::path::PathBuf::from(launch.command),
                server_name: launch.server_name,
                env: launch.env,
                linked: launch.linked,
            })
        }
        Err(e) => {
            tracing::warn!(error = %e, "atelier MCP launch unavailable");
            journal_mcp(
                state,
                &format!("ECHEC issue fil={thread_id} provider={provider} err={e}"),
            );
            None
        }
    }
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

pub(crate) fn is_new_chat_placeholder(title: &str) -> bool {
    matches!(
        title.trim().to_lowercase().as_str(),
        "" | "sans titre" | "nouveau chat" | "new chat"
    )
}

// auto_title : le brouillon créé par le frontend porte déjà un titre
// placeholder (« nouveau chat ») — l'écraser par le titre provisoire,
// sinon maybe_title_new_thread ne reconnaît jamais le fil.
fn upsert_title(
    auto_title: bool,
    explicit_title: Option<String>,
    prev_title: Option<&str>,
    provisional_title: &str,
) -> String {
    if auto_title {
        return provisional_title.to_string();
    }
    explicit_title
        .or_else(|| prev_title.filter(|s| !s.is_empty()).map(str::to_string))
        .unwrap_or_else(|| provisional_title.to_string())
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
        // record_thread_event ne consomme que done/error (automations.rs) :
        // tester ICI évite un clone profond du Value (deltas, tool_result
        // jusqu'à 64 Ko) et un spawn tokio par événement de streaming.
        let kind = event.get("kind").and_then(Value::as_str).unwrap_or("");
        if matches!(kind, "done" | "error") {
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
        }
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
/// Niveau de service du tour (mode Fast Codex → `service_tier = "priority"`).
/// Champ explicite `fastMode` du message ; comme `model`/`effort`, un renvoi
/// « nu » (rewind, tour auto-review) reprend le dernier choix du MÊME provider,
/// jamais celui d'un autre. Défaut : Standard, aucun niveau forcé.
pub(crate) fn turn_fast_mode(msg: &Value, last_turn: &Value, same_provider: bool) -> bool {
    msg.get("fastMode")
        .and_then(Value::as_bool)
        .or_else(|| {
            same_provider
                .then(|| last_turn.get("fastMode").and_then(Value::as_bool))
                .flatten()
        })
        .unwrap_or(false)
}

/// `/ref [affirmation]` — gâchette déterministe de la recherche de référence.
/// Expansion CÔTÉ APP, avant tout provider : le geste est identique dans les
/// chats Claude, Grok, Codex ou Kimi (un skill Claude Code ne vivrait que
/// chez Claude, et resterait une suggestion — ici c'est une gâchette).
/// Sans texte après /ref, l'affirmation vient de la sélection en direct
/// (< 15 min) ; sans ni l'un ni l'autre → erreur immédiate, aucun tour parti.
pub fn expand_ref_command(
    prompt: &str,
    selection: Option<crate::evidence::EvidenceSupports>,
) -> Result<Option<String>, String> {
    let trimmed = prompt.trim_start();
    let rest = if trimmed == "/ref" {
        ""
    } else if let Some(rest) = trimmed.strip_prefix("/ref ") {
        rest
    } else {
        return Ok(None);
    };
    let (claim, origin) = if !rest.trim().is_empty() {
        (rest.trim().to_string(), String::new())
    } else if let Some(sel) = selection.filter(|s| !s.text.trim().is_empty()) {
        let origin = match (sel.file.as_deref(), sel.lines.as_deref()) {
            (Some(file), Some(lines)) => format!(" (sélectionnée dans {file}, {lines})"),
            (Some(file), None) => format!(" (sélectionnée dans {file})"),
            _ => String::new(),
        };
        (sel.text.trim().to_string(), origin)
    } else {
        return Err(
            "/ref : aucune sélection récente — sélectionne une phrase dans l'éditeur ou tape /ref <affirmation>".into(),
        );
    };
    Ok(Some(format!(
        "Trouve dans la littérature un passage EXACT qui appuie cette affirmation{origin} :\n\n« {claim} »\n\nMéthode : cherche d'abord avec l'outil terminal atelier-zotero-passages (`search --corpus --query <l'affirmation> --limit 5`). Si le MCP gbrain est disponible, cherche aussi via `query` puis récupère le texte littéral avec `get_page`/`get_chunks` pour tout passage retenu. Réponds avec au plus 3 passages, le meilleur d'abord : pour chacun, son markdownLink SEUL dans son propre paragraphe (ligne vide avant et après), suivi d'un paragraphe d'une seule ligne expliquant pourquoi il appuie l'affirmation. Cite uniquement des passages réellement retournés par les outils — jamais de citation inventée. Si rien de probant n'existe, dis-le clairement."
    )))
}

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

    // /ref : expansion après le titre (le fil garde « /ref … » comme titre,
    // pas le prompt structuré) et avant toute instruction ambiante.
    let prompt = match expand_ref_command(&prompt, crate::evidence::fig_selection_supports(900)) {
        Ok(Some(expanded)) => expanded,
        Ok(None) => prompt,
        Err(message) => return vec![err_json(message)],
    };

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
        let p = with_zotero_passage_instruction(p, state.server_dir());
        let p = with_figure_qc_instruction(p, state.server_dir());
        with_widget_tool_instruction(p, &provider)
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

    // Upsert thread — le titre retenu ressort du bloc : la provenance des
    // figures le recopie tel quel (spec 2026-08-27 B, `threadTitle`), et c'est
    // le seul endroit qui l'arbitre entre auto-titrage, titre client et titre
    // déjà en base.
    let thread_title = {
        let mut store = state.threads().lock().await;
        let prev = store.get(&thread_id).cloned();
        let mut patch = json!({
            "id": thread_id,
            "projectRoot": project_root,
            "provider": provider,
            "status": "running",
        });
        let upsert_title = upsert_title(
            auto_title,
            title,
            prev.as_ref().map(|p| p.title.as_str()),
            &provisional_title,
        );
        patch
            .as_object_mut()
            .unwrap()
            .insert("title".into(), json!(upsert_title.clone()));
        let _ = store.upsert(patch, false);
        upsert_title
    };

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
    //
    // Claude n'a PAS de vrai steer : le CLI tourne en one-shot avec stdin
    // fermé, et le chemin générique ci-dessous (kill du process + resume sur
    // le MÊME turn_id) cassait tout en cascade — l'EOF du process tué
    // émettait « session terminée sans résultat », consommait l'unique
    // terminal du tour, et le done du process relancé était avalé : chrono
    // infini, file de relances bloquée, Stop inopérant (Thierry 2026-08-23).
    // Un steer claude devient donc : interruption propre du tour en cours,
    // puis le message part comme un TOUR NORMAL. Le session_id est capturé à
    // l'init et persisté par le nettoyage du tour interrompu avant
    // clear_running, donc le nouveau tour reprend la même session (--resume),
    // contexte intact — même en steerant le premier tour d'un fil.
    if running && mode != "queue" && provider == "claude" {
        state.harness().request_cancel(&thread_id).await;
        // Laisse le watcher (poll 50 ms) propager le flag vers is_cancelled
        // AVANT de tuer le process : l'ancien tour se termine alors en
        // « interrupted », pas en faux échec.
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        let _ = provider_impl.interrupt(&thread_id).await;
        for _ in 0..100 {
            if !state.harness().is_running(&thread_id).await {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        // … puis on tombe dans le chemin « nouveau tour » ci-dessous.
    } else if running && mode != "queue" {
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
            // Un steer codex qui échoue retombe sur thread/resume DANS le
            // provider : sans cette capacité, le fil était repris sans les
            // serveurs MCP d'Atelier (outils disparus en cours de session,
            // 2026-08-29). Calculée AVANT la requête — `session_id` y est
            // déplacé.
            let steer_mcp = atelier_mcp_for_turn(
                state,
                &thread_id,
                &project_root,
                &provider,
                session_id.clone(),
                &turn_id,
                previous.as_ref(),
            )
            .await;
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
                fast_mode: msg
                    .get("fastMode")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                permission_mode: msg
                    .get("permissionMode")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                fork_pending: false,
                mode: SendMode::Steer,
                on_event: Arc::new(move |ev| {
                    let _ = tx.send(ev);
                }),
                on_interaction: Some(interaction),
                is_cancelled: Arc::new(move || cancelled_probe.load(Ordering::SeqCst)),
                atelier_mcp: steer_mcp,
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

    // Start new turn. Pas de verrou d'écrivain par projet : plusieurs chats
    // tournent en même temps sur le même projet, comme Claude Code (décision
    // Thierry 2026-08-25 — le verrou de juillet refusait le second send,
    // d'abord en silence, et un tour zombie le tenait à jamais).
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
    let fast_mode = turn_fast_mode(msg, &last_turn, same_provider);
    if msg.get("permissionMode").and_then(Value::as_str).is_some() {
        let _ = state.threads().lock().await.upsert(
            json!({
                "id": thread_id,
                "lastTurn": {
                    "provider": provider,
                    "model": msg.get("model").cloned().unwrap_or(Value::Null),
                    "effort": msg.get("effort").cloned().unwrap_or(Value::Null),
                    "fastMode": msg.get("fastMode").and_then(Value::as_bool).unwrap_or(false),
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
    // Provenance des figures : le contexte du tour est figé ICI (avant que
    // `prompt`/`model` ne partent dans la SendRequest), et la pompe y accumule
    // les commandes shell au passage. Les commandes vivent derrière un Arc :
    // le `done` peut sortir par la pompe (cas normal) OU par le terminal
    // synthétique de repli, et les deux doivent voir la même matière.
    let prov_turn = crate::prov::TurnProvenance::new(
        thread_id.clone(),
        Some(thread_title),
        provider.clone(),
        model.clone(),
        // Prompt tel qu'envoyé par l'utilisateur (après expansion `/ref`,
        // avant les blocs d'instructions ambiantes) : c'est la phrase de
        // contexte que le panneau Provenance affichera.
        prompt.clone(),
    );
    let prov_pump = prov_turn.clone();
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
            // Avant normalisation : l'événement outil brut porte encore
            // `input.command`, la seule forme exploitable de la commande.
            prov_pump.note_event(&ev);
            let ev = normalize_provider_event(
                ev,
                &project_root_events,
                permission_mode_events.as_deref(),
                snapshot_events.as_deref(),
                Some(&prov_pump),
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
                    // Allocateur atomique : ce mirror des fils liés est l'un
                    // de trois écrivains concurrents (avec agent_mailbox.rs
                    // et agent_links.rs) qui pouvaient obtenir la même
                    // séquence via `last_sequence + 1` (course vécue, revue
                    // finale 2026-08-28).
                    let sequence = linked_reply_state.journal().next_sequence(source_thread_id);
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

    // Plan 057 : capacité MCP scopée. Jusqu'au 2026-08-28 elle n'était émise
    // que pour les fils LIÉS ; `atelier_widget` (spec widgets-chat) a changé
    // la donne — le cas d'usage moteur est un fil NORMAL à qui on demande un
    // panneau. Voir `agent_mcp::should_launch_mcp`.
    //
    // Le lien reste calculé : il ne décide plus du LANCEMENT du serveur, mais
    // toujours de l'ISOLATION de la session MCP côté provider (un fil ordinaire
    // doit garder la config MCP personnelle de l'utilisateur).
    let atelier_mcp = atelier_mcp_for_turn(
        state,
        &thread_id,
        &project_root,
        &provider,
        session_id.clone(),
        &turn_id,
        previous.as_ref(),
    )
    .await;

    // Vrai dès que le provider émet lui-même `done`/`error` : la pompe a alors
    // seulement besoin de finir de le transférer, jamais d'être doublée.
    let provider_terminal = Arc::new(AtomicBool::new(false));
    let provider_terminal_check = Arc::clone(&provider_terminal);
    tokio::spawn(async move {
        let fallback_root = project_root.clone();
        let fallback_snapshot = snapshot_sha.clone();
        // Même contexte de provenance que la pompe (commandes partagées) : un
        // provider sans `done` natif doit produire les mêmes sidecars. Les
        // deux chemins s'excluent (`turn_status != Done`), donc jamais deux
        // entrées d'historique pour un seul tour.
        let prov_fallback = prov_turn;
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
            fast_mode,
            permission_mode,
            // Posé par le fork pour les providers sans fork hors tour
            // (Claude) : le premier envoi reprend la session source avec
            // `--fork-session` au lieu de l'écraser.
            fork_pending: previous
                .as_ref()
                .and_then(|thread| thread.extra.get("forkPending"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
            mode: SendMode::Normal,
            on_event: Arc::new(move |ev| {
                // Le provider a-t-il produit sa propre fin de tour ? Si oui,
                // le `done` synthétique ci-dessous n'a pas lieu d'être : il
                // écraserait l'usage réel (contexte, jetons de sortie).
                if matches!(
                    ev.get("kind").and_then(Value::as_str),
                    Some("done" | "error")
                ) {
                    provider_terminal.store(true, Ordering::SeqCst);
                }
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
        //
        // Le plafond dépend de ce que le provider a fait. S'il a déjà émis sa
        // fin de tour, la vider intégralement est la SEULE issue correcte :
        // 2 s suffisaient sur un tour léger, mais pas sur un tour chargé
        // (78k jetons de contexte, des dizaines d'outils — fils Grok du
        // 2026-08-13). Le `done` synthétique gagnait alors la course et
        // l'usage réel disparaissait de l'historique, tour après tour.
        let drain = if provider_terminal_check.load(Ordering::SeqCst) {
            std::time::Duration::from_secs(30)
        } else {
            std::time::Duration::from_secs(2)
        };
        let _ = tokio::time::timeout(drain, pump).await;
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
                            Some(&prov_fallback),
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
    // Contexte du tour (fil, provider, modèle, prompt, commandes accumulées) —
    // `None` hors tour réel (tests unitaires, chemins sans provenance).
    prov: Option<&crate::prov::TurnProvenance>,
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
        // Un seul spawn git : les stats portent les chemins ET les ± contre le
        // snapshot du TOUR (remplace l'enrichissement numstat du sidecar Node,
        // perdu au port Rust — il comptait contre HEAD, donc trop large).
        let file_stats = snapshot_sha
            .and_then(|sha| atelier_workspace::changed_since_stats(project_root, sha).ok())
            .unwrap_or_default();
        let files_changed: Vec<String> =
            file_stats.iter().map(|entry| entry.path.clone()).collect();
        // Provenance des figures (spec 2026-08-27 A) : le même diff de tour
        // sert deux fois — la carte « N fichiers modifiés » du frontend ET les
        // sidecars `<figure>.prov.json`. Greffé ICI parce que c'est le SEUL
        // endroit qui connaît à la fois les fichiers du tour et son contexte,
        // sans un spawn git de plus. Ne peut jamais faire échouer le `done` :
        // `record_done` avale tout et log en cas de pépin.
        if let Some(prov) = prov {
            prov.record_done(project_root, snapshot_sha, &files_changed);
        }
        if let Some(obj) = event.as_object_mut() {
            obj.insert("projectRoot".into(), json!(project_root));
            obj.insert("filesChanged".into(), json!(files_changed));
            // fileStats et filesChanged portent EXACTEMENT le même ensemble de
            // chemins : canDiff (frontend) rendrait des lignes inertes sinon.
            obj.insert(
                "fileStats".into(),
                json!(file_stats
                    .iter()
                    .map(|entry| json!({
                        "path": entry.path,
                        "add": entry.add,
                        "del": entry.del,
                    }))
                    .collect::<Vec<_>>()),
            );
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
                let obj = entry.as_object_mut().expect("entry objet");
                if let Some(new_text) = sn.get("newText").and_then(Value::as_str) {
                    obj.insert("newText".into(), json!(new_text));
                    if let Some(old_text) = sn.get("oldText").and_then(Value::as_str) {
                        obj.insert("oldText".into(), json!(old_text));
                    }
                }
                // variante Codex : diff UNIFIÉ (pas d'avant/après séparés)
                if let Some(unified) = sn.get("unified").and_then(Value::as_str) {
                    obj.insert("unified".into(), json!(unified));
                }
            }
            Some(entry)
        })
        .collect::<Vec<_>>();
    if let Some(obj) = event.as_object_mut() {
        obj.insert("files".into(), Value::Array(files));
        // le canal provider `snippets` ne fait pas partie du contrat AgentEvent :
        // son contenu vit désormais dans files[].oldText/newText/unified
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
                // Libellés officiels du CLI : ils priment sur ceux intégrés à
                // l'UI, qui n'ont plus à être mis à jour à chaque modèle.
                if let Some(labels) = dynamic.get("modelLabels") {
                    if labels.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
                        provider.model_labels = labels.clone();
                    }
                }
                // Routes opencode décomposées (lot B2) : champ additif voisin
                // de `models`, même motif de propagation que `modelLabels`
                // ci-dessus. Absent/vide chez tout provider qui n'en émet
                // pas encore : `provider.routes` garde alors sa valeur par
                // défaut (`[]`), inoffensive pour un frontend qui l'ignore.
                if let Some(routes) = dynamic.get("routes") {
                    if routes.as_array().map(|a| !a.is_empty()).unwrap_or(false) {
                        provider.routes = routes.clone();
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
mod steer_capacite_tests {
    /// Contrat de source (même patron que css-contract côté front) : le test
    /// de comportement vit dans atelier-providers (`thread_opts` déclare bien
    /// mcp_servers), mais RIEN là-bas ne verrait un retour de `send.rs` à
    /// `atelier_mcp: None` sur le chemin steer — or c'est exactement la
    /// régression qui a coûté ses outils à l'agent le 2026-08-29 : un steer
    /// refusé retombe sur thread/resume DANS le provider, et le fil repartait
    /// sans les serveurs MCP d'Atelier.
    #[test]
    fn le_chemin_steer_transmet_la_capacite_mcp() {
        let source = include_str!("send.rs");
        let bloc = source
            .split("mode: SendMode::Steer,")
            .nth(1)
            .expect("le chemin steer doit exister");
        // On regarde la requête construite juste après le marqueur de mode.
        let requete = &bloc[..bloc.find("};").unwrap_or(bloc.len())];
        assert!(
            !requete.contains("atelier_mcp: None"),
            "le steer ne doit PAS partir sans capacité MCP : son repli reprend \
             le fil et l'agent perdrait atelier_widget / atelier_sessions"
        );
        assert!(
            requete.contains("atelier_mcp: steer_mcp"),
            "le steer doit transmettre la capacité calculée par atelier_mcp_for_turn"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use tempfile::tempdir;

    #[test]
    fn upsert_title_ecrase_le_placeholder_du_brouillon() {
        // Régression 2026-08-23 : le brouillon frontend écrit « nouveau chat »
        // avant le premier send ; l'auto-titrage doit quand même s'amorcer.
        assert_eq!(
            upsert_title(true, None, Some("nouveau chat"), "salut peux-tu"),
            "salut peux-tu"
        );
        // Titre explicite du client : prioritaire quand pas d'auto-titrage.
        assert_eq!(
            upsert_title(false, Some("Mon titre".into()), Some("ancien"), "prov"),
            "Mon titre"
        );
        // Fil existant déjà titré : conservé.
        assert_eq!(
            upsert_title(false, None, Some("Vrai titre"), "prov"),
            "Vrai titre"
        );
        // Aucun titre nulle part : titre provisoire.
        assert_eq!(upsert_title(false, None, None, "prov"), "prov");
        assert_eq!(upsert_title(false, None, Some(""), "prov"), "prov");
    }

    #[test]
    fn fast_mode_est_explicite_et_suit_le_meme_provider() {
        let last_fast = json!({"provider": "codex", "fastMode": true});
        // Standard par défaut : rien dans le message, rien dans l'historique.
        assert!(!turn_fast_mode(&json!({}), &json!({}), true));
        // Choix explicite du composer.
        assert!(turn_fast_mode(&json!({"fastMode": true}), &json!({}), false));
        assert!(!turn_fast_mode(&json!({"fastMode": false}), &last_fast, true));
        // Renvoi nu : reprise du dernier tour du MÊME provider seulement.
        assert!(turn_fast_mode(&json!({}), &last_fast, true));
        assert!(!turn_fast_mode(&json!({}), &last_fast, false));
    }

    #[tokio::test]
    async fn interrupt_arrete_le_tour_en_cours() {
        // Régression : « je clique sur stop, rien ne s'arrête », tous providers
        // confondus. Le chemin complet (handle_send → set_running → watcher
        // d'annulation → is_cancelled du provider) n'avait AUCUN test.
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        )
        .with_slow_test_provider("fake", 150);
        let msg = json!({
            "type": "send",
            "threadId": "t-stop",
            "provider": "fake",
            "prompt": "hello",
            "projectRoot": dir.path().to_string_lossy(),
        });
        handle_send(&state, &msg).await;
        // le tour doit être VRAIMENT en cours avant le stop
        for _ in 0..50 {
            if state.harness().is_running("t-stop").await {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        assert!(
            state.harness().is_running("t-stop").await,
            "le tour n'a jamais démarré"
        );

        handle_interrupt(&state, &json!({"type":"interrupt","threadId":"t-stop"})).await;

        // le tour doit se terminer NETTEMENT plus tôt que les 4×150 ms du fake
        let mut arrete = false;
        for _ in 0..40 {
            if !state.harness().is_running("t-stop").await {
                arrete = true;
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
        assert!(arrete, "le tour tourne encore 400 ms après l'interrupt");

        let events = state.harness().journal().materialize("t-stop");
        assert!(
            events
                .iter()
                .any(|e| e["kind"] == "error" && e["message"] == "interrupted"),
            "aucun événement d'interruption journalisé: {events:?}"
        );
        assert!(
            !events.iter().any(|e| e["kind"] == "text"),
            "le tour a produit sa réponse complète malgré le stop: {events:?}"
        );
    }

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

    /// Décision Thierry (2026-08-25) : PLUSIEURS chats en même temps sur le
    /// même projet, comme Claude Code. Le verrou d'écrivain par projet
    /// (juillet 2026) refusait le second send — d'abord en silence (spinner à
    /// vide), puis avec une bannière : dans les deux cas, un seul tour actif
    /// par projet. Le verrou est retiré : deux tours écrivants concurrents
    /// démarrent tous les deux.
    #[tokio::test]
    async fn deux_tours_ecrivants_sur_le_meme_projet_demarrent_tous_les_deux() {
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        );
        let root = dir.path().to_string_lossy().to_string();
        for tid in ["t-chat-1", "t-chat-2"] {
            let msg = json!({
                "type": "send",
                "threadId": tid,
                "provider": "fake",
                "prompt": "hello",
                "projectRoot": root,
            });
            let out = handle_send(&state, &msg).await;
            assert!(
                !out[0].contains("\"error\""),
                "le tour {tid} doit démarrer, pas être refusé : {}",
                out[0]
            );
        }
        for tid in ["t-chat-1", "t-chat-2"] {
            for _ in 0..50 {
                if !state.harness().is_running(tid).await {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(20)).await;
            }
            let events = state.harness().journal().materialize(tid);
            assert!(
                events.iter().any(|e| e["kind"] == "user"),
                "user event missing pour {tid}: {events:?}"
            );
        }
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
            None,
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

    /// Le `done` porte les ± du tour (fileStats) calculés en un seul spawn git
    /// contre le snapshot — et filesChanged reste EXACTEMENT le même ensemble
    /// de chemins (canDiff côté frontend rendrait des lignes inertes sinon).
    #[test]
    fn done_carries_file_stats_aligned_with_files_changed() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        for args in [
            vec!["init", "-b", "main"],
            vec!["config", "user.email", "t@test"],
            vec!["config", "user.name", "t"],
        ] {
            std::process::Command::new("git").args(&args).current_dir(dir.path()).output().unwrap();
        }
        std::fs::write(dir.path().join("a.txt"), b"un\n").unwrap();
        std::process::Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
        std::process::Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();
        let sha = atelier_workspace::snapshot(root).unwrap();
        std::fs::write(dir.path().join("a.txt"), b"un\ndeux\n").unwrap();

        let event = normalize_provider_event(json!({"kind":"done"}), root, None, Some(&sha), None);
        assert_eq!(event["filesChanged"], json!(["a.txt"]));
        assert_eq!(event["fileStats"], json!([{"path":"a.txt","add":1,"del":0}]));
        assert_eq!(event["checkpoint"]["filesChanged"], json!(["a.txt"]));
    }

    /// Provenance des figures (spec 2026-08-27 A) : le `done` d'un tour qui a
    /// créé une figure ET touché son script dépose le sidecar, avec la
    /// commande vue passer dans la pompe. Un échec d'écriture (sidecar
    /// occupé par un dossier) laisse l'événement `done` intact.
    #[test]
    fn done_ecrit_la_provenance_des_figures_du_tour() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        for args in [
            vec!["init", "-b", "main"],
            vec!["config", "user.email", "t@test"],
            vec!["config", "user.name", "t"],
        ] {
            std::process::Command::new("git").args(&args).current_dir(dir.path()).output().unwrap();
        }
        std::fs::write(dir.path().join("README.md"), b"x\n").unwrap();
        std::process::Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
        std::process::Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();
        let sha = atelier_workspace::snapshot(root).unwrap();
        // Le tour : un script modifié, une figure créée (untracked), et une
        // capture de viewer qui ne doit surtout pas être prise pour une figure.
        std::fs::create_dir_all(dir.path().join("figures")).unwrap();
        std::fs::write(dir.path().join("plot.py"), b"import matplotlib\n").unwrap();
        std::fs::write(dir.path().join("figures/trend.png"), b"\x89PNG\r\n").unwrap();
        std::fs::write(dir.path().join("figures/_view_trend.png"), b"\x89PNG\r\n").unwrap();
        // Sidecar impossible à écrire pour cette figure-là : un dossier occupe
        // déjà le chemin. Le `done` doit rester complet malgré tout.
        std::fs::create_dir_all(dir.path().join("figures/bloquee.png.prov.json")).unwrap();
        std::fs::write(dir.path().join("figures/bloquee.png"), b"\x89PNG\r\n").unwrap();

        let prov = crate::prov::TurnProvenance::new(
            "th-9".into(),
            Some("Tendance".into()),
            "codex".into(),
            Some("gpt-5.4".into()),
            "trace la tendance".into(),
        );
        prov.note_event(&json!({
            "kind":"tool_update","name":"Bash","status":"completed",
            "input":{"command":"python3 plot.py"}
        }));
        let event =
            normalize_provider_event(json!({"kind":"done"}), root, None, Some(&sha), Some(&prov));

        // L'événement garde son contrat intact (l'échec d'écriture ne fuit pas).
        assert!(event["filesChanged"]
            .as_array()
            .unwrap()
            .contains(&json!("figures/trend.png")));
        assert_eq!(event["checkpoint"]["snapshotSha"], sha);

        let sidecar = dir.path().join("figures/trend.png.prov.json");
        let doc: Value = serde_json::from_str(&std::fs::read_to_string(sidecar).unwrap()).unwrap();
        assert_eq!(doc["version"], 1);
        assert_eq!(doc["figure"], "figures/trend.png");
        let entry = &doc["history"][0];
        assert_eq!(entry["threadId"], "th-9");
        assert_eq!(entry["provider"], "codex");
        assert_eq!(entry["scripts"], json!(["plot.py"]));
        assert_eq!(entry["commands"], json!(["python3 plot.py"]));
        assert_eq!(entry["snapshotSha"], sha);
        assert!(entry["head"].as_str().is_some_and(|h| h.len() >= 7));
        assert!(!dir.path().join("figures/_view_trend.png.prov.json").exists());
    }

    /// Sans contexte de provenance (`None`), le `done` ne dépose rien : les
    /// chemins sans tour réel restent inchangés.
    #[test]
    fn done_sans_contexte_de_provenance_n_ecrit_aucun_sidecar() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        for args in [
            vec!["init", "-b", "main"],
            vec!["config", "user.email", "t@test"],
            vec!["config", "user.name", "t"],
        ] {
            std::process::Command::new("git").args(&args).current_dir(dir.path()).output().unwrap();
        }
        std::fs::write(dir.path().join("README.md"), b"x\n").unwrap();
        std::process::Command::new("git").args(["add", "."]).current_dir(dir.path()).output().unwrap();
        std::process::Command::new("git").args(["commit", "-m", "init"]).current_dir(dir.path()).output().unwrap();
        let sha = atelier_workspace::snapshot(root).unwrap();
        std::fs::write(dir.path().join("fig.png"), b"\x89PNG\r\n").unwrap();
        let _ = normalize_provider_event(json!({"kind":"done"}), root, None, Some(&sha), None);
        assert!(!dir.path().join("fig.png.prov.json").exists());
    }

    /// Sans snapshot (projectRoot vide, pas un repo…) : listes vides, pas de
    /// panique — même contrat dégradé qu'avant.
    #[test]
    fn done_without_snapshot_keeps_empty_stats() {
        let event = normalize_provider_event(json!({"kind":"done"}), "", None, None, None);
        assert_eq!(event["filesChanged"], json!([]));
        assert_eq!(event["fileStats"], json!([]));
        assert!(event.get("checkpoint").is_none());
    }

    #[test]
    fn plan_mode_turns_final_text_into_a_durable_plan_artifact() {
        let event = normalize_provider_event(
            json!({"kind":"text","text":"# Plan\n\n1. Auditer"}),
            "/repo",
            Some("plan"),
            None,
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
    fn widget_instruction_rides_the_prompt_for_mcp_providers_only() {
        // GLM ignorait la description d'outil : la consigne doit vivre dans le
        // message. Mais seulement quand le fil A l'outil — sinon on ordonne au
        // modèle d'appeler quelque chose qui n'existe pas.
        let enriched = with_widget_tool_instruction("fais-moi un widget".into(), "codex");
        assert!(enriched.starts_with("fais-moi un widget"));
        assert!(enriched.contains("atelier_widget_guide"));
        assert!(enriched.contains("never write an HTML file"));
        assert!(enriched.contains("never send the result"));

        let api = with_widget_tool_instruction("fais-moi un widget".into(), "openrouter");
        assert_eq!(api, "fais-moi un widget");
    }

    #[test]
    fn figure_qc_instruction_impose_le_render_then_verify() {
        let enriched = with_figure_qc_instruction(
            "trace la tendance d'albedo".into(),
            "/app/Resources/rust-server",
        );
        assert!(enriched.starts_with("trace la tendance d'albedo"));
        // le chemin du module consolidé, échappé en JSON comme pour la galerie
        assert!(enriched.contains("\"/app/Resources/rust-server\""));
        assert!(enriched.contains("from atelier_figure_qc import verify"));
        // la porte dure : pas de conclusion sur un échec, pas de contournement
        assert!(enriched.contains("Do NOT end the turn"));
        assert!(enriched.contains("bbox_inches"));
        // et la sortie de secours reste documentée
        assert!(enriched.contains("ATELIER_FIGURE_QC=off"));

        // sans server_dir (tests, environnements nus) : prompt inchangé
        assert_eq!(
            with_figure_qc_instruction("p".into(), ""),
            "p".to_string()
        );
    }

    /// Le module Python part dans le bundle par stage-rust-server.sh : un
    /// module qui ne compile pas = un contrôle mort en silence chez l'agent.
    /// La compilation est vérifiée ICI, à la source, à chaque cargo test.
    #[test]
    fn le_module_figure_qc_compile() {
        let module = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../assets/atelier_figure_qc.py"
        );
        assert!(
            std::path::Path::new(module).exists(),
            "module absent : {module}"
        );
        let python = ["python3", "python"]
            .iter()
            .find(|p| {
                std::process::Command::new(p)
                    .arg("--version")
                    .output()
                    .is_ok()
            })
            .copied();
        let Some(python) = python else {
            eprintln!("SKIP: aucun python sur cette machine");
            return;
        };
        let out = std::process::Command::new(python)
            .args(["-m", "py_compile", module])
            .output()
            .expect("py_compile doit se lancer");
        assert!(
            out.status.success(),
            "le module ne compile pas :\n{}",
            String::from_utf8_lossy(&out.stderr)
        );
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
    fn ref_command_sans_selection_ni_texte_erreur_immediate() {
        let out = expand_ref_command("/ref", None);
        assert!(out.is_err());
        assert!(out.unwrap_err().contains("aucune sélection récente"));
    }

    #[test]
    fn ref_command_avec_texte_construit_le_prompt_structure() {
        let out = expand_ref_command("/ref les aérosols abaissent l'albédo", None)
            .unwrap()
            .expect("expansion attendue");
        assert!(out.contains("« les aérosols abaissent l'albédo »"));
        assert!(out.contains("--corpus"));
        assert!(out.contains("get_page"));
        assert!(out.contains("jamais de citation inventée"));
    }

    #[test]
    fn ref_command_sans_texte_prend_la_selection_avec_origine() {
        let sel = crate::evidence::EvidenceSupports {
            text: "La fonte estivale s'accélère.".into(),
            file: Some("intro.tex".into()),
            lines: Some("L42".into()),
        };
        let out = expand_ref_command("/ref", Some(sel)).unwrap().expect("expansion");
        assert!(out.contains("« La fonte estivale s'accélère. »"));
        assert!(out.contains("(sélectionnée dans intro.tex, L42)"));
    }

    #[test]
    fn ref_command_ignore_les_prompts_ordinaires_et_les_prefixes_voisins() {
        assert!(expand_ref_command("bonjour", None).unwrap().is_none());
        assert!(expand_ref_command("/refactor ce module", None).unwrap().is_none());
        assert!(expand_ref_command("parle-moi de /ref", None).unwrap().is_none());
    }

    #[test]
    fn zotero_instruction_couvre_le_flux_reference() {
        let out = with_zotero_passage_instruction("p".into(), "/srv");
        assert!(out.contains("--corpus"));
        assert!(out.contains("its own paragraph"));
        assert!(out.contains("Never invent a passage"));
        assert!(out.contains("no PARTICULAR article"));
        assert!(out.contains("ONLY when they name a specific article"));
        // tâche 6 : second bloc pour le corpus gbrain (NAS), format de lien distinct
        assert!(out.contains("atelier-gbrain-passage"));
        // arbitrage contrôleur (post-revue, finding 2) : ancre la source du
        // verbatim — mcp__gbrain__query SYNTHÉTISE, jamais du texte littéral.
        assert!(out.contains("get_page"));
        assert!(out.contains("NEVER from"));
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
