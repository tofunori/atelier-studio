//! Lecture de secours du transcript natif Grok.
//!
//! Le CLI conserve le dialogue dans
//! `~/.grok/sessions/<project>/<session>/chat_history.jsonl`. Ce transcript
//! reste la source la plus complète pour les anciens tours dont le journal
//! Atelier ne contient que les deltas éphémères.

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

fn safe_session_id(session_id: &str) -> bool {
    !session_id.is_empty()
        && !session_id.contains('/')
        && !session_id.contains('\\')
        && session_id != "."
        && session_id != ".."
}

fn find_session_file(base: &Path, session_id: &str) -> Option<PathBuf> {
    if !safe_session_id(session_id) {
        return None;
    }
    for entry in fs::read_dir(base).ok()? {
        let project = entry.ok()?;
        if !project.file_type().ok()?.is_dir() {
            continue;
        }
        let candidate = project.path().join(session_id).join("chat_history.jsonl");
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn content_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    content
        .as_array()
        .into_iter()
        .flatten()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_user_query(text: &str) -> Option<String> {
    const OPEN: &str = "<user_query>";
    const CLOSE: &str = "</user_query>";
    let start = text.find(OPEN)? + OPEN.len();
    let end = text[start..].find(CLOSE)? + start;
    let query = strip_gallery_tool_instruction(text[start..end].trim());
    (!query.is_empty()).then_some(query)
}

fn strip_gallery_tool_instruction(text: &str) -> String {
    let mut out = text.to_string();
    for (open, close) in [
        (
            "<atelier-gallery-integration>",
            "</atelier-gallery-integration>",
        ),
        ("<atelier-zotero-passages>", "</atelier-zotero-passages>"),
        ("<atelier-kb>", "</atelier-kb>"),
    ] {
        while let Some(start) = out.find(open) {
            let Some(relative_end) = out[start + open.len()..].find(close) else {
                break;
            };
            let end = start + open.len() + relative_end + close.len();
            let remove_from = out[..start].trim_end_matches(['\r', '\n']).len();
            out.replace_range(remove_from..end, "");
        }
    }
    out.trim_end().to_string()
}

pub(crate) fn load_grok_history_from_base(base: &Path, session_id: &str) -> Vec<Value> {
    let Some(path) = find_session_file(base, session_id) else {
        return Vec::new();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut events = Vec::new();
    for line in raw.lines() {
        let Ok(row) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match row.get("type").and_then(Value::as_str) {
            Some("user") => {
                if let Some(query) = row
                    .get("content")
                    .map(content_text)
                    .and_then(|text| extract_user_query(&text))
                {
                    events.push(json!({"kind":"user", "text": query}));
                }
            }
            Some("assistant") => {
                let text = row.get("content").map(content_text).unwrap_or_default();
                if !text.trim().is_empty() {
                    events.push(json!({"kind":"text", "text": text.trim()}));
                }
                if let Some(calls) = row.get("tool_calls").and_then(Value::as_array) {
                    for call in calls {
                        if let Some(name) = call.get("name").and_then(Value::as_str) {
                            events.push(json!({"kind":"tool", "name": name}));
                        }
                    }
                }
            }
            _ => {}
        }
    }
    events
}

pub(crate) fn load_grok_history(session_id: &str) -> Vec<Value> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    load_grok_history_from_base(&PathBuf::from(home).join(".grok/sessions"), session_id)
}

pub(crate) fn prefer_richer_dialogue(journal: Vec<Value>, native: Vec<Value>) -> Vec<Value> {
    let score = |events: &[Value]| {
        let texts = events
            .iter()
            .filter(|event| event.get("kind").and_then(Value::as_str) == Some("text"))
            .count();
        let users = events
            .iter()
            .filter(|event| event.get("kind").and_then(Value::as_str) == Some("user"))
            .count();
        (texts, users)
    };
    let journal_score = score(&journal);
    let native_score = score(&native);
    if native_score <= journal_score {
        return journal;
    }

    // Le transcript natif récupère les réponses perdues par les anciens runs,
    // mais le journal Atelier reste la source d'affichage des messages user
    // (texte tapé, label et attachments structurés). Un appariement séquentiel
    // respecte aussi les rewinds : les tours encore présents chez Grok mais
    // tombstonés dans le journal sont omis avec leurs réponses.
    if journal_score.1 > 0 {
        let display_users = journal
            .iter()
            .filter(|event| event.get("kind").and_then(Value::as_str) == Some("user"))
            .cloned()
            .collect::<Vec<_>>();
        let mut merged = Vec::new();
        let mut display_index = 0;
        let mut keep_turn = false;
        for event in &native {
            if event.get("kind").and_then(Value::as_str) == Some("user") {
                let Some(display) = display_users.get(display_index) else {
                    keep_turn = false;
                    continue;
                };
                let native_text = strip_gallery_tool_instruction(
                    event.get("text").and_then(Value::as_str).unwrap_or(""),
                );
                let native_text = native_text.trim();
                let display_text = display
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim();
                keep_turn = !display_text.is_empty()
                    && (native_text == display_text
                        || native_text.ends_with(&format!("\n\n{display_text}")));
                if keep_turn {
                    merged.push(display.clone());
                    display_index += 1;
                }
            } else if keep_turn {
                merged.push(event.clone());
            }
        }
        if display_index == display_users.len() {
            return merged;
        }
    }
    native
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn reads_multi_turn_native_history_and_ignores_synthetic_user_context() {
        let dir = tempdir().unwrap();
        let session_dir = dir.path().join("%2Fproject").join("sid-1");
        fs::create_dir_all(&session_dir).unwrap();
        fs::write(
            session_dir.join("chat_history.jsonl"),
            [
                json!({"type":"user","content":[{"type":"text","text":"<system-reminder>ignore</system-reminder>"}]}),
                json!({"type":"user","content":[{"type":"text","text":"<user_query>question 1</user_query>"}]}),
                json!({"type":"assistant","content":"réponse 1","tool_calls":[]}),
                json!({"type":"user","content":[{"type":"text","text":"<user_query>question 2</user_query>"}]}),
                json!({"type":"assistant","content":"réponse 2","tool_calls":[{"name":"read_file"}]}),
            ]
            .into_iter()
            .map(|row| row.to_string())
            .collect::<Vec<_>>()
            .join("\n"),
        )
        .unwrap();

        let events = load_grok_history_from_base(dir.path(), "sid-1");
        assert_eq!(
            events
                .iter()
                .map(|event| event["kind"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["user", "text", "user", "text", "tool"]
        );
    }

    #[test]
    fn native_history_wins_when_journal_lost_assistant_answers() {
        let journal = vec![json!({"kind":"user","text":"q"}), json!({"kind":"done"})];
        let native = vec![
            json!({"kind":"user","text":"q"}),
            json!({"kind":"text","text":"r"}),
        ];
        let picked = prefer_richer_dialogue(journal, native);
        assert_eq!(picked[1]["kind"], "text");
    }

    #[test]
    fn richer_native_history_keeps_structured_journal_user_display() {
        let journal = vec![
            json!({"kind":"user","text":"vulgarise", "label":"Citation de la conversation"}),
            json!({"kind":"done"}),
        ];
        let native = vec![
            json!({"kind":"user","text":"tour supprimé"}),
            json!({"kind":"text","text":"réponse supprimée"}),
            json!({"kind":"user","text":"citation brute\n\nvulgarise\n\n<atelier-gallery-integration>secret</atelier-gallery-integration>\n<atelier-zotero-passages>secret pdf</atelier-zotero-passages>\n<atelier-kb>sources secrètes</atelier-kb>"}),
            json!({"kind":"text","text":"réponse complète"}),
        ];

        let picked = prefer_richer_dialogue(journal, native);
        assert_eq!(picked[0]["text"], "vulgarise");
        assert_eq!(picked[0]["label"], "Citation de la conversation");
        assert_eq!(picked[1]["text"], "réponse complète");
    }
}
