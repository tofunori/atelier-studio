//! Shared Codex `app-server` JSON-RPC client (one process, many threads).
//! Each process owns its pending requests and handlers. A late response or
//! cleanup from an old process can never touch its replacement.

use crate::codex_parse::{automatic_approval_response, build_approval_response_with_scope};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, watch, Mutex};

type NotifHandler = Arc<dyn Fn(&str, &Value) + Send + Sync>;
pub type ServerRequestHandler =
    Arc<dyn Fn(String, Value) -> Pin<Box<dyn Future<Output = Value> + Send>> + Send + Sync>;

#[derive(Default)]
struct ConnectionState {
    opened_threads: std::collections::HashSet<String>,
    pending: HashMap<u64, oneshot::Sender<Result<Value, String>>>,
    goal_requests: HashMap<u64, (String, String)>,
    handlers: HashMap<String, NotifHandler>,
    request_handlers: HashMap<String, ServerRequestHandler>,
    sandboxes: HashMap<String, String>,
}

struct Connection {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    state: StdMutex<ConnectionState>,
    goal_observer: Arc<StdMutex<Option<NotifHandler>>>,
    ready: AtomicBool,
    closed: watch::Sender<bool>,
    next_id: AtomicU64,
}

impl Connection {
    fn is_closed(&self) -> bool {
        *self.closed.borrow()
    }

    fn fail(&self, message: &str) {
        if self.closed.send_replace(true) {
            return;
        }
        self.ready.store(false, Ordering::SeqCst);
        let state = std::mem::take(&mut *self.state.lock().unwrap());
        for (_, pending) in state.pending {
            let _ = pending.send(Err(message.to_string()));
        }
        // User callbacks run outside protocol locks.
        for (_, handler) in state.handlers {
            handler(
                "turn/completed",
                &json!({"__transportFailure":true,"turn":{"status":"failed","error":{"message":message}}}),
            );
        }
    }

    async fn stop(&self, reason: &str) {
        self.fail(reason);
        let mut child = self.child.lock().await;
        let _ = child.start_kill();
        let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
    }

    fn stop_in_background(self: &Arc<Self>, reason: &str) {
        self.fail(reason);
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            let connection = Arc::clone(self);
            runtime.spawn(async move {
                connection.stop("connexion Codex fermée").await;
            });
        }
    }

    async fn write(self: &Arc<Self>, message: &Value) -> Result<(), String> {
        let mut bytes = serde_json::to_vec(message).map_err(|e| e.to_string())?;
        bytes.push(b'\n');
        let mut stdin = self.stdin.lock().await;
        if self.is_closed() {
            return Err("app-server Codex fermé".into());
        }
        // Cancelling a partial JSONL write makes the pipe unusable. A request
        // cancelled while merely waiting for the writer does not close it.
        let mut write = IncompleteWrite {
            connection: Arc::clone(self),
            complete: false,
        };
        stdin
            .write_all(&bytes)
            .await
            .map_err(|e| format!("écriture Codex: {e}"))?;
        write.complete = true;
        Ok(())
    }

    async fn request(self: &Arc<Self>, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        {
            let mut state = self.state.lock().unwrap();
            if self.is_closed() {
                return Err("app-server Codex fermé".into());
            }
            state.pending.insert(id, tx);
            if matches!(method, "thread/goal/get" | "thread/goal/set" | "thread/goal/clear") {
                if let Some(tid) = params.get("threadId").and_then(Value::as_str) {
                    state.goal_requests.insert(id, (method.to_string(), tid.to_string()));
                }
            }
        }
        let _pending = PendingRequest {
            connection: Arc::clone(self),
            id,
        };
        self.write(&json!({"id":id,"method":method,"params":params}))
            .await?;
        let result = rx.await.map_err(|_| "requête Codex annulée".to_string())??;
        if matches!(method, "thread/start" | "thread/resume") {
            if let Some(id) = result.pointer("/thread/id").and_then(Value::as_str) {
                self.state.lock().unwrap().opened_threads.insert(id.to_string());
            }
        }
        Ok(result)
    }

    fn dispatch(self: &Arc<Self>, msg: Value) {
        if self.is_closed() {
            return;
        }
        if msg.get("id").is_some() && msg.get("method").is_some() {
            let id = msg.get("id").cloned().unwrap_or(Value::Null);
            let method = msg
                .get("method")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let params = msg.get("params").cloned().unwrap_or(json!({}));
            let tid = params
                .get("threadId")
                .or_else(|| params.get("conversationId"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let (full, relay) = {
                let state = self.state.lock().unwrap();
                (
                    state
                        .sandboxes
                        .get(tid)
                        .is_some_and(|s| s == "danger-full-access"),
                    state.request_handlers.get(tid).cloned(),
                )
            };
            let connection = Arc::clone(self);
            tokio::spawn(async move {
                let mut closed = connection.closed.subscribe();
                let response = async {
                    if let Some(result) = automatic_approval_response(&method, full, &params) {
                        result
                    } else if let Some(handler) = relay {
                        handler(method.clone(), params.clone()).await
                    } else {
                        build_approval_response_with_scope(&method, full, &params, "once")
                    }
                };
                let result = tokio::select! {
                    _ = closed.wait_for(|value| *value) => return,
                    result = response => result,
                };
                // This reply belongs exclusively to the connection that asked.
                let _ = tokio::time::timeout(
                    Duration::from_secs(10),
                    connection.write(&json!({"id":id,"result":result})),
                )
                .await;
            });
        } else if let Some(id) = msg.get("id").and_then(Value::as_u64) {
            let (pending, goal_request) = {
                let mut state = self.state.lock().unwrap();
                (state.pending.remove(&id), state.goal_requests.remove(&id))
            };
            if let Some(pending) = pending {
                let result = if let Some(error) = msg.get("error").filter(|v| !v.is_null()) {
                    Err(error
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("erreur app-server")
                        .to_string())
                } else {
                    Ok(msg.get("result").cloned().unwrap_or(Value::Null))
                };
                if let (Ok(value), Some((method, tid))) = (&result, goal_request) {
                    let observer = self.goal_observer.lock().unwrap().clone();
                    if let Some(observer) = observer {
                        let goal = if method == "thread/goal/clear" { Value::Null }
                            else { value.get("goal").cloned().unwrap_or_else(|| value.clone()) };
                        observer(if goal.is_null() { "thread/goal/cleared" } else { "thread/goal/updated" },
                            &json!({"threadId":tid,"goal":goal}));
                    }
                }
                let _ = pending.send(result);
            }
        } else if let Some(method) = msg.get("method").and_then(Value::as_str) {
            let params = msg.get("params").cloned().unwrap_or(json!({}));
            let tid = params
                .get("threadId")
                .or_else(|| params.get("conversationId"))
                .or_else(|| params.pointer("/msg/conversation_id"))
                .or_else(|| params.pointer("/thread/id"))
                .and_then(Value::as_str)
                .unwrap_or("");
            // Thread-level goals outlive the per-turn handler and its cleanup.
            if matches!(method, "thread/goal/updated" | "thread/goal/cleared") {
                let observer = self.goal_observer.lock().unwrap().clone();
                if let Some(observer) = observer { observer(method, &params); }
            }
            // Legacy task_complete may carry only a native turn id. Each
            // scoped handler checks that identity before accepting the hint.
            let handlers: Vec<_> = {
                let state = self.state.lock().unwrap();
                if tid.is_empty() && method == "codex/event/task_complete" {
                    state.handlers.values().cloned().collect()
                } else {
                    state.handlers.get(tid).cloned().into_iter().collect()
                }
            };
            for handler in handlers {
                handler(method, &params);
            }
        }
    }
}

/// Cleanup is synchronous, including when the caller drops/cancels its future.
struct PendingRequest {
    connection: Arc<Connection>,
    id: u64,
}
impl Drop for PendingRequest {
    fn drop(&mut self) {
        let mut state = self.connection.state.lock().unwrap();
        state.pending.remove(&self.id);
        state.goal_requests.remove(&self.id);
    }
}
struct IncompleteWrite {
    connection: Arc<Connection>,
    complete: bool,
}
impl Drop for IncompleteWrite {
    fn drop(&mut self) {
        if !self.complete {
            self.connection
                .stop_in_background("écriture Codex interrompue");
        }
    }
}
struct Startup {
    connection: Arc<Connection>,
    complete: bool,
}
impl Drop for Startup {
    fn drop(&mut self) {
        if !self.complete {
            self.connection
                .stop_in_background("initialisation Codex incomplète");
        }
    }
}

pub struct CodexAppServer {
    inner: StdMutex<Option<Arc<Connection>>>,
    initialization: Mutex<()>,
    goal_observer: Arc<StdMutex<Option<NotifHandler>>>,
    binary: Option<PathBuf>,
    timeout_override: Option<Duration>,
}

/// A turn cannot migrate to a replacement process without resuming its thread.
/// Its requests and cleanup therefore keep the original connection alive.
pub(crate) struct ThreadConnection {
    connection: Arc<Connection>,
    thread_id: String,
    timeout_override: Option<Duration>,
}
impl ThreadConnection {
    pub fn set_handler(&self, handler: NotifHandler) {
        self.connection
            .state
            .lock()
            .unwrap()
            .handlers
            .insert(self.thread_id.clone(), handler);
    }
    pub fn set_request_handler(&self, handler: ServerRequestHandler) {
        self.connection
            .state
            .lock()
            .unwrap()
            .request_handlers
            .insert(self.thread_id.clone(), handler);
    }
    pub fn set_sandbox(&self, sandbox: &str) {
        self.connection
            .state
            .lock()
            .unwrap()
            .sandboxes
            .insert(self.thread_id.clone(), sandbox.into());
    }
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let deadline =
            self.timeout_override
                .unwrap_or(Duration::from_secs(if method == "turn/interrupt" {
                    10
                } else {
                    60
                }));
        tokio::time::timeout(deadline, self.connection.request(method, params))
            .await
            .map_err(|_| format!("Codex {method}: délai dépassé"))?
    }
    pub async fn interrupt_turn(&self, turn_id: Option<String>) -> Result<Value, String> {
        interrupt_on_connection(&self.connection, &self.thread_id, turn_id).await
    }
    pub fn interrupt_on_drop(&self, turn_id: Option<String>) {
        let connection = Arc::clone(&self.connection);
        let thread_id = self.thread_id.clone();
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            runtime.spawn(async move {
                let _ = tokio::time::timeout(
                    Duration::from_secs(10),
                    interrupt_on_connection(&connection, &thread_id, turn_id),
                )
                .await;
            });
        }
    }
}
/// A cancelled turn/start may have reached Codex before either its reply or
/// turn/started. Resolve the running turn on the same connection, under the
/// caller's stop deadline, instead of abandoning that accepted request.
async fn interrupt_on_connection(
    connection: &Arc<Connection>,
    thread_id: &str,
    mut turn_id: Option<String>,
) -> Result<Value, String> {
    loop {
        if let Some(turn_id) = turn_id {
            return connection
                .request(
                    "turn/interrupt",
                    json!({"threadId":thread_id,"turnId":turn_id}),
                )
                .await;
        }
        let snapshot = connection
            .request(
                "thread/read",
                json!({"threadId":thread_id,"includeTurns":true}),
            )
            .await?;
        turn_id = snapshot
            .pointer("/thread/turns")
            .and_then(Value::as_array)
            .and_then(|turns| {
                turns
                    .iter()
                    .rev()
                    .find(|turn| turn["status"] == "inProgress")
            })
            .and_then(|turn| turn["id"].as_str())
            .map(str::to_string);
        if turn_id.is_none() {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
}

impl Drop for ThreadConnection {
    fn drop(&mut self) {
        let mut state = self.connection.state.lock().unwrap();
        state.handlers.remove(&self.thread_id);
        state.request_handlers.remove(&self.thread_id);
        state.sandboxes.remove(&self.thread_id);
    }
}

impl CodexAppServer {
    /// Session readiness belongs to this process, not to a running turn. The
    /// set is cleared with the connection, so a replacement must resume again.
    pub(crate) fn has_open_thread(&self, id: &str) -> bool {
        self.current().is_some_and(|connection| !connection.is_closed()
            && connection.state.lock().unwrap().opened_threads.contains(id))
    }
    pub fn new() -> Self {
        Self {
            inner: StdMutex::new(None),
            initialization: Mutex::new(()),
            goal_observer: Arc::new(StdMutex::new(None)),
            binary: None,
            timeout_override: None,
        }
    }

    pub fn set_goal_observer(&self, observer: NotifHandler) {
        *self.goal_observer.lock().unwrap() = Some(observer);
    }

    #[cfg(test)]
    pub(crate) fn for_test(binary: PathBuf, timeout: Duration) -> Self {
        let mut server = Self::new();
        server.binary = Some(binary);
        server.timeout_override = Some(timeout);
        server
    }

    #[cfg(test)]
    pub(crate) fn fail_for_test(&self) {
        self.current().unwrap().fail("simulated transport failure");
    }

    fn resolve_bin() -> PathBuf {
        if let Ok(p) = std::env::var("ATELIER_CODEX_BIN") {
            let pb = PathBuf::from(&p);
            if pb.is_file() {
                return pb;
            }
        }
        if let Ok(out) = std::process::Command::new("which").arg("codex").output() {
            if out.status.success() {
                let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !p.is_empty() {
                    return PathBuf::from(p);
                }
            }
        }
        PathBuf::from("codex")
    }

    fn current(&self) -> Option<Arc<Connection>> {
        self.inner.lock().unwrap().clone()
    }

    pub(crate) async fn open_thread(
        &self,
        method: &str,
        params: Value,
    ) -> Result<(Value, ThreadConnection), String> {
        tokio::time::timeout(self.deadline(method), async {
            let connection = self.initialize().await?;
            let response = connection.request(method, params).await?;
            let thread_id = response
                .pointer("/thread/id")
                .and_then(Value::as_str)
                .ok_or_else(|| format!("{method} sans id"))?
                .to_string();
            Ok((
                response,
                ThreadConnection {
                    connection,
                    thread_id,
                    timeout_override: self.timeout_override,
                },
            ))
        })
        .await
        .map_err(|_| format!("Codex {method}: délai dépassé"))?
    }

    fn deadline(&self, method: &str) -> Duration {
        self.timeout_override.unwrap_or_else(|| {
            Duration::from_secs(match method {
                "thread/start" | "thread/resume" | "thread/fork" | "turn/start" => 60,
                "turn/interrupt" => 10,
                _ => 30,
            })
        })
    }

    async fn initialize(&self) -> Result<Arc<Connection>, String> {
        let _initialization = self.initialization.lock().await;
        if let Some(connection) = self.current() {
            if connection.ready.load(Ordering::SeqCst) && !connection.is_closed() {
                return Ok(connection);
            }
            connection
                .stop("remplacement d’une connexion Codex non prête")
                .await;
        }
        let bin = self.binary.clone().unwrap_or_else(Self::resolve_bin);
        let mut cmd = Command::new(bin);
        cmd.arg("app-server")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("spawn codex app-server: {e}"))?;
        let stdin = child.stdin.take().ok_or("pas de stdin")?;
        let stdout = child.stdout.take().ok_or("pas de stdout")?;
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if !line.trim().is_empty() {
                        eprintln!("[codex] {line}");
                    }
                }
            });
        }
        let connection = Arc::new(Connection {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            state: StdMutex::default(),
            goal_observer: self.goal_observer.clone(),
            ready: AtomicBool::new(false),
            closed: watch::channel(false).0,
            next_id: AtomicU64::new(1),
        });
        *self.inner.lock().unwrap() = Some(Arc::clone(&connection));
        let mut startup = Startup {
            connection: Arc::clone(&connection),
            complete: false,
        };
        let weak = Arc::downgrade(&connection);
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            // One ordered reader: EOF cannot overtake already-read terminals,
            // and there is no unbounded queue between stdout and dispatch.
            while let Ok(Some(line)) = lines.next_line().await {
                let Some(connection) = weak.upgrade() else {
                    return;
                };
                if let Ok(msg) = serde_json::from_str(&line) {
                    connection.dispatch(msg);
                }
            }
            if let Some(connection) = weak.upgrade() {
                connection.stop("codex app-server terminé").await;
            }
        });
        connection.request("initialize", json!({
            "clientInfo":{"name":"atelier-studio","title":"Atelier Studio","version":"0.1.0"},
            "capabilities":{"experimentalApi":true}
        })).await?;
        connection.write(&json!({"method":"initialized"})).await?;
        if connection.is_closed() {
            return Err("app-server terminé pendant son initialisation".into());
        }
        connection.ready.store(true, Ordering::SeqCst);
        startup.complete = true;
        Ok(connection)
    }

    pub async fn ensure(&self) -> Result<(), String> {
        tokio::time::timeout(self.deadline("initialize"), self.initialize())
            .await
            .map_err(|_| "Codex initialize: délai dépassé".to_string())??;
        Ok(())
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        // The deadline includes readiness, writer contention and the response.
        tokio::time::timeout(self.deadline(method), async {
            let connection = self.initialize().await?;
            connection.request(method, params).await
        })
        .await
        .map_err(|_| format!("Codex {method}: délai dépassé"))?
    }

    pub async fn set_handler(&self, id: &str, handler: NotifHandler) {
        if let Some(connection) = self.current() {
            connection
                .state
                .lock()
                .unwrap()
                .handlers
                .insert(id.into(), handler);
        }
    }
    pub async fn clear_handler(&self, id: &str) {
        if let Some(connection) = self.current() {
            connection.state.lock().unwrap().handlers.remove(id);
        }
    }
}

impl Drop for CodexAppServer {
    fn drop(&mut self) {
        if let Some(connection) = self.inner.lock().unwrap().take() {
            connection.stop_in_background("client Codex fermé");
        }
    }
}
impl Default for CodexAppServer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(all(test, unix))]
#[path = "codex_rpc_tests.rs"]
pub(crate) mod tests;
