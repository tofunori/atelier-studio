//! Fournisseurs d'API du routeur WebSocket : modèles disponibles et
//! registre des fournisseurs (lister, sauver, supprimer). Extrait de `ws_router.rs`.

use super::*;

pub(super) async fn handle_list_api_models(_state: &AppState, msg: &Value) -> Vec<String> {
    let provider = msg.get("provider").cloned().unwrap_or(json!({}));
    let base = provider
        .get("baseURL")
        .or_else(|| provider.get("baseUrl"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_end_matches('/');
    if base.is_empty() {
        return vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": "baseURL requise",
        }))];
    }
    let api_key = provider
        .get("apiKey")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            provider
                .get("apiKeyEnv")
                .and_then(|v| v.as_str())
                .and_then(|e| std::env::var(e).ok())
                .filter(|s| !s.is_empty())
        });
    let Some(api_key) = api_key else {
        return vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": "clé API requise pour lister les modèles",
        }))];
    };
    let anthropic = provider.get("protocol").and_then(|v| v.as_str()) == Some("anthropic");
    let url = if anthropic {
        format!("{base}/v1/models")
    } else if base.ends_with("/v1") {
        format!("{base}/models")
    } else {
        format!("{base}/v1/models")
    };
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return vec![json_msg(json!({
                "type": "apiModels",
                "models": null,
                "error": e.to_string(),
            }))];
        }
    };
    let mut req = client.get(&url);
    req = if anthropic {
        req.header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
    } else {
        req.bearer_auth(&api_key)
    };
    match req.send().await {
        Ok(res) if res.status().is_success() => {
            let json: Value = res.json().await.unwrap_or(json!({}));
            let list = json
                .get("data")
                .or_else(|| json.get("models"))
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let mut models: Vec<Value> = list
                .into_iter()
                .filter_map(|m| {
                    let id = m
                        .get("id")
                        .or_else(|| m.get("name"))
                        .and_then(|v| v.as_str())?
                        .to_string();
                    if id.is_empty() {
                        return None;
                    }
                    Some(json!({
                        "id": id,
                        "label": m.get("display_name").or_else(|| m.get("name")).or_else(|| m.get("id")).cloned().unwrap_or(json!(id)),
                        "reasoning": m.get("reasoning"),
                    }))
                })
                .collect();
            models.sort_by(|a, b| {
                a.get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .cmp(b.get("id").and_then(|v| v.as_str()).unwrap_or(""))
            });
            vec![json_msg(json!({"type":"apiModels","models": models}))]
        }
        Ok(res) => vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": format!("HTTP {}", res.status()),
        }))],
        Err(e) => vec![json_msg(json!({
            "type": "apiModels",
            "models": null,
            "error": e.to_string(),
        }))],
    }
}

/// Public list: strip raw apiKey for UI (keep apiKeyEnv + presence flag).
pub(super) fn list_api_providers_public(app_dir: &std::path::Path) -> Vec<Value> {
    let path = app_dir.join("api_providers.json");
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(val) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
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
        // `api_providers.json` contient aussi des credentials spécialisés
        // (ex. byteplus-images) qui ne sont pas des providers de chat. Le
        // frontend Providers attend un endpoint + au moins un modèle : ne
        // jamais lui exposer ces entrées auxiliaires.
        .filter(|p| {
            p.get("baseURL")
                .or_else(|| p.get("baseUrl"))
                .or_else(|| p.get("base_url"))
                .and_then(Value::as_str)
                .is_some_and(|base| !base.trim().is_empty())
                && p.get("models")
                    .and_then(Value::as_array)
                    .is_some_and(|models| !models.is_empty())
        })
        .map(|mut p| {
            if let Some(obj) = p.as_object_mut() {
                let has_key = obj
                    .get("apiKey")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false);
                let env_key_set = obj
                    .get("apiKeyEnv")
                    .and_then(|v| v.as_str())
                    .and_then(|name| std::env::var(name).ok())
                    .is_some_and(|value| !value.is_empty());
                let model_entries = obj
                    .get("models")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut model_ids = Vec::new();
                let mut model_reasoning = serde_json::Map::new();
                for model in model_entries {
                    let (id, reasoning) = if let Some(id) = model.as_str() {
                        (Some(id.to_string()), None)
                    } else {
                        (
                            model
                                .get("id")
                                .or_else(|| model.get("name"))
                                .and_then(Value::as_str)
                                .map(str::to_string),
                            model.get("reasoning").cloned(),
                        )
                    };
                    let Some(id) = id.filter(|id| !id.is_empty()) else {
                        continue;
                    };
                    if let Some(reasoning) = reasoning {
                        model_reasoning.insert(id.clone(), reasoning);
                    }
                    model_ids.push(id);
                }
                obj.remove("apiKey");
                // Nom partagé avec le backend Node et le contrat Settings.
                obj.insert("keySet".into(), json!(has_key || env_key_set));
                obj.insert("models".into(), json!(model_ids));
                obj.insert("modelReasoning".into(), Value::Object(model_reasoning));
            }
            p
        })
        .collect()
}

pub(super) fn save_api_provider(app_dir: &std::path::Path, provider: Value) -> Result<Vec<Value>, String> {
    let id = provider
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "id requis".to_string())?
        .to_string();
    let path = app_dir.join("api_providers.json");
    let mut list: Vec<Value> = if let Ok(raw) = std::fs::read_to_string(&path) {
        let val: Value = serde_json::from_str(&raw).unwrap_or(json!([]));
        if let Some(arr) = val.as_array() {
            arr.clone()
        } else {
            val.get("providers")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        }
    } else {
        Vec::new()
    };
    // If UI omitted apiKey but entry exists, keep previous key.
    let mut provider = provider;
    if provider
        .get("apiKey")
        .and_then(|v| v.as_str())
        .map(|s| s.is_empty())
        .unwrap_or(true)
    {
        if let Some(prev) = list
            .iter()
            .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
        {
            if let Some(k) = prev.get("apiKey").cloned() {
                if let Some(obj) = provider.as_object_mut() {
                    obj.insert("apiKey".into(), k);
                }
            }
        }
    }
    if let Some(pos) = list
        .iter()
        .position(|p| p.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
    {
        list[pos] = provider;
    } else {
        list.push(provider);
    }
    atelier_providers::write_api_configs(app_dir, &list)?;
    Ok(list_api_providers_public(app_dir))
}

pub(super) fn delete_api_provider(app_dir: &std::path::Path, id: &str) -> Result<Vec<Value>, String> {
    if id.is_empty() {
        return Err("id requis".into());
    }
    let path = app_dir.join("api_providers.json");
    let mut list: Vec<Value> = if let Ok(raw) = std::fs::read_to_string(&path) {
        let val: Value = serde_json::from_str(&raw).unwrap_or(json!([]));
        if let Some(arr) = val.as_array() {
            arr.clone()
        } else {
            val.get("providers")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        }
    } else {
        Vec::new()
    };
    list.retain(|p| p.get("id").and_then(|v| v.as_str()) != Some(id));
    atelier_providers::write_api_configs(app_dir, &list)?;
    Ok(list_api_providers_public(app_dir))
}
