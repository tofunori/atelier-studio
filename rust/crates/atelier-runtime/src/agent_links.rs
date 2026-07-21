//! createLinkedThread / unlinkThread + lifecycle hooks (plan 057).

use crate::agent_mcp::{is_mcp_compatible_provider, remove_claude_mcp_config};
use crate::state::AppState;
use crate::ws_router::{broadcast_threads, err, err_thread, json_msg};
use atelier_protocol::agent_mcp_errors as mcp_err;
use atelier_protocol::agent_mcp_limits as lim;
use atelier_store::AgentLink;
use serde_json::{json, Value};
use uuid::Uuid;

pub async fn handle_create_linked_thread(state: &AppState, msg: &Value) -> Vec<String> {
    let source_id = msg
        .get("sourceThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let target_id = msg
        .get("targetThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let target_provider = msg
        .get("targetProvider")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let request_id = msg.get("requestId").and_then(Value::as_str).unwrap_or("");
    let reuse_existing = msg
        .get("reuseExisting")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if source_id.is_empty() || target_id.is_empty() || target_provider.is_empty() {
        return vec![err("createLinkedThread: champs requis manquants")];
    }
    if source_id == target_id {
        return vec![err_thread(target_id, "createLinkedThread: cible = source")];
    }
    if !is_mcp_compatible_provider(target_provider) {
        return vec![err_thread(
            target_id,
            &format!(
                "createLinkedThread: provider incompatible ({})",
                mcp_err::PROVIDER_MCP_UNSUPPORTED
            ),
        )];
    }
    if state.provider(target_provider).is_none() {
        return vec![err_thread(
            target_id,
            "createLinkedThread: provider non installé",
        )];
    }

    let limit = msg
        .get("autoDeliveryLimit")
        .and_then(|v| v.as_u64())
        .unwrap_or(lim::DEFAULT_AUTO_DELIVERY as u64)
        .clamp(1, lim::MAX_AUTO_DELIVERY as u64) as u32;

    let model = msg.get("model").cloned();
    let effort = msg.get("effort").cloned();
    let permission_mode = msg.get("permissionMode").cloned();

    {
        let mut store = state.threads().lock().await;
        let Some(source) = store.get(source_id).cloned() else {
            return vec![err_thread(
                source_id,
                "createLinkedThread: source introuvable",
            )];
        };
        if reuse_existing {
            if let Some(existing) = store
                .children_of(source_id)
                .into_iter()
                .find(|thread| thread.provider == target_provider)
            {
                return vec![json_msg(json!({
                    "type": "linkedThreadCreated",
                    "requestId": request_id,
                    "sourceThreadId": source_id,
                    "requestedTargetThreadId": target_id,
                    "targetThreadId": existing.id,
                    "targetProvider": target_provider,
                    "reused": true,
                }))];
            }
        }
        if source.status == "running" {
            return vec![err_thread(
                source_id,
                "createLinkedThread: source en cours d'exécution",
            )];
        }
        if source.project_root.is_empty() || !source.project_root.starts_with('/') {
            return vec![err_thread(
                source_id,
                "createLinkedThread: projet source absent",
            )];
        }
        if store.get(target_id).is_some() {
            return vec![err_thread(
                target_id,
                "createLinkedThread: thread cible déjà existant",
            )];
        }
        if store.children_of(source_id).len() >= lim::MAX_CHILDREN {
            return vec![err_thread(
                source_id,
                "createLinkedThread: limite d'enfants atteinte (8)",
            )];
        }
        // pending interactions?
        {
            let waiters = state.interaction_waiters().lock().await;
            if waiters.values().any(|w| w.thread_id == source_id) {
                return vec![err_thread(
                    source_id,
                    "createLinkedThread: interaction en attente sur la source",
                )];
            }
        }

        let now = atelier_store::iso_now();
        let link = AgentLink {
            parent_thread_id: source_id.to_string(),
            role: "collaborator".into(),
            access: "read_write".into(),
            created_at: now.clone(),
            created_by: "user".into(),
            auto_delivery_limit: limit,
            auto_delivery_used: 0,
            paused: false,
        };
        let title = short_title(&source.title);
        let mut patch = json!({
            "id": target_id,
            "projectRoot": source.project_root,
            "provider": target_provider,
            "title": title,
            "sessionId": null,
            "status": "idle",
            "agentLink": link,
            "createdAt": now,
        });
        if let Some(m) = model {
            patch.as_object_mut().unwrap().insert("model".into(), m);
        }
        if let Some(e) = effort {
            patch.as_object_mut().unwrap().insert("effort".into(), e);
        }
        if let Some(p) = permission_mode {
            patch
                .as_object_mut()
                .unwrap()
                .insert("permissionMode".into(), p);
        }
        // Never copy native session ids
        if let Err(e) = store.upsert(patch, false) {
            return vec![err(e)];
        }
    }

    let mut out = broadcast_threads(state).await;
    out.insert(
        0,
        json_msg(json!({
            "type": "linkedThreadCreated",
            "requestId": request_id,
            "sourceThreadId": source_id,
            "requestedTargetThreadId": target_id,
            "targetThreadId": target_id,
            "targetProvider": target_provider,
            "reused": false,
        })),
    );
    out
}

/// Natural composer flow: reuse a compatible linked thread or create one, then
/// durably enqueue exactly one user-requested turn. The frontend never selects
/// a guessed UUID and receives one explicit acknowledgement for the operation.
pub async fn handle_mention_agent(state: &AppState, msg: &Value) -> Vec<String> {
    let source_id = msg
        .get("sourceThreadId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let target_provider = msg
        .get("targetProvider")
        .and_then(Value::as_str)
        .unwrap_or("");
    let text = msg.get("text").and_then(Value::as_str).unwrap_or("").trim();
    let request_id = msg.get("requestId").and_then(Value::as_str).unwrap_or("");
    if source_id.is_empty()
        || target_provider.is_empty()
        || text.is_empty()
        || request_id.is_empty()
    {
        return vec![mention_error(
            source_id,
            request_id,
            "mentionAgent: champs requis manquants",
        )];
    }

    let existing = {
        let store = state.threads().lock().await;
        store
            .children_of(source_id)
            .into_iter()
            .find(|thread| thread.provider == target_provider)
            .map(|thread| thread.id)
    };
    let reused = existing.is_some();
    let target_id = existing.unwrap_or_else(|| {
        msg.get("targetThreadId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string())
    });

    if reused {
        let current_link = {
            let store = state.threads().lock().await;
            store
                .get(&target_id)
                .and_then(|thread| thread.agent_link.clone())
        };
        let Some(mut link) = current_link else {
            return vec![mention_error(
                source_id,
                request_id,
                "mentionAgent: relation absente",
            )];
        };
        if link.paused {
            return vec![mention_error(source_id, request_id, mcp_err::LINK_PAUSED)];
        }
        let pending = state
            .mailbox()
            .lock()
            .await
            .list_for_link(source_id, &target_id)
            .into_iter()
            .filter(|message| matches!(message.status.as_str(), "queued" | "delivering" | "paused"))
            .count() as u32;
        if pending == 0 {
            link.auto_delivery_used = 0;
            link.auto_delivery_limit = 1;
        } else {
            link.auto_delivery_limit = link
                .auto_delivery_used
                .saturating_add(pending)
                .saturating_add(1)
                .min(lim::MAX_AUTO_DELIVERY);
        }
        let _ = state
            .threads()
            .lock()
            .await
            .upsert(json!({"id": target_id.clone(), "agentLink": link}), true);
    }

    if !reused {
        let mut create = msg.clone();
        if let Some(object) = create.as_object_mut() {
            object.insert("type".into(), json!("createLinkedThread"));
            object.insert("targetThreadId".into(), json!(target_id.clone()));
            object.insert("autoDeliveryLimit".into(), json!(1));
        }
        let created = handle_create_linked_thread(state, &create).await;
        if !created.iter().any(|raw| {
            serde_json::from_str::<Value>(raw)
                .ok()
                .is_some_and(|value| {
                    value.get("type").and_then(Value::as_str) == Some("linkedThreadCreated")
                })
        }) {
            let message = created
                .iter()
                .find_map(|raw| {
                    serde_json::from_str::<Value>(raw)
                        .ok()?
                        .get("message")?
                        .as_str()
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "mentionAgent: création impossible".into());
            return vec![mention_error(source_id, request_id, message)];
        }
    }

    let display_text = msg
        .get("displayText")
        .and_then(Value::as_str)
        .unwrap_or(text);
    let user_event = json!({
        "kind": "user",
        "text": display_text,
        "meta": {
            "threadId": source_id,
            "sequence": state.journal().last_sequence(source_id) + 1,
            "eventId": Uuid::new_v4().to_string(),
            "messageId": request_id,
            "ts": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or(0),
        }
    });
    let _ = state.journal().append(&user_event);
    state.publish(json_msg(
        json!({"type":"event", "threadId":source_id, "event":user_event}),
    ));

    match crate::agent_mailbox::enqueue_user_mention(state, source_id, &target_id, text, request_id)
        .await
    {
        Ok(delivery) => {
            let mut out = vec![json_msg(json!({
                "type": "agentMentionAccepted",
                "sourceThreadId": source_id,
                "targetThreadId": target_id,
                "targetProvider": target_provider,
                "requestId": request_id,
                "reused": reused,
                "delivery": delivery,
            }))];
            out.extend(broadcast_threads(state).await);
            out
        }
        Err(error) => {
            if !reused {
                let _ = state.threads().lock().await.delete(&target_id);
            }
            vec![mention_error(source_id, request_id, error)]
        }
    }
}

fn mention_error(thread_id: &str, request_id: &str, message: impl Into<String>) -> String {
    json_msg(json!({
        "type": "agentMentionFailed",
        "threadId": thread_id,
        "requestId": request_id,
        "message": message.into(),
    }))
}

pub async fn handle_set_link_paused(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    let Some(paused) = msg.get("paused").and_then(Value::as_bool) else {
        return vec![err_thread(
            thread_id,
            "setLinkedThreadPaused: paused manquant",
        )];
    };
    let parent_id = {
        let mut store = state.threads().lock().await;
        let Some(thread) = store.get(thread_id).cloned() else {
            return vec![err_thread(thread_id, "setLinkedThreadPaused: introuvable")];
        };
        let Some(mut link) = thread.agent_link else {
            return vec![err_thread(
                thread_id,
                "setLinkedThreadPaused: relation absente",
            )];
        };
        let parent_id = link.parent_thread_id.clone();
        link.paused = paused;
        if let Err(error) = store.upsert(json!({"id":thread_id, "agentLink":link}), true) {
            return vec![err_thread(thread_id, error)];
        }
        parent_id
    };
    if !paused {
        let now = atelier_store::iso_now();
        let _ = state.mailbox().lock().await.resume_link_paused(
            &parent_id,
            thread_id,
            mcp_err::LINK_PAUSED,
            &now,
        );
        let drain_state = state.clone();
        tokio::spawn(async move {
            crate::agent_mailbox::drain_mailbox(&drain_state).await;
        });
    }
    let mut out = vec![json_msg(json!({
        "type":"linkedThreadPaused",
        "threadId":thread_id,
        "parentThreadId":parent_id,
        "paused":paused,
    }))];
    out.extend(broadcast_threads(state).await);
    out
}

pub async fn handle_unlink_thread(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
    if thread_id.is_empty() {
        return vec![err("unlinkThread: threadId manquant")];
    }
    let (parent_id, child_id) = {
        let mut store = state.threads().lock().await;
        let Some(t) = store.get(thread_id).cloned() else {
            return vec![err_thread(thread_id, "unlinkThread: introuvable")];
        };
        let Some(link) = t.agent_link.clone() else {
            return vec![err_thread(
                thread_id,
                "unlinkThread: aucun lien sur ce thread",
            )];
        };
        let parent_id = link.parent_thread_id.clone();
        // clear agentLink
        let mut patch = serde_json::to_value(&t).unwrap_or(json!({}));
        if let Some(obj) = patch.as_object_mut() {
            obj.insert("id".into(), json!(thread_id));
            obj.insert("agentLink".into(), Value::Null);
        }
        // upsert with null may leave field — remove via extra dance:
        // normalize keeps Option::None if missing; set agentLink null then normalize
        // Our normalize uses from_value which fails on null → None. Good if we set null.
        if let Err(e) = store.upsert(
            json!({
                "id": thread_id,
                "agentLink": null,
            }),
            true,
        ) {
            return vec![err(e)];
        }
        // Force clear if still present (serde null → None)
        if store
            .get(thread_id)
            .and_then(|t| t.agent_link.as_ref())
            .is_some()
        {
            // rewrite without field by full replace
            if let Some(mut t2) = store.get(thread_id).cloned() {
                t2.agent_link = None;
                let _ = store.delete(thread_id);
                let mut v = serde_json::to_value(&t2).unwrap();
                if let Some(o) = v.as_object_mut() {
                    o.remove("agentLink");
                }
                let _ = store.upsert(v, true);
            }
        }
        (parent_id, thread_id.to_string())
    };

    // revoke grants
    {
        let mut caps = state.capabilities().lock().await;
        // The parent grant is relation-checked on every MCP action and may
        // still serve other linked agents. Revoking it would cut siblings too.
        caps.revoke_thread(&child_id);
    }
    remove_claude_mcp_config(state.app_dir(), &child_id);

    // Fail only the detached pair. Other agents linked to the same source keep
    // their queued work and capabilities.
    let now = atelier_store::iso_now();
    {
        let mut mb = state.mailbox().lock().await;
        let _ = mb.fail_pending_for_link(&parent_id, &child_id, mcp_err::RELATION_REQUIRED, &now);
    }

    let mut out = broadcast_threads(state).await;
    out.insert(
        0,
        json_msg(json!({
            "type": "threadUnlinked",
            "threadId": child_id,
            "parentThreadId": parent_id,
        })),
    );
    out
}

/// Refuse move when linked.
pub fn move_blocked_reason(store: &atelier_store::ThreadStore, id: &str) -> Option<String> {
    if store.is_linked(id) {
        Some("ce chat est lié à un autre agent — déliez-le avant de le déplacer".into())
    } else {
        None
    }
}

/// On parent delete: detach children. On child delete: revoke mailbox.
pub async fn on_delete_thread(state: &AppState, id: &str) {
    let children: Vec<String> = {
        let store = state.threads().lock().await;
        store.children_of(id).into_iter().map(|t| t.id).collect()
    };
    let now = atelier_store::iso_now();
    if !children.is_empty() {
        // parent deleted → detach children
        {
            let mut store = state.threads().lock().await;
            for cid in &children {
                let _ = store.upsert(json!({"id": cid, "agentLink": null}), true);
                if let Some(mut t) = store.get(cid).cloned() {
                    if t.agent_link.is_some() {
                        t.agent_link = None;
                        let mut v = serde_json::to_value(&t).unwrap();
                        if let Some(o) = v.as_object_mut() {
                            o.remove("agentLink");
                        }
                        let _ = store.delete(cid);
                        let _ = store.upsert(v, true);
                    }
                }
            }
        }
        let mut caps = state.capabilities().lock().await;
        caps.revoke_thread(id);
        for cid in &children {
            caps.revoke_thread(cid);
            remove_claude_mcp_config(state.app_dir(), cid);
        }
        remove_claude_mcp_config(state.app_dir(), id);
        let mut ids: Vec<&str> = children.iter().map(|s| s.as_str()).collect();
        ids.push(id);
        let mut mb = state.mailbox().lock().await;
        let _ = mb.fail_queued_for_threads(&ids, mcp_err::RELATION_REQUIRED, &now);
    } else {
        // maybe child
        let mut caps = state.capabilities().lock().await;
        caps.revoke_thread(id);
        remove_claude_mcp_config(state.app_dir(), id);
        let mut mb = state.mailbox().lock().await;
        let _ = mb.fail_queued_for_threads(&[id], mcp_err::RELATION_REQUIRED, &now);
    }
}

fn short_title(s: &str) -> String {
    let t: String = s.chars().take(28).collect();
    if s.chars().count() > 28 {
        format!("{t}…")
    } else if t.is_empty() {
        "parent".into()
    } else {
        t
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use tempfile::tempdir;

    fn state() -> AppState {
        let dir = tempdir().unwrap().keep();
        AppState::new(
            AppPaths::from_app_dir(dir),
            None,
            "t".into(),
            "0.1.0".into(),
            "hash".into(),
            "/tmp".into(),
        )
    }

    #[tokio::test]
    async fn create_and_unlink_link() {
        let s = state();
        {
            let mut store = s.threads().lock().await;
            store
                .upsert(
                    json!({
                        "id": "parent",
                        "projectRoot": "/tmp/proj",
                        "provider": "claude",
                        "title": "Parent",
                        "status": "idle",
                    }),
                    false,
                )
                .unwrap();
        }
        let out = handle_create_linked_thread(
            &s,
            &json!({
                "sourceThreadId": "parent",
                "targetThreadId": "child",
                "targetProvider": "codex",
                "autoDeliveryLimit": 4,
            }),
        )
        .await;
        assert!(
            out.iter()
                .any(|m| m.contains("linkedThreadCreated") || m.contains("threads")),
            "{out:?}"
        );
        {
            let store = s.threads().lock().await;
            let child = store.get("child").unwrap();
            assert_eq!(
                child.agent_link.as_ref().unwrap().parent_thread_id,
                "parent"
            );
            assert_eq!(store.children_of("parent").len(), 1);
            assert!(move_blocked_reason(&store, "child").is_some());
        }
        let reused = handle_create_linked_thread(
            &s,
            &json!({
                "sourceThreadId": "parent",
                "targetThreadId": "child-duplicate",
                "targetProvider": "codex",
                "requestId": "continue-request",
                "reuseExisting": true,
            }),
        )
        .await;
        let ack = reused
            .iter()
            .filter_map(|raw| serde_json::from_str::<Value>(raw).ok())
            .find(|value| value["type"] == "linkedThreadCreated")
            .expect("linkedThreadCreated ack");
        assert_eq!(ack["targetThreadId"], "child");
        assert_eq!(ack["requestedTargetThreadId"], "child-duplicate");
        assert_eq!(ack["requestId"], "continue-request");
        assert_eq!(ack["reused"], true);
        assert!(s.threads().lock().await.get("child-duplicate").is_none());
        let restarted = AppState::new(
            AppPaths::from_app_dir(s.app_dir().to_path_buf()),
            None,
            "restart".into(),
            "0.1.0".into(),
            "hash".into(),
            "/tmp".into(),
        );
        assert_eq!(
            restarted
                .threads()
                .lock()
                .await
                .get("child")
                .and_then(|thread| thread.agent_link.as_ref())
                .map(|link| link.parent_thread_id.as_str()),
            Some("parent")
        );
        let (parent_bearer, child_bearer) = {
            let mut capabilities = s.capabilities().lock().await;
            (
                capabilities.issue("parent", "/tmp/proj", "claude", None),
                capabilities.issue("child", "/tmp/proj", "codex", None),
            )
        };
        let _ = handle_unlink_thread(&s, &json!({"threadId": "child"})).await;
        {
            let store = s.threads().lock().await;
            assert!(store.get("child").unwrap().agent_link.is_none());
            assert!(store.children_of("parent").is_empty());
        }
        let capabilities = s.capabilities().lock().await;
        assert!(capabilities.resolve(&parent_bearer).is_ok());
        assert!(capabilities.resolve(&child_bearer).is_err());
    }

    #[tokio::test]
    async fn websocket_mention_creates_then_reuses_one_link() {
        let s = state();
        s.threads()
            .lock()
            .await
            .upsert(
                json!({
                    "id": "parent",
                    "projectRoot": "/tmp/proj",
                    "provider": "claude",
                    "title": "Parent",
                    "status": "idle",
                }),
                false,
            )
            .unwrap();

        let first = crate::ws_router::route_ws(
            &s,
            &json!({
                "type": "mentionAgent",
                "sourceThreadId": "parent",
                "targetThreadId": "child-a",
                "targetProvider": "codex",
                "text": "Vérifie le contexte",
                "displayText": "@Codex Vérifie le contexte",
                "requestId": "request-a",
            })
            .to_string(),
        )
        .await;
        assert!(
            first.iter().any(|raw| raw.contains("agentMentionAccepted")),
            "{first:?}"
        );
        {
            let mut store = s.threads().lock().await;
            let mut link = store
                .get("child-a")
                .and_then(|thread| thread.agent_link.clone())
                .unwrap();
            link.auto_delivery_used = 1;
            link.auto_delivery_limit = 1;
            store
                .upsert(json!({"id":"child-a", "agentLink":link}), true)
                .unwrap();
        }

        let second = crate::ws_router::route_ws(
            &s,
            &json!({
                "type": "mentionAgent",
                "sourceThreadId": "parent",
                "targetThreadId": "child-should-not-exist",
                "targetProvider": "codex",
                "text": "Encore",
                "requestId": "request-b",
            })
            .to_string(),
        )
        .await;
        let ack = second
            .iter()
            .filter_map(|raw| serde_json::from_str::<Value>(raw).ok())
            .find(|value| value.get("type").and_then(Value::as_str) == Some("agentMentionAccepted"))
            .expect("mention ack");
        assert_eq!(ack["targetThreadId"], "child-a");
        assert_eq!(ack["reused"], true);
        assert_eq!(ack["delivery"]["status"], "queued");
        assert_eq!(s.threads().lock().await.children_of("parent").len(), 1);
        let paused = crate::ws_router::route_ws(
            &s,
            r#"{"type":"setLinkedThreadPaused","threadId":"child-a","paused":true}"#,
        )
        .await;
        assert!(paused.iter().any(|raw| raw.contains("linkedThreadPaused")));
        assert!(s
            .threads()
            .lock()
            .await
            .get("child-a")
            .and_then(|thread| thread.agent_link.as_ref())
            .is_some_and(|link| link.paused));
    }
}
