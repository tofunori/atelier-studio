//! Tool schema for `atelier_sessions`.

use serde_json::{json, Value};

pub const TOOL_NAME: &str = "atelier_sessions";

pub fn tool_definition() -> Value {
    json!({
        "name": TOOL_NAME,
        "description": "Inspect and coordinate Atelier linked-agent sessions. Use action=help for details.",
        "inputSchema": {
            "type": "object",
            "required": ["action"],
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "help",
                        "current",
                        "list",
                        "inspect",
                        "read_context",
                        "wait",
                        "send_message",
                        "report_to_parent"
                    ]
                },
                "targetThreadId": { "type": "string" },
                "requestId": { "type": "string" },
                "afterSequence": { "type": ["integer", "null"] },
                "beforeSequence": { "type": ["integer", "null"] },
                "limit": { "type": "integer" },
                "includeTools": { "type": "boolean" },
                "text": { "type": ["string", "null"] },
                "report": { "type": ["object", "null"] },
                "timeoutMs": { "type": "integer" },
                "traceId": { "type": "string" },
                "hop": { "type": "integer" }
            },
            "additionalProperties": false
        }
    })
}

pub fn help_text() -> Value {
    json!({
        "tool": TOOL_NAME,
        "actions": {
            "help": "This document",
            "current": "Caller identity, parent, children, limits",
            "list": "Directly related threads",
            "inspect": "Metadata + small recent projection (targetThreadId)",
            "read_context": "Paginated projection (targetThreadId, afterSequence/beforeSequence, limit)",
            "wait": "Wait for status/sequence change (timeoutMs max 60000)",
            "send_message": "Queue semantic message (targetThreadId, text, requestId required)",
            "report_to_parent": "Queue structured report to parent (requestId, report/text)"
        },
        "auth": "Caller is authenticated by process capability — never pass callerThreadId as authority",
        "scope": "Direct parent/children only, same project"
    })
}
