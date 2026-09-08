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
    assert_eq!(fixture.active.load(Ordering::SeqCst), 1);
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
    assert_eq!(fixture.active.load(Ordering::SeqCst), 1);
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
    assert_eq!(fixture.active.load(Ordering::SeqCst), 0);
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
    for i in 0..5 {
        send(
            &mut client,
            json!({"type":"listPlugins", "requestId":i, "projectRoot":"/p"}),
        )
        .await;
    }
    let reply = receive(&mut client).await;
    assert_eq!(reply["requestId"], 4);
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
