//! Pure Codex notification → harness event mapping (plan 033 Porte 7).
//! Ports the tested surfaces from `sidecar/providers/codex.mjs`.

use std::collections::HashMap;

use serde_json::{json, Value};

pub const TOOL_OUTPUT_MAX: usize = 64 * 1024;

#[derive(Debug, Default)]
pub struct TurnMapState {
    pub stream_text: String,
    pub native_turn_id: Option<String>,
    command_items: HashMap<String, Value>,
    command_outputs: HashMap<String, String>,
}

pub fn bound_tool_output(value: &str) -> Value {
    let original = value.len();
    if original <= TOOL_OUTPUT_MAX {
        return json!({"output": value});
    }
    json!({
        "output": value.chars().take(TOOL_OUTPUT_MAX).collect::<String>(),
        "truncated": true,
        "outputLength": original,
    })
}

pub fn command_name(item: &Value) -> String {
    let mut cmd = item
        .get("command")
        .and_then(|v| v.as_str())
        .unwrap_or("commande")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    // strip `/bin/zsh -lc '…'` wrapper
    if let Some(rest) = cmd
        .strip_prefix("zsh -lc ")
        .or_else(|| cmd.strip_prefix("bash -lc "))
        .or_else(|| cmd.strip_prefix("sh -c "))
    {
        let r = rest.trim();
        if (r.starts_with('\'') && r.ends_with('\'')) || (r.starts_with('"') && r.ends_with('"')) {
            cmd = r[1..r.len() - 1].to_string();
        }
    }
    if cmd.chars().count() > 64 {
        format!("{}…", cmd.chars().take(64).collect::<String>())
    } else {
        cmd
    }
}

/// Classify Codex `error` notification — mid-turn never terminal if willRetry.
pub fn classify_codex_error(params: &Value) -> Option<Value> {
    if params.get("willRetry").and_then(|v| v.as_bool()) == Some(true) {
        return None;
    }
    let message = params
        .get("message")
        .or_else(|| params.pointer("/error/message"))
        .and_then(|v| v.as_str())
        .unwrap_or("erreur Codex");
    // Non-terminal diagnostic mid-turn
    Some(json!({
        "kind": "tool",
        "name": "__codex-error",
        "detail": message,
    }))
}

/// Map one notification method to harness events (core surface).
pub fn map_turn_notification(method: &str, params: &Value, state: &mut TurnMapState) -> Vec<Value> {
    let mut events = Vec::new();
    let item = params.get("item").cloned().unwrap_or(json!({}));

    match method {
        "turn/started" => {
            state.stream_text.clear();
            state.command_items.clear();
            state.command_outputs.clear();
            state.native_turn_id = params
                .pointer("/turn/id")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let mut ev = json!({"kind": "started"});
            if let Some(ref t) = state.native_turn_id {
                ev.as_object_mut()
                    .unwrap()
                    .insert("nativeTurnId".into(), json!(t));
            }
            events.push(ev);
        }
        "item/started" => {
            let ty = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match ty {
                "reasoning" => events.push(json!({"kind":"tool","name":"__thinking"})),
                "webSearch" => {
                    events.push(web_search_update(&item, "inProgress"));
                }
                "commandExecution" => {
                    remember_command(state, &item);
                    events.push(command_update(&item, "inProgress", None));
                }
                "fileChange" => {
                    events.push(file_change_update(&item, "inProgress"));
                }
                "mcpToolCall" => {
                    events.push(mcp_update(&item, None));
                }
                "dynamicToolCall" => {
                    events.push(dynamic_tool_update(&item, "inProgress"));
                }
                "imageGeneration" => {
                    events.push(image_generation_update(&item, "inProgress"));
                }
                "sleep" => {
                    events.push(simple_codex_activity(&item, "sleep", "inProgress"));
                }
                "contextCompaction" => {
                    events.push(simple_codex_activity(&item, "__compacted", "inProgress"));
                }
                "imageView" => {
                    let path = item.get("path").and_then(Value::as_str).unwrap_or("");
                    let id = item.get("id").cloned().unwrap_or_else(|| {
                        json!(format!(
                            "image:{}",
                            if path.is_empty() { "unknown" } else { path }
                        ))
                    });
                    events.push(json!({
                        "kind": "tool_update",
                        "id": id,
                        "name": "view_image",
                        "output": "",
                        "status": "completed",
                        "input": { "paths": if path.is_empty() { Vec::<String>::new() } else { vec![path.to_string()] } },
                        "source": "codex",
                    }));
                }
                "collabAgentToolCall" => {
                    events.push(collab_agent_update(&item));
                }
                "subAgentActivity" => {
                    events.push(subagent_activity_update(&item));
                }
                _ => {}
            }
        }
        "item/updated" => {
            let ty = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match ty {
                "commandExecution" => {
                    remember_command(state, &item);
                    events.push(command_update(
                        &item,
                        item.get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("inProgress"),
                        None,
                    ));
                }
                "fileChange" => events.push(file_change_update(
                    &item,
                    item.get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("inProgress"),
                )),
                "mcpToolCall" => events.push(mcp_update(&item, None)),
                "dynamicToolCall" => events.push(dynamic_tool_update(
                    &item,
                    item.get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("inProgress"),
                )),
                "imageGeneration" => events.push(image_generation_update(
                    &item,
                    item.get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("inProgress"),
                )),
                "collabAgentToolCall" => events.push(collab_agent_update(&item)),
                "subAgentActivity" => events.push(subagent_activity_update(&item)),
                _ => {}
            }
        }
        "item/agentMessage/delta" => {
            state
                .stream_text
                .push_str(params.get("delta").and_then(|v| v.as_str()).unwrap_or(""));
            events.push(json!({"kind":"stream_set","text": state.stream_text}));
        }
        "item/commandExecution/outputDelta" => {
            let id = params.get("itemId").and_then(Value::as_str).unwrap_or("");
            let delta = params.get("delta").and_then(Value::as_str).unwrap_or("");
            let output = state.command_outputs.entry(id.to_string()).or_default();
            output.push_str(delta);
            if output.len() > TOOL_OUTPUT_MAX {
                let mut boundary = TOOL_OUTPUT_MAX;
                while boundary > 0 && !output.is_char_boundary(boundary) {
                    boundary -= 1;
                }
                output.truncate(boundary);
            }
            let fallback = json!({"id": id, "command": "", "cwd": null, "commandActions": []});
            let command = state.command_items.get(id).unwrap_or(&fallback);
            let mut ev = command_update(command, "inProgress", Some(output));
            ev.as_object_mut()
                .expect("command update object")
                .insert("__ephemeral".into(), json!(true));
            events.push(ev);
        }
        "item/completed" => {
            let ty = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match ty {
                "agentMessage" => {
                    state.stream_text.clear();
                    events.push(json!({
                        "kind": "text",
                        "text": item.get("text").and_then(|v| v.as_str()).unwrap_or(""),
                    }));
                }
                "reasoning" => {
                    let mut parts = Vec::new();
                    if let Some(arr) = item.get("content").and_then(|v| v.as_array()) {
                        for p in arr {
                            if let Some(s) = p.as_str() {
                                parts.push(s.to_string());
                            }
                        }
                    }
                    if let Some(arr) = item.get("summary").and_then(|v| v.as_array()) {
                        for p in arr {
                            if let Some(s) = p.as_str() {
                                parts.push(s.to_string());
                            }
                        }
                    }
                    let text = parts.join("\n\n");
                    if !text.is_empty() {
                        events.push(json!({"kind":"thinking","text": text}));
                    }
                }
                "commandExecution" => {
                    remember_command(state, &item);
                    events.push(command_update(
                        &item,
                        item.get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("completed"),
                        None,
                    ));
                }
                "fileChange" => {
                    events.push(file_change_update(
                        &item,
                        item.get("status")
                            .and_then(|v| v.as_str())
                            .unwrap_or("completed"),
                    ));
                    let paths: Vec<String> = item
                        .get("changes")
                        .and_then(|v| v.as_array())
                        .map(|a| {
                            a.iter()
                                .filter_map(|ch| {
                                    ch.get("path").and_then(|p| p.as_str()).map(str::to_string)
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if !paths.is_empty() {
                        events.push(json!({"kind":"edit","files": paths}));
                    }
                }
                "mcpToolCall" => {
                    events.push(mcp_update(&item, None));
                }
                "webSearch" => {
                    events.push(web_search_update(&item, "completed"));
                }
                "dynamicToolCall" => {
                    let status = if item.get("success").and_then(Value::as_bool) == Some(false) {
                        "failed"
                    } else {
                        item.get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("completed")
                    };
                    events.push(dynamic_tool_update(&item, status));
                }
                "imageGeneration" => {
                    events.push(image_generation_update(
                        &item,
                        item.get("status")
                            .and_then(Value::as_str)
                            .unwrap_or("completed"),
                    ));
                }
                "sleep" => {
                    events.push(simple_codex_activity(&item, "sleep", "completed"));
                }
                "contextCompaction" => {
                    events.push(simple_codex_activity(&item, "__compacted", "completed"));
                }
                "collabAgentToolCall" => {
                    events.push(collab_agent_update(&item));
                }
                "subAgentActivity" => {
                    events.push(subagent_activity_update(&item));
                }
                _ => {}
            }
        }
        "turn/completed" => {
            state.stream_text.clear();
            let status = params
                .pointer("/turn/status")
                .and_then(|v| v.as_str())
                .unwrap_or("completed");
            let ok = status != "failed";
            let result = if ok {
                String::new()
            } else {
                params
                    .pointer("/turn/error/message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("échec")
                    .to_string()
            };
            events.push(json!({"kind":"done","ok": ok, "result": result}));
        }
        "error" => {
            if let Some(ev) = classify_codex_error(params) {
                events.push(ev);
            }
        }
        "thread/tokenUsage/updated" => {
            // optional usage snapshot
            if let Some(info) = params.get("info").or_else(|| params.get("tokenUsage")) {
                events.push(json!({
                    "kind": "usage",
                    "context": info.pointer("/last_token_usage/total_tokens")
                        .or_else(|| info.get("totalTokens")),
                    "output": info.pointer("/total_token_usage/output_tokens"),
                    "window": info.get("model_context_window"),
                }));
            }
        }
        _ => {}
    }
    events
}

fn item_id(item: &Value, fallback: &str) -> Value {
    item.get("id").cloned().unwrap_or_else(|| json!(fallback))
}

fn remember_command(state: &mut TurnMapState, item: &Value) {
    let Some(id) = item.get("id").and_then(Value::as_str) else {
        return;
    };
    let remembered = state
        .command_items
        .entry(id.to_string())
        .or_insert_with(|| json!({}));
    if let (Some(target), Some(update)) = (remembered.as_object_mut(), item.as_object()) {
        for (key, value) in update {
            target.insert(key.clone(), value.clone());
        }
    } else {
        *remembered = item.clone();
    }
    if let Some(output) = item.get("aggregatedOutput").and_then(Value::as_str) {
        state
            .command_outputs
            .insert(id.to_string(), output.to_string());
    }
}

fn command_update(item: &Value, status: &str, output_override: Option<&str>) -> Value {
    let output = output_override.unwrap_or_else(|| {
        item.get("aggregatedOutput")
            .and_then(Value::as_str)
            .unwrap_or("")
    });
    let mut event = json!({
        "kind": "tool_update",
        "id": item_id(item, "command"),
        "name": "Bash",
        "status": status,
        "detail": command_name(item),
        "input": {
            "command": item.get("command").cloned().unwrap_or_else(|| json!("")),
            "cwd": item.get("cwd").cloned().unwrap_or(Value::Null),
            "source": item.get("source").cloned().unwrap_or(Value::Null),
            "commandActions": item.get("commandActions").cloned().unwrap_or_else(|| json!([])),
        },
        "source": "codex",
    });
    if let Some(code) = item.get("exitCode") {
        event
            .as_object_mut()
            .expect("command update object")
            .insert("exitCode".into(), code.clone());
    }
    let bounded = bound_tool_output(output);
    if let (Some(target), Some(fields)) = (event.as_object_mut(), bounded.as_object()) {
        for (key, value) in fields {
            target.insert(key.clone(), value.clone());
        }
    }
    event
}

fn web_search_update(item: &Value, status: &str) -> Value {
    let query = item.get("query").and_then(Value::as_str).unwrap_or("");
    json!({
        "kind": "tool_update",
        "id": item_id(item, "web-search"),
        "name": "web_search",
        "output": "",
        "status": status,
        "detail": query,
        "input": {
            "query": query,
            "action": item.get("action").cloned().unwrap_or(Value::Null),
        },
        "source": "codex",
    })
}

fn dynamic_tool_name(item: &Value) -> String {
    [item.get("namespace"), item.get("tool")]
        .into_iter()
        .filter_map(|part| part.and_then(Value::as_str))
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn dynamic_tool_update(item: &Value, status: &str) -> Value {
    let name = dynamic_tool_name(item);
    let name = if name.is_empty() {
        "dynamicTool".to_string()
    } else {
        name
    };
    let output = item
        .get("contentItems")
        .filter(|value| !value.is_null())
        .map(Value::to_string)
        .unwrap_or_default();
    let mut event = json!({
        "kind": "tool_update",
        "id": item_id(item, "dynamic-tool"),
        "name": name,
        "status": status,
        "detail": name,
        "input": item.get("arguments").cloned().unwrap_or(Value::Null),
        "source": "dynamic",
    });
    let bounded = bound_tool_output(&output);
    if let (Some(target), Some(fields)) = (event.as_object_mut(), bounded.as_object()) {
        for (key, value) in fields {
            target.insert(key.clone(), value.clone());
        }
    }
    event
}

fn image_generation_update(item: &Value, status: &str) -> Value {
    let output = item
        .get("savedPath")
        .or_else(|| item.get("result"))
        .and_then(Value::as_str)
        .unwrap_or("");
    json!({
        "kind": "tool_update",
        "id": item_id(item, "image-generation"),
        "name": "image_generation",
        "output": output,
        "status": status,
        "detail": item.get("revisedPrompt").cloned().unwrap_or(Value::Null),
        "input": {
            "revisedPrompt": item.get("revisedPrompt").cloned().unwrap_or(Value::Null),
        },
        "source": "codex",
    })
}

fn simple_codex_activity(item: &Value, name: &str, status: &str) -> Value {
    json!({
        "kind": "tool_update",
        "id": item_id(item, name),
        "name": name,
        "output": "",
        "status": status,
        "source": "codex",
    })
}

fn collab_agent_update(item: &Value) -> Value {
    let tool = item.get("tool").and_then(Value::as_str).unwrap_or("collab");
    let receiver_thread_ids = item
        .get("receiverThreadIds")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let agents_states = item
        .get("agentsStates")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let model = item.get("model").and_then(Value::as_str);
    let effort = item.get("reasoningEffort").and_then(Value::as_str);
    let detail = match (model, effort) {
        (Some(model), Some(effort)) => Some(format!("{model} · {effort}")),
        (Some(model), None) => Some(model.to_string()),
        _ => None,
    };
    let mut event = json!({
        "kind": "tool_update",
        "id": item.get("id").cloned().unwrap_or_else(|| json!(format!("agent:{tool}"))),
        "name": format!("agent:{tool}"),
        "output": serde_json::to_string(&json!({
            "receiverThreadIds": receiver_thread_ids,
            "agentsStates": agents_states,
        })).unwrap_or_default(),
        "status": item.get("status").cloned().unwrap_or_else(|| json!("inProgress")),
        "input": {
            "prompt": item.get("prompt").cloned().unwrap_or(Value::Null),
            "model": item.get("model").cloned().unwrap_or(Value::Null),
            "reasoningEffort": item.get("reasoningEffort").cloned().unwrap_or(Value::Null),
        },
        "source": "codex",
        "agentActivity": {
            "tool": tool,
            "senderThreadId": item.get("senderThreadId").cloned().unwrap_or(Value::Null),
            "receiverThreadIds": receiver_thread_ids,
            "agentsStates": agents_states,
            "prompt": item.get("prompt").cloned().unwrap_or(Value::Null),
            "model": item.get("model").cloned().unwrap_or(Value::Null),
            "reasoningEffort": item.get("reasoningEffort").cloned().unwrap_or(Value::Null),
        },
    });
    if let Some(detail) = detail {
        event
            .as_object_mut()
            .expect("tool_update object")
            .insert("detail".into(), json!(detail));
    }
    event
}

fn subagent_activity_update(item: &Value) -> Value {
    let thread_id = item
        .get("agentThreadId")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let activity_kind = item
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or("started");
    let (tool_status, agent_status) = match activity_kind {
        "interrupted" => ("completed", "interrupted"),
        _ => ("inProgress", "running"),
    };
    json!({
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
            "agentPath": item.get("agentPath").cloned().unwrap_or(Value::Null),
            "activityKind": activity_kind,
        },
    })
}

fn file_change_update(item: &Value, status: &str) -> Value {
    let changes = item.get("changes").cloned().unwrap_or(json!([]));
    let files: Vec<String> = changes
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|ch| {
                    ch.get("path")
                        .and_then(|p| p.as_str())
                        .map(|p| p.rsplit('/').next().unwrap_or(p).to_string())
                })
                .take(3)
                .collect()
        })
        .unwrap_or_default();
    let detail = if files.is_empty() {
        "Files changed".into()
    } else {
        files.join(", ")
    };
    let diff = changes
        .as_array()
        .map(|a| {
            a.iter()
                .map(|ch| {
                    format!(
                        "# {}\n{}",
                        ch.get("path").and_then(|v| v.as_str()).unwrap_or("file"),
                        ch.get("diff").and_then(|v| v.as_str()).unwrap_or("")
                    )
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default();
    json!({
        "kind": "tool_update",
        "id": item.get("id"),
        "name": "apply_patch",
        "output": diff,
        "status": status,
        "detail": detail,
        "input": { "changes": changes },
        "source": "codex",
    })
}

fn mcp_update(item: &Value, message: Option<&str>) -> Value {
    let name = [item.get("server"), item.get("tool")]
        .into_iter()
        .filter_map(|v| v.and_then(|x| x.as_str()))
        .collect::<Vec<_>>()
        .join("/");
    let name = if name.is_empty() {
        item.get("tool")
            .and_then(|v| v.as_str())
            .unwrap_or("mcp")
            .to_string()
    } else {
        name
    };
    let output = if let Some(m) = message {
        m.to_string()
    } else if let Some(e) = item.get("error") {
        e.to_string()
    } else if let Some(r) = item.get("result") {
        r.to_string()
    } else {
        String::new()
    };
    let mut bounded = bound_tool_output(&output);
    let mut ev = json!({
        "kind": "tool_update",
        "id": item.get("id"),
        "name": name,
        "status": item.get("status").cloned().unwrap_or(json!("completed")),
        "detail": name,
        "input": item.get("arguments"),
        "source": "mcp",
    });
    if let Some(obj) = ev.as_object_mut() {
        if let Some(m) = bounded.as_object_mut() {
            for (k, v) in m.iter() {
                obj.insert(k.clone(), v.clone());
            }
        }
    }
    ev
}

pub fn build_approval_response_with_scope(
    method: &str,
    full_access: bool,
    params: &Value,
    scope: &str,
) -> Value {
    let accept = full_access;
    match method {
        "execCommandApproval" | "applyPatchApproval" => json!({
            "decision": if accept {
                if scope == "session" { "approved_for_session" } else { "approved" }
            } else { "denied" }
        }),
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => json!({
            "decision": if accept {
                if scope == "session" { "acceptForSession" } else { "accept" }
            } else { "decline" }
        }),
        "item/permissions/requestApproval" => {
            if accept {
                json!({
                    "permissions": params.get("permissions").cloned().unwrap_or_else(|| json!({})),
                    "scope": if scope == "session" { "session" } else { "turn" },
                    "strictAutoReview": false,
                })
            } else {
                json!({"permissions": {}, "scope": "turn", "strictAutoReview": true})
            }
        }
        "item/tool/requestUserInput" => json!({"answers": {}}),
        "mcpServer/elicitation/request" => json!({"action":"decline","content":null,"_meta":null}),
        _ => json!({"success": false, "error": "unsupported"}),
    }
}

pub fn build_approval_response(method: &str, full_access: bool) -> Value {
    build_approval_response_with_scope(method, full_access, &json!({}), "once")
}

/// Réponse native Codex construite depuis le contrat public Atelier.
pub fn answer_from_interaction(method: &str, params: &Value, response: Option<&Value>) -> Value {
    let response = response.unwrap_or(&Value::Null);
    match method {
        "execCommandApproval"
        | "applyPatchApproval"
        | "item/commandExecution/requestApproval"
        | "item/fileChange/requestApproval"
        | "item/permissions/requestApproval" => build_approval_response_with_scope(
            method,
            response.get("allow").and_then(Value::as_bool) == Some(true),
            params,
            response
                .get("scope")
                .and_then(Value::as_str)
                .unwrap_or("once"),
        ),
        "item/tool/requestUserInput" => json!({
            "answers": response.get("answers").cloned().unwrap_or_else(|| json!({}))
        }),
        "mcpServer/elicitation/request" => {
            if response.get("action").and_then(Value::as_str) == Some("accept") {
                json!({"action":"accept","content":response.get("content").cloned().unwrap_or_else(|| json!({})),"_meta":null})
            } else {
                json!({"action":"decline","content":null,"_meta":null})
            }
        }
        _ => json!({"success": false, "error": "unsupported"}),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn turn_started_and_text() {
        let mut st = TurnMapState::default();
        let e = map_turn_notification("turn/started", &json!({"turn":{"id":"t1"}}), &mut st);
        assert_eq!(e[0]["kind"], "started");
        assert_eq!(e[0]["nativeTurnId"], "t1");

        map_turn_notification("item/agentMessage/delta", &json!({"delta":"Hel"}), &mut st);
        let e2 = map_turn_notification("item/agentMessage/delta", &json!({"delta":"lo"}), &mut st);
        assert_eq!(e2[0]["text"], "Hello");

        let e3 = map_turn_notification(
            "item/completed",
            &json!({"item":{"type":"agentMessage","text":"Hello"}}),
            &mut st,
        );
        assert_eq!(e3[0]["kind"], "text");

        let e4 = map_turn_notification(
            "turn/completed",
            &json!({"turn":{"status":"completed"}}),
            &mut st,
        );
        assert_eq!(e4[0]["kind"], "done");
        assert_eq!(e4[0]["ok"], true);
    }

    #[test]
    fn error_will_retry_ignored() {
        assert!(classify_codex_error(&json!({"willRetry": true})).is_none());
        assert!(classify_codex_error(&json!({"message": "boom"})).is_some());
    }

    #[test]
    fn image_view_is_a_structured_completed_activity() {
        let mut st = TurnMapState::default();
        let events = map_turn_notification(
            "item/started",
            &json!({"item":{"id":"img-1","type":"imageView","path":"/tmp/figure.png"}}),
            &mut st,
        );
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["kind"], "tool_update");
        assert_eq!(events[0]["name"], "view_image");
        assert_eq!(events[0]["status"], "completed");
        assert_eq!(events[0]["input"]["paths"][0], "/tmp/figure.png");
    }

    #[test]
    fn collab_agent_call_keeps_codex_agent_state() {
        let mut st = TurnMapState::default();
        let events = map_turn_notification(
            "item/updated",
            &json!({"item":{
                "id":"agent-call-1",
                "type":"collabAgentToolCall",
                "tool":"spawnAgent",
                "status":"inProgress",
                "senderThreadId":"parent-1",
                "receiverThreadIds":["child-1"],
                "prompt":"Audit the UI",
                "model":"gpt-5.6-codex",
                "reasoningEffort":"high",
                "agentsStates":{"child-1":{"status":"running","message":null}}
            }}),
            &mut st,
        );
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["kind"], "tool_update");
        assert_eq!(events[0]["name"], "agent:spawnAgent");
        assert_eq!(
            events[0]["agentActivity"]["receiverThreadIds"][0],
            "child-1"
        );
        assert_eq!(
            events[0]["agentActivity"]["agentsStates"]["child-1"]["status"],
            "running"
        );
        assert_eq!(events[0]["agentActivity"]["reasoningEffort"], "high");
    }

    #[test]
    fn subagent_activity_keeps_display_path() {
        let mut st = TurnMapState::default();
        let events = map_turn_notification(
            "item/started",
            &json!({"item":{
                "id":"activity-1",
                "type":"subAgentActivity",
                "kind":"started",
                "agentThreadId":"child-1",
                "agentPath":"/root/remote_sensing"
            }}),
            &mut st,
        );
        assert_eq!(events[0]["name"], "agent:activity");
        assert_eq!(
            events[0]["agentActivity"]["agentPath"],
            "/root/remote_sensing"
        );
        assert_eq!(
            events[0]["agentActivity"]["agentsStates"]["child-1"]["status"],
            "running"
        );
    }

    #[test]
    fn web_search_has_a_stable_running_and_completed_lifecycle() {
        let mut st = TurnMapState::default();
        let item = json!({"item":{
            "id":"web-1", "type":"webSearch", "query":"Nature figure guidelines",
            "action":{"type":"search","query":"Nature figure guidelines"}
        }});
        let started = map_turn_notification("item/started", &item, &mut st);
        let completed = map_turn_notification("item/completed", &item, &mut st);
        assert_eq!(started[0]["id"], "web-1");
        assert_eq!(started[0]["name"], "web_search");
        assert_eq!(started[0]["status"], "inProgress");
        assert_eq!(completed[0]["id"], "web-1");
        assert_eq!(completed[0]["status"], "completed");
    }

    #[test]
    fn command_output_delta_keeps_native_command_actions() {
        let mut st = TurnMapState::default();
        map_turn_notification(
            "item/started",
            &json!({"item":{
                "id":"cmd-1", "type":"commandExecution", "command":"pwd && sed -n '1,20p' src/App.tsx",
                "cwd":"/repo", "status":"inProgress", "commandActions":[
                    {"type":"unknown","command":"pwd"},
                    {"type":"read","command":"sed -n '1,20p' src/App.tsx","name":"App.tsx","path":"/repo/src/App.tsx"}
                ]
            }}),
            &mut st,
        );
        let delta = map_turn_notification(
            "item/commandExecution/outputDelta",
            &json!({"itemId":"cmd-1","delta":"first line\n"}),
            &mut st,
        );
        assert_eq!(delta[0]["detail"], "pwd && sed -n '1,20p' src/App.tsx");
        assert_eq!(delta[0]["input"]["commandActions"][1]["type"], "read");
        assert_eq!(delta[0]["output"], "first line\n");
    }

    #[test]
    fn dynamic_tools_and_image_generation_are_visible_activities() {
        let mut st = TurnMapState::default();
        let dynamic = map_turn_notification(
            "item/started",
            &json!({"item":{
                "id":"dynamic-1", "type":"dynamicToolCall", "namespace":"visualize",
                "tool":"create_chart", "arguments":{"title":"Trend"}, "status":"inProgress"
            }}),
            &mut st,
        );
        assert_eq!(dynamic[0]["name"], "visualize/create_chart");
        assert_eq!(dynamic[0]["status"], "inProgress");

        let image = map_turn_notification(
            "item/completed",
            &json!({"item":{
                "id":"image-1", "type":"imageGeneration", "status":"completed",
                "revisedPrompt":"Scientific map", "savedPath":"/tmp/map.png", "result":""
            }}),
            &mut st,
        );
        assert_eq!(image[0]["name"], "image_generation");
        assert_eq!(image[0]["status"], "completed");
        assert_eq!(image[0]["output"], "/tmp/map.png");
    }

    #[test]
    fn approval_full_access() {
        assert_eq!(
            build_approval_response("item/commandExecution/requestApproval", true)["decision"],
            "accept"
        );
        assert_eq!(
            build_approval_response("item/commandExecution/requestApproval", false)["decision"],
            "decline"
        );
        assert_eq!(
            answer_from_interaction(
                "item/commandExecution/requestApproval",
                &json!({}),
                Some(&json!({"allow":true,"scope":"session"})),
            )["decision"],
            "acceptForSession",
        );
        assert_eq!(
            answer_from_interaction(
                "item/tool/requestUserInput",
                &json!({}),
                Some(&json!({"answers":{"q1":"Thierry"}})),
            )["answers"]["q1"],
            "Thierry",
        );
    }
}
