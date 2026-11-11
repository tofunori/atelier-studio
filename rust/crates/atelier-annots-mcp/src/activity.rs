//! Journal des actions de Claude par le connecteur distant, pour la page
//! « Claude » des réglages d'Atelier (« Dernières actions de Claude »).
//!
//! Une ligne JSON par appel d'outil dans
//! `$ATELIER_APP_DIR/claude-connector/activity.jsonl` : l'heure, l'outil, le
//! fichier visé et la réussite. Jamais le texte des fichiers ni les
//! arguments en entier. Le fichier est ramené aux `KEPT` dernières lignes dès
//! qu'il dépasse `MAX_BYTES`.

use serde_json::{json, Value};
use std::io::Write;
use std::path::{Path, PathBuf};

const KEPT: usize = 200;
const MAX_BYTES: u64 = 64 * 1024;

pub fn path(app_dir: &Path) -> PathBuf {
    app_dir.join("claude-connector").join("activity.jsonl")
}

/// Le fichier visé par un appel, s'il y en a un (chemin ou dossier).
fn target(args: &Value) -> Option<String> {
    ["path", "dir", "file"]
        .iter()
        .find_map(|k| args[*k].as_str().filter(|s| !s.is_empty()))
        .map(|s| s.chars().take(400).collect())
}

/// Note un appel `tools/call` et sa réponse. Une erreur d'écriture est
/// ignorée : le journal ne doit jamais faire échouer un appel.
pub fn record(app_dir: &Path, message: &Value, reply: Option<&Value>) {
    if message["method"] != "tools/call" {
        return;
    }
    let tool = message["params"]["name"].as_str().unwrap_or("").to_string();
    if tool.is_empty() {
        return;
    }
    let ok = reply
        .map(|r| r.get("error").is_none() && r["result"]["isError"] != true)
        .unwrap_or(true);
    let mut line = json!({"t": crate::oauth::now(), "tool": tool, "ok": ok});
    if let Some(path) = target(&message["params"]["arguments"]) {
        line["path"] = json!(path);
    }
    let file = path(app_dir);
    if let Some(dir) = file.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut out) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file)
    {
        let _ = writeln!(out, "{line}");
    }
    if std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0) > MAX_BYTES {
        let lines = read_lines(&file);
        let keep = &lines[lines.len().saturating_sub(KEPT)..];
        let tmp = file.with_extension("jsonl.tmp");
        if std::fs::write(&tmp, keep.join("\n") + "\n").is_ok() {
            let _ = std::fs::rename(&tmp, &file);
        }
    }
}

fn read_lines(file: &Path) -> Vec<String> {
    std::fs::read_to_string(file)
        .unwrap_or_default()
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(str::to_string)
        .collect()
}

/// Les `n` derniers appels, du plus récent au plus ancien.
pub fn recent(app_dir: &Path, n: usize) -> Vec<Value> {
    read_lines(&path(app_dir))
        .iter()
        .rev()
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .filter(|v| v["tool"].is_string())
        .take(n)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_tool_calls_only_and_keeps_the_file_small() {
        let dir = std::env::temp_dir().join(format!("atelier-activity-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        record(&dir, &json!({"method": "initialize"}), None);
        assert!(recent(&dir, 10).is_empty());
        let call = |name: &str, path: &str| json!({"method": "tools/call", "params": {"name": name, "arguments": {"path": path, "text": "secret"}}});
        record(
            &dir,
            &call("load_tex_file", "/a/main.tex"),
            Some(&json!({"result": {}})),
        );
        record(
            &dir,
            &call("compile_tex", "/a/main.tex"),
            Some(&json!({"result": {"isError": true}})),
        );
        let last = recent(&dir, 10);
        assert_eq!(last.len(), 2);
        assert_eq!(last[0]["tool"], "compile_tex");
        assert_eq!(last[0]["ok"], false);
        assert_eq!(last[1]["path"], "/a/main.tex");
        assert!(!std::fs::read_to_string(path(&dir))
            .unwrap()
            .contains("secret"));
        for i in 0..1500 {
            record(&dir, &call("save_tex_file", &format!("/a/f{i}.tex")), None);
        }
        assert!(std::fs::metadata(path(&dir)).unwrap().len() <= MAX_BYTES + 512);
        assert_eq!(recent(&dir, 1)[0]["path"], "/a/f1499.tex");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
