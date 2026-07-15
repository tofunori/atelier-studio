use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    thread,
};
use tauri::{AppHandle, Emitter, Manager, State};

const EVENT_CAPTURED: &str = "appsnap:captured";
const EVENT_ERROR: &str = "appsnap:error";
const EVENT_STATE: &str = "appsnap:state";
const MAX_CAPTURE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_ACCESSIBILITY_SNAPSHOT_CHARS: usize = 24_000;
const PNG_SIGNATURE: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapState {
    platform: String,
    supported: bool,
    enabled: bool,
    status: String,
    shortcut: Option<String>,
    input_monitoring_permission: String,
    screen_recording_permission: String,
    accessibility_permission: String,
    message: Option<String>,
}

impl AppSnapState {
    fn initial() -> Self {
        let supported = cfg!(target_os = "macos");
        Self {
            platform: if supported {
                "macos"
            } else {
                std::env::consts::OS
            }
            .to_string(),
            supported,
            enabled: false,
            status: if supported { "disabled" } else { "unsupported" }.to_string(),
            shortcut: supported.then(|| "both-option-keys".to_string()),
            input_monitoring_permission: "unknown".to_string(),
            screen_recording_permission: "unknown".to_string(),
            accessibility_permission: "unknown".to_string(),
            message: (!supported).then(|| "AppSnap is available only on macOS.".to_string()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapCapture {
    id: String,
    path: String,
    name: String,
    captured_at: String,
    source_app_name: Option<String>,
    source_bundle_identifier: Option<String>,
    source_app_icon_data_url: Option<String>,
    source_window_title: Option<String>,
    accessibility_snapshot: Option<String>,
    accessibility_element_count: Option<usize>,
    accessibility_snapshot_truncated: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSnapError {
    code: String,
    message: String,
    captured_at: Option<String>,
}

pub struct AppSnapManager {
    app: AppHandle,
    helper_path: PathBuf,
    capture_directory: PathBuf,
    state: Mutex<AppSnapState>,
    child: Mutex<Option<Child>>,
    enabled: AtomicBool,
    generation: AtomicU64,
}

impl AppSnapManager {
    pub fn new(app: &AppHandle) -> Self {
        let resource_dir = app.path().resource_dir().ok();
        let helper_path = resolve_helper_path(resource_dir.as_deref());
        let capture_directory = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("atelier-studio"))
            .join("appsnap");
        Self {
            app: app.clone(),
            helper_path,
            capture_directory,
            state: Mutex::new(AppSnapState::initial()),
            child: Mutex::new(None),
            enabled: AtomicBool::new(false),
            generation: AtomicU64::new(0),
        }
    }

    fn get_state(&self) -> AppSnapState {
        self.state.lock().expect("appsnap state poisoned").clone()
    }

    fn set_state(&self, update: impl FnOnce(&mut AppSnapState)) -> AppSnapState {
        let next = {
            let mut state = self.state.lock().expect("appsnap state poisoned");
            update(&mut state);
            state.clone()
        };
        let _ = self.app.emit(EVENT_STATE, next.clone());
        next
    }

    fn permission_message(state: &AppSnapState) -> String {
        let mut missing = Vec::new();
        if state.input_monitoring_permission != "granted" {
            missing.push("Input Monitoring");
        }
        if state.screen_recording_permission != "granted" {
            missing.push("Screen Recording");
        }
        if state.accessibility_permission != "granted" {
            missing.push("Accessibility");
        }
        format!(
            "Allow {} in macOS System Settings, then try again.",
            missing.join(" and ")
        )
    }

    fn apply_permissions(&self, value: &Value) -> AppSnapState {
        let input = value
            .get("inputMonitoring")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let screen = value
            .get("screenRecording")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        let accessibility = value
            .get("accessibility")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        self.set_state(|state| {
            state.input_monitoring_permission = input;
            state.screen_recording_permission = screen;
            state.accessibility_permission = accessibility;
        })
    }

    fn run_permission_command(&self, command: &str) -> Result<AppSnapState, String> {
        if !self.helper_path.is_file() {
            return Ok(self.set_state(|state| {
                state.status = "error".to_string();
                state.message = Some(format!(
                    "The AppSnap native helper is missing from this build: {}",
                    self.helper_path.display()
                ));
            }));
        }
        let output = Command::new(&self.helper_path)
            .arg(command)
            .output()
            .map_err(|error| format!("Could not inspect AppSnap permissions: {error}"))?;
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let Ok(value) = serde_json::from_str::<Value>(line) else {
                continue;
            };
            if value.get("type").and_then(Value::as_str) == Some("permissions") {
                self.apply_permissions(&value);
            }
        }
        if !output.status.success() {
            let diagnostic = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if diagnostic.is_empty() {
                "The AppSnap helper did not report its permission state.".to_string()
            } else {
                diagnostic
            });
        }
        Ok(self.get_state())
    }

    fn set_enabled(&self, enabled: bool) -> Result<AppSnapState, String> {
        self.enabled.store(enabled, Ordering::SeqCst);
        if !enabled {
            self.stop_watch();
            return Ok(self.set_state(|state| {
                state.enabled = false;
                state.status = "disabled".to_string();
                state.message = None;
            }));
        }

        self.set_state(|state| state.enabled = true);
        let permissions = self.run_permission_command("--check-permissions")?;
        if permissions.input_monitoring_permission != "granted"
            || permissions.screen_recording_permission != "granted"
            || permissions.accessibility_permission != "granted"
        {
            self.stop_watch();
            return Ok(self.set_state(|state| {
                state.enabled = true;
                state.status = "permission-required".to_string();
                state.message = Some(Self::permission_message(state));
            }));
        }
        self.start_watch()
    }

    fn start_watch(&self) -> Result<AppSnapState, String> {
        if self.child.lock().expect("appsnap child poisoned").is_some() {
            return Ok(self.get_state());
        }
        fs::create_dir_all(&self.capture_directory)
            .map_err(|error| format!("Could not prepare the AppSnap directory: {error}"))?;
        let mut child = Command::new(&self.helper_path)
            .arg("--watch")
            .arg("--output-dir")
            .arg(&self.capture_directory)
            .arg("--excluded-bundle-id")
            .arg("com.tofunori.tauri-app")
            .arg("--parent-pid")
            .arg(std::process::id().to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Could not start AppSnap: {error}"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or("AppSnap helper stdout is unavailable.")?;
        let stderr = child.stderr.take();
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        *self.child.lock().expect("appsnap child poisoned") = Some(child);
        self.set_state(|state| {
            state.enabled = true;
            state.status = "starting".to_string();
            state.message = None;
        });

        let app = self.app.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let Ok(value) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                let manager = app.state::<AppSnapManager>();
                if manager.generation.load(Ordering::SeqCst) != generation {
                    break;
                }
                manager.handle_helper_message(value);
            }
            let manager = app.state::<AppSnapManager>();
            if manager.generation.load(Ordering::SeqCst) != generation {
                return;
            }
            if let Some(mut child) = manager.child.lock().expect("appsnap child poisoned").take() {
                let _ = child.wait();
            }
            if manager.enabled.load(Ordering::SeqCst) {
                manager.set_state(|state| {
                    state.status = "error".to_string();
                    state.message = Some("The AppSnap helper stopped unexpectedly.".to_string());
                });
                manager.emit_error(
                    "helper-stopped",
                    "The AppSnap helper stopped unexpectedly.",
                    None,
                );
            }
        });

        if let Some(stderr) = stderr {
            thread::spawn(move || {
                let mut diagnostic = String::new();
                let _ = BufReader::new(stderr)
                    .take(4096)
                    .read_to_string(&mut diagnostic);
                if !diagnostic.trim().is_empty() {
                    eprintln!("[appsnap] native helper: {}", diagnostic.trim());
                }
            });
        }
        Ok(self.get_state())
    }

    fn stop_watch(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Some(mut child) = self.child.lock().expect("appsnap child poisoned").take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn handle_helper_message(&self, value: Value) {
        match value.get("type").and_then(Value::as_str) {
            Some("permissions") => {
                self.apply_permissions(&value);
            }
            Some("ready") => {
                self.set_state(|state| {
                    state.input_monitoring_permission = "granted".to_string();
                    state.screen_recording_permission = "granted".to_string();
                    state.accessibility_permission = "granted".to_string();
                    state.status = "ready".to_string();
                    state.message = None;
                });
            }
            Some("captured") => match serde_json::from_value::<AppSnapCapture>(value) {
                Ok(capture) => self.consume_capture(capture),
                Err(error) => self.emit_error(
                    "capture-read-failed",
                    &format!("The AppSnap helper returned invalid capture metadata: {error}"),
                    None,
                ),
            },
            Some("error") => {
                let code = value
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("capture-failed");
                let message = value
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("AppSnap capture failed.");
                let captured_at = value
                    .get("capturedAt")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                if code == "event_tap_disabled" {
                    eprintln!("[appsnap] {message}");
                    return;
                }
                if code == "input-monitoring-required"
                    || code == "screen-recording-required"
                    || code == "accessibility-required"
                {
                    self.set_state(|state| {
                        if code == "input-monitoring-required" {
                            state.input_monitoring_permission = "denied".to_string();
                        } else if code == "screen-recording-required" {
                            state.screen_recording_permission = "denied".to_string();
                        } else {
                            state.accessibility_permission = "denied".to_string();
                        }
                        state.status = "permission-required".to_string();
                        state.message = Some(Self::permission_message(state));
                    });
                }
                self.emit_error(code, message, captured_at);
            }
            _ => {}
        }
    }

    fn consume_capture(&self, mut capture: AppSnapCapture) {
        let path = PathBuf::from(&capture.path);
        if let Err(error) = validate_capture_path(&self.capture_directory, &path) {
            self.emit_error("capture-read-failed", &error, Some(capture.captured_at));
            return;
        }
        if let Some(snapshot) = capture.accessibility_snapshot.take() {
            let original_chars = snapshot.chars().count();
            let bounded = snapshot
                .chars()
                .take(MAX_ACCESSIBILITY_SNAPSHOT_CHARS)
                .collect::<String>();
            capture.accessibility_snapshot = (!bounded.trim().is_empty()).then_some(bounded);
            if original_chars > MAX_ACCESSIBILITY_SNAPSHOT_CHARS {
                capture.accessibility_snapshot_truncated = Some(true);
            }
        }
        focus_atelier(&self.app);
        let _ = self.app.emit(EVENT_CAPTURED, capture);
    }

    fn emit_error(&self, code: &str, message: &str, captured_at: Option<String>) {
        let _ = self.app.emit(
            EVENT_ERROR,
            AppSnapError {
                code: code.to_string(),
                message: message.to_string(),
                captured_at,
            },
        );
    }
}

impl Drop for AppSnapManager {
    fn drop(&mut self) {
        self.stop_watch();
    }
}

fn resolve_helper_path(resource_dir: Option<&Path>) -> PathBuf {
    let mut candidates = Vec::new();
    if let Some(resource_dir) = resource_dir {
        candidates.push(resource_dir.join("appsnap/atelier-appsnap-helper"));
    }
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("appsnap-dist/atelier-appsnap-helper"),
    );
    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("appsnap-dist/atelier-appsnap-helper")
        })
}

fn validate_capture_path(directory: &Path, path: &Path) -> Result<(), String> {
    let canonical_directory = directory
        .canonicalize()
        .map_err(|error| format!("Could not inspect the AppSnap directory: {error}"))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("Could not read the captured AppSnap: {error}"))?;
    if !canonical_path.starts_with(&canonical_directory) || canonical_path == canonical_directory {
        return Err(
            "The AppSnap helper returned a capture outside its private directory.".to_string(),
        );
    }
    let metadata = fs::metadata(&canonical_path)
        .map_err(|error| format!("Could not inspect the captured AppSnap: {error}"))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_CAPTURE_BYTES {
        return Err("The captured AppSnap has an invalid file size.".to_string());
    }
    let mut file = fs::File::open(&canonical_path)
        .map_err(|error| format!("Could not open the captured AppSnap: {error}"))?;
    let mut signature = [0u8; 8];
    file.read_exact(&mut signature)
        .map_err(|error| format!("Could not validate the captured AppSnap: {error}"))?;
    if signature != PNG_SIGNATURE {
        return Err("The captured AppSnap is not a valid PNG image.".to_string());
    }
    Ok(())
}

fn focus_atelier(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    #[cfg(target_os = "macos")]
    {
        #[allow(deprecated)]
        let options = objc2_app_kit::NSApplicationActivationOptions::ActivateAllWindows
            | objc2_app_kit::NSApplicationActivationOptions::ActivateIgnoringOtherApps;
        let current = objc2_app_kit::NSRunningApplication::currentApplication();
        #[allow(deprecated)]
        current.activateWithOptions(options);
    }
}

#[tauri::command]
pub fn appsnap_get_state(manager: State<'_, AppSnapManager>) -> Result<AppSnapState, String> {
    manager.run_permission_command("--check-permissions")
}

#[tauri::command]
pub fn appsnap_request_permissions(
    manager: State<'_, AppSnapManager>,
) -> Result<AppSnapState, String> {
    manager.run_permission_command("--request-permissions")
}

#[tauri::command]
pub fn appsnap_set_enabled(
    enabled: bool,
    manager: State<'_, AppSnapManager>,
) -> Result<AppSnapState, String> {
    manager.set_enabled(enabled)
}

#[tauri::command]
pub fn appsnap_read_capture(
    path: String,
    manager: State<'_, AppSnapManager>,
) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(path);
    validate_capture_path(&manager.capture_directory, &path)?;
    let bytes =
        fs::read(&path).map_err(|error| format!("Could not read the captured AppSnap: {error}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn capture_validation_rejects_non_png_files() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("appsnap-bad.png");
        fs::write(&path, b"not a png").expect("write fixture");
        assert!(validate_capture_path(dir.path(), &path)
            .expect_err("must reject")
            .contains("valid PNG"));
    }

    #[test]
    fn capture_validation_accepts_png_signature() {
        let dir = tempdir().expect("tempdir");
        let path = dir.path().join("appsnap-good.png");
        fs::write(&path, PNG_SIGNATURE).expect("write fixture");
        validate_capture_path(dir.path(), &path).expect("valid capture");
    }

    #[test]
    fn capture_payload_accepts_and_bounds_accessibility_text() {
        let raw = serde_json::json!({
            "id": "capture-id",
            "path": "/tmp/capture.png",
            "name": "capture.png",
            "capturedAt": "2026-07-15T12:00:00Z",
            "accessibilitySnapshot": "[button] Send",
            "accessibilityElementCount": 1,
            "accessibilitySnapshotTruncated": false
        });
        let capture = serde_json::from_value::<AppSnapCapture>(raw).expect("valid payload");
        assert_eq!(
            capture.accessibility_snapshot.as_deref(),
            Some("[button] Send")
        );
        assert_eq!(capture.accessibility_element_count, Some(1));
        assert_eq!(capture.accessibility_snapshot_truncated, Some(false));
    }
}
