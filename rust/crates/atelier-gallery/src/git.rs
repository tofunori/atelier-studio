//! Phase 3 — Git + historique de versions local (parité `fig_annotate_server`).
//!
//! - Appels `git` en argv séparé, chemins après `--`, SHA validés.
//! - Snapshots locaux : `.fig_thumbs/dv_versions/<md5(realpath)>.json` (gzip + `.bak`).
//! - Format JSON consommé par `assets/diff_versions.js`.

use atelier_core::safe_project_path;
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use flate2::{Compression, read::GzDecoder, write::GzEncoder};
use md5::{Digest as Md5Digest, Md5};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest as Sha2Digest, Sha256};
use std::{
    collections::{BTreeSet, HashSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::process::Command;

use crate::{AppState, request_allowed};

const VERSION_TEXT_LIMIT: usize = 8 * 1024 * 1024;
const VERSION_SOURCES: &[&str] = &[
    "user-save",
    "external-reload",
    "external-merge",
    "external-conflict",
    "restore",
    "legacy",
];
const VERSION_STATUSES: &[&str] = &["applied", "pending-conflict"];

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async fn git_out(args: &[&str], cwd: &Path) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let output = match tokio::time::timeout(Duration::from_secs(10), cmd.output()).await {
        Ok(Ok(output)) => output,
        _ => return None,
    };
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Exit code 0 → `Some(())` (stdout discarded). Non-zero / error → `None`.
async fn git_ok(args: &[&str], cwd: &Path) -> bool {
    git_out(args, cwd).await.is_some()
}

async fn git_root_rel(path: &Path) -> Option<(PathBuf, String)> {
    let parent = path.parent().unwrap_or(path);
    let top = git_out(&["rev-parse", "--show-toplevel"], parent).await?;
    let root = PathBuf::from(top.trim());
    let rel = path
        .strip_prefix(&root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    Some((root, rel))
}

/// Dernier commit significatif (saute les « auto: … » de session).
async fn git_base(root: &Path) -> String {
    if let Some(out) = git_out(&["log", "-100", "--format=%h\t%s"], root).await {
        for line in out.lines() {
            let (sha, rest) = match line.split_once('\t') {
                Some(parts) => parts,
                None => continue,
            };
            if !sha.is_empty() && !rest.starts_with("auto: ") {
                return sha.to_string();
            }
        }
    }
    "HEAD".into()
}

fn valid_sha(sha: &str) -> bool {
    let len = sha.len();
    (4..=40).contains(&len) && sha.chars().all(|c| c.is_ascii_hexdigit())
}

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

fn ok_false() -> axum::response::Response {
    (StatusCode::OK, Json(json!({"ok": false}))).into_response()
}

// ---------------------------------------------------------------------------
// Version state (local snapshots)
// ---------------------------------------------------------------------------

fn text_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

fn valid_hash(h: &str) -> bool {
    h.len() == 64 && h.chars().all(|c| matches!(c, 'a'..='f' | '0'..='9'))
}

fn versions_file(project: &Path, path: &Path) -> PathBuf {
    let real = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let mut hasher = Md5::new();
    hasher.update(real.to_string_lossy().as_bytes());
    let key = hex::encode(hasher.finalize());
    project
        .join(".fig_thumbs")
        .join("dv_versions")
        .join(format!("{key}.json"))
}

fn empty_version_state(path: &str) -> Value {
    json!({
        "v": 2,
        "path": path,
        "revision": 0,
        "base": null,
        "texts": {},
        "interventions": [],
        "legacySnapshots": [],
        "current": null,
    })
}

/// Parité `Number(v)` côté Node / `_num_ok` Python.
fn num_ok(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::Bool(_) => false,
        Value::Number(n) => n.as_f64().is_some_and(|f| f.is_finite()),
        Value::String(s) => s.parse::<f64>().is_ok(),
        _ => false,
    }
}

fn validate_version_state(state: &Value) -> Result<(), String> {
    let obj = state
        .as_object()
        .ok_or_else(|| "invalid versions state".to_string())?;
    if obj.get("v").and_then(Value::as_i64) != Some(2) {
        return Err("invalid versions state".into());
    }
    if obj.get("path").and_then(Value::as_str).is_none() {
        return Err("invalid versions state".into());
    }
    let revision = obj
        .get("revision")
        .and_then(Value::as_i64)
        .ok_or_else(|| "invalid versions state".to_string())?;
    if revision < 0 {
        return Err("invalid versions state".into());
    }
    let texts = obj
        .get("texts")
        .and_then(Value::as_object)
        .ok_or_else(|| "invalid versions state".to_string())?;
    let interventions = obj
        .get("interventions")
        .and_then(Value::as_array)
        .ok_or_else(|| "invalid versions state".to_string())?;
    let legacy = obj
        .get("legacySnapshots")
        .and_then(Value::as_array)
        .ok_or_else(|| "invalid versions state".to_string())?;

    let mut total = 0usize;
    for (h, text) in texts {
        let Some(s) = text.as_str() else {
            return Err("invalid text hash".into());
        };
        if !valid_hash(h) || text_hash(s) != *h {
            return Err("invalid text hash".into());
        }
        total = total.saturating_add(s.len());
    }
    if total > VERSION_TEXT_LIMIT {
        return Err("versions texts too large".into());
    }

    let has_text = |h: Option<&str>| -> bool {
        h.is_some_and(|hash| valid_hash(hash) && texts.contains_key(hash))
    };

    match obj.get("base") {
        None | Some(Value::Null) => {}
        Some(base) => {
            let kind = base.get("kind").and_then(Value::as_str).unwrap_or("");
            if !has_text(base.get("hash").and_then(Value::as_str))
                || !matches!(kind, "git" | "session" | "legacy")
                || base.get("sha").and_then(Value::as_str).is_none()
                || !base.get("ts").is_some_and(num_ok)
            {
                return Err("invalid base".into());
            }
        }
    }

    match obj.get("current") {
        None | Some(Value::Null) => {}
        Some(cur) => {
            if !has_text(cur.get("hash").and_then(Value::as_str))
                || !cur.get("ts").is_some_and(num_ok)
            {
                return Err("invalid current".into());
            }
        }
    }

    let mut ids = HashSet::new();
    for item in interventions {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("");
        let source = item.get("source").and_then(Value::as_str).unwrap_or("");
        let status = item.get("status").and_then(Value::as_str).unwrap_or("");
        if id.is_empty()
            || ids.contains(id)
            || !has_text(item.get("fromHash").and_then(Value::as_str))
            || !has_text(item.get("toHash").and_then(Value::as_str))
            || !item.get("ts").is_some_and(num_ok)
            || !VERSION_SOURCES.contains(&source)
            || !VERSION_STATUSES.contains(&status)
        {
            return Err("invalid intervention".into());
        }
        ids.insert(id.to_string());
    }

    for snap in legacy {
        if !has_text(snap.get("hash").and_then(Value::as_str))
            || !snap.get("ts").is_some_and(num_ok)
            || snap.get("label").and_then(Value::as_str).is_none()
        {
            return Err("invalid legacy snapshot".into());
        }
    }
    Ok(())
}

fn migrate_version_v1(data: &Value, path: &str) -> Result<Value, String> {
    let obj = data
        .as_object()
        .ok_or_else(|| "invalid versions v1 schema".to_string())?;
    let allowed: HashSet<&str> = ["v", "path", "items", "last"].into_iter().collect();
    if obj.keys().any(|k| !allowed.contains(k.as_str())) {
        return Err("invalid versions v1 schema".into());
    }
    let v = obj.get("v").and_then(Value::as_i64).unwrap_or(1);
    if v != 1 {
        return Err("invalid versions v1 schema".into());
    }
    if let Some(p) = obj.get("path")
        && !p.is_string()
    {
        return Err("invalid versions v1 schema".into());
    }
    let items = obj
        .get("items")
        .and_then(Value::as_array)
        .ok_or_else(|| "invalid versions v1 schema".to_string())?;
    match obj.get("last") {
        None | Some(Value::Null) | Some(Value::String(_)) => {}
        _ => return Err("invalid versions v1 schema".into()),
    }
    for it in items {
        let Some(map) = it.as_object() else {
            return Err("invalid versions v1 schema".into());
        };
        if map.get("b").and_then(Value::as_str).is_none() {
            return Err("invalid versions v1 schema".into());
        }
        if let Some(t) = map.get("t")
            && !t.is_number()
        {
            return Err("invalid versions v1 schema".into());
        }
        if map.keys().any(|k| k != "b" && k != "t") {
            return Err("invalid versions v1 schema".into());
        }
    }

    let mut snaps: Vec<(String, f64, String)> = Vec::new();
    for (i, it) in items.iter().enumerate() {
        let text = it
            .get("b")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let ts = it.get("t").and_then(Value::as_f64).unwrap_or(i as f64);
        snaps.push((text, ts, format!("snapshot v1 {}", i + 1)));
    }
    if let Some(last) = obj.get("last").and_then(Value::as_str) {
        let ts = snaps.last().map(|s| s.1).unwrap_or(0.0);
        snaps.push((last.to_string(), ts, "dernier connu v1".into()));
    }

    let mut texts_map = serde_json::Map::new();
    let mut legacy_snaps = Vec::new();
    for (text, ts, label) in &snaps {
        let h = text_hash(text);
        texts_map.insert(h.clone(), json!(text));
        legacy_snaps.push(json!({"hash": h, "ts": ts, "label": label}));
    }

    let mut state = empty_version_state(path);
    {
        let obj = state.as_object_mut().unwrap();
        obj.insert("texts".into(), Value::Object(texts_map));
        obj.insert("legacySnapshots".into(), json!(legacy_snaps));
    }

    if !snaps.is_empty() {
        let first = &snaps[0];
        let first_h = text_hash(&first.0);
        let mut interventions = Vec::new();
        for i in 1..snaps.len() {
            let before = &snaps[i - 1];
            let after = &snaps[i];
            if before.0 == after.0 {
                continue;
            }
            let from = text_hash(&before.0);
            let to = text_hash(&after.0);
            interventions.push(json!({
                "id": format!("legacy-{}-{}-{}", i, &from[..8], &to[..8]),
                "fromHash": from,
                "toHash": to,
                "ts": after.1,
                "source": "legacy",
                "status": "applied",
            }));
        }
        let last = snaps.last().unwrap();
        let obj = state.as_object_mut().unwrap();
        obj.insert(
            "base".into(),
            json!({"hash": first_h, "kind": "legacy", "sha": "", "ts": first.1}),
        );
        obj.insert("interventions".into(), json!(interventions));
        obj.insert(
            "current".into(),
            json!({"hash": text_hash(&last.0), "ts": last.1}),
        );
    }
    validate_version_state(&state)?;
    Ok(state)
}

fn decode_version_bytes(raw: &[u8], path: &str) -> Result<Value, String> {
    // Python: try gzip first, fall back to plain JSON.
    let text = {
        let mut dec = GzDecoder::new(raw);
        let mut s = String::new();
        if dec.read_to_string(&mut s).is_ok() && (!s.is_empty() || raw.starts_with(&[0x1f, 0x8b])) {
            s
        } else {
            String::from_utf8_lossy(raw).into_owned()
        }
    };
    let parsed: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if parsed.get("v").and_then(Value::as_i64) == Some(2) {
        validate_version_state(&parsed)?;
        return Ok(parsed);
    }
    migrate_version_v1(&parsed, path)
}

fn read_version_state(file: &Path, path: &str) -> Result<(Value, bool), String> {
    if !file.exists() {
        let bak = PathBuf::from(format!("{}.bak", file.display()));
        return match fs::read(&bak)
            .ok()
            .and_then(|raw| decode_version_bytes(&raw, path).ok())
        {
            Some(state) => Ok((state, true)),
            None => Ok((empty_version_state(path), false)),
        };
    }
    let raw = fs::read(file).map_err(|e| e.to_string())?;
    match decode_version_bytes(&raw, path) {
        Ok(state) => Ok((state, false)),
        Err(_) => {
            let bak = PathBuf::from(format!("{}.bak", file.display()));
            let raw = fs::read(&bak).map_err(|e| e.to_string())?;
            let state = decode_version_bytes(&raw, path)?;
            Ok((state, true))
        }
    }
}

fn write_version_gzip(file: &Path, state: &Value, backup: bool) -> Result<(), String> {
    let payload = serde_json::to_vec(state).map_err(|e| e.to_string())?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&payload).map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;

    let parent = file.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let nonce = format!(
        "{}.{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let tmp = parent.join(format!(
        ".{}.{}.tmp",
        file.file_name().unwrap_or_default().to_string_lossy(),
        nonce
    ));
    fs::write(&tmp, &compressed).map_err(|e| e.to_string())?;
    if backup && file.exists() {
        let bak_tmp = parent.join(format!(
            ".{}.{}.bak.tmp",
            file.file_name().unwrap_or_default().to_string_lossy(),
            nonce
        ));
        fs::copy(file, &bak_tmp).map_err(|e| e.to_string())?;
        let bak = PathBuf::from(format!("{}.bak", file.display()));
        fs::rename(&bak_tmp, &bak).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, file).map_err(|e| e.to_string())?;
    Ok(())
}

fn add_version_texts(state: &mut Value, texts: &Value) -> Result<(), String> {
    let Some(map) = texts.as_object() else {
        return Err("invalid texts".into());
    };
    let dest = state
        .as_object_mut()
        .unwrap()
        .get_mut("texts")
        .unwrap()
        .as_object_mut()
        .unwrap();
    for (h, text) in map {
        let Some(s) = text.as_str() else {
            return Err("invalid text hash".into());
        };
        if !valid_hash(h) || text_hash(s) != *h {
            return Err("invalid text hash".into());
        }
        dest.insert(h.clone(), json!(s));
    }
    Ok(())
}

fn apply_version_ops(current: &Value, ops: &Value) -> Result<Value, String> {
    let Some(list) = ops.as_array() else {
        return Err("invalid ops".into());
    };
    if list.len() > 500 {
        return Err("invalid ops".into());
    }
    let mut state = current.clone();
    for op in list {
        let Some(map) = op.as_object() else {
            return Err("invalid op".into());
        };
        let Some(op_type) = map.get("type").and_then(Value::as_str) else {
            return Err("invalid op".into());
        };
        add_version_texts(&mut state, map.get("texts").unwrap_or(&json!({})))?;

        match op_type {
            "init" => {
                let existing_base = state.get("base").cloned().unwrap_or(Value::Null);
                let op_base = map.get("base").cloned().unwrap_or(Value::Null);
                if !existing_base.is_null() {
                    let a = serde_json::to_string(&existing_base).unwrap_or_default();
                    // sort_keys equivalent: compare canonical form loosely via Value eq after stringify with sorted keys
                    if canonical_json(&existing_base) != canonical_json(&op_base) {
                        return Err("base-conflict".into());
                    }
                    let _ = a;
                } else if !op_base.is_null() {
                    state
                        .as_object_mut()
                        .unwrap()
                        .insert("base".into(), op_base);
                }
                if let Some(cur) = map.get("current") {
                    state
                        .as_object_mut()
                        .unwrap()
                        .insert("current".into(), cur.clone());
                }
                if let Some(snaps) = map.get("legacySnapshots").and_then(Value::as_array) {
                    let legacy = state
                        .as_object_mut()
                        .unwrap()
                        .get_mut("legacySnapshots")
                        .unwrap()
                        .as_array_mut()
                        .unwrap();
                    for snap in snaps {
                        let key = canonical_json(&json!([
                            snap.get("hash"),
                            snap.get("ts"),
                            snap.get("label")
                        ]));
                        let exists = legacy.iter().any(|it| {
                            canonical_json(&json!([it.get("hash"), it.get("ts"), it.get("label")]))
                                == key
                        });
                        if !exists {
                            legacy.push(snap.clone());
                        }
                    }
                }
            }
            "append" => {
                let item = map.get("intervention").cloned().unwrap_or(Value::Null);
                let id = item.get("id").and_then(Value::as_str).unwrap_or("");
                let interventions = state
                    .as_object_mut()
                    .unwrap()
                    .get_mut("interventions")
                    .unwrap()
                    .as_array_mut()
                    .unwrap();
                if let Some(existing) = interventions
                    .iter()
                    .find(|it| it.get("id").and_then(Value::as_str) == Some(id))
                {
                    if canonical_json(existing) != canonical_json(&item) {
                        return Err("intervention-id-conflict".into());
                    }
                } else {
                    interventions.push(item);
                }
                if let Some(cur) = map.get("current") {
                    state
                        .as_object_mut()
                        .unwrap()
                        .insert("current".into(), cur.clone());
                }
            }
            "set-current" => {
                let cur = map
                    .get("current")
                    .cloned()
                    .ok_or_else(|| "invalid op".to_string())?;
                state.as_object_mut().unwrap().insert("current".into(), cur);
            }
            _ => return Err("invalid op type".into()),
        }
    }

    // Sort interventions by (ts, id)
    if let Some(arr) = state
        .as_object_mut()
        .and_then(|o| o.get_mut("interventions"))
        .and_then(Value::as_array_mut)
    {
        arr.sort_by(|a, b| {
            let ta = a
                .get("ts")
                .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|i| i as f64)))
                .unwrap_or(0.0);
            let tb = b
                .get("ts")
                .and_then(|v| v.as_f64().or_else(|| v.as_i64().map(|i| i as f64)))
                .unwrap_or(0.0);
            ta.partial_cmp(&tb)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| {
                    let ia = a.get("id").and_then(Value::as_str).unwrap_or("");
                    let ib = b.get("id").and_then(Value::as_str).unwrap_or("");
                    ia.cmp(ib)
                })
        });
    }

    // GC unreferenced texts
    let mut refs = BTreeSet::new();
    if let Some(h) = state
        .get("base")
        .and_then(|b| b.get("hash"))
        .and_then(Value::as_str)
    {
        refs.insert(h.to_string());
    }
    if let Some(h) = state
        .get("current")
        .and_then(|c| c.get("hash"))
        .and_then(Value::as_str)
    {
        refs.insert(h.to_string());
    }
    if let Some(arr) = state.get("interventions").and_then(Value::as_array) {
        for it in arr {
            if let Some(h) = it.get("fromHash").and_then(Value::as_str) {
                refs.insert(h.to_string());
            }
            if let Some(h) = it.get("toHash").and_then(Value::as_str) {
                refs.insert(h.to_string());
            }
        }
    }
    if let Some(arr) = state.get("legacySnapshots").and_then(Value::as_array) {
        for snap in arr {
            if let Some(h) = snap.get("hash").and_then(Value::as_str) {
                refs.insert(h.to_string());
            }
        }
    }
    if let Some(texts) = state
        .as_object_mut()
        .and_then(|o| o.get_mut("texts"))
        .and_then(Value::as_object_mut)
    {
        texts.retain(|h, _| refs.contains(h));
    }

    validate_version_state(&state)?;
    Ok(state)
}

/// Deterministic JSON for equality checks (sort object keys recursively).
fn canonical_json(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            let inner: Vec<String> = keys
                .into_iter()
                .map(|k| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical_json(&map[k])
                    )
                })
                .collect();
            format!("{{{}}}", inner.join(","))
        }
        Value::Array(arr) => {
            let inner: Vec<String> = arr.iter().map(canonical_json).collect();
            format!("[{}]", inner.join(","))
        }
        other => serde_json::to_string(other).unwrap_or_default(),
    }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PathQuery {
    path: Option<String>,
}

#[derive(Deserialize)]
pub struct GitShowQuery {
    path: Option<String>,
    sha: Option<String>,
}

pub async fn githead(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let path = query.path.as_deref().unwrap_or("");
    let Ok(p) = safe_project_path(&state.root, path) else {
        return ok_false();
    };
    let Some((root, rel)) = git_root_rel(&p).await else {
        return ok_false();
    };
    let base = git_base(&root).await;
    let show_arg = format!("{base}:{rel}");
    let Some(text) = git_out(&["show", &show_arg], &root).await else {
        return ok_false();
    };
    let sha = git_out(&["rev-parse", "--short", &base], &root)
        .await
        .unwrap_or_default()
        .trim()
        .to_string();
    let ts_raw = git_out(&["show", "-s", "--format=%ct", &base], &root)
        .await
        .unwrap_or_default();
    let ts = ts_raw.trim().parse::<i64>().unwrap_or(0);
    (
        StatusCode::OK,
        Json(json!({"ok": true, "text": text, "sha": sha, "ts": ts})),
    )
        .into_response()
}

pub async fn gitlog(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let path = query.path.as_deref().unwrap_or("");
    let Ok(p) = safe_project_path(&state.root, path) else {
        return ok_false();
    };
    let Some((root, rel)) = git_root_rel(&p).await else {
        return ok_false();
    };
    let Some(out) = git_out(
        &[
            "log",
            "--follow",
            "-100",
            "--format=%h\t%ct\t%s",
            "--",
            &rel,
        ],
        &root,
    )
    .await
    else {
        return ok_false();
    };
    let mut items = Vec::new();
    for line in out.lines() {
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        let sha = parts.first().copied().unwrap_or("");
        let ts = parts
            .get(1)
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);
        let msg = if parts.len() > 2 {
            parts[2..].join("\t")
        } else {
            String::new()
        };
        items.push(json!({"sha": sha, "ts": ts, "msg": msg}));
    }
    (StatusCode::OK, Json(json!({"ok": true, "items": items}))).into_response()
}

pub async fn gitshow(
    State(state): State<AppState>,
    Query(query): Query<GitShowQuery>,
) -> impl IntoResponse {
    let path = query.path.as_deref().unwrap_or("");
    let sha = query.sha.as_deref().unwrap_or("");
    let Ok(p) = safe_project_path(&state.root, path) else {
        return ok_false();
    };
    if !valid_sha(sha) {
        return ok_false();
    }
    let Some((root, rel)) = git_root_rel(&p).await else {
        return ok_false();
    };
    let show_arg = format!("{sha}:{rel}");
    let Some(text) = git_out(&["show", &show_arg], &root).await else {
        return ok_false();
    };
    (StatusCode::OK, Json(json!({"ok": true, "text": text}))).into_response()
}

pub async fn commitmsg(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(query): Json<PathQuery>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = query.path.as_deref().unwrap_or("");
    let Ok(p) = safe_project_path(&state.root, path) else {
        return ok_false();
    };
    let Some((root, rel)) = git_root_rel(&p).await else {
        return ok_false();
    };
    let base = git_base(&root).await;
    let Some(diff) = git_out(&["diff", &base, "--", &rel], &root).await else {
        return ok_false();
    };
    if diff.trim().is_empty() {
        return ok_false();
    }
    // Claude CLI optional — without it, soft-fail like Python.
    let claude = which("claude");
    let Some(claude) = claude else {
        return ok_false();
    };
    let sys_prompt = "Tu écris des messages de commit git. Réponds UNIQUEMENT avec le \
        message : une seule ligne, impérative, concise (max 72 caractères), \
        en français, sans guillemets, sans préfixe conventionnel, sans explication.";
    let input = format!(
        "Fichier : {rel}\n\nDiff :\n{}",
        &diff[..diff.len().min(8000)]
    );
    let mut cmd = Command::new(claude);
    cmd.args([
        "-p",
        "--model",
        "haiku",
        "--setting-sources",
        "user",
        "--system-prompt",
        sys_prompt,
        "--disallowedTools",
        "Bash,Edit,Write,Read,Grep,Glob,Task,WebFetch,WebSearch,NotebookEdit",
    ])
    .current_dir(&root)
    .env("MAX_THINKING_TOKENS", "0")
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return ok_false(),
    };
    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        let _ = stdin.write_all(input.as_bytes()).await;
    }
    let output = match tokio::time::timeout(Duration::from_secs(20), child.wait_with_output()).await
    {
        Ok(Ok(o)) => o,
        _ => return ok_false(),
    };
    if !output.status.success() {
        return ok_false();
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next().unwrap_or("").trim();
    let trimmed = line
        .trim_matches(|c| matches!(c, '"' | '\'' | '`'))
        .chars()
        .take(100)
        .collect::<String>();
    if trimmed.is_empty() {
        return ok_false();
    }
    (StatusCode::OK, Json(json!({"ok": true, "msg": trimmed}))).into_response()
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

#[derive(Deserialize)]
pub struct GitCommitBody {
    path: Option<String>,
    message: Option<String>,
}

pub async fn gitcommit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<GitCommitBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = body.path.as_deref().unwrap_or("");
    let msg = body.message.as_deref().unwrap_or("").trim().to_string();
    let Ok(p) = safe_project_path(&state.root, path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    if msg.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "message vide");
    }
    let Some((root, rel)) = git_root_rel(&p).await else {
        return (
            StatusCode::OK,
            Json(json!({"ok": false, "error": "hors dépôt git"})),
        )
            .into_response();
    };
    if !git_ok(&["add", "--", &rel], &root).await {
        return (
            StatusCode::OK,
            Json(json!({"ok": false, "error": "git add a échoué"})),
        )
            .into_response();
    }
    if !git_ok(&["commit", "--no-verify", "-m", &msg, "--", &rel], &root).await {
        let base = git_base(&root).await;
        // exit 0 from diff --quiet = identical → nothing to commit
        if git_ok(&["diff", "--quiet", &base, "HEAD", "--", &rel], &root).await {
            return (
                StatusCode::OK,
                Json(json!({
                    "ok": false,
                    "error": "git commit a échoué (rien à committer ?)"
                })),
            )
                .into_response();
        }
        return (
            StatusCode::OK,
            Json(json!({"ok": false, "error": "git commit ciblé a échoué"})),
        )
            .into_response();
    }
    let sha = git_out(&["rev-parse", "--short", "HEAD"], &root)
        .await
        .unwrap_or_default()
        .trim()
        .to_string();
    (StatusCode::OK, Json(json!({"ok": true, "sha": sha}))).into_response()
}

pub async fn get_versions(
    State(state): State<AppState>,
    Query(query): Query<PathQuery>,
) -> impl IntoResponse {
    let path = query.path.as_deref().unwrap_or("");
    let Ok(p) = safe_project_path(&state.root, path) else {
        return ok_false();
    };
    let path_str = p.to_string_lossy().to_string();
    let file = versions_file(&state.root, &p);
    let (state_val, recovered) = match read_version_state(&file, &path_str) {
        Ok(v) => v,
        Err(_) => return ok_false(),
    };
    if recovered {
        let _ = write_version_gzip(&file, &state_val, false);
    } else if file.exists()
        && let Ok(raw) = fs::read(&file)
        && raw.get(..2) != Some(&[0x1f, 0x8b])
    {
        let _ = write_version_gzip(&file, &state_val, true);
    }
    let mut out = state_val;
    if let Some(obj) = out.as_object_mut() {
        obj.insert("ok".into(), json!(true));
    }
    (StatusCode::OK, Json(out)).into_response()
}

pub async fn post_versions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    // Payload size: rely on content-length if present; axum also bounds bodies.
    if let Some(len) = headers
        .get(axum::http::header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<usize>().ok())
        && len > 8 * 1024 * 1024
    {
        return json_error(StatusCode::BAD_REQUEST, "payload too large");
    }
    let path = body.get("path").and_then(Value::as_str).unwrap_or("");
    let Ok(p) = safe_project_path(&state.root, path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let path_str = p.to_string_lossy().to_string();
    let file = versions_file(&state.root, &p);
    let (current, _) = match read_version_state(&file, &path_str) {
        Ok(v) => v,
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    };
    let expected = body.get("expectedRevision").and_then(Value::as_i64);
    let revision = current.get("revision").and_then(Value::as_i64).unwrap_or(0);
    if expected != Some(revision) {
        return (
            StatusCode::CONFLICT,
            Json(json!({
                "ok": false,
                "error": "revision-conflict",
                "revision": revision,
                "state": current,
            })),
        )
            .into_response();
    }
    let ops = body.get("ops").cloned().unwrap_or(json!([]));
    let mut nxt = match apply_version_ops(&current, &ops) {
        Ok(v) => v,
        Err(error) => {
            return json_error(StatusCode::BAD_REQUEST, format!("bad request: {error}"));
        }
    };
    if let Some(obj) = nxt.as_object_mut() {
        obj.insert("path".into(), json!(path_str));
        obj.insert("revision".into(), json!(revision + 1));
    }
    if let Err(error) = validate_version_state(&nxt) {
        return json_error(StatusCode::BAD_REQUEST, format!("bad request: {error}"));
    }
    if file.exists()
        && let Ok(raw) = fs::read(&file)
        && decode_version_bytes(&raw, &path_str).is_err()
    {
        let _ = fs::remove_file(&file);
    }
    if let Err(error) = write_version_gzip(&file, &nxt, true) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error);
    }
    (
        StatusCode::OK,
        Json(json!({"ok": true, "revision": revision + 1})),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_hash_is_sha256_hex() {
        let h = text_hash("hello");
        assert_eq!(h.len(), 64);
        assert!(valid_hash(&h));
        assert!(!valid_hash("not-a-hash"));
    }

    #[test]
    fn empty_state_validates() {
        let state = empty_version_state("/tmp/x.py");
        assert!(validate_version_state(&state).is_ok());
    }

    #[test]
    fn sha_validation() {
        assert!(valid_sha("abcd"));
        assert!(valid_sha("0123456789abcdef"));
        assert!(!valid_sha("abc")); // too short
        assert!(!valid_sha("../x"));
        assert!(!valid_sha("HEAD"));
    }

    #[test]
    fn apply_empty_ops_bumps_via_caller() {
        let current = empty_version_state("/tmp/x.py");
        let nxt = apply_version_ops(&current, &json!([])).unwrap();
        assert_eq!(nxt["revision"], 0); // caller bumps
        assert!(validate_version_state(&nxt).is_ok());
    }
}
