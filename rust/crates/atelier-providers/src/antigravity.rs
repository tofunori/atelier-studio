//! Antigravity provider — client ACP natif de la CLI Google `agy acp`.
//!
//! Conception : plans/antigravity-2026-11-17/conception-v2.md (Fable), d'après
//! la sonde du 2026-11-17 sur `agy` 1.5.10 connecté au compte de Thierry.
//!
//! Le process enfant est TOUJOURS `agy acp` : outils, bac à sable, sessions
//! et quotas restent ceux d'Antigravity. Aucun repli vers le mode headless
//! (`agy -p`), qui refuse toute permission en silence (décision D3).
//!
//! Écarts avec Kimi, tous relevés par la sonde :
//! - modes de session standard (`session/set_mode`), posés à CHAQUE tour (D6) ;
//! - modèle et effort sont deux options séparées, `model` (ids sans effort,
//!   jamais dérivés en coupant un suffixe) et `thought_level` (D12) ;
//! - permissions `allow`/`deny` seulement : « toujours » est une règle tenue
//!   par Atelier pour le fil (D10), « toujours les modifications » passe la
//!   session en `accept-edits` ;
//! - la revue de plan est la permission d'écrire `implementation_plan.md`
//!   (D13) ;
//! - le process vit dans un dossier neutre, sans `--log-file` relatif (D11),
//!   et sans `GEMINI_API_KEY`/`GOOGLE_API_KEY` (D8) ;
//! - aucune élicitation annoncée avant le lot 8 (D14).

use crate::acp_map::{TurnCtx, TurnEmitter};
use crate::acp_rpc::{
    AcpInitializeResult, AcpRpcError, AcpServer, ServerRequestHandler, SessionUpdateHandler,
};
use crate::acp_session::{
    find_config_option_by, has_image_block, iso8601_to_epoch_ms, option_values, permission_outcome,
    remember_config_snapshot, set_session_mode, spawn_cancel_watcher, ConfigCache, SessionBook,
    SessionModes, StopEscalation,
};
use crate::antigravity_map::{
    close_orphan_questions, map_agy_prompt_result, map_agy_session_update, native_tool_name,
    tool_input, ASK_QUESTION,
};
use crate::kimi::compare_kimi_versions as compare_versions;
use crate::traits::{
    atelier_mcp_fingerprint, atelier_mcp_servers, InteractionFn, Provider, ProviderCaps,
    SendRequest, SendResult,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::Duration;

const LABEL: &str = "Antigravity";

/// Seule version dont on a les trames (sonde du 2026-11-17, décision D5).
pub(crate) const AGY_MIN_VERSION: &str = "1.5.10";

/// Nom annoncé par `initialize.agentInfo.name`.
const AGENT_NAME: &str = "Antigravity ACP Server";

/// Taille d'image acceptée avant encodage (agy l'accepte ; borne prudente,
/// la même que Kimi).
const AGY_IMAGE_MAX_BYTES: u64 = 5 * 1024 * 1024;

/// Variables qui feraient passer agy sur une clé API facturée au lieu du
/// compte Google connecté (décision D8).
const ENV_REMOVED: &[&str] = &["GEMINI_API_KEY", "GOOGLE_API_KEY"];

/// Stop resté sans effet : `session/close` après ce délai.
const STOP_CLOSE_AFTER: Duration = Duration::from_secs(10);

/// Choix ajoutés par Atelier à la carte de permission (D10). Ils ne partent
/// jamais vers agy : le provider les traduit en `allow` après avoir posé la
/// règle.
pub(crate) const OPT_ALWAYS_THREAD: &str = "atelier_always_thread";
pub(crate) const OPT_ALWAYS_EDITS: &str = "atelier_always_edits";

/// Méthode d'interaction relayée au runtime (carte construite par
/// `interaction_spec`).
pub const PERMISSION_METHOD: &str = "antigravity/request_permission";

/// Plan proposé en mode plan : borne de sûreté de la carte.
const PLAN_MAX: usize = 64 * 1024;

pub struct AntigravityProvider {
    bin: PathBuf,
    acp_args: Vec<String>,
    acp: AcpServer,
    /// Dossier de travail du process ACP : jamais un projet (D1, D11).
    process_dir: PathBuf,
    state: StdMutex<SessionBook>,
    config: ConfigCache,
    /// sessionId → modes annoncés et mode courant.
    modes: Arc<StdMutex<HashMap<String, SessionModes>>>,
    /// sessionId → dernier catalogue de commandes (`available_commands_update`).
    commands: Arc<StdMutex<HashMap<String, Value>>>,
    /// thread_id → sessionId du tour en cours (Stop).
    active_turns: StdMutex<HashMap<String, String>>,
    /// thread_id → règles « toujours pour ce fil » (commande exacte, outil
    /// MCP exact). Perdues à la fermeture d'Atelier (§ 2 de la conception).
    rules: Arc<StdMutex<HashMap<String, HashSet<String>>>>,
    /// Fils où l'utilisateur a choisi « toujours autoriser les modifications ».
    edits_always: Arc<StdMutex<HashSet<String>>>,
    idle: Duration,
    /// Délai avant `session/close` quand le Stop reste sans effet.
    stop_close_after: Duration,
}

impl AntigravityProvider {
    pub fn new() -> Option<Self> {
        resolve_bin().map(|bin| Self::with_bin(bin, vec!["acp".into()]))
    }

    /// Constructeur direct (tests : `node fake_agy_acp.mts <mode>`).
    fn with_bin(bin: PathBuf, acp_args: Vec<String>) -> Self {
        Self {
            bin,
            acp_args,
            acp: AcpServer::new("antigravity").with_env_removed(ENV_REMOVED),
            process_dir: std::env::temp_dir(),
            state: StdMutex::new(SessionBook::default()),
            config: Arc::new(StdMutex::new(HashMap::new())),
            modes: Arc::new(StdMutex::new(HashMap::new())),
            commands: Arc::new(StdMutex::new(HashMap::new())),
            active_turns: StdMutex::new(HashMap::new()),
            rules: Arc::new(StdMutex::new(HashMap::new())),
            edits_always: Arc::new(StdMutex::new(HashSet::new())),
            idle: crate::turn_idle::idle_from_env(),
            stop_close_after: STOP_CLOSE_AFTER,
        }
    }

    #[cfg(test)]
    fn with_idle(mut self, idle: Duration) -> Self {
        self.idle = idle;
        self
    }

    #[cfg(test)]
    fn with_stop_close_after(mut self, after: Duration) -> Self {
        self.stop_close_after = after;
        self
    }

    pub fn bin_path(&self) -> &PathBuf {
        &self.bin
    }
}

/// Résolution du binaire : `ATELIER_AGY_BIN`, `PATH`, puis l'emplacement de
/// l'installeur officiel (`~/.local/bin/agy`, absent du PATH d'une app
/// lancée depuis le Finder), puis Homebrew.
pub(crate) fn resolve_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_AGY_BIN") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    if let Ok(out) = std::process::Command::new("which").arg("agy").output() {
        if out.status.success() {
            let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
            if !p.as_os_str().is_empty() {
                return Some(p);
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let p = home.join(".local/bin/agy");
        if p.is_file() {
            return Some(p);
        }
    }
    ["/opt/homebrew/bin/agy", "/usr/local/bin/agy"]
        .into_iter()
        .map(PathBuf::from)
        .find(|p| p.is_file())
}

/// Mode Atelier → mode agy. `bypassPermissions` reste `default` côté agy :
/// c'est Atelier qui répond « autoriser une fois » pour ce fil, jamais aux
/// questions ni à la revue de plan (le drapeau
/// `--dangerously-skip-permissions` toucherait tout le process).
pub(crate) fn map_permission_mode(mode: &str, edits_always: bool) -> Option<&'static str> {
    let base = if edits_always {
        "accept-edits"
    } else {
        "default"
    };
    match mode {
        "" | "default" | "bypassPermissions" => Some(base),
        "acceptEdits" => Some("accept-edits"),
        "plan" => Some("plan"),
        "auto" => Some("auto"),
        _ => None,
    }
}

/// Session disparue côté agy. `-32002` est le code ACP « ressource
/// introuvable » ; `-32602` n'est retenu que si le message parle d'une
/// session inconnue, car chez agy il signale aussi de vrais paramètres
/// invalides (§ 5 de la conception).
pub(crate) fn is_session_gone(e: &AcpRpcError) -> bool {
    match e.code {
        Some(-32002) => true,
        Some(-32602) => {
            let m = e.message.to_lowercase();
            m.contains("session")
                && ["not found", "unknown", "does not exist", "no such"]
                    .iter()
                    .any(|k| m.contains(k))
        }
        _ => false,
    }
}

fn user_error(e: &AcpRpcError) -> String {
    if e.is_auth_required() {
        "Connexion Antigravity requise : lance `agy` une fois dans un terminal et connecte ton \
         compte Google, puis renvoie ton message."
            .into()
    } else if e.transport {
        format!("Antigravity injoignable : {e}")
    } else {
        format!("Antigravity : {e}")
    }
}

/// Consigne du fil : bloc texte en tête du prompt, comme Codex. La voie
/// native (`_meta.antigravity.systemPrompt.append`) attend sa forme exacte
/// (inconnue U5).
pub(crate) fn build_prompt_blocks(req: &SendRequest) -> Result<Vec<Value>, String> {
    let mut blocks = crate::acp_session::build_prompt_blocks(
        &req.prompt,
        req.inputs.as_ref(),
        LABEL,
        AGY_IMAGE_MAX_BYTES,
    )?;
    if let Some(texte) = req
        .consigne
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
    {
        blocks.insert(
            0,
            json!({"type": "text", "text": format!("<consigne-atelier>\n{texte}\n</consigne-atelier>")}),
        );
    }
    Ok(blocks)
}

/// Chemin canonique pour comparer deux dossiers (`/tmp` ↔ `/private/tmp`).
fn canonical(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.trim_end_matches('/').to_string())
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/// Nature d'une demande de permission agy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Demande {
    /// Écriture d'`implementation_plan.md` avec `RequestFeedback` (D13).
    Plan,
    /// `write_file`, `edit_file` ou kind `edit`.
    Edit,
    /// `run_command` : la ligne de commande exacte sert de clé de règle.
    Command(String),
    /// `mcp_<serveur>_<outil>` : le nom exact sert de clé de règle.
    Mcp(String),
    /// Question ou outil sans clé : jamais de règle.
    Other,
}

impl Demande {
    fn rule_key(&self) -> Option<String> {
        match self {
            Demande::Command(c) => Some(format!("cmd:{c}")),
            Demande::Mcp(n) => Some(format!("mcp:{n}")),
            _ => None,
        }
    }
}

fn str_field<'a>(v: Option<&'a Value>, keys: &[&str]) -> Option<&'a str> {
    let v = v?;
    keys.iter()
        .find_map(|k| v.get(*k).and_then(Value::as_str))
        .filter(|s| !s.trim().is_empty())
}

fn diff_paths(tool_call: &Value) -> Vec<&str> {
    tool_call
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|c| c.get("type").and_then(Value::as_str) == Some("diff"))
        .filter_map(|c| c.get("path").and_then(Value::as_str))
        .collect()
}

fn is_plan_path(path: &str) -> bool {
    path.ends_with("/implementation_plan.md") && path.contains("/brain/")
}

pub(crate) fn classify(params: &Value) -> Demande {
    let tool_call = params.get("toolCall").cloned().unwrap_or(Value::Null);
    let input = tool_input(&tool_call);
    let feedback = input
        .and_then(|i| i.pointer("/ArtifactMetadata/RequestFeedback"))
        .and_then(Value::as_bool)
        == Some(true);
    let plan_path = diff_paths(&tool_call).into_iter().any(is_plan_path)
        || str_field(input, &["TargetFile", "path", "file_path", "AbsolutePath"])
            .is_some_and(is_plan_path);
    if feedback || plan_path {
        return Demande::Plan;
    }
    let name = native_tool_name(&tool_call).unwrap_or("");
    let kind = tool_call.get("kind").and_then(Value::as_str).unwrap_or("");
    if name == ASK_QUESTION {
        return Demande::Other;
    }
    if name.starts_with("mcp_") {
        return Demande::Mcp(name.to_string());
    }
    if matches!(name, "write_file" | "edit_file") || kind == "edit" {
        return Demande::Edit;
    }
    if name == "run_command" || kind == "execute" {
        return match str_field(input, &["CommandLine", "commandLine", "command", "cmd"]) {
            Some(line) => Demande::Command(line.trim().to_string()),
            None => Demande::Other,
        };
    }
    Demande::Other
}

/// optionId offert par agy pour un `kind` donné (unique), sinon l'id brut.
fn option_of_kind<'a>(params: &'a Value, kind: &str, fallback: &str) -> Option<&'a str> {
    let options = params.get("options").and_then(Value::as_array)?;
    let mut of_kind = options
        .iter()
        .filter(|o| o.get("kind").and_then(Value::as_str) == Some(kind));
    if let (Some(first), None) = (of_kind.next(), of_kind.next()) {
        return first.get("optionId").and_then(Value::as_str);
    }
    options
        .iter()
        .filter_map(|o| o.get("optionId").and_then(Value::as_str))
        .find(|id| *id == fallback)
}

fn choice(id: &str, label: &str, description: &str, kind: &str) -> Value {
    json!({"optionId": id, "label": label, "description": description, "kind": kind})
}

fn bounded(text: &str, max: usize) -> String {
    if text.len() <= max {
        return text.to_string();
    }
    let mut end = max;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n\n… (tronqué)", &text[..end])
}

/// Texte du plan proposé : `newText` du diff, sinon le contenu des arguments.
fn plan_text(tool_call: &Value) -> String {
    let from_diff = tool_call
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|c| c.get("type").and_then(Value::as_str) == Some("diff"))
        .find_map(|c| c.get("newText").and_then(Value::as_str));
    from_diff
        .or_else(|| {
            str_field(
                tool_input(tool_call),
                &["CodeContent", "content", "Content"],
            )
        })
        .unwrap_or("")
        .to_string()
}

/// Carte d'interaction d'une permission agy, construite depuis les seuls
/// paramètres de `session/request_permission` (le runtime l'appelle pour la
/// méthode `antigravity/request_permission`).
pub fn interaction_spec(params: &Value) -> Value {
    let tool_call = params.get("toolCall").cloned().unwrap_or(Value::Null);
    let item_id = tool_call.get("toolCallId").cloned().unwrap_or(Value::Null);
    let allow = option_of_kind(params, "allow_once", "allow");
    let deny = option_of_kind(params, "reject_once", "deny");
    let (Some(allow), Some(deny)) = (allow, deny) else {
        // Forme inattendue : les options d'agy telles quelles, dans l'ordre.
        let choices: Vec<Value> = params
            .get("options")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .map(|o| {
                json!({
                    "optionId": o.get("optionId").cloned().unwrap_or(Value::Null),
                    "label": o.get("name").and_then(Value::as_str).unwrap_or("?"),
                    "kind": o.get("kind").cloned().unwrap_or(Value::Null),
                })
            })
            .collect();
        return json!({
            "interactionType": "approval",
            "title": tool_call.get("title").and_then(Value::as_str).unwrap_or("Permission"),
            "choices": choices,
            "itemId": item_id,
        });
    };

    let demande = classify(params);
    if demande == Demande::Plan {
        return json!({
            "interactionType": "approval",
            "title": "Plan prêt à exécuter",
            "markdown": bounded(&plan_text(&tool_call), PLAN_MAX),
            "choices": [
                choice(allow, "Approuver le plan", "Antigravity passe à l'exécution", "allow_once"),
                choice(deny, "Continuer à planifier", "Le plan n'est pas enregistré", "reject_once"),
            ],
            "itemId": item_id,
        });
    }

    let input = tool_input(&tool_call);
    let name = native_tool_name(&tool_call).unwrap_or("");
    let (title, detail, always) = match &demande {
        Demande::Command(line) => (
            "Exécution de commande".to_string(),
            line.clone(),
            Some(choice(
                OPT_ALWAYS_THREAD,
                "Toujours pour ce fil",
                "Cette commande exacte ne redemande plus dans ce fil",
                "allow_always",
            )),
        ),
        Demande::Mcp(tool) => (
            "Outil MCP".to_string(),
            tool.clone(),
            Some(choice(
                OPT_ALWAYS_THREAD,
                "Toujours pour ce fil",
                "Cet outil ne redemande plus dans ce fil",
                "allow_always",
            )),
        ),
        Demande::Edit => {
            let mut paths: Vec<String> = diff_paths(&tool_call)
                .into_iter()
                .map(str::to_string)
                .collect();
            if paths.is_empty() {
                if let Some(p) =
                    str_field(input, &["TargetFile", "path", "file_path", "AbsolutePath"])
                {
                    paths.push(p.to_string());
                }
            }
            (
                "Modification de fichiers".to_string(),
                paths.join(" · "),
                Some(choice(
                    OPT_ALWAYS_EDITS,
                    "Toujours autoriser les modifications",
                    "La session passe en mode « accepter les modifications »",
                    "allow_always",
                )),
            )
        }
        _ => {
            let title = tool_call
                .get("title")
                .and_then(Value::as_str)
                .filter(|t| !t.is_empty())
                .unwrap_or(if name.is_empty() { "Permission" } else { name });
            (format!("Outil {title}"), String::new(), None)
        }
    };
    let mut choices = vec![choice(allow, "Autoriser", "Une seule fois", "allow_once")];
    choices.extend(always);
    choices.push(choice(
        deny,
        "Refuser",
        "Antigravity renonce à cette action",
        "reject_once",
    ));
    let mut spec = json!({
        "interactionType": "approval",
        "title": title,
        "choices": choices,
        "itemId": item_id,
    });
    if !detail.is_empty() {
        spec["detail"] = json!(bounded(&detail, 400));
    }
    spec
}

/// Ce que le provider doit faire en plus de répondre à agy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Suite {
    Rien,
    /// Retenir la règle (clé) pour le fil.
    Regle(String),
    /// Passer la session en `accept-edits` et le retenir pour le fil.
    ModificationsToujours,
}

/// Réponse de l'interface → outcome ACP + suite. « Toujours » est lu AVANT
/// `permission_outcome`, qui retomberait sinon en silence sur « une fois »
/// (agy n'offre aucune option `allow_always`).
pub(crate) fn resolve_answer(params: &Value, answer: Option<Value>) -> (Value, Suite) {
    let demande = classify(params);
    let allow = option_of_kind(params, "allow_once", "allow");
    let selected = |id: &str| json!({"outcome": {"outcome": "selected", "optionId": id}});
    let wants_always = answer.as_ref().is_some_and(|a| {
        matches!(
            a.get("optionId").and_then(Value::as_str),
            Some(OPT_ALWAYS_THREAD | OPT_ALWAYS_EDITS)
        ) || (a.get("allow").and_then(Value::as_bool) == Some(true)
            && a.get("scope").and_then(Value::as_str) == Some("session"))
    });
    if wants_always {
        if let Some(allow) = allow {
            match (&demande, demande.rule_key()) {
                (_, Some(key)) => return (selected(allow), Suite::Regle(key)),
                (Demande::Edit, None) => return (selected(allow), Suite::ModificationsToujours),
                _ => return (selected(allow), Suite::Rien),
            }
        }
    }
    (permission_outcome(params, answer, LABEL, true), Suite::Rien)
}

/// Réponse automatique sans carte : règle du fil, ou `bypassPermissions`
/// hors questions et revue de plan.
pub(crate) fn auto_answer(
    params: &Value,
    bypass: bool,
    rules: Option<&HashSet<String>>,
) -> Option<Value> {
    let allow = option_of_kind(params, "allow_once", "allow")?;
    let demande = classify(params);
    let is_question = params
        .get("toolCall")
        .and_then(native_tool_name)
        .is_some_and(|n| n == ASK_QUESTION);
    if demande == Demande::Plan || is_question {
        return None;
    }
    let by_rule = demande
        .rule_key()
        .is_some_and(|k| rules.is_some_and(|r| r.contains(&k)));
    (bypass || by_rule).then(|| json!({"outcome": {"outcome": "selected", "optionId": allow}}))
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

impl AntigravityProvider {
    async fn ensure_acp(&self) -> Result<AcpInitializeResult, AcpRpcError> {
        self.acp
            .ensure_in(
                &self.bin,
                &self.acp_args,
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        // agy garde ses propres outils locaux ; pas
                        // d'élicitation avant de savoir y répondre (D14).
                        "fs": {"readTextFile": false, "writeTextFile": false},
                        "terminal": false
                    }
                }),
                Some(self.process_dir.as_path()),
            )
            .await
    }

    /// Handshake vérifié : protocole 1 et version minimale.
    async fn ensure_ready(&self) -> Result<AcpInitializeResult, String> {
        let init = self.ensure_acp().await.map_err(|e| user_error(&e))?;
        if init.protocol_version != 1 {
            return Err(format!(
                "Antigravity annonce protocolVersion {} (attendu 1) : intégration à mettre à jour.",
                init.protocol_version
            ));
        }
        let info = init.agent_info.as_ref();
        if let Some(name) = info.and_then(|i| i.get("name")).and_then(Value::as_str) {
            if name != AGENT_NAME {
                eprintln!("[antigravity] agentInfo.name inattendu: {name}");
            }
        }
        if let Some(v) = info.and_then(|i| i.get("version")).and_then(Value::as_str) {
            if compare_versions(v, AGY_MIN_VERSION) < 0 {
                return Err(format!(
                    "Antigravity {v} est trop ancien pour Atelier (minimum {AGY_MIN_VERSION}). \
                     Mets agy à jour, puis renvoie ton message."
                ));
            }
        }
        self.reset_state_if_respawned();
        Ok(init)
    }

    fn reset_state_if_respawned(&self) {
        let generation = self.acp.generation();
        if self.state.lock().unwrap().reset_if_respawned(generation) {
            self.config.lock().unwrap().clear();
            self.modes.lock().unwrap().clear();
            self.commands.lock().unwrap().clear();
        }
    }

    fn remember_session(&self, sid: &str, result: &Value) {
        remember_config_snapshot(&self.config, sid, result);
        if let Some(modes) = SessionModes::from_result(result) {
            self.modes.lock().unwrap().insert(sid.to_string(), modes);
        }
    }

    async fn open_session(&self, req: &SendRequest, cwd: &str) -> Result<String, String> {
        let servers = atelier_mcp_servers(req.atelier_mcp.as_ref());
        let empreinte = atelier_mcp_fingerprint(&servers);
        let requested = req
            .session_id
            .as_ref()
            .filter(|s| !s.is_empty())
            .cloned()
            .filter(|sid| !self.state.lock().unwrap().is_invalid(sid));

        if let Some(sid) = requested {
            if self.state.lock().unwrap().is_open_with(&sid, empreinte) {
                return Ok(sid);
            }
            match self
                .acp
                .request(
                    "session/resume",
                    json!({"sessionId": sid, "cwd": cwd, "mcpServers": servers}),
                    Some(30_000),
                )
                .await
            {
                Ok(result) => {
                    self.state.lock().unwrap().mark_open(&sid, empreinte);
                    self.remember_session(&sid, &result);
                    return Ok(sid);
                }
                Err(e) if is_session_gone(&e) => {
                    self.state.lock().unwrap().mark_invalid(&sid);
                    return Err(format!(
                        "La session Antigravity {sid} n'existe plus : renvoie ton message pour \
                         en démarrer une nouvelle."
                    ));
                }
                Err(e) => return Err(user_error(&e)),
            }
        }

        let result = self
            .acp
            .request(
                "session/new",
                json!({"cwd": cwd, "mcpServers": servers}),
                Some(30_000),
            )
            .await
            .map_err(|e| user_error(&e))?;
        let sid = result
            .get("sessionId")
            .and_then(Value::as_str)
            .ok_or("session/new sans sessionId")?
            .to_string();
        self.state.lock().unwrap().mark_open(&sid, empreinte);
        self.remember_session(&sid, &result);
        Ok(sid)
    }

    /// Aligne une option de session (`model`, `thought_level`). Un refus
    /// arrête le tour avec un message clair, jamais en silence.
    async fn align_option(
        &self,
        sid: &str,
        category: &str,
        target: &str,
        required: bool,
    ) -> Result<(), String> {
        let snapshot = self
            .config
            .lock()
            .unwrap()
            .get(sid)
            .cloned()
            .unwrap_or(Value::Null);
        let Some(option) = find_config_option_by(&snapshot, category, category) else {
            if required {
                return Err(format!(
                    "Antigravity n'expose pas le réglage « {category} » pour cette session."
                ));
            }
            // Effort demandé pour un modèle sans réglage de réflexion.
            return Ok(());
        };
        let config_id = option
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or(category)
            .to_string();
        if option.get("currentValue").and_then(Value::as_str) == Some(target) {
            return Ok(());
        }
        let values = option_values(option);
        if !values.iter().any(|v| v == target) {
            return Err(format!(
                "« {target} » n'est pas proposé par Antigravity pour « {config_id} » (choix : {}).",
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
            .map_err(|e| {
                format!(
                    "Antigravity a refusé {config_id}={target} : {}",
                    user_error(&e)
                )
            })?;
        remember_config_snapshot(&self.config, sid, &result);
        Ok(())
    }

    /// Modèle, puis réflexion (ses crans peuvent dépendre du modèle), puis
    /// mode, posé à chaque tour (D6).
    async fn align_session(&self, sid: &str, req: &SendRequest) -> Result<(), String> {
        if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
            self.align_option(sid, "model", model, true).await?;
        }
        if let Some(effort) = req.effort.as_deref().filter(|e| !e.is_empty()) {
            self.align_option(sid, "thought_level", effort, false)
                .await?;
        }
        let mode = req.permission_mode.as_deref().unwrap_or("");
        let edits_always = self.edits_always.lock().unwrap().contains(&req.thread_id);
        let Some(target) = map_permission_mode(mode, edits_always) else {
            return Err(format!("mode Atelier inconnu pour Antigravity : {mode}"));
        };
        let current = self.modes.lock().unwrap().get(sid).cloned();
        let Some(mut modes) = current else {
            return Err("Antigravity n'a annoncé aucun mode pour cette session.".into());
        };
        set_session_mode(&self.acp, sid, &mut modes, target, LABEL).await?;
        self.modes.lock().unwrap().insert(sid.to_string(), modes);
        Ok(())
    }

    fn make_server_handler(
        &self,
        sid: &str,
        thread_id: &str,
        bypass: bool,
        on_interaction: Option<InteractionFn>,
        activity: crate::turn_idle::TurnActivity,
    ) -> ServerRequestHandler {
        let rules = Arc::clone(&self.rules);
        let edits_always = Arc::clone(&self.edits_always);
        let modes = Arc::clone(&self.modes);
        let acp = self.acp.clone();
        let sid = sid.to_string();
        let thread_id = thread_id.to_string();
        Arc::new(move |method: String, params: Value| {
            let relay = on_interaction.clone();
            let activity = activity.clone();
            let rules = Arc::clone(&rules);
            let edits_always = Arc::clone(&edits_always);
            let modes = Arc::clone(&modes);
            let acp = acp.clone();
            let sid = sid.clone();
            let thread_id = thread_id.clone();
            Box::pin(async move {
                activity.bump();
                if method != "session/request_permission" {
                    return Value::Null; // non annoncé ⇒ -32601
                }
                let auto = {
                    let rules = rules.lock().unwrap();
                    auto_answer(&params, bypass, rules.get(&thread_id))
                };
                if let Some(outcome) = auto {
                    return outcome;
                }
                let _attente = activity.wait_for_human();
                let answer = match relay {
                    Some(relay) => relay(PERMISSION_METHOD.to_string(), params.clone()).await,
                    None => None,
                };
                let (outcome, suite) = resolve_answer(&params, answer);
                match suite {
                    Suite::Rien => {}
                    Suite::Regle(key) => {
                        rules
                            .lock()
                            .unwrap()
                            .entry(thread_id)
                            .or_default()
                            .insert(key);
                    }
                    Suite::ModificationsToujours => {
                        edits_always.lock().unwrap().insert(thread_id);
                        // Après la réponse : agy traite la permission en
                        // attente, puis change de mode.
                        tokio::spawn(async move {
                            let current = modes.lock().unwrap().get(&sid).cloned();
                            if let Some(mut m) = current {
                                match set_session_mode(&acp, &sid, &mut m, "accept-edits", LABEL)
                                    .await
                                {
                                    Ok(()) => {
                                        modes.lock().unwrap().insert(sid, m);
                                    }
                                    Err(e) => eprintln!("[antigravity] {e}"),
                                }
                            }
                        });
                    }
                }
                outcome
            })
        })
    }

    async fn send_acp(&self, req: &SendRequest) -> Result<SendResult, String> {
        let cwd = if req.project_root.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        } else {
            req.project_root.clone()
        };
        let init = self.ensure_ready().await?;

        let prompt_blocks = build_prompt_blocks(req)?;
        if has_image_block(&prompt_blocks)
            && init
                .agent_capabilities
                .pointer("/promptCapabilities/image")
                .and_then(Value::as_bool)
                != Some(true)
        {
            return Err("Antigravity n'annonce pas la capacité image.".into());
        }

        let sid = self.open_session(req, &cwd).await?;
        self.align_session(&sid, req).await?;

        let state = Arc::new(StdMutex::new((
            TurnCtx::default(),
            TurnEmitter::new(req.on_event.clone()),
        )));
        let saw_content = Arc::new(AtomicBool::new(false));
        let saw_content_handler = Arc::clone(&saw_content);
        let handler_state = Arc::clone(&state);
        let config_cache = Arc::clone(&self.config);
        let modes_cache = Arc::clone(&self.modes);
        let commands_cache = Arc::clone(&self.commands);
        let sid_for_handler = sid.clone();
        let activity = crate::turn_idle::TurnActivity::new();
        let handler_activity = activity.clone();
        let handler: SessionUpdateHandler = Arc::new(move |update: &Value| {
            handler_activity.bump();
            let kind = update.get("sessionUpdate").and_then(Value::as_str);
            if matches!(
                kind,
                Some(
                    "agent_message_chunk"
                        | "agent_thought_chunk"
                        | "tool_call"
                        | "tool_call_update"
                )
            ) {
                saw_content_handler.store(true, Ordering::Relaxed);
            }
            match kind {
                Some("config_option_update") => {
                    if let Some(opts) = update.get("configOptions").filter(|o| o.is_array()) {
                        config_cache
                            .lock()
                            .unwrap()
                            .insert(sid_for_handler.clone(), opts.clone());
                    }
                }
                Some("current_mode_update") => {
                    if let Some(m) = modes_cache.lock().unwrap().get_mut(&sid_for_handler) {
                        m.apply_update(update);
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
            for ev in map_agy_session_update(update, ctx) {
                emitter.emit(ev);
            }
        });
        self.acp.set_session_handler(&sid, handler).await;
        let bypass = req.permission_mode.as_deref() == Some("bypassPermissions");
        self.acp
            .set_session_server_handler(
                &sid,
                self.make_server_handler(
                    &sid,
                    &req.thread_id,
                    bypass,
                    req.on_interaction.clone(),
                    activity.clone(),
                ),
            )
            .await;
        self.active_turns
            .lock()
            .unwrap()
            .insert(req.thread_id.clone(), sid.clone());

        let closed = Arc::new(AtomicBool::new(false));
        let watcher = spawn_cancel_watcher(
            self.acp.clone(),
            sid.clone(),
            Arc::clone(&req.is_cancelled),
            Some(StopEscalation {
                close_after: self.stop_close_after,
                closed: Arc::clone(&closed),
            }),
        );

        // Jamais deux prompts sur la même session : agy fusionnerait le
        // second dans le tour en cours (pilotage, lot 8).
        let prompt_res = crate::turn_idle::with_idle_timeout(
            self.acp.request(
                "session/prompt",
                json!({"sessionId": sid, "prompt": prompt_blocks}),
                None,
            ),
            self.idle,
            &activity,
        )
        .await;
        if prompt_res.is_err() {
            self.acp
                .notify("session/cancel", json!({"sessionId": sid}))
                .await;
        }

        watcher.abort();
        self.acp.clear_session_handler(&sid).await;
        self.acp.clear_session_server_handler(&sid).await;
        self.active_turns.lock().unwrap().remove(&req.thread_id);
        if closed.load(Ordering::SeqCst) {
            // Session fermée par l'escalade du Stop : le prochain tour la
            // rouvre au lieu d'écrire dans une session close.
            self.state.lock().unwrap().forget(&sid);
        }

        let (ok, error) = match prompt_res {
            Err(()) => {
                state.lock().unwrap().1.flush();
                let message = format!(
                    "timeout Antigravity : CLI muet depuis {} (aucun signe de vie), tour interrompu",
                    crate::turn_idle::describe(self.idle)
                );
                (req.on_event)(json!({"kind": "error", "message": message.clone()}));
                (false, Some(message))
            }
            Ok(Err(e)) => {
                state.lock().unwrap().1.flush();
                (req.on_event)(json!({"kind": "error", "message": user_error(&e)}));
                (false, Some(e.to_string()))
            }
            Ok(Ok(result)) => {
                let mut done = {
                    let mut guard = state.lock().unwrap();
                    let (ctx, emitter) = &mut *guard;
                    for ev in close_orphan_questions(ctx) {
                        emitter.emit(ev);
                    }
                    emitter.flush();
                    map_agy_prompt_result(&result, ctx)
                };
                let mut ok = done.get("ok").and_then(Value::as_bool).unwrap_or(false);
                let stop = result
                    .get("stopReason")
                    .and_then(Value::as_str)
                    .unwrap_or("stopReason inconnu");
                let silent = ok
                    && stop == "end_turn"
                    && !saw_content.load(Ordering::Relaxed)
                    && result.get("usage").is_none();
                if silent {
                    done["ok"] = json!(false);
                    ok = false;
                    (req.on_event)(json!({
                        "kind": "error",
                        "message": "Antigravity a terminé le tour sans répondre. Réessaie, ou \
                                    démarre une nouvelle conversation."
                    }));
                }
                (req.on_event)(done);
                let error = if ok {
                    None
                } else if silent {
                    Some("tour Antigravity vide (end_turn sans contenu)".to_string())
                } else {
                    Some(match stop {
                        "refusal" => "Antigravity a refusé la requête (refusal).".to_string(),
                        other => format!("tour Antigravity terminé : {other}"),
                    })
                };
                (ok, error)
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
impl Provider for AntigravityProvider {
    fn id(&self) -> &str {
        "antigravity"
    }
    fn label(&self) -> &str {
        LABEL
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
    /// Catalogue lu dans les options de session (lot 3), jamais en dur.
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
        match sid {
            Some(sid) => {
                self.acp
                    .notify("session/cancel", json!({"sessionId": sid}))
                    .await;
                true
            }
            None => false,
        }
    }

    /// `session/list` ignore `cwd` chez agy : le filtre se fait ici, sur
    /// chemins canoniques des deux côtés (`/tmp` ↔ `/private/tmp`).
    async fn list_sessions(&self, project_root: &str) -> Option<Vec<Value>> {
        self.ensure_ready().await.ok()?;
        let result = self
            .acp
            .request("session/list", json!({}), Some(15_000))
            .await
            .ok()?;
        let wanted = (!project_root.is_empty()).then(|| canonical(project_root));
        let sessions = result
            .get("sessions")?
            .as_array()?
            .iter()
            .filter(|s| {
                let cwd = s.get("cwd").and_then(Value::as_str).unwrap_or("");
                wanted.as_ref().is_none_or(|w| &canonical(cwd) == w)
            })
            .map(|s| {
                let sid = s.get("sessionId").and_then(Value::as_str).unwrap_or("");
                let title = s
                    .get("title")
                    .and_then(Value::as_str)
                    .filter(|t| !t.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| sid.chars().take(16).collect());
                json!({
                    "id": sid,
                    "title": title,
                    "mtime": s
                        .get("updatedAt")
                        .and_then(Value::as_str)
                        .and_then(iso8601_to_epoch_ms)
                        .unwrap_or(0),
                    "projectRoot": s.get("cwd").and_then(Value::as_str).unwrap_or(""),
                })
            })
            .collect();
        Some(sessions)
    }

    /// Import d'une session agy : `session/load` rejoue tout avant de
    /// répondre (0,1 s à la sonde). Une seule fois par génération du process.
    async fn native_history(&self, session_id: &str, project_root: &str) -> Option<Vec<Value>> {
        if session_id.is_empty() {
            return None;
        }
        self.ensure_ready().await.ok()?;
        if self.state.lock().unwrap().is_open(session_id) {
            return None;
        }
        let captured: Arc<StdMutex<Vec<Value>>> = Arc::new(StdMutex::new(Vec::new()));
        let sink = Arc::clone(&captured);
        let handler: SessionUpdateHandler =
            Arc::new(move |u: &Value| sink.lock().unwrap().push(u.clone()));
        self.acp.set_session_handler(session_id, handler).await;
        let cwd = if project_root.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        } else {
            project_root.to_string()
        };
        let res = self
            .acp
            .request(
                "session/load",
                json!({"sessionId": session_id, "cwd": cwd, "mcpServers": []}),
                Some(30_000),
            )
            .await;
        self.acp.clear_session_handler(session_id).await;
        let result = res.ok()?;
        self.state
            .lock()
            .unwrap()
            .mark_open(session_id, atelier_mcp_fingerprint(&json!([])));
        self.remember_session(session_id, &result);
        let updates = captured.lock().unwrap().clone();
        Some(crate::acp_session::replay_to_history(
            &updates,
            map_agy_session_update,
        ))
    }
}

#[cfg(test)]
#[path = "antigravity_tests.rs"]
mod tests;
