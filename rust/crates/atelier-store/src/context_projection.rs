//! Expurgated, paginated journal projection for linked agents (plan 057).

use serde_json::{json, Value};

const INCLUDE_KINDS: &[&str] = &[
    "user",
    "text",
    "todos",
    "goal",
    "proposed_plan",
    "edit",
    "tool_update",
    "done",
    "error",
    "agent_message",
];

const SECRET_HINTS: &[&str] = &[
    "sk-",
    "api_key",
    "apikey",
    "authorization:",
    "bearer ",
    "password=",
    "password:",
    "passwd=",
    "secret=",
    "client_secret",
    "token=",
    "access_token",
    "api-key",
    "x-api-key",
    "private key",
    "-----begin",
    "atelier_mcp_capability",
    "x-atelier-token",
    "x-atelier-agent-capability",
];

/// Project journal events for a linked agent.
pub fn project_events(
    events: &[Value],
    after_sequence: Option<u64>,
    before_sequence: Option<u64>,
    limit: usize,
    include_tools: bool,
    max_chars: usize,
    project_root: &str,
) -> Value {
    let mut filtered: Vec<(u64, Value)> = Vec::new();
    for ev in events {
        let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        if !INCLUDE_KINDS.contains(&kind) {
            continue;
        }
        if kind == "tool_update" && !include_tools {
            continue;
        }
        let seq = ev
            .pointer("/meta/sequence")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if let Some(after) = after_sequence {
            if seq <= after {
                continue;
            }
        }
        if let Some(before) = before_sequence {
            if seq >= before {
                continue;
            }
        }
        if let Some(proj) = project_one(ev, project_root) {
            filtered.push((seq, proj));
        }
    }
    filtered.sort_by_key(|(s, _)| *s);

    // A cursor asks for forward/backward pagination. Without a cursor the linked
    // agent needs the most recent context, not the oldest journal entries.
    let total = filtered.len();
    let page: Vec<(u64, Value)> = if before_sequence.is_some() {
        let start = total.saturating_sub(limit);
        filtered[start..].to_vec()
    } else if after_sequence.is_some() {
        filtered.into_iter().take(limit).collect()
    } else {
        let start = total.saturating_sub(limit);
        filtered[start..].to_vec()
    };

    let first_sequence = page.first().map(|(s, _)| *s);
    let last_sequence = page.last().map(|(s, _)| *s);
    let has_more_before = first_sequence
        .map(|f| {
            events.iter().any(|ev| {
                let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                if !INCLUDE_KINDS.contains(&kind) {
                    return false;
                }
                let seq = ev
                    .pointer("/meta/sequence")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                seq < f
            })
        })
        .unwrap_or(false);
    let has_more_after = last_sequence
        .map(|l| {
            events.iter().any(|ev| {
                let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                if !INCLUDE_KINDS.contains(&kind) {
                    return false;
                }
                let seq = ev
                    .pointer("/meta/sequence")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                seq > l
            })
        })
        .unwrap_or(false);

    let mut chars = 0usize;
    let mut truncated = false;
    let mut out_events = Vec::new();
    for (_, mut ev) in page {
        let s = serde_json::to_string(&ev).unwrap_or_default();
        if chars + s.len() > max_chars && !out_events.is_empty() {
            truncated = true;
            break;
        }
        if s.len() > max_chars && out_events.is_empty() {
            // still emit one truncated event
            if let Some(text) = ev
                .get_mut("text")
                .and_then(|v| v.as_str().map(|t| t.to_string()))
            {
                let cut = text
                    .chars()
                    .take(max_chars.saturating_sub(32))
                    .collect::<String>();
                ev["text"] = json!(format!("{cut}…[truncated]"));
            }
            truncated = true;
            out_events.push(ev);
            break;
        }
        chars += s.len();
        out_events.push(ev);
    }

    let first = out_events
        .first()
        .and_then(|e| e.pointer("/meta/sequence"))
        .and_then(|v| v.as_u64());
    let last = out_events
        .last()
        .and_then(|e| e.pointer("/meta/sequence"))
        .and_then(|v| v.as_u64());

    json!({
        "events": out_events,
        "firstSequence": first,
        "lastSequence": last,
        "hasMoreBefore": has_more_before,
        "hasMoreAfter": has_more_after,
        "nextBeforeSequence": first,
        "truncated": truncated,
    })
}

fn project_one(ev: &Value, project_root: &str) -> Option<Value> {
    let kind = ev.get("kind")?.as_str()?;
    let mut out = json!({
        "kind": kind,
        "meta": {
            "sequence": ev.pointer("/meta/sequence").cloned().unwrap_or(json!(null)),
            "eventId": ev.pointer("/meta/eventId").cloned().unwrap_or(json!(null)),
            "ts": ev.pointer("/meta/ts").or_else(|| ev.get("ts")).cloned().unwrap_or(json!(null)),
        }
    });

    match kind {
        "user" | "text" | "error" | "done" | "proposed_plan" => {
            let text = ev
                .get("text")
                .or_else(|| ev.get("message"))
                .or_else(|| ev.get("result"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            out["text"] = json!(redact_text(text));
            if kind == "done" {
                if let Some(ok) = ev.get("ok") {
                    out["ok"] = ok.clone();
                }
            }
        }
        "todos" | "goal" => {
            out["payload"] = redact_value(
                ev.get("todos")
                    .or_else(|| ev.get("goal"))
                    .or_else(|| ev.get("items"))
                    .cloned()
                    .unwrap_or(Value::Null),
            );
        }
        "edit" => {
            let path = ev
                .get("path")
                .or_else(|| ev.get("file"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            out["path"] = json!(relativize(path, project_root));
            if let Some(summary) = ev.get("summary").and_then(|v| v.as_str()) {
                out["summary"] = json!(redact_text(summary));
            }
        }
        "tool_update" => {
            out["name"] = json!(ev.get("name").and_then(|v| v.as_str()).unwrap_or("tool"));
            out["status"] = json!(ev.get("status").and_then(|v| v.as_str()).unwrap_or(""));
            let out_text = ev
                .get("output")
                .or_else(|| ev.get("result"))
                .or_else(|| ev.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            out["output"] = json!(truncate_chars(redact_text(out_text), 2000));
            // never include full tool input
        }
        "agent_message" => {
            for key in [
                "messageId",
                "direction",
                "peerThreadId",
                "peerProvider",
                "peerTitle",
                "messageKind",
                "status",
            ] {
                if let Some(v) = ev.get(key) {
                    out[key] = v.clone();
                }
            }
            if let Some(text) = ev.get("text").and_then(|v| v.as_str()) {
                out["text"] = json!(redact_text(text));
            }
        }
        _ => return None,
    }
    Some(out)
}

fn redact_text(s: &str) -> String {
    let mut out = s.to_string();
    // strip data URLs
    if out.contains("data:") {
        out = regex_replace_data_urls(&out);
    }
    let lower = out.to_lowercase();
    for hint in SECRET_HINTS {
        if lower.contains(hint) {
            return "[redacted]".into();
        }
    }
    out
}

fn regex_replace_data_urls(s: &str) -> String {
    // Scan bytes for ASCII delimiters and copy untouched UTF-8 chunks. Indexing
    // `&str` at arbitrary byte offsets would panic on accented text or emoji.
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    let mut copied_until = 0;
    while i < bytes.len() {
        if bytes[i..].starts_with(b"data:") {
            out.push_str(&s[copied_until..i]);
            // find end of token
            let mut j = i + 5;
            while j < bytes.len()
                && !bytes[j].is_ascii_whitespace()
                && bytes[j] != b'"'
                && bytes[j] != b'\''
            {
                j += 1;
            }
            out.push_str("[data-url]");
            i = j;
            copied_until = j;
        } else {
            i += 1;
        }
    }
    out.push_str(&s[copied_until..]);
    out
}

fn redact_value(v: Value) -> Value {
    match v {
        Value::String(s) => Value::String(redact_text(&s)),
        Value::Array(arr) => Value::Array(arr.into_iter().map(redact_value).collect()),
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (k, val) in map {
                let lk = k.to_lowercase();
                if SECRET_HINTS
                    .iter()
                    .any(|h| lk.contains(h.trim_end_matches([':', '='])))
                {
                    out.insert(k, json!("[redacted]"));
                } else {
                    out.insert(k, redact_value(val));
                }
            }
            Value::Object(out)
        }
        other => other,
    }
}

fn relativize(path: &str, project_root: &str) -> String {
    if project_root.is_empty() {
        return path.to_string();
    }
    let root = project_root.trim_end_matches('/');
    if let Some(rest) = path.strip_prefix(root) {
        let rest = rest.trim_start_matches('/');
        if rest.is_empty() {
            return ".".into();
        }
        return rest.to_string();
    }
    path.to_string()
}

fn truncate_chars(s: String, max: usize) -> String {
    if s.chars().count() <= max {
        return s;
    }
    let cut: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{cut}…")
}

/// Deterministic first-turn envelope for a linked child agent.
pub fn build_child_envelope(
    parent_title: &str,
    parent_provider_label: &str,
    project_root: &str,
    parent_status: &str,
    recent_events: &[Value],
    max_chars: usize,
) -> String {
    let mut body = String::new();
    body.push_str("[Contexte Atelier — session liée]\n");
    body.push_str(
        "Tu es un agent lié à une session parent créée explicitement par l'utilisateur.\n",
    );
    body.push_str(&format!(
        "Parent : {parent_provider_label} — {parent_title}\n"
    ));
    body.push_str(&format!("Projet : {project_root}\n"));
    body.push_str(&format!("État : {parent_status}\n\n"));
    body.push_str("Extrait déterministe récent :\n");

    let proj = project_events(
        recent_events,
        None,
        None,
        12,
        false,
        max_chars.saturating_sub(body.len() + 200),
        project_root,
    );
    if let Some(arr) = proj.get("events").and_then(|v| v.as_array()) {
        for ev in arr {
            let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("?");
            let text = ev
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .chars()
                .take(400)
                .collect::<String>();
            if !text.is_empty() {
                body.push_str(&format!("- [{kind}] {text}\n"));
            }
        }
    }
    body.push_str(
        "\nPour davantage de contexte, utilise atelier_sessions avec current, inspect ou\nread_context. Ne prétends pas avoir reçu le raisonnement caché du parent.\n[Fin du contexte Atelier]\n\n",
    );
    if body.chars().count() > max_chars {
        body.chars()
            .take(max_chars.saturating_sub(1))
            .collect::<String>()
            + "…"
    } else {
        body
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_thinking_and_redacts_secrets() {
        let events = vec![
            json!({"kind":"thinking","text":"secret plan","meta":{"sequence":1}}),
            json!({"kind":"user","text":"do work with sk-abc123token","meta":{"sequence":2}}),
            json!({"kind":"text","text":"ok data:image/png;base64,AAAA","meta":{"sequence":3}}),
            json!({"kind":"permission","text":"allow?","meta":{"sequence":4}}),
        ];
        let out = project_events(&events, None, None, 50, true, 12_000, "/proj");
        let arr = out.get("events").unwrap().as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["text"], "[redacted]");
        assert!(arr[1]["text"].as_str().unwrap().contains("[data-url]"));
    }

    #[test]
    fn envelope_bounded_no_thinking() {
        let events = vec![
            json!({"kind":"thinking","text":"hidden","meta":{"sequence":1}}),
            json!({"kind":"user","text":"Build feature X","meta":{"sequence":2}}),
        ];
        let env = build_child_envelope("Parent", "Claude Code", "/proj", "idle", &events, 16000);
        assert!(env.contains("Build feature X"));
        assert!(!env.contains("hidden"));
        assert!(env.contains("atelier_sessions"));
    }

    #[test]
    fn default_projection_returns_recent_events() {
        let events: Vec<Value> = (1..=20)
            .map(|sequence| json!({"kind":"user","text":format!("event-{sequence}"),"meta":{"sequence":sequence}}))
            .collect();
        let out = project_events(&events, None, None, 3, false, 12_000, "/proj");
        let arr = out["events"].as_array().unwrap();
        assert_eq!(arr[0]["text"], "event-18");
        assert_eq!(arr[2]["text"], "event-20");
    }

    #[test]
    fn redaction_is_case_insensitive_and_utf8_safe() {
        let events = vec![
            json!({"kind":"user","text":"clé ATELIER_MCP_CAPABILITY=abc","meta":{"sequence":1}}),
            json!({"kind":"text","text":"déjà 👋 data:image/png;base64,AAAA fin","meta":{"sequence":2}}),
            json!({"kind":"text","text":"-----BEGIN PRIVATE KEY----- abc","meta":{"sequence":3}}),
        ];
        let out = project_events(&events, None, None, 10, false, 12_000, "/proj");
        let arr = out["events"].as_array().unwrap();
        assert_eq!(arr[0]["text"], "[redacted]");
        assert_eq!(arr[1]["text"], "déjà 👋 [data-url] fin");
        assert_eq!(arr[2]["text"], "[redacted]");
    }
}
