//! Vue « MCP App » d'Atelier : la page HTML que Claude Desktop affiche dans
//! la conversation quand Claude appelle `propose_revision` (ressource
//! `ui://`, type `text/html;profile=mcp-app`).
//!
//! La page est autonome : son script client (le SDK navigateur des MCP Apps,
//! vendorisé dans `vendor/ext-apps/`) y est inclus, rien n'est chargé du
//! réseau.

use serde_json::{json, Value};

pub const REVISION_URI: &str = "ui://atelier/revision";
pub const MIME: &str = "text/html;profile=mcp-app";
/// Clé de l'extension MCP Apps dans les capacités du client.
pub const EXTENSION_ID: &str = "io.modelcontextprotocol/ui";

const PAGE: &str = include_str!("../view/revision.html");
const BUNDLE: &str = include_str!("../vendor/ext-apps/app-with-deps.js");
const SLOT: &str = "/*__EXT_APPS__*/";

/// Le SDK finit par `export{a as App,…};`, qu'un script de page ne peut pas
/// importer : on le remplace par `globalThis.AtelierExtApps={App:a,…};`.
fn bundle_as_global() -> String {
    let at = BUNDLE
        .rfind("export{")
        .expect("SDK MCP Apps : export final introuvable");
    let tail = BUNDLE[at + "export{".len()..].trim_end();
    let list = tail
        .strip_suffix("};")
        .expect("SDK MCP Apps : export final mal formé");
    let pairs: Vec<String> = list
        .split(',')
        .map(|item| match item.trim().split_once(" as ") {
            Some((local, name)) => format!("{}:{}", name.trim(), local.trim()),
            None => item.trim().to_string(),
        })
        .collect();
    format!(
        "{}globalThis.AtelierExtApps={{{}}};",
        &BUNDLE[..at],
        pairs.join(",")
    )
}

pub fn revision_page() -> String {
    // `</script` ne doit pas apparaître dans le script inclus.
    let script = bundle_as_global().replace("</script", "<\\/script");
    PAGE.replacen(SLOT, &script, 1)
}

/// Le client sait-il afficher des vues ? (capacité annoncée à `initialize`)
pub fn client_supports_ui(init_params: &Value) -> bool {
    let ext = &init_params["capabilities"]["extensions"][EXTENSION_ID];
    if ext.is_null() {
        return false;
    }
    match ext["mimeTypes"].as_array() {
        Some(types) => types.iter().any(|t| t == MIME),
        None => true,
    }
}

pub fn resources() -> Value {
    json!([{
        "uri": REVISION_URI,
        "name": "Proposition de révision LaTeX",
        "description": "Carte d'Atelier : avant / après d'un passage .tex, avec Accepter et Refuser.",
        "mimeType": MIME,
    }])
}

pub fn read(uri: &str) -> Option<Value> {
    if uri != REVISION_URI {
        return None;
    }
    Some(json!({"contents": [{
        "uri": REVISION_URI,
        "mimeType": MIME,
        "text": revision_page(),
        "_meta": {"ui": {
            "prefersBorder": true,
            // Polices de l'hôte (Anthropic Sans) ; rien d'autre n'est chargé.
            "csp": {"resourceDomains": ["https://assets.claude.ai"]},
        }},
    }]}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vendored_bundle_is_pinned() {
        // ext-apps 1.7.5, dist/src/app-with-deps.js (voir vendor/ext-apps/README.md).
        assert_eq!(BUNDLE.len(), 337_419);
    }

    #[test]
    fn page_inlines_the_sdk_as_a_global() {
        let page = revision_page();
        assert!(!page.contains(SLOT));
        assert!(page.contains("globalThis.AtelierExtApps={"));
        for name in [
            "App:",
            "applyDocumentTheme:",
            "applyHostStyleVariables:",
            "applyHostFonts:",
        ] {
            assert!(page.contains(name), "{name} manque");
        }
        assert!(!page.contains("export{"));
        // Un seul </script> par balise : le SDK n'en ferme aucune.
        assert_eq!(page.matches("</script>").count(), 2);
    }

    #[test]
    fn detects_ui_capable_clients() {
        assert!(client_supports_ui(
            &json!({"capabilities": {"extensions": {EXTENSION_ID: {"mimeTypes": [MIME]}}}})
        ));
        assert!(client_supports_ui(
            &json!({"capabilities": {"extensions": {EXTENSION_ID: {}}}})
        ));
        assert!(!client_supports_ui(&json!({"capabilities": {}})));
        assert!(!client_supports_ui(
            &json!({"capabilities": {"extensions": {EXTENSION_ID: {"mimeTypes": ["text/plain"]}}}})
        ));
    }
}
