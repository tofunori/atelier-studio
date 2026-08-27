//! Découverte et lecture des sessions natives Codex Desktop/CLI.
//!
//! Codex conserve ses rollouts sous `~/.codex/sessions/YYYY/MM/DD/*.jsonl`.
//! Atelier les lit en lecture seule : l'import crée seulement un pointeur vers
//! l'identifiant natif, puis les prochains tours passent par `thread/resume`.

use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

fn session_id_from_path(path: &Path) -> Option<String> {
    let stem = path.file_stem()?.to_str()?;
    let id = stem.get(stem.len().checked_sub(36)?..)?;
    let valid = id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            matches!(index, 8 | 13 | 18 | 23) && byte == b'-'
                || !matches!(index, 8 | 13 | 18 | 23) && byte.is_ascii_hexdigit()
        });
    valid.then(|| id.to_string())
}

fn collect_rollouts(base: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > 6 {
        return;
    }
    let Ok(entries) = fs::read_dir(base) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            collect_rollouts(&path, depth + 1, out);
        } else if kind.is_file()
            && path.extension().and_then(|value| value.to_str()) == Some("jsonl")
            && path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with("rollout-"))
        {
            out.push(path);
        }
    }
}

fn session_metadata(path: &Path) -> (Option<String>, Option<String>) {
    let Ok(file) = File::open(path) else {
        return (None, None);
    };
    let mut cwd = None;
    let mut title = None;
    for line in BufReader::new(file).lines().map_while(Result::ok).take(200) {
        let Ok(row) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let payload = row.get("payload").unwrap_or(&row);
        if cwd.is_none() && row.get("type").and_then(Value::as_str) == Some("session_meta") {
            cwd = payload
                .get("cwd")
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        if title.is_none() && payload.get("type").and_then(Value::as_str) == Some("user_message") {
            title = payload
                .get("message")
                .and_then(Value::as_str)
                // le rollout loggue le prompt provider complet : retirer les
                // blocs d'outils Atelier avant d'en faire un titre
                .map(|text| crate::grok_history::strip_gallery_tool_instruction(text.trim()))
                .map(|text| text.trim().to_string())
                .filter(|text| {
                    !text.is_empty() && !text.starts_with('<') && !text.starts_with("# AGENTS")
                })
                .map(|text| text.chars().take(90).collect());
        }
        if cwd.is_some() && title.is_some() {
            break;
        }
    }
    (cwd, title)
}

pub(crate) fn list_codex_sessions_from_base(base: &Path) -> Vec<Value> {
    let mut paths = Vec::new();
    collect_rollouts(base, 0, &mut paths);
    let mut sessions = paths
        .into_iter()
        .filter_map(|path| {
            let id = session_id_from_path(&path)?;
            let modified = fs::metadata(&path)
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_millis() as u64;
            let (project_root, title) = session_metadata(&path);
            Some(json!({
                "id": id,
                "mtime": modified,
                "title": title.unwrap_or_else(|| id.chars().take(8).collect()),
                "projectRoot": project_root.unwrap_or_default(),
            }))
        })
        .collect::<Vec<_>>();
    sessions.sort_by_key(|session| std::cmp::Reverse(session["mtime"].as_u64().unwrap_or(0)));
    sessions
}

pub(crate) fn list_codex_sessions() -> Vec<Value> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    list_codex_sessions_from_base(&PathBuf::from(home).join(".codex/sessions"))
}

fn find_session_file(base: &Path, session_id: &str) -> Option<PathBuf> {
    if session_id.len() != 36 || session_id.contains(['/', '\\']) {
        return None;
    }
    let mut paths = Vec::new();
    collect_rollouts(base, 0, &mut paths);
    paths
        .into_iter()
        .find(|path| session_id_from_path(path).as_deref() == Some(session_id))
}

/// Borne des sorties d'outils rejouées depuis un rollout, en CARACTÈRES
/// (jamais en octets : couper un point de code casserait l'UTF-8).
const NATIVE_TOOL_OUTPUT_MAX: usize = 8_000;

fn bound_output(text: &str) -> String {
    text.chars().take(NATIVE_TOOL_OUTPUT_MAX).collect()
}

/// Résumé une-ligne d'un appel d'outil : première ligne non vide de l'entrée.
fn tool_detail(input: &str) -> Value {
    match input
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(120).collect::<String>())
    {
        Some(detail) => Value::String(detail),
        None => Value::Null,
    }
}

/// Texte lisible d'un résultat MCP (`result.Ok.content[].text`).
fn mcp_result_text(result: &Value) -> (String, &'static str) {
    if let Some(err) = result.get("Err") {
        let text = err
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| err.to_string());
        return (bound_output(&text), "failed");
    }
    let ok = result.get("Ok").unwrap_or(result);
    let text = match ok.get("content").and_then(Value::as_array) {
        Some(items) => items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        None => ok.as_str().map(str::to_string).unwrap_or_default(),
    };
    (bound_output(&text), "completed")
}

fn tool_update_event(call_id: &str, name: &str, input: &str, output: &str, status: &str) -> Value {
    json!({
        "kind": "tool_update",
        "id": call_id,
        "name": name,
        "detail": tool_detail(input),
        "input": {"raw": input},
        "output": bound_output(output),
        "status": status,
    })
}

pub(crate) fn load_codex_history_from_base(base: &Path, session_id: &str) -> Vec<Value> {
    let Some(path) = find_session_file(base, session_id) else {
        return Vec::new();
    };
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    // call_id -> (name, input) ; Vec plutôt que HashMap pour garder l'ordre
    // d'insertion des appels restés sans sortie (< 10³ appels par rollout).
    let mut pending_calls: Vec<(String, String, String)> = Vec::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(row) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let payload = row.get("payload").unwrap_or(&row);
        let item_type = payload.get("type").and_then(Value::as_str).unwrap_or("");
        let call_id = || {
            payload
                .get("call_id")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        match item_type {
            "custom_tool_call" | "function_call" => {
                let name = payload
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let input = payload
                    .get("input")
                    .or_else(|| payload.get("arguments"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                pending_calls.push((call_id(), name, input));
                continue;
            }
            "custom_tool_call_output" | "function_call_output" => {
                let id = call_id();
                let Some(index) = pending_calls.iter().position(|(key, _, _)| *key == id) else {
                    continue;
                };
                let (_, name, input) = pending_calls.remove(index);
                let output = payload
                    .get("output")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                events.push(tool_update_event(&id, &name, &input, output, "completed"));
                continue;
            }
            "mcp_tool_call_end" => {
                let invocation = payload.get("invocation").cloned().unwrap_or(Value::Null);
                let server = invocation
                    .get("server")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let tool = invocation
                    .get("tool")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let (output, status) =
                    mcp_result_text(payload.get("result").unwrap_or(&Value::Null));
                events.push(json!({
                    "kind": "tool_update",
                    "id": call_id(),
                    "name": format!("{server}/{tool}"),
                    "input": invocation.get("arguments").cloned().unwrap_or(Value::Null),
                    "output": output,
                    "status": status,
                }));
                continue;
            }
            "patch_apply_end" => {
                let success = payload
                    .get("success")
                    .and_then(Value::as_bool)
                    .unwrap_or(false);
                let raw = if success {
                    payload.get("stdout").and_then(Value::as_str)
                } else {
                    payload
                        .get("stderr")
                        .and_then(Value::as_str)
                        .filter(|text| !text.is_empty())
                        .or_else(|| payload.get("stdout").and_then(Value::as_str))
                };
                events.push(json!({
                    "kind": "tool_update",
                    "id": call_id(),
                    "name": "apply_patch",
                    "output": bound_output(raw.unwrap_or_default()),
                    "status": if success { "completed" } else { "failed" },
                }));
                continue;
            }
            "agent_reasoning" => {
                let text = payload
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim();
                if !text.is_empty() {
                    events.push(json!({"kind": "thinking", "text": text}));
                }
                continue;
            }
            _ => {}
        }
        let kind = match item_type {
            "user_message" => "user",
            "agent_message" => "text",
            _ => continue,
        };
        let Some(raw) = payload
            .get("message")
            .and_then(Value::as_str)
            .map(str::trim)
        else {
            continue;
        };
        // strip des blocs d'outils Atelier (gallery/zotero/kb) sur les tours
        // utilisateur : le rollout Codex loggue le prompt provider complet
        let text = if kind == "user" {
            crate::grok_history::strip_gallery_tool_instruction(raw)
        } else {
            raw.to_string()
        };
        let text = text.trim();
        if text.is_empty()
            || kind == "user" && (text.starts_with('<') || text.starts_with("# AGENTS"))
        {
            continue;
        }
        events.push(json!({"kind": kind, "text": text}));
    }
    // appels restés sans sortie (rollout coupé) : les rendre quand même
    for (id, name, input) in pending_calls {
        events.push(tool_update_event(&id, &name, &input, "", "completed"));
    }
    events
}

pub(crate) fn load_codex_history(session_id: &str) -> Vec<Value> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    load_codex_history_from_base(&PathBuf::from(home).join(".codex/sessions"), session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn rollout_path(base: &Path, id: &str) -> PathBuf {
        let dir = base.join("2026/07/14");
        fs::create_dir_all(&dir).unwrap();
        dir.join(format!("rollout-2026-07-14T10-00-00-{id}.jsonl"))
    }

    fn write_rollout(base: &Path, id: &str) -> PathBuf {
        let path = rollout_path(base, id);
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"session_meta","payload":{"cwd":"/tmp/projet"}})
        )
        .unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"user_message","message":"Analyse cette figure\n\n<atelier-kb>\nSources attachées par l'utilisateur.\n</atelier-kb>"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"agent_message","message":"Voici l’analyse."}})).unwrap();
        path
    }

    #[test]
    fn lists_and_reads_native_codex_rollouts() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acd";
        write_rollout(dir.path(), id);
        let sessions = list_codex_sessions_from_base(dir.path());
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["id"], id);
        assert_eq!(sessions[0]["title"], "Analyse cette figure");
        assert_eq!(sessions[0]["projectRoot"], "/tmp/projet");
        assert_eq!(
            load_codex_history_from_base(dir.path(), id),
            vec![
                json!({"kind":"user","text":"Analyse cette figure"}),
                json!({"kind":"text","text":"Voici l’analyse."}),
            ]
        );
    }

    /// Le panneau d'un sous-agent doit montrer ce que l'agent FAIT : le
    /// parseur mappe les items d'outils du rollout, pas seulement la prose.
    #[test]
    fn maps_tool_items_from_rollout() {
        let dir = tempfile::tempdir().unwrap();
        let id = "019f5e20-34f6-76c2-bad0-442af9683acd";
        let path = rollout_path(dir.path(), id);
        let mut file = File::create(&path).unwrap();
        writeln!(file, "{}", json!({"type":"session_meta","payload":{"id": id, "cwd":"/tmp/projet"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"custom_tool_call","status":"completed","call_id":"c1","name":"exec","input":"const r = await tools.exec_command({cmd: \"wc -l a.py\"})"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"custom_tool_call_output","call_id":"c1","output":"42 a.py\n"}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"agent_reasoning","text":"Je compte les lignes."}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"mcp_tool_call_end","call_id":"m1","invocation":{"server":"scholar","tool":"search_papers","arguments":{"query":"albedo"}},"result":{"Ok":{"content":[{"type":"text","text":"3 articles"}]}}}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"patch_apply_end","call_id":"p1","stdout":"Success. Updated a.py\n","stderr":"","success":true}})).unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"agent_message","message":"Fini."}})).unwrap();

        let events = load_codex_history_from_base(dir.path(), id);
        let kinds: Vec<&str> = events.iter().map(|e| e["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds, ["tool_update", "thinking", "tool_update", "tool_update", "text"]);
        assert_eq!(events[0]["id"], "c1");
        assert_eq!(events[0]["name"], "exec");
        assert_eq!(events[0]["output"], "42 a.py\n");
        assert_eq!(events[0]["status"], "completed");
        assert_eq!(events[1]["text"], "Je compte les lignes.");
        assert_eq!(events[2]["name"], "scholar/search_papers");
        assert_eq!(events[2]["output"], "3 articles");
        assert_eq!(events[3]["name"], "apply_patch");
        assert_eq!(events[3]["status"], "completed");
    }

    #[test]
    fn rejects_hostile_session_ids() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load_codex_history_from_base(dir.path(), "../../etc/passwd").is_empty());
    }
}
