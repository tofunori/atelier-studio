//! PTY terminals — Node `terminal.mjs` via portable-pty.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Debug, Clone)]
pub enum TermEvent {
    Data { term_id: String, data: String },
    Exit { term_id: String, exit_code: i32 },
}

struct TermSlot {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    /// Shared so the wait thread and close() can both access the child.
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

pub struct TerminalHub {
    terms: Mutex<HashMap<String, TermSlot>>,
    events: Arc<Mutex<Vec<TermEvent>>>,
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

        let child = Arc::new(Mutex::new(child));
        let child_wait = Arc::clone(&child);
        let tid_data = term_id.to_string();
        let tid_exit = term_id.to_string();
        let events_data = Arc::clone(&self.events);
        let events_exit = Arc::clone(&self.events);

        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        if let Ok(mut q) = events_data.lock() {
                            q.push(TermEvent::Data {
                                term_id: tid_data.clone(),
                                data,
                            });
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        thread::spawn(move || {
            let code = if let Ok(mut c) = child_wait.lock() {
                match c.wait() {
                    Ok(status) => status.exit_code() as i32,
                    Err(_) => -1,
                }
            } else {
                -1
            };
            if let Ok(mut q) = events_exit.lock() {
                q.push(TermEvent::Exit {
                    term_id: tid_exit,
                    exit_code: code,
                });
            }
        });

        terms.insert(
            term_id.to_string(),
            TermSlot {
                writer,
                master: pair.master,
                child,
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
            if let Some(t) = terms.remove(term_id) {
                if let Ok(mut c) = t.child.lock() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
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
