//! Read-only mobile bridge to the same collectors used by the desktop.
use super::*;

#[derive(Default, Deserialize)]
pub(super) struct SnapshotQuery { host: Option<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LogQuery { run_id: String }

pub(super) async fn snapshot(State(state): State<GatewayState>, headers: HeaderMap, Query(query): Query<SnapshotQuery>) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let device = require_device(&state, &headers, Scope::FilesRead).await?;
    let hosts = match query.host.as_deref().unwrap_or("all") {
        "all" => vec!["mac", "nas", "narval"],
        "mac" => vec!["mac"], "nas" => vec!["nas"], "narval" => vec!["narval"],
        _ => return Err(ApiError::bad_request("invalid_host", "Emplacement de calcul invalide")),
    };
    request(&state, &device.device_id, json!({"type":"computeSnapshot", "hosts":hosts, "days":7}), "computeSnapshot").await.map(Json)
}

pub(super) async fn log(State(state): State<GatewayState>, headers: HeaderMap, Query(query): Query<LogQuery>) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    let device = require_device(&state, &headers, Scope::FilesRead).await?;
    if query.run_id.is_empty() || query.run_id.len() > 512 || query.run_id.chars().any(char::is_control) {
        return Err(ApiError::bad_request("invalid_run", "Référence de calcul invalide"));
    }
    request(&state, &device.device_id, json!({"type":"computeReadLog", "runId":query.run_id, "tailLines":100}), "computeLog").await.map(Json)
}

async fn request(state: &GatewayState, device: &str, mut query: Value, expected: &str) -> ApiResult<Value> {
    let request_id = uuid::Uuid::new_v4().to_string();
    query["requestId"] = json!(request_id);
    // Bounds connection setup AND the collectors, which can visit three hosts.
    tokio::time::timeout(std::time::Duration::from_secs(90), async {
        let mut socket = read_socket(state, &format!("{device}-compute-{request_id}")).await?;
        socket.send(Message::Text(query.to_string().into())).await.map_err(|_| unavailable())?;
        while let Some(Ok(frame)) = socket.next().await {
            if let Message::Text(text) = frame {
                let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
                if value["type"] != expected || value["requestId"] != request_id { continue; }
                // Do not expose internal collector error payloads through the gateway.
                if !value["error"].is_null() { return Err(unavailable()); }
                return value.get("data").filter(|v| v.is_object()).cloned().ok_or_else(unavailable);
            }
        }
        Err(unavailable())
    }).await.map_err(|_| ApiError::new(StatusCode::GATEWAY_TIMEOUT, "compute_timeout", "Le suivi des calculs prend trop de temps. Réessayez."))?
}
fn unavailable() -> ApiError {
    ApiError::new(StatusCode::BAD_GATEWAY, "compute_unavailable", "Suivi indisponible. Vérifiez qu’Atelier est à jour et ouvert sur le Mac.")
}
