//! HTTP bridge to Atelier runtime `/internal/agent-mcp`.

use serde_json::{json, Value};
use std::time::Duration;

pub struct Bridge {
    endpoint: String,
    capability: String,
    client: reqwest::Client,
}

impl Bridge {
    pub fn from_env() -> Result<Self, String> {
        let endpoint = std::env::var("ATELIER_MCP_ENDPOINT")
            .map_err(|_| "ATELIER_MCP_ENDPOINT manquant".to_string())?;
        let capability = std::env::var("ATELIER_MCP_CAPABILITY")
            .map_err(|_| "ATELIER_MCP_CAPABILITY manquant".to_string())?;
        if capability.is_empty() {
            return Err("ATELIER_MCP_CAPABILITY vide".into());
        }
        // Never log capability.
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(65))
            .no_proxy()
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self {
            endpoint,
            capability,
            client,
        })
    }

    pub async fn call(&self, action: &str, arguments: &Value) -> Result<Value, String> {
        let mut body = match arguments {
            Value::Object(map) => {
                let mut m = map.clone();
                m.insert("action".into(), json!(action));
                Value::Object(m)
            }
            _ => json!({"action": action}),
        };
        // Ensure action wins.
        if let Some(obj) = body.as_object_mut() {
            obj.insert("action".into(), json!(action));
        }

        let resp = self
            .client
            .post(&self.endpoint)
            .header("x-atelier-agent-capability", &self.capability)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("backend_unavailable: {e}"))?;

        let status = resp.status();
        let val: Value = resp
            .json()
            .await
            .map_err(|e| format!("backend_unavailable: {e}"))?;
        if !status.is_success() {
            if let Some(code) = val.get("error").and_then(|v| v.as_str()) {
                return Ok(json!({"error": code}));
            }
            return Ok(json!({"error": "backend_unavailable", "status": status.as_u16()}));
        }
        Ok(val)
    }
}
