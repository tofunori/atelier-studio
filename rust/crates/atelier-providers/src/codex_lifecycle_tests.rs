use super::*;
use crate::codex_rpc::tests::FakeCodex;
use std::sync::atomic::AtomicUsize;

fn provider(fake: &FakeCodex) -> CodexProvider {
    CodexProvider {
        server: Arc::new(fake.server()),
        active: Arc::default(),
        settled_models: Arc::default(),
        idle: Duration::from_millis(100),
        stop_wait: Duration::from_millis(150),
    }
}
fn request(
    events: Arc<StdMutex<Vec<Value>>>,
    probes: Arc<AtomicUsize>,
    cancel: Arc<AtomicBool>,
) -> SendRequest {
    SendRequest {
        additional_directories: vec![],
        thread_id: "ui".into(),
        turn_id: "ui-turn".into(),
        prompt: "test".into(),
        inputs: None,
        project_root: "/tmp".into(),
        session_id: None,
        model: None,
        effort: None,
        fast_mode: false,
        permission_mode: None,
        fork_pending: false,
        mode: SendMode::Normal,
        on_event: Arc::new(move |e| events.lock().unwrap().push(e)),
        on_interaction: None,
        is_cancelled: Arc::new(move || {
            probes.fetch_add(1, Ordering::SeqCst);
            cancel.load(Ordering::SeqCst)
        }),
        consigne: None,
        atelier_mcp: None,
    }
}
fn interrupts(fake: &FakeCodex) -> usize {
    fake.requests()
        .iter()
        .filter(|r| r["method"] == "turn/interrupt")
        .count()
}
#[tokio::test]
async fn completed_turn_leaves_no_cancellation_watcher() {
    let fake = FakeCodex::new("normal");
    let provider = provider(&fake);
    let events = Arc::default();
    let probes = Arc::new(AtomicUsize::new(0));
    assert!(
        provider
            .send(request(events, probes.clone(), Arc::default()))
            .await
            .ok
    );
    let count = probes.load(Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(250)).await;
    assert_eq!(probes.load(Ordering::SeqCst), count);
    assert!(provider.active.lock().unwrap().is_empty());
    assert_eq!(interrupts(&fake), 0);
}
#[tokio::test]
async fn idle_turn_requests_interrupt_and_reports_confirmed_stop_once() {
    let fake = FakeCodex::new("turn-hang");
    let provider = provider(&fake);
    let events = Arc::new(StdMutex::new(vec![]));
    let result = provider
        .send(request(events.clone(), Arc::default(), Arc::default()))
        .await;
    assert!(!result.ok);
    assert!(result.error.unwrap().contains("arrêt confirmé"));
    assert_eq!(interrupts(&fake), 1);
    let events = events.lock().unwrap();
    let terminals: Vec<_> = events
        .iter()
        .filter(|e| e["kind"] == "error" || e["kind"] == "done")
        .collect();
    assert_eq!(terminals.len(), 1);
    assert!(terminals[0]["message"]
        .as_str()
        .unwrap()
        .contains("arrêt confirmé"));
    assert!(provider.active.lock().unwrap().is_empty());
}
#[tokio::test]
async fn interrupt_ack_without_terminal_never_claims_a_confirmed_stop() {
    for mode in ["turn-hang-no-ack", "turn-hang-ack-only"] {
        let fake = FakeCodex::new(mode);
        let provider = provider(&fake);
        let start = tokio::time::Instant::now();
        let result = provider
            .send(request(Arc::default(), Arc::default(), Arc::default()))
            .await;
        assert!(!result.ok);
        assert!(result.error.unwrap().contains("arrêt non confirmé"));
        assert!(start.elapsed() < Duration::from_secs(3));
        assert_eq!(interrupts(&fake), 1);
    }
}
#[tokio::test]
async fn missing_start_ack_interrupts_the_turn_identified_by_notification() {
    let fake = FakeCodex::new("start-rpc-hang");
    let provider = provider(&fake);
    let result = provider
        .send(request(Arc::default(), Arc::default(), Arc::default()))
        .await;
    assert!(!result.ok);
    let error = result.error.unwrap();
    assert!(error.contains("turn/start: délai dépassé"), "{error}");
    assert!(error.contains("arrêt confirmé"));
    assert_eq!(interrupts(&fake), 1);
}
#[tokio::test]
async fn cancellation_during_start_ack_wait_is_bounded_and_cleans_up() {
    let fake = FakeCodex::new("start-rpc-hang");
    let provider = Arc::new(provider(&fake));
    let cancelled = Arc::new(AtomicBool::new(false));
    let req = request(Arc::default(), Arc::default(), cancelled.clone());
    let p = provider.clone();
    let send = tokio::spawn(async move { p.send(req).await });
    tokio::time::timeout(Duration::from_secs(2), async {
        while !fake.requests().iter().any(|r| r["method"] == "turn/start") {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    cancelled.store(true, Ordering::SeqCst);
    let result = tokio::time::timeout(Duration::from_secs(1), send)
        .await
        .unwrap()
        .unwrap();
    assert!(result
        .error
        .unwrap()
        .contains("annulation demandée — arrêt confirmé"));
    assert!(provider.active.lock().unwrap().is_empty());
    assert_eq!(interrupts(&fake), 1);
}
#[tokio::test]
async fn dropped_send_interrupts_on_its_connection_and_releases_active_turn() {
    let fake = FakeCodex::new("turn-hang");
    let provider = Arc::new(provider(&fake));
    let p = provider.clone();
    let send = tokio::spawn(async move {
        p.send(request(Arc::default(), Arc::default(), Arc::default()))
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), async {
        while provider
            .active
            .lock()
            .unwrap()
            .get("ui")
            .and_then(|t| t.turn_id.as_ref())
            .is_none()
        {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    send.abort();
    let _ = send.await;
    assert!(provider.active.lock().unwrap().is_empty());
    tokio::time::timeout(Duration::from_secs(1), async {
        while interrupts(&fake) == 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn dropped_send_before_ack_or_started_still_interrupts_delayed_native_turn() {
    let fake = FakeCodex::new("start-delayed");
    let provider = Arc::new(provider(&fake));
    let p = provider.clone();
    let send = tokio::spawn(async move {
        p.send(request(Arc::default(), Arc::default(), Arc::default()))
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), async {
        while !fake.requests().iter().any(|r| r["method"] == "turn/start") {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert!(provider.active.lock().unwrap()["ui"].turn_id.is_none());
    send.abort();
    let _ = send.await;
    assert!(provider.active.lock().unwrap().is_empty());
    tokio::time::timeout(Duration::from_secs(2), async {
        while interrupts(&fake) == 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(interrupts(&fake), 1);
}

#[tokio::test]
async fn transport_failure_during_interrupt_cannot_confirm_native_stop() {
    let fake = FakeCodex::new("turn-hang-no-ack");
    let provider = Arc::new(provider(&fake));
    let p = provider.clone();
    let send = tokio::spawn(async move {
        p.send(request(Arc::default(), Arc::default(), Arc::default()))
            .await
    });
    tokio::time::timeout(Duration::from_secs(2), async {
        while interrupts(&fake) == 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    provider.server.fail_for_test();
    let result = send.await.unwrap();
    assert!(result.error.unwrap().contains("arrêt non confirmé"));
}

#[tokio::test]
async fn rewind_uses_persisted_session_and_exact_native_turn() {
    let fake = FakeCodex::new("rewind");
    let provider = provider(&fake);
    let result = provider.rewind_session("ui", Some("saved-session"), 99, Some("second")).await.unwrap();
    assert_eq!(result["sessionId"], "new");
    let requests = fake.requests();
    let fork = requests.iter().find(|r| r["method"] == "thread/fork").unwrap();
    assert_eq!(fork["params"], json!({"threadId":"saved-session", "lastTurnId":"first"}));
    assert!(requests.iter().any(|r| r["method"] == "thread/read" && r["params"]["includeTurns"] == true));
}

#[tokio::test]
async fn rewind_legacy_counts_user_items_and_refuses_mid_turn() {
    let fake = FakeCodex::new("rewind");
    let provider = provider(&fake);
    assert!(provider.rewind_session("ui", Some("saved"), 1, None).await.is_err());
    assert!(!fake.requests().iter().any(|r| r["method"] == "thread/fork"));
    provider.rewind_session("ui", Some("saved"), 2, None).await.unwrap();
    assert_eq!(fake.requests().last().unwrap()["params"]["lastTurnId"], "first");
}

#[tokio::test]
async fn rewind_first_message_starts_empty_session() {
    let fake = FakeCodex::new("rewind");
    let result = provider(&fake).rewind_session("ui", Some("saved"), 0, Some("first")).await.unwrap();
    assert_eq!(result, json!({"sessionId":"new", "preservesContext":false}));
    assert_eq!(fake.requests().last().unwrap()["method"], "thread/start");
}

#[tokio::test]
async fn rewind_refuses_active_missing_or_wrong_prefix_and_propagates_rpc_error() {
    for (mode, native_id) in [("rewind-active", "second"), ("rewind", "missing"), ("rewind-wrong-prefix", "second")] {
        let fake = FakeCodex::new(mode);
        assert!(provider(&fake).rewind_session("ui", Some("saved"), 0, Some(native_id)).await.is_err());
        assert!(!fake.requests().iter().any(|r| r["method"] == "thread/rollback"));
    }
    let fake = FakeCodex::new("rewind-fail");
    assert!(provider(&fake).rewind_session("ui", Some("saved"), 0, Some("second"))
        .await.unwrap_err().contains("fork refused"));
}
