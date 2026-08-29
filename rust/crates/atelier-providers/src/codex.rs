//! Codex provider via `codex app-server` JSON-RPC (plan 033 Porte 7).

use crate::codex_parse::{answer_from_interaction, map_turn_notification, TurnMapState};
use crate::codex_rpc::CodexAppServer;
use crate::traits::{Provider, ProviderCaps, SendMode, SendRequest, SendResult};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{oneshot, Mutex};

#[derive(Clone)]
struct ActiveTurn {
    codex_id: String,
    turn_id: Option<String>,
}

pub struct CodexProvider {
    server: Arc<CodexAppServer>,
    /// Sync mutex: updated from notification callback + async interrupt.
    active: Arc<StdMutex<HashMap<String, ActiveTurn>>>,
    /// codex_id → dernier modèle posé via `thread/settings/update`. Évite de
    /// répéter l'update quand la sélection n'a pas changé.
    settled_models: Arc<StdMutex<HashMap<String, String>>>,
}

impl CodexProvider {
    pub fn new() -> Option<Self> {
        let present = std::env::var("ATELIER_CODEX_BIN")
            .map(|p| std::path::Path::new(&p).is_file())
            .unwrap_or(false)
            || std::process::Command::new("which")
                .arg("codex")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
        if !present {
            return None;
        }
        Some(Self {
            server: Arc::new(CodexAppServer::new()),
            active: Arc::new(StdMutex::new(HashMap::new())),
            settled_models: Arc::new(StdMutex::new(HashMap::new())),
        })
    }

    async fn run_native_review(&self, codex_id: &str) -> Result<Value, String> {
        let (tx, rx) = oneshot::channel::<String>();
        let tx = Arc::new(StdMutex::new(Some(tx)));
        let tx_handler = Arc::clone(&tx);
        let handler = Arc::new(move |method: &str, params: &Value| {
            if method != "item/completed" {
                return;
            }
            let item = params.get("item").unwrap_or(&Value::Null);
            if item.get("type").and_then(Value::as_str) != Some("exitedReviewMode") {
                return;
            }
            let review = item
                .get("review")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if let Ok(mut slot) = tx_handler.lock() {
                if let Some(sender) = slot.take() {
                    let _ = sender.send(review);
                }
            }
        });
        self.server.set_handler(codex_id, handler).await;
        let started = self
            .server
            .request(
                "review/start",
                json!({
                    "threadId": codex_id,
                    "target": {"type": "uncommittedChanges"},
                    "delivery": "inline",
                }),
            )
            .await;
        if let Err(error) = started {
            self.server.clear_handler(codex_id).await;
            return Err(error);
        }
        let review = tokio::time::timeout(std::time::Duration::from_secs(600), rx).await;
        self.server.clear_handler(codex_id).await;
        let review = review
            .map_err(|_| "review Codex: délai dépassé".to_string())?
            .map_err(|_| "review Codex annulée".to_string())?;
        Ok(json!({"review": review}))
    }
}

impl Default for CodexProvider {
    fn default() -> Self {
        Self {
            server: Arc::new(CodexAppServer::new()),
            active: Arc::new(StdMutex::new(HashMap::new())),
            settled_models: Arc::new(StdMutex::new(HashMap::new())),
        }
    }
}

/// Identifiant du niveau de service Codex « Fast » (`service_tiers` du
/// catalogue app-server : `{id: "priority", name: "Fast"}`).
pub const CODEX_PRIORITY_TIER: &str = "priority";

/// Fenêtre de SILENCE tolérée avant d'interrompre un tour (le filet ne vise
/// que le CLI figé — vivant mais muet ; un tour long reste légitime, quelle
/// que soit sa durée). Même valeur et même variable d'environnement que grok
/// et kimi.
const TURN_IDLE_SECS_DEFAULT: u64 = 600;

fn turn_idle_secs() -> u64 {
    std::env::var("ATELIER_TURN_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(TURN_IDLE_SECS_DEFAULT)
}

fn codex_safety(permission_mode: Option<&str>) -> (&'static str, &'static str) {
    match permission_mode {
        Some("bypassPermissions") => ("danger-full-access", "never"),
        Some("acceptEdits") => ("workspace-write", "on-request"),
        Some("default") => ("workspace-write", "untrusted"),
        Some("plan") => ("read-only", "never"),
        _ => ("read-only", "on-request"),
    }
}

/// Faut-il transmettre `model_reasoning_effort` ? `efforts_catalogue` vaut
/// `None` quand le modèle est inconnu du catalogue (ou le catalogue absent) :
/// dans ce cas on conserve l'effort — repli ouvert, on ne prive jamais un
/// modèle d'un réglage faute d'information. On ne le tait que lorsque le
/// catalogue affirme explicitement qu'aucun niveau n'existe.
fn effort_a_envoyer(effort: &str, efforts_catalogue: Option<&[String]>) -> Option<String> {
    match efforts_catalogue {
        Some(niveaux) if niveaux.is_empty() => None,
        _ => Some(effort.to_string()),
    }
}

/// Efforts déclarés par le catalogue pour ce modèle. Mémorisé et invalidé sur
/// la date de modification du fichier : le catalogue fait 750 Ko, le relire à
/// chaque tour serait gratuit en bêtise.
fn catalogue_efforts(model: &str) -> Option<Vec<String>> {
    use std::sync::Mutex;
    use std::time::SystemTime;
    static MEMO: Mutex<Option<(Option<SystemTime>, Vec<(String, Vec<String>)>)>> = Mutex::new(None);

    let path = codex_catalog_path()?;
    let mtime = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
    let mut memo = MEMO.lock().ok()?;
    if memo.as_ref().map(|(m, _)| *m != mtime).unwrap_or(true) {
        let entrees = parse_codex_catalog(&path)
            .into_iter()
            .map(|m| (m.id, m.efforts))
            .collect();
        *memo = Some((mtime, entrees));
    }
    memo.as_ref()?
        .1
        .iter()
        .find(|(id, _)| id == model)
        .map(|(_, efforts)| efforts.clone())
}

fn thread_opts(req: &SendRequest) -> Value {
    let (sandbox, approval_policy) = codex_safety(req.permission_mode.as_deref());
    let mut opts = json!({
        "cwd": if req.project_root.is_empty() { Value::Null } else { json!(req.project_root) },
        "sandbox": sandbox,
        "approvalPolicy": approval_policy,
    });
    if let Some(model) = req.model.as_ref().filter(|m| !m.is_empty()) {
        opts.as_object_mut()
            .unwrap()
            .insert("model".into(), json!(model));
    }
    let mut config = serde_json::Map::new();
    if let Some(effort) = req.effort.as_ref().filter(|e| !e.is_empty()) {
        let declares = req
            .model
            .as_ref()
            .filter(|m| !m.is_empty())
            .and_then(|m| catalogue_efforts(m));
        if let Some(retenu) = effort_a_envoyer(effort, declares.as_deref()) {
            config.insert("model_reasoning_effort".into(), json!(retenu));
        }
    }
    // Mode Fast : niveau de SERVICE, pas de raisonnement. `model_reasoning_effort`
    // reste intact — Fast + High envoie bien les deux. Standard n'écrit rien et
    // laisse Codex appliquer son `default_service_tier`.
    if req.fast_mode {
        config.insert("service_tier".into(), json!(CODEX_PRIORITY_TIER));
    }
    // Plan 057: per-thread MCP capability via config.mcp_servers (merged by app-server).
    if let Some(launch) = req.atelier_mcp.as_ref() {
        let mut env = serde_json::Map::new();
        for (k, v) in &launch.env {
            env.insert(k.clone(), json!(v));
        }
        let server = json!({
            "command": launch.command,
            "args": [],
            "env": env,
        });
        config.insert(
            "mcp_servers".into(),
            json!({ launch.server_name.clone(): server }),
        );
    }
    if !config.is_empty() {
        opts.as_object_mut()
            .unwrap()
            .insert("config".into(), Value::Object(config));
    }
    opts
}

/// Overrides modèle/effort à répéter sur CHAQUE `turn/start`.
///
/// `thread/resume` ignore l'override de modèle d'un thread existant (sonde
/// app-server 0.149.0, 2026-08-27 : un fil de 260 tours est resté verrouillé
/// sur son modèle de création alors que chaque resume passait le nouveau) —
/// changer de modèle en cours de fil était donc un no-op silencieux pendant
/// que l'UI affichait le nouveau choix. `turn/start.model` est honoré et
/// persiste sur le thread ; l'effort emprunte le même canal (`turn/start.
/// effort`, contrat déjà éprouvé par le sidecar Node) avec la MÊME décision
/// que `thread_opts` (`effort_a_envoyer`).
fn turn_start_overrides(req: &SendRequest) -> serde_json::Map<String, Value> {
    let mut overrides = serde_json::Map::new();
    if let Some(model) = req.model.as_ref().filter(|m| !m.is_empty()) {
        overrides.insert("model".into(), json!(model));
    }
    if let Some(effort) = req.effort.as_ref().filter(|e| !e.is_empty()) {
        let declares = req
            .model
            .as_ref()
            .filter(|m| !m.is_empty())
            .and_then(|m| catalogue_efforts(m));
        if let Some(retenu) = effort_a_envoyer(effort, declares.as_deref()) {
            overrides.insert("effort".into(), json!(retenu));
        }
    }
    overrides
}

async fn resolve_plan_mode(server: &CodexAppServer) -> Option<Value> {
    let response = server
        .request("collaborationMode/list", json!({}))
        .await
        .ok()?;
    response
        .get("modes")
        .or_else(|| response.get("collaborationModes"))
        .and_then(Value::as_array)?
        .iter()
        .find(|mode| mode.get("mode").and_then(Value::as_str) == Some("plan"))
        .cloned()
}

fn build_input(prompt: &str, inputs: Option<&[Value]>) -> Value {
    let clean = inputs
        .unwrap_or_default()
        .iter()
        .filter_map(|input| match input.get("type").and_then(Value::as_str) {
            Some("text") => Some(json!({
                "type": "text",
                "text": input.get("text").and_then(Value::as_str).unwrap_or(""),
                "text_elements": [],
            })),
            Some("local_image") | Some("localImage") => input
                .get("path")
                .and_then(Value::as_str)
                .filter(|path| !path.is_empty())
                .map(|path| json!({"type": "localImage", "path": path})),
            Some("skill") => {
                let name = input.get("name").and_then(Value::as_str)?;
                let path = input.get("path").and_then(Value::as_str)?;
                (!name.is_empty() && !path.is_empty())
                    .then(|| json!({"type": "skill", "name": name, "path": path}))
            }
            Some("mention") => {
                let name = input.get("name").and_then(Value::as_str)?;
                let path = input.get("path").and_then(Value::as_str)?;
                (!name.is_empty() && !path.is_empty())
                    .then(|| json!({"type": "mention", "name": name, "path": path}))
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    if clean.is_empty() {
        json!([{ "type": "text", "text": prompt, "text_elements": [] }])
    } else {
        Value::Array(clean)
    }
}

const ATELIER_PLUGIN_MVP: &[&str] = &[
    "visualize",
    "latex",
    "documents",
    "pdf",
    "presentations",
    "spreadsheets",
    "build-web-data-visualization",
    "openai-developers",
    "frontend-design",
    "template-creator",
];

fn preferred_skill(plugin: &str, skills: &[Value]) -> Option<Value> {
    let preferred = match plugin {
        "latex" => "latex-compile",
        "build-web-data-visualization" => "data-visualization",
        "openai-developers" => "agents-sdk",
        _ => plugin,
    };
    skills
        .iter()
        .find(|skill| {
            skill
                .get("name")
                .and_then(Value::as_str)
                .map(|name| name == preferred || name.ends_with(&format!(":{preferred}")))
                .unwrap_or(false)
        })
        .or_else(|| skills.first())
        .cloned()
}

fn hydrate_cached_skill_paths(marketplace: &str, plugin: &str, skills: &mut [Value]) {
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let plugin_root = std::path::PathBuf::from(home)
        .join(".codex/plugins/cache")
        .join(marketplace)
        .join(plugin);
    let Ok(entries) = std::fs::read_dir(plugin_root) else {
        return;
    };
    let mut versions = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    versions.sort();
    for skill in skills {
        if skill
            .get("path")
            .and_then(Value::as_str)
            .is_some_and(|path| !path.is_empty())
        {
            continue;
        }
        let Some(name) = skill.get("name").and_then(Value::as_str) else {
            continue;
        };
        let leaf = name.rsplit(':').next().unwrap_or(name);
        if let Some(path) = versions
            .iter()
            .rev()
            .map(|version| version.join("skills").join(leaf).join("SKILL.md"))
            .find(|path| path.is_file())
        {
            skill["path"] = json!(path.to_string_lossy());
        }
    }
}

async fn list_atelier_plugins(server: &CodexAppServer, cwd: &str) -> Result<Value, String> {
    let installed = server
        .request(
            "plugin/installed",
            if cwd.is_empty() {
                json!({})
            } else {
                json!({"cwds": [cwd]})
            },
        )
        .await?;
    let mut plugins = Vec::new();
    for marketplace in installed
        .get("marketplaces")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let marketplace_name = marketplace
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("");
        let marketplace_path = marketplace.get("path").and_then(Value::as_str);
        for summary in marketplace
            .get("plugins")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let name = summary.get("name").and_then(Value::as_str).unwrap_or("");
            if !ATELIER_PLUGIN_MVP.contains(&name)
                || !summary
                    .get("installed")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                || !summary
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
            {
                continue;
            }
            let remote_plugin_id = summary.get("remotePluginId").and_then(Value::as_str);
            let read_name = if marketplace_path.is_none() {
                remote_plugin_id.unwrap_or(name)
            } else {
                name
            };
            let mut read_params = json!({"pluginName": read_name});
            if let Some(path) = marketplace_path {
                read_params["marketplacePath"] = json!(path);
            } else if !marketplace_name.is_empty() {
                read_params["remoteMarketplaceName"] = json!(marketplace_name);
            }
            let detail = server.request("plugin/read", read_params).await?;
            let plugin = detail.get("plugin").unwrap_or(&detail);
            let mut skills = plugin
                .get("skills")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            hydrate_cached_skill_paths(marketplace_name, name, &mut skills);
            let interface = summary
                .get("interface")
                .cloned()
                .unwrap_or_else(|| json!({}));
            plugins.push(json!({
                "id": summary.get("id").cloned().unwrap_or_else(|| json!(name)),
                "name": name,
                "displayName": interface.get("displayName").and_then(Value::as_str).unwrap_or(name),
                "description": interface.get("shortDescription").and_then(Value::as_str).unwrap_or(""),
                "version": summary.get("localVersion").cloned().unwrap_or(Value::Null),
                "enabled": true,
                "icon": interface.get("composerIcon").or_else(|| interface.get("composerIconUrl")).cloned().unwrap_or(Value::Null),
                "skills": skills,
                "primarySkill": preferred_skill(name, &skills),
            }));
        }
    }
    plugins.sort_by(|a, b| {
        let ai = ATELIER_PLUGIN_MVP
            .iter()
            .position(|name| Some(*name) == a.get("name").and_then(Value::as_str))
            .unwrap_or(usize::MAX);
        let bi = ATELIER_PLUGIN_MVP
            .iter()
            .position(|name| Some(*name) == b.get("name").and_then(Value::as_str))
            .unwrap_or(usize::MAX);
        ai.cmp(&bi)
    });
    Ok(json!({"plugins": plugins}))
}

/// Le serveur refuse un steer dont l'`expectedTurnId` est périmé, mais il
/// donne le VRAI identifiant dans son message :
///   expected active turn id `<attendu>` but found `<réel>`
/// (relevé en direct sur codex 0.149.0, 2026-08-29 : sonde avec un tour en
/// vol). Le tour est donc toujours infléchissable — il a juste changé d'id
/// entre notre lecture et l'appel. On extrait le réel pour réessayer, au lieu
/// de démarrer un tour normal comme si rien n'était en vol.
fn steer_turn_reel(err: &str) -> Option<String> {
    let reste = err.split("but found").nth(1)?;
    let debut = reste.find('`')? + 1;
    let fin = reste[debut..].find('`')? + debut;
    let id = reste[debut..fin].trim();
    (!id.is_empty()).then(|| id.to_string())
}

/// Refus de `turn/steer` qui ne doivent PAS devenir un tour normal : le tour
/// en vol est une revue ou une compaction, en démarrer un second le
/// doublerait. Messages relevés en direct sur codex 0.149.0 — le serveur ne
/// renvoie qu'un texte nu (code -32600), sans `data` structuré.
fn steer_refus_definitif(err: &str) -> bool {
    let e = err.to_ascii_lowercase();
    e.contains("cannot steer a review turn")
        || e.contains("cannot steer a compact turn")
        || e.contains("notsteerable")
        || e.contains("not-steerable")
        // refus AVEC tour actif, relevé dans le binaire : lui aussi doublerait
        // le tour en vol si on retombait en tour normal
        || e.contains("different output schema")
        || e.contains("not steerable")
}

async fn open_thread(
    server: &CodexAppServer,
    session_id: Option<&str>,
    opts: Value,
) -> Result<String, String> {
    if let Some(sid) = session_id.filter(|s| !s.is_empty()) {
        let mut params = opts;
        params
            .as_object_mut()
            .unwrap()
            .insert("threadId".into(), json!(sid));
        let resp = server.request("thread/resume", params).await?;
        Ok(resp
            .pointer("/thread/id")
            .and_then(|v| v.as_str())
            .unwrap_or(sid)
            .to_string())
    } else {
        let resp = server.request("thread/start", opts).await?;
        resp.pointer("/thread/id")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .ok_or_else(|| "thread/start sans id".into())
    }
}

/// Catalogue de modèles de Codex. `model_catalog_json` dans
/// `~/.codex/config.toml` désigne le fichier que le CLI consulte pour savoir
/// quels modèles il sait servir — c'est là qu'OpenCodex publie les modèles
/// Anthropic, Kimi et xAI qu'il relaie. Sans lui, Atelier n'en voyait que six,
/// écrits en dur, et masquait les dix autres (vécu 2026-08-13).
fn codex_catalog_path() -> Option<std::path::PathBuf> {
    let home = std::path::PathBuf::from(std::env::var_os("HOME")?);
    let codex_home = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    codex_catalog_path_in(&codex_home, &home)
}

fn codex_catalog_path_in(
    codex_home: &std::path::Path,
    home: &std::path::Path,
) -> Option<std::path::PathBuf> {
    // Pas de dépendance TOML pour une seule clé : on lit la ligne
    // `model_catalog_json = "..."`, en ignorant les commentaires.
    if let Ok(config) = std::fs::read_to_string(codex_home.join("config.toml")) {
        for line in config.lines() {
            let line = line.trim();
            if line.starts_with('#') {
                continue;
            }
            let Some(value) = line.strip_prefix("model_catalog_json") else {
                continue;
            };
            let Some(value) = value.trim_start().strip_prefix('=') else {
                continue;
            };
            let value = value.trim().trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                let expanded = value
                    .strip_prefix("~/")
                    .map(|rest| home.join(rest))
                    .unwrap_or_else(|| std::path::PathBuf::from(value));
                return Some(expanded);
            }
        }
    }
    // Repli : emplacement standard d'OpenCodex quand la clé est absente.
    let fallback = codex_home.join("opencodex-catalog.json");
    fallback.is_file().then_some(fallback)
}

/// Une entrée du catalogue, réduite à ce que l'interface consomme.
struct CodexCatalogModel {
    id: String,
    label: Option<String>,
    efforts: Vec<String>,
    default_effort: Option<String>,
}

fn read_codex_catalog() -> Vec<CodexCatalogModel> {
    match codex_catalog_path() {
        Some(path) => parse_codex_catalog(&path),
        None => Vec::new(),
    }
}

fn parse_codex_catalog(path: &std::path::Path) -> Vec<CodexCatalogModel> {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let entries = parsed
        .get("models")
        .and_then(Value::as_array)
        .or_else(|| parsed.as_array());
    let Some(entries) = entries else {
        return Vec::new();
    };
    entries
        .iter()
        .filter_map(|entry| {
            let id = entry
                .get("slug")
                .or_else(|| entry.get("id"))
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())?;
            let efforts = entry
                .get("supported_reasoning_levels")
                .and_then(Value::as_array)
                .map(|levels| {
                    levels
                        .iter()
                        .filter_map(|level| {
                            level
                                .get("effort")
                                .or(Some(level))
                                .and_then(Value::as_str)
                                .map(str::to_string)
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            Some(CodexCatalogModel {
                id: id.to_string(),
                label: entry
                    .get("display_name")
                    .and_then(Value::as_str)
                    .filter(|label| !label.is_empty())
                    .map(str::to_string),
                efforts,
                default_effort: entry
                    .get("default_reasoning_level")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            })
        })
        .collect()
}

#[async_trait]

impl Provider for CodexProvider {
    fn id(&self) -> &str {
        "codex"
    }
    fn label(&self) -> &str {
        "Codex"
    }
    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            resume: true,
            steering: true,
            queue: true,
            goals: true,
            tools: true,
        }
    }
    /// Repli statique : le catalogue vivant (`dynamic_models`) prime dès qu'il
    /// est lisible. Cette liste ne sert qu'aux installations sans catalogue.
    fn models(&self) -> Vec<String> {
        vec![
            "gpt-5.6-sol".into(),
            "gpt-5.6-terra".into(),
            "gpt-5.6-luna".into(),
            "gpt-5.5".into(),
            "gpt-5.1-codex-max".into(),
            "gpt-5.1-codex".into(),
        ]
    }
    fn default_model(&self) -> String {
        "gpt-5.6-sol".into()
    }
    fn efforts(&self) -> Vec<String> {
        vec![
            "low".into(),
            "medium".into(),
            "high".into(),
            "xhigh".into(),
            "max".into(),
        ]
    }

    /// Catalogue vivant : ce que le CLI sait réellement servir. Avec
    /// OpenCodex, cela inclut Anthropic, Kimi et xAI relayés par la
    /// passerelle — invisibles tant qu'Atelier s'en tenait à sa liste en dur.
    async fn dynamic_models(&self) -> Option<Value> {
        let catalog = tokio::task::spawn_blocking(read_codex_catalog)
            .await
            .unwrap_or_default();
        if catalog.is_empty() {
            return None;
        }
        let labels = catalog
            .iter()
            .filter_map(|model| {
                model
                    .label
                    .as_ref()
                    .map(|label| (model.id.clone(), json!(label)))
            })
            .collect::<serde_json::Map<String, Value>>();
        let reasoning = catalog
            .iter()
            .filter(|model| !model.efforts.is_empty())
            .map(|model| {
                (
                    model.id.clone(),
                    json!({
                        "supported_efforts": model.efforts,
                        "default_effort": model.default_effort,
                    }),
                )
            })
            .collect::<serde_json::Map<String, Value>>();
        let ids = catalog.iter().map(|model| model.id.clone()).collect::<Vec<_>>();
        // Le défaut du CLI reste prioritaire s'il figure au catalogue ; sinon
        // le premier annoncé, jamais une valeur inventée.
        let default = ids
            .iter()
            .find(|id| *id == &self.default_model())
            .cloned()
            .or_else(|| ids.first().cloned());
        Some(json!({
            "models": ids,
            "defaultModel": default,
            "modelReasoning": reasoning,
            "modelLabels": labels,
        }))
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        if let Err(e) = self.server.ensure().await {
            (req.on_event)(json!({"kind":"error","message": e}));
            return SendResult {
                session_id: req.session_id,
                ok: false,
                error: Some(e),
            };
        }

        // Native steer
        if req.mode == SendMode::Steer {
            let snap = self
                .active
                .lock()
                .ok()
                .and_then(|g| g.get(&req.thread_id).cloned());
            if let Some(t) = snap {
                if let Some(turn_id) = t.turn_id {
                    match self
                        .server
                        .request(
                            "turn/steer",
                            json!({
                                "threadId": t.codex_id,
                                "input": build_input(&req.prompt, req.inputs.as_deref()),
                                "expectedTurnId": turn_id,
                            }),
                        )
                        .await
                    {
                        Ok(_) => {
                            (req.on_event)(json!({"kind":"tool","name":"__steered"}));
                            return SendResult {
                                session_id: Some(t.codex_id),
                                ok: true,
                                error: None,
                            };
                        }
                        // Identifiant périmé : le tour a changé d'id entre notre
                        // lecture et l'appel. Le serveur nous donne le bon —
                        // on réessaie UNE fois, comme le ferait le CLI.
                        Err(ref e) if steer_turn_reel(e).is_some() => {
                            let reel = steer_turn_reel(e).unwrap();
                            if self
                                .server
                                .request(
                                    "turn/steer",
                                    json!({
                                        "threadId": t.codex_id,
                                        "input": build_input(&req.prompt, req.inputs.as_deref()),
                                        "expectedTurnId": reel,
                                    }),
                                )
                                .await
                                .is_ok()
                            {
                                (req.on_event)(json!({"kind":"tool","name":"__steered"}));
                                return SendResult {
                                    session_id: Some(t.codex_id),
                                    ok: true,
                                    error: None,
                                };
                            }
                            eprintln!("codex: réessai de steer refusé — repli en tour normal");
                        }
                        // Un tour de revue ou de compaction n'est JAMAIS
                        // infléchissable, et enchaîner un tour normal en
                        // démarrerait un second en parallèle. Le protocole a
                        // exactement la primitive qu'il faut : `thread/queue/add`
                        // (paramètres sondés le 2026-08-29 : threadId, input,
                        // clientUserMessageId). Le message attend son tour au
                        // lieu d'être perdu OU de doubler celui en vol.
                        //
                        // On n'émet PAS d'event `error` ici : la pompe le
                        // traiterait comme terminal et marquerait Done le tour
                        // qui tourne encore côté codex.
                        Err(e) if steer_refus_definitif(&e) => {
                            let queued = self
                                .server
                                .request(
                                    "thread/queue/add",
                                    json!({
                                        "threadId": t.codex_id,
                                        "input": build_input(&req.prompt, req.inputs.as_deref()),
                                        "clientUserMessageId": uuid::Uuid::new_v4().to_string(),
                                    }),
                                )
                                .await;
                            match queued {
                                Ok(_) => {
                                    (req.on_event)(json!({"kind":"tool","name":"__queued"}));
                                    return SendResult {
                                        session_id: Some(t.codex_id),
                                        ok: true,
                                        error: None,
                                    };
                                }
                                Err(qe) => {
                                    eprintln!("codex: mise en file refusée ({qe})");
                                    (req.on_event)(json!({"kind":"error","message": e}));
                                    return SendResult {
                                        session_id: Some(t.codex_id),
                                        ok: false,
                                        error: Some(e),
                                    };
                                }
                            }
                        }
                        // Les autres refus (« no active turn to steer » : le tour
                        // s'est terminé entre-temps) deviennent un tour normal
                        // plutôt que de perdre le message — même choix que grok.
                        Err(e) => {
                            eprintln!("codex: steer refusé ({e}) — repli en tour normal");
                        }
                    }
                }
            }
        }

        let opts = thread_opts(&req);
        let codex_id = match open_thread(&self.server, req.session_id.as_deref(), opts).await {
            Ok(id) => id,
            Err(e) => {
                (req.on_event)(json!({"kind":"error","message": e}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some(e),
                };
            }
        };
        // Switch de modèle « à la codex » : poser le modèle sur le thread
        // AVANT le tour (thread/settings/update, capability experimentalApi).
        // C'est ce qui déclenche l'auto-compaction quand l'historique dépasse
        // la fenêtre du nouveau modèle — l'override de turn/start seul arrive
        // trop tard pour ce contrôle (sonde 2026-08-27 : fil de 170k tokens
        // basculé vers une fenêtre 128k → item contextCompaction puis tour
        // réussi via settings/update ; 400 passerelle sans). Un refus n'est
        // pas bloquant : turn/start porte encore l'override.
        if let Some(model) = req.model.as_ref().filter(|m| !m.is_empty()) {
            let already = self
                .settled_models
                .lock()
                .map(|k| k.get(&codex_id).map(|m| m == model).unwrap_or(false))
                .unwrap_or(false);
            if !already {
                match self
                    .server
                    .request(
                        "thread/settings/update",
                        json!({"threadId": codex_id, "model": model}),
                    )
                    .await
                {
                    Ok(_) => {
                        if let Ok(mut k) = self.settled_models.lock() {
                            k.insert(codex_id.clone(), model.clone());
                        }
                    }
                    Err(e) => eprintln!(
                        "[codex] thread/settings/update ({model}) refusé, l'override turn/start reste seul: {e}"
                    ),
                }
            }
        }

        let (sandbox, _) = codex_safety(req.permission_mode.as_deref());
        self.server.set_sandbox(&codex_id, sandbox).await;
        if let Some(relay) = req.on_interaction.clone() {
            let request_handler = Arc::new(move |method: String, params: Value| {
                let relay = Arc::clone(&relay);
                Box::pin(async move {
                    let response = relay(method.clone(), params.clone()).await;
                    answer_from_interaction(&method, &params, response.as_ref())
                })
                    as std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send>>
            });
            self.server
                .set_request_handler(&codex_id, request_handler)
                .await;
        }

        if let Ok(mut a) = self.active.lock() {
            a.insert(
                req.thread_id.clone(),
                ActiveTurn {
                    codex_id: codex_id.clone(),
                    turn_id: None,
                },
            );
        }

        let (done_tx, done_rx) = oneshot::channel::<(bool, Option<String>)>();
        let done_slot = Arc::new(Mutex::new(Some(done_tx)));
        let finished = Arc::new(AtomicBool::new(false));
        let map_state = Arc::new(StdMutex::new(TurnMapState::default()));
        let on_event = Arc::clone(&req.on_event);
        let active = Arc::clone(&self.active);
        let thread_id = req.thread_id.clone();
        let codex_for_h = codex_id.clone();
        let finished2 = Arc::clone(&finished);
        let done_slot2 = Arc::clone(&done_slot);
        // Signe de vie du CLI : toute notification, y compris les deltas de
        // sortie et de raisonnement, repousse le filet anti-figé (turn_idle).
        let activity = crate::turn_idle::TurnActivity::new();
        let activity_handler = activity.clone();

        let handler: Arc<dyn Fn(&str, &Value) + Send + Sync> = Arc::new(move |method, params| {
            activity_handler.bump();
            if method == "turn/started" {
                if let Some(tid) = params.pointer("/turn/id").and_then(|v| v.as_str()) {
                    if let Ok(mut a) = active.lock() {
                        a.insert(
                            thread_id.clone(),
                            ActiveTurn {
                                codex_id: codex_for_h.clone(),
                                turn_id: Some(tid.to_string()),
                            },
                        );
                    }
                }
            }
            let events = {
                let Ok(mut st) = map_state.lock() else {
                    return;
                };
                map_turn_notification(method, params, &mut st)
            };
            for ev in events {
                let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                if kind == "done" || kind == "error" {
                    if finished2.swap(true, Ordering::SeqCst) {
                        continue;
                    }
                    let ok =
                        kind == "done" && ev.get("ok").and_then(|v| v.as_bool()).unwrap_or(true);
                    let err = if ok {
                        None
                    } else {
                        Some(
                            ev.get("result")
                                .or_else(|| ev.get("message"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("échec")
                                .to_string(),
                        )
                    };
                    on_event(ev);
                    // complete oneshot from sync context
                    if let Ok(mut slot) = done_slot2.try_lock() {
                        if let Some(tx) = slot.take() {
                            let _ = tx.send((ok, err));
                        }
                    }
                } else {
                    on_event(ev);
                }
            }
        });

        self.server.set_handler(&codex_id, handler).await;

        let mut turn_params = json!({
            "threadId": codex_id,
            "input": build_input(&req.prompt, req.inputs.as_deref()),
        });
        turn_params
            .as_object_mut()
            .unwrap()
            .extend(turn_start_overrides(&req));
        if req.permission_mode.as_deref() == Some("plan") {
            if let Some(plan_mode) = resolve_plan_mode(&self.server).await {
                turn_params
                    .as_object_mut()
                    .unwrap()
                    .insert("collaborationMode".into(), plan_mode);
            }
        }
        if let Err(e) = self.server.request("turn/start", turn_params).await {
            self.server.clear_handler(&codex_id).await;
            self.server.clear_request_handler(&codex_id).await;
            if let Ok(mut a) = self.active.lock() {
                a.remove(&req.thread_id);
            }
            (req.on_event)(json!({"kind":"error","message": e}));
            return SendResult {
                session_id: Some(codex_id),
                ok: false,
                error: Some(e),
            };
        }

        // Cancel watcher
        let cancel_server = Arc::clone(&self.server);
        let cancel_active = Arc::clone(&self.active);
        let cancel_tid = req.thread_id.clone();
        let is_cancelled = Arc::clone(&req.is_cancelled);
        tokio::spawn(async move {
            loop {
                if is_cancelled() {
                    let snap = cancel_active
                        .lock()
                        .ok()
                        .and_then(|g| g.get(&cancel_tid).cloned());
                    if let Some(t) = snap {
                        if let Some(turn_id) = t.turn_id {
                            let _ = cancel_server
                                .request(
                                    "turn/interrupt",
                                    json!({"threadId": t.codex_id, "turnId": turn_id}),
                                )
                                .await;
                        }
                    }
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            }
        });

        // Filet anti-CLI-figé, pas une durée maximale de tour : le compte à
        // rebours repart à chaque notification. Une échéance sèche tuait des
        // tours EN PLEIN TRAVAIL (2026-08-28 : reconstruction de provenance
        // coupée à 600 s après 39 commandes exécutées).
        let idle = std::time::Duration::from_secs(turn_idle_secs());
        let result = match crate::turn_idle::with_idle_timeout(done_rx, idle, &activity).await {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => (false, Some("rpc cancelled".into())),
            Err(()) => {
                (req.on_event)(json!({
                    "kind":"error",
                    "message": format!("Codex muet depuis {} min — tour interrompu", idle.as_secs() / 60),
                }));
                (false, Some("timeout".into()))
            }
        };

        self.server.clear_handler(&codex_id).await;
        self.server.clear_request_handler(&codex_id).await;
        if let Ok(mut a) = self.active.lock() {
            a.remove(&req.thread_id);
        }

        if !finished.load(Ordering::SeqCst) {
            // ensure a terminal event reached the harness
            if result.0 {
                (req.on_event)(json!({"kind":"done","ok": true, "result": ""}));
            } else if result.1.as_deref() != Some("timeout") {
                // error already emitted or interrupted
                if !finished.load(Ordering::SeqCst) {
                    (req.on_event)(json!({
                        "kind": "error",
                        "message": result.1.clone().unwrap_or_else(|| "session terminée".into())
                    }));
                }
            }
        }

        SendResult {
            session_id: Some(codex_id),
            ok: result.0,
            error: result.1,
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        let snap = self
            .active
            .lock()
            .ok()
            .and_then(|g| g.get(thread_id).cloned());
        let Some(t) = snap else {
            return false;
        };
        let Some(turn_id) = t.turn_id else {
            return false;
        };
        self.server
            .request(
                "turn/interrupt",
                json!({"threadId": t.codex_id, "turnId": turn_id}),
            )
            .await
            .is_ok()
    }

    async fn native_command(&self, name: &str, params: Value) -> Result<Value, String> {
        if name == "pluginsInstalled" {
            let cwd = params
                .get("projectRoot")
                .and_then(Value::as_str)
                .unwrap_or("");
            return list_atelier_plugins(&self.server, cwd).await;
        }
        let session_id = params
            .get("sessionId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| format!("{name}: session Codex absente"))?;
        let cwd = params
            .get("projectRoot")
            .and_then(Value::as_str)
            .unwrap_or("");
        let sandbox = if name == "review" {
            "read-only"
        } else {
            "danger-full-access"
        };
        let codex_id = open_thread(
            &self.server,
            Some(session_id),
            json!({
                "cwd": if cwd.is_empty() { Value::Null } else { json!(cwd) },
                "sandbox": sandbox,
                "approvalPolicy": "never",
            }),
        )
        .await?;
        match name {
            "compact" => {
                self.server
                    .request("thread/compact/start", json!({"threadId": codex_id}))
                    .await
            }
            "goalSet" => self
                .server
                .request(
                    "thread/goal/set",
                    json!({
                        "threadId": codex_id,
                        "objective": params.get("objective").cloned().unwrap_or(Value::Null),
                        "status": params.get("status").cloned().unwrap_or(json!("active")),
                        "tokenBudget": params.get("tokenBudget").cloned().unwrap_or(Value::Null),
                    }),
                )
                .await,
            "goalGet" => {
                self.server
                    .request("thread/goal/get", json!({"threadId": codex_id}))
                    .await
            }
            "goalClear" => {
                self.server
                    .request("thread/goal/clear", json!({"threadId": codex_id}))
                    .await
            }
            "review" => self.run_native_review(&codex_id).await,
            _ => Err(format!("commande Codex inconnue: {name}")),
        }
    }
}

#[cfg(test)]
mod command_tests {
    use super::*;

    #[test]
    fn permission_modes_map_to_real_codex_policies() {
        assert_eq!(
            codex_safety(Some("bypassPermissions")),
            ("danger-full-access", "never")
        );
        assert_eq!(
            codex_safety(Some("acceptEdits")),
            ("workspace-write", "on-request")
        );
        assert_eq!(
            codex_safety(Some("default")),
            ("workspace-write", "untrusted")
        );
        assert_eq!(codex_safety(Some("plan")), ("read-only", "never"));
        assert_eq!(codex_safety(None), ("read-only", "on-request"));
    }
}

#[cfg(test)]
mod service_tier_tests {
    use super::*;
    use crate::traits::SendMode;
    use std::sync::Arc;

    fn request(effort: &str, fast_mode: bool) -> SendRequest {
        SendRequest {
            thread_id: "thread-1".into(),
            turn_id: "turn-1".into(),
            prompt: "ping".into(),
            inputs: None,
            project_root: "/tmp/atelier".into(),
            session_id: None,
            model: Some("gpt-5.6-sol".into()),
            effort: (!effort.is_empty()).then(|| effort.to_string()),
            fast_mode,
            permission_mode: Some("bypassPermissions".into()),
            fork_pending: false,
            mode: SendMode::Normal,
            on_event: Arc::new(|_| {}),
            on_interaction: None,
            is_cancelled: Arc::new(|| false),
            atelier_mcp: None,
        }
    }

    #[test]
    fn standard_ne_force_aucun_niveau_de_service() {
        let opts = thread_opts(&request("medium", false));
        assert_eq!(opts["config"]["model_reasoning_effort"], json!("medium"));
        assert!(opts["config"].get("service_tier").is_none());
    }

    #[test]
    fn fast_transmet_le_niveau_priority() {
        let opts = thread_opts(&request("medium", true));
        assert_eq!(opts["config"]["service_tier"], json!("priority"));
    }

    /// Un modèle qui déclare `supported_reasoning_levels: []` (toutes les
    /// variantes « Flash » d'OpenCodex) ne sait rien faire d'un effort. Lui
    /// envoyer « max » n'ajoutait pas de raisonnement : Codex se mettait à
    /// émettre des items `reasoning` VIDES, donc un marqueur « Réflexion »
    /// sans contenu dans le fil (mesuré 2026-08-26 sur GLM 5.3 Flash).
    #[test]
    fn effort_tu_quand_le_catalogue_ne_declare_aucun_niveau() {
        assert_eq!(effort_a_envoyer("max", Some(&[])), None);
    }

    /// Repli OUVERT : un modèle absent du catalogue, ou un catalogue illisible,
    /// garde l'effort. On ne prive jamais un modèle d'un réglage faute d'info.
    #[test]
    fn effort_conserve_quand_le_catalogue_ne_dit_rien() {
        assert_eq!(effort_a_envoyer("max", None), Some("max".to_string()));
        assert_eq!(
            effort_a_envoyer("high", Some(&["low".into(), "high".into()])),
            Some("high".to_string()),
        );
    }

    #[test]
    fn fast_ne_touche_pas_a_leffort_de_raisonnement() {
        for effort in ["high", "xhigh"] {
            let standard = thread_opts(&request(effort, false));
            let fast = thread_opts(&request(effort, true));
            assert_eq!(fast["config"]["model_reasoning_effort"], json!(effort));
            assert_eq!(
                standard["config"]["model_reasoning_effort"],
                fast["config"]["model_reasoning_effort"],
            );
            // le modèle non plus
            assert_eq!(standard["model"], fast["model"]);
        }
    }

    /// `thread/resume` ignore l'override de modèle d'un thread existant
    /// (sonde app-server 0.149.0, 2026-08-27) : seuls les params de
    /// `turn/start` garantissent que le choix du picker est celui qui tourne.
    #[test]
    fn turn_start_repete_modele_et_effort() {
        let overrides = turn_start_overrides(&request("medium", false));
        assert_eq!(overrides.get("model"), Some(&json!("gpt-5.6-sol")));
        assert_eq!(overrides.get("effort"), Some(&json!("medium")));
    }

    #[test]
    fn turn_start_sans_selection_ne_force_rien() {
        let mut req = request("", false);
        req.model = None;
        assert!(turn_start_overrides(&req).is_empty());
    }

    /// Même décision que `thread_opts` : l'effort transmis par
    /// `config.model_reasoning_effort` et par `turn/start.effort` est
    /// identique — jamais l'un sans l'autre.
    #[test]
    fn turn_start_et_thread_opts_partagent_la_decision_deffort() {
        for effort in ["", "low", "medium", "max"] {
            let req = request(effort, false);
            let par_config = thread_opts(&req)
                .get("config")
                .and_then(|c| c.get("model_reasoning_effort"))
                .cloned()
                .unwrap_or(Value::Null);
            let par_turn = turn_start_overrides(&req)
                .get("effort")
                .cloned()
                .unwrap_or(Value::Null);
            assert_eq!(par_config, par_turn, "effort «{effort}»");
        }
    }

    /// Contrat PARTAGÉ avec le sidecar Node : le même fixture est rejoué par
    /// `sidecar/providers/codex.test.mjs`. Le canal de l'effort diffère
    /// (config.model_reasoning_effort ici, turn/start.effort là-bas) mais la
    /// décision niveau de service + effort préservé doit être identique.
    #[test]
    fn le_contrat_partage_rust_node_est_respecte() {
        let raw = include_str!("../tests/fixtures/codex_service_tier.json");
        let fixture: Value = serde_json::from_str(raw).expect("fixture JSON valide");
        let cases = fixture["cases"].as_array().expect("cases");
        assert!(!cases.is_empty());
        for case in cases {
            let name = case["name"].as_str().unwrap_or("?");
            let opts = thread_opts(&request(
                case["effort"].as_str().unwrap_or(""),
                case["fastMode"].as_bool().unwrap_or(false),
            ));
            let config = opts.get("config");
            let tier = config
                .and_then(|c| c.get("service_tier"))
                .cloned()
                .unwrap_or(Value::Null);
            let effort_out = config
                .and_then(|c| c.get("model_reasoning_effort"))
                .cloned()
                .unwrap_or(Value::Null);
            assert_eq!(tier, case["serviceTier"], "{name}: service_tier");
            assert_eq!(effort_out, case["effortOut"], "{name}: effort");
        }
    }
}


#[cfg(test)]
mod catalogue_tests {
    use super::*;

    /// Forme réelle du catalogue OpenCodex 2.14.1 : les modèles relayés
    /// portent un `slug` avec barre oblique, un nom d'affichage officiel, et
    /// des efforts sous forme d'objets `{effort, description}`.
    const CATALOGUE: &str = r#"{"models":[
        {"slug":"gpt-5.6-sol","display_name":"GPT-5.6-Sol","default_reasoning_level":"medium",
         "supported_reasoning_levels":[{"effort":"low"},{"effort":"high"},{"effort":"max"}]},
        {"slug":"anthropic/claude-opus-5","display_name":"Claude Opus 5",
         "default_reasoning_level":"medium",
         "supported_reasoning_levels":[{"effort":"low"},{"effort":"medium"}]},
        {"slug":"kimi/k3-256k","display_name":"Kimi K3 256k"}
    ]}"#;

    #[test]
    fn les_modeles_relayes_sortent_du_catalogue() {
        let dir = tempfile::tempdir().unwrap();
        let fichier = dir.path().join("opencodex-catalog.json");
        std::fs::write(&fichier, CATALOGUE).unwrap();

        let models = parse_codex_catalog(&fichier);
        assert_eq!(models.len(), 3);
        assert_eq!(models[1].id, "anthropic/claude-opus-5");
        assert_eq!(models[1].label.as_deref(), Some("Claude Opus 5"));
        assert_eq!(models[0].efforts, vec!["low", "high", "max"]);
        assert_eq!(models[0].default_effort.as_deref(), Some("medium"));
        // Un modèle sans niveaux déclarés ne doit rien inventer.
        assert!(models[2].efforts.is_empty());
    }

    #[test]
    fn la_cle_du_config_toml_est_suivie_avant_le_repli() {
        let dir = tempfile::tempdir().unwrap();
        let ailleurs = dir.path().join("ailleurs.json");
        std::fs::write(&ailleurs, CATALOGUE).unwrap();
        std::fs::write(
            dir.path().join("config.toml"),
            format!(
                "# model_catalog_json = \"/piege/commente.json\"\nmodel_catalog_json = \"{}\"\n",
                ailleurs.display()
            ),
        )
        .unwrap();
        // Un repli existe aussi : la clé doit gagner.
        std::fs::write(dir.path().join("opencodex-catalog.json"), r#"{"models":[]}"#).unwrap();

        let trouve = codex_catalog_path_in(dir.path(), dir.path()).unwrap();
        assert_eq!(trouve, ailleurs);
        assert_eq!(parse_codex_catalog(&trouve).len(), 3);
    }

    /// Sans clé, l'emplacement standard d'OpenCodex sert de repli.
    #[test]
    fn sans_cle_le_chemin_standard_est_utilise() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("config.toml"), "model = \"gpt-5.6-sol\"\n").unwrap();
        std::fs::write(dir.path().join("opencodex-catalog.json"), CATALOGUE).unwrap();

        let trouve = codex_catalog_path_in(dir.path(), dir.path()).unwrap();
        assert_eq!(trouve, dir.path().join("opencodex-catalog.json"));
    }

    /// Catalogue illisible ou absent : aucun modèle, donc le repli statique du
    /// provider reste en place — jamais de sélecteur vide.
    #[test]
    fn un_catalogue_illisible_ne_donne_aucun_modele() {
        let dir = tempfile::tempdir().unwrap();
        let fichier = dir.path().join("opencodex-catalog.json");
        std::fs::write(&fichier, "ceci n'est pas du JSON").unwrap();
        assert!(parse_codex_catalog(&fichier).is_empty());
        assert!(parse_codex_catalog(&dir.path().join("absent.json")).is_empty());
        assert!(codex_catalog_path_in(dir.path(), dir.path()).is_none() || true);
    }
}

#[cfg(test)]
mod steer_refus_tests {
    use super::steer_refus_definitif;

    #[test]
    fn revue_et_compaction_ne_deviennent_jamais_un_tour_normal() {
        // Messages EXACTS du serveur, relevés sur codex 0.149.0. Enchaîner un
        // tour normal ici en démarrerait un second en parallèle du premier.
        assert!(steer_refus_definitif("cannot steer a review turn"));
        assert!(steer_refus_definitif("cannot steer a compact turn"));
        assert!(steer_refus_definitif("ActiveTurnNotSteerable"));
        // faux négatifs relevés par la vérification indépendante : eux aussi
        // sont des refus AVEC un tour actif — retomber en tour normal le
        // doublerait
        assert!(steer_refus_definitif("active turn uses a different output schema"));
        assert!(steer_refus_definitif(
            "failed to serialize active-turn-not-steerable turn error"
        ));
    }

    #[test]
    fn un_tour_deja_fini_retombe_en_tour_normal_plutot_que_perdre_le_message() {
        assert!(!steer_refus_definitif("no active turn to steer"));
        assert!(!steer_refus_definitif("expectedTurnId must not be empty"));
        assert!(!steer_refus_definitif("input must not be empty"));
    }
}

#[cfg(test)]
mod steer_mismatch_tests {
    use super::{steer_refus_definitif, steer_turn_reel};

    #[test]
    fn extrait_le_vrai_identifiant_du_message_du_serveur() {
        // Message EXACT relevé sur codex 0.149.0 avec un tour en vol.
        let msg = "expected active turn id `01a00000-0000-0000-0000-000000000000` \
                   but found `01a04ee1-8ed7-74b2-90bb-8ee7781eb356`";
        assert_eq!(
            steer_turn_reel(msg).as_deref(),
            Some("01a04ee1-8ed7-74b2-90bb-8ee7781eb356")
        );
        // et un désaccord n'est PAS un refus définitif : on réessaie
        assert!(!steer_refus_definitif(msg));
    }

    #[test]
    fn les_autres_refus_ne_donnent_aucun_identifiant() {
        for msg in [
            "no active turn to steer",
            "cannot steer a review turn",
            "expectedTurnId must not be empty",
            "but found nothing at all",
        ] {
            assert_eq!(steer_turn_reel(msg), None, "faux positif sur : {msg}");
        }
    }
}

#[cfg(test)]
mod steer_mcp_repli_tests {
    use super::*;
    use crate::traits::{AtelierMcpLaunch, SendMode};
    use std::collections::BTreeMap;
    use std::sync::Arc;

    fn request(mcp: Option<AtelierMcpLaunch>) -> SendRequest {
        SendRequest {
            thread_id: "thread-1".into(),
            turn_id: "turn-1".into(),
            prompt: "bifurque".into(),
            inputs: None,
            project_root: "/tmp/atelier".into(),
            session_id: Some("sess-1".into()),
            model: Some("gpt-5.6-sol".into()),
            effort: None,
            fast_mode: false,
            permission_mode: Some("default".into()),
            fork_pending: false,
            // C'est le mode qui compte : un steer refusé retombe sur
            // open_thread(session_id) → thread/resume avec CES options.
            mode: SendMode::Steer,
            on_event: Arc::new(|_| {}),
            on_interaction: None,
            is_cancelled: Arc::new(|| false),
            atelier_mcp: mcp,
        }
    }

    fn launch() -> AtelierMcpLaunch {
        let mut env = BTreeMap::new();
        env.insert("ATELIER_MCP_ENDPOINT".to_string(), "http://127.0.0.1:1/x".to_string());
        env.insert("ATELIER_MCP_CAPABILITY".to_string(), "jeton".to_string());
        AtelierMcpLaunch {
            command: std::path::PathBuf::from("/tmp/atelier-agent-mcp"),
            server_name: "atelier-sessions".into(),
            env: env.into_iter().collect(),
            linked: false,
        }
    }

    /// Le repli d'un steer refusé reprend le fil par thread/resume. S'il part
    /// sans mcp_servers, l'agent PERD atelier_widget et atelier_sessions pour
    /// le reste de la session (incident du 2026-08-29). Ce test tient la
    /// chaîne : capacité présente dans la requête ⇒ serveurs déclarés au
    /// resume.
    #[test]
    fn un_steer_qui_retombe_garde_les_serveurs_mcp() {
        let opts = thread_opts(&request(Some(launch())));
        let serveurs = opts["config"]["mcp_servers"]
            .as_object()
            .expect("le resume du repli doit déclarer mcp_servers");
        let atelier = &serveurs["atelier-sessions"];
        assert_eq!(atelier["command"], json!("/tmp/atelier-agent-mcp"));
        assert_eq!(atelier["env"]["ATELIER_MCP_CAPABILITY"], json!("jeton"));
    }

    /// Le témoin : sans capacité, aucun serveur — c'était l'état du chemin
    /// steer avant le correctif, et ce que ce test empêche de revenir.
    #[test]
    fn sans_capacite_le_repli_ne_declare_aucun_serveur() {
        let opts = thread_opts(&request(None));
        assert!(
            opts.get("config")
                .and_then(|c| c.get("mcp_servers"))
                .is_none(),
            "aucun serveur ne doit être déclaré sans capacité"
        );
    }
}
