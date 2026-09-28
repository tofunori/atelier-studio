//! Gateway, pairing and client helpers shared by the media route suites.
#![allow(dead_code)]

use atelier_remote::{serve, GatewayConfig, GatewayHandle};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::time::Duration;

pub struct Gateway {
    pub handle: GatewayHandle,
    pub base: String,
    pub host: String,
    pub token: String,
}

/// Starts a gateway on a free loopback port with one paired device.
pub async fn boot(tmp: &std::path::Path) -> Gateway {
    std::fs::create_dir_all(tmp.join("atelier")).unwrap();
    let config = GatewayConfig {
        data_dir: tmp.join("remote"),
        atelier_dir: tmp.join("atelier"),
        bind: SocketAddr::from(([127, 0, 0, 1], 0)),
        allowed_hosts: vec!["127.0.0.1".into(), "localhost".into()],
        generated_images_dir: tmp.join("generated_images"),
        ..GatewayConfig::default()
    };
    let handle = serve(config).await.expect("serve");
    let host = format!("127.0.0.1:{}", handle.port);
    handle.state.inner.lock().await.config.allowed_hosts.push(host.clone());
    let admin = handle.admin_token.clone().expect("admin token on first open");
    let base = handle.base_url();
    let token = pair_device(&base, &admin, &host, "media").await;
    Gateway { handle, base, host, token }
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder().timeout(Duration::from_secs(10)).build().unwrap()
}

async fn pair_device(base: &str, admin: &str, host: &str, name: &str) -> String {
    let start = client()
        .post(format!("{base}/remote/admin/pairing/start"))
        .header("host", host)
        .header("x-atelier-admin-token", admin)
        .json(&json!({ "deviceNameHint": name }))
        .send()
        .await
        .unwrap();
    assert_eq!(start.status(), 200);
    let code = start.json::<Value>().await.unwrap()["code"].as_str().unwrap().to_string();
    let pair = client()
        .post(format!("{base}/remote/v1/pair"))
        .header("host", host)
        .json(&json!({ "code": code, "deviceName": name, "protocolVersion": 1 }))
        .send()
        .await
        .unwrap();
    assert_eq!(pair.status(), 200);
    pair.json::<Value>().await.unwrap()["token"].as_str().unwrap().to_string()
}

impl Gateway {
    /// Authenticated GET with optional extra headers.
    pub async fn get(&self, path: &str, extra: &[(&str, &str)]) -> reqwest::Response {
        let mut request = client()
            .get(format!("{}{path}", self.base))
            .header("host", &self.host)
            .header("x-atelier-device-token", &self.token);
        for (name, value) in extra {
            request = request.header(*name, *value);
        }
        request.send().await.unwrap()
    }
}

/// Sets a file's modification time `secs` seconds from now.
pub fn set_mtime(path: &std::path::Path, secs: i64) {
    let now = std::time::SystemTime::now();
    let time = if secs >= 0 {
        now + Duration::from_secs(secs as u64)
    } else {
        now - Duration::from_secs((-secs) as u64)
    };
    std::fs::File::options().write(true).open(path).unwrap().set_modified(time).unwrap();
}
