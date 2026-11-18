//! Gestionnaire de sessions `.ipynb` et moteur d'exécution Jupyter complet :
//! - Client ZeroMQ 5 canaux (`shell`, `iopub`, `stdin`, `control`, `hb`) pour
//!   tout `kernelspec` standard (`ipykernel`, `IRkernel`, `IJulia`…) ;
//! - Repli transparent vers le pilote Python léger d'Atelier (`atelier_noyau.py`)
//!   lorsqu'un environnement Python n'a pas `ipykernel` installé ;
//! - Suivi mémoire RSS (`atelier_kernel::usage`), propositions inline de l'agent
//!   et diffusion temps réel des sorties vers l'interface.

use crate::context::{diff_notebooks, CellDiffEntry};
use crate::kernelspec::{
    discover_kernels, select_default_kernel, DiscoveredKernel, KernelBackendKind,
};
use crate::nbformat::{
    make_cell_id, sha256_hex, CellKind, CellOutput, NotebookCell, NotebookDocument, NotebookError,
    UiCell,
};
use crate::proposals::CellProposal;
use crate::wire::{
    ConnectionFile, JupyterMessage, LiveVariable, PYTHON_VARIABLES_EXPR,
};
use crate::zmtp::{ZmqSocketType, ZmtpSocket, ZmtpWriter};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::net::TcpListener as StdTcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::OwnedWriteHalf;
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

/// Événement poussé vers le frontend WebSocket lorsqu'un cahier évolue en direct.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum NotebookPushEvent {
    KernelStatus {
        path: String,
        status: NotebookKernelStatus,
    },
    CellUpdated {
        path: String,
        cell: UiCell,
        running: bool,
    },
    ProposalsUpdated {
        path: String,
        proposals: Vec<CellProposal>,
        revision: String,
    },
    VariablesUpdated {
        path: String,
        variables: Vec<LiveVariable>,
    },
}

pub type NotebookEventListener = Arc<dyn Fn(NotebookPushEvent) + Send + Sync>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookKernelStatus {
    /// `"off"` (lecture seule, 0 Mo), `"starting"`, `"idle"`, `"busy"`, `"error"`.
    pub state: String,
    pub kernel_id: Option<String>,
    pub display_name: Option<String>,
    pub language: Option<String>,
    pub backend: Option<KernelBackendKind>,
    pub pid: Option<u32>,
    pub rss_bytes: Option<u64>,
    pub busy_cell_id: Option<String>,
    pub message: Option<String>,
}

impl Default for NotebookKernelStatus {
    fn default() -> Self {
        Self {
            state: "off".into(),
            kernel_id: None,
            display_name: None,
            language: None,
            backend: None,
            pid: None,
            rss_bytes: None,
            busy_cell_id: None,
            message: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookSnapshot {
    pub path: String,
    pub revision: String,
    pub unsaved: bool,
    pub language: String,
    pub preferred_kernelspec: Option<String>,
    pub cells: Vec<UiCell>,
    pub proposals: Vec<CellProposal>,
    pub status: NotebookKernelStatus,
    pub variables: Vec<LiveVariable>,
}

// ============================================================================
// 1. Client ZeroMQ 5 canaux (protocole Jupyter v5.3)
// ============================================================================

struct PendingZmqExec {
    msg_id: String,
    cell_id: String,
    silent: bool,
    done_tx: Option<oneshot::Sender<Value>>,
}

struct ZmqShared {
    active_exec: Mutex<Option<PendingZmqExec>>,
    shell_waiters: Mutex<HashMap<String, oneshot::Sender<JupyterMessage>>>,
    busy: Mutex<bool>,
}

pub struct ZmqKernelHandle {
    pub spec: DiscoveredKernel,
    pub pid: Option<u32>,
    session_id: String,
    hmac_key: Vec<u8>,
    conn_path: Option<PathBuf>,
    shell_tx: AsyncMutex<ZmtpWriter<OwnedWriteHalf>>,
    control_tx: AsyncMutex<ZmtpWriter<OwnedWriteHalf>>,
    shared: Arc<ZmqShared>,
    child: AsyncMutex<Option<Child>>,
}

fn pick_ephemeral_ports() -> std::io::Result<[u16; 5]> {
    let mut listeners = Vec::with_capacity(5);
    let mut ports = [0u16; 5];
    for slot in &mut ports {
        let l = StdTcpListener::bind("127.0.0.1:0")?;
        *slot = l.local_addr()?.port();
        listeners.push(l);
    }
    drop(listeners);
    Ok(ports)
}

impl ZmqKernelHandle {
    /// Démarre un processus `kernelspec` réel et s'y connecte sur les 5 sockets ZeroMQ.
    pub async fn spawn_process(
        spec: DiscoveredKernel,
        cwd: &Path,
        runtime_dir: &Path,
        notebook_path: &str,
        workspace: WeakWorkspace,
        listener: Option<NotebookEventListener>,
    ) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(runtime_dir)
            .map_err(|e| format!("dossier runtime ZMQ : {e}"))?;
        let ports = pick_ephemeral_ports().map_err(|e| format!("allocation ports ZMQ : {e}"))?;
        let nonce = format!(
            "{}:{}:{}",
            std::process::id(),
            notebook_path,
            Instant::now().elapsed().as_nanos()
        );
        let key = sha256_hex(nonce.as_bytes())[..32].to_string();
        let conn = ConnectionFile {
            transport: "tcp".into(),
            ip: "127.0.0.1".into(),
            shell_port: ports[0],
            iopub_port: ports[1],
            stdin_port: ports[2],
            control_port: ports[3],
            hb_port: ports[4],
            signature_scheme: "hmac-sha256".into(),
            key: key.clone(),
            kernel_name: Some(spec.name.clone()),
        };

        let conn_path = runtime_dir.join(format!("kernel-{}.json", &sha256_hex(key.as_bytes())[..12]));
        let conn_bytes = serde_json::to_vec_pretty(&conn).map_err(|e| e.to_string())?;
        write_private_file(&conn_path, &conn_bytes)
            .map_err(|e| format!("écriture connection_file : {e}"))?;

        let argv: Vec<String> = spec
            .argv
            .iter()
            .map(|arg| {
                if arg == "{connection_file}" {
                    conn_path.display().to_string()
                } else {
                    arg.replace("{connection_file}", &conn_path.display().to_string())
                }
            })
            .collect();
        let Some((program, args)) = argv.split_first() else {
            return Err("argv vide dans le kernelspec".into());
        };

        let mut cmd = Command::new(program);
        cmd.args(args)
            .current_dir(cwd)
            .envs(&spec.env_vars)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("échec lancement noyau `{program}` : {e}"))?;
        let pid = child.id();

        match Self::connect_to_endpoints(
            spec,
            &conn,
            pid,
            Some(conn_path.clone()),
            Some(child),
            notebook_path,
            workspace,
            listener,
            Duration::from_secs(25),
        )
        .await
        {
            Ok(handle) => Ok(handle),
            Err(err) => {
                let _ = std::fs::remove_file(&conn_path);
                if let Some(p) = pid {
                    #[cfg(unix)]
                    unsafe {
                        let _ = libc::kill(-(p as i32), libc::SIGKILL);
                    }
                }
                Err(err)
            }
        }
    }

    /// Connecte les 5 canaux ZMTP à un `ConnectionFile` existant (processus local, tunnel SSH ou pair de test).
    #[allow(clippy::too_many_arguments)]
    pub async fn connect_to_endpoints(
        spec: DiscoveredKernel,
        conn: &ConnectionFile,
        pid: Option<u32>,
        conn_path: Option<PathBuf>,
        mut child: Option<Child>,
        notebook_path: &str,
        workspace: WeakWorkspace,
        listener: Option<NotebookEventListener>,
        timeout: Duration,
    ) -> Result<Arc<Self>, String> {
        let deadline = Instant::now() + timeout;
        let identity = format!("atelier-{}", &sha256_hex(conn.key.as_bytes())[..8]);
        let id_bytes = identity.as_bytes();

        let connect_retry = |addr: String, kind: ZmqSocketType, with_id: bool| async move {
            loop {
                match ZmtpSocket::connect(&addr, kind, if with_id { Some(id_bytes) } else { None })
                    .await
                {
                    Ok(sock) => return Ok(sock),
                    Err(e) => {
                        if Instant::now() >= deadline {
                            return Err(format!("connexion ZMQ {addr} ({kind:?}) expirée : {e}"));
                        }
                        tokio::time::sleep(Duration::from_millis(60)).await;
                    }
                }
            }
        };

        if let Some(c) = child.as_mut() {
            if let Ok(Some(exit)) = c.try_wait() {
                return Err(format!("le noyau s'est arrêté immédiatement ({exit})"));
            }
        }

        let (shell, iopub, _stdin, control, mut hb) = tokio::try_join!(
            connect_retry(conn.shell_addr(), ZmqSocketType::Dealer, true),
            connect_retry(conn.iopub_addr(), ZmqSocketType::Sub, false),
            connect_retry(conn.stdin_addr(), ZmqSocketType::Dealer, true),
            connect_retry(conn.control_addr(), ZmqSocketType::Dealer, true),
            connect_retry(conn.hb_addr(), ZmqSocketType::Req, false),
        )?;

        let (mut shell_rx, shell_tx) = shell.into_split();
        let (mut iopub_rx, _iopub_tx) = iopub.into_split();
        let (mut control_rx, control_tx) = control.into_split();

        let hmac_key = conn.key.as_bytes().to_vec();
        let shared = Arc::new(ZmqShared {
            active_exec: Mutex::new(None),
            shell_waiters: Mutex::new(HashMap::new()),
            busy: Mutex::new(false),
        });

        // Tâche de lecture `shell`
        {
            let shared_shell = Arc::clone(&shared);
            let key_shell = hmac_key.clone();
            tokio::spawn(async move {
                while let Ok(frames) = shell_rx.recv_multipart().await {
                    if let Ok(msg) = JupyterMessage::decode(&frames, &key_shell) {
                        if let Some(parent_id) = msg.parent_msg_id() {
                            let tx = shared_shell
                                .shell_waiters
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .remove(parent_id);
                            if let Some(tx) = tx {
                                let _ = tx.send(msg);
                            }
                        }
                    }
                }
            });
        }

        // Tâche de lecture `control`
        {
            let shared_ctrl = Arc::clone(&shared);
            let key_ctrl = hmac_key.clone();
            tokio::spawn(async move {
                while let Ok(frames) = control_rx.recv_multipart().await {
                    if let Ok(msg) = JupyterMessage::decode(&frames, &key_ctrl) {
                        if let Some(parent_id) = msg.parent_msg_id() {
                            let tx = shared_ctrl
                                .shell_waiters
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .remove(parent_id);
                            if let Some(tx) = tx {
                                let _ = tx.send(msg);
                            }
                        }
                    }
                }
            });
        }

        // Tâche de battement de cœur `hb`
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                if hb.send_multipart(&[b"ping".to_vec()]).await.is_err() {
                    break;
                }
                if tokio::time::timeout(Duration::from_secs(5), hb.recv_multipart())
                    .await
                    .is_err()
                {
                    break;
                }
            }
        });

        // Tâche de lecture `iopub` : sorties temps réel (`stream`, `display_data`, `update_display_data`, `execute_result`, `error`, `status`)
        {
            let shared_iopub = Arc::clone(&shared);
            let key_iopub = hmac_key.clone();
            let nb_path = notebook_path.to_string();
            let ws_weak = workspace;
            let cb = listener;
            tokio::spawn(async move {
                while let Ok(frames) = iopub_rx.recv_multipart().await {
                    // En ZMTP 3.x PUB/SUB, l'émetteur peut préfixer un topic avant `<IDS|MSG>` :
                    // `JupyterMessage::decode` cherche `<IDS|MSG>` à n'importe quel indice !
                    let Ok(msg) = JupyterMessage::decode(&frames, &key_iopub) else {
                        continue;
                    };
                    let msg_type = msg.msg_type().to_string();
                    let parent_id = msg.parent_msg_id().unwrap_or("").to_string();

                    if msg_type == "status" {
                        let state_str = msg
                            .content
                            .get("execution_state")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let is_busy = state_str == "busy";
                        *shared_iopub.busy.lock().unwrap_or_else(|e| e.into_inner()) = is_busy;
                        if state_str == "idle" {
                            let done_tx = {
                                let mut guard = shared_iopub
                                    .active_exec
                                    .lock()
                                    .unwrap_or_else(|e| e.into_inner());
                                if guard.as_ref().is_some_and(|p| p.msg_id == parent_id) {
                                    guard.take().and_then(|p| p.done_tx)
                                } else {
                                    None
                                }
                            };
                            if let Some(tx) = done_tx {
                                let _ = tx.send(json!({ "idle": true }));
                            }
                        }
                        continue;
                    }

                    let target_cell = {
                        let guard = shared_iopub
                            .active_exec
                            .lock()
                            .unwrap_or_else(|e| e.into_inner());
                        guard
                            .as_ref()
                            .filter(|p| !p.silent && p.msg_id == parent_id)
                            .map(|p| p.cell_id.clone())
                    };

                    let Some(cell_id) = target_cell else {
                        continue;
                    };
                    let Some(ws_arc) = ws_weak.upgrade() else {
                        continue;
                    };

                    let updated_ui = {
                        let mut doc = ws_arc.doc.lock().await;
                        if let Some(idx) = doc.cells.iter().position(|c| c.id == cell_id) {
                            if msg_type == "execute_input" {
                                if let Some(cnt) =
                                    msg.content.get("execution_count").and_then(Value::as_u64)
                                {
                                    doc.cells[idx].execution_count = Some(cnt);
                                }
                            } else {
                                doc.cells[idx].apply_iopub_output(
                                    &msg_type,
                                    &msg.content,
                                    msg.content.get("transient"),
                                );
                            }
                            *ws_arc.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = true;
                            Some(doc.cells[idx].to_ui(idx + 1))
                        } else {
                            None
                        }
                    };

                    if let (Some(ui_cell), Some(emit)) = (updated_ui, &cb) {
                        emit(NotebookPushEvent::CellUpdated {
                            path: nb_path.clone(),
                            cell: ui_cell,
                            running: true,
                        });
                    }
                }
            });
        }

        let handle = Arc::new(Self {
            spec,
            pid,
            session_id: identity,
            hmac_key,
            conn_path,
            shell_tx: AsyncMutex::new(shell_tx),
            control_tx: AsyncMutex::new(control_tx),
            shared,
            child: AsyncMutex::new(child),
        });

        // Vérification `kernel_info_request` (confirme que le noyau répond sur `shell`).
        let _ = tokio::time::timeout(Duration::from_secs(15), handle.request_shell("kernel_info_request", json!({})))
            .await
            .map_err(|_| "délai dépassé en attente de kernel_info_reply".to_string())??;

        Ok(handle)
    }

    pub async fn request_shell(&self, msg_type: &str, content: Value) -> Result<JupyterMessage, String> {
        let req = JupyterMessage::new_request(&self.session_id, msg_type, content);
        let msg_id = req.msg_id().to_string();
        let (tx, rx) = oneshot::channel();
        self.shared
            .shell_waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(msg_id.clone(), tx);

        let frames = req.encode(&self.hmac_key);
        if let Err(e) = self.shell_tx.lock().await.send_multipart(&frames).await {
            self.shared
                .shell_waiters
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&msg_id);
            return Err(format!("envoi ZMQ `{msg_type}` échoué : {e}"));
        }
        rx.await
            .map_err(|_| format!("canal `{msg_type}` fermé avant réponse"))
    }

    pub async fn execute_cell(&self, cell_id: &str, code: &str) -> Result<Option<u64>, String> {
        let req = JupyterMessage::new_request(
            &self.session_id,
            "execute_request",
            json!({
                "code": code,
                "silent": false,
                "store_history": true,
                "user_expressions": {},
                "allow_stdin": false,
                "stop_on_error": true,
            }),
        );
        let msg_id = req.msg_id().to_string();
        let (idle_tx, idle_rx) = oneshot::channel();
        let (reply_tx, reply_rx) = oneshot::channel();

        {
            let mut active = self
                .shared
                .active_exec
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            *active = Some(PendingZmqExec {
                msg_id: msg_id.clone(),
                cell_id: cell_id.to_string(),
                silent: false,
                done_tx: Some(idle_tx),
            });
        }
        self.shared
            .shell_waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(msg_id.clone(), reply_tx);

        let frames = req.encode(&self.hmac_key);
        self.shell_tx
            .lock()
            .await
            .send_multipart(&frames)
            .await
            .map_err(|e| format!("envoi execute_request : {e}"))?;

        let reply = reply_rx
            .await
            .map_err(|_| "noyau arrêté pendant l'exécution".to_string())?;
        // Attendre que `iopub` ait également drainé `status: idle` (plafonné pour robustesse).
        let _ = tokio::time::timeout(Duration::from_secs(2), idle_rx).await;
        {
            let mut active = self
                .shared
                .active_exec
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if active.as_ref().is_some_and(|p| p.msg_id == msg_id) {
                *active = None;
            }
        }
        Ok(reply.content.get("execution_count").and_then(Value::as_u64))
    }

    /// Autocomplétion en direct via `complete_request`.
    pub async fn complete(&self, code: &str, cursor_pos: usize) -> Result<Value, String> {
        let reply = self
            .request_shell(
                "complete_request",
                json!({ "code": code, "cursor_pos": cursor_pos }),
            )
            .await?;
        Ok(json!({
            "matches": reply.content.get("matches").cloned().unwrap_or_else(|| json!([])),
            "cursorStart": reply.content.get("cursor_start").and_then(Value::as_u64).unwrap_or(cursor_pos as u64),
            "cursorEnd": reply.content.get("cursor_end").and_then(Value::as_u64).unwrap_or(cursor_pos as u64),
        }))
    }

    /// Inspection de documentation (`⇧Tab`) via `inspect_request`.
    pub async fn inspect(&self, code: &str, cursor_pos: usize) -> Result<Value, String> {
        let reply = self
            .request_shell(
                "inspect_request",
                json!({ "code": code, "cursor_pos": cursor_pos, "detail_level": 0 }),
            )
            .await?;
        let found = reply
            .content
            .get("found")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let text = reply
            .content
            .get("data")
            .and_then(|d| d.get("text/plain"))
            .and_then(Value::as_str)
            .map(|s| crate::nbformat::strip_ansi(s))
            .unwrap_or_default();
        Ok(json!({ "found": found, "docstring": text }))
    }

    /// Inspection silencieuse des variables en mémoire via `user_expressions` (`silent: true`).
    pub async fn fetch_variables(&self) -> Vec<LiveVariable> {
        if self.spec.language != "python" {
            return Vec::new();
        }
        let Ok(reply) = tokio::time::timeout(
            Duration::from_secs(4),
            self.request_shell(
                "execute_request",
                json!({
                    "code": "",
                    "silent": true,
                    "store_history": false,
                    "user_expressions": { "_atelier_vars": PYTHON_VARIABLES_EXPR },
                    "allow_stdin": false,
                }),
            ),
        )
        .await
        else {
            return Vec::new();
        };
        let Ok(reply) = reply else {
            return Vec::new();
        };
        let raw_str = reply
            .content
            .get("user_expressions")
            .and_then(|u| u.get("_atelier_vars"))
            .and_then(|v| v.get("data"))
            .and_then(|d| d.get("text/plain"))
            .and_then(Value::as_str)
            .unwrap_or("");
        parse_python_repr_json_vars(raw_str)
    }

    pub async fn interrupt(&self) -> Result<(), String> {
        // 1. Signal POSIX au groupe de processus (interrompt les boucles C/NumPy/PyMC).
        #[cfg(unix)]
        if let Some(pid) = self.pid {
            unsafe {
                let _ = libc::kill(-(pid as i32), libc::SIGINT);
            }
        }
        // 2. Requête `interrupt_request` sur le canal `control` ZMQ.
        let req = JupyterMessage::new_request(&self.session_id, "interrupt_request", json!({}));
        let frames = req.encode(&self.hmac_key);
        let _ = self.control_tx.lock().await.send_multipart(&frames).await;
        Ok(())
    }

    pub async fn shutdown(&self) {
        let req = JupyterMessage::new_request(
            &self.session_id,
            "shutdown_request",
            json!({ "restart": false }),
        );
        let frames = req.encode(&self.hmac_key);
        let _ = self.control_tx.lock().await.send_multipart(&frames).await;
        if let Some(mut c) = self.child.lock().await.take() {
            let _ = tokio::time::timeout(Duration::from_millis(800), c.wait()).await;
            let _ = c.kill().await;
        }
        if let Some(p) = &self.conn_path {
            let _ = std::fs::remove_file(p);
        }
    }
}

fn parse_python_repr_json_vars(repr_or_json: &str) -> Vec<LiveVariable> {
    let trimmed = repr_or_json.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    // `text/plain` d'une chaîne Python contient `'[{"name": ...}]'` : on désérialise d'abord ou on retire les apostrophes.
    if let Ok(vars) = serde_json::from_str::<Vec<LiveVariable>>(trimmed) {
        return vars;
    }
    if let Ok(unquoted) = serde_json::from_str::<String>(trimmed) {
        if let Ok(vars) = serde_json::from_str::<Vec<LiveVariable>>(&unquoted) {
            return vars;
        }
    }
    if (trimmed.starts_with('\'') && trimmed.ends_with('\''))
        || (trimmed.starts_with('"') && trimmed.ends_with('"'))
    {
        let inner = &trimmed[1..trimmed.len() - 1]
            .replace("\\'", "'")
            .replace("\\\\", "\\");
        if let Ok(vars) = serde_json::from_str::<Vec<LiveVariable>>(inner) {
            return vars;
        }
    }
    Vec::new()
}

fn write_private_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = std::fs::File::create(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(std::fs::Permissions::from_mode(0o600));
    }
    std::io::Write::write_all(&mut file, bytes)?;
    file.sync_all()
}

// ============================================================================
// 2. Repli Python léger (`atelier_noyau.py`) si `ipykernel` n'est pas installé
// ============================================================================

pub struct FallbackPythonHandle {
    pub spec: DiscoveredKernel,
    pub pid: Option<u32>,
    fig_dir: PathBuf,
    stdin: AsyncMutex<ChildStdin>,
    child: AsyncMutex<Option<Child>>,
    exec_seq: AtomicU64,
    vars_seq: AtomicU64,
    pending: Arc<Mutex<Option<FallbackPending>>>,
    vars_waiters: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
}

struct FallbackPending {
    seq: u64,
    cell_id: String,
    done_tx: Option<oneshot::Sender<Option<u64>>>,
}

impl FallbackPythonHandle {
    pub async fn spawn(
        spec: DiscoveredKernel,
        cwd: &Path,
        runtime_dir: &Path,
        notebook_path: &str,
        workspace: WeakWorkspace,
        listener: Option<NotebookEventListener>,
    ) -> Result<Arc<Self>, String> {
        std::fs::create_dir_all(runtime_dir).map_err(|e| e.to_string())?;
        let driver_path = runtime_dir.join("atelier_noyau.py");
        if !driver_path.is_file() {
            std::fs::write(&driver_path, atelier_kernel::DRIVER_SOURCE)
                .map_err(|e| format!("écriture pilote Python : {e}"))?;
        }
        let fig_dir = runtime_dir.join("figures");
        std::fs::create_dir_all(&fig_dir).map_err(|e| e.to_string())?;

        let py = spec
            .python_executable
            .clone()
            .unwrap_or_else(|| PathBuf::from("python3"));

        let mut cmd = Command::new(&py);
        cmd.arg("-u")
            .arg(&driver_path)
            .current_dir(cwd)
            .envs(&spec.env_vars)
            .env("PYTHONUNBUFFERED", "1")
            .env("MPLBACKEND", "Agg")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("lancement Python `{}` : {e}", py.display()))?;
        let pid = child.id();
        let stdin = child.stdin.take().ok_or("stdin indisponible")?;
        let stdout = child.stdout.take().ok_or("stdout indisponible")?;

        let (ready_tx, ready_rx) = oneshot::channel();
        let pending: Arc<Mutex<Option<FallbackPending>>> = Arc::new(Mutex::new(None));
        let vars_waiters: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>> =
            Arc::new(Mutex::new(HashMap::new()));

        let pending_loop = Arc::clone(&pending);
        let vars_loop = Arc::clone(&vars_waiters);
        let nb_path = notebook_path.to_string();
        tokio::spawn(async move {
            let mut ready_opt = Some(ready_tx);
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(val) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                match val.get("t").and_then(Value::as_str).unwrap_or("") {
                    "ready" => {
                        if let Some(tx) = ready_opt.take() {
                            let _ = tx.send(());
                        }
                    }
                    "vars" => {
                        if let Some(id) = val.get("id").and_then(Value::as_u64) {
                            let tx = vars_loop
                                .lock()
                                .unwrap_or_else(|e| e.into_inner())
                                .remove(&id);
                            if let Some(tx) = tx {
                                let _ = tx.send(val);
                            }
                        }
                    }
                    "stream" => {
                        let cell_id = pending_loop
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .as_ref()
                            .map(|p| p.cell_id.clone());
                        if let (Some(cid), Some(ws)) = (cell_id, workspace.upgrade()) {
                            let name = val.get("name").and_then(Value::as_str).unwrap_or("stdout");
                            let text = val.get("text").and_then(Value::as_str).unwrap_or("");
                            let ui = {
                                let mut doc = ws.doc.lock().await;
                                if let Some(idx) = doc.cells.iter().position(|c| c.id == cid) {
                                    doc.cells[idx].apply_iopub_output(
                                        "stream",
                                        &json!({ "name": name, "text": text }),
                                        None,
                                    );
                                    Some(doc.cells[idx].to_ui(idx + 1))
                                } else {
                                    None
                                }
                            };
                            if let (Some(cell), Some(cb)) = (ui, &listener) {
                                cb(NotebookPushEvent::CellUpdated {
                                    path: nb_path.clone(),
                                    cell,
                                    running: true,
                                });
                            }
                        }
                    }
                    "done" => {
                        let finished = pending_loop.lock().unwrap_or_else(|e| e.into_inner()).take();
                        if let Some(fin) = finished {
                            if let Some(ws) = workspace.upgrade() {
                                let mut doc = ws.doc.lock().await;
                                if let Some(idx) = doc.cells.iter().position(|c| c.id == fin.cell_id)
                                {
                                    doc.cells[idx].execution_count = Some(fin.seq);
                                    if let Some(res) =
                                        val.get("result").and_then(Value::as_str).filter(|s| !s.is_empty())
                                    {
                                        let mut data = Map::new();
                                        data.insert("text/plain".into(), Value::String(res.to_string()));
                                        doc.cells[idx].outputs.push(CellOutput::ExecuteResult {
                                            execution_count: Some(fin.seq),
                                            data,
                                            metadata: Map::new(),
                                        });
                                    }
                                    if let Some(figs) = val.get("figures").and_then(Value::as_array) {
                                        for fp in figs.iter().filter_map(Value::as_str) {
                                            if let Ok(bytes) = std::fs::read(fp) {
                                                let b64 = base64_encode(&bytes);
                                                let mut data = Map::new();
                                                data.insert("image/png".into(), Value::String(b64));
                                                doc.cells[idx].outputs.push(CellOutput::DisplayData {
                                                    data,
                                                    metadata: Map::new(),
                                                    display_id: None,
                                                });
                                            }
                                        }
                                    }
                                    if let Some(err_obj) = val.get("error").filter(|v| v.is_object()) {
                                        let ename = err_obj
                                            .get("ename")
                                            .and_then(Value::as_str)
                                            .unwrap_or("Error")
                                            .to_string();
                                        let evalue = err_obj
                                            .get("evalue")
                                            .and_then(Value::as_str)
                                            .unwrap_or("")
                                            .to_string();
                                        let tb = err_obj
                                            .get("traceback")
                                            .and_then(Value::as_str)
                                            .map(|s| vec![s.to_string()])
                                            .unwrap_or_default();
                                        doc.cells[idx].outputs.push(CellOutput::Error {
                                            ename,
                                            evalue,
                                            traceback: tb,
                                        });
                                    }
                                    *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = true;
                                }
                            }
                            if let Some(tx) = fin.done_tx {
                                let _ = tx.send(Some(fin.seq));
                            }
                        }
                    }
                    _ => {}
                }
            }
        });

        tokio::time::timeout(Duration::from_secs(20), ready_rx)
            .await
            .map_err(|_| "délai dépassé au démarrage du pilote Python".to_string())?
            .map_err(|_| "pilote Python arrêté avant ready".to_string())?;

        Ok(Arc::new(Self {
            spec,
            pid,
            fig_dir,
            stdin: AsyncMutex::new(stdin),
            child: AsyncMutex::new(Some(child)),
            exec_seq: AtomicU64::new(1),
            vars_seq: AtomicU64::new(1_000_000),
            pending,
            vars_waiters,
        }))
    }

    pub async fn execute_cell(&self, cell_id: &str, code: &str) -> Result<Option<u64>, String> {
        let seq = self.exec_seq.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        {
            *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = Some(FallbackPending {
                seq,
                cell_id: cell_id.to_string(),
                done_tx: Some(tx),
            });
        }
        let line = serde_json::to_string(&json!({
            "op": "exec",
            "id": seq,
            "code": code,
            "figdir": self.fig_dir.display().to_string(),
        }))
        .map_err(|e| e.to_string())?
            + "\n";
        self.stdin
            .lock()
            .await
            .write_all(line.as_bytes())
            .await
            .map_err(|e| format!("écriture stdin Python : {e}"))?;
        rx.await.map_err(|_| "noyau Python interrompu".to_string())
    }

    pub async fn fetch_variables(&self) -> Vec<LiveVariable> {
        let req_id = self.vars_seq.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.vars_waiters
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(req_id, tx);
        let line = format!("{{\"op\":\"vars\",\"id\":{req_id}}}\n");
        if self
            .stdin
            .lock()
            .await
            .write_all(line.as_bytes())
            .await
            .is_err()
        {
            return Vec::new();
        }
        let Ok(Ok(val)) = tokio::time::timeout(Duration::from_secs(3), rx).await else {
            return Vec::new();
        };
        val.get("vars")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| {
                        let shape = v
                            .get("shape")
                            .and_then(Value::as_array)
                            .map(|s| {
                                s.iter()
                                    .map(|d| d.to_string())
                                    .collect::<Vec<_>>()
                                    .join(" × ")
                            })
                            .or_else(|| {
                                v.get("len")
                                    .and_then(Value::as_u64)
                                    .map(|n| format!("{n} élém."))
                            })
                            .unwrap_or_default();
                        Some(LiveVariable {
                            name: v.get("name")?.as_str()?.to_string(),
                            var_type: v
                                .get("type")
                                .and_then(Value::as_str)
                                .unwrap_or("object")
                                .to_string(),
                            shape,
                            size_bytes: v.get("bytes").and_then(Value::as_u64).unwrap_or(0),
                            preview: v
                                .get("repr")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub async fn interrupt(&self) -> Result<(), String> {
        #[cfg(unix)]
        if let Some(pid) = self.pid {
            unsafe {
                let _ = libc::kill(-(pid as i32), libc::SIGINT);
            }
        }
        Ok(())
    }

    pub async fn shutdown(&self) {
        if let Some(mut c) = self.child.lock().await.take() {
            let _ = c.kill().await;
        }
    }
}

/// Encodage base64 standard RFC 4648 (pour embarquer les figures PNG capturées dans `.ipynb`).
pub fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize] as char);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

pub fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut vals = Vec::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_whitespace() {
            continue;
        }
        let v = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => 255,
            _ => return Err("base64 invalide".into()),
        };
        vals.push(v);
    }
    let mut out = Vec::with_capacity(vals.len() * 3 / 4);
    for chunk in vals.chunks(4) {
        if chunk.len() < 2 || chunk[0] == 255 || chunk[1] == 255 {
            break;
        }
        out.push((chunk[0] << 2) | (chunk[1] >> 4));
        if chunk.len() > 2 && chunk[2] != 255 {
            out.push((chunk[1] << 4) | (chunk[2] >> 2));
            if chunk.len() > 3 && chunk[3] != 255 {
                out.push((chunk[2] << 6) | chunk[3]);
            }
        }
    }
    Ok(out)
}

// ============================================================================
// 3. Espace de travail par cahier et `NotebookManager`
// ============================================================================

pub enum RunningBackend {
    Zmq(Arc<ZmqKernelHandle>),
    Fallback(Arc<FallbackPythonHandle>),
}

impl RunningBackend {
    pub fn spec(&self) -> &DiscoveredKernel {
        match self {
            Self::Zmq(h) => &h.spec,
            Self::Fallback(h) => &h.spec,
        }
    }

    pub fn pid(&self) -> Option<u32> {
        match self {
            Self::Zmq(h) => h.pid,
            Self::Fallback(h) => h.pid,
        }
    }

    pub async fn execute_cell(&self, cell_id: &str, code: &str) -> Result<Option<u64>, String> {
        match self {
            Self::Zmq(h) => h.execute_cell(cell_id, code).await,
            Self::Fallback(h) => h.execute_cell(cell_id, code).await,
        }
    }

    pub async fn fetch_variables(&self) -> Vec<LiveVariable> {
        match self {
            Self::Zmq(h) => h.fetch_variables().await,
            Self::Fallback(h) => h.fetch_variables().await,
        }
    }

    pub async fn interrupt(&self) -> Result<(), String> {
        match self {
            Self::Zmq(h) => h.interrupt().await,
            Self::Fallback(h) => h.interrupt().await,
        }
    }

    pub async fn shutdown(&self) {
        match self {
            Self::Zmq(h) => h.shutdown().await,
            Self::Fallback(h) => h.shutdown().await,
        }
    }
}

pub struct NotebookWorkspace {
    pub path: PathBuf,
    pub doc: AsyncMutex<NotebookDocument>,
    pub unsaved: Mutex<bool>,
    pub proposals: Mutex<Vec<CellProposal>>,
    pub kernel: AsyncMutex<Option<RunningBackend>>,
    pub exec_gate: AsyncMutex<()>,
    pub busy_cell: Mutex<Option<String>>,
    pub variables: Mutex<Vec<LiveVariable>>,
    pub selected_kernel_id: Mutex<Option<String>>,
}

type WeakWorkspace = std::sync::Weak<NotebookWorkspace>;

impl NotebookWorkspace {
    pub fn status(&self) -> NotebookKernelStatus {
        let busy_cell_id = self
            .busy_cell
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Ok(guard) = self.kernel.try_lock() {
            if let Some(k) = guard.as_ref() {
                let pid = k.pid();
                let rss_bytes = pid.and_then(|p| atelier_kernel::usage::read(p).map(|u| u.rss_bytes));
                let spec = k.spec();
                return NotebookKernelStatus {
                    state: if busy_cell_id.is_some() {
                        "busy".into()
                    } else {
                        "idle".into()
                    },
                    kernel_id: Some(spec.id.clone()),
                    display_name: Some(spec.display_name.clone()),
                    language: Some(spec.language.clone()),
                    backend: Some(spec.backend.clone()),
                    pid,
                    rss_bytes,
                    busy_cell_id,
                    message: None,
                };
            }
        } else if busy_cell_id.is_some() {
            return NotebookKernelStatus {
                state: "busy".into(),
                busy_cell_id,
                ..Default::default()
            };
        }
        NotebookKernelStatus::default()
    }

    pub async fn snapshot(&self) -> NotebookSnapshot {
        let doc = self.doc.lock().await;
        let cells: Vec<UiCell> = doc
            .cells
            .iter()
            .enumerate()
            .map(|(i, c)| c.to_ui(i + 1))
            .collect();
        let revision = doc.revision();
        let language = doc.language();
        let preferred_kernelspec = doc.preferred_kernelspec();
        drop(doc);

        let status = {
            let guard = self.kernel.lock().await;
            let busy_cell_id = self
                .busy_cell
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            match guard.as_ref() {
                Some(k) => {
                    let pid = k.pid();
                    let rss_bytes =
                        pid.and_then(|p| atelier_kernel::usage::read(p).map(|u| u.rss_bytes));
                    let spec = k.spec();
                    NotebookKernelStatus {
                        state: if busy_cell_id.is_some() {
                            "busy".into()
                        } else {
                            "idle".into()
                        },
                        kernel_id: Some(spec.id.clone()),
                        display_name: Some(spec.display_name.clone()),
                        language: Some(spec.language.clone()),
                        backend: Some(spec.backend.clone()),
                        pid,
                        rss_bytes,
                        busy_cell_id,
                        message: None,
                    }
                }
                None => NotebookKernelStatus::default(),
            }
        };

        NotebookSnapshot {
            path: self.path.display().to_string(),
            revision,
            unsaved: *self.unsaved.lock().unwrap_or_else(|e| e.into_inner()),
            language,
            preferred_kernelspec,
            cells,
            proposals: self
                .proposals
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone(),
            status,
            variables: self
                .variables
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone(),
        }
    }
}

pub struct NotebookManager {
    runtime_dir: PathBuf,
    atelier_kernel_dir: PathBuf,
    home_dir: PathBuf,
    workspaces: AsyncMutex<HashMap<PathBuf, Arc<NotebookWorkspace>>>,
    listener: Mutex<Option<NotebookEventListener>>,
}

impl NotebookManager {
    pub fn new(runtime_dir: PathBuf, atelier_kernel_dir: PathBuf, home_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            atelier_kernel_dir,
            home_dir,
            workspaces: AsyncMutex::new(HashMap::new()),
            listener: Mutex::new(None),
        }
    }

    pub fn set_listener(&self, listener: NotebookEventListener) {
        *self.listener.lock().unwrap_or_else(|e| e.into_inner()) = Some(listener);
    }

    fn emit(&self, ev: NotebookPushEvent) {
        if let Some(cb) = self
            .listener
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            cb(ev);
        }
    }

    pub fn list_kernels(&self, project_root: Option<&Path>) -> Vec<DiscoveredKernel> {
        discover_kernels(&self.home_dir, project_root, Some(&self.atelier_kernel_dir))
    }

    pub async fn get_or_open(&self, path: &Path) -> Result<Arc<NotebookWorkspace>, NotebookError> {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let mut map = self.workspaces.lock().await;
        if let Some(existing) = map.get(&canonical) {
            // Si le cahier n'a pas de modifications en attente, on relit depuis le disque s'il a changé.
            if !*existing.unsaved.lock().unwrap_or_else(|e| e.into_inner())
                && existing
                    .proposals
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .is_empty()
            {
                if let Ok(fresh) = NotebookDocument::open(&canonical) {
                    let mut doc = existing.doc.lock().await;
                    if doc.revision() != fresh.revision() {
                        *doc = fresh;
                    }
                }
            }
            return Ok(Arc::clone(existing));
        }

        let doc = NotebookDocument::open(&canonical)?;
        let ws = Arc::new(NotebookWorkspace {
            path: canonical.clone(),
            doc: AsyncMutex::new(doc),
            unsaved: Mutex::new(false),
            proposals: Mutex::new(Vec::new()),
            kernel: AsyncMutex::new(None),
            exec_gate: AsyncMutex::new(()),
            busy_cell: Mutex::new(None),
            variables: Mutex::new(Vec::new()),
            selected_kernel_id: Mutex::new(None),
        });
        map.insert(canonical, Arc::clone(&ws));
        Ok(ws)
    }

    pub async fn save(&self, path: &Path) -> Result<NotebookSnapshot, NotebookError> {
        let ws = self.get_or_open(path).await?;
        {
            let doc = ws.doc.lock().await;
            doc.save_atomic(&ws.path)?;
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = false;
        }
        Ok(ws.snapshot().await)
    }

    pub async fn ensure_kernel(
        &self,
        ws: &Arc<NotebookWorkspace>,
        project_root: Option<&Path>,
        requested_kernel_id: Option<&str>,
    ) -> Result<(), String> {
        if let Some(kid) = requested_kernel_id {
            *ws.selected_kernel_id
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = Some(kid.to_string());
        }
        let chosen_id = ws
            .selected_kernel_id
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();

        {
            let guard = ws.kernel.lock().await;
            if let Some(active) = guard.as_ref() {
                if chosen_id
                    .as_deref()
                    .is_none_or(|wanted| active.spec().id == wanted || active.spec().name == wanted)
                {
                    return Ok(());
                }
            }
        }

        let (pref_name, lang) = {
            let doc = ws.doc.lock().await;
            (doc.preferred_kernelspec(), doc.language())
        };
        let available = self.list_kernels(project_root);
        let spec = select_default_kernel(
            &available,
            chosen_id.as_deref().or(pref_name.as_deref()),
            &lang,
        )
        .ok_or_else(|| "aucun noyau Python ou Jupyter détecté sur cette machine".to_string())?;

        let nb_path_str = ws.path.display().to_string();
        self.emit(NotebookPushEvent::KernelStatus {
            path: nb_path_str.clone(),
            status: NotebookKernelStatus {
                state: "starting".into(),
                kernel_id: Some(spec.id.clone()),
                display_name: Some(spec.display_name.clone()),
                language: Some(spec.language.clone()),
                backend: Some(spec.backend.clone()),
                ..Default::default()
            },
        });

        let cwd = ws
            .path
            .parent()
            .or(project_root)
            .unwrap_or_else(|| Path::new("."));
        let listener = self
            .listener
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        let weak = Arc::downgrade(ws);

        let started = match spec.backend {
            KernelBackendKind::ZmqKernelspec => {
                let h = ZmqKernelHandle::spawn_process(
                    spec,
                    cwd,
                    &self.runtime_dir,
                    &nb_path_str,
                    weak,
                    listener,
                )
                .await?;
                RunningBackend::Zmq(h)
            }
            KernelBackendKind::AtelierPythonFallback => {
                let h = FallbackPythonHandle::spawn(
                    spec,
                    cwd,
                    &self.runtime_dir,
                    &nb_path_str,
                    weak,
                    listener,
                )
                .await?;
                RunningBackend::Fallback(h)
            }
        };

        let mut guard = ws.kernel.lock().await;
        if let Some(old) = guard.take() {
            old.shutdown().await;
        }
        *guard = Some(started);
        drop(guard);

        self.emit(NotebookPushEvent::KernelStatus {
            path: nb_path_str,
            status: ws.status(),
        });
        Ok(())
    }

    pub async fn restart_kernel(
        &self,
        path: &Path,
        project_root: Option<&Path>,
        kernel_id: Option<&str>,
    ) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        {
            let mut guard = ws.kernel.lock().await;
            if let Some(old) = guard.take() {
                old.shutdown().await;
            }
        }
        ws.variables.lock().unwrap_or_else(|e| e.into_inner()).clear();
        self.ensure_kernel(&ws, project_root, kernel_id).await?;
        Ok(ws.snapshot().await)
    }

    pub async fn stop_kernel(&self, path: &Path) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        {
            let mut guard = ws.kernel.lock().await;
            if let Some(old) = guard.take() {
                old.shutdown().await;
            }
        }
        *ws.busy_cell.lock().unwrap_or_else(|e| e.into_inner()) = None;
        ws.variables.lock().unwrap_or_else(|e| e.into_inner()).clear();
        self.emit(NotebookPushEvent::KernelStatus {
            path: ws.path.display().to_string(),
            status: NotebookKernelStatus::default(),
        });
        Ok(ws.snapshot().await)
    }

    pub async fn interrupt(&self, path: &Path) -> Result<(), String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let guard = ws.kernel.lock().await;
        if let Some(k) = guard.as_ref() {
            k.interrupt().await?;
        }
        Ok(())
    }

    /// Exécute une cellule de code et rafraîchit silencieusement la table des variables en mémoire.
    pub async fn run_cell(
        &self,
        path: &Path,
        project_root: Option<&Path>,
        cell_id: &str,
        override_source: Option<String>,
    ) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let _gate = ws.exec_gate.lock().await;
        self.ensure_kernel(&ws, project_root, None).await?;

        let (resolved_id, code) = {
            let mut doc = ws.doc.lock().await;
            let idx = doc
                .find_cell_index(cell_id)
                .ok_or_else(|| format!("cellule `{cell_id}` introuvable"))?;
            if doc.cells[idx].cell_type != CellKind::Code {
                return Ok(ws.snapshot().await);
            }
            if let Some(src) = override_source {
                doc.cells[idx].source = src;
            }
            doc.cells[idx].outputs.clear();
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = true;
            let cid = doc.cells[idx].id.clone();
            let src = doc.cells[idx].source.clone();
            let ui = doc.cells[idx].to_ui(idx + 1);
            self.emit(NotebookPushEvent::CellUpdated {
                path: ws.path.display().to_string(),
                cell: ui,
                running: true,
            });
            (cid, src)
        };

        *ws.busy_cell.lock().unwrap_or_else(|e| e.into_inner()) = Some(resolved_id.clone());
        self.emit(NotebookPushEvent::KernelStatus {
            path: ws.path.display().to_string(),
            status: ws.status(),
        });

        let exec_res = {
            let guard = ws.kernel.lock().await;
            match guard.as_ref() {
                Some(k) => k.execute_cell(&resolved_id, &code).await,
                None => Err("noyau arrêté".into()),
            }
        };

        *ws.busy_cell.lock().unwrap_or_else(|e| e.into_inner()) = None;

        if let Ok(Some(count)) = exec_res {
            let mut doc = ws.doc.lock().await;
            if let Some(idx) = doc.cells.iter().position(|c| c.id == resolved_id) {
                doc.cells[idx].execution_count = Some(count);
                let ui = doc.cells[idx].to_ui(idx + 1);
                self.emit(NotebookPushEvent::CellUpdated {
                    path: ws.path.display().to_string(),
                    cell: ui,
                    running: false,
                });
            }
        } else if let Err(ref e) = exec_res {
            let mut doc = ws.doc.lock().await;
            if let Some(idx) = doc.cells.iter().position(|c| c.id == resolved_id) {
                doc.cells[idx].outputs.push(CellOutput::Error {
                    ename: "KernelError".into(),
                    evalue: e.clone(),
                    traceback: vec![e.clone()],
                });
                let ui = doc.cells[idx].to_ui(idx + 1);
                self.emit(NotebookPushEvent::CellUpdated {
                    path: ws.path.display().to_string(),
                    cell: ui,
                    running: false,
                });
            }
        }

        // Rafraîchissement des variables en mémoire vive.
        let vars = {
            let guard = ws.kernel.lock().await;
            match guard.as_ref() {
                Some(k) => k.fetch_variables().await,
                None => Vec::new(),
            }
        };
        *ws.variables.lock().unwrap_or_else(|e| e.into_inner()) = vars.clone();
        self.emit(NotebookPushEvent::VariablesUpdated {
            path: ws.path.display().to_string(),
            variables: vars,
        });
        self.emit(NotebookPushEvent::KernelStatus {
            path: ws.path.display().to_string(),
            status: ws.status(),
        });

        exec_res?;
        Ok(ws.snapshot().await)
    }

    pub async fn run_all(
        &self,
        path: &Path,
        project_root: Option<&Path>,
    ) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let code_ids: Vec<String> = {
            let doc = ws.doc.lock().await;
            doc.cells
                .iter()
                .filter(|c| c.cell_type == CellKind::Code && !c.source.trim().is_empty())
                .map(|c| c.id.clone())
                .collect()
        };
        for cid in code_ids {
            let snap = self.run_cell(path, project_root, &cid, None).await?;
            // Arrêt à la première cellule en erreur, comme « Run All » standard de Jupyter.
            let had_error = snap
                .cells
                .iter()
                .find(|c| c.id == cid)
                .is_some_and(|c| c.outputs.iter().any(|o| matches!(o, crate::nbformat::UiOutput::Error { .. })));
            if had_error {
                return Ok(snap);
            }
        }
        Ok(ws.snapshot().await)
    }

    pub async fn update_cell_source(
        &self,
        path: &Path,
        cell_id: &str,
        source: String,
        cell_type: Option<CellKind>,
    ) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        {
            let mut doc = ws.doc.lock().await;
            let idx = doc
                .find_cell_index(cell_id)
                .ok_or_else(|| format!("cellule `{cell_id}` introuvable"))?;
            doc.cells[idx].source = source;
            if let Some(kind) = cell_type {
                doc.cells[idx].cell_type = kind;
                if kind != CellKind::Code {
                    doc.cells[idx].outputs.clear();
                    doc.cells[idx].execution_count = None;
                }
            }
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = true;
        }
        Ok(ws.snapshot().await)
    }

    pub async fn insert_cell(
        &self,
        path: &Path,
        after_cell_id: Option<&str>,
        cell_type: CellKind,
        source: String,
    ) -> Result<(String, NotebookSnapshot), String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let new_id = {
            let mut doc = ws.doc.lock().await;
            let pos = match after_cell_id {
                Some(id) if !id.is_empty() => doc
                    .find_cell_index(id)
                    .map(|i| i + 1)
                    .unwrap_or(doc.cells.len()),
                _ => doc.cells.len(),
            };
            let id = make_cell_id(
                &format!("{}:{}:{}", doc.cells.len(), Instant::now().elapsed().as_nanos(), source),
                pos,
            );
            doc.cells.insert(
                pos,
                NotebookCell {
                    id: id.clone(),
                    cell_type,
                    source,
                    metadata: Map::new(),
                    execution_count: None,
                    outputs: Vec::new(),
                    extra: Map::new(),
                },
            );
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = true;
            id
        };
        Ok((new_id, ws.snapshot().await))
    }

    pub async fn delete_cell(&self, path: &Path, cell_id: &str) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        {
            let mut doc = ws.doc.lock().await;
            if doc.cells.len() <= 1 {
                return Err("un cahier conserve au moins une cellule".into());
            }
            let idx = doc
                .find_cell_index(cell_id)
                .ok_or_else(|| format!("cellule `{cell_id}` introuvable"))?;
            let removed = doc.cells.remove(idx);
            ws.proposals
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .retain(|p| p.target_cell_id != removed.id);
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = true;
        }
        Ok(ws.snapshot().await)
    }

    pub async fn add_proposal(
        &self,
        path: &Path,
        proposal: CellProposal,
    ) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let revision = ws.doc.lock().await.revision();
        let proposals = {
            let mut list = ws.proposals.lock().unwrap_or_else(|e| e.into_inner());
            // Remplace une proposition précédente de même nature sur la même cellule cible.
            if proposal.kind == crate::proposals::ProposalKind::Edit {
                list.retain(|p| {
                    !(p.kind == crate::proposals::ProposalKind::Edit
                        && p.target_cell_id == proposal.target_cell_id)
                });
            }
            list.push(proposal);
            list.clone()
        };
        self.emit(NotebookPushEvent::ProposalsUpdated {
            path: ws.path.display().to_string(),
            proposals,
            revision,
        });
        Ok(ws.snapshot().await)
    }

    pub async fn accept_proposal(
        &self,
        path: &Path,
        project_root: Option<&Path>,
        proposal_id: &str,
        run_after: bool,
    ) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let proposal = {
            let mut list = ws.proposals.lock().unwrap_or_else(|e| e.into_inner());
            let pos = list
                .iter()
                .position(|p| p.id == proposal_id)
                .ok_or_else(|| "proposition introuvable ou déjà traitée".to_string())?;
            list.remove(pos)
        };

        let affected_cell_id = {
            let mut doc = ws.doc.lock().await;
            let cid = proposal
                .apply_to(&mut doc)
                .ok_or_else(|| "cellule cible introuvable dans le cahier".to_string())?;
            doc.save_atomic(&ws.path).map_err(|e| e.to_string())?;
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = false;
            cid
        };

        let revision = ws.doc.lock().await.revision();
        let remaining = ws
            .proposals
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        self.emit(NotebookPushEvent::ProposalsUpdated {
            path: ws.path.display().to_string(),
            proposals: remaining,
            revision,
        });

        if run_after && proposal.cell_type == CellKind::Code {
            self.run_cell(path, project_root, &affected_cell_id, None)
                .await?;
            return self.save(path).await.map_err(|e| e.to_string());
        }
        Ok(ws.snapshot().await)
    }

    pub async fn discard_proposal(
        &self,
        path: &Path,
        proposal_id: &str,
    ) -> Result<NotebookSnapshot, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        {
            let mut list = ws.proposals.lock().unwrap_or_else(|e| e.into_inner());
            list.retain(|p| p.id != proposal_id);
        }
        let revision = ws.doc.lock().await.revision();
        let remaining = ws
            .proposals
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        self.emit(NotebookPushEvent::ProposalsUpdated {
            path: ws.path.display().to_string(),
            proposals: remaining,
            revision,
        });
        Ok(ws.snapshot().await)
    }

    pub async fn complete(
        &self,
        path: &Path,
        code: &str,
        cursor_pos: usize,
    ) -> Result<Value, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let guard = ws.kernel.lock().await;
        if let Some(RunningBackend::Zmq(zmq)) = guard.as_ref() {
            zmq.complete(code, cursor_pos).await
        } else {
            Ok(json!({ "matches": [], "cursorStart": cursor_pos, "cursorEnd": cursor_pos }))
        }
    }

    pub async fn inspect(
        &self,
        path: &Path,
        code: &str,
        cursor_pos: usize,
    ) -> Result<Value, String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let guard = ws.kernel.lock().await;
        if let Some(RunningBackend::Zmq(zmq)) = guard.as_ref() {
            zmq.inspect(code, cursor_pos).await
        } else {
            Ok(json!({ "found": false, "docstring": "" }))
        }
    }

    /// Compare le cahier actuel en mémoire contre le contenu `HEAD` (fourni par Git).
    pub async fn diff_against_str(
        &self,
        path: &Path,
        base_ipynb_raw: &str,
    ) -> Result<Vec<CellDiffEntry>, String> {
        let base_doc = NotebookDocument::parse_str(base_ipynb_raw).map_err(|e| e.to_string())?;
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let doc = ws.doc.lock().await;
        Ok(diff_notebooks(&base_doc, &doc))
    }

    pub async fn shutdown_all(&self) {
        let list: Vec<Arc<NotebookWorkspace>> =
            self.workspaces.lock().await.values().cloned().collect();
        for ws in list {
            if let Some(k) = ws.kernel.lock().await.take() {
                k.shutdown().await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    /// Pair Jupyter 5 sockets complet en mémoire (ROUTER shell, PUB iopub, ROUTER stdin, ROUTER control, REP hb)
    /// validant tout le protocole ZMTP 3.x + HMAC-SHA256 + `update_display_data` + `complete_request` + `user_expressions`.
    #[tokio::test]
    async fn full_five_channel_zmq_kernel_protocol_execution_and_completion() {
        let shell_l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let iopub_l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let stdin_l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let ctrl_l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let hb_l = TcpListener::bind("127.0.0.1:0").await.unwrap();

        let key = "0123456789abcdef0123456789abcdef";
        let conn = ConnectionFile {
            transport: "tcp".into(),
            ip: "127.0.0.1".into(),
            shell_port: shell_l.local_addr().unwrap().port(),
            iopub_port: iopub_l.local_addr().unwrap().port(),
            stdin_port: stdin_l.local_addr().unwrap().port(),
            control_port: ctrl_l.local_addr().unwrap().port(),
            hb_port: hb_l.local_addr().unwrap().port(),
            signature_scheme: "hmac-sha256".into(),
            key: key.into(),
            kernel_name: Some("pymc-albedo".into()),
        };

        let key_bytes = key.as_bytes().to_vec();
        tokio::spawn(async move {
            let accept_and_handshake = |listener: TcpListener, kind: ZmqSocketType| async move {
                let (tcp, _) = listener.accept().await.unwrap();
                ZmtpSocket::from_accepted(tcp, kind, None).await.unwrap()
            };
            let (mut shell, mut iopub, _stdin, _ctrl, _hb) = tokio::join!(
                accept_and_handshake(shell_l, ZmqSocketType::Router),
                accept_and_handshake(iopub_l, ZmqSocketType::Pub),
                accept_and_handshake(stdin_l, ZmqSocketType::Router),
                accept_and_handshake(ctrl_l, ZmqSocketType::Router),
                accept_and_handshake(hb_l, ZmqSocketType::Rep),
            );

            // Lit l'abonnement SUB initial (0x01)
            let _ = iopub.recv_multipart().await;

            while let Ok(frames) = shell.recv_multipart().await {
                let req = JupyterMessage::decode(&frames, &key_bytes).unwrap();
                match req.msg_type() {
                    "kernel_info_request" => {
                        let mut rep = JupyterMessage::new_request(
                            "srv",
                            "kernel_info_reply",
                            json!({"status": "ok", "protocol_version": "5.3"}),
                        );
                        rep.identities = req.identities.clone();
                        rep.parent_header = req.header.clone();
                        shell.send_multipart(&rep.encode(&key_bytes)).await.unwrap();
                    }
                    "complete_request" => {
                        let mut rep = JupyterMessage::new_request(
                            "srv",
                            "complete_reply",
                            json!({"status": "ok", "matches": ["sample", "StudentT"], "cursor_start": 3, "cursor_end": 4}),
                        );
                        rep.identities = req.identities.clone();
                        rep.parent_header = req.header.clone();
                        shell.send_multipart(&rep.encode(&key_bytes)).await.unwrap();
                    }
                    "execute_request" => {
                        let silent = req.content["silent"].as_bool().unwrap_or(false);
                        if silent {
                            let mut rep = JupyterMessage::new_request(
                                "srv",
                                "execute_reply",
                                json!({
                                    "status": "ok",
                                    "execution_count": 1,
                                    "user_expressions": {
                                        "_atelier_vars": {
                                            "status": "ok",
                                            "data": { "text/plain": "[{\"name\":\"beta_intra\",\"type\":\"ndarray\",\"shape\":\"4 × 2000\",\"sizeBytes\":64000,\"preview\":\"array([-0.031])\"}]" }
                                        }
                                    }
                                }),
                            );
                            rep.identities = req.identities.clone();
                            rep.parent_header = req.header.clone();
                            shell.send_multipart(&rep.encode(&key_bytes)).await.unwrap();
                            continue;
                        }

                        // Diffusion `iopub` : busy -> display_data -> update_display_data -> execute_result -> idle
                        for (mtype, payload) in [
                            ("status", json!({"execution_state": "busy"})),
                            (
                                "display_data",
                                json!({"data": {"text/plain": "0%"}, "metadata": {}, "transient": {"display_id": "pbar-1"}}),
                            ),
                            (
                                "update_display_data",
                                json!({"data": {"text/plain": "100% (12 000/12 000)"}, "metadata": {}, "transient": {"display_id": "pbar-1"}}),
                            ),
                            (
                                "execute_result",
                                json!({"execution_count": 1, "data": {"text/plain": "-0.031", "text/html": "<table><tr><td>-0.031</td></tr></table>"}, "metadata": {}}),
                            ),
                            ("status", json!({"execution_state": "idle"})),
                        ] {
                            let mut pub_msg = JupyterMessage::new_request("srv", mtype, payload);
                            pub_msg.identities = vec![mtype.as_bytes().to_vec()];
                            pub_msg.parent_header = req.header.clone();
                            iopub
                                .send_multipart(&pub_msg.encode(&key_bytes))
                                .await
                                .unwrap();
                        }

                        let mut rep = JupyterMessage::new_request(
                            "srv",
                            "execute_reply",
                            json!({"status": "ok", "execution_count": 1}),
                        );
                        rep.identities = req.identities.clone();
                        rep.parent_header = req.header.clone();
                        shell.send_multipart(&rep.encode(&key_bytes)).await.unwrap();
                    }
                    _ => {}
                }
            }
        });

        let tmp = tempfile::tempdir().unwrap();
        let nb_file = tmp.path().join("test.ipynb");
        std::fs::write(
            &nb_file,
            r#"{"nbformat":4,"nbformat_minor":5,"metadata":{},"cells":[{"id":"c1","cell_type":"code","source":["pm.sample()"],"outputs":[]}]}"#,
        )
        .unwrap();

        let doc = NotebookDocument::open(&nb_file).unwrap();
        let ws = Arc::new(NotebookWorkspace {
            path: nb_file.clone(),
            doc: AsyncMutex::new(doc),
            unsaved: Mutex::new(false),
            proposals: Mutex::new(Vec::new()),
            kernel: AsyncMutex::new(None),
            exec_gate: AsyncMutex::new(()),
            busy_cell: Mutex::new(None),
            variables: Mutex::new(Vec::new()),
            selected_kernel_id: Mutex::new(None),
        });

        let spec = DiscoveredKernel {
            id: "zmq:test".into(),
            name: "pymc-albedo".into(),
            display_name: "pymc-albedo".into(),
            language: "python".into(),
            source: "Pixi · ZMQ".into(),
            backend: KernelBackendKind::ZmqKernelspec,
            argv: vec![],
            env_vars: HashMap::new(),
            prefix: None,
            python_executable: None,
        };

        let handle = ZmqKernelHandle::connect_to_endpoints(
            spec,
            &conn,
            None,
            None,
            None,
            &nb_file.display().to_string(),
            Arc::downgrade(&ws),
            None,
            Duration::from_secs(5),
        )
        .await
        .unwrap();

        // 1. Autocomplétion ZMQ
        let comp = handle.complete("pm.s", 4).await.unwrap();
        assert_eq!(comp["matches"][0], "sample");

        // 2. Exécution cellule + fusion in-place de `update_display_data`
        let count = handle.execute_cell("c1", "pm.sample()").await.unwrap();
        assert_eq!(count, Some(1));

        let snap = ws.snapshot().await;
        assert_eq!(snap.cells[0].outputs.len(), 2);
        match &snap.cells[0].outputs[0] {
            crate::nbformat::UiOutput::Data { text_plain, .. } => {
                assert_eq!(text_plain.as_deref(), Some("100% (12 000/12 000)"));
            }
            other => panic!("attendu Data progress mis à jour, reçu {other:?}"),
        }

        // 3. Inspection silencieuse des variables (`user_expressions`)
        let vars = handle.fetch_variables().await;
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0].name, "beta_intra");
        assert_eq!(vars[0].shape, "4 × 2000");
    }

    #[tokio::test]
    async fn notebook_manager_executes_cells_and_applies_inline_proposals_end_to_end() {
        let tmp = tempfile::tempdir().unwrap();
        let nb_path = tmp.path().join("albedo.ipynb");
        std::fs::write(
            &nb_path,
            r#"{
  "nbformat": 4,
  "nbformat_minor": 5,
  "metadata": {},
  "cells": [
    {"id": "c1", "cell_type": "code", "source": ["base_val = 40\n"], "outputs": []},
    {"id": "c2", "cell_type": "code", "source": ["base_val + 2\n"], "outputs": []}
  ]
}"#,
        )
        .unwrap();

        let mgr = NotebookManager::new(
            tmp.path().join("rt"),
            tmp.path().join("ak"),
            tmp.path().to_path_buf(),
        );
        let snap = mgr.run_all(&nb_path, Some(tmp.path())).await.unwrap();
        assert_eq!(snap.cells[1].execution_count, Some(2));
        assert!(snap.variables.iter().any(|v| v.name == "base_val"));

        // Propose une révision inline sur c2 qui utilise `base_val` défini en amont [1]
        let ws = mgr.get_or_open(&nb_path).await.unwrap();
        let prop = {
            let doc = ws.doc.lock().await;
            CellProposal::build_edit(
                &doc,
                1,
                "result_val = base_val * 3\nresult_val\n".into(),
                "Multiplier par 3".into(),
                "Claude".into(),
            )
            .unwrap()
        };
        let prop_id = prop.id.clone();
        mgr.add_proposal(&nb_path, prop).await.unwrap();

        let accepted = mgr
            .accept_proposal(&nb_path, Some(tmp.path()), &prop_id, true)
            .await
            .unwrap();
        assert!(accepted.proposals.is_empty());
        assert!(!accepted.unsaved);
        assert!(accepted.variables.iter().any(|v| v.name == "result_val"));
        mgr.shutdown_all().await;
    }
}
