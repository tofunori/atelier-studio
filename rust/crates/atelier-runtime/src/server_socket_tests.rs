use super::*;
use serde_json::json;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use tokio_tungstenite::{connect_async, tungstenite::Message as ClientFrame};

type Client =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

struct CatalogGuard(Arc<AtomicUsize>);
impl Drop for CatalogGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

struct Fixture {
    state: AppState,
    url: String,
    active: Arc<AtomicUsize>,
    task: tokio::task::JoinHandle<()>,
    _dir: tempfile::TempDir,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn fixture(deadline: Duration) -> (Client, Fixture) {
    let dir = tempfile::tempdir().unwrap();
    let state = AppState::new(
        AppPaths::from_app_dir(dir.path().into()),
        None,
        "now".into(),
        "test".into(),
        "test".into(),
        "/tmp/server".into(),
    )
    .with_test_provider("fake");
    let active = Arc::new(AtomicUsize::new(0));
    let state_handler = state.clone();
    let active_handler = active.clone();
    let app = Router::new().route(
        "/",
        get(move |ws: WebSocketUpgrade| {
            let state = state_handler.clone();
            let active = active_handler.clone();
            async move {
                ws.on_upgrade(move |socket| {
                    handle_socket_with_router(
                        socket,
                        state,
                        move |state, text| {
                            let active = active.clone();
                            async move {
                                let request: Value = serde_json::from_str(&text).unwrap();
                                if let Some(delay) = request["testDelay"].as_u64() {
                                    active.fetch_add(1, Ordering::SeqCst);
                                    let _guard = CatalogGuard(active.clone());
                                    if request["sync"] == true {
                                        std::thread::sleep(Duration::from_millis(delay));
                                    } else {
                                        tokio::time::sleep(Duration::from_millis(delay)).await;
                                    }
                                }
                                if request["probe"] == true {
                                    if request["type"] == "interrupt" {
                                        crate::send::handle_interrupt(&state, &request).await;
                                    }
                                    return vec![
                                        json!({"type":"probe", "requestId":request["requestId"]})
                                            .to_string(),
                                    ];
                                }
                                if request["type"] == "listPlugins" {
                                    active.fetch_add(1, Ordering::SeqCst);
                                    let _guard = CatalogGuard(active);
                                    tokio::time::sleep(Duration::from_millis(
                                        request["delay"].as_u64().unwrap_or(60_000),
                                    ))
                                    .await;
                                    vec![json!({"type":"plugins", "plugins":[{"name":"test"}],
                            "requestId":request["requestId"], "projectRoot":request["projectRoot"]})
                                    .to_string()]
                                } else {
                                    crate::ws_router::route_ws(&state, &text).await
                                }
                            }
                        },
                        deadline,
                    )
                })
            }
        }),
    );
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let task = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let (client, _) = connect_async(format!("ws://127.0.0.1:{port}"))
        .await
        .unwrap();
    (
        client,
        Fixture {
            state,
            url: format!("ws://127.0.0.1:{port}"),
            active,
            task,
            _dir: dir,
        },
    )
}

async fn send(client: &mut Client, message: Value) {
    client
        .send(ClientFrame::Text(message.to_string().into()))
        .await
        .unwrap();
}

async fn receive(client: &mut Client) -> Value {
    let frame = tokio::time::timeout(Duration::from_secs(2), client.next())
        .await
        .expect("socket stopped responding")
        .unwrap()
        .unwrap();
    serde_json::from_str(frame.to_text().unwrap()).unwrap()
}

#[tokio::test]
async fn slow_plugins_allow_chat_creation_streaming_and_ping_on_same_socket() {
    let (mut client, fixture) = fixture(Duration::from_secs(15)).await;
    send(
        &mut client,
        json!({"type":"listPlugins", "requestId":"slow", "projectRoot":"/p"}),
    )
    .await;
    send(&mut client, json!({"type":"ping"})).await;
    assert_eq!(receive(&mut client).await["type"], "pong");
    wait_active(&fixture, 1).await;
    send(
        &mut client,
        json!({"type":"upsertThread", "thread":{
        "id":"new-chat", "provider":"fake", "projectRoot":"", "title":"Chat test"}}),
    )
    .await;
    send(&mut client, json!({"type":"send", "threadId":"new-chat", "provider":"fake", "projectRoot":"", "prompt":"Allo"})).await;
    let mut listed = false;
    let mut answered = false;
    tokio::time::timeout(Duration::from_secs(3), async {
        while !listed || !answered {
            let message = receive(&mut client).await;
            assert_ne!(message["type"], "plugins");
            listed |= message["type"] == "threads"
                && message["threads"]
                    .as_array()
                    .is_some_and(|ts| ts.iter().any(|t| t["id"] == "new-chat"));
            answered |= message["type"] == "event" && message["event"]["kind"] == "text";
        }
    })
    .await
    .expect("chat waited for plugin discovery");
    wait_active(&fixture, 1).await;
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn plugin_timeout_is_correlated_and_does_not_poison_connection() {
    let (mut client, fixture) = fixture(Duration::from_millis(100)).await;
    let mut bus = fixture.state.subscribe_bus();
    send(
        &mut client,
        json!({"type":"listPlugins", "requestId":"timeout", "projectRoot":"/p"}),
    )
    .await;
    let reply = receive(&mut client).await;
    assert_eq!(reply["type"], "plugins");
    assert_eq!(reply["requestId"], "timeout");
    assert_eq!(reply["projectRoot"], "/p");
    assert!(reply["error"].as_str().unwrap().contains("délai"));
    wait_active(&fixture, 0).await;
    send(
        &mut client,
        json!({"type":"listPlugins", "requestId":"next", "projectRoot":"/next", "delay":1}),
    )
    .await;
    let reply = receive(&mut client).await;
    assert_eq!(reply["requestId"], "next");
    assert_eq!(reply["plugins"][0]["name"], "test");
    assert!(
        bus.try_recv().is_err(),
        "private plugin replies leaked onto shared bus"
    );
    send(&mut client, json!({"type":"ping"})).await;
    assert_eq!(receive(&mut client).await["type"], "pong");
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn plugin_work_is_bounded_and_cancelled_when_socket_closes() {
    let (mut client, fixture) = fixture(Duration::from_secs(15)).await;
    for i in 0..33 {
        send(
            &mut client,
            json!({"type":"listPlugins", "requestId":i, "projectRoot":"/p"}),
        )
        .await;
    }
    let reply = receive(&mut client).await;
    assert_eq!(reply["requestId"], 32);
    assert!(reply["error"].as_str().unwrap().contains("occupé"));
    assert!(fixture.active.load(Ordering::SeqCst) <= 4);
    client.close(None).await.unwrap();
    tokio::time::timeout(Duration::from_secs(2), async {
        while fixture.active.load(Ordering::SeqCst) != 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("catalog work outlived the socket");
}

async fn wait_active(fixture: &Fixture, count: usize) {
    tokio::time::timeout(Duration::from_secs(2), async {
        while fixture.active.load(Ordering::SeqCst) != count {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
    })
    .await
    .expect("worker count did not converge");
}

#[tokio::test]
async fn blocked_history_and_saturated_reads_leave_controls_and_sidebar_available() {
    let (mut client, fixture) = fixture(Duration::from_secs(15)).await;
    for i in 0..8 {
        send(
            &mut client,
            json!({"type":"getHistory","threadId":"old","requestId":i,"testDelay":60000}),
        )
        .await;
    }
    wait_active(&fixture, 4).await;
    send(
        &mut client,
        json!({"type":"getHistory","threadId":"old","requestId":"overflow"}),
    )
    .await;
    let reply = receive(&mut client).await;
    assert_eq!(reply["code"], "REQUEST_BUSY");
    assert_eq!(reply["requestId"], "overflow");
    send(
        &mut client,
        json!({"type":"interrupt","threadId":"old","requestId":"stop","probe":true}),
    )
    .await;
    assert_eq!(receive(&mut client).await["requestId"], "stop");
    send(&mut client, json!({"type":"listThreads"})).await;
    assert_eq!(receive(&mut client).await["type"], "threads");
    send(&mut client, json!({"type":"send","threadId":"independent","provider":"fake","prompt":"hello","projectRoot":""})).await;
    loop {
        let response = receive(&mut client).await;
        if response["type"] == "event" && response["event"]["kind"] == "text" {
            break;
        }
    }
    assert_eq!(fixture.active.load(Ordering::SeqCst), 4);
    client.close(None).await.unwrap();
    wait_active(&fixture, 0).await;
}

#[tokio::test]
async fn synchronous_read_timeout_keeps_budget_until_os_work_finishes_across_reconnect() {
    let (mut first, fixture) = fixture(Duration::from_millis(50)).await;
    let (mut second, _) = connect_async(&fixture.url).await.unwrap();
    for client in [&mut first, &mut second] {
        for i in 0..4 {
            send(
                client,
                json!({"type":"getHistory","requestId":i,"testDelay":500,"sync":true}),
            )
            .await;
        }
    }
    wait_active(&fixture, 8).await;
    send(&mut first, json!({"type":"ping"})).await;
    // Deadline responses may precede the pong, but never an OS wait.
    loop {
        if receive(&mut first).await["type"] == "pong" {
            break;
        }
    }
    for _ in 0..4 {
        let response = receive(&mut second).await;
        assert_eq!(response["code"], "REQUEST_TIMEOUT");
    }
    first.close(None).await.unwrap();
    second.close(None).await.unwrap();
    let (mut third, _) = connect_async(&fixture.url).await.unwrap();
    send(&mut third, json!({"type":"getHistory","requestId":"again"})).await;
    assert_eq!(receive(&mut third).await["code"], "REQUEST_TIMEOUT");
    send(&mut third, json!({"type":"listThreads"})).await;
    assert_eq!(receive(&mut third).await["type"], "threads");
    wait_active(&fixture, 0).await;
    send(&mut third, json!({"type":"getHistory","threadId":"empty"})).await;
    assert_eq!(receive(&mut third).await["type"], "history");
    third.close(None).await.unwrap();
}

#[tokio::test]
async fn ordered_actions_stay_fifo_but_other_chats_and_interrupt_pass() {
    let (mut client, fixture) = fixture(Duration::from_secs(15)).await;
    send(&mut client, json!({"type":"upsertThread","thread":{"id":"a"},"requestId":"first","probe":true,"testDelay":150})).await;
    send(
        &mut client,
        json!({"type":"send","threadId":"a","requestId":"second","probe":true}),
    )
    .await;
    send(
        &mut client,
        json!({"type":"upsertThread","thread":{"id":"b"},"requestId":"other","probe":true}),
    )
    .await;
    assert_eq!(receive(&mut client).await["requestId"], "other");
    send(
        &mut client,
        json!({"type":"interrupt","threadId":"a","requestId":"stop","probe":true}),
    )
    .await;
    assert_eq!(receive(&mut client).await["requestId"], "stop");
    // Replies are forwarded by independent tasks after execution releases its
    // reservation. The cancelled action may acknowledge before the first.
    let replies = [receive(&mut client).await, receive(&mut client).await];
    assert!(replies.iter().any(|reply| reply["requestId"] == "first"));
    let cancelled = replies.iter().find(|reply| reply["requestId"] == "second").unwrap();
    assert_eq!(cancelled["code"], "REQUEST_CANCELLED");
    assert!(fixture.state.threads().lock().await.get("a").is_none());
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn accepted_mutations_finish_after_disconnect_and_order_new_socket_actions() {
    let (mut client, fixture) = fixture(Duration::from_millis(40)).await;
    send(
        &mut client,
        json!({"type":"upsertThread","thread":{"id":"persist","title":"first"},"testDelay":180}),
    )
    .await;
    wait_active(&fixture, 1).await;
    assert_eq!(receive(&mut client).await["type"], "requestDelayed");
    client.close(None).await.unwrap();
    let (mut next, _) = connect_async(&fixture.url).await.unwrap();
    send(
        &mut next,
        json!({"type":"upsertThread","thread":{"id":"persist","title":"last"}}),
    )
    .await;
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let reply = receive(&mut next).await;
            if reply["type"] == "threads"
                && reply["threads"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|t| t["id"] == "persist" && t["title"] == "last")
            {
                break;
            }
        }
    })
    .await
    .unwrap();
    assert_eq!(
        fixture
            .state
            .threads()
            .lock()
            .await
            .get("persist")
            .unwrap()
            .title,
        "last"
    );
    next.close(None).await.unwrap();
}

#[tokio::test]
async fn slow_knowledge_read_and_terminal_open_do_not_block_stop() {
    let (mut client, _fixture) = fixture(Duration::from_secs(15)).await;
    send(
        &mut client,
        json!({"type":"kbGbrainPage","slug":"slow","testDelay":60000}),
    )
    .await;
    send(
        &mut client,
        json!({"type":"termOpen","termId":"t","requestId":"open","probe":true,"testDelay":100}),
    )
    .await;
    send(
        &mut client,
        json!({"type":"termInput","termId":"t","requestId":"input","probe":true}),
    )
    .await;
    send(
        &mut client,
        json!({"type":"interrupt","threadId":"a","requestId":"stop","probe":true}),
    )
    .await;
    assert_eq!(receive(&mut client).await["requestId"], "stop");
    assert_eq!(receive(&mut client).await["requestId"], "open");
    assert_eq!(receive(&mut client).await["requestId"], "input");
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn stop_does_not_cancel_a_send_received_after_it() {
    let (mut client, fixture) = fixture(Duration::from_secs(15)).await;
    send(&mut client, json!({"type":"interrupt","threadId":"again","requestId":"stop","probe":true,"testDelay":100})).await;
    wait_active(&fixture, 1).await;
    send(
        &mut client,
        json!({"type":"send","threadId":"again","requestId":"new","probe":true}),
    )
    .await;
    assert_eq!(receive(&mut client).await["requestId"], "stop");
    let reply = receive(&mut client).await;
    assert_eq!(reply["requestId"], "new");
    assert_eq!(reply["type"], "probe");
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn busy_git_diff_keeps_the_component_response_envelope() {
    let (mut client, _fixture) = fixture(Duration::from_secs(15)).await;
    for i in 0..32 {
        send(&mut client, json!({"type":"listPlugins","requestId":i})).await;
    }
    send(
        &mut client,
        json!({"type":"gitDiff","requestId":"diff","path":"a.rs","projectRoot":"/project"}),
    )
    .await;
    let response = receive(&mut client).await;
    assert_eq!(response["type"], "gitDiff");
    assert_eq!(response["path"], "a.rs");
    assert_eq!(response["projectRoot"], "/project");
    assert_eq!(response["code"], "REQUEST_BUSY");
    assert!(response["error"].as_str().unwrap().contains("occupé"));
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn missed_bus_events_close_socket_and_allow_resynchronization() {
    let (mut client, fixture) = fixture(Duration::from_secs(15)).await;
    send(&mut client, json!({"type":"ping"})).await;
    assert_eq!(receive(&mut client).await["type"], "pong");
    // No yield: deterministically overrun the bounded broadcast subscription.
    for i in 0..256 {
        fixture
            .state
            .publish(json!({"type":"probe","index":i}).to_string());
    }
    tokio::time::timeout(Duration::from_secs(2), async {
        while let Some(Ok(frame)) = client.next().await {
            if frame.is_close() {
                break;
            }
        }
    })
    .await
    .expect("a lost event stream must reconnect, not continue incomplete");
    let (mut next, _) = connect_async(&fixture.url).await.unwrap();
    send(&mut next, json!({"type":"listThreads"})).await;
    assert_eq!(receive(&mut next).await["type"], "threads");
    next.close(None).await.unwrap();
}

#[tokio::test]
async fn histories_keep_the_revision_captured_before_a_concurrent_action() {
    let (mut client, fixture) = fixture(Duration::from_secs(15)).await;
    send(
        &mut client,
        json!({"type":"getHistory","threadId":"a","testDelay":100}),
    )
    .await;
    wait_active(&fixture, 1).await;
    send(
        &mut client,
        json!({"type":"upsertThread","thread":{"id":"a"}}),
    )
    .await;
    assert_eq!(receive(&mut client).await["type"], "threads");
    let old = receive(&mut client).await;
    assert_eq!(old["type"], "history");
    send(&mut client, json!({"type":"getHistory","threadId":"a"})).await;
    let fresh = receive(&mut client).await;
    assert_eq!(fresh["type"], "history");
    assert_eq!(old["historyEpoch"], fresh["historyEpoch"]);
    assert!(old["historyRevision"].as_u64().unwrap() < fresh["historyRevision"].as_u64().unwrap());
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn startup_preferences_are_available_even_when_expensive_reads_are_full() {
    let (mut client, _fixture) = fixture(Duration::from_secs(15)).await;
    for i in 0..4 {
        send(&mut client, json!({"type":"listPlugins","requestId":i})).await;
    }
    for kind in ["getSettings", "listHighlights", "listAutomations"] {
        send(
            &mut client,
            json!({"type":kind,"probe":true,"requestId":kind}),
        )
        .await;
        let response = receive(&mut client).await;
        assert_eq!(response["type"], "probe");
        assert_eq!(response["requestId"], kind);
    }
    client.close(None).await.unwrap();
}

#[tokio::test]
async fn startup_read_burst_queues_and_history_bypasses_slow_catalogs() {
    let (mut client, fixture) = fixture(Duration::from_secs(2)).await;
    for i in 0..12 {
        send(
            &mut client,
            json!({"type":"listPlugins", "requestId":i, "delay":100}),
        )
        .await;
    }
    wait_active(&fixture, 4).await;
    send(
        &mut client,
        json!({"type":"getHistory", "threadId":"empty"}),
    )
    .await;
    let history = receive(&mut client).await;
    assert_eq!(history["type"], "history");
    assert_eq!(fixture.active.load(Ordering::SeqCst), 4);
    let mut ids = std::collections::HashSet::new();
    for _ in 0..12 {
        let reply = receive(&mut client).await;
        assert_eq!(reply["type"], "plugins");
        assert!(reply.get("code").is_none(), "{reply}");
        ids.insert(reply["requestId"].as_u64().unwrap());
        assert!(fixture.active.load(Ordering::SeqCst) <= 4);
    }
    assert_eq!(ids.len(), 12);
    client.close(None).await.unwrap();
    wait_active(&fixture, 0).await;
}

#[tokio::test]
async fn connector_catalog_has_a_bounded_longer_budget_without_blocking_ping() {
    let (mut client, _fixture) = fixture(Duration::from_millis(200)).await;
    for kind in ["listPlugins", "listCodexApps"] {
    send(&mut client, json!({"type":kind, "requestId":"apps", "probe":true, "testDelay":300})).await;
    send(&mut client, json!({"type":"ping"})).await;
    assert_eq!(receive(&mut client).await["type"], "pong");
    let result = receive(&mut client).await;
    assert_eq!(result["type"], "probe");
    assert_eq!(result["requestId"], "apps");
    }
}
