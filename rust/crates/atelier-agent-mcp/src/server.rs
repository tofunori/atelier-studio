//! MCP stdio server: concurrent reads, ordered mutations, one bounded writer.
use crate::bridge::Bridge;
use crate::schema::{
    bridge_call_for, help_text, tool_definition, widget_guide_text, widget_guide_tool_definition,
    widget_tool_definition, TOOL_NAME, WIDGET_GUIDE_TOOL_NAME,
};
use serde_json::{json, Value};
use std::{collections::HashMap, future::Future, pin::Pin, sync::Arc};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, watch};

type Call = Arc<
    dyn Fn(String, Value) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send>>
        + Send
        + Sync,
>;
const MAX_PENDING: usize = 32;
struct Job {
    id: Value,
    action: String,
    arguments: Value,
    cancelled: watch::Receiver<bool>,
}
struct Completed {
    id: Value,
    frame: Option<Value>,
}

pub async fn run() -> Result<(), String> {
    let bridge = Arc::new(Bridge::from_env()?);
    let call: Call = Arc::new(move |action, arguments| {
        let bridge = bridge.clone();
        Box::pin(async move { bridge.call(&action, &arguments).await })
    });
    serve(
        BufReader::new(tokio::io::stdin()),
        tokio::io::stdout(),
        call,
    )
    .await
}

fn readonly(action: &str) -> bool {
    matches!(
        action,
        "current" | "list" | "inspect" | "read_context" | "wait"
    )
}

async fn execute(mut job: Job, call: &Call, interruptible: bool) -> Completed {
    if *job.cancelled.borrow() {
        return Completed {
            id: job.id,
            frame: None,
        };
    }
    let response = call(job.action, job.arguments);
    tokio::pin!(response);
    // A submitted mutation may already be durable at the backend. Await it to
    // preserve ordering; cancellation suppresses its reply, not its side effects.
    let value = if interruptible {
        tokio::select! {
            value = &mut response => value,
            _ = job.cancelled.changed() => return Completed { id: job.id, frame: None },
        }
    } else {
        response.await
    };
    let frame = if *job.cancelled.borrow() {
        None
    } else {
        Some(match value {
            Ok(value) => {
                let error = value.get("error").is_some();
                tool_result(&job.id, value, error)
            }
            Err(error) => tool_result(
                &job.id,
                json!({"error":"backend_unavailable","message":error}),
                true,
            ),
        })
    };
    Completed { id: job.id, frame }
}

async fn serve(
    reader: impl AsyncBufRead + Unpin,
    mut writer: impl AsyncWrite + Unpin,
    call: Call,
) -> Result<(), String> {
    let mut lines = reader.lines();
    let (completed_tx, mut completed_rx) = mpsc::channel::<Completed>(MAX_PENDING);
    let (mutation_tx, mut mutation_rx) = mpsc::channel::<Job>(MAX_PENDING);
    let mut tasks = tokio::task::JoinSet::new();
    let mutation_call = call.clone();
    let mutation_completed = completed_tx.clone();
    tasks.spawn(async move {
        while let Some(job) = mutation_rx.recv().await {
            if mutation_completed
                .send(execute(job, &mutation_call, false).await)
                .await
                .is_err()
            {
                break;
            }
        }
    });
    let mut pending: HashMap<String, watch::Sender<bool>> = HashMap::new();
    let mut eof = false;
    loop {
        if eof && pending.is_empty() {
            break;
        }
        tokio::select! {
            Some(done) = completed_rx.recv(), if !pending.is_empty() => {
                pending.remove(&done.id.to_string());
                if let Some(frame) = done.frame { write_frame(&mut writer, &frame).await?; }
            }
            Some(_) = tasks.join_next(), if tasks.len() > 1 => {},
            line = lines.next_line(), if !eof => {
                let Some(line) = line.map_err(|error| error.to_string())? else { eof = true; continue; };
                if line.trim().is_empty() { continue; }
                let msg: Value = match serde_json::from_str(&line) {
                    Ok(msg) => msg,
                    Err(error) => { eprintln!("atelier-agent-mcp: bad json: {error}"); continue; }
                };
                let method = msg["method"].as_str().unwrap_or("");
                let Some(id) = msg.get("id").cloned() else {
                    if method == "notifications/cancelled" {
                        if let Some(sender) = msg.pointer("/params/requestId").and_then(|id| pending.get(&id.to_string())) {
                            let _ = sender.send(true);
                        }
                    }
                    continue;
                };
                let params = &msg["params"];
                let local = match method {
                    "initialize" => Some(json!({"jsonrpc":"2.0", "id":id, "result":{
                        "protocolVersion":params.get("protocolVersion").cloned().unwrap_or(json!("2024-11-05")),
                        "capabilities":{"tools":{}}, "serverInfo":{"name":"atelier-sessions","version":env!("CARGO_PKG_VERSION")}}})),
                    "ping" => Some(json!({"jsonrpc":"2.0","id":id,"result":{}})),
                    "tools/list" => Some(json!({"jsonrpc":"2.0","id":id,"result":{"tools":[tool_definition(),widget_tool_definition(),widget_guide_tool_definition()]}})),
                    "tools/call" => None,
                    _ => Some(error_result_value(&id, -32601, &format!("Method not found: {method}"))),
                };
                if let Some(frame) = local { write_frame(&mut writer, &frame).await?; continue; }
                let name = params["name"].as_str().unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));
                if name == TOOL_NAME && args["action"] == "help" {
                    write_frame(&mut writer, &tool_result(&id, help_text(), false)).await?; continue;
                }
                if name == WIDGET_GUIDE_TOOL_NAME {
                    write_frame(&mut writer, &tool_result(&id, widget_guide_text(), false)).await?; continue;
                }
                let Some((action, arguments)) = bridge_call_for(name, &args) else {
                    let error = if name == TOOL_NAME { "missing_action".into() } else { format!("unknown tool: {name}") };
                    write_frame(&mut writer, &tool_result(&id, json!({"error":error}), true)).await?; continue;
                };
                let key = id.to_string();
                if pending.contains_key(&key) || pending.len() >= MAX_PENDING {
                    write_frame(&mut writer, &error_result_value(&id, -32000, "request already active or server busy; retry later")).await?;
                    continue;
                }
                let (cancel_tx, cancelled) = watch::channel(false);
                pending.insert(key, cancel_tx);
                let is_read = readonly(&action);
                let job = Job { id, action, arguments, cancelled };
                if is_read {
                    let call = call.clone(); let completed = completed_tx.clone();
                    tasks.spawn(async move { let _ = completed.send(execute(job, &call, true).await).await; });
                } else {
                    // Only this reader enqueues mutations, preserving wire order.
                    mutation_tx.send(job).await.map_err(|error| error.to_string())?;
                }
            }
        }
    }
    tasks.abort_all();
    Ok(())
}

fn tool_result(id: &Value, value: Value, is_error: bool) -> Value {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| "{}".into());
    json!({"jsonrpc":"2.0","id":id,"result":{"content":[{"type":"text","text":text}],"isError":is_error,"structuredContent":value}})
}
fn error_result_value(id: &Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
async fn write_frame(writer: &mut (impl AsyncWrite + Unpin), value: &Value) -> Result<(), String> {
    let mut frame = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    frame.push(b'\n');
    writer
        .write_all(&frame)
        .await
        .map_err(|error| error.to_string())?;
    writer.flush().await.map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    fn request(id: i32, action: &str) -> Value {
        json!({"id":id,"method":"tools/call","params":{"name":TOOL_NAME,"arguments":{"action":action}}})
    }
    #[tokio::test]
    async fn wait_does_not_block_ping_and_can_be_cancelled() {
        let call: Call = Arc::new(|_, _| {
            Box::pin(async {
                tokio::time::sleep(Duration::from_secs(10)).await;
                Ok(json!({}))
            })
        });
        let (client, server) = tokio::io::duplex(65536);
        let (read, write) = tokio::io::split(server);
        let task = tokio::spawn(serve(BufReader::new(read), write, call));
        let (read, mut write) = tokio::io::split(client);
        let mut lines = BufReader::new(read).lines();
        write_frame(&mut write, &request(1, "wait")).await.unwrap();
        write_frame(&mut write, &json!({"id":2,"method":"ping"}))
            .await
            .unwrap();
        let line = tokio::time::timeout(Duration::from_millis(200), lines.next_line())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(serde_json::from_str::<Value>(&line).unwrap()["id"], 2);
        write_frame(
            &mut write,
            &json!({"method":"notifications/cancelled","params":{"requestId":1}}),
        )
        .await
        .unwrap();
        write.shutdown().await.unwrap();
        tokio::time::timeout(Duration::from_millis(200), task)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert!(lines.next_line().await.unwrap().is_none());
    }
    #[tokio::test]
    async fn mutations_keep_wire_order_while_reads_progress() {
        let seen = Arc::new(std::sync::Mutex::new(Vec::new()));
        let record = seen.clone();
        let call: Call = Arc::new(move |action, _| {
            let record = record.clone();
            Box::pin(async move {
                if action == "send_message" {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                record.lock().unwrap().push(action.clone());
                Ok(json!({"action":action}))
            })
        });
        let (client, server) = tokio::io::duplex(65536);
        let (read, write) = tokio::io::split(server);
        let task = tokio::spawn(serve(BufReader::new(read), write, call));
        let (read, mut write) = tokio::io::split(client);
        let mut lines = BufReader::new(read).lines();
        for (id, action) in [(1, "send_message"), (2, "report_to_parent"), (3, "inspect")] {
            write_frame(&mut write, &request(id, action)).await.unwrap();
        }
        write.shutdown().await.unwrap();
        let mut ids = Vec::new();
        while let Some(line) = lines.next_line().await.unwrap() {
            ids.push(serde_json::from_str::<Value>(&line).unwrap()["id"].clone());
        }
        task.await.unwrap().unwrap();
        assert_eq!(ids, vec![json!(3), json!(1), json!(2)]);
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["inspect", "send_message", "report_to_parent"]
        );
    }
}
