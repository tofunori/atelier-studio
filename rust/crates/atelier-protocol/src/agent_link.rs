//! Linked-agent contracts (plan 057).

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Relation parent/enfant créée explicitement par l'utilisateur.
/// Vit uniquement sur le thread enfant.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentLink {
    pub parent_thread_id: String,
    #[serde(default = "default_role")]
    pub role: String,
    #[serde(default = "default_access")]
    pub access: String,
    pub created_at: String,
    #[serde(default = "default_created_by")]
    pub created_by: String,
    pub auto_delivery_limit: u32,
    #[serde(default)]
    pub auto_delivery_used: u32,
    #[serde(default)]
    pub paused: bool,
}

fn default_role() -> String {
    "collaborator".into()
}
fn default_access() -> String {
    "read_write".into()
}
fn default_created_by() -> String {
    "user".into()
}

impl AgentLink {
    pub fn new(parent_thread_id: impl Into<String>, created_at: impl Into<String>, limit: u32) -> Self {
        Self {
            parent_thread_id: parent_thread_id.into(),
            role: default_role(),
            access: default_access(),
            created_at: created_at.into(),
            created_by: default_created_by(),
            auto_delivery_limit: limit.clamp(1, 20),
            auto_delivery_used: 0,
            paused: false,
        }
    }
}

/// Message durable inter-agents (mailbox).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentMailboxMessage {
    pub id: String,
    pub request_id: String,
    pub trace_id: String,
    pub hop: u32,
    pub from_thread_id: String,
    pub to_thread_id: String,
    pub relation: AgentRelation,
    pub kind: AgentMessageKind,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structured: Option<Value>,
    pub status: AgentMessageStatus,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentRelation {
    ParentToChild,
    ChildToParent,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMessageKind {
    Message,
    Report,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMessageStatus {
    Queued,
    Delivering,
    Delivered,
    Paused,
    Failed,
}

impl AgentMessageStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Delivering => "delivering",
            Self::Delivered => "delivered",
            Self::Paused => "paused",
            Self::Failed => "failed",
        }
    }
}

/// Configuration MCP injectée uniquement par le runtime (jamais par le frontend).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtelierMcpLaunch {
    pub command: String,
    pub server_name: String,
    pub env: std::collections::HashMap<String, String>,
}

/// Codes d'erreur stables exposés au MCP et à l'UI.
pub mod agent_mcp_errors {
    pub const MCP_DISABLED: &str = "mcp_disabled";
    pub const CALLER_UNKNOWN: &str = "caller_unknown";
    pub const CAPABILITY_INVALID: &str = "capability_invalid";
    pub const CAPABILITY_EXPIRED: &str = "capability_expired";
    pub const THREAD_NOT_FOUND: &str = "thread_not_found";
    pub const RELATION_REQUIRED: &str = "relation_required";
    pub const CROSS_PROJECT_DENIED: &str = "cross_project_denied";
    pub const SELF_TARGET_DENIED: &str = "self_target_denied";
    pub const LINK_PAUSED: &str = "link_paused";
    pub const BUDGET_EXHAUSTED: &str = "budget_exhausted";
    pub const TARGET_RUNNING: &str = "target_running";
    pub const WOULD_DEADLOCK: &str = "would_deadlock";
    pub const QUEUE_FULL: &str = "queue_full";
    pub const PAYLOAD_TOO_LARGE: &str = "payload_too_large";
    pub const PROVIDER_MCP_UNSUPPORTED: &str = "provider_mcp_unsupported";
    pub const BACKEND_UNAVAILABLE: &str = "backend_unavailable";
    pub const REQUEST_TIMEOUT: &str = "request_timeout";
}

/// Bornes produit (plan 057).
pub mod agent_mcp_limits {
    pub const DEFAULT_AUTO_DELIVERY: u32 = 8;
    pub const MAX_AUTO_DELIVERY: u32 = 20;
    pub const MAX_CHILDREN: usize = 8;
    pub const MAX_HOP: u32 = 4;
    pub const MAX_QUEUE_PER_LINK: usize = 100;
    pub const INSPECT_MAX_EVENTS: usize = 8;
    pub const INSPECT_MAX_CHARS: usize = 12_000;
    pub const READ_CONTEXT_MAX_EVENTS: usize = 50;
    pub const MCP_RESPONSE_MAX_BYTES: usize = 64 * 1024;
    pub const MESSAGE_MAX_BYTES: usize = 32 * 1024;
    pub const REPORT_MAX_BYTES: usize = 64 * 1024;
    pub const TOOL_OUTPUT_MAX_CHARS: usize = 2_000;
    pub const ENVELOPE_MAX_CHARS: usize = 16_000;
    pub const WAIT_DEFAULT_MS: u64 = 30_000;
    pub const WAIT_MAX_MS: u64 = 60_000;
    pub const REQUEST_BODY_MAX: usize = 256 * 1024;
    pub const BRIDGE_RESPONSE_MAX: usize = 128 * 1024;
}
