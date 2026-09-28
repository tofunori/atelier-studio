//! Alertes iPhone via ntfy (https://ntfy.sh).
//!
//! Le profil de signature gratuit de l'app iOS n'a pas droit aux push Apple :
//! le gateway POSTe donc sur `{server}/{topic}` et l'app ntfy (gratuite)
//! affiche une vraie notification. Trois déclencheurs, lus sur le bus du
//! runtime (même WebSocket loopback que les autres routes) :
//!
//! - `done` d'un tour → « Terminé » ;
//! - `error` d'un tour (hors Stop demandé) → « Interrompu » ;
//! - `interaction` en attente (`state: "pending"`) → « Accord nécessaire »,
//!   priorité haute.
//!
//! Réglages persistés dans `{data_dir}/notify.json` (écriture atomique,
//! 0600). Par défaut : désactivé, sans aperçu du titre (le sujet ntfy.sh est
//! public pour qui connaît son nom), et seulement quand le Mac est inactif
//! depuis 2 min.

use crate::state::GatewayState;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio_tungstenite::tungstenite::Message;

pub const SETTINGS_FILE: &str = "notify.json";
pub const DEFAULT_SERVER: &str = "https://ntfy.sh";
/// Identifiant envoyé au runtime dans `clientHello`. Volontairement NON
/// hexadécimal : le runtime n'adopte comme « client courant » (celui qui a le
/// droit de répondre aux demandes d'accord) qu'un identifiant hex de 20+
/// caractères. Le guetteur ne doit jamais voler ce rôle à l'app.
pub const CLIENT_INSTANCE_ID: &str = "gateway-notify";
/// Le Mac est « inoccupé » après 2 min sans clavier ni souris.
pub const AWAY_AFTER: Duration = Duration::from_secs(120);
const IDLE_CACHE: Duration = Duration::from_secs(10);
const IDLE_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);
pub const DEDUPE_CAPACITY: usize = 512;
const MIN_BACKOFF: Duration = Duration::from_secs(1);
const MAX_BACKOFF: Duration = Duration::from_secs(30);
/// Un événement horodaté plus tôt que la connexion (moins cette marge) est
/// un rejeu, jamais une nouveauté : aucune alerte.
const STALE_MARGIN_MS: i64 = 5_000;
const TEST_MESSAGE: &str = "Atelier : alerte d'essai";

// ----- réglages -----

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifySettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_server")]
    pub server: String,
    #[serde(default)]
    pub topic: Option<String>,
    #[serde(default = "default_true")]
    pub only_when_away: bool,
    #[serde(default)]
    pub preview: bool,
}

impl Default for NotifySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            server: default_server(),
            topic: None,
            only_when_away: true,
            preview: false,
        }
    }
}

fn default_true() -> bool {
    true
}

/// Serveur ntfy par défaut ; `ATELIER_NTFY_SERVER` le remplace (tests,
/// serveur auto-hébergé). Ne s'applique qu'aux réglages sans serveur écrit.
pub fn default_server() -> String {
    std::env::var("ATELIER_NTFY_SERVER")
        .ok()
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .filter(|s| s.starts_with("http://") || s.starts_with("https://"))
        .unwrap_or_else(|| DEFAULT_SERVER.to_string())
}

impl NotifySettings {
    pub fn subscribe_url(&self) -> Option<String> {
        self.topic
            .as_deref()
            .filter(|t| !t.is_empty())
            .map(|topic| format!("{}/{topic}", self.server.trim_end_matches('/')))
    }

    /// Forme publique (GET/POST `/remote/v1/notify`).
    pub fn to_json(&self) -> Value {
        json!({
            "enabled": self.enabled,
            "server": self.server,
            "topic": self.topic,
            "subscribeUrl": self.subscribe_url(),
            "onlyWhenAway": self.only_when_away,
            "preview": self.preview,
        })
    }

    /// Fichier absent ou illisible → réglages par défaut (désactivé).
    pub fn load(path: &Path) -> Self {
        match std::fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|error| {
                tracing::warn!(%error, "notify.json illisible — réglages par défaut");
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let bytes = serde_json::to_vec_pretty(self).map_err(std::io::Error::other)?;
        write_private_atomic(path, &bytes)
    }

    fn ensure_topic(&mut self) {
        if self.topic.as_deref().is_none_or(str::is_empty) {
            self.topic = Some(generate_topic());
        }
    }
}

/// `atelier-` + 24 caractères [a-z0-9] : ≈ 124 bits, imprévisible, car le
/// sujet sert de secret partagé sur un serveur public.
pub fn generate_topic() -> String {
    use rand::Rng;
    const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    let suffix: String = (0..24)
        .map(|_| ALPHABET[rng.gen_range(0..ALPHABET.len())] as char)
        .collect();
    format!("atelier-{suffix}")
}

/// Temp + rename, créé 0600 d'emblée (le sujet ne doit pas être lisible
/// par les autres comptes du Mac, même un instant).
fn write_private_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = path.with_extension(format!("{}.{nanos}.tmp", std::process::id()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = options.open(&tmp).and_then(|mut file| {
        file.write_all(bytes)?;
        file.sync_all()
    });
    let result = result.and_then(|_| std::fs::rename(&tmp, path));
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

/// Corps de `POST /remote/v1/notify` — tous les champs sont facultatifs.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotifyUpdate {
    pub enabled: Option<bool>,
    pub only_when_away: Option<bool>,
    pub preview: Option<bool>,
    pub test: Option<bool>,
}

/// Lecture-modification-écriture sérialisée (deux POST simultanés ne se
/// marchent pas dessus). Le sujet est créé à la première activation, ou au
/// premier essai : il faut bien un sujet où envoyer l'alerte d'essai.
pub fn apply_update(path: &Path, update: &NotifyUpdate) -> std::io::Result<NotifySettings> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let before = NotifySettings::load(path);
    let mut settings = before.clone();
    if let Some(enabled) = update.enabled {
        settings.enabled = enabled;
    }
    if let Some(only_when_away) = update.only_when_away {
        settings.only_when_away = only_when_away;
    }
    if let Some(preview) = update.preview {
        settings.preview = preview;
    }
    if settings.enabled || update.test == Some(true) {
        settings.ensure_topic();
    }
    if settings != before || !path.exists() {
        settings.save(path)?;
    }
    Ok(settings)
}

pub async fn settings_path(state: &GatewayState) -> PathBuf {
    state.inner.lock().await.config.data_dir.join(SETTINGS_FILE)
}

// ----- décision (pure) -----

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Trigger {
    Done,
    Error,
    Pending,
}

/// Événement du bus qui PEUT donner lieu à une alerte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub thread_id: String,
    pub trigger: Trigger,
    /// Clé de déduplication : un tour (done/error) ou une demande d'accord
    /// n'alerte qu'une fois, même relayé deux fois.
    pub dedupe_key: Option<String>,
}

/// Classe une trame `{"type":"event","threadId":…,"event":{…}}` du runtime.
pub fn candidate(frame: &Value) -> Option<Candidate> {
    if frame.get("type").and_then(Value::as_str) != Some("event") {
        return None;
    }
    let thread_id = frame
        .get("threadId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())?;
    let event = frame.get("event")?;
    let meta = event.get("meta");
    let meta_str = |key: &str| {
        meta.and_then(|m| m.get(key))
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
    };
    let turn_key = || meta_str("turnId").map(|turn| format!("turn:{thread_id}:{turn}"));
    let (trigger, dedupe_key) = match event.get("kind").and_then(Value::as_str)? {
        "done" => (
            Trigger::Done,
            turn_key().or_else(|| meta_str("eventId").map(|id| format!("event:{thread_id}:{id}"))),
        ),
        "error" => {
            // Seul un terminal de tour compte (le harnais y met toujours
            // meta.turnId). « interrupted » = Stop demandé par l'utilisateur :
            // il le sait déjà.
            if event.get("message").and_then(Value::as_str) == Some("interrupted") {
                return None;
            }
            (Trigger::Error, Some(turn_key()?))
        }
        "interaction" => {
            if event.get("state").and_then(Value::as_str) != Some("pending") {
                return None;
            }
            let request = event
                .get("requestId")
                .and_then(Value::as_str)
                .filter(|v| !v.is_empty())
                .or_else(|| meta_str("eventId"));
            (
                Trigger::Pending,
                request.map(|id| format!("interaction:{thread_id}:{id}")),
            )
        }
        _ => return None,
    };
    Some(Candidate {
        thread_id: thread_id.to_string(),
        trigger,
        dedupe_key,
    })
}

/// Vrai si l'événement est horodaté (meta.ts, ms) nettement avant la
/// connexion : un rejeu d'historique, pas un fait nouveau.
pub fn is_stale(frame: &Value, connected_at_ms: i64) -> bool {
    frame
        .pointer("/event/meta/ts")
        .and_then(|ts| ts.as_i64().or_else(|| ts.as_f64().map(|f| f as i64)))
        .is_some_and(|ts| ts < connected_at_ms - STALE_MARGIN_MS)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notification {
    pub title: String,
    pub message: String,
    pub click: Option<String>,
    pub priority: Option<&'static str>,
    pub tags: Option<&'static str>,
}

/// Décision pure : trame + titre du fil + réglages → alerte éventuelle. Ne
/// regarde ni l'inactivité du Mac ni la déduplication (état du guetteur).
pub fn decide(
    frame: &Value,
    thread_title: Option<&str>,
    settings: &NotifySettings,
) -> Option<Notification> {
    if !settings.enabled || settings.subscribe_url().is_none() {
        return None;
    }
    let candidate = candidate(frame)?;
    let title = display_title(thread_title);
    let (message, priority, tags) = match (candidate.trigger, settings.preview) {
        (Trigger::Done, true) => (format!("Terminé : {title}"), None, None),
        (Trigger::Done, false) => ("Un travail est terminé.".to_string(), None, None),
        (Trigger::Error, true) => (format!("Interrompu : {title}"), None, None),
        (Trigger::Error, false) => ("Un travail s'est interrompu.".to_string(), None, None),
        (Trigger::Pending, true) => (
            format!("Accord nécessaire : {title}"),
            Some("high"),
            Some("warning"),
        ),
        (Trigger::Pending, false) => (
            "Votre accord est nécessaire.".to_string(),
            Some("high"),
            Some("warning"),
        ),
    };
    Some(Notification {
        title: "Atelier".into(),
        message,
        click: Some(format!(
            "atelier-native://thread/{}",
            encode_path_segment(&candidate.thread_id)
        )),
        priority,
        tags,
    })
}

fn display_title(title: Option<&str>) -> String {
    let collapsed = title
        .unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if collapsed.is_empty() {
        return "Sans titre".into();
    }
    let mut chars = collapsed.chars();
    let short: String = chars.by_ref().take(80).collect();
    if chars.next().is_some() {
        format!("{short}…")
    } else {
        short
    }
}

/// L'en-tête Click doit rester de l'ASCII visible : tout le reste est
/// encodé en %XX.
fn encode_path_segment(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~:".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// Ensemble borné des clés déjà alertées (les plus anciennes sortent).
pub struct Dedupe {
    seen: HashSet<String>,
    order: VecDeque<String>,
    capacity: usize,
}

impl Dedupe {
    pub fn new(capacity: usize) -> Self {
        Self {
            seen: HashSet::new(),
            order: VecDeque::new(),
            capacity: capacity.max(1),
        }
    }

    /// Vrai si la clé est nouvelle (elle est alors retenue).
    pub fn insert(&mut self, key: &str) -> bool {
        if self.seen.contains(key) {
            return false;
        }
        while self.order.len() >= self.capacity {
            if let Some(old) = self.order.pop_front() {
                self.seen.remove(&old);
            }
        }
        self.seen.insert(key.to_string());
        self.order.push_back(key.to_string());
        true
    }

    pub fn len(&self) -> usize {
        self.order.len()
    }

    pub fn is_empty(&self) -> bool {
        self.order.is_empty()
    }
}

// ----- inactivité du Mac -----

/// Extrait `"HIDIdleTime" = <ns>` d'une sortie `ioreg -c IOHIDSystem -d 4`.
pub fn parse_hid_idle(output: &str) -> Option<Duration> {
    output.lines().find_map(|line| {
        let (_, rest) = line.split_once("\"HIDIdleTime\"")?;
        let value = rest.trim_start().strip_prefix('=')?.trim();
        value.parse::<u64>().ok().map(Duration::from_nanos)
    })
}

/// Lecture inconnue (échec, autre OS) = absent : mieux vaut une alerte de
/// trop qu'un accord qui attend en silence.
pub fn is_away(idle: Option<Duration>) -> bool {
    idle.is_none_or(|idle| idle >= AWAY_AFTER)
}

async fn read_idle() -> Option<Duration> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let mut command = tokio::process::Command::new("/usr/sbin/ioreg");
    command
        .args(["-c", "IOHIDSystem", "-d", "4"])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true);
    let output = tokio::time::timeout(IDLE_PROBE_TIMEOUT, command.output())
        .await
        .ok()?
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_hid_idle(&String::from_utf8_lossy(&output.stdout))
}

/// Inactivité ≥ 2 min, lecture gardée 10 s (une rafale d'événements ne
/// lance qu'un seul `ioreg`).
pub async fn user_is_away() -> bool {
    static CACHE: std::sync::Mutex<Option<(Instant, bool)>> = std::sync::Mutex::new(None);
    let cached = *CACHE.lock().unwrap_or_else(|p| p.into_inner());
    if let Some((at, away)) = cached {
        if at.elapsed() < IDLE_CACHE {
            return away;
        }
    }
    let away = is_away(read_idle().await);
    *CACHE.lock().unwrap_or_else(|p| p.into_inner()) = Some((Instant::now(), away));
    away
}

// ----- envoi ntfy -----

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        // Alertes rares : aucune connexion gardée ouverte (et aucune liée à
        // un runtime tokio disparu).
        reqwest::Client::builder()
            .timeout(HTTP_TIMEOUT)
            .pool_max_idle_per_host(0)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// POST `{server}/{topic}` : corps = message, en-têtes ntfy Title/Click/
/// Priority/Tags. Toute réponse hors 2xx est une erreur.
pub async fn send(settings: &NotifySettings, notification: &Notification) -> Result<(), String> {
    let url = settings
        .subscribe_url()
        .ok_or_else(|| "aucun sujet ntfy".to_string())?;
    let mut request = http()
        .post(url)
        .header("Title", &notification.title)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(notification.message.clone());
    if let Some(click) = &notification.click {
        request = request.header("Click", click);
    }
    if let Some(priority) = notification.priority {
        request = request.header("Priority", priority);
    }
    if let Some(tags) = notification.tags {
        request = request.header("Tags", tags);
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("ntfy a répondu {}", response.status()))
    }
}

/// Alerte d'essai : envoyée tout de suite, Mac occupé ou non.
pub async fn send_test(settings: &NotifySettings) -> Result<(), String> {
    send(
        settings,
        &Notification {
            title: "Atelier".into(),
            message: TEST_MESSAGE.into(),
            click: None,
            priority: None,
            tags: None,
        },
    )
    .await
}

// ----- guetteur -----

type RuntimeSocket =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// Démarre le guetteur (une connexion au runtime, reconnectée de 1 s à
/// 30 s). Tourne tant que le processus vit ; `abort()` l'arrête.
pub fn spawn_watcher(state: GatewayState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(watch(state))
}

async fn watch(state: GatewayState) {
    let mut backoff = MIN_BACKOFF;
    let mut dedupe = Dedupe::new(DEDUPE_CAPACITY);
    loop {
        if let Some(socket) = connect(&state).await {
            let opened = Instant::now();
            pump(&state, socket, now_ms(), &mut dedupe).await;
            // Une connexion qui a tenu repart vite ; une qui tombe aussitôt
            // continue de reculer (runtime qui redémarre en boucle).
            if opened.elapsed() >= MAX_BACKOFF {
                backoff = MIN_BACKOFF;
            }
        }
        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

async fn connect(state: &GatewayState) -> Option<RuntimeSocket> {
    // Même chemin que les routes : un moteur relancé (nouveau port, nouveau
    // jeton) est retrouvé dans `sidecar.lock` au lieu de boucler sur l'ancien.
    let mut socket = tokio::time::timeout(Duration::from_secs(5), crate::routes::connect_upstream(state))
        .await
        .ok()?
        .ok()?;
    let hello = json!({"type":"clientHello","clientInstanceId":CLIENT_INSTANCE_ID});
    socket
        .send(Message::Text(hello.to_string().into()))
        .await
        .ok()?;
    Some(socket)
}

/// Le runtime ne rejoue rien sur `clientHello` : il ne relaie que les
/// trames publiées après l'abonnement. `is_stale` protège quand même d'un
/// rejeu futur.
async fn pump(state: &GatewayState, mut socket: RuntimeSocket, connected_at_ms: i64, dedupe: &mut Dedupe) {
    while let Some(frame) = socket.next().await {
        let text = match frame {
            Ok(Message::Text(text)) => text,
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(_) => continue,
        };
        // Filtre bon marché : la plupart des trames sont des deltas.
        let text = text.as_str();
        if !(text.contains("\"done\"") || text.contains("\"error\"") || text.contains("\"interaction\"")) {
            continue;
        }
        let Ok(frame) = serde_json::from_str::<Value>(text) else { continue };
        let Some(candidate) = candidate(&frame) else { continue };
        if is_stale(&frame, connected_at_ms) {
            continue;
        }
        if let Some(key) = &candidate.dedupe_key {
            if !dedupe.insert(key) {
                continue;
            }
        }
        // Jamais d'attente dans la boucle de lecture : un bus en retard
        // ferait tomber la connexion côté runtime.
        let state = state.clone();
        tokio::spawn(async move { deliver(&state, candidate, frame).await });
    }
    let _ = tokio::time::timeout(Duration::from_secs(1), socket.close(None)).await;
}

async fn deliver(state: &GatewayState, candidate: Candidate, frame: Value) {
    let path = settings_path(state).await;
    let settings = match tokio::task::spawn_blocking(move || NotifySettings::load(&path)).await {
        Ok(settings) => settings,
        Err(_) => return,
    };
    if !settings.enabled || settings.subscribe_url().is_none() {
        return;
    }
    if settings.only_when_away && !user_is_away().await {
        return;
    }
    let title = if settings.preview {
        thread_title(state, &candidate.thread_id).await
    } else {
        None
    };
    let Some(notification) = decide(&frame, title.as_deref(), &settings) else { return };
    if let Err(error) = send(&settings, &notification).await {
        tracing::warn!(%error, "alerte ntfy non envoyée");
    }
}

async fn thread_title(state: &GatewayState, thread_id: &str) -> Option<String> {
    let _ = state.refresh_catalog().await;
    let g = state.inner.lock().await;
    g.threads.get(thread_id).map(|thread| thread.title.clone())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enabled() -> NotifySettings {
        NotifySettings {
            enabled: true,
            server: "https://ntfy.example".into(),
            topic: Some("atelier-abc".into()),
            only_when_away: true,
            preview: false,
        }
    }

    fn frame(event: Value) -> Value {
        json!({"type":"event","threadId":"fil-1","event":event})
    }

    #[test]
    fn settings_default_and_persist_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        let loaded = NotifySettings::load(&path);
        assert!(!loaded.enabled);
        assert!(loaded.only_when_away);
        assert!(!loaded.preview);
        assert_eq!(loaded.topic, None);
        assert_eq!(loaded.subscribe_url(), None);

        let settings = apply_update(&path, &NotifyUpdate { enabled: Some(true), ..Default::default() }).unwrap();
        let topic = settings.topic.clone().unwrap();
        assert!(topic.starts_with("atelier-"));
        let suffix = &topic["atelier-".len()..];
        assert_eq!(suffix.len(), 24);
        assert!(suffix.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
        assert_eq!(settings.subscribe_url().unwrap(), format!("{}/{topic}", settings.server));
        assert_eq!(NotifySettings::load(&path), settings);
        // Pas de fichier temporaire laissé derrière.
        let entries: Vec<_> = std::fs::read_dir(dir.path()).unwrap().flatten().collect();
        assert_eq!(entries.len(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }

        // Désactiver puis réactiver garde le même sujet (l'abonnement ntfy
        // de l'iPhone reste valable).
        let off = apply_update(&path, &NotifyUpdate { enabled: Some(false), preview: Some(true), ..Default::default() }).unwrap();
        assert!(!off.enabled);
        assert!(off.preview);
        assert_eq!(off.topic.as_deref(), Some(topic.as_str()));
        let on = apply_update(&path, &NotifyUpdate { enabled: Some(true), only_when_away: Some(false), ..Default::default() }).unwrap();
        assert_eq!(on.topic.as_deref(), Some(topic.as_str()));
        assert!(!on.only_when_away);

        let json = on.to_json();
        assert_eq!(json["enabled"], true);
        assert_eq!(json["topic"], topic);
        assert_eq!(json["subscribeUrl"], format!("{}/{topic}", on.server));
        assert_eq!(json["onlyWhenAway"], false);
        assert_eq!(json["preview"], true);
    }

    #[test]
    fn corrupt_or_partial_settings_fall_back_to_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        std::fs::write(&path, "pas du json").unwrap();
        assert_eq!(NotifySettings::load(&path), NotifySettings::default());
        std::fs::write(&path, r#"{"enabled":true,"topic":"atelier-x"}"#).unwrap();
        let partial = NotifySettings::load(&path);
        assert!(partial.enabled);
        assert!(partial.only_when_away);
        assert_eq!(partial.server, default_server());
    }

    #[test]
    fn topics_are_unique() {
        let a = generate_topic();
        let b = generate_topic();
        assert_ne!(a, b);
        assert_eq!(a.len(), "atelier-".len() + 24);
    }

    #[test]
    fn test_request_creates_a_topic_without_enabling() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SETTINGS_FILE);
        let settings = apply_update(&path, &NotifyUpdate { test: Some(true), ..Default::default() }).unwrap();
        assert!(!settings.enabled);
        assert!(settings.topic.is_some());
    }

    #[test]
    fn done_error_and_pending_interaction_become_notifications() {
        let settings = enabled();
        let done = frame(json!({"kind":"done","ok":true,"meta":{"turnId":"t1","eventId":"e1"}}));
        let n = decide(&done, Some("Bilan de masse"), &settings).unwrap();
        assert_eq!(n.title, "Atelier");
        assert_eq!(n.message, "Un travail est terminé.");
        assert_eq!(n.click.as_deref(), Some("atelier-native://thread/fil-1"));
        assert_eq!(n.priority, None);

        let error = frame(json!({"kind":"error","message":"boom","meta":{"turnId":"t1"}}));
        assert_eq!(decide(&error, None, &settings).unwrap().message, "Un travail s'est interrompu.");

        let pending = frame(json!({"kind":"interaction","interactionType":"approval","state":"pending","requestId":"int-1"}));
        let n = decide(&pending, None, &settings).unwrap();
        assert_eq!(n.message, "Votre accord est nécessaire.");
        assert_eq!(n.priority, Some("high"));
        assert_eq!(n.tags, Some("warning"));

        let preview = NotifySettings { preview: true, ..enabled() };
        assert_eq!(decide(&done, Some("Bilan  de\nmasse"), &preview).unwrap().message, "Terminé : Bilan de masse");
        assert_eq!(decide(&error, Some("Bilan"), &preview).unwrap().message, "Interrompu : Bilan");
        assert_eq!(decide(&pending, Some("Bilan"), &preview).unwrap().message, "Accord nécessaire : Bilan");
        assert_eq!(decide(&done, None, &preview).unwrap().message, "Terminé : Sans titre");
        let long = "x".repeat(200);
        assert!(decide(&done, Some(&long), &preview).unwrap().message.ends_with('…'));
    }

    #[test]
    fn nothing_is_sent_when_disabled_or_for_irrelevant_events() {
        let done = frame(json!({"kind":"done","meta":{"turnId":"t1"}}));
        assert!(decide(&done, None, &NotifySettings { enabled: false, ..enabled() }).is_none());
        assert!(decide(&done, None, &NotifySettings { topic: None, ..enabled() }).is_none());
        let settings = enabled();
        for event in [
            json!({"kind":"delta","text":"done"}),
            json!({"kind":"interaction","state":"answered","requestId":"int-1"}),
            json!({"kind":"interaction","state":"expired","requestId":"int-1"}),
            // Stop demandé : l'utilisateur le sait déjà.
            json!({"kind":"error","message":"interrupted","meta":{"turnId":"t1"}}),
            // Erreur hors tour.
            json!({"kind":"error","message":"boom"}),
        ] {
            assert!(decide(&frame(event.clone()), None, &settings).is_none(), "{event}");
        }
        assert!(decide(&json!({"type":"threads","threads":[]}), None, &settings).is_none());
        assert!(decide(&json!({"type":"qaEvent","event":{"kind":"done"}}), None, &settings).is_none());
        assert!(decide(&json!({"type":"event","threadId":"","event":{"kind":"done"}}), None, &settings).is_none());
    }

    #[test]
    fn dedupe_keys_follow_turns_and_requests() {
        let key = |event: Value| candidate(&frame(event)).and_then(|c| c.dedupe_key);
        // done et error d'un même tour : une seule alerte.
        assert_eq!(key(json!({"kind":"done","meta":{"turnId":"t1","eventId":"a"}})).unwrap(), "turn:fil-1:t1");
        assert_eq!(key(json!({"kind":"error","message":"x","meta":{"turnId":"t1","eventId":"b"}})).unwrap(), "turn:fil-1:t1");
        assert_eq!(key(json!({"kind":"done","meta":{"eventId":"e9"}})).unwrap(), "event:fil-1:e9");
        assert_eq!(key(json!({"kind":"done"})), None);
        assert_eq!(key(json!({"kind":"interaction","state":"pending","requestId":"int-7"})).unwrap(), "interaction:fil-1:int-7");

        let mut dedupe = Dedupe::new(3);
        assert!(dedupe.insert("a"));
        assert!(!dedupe.insert("a"));
        assert!(dedupe.insert("b"));
        assert!(dedupe.insert("c"));
        assert!(dedupe.insert("d"));
        assert_eq!(dedupe.len(), 3);
        // « a » est sorti de la fenêtre bornée.
        assert!(dedupe.insert("a"));
        assert!(!dedupe.insert("d"));
    }

    #[test]
    fn replayed_events_are_stale() {
        let now = 1_700_000_000_000i64;
        assert!(is_stale(&frame(json!({"kind":"done","meta":{"ts":now - 60_000}})), now));
        assert!(!is_stale(&frame(json!({"kind":"done","meta":{"ts":now - 1_000}})), now));
        assert!(!is_stale(&frame(json!({"kind":"done","meta":{"ts":now + 10}})), now));
        assert!(!is_stale(&frame(json!({"kind":"done"})), now));
    }

    #[test]
    fn click_link_is_ascii_safe() {
        let n = decide(
            &json!({"type":"event","threadId":"fil é/1","event":{"kind":"done","meta":{"turnId":"t"}}}),
            None,
            &enabled(),
        )
        .unwrap();
        assert_eq!(n.click.as_deref(), Some("atelier-native://thread/fil%20%C3%A9%2F1"));
    }

    #[test]
    fn parses_ioreg_idle_time() {
        let sample = r#"+-o Root  <class IORegistryEntry, id 0x100000100, retain 29>
  +-o J314sAP  <class IOPlatformExpertDevice, id 0x100000110, registered, matched, active, busy 0 (1051 ms), retain 44>
    +-o AppleARMPE  <class AppleARMPE, id 0x100000111, registered, matched, active, busy 0 (1043 ms), retain 23>
      +-o IOHIDSystem  <class IOHIDSystem, id 0x1000004d1, registered, matched, active, busy 0 (0 ms), retain 38>
          {
            "HIDParameters" = {"HIDClickTime"=500000000,"HIDKeyRepeat"=83333333}
            "HIDIdleTime" = 187654321000
            "HIDScrollCountIgnoreMomentumScrolls" = Yes
          }
"#;
        assert_eq!(parse_hid_idle(sample), Some(Duration::from_nanos(187_654_321_000)));
        assert!(is_away(parse_hid_idle(sample)));
        assert!(!is_away(Some(Duration::from_secs(30))));
        assert!(is_away(Some(AWAY_AFTER)));
        assert!(is_away(None));
        assert_eq!(parse_hid_idle("\"HIDIdleTime\" = oops"), None);
        assert_eq!(parse_hid_idle(""), None);
    }

    #[test]
    fn watcher_never_claims_the_runtime_client_role() {
        // Même règle que ws_router « clientHello » : hex/tirets, 20+ car.
        let claims = CLIENT_INSTANCE_ID.len() >= 20
            && CLIENT_INSTANCE_ID.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
        assert!(!claims);
    }
}
