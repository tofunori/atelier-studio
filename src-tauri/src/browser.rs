use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl};

const LABEL: &str = "embedded-browser";

fn find_webview(app: &AppHandle) -> Option<tauri::Webview> {
    app.webviews().into_iter().find_map(|(l, w)| if l == LABEL { Some(w) } else { None })
}

#[tauri::command]
pub fn browser_show(
    app: AppHandle,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let parsed: tauri::Url = url.parse().map_err(|e| format!("url: {e}"))?;
    if let Some(wv) = find_webview(&app) {
        wv.navigate(parsed).map_err(|e| e.to_string())?;
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
        wv.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let win = app.get_window("main").ok_or("fenêtre principale introuvable")?;
    let builder = tauri::webview::WebviewBuilder::new(LABEL, WebviewUrl::External(parsed));
    win.add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn browser_bounds(app: AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    if let Some(wv) = find_webview(&app) {
        wv.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        wv.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_hide(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = find_webview(&app) {
        wv.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_show_again(app: AppHandle) -> Result<(), String> {
    if let Some(wv) = find_webview(&app) {
        wv.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_eval(app: AppHandle, js: String) -> Result<(), String> {
    if let Some(wv) = find_webview(&app) {
        wv.eval(&js).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn browser_url(app: AppHandle) -> Result<String, String> {
    if let Some(wv) = find_webview(&app) {
        return Ok(wv.url().map_err(|e| e.to_string())?.to_string());
    }
    Ok(String::new())
}
