//! Widgets du fil : validation, identifiant, coquille sandboxée.
//! Voir docs/superpowers/specs/2026-08-28-widgets-chat-design.md §B et §D.

use serde_json::Value;
use uuid::Uuid;

pub const HTML_MAX: usize = 128 * 1024;
pub const TITLE_MAX: usize = 80;
pub const HEIGHT_MIN: i64 = 120;
pub const HEIGHT_MAX: i64 = 900;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WidgetInput {
    pub html: String,
    pub title: String,
    pub height: i64,
}

/// Le titre est tronqué et la hauteur clampée : un modèle ne doit jamais
/// perdre un panneau pour un détail de mise en forme. Seule une charge
/// franchement hors gabarit est refusée, avec un code qu'il peut lire.
pub fn parse_widget_input(req: &Value) -> Result<WidgetInput, String> {
    let html = req
        .get("html")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .ok_or("widget_missing_html")?;
    if html.len() > HTML_MAX {
        return Err("widget_html_too_large".into());
    }
    let height = req
        .get("height")
        .and_then(|v| v.as_i64())
        .ok_or("widget_missing_height")?;
    let title: String = req
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .chars()
        .take(TITLE_MAX)
        .collect();
    Ok(WidgetInput {
        html: html.to_string(),
        title,
        height: height.clamp(HEIGHT_MIN, HEIGHT_MAX),
    })
}

/// `w_` + 16 hexadécimaux. Tiré ICI : jamais dérivé d'une entrée de l'agent,
/// donc aucune traversée de chemin possible par construction.
pub fn new_widget_id() -> String {
    let hex = Uuid::new_v4().simple().to_string();
    format!("w_{}", &hex[..16])
}

pub fn is_valid_widget_id(id: &str) -> bool {
    id.len() == 18
        && id.starts_with("w_")
        && id[2..].chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

fn escape_html(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// La coquille : CSP, tokens de thème, pont postMessage. L'agent écrit le
/// contenu de la page, jamais sa tête.
pub fn wrap_shell(input: &WidgetInput) -> String {
    format!(
        r#"<!doctype html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:;">
<title>{title}</title>
<style>
  :root {{ color-scheme: light dark; }}
  html, body {{ margin: 0; background: transparent; color: var(--fg, #dadee3);
    font-family: var(--ui-font, -apple-system, system-ui, sans-serif); font-size: 13px; }}
  body {{ padding: 14px; }}
  @media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; transition: none !important; }} }}
</style>
</head><body>
<script>
(function () {{
  var parentWin = window.parent;
  function post(msg) {{ parentWin.postMessage(msg, "*"); }}
  window.sendPrompt = function (text) {{
    post({{ source: "atelier-widget", type: "prompt", text: String(text == null ? "" : text) }});
  }};
  window.saveState = function (state) {{
    post({{ source: "atelier-widget", type: "state", state: state }});
  }};
  window.addEventListener("message", function (e) {{
    var d = e.data;
    if (!d || d.source !== "atelier-host") return;
    if (d.type === "theme" && d.tokens) {{
      for (var k in d.tokens) document.documentElement.style.setProperty(k, d.tokens[k]);
    }}
    if (d.type === "restore" && typeof window.onRestore === "function") {{
      try {{ window.onRestore(d.state); }} catch (err) {{ }}
    }}
  }});
  window.addEventListener("load", function () {{
    post({{ source: "atelier-widget", type: "ready" }});
  }});
}})();
</script>
{html}
</body></html>"#,
        title = escape_html(&input.title),
        html = input.html,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn req(html: &str, title: &str, height: i64) -> serde_json::Value {
        json!({ "html": html, "title": title, "height": height })
    }

    #[test]
    fn height_is_clamped_never_rejected() {
        assert_eq!(parse_widget_input(&req("<p>a</p>", "t", 10)).unwrap().height, HEIGHT_MIN);
        assert_eq!(parse_widget_input(&req("<p>a</p>", "t", 5000)).unwrap().height, HEIGHT_MAX);
        assert_eq!(parse_widget_input(&req("<p>a</p>", "t", 300)).unwrap().height, 300);
    }

    #[test]
    fn title_is_truncated_never_rejected() {
        let long = "é".repeat(200);
        let parsed = parse_widget_input(&req("<p>a</p>", &long, 200)).unwrap();
        assert_eq!(parsed.title.chars().count(), TITLE_MAX);
    }

    #[test]
    fn oversized_html_is_refused_with_a_code_the_model_can_read() {
        let huge = "x".repeat(HTML_MAX + 1);
        assert_eq!(
            parse_widget_input(&req(&huge, "t", 200)).unwrap_err(),
            "widget_html_too_large"
        );
    }

    #[test]
    fn missing_fields_are_refused() {
        assert_eq!(
            parse_widget_input(&json!({"title": "t", "height": 200})).unwrap_err(),
            "widget_missing_html"
        );
        assert_eq!(
            parse_widget_input(&json!({"html": "<p>a</p>", "title": "t"})).unwrap_err(),
            "widget_missing_height"
        );
    }

    #[test]
    fn ids_are_well_formed_and_distinct() {
        let a = new_widget_id();
        let b = new_widget_id();
        assert_ne!(a, b);
        assert!(is_valid_widget_id(&a), "{a} devrait être valide");
        assert_eq!(a.len(), 18); // "w_" + 16 hex
    }

    #[test]
    fn hostile_ids_are_rejected() {
        for bad in [
            "../../etc/passwd",
            "w_../../etc",
            "w_ABCDEF0123456789", // majuscules
            "w_short",
            "w_0123456789abcdef0", // 17 hex
            "",
        ] {
            assert!(!is_valid_widget_id(bad), "{bad} aurait dû être rejeté");
        }
    }

    #[test]
    fn shell_locks_the_sandbox_down() {
        let input = parse_widget_input(&req("<p>salut</p>", "titre", 240)).unwrap();
        let shell = wrap_shell(&input);
        assert!(shell.contains("default-src 'none'"));
        assert!(!shell.contains("connect-src"), "aucun réseau autorisé");
        assert!(!shell.contains("font-src"), "aucune police distante");
        assert!(shell.contains("<p>salut</p>"), "le contenu de l'agent est présent");
        assert!(shell.contains("sendPrompt"), "le pont est injecté");
    }

    #[test]
    fn shell_does_not_let_a_title_break_out_of_the_tag() {
        let input = parse_widget_input(&req("<p>a</p>", "</title><script>boom()</script>", 200)).unwrap();
        let shell = wrap_shell(&input);
        assert!(!shell.contains("<script>boom()</script>"));
        assert!(shell.contains("&lt;/title&gt;"));
    }

    #[test]
    fn shell_blocks_the_directives_default_src_does_not_cover() {
        let input = parse_widget_input(&req("<p>a</p>", "t", 200)).unwrap();
        let shell = wrap_shell(&input);
        // default-src n'est pas un repli pour ces deux-là (spec CSP)
        assert!(shell.contains("form-action 'none'"));
        assert!(shell.contains("base-uri 'none'"));
    }
}
