//! Map Claude CLI `--output-format stream-json` lines → harness event payloads.
//! Mirrors `sidecar/providers/claude.mjs` emit mapping (plan 033 Porte 6).

use serde_json::{json, Value};

const TOOL_OUTPUT_MAX: usize = 64 * 1024;
const TOOL_INPUT_MAX: usize = 16 * 1024;
/// Avant/après d'un Edit (ou contenu d'un Write de fichier NOUVEAU) porté par
/// l'événement `edit` pour un diff immédiat côté front — au-delà, fallback git.
const SNIPPET_MAX: usize = 24 * 1024;

/// Pending tool_use awaiting tool_result.
#[derive(Debug, Clone)]
pub struct PendingTool {
    pub id: String,
    pub name: String,
    pub detail: String,
    pub input: Value,
    pub source: Option<String>,
    pub edit_path: Option<String>,
    /// Avant/après capturé sur l'input (Edit/Write) pour le diff immédiat.
    pub snippet: Option<Value>,
    /// TodoWrite : jamais de ligne d'outil — la liste devient l'événement `todos`.
    pub silent: bool,
    pub todos_items: Option<Value>,
    pub started_at_ms: u128,
}

/// State carried across a single Claude process stream.
#[derive(Debug, Default)]
pub struct ClaudeStreamState {
    pub session_id: Option<String>,
    pub last_ctx: Option<u64>,
    /// Tokens de sortie cumulés du tour — ticker « Ns · Nk tokens » du front
    /// (heartbeat, éphémère par kind : jamais journalisé).
    pub turn_output_tokens: u64,
    pub pending_tools: std::collections::HashMap<String, PendingTool>,
    pub saw_terminal: bool,
}

/// Events emitted from one stream-json line (0..N harness payloads).
pub fn parse_line(state: &mut ClaudeStreamState, line: &str) -> Vec<Value> {
    let line = line.trim();
    if line.is_empty() {
        return Vec::new();
    }
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    parse_message(state, &msg)
}

pub fn parse_message(state: &mut ClaudeStreamState, msg: &Value) -> Vec<Value> {
    let mut out = Vec::new();
    let ty = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");

    if ty == "system" {
        let subtype = msg.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
        if subtype == "init" {
            if let Some(sid) = msg.get("session_id").and_then(|v| v.as_str()) {
                state.session_id = Some(sid.to_string());
            }
        }
        if subtype == "compact_boundary" {
            out.push(json!({"kind":"tool","name":"__compacted"}));
        }
        return out;
    }

    if ty == "stream_event" {
        if let Some(ev) = msg.get("event") {
            let et = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if et == "content_block_delta" {
                if let Some(delta) = ev.get("delta") {
                    let dt = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if dt == "text_delta" {
                        if let Some(t) = delta.get("text").and_then(|v| v.as_str()) {
                            out.push(json!({"kind":"delta","text": t}));
                        }
                    }
                    if dt == "thinking_delta" {
                        if let Some(t) = delta.get("thinking").and_then(|v| v.as_str()) {
                            if !t.is_empty() {
                                out.push(json!({"kind":"thinking_delta","text": t}));
                            }
                        }
                    }
                }
            }
        }
        return out;
    }

    if ty == "assistant" {
        if let Some(au) = msg.pointer("/message/usage") {
            let ctx = au.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
                + au
                    .get("cache_read_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
                + au
                    .get("cache_creation_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
            if ctx > 0 {
                state.last_ctx = Some(ctx);
            }
            state.turn_output_tokens += au
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            out.push(json!({"kind":"heartbeat","tokens": state.turn_output_tokens}));
        }
        if let Some(blocks) = msg.pointer("/message/content").and_then(|v| v.as_array()) {
            for block in blocks {
                let bt = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if bt == "text" {
                    if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                        out.push(json!({"kind":"text","text": t}));
                    }
                }
                if bt == "thinking" {
                    if let Some(t) = block.get("thinking").and_then(|v| v.as_str()) {
                        if !t.is_empty() {
                            out.push(json!({"kind":"thinking","text": t}));
                        }
                    }
                }
                if bt == "tool_use" {
                    let id = block
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let name = block
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("tool")
                        .to_string();
                    let input = block.get("input").cloned().unwrap_or(json!({}));
                    // TodoWrite : pas de ligne d'outil — la liste devient l'événement
                    // `todos` (checklist du fil, singleton côté reducer), émis au
                    // succès. Même rendu que le plan Codex (turn/plan/updated).
                    if name == "TodoWrite" {
                        let items: Vec<Value> = input
                            .get("todos")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|td| {
                                        let text =
                                            td.get("content").and_then(|v| v.as_str()).unwrap_or("");
                                        if text.is_empty() {
                                            return None;
                                        }
                                        let status =
                                            td.get("status").and_then(|v| v.as_str()).unwrap_or("");
                                        let mut item = json!({
                                            "text": text,
                                            "completed": status == "completed",
                                        });
                                        if status == "in_progress" {
                                            item.as_object_mut()
                                                .unwrap()
                                                .insert("active".into(), json!(true));
                                        }
                                        Some(item)
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        state.pending_tools.insert(
                            id.clone(),
                            PendingTool {
                                id,
                                name,
                                detail: String::new(),
                                input: json!({}),
                                source: None,
                                edit_path: None,
                                snippet: None,
                                silent: true,
                                todos_items: if items.is_empty() {
                                    None
                                } else {
                                    Some(Value::Array(items))
                                },
                                started_at_ms: now_ms(),
                            },
                        );
                        continue;
                    }
                    let detail = tool_detail(&name, &input);
                    let edit_path = if matches!(name.as_str(), "Edit" | "Write" | "NotebookEdit") {
                        input
                            .get("file_path")
                            .or_else(|| input.get("notebook_path"))
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                            .filter(|s| !s.is_empty())
                    } else {
                        None
                    };
                    // Diff immédiat : l'input porte déjà l'avant/après (Edit) ou le
                    // contenu d'un fichier NOUVEAU (Write, vérifié sur disque avant
                    // exécution) — attaché à l'événement `edit` au succès.
                    let snippet = if name == "Edit" {
                        let old_text = input.get("old_string").and_then(|v| v.as_str()).unwrap_or("");
                        let new_text = input.get("new_string").and_then(|v| v.as_str()).unwrap_or("");
                        if old_text.len() <= SNIPPET_MAX && new_text.len() <= SNIPPET_MAX {
                            Some(json!({"oldText": old_text, "newText": new_text}))
                        } else {
                            None
                        }
                    } else if name == "Write" {
                        match edit_path.as_deref() {
                            Some(p) if !std::path::Path::new(p).exists() => {
                                let new_text =
                                    input.get("content").and_then(|v| v.as_str()).unwrap_or("");
                                if !new_text.is_empty() && new_text.len() <= SNIPPET_MAX {
                                    Some(json!({"newText": new_text}))
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        }
                    } else {
                        None
                    };
                    let source = if name.starts_with("mcp__") {
                        Some("mcp".into())
                    } else {
                        None
                    };
                    let pt = PendingTool {
                        id: id.clone(),
                        name: name.clone(),
                        detail: detail.clone(),
                        input: bounded_input(&input),
                        source: source.clone(),
                        edit_path,
                        snippet,
                        silent: false,
                        todos_items: None,
                        started_at_ms: now_ms(),
                    };
                    state.pending_tools.insert(id.clone(), pt.clone());
                    out.push(json!({
                        "kind": "tool_update",
                        "id": id,
                        "name": name,
                        "detail": detail,
                        "input": pt.input,
                        "source": source,
                        "status": "running",
                        "output": "",
                    }));
                }
            }
        }
        // auth failure often arrives as assistant + error field
        if msg.get("error").is_some() {
            if let Some(text) = msg
                .pointer("/message/content/0/text")
                .and_then(|v| v.as_str())
            {
                if text.to_lowercase().contains("not logged in")
                    || text.to_lowercase().contains("login")
                {
                    // still emit text; result will follow
                }
            }
        }
        return out;
    }

    if ty == "user" {
        if let Some(blocks) = msg.pointer("/message/content").and_then(|v| v.as_array()) {
            for block in blocks {
                if block.get("type").and_then(|v| v.as_str()) != Some("tool_result") {
                    continue;
                }
                let (output, truncated, original_length) = normalize_tool_result(block);
                let tool_use_id = block
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let failed = block
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if let Some(pt) = state.pending_tools.remove(tool_use_id) {
                    if pt.silent {
                        // TodoWrite : la checklist remplace la ligne d'outil
                        if !failed {
                            if let Some(items) = pt.todos_items {
                                out.push(json!({"kind":"todos","items": items}));
                            }
                        }
                        continue;
                    }
                    let duration = now_ms().saturating_sub(pt.started_at_ms);
                    let mut ev = json!({
                        "kind": "tool_update",
                        "id": pt.id,
                        "name": pt.name,
                        "detail": pt.detail,
                        "input": pt.input,
                        "source": pt.source,
                        "status": if failed { "failed" } else { "completed" },
                        "output": output,
                        "durationMs": duration,
                    });
                    if truncated {
                        ev.as_object_mut().unwrap().insert("truncated".into(), json!(true));
                        ev.as_object_mut()
                            .unwrap()
                            .insert("outputLength".into(), json!(original_length));
                    }
                    out.push(ev);
                    if let Some(path) = pt.edit_path {
                        if !failed {
                            let mut edit = json!({"kind":"edit","files":[path.clone()]});
                            if let Some(sn) = pt.snippet {
                                let mut snippets = serde_json::Map::new();
                                snippets.insert(path, sn);
                                edit.as_object_mut()
                                    .unwrap()
                                    .insert("snippets".into(), Value::Object(snippets));
                            }
                            out.push(edit);
                        }
                    }
                } else {
                    out.push(json!({
                        "kind": "tool_update",
                        "id": tool_use_id,
                        "name": "unknown",
                        "source": "unknown",
                        "status": "completed",
                        "output": output,
                    }));
                }
            }
        }
        return out;
    }

    if ty == "result" {
        flush_pending(state, &mut out);
        state.turn_output_tokens = 0; // le ticker repart à zéro au prochain tour
        let subtype = msg.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
        let ok = subtype == "success"
            && !msg
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        if let Some(sid) = msg.get("session_id").and_then(|v| v.as_str()) {
            state.session_id = Some(sid.to_string());
        }
        let u = msg.get("usage").cloned().unwrap_or(json!({}));
        let context = state.last_ctx.unwrap_or_else(|| {
            u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
                + u.get("cache_read_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
                + u.get("cache_creation_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
        });
        if ok {
            out.push(json!({
                "kind": "done",
                "ok": true,
                "result": msg.get("result").and_then(|v| v.as_str()).unwrap_or(""),
                "usage": {
                    "context": context,
                    "output": u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    "cost": msg.get("total_cost_usd"),
                    "turns": msg.get("num_turns"),
                }
            }));
        } else {
            let message = msg
                .get("result")
                .and_then(|v| v.as_str())
                .unwrap_or("claude error")
                .to_string();
            // Prefer done with ok:false to match Node when subtype success+is_error
            if subtype == "success" {
                out.push(json!({
                    "kind": "done",
                    "ok": false,
                    "result": message,
                    "usage": {
                        "context": context,
                        "output": u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                        "cost": msg.get("total_cost_usd"),
                        "turns": msg.get("num_turns"),
                    }
                }));
            } else {
                out.push(json!({"kind":"error","message": message}));
            }
        }
        state.saw_terminal = true;
        return out;
    }

    out
}

pub fn flush_pending(state: &mut ClaudeStreamState, out: &mut Vec<Value>) {
    for pt in state.pending_tools.values() {
        if pt.silent {
            continue; // TodoWrite : jamais de ligne d'outil, même interrompue
        }
        out.push(json!({
            "kind": "tool_update",
            "id": pt.id,
            "name": pt.name,
            "detail": pt.detail,
            "input": pt.input,
            "source": pt.source,
            "status": "interrupted",
            "output": "",
        }));
    }
    state.pending_tools.clear();
}

pub fn tool_detail(name: &str, input: &Value) -> String {
    let first = |v: Option<&Value>| {
        v.and_then(|x| x.as_str())
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .chars()
            .take(80)
            .collect::<String>()
    };
    match name {
        // même rendu que Claude Code desktop : la description rédigée par le
        // modèle prime sur la commande brute (visible dans l'input déplié)
        "Bash" => {
            let d = first(input.get("description"));
            if d.is_empty() {
                first(input.get("command"))
            } else {
                d
            }
        }
        "Read" | "Edit" | "Write" | "NotebookEdit" => {
            let p = input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if p.len() > 60 {
                format!("…{}", &p[p.len() - 59..])
            } else {
                p.to_string()
            }
        }
        "Grep" | "Glob" => first(input.get("pattern")),
        "WebFetch" => first(input.get("url")),
        "WebSearch" => first(input.get("query")),
        "Task" | "Agent" => {
            let d = first(input.get("description"));
            if d.is_empty() {
                first(input.get("prompt"))
            } else {
                d
            }
        }
        _ => String::new(),
    }
}

fn bounded_input(input: &Value) -> Value {
    match serde_json::to_string(input) {
        Ok(s) if s.len() <= TOOL_INPUT_MAX => input.clone(),
        Ok(s) => json!({"truncated": true, "preview": s.chars().take(TOOL_INPUT_MAX).collect::<String>()}),
        Err(_) => json!({}),
    }
}

fn normalize_tool_result(block: &Value) -> (String, bool, usize) {
    let c = block.get("content");
    let text = match c {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(arr)) => arr
            .iter()
            .map(|b| {
                if let Some(s) = b.as_str() {
                    s.to_string()
                } else if b.get("type").and_then(|v| v.as_str()) == Some("text") {
                    b.get("text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                } else {
                    b.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Some(other) => other.to_string(),
        None => String::new(),
    };
    let original = text.len();
    let truncated = original > TOOL_OUTPUT_MAX;
    let output = if truncated {
        text.chars().take(TOOL_OUTPUT_MAX).collect()
    } else {
        text
    };
    (output, truncated, original)
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_init_and_text_and_result() {
        let mut st = ClaudeStreamState::default();
        let e1 = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"init","session_id":"abc-123"}"#,
        );
        assert!(e1.is_empty());
        assert_eq!(st.session_id.as_deref(), Some("abc-123"));

        let e2 = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}"#,
        );
        assert_eq!(e2[0]["kind"], "text");
        assert_eq!(e2[0]["text"], "hi");

        let e3 = parse_line(
            &mut st,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"hi","session_id":"abc-123","usage":{"input_tokens":10,"output_tokens":2},"num_turns":1}"#,
        );
        assert_eq!(e3[0]["kind"], "done");
        assert_eq!(e3[0]["ok"], true);
        assert!(st.saw_terminal);
    }

    #[test]
    fn tool_use_and_result() {
        let mut st = ClaudeStreamState::default();
        let e1 = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]}}"#,
        );
        assert_eq!(e1[0]["kind"], "tool_update");
        assert_eq!(e1[0]["status"], "running");
        assert_eq!(e1[0]["detail"], "ls");

        let e2 = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"a\nb"}]}}"#,
        );
        assert_eq!(e2[0]["status"], "completed");
        assert_eq!(e2[0]["output"], "a\nb");
    }

    #[test]
    fn stream_delta() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}}"#,
        );
        assert_eq!(e[0]["kind"], "delta");
        assert_eq!(e[0]["text"], "Hel");
    }

    #[test]
    fn auth_failure_result() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login","session_id":"x","usage":{}}"#,
        );
        assert_eq!(e[0]["kind"], "done");
        assert_eq!(e[0]["ok"], false);
    }
}
