//! Runtime for the Atelier Studio Rust backend (plan 033 R1).

pub mod agent_links;
pub mod agent_mailbox;
pub mod agent_mcp;
pub mod atomic;
pub mod automations;
mod codex_history;
pub mod evidence;
mod grok_history;
mod goals;
pub mod instance;
pub mod kb_block;
mod message_edits;
pub mod parity;
pub mod paths;
mod project_folders;
pub mod prov;
pub mod send;
pub mod server;
pub mod state;
pub mod usage;
pub mod widgets;
pub mod ws_router;
mod ws_dispatch;
mod ws_connection;
pub mod zotero_watch;

pub use atomic::write_file_atomic;
pub use instance::{resolve_single_instance, InstanceAction};
pub use paths::AppPaths;
pub use server::{run_server, serve_once, ServerConfig, ServerHandle};
pub use state::AppState;
