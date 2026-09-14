//! Deterministic fake provider for contract tests and Porte 5 soak.

use crate::traits::{
    Provider, ProviderCaps, ReviewError, ReviewRequest, ReviewResponse, SendMode, SendRequest,
    SendResult,
};
use async_trait::async_trait;
use serde_json::json;
use std::time::Duration;

/// Emits a fixed sequence: text chunks + done. Honours cancel.
pub struct FakeProvider {
    id: String,
    delay_ms: u64,
    structured_review: bool,
    review_text: String,
}

impl FakeProvider {
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            delay_ms: 5,
            structured_review: false,
            review_text: String::new(),
        }
    }

    pub fn with_delay(mut self, ms: u64) -> Self {
        self.delay_ms = ms;
        self
    }

    pub fn with_review_json(mut self, text: impl Into<String>) -> Self {
        self.structured_review = true;
        self.review_text = text.into();
        self
    }
}

#[async_trait]
impl Provider for FakeProvider {
    fn id(&self) -> &str {
        &self.id
    }
    fn label(&self) -> &str {
        "Fake"
    }
    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            resume: false,
            steering: true,
            queue: true,
            goals: false,
            tools: false,
        }
    }
    fn models(&self) -> Vec<String> {
        vec!["fake-1".into()]
    }
    fn default_model(&self) -> String {
        "fake-1".into()
    }
    fn efforts(&self) -> Vec<String> {
        vec!["low".into(), "medium".into(), "high".into()]
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        if req.mode == SendMode::Steer {
            (req.on_event)(json!({"kind":"tool","name":"__steered"}));
            (req.on_event)(json!({"kind":"text","text":"steered reply"}));
            return SendResult {
                session_id: req
                    .session_id
                    .or_else(|| Some(format!("fake-{}", req.thread_id))),
                ok: true,
                error: None,
            };
        }
        let chunks = ["Hello ", "from ", "fake ", "provider."];
        for chunk in chunks {
            if (req.is_cancelled)() {
                (req.on_event)(json!({"kind":"error","message":"interrupted"}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some("interrupted".into()),
                };
            }
            (req.on_event)(json!({"kind":"delta","text": chunk}));
            tokio::time::sleep(Duration::from_millis(self.delay_ms)).await;
        }
        (req.on_event)(json!({"kind":"text","text":"Hello from fake provider."}));
        (req.on_event)(json!({"kind":"usage","input":10,"output":20}));
        SendResult {
            session_id: Some(format!("fake-ses-{}", req.thread_id)),
            ok: true,
            error: None,
        }
    }

    async fn interrupt(&self, _thread_id: &str) -> bool {
        true
    }

    fn structured_review(&self) -> bool {
        self.structured_review
    }

    async fn review(&self, req: ReviewRequest) -> Result<ReviewResponse, ReviewError> {
        if !self.structured_review {
            return Err(ReviewError::Unsupported);
        }
        let _ = (&req.model, &req.effort, &req.dossier);
        Ok(ReviewResponse {
            text: self.review_text.clone(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn fake_emits_text_and_done_path() {
        let p = FakeProvider::new("fake").with_delay(0);
        let events = Arc::new(Mutex::new(Vec::new()));
        let e2 = Arc::clone(&events);
        let req = SendRequest {
            additional_directories: Vec::new(),
            thread_id: "t".into(),
            turn_id: "turn".into(),
            prompt: "hi".into(),
            inputs: None,
            project_root: "/tmp".into(),
            session_id: None,
            model: None,
            effort: None,
            fast_mode: false,
            permission_mode: None,
            fork_pending: false,
            mode: SendMode::Normal,
            on_event: Arc::new(move |v| e2.lock().unwrap().push(v)),
            on_session_opened: None,
            on_interaction: None,
            is_cancelled: Arc::new(|| false),
            consigne: None,
            atelier_mcp: None,
        };
        let r = p.send(req).await;
        assert!(r.ok);
        let ev = events.lock().unwrap();
        assert!(ev.iter().any(|e| e["kind"] == "text"));
        assert!(ev.iter().any(|e| e["kind"] == "delta"));
    }
}
