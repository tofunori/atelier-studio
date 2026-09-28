//! Réglages des alertes ntfy vues de l'iPhone (`/remote/v1/notify`).
//! Le guetteur et la décision vivent dans `crate::notify`.
use super::*;
use crate::notify::{self, NotifyUpdate};

pub(super) async fn settings(State(state): State<GatewayState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::ChatInteract).await?;
    let path = notify::settings_path(&state).await;
    let settings = tokio::task::spawn_blocking(move || notify::NotifySettings::load(&path))
        .await
        .map_err(|_| unavailable())?;
    Ok(Json(settings.to_json()))
}

/// Corps JSON facultatif `{enabled?, onlyWhenAway?, preview?, test?}`. Lu
/// APRÈS l'authentification : sans jeton, toujours 401, quel que soit le corps.
pub(super) async fn update(State(state): State<GatewayState>, headers: HeaderMap, body: Bytes) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let device = require_device(&state, &headers, Scope::ChatInteract).await?;
    check_body_size(&body, 4 * 1024)?;
    let update: NotifyUpdate = if body.iter().all(u8::is_ascii_whitespace) {
        NotifyUpdate::default()
    } else {
        serde_json::from_slice(&body).map_err(|_| ApiError::bad_request("invalid_json", "réglages d'alerte invalides"))?
    };
    let test = update.test == Some(true);
    // Les réponses d'accord échappent au budget de lecture ; une alerte
    // d'essai répétée, elle, ne doit pas pouvoir inonder le sujet ntfy.
    if test && !test_budget(&device.device_id) {
        return Err(ApiError::rate_limited());
    }
    let path = notify::settings_path(&state).await;
    let settings = tokio::task::spawn_blocking(move || notify::apply_update(&path, &update))
        .await
        .map_err(|_| unavailable())?
        .map_err(|_| unavailable())?;
    if test {
        if let Err(error) = notify::send_test(&settings).await {
            tracing::warn!(%error, "alerte d'essai ntfy non envoyée");
            return Err(ApiError::new(
                StatusCode::BAD_GATEWAY,
                "notify_failed",
                "L'alerte d'essai n'a pas pu être envoyée. Vérifiez la connexion du Mac.",
            ));
        }
    }
    Ok(Json(settings.to_json()))
}

/// 6 alertes d'essai par minute et par appareil.
fn test_budget(device_id: &str) -> bool {
    static LIMITER: std::sync::OnceLock<std::sync::Mutex<crate::rate_limit::RateLimiter>> = std::sync::OnceLock::new();
    LIMITER
        .get_or_init(|| std::sync::Mutex::new(crate::rate_limit::RateLimiter::new(std::time::Duration::from_secs(60), 6)))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .check(device_id)
}

fn unavailable() -> ApiError {
    ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "notify_unavailable", "Réglages d'alerte indisponibles")
}
