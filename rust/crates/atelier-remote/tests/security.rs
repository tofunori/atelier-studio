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
        generated_images_dir: tmp.join("generated_images"),
    }
}

async fn boot() -> (atelier_remote::GatewayHandle, String, String) {
    let tmp = tempfile::tempdir().unwrap();
    // leak tempdir for process lifetime of test handle — store path
    let path = tmp.keep();
    std::fs::create_dir_all(path.join("atelier")).unwrap();
    boot_with_config(test_config(&path)).await
}

async fn boot_with_config(
    mut cfg: GatewayConfig,
) -> (atelier_remote::GatewayHandle, String, String) {
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
async fn shared_zotero_annotations_are_scoped_authenticated_and_read_only() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_, token) = pair_device(&base, &admin, &host, "annotations-test").await;
    let store = h.state.inner.lock().await.config.atelier_dir.join("pdf_annots.json");
    let raw = json!({
        "zotero/PDF00001/paper space.pdf": [{"id":"a", "page":1, "rects":[[0.1,0.2,0.3,0.04]], "kind":"hl"}],
        "zotero/PDF00002/private.pdf": [{"id":"other"}],
        "project.pdf": [{"id":"project"}]
    }).to_string();
    std::fs::write(&store, &raw).unwrap();
    let url = format!("{base}/remote/v1/zotero/annotations/PDF00001?file=paper%20space.pdf");
    assert_eq!(client().get(&url).header("host", &host).send().await.unwrap().status(), 401);
    let response = client().get(&url).header("host", &host).bearer_auth(&token).send().await.unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["cache-control"], "private, no-store");
    let data: Value = response.json().await.unwrap();
    assert_eq!(data["attachmentKey"], "PDF00001");
    assert_eq!(data["annots"].as_array().unwrap().len(), 1);
    assert_eq!(data["annots"][0]["id"], "a");
    assert_eq!(std::fs::read_to_string(&store).unwrap(), raw);
    let invalid = format!("{base}/remote/v1/zotero/annotations/PDF00001?file=..%2Fsecret.pdf");
    assert_eq!(client().get(invalid).header("host", &host).bearer_auth(&token).send().await.unwrap().status(), 400);
    std::fs::write(&store, "broken").unwrap();
    assert_eq!(client().get(&url).header("host", &host).bearer_auth(&token).send().await.unwrap().status(), 503);
    assert_eq!(std::fs::read_to_string(&store).unwrap(), "broken");
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
        generated_images_dir: tmp.path().join("generated_images"),
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

#[tokio::test]
async fn compute_is_authenticated_bounded_and_correlates_responses() {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let c = client();
    let url = format!("{base}/remote/v1/compute");
    assert_eq!(c.get(&url).header("host", &host).send().await.unwrap().status(), 401);
    let (_, token) = pair_device(&base, &admin, &host, "Compute phone").await;
    assert_eq!(c.get(&url).query(&[("host", "unknown")]).header("host", &host).header("x-atelier-device-token", &token).send().await.unwrap().status(), 400);
    assert_eq!(c.get(format!("{url}/log")).query(&[("runId", "")]).header("host", &host).header("x-atelier-device-token", &token).send().await.unwrap().status(), 400);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    h.state.inner.lock().await.config.sidecar_base = Some(format!("http://{}", listener.local_addr().unwrap()));
    let stub = tokio::spawn(async move {
        for kind in ["computeSnapshot", "computeReadLog"] {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            while let Some(Ok(frame)) = ws.next().await {
                let Ok(text) = frame.to_text() else { continue };
                let value: Value = serde_json::from_str(text).unwrap();
                if value["type"] == "clientHello" { continue; }
                assert_eq!(value["type"], kind);
                let response_type = if kind == "computeSnapshot" { "computeSnapshot" } else { "computeLog" };
                let data = if kind == "computeSnapshot" {
                    assert_eq!(value["hosts"], json!(["nas"])); assert_eq!(value["days"], 7);
                    json!({"observedAt":"2026-09-07T13:00:00Z","runs":[],"errors":[{"host":"nas","code":"offline","message":"NAS indisponible"}]})
                } else {
                    assert_eq!(value["runId"], "nas:docker:run-1"); assert_eq!(value["tailLines"], 100);
                    json!({"lines":["7/12 mois"],"truncated":true})
                };
                ws.send(Message::Text(json!({"type":response_type,"requestId":"another-request","data":{"wrong":true}}).to_string().into())).await.unwrap();
                ws.send(Message::Text(json!({"type":response_type,"requestId":value["requestId"],"data":data}).to_string().into())).await.unwrap();
                break;
            }
        }
    });
    let result: Value = c.get(&url).query(&[("host", "nas")]).header("host", &host).header("x-atelier-device-token", &token).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
    assert_eq!(result["errors"][0]["host"], "nas"); assert!(result.get("wrong").is_none());
    let result: Value = c.get(format!("{url}/log")).query(&[("runId", "nas:docker:run-1")]).header("host", &host).header("x-atelier-device-token", &token).send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
    assert_eq!(result["lines"], json!(["7/12 mois"])); assert_eq!(result["truncated"], true);
    stub.await.unwrap(); h.shutdown().await;
}

#[tokio::test]
async fn composer_commands_require_auth_and_use_the_selected_thread_project() {
    let (h, admin, host) = boot().await;
    let base = format!("http://{host}");
    let project = tempfile::tempdir().unwrap();
    let skill = project.path().join(".agents/skills/mobile-only-this-project");
    std::fs::create_dir_all(&skill).unwrap();
    std::fs::write(skill.join("SKILL.md"), "Project skill").unwrap();
    {
        let mut g = h.state.inner.lock().await;
        g.threads.upsert(json!({"id":"composer-thread", "provider":"codex", "title":"Composer", "projectRoot":project.path()}), false).unwrap();
    }
    let url = format!("{base}/remote/v1/threads/composer-thread/commands");
    assert_eq!(client().get(&url).header("host", &host).send().await.unwrap().status(), 401);
    let (_, token) = pair_device(&base, &admin, &host, "Composer phone").await;
    let body: Value = client().get(&url).header("host", &host).header("x-atelier-device-token", &token)
        .send().await.unwrap().error_for_status().unwrap().json().await.unwrap();
    let commands = body["commands"].as_array().unwrap();
    assert!(commands.iter().any(|c| c["name"] == "mobile-only-this-project" && c["source"] == "project"));
    assert!(commands.iter().all(|c| c.get("path").is_none()));
    assert!(commands.iter().all(|c| c["name"] != "clear" && c["name"] != "goal"));
    assert_eq!(client().get(format!("{base}/remote/v1/threads/missing/commands")).header("host", &host)
        .header("x-atelier-device-token", &token).send().await.unwrap().status(), 404);
    h.shutdown().await;
}

#[tokio::test]
async fn generated_image_requires_chat_and_files_read_and_never_accepts_a_path() {
    let (h, admin, host) = boot().await;
    let base = format!("http://{host}");
    let (device_id, token) = pair_device(&base, &admin, &host, "image-security").await;
    let event = json!({
        "kind": "tool_update",
        "id": "exec-image-security",
        "name": "image_generation",
        "output": "/etc/passwd",
        "status": "completed",
        "meta": {
            "threadId": "image-security-thread",
            "eventId": "image-security-event",
            "durable": true
        }
    });
    h.state
        .inner
        .lock()
        .await
        .fixture_history
        .insert("image-security-thread".into(), vec![event]);
    let url = format!(
        "{base}/remote/v1/threads/image-security-thread/images/image-security-event"
    );
    let c = client();

    assert_eq!(c.get(&url).header("host", &host).send().await.unwrap().status(), 401);

    // A device with only files:read cannot use the chat event lookup.
    let auth_path = {
        let g = h.state.inner.lock().await;
        g.auth.path().to_path_buf()
    };
    let mut data: Value = serde_json::from_str(&std::fs::read_to_string(&auth_path).unwrap()).unwrap();
    data["devices"][0]["scopes"] = json!(["files:read"]);
    std::fs::write(&auth_path, serde_json::to_string_pretty(&data).unwrap()).unwrap();
    h.state.inner.lock().await.auth.reload().unwrap();
    assert_eq!(
        c.get(&url)
            .header("host", &host)
            .header("x-atelier-device-token", &token)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );

    // Conversely, chat:read alone cannot turn this into arbitrary file read.
    data["devices"][0]["scopes"] = json!(["chat:read"]);
    std::fs::write(&auth_path, serde_json::to_string_pretty(&data).unwrap()).unwrap();
    h.state.inner.lock().await.auth.reload().unwrap();
    assert_eq!(
        c.get(&url)
            .header("host", &host)
            .header("x-atelier-device-token", &token)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );

    // Restore the paired grant: the journal's /etc/passwd output is still
    // rejected, and a query-supplied path is ignored because this route has
    // no path input beyond the opaque event reference.
    data["devices"][0]["scopes"] = json!([
        "chat:read", "chat:send", "chat:interact", "gallery:read", "files:read", "files:write"
    ]);
    std::fs::write(&auth_path, serde_json::to_string_pretty(&data).unwrap()).unwrap();
    h.state.inner.lock().await.auth.reload().unwrap();
    let response = c
        .get(format!("{url}?path=/etc/passwd"))
        .header("host", &host)
        .header("x-atelier-device-token", &token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 404);
    let body = response.text().await.unwrap();
    assert!(!body.contains("/etc/passwd"), "absolute path leaked: {body}");
    assert!(!body.contains("root:"), "arbitrary file bytes leaked: {body}");

    // Keep the variable meaningful for the revoke/reload assertion below and
    // ensure a revoked device cannot replay an image fetch.
    h.state.inner.lock().await.auth.revoke_device(&device_id).unwrap();
    assert_eq!(
        c.get(&url)
            .header("host", &host)
            .header("x-atelier-device-token", &token)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    h.shutdown().await;
}

#[tokio::test]
async fn generated_image_serves_the_legacy_output_only_event_after_history_reload() {
    // This is the durable event shape emitted before meta.itemId was added.
    // Keep the bytes and storage tree temporary so CI exercises the HTTP
    // success path without depending on a developer's ~/.codex state.
    let tmp = tempfile::tempdir().unwrap();
    let image = tmp
        .path()
        .join("generated_images/fixture-run/exec-legacy.png");
    std::fs::create_dir_all(image.parent().unwrap()).unwrap();
    let expected = b"\x89PNG\r\n\x1a\nlegacy-output-only";
    std::fs::write(&image, expected).unwrap();
    let mut cfg = test_config(tmp.path());
    cfg.generated_images_dir = tmp.path().join("generated_images");
    let (h, admin, host) = boot_with_config(cfg).await;
    let base = format!("http://{host}");
    let (_, token) = pair_device(&base, &admin, &host, "image-legacy").await;
    let thread_id = "3aeb7f6a-1d40-47df-b4a5-a7f64737af19";
    let event_id = "e4c455e9-c202-4e3e-a80e-529f95089d4a";
    let event = json!({
        "kind": "tool_update",
        "id": "exec-1f2483b3-32e2-42f3-b5fb-297affef41b0",
        "name": "image_generation",
        "output": image,
        "status": "completed",
        "meta": {
            "threadId": thread_id,
            "eventId": event_id,
            "durable": true,
            "sequence": 1
        }
    });
    {
        let mut g = h.state.inner.lock().await;
        assert!(g.journal.append(&event));
        // Recreate the journal handle to model a gateway process reload. The
        // request below must resolve the event from durable JSONL state.
        g.journal = atelier_store::HarnessJournal::new(&g.config.atelier_dir);
    }

    let response = client()
        .get(format!(
            "{base}/remote/v1/threads/{thread_id}/images/{event_id}"
        ))
        .header("host", &host)
        .header("x-atelier-device-token", &token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["content-type"], "image/png");
    assert_eq!(response.headers()["cache-control"], "private, no-store");
    assert_eq!(response.headers()["x-content-type-options"], "nosniff");
    assert_eq!(response.bytes().await.unwrap().as_ref(), expected);

    h.shutdown().await;
}

#[tokio::test]
async fn generated_image_save_uses_thread_project_and_requires_write_scope() {
    let tmp = tempfile::tempdir().unwrap();
    let cfg = test_config(tmp.path());
    let source = cfg.generated_images_dir.join("run/image.png");
    std::fs::create_dir_all(source.parent().unwrap()).unwrap();
    let bytes = b"\x89PNG\r\n\x1a\noriginal";
    std::fs::write(&source, bytes).unwrap();
    let project = tmp.path().join("project");
    std::fs::create_dir(&project).unwrap();
    let (h, admin, host) = boot_with_config(cfg).await;
    let base = format!("http://{host}");
    let (_, token) = pair_device(&base, &admin, &host, "save-test").await;
    {
        let mut g = h.state.inner.lock().await;
        g.projects.register_project(&project, None);
        g.threads.upsert(json!({"id":"save-thread","provider":"codex","projectRoot":project}), false).unwrap();
        g.fixture_history.insert("save-thread".into(), vec![json!({"kind":"tool_update","name":"image_generation","status":"completed","output":source,"meta":{"threadId":"save-thread","eventId":"save-event","durable":true}})]);
    }
    let url = format!("{base}/remote/v1/threads/save-thread/images/save-event/gallery");
    assert_eq!(client().post(&url).header("host",&host).send().await.unwrap().status(),401);
    let mut first = String::new();
    for _ in 0..2 {
        let response = client().post(&url).header("host",&host).header("x-atelier-device-token",&token)
            .json(&json!({"projectRoot":"/tmp/wrong-project"})).send().await.unwrap();
        assert_eq!(response.status(),200);
        let body: Value = response.json().await.unwrap();
        let relative = body["relativePath"].as_str().unwrap();
        assert_eq!(std::fs::read(project.join(relative)).unwrap(),bytes);
        if first.is_empty() { first = relative.to_string(); } else { assert_eq!(first,relative); }
    }
    assert_eq!(std::fs::read_dir(project.join("images-generees")).unwrap().count(),1);
    let auth_path = h.state.inner.lock().await.auth.path().to_path_buf();
    let mut auth: Value = serde_json::from_slice(&std::fs::read(&auth_path).unwrap()).unwrap();
    auth["devices"][0]["scopes"] = json!(["chat:read","files:read"]);
    std::fs::write(&auth_path, serde_json::to_vec(&auth).unwrap()).unwrap();
    h.state.inner.lock().await.auth.reload().unwrap();
    assert_eq!(client().post(&url).header("host",&host).header("x-atelier-device-token",&token).send().await.unwrap().status(),403);
    h.shutdown().await;
}

#[tokio::test]
async fn gallery_favorites_share_project_state_and_preserve_metadata() {
    let (h, admin, host) = boot().await;
    let base = h.base_url();
    let (_, token) = pair_device(&base, &admin, &host, "favorites").await;
    let root = tempfile::tempdir().unwrap();
    std::fs::create_dir(root.path().join("scripts")).unwrap();
    std::fs::write(root.path().join("scripts/model.py"), b"print(1)").unwrap();
    let state_path = root.path().join(".fig_state.json");
    std::fs::write(&state_path, r#"{"favs":["scripts/model.py"],"ratings":{"figure.pdf":4},"tags":{"figure.pdf":["retain"]}}"#).unwrap();
    let pid = h.state.inner.lock().await.projects.register_project(root.path(), None).project_id;
    let url = format!("{base}/remote/v1/gallery/{pid}");
    let index: Value = client().get(&url).header("host", &host).header("x-atelier-device-token", &token).send().await.unwrap().json().await.unwrap();
    let item = &index["items"][0];
    assert_eq!(item["name"], "model.py");
    assert_eq!(item["favorite"], true);
    let favorite_url = format!("{base}/remote/v1/file/{}/favorite", item["fileId"].as_str().unwrap());
    assert_eq!(client().post(&favorite_url).header("host", &host).json(&json!({"on":false})).send().await.unwrap().status(), 401);
    for on in [false, true, true, false] {
        let response = client().post(&favorite_url).header("host", &host).header("x-atelier-device-token", &token).json(&json!({"on":on})).send().await.unwrap();
        assert_eq!(response.status(), 200);
        let stored: Value = serde_json::from_slice(&std::fs::read(&state_path).unwrap()).unwrap();
        assert_eq!(stored["favs"], if on {json!(["scripts/model.py"])} else {json!([])});
        assert_eq!(stored["ratings"]["figure.pdf"], 4);
        assert_eq!(stored["tags"]["figure.pdf"], json!(["retain"]));
        // Existing pagination snapshot must still expose the current favorites.
        let page: Value = client().get(format!("{url}?snapshot={}", index["snapshot"].as_str().unwrap())).header("host", &host).header("x-atelier-device-token", &token).send().await.unwrap().json().await.unwrap();
        assert_eq!(page["items"][0]["favorite"], on);
    }
    std::fs::write(&state_path, b"invalid JSON").unwrap();
    assert!(!client().post(&favorite_url).header("host", &host).header("x-atelier-device-token", &token).json(&json!({"on":true})).send().await.unwrap().status().is_success());
    assert_eq!(std::fs::read(&state_path).unwrap(), b"invalid JSON");
    h.shutdown().await;
}
