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

/// Empreinte des textes du journal de versions (même fonction que le serveur).
fn sha256_hex(text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}
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

/// Arbre propre parce que le hook Stop a déjà tout committé en « auto: », mais
/// le fichier a bougé depuis la dernière base significative : le bouton commit
/// de l'éditeur doit poser un JALON (commit vide porteur du message) pour que
/// `/githead` — donc la gouttière et le ± — reparte de là. Parité avec la route
/// Node (`diff_suite` : « gitcommit jalon sur arbre propre »).
#[test]
fn gitcommit_places_a_milestone_when_auto_commits_left_a_clean_tree() {
    let srv = start_server();
    let repo = srv.root.join("paper");
    fs::create_dir_all(&repo).unwrap();
    let git = |args: &[&str]| {
        let out = Command::new("git")
            .args(args)
            .current_dir(&repo)
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    };
    git(&["init", "-q", "-b", "main"]);
    git(&["config", "user.name", "smoke"]);
    git(&["config", "user.email", "smoke@example.invalid"]);
    git(&["config", "commit.gpgsign", "false"]);
    let file = repo.join("methods.tex");
    fs::write(&file, "version un\n").unwrap();
    git(&["add", "methods.tex"]);
    git(&["commit", "-q", "-m", "redaction initiale"]);
    // le hook Stop de fond enregistre la suite du travail sans message parlant
    fs::write(&file, "version deux\n").unwrap();
    git(&["add", "methods.tex"]);
    git(&["commit", "-q", "-m", "auto: sauvegarde de tour"]);

    let head = format!("/githead?path={}", file.display());
    let (st, body) = http(srv.port, "GET", &head, None);
    assert_eq!(st, 200);
    assert!(body.contains("version un"), "base significative — {body}");

    let payload = format!(
        "{{\"path\":\"{}\",\"message\":\"jalon methodes\"}}",
        file.display()
    );
    let (st, body) = http(srv.port, "POST", "/gitcommit", Some(&payload));
    assert_eq!(st, 200);
    assert!(body.contains("\"ok\":true"), "jalon posé — {body}");

    let (_, body) = http(srv.port, "GET", &head, None);
    assert!(body.contains("version deux"), "base déplacée — {body}");

    // deuxième appel : plus rien à jalonner
    let (_, body) = http(srv.port, "POST", "/gitcommit", Some(&payload));
    assert!(body.contains("\"ok\":false"), "doublon refusé — {body}");
}

/// Étoile de favori depuis l'app (2026-08-31) : Thierry veut marquer une
/// figure ouverte dans un onglet sans ouvrir la galerie. Un POST /state
/// partiel effacerait le reste de l'état — /favorite ne touche que `favs`.
#[test]
fn le_favori_bascule_sans_effacer_le_reste_de_l_etat() {
    let srv = start_server();

    let plein = r#"{"favs":["deja.png"],"ratings":{"deja.png":4},"hidden":["cache.png"],
        "tags":{"deja.png":["albedo"]},"hideRules":[],"collections":{},"workflow":{},
        "fileTypes":["tex","pdf"]}"#;
    let (st, body) = http(srv.port, "POST", "/state", Some(plein));
    assert_eq!(st, 200, "POST /state — {body}");

    // ajout
    let (st, body) = http(srv.port, "POST", "/favorite", Some(r#"{"rel":"figs/albedo.pdf"}"#));
    assert_eq!(st, 200, "POST /favorite — {body}");
    assert!(body.contains("\"fav\":true"), "bascule vers favori — {body}");

    let (_, body) = http(srv.port, "GET", "/state", None);
    assert!(body.contains("figs/albedo.pdf"), "favori absent — {body}");
    assert!(body.contains("deja.png"), "favori existant perdu — {body}");
    assert!(body.contains("albedo"), "tags perdus — {body}");
    assert!(body.contains("cache.png"), "masqués perdus — {body}");
    assert!(body.contains("\"fileTypes\""), "filtre du projet perdu — {body}");

    // deuxième appel : bascule inverse
    let (_, body) = http(srv.port, "POST", "/favorite", Some(r#"{"rel":"figs/albedo.pdf"}"#));
    assert!(body.contains("\"fav\":false"), "retrait — {body}");
    let (_, body) = http(srv.port, "GET", "/state", None);
    assert!(!body.contains("figs/albedo.pdf"), "favori non retiré — {body}");

    // `on` explicite : idempotent, l'ordre d'arrivée ne décide de rien
    for _ in 0..2 {
        let (_, body) = http(srv.port, "POST", "/favorite", Some(r#"{"rel":"figs/albedo.pdf","on":true}"#));
        assert!(body.contains("\"fav\":true"), "on:true — {body}");
    }
    let (_, body) = http(srv.port, "GET", "/state", None);
    assert_eq!(body.matches("figs/albedo.pdf").count(), 1, "doublon — {body}");

    // chemins hors projet refusés
    for sale in [r#"{"rel":"/etc/passwd"}"#, r#"{"rel":"../secret.png"}"#, r#"{"rel":""}"#] {
        let (st, _) = http(srv.port, "POST", "/favorite", Some(sale));
        assert_eq!(st, 400, "rel accepté à tort : {sale}");
    }
}

/// Filtre de types par PROJET (2026-08-24). Le panneau Filtres ne gardait son
/// état que dans le localStorage du WebView, qui ne survit pas au redémarrage
/// de l'app (PIEGES_CONNUS §1) : « pas de PNG dans FRQNT » était perdu à chaque
/// relance. Le filtre rejoint donc .fig_state.json, comme les favoris.
#[test]
fn le_filtre_de_types_survit_dans_l_etat_du_projet() {
    let srv = start_server();

    let payload = r#"{"favs":[],"ratings":{},"hidden":[],"tags":{},"hideRules":[],
        "collections":{},"workflow":{},
        "fileTypes":["tex","pdf"],
        "pinnedTypes":["pdf","tex"],
        "filePresets":[{"id":"p1","label":"Sources","extensions":["tex","py"]}]}"#;
    let (st, body) = http(srv.port, "POST", "/state", Some(payload));
    assert_eq!(st, 200, "POST /state — {body}");

    // relecture : c'est ce que verra la galerie au prochain démarrage
    let (st, body) = http(srv.port, "GET", "/state", None);
    assert_eq!(st, 200);
    assert!(body.contains("\"fileTypes\""), "types absents — {body}");
    assert!(body.contains("\"tex\"") && body.contains("\"pdf\""), "{body}");
    assert!(body.contains("\"pinnedTypes\""), "épinglés absents — {body}");
    assert!(body.contains("\"filePresets\""), "presets absents — {body}");
    assert!(body.contains("Sources"), "libellé de preset perdu — {body}");

    // un POST SANS ces clés (vieux client, ou simple ajout de favori) ne doit
    // pas effacer le filtre du projet — même garde que texAutoRewrap
    let sans = r#"{"favs":["fig.png"],"ratings":{},"hidden":[],"tags":{},
        "hideRules":[],"collections":{},"workflow":{}}"#;
    let (st, _) = http(srv.port, "POST", "/state", Some(sans));
    assert_eq!(st, 200);
    let (_, body) = http(srv.port, "GET", "/state", None);
    assert!(body.contains("\"fileTypes\""), "filtre effacé par un POST partiel — {body}");
    assert!(body.contains("fig.png"), "favori perdu — {body}");

    // « Reset filters » efface EXPLICITEMENT (null) : distinct d'une clé
    // absente, sinon le projet resterait prisonnier de son ancien filtre.
    let reset = r#"{"favs":[],"ratings":{},"hidden":[],"tags":{},"hideRules":[],
        "collections":{},"workflow":{},"fileTypes":null}"#;
    let (st, _) = http(srv.port, "POST", "/state", Some(reset));
    assert_eq!(st, 200);
    let (_, body) = http(srv.port, "GET", "/state", None);
    assert!(!body.contains("\"fileTypes\""), "reset n'a pas effacé — {body}");

    // extensions farfelues : bornées, jamais recopiées telles quelles
    let sale = r#"{"favs":[],"ratings":{},"hidden":[],"tags":{},"hideRules":[],
        "collections":{},"workflow":{},
        "fileTypes":[".PNG","tex ","","../etc","toolongextensionvalue","p*g"]}"#;
    let (st, _) = http(srv.port, "POST", "/state", Some(sale));
    assert_eq!(st, 200);
    let (_, body) = http(srv.port, "GET", "/state", None);
    assert!(body.contains("\"png\"") && body.contains("\"tex\""), "normalisation — {body}");
    assert!(!body.contains("etc") && !body.contains("p*g"), "entrée non bornée — {body}");
}

/// Jalon de comparaison « Repartir d'ici » (2026-08-24). Un fichier dont la
/// base ne peut pas avancer (hors dépôt) empilait ses interventions sans fin.
/// Le jalon est une base D'AFFICHAGE distincte : l'ancre persistée (`base`)
/// ne bouge JAMAIS — la déplacer ferait diverger l'empreinte et couperait la
/// persistance (PIEGES_CONNUS §3b).
#[test]
fn un_jalon_deplace_la_base_daffichage_sans_toucher_lancre() {
    let srv = start_server();
    let file = srv.root.join("notes.tex");
    fs::write(&file, "version un\n").unwrap();
    let path = file.display().to_string();

    // état initial : ancre posée à l'init
    let init = format!(
        r#"{{"path":"{path}","expectedRevision":0,"ops":[{{"type":"init",
          "texts":{{"{h1}":"version un\n"}},
          "base":{{"hash":"{h1}","kind":"session","sha":"","ts":1}},
          "current":{{"hash":"{h1}","ts":1}}}}]}}"#,
        path = path,
        h1 = sha256_hex("version un\n"),
    );
    let (st, body) = http(srv.port, "POST", "/versions", Some(&init));
    assert_eq!(st, 200, "init — {body}");

    // le jalon : nouvel état courant posé comme base d'affichage
    let h2 = sha256_hex("version deux\n");
    let jalon = format!(
        r#"{{"path":"{path}","expectedRevision":1,"ops":[{{"type":"milestone",
          "texts":{{"{h2}":"version deux\n"}},
          "milestone":{{"hash":"{h2}","ts":2}},
          "current":{{"hash":"{h2}","ts":2}}}}]}}"#,
    );
    let (st, body) = http(srv.port, "POST", "/versions", Some(&jalon));
    assert_eq!(st, 200, "jalon — {body}");

    let (_, body) = http(srv.port, "GET", &format!("/versions?path={path}"), None);
    assert!(body.contains("\"milestone\""), "jalon absent — {body}");
    assert!(body.contains(&h2), "texte du jalon perdu — {body}");
    // l'ancre d'origine est intacte : c'est elle qui garantit la persistance
    assert!(body.contains("\"kind\":\"session\""), "ancre modifiée — {body}");
    assert!(
        body.contains(&sha256_hex("version un\n")),
        "texte de l'ancre collecté par le GC — {body}"
    );
}

/// Pastille git : distinguer « pas de dépôt » de « fichier non suivi », et
/// pouvoir suivre le fichier d'un clic.
#[test]
fn githead_distingue_non_suivi_et_hors_depot_puis_gittrack_suit() {
    let srv = start_server();
    let repo = srv.root.join("dossier");
    fs::create_dir_all(&repo).unwrap();
    let git = |args: &[&str]| {
        let out = Command::new("git").args(args).current_dir(&repo).output().unwrap();
        assert!(out.status.success(), "git {args:?}: {}", String::from_utf8_lossy(&out.stderr));
    };
    git(&["init", "-q", "-b", "main"]);
    git(&["config", "user.name", "smoke"]);
    git(&["config", "user.email", "smoke@example.invalid"]);
    git(&["config", "commit.gpgsign", "false"]);
    fs::write(repo.join("suivi.tex"), "suivi\n").unwrap();
    git(&["add", "suivi.tex"]);
    git(&["commit", "-q", "-m", "depart"]);

    // le fichier de brouillon, lui, n'a jamais été ajouté
    let file = repo.join("brouillon.tex");
    fs::write(&file, "texte\n").unwrap();
    let path = file.display().to_string();

    let (st, body) = http(srv.port, "GET", &format!("/githead?path={path}"), None);
    assert_eq!(st, 200);
    assert!(body.contains("\"ok\":false"), "{body}");
    assert!(body.contains("\"repo\":true"), "dépôt non détecté — {body}");
    assert!(body.contains("\"tracked\":false"), "suivi mal rapporté — {body}");

    let payload = format!(r#"{{"path":"{path}"}}"#);
    let (st, body) = http(srv.port, "POST", "/gittrack", Some(&payload));
    assert_eq!(st, 200, "gittrack — {body}");
    assert!(body.contains("\"ok\":true"), "{body}");

    let (_, body) = http(srv.port, "GET", &format!("/githead?path={path}"), None);
    assert!(body.contains("\"tracked\":true"), "toujours non suivi — {body}");
}

/// Panneau Provenance du viewer (spec provenance-figures, sections C/F) :
/// le sidecar `<figure>.prov.json` se lit par `GET /prov?file=…`. Trois états
/// distincts — présent, absent, illisible — parce que le panneau les affiche
/// différemment (fiche riche, encart « antérieure au système », erreur douce).
#[test]
fn prov_sert_le_sidecar_absent_present_et_malforme() {
    let srv = start_server();
    // absent : 404 propre, jamais une 500
    let (st, body) = http(srv.port, "GET", "/prov?file=tiny.png", None);
    assert_eq!(st, 404, "{body}");
    assert!(body.contains("no provenance"), "{body}");

    // présent : le JSON du sidecar ressort tel quel, avec son chemin absolu
    fs::write(
        srv.root.join("tiny.png.prov.json"),
        br#"{"version":1,"figure":"tiny.png","history":[{"ts":"2026-08-27T20:43:26Z","scripts":["plot.py"]}]}"#,
    )
    .unwrap();
    let (st, body) = http(srv.port, "GET", "/prov?file=tiny.png", None);
    assert_eq!(st, 200, "{body}");
    assert!(body.contains("\"ok\":true"), "{body}");
    assert!(body.contains("plot.py"), "{body}");
    assert!(body.contains("tiny.png.prov.json"), "{body}");

    // le chemin du sidecar lui-même est accepté : aller-retour idempotent
    let (st, _) = http(srv.port, "GET", "/prov?file=tiny.png.prov.json", None);
    assert_eq!(st, 200);

    // malformé : erreur douce distincte du 404 (le panneau dit « illisible »)
    fs::write(srv.root.join("tiny.png.prov.json"), b"{ pas du json").unwrap();
    let (st, body) = http(srv.port, "GET", "/prov?file=tiny.png", None);
    assert_eq!(st, 422, "{body}");
    assert!(body.contains("invalid prov.json"), "{body}");
}

/// Confinement : `/prov` ne sort jamais du projet, et reste derrière le garde
/// d'origine comme toute autre route (mémoire projet : CORS/ACAO commun).
#[test]
fn prov_reste_confine_au_projet_et_derriere_le_garde_dorigine() {
    let srv = start_server();
    for escape in [
        "/prov?file=../outside.png",
        "/prov?file=%2Fetc%2Fpasswd",
        "/prov?file=a/../../outside.png",
        "/prov?file=",
    ] {
        let (st, body) = http(srv.port, "GET", escape, None);
        assert_eq!(st, 400, "{escape} devrait être refusé — {body}");
    }
    let (st, _) = http_with_origin(
        srv.port,
        "GET",
        "/prov?file=tiny.png",
        None,
        Some("https://evil.example"),
    );
    assert_eq!(st, 403, "/prov inter-origines doit être refusé");
}
