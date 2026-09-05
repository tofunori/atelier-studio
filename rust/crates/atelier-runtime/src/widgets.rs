//! Widgets du fil : validation, identifiant, coquille sandboxée.
//! Voir docs/superpowers/specs/2026-08-28-widgets-chat-design.md §B et §D.

use crate::state::AppState;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const PRESENTATION: &str = include_str!("widget_presentation.html");

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
    // Les LLM écrivent souvent `420.0`. Refuser le panneau pour ça serait
    // absurde : les deux formes sont acceptées, puis clampées comme le reste.
    let height = req
        .get("height")
        .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f.round() as i64)))
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
/// Contenu de tous les blocs `<script>` du fragment, concaténé.
pub fn extract_scripts(html: &str) -> String {
    let mut out = String::new();
    let bas = html.to_ascii_lowercase();
    let mut i = 0;
    while let Some(rel) = bas[i..].find("<script") {
        let ouvre = i + rel;
        let Some(rel_fin_balise) = bas[ouvre..].find('>') else { break };
        let debut = ouvre + rel_fin_balise + 1;
        let Some(rel_fermeture) = bas[debut..].find("</script") else { break };
        let fin = debut + rel_fermeture;
        out.push_str(&html[debut..fin]);
        out.push('\n');
        i = fin;
    }
    out
}

/// Globaux qu'un script de widget a le DROIT de référencer sans les
/// déclarer : le langage, le navigateur, et le pont de la coquille. Tout
/// identifiant libre hors de cette liste est une faute (variable jamais
/// déclarée, coquille dans un nom) — le cas TAU0/TAUOBS du 2026-08-30.
/// Un oubli ici ferait un FAUX REFUS : en cas de doute, ajouter le nom.
const GLOBAUX_PERMIS: &[&str] = &[
    // langage
    "globalThis", "undefined", "NaN", "Infinity", "Math", "JSON", "Number",
    "String", "Array", "Object", "Boolean", "Symbol", "BigInt", "Date",
    "RegExp", "Map", "Set", "WeakMap", "WeakSet", "Promise", "Proxy",
    "Reflect", "Intl", "Error", "TypeError", "RangeError", "SyntaxError",
    "parseFloat", "parseInt", "isNaN", "isFinite", "structuredClone",
    "queueMicrotask", "console", "arguments", "eval",
    "Float32Array", "Float64Array", "Int8Array", "Int16Array", "Int32Array",
    "Uint8Array", "Uint16Array", "Uint32Array", "Uint8ClampedArray",
    "ArrayBuffer", "DataView",
    "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
    "atob", "btoa", "TextEncoder", "TextDecoder", "URL", "URLSearchParams",
    // navigateur
    "window", "document", "navigator", "location", "screen", "self",
    "parent", "frames", "history", "innerWidth", "innerHeight",
    "devicePixelRatio", "performance", "crypto", "getComputedStyle",
    "matchMedia", "alert", "getSelection",
    "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback",
    "cancelIdleCallback", "addEventListener", "removeEventListener",
    "dispatchEvent", "postMessage",
    "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "PointerEvent",
    "WheelEvent", "TouchEvent", "MessageEvent", "AbortController",
    "ResizeObserver", "IntersectionObserver", "MutationObserver",
    "Image", "Audio", "Path2D", "DOMMatrix", "DOMPoint", "DOMRect",
    "ImageData", "OffscreenCanvas", "FontFace", "Option", "Node", "Element",
    "HTMLElement", "HTMLCanvasElement", "SVGElement", "DocumentFragment",
    "Blob", "File", "FileReader", "FormData",
    // bloqués par la CSP à l'exécution, mais référençables sans faute
    "fetch", "XMLHttpRequest", "WebSocket", "localStorage", "sessionStorage",
    "indexedDB", "Worker",
    // le pont de la coquille
    "saveState", "sendPrompt", "onRestore",
];

/// Analyse STATIQUE du script du widget — pure Rust (oxc), aucune exécution,
/// aucun binaire externe (décision Thierry 2026-08-30, remplace le spawn de
/// node). Deux fautes seulement, les mêmes qu'avant :
/// - syntaxe invalide (le parseur la voit nativement) ;
/// - identifiant libre inconnu du langage, du navigateur et du pont — une
///   variable jamais déclarée ou une coquille dans un nom. L'analyse les voit
///   dans TOUTES les branches, y compris celles qu'une exécution n'aurait
///   jamais parcourues.
/// Rend `None` quand le script est publiable. En cas de doute, on publie.
pub fn script_fautif(html: &str) -> Option<String> {
    let script = extract_scripts(html);
    if script.trim().is_empty() {
        return None;
    }
    let alloc = oxc_allocator::Allocator::default();
    // mode script, pas module : les widgets n'importent rien, et le mode
    // module imposerait le strict qui change la sémantique de `var`
    let source_type = oxc_span::SourceType::cjs();
    let parsed = oxc_parser::Parser::new(&alloc, &script, source_type).parse();
    if let Some(err) = parsed.errors.first() {
        return Some(format!("SyntaxError: {}", err.message));
    }
    let semantic = oxc_semantic::SemanticBuilder::new().build(&parsed.program);
    let scoping = semantic.semantic.scoping();
    let mut inconnus: Vec<&str> = scoping
        .root_unresolved_references()
        .keys()
        .map(|name| name.as_str())
        .filter(|name| !GLOBAUX_PERMIS.contains(name))
        .collect();
    inconnus.sort_unstable();
    let premier = inconnus.first()?;
    Some(format!(
        "ReferenceError: {premier} is not defined — identifiant jamais déclaré \
dans le script (coquille dans le nom ?)"
    ))
}

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
{presentation}
<script>
(function () {{
  var parentWin = window.parent;
  function post(msg) {{ parentWin.postMessage(msg, "*"); }}
  window.sendPrompt = function (text) {{
    post({{ source: "atelier-widget", type: "prompt", text: String(text == null ? "" : text) }});
  }};
  // Débounce 200 ms (spec §D). Un widget qui appelle saveState dans une
  // boucle requestAnimationFrame poussait sinon 60 JSON.stringify +
  // TextEncoder().encode() de 4 Ko par seconde sur le thread principal de
  // l'app hôte. Front montant immédiat (le premier état part tout de suite),
  // puis au plus un envoi par fenêtre — et jamais de perte : la dernière
  // valeur reçue pendant la fenêtre est envoyée à sa fermeture.
  var STATE_MIN_MS = 200;
  var stateTimer = null;
  var pendingState = null;
  var hasPending = false;
  var lastSentAt = 0;
  function flushState() {{
    stateTimer = null;
    if (!hasPending) return;
    hasPending = false;
    lastSentAt = Date.now();
    var payload = pendingState;
    pendingState = null;
    post({{ source: "atelier-widget", type: "state", state: payload }});
  }}
  window.saveState = function (state) {{
    pendingState = state;
    hasPending = true;
    if (stateTimer !== null) return;
    var wait = STATE_MIN_MS - (Date.now() - lastSentAt);
    if (wait <= 0) {{ flushState(); return; }}
    stateTimer = setTimeout(flushState, wait);
  }};
  window.addEventListener("message", function (e) {{
    var d = e.data;
    if (!d || d.source !== "atelier-host") return;
    if (d.type === "theme" && d.tokens) {{
      for (var k in d.tokens) document.documentElement.style.setProperty(k, d.tokens[k]);
    }}
    if (d.type === "restore" && typeof window.onRestore === "function") {{
      try {{ window.onRestore(d.state); }} catch (err) {{ post({{ source: "atelier-widget", type: "error" }}); }}
    }}
  }});
  // Sortie clavier. Un keydown produit DANS une frame d'origine opaque ne
  // remonte jamais au document parent : sans ce relais, l'iframe est un
  // piège à clavier (Tab y entre, rien n'en sort) — le handler de la carte
  // ne se déclenchait que si le focus était déjà SUR la carte.
  window.addEventListener("keydown", function (e) {{
    if (e.key !== "Escape") return;
    post({{ source: "atelier-widget", type: "escape" }});
  }});
  window.addEventListener("load", function () {{
    post({{ source: "atelier-widget", type: "ready" }});
  }});
}})();
</script>
{html}
</body></html>"#,
        presentation = PRESENTATION,
        title = escape_html(&input.title),
        html = input.html,
    )
}

pub const FILES_PER_THREAD_MAX: usize = 200;
pub const WIDGETS_PER_TURN_MAX: u32 = 8;

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

/// L'event durable poussé au fil : jamais le HTML (il gonflerait le JSONL et
/// repasserait dans le contexte du modèle au rejeu), seulement de quoi
/// afficher le panneau.
#[allow(clippy::too_many_arguments)]
pub fn widget_event(
    thread_id: &str,
    id: &str,
    input: &WidgetInput,
    sequence: u64,
    event_id: &str,
    ts: i64,
    turn_id: Option<&str>,
) -> Value {
    json!({
        "kind": "widget",
        "id": id,
        "title": input.title,
        "height": input.height,
        "meta": {
            "threadId": thread_id,
            "sequence": sequence,
            "eventId": event_id,
            "ts": ts,
            // `groupTurns` (src/lib/chat/turnViewModel.ts) groupe par turnId.
            // Absent, l'event ouvre un tour fantôme APRÈS le tour en cours :
            // le vrai tour cesse d'être le dernier (spinner, jetons et pensée
            // live se détachent) et le panneau disparaît au repli.
            "turnId": turn_id,
        }
    })
}

/// Retire tout le dossier de widgets d'un fil. Rend `true` si quelque chose a
/// été supprimé. Idempotent : purger un fil déjà purgé n'est pas une erreur.
pub fn purge_thread_widgets(app_dir: &Path, thread_id: &str) -> bool {
    let dir = widget_dir(app_dir, thread_id);
    dir.exists() && std::fs::remove_dir_all(&dir).is_ok()
}

/// Cœur pur du handler : ce qui est servi, ou rien.
pub fn serve_body(app_dir: &Path, thread_id: &str, id: &str) -> Option<String> {
    read_widget(app_dir, thread_id, id).map(|shell| {
        // Upgrade only our known legacy envelope, in memory. Stored fragments
        // and exported histories remain unchanged.
        // Refresh our presentation layer for already saved widgets as well.
        // Only the known shell prefix is eligible; user HTML is never rewritten.
        let prefix = "</head><body>\n<!-- atelier-widget-presentation-v1 -->";
        if let Some(start) = shell.find(prefix).map(|at| at + "</head><body>\n".len()) {
            let tail = &shell[start..];
            let end_marker = "<!-- /atelier-widget-presentation -->";
            let end = tail.find(end_marker).map(|at| at + end_marker.len())
                .or_else(|| tail.find("</script>").map(|at| at + "</script>".len()));
            if let Some(end) = end {
                return format!("{}{}{}", &shell[..start], PRESENTATION.trim_end(), &tail[end..]);
            }
        }
        let body = "</head><body>\n<script>\n(function () {";
        if shell.contains(body) && !shell.contains("<!-- atelier-widget-presentation-v1 -->") {
            shell.replacen(body, &format!("</head><body>\n{PRESENTATION}\n<script>\n(function () {{"), 1)
                .replacen(
                    "try { window.onRestore(d.state); } catch (err) { }",
                    "try { window.onRestore(d.state); } catch (err) { post({ source: \"atelier-widget\", type: \"error\" }); }",
                    1,
                )
        } else {
            shell
        }
    })
}

/// Handler HTTP pour servir le HTML du widget.
///
/// Comme `/health`, `/providers`, `/setup` et `/uistate` : le jeton est
/// EXIGÉ. C'était la seule route qui ne le demandait pas, alors que le
/// `CorsLayer` est `allow_origin(Any)` — n'importe quelle page ouverte dans
/// un navigateur pouvait lire la coquille d'un widget en devinant son id. Le
/// frontend envoie déjà `sidecarHeaders(info)` (`WidgetFrame.tsx`).
pub async fn widget_html_handler(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: axum::http::HeaderMap,
    axum::extract::Path((thread_id, id)): axum::extract::Path<(String, String)>,
) -> axum::response::Response {
    use axum::http::{header, StatusCode};
    use axum::response::IntoResponse;

    // URL de capacité, PAS de jeton : le consommateur est une iframe `src=`
    // (une iframe ne peut pas envoyer d'en-tête), imposée parce qu'un document
    // srcdoc HÉRITE de la CSP du parent — script-src 'self' de l'app bloquait
    // tous les scripts inline de la coquille (widget muet, vu le 2026-08-29).
    // La protection est le chemin lui-même : hash SHA-256 du fil + 16 hex
    // tirés par le runtime, rien n'est devinable ni énuméré.
    let _ = &headers;

    match serve_body(state.app_dir(), &thread_id, &id) {
        Some(body) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
            body,
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "widget introuvable").into_response(),
    }
}

/// Action MCP `show_widget` : valide, écrit la coquille sur disque, purge le
/// surplus, puis journalise et publie l'event durable. Le patron d'émission
/// est copié de `agent_mailbox.rs::emit_agent_message_events`.
pub async fn action_show_widget(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    // Valider AVANT de consommer : sinon huit appels malformés épuisent le
    // budget du tour sans qu'un seul panneau n'ait été affiché. Le slot est
    // pris juste après, et TOUJOURS avant la moindre écriture disque.
    let input = parse_widget_input(req)?;

    // Porte de fiabilité (2026-08-30). Sans elle, un script fautif publiait
    // quand même : la coquille poste `ready` au `load` de la page, donc
    // l'hôte révélait un panneau VIDE qui se prétendait vivant. L'agent ne
    // s'en apercevait qu'en relisant son propre code, et empilait alors une
    // seconde carte pour corriger la première — trois panneaux publiés, deux
    // morts (constaté chez Thierry). On refuse AVANT toute écriture, avec le
    // message d'erreur exact : c'est le seul canal qui atteint l'agent dans
    // le même tour, donc il corrige sans jamais avoir sali le fil.
    if let Some(faute) = script_fautif(&input.html) {
        return Err(format!(
            "widget_script_invalide — le script du panneau échoue avant même \
d'être affiché : {faute}. Corrige-le et rappelle l'outil ; RIEN n'a été publié \
dans le fil, tu n'as donc pas de panneau à remplacer."
        ));
    }

    let turn_id = {
        let mut reg = state.capabilities().lock().await;
        if !reg.try_consume_widget_slot(caller_id, WIDGETS_PER_TURN_MAX) {
            return Err("widget_turn_limit".into());
        }
        reg.turn_id_of(caller_id)
    };

    let id = new_widget_id();
    let shell = wrap_shell(&input);

    write_widget(state.app_dir(), caller_id, &id, &shell).map_err(|e| {
        tracing::warn!("widget non écrit : {e}");
        "widget_write_failed".to_string()
    })?;
    purge_oldest(&widget_dir(state.app_dir(), caller_id), FILES_PER_THREAD_MAX);

    let sequence = state.journal().last_sequence(caller_id) + 1;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let durable = widget_event(
        caller_id,
        &id,
        &input,
        sequence,
        &Uuid::new_v4().to_string(),
        ts,
        turn_id.as_deref(),
    );
    let _ = state.journal().append(&durable);
    state.publish(crate::ws_router::json_msg(json!({
        "type": "event",
        "threadId": caller_id,
        "event": durable,
    })));

    Ok(json!({
        "ok": true,
        "widgetId": id,
        "note": "Le panneau est affiché dans le fil. Ne recopie pas le HTML dans ta réponse."
    }))
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
    fn a_floating_height_is_clamped_not_refused() {
        // `{"height": 420.0}` est ce que produisent souvent les modèles :
        // `as_i64()` rendait None et le panneau était perdu pour un point.
        let parsed = parse_widget_input(&json!({
            "html": "<p>a</p>", "title": "t", "height": 420.0
        }))
        .unwrap();
        assert_eq!(parsed.height, 420);
        assert_eq!(
            parse_widget_input(&json!({"html": "<p>a</p>", "title": "t", "height": 419.6}))
                .unwrap()
                .height,
            420
        );
        // et les bornes s'appliquent aux deux formes
        assert_eq!(
            parse_widget_input(&json!({"html": "<p>a</p>", "title": "t", "height": 5000.0}))
                .unwrap()
                .height,
            HEIGHT_MAX
        );
        assert_eq!(
            parse_widget_input(&json!({"html": "<p>a</p>", "title": "t", "height": 10.0}))
                .unwrap()
                .height,
            HEIGHT_MIN
        );
        // ce qui n'est pas un nombre reste refusé, avec le code lisible
        assert_eq!(
            parse_widget_input(&json!({"html": "<p>a</p>", "title": "t", "height": "420"}))
                .unwrap_err(),
            "widget_missing_height"
        );
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
        assert!(!shell.contains("connect-src"), "aucune requête réseau autorisée");
        assert!(!shell.contains("font-src"), "aucune police distante");
        assert!(shell.contains("<p>salut</p>"), "le contenu de l'agent est présent");
        assert!(shell.contains("sendPrompt"), "le pont est injecté");
    }

    #[test]
    fn legacy_shell_gets_presentation_without_rewriting_disk() {
        let dir = tempfile::tempdir().unwrap();
        let id = new_widget_id();
        let input = parse_widget_input(&req("<p>legacy</p>", "t", 420)).unwrap();
        let current = wrap_shell(&input);
        let legacy = current.replace(&format!("{PRESENTATION}\n"), "")
            .replace("catch (err) { post({ source: \"atelier-widget\", type: \"error\" }); }", "catch (err) { }");
        write_widget(dir.path(), "t1", &id, &legacy).unwrap();
        let served = serve_body(dir.path(), "t1", &id).unwrap();
        assert_eq!(served, current);
        assert_eq!(read_widget(dir.path(), "t1", &id).unwrap(), legacy);
        write_widget(dir.path(), "t1", &id, &current).unwrap();
        assert_eq!(serve_body(dir.path(), "t1", &id).unwrap(), current);
    }

    #[test]
    fn saved_presentation_is_refreshed_without_changing_widget_or_disk() {
        let dir = tempfile::tempdir().unwrap();
        let id = new_widget_id();
        let input = parse_widget_input(&req("<input type=\"range\" id=\"x\">", "t", 420)).unwrap();
        let current = wrap_shell(&input);
        let old = current.replace(PRESENTATION, "<!-- atelier-widget-presentation-v1 -->\n<style>/* old */</style>\n<script>/* old */</script>\n");
        write_widget(dir.path(), "t1", &id, &old).unwrap();
        assert_eq!(serve_body(dir.path(), "t1", &id).unwrap(), current);
        assert_eq!(read_widget(dir.path(), "t1", &id).unwrap(), old);
        write_widget(dir.path(), "t1", &id, &current).unwrap();
        assert_eq!(serve_body(dir.path(), "t1", &id).unwrap(), current);
    }

    #[test]
    fn shell_debounces_state_and_relays_escape() {
        let input = parse_widget_input(&req("<p>a</p>", "t", 200)).unwrap();
        let shell = wrap_shell(&input);
        // spec §D : `state` est débouncé à 200 ms DANS la coquille — c'est là
        // que ça coûte le moins et que ça protège le thread de l'hôte.
        assert!(shell.contains("STATE_MIN_MS = 200"), "débounce de 200 ms absent");
        assert!(shell.contains("setTimeout(flushState"), "pas de report d'envoi");
        assert!(
            shell.contains("hasPending = true"),
            "la dernière valeur de la fenêtre doit être conservée"
        );
        // spec §F : Échap doit SORTIR de l'iframe. Le keydown d'une frame
        // d'origine opaque ne remonte pas au parent : il faut le relayer.
        assert!(shell.contains(r#"e.key !== "Escape""#), "pas d'écouteur Échap");
        assert!(shell.contains(r#"type: "escape""#), "Échap n'est pas relayé à l'hôte");
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
    fn event_carries_only_what_the_timeline_needs() {
        let input = parse_widget_input(&req("<p>lourd</p>", "loi de Student", 420)).unwrap();
        let ev = widget_event(
            "t1",
            "w_0123456789abcdef",
            &input,
            7,
            "evt-1",
            1_700_000_000_000,
            Some("turn-42"),
        );

        assert_eq!(ev["kind"], "widget");
        assert_eq!(ev["id"], "w_0123456789abcdef");
        assert_eq!(ev["title"], "loi de Student");
        assert_eq!(ev["height"], 420);
        assert_eq!(ev["meta"]["threadId"], "t1");
        assert_eq!(ev["meta"]["sequence"], 7);
        assert_eq!(ev["meta"]["eventId"], "evt-1");
        // Sans turnId le frontend fabrique un tour fantôme : le tour en cours
        // cesse d'être le dernier, et le panneau s'évapore au repli.
        assert_eq!(ev["meta"]["turnId"], "turn-42");

        // le HTML ne DOIT PAS voyager dans l'event : il gonflerait le JSONL
        // et repasserait dans le contexte du modèle au rejeu.
        let serialized = serde_json::to_string(&ev).unwrap();
        assert!(!serialized.contains("lourd"), "le HTML a fuité dans l'event");
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

    #[test]
    fn served_body_is_the_shell_or_nothing() {
        let dir = tempdir().unwrap();
        let id = new_widget_id();
        write_widget(dir.path(), "t1", &id, "<html>coquille</html>").unwrap();

        // le corps servi est exactement ce qui est sur disque
        assert_eq!(
            serve_body(dir.path(), "t1", &id).as_deref(),
            Some("<html>coquille</html>")
        );
        // fichier absent → rien à servir (le handler rendra un 404)
        assert_eq!(serve_body(dir.path(), "t1", &new_widget_id()), None);
        // id hostile → rien à servir, aucun chemin construit
        assert_eq!(serve_body(dir.path(), "t1", "../../etc/passwd"), None);
    }

    #[test]
    fn deleting_a_thread_takes_its_widgets_with_it() {
        let dir = tempdir().unwrap();
        let id = new_widget_id();
        write_widget(dir.path(), "t1", &id, "<html>coquille</html>").unwrap();
        write_widget(dir.path(), "t2", &new_widget_id(), "<html>autre</html>").unwrap();

        assert!(purge_thread_widgets(dir.path(), "t1"));
        assert_eq!(read_widget(dir.path(), "t1", &id), None);
        assert!(!widget_dir(dir.path(), "t1").exists());
        // le fil voisin n'est pas touché
        assert!(widget_dir(dir.path(), "t2").exists());
        // idempotent : purger deux fois ne casse rien
        assert!(!purge_thread_widgets(dir.path(), "t1"));
    }

    // ---- intégration : l'action complète, telle que le pont MCP l'appelle ----

    async fn test_state() -> (AppState, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let paths = crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf());
        let state = AppState::new(
            paths,
            None,
            "2026-01-01T00:00:00.000Z".into(),
            "0.1.0".into(),
            "testhash".into(),
            "/tmp/server".into(),
        );
        state.set_port(9).await;
        (state, dir)
    }

    /// Contrat de forme avec le frontend : `src/lib/ws.ts` (`kind: "widget"`)
    /// et `src/lib/chat/turnViewModel.ts` (`groupTurns` lit `meta.turnId`).
    #[tokio::test]
    async fn show_widget_emits_the_shape_the_frontend_consumes() {
        let (state, _dir) = test_state().await;
        {
            let mut reg = state.capabilities().lock().await;
            reg.issue("t1", "/tmp/proj", "claude", None, Some("turn-7".into()));
        }
        let mut bus = state.subscribe_bus();

        let out = action_show_widget(&state, "t1", &req("<p>salut</p>", "titre", 420))
            .await
            .unwrap();
        assert_eq!(out["ok"], true);
        let widget_id = out["widgetId"].as_str().unwrap().to_string();
        assert!(is_valid_widget_id(&widget_id));

        // publié sur le bus, sous la forme attendue par le frontend
        let raw = bus.try_recv().expect("aucun event publié");
        let msg: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(msg["type"], "event");
        assert_eq!(msg["threadId"], "t1");
        let ev = &msg["event"];
        assert_eq!(ev["kind"], "widget");
        assert_eq!(ev["id"], widget_id);
        assert_eq!(ev["title"], "titre");
        assert_eq!(ev["height"], 420);
        assert_eq!(ev["meta"]["threadId"], "t1");
        assert_eq!(ev["meta"]["turnId"], "turn-7");
        assert!(ev["meta"]["sequence"].is_u64());
        assert!(ev["meta"]["eventId"].as_str().is_some_and(|s| !s.is_empty()));
        assert!(ev["meta"]["ts"].as_i64().is_some_and(|t| t > 0));
        assert!(ev.get("html").is_none(), "le HTML ne doit pas voyager");

        // journalisé à l'identique : le rejeu de session voit la même chose
        let replayed = state.journal().materialize("t1");
        let last = replayed.last().expect("journal vide");
        assert_eq!(last["kind"], "widget");
        assert_eq!(last["meta"]["turnId"], "turn-7");

        // et la coquille est bien sur disque, servable par la route
        let served = serve_body(state.app_dir(), "t1", &widget_id).unwrap();
        assert!(served.starts_with("<!doctype html>"));
        assert!(served.contains("<p>salut</p>"));
    }

    #[tokio::test]
    async fn a_malformed_call_never_burns_a_turn_slot() {
        let (state, _dir) = test_state().await;
        {
            let mut reg = state.capabilities().lock().await;
            reg.issue("t1", "/tmp/proj", "claude", None, Some("turn-7".into()));
        }
        // 8 appels malformés d'affilée : aucun ne doit consommer le budget
        for _ in 0..(WIDGETS_PER_TURN_MAX + 4) {
            let err = action_show_widget(&state, "t1", &json!({"title": "t", "height": 200}))
                .await
                .unwrap_err();
            assert_eq!(err, "widget_missing_html");
        }
        // le tour a encore ses 8 emplacements
        for i in 0..WIDGETS_PER_TURN_MAX {
            action_show_widget(&state, "t1", &req("<p>a</p>", "t", 200))
                .await
                .unwrap_or_else(|e| panic!("le widget {i} devait passer : {e}"));
        }
        assert_eq!(
            action_show_widget(&state, "t1", &req("<p>a</p>", "t", 200))
                .await
                .unwrap_err(),
            "widget_turn_limit"
        );
    }

    #[tokio::test]
    async fn no_grant_means_no_widget_and_no_file_written() {
        let (state, _dir) = test_state().await;
        assert_eq!(
            action_show_widget(&state, "orphelin", &req("<p>a</p>", "t", 200))
                .await
                .unwrap_err(),
            "widget_turn_limit"
        );
        assert!(!widget_dir(state.app_dir(), "orphelin").exists());
    }
}

#[cfg(test)]
mod porte_script_tests {
    use super::{extract_scripts, script_fautif};

    /// LE cas réel du 2026-08-30 : l'agent écrit TAU0 au lieu de TAUOBS. Le
    /// canevas restait vide et le panneau se prétendait vivant.
    #[test]
    fn la_variable_non_declaree_est_attrapee() {
        let html = r#"<div id="p"></div>
<script>
var TAUOBS = 0.0015;
function dessine() { var x = TAU0 * 2; document.getElementById("p").textContent = x; }
dessine();
</script>"#;
        let faute = script_fautif(html).expect("TAU0 doit être refusé");
        assert!(faute.starts_with("ReferenceError:"), "{faute}");
        assert!(faute.contains("TAU0"), "{faute}");
    }

    #[test]
    fn la_syntaxe_invalide_est_attrapee() {
        let html = r#"<script>function f( { return 1; }</script>"#;
        let faute = script_fautif(html).expect("syntaxe invalide doit être refusée");
        assert!(faute.starts_with("SyntaxError:"), "{faute}");
    }

    /// Le point qui décide de l'utilité : un widget NORMAL, qui touche le DOM,
    /// le canvas, requestAnimationFrame et le pont, ne doit JAMAIS être refusé.
    #[test]
    fn un_widget_honnete_passe() {
        let html = r#"<div><input id="k" type="range"><canvas id="c"></canvas></div>
<script>
var k = document.getElementById("k");
var cv = document.getElementById("c"), dpr = devicePixelRatio || 1;
cv.width = cv.clientWidth * dpr;
var ctx = cv.getContext("2d");
ctx.scale(dpr, dpr);
function f() {
  var v = +k.value;
  ctx.clearRect(0, 0, 400, 100);
  ctx.beginPath();
  for (var i = 0; i < 50; i++) ctx.lineTo(i * 8, 50 - v * i);
  ctx.stroke();
  if (window.saveState) saveState({ k: v });
  requestAnimationFrame(f);
}
window.onRestore = function (s) { if (s && s.k) k.value = s.k; f(); };
k.addEventListener("input", f);
var st = getComputedStyle(document.documentElement).getPropertyValue("--accent");
if (matchMedia("(prefers-reduced-motion: reduce)").matches) { /* pause */ }
f();
</script>"#;
        assert_eq!(script_fautif(html), None, "faux refus sur un widget normal");
    }

    /// La raison technique du passage à l'analyse statique : une exécution à
    /// blanc ne voit que le chemin parcouru. La coquille dans une branche
    /// conditionnelle (le gestionnaire d'un clic, un mode alternatif) passait
    /// la porte version node et plantait chez l'utilisateur au premier clic.
    #[test]
    fn la_faute_dans_une_branche_jamais_executee_est_vue_quand_meme() {
        let html = r#"<script>
var mode = "pente";
function bascule() { if (mode === "z") { dessine(TAUX_Z); } }
function dessine(v) { document.title = v; }
</script>"#;
        let faute = script_fautif(html).expect("TAUX_Z doit être vu sans exécuter");
        assert!(faute.contains("TAUX_Z"), "{faute}");
    }

    /// Un global navigateur légitime mais rare ne doit pas faire un faux
    /// refus — c'est la liste blanche qui porte cette garantie.
    #[test]
    fn les_api_navigateur_rares_ne_font_pas_de_faux_refus() {
        let html = r#"<script>
var p = new Path2D("M0 0 L10 10");
var obs = new ResizeObserver(function () {});
var enc = new TextEncoder();
performance.now(); crypto.getRandomValues(new Uint8Array(4));
</script>"#;
        assert_eq!(script_fautif(html), None);
    }

    #[test]
    fn un_fragment_sans_script_passe() {
        assert_eq!(script_fautif("<div>juste du texte</div>"), None);
    }

    #[test]
    fn les_blocs_script_sont_tous_extraits() {
        let html = r#"<script>var a=1;</script><p>x</p><script type="text/javascript">var b=2;</script>"#;
        let s = extract_scripts(html);
        assert!(s.contains("var a=1;") && s.contains("var b=2;"));
        assert!(!s.contains("<p>"));
    }
}

