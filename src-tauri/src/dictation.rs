//! Native macOS dictation. Only text and normalized audio levels cross into the webview.
#[cfg(target_os = "macos")]
mod native {
    use std::ffi::{c_char, CStr, CString};
    use std::sync::OnceLock;
    use tauri::{AppHandle, Emitter};

    static APP: OnceLock<AppHandle> = OnceLock::new();

    #[derive(Clone, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct DictationEvent {
        session_id: String,
        status: String,
        text: String,
        error: Option<String>,
        level: f32,
    }

    extern "C" {
        fn atelier_dictation_start(
            session: *const c_char,
            locale: *const c_char,
            callback: extern "C" fn(*const c_char, *const c_char, *const c_char, *const c_char, f32),
        );
        fn atelier_dictation_stop(session: *const c_char);
        fn atelier_dictation_cancel(session: *const c_char);
    }

    extern "C" fn on_event(
        session: *const c_char,
        status: *const c_char,
        text: *const c_char,
        error: *const c_char,
        level: f32,
    ) {
        fn owned(value: *const c_char) -> String {
            if value.is_null() { return String::new(); }
            // The native callback borrows UTF-8 NSString storage for this call.
            unsafe { CStr::from_ptr(value).to_string_lossy().into_owned() }
        }
        if let Some(app) = APP.get() {
            let event = DictationEvent {
                session_id: owned(session), status: owned(status), text: owned(text),
                error: if error.is_null() { None } else { Some(owned(error)) },
                level: if level.is_finite() { level.clamp(0.0, 1.0) } else { 0.0 },
            };
            let _ = app.emit_to("main", "dictation", event);
        }
    }

    fn session(value: &str) -> Result<CString, String> {
        if value.is_empty() || value.len() > 80 || !value.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
            return Err("Invalid dictation session".into());
        }
        CString::new(value).map_err(|e| e.to_string())
    }

    pub fn start(app: AppHandle, id: &str, locale: &str) -> Result<(), String> {
        let id = session(id)?;
        if locale.is_empty() || locale.len() > 35 || !locale.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
            return Err("Invalid dictation locale".into());
        }
        let locale = CString::new(locale).map_err(|e| e.to_string())?;
        APP.get_or_init(|| app);
        // The native entry point copies both strings before dispatching.
        unsafe { atelier_dictation_start(id.as_ptr(), locale.as_ptr(), on_event); }
        Ok(())
    }

    pub fn stop(id: &str, cancel: bool) -> Result<(), String> {
        let id = session(id)?;
        unsafe {
            if cancel { atelier_dictation_cancel(id.as_ptr()); }
            else { atelier_dictation_stop(id.as_ptr()); }
        }
        Ok(())
    }
}

fn check_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) }
    else { Err("Dictation is only available in the main window".into()) }
}

#[tauri::command]
pub fn dictation_start(app: tauri::AppHandle, window: tauri::WebviewWindow, session_id: String, locale: String) -> Result<(), String> {
    check_window(&window)?;
    #[cfg(target_os = "macos")]
    { native::start(app, &session_id, &locale) }
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, session_id, locale); Err("Dictation requires macOS".into()) }
}

#[tauri::command]
pub fn dictation_stop(window: tauri::WebviewWindow, session_id: String) -> Result<(), String> {
    check_window(&window)?;
    #[cfg(target_os = "macos")]
    { native::stop(&session_id, false) }
    #[cfg(not(target_os = "macos"))]
    { let _ = session_id; Ok(()) }
}

#[tauri::command]
pub fn dictation_cancel(window: tauri::WebviewWindow, session_id: String) -> Result<(), String> {
    check_window(&window)?;
    #[cfg(target_os = "macos")]
    { native::stop(&session_id, true) }
    #[cfg(not(target_os = "macos"))]
    { let _ = session_id; Ok(()) }
}
