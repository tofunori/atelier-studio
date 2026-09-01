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
    atelier_mcp_fingerprint, atelier_mcp_servers, InteractionFn, Provider, ProviderCaps, SendMode,
    SendRequest,
    SendResult,
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
/// Utilisé seulement tant qu'aucune session ACP ni `grok models` n'a répondu.
const FALLBACK_MODEL: &str = "grok-4.6";
const MAX_LIVE_RUNTIMES: usize = 8;
const IDLE_TTL_MS: u64 = 60 * 60 * 1_000;
const LATE_EVENT_QUIET_MS: u64 = 150;
const LATE_EVENT_MAX_MS: u64 = 1_000;
/// Plafond d'un tour `session/prompt` — même valeur que le filet Codex. Un
/// CLI figé (vivant, muet) ne doit jamais laisser un tour sans terminal.
/// Plafond d'un tour `session/prompt` — même valeur que le filet Codex/Grok. Un
/// CLI figé (vivant, muet) ne doit jamais laisser un tour sans terminal.
/// Surchargable pour les tests (`ATELIER_TURN_TIMEOUT_SECS`), jamais en prod
/// (config.yaml ne le propose pas : un tour long reste légitime, seul le CLI
/// FIGÉ est visé).
const TURN_TIMEOUT_SECS_DEFAULT: u64 = 600;

fn turn_timeout_secs() -> u64 {
    std::env::var("ATELIER_TURN_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(TURN_TIMEOUT_SECS_DEFAULT)
}

#[derive(Clone, Default)]
struct GrokSelection {
    model: Option<String>,
    effort: Option<String>,
}

#[derive(Default)]
struct GrokRuntimeState {
    generation: u64,
    authenticated: bool,
    /// sessionId → empreinte des `mcpServers` déclarés à son ouverture. Grok
    /// rejoue TOUT l'historique pendant `session/load` : ne rouvrir que si la
    /// déclaration a réellement changé.
    opened_sessions: HashMap<String, u64>,
    selection: HashMap<String, GrokSelection>,
}

struct GrokThreadRuntime {
    cwd: String,
    acp: AcpServer,
    state: StdMutex<GrokRuntimeState>,
    turn_lock: Mutex<()>,
    active_session: StdMutex<Option<String>>,
    /// Dernière session ouverte pour ce fil. `active_session` ne vaut que
    /// PENDANT un tour ; les opérations d'après-coup (rewind, fork) ont besoin
    /// de savoir à quelle session s'adresser une fois le tour fini.
    last_session: StdMutex<Option<String>>,
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
            last_session: StdMutex::new(None),
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

/// Un modèle annoncé par le CLI Grok. `label` et `efforts` ne sont connus que
/// par la voie ACP (`session/new`) ; le repli `grok models` ne donne qu'un id.
#[derive(Clone, Debug, Default, PartialEq)]
struct GrokModelInfo {
    id: String,
    label: Option<String>,
    efforts: Vec<String>,
    default_effort: Option<String>,
}

/// Catalogue vivant du CLI. L'ordre est celui annoncé par Grok — jamais trié :
/// c'est un tri alphabétique qui collait Atelier sur `grok-4.5` alors que le
/// CLI proposait `grok-4.6`.
#[derive(Clone, Debug, Default)]
struct GrokCatalog {
    models: Vec<GrokModelInfo>,
    current: Option<String>,
}

impl GrokCatalog {
    fn ids(&self) -> Vec<String> {
        self.models.iter().map(|model| model.id.clone()).collect()
    }

    fn get(&self, id: &str) -> Option<&GrokModelInfo> {
        self.models.iter().find(|model| model.id == id)
    }

    /// Modèle courant annoncé par Grok, à défaut le premier du catalogue.
    fn current_model(&self) -> Option<&GrokModelInfo> {
        self.current
            .as_deref()
            .and_then(|id| self.get(id))
            .or_else(|| self.models.first())
    }

    /// Fusionne les ids issus de `grok models` sans écraser ce que la voie ACP
    /// a déjà appris (libellés, efforts) : la sonde CLI est moins riche.
    fn merge_cli_ids(&mut self, ids: Vec<String>) {
        for id in ids {
            if self.get(&id).is_none() {
                self.models.push(GrokModelInfo {
                    id,
                    ..Default::default()
                });
            }
        }
    }
}

pub struct GrokProvider {
    bin: PathBuf,
    agent_args: Vec<String>,
    runtimes: Mutex<HashMap<String, Arc<GrokThreadRuntime>>>,
    catalog: StdMutex<GrokCatalog>,
    /// Dernier `availableCommands` annoncé par le CLI. Ces commandes sont
    /// internes à Grok (compact, context, hooks-list…) : aucun scan de disque
    /// ne peut les découvrir.
    native_commands: Arc<StdMutex<Vec<Value>>>,
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
            catalog: StdMutex::new(GrokCatalog::default()),
            native_commands: Arc::new(StdMutex::new(Vec::new())),
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
        // Le catalogue complet (libellés, efforts, modèle courant) est déjà
        // là : l'attendre jusqu'au premier `session/new` afficherait des ids
        // bruts et masquerait les efforts propres au modèle.
        absorb_model_state(&self.catalog, init.meta.pointer("/modelState"));

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
        // `None` = l'appelant ne déclare rien de neuf (compact) : toute session
        // déjà ouverte lui convient, quelle que soit sa déclaration MCP.
        mcp_servers: Option<Value>,
    ) -> Result<String, String> {
        let declares = mcp_servers.clone().unwrap_or_else(|| json!([]));
        let empreinte = atelier_mcp_fingerprint(&declares);
        if let Some(sid) = requested.filter(|sid| !sid.is_empty()) {
            // Voie rapide : session déjà ouverte AVEC la même déclaration MCP.
            // Le drapeau `refresh_mcp` valait `atelier_mcp.is_some()`, donc
            // toujours vrai depuis que le serveur atelier part sur tout fil —
            // un `session/load` par envoi, avec rejeu complet de l'historique
            // et 150 ms à 1 s d'attente calme.
            let ouverte = runtime
                .state
                .lock()
                .unwrap()
                .opened_sessions
                .get(sid)
                .copied();
            let deja_bonne = match ouverte {
                Some(connue) => mcp_servers.is_none() || connue == empreinte,
                None => false,
            };
            if deja_bonne {
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
                    json!({"sessionId": sid, "cwd": runtime.cwd, "mcpServers": declares}),
                    Some(30_000),
                )
                .await;
            replay_activity.store(now_ms(), Ordering::Relaxed);
            wait_for_quiet(&replay_activity).await;
            runtime.acp.clear_session_handler(sid).await;
            match loaded {
                Ok(result) => {
                    remember_session_result(runtime, sid, &result, &self.catalog, empreinte);
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
                json!({"cwd": runtime.cwd, "mcpServers": declares}),
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
        remember_session_result(runtime, &sid, &result, &self.catalog, empreinte);
        Ok(sid)
    }

    async fn align_selection(
        &self,
        runtime: &GrokThreadRuntime,
        sid: &str,
        model: Option<&str>,
        effort: Option<&str>,
    ) -> Result<GrokSelection, String> {
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
        // L'effort dépend du modèle : `xhigh` existe sur 4.6, pas sur 4.5. On
        // consulte donc le catalogue APRÈS avoir résolu le modèle visé.
        let supported = wanted_model
            .as_deref()
            .and_then(|id| {
                self.catalog
                    .lock()
                    .unwrap()
                    .get(id)
                    .map(|model| model.efforts.clone())
            })
            .unwrap_or_default();
        let effort = match effort.filter(|value| !value.is_empty()) {
            Some(value) => Some(
                map_effort_for(&supported, value)
                    .ok_or_else(|| format!("effort Grok inconnu : {value}"))?,
            ),
            None => None,
        };
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
                Some(atelier_mcp_servers(req.atelier_mcp.as_ref())),
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
        let commands_cache = Arc::clone(&self.native_commands);
        let handler: SessionUpdateHandler = Arc::new(move |update: &Value| {
            activity.store(now_ms(), Ordering::Relaxed);
            if update.get("sessionUpdate").and_then(Value::as_str)
                == Some("available_commands_update")
            {
                if let Some(commands) = update
                    .get("availableCommands")
                    .and_then(Value::as_array)
                    .filter(|commands| !commands.is_empty())
                {
                    *commands_cache.lock().unwrap() = commands.clone();
                }
            }
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

        let prompt_result = tokio::time::timeout(
            // Réplique le filet Codex : `session/prompt` est en attente
            // illimitée (acp_rpc), donc un CLI vivant mais FIGÉ (ni réponse ni
            // mort) laissait le tour « en cours » pour toujours, sans terminal
            // — l'interrupt ne peut rien contre un agent qui n'écoute plus.
            Duration::from_secs(turn_timeout_secs()),
            runtime.acp.request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type":"text", "text": prompt}]}),
                None,
            ),
        )
        .await
        .unwrap_or_else(|_| Err(AcpRpcError::transport(format!(
            "timeout Grok ({}s) — CLI figé sans répondre",
            turn_timeout_secs()
        ))));
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

    /// Interjection en plein tour (`x.ai/interject`). Retourne `None` si
    /// aucun tour n'est en vol pour ce fil — l'appelant retombe alors sur un
    /// envoi normal.
    async fn interject(&self, req: &SendRequest) -> Option<SendResult> {
        let runtime = self.runtimes.lock().await.get(&req.thread_id).cloned()?;
        let session_id = runtime.active_session.lock().unwrap().clone()?;
        let text = build_prompt(&req.prompt, req.inputs.as_ref()).ok()?;
        match runtime
            .acp
            .request(
                "_x.ai/interject",
                json!({"sessionId": session_id, "text": text}),
                Some(15_000),
            )
            .await
        {
            Ok(_) => {
                (req.on_event)(json!({"kind":"tool","name":"__steered"}));
                Some(SendResult {
                    session_id: Some(session_id),
                    ok: true,
                    error: None,
                })
            }
            // Grok a refusé (session inconnue, tour déjà clos) : ne pas
            // avaler le message, laisser l'envoi normal le porter.
            Err(_) => None,
        }
    }

    /// Catalogue natif (`x.ai/models/list`) : même charge utile que
    /// `session/new`, mais disponible sans ouvrir de session ni attendre un
    /// tour. Retourne `None` si aucun runtime n'est vivant.
    async fn native_models(&self) -> Option<GrokCatalog> {
        let runtime = self.runtimes.lock().await.values().next().cloned()?;
        let result = runtime
            .acp
            .request("_x.ai/models/list", json!({}), Some(10_000))
            .await
            .ok()?;
        // Le handler enveloppe sa réponse dans `result`.
        let state = result.get("result").unwrap_or(&result);
        absorb_model_state(&self.catalog, Some(state));
        Some(self.catalog.lock().unwrap().clone())
    }

    /// Repli hors session ACP : `grok models` ne donne que des identifiants.
    /// Il complète le catalogue sans jamais écraser ce que `session/new` a
    /// appris (libellés officiels, efforts par modèle).
    async fn discover_models(&self) -> GrokCatalog {
        // Les fixtures ACP de test ne sont pas un CLI Grok et ne doivent pas
        // recevoir une commande `models` parasite.
        if self.agent_args != vec!["agent", "--no-leader", "stdio"] {
            return self.catalog.lock().unwrap().clone();
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
            let ids: Vec<String> = text.lines().filter_map(parse_model_line).collect();
            if !ids.is_empty() {
                self.catalog.lock().unwrap().merge_cli_ids(ids);
            }
        }
        self.catalog.lock().unwrap().clone()
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
            // `x.ai/interject` : Grok accepte une interjection en plein tour
            // et la draine au prochain point sûr. Ce n'est pas une file
            // d'attente déguisée — le tour en cours la prend en compte.
            steering: true,
            queue: true,
            goals: false,
            tools: true,
        }
    }

    fn models(&self) -> Vec<String> {
        self.catalog.lock().unwrap().ids()
    }

    fn default_model(&self) -> String {
        self.catalog
            .lock()
            .unwrap()
            .current_model()
            .map(|model| model.id.clone())
            .unwrap_or_else(|| FALLBACK_MODEL.to_string())
    }

    /// `x.ai/rewind/execute` en mode `conversation_only` : Atelier restaure
    /// déjà les fichiers avec son propre instantané git, laisser Grok y
    /// toucher aussi ferait deux vérités sur le disque.
    async fn rewind(&self, thread_id: &str, prompt_index: usize) -> Result<Value, String> {
        let runtime = self
            .runtimes
            .lock()
            .await
            .get(thread_id)
            .cloned()
            .ok_or("aucune session Grok vivante pour ce fil")?;
        let session_id = runtime
            .active_session
            .lock()
            .unwrap()
            .clone()
            .or_else(|| runtime.last_session.lock().unwrap().clone())
            .ok_or("aucune session Grok connue pour ce fil")?;
        runtime
            .acp
            .request(
                "_x.ai/rewind/execute",
                json!({
                    "sessionId": session_id,
                    "targetPromptIndex": prompt_index,
                    "mode": "conversation_only",
                    "force": true,
                }),
                Some(30_000),
            )
            .await
            .map_err(|error| grok_user_error(&error))
    }

    /// `x.ai/session/fork` : la branche part d'une VRAIE copie de session,
    /// pas d'un transcript recollé. Le fil source n'est pas touché.
    async fn fork_session(
        &self,
        thread_id: &str,
        source_session: &str,
        cwd: &str,
        prompt_index: Option<usize>,
    ) -> Result<String, String> {
        let runtime = self
            .runtimes
            .lock()
            .await
            .get(thread_id)
            .cloned()
            .ok_or("aucune session Grok connue pour ce fil")?;
        let mut params = json!({
            "sourceSessionId": source_session,
            "sourceCwd": cwd,
            "newCwd": cwd,
        });
        if let Some(index) = prompt_index {
            params["targetPromptIndex"] = json!(index);
        }
        let result = runtime
            .acp
            .request("_x.ai/session/fork", params, Some(60_000))
            .await
            .map_err(|error| grok_user_error(&error))?;
        result
            .get("newSessionId")
            .or_else(|| result.pointer("/result/newSessionId"))
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .map(str::to_string)
            .ok_or_else(|| "fork Grok sans newSessionId".to_string())
    }

    fn native_commands(&self) -> Vec<Value> {
        self.native_commands.lock().unwrap().clone()
    }

    fn efforts(&self) -> Vec<String> {
        let catalog = self.catalog.lock().unwrap();
        let efforts = catalog
            .current_model()
            .map(|model| model.efforts.clone())
            .unwrap_or_default();
        if efforts.is_empty() {
            fallback_efforts()
        } else {
            efforts
        }
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        if req.mode == SendMode::Steer {
            if let Some(result) = self.interject(&req).await {
                return result;
            }
            // Aucun tour en vol : l'interjection devient un envoi normal
            // plutôt que d'être perdue.
        }
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
                None,
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
                Ok(()) => {
                    absorb_model_state(&self.catalog, init.meta.pointer("/modelState"));
                }
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
        let catalog = self.discover_models().await;
        probe["models"] = json!(catalog.models.len());
        if catalog.models.is_empty() {
            probe["state"] = json!("model_config_needed");
        }
        Some(probe)
    }

    async fn dynamic_models(&self) -> Option<Value> {
        // Priorité au catalogue natif : il porte libellés et efforts, là où
        // `grok models` ne donne que des identifiants nus.
        let catalog = match self.native_models().await {
            Some(catalog) if !catalog.models.is_empty() => catalog,
            _ => self.discover_models().await,
        };
        let mut reasoning = serde_json::Map::new();
        let mut labels = serde_json::Map::new();
        for model in &catalog.models {
            let efforts = if model.efforts.is_empty() {
                fallback_efforts()
            } else {
                model.efforts.clone()
            };
            let default_effort = model
                .default_effort
                .clone()
                .filter(|value| efforts.iter().any(|listed| listed == value))
                .or_else(|| fallback_default_effort(&efforts));
            reasoning.insert(
                model.id.clone(),
                json!({"supported_efforts": efforts, "default_effort": default_effort}),
            );
            if let Some(label) = &model.label {
                labels.insert(model.id.clone(), json!(label));
            }
        }
        Some(json!({
            "models": catalog.ids(),
            "defaultModel": self.default_model(),
            "modelReasoning": reasoning,
            "modelLabels": labels,
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
    catalog: &StdMutex<GrokCatalog>,
    mcp_empreinte: u64,
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
    absorb_model_state(catalog, result.pointer("/models"));
    *runtime.last_session.lock().unwrap() = Some(sid.to_string());
    let mut state = runtime.state.lock().unwrap();
    state.opened_sessions.insert(sid.to_string(), mcp_empreinte);
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

/// Absorbe un bloc `{currentModelId, availableModels}`. Grok le sert à deux
/// moments : dans `_meta.modelState` d'`initialize` (donc dès le démarrage,
/// sans session) et dans `session/new`. L'ordre annoncé est conservé tel quel.
fn absorb_model_state(catalog: &StdMutex<GrokCatalog>, state: Option<&Value>) {
    let Some(state) = state else { return };
    let models = state
        .get("availableModels")
        .and_then(Value::as_array)
        .map(|models| {
            models
                .iter()
                .filter_map(parse_model_entry)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if models.is_empty() {
        return;
    }
    let current = state
        .get("currentModelId")
        .and_then(Value::as_str)
        .map(str::to_string);
    *catalog.lock().unwrap() = GrokCatalog { models, current };
}

/// Une entrée de `/models/availableModels` : id, nom officiel, et efforts de
/// raisonnement propres à ce modèle (`xhigh` n'existe que sur certains).
fn parse_model_entry(entry: &Value) -> Option<GrokModelInfo> {
    let id = entry
        .get("modelId")
        .or_else(|| entry.get("id"))
        .or_else(|| entry.get("value"))
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())?
        .to_string();
    let label = entry
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty())
        .map(str::to_string);
    let listed = entry
        .pointer("/_meta/reasoningEfforts")
        .and_then(Value::as_array);
    let mut efforts = Vec::new();
    let mut flagged_default = None;
    for effort in listed.into_iter().flatten() {
        let Some(effort_id) = effort
            .get("id")
            .or_else(|| effort.get("value"))
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if flagged_default.is_none() && effort.get("default").and_then(Value::as_bool) == Some(true)
        {
            flagged_default = Some(effort_id.to_string());
        }
        efforts.push(effort_id.to_string());
    }
    // `_meta.reasoningEffort` est l'effort auquel le CLI tourne réellement, et
    // fait donc foi. Le drapeau `default` ne suffit pas : 4.6 marque `xhigh`
    // ET `high` par défaut, et suivre le premier ferait raisonner Atelier plus
    // fort que la TUI sur le même modèle.
    let default_effort = entry
        .pointer("/_meta/reasoningEffort")
        .and_then(Value::as_str)
        .filter(|value| efforts.iter().any(|listed| listed == value))
        .map(str::to_string)
        .or(flagged_default);
    Some(GrokModelInfo {
        id,
        label,
        efforts,
        default_effort,
    })
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

/// Efforts servis tant que Grok n'a rien annoncé pour ce modèle.
///
/// Le catalogue ne porte d'efforts qu'après un `session/new` ACP : au démarrage
/// de l'app, et jusqu'au premier message, c'est CE repli que l'UI affiche. Il
/// est donc visible en permanence, pas seulement en cas de panne — un repli à
/// trois niveaux faisait disparaître `xhigh` du slider à chaque lancement alors
/// que Grok 4.6 l'annonce (`["xhigh","high","medium","low"]`, cf. le fixture
/// `session_new_fixture`).
///
/// Aligné sur ce que Grok annonce réellement, ni plus ni moins : `minimal` et
/// `max` n'en font pas partie. Sur un modèle qui ne supporte pas `xhigh`
/// (Grok 4.5), `map_effort_for` le ramène à `high` — le repli reste sûr.
fn fallback_efforts() -> Vec<String> {
    vec!["low".into(), "medium".into(), "high".into(), "xhigh".into()]
}

/// Effort par défaut quand le modèle n'en annonce aucun.
///
/// `efforts.last()` ne peut pas servir : l'ordre appartient au provider et Grok
/// annonce du plus fort au plus faible, donc le « dernier » vaut `low` sur un
/// modèle riche et `xhigh` sur le repli — deux politiques opposées selon la
/// source. On nomme la valeur voulue au lieu de la déduire d'un ordre qui n'est
/// pas un contrat ; `high` est aussi ce que Grok annonce lui-même pour 4.6.
fn fallback_default_effort(efforts: &[String]) -> Option<String> {
    ["high", "medium", "low"]
        .iter()
        .find(|candidate| efforts.iter().any(|listed| listed == *candidate))
        .map(|value| (*value).to_string())
        .or_else(|| efforts.last().cloned())
}

/// Traduit un effort de l'UI vers un effort que CE modèle accepte. Un effort
/// annoncé par Grok passe tel quel — c'est ce qui rend `xhigh` utilisable sur
/// 4.6 ; sinon on retombe sur le repli historique à trois niveaux.
fn map_effort_for(supported: &[String], effort: &str) -> Option<String> {
    if supported.iter().any(|value| value == effort) {
        return Some(effort.to_string());
    }
    // Sinon repli à trois niveaux : c'est ce qu'Atelier a toujours envoyé, et
    // Grok l'accepte pour tous ses modèles connus.
    Some(map_effort(effort)?.to_string())
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
        // Le CLI renvoie souvent un `-32603 Internal error` NU : la cause
        // réelle (crédits épuisés, 401, contexte incompactable) ne vit que
        // dans `data` ou dans son journal. Sans elle, le chat n'affichait
        // qu'un code opaque, impossible à actionner.
        let detail = acp_data_detail(error.data.as_ref()).or_else(grok_last_cli_error);
        match detail {
            Some(detail) => {
                let conseil = grok_error_hint(&detail).unwrap_or("");
                format!("Grok ACP : {error} — {detail}{conseil}")
            }
            None => format!("Grok ACP : {error}"),
        }
    }
}

/// Détail lisible porté par `error.data` (string nue ou objet).
fn acp_data_detail(data: Option<&Value>) -> Option<String> {
    let data = data?;
    if let Some(text) = data.as_str() {
        return (!text.is_empty()).then(|| text.to_string());
    }
    for key in ["message", "details", "detail", "reason", "error"] {
        if let Some(text) = data.get(key).and_then(Value::as_str).filter(|t| !t.is_empty()) {
            return Some(text.to_string());
        }
    }
    None
}

/// Conseil actionnable pour les causes que le CLI ne réessaie pas.
fn grok_error_hint(detail: &str) -> Option<&'static str> {
    let bas = detail.to_lowercase();
    if bas.contains("balance exhausted")
        || bas.contains("out of credits")
        || bas.contains("spending limit")
        || bas.contains("402")
    {
        Some(". Crédit Grok épuisé : recharge le compte, le CLI ne réessaiera pas.")
    } else if bas.contains("too large to compact") || bas.contains("can't be summarized") {
        Some(". La conversation ne peut plus être compactée : démarre-en une nouvelle.")
    } else if bas.contains("401") || bas.contains("unauthorized") || bas.contains("re-authenticate")
    {
        Some(". Exécute `grok login`, puis renvoie ton message.")
    } else if bas.contains("rate limit") {
        Some(". Limite de débit atteinte : attends un instant puis réessaie.")
    } else {
        None
    }
}

/// Dernier échec terminal journalisé par le CLI (`~/.grok/logs/unified.jsonl`).
/// Ignoré s'il est vieux : mieux vaut un code nu qu'une cause d'il y a une heure.
fn grok_last_cli_error() -> Option<String> {
    use std::io::{Read, Seek, SeekFrom};
    let home = std::env::var("HOME").ok()?;
    let path = std::path::Path::new(&home).join(".grok/logs/unified.jsonl");
    let mut file = std::fs::File::open(&path).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(96 * 1024)))
        .ok()?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).ok()?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    grok_log_failure(&String::from_utf8_lossy(&buf), now, 120)
}

fn grok_log_failure(tail: &str, now: i64, age_max_s: i64) -> Option<String> {
    for line in tail.lines().rev().take(400) {
        let Ok(entry) = serde_json::from_str::<Value>(line.trim()) else {
            continue;
        };
        if !matches!(
            entry.get("msg").and_then(Value::as_str),
            Some("turn.terminal_failure" | "shell.turn.inference_failed")
        ) {
            continue;
        }
        let Some(detail) = entry
            .pointer("/ctx/message")
            .and_then(Value::as_str)
            .filter(|m| !m.is_empty())
        else {
            continue;
        };
        let horodatage = entry.get("ts").and_then(Value::as_str).and_then(iso_epoch_s);
        return match horodatage {
            Some(ts) if now - ts <= age_max_s => Some(detail.chars().take(300).collect()),
            _ => None,
        };
    }
    None
}

/// `2026-08-14T01:21:11.222Z` → secondes epoch. Le journal du CLI est en UTC.
fn iso_epoch_s(ts: &str) -> Option<i64> {
    let nombre = |plage: std::ops::Range<usize>| ts.get(plage)?.parse::<i64>().ok();
    let (annee, mois, jour) = (nombre(0..4)?, nombre(5..7)?, nombre(8..10)?);
    let (heure, minute, seconde) = (nombre(11..13)?, nombre(14..16)?, nombre(17..19)?);
    if !(1..=12).contains(&mois) {
        return None;
    }
    // days_from_civil (Howard Hinnant) : calendrier grégorien proleptique.
    let annee = annee - i64::from(mois <= 2);
    let ere = if annee >= 0 { annee } else { annee - 399 } / 400;
    let annee_ere = annee - ere * 400;
    let jour_annee = (153 * (mois + if mois > 2 { -3 } else { 9 }) + 2) / 5 + jour - 1;
    let jour_ere = annee_ere * 365 + annee_ere / 4 - annee_ere / 100 + jour_annee;
    let jours = ere * 146_097 + jour_ere - 719_468;
    Some(jours * 86_400 + heure * 3_600 + minute * 60 + seconde)
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
            fast_mode: false,
            permission_mode: Some("default".into()),
            fork_pending: false,
            mode: SendMode::Normal,
            on_event: Arc::new(move |event| events.lock().unwrap().push(event)),
            on_interaction: None,
            is_cancelled: Arc::new(move || cancelled.load(Ordering::Relaxed)),
            consigne: None,
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

    /// Grok n'a pas de mécanisme de consigne en v1 : une consigne posée sur
    /// la requête ne doit modifier AUCUNE charge utile — plutôt qu'être
    /// injectée au hasard dans le prompt. Le jour où on l'implémente, ce
    /// test tombe : c'est le signal d'écrire le vrai.
    #[test]
    fn une_consigne_ne_fuit_pas_dans_la_charge_grok() {
        let events = Arc::new(StdMutex::new(Vec::new()));
        let cancelled = Arc::new(AtomicBool::new(false));
        let sans = send_request(
            "t-consigne",
            "analyse ce fichier",
            None,
            Arc::clone(&events),
            Arc::clone(&cancelled),
        );
        let mut avec = send_request(
            "t-consigne",
            "analyse ce fichier",
            None,
            events,
            cancelled,
        );
        avec.consigne = Some("Réponds directement, sans préambule.".into());
        assert_eq!(
            build_prompt(&sans.prompt, sans.inputs.as_ref()),
            build_prompt(&avec.prompt, avec.inputs.as_ref()),
            "la consigne a fui dans la charge Grok",
        );
    }

    #[test]
    fn model_parser_ignores_headers() {
        assert_eq!(
            parse_model_line("  * grok-4.5 (default)"),
            Some("grok-4.5".into())
        );
        assert_eq!(parse_model_line("Available models:"), None);
    }

    fn session_new_fixture() -> Value {
        serde_json::from_str(include_str!("../tests/fixtures/grok_session_new.json")).unwrap()
    }

    /// Le catalogue reflétait un tri alphabétique : `grok-4.5` passait devant
    /// `grok-4.6` et devenait le défaut, alors que le CLI annonce l'inverse.
    #[test]
    fn le_catalogue_suit_lordre_et_le_modele_courant_du_cli() {
        let runtime = GrokThreadRuntime::new("/tmp/projet".into());
        let catalog = StdMutex::new(GrokCatalog::default());
        remember_session_result(&runtime, "sid-1", &session_new_fixture(), &catalog, 0);

        let catalog = catalog.lock().unwrap();
        assert_eq!(
            catalog.ids(),
            vec![
                "grok-4.6",
                "grok-4.5",
                "ocx-gpt-5-6-sol",
                "ocx-anthropic-claude-opus-5"
            ]
        );
        assert_eq!(catalog.current.as_deref(), Some("grok-4.6"));
        assert_eq!(catalog.current_model().unwrap().id, "grok-4.6");

        let latest = catalog.get("grok-4.6").unwrap();
        assert_eq!(latest.label.as_deref(), Some("Grok 4.6"));
        assert_eq!(latest.efforts, vec!["xhigh", "high", "medium", "low"]);
        // 4.6 marque xhigh ET high `default: true` ; c'est `_meta.reasoningEffort`
        // qui dit à quoi le CLI tourne vraiment, sinon Atelier raisonnerait plus
        // fort que la TUI sur le même modèle.
        assert_eq!(latest.default_effort.as_deref(), Some("high"));

        // xhigh n'existe pas sur 4.5 : le proposer serait un effort fantôme.
        let previous = catalog.get("grok-4.5").unwrap();
        assert_eq!(previous.label.as_deref(), Some("Grok 4.5"));
        assert!(!previous.efforts.iter().any(|effort| effort == "xhigh"));
        assert_eq!(previous.default_effort.as_deref(), Some("high"));

        // Un modèle sans `_meta.reasoningEfforts` reste utilisable.
        let routed = catalog.get("ocx-gpt-5-6-sol").unwrap();
        assert!(routed.efforts.is_empty());
        assert_eq!(routed.default_effort, None);
    }

    #[tokio::test]
    async fn le_catalogue_dynamique_sert_libelles_et_efforts_par_modele() {
        // Des args non-stdio empêchent la sonde `grok models` de s'exécuter :
        // seul l'apport ACP est mesuré ici.
        let provider = GrokProvider::with_command(PathBuf::from("/bin/false"), vec!["fixture".into()]);
        let runtime = GrokThreadRuntime::new("/tmp/projet".into());
        remember_session_result(&runtime, "sid-1", &session_new_fixture(), &provider.catalog, 0);

        assert_eq!(provider.default_model(), "grok-4.6");
        assert_eq!(provider.efforts(), vec!["xhigh", "high", "medium", "low"]);

        let dynamic = provider.dynamic_models().await.unwrap();
        assert_eq!(dynamic["defaultModel"], "grok-4.6");
        assert_eq!(dynamic["modelLabels"]["grok-4.6"], "Grok 4.6");
        assert_eq!(dynamic["modelLabels"]["grok-4.5"], "Grok 4.5");
        assert_eq!(
            dynamic["modelReasoning"]["grok-4.6"]["supported_efforts"],
            json!(["xhigh", "high", "medium", "low"])
        );
        assert_eq!(dynamic["modelReasoning"]["grok-4.6"]["default_effort"], "high");
        assert_eq!(
            dynamic["modelReasoning"]["grok-4.5"]["supported_efforts"],
            json!(["high", "medium", "low"])
        );
        // Modèle muet sur les efforts : repli, pas de panique. Il porte xhigh
        // depuis qu'on a constaté que ce repli est ce que l'UI affiche à CHAQUE
        // démarrage (catalogue vide avant le premier `session/new`) — un repli
        // à trois niveaux effaçait xhigh du slider à chaque lancement.
        assert_eq!(
            dynamic["modelReasoning"]["ocx-gpt-5-6-sol"]["supported_efforts"],
            json!(["low", "medium", "high", "xhigh"])
        );
        assert_eq!(
            dynamic["modelReasoning"]["ocx-gpt-5-6-sol"]["default_effort"],
            "high"
        );
        assert!(dynamic["modelLabels"].get("aucun-modele").is_none());
    }

    /// Le steering déclaré doit être réel : sans tour en vol, l'interjection
    /// ne doit pas être avalée mais repartir en envoi normal (sinon le
    /// message de Thierry disparaît sans trace).
    #[test]
    fn le_steering_est_declare_dans_les_capacites() {
        let provider = GrokProvider::with_command(
            PathBuf::from("/bin/true"),
            vec!["agent".into(), "--no-leader".into(), "stdio".into()],
        );
        assert!(
            provider.caps().steering,
            "x.ai/interject est disponible : la capacité doit l'annoncer"
        );
    }

    /// Sans runtime pour ce fil, `interject` renvoie None — l'appelant
    /// bascule alors sur `send_acp`, jamais de message perdu.
    #[tokio::test]
    async fn une_interjection_sans_tour_en_vol_ne_prend_pas_la_main() {
        let provider = GrokProvider::with_command(
            PathBuf::from("/bin/true"),
            vec!["agent".into(), "--no-leader".into(), "stdio".into()],
        );
        let req = SendRequest {
            thread_id: "fil-sans-tour".into(),
            turn_id: "t1".into(),
            prompt: "attends, change d'approche".into(),
            inputs: None,
            project_root: "/tmp".into(),
            session_id: None,
            model: None,
            effort: None,
            fast_mode: false,
            permission_mode: Some("default".into()),
            fork_pending: false,
            mode: SendMode::Steer,
            on_event: Arc::new(|_| {}),
            on_interaction: None,
            is_cancelled: Arc::new(|| false),
            consigne: None,
            atelier_mcp: None,
        };
        assert!(provider.interject(&req).await.is_none());
    }

    /// Grok annonce son catalogue dès `initialize`. S'en remettre au seul
    /// `session/new` afficherait des ids bruts et aucun effort tant que
    /// l'utilisateur n'a pas envoyé son premier message.
    #[test]
    fn le_catalogue_est_connu_des_initialize_sans_session() {
        let catalog = StdMutex::new(GrokCatalog::default());
        let init_meta = json!({
            "grokShell": true,
            "agentVersion": "1.0.3",
            "modelState": session_new_fixture()["models"].clone(),
        });

        absorb_model_state(&catalog, init_meta.pointer("/modelState"));

        let catalog = catalog.lock().unwrap();
        assert_eq!(catalog.current.as_deref(), Some("grok-4.6"));
        assert_eq!(
            catalog.get("grok-4.6").unwrap().label.as_deref(),
            Some("Grok 4.6")
        );
        assert!(catalog
            .get("grok-4.6")
            .unwrap()
            .efforts
            .iter()
            .any(|effort| effort == "xhigh"));
    }

    /// Un `_meta` sans `modelState` (agent tiers, version ancienne) ne doit ni
    /// vider le catalogue ni faire échouer l'initialisation.
    #[test]
    fn un_initialize_muet_laisse_le_catalogue_intact() {
        let catalog = StdMutex::new(GrokCatalog::default());
        remember_session_result(
            &GrokThreadRuntime::new("/tmp/projet".into()),
            "sid-1",
            &session_new_fixture(),
            &catalog,
            0,
        );

        absorb_model_state(&catalog, json!({"grokShell": true}).pointer("/modelState"));
        absorb_model_state(&catalog, Some(&json!({"availableModels": []})));

        assert_eq!(catalog.lock().unwrap().current.as_deref(), Some("grok-4.6"));
        assert_eq!(catalog.lock().unwrap().models.len(), 4);
    }

    /// La sonde `grok models` est plus pauvre que l'ACP : elle complète, mais
    /// n'écrase jamais les libellés et efforts déjà appris.
    #[test]
    fn la_sonde_cli_complete_sans_ecraser_lacp() {
        let mut catalog = GrokCatalog::default();
        catalog.models.push(GrokModelInfo {
            id: "grok-4.6".into(),
            label: Some("Grok 4.6".into()),
            efforts: vec!["xhigh".into()],
            default_effort: Some("xhigh".into()),
        });
        catalog.merge_cli_ids(vec!["grok-4.6".into(), "grok-code-1".into()]);

        assert_eq!(catalog.ids(), vec!["grok-4.6", "grok-code-1"]);
        assert_eq!(catalog.get("grok-4.6").unwrap().label.as_deref(), Some("Grok 4.6"));
        assert_eq!(catalog.get("grok-code-1").unwrap().label, None);
    }

    #[test]
    fn le_repli_expose_xhigh_avant_toute_session() {
        // Aucun `session/new` : le catalogue est vide, c'est le repli qui part
        // vers l'UI. C'est l'état de CHAQUE démarrage d'app, pas un cas d'erreur.
        let provider = GrokProvider::with_command(PathBuf::from("/bin/false"), vec!["fixture".into()]);
        assert_eq!(provider.efforts(), vec!["low", "medium", "high", "xhigh"]);
        // et il reste envoyable même sur un modèle qui ne l'annonce pas
        assert_eq!(map_effort_for(&[], "xhigh").as_deref(), Some("high"));
        // élargir le repli ne doit PAS remonter le défaut : `high` reste `high`
        assert_eq!(fallback_default_effort(&fallback_efforts()).as_deref(), Some("high"));
        // ordre décroissant annoncé par Grok : même défaut, pas `low`
        let annonce: Vec<String> = ["xhigh", "high", "medium", "low"].iter().map(|v| v.to_string()).collect();
        assert_eq!(fallback_default_effort(&annonce).as_deref(), Some("high"));
    }

    #[test]
    fn les_efforts_annonces_passent_tels_quels() {
        let riche = vec!["xhigh".into(), "high".into(), "medium".into(), "low".into()];
        assert_eq!(map_effort_for(&riche, "xhigh").as_deref(), Some("xhigh"));
        assert_eq!(map_effort_for(&riche, "medium").as_deref(), Some("medium"));
        // `max` n'est pas un effort Grok : il retombe sur le repli historique.
        assert_eq!(map_effort_for(&riche, "max").as_deref(), Some("high"));

        // Modèle sans xhigh : l'ancien écrasement vers `high` reste correct.
        let pauvre = vec!["high".into(), "medium".into(), "low".into()];
        assert_eq!(map_effort_for(&pauvre, "xhigh").as_deref(), Some("high"));
        assert_eq!(map_effort_for(&[], "minimal").as_deref(), Some("low"));
        assert_eq!(map_effort_for(&riche, "inconnu"), None);
    }

    #[test]
    fn une_erreur_interne_nue_recupere_sa_cause_dans_le_journal() {
        // Cas réel : `-32603 Internal error` renvoyé au chat pendant que le
        // journal du CLI disait « usage balance exhausted » (HTTP 402).
        let journal = [
            json!({"ts":"2026-08-14T01:21:08.876Z","msg":"shell.turn.inference_retry",
                   "ctx":{"reason":"request error"}}),
            json!({"ts":"2026-08-14T01:21:11.221Z","msg":"shell.turn.inference_failed",
                   "ctx":{"status_code":402,
                          "message":"API error (status 402 Payment Required): Grok Build usage balance exhausted"}}),
        ]
        .map(|l| l.to_string())
        .join("\n");
        let horodatage = iso_epoch_s("2026-08-14T01:21:11.221Z").unwrap();
        let cause = grok_log_failure(&journal, horodatage + 3, 120).unwrap();
        assert!(cause.contains("usage balance exhausted"));
        assert_eq!(
            grok_error_hint(&cause),
            Some(". Crédit Grok épuisé : recharge le compte, le CLI ne réessaiera pas.")
        );

        // Trop vieux : on préfère un code nu à une cause d'il y a une heure.
        assert!(grok_log_failure(&journal, horodatage + 3_600, 120).is_none());
        // Aucun échec journalisé : rien à ajouter.
        assert!(grok_log_failure(
            &json!({"ts":"2026-08-14T01:21:11.221Z","msg":"shell.handle_prompt.done"}).to_string(),
            horodatage,
            120
        )
        .is_none());
    }

    #[test]
    fn le_detail_structure_de_lerreur_acp_prime_sur_le_journal() {
        let erreur = AcpRpcError {
            code: Some(-32603),
            message: "Internal error".into(),
            data: Some(json!({"message":"this conversation is too large to compact."})),
            transport: false,
        };
        let rendu = grok_user_error(&erreur);
        assert!(rendu.contains("Internal error (code -32603)"), "{rendu}");
        assert!(rendu.contains("too large to compact"), "{rendu}");
        assert!(rendu.contains("démarre-en une nouvelle"), "{rendu}");

        // Une auth manquante garde son message dédié, sans détail parasite.
        let auth = AcpRpcError {
            code: Some(-32000),
            message: "authRequired".into(),
            data: None,
            transport: false,
        };
        assert!(grok_user_error(&auth).contains("grok login"));
    }

    #[test]
    fn lhorodatage_iso_du_journal_devient_des_secondes_epoch() {
        assert_eq!(iso_epoch_s("1970-01-01T00:00:00.000Z"), Some(0));
        assert_eq!(iso_epoch_s("2026-08-14T01:21:11.221Z"), Some(1_786_670_471));
        assert_eq!(iso_epoch_s("pas une date"), None);
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
