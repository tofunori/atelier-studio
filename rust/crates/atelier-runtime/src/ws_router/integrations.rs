//! Réglage des intégrations facultatives (Ragdoc, gbrain, calculs, Crossref,
//! Zotero) et redétection des CLI d'agents. Extrait de `ws_router.rs`.

use super::*;

fn integrations_message(app_dir: &std::path::Path, error: Option<String>) -> String {
    let integrations = atelier_integrations::Integrations::load_from(app_dir);
    let mut body = json!({
        "type": "integrations",
        "config": integrations.config(),
        "effective": integrations.effective_json(),
    });
    if let Some(error) = error {
        body["error"] = json!(error);
    }
    json_msg(body)
}

/// Lecture : fichier + variables d'environnement + détection Zotero (lecture
/// de prefs.js) — hors du runtime async.
pub(super) async fn handle_integrations(state: &AppState) -> Vec<String> {
    let app_dir = state.app_dir().to_path_buf();
    match crate::ws_dispatch::blocking(move || integrations_message(&app_dir, None)).await {
        Ok(message) => vec![message],
        Err(error) => vec![err(format!("intégrations illisibles : {error}"))],
    }
}

/// Enregistrement : refusé en bloc au premier champ invalide ; la réponse
/// porte alors l'ancienne configuration et `error`.
pub(super) async fn handle_save_integrations(state: &AppState, msg: &Value) -> Vec<String> {
    let app_dir = state.app_dir().to_path_buf();
    let config = msg.get("config").cloned().unwrap_or_else(|| json!({}));
    let result = crate::ws_dispatch::blocking(move || {
        let error = atelier_integrations::save(&app_dir, &config).err();
        integrations_message(&app_dir, error)
    })
    .await;
    match result {
        Ok(message) => vec![message],
        Err(error) => vec![err(format!("intégrations non enregistrées : {error}"))],
    }
}

/// « Revérifier » : ajoute les CLI installés depuis le lancement, puis renvoie
/// les deux messages que l'interface consomme déjà.
pub(super) async fn handle_refresh_providers(state: &AppState) -> Vec<String> {
    let refreshed = state.clone();
    let added = crate::ws_dispatch::blocking(move || refreshed.refresh_providers())
        .await
        .unwrap_or_default();
    if !added.is_empty() {
        tracing::info!(?added, "providers détectés après le lancement");
    }
    let mut out = crate::send::handle_provider_status(state).await;
    out.extend(handle_setup_status(state, None).await);
    out
}
