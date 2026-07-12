//! Security suite — plan 034 jalon C (mandatory cases).

use atelier_remote::auth::{hash_token, AuthStore};
use atelier_remote::path_policy::normalize_relative;
use atelier_remote::scopes::{has_scope, Scope};
use atelier_remote::{serve, GatewayConfig};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::time::Duration;

fn test_config(tmp: &std::path::Path) -> GatewayConfig {
    GatewayConfig {
        data_dir: tmp.join("remote"),
        atelier_dir: tmp.join("atelier"),
        bind: SocketAddr::from(([127, 0, 0, 1], 0)),
        allowed_hosts: vec!["127.0.0.1".into(), "localhost".into()],
        sidecar_base: None,
        sidecar_token: None,
        mobile_dir: None,
        mobile_bind: None,
        require_explicit_any_bind: true,
        max_body_bytes: 64 * 1024,
        min_retained_sequence: 0,
    }
}

async fn boot() -> (atelier_remote::GatewayHandle, String, String) {
    let tmp = tempfile::tempdir().unwrap();
    // leak tempdir for process lifetime of test handle — store path
    let path = tmp.keep();
    std::fs::create_dir_all(path.join("atelier")).unwrap();
    let mut cfg = test_config(&path);
    // Fix allowed hosts after bind — we'll update after we know port
    let handle = serve(cfg.clone()).await.expect("serve");
    let host = format!("127.0.0.1:{}", handle.port);
    cfg.allowed_hosts.push(host.clone());
    // Patch allowed hosts on live state
    {
        let mut g = handle.state.inner.lock().await;
        g.config.allowed_hosts = vec![
            "127.0.0.1".into(),
            "localhost".into(),
            host.clone(),
            format!("localhost:{}", handle.port),
        ];
    }
    let admin = handle
        .admin_token
        .clone()
        .expect("admin token on first open");
    (handle, admin, host)
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap()
}

async fn pair_device(base: &str, admin: &str, host: &str, name: &str) -> (String, String) {
    let c = client();
    let start = c
        .post(format!("{base}/remote/admin/pairing/start"))
        .header("host", host)
        .header("x-atelier-admin-token", admin)
        .json(&json!({ "deviceNameHint": name }))
        .send()
        .await
        .unwrap();
    assert_eq!(start.status(), 200, "{}", start.text().await.unwrap());
    let body: Value = start.json().await.unwrap();
    let code = body["code"].as_str().unwrap().to_string();

    let pair = c
        .post(format!("{base}/remote/v1/pair"))
        .header("host", host)
        .json(&json!({
            "code": code,
            "deviceName": name,
            "protocolVersion": 1
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(pair.status(), 200, "{}", pair.text().await.unwrap());
    let p: Value = pair.json().await.unwrap();
    (
        p["deviceId"].as_str().unwrap().to_string(),
        p["token"].as_str().unwrap().to_string(),
    )
}

#[tokio::test]
async fn health_public_no_token() {
    let (h, _admin, host) = boot().await;
    let base = h.base_url();
    let res = client()
        .get(format!("{base}/remote/health"))
        .header("host", &host)
        .send()
        .await
        .unwrap();
    assert_eq!(res.status(), 200);
    let v: Value = res.json().await.unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["protocolVersion"], 1);
    h.shutdown().await;
}

#[tokio::test]
async fn browser_cors_preflight_is_scoped_to_allowed_origins() {
    let (h, _admin, host) = boot().await;
    let base = h.base_url();
    let c = client();

    let allowed = c
        .request(
            reqwest::Method::OPTIONS,
            format!("{base}/remote/v1/threads"),
        )
        .header("host", &host)
        .header("origin", "http://localhost:1421")
        .header("access-control-request-method", "GET")
        .header("access-control-request-headers", "x-atelier-device-token")
        .send()
        .await
        .unwrap();
    assert_eq!(allowed.status(), 200);
    assert_eq!(
        allowed
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some("http://localhost:1421")
    );

    let rejected = c
        .request(
            reqwest::Method::OPTIONS,
            format!("{base}/remote/v1/threads"),
        )
        .header("host", &host)
        .header("origin", "https://attacker.example")
        .header("access-control-request-method", "GET")
        .header("access-control-request-headers", "x-atelier-device-token")
        .send()
        .await
        .unwrap();
    assert!(rejected
        .headers()
        .get("access-control-allow-origin")
        .is_none());

    h.shutdown().await;
}

#[tokio::test]
async fn token_absent_expired_revoked_wrong_scope() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let c = client();

    // absent
    let r = c
        .get(format!("{base}/remote/v1/threads"))
        .header("host", &host)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);

    let (id_a, tok_a) = pair_device(&base, &admin, &host, "PhoneA").await;
    let (_id_b, tok_b) = pair_device(&base, &admin, &host, "PhoneB").await;

    // ok
    let r = c
        .get(format!("{base}/remote/v1/threads"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok_a)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);

    // wrong token
    let r = c
        .get(format!("{base}/remote/v1/threads"))
        .header("host", &host)
        .header("x-atelier-device-token", "deadbeef")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);

    // revoke A only
    let r = c
        .post(format!("{base}/remote/admin/devices/{id_a}/revoke"))
        .header("host", &host)
        .header("x-atelier-admin-token", &admin)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);

    // A dead
    let r = c
        .get(format!("{base}/remote/v1/threads"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok_a)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);

    // B still alive
    let r = c
        .get(format!("{base}/remote/v1/threads"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok_b)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);

    // wrong scope: strip scopes by hand in store
    {
        let path = {
            let g = h.state.inner.lock().await;
            g.auth.path().to_path_buf()
        };
        let text = std::fs::read_to_string(&path).unwrap();
        let mut data: Value = serde_json::from_str(&text).unwrap();
        if let Some(arr) = data.get_mut("devices").and_then(|v| v.as_array_mut()) {
            for d in arr {
                if d["deviceId"] == _id_b {
                    d["scopes"] = json!(["chat:read"]);
                }
            }
        }
        std::fs::write(&path, serde_json::to_string_pretty(&data).unwrap()).unwrap();
        let mut g = h.state.inner.lock().await;
        g.auth.reload().unwrap();
    }

    let r = c
        .post(format!("{base}/remote/v1/send"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok_b)
        .json(&json!({
            "threadId": "t1",
            "prompt": "hi",
            "clientRequestId": "req-1"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "{}", r.text().await.unwrap());

    h.shutdown().await;
}

#[tokio::test]
async fn pairing_bruteforce_and_lock() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let c = client();
    let _ = c
        .post(format!("{base}/remote/admin/pairing/start"))
        .header("host", &host)
        .header("x-atelier-admin-token", &admin)
        .json(&json!({}))
        .send()
        .await
        .unwrap();

    for i in 0..5 {
        let r = c
            .post(format!("{base}/remote/v1/pair"))
            .header("host", &host)
            .json(&json!({ "code": "WRONGCODE", "deviceName": format!("x{i}") }))
            .send()
            .await
            .unwrap();
        assert!(r.status().is_client_error(), "i={i}");
    }
    // locked / no pairing
    let r = c
        .post(format!("{base}/remote/v1/pair"))
        .header("host", &host)
        .json(&json!({ "code": "WRONGCODE", "deviceName": "z" }))
        .send()
        .await
        .unwrap();
    assert!(r.status().is_client_error());
    let v: Value = r.json().await.unwrap();
    let code = v["code"].as_str().unwrap_or("");
    assert!(
        code == "pairing_locked" || code == "no_pairing" || code == "pairing_invalid",
        "{v}"
    );
    h.shutdown().await;
}

#[tokio::test]
async fn path_traversal_rejected() {
    assert!(normalize_relative("../etc/passwd").is_err());
    assert!(normalize_relative("/etc/passwd").is_err());
    assert!(normalize_relative("%2e%2e/secret").is_err());
    assert!(normalize_relative("foo/../../bar").is_err());

    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_id, tok) = pair_device(&base, &admin, &host, "trav").await;

    // register a temp project
    let tmp = tempfile::tempdir().unwrap();
    let proj = tmp.path().join("proj");
    std::fs::create_dir_all(&proj).unwrap();
    std::fs::write(proj.join("ok.txt"), "hello").unwrap();
    {
        let mut g = h.state.inner.lock().await;
        g.projects.register_project(&proj, Some("t".into()));
    }
    let pid = {
        let g = h.state.inner.lock().await;
        g.projects.list()[0].project_id.clone()
    };

    let c = client();
    for bad in ["../etc/passwd", "%2e%2e/secret", "/etc/passwd"] {
        let url = format!("{base}/remote/v1/files/{pid}/{bad}");
        let r = c
            .get(&url)
            .header("host", &host)
            .header("x-atelier-device-token", &tok)
            .send()
            .await
            .unwrap();
        assert!(
            r.status().is_client_error(),
            "path {bad} status {}",
            r.status()
        );
    }

    // good file
    let r = c
        .get(format!("{base}/remote/v1/files/{pid}/ok.txt"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    assert_eq!(r.text().await.unwrap(), "hello");

    // symlink out
    #[cfg(unix)]
    {
        let outside = tmp.path().join("secret.txt");
        std::fs::write(&outside, "nope").unwrap();
        std::os::unix::fs::symlink(&outside, proj.join("link.txt")).unwrap();
        let r = c
            .get(format!("{base}/remote/v1/files/{pid}/link.txt"))
            .header("host", &host)
            .header("x-atelier-device-token", &tok)
            .send()
            .await
            .unwrap();
        assert!(
            r.status().is_client_error(),
            "symlink status {}",
            r.status()
        );
    }

    h.shutdown().await;
}

#[tokio::test]
async fn mime_size_and_range() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_id, tok) = pair_device(&base, &admin, &host, "files").await;
    let tmp = tempfile::tempdir().unwrap();
    let proj = tmp.path().join("proj");
    std::fs::create_dir_all(&proj).unwrap();
    std::fs::write(proj.join("a.txt"), "0123456789").unwrap();
    std::fs::write(proj.join("evil.exe"), "MZ").unwrap();
    let pid = {
        let mut g = h.state.inner.lock().await;
        g.projects
            .register_project(&proj, Some("p".into()))
            .project_id
    };
    let c = client();

    // bad ext
    let r = c
        .get(format!("{base}/remote/v1/files/{pid}/evil.exe"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .send()
        .await
        .unwrap();
    assert!(r.status().is_client_error());

    // range
    let r = c
        .get(format!("{base}/remote/v1/files/{pid}/a.txt"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .header("range", "bytes=2-5")
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 206);
    assert_eq!(r.text().await.unwrap(), "2345");

    // invalid range
    let r = c
        .get(format!("{base}/remote/v1/files/{pid}/a.txt"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .header("range", "bytes=50-60")
        .send()
        .await
        .unwrap();
    assert!(r.status().is_client_error());

    h.shutdown().await;
}

#[tokio::test]
async fn bad_host_rejected() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_id, tok) = pair_device(&base, &admin, &host, "h").await;
    let r = client()
        .get(format!("{base}/remote/v1/threads"))
        .header("host", "evil.example")
        .header("x-atelier-device-token", &tok)
        .send()
        .await
        .unwrap();
    assert!(r.status().is_client_error());
    h.shutdown().await;
}

#[tokio::test]
async fn send_and_interaction_replay() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_id, tok) = pair_device(&base, &admin, &host, "replay").await;
    let c = client();
    let body = json!({
        "threadId": "t1",
        "prompt": "hello",
        "clientRequestId": "idem-1"
    });
    let r1 = c
        .post(format!("{base}/remote/v1/send"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(r1.status(), 200);
    let v1: Value = r1.json().await.unwrap();
    assert_eq!(v1["replay"], false);

    // same replay
    let r2 = c
        .post(format!("{base}/remote/v1/send"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(r2.status(), 200);
    let v2: Value = r2.json().await.unwrap();
    assert_eq!(v2["replay"], true);

    // conflict different payload same id
    let r3 = c
        .post(format!("{base}/remote/v1/send"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .json(&json!({
            "threadId": "t1",
            "prompt": "DIFFERENT",
            "clientRequestId": "idem-1"
        }))
        .send()
        .await
        .unwrap();
    assert!(r3.status().is_client_error());

    let ibody = json!({
        "threadId": "t1",
        "requestId": "req-appr-1",
        "response": { "allow": true },
        "clientRequestId": "int-1"
    });
    let r = c
        .post(format!("{base}/remote/v1/interaction"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .json(&ibody)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let r = c
        .post(format!("{base}/remote/v1/interaction"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .json(&ibody)
        .send()
        .await
        .unwrap();
    let v: Value = r.json().await.unwrap();
    assert_eq!(v["replay"], true);

    h.shutdown().await;
}

#[tokio::test]
async fn revoke_survives_reload() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("devices.json");
    let mut auth = AuthStore::open(&path).unwrap();
    let p = auth.start_pairing(None).unwrap();
    let done = auth.complete_pairing(&p.code, "phone").unwrap();
    assert!(auth.lookup_token(&done.token).is_some());
    auth.revoke_device(&done.device_id).unwrap();
    assert!(auth.lookup_token(&done.token).is_none());

    // reload = restart Mac
    let auth2 = AuthStore::open(&path).unwrap();
    assert!(auth2.lookup_token(&done.token).is_none());
    assert!(auth2
        .list_devices()
        .iter()
        .any(|d| d.device_id == done.device_id && d.revoked_at.is_some()));
}

#[tokio::test]
async fn unknown_route_rejected() {
    let (h, _admin, host) = boot().await;
    let r = client()
        .get(format!("{}/remote/v1/shell", h.base_url()))
        .header("host", &host)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 404);
    h.shutdown().await;
}

#[tokio::test]
async fn history_after_sequence_and_fixture() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_id, tok) = pair_device(&base, &admin, &host, "hist").await;
    {
        let mut g = h.state.inner.lock().await;
        g.fixture_history.insert(
            "thread-fx".into(),
            vec![
                json!({"kind":"user","text":"a","meta":{
                    "schemaVersion":1,"eventId":"e1","provider":"claude","threadId":"thread-fx",
                    "turnId":"t1","sequence":1,"ts":1,"durable":true,"origin":"atelier"
                }}),
                json!({"kind":"text","text":"b","meta":{
                    "schemaVersion":1,"eventId":"e2","provider":"claude","threadId":"thread-fx",
                    "turnId":"t1","sequence":2,"ts":2,"durable":true,"origin":"provider"
                }}),
                json!({"kind":"done","ok":true,"result":"ok","meta":{
                    "schemaVersion":1,"eventId":"e3","provider":"claude","threadId":"thread-fx",
                    "turnId":"t1","sequence":3,"ts":3,"durable":true,"origin":"provider"
                }}),
            ],
        );
    }
    let r = client()
        .get(format!(
            "{base}/remote/v1/threads/thread-fx/history?afterSequence=1"
        ))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let v: Value = r.json().await.unwrap();
    assert_eq!(v["events"].as_array().unwrap().len(), 2);
    assert_eq!(v["fromSequence"], 2);
    h.shutdown().await;
}

#[tokio::test]
async fn refuse_any_bind_without_env() {
    let tmp = tempfile::tempdir().unwrap();
    let cfg = GatewayConfig {
        data_dir: tmp.path().join("remote"),
        atelier_dir: tmp.path().join("atelier"),
        bind: SocketAddr::from(([0, 0, 0, 0], 0)),
        allowed_hosts: vec![],
        sidecar_base: None,
        sidecar_token: None,
        mobile_dir: None,
        mobile_bind: None,
        require_explicit_any_bind: true,
        max_body_bytes: 1024,
        min_retained_sequence: 0,
    };
    // Ensure env not set
    std::env::remove_var("ATELIER_REMOTE_ALLOW_ANY_BIND");
    let err = serve(cfg).await;
    assert!(err.is_err());
}

#[test]
fn scope_helpers() {
    let mut s = std::collections::BTreeSet::new();
    s.insert(Scope::ChatRead);
    assert!(has_scope(&s, Scope::ChatRead));
    assert!(!has_scope(&s, Scope::ChatSend));
}

#[test]
fn token_hash_stable() {
    assert_eq!(hash_token("abc"), hash_token("abc"));
    assert_ne!(hash_token("abc"), hash_token("abd"));
}

#[test]
fn native_tauri_origin_is_scoped_to_localhost() {
    let allowed = vec![
        "localhost".to_string(),
        "tauri.localhost".to_string(),
        "mac.tail.test".to_string(),
    ];
    assert!(atelier_remote::hostcheck::origin_allowed(
        "tauri://localhost",
        &allowed
    ));
    assert!(!atelier_remote::hostcheck::origin_allowed(
        "tauri://attacker.example",
        &allowed
    ));
    assert!(atelier_remote::hostcheck::origin_allowed(
        "http://tauri.localhost",
        &allowed
    ));
}
