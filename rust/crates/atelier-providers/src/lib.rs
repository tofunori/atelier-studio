//! Provider engine (plan 033 Portes 5–8).
//!
//! Transport and lifecycle are shared; capabilities stay provider-specific.

mod acp_map;
mod acp_rpc;
mod api;
mod claude;
mod claude_parse;
mod codex;
mod codex_parse;
mod codex_rpc;
mod fake;
mod grok;
mod grok_parse;
mod images;
mod kimi;
mod kimi_map;
mod opencode;
mod opencode_parse;
mod registry;
mod traits;

pub use api::{
    load_api_configs, parse_sse_chunk, write_api_configs, ApiChatProvider, ApiProviderConfig,
};
pub use claude::ClaudeProvider;
pub use claude_parse::{parse_line, parse_message, ClaudeStreamState};
pub use codex::CodexProvider;
pub use codex_parse::{map_turn_notification, TurnMapState};
pub use fake::FakeProvider;
pub use grok::GrokProvider;
pub use grok_parse::{
    map_prompt_result, map_session_update, normalize_grok_message, parse_grok_jsonl,
};
pub use images::{
    generate_image, resolve_ark_api_key, resolve_ark_model, DEFAULT_MODEL as IMAGE_DEFAULT_MODEL,
};
pub use kimi::KimiProvider;
pub use kimi_map::{map_kimi_prompt_result, map_kimi_session_update};
pub use opencode::OpenCodeProvider;
pub use opencode_parse::{normalize_opencode_message, parse_opencode_jsonl};
pub use registry::{build_registry, builtin_catalog, provider_status_list, ProviderId};
pub use traits::{
    CommitMessageDetails, InteractionFn, Provider, ProviderCaps, SendMode, SendRequest, SendResult,
};
