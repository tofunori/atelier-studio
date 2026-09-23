//! Opérations sur les fils du routeur WebSocket : plan (sauver/exporter),
//! export, fork, revert et retitrage en lot. Extrait de `ws_router.rs`.

use super::*;

pub(super) async fn handle_save_plan(state: &AppState, msg: &Value, export: bool) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    let markdown = msg.get("markdown").and_then(Value::as_str).unwrap_or("");
    if markdown.trim().is_empty() || markdown.len() > 1_000_000 {
        return vec![err_thread(thread_id, "plan: contenu invalide")];
    }
    let path = if export {
        let raw = msg.get("path").and_then(Value::as_str).unwrap_or("");
        let path = std::path::PathBuf::from(raw);
        if !path.is_absolute()
            || path
                .extension()
                .and_then(|value| value.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref()
                != Some("md")
        {
            return vec![err_thread(thread_id, "plan: destination invalide")];
        }
        path
    } else {
        let thread = state.threads().lock().await.get(thread_id).cloned();
        let Some(thread) = thread.filter(|thread| !thread.project_root.is_empty()) else {
            return vec![err_thread(thread_id, "plan: projet introuvable")];
        };
        let raw = msg
            .get("fileName")
            .and_then(Value::as_str)
            .unwrap_or("plan");
        let raw = raw.strip_suffix(".md").unwrap_or(raw);
        let stem = raw
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                    character
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .trim_matches('-')
            .chars()
            .take(80)
            .collect::<String>();
        std::path::PathBuf::from(thread.project_root)
            .join(".plan")
            .join(format!(
                "{}.md",
                if stem.is_empty() { "plan" } else { &stem }
            ))
    };
    if let Some(parent) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return vec![err_thread(thread_id, format!("plan: {error}"))];
        }
    }
    if let Err(error) = std::fs::write(&path, markdown) {
        return vec![err_thread(thread_id, format!("plan: {error}"))];
    }
    vec![json_msg(json!({
        "type":"planSaved",
        "threadId":thread_id,
        "planId":msg.get("planId"),
        "path":path.to_string_lossy(),
        "scope":if export { "export" } else { "project" },
    }))]
}

pub(super) async fn handle_export_thread(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
    let t = match state.threads().lock().await.get(thread_id).cloned() {
        Some(t) => t,
        None => return vec![err("thread introuvable")],
    };
    let mut events = msg
        .get("events")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if events.is_empty() && state.journal().has_journal(thread_id) {
        events = state.journal().materialize(thread_id);
    }
    let title = if t.title.is_empty() {
        "conversation".into()
    } else {
        t.title.clone()
    };
    let mut md = format!(
        "# {title}\n\n- Provider : {}\n- Projet : {}\n- Session : {}\n- Exporté : {}\n\n",
        t.provider,
        if t.project_root.is_empty() {
            "(aucun)"
        } else {
            &t.project_root
        },
        t.session_id.as_deref().unwrap_or("-"),
        iso_now(),
    );
    for e in &events {
        let kind = e.get("kind").and_then(|v| v.as_str()).unwrap_or("");
        let text = e.get("text").and_then(|v| v.as_str()).unwrap_or("");
        match kind {
            "user" => md.push_str(&format!("**Utilisateur :**\n\n{text}\n\n")),
            "text" => md.push_str(&format!("**Agent :**\n\n{text}\n\n")),
            _ => {}
        }
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let dir = std::path::PathBuf::from(home).join("Downloads");
    let _ = std::fs::create_dir_all(&dir);
    let safe: String = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .take(60)
        .collect();
    let safe = safe.trim().to_string();
    let safe = if safe.is_empty() {
        "conversation".into()
    } else {
        safe
    };
    let stamp = iso_now()
        .chars()
        .take(16)
        .collect::<String>()
        .replace([':', 'T'], "-");
    let base = dir.join(format!("atelier-{safe}-{stamp}"));
    let md_path = base.with_extension("md");
    let json_path = base.with_extension("json");
    if std::fs::write(&md_path, &md).is_err() {
        return vec![err("export: écriture markdown impossible")];
    }
    let payload = json!({"thread": t, "events": events});
    let _ = std::fs::write(
        &json_path,
        serde_json::to_string_pretty(&payload).unwrap_or_default(),
    );
    vec![json_msg(json!({
        "type": "exported",
        "threadId": thread_id,
        "path": md_path.to_string_lossy(),
    }))]
}

pub(super) async fn handle_fork_thread(state: &AppState, msg: &Value) -> Vec<String> {
    let from = msg
        .get("fromThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let new_id = msg
        .get("newThreadId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if from.is_empty() || new_id.is_empty() {
        return vec![err("fork: fromThreadId et newThreadId requis")];
    }
    let src = state.threads().lock().await.get(from).cloned();
    let Some(src) = src else {
        return vec![err("fork indisponible pour ce chat")];
    };
    let lines = msg
        .get("contextEvents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|event| {
            let text = event.get("text")?.as_str()?.trim();
            if text.is_empty() {
                return None;
            }
            match event.get("kind").and_then(Value::as_str) {
                Some("user") => Some(format!("Utilisateur : {text}")),
                Some("text") => Some(format!("Agent ({}) : {text}", src.provider)),
                _ => None,
            }
        })
        .collect::<Vec<_>>();
    let mut transcript = lines.join("\n\n");
    const MAX_CONTEXT_CHARS: usize = 400_000;
    if transcript.chars().count() > MAX_CONTEXT_CHARS {
        transcript = format!(
            "[…début tronqué…]\n{}",
            transcript
                .chars()
                .rev()
                .take(MAX_CONTEXT_CHARS)
                .collect::<String>()
                .chars()
                .rev()
                .collect::<String>()
        );
    }
    let fork_context = if transcript.is_empty() {
        Value::Null
    } else {
        Value::String(format!(
            "Tu reprends une conversation commencée avec un autre agent. Voici le fil jusqu'ici — prends-le comme contexte acquis, ne le résume pas, ne le répète pas :\n\n---\n{transcript}\n=== fin du fil transmis — message réel ci-dessous ===\n\n"
        ))
    };
    // La bifurcation est une donnée du fil, pas un caractère dans son nom :
    // préfixer le titre l'accumulait à chaque fork de fork (« ⑂ ⑂ ⑂ … ») et
    // rognait la largeur utile de la barre latérale. La branche reprend donc
    // le titre de la source tel quel, et porte sa profondeur dans `fork`.
    let title = if src.title.is_empty() {
        "fork".to_string()
    } else {
        src.title.clone()
    };
    let fork_depth = src
        .extra
        .get("fork")
        .and_then(|fork| fork.get("depth"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
        + 1;
    // Fork NATIF quand le provider sait dupliquer sa session : la branche
    // hérite de l'historique réel (outils, plan) au lieu d'un transcript
    // recollé, et le fil source n'est pas touché. Le repli contextuel reste
    // pour les providers qui ne savent pas faire.
    // Claude Code n'a pas d'appel de fork : il le fait par `--fork-session`
    // au moment de la reprise. On marque donc la branche au lieu d'appeler.
    let fork_by_resume = src.provider == "claude";
    let native_session = match (&src.session_id, state.provider(&src.provider)) {
        (Some(session), Some(provider)) if !session.is_empty() => {
            let prompt_index = msg.get("eventId").and_then(Value::as_str).map(|eid| {
                state
                    .journal()
                    .materialize(from)
                    .iter()
                    .take_while(|event| {
                        event.pointer("/meta/eventId").and_then(Value::as_str) != Some(eid)
                    })
                    .filter(|event| event.get("kind").and_then(Value::as_str) == Some("user"))
                    .count()
            });
            match provider
                .fork_session(from, session, &src.project_root, prompt_index)
                .await
            {
                Ok(new_session) => Some(new_session),
                Err(error) => {
                    tracing::info!(
                        provider = %src.provider,
                        error = %error,
                        "fork natif indisponible : repli sur le fork contextuel"
                    );
                    None
                }
            }
        }
        _ => None,
    };
    let patch = json!({
        "id": new_id,
        "projectRoot": src.project_root,
        "provider": src.provider,
        "title": title,
        // Sans fork natif, la branche reprend quand même la session source :
        // le premier envoi ajoutera `--fork-session` (Claude) pour la
        // dupliquer au lieu de l'écraser. Le transcript recollé ne sert donc
        // plus que pour les providers qui ne savent faire ni l'un ni l'autre.
        "sessionId": native_session.clone().or_else(|| {
            src.session_id
                .clone()
                .filter(|session| !session.is_empty() && fork_by_resume)
        }),
        "forkPending": native_session.is_none() && fork_by_resume,
        // Marqueur de branche pour l'UI : parent + profondeur, jamais le titre.
        "fork": {
            "parentThreadId": from,
            "depth": fork_depth,
            "forkedAt": iso_now(),
        },
        // Un fork natif porte déjà l'historique : lui ajouter le transcript
        // le ferait relire deux fois.
        "forkContext": if native_session.is_some() || fork_by_resume {
            Value::Null
        } else {
            fork_context
        },
        "status": "idle",
    });
    {
        let mut store = state.threads().lock().await;
        if let Err(e) = store.upsert(patch, false) {
            return vec![err(e)];
        }
    }
    let event_id = msg.get("eventId").and_then(|v| v.as_str());
    if state.journal().has_journal(from)
        && !state.journal().copy_thread(from, new_id, event_id)
    {
        let rollback = state.threads().lock().await.delete(new_id);
        let detail = match rollback {
            Ok(_) => "la branche Atelier a été annulée",
            Err(_) => "la branche Atelier n'a pas pu être annulée proprement",
        };
        return vec![err(format!(
            "fork: copie durable de l'historique impossible; {detail}"
        ))];
    }
    broadcast_threads(state).await
}

pub(super) async fn handle_revert(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
    if thread_id.is_empty() {
        return vec![err_thread("", "revert indisponible")];
    }
    let thread = state.threads().lock().await.get(thread_id).cloned();
    let Some(thread) = thread else {
        return vec![err_thread(thread_id, "revert indisponible")];
    };
    let scope = if msg.get("scope").and_then(Value::as_str) == Some("files") {
        "files"
    } else {
        "thread"
    };
    // Let the old run finish its event pump and persist its session before
    // touching either history. Otherwise resend is treated as a steer.
    if scope == "thread" && thread.provider == "codex"
        && state.harness().is_running(thread_id).await
    {
        crate::send::handle_interrupt(state, msg).await;
        let stopped = tokio::time::timeout(std::time::Duration::from_secs(30), async {
            while state.harness().is_running(thread_id).await {
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            }
        }).await;
        if stopped.is_err() {
            return vec![err_thread(thread_id, "Codex ne s'est pas arrêté : historique conservé")];
        }
    }
    if let Some(sha) = msg.get("snapshotSha").and_then(Value::as_str) {
        let turn_id = msg.get("turnId").and_then(Value::as_str);
        let events = state.journal().materialize(thread_id);
        let checkpoint_event = events.iter().find(|event| {
            event.get("kind").and_then(Value::as_str) == Some("done")
                && event
                    .pointer("/checkpoint/snapshotSha")
                    .and_then(Value::as_str)
                    == Some(sha)
                && turn_id.is_none_or(|turn| {
                    event.pointer("/meta/turnId").and_then(Value::as_str) == Some(turn)
                })
        });
        let Some(checkpoint_event) = checkpoint_event else {
            return vec![err_thread(thread_id, "checkpoint introuvable")];
        };
        if thread.project_root.is_empty() {
            return vec![err_thread(thread_id, "checkpoint introuvable")];
        }
        // périmètre du checkpoint : ne restaurer QUE les fichiers du tour —
        // les fichiers créés ailleurs par d'autres sessions ne bloquent plus
        let scope_paths: Option<Vec<String>> = checkpoint_event
            .pointer("/checkpoint/filesChanged")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            });
        let root = thread.project_root.clone();
        let sha_owned = sha.to_string();
        match crate::ws_dispatch::blocking(move || {
            git_restore(&root, &sha_owned, scope_paths.as_deref())
        })
        .await
        {
            Ok(Ok(())) => {}
            Ok(Err(error)) => return vec![err_thread(thread_id, error.to_string())],
            Err(error) => return vec![err_thread(thread_id, error.to_string())],
        }
        let git_changed = json_msg(json!({
            "type":"gitChanged","threadId":thread_id,"projectRoot":thread.project_root,
        }));
        state.publish(git_changed);
        if scope == "files" {
            return vec![json_msg(json!({
                "type":"reverted","threadId":thread_id,"scope":"files","snapshotSha":sha,
            }))];
        }
    } else if scope == "files" {
        return vec![err_thread(thread_id, "checkpoint introuvable")];
    }
    let mut truncated = false;
    if state.journal().has_journal(thread_id) {
        let mut event_id = msg
            .get("eventId")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        if event_id.is_none() {
            if let Some(text) = msg.get("text").and_then(|v| v.as_str()) {
                let events = state.journal().materialize(thread_id);
                event_id = events.iter().find_map(|e| {
                    if e.get("kind").and_then(|v| v.as_str()) == Some("user")
                        && e.get("text").and_then(|v| v.as_str()).map(str::trim)
                            == Some(text.trim())
                    {
                        e.pointer("/meta/eventId")
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                    } else {
                        None
                    }
                });
            }
        }
        if let Some(eid) = event_id {
            // Index du prompt CHEZ LE PROVIDER : le rang du message utilisateur
            // annulé parmi les messages utilisateur du fil. Calculé AVANT la
            // troncature, sinon l'événement a déjà disparu.
            let prompt_index = state
                .journal()
                .materialize(thread_id)
                .iter()
                .take_while(|event| {
                    event.pointer("/meta/eventId").and_then(Value::as_str) != Some(eid.as_str())
                })
                .filter(|event| event.get("kind").and_then(Value::as_str) == Some("user"))
                .count();
            if thread.provider == "codex" {
                let events = state.journal().materialize(thread_id);
                let Some(target) = events.iter().position(|event|
                    event.pointer("/meta/eventId").and_then(Value::as_str) == Some(&eid)
                        && event["kind"] == "user") else {
                    return vec![err_thread(thread_id, "Message introuvable : historique conservé")];
                };
                let turn_id = events[target].pointer("/meta/turnId").and_then(Value::as_str);
                // Codex rolls back whole turns. Editing a steer halfway
                // through a turn must not silently erase its initial prompt.
                if turn_id.is_some() && events[..target].iter().any(|event|
                    event["kind"] == "user"
                        && event.pointer("/meta/turnId").and_then(Value::as_str) == turn_id)
                {
                    return vec![err_thread(thread_id,
                        "Ce message a été ajouté pendant une réponse. Modifiez le premier message de ce tour.")];
                }
                let native_id = turn_id.and_then(|turn| events.iter().find_map(|event| {
                    (event.pointer("/meta/turnId").and_then(Value::as_str) == Some(turn))
                        .then(|| event.pointer("/meta/nativeTurnId").and_then(Value::as_str))
                        .flatten()
                }));
                let session_id = state.threads().lock().await.get(thread_id)
                    .and_then(|thread| thread.session_id.clone());
                let Some(provider) = state.provider("codex") else {
                    return vec![err_thread(thread_id, "Provider Codex indisponible")];
                };
                let prepared = match provider.rewind_session(
                    thread_id, session_id.as_deref(), prompt_index, native_id,
                ).await {
                    Ok(prepared) => prepared,
                    Err(error) => return vec![err_thread(thread_id, error)],
                };
                let Some(new_session) = prepared["sessionId"].as_str() else {
                    return vec![err_thread(thread_id, "Session corrigée absente")];
                };
                let mut store = state.threads().lock().await;
                let original = store.get(thread_id).cloned();
                let restore = original.as_ref().map(|original| json!({"id":thread_id,
                    "sessionId":original.session_id,
                    "blocksSeededFor":original.extra.get("blocksSeededFor"),
                    "forkPending":original.extra.get("forkPending")}));
                let patch = json!({"id":thread_id,"sessionId":new_session,
                    "blocksSeededFor": if prepared["preservesContext"] == true { json!(new_session) } else { Value::Null },
                    "forkPending":false});
                if let Err(error) = store.upsert(patch, false) {
                    // upsert updates memory before persistence; restore it even
                    // when the underlying disk remains unavailable.
                    if let Some(restore) = restore { let _ = store.upsert(restore, false); }
                    return vec![err_thread(thread_id, error.to_string())];
                }
                truncated = state.journal().truncate_from(thread_id, &eid);
                if !truncated {
                    if let Some(restore) = restore {
                        if let Err(error) = store.upsert(restore, false)
                        {
                            return vec![err_thread(thread_id, format!("Échec de synchronisation de la session : {error}"))];
                        }
                    }
                }
            } else {
                truncated = state.journal().truncate_from(thread_id, &eid);
            }
            if truncated && thread.provider != "codex" {
                if let Some(provider) = state.provider(&thread.provider) {
                    if let Err(error) = provider.rewind(thread_id, prompt_index).await {
                        tracing::info!(provider = %thread.provider, error = %error,
                            "rewind natif indisponible : seul le journal Atelier est tronqué");
                    }
                }
            }
        }
    }
    if thread.provider == "codex" && !truncated {
        return vec![err_thread(thread_id, "Message introuvable : historique conservé")];
    }
    let out = json_msg(json!({"type":"reverted","threadId": thread_id,"scope":"thread"}));
    let mut replies = broadcast_threads(state).await;
    replies.insert(0, out);
    replies
}

pub(super) async fn handle_retitle_all(state: &AppState) -> Vec<String> {
    if !state.try_begin_retitle() {
        return vec![json_msg(json!({
            "type": "retitleAllDone",
            "scanned": 0,
            "renamed": 0,
            "running": true,
        }))];
    }
    // Without Claude titleConversation: heuristic from journal first user message.
    let threads = state.threads().lock().await.list();
    let mut scanned = 0usize;
    let mut renamed = 0usize;
    for t in threads {
        let title = t.title.trim();
        let is_raw = crate::send::is_new_chat_placeholder(title)
            || title.starts_with("Session ")
            || title.chars().count() >= 40;
        if !is_raw {
            continue;
        }
        scanned += 1;
        let events = if state.journal().has_journal(&t.id) {
            state.journal().materialize(&t.id)
        } else {
            Vec::new()
        };
        let Some(first) = events.iter().find_map(|e| {
            if e.get("kind").and_then(|v| v.as_str()) == Some("user") {
                e.get("text").and_then(|v| v.as_str()).map(str::to_string)
            } else {
                None
            }
        }) else {
            continue;
        };
        let new_title: String = first.chars().take(48).collect();
        if new_title.is_empty() {
            continue;
        }
        let _ = state
            .threads()
            .lock()
            .await
            .upsert(json!({"id": t.id, "title": new_title}), true);
        renamed += 1;
    }
    state.end_retitle();
    let mut out = broadcast_threads(state).await;
    out.push(json_msg(json!({
        "type": "retitleAllDone",
        "scanned": scanned,
        "renamed": renamed,
    })));
    out
}
