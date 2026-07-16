//! Grok streaming-json + ACP sessionUpdate mapping (plan 033 Porte 8).

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// Legacy `grok -p --output-format streaming-json` line → events.
pub fn normalize_grok_message(msg: &Value) -> Vec<Value> {
    let ty = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match ty {
        "error" => vec![json!({
            "kind": "error",
            "message": msg.get("message")
                .or_else(|| msg.get("error"))
                .map(|v| if v.is_string() { v.as_str().unwrap_or("erreur Grok").to_string() } else { v.to_string() })
                .unwrap_or_else(|| "erreur Grok".into()),
        })],
        "thought" => vec![json!({
            "kind": "thinking_delta",
            "text": msg.get("data").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "text" => vec![json!({
            "kind": "delta",
            "text": msg.get("data").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "end" => {
            let stop = msg.get("stopReason").and_then(|v| v.as_str());
            let ok = stop.map(|s| s == "EndTurn").unwrap_or(true);
            vec![json!({
                "kind": "done",
                "ok": ok,
                "sessionId": msg.get("sessionId"),
                "result": "",
                "usage": { "context": 0, "output": 0, "cost": null, "turns": null },
            })]
        }
        _ => vec![],
    }
}

pub fn parse_grok_jsonl(chunk: &str, carry: &str) -> (Vec<Value>, String) {
    let text = format!("{carry}{chunk}");
    let mut lines: Vec<&str> = text.split('\n').collect();
    let rest = lines.pop().unwrap_or("").to_string();
    let mut events = Vec::new();
    for line in lines {
        let t = line.trim().trim_end_matches('\r');
        if t.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(t) {
            Ok(msg) => events.extend(normalize_grok_message(&msg)),
            Err(_) => events.push(json!({
                "kind": "error",
                "message": format!("JSON Grok invalide: {}", t.chars().take(120).collect::<String>()),
            })),
        }
    }
    (events, rest)
}

/// ACP `params.update` mapping (session/update or _x.ai/session_notification).
pub fn map_session_update(
    update: &Value,
    tool_meta: &mut HashMap<String, Value>,
    seen_edits: &mut HashSet<String>,
) -> Vec<Value> {
    let kind = update
        .get("sessionUpdate")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    match kind {
        "agent_thought_chunk" => vec![json!({
            "kind": "thinking_delta",
            "text": update.pointer("/content/text").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "agent_message_chunk" => vec![json!({
            "kind": "delta",
            "text": update.pointer("/content/text").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "tool_call" => {
            let id = update
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = update
                .pointer("/_meta/x.ai/tool/name")
                .or_else(|| update.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("tool");
            let ev = json!({
                "kind": "tool_update",
                "id": id,
                "name": name,
                "status": "running",
                "detail": update.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "output": "",
                "input": update.get("rawInput"),
                "source": "grok",
            });
            tool_meta.insert(id, ev.clone());
            vec![ev]
        }
        "tool_call_update" => {
            let id = update
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cached = tool_meta.get(&id).cloned();
            let name = update
                .pointer("/_meta/x.ai/tool/name")
                .or_else(|| update.get("title"))
                .and_then(|v| v.as_str())
                .or_else(|| {
                    cached
                        .as_ref()
                        .and_then(|c| c.get("name").and_then(|v| v.as_str()))
                })
                .unwrap_or("tool");
            let status = update
                .pointer("/_meta/updateParams/status")
                .or_else(|| update.get("status"))
                .and_then(|v| v.as_str())
                .unwrap_or("completed");
            let mut out = vec![json!({
                "kind": "tool_update",
                "id": id,
                "name": name,
                "status": status,
                "detail": update.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "output": tool_call_output(update),
                "input": update.get("rawInput").cloned().or_else(|| cached.as_ref().and_then(|c| c.get("input").cloned())),
                "source": "grok",
            })];
            // edits from diffs
            if let Some(arr) = update.get("content").and_then(|v| v.as_array()) {
                let mut files = Vec::new();
                for c in arr {
                    if c.get("type").and_then(|v| v.as_str()) != Some("diff") {
                        continue;
                    }
                    let Some(path) = c.get("path").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let key = format!(
                        "{}:{}:{}",
                        id,
                        path,
                        c.get("newText")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .len()
                    );
                    if seen_edits.insert(key) {
                        files.push(path.to_string());
                    }
                }
                if !files.is_empty() {
                    out.push(json!({"kind":"edit","files": files}));
                }
            }
            out
        }
        "pending_interaction" => {
            let k = update.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            vec![json!({
                "kind": "tool",
                "name": if k.is_empty() { "permission en attente".into() } else { format!("permission ({k})") },
            })]
        }
        "hook_execution"
        | "user_message_chunk"
        | "available_commands_update"
        | "session_summary_generated"
        | "interaction_resolved"
        | "turn_completed" => vec![],
        _ => vec![], // unknown → ignore
    }
}

fn tool_call_output(update: &Value) -> String {
    if let Some(arr) = update.get("content").and_then(|v| v.as_array()) {
        return arr
            .iter()
            .filter_map(|c| {
                if c.get("type").and_then(|v| v.as_str()) == Some("diff") {
                    Some(format!(
                        "# {}\n{}",
                        c.get("path").and_then(|v| v.as_str()).unwrap_or("file"),
                        c.get("newText").and_then(|v| v.as_str()).unwrap_or("")
                    ))
                } else {
                    c.get("text").and_then(|v| v.as_str()).map(str::to_string)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    String::new()
}

pub fn map_prompt_result(result: &Value) -> Value {
    let stop = result.get("stopReason").and_then(|v| v.as_str());
    let ok = matches!(stop, Some("end_turn") | Some("cancelled") | None);
    let meta = result.get("_meta").cloned().unwrap_or(json!({}));
    json!({
        "kind": "done",
        "ok": ok,
        "result": "",
        "usage": {
            "context": meta.get("totalTokens").and_then(|v| v.as_u64()).unwrap_or(0),
            "output": meta.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
            "cost": null,
            "turns": null,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_thought_text_end() {
        let e = normalize_grok_message(&json!({"type":"thought","data":"hmm"}));
        assert_eq!(e[0]["kind"], "thinking_delta");
        let e = normalize_grok_message(&json!({"type":"text","data":"hi"}));
        assert_eq!(e[0]["kind"], "delta");
        let e =
            normalize_grok_message(&json!({"type":"end","stopReason":"EndTurn","sessionId":"s1"}));
        assert_eq!(e[0]["kind"], "done");
        assert_eq!(e[0]["ok"], true);
    }

    #[test]
    fn acp_message_and_thought_chunks() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let e = map_session_update(
            &json!({"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Hel"}}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(e[0]["text"], "Hel");
        let e = map_session_update(
            &json!({"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"think"}}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(e[0]["kind"], "thinking_delta");
    }

    #[test]
    fn unknown_session_update_ignored() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let e = map_session_update(
            &json!({"sessionUpdate":"some_future_event_type","foo":"bar"}),
            &mut meta,
            &mut edits,
        );
        assert!(e.is_empty());
    }
}
