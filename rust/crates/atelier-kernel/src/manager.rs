//! Un noyau par fil : démarrage à la demande, cellules, arrêt à l'inactivité.

use crate::envs::{discover_envs, resolve_env, PyEnv};
use crate::journal::{clip, code_sha256, CellJournal, CellRecord};
use crate::kernel::{Cell, Kernel, KernelInfo};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};
use tokio::sync::watch;

/// Ce que la réponse à l'agent porte des sorties (la réponse du pont est
/// bornée à 128 Ko ; le journal en garde davantage).
const REPLY_STDOUT_MAX: usize = 40 * 1024;
const REPLY_STDERR_MAX: usize = 16 * 1024;
const VARS_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KernelError {
    /// Une cellule tourne déjà dans ce fil.
    Busy(u64),
    /// Pas de noyau vivant pour ce fil.
    NoKernel,
    /// Le noyau tourne avec un autre env que celui demandé.
    OtherEnv {
        running: String,
        asked: String,
    },
    UnknownCell(u64),
    Start(String),
    Other(String),
}

impl KernelError {
    /// Code court suivi d'une phrase que l'agent peut suivre.
    pub fn message(&self) -> String {
        match self {
            Self::Busy(id) => format!(
                "kernel_busy — la cellule {id} tourne encore. Attends-la (action wait, cell={id}) ou interromps-la (action interrupt)."
            ),
            Self::NoKernel => "no_kernel — aucun noyau ne tourne dans ce fil ; la première cellule (action run) le démarre.".into(),
            Self::OtherEnv { running, asked } => format!(
                "kernel_other_env — le noyau tourne avec l'env « {running} ». Pour passer à « {asked} », appelle restart avec env=\"{asked}\" (les variables seront perdues)."
            ),
            Self::UnknownCell(id) => format!("unknown_cell — aucune cellule {id} dans ce fil."),
            Self::Start(e) => format!("kernel_start_failed — {e}"),
            Self::Other(e) => format!("kernel_error — {e}"),
        }
    }
}

/// Événement publié à chaque début et fin de cellule (panneau du fil).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CellEvent {
    pub thread_id: String,
    /// `started` ou `finished`.
    pub phase: &'static str,
    pub cell: Value,
}

pub type CellListener = Arc<dyn Fn(CellEvent) + Send + Sync>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunOutcome {
    pub cell: Value,
    pub finished: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStatus {
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kernel: Option<KernelInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub busy_cell: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_seconds: Option<u64>,
}

struct Slot {
    kernel: Kernel,
    last_used: Mutex<Instant>,
    /// Cellule en cours et son enregistrement final, posé par le finisseur.
    pending: Mutex<Option<(u64, watch::Receiver<Option<CellRecord>>)>>,
}

impl Slot {
    fn touch(&self) {
        *self.last_used.lock().unwrap_or_else(|e| e.into_inner()) = Instant::now();
    }
    fn idle(&self) -> Duration {
        self.last_used
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .elapsed()
    }
}

pub struct RunRequest<'a> {
    pub thread_id: &'a str,
    pub cwd: &'a Path,
    /// Env demandé par l'agent pour cet appel.
    pub env: Option<&'a str>,
    /// Env retenu pour le fil (le dernier choisi), utilisé au démarrage.
    pub default_env: Option<&'a str>,
    pub code: &'a str,
    pub wait: Duration,
    pub turn_id: Option<&'a str>,
}

pub struct KernelManager {
    slots: Mutex<HashMap<String, Arc<Slot>>>,
    thread_locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    next_ids: Mutex<HashMap<String, Arc<AtomicU64>>>,
    driver_dir: PathBuf,
    home: PathBuf,
    journal: CellJournal,
    listener: Mutex<Option<CellListener>>,
}

impl KernelManager {
    /// `data_dir` : dossier d'Atelier où vivent le pilote et le journal.
    pub fn new(data_dir: &Path, home: &Path) -> Self {
        Self {
            slots: Mutex::new(HashMap::new()),
            thread_locks: Mutex::new(HashMap::new()),
            next_ids: Mutex::new(HashMap::new()),
            driver_dir: data_dir.join("kernel"),
            home: home.to_path_buf(),
            journal: CellJournal::new(data_dir.join("kernel").join("cells")),
            listener: Mutex::new(None),
        }
    }

    pub fn journal(&self) -> &CellJournal {
        &self.journal
    }

    pub fn set_listener(&self, listener: CellListener) {
        *self.listener.lock().unwrap_or_else(|e| e.into_inner()) = Some(listener);
    }

    fn emit(&self, event: CellEvent) {
        let listener = self
            .listener
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        if let Some(l) = listener {
            l(event);
        }
    }

    pub fn envs(&self, project_root: Option<&Path>) -> Vec<PyEnv> {
        discover_envs(&self.home, project_root)
    }

    fn slot(&self, thread_id: &str) -> Option<Arc<Slot>> {
        self.slots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .get(thread_id)
            .cloned()
    }

    fn thread_lock(&self, thread_id: &str) -> Arc<tokio::sync::Mutex<()>> {
        self.thread_locks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(thread_id.to_string())
            .or_default()
            .clone()
    }

    fn next_id(&self, thread_id: &str) -> u64 {
        let counter = {
            let mut ids = self.next_ids.lock().unwrap_or_else(|e| e.into_inner());
            ids.entry(thread_id.to_string())
                .or_insert_with(|| Arc::new(AtomicU64::new(self.journal.last_id(thread_id) + 1)))
                .clone()
        };
        counter.fetch_add(1, Ordering::SeqCst)
    }

    fn write_driver(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.driver_dir).map_err(|e| e.to_string())?;
        let path = self.driver_dir.join("atelier_noyau.py");
        if std::fs::read_to_string(&path).ok().as_deref() != Some(crate::DRIVER_SOURCE) {
            std::fs::write(&path, crate::DRIVER_SOURCE).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    async fn start_slot(
        &self,
        thread_id: &str,
        cwd: &Path,
        env: Option<&str>,
    ) -> Result<Arc<Slot>, KernelError> {
        let envs = self.envs(Some(cwd));
        let env = resolve_env(&envs, env).map_err(KernelError::Start)?;
        self.write_driver().map_err(KernelError::Start)?;
        let kernel = Kernel::start(&env, cwd, &self.driver_dir)
            .await
            .map_err(KernelError::Start)?;
        let slot = Arc::new(Slot {
            kernel,
            last_used: Mutex::new(Instant::now()),
            pending: Mutex::new(None),
        });
        self.slots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(thread_id.to_string(), slot.clone());
        Ok(slot)
    }

    /// Noyau vivant du fil, démarré au besoin. Rend aussi la phrase à dire à
    /// l'agent quand un noyau vient de (re)démarrer.
    async fn ensure(
        &self,
        thread_id: &str,
        cwd: &Path,
        env: Option<&str>,
        default_env: Option<&str>,
    ) -> Result<(Arc<Slot>, Option<String>), KernelError> {
        let lock = self.thread_lock(thread_id);
        let _guard = lock.lock().await;
        let mut was_dead = false;
        if let Some(slot) = self.slot(thread_id) {
            if slot.kernel.is_alive() {
                if let Some(asked) = env.filter(|e| !env_matches(&slot.kernel.info.env, e)) {
                    return Err(KernelError::OtherEnv {
                        running: slot.kernel.info.env.name.clone(),
                        asked: asked.to_string(),
                    });
                }
                return Ok((slot, None));
            }
            was_dead = true;
            self.slots
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(thread_id);
        }
        let slot = self.start_slot(thread_id, cwd, env.or(default_env)).await?;
        let info = &slot.kernel.info;
        let note = format!(
            "{} : Python {} de l'env « {} », dossier {}.{}",
            if was_dead {
                "Noyau relancé"
            } else {
                "Noyau démarré"
            },
            info.python_version,
            info.env.name,
            info.cwd.display(),
            if was_dead {
                " L'ancien noyau s'était arrêté : ses variables sont perdues."
            } else {
                ""
            }
        );
        Ok((slot, Some(note)))
    }

    pub async fn run(&self, req: RunRequest<'_>) -> Result<RunOutcome, KernelError> {
        let (slot, note) = self
            .ensure(req.thread_id, req.cwd, req.env, req.default_env)
            .await?;
        if let Some(busy) = slot.kernel.running() {
            return Err(KernelError::Busy(busy.id));
        }
        let id = self.next_id(req.thread_id);
        let cell = slot.kernel.submit(id, req.code).await.map_err(|e| {
            match e.strip_prefix("busy:").and_then(|n| n.parse().ok()) {
                Some(busy) => KernelError::Busy(busy),
                None => KernelError::Other(e),
            }
        })?;
        slot.touch();
        let started_wall = SystemTime::now();
        self.emit(CellEvent {
            thread_id: req.thread_id.to_string(),
            phase: "started",
            cell: json!({
                "id": id,
                "threadId": req.thread_id,
                "turnId": req.turn_id,
                "startedAt": cell.started_at,
                "status": "running",
                "code": clip(req.code, 16 * 1024),
                "env": slot.kernel.info.env.name,
            }),
        });
        let (tx, rx) = watch::channel(None);
        *slot.pending.lock().unwrap_or_else(|e| e.into_inner()) = Some((id, rx.clone()));
        let finisher = Finisher {
            journal: self.journal.clone(),
            listener: self
                .listener
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone(),
            slot: slot.clone(),
            cell: cell.clone(),
            thread_id: req.thread_id.to_string(),
            turn_id: req.turn_id.map(str::to_string),
            started_wall,
        };
        tokio::spawn(async move {
            let record = finisher.finish().await;
            let _ = tx.send(Some(record));
        });
        let outcome = wait_record(rx, &cell, req.wait).await;
        Ok(RunOutcome { note, ..outcome })
    }

    /// Attend une cellule encore en cours, ou relit une cellule finie.
    pub async fn wait(
        &self,
        thread_id: &str,
        id: u64,
        delai: Duration,
    ) -> Result<RunOutcome, KernelError> {
        if let Some(slot) = self.slot(thread_id) {
            let pending = slot
                .pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clone();
            if let Some((_, rx)) = pending.filter(|(pid, _)| *pid == id) {
                if let Some(cell) = slot.kernel.running().filter(|c| c.id == id) {
                    return Ok(wait_record(rx, &cell, delai).await);
                }
                let mut rx = rx;
                let _ = tokio::time::timeout(delai, rx.wait_for(Option::is_some)).await;
                let record = rx.borrow().clone();
                if let Some(record) = record {
                    return Ok(finished(&record));
                }
            }
        }
        self.journal
            .get(thread_id, id)
            .map(|r| finished(&r))
            .ok_or(KernelError::UnknownCell(id))
    }

    pub async fn variables(&self, thread_id: &str) -> Result<Value, KernelError> {
        let slot = self
            .slot(thread_id)
            .filter(|s| s.kernel.is_alive())
            .ok_or(KernelError::NoKernel)?;
        slot.touch();
        slot.kernel.variables(VARS_TIMEOUT).await.map_err(|e| {
            match e.strip_prefix("busy:").and_then(|n| n.parse().ok()) {
                Some(busy) => KernelError::Busy(busy),
                None => KernelError::Other(e),
            }
        })
    }

    /// Ctrl-C : rend la cellule interrompue, si elle s'arrête dans le délai.
    pub async fn interrupt(&self, thread_id: &str) -> Result<Option<u64>, KernelError> {
        let slot = self
            .slot(thread_id)
            .filter(|s| s.kernel.is_alive())
            .ok_or(KernelError::NoKernel)?;
        let running = slot.kernel.running();
        if let Some(cell) = &running {
            slot.kernel.interrupt();
            if !cell.wait(Duration::from_secs(5)).await {
                // Du code C qui ignore SIGINT : on retente une fois.
                slot.kernel.interrupt();
                cell.wait(Duration::from_secs(5)).await;
            }
        }
        Ok(running.map(|c| c.id))
    }

    pub async fn restart(
        &self,
        thread_id: &str,
        cwd: &Path,
        env: Option<&str>,
        default_env: Option<&str>,
    ) -> Result<KernelInfo, KernelError> {
        self.shutdown(thread_id).await;
        let lock = self.thread_lock(thread_id);
        let _guard = lock.lock().await;
        let slot = self.start_slot(thread_id, cwd, env.or(default_env)).await?;
        Ok(slot.kernel.info.clone())
    }

    pub async fn shutdown(&self, thread_id: &str) -> bool {
        let slot = self
            .slots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(thread_id);
        match slot {
            Some(slot) => {
                slot.kernel.shutdown().await;
                true
            }
            None => false,
        }
    }

    pub async fn shutdown_all(&self) {
        let slots: Vec<Arc<Slot>> = self
            .slots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .drain()
            .map(|(_, s)| s)
            .collect();
        for slot in slots {
            slot.kernel.shutdown().await;
        }
    }

    /// Arrête les noyaux restés sans cellule depuis `idle`. Une cellule en
    /// cours n'est jamais coupée : un long calcul n'est pas de l'inactivité.
    pub async fn reap_idle(&self, idle: Duration) -> Vec<String> {
        let victims: Vec<String> = self
            .slots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .filter(|(_, s)| {
                !s.kernel.is_alive() || (s.kernel.running().is_none() && s.idle() >= idle)
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in &victims {
            self.shutdown(id).await;
        }
        victims
    }

    pub fn status(&self, thread_id: &str) -> KernelStatus {
        match self.slot(thread_id).filter(|s| s.kernel.is_alive()) {
            Some(slot) => KernelStatus {
                running: true,
                kernel: Some(slot.kernel.info.clone()),
                busy_cell: slot.kernel.running().map(|c| c.id),
                idle_seconds: Some(slot.idle().as_secs()),
            },
            None => KernelStatus {
                running: false,
                kernel: None,
                busy_cell: None,
                idle_seconds: None,
            },
        }
    }
}

fn env_matches(env: &PyEnv, asked: &str) -> bool {
    env.name == asked
        || env.name.split(" (").next() == Some(asked)
        || env.prefix == Path::new(asked)
        || env.python == Path::new(asked)
}

struct Finisher {
    journal: CellJournal,
    listener: Option<CellListener>,
    slot: Arc<Slot>,
    cell: Arc<Cell>,
    thread_id: String,
    turn_id: Option<String>,
    started_wall: SystemTime,
}

impl Finisher {
    async fn finish(self) -> CellRecord {
        while !self.cell.wait(Duration::from_secs(3600)).await {}
        let p = self.cell.snapshot();
        let info = &self.slot.kernel.info;
        let cwd = info.cwd.clone();
        let since = self.started_wall;
        let scanned = tokio::task::spawn_blocking(move || crate::scan::written_since(&cwd, since))
            .await
            .unwrap_or_default();
        let mut written = p.files_written.clone();
        for path in scanned {
            let path = path.display().to_string();
            if !written.contains(&path) {
                written.push(path);
            }
        }
        written.sort();
        // Un fichier écrit n'est pas aussi « lu » parce qu'il a été rouvert.
        let read: Vec<String> = p
            .files_read
            .iter()
            .filter(|r| !written.contains(r))
            .cloned()
            .collect();
        let record = CellRecord {
            id: self.cell.id,
            thread_id: self.thread_id.clone(),
            turn_id: self.turn_id.clone(),
            started_at: self.cell.started_at.clone(),
            duration_ms: p.duration_ms.unwrap_or(0),
            status: if p.error.is_some() { "error" } else { "ok" }.into(),
            code: self.cell.code.clone(),
            code_sha256: code_sha256(&self.cell.code),
            stdout: p.stdout,
            stderr: p.stderr,
            result: p.result,
            error: p.error,
            files_read: read,
            files_written: written,
            truncated: p.truncated,
            env: info.env.name.clone(),
            python: info.executable.clone(),
            python_version: info.python_version.clone(),
            cwd: info.cwd.display().to_string(),
        };
        let journal = self.journal.clone();
        let stored = record.clone();
        let _ = tokio::task::spawn_blocking(move || journal.append(&stored)).await;
        self.slot.touch();
        if let Some(l) = &self.listener {
            l(CellEvent {
                thread_id: self.thread_id.clone(),
                phase: "finished",
                cell: panel_view(&record),
            });
        }
        record
    }
}

/// Vue du panneau : le journal sans les sorties complètes.
pub fn panel_view(r: &CellRecord) -> Value {
    let mut v = serde_json::to_value(r).unwrap_or(Value::Null);
    if let Some(o) = v.as_object_mut() {
        o.insert("stdout".into(), json!(clip(&r.stdout, 8 * 1024)));
        o.insert("stderr".into(), json!(clip(&r.stderr, 4 * 1024)));
        o.insert("code".into(), json!(clip(&r.code, 16 * 1024)));
    }
    v
}

/// Réponse à l'agent pour une cellule finie.
fn finished(r: &CellRecord) -> RunOutcome {
    let mut cell = json!({
        "cell": r.id,
        "status": r.status,
        "durationMs": r.duration_ms,
        "stdout": clip(&r.stdout, REPLY_STDOUT_MAX),
    });
    let o = cell.as_object_mut().expect("objet");
    if !r.stderr.trim().is_empty() {
        o.insert("stderr".into(), json!(clip(&r.stderr, REPLY_STDERR_MAX)));
    }
    if let Some(result) = &r.result {
        o.insert("result".into(), json!(result));
    }
    if let Some(error) = &r.error {
        o.insert("error".into(), error.clone());
    }
    if !r.files_written.is_empty() {
        o.insert("filesWritten".into(), json!(r.files_written));
    }
    if !r.files_read.is_empty() {
        o.insert("filesRead".into(), json!(r.files_read));
    }
    if r.truncated > 0 {
        o.insert("truncatedBytes".into(), json!(r.truncated));
    }
    RunOutcome {
        cell,
        finished: true,
        note: None,
    }
}

async fn wait_record(
    mut rx: watch::Receiver<Option<CellRecord>>,
    cell: &Arc<Cell>,
    delai: Duration,
) -> RunOutcome {
    let _ = tokio::time::timeout(delai, rx.wait_for(Option::is_some)).await;
    let record = rx.borrow().clone();
    if let Some(record) = record {
        return finished(&record);
    }
    let p = cell.snapshot();
    RunOutcome {
        cell: json!({
            "cell": cell.id,
            "status": "running",
            "elapsedMs": cell.started.elapsed().as_millis() as u64,
            "stdoutSoFar": clip(&p.stdout, REPLY_STDOUT_MAX / 2),
            "hint": format!("La cellule continue dans le noyau. Rappelle l'outil avec action=wait, cell={} pour la suite, ou action=interrupt pour l'arrêter.", cell.id),
        }),
        finished: false,
        note: None,
    }
}
