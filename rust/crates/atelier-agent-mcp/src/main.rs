//! atelier-agent-mcp — stdio MCP shim (plan 057).
//!
//! stdout: MCP JSON-RPC frames only.
//! stderr: diagnostics (never tokens).
//! Auth: ATELIER_MCP_CAPABILITY → bridge loopback.

mod bridge;
mod schema;
mod server;

use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    // Never write to stdout except via server frames.
    if let Err(e) = server::run().await {
        eprintln!("atelier-agent-mcp: {e}");
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}
