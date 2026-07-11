//! `atelier-studio-server` — Rust backend binary (plan 033 R1).
//!
//! Env:
//! - `ATELIER_TOKEN` — required in production (HTTP header / WS query)
//! - `ATELIER_APP_VERSION`, `ATELIER_BUNDLE_HASH` — identity for single-instance
//! - `ATELIER_APP_DIR` — override Application Support dir (tests)
//! - `ATELIER_WRITE_LOCK=1` — write sidecar.lock after bind
//! - `ATELIER_SKIP_SINGLE_INSTANCE=1` — skip peer probe
//! - `RUST_LOG` — tracing filter (default `info`)

use atelier_runtime::server::{config_from_env, run_server};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    init_tracing();
    let config = config_from_env();
    if let Err(e) = run_server(config).await {
        eprintln!("atelier-studio-server error: {e}");
        std::process::exit(1);
    }
}

fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    // JSON-ish structured logs without secrets (no token fields logged).
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_writer(std::io::stderr)
        .init();
}
