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
                .map(str::trim)
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

pub(crate) fn load_codex_history_from_base(base: &Path, session_id: &str) -> Vec<Value> {
    let Some(path) = find_session_file(base, session_id) else {
        return Vec::new();
    };
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(row) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let payload = row.get("payload").unwrap_or(&row);
        let kind = match payload.get("type").and_then(Value::as_str) {
            Some("user_message") => "user",
            Some("agent_message") => "text",
            _ => continue,
        };
        let Some(text) = payload
            .get("message")
            .and_then(Value::as_str)
            .map(str::trim)
        else {
            continue;
        };
        if text.is_empty()
            || kind == "user" && (text.starts_with('<') || text.starts_with("# AGENTS"))
        {
            continue;
        }
        events.push(json!({"kind": kind, "text": text}));
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

    fn write_rollout(base: &Path, id: &str) -> PathBuf {
        let dir = base.join("2026/07/14");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("rollout-2026-07-14T10-00-00-{id}.jsonl"));
        let mut file = File::create(&path).unwrap();
        writeln!(
            file,
            "{}",
            json!({"type":"session_meta","payload":{"cwd":"/tmp/projet"}})
        )
        .unwrap();
        writeln!(file, "{}", json!({"type":"event_msg","payload":{"type":"user_message","message":"Analyse cette figure"}})).unwrap();
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

    #[test]
    fn rejects_hostile_session_ids() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load_codex_history_from_base(dir.path(), "../../etc/passwd").is_empty());
    }
}
