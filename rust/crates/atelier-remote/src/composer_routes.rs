//! Composer suggestions use the selected thread's trusted project root.
use super::*;

pub(super) async fn commands(
    State(state): State<GatewayState>, headers: HeaderMap, Path(thread_id): Path<String>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let _ = require_device(&state, &headers, Scope::ChatRead).await?;
    let root = {
        let mut g = state.inner.lock().await;
        g.threads = atelier_store::ThreadStore::open(g.config.atelier_dir.join("threads.json"));
        g.threads.get(&thread_id).ok_or_else(|| ApiError::not_found("conversation introuvable"))?.project_root.clone()
    };
    let commands = tokio::task::spawn_blocking(move || {
        let mut entries: Vec<Value> = atelier_workspace::list_commands(Some(&root)).into_iter()
            .filter(|c| c.source != "builtin")
            .map(|c| json!({"name": c.name, "source": c.source})).collect();
        // These commands have a mobile handler, or a shared send handler (/ref).
        for (name, description) in [("model", "Choisir le modèle"), ("permissions", "Mode d’autorisation"), ("ref", "Chercher une référence")] {
            entries.retain(|c| c["name"] != name);
            entries.push(json!({"name":name, "source":"atelier", "description":description}));
        }
        entries
    }).await.map_err(|_| ApiError::bad_request("catalog_unavailable", "Catalogue indisponible"))?;
    Ok(Json(json!({"commands":commands})))
}

/// Resolve only an explicit leading /skill from the same catalog. Never accept
/// a client-supplied filesystem path. Keep displayEvent unchanged for history.
pub(super) async fn skill_prompt(root: String, raw: &str, prompt: String) -> (String, Option<Value>) {
    let Some(command) = raw.trim_start().strip_prefix('/')
        .and_then(|s| s.split_whitespace().next()).map(str::to_string) else { return (prompt, None) };
    if ["model", "permissions", "plan", "ref"].contains(&command.as_str()) { return (prompt, None); }
    let skill = tokio::task::spawn_blocking(move || atelier_workspace::list_commands(Some(&root)).into_iter()
        .find(|c| c.source != "builtin" && c.name == command && c.path.is_some())).await.ok().flatten();
    let Some(skill) = skill else { return (prompt, None) };
    let path = skill.path.unwrap();
    let instruction = format!("Utilise le skill {} : lis le fichier {} et applique ses instructions à la demande ci-dessous.\n\n{}",
        serde_json::to_string(&skill.name).unwrap(), serde_json::to_string(&path).unwrap(), prompt);
    (instruction, Some(json!({"type":"skill", "name":skill.name, "path":path})))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn skill_invocation_uses_catalog_path_and_keeps_unknown_commands_untouched() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join(".agents/skills/mobile-catalog-test");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("SKILL.md"), "Test instructions").unwrap();
        let root = root.path().to_string_lossy().into_owned();
        let raw = "/mobile-catalog-test Analyse ce texte";
        let (prompt, input) = skill_prompt(root.clone(), raw, raw.into()).await;
        assert!(prompt.starts_with("Utilise le skill"));
        assert!(prompt.ends_with(raw));
        assert_eq!(input.unwrap()["path"], folder.join("SKILL.md").to_string_lossy().as_ref());
        for raw in ["/missing-mobile-catalog-test", "Texte /mobile-catalog-test", "/model", "/../../etc/passwd"] {
            let (prompt, input) = skill_prompt(root.clone(), raw, raw.into()).await;
            assert_eq!(prompt, raw); assert!(input.is_none());
        }
    }
}
