//! Controlled Node↔Rust comparison helpers (plan 033 Porte 9).
//!
//! Read-only corpus only — never send / git mutate / generateImage / delete
//! through the dual-runner. Normalization strips free fields (pid, port,
//! timestamps, absolute paths under app support).

use serde_json::{json, Value};
use std::collections::BTreeMap;

/// WS message types that must never be dual-executed against live backends.
pub const MUTATING_TYPES: &[&str] = &[
    "send",
    "interrupt",
    "saveSettings",
    "saveImage",
    "generateImage",
    "clearPasted",
    "saveApiProvider",
    "deleteApiProvider",
    "gitStage",
    "gitUnstage",
    "gitRevertFile",
    "gitCommit",
    "gitPush",
    "gitPull",
    "gitIgnore",
    "gitUndoLastTurn",
    "gitCreateBranchAt",
    "gitRestoreFileFromCommit",
    "gitRevertCommit",
    "gitUndoCommit",
    "gitResetToCommit",
    "gitFetch",
    "deleteThread",
    "renameThread",
    "moveThread",
    "upsertThread",
    "addHighlight",
    "removeHighlight",
    "importSession",
    "forkThread",
    "revert",
    "retitleAll",
    "qaPromote",
    "codexCompact",
    "codexClear",
    "goalSet",
    "goalClear",
    "permissionResponse",
    "interactionResponse",
    "zoteroFav",
    "zoteroAddPdf",
    "termOpen",
    "termInput",
    "termResize",
    "termClose",
    "exportThread",
    "quickAsk",
    "requestReview",
    "generateCommitMsg",
];

/// Read-only WS probes for shape parity (safe to fire twice).
pub fn read_only_corpus() -> Vec<Value> {
    vec![
        json!({"type":"ping"}),
        json!({"type":"status"}),
        json!({"type":"providerStatus"}),
        json!({"type":"setupStatus"}),
        json!({"type":"listThreads"}),
        json!({"type":"listHighlights"}),
        json!({"type":"getSettings"}),
        json!({"type":"apiProviders"}),
        json!({"type":"listPasted"}),
        json!({"type":"getUsage"}),
        json!({"type":"listCommands","projectRoot":"/tmp"}),
        json!({"type":"listFiles","projectRoot":"/tmp"}),
        json!({"type":"getLedger","projectRoot":"/tmp","limit":5}),
        json!({"type":"getHistory","threadId":"__parity_missing__"}),
        json!({"type":"listSessions","provider":"claude","projectRoot":"/tmp"}),
        json!({"type":"scanLocal"}),
        json!({"type":"checkFrame","url":"http://127.0.0.1:9/"}),
        // zotero / git depend on host state — still in corpus for dual-runner
        // but unit test allows error shapes.
        json!({"type":"zoteroCollections"}),
        json!({"type":"zoteroSearch","query":"","limit":1}),
        json!({"type":"clientLog","note":"parity"}),
        json!({"type":"clientHello","clientInstanceId":"00000000-0000-4000-8000-000000000001"}),
    ]
}

/// Strip fields allowed to diverge between Node and Rust.
pub fn normalize_for_compare(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut out = BTreeMap::new();
            for (k, val) in map {
                if FREE_KEYS.contains(&k.as_str()) {
                    continue;
                }
                if k == "path" || k == "pasteDir" || k == "dir" || k == "binPath" {
                    out.insert(k.clone(), json!("<path>"));
                    continue;
                }
                if k == "providers"
                    || k == "threads"
                    || k == "highlights"
                    || k == "files"
                    || k == "commands"
                    || k == "entries"
                    || k == "servers"
                    || k == "sessions"
                    || k == "items"
                    || k == "collections"
                {
                    // Compare structure only for large arrays: type + length.
                    if let Some(arr) = val.as_array() {
                        out.insert(
                            k.clone(),
                            json!({"_len": arr.len(), "_sample": arr.first().map(normalize_for_compare)}),
                        );
                        continue;
                    }
                }
                out.insert(k.clone(), normalize_for_compare(val));
            }
            Value::Object(out.into_iter().collect())
        }
        Value::Array(arr) => Value::Array(arr.iter().map(normalize_for_compare).collect()),
        other => other.clone(),
    }
}

const FREE_KEYS: &[&str] = &[
    "pid",
    "port",
    "startedAt",
    "started_at",
    "bundleHash",
    "appVersion",
    "version",
    "ts",
    "createdAt",
    "updatedAt",
    "backend", // rust-only identity field
    "node",    // runtime path differs
];

/// Diff two normalized values; returns human-readable paths of divergence.
pub fn diff_values(a: &Value, b: &Value, path: &str) -> Vec<String> {
    match (a, b) {
        (Value::Object(ma), Value::Object(mb)) => {
            let mut out = Vec::new();
            let mut keys: BTreeMap<&str, ()> = BTreeMap::new();
            for k in ma.keys().chain(mb.keys()) {
                keys.insert(k.as_str(), ());
            }
            for k in keys.keys() {
                let pa = format!("{path}.{k}");
                match (ma.get(*k), mb.get(*k)) {
                    (Some(va), Some(vb)) => out.extend(diff_values(va, vb, &pa)),
                    (Some(_), None) => out.push(format!("{pa}: only left")),
                    (None, Some(_)) => out.push(format!("{pa}: only right")),
                    (None, None) => {}
                }
            }
            out
        }
        (Value::Array(aa), Value::Array(ab)) => {
            if aa.len() != ab.len() {
                return vec![format!("{path}: array len {} vs {}", aa.len(), ab.len())];
            }
            let mut out = Vec::new();
            for (i, (va, vb)) in aa.iter().zip(ab.iter()).enumerate() {
                out.extend(diff_values(va, vb, &format!("{path}[{i}]")));
            }
            out
        }
        (a, b) if a == b => vec![],
        (a, b) => vec![format!("{path}: {a} != {b}")],
    }
}

pub fn is_mutating(msg_type: &str) -> bool {
    MUTATING_TYPES.contains(&msg_type)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use crate::state::AppState;
    use crate::ws_router::route_ws;
    use tempfile::tempdir;

    #[test]
    fn corpus_is_read_only() {
        for msg in read_only_corpus() {
            let t = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
            assert!(!is_mutating(t), "corpus must not include mutating type {t}");
        }
    }

    #[test]
    fn normalize_strips_pid() {
        let v = json!({"type":"status","pid":1,"port":9,"pasteDir":"/a/b"});
        let n = normalize_for_compare(&v);
        assert!(n.get("pid").is_none());
        assert_eq!(n["pasteDir"], "<path>");
    }

    #[tokio::test]
    async fn rust_handles_full_read_only_corpus() {
        let dir = tempdir().unwrap();
        let state = AppState::new(
            AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        );
        for msg in read_only_corpus() {
            let t = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let text = serde_json::to_string(&msg).unwrap();
            let out = route_ws(&state, &text).await;
            // clientHello may return empty; others must reply
            if t == "clientHello" {
                continue;
            }
            assert!(
                !out.is_empty() || t == "clientLog",
                "no reply for {t}: {out:?}"
            );
            if let Some(first) = out.first() {
                let v: Value = serde_json::from_str(first).unwrap_or(json!({}));
                let ty = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
                // Host-dependent probes may return error (zotero missing, etc.)
                if matches!(
                    t,
                    "zoteroCollections" | "zoteroSearch" | "zoteroDigest" | "gitStatus" | "gitDiff"
                ) {
                    continue;
                }
                assert_ne!(ty, "error", "unexpected error for {t}: {first}");
            }
        }
    }

    #[test]
    fn inventory_covers_node_cases() {
        // Guardrail: every Node router case must be listed in ROUTER_TYPES.
        let node_cases = include_str!("../../../../sidecar/router.mjs");
        for t in crate::ws_router::ALL_MESSAGE_TYPES {
            // each type should appear as a case in Node router (or be documented rust-only)
            if matches!(*t, "upsertThread") {
                continue; // rust convenience alias
            }
            assert!(
                node_cases.contains(&format!("case \"{t}\"")),
                "ALL_MESSAGE_TYPES entry {t} missing from Node router.mjs"
            );
        }
        for t in crate::ws_router::ALL_MESSAGE_TYPES {
            assert!(!t.is_empty());
        }
        assert!(crate::ws_router::ALL_MESSAGE_TYPES.contains(&"ping"));
        assert!(crate::ws_router::ALL_MESSAGE_TYPES.contains(&"send"));
        assert!(crate::ws_router::ALL_MESSAGE_TYPES.contains(&"quickAsk"));
        assert!(crate::ws_router::ALL_MESSAGE_TYPES.contains(&"goalGet"));
    }
}
