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
use crate::wire::{ConnectionFile, JupyterMessage, LiveVariable, PYTHON_VARIABLES_EXPR};
use crate::zmtp::{ZmqSocketType, ZmtpSocket, ZmtpWriter};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::net::TcpListener as StdTcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::OwnedWriteHalf;
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex as AsyncMutex};

/// Événement poussé vers le frontend WebSocket lorsqu'un cahier évolue en direct.
#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "event",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
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
    /// Une exécution lancée en arrière-plan a échoué (aucun noyau, démarrage
    /// impossible, noyau mort…).
    RunFailed {
        path: String,
        message: String,
    },
    /// Le code a appelé `input()` : l'onglet affiche une case de saisie.
    InputRequested {
        path: String,
        cell_id: String,
        prompt: String,
        password: bool,
    },
    InputCleared {
        path: String,
    },
    /// Le fichier a été modifié hors d'Atelier alors que l'onglet a des
    /// changements non enregistrés (sinon il est rechargé tout seul).
    DiskChanged {
        path: String,
        changed: bool,
    },
    /// Le cahier a été relu depuis le disque (modification externe sans
    /// changement local, ou rechargement demandé).
    SnapshotReplaced {
        path: String,
        snapshot: Box<NotebookSnapshot>,
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
    /// Noyau mort sans qu'on l'ait arrêté (`state == "dead"`) : code de
    /// sortie, ou signal (9 = tué, souvent par manque de mémoire).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_signal: Option<i32>,
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
            exit_code: None,
            exit_signal: None,
        }
    }
}

/// Copie de secours trouvée à l'ouverture (changements non enregistrés d'une
/// session précédente, plantage ou fermeture forcée).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryInfo {
    pub saved_at_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputRequest {
    pub cell_id: String,
    pub prompt: String,
    pub password: bool,
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
    /// Le fichier a changé sur le disque depuis l'ouverture alors que
    /// l'onglet a des changements à lui : Enregistrer l'écraserait.
    pub disk_changed: bool,
    pub recovery: Option<RecoveryInfo>,
    pub pending_input: Option<InputRequest>,
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
    /// En-tête du dernier `input_request` (la réponse doit le citer).
    input_parent: Mutex<Option<Value>>,
}

pub struct ZmqKernelHandle {
    pub spec: DiscoveredKernel,
    pub pid: Option<u32>,
    session_id: String,
    hmac_key: Vec<u8>,
    conn_path: Option<PathBuf>,
    shell_tx: AsyncMutex<ZmtpWriter<OwnedWriteHalf>>,
    control_tx: AsyncMutex<ZmtpWriter<OwnedWriteHalf>>,
    stdin_tx: AsyncMutex<ZmtpWriter<OwnedWriteHalf>>,
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
        std::fs::create_dir_all(runtime_dir).map_err(|e| format!("dossier runtime ZMQ : {e}"))?;
        let ports = pick_ephemeral_ports().map_err(|e| format!("allocation ports ZMQ : {e}"))?;
        // Clé HMAC aléatoire (uuid v4, comme jupyter_client) : dérivée du pid
        // et du chemin, elle se devinait, et tout processus local pouvait
        // alors exécuter du code dans le noyau via ses ports TCP.
        let key = uuid::Uuid::new_v4().simple().to_string();
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

        let conn_path =
            runtime_dir.join(format!("kernel-{}.json", &sha256_hex(key.as_bytes())[..12]));
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
            // ipykernel surveille ce parent et s'arrête s'il disparaît : un
            // serveur Atelier tué ne laisse pas de noyau orphelin.
            .env("JPY_PARENT_PID", std::process::id().to_string())
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

        let (shell, iopub, stdin, control, mut hb) = tokio::try_join!(
            connect_retry(conn.shell_addr(), ZmqSocketType::Dealer, true),
            connect_retry(conn.iopub_addr(), ZmqSocketType::Sub, false),
            connect_retry(conn.stdin_addr(), ZmqSocketType::Dealer, true),
            connect_retry(conn.control_addr(), ZmqSocketType::Dealer, true),
            connect_retry(conn.hb_addr(), ZmqSocketType::Req, false),
        )?;

        let (mut shell_rx, shell_tx) = shell.into_split();
        // La moitié écriture d'`iopub` (et le socket `stdin`) doivent vivre aussi
        // longtemps que la lecture : les lâcher ici envoyait un FIN TCP, et
        // libzmq refermait alors le canal `iopub` après le premier message —
        // plus aucune sortie avec un vrai ipykernel.
        let (mut iopub_rx, iopub_tx) = iopub.into_split();
        let (mut control_rx, control_tx) = control.into_split();
        let (mut stdin_rx, stdin_tx) = stdin.into_split();

        let hmac_key = conn.key.as_bytes().to_vec();
        let shared = Arc::new(ZmqShared {
            active_exec: Mutex::new(None),
            shell_waiters: Mutex::new(HashMap::new()),
            busy: Mutex::new(false),
            input_parent: Mutex::new(None),
        });

        // Tâche de lecture `stdin` : `input()` dans une cellule envoie un
        // `input_request` ; l'onglet affiche une case et répond par
        // `input_reply` (sans elle, la cellule attendait sans fin).
        {
            let shared_stdin = Arc::clone(&shared);
            let key_stdin = hmac_key.clone();
            let ws_stdin = workspace.clone();
            let cb_stdin = listener.clone();
            let nb_path_stdin = notebook_path.to_string();
            tokio::spawn(async move {
                while let Ok(frames) = stdin_rx.recv_multipart().await {
                    let Ok(msg) = JupyterMessage::decode(&frames, &key_stdin) else {
                        continue;
                    };
                    if msg.msg_type() != "input_request" {
                        continue;
                    }
                    let cell_id = shared_stdin
                        .active_exec
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .as_ref()
                        .map(|p| p.cell_id.clone())
                        .unwrap_or_default();
                    *shared_stdin
                        .input_parent
                        .lock()
                        .unwrap_or_else(|e| e.into_inner()) = Some(msg.header.clone());
                    let req = InputRequest {
                        cell_id,
                        prompt: msg
                            .content
                            .get("prompt")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        password: msg
                            .content
                            .get("password")
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                    };
                    if let Some(ws) = ws_stdin.upgrade() {
                        *ws.pending_input.lock().unwrap_or_else(|e| e.into_inner()) =
                            Some(req.clone());
                    }
                    if let Some(cb) = &cb_stdin {
                        cb(NotebookPushEvent::InputRequested {
                            path: nb_path_stdin.clone(),
                            cell_id: req.cell_id,
                            prompt: req.prompt,
                            password: req.password,
                        });
                    }
                }
            });
        }

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
                // Canal fermé (noyau mort, tué par manque de mémoire…) : lâcher
                // les attentes, sinon la cellule restait « en cours » à jamais.
                shared_shell
                    .shell_waiters
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clear();
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
                let _garde_connexion = iopub_tx;
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

                    let found = {
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
                            true
                        } else {
                            false
                        }
                    };
                    if found {
                        ws_arc.mark_dirty();
                        // Regroupé : une boucle de `print` envoyait toute la
                        // cellule à l'écran à chaque ligne.
                        ws_arc.queue_cell_push(&nb_path, &cell_id, cb.clone());
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
            stdin_tx: AsyncMutex::new(stdin_tx),
            shared,
            child: AsyncMutex::new(child),
        });

        // Vérification `kernel_info_request` (confirme que le noyau répond sur `shell`).
        let _ = tokio::time::timeout(
            Duration::from_secs(15),
            handle.request_shell("kernel_info_request", json!({})),
        )
        .await
        .map_err(|_| "délai dépassé en attente de kernel_info_reply".to_string())??;

        Ok(handle)
    }

    pub async fn request_shell(
        &self,
        msg_type: &str,
        content: Value,
    ) -> Result<JupyterMessage, String> {
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
                "allow_stdin": true,
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

    /// Répond au dernier `input()` de la cellule en cours.
    pub async fn reply_input(&self, value: &str) -> Result<(), String> {
        let parent = self
            .shared
            .input_parent
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
            .ok_or_else(|| "aucune saisie demandée".to_string())?;
        let mut reply =
            JupyterMessage::new_request(&self.session_id, "input_reply", json!({ "value": value }));
        reply.parent_header = parent;
        let frames = reply.encode(&self.hmac_key);
        self.stdin_tx
            .lock()
            .await
            .send_multipart(&frames)
            .await
            .map_err(|e| format!("envoi input_reply : {e}"))
    }

    pub async fn interrupt(&self) -> Result<(), String> {
        // Comme jupyter_client : un signal pour un noyau local (interrupt_mode
        // « signal », le défaut d'ipykernel), le message `interrupt_request`
        // seulement sans processus à signaler. Les deux ensemble levaient deux
        // KeyboardInterrupt et la cellule ne rendait jamais la main.
        #[cfg(unix)]
        if let Some(pid) = self.pid {
            unsafe {
                let _ = libc::kill(-(pid as i32), libc::SIGINT);
            }
            return Ok(());
        }
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
                            let found = {
                                let mut doc = ws.doc.lock().await;
                                if let Some(idx) = doc.cells.iter().position(|c| c.id == cid) {
                                    doc.cells[idx].apply_iopub_output(
                                        "stream",
                                        &json!({ "name": name, "text": text }),
                                        None,
                                    );
                                    true
                                } else {
                                    false
                                }
                            };
                            if found {
                                ws.mark_dirty();
                                ws.queue_cell_push(&nb_path, &cid, listener.clone());
                            }
                        }
                    }
                    "done" => {
                        let finished = pending_loop
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .take();
                        if let Some(fin) = finished {
                            if let Some(ws) = workspace.upgrade() {
                                let mut doc = ws.doc.lock().await;
                                if let Some(idx) =
                                    doc.cells.iter().position(|c| c.id == fin.cell_id)
                                {
                                    doc.cells[idx].execution_count = Some(fin.seq);
                                    if let Some(res) = val
                                        .get("result")
                                        .and_then(Value::as_str)
                                        .filter(|s| !s.is_empty())
                                    {
                                        let mut data = Map::new();
                                        data.insert(
                                            "text/plain".into(),
                                            Value::String(res.to_string()),
                                        );
                                        doc.cells[idx].outputs.push(CellOutput::ExecuteResult {
                                            execution_count: Some(fin.seq),
                                            data,
                                            metadata: Map::new(),
                                        });
                                    }
                                    if let Some(figs) = val.get("figures").and_then(Value::as_array)
                                    {
                                        for fp in figs.iter().filter_map(Value::as_str) {
                                            if let Ok(bytes) = std::fs::read(fp) {
                                                let b64 = base64_encode(&bytes);
                                                let mut data = Map::new();
                                                data.insert("image/png".into(), Value::String(b64));
                                                doc.cells[idx].outputs.push(
                                                    CellOutput::DisplayData {
                                                        data,
                                                        metadata: Map::new(),
                                                        display_id: None,
                                                    },
                                                );
                                            }
                                        }
                                    }
                                    if let Some(err_obj) =
                                        val.get("error").filter(|v| v.is_object())
                                    {
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
                                    ws.mark_dirty();
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

#[derive(Clone)]
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

    pub async fn reply_input(&self, value: &str) -> Result<(), String> {
        match self {
            Self::Zmq(h) => h.reply_input(value).await,
            Self::Fallback(_) => Err("input() demande un noyau ipykernel".into()),
        }
    }

    /// Même noyau (même processus) que `other`.
    pub fn same(&self, other: &RunningBackend) -> bool {
        match (self, other) {
            (Self::Zmq(a), Self::Zmq(b)) => Arc::ptr_eq(a, b),
            (Self::Fallback(a), Self::Fallback(b)) => Arc::ptr_eq(a, b),
            _ => false,
        }
    }

    /// Statut de sortie si le processus du noyau s'est terminé tout seul
    /// (plantage, `os._exit`, tué par le système faute de mémoire).
    pub fn exit_status(&self) -> Option<std::process::ExitStatus> {
        let child = match self {
            Self::Zmq(h) => &h.child,
            Self::Fallback(h) => &h.child,
        };
        let mut guard = child.try_lock().ok()?;
        guard.as_mut()?.try_wait().ok().flatten()
    }
}

/// Empreinte du fichier sur le disque, prise à l'ouverture et à chaque
/// enregistrement, pour repérer une modification faite hors d'Atelier.
#[derive(Debug, Clone)]
struct DiskSig {
    len: u64,
    mtime: Option<SystemTime>,
    sha: String,
}

fn read_disk_sig(path: &Path) -> Option<DiskSig> {
    let meta = std::fs::metadata(path).ok()?;
    let bytes = std::fs::read(path).ok()?;
    Some(DiskSig {
        len: meta.len(),
        mtime: meta.modified().ok(),
        sha: sha256_hex(&bytes),
    })
}

#[derive(Default)]
struct UiPush {
    dirty: Vec<String>,
    scheduled: bool,
}

/// Les sorties d'une cellule partent à l'écran au plus toutes les 80 ms.
const UI_PUSH_INTERVAL: Duration = Duration::from_millis(80);
/// Copie de secours écrite au plus toutes les 10 s.
const RECOVERY_INTERVAL: Duration = Duration::from_secs(10);

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
    /// Dernière activité (ouverture du noyau, exécution) : sert à arrêter
    /// les noyaux inactifs, comme le noyau Python des fils.
    pub last_activity: Mutex<Instant>,
    /// Compteur de modifications (chaque `mark_dirty`) : la copie de secours
    /// n'est réécrite que s'il a bougé.
    edit_seq: AtomicU64,
    backup: Mutex<(u64, Option<Instant>)>,
    disk_sig: Mutex<Option<DiskSig>>,
    disk_changed: Mutex<bool>,
    recovery: Mutex<Option<RecoveryInfo>>,
    pub pending_input: Mutex<Option<InputRequest>>,
    /// (code de sortie, signal) du noyau mort tout seul.
    kernel_death: Mutex<Option<(Option<i32>, Option<i32>)>>,
    ui_push: Mutex<UiPush>,
}

type WeakWorkspace = std::sync::Weak<NotebookWorkspace>;

impl NotebookWorkspace {
    pub fn new(path: PathBuf, doc: NotebookDocument) -> Self {
        let disk_sig = read_disk_sig(&path);
        Self {
            path,
            doc: AsyncMutex::new(doc),
            unsaved: Mutex::new(false),
            proposals: Mutex::new(Vec::new()),
            kernel: AsyncMutex::new(None),
            exec_gate: AsyncMutex::new(()),
            busy_cell: Mutex::new(None),
            variables: Mutex::new(Vec::new()),
            selected_kernel_id: Mutex::new(None),
            last_activity: Mutex::new(Instant::now()),
            edit_seq: AtomicU64::new(0),
            backup: Mutex::new((0, None)),
            disk_sig: Mutex::new(disk_sig),
            disk_changed: Mutex::new(false),
            recovery: Mutex::new(None),
            pending_input: Mutex::new(None),
            kernel_death: Mutex::new(None),
            ui_push: Mutex::new(UiPush::default()),
        }
    }

    /// Le document en mémoire diffère maintenant du fichier.
    pub fn mark_dirty(&self) {
        *self.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = true;
        self.edit_seq.fetch_add(1, Ordering::Relaxed);
    }

    fn is_unsaved(&self) -> bool {
        *self.unsaved.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn record_disk_sig(&self) {
        *self.disk_sig.lock().unwrap_or_else(|e| e.into_inner()) = read_disk_sig(&self.path);
        *self.disk_changed.lock().unwrap_or_else(|e| e.into_inner()) = false;
    }

    /// Le fichier a-t-il changé sur le disque depuis la dernière lecture ou
    /// écriture d'Atelier ? Un simple `stat` suffit tant que la taille et la
    /// date n'ont pas bougé ; sinon on compare le contenu (un `touch` ou un
    /// `git checkout` du même contenu n'est pas un changement).
    pub fn check_disk(&self) -> bool {
        let Some(sig) = self
            .disk_sig
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        else {
            return false;
        };
        let Ok(meta) = std::fs::metadata(&self.path) else {
            // Fichier supprimé ou déplacé : rien à écraser.
            return false;
        };
        if meta.len() == sig.len && meta.modified().ok() == sig.mtime {
            return false;
        }
        let Ok(bytes) = std::fs::read(&self.path) else {
            return false;
        };
        if sha256_hex(&bytes) == sig.sha {
            *self.disk_sig.lock().unwrap_or_else(|e| e.into_inner()) = Some(DiskSig {
                len: meta.len(),
                mtime: meta.modified().ok(),
                sha: sig.sha,
            });
            return false;
        }
        true
    }

    /// Programme l'envoi à l'écran de la cellule `cell_id` (regroupé).
    pub fn queue_cell_push(
        self: &Arc<Self>,
        nb_path: &str,
        cell_id: &str,
        listener: Option<NotebookEventListener>,
    ) {
        let Some(cb) = listener else {
            return;
        };
        let schedule = {
            let mut push = self.ui_push.lock().unwrap_or_else(|e| e.into_inner());
            if !push.dirty.iter().any(|c| c == cell_id) {
                push.dirty.push(cell_id.to_string());
            }
            !std::mem::replace(&mut push.scheduled, true)
        };
        if !schedule {
            return;
        }
        let ws = Arc::clone(self);
        let path = nb_path.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(UI_PUSH_INTERVAL).await;
            let dirty = {
                let mut push = ws.ui_push.lock().unwrap_or_else(|e| e.into_inner());
                push.scheduled = false;
                std::mem::take(&mut push.dirty)
            };
            let cells: Vec<UiCell> = {
                let doc = ws.doc.lock().await;
                dirty
                    .iter()
                    .filter_map(|id| {
                        let idx = doc.cells.iter().position(|c| &c.id == id)?;
                        Some(doc.cells[idx].to_ui(idx + 1))
                    })
                    .collect()
            };
            for cell in cells {
                cb(NotebookPushEvent::CellUpdated {
                    path: path.clone(),
                    cell,
                    running: true,
                });
            }
        });
    }

    fn take_pending_input(&self) -> bool {
        self.pending_input
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
            .is_some()
    }

    pub fn touch(&self) {
        *self.last_activity.lock().unwrap_or_else(|e| e.into_inner()) = Instant::now();
    }

    fn status_for(&self, kernel: Option<&RunningBackend>) -> NotebookKernelStatus {
        let busy_cell_id = self
            .busy_cell
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        match kernel {
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
                    ..Default::default()
                }
            }
            None => match *self.kernel_death.lock().unwrap_or_else(|e| e.into_inner()) {
                Some((exit_code, exit_signal)) => NotebookKernelStatus {
                    state: "dead".into(),
                    exit_code,
                    exit_signal,
                    ..Default::default()
                },
                None => NotebookKernelStatus::default(),
            },
        }
    }

    pub fn status(&self) -> NotebookKernelStatus {
        if let Ok(guard) = self.kernel.try_lock() {
            return self.status_for(guard.as_ref());
        }
        let busy_cell_id = self
            .busy_cell
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if busy_cell_id.is_some() {
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
            self.status_for(guard.as_ref())
        };

        NotebookSnapshot {
            path: self.path.display().to_string(),
            revision,
            unsaved: self.is_unsaved(),
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
            disk_changed: *self.disk_changed.lock().unwrap_or_else(|e| e.into_inner()),
            recovery: self
                .recovery
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone(),
            pending_input: self
                .pending_input
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
    /// Envs Python d'Atelier (env « atelier » géré par pixi) : liste des
    /// noyaux, et env créé ou remis d'accord avant d'y démarrer un noyau.
    python: Mutex<Option<Arc<atelier_kernel::KernelManager>>>,
    workspaces: AsyncMutex<HashMap<PathBuf, Arc<NotebookWorkspace>>>,
    listener: Mutex<Option<NotebookEventListener>>,
}

impl NotebookManager {
    pub fn new(runtime_dir: PathBuf, atelier_kernel_dir: PathBuf, home_dir: PathBuf) -> Self {
        Self {
            runtime_dir,
            atelier_kernel_dir,
            home_dir,
            python: Mutex::new(None),
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

    /// Branche les envs Python d'Atelier : sans eux (tests), les noyaux se
    /// cherchent seuls et l'env « atelier » n'est pris que s'il existe.
    pub fn set_python_envs(&self, kernels: Arc<atelier_kernel::KernelManager>) {
        *self.python.lock().unwrap_or_else(|e| e.into_inner()) = Some(kernels);
    }

    fn python(&self) -> Option<Arc<atelier_kernel::KernelManager>> {
        self.python.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn list_kernels(&self, project_root: Option<&Path>) -> Vec<DiscoveredKernel> {
        match self.python() {
            Some(kernels) => crate::kernelspec::discover_kernels_from(&self.home_dir, kernels.envs(project_root)),
            None => discover_kernels(&self.home_dir, project_root, Some(&self.atelier_kernel_dir)),
        }
    }

    /// Env pixi (celui d'Atelier ou celui du projet) : créé au premier
    /// usage, pixi téléchargé au besoin, puis le noyau est relu pour prendre
    /// ipykernel tout juste installé. Les autres envs passent tels quels.
    async fn prepare_env(
        &self,
        spec: DiscoveredKernel,
        project_root: Option<&Path>,
        nb_path: &str,
    ) -> Result<DiscoveredKernel, String> {
        let (Some(kernels), Some(prefix)) = (self.python(), spec.prefix.clone()) else {
            return Ok(spec);
        };
        let Some(env) = kernels
            .envs(project_root)
            .into_iter()
            .find(|e| e.prefix == prefix && atelier_kernel::pixi::managed_project(e).is_some())
        else {
            return Ok(spec);
        };
        if !env.python.is_file() {
            self.emit(NotebookPushEvent::KernelStatus {
                path: nb_path.to_string(),
                status: NotebookKernelStatus {
                    state: "starting".into(),
                    kernel_id: Some(spec.id.clone()),
                    display_name: Some(spec.display_name.clone()),
                    language: Some(spec.language.clone()),
                    backend: Some(spec.backend.clone()),
                    // Code lu par l'onglet, qui affiche son libellé traduit.
                    message: Some("installing-env".into()),
                    ..Default::default()
                },
            });
        }
        kernels.pixi().prepare(&env).await?;
        Ok(crate::kernelspec::pyenv_to_kernel(env))
    }

    pub async fn get_or_open(&self, path: &Path) -> Result<Arc<NotebookWorkspace>, NotebookError> {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let mut map = self.workspaces.lock().await;
        if let Some(existing) = map.get(&canonical) {
            let existing = Arc::clone(existing);
            drop(map);
            // Sans changement local, un fichier modifié ailleurs est relu.
            self.reload_if_clean(&existing).await;
            return Ok(existing);
        }

        let doc = NotebookDocument::open(&canonical)?;
        let ws = Arc::new(NotebookWorkspace::new(canonical.clone(), doc));
        *ws.recovery.lock().unwrap_or_else(|e| e.into_inner()) = self.find_recovery(&ws).await;
        map.insert(canonical, Arc::clone(&ws));
        Ok(ws)
    }

    // ------------------------------------------------------------------
    // Modification externe, copie de secours
    // ------------------------------------------------------------------

    fn recovery_path(&self, notebook: &Path) -> PathBuf {
        let key = sha256_hex(notebook.display().to_string().as_bytes());
        self.runtime_dir
            .join("recovery")
            .join(format!("{}.ipynb", &key[..24]))
    }

    fn remove_recovery(&self, ws: &NotebookWorkspace) {
        let _ = std::fs::remove_file(self.recovery_path(&ws.path));
        *ws.recovery.lock().unwrap_or_else(|e| e.into_inner()) = None;
        *ws.backup.lock().unwrap_or_else(|e| e.into_inner()) = (0, None);
    }

    /// Copie de secours d'une session précédente, si elle diffère du fichier.
    async fn find_recovery(&self, ws: &NotebookWorkspace) -> Option<RecoveryInfo> {
        let rp = self.recovery_path(&ws.path);
        let meta = std::fs::metadata(&rp).ok()?;
        let copy = NotebookDocument::open(&rp).ok();
        let same = match &copy {
            Some(c) => c.revision() == ws.doc.lock().await.revision(),
            None => true,
        };
        if same {
            let _ = std::fs::remove_file(&rp);
            return None;
        }
        let saved_at_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        Some(RecoveryInfo { saved_at_ms })
    }

    fn write_recovery(&self, ws: &NotebookWorkspace, doc: &NotebookDocument) {
        let rp = self.recovery_path(&ws.path);
        if let Some(dir) = rp.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if doc.save_atomic(&rp).is_ok() {
            *ws.backup.lock().unwrap_or_else(|e| e.into_inner()) =
                (ws.edit_seq.load(Ordering::Relaxed), Some(Instant::now()));
        }
    }

    /// Relit le fichier si l'onglet n'a aucun changement à lui. Rend `true`
    /// si le document a été remplacé.
    async fn reload_if_clean(&self, ws: &Arc<NotebookWorkspace>) -> bool {
        let clean = !ws.is_unsaved()
            && ws
                .proposals
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_empty()
            && ws
                .busy_cell
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_none();
        if !clean || !ws.check_disk() {
            return false;
        }
        let Ok(fresh) = NotebookDocument::open(&ws.path) else {
            return false;
        };
        *ws.doc.lock().await = fresh;
        ws.record_disk_sig();
        true
    }

    /// Enregistre. Si le fichier a changé ailleurs depuis l'ouverture,
    /// n'écrit rien (sauf `force`) : le cliché revient avec `diskChanged`
    /// et l'onglet propose de recharger ou de garder sa version.
    pub async fn save(&self, path: &Path, force: bool) -> Result<NotebookSnapshot, NotebookError> {
        let ws = self.get_or_open(path).await?;
        if !force && ws.check_disk() {
            *ws.disk_changed.lock().unwrap_or_else(|e| e.into_inner()) = true;
            return Ok(ws.snapshot().await);
        }
        {
            let doc = ws.doc.lock().await;
            doc.save_atomic(&ws.path)?;
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = false;
        }
        ws.record_disk_sig();
        self.remove_recovery(&ws);
        Ok(ws.snapshot().await)
    }

    /// Abandonne la version en mémoire et relit le fichier (le noyau et ses
    /// variables restent).
    pub async fn reload(&self, path: &Path) -> Result<NotebookSnapshot, NotebookError> {
        let ws = self.get_or_open(path).await?;
        let fresh = NotebookDocument::open(&ws.path)?;
        *ws.doc.lock().await = fresh;
        *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = false;
        ws.record_disk_sig();
        self.remove_recovery(&ws);
        Ok(ws.snapshot().await)
    }

    /// Reprend les changements de la copie de secours (non enregistrés).
    pub async fn restore_recovery(&self, path: &Path) -> Result<NotebookSnapshot, NotebookError> {
        let ws = self.get_or_open(path).await?;
        let copy = NotebookDocument::open(&self.recovery_path(&ws.path))?;
        *ws.doc.lock().await = copy;
        *ws.recovery.lock().unwrap_or_else(|e| e.into_inner()) = None;
        ws.mark_dirty();
        Ok(ws.snapshot().await)
    }

    pub async fn discard_recovery(&self, path: &Path) -> Result<NotebookSnapshot, NotebookError> {
        let ws = self.get_or_open(path).await?;
        self.remove_recovery(&ws);
        Ok(ws.snapshot().await)
    }

    /// Répond à l'`input()` de la cellule en cours.
    pub async fn send_input(&self, path: &Path, value: &str) -> Result<(), String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let running = ws.kernel.lock().await.clone();
        let k = running.ok_or_else(|| "noyau arrêté".to_string())?;
        k.reply_input(value).await?;
        if ws.take_pending_input() {
            self.emit(NotebookPushEvent::InputCleared {
                path: ws.path.display().to_string(),
            });
        }
        Ok(())
    }

    /// Signale à l'onglet l'échec d'une exécution lancée en arrière-plan.
    pub fn report_failure(&self, path: &Path, message: &str) {
        self.emit(NotebookPushEvent::RunFailed {
            path: std::fs::canonicalize(path)
                .unwrap_or_else(|_| path.to_path_buf())
                .display()
                .to_string(),
            message: message.to_string(),
        });
    }

    /// Veille périodique (chaque seconde) : noyau mort tout seul, fichier
    /// modifié ailleurs, copie de secours des changements non enregistrés.
    pub async fn tick(&self) {
        let list: Vec<Arc<NotebookWorkspace>> =
            self.workspaces.lock().await.values().cloned().collect();
        for ws in list {
            self.check_kernel_alive(&ws).await;
            let path = ws.path.display().to_string();

            if self.reload_if_clean(&ws).await {
                self.remove_recovery(&ws);
                let snapshot = ws.snapshot().await;
                self.emit(NotebookPushEvent::SnapshotReplaced {
                    path,
                    snapshot: Box::new(snapshot),
                });
                continue;
            }
            if ws.is_unsaved() {
                let changed = ws.check_disk();
                let flipped = {
                    let mut flag = ws.disk_changed.lock().unwrap_or_else(|e| e.into_inner());
                    std::mem::replace(&mut *flag, changed) != changed
                };
                if flipped {
                    self.emit(NotebookPushEvent::DiskChanged {
                        path: path.clone(),
                        changed,
                    });
                }
                // Copie de secours, sauf si une copie d'une session
                // précédente attend encore la décision de l'utilisateur.
                let pending_choice = ws
                    .recovery
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .is_some();
                let (seq_done, last) = *ws.backup.lock().unwrap_or_else(|e| e.into_inner());
                let seq = ws.edit_seq.load(Ordering::Relaxed);
                let due = last.is_none_or(|t| t.elapsed() >= RECOVERY_INTERVAL);
                if !pending_choice && seq != seq_done && due {
                    let doc = ws.doc.lock().await.clone();
                    self.write_recovery(&ws, &doc);
                }
            }
        }
    }

    async fn check_kernel_alive(&self, ws: &Arc<NotebookWorkspace>) {
        let dead = {
            let guard = ws.kernel.lock().await;
            guard
                .as_ref()
                .and_then(|k| k.exit_status().map(|st| (k.clone(), st)))
        };
        let Some((k, status)) = dead else {
            return;
        };
        {
            let mut guard = ws.kernel.lock().await;
            if guard.as_ref().is_some_and(|g| g.same(&k)) {
                guard.take();
            }
        }
        k.shutdown().await;
        #[cfg(unix)]
        let signal = std::os::unix::process::ExitStatusExt::signal(&status);
        #[cfg(not(unix))]
        let signal = None;
        *ws.kernel_death.lock().unwrap_or_else(|e| e.into_inner()) = Some((status.code(), signal));
        ws.variables
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        let path = ws.path.display().to_string();
        if ws.take_pending_input() {
            self.emit(NotebookPushEvent::InputCleared { path: path.clone() });
        }
        self.emit(NotebookPushEvent::KernelStatus {
            path,
            status: ws.status(),
        });
    }

    pub async fn ensure_kernel(
        &self,
        ws: &Arc<NotebookWorkspace>,
        project_root: Option<&Path>,
        requested_kernel_id: Option<&str>,
    ) -> Result<(), String> {
        ws.touch();
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
        let spec = self.prepare_env(spec, project_root, &nb_path_str).await?;
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
        *ws.kernel_death.lock().unwrap_or_else(|e| e.into_inner()) = None;

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
        ws.variables
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        *ws.kernel_death.lock().unwrap_or_else(|e| e.into_inner()) = None;
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
        ws.variables
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();
        *ws.kernel_death.lock().unwrap_or_else(|e| e.into_inner()) = None;
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
            ws.mark_dirty();
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

        // Le handle est cloné hors du verrou : le garder pendant l'exécution
        // bloquait Interrompre (et l'état du noyau) jusqu'à la fin de la cellule.
        let running = ws.kernel.lock().await.clone();
        ws.touch();
        let exec_res = match running.as_ref() {
            Some(k) => k.execute_cell(&resolved_id, &code).await,
            None => Err("noyau arrêté".into()),
        };
        ws.touch();

        *ws.busy_cell.lock().unwrap_or_else(|e| e.into_inner()) = None;
        if ws.take_pending_input() {
            self.emit(NotebookPushEvent::InputCleared {
                path: ws.path.display().to_string(),
            });
        }

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
        let vars = match running.as_ref() {
            Some(k) => k.fetch_variables().await,
            None => Vec::new(),
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
            let had_error = snap.cells.iter().find(|c| c.id == cid).is_some_and(|c| {
                c.outputs
                    .iter()
                    .any(|o| matches!(o, crate::nbformat::UiOutput::Error { .. }))
            });
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
            ws.mark_dirty();
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
                &format!(
                    "{}:{}:{}",
                    doc.cells.len(),
                    Instant::now().elapsed().as_nanos(),
                    source
                ),
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
            ws.mark_dirty();
            id
        };
        Ok((new_id, ws.snapshot().await))
    }

    pub async fn delete_cell(
        &self,
        path: &Path,
        cell_id: &str,
    ) -> Result<NotebookSnapshot, String> {
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
            ws.mark_dirty();
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
        let (code_cell, snapshot) = self.accept_proposal_cell(path, proposal_id).await?;
        if let (true, Some(cell_id)) = (run_after, code_cell) {
            self.run_cell(path, project_root, &cell_id, None).await?;
            return self.save(path, false).await.map_err(|e| e.to_string());
        }
        Ok(snapshot)
    }

    /// Applique une proposition et l'écrit sur le disque. Rend la cellule de
    /// code touchée (pour l'exécuter ensuite) et le cliché.
    pub async fn accept_proposal_cell(
        &self,
        path: &Path,
        proposal_id: &str,
    ) -> Result<(Option<String>, NotebookSnapshot), String> {
        let ws = self.get_or_open(path).await.map_err(|e| e.to_string())?;
        let proposal = {
            let mut list = ws.proposals.lock().unwrap_or_else(|e| e.into_inner());
            let pos = list
                .iter()
                .position(|p| p.id == proposal_id)
                .ok_or_else(|| "proposition introuvable ou déjà traitée".to_string())?;
            list.remove(pos)
        };

        if ws.check_disk() {
            ws.proposals
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(0, proposal);
            *ws.disk_changed.lock().unwrap_or_else(|e| e.into_inner()) = true;
            return Err(
                "le fichier a changé hors d'Atelier : rechargez-le ou gardez votre version d'abord"
                    .into(),
            );
        }
        let affected_cell_id = {
            let mut doc = ws.doc.lock().await;
            let cid = proposal
                .apply_to(&mut doc)
                .ok_or_else(|| "cellule cible introuvable dans le cahier".to_string())?;
            doc.save_atomic(&ws.path).map_err(|e| e.to_string())?;
            *ws.unsaved.lock().unwrap_or_else(|e| e.into_inner()) = false;
            cid
        };
        ws.record_disk_sig();
        self.remove_recovery(&ws);

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

        let code_cell = (proposal.cell_type == CellKind::Code).then_some(affected_cell_id);
        Ok((code_cell, ws.snapshot().await))
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

    /// Arrête les noyaux restés inactifs plus de `idle` (aucune cellule en
    /// cours). Rend les chemins des cahiers dont le noyau a été arrêté.
    pub async fn reap_idle(&self, idle: Duration) -> Vec<String> {
        let list: Vec<Arc<NotebookWorkspace>> =
            self.workspaces.lock().await.values().cloned().collect();
        let mut stopped = Vec::new();
        for ws in list {
            let quiet = ws
                .last_activity
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .elapsed()
                >= idle;
            if !quiet
                || ws
                    .busy_cell
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .is_some()
            {
                continue;
            }
            // Une exécution en cours tient la barrière : on n'y touche pas.
            let Ok(_gate) = ws.exec_gate.try_lock() else {
                continue;
            };
            let Some(k) = ws.kernel.lock().await.take() else {
                continue;
            };
            k.shutdown().await;
            ws.variables
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clear();
            let path = ws.path.display().to_string();
            self.emit(NotebookPushEvent::KernelStatus {
                path: path.clone(),
                status: NotebookKernelStatus::default(),
            });
            stopped.push(path);
        }
        stopped
    }

    pub async fn shutdown_all(&self) {
        let list: Vec<Arc<NotebookWorkspace>> =
            self.workspaces.lock().await.values().cloned().collect();
        for ws in list {
            // Dernière copie de secours des changements non enregistrés.
            let pending_choice = ws
                .recovery
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_some();
            if ws.is_unsaved() && !pending_choice {
                let doc = ws.doc.lock().await.clone();
                self.write_recovery(&ws, &doc);
            }
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
        let ws = Arc::new(NotebookWorkspace::new(nb_file.clone(), doc));

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

    /// Machine sans env Python d'Atelier : le cahier propose l'env
    /// « atelier » avant qu'il existe, et le premier « Tout exécuter » le
    /// crée par pixi (ici un faux pixi qui pointe vers python3) puis y tourne.
    #[cfg(unix)]
    #[tokio::test]
    async fn le_premier_noyau_cree_l_env_atelier_par_pixi() {
        use std::os::unix::fs::PermissionsExt;
        let Some(python) = std::env::var_os("PATH").and_then(|p| {
            std::env::split_paths(&p).map(|d| d.join("python3")).find(|p| p.is_file())
        }) else {
            return;
        };
        let tmp = tempfile::tempdir().unwrap();
        let pixi = tmp.path().join("faux-pixi");
        std::fs::write(
            &pixi,
            format!(
                "#!/bin/sh\nwhile [ $# -gt 0 ]; do [ \"$1\" = --manifest-path ] && projet=\"$2\"; shift; done\n\
                 mkdir -p \"$projet/.pixi/envs/default/bin\" \"$projet/.pixi/envs/default/conda-meta\"\n\
                 ln -sf {} \"$projet/.pixi/envs/default/bin/python\"\n: > \"$projet/pixi.lock\"\n",
                python.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(&pixi, std::fs::Permissions::from_mode(0o755)).unwrap();
        let app = tmp.path().join("app");
        let kernels = Arc::new(atelier_kernel::KernelManager::new(&app, tmp.path()));
        kernels.pixi().set_binary(Some(pixi));
        let mgr = NotebookManager::new(tmp.path().join("rt"), app.clone(), tmp.path().to_path_buf());
        mgr.set_python_envs(Arc::clone(&kernels));

        let listed = mgr.list_kernels(None);
        let atelier = listed.iter().find(|k| k.id == "pyenv:atelier").expect("env atelier proposé");
        assert_eq!(atelier.prefix.as_deref(), Some(app.join("python/.pixi/envs/default").as_path()));
        assert!(!app.join("python/.pixi").exists(), "rien n'est créé avant le premier noyau");

        let nb = tiny_notebook(tmp.path(), "essai.ipynb", "6 * 7\n");
        let ws = mgr.get_or_open(&nb).await.unwrap();
        mgr.ensure_kernel(&ws, None, Some("pyenv:atelier")).await.unwrap();
        assert!(app.join("python/.pixi/envs/default/bin/python").exists());
        assert!(app.join("python/pixi.toml").is_file());
        let snap = mgr.run_all(&nb, None).await.unwrap();
        assert_eq!(snap.cells[0].execution_count, Some(1), "{:?}", snap.cells[0]);
        mgr.shutdown_all().await;
    }

    fn tiny_notebook(dir: &Path, name: &str, source: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(
            &path,
            json!({
                "nbformat": 4, "nbformat_minor": 5, "metadata": {},
                "cells": [{"id": "c1", "cell_type": "code", "source": source, "outputs": [], "metadata": {}, "execution_count": null}]
            })
            .to_string(),
        )
        .unwrap();
        path
    }

    fn collecting_manager(dir: &Path) -> (NotebookManager, Arc<Mutex<Vec<Value>>>) {
        let mgr = NotebookManager::new(dir.join("rt"), dir.join("ak"), dir.to_path_buf());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&seen);
        mgr.set_listener(Arc::new(move |ev| {
            sink.lock()
                .unwrap()
                .push(serde_json::to_value(&ev).unwrap());
        }));
        (mgr, seen)
    }

    /// Sans changement local, un cahier modifié ailleurs (agent, git, autre
    /// éditeur) est relu tout seul et l'onglet reçoit le nouveau contenu.
    #[tokio::test]
    async fn external_edit_reloads_a_clean_notebook() {
        let tmp = tempfile::tempdir().unwrap();
        let nb = tiny_notebook(tmp.path(), "a.ipynb", "x = 1");
        let (mgr, seen) = collecting_manager(tmp.path());
        mgr.get_or_open(&nb).await.unwrap();
        tiny_notebook(tmp.path(), "a.ipynb", "x = 2  # modifié par un agent");
        mgr.tick().await;
        let events = seen.lock().unwrap().clone();
        let replaced = events
            .iter()
            .find(|e| e["event"] == "snapshotReplaced")
            .expect("snapshotReplaced attendu");
        assert_eq!(
            replaced["snapshot"]["cells"][0]["source"],
            "x = 2  # modifié par un agent"
        );
        assert_eq!(replaced["snapshot"]["diskChanged"], false);
    }

    /// Avec des changements locaux, Enregistrer n'écrase PAS une version
    /// modifiée ailleurs : l'onglet est prévenu, et seul « garder ma
    /// version » (force) écrit.
    #[tokio::test]
    async fn save_never_overwrites_an_external_edit_silently() {
        let tmp = tempfile::tempdir().unwrap();
        let nb = tiny_notebook(tmp.path(), "b.ipynb", "x = 1");
        let (mgr, seen) = collecting_manager(tmp.path());
        mgr.get_or_open(&nb).await.unwrap();
        mgr.update_cell_source(&nb, "c1", "x = 10  # local".into(), None)
            .await
            .unwrap();
        tiny_notebook(tmp.path(), "b.ipynb", "x = 2  # externe, plus long");
        let external = std::fs::read_to_string(&nb).unwrap();

        mgr.tick().await;
        assert!(seen
            .lock()
            .unwrap()
            .iter()
            .any(|e| e["event"] == "diskChanged" && e["changed"] == true));

        let snap = mgr.save(&nb, false).await.unwrap();
        assert!(snap.disk_changed);
        assert!(snap.unsaved);
        assert_eq!(
            std::fs::read_to_string(&nb).unwrap(),
            external,
            "fichier externe écrasé"
        );

        let snap = mgr.save(&nb, true).await.unwrap();
        assert!(!snap.disk_changed && !snap.unsaved);
        assert!(std::fs::read_to_string(&nb)
            .unwrap()
            .contains("x = 10  # local"));

        // Recharger rend la version du disque.
        tiny_notebook(tmp.path(), "b.ipynb", "x = 3  # encore ailleurs");
        mgr.update_cell_source(&nb, "c1", "x = 11".into(), None)
            .await
            .unwrap();
        let snap = mgr.reload(&nb).await.unwrap();
        assert_eq!(snap.cells[0].source, "x = 3  # encore ailleurs");
        assert!(!snap.unsaved && !snap.disk_changed);
    }

    /// Les changements non enregistrés survivent à un arrêt brutal : copie de
    /// secours, proposée à la réouverture, reprise puis effacée à
    /// l'enregistrement.
    #[tokio::test]
    async fn unsaved_changes_survive_a_crash() {
        let tmp = tempfile::tempdir().unwrap();
        let nb = tiny_notebook(tmp.path(), "c.ipynb", "x = 1");
        {
            let (mgr, _) = collecting_manager(tmp.path());
            mgr.get_or_open(&nb).await.unwrap();
            mgr.update_cell_source(&nb, "c1", "x = 42  # travail en cours".into(), None)
                .await
                .unwrap();
            mgr.tick().await;
            // « Plantage » : le gestionnaire disparaît sans enregistrer.
        }
        let (mgr, _) = collecting_manager(tmp.path());
        let snap = mgr.get_or_open(&nb).await.unwrap().snapshot().await;
        assert_eq!(snap.cells[0].source, "x = 1");
        assert!(snap.recovery.is_some(), "copie de secours non proposée");

        let snap = mgr.restore_recovery(&nb).await.unwrap();
        assert_eq!(snap.cells[0].source, "x = 42  # travail en cours");
        assert!(snap.unsaved && snap.recovery.is_none());

        mgr.save(&nb, false).await.unwrap();
        let (again, _) = collecting_manager(tmp.path());
        let snap = again.get_or_open(&nb).await.unwrap().snapshot().await;
        assert!(
            snap.recovery.is_none(),
            "copie effacée après enregistrement"
        );
        assert_eq!(snap.cells[0].source, "x = 42  # travail en cours");
    }

    /// Une copie identique au fichier n'est pas proposée ; « Ignorer »
    /// l'efface.
    #[tokio::test]
    async fn recovery_can_be_discarded() {
        let tmp = tempfile::tempdir().unwrap();
        let nb = tiny_notebook(tmp.path(), "d.ipynb", "x = 1");
        {
            let (mgr, _) = collecting_manager(tmp.path());
            mgr.get_or_open(&nb).await.unwrap();
            mgr.update_cell_source(&nb, "c1", "x = 5".into(), None)
                .await
                .unwrap();
            mgr.shutdown_all().await;
        }
        let (mgr, _) = collecting_manager(tmp.path());
        assert!(mgr
            .get_or_open(&nb)
            .await
            .unwrap()
            .snapshot()
            .await
            .recovery
            .is_some());
        let snap = mgr.discard_recovery(&nb).await.unwrap();
        assert!(snap.recovery.is_none());
        let (again, _) = collecting_manager(tmp.path());
        assert!(again
            .get_or_open(&nb)
            .await
            .unwrap()
            .snapshot()
            .await
            .recovery
            .is_none());
    }
}
