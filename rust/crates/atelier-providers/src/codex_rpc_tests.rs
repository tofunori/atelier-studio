use super::*;
use std::os::unix::fs::PermissionsExt;
use tempfile::TempDir;

pub(crate) struct FakeCodex {
    pub dir: TempDir,
}
impl FakeCodex {
    pub fn new(mode: &str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("mode"), mode).unwrap();
        let script = dir.path().join("codex");
        std::fs::write(&script, r#"#!/usr/bin/env python3
import sys, os, json, time, threading
root = os.path.dirname(__file__)
mode = open(root + '/mode').read()
with open(root + '/boots', 'a') as f: f.write(str(os.getpid()) + '\n')
boots = len(open(root + '/boots').readlines())
active_turn = False
lock = threading.Lock()
log = open(root + '/requests', 'a', buffering=1)
def emit(value):
    with lock: print(json.dumps(value), flush=True)
def reply(req, result): emit({'id': req['id'], 'result': result})
def note(method, tid='native', **params): emit({'method': method, 'params': {'threadId': tid, **params}})
for line in sys.stdin:
    req = json.loads(line)
    log.write(json.dumps({'pid': os.getpid(), **req}) + '\n')
    method = req.get('method')
    p = req.get('params', {})
    if method is None:
        if mode == 'human-wait' and req.get('id') == 77:
            note('turn/completed', turn={'id': 'turn', 'status': 'completed'})
        continue
    if method == 'initialize':
        if mode == 'init-hang': continue
        if mode == 'slow-init': time.sleep(.12)
        if mode == 'init-fail-first' and boots == 1:
            emit({'id': req['id'], 'error': {'message': 'initialization failed'}})
        else: reply(req, {})
    elif method == 'initialized': pass
    elif method == 'thread/goal/get':
        reply(req, {'goal': {'objective':'snapshot','status':'active','timeUsedSeconds':10}})
        note('thread/goal/updated', goal={'objective':'newer','status':'paused','timeUsedSeconds':11})
    elif method == 'thread/goal/clear':
        note('thread/goal/cleared')
        reply(req, {})
    elif method == 'never': pass
    elif method == 'late':
        threading.Timer(2.2, lambda req=req: reply(req, 'late')).start()
    elif method == 'exit': sys.exit(1)
    elif method == 'finish-then-exit':
        reply(req, {})
        note('turn/completed', turn={'id': 'turn', 'status': 'completed'})
        sys.exit(0)
    elif method == 'thread/start' and mode.startswith('rewind'):
        reply(req, {'thread': {'id': 'new', 'turns': []}})
    elif method == 'thread/fork' and mode == 'rewind-fail':
        emit({'id': req['id'], 'error': {'message': 'fork refused'}})
    elif method == 'thread/fork' and mode.startswith('rewind'):
        reply(req, {'thread': {'id': 'new', 'turns': [] if mode == 'rewind-wrong-prefix' else [{'id': 'first'}]}})
    elif method in ['thread/start', 'thread/resume']:
        reply(req, {'thread': {'id': 'native'}, 'sandbox': {'type': 'readOnly'}})
    elif method == 'thread/read' and mode.startswith('rewind'):
        reply(req, {'thread': {'id': 'native', 'turns': [
            {'id': 'first', 'status': 'completed', 'items': [{'type': 'userMessage'}, {'type': 'userMessage'}]},
            {'id': 'second', 'status': 'inProgress' if mode == 'rewind-active' else 'completed', 'items': [{'type': 'userMessage'}]}]}})
    elif method == 'thread/read' and mode == 'silent-completed':
        reply(req, {'thread': {'id': 'native', 'turns': [{'id': 'turn', 'status': 'completed', 'items': [{'id':'m','type':'agentMessage','text':'OK'},{'id':'final','type':'agentMessage','text':'Recovered final'}]}]}})
    elif method == 'thread/read' and mode == 'turn-hang-read-unavailable':
        continue
    elif method == 'thread/read':
        reply(req, {'thread': {'id': 'native', 'turns': [{'id': 'turn', 'status': 'inProgress'}] if active_turn else []}})
    elif method == 'turn/start':
        if mode == 'start-delayed':
            def start_later():
                global active_turn
                active_turn = True
                note('turn/started', turn={'id': 'turn', 'status': 'inProgress'})
            threading.Timer(.25, start_later).start()
            continue
        active_turn = True
        note('turn/started', turn={'id': 'turn', 'status': 'inProgress'})
        if mode == 'start-rpc-hang': continue
        reply(req, {'turn': {'id': 'turn', 'status': 'inProgress'}})
        if mode == 'goal-first-turn': note('thread/goal/updated', goal={'objective':'first turn','status':'active'})
        if mode.startswith('turn-hang'): continue
        if mode == 'human-wait':
            emit({'id':77,'method':'item/tool/requestUserInput','params':{'threadId':'native','turnId':'turn','questions':[]}})
            continue
        if mode == 'child-complete':
            emit({'method':'codex/event/task_complete','params':{'msg':{'turn_id':'child'}}})
            continue
        note('item/agentMessage/delta', delta='OK')
        note('item/completed', item={'id': 'm', 'type': 'agentMessage', 'text': 'OK'})
        if mode == 'silent-completed': continue
        if mode == 'legacy-final-missing':
            emit({'method':'codex/event/task_complete','params':{'msg':{'turn_id':'turn','last_agent_message':'Recovered legacy final'}}})
            continue
        if mode in ['legacy-complete', 'legacy-and-native']:
            emit({'method':'codex/event/task_complete','params':{'msg':{'turn_id':'turn','last_agent_message':'OK'}}})
            if mode == 'legacy-complete': continue
        note('turn/completed', turn={'id': 'turn', 'status': 'completed'})
    elif method == 'turn/interrupt':
        if mode == 'turn-hang-no-ack': continue
        reply(req, {})
        if mode == 'turn-hang-ack-only': continue
        note('turn/completed', turn={'id': 'turn', 'status': 'interrupted'})
    elif 'id' in req: reply(req, {'pid': os.getpid(), 'method': method})
"#).unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        Self { dir }
    }
    pub fn server(&self) -> CodexAppServer {
        CodexAppServer::for_test(self.dir.path().join("codex"), Duration::from_secs(2))
    }
    pub fn requests(&self) -> Vec<Value> {
        std::fs::read_to_string(self.dir.path().join("requests"))
            .unwrap_or_default()
            .lines()
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect()
    }
    fn boots(&self) -> usize {
        std::fs::read_to_string(self.dir.path().join("boots"))
            .unwrap_or_default()
            .lines()
            .count()
    }
}

#[tokio::test]
async fn simultaneous_requests_share_one_ready_initialization() {
    let fake = FakeCodex::new("slow-init");
    let server = Arc::new(fake.server());
    let mut tasks = Vec::new();
    for _ in 0..8 {
        let server = server.clone();
        tasks.push(tokio::spawn(async move {
            server.request("ping", json!({})).await.unwrap()
        }));
    }
    for task in tasks {
        assert_eq!(task.await.unwrap()["method"], "ping");
    }
    assert_eq!(fake.boots(), 1);
    let requests = fake.requests();
    assert_eq!(
        requests
            .iter()
            .filter(|r| r["method"] == "initialize")
            .count(),
        1
    );
    assert_eq!(requests[0]["method"], "initialize");
    assert_eq!(requests[1]["method"], "initialized");
}

#[tokio::test]
async fn failed_initialization_can_retry_with_a_fresh_process() {
    let fake = FakeCodex::new("init-fail-first");
    let server = fake.server();
    assert!(server
        .request("ping", json!({}))
        .await
        .unwrap_err()
        .contains("initialization failed"));
    assert_eq!(
        server.request("ping", json!({})).await.unwrap()["method"],
        "ping"
    );
    assert_eq!(fake.boots(), 2);
}

#[tokio::test]
async fn initialization_timeout_closes_unready_connection_and_recovers() {
    let fake = FakeCodex::new("init-hang");
    let server = fake.server();
    assert!(server.ensure().await.unwrap_err().contains("délai dépassé"));
    let old = server.current().unwrap();
    assert!(old.is_closed());
    assert!(old.state.lock().unwrap().pending.is_empty());
    std::fs::write(fake.dir.path().join("mode"), "normal").unwrap();
    server.ensure().await.unwrap();
    old.stop("old cleanup").await;
    assert_eq!(
        server.request("ping", json!({})).await.unwrap()["method"],
        "ping"
    );
    assert_eq!(fake.boots(), 2);
}

#[tokio::test]
async fn expired_request_is_removed_and_late_reply_cannot_complete_another_request() {
    let fake = FakeCodex::new("normal");
    let server = fake.server();
    server.ensure().await.unwrap();
    assert!(server
        .request("late", json!({}))
        .await
        .unwrap_err()
        .contains("délai dépassé"));
    assert!(server
        .current()
        .unwrap()
        .state
        .lock()
        .unwrap()
        .pending
        .is_empty());
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert_eq!(
        server.request("ping", json!({})).await.unwrap()["method"],
        "ping"
    );
    assert_eq!(fake.boots(), 1);
}

#[tokio::test]
async fn cancelled_caller_removes_its_pending_request() {
    let fake = FakeCodex::new("normal");
    let server = Arc::new(fake.server());
    server.ensure().await.unwrap();
    let task_server = server.clone();
    let task = tokio::spawn(async move { task_server.request("never", json!({})).await });
    tokio::time::timeout(Duration::from_secs(1), async {
        while server
            .current()
            .unwrap()
            .state
            .lock()
            .unwrap()
            .pending
            .is_empty()
        {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    task.abort();
    let _ = task.await;
    assert!(server
        .current()
        .unwrap()
        .state
        .lock()
        .unwrap()
        .pending
        .is_empty());
    assert_eq!(
        server.request("ping", json!({})).await.unwrap()["method"],
        "ping"
    );
}

#[tokio::test]
async fn process_exit_fails_pending_requests_then_allows_recovery() {
    let fake = FakeCodex::new("normal");
    let server = fake.server();
    let error = server.request("exit", json!({})).await.unwrap_err();
    assert!(error.contains("terminé"), "{error}");
    assert_eq!(
        server.request("ping", json!({})).await.unwrap()["method"],
        "ping"
    );
    assert_eq!(fake.boots(), 2);
}

#[tokio::test]
async fn terminal_notification_is_dispatched_before_eof_failure() {
    let fake = FakeCodex::new("normal");
    let server = fake.server();
    server.ensure().await.unwrap();
    let statuses = Arc::new(StdMutex::new(Vec::new()));
    let observed = statuses.clone();
    server
        .set_handler(
            "native",
            Arc::new(move |_, params| {
                observed
                    .lock()
                    .unwrap()
                    .push(params["turn"]["status"].clone());
            }),
        )
        .await;
    let _ = server.request("finish-then-exit", json!({})).await;
    tokio::time::timeout(Duration::from_secs(1), async {
        while !server.current().unwrap().is_closed() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    assert_eq!(statuses.lock().unwrap()[0], "completed");
}

#[tokio::test]
async fn bound_thread_requests_and_cleanup_never_migrate_to_replacement_process() {
    let fake = FakeCodex::new("normal");
    let server = fake.server();
    let (_, old) = server.open_thread("thread/start", json!({})).await.unwrap();
    assert!(server.request("exit", json!({})).await.is_err());
    server.ensure().await.unwrap();
    let connection = server.current().unwrap();
    let called = Arc::new(AtomicBool::new(false));
    let flag = called.clone();
    server
        .set_handler(
            "native",
            Arc::new(move |_, _| {
                flag.store(true, Ordering::SeqCst);
            }),
        )
        .await;
    assert!(old
        .request("thread/settings/update", json!({"threadId":"native"}))
        .await
        .is_err());
    drop(old);
    connection.dispatch(json!({"method":"turn/completed","params":{"threadId":"native","turn":{"status":"completed"}}}));
    assert!(called.load(Ordering::SeqCst));
    assert!(!fake
        .requests()
        .iter()
        .any(|r| r["method"] == "thread/settings/update"));
}

#[tokio::test]
async fn goal_observer_keeps_rpc_order_without_a_turn_handler() {
    let fake = FakeCodex::new("normal");
    let server = fake.server();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    server.set_goal_observer(Arc::new(move |method, params| { tx.send((method.to_string(), params.clone())).unwrap(); }));
    server.request("thread/goal/get", json!({"threadId":"native"})).await.unwrap();
    let first = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await.unwrap().unwrap();
    let second = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await.unwrap().unwrap();
    assert_eq!(first.1["goal"]["objective"], "snapshot");
    assert_eq!(second.1["goal"]["objective"], "newer");
    server.clear_handler("native").await;
    server.request("thread/goal/clear", json!({"threadId":"native"})).await.unwrap();
    let cleared = tokio::time::timeout(Duration::from_secs(2), rx.recv()).await.unwrap().unwrap();
    assert_eq!(cleared.0, "thread/goal/cleared");
}
