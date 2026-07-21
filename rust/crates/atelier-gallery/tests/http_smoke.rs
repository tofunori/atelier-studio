//! Integration smoke tests: spawn atelier-server against a fixture project.
//! No Python process is started.

use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

static FIXTURE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static SERVER_TEST_LOCK: Mutex<()> = Mutex::new(());

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port()
}

fn http(port: u16, method: &str, path: &str, body: Option<&str>) -> (u16, String) {
    http_with_origin(port, method, path, body, None)
}

fn http_with_origin(
    port: u16,
    method: &str,
    path: &str,
    body: Option<&str>,
    origin: Option<&str>,
) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
    let body_bytes = body.unwrap_or("").as_bytes();
    let mut req =
        format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n");
    if let Some(origin) = origin {
        req.push_str(&format!("Origin: {origin}\r\n"));
    }
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
    _test_guard: MutexGuard<'static, ()>,
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn start_server() -> Server {
    start_server_with(&[])
}

fn start_server_with(extra_env: &[(&str, String)]) -> Server {
    // Each smoke test launches a real gallery server. Running all of those
    // subprocesses concurrently makes the rescan/build test vulnerable to
    // runner-level resource pressure and connection resets. Keep this binary's
    // integration servers sequential while leaving the rest of the workspace
    // test suite parallel.
    let test_guard = SERVER_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let root = std::env::temp_dir().join(format!(
        "atelier-http-smoke-{}-{}",
        std::process::id(),
        FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed),
    ));
    fs::create_dir_all(&root).unwrap();
    fs::write(
        root.join("tiny.png"),
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    )
    .unwrap();
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
    let mut command = Command::new(binary);
    command
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
        .stderr(Stdio::null());
    for (key, value) in extra_env {
        command.env(key, value);
    }
    let mut child = command.spawn().expect("spawn server");

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
    Server {
        child,
        port,
        root,
        _test_guard: test_guard,
    }
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
    assert!(
        body.contains("\"ok\":true") || body.contains("\"ok\": true"),
        "{body}"
    );
    // cache-bust de la coquille : ?v= porte le BUNDLE_HASH, pas un timestamp
    let index = fs::read_to_string(srv.root.join("figures_index.html")).unwrap();
    assert!(
        index.contains("http-smoke"),
        "index must carry ATELIER_BUNDLE_HASH as asset revision"
    );
}

#[test]
fn origin_boundary_guards_every_route_before_routing() {
    let srv = start_server();
    // plan 005 : inter-origines refusé AVANT tout routage — y compris les
    // routes qui n'ont pas de vérification locale (vu : /data fuyait)
    for route in ["/data", "/state", "/ls", "/rev", "/claude-targets", "/ping"] {
        let (st, _) = http_with_origin(srv.port, "GET", route, None, Some("https://evil.example"));
        assert_eq!(st, 403, "{route} inter-origines doit être refusé");
    }
    // un AUTRE port loopback n'est pas la même origine (parité Node)
    let (st, _) = http_with_origin(
        srv.port,
        "GET",
        "/data",
        None,
        Some(&format!("http://127.0.0.1:{}", srv.port + 1)),
    );
    assert_eq!(st, 403, "autre port loopback → 403");
    // la même origine, le webview de l'app et l'absence d'Origin passent
    let (st, _) = http_with_origin(
        srv.port,
        "GET",
        "/data",
        None,
        Some(&format!("http://127.0.0.1:{}", srv.port)),
    );
    assert_eq!(st, 200, "même origine → 200");
    let (st, _) = http_with_origin(srv.port, "GET", "/data", None, Some("tauri://localhost"));
    assert_eq!(st, 200, "origine webview de l'app → 200");
    let (st, _) = http(srv.port, "GET", "/data", None);
    assert_eq!(st, 200, "sans Origin → 200");
    // Origin null (iframe sandboxée) refusé, et OPTIONS reste 200 sans Origin
    let (st, _) = http_with_origin(srv.port, "GET", "/state", None, Some("null"));
    assert_eq!(st, 403, "Origin null → 403");
    let (st, _) = http(srv.port, "OPTIONS", "/state", None);
    assert_eq!(st, 200, "OPTIONS sans Origin → 200");
}

#[test]
fn live_shell_ignores_disk_index_written_by_other_tools() {
    let srv = start_server();
    // un autre outil (cmux sur le même projet) écrase l'index disque avec SON
    // template — la coquille servie doit venir du template bundlé, en mémoire
    fs::write(
        srv.root.join("figures_index.html"),
        "<html>CMUX_CORRUPTED</html>",
    )
    .unwrap();
    let (st, body) = http(srv.port, "GET", "/figures_index.html", None);
    assert_eq!(st, 200);
    assert!(
        !body.contains("CMUX_CORRUPTED"),
        "la coquille ne vient JAMAIS du fichier disque"
    );
    assert!(
        body.contains("applyGalleryData"),
        "coquille live du template"
    );
    let (st2, body2) = http(srv.port, "GET", "/", None);
    assert_eq!(st2, 200);
    assert_eq!(
        body2, body,
        "les deux URLs d'entrée partagent la même coquille"
    );
    // parité Node : la coquille n'inline AUCUNE donnée scannée (le client
    // récupère /data) et le cache-bust des assets porte le BUNDLE_HASH
    assert!(
        !body.contains("script.py"),
        "shell has no inline scanned data"
    );
    assert!(
        body.contains("http-smoke"),
        "assets versionnés par ATELIER_BUNDLE_HASH"
    );
}

#[test]
fn commitmsg_is_a_get_route_like_the_client_calls_it() {
    let srv = start_server();
    // fixture sans repo git → soft-fail {ok:false}, mais JAMAIS un 405 :
    // diff_versions.js appelle fetch("/commitmsg?path=…") en GET
    let (st, body) = http(srv.port, "GET", "/commitmsg?path=script.py", None);
    assert_eq!(st, 200, "{body}");
    assert!(
        body.contains("\"ok\":false") || body.contains("\"ok\": false"),
        "{body}"
    );
}

#[test]
fn latex_suggest_warm_roundtrip_empty_and_normalized() {
    // faux CLI `claude` : un result stream-json par ligne reçue sur stdin —
    // exerce le process chaud réel (boot, tour, normalisation) sans réseau
    let fake_dir = std::env::temp_dir().join(format!(
        "fake-claude-{}-{}",
        std::process::id(),
        FIXTURE_SEQUENCE.fetch_add(1, Ordering::Relaxed),
    ));
    fs::create_dir_all(&fake_dir).unwrap();
    let script = fake_dir.join("claude");
    fs::write(
        &script,
        "#!/bin/sh\nwhile IFS= read -r line; do\n  printf '%s\\n' '{\"type\":\"result\",\"subtype\":\"success\",\"result\":\"`la suite  logique`\"}'\ndone\n",
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    }
    let path_env = format!(
        "{}:{}",
        fake_dir.display(),
        std::env::var("PATH").unwrap_or_default()
    );
    let srv = start_server_with(&[("PATH", path_env)]);

    // before vide → réponse locale, aucun process lancé
    let (st, body) = http(
        srv.port,
        "POST",
        "/latex-suggest",
        Some(r#"{"before":"   ","after":""}"#),
    );
    assert_eq!(st, 200, "{body}");
    assert!(body.contains("\"source\":\"empty\""), "{body}");

    // tour chaud : réponse du faux CLI, normalisée (backticks et espaces doublés retirés)
    let (st, body) = http(
        srv.port,
        "POST",
        "/latex-suggest",
        Some(r#"{"before":"Le glacier ","after":" fond."}"#),
    );
    assert_eq!(st, 200, "{body}");
    assert!(body.contains("\"ok\":true"), "{body}");
    assert!(body.contains("la suite logique"), "{body}");
    assert!(!body.contains('`'), "{body}");
    assert!(body.contains("\"model\":\"haiku\""), "{body}");

    let _ = fs::remove_dir_all(&fake_dir);
}
