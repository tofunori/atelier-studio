//! Pure Codex notification → harness event mapping (plan 033 Porte 7).
//! Ports the tested surfaces from `sidecar/providers/codex.mjs`.

use serde_json::{json, Value};

pub const TOOL_OUTPUT_MAX: usize = 64 * 1024;

#[derive(Debug, Default)]
pub struct TurnMapState {
    pub stream_text: String,
    pub native_turn_id: Option<String>,
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
    if cmd.len() > 64 {
        format!("{}…", &cmd[..64])
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
                    let q = item
                        .get("query")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .chars()
                        .take(50)
                        .collect::<String>();
                    events.push(json!({"kind":"tool","name": format!("recherche web : {q}")}));
                }
                "commandExecution" => {
                    let mut ev = json!({
                        "kind": "tool_update",
                        "id": item.get("id"),
                        "name": "Bash",
                        "status": item.get("status").cloned().unwrap_or(json!("inProgress")),
                        "detail": command_name(&item),
                        "input": {
                            "command": item.get("command").cloned().unwrap_or(json!("")),
                            "cwd": item.get("cwd"),
                        },
                        "source": "codex",
                    });
                    let out = bound_tool_output(
                        item.get("aggregatedOutput")
                            .and_then(|v| v.as_str())
                            .unwrap_or(""),
                    );
                    if let Some(obj) = ev.as_object_mut() {
                        if let Some(m) = out.as_object() {
                            for (k, v) in m {
                                obj.insert(k.clone(), v.clone());
                            }
                        }
                    }
                    events.push(ev);
                }
                "fileChange" => {
                    events.push(file_change_update(&item, "inProgress"));
                }
                "mcpToolCall" => {
                    events.push(mcp_update(&item, None));
                }
                "imageView" => {
                    let path = item.get("path").and_then(Value::as_str).unwrap_or("");
                    let id = item
                        .get("id")
                        .cloned()
                        .unwrap_or_else(|| json!(format!("image:{}", if path.is_empty() { "unknown" } else { path })));
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
                _ => {}
            }
        }
        "item/agentMessage/delta" => {
            state.stream_text.push_str(params.get("delta").and_then(|v| v.as_str()).unwrap_or(""));
            events.push(json!({"kind":"stream_set","text": state.stream_text}));
        }
        "item/commandExecution/outputDelta" => {
            let id = params.get("itemId").cloned().unwrap_or(json!(null));
            let delta = params.get("delta").and_then(|v| v.as_str()).unwrap_or("");
            let mut ev = json!({
                "kind": "tool_update",
                "id": id,
                "name": "Bash",
                "status": "inProgress",
                "source": "codex",
                "__ephemeral": true,
            });
            let out = bound_tool_output(delta);
            if let Some(obj) = ev.as_object_mut() {
                if let Some(m) = out.as_object() {
                    for (k, v) in m {
                        obj.insert(k.clone(), v.clone());
                    }
                }
            }
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
                    let mut ev = json!({
                        "kind": "tool_update",
                        "id": item.get("id"),
                        "name": "Bash",
                        "status": item.get("status").cloned().unwrap_or(json!("completed")),
                        "detail": command_name(&item),
                        "input": {
                            "command": item.get("command").cloned().unwrap_or(json!("")),
                            "cwd": item.get("cwd"),
                        },
                        "source": "codex",
                    });
                    if let Some(code) = item.get("exitCode") {
                        ev.as_object_mut()
                            .unwrap()
                            .insert("exitCode".into(), code.clone());
                    }
                    let out = bound_tool_output(
                        item.get("aggregatedOutput")
                            .and_then(|v| v.as_str())
                            .unwrap_or(""),
                    );
                    if let Some(obj) = ev.as_object_mut() {
                        if let Some(m) = out.as_object() {
                            for (k, v) in m {
                                obj.insert(k.clone(), v.clone());
                            }
                        }
                    }
                    events.push(ev);
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
                                .filter_map(|ch| ch.get("path").and_then(|p| p.as_str()).map(str::to_string))
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
        "execCommandApproval" | "applyPatchApproval"
        | "item/commandExecution/requestApproval" | "item/fileChange/requestApproval"
        | "item/permissions/requestApproval" => build_approval_response_with_scope(
            method,
            response.get("allow").and_then(Value::as_bool) == Some(true),
            params,
            response.get("scope").and_then(Value::as_str).unwrap_or("once"),
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
        let e = map_turn_notification(
            "turn/started",
            &json!({"turn":{"id":"t1"}}),
            &mut st,
        );
        assert_eq!(e[0]["kind"], "started");
        assert_eq!(e[0]["nativeTurnId"], "t1");

        map_turn_notification(
            "item/agentMessage/delta",
            &json!({"delta":"Hel"}),
            &mut st,
        );
        let e2 = map_turn_notification(
            "item/agentMessage/delta",
            &json!({"delta":"lo"}),
            &mut st,
        );
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
