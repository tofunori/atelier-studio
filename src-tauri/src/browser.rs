use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl};

const LABEL: &str = "embedded-browser";
const LABEL_PREFIX: &str = "embedded-browser-";
const FIT_WIDTH: f64 = 960.0;
const MIN_ZOOM: f64 = 0.5;
const CAPTURE_PREFIX: &str = "__ATELIER_BROWSER_CAPTURE__";
const CAPTURE_SELECTION_JS: &str = r#"
(() => {
  try {
    const previousTitle = String(document.title || "");
    const selection = String(window.getSelection?.() || "").trim();
    const payload = {
      text: selection.slice(0, 100000),
      title: previousTitle.slice(0, 500),
      url: String(location.href || "").slice(0, 4096)
    };
    document.title = "__ATELIER_BROWSER_CAPTURE__" + JSON.stringify(payload);
    setTimeout(() => {
      try { document.title = previousTitle; } catch {}
    }, 60);
  } catch {
    try {
      document.title = "__ATELIER_BROWSER_CAPTURE__" + JSON.stringify({
        text: "",
        title: String(document.title || "").slice(0, 500),
        url: String(location.href || "").slice(0, 4096)
      });
    } catch {}
  }
})();
"#;

// Texte intégral de la page (base de connaissances, plan 049 T2). Même canal
// titre que la sélection : plafond 100k éprouvé par ce canal — un plafond plus
// haut demanderait un transport chunké.
// Plafond param\u00e9trable : le canal titre (WebKit) refuse silencieusement les
// tr\u00e8s longues valeurs \u2014 le front retente avec un plafond r\u00e9duit avant de se
// replier sur un fetch backend (pages publiques).
const CAPTURE_PAGE_JS_TEMPLATE: &str = r#"
(() => {
  try {
    const previousTitle = String(document.title || "");
    const text = String(document.body?.innerText || "").replace(/\u00a0/g, " ").trim();
    const payload = {
      text: text.slice(0, __MAX__),
      title: previousTitle.slice(0, 500),
      url: String(location.href || "").slice(0, 4096)
    };
    document.title = "__ATELIER_BROWSER_CAPTURE__" + JSON.stringify(payload);
    setTimeout(() => {
      try { document.title = previousTitle; } catch {}
    }, 60);
  } catch {
    try {
      document.title = "__ATELIER_BROWSER_CAPTURE__" + JSON.stringify({
        text: "",
        title: String(document.title || "").slice(0, 500),
        url: String(location.href || "").slice(0, 4096)
      });
    } catch {}
  }
})();
"#;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct BrowserCapture {
    text: String,
    title: String,
    url: String,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct BrowserImportedBookmark {
    title: String,
    url: String,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct BrowserImportedSearch {
    name: String,
    template: String,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct BrowserVivaldiImport {
    bookmarks: Vec<BrowserImportedBookmark>,
    search: Option<BrowserImportedSearch>,
}

fn capture_store() -> &'static Mutex<Option<BrowserCapture>> {
    static STORE: OnceLock<Mutex<Option<BrowserCapture>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(None))
}

fn browser_label(label: Option<String>) -> String {
    let Some(label) = label else {
        return LABEL.to_string();
    };
    if label.len() <= 96
        && (label == LABEL || label.starts_with(LABEL_PREFIX))
        && label
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'))
    {
        label
    } else {
        LABEL.to_string()
    }
}

fn find_webview(app: &AppHandle, label: &str) -> Option<tauri::Webview> {
    app.webviews()
        .into_iter()
        .find_map(|(l, w)| if l == label { Some(w) } else { None })
}

fn zoom_for_width(width: f64) -> f64 {
    (width / FIT_WIDTH).clamp(MIN_ZOOM, 1.0)
}

fn apply_zoom(wv: &tauri::Webview, width: f64) -> Result<(), String> {
    wv.set_zoom(zoom_for_width(width))
        .map_err(|e| e.to_string())
}

fn store_capture_from_title(title: &str) {
    let Some(raw) = title.strip_prefix(CAPTURE_PREFIX) else {
        return;
    };
    let Ok(capture) = serde_json::from_str::<BrowserCapture>(raw) else {
        return;
    };
    if let Ok(mut slot) = capture_store().lock() {
        *slot = Some(capture);
    }
}

fn vivaldi_profile_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("home introuvable")?;
    let base = home.join("Library/Application Support/Vivaldi");
    for profile in ["Default", "Profile 1", "Profile 2"] {
        let path = base.join(profile);
        if path.join("Bookmarks").exists() || path.join("Preferences").exists() {
            return Ok(path);
        }
    }
    Err("profil Vivaldi introuvable".into())
}

fn collect_bookmarks(node: &Value, out: &mut Vec<BrowserImportedBookmark>) {
    if out.len() >= 500 {
        return;
    }
    if node.get("type").and_then(Value::as_str) == Some("url") {
        if let Some(url) = node.get("url").and_then(Value::as_str) {
            if url.starts_with("http://") || url.starts_with("https://") {
                let title = node
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or(url)
                    .trim()
                    .to_string();
                out.push(BrowserImportedBookmark {
                    title: if title.is_empty() { url.to_string() } else { title },
                    url: url.to_string(),
                });
            }
        }
    }
    if let Some(children) = node.get("children").and_then(Value::as_array) {
        for child in children {
            collect_bookmarks(child, out);
        }
    }
}

fn import_bookmarks(profile: &Path) -> Vec<BrowserImportedBookmark> {
    let Ok(raw) = fs::read_to_string(profile.join("Bookmarks")) else {
        return Vec::new();
    };
    let Ok(json) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(roots) = json.get("roots").and_then(Value::as_object) {
        for root in roots.values() {
            collect_bookmarks(root, &mut out);
        }
    }
    out
}

fn normalize_search_template(template: &str) -> Option<String> {
    if template.is_empty() {
        return None;
    }
    if template.contains("{google:baseURL}") || template.contains("google.com") {
        return Some("https://www.google.com/search?q={searchTerms}".into());
    }
    if template.starts_with("http://") || template.starts_with("https://") {
        return Some(template.replace("%s", "{searchTerms}"));
    }
    None
}

fn search_from_template_node(node: &Value) -> Option<BrowserImportedSearch> {
    let template = node.get("url").and_then(Value::as_str)?;
    let template = normalize_search_template(template)?;
    if !template.contains("{searchTerms}") {
        return None;
    }
    let name = node
        .get("short_name")
        .or_else(|| node.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("Search")
        .trim();
    Some(BrowserImportedSearch {
        name: if name.is_empty() { "Search".into() } else { name.into() },
        template,
    })
}

fn import_search(profile: &Path) -> Option<BrowserImportedSearch> {
    let raw = fs::read_to_string(profile.join("Preferences")).ok()?;
    let json = serde_json::from_str::<Value>(&raw).ok()?;
    let provider = json.get("default_search_provider_data")?;
    for key in [
        "search_field_template_url_data",
        "template_url_data",
        "mirrored_template_url_data",
        "image_template_url_data",
    ] {
        if let Some(search) = provider.get(key).and_then(search_from_template_node) {
            return Some(search);
        }
    }
    None
}

#[tauri::command]
pub fn browser_import_vivaldi() -> Result<BrowserVivaldiImport, String> {
    let profile = vivaldi_profile_dir()?;
    Ok(BrowserVivaldiImport {
        bookmarks: import_bookmarks(&profile),
        search: import_search(&profile),
    })
}

#[tauri::command]
pub fn browser_show(
    app: AppHandle,
    label: Option<String>,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let label = browser_label(label);
    let parsed: tauri::Url = url.parse().map_err(|e| format!("url: {e}"))?;
    if let Some(wv) = find_webview(&app, &label) {
        wv.navigate(parsed).map_err(|e| e.to_string())?;
        wv.set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h))
            .map_err(|e| e.to_string())?;
        apply_zoom(&wv, w)?;
        wv.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let win = app
        .get_window("main")
        .ok_or("fenêtre principale introuvable")?;
    let builder = tauri::webview::WebviewBuilder::new(label, WebviewUrl::External(parsed))
        .on_document_title_changed(|_, title| store_capture_from_title(&title));
    let wv = win
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    apply_zoom(&wv, w)?;
    Ok(())
}

#[tauri::command]
pub fn browser_bounds(
    app: AppHandle,
    label: Option<String>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let label = browser_label(label);
    if let Some(wv) = find_webview(&app, &label) {
        wv.set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h))
            .map_err(|e| e.to_string())?;
        apply_zoom(&wv, w)?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_capture_selection(
    app: AppHandle,
    label: Option<String>,
) -> Result<BrowserCapture, String> {
    let label = browser_label(label);
    let Some(wv) = find_webview(&app, &label) else {
        return Err("pas de webview".into());
    };
    if let Ok(mut slot) = capture_store().lock() {
        *slot = None;
    }
    wv.eval(CAPTURE_SELECTION_JS).map_err(|e| e.to_string())?;
    for _ in 0..30 {
        if let Ok(mut slot) = capture_store().lock() {
            if let Some(capture) = slot.take() {
                return Ok(capture);
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    Ok(BrowserCapture {
        url: wv.url().map_err(|e| e.to_string())?.to_string(),
        ..BrowserCapture::default()
    })
}

#[tauri::command]
pub fn browser_capture_page(
    app: AppHandle,
    label: Option<String>,
    max_chars: Option<u32>,
) -> Result<BrowserCapture, String> {
    let label = browser_label(label);
    let Some(wv) = find_webview(&app, &label) else {
        return Err("pas de webview".into());
    };
    if let Ok(mut slot) = capture_store().lock() {
        *slot = None;
    }
    let max = max_chars.unwrap_or(100_000).clamp(1_000, 300_000);
    let js = CAPTURE_PAGE_JS_TEMPLATE.replace("__MAX__", &max.to_string());
    wv.eval(&js).map_err(|e| e.to_string())?;
    for _ in 0..30 {
        if let Ok(mut slot) = capture_store().lock() {
            if let Some(capture) = slot.take() {
                return Ok(capture);
            }
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    Ok(BrowserCapture {
        url: wv.url().map_err(|e| e.to_string())?.to_string(),
        ..BrowserCapture::default()
    })
}

#[tauri::command]
pub fn browser_hide(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let label = browser_label(label);
    if let Some(wv) = find_webview(&app, &label) {
        wv.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_show_again(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let label = browser_label(label);
    if let Some(wv) = find_webview(&app, &label) {
        wv.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_close(app: AppHandle, label: Option<String>) -> Result<(), String> {
    let label = browser_label(label);
    if let Some(wv) = find_webview(&app, &label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_eval(app: AppHandle, label: Option<String>, js: String) -> Result<(), String> {
    let label = browser_label(label);
    if let Some(wv) = find_webview(&app, &label) {
        wv.eval(&js).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_url(app: AppHandle, label: Option<String>) -> Result<String, String> {
    let label = browser_label(label);
    if let Some(wv) = find_webview(&app, &label) {
        return Ok(wv.url().map_err(|e| e.to_string())?.to_string());
    }
    Ok(String::new())
}

#[tauri::command]
pub fn browser_probe(app: AppHandle, label: Option<String>) -> Result<(f64, f64), String> {
    let label = browser_label(label);
    if let Some(wv) = find_webview(&app, &label) {
        let pos = wv.position().map_err(|e| e.to_string())?;
        let scale = app
            .get_window("main")
            .and_then(|w| w.scale_factor().ok())
            .unwrap_or(1.0);
        return Ok((pos.x as f64 / scale, pos.y as f64 / scale));
    }
    Err("pas de webview".into())
}
