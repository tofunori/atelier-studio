//! Alertes ntfy : routes `/remote/v1/notify` et guetteur du bus runtime,
//! contre un faux serveur ntfy et un faux runtime WebSocket locaux.

use atelier_remote::notify::{self, NotifySettings};
use atelier_remote::{serve, GatewayConfig, GatewayHandle};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

fn test_config(tmp: &std::path::Path) -> GatewayConfig {
    GatewayConfig {
        data_dir: tmp.join("remote"),
        atelier_dir: tmp.join("atelier"),
        bind: SocketAddr::from(([127, 0, 0, 1], 0)),
        allowed_hosts: vec!["127.0.0.1".into(), "localhost".into()],
        sidecar_base: None,
        sidecar_token: None,
        require_explicit_any_bind: true,
        max_body_bytes: 64 * 1024,
        min_retained_sequence: 0,
        generated_images_dir: tmp.join("generated_images"),
    }
}

async fn boot(tmp: &std::path::Path, sidecar_base: Option<String>) -> (GatewayHandle, String, String) {
    std::fs::create_dir_all(tmp.join("atelier")).unwrap();
    let mut config = test_config(tmp);
    config.sidecar_base = sidecar_base;
    let handle = serve(config).await.expect("serve");
    let host = format!("127.0.0.1:{}", handle.port);
    handle.state.inner.lock().await.config.allowed_hosts =
        vec!["127.0.0.1".into(), "localhost".into(), host.clone()];
    let admin = handle.admin_token.clone().expect("admin token");
    (handle, admin, host)
}

fn client() -> reqwest::Client {
    reqwest::Client::builder().timeout(Duration::from_secs(15)).build().unwrap()
}

async fn pair_device(base: &str, admin: &str, host: &str) -> String {
    let start: Value = client()
        .post(format!("{base}/remote/admin/pairing/start"))
        .header("host", host)
        .header("x-atelier-admin-token", admin)
        .json(&json!({"deviceNameHint":"iPhone"}))
        .send().await.unwrap().json().await.unwrap();
    let pair: Value = client()
        .post(format!("{base}/remote/v1/pair"))
        .header("host", host)
        .json(&json!({"code":start["code"],"deviceName":"iPhone","protocolVersion":1}))
        .send().await.unwrap().json().await.unwrap();
    pair["token"].as_str().unwrap().to_string()
}

#[derive(Debug)]
struct Received {
    topic: String,
    headers: HeaderMap,
    body: String,
}

/// Faux ntfy : chaque POST `/{topic}` est remis au test.
async fn fake_ntfy() -> (String, mpsc::UnboundedReceiver<Received>) {
    async fn publish(
        State(tx): State<mpsc::UnboundedSender<Received>>,
        Path(topic): Path<String>,
        headers: HeaderMap,
        body: String,
    ) -> axum::Json<Value> {
        let _ = tx.send(Received { topic, headers, body });
        axum::Json(json!({"id":"x","event":"message"}))
    }
    let (tx, rx) = mpsc::unbounded_channel();
    let app = axum::Router::new().route("/{topic}", axum::routing::post(publish)).with_state(tx);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("http://{addr}"), rx)
}

fn write_settings(handle_dir: &std::path::Path, settings: &NotifySettings) {
    settings.save(&handle_dir.join("remote").join(notify::SETTINGS_FILE)).unwrap();
}

async fn next(rx: &mut mpsc::UnboundedReceiver<Received>) -> Received {
    tokio::time::timeout(Duration::from_secs(5), rx.recv()).await.expect("alerte attendue").unwrap()
}

fn header<'a>(received: &'a Received, name: &str) -> Option<&'a str> {
    received.headers.get(name).and_then(|v| v.to_str().ok())
}

#[tokio::test]
async fn notify_routes_require_a_device_and_persist_settings() {
    let tmp = tempfile::tempdir().unwrap();
    let (h, admin, host) = boot(tmp.path(), None).await;
    let base = h.base_url();
    let url = format!("{base}/remote/v1/notify");

    // Sans jeton : 401, même avec un corps valide.
    assert_eq!(client().get(&url).header("host", &host).send().await.unwrap().status(), 401);
    let denied = client().post(&url).header("host", &host).json(&json!({"enabled":true})).send().await.unwrap();
    assert_eq!(denied.status(), 401);
    assert_eq!(denied.json::<Value>().await.unwrap()["code"], "unauthorized");
    assert_eq!(client().get(&url).header("host", &host).bearer_auth("faux").send().await.unwrap().status(), 401);
    assert!(!tmp.path().join("remote").join(notify::SETTINGS_FILE).exists());

    let token = pair_device(&base, &admin, &host).await;
    let initial: Value = client().get(&url).header("host", &host).bearer_auth(&token).send().await.unwrap().json().await.unwrap();
    assert_eq!(initial["enabled"], false);
    assert_eq!(initial["topic"], Value::Null);
    assert_eq!(initial["subscribeUrl"], Value::Null);
    assert_eq!(initial["onlyWhenAway"], true);
    assert_eq!(initial["preview"], false);
    assert!(initial["server"].as_str().unwrap().starts_with("http"));

    let enabled = client().post(&url).header("host", &host).header("x-atelier-device-token", &token)
        .json(&json!({"enabled":true,"preview":true})).send().await.unwrap();
    assert_eq!(enabled.status(), 200);
    let enabled: Value = enabled.json().await.unwrap();
    let topic = enabled["topic"].as_str().unwrap().to_string();
    assert!(topic.starts_with("atelier-") && topic.len() == 32, "{topic}");
    assert_eq!(enabled["subscribeUrl"], format!("{}/{topic}", enabled["server"].as_str().unwrap()));
    assert_eq!(enabled["preview"], true);
    assert_eq!(enabled["onlyWhenAway"], true);

    // Persisté : relu du disque, puis par GET.
    let stored = NotifySettings::load(&tmp.path().join("remote").join(notify::SETTINGS_FILE));
    assert!(stored.enabled && stored.preview);
    assert_eq!(stored.topic.as_deref(), Some(topic.as_str()));
    let again: Value = client().get(&url).header("host", &host).bearer_auth(&token).send().await.unwrap().json().await.unwrap();
    assert_eq!(again, enabled);

    // Corps vide = simple relecture ; JSON invalide = 400 structuré.
    let empty: Value = client().post(&url).header("host", &host).bearer_auth(&token).send().await.unwrap().json().await.unwrap();
    assert_eq!(empty, enabled);
    let invalid = client().post(&url).header("host", &host).bearer_auth(&token)
        .header("content-type", "application/json").body("{oops").send().await.unwrap();
    assert_eq!(invalid.status(), 400);
    assert_eq!(invalid.json::<Value>().await.unwrap()["code"], "invalid_json");

    // ntfy injoignable : 502 notify_failed, réglages intacts.
    let closed = {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.local_addr().unwrap()
    };
    write_settings(tmp.path(), &NotifySettings { server: format!("http://{closed}"), ..stored.clone() });
    let failed = client().post(&url).header("host", &host).bearer_auth(&token).json(&json!({"test":true})).send().await.unwrap();
    assert_eq!(failed.status(), 502);
    assert_eq!(failed.json::<Value>().await.unwrap()["code"], "notify_failed");
    h.shutdown().await;
}

#[tokio::test]
async fn test_notification_is_posted_to_the_topic() {
    let tmp = tempfile::tempdir().unwrap();
    let (h, admin, host) = boot(tmp.path(), None).await;
    let base = h.base_url();
    let token = pair_device(&base, &admin, &host).await;
    let (ntfy, mut received) = fake_ntfy().await;
    // Jamais activé : l'essai crée le sujet sans activer les alertes.
    write_settings(tmp.path(), &NotifySettings { server: ntfy.clone(), ..NotifySettings::default() });
    let response = client().post(format!("{base}/remote/v1/notify")).header("host", &host).bearer_auth(&token)
        .json(&json!({"test":true})).send().await.unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["enabled"], false);
    let topic = body["topic"].as_str().unwrap();
    assert_eq!(body["subscribeUrl"], format!("{ntfy}/{topic}"));
    let alert = next(&mut received).await;
    assert_eq!(alert.topic, topic);
    assert_eq!(header(&alert, "title"), Some("Atelier"));
    assert_eq!(alert.body, "Atelier : alerte d'essai");
    h.shutdown().await;
}

/// Faux runtime : relaie au guetteur les trames poussées par le test, une
/// connexion à la fois ; `None` coupe la connexion en cours.
async fn fake_runtime() -> (String, mpsc::UnboundedSender<Option<Value>>, mpsc::UnboundedReceiver<Value>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let (frames_tx, mut frames_rx) = mpsc::unbounded_channel::<Option<Value>>();
    let (hello_tx, hello_rx) = mpsc::unbounded_channel::<Value>();
    tokio::spawn(async move {
        loop {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            if let Some(Ok(Message::Text(text))) = ws.next().await {
                let _ = hello_tx.send(serde_json::from_str(&text).unwrap());
            }
            while let Some(frame) = frames_rx.recv().await {
                match frame {
                    Some(frame) => ws.send(Message::Text(frame.to_string().into())).await.unwrap(),
                    None => {
                        let _ = ws.close(None).await;
                        break;
                    }
                }
            }
        }
    });
    (format!("http://{addr}"), frames_tx, hello_rx)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64
}

fn event(thread: &str, event: Value) -> Value {
    json!({"type":"event","threadId":thread,"event":event})
}

#[tokio::test]
async fn watcher_turns_runtime_events_into_ntfy_alerts() {
    let tmp = tempfile::tempdir().unwrap();
    let (runtime, frames, mut hellos) = fake_runtime().await;
    let (ntfy, mut received) = fake_ntfy().await;
    let (h, _admin, _host) = boot(tmp.path(), Some(runtime)).await;
    let mut threads = atelier_store::ThreadStore::open(tmp.path().join("atelier").join("threads.json"));
    threads.upsert(json!({"id":"fil-1","title":"Bilan de masse","provider":"codex"}), false).unwrap();
    write_settings(tmp.path(), &NotifySettings {
        enabled: true,
        server: ntfy,
        topic: Some("atelier-e2etest".into()),
        only_when_away: false,
        preview: true,
    });
    let watcher = notify::spawn_watcher(h.state.clone());
    let hello = tokio::time::timeout(Duration::from_secs(5), hellos.recv()).await.unwrap().unwrap();
    assert_eq!(hello, json!({"type":"clientHello","clientInstanceId":"gateway-notify"}));

    let ts = now_ms();
    let done = event("fil-1", json!({"kind":"done","ok":true,"meta":{"turnId":"t1","eventId":"e1","ts":ts}}));
    for frame in [
        event("fil-1", json!({"kind":"delta","text":"done","meta":{"turnId":"t1","ts":ts}})),
        // Rejeu d'un vieux tour : ignoré.
        event("fil-1", json!({"kind":"done","ok":true,"meta":{"turnId":"t0","eventId":"e0","ts":ts - 600_000}})),
        done.clone(),
        done.clone(),
        event("fil-1", json!({"kind":"error","message":"boom","meta":{"turnId":"t1","ts":ts}})),
        event("fil-1", json!({"kind":"error","message":"interrupted","meta":{"turnId":"t9","ts":ts}})),
        event("fil-1", json!({"kind":"interaction","interactionType":"approval","state":"answered","requestId":"int-0"})),
    ] {
        frames.send(Some(frame)).unwrap();
    }
    let alert = next(&mut received).await;
    assert_eq!(alert.topic, "atelier-e2etest");
    assert_eq!(header(&alert, "title"), Some("Atelier"));
    assert_eq!(header(&alert, "click"), Some("atelier-native://thread/fil-1"));
    assert_eq!(header(&alert, "priority"), None);
    assert_eq!(alert.body, "Terminé : Bilan de masse");

    frames.send(Some(event("fil-1", json!({"kind":"interaction","interactionType":"approval","state":"pending","requestId":"int-1","meta":{"turnId":"t2","ts":now_ms()}})))).unwrap();
    let alert = next(&mut received).await;
    assert_eq!(header(&alert, "priority"), Some("high"));
    assert_eq!(header(&alert, "tags"), Some("warning"));
    assert_eq!(header(&alert, "click"), Some("atelier-native://thread/fil-1"));
    assert_eq!(alert.body, "Accord nécessaire : Bilan de masse");

    // Le runtime redémarre : le guetteur se reconnecte, sans réalerter un
    // tour déjà signalé.
    frames.send(None).unwrap();
    let hello = tokio::time::timeout(Duration::from_secs(10), hellos.recv()).await.unwrap().unwrap();
    assert_eq!(hello["clientInstanceId"], "gateway-notify");
    // Même tour, horodatage frais : seule la déduplication peut l'écarter.
    frames.send(Some(event("fil-1", json!({"kind":"done","ok":true,"meta":{"turnId":"t1","eventId":"e1b","ts":now_ms()}})))).unwrap();
    frames.send(Some(event("fil-2", json!({"kind":"error","message":"crash","meta":{"turnId":"t3","ts":now_ms()}})))).unwrap();
    let alert = next(&mut received).await;
    assert_eq!(alert.body, "Interrompu : Sans titre");
    assert_eq!(header(&alert, "click"), Some("atelier-native://thread/fil-2"));

    // Sans aperçu : aucun titre de fil ne quitte le Mac. Désactivé : rien.
    write_settings(tmp.path(), &NotifySettings {
        preview: false,
        ..NotifySettings::load(&tmp.path().join("remote").join(notify::SETTINGS_FILE))
    });
    frames.send(Some(event("fil-1", json!({"kind":"done","meta":{"turnId":"t4","ts":now_ms()}})))).unwrap();
    assert_eq!(next(&mut received).await.body, "Un travail est terminé.");
    write_settings(tmp.path(), &NotifySettings {
        enabled: false,
        ..NotifySettings::load(&tmp.path().join("remote").join(notify::SETTINGS_FILE))
    });
    frames.send(Some(event("fil-1", json!({"kind":"done","meta":{"turnId":"t5","ts":now_ms()}})))).unwrap();
    assert!(tokio::time::timeout(Duration::from_millis(500), received.recv()).await.is_err(), "aucune alerte attendue");

    watcher.abort();
    h.shutdown().await;
}
