//! Calculs lancés par l'agent (plan rattrapage-claude-science, chantier 4).
//!
//! L'agent PROPOSE une tâche avec l'outil `atelier_compute` ; une carte
//! « Lancer / Refuser » apparaît dans le fil avec l'hôte, le script et le
//! coût estimé. Rien ne part avant le clic, sauf pour un hôte que
//! l'utilisateur a réglé sur « Lancer sans demander » (case de la carte ou
//! Calculs › Hôtes). Ensuite :
//! - la tâche est soumise (`atelier_workspace::compute_submit`) et apparaît
//!   dans Calculs comme n'importe quel run ;
//! - un guetteur la sonde jusqu'à sa fin et met la carte à jour ; la fin
//!   déclenche aussi l'alerte ntfy de l'iPhone (atelier-remote) ;
//! - Annuler passe par la carte, avec confirmation. Rien n'est supprimé.
//!
//! La carte et ses mises à jour sont UN événement `compute_job` par tâche,
//! réémis à chaque changement d'état et fusionné par `jobId` côté front
//! (même compactage que `agent_message`). Le registre des tâches vit dans
//! `compute_jobs.json` ; le serveur en est le seul écrivain.

use crate::state::AppState;
use crate::ws_router::json_msg;
use atelier_workspace::compute_hosts::{import_claude_science_sheets, HostBook};
use atelier_workspace::compute_submit::{self as submit, Estimate, JobSpec, Launched, Target};
use atelier_workspace::{
    ComputeConfig, ComputeHostError, ComputeRunState, Exec, NarvalProfile, SystemExec,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use uuid::Uuid;

pub const REGISTRY_FILE: &str = "compute_jobs.json";
const REGISTRY_MAX: usize = 300;
const PURPOSE_MAX: usize = 400;
const TICK: Duration = Duration::from_secs(15);
const BACKOFF_MAX: Duration = Duration::from_secs(30 * 60);

/// Un seul écrivain à la fois pour le registre et le carnet des hôtes.
static REGISTRY_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Proposed,
    Launching,
    Queued,
    Running,
    Completed,
    Failed,
    Refused,
    LaunchFailed,
    Cancelled,
}

impl JobStatus {
    pub fn is_live(self) -> bool {
        matches!(self, JobStatus::Queued | JobStatus::Running)
    }

    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            JobStatus::Completed
                | JobStatus::Failed
                | JobStatus::Refused
                | JobStatus::LaunchFailed
                | JobStatus::Cancelled
        )
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String,
    pub thread_id: String,
    #[serde(default)]
    pub turn_id: Option<String>,
    pub spec: JobSpec,
    #[serde(default)]
    pub estimate: Estimate,
    /// Une phrase de l'agent : pourquoi cette tâche.
    #[serde(default)]
    pub purpose: String,
    pub status: JobStatus,
    /// Lancée sans clic, par le réglage « Lancer sans demander ».
    #[serde(default)]
    pub auto: bool,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub launched: Option<Launched>,
    #[serde(default)]
    pub exit_code: Option<i32>,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Registry {
    jobs: Vec<JobRecord>,
}

fn registry_path(app_dir: &Path) -> std::path::PathBuf {
    app_dir.join(REGISTRY_FILE)
}

fn load(app_dir: &Path) -> Registry {
    std::fs::read_to_string(registry_path(app_dir))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save(app_dir: &Path, registry: &mut Registry) {
    // Plafond : on oublie d'abord les plus anciennes tâches terminées.
    while registry.jobs.len() > REGISTRY_MAX {
        match registry.jobs.iter().position(|j| j.status.is_terminal()) {
            Some(index) => {
                registry.jobs.remove(index);
            }
            None => break,
        }
    }
    let path = registry_path(app_dir);
    let tmp = path.with_extension("json.tmp");
    let written = std::fs::create_dir_all(app_dir)
        .and_then(|_| std::fs::write(&tmp, serde_json::to_vec_pretty(registry).unwrap_or_default()))
        .and_then(|_| std::fs::rename(&tmp, &path));
    if let Err(error) = written {
        tracing::warn!(%error, "registre des calculs non écrit");
    }
}

/// Ce qu'il faut pour toucher les hôtes. Production : réglages courants,
/// vrai ssh ; les tests passent un exécuteur factice.
#[derive(Clone)]
pub struct Backend {
    pub cfg: ComputeConfig,
    pub exec: Arc<dyn Exec>,
    pub clusters: Arc<dyn Fn(Target) -> Result<NarvalProfile, ComputeHostError> + Send + Sync>,
}

impl Backend {
    pub fn production() -> Self {
        Self {
            cfg: ComputeConfig::default(),
            exec: Arc::new(SystemExec),
            clusters: Arc::new(submit::resolve_cluster),
        }
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Événement du fil. `full` = première émission (la carte) : elle porte la
/// demande complète ; les suivantes n'apportent que l'état, fusionné par
/// `jobId` dans la rangée d'origine.
pub fn job_event(job: &JobRecord, full: bool, sequence: u64) -> Value {
    let ts = now_ms();
    let mut event = json!({
        "kind": "compute_job",
        "jobId": job.id,
        "status": job.status,
        "auto": job.auto,
        "updatedAt": job.updated_at,
        "runId": job.launched.as_ref().map(|l| l.run_id.clone()),
        "remoteId": job.launched.as_ref().map(|l| l.remote_id.clone()),
        "logPath": job.launched.as_ref().and_then(|l| l.log_path.clone()),
        "exitCode": job.exit_code,
        "message": job.message,
        "ts": ts,
        "meta": {
            "threadId": job.thread_id,
            "sequence": sequence,
            "eventId": Uuid::new_v4().to_string(),
            "ts": ts,
            // Même raison que les widgets : sans turnId, la carte ouvrirait
            // un tour fantôme après le tour en cours.
            "turnId": job.turn_id,
        }
    });
    if full {
        event["job"] = json!({
            "host": job.spec.host,
            "hostLabel": job.spec.host.label(),
            "label": job.spec.label,
            "workDir": job.spec.work_dir,
            "script": job.spec.script,
            "resources": job.spec.resources,
            "estimate": job.estimate,
            "purpose": job.purpose,
        });
    }
    event
}

fn emit(state: &AppState, job: &JobRecord, full: bool) {
    let sequence = state.journal().next_sequence(&job.thread_id);
    let event = job_event(job, full, sequence);
    let _ = state.journal().append(&event);
    state.publish(json_msg(json!({
        "type": "event",
        "threadId": job.thread_id,
        "event": event,
    })));
}

/// Applique `change` à la tâche `id` sous verrou, enregistre, émet la mise
/// à jour. Rend la tâche modifiée, ou `None` si `change` refuse (`false`).
async fn update_job(
    state: &AppState,
    id: &str,
    change: impl FnOnce(&mut JobRecord) -> bool,
) -> Option<JobRecord> {
    let _guard = REGISTRY_LOCK.lock().await;
    let mut registry = load(state.app_dir());
    let job = registry.jobs.iter_mut().find(|j| j.id == id)?;
    if !change(job) {
        return None;
    }
    job.updated_at = atelier_store::iso_now();
    let job = job.clone();
    save(state.app_dir(), &mut registry);
    drop(_guard);
    emit(state, &job, false);
    Some(job)
}

fn host_error(error: ComputeHostError) -> String {
    format!("{}: {}", error.code, error.message)
}

fn configured(backend: &Backend, host: Target) -> bool {
    match host {
        Target::Mac => true,
        Target::Nas => backend.cfg.nas_alias.is_some(),
        Target::Narval | Target::Rorqual => (backend.clusters)(host).is_ok(),
    }
}

// ---- actions de l'agent (outil atelier_compute) ---------------------------

pub fn action_hosts(state: &AppState, backend: &Backend) -> Value {
    let book = HostBook::load(state.app_dir());
    let hosts: Vec<Value> = Target::ALL
        .iter()
        .map(|&host| {
            let sheet = book.sheet(host);
            json!({
                "host": host,
                "label": host.label(),
                "configured": configured(backend, host),
                "scheduler": if host.is_slurm() { "slurm" } else { "none" },
                "hasNotes": !sheet.notes.is_empty(),
                "launchWithoutAsking": sheet.auto_launch,
            })
        })
        .collect();
    json!({
        "hosts": hosts,
        "note": "Call action host for the full notes of the host you target before writing the script. An unconfigured host cannot run anything until the user sets it in Settings › Integrations."
    })
}

pub fn action_host(state: &AppState, backend: &Backend, req: &Value) -> Result<Value, String> {
    let raw = req.get("host").and_then(Value::as_str).unwrap_or("");
    let host = Target::parse(raw).ok_or("invalid_host: mac, nas, narval or rorqual")?;
    let sheet = HostBook::load(state.app_dir()).sheet(host);
    Ok(json!({
        "host": host,
        "label": host.label(),
        "configured": configured(backend, host),
        "notes": if sheet.notes.is_empty() { "No notes for this host yet.".to_string() } else { sheet.notes },
        "notesSource": sheet.source,
        "launchWithoutAsking": sheet.auto_launch,
        "workDirRule": if host.is_slurm() {
            "absolute path under /home, /project or /scratch"
        } else {
            "absolute path or ~/…"
        },
    }))
}

pub async fn action_propose_job(
    state: &AppState,
    backend: &Backend,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let spec = submit::validate(req).map_err(host_error)?;
    if !configured(backend, spec.host) {
        return Err(format!(
            "host_not_configured: {} is not set in Settings › Integrations; tell the user",
            spec.host.label()
        ));
    }
    let turn_id = state.capabilities().lock().await.turn_id_of(caller_id);
    let purpose: String = req
        .get("purpose")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .chars()
        .filter(|c| !c.is_control())
        .take(PURPOSE_MAX)
        .collect();
    let auto = HostBook::load(state.app_dir()).auto_launch(spec.host);
    let now = atelier_store::iso_now();
    let job = JobRecord {
        id: submit::new_job_id(),
        thread_id: caller_id.to_string(),
        turn_id,
        estimate: submit::estimate(&spec),
        spec,
        purpose,
        status: if auto { JobStatus::Launching } else { JobStatus::Proposed },
        auto,
        created_at: now.clone(),
        updated_at: now,
        launched: None,
        exit_code: None,
        message: None,
    };
    {
        let _guard = REGISTRY_LOCK.lock().await;
        let mut registry = load(state.app_dir());
        registry.jobs.push(job.clone());
        save(state.app_dir(), &mut registry);
    }
    emit(state, &job, true);
    if auto {
        // En arrière-plan comme après un clic : l'agent n'attend pas le ssh.
        let (state, backend, id) = (state.clone(), backend.clone(), job.id.clone());
        tokio::spawn(async move { launch(&state, &backend, &id).await });
    }
    Ok(json!({
        "ok": true,
        "jobId": job.id,
        "status": if auto { "launching" } else { "proposed" },
        "note": if auto {
            "The user set this host to launch without asking: the job is being submitted. Do not wait in a loop; check with action job_status in a later turn."
        } else {
            "A card with the script and the estimated cost is shown in the conversation. Nothing runs until the user clicks Launch. Do not repeat the script in your reply and do not wait in a loop."
        },
    }))
}

pub async fn action_job_status(
    state: &AppState,
    backend: &Backend,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let wanted = req.get("jobId").and_then(Value::as_str).unwrap_or("");
    let registry = load(state.app_dir());
    let jobs: Vec<&JobRecord> = registry
        .jobs
        .iter()
        .filter(|j| j.thread_id == caller_id && (wanted.is_empty() || j.id == wanted))
        .collect();
    if !wanted.is_empty() && jobs.is_empty() {
        return Err("unknown_job".into());
    }
    let mut out = Vec::new();
    for job in jobs.iter().rev().take(10) {
        let mut entry = json!({
            "jobId": job.id,
            "host": job.spec.host,
            "label": job.spec.label,
            "status": job.status,
            "exitCode": job.exit_code,
            "message": job.message,
            "runId": job.launched.as_ref().map(|l| l.run_id.clone()),
            "logPath": job.launched.as_ref().and_then(|l| l.log_path.clone()),
            "updatedAt": job.updated_at,
        });
        // Fin du journal pour la tâche demandée explicitement.
        if !wanted.is_empty() {
            if let Some(launched) = job.launched.clone() {
                let backend = backend.clone();
                let host = job.spec.host;
                let tail = tokio::task::spawn_blocking(move || log_tail(&backend, host, &launched))
                    .await
                    .ok()
                    .flatten();
                entry["logTail"] = json!(tail);
            }
        }
        out.push(entry);
    }
    Ok(json!({ "jobs": out }))
}

fn log_tail(backend: &Backend, host: Target, launched: &Launched) -> Option<Vec<String>> {
    if host.is_slurm() {
        let path = launched.log_path.as_deref()?;
        let text = atelier_workspace::narval_read_text(host.as_str(), path, 40).ok()?;
        return Some(text.content.lines().map(str::to_string).collect());
    }
    atelier_workspace::compute_read_log(&backend.cfg, &launched.run_id, 40, backend.exec.as_ref())
        .ok()
        .map(|chunk| chunk.lines)
}

// ---- décisions de l'utilisateur (carte du fil) ---------------------------

/// Soumission effective : `launching` → `queued` (ou `launch_failed`, avec
/// le message de l'hôte, sans nouvel essai).
async fn launch(state: &AppState, backend: &Backend, id: &str) {
    let Some(job) = load(state.app_dir()).jobs.into_iter().find(|j| j.id == id) else {
        return;
    };
    let backend_for_call = backend.clone();
    let spec = job.spec.clone();
    let job_id = job.id.clone();
    let result = tokio::task::spawn_blocking(move || {
        let b = backend_for_call;
        submit::submit(&b.cfg, &spec, &job_id, b.exec.as_ref(), &*b.clusters)
    })
    .await
    .unwrap_or_else(|_| Err(ComputeHostError::new("", "internal", "soumission interrompue")));
    update_job(state, id, |job| {
        if job.status != JobStatus::Launching {
            return false;
        }
        match result {
            Ok(launched) => {
                job.status = JobStatus::Queued;
                job.launched = Some(launched);
                job.message = None;
            }
            Err(error) => {
                job.status = JobStatus::LaunchFailed;
                job.message = Some(error.message);
            }
        }
        true
    })
    .await;
}

/// `decision` : `launch`, `refuse` ou `cancel`. `always` (avec `launch`)
/// règle l'hôte sur « Lancer sans demander ».
pub async fn decide(
    state: &AppState,
    backend: &Backend,
    id: &str,
    decision: &str,
    always: bool,
) -> Result<JobStatus, String> {
    match decision {
        "launch" => {
            let job = update_job(state, id, |job| {
                if job.status != JobStatus::Proposed {
                    return false;
                }
                job.status = JobStatus::Launching;
                true
            })
            .await
            .ok_or("job_not_pending")?;
            if always {
                let _guard = REGISTRY_LOCK.lock().await;
                let mut book = HostBook::load(state.app_dir());
                book.set_auto_launch(job.spec.host, true);
                let _ = book.save(state.app_dir());
            }
            let (state, backend, id) = (state.clone(), backend.clone(), id.to_string());
            tokio::spawn(async move { launch(&state, &backend, &id).await });
            Ok(JobStatus::Launching)
        }
        "refuse" => update_job(state, id, |job| {
            if job.status != JobStatus::Proposed {
                return false;
            }
            job.status = JobStatus::Refused;
            true
        })
        .await
        .map(|job| job.status)
        .ok_or_else(|| "job_not_pending".to_string()),
        "cancel" => {
            let job = load(state.app_dir())
                .jobs
                .into_iter()
                .find(|j| j.id == id)
                .filter(|j| j.status.is_live())
                .ok_or("job_not_running")?;
            let launched = job.launched.clone().ok_or("job_not_running")?;
            let b = backend.clone();
            let host = job.spec.host;
            let result = tokio::task::spawn_blocking(move || {
                submit::cancel(&b.cfg, host, &launched, b.exec.as_ref(), &*b.clusters)
            })
            .await
            .unwrap_or_else(|_| Err(ComputeHostError::new("", "internal", "annulation interrompue")));
            match result {
                Ok(()) => update_job(state, id, |job| {
                    if !job.status.is_live() {
                        return false;
                    }
                    job.status = JobStatus::Cancelled;
                    job.message = None;
                    true
                })
                .await
                .map(|job| job.status)
                .ok_or_else(|| "job_not_running".to_string()),
                Err(error) => {
                    let message = error.message.clone();
                    update_job(state, id, |job| {
                        job.message = Some(format!("annulation impossible : {message}"));
                        true
                    })
                    .await;
                    Err(host_error(error))
                }
            }
        }
        _ => Err("unknown_decision".into()),
    }
}

// ---- guetteur -------------------------------------------------------------

fn poll_interval(host: Target) -> Duration {
    match host {
        Target::Mac => Duration::from_secs(15),
        Target::Nas => Duration::from_secs(60),
        Target::Narval | Target::Rorqual => Duration::from_secs(120),
    }
}

#[derive(Default)]
pub struct Schedule {
    next: HashMap<String, (Instant, u32)>,
}

/// Un passage du guetteur : sonde les tâches vivantes dont c'est l'heure.
/// Un hôte injoignable allonge le délai (jusqu'à 30 min) et le dit une
/// fois sur la carte, sans jamais passer la tâche en échec.
pub async fn poll_once(state: &AppState, backend: &Backend, schedule: &mut Schedule) {
    let live: Vec<JobRecord> = load(state.app_dir())
        .jobs
        .into_iter()
        .filter(|j| j.status.is_live() && j.launched.is_some())
        .collect();
    schedule.next.retain(|id, _| live.iter().any(|j| &j.id == id));
    let now = Instant::now();
    for job in live {
        let (due, failures) = schedule.next.get(&job.id).copied().unwrap_or((now, 0));
        if due > now {
            continue;
        }
        let host = job.spec.host;
        let launched = job.launched.clone().expect("filtré plus haut");
        let b = backend.clone();
        let result = tokio::task::spawn_blocking(move || {
            submit::poll(&b.cfg, host, &launched, b.exec.as_ref(), &*b.clusters)
        })
        .await
        .unwrap_or_else(|_| Err(ComputeHostError::new("", "internal", "sonde interrompue")));
        match result {
            Ok(status) => {
                schedule.next.insert(job.id.clone(), (now + poll_interval(host), 0));
                let next = match status.state {
                    ComputeRunState::Queued => JobStatus::Queued,
                    ComputeRunState::Running => JobStatus::Running,
                    ComputeRunState::Completed => JobStatus::Completed,
                    ComputeRunState::Failed => JobStatus::Failed,
                    ComputeRunState::Unknown => job.status,
                };
                let message = status.detail.clone();
                if next != job.status || job.message != message || job.exit_code != status.exit_code {
                    update_job(state, &job.id, |record| {
                        if !record.status.is_live() {
                            return false; // annulée entre-temps
                        }
                        record.status = next;
                        record.exit_code = status.exit_code;
                        record.message = message;
                        true
                    })
                    .await;
                }
            }
            Err(error) => {
                let failures = failures + 1;
                let delay = (poll_interval(host) * 2u32.saturating_pow(failures.min(5))).min(BACKOFF_MAX);
                schedule.next.insert(job.id.clone(), (now + delay, failures));
                let message = format!("suivi en pause : {}", error.message);
                if job.message.as_deref() != Some(message.as_str()) {
                    update_job(state, &job.id, |record| {
                        record.message = Some(message);
                        true
                    })
                    .await;
                }
            }
        }
    }
}

/// Au démarrage : une soumission coupée par un arrêt du serveur ne sera pas
/// reprise en cachette ; elle est marquée et la carte le dit.
pub async fn recover(state: &AppState) {
    let stuck: Vec<String> = load(state.app_dir())
        .jobs
        .into_iter()
        .filter(|j| j.status == JobStatus::Launching)
        .map(|j| j.id)
        .collect();
    for id in stuck {
        update_job(state, &id, |job| {
            job.status = JobStatus::LaunchFailed;
            job.message = Some("soumission interrompue par un redémarrage d'Atelier : vérifie dans Calculs avant de relancer".into());
            true
        })
        .await;
    }
}

pub fn spawn_watcher(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        recover(&state).await;
        let mut schedule = Schedule::default();
        let mut tick = tokio::time::interval(TICK);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            // Réglages relus à chaque passage : un hôte réglé entre-temps
            // s'applique sans redémarrer.
            poll_once(&state, &Backend::production(), &mut schedule).await;
        }
    })
}

// ---- fiches d'hôte (Calculs › Hôtes) -------------------------------------

pub fn hosts_payload(state: &AppState, backend: &Backend) -> Value {
    let book = HostBook::load(state.app_dir());
    let hosts: Vec<Value> = Target::ALL
        .iter()
        .map(|&host| {
            let sheet = book.sheet(host);
            json!({
                "host": host,
                "label": host.label(),
                "configured": configured(backend, host),
                "notes": sheet.notes,
                "source": sheet.source,
                "updatedAt": sheet.updated_at,
                "autoLaunch": sheet.auto_launch,
            })
        })
        .collect();
    json!({ "hosts": hosts })
}

/// `{host, notes?, autoLaunch?}` : seuls les champs présents changent.
pub async fn save_host(state: &AppState, req: &Value) -> Result<(), String> {
    let raw = req.get("host").and_then(Value::as_str).unwrap_or("");
    let host = Target::parse(raw).ok_or("hôte inconnu")?;
    let _guard = REGISTRY_LOCK.lock().await;
    let mut book = HostBook::load(state.app_dir());
    if let Some(notes) = req.get("notes").and_then(Value::as_str) {
        book.set_notes(host, notes, None, &atelier_store::iso_now());
    }
    if let Some(on) = req.get("autoLaunch").and_then(Value::as_bool) {
        book.set_auto_launch(host, on);
    }
    book.save(state.app_dir()).map_err(|e| e.to_string())
}

/// Import des fiches de Claude Science (lecture seule de sa base). Rend les
/// hôtes importés.
pub async fn import_hosts(state: &AppState, home: std::path::PathBuf) -> Result<Vec<String>, String> {
    let sheets = tokio::task::spawn_blocking(move || import_claude_science_sheets(&home))
        .await
        .map_err(|e| e.to_string())??;
    let _guard = REGISTRY_LOCK.lock().await;
    let mut book = HostBook::load(state.app_dir());
    let now = atelier_store::iso_now();
    for sheet in &sheets {
        book.set_notes(sheet.host, &sheet.notes, Some(format!("claude-science:{}", sheet.name)), &now);
    }
    book.save(state.app_dir()).map_err(|e| e.to_string())?;
    Ok(sheets.iter().map(|s| s.host.as_str().to_string()).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use atelier_workspace::{ComputeExecError, ComputeOutput};

    /// Exécuteur factice : répond selon un motif, garde la trace des appels.
    #[derive(Default)]
    struct Fake {
        rules: Vec<(String, Result<ComputeOutput, ComputeExecError>)>,
        calls: std::sync::Mutex<Vec<String>>,
    }

    impl Fake {
        fn on(mut self, pattern: &str, out: Result<ComputeOutput, ComputeExecError>) -> Self {
            self.rules.push((pattern.into(), out));
            self
        }
        fn calls(&self) -> Vec<String> {
            self.calls.lock().unwrap().clone()
        }
    }

    impl Exec for Fake {
        fn run(&self, program: &str, args: &[&str], _: Duration) -> Result<ComputeOutput, ComputeExecError> {
            let line = std::iter::once(program).chain(args.iter().copied()).collect::<Vec<_>>().join(" ");
            self.calls.lock().unwrap().push(line.clone());
            self.rules
                .iter()
                .find(|(p, _)| line.contains(p.as_str()))
                .map(|(_, r)| r.clone())
                .unwrap_or_else(|| Err(ComputeExecError { code: "command_failed".into(), message: format!("pas de règle : {line}") }))
        }
        fn spawn_detached(&self, program: &str, args: &[&str], _: &Path) -> Result<u32, ComputeExecError> {
            self.calls.lock().unwrap().push(format!("detached {program} {}", args.join(" ")));
            Ok(7)
        }
    }

    async fn test_state() -> (AppState, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let paths = crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf());
        let state = AppState::new(paths, None, "2026-01-01T00:00:00.000Z".into(), "0.1.0".into(), "h".into(), "/tmp/server".into());
        state.set_port(9).await;
        state.capabilities().lock().await.issue("t1", "/tmp/proj", "claude", None, Some("turn-3".into()));
        (state, dir)
    }

    fn backend(dir: &Path, fake: Arc<Fake>) -> Backend {
        Backend {
            cfg: ComputeConfig {
                runs_dir: dir.join("runs"),
                nas_alias: Some("nas".into()),
                nas_excluded: vec![],
                slurm_profile: "narval".into(),
                slurm_enabled: true,
            },
            exec: fake,
            clusters: Arc::new(|host: Target| {
                if host == Target::Rorqual {
                    return Err(ComputeHostError::new("rorqual", "not_configured", "non configurée"));
                }
                Ok(NarvalProfile {
                    id: "narval".into(),
                    host: "narval".into(),
                    gateway: Some("nas".into()),
                    roots: vec!["/scratch".into()],
                })
            }),
        }
    }

    fn narval_job() -> Value {
        json!({"host":"narval","label":"fit M42","workDir":"/scratch/u/m42","script":"python fit.py",
               "purpose":"Ajuster le modèle M42 sur toutes les régions",
               "resources":{"cpus":8,"time":"1:30:00"}})
    }

    fn events(state: &AppState) -> Vec<Value> {
        state.journal().materialize("t1").into_iter().filter(|e| e["kind"] == "compute_job").collect()
    }

    async fn settle(state: &AppState, id: &str) -> JobRecord {
        for _ in 0..200 {
            let job = load(state.app_dir()).jobs.into_iter().find(|j| j.id == id).unwrap();
            if job.status != JobStatus::Launching {
                return job;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("soumission jamais terminée");
    }

    #[tokio::test]
    async fn rien_ne_part_avant_le_clic_puis_lancer_soumet_par_le_relais() {
        let (state, dir) = test_state().await;
        let fake = Arc::new(Fake::default().on("sbatch", Ok(ComputeOutput::ok("65700999\n"))));
        let b = backend(dir.path(), fake.clone());
        let out = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap();
        assert_eq!(out["status"], "proposed");
        let id = out["jobId"].as_str().unwrap().to_string();
        assert!(fake.calls().is_empty(), "aucun ssh avant le clic");
        let card = &events(&state)[0];
        assert_eq!(card["status"], "proposed");
        assert_eq!(card["meta"]["turnId"], "turn-3");
        assert_eq!(card["job"]["script"], "python fit.py");
        assert_eq!(card["job"]["estimate"]["cpuHours"], 12.0, "8 cœurs × 1,5 h");
        assert_eq!(card["job"]["purpose"], "Ajuster le modèle M42 sur toutes les régions");

        assert_eq!(decide(&state, &b, &id, "launch", false).await.unwrap(), JobStatus::Launching);
        let job = settle(&state, &id).await;
        assert_eq!(job.status, JobStatus::Queued);
        assert_eq!(job.launched.as_ref().unwrap().run_id, "slurm:65700999");
        assert_eq!(fake.calls().len(), 1);
        assert!(fake.calls()[0].contains(" -- nas ssh "));
        // un second clic ne relance rien
        assert_eq!(decide(&state, &b, &id, "launch", false).await.unwrap_err(), "job_not_pending");
        assert_eq!(fake.calls().len(), 1);
        let evs = events(&state);
        let last = evs.last().unwrap();
        assert_eq!(last["status"], "queued");
        assert_eq!(last["runId"], "slurm:65700999");
        assert!(last.get("job").is_none(), "une mise à jour ne recopie pas le script");
        assert!(evs.iter().all(|e| e["jobId"] == id.as_str()));
        assert!(!HostBook::load(state.app_dir()).auto_launch(Target::Narval));
    }

    #[tokio::test]
    async fn refuser_ferme_la_carte_et_un_hote_non_regle_est_refuse_a_l_agent() {
        let (state, dir) = test_state().await;
        let fake = Arc::new(Fake::default());
        let b = backend(dir.path(), fake.clone());
        let id = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap()["jobId"].as_str().unwrap().to_string();
        assert_eq!(decide(&state, &b, &id, "refuse", false).await.unwrap(), JobStatus::Refused);
        assert_eq!(decide(&state, &b, &id, "launch", false).await.unwrap_err(), "job_not_pending");
        assert!(fake.calls().is_empty());
        let mut rorqual = narval_job();
        rorqual["host"] = json!("rorqual");
        let err = action_propose_job(&state, &b, "t1", &rorqual).await.unwrap_err();
        assert!(err.starts_with("host_not_configured"), "{err}");
        let err = action_propose_job(&state, &b, "t1", &json!({"host":"narval","script":"x","workDir":"/scratch/a"})).await.unwrap_err();
        assert!(err.contains("time requis"), "{err}");
    }

    #[tokio::test]
    async fn toujours_pour_cet_hote_lance_la_suivante_sans_carte_a_cliquer() {
        let (state, dir) = test_state().await;
        let fake = Arc::new(Fake::default().on("sbatch", Ok(ComputeOutput::ok("1\n"))).on("::LAUNCHED", Ok(ComputeOutput::ok("::LAUNCHED 9\n"))));
        let b = backend(dir.path(), fake.clone());
        let id = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap()["jobId"].as_str().unwrap().to_string();
        decide(&state, &b, &id, "launch", true).await.unwrap();
        settle(&state, &id).await;
        assert!(HostBook::load(state.app_dir()).auto_launch(Target::Narval));
        let out = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap();
        assert_eq!(out["status"], "launching");
        let second = settle(&state, out["jobId"].as_str().unwrap()).await;
        assert!(second.auto);
        assert_eq!(second.status, JobStatus::Queued);
        // le NAS, lui, demande toujours
        let nas = json!({"host":"nas","workDir":"~/a","script":"echo"});
        assert_eq!(action_propose_job(&state, &b, "t1", &nas).await.unwrap()["status"], "proposed");
    }

    #[tokio::test]
    async fn un_echec_de_soumission_est_dit_sur_la_carte_sans_nouvel_essai() {
        let (state, dir) = test_state().await;
        let fake = Arc::new(Fake::default().on("ssh", Ok(ComputeOutput::failed(255, "Permission denied (keyboard-interactive)"))));
        let b = backend(dir.path(), fake.clone());
        let id = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap()["jobId"].as_str().unwrap().to_string();
        decide(&state, &b, &id, "launch", false).await.unwrap();
        let job = settle(&state, &id).await;
        assert_eq!(job.status, JobStatus::LaunchFailed);
        assert!(job.message.unwrap().contains("Duo"));
        let mut schedule = Schedule::default();
        poll_once(&state, &b, &mut schedule).await;
        assert_eq!(fake.calls().len(), 1, "aucun nouvel essai, aucune sonde");
    }

    #[tokio::test]
    async fn le_guetteur_suit_la_tache_jusqu_a_la_fin_et_patiente_quand_l_hote_tombe() {
        let (state, dir) = test_state().await;
        let launch = Arc::new(Fake::default().on("sbatch", Ok(ComputeOutput::ok("42\n"))));
        let id = action_propose_job(&state, &backend(dir.path(), launch.clone()), "t1", &narval_job()).await.unwrap()["jobId"].as_str().unwrap().to_string();
        decide(&state, &backend(dir.path(), launch), &id, "launch", false).await.unwrap();
        settle(&state, &id).await;

        let mut schedule = Schedule::default();
        let running = Arc::new(Fake::default().on("sacct -j 42", Ok(ComputeOutput::ok("RUNNING|0:0\n"))));
        poll_once(&state, &backend(dir.path(), running.clone()), &mut schedule).await;
        assert_eq!(load(state.app_dir()).jobs[0].status, JobStatus::Running);
        poll_once(&state, &backend(dir.path(), running.clone()), &mut schedule).await;
        assert_eq!(running.calls().len(), 1, "pas avant l'heure de la prochaine sonde");

        // hôte injoignable : la tâche reste en cours, la carte le dit une fois
        schedule.next.clear();
        let down = Arc::new(Fake::default().on("ssh", Ok(ComputeOutput::failed(255, "ssh: connect to host nas: Connection refused"))));
        poll_once(&state, &backend(dir.path(), down.clone()), &mut schedule).await;
        let job = load(state.app_dir()).jobs[0].clone();
        assert_eq!(job.status, JobStatus::Running);
        assert!(job.message.unwrap().starts_with("suivi en pause"));
        let (due, failures) = schedule.next[&id];
        assert_eq!(failures, 1);
        assert!(due > Instant::now() + Duration::from_secs(200), "délai allongé");

        schedule.next.clear();
        let done = Arc::new(Fake::default().on("sacct", Ok(ComputeOutput::ok("COMPLETED|0:0\n"))));
        poll_once(&state, &backend(dir.path(), done), &mut schedule).await;
        let job = load(state.app_dir()).jobs[0].clone();
        assert_eq!((job.status, job.exit_code, job.message), (JobStatus::Completed, Some(0), None));
        let last = events(&state).last().cloned().unwrap();
        assert_eq!(last["status"], "completed");
        assert_eq!(last["meta"]["turnId"], "turn-3", "fusionnée dans la carte d'origine");
        // terminée : plus jamais sondée
        let idle = Arc::new(Fake::default());
        poll_once(&state, &backend(dir.path(), idle.clone()), &mut schedule).await;
        assert!(idle.calls().is_empty());
    }

    #[tokio::test]
    async fn annuler_passe_par_scancel_et_ferme_le_suivi() {
        let (state, dir) = test_state().await;
        let fake = Arc::new(Fake::default().on("sbatch", Ok(ComputeOutput::ok("77\n"))).on("scancel 77", Ok(ComputeOutput::ok(""))));
        let b = backend(dir.path(), fake.clone());
        let id = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap()["jobId"].as_str().unwrap().to_string();
        assert_eq!(decide(&state, &b, &id, "cancel", false).await.unwrap_err(), "job_not_running");
        decide(&state, &b, &id, "launch", false).await.unwrap();
        settle(&state, &id).await;
        assert_eq!(decide(&state, &b, &id, "cancel", false).await.unwrap(), JobStatus::Cancelled);
        assert!(fake.calls().iter().any(|c| c.contains("scancel 77")));
        let mut schedule = Schedule::default();
        poll_once(&state, &b, &mut schedule).await;
        assert!(!fake.calls().iter().any(|c| c.contains("sacct")), "annulée : plus suivie");
    }

    #[tokio::test]
    async fn une_soumission_coupee_par_un_redemarrage_est_marquee() {
        let (state, dir) = test_state().await;
        let b = backend(dir.path(), Arc::new(Fake::default()));
        let id = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap()["jobId"].as_str().unwrap().to_string();
        {
            let mut registry = load(state.app_dir());
            registry.jobs[0].status = JobStatus::Launching;
            save(state.app_dir(), &mut registry);
        }
        recover(&state).await;
        let job = load(state.app_dir()).jobs.into_iter().find(|j| j.id == id).unwrap();
        assert_eq!(job.status, JobStatus::LaunchFailed);
        assert!(job.message.unwrap().contains("redémarrage"));
    }

    #[tokio::test]
    async fn l_agent_lit_les_hotes_et_leurs_fiches() {
        let (state, dir) = test_state().await;
        let b = backend(dir.path(), Arc::new(Fake::default()));
        save_host(&state, &json!({"host":"narval","notes":"accounts: def-ckinnard_cpu"})).await.unwrap();
        let hosts = action_hosts(&state, &b);
        let narval = hosts["hosts"].as_array().unwrap().iter().find(|h| h["host"] == "narval").unwrap().clone();
        assert_eq!((narval["configured"].clone(), narval["hasNotes"].clone()), (json!(true), json!(true)));
        let rorqual = hosts["hosts"].as_array().unwrap().iter().find(|h| h["host"] == "rorqual").unwrap().clone();
        assert_eq!(rorqual["configured"], false);
        let fiche = action_host(&state, &b, &json!({"host":"Narval"})).unwrap();
        assert_eq!(fiche["notes"], "accounts: def-ckinnard_cpu");
        assert!(action_host(&state, &b, &json!({"host":"pluton"})).is_err());
        save_host(&state, &json!({"host":"narval","autoLaunch":true})).await.unwrap();
        let book = HostBook::load(state.app_dir());
        assert!(book.auto_launch(Target::Narval));
        assert_eq!(book.sheet(Target::Narval).notes, "accounts: def-ckinnard_cpu", "un champ absent ne change pas");
    }

    #[tokio::test]
    async fn job_status_ne_montre_que_les_taches_du_fil_appelant() {
        let (state, dir) = test_state().await;
        let b = backend(dir.path(), Arc::new(Fake::default()));
        let id = action_propose_job(&state, &b, "t1", &narval_job()).await.unwrap()["jobId"].as_str().unwrap().to_string();
        let mine = action_job_status(&state, &b, "t1", &json!({})).await.unwrap();
        assert_eq!(mine["jobs"][0]["jobId"], id.as_str());
        assert_eq!(mine["jobs"][0]["status"], "proposed");
        let other = action_job_status(&state, &b, "t2", &json!({})).await.unwrap();
        assert!(other["jobs"].as_array().unwrap().is_empty());
        assert_eq!(action_job_status(&state, &b, "t2", &json!({"jobId": id})).await.unwrap_err(), "unknown_job");
    }
}
