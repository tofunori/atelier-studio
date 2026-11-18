//! Presse-papiers natif de secours pour le terminal intégré : sous Linux
//! (WebKitGTK), `navigator.clipboard.readText()` est refusé sur l'origine
//! Tauri (`NotAllowedError`), ce qui empêchait de coller un code OAuth
//! (`claude auth login`) ou une clé API (`opencode auth login`).

#[cfg(target_os = "linux")]
use std::sync::mpsc;
use tauri::AppHandle;

#[cfg(target_os = "linux")]
mod linux_gtk {
    use std::ffi::{c_char, c_int, c_void, CStr, CString};

    extern "C" {
        fn gdk_atom_intern(atom_name: *const c_char, only_if_exists: c_int) -> *mut c_void;
        fn gtk_clipboard_get(selection: *mut c_void) -> *mut c_void;
        fn gtk_clipboard_wait_for_text(clipboard: *mut c_void) -> *mut c_char;
        fn gtk_clipboard_set_text(clipboard: *mut c_void, text: *const c_char, len: c_int);
        fn g_free(mem: *mut c_void);
    }

    pub unsafe fn read_clipboard() -> Option<String> {
        let atom = gdk_atom_intern(c"CLIPBOARD".as_ptr(), 0);
        let cb = gtk_clipboard_get(atom);
        if cb.is_null() {
            return None;
        }
        let ptr = gtk_clipboard_wait_for_text(cb);
        if ptr.is_null() {
            return None;
        }
        let text = CStr::from_ptr(ptr).to_string_lossy().into_owned();
        g_free(ptr as *mut c_void);
        Some(text)
    }

    pub unsafe fn write_clipboard(text: &str) -> bool {
        let atom = gdk_atom_intern(c"CLIPBOARD".as_ptr(), 0);
        let cb = gtk_clipboard_get(atom);
        if cb.is_null() {
            return false;
        }
        if let Ok(cstr) = CString::new(text) {
            gtk_clipboard_set_text(cb, cstr.as_ptr(), text.len() as c_int);
            true
        } else {
            false
        }
    }
}

#[tauri::command]
pub async fn clipboard_read_text(app: AppHandle) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let (tx, rx) = mpsc::channel();
        app.run_on_main_thread(move || {
            let text = unsafe { linux_gtk::read_clipboard() }.unwrap_or_default();
            let _ = tx.send(text);
        })
        .map_err(|e| e.to_string())?;
        return rx.recv().map_err(|e| e.to_string());
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        let out = std::process::Command::new("pbpaste")
            .output()
            .map_err(|e| e.to_string())?;
        return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = app;
        Ok(String::new())
    }
}

#[tauri::command]
pub async fn clipboard_write_text(app: AppHandle, text: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let (tx, rx) = mpsc::channel();
        app.run_on_main_thread(move || {
            let ok = unsafe { linux_gtk::write_clipboard(&text) };
            let _ = tx.send(ok);
        })
        .map_err(|e| e.to_string())?;
        let _ = rx.recv().map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        let _ = app;
        let mut child = std::process::Command::new("pbcopy")
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| e.to_string())?;
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(text.as_bytes());
        }
        let _ = child.wait();
        return Ok(());
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (app, text);
        Ok(())
    }
}
