//! OpenAI-compatible chat providers from `api_providers.json` (plan 033 Porte 8).

use crate::traits::{Provider, ProviderCaps, SendRequest, SendResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiProviderConfig {
    pub id: String,
    pub label: String,
    /// Node uses `baseURL` (capital URL); accept both spellings.
    #[serde(alias = "baseURL", alias = "base_url")]
    pub base_url: String,
    #[serde(default)]
    pub protocol: Option<String>, // "openai" | "anthropic"
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub default_model: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_env: Option<String>,
}

pub fn config_path(app_dir: &Path) -> PathBuf {
    app_dir.join("api_providers.json")
}

pub fn load_api_configs(app_dir: &Path) -> Vec<ApiProviderConfig> {
    let path = config_path(app_dir);
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let val: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let list = if let Some(arr) = val.as_array() {
        arr.clone()
    } else {
        val.get("providers")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
    };
    list.into_iter()
        .filter_map(normalize_config)
        .collect()
}

/// Persist API provider configs (chmod 600 when possible). Never logs keys.
pub fn write_api_configs(app_dir: &Path, providers: &[Value]) -> Result<(), String> {
    let path = config_path(app_dir);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(providers).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn normalize_config(p: Value) -> Option<ApiProviderConfig> {
    let id = p.get("id").and_then(|v| v.as_str())?.trim().to_string();
    if id.is_empty() {
        return None;
    }
    let base = p
        .get("baseURL")
        .or_else(|| p.get("baseUrl"))
        .or_else(|| p.get("base_url"))
        .and_then(|v| v.as_str())?
        .trim_end_matches('/')
        .to_string();
    if base.is_empty() {
        return None;
    }
    let models_raw = p.get("models").and_then(|v| v.as_array())?;
    let models: Vec<String> = models_raw
        .iter()
        .filter_map(|m| {
            if let Some(s) = m.as_str() {
                Some(s.to_string())
            } else {
                m.get("id")
                    .or_else(|| m.get("name"))
                    .and_then(|v| v.as_str())
                    .map(str::to_string)
            }
        })
        .filter(|s| !s.is_empty())
        .collect();
    if models.is_empty() {
        return None;
    }
    let default_model = p
        .get("defaultModel")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .or_else(|| models.first().cloned());
    Some(ApiProviderConfig {
        id: id.clone(),
        label: p
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or(&id)
            .to_string(),
        base_url: base,
        protocol: p
            .get("protocol")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        models,
        default_model,
        api_key: p
            .get("apiKey")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        api_key_env: p
            .get("apiKeyEnv")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    })
}

fn resolve_api_key(cfg: &ApiProviderConfig) -> Option<String> {
    if let Some(env) = &cfg.api_key_env {
        if let Ok(v) = std::env::var(env) {
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    cfg.api_key.clone().filter(|s| !s.is_empty())
}

/// Parse OpenAI SSE chunk.
pub fn parse_sse_chunk(chunk: &str, carry: &str) -> (Vec<Value>, String) {
    let text = format!("{carry}{chunk}");
    let mut lines: Vec<&str> = text.split('\n').collect();
    let rest = lines.pop().unwrap_or("").to_string();
    let mut events = Vec::new();
    for line in lines {
        let line = line.trim_end_matches('\r');
        if !line.starts_with("data:") {
            continue;
        }
        let data = line[5..].trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let Ok(obj) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        let delta = obj
            .pointer("/choices/0/delta")
            .cloned()
            .unwrap_or(json!({}));
        if let Some(r) = delta
            .get("reasoning")
            .or_else(|| delta.get("reasoning_content"))
            .and_then(|v| v.as_str())
        {
            if !r.is_empty() {
                events.push(json!({"kind":"thinking_delta","text": r}));
            }
        }
        if let Some(c) = delta.get("content").and_then(|v| v.as_str()) {
            if !c.is_empty() {
                events.push(json!({"kind":"delta","text": c}));
            }
        }
        if let Some(u) = obj.get("usage") {
            events.push(json!({
                "kind": "usage",
                "usage": {
                    "context": u.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    "output": u.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    "cost": u.get("cost"),
                    "turns": null,
                }
            }));
        }
        if let Some(err) = obj.get("error") {
            events.push(json!({
                "kind": "error",
                "message": err.get("message").and_then(|v| v.as_str()).unwrap_or("API error"),
            }));
        }
    }
    (events, rest)
}

pub struct ApiChatProvider {
    cfg: ApiProviderConfig,
    sessions_dir: PathBuf,
    aborts: Mutex<HashMap<String, Arc<AtomicBoolFlag>>>,
}

struct AtomicBoolFlag(std::sync::atomic::AtomicBool);

impl AtomicBoolFlag {
    fn new() -> Self {
        Self(std::sync::atomic::AtomicBool::new(false))
    }
    fn set(&self) {
        self.0.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    fn get(&self) -> bool {
        self.0.load(std::sync::atomic::Ordering::SeqCst)
    }
}

impl ApiChatProvider {
    pub fn new(cfg: ApiProviderConfig, app_dir: &Path) -> Self {
        Self {
            sessions_dir: app_dir.join("api_sessions"),
            cfg,
            aborts: Mutex::new(HashMap::new()),
        }
    }

    fn history_path(&self, session_id: &str) -> PathBuf {
        self.sessions_dir.join(format!("{session_id}.jsonl"))
    }

    fn load_history(&self, session_id: &str) -> Vec<Value> {
        let Ok(text) = std::fs::read_to_string(self.history_path(session_id)) else {
            return Vec::new();
        };
        text.lines()
            .filter_map(|l| serde_json::from_str(l).ok())
            .collect()
    }

    fn append_history(&self, session_id: &str, messages: &[Value]) {
        let _ = std::fs::create_dir_all(&self.sessions_dir);
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.history_path(session_id))
        {
            for m in messages {
                if let Ok(s) = serde_json::to_string(m) {
                    let _ = writeln!(f, "{s}");
                }
            }
        }
    }
}

#[async_trait]
impl Provider for ApiChatProvider {
    fn id(&self) -> &str {
        &self.cfg.id
    }
    fn label(&self) -> &str {
        &self.cfg.label
    }
    fn caps(&self) -> ProviderCaps {
        ProviderCaps {
            resume: true,
            steering: false,
            queue: true,
            goals: false,
            tools: false,
        }
    }
    fn models(&self) -> Vec<String> {
        self.cfg.models.clone()
    }
    fn default_model(&self) -> String {
        self.cfg
            .default_model
            .clone()
            .or_else(|| self.cfg.models.first().cloned())
            .unwrap_or_else(|| "default".into())
    }
    fn efforts(&self) -> Vec<String> {
        vec!["low".into(), "medium".into(), "high".into()]
    }

    async fn send(&self, req: SendRequest) -> SendResult {
        let api_key = match resolve_api_key(&self.cfg) {
            Some(k) => k,
            None => {
                let message = format!(
                    "clé API manquante pour {} ({})",
                    self.cfg.label,
                    self.cfg.api_key_env.as_deref().unwrap_or("apiKey")
                );
                (req.on_event)(json!({"kind":"error","message": message}));
                return SendResult {
                    session_id: req.session_id,
                    ok: false,
                    error: Some(message),
                };
            }
        };

        let sid = req
            .session_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let history = self.load_history(&sid);
        let user_message = json!({"role":"user","content": req.prompt});
        let mut messages = history;
        messages.push(user_message.clone());

        let model = req
            .model
            .clone()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| self.default_model());

        let base = self.cfg.base_url.trim_end_matches('/');
        let anthropic = self.cfg.protocol.as_deref() == Some("anthropic");
        let url = if anthropic {
            format!("{base}/v1/messages")
        } else if base.ends_with("/v1") {
            format!("{base}/chat/completions")
        } else {
            format!("{base}/v1/chat/completions")
        };

        let body = if anthropic {
            json!({
                "model": model,
                "max_tokens": 8192,
                "messages": messages,
                "stream": true,
            })
        } else {
            json!({
                "model": model,
                "messages": messages,
                "stream": true,
                "stream_options": { "include_usage": true },
            })
        };

        let abort = Arc::new(AtomicBoolFlag::new());
        self.aborts
            .lock()
            .await
            .insert(req.thread_id.clone(), Arc::clone(&abort));

        let client = match reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                (req.on_event)(json!({"kind":"error","message": e.to_string()}));
                return SendResult {
                    session_id: Some(sid),
                    ok: false,
                    error: Some(e.to_string()),
                };
            }
        };

        let mut request = client.post(&url).json(&body);
        if anthropic {
            request = request
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01");
        } else {
            request = request.bearer_auth(&api_key);
        }

        let res = match request.send().await {
            Ok(r) => r,
            Err(e) => {
                self.aborts.lock().await.remove(&req.thread_id);
                let message = e.to_string();
                (req.on_event)(json!({"kind":"error","message": message}));
                return SendResult {
                    session_id: Some(sid),
                    ok: false,
                    error: Some(message),
                };
            }
        };

        if !res.status().is_success() {
            let status = res.status();
            let detail = res.text().await.unwrap_or_default();
            let message = format!(
                "{} HTTP {}: {}",
                self.cfg.label,
                status,
                detail.chars().take(300).collect::<String>()
            );
            self.aborts.lock().await.remove(&req.thread_id);
            (req.on_event)(json!({"kind":"error","message": message}));
            return SendResult {
                session_id: Some(sid),
                ok: false,
                error: Some(message),
            };
        }

        let mut full_text = String::new();
        let mut full_thinking = String::new();
        let mut usage = json!({"context":0,"output":0,"cost":null,"turns":null});
        let mut carry = String::new();

        use futures_util::StreamExt;
        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if abort.get() || (req.is_cancelled)() {
                break;
            }
            let Ok(bytes) = chunk else { break };
            let text = String::from_utf8_lossy(&bytes);
            let (events, rest) = parse_sse_chunk(&text, &carry);
            carry = rest;
            for ev in events {
                let kind = ev.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                if kind == "delta" {
                    if let Some(t) = ev.get("text").and_then(|v| v.as_str()) {
                        full_text.push_str(t);
                    }
                }
                if kind == "thinking_delta" {
                    if let Some(t) = ev.get("text").and_then(|v| v.as_str()) {
                        full_thinking.push_str(t);
                    }
                }
                if kind == "usage" {
                    if let Some(u) = ev.get("usage") {
                        usage = u.clone();
                    }
                    continue;
                }
                if kind == "error" {
                    (req.on_event)(ev);
                    self.aborts.lock().await.remove(&req.thread_id);
                    return SendResult {
                        session_id: Some(sid),
                        ok: false,
                        error: Some("API error".into()),
                    };
                }
                (req.on_event)(ev);
            }
        }

        let assistant = json!({
            "role": "assistant",
            "content": full_text,
            "reasoning": if full_thinking.is_empty() { Value::Null } else { json!(full_thinking) },
        });
        self.append_history(&sid, &[user_message, assistant]);
        if !full_text.is_empty() {
            (req.on_event)(json!({"kind":"text","text": full_text}));
        }
        let ok = !abort.get() && !(req.is_cancelled)();
        (req.on_event)(json!({
            "kind": "done",
            "ok": ok,
            "result": full_text,
            "usage": usage,
        }));
        self.aborts.lock().await.remove(&req.thread_id);
        SendResult {
            session_id: Some(sid),
            ok,
            error: if ok {
                None
            } else {
                Some("interrupted".into())
            },
        }
    }

    async fn interrupt(&self, thread_id: &str) -> bool {
        if let Some(flag) = self.aborts.lock().await.get(thread_id) {
            flag.set();
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_delta() {
        let (ev, _) = parse_sse_chunk(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n",
            "",
        );
        assert_eq!(ev[0]["kind"], "delta");
        assert_eq!(ev[0]["text"], "hi");
    }

    #[test]
    fn load_base_url_capital() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("api_providers.json");
        std::fs::write(
            &path,
            r#"[{"id":"or","label":"OR","baseURL":"https://openrouter.ai/api/v1","models":["m1"],"defaultModel":"m1"}]"#,
        )
        .unwrap();
        let cfgs = load_api_configs(dir.path());
        assert_eq!(cfgs.len(), 1);
        assert_eq!(cfgs[0].base_url, "https://openrouter.ai/api/v1");
        assert_eq!(cfgs[0].models, vec!["m1".to_string()]);
    }
}
