//! PTY terminals — Node `terminal.mjs` via portable-pty.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

type TermEventSink = Arc<dyn Fn(TermEvent) + Send + Sync>;

#[derive(Debug, Clone)]
pub enum TermEvent {
    Data { term_id: String, data: String },
    Exit { term_id: String, exit_code: i32 },
}

struct TermSlot {
    generation: u64,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    /// Independent signal handle: the wait thread owns the child itself, so
    /// close() never blocks behind a mutex held by `Child::wait`.
    killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

fn resolve_valid_cwd(cwd: Option<&str>) -> PathBuf {
    if let Some(dir) = cwd.map(str::trim).filter(|s| !s.is_empty() && *s != "__discussions__") {
        let pb = PathBuf::from(dir);
        if pb.is_dir() {
            return pb;
        }
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        if home.is_dir() {
            return home;
        }
    }
    std::env::temp_dir()
}

pub struct TerminalHub {
    terms: Arc<Mutex<HashMap<String, TermSlot>>>,
    next_gen: AtomicU64,
    events: Arc<Mutex<Vec<TermEvent>>>,
    event_sink: Option<TermEventSink>,
}

impl Default for TerminalHub {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalHub {
    pub fn new() -> Self {
        Self {
            terms: Arc::new(Mutex::new(HashMap::new())),
            next_gen: AtomicU64::new(1),
            events: Arc::new(Mutex::new(Vec::new())),
            event_sink: None,
        }
    }

    /// Runtime mode: PTY output is pushed to the WebSocket bus as soon as the
    /// reader thread receives it. Without this sink, events remain available
    /// through `drain_events` for standalone consumers and tests.
    pub fn with_event_sink<F>(sink: F) -> Self
    where
        F: Fn(TermEvent) + Send + Sync + 'static,
    {
        Self {
            terms: Arc::new(Mutex::new(HashMap::new())),
            next_gen: AtomicU64::new(1),
            events: Arc::new(Mutex::new(Vec::new())),
            event_sink: Some(Arc::new(sink)),
        }
    }

    pub fn open(&self, term_id: &str, cwd: Option<&str>, cols: u16, rows: u16) {
        let mut terms = match self.terms.lock() {
            Ok(t) => t,
            Err(_) => return,
        };
        if terms.contains_key(term_id) {
            return;
        }

        let pty_system = native_pty_system();
        let pair = match pty_system.openpty(PtySize {
            rows: if rows == 0 { 24 } else { rows },
            cols: if cols == 0 { 80 } else { cols },
            pixel_width: 0,
            pixel_height: 0,
        }) {
            Ok(p) => p,
            Err(e) => {
                dispatch_event(
                    &self.events,
                    self.event_sink.as_ref(),
                    TermEvent::Data {
                        term_id: term_id.to_string(),
                        data: format!("\r\n[erreur PTY : {e}]\r\n"),
                    },
                );
                return;
            }
        };

        let default_shell = if cfg!(target_os = "macos") {
            "/bin/zsh"
        } else if Path::new("/bin/bash").is_file() {
            "/bin/bash"
        } else {
            "/bin/sh"
        };
        let shell = std::env::var("SHELL")
            .ok()
            .filter(|s| !s.is_empty() && Path::new(s).is_file())
            .unwrap_or_else(|| default_shell.into());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");
        cmd.cwd(resolve_valid_cwd(cwd));
        if let Ok(home) = std::env::var("HOME") {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let app_sub = if cfg!(target_os = "macos") {
                "Library/Application Support/atelier-studio"
            } else {
                ".local/share/atelier-studio"
            };
            let tectonic_dir = format!("{home}/{app_sub}/tools/tectonic-0.17.0");
            let extra = format!("{home}/.local/bin:{home}/.opencode/bin:{tectonic_dir}");
            cmd.env(
                "PATH",
                if current_path.is_empty() {
                    extra
                } else {
                    format!("{extra}:{current_path}")
                },
            );
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        #[cfg(target_os = "linux")]
        {
            let lang_missing = std::env::var("LC_ALL").unwrap_or_default().is_empty()
                && matches!(
                    std::env::var("LANG").as_deref(),
                    Err(_) | Ok("") | Ok("C") | Ok("POSIX")
                );
            if lang_missing {
                cmd.env("LANG", "C.UTF-8");
            }
            if std::env::var_os("SSL_CERT_FILE").is_none() {
                for cert in [
                    "/etc/ssl/certs/ca-certificates.crt",
                    "/etc/pki/tls/certs/ca-bundle.crt",
                    "/etc/ssl/ca-bundle.pem",
                ] {
                    if Path::new(cert).is_file() {
                        cmd.env("SSL_CERT_FILE", cert);
                        break;
                    }
                }
            }
            let uid = unsafe { libc::geteuid() };
            let runtime_dir = format!("/run/user/{uid}");
            if Path::new(&runtime_dir).is_dir() {
                if std::env::var_os("XDG_RUNTIME_DIR").is_none() {
                    cmd.env("XDG_RUNTIME_DIR", &runtime_dir);
                }
                let bus = format!("{runtime_dir}/bus");
                if std::env::var_os("DBUS_SESSION_BUS_ADDRESS").is_none()
                    && Path::new(&bus).exists()
                {
                    cmd.env("DBUS_SESSION_BUS_ADDRESS", format!("unix:path={bus}"));
                }
                if std::env::var_os("WAYLAND_DISPLAY").is_none()
                    && Path::new(&format!("{runtime_dir}/wayland-0")).exists()
                {
                    cmd.env("WAYLAND_DISPLAY", "wayland-0");
                }
            }
        }

        let child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                dispatch_event(
                    &self.events,
                    self.event_sink.as_ref(),
                    TermEvent::Data {
                        term_id: term_id.to_string(),
                        data: format!("\r\n[impossible de lancer le shell ({shell}) : {e}]\r\n"),
                    },
                );
                dispatch_event(
                    &self.events,
                    self.event_sink.as_ref(),
                    TermEvent::Exit {
                        term_id: term_id.to_string(),
                        exit_code: 1,
                    },
                );
                return;
            }
        };
        let mut reader = match pair.master.try_clone_reader() {
            Ok(r) => r,
            Err(_) => return,
        };
        let writer = match pair.master.take_writer() {
            Ok(w) => w,
            Err(_) => return,
        };

        let mut child_wait = child;
        let killer = child_wait.clone_killer();
        let tid_data = term_id.to_string();
        let tid_exit = term_id.to_string();
        let events_data = Arc::clone(&self.events);
        let events_exit = Arc::clone(&self.events);
        let sink_data = self.event_sink.clone();
        let sink_exit = self.event_sink.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        dispatch_event(
                            &events_data,
                            sink_data.as_ref(),
                            TermEvent::Data {
                                term_id: tid_data.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
        });

        let slot_gen = self.next_gen.fetch_add(1, Ordering::Relaxed);
        let terms_exit = Arc::clone(&self.terms);
        thread::spawn(move || {
            let code = match child_wait.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(_) => -1,
            };
            if let Ok(mut map) = terms_exit.lock() {
                if map.get(&tid_exit).is_some_and(|s| s.generation == slot_gen) {
                    map.remove(&tid_exit);
                }
            }
            dispatch_event(
                &events_exit,
                sink_exit.as_ref(),
                TermEvent::Exit {
                    term_id: tid_exit,
                    exit_code: code,
                },
            );
        });

        terms.insert(
            term_id.to_string(),
            TermSlot {
                generation: slot_gen,
                writer: Arc::new(Mutex::new(writer)),
                master: pair.master,
                killer,
            },
        );
    }

    pub fn input(&self, term_id: &str, data: &str) {
        let writer = self.terms.lock().ok().and_then(|terms| terms.get(term_id).map(|term| term.writer.clone()));
        if let Some(writer) = writer {
            if let Ok(mut writer) = writer.lock() {
                let _ = writer.write_all(data.as_bytes());
                let _ = writer.flush();
            }
        }
    }

    pub fn resize(&self, term_id: &str, cols: u16, rows: u16) {
        if let Ok(terms) = self.terms.lock() {
            if let Some(t) = terms.get(term_id) {
                let _ = t.master.resize(PtySize {
                    rows: if rows == 0 { 24 } else { rows },
                    cols: if cols == 0 { 80 } else { cols },
                    pixel_width: 0,
                    pixel_height: 0,
                });
            }
        }
    }

    pub fn close(&self, term_id: &str) {
        if let Ok(mut terms) = self.terms.lock() {
            if let Some(mut t) = terms.remove(term_id) {
                let _ = t.killer.kill();
            }
        }
    }

    pub fn close_all(&self) {
        let ids: Vec<_> = self
            .terms
            .lock()
            .map(|t| t.keys().cloned().collect())
            .unwrap_or_default();
        for id in ids {
            self.close(&id);
        }
    }

    pub fn drain_events(&self) -> Vec<TermEvent> {
        self.events
            .lock()
            .map(|mut q| std::mem::take(&mut *q))
            .unwrap_or_default()
    }
}

fn dispatch_event(
    events: &Arc<Mutex<Vec<TermEvent>>>,
    sink: Option<&TermEventSink>,
    event: TermEvent,
) {
    if let Some(sink) = sink {
        sink(event);
    } else if let Ok(mut queue) = events.lock() {
        queue.push(event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_sink_receives_output_immediately_without_poll_queue() {
        let received = Arc::new(Mutex::new(Vec::new()));
        let received_sink = Arc::clone(&received);
        let hub = TerminalHub::with_event_sink(move |event| {
            received_sink.lock().unwrap().push(event);
        });

        dispatch_event(
            &hub.events,
            hub.event_sink.as_ref(),
            TermEvent::Data {
                term_id: "term-1".into(),
                data: "echo".into(),
            },
        );

        assert!(hub.drain_events().is_empty());
        let events = received.lock().unwrap();
        assert!(matches!(
            events.as_slice(),
            [TermEvent::Data { term_id, data }]
                if term_id == "term-1" && data == "echo"
        ));
    }

    #[test]
    fn non_existent_or_discussions_cwd_falls_back_to_existing_directory() {
        let resolved_disc = resolve_valid_cwd(Some("__discussions__"));
        assert!(resolved_disc.is_dir());
        let resolved_missing = resolve_valid_cwd(Some("/nonexistent/atelier/path/xyz"));
        assert!(resolved_missing.is_dir());
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(resolve_valid_cwd(Some(tmp.path().to_str().unwrap())), tmp.path());
    }
}
