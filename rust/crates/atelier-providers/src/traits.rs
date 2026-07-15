//! Provider trait — common lifecycle, not capability normalization.

use async_trait::async_trait;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

pub type InteractionFuture = Pin<Box<dyn Future<Output = Option<Value>> + Send>>;
pub type InteractionFn = Arc<dyn Fn(String, Value) -> InteractionFuture + Send + Sync>;

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
    /// Provider-native structured inputs (images, skills, mentions).
    pub inputs: Option<Vec<Value>>,
    pub project_root: String,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub permission_mode: Option<String>,
    pub mode: SendMode,
    /// Called with each provider-native event (undecorated kind payload).
    pub on_event: Arc<dyn Fn(Value) + Send + Sync>,
    /// Provider server request → interaction utilisateur. `None` signifie
    /// refus sûr ou absence d'interface interactive.
    pub on_interaction: Option<InteractionFn>,
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

    /// Optional lightweight semantic title generation for a new conversation.
    /// Providers that do not expose a cheap title path keep the UI fallback.
    async fn title_conversation(&self, _first_message: &str) -> Option<String> {
        None
    }

    /// Optional low-cost commit subject generation from an already-scoped diff.
    async fn commit_message(
        &self,
        _diff: &str,
        _project_root: &str,
    ) -> Result<Option<String>, String> {
        Ok(None)
    }

    /// Optional native steer (Codex). Default: not supported.
    async fn steer(&self, _req: SendRequest) -> bool {
        false
    }

    async fn interrupt(&self, _thread_id: &str) -> bool {
        true
    }

    async fn native_command(&self, name: &str, _params: Value) -> Result<Value, String> {
        Err(format!("commande native non supportée par {}: {name}", self.id()))
    }
}
