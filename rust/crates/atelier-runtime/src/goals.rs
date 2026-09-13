//! Durable thread-level goal updates use the same sink as ordinary turns.
use crate::state::AppState;
use serde_json::Value;
pub(crate) async fn emit(state: &AppState, thread_id: &str, event: Value) {
    let sink = crate::send::make_emit(state.clone(), thread_id.to_string());
    let harness = state.harness().harness_for(thread_id, "codex", sink).await;
    let _ = harness.lock().await.emit_global(event, "provider");
}

// Expose the session before the capsule, so first-turn pause/edit/stop can
// address the native goal immediately rather than becoming a pending creation.
pub(crate) async fn emit_native(state: &AppState, thread_id: &str, mut event: Value) {
    let session = event.as_object_mut().and_then(|e| e.remove("__nativeSessionId"));
    if let Some(session_id) = session.and_then(|s| s.as_str().map(str::to_string)) {
        // The send path durably binds the native session before turn/start.
        // A goal from an old/native thread must never replace that binding.
        let belongs_to_current = state
            .threads()
            .lock()
            .await
            .get(thread_id)
            .is_some_and(|thread| thread.session_id.as_deref() == Some(session_id.as_str()));
        if !belongs_to_current {
            return;
        }
    }
    emit(state, thread_id, event).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn native_goal_uses_the_already_durable_session_binding() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf()), None, "t".into(), "test".into(), "h".into(), "/tmp".into());
        state.threads().lock().await.upsert_durable(serde_json::json!({"id":"t","provider":"codex","sessionId":"native"}), false).unwrap();
        let mut bus = state.subscribe_bus();
        emit_native(&state, "t", serde_json::json!({"kind":"goal","__nativeSessionId":"native","goal":{"objective":"test","status":"active"}})).await;
        assert_eq!(state.threads().lock().await.get("t").unwrap().session_id.as_deref(), Some("native"));
        let first: Value = serde_json::from_str(&bus.recv().await.unwrap()).unwrap();
        assert_eq!(first["event"]["kind"], "goal");
        assert!(first["event"].get("__nativeSessionId").is_none());
    }

    #[tokio::test]
    async fn late_goal_cannot_replace_or_update_a_newer_session() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf()), None, "t".into(), "test".into(), "h".into(), "/tmp".into());
        state.threads().lock().await.upsert_durable(serde_json::json!({"id":"t","provider":"codex","sessionId":"new"}), false).unwrap();
        emit_native(&state, "t", serde_json::json!({"kind":"goal","__nativeSessionId":"old","goal":{"objective":"stale","status":"active"}})).await;
        assert_eq!(state.threads().lock().await.get("t").unwrap().session_id.as_deref(), Some("new"));
        assert!(state.journal().materialize("t").is_empty());
    }
    #[tokio::test]
    async fn goal_updates_are_durable_and_broadcast_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf()), None, "t".into(), "test".into(), "h".into(), "/tmp".into());
        let mut bus = state.subscribe_bus();
        emit(&state, "t", serde_json::json!({"kind":"goal","goal":{"objective":"test","status":"active"}})).await;
        emit(&state, "t", serde_json::json!({"kind":"goal","goal":null,"cleared":true})).await;
        let first: Value = serde_json::from_str(&bus.recv().await.unwrap()).unwrap();
        let second: Value = serde_json::from_str(&bus.recv().await.unwrap()).unwrap();
        assert_eq!(first["event"]["goal"]["objective"], "test");
        assert_eq!(second["event"]["cleared"], true);
        let replay = state.harness().journal().materialize("t");
        assert_eq!(replay.last().unwrap()["cleared"], true);
        assert!(second["event"]["meta"]["sequence"].as_u64().unwrap() > first["event"]["meta"]["sequence"].as_u64().unwrap());
    }
}
