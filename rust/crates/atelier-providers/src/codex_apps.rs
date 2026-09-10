//! Connector inventory uses the committed runtime snapshot, not marketplace presence.
use crate::codex_rpc::CodexAppServer;
use serde_json::{json, Value};

pub(crate) async fn installed(
    server: &CodexAppServer,
) -> Result<(Vec<Value>, Option<String>), String> {
    let snapshot = server
        .request("app/installed", json!({"forceRefresh": true}))
        .await?;
    let apps = snapshot
        .get("apps")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut metadata = Vec::new();
    let mut warning = None;
    for chunk in apps.chunks(100) {
        let ids: Vec<&Value> = chunk.iter().filter_map(|app| app.get("id")).collect();
        match server.request("app/read", json!({"appIds": ids})).await {
            Ok(response) => metadata.extend(
                response
                    .get("apps")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default(),
            ),
            Err(error) => warning = Some(format!("Métadonnées apps: {error}")),
        }
    }
    Ok((catalog_entries(&apps, &metadata), warning))
}

fn catalog_entries(apps: &[Value], metadata: &[Value]) -> Vec<Value> {
    let mut aliases = std::collections::HashSet::new();
    apps.iter()
        .filter_map(|app| {
            let id = app.get("id")?.as_str()?;
            let detail = metadata
                .iter()
                .find(|entry| entry["id"] == id)
                .unwrap_or(app);
            let name = detail
                .get("name")
                .or_else(|| app.get("runtimeName"))
                .and_then(Value::as_str)
                .unwrap_or(id);
            let slug = name
                .to_lowercase()
                .split(|c: char| !c.is_ascii_alphanumeric())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("-");
            let mut alias = format!("app-{}", if slug.is_empty() { id } else { &slug });
            if !aliases.insert(alias.clone()) {
                alias = format!("{alias}-{id}");
            }
            let enabled = app["enabled"].as_bool().unwrap_or(false);
            let callable = app["callable"].as_bool().unwrap_or(false);
            Some(json!({
                "id": format!("connector:{id}"), "name": alias, "displayName": name,
                "description": detail["description"].as_str().unwrap_or(""), "kind": "app",
                "enabled": enabled, "callable": callable, "skills": [],
                "icon": detail["iconUrl"], "installUrl": detail["installUrl"],
                "appMention": {"type": "mention", "name": name, "path": format!("app://{id}")},
            }))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runtime_availability_survives_missing_metadata() {
        let apps = vec![
            json!({"id":"connector_one", "runtimeName":"Drive", "enabled":true, "callable":true}),
            json!({"id":"connector_two", "runtimeName":"Drive", "enabled":false, "callable":false}),
        ];
        let rows = catalog_entries(&apps, &[]);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["appMention"]["path"], "app://connector_one");
        assert_eq!(rows[0]["callable"], true);
        assert_eq!(rows[1]["enabled"], false);
        assert_ne!(rows[0]["name"], rows[1]["name"]);
    }
}
