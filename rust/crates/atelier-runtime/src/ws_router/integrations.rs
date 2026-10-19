//! Réglage des intégrations facultatives (Ragdoc, gbrain, calculs, Crossref,
//! Zotero) et redétection des CLI d'agents. Extrait de `ws_router.rs`.

use super::*;

/// `integrations.json` présent mais illisible (vide, tronqué, refusé par
/// `normalize`) : l'erreur (copie `.corrupt-…` mise de côté). `read_config`
/// le lit alors comme une configuration vide — l'interface la montrerait, et
/// l'enregistrer effacerait Ragdoc, gbrain et les grappes.
fn unreadable_integrations(app_dir: &std::path::Path) -> Option<String> {
    let path = atelier_integrations::file_path(app_dir);
    atelier_store::durable::load_with(&path, |bytes| {
        let value: Value = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
        if !value.is_object() {
            return Err("ce n'est pas un objet JSON".to_string());
        }
        atelier_integrations::normalize(&value).map(|_| ())
    })
    .err()
    .map(|error| format!("Intégrations illisibles, rien n'est écrit : {error}"))
}

/// Enregistre, sauf si le fichier sur disque est illisible : l'erreur.
fn save_checked(app_dir: &std::path::Path, config: &Value) -> Option<String> {
    match unreadable_integrations(app_dir) {
        Some(unreadable) => Some(unreadable),
        None => atelier_integrations::save(app_dir, config).err(),
    }
}

fn integrations_message(app_dir: &std::path::Path, error: Option<String>) -> String {
    let error = error.or_else(|| unreadable_integrations(app_dir));
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
        let error = save_checked(&app_dir, &config);
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

#[cfg(test)]
mod tests {
    use super::*;
    use atelier_store::durable::{corrupt_copies_of, UNREADABLE_SAMPLES};

    #[test]
    fn unreadable_integrations_are_reported_and_never_overwritten() {
        for (label, raw) in UNREADABLE_SAMPLES {
            let dir = tempfile::tempdir().unwrap();
            let path = atelier_integrations::file_path(dir.path());
            std::fs::write(&path, raw).unwrap();
            let error = save_checked(dir.path(), &json!({"version": 1}));
            assert!(error.is_some_and(|e| e.contains("illisibles")), "{label}");
            let shown: Value = serde_json::from_str(&integrations_message(dir.path(), None)).unwrap();
            assert!(shown["error"].as_str().is_some_and(|e| e.contains("illisibles")), "{label} : erreur montrée");
            assert_eq!(std::fs::read(&path).unwrap(), raw.as_bytes(), "{label} : intact");
            assert_eq!(corrupt_copies_of(&path, raw.as_bytes()), 1, "{label} : copie");
        }
        let dir = tempfile::tempdir().unwrap();
        assert!(save_checked(dir.path(), &json!({"version": 1})).is_none(), "absent : enregistrable");
    }
}
