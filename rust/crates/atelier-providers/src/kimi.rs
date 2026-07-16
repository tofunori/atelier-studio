//! Kimi Code provider — client ACP natif du CLI officiel (plan 046).
//!
//! Le process enfant est TOUJOURS `kimi acp` : outils, politiques, skills,
//! sous-agents et sessions restent ceux du harnais Kimi. Aucun repli vers un
//! autre provider ou une API générique : une erreur d'authentification ou de
//! protocole devient un event `error` actionnable et un `SendResult{ok:false}`.
//!
//! Contrat wire vérifié le 2026-07-16 contre le binaire 0.26.0 installé et le
//! tag officiel `@moonshot-ai/kimi-code@0.26.0` (packages/acp-adapter) :
//! configOptions `[model, thinking?, mode]`, permissions `approve_once`/
//! `approve_always`/`reject`, plan review `plan_*`, questions `q0_*`,
//! `session/prompt` → `{stopReason}` seul (jamais d'usage).

use crate::acp_map::{TurnCtx, TurnEmitter};
use crate::acp_rpc::{
    AcpInitializeResult, AcpRpcError, AcpServer, ServerRequestHandler, SessionUpdateHandler,
};
use crate::kimi_map::{map_kimi_prompt_result, map_kimi_session_update};
use crate::traits::{InteractionFn, Provider, ProviderCaps, SendRequest, SendResult};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::Duration;

/// État lié à la génération du process ACP courant — invalidé au respawn.
#[derive(Default)]
struct KimiState {
    generation: u64,
    /// Sessions ouvertes (new/resume/load) dans CETTE génération.
    opened_sessions: HashSet<String>,
    /// Sessions refusées `-32602` au resume : le tour suivant repart sur
    /// `session/new` (jamais de création silencieuse dans le MÊME tour).
    invalid_sessions: HashSet<String>,
}

pub struct KimiProvider {
    bin: PathBuf,
    acp_args: Vec<String>,
    acp: AcpServer,
    state: StdMutex<KimiState>,
    /// sessionId → dernier snapshot `configOptions` (réponse ou notification).
    /// Std mutex : alimenté par le SessionUpdateHandler synchrone.
    config: Arc<StdMutex<HashMap<String, Value>>>,
    /// sessionId → dernier catalogue `availableCommands` (éphémère).
    commands: Arc<StdMutex<HashMap<String, Value>>>,
    /// thread_id → sessionId ACP du tour en cours (pour interrupt).
    active_turns: StdMutex<HashMap<String, String>>,
}

impl KimiProvider {
    pub fn new() -> Option<Self> {
        resolve_bin().map(|bin| Self::with_bin(bin, vec!["acp".into()]))
    }

    /// Constructeur direct (tests : `node fake_kimi_acp.mjs <mode>`).
    fn with_bin(bin: PathBuf, acp_args: Vec<String>) -> Self {
        Self {
            bin,
            acp_args,
            acp: AcpServer::new("kimi"),
            state: StdMutex::new(KimiState::default()),
            config: Arc::new(StdMutex::new(HashMap::new())),
            commands: Arc::new(StdMutex::new(HashMap::new())),
            active_turns: StdMutex::new(HashMap::new()),
        }
    }

    /// Chemin du binaire résolu (affiché par le Setup).
    pub fn bin_path(&self) -> &PathBuf {
        &self.bin
    }
}

/// Résolution du binaire (plan 046 étape 4) :
/// 1. `ATELIER_KIMI_BIN` ; 2. `PATH` ; 3. `~/.kimi-code/bin/kimi` ;
/// 4. chemins Homebrew usuels en dernier recours.
pub(crate) fn resolve_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_KIMI_BIN") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    if let Ok(out) = std::process::Command::new("which").arg("kimi").output() {
        if out.status.success() {
            let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
            if !p.as_os_str().is_empty() {
                return Some(p);
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let p = home.join(".kimi-code/bin/kimi");
        if p.is_file() {
            return Some(p);
        }
    }
    for p in ["/opt/homebrew/bin/kimi", "/usr/local/bin/kimi"] {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    None
}

/// L'installation `~/.kimi-code` officielle existe mais un AUTRE binaire la
/// masque (PATH/Homebrew) — le Setup doit le signaler (plan 046 étape 4).
pub(crate) fn shadowed_official_install(resolved: &PathBuf) -> Option<PathBuf> {
    let official = std::env::var_os("HOME")
        .map(PathBuf::from)?
        .join(".kimi-code/bin/kimi");
    if official.is_file() && resolved != &official {
        Some(official)
    } else {
        None
    }
}

/// Mapping verrouillé des modes Atelier → Kimi (décision 9 du plan 046).
pub(crate) fn map_permission_mode(mode: &str) -> Option<&'static str> {
    match mode {
        "default" => Some("default"),
        "plan" => Some("plan"),
        "acceptEdits" => Some("auto"),
        "bypassPermissions" => Some("yolo"),
        _ => None,
    }
}

/// Effort Atelier → valeur de l'option `thinking` Kimi (`off`/`on` seulement,
/// décision 10). `Ok(None)` = ne pas toucher (auto). `Err` = valeur inconnue.
pub(crate) fn map_thinking(effort: &str) -> Result<Option<&'static str>, String> {
    match effort {
        "" => Ok(None),
        "on" => Ok(Some("on")),
        "off" | "none" => Ok(Some("off")),
        other => Err(format!(
            "thinking Kimi = off/on uniquement (reçu « {other} »)"
        )),
    }
}

fn find_config_option<'a>(snapshot: &'a Value, id: &str) -> Option<&'a Value> {
    snapshot
        .as_array()?
        .iter()
        .find(|o| o.get("id").and_then(Value::as_str) == Some(id))
}

fn option_current_value(snapshot: &Value, id: &str) -> Option<String> {
    find_config_option(snapshot, id)?
        .get("currentValue")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Valeurs proposées par une option select (groupes aplatis).
fn option_values(option: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(items) = option.get("options").and_then(Value::as_array) {
        for item in items {
            if let Some(v) = item.get("value").and_then(Value::as_str) {
                out.push(v.to_string());
            } else if let Some(group) = item.get("options").and_then(Value::as_array) {
                for o in group {
                    if let Some(v) = o.get("value").and_then(Value::as_str) {
                        out.push(v.to_string());
                    }
                }
            }
        }
    }
    out
}

/// Message utilisateur actionnable pour une erreur ACP — jamais de repli.
fn user_error(e: &AcpRpcError) -> String {
    if e.is_auth_required() {
        "Connexion Kimi requise — exécute `kimi login` dans un terminal, puis renvoie ton message \
         (Réglages → Providers → Kimi Code)."
            .into()
    } else if e.transport {
        format!("Kimi ACP injoignable : {e}")
    } else {
        format!("Kimi ACP : {e}")
    }
}

/// Traduit la réponse UI (ou son absence) en outcome ACP.
///
/// Fidélité (plan 046 étape 5) : l'`optionId` fait l'aller-retour OPAQUE ;
/// absence d'UI, timeout, fermeture ou option inconnue ⇒ `cancelled`, jamais
/// une approbation implicite.
pub(crate) fn kimi_permission_outcome(params: &Value, answer: Option<Value>) -> Value {
    let cancelled = || json!({"outcome": {"outcome": "cancelled"}});
    let option_ids: Vec<&str> = params
        .get("options")
        .and_then(Value::as_array)
        .map(|opts| {
            opts.iter()
                .filter_map(|o| o.get("optionId").and_then(Value::as_str))
                .collect()
        })
        .unwrap_or_default();
    let selected = |id: &str| json!({"outcome": {"outcome": "selected", "optionId": id}});

    let Some(ans) = answer else {
        return cancelled();
    };

    // 1. Réponse dynamique {optionId} — le chemin nominal Kimi.
    if let Some(oid) = ans.get("optionId").and_then(Value::as_str) {
        if option_ids.contains(&oid) {
            return selected(oid);
        }
        // Option inconnue : warning borné (id seulement), refus sûr.
        let bounded: String = oid.chars().take(64).collect();
        eprintln!("[kimi] optionId inconnu renvoyé par l'UI, cancelled: {bounded}");
        return cancelled();
    }

    // 2. Réponse user_input {answers:{champ: valeur}} — la valeur est l'id
    //    opaque (options de champ avec `value`). Vide = skip ⇒ cancelled.
    if let Some(answers) = ans.get("answers").and_then(Value::as_object) {
        if let Some(v) = answers
            .values()
            .filter_map(Value::as_str)
            .find(|s| !s.is_empty())
        {
            if option_ids.contains(&v) {
                return selected(v);
            }
        }
        return cancelled();
    }

    // 3. Legacy {allow, scope} — mappé sur les ids canoniques SEULEMENT s'ils
    //    existent dans la requête (jamais d'id inventé).
    if let Some(allow) = ans.get("allow").and_then(Value::as_bool) {
        let target = if allow {
            if ans.get("scope").and_then(Value::as_str) == Some("session")
                && option_ids.contains(&"approve_always")
            {
                "approve_always"
            } else {
                "approve_once"
            }
        } else {
            "reject"
        };
        if option_ids.contains(&target) {
            return selected(target);
        }
        return cancelled();
    }

    cancelled()
}

impl KimiProvider {
    async fn ensure_acp(&self) -> Result<AcpInitializeResult, AcpRpcError> {
        let init = self
            .acp
            .ensure(
                &self.bin,
                &self.acp_args,
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        // Décisions 4/5 du plan 046 : filesystem et terminal
                        // ACP désactivés — Kimi utilise ses vrais outils locaux.
                        "fs": {"readTextFile": false, "writeTextFile": false},
                        "terminal": false
                    }
                }),
            )
            .await?;
        Ok(init)
    }

    fn reset_state_if_respawned(&self) {
        let generation = self.acp.generation();
        let mut st = self.state.lock().unwrap();
        if st.generation != generation {
            *st = KimiState {
                generation,
                ..Default::default()
            };
            self.config.lock().unwrap().clear();
            self.commands.lock().unwrap().clear();
        }
    }

    fn remember_snapshot(&self, sid: &str, result: &Value) {
        if let Some(opts) = result.get("configOptions").filter(|o| o.is_array()) {
            self.config
                .lock()
                .unwrap()
                .insert(sid.to_string(), opts.clone());
        }
    }

    /// Ouvre la session du tour : `session/new` sans sessionId ; `session/
    /// resume` pour un thread Atelier qui a déjà son transcript (décision 11 —
    /// jamais de replay ici). `-32602` ⇒ erreur actionnable et le PROCHAIN
    /// tour créera une session neuve.
    async fn open_session(&self, req: &SendRequest, cwd: &str) -> Result<String, String> {
        let requested = req
            .session_id
            .as_ref()
            .filter(|s| !s.is_empty())
            .cloned()
            .filter(|sid| !self.state.lock().unwrap().invalid_sessions.contains(sid));

        if let Some(sid) = requested {
            if self.state.lock().unwrap().opened_sessions.contains(&sid) {
                return Ok(sid);
            }
            match self
                .acp
                .request(
                    "session/resume",
                    json!({"sessionId": sid, "cwd": cwd, "mcpServers": []}),
                    Some(30_000),
                )
                .await
            {
                Ok(result) => {
                    self.state
                        .lock()
                        .unwrap()
                        .opened_sessions
                        .insert(sid.clone());
                    self.remember_snapshot(&sid, &result);
                    return Ok(sid);
                }
                Err(e) if e.is_invalid_params() => {
                    self.state
                        .lock()
                        .unwrap()
                        .invalid_sessions
                        .insert(sid.clone());
                    return Err(format!(
                        "La session Kimi {sid} n'existe plus côté CLI — renvoie ton message \
                         pour démarrer une nouvelle session Kimi."
                    ));
                }
                Err(e) => return Err(user_error(&e)),
            }
        }

        let result = self
            .acp
            .request(
                "session/new",
                json!({"cwd": cwd, "mcpServers": []}),
                Some(30_000),
            )
            .await
            .map_err(|e| user_error(&e))?;
        let sid = result
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or("session/new sans sessionId")?
            .to_string();
        self.state
            .lock()
            .unwrap()
            .opened_sessions
            .insert(sid.clone());
        self.remember_snapshot(&sid, &result);
        Ok(sid)
    }

    /// Aligne UN axe via `session/set_config_option`. Un refus N'EST PAS
    /// best-effort : le tour s'arrête avec un message clair (plan 046 étape 6).
    async fn align_axis(&self, sid: &str, config_id: &str, target: &str) -> Result<(), String> {
        let snapshot = self
            .config
            .lock()
            .unwrap()
            .get(sid)
            .cloned()
            .unwrap_or(Value::Null);
        let Some(option) = find_config_option(&snapshot, config_id) else {
            if config_id == "thinking" && target == "off" {
                // Modèle sans option thinking = déjà sémantiquement off.
                return Ok(());
            }
            return Err(format!(
                "Kimi n'expose pas le réglage « {config_id} » pour la session/le modèle actif."
            ));
        };
        if option.get("currentValue").and_then(Value::as_str) == Some(target) {
            return Ok(());
        }
        let values = option_values(option);
        if !values.iter().any(|v| v == target) {
            return Err(format!(
                "« {target} » n'est pas proposé par Kimi pour « {config_id} » (choix: {}).",
                values.join(", ")
            ));
        }
        let result = self
            .acp
            .request(
                "session/set_config_option",
                json!({"sessionId": sid, "configId": config_id, "value": target}),
                Some(15_000),
            )
            .await
            .map_err(|e| format!("Kimi a refusé {config_id}={target} : {}", user_error(&e)))?;
        // Le snapshot retourné est la source de vérité (contrat 0.26).
        self.remember_snapshot(sid, &result);
        let now = option_current_value(
            self.config.lock().unwrap().get(sid).unwrap_or(&Value::Null),
            config_id,
        );
        if now.as_deref() != Some(target) {
            return Err(format!(
                "Kimi a refusé {config_id}={target} (valeur effective: {}).",
                now.unwrap_or_else(|| "inconnue".into())
            ));
        }
        Ok(())
    }

    /// Alignement modèle → thinking → mode (ordre du plan). Chaque axe n'est
    /// touché que s'il est demandé ET différent de `currentValue`.
    async fn align_config(&self, sid: &str, req: &SendRequest) -> Result<(), String> {
        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            self.align_axis(sid, "model", model).await?;
        }
        match map_thinking(req.effort.as_deref().unwrap_or("")) {
            Ok(None) => {}
            Ok(Some(thinking)) => self.align_axis(sid, "thinking", thinking).await?,
            Err(e) => return Err(e),
        }
        if let Some(mode) = req.permission_mode.as_deref().filter(|m| !m.is_empty()) {
            let Some(kimi_mode) = map_permission_mode(mode) else {
                return Err(format!("mode Atelier inconnu pour Kimi : {mode}"));
            };
            self.align_axis(sid, "mode", kimi_mode).await?;
        }
        Ok(())
    }

    /// Handler des requêtes serveur→client du tour : traduit
    /// `session/request_permission` vers l'interaction utilisateur d'Atelier
    /// et retourne l'outcome exact. Sans relais (UI absente) ⇒ cancelled.
    fn make_server_handler(&self, on_interaction: Option<InteractionFn>) -> ServerRequestHandler {
        Arc::new(move |method: String, params: Value| {
            let relay = on_interaction.clone();
            Box::pin(async move {
                if method != "session/request_permission" {
                    return Value::Null; // fs/*, terminal/*… ⇒ -32601 (non annoncés)
                }
                let answer = match relay {
                    Some(relay) => relay(method, params.clone()).await,
                    None => None,
                };
                kimi_permission_outcome(&params, answer)
            })
        })
    }

    async fn send_acp(&self, req: &SendRequest) -> Result<SendResult, String> {
        let cwd = if req.project_root.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        } else {
            req.project_root.clone()
        };

        let init = self.ensure_acp().await.map_err(|e| user_error(&e))?;
        if init.protocol_version != 1 {
            return Err(format!(
                "Kimi ACP annonce protocolVersion {} (attendu 1) — intégration à mettre à jour \
                 avant tout envoi.",
                init.protocol_version
            ));
        }
        if let Some(name) = init
            .agent_info
            .as_ref()
            .and_then(|i| i.get("name"))
            .and_then(Value::as_str)
        {
            if name != "Kimi Code CLI" {
                eprintln!("[kimi] agentInfo.name inattendu: {name}");
            }
        }
        self.reset_state_if_respawned();

        let sid = self.open_session(req, &cwd).await?;
        self.align_config(&sid, req).await?;

        let state = Arc::new(StdMutex::new((
            TurnCtx::default(),
            TurnEmitter::new(req.on_event.clone()),
        )));
        let handler_state = Arc::clone(&state);
        let config_cache = Arc::clone(&self.config);
        let commands_cache = Arc::clone(&self.commands);
        let sid_for_handler = sid.clone();
        let handler: SessionUpdateHandler = Arc::new(move |update: &Value| {
            // États éphémères intraçables dans le journal : snapshot config et
            // catalogue de commandes, consommés directement ici.
            match update.get("sessionUpdate").and_then(Value::as_str) {
                Some("config_option_update") => {
                    if let Some(opts) = update.get("configOptions").filter(|o| o.is_array()) {
                        config_cache
                            .lock()
                            .unwrap()
                            .insert(sid_for_handler.clone(), opts.clone());
                    }
                }
                Some("available_commands_update") => {
                    if let Some(cmds) = update.get("availableCommands").filter(|c| c.is_array()) {
                        commands_cache
                            .lock()
                            .unwrap()
                            .insert(sid_for_handler.clone(), cmds.clone());
                    }
                }
                _ => {}
            }
            let mut guard = handler_state.lock().unwrap();
            let (ctx, emitter) = &mut *guard;
            for ev in map_kimi_session_update(update, ctx) {
                emitter.emit(ev);
            }
        });
        self.acp.set_session_handler(&sid, handler).await;
        self.acp
            .set_session_server_handler(&sid, self.make_server_handler(req.on_interaction.clone()))
            .await;
        self.active_turns
            .lock()
            .unwrap()
            .insert(req.thread_id.clone(), sid.clone());

        // Sonde d'annulation : UNE notification session/cancel, le prompt en
        // cours se résout ensuite avec stopReason:"cancelled".
        let cancel_acp = self.acp.clone();
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
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        });

        let prompt_res = self
            .acp
            .request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": [{"type": "text", "text": req.prompt}]}),
                None,
            )
            .await;

        // Finalisation systématique : sonde, handlers, tour actif.
        watcher.abort();
        self.acp.clear_session_handler(&sid).await;
        self.acp.clear_session_server_handler(&sid).await;
        self.active_turns.lock().unwrap().remove(&req.thread_id);

        let (ok, error) = match prompt_res {
            Ok(result) => {
                let done = {
                    let mut guard = state.lock().unwrap();
                    let (ctx, emitter) = &mut *guard;
                    emitter.flush();
                    map_kimi_prompt_result(&result, ctx)
                };
                let ok = done.get("ok").and_then(Value::as_bool).unwrap_or(false);
                (req.on_event)(done);
                let error = if ok {
                    None
                } else {
                    let stop = result
                        .get("stopReason")
                        .and_then(Value::as_str)
                        .unwrap_or("stopReason inconnu");
                    Some(match stop {
                        "refusal" => "Kimi a refusé la requête (refusal).".to_string(),
                        other => format!("tour Kimi terminé: {other}"),
                    })
                };
                (ok, error)
            }
            Err(e) => {
                state.lock().unwrap().1.flush();
                (req.on_event)(json!({"kind": "error", "message": user_error(&e)}));
                (false, Some(e.to_string()))
            }
        };

        Ok(SendResult {
            session_id: Some(sid),
            ok,
            error,
        })
    }
}

#[async_trait]
impl Provider for KimiProvider {
    fn id(&self) -> &str {
        "kimi"
    }
    fn label(&self) -> &str {
        "Kimi Code"
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
    /// Catalogue dynamique uniquement (décision 7) — rien en dur ici.
    fn models(&self) -> Vec<String> {
        Vec::new()
    }
    fn default_model(&self) -> String {
        String::new()
    }
    fn efforts(&self) -> Vec<String> {
        Vec::new()
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        match self.send_acp(&req).await {
            Ok(r) => r,
            Err(message) => {
                // Jamais de repli vers un autre harnais (décision 1).
                (req.on_event)(json!({"kind": "error", "message": message}));
                SendResult {
                    session_id: req.session_id.clone(),
                    ok: false,
                    error: Some(message),
                }
            }
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        let sid = self.active_turns.lock().unwrap().get(thread_id).cloned();
        if let Some(sid) = sid {
            self.acp
                .notify("session/cancel", json!({"sessionId": sid}))
                .await;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traits::SendMode;

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

    fn fixture_provider(mode: &str) -> Option<KimiProvider> {
        let node = node_bin().or_else(|| {
            eprintln!("SKIP: node introuvable pour le fixture ACP");
            None
        })?;
        let fixture = format!(
            "{}/tests/fixtures/fake_kimi_acp.mjs",
            env!("CARGO_MANIFEST_DIR")
        );
        Some(KimiProvider::with_bin(node, vec![fixture, mode.into()]))
    }

    struct TurnOutput {
        result: SendResult,
        events: Vec<Value>,
    }

    impl TurnOutput {
        fn text(&self) -> String {
            self.events
                .iter()
                .filter(|e| e["kind"] == "delta")
                .filter_map(|e| e["text"].as_str())
                .collect()
        }
        fn errors(&self) -> Vec<String> {
            self.events
                .iter()
                .filter(|e| e["kind"] == "error")
                .filter_map(|e| e["message"].as_str().map(str::to_string))
                .collect()
        }
        fn done(&self) -> Option<&Value> {
            self.events.iter().find(|e| e["kind"] == "done")
        }
    }

    async fn run_turn(
        p: &KimiProvider,
        prompt: &str,
        session_id: Option<String>,
        model: Option<&str>,
        effort: Option<&str>,
        permission_mode: Option<&str>,
        on_interaction: Option<InteractionFn>,
    ) -> TurnOutput {
        let events: Arc<StdMutex<Vec<Value>>> = Arc::new(StdMutex::new(vec![]));
        let sink = Arc::clone(&events);
        let req = SendRequest {
            thread_id: "t-kimi-test".into(),
            turn_id: "turn-1".into(),
            prompt: prompt.into(),
            inputs: None,
            project_root: "/tmp/fake-kimi-proj".into(),
            session_id,
            model: model.map(str::to_string),
            effort: effort.map(str::to_string),
            permission_mode: permission_mode.map(str::to_string),
            mode: SendMode::Normal,
            on_event: Arc::new(move |ev| sink.lock().unwrap().push(ev)),
            on_interaction,
            is_cancelled: Arc::new(|| false),
        };
        let result = p.send(req).await;
        let events = events.lock().unwrap().clone();
        TurnOutput { result, events }
    }

    #[tokio::test]
    async fn tour_nominal_events_et_session() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let out = run_turn(&p, "bonjour", None, None, None, None, None).await;
        assert!(out.result.ok, "erreurs: {:?}", out.errors());
        assert_eq!(out.result.session_id.as_deref(), Some("session_fake_1"));
        assert!(out.events.iter().any(|e| e["kind"] == "thinking_delta"));
        assert!(out.text().contains("réponse"));
        let done = out.done().expect("done");
        assert_eq!(done["ok"], true);
        assert!(
            done.get("usage").is_none(),
            "kimi 0.26 sans usage ⇒ pas de clé usage"
        );
    }

    #[tokio::test]
    async fn alignement_model_thinking_mode() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let out = run_turn(
            &p,
            "config?",
            None,
            Some("fake-k3"),
            Some("off"),
            Some("acceptEdits"),
            None,
        )
        .await;
        assert!(out.result.ok, "erreurs: {:?}", out.errors());
        // Le fixture répond avec l'état effectif — preuve de l'alignement.
        assert!(
            out.text().contains("model=fake-k3,thinking=off,mode=auto"),
            "texte: {}",
            out.text()
        );
    }

    #[tokio::test]
    async fn modele_inconnu_arrete_le_tour_sans_prompt() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let out = run_turn(&p, "n'importe", None, Some("gpt-4"), None, None, None).await;
        assert!(!out.result.ok);
        let errs = out.errors().join(" ");
        assert!(errs.contains("gpt-4"), "erreurs: {errs}");
        assert!(
            errs.contains("fake-k3"),
            "les choix valides sont listés: {errs}"
        );
        assert!(out.done().is_none(), "aucun prompt ne doit partir");
    }

    #[tokio::test]
    async fn thinking_on_refuse_pour_modele_sans_thinking() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        // Tour 1 : bascule vers le modèle sans thinking.
        let out1 = run_turn(&p, "a", None, Some("fake-k3-mini"), None, None, None).await;
        assert!(out1.result.ok, "erreurs: {:?}", out1.errors());
        let sid = out1.result.session_id.clone();
        // Tour 2 : thinking on ⇒ refus clair (l'option n'existe plus).
        let out2 = run_turn(&p, "b", sid.clone(), None, Some("on"), None, None).await;
        assert!(!out2.result.ok);
        assert!(
            out2.errors().join(" ").contains("thinking"),
            "erreurs: {:?}",
            out2.errors()
        );
        // thinking off sur le même modèle = no-op accepté.
        let out3 = run_turn(&p, "c", sid, None, Some("off"), None, None).await;
        assert!(out3.result.ok, "erreurs: {:?}", out3.errors());
    }

    #[tokio::test]
    async fn permission_relayee_optionid_exact() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let seen: Arc<StdMutex<Vec<(String, Value)>>> = Arc::new(StdMutex::new(vec![]));
        let seen2 = Arc::clone(&seen);
        let relay: InteractionFn = Arc::new(move |method, params| {
            seen2.lock().unwrap().push((method, params));
            Box::pin(async move { Some(json!({"optionId": "approve_always"})) })
        });
        let out = run_turn(&p, "[permission]", None, None, None, None, Some(relay)).await;
        assert!(out.result.ok, "erreurs: {:?}", out.errors());
        assert!(
            out.text().contains("perm:selected:approve_always"),
            "texte: {}",
            out.text()
        );
        let calls = seen.lock().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].0, "session/request_permission");
        let ids: Vec<&str> = calls[0].1["options"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["optionId"].as_str().unwrap())
            .collect();
        assert_eq!(ids, vec!["approve_once", "approve_always", "reject"]);
    }

    #[tokio::test]
    async fn permission_sans_ui_ou_option_inconnue_cancelled() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        // Sans relais : cancelled.
        let out = run_turn(&p, "[permission]", None, None, None, None, None).await;
        assert!(
            out.text().contains("perm:cancelled"),
            "texte: {}",
            out.text()
        );
        // Relais qui renvoie un id inconnu : cancelled aussi.
        let relay: InteractionFn = Arc::new(|_m, _p| {
            Box::pin(async move { Some(json!({"optionId": "je-n-existe-pas"})) })
        });
        let out2 = run_turn(&p, "[permission]", None, None, None, None, Some(relay)).await;
        assert!(
            out2.text().contains("perm:cancelled"),
            "texte: {}",
            out2.text()
        );
    }

    #[tokio::test]
    async fn plan_review_et_question_ids_opaques() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let relay: InteractionFn = Arc::new(|_m, params| {
            Box::pin(async move {
                let title = params
                    .pointer("/toolCall/title")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if title == "AskUserQuestion" {
                    // user_input : la valeur du champ est l'id opaque.
                    Some(json!({"answers": {"q0": "q0_opt_2"}}))
                } else {
                    Some(json!({"optionId": "plan_opt_1"}))
                }
            })
        });
        let out = run_turn(
            &p,
            "[plan-review] [question]",
            None,
            None,
            None,
            None,
            Some(relay),
        )
        .await;
        assert!(out.result.ok, "erreurs: {:?}", out.errors());
        let text = out.text();
        assert!(text.contains("perm:selected:plan_opt_1"), "texte: {text}");
        assert!(text.contains("perm:selected:q0_opt_2"), "texte: {text}");
    }

    #[tokio::test]
    async fn auth_requise_erreur_actionnable_sans_repli() {
        let Some(p) = fixture_provider("auth_required") else {
            return;
        };
        let out = run_turn(&p, "bonjour", None, None, None, None, None).await;
        assert!(!out.result.ok);
        let errs = out.errors().join(" ");
        assert!(errs.contains("kimi login"), "erreurs: {errs}");
        assert!(out.done().is_none());
    }

    #[tokio::test]
    async fn session_inconnue_differe_la_nouvelle_session() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        // Tour 1 avec une session inexistante : erreur actionnable, pas de
        // création silencieuse dans le même tour.
        let out1 = run_turn(
            &p,
            "a",
            Some("session_disparue".into()),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(!out1.result.ok);
        assert!(
            out1.errors().join(" ").contains("n'existe plus"),
            "erreurs: {:?}",
            out1.errors()
        );
        assert!(out1.done().is_none());
        // Tour 2 avec le MÊME sessionId : nouvelle session créée.
        let out2 = run_turn(
            &p,
            "b",
            Some("session_disparue".into()),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(out2.result.ok, "erreurs: {:?}", out2.errors());
        assert!(out2
            .result
            .session_id
            .as_deref()
            .unwrap()
            .starts_with("session_fake_"));
    }

    #[tokio::test]
    async fn resume_reutilise_la_session_sans_replay() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let out1 = run_turn(&p, "a", None, None, None, None, None).await;
        let sid = out1.result.session_id.clone().unwrap();
        let out2 = run_turn(&p, "b", Some(sid.clone()), None, None, None, None).await;
        assert!(out2.result.ok);
        assert_eq!(out2.result.session_id.as_deref(), Some(sid.as_str()));
        // Aucun event de replay (user_message_chunk est silencieux, et le
        // fixture ne rejoue l'historique QUE sur session/load).
        assert!(
            !out2.events.iter().any(|e| e["kind"] == "user"),
            "resume ne rejoue jamais l'historique"
        );
    }

    #[tokio::test]
    async fn interruption_via_is_cancelled() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let events: Arc<StdMutex<Vec<Value>>> = Arc::new(StdMutex::new(vec![]));
        let sink = Arc::clone(&events);
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let cancelled2 = Arc::clone(&cancelled);
        let req = SendRequest {
            thread_id: "t-cancel".into(),
            turn_id: "turn-1".into(),
            prompt: "[cancel]".into(),
            inputs: None,
            project_root: "/tmp/fake-kimi-proj".into(),
            session_id: None,
            model: None,
            effort: None,
            permission_mode: None,
            mode: SendMode::Normal,
            on_event: Arc::new(move |ev| sink.lock().unwrap().push(ev)),
            on_interaction: None,
            is_cancelled: Arc::new(move || cancelled2.load(std::sync::atomic::Ordering::SeqCst)),
        };
        let flip = Arc::clone(&cancelled);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(700)).await;
            flip.store(true, std::sync::atomic::Ordering::SeqCst);
        });
        let result = p.send(req).await;
        // Interruption utilisateur = tour réussi (stopReason cancelled).
        assert!(result.ok, "erreur: {:?}", result.error);
        let evs = events.lock().unwrap();
        let done = evs.iter().find(|e| e["kind"] == "done").expect("done");
        assert_eq!(done["ok"], true);
    }

    // ------------------------------------------------------------------
    // Tests purs (mapping outcome/permissions/modes) — sans process.

    #[test]
    fn outcome_optionid_exact_aller_retour() {
        let params = json!({"options": [
            {"optionId": "approve_once", "name": "Approve once", "kind": "allow_once"},
            {"optionId": "reject", "name": "Reject", "kind": "reject_once"}
        ]});
        let out = kimi_permission_outcome(&params, Some(json!({"optionId": "reject"})));
        assert_eq!(out["outcome"]["outcome"], "selected");
        assert_eq!(out["outcome"]["optionId"], "reject");
    }

    #[test]
    fn outcome_inconnu_timeout_ou_vide_cancelled() {
        let params = json!({"options": [
            {"optionId": "approve_once", "name": "Approve once", "kind": "allow_once"}
        ]});
        for answer in [
            None,
            Some(json!({"optionId": "hack"})),
            Some(json!({"answers": {}})),
            Some(json!({"answers": {"q0": "pas-un-id"}})),
            Some(json!({"autre": true})),
        ] {
            let out = kimi_permission_outcome(&params, answer.clone());
            assert_eq!(out["outcome"]["outcome"], "cancelled", "answer: {answer:?}");
        }
    }

    #[test]
    fn outcome_legacy_allow_mappe_ids_canoniques() {
        let params = json!({"options": [
            {"optionId": "approve_once", "kind": "allow_once"},
            {"optionId": "approve_always", "kind": "allow_always"},
            {"optionId": "reject", "kind": "reject_once"}
        ]});
        let once = kimi_permission_outcome(&params, Some(json!({"allow": true})));
        assert_eq!(once["outcome"]["optionId"], "approve_once");
        let always =
            kimi_permission_outcome(&params, Some(json!({"allow": true, "scope": "session"})));
        assert_eq!(always["outcome"]["optionId"], "approve_always");
        let deny = kimi_permission_outcome(&params, Some(json!({"allow": false})));
        assert_eq!(deny["outcome"]["optionId"], "reject");
        // plan review sans ids canoniques : legacy ⇒ cancelled, jamais inventé.
        let plan = json!({"options": [{"optionId": "plan_approve", "kind": "allow_once"}]});
        let out = kimi_permission_outcome(&plan, Some(json!({"allow": true})));
        assert_eq!(out["outcome"]["outcome"], "cancelled");
    }

    #[test]
    fn mapping_modes_verrouille() {
        assert_eq!(map_permission_mode("default"), Some("default"));
        assert_eq!(map_permission_mode("plan"), Some("plan"));
        assert_eq!(map_permission_mode("acceptEdits"), Some("auto"));
        assert_eq!(map_permission_mode("bypassPermissions"), Some("yolo"));
        assert_eq!(map_permission_mode("exotique"), None);
    }

    #[test]
    fn mapping_thinking_off_on_seulement() {
        assert_eq!(map_thinking(""), Ok(None));
        assert_eq!(map_thinking("on"), Ok(Some("on")));
        assert_eq!(map_thinking("off"), Ok(Some("off")));
        assert_eq!(map_thinking("none"), Ok(Some("off")));
        assert!(
            map_thinking("high").is_err(),
            "jamais low/medium/high inventés"
        );
    }
}
