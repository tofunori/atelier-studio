//! createLinkedThread / unlinkThread + lifecycle hooks (plan 057).

use crate::agent_mcp::{is_mcp_compatible_provider, remove_claude_mcp_config};
use crate::state::AppState;
use crate::ws_router::{broadcast_threads, err, err_thread, json_msg};
use atelier_protocol::agent_mcp_errors as mcp_err;
use atelier_protocol::agent_mcp_limits as lim;
use atelier_store::AgentLink;
use serde_json::{json, Value};

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
            return vec![err_thread(source_id, "createLinkedThread: source introuvable")];
        };
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
        let source_label = crate::agent_mcp::provider_label(&source.provider);
        let title = format!(
            "Lié · {} ← {}",
            crate::agent_mcp::provider_label(target_provider),
            short_title(&source.title)
        );
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
            patch
                .as_object_mut()
                .unwrap()
                .insert("model".into(), m);
        }
        if let Some(e) = effort {
            patch
                .as_object_mut()
                .unwrap()
                .insert("effort".into(), e);
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
        let _ = source_label;
    }

    let mut out = broadcast_threads(state).await;
    out.insert(
        0,
        json_msg(json!({
            "type": "linkedThreadCreated",
            "sourceThreadId": source_id,
            "targetThreadId": target_id,
            "targetProvider": target_provider,
        })),
    );
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
        caps.revoke_pair(&parent_id, &child_id);
    }
    remove_claude_mcp_config(state.app_dir(), &child_id);
    remove_claude_mcp_config(state.app_dir(), &parent_id);

    // fail queued mailbox
    let now = atelier_store::iso_now();
    {
        let mut mb = state.mailbox().lock().await;
        let _ = mb.fail_queued_for_threads(
            &[&parent_id, child_id.as_str()],
            mcp_err::RELATION_REQUIRED,
            &now,
        );
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
        Some(
            "ce chat est lié à un autre agent — déliez-le avant de le déplacer".into(),
        )
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
        let parent = {
            let store = state.threads().lock().await;
            store
                .get(id)
                .and_then(|t| t.agent_link.as_ref().map(|l| l.parent_thread_id.clone()))
        };
        let mut caps = state.capabilities().lock().await;
        caps.revoke_thread(id);
        if let Some(ref p) = parent {
            caps.revoke_thread(p);
        }
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
            out.iter().any(|m| m.contains("linkedThreadCreated") || m.contains("threads")),
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
        let _ = handle_unlink_thread(&s, &json!({"threadId": "child"})).await;
        {
            let store = s.threads().lock().await;
            assert!(store.get("child").unwrap().agent_link.is_none());
            assert!(store.children_of("parent").is_empty());
        }
    }
}
