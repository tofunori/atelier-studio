//! `atelier-studio-server` — Rust backend binary (plan 033 R1).
//!
//! Env:
//! - `ATELIER_TOKEN` — required in production (HTTP header / WS query)
//! - `ATELIER_APP_VERSION`, `ATELIER_BUNDLE_HASH` — identity for single-instance
//! - `ATELIER_APP_DIR` — override Application Support dir (tests)
//! - `ATELIER_WRITE_LOCK=1` — write sidecar.lock after bind
//! - `ATELIER_SKIP_SINGLE_INSTANCE=1` — skip peer probe
//! - `ATELIER_LOG_FILE` — journal durable ouvert par l'app
//!   (`~/Library/Logs/Atelier/studio-server.log`) : stderr, stdout après la
//!   ligne de démarrage, tracing et panic hook y écrivent (crate atelier-logs)
//! - `RUST_LOG` — tracing filter (default `info`)

use atelier_logs::ServerLog;
use atelier_runtime::server::{config_from_env, run_server_with};
use tracing_subscriber::EnvFilter;

const PROGRAM: &str = "atelier-studio-server";

#[tokio::main]
async fn main() {
    atelier_fdlimit::raise_nofile_limit();
    let log = ServerLog::from_env();
    if let Some(log) = &log {
        log.install_panic_hook(PROGRAM);
        log.line(&format!(
            "{PROGRAM} démarre (pid {}, version {})",
            std::process::id(),
            std::env::var("ATELIER_APP_VERSION").unwrap_or_else(|_| "dev".into())
        ));
    }
    init_tracing(log.as_ref());
    let config = config_from_env();
    // stdout ne sert qu'à la ligne de démarrage que l'app lit ; son pipe
    // meurt avec l'app qui l'a lancée, donc il passe ensuite au journal.
    let after_startup = {
        let log = log.clone();
        move || {
            if let Some(log) = &log {
                let _ = log.adopt_stdout();
            }
        }
    };
    if let Err(e) = run_server_with(config, after_startup).await {
        eprintln!("{PROGRAM} error: {e}");
        std::process::exit(1);
    }
}

fn init_tracing(log: Option<&ServerLog>) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    // JSON-ish structured logs without secrets (no token fields logged).
    // log_internal_errors(false) : un échec d'écriture ne doit jamais faire
    // appeler eprintln! à tracing (qui paniquait sur un stderr mort).
    let builder = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .log_internal_errors(false);
    match log {
        Some(log) => builder
            .with_ansi(false)
            .with_writer(log.make_writer())
            .init(),
        None => builder.with_writer(std::io::stderr).init(),
    }
}
