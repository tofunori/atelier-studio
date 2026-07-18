//! Provider catalog for /providers and status (static + fake for tests + API configs).

use crate::api::{load_api_configs, ApiChatProvider};
use crate::fake::FakeProvider;
use crate::traits::Provider;
use atelier_protocol::{builtin_providers, ProviderCapabilities, ProviderStatus};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProviderId {
    Claude,
    Codex,
    Grok,
    Kimi,
    OpenCode,
    Fake,
}

impl ProviderId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Grok => "grok",
            Self::Kimi => "kimi",
            Self::OpenCode => "opencode",
            Self::Fake => "fake",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            "grok" => Some(Self::Grok),
            "kimi" => Some(Self::Kimi),
            "opencode" => Some(Self::OpenCode),
            "fake" => Some(Self::Fake),
            _ => None,
        }
    }
}

/// Built-in catalog for HTTP `/providers` (matches Node registry shape).
/// When `app_dir` is provided, appends OpenAI-compatible API providers from
/// `api_providers.json` (excluding ids that collide with builtins).
pub fn builtin_catalog(app_dir: Option<&Path>) -> Vec<ProviderStatus> {
    let mut list = builtin_providers();
    if std::env::var("ATELIER_ENABLE_FAKE").is_ok() {
        list.push(ProviderStatus {
            id: "fake".into(),
            label: "Fake".into(),
            kind: "cli".into(),
            models: vec!["fake-1".into()],
            model_reasoning: serde_json::json!({}),
            default_model: "fake-1".into(),
            efforts: vec!["low".into(), "medium".into(), "high".into()],
            capabilities: ProviderCapabilities {
                reasoning: false,
                resume: false,
                steering: true,
                queue: true,
                goals: false,
                tools: false,
                tool_output: false,
                permissions: false,
                interactive_input: false,
                mcp_elicitation: false,
                mcp_tools: false,
                mcp_widgets: false,
                plugins: false,
                skills: false,
                skills_attach: false,
                review: false,
                compact: false,
                image_input: false,
                durable_history: false,
                permission_modes: vec![],
            },
            version: Some("fake".into()),
            ok: true,
            key_missing: None,
        });
    }
    if let Some(dir) = app_dir {
        let builtin_ids: std::collections::HashSet<_> = list.iter().map(|p| p.id.clone()).collect();
        for cfg in load_api_configs(dir) {
            if builtin_ids.contains(&cfg.id) {
                continue;
            }
            list.push(ProviderStatus {
                id: cfg.id.clone(),
                label: cfg.label.clone(),
                kind: "api".into(),
                models: cfg.models.clone(),
                model_reasoning: serde_json::json!({}),
                default_model: cfg
                    .default_model
                    .clone()
                    .or_else(|| cfg.models.first().cloned())
                    .unwrap_or_default(),
                efforts: vec![],
                capabilities: ProviderCapabilities {
                    reasoning: false,
                    resume: true,
                    steering: false,
                    queue: true,
                    goals: false,
                    tools: false,
                    tool_output: false,
                    permissions: false,
                    interactive_input: false,
                    mcp_elicitation: false,
                    mcp_tools: false,
                    mcp_widgets: false,
                    plugins: false,
                    skills: false,
                    skills_attach: false,
                    review: false,
                    compact: false,
                    image_input: false,
                    durable_history: false,
                    permission_modes: vec![],
                },
                version: None,
                ok: true,
                key_missing: None,
            });
        }
    }
    list
}

pub fn provider_status_list(app_dir: Option<&Path>) -> Vec<ProviderStatus> {
    builtin_catalog(app_dir)
}

/// Live provider instances.
///
/// CLI providers appear only when their binary is resolvable.
/// API providers load from `app_dir/api_providers.json`.
pub fn build_registry(app_dir: &Path) -> HashMap<String, Arc<dyn Provider>> {
    let mut m: HashMap<String, Arc<dyn Provider>> = HashMap::new();
    m.insert("fake".into(), Arc::new(FakeProvider::new("fake")));
    if let Some(claude) = crate::claude::ClaudeProvider::new() {
        m.insert("claude".into(), Arc::new(claude));
    }
    if let Some(codex) = crate::codex::CodexProvider::new() {
        m.insert("codex".into(), Arc::new(codex));
    }
    if let Some(grok) = crate::grok::GrokProvider::new() {
        m.insert("grok".into(), Arc::new(grok));
    }
    if let Some(kimi) = crate::kimi::KimiProvider::new() {
        m.insert("kimi".into(), Arc::new(kimi));
    }
    if let Some(oc) = crate::opencode::OpenCodeProvider::new() {
        m.insert("opencode".into(), Arc::new(oc));
    }
    let builtin_ids: std::collections::HashSet<&str> = [
        "claude", "codex", "grok", "kimi", "opencode", "fake", "gemini",
    ]
    .into_iter()
    .collect();
    for cfg in load_api_configs(app_dir) {
        if builtin_ids.contains(cfg.id.as_str()) {
            continue;
        }
        let id = cfg.id.clone();
        m.insert(id, Arc::new(ApiChatProvider::new(cfg, app_dir)));
    }
    m
}
