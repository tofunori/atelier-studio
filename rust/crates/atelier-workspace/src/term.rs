//! PTY terminals — Node `terminal.mjs` via portable-pty.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

type TermEventSink = Arc<dyn Fn(TermEvent) + Send + Sync>;

#[derive(Debug, Clone)]
pub enum TermEvent {
    Data { term_id: String, data: String },
    Exit { term_id: String, exit_code: i32 },
}

struct TermSlot {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    /// Independent signal handle: the wait thread owns the child itself, so
    /// close() never blocks behind a mutex held by `Child::wait`.
    killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

pub struct TerminalHub {
    terms: Mutex<HashMap<String, TermSlot>>,
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
            terms: Mutex::new(HashMap::new()),
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
            terms: Mutex::new(HashMap::new()),
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
            Err(_) => return,
        };

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");
        if let Some(cwd) = cwd.filter(|s| !s.is_empty()) {
            cmd.cwd(cwd);
        } else if let Ok(home) = std::env::var("HOME") {
            cmd.cwd(home);
        }
        cmd.env("TERM", "xterm-256color");

        let child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(_) => return,
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

        thread::spawn(move || {
            let code = match child_wait.wait() {
                Ok(status) => status.exit_code() as i32,
                Err(_) => -1,
            };
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
                writer,
                master: pair.master,
                killer,
            },
        );
    }

    pub fn input(&self, term_id: &str, data: &str) {
        if let Ok(mut terms) = self.terms.lock() {
            if let Some(t) = terms.get_mut(term_id) {
                let _ = t.writer.write_all(data.as_bytes());
                let _ = t.writer.flush();
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
}
