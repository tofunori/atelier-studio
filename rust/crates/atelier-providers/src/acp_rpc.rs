//! Shared ACP client — JSON-RPC 2.0 over stdio, newline-delimited (plans 045/046).
//!
//! One process per provider, sessions multiplexed. Structure mirrors
//! `codex_rpc.rs` (reader + dispatcher tasks, pending map, reset-on-exit).
//! ACP specifics (plan 046) :
//! - erreurs JSON-RPC structurées (`AcpRpcError` conserve code/message/data
//!   et distingue transport mort vs erreur applicative) ;
//! - résultat `initialize` mémorisé par génération (`AcpInitializeResult`) ;
//! - requêtes serveur→client (`session/request_permission`, `fs/*`…)
//!   dispatchées vers un handler ASYNC par session (ou un handler par défaut
//!   du provider) SANS tenir le mutex du process pendant l'attente : une
//!   permission qui attend l'utilisateur ne bloque ni les `session/update`,
//!   ni `session/cancel`, ni les autres sessions ;
//! - AUCUNE auto-approbation générique : sans handler, une permission reçoit
//!   `{"outcome":{"outcome":"cancelled"}}` et toute autre méthode l'erreur
//!   JSON-RPC standard -32601 — jamais de silence (un serveur qui attend une
//!   réponse bloquerait le tour, cf. grok.mjs:615).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};

/// Handler des notifications `session/update` d'un tour (reçoit `params.update`).
pub type SessionUpdateHandler = Arc<dyn Fn(&Value) + Send + Sync>;

/// Handler asynchrone d'une requête serveur→client `(method, params)`.
///
/// Contrat de la valeur retournée :
/// - `Value::Null` ⇒ méthode non prise en charge par ce handler, le client
///   répond l'erreur standard -32601 ;
/// - toute autre valeur ⇒ payload `result` de la réponse JSON-RPC.
pub type ServerRequestHandler =
    Arc<dyn Fn(String, Value) -> Pin<Box<dyn Future<Output = Value> + Send>> + Send + Sync>;

/// Erreur structurée du client ACP (plan 046 §2.1).
///
/// `transport == true` ⇒ le process est mort, absent ou muet (spawn, EOF,
/// timeout, write) — jamais une décision de l'agent. `transport == false`
/// ⇒ erreur applicative JSON-RPC de l'agent, `code`/`data` conservés :
/// `-32000` authRequired, `-32602` invalidParams / session inconnue,
/// `-32601` méthode absente.
#[derive(Debug, Clone)]
pub struct AcpRpcError {
    pub code: Option<i64>,
    pub message: String,
    pub data: Option<Value>,
    pub transport: bool,
}

impl AcpRpcError {
    pub fn transport(message: impl Into<String>) -> Self {
        Self {
            code: None,
            message: message.into(),
            data: None,
            transport: true,
        }
    }

    fn from_error_value(err: &Value) -> Self {
        Self {
            code: err.get("code").and_then(Value::as_i64),
            message: err
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("erreur ACP")
                .to_string(),
            data: err.get("data").filter(|d| !d.is_null()).cloned(),
            transport: false,
        }
    }

    pub fn is_auth_required(&self) -> bool {
        self.code == Some(-32000)
    }

    pub fn is_invalid_params(&self) -> bool {
        self.code == Some(-32602)
    }
}

impl std::fmt::Display for AcpRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.code {
            Some(code) => write!(f, "{} (code {code})", self.message),
            None => write!(f, "{}", self.message),
        }
    }
}

impl From<AcpRpcError> for String {
    fn from(e: AcpRpcError) -> Self {
        e.to_string()
    }
}

/// Résultat `initialize` conservé par génération (plan 046 §2.2).
#[derive(Debug, Clone, Default)]
pub struct AcpInitializeResult {
    pub protocol_version: u64,
    pub agent_capabilities: Value,
    pub auth_methods: Vec<Value>,
    pub agent_info: Option<Value>,
}

impl AcpInitializeResult {
    fn from_value(v: &Value) -> Self {
        Self {
            protocol_version: v
                .get("protocolVersion")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            agent_capabilities: v.get("agentCapabilities").cloned().unwrap_or(json!({})),
            auth_methods: v
                .get("authMethods")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            agent_info: v.get("agentInfo").filter(|i| !i.is_null()).cloned(),
        }
    }
}

struct Pending {
    tx: oneshot::Sender<Result<Value, AcpRpcError>>,
}

struct Inner {
    child: Child,
    stdin: ChildStdin,
    pending: HashMap<u64, Pending>,
    /// sessionId ACP → handler du tour en cours (absent = tour fini, silence).
    handlers: HashMap<String, SessionUpdateHandler>,
    /// sessionId ACP → handler des requêtes serveur→client de cette session.
    server_handlers: HashMap<String, ServerRequestHandler>,
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
    /// Sérialise spawn+initialize : deux `ensure()` concurrents ne doivent ni
    /// spawner deux process, ni retourner avant la fin du handshake du premier.
    ensure_lock: Arc<Mutex<()>>,
    /// Résultat `initialize` du process courant, invalidé par génération.
    init_cache: Arc<std::sync::Mutex<Option<(u64, AcpInitializeResult)>>>,
    /// Politique du provider quand une session n'a pas de handler dédié
    /// (OpenCode y met son auto-approbation du plan 045 ; Kimi n'en a pas).
    default_server_handler: Arc<std::sync::Mutex<Option<ServerRequestHandler>>>,
}

/// Réponse sûre quand AUCUN handler ne prend la requête serveur→client :
/// permission ⇒ refus sûr `cancelled` (jamais d'approbation implicite),
/// autre méthode (fs/*, terminal/*…) ⇒ -32601.
fn fallback_reply_body(method: &str) -> Value {
    if method == "session/request_permission" {
        json!({"result": {"outcome": {"outcome": "cancelled"}}})
    } else {
        json!({"error": {"code": -32601, "message": format!("Method not found: {method}")}})
    }
}

impl AcpServer {
    pub fn new(label: &'static str) -> Self {
        Self {
            label,
            inner: Arc::new(Mutex::new(None)),
            generation: Arc::new(AtomicU64::new(0)),
            ensure_lock: Arc::new(Mutex::new(())),
            init_cache: Arc::new(std::sync::Mutex::new(None)),
            default_server_handler: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Génération du process courant (change à chaque spawn).
    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    pub async fn is_alive(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    /// Politique par défaut du provider pour les requêtes serveur→client des
    /// sessions sans handler dédié. Survit aux respawns.
    pub fn set_default_server_handler(&self, h: ServerRequestHandler) {
        *self.default_server_handler.lock().unwrap() = Some(h);
    }

    /// Résultat `initialize` du process courant, si la génération correspond.
    pub fn init_result(&self) -> Option<AcpInitializeResult> {
        let cache = self.init_cache.lock().unwrap();
        match cache.as_ref() {
            Some((generation, init)) if *generation == self.generation() => Some(init.clone()),
            _ => None,
        }
    }

    /// Spawn + `initialize` si le process est absent (ou mort — le reader
    /// remet `inner` à `None` à l'EOF). Retourne le résultat `initialize`
    /// (mémorisé par génération). Err = échec de spawn/handshake.
    pub async fn ensure(
        &self,
        bin: &Path,
        args: &[String],
        init_params: Value,
    ) -> Result<AcpInitializeResult, AcpRpcError> {
        // Single-flight : le second appelant attend la fin du handshake du
        // premier au lieu de retourner avec un initialize encore en vol.
        let _flight = self.ensure_lock.lock().await;
        {
            let guard = self.inner.lock().await;
            if guard.is_some() {
                if let Some(init) = self.init_result() {
                    return Ok(init);
                }
            }
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
            .map_err(|e| AcpRpcError::transport(format!("spawn {label} acp: {e}")))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| AcpRpcError::transport("pas de stdin"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| AcpRpcError::transport("pas de stdout"))?;
        let my_gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;

        let inner_for_disp = Arc::clone(&self.inner);
        let default_handler = Arc::clone(&self.default_server_handler);
        let init_cache_for_disp = Arc::clone(&self.init_cache);
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

                // Requête serveur → client (id + method) : résolue dans une
                // tâche séparée — le verrou est relâché AVANT toute attente
                // (plan 046 §2.3 : une permission de 120 s ne bloque rien).
                if msg.get("id").is_some() && msg.get("method").is_some() {
                    let id = msg.get("id").cloned().unwrap_or(Value::Null);
                    let method = msg
                        .get("method")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let params = msg.get("params").cloned().unwrap_or(json!({}));
                    let session_id = params
                        .get("sessionId")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let handler = inn
                        .server_handlers
                        .get(session_id)
                        .cloned()
                        .or_else(|| default_handler.lock().unwrap().clone());
                    drop(g);

                    let inner_for_reply = Arc::clone(&inner_for_disp);
                    tokio::spawn(async move {
                        let body = match handler {
                            Some(h) => {
                                let result = h(method.clone(), params).await;
                                if result.is_null() {
                                    fallback_reply_body(&method)
                                } else {
                                    json!({"result": result})
                                }
                            }
                            None => fallback_reply_body(&method),
                        };
                        let mut reply = json!({"jsonrpc": "2.0", "id": id});
                        if let (Some(obj), Some(body_obj)) =
                            (reply.as_object_mut(), body.as_object())
                        {
                            for (k, v) in body_obj {
                                obj.insert(k.clone(), v.clone());
                            }
                        }
                        // Reprise brève du verrou uniquement pour écrire — et
                        // seulement si le process n'a pas changé entre-temps.
                        let mut g = inner_for_reply.lock().await;
                        let Some(inn) = g.as_mut() else { return };
                        if inn.generation != my_gen {
                            return;
                        }
                        if let Ok(s) = serde_json::to_string(&reply) {
                            let _ = inn.stdin.write_all(s.as_bytes()).await;
                            let _ = inn.stdin.write_all(b"\n").await;
                        }
                    });
                    continue;
                }

                // Réponse à une de nos requêtes.
                if let Some(id) = msg.get("id").and_then(Value::as_u64) {
                    if let Some(p) = inn.pending.remove(&id) {
                        if let Some(err) = msg.get("error") {
                            let _ = p.tx.send(Err(AcpRpcError::from_error_value(err)));
                        } else {
                            let _ =
                                p.tx.send(Ok(msg.get("result").cloned().unwrap_or(Value::Null)));
                        }
                    }
                    continue;
                }

                // Notification : seul session/update est routé (par sessionId).
                if msg.get("method").and_then(Value::as_str) == Some("session/update") {
                    let params = msg.get("params").cloned().unwrap_or(json!({}));
                    let sid = params
                        .get("sessionId")
                        .and_then(Value::as_str)
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
                        let _ =
                            p.tx.send(Err(AcpRpcError::transport(format!("{label} acp terminé"))));
                    }
                    inn.handlers.clear();
                    inn.server_handlers.clear();
                    let _ = inn.child.kill().await;
                }
                // Le cache initialize vit exactement aussi longtemps que SON
                // process — un cache de process mort ne doit jamais être servi.
                let mut cache = init_cache_for_disp.lock().unwrap();
                if cache.as_ref().map(|(g, _)| *g) == Some(my_gen) {
                    *cache = None;
                }
            }
        });

        {
            let mut guard = self.inner.lock().await;
            *guard = Some(Inner {
                child,
                stdin,
                pending: HashMap::new(),
                handlers: HashMap::new(),
                server_handlers: HashMap::new(),
                next_id: AtomicU64::new(1),
                generation: my_gen,
            });
        }

        match self.request("initialize", init_params, Some(10_000)).await {
            Ok(v) => {
                let init = AcpInitializeResult::from_value(&v);
                *self.init_cache.lock().unwrap() = Some((my_gen, init.clone()));
                Ok(init)
            }
            Err(e) => {
                self.shutdown().await;
                Err(AcpRpcError {
                    code: e.code,
                    message: format!("initialize {label}: {}", e.message),
                    data: e.data,
                    transport: e.transport,
                })
            }
        }
    }

    /// Requête JSON-RPC sortante. `timeout_ms: None` = attente illimitée
    /// (session/prompt — le tour est borné par l'appelant via interrupt).
    pub async fn request(
        &self,
        method: &str,
        params: Value,
        timeout_ms: Option<u64>,
    ) -> Result<Value, AcpRpcError> {
        let (tx, rx) = oneshot::channel();
        let id = {
            let mut g = self.inner.lock().await;
            let inn = g
                .as_mut()
                .ok_or_else(|| AcpRpcError::transport(format!("{} acp absent", self.label)))?;
            let id = inn.next_id.fetch_add(1, Ordering::SeqCst);
            inn.pending.insert(id, Pending { tx });
            let msg = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});
            let s =
                serde_json::to_string(&msg).map_err(|e| AcpRpcError::transport(e.to_string()))?;
            if let Err(e) = inn.stdin.write_all(s.as_bytes()).await {
                inn.pending.remove(&id);
                return Err(AcpRpcError::transport(e.to_string()));
            }
            if let Err(e) = inn.stdin.write_all(b"\n").await {
                inn.pending.remove(&id);
                return Err(AcpRpcError::transport(e.to_string()));
            }
            id
        };
        match timeout_ms {
            None => rx
                .await
                .map_err(|_| AcpRpcError::transport("rpc annulée"))?,
            Some(ms) => match tokio::time::timeout(Duration::from_millis(ms), rx).await {
                Ok(r) => r.map_err(|_| AcpRpcError::transport("rpc annulée"))?,
                Err(_) => {
                    // Réponse tardive : le pending est retiré ICI — une ligne
                    // qui arrive après ne trouvera plus rien à résoudre.
                    if let Some(inn) = self.inner.lock().await.as_mut() {
                        inn.pending.remove(&id);
                    }
                    Err(AcpRpcError::transport(format!(
                        "{method}: pas de réponse sous {ms}ms"
                    )))
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

    /// Handler des requêtes serveur→client pour UNE session (permissions,
    /// questions, plan review…). À retirer en fin de tour.
    pub async fn set_session_server_handler(&self, session_id: &str, h: ServerRequestHandler) {
        if let Some(inn) = self.inner.lock().await.as_mut() {
            inn.server_handlers.insert(session_id.to_string(), h);
        }
    }

    pub async fn clear_session_server_handler(&self, session_id: &str) {
        if let Some(inn) = self.inner.lock().await.as_mut() {
            inn.server_handlers.remove(session_id);
        }
    }

    async fn shutdown(&self) {
        let mut g = self.inner.lock().await;
        if let Some(mut inn) = g.take() {
            for (_, p) in inn.pending.drain() {
                let _ = p.tx.send(Err(AcpRpcError::transport(format!(
                    "{} acp arrêté",
                    self.label
                ))));
            }
            let _ = inn.child.kill().await;
            let mut cache = self.init_cache.lock().unwrap();
            if cache.as_ref().map(|(g, _)| *g) == Some(inn.generation) {
                *cache = None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::Mutex as StdMutex;

    #[test]
    fn fallback_permission_cancelled_jamais_approuvee() {
        let body = fallback_reply_body("session/request_permission");
        assert_eq!(body["result"]["outcome"]["outcome"], "cancelled");
        assert!(body["result"]["outcome"].get("optionId").is_none());
    }

    #[test]
    fn fallback_unknown_method_not_found() {
        let body = fallback_reply_body("fs/read_text_file");
        assert_eq!(body["error"]["code"], -32601);
        assert!(body["error"]["message"]
            .as_str()
            .unwrap()
            .contains("fs/read_text_file"));
    }

    #[test]
    fn erreur_structuree_conserve_code_message_data() {
        let e = AcpRpcError::from_error_value(&json!({
            "code": -32000, "message": "Authentication required", "data": {"hint": "login"}
        }));
        assert_eq!(e.code, Some(-32000));
        assert!(e.is_auth_required());
        assert!(!e.transport);
        assert_eq!(e.message, "Authentication required");
        assert_eq!(e.data.as_ref().unwrap()["hint"], "login");
        let s: String = e.into();
        assert!(s.contains("Authentication required"));
        assert!(s.contains("-32000"));
    }

    // ---------------------------------------------------------------------
    // Tests d'intégration contre le fixture partagé fake_kimi_acp.mjs.

    fn node_bin() -> Option<PathBuf> {
        if let Ok(p) = std::env::var("ATELIER_TEST_NODE") {
            let pb = PathBuf::from(p);
            if pb.is_file() {
                return Some(pb);
            }
        }
        let out = std::process::Command::new("which")
            .arg("node")
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if p.is_empty() {
            None
        } else {
            Some(PathBuf::from(p))
        }
    }

    fn fixture_path() -> String {
        format!(
            "{}/tests/fixtures/fake_kimi_acp.mjs",
            env!("CARGO_MANIFEST_DIR")
        )
    }

    fn init_params() -> Value {
        json!({
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": {"readTextFile": false, "writeTextFile": false},
                "terminal": false
            }
        })
    }

    /// Spawn le fixture ; None (skip bruyant) si node est introuvable.
    /// Le mode passe en argv — jamais par env (tests parallèles).
    async fn fixture_server(mode: &str) -> Option<AcpServer> {
        let Some(node) = node_bin() else {
            eprintln!("SKIP: node introuvable pour le fixture ACP");
            return None;
        };
        let server = AcpServer::new("fake-kimi");
        server
            .ensure(&node, &[fixture_path(), mode.to_string()], init_params())
            .await
            .expect("handshake fixture");
        Some(server)
    }

    async fn new_session(server: &AcpServer) -> String {
        let r = server
            .request(
                "session/new",
                json!({"cwd": "/tmp/fake", "mcpServers": []}),
                Some(5_000),
            )
            .await
            .expect("session/new");
        r["sessionId"].as_str().unwrap().to_string()
    }

    fn collect_text() -> (SessionUpdateHandler, Arc<StdMutex<Vec<String>>>) {
        let seen: Arc<StdMutex<Vec<String>>> = Arc::new(StdMutex::new(vec![]));
        let seen2 = Arc::clone(&seen);
        let handler: SessionUpdateHandler = Arc::new(move |u: &Value| {
            if u["sessionUpdate"] == "agent_message_chunk" {
                if let Some(t) = u.pointer("/content/text").and_then(Value::as_str) {
                    seen2.lock().unwrap().push(t.to_string());
                }
            }
        });
        (handler, seen)
    }

    #[tokio::test]
    async fn initialize_memorise_par_generation() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let g1 = server.generation();
        let init = server.init_result().expect("init en cache");
        assert_eq!(init.protocol_version, 1);
        assert_eq!(init.agent_info.as_ref().unwrap()["name"], "Kimi Code CLI");
        assert_eq!(init.auth_methods.len(), 1);
        assert_eq!(init.auth_methods[0]["id"], "login");
        assert_eq!(init.agent_capabilities["promptCapabilities"]["image"], true);

        // ensure() sur process vivant : même génération, même cache.
        let node = node_bin().unwrap();
        let again = server
            .ensure(&node, &[fixture_path(), "nominal".into()], init_params())
            .await
            .unwrap();
        assert_eq!(server.generation(), g1);
        assert_eq!(again.protocol_version, 1);

        // Respawn (EOF brutal) : le cache de l'ancienne génération n'est plus servi.
        let sid = new_session(&server).await;
        let _ = server
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type": "text", "text": "[eof]"}]}),
                Some(5_000),
            )
            .await;
        // le reader nettoie l'Inner de façon asynchrone après l'EOF
        for _ in 0..50 {
            if !server.is_alive().await {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(!server.is_alive().await, "process mort attendu");
        assert!(
            server.init_result().is_none(),
            "cache invalidé par génération"
        );
        let re = server
            .ensure(&node, &[fixture_path(), "nominal".into()], init_params())
            .await
            .unwrap();
        assert!(server.generation() > g1);
        assert_eq!(re.protocol_version, 1);
        assert!(server.init_result().is_some());
    }

    #[tokio::test]
    async fn erreur_auth_structuree_via_fixture() {
        let Some(server) = fixture_server("auth_required").await else {
            return;
        };
        let err = server
            .request(
                "session/new",
                json!({"cwd": "/tmp/fake", "mcpServers": []}),
                Some(5_000),
            )
            .await
            .expect_err("auth requise");
        assert_eq!(err.code, Some(-32000));
        assert!(err.is_auth_required());
        assert!(!err.transport);
        assert_eq!(err.message, "Authentication required");
    }

    #[tokio::test]
    async fn sans_handler_permission_cancelled_pas_d_auto_approbation() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid = new_session(&server).await;
        let (handler, seen) = collect_text();
        server.set_session_handler(&sid, handler).await;
        let r = server
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type": "text", "text": "[permission]"}]}),
                Some(5_000),
            )
            .await
            .unwrap();
        assert_eq!(r["stopReason"], "end_turn");
        let texts = seen.lock().unwrap().join("");
        assert!(
            texts.contains("perm:cancelled"),
            "sans handler la permission doit être cancelled, vu: {texts}"
        );
    }

    #[tokio::test]
    async fn permission_lente_ne_bloque_ni_updates_ni_autre_session() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid_a = new_session(&server).await;
        let sid_b = new_session(&server).await;

        let order: Arc<StdMutex<Vec<String>>> = Arc::new(StdMutex::new(vec![]));
        let order_updates = Arc::clone(&order);
        let handler: SessionUpdateHandler = Arc::new(move |u: &Value| {
            if u["sessionUpdate"] == "agent_message_chunk" {
                if let Some(t) = u.pointer("/content/text").and_then(Value::as_str) {
                    order_updates.lock().unwrap().push(format!("chunk:{t}"));
                }
            }
        });
        server.set_session_handler(&sid_a, handler).await;

        // Handler de permission LENT (300 ms) qui journalise sa réponse.
        let order_perm = Arc::clone(&order);
        let server_handler: ServerRequestHandler =
            Arc::new(move |method: String, _params: Value| {
                let order_perm = Arc::clone(&order_perm);
                Box::pin(async move {
                    if method != "session/request_permission" {
                        return Value::Null;
                    }
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    order_perm.lock().unwrap().push("perm-answered".into());
                    json!({"outcome": {"outcome": "selected", "optionId": "approve_once"}})
                })
            });
        server
            .set_session_server_handler(&sid_a, server_handler)
            .await;

        let server_b = server.clone();
        let sid_b2 = sid_b.clone();
        let b_task = tokio::spawn(async move {
            server_b
                .request(
                    "session/prompt",
                    json!({"sessionId": sid_b2, "prompt": [{"type": "text", "text": "vite"}]}),
                    Some(5_000),
                )
                .await
        });

        let r = server
            .request(
                "session/prompt",
                json!({"sessionId": sid_a, "prompt": [{"type": "text", "text": "[slow-permission]"}]}),
                Some(10_000),
            )
            .await
            .unwrap();
        assert_eq!(r["stopReason"], "end_turn");
        let rb = b_task.await.unwrap().unwrap();
        assert_eq!(rb["stopReason"], "end_turn");

        let order = order.lock().unwrap().clone();
        let perm_pos = order.iter().position(|s| s == "perm-answered").unwrap();
        for chunk in ["chunk:pendant1 ", "chunk:pendant2 ", "chunk:pendant3 "] {
            let pos = order
                .iter()
                .position(|s| s == chunk)
                .unwrap_or_else(|| panic!("chunk manquant: {chunk} dans {order:?}"));
            assert!(
                pos < perm_pos,
                "les updates concurrentes doivent arriver PENDANT l'attente: {order:?}"
            );
        }
        assert!(order
            .iter()
            .any(|s| s.starts_with("chunk:perm:selected:approve_once")));
    }

    #[tokio::test]
    async fn cancel_pendant_permission_termine_le_tour() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid = new_session(&server).await;
        // Handler qui n'answera JAMAIS (simule une UI absente/bloquée).
        let server_handler: ServerRequestHandler = Arc::new(move |_m: String, _p: Value| {
            Box::pin(async move {
                tokio::time::sleep(Duration::from_secs(3600)).await;
                Value::Null
            })
        });
        server
            .set_session_server_handler(&sid, server_handler)
            .await;

        let server2 = server.clone();
        let sid2 = sid.clone();
        let prompt_task = tokio::spawn(async move {
            server2
                .request(
                    "session/prompt",
                    json!({"sessionId": sid2, "prompt": [{"type": "text", "text": "[permission]"}]}),
                    Some(10_000),
                )
                .await
        });
        // Laisser la requête de permission partir, puis annuler.
        tokio::time::sleep(Duration::from_millis(150)).await;
        server
            .notify("session/cancel", json!({"sessionId": sid}))
            .await;
        let r = prompt_task.await.unwrap().unwrap();
        assert_eq!(r["stopReason"], "cancelled");
    }

    #[tokio::test]
    async fn deux_sessions_multiplexees_updates_routees() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid_a = new_session(&server).await;
        let sid_b = new_session(&server).await;
        let (ha, seen_a) = collect_text();
        let (hb, seen_b) = collect_text();
        server.set_session_handler(&sid_a, ha).await;
        server.set_session_handler(&sid_b, hb).await;

        let sa = server.clone();
        let sida = sid_a.clone();
        let ta = tokio::spawn(async move {
            sa.request(
                "session/prompt",
                json!({"sessionId": sida, "prompt": [{"type": "text", "text": "A"}]}),
                Some(5_000),
            )
            .await
        });
        let sb = server.clone();
        let sidb = sid_b.clone();
        let tb = tokio::spawn(async move {
            sb.request(
                "session/prompt",
                json!({"sessionId": sidb, "prompt": [{"type": "text", "text": "B"}]}),
                Some(5_000),
            )
            .await
        });
        ta.await.unwrap().unwrap();
        tb.await.unwrap().unwrap();
        let a = seen_a.lock().unwrap().join("");
        let b = seen_b.lock().unwrap().join("");
        assert!(a.contains("réponse"), "session A doit recevoir SES updates");
        assert!(b.contains("réponse"), "session B doit recevoir SES updates");
    }

    #[tokio::test]
    async fn process_mort_draine_tous_les_pending() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid = new_session(&server).await;
        // [cancel] stream sans fin : la requête reste pending jusqu'à l'EOF.
        let s1 = server.clone();
        let sid1 = sid.clone();
        let hanging = tokio::spawn(async move {
            s1.request(
                "session/prompt",
                json!({"sessionId": sid1, "prompt": [{"type": "text", "text": "[cancel]"}]}),
                None,
            )
            .await
        });
        tokio::time::sleep(Duration::from_millis(100)).await;
        // seconde session : [eof] tue le process avec les deux pending.
        let sid_b = new_session(&server).await;
        let s2 = server.clone();
        let eof = tokio::spawn(async move {
            s2.request(
                "session/prompt",
                json!({"sessionId": sid_b, "prompt": [{"type": "text", "text": "[eof]"}]}),
                None,
            )
            .await
        });
        let e1 = hanging.await.unwrap().expect_err("drainé à l'EOF");
        let e2 = eof.await.unwrap().expect_err("drainé à l'EOF");
        assert!(e1.transport && e2.transport);
        assert!(e1.message.contains("terminé"));
        assert!(!server.is_alive().await);
    }

    #[tokio::test]
    async fn reponse_tardive_apres_timeout_ignoree() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid = new_session(&server).await;
        let err = server
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type": "text", "text": "[late]"}]}),
                Some(50),
            )
            .await
            .expect_err("timeout attendu");
        assert!(err.transport);
        assert!(err.message.contains("pas de réponse"));
        // La réponse tardive arrive ensuite : elle ne doit ni paniquer ni
        // polluer une requête suivante.
        tokio::time::sleep(Duration::from_millis(400)).await;
        let r = server
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type": "text", "text": "ok"}]}),
                Some(5_000),
            )
            .await
            .unwrap();
        assert_eq!(r["stopReason"], "end_turn");
        assert!(server.is_alive().await);
    }

    #[tokio::test]
    async fn fs_non_annonce_recoit_method_not_found() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid = new_session(&server).await;
        let (handler, seen) = collect_text();
        server.set_session_handler(&sid, handler).await;
        // Handler serveur qui ne connaît QUE les permissions : fs/* retourne
        // Null ⇒ le client répond -32601 (capacité non annoncée, sans deadlock).
        let server_handler: ServerRequestHandler = Arc::new(move |method: String, _p: Value| {
            Box::pin(async move {
                if method == "session/request_permission" {
                    json!({"outcome": {"outcome": "cancelled"}})
                } else {
                    Value::Null
                }
            })
        });
        server
            .set_session_server_handler(&sid, server_handler)
            .await;
        let r = server
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type": "text", "text": "[fs-request]"}]}),
                Some(5_000),
            )
            .await
            .unwrap();
        assert_eq!(r["stopReason"], "end_turn");
        let texts = seen.lock().unwrap().join("");
        assert!(texts.contains("fs:-32601"), "vu: {texts}");
    }
}
