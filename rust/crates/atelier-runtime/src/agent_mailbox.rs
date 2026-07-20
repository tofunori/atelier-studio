//! Durable mailbox + scheduler for inter-agent messages (plan 057).

use crate::agent_mcp::{authorize_target, provider_label};
use crate::state::AppState;
use crate::ws_router::json_msg;
use atelier_protocol::agent_mcp_errors as err;
use atelier_protocol::agent_mcp_limits as lim;
use atelier_store::{iso_now, MailboxMessage};
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn action_send_message(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let target_id = req
        .get("targetThreadId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing_targetThreadId".to_string())?;
    let text = req
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if text.is_empty() {
        return Err("missing_text".into());
    }
    if text.len() > lim::MESSAGE_MAX_BYTES {
        return Err(err::PAYLOAD_TOO_LARGE.into());
    }
    let request_id = req
        .get("requestId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "missing_requestId".to_string())?;
    authorize_target(state, caller_id, target_id).await?;

    enqueue_and_schedule(
        state,
        caller_id,
        target_id,
        text,
        "message",
        None,
        &request_id,
        req.get("traceId").and_then(|v| v.as_str()),
        req.get("hop").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
    )
    .await
}

pub async fn action_report_to_parent(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let request_id = req
        .get("requestId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "missing_requestId".to_string())?;
    let store = state.threads().lock().await;
    let caller = store
        .get(caller_id)
        .cloned()
        .ok_or_else(|| err::CALLER_UNKNOWN.to_string())?;
    let parent_id = caller
        .agent_link
        .as_ref()
        .map(|l| l.parent_thread_id.clone())
        .ok_or_else(|| err::RELATION_REQUIRED.to_string())?;
    drop(store);
    authorize_target(state, caller_id, &parent_id).await?;

    let report = req.get("report").cloned().unwrap_or(Value::Null);
    let report_bytes = serde_json::to_vec(&report).map(|v| v.len()).unwrap_or(0);
    if report_bytes > lim::REPORT_MAX_BYTES {
        return Err(err::PAYLOAD_TOO_LARGE.into());
    }
    let text = req
        .get("text")
        .and_then(|v| v.as_str())
        .or_else(|| report.get("summary").and_then(|v| v.as_str()))
        .unwrap_or("(rapport)")
        .to_string();

    enqueue_and_schedule(
        state,
        caller_id,
        &parent_id,
        &text,
        "report",
        Some(report),
        &request_id,
        req.get("traceId").and_then(|v| v.as_str()),
        req.get("hop").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
    )
    .await
}

async fn enqueue_and_schedule(
    state: &AppState,
    from: &str,
    to: &str,
    text: &str,
    kind: &str,
    structured: Option<Value>,
    request_id: &str,
    trace_id: Option<&str>,
    hop: u32,
) -> Result<Value, String> {
    if hop >= lim::MAX_HOP {
        return Err(err::BUDGET_EXHAUSTED.into());
    }
    if from == to {
        return Err(err::SELF_TARGET_DENIED.into());
    }

    // resolve relation + budget
    let (relation, link_child_id, budget_ok, paused) = {
        let store = state.threads().lock().await;
        let from_t = store.get(from).cloned().ok_or_else(|| err::CALLER_UNKNOWN.to_string())?;
        let to_t = store.get(to).cloned().ok_or_else(|| err::THREAD_NOT_FOUND.to_string())?;
        let relation = if from_t
            .agent_link
            .as_ref()
            .map(|l| l.parent_thread_id == to)
            .unwrap_or(false)
        {
            "child_to_parent"
        } else if to_t
            .agent_link
            .as_ref()
            .map(|l| l.parent_thread_id == from)
            .unwrap_or(false)
        {
            "parent_to_child"
        } else {
            return Err(err::RELATION_REQUIRED.into());
        };
        let child_id = if relation == "parent_to_child" {
            to.to_string()
        } else {
            from.to_string()
        };
        let link = store
            .get(&child_id)
            .and_then(|t| t.agent_link.clone())
            .ok_or_else(|| err::RELATION_REQUIRED.to_string())?;
        let budget_ok = link.auto_delivery_used < link.auto_delivery_limit;
        (relation.to_string(), child_id, budget_ok, link.paused)
    };

    {
        let mb = state.mailbox().lock().await;
        if mb.count_queued_for_link(
            if relation == "parent_to_child" { from } else { to },
            &link_child_id,
        ) >= lim::MAX_QUEUE_PER_LINK
        {
            return Err(err::QUEUE_FULL.into());
        }
    }

    let now = iso_now();
    let status = if paused {
        "paused"
    } else if !budget_ok {
        "paused"
    } else {
        "queued"
    };
    let msg = MailboxMessage {
        id: Uuid::new_v4().to_string(),
        request_id: request_id.to_string(),
        trace_id: trace_id
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
        hop,
        from_thread_id: from.to_string(),
        to_thread_id: to.to_string(),
        relation,
        kind: kind.into(),
        text: text.into(),
        structured,
        status: status.into(),
        created_at: now.clone(),
        updated_at: now.clone(),
        error_code: if status == "paused" {
            Some(if paused {
                err::LINK_PAUSED.into()
            } else {
                err::BUDGET_EXHAUSTED.into()
            })
        } else {
            None
        },
    };

    let stored = {
        let mut mb = state.mailbox().lock().await;
        mb.enqueue(msg)?
    };

    // Write agent_message events to both journals
    emit_agent_message_events(state, &stored).await;

    if stored.status == "queued" {
        let st = state.clone();
        tokio::spawn(async move {
            drain_mailbox(&st).await;
        });
    }

    Ok(json!({
        "messageId": stored.id,
        "status": stored.status,
        "requestId": stored.request_id,
        "errorCode": stored.error_code,
    }))
}

async fn emit_agent_message_events(state: &AppState, msg: &MailboxMessage) {
    let store = state.threads().lock().await;
    let from = store.get(&msg.from_thread_id).cloned();
    let to = store.get(&msg.to_thread_id).cloned();
    drop(store);
    let from_provider = from
        .as_ref()
        .map(|t| t.provider.clone())
        .unwrap_or_default();
    let to_provider = to.as_ref().map(|t| t.provider.clone()).unwrap_or_default();
    let from_title = from.as_ref().map(|t| t.title.clone()).unwrap_or_default();
    let to_title = to.as_ref().map(|t| t.title.clone()).unwrap_or_default();

    for (thread_id, direction, peer_id, peer_provider, peer_title) in [
        (
            &msg.from_thread_id,
            "sent",
            &msg.to_thread_id,
            to_provider.as_str(),
            to_title.as_str(),
        ),
        (
            &msg.to_thread_id,
            "received",
            &msg.from_thread_id,
            from_provider.as_str(),
            from_title.as_str(),
        ),
    ] {
        let seq = state.journal().last_sequence(thread_id) + 1;
        let durable = json!({
            "kind": "agent_message",
            "messageId": msg.id,
            "direction": direction,
            "peerThreadId": peer_id,
            "peerProvider": peer_provider,
            "peerTitle": peer_title,
            "messageKind": msg.kind,
            "text": msg.text,
            "status": msg.status,
            "meta": {
                "threadId": thread_id,
                "sequence": seq,
                "eventId": Uuid::new_v4().to_string(),
                "ts": chrono_ts(),
            }
        });
        let _ = state.journal().append(&durable);
        state.publish(json_msg(json!({
            "type": "event",
            "threadId": thread_id,
            "event": durable,
        })));
    }
}

fn chrono_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Drain queued mailbox messages when writer lock allows.
pub async fn drain_mailbox(state: &AppState) {
    loop {
        let next = {
            let mb = state.mailbox().lock().await;
            mb.queued().into_iter().next()
        };
        let Some(msg) = next else {
            break;
        };

        // still linked?
        let linked = {
            let store = state.threads().lock().await;
            let from_ok = store.get(&msg.from_thread_id).is_some();
            let to = store.get(&msg.to_thread_id).cloned();
            let still = match (from_ok, to.as_ref()) {
                (true, Some(t)) => {
                    // relation still valid
                    t.agent_link
                        .as_ref()
                        .map(|l| {
                            l.parent_thread_id == msg.from_thread_id
                                || store
                                    .get(&msg.from_thread_id)
                                    .and_then(|f| f.agent_link.as_ref())
                                    .map(|fl| fl.parent_thread_id == msg.to_thread_id)
                                    .unwrap_or(false)
                        })
                        .unwrap_or_else(|| {
                            store
                                .get(&msg.from_thread_id)
                                .and_then(|f| f.agent_link.as_ref())
                                .map(|l| l.parent_thread_id == msg.to_thread_id)
                                .unwrap_or(false)
                        })
                }
                _ => false,
            };
            still
        };
        if !linked {
            let now = iso_now();
            let mut mb = state.mailbox().lock().await;
            let _ = mb.update_status(&msg.id, "failed", Some(err::RELATION_REQUIRED.into()), &now);
            update_agent_message_status(state, &msg, "failed").await;
            continue;
        }

        let target = {
            let store = state.threads().lock().await;
            store.get(&msg.to_thread_id).cloned()
        };
        let Some(target) = target else {
            let now = iso_now();
            let mut mb = state.mailbox().lock().await;
            let _ = mb.update_status(&msg.id, "failed", Some(err::THREAD_NOT_FOUND.into()), &now);
            continue;
        };
        if target.status == "running" {
            // wait for next drain trigger
            break;
        }
        // check writer lock
        let root = target.project_root.trim_end_matches('/');
        if !root.is_empty() {
            let writers = state.project_writers_snapshot().await;
            if let Some(owner) = writers.get(root) {
                if owner != &target.id {
                    break;
                }
            }
        }

        // budget check on child link
        let child_id = if msg.relation == "parent_to_child" {
            msg.to_thread_id.clone()
        } else {
            msg.from_thread_id.clone()
        };
        {
            let store = state.threads().lock().await;
            if let Some(link) = store.get(&child_id).and_then(|t| t.agent_link.clone()) {
                if link.paused || link.auto_delivery_used >= link.auto_delivery_limit {
                    let now = iso_now();
                    let mut mb = state.mailbox().lock().await;
                    let _ = mb.update_status(
                        &msg.id,
                        "paused",
                        Some(err::BUDGET_EXHAUSTED.into()),
                        &now,
                    );
                    update_agent_message_status(state, &msg, "paused").await;
                    continue;
                }
            }
        }

        let now = iso_now();
        {
            let mut mb = state.mailbox().lock().await;
            let _ = mb.update_status(&msg.id, "delivering", None, &now);
        }
        update_agent_message_status(state, &msg, "delivering").await;

        let source_label = {
            let store = state.threads().lock().await;
            store
                .get(&msg.from_thread_id)
                .map(|t| {
                    format!(
                        "{} — {}",
                        provider_label(&t.provider),
                        t.title
                    )
                })
                .unwrap_or_else(|| "agent".into())
        };
        let relation_label = if msg.relation == "parent_to_child" {
            "parent"
        } else {
            "enfant"
        };
        let prompt = format!(
            "[Message d'un agent Atelier lié]\nSource : {source_label}\nRelation : {relation_label}\nMessage :\n{}\n[Fin du message lié]",
            msg.text
        );

        let model = target
            .extra
            .get("model")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let effort = target
            .extra
            .get("effort")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let permission_mode = target
            .extra
            .get("permissionMode")
            .and_then(|v| v.as_str())
            .map(str::to_string);

        let send_msg = json!({
            "type": "send",
            "threadId": target.id,
            "prompt": prompt,
            "clientMessageId": format!("agent:{}", msg.id),
            "origin": "agent_link",
            "provider": target.provider,
            "model": model,
            "effort": effort,
            "permissionMode": permission_mode,
            "projectRoot": target.project_root,
        });

        // Deliver on the current task (not nested spawn) — handle_send may hold
        // non-Send guards; the outer drain is already scheduled on a Send task
        // boundary via tokio::spawn from send/ws only when needed.
        // Mark delivering; run send; update status. Avoid re-entering drain.
        let now = iso_now();
        {
            let mut mb = state.mailbox().lock().await;
            let _ = mb.update_status(&msg.id, "delivering", None, &now);
        }

        // Use a one-shot channel + dedicated runtime worker to avoid Send issues
        // if handle_send is not Send: fall back to publishing for the router.
        let deliver_ok = deliver_via_send(state, &send_msg).await;

        let now = iso_now();
        if deliver_ok {
            {
                let mut mb = state.mailbox().lock().await;
                let _ = mb.update_status(&msg.id, "delivered", None, &now);
            }
            update_agent_message_status(state, &msg, "delivered").await;
            {
                let mut store = state.threads().lock().await;
                if let Some(t) = store.get(&child_id).cloned() {
                    if let Some(mut link) = t.agent_link {
                        link.auto_delivery_used =
                            link.auto_delivery_used.saturating_add(1);
                        let _ = store.upsert(
                            json!({"id": child_id, "agentLink": link}),
                            true,
                        );
                    }
                }
            }
        } else {
            {
                let mut mb = state.mailbox().lock().await;
                let _ = mb.update_status(
                    &msg.id,
                    "failed",
                    Some("delivery_failed".into()),
                    &now,
                );
            }
            update_agent_message_status(state, &msg, "failed").await;
        }
        // One delivery per drain pass — next messages wait for next drain trigger.
        break;
    }
}

/// Enqueue delivery on the runtime worker (avoids nested handle_send futures).
async fn deliver_via_send(state: &AppState, send_msg: &Value) -> bool {
    state.enqueue_agent_delivery(send_msg.clone());
    true
}

async fn update_agent_message_status(state: &AppState, msg: &MailboxMessage, status: &str) {
    for tid in [&msg.from_thread_id, &msg.to_thread_id] {
        let ev = json!({
            "kind": "agent_message",
            "messageId": msg.id,
            "status": status,
            "direction": if tid == &msg.from_thread_id { "sent" } else { "received" },
            "peerThreadId": if tid == &msg.from_thread_id { &msg.to_thread_id } else { &msg.from_thread_id },
            "messageKind": msg.kind,
            "text": msg.text,
        });
        state.publish(json_msg(json!({
            "type": "event",
            "threadId": tid,
            "event": ev,
        })));
    }
}
