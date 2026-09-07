//! Message revisions use independent sessions. The source conversation stays intact.
use crate::state::AppState;
use serde_json::{json, Value};

pub async fn prepare(state: &AppState, msg: &Value) -> Vec<String> {
    let result = prepare_inner(state, msg).await;
    let reply = match result {
        Ok(value) => value,
        Err(error) => json!({"error":error}),
    };
    vec![
        json!({"type":"messageEditPrepared", "requestId":msg["requestId"],
        "result":reply})
        .to_string(),
    ]
}

async fn prepare_inner(state: &AppState, msg: &Value) -> Result<Value, String> {
    let field = |name: &str| msg.get(name).and_then(Value::as_str).unwrap_or("");
    let (from, to, event_id) = (field("threadId"), field("newThreadId"), field("eventId"));
    if from.is_empty()
        || from == to
        || uuid::Uuid::parse_str(to).is_err()
        || event_id.is_empty()
        || field("fingerprint").is_empty()
    {
        return Err("Référence de message invalide".into());
    }
    if state.harness().is_running(from).await {
        return Err("Attendez la fin de la réponse avant de modifier ce message".into());
    }
    let mut store = state.threads().lock().await;
    if let Some(existing) = store.get(to) {
        if existing
            .extra
            .get("messageEditFingerprint")
            .and_then(Value::as_str)
            != Some(field("fingerprint"))
        {
            return Err("Cette demande de modification a déjà un autre contenu".into());
        }
        let sent = state
            .journal()
            .materialize(to)
            .iter()
            .any(|e| e["kind"] == "user" && e["meta"]["messageId"] == msg["messageId"]);
        return Ok(json!({"thread":existing, "sent":sent}));
    }
    let source = store.get(from).cloned().ok_or("Conversation introuvable")?;
    if source.status == "running" {
        return Err("Une réponse est encore en cours".into());
    }
    let events = state.journal().materialize(from);
    let index = events
        .iter()
        .position(|e| e["meta"]["eventId"].as_str() == Some(event_id))
        .ok_or("Ce message n’est plus disponible. Rechargez la conversation.")?;
    let target = &events[index];
    if target["kind"] != "user" || target["text"] != msg["originalText"] {
        return Err("Le message a changé. Rechargez la conversation avant de le modifier.".into());
    }
    let context = context_before(&events[..index])?;
    let prior = source.extra.get("messageRevision");
    // Earlier revisions are inherited when a later message is edited. Resolve
    // the target's lineage, rather than assuming it is the most recent edit.
    let mut lineage = source
        .extra
        .get("messageRevisionLineage")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if let Some(prior) = prior {
        if !lineage.iter().any(|r| r["messageId"] == prior["messageId"]) {
            lineage.push(prior.clone());
        }
    }
    let origin = lineage.iter().find(|r| {
        !target["meta"]["messageId"].is_null() && r["messageId"] == target["meta"]["messageId"]
    });
    let revision = json!({
        "rootThreadId":prior.and_then(|r| r["rootThreadId"].as_str()).unwrap_or(from),
        "parentThreadId":from,
        "sourceEventId":event_id,
        "groupId":if let Some(origin) = origin { origin["groupId"].clone() } else { json!(to) },
        "baseThreadId":if let Some(origin) = origin { origin["baseThreadId"].clone() } else { json!(from) },
        "baseEventId":if let Some(origin) = origin { origin["baseEventId"].clone() } else { json!(event_id) },
        "messageId":msg["messageId"],
    });
    // Copy through the target then exclude it. No native session is reused: a
    // provider that cannot rewind must never receive the superseded suffix.
    let journal = state.journal().clone();
    let (src, dst, eid) = (from.to_owned(), to.to_owned(), event_id.to_owned());
    let copied = tokio::task::spawn_blocking(move || {
        if journal.copy_thread(&src, &dst, Some(&eid)) && journal.truncate_from(&dst, &eid) {
            true
        } else {
            journal.delete_thread(&dst);
            false
        }
    })
    .await
    .map_err(|_| "Copie du contexte interrompue")?;
    if !copied {
        return Err(
            "Impossible de préparer cette version. Le message original est conservé.".into(),
        );
    }
    let mut patch = json!({"id":to, "title":source.title, "provider":source.provider,
        "projectRoot":source.project_root, "sessionId":null, "status":"idle",
        "forkPending":false, "forkContext":context, "messageRevision":revision,
        "messageRevisionLineage":lineage, "messageEditFingerprint":field("fingerprint")});
    for key in [
        "model",
        "effort",
        "consigne",
        "consigneId",
        "consigneIds",
        "lastTurn",
    ] {
        if let Some(value) = source.extra.get(key) {
            patch[key] = value.clone();
        }
    }
    match store.upsert(patch, false) {
        Ok(thread) => Ok(json!({"thread":thread,"sent":false})),
        Err(error) => {
            state.journal().delete_thread(to);
            Err(error)
        }
    }
}

fn context_before(events: &[Value]) -> Result<Option<String>, String> {
    let mut lines = Vec::new();
    for event in events {
        let role = match event["kind"].as_str() {
            Some("user") => "Utilisateur",
            Some("text") => "Assistant",
            _ => continue,
        };
        if let Some(text) = event["text"].as_str().filter(|s| !s.is_empty()) {
            lines.push(format!("{role} : {text}"));
        }
    }
    let transcript = lines.join("\n\n");
    if transcript.len() > 400_000 {
        return Err("Le contexte est trop long pour préparer cette modification.".into());
    }
    Ok(if transcript.is_empty() {
        None
    } else {
        Some(format!(
        "Voici les messages précédant une question modifiée. Utilise-les comme historique de conversation, sans les répéter.\n\n---\n{transcript}\n--- fin de l’historique ; nouveau message utilisateur ci-dessous ---\n\n"
    ))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    #[tokio::test]
    async fn nested_edit_recovers_the_earlier_message_family() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_owned()),
            None,
            "token".into(),
            "1".into(),
            "host".into(),
            "/tmp".into(),
        );
        state
            .threads()
            .lock()
            .await
            .upsert(json!({"id":"source","provider":"codex"}), false)
            .unwrap();
        let append = |thread: &str, event: &str, message: &str, text: &str| {
            assert!(state.journal().append(&json!({"kind":"user","text":text,
                "meta":{"threadId":thread,"eventId":event,"messageId":message,"sequence":state.journal().last_sequence(thread)+1}})));
        };
        append("source", "a", "ma", "A");
        let a2 = uuid::Uuid::new_v4().to_string();
        let first = prepare_inner(
            &state,
            &json!({"threadId":"source","newThreadId":a2,
            "eventId":"a","originalText":"A","messageId":"ma2","fingerprint":"a2"}),
        )
        .await
        .unwrap();
        append(&a2, "a2", "ma2", "A2");
        append(&a2, "b", "mb", "B");
        let b2 = uuid::Uuid::new_v4().to_string();
        prepare_inner(
            &state,
            &json!({"threadId":a2,"newThreadId":b2,
            "eventId":"b","originalText":"B","messageId":"mb2","fingerprint":"b2"}),
        )
        .await
        .unwrap();
        let a3 = uuid::Uuid::new_v4().to_string();
        let nested = prepare_inner(
            &state,
            &json!({"threadId":b2,"newThreadId":a3,
            "eventId":"a2","originalText":"A2","messageId":"ma3","fingerprint":"a3"}),
        )
        .await
        .unwrap();
        assert_eq!(
            nested["thread"]["messageRevision"]["groupId"],
            first["thread"]["messageRevision"]["groupId"]
        );
        assert_eq!(
            nested["thread"]["messageRevision"]["baseThreadId"],
            "source"
        );
        assert_eq!(nested["thread"]["messageRevision"]["baseEventId"], "a");
    }
    #[tokio::test]
    async fn revision_preserves_source_and_excludes_replaced_suffix_for_every_provider() {
        for provider in ["claude", "codex", "grok"] {
            let dir = tempfile::tempdir().unwrap();
            let state = AppState::new(
                AppPaths::from_app_dir(dir.path().to_owned()),
                None,
                "token".into(),
                "1".into(),
                "host".into(),
                "/tmp".into(),
            );
            state
                .threads()
                .lock()
                .await
                .upsert(
                    json!({"id":"source","provider":provider,
                "sessionId":"original-session","title":"Conversation"}),
                    false,
                )
                .unwrap();
            for (sequence, kind, text) in [
                (1, "user", "Contexte initial"),
                (2, "text", "Réponse initiale"),
                (3, "user", "Ancienne question"),
                (4, "text", "Réponse à oublier"),
            ] {
                assert!(state.journal().append(&json!({"kind":kind,"text":text,"meta":{
                    "threadId":"source","eventId":format!("e{sequence}"),"sequence":sequence,"messageId":format!("m{sequence}")}})));
            }
            let id = uuid::Uuid::new_v4().to_string();
            let request = json!({"threadId":"source","newThreadId":id,"eventId":"e3",
                "originalText":"Ancienne question","fingerprint":"request-one","messageId":"replacement"});
            let result = prepare_inner(&state, &request).await.unwrap();
            assert_eq!(result["sent"], false);
            assert_eq!(state.journal().materialize("source").len(), 4);
            assert_eq!(state.journal().materialize(&id).len(), 2);
            let thread = result["thread"].clone();
            assert!(thread["sessionId"].is_null());
            assert_eq!(thread["forkPending"], false);
            assert!(thread["forkContext"]
                .as_str()
                .unwrap()
                .contains("Réponse initiale"));
            assert!(!thread["forkContext"]
                .as_str()
                .unwrap()
                .contains("Ancienne question"));
            assert!(!thread["forkContext"]
                .as_str()
                .unwrap()
                .contains("Réponse à oublier"));
            assert!(prepare_inner(&state, &request).await.is_ok());
            let mut conflict = request.clone();
            conflict["fingerprint"] = json!("other");
            assert!(prepare_inner(&state, &conflict).await.is_err());
            let mut invalid = request;
            invalid["newThreadId"] = json!(uuid::Uuid::new_v4().to_string());
            invalid["originalText"] = json!("changed");
            assert!(prepare_inner(&state, &invalid).await.is_err());
        }
    }
}
