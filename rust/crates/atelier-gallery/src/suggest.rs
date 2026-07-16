//! `/latex-suggest` — port fidèle du process Claude « chaud » persistant de
//! `gallery/server/claude_warm.mjs` : UN process haiku long-vécu en stream-json
//! (le boot ~6-9 s est payé une fois, les tours chauds ~2,5 s), single-flight
//! avec slot d'attente « newest wins », timeout 12 s → kill + respawn propre.
//!
//! Auth : session OAuth Max — ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN sont
//! retirées de l'env pour ne jamais basculer silencieusement sur l'API payante.
//! `--bare` est volontairement absent : il force l'auth par clé API.

use crate::{AppState, request_allowed};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{mpsc, oneshot};

const MAX_TURNS: u32 = 40; // recycler le process pour borner la conversation
const TURN_TIMEOUT_MS: u64 = 12_000; // tour bloqué → kill, respawn au suivant

const SYSTEM_PROMPT: &str = "You are an inline LaTeX-prose autocomplete engine.\n\
Each user message is an INDEPENDENT completion request; ignore previous turns.\n\
The message gives text before and after the cursor. Return ONLY the exact text\n\
to insert at the cursor.\n\
Rules:\n\
- Return 1 to 8 words, at most 80 characters.\n\
- No markdown, no quotes, no explanation, no thinking.\n\
- If the cursor is inside a LaTeX command, math, citation, reference, label,\n\
  path, or comment, return an empty string.\n\
- If the token before the cursor is partial, return only the missing suffix\n\
  without repeating typed letters.\n\
- Match the author's language and style.";

#[derive(Deserialize)]
pub struct SuggestBody {
    before: Option<String>,
    after: Option<String>,
}

enum Outcome {
    Text(String),
    Timeout,
    Superseded,
    NoCli,
}

struct SuggestReq {
    before: String,
    after: String,
    resp: oneshot::Sender<Outcome>,
}

struct Warm {
    child: Child,
    stdin: ChildStdin,
    /// Textes des lignes `{"type":"result"}` du process (un par tour).
    results: mpsc::Receiver<String>,
    turns: u32,
}

impl Warm {
    async fn kill(mut self) {
        let _ = self.child.kill().await;
    }
}

fn which(bin: &str) -> Option<PathBuf> {
    std::process::Command::new("which")
        .arg(bin)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

fn boot(bin: &Path, cwd: &Path) -> Option<Warm> {
    let mut child = Command::new(bin)
        .args([
            "-p",
            "--model",
            "haiku",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose", // requis pour la sortie stream-json
            "--setting-sources",
            "project", // saute les hooks globaux de l'utilisateur
            "--system-prompt",
            SYSTEM_PROMPT, // pas de scan CLAUDE.md / skills
            "--disallowedTools",
            "Bash,Edit,Write,Read,Grep,Glob,Task,WebFetch,WebSearch,NotebookEdit",
        ])
        .current_dir(cwd)
        .env("MAX_THINKING_TOKENS", "0")
        .env_remove("ANTHROPIC_API_KEY")
        .env_remove("ANTHROPIC_AUTH_TOKEN")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .ok()?;
    let stdin = child.stdin.take()?;
    let stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel(4);
    // Lecteur par process : meurt avec lui — un tour tué ne peut jamais
    // corrompre le suivant (le respawn crée un canal neuf).
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            if msg.get("type").and_then(|v| v.as_str()) == Some("result") {
                let text = if msg.get("subtype").and_then(|v| v.as_str()) == Some("success") {
                    msg.get("result")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                } else {
                    String::new()
                };
                if tx.send(text).await.is_err() {
                    break;
                }
            }
        }
    });
    Some(Warm {
        child,
        stdin,
        results: rx,
        turns: 0,
    })
}

fn turn_message(before: &str, after: &str) -> String {
    let chars: Vec<char> = before.chars().collect();
    let b: String = chars[chars.len().saturating_sub(2200)..].iter().collect();
    let a: String = after.chars().take(500).collect();
    format!("TEXT BEFORE CURSOR:\n{b}\n\nTEXT AFTER CURSOR:\n{a}\n\nINSERTION:")
}

/// Boucle propriétaire du process chaud : les requêtes arrivent par canal,
/// une seule tourne à la fois, les plus vieilles en attente sont remplacées
/// par la plus récente (le client CM6 n'affiche que la dernière frappe).
async fn manager(mut rx: mpsc::Receiver<SuggestReq>, cwd: PathBuf) {
    let mut warm: Option<Warm> = None;
    while let Some(mut req) = rx.recv().await {
        while let Ok(newer) = rx.try_recv() {
            let _ = req.resp.send(Outcome::Superseded);
            req = newer;
        }
        let Some(bin) = which("claude") else {
            let _ = req.resp.send(Outcome::NoCli);
            continue;
        };
        // recyclage uniquement au repos — jamais en plein tour (parité claude_warm)
        if warm.as_ref().is_some_and(|w| w.turns >= MAX_TURNS) {
            if let Some(w) = warm.take() {
                w.kill().await;
            }
        }
        if warm.is_none() {
            warm = boot(&bin, &cwd);
        }
        let Some(w) = warm.as_mut() else {
            let _ = req.resp.send(Outcome::Text(String::new()));
            continue;
        };
        w.turns += 1;
        let line = json!({
            "type": "user",
            "message": {"role": "user", "content": [{"type": "text", "text": turn_message(&req.before, &req.after)}]},
        })
        .to_string()
            + "\n";
        if w.stdin.write_all(line.as_bytes()).await.is_err() {
            let _ = req.resp.send(Outcome::Text(String::new()));
            if let Some(w) = warm.take() {
                w.kill().await;
            }
            continue;
        }
        match tokio::time::timeout(Duration::from_millis(TURN_TIMEOUT_MS), w.results.recv()).await {
            Ok(Some(text)) => {
                let _ = req.resp.send(Outcome::Text(text));
            }
            Ok(None) => {
                // process mort en plein tour → réponse vide, respawn au suivant
                let _ = req.resp.send(Outcome::Text(String::new()));
                if let Some(w) = warm.take() {
                    w.kill().await;
                }
            }
            Err(_) => {
                // tour bloqué : tuer pour qu'un tour à moitié fini ne corrompe
                // jamais le suivant ; la prochaine requête reboote proprement
                let _ = req.resp.send(Outcome::Timeout);
                if let Some(w) = warm.take() {
                    w.kill().await;
                }
            }
        }
    }
}

fn manager_tx(cwd: &Path) -> mpsc::Sender<SuggestReq> {
    static TX: OnceLock<mpsc::Sender<SuggestReq>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel(32);
        tokio::spawn(manager(rx, cwd.to_path_buf()));
        tx
    })
    .clone()
}

fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\u{1b}' && it.peek() == Some(&'[') {
            it.next();
            while let Some(&d) = it.peek() {
                it.next();
                if !(d.is_ascii_digit() || d == ';') {
                    break;
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

/// Parité `/```[\s\S]*?```/g` : seuls les blocs APPARIÉS sont retirés.
fn remove_fenced(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find("```") {
        let Some(end) = rest[start + 3..].find("```") else {
            break;
        };
        out.push_str(&rest[..start]);
        rest = &rest[start + 3 + end + 3..];
    }
    out.push_str(rest);
    out
}

fn normalize_suggestion(text: &str) -> String {
    let cleaned = remove_fenced(&strip_ansi(text));
    let first = cleaned.lines().next().unwrap_or("");
    let quotes: &[char] = &['"', '\'', '`', '«', '»', '\u{201c}', '\u{201d}'];
    let trimmed = first.trim_matches(|c: char| c.is_whitespace() || quotes.contains(&c));
    let collapsed = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out: String = collapsed.chars().take(120).collect();
    out = out.trim().to_string();
    if matches!(
        out.to_ascii_lowercase().as_str(),
        "none" | "null" | "empty" | "n/a"
    ) {
        out.clear();
    }
    out
}

pub async fn latex_suggest(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SuggestBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"loopback origin required"})),
        )
            .into_response();
    }
    let before = body.before.unwrap_or_default();
    let after = body.after.unwrap_or_default();
    if before.trim().is_empty() {
        return (
            StatusCode::OK,
            Json(json!({"ok": true, "text": "", "source": "empty"})),
        )
            .into_response();
    }
    let (resp_tx, resp_rx) = oneshot::channel();
    let tx = manager_tx(&state.root);
    if tx
        .send(SuggestReq {
            before,
            after,
            resp: resp_tx,
        })
        .await
        .is_err()
    {
        return (
            StatusCode::OK,
            Json(json!({"ok": false, "text": "", "error": "suggest manager down"})),
        )
            .into_response();
    }
    let payload = match resp_rx.await {
        Ok(Outcome::Text(raw)) => {
            let text = normalize_suggestion(&raw);
            json!({"ok": !text.is_empty(), "text": text, "source": "claude-warm", "model": "haiku"})
        }
        Ok(Outcome::Timeout) => {
            json!({"ok": false, "text": "", "error": "claude timeout", "source": "claude-warm"})
        }
        Ok(Outcome::Superseded) => {
            json!({"ok": false, "text": "", "superseded": true, "source": "claude-warm"})
        }
        Ok(Outcome::NoCli) => json!({"ok": false, "text": "", "error": "claude CLI not found"}),
        Err(_) => json!({"ok": false, "text": ""}),
    };
    (StatusCode::OK, Json(payload)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_ansi_fences_quotes_and_collapses() {
        assert_eq!(
            normalize_suggestion("\u{1b}[32m`la suite  logique`\u{1b}[0m\ndeuxième ligne"),
            "la suite logique"
        );
        assert_eq!(normalize_suggestion("```latex\nx\n``` reste"), "reste");
        assert_eq!(normalize_suggestion("«  du glacier  »"), "du glacier");
        assert_eq!(normalize_suggestion("None"), "");
        assert_eq!(normalize_suggestion("n/a"), "");
    }

    #[test]
    fn unpaired_fence_is_kept_verbatim() {
        assert_eq!(normalize_suggestion("avant ``` après"), "avant ``` après");
    }

    #[test]
    fn turn_message_bounds_context() {
        let before = "x".repeat(3000);
        let after = "y".repeat(900);
        let msg = turn_message(&before, &after);
        assert!(msg.starts_with("TEXT BEFORE CURSOR:\n"));
        assert!(msg.ends_with("\n\nINSERTION:"));
        assert_eq!(msg.matches('x').count(), 2200);
        assert_eq!(msg.matches('y').count(), 500);
    }
}
