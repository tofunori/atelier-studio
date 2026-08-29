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
        "description": "Affiche un panneau interactif (curseur, graphique, calculateur) \
    DANS le fil du chat. Si l'utilisateur demande un widget, un panneau ou une visualisation \
    interactive : appelle CET outil — jamais de fichier HTML sur disque, jamais de \
    navigateur. Passe un FRAGMENT compact (sans <html>/<head>/<body>), autonome : aucun \
    réseau ni bibliothèque, calcul en JS local, données en dur, couleurs via les variables \
    CSS injectées (--fg, --muted, --border, --accent). Déjà définies pour ton script : \
    sendPrompt(texte) propose un message dans le composeur (l'utilisateur valide) ; \
    saveState(objet) garde l'état du panneau au défilement ; window.onRestore = (etat) => \
    {...} le reçoit au remontage.",
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
            let action = args
                .get("action")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())?;
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
    fn widget_tool_announces_the_three_bridge_functions() {
        // Sans ça, aucun LLM ne devine leur existence : tout le §G (le widget
        // propose un message) et tout le gel d'état du §E reposent sur des
        // fonctions que l'agent doit appeler dans SON html.
        let def = widget_tool_definition();
        let description = def["description"].as_str().unwrap();
        for f in ["sendPrompt(", "saveState(", "window.onRestore"] {
            assert!(description.contains(f), "la description n'annonce pas {f}");
        }
        // et elle reste courte : elle repart au modèle à chaque tour
        assert!(
            description.len() < 900,
            "description trop longue ({} octets) — elle est envoyée à chaque tour",
            description.len()
        );
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

    #[test]
    fn sessions_call_with_empty_action_routes_nowhere() {
        assert!(bridge_call_for(TOOL_NAME, &json!({"action": ""})).is_none());
    }

    #[test]
    fn sessions_call_with_missing_action_routes_nowhere() {
        assert!(bridge_call_for(TOOL_NAME, &json!({})).is_none());
    }
}
