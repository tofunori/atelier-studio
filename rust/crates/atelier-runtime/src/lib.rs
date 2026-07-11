//! Runtime for the Atelier Studio Rust backend (plan 033 R1).

pub mod atomic;
pub mod instance;
pub mod paths;
pub mod server;
pub mod state;

pub use atomic::write_file_atomic;
pub use instance::{resolve_single_instance, InstanceAction};
pub use paths::AppPaths;
pub use server::{run_server, serve_once, ServerConfig, ServerHandle};
pub use state::AppState;
