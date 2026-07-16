//! Runtime for the Atelier Studio Rust backend (plan 033 R1).

pub mod atomic;
pub mod automations;
mod codex_history;
mod grok_history;
pub mod instance;
pub mod parity;
pub mod paths;
pub mod send;
pub mod server;
pub mod state;
pub mod ws_router;

pub use atomic::write_file_atomic;
pub use instance::{resolve_single_instance, InstanceAction};
pub use paths::AppPaths;
pub use server::{run_server, serve_once, ServerConfig, ServerHandle};
pub use state::AppState;
