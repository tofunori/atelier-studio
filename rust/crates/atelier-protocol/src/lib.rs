//! Contract types shared by the Rust backend and contract tests.
//! Shapes must stay compatible with the historical Node sidecar (`sidecar/index.mjs`).
//!
//! Remote/mobile envelopes (plan 034 jalon B) live in [`remote`] and mirror
//! `packages/atelier-protocol` (TypeScript). Wire negotiation uses
//! [`remote::PROTOCOL_VERSION`]; the historical constant below remains for
//! R1 health/docs and equals the remote version today.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod remote;

/// Historical R1 constant — prefer `remote::PROTOCOL_VERSION` for new code.
pub const PROTOCOL_VERSION: u32 = remote::PROTOCOL_VERSION;

/// Identity string expected by Tauri (`src-tauri/src/identity.rs`).
pub const SIDECAR_SERVICE: &str = "atelier-sidecar";

/// Backend runtime label for diagnostics (Node used "node" implicitly).
pub const BACKEND_RUST: &str = "rust";

// ---------------------------------------------------------------------------
// HTTP: /health
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub ok: bool,
    pub service: String,
    pub pid: u32,
    pub port: Option<u16>,
    pub started_at: String,
    pub app_version: String,
    pub bundle_hash: String,
    pub token_required: bool,
    /// Present on Rust backend only — Node clients ignore unknown fields.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
}

impl Health {
    pub fn new(
        pid: u32,
        port: Option<u16>,
        started_at: String,
        app_version: String,
        bundle_hash: String,
        token_required: bool,
    ) -> Self {
        Self {
            ok: true,
            service: SIDECAR_SERVICE.to_string(),
            pid,
            port,
            started_at,
            app_version,
            bundle_hash,
            token_required,
            backend: Some(BACKEND_RUST.to_string()),
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP: /providers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    #[serde(default)]
    pub reasoning: bool,
    pub resume: bool,
    pub steering: bool,
    pub queue: bool,
    pub goals: bool,
    pub tools: bool,
    pub tool_output: bool,
    pub permissions: bool,
    pub interactive_input: bool,
    pub mcp_elicitation: bool,
    #[serde(default)]
    pub mcp_tools: bool,
    #[serde(default)]
    pub mcp_widgets: bool,
    #[serde(default)]
    pub plugins: bool,
    #[serde(default)]
    pub skills: bool,
    /// Atelier joint le SKILL.md (input `skill` + consigne) sur `/nom` du
    /// catalogue — providers sans chargement natif des skills (kimi).
    #[serde(default)]
    pub skills_attach: bool,
    #[serde(default)]
    pub review: bool,
    #[serde(default)]
    pub compact: bool,
    /// Inputs structurés avec images acceptés par le provider (plan 046).
    #[serde(default)]
    pub image_input: bool,
    pub durable_history: bool,
    pub permission_modes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderStatus {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub models: Vec<String>,
    #[serde(default)]
    pub model_reasoning: Value,
    pub default_model: String,
    pub efforts: Vec<String>,
    pub capabilities: ProviderCapabilities,
    pub version: Option<String>,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key_missing: Option<bool>,
}

// ---------------------------------------------------------------------------
// HTTP: /setup
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetupRuntime {
    pub node: String,
    pub version: String,
    pub bundled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetupSidecar {
    pub pid: u32,
    pub started_at: String,
    pub app_version: String,
    pub bundle_hash: String,
    pub dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetupProviderRow {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub installed: bool,
    pub version: Option<String>,
    pub bin_path: Option<String>,
    pub auth: String,
    pub models: usize,
    pub default_model: String,
    pub model_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    pub runtime: SetupRuntime,
    pub sidecar: SetupSidecar,
    pub providers: Vec<SetupProviderRow>,
}

// ---------------------------------------------------------------------------
// WebSocket framing
// ---------------------------------------------------------------------------

/// Inbound client message (partial — R1 only needs `ping` + unknown-type error).
#[derive(Debug, Clone, Deserialize)]
pub struct ClientMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(flatten)]
    pub rest: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PongMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
}

impl PongMessage {
    pub fn new() -> Self {
        Self {
            msg_type: "pong".to_string(),
        }
    }
}

impl Default for PongMessage {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ErrorMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
}

impl ErrorMessage {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            msg_type: "error".to_string(),
            message: message.into(),
            thread_id: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Built-in provider catalog (mirrors sidecar/providers/registry.mjs — R1 static)
// ---------------------------------------------------------------------------

pub fn builtin_providers() -> Vec<ProviderStatus> {
    vec![
        ProviderStatus {
            id: "claude".into(),
            label: "Claude Code".into(),
            kind: "cli".into(),
            models: vec![
                "claude-fable-5".into(),
                "claude-opus-4-8".into(),
                "claude-sonnet-5".into(),
                "claude-haiku-4-5-20251001".into(),
            ],
            model_reasoning: Value::Object(Default::default()),
            default_model: "claude-sonnet-5[1m]".into(),
            efforts: vec![
                "low".into(),
                "medium".into(),
                "high".into(),
                "xhigh".into(),
                "max".into(),
            ],
            capabilities: ProviderCapabilities {
                reasoning: true,
                resume: true,
                steering: true,
                queue: true,
                goals: false,
                tools: true,
                tool_output: true,
                permissions: true,
                interactive_input: false,
                mcp_elicitation: false,
                mcp_tools: true,
                mcp_widgets: false,
                plugins: false,
                skills: true,
                skills_attach: false,
                review: false,
                compact: false,
                image_input: false,
                durable_history: false,
                permission_modes: vec![
                    "default".into(),
                    "acceptEdits".into(),
                    "plan".into(),
                    "bypassPermissions".into(),
                ],
            },
            version: None,
            ok: false,
            key_missing: None,
        },
        ProviderStatus {
            id: "codex".into(),
            label: "Codex".into(),
            kind: "cli".into(),
            models: vec![
                "gpt-5.6-sol".into(),
                "gpt-5.6-terra".into(),
                "gpt-5.6-luna".into(),
                "gpt-5.5".into(),
                "gpt-5.1-codex-max".into(),
                "gpt-5.1-codex".into(),
            ],
            model_reasoning: Value::Object(Default::default()),
            default_model: "gpt-5.6-sol".into(),
            efforts: vec![
                "low".into(),
                "medium".into(),
                "high".into(),
                "xhigh".into(),
                "max".into(),
            ],
            capabilities: ProviderCapabilities {
                reasoning: true,
                resume: true,
                steering: true,
                queue: true,
                goals: true,
                tools: true,
                tool_output: true,
                permissions: true,
                interactive_input: true,
                mcp_elicitation: true,
                mcp_tools: true,
                mcp_widgets: true,
                plugins: true,
                skills: true,
                skills_attach: false,
                review: true,
                compact: true,
                image_input: true,
                durable_history: false,
                permission_modes: vec![
                    "default".into(),
                    "acceptEdits".into(),
                    "plan".into(),
                    "bypassPermissions".into(),
                ],
            },
            version: None,
            ok: false,
            key_missing: None,
        },
        ProviderStatus {
            id: "grok".into(),
            label: "Grok".into(),
            kind: "cli".into(),
            models: vec!["grok-4.5".into(), "grok-composer-2.5-fast".into()],
            model_reasoning: Value::Object(Default::default()),
            default_model: "grok-4.5".into(),
            efforts: vec![
                "minimal".into(),
                "low".into(),
                "medium".into(),
                "high".into(),
                "xhigh".into(),
                "max".into(),
            ],
            capabilities: ProviderCapabilities {
                reasoning: true,
                resume: true,
                steering: false,
                queue: true,
                goals: false,
                tools: true,
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
            ok: false,
            key_missing: None,
        },
        ProviderStatus {
            id: "kimi".into(),
            label: "Kimi Code".into(),
            kind: "cli".into(),
            // Décision 7 du plan 046 : AUCUN modèle en dur — le catalogue
            // vient de la discovery Kimi (setup probe + configOptions).
            models: vec![],
            model_reasoning: Value::Object(Default::default()),
            default_model: String::new(),
            // Thinking off/on exposé par-modèle via model_reasoning dynamique.
            efforts: vec![],
            capabilities: ProviderCapabilities {
                reasoning: true,
                resume: true,
                steering: false,
                queue: true,
                goals: false,
                tools: true,
                tool_output: true,
                permissions: true,
                interactive_input: true,
                mcp_elicitation: false,
                mcp_tools: true,
                mcp_widgets: false,
                plugins: false,
                skills: true,
                skills_attach: true,
                // Pas de commande review dans les builtins ACP 0.26
                // (compact/status/usage/mcp/tasks/help) — règle du plan :
                // sans méthode documentée, la capability reste false.
                review: false,
                compact: true,
                image_input: true,
                durable_history: true,
                permission_modes: vec![
                    "default".into(),
                    "acceptEdits".into(),
                    "plan".into(),
                    "bypassPermissions".into(),
                ],
            },
            version: None,
            ok: false,
            key_missing: None,
        },
        ProviderStatus {
            id: "opencode".into(),
            label: "OpenCode".into(),
            kind: "cli".into(),
            models: vec![
                "openrouter/z-ai/glm-5.2".into(),
                "openrouter/minimax/minimax-m3".into(),
                "openrouter/tencent/hy3:free".into(),
                "openrouter/qwen/qwen3-coder".into(),
                "kimi-for-coding/k3".into(),
                "openrouter/moonshotai/kimi-k3".into(),
                "openrouter/moonshotai/kimi-k2.7-code".into(),
                "openrouter/cohere/north-mini-code:free".into(),
                "openrouter/openrouter/auto".into(),
            ],
            model_reasoning: Value::Object(Default::default()),
            default_model: "kimi-for-coding/k3".into(),
            efforts: vec![
                "minimal".into(),
                "low".into(),
                "medium".into(),
                "high".into(),
                "xhigh".into(),
                "max".into(),
            ],
            capabilities: ProviderCapabilities {
                reasoning: true,
                resume: true,
                steering: false,
                queue: true,
                goals: false,
                tools: true,
                tool_output: false,
                permissions: false,
                interactive_input: false,
                mcp_elicitation: false,
                mcp_tools: true,
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
            ok: false,
            key_missing: None,
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_serializes_camel_case() {
        let h = Health::new(
            42,
            Some(1234),
            "2026-01-01T00:00:00.000Z".into(),
            "0.1.0".into(),
            "abc".into(),
            true,
        );
        let v = serde_json::to_value(&h).unwrap();
        assert_eq!(v["service"], SIDECAR_SERVICE);
        assert_eq!(v["tokenRequired"], true);
        assert_eq!(v["startedAt"], "2026-01-01T00:00:00.000Z");
        assert_eq!(v["bundleHash"], "abc");
        assert_eq!(v["appVersion"], "0.1.0");
        assert_eq!(v["backend"], "rust");
    }

    #[test]
    fn pong_shape() {
        let p = PongMessage::new();
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!(v, serde_json::json!({"type": "pong"}));
    }

    #[test]
    fn builtin_provider_ids() {
        let ids: Vec<_> = builtin_providers().into_iter().map(|p| p.id).collect();
        assert_eq!(ids, vec!["claude", "codex", "grok", "kimi", "opencode"]);
    }

    #[test]
    fn kimi_catalogue_sans_modele_en_dur() {
        let kimi = builtin_providers()
            .into_iter()
            .find(|p| p.id == "kimi")
            .expect("kimi présent");
        assert!(
            kimi.models.is_empty(),
            "modèles Kimi = discovery uniquement"
        );
        assert!(kimi.default_model.is_empty());
        assert!(kimi.capabilities.permissions);
        assert!(kimi.capabilities.interactive_input);
        assert!(!kimi.capabilities.review, "pas de builtin review ACP 0.26");
        assert_eq!(kimi.capabilities.permission_modes.len(), 4);
    }

    #[test]
    fn opencode_fallback_includes_authenticated_kimi_k3_route() {
        let opencode = builtin_providers()
            .into_iter()
            .find(|p| p.id == "opencode")
            .expect("opencode présent");
        assert!(opencode.models.iter().any(|id| id == "kimi-for-coding/k3"));
        assert_eq!(opencode.default_model, "kimi-for-coding/k3");
    }
}
