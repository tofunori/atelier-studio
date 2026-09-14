//! Découverte et lecture des sessions natives Codex Desktop/CLI.
//!
//! Codex conserve ses rollouts sous `~/.codex/sessions/YYYY/MM/DD/*.jsonl`.
//! Atelier les lit en lecture seule : l'import crée seulement un pointeur vers
//! l'identifiant natif, puis les prochains tours passent par `thread/resume`.

use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

fn session_id_from_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    let id = stem.get(stem.len().checked_sub(36)?..)?;
    let valid = id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            matches!(index, 8 | 13 | 18 | 23) && byte == b'-'
                || !matches!(index, 8 | 13 | 18 | 23) && byte.is_ascii_hexdigit()
        });
    valid.then(|| id.to_string())
}

fn collect_rollouts(base: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > 6 {
        return;
    }
    let Ok(entries) = fs::read_dir(base) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            collect_rollouts(&path, depth + 1, out);
        } else if kind.is_file()
            && path.extension().and_then(|value| value.to_str()) == Some("jsonl")
            && path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with("rollout-"))
        {
            out.push(path);
        }
    }
}

fn session_metadata(path: &Path) -> (Option<String>, Option<String>) {
    let Ok(file) = File::open(path) else {
        return (None, None);
    };
    let mut cwd = None;
    let mut title = None;
    for line in BufReader::new(file).lines().map_while(Result::ok).take(200) {
        let Ok(row) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let payload = row.get("payload").unwrap_or(&row);
        if cwd.is_none() && row.get("type").and_then(Value::as_str) == Some("session_meta") {
            cwd = payload
                .get("cwd")
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        if title.is_none() && payload.get("type").and_then(Value::as_str) == Some("user_message") {
            title = payload
                .get("message")
                .and_then(Value::as_str)
                // le rollout loggue le prompt provider complet : retirer les
                // blocs d'outils Atelier avant d'en faire un titre
                .map(|text| crate::grok_history::strip_gallery_tool_instruction(text.trim()))
                .map(|text| text.trim().to_string())
                .filter(|text| {
                    !text.is_empty() && !text.starts_with('<') && !text.starts_with("# AGENTS")
                })
                .map(|text| text.chars().take(90).collect());
        }
        if cwd.is_some() && title.is_some() {
            break;
        }
    }
    (cwd, title)
}

pub(crate) fn list_codex_sessions_from_base(base: &Path) -> Vec<Value> {
    let mut paths = Vec::new();
    collect_rollouts(base, 0, &mut paths);
    let mut sessions = paths
        .into_iter()
        .filter_map(|path| {
            let id = session_id_from_path(&path)?;
            let modified = fs::metadata(&path)
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            let (project_root, title) = session_metadata(&path);
            Some(json!({
                "id": id,
                "mtime": modified,
                "title": title.unwrap_or_else(|| id.chars().take(8).collect()),
                "projectRoot": project_root.unwrap_or_default(),
            }))
        })
        .collect::<Vec<_>>();
    sessions.sort_by_key(|session| std::cmp::Reverse(session["mtime"].as_u64().unwrap_or(0)));
    sessions
}

pub(crate) fn list_codex_sessions() -> Vec<Value> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    list_codex_sessions_from_base(&PathBuf::from(home).join(".codex/sessions"))
}

fn find_session_file(base: &Path, session_id: &str) -> Option<PathBuf> {
    if session_id.len() != 36 || session_id.contains(['/', '\\']) {
        return None;
    }
    let mut paths = Vec::new();
    collect_rollouts(base, 0, &mut paths);
    paths
        .into_iter()
        .find(|path| session_id_from_path(path).as_deref() == Some(session_id))
}

/// Borne des sorties d'outils rejouées depuis un rollout, en CARACTÈRES
/// (jamais en octets : couper un point de code casserait l'UTF-8).
const NATIVE_TOOL_OUTPUT_MAX: usize = 8_000;

fn bound_output(text: &str) -> String {
    text.chars().take(NATIVE_TOOL_OUTPUT_MAX).collect()
}

/// Résumé une-ligne d'un appel d'outil : première ligne non vide de l'entrée.
fn tool_detail(input: &str) -> Value {
    match input
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(120).collect::<String>())
    {
        Some(detail) => Value::String(detail),
        None => Value::Null,
    }
}

/// Texte lisible d'un résultat MCP (`result.Ok.content[].text`).
fn mcp_result_text(result: &Value) -> (String, &'static str) {
    if let Some(err) = result.get("Err") {
        let text = err
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| err.to_string());
        return (bound_output(&text), "failed");
    }
    let ok = result.get("Ok").unwrap_or(result);
    let text = match ok.get("content").and_then(Value::as_array) {
        Some(items) => items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        None => ok.as_str().map(str::to_string).unwrap_or_default(),
    };
    (bound_output(&text), "completed")
}

/// Outils de collaboration multi-agents : leurs appels portent les chips.
///
/// `wait_agent`/`followup_task`/`list_agents` sont les noms actuellement
/// écrits dans les rollouts. Les variantes plus anciennes restent reconnues
/// pour que la relecture d'un ancien journal conserve la même activité.
const COLLAB_TOOLS: [&str; 10] = [
    "spawn_agent",
    "wait",
    "wait_agent",
    "send_input",
    "send_message",
    "resume_agent",
    "followup_task",
    "close_agent",
    "interrupt_agent",
    "list_agents",
];

/// Le protocole natif encode les messages inter-agents dans des appels
/// `collaboration.send_message`. Leurs arguments peuvent contenir un blob
/// chiffré : ils ne doivent jamais être envoyés au transcript.
fn is_internal_collaboration_call(name: &str, namespace: Option<&str>) -> bool {
    namespace == Some("collaboration") && name == "send_message"
}

/// Les messages inter-agents portent parfois un ciphertext dans `message`.
/// Ils ne doivent jamais être recopiés dans l'historique, mais un follow-up
/// ou une reprise doit quand même pouvoir réactiver l'état du sous-agent.
fn is_sanitized_collaboration_call(name: &str, namespace: Option<&str>) -> bool {
    namespace == Some("collaboration")
        && matches!(name, "followup_task" | "resume_agent" | "send_input")
}

/// Ids d'agents cités par un blob JSON.
///
/// Les rollouts récents renvoient `task_name` lors d'un spawn et
/// `agent_name`/`agent_status` dans `list_agents`; les versions app-server
/// utilisent plutôt `receiverThreadIds`/`agentThreadId`. Seuls ces champs
/// connus sont inspectés : une recherche récursive de toutes les chaînes
/// ferait remonter le ciphertext ou du texte de résultat comme un agent.
fn agent_ids_from_json(raw: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(raw) else {
        return Vec::new();
    };
    let mut ids = Vec::new();
    collect_agent_ids(&value, &mut ids);
    ids
}

const AGENT_ID_KEYS: [&str; 4] = [
    "agent_thread_ids",
    "receiverThreadIds",
    "agent_thread_id",
    "agentThreadId",
];

fn push_agent_id(ids: &mut Vec<String>, raw: &str) {
    let id = raw.trim();
    // `task_name`, `agent_name`, and the follow-up `target` are often paths
    // such as `/root/reviewer`, not native thread ids. They are retained as
    // agentPath metadata below, but must not create a fake transcript target.
    if !id.is_empty() && !id.starts_with('/') && !ids.iter().any(|known| known == id) {
        ids.push(id.to_string());
    }
}

fn push_target_id(ids: &mut Vec<String>, raw: &str) {
    let id = raw.trim();
    // `target` is a task path/name in the collaboration API. It is a native
    // transcript target only when it is an actual rollout UUID; accepting a
    // relative task name here would fabricate an unusable getAgentHistory id.
    if !id.starts_with('/') && session_id_from_path(Path::new(&format!("{id}.jsonl"))).is_some() {
        push_agent_id(ids, id);
    }
}

fn collect_agent_ids(value: &Value, ids: &mut Vec<String>) {
    match value {
        Value::Object(object) => {
            for key in AGENT_ID_KEYS {
                let Some(value) = object.get(key) else {
                    continue;
                };
                match value {
                    Value::String(id) => push_agent_id(ids, id),
                    Value::Array(values) => {
                        for id in values.iter().filter_map(Value::as_str) {
                            push_agent_id(ids, id);
                        }
                    }
                    _ => {}
                }
            }
            if let Some(agents) = object.get("agents").and_then(Value::as_array) {
                for agent in agents {
                    collect_agent_ids(agent, ids);
                }
            }
            if let Some(target) = object.get("target").and_then(Value::as_str) {
                push_target_id(ids, target);
            }
            // `agentsStates` has the ids as object keys rather than values.
            for key in ["agentsStates", "status"] {
                if let Some(states) = object.get(key).and_then(Value::as_object) {
                    for id in states.keys() {
                        push_agent_id(ids, id);
                    }
                }
            }
        }
        Value::Array(values) => {
            for value in values {
                collect_agent_ids(value, ids);
            }
        }
        _ => {}
    }
}

#[derive(Debug, Clone)]
struct AgentStateSnapshot {
    id: String,
    status: &'static str,
    message: Option<String>,
}

fn normalized_agent_status(raw: &str) -> Option<&'static str> {
    let normalized: String = raw
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '_' && *ch != '-')
        .flat_map(char::to_lowercase)
        .collect();
    match normalized.as_str() {
        "running" | "inprogress" | "pending" | "queued" | "started" | "executing"
        | "interacted" => Some("running"),
        "completed" | "complete" | "done" | "finished" | "succeeded" | "closed" | "shutdown" => {
            Some("completed")
        }
        "failed" | "failure" | "errored" | "error" | "aborted" => Some("failed"),
        "interrupted" | "cancelled" | "canceled" => Some("interrupted"),
        _ => None,
    }
}

fn status_message(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(bound_output)
}

fn status_from_value(value: &Value) -> Option<(&'static str, Option<String>)> {
    if let Some(status) = value.as_str().and_then(normalized_agent_status) {
        return Some((status, None));
    }
    let object = value.as_object()?;
    for key in ["status", "state", "kind", "outcome"] {
        if let Some(raw) = object.get(key).and_then(Value::as_str) {
            if let Some(status) = normalized_agent_status(raw) {
                return Some((status, object.get("message").and_then(status_message)));
            }
        }
    }
    // The real `list_agents` response uses `{ "completed": "result" }`
    // as the value of `agent_status`. Require a single, status-shaped key so
    // operation fields such as `{ "success": true }` cannot close a child.
    if object.len() == 1 {
        if let Some((key, value)) = object.iter().next() {
            if !matches!(key.as_str(), "success" | "ok" | "error")
                && matches!(value, Value::String(_) | Value::Null)
            {
                if let Some(status) = normalized_agent_status(key) {
                    return Some((status, status_message(value)));
                }
            }
        }
    }
    None
}

fn set_agent_state(
    states: &mut Vec<AgentStateSnapshot>,
    id: &str,
    status: &'static str,
    message: Option<String>,
) {
    if let Some(existing) = states.iter_mut().find(|state| state.id == id) {
        existing.status = status;
        if message.is_some() {
            existing.message = message;
        }
        return;
    }
    states.push(AgentStateSnapshot {
        id: id.to_string(),
        status,
        message,
    });
}

fn collect_explicit_agent_states(value: &Value, states: &mut Vec<AgentStateSnapshot>) {
    let Some(object) = value.as_object() else {
        return;
    };

    for key in ["agentsStates", "status"] {
        if let Some(entries) = object.get(key).and_then(Value::as_object) {
            for (id, state) in entries {
                if let Some((status, message)) = status_from_value(state) {
                    let mut ids = Vec::new();
                    push_agent_id(&mut ids, id);
                    for id in ids {
                        set_agent_state(states, &id, status, message.clone());
                    }
                }
            }
        }
    }

    if let Some(agents) = object.get("agents").and_then(Value::as_array) {
        for agent in agents {
            let Some(agent) = agent.as_object() else {
                continue;
            };
            let mut ids = Vec::new();
            for key in ["agent_thread_id", "agentThreadId"] {
                if let Some(id) = agent.get(key).and_then(Value::as_str) {
                    push_agent_id(&mut ids, id);
                }
            }
            let Some(value) = agent
                .get("agent_status")
                .or_else(|| agent.get("agentStatus"))
            else {
                continue;
            };
            let Some((status, message)) = status_from_value(value) else {
                continue;
            };
            for id in ids {
                set_agent_state(states, &id, status, message.clone());
            }
        }
    }

    // A direct `{status: ..., agent_thread_id: ...}` result is used by a few
    // protocol versions. Do not apply a bare operation status to a child
    // named only in the request: `ok:false`/`status:"failed"` can describe
    // the wait/close call itself rather than the child.
    let mut direct_ids = Vec::new();
    if let Some(id) = object.get("agent_thread_id").and_then(Value::as_str) {
        push_agent_id(&mut direct_ids, id);
    }
    if let Some(id) = object.get("agentThreadId").and_then(Value::as_str) {
        push_agent_id(&mut direct_ids, id);
    }
    if !direct_ids.is_empty() {
        if let Some((status, message)) = status_from_value(value) {
            for id in direct_ids {
                set_agent_state(states, &id, status, message.clone());
            }
        }
    }
}

fn explicit_agent_states(output: &str) -> Vec<AgentStateSnapshot> {
    let mut states = Vec::new();
    if let Ok(value) = serde_json::from_str::<Value>(output) {
        collect_explicit_agent_states(&value, &mut states);
    }
    states
}

fn operation_allows_running(output: &str) -> bool {
    if matches!(
        normalized_agent_status(output.trim()),
        Some("failed" | "interrupted")
    ) {
        return false;
    }
    let Ok(value) = serde_json::from_str::<Value>(output) else {
        return true;
    };
    let Some(object) = value.as_object() else {
        return true;
    };
    if object.get("ok").and_then(Value::as_bool) == Some(false)
        || object.get("success").and_then(Value::as_bool) == Some(false)
        || object.get("error").is_some()
    {
        return false;
    }
    !matches!(
        status_from_value(&value),
        Some(("failed" | "interrupted", _))
    )
}

fn agent_path_from_json(raw: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(raw).ok()?;
    fn find(value: &Value) -> Option<String> {
        match value {
            Value::Object(object) => {
                for key in [
                    "agent_path",
                    "agentPath",
                    "task_name",
                    "agent_name",
                    "target",
                ] {
                    if let Some(path) = object
                        .get(key)
                        .and_then(Value::as_str)
                        .filter(|value| value.starts_with('/'))
                    {
                        return Some(path.to_string());
                    }
                }
                object.get("agents")?.as_array()?.iter().find_map(find)
            }
            Value::Array(values) => values.iter().find_map(find),
            _ => None,
        }
    }
    find(&value)
}

fn agent_activity(name: &str, arguments: &str, output: &str) -> Value {
    let mut ids = agent_ids_from_json(arguments);
    for id in agent_ids_from_json(output) {
        push_agent_id(&mut ids, &id);
    }
    let explicit = explicit_agent_states(output);
    let mut states = serde_json::Map::new();
    for snapshot in explicit {
        push_agent_id(&mut ids, &snapshot.id);
        states.insert(
            snapshot.id,
            json!({"status": snapshot.status, "message": snapshot.message}),
        );
    }
    // A wait/list/message/interrupt result only proves that the operation was
    // observed; it does not prove the child reached a terminal state. Spawn,
    // follow-up, and resume calls are the operations that establish a new
    // running observation when they identify a receiver.
    if operation_allows_running(output)
        && matches!(
            name,
            "spawn_agent" | "followup_task" | "resume_agent" | "send_input"
        )
    {
        for id in &ids {
            states
                .entry(id.clone())
                .or_insert_with(|| json!({"status": "running", "message": Value::Null}));
        }
    }
    let mut activity = json!({
        "tool": name,
        "receiverThreadIds": ids,
        "agentsStates": Value::Object(states),
    });
    if ids.len() == 1 {
        if let Some(path) = agent_path_from_json(output).or_else(|| agent_path_from_json(arguments))
        {
            activity["agentPath"] = json!(path);
        }
    }
    activity
}

fn sanitized_collaboration_detail(input: &str) -> Value {
    let Ok(value) = serde_json::from_str::<Value>(input) else {
        return Value::Null;
    };
    for key in ["target", "task_name", "agent_thread_id", "agentThreadId"] {
        if let Some(id) = value
            .get(key)
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        {
            return Value::String(id.to_string());
        }
    }
    Value::Null
}

fn sanitized_collaboration_event(
    call_id: &str,
    name: &str,
    input: &str,
    output: &str,
    status: &str,
    timestamp: Option<i64>,
) -> Value {
    let mut event = json!({
        "kind": "tool_update",
        "id": call_id,
        "name": format!("agent:{name}"),
        "detail": sanitized_collaboration_detail(input),
        "input": {"target": sanitized_collaboration_detail(input)},
        "output": "",
        "status": status,
        "agentActivity": agent_activity(name, input, output),
    });
    if let Some(ts) = timestamp {
        event["ts"] = json!(ts);
    }
    event
}

fn tool_update_event(
    call_id: &str,
    name: &str,
    input: &str,
    output: &str,
    status: &str,
    timestamp: Option<i64>,
) -> Value {
    if COLLAB_TOOLS.contains(&name) {
        let mut event = json!({
            "kind": "tool_update",
            "id": call_id,
            "name": format!("agent:{name}"),
            "detail": tool_detail(input),
            "input": {"raw": input},
            "output": bound_output(output),
            "status": status,
            "agentActivity": agent_activity(name, input, output),
        });
        if let Some(ts) = timestamp {
            event["ts"] = json!(ts);
        }
        return event;
    }
    let mut event = json!({
        "kind": "tool_update",
        "id": call_id,
        "name": name,
        "detail": tool_detail(input),
        "input": {"raw": input},
        "output": bound_output(output),
        "status": status,
    });
    if let Some(ts) = timestamp {
        event["ts"] = json!(ts);
    }
    event
}

/// Le nouveau rollout natif porte les réponses assistant dans
/// `response_item.message.content[].output_text`; les anciens journaux
/// utilisaient encore `message: String` sur `agent_message`.
fn assistant_message_text(payload: &Value) -> Option<String> {
    if payload.get("role").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    let text = payload
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("output_text"))
        .filter_map(|item| item.get("text").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (!text.is_empty()).then(|| text.to_string())
}

fn event_message(payload: &Value) -> Option<String> {
    ["message", "last_agent_message", "reason", "error"]
        .into_iter()
        .filter_map(|key| payload.get(key).and_then(Value::as_str))
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(bound_output)
}

fn native_subagent_activity_update(item: &Value, timestamp: Option<i64>) -> Value {
    let thread_id = item
        .get("agent_thread_id")
        .or_else(|| item.get("agentThreadId"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let activity_kind = item
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("started");
    let normalized_kind: String = activity_kind
        .chars()
        .filter(|ch| !ch.is_whitespace() && *ch != '_' && *ch != '-')
        .flat_map(char::to_lowercase)
        .collect();
    let (tool_status, agent_status) = match normalized_kind.as_str() {
        "completed" | "complete" | "done" | "finished" | "succeeded" | "success" => {
            ("completed", "completed")
        }
        "failed" | "failure" | "errored" | "error" | "aborted" => ("failed", "failed"),
        "interrupted" | "cancelled" | "canceled" => ("completed", "interrupted"),
        _ => ("inProgress", "running"),
    };
    let mut event = json!({
        "kind": "tool_update",
        "id": item.get("id").cloned().unwrap_or_else(|| json!(format!("subagent:{thread_id}:{activity_kind}"))),
        "name": "agent:activity",
        "output": "",
        "status": tool_status,
        "source": "codex",
        "agentActivity": {
            "tool": "activity",
            "receiverThreadIds": [thread_id],
            "agentsStates": {
                (thread_id): { "status": agent_status, "message": Value::Null }
            },
            "agentThreadId": thread_id,
            "agentPath": item.get("agent_path").or_else(|| item.get("agentPath")).cloned().unwrap_or(Value::Null),
            "activityKind": activity_kind,
        },
    });
    if let Some(ts) = timestamp {
        event["ts"] = json!(ts);
    }
    event
}

fn row_timestamp(row: &Value) -> Option<i64> {
    row.get("timestamp")
        .and_then(Value::as_str)
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.timestamp_millis())
}

pub(crate) fn load_codex_history_from_base(base: &Path, session_id: &str) -> Vec<Value> {
    let Some(path) = find_session_file(base, session_id) else {
        return Vec::new();
    };
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    // call_id -> (name, input, namespace). Vec plutôt que HashMap pour garder
    // l'ordre d'insertion des appels restés sans sortie (< 10³ appels).
    let mut pending_calls: Vec<(String, String, String, Option<String>)> = Vec::new();
    let mut seen_assistant_texts = HashSet::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(row) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let payload = row.get("payload").unwrap_or(&row);
        let item_type = payload.get("type").and_then(Value::as_str).unwrap_or("");
        let timestamp = row_timestamp(&row);
        let call_id = || {
            payload
                .get("call_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        match item_type {
            "custom_tool_call" | "function_call" => {
                let name = payload
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let input = payload
                    .get("input")
                    .or_else(|| payload.get("arguments"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let namespace = payload
                    .get("namespace")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                pending_calls.push((call_id(), name, input, namespace));
                continue;
            }
            "custom_tool_call_output" | "function_call_output" => {
                let id = call_id();
                let Some(index) = pending_calls.iter().position(|(key, _, _, _)| *key == id) else {
                    continue;
                };
                let (_, name, input, namespace) = pending_calls.remove(index);
                // La sortie native est vide, mais l'argument de
                // collaboration.send_message peut être du ciphertext. Ne
                // jamais le refléter dans `input.raw`, `detail` ou `output`.
                if is_internal_collaboration_call(&name, namespace.as_deref()) {
                    continue;
                }
                let output = payload
                    .get("output")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if is_sanitized_collaboration_call(&name, namespace.as_deref()) {
                    events.push(sanitized_collaboration_event(
                        &id,
                        &name,
                        &input,
                        output,
                        "completed",
                        timestamp,
                    ));
                } else {
                    events.push(tool_update_event(
                        &id,
                        &name,
                        &input,
                        output,
                        "completed",
                        timestamp,
                    ));
                }
                continue;
            }
            "message" => {
                if let Some(text) = assistant_message_text(payload) {
                    let text = bound_output(&text);
                    if seen_assistant_texts.insert(text.clone()) {
                        let mut event = json!({"kind": "text", "text": text});
                        if let Some(ts) = timestamp {
                            event["ts"] = json!(ts);
                        }
                        events.push(event);
                    }
                }
                continue;
            }
            "item_completed" => {
                let Some(item) = payload.get("item") else {
                    continue;
                };
                let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
                if matches!(
                    item_type,
                    "SubAgentActivity" | "subAgentActivity" | "sub_agent_activity"
                ) {
                    events.push(native_subagent_activity_update(item, timestamp));
                }
                continue;
            }
            "task_started" => {
                // Un rollout peut contenir plusieurs tours (resume). Le
                // dédoublonnage ne doit couvrir qu'un tour : deux réponses
                // identiques sur deux tours restent deux événements.
                seen_assistant_texts.clear();
                let mut event = json!({"kind": "started"});
                if let Some(ts) = timestamp {
                    event["ts"] = json!(ts);
                }
                events.push(event);
                continue;
            }
            "task_complete" => {
                let result = event_message(payload).unwrap_or_default();
                // Certains rollouts ne matérialisent la réponse finale que
                // dans task_complete.last_agent_message. La rendre visible,
                // sans la doubler si response_item.message l'a déjà portée.
                if !result.is_empty() && seen_assistant_texts.insert(result.clone()) {
                    let mut text = json!({"kind": "text", "text": result.clone()});
                    if let Some(ts) = timestamp {
                        text["ts"] = json!(ts);
                    }
                    events.push(text);
                }
                let mut event = json!({
                    "kind": "done",
                    "ok": true,
                    "result": result,
                });
                if let Some(ts) = timestamp {
                    event["ts"] = json!(ts);
                }
                events.push(event);
                continue;
            }
            "turn_aborted" | "task_failed" => {
                let message = event_message(payload)
                    .unwrap_or_else(|| "Le sous-agent a été interrompu.".to_string());
                let mut error = json!({
                    "kind": "error",
                    "message": message.clone(),
                });
                if let Some(ts) = timestamp {
                    error["ts"] = json!(ts);
                }
                events.push(error);
                let mut done = json!({
                    "kind": "done",
                    "ok": false,
                    "result": message,
                });
                if let Some(ts) = timestamp {
                    done["ts"] = json!(ts);
                }
                events.push(done);
                continue;
            }
            "mcp_tool_call_end" => {
                let invocation = payload.get("invocation").cloned().unwrap_or(Value::Null);
                let server = invocation
                    .get("server")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let tool = invocation
                    .get("tool")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let (output, status) =
                    mcp_result_text(payload.get("result").unwrap_or(&Value::Null));
                events.push(json!({
                    "kind": "tool_update",
                    "id": call_id(),
                    "name": format!("{server}/{tool}"),
                    "input": invocation.get("arguments").cloned().unwrap_or(Value::Null),
                    "output": output,
                    "status": status,
                }));
                continue;
            }
            "patch_apply_end" => {
                let success = payload
                    .get("success")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let raw = if success {
                    payload.get("stdout").and_then(Value::as_str)
                } else {
                    payload
                        .get("stderr")
                        .and_then(Value::as_str)
                        .filter(|text| !text.is_empty())
                        .or_else(|| payload.get("stdout").and_then(Value::as_str))
                };
                events.push(json!({
                    "kind": "tool_update",
                    "id": call_id(),
                    "name": "apply_patch",
                    "output": bound_output(raw.unwrap_or_default()),
                    "status": if success { "completed" } else { "failed" },
                }));
                continue;
            }
            "agent_reasoning" => {
                let text = payload
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim();
                if !text.is_empty() {
                    events.push(json!({"kind": "thinking", "text": text}));
                }
                continue;
            }
            _ => {}
        }
        let kind = match item_type {
            "user_message" => "user",
            "agent_message" => "text",
            _ => continue,
        };
        let Some(raw) = payload
            .get("message")
            .and_then(Value::as_str)
            .map(str::trim)
        else {
            continue;
        };
        // strip des blocs d'outils Atelier (gallery/zotero/kb) sur les tours
        // utilisateur : le rollout Codex loggue le prompt provider complet
        let text = if kind == "user" {
            crate::grok_history::strip_gallery_tool_instruction(raw)
        } else {
            raw.to_string()
        };
        let text = text.trim();
        if text.is_empty()
            || kind == "user" && (text.starts_with('<') || text.starts_with("# AGENTS"))
        {
            continue;
        }
        if kind == "text" && !seen_assistant_texts.insert(text.to_string()) {
            continue;
        }
        events.push(json!({"kind": kind, "text": text}));
    }
    // appels restés sans sortie (rollout coupé) : les rendre quand même
    for (id, name, input, namespace) in pending_calls {
        if is_internal_collaboration_call(&name, namespace.as_deref()) {
            continue;
        }
        if is_sanitized_collaboration_call(&name, namespace.as_deref()) {
            events.push(sanitized_collaboration_event(
                &id,
                &name,
                &input,
                "",
                "inProgress",
                None,
            ));
        } else {
            events.push(tool_update_event(
                &id,
                &name,
                &input,
                "",
                "inProgress",
                None,
            ));
        }
    }
    events
}

// Un appel sans sortie devient un résultat sans changer le nombre d'événements.
// Réviser le contenu côté serveur évite de sérialiser le transcript dans WebKit.
pub(crate) fn history_revision(events: &[Value]) -> String {
    use std::hash::{Hash, Hasher};
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    events.hash(&mut hash);
    format!("{:016x}", hash.finish())
}

pub(crate) fn load_codex_history(session_id: &str) -> Vec<Value> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    load_codex_history_from_base(&PathBuf::from(home).join(".codex/sessions"), session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn pending_tool_result_changes_revision_without_growing_history() {
        let dir = tempfile::tempdir().unwrap();
        let id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(file, "{}", json!({"type":"response_item","payload":{"type":"function_call","call_id":"c1","name":"exec","arguments":"pwd"}})).unwrap();
        let pending = load_codex_history_from_base(dir.path(), id);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0]["status"], "inProgress");
        writeln!(file, "{}", json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"c1","output":"/tmp/project"}})).unwrap();
        let completed = load_codex_history_from_base(dir.path(), id);
        assert_eq!(completed.len(), pending.len());
        assert_eq!(completed[0]["status"], "completed");
        assert_eq!(completed[0]["output"], "/tmp/project");
        assert_ne!(history_revision(&pending), history_revision(&completed));
        assert_eq!(
            history_revision(&completed),
            history_revision(&load_codex_history_from_base(dir.path(), id))
        );
    }

    fn rollout_path(base: &Path, id: &str) -> PathBuf {
        let dir = base.join("2026/07/14");
        fs::create_dir_all(&dir).unwrap();
        dir.join(format!("rollout-2026-07-14T10-00-00-{id}.jsonl"))
    }

    fn write_rollout(base: &Path, id: &str) -> PathBuf {
        let path = rollout_path(base, id);
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"session_meta","payload":{"cwd":"/tmp/projet"}})
        )
        .unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"user_message","message":"Analyse cette figure\n\n<atelier-kb>\nSources attachées par l'utilisateur.\n</atelier-kb>"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"agent_message","message":"Voici l’analyse."}})).unwrap();
        path
    }

    #[test]
    fn lists_and_reads_native_codex_rollouts() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acd";
        write_rollout(dir.path(), id);
        let sessions = list_codex_sessions_from_base(dir.path());
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["id"], id);
        assert_eq!(sessions[0]["title"], "Analyse cette figure");
        assert_eq!(sessions[0]["projectRoot"], "/tmp/projet");
        assert_eq!(
            load_codex_history_from_base(dir.path(), id),
            vec![
                json!({"kind":"user","text":"Analyse cette figure"}),
                json!({"kind":"text","text":"Voici l’analyse."}),
            ]
        );
    }

    /// Le panneau d'un sous-agent doit montrer ce que l'agent FAIT : le
    /// parseur mappe les items d'outils du rollout, pas seulement la prose.
    #[test]
    fn maps_tool_items_from_rollout() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acd";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"session_meta","payload":{"id": id, "cwd":"/tmp/projet"}})
        )
        .unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"custom_tool_call","status":"completed","call_id":"c1","name":"exec","input":"const r = await tools.exec_command({cmd: \"wc -l a.py\"})"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"custom_tool_call_output","call_id":"c1","output":"42 a.py\n"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"agent_reasoning","text":"Je compte les lignes."}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"mcp_tool_call_end","call_id":"m1","invocation":{"server":"scholar","tool":"search_papers","arguments":{"query":"albedo"}},"result":{"Ok":{"content":[{"type":"text","text":"3 articles"}]}}}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"patch_apply_end","call_id":"p1","stdout":"Success. Updated a.py\n","stderr":"","success":true}})).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","payload":{"type":"agent_message","message":"Fini."}})
        )
        .unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        let kinds: Vec<&str> = events.iter().map(|e| e["kind"].as_str().unwrap()).collect();
        assert_eq!(
            kinds,
            [
                "tool_update",
                "thinking",
                "tool_update",
                "tool_update",
                "text"
            ]
        );
        assert_eq!(events[0]["id"], "c1");
        assert_eq!(events[0]["name"], "exec");
        assert_eq!(events[0]["output"], "42 a.py\n");
        assert_eq!(events[0]["status"], "completed");
        assert_eq!(events[1]["text"], "Je compte les lignes.");
        assert_eq!(events[2]["name"], "scholar/search_papers");
        assert_eq!(events[2]["output"], "3 articles");
        assert_eq!(events[3]["name"], "apply_patch");
        assert_eq!(events[3]["status"], "completed");
    }

    /// Après un reload où l'historique natif gagne sur le journal, les chips
    /// de sous-agents doivent repeupler : les appels collab du rollout
    /// produisent des tool_update porteurs d'agentActivity.
    #[test]
    fn maps_collab_calls_with_agent_activity() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acd";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"session_meta","payload":{"id": id, "cwd":"/tmp"}})
        )
        .unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call","name":"spawn_agent","call_id":"s1","arguments":"{\"prompt\":\"cherche X\"}"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call_output","call_id":"s1","output":"{\"agent_thread_id\":\"child-42\"}"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call","name":"wait","call_id":"w1","arguments":"{\"agent_thread_ids\":[\"child-42\"]}"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"function_call_output","call_id":"w1","output":"done"}})).unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        assert_eq!(events[0]["name"], "agent:spawn_agent");
        assert_eq!(
            events[0]["agentActivity"]["receiverThreadIds"][0],
            "child-42"
        );
        assert_eq!(events[1]["name"], "agent:wait");
        assert_eq!(
            events[1]["agentActivity"]["receiverThreadIds"][0],
            "child-42"
        );
        assert_eq!(events[1]["agentActivity"]["agentsStates"], json!({}));
    }

    #[test]
    fn ambiguous_wait_timeout_and_operation_failure_keep_identity_without_state() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683ad2";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        let spawn_output =
            serde_json::to_string(&json!({"agent_thread_id":"child-42","success":true})).unwrap();
        let wait_arguments =
            serde_json::to_string(&json!({"agent_thread_ids":["child-42"]})).unwrap();
        let interrupt_arguments = wait_arguments.clone();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call","namespace":"collaboration","name":"spawn_agent","call_id":"s1","arguments":"{}"}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"s1","output":spawn_output}})
        )
        .unwrap();
        let wait_output =
            serde_json::to_string(&json!({"message":"Wait timed out.","timed_out":true})).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call","namespace":"collaboration","name":"wait_agent","call_id":"w1","arguments":wait_arguments.clone()}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"w1","output":wait_output}})
        )
        .unwrap();
        let wait_success_output =
            serde_json::to_string(&json!({"agent_thread_id":"child-42","success":true})).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call","namespace":"collaboration","name":"wait_agent","call_id":"w2","arguments":wait_arguments}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"w2","output":wait_success_output}})
        )
        .unwrap();
        let failed_operation_output = serde_json::to_string(
            &json!({"ok":false,"error":"agent no longer exists","agent_thread_id":"child-42"}),
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call","namespace":"collaboration","name":"interrupt_agent","call_id":"i1","arguments":interrupt_arguments}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"i1","output":failed_operation_output}})
        )
        .unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        let spawn = events
            .iter()
            .find(|event| event["name"] == "agent:spawn_agent")
            .unwrap();
        assert_eq!(
            spawn["agentActivity"]["agentsStates"]["child-42"]["status"],
            "running"
        );
        for event in events.iter().filter(|event| {
            event["name"] == "agent:wait_agent" || event["name"] == "agent:interrupt_agent"
        }) {
            assert_eq!(event["agentActivity"]["receiverThreadIds"][0], "child-42");
            assert_eq!(event["agentActivity"]["agentsStates"], json!({}));
        }
    }

    #[test]
    fn maps_explicit_wait_status_map_to_terminal_agent_states() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683ad3";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        let output = serde_json::to_string(&json!({
            "status": {
                "child-success": {"completed": "résultat"},
                "child-fail": {"failed": "erreur"},
                "child-stop": {"interrupted": "arrêt"}
            },
            "timed_out": false
        }))
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call","namespace":"collaboration","name":"wait_agent","call_id":"w1","arguments":"{}"}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"w1","output":output}})
        )
        .unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        let activity = &events[0]["agentActivity"];
        let receiver_ids = activity["receiverThreadIds"].as_array().unwrap();
        assert_eq!(receiver_ids.len(), 3);
        for id in ["child-success", "child-fail", "child-stop"] {
            assert!(receiver_ids.iter().any(|value| value == id));
        }
        assert_eq!(
            activity["agentsStates"]["child-success"]["status"],
            "completed"
        );
        assert_eq!(
            activity["agentsStates"]["child-success"]["message"],
            "résultat"
        );
        assert_eq!(activity["agentsStates"]["child-fail"]["status"], "failed");
        assert_eq!(
            activity["agentsStates"]["child-stop"]["status"],
            "interrupted"
        );
    }

    #[test]
    fn followup_reactivates_native_id_without_replaying_ciphertext_or_paths() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683ad4";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        for (call_id, target, output_value) in [
            (
                "f1",
                "019f5e20-34f6-76c2-bad0-442af9683ad6",
                json!({"message":"ok"}),
            ),
            ("f2", "/root/test_alpha", json!({})),
            (
                "f3",
                "019f5e20-34f6-76c2-bad0-442af9683ad7",
                json!({"ok":false,"error":"resume refused"}),
            ),
        ] {
            let arguments =
                serde_json::to_string(&json!({"target":target,"message":"gAAAAA-secret"})).unwrap();
            let output = serde_json::to_string(&output_value).unwrap();
            writeln!(
                file,
                "{}",
                json!({"type":"response_item","payload":{"type":"function_call","namespace":"collaboration","name":"followup_task","call_id":call_id,"arguments":arguments}})
            )
            .unwrap();
            writeln!(
                file,
                "{}",
                json!({"type":"response_item","payload":{"type":"function_call_output","call_id":call_id,"output":output}})
            )
            .unwrap();
        }

        let events = load_codex_history_from_base(dir.path(), id);
        assert_eq!(events.len(), 3);
        let native = &events[0];
        assert_eq!(
            native["agentActivity"]["receiverThreadIds"],
            json!(["019f5e20-34f6-76c2-bad0-442af9683ad6"])
        );
        assert_eq!(
            native["agentActivity"]["agentsStates"]["019f5e20-34f6-76c2-bad0-442af9683ad6"]
                ["status"],
            "running"
        );
        let path_target = &events[1];
        assert_eq!(path_target["agentActivity"]["receiverThreadIds"], json!([]));
        assert_eq!(path_target["agentActivity"]["agentsStates"], json!({}));
        assert!(path_target["agentActivity"]["agentPath"].is_null());
        let failed = &events[2];
        assert_eq!(
            failed["agentActivity"]["receiverThreadIds"],
            json!(["019f5e20-34f6-76c2-bad0-442af9683ad7"])
        );
        assert_eq!(failed["agentActivity"]["agentsStates"], json!({}));
        assert!(!events
            .iter()
            .any(|event| event.to_string().contains("gAAAAA-secret")));
    }

    #[test]
    fn ambiguous_wait_does_not_replace_native_terminal_activity() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683ad5";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","timestamp":"2026-09-06T23:41:00.767Z","payload":{"type":"item_completed","item":{"type":"SubAgentActivity","id":"subagent-completed-child-1","kind":"completed","agent_thread_id":"child-1","agent_path":"/root/test_alpha"}}})
        )
        .unwrap();
        let wait_arguments =
            serde_json::to_string(&json!({"agent_thread_ids":["child-1"]})).unwrap();
        let wait_output =
            serde_json::to_string(&json!({"message":"Wait completed.","timed_out":false})).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","timestamp":"2026-09-06T23:41:01.000Z","payload":{"type":"function_call","namespace":"collaboration","name":"wait_agent","call_id":"w1","arguments":wait_arguments}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","timestamp":"2026-09-06T23:41:02.000Z","payload":{"type":"function_call_output","call_id":"w1","output":wait_output}})
        )
        .unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        let native = events
            .iter()
            .find(|event| event["name"] == "agent:activity")
            .unwrap();
        let wait = events
            .iter()
            .find(|event| event["name"] == "agent:wait_agent")
            .unwrap();
        assert_eq!(
            native["agentActivity"]["agentsStates"]["child-1"]["status"],
            "completed"
        );
        assert_eq!(wait["agentActivity"]["agentsStates"], json!({}));
        assert!(native["ts"].as_i64().unwrap() < wait["ts"].as_i64().unwrap());
    }

    #[test]
    fn reads_native_assistant_messages_and_terminal_status_without_ciphertext() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683ace";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","timestamp":"2026-09-06T23:17:14.337Z","payload":{"type":"task_started","turn_id":"turn-1"}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"message","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"Lecture terminée."}]}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"Résultat envoyé."}]}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call","namespace":"collaboration","name":"send_message","call_id":"m1","arguments":"{\"message\":\"gAAAAA-ciphertext\"}"}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"m1","output":""}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","timestamp":"2026-09-06T23:17:34.888Z","payload":{"type":"task_complete","last_agent_message":"Résultat envoyé."}})
        )
        .unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        assert_eq!(
            events
                .iter()
                .filter(|event| event["kind"] == "started")
                .count(),
            1
        );
        assert!(events
            .iter()
            .find(|event| event["kind"] == "started")
            .and_then(|event| event["ts"].as_i64())
            .is_some());
        assert_eq!(
            events.iter().find(|event| event["kind"] == "text").unwrap()["text"],
            "Lecture terminée."
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| event["kind"] == "text")
                .count(),
            2
        );
        let done = events.iter().find(|event| event["kind"] == "done").unwrap();
        assert_eq!(done["ok"], true);
        assert_eq!(done["result"], "Résultat envoyé.");
        assert!(done["ts"].as_i64().is_some());
        assert!(!events
            .iter()
            .any(|event| event.to_string().contains("gAAAAA")));
        assert!(!events.iter().any(|event| event["name"] == "send_message"));
    }

    #[test]
    fn replays_subagent_completed_three_ms_after_child_done() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683ad1";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        // This preserves the ordering observed in the native rollout: the
        // child's task_complete precedes the parent SubAgentActivity by 3 ms.
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","timestamp":"2026-09-06T23:41:00.764Z","payload":{"type":"task_complete","last_agent_message":"Résultat enfant."}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","timestamp":"2026-09-06T23:41:00.767Z","payload":{"type":"item_completed","item":{"type":"SubAgentActivity","id":"subagent-completed-child-1","kind":"completed","agent_thread_id":"child-1","agent_path":"/root/test_alpha"}}})
        )
        .unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        let done = events.iter().find(|event| event["kind"] == "done").unwrap();
        let activity = events
            .iter()
            .find(|event| event["name"] == "agent:activity")
            .unwrap();
        assert_eq!(done["ok"], true);
        assert_eq!(activity["status"], "completed");
        assert_eq!(
            activity["agentActivity"]["agentsStates"]["child-1"]["status"],
            "completed"
        );
        assert_eq!(activity["agentActivity"]["agentPath"], "/root/test_alpha");
        assert_eq!(
            activity["ts"].as_i64().unwrap() - done["ts"].as_i64().unwrap(),
            3
        );
    }

    #[test]
    fn maps_aborted_native_rollout_to_failed_terminal_event() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acf";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","timestamp":"2026-09-06T23:17:14.337Z","payload":{"type":"task_started","turn_id":"turn-1"}})
        )
        .unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"event_msg","timestamp":"2026-09-06T23:17:15.337Z","payload":{"type":"turn_aborted","reason":"arrêt demandé"}})
        )
        .unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        assert_eq!(events[1]["kind"], "error");
        assert_eq!(events[1]["message"], "arrêt demandé");
        assert_eq!(events[2]["kind"], "done");
        assert_eq!(events[2]["ok"], false);
        assert_eq!(events[2]["result"], "arrêt demandé");
        assert!(events[2]["ts"].as_i64().is_some());
    }

    #[test]
    fn keeps_repeated_assistant_text_when_a_new_turn_starts() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683ad0";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        for turn in ["turn-1", "turn-2"] {
            writeln!(
                file,
                "{}",
                json!({"type":"event_msg","payload":{"type":"task_started","turn_id":turn}})
            )
            .unwrap();
            writeln!(
                file,
                "{}",
                json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Même réponse."}]}})
            )
            .unwrap();
            writeln!(
                file,
                "{}",
                json!({"type":"event_msg","payload":{"type":"task_complete","last_agent_message":"Même réponse."}})
            )
            .unwrap();
        }

        let events = load_codex_history_from_base(dir.path(), id);
        assert_eq!(
            events
                .iter()
                .filter(|event| event["kind"] == "text")
                .count(),
            2
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| event["kind"] == "done")
                .count(),
            2
        );
    }

    #[test]
    fn rejects_hostile_session_ids() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load_codex_history_from_base(dir.path(), "../../etc/passwd").is_empty());
    }
}
