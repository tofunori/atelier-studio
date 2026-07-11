//! Provider trait — common lifecycle, not capability normalization.

use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct ProviderCaps {
    pub resume: bool,
    pub steering: bool,
    pub queue: bool,
    pub goals: bool,
    pub tools: bool,
}

#[derive(Clone)]
pub struct SendRequest {
    pub thread_id: String,
    pub turn_id: String,
    pub prompt: String,
    pub project_root: String,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub mode: SendMode,
    /// Called with each provider-native event (undecorated kind payload).
    pub on_event: Arc<dyn Fn(Value) + Send + Sync>,
    /// Cancel probe — return true to stop generation.
    pub is_cancelled: Arc<dyn Fn() -> bool + Send + Sync>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendMode {
    Normal,
    Steer,
}

#[derive(Debug, Clone)]
pub struct SendResult {
    pub session_id: Option<String>,
    pub ok: bool,
    pub error: Option<String>,
}

#[async_trait]
pub trait Provider: Send + Sync {
    fn id(&self) -> &str;
    fn label(&self) -> &str;
    fn caps(&self) -> ProviderCaps;
    fn models(&self) -> Vec<String>;
    fn default_model(&self) -> String;
    fn efforts(&self) -> Vec<String>;

    async fn send(&self, req: SendRequest) -> SendResult;

    /// Optional native steer (Codex). Default: not supported.
    async fn steer(&self, _req: SendRequest) -> bool {
        false
    }

    async fn interrupt(&self, _thread_id: &str) -> bool {
        true
    }
}
