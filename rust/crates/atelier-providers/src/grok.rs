//! Grok provider — client ACP Rust natif du CLI officiel.
//!
//! Chaque thread Atelier possède son propre `grok agent --no-leader stdio` :
//! le cwd, la session, les permissions et l'annulation ne peuvent donc pas
//! fuir vers un autre projet. Il n'existe aucun repli mid-turn vers l'ancien
//! mode `streaming-json` : une panne ACP reste visible et actionnable.

use crate::acp_map::TurnEmitter;
use crate::acp_rpc::{
    AcpInitializeResult, AcpRpcError, AcpServer, ServerRequestHandler, SessionUpdateHandler,
};
use crate::grok_parse::{map_prompt_result_for_model, map_session_update};

use crate::traits::{
    atelier_mcp_servers, InteractionFn, Provider, ProviderCaps, SendRequest, SendResult,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::io::BufRead;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const GROK_MIN_VERSION: &str = "0.2.101";
const MAX_LIVE_RUNTIMES: usize = 8;
const IDLE_TTL_MS: u64 = 60 * 60 * 1_000;
const LATE_EVENT_QUIET_MS: u64 = 150;
const LATE_EVENT_MAX_MS: u64 = 1_000;

#[derive(Clone, Default)]
struct GrokSelection {
    model: Option<String>,
    effort: Option<String>,
}

#[derive(Default)]
struct GrokRuntimeState {
    generation: u64,
    authenticated: bool,
    opened_sessions: HashSet<String>,
    selection: HashMap<String, GrokSelection>,
}

struct GrokThreadRuntime {
    cwd: String,
    acp: AcpServer,
    state: StdMutex<GrokRuntimeState>,
    turn_lock: Mutex<()>,
    active_session: StdMutex<Option<String>>,
    last_used_ms: AtomicU64,
    always_approve: AtomicBool,
    launch_configured: AtomicBool,
}

impl GrokThreadRuntime {
    fn new(cwd: String) -> Self {
        Self {
            cwd,
            acp: AcpServer::new("grok"),
            state: StdMutex::new(GrokRuntimeState::default()),
            turn_lock: Mutex::new(()),
            active_session: StdMutex::new(None),
            last_used_ms: AtomicU64::new(now_ms()),
            always_approve: AtomicBool::new(false),
            launch_configured: AtomicBool::new(false),
        }
    }

    fn touch(&self) {
        self.last_used_ms.store(now_ms(), Ordering::Relaxed);
    }

    fn idle(&self) -> bool {
        self.active_session.lock().unwrap().is_none() && self.turn_lock.try_lock().is_ok()
    }
}

pub struct GrokProvider {
    bin: PathBuf,
    agent_args: Vec<String>,
    runtimes: Mutex<HashMap<String, Arc<GrokThreadRuntime>>>,
    discovered_models: StdMutex<Vec<String>>,
}

impl GrokProvider {
    pub fn new() -> Option<Self> {
        resolve_bin().map(|bin| {
            Self::with_command(
                bin,
                vec!["agent".into(), "--no-leader".into(), "stdio".into()],
            )
        })
    }

    fn with_command(bin: PathBuf, agent_args: Vec<String>) -> Self {
        Self {
            bin,
            agent_args,
            runtimes: Mutex::new(HashMap::new()),
            discovered_models: StdMutex::new(Vec::new()),
        }
    }

    async fn runtime_for(&self, thread_id: &str, cwd: &str) -> Arc<GrokThreadRuntime> {
        let now = now_ms();
        let mut retired = Vec::new();
        let runtime = {
            let mut runtimes = self.runtimes.lock().await;
            if let Some(existing) = runtimes.get(thread_id) {
                if existing.cwd == cwd {
                    existing.touch();
                    return Arc::clone(existing);
                }
            }
            if let Some(old) = runtimes.remove(thread_id) {
                retired.push(old);
            }

            let stale: Vec<String> = runtimes
                .iter()
                .filter(|(_, runtime)| {
                    now.saturating_sub(runtime.last_used_ms.load(Ordering::Relaxed)) > IDLE_TTL_MS
                        && runtime.idle()
                })
                .map(|(id, _)| id.clone())
                .collect();
            for id in stale {
                if let Some(old) = runtimes.remove(&id) {
                    retired.push(old);
                }
            }
            while runtimes.len() >= MAX_LIVE_RUNTIMES {
                let victim = runtimes
                    .iter()
                    .filter(|(_, runtime)| runtime.idle())
                    .min_by_key(|(_, runtime)| runtime.last_used_ms.load(Ordering::Relaxed))
                    .map(|(id, _)| id.clone());
                let Some(victim) = victim else { break };
                if let Some(old) = runtimes.remove(&victim) {
                    retired.push(old);
                }
            }

            let runtime = Arc::new(GrokThreadRuntime::new(cwd.to_string()));
            runtimes.insert(thread_id.to_string(), Arc::clone(&runtime));
            runtime
        };
        for old in retired {
            old.acp.shutdown().await;
        }
        runtime
    }

    async fn ensure_runtime(
        &self,
        runtime: &GrokThreadRuntime,
    ) -> Result<AcpInitializeResult, AcpRpcError> {
        let mut args = self.agent_args.clone();
        if runtime.always_approve.load(Ordering::Relaxed) {
            // Seul bypassPermissions active le flag natif. Les autres modes
            // gardent les demandes d'autorisation du CLI et le relais ACP.
            args.insert(args.len().saturating_sub(1), "--always-approve".into());
        }
        let init = runtime
            .acp
            .ensure_in(
                &self.bin,
                &args,
                acp_init_params(),
                Some(Path::new(&runtime.cwd)),
            )
            .await?;
        if init.protocol_version != 1 {
            return Err(AcpRpcError::transport(format!(
                "Grok ACP annonce protocolVersion {} (attendu 1)",
                init.protocol_version
            )));
        }

        let generation = runtime.acp.generation();
        let must_authenticate = {
            let mut state = runtime.state.lock().unwrap();
            if state.generation != generation {
                *state = GrokRuntimeState {
                    generation,
                    ..Default::default()
                };
            }
            !state.authenticated
        };
        if must_authenticate {
            authenticate(&runtime.acp, &init).await?;
            runtime.state.lock().unwrap().authenticated = true;
        }
        Ok(init)
    }

    async fn open_session(
        &self,
        runtime: &GrokThreadRuntime,
        requested: Option<&str>,
        mcp_servers: Value,
        refresh_mcp: bool,
    ) -> Result<String, String> {
        if let Some(sid) = requested.filter(|sid| !sid.is_empty()) {
            if runtime.state.lock().unwrap().opened_sessions.contains(sid) && !refresh_mcp {
                return Ok(sid.to_string());
            }

            // Grok rejoue l'historique pendant session/load. Un handler de
            // décharge est installé AVANT la requête, puis gardé jusqu'à une
            // courte fenêtre calme afin que ce replay ne pollue pas le tour.
            let replay_activity = Arc::new(AtomicU64::new(now_ms()));
            let activity = Arc::clone(&replay_activity);
            runtime
                .acp
                .set_session_handler(
                    sid,
                    Arc::new(move |_| {
                        activity.store(now_ms(), Ordering::Relaxed);
                    }),
                )
                .await;
            let loaded = runtime
                .acp
                .request(
                    "session/load",
                    json!({"sessionId": sid, "cwd": runtime.cwd, "mcpServers": mcp_servers}),
                    Some(30_000),
                )
                .await;
            replay_activity.store(now_ms(), Ordering::Relaxed);
            wait_for_quiet(&replay_activity).await;
            runtime.acp.clear_session_handler(sid).await;
            match loaded {
                Ok(result) => {
                    remember_session_result(runtime, sid, &result, &self.discovered_models);
                    return Ok(sid.to_string());
                }
                Err(error) if !error.transport => {
                    // Session supprimée ou déplacée vers un cwd incompatible :
                    // le process est sain, on crée une nouvelle session ACP.
                }
                Err(error) => return Err(grok_user_error(&error)),
            }
        }

        let result = runtime
            .acp
            .request(
                "session/new",
                json!({"cwd": runtime.cwd, "mcpServers": mcp_servers}),
                Some(30_000),
            )
            .await
            .map_err(|error| grok_user_error(&error))?;
        let sid = result
            .get("sessionId")
            .and_then(Value::as_str)
            .filter(|sid| !sid.is_empty())
            .ok_or("session/new Grok sans sessionId")?
            .to_string();
        remember_session_result(runtime, &sid, &result, &self.discovered_models);
        Ok(sid)
    }

    async fn align_selection(
        &self,
        runtime: &GrokThreadRuntime,
        sid: &str,
        model: Option<&str>,
        effort: Option<&str>,
    ) -> Result<GrokSelection, String> {
        let effort = match effort.filter(|value| !value.is_empty()) {
            Some(value) => Some(
                map_effort(value)
                    .ok_or_else(|| format!("effort Grok inconnu : {value}"))?
                    .to_string(),
            ),
            None => None,
        };
        let known = runtime
            .state
            .lock()
            .unwrap()
            .selection
            .get(sid)
            .cloned()
            .unwrap_or_default();
        let wanted_model = model
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .or_else(|| known.model.clone());
        let wanted_effort = effort.or_else(|| known.effort.clone());
        if wanted_model == known.model && wanted_effort == known.effort {
            return Ok(known);
        }
        let model_id = wanted_model
            .clone()
            .ok_or("Grok n'a annoncé aucun modèle pour cette session")?;
        let mut params = json!({"sessionId": sid, "modelId": model_id});
        if let Some(value) = &wanted_effort {
            params["_meta"] = json!({"reasoningEffort": value});
        }
        match runtime
            .acp
            .request("session/set_model", params, Some(15_000))
            .await
        {
            Ok(_) => {}
            Err(error) if error.code == Some(-32601) => {
                // Compatibilité Grok 0.2.0x : ancien contrat `session/set_mode`.
                if known.model != wanted_model {
                    runtime
                        .acp
                        .request(
                            "session/set_mode",
                            json!({"sessionId": sid, "modeId": model_id}),
                            Some(15_000),
                        )
                        .await
                        .map_err(|e| format!("Grok a refusé le modèle : {e}"))?;
                }
                if known.effort != wanted_effort {
                    if let Some(value) = &wanted_effort {
                        runtime
                            .acp
                            .request(
                                "session/set_mode",
                                json!({"sessionId": sid, "modeId": value}),
                                Some(15_000),
                            )
                            .await
                            .map_err(|e| format!("Grok a refusé l'effort : {e}"))?;
                    }
                }
            }
            Err(error) => return Err(format!("Grok a refusé modèle/effort : {error}")),
        }
        let selected = GrokSelection {
            model: wanted_model,
            effort: wanted_effort,
        };
        runtime
            .state
            .lock()
            .unwrap()
            .selection
            .insert(sid.to_string(), selected.clone());
        Ok(selected)
    }

    fn make_server_handler(
        permission_mode: Option<String>,
        on_interaction: Option<InteractionFn>,
    ) -> ServerRequestHandler {
        Arc::new(move |method: String, params: Value| {
            let mode = permission_mode.clone();
            let relay = on_interaction.clone();
            Box::pin(async move {
                if method != "session/request_permission" {
                    return Value::Null;
                }
                if mode.as_deref() == Some("bypassPermissions") {
                    return auto_permission_outcome(&params).unwrap_or_else(cancelled_outcome);
                }
                if mode.as_deref() == Some("plan") {
                    // Toute demande d'exécution reçue via ACP est refusée en
                    // plan. Les grants déjà persistés dans Grok restent une
                    // limite externe, documentée dans le plan 056.
                    return cancelled_outcome();
                }
                if mode.as_deref() == Some("acceptEdits") && permission_is_edit(&params) {
                    return auto_permission_outcome(&params).unwrap_or_else(cancelled_outcome);
                }
                let answer = match relay {
                    Some(relay) => relay(method, params.clone()).await,
                    None => None,
                };
                permission_outcome(&params, answer)
            })
        })
    }

    async fn send_acp(&self, req: &SendRequest) -> Result<SendResult, String> {
        let cwd = request_cwd(&req.project_root);
        let runtime = self.runtime_for(&req.thread_id, &cwd).await;
        let _turn = runtime.turn_lock.lock().await;
        runtime.touch();

        let wanted_always_approve = req.permission_mode.as_deref() == Some("bypassPermissions");
        let configured = runtime.launch_configured.load(Ordering::Relaxed);
        let previous = runtime.always_approve.load(Ordering::Relaxed);
        if configured && previous != wanted_always_approve && runtime.acp.is_alive().await {
            // Le flag est process-scoped : un changement de mode respawn le
            // process de CE thread, puis session/load restaure la conversation.
            runtime.acp.shutdown().await;
        }
        runtime
            .always_approve
            .store(wanted_always_approve, Ordering::Relaxed);
        runtime.launch_configured.store(true, Ordering::Relaxed);

        let init = self
            .ensure_runtime(&runtime)
            .await
            .map_err(|error| grok_user_error(&error))?;
        let prompt = build_prompt(&req.prompt, req.inputs.as_ref())?;
        if prompt.trim().is_empty() {
            return Err("prompt Grok vide".into());
        }
        if init
            .agent_capabilities
            .pointer("/promptCapabilities/image")
            .and_then(Value::as_bool)
            == Some(true)
        {
            // Le builder reste textuel pour garantir la compatibilité avec les
            // versions actuelles ; cette branche documente que l'annonce est
            // tolérée sans modifier le wire de façon implicite.
        }

        let sid = self
            .open_session(
                &runtime,
                req.session_id.as_deref(),
                atelier_mcp_servers(req.atelier_mcp.as_ref()),
                req.atelier_mcp.is_some(),
            )
            .await?;
        let selection = self
            .align_selection(&runtime, &sid, req.model.as_deref(), req.effort.as_deref())
            .await?;

        let state = Arc::new(StdMutex::new((
            HashMap::<String, Value>::new(),
            HashSet::<String>::new(),
            TurnEmitter::new(req.on_event.clone()),
        )));
        let saw_content = Arc::new(AtomicBool::new(false));
        let last_update = Arc::new(AtomicU64::new(now_ms()));
        let handler_state = Arc::clone(&state);
        let saw = Arc::clone(&saw_content);
        let activity = Arc::clone(&last_update);
        let handler: SessionUpdateHandler = Arc::new(move |update: &Value| {
            activity.store(now_ms(), Ordering::Relaxed);
            if matches!(
                update.get("sessionUpdate").and_then(Value::as_str),
                Some(
                    "agent_message_chunk"
                        | "agent_thought_chunk"
                        | "tool_call"
                        | "tool_call_update"
                        | "plan"
                )
            ) {
                saw.store(true, Ordering::Relaxed);
            }
            let mut guard = handler_state.lock().unwrap();
            let (tool_meta, seen_edits, emitter) = &mut *guard;
            for event in map_session_update(update, tool_meta, seen_edits) {
                emitter.emit(event);
            }
        });
        runtime.acp.set_session_handler(&sid, handler).await;
        runtime
            .acp
            .set_session_server_handler(
                &sid,
                Self::make_server_handler(req.permission_mode.clone(), req.on_interaction.clone()),
            )
            .await;
        *runtime.active_session.lock().unwrap() = Some(sid.clone());

        let cancel_acp = runtime.acp.clone();
        let cancel_sid = sid.clone();
        let is_cancelled = Arc::clone(&req.is_cancelled);
        let watcher = tokio::spawn(async move {
            loop {
                if is_cancelled() {
                    cancel_acp
                        .notify("session/cancel", json!({"sessionId": cancel_sid}))
                        .await;
                    break;
                }
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
        });

        let prompt_result = runtime
            .acp
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type":"text", "text": prompt}]}),
                None,
            )
            .await;
        watcher.abort();
        last_update.store(now_ms(), Ordering::Relaxed);
        wait_for_quiet(&last_update).await;
        runtime.acp.clear_session_handler(&sid).await;
        runtime.acp.clear_session_server_handler(&sid).await;
        *runtime.active_session.lock().unwrap() = None;
        runtime.touch();

        match prompt_result {
            Ok(result) => {
                let mut guard = state.lock().unwrap();
                guard.2.flush();
                let mut done = map_prompt_result_for_model(&result, selection.model.as_deref());
                let mut ok = done.get("ok").and_then(Value::as_bool).unwrap_or(false);
                let stop = result
                    .get("stopReason")
                    .and_then(Value::as_str)
                    .unwrap_or("inconnu");
                let silent = ok && stop == "end_turn" && !saw_content.load(Ordering::Relaxed);
                if silent {
                    ok = false;
                    done["ok"] = json!(false);
                    (req.on_event)(json!({
                        "kind":"error",
                        "message":"Grok a terminé le tour sans produire de contenu. Réessaie ou lance /compact."
                    }));
                }
                (req.on_event)(done);
                Ok(SendResult {
                    session_id: Some(sid),
                    ok,
                    error: (!ok).then(|| format!("tour Grok terminé: {stop}")),
                })
            }
            Err(error) => {
                state.lock().unwrap().2.flush();
                let message = grok_user_error(&error);
                (req.on_event)(json!({"kind":"error", "message": message}));
                Ok(SendResult {
                    session_id: Some(sid),
                    ok: false,
                    error: Some(error.to_string()),
                })
            }
        }
    }

    async fn discover_models(&self) -> Vec<String> {
        // Les fixtures ACP de test ne sont pas un CLI Grok et ne doivent pas
        // recevoir une commande `models` parasite.
        if self.agent_args != vec!["agent", "--no-leader", "stdio"] {
            return self.discovered_models.lock().unwrap().clone();
        }
        let output = tokio::time::timeout(
            Duration::from_secs(10),
            tokio::process::Command::new(&self.bin)
                .arg("models")
                .output(),
        )
        .await
        .ok()
        .and_then(Result::ok);
        if let Some(output) = output.filter(|output| output.status.success()) {
            let text = String::from_utf8_lossy(&output.stdout);
            let models: Vec<String> = text.lines().filter_map(parse_model_line).collect();
            if !models.is_empty() {
                *self.discovered_models.lock().unwrap() = models;
            }
        }
        self.discovered_models.lock().unwrap().clone()
    }
}

#[async_trait]
impl Provider for GrokProvider {
    fn id(&self) -> &str {
        "grok"
    }

    fn label(&self) -> &str {
        "Grok"
    }

    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            resume: true,
            steering: false,
            queue: true,
            goals: false,
            tools: true,
        }
    }

    fn models(&self) -> Vec<String> {
        self.discovered_models.lock().unwrap().clone()
    }

    fn default_model(&self) -> String {
        self.discovered_models
            .lock()
            .unwrap()
            .first()
            .cloned()
            .unwrap_or_else(|| "grok-4.5".into())
    }

    fn efforts(&self) -> Vec<String> {
        vec!["low".into(), "medium".into(), "high".into()]
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        match self.send_acp(&req).await {
            Ok(result) => result,
            Err(message) => {
                (req.on_event)(json!({"kind":"error", "message": message}));
                SendResult {
                    session_id: req.session_id.clone(),
                    ok: false,
                    error: Some(message),
                }
            }
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        let runtime = self.runtimes.lock().await.get(thread_id).cloned();
        let Some(runtime) = runtime else { return false };
        let sid = runtime.active_session.lock().unwrap().clone();
        if let Some(sid) = sid {
            runtime
                .acp
                .notify("session/cancel", json!({"sessionId": sid}))
                .await;
            true
        } else {
            false
        }
    }

    async fn list_sessions(&self, project_root: &str) -> Option<Vec<Value>> {
        let home = std::env::var_os("HOME").map(PathBuf::from)?;
        let root = if project_root.is_empty() {
            home.to_string_lossy().into_owned()
        } else {
            project_root.to_string()
        };
        Some(list_grok_sessions_from_base(
            &home.join(".grok/sessions"),
            &root,
        ))
    }

    async fn stop_session(&self, thread_id: &str) {
        let runtime = self.runtimes.lock().await.remove(thread_id);
        if let Some(runtime) = runtime {
            let active = runtime.active_session.lock().unwrap().clone();
            if let Some(sid) = active {
                runtime
                    .acp
                    .notify("session/cancel", json!({"sessionId": sid}))
                    .await;
            }
            runtime.acp.shutdown().await;
        }
    }

    async fn native_command(&self, name: &str, params: Value) -> Result<Value, String> {
        if name != "compact" {
            return Err(format!("commande native Grok non supportée : {name}"));
        }
        let thread_id = params
            .get("threadId")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or("compact Grok : threadId absent")?;
        let cwd = request_cwd(
            params
                .get("projectRoot")
                .and_then(Value::as_str)
                .unwrap_or(""),
        );
        let runtime = self.runtime_for(thread_id, &cwd).await;
        let _turn = runtime.turn_lock.lock().await;
        self.ensure_runtime(&runtime)
            .await
            .map_err(|error| grok_user_error(&error))?;
        let sid = self
            .open_session(
                &runtime,
                params.get("sessionId").and_then(Value::as_str),
                json!([]),
                false,
            )
            .await?;
        *runtime.active_session.lock().unwrap() = Some(sid.clone());
        let result = runtime
            .acp
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type":"text", "text":"/compact"}]}),
                Some(120_000),
            )
            .await;
        *runtime.active_session.lock().unwrap() = None;
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                runtime
                    .acp
                    .notify("session/cancel", json!({"sessionId": sid}))
                    .await;
                Err(grok_user_error(&error))
            }
        }
    }

    async fn setup_probe(&self) -> Option<Value> {
        let version = cli_version(&self.bin, &self.agent_args).await;
        let mut probe = json!({
            "state": "ready",
            "version": version,
            "binPath": self.bin.to_string_lossy(),
            "models": 0,
            "loginCommand": "grok login",
            "error": null,
        });
        if let Some(version) = version.as_deref() {
            if compare_versions(version, GROK_MIN_VERSION) < 0 {
                probe["state"] = json!("version_unsupported");
                return Some(probe);
            }
        }
        let cwd = request_cwd("");
        let server = AcpServer::new("grok-setup");
        let init = server
            .ensure_in(
                &self.bin,
                &self.agent_args,
                acp_init_params(),
                Some(Path::new(&cwd)),
            )
            .await;
        match init {
            Ok(init) => match authenticate(&server, &init).await {
                Ok(()) => {}
                Err(error) if error.is_auth_required() => {
                    probe["state"] = json!("login_needed");
                    server.shutdown().await;
                    return Some(probe);
                }
                Err(error) => {
                    probe["state"] = json!("protocol_error");
                    probe["error"] = json!(error.to_string());
                    server.shutdown().await;
                    return Some(probe);
                }
            },
            Err(error) => {
                probe["state"] = json!(if error.is_auth_required() {
                    "login_needed"
                } else {
                    "protocol_error"
                });
                probe["error"] = json!(error.to_string());
                server.shutdown().await;
                return Some(probe);
            }
        }
        server.shutdown().await;
        let models = self.discover_models().await;
        probe["models"] = json!(models.len());
        if models.is_empty() {
            probe["state"] = json!("model_config_needed");
        }
        Some(probe)
    }

    async fn dynamic_models(&self) -> Option<Value> {
        let models = self.discover_models().await;
        let reasoning = models
            .iter()
            .map(|model| {
                (
                    model.clone(),
                    json!({"supported_efforts":["low","medium","high"], "default_effort":"high"}),
                )
            })
            .collect::<serde_json::Map<String, Value>>();
        Some(json!({
            "models": models,
            "defaultModel": self.default_model(),
            "modelReasoning": reasoning,
        }))
    }
}

fn acp_init_params() -> Value {
    json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            // Grok conserve ses outils locaux. Atelier n'annonce aucun proxy
            // fs/terminal qu'il ne saurait garantir de bout en bout.
            "fs": {"readTextFile": false, "writeTextFile": false},
            "terminal": false
        }
    })
}

async fn authenticate(acp: &AcpServer, init: &AcpInitializeResult) -> Result<(), AcpRpcError> {
    if init.auth_methods.is_empty() {
        return Ok(());
    }
    let has = |id: &str| {
        init.auth_methods
            .iter()
            .any(|method| method.get("id").and_then(Value::as_str) == Some(id))
    };
    let method = if std::env::var_os("XAI_API_KEY").is_some() && has("xai.api_key") {
        "xai.api_key"
    } else if has("cached_token") {
        "cached_token"
    } else {
        return Err(AcpRpcError {
            code: Some(-32000),
            message: "aucune authentification Grok headless disponible — exécute `grok login`"
                .into(),
            data: None,
            transport: false,
        });
    };
    acp.request(
        "authenticate",
        json!({"methodId": method, "_meta": {"headless": true}}),
        Some(15_000),
    )
    .await
    .map(|_| ())
}

fn remember_session_result(
    runtime: &GrokThreadRuntime,
    sid: &str,
    result: &Value,
    discovered_models: &StdMutex<Vec<String>>,
) {
    let mut selection = GrokSelection::default();
    if let Some(options) = result
        .pointer("/_meta/x.ai~1sessionConfig/options")
        .and_then(Value::as_array)
    {
        for option in options
            .iter()
            .filter(|option| option.get("selected").and_then(Value::as_bool) == Some(true))
        {
            let id = option.get("id").and_then(Value::as_str).map(str::to_string);
            match option.get("category").and_then(Value::as_str) {
                Some("model") => selection.model = id,
                Some("mode") => selection.effort = id,
                _ => {}
            }
        }
    }
    if selection.model.is_none() {
        selection.model = result
            .pointer("/models/currentModelId")
            .and_then(Value::as_str)
            .map(str::to_string);
    }
    let mut models = result
        .pointer("/models/availableModels")
        .and_then(Value::as_array)
        .map(|models| {
            models
                .iter()
                .filter_map(|model| {
                    model
                        .get("modelId")
                        .or_else(|| model.get("id"))
                        .or_else(|| model.get("value"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !models.is_empty() {
        models.sort();
        *discovered_models.lock().unwrap() = models;
    }
    let mut state = runtime.state.lock().unwrap();
    state.opened_sessions.insert(sid.to_string());
    state.selection.insert(sid.to_string(), selection);
}

fn build_prompt(prompt: &str, inputs: Option<&Vec<Value>>) -> Result<String, String> {
    let Some(inputs) = inputs.filter(|inputs| !inputs.is_empty()) else {
        return Ok(prompt.to_string());
    };
    let mut text = None;
    let mut paths = Vec::<String>::new();
    for input in inputs {
        match input.get("type").and_then(Value::as_str).unwrap_or("") {
            "text" => {
                text = Some(
                    input
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                )
            }
            "local_image" | "skill" | "mention" => {
                let path = input
                    .get("path")
                    .and_then(Value::as_str)
                    .filter(|path| !path.is_empty())
                    .ok_or("input Grok sans chemin")?;
                if !paths.iter().any(|known| known == path) {
                    paths.push(path.to_string());
                }
            }
            other => return Err(format!("type d'input Grok non supporté : {other}")),
        }
    }
    let mut out = text.unwrap_or_else(|| prompt.to_string());
    if !paths.is_empty() {
        out.push_str(
            "\n\n[Fichiers locaux pertinents (lis-les avec les outils Grok si nécessaire) : ",
        );
        out.push_str(&paths.join(", "));
        out.push(']');
    }
    Ok(out)
}

fn permission_is_edit(params: &Value) -> bool {
    let haystack = [
        params.get("title").and_then(Value::as_str),
        params.get("kind").and_then(Value::as_str),
        params.pointer("/toolCall/title").and_then(Value::as_str),
        params.pointer("/toolCall/kind").and_then(Value::as_str),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
    .to_ascii_lowercase();
    ["edit", "write", "patch", "replace", "create file"]
        .iter()
        .any(|word| haystack.contains(word))
}

fn cancelled_outcome() -> Value {
    json!({"outcome":{"outcome":"cancelled"}})
}

fn selected_outcome(option_id: &str) -> Value {
    json!({"outcome":{"outcome":"selected", "optionId": option_id}})
}

fn auto_permission_outcome(params: &Value) -> Option<Value> {
    let options = params.get("options")?.as_array()?;
    let picked = options
        .iter()
        .find(|option| option.get("kind").and_then(Value::as_str) == Some("allow_always"))
        .or_else(|| {
            options
                .iter()
                .find(|option| option.get("kind").and_then(Value::as_str) == Some("allow_once"))
        })?;
    picked
        .get("optionId")
        .and_then(Value::as_str)
        .map(selected_outcome)
}

fn permission_outcome(params: &Value, answer: Option<Value>) -> Value {
    let options = params
        .get("options")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let valid = |id: &str| {
        options
            .iter()
            .any(|option| option.get("optionId").and_then(Value::as_str) == Some(id))
    };
    let Some(answer) = answer else {
        return cancelled_outcome();
    };
    if let Some(id) = answer.get("optionId").and_then(Value::as_str) {
        return if valid(id) {
            selected_outcome(id)
        } else {
            cancelled_outcome()
        };
    }
    if let Some(id) = answer
        .get("answers")
        .and_then(Value::as_object)
        .and_then(|answers| {
            answers
                .values()
                .filter_map(Value::as_str)
                .find(|id| !id.is_empty())
        })
    {
        return if valid(id) {
            selected_outcome(id)
        } else {
            cancelled_outcome()
        };
    }
    if let Some(allow) = answer.get("allow").and_then(Value::as_bool) {
        let wanted_kind = if allow {
            if answer.get("scope").and_then(Value::as_str) == Some("session") {
                "allow_always"
            } else {
                "allow_once"
            }
        } else {
            "reject_once"
        };
        if let Some(id) = options
            .iter()
            .find(|option| option.get("kind").and_then(Value::as_str) == Some(wanted_kind))
            .and_then(|option| option.get("optionId"))
            .and_then(Value::as_str)
        {
            return selected_outcome(id);
        }
    }
    cancelled_outcome()
}

async fn wait_for_quiet(last_activity: &AtomicU64) {
    let started = now_ms();
    loop {
        let now = now_ms();
        if now.saturating_sub(last_activity.load(Ordering::Relaxed)) >= LATE_EVENT_QUIET_MS
            || now.saturating_sub(started) >= LATE_EVENT_MAX_MS
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}

fn parse_model_line(line: &str) -> Option<String> {
    let trimmed = line.trim();
    let candidate = trimmed
        .strip_prefix("* ")
        .or_else(|| trimmed.strip_prefix("- "))
        .or_else(|| trimmed.starts_with("grok-").then_some(trimmed))?;
    let id = candidate.split_whitespace().next()?.trim();
    id.starts_with("grok-").then(|| id.to_string())
}

fn encode_uri_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        let safe = byte.is_ascii_alphanumeric()
            || matches!(
                *byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            );
        if safe {
            encoded.push(*byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn first_grok_user_title(path: &Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    for line in std::io::BufReader::new(file).lines().take(200) {
        let Ok(line) = line else { continue };
        let Ok(row) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if row.get("type").and_then(Value::as_str) != Some("user") {
            continue;
        }
        let text = match row.get("content") {
            Some(Value::String(text)) => text.clone(),
            Some(Value::Array(blocks)) => blocks
                .iter()
                .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|block| block.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(" "),
            _ => String::new(),
        };
        let open = "<user_query>";
        let close = "</user_query>";
        let Some(start) = text.find(open).map(|index| index + open.len()) else {
            continue;
        };
        let Some(end) = text[start..].find(close).map(|index| start + index) else {
            continue;
        };
        let title = strip_atelier_blocks(text[start..end].trim());
        let title = title.trim();
        if !title.is_empty() {
            return Some(title.chars().take(70).collect());
        }
    }
    None
}

fn strip_atelier_blocks(text: &str) -> String {
    let mut output = text.to_string();
    for (open, close) in [
        (
            "<atelier-gallery-integration>",
            "</atelier-gallery-integration>",
        ),
        ("<atelier-zotero-passages>", "</atelier-zotero-passages>"),
        ("<atelier-kb>", "</atelier-kb>"),
        ("<atelier-file-scope>", "</atelier-file-scope>"),
    ] {
        while let Some(start) = output.find(open) {
            let Some(relative_end) = output[start + open.len()..].find(close) else {
                break;
            };
            let end = start + open.len() + relative_end + close.len();
            let remove_from = output[..start].trim_end_matches(['\r', '\n']).len();
            output.replace_range(remove_from..end, "");
        }
    }
    output.trim().to_string()
}

fn list_grok_sessions_from_base(base: &Path, project_root: &str) -> Vec<Value> {
    let project_dir = base.join(encode_uri_component(project_root));
    let Ok(entries) = std::fs::read_dir(project_dir) else {
        return Vec::new();
    };
    let mut sessions = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            if !metadata.is_dir() {
                return None;
            }
            let id = entry.file_name().to_string_lossy().into_owned();
            let mtime = metadata
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            let title = first_grok_user_title(&entry.path().join("chat_history.jsonl"))
                .unwrap_or_else(|| id.chars().take(8).collect());
            Some((
                mtime,
                json!({
                    "id": id,
                    "title": title,
                    "mtime": mtime,
                    "projectRoot": project_root,
                }),
            ))
        })
        .collect::<Vec<_>>();
    sessions.sort_by_key(|(mtime, _)| std::cmp::Reverse(*mtime));
    sessions
        .into_iter()
        .take(25)
        .map(|(_, session)| session)
        .collect()
}

fn request_cwd(project_root: &str) -> String {
    if project_root.is_empty() {
        std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
    } else {
        project_root.to_string()
    }
}

fn map_effort(effort: &str) -> Option<&'static str> {
    match effort {
        "minimal" | "low" => Some("low"),
        "medium" => Some("medium"),
        "high" | "xhigh" | "max" => Some("high"),
        _ => None,
    }
}

fn resolve_bin() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("ATELIER_GROK_BIN") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let official = PathBuf::from(home).join(".grok/bin/grok");
        if official.is_file() {
            return Some(official);
        }
    }
    which("grok")
}

fn which(name: &str) -> Option<PathBuf> {
    std::process::Command::new("which")
        .arg(name)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim()))
        .filter(|path| !path.as_os_str().is_empty())
}

async fn cli_version(bin: &Path, agent_args: &[String]) -> Option<String> {
    if agent_args != ["agent", "--no-leader", "stdio"] {
        return None;
    }
    let output = tokio::time::timeout(
        Duration::from_secs(8),
        tokio::process::Command::new(bin).arg("--version").output(),
    )
    .await
    .ok()?
    .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .find(|token| token.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .map(str::to_string)
}

fn compare_versions(left: &str, right: &str) -> i64 {
    let parse = |version: &str| {
        version
            .split('.')
            .map(|part| part.parse::<i64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    let (left, right) = (parse(left), parse(right));
    for index in 0..left.len().max(right.len()) {
        let delta = left.get(index).copied().unwrap_or(0) - right.get(index).copied().unwrap_or(0);
        if delta != 0 {
            return delta;
        }
    }
    0
}

fn grok_user_error(error: &AcpRpcError) -> String {
    if error.is_auth_required() {
        "Connexion Grok requise — exécute `grok login` dans un terminal, puis renvoie ton message."
            .into()
    } else if error.transport {
        format!("Grok ACP injoignable : {error}")
    } else {
        format!("Grok ACP : {error}")
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traits::SendMode;

    fn node_bin() -> Option<PathBuf> {
        let output = std::process::Command::new("which")
            .arg("node")
            .output()
            .ok()?;
        output
            .status
            .success()
            .then(|| PathBuf::from(String::from_utf8_lossy(&output.stdout).trim().to_string()))
    }

    fn fixture_provider() -> Option<GrokProvider> {
        let fixture = format!(
            "{}/tests/fixtures/fake_kimi_acp.mjs",
            env!("CARGO_MANIFEST_DIR")
        );
        Some(GrokProvider::with_command(
            node_bin()?,
            vec![fixture, "grok".into()],
        ))
    }

    fn send_request(
        thread_id: &str,
        prompt: &str,
        session_id: Option<&str>,
        events: Arc<StdMutex<Vec<Value>>>,
        cancelled: Arc<AtomicBool>,
    ) -> SendRequest {
        SendRequest {
            thread_id: thread_id.into(),
            turn_id: format!("turn-{thread_id}"),
            prompt: prompt.into(),
            inputs: None,
            project_root: "/tmp".into(),
            session_id: session_id.map(str::to_string),
            model: Some("grok-test".into()),
            effort: Some("medium".into()),
            permission_mode: Some("default".into()),
            mode: SendMode::Normal,
            on_event: Arc::new(move |event| events.lock().unwrap().push(event)),
            on_interaction: None,
            is_cancelled: Arc::new(move || cancelled.load(Ordering::Relaxed)),
            atelier_mcp: None,
        }
    }

    #[test]
    fn effort_is_bounded_to_grok_contract() {
        assert_eq!(map_effort("minimal"), Some("low"));
        assert_eq!(map_effort("medium"), Some("medium"));
        assert_eq!(map_effort("max"), Some("high"));
        assert_eq!(map_effort("turbo"), None);
    }

    #[test]
    fn opaque_permission_ids_round_trip() {
        let params = json!({"options":[
            {"optionId":"once-opaque", "kind":"allow_once"},
            {"optionId":"always-opaque", "kind":"allow_always"},
            {"optionId":"no-opaque", "kind":"reject_once"}
        ]});
        assert_eq!(
            permission_outcome(&params, Some(json!({"optionId":"once-opaque"}))),
            selected_outcome("once-opaque")
        );
        assert_eq!(
            permission_outcome(&params, Some(json!({"optionId":"invented"}))),
            cancelled_outcome()
        );
        assert_eq!(
            auto_permission_outcome(&params),
            Some(selected_outcome("always-opaque"))
        );
    }

    #[tokio::test]
    async fn permission_modes_are_fail_closed_and_bypass_is_explicit() {
        let params = json!({
            "title":"Bash",
            "options":[
                {"optionId":"once", "kind":"allow_once"},
                {"optionId":"always", "kind":"allow_always"},
                {"optionId":"reject", "kind":"reject_once"}
            ]
        });
        let plan = GrokProvider::make_server_handler(Some("plan".into()), None);
        assert_eq!(
            plan("session/request_permission".into(), params.clone()).await,
            cancelled_outcome()
        );
        let bypass = GrokProvider::make_server_handler(Some("bypassPermissions".into()), None);
        assert_eq!(
            bypass("session/request_permission".into(), params).await,
            selected_outcome("always")
        );
    }

    #[test]
    fn structured_inputs_become_explicit_local_references() {
        let inputs = vec![
            json!({"type":"text", "text":"analyse"}),
            json!({"type":"skill", "name":"audit", "path":"/tmp/SKILL.md"}),
            json!({"type":"local_image", "path":"/tmp/a.png"}),
        ];
        let prompt = build_prompt("ignored", Some(&inputs)).unwrap();
        assert!(prompt.starts_with("analyse"));
        assert!(prompt.contains("/tmp/SKILL.md"));
        assert!(prompt.contains("/tmp/a.png"));
    }

    #[test]
    fn model_parser_ignores_headers() {
        assert_eq!(
            parse_model_line("  * grok-4.5 (default)"),
            Some("grok-4.5".into())
        );
        assert_eq!(parse_model_line("Available models:"), None);
    }

    #[test]
    fn version_comparison_is_numeric() {
        assert!(compare_versions("0.2.103", GROK_MIN_VERSION) > 0);
        assert!(compare_versions("0.2.99", GROK_MIN_VERSION) < 0);
    }

    #[test]
    fn native_session_listing_matches_grok_encoded_layout() {
        let dir = tempfile::tempdir().unwrap();
        let project = "/tmp/projet avec espace";
        let session = dir
            .path()
            .join(encode_uri_component(project))
            .join("session-123");
        std::fs::create_dir_all(&session).unwrap();
        std::fs::write(
            session.join("chat_history.jsonl"),
            json!({
                "type":"user",
                "content":[{"type":"text","text":"<system-reminder>x</system-reminder><user_query><atelier-kb>secret</atelier-kb>Ma vraie question</user_query>"}]
            })
            .to_string(),
        )
        .unwrap();
        let listed = list_grok_sessions_from_base(dir.path(), project);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0]["id"], "session-123");
        assert_eq!(listed[0]["title"], "Ma vraie question");
        assert_eq!(listed[0]["projectRoot"], project);
    }

    #[tokio::test]
    async fn acp_xai_tools_model_and_done_are_mapped() {
        let Some(provider) = fixture_provider() else {
            return;
        };
        let events = Arc::new(StdMutex::new(Vec::new()));
        let result = provider
            .send(send_request(
                "thread-a",
                "[xai] [tool]",
                None,
                Arc::clone(&events),
                Arc::new(AtomicBool::new(false)),
            ))
            .await;
        assert!(result.ok, "{result:?}");
        assert!(result.session_id.is_some());
        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| {
            event.get("kind").and_then(Value::as_str) == Some("delta")
                && event
                    .get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| text.contains("notification-xai"))
        }));
        assert!(events.iter().any(|event| {
            event.get("kind").and_then(Value::as_str) == Some("tool_update")
                && event.get("source").and_then(Value::as_str) == Some("grok")
        }));
        assert_eq!(events.last().unwrap()["kind"], "done");
    }

    #[tokio::test]
    async fn session_load_replay_is_suppressed_before_live_turn() {
        let Some(provider) = fixture_provider() else {
            return;
        };
        let events = Arc::new(StdMutex::new(Vec::new()));
        let result = provider
            .send(send_request(
                "thread-resume",
                "message frais",
                Some("session_known_a"),
                Arc::clone(&events),
                Arc::new(AtomicBool::new(false)),
            ))
            .await;
        assert!(result.ok, "{result:?}");
        let serialized = serde_json::to_string(&*events.lock().unwrap()).unwrap();
        assert!(!serialized.contains("réponse historique"));
        assert!(serialized.contains("réponse"));
    }

    #[tokio::test]
    async fn cancellation_and_stop_release_thread_runtime() {
        let Some(provider) = fixture_provider() else {
            return;
        };
        let provider = Arc::new(provider);
        let cancelled = Arc::new(AtomicBool::new(false));
        let req = send_request(
            "thread-cancel",
            "[cancel]",
            None,
            Arc::new(StdMutex::new(Vec::new())),
            Arc::clone(&cancelled),
        );
        let running = {
            let provider = Arc::clone(&provider);
            tokio::spawn(async move { provider.send(req).await })
        };
        tokio::time::sleep(Duration::from_millis(100)).await;
        cancelled.store(true, Ordering::Relaxed);
        let result = running.await.unwrap();
        assert!(result.ok, "cancelled est une fin ACP valide: {result:?}");
        assert!(provider.runtimes.lock().await.contains_key("thread-cancel"));
        provider.stop_session("thread-cancel").await;
        assert!(!provider.runtimes.lock().await.contains_key("thread-cancel"));
    }
}
