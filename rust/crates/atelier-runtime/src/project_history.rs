//! Historique du projet (2026-11-09, variante A choisie par Thierry) : un
//! seul fil du temps qui rassemble, sans rien migrer,
//! - les tours de l'agent qui ont modifié des fichiers (journal des tours,
//!   `ledger/`, avec leur point de reprise Git) ;
//! - tes séances d'écriture (versions des éditeurs de la galerie,
//!   `.fig_thumbs/dv_versions/`, sauvegardes regroupées par séance) ;
//! - les commits de la branche courante ;
//! - les versions nommées et les restaurations (refs privées, voir
//!   `atelier_workspace::history`).
//!
//! Chaque fichier d'une entrée porte deux références (`before`, `after`) que
//! `projectHistoryDiff` résout en texte à la demande : la liste reste légère.

use crate::state::AppState;
use crate::ws_router::json_msg;
use atelier_workspace::HistoryText;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Deux sauvegardes séparées de plus de 30 min ouvrent une nouvelle séance.
const SESSION_GAP_MS: i64 = 30 * 60 * 1000;
const MAX_ENTRIES: usize = 400;
const MAX_VERSION_FILES: usize = 400;

fn root_of(msg: &Value) -> String {
    msg.get("projectRoot")
        .or_else(|| msg.get("root"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

pub async fn handle(state: &AppState, msg_type: &str, msg: &Value) -> Vec<String> {
    let root = root_of(msg);
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    match msg_type {
        "projectHistory" => {
            let ledger = atelier_store::get_ledger(&state.ledger_dir(), &root, MAX_ENTRIES);
            let r = root.clone();
            let entries = crate::ws_dispatch::blocking(move || build_history(&r, &ledger))
                .await
                .unwrap_or_else(|e| Err(e.to_string()));
            match entries {
                Ok((entries, repo)) => vec![json_msg(json!({
                    "type": "projectHistory", "projectRoot": root, "requestId": request_id,
                    "entries": entries, "repo": repo,
                }))],
                Err(error) => vec![json_msg(json!({
                    "type": "projectHistory", "projectRoot": root, "requestId": request_id,
                    "entries": [], "error": error,
                }))],
            }
        }
        "projectHistoryDiff" => {
            let path = msg.get("path").and_then(Value::as_str).unwrap_or("").to_string();
            let before = msg.get("before").cloned().unwrap_or(Value::Null);
            let after = msg.get("after").cloned().unwrap_or(Value::Null);
            let before_end = turn_end_tree(state, &before).await;
            let after_end = turn_end_tree(state, &after).await;
            let (r, p) = (root.clone(), path.clone());
            let result = crate::ws_dispatch::blocking(move || {
                let b = resolve(&r, &p, &before, before_end.as_deref())?;
                let a = resolve(&r, &p, &after, after_end.as_deref())?;
                Ok::<_, String>((b, a))
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
            match result {
                Ok((before, after)) => vec![json_msg(json!({
                    "type": "projectHistoryDiff", "projectRoot": root, "requestId": request_id,
                    "path": path, "before": text_json(&before), "after": text_json(&after),
                }))],
                Err(error) => vec![json_msg(json!({
                    "type": "projectHistoryDiff", "projectRoot": root, "requestId": request_id,
                    "path": path, "error": error,
                }))],
            }
        }
        "projectHistoryCompare" => {
            let from = msg.get("from").and_then(Value::as_str).unwrap_or("").to_string();
            let to = msg.get("to").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string);
            let r = root.clone();
            let result = crate::ws_dispatch::blocking(move || {
                atelier_workspace::history_compare(&r, &from, to.as_deref()).map_err(|e| e.to_string())
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
            match result {
                Ok((files, to_tree)) => vec![json_msg(json!({
                    "type": "projectHistoryCompare", "projectRoot": root, "requestId": request_id,
                    "files": files, "toTree": to_tree,
                }))],
                Err(error) => vec![json_msg(json!({
                    "type": "projectHistoryCompare", "projectRoot": root, "requestId": request_id,
                    "files": [], "error": error,
                }))],
            }
        }
        "projectHistoryRestore" => {
            let path = msg.get("path").and_then(Value::as_str).unwrap_or("").to_string();
            let reference = msg.get("ref").cloned().unwrap_or(Value::Null);
            let label = msg.get("label").and_then(Value::as_str).unwrap_or("").to_string();
            let end = turn_end_tree(state, &reference).await;
            let (r, p) = (root.clone(), path.clone());
            let result = crate::ws_dispatch::blocking(move || {
                match resolve(&r, &p, &reference, end.as_deref())? {
                    HistoryText::Text(text) => atelier_workspace::restore_history_text(&r, &p, &text, &label)
                        .map_err(|e| e.to_string()),
                    HistoryText::Missing => Err("missing".into()),
                    HistoryText::Binary => Err("binary".into()),
                    HistoryText::TooLarge => Err("large".into()),
                }
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
            let reply = match result {
                Ok(restore) => json!({"type":"projectHistoryRestored","projectRoot":root,"requestId":request_id,
                    "ok":true,"path":path,"restore":restore}),
                Err(error) => json!({"type":"projectHistoryRestored","projectRoot":root,"requestId":request_id,
                    "ok":false,"path":path,"error":error}),
            };
            vec![json_msg(reply)]
        }
        "projectHistorySaveVersion" => {
            let name = msg.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let r = root.clone();
            let result = crate::ws_dispatch::blocking(move || {
                atelier_workspace::save_history_version(&r, &name).map_err(|e| e.to_string())
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
            let reply = match result {
                Ok(version) => json!({"type":"projectHistoryVersionSaved","projectRoot":root,"requestId":request_id,
                    "ok":true,"version":version}),
                Err(error) => json!({"type":"projectHistoryVersionSaved","projectRoot":root,"requestId":request_id,
                    "ok":false,"error":error}),
            };
            vec![json_msg(reply)]
        }
        "projectHistoryDeleteVersion" => {
            let sha = msg.get("sha").and_then(Value::as_str).unwrap_or("").to_string();
            let r = root.clone();
            let result = crate::ws_dispatch::blocking(move || {
                atelier_workspace::delete_history_version(&r, &sha).map_err(|e| e.to_string())
            })
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
            vec![json_msg(json!({"type":"projectHistoryVersionDeleted","projectRoot":root,"requestId":request_id,
                "ok":result.is_ok(),"error":result.err()}))]
        }
        _ => Vec::new(),
    }
}

fn text_json(text: &HistoryText) -> Value {
    match text {
        HistoryText::Text(t) => json!({"state":"text","text":t}),
        HistoryText::Missing => json!({"state":"missing"}),
        HistoryText::Binary => json!({"state":"binary"}),
        HistoryText::TooLarge => json!({"state":"large"}),
    }
}

fn valid_hex(value: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&value.len()) && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Arbre de fin d'un tour ancien (antérieur à `endTree` dans le journal des
/// tours) : relu dans le `done` du fil qui porte son point de reprise.
async fn turn_end_tree(state: &AppState, reference: &Value) -> Option<String> {
    let turn = reference.get("turn")?;
    if let Some(end) = turn.get("end").and_then(Value::as_str).filter(|s| valid_hex(s, 4, 64)) {
        return Some(end.to_string());
    }
    let thread_id = turn.get("threadId").and_then(Value::as_str)?;
    let sha = turn.get("sha").and_then(Value::as_str)?;
    let turn_id = turn.get("turnId").and_then(Value::as_str);
    if thread_id.is_empty() || !valid_hex(sha, 4, 64) {
        return None;
    }
    let events = state.journal().materialize(thread_id);
    events
        .iter()
        .find(|event| {
            event.get("kind").and_then(Value::as_str) == Some("done")
                && event.pointer("/checkpoint/snapshotSha").and_then(Value::as_str) == Some(sha)
                && turn_id.is_none_or(|turn| {
                    event.pointer("/meta/turnId").and_then(Value::as_str).is_none_or(|t| t == turn)
                })
        })
        .and_then(|event| event.pointer("/checkpoint/endTree").and_then(Value::as_str))
        .map(str::to_string)
}

/// Résout une référence d'entrée en contenu de fichier.
fn resolve(root: &str, path: &str, reference: &Value, turn_end: Option<&str>) -> Result<HistoryText, String> {
    let err = |e: atelier_workspace::GitError| e.to_string();
    if reference.is_null() || reference.get("empty").is_some() {
        return Ok(HistoryText::Missing);
    }
    if reference.get("disk").is_some() {
        return atelier_workspace::history_read_disk(root, path).map_err(err);
    }
    if let Some(sha) = reference.get("git").and_then(Value::as_str) {
        if !atelier_workspace::history_object_exists(root, sha) {
            return Err("pruned".into());
        }
        return atelier_workspace::history_read(root, sha, path).map_err(err);
    }
    if let Some(turn) = reference.get("turn") {
        // Fin de tour connue et encore présente, sinon le point de reprise du
        // tour suivant, sinon le fichier tel qu'il est.
        let next = turn.get("next").and_then(Value::as_str);
        let end = turn.get("end").and_then(Value::as_str);
        for sha in [turn_end.or(end), next].into_iter().flatten() {
            if atelier_workspace::history_object_exists(root, sha) {
                return atelier_workspace::history_read(root, sha, path).map_err(err);
            }
        }
        return atelier_workspace::history_read_disk(root, path).map_err(err);
    }
    if let Some(saved) = reference.get("saved") {
        let key = saved.get("key").and_then(Value::as_str).unwrap_or("");
        let hash = saved.get("hash").and_then(Value::as_str).unwrap_or("");
        if !valid_hex(key, 32, 32) || !valid_hex(hash, 64, 64) {
            return Err("ref invalide".into());
        }
        let (base, _) = atelier_workspace::history_base(root).map_err(err)?;
        let file = versions_dir(&base).join(format!("{key}.json"));
        let state = read_versions(&file).ok_or_else(|| "versions illisibles".to_string())?;
        return Ok(match state.pointer(&format!("/texts/{hash}")).and_then(Value::as_str) {
            Some(text) if text.len() > atelier_workspace::HISTORY_TEXT_LIMIT => HistoryText::TooLarge,
            Some(text) => HistoryText::Text(text.to_string()),
            None => HistoryText::Missing,
        });
    }
    Err("ref inconnue".into())
}

fn versions_dir(base: &Path) -> PathBuf {
    base.join(".fig_thumbs").join("dv_versions")
}

/// Journal de versions d'un éditeur de la galerie : gzip (actuel) ou JSON
/// brut (ancien), même lecture que `atelier-gallery`.
fn read_versions(file: &Path) -> Option<Value> {
    use std::io::Read;
    let raw = std::fs::read(file).ok()?;
    let text = if raw.starts_with(&[0x1f, 0x8b]) {
        let mut decoder = flate2::read::GzDecoder::new(&raw[..]);
        let mut s = String::new();
        decoder.read_to_string(&mut s).ok()?;
        s
    } else {
        String::from_utf8(raw).ok()?
    };
    let value: Value = serde_json::from_str(&text).ok()?;
    (value.get("v").and_then(Value::as_i64) == Some(2)).then_some(value)
}

fn iso_ms(value: Option<&Value>) -> Option<i64> {
    let s = value?.as_str()?;
    chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis())
}

fn num_ms(value: Option<&Value>) -> Option<i64> {
    match value? {
        Value::Number(n) => n.as_f64().map(|f| f as i64),
        Value::String(s) => s.parse::<f64>().ok().map(|f| f as i64),
        _ => None,
    }
}

fn first_line(text: &str, max: usize) -> String {
    let line = text.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let mut out: String = line.chars().take(max).collect();
    if line.chars().count() > max {
        out.push('…');
    }
    out
}

/// Construit le fil du temps, du plus récent au plus ancien. Le booléen dit
/// si le projet est un dépôt Git (sans dépôt : ni versions ni restauration).
pub fn build_history(root: &str, ledger: &[Value]) -> Result<(Vec<Value>, bool), String> {
    if root.is_empty() {
        return Err("projet requis".into());
    }
    let (base, _) = atelier_workspace::history_base(root).map_err(|e| e.to_string())?;
    let repo = atelier_workspace::is_repo(root);
    let mut entries: Vec<(i64, Value)> = Vec::new();

    // Tours de l'agent. Le point de reprise du tour suivant sert de « après »
    // quand le journal ne porte pas l'arbre de fin (tours d'avant 2026-11-09).
    let mut starts: Vec<(i64, String)> = ledger
        .iter()
        .filter_map(|e| {
            let sha = e.get("snapshotSha").and_then(Value::as_str)?;
            let ts = iso_ms(e.get("startedAt")).or_else(|| iso_ms(e.get("ts")))?;
            Some((ts, sha.to_string()))
        })
        .collect();
    starts.sort();
    for e in ledger {
        let Some(sha) = e.get("snapshotSha").and_then(Value::as_str).filter(|s| valid_hex(s, 4, 64)) else {
            continue;
        };
        let changed: Vec<String> = e
            .get("filesChanged")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default();
        if changed.is_empty() {
            continue;
        }
        let Some(ts) = iso_ms(e.get("endedAt")).or_else(|| iso_ms(e.get("ts"))) else { continue };
        let stats: HashMap<String, (Value, Value)> = e
            .get("fileStats")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|s| {
                        Some((s.get("path")?.as_str()?.to_string(),
                            (s.get("add").cloned().unwrap_or(Value::Null), s.get("del").cloned().unwrap_or(Value::Null))))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let end_tree = e.get("endTree").and_then(Value::as_str).filter(|s| valid_hex(s, 4, 64));
        let thread_id = e.get("threadId").and_then(Value::as_str).unwrap_or("");
        let turn_id = e.get("turnId").and_then(Value::as_str).unwrap_or("");
        let next = starts.iter().find(|(start, s)| *start >= ts && s != sha).map(|(_, s)| s.clone());
        let after = json!({"turn": {"threadId": thread_id, "turnId": turn_id, "sha": sha, "end": end_tree, "next": next}});
        let files: Vec<Value> = changed
            .iter()
            .map(|path| {
                let (add, del) = stats.get(path).cloned().unwrap_or((Value::Null, Value::Null));
                json!({"path": path, "add": add, "del": del, "before": {"git": sha}, "after": after})
            })
            .collect();
        let prompt = e.get("promptExcerpt").and_then(Value::as_str).unwrap_or("");
        let thread_title = e.get("threadTitle").and_then(Value::as_str).unwrap_or("");
        entries.push((ts, json!({
            "id": format!("turn:{thread_id}:{turn_id}:{sha}"),
            "kind": "turn",
            "ts": ts,
            "title": first_line(if prompt.trim().is_empty() { thread_title } else { prompt }, 120),
            "threadId": thread_id,
            "threadTitle": thread_title,
            "provider": e.get("provider"),
            "model": e.get("model"),
            "status": e.get("status"),
            "snapshot": sha,
            "files": files,
        })));
    }

    entries.extend(edit_sessions(&base, root));

    if repo {
        if let Ok(commits) = atelier_workspace::history_commits(root, 120) {
            for c in commits {
                let files: Vec<Value> = c
                    .files
                    .iter()
                    .map(|f| json!({"path": f.path, "add": f.add, "del": f.del,
                        "before": c.parent.as_ref().map(|p| json!({"git": p})).unwrap_or(json!({"empty": true})),
                        "after": {"git": c.sha}}))
                    .collect();
                entries.push((c.ts, json!({
                    "id": format!("commit:{}", c.sha), "kind": "commit", "ts": c.ts,
                    "title": c.subject, "sha": c.sha, "shortSha": c.short_sha, "author": c.author,
                    "files": files,
                })));
            }
        }
        if let Ok(versions) = atelier_workspace::history_versions(root) {
            for v in versions {
                let files: Vec<Value> = v
                    .files
                    .iter()
                    .take(MAX_VERSION_FILES)
                    .map(|f| json!({"path": f.path, "add": f.add, "del": f.del,
                        "before": v.previous.as_ref().map(|p| json!({"git": p})).unwrap_or(json!({"empty": true})),
                        "after": {"git": v.sha}}))
                    .collect();
                entries.push((v.ts, json!({
                    "id": format!("version:{}", v.sha), "kind": "version", "ts": v.ts,
                    "title": v.name, "sha": v.sha, "fileCount": v.files.len(), "files": files,
                })));
            }
        }
        if let Ok(restores) = atelier_workspace::history_restores(root) {
            for r in restores {
                entries.push((r.ts, json!({
                    "id": format!("restore:{}", r.sha), "kind": "restore", "ts": r.ts,
                    "title": r.label, "sha": r.sha,
                    "files": [{"path": r.path, "add": null, "del": null,
                        "before": {"git": r.before}, "after": {"git": r.sha}}],
                })));
            }
        }
    }

    entries.sort_by_key(|b| std::cmp::Reverse(b.0));
    entries.truncate(MAX_ENTRIES);
    Ok((entries.into_iter().map(|(_, v)| v).collect(), repo))
}

struct Save {
    ts: i64,
    key: String,
    path: String,
    from: String,
    to: String,
}

/// Tes sauvegardes dans les éditeurs, regroupées en séances : une entrée par
/// séance, un fichier par document touché, du premier état au dernier.
fn edit_sessions(base: &Path, root: &str) -> Vec<(i64, Value)> {
    let dir = versions_dir(base);
    let Ok(read) = std::fs::read_dir(&dir) else { return Vec::new() };
    let canon_base = std::fs::canonicalize(base).unwrap_or_else(|_| base.to_path_buf());
    let canon_root = std::fs::canonicalize(root).unwrap_or_else(|_| PathBuf::from(root));
    let mut saves: Vec<Save> = Vec::new();
    let mut texts: HashMap<String, HashMap<String, String>> = HashMap::new();
    for item in read.flatten() {
        let file = item.path();
        let Some(key) = file
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_suffix(".json"))
            .filter(|k| valid_hex(k, 32, 32))
            .map(str::to_string)
        else {
            continue;
        };
        let Some(state) = read_versions(&file) else { continue };
        let Some(abs) = state.get("path").and_then(Value::as_str) else { continue };
        let abs = PathBuf::from(abs);
        let abs = if abs.is_absolute() { abs } else { canon_root.join(abs) };
        let abs = std::fs::canonicalize(&abs).unwrap_or(abs);
        let Ok(rel) = abs.strip_prefix(&canon_base) else { continue };
        let rel = rel.to_string_lossy().replace('\\', "/");
        let mut used = false;
        for item in state.get("interventions").and_then(Value::as_array).into_iter().flatten() {
            let source = item.get("source").and_then(Value::as_str).unwrap_or("");
            if source != "user-save" && source != "restore" {
                continue;
            }
            let (Some(from), Some(to), Some(ts)) = (
                item.get("fromHash").and_then(Value::as_str),
                item.get("toHash").and_then(Value::as_str),
                num_ms(item.get("ts")),
            ) else {
                continue;
            };
            used = true;
            saves.push(Save { ts, key: key.clone(), path: rel.clone(), from: from.into(), to: to.into() });
        }
        if used {
            let map = state
                .get("texts")
                .and_then(Value::as_object)
                .map(|m| m.iter().filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string()))).collect())
                .unwrap_or_default();
            texts.insert(key, map);
        }
    }
    saves.sort_by_key(|s| s.ts);
    let mut sessions: Vec<Vec<Save>> = Vec::new();
    for save in saves {
        match sessions.last_mut() {
            Some(current) if save.ts - current.last().map(|s| s.ts).unwrap_or(0) <= SESSION_GAP_MS => current.push(save),
            _ => sessions.push(vec![save]),
        }
    }
    sessions
        .into_iter()
        .filter_map(|session| {
            let start = session.first()?.ts;
            let end = session.last()?.ts;
            // Par fichier : premier état d'origine, dernier état écrit.
            let mut per_file: Vec<(String, String, String, String, usize)> = Vec::new();
            for save in &session {
                match per_file.iter_mut().find(|f| f.0 == save.path) {
                    Some(f) => {
                        f.3 = save.to.clone();
                        f.4 += 1;
                    }
                    None => per_file.push((save.path.clone(), save.key.clone(), save.from.clone(), save.to.clone(), 1)),
                }
            }
            per_file.sort_by(|a, b| a.0.cmp(&b.0));
            let files: Vec<Value> = per_file
                .iter()
                .filter(|(_, _, from, to, _)| from != to)
                .map(|(path, key, from, to, count)| {
                    let file_texts = texts.get(key);
                    let (add, del) = match (file_texts.and_then(|t| t.get(from)), file_texts.and_then(|t| t.get(to))) {
                        (Some(a), Some(b)) => line_churn(a, b).map(|(x, y)| (json!(x), json!(y))).unwrap_or((Value::Null, Value::Null)),
                        _ => (Value::Null, Value::Null),
                    };
                    json!({"path": path, "add": add, "del": del, "saves": count,
                        "before": {"saved": {"key": key, "hash": from}},
                        "after": {"saved": {"key": key, "hash": to}}})
                })
                .collect();
            if files.is_empty() {
                return None;
            }
            Some((end, json!({
                "id": format!("edit:{start}"), "kind": "edit", "ts": end, "start": start,
                "saves": session.len(), "title": "", "files": files,
            })))
        })
        .collect()
}

/// Lignes ajoutées et retirées entre deux textes (Myers, plus court chemin
/// d'édition). `None` si les textes divergent trop pour un calcul rapide.
pub fn line_churn(a: &str, b: &str) -> Option<(usize, usize)> {
    let a: Vec<&str> = a.lines().collect();
    let b: Vec<&str> = b.lines().collect();
    let prefix = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let suffix = a[prefix..].iter().rev().zip(b[prefix..].iter().rev()).take_while(|(x, y)| x == y).count();
    let a = &a[prefix..a.len() - suffix];
    let b = &b[prefix..b.len() - suffix];
    let (n, m) = (a.len() as isize, b.len() as isize);
    if n == 0 || m == 0 {
        return Some((m as usize, n as usize));
    }
    let max = (n + m).min(4000);
    let offset = max;
    let mut v = vec![0isize; (2 * max + 2) as usize];
    for d in 0..=max {
        let mut k = -d;
        while k <= d {
            let idx = (k + offset) as usize;
            let mut x = if k == -d || (k != d && v[idx - 1] < v[idx + 1]) { v[idx + 1] } else { v[idx - 1] + 1 };
            let mut y = x - k;
            while x < n && y < m && a[x as usize] == b[y as usize] {
                x += 1;
                y += 1;
            }
            v[idx] = x;
            if x >= n && y >= m {
                // d = ajouts + retraits, et n - m = retraits - ajouts.
                let del = ((d + n - m) / 2) as usize;
                let add = ((d - n + m) / 2) as usize;
                return Some((add, del));
            }
            k += 2;
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::process::Command;

    #[test]
    fn churn_compte_les_lignes() {
        assert_eq!(line_churn("a\nb\nc\n", "a\nb\nc\n"), Some((0, 0)));
        assert_eq!(line_churn("a\nb\nc\n", "a\nB\nc\nd\n"), Some((2, 1)));
        assert_eq!(line_churn("", "x\ny\n"), Some((2, 0)));
        assert_eq!(line_churn("x\ny\n", ""), Some((0, 2)));
        assert_eq!(line_churn("a\nb\nc\nd\n", "b\nd\ne\n"), Some((1, 2)));
    }

    fn sha(text: &str) -> String {
        use sha2::{Digest, Sha256};
        hex::encode(Sha256::digest(text.as_bytes()))
    }

    fn write_versions(root: &Path, file: &str, saves: &[(&str, &str, i64)]) {
        let dir = root.join(".fig_thumbs").join("dv_versions");
        std::fs::create_dir_all(&dir).unwrap();
        let mut texts = serde_json::Map::new();
        let interventions: Vec<Value> = saves
            .iter()
            .enumerate()
            .map(|(i, (from, to, ts))| {
                texts.insert(sha(from), json!(from));
                texts.insert(sha(to), json!(to));
                json!({"id": format!("i{i}"), "source": "user-save", "status": "applied",
                    "fromHash": sha(from), "toHash": sha(to), "ts": ts})
            })
            .collect();
        let state = json!({"v": 2, "path": root.join(file).to_string_lossy(), "revision": 1, "base": null,
            "texts": texts, "interventions": interventions, "legacySnapshots": [], "current": null, "review": {}});
        let key = format!("{:032x}", file.len() as u128 * 7919);
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(state.to_string().as_bytes()).unwrap();
        std::fs::write(dir.join(format!("{key}.json")), enc.finish().unwrap()).unwrap();
    }

    #[test]
    fn le_fil_rassemble_tours_seances_commits_et_versions() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let git = |args: &[&str]| {
            assert!(Command::new("git").args(args).current_dir(&root)
                .env("GIT_AUTHOR_NAME", "T").env("GIT_AUTHOR_EMAIL", "t@t")
                .env("GIT_COMMITTER_NAME", "T").env("GIT_COMMITTER_EMAIL", "t@t")
                .status().unwrap().success());
        };
        git(&["init", "-q"]);
        std::fs::write(root.join("main.tex"), "a\nb\n").unwrap();
        git(&["add", "main.tex"]);
        git(&["commit", "-q", "-m", "premier"]);
        let r = root.to_string_lossy().to_string();
        let snap = atelier_workspace::snapshot(&r).unwrap();
        std::fs::write(root.join("main.tex"), "a\nB\nc\n").unwrap();
        let (_, end_tree) = atelier_workspace::changed_since_stats_and_tree(&r, &snap).unwrap();
        // Deux séances : 10 h 00 et 10 h 10 ensemble, 12 h 00 à part.
        let h = 3_600_000i64;
        write_versions(&root, "methods.tex", &[("x\n", "x\ny\n", 10 * h), ("x\ny\n", "x\nz\n", 10 * h + 600_000), ("x\nz\n", "w\n", 12 * h)]);
        atelier_workspace::save_history_version(&r, "Envoyé à Christophe").unwrap();
        let ledger = vec![json!({
            "ts": "2026-11-09T14:32:00Z", "startedAt": "2026-11-09T14:30:00Z", "endedAt": "2026-11-09T14:32:00Z",
            "threadId": "t1", "turnId": "u1", "threadTitle": "Relire la discussion", "provider": "codex",
            "promptExcerpt": "\n  Corrige le chiffre de 40 %\nmerci", "filesChanged": ["main.tex"],
            "fileStats": [{"path": "main.tex", "add": 2, "del": 1}], "snapshotSha": snap, "endTree": end_tree,
        }), json!({"ts": "2026-11-09T14:40:00Z", "threadId": "t1", "turnId": "u2", "filesChanged": [], "snapshotSha": snap})];
        let (entries, repo) = build_history(&r, &ledger).unwrap();
        assert!(repo);
        let kinds: Vec<&str> = entries.iter().map(|e| e["kind"].as_str().unwrap()).collect();
        assert_eq!(kinds.iter().filter(|k| **k == "edit").count(), 2, "{kinds:?}");
        for kind in ["turn", "commit", "version"] {
            assert_eq!(kinds.iter().filter(|k| **k == kind).count(), 1, "{kind} dans {kinds:?}");
        }
        // Plus récent en tête.
        let ts: Vec<i64> = entries.iter().map(|e| e["ts"].as_i64().unwrap()).collect();
        assert!(ts.windows(2).all(|w| w[0] >= w[1]));
        let turn = entries.iter().find(|e| e["kind"] == "turn").unwrap();
        assert_eq!(turn["title"], "Corrige le chiffre de 40 %");
        assert_eq!(turn["files"][0]["add"], 2);
        let file = &turn["files"][0];
        let before = resolve(&r, "main.tex", &file["before"], None).unwrap();
        let after = resolve(&r, "main.tex", &file["after"], None).unwrap();
        assert_eq!(before, HistoryText::Text("a\nb\n".into()));
        assert_eq!(after, HistoryText::Text("a\nB\nc\n".into()));
        let first_session = entries.iter().filter(|e| e["kind"] == "edit").next_back().unwrap();
        assert_eq!(first_session["saves"], 2);
        let f = &first_session["files"][0];
        assert_eq!(f["path"], "methods.tex");
        assert_eq!((f["add"].as_i64(), f["del"].as_i64()), (Some(1), Some(0)));
        assert_eq!(resolve(&r, "methods.tex", &f["before"], None).unwrap(), HistoryText::Text("x\n".into()));
        assert_eq!(resolve(&r, "methods.tex", &f["after"], None).unwrap(), HistoryText::Text("x\nz\n".into()));
        assert_eq!(resolve(&r, "main.tex", &json!({"disk": true}), None).unwrap(), HistoryText::Text("a\nB\nc\n".into()));
        assert!(resolve(&r, "main.tex", &json!({"saved": {"key": "../x", "hash": "00"}}), None).is_err());
    }
}
