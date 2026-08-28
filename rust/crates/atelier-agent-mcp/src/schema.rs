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

pub const WIDGET_TOOL_NAME: &str = "atelier_widget";

pub fn widget_tool_definition() -> Value {
    json!({
        "name": WIDGET_TOOL_NAME,
        "description": "Afficher un panneau interactif dans le fil de la conversation. \
    HTML autonome : aucun réseau, aucune bibliothèque externe, aucune police distante — \
    tout le calcul se fait en JS local. Les couleurs viennent des variables CSS injectées \
    (--fg, --muted, --border, --accent) ; n'invente pas de palette. Écris le contenu de la \
    page seulement, sans <html>, <head> ni <body>.",
        "inputSchema": {
            "type": "object",
            "required": ["html", "title", "height"],
            "properties": {
                "html": { "type": "string", "description": "Contenu de la page" },
                "title": { "type": "string", "description": "Titre court affiché dans la barre (80 caractères max)" },
                "height": { "type": "integer", "description": "Hauteur du panneau en pixels, de 120 à 900" }
            },
            "additionalProperties": false
        }
    })
}

/// Traduit un `tools/call` en couple (action, arguments) pour le pont.
/// `atelier_sessions` porte son action dans ses arguments ; `atelier_widget`
/// est un outil plat dont l'action est fixe.
pub fn bridge_call_for(tool_name: &str, args: &Value) -> Option<(String, Value)> {
    match tool_name {
        WIDGET_TOOL_NAME => Some(("show_widget".to_string(), args.clone())),
        TOOL_NAME => {
            let action = args.get("action").and_then(|v| v.as_str())?;
            Some((action.to_string(), args.clone()))
        }
        _ => None,
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn widget_tool_declares_its_three_required_fields() {
        let def = widget_tool_definition();
        assert_eq!(def["name"], WIDGET_TOOL_NAME);
        let required = def["inputSchema"]["required"].as_array().unwrap();
        assert_eq!(required.len(), 3);
        for field in ["html", "title", "height"] {
            assert!(
                required.iter().any(|v| v == field),
                "champ requis manquant : {field}"
            );
        }
        assert_eq!(def["inputSchema"]["additionalProperties"], json!(false));
    }

    #[test]
    fn widget_call_routes_to_show_widget_verbatim() {
        let args = json!({"html": "<p>x</p>", "title": "t", "height": 200});
        let (action, forwarded) = bridge_call_for(WIDGET_TOOL_NAME, &args).unwrap();
        assert_eq!(action, "show_widget");
        assert_eq!(forwarded, args, "les arguments passent tels quels au pont");
    }

    #[test]
    fn sessions_call_still_routes_by_its_action_field() {
        let args = json!({"action": "current"});
        let (action, _) = bridge_call_for(TOOL_NAME, &args).unwrap();
        assert_eq!(action, "current");
    }

    #[test]
    fn unknown_tool_routes_nowhere() {
        assert!(bridge_call_for("rm_rf", &json!({})).is_none());
    }
}
