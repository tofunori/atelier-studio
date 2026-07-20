//! Minimal MCP stdio server — single tool `atelier_sessions`.

use crate::bridge::Bridge;
use crate::schema::{help_text, tool_definition, TOOL_NAME};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub async fn run() -> Result<(), String> {
    let bridge = Bridge::from_env()?;
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin);
    let mut stdout = tokio::io::stdout();
    let mut line = String::new();

    loop {
        line.clear();
        let n = reader
            .read_line(&mut line)
            .await
            .map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("atelier-agent-mcp: bad json: {e}");
                continue;
            }
        };

        // Notification (no id)
        if msg.get("id").is_none() {
            let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
            if method == "notifications/initialized" || method == "initialized" {
                continue;
            }
            continue;
        }

        let id = msg.get("id").cloned().unwrap_or(Value::Null);
        let method = msg.get("method").and_then(|v| v.as_str()).unwrap_or("");
        let params = msg.get("params").cloned().unwrap_or(json!({}));

        let result = match method {
            "initialize" => json!({
                "protocolVersion": params.get("protocolVersion").cloned().unwrap_or(json!("2024-11-05")),
                "capabilities": { "tools": {} },
                "serverInfo": {
                    "name": "atelier-sessions",
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
            "ping" => json!({}),
            "tools/list" => json!({ "tools": [tool_definition()] }),
            "tools/call" => {
                let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if name != TOOL_NAME {
                    error_result(&id, -32602, &format!("unknown tool: {name}")).await?;
                    write_frame(&mut stdout, &error_result_value(&id, -32602, &format!("unknown tool: {name}"))).await?;
                    continue;
                }
                let args = params.get("arguments").cloned().unwrap_or(json!({}));
                let action = args
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if action.is_empty() {
                    tool_text_result(&mut stdout, &id, json!({"error":"missing_action"}), true)
                        .await?;
                    continue;
                }
                if action == "help" {
                    tool_text_result(&mut stdout, &id, help_text(), false).await?;
                    continue;
                }
                // Reject unknown fields silently? Plan: refuse unknown fields for action.
                match bridge.call(&action, &args).await {
                    Ok(val) => {
                        let is_err = val.get("error").is_some();
                        tool_text_result(&mut stdout, &id, val, is_err).await?;
                    }
                    Err(e) => {
                        tool_text_result(
                            &mut stdout,
                            &id,
                            json!({"error":"backend_unavailable","message": e}),
                            true,
                        )
                        .await?;
                    }
                }
                continue;
            }
            _ => {
                write_frame(
                    &mut stdout,
                    &error_result_value(&id, -32601, &format!("Method not found: {method}")),
                )
                .await?;
                continue;
            }
        };

        write_frame(&mut stdout, &json!({"jsonrpc":"2.0","id": id, "result": result})).await?;
    }
    Ok(())
}

async fn tool_text_result(
    stdout: &mut tokio::io::Stdout,
    id: &Value,
    val: Value,
    is_error: bool,
) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&val).unwrap_or_else(|_| "{}".into());
    let frame = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "content": [{ "type": "text", "text": text }],
            "isError": is_error,
            "structuredContent": val,
        }
    });
    write_frame(stdout, &frame).await
}

fn error_result_value(id: &Value, code: i64, message: &str) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    })
}

async fn error_result(_id: &Value, _code: i64, _message: &str) -> Result<(), String> {
    Ok(())
}

async fn write_frame(stdout: &mut tokio::io::Stdout, val: &Value) -> Result<(), String> {
    let s = serde_json::to_string(val).map_err(|e| e.to_string())?;
    stdout
        .write_all(s.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    stdout.write_all(b"\n").await.map_err(|e| e.to_string())?;
    stdout.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}
