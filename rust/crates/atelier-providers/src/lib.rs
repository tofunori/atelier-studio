//! Provider engine (plan 033 Porte 5).
//!
//! Transport and lifecycle are shared; capabilities stay provider-specific
//! (Portes 6–8 implement real Claude/Codex/Grok adapters).

mod claude;
mod claude_parse;
mod codex;
mod codex_parse;
mod codex_rpc;
mod fake;
mod registry;
mod traits;

pub use claude::ClaudeProvider;
pub use claude_parse::{parse_line, parse_message, ClaudeStreamState};
pub use codex::CodexProvider;
pub use codex_parse::{map_turn_notification, TurnMapState};
pub use fake::FakeProvider;
pub use registry::{build_registry, builtin_catalog, provider_status_list, ProviderId};
pub use traits::{Provider, ProviderCaps, SendMode, SendRequest, SendResult};
