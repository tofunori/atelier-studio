//! Widgets du fil : validation, identifiant, coquille sandboxée.
//! Voir docs/superpowers/specs/2026-08-28-widgets-chat-design.md §B et §D.

use serde_json::Value;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none';">
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

pub const FILES_PER_THREAD_MAX: usize = 200;

/// Même convention que `harness-history/` (atelier-store/journal.rs) : le
/// threadId est haché, jamais posé tel quel dans un chemin.
pub fn widget_dir(app_dir: &Path, thread_id: &str) -> PathBuf {
    let mut h = Sha256::new();
    h.update(thread_id.as_bytes());
    app_dir.join("widgets").join(hex::encode(h.finalize()))
}

pub fn widget_path(app_dir: &Path, thread_id: &str, id: &str) -> Option<PathBuf> {
    if !is_valid_widget_id(id) {
        return None;
    }
    Some(widget_dir(app_dir, thread_id).join(format!("{id}.html")))
}

pub fn write_widget(
    app_dir: &Path,
    thread_id: &str,
    id: &str,
    shell: &str,
) -> std::io::Result<PathBuf> {
    let path = widget_path(app_dir, thread_id, id).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "identifiant de widget invalide")
    })?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, shell)?;
    Ok(path)
}

pub fn read_widget(app_dir: &Path, thread_id: &str, id: &str) -> Option<String> {
    let path = widget_path(app_dir, thread_id, id)?;
    std::fs::read_to_string(path).ok()
}

/// Garde les `keep` fichiers les plus récents du dossier, supprime le reste.
pub fn purge_oldest(dir: &Path, keep: usize) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut files: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "html"))
        .filter_map(|e| {
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((modified, e.path()))
        })
        .collect();
    if files.len() <= keep {
        return 0;
    }
    files.sort_by_key(|(t, _)| *t); // plus ancien d'abord
    let doomed = files.len() - keep;
    let mut removed = 0;
    for (_, path) in files.into_iter().take(doomed) {
        if std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
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

    use tempfile::tempdir;

    #[test]
    fn path_is_scoped_by_thread_hash_and_refuses_bad_ids() {
        let base = Path::new("/tmp/appdir");
        let good = widget_path(base, "thread-a", "w_0123456789abcdef").unwrap();
        assert!(good.starts_with("/tmp/appdir/widgets/"));
        assert!(good.to_string_lossy().ends_with("/w_0123456789abcdef.html"));

        // deux threads ne partagent jamais un dossier
        let other = widget_path(base, "thread-b", "w_0123456789abcdef").unwrap();
        assert_ne!(good.parent(), other.parent());

        // un id hostile ne construit AUCUN chemin
        assert!(widget_path(base, "thread-a", "../../etc/passwd").is_none());
        assert!(widget_path(base, "thread-a", "w_../../etc").is_none());
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempdir().unwrap();
        let id = new_widget_id();
        let written = write_widget(dir.path(), "t1", &id, "<html>coquille</html>").unwrap();
        assert!(written.exists());
        assert_eq!(
            read_widget(dir.path(), "t1", &id).as_deref(),
            Some("<html>coquille</html>")
        );
        assert_eq!(read_widget(dir.path(), "t1", &new_widget_id()), None);
        assert_eq!(read_widget(dir.path(), "t1", "../../etc/passwd"), None);
    }

    #[test]
    fn purge_keeps_the_newest_and_reports_what_it_removed() {
        let dir = tempdir().unwrap();
        let mut ids = Vec::new();
        for _ in 0..5 {
            let id = new_widget_id();
            write_widget(dir.path(), "t1", &id, "x").unwrap();
            // mtime distinct : le test doit pouvoir ordonner
            std::thread::sleep(std::time::Duration::from_millis(12));
            ids.push(id);
        }
        let target = widget_dir(dir.path(), "t1");
        assert_eq!(purge_oldest(&target, 2), 3);
        assert!(read_widget(dir.path(), "t1", ids.last().unwrap()).is_some());
        assert!(read_widget(dir.path(), "t1", ids.first().unwrap()).is_none());
        assert_eq!(purge_oldest(&target, 2), 0, "purge idempotente");
    }
}
