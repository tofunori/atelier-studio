//! Shared ACP client — JSON-RPC 2.0 over stdio, newline-delimited (plan 045).
//!
//! One process per provider, sessions multiplexed. Structure mirrors
//! `codex_rpc.rs` (reader + dispatcher tasks, pending map, reset-on-exit).
//! ACP specifics: replies carry `jsonrpc:"2.0"`, `session/update`
//! notifications are routed by `sessionId`, and `session/request_permission`
//! is answered AUTOMATICALLY (`allow_once` — parité avec le `--auto` du
//! chemin legacy ; le catalogue déclare `permissions:false`).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};

/// Handler des notifications `session/update` d'un tour (reçoit `params.update`).
pub type SessionUpdateHandler = Arc<dyn Fn(&Value) + Send + Sync>;

struct Pending {
    tx: oneshot::Sender<Result<Value, String>>,
}

struct Inner {
    child: Child,
    stdin: ChildStdin,
    pending: HashMap<u64, Pending>,
    /// sessionId ACP → handler du tour en cours (absent = tour fini, silence).
    handlers: HashMap<String, SessionUpdateHandler>,
    next_id: AtomicU64,
    /// Génération du spawn propriétaire — le reader d'un ANCIEN process ne
    /// doit ni dispatcher dans, ni nettoyer, l'Inner d'un remplaçant.
    generation: u64,
}

#[derive(Clone)]
pub struct AcpServer {
    label: &'static str,
    inner: Arc<Mutex<Option<Inner>>>,
    /// Incrémenté à chaque spawn — permet aux appelants d'invalider leur état
    /// par-session (sessions chargées, sélection modèle) après un respawn.
    generation: Arc<AtomicU64>,
}

/// Réponse à une requête serveur→client. `session/request_permission` est
/// approuvée automatiquement (option `allow_once`, sinon la première) ; toute
/// autre méthode reçoit l'erreur JSON-RPC standard -32601 — jamais de silence
/// (un serveur qui attend une réponse bloquerait le tour, cf. grok.mjs:615).
fn response_for_server_request(msg: &Value) -> Value {
    let id = msg.get("id").cloned().unwrap_or(Value::Null);
    let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
    if method == "session/request_permission" {
        let options = msg.pointer("/params/options").and_then(|v| v.as_array());
        let picked = options.and_then(|opts| {
            opts.iter()
                .find(|o| o.get("kind").and_then(|k| k.as_str()) == Some("allow_once"))
                .or_else(|| opts.first())
        });
        let outcome = match picked.and_then(|o| o.get("optionId")).cloned() {
            Some(option_id) => json!({"outcome": "selected", "optionId": option_id}),
            None => json!({"outcome": "cancelled"}),
        };
        return json!({"jsonrpc": "2.0", "id": id, "result": {"outcome": outcome}});
    }
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {"code": -32601, "message": format!("Method not found: {method}")}
    })
}

impl AcpServer {
    pub fn new(label: &'static str) -> Self {
        Self {
            label,
            inner: Arc::new(Mutex::new(None)),
            generation: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Génération du process courant (change à chaque spawn).
    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    pub async fn is_alive(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    /// Spawn + `initialize` si le process est absent (ou mort — le reader
    /// remet `inner` à `None` à l'EOF). Err = échec de handshake, déclencheur
    /// du repli legacy chez l'appelant.
    pub async fn ensure(
        &self,
        bin: &Path,
        args: &[String],
        init_params: Value,
    ) -> Result<(), String> {
        // Le verrou est tenu du test à l'installation de l'Inner : deux
        // ensure() concurrents ne peuvent pas spawner deux process (course
        // relevée en revue indépendante, 2026-07-16).
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            return Ok(());
        }

        let mut cmd = Command::new(bin);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }
        let label = self.label;
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("spawn {label} acp: {e}"))?;
        let stdin = child.stdin.take().ok_or("pas de stdin")?;
        let stdout = child.stdout.take().ok_or("pas de stdout")?;
        let my_gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;

        let inner_for_disp = Arc::clone(&self.inner);
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let msg: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue, // ligne vide/corrompue : jamais fatal
                };
                let mut g = inner_for_disp.lock().await;
                let Some(inn) = g.as_mut() else { continue };
                if inn.generation != my_gen {
                    continue; // ligne tardive d'un ANCIEN process : jamais dispatchée au remplaçant
                }

                // Requête serveur → client (id + method) : réponse automatique.
                if msg.get("id").is_some() && msg.get("method").is_some() {
                    let reply = response_for_server_request(&msg);
                    if let Ok(s) = serde_json::to_string(&reply) {
                        let _ = inn.stdin.write_all(s.as_bytes()).await;
                        let _ = inn.stdin.write_all(b"\n").await;
                    }
                    continue;
                }

                // Réponse à une de nos requêtes.
                if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
                    if let Some(p) = inn.pending.remove(&id) {
                        if let Some(err) = msg.get("error") {
                            let m = err
                                .get("message")
                                .and_then(|v| v.as_str())
                                .unwrap_or("erreur ACP");
                            let _ = p.tx.send(Err(m.to_string()));
                        } else {
                            let _ = p
                                .tx
                                .send(Ok(msg.get("result").cloned().unwrap_or(Value::Null)));
                        }
                    }
                    continue;
                }

                // Notification : seul session/update est routé (par sessionId).
                if msg.get("method").and_then(|v| v.as_str()) == Some("session/update") {
                    let params = msg.get("params").cloned().unwrap_or(json!({}));
                    let sid = params
                        .get("sessionId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    if !sid.is_empty() {
                        if let Some(h) = inn.handlers.get(sid) {
                            let update = params.get("update").cloned().unwrap_or(json!({}));
                            h(&update);
                        }
                    }
                }
                // Autres notifications : ignorées, jamais journalisées.
            }
            // Process terminé : drainer les requêtes en attente, tout nettoyer
            // — seulement si l'Inner courant appartient encore à CE process
            // (un exit tardif d'un ancien process ne doit pas tuer le nouveau).
            let mut g = inner_for_disp.lock().await;
            if g.as_ref().map(|i| i.generation) == Some(my_gen) {
                if let Some(mut inn) = g.take() {
                    for (_, p) in inn.pending.drain() {
                        let _ = p.tx.send(Err(format!("{label} acp terminé")));
                    }
                    inn.handlers.clear();
                    let _ = inn.child.kill().await;
                }
            }
        });

        *guard = Some(Inner {
            child,
            stdin,
            pending: HashMap::new(),
            handlers: HashMap::new(),
            next_id: AtomicU64::new(1),
            generation: my_gen,
        });
        drop(guard);

        if let Err(e) = self
            .request("initialize", init_params, Some(10_000))
            .await
        {
            self.shutdown().await;
            return Err(format!("initialize {label}: {e}"));
        }
        Ok(())
    }

    /// Requête JSON-RPC sortante. `timeout_ms: None` = attente illimitée
    /// (session/prompt — le tour est borné par l'appelant via interrupt).
    pub async fn request(
        &self,
        method: &str,
        params: Value,
        timeout_ms: Option<u64>,
    ) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel();
        let id = {
            let mut g = self.inner.lock().await;
            let inn = g.as_mut().ok_or_else(|| format!("{} acp absent", self.label))?;
            let id = inn.next_id.fetch_add(1, Ordering::SeqCst);
            inn.pending.insert(id, Pending { tx });
            let msg = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});
            let s = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
            if let Err(e) = inn.stdin.write_all(s.as_bytes()).await {
                inn.pending.remove(&id);
                return Err(e.to_string());
            }
            if let Err(e) = inn.stdin.write_all(b"\n").await {
                inn.pending.remove(&id);
                return Err(e.to_string());
            }
            id
        };
        match timeout_ms {
            None => rx.await.map_err(|_| "rpc annulée".to_string())?,
            Some(ms) => match tokio::time::timeout(Duration::from_millis(ms), rx).await {
                Ok(r) => r.map_err(|_| "rpc annulée".to_string())?,
                Err(_) => {
                    if let Some(inn) = self.inner.lock().await.as_mut() {
                        inn.pending.remove(&id);
                    }
                    Err(format!("{method}: pas de réponse sous {ms}ms"))
                }
            },
        }
    }

    /// Notification sortante (sans id) — best-effort, comme grok.mjs:664.
    pub async fn notify(&self, method: &str, params: Value) {
        let mut g = self.inner.lock().await;
        let Some(inn) = g.as_mut() else { return };
        let msg = json!({"jsonrpc": "2.0", "method": method, "params": params});
        if let Ok(s) = serde_json::to_string(&msg) {
            let _ = inn.stdin.write_all(s.as_bytes()).await;
            let _ = inn.stdin.write_all(b"\n").await;
        }
    }

    pub async fn set_session_handler(&self, session_id: &str, h: SessionUpdateHandler) {
        if let Some(inn) = self.inner.lock().await.as_mut() {
            inn.handlers.insert(session_id.to_string(), h);
        }
    }

    pub async fn clear_session_handler(&self, session_id: &str) {
        if let Some(inn) = self.inner.lock().await.as_mut() {
            inn.handlers.remove(session_id);
        }
    }

    async fn shutdown(&self) {
        let mut g = self.inner.lock().await;
        if let Some(mut inn) = g.take() {
            for (_, p) in inn.pending.drain() {
                let _ = p.tx.send(Err(format!("{} acp arrêté", self.label)));
            }
            let _ = inn.child.kill().await;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_auto_allow_once() {
        let msg = json!({"jsonrpc":"2.0","id":7,"method":"session/request_permission","params":{
            "options":[
                {"optionId":"reject","kind":"reject_once","name":"Reject"},
                {"optionId":"once","kind":"allow_once","name":"Allow once"}
            ]
        }});
        let r = response_for_server_request(&msg);
        assert_eq!(r["id"], 7);
        assert_eq!(r["result"]["outcome"]["outcome"], "selected");
        assert_eq!(r["result"]["outcome"]["optionId"], "once");
    }

    #[test]
    fn permission_options_sans_allow_once_prend_la_premiere() {
        let msg = json!({"id":1,"method":"session/request_permission","params":{
            "options":[{"optionId":"always","kind":"allow_always"}]
        }});
        let r = response_for_server_request(&msg);
        assert_eq!(r["result"]["outcome"]["optionId"], "always");
    }

    #[test]
    fn permission_sans_options_cancelled() {
        let msg = json!({"id":2,"method":"session/request_permission","params":{}});
        let r = response_for_server_request(&msg);
        assert_eq!(r["result"]["outcome"]["outcome"], "cancelled");
    }

    #[test]
    fn unknown_server_request_method_not_found() {
        let msg = json!({"id":3,"method":"fs/read_text_file","params":{"path":"/x"}});
        let r = response_for_server_request(&msg);
        assert_eq!(r["id"], 3);
        assert_eq!(r["error"]["code"], -32601);
        assert!(r["error"]["message"]
            .as_str()
            .unwrap()
            .contains("fs/read_text_file"));
    }
}
