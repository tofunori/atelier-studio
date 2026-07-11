//! OpenCode `--format json` JSONL → harness events.

use serde_json::{json, Value};

pub fn normalize_opencode_message(msg: &Value) -> Vec<Value> {
    let ty = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match ty {
        "error" => vec![json!({
            "kind": "error",
            "message": msg.get("message")
                .or_else(|| msg.pointer("/error/message"))
                .and_then(|v| v.as_str())
                .unwrap_or("erreur OpenCode"),
        })],
        "step_start" => vec![json!({"kind":"started"})],
        "text" => {
            let text = text_from_part(msg.get("part"));
            if text.is_empty() {
                vec![]
            } else {
                vec![json!({"kind":"delta","text": text})]
            }
        }
        "reasoning" | "thinking" => {
            let text = text_from_part(msg.get("part"));
            if text.is_empty() {
                vec![]
            } else {
                vec![json!({"kind":"thinking_delta","text": text})]
            }
        }
        "tool" | "tool_update" | "tool_use" => {
            let part = msg.get("part").cloned().unwrap_or(json!({}));
            let state = part.get("state").cloned().unwrap_or(json!({}));
            let name = part
                .get("tool")
                .or_else(|| part.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("tool");
            let detail = state
                .get("title")
                .or_else(|| part.get("title"))
                .or_else(|| part.get("command"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .chars()
                .take(160)
                .collect::<String>();
            vec![json!({
                "kind": "tool_update",
                "id": part.get("callID")
                    .or_else(|| part.get("id"))
                    .cloned()
                    .unwrap_or(json!(format!("{name}:{}", now_ms()))),
                "name": name,
                "detail": detail,
                "input": state.get("input").or_else(|| part.get("input")),
                "output": stringify(state.get("output").or_else(|| part.get("output"))),
                "status": state.get("status")
                    .or_else(|| part.get("status"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("running"),
                "source": "opencode",
            })]
        }
        "step_finish" => {
            let tokens = msg.pointer("/part/tokens").cloned().unwrap_or(json!({}));
            vec![json!({
                "kind": "usage",
                "sessionId": msg.get("sessionID").or_else(|| msg.pointer("/part/sessionID")),
                "usage": {
                    "context": tokens.get("input"),
                    "output": tokens.get("output"),
                    "cost": msg.pointer("/part/cost"),
                    "turns": null,
                }
            })]
        }
        _ => vec![],
    }
}

fn text_from_part(part: Option<&Value>) -> String {
    let Some(part) = part else {
        return String::new();
    };
    if let Some(t) = part.get("text").and_then(|v| v.as_str()) {
        return t.to_string();
    }
    if let Some(t) = part.as_str() {
        return t.to_string();
    }
    String::new()
}

fn stringify(v: Option<&Value>) -> String {
    match v {
        None => String::new(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub fn parse_opencode_jsonl(chunk: &str, carry: &str) -> (Vec<Value>, String) {
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
            Ok(msg) => events.extend(normalize_opencode_message(&msg)),
            Err(_) => events.push(json!({
                "kind": "error",
                "message": format!("JSON OpenCode invalide: {}", t.chars().take(120).collect::<String>()),
            })),
        }
    }
    (events, rest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_and_step_finish() {
        let e = normalize_opencode_message(&json!({"type":"text","part":{"text":"hi"}}));
        assert_eq!(e[0]["kind"], "delta");
        let e = normalize_opencode_message(&json!({
            "type":"step_finish",
            "sessionID":"s1",
            "part":{"tokens":{"input":10,"output":5},"cost":0.01}
        }));
        assert_eq!(e[0]["kind"], "usage");
        assert_eq!(e[0]["sessionId"], "s1");
    }
}
