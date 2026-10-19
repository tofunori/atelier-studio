//! Transcript d'un sous-agent Claude, relu depuis le disque.
//!
//! Le CLI écrit chaque sous-agent lancé par l'outil Agent dans
//! `<config>/projects/<cwd>/<session>/subagents/agent-<task_id>.jsonl`
//! (sonde 2026-10-19, Claude Code 2.1.303). Le `task_id` est l'`agentThreadId`
//! que `claude_parse` donne à l'agent : la vue d'un sous-agent lit donc ce
//! fichier à la demande (`getAgentHistory`), comme le rollout d'un enfant
//! Codex, au lieu de faire transiter tout son flux par le fil parent.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::claude_parse::{bounded_input, normalize_tool_result, tool_detail};

/// Un id de session ou d'agent ne sert qu'à composer un chemin : rien d'autre
/// que des lettres, chiffres, `-` et `_`.
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Horodatage UTC du CLI (`2026-10-19T16:10:07.171Z`) en millisecondes.
fn timestamp_ms(entry: &Value) -> Option<u64> {
    let raw = entry.get("timestamp")?.as_str()?.strip_suffix('Z')?;
    let (date, time) = raw.split_once('T')?;
    let mut d = date.splitn(3, '-').map(|p| p.parse::<i64>().ok());
    let (y, m, day) = (d.next()??, d.next()??, d.next()??);
    let (hms, frac) = time.split_once('.').unwrap_or((time, "0"));
    let mut t = hms.splitn(3, ':').map(|p| p.parse::<i64>().ok());
    let (h, min, sec) = (t.next()??, t.next()??, t.next()??);
    let ms = format!("{frac:0<3}").get(..3)?.parse::<i64>().ok()?;
    // Jours depuis 1970-01-01, calendrier grégorien (Howard Hinnant).
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    u64::try_from(((days * 24 + h) * 60 + min) * 60_000 + sec * 1000 + ms).ok()
}

struct PendingTool {
    name: String,
    detail: String,
    input: Value,
    source: Option<&'static str>,
    started: Option<u64>,
}

/// Convertit le transcript JSONL d'un sous-agent en événements de fil, dans
/// les formes que `claude_parse` émet en direct : `text`, `thinking`, puis
/// `tool_update` en cours à l'appel et terminé au résultat. La consigne
/// initiale (premier message utilisateur) est déjà la mission de l'agent.
pub fn claude_subagent_events(jsonl: &str) -> Vec<Value> {
    let mut out = Vec::new();
    let mut pending: HashMap<String, PendingTool> = HashMap::new();
    for line in jsonl.lines() {
        let Ok(entry) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let ts = timestamp_ms(&entry);
        let Some(blocks) = entry.pointer("/message/content").and_then(Value::as_array) else {
            continue;
        };
        match entry.get("type").and_then(Value::as_str) {
            Some("assistant") => {
                for block in blocks {
                    match block.get("type").and_then(Value::as_str) {
                        Some("text") => {
                            let text = block.get("text").and_then(Value::as_str).unwrap_or("");
                            if !text.trim().is_empty() {
                                out.push(json!({"kind": "text", "text": text, "ts": ts}));
                            }
                        }
                        Some("thinking") => {
                            let text = block.get("thinking").and_then(Value::as_str).unwrap_or("");
                            if !text.trim().is_empty() {
                                out.push(json!({"kind": "thinking", "text": text, "ts": ts}));
                            }
                        }
                        Some("tool_use") => {
                            let Some(id) = block.get("id").and_then(Value::as_str) else {
                                continue;
                            };
                            let name = block
                                .get("name")
                                .and_then(Value::as_str)
                                .unwrap_or("tool")
                                .to_string();
                            let input = block.get("input").cloned().unwrap_or(json!({}));
                            let tool = PendingTool {
                                detail: tool_detail(&name, &input),
                                input: bounded_input(&input),
                                source: name.starts_with("mcp__").then_some("mcp"),
                                name,
                                started: ts,
                            };
                            out.push(json!({
                                "kind": "tool_update", "id": id, "name": tool.name, "detail": tool.detail,
                                "input": tool.input, "source": tool.source, "status": "running", "output": "", "ts": ts,
                            }));
                            pending.insert(id.to_string(), tool);
                        }
                        _ => {}
                    }
                }
            }
            Some("user") => {
                for block in blocks {
                    if block.get("type").and_then(Value::as_str) != Some("tool_result") {
                        continue;
                    }
                    let Some(id) = block.get("tool_use_id").and_then(Value::as_str) else {
                        continue;
                    };
                    let Some(tool) = pending.remove(id) else {
                        continue;
                    };
                    let (output, truncated, length) = normalize_tool_result(block);
                    let failed = block
                        .get("is_error")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let mut event = json!({
                        "kind": "tool_update", "id": id, "name": tool.name, "detail": tool.detail,
                        "input": tool.input, "source": tool.source,
                        "status": if failed { "failed" } else { "completed" }, "output": output, "ts": ts,
                    });
                    if let (Some(start), Some(end)) = (tool.started, ts) {
                        event["durationMs"] = json!(end.saturating_sub(start));
                    }
                    if truncated {
                        event["truncated"] = json!(true);
                        event["outputLength"] = json!(length);
                    }
                    out.push(event);
                }
            }
            _ => {}
        }
    }
    out
}

/// Cherche le transcript sous `<base>/projects/*/<session>/subagents/`. Le
/// dossier du projet dépend du répertoire de lancement ; on le parcourt plutôt
/// que de recalculer l'encodage du CLI.
pub fn load_claude_subagent_history_from_base(
    base: &Path,
    session_id: &str,
    agent_id: &str,
) -> Vec<Value> {
    if !safe_id(session_id) || !safe_id(agent_id) {
        return Vec::new();
    }
    let Ok(projects) = std::fs::read_dir(base.join("projects")) else {
        return Vec::new();
    };
    for project in projects.flatten() {
        let path = project
            .path()
            .join(session_id)
            .join("subagents")
            .join(format!("agent-{agent_id}.jsonl"));
        if let Ok(text) = std::fs::read_to_string(&path) {
            return claude_subagent_events(&text);
        }
    }
    Vec::new()
}

fn claude_config_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("CLAUDE_CONFIG_DIR").filter(|d| !d.is_empty()) {
        return Some(PathBuf::from(dir));
    }
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".claude"))
}

pub fn load_claude_subagent_history(session_id: &str, agent_id: &str) -> Vec<Value> {
    claude_config_dir()
        .map(|base| load_claude_subagent_history_from_base(&base, session_id, agent_id))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Extrait réduit d'un vrai transcript (sonde 2026-10-19) : consigne,
    /// pièces jointes du CLI, appel d'outil, résultat, rapport final.
    const SAMPLE: &str = r#"{"isSidechain":true,"agentId":"a9fb4b2bcee045d4b","type":"user","message":{"role":"user","content":"Lis le fichier /etc/hostname."},"timestamp":"2026-10-19T16:10:07.171Z"}
{"isSidechain":true,"agentId":"a9fb4b2bcee045d4b","type":"attachment","attachment":{"type":"date","date":"2026-10-19"},"timestamp":"2026-10-19T16:10:07.196Z"}
{"isSidechain":true,"agentId":"a9fb4b2bcee045d4b","type":"assistant","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Je lis le fichier."},{"type":"tool_use","id":"toolu_01Q","name":"Read","input":{"file_path":"/etc/hostname"}}]},"timestamp":"2026-10-19T16:10:08.000Z"}
{"isSidechain":true,"agentId":"a9fb4b2bcee045d4b","type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_01Q","type":"tool_result","content":"1\tvm\n2\t"}]},"timestamp":"2026-10-19T16:10:09.600Z"}
{"isSidechain":true,"agentId":"a9fb4b2bcee045d4b","type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"vm"}]},"timestamp":"2026-10-19T16:10:10.000Z"}
pas du json
"#;

    #[test]
    fn le_transcript_devient_pensee_outil_et_rapport() {
        let events = claude_subagent_events(SAMPLE);
        let kinds: Vec<_> = events.iter().map(|e| e["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["thinking", "tool_update", "tool_update", "text"]);
        assert_eq!(events[1]["status"], "running");
        assert_eq!(events[1]["name"], "Read");
        assert_eq!(events[2]["status"], "completed");
        assert_eq!(events[2]["output"], "1\tvm\n2\t");
        assert_eq!(events[2]["durationMs"], 1600);
        assert_eq!(events[3]["text"], "vm");
        assert_eq!(events[3]["ts"], 1792426210000u64);
    }

    #[test]
    fn un_outil_sans_resultat_reste_en_cours_et_un_echec_est_marque() {
        let jsonl = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"a","name":"Bash","input":{"command":"ls"}},{"type":"tool_use","id":"b","name":"Bash","input":{"command":"false"}}]}}
{"type":"user","message":{"content":[{"tool_use_id":"b","type":"tool_result","content":"exit 1","is_error":true}]}}"#;
        let events = claude_subagent_events(jsonl);
        assert_eq!(events.len(), 3);
        assert_eq!(events[2]["id"], "b");
        assert_eq!(events[2]["status"], "failed");
        assert!(events
            .iter()
            .all(|e| e["id"] != "a" || e["status"] == "running"));
    }

    #[test]
    fn le_fichier_se_trouve_par_session_et_agent_sans_sortir_du_dossier() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("projects/-Users-t-these/sess-1/subagents");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("agent-a9f.jsonl"), SAMPLE).unwrap();
        assert_eq!(
            load_claude_subagent_history_from_base(base.path(), "sess-1", "a9f").len(),
            4
        );
        assert!(
            load_claude_subagent_history_from_base(base.path(), "sess-1", "inconnu").is_empty()
        );
        assert!(load_claude_subagent_history_from_base(base.path(), "..", "a9f").is_empty());
        assert!(load_claude_subagent_history_from_base(base.path(), "sess-1", "../a9f").is_empty());
    }
}
