//! Provider catalog for /providers and status (static + fake for tests).

use crate::fake::FakeProvider;
use crate::traits::Provider;
use atelier_protocol::{builtin_providers, ProviderStatus};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProviderId {
    Claude,
    Codex,
    Grok,
    OpenCode,
    Fake,
}

impl ProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Grok => "grok",
            Self::OpenCode => "opencode",
            Self::Fake => "fake",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            "grok" => Some(Self::Grok),
            "opencode" => Some(Self::OpenCode),
            "fake" => Some(Self::Fake),
            _ => None,
        }
    }
}

/// Built-in catalog for HTTP `/providers` (matches Node registry shape).
pub fn builtin_catalog() -> Vec<ProviderStatus> {
    let mut list = builtin_providers();
    // Fake only when ATELIER_ENABLE_FAKE=1 (tests / dev).
    if std::env::var("ATELIER_ENABLE_FAKE").is_ok() {
        list.push(ProviderStatus {
            id: "fake".into(),
            label: "Fake".into(),
            kind: "cli".into(),
            models: vec!["fake-1".into()],
            model_reasoning: serde_json::json!({}),
            default_model: "fake-1".into(),
            efforts: vec!["low".into(), "medium".into(), "high".into()],
            capabilities: atelier_protocol::ProviderCapabilities {
                resume: false,
                steering: true,
                queue: true,
                goals: false,
                tools: false,
                tool_output: false,
                permissions: false,
                interactive_input: false,
                mcp_elicitation: false,
                durable_history: false,
                permission_modes: vec![],
            },
            version: Some("fake".into()),
            ok: true,
            key_missing: None,
        });
    }
    list
}

pub fn provider_status_list() -> Vec<ProviderStatus> {
    builtin_catalog()
}

/// Live provider instances.
pub fn build_registry() -> HashMap<String, Arc<dyn Provider>> {
    let mut m: HashMap<String, Arc<dyn Provider>> = HashMap::new();
    m.insert("fake".into(), Arc::new(FakeProvider::new("fake")));
    if let Some(claude) = crate::claude::ClaudeProvider::new() {
        m.insert("claude".into(), Arc::new(claude));
    }
    if let Some(codex) = crate::codex::CodexProvider::new() {
        m.insert("codex".into(), Arc::new(codex));
    }
    // Grok / OpenCode: Porte 8
    m
}
