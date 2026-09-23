//! A socket only receives, admits and forwards; route handlers never own it.
use crate::{
    state::AppState,
    ws_dispatch::{self, Class, Work},
};
use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{future::Future, sync::Arc, time::Duration};
use tokio::sync::{mpsc, watch, Semaphore};

pub(crate) async fn handle<F, Fut>(socket: WebSocket, state: AppState, route: F, deadline: Duration)
where
    F: Fn(AppState, String) -> Fut + Clone + Send + 'static,
    Fut: Future<Output = Vec<String>> + Send + 'static,
{
    let (mut sink, mut source) = socket.split();
    let (out, mut outgoing) = mpsc::channel::<Message>(128);
    let (closed, disconnected) = watch::channel(false);
    let mut bus = state.subscribe_bus();
    let mut writer = tokio::spawn(async move {
        loop {
            let frame = tokio::select! {
                frame = outgoing.recv() => match frame { Some(frame) => frame, None => break },
                event = bus.recv() => match event {
                    Ok(text) => Message::Text(text.into()),
                    // Reconnect + history resync instead of silently losing events.
                    Err(_) => break,
                }
            };
            if !matches!(
                tokio::time::timeout(Duration::from_secs(5), sink.send(frame)).await,
                Ok(Ok(()))
            ) {
                break;
            }
        }
        let _ = tokio::time::timeout(Duration::from_secs(1), sink.close()).await;
    });
    let reads = Arc::new(Semaphore::new(32));
    let histories = Arc::new(Semaphore::new(8));
    let read_workers = Arc::new(Semaphore::new(4));
    let history_workers = Arc::new(Semaphore::new(4));
    let fast_reads = Arc::new(Semaphore::new(8));
    let controls = Arc::new(Semaphore::new(8));
    let terminals = Arc::new(Semaphore::new(8));
    let ordered = Arc::new(Semaphore::new(32));
    let corpus = Arc::new(Semaphore::new(8));
    let mut shutdown = disconnected.clone();
    loop {
        let frame = tokio::select! { _ = &mut writer => break, _ = shutdown.wait_for(|v| *v) => break, frame = source.next() => frame };
        let text = match frame {
            Some(Ok(Message::Text(text))) => text,
            Some(Ok(Message::Ping(data))) => {
                if out.try_send(Message::Pong(data)).is_err() {
                    break;
                }
                continue;
            }
            Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
            _ => continue,
        };
        if text.len() > 8 * 1024 * 1024 {
            break;
        }
        let request: Value = match serde_json::from_str(&text) {
            Ok(request) => request,
            Err(_) => {
                if out
                    .try_send(Message::Text(
                        json!({"type":"error","message":"JSON invalide"})
                            .to_string()
                            .into(),
                    ))
                    .is_err()
                {
                    break;
                }
                continue;
            }
        };
        let kind = request["type"].as_str().unwrap_or("");
        if kind == "ping" {
            if out
                .try_send(Message::Text(json!({"type":"pong"}).to_string().into()))
                .is_err()
            {
                break;
            }
            continue;
        }
        let class = ws_dispatch::classify(kind);
        let slots = match class {
            Class::Read => &reads,
            Class::History => &histories,
            Class::FastRead => &fast_reads,
            Class::Control => &controls,
            Class::Terminal => &terminals,
            Class::Ordered => &ordered,
            Class::Corpus => &corpus,
        };
        let admission = slots.clone().try_acquire_owned().ok().and_then(|local| {
            state
                .ws_budget()
                .admit(class, text.len())
                .map(|global| (local, global))
        });
        let Some((local, permits)) = admission else {
            if kind == "clientLog" {
                continue;
            } // Best-effort diagnostics never disrupt the UI.
            if out
                .try_send(Message::Text(
                    ws_dispatch::failure(
                        &request,
                        "REQUEST_BUSY",
                        "Serveur occupé : requête refusée, réessayez dans quelques secondes.",
                    )
                    .into(),
                ))
                .is_err()
            {
                break;
            }
            continue;
        };
        let (order, send) = state.ws_budget().prepare(&request, class);
        let deadline = match kind {
            // Remote connector discovery can exceed the ordinary 15s read budget.
            // It still uses bounded read slots and never blocks sends or controls.
            "listPlugins" | "listCodexApps" => deadline.saturating_mul(3),
            "ragdocSearch" | "kbRagdocPage" | "articleList" | "ragdocStatus" | "ragdocZotero" | "articleReview" => Duration::from_secs(135),
            "getHistory" | "getAgentHistory" | "narvalSnapshot" | "narvalReadText"
            | "computeSnapshot" | "computeReadLog" => deadline.saturating_mul(2),
            _ => deadline,
        };
        let work = Work {
            request: request.clone(),
            text: text.to_string(),
            class,
            order,
            permits,
            send,
            execution_slots: match class {
                Class::Read => Some(read_workers.clone()),
                Class::History => Some(history_workers.clone()),
                _ => None,
            },
        };
        let state = state.clone();
        let route = route.clone();
        let out = out.clone();
        let disconnected = disconnected.clone();
        let close = closed.clone();
        // These tasks own accepted mutations until completion, including after disconnect.
        tokio::spawn(async move {
            let _local = local;
            let task = ws_dispatch::execute(work, state, route, disconnected, deadline);
            tokio::pin!(task);
            let replies = if matches!(
                class,
                Class::Ordered | Class::Control | Class::Terminal | Class::Corpus
            ) {
                tokio::select! {
                    replies = &mut task => replies,
                    _ = tokio::time::sleep(deadline) => {
                        let mut delayed: Value = serde_json::from_str(&ws_dispatch::failure(&request, "REQUEST_DELAYED", "Cette action prend plus de temps que prévu. Elle reste en cours ; ne la renvoyez pas.")).unwrap();
                        delayed["type"] = json!("requestDelayed");
                        if out.try_send(Message::Text(delayed.to_string().into())).is_err() { let _ = close.send(true); }
                        task.await
                    }
                }
            } else {
                task.await
            };
            for reply in replies {
                if out.try_send(Message::Text(reply.into())).is_err() {
                    let _ = close.send(true);
                    break;
                }
            }
        });
        if *closed.borrow() {
            break;
        }
    }
    let _ = closed.send(true);
    writer.abort();
}
