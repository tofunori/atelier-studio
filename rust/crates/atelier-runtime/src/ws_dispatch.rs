//! Admission and execution policy shared by desktop WebSocket connections.
use crate::state::AppState;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    future::Future,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, Weak,
    },
    time::Duration,
};
use tokio::sync::{watch, OwnedSemaphorePermit, Semaphore};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Class {
    Control,
    Terminal,
    Read,
    FastRead,
    History,
    Ordered,
}

pub(crate) fn classify(kind: &str) -> Class {
    match kind {
        "interrupt" | "permissionResponse" | "interactionResponse" => Class::Control,
        "termOpen" | "termInput" | "termResize" | "termClose" => Class::Terminal,
        "providerStatus" | "status" | "receiptStatus" | "setupStatus" | "listThreads" | "getSettings"
        | "listHighlights" | "listAutomations" => Class::FastRead,
        "getHistory" | "getAgentHistory" => Class::History,
        "clientLog"
        | "getLedger"
        | "listFiles"
        | "projectFolderCatalog"
        | "narvalStatus"
        | "narvalSnapshot"
        | "narvalListDirectory"
        | "narvalInspectJob"
        | "narvalRunFiles"
        | "narvalReadText"
        | "computeSnapshot"
        | "computeReadLog"
        | "listCommands"
        | "listPlugins"
        | "listPasted"
        | "kbList"
        | "kbGbrainPage"
        | "kbSourceText"
        | "getTurnContextPreview"
        | "articleList"
        | "gbrainSearch"
        | "apiProviders"
        | "listApiModels"
        | "scanLocal"
        | "checkFrame"
        | "gitStatus"
        | "gitLog"
        | "gitCommitDetails"
        | "gitCommitFileDiff"
        | "gitDiff"
        | "zoteroSearch"
        | "zoteroDigest"
        | "generateCommitMsg"
        | "reformulerConsigne"
        | "zoteroCollections"
        | "listSessions"
        | "getUsage"
        | "listPins" => Class::Read,
        _ => Class::Ordered,
    }
}

/// None is a global barrier. Only audited single-thread actions get a lane.
pub(crate) fn lane(request: &Value) -> Option<String> {
    let kind = request["type"].as_str().unwrap_or("");
    if kind == "send" && request.get("handoffFromThreadId").is_some() {
        return None;
    }
    let id = match kind {
        "upsertThread" => request.pointer("/thread/id").or_else(|| request.get("id")),
        "send" | "renameThread" | "moveThread" | "deleteThread" | "prepareMessageEdit"
        | "codexCompact" | "codexClear" | "goalSet" | "goalGet" | "goalClear" => {
            request.get("threadId")
        }
        _ => None,
    };
    id.and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

pub(crate) struct Budget {
    pub reads: Arc<Semaphore>,
    pub controls: Arc<Semaphore>,
    pub ordered: Arc<Semaphore>,
    pub bytes: Arc<Semaphore>,
    fast_reads: Arc<Semaphore>,
    histories: Arc<Semaphore>,
    read_workers: Arc<Semaphore>,
    history_workers: Arc<Semaphore>,
    history_bytes: Arc<Semaphore>,
    terminals: Arc<Semaphore>,
    control_bytes: Arc<Semaphore>,
    read_bytes: Arc<Semaphore>,
    fast_bytes: Arc<Semaphore>,
    terminal_bytes: Arc<Semaphore>,
    order: Mutex<Order>,
    admission: Mutex<()>,
    history_revision: AtomicU64,
    control_order: Mutex<Order>,
    sends: Mutex<HashMap<String, Vec<Weak<AtomicBool>>>>,
}
impl Default for Budget {
    fn default() -> Self {
        Self {
            reads: Arc::new(Semaphore::new(64)),
            controls: Arc::new(Semaphore::new(16)),
            ordered: Arc::new(Semaphore::new(64)),
            bytes: Arc::new(Semaphore::new(64 * 1024)),
            fast_reads: Arc::new(Semaphore::new(16)),
            histories: Arc::new(Semaphore::new(16)),
            read_workers: Arc::new(Semaphore::new(8)),
            history_workers: Arc::new(Semaphore::new(8)),
            history_bytes: Arc::new(Semaphore::new(1024)),
            terminals: Arc::new(Semaphore::new(16)),
            control_bytes: Arc::new(Semaphore::new(1024)),
            read_bytes: Arc::new(Semaphore::new(16 * 1024)),
            fast_bytes: Arc::new(Semaphore::new(1024)),
            terminal_bytes: Arc::new(Semaphore::new(1024)),
            order: Mutex::new(Order::default()),
            admission: Mutex::new(()),
            history_revision: AtomicU64::new(0),
            control_order: Mutex::new(Order::default()),
            sends: Mutex::new(HashMap::new()),
        }
    }
}
impl Budget {
    pub fn admit(
        &self,
        class: Class,
        bytes: usize,
    ) -> Option<(OwnedSemaphorePermit, OwnedSemaphorePermit)> {
        let semaphore = match class {
            Class::Read => &self.reads,
            Class::FastRead => &self.fast_reads,
            Class::History => &self.histories,
            Class::Control => &self.controls,
            Class::Terminal => &self.terminals,
            Class::Ordered => &self.ordered,
        };
        let slot = semaphore.clone().try_acquire_owned().ok()?;
        let memory_budget = match class {
            Class::Control => &self.control_bytes,
            Class::Terminal => &self.terminal_bytes,
            Class::Read => &self.read_bytes,
            Class::FastRead => &self.fast_bytes,
            Class::History => &self.history_bytes,
            Class::Ordered => &self.bytes,
        };
        let units = u32::try_from(bytes.div_ceil(1024).max(1)).ok()?;
        let memory = memory_budget.clone().try_acquire_many_owned(units).ok()?;
        Some((slot, memory))
    }
    pub fn prepare(
        self: &Arc<Self>,
        request: &Value,
        class: Class,
    ) -> (Option<Reservation>, Option<PendingSend>) {
        // One linearization point across sockets: no Stop can slip between
        // reserving a send's order and registering its cancellation token.
        let _admission = self.admission.lock().unwrap();
        let kind = request["type"].as_str().unwrap_or("");
        let order = if kind == "interrupt" {
            let id = request["threadId"].as_str().unwrap_or("");
            self.cancel_sends(id);
            Some(self.reserve_interrupt(id))
        } else if class == Class::Terminal {
            Some(self.reserve_control(request["termId"].as_str().unwrap_or("")))
        } else {
            (class == Class::Ordered).then(|| self.reserve_order(lane(request).as_deref()))
        };
        (order, self.register_send(request))
    }
    pub fn reserve_order(&self, lane: Option<&str>) -> Reservation {
        Self::reserve(&self.order, lane)
    }
    pub fn reserve_control(&self, key: &str) -> Reservation {
        Self::reserve(&self.control_order, Some(key))
    }
    fn reserve(order: &Mutex<Order>, lane: Option<&str>) -> Reservation {
        let mut order = order.lock().unwrap();
        order.prune();
        let mut dependencies = order.global.iter().cloned().collect::<Vec<_>>();
        let (complete, tail) = watch::channel(false);
        if let Some(id) = lane {
            if let Some(previous) = order.lanes.insert(id.into(), vec![tail]) {
                dependencies.extend(previous);
            }
        } else {
            dependencies.extend(order.lanes.drain().flat_map(|(_, tails)| tails));
            order.global = Some(tail);
        }
        Reservation {
            dependencies,
            _complete: complete,
        }
    }
    pub fn reserve_interrupt(&self, id: &str) -> Reservation {
        let (complete, tail) = watch::channel(false);
        // Stop runs immediately; later sends await both the prior send and Stop.
        let mut order = self.order.lock().unwrap();
        order.prune();
        order.lanes.entry(id.into()).or_default().push(tail);
        Reservation {
            dependencies: Vec::new(),
            _complete: complete,
        }
    }
    pub fn register_send(self: &Arc<Self>, request: &Value) -> Option<PendingSend> {
        if request["type"] != "send" {
            return None;
        }
        let id = request["threadId"].as_str()?.to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        self.sends
            .lock()
            .unwrap()
            .entry(id.clone())
            .or_default()
            .push(Arc::downgrade(&cancelled));
        Some(PendingSend {
            id,
            cancelled,
            budget: self.clone(),
        })
    }
    pub fn cancel_sends(&self, id: &str) {
        if let Some(sends) = self.sends.lock().unwrap().get(id) {
            for flag in sends.iter().filter_map(Weak::upgrade) {
                flag.store(true, Ordering::SeqCst);
            }
        }
    }
}

#[derive(Default)]
struct Order {
    global: Option<watch::Receiver<bool>>,
    lanes: HashMap<String, Vec<watch::Receiver<bool>>>,
}
impl Order {
    fn prune(&mut self) {
        self.lanes.retain(|_, tails| {
            tails.retain(|tail| tail.has_changed().is_ok());
            !tails.is_empty()
        });
    }
}
pub(crate) struct Reservation {
    dependencies: Vec<watch::Receiver<bool>>,
    _complete: watch::Sender<bool>,
}
impl Reservation {
    async fn wait(&mut self) {
        for previous in &mut self.dependencies {
            let _ = previous.changed().await;
        }
    }
}

pub(crate) struct PendingSend {
    id: String,
    pub cancelled: Arc<AtomicBool>,
    budget: Arc<Budget>,
}
impl Drop for PendingSend {
    fn drop(&mut self) {
        let mut sends = self.budget.sends.lock().unwrap();
        if let Some(flags) = sends.get_mut(&self.id) {
            flags.retain(|weak| {
                weak.upgrade()
                    .is_some_and(|flag| !Arc::ptr_eq(&flag, &self.cancelled))
            });
            if flags.is_empty() {
                sends.remove(&self.id);
            }
        }
    }
}

tokio::task_local! { static SEND_CANCELLED: Arc<AtomicBool>; static WORK_CLASS: Class; static INTERRUPT_ADMITTED: bool; }
pub(crate) fn interruption_admitted() -> bool {
    INTERRUPT_ADMITTED.try_with(|v| *v).unwrap_or(false)
}
pub(crate) fn send_cancel_flag() -> Arc<AtomicBool> {
    SEND_CANCELLED
        .try_with(Arc::clone)
        .unwrap_or_else(|_| Arc::new(AtomicBool::new(false)))
}

pub(crate) fn failure(request: &Value, code: &str, message: &str) -> String {
    let mut error = json!({"type":"error", "code":code, "message":message,
        "requestType":request["type"], "requestId":request["requestId"],
        "threadId":request.get("threadId").or_else(|| request.pointer("/thread/id")),
        "clientMessageId":request["clientMessageId"], "projectRoot":request["projectRoot"],
        "retryable": code == "REQUEST_BUSY"});
    if request["type"] == "listPlugins" {
        error["type"] = json!("plugins");
        error["plugins"] = json!([]);
        error["error"] = json!(message);
    }
    if request["type"] == "projectFolderCatalog" {
        error["type"] = json!("projectFolderCatalog");
        error["sources"] = json!([]);
        error["error"] = json!(message);
    }
    // Keep the response envelopes expected by component-level loading states.
    let response_type = match request["type"].as_str().unwrap_or("") {
        "gitDiff" | "gitStatus" | "gitLog" | "gitCommitDetails" | "gitCommitFileDiff" => {
            request["type"].as_str()
        }
        "kbGbrainPage" => Some("gbrainPage"),
        "gbrainSearch" => Some("gbrainResults"),
        "generateCommitMsg" => Some("commitMsg"),
        "reformulerConsigne" => Some("consigneReformulee"),
        "narvalListDirectory" => Some("narvalDirectory"),
        "narvalInspectJob" => Some("narvalJobDetail"),
        "narvalReadText" => Some("narvalText"),
        "narvalStatus" | "narvalSnapshot" | "narvalRunFiles" | "computeSnapshot" => {
            request["type"].as_str()
        }
        "computeReadLog" => Some("computeLog"),
        _ => None,
    };
    if let Some(kind) = response_type {
        error["type"] = json!(kind);
        error["error"] = if kind.starts_with("narval") || kind.starts_with("compute") {
            json!({"code":code,"message":message})
        } else {
            json!(message)
        };
        for key in ["path", "scope", "baseSha", "slug", "query", "sha"] {
            error[key] = request[key].clone();
        }
        if kind == "gitDiff" {
            error["diff"] = json!("");
        }
        if kind == "gitLog" {
            error["commits"] = json!([]);
            error["hasMore"] = json!(false);
        }
        if kind == "gbrainPage" {
            error["markdown"] = json!("");
        }
        if kind == "gbrainResults" {
            error["results"] = json!([]);
        }
    }
    error.to_string()
}

pub(crate) struct Work {
    pub request: Value,
    pub text: String,
    pub class: Class,
    pub order: Option<Reservation>,
    pub permits: (OwnedSemaphorePermit, OwnedSemaphorePermit),
    pub send: Option<PendingSend>,
    pub execution_slots: Option<Arc<Semaphore>>,
}

/// Synchronous route work runs off Tokio's network workers. On cancellation a
/// stuck OS call retains the global permit, so reconnects cannot spawn replacements.
pub(crate) async fn execute<F, Fut>(
    work: Work,
    state: AppState,
    route: F,
    mut disconnected: watch::Receiver<bool>,
    deadline: Duration,
) -> Vec<String>
where
    F: Fn(AppState, String) -> Fut + Send + 'static,
    Fut: Future<Output = Vec<String>> + Send + 'static,
{
    let request = work.request.clone();
    let class = work.class;
    // Admission bounds pending memory; execution bounds actual work. A normal
    // startup burst waits here without occupying a network or blocking worker.
    let queued_at = tokio::time::Instant::now();
    let execution = if let Some(local) = &work.execution_slots {
        let global = if class == Class::History {
            state.ws_budget().history_workers.clone()
        } else {
            state.ws_budget().read_workers.clone()
        };
        let acquire = async {
            let local = local.clone().acquire_owned().await.unwrap();
            let global = global.acquire_owned().await.unwrap();
            (local, global)
        };
        tokio::select! {
            permits = acquire => Some(permits),
            _ = tokio::time::sleep(deadline) => return vec![failure(&request, "REQUEST_TIMEOUT", "La lecture n'a pas pu démarrer dans le délai prévu. Réessayez.")],
            _ = disconnected.wait_for(|value| *value) => return Vec::new(),
        }
    } else {
        None
    };
    let deadline = deadline.saturating_sub(queued_at.elapsed());
    let context = request.clone();
    let history_budget = state.ws_budget().clone();
    let history_epoch = state.threads_epoch().to_string();
    let history_revision = history_budget.history_revision.load(Ordering::SeqCst);
    let runtime = tokio::runtime::Handle::current();
    let (cancel, mut cancelled) = watch::channel(false);
    let mut job = tokio::task::spawn_blocking(move || {
        let _permits = work.permits;
        let _execution = execution;
        runtime.block_on(async move {
            let run = async move {
                // Reservations are taken synchronously on receipt, before task scheduling.
                let mut _order = work.order;
                if let Some(order) = &mut _order {
                    order.wait().await;
                }
                let _pending_send = work.send;
                let replies = if let Some(send) = &_pending_send {
                    if send.cancelled.load(Ordering::SeqCst) {
                        vec![failure(&work.request, "REQUEST_CANCELLED", "Envoi annulé avant son démarrage.")]
                    } else {
                        SEND_CANCELLED.scope(send.cancelled.clone(), route(state, work.text)).await
                    }
                } else { route(state, work.text).await };
                // Allocate the version before releasing the action's reservation.
                let revision = if class == Class::Ordered {
                    history_budget.history_revision.fetch_add(1, Ordering::SeqCst) + 1
                } else { history_revision };
                (replies, revision)
            };
            tokio::select! {
                (result, revision) = INTERRUPT_ADMITTED.scope(context["type"] == "interrupt", WORK_CLASS.scope(class, run)) => {
                    result.into_iter().map(|text| {
                    let Ok(mut reply) = serde_json::from_str::<Value>(&text) else { return text; };
                    if reply["type"] == "history" || reply["type"] == "reverted" {
                        reply["historyRevision"] = json!(revision);
                        reply["historyEpoch"] = json!(history_epoch);
                    }
                    if reply["type"] == "error" {
                        if let Some(object) = reply.as_object_mut() {
                            for key in ["requestType", "requestId", "threadId", "clientMessageId"] {
                                if !object.contains_key(key) { object.insert(key.into(), if key == "requestType" { context["type"].clone() } else { context[key].clone() }); }
                            }
                        }
                    }
                    reply.to_string()
                }).collect()
                },
                _ = cancelled.wait_for(|value| *value) => Vec::new(),
            }
        })
    });
    if matches!(class, Class::Ordered | Class::Control | Class::Terminal) {
        let _keep_cancel_sender = cancel;
        // Accepted mutations keep their ownership across disconnects. Never
        // drop half of an edit or silently replay an accepted send.
        return job.await.unwrap_or_else(|_| {
            vec![failure(
                &request,
                "REQUEST_FAILED",
                "La requête a échoué pendant son exécution.",
            )]
        });
    }
    tokio::select! {
        result = &mut job => result.unwrap_or_else(|_| vec![failure(&request, "REQUEST_FAILED", "La requête a échoué pendant son exécution.")]),
        _ = tokio::time::sleep(deadline) => {
            let _ = cancel.send(true);
            vec![failure(&request, "REQUEST_TIMEOUT", "La requête a dépassé son délai. Réessayez dans quelques secondes.")]
        }
        _ = disconnected.wait_for(|value| *value), if matches!(class, Class::Read | Class::FastRead | Class::History) => {
            let _ = cancel.send(true);
            Vec::new()
        }
    }
}

/// Nested disk/SSH workers keep their permits even if their awaiting RPC expires.
pub(crate) async fn blocking<F, T>(work: F) -> Result<T, tokio::task::JoinError>
where
    F: FnOnce() -> T + Send + 'static,
    T: Send + 'static,
{
    static READS: Semaphore = Semaphore::const_new(8);
    static HISTORIES: Semaphore = Semaphore::const_new(8);
    static ACTIONS: Semaphore = Semaphore::const_new(8);
    let workers = if WORK_CLASS
        .try_with(|class| *class == Class::History)
        .unwrap_or(false)
    {
        &HISTORIES
    } else if WORK_CLASS
        .try_with(|class| matches!(class, Class::Read | Class::FastRead | Class::History))
        .unwrap_or(false)
    {
        &READS
    } else {
        &ACTIONS
    };
    let permit = workers.acquire().await.expect("static semaphore");
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        work()
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn audited_route_inventory_cannot_gain_an_implicit_global_barrier() {
        let ordered = [
            "send",
            "renameThread",
            "moveThread",
            "deleteThread",
            "createAutomation",
            "updateAutomation",
            "deleteAutomation",
            "runAutomationNow",
            "addHighlight",
            "removeHighlight",
            "saveSettings",
            "upsertThread",
            "computeForgetRun",
            "clearPasted",
            "saveImage",
            "kbAdd",
            "kbCollection",
            "kbTag",
            "kbArchive",
            "kbRemove",
            "kbPromote",
            "kbPromotePage",
            "articleImport",
            "articleImportDoi",
            "articleWrite",
            "articleDraft",
            "generateImage",
            "saveApiProvider",
            "deleteApiProvider",
            "gitCreateBranchAt",
            "gitRestoreFileFromCommit",
            "gitRevertCommit",
            "gitUndoCommit",
            "gitResetToCommit",
            "gitFetch",
            "gitSwitchBranch",
            "gitCreateBranch",
            "gitDeleteBranch",
            "gitMergeBranch",
            "gitStage",
            "gitUnstage",
            "gitRevertFile",
            "gitCommit",
            "gitPush",
            "gitPull",
            "gitIgnore",
            "gitUndoLastTurn",
            "zoteroFav",
            "zoteroAddPdf",
            "exportThread",
            "savePlan",
            "exportPlan",
            "importSession",
            "forkThread",
            "prepareMessageEdit",
            "createLinkedThread",
            "mentionAgent",
            "setLinkedThreadPaused",
            "unlinkThread",
            "revert",
            "clientHello",
            "retitleAll",
            "requestReview",
            "quickAsk",
            "qaPromote",
            "codexCompact",
            "codexClear",
            "goalSet",
            "goalGet",
            "goalClear",
            "pinPassage",
            "unpinPassage",
        ];
        for kind in crate::ws_router::ALL_MESSAGE_TYPES {
            if *kind == "ping" {
                continue;
            }
            assert_eq!(
                classify(kind) == Class::Ordered,
                ordered.contains(kind),
                "classify new route explicitly: {kind}"
            );
        }
        assert_eq!(classify("futureUnknownMutation"), Class::Ordered);
    }
    #[test]
    fn read_memory_saturation_cannot_consume_control_or_send_capacity() {
        let budget = Budget::default();
        let _a = budget.admit(Class::Read, 8 * 1024 * 1024).unwrap();
        let _b = budget.admit(Class::Read, 8 * 1024 * 1024).unwrap();
        assert!(budget.admit(Class::Read, 1).is_none());
        assert!(budget.admit(Class::Control, 1024).is_some());
        assert!(budget.admit(Class::Terminal, 1024).is_some());
        assert!(budget.admit(Class::FastRead, 1024).is_some());
        assert!(budget.admit(Class::Ordered, 1024).is_some());
    }
    #[test]
    fn completed_interrupts_do_not_accumulate_without_intervening_sends() {
        let budget = Arc::new(Budget::default());
        for index in 0..1000 {
            let request = json!({"type":"interrupt", "threadId":format!("thread-{index}")});
            let reservation = budget.prepare(&request, Class::Control);
            drop(reservation);
            assert!(budget.order.lock().unwrap().lanes.len() <= 1);
        }
    }
}
