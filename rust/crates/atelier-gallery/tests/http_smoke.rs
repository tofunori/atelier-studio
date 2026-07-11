//! Integration smoke tests: spawn atelier-server against a fixture project.
//! No Python process is started.

use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

fn http(port: u16, method: &str, path: &str, body: Option<&str>) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .ok();
    let body_bytes = body.unwrap_or("").as_bytes();
    let mut req = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n"
    );
    if body.is_some() {
        req.push_str(&format!(
            "Content-Type: application/json\r\nContent-Length: {}\r\n",
            body_bytes.len()
        ));
    }
    req.push_str("\r\n");
    stream.write_all(req.as_bytes()).unwrap();
    if !body_bytes.is_empty() {
        stream.write_all(body_bytes).unwrap();
    }
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).unwrap();
    let text = String::from_utf8_lossy(&buf);
    let status = text
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let body = text.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
    (status, body)
}

struct Server {
    child: Child,
    port: u16,
    #[allow(dead_code)]
    root: PathBuf,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn start_server() -> Server {
    let root = std::env::temp_dir().join(format!(
        "atelier-http-smoke-{}-{}",
        std::process::id(),
        Instant::now().elapsed().as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("tiny.png"), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).unwrap();
    fs::write(root.join("script.py"), b"print('fixture')\n").unwrap();
    fs::write(root.join("notes.md"), b"# notes\n").unwrap();
    // Minimal gallery artefacts
    fs::write(root.join("figures_data.json"), b"{\"files\":[]}\n").unwrap();
    fs::write(root.join("figures_index.html"), b"<html></html>\n").unwrap();

    // CARGO_MANIFEST_DIR = rust/crates/atelier-gallery → repo root is ../../..
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .unwrap();
    // Studio assets live under gallery/assets (not cmux top-level assets/).
    let assets = repo.join("gallery/assets");
    assert!(
        assets.join("gallery_template.html").is_file(),
        "assets missing at {}",
        assets.display()
    );
    let binary = repo
        .join("rust/target/debug/atelier-gallery-server")
        .canonicalize()
        .or_else(|_| {
            repo.join("rust/target/release/atelier-gallery-server")
                .canonicalize()
        })
        .expect("build atelier-gallery first (cargo build -p atelier-gallery)");

    let port = free_port();
    let mut child = Command::new(binary)
        .args([
            "--root",
            root.to_str().unwrap(),
            "--port",
            &port.to_string(),
            "--no-watch",
        ])
        .env("ATELIER_ASSETS_DIR", &assets)
        .env("ATELIER_STUDIO", "1")
        .env("ATELIER_APP_VERSION", "test")
        .env("ATELIER_BUNDLE_HASH", "http-smoke")
        .env("ATELIER_AGENT_HOST", "codex")
        .env("ATELIER_AGENT_TOKEN", "smoke-token")
        .env("HOME", root.join("home"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn server");

    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        if Instant::now() > deadline {
            let _ = child.kill();
            panic!("server did not answer /ping in time");
        }
        if child.try_wait().ok().flatten().is_some() {
            panic!("server exited early");
        }
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            let (st, body) = http(port, "GET", "/ping", None);
            if st == 200 {
                assert!(
                    body.contains("\"backend\":\"rust\"") || body.contains("\"backend\": \"rust\""),
                    "{body}"
                );
                break;
            }
        }
        thread::sleep(Duration::from_millis(50));
    }
    Server { child, port, root }
}

#[test]
fn ping_and_health() {
    let srv = start_server();
    let (st, body) = http(srv.port, "GET", "/health", None);
    assert_eq!(st, 200);
    assert!(
        body.contains("atelier-gallery") && body.contains("rust"),
        "{body}"
    );
    assert!(body.contains("http-smoke"), "{body}");
}

#[test]
fn notes_roundtrip() {
    let srv = start_server();
    let (st, _) = http(
        srv.port,
        "POST",
        "/notes/save",
        Some("{\"markdown\":\"# hello smoke\"}"),
    );
    assert_eq!(st, 200);
    let (st, body) = http(srv.port, "GET", "/notes/load", None);
    assert_eq!(st, 200);
    assert!(body.contains("hello smoke"));
}

#[test]
fn path_escape_rejected() {
    let srv = start_server();
    let (st, _) = http(srv.port, "GET", "/code?path=../outside.py", None);
    assert_eq!(st, 404);
}

#[test]
fn options_preflight() {
    let srv = start_server();
    let (st, body) = http(srv.port, "OPTIONS", "/state", None);
    assert_eq!(st, 200);
    assert!(body.contains('{') || body.is_empty() || body.trim() == "{}");
}

#[test]
fn rescan_uses_rust_builder() {
    let srv = start_server();
    // Ensure assets available so rebuild succeeds
    let (st, body) = http(srv.port, "POST", "/rescan", Some("{}"));
    assert_eq!(st, 200, "{body}");
    assert!(body.contains("\"ok\":true") || body.contains("\"ok\": true"), "{body}");
}
