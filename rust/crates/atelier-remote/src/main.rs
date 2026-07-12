//! `atelier-remote-gateway` — secure remote API for Atelier Companion (plan 034 C).
//!
//! Env:
//! - `ATELIER_REMOTE_BIND` — e.g. `127.0.0.1:18765` or Tailscale IP
//! - `ATELIER_REMOTE_DIR` — devices store directory
//! - `ATELIER_APP_DIR` — Application Support atelier-studio
//! - `ATELIER_REMOTE_ALLOWED_HOSTS` — comma-separated Host allowlist
//! - `ATELIER_TOKEN` / `ATELIER_SIDECAR_BASE` — optional loopback sidecar proxy
//! - Never enables Tailscale Funnel.

use atelier_remote::{config_from_env, serve};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_writer(std::io::stderr)
        .init();

    let config = config_from_env();
    match serve(config).await {
        Ok(handle) => {
            if let Some(admin) = &handle.admin_token {
                // Print once to stderr for Mac operator — not a device token.
                eprintln!("atelier-remote-gateway admin token (loopback only): {admin}");
                eprintln!("port={}", handle.port);
            }
            // Park until ctrl-c
            tokio::signal::ctrl_c().await.ok();
            handle.shutdown().await;
        }
        Err(e) => {
            eprintln!("atelier-remote-gateway error: {e}");
            std::process::exit(1);
        }
    }
}
