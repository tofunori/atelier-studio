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

use crate::traits::{
    atelier_mcp_servers, InteractionFn, Provider, ProviderCaps, SendRequest, SendResult,
};
use async_trait::async_trait;
use base64::Engine as _;
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
    /// Derniers modèles découverts (`kimi provider list --json`) — catalogue
    /// vivant pour providerStatus, jamais codé en dur (décision 7).
    discovered_models: StdMutex<Vec<String>>,
    /// Thinking par modèle découvert, dérivé des `capabilities` du catalogue
    /// (`always_thinking` ⇒ ["on"], `thinking` ⇒ ["off","on"]) — raffiné
    /// ensuite par les snapshots configOptions des sessions ouvertes.
    discovered_reasoning: StdMutex<serde_json::Map<String, Value>>,
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
            discovered_models: StdMutex::new(Vec::new()),
            discovered_reasoning: StdMutex::new(serde_json::Map::new()),
        }
    }

    /// Chemin du binaire résolu (affiché par le Setup).
    pub fn bin_path(&self) -> &PathBuf {
        &self.bin
    }
}

/// Version CLI minimale supportée (plan 046, décision 2).
pub(crate) const KIMI_MIN_VERSION: &str = "0.26.0";

/// Compare deux versions a.b.c ; négatif si a < b.
pub(crate) fn compare_kimi_versions(a: &str, b: &str) -> i64 {
    let parse = |s: &str| -> Vec<i64> {
        s.trim()
            .split('.')
            .map(|n| n.parse::<i64>().unwrap_or(0))
            .collect()
    };
    let (pa, pb) = (parse(a), parse(b));
    for i in 0..pa.len().max(pb.len()) {
        let d = pa.get(i).copied().unwrap_or(0) - pb.get(i).copied().unwrap_or(0);
        if d != 0 {
            return d;
        }
    }
    0
}

/// Table de décision de l'état Setup (plan 046 étape 10) — MIROIR documenté
/// de la séquence de `setup_probe` (et de deriveKimiSetupState côté Node),
/// verrouillée par le test exhaustif `etats_setup_derives_exhaustivement`.
#[cfg(test)]
pub(crate) fn derive_kimi_setup_state(
    bin_present: bool,
    version: Option<&str>,
    protocol_ok: Option<bool>,
    auth_required: bool,
    probe_error: bool,
    model_count: usize,
) -> &'static str {
    if !bin_present {
        return "not_installed";
    }
    if let Some(v) = version {
        if compare_kimi_versions(v, KIMI_MIN_VERSION) < 0 {
            return "version_unsupported";
        }
    }
    if probe_error || protocol_ok == Some(false) {
        return "protocol_error";
    }
    if auth_required {
        return "login_needed";
    }
    if model_count == 0 {
        return "model_config_needed";
    }
    "ready"
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

/// Catalogue `kimi provider list --json` → (ids, thinking par modèle).
/// Contrat vérifié contre le binaire 0.26.0 configuré (2026-07-18) : chaque
/// modèle porte `capabilities`; `always_thinking` = pas de « off » proposé
/// par le CLI (confirmé par le configOptions de session : options ["on"]).
fn catalog_from_provider_list(v: &Value) -> (Vec<String>, serde_json::Map<String, Value>) {
    let mut models = Vec::new();
    let mut reasoning = serde_json::Map::new();
    let Some(entries) = v.get("models").and_then(Value::as_object) else {
        return (models, reasoning);
    };
    for (id, meta) in entries {
        models.push(id.clone());
        let caps: Vec<&str> = meta
            .get("capabilities")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        let efforts = if caps.contains(&"always_thinking") {
            json!(["on"])
        } else if caps.contains(&"thinking") {
            json!(["off", "on"])
        } else {
            continue;
        };
        reasoning.insert(
            id.clone(),
            json!({"supported_efforts": efforts, "default_effort": "on"}),
        );
    }
    // Ordre déterministe partagé avec le sidecar Node (parité providerStatus :
    // serde_json trie ses objets, Node garde l'ordre d'insertion — on trie).
    models.sort();
    (models, reasoning)
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

/// Limite documentée d'une image envoyée à Kimi (octets sur disque,
/// AVANT encodage base64) — testée dans ce module.
pub(crate) const KIMI_IMAGE_MAX_BYTES: u64 = 5 * 1024 * 1024;

fn image_mime_for(path: &std::path::Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|e| e.to_str())?
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Image locale → bloc `{type:"image", data, mimeType}` (plan 046 étape 7) :
/// canonicalisation, MIME par extension, limite de taille, base64 encodé au
/// dernier moment. Toute erreur porte le NOM du fichier — jamais le base64.
pub(crate) fn kimi_image_block(path: &str) -> Result<Value, String> {
    let canon =
        std::fs::canonicalize(path).map_err(|e| format!("image illisible « {path} » : {e}"))?;
    let Some(mime) = image_mime_for(&canon) else {
        return Err(format!(
            "extension d'image non supportée pour Kimi « {path} » (png/jpg/jpeg/gif/webp)."
        ));
    };
    let meta =
        std::fs::metadata(&canon).map_err(|e| format!("image illisible « {path} » : {e}"))?;
    if meta.len() > KIMI_IMAGE_MAX_BYTES {
        return Err(format!(
            "image « {path} » trop volumineuse ({} octets, max {KIMI_IMAGE_MAX_BYTES}).",
            meta.len()
        ));
    }
    let bytes = std::fs::read(&canon).map_err(|e| format!("image illisible « {path} » : {e}"))?;
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(json!({"type": "image", "data": data, "mimeType": mime}))
}

/// Inputs structurés Atelier → content blocks Kimi. Un input invalide échoue
/// AVANT le prompt (jamais de drop silencieux) ; skills et mentions passent en
/// `resource_link` file:// que le harnais Kimi résout localement.
pub(crate) fn build_prompt_blocks(
    prompt: &str,
    inputs: Option<&Vec<Value>>,
) -> Result<Vec<Value>, String> {
    let Some(inputs) = inputs.filter(|list| !list.is_empty()) else {
        return Ok(vec![json!({"type": "text", "text": prompt})]);
    };
    let mut blocks: Vec<Value> = Vec::new();
    let mut has_text = false;
    for input in inputs {
        match input.get("type").and_then(Value::as_str).unwrap_or("") {
            "text" => {
                has_text = true;
                let text = input.get("text").and_then(Value::as_str).unwrap_or("");
                blocks.push(json!({"type": "text", "text": text}));
            }
            "local_image" => {
                let path = input
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or("input image sans chemin")?;
                blocks.push(kimi_image_block(path)?);
            }
            "skill" | "mention" => {
                let path = input.get("path").and_then(Value::as_str).unwrap_or("");
                let name = input.get("name").and_then(Value::as_str).unwrap_or(path);
                if path.is_empty() {
                    return Err(format!("input « {name} » sans chemin pour Kimi."));
                }
                blocks.push(json!({
                    "type": "resource_link",
                    "uri": format!("file://{path}"),
                    "name": name,
                }));
            }
            other => {
                return Err(format!(
                    "type d'input non supporté pour Kimi : « {} ».",
                    other.chars().take(32).collect::<String>()
                ));
            }
        }
    }
    if !has_text {
        blocks.insert(0, json!({"type": "text", "text": prompt}));
    }
    Ok(blocks)
}

/// `updatedAt` ISO-8601 UTC → epoch millisecondes (shape `mtime` du
/// navigateur de sessions). Timestamp invalide ⇒ None (tolérance exigée).
pub(crate) fn iso8601_to_epoch_ms(s: &str) -> Option<u64> {
    let bytes = s.as_bytes();
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' {
        return None;
    }
    let num = |range: std::ops::Range<usize>| -> Option<i64> { s.get(range)?.parse::<i64>().ok() };
    let (year, month, day) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hour, minute, second) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let millis = if bytes.get(19) == Some(&b'.') {
        num(20..23).unwrap_or(0)
    } else {
        0
    };
    // Days from civil (Howard Hinnant) — UTC uniquement (suffixe Z de Kimi).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + hour * 3_600 + minute * 60 + second;
    if secs < 0 {
        return None;
    }
    Some((secs * 1_000 + millis) as u64)
}

/// Replay capturé de `session/load` → events d'historique Atelier
/// (user/thinking/text coalescés, tool_update via le mapper kimi). Ces events
/// servent à l'AFFICHAGE d'une session importée — jamais ré-émis dans un tour.
/// Dernière erreur avalée par le CLI : lue dans le log de la session
/// (`~/.kimi-code/sessions/<wd>/<sid>/logs/kimi-code.log`) pour citer la
/// cause réelle (ex. « 400 total message size … exceeds limit … ») au lieu
/// d'une supposition. Best-effort : None si introuvable.
fn kimi_last_cli_error(session_id: &str) -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let sessions = std::path::Path::new(&home).join(".kimi-code/sessions");
    for entry in std::fs::read_dir(&sessions).ok()?.flatten() {
        let log = entry.path().join(session_id).join("logs/kimi-code.log");
        let Ok(raw) = std::fs::read_to_string(&log) else {
            continue;
        };
        let tail: Vec<&str> = raw.lines().rev().take(200).collect();
        for line in &tail {
            if let Some(idx) = line.find("APIStatusError:") {
                return Some(line[idx + "APIStatusError:".len()..].trim().to_string());
            }
        }
        for line in &tail {
            if line.contains("failed reason") {
                return Some(line.trim().chars().take(300).collect());
            }
        }
    }
    None
}

/// Les sessions natives persistent le prompt provider COMPLET : blocs
/// d'instructions injectés (`<atelier-*>`) et `<system-reminder>` des hooks.
/// Au replay, ne montrer que ce que l'utilisateur a réellement tapé — un
/// message réduit à un rappel système disparaît entièrement.
pub(crate) fn sanitize_replay_user(text: &str) -> String {
    let mut out = text.to_string();
    for (open, close) in [
        (
            "<atelier-gallery-integration>",
            "</atelier-gallery-integration>",
        ),
        ("<atelier-zotero-passages>", "</atelier-zotero-passages>"),
        ("<atelier-kb>", "</atelier-kb>"),
        ("<system-reminder>", "</system-reminder>"),
    ] {
        while let Some(start) = out.find(open) {
            let Some(rel_end) = out[start + open.len()..].find(close) else {
                break;
            };
            let end = start + open.len() + rel_end + close.len();
            let remove_from = out[..start].trim_end_matches(['\r', '\n']).len();
            out.replace_range(remove_from..end, "");
        }
    }
    out.trim().to_string()
}

pub(crate) fn replay_to_history(updates: &[Value]) -> Vec<Value> {
    use crate::acp_map::text_of;
    let mut events: Vec<Value> = Vec::new();
    let mut ctx = TurnCtx::default();
    let mut user = String::new();
    let mut think = String::new();
    let mut text = String::new();
    fn flush(events: &mut Vec<Value>, buf: &mut String, kind: &str) {
        if buf.is_empty() {
            return;
        }
        let taken = std::mem::take(buf);
        let cleaned = if kind == "user" {
            sanitize_replay_user(&taken)
        } else {
            taken
        };
        if !cleaned.is_empty() {
            events.push(json!({"kind": kind, "text": cleaned}));
        }
    }
    for u in updates {
        match u.get("sessionUpdate").and_then(Value::as_str) {
            Some("user_message_chunk") => {
                flush(&mut events, &mut think, "thinking");
                flush(&mut events, &mut text, "text");
                user.push_str(&text_of(u));
            }
            Some("agent_thought_chunk") => {
                flush(&mut events, &mut user, "user");
                flush(&mut events, &mut text, "text");
                think.push_str(&text_of(u));
            }
            Some("agent_message_chunk") => {
                flush(&mut events, &mut user, "user");
                flush(&mut events, &mut think, "thinking");
                text.push_str(&text_of(u));
            }
            Some("tool_call") | Some("tool_call_update") => {
                flush(&mut events, &mut user, "user");
                flush(&mut events, &mut think, "thinking");
                flush(&mut events, &mut text, "text");
                events.extend(map_kimi_session_update(u, &mut ctx));
            }
            _ => {}
        }
    }
    flush(&mut events, &mut user, "user");
    flush(&mut events, &mut think, "thinking");
    flush(&mut events, &mut text, "text");
    events
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
    /// `--version` du binaire réel (jamais du fixture de test — la version
    /// d'un wrapper node n'est pas celle de Kimi).
    async fn cli_version(&self) -> Option<String> {
        if self.acp_args != vec!["acp".to_string()] {
            return None;
        }
        let out = tokio::time::timeout(
            Duration::from_secs(8),
            tokio::process::Command::new(&self.bin)
                .arg("--version")
                .output(),
        )
        .await
        .ok()?
        .ok()?;
        if !out.status.success() {
            return None;
        }
        let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if v.is_empty() {
            None
        } else {
            Some(v)
        }
    }

    /// Catalogue modèles SANS quota ni prompt : `kimi provider list --json`
    /// (vide tant qu'aucun provider Kimi n'est configuré côté CLI).
    /// Renvoie (ids, thinking par modèle dérivé des capabilities) et met à
    /// jour le cache seulement quand la découverte rapporte quelque chose.
    async fn discover_models(&self) -> (Vec<String>, serde_json::Map<String, Value>) {
        let empty = (Vec::new(), serde_json::Map::new());
        let Ok(Ok(out)) = tokio::time::timeout(
            Duration::from_secs(5),
            tokio::process::Command::new(&self.bin)
                .args(["provider", "list", "--json"])
                .output(),
        )
        .await
        else {
            return empty;
        };
        if !out.status.success() {
            return empty;
        }
        let (models, reasoning) = serde_json::from_slice::<Value>(&out.stdout)
            .map(|v| catalog_from_provider_list(&v))
            .unwrap_or(empty);
        if !models.is_empty() {
            *self.discovered_models.lock().unwrap() = models.clone();
            *self.discovered_reasoning.lock().unwrap() = reasoning.clone();
        }
        (models, reasoning)
    }

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
            if self.state.lock().unwrap().opened_sessions.contains(&sid)
                && req.atelier_mcp.is_none()
            {
                return Ok(sid);
            }
            match self
                .acp
                .request(
                    "session/resume",
                    json!({"sessionId": sid, "cwd": cwd, "mcpServers": atelier_mcp_servers(req.atelier_mcp.as_ref())}),
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
                json!({"cwd": cwd, "mcpServers": atelier_mcp_servers(req.atelier_mcp.as_ref())}),
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

        // Inputs validés AVANT toute session/prompt : une image invalide
        // échoue ici avec son nom de fichier (plan 046 étape 7), et la
        // capacité image annoncée par Kimi est vérifiée.
        let prompt_blocks = build_prompt_blocks(&req.prompt, req.inputs.as_ref())?;
        if prompt_blocks
            .iter()
            .any(|b| b.get("type").and_then(Value::as_str) == Some("image"))
            && init
                .agent_capabilities
                .pointer("/promptCapabilities/image")
                .and_then(Value::as_bool)
                != Some(true)
        {
            return Err("Kimi n'annonce pas la capacité image (promptCapabilities.image).".into());
        }

        let sid = self.open_session(req, &cwd).await?;
        self.align_config(&sid, req).await?;

        let state = Arc::new(StdMutex::new((
            TurnCtx::default(),
            TurnEmitter::new(req.on_event.clone()),
        )));
        // Échec silencieux du CLI (vérifié kimi 0.27) : sur une erreur API (ex.
        // 400 « total message size exceeds limit », contexte > ~2 Mo),
        // session/prompt répond {stopReason:"end_turn"} SANS aucun chunk ni
        // notification d'erreur. Un end_turn sans contenu = échec à dénoncer.
        let saw_content = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let saw_content_handler = Arc::clone(&saw_content);
        let handler_state = Arc::clone(&state);
        let config_cache = Arc::clone(&self.config);
        let commands_cache = Arc::clone(&self.commands);
        let sid_for_handler = sid.clone();
        let handler: SessionUpdateHandler = Arc::new(move |update: &Value| {
            if matches!(
                update.get("sessionUpdate").and_then(Value::as_str),
                Some(
                    "user_message_chunk"
                        | "agent_message_chunk"
                        | "agent_thought_chunk"
                        | "tool_call"
                        | "tool_call_update"
                        | "plan"
                )
            ) {
                saw_content_handler.store(true, std::sync::atomic::Ordering::Relaxed);
            }
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
                json!({"sessionId": sid, "prompt": prompt_blocks}),
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
                let mut done = {
                    let mut guard = state.lock().unwrap();
                    let (ctx, emitter) = &mut *guard;
                    emitter.flush();
                    map_kimi_prompt_result(&result, ctx)
                };
                let mut ok = done.get("ok").and_then(Value::as_bool).unwrap_or(false);
                let stop = result
                    .get("stopReason")
                    .and_then(Value::as_str)
                    .unwrap_or("stopReason inconnu");
                let silent_failure = ok
                    && stop == "end_turn"
                    && !saw_content.load(std::sync::atomic::Ordering::Relaxed);
                if silent_failure {
                    done["ok"] = json!(false);
                    ok = false;
                    let message = match kimi_last_cli_error(&sid) {
                        Some(detail) if detail.to_lowercase().contains("exceeds limit") => format!(
                            "Kimi a terminé le tour sans répondre — erreur avalée par le CLI : \
                             « {detail} ». C'est la limite de TAILLE DE REQUÊTE du serveur kimi-code \
                             (octets), pas ta fenêtre de contexte du modèle. Lance la commande \
                             « compact » de Kimi ou démarre une nouvelle conversation."
                        ),
                        Some(detail) => format!(
                            "Kimi a terminé le tour sans répondre — erreur avalée par le CLI : \
                             « {detail} ». Réessaie, lance « compact », ou démarre une nouvelle \
                             conversation."
                        ),
                        None => "Kimi a terminé le tour sans produire de réponse — échec silencieux \
                             du CLI. Réessaie, lance la commande « compact » de Kimi, ou démarre une \
                             nouvelle conversation (détail : ~/.kimi-code/sessions/<session>/logs/kimi-code.log)."
                            .to_string(),
                    };
                    (req.on_event)(json!({"kind": "error", "message": message}));
                }
                (req.on_event)(done);
                let error = if ok {
                    None
                } else if silent_failure {
                    Some(
                        "tour Kimi vide (end_turn sans contenu) — échec silencieux du CLI"
                            .to_string(),
                    )
                } else {
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

    /// Listing natif `session/list {cwd}` (plan 046 étape 8) — jamais le
    /// parser de fichiers Codex pour Kimi.
    async fn list_sessions(&self, project_root: &str) -> Option<Vec<Value>> {
        self.ensure_acp().await.ok()?;
        self.reset_state_if_respawned();
        let params = if project_root.is_empty() {
            json!({})
        } else {
            json!({"cwd": project_root})
        };
        let result = self
            .acp
            .request("session/list", params, Some(15_000))
            .await
            .ok()?;
        let sessions = result
            .get("sessions")?
            .as_array()?
            .iter()
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
                    // updatedAt invalide toléré : 0 (affichage epoch, pas de crash).
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

    /// Sonde Setup SANS quota (plan 046 étape 10) : binaire → `--version` →
    /// initialize → `authenticate(login)` → discovery modèles. JAMAIS de
    /// session/prompt. La commande de login vient d'`authMethods`.
    async fn setup_probe(&self) -> Option<Value> {
        let version = self.cli_version().await;
        let shadowed =
            shadowed_official_install(&self.bin).map(|p| p.to_string_lossy().into_owned());
        let base = |state: &str, models: usize, error: Option<String>| {
            json!({
                "state": state,
                "version": version,
                "binPath": self.bin.to_string_lossy(),
                "models": models,
                "loginCommand": "kimi login",
                "shadowed": shadowed,
                "error": error,
            })
        };
        if let Some(v) = &version {
            if compare_kimi_versions(v, KIMI_MIN_VERSION) < 0 {
                return Some(base("version_unsupported", 0, None));
            }
        }
        let init = match self.ensure_acp().await {
            Ok(init) => init,
            Err(e) => {
                if e.is_auth_required() {
                    return Some(base("login_needed", 0, None));
                }
                return Some(base("protocol_error", 0, Some(e.to_string())));
            }
        };
        self.reset_state_if_respawned();
        let name_ok = init
            .agent_info
            .as_ref()
            .and_then(|i| i.get("name"))
            .and_then(Value::as_str)
            .map(|n| n == "Kimi Code CLI")
            .unwrap_or(true);
        if init.protocol_version != 1 || !name_ok {
            return Some(base(
                "protocol_error",
                0,
                Some("handshake inattendu".into()),
            ));
        }
        let mut probe = base("ready", 0, None);
        // La commande de login annoncée par le CLI prime sur le défaut.
        if let Some(ta) = init
            .auth_methods
            .iter()
            .find(|m| m.get("id").and_then(Value::as_str) == Some("login"))
            .and_then(|m| m.pointer("/_meta/terminal-auth"))
        {
            let cmd = ta.get("command").and_then(Value::as_str).unwrap_or("kimi");
            let args: Vec<&str> = ta
                .get("args")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            probe["loginCommand"] = json!(format!("{cmd} {}", args.join(" ")).trim().to_string());
        }
        match self
            .acp
            .request("authenticate", json!({"methodId": "login"}), Some(10_000))
            .await
        {
            Ok(_) => {}
            Err(e) if e.is_auth_required() => {
                probe["state"] = json!("login_needed");
                return Some(probe);
            }
            Err(e) => {
                probe["state"] = json!("protocol_error");
                probe["error"] = json!(e.to_string());
                return Some(probe);
            }
        }
        let (models, _) = self.discover_models().await;
        probe["models"] = json!(models.len());
        if models.is_empty() {
            probe["state"] = json!("model_config_needed");
        }
        Some(probe)
    }

    /// Catalogue vivant pour providerStatus : discovery CLI À CHAQUE appel
    /// (même sémantique que le providerStatus Node — le catalogue est frais
    /// dès le boot, sans attendre la sonde Setup), complété par les derniers
    /// snapshots configOptions. Le thinking vient des `capabilities` du
    /// catalogue (confirmées par Kimi), raffiné par les options RÉELLES du
    /// snapshot quand une session est ouverte.
    async fn dynamic_models(&self) -> Option<Value> {
        // Discovery live ; en échec/vide, le cache (Setup ou appel précédent)
        // reste la source — jamais de liste en dur.
        let _ = self.discover_models().await;
        let mut models: Vec<String> = self.discovered_models.lock().unwrap().clone();
        let mut reasoning = self.discovered_reasoning.lock().unwrap().clone();
        for snapshot in self.config.lock().unwrap().values() {
            if let Some(model_opt) = find_config_option(snapshot, "model") {
                for v in option_values(model_opt) {
                    if !models.contains(&v) {
                        models.push(v);
                    }
                }
                let current = model_opt.get("currentValue").and_then(Value::as_str);
                if let (Some(current), Some(thinking)) =
                    (current, find_config_option(snapshot, "thinking"))
                {
                    let efforts = option_values(thinking);
                    reasoning.insert(
                        current.to_string(),
                        json!({
                            "supported_efforts": if efforts.is_empty() { json!(["off", "on"]) } else { json!(efforts) },
                            "default_effort": thinking.get("currentValue").cloned().unwrap_or(json!("on")),
                        }),
                    );
                }
            }
        }
        Some(json!({
            "models": models,
            "defaultModel": models.first().cloned().unwrap_or_default(),
            "modelReasoning": Value::Object(reasoning),
        }))
    }

    /// Import d'une session Kimi externe : `session/load` rejoue l'historique
    /// AVANT la réponse ; capturé une seule fois par génération (la session
    /// devient « ouverte » — le prochain prompt réutilise le même sessionId
    /// sans re-replay). Thread Atelier déjà journalisé ⇒ le journal gagne.
    async fn native_history(&self, session_id: &str, project_root: &str) -> Option<Vec<Value>> {
        if session_id.is_empty() {
            return None;
        }
        self.ensure_acp().await.ok()?;
        self.reset_state_if_respawned();
        if self
            .state
            .lock()
            .unwrap()
            .opened_sessions
            .contains(session_id)
        {
            return None; // déjà importée dans cette génération — pas de doublon
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
                json!({"sessionId": session_id, "cwd": cwd, "mcpServers": serde_json::json!([])}),
                Some(30_000),
            )
            .await;
        self.acp.clear_session_handler(session_id).await;
        match res {
            Ok(result) => {
                self.state
                    .lock()
                    .unwrap()
                    .opened_sessions
                    .insert(session_id.to_string());
                self.remember_snapshot(session_id, &result);
                // La réponse n'est traitée qu'ici — tous les updates de replay
                // sont déjà arrivés (contrat load vérifié).
                let updates = captured.lock().unwrap().clone();
                Some(replay_to_history(&updates))
            }
            Err(_) => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::traits::SendMode;

    #[test]
    fn replay_sanitizes_injected_blocks_and_drops_pure_reminders() {
        let updates = vec![
            serde_json::json!({"sessionUpdate":"user_message_chunk",
                "content":{"type":"text","text":"Ca veut dire quoi<atelier-zotero-passages>\noutil pdf\n</atelier-zotero-passages>"}}),
            serde_json::json!({"sessionUpdate":"agent_message_chunk",
                "content":{"type":"text","text":"réponse"}}),
            serde_json::json!({"sessionUpdate":"user_message_chunk",
                "content":{"type":"text","text":"<system-reminder>rappel outillage</system-reminder>"}}),
            serde_json::json!({"sessionUpdate":"agent_message_chunk",
                "content":{"type":"text","text":"suite"}}),
        ];
        let events = replay_to_history(&updates);
        let users: Vec<&str> = events
            .iter()
            .filter(|e| e.get("kind").and_then(Value::as_str) == Some("user"))
            .filter_map(|e| e.get("text").and_then(Value::as_str))
            .collect();
        // le bloc injecté disparaît ; le message réduit à un rappel système aussi
        assert_eq!(users, vec!["Ca veut dire quoi"]);
        assert_eq!(
            events
                .iter()
                .filter(|e| e.get("kind").and_then(Value::as_str) == Some("text"))
                .count(),
            2
        );
    }

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
            atelier_mcp: None,
        };
        let result = p.send(req).await;
        let events = events.lock().unwrap().clone();
        TurnOutput { result, events }
    }

    #[tokio::test]
    async fn tour_muet_end_turn_sans_contenu_denonce_l_echec() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let out = run_turn(&p, "[silent] question", None, None, None, None, None).await;
        assert!(!out.result.ok);
        let errs = out.errors();
        assert!(
            errs.iter().any(|m| m.contains("compact")),
            "erreur actionnable attendue, reçu: {errs:?}"
        );
        let done = out.done().expect("done");
        assert_eq!(done["ok"], false);
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
            atelier_mcp: None,
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

    // ------------------------------------------------------------------
    // Images, inputs et resources (plan 046 étape 7).

    #[test]
    fn prompt_blocks_texte_seul_et_inputs() {
        let blocks = build_prompt_blocks("salut", None).unwrap();
        assert_eq!(blocks, vec![json!({"type":"text","text":"salut"})]);
        let inputs = vec![
            json!({"type":"text","text":"prompt complet"}),
            json!({"type":"skill","name":"revue","path":"/tmp/skills/revue.md"}),
            json!({"type":"mention","name":"a.rs","path":"/tmp/a.rs"}),
        ];
        let blocks = build_prompt_blocks("ignoré", Some(&inputs)).unwrap();
        assert_eq!(blocks[0]["type"], "text");
        assert_eq!(blocks[0]["text"], "prompt complet");
        assert_eq!(blocks[1]["type"], "resource_link");
        assert_eq!(blocks[1]["uri"], "file:///tmp/skills/revue.md");
        assert_eq!(blocks[1]["name"], "revue");
        assert_eq!(blocks[2]["type"], "resource_link");
    }

    #[test]
    fn prompt_blocks_input_inconnu_echoue_fort() {
        let inputs = vec![json!({"type":"blob","data":"xxx"})];
        let err = build_prompt_blocks("p", Some(&inputs)).unwrap_err();
        assert!(err.contains("blob"), "avertissement explicite: {err}");
    }

    #[test]
    fn image_valide_encodee_invalide_refusee() {
        let dir = tempfile::tempdir().unwrap();
        let png = dir.path().join("mini.png");
        std::fs::write(&png, [0x89, 0x50, 0x4E, 0x47, 0, 1, 2, 3]).unwrap();
        let block = kimi_image_block(png.to_str().unwrap()).unwrap();
        assert_eq!(block["type"], "image");
        assert_eq!(block["mimeType"], "image/png");
        assert!(!block["data"].as_str().unwrap().is_empty());

        // Extension inconnue → erreur AVANT prompt, avec le nom du fichier.
        let weird = dir.path().join("donnees.tiff");
        std::fs::write(&weird, [1, 2, 3]).unwrap();
        let err = kimi_image_block(weird.to_str().unwrap()).unwrap_err();
        assert!(err.contains("donnees.tiff"), "{err}");

        // Fichier absent → erreur nommée.
        let err2 = kimi_image_block("/nulle/part/x.png").unwrap_err();
        assert!(err2.contains("/nulle/part/x.png"), "{err2}");
    }

    #[test]
    fn image_trop_volumineuse_refusee() {
        let dir = tempfile::tempdir().unwrap();
        let big = dir.path().join("grosse.png");
        let f = std::fs::File::create(&big).unwrap();
        f.set_len(KIMI_IMAGE_MAX_BYTES + 1).unwrap();
        drop(f);
        let err = kimi_image_block(big.to_str().unwrap()).unwrap_err();
        assert!(err.contains("trop volumineuse"), "{err}");
        assert!(err.contains("grosse.png"), "{err}");
    }

    #[tokio::test]
    async fn image_envoyee_au_wire_sans_journaliser_le_base64() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let png = dir.path().join("shot.png");
        std::fs::write(&png, b"fake-png-bytes").unwrap();
        let events: Arc<StdMutex<Vec<Value>>> = Arc::new(StdMutex::new(vec![]));
        let sink = Arc::clone(&events);
        let req = SendRequest {
            thread_id: "t-img".into(),
            turn_id: "turn-1".into(),
            prompt: "regarde [image]".into(),
            inputs: Some(vec![
                json!({"type":"text","text":"regarde [image]"}),
                json!({"type":"local_image","path": png.to_str().unwrap()}),
            ]),
            project_root: "/tmp/fake-kimi-proj".into(),
            session_id: None,
            model: None,
            effort: None,
            permission_mode: None,
            mode: SendMode::Normal,
            on_event: Arc::new(move |ev| sink.lock().unwrap().push(ev)),
            on_interaction: None,
            is_cancelled: Arc::new(|| false),
            atelier_mcp: None,
        };
        let result = p.send(req).await;
        assert!(result.ok, "erreur: {:?}", result.error);
        let evs = events.lock().unwrap();
        let text: String = evs
            .iter()
            .filter(|e| e["kind"] == "delta")
            .filter_map(|e| e["text"].as_str())
            .collect();
        // Le fixture répond img:<mime>:<longueur base64> — l'image est passée.
        let expected_len = base64::engine::general_purpose::STANDARD
            .encode(b"fake-png-bytes")
            .len();
        assert!(
            text.contains(&format!("img:image/png:{expected_len}")),
            "texte: {text}"
        );
        // Aucun event ne doit contenir le base64 (jamais journalisé).
        let b64 = base64::engine::general_purpose::STANDARD.encode(b"fake-png-bytes");
        for e in evs.iter() {
            assert!(
                !e.to_string().contains(&b64),
                "base64 fuité dans un event: {}",
                e["kind"]
            );
        }
    }

    // ------------------------------------------------------------------
    // Sessions natives (plan 046 étape 8).

    #[test]
    fn iso8601_epoch_ms_et_tolerance() {
        // Valeurs de référence vérifiées via datetime.fromisoformat (UTC).
        assert_eq!(
            iso8601_to_epoch_ms("2026-07-01T10:00:00.000Z"),
            Some(1_782_900_000_000)
        );
        assert_eq!(
            iso8601_to_epoch_ms("2026-07-16T14:39:58Z"),
            Some(1_784_212_798_000)
        );
        assert_eq!(iso8601_to_epoch_ms("not-a-date"), None);
        assert_eq!(iso8601_to_epoch_ms(""), None);
        assert_eq!(iso8601_to_epoch_ms("2026-13-01T00:00:00Z"), None);
    }

    #[tokio::test]
    async fn list_sessions_natif_mappage_et_filtre_cwd() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let all = p.list_sessions("").await.expect("liste native");
        assert_eq!(all.len(), 2);
        let a = &all[0];
        assert_eq!(a["id"], "session_known_a");
        assert_eq!(a["title"], "Session A");
        assert_eq!(a["projectRoot"], "/tmp/fake-kimi/proj-a");
        assert!(a["mtime"].as_u64().unwrap() > 0);
        // titre null → préfixe de l'id ; updatedAt invalide → 0 (toléré).
        let b = &all[1];
        assert_eq!(b["id"], "session_known_b");
        assert_eq!(b["title"], "session_known_b");
        assert_eq!(b["mtime"], 0);

        let filtered = p.list_sessions("/tmp/fake-kimi/proj-b").await.unwrap();
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0]["id"], "session_known_b");
    }

    #[tokio::test]
    async fn native_history_load_rejoue_une_seule_fois_puis_resume() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let events = p
            .native_history("session_known_a", "/tmp/fake-kimi/proj-a")
            .await
            .expect("replay importé");
        let kinds: Vec<&str> = events
            .iter()
            .map(|e| e["kind"].as_str().unwrap_or(""))
            .collect();
        assert_eq!(kinds, vec!["user", "text", "tool_update", "tool_update"]);
        assert_eq!(events[0]["text"], "question historique");
        assert_eq!(events[1]["text"], "réponse historique");
        assert_eq!(events[2]["id"], "1:call_hist");

        // Second import : la session est ouverte, plus de replay (pas de doublon).
        assert!(p
            .native_history("session_known_a", "/tmp/fake-kimi/proj-a")
            .await
            .is_none());

        // Le prochain prompt réutilise la MÊME session sans re-load.
        let out = run_turn(
            &p,
            "suite",
            Some("session_known_a".into()),
            None,
            None,
            None,
            None,
        )
        .await;
        assert!(out.result.ok, "erreurs: {:?}", out.errors());
        assert_eq!(out.result.session_id.as_deref(), Some("session_known_a"));
        assert!(!out.events.iter().any(|e| e["kind"] == "user"));
    }

    #[tokio::test]
    async fn native_history_session_supprimee_entre_list_et_load() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        assert!(p
            .native_history("session_effacee", "/tmp/fake-kimi/proj-a")
            .await
            .is_none());
    }

    // ------------------------------------------------------------------
    // Setup et catalogue dynamique (plan 046 étapes 6/10).

    #[test]
    fn versions_kimi_comparees() {
        assert_eq!(compare_kimi_versions("0.26.0", "0.26.0"), 0);
        assert!(compare_kimi_versions("0.25.9", "0.26.0") < 0);
        assert!(compare_kimi_versions("0.26.1", "0.26.0") > 0);
        assert!(compare_kimi_versions("1.0.0", "0.26.0") > 0);
        assert_eq!(compare_kimi_versions("0.26", "0.26.0"), 0);
    }

    #[test]
    fn etats_setup_derives_exhaustivement() {
        let d = derive_kimi_setup_state;
        assert_eq!(d(false, None, None, false, false, 2), "not_installed");
        assert_eq!(
            d(true, Some("0.20.0"), Some(true), false, false, 2),
            "version_unsupported"
        );
        assert_eq!(
            d(true, Some("0.26.0"), None, false, true, 2),
            "protocol_error"
        );
        assert_eq!(
            d(true, Some("0.26.0"), Some(false), false, false, 2),
            "protocol_error"
        );
        assert_eq!(
            d(true, Some("0.26.0"), Some(true), true, false, 2),
            "login_needed"
        );
        assert_eq!(
            d(true, Some("0.26.0"), Some(true), false, false, 0),
            "model_config_needed"
        );
        assert_eq!(
            d(true, Some("0.26.0"), Some(true), false, false, 2),
            "ready"
        );
        // version inconnue : pas bloquante, la sonde tranche
        assert_eq!(d(true, None, Some(true), false, false, 2), "ready");
    }

    #[tokio::test]
    async fn setup_probe_nominal_et_auth() {
        // nominal : authenticate {} + discovery vide (fixture sans CLI
        // provider list) ⇒ model_config_needed, login tiré d'authMethods.
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        let probe = p.setup_probe().await.expect("sonde");
        assert_eq!(probe["state"], "model_config_needed");
        assert_eq!(probe["loginCommand"], "/fake/bin/kimi login");
        assert_eq!(probe["models"], 0);

        // authRequired : authenticate -32000 ⇒ login_needed.
        let Some(p2) = fixture_provider("auth_required") else {
            return;
        };
        let probe2 = p2.setup_probe().await.expect("sonde");
        assert_eq!(probe2["state"], "login_needed");
    }

    #[tokio::test]
    async fn dynamic_models_depuis_les_snapshots() {
        let Some(p) = fixture_provider("nominal") else {
            return;
        };
        // aucun snapshot : catalogue vide, jamais de liste en dur
        let empty = p.dynamic_models().await.unwrap();
        assert_eq!(empty["models"].as_array().unwrap().len(), 0);
        // un tour ouvre une session ⇒ snapshot configOptions capté
        let out = run_turn(&p, "hello", None, None, None, None, None).await;
        assert!(out.result.ok);
        let dynamic = p.dynamic_models().await.unwrap();
        let models: Vec<&str> = dynamic["models"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert!(models.contains(&"fake-k3"));
        assert!(models.contains(&"fake-k3-mini"));
        // thinking confirmé pour le modèle ACTIF seulement
        assert_eq!(
            dynamic["modelReasoning"]["fake-k3"]["supported_efforts"],
            json!(["off", "on"])
        );
        assert!(dynamic["modelReasoning"].get("fake-k3-mini").is_none());
    }

    #[test]
    fn catalog_du_provider_list_derive_le_thinking_des_capabilities() {
        // Shape réel du binaire 0.26.0 configuré (sonde 2026-07-18).
        let v = json!({
            "providers": {"managed:kimi-code": {"type": "kimi"}},
            "models": {
                "kimi-code/k3": {"displayName": "K3", "capabilities": ["thinking", "always_thinking", "tool_use"]},
                "kimi-code/opt": {"capabilities": ["thinking", "tool_use"]},
                "kimi-code/none": {"capabilities": ["tool_use"]},
            },
        });
        let (models, reasoning) = catalog_from_provider_list(&v);
        assert_eq!(models.len(), 3);
        // always_thinking : le CLI ne propose pas « off »
        assert_eq!(
            reasoning["kimi-code/k3"],
            json!({"supported_efforts": ["on"], "default_effort": "on"})
        );
        // thinking optionnel : off/on
        assert_eq!(
            reasoning["kimi-code/opt"]["supported_efforts"],
            json!(["off", "on"])
        );
        // sans thinking : pas d'entrée (contrôle masqué côté UI)
        assert!(reasoning.get("kimi-code/none").is_none());
        // catalogue vide (CLI non configuré) : rien d'inventé
        let (m2, r2) = catalog_from_provider_list(&json!({"providers": {}, "models": {}}));
        assert!(m2.is_empty() && r2.is_empty());
    }
}
