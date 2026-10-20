//! Un noyau par fil : démarrage à la demande, cellules, arrêt à l'inactivité.

use crate::envs::{discover_envs, resolve_env, PyEnv};
use crate::journal::{clip, code_sha256, CellJournal, CellRecord, Lineage, ResumedFrom, VarUse};
use crate::kernel::{Cell, Kernel, KernelInfo};
use crate::packages::EnvSnapshot;
use crate::prints::{PrintCache, HASH_CELL_BUDGET_BYTES};
use crate::replay::{Backup, ReplaySummary};
use crate::journal::ReplayMark;
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
/// Rythme des sorties envoyées au panneau pendant une cellule longue.
const PROGRESS_EVERY: Duration = Duration::from_millis(700);
/// Paquets importés montrés dans l'état du noyau.
const STATUS_PACKAGES_MAX: usize = 60;
/// Extrait de la demande du tour gardé sur chaque cellule.
const TURN_PROMPT_MAX: usize = 200;

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
    /// Paquets importés dans le noyau, avec leur version.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub packages: Vec<Value>,
    /// Nombre de paquets de l'env, et empreinte de son instantané.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub packages_total: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_sha256: Option<String>,
}

/// Cellule qui a créé, puis modifié en dernier, une variable du noyau.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Origin {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<u64>,
}

impl Origin {
    fn last(&self) -> Option<u64> {
        self.modified.or(self.created)
    }
}

struct Slot {
    kernel: Kernel,
    env: Arc<EnvSnapshot>,
    /// Variable → cellules qui l'ont créée et modifiée (lignée).
    origins: Mutex<HashMap<String, Origin>>,
    /// Modules tiers chargés, relevés à la fin de la dernière cellule.
    imports: Mutex<Vec<String>>,
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
    /// Phrase de but écrite par l'agent.
    pub purpose: Option<&'a str>,
    /// `Some("user")` pour une cellule relancée à la main depuis le panneau.
    pub author: Option<&'a str>,
    /// Cellule d'origine d'une cellule modifiée à la main.
    pub from_cell: Option<u64>,
    /// Cellule d'un autre fil reprise ici.
    pub resumed_from: Option<ResumedFrom>,
}

pub struct KernelManager {
    slots: Mutex<HashMap<String, Arc<Slot>>>,
    thread_locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    next_ids: Mutex<HashMap<String, Arc<AtomicU64>>>,
    driver_dir: PathBuf,
    home: PathBuf,
    journal: CellJournal,
    listener: Mutex<Option<CellListener>>,
    prints: Arc<PrintCache>,
    /// Dernier tour de chaque fil et sa demande : les cellules se rangent
    /// sous la question qui les a fait naître.
    turns: Mutex<HashMap<String, (String, String)>>,
    /// Fils dont un rejeu tourne, avec son drapeau d'arrêt.
    replays: Mutex<HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
}

impl KernelManager {
    /// Dossier des figures captées pour un fil (hors du projet : rien n'y
    /// entre tant que l'utilisateur ne l'enregistre pas dans la galerie).
    pub fn figures_dir(&self, thread_id: &str) -> PathBuf {
        self.driver_dir
            .join("figures")
            .join(crate::journal::thread_key(thread_id))
    }

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
            prints: Arc::default(),
            turns: Mutex::new(HashMap::new()),
            replays: Mutex::new(HashMap::new()),
        }
    }

    /// Note la demande du tour qui commence dans ce fil.
    pub fn note_turn(&self, thread_id: &str, turn_id: &str, prompt: &str) {
        let excerpt: String = prompt.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(TURN_PROMPT_MAX).collect();
        self.turns
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(thread_id.to_string(), (turn_id.to_string(), excerpt));
    }

    fn turn_prompt(&self, thread_id: &str, turn_id: Option<&str>) -> Option<String> {
        let turns = self.turns.lock().unwrap_or_else(|e| e.into_inner());
        turns
            .get(thread_id)
            .filter(|(id, _)| Some(id.as_str()) == turn_id)
            .map(|(_, prompt)| prompt.clone())
            .filter(|p| !p.is_empty())
    }

    fn envs_dir(&self) -> PathBuf {
        self.driver_dir.join("envs")
    }

    /// Instantané d'env enregistré sous son empreinte.
    pub fn env_snapshot(&self, sha256: &str) -> Option<EnvSnapshot> {
        if !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
            return None;
        }
        let text = std::fs::read_to_string(self.envs_dir().join(format!("{sha256}.json"))).ok()?;
        serde_json::from_str(&text).ok()
    }

    pub fn print_cache(&self) -> &PrintCache {
        &self.prints
    }

    /// Dossier du noyau : pilote, journal des cellules, instantanés d'env.
    pub fn kernel_dir(&self) -> &Path {
        &self.driver_dir
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
        let snapshot = self.snapshot_env(&kernel.info).await;
        let slot = Arc::new(Slot {
            kernel,
            env: Arc::new(snapshot),
            origins: Mutex::new(HashMap::new()),
            imports: Mutex::new(Vec::new()),
            last_used: Mutex::new(Instant::now()),
            pending: Mutex::new(None),
        });
        self.slots
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(thread_id.to_string(), slot.clone());
        Ok(slot)
    }

    /// Versions des paquets de l'env au démarrage, gardées une fois par
    /// empreinte dans `kernel/envs/`.
    async fn snapshot_env(&self, info: &KernelInfo) -> EnvSnapshot {
        let (name, prefix, python) = (
            info.env.name.clone(),
            info.env.prefix.clone(),
            info.python_version.clone(),
        );
        let dir = self.envs_dir();
        tokio::task::spawn_blocking(move || {
            let snap = EnvSnapshot::read(&name, &prefix, &python);
            let path = dir.join(format!("{}.json", snap.sha256));
            if !path.is_file() {
                let _ = std::fs::create_dir_all(&dir);
                if let Ok(text) = serde_json::to_vec_pretty(&snap) {
                    let _ = std::fs::write(path, text);
                }
            }
            snap
        })
        .await
        .unwrap_or_else(|_| EnvSnapshot::read("", Path::new(""), ""))
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
        let figures = self.figures_dir(req.thread_id);
        let cell = slot.kernel.submit(id, req.code, Some(&figures)).await.map_err(|e| {
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
                "purpose": req.purpose,
                "author": req.author,
                "fromCell": req.from_cell,
                "resumedFrom": req.resumed_from,
                "turnPrompt": self.turn_prompt(req.thread_id, req.turn_id),
                "session": slot.kernel.info.started_at,
            }),
        });
        self.spawn_progress(req.thread_id, &cell);
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
            purpose: req
                .purpose
                .map(|p| p.trim().chars().take(200).collect::<String>())
                .filter(|p| !p.is_empty()),
            author: req.author.map(str::to_string),
            from_cell: req.from_cell,
            resumed_from: req.resumed_from.clone(),
            turn_prompt: self.turn_prompt(req.thread_id, req.turn_id),
            prints: self.prints.clone(),
            started_wall,
        };
        tokio::spawn(async move {
            let record = finisher.finish().await;
            let _ = tx.send(Some(record));
        });
        let outcome = wait_record(rx, &cell, req.wait).await;
        Ok(RunOutcome { note, ..outcome })
    }

    /// Sorties d'une cellule longue envoyées au panneau au fil de l'eau.
    fn spawn_progress(&self, thread_id: &str, cell: &Arc<Cell>) {
        let Some(listener) = self
            .listener
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        else {
            return;
        };
        let (thread_id, cell) = (thread_id.to_string(), cell.clone());
        tokio::spawn(async move {
            let mut sent = (0usize, 0usize);
            while !cell.wait(PROGRESS_EVERY).await {
                let p = cell.snapshot();
                if (p.stdout.len(), p.stderr.len()) == sent {
                    continue;
                }
                sent = (p.stdout.len(), p.stderr.len());
                listener(CellEvent {
                    thread_id: thread_id.clone(),
                    phase: "progress",
                    cell: json!({
                        "id": cell.id,
                        "stdout": clip(&p.stdout, 8 * 1024),
                        "stderr": clip(&p.stderr, 4 * 1024),
                    }),
                });
            }
        });
    }

    /// Cellules du fil pour le panneau, avec l'état actuel des fichiers
    /// qu'elles ont lus (« Données modifiées depuis »).
    pub fn panel_cells(&self, thread_id: &str, limit: usize) -> Vec<Value> {
        self.journal
            .list(thread_id, limit)
            .iter()
            .map(|r| {
                let mut v = panel_view(r);
                let stale: Vec<Value> = r
                    .prints
                    .iter()
                    .filter(|p| r.files_read.contains(&p.path))
                    .map(|p| self.prints.staleness(p))
                    .filter(|s| s.state != "same")
                    .map(|s| json!(s))
                    .collect();
                if !stale.is_empty() {
                    v["stale"] = json!(stale);
                }
                // Cellule modifiée à la main : les lignes changées par
                // rapport à l'originale.
                let diff = r.from_cell.and_then(|from| {
                    let original = self.journal.get(thread_id, from)?;
                    crate::diff::line_diff(&original.code, &r.code)
                });
                if let Some(diff) = diff {
                    v["fromDiff"] = json!(diff);
                }
                v
            })
            .collect()
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
        let mut vars = slot.kernel.variables(VARS_TIMEOUT).await.map_err(|e| {
            match e.strip_prefix("busy:").and_then(|n| n.parse().ok()) {
                Some(busy) => KernelError::Busy(busy),
                None => KernelError::Other(e),
            }
        })?;
        let origins = slot.origins.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Some(list) = vars.as_array_mut() {
            for v in list {
                let origin = v["name"].as_str().and_then(|n| origins.get(n));
                if let (Some(origin), Some(o)) = (origin, v.as_object_mut()) {
                    o.insert("origin".into(), json!(origin));
                }
            }
        }
        Ok(vars)
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

    /// Script `.py` ou cahier `.ipynb` des cellules réussies de la dernière
    /// session du fil, avec l'en-tête de preuves.
    pub fn export(&self, thread_id: &str, title: &str, ipynb: bool) -> Result<String, KernelError> {
        let all = self.journal.list(thread_id, usize::MAX);
        let session = all
            .iter()
            .rev()
            .find_map(|c| c.session.clone())
            .ok_or_else(|| KernelError::Other("aucune cellule à exporter dans ce fil".into()))?;
        let session_cells: Vec<CellRecord> = all
            .into_iter()
            .filter(|c| c.session.as_deref() == Some(session.as_str()))
            .collect();
        let skipped = session_cells.iter().filter(|c| c.status != "ok").count();
        let cells: Vec<CellRecord> = session_cells.into_iter().filter(|c| c.status == "ok").collect();
        let env = cells
            .last()
            .and_then(|c| c.env_sha256.as_deref())
            .and_then(|sha| self.env_snapshot(sha));
        let chain = self.journal.verify_chain(thread_id);
        let at = chrono::Utc::now().format("%Y-%m-%d %H:%M UTC").to_string();
        let input = crate::export::ExportInput {
            thread_title: title,
            cells: &cells,
            skipped,
            env: env.as_ref(),
            chain: &chain,
            exported_at: &at,
        };
        Ok(if ipynb {
            crate::export::to_ipynb(&input)
        } else {
            crate::export::to_py(&input)
        })
    }

    /// Un rejeu tourne-t-il dans ce fil ?
    pub fn replaying(&self, thread_id: &str) -> bool {
        self.replays
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(thread_id)
    }

    /// Arrête le rejeu en cours après la cellule qui tourne.
    pub fn cancel_replay(&self, thread_id: &str) -> bool {
        match self.replays.lock().unwrap_or_else(|e| e.into_inner()).get(thread_id) {
            Some(flag) => {
                flag.store(true, Ordering::SeqCst);
                true
            }
            None => false,
        }
    }

    /// Rejoue à neuf les cellules réussies de la dernière session du fil,
    /// dans un noyau vierge du même env, et compare. Chaque cellule reçoit
    /// sa marque de rejeu dans le journal. `progress(fait, total, cellule)`
    /// suit l'avancement. Si aucun noyau ne tourne à la fin, le noyau
    /// rejoué devient celui du fil : l'état est reconstruit.
    pub async fn replay(
        &self,
        thread_id: &str,
        cwd: &Path,
        progress: impl Fn(usize, usize, Option<&CellRecord>) + Send + Sync,
    ) -> Result<ReplaySummary, KernelError> {
        let cancel = {
            let mut replays = self.replays.lock().unwrap_or_else(|e| e.into_inner());
            if replays.contains_key(thread_id) {
                return Err(KernelError::Other("un rejeu tourne déjà dans ce fil".into()));
            }
            let flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
            replays.insert(thread_id.to_string(), flag.clone());
            flag
        };
        let result = self.replay_inner(thread_id, cwd, &cancel, &progress).await;
        self.replays
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(thread_id);
        result
    }

    async fn replay_inner(
        &self,
        thread_id: &str,
        cwd: &Path,
        cancel: &std::sync::atomic::AtomicBool,
        progress: &(impl Fn(usize, usize, Option<&CellRecord>) + Send + Sync),
    ) -> Result<ReplaySummary, KernelError> {
        let all = self.journal.list(thread_id, usize::MAX);
        let session = all
            .iter()
            .rev()
            .find_map(|c| c.session.clone())
            .ok_or_else(|| KernelError::Other("aucune cellule à rejouer dans ce fil".into()))?;
        let cells: Vec<CellRecord> = all
            .into_iter()
            .filter(|c| c.session.as_deref() == Some(session.as_str()))
            .collect();
        let first = &cells[0];
        let envs = self.envs(Some(cwd));
        let env = resolve_env(&envs, Some(&first.env))
            .or_else(|_| resolve_env(&envs, Some(&first.python)))
            .map_err(KernelError::Start)?;
        let key = crate::journal::thread_key(thread_id);
        let ok: Vec<CellRecord> = cells.iter().filter(|c| c.status == "ok").cloned().collect();
        let backup_dir = self.driver_dir.join("replay").join(&key);
        let backup = {
            let (dir, ok) = (backup_dir.clone(), ok.clone());
            tokio::task::spawn_blocking(move || Backup::take(&dir, &ok))
                .await
                .map_err(|e| KernelError::Other(e.to_string()))?
                .map_err(KernelError::Other)?
        };
        self.write_driver().map_err(KernelError::Start)?;
        let kernel = match Kernel::start(&env, cwd, &self.driver_dir).await {
            Ok(k) => k,
            Err(e) => {
                backup.restore();
                return Err(KernelError::Start(e));
            }
        };
        let figures = self.driver_dir.join("replay-figures").join(&key);
        let at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let mut summary = ReplaySummary { total: cells.len(), ..Default::default() };
        let mut origins: HashMap<String, Origin> = HashMap::new();
        let session = session.clone();
        let mut imports = Vec::new();
        let mut broken = false;
        for (done, original) in cells.iter().enumerate() {
            progress(done, cells.len(), Some(original));
            let (status, detail, progress_seen) = if original.status != "ok" {
                ("skipped", Some("en erreur à l'origine : pas rejouée".to_string()), None)
            } else if broken || cancel.load(Ordering::SeqCst) || !kernel.is_alive() {
                ("skipped", Some(if cancel.load(Ordering::SeqCst) { "rejeu arrêté" } else { "le noyau rejoué s'est arrêté" }.to_string()), None)
            } else {
                match kernel.submit(original.id, &original.code, Some(&figures)).await {
                    Err(e) => {
                        broken = true;
                        ("error", Some(e), None)
                    }
                    Ok(cell) => {
                        while !cell.wait(Duration::from_millis(500)).await {
                            if cancel.load(Ordering::SeqCst) {
                                kernel.interrupt();
                            }
                        }
                        let p = cell.snapshot();
                        let (status, detail) = crate::replay::compare(original, &p);
                        (status, detail, Some(p))
                    }
                }
            };
            if let Some(p) = &progress_seen {
                imports = p.imports.clone();
                if let Some(lineage) = &p.lineage {
                    for name in lineage["created"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                        origins.insert(name.to_string(), Origin { created: Some(original.id), modified: None });
                    }
                    for name in lineage["modified"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                        origins.entry(name.to_string()).or_default().modified = Some(original.id);
                    }
                    for name in lineage["deleted"].as_array().into_iter().flatten().filter_map(Value::as_str) {
                        origins.remove(name);
                    }
                }
            }
            match status {
                "same" => summary.same += 1,
                "files" => summary.files += 1,
                "differs" => summary.differs += 1,
                "error" => summary.error += 1,
                _ => summary.skipped += 1,
            }
            let mut marked = original.clone();
            marked.replay = Some(ReplayMark { at: at.clone(), status: status.to_string(), detail });
            let journal = self.journal.clone();
            let stored = marked.clone();
            let _ = tokio::task::spawn_blocking(move || journal.rewrite(&stored)).await;
            self.emit(CellEvent {
                thread_id: thread_id.to_string(),
                phase: "finished",
                cell: panel_view(&marked),
            });
        }
        summary.cancelled = cancel.load(Ordering::SeqCst);
        progress(cells.len(), cells.len(), None);
        let _ = tokio::task::spawn_blocking(move || backup.restore()).await;
        let _ = std::fs::remove_dir_all(&figures);
        // Aucun noyau vivant : le rejeu devient le noyau du fil, son état
        // reconstruit cellule par cellule.
        let lock = self.thread_lock(thread_id);
        let _guard = lock.lock().await;
        let live = self.slot(thread_id).is_some_and(|s| s.kernel.is_alive());
        if !live && kernel.is_alive() && !summary.cancelled && summary.error == 0 {
            let mut kernel = kernel;
            // Même session que les cellules rejouées : un prochain rejeu
            // repart de toutes, pas seulement des cellules d'après.
            kernel.info.started_at = session;
            let snapshot = self.snapshot_env(&kernel.info).await;
            let slot = Arc::new(Slot {
                kernel,
                env: Arc::new(snapshot),
                origins: Mutex::new(origins),
                imports: Mutex::new(imports),
                last_used: Mutex::new(Instant::now()),
                pending: Mutex::new(None),
            });
            self.slots
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(thread_id.to_string(), slot);
            summary.adopted = true;
        } else {
            kernel.shutdown().await;
        }
        Ok(summary)
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
            Some(slot) => {
                let imports = slot.imports.lock().unwrap_or_else(|e| e.into_inner()).clone();
                KernelStatus {
                    running: true,
                    kernel: Some(slot.kernel.info.clone()),
                    busy_cell: slot.kernel.running().map(|c| c.id),
                    idle_seconds: Some(slot.idle().as_secs()),
                    packages: slot
                        .env
                        .versions(&imports)
                        .into_iter()
                        .take(STATUS_PACKAGES_MAX)
                        .map(|(name, version)| json!({"name": name, "version": version}))
                        .collect(),
                    packages_total: Some(slot.env.packages.len()),
                    env_sha256: Some(slot.env.sha256.clone()),
                }
            }
            None => KernelStatus {
                running: false,
                kernel: None,
                busy_cell: None,
                idle_seconds: None,
                packages: Vec::new(),
                packages_total: None,
                env_sha256: None,
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
    purpose: Option<String>,
    author: Option<String>,
    from_cell: Option<u64>,
    resumed_from: Option<ResumedFrom>,
    turn_prompt: Option<String>,
    prints: Arc<PrintCache>,
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
        let cache = self.prints.clone();
        let to_print: Vec<String> = read.iter().chain(written.iter()).cloned().collect();
        let prints = tokio::task::spawn_blocking(move || {
            let mut budget = HASH_CELL_BUDGET_BYTES;
            to_print
                .iter()
                .filter_map(|f| cache.print(Path::new(f), &mut budget))
                .collect::<Vec<_>>()
        })
        .await
        .unwrap_or_default();
        let lineage = p.lineage.as_ref().map(|l| self.lineage(l));
        *self.slot.imports.lock().unwrap_or_else(|e| e.into_inner()) = p.imports.clone();
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
            figures: p.figures,
            truncated: p.truncated,
            env: info.env.name.clone(),
            python: info.executable.clone(),
            python_version: info.python_version.clone(),
            cwd: info.cwd.display().to_string(),
            purpose: self.purpose.clone(),
            author: self.author.clone(),
            from_cell: self.from_cell,
            resumed_from: self.resumed_from.clone(),
            turn_prompt: self.turn_prompt.clone(),
            session: Some(info.started_at.clone()),
            prints,
            imports: p.imports,
            env_sha256: Some(self.slot.env.sha256.clone()).filter(|s| !s.is_empty()),
            lineage,
            replay: None,
            prev_sha256: None,
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

impl Finisher {
    /// Lignée de la cellule d'après le pilote, avec la cellule d'origine de
    /// chaque variable lue ; met à jour les origines du noyau.
    fn lineage(&self, raw: &Value) -> Lineage {
        let names = |key: &str| -> Vec<String> {
            raw[key]
                .as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default()
        };
        let mut origins = self.slot.origins.lock().unwrap_or_else(|e| e.into_inner());
        let uses = names("used")
            .into_iter()
            .map(|name| {
                let cell = origins.get(&name).and_then(Origin::last);
                VarUse { name, cell }
            })
            .collect();
        let lineage = Lineage {
            created: names("created"),
            modified: names("modified"),
            deleted: names("deleted"),
            uses,
        };
        let id = self.cell.id;
        for name in &lineage.created {
            origins.insert(name.clone(), Origin { created: Some(id), modified: None });
        }
        for name in &lineage.modified {
            origins.entry(name.clone()).or_default().modified = Some(id);
        }
        for name in &lineage.deleted {
            origins.remove(name);
        }
        lineage
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
    if !r.figures.is_empty() {
        o.insert("figures".into(), json!(r.figures));
        o.insert(
            "figuresHint".into(),
            json!("Figures captées en PNG. Pour en montrer une dans ta réponse : ![légende](chemin absolu). L'utilisateur peut l'enregistrer dans la galerie du projet."),
        );
    }
    if r.truncated > 0 {
        o.insert("truncatedBytes".into(), json!(r.truncated));
    }
    if r.status == "ok" {
        o.insert(
            "citeAs".into(),
            json!(format!("[cellule {}](atelier-cell:{})", r.id, r.id)),
        );
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
