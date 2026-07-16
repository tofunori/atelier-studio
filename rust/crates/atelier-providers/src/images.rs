//! BytePlus Seedream image generation (plan 033 Porte 8).

use serde_json::{json, Value};
use std::path::Path;

pub const ARK_BASE_URL: &str = "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";
pub const DEFAULT_MODEL: &str = "dola-seedream-5-0-pro-260628";
const IMAGE_PROVIDER_ID: &str = "byteplus-images";

pub fn resolve_ark_api_key(app_dir: &Path) -> Option<String> {
    if let Ok(v) = std::env::var("ARK_API_KEY") {
        if !v.is_empty() {
            return Some(v);
        }
    }
    let path = app_dir.join("api_providers.json");
    let raw = std::fs::read_to_string(path).ok()?;
    let val: Value = serde_json::from_str(&raw).ok()?;
    let list = if val.is_array() {
        val.as_array()?.clone()
    } else {
        val.get("providers")?.as_array()?.clone()
    };
    let entry = list
        .iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(IMAGE_PROVIDER_ID))?;
    if let Some(env) = entry.get("apiKeyEnv").and_then(|v| v.as_str()) {
        if let Ok(v) = std::env::var(env) {
            if !v.is_empty() {
                return Some(v);
            }
        }
    }
    entry
        .get("apiKey")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

pub fn resolve_ark_model(app_dir: &Path) -> String {
    let path = app_dir.join("api_providers.json");
    let Ok(raw) = std::fs::read_to_string(path) else {
        return DEFAULT_MODEL.into();
    };
    let Ok(val) = serde_json::from_str::<Value>(&raw) else {
        return DEFAULT_MODEL.into();
    };
    let list = if val.is_array() {
        val.as_array().cloned().unwrap_or_default()
    } else {
        val.get("providers")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
    };
    list.iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(IMAGE_PROVIDER_ID))
        .and_then(|e| e.get("model").and_then(|v| v.as_str()))
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| DEFAULT_MODEL.into())
}

pub async fn generate_image(
    app_dir: &Path,
    prompt: &str,
    size: &str,
    edit_image_data_uri: Option<&str>,
) -> Result<Value, String> {
    if prompt.trim().is_empty() {
        return Err("prompt requis".into());
    }
    let api_key = resolve_ark_api_key(app_dir).ok_or_else(|| {
        "clé API BytePlus manquante (ARK_API_KEY ou api_providers.json)".to_string()
    })?;
    let model = resolve_ark_model(app_dir);
    let mut body = json!({
        "model": model,
        "prompt": prompt,
        "size": size,
        "output_format": "png",
        "response_format": "b64_json",
        "watermark": false,
    });
    if let Some(uri) = edit_image_data_uri {
        body.as_object_mut()
            .unwrap()
            .insert("image".into(), json!(uri));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(ARK_BASE_URL)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = res.status();
    let data: Value = res.json().await.map_err(|e| e.to_string())?;
    if !status.is_success()
        || data.get("error").is_some()
        || data.pointer("/data/0/error").is_some()
    {
        let msg = data
            .pointer("/error/message")
            .or_else(|| data.pointer("/data/0/error/message"))
            .and_then(|v| v.as_str())
            .unwrap_or("BytePlus ModelArk error");
        return Err(format!("{msg} (HTTP {status})"));
    }
    let b64 = data
        .pointer("/data/0/b64_json")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "réponse BytePlus sans image (b64_json manquant)".to_string())?;
    Ok(json!({
        "b64": b64,
        "size": data.pointer("/data/0/size").cloned().unwrap_or(json!(size)),
        "model": model,
        "usage": data.get("usage"),
    }))
}
