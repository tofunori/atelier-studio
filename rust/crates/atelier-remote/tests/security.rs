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
async fn catalog_discovers_mac_projects_after_gateway_start() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_, token) = pair_device(&base, &admin, &host, "catalog").await;
    let root = tempfile::tempdir().unwrap();
    let (thread_path, original_file) = {
        let mut g = h.state.inner.lock().await;
        let p = g.projects.register_project(root.path(), Some("Nom personnalisé".into()));
        let file = g.projects.register_file(&p.project_id, "notes.md").unwrap();
        (g.config.atelier_dir.join("threads.json"), file)
    };
    std::fs::write(root.path().join("notes.md"), "test").unwrap();
    let frq = root.path().join("FRQNT");
    std::fs::create_dir(&frq).unwrap();
    // Simulate the Mac writing a new conversation after the gateway is running.
    let mut mac = atelier_store::ThreadStore::open(thread_path);
    mac.upsert(json!({"id":"new-frq", "title":"Bourse", "provider":"codex", "projectRoot":frq}), false).unwrap();
    let c = client();
    let response = c.get(format!("{base}/remote/v1/projects")).header("host", &host)
        .bearer_auth(&token).send().await.unwrap();
    assert_eq!(response.status(), 200);
    let body: Value = response.json().await.unwrap();
    let project = body["projects"].as_array().unwrap().iter().find(|p| p["name"] == "FRQNT").unwrap();
    assert!(project.get("root").is_none());
    let response: Value = c.get(format!("{base}/remote/v1/threads")).header("host", &host)
        .bearer_auth(&token).send().await.unwrap().json().await.unwrap();
    assert_eq!(response["threads"][0]["projectId"], project["projectId"]);
    let g = h.state.inner.lock().await;
    assert_eq!(g.projects.resolve_file_id(&original_file).unwrap().0.name, "Nom personnalisé");
    drop(g);
    h.shutdown().await;
}

#[tokio::test]
async fn health_degrades_without_device_token() {
    // SEC-08 : sans jeton, /remote/health confirme la disponibilité mais ne
    // doit divulguer ni le nombre d'appareils appairés ni l'heure de démarrage.
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let c = client();

    let anon = c
        .get(format!("{base}/remote/health"))
        .header("host", &host)
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 200);
    let anon_body: Value = anon.json().await.unwrap();
    assert_eq!(anon_body["ok"], true);
    assert!(anon_body.get("devices").is_none(), "{anon_body}");
    assert!(anon_body.get("startedAt").is_none(), "{anon_body}");

    let (_id, tok) = pair_device(&base, &admin, &host, "health-probe").await;
    let authed = c
        .get(format!("{base}/remote/health"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .send()
        .await
        .unwrap();
    assert_eq!(authed.status(), 200);
    let authed_body: Value = authed.json().await.unwrap();
    assert!(authed_body.get("devices").is_some(), "{authed_body}");
    assert!(authed_body.get("startedAt").is_some(), "{authed_body}");

    // Un jeton invalide ne doit pas non plus débloquer le payload complet.
    let bad = c
        .get(format!("{base}/remote/health"))
        .header("host", &host)
        .header("x-atelier-device-token", "deadbeef")
        .send()
        .await
        .unwrap();
    let bad_body: Value = bad.json().await.unwrap();
    assert!(bad_body.get("devices").is_none(), "{bad_body}");

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
        .header("access-control-request-method", "DELETE")
        .header(
            "access-control-request-headers",
            "x-atelier-device-token,if-none-match",
        )
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
    let allowed_headers = allowed
        .headers()
        .get("access-control-allow-headers")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    assert!(allowed_headers.contains("if-none-match"));
    let allowed_methods = allowed
        .headers()
        .get("access-control-allow-methods")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_ascii_uppercase();
    assert!(allowed_methods.contains("DELETE"));

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
async fn gallery_is_recursive_and_delete_moves_file_to_project_trash() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_id, tok) = pair_device(&base, &admin, &host, "gallery-write").await;
    let tmp = tempfile::tempdir().unwrap();
    let proj = tmp.path().join("proj");
    let nested = proj.join("outputs").join("figures").join("nested");
    std::fs::create_dir_all(&nested).unwrap();
    std::fs::write(nested.join("plot.png"), b"png").unwrap();
    std::fs::create_dir_all(proj.join(".atelier-trash")).unwrap();
    std::fs::write(proj.join(".atelier-trash").join("old.png"), b"old").unwrap();
    #[cfg(unix)]
    {
        let outside = tmp.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.png"), b"secret").unwrap();
        std::os::unix::fs::symlink(&outside, proj.join("linked-outside")).unwrap();
    }
    let pid = {
        let mut g = h.state.inner.lock().await;
        g.projects
            .register_project(&proj, Some("p".into()))
            .project_id
    };
    let c = client();
    let index = c
        .get(format!("{base}/remote/v1/gallery/{pid}"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .send()
        .await
        .unwrap();
    assert_eq!(index.status(), 200);
    let body: Value = index.json().await.unwrap();
    let items = body["items"].as_array().unwrap();
    assert_eq!(items.len(), 1, "trash contents must stay hidden");
    let file_id = items[0]["fileId"].as_str().unwrap();

    let deleted = c
        .delete(format!("{base}/remote/v1/file/{file_id}"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .send()
        .await
        .unwrap();
    assert_eq!(deleted.status(), 200, "{}", deleted.text().await.unwrap());
    assert!(!nested.join("plot.png").exists());
    assert_eq!(
        std::fs::read_dir(proj.join(".atelier-trash"))
            .unwrap()
            .count(),
        2
    );
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
    h.state.inner.lock().await.threads.upsert(json!({"id":"t1","provider":"codex","title":"Test"}), false).unwrap();
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
    // No sidecar exists in this fixture: the first transmission never left
    // the gateway, so an identical request is retryable rather than accepted.
    assert_eq!(v2["replay"], false);
    assert_eq!(v2["proxied"], false);

    // conflict different payload same id
    let r3 = c
        .post(format!("{base}/remote/v1/send"))
        .header("host", &host)
        .header("x-atelier-device-token", &tok)
        .json(&json!({
            "threadId": "t1",
            "prompt": "HELLO",
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
    assert!(!has_scope(&s, Scope::FilesWrite));

    // Devices holding the complete pre-files:write grant upgrade in place.
    s.extend([
        Scope::ChatSend,
        Scope::ChatInteract,
        Scope::GalleryRead,
        Scope::FilesRead,
    ]);
    assert!(has_scope(&s, Scope::FilesWrite));
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

#[tokio::test]
async fn attachment_upload_and_image_forwarding() {
    use futures_util::{StreamExt, SinkExt};
    let (h, admin, host) = boot().await;
    let base = format!("http://{host}");
    let (_, token) = pair_device(&base, &admin, &host, "photo-test").await;
    let c = client();
    let upload = format!("{base}/remote/v1/attachments/test.png");
    assert_eq!(c.post(&upload).header("host",&host).body("test").send().await.unwrap().status(),401);
    let bytes = b"test-image-payload";
    let response = c.post(&upload).header("host",&host).header("x-atelier-device-token",&token)
        .body(bytes.to_vec()).send().await.unwrap();
    assert_eq!(response.status(),200);
    let uploaded: Value = response.json().await.unwrap();
    let id = uploaded["fileId"].as_str().unwrap();
    assert!(!uploaded.to_string().contains("mobile-uploads"));
    let repeated: Value = c.post(&upload).header("host",&host).header("x-atelier-device-token",&token)
        .body(bytes.to_vec()).send().await.unwrap().json().await.unwrap();
    assert_eq!(repeated["fileId"], uploaded["fileId"]);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (tx, rx) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        let (stream,_) = listener.accept().await.unwrap();
        let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
        while let Some(Ok(message)) = ws.next().await {
            if let Ok(text) = message.to_text() {
                let value: Value = serde_json::from_str(text).unwrap();
                if value["type"] == "send" {
                    ws.send(tokio_tungstenite::tungstenite::Message::Text(json!({
                        "type":"event","threadId":value["threadId"],"event":{"kind":"user","meta":{"messageId":value["clientMessageId"]}}
                    }).to_string().into())).await.unwrap();
                    let _ = tx.send(value); break;
                }
            }
        }
    });
    {
        let mut g = h.state.inner.lock().await;
        g.config.sidecar_base = Some(format!("http://{address}"));
        g.threads.upsert(json!({"id":"attachment-chat","provider":"codex","title":"Test"}),false).unwrap();
    }
    let sent = c.post(format!("{base}/remote/v1/send")).header("host",&host)
        .header("x-atelier-device-token",&token)
        .json(&json!({"threadId":"attachment-chat","prompt":"Read this","fileIds":[id],"clientRequestId":"photo-1"}))
        .send().await.unwrap();
    assert_eq!(sent.status(),200);
    let payload = tokio::time::timeout(Duration::from_secs(3),rx).await.unwrap().unwrap();
    let path = payload["inputs"][1]["path"].as_str().unwrap();
    assert_eq!(payload["inputs"][1]["type"],"local_image");
    assert_eq!(std::fs::read(path).unwrap(),bytes);
    assert_eq!(payload["attachments"][0]["path"],path);
    assert!(payload["displayEvent"]["text"].as_str().unwrap().contains("test.png"));
    assert!(!payload["displayEvent"]["text"].as_str().unwrap().contains("mobile-uploads"));
    h.shutdown().await;
}

#[tokio::test]
async fn attachment_limits_and_unknown_references() {
    let (h, admin, host) = boot().await;
    let base = format!("http://{host}");
    let (_, token) = pair_device(&base,&admin,&host,"limits").await;
    let c = client();
    for name in ["secret.exe", "nested%2Ffile.png"] {
        let response = c.post(format!("{base}/remote/v1/attachments/{name}")).header("host",&host)
            .header("x-atelier-device-token",&token).body("content").send().await.unwrap();
        assert!(response.status().is_client_error());
    }
    let large = c.post(format!("{base}/remote/v1/attachments/large.png")).header("host",&host)
        .header("x-atelier-device-token",&token).body(vec![0u8;8*1024*1024+1]).send().await.unwrap();
    assert_eq!(large.status(),413);
    h.state.inner.lock().await.threads.upsert(json!({"id":"refs","provider":"codex","title":"Test"}),false).unwrap();
    let missing = c.post(format!("{base}/remote/v1/send")).header("host",&host)
        .header("x-atelier-device-token",&token)
        .json(&json!({"threadId":"refs","prompt":"test","fileIds":["/etc/passwd"],"clientRequestId":"missing"})).send().await.unwrap();
    assert_eq!(missing.status(),404);
    h.shutdown().await;
}

#[tokio::test]
async fn mobile_creation_uses_runtime_as_single_writer() {
    use futures_util::{SinkExt, StreamExt};
    let (h,admin,host) = boot().await;
    let base = format!("http://{host}");
    let (_,token) = pair_device(&base,&admin,&host,"create").await;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    h.state.inner.lock().await.config.sidecar_base = Some(format!("http://{address}"));
    let (tx,rx) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        let (stream,_) = listener.accept().await.unwrap();
        let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
        while let Some(Ok(frame)) = ws.next().await {
            if let Ok(text) = frame.to_text() {
                let value: Value = serde_json::from_str(text).unwrap();
                if value["type"] == "upsertThread" {
                    let thread = value["thread"].clone();
                    ws.send(tokio_tungstenite::tungstenite::Message::Text(
                        json!({"type":"threads","threads":[]}).to_string().into())).await.unwrap();
                    ws.send(tokio_tungstenite::tungstenite::Message::Text(
                        json!({"type":"threads","threads":[thread]}).to_string().into())).await.unwrap();
                    let _ = tx.send(thread); break;
                }
            }
        }
    });
    let response = client().post(format!("{base}/remote/v1/threads")).header("host",&host)
        .header("x-atelier-device-token",&token).json(&json!({"provider":"codex","title":"Mobile stable","model":"test"}))
        .send().await.unwrap();
    assert_eq!(response.status(),200);
    let result:Value = response.json().await.unwrap();
    let request = rx.await.unwrap();
    assert_eq!(result["id"],request["id"]);
    assert_eq!(result["title"],"Mobile stable");
    assert!(h.state.inner.lock().await.threads.get(result["id"].as_str().unwrap()).is_none(),
        "the gateway must not write its stale thread store when a runtime exists");
    h.shutdown().await;
}

#[tokio::test]
async fn gallery_paginates_beyond_one_thousand_files() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_, token) = pair_device(&base, &admin, &host, "gallery-pages").await;
    let root = tempfile::tempdir().unwrap();
    for i in 0..1010 {
        std::fs::write(root.path().join(format!("figure-{i:04}.png")), b"image").unwrap();
    }
    let nested = root.path().join("manuscrit/sections/a/b/c/d/e/f/g/h/i/j");
    std::fs::create_dir_all(&nested).unwrap();
    std::fs::write(nested.join("results.tex"), b"results").unwrap();
    let pid = h.state.inner.lock().await.projects.register_project(root.path(), None).project_id;
    let mut offset = 0;
    let mut snapshot = String::new();
    let mut ids = std::collections::HashSet::new();
    let mut latex = false;
    loop {
        let body: Value = client().get(format!("{base}/remote/v1/gallery/{pid}?offset={offset}{snapshot}"))
            .header("host", &host).header("x-atelier-device-token", &token)
            .send().await.unwrap().json().await.unwrap();
        assert_eq!(body["total"], 1011);
        snapshot = format!("&snapshot={}", body["snapshot"].as_str().unwrap());
        if offset == 0 {
            let name = body["items"][0]["name"].as_str().unwrap();
            if name.starts_with("figure-") { std::fs::remove_file(root.path().join(name)).unwrap(); }
        }
        let items = body["items"].as_array().unwrap();
        assert!(items.len() <= 500);
        for item in items {
            assert!(item.get("_relative").is_none());
            assert!(ids.insert(item["fileId"].as_str().unwrap().to_string()));
            latex |= item["name"] == "results.tex";
        }
        match body["nextOffset"].as_u64() { Some(next) => { assert!(next > offset); offset = next; }, None => break }
    }
    assert_eq!(ids.len(), 1011);
    assert!(latex);
}

#[tokio::test]
async fn document_save_checks_version_scope_and_path() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (device, token) = pair_device(&base, &admin, &host, "document-save").await;
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("notes.tex");
    std::fs::write(&path, "original").unwrap();
    let file_id = {
        let mut g = h.state.inner.lock().await;
        let p = g.projects.register_project(root.path(), None);
        g.projects.register_file(&p.project_id, "notes.tex").unwrap()
    };
    let request = |id: String, original: &str, content: &str| client().post(format!("{base}/remote/v1/document/{id}"))
        .header("host", &host).header("x-atelier-device-token", &token).json(&json!({"original":original,"content":content}));
    let saved = request(file_id.clone(), "original", "révision").send().await.unwrap();
    assert_eq!(saved.status(), 200, "{}", saved.text().await.unwrap());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "révision");
    let conflict = request(file_id.clone(), "original", "écrasement").send().await.unwrap();
    assert_eq!(conflict.status(), 409);
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "révision");
    assert_eq!(request("f_inconnu".into(), "", "texte").send().await.unwrap().status(), 404);
    assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    h.state.inner.lock().await.auth.revoke_device(&device).unwrap();
    assert_eq!(request(file_id, "révision", "interdit").send().await.unwrap().status(), 401);
    h.shutdown().await;
}

#[tokio::test]
async fn send_forwards_explicit_permission_mode_and_keeps_default_for_old_clients() {
    use futures_util::{SinkExt, StreamExt};
    let (h, admin, host) = boot().await;
    let base = format!("http://{host}");
    let (_, token) = pair_device(&base, &admin, &host, "permissions-test").await;
    let c = client();
    for (index, mode) in [None, Some("default"), Some("acceptEdits"), Some("bypassPermissions"), None].into_iter().enumerate() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (tx, rx) = tokio::sync::oneshot::channel();
        tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            while let Some(Ok(message)) = ws.next().await {
                if let Ok(text) = message.to_text() {
                    let value: Value = serde_json::from_str(text).unwrap();
                    if value["type"] == "send" {
                        ws.send(tokio_tungstenite::tungstenite::Message::Text(json!({
                            "type":"event", "threadId":value["threadId"], "event":{"kind":"user","meta":{"messageId":value["clientMessageId"]}}
                        }).to_string().into())).await.unwrap();
                        let _ = tx.send(value); break;
                    }
                }
            }
        });
        {
            let mut g = h.state.inner.lock().await;
            g.config.sidecar_base = Some(format!("http://{address}"));
            g.threads.upsert(json!({"id":"permission-chat","provider":"codex","title":"Test","status":"idle","lastTurn":{"permissionMode":"bypassPermissions"}}),false).unwrap();
        }
        let mut body = json!({"threadId":"permission-chat","prompt":"Read a test file",
            "clientRequestId":format!("permissions-{index}"),"clientMessageId":format!("message-{index}")});
        if let Some(mode) = mode { body["permissionMode"] = json!(mode); }
        if index == 4 { body["mode"] = json!("steer"); }
        let response = c.post(format!("{base}/remote/v1/send")).header("host", &host)
            .header("x-atelier-device-token", &token).json(&body).send().await.unwrap();
        assert_eq!(response.status(), 200, "{}", response.text().await.unwrap());
        let payload = tokio::time::timeout(Duration::from_secs(3), rx).await.unwrap().unwrap();
        assert_eq!(payload["permissionMode"], mode.unwrap_or("default"));
        body["permissionMode"] = json!(if mode == Some("bypassPermissions") {"default"} else {"bypassPermissions"});
        let replay: Value = c.post(format!("{base}/remote/v1/send")).header("host", &host)
            .header("x-atelier-device-token", &token).json(&body).send().await.unwrap().json().await.unwrap();
        assert_eq!(replay["code"], if index == 4 {"invalid_permission_mode"} else {"replay_conflict"}, "{replay}");
    }
    for mode in ["plan", "auto", "unknown"] {
        let response = c.post(format!("{base}/remote/v1/send")).header("host", &host)
            .header("x-atelier-device-token", &token)
            .json(&json!({"threadId":"permission-chat","prompt":"Test","clientRequestId":"invalid-mode","permissionMode":mode})).send().await.unwrap();
        assert_eq!(response.status(), 400);
    }
    h.shutdown().await;
}
