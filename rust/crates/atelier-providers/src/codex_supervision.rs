//! Read-only convergence and legacy completion recovery, scoped to one send.
use crate::codex_parse::TurnMapState;
use crate::codex_rpc::ThreadConnection;
use crate::turn_idle::TurnActivity;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::watch;
use tokio::time::Instant;

pub type Handler = Arc<dyn Fn(&str, &Value) + Send + Sync>;
pub type CompletionHint = Option<(String, Instant, Option<String>)>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ObservedState {
    RecentActivity,
    InProgress,
    AwaitingHuman,
    Unknown,
}

pub fn notification_turn_id(params: &Value) -> Option<&str> {
    params.get("turnId").or_else(|| params.pointer("/turn/id"))
        .or_else(|| params.pointer("/msg/turn_id"))
        .and_then(Value::as_str)
}

/// Unknown/foreign identities cannot be evidence that this turn completed.
pub fn legacy_completion_turn<'a>(params: &'a Value, thread_id: &str, turn_id: Option<&str>) -> Option<&'a str> {
    for path in ["/threadId", "/conversationId", "/msg/conversation_id", "/msg/thread_id"] {
        if params.pointer(path).and_then(Value::as_str).is_some_and(|id| id != thread_id) {
            return None;
        }
    }
    let id = notification_turn_id(params).or_else(|| params.get("id").and_then(Value::as_str))?;
    (Some(id) == turn_id).then_some(id)
}

pub async fn recover_legacy_completion(
    mut hints: watch::Receiver<CompletionHint>,
    connection: &ThreadConnection,
    thread_id: &str,
    map: &Arc<Mutex<TurnMapState>>,
    handler: Handler,
) {
    loop {
        let hint = hints.borrow_and_update().clone();
        if let Some((id, deadline, final_text)) = hint {
            tokio::select! {
                changed = hints.changed() => { if changed.is_err() { return; } }
                _ = tokio::time::sleep_until(deadline) => {
                    // Completion is authoritative, but its final items may have
                    // been lost. Recover them before closing the harness stream.
                    loop {
                        if let Ok(Ok(snapshot)) = tokio::time::timeout(Duration::from_secs(2), connection.request(
                            "thread/read", json!({"threadId":thread_id,"includeTurns":true}),
                        )).await {
                            if let Some(turn) = terminal_snapshot(&snapshot, thread_id, &id) {
                                deliver_snapshot(turn, &id, &handler);
                                return;
                            }
                        }
                        if let Some(text) = final_text.as_deref() {
                            let already_received = map.lock().ok().is_some_and(|state| state.last_agent_text.as_deref() == Some(text));
                            if !already_received && !text.is_empty() {
                                handler("item/completed", &json!({"turnId":id,"item":{"id":format!("legacy-final:{id}"),"type":"agentMessage","text":text}}));
                            }
                            handler("turn/completed", &json!({"turn":{"id":id,"status":"completed"},"recoveredFrom":"task_complete"}));
                            return;
                        }
                        // No final payload and no readable terminal snapshot:
                        // retain the turn, letting its normal timeout/Stop apply.
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
        } else if hints.changed().await.is_err() { return; }
    }
}

fn deliver_snapshot(turn: &Value, id: &str, handler: &Handler) {
    if let Some(items) = turn["items"].as_array() {
        for item in items {
            handler("item/completed", &json!({"turnId":id,"item":item}));
        }
    }
    handler("turn/completed", &json!({"turn":turn,"recoveredFrom":"thread/read"}));
}

pub fn terminal_snapshot<'a>(snapshot: &'a Value, thread_id: &str, turn_id: &str) -> Option<&'a Value> {
    if snapshot.pointer("/thread/id").and_then(Value::as_str) != Some(thread_id) { return None; }
    snapshot.pointer("/thread/turns")?.as_array()?.iter().find(|turn| {
        turn["id"] == turn_id && matches!(turn["status"].as_str(), Some("completed" | "failed" | "interrupted" | "cancelled" | "canceled"))
    })
}

pub async fn reconcile_native_turn(
    connection: &ThreadConnection,
    thread_id: &str,
    map: &Arc<Mutex<TurnMapState>>,
    activity: &TurnActivity,
    silence_threshold: Duration,
    handler: Handler,
    on_event: Arc<dyn Fn(Value) + Send + Sync>,
) {
    let mut observed = activity.ticks();
    let mut last_activity = Instant::now();
    let mut state = ObservedState::RecentActivity;
    let poll = std::cmp::max(
        Duration::from_millis(10),
        std::cmp::min(Duration::from_secs(5), silence_threshold / 4),
    );
    let mut retry = std::cmp::max(Duration::from_millis(100), poll);
    let mut next_probe = Instant::now() + silence_threshold;
    loop {
        tokio::time::sleep(poll).await;
        let current = activity.ticks();
        if activity.awaiting_human() {
            state = ObservedState::AwaitingHuman;
            observed = current;
            last_activity = Instant::now();
            next_probe = last_activity + silence_threshold;
            retry = std::cmp::max(Duration::from_millis(100), poll);
            continue;
        }
        if observed != current {
            if matches!(state, ObservedState::InProgress | ObservedState::Unknown) {
                on_event(json!({
                    "kind":"activity",
                    "id":"codex-supervision",
                    "name":"codex_supervision",
                    "status":"completed",
                    "title":"Activité Codex reprise.",
                    "supervisionState":"recentActivity",
                }));
            }
            state = ObservedState::RecentActivity;
            observed = current;
            last_activity = Instant::now();
            next_probe = last_activity + silence_threshold;
            retry = std::cmp::max(Duration::from_millis(100), poll);
            continue;
        }
        if Instant::now() < next_probe || last_activity.elapsed() < silence_threshold { continue; }
        let Some(id) = map.lock().ok().and_then(|state| state.native_turn_id.clone()) else { continue; };
        // A failed/stalled read proves nothing about the running turn. Bounded,
        // one in flight, dropped together with the parent send future.
        let snapshot = tokio::time::timeout(Duration::from_secs(2), connection.request(
            "thread/read", json!({"threadId":thread_id,"includeTurns":true}),
        )).await;
        let snapshot = match snapshot {
            Ok(Ok(snapshot)) => snapshot,
            _ => {
                if state != ObservedState::Unknown {
                    on_event(json!({
                        "kind":"activity",
                        "id":"codex-supervision",
                        "name":"codex_supervision",
                        "status":"failed",
                        "title":"Statut Codex incertain: lecture native temporairement indisponible; le tour reste actif et peut être arrêté.",
                        "supervisionState":"unknown",
                    }));
                    state = ObservedState::Unknown;
                }
                next_probe = Instant::now() + retry;
                retry = std::cmp::min(retry.saturating_mul(2), Duration::from_secs(120));
                continue;
            }
        };
        if activity.ticks() != current || activity.awaiting_human() { continue; }
        if let Some(turn) = terminal_snapshot(&snapshot, thread_id, &id) {
            deliver_snapshot(turn, &id, &handler);
            return;
        }
        let in_progress = snapshot.pointer("/thread/id").and_then(Value::as_str) == Some(thread_id)
            && snapshot.pointer("/thread/turns").and_then(Value::as_array).is_some_and(|turns| {
                turns.iter().any(|turn| turn["id"] == id && turn["status"] == "inProgress")
            });
        if in_progress {
            if state != ObservedState::InProgress {
                on_event(json!({
                    "kind":"activity",
                    "id":"codex-supervision",
                    "name":"codex_supervision",
                    "status":"running",
                    "title":"En attente du modèle…",
                    "detail":"Le tour est encore ouvert. Aucune nouvelle sortie reçue; ce statut ne confirme pas une progression du modèle.",
                    "supervisionState":"inProgress",
                }));
                state = ObservedState::InProgress;
            }
        } else if state != ObservedState::Unknown {
            on_event(json!({
                "kind":"activity",
                "id":"codex-supervision",
                "name":"codex_supervision",
                "status":"failed",
                "title":"Statut Codex incertain: le tour attendu n'est pas terminal dans la lecture native; le tour reste actif.",
                "supervisionState":"unknown",
            }));
            state = ObservedState::Unknown;
        }
        retry = std::cmp::max(Duration::from_millis(100), poll);
        next_probe = Instant::now() + std::cmp::max(silence_threshold, Duration::from_secs(30));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn child_unknown_and_old_completions_do_not_settle_parent() {
        assert_eq!(legacy_completion_turn(&json!({"msg":{"turn_id":"parent"}}), "thread", Some("parent")), Some("parent"));
        for params in [json!({}), json!({"msg":{"turn_id":"child"}}), json!({"msg":{"turn_id":"parent","conversation_id":"child-thread"}})] {
            assert!(legacy_completion_turn(&params, "thread", Some("parent")).is_none());
        }
    }
    #[test]
    fn snapshot_requires_exact_identity_and_terminal_status() {
        for (thread, turn, status, valid) in [("t", "a", "completed", true), ("other", "a", "completed", false), ("t", "old", "completed", false), ("t", "a", "inProgress", false)] {
            let snapshot = json!({"thread":{"id":thread,"turns":[{"id":turn,"status":status}]}});
            assert_eq!(terminal_snapshot(&snapshot,"t","a").is_some(), valid);
        }
    }
}
