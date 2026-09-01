//! OpenCode provider — ACP d'abord (`opencode acp`, plan 045), repli sur le
//! CLI JSON stream one-shot (plan 033 Porte 8) en cas d'échec de handshake.

use crate::acp_map::{map_prompt_result, map_session_update, TurnCtx, TurnEmitter};
use crate::acp_rpc::{AcpServer, ServerRequestHandler, SessionUpdateHandler};
use crate::opencode_parse::parse_opencode_jsonl;

use crate::traits::{
    atelier_mcp_fingerprint, atelier_mcp_servers, Provider, ProviderCaps, SendRequest, SendResult,
};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// État par-session du process ACP courant — invalidé quand la génération du
/// process change (respawn) : les sessions "chargées" ne le sont plus.
#[derive(Default)]
struct AcpState {
    generation: u64,
    /// sessionId → empreinte des `mcpServers` déclarés à son ouverture. Une
    /// session n'a besoin d'être rechargée que si cette déclaration a changé.
    loaded_sessions: HashMap<String, u64>,
    /// sessionId → dernier modelId aligné/connu (currentValue de session/new).
    session_model: HashMap<String, String>,
}

struct CachedModelCatalog {
    fetched_at: Instant,
    value: Value,
}

const MODEL_CATALOG_TTL: Duration = Duration::from_secs(5 * 60);
// `opencode models` interroge le catalogue distant (models.dev) avant de
// répondre : mesuré 13,8 s à chaud et jusqu'à 30,6 s à froid sur le Mac de
// Thierry (2026-08-25). Sous 45 s, le timeout expirait à chaque appel,
// `dynamic_models` renvoyait None et le picker retombait sur la poignée de
// routes en dur ci-dessous — d'où l'impossibilité de choisir une passerelle
// (`opencode-go/…`) pourtant authentifiée.
const MODEL_CATALOG_TIMEOUT: Duration = Duration::from_secs(45);
const MAX_CATALOG_MODELS: usize = 5_000;

/// Itère les lignes valides d'une sortie `opencode models` : non vides, avec
/// un slash, sans espace ni `://`, pas trop longues, dédoublonnées et
/// plafonnées à `MAX_CATALOG_MODELS`. Partagé par `parse_model_catalog` et
/// `parse_routed_models` pour que les deux vues du catalogue ne puissent
/// jamais diverger.
fn filtered_catalog_lines(output: &str) -> impl Iterator<Item = &str> {
    let mut seen = HashSet::new();
    output
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && line.len() <= 512
                && line.contains('/')
                && !line.contains("://")
                && !line.chars().any(char::is_whitespace)
        })
        .filter(move |line| seen.insert(*line))
        .take(MAX_CATALOG_MODELS)
}

fn parse_model_catalog(output: &str) -> Vec<String> {
    filtered_catalog_lines(output).map(str::to_string).collect()
}

/// Un identifiant de modèle renvoyé par opencode n'est pas un nom de modèle
/// plat : c'est une route. Le premier segment est la passerelle
/// (`opencode`, `openrouter`, `kimi-for-coding`…), un éventuel segment
/// intermédiaire est l'éditeur (`z-ai`, `deepseek`…), et le reste est le nom
/// du modèle. `id` reste la chaîne d'origine exacte — c'est elle qu'on
/// renvoie au CLI — alors que `leaf` sert seulement à l'affichage.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutedModel {
    pub id: String,
    pub gateway: String,
    pub vendor: Option<String>,
    pub leaf: String,
    pub free: bool,
}

/// Découpe un identifiant routé unique. `id` est toujours la ligne complète
/// et inchangée ; seul `leaf` perd le suffixe `:free`/`-free`. Au-delà de
/// trois segments, tout le reste (avec ses slashes) atterrit dans `leaf` —
/// on ne perd jamais d'information, quitte à afficher un nom long.
fn split_routed_model(id: &str) -> RoutedModel {
    let (sans_suffixe, free) = if let Some(s) = id.strip_suffix(":free") {
        (s, true)
    } else if let Some(s) = id.strip_suffix("-free") {
        (s, true)
    } else {
        (id, false)
    };
    let mut segments = sans_suffixe.splitn(3, '/');
    let gateway = segments.next().unwrap_or_default().to_string();
    let second = segments.next();
    let third = segments.next();
    let (vendor, leaf) = match (second, third) {
        (Some(v), Some(l)) => (Some(v.to_string()), l.to_string()),
        (Some(v), None) => (None, v.to_string()),
        // Inatteignable : `filtered_catalog_lines` ne laisse passer que des
        // lignes contenant au moins un `/` (garantie `line.contains('/')`),
        // donc `segments.next()` après le premier renvoie toujours `Some`.
        // Ce bras existe seulement pour l'exhaustivité du match.
        (None, _) => (None, String::new()),
    };
    RoutedModel {
        id: id.to_string(),
        gateway,
        vendor,
        leaf,
        free,
    }
}

pub fn parse_routed_models(output: &str) -> Vec<RoutedModel> {
    filtered_catalog_lines(output)
        .map(split_routed_model)
        .collect()
}

/// Construit la charge utile de `dynamic_models` à partir de la sortie brute
/// d'`opencode models`. Factorisé hors de `dynamic_models` (qui spawn un
/// process et n'est donc pas testable unitairement) pour que le test exerce
/// exactement le même chemin de construction.
///
/// Additif, jamais substitutif : `models` reste le tableau plat de chaînes
/// déjà consommé par le picker et `Chat.tsx` — **inchangé**. `routes` est un
/// champ voisin, nouveau, ignorable par tout frontend qui ne le connaît pas
/// encore.
fn build_dynamic_models_payload(output: &str, default_model: &str) -> Option<Value> {
    let models = parse_model_catalog(output);
    if models.is_empty() {
        return None;
    }
    let routes = parse_routed_models(output);
    Some(json!({
        "models": models,
        "routes": routes,
        "defaultModel": default_model,
        "modelReasoning": {}
    }))
}

pub struct OpenCodeProvider {
    bin: PathBuf,
    runs: Mutex<HashMap<String, Child>>,
    acp: AcpServer,
    acp_state: Mutex<AcpState>,
    /// thread_id → sessionId ACP du tour en cours (pour interrupt).
    active_turns: Mutex<HashMap<String, String>>,
    model_catalog: Mutex<Option<CachedModelCatalog>>,
}

impl OpenCodeProvider {
    pub fn new() -> Option<Self> {
        resolve_bin().map(|bin| {
            let acp = AcpServer::new("opencode");
            // Politique du plan 045 conservée PAR OpenCode (plan 046 §2.4) :
            // le client générique n'auto-approuve plus rien, c'est ce handler
            // par défaut qui porte la parité `--auto` du chemin legacy
            // (le catalogue déclare toujours `permissions:false`).
            acp.set_default_server_handler(opencode_server_policy());
            Self {
                bin,
                runs: Mutex::new(HashMap::new()),
                acp,
                acp_state: Mutex::new(AcpState::default()),
                active_turns: Mutex::new(HashMap::new()),
                model_catalog: Mutex::new(None),
            }
        })
    }
}

/// Auto-approbation `allow_once` (sinon la première option, sinon refus sûr) ;
/// toute autre méthode serveur→client ⇒ `Null` ⇒ -32601 côté client générique.
fn opencode_server_policy() -> ServerRequestHandler {
    Arc::new(|method: String, params: Value| {
        Box::pin(async move {
            if method != "session/request_permission" {
                return Value::Null;
            }
            let options = params.get("options").and_then(Value::as_array);
            let picked = options.and_then(|opts| {
                opts.iter()
                    .find(|o| o.get("kind").and_then(Value::as_str) == Some("allow_once"))
                    .or_else(|| opts.first())
            });
            match picked.and_then(|o| o.get("optionId")).cloned() {
                Some(option_id) => {
                    json!({"outcome": {"outcome": "selected", "optionId": option_id}})
                }
                None => json!({"outcome": {"outcome": "cancelled"}}),
            }
        })
    })
}

/// `currentValue` de l'option `category=="model"` d'une réponse
/// session/new|load (forme vérifiée par sonde, plan 045).
fn current_model_of(result: &Value) -> Option<String> {
    result
        .get("configOptions")
        .and_then(|v| v.as_array())?
        .iter()
        .find(|o| o.get("category").and_then(|c| c.as_str()) == Some("model"))
        .and_then(|o| o.get("currentValue"))
        .and_then(|v| v.as_str())
        .map(str::to_string)
}

impl OpenCodeProvider {
    /// Chemin ACP complet. `Err` = échec de HANDSHAKE (spawn/initialize/
    /// ouverture de session) ⇒ repli legacy chez l'appelant. Une erreur en
    /// cours de tour ne déclenche PAS de repli (décision 7 du plan 045) :
    /// elle devient `{kind:"error"}` + `SendResult{ok:false}` dans le Ok.
    async fn send_acp(&self, req: &SendRequest) -> Result<SendResult, String> {
        let cwd = if req.project_root.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        } else {
            req.project_root.clone()
        };

        self.acp
            .ensure(
                &self.bin,
                &["acp".to_string()],
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        "fs": {"readTextFile": false, "writeTextFile": false},
                        "terminal": false
                    }
                }),
            )
            .await?;

        {
            let mut st = self.acp_state.lock().await;
            let generation = self.acp.generation();
            if st.generation != generation {
                *st = AcpState {
                    generation,
                    ..Default::default()
                };
            }
        }

        let sid = self.open_session(req, &cwd).await?;
        self.align_model(&sid, req.model.as_deref()).await;
        // req.effort : pas d'équivalent ACP (décision 3 du plan 045) — ignoré.

        let state = Arc::new(StdMutex::new((
            TurnCtx::default(),
            TurnEmitter::new(req.on_event.clone()),
        )));
        let handler_state = Arc::clone(&state);
        let handler: SessionUpdateHandler = Arc::new(move |update: &Value| {
            let mut guard = handler_state.lock().unwrap();
            let (ctx, emitter) = &mut *guard;
            for ev in map_session_update(update, ctx) {
                emitter.emit(ev);
            }
        });
        self.acp.set_session_handler(&sid, handler).await;
        self.active_turns
            .lock()
            .await
            .insert(req.thread_id.clone(), sid.clone());

        // Sonde d'annulation : le router pose is_cancelled, le prompt en cours
        // se résout ensuite avec stopReason:"cancelled" (contrat sonde).
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
                json!({
                    "sessionId": sid,
                    "prompt": [{"type": "text", "text": req.prompt}]
                }),
                None,
            )
            .await;

        watcher.abort();
        self.acp.clear_session_handler(&sid).await;
        self.active_turns.lock().await.remove(&req.thread_id);

        let (ok, error) = match prompt_res {
            Ok(result) => {
                let done = {
                    let mut guard = state.lock().unwrap();
                    let (ctx, emitter) = &mut *guard;
                    emitter.flush();
                    map_prompt_result(&result, ctx)
                };
                let ok = done.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                (req.on_event)(done);
                let error = if ok {
                    None
                } else {
                    Some(
                        result
                            .get("stopReason")
                            .and_then(|v| v.as_str())
                            .unwrap_or("stopReason inconnu")
                            .to_string(),
                    )
                };
                (ok, error)
            }
            Err(e) => {
                state.lock().unwrap().1.flush();
                (req.on_event)(json!({"kind":"error","message": format!("opencode acp: {e}")}));
                (false, Some(e.to_string()))
            }
        };

        Ok(SendResult {
            session_id: Some(sid),
            ok,
            error,
        })
    }

    /// session/load si un sessionId existe (repli session/new si refusé avec
    /// process vivant — thread déplacé/cwd différent, même règle que
    /// openGrokSession grok.mjs:719-748), sinon session/new.
    async fn open_session(&self, req: &SendRequest, cwd: &str) -> Result<String, String> {
        let servers = atelier_mcp_servers(req.atelier_mcp.as_ref());
        let empreinte = atelier_mcp_fingerprint(&servers);
        if let Some(sid) = req.session_id.as_ref().filter(|s| !s.is_empty()) {
            // Voie rapide : session déjà chargée AVEC la même déclaration MCP.
            // La condition portait sur `req.atelier_mcp.is_none()`, morte
            // depuis que le serveur atelier part sur tout fil — un
            // `session/load` par envoi, avec échec dur au moindre problème de
            // transport.
            let already = self
                .acp_state
                .lock()
                .await
                .loaded_sessions
                .get(sid.as_str())
                == Some(&empreinte);
            if already {
                return Ok(sid.clone());
            }
            match self
                .acp
                .request(
                    "session/load",
                    json!({"sessionId": sid, "cwd": cwd, "mcpServers": servers}),
                    Some(30_000),
                )
                .await
            {
                Ok(result) => {
                    let mut st = self.acp_state.lock().await;
                    st.loaded_sessions.insert(sid.clone(), empreinte);
                    if let Some(m) = current_model_of(&result) {
                        st.session_model.insert(sid.clone(), m);
                    }
                    return Ok(sid.clone());
                }
                Err(e) => {
                    // Repli session/new UNIQUEMENT sur une erreur applicative
                    // non-auth (session inconnue/cwd différent) — plan 046
                    // §2.1 : auth, réseau ou process mort ne créent jamais
                    // une nouvelle session en silence.
                    if e.transport || e.is_auth_required() || !self.acp.is_alive().await {
                        return Err(format!("session/load: {e}"));
                    }
                    eprintln!("[opencode] session/load refusé ({sid}), repli session/new: {e}");
                }
            }
        }
        let result = self
            .acp
            .request(
                "session/new",
                json!({"cwd": cwd, "mcpServers": servers}),
                Some(30_000),
            )
            .await?;
        let sid = result
            .get("sessionId")
            .and_then(|v| v.as_str())
            .ok_or("session/new sans sessionId")?
            .to_string();
        let mut st = self.acp_state.lock().await;
        st.loaded_sessions.insert(sid.clone(), empreinte);
        if let Some(m) = current_model_of(&result) {
            st.session_model.insert(sid.clone(), m);
        }
        Ok(sid)
    }

    /// Alignement modèle best-effort — `modelId` = chaîne catalogue telle
    /// quelle (vérifié par sonde) ; un refus n'interrompt jamais le tour.
    async fn align_model(&self, sid: &str, model: Option<&str>) {
        let Some(model) = model.filter(|m| !m.is_empty()) else {
            return;
        };
        let known = self.acp_state.lock().await.session_model.get(sid).cloned();
        if known.as_deref() == Some(model) {
            return;
        }
        match request_model_alignment(&self.acp, sid, model).await {
            Ok(()) => {
                self.acp_state
                    .lock()
                    .await
                    .session_model
                    .insert(sid.to_string(), model.to_string());
            }
            Err(e) => {
                eprintln!("[opencode] alignement modèle ({model}) refusé, ignoré (best-effort): {e}");
            }
        }
    }
}

/// Pose le modèle d'une session ACP. OpenCode 1.x expose `session/set_model` ;
/// OpenCode 2 (sonde beta-17793, 2026-08-21) l'a retiré au profit de
/// `session/set_config_option {configId:"model", value}` — le repli ne se
/// déclenche QUE sur -32601 (méthode inconnue), jamais sur un refus applicatif.
async fn request_model_alignment(acp: &AcpServer, sid: &str, model: &str) -> Result<(), String> {
    let err = match acp
        .request(
            "session/set_model",
            json!({"sessionId": sid, "modelId": model}),
            Some(10_000),
        )
        .await
    {
        Ok(_) => return Ok(()),
        Err(e) => e,
    };
    if err.code != Some(-32601) {
        return Err(format!("session/set_model: {}", String::from(err)));
    }
    acp.request(
        "session/set_config_option",
        json!({"sessionId": sid, "configId": "model", "value": model}),
        Some(10_000),
    )
    .await
    .map(|_| ())
    .map_err(|e| format!("session/set_config_option: {}", String::from(e)))
}

fn resolve_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_OPENCODE_BIN") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    for name in ["opencode", "oc"] {
        if let Ok(out) = std::process::Command::new("which").arg(name).output() {
            if out.status.success() {
                let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
                if !p.as_os_str().is_empty() {
                    return Some(p);
                }
            }
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let p = home.join(".opencode/bin/opencode");
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

fn map_effort(effort: Option<&str>) -> Option<&'static str> {
    match effort? {
        "minimal" | "low" => Some("low"),
        "medium" => Some("medium"),
        "high" | "xhigh" | "max" => Some("high"),
        _ => None,
    }
}

#[async_trait]
impl Provider for OpenCodeProvider {
    fn id(&self) -> &str {
        "opencode"
    }
    fn label(&self) -> &str {
        "OpenCode"
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
        vec![
            "openrouter/z-ai/glm-5.2".into(),
            "openrouter/minimax/minimax-m3".into(),
            "opencode-go/kimi-k3".into(),
            "kimi-for-coding/k3".into(),
            "openrouter/openrouter/auto".into(),
        ]
    }
    /// Repli quand le catalogue vivant n'a pas (encore) répondu : la
    /// passerelle `opencode-go` est celle qui a du crédit, alors que
    /// `kimi-for-coding` renvoie 500 sur toutes ses routes (2026-08-25).
    fn default_model(&self) -> String {
        "opencode-go/kimi-k3".into()
    }
    fn efforts(&self) -> Vec<String> {
        vec![
            "minimal".into(),
            "low".into(),
            "medium".into(),
            "high".into(),
            "xhigh".into(),
            "max".into(),
        ]
    }

    async fn dynamic_models(&self) -> Option<Value> {
        {
            let cache = self.model_catalog.lock().await;
            if let Some(cached) = cache.as_ref() {
                if cached.fetched_at.elapsed() < MODEL_CATALOG_TTL {
                    return Some(cached.value.clone());
                }
            }
        }

        let mut command = Command::new(&self.bin);
        command
            .arg("models")
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let output = tokio::time::timeout(MODEL_CATALOG_TIMEOUT, command.output())
            .await
            .ok()?
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let raw = String::from_utf8_lossy(&output.stdout);
        let value = build_dynamic_models_payload(&raw, &self.default_model())?;
        *self.model_catalog.lock().await = Some(CachedModelCatalog {
            fetched_at: Instant::now(),
            value: value.clone(),
        });
        Some(value)
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        match self.send_acp(&req).await {
            Ok(r) => r,
            Err(handshake_msg) => {
                eprintln!("[opencode] handshake ACP échoué, repli run one-shot: {handshake_msg}");
                self.send_legacy(req).await
            }
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        if let Some(sid) = self.active_turns.lock().await.get(thread_id).cloned() {
            self.acp
                .notify("session/cancel", json!({"sessionId": sid}))
                .await;
            return true;
        }
        if let Some(mut c) = self.runs.lock().await.remove(thread_id) {
            #[cfg(unix)]
            if let Some(pid) = c.id() {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
            }
            let _ = c.kill().await;
            true
        } else {
            false
        }
    }
}

impl OpenCodeProvider {
    /// Chemin legacy one-shot (`--pure run --format json`) — inchangé (plan
    /// 033 Porte 8), utilisé en repli quand le handshake ACP échoue.
    async fn send_legacy(&self, req: SendRequest) -> SendResult {
        {
            let mut runs = self.runs.lock().await;
            if let Some(mut prev) = runs.remove(&req.thread_id) {
                let _ = prev.kill().await;
            }
        }
        let cwd = if req.project_root.is_empty() {
            std::env::var("HOME").unwrap_or_else(|_| "/tmp".into())
        } else {
            req.project_root.clone()
        };
        let mut args = vec![
            "--pure".into(),
            "run".into(),
            "--format".into(),
            "json".into(),
            "--dir".into(),
            cwd.clone(),
            "--auto".into(),
        ];
        if let Some(m) = req.model.as_ref().filter(|s| !s.is_empty()) {
            args.push("--model".into());
            args.push(m.clone());
        }
        if let Some(e) = map_effort(req.effort.as_deref()) {
            args.push("--variant".into());
            args.push(e.into());
        }
        if let Some(sid) = req.session_id.as_ref().filter(|s| !s.is_empty()) {
            args.push("--session".into());
            args.push(sid.clone());
        }
        args.push(req.prompt.clone());

        let mut cmd = Command::new(&self.bin);
        cmd.args(&args)
            .current_dir(&cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                (req.on_event)(json!({"kind":"error","message": format!("spawn opencode: {e}")}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some(e.to_string()),
                };
            }
        };
        let stdout = child.stdout.take().expect("stdout");
        let _ = child.stderr.take();
        self.runs.lock().await.insert(req.thread_id.clone(), child);

        let mut rest = String::new();
        let mut reader = BufReader::new(stdout).lines();
        let mut sid = req.session_id.clone();
        let mut ok = true;
        let mut err_msg = None;
        let mut saw_done = false;
        let mut last_usage = json!({"context":0,"output":0,"cost":null,"turns":null});
        let mut full_text = String::new();

        loop {
            if (req.is_cancelled)() {
                if let Some(mut c) = self.runs.lock().await.remove(&req.thread_id) {
                    #[cfg(unix)]
                    if let Some(pid) = c.id() {
                        unsafe {
                            libc::kill(-(pid as i32), libc::SIGTERM);
                        }
                    }
                    let _ = c.kill().await;
                }
                if !full_text.is_empty() {
                    (req.on_event)(json!({"kind":"text","text": full_text}));
                }
                (req.on_event)(
                    json!({"kind":"done","ok": false, "result": full_text, "usage": last_usage}),
                );
                return SendResult {
                    session_id: sid,
                    ok: false,
                    error: Some("interrupted".into()),
                };
            }
            match reader.next_line().await {
                Ok(Some(line)) => {
                    let (events, r) = parse_opencode_jsonl(&format!("{line}\n"), &rest);
                    rest = r;
                    for ev in events {
                        if let Some(s) = ev.get("sessionId").and_then(|v| v.as_str()) {
                            sid = Some(s.to_string());
                        }
                        let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                        if kind == "delta" {
                            if let Some(t) = ev.get("text").and_then(|v| v.as_str()) {
                                full_text.push_str(t);
                            }
                        }
                        if kind == "usage" {
                            if let Some(u) = ev.get("usage") {
                                last_usage = u.clone();
                            }
                        }
                        if kind == "done" {
                            saw_done = true;
                            ok = ev.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
                        }
                        if kind == "error" {
                            ok = false;
                            err_msg = ev
                                .get("message")
                                .and_then(|v| v.as_str())
                                .map(str::to_string);
                        }
                        (req.on_event)(ev);
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    ok = false;
                    err_msg = Some(e.to_string());
                    break;
                }
            }
        }

        if let Some(mut c) = self.runs.lock().await.remove(&req.thread_id) {
            let _ = c.wait().await;
        }

        if !saw_done {
            if !full_text.is_empty() {
                (req.on_event)(json!({"kind":"text","text": full_text}));
            }
            if ok {
                (req.on_event)(json!({
                    "kind":"done","ok":true,"result": full_text, "usage": last_usage
                }));
            } else {
                (req.on_event)(json!({
                    "kind":"error",
                    "message": err_msg.clone().unwrap_or_else(|| "OpenCode terminé en erreur".into())
                }));
            }
        }

        SendResult {
            session_id: sid,
            ok,
            error: err_msg,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_deduplicates_opencode_model_catalog() {
        let models = parse_model_catalog(
            "opencode/glm-5.2\nopenrouter/z-ai/glm-5.2\n\nwarning ignored\nopencode/glm-5.2\n",
        );
        assert_eq!(models, vec!["opencode/glm-5.2", "openrouter/z-ai/glm-5.2"]);
    }

    #[test]
    fn decoupe_une_route_a_deux_segments() {
        let r = parse_routed_models("opencode/glm-5.2\n");
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].id, "opencode/glm-5.2");
        assert_eq!(r[0].gateway, "opencode");
        assert_eq!(r[0].vendor, None);
        assert_eq!(r[0].leaf, "glm-5.2");
        assert!(!r[0].free);
    }

    #[test]
    fn decoupe_une_route_a_trois_segments() {
        let r = parse_routed_models("openrouter/z-ai/glm-5.2\n");
        assert_eq!(r[0].gateway, "openrouter");
        assert_eq!(r[0].vendor, Some("z-ai".to_string()));
        assert_eq!(r[0].leaf, "glm-5.2");
    }

    #[test]
    fn detecte_le_suffixe_gratuit() {
        let r = parse_routed_models("openrouter/deepseek/deepseek-v4:free\n");
        assert!(r[0].free);
        assert_eq!(r[0].leaf, "deepseek-v4", "le suffixe ne fait pas partie du nom");
        assert_eq!(
            r[0].id, "openrouter/deepseek/deepseek-v4:free",
            "l'id reste EXACT"
        );
    }

    #[test]
    fn plus_de_trois_segments_le_reste_va_dans_la_feuille() {
        // Rien n'interdit à une passerelle d'ajouter des niveaux. On ne perd rien.
        let r = parse_routed_models("openrouter/a/b/c-1.0\n");
        assert_eq!(r[0].gateway, "openrouter");
        assert_eq!(r[0].vendor, Some("a".to_string()));
        assert_eq!(r[0].leaf, "b/c-1.0");
    }

    #[test]
    fn applique_les_memes_filtres_que_le_catalogue_existant() {
        // Mêmes rejets que parse_model_catalog : vide, sans slash, avec espace,
        // avec ://, trop long, et dédoublonnage.
        let entree = "\n\
            sans-slash\n\
            avec espace/modele\n\
            https://exemple.dev/modele\n\
            opencode/glm-5.2\n\
            opencode/glm-5.2\n";
        let r = parse_routed_models(entree);
        assert_eq!(r.len(), 1, "un seul survivant, dédoublonné");
        assert_eq!(r[0].id, "opencode/glm-5.2");
    }

    #[test]
    fn respecte_le_plafond_du_catalogue() {
        let entree: String = (0..6_000).map(|i| format!("openrouter/v/m{i}\n")).collect();
        assert_eq!(parse_routed_models(&entree).len(), MAX_CATALOG_MODELS);
    }

    #[test]
    fn accord_avec_parse_model_catalog() {
        // Les deux fonctions doivent voir exactement les mêmes lignes : si elles
        // divergent, le tableau `models` et les routes décrivent deux mondes.
        let entree = "opencode/glm-5.2\nopenrouter/z-ai/glm-5.2\nsans-slash\n";
        let plats = parse_model_catalog(entree);
        let routes = parse_routed_models(entree);
        assert_eq!(plats.len(), routes.len());
        for (plat, route) in plats.iter().zip(routes.iter()) {
            assert_eq!(plat, &route.id);
        }
    }

    #[test]
    fn suffixe_freedom_n_est_pas_un_faux_positif_gratuit() {
        // "model-freedom" ne se termine PAS par "-free" : ses 5 derniers
        // caractères sont "eedom". `strip_suffix("-free")` compare la chaîne
        // exacte, donc aucun déclenchement — ce test verrouille ce
        // comportement plutôt que de le laisser reposer sur la lecture du
        // code.
        let r = parse_routed_models("openrouter/x/model-freedom\n");
        assert!(
            !r[0].free,
            "«-freedom» ne doit pas être confondu avec le suffixe «-free»"
        );
        assert_eq!(r[0].leaf, "model-freedom");
        assert_eq!(r[0].id, "openrouter/x/model-freedom");
    }

    #[test]
    fn route_a_deux_segments_avec_suffixe_gratuit() {
        // Combine les deux axes qu'aucun test existant ne croisait : une
        // route à DEUX segments (donc `vendor: None`) ET un suffixe gratuit.
        let r = parse_routed_models("kimi-for-coding/k3:free\n");
        assert_eq!(r[0].gateway, "kimi-for-coding");
        assert_eq!(r[0].vendor, None);
        assert_eq!(r[0].leaf, "k3");
        assert!(r[0].free);
    }

    #[test]
    fn vendor_absent_se_serialise_en_null_jamais_omis() {
        // Vérifié plutôt que déduit : `vendor: Option<String>` n'a pas de
        // `skip_serializing_if` sur `RoutedModel`, donc `None` se sérialise
        // en `null` — le champ reste présent dans le JSON, il n'est jamais
        // absent. Ça détermine comment TypeScript doit le déclarer
        // (`vendor: string | null`, pas un champ optionnel).
        let r = parse_routed_models("opencode/glm-5.2\n");
        let value = serde_json::to_value(&r[0]).expect("sérialisation");
        let obj = value.as_object().expect("objet JSON");
        assert!(
            obj.contains_key("vendor"),
            "le champ vendor doit être présent, pas omis"
        );
        assert_eq!(obj.get("vendor"), Some(&Value::Null));
    }

    #[test]
    fn dynamic_models_expose_models_et_routes_alignes() {
        // La vérification la plus importante de ce lot : `models` (tableau
        // plat, inchangé) et `routes` (tableau d'objets, nouveau) doivent
        // décrire EXACTEMENT les mêmes identifiants, dans le même ordre. Si
        // models[i] != routes[i].id pour un seul indice, les deux vues
        // divergent silencieusement.
        let sortie = "opencode/glm-5.2\nopenrouter/z-ai/glm-5.2\nkimi-for-coding/k3:free\n";
        let value = build_dynamic_models_payload(sortie, "kimi-for-coding/k3")
            .expect("catalogue non vide ⇒ Some");
        let models = value["models"].as_array().expect("models est un tableau");
        let routes = value["routes"].as_array().expect("routes est un tableau");
        assert_eq!(models.len(), 3);
        assert_eq!(models.len(), routes.len());
        for (i, (m, r)) in models.iter().zip(routes.iter()).enumerate() {
            assert_eq!(
                m.as_str(),
                r["id"].as_str(),
                "models[{i}] doit correspondre à routes[{i}].id"
            );
        }
        assert_eq!(value["defaultModel"], json!("kimi-for-coding/k3"));
        // `models` reste un tableau de CHAÎNES — pas d'objets — pour ne pas
        // casser le picker existant.
        assert!(models.iter().all(Value::is_string));
    }

    #[test]
    fn dynamic_models_payload_absent_si_catalogue_vide() {
        let value = build_dynamic_models_payload("sans-slash\navec espace/x\n", "peu-importe");
        assert!(value.is_none());
    }

    /// Sonde réelle (spawn `opencode models`, ~15-30 s) : le catalogue vivant
    /// doit remonter, sinon le picker retombe sur le repli en dur.
    #[tokio::test]
    #[ignore = "spawn le vrai CLI opencode, lent et dépendant du réseau"]
    async fn sonde_catalogue_vivant_remonte_les_passerelles() {
        let Some(provider) = OpenCodeProvider::new() else {
            return;
        };
        let value = provider
            .dynamic_models()
            .await
            .expect("le catalogue vivant doit répondre sous MODEL_CATALOG_TIMEOUT");
        let models: Vec<&str> = value["models"]
            .as_array()
            .expect("models")
            .iter()
            .filter_map(Value::as_str)
            .collect();
        assert!(models.len() > 100, "catalogue tronqué: {}", models.len());
        assert!(models.iter().any(|id| id.starts_with("opencode-go/")));
    }

    #[test]
    fn fallback_models_include_authenticated_kimi_k3_route() {
        let Some(provider) = OpenCodeProvider::new() else {
            return;
        };
        let models = provider.models();
        assert!(models.iter().any(|id| id == "opencode-go/kimi-k3"));
        assert!(models.iter().any(|id| id == "kimi-for-coding/k3"));
        // Le défaut vise la passerelle qui répond, pas celle qui est HS.
        assert_eq!(provider.default_model(), "opencode-go/kimi-k3");
    }
    use crate::traits::SendMode;

    /// Politique plan 045 portée par OpenCode (déplacée du client générique,
    /// plan 046 §2.4) — mêmes cas que les anciens tests d'acp_rpc.
    #[tokio::test]
    async fn policy_auto_allow_once() {
        let policy = opencode_server_policy();
        let r = policy(
            "session/request_permission".into(),
            json!({"options":[
                {"optionId":"reject","kind":"reject_once","name":"Reject"},
                {"optionId":"once","kind":"allow_once","name":"Allow once"}
            ]}),
        )
        .await;
        assert_eq!(r["outcome"]["outcome"], "selected");
        assert_eq!(r["outcome"]["optionId"], "once");
    }

    #[tokio::test]
    async fn policy_sans_allow_once_prend_la_premiere() {
        let policy = opencode_server_policy();
        let r = policy(
            "session/request_permission".into(),
            json!({"options":[{"optionId":"always","kind":"allow_always"}]}),
        )
        .await;
        assert_eq!(r["outcome"]["optionId"], "always");
    }

    #[tokio::test]
    async fn policy_sans_options_cancelled() {
        let policy = opencode_server_policy();
        let r = policy("session/request_permission".into(), json!({})).await;
        assert_eq!(r["outcome"]["outcome"], "cancelled");
    }

    #[tokio::test]
    async fn policy_methode_inconnue_null_donc_32601() {
        let policy = opencode_server_policy();
        let r = policy("fs/read_text_file".into(), json!({"path":"/x"})).await;
        assert!(r.is_null(), "Null ⇒ -32601 émis par le client générique");
    }

    /// E2E réel (réseau + auth opencode requis) — plan 045 Step 7.4 :
    /// `cargo test -p atelier-providers --manifest-path rust/Cargo.toml \
    ///  --locked -- --ignored opencode_acp_e2e`
    #[tokio::test]
    #[ignore = "réseau + auth opencode requis"]
    async fn opencode_acp_e2e() {
        let Some(p) = OpenCodeProvider::new() else {
            panic!("binaire opencode introuvable");
        };
        let events: Arc<StdMutex<Vec<Value>>> = Arc::new(StdMutex::new(vec![]));
        let sink = Arc::clone(&events);
        let req = SendRequest {
            thread_id: "t-e2e-045".into(),
            turn_id: "turn-1".into(),
            prompt: "Réponds exactement: ok".into(),
            inputs: None,
            project_root: std::env::temp_dir().to_string_lossy().into_owned(),
            session_id: None,
            model: None,
            effort: None,
            fast_mode: false,
            permission_mode: None,
            fork_pending: false,
            mode: SendMode::Normal,
            on_event: Arc::new(move |ev| sink.lock().unwrap().push(ev)),
            on_interaction: None,
            is_cancelled: Arc::new(|| false),
            consigne: None,
            atelier_mcp: None,
        };
        let res = p.send(req).await;
        assert!(res.ok, "tour en échec: {:?}", res.error);
        assert!(
            res.session_id.as_deref().unwrap_or("").starts_with("ses_"),
            "session_id ACP attendu (ses_…), reçu {:?} — le repli legacy a probablement pris le relais",
            res.session_id
        );
        let evs = events.lock().unwrap();
        assert!(evs.iter().any(|e| e["kind"] == "delta"), "aucun delta reçu");
        let done = evs
            .iter()
            .find(|e| e["kind"] == "done")
            .expect("pas de done");
        assert!(
            done["usage"]["window"].as_u64().unwrap_or(0) > 0,
            "usage.window absent (usage_update non absorbé ?)"
        );
    }

    // ------------------------------------------------------------------
    // Alignement modèle contre le fixture ACP partagé (fake_kimi_acp.mjs).
    // Mode nominal = contrat OpenCode 2 : session/set_model → -32601,
    // sélection via session/set_config_option {configId:"model", value}.
    // Mode grok = contrat v1 : session/set_model accepté.

    fn node_bin() -> Option<PathBuf> {
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

    /// Spawn le fixture ; None (skip bruyant) si node est introuvable.
    /// Le mode passe en argv — jamais par env (tests parallèles).
    async fn fixture_server(mode: &str) -> Option<AcpServer> {
        let node = node_bin().or_else(|| {
            eprintln!("SKIP: node introuvable pour le fixture ACP");
            None
        })?;
        let fixture = format!(
            "{}/tests/fixtures/fake_kimi_acp.mjs",
            env!("CARGO_MANIFEST_DIR")
        );
        let server = AcpServer::new("fake-opencode");
        server
            .ensure(
                &node,
                &[fixture, mode.to_string()],
                json!({
                    "protocolVersion": 1,
                    "clientCapabilities": {
                        "fs": {"readTextFile": false, "writeTextFile": false},
                        "terminal": false
                    }
                }),
            )
            .await
            .expect("handshake fixture");
        Some(server)
    }

    async fn fixture_session(server: &AcpServer) -> String {
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

    #[tokio::test]
    async fn alignement_v2_replie_sur_set_config_option() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid = fixture_session(&server).await;
        request_model_alignment(&server, &sid, "fake-k3")
            .await
            .expect("repli set_config_option (contrat OpenCode 2)");
        // La session doit refléter le modèle posé (currentValue).
        let r = server
            .request("session/load", json!({"sessionId": sid}), Some(5_000))
            .await
            .expect("session/load");
        assert_eq!(current_model_of(&r).as_deref(), Some("fake-k3"));
    }

    #[tokio::test]
    async fn alignement_v2_modele_inconnu_refuse_sans_paniquer() {
        let Some(server) = fixture_server("nominal").await else {
            return;
        };
        let sid = fixture_session(&server).await;
        let err = request_model_alignment(&server, &sid, "modele-inexistant")
            .await
            .expect_err("un modèle hors catalogue doit être refusé");
        assert!(
            err.contains("session/set_config_option"),
            "l'erreur doit venir du repli v2, reçu: {err}"
        );
    }

    #[tokio::test]
    async fn alignement_v1_set_model_reste_le_chemin_prioritaire() {
        let Some(server) = fixture_server("grok").await else {
            return;
        };
        let sid = fixture_session(&server).await;
        // En mode grok le fixture accepte session/set_model("grok-test") :
        // le chemin v1 doit suffire, sans repli.
        request_model_alignment(&server, &sid, "grok-test")
            .await
            .expect("session/set_model v1 accepté");
    }
}
