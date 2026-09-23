//! Quick ask du routeur WebSocket : question éclair hors fil, transcript
//! en mémoire et promotion en vrai fil. Extrait de `ws_router.rs`.

use super::*;

pub(super) async fn handle_quick_ask(state: &AppState, msg: &Value) -> Vec<String> {
    let qa_id = msg
        .get("qaId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if qa_id.is_empty() {
        return vec![err("qaId requis")];
    }
    let provider = msg
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("claude")
        .to_string();
    let prompt = msg
        .get("prompt")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let Some(p) = state.provider(&provider) else {
        return vec![json_msg(json!({
            "type": "qaEvent",
            "qaId": qa_id,
            "event": {"kind":"error","message":"provider inconnu"},
        }))];
    };
    // Le Quick Ask tournait dans $HOME : le CLI démarrait sans CLAUDE.md, sans
    // git, sans l'arborescence du projet — il ne pouvait rien vérifier de ce
    // dont la conversation parlait. Il suit maintenant le projet ouvert, et ne
    // retombe sur $HOME que si la fenêtre n'en connaît aucun.
    let project_root = msg
        .get("projectRoot")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()));
    let prev = state.qa_sessions().lock().await.get(&qa_id).cloned();
    push_qa_line(state, &qa_id, "user", &prompt);
    let state_bg = state.clone();
    let qa_id_bg = qa_id.clone();
    let model = msg
        .get("model")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let effort = msg
        .get("effort")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    tokio::spawn(async move {
        let emit_state = state_bg.clone();
        let qid = qa_id_bg.clone();
        let on_event: std::sync::Arc<dyn Fn(Value) + Send + Sync> =
            std::sync::Arc::new(move |event: Value| {
                // Mêmes règles que le réducteur de la fenêtre (QuickAsk.tsx) :
                // seul le texte final compte, les deltas sont éphémères.
                match event.get("kind").and_then(|v| v.as_str()) {
                    Some("text") => push_qa_line(
                        &emit_state,
                        &qid,
                        "assistant",
                        event.get("text").and_then(|v| v.as_str()).unwrap_or(""),
                    ),
                    Some("error") => push_qa_line(
                        &emit_state,
                        &qid,
                        "assistant",
                        &format!(
                            "⚠ {}",
                            event.get("message").and_then(|v| v.as_str()).unwrap_or("")
                        ),
                    ),
                    _ => {}
                }
                if let Ok(s) = serde_json::to_string(&json!({
                    "type": "qaEvent",
                    "qaId": qid,
                    "event": event,
                })) {
                    emit_state.publish(s);
                }
            });
        let req = atelier_providers::SendRequest {
            additional_directories: Vec::new(),
            thread_id: format!("qa:{qa_id_bg}"),
            turn_id: uuid_v4(),
            prompt,
            inputs: None,
            project_root,
            session_id: prev.map(|s| s.session_id),
            model,
            effort,
            fast_mode: false,
            permission_mode: Some("bypassPermissions".into()),
            fork_pending: false,
            mode: atelier_providers::SendMode::Normal,
            on_event,
            on_session_opened: None,
            on_interaction: None,
            is_cancelled: std::sync::Arc::new(|| false),
            consigne: None,
            atelier_mcp: None,
        };
        let result = p.send(req).await;
        if let Some(sid) = result.session_id {
            state_bg.qa_sessions().lock().await.insert(
                qa_id_bg,
                QaSession {
                    provider,
                    session_id: sid,
                },
            );
        }
    });
    vec![]
}

/// Plafond du transcript gardé par conversation éphémère : au-delà, la
/// promotion garde les répliques les plus récentes (la mémoire du provider,
/// elle, reste complète via `sessionId`).
pub(super) const QA_TRANSCRIPT_MAX: usize = 200;

/// Ajoute une réplique au transcript éphémère d'un Quick Ask.
pub(super) fn push_qa_line(state: &AppState, qa_id: &str, role: &str, text: &str) {
    if qa_id.is_empty() || text.trim().is_empty() {
        return;
    }
    let Ok(mut map) = state.qa_transcripts().lock() else {
        return;
    };
    let lines = map.entry(qa_id.to_string()).or_default();
    lines.push(QaLine {
        role: role.to_string(),
        text: text.to_string(),
    });
    if lines.len() > QA_TRANSCRIPT_MAX {
        let excess = lines.len() - QA_TRANSCRIPT_MAX;
        lines.drain(0..excess);
    }
}

/// Recopie la conversation éphémère dans le journal du fil promu. Sans ça le
/// chat naît vide : le provider reprend bien la session, mais l'app n'a
/// jamais rien écrit pour les tours joués dans la fenêtre Quick Ask.
pub(super) fn seed_journal_from_qa(state: &AppState, thread_id: &str, provider: &str, lines: &[QaLine]) {
    let mut turn_id = uuid_v4();
    for line in lines {
        let user = line.role == "user";
        if user {
            turn_id = uuid_v4();
        }
        // Allocateur atomique : la lecture unique + incrément local
        // collisionnait avec les autres écrivains de séquences pour le même
        // fil (inventaire complété suite au ruling contrôleur du
        // 2026-08-28 — le brief initial n'en listait que trois, incomplet).
        let sequence = state.journal().next_sequence(thread_id);
        let mut meta = json!({
            "threadId": thread_id,
            "sequence": sequence,
            "eventId": uuid_v4(),
            "turnId": turn_id,
            "provider": provider,
            "origin": if user { "atelier" } else { "provider" },
            "durable": true,
            "schemaVersion": 1,
            "ts": now_ms(),
        });
        if user {
            if let Some(obj) = meta.as_object_mut() {
                obj.insert("messageId".into(), json!(uuid_v4()));
            }
        }
        let _ = state.journal().append(&json!({
            "kind": if user { "user" } else { "text" },
            "text": line.text,
            "meta": meta,
        }));
    }
}

pub(super) fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub(super) async fn handle_qa_promote(state: &AppState, msg: &Value) -> Vec<String> {
    let qa_id = msg.get("qaId").and_then(|v| v.as_str()).unwrap_or("");
    let new_id = msg
        .get("newThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let session = state.qa_sessions().lock().await.get(qa_id).cloned();
    let Some(s) = session else {
        return vec![json_msg(json!({
            "type": "qaPromoteError",
            "qaId": qa_id,
            "message": "session éphémère expirée — pose une nouvelle question puis promeus",
        }))];
    };
    let title = msg.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let patch = json!({
        "id": new_id,
        "projectRoot": msg.get("projectRoot").cloned().unwrap_or(json!("")),
        "provider": s.provider,
        "title": format!("Quick Ask — {title}"),
        "sessionId": s.session_id,
        "status": "idle",
    });
    {
        let mut store = state.threads().lock().await;
        if let Err(e) = store.upsert(patch, false) {
            return vec![err(e)];
        }
    }
    let lines = state
        .qa_transcripts()
        .lock()
        .ok()
        .and_then(|mut map| map.remove(qa_id))
        .unwrap_or_default();
    seed_journal_from_qa(state, new_id, &s.provider, &lines);
    state.qa_sessions().lock().await.remove(qa_id);
    broadcast_threads(state).await
}
