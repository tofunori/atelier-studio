//! Pont runtime des cahiers Jupyter `.ipynb` :
//! 1. Actions MCP `atelier_notebook` (`notebook_read`, `notebook_neighborhood`,
//!    `notebook_propose_edit`, `notebook_propose_insert`, `notebook_withdraw_proposal`,
//!    `notebook_kernels`) pour les agents du chat ;
//! 2. Commandes WebSocket `notebookCommand` et `notebookInterrupt` pour le
//!    panneau `<NotebookTab />`.

use crate::state::AppState;
use atelier_notebook::{
    analyze_neighborhood, base64_decode, project_for_agent, CellKind, CellProposal,
    NotebookPushEvent,
};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn push_event_message(event: &NotebookPushEvent) -> String {
    json!({
        "type": "notebookEvent",
        "data": event,
    })
    .to_string()
}

fn author_for(provider: &str) -> String {
    match provider {
        "claude" => "Claude".into(),
        other => crate::agent_mcp::provider_label(other).to_string(),
    }
}

/// Résout un chemin `.ipynb` (relatif au projet ou absolu) et vérifie qu'il
/// appartient au dossier du projet lorsque celui-ci est fourni (protection
/// contre toute traversée `..` ou lien symbolique sortant).
pub fn resolve_notebook_path(
    project_root: Option<&str>,
    requested: &str,
) -> Result<PathBuf, String> {
    let trimmed = requested.trim();
    if trimmed.is_empty() {
        return Err("path manquant : chemin du fichier .ipynb".into());
    }
    let p = Path::new(trimmed);
    if !p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("ipynb"))
    {
        return Err("le fichier ciblé n'est pas un cahier .ipynb".into());
    }

    if let Some(root_str) = project_root.filter(|s| !s.trim().is_empty()) {
        let root = Path::new(root_str)
            .canonicalize()
            .map_err(|e| format!("projet illisible : {e}"))?;
        let candidate = if p.is_absolute() {
            p.to_path_buf()
        } else {
            root.join(p)
        };
        let resolved = candidate
            .canonicalize()
            .map_err(|_| format!("cahier introuvable : {trimmed}"))?;
        if !resolved.starts_with(&root) {
            return Err("le cahier .ipynb doit se trouver dans le projet actif".into());
        }
        Ok(resolved)
    } else {
        if !p.is_absolute() {
            return Err("chemin absolu requis hors projet".into());
        }
        p.canonicalize()
            .map_err(|_| format!("cahier introuvable : {trimmed}"))
    }
}

fn str_arg<'a>(req: &'a Value, key: &str) -> Option<&'a str> {
    req.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn usize_arg(req: &Value, key: &str) -> Option<usize> {
    req.get(key).and_then(Value::as_u64).map(|n| n as usize)
}

// ============================================================================
// 1. Outil MCP `atelier_notebook`
// ============================================================================

pub async fn mcp_action(
    state: &AppState,
    caller_id: &str,
    action: &str,
    req: &Value,
) -> Result<Value, String> {
    let (project_root, provider) = {
        let store = state.threads().lock().await;
        let caller = store
            .get(caller_id)
            .ok_or_else(|| "session appelante inconnue".to_string())?;
        (caller.project_root.clone(), caller.provider.clone())
    };

    let raw_path = str_arg(req, "path").ok_or("path manquant")?;
    if action == "notebook_kernels" {
        let kernels = state
            .notebooks()
            .list_kernels(Some(Path::new(&project_root)));
        return Ok(json!({ "kernels": kernels }));
    }

    let path = resolve_notebook_path(Some(&project_root), raw_path)?;
    let ws = state
        .notebooks()
        .get_or_open(&path)
        .await
        .map_err(|e| e.to_string())?;

    match action {
        "notebook_read" => {
            let from = usize_arg(req, "from");
            let to = usize_arg(req, "to");
            let include_outputs = req
                .get("includeOutputs")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            let mut proj = {
                let doc = ws.doc.lock().await;
                project_for_agent(&doc, from, to, include_outputs)
            };
            if let Some(obj) = proj.as_object_mut() {
                obj.insert("kernelStatus".into(), json!(ws.status()));
                obj.insert(
                    "liveVariables".into(),
                    json!(ws.variables.lock().unwrap_or_else(|e| e.into_inner()).clone()),
                );
                obj.insert(
                    "pendingProposals".into(),
                    json!(ws.proposals.lock().unwrap_or_else(|e| e.into_inner()).clone()),
                );
            }
            Ok(proj)
        }
        "notebook_neighborhood" => {
            let cell_ref = str_arg(req, "cell").ok_or("cell manquant (numéro 1-based ou id)")?;
            let nbh = {
                let doc = ws.doc.lock().await;
                let idx = doc
                    .find_cell_index(cell_ref)
                    .ok_or_else(|| format!("cellule `{cell_ref}` introuvable"))?;
                analyze_neighborhood(&doc, idx)
                    .ok_or_else(|| "analyse de voisinage indisponible".to_string())?
            };
            Ok(json!({
                "neighborhood": nbh,
                "liveVariables": ws.variables.lock().unwrap_or_else(|e| e.into_inner()).clone(),
            }))
        }
        "notebook_propose_edit" => {
            let cell_ref = str_arg(req, "cell").ok_or("cell manquant")?;
            let code = req
                .get("code")
                .and_then(Value::as_str)
                .ok_or("code manquant")?
                .to_string();
            let purpose = str_arg(req, "purpose").unwrap_or("Modification proposée").to_string();
            let expected_rev = str_arg(req, "revision");

            let proposal = {
                let doc = ws.doc.lock().await;
                if let Some(rev) = expected_rev {
                    let current = doc.revision();
                    if current != rev {
                        return Err(format!(
                            "le cahier a changé depuis ta lecture (révision {current} ≠ {rev}) : rappelle action=read d'abord"
                        ));
                    }
                }
                let idx = doc
                    .find_cell_index(cell_ref)
                    .ok_or_else(|| format!("cellule `{cell_ref}` introuvable"))?;
                CellProposal::build_edit(&doc, idx, code, purpose, author_for(&provider))
                    .ok_or_else(|| "impossible de construire la proposition".to_string())?
            };

            let summary = json!({
                "proposalId": proposal.id,
                "cellId": proposal.target_cell_id,
                "addedLines": proposal.added_lines,
                "removedLines": proposal.removed_lines,
                "upstreamSummary": proposal.upstream_summary,
                "downstreamSummary": proposal.downstream_summary,
                "diagnostics": proposal.diagnostics,
                "note": "Affichée en mini-diff inline dans le cahier de l'utilisateur (seul l'utilisateur accepte et exécute).",
            });
            state.notebooks().add_proposal(&path, proposal).await?;
            Ok(summary)
        }
        "notebook_propose_insert" => {
            let after_ref = req.get("after").and_then(Value::as_str).map(str::trim);
            let cell_type = match str_arg(req, "cellType") {
                Some("markdown") => CellKind::Markdown,
                _ => CellKind::Code,
            };
            let code = req
                .get("code")
                .and_then(Value::as_str)
                .ok_or("code manquant")?
                .to_string();
            let purpose = str_arg(req, "purpose").unwrap_or("Nouvelle cellule").to_string();

            let proposal = {
                let doc = ws.doc.lock().await;
                let after_idx = match after_ref {
                    None | Some("") | Some("0") => None,
                    Some(r) => Some(
                        doc.find_cell_index(r)
                            .ok_or_else(|| format!("cellule `after={r}` introuvable"))?,
                    ),
                };
                CellProposal::build_insert(
                    &doc,
                    after_idx,
                    cell_type,
                    code,
                    purpose,
                    author_for(&provider),
                )
            };

            let summary = json!({
                "proposalId": proposal.id,
                "targetCellId": proposal.target_cell_id,
                "cellType": proposal.cell_type,
                "addedLines": proposal.added_lines,
                "upstreamSummary": proposal.upstream_summary,
                "diagnostics": proposal.diagnostics,
                "note": "Affichée dans le cahier de l'utilisateur ; il peut l'insérer et l'exécuter en un clic.",
            });
            state.notebooks().add_proposal(&path, proposal).await?;
            Ok(summary)
        }
        "notebook_withdraw_proposal" => {
            let prop_id = str_arg(req, "proposalId").ok_or("proposalId manquant")?;
            state.notebooks().discard_proposal(&path, prop_id).await?;
            Ok(json!({ "withdrawn": prop_id }))
        }
        _ => Err(format!("action notebook inconnue : {action}")),
    }
}

// ============================================================================
// 2. Commandes WebSocket `notebookCommand` & `notebookInterrupt`
// ============================================================================

pub async fn handle_ws_interrupt(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let project_root = str_arg(msg, "projectRoot");
    let Some(raw_path) = str_arg(msg, "path") else {
        return vec![json!({
            "type": "notebookCommand",
            "requestId": request_id,
            "error": "path manquant",
        })
        .to_string()];
    };
    let result = match resolve_notebook_path(project_root, raw_path) {
        Ok(p) => state.notebooks().interrupt(&p).await,
        Err(e) => Err(e),
    };
    match result {
        Ok(()) => vec![json!({
            "type": "notebookCommand",
            "requestId": request_id,
            "ok": true,
        })
        .to_string()],
        Err(err) => vec![json!({
            "type": "notebookCommand",
            "requestId": request_id,
            "error": err,
        })
        .to_string()],
    }
}

pub async fn handle_ws_command(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let op = str_arg(msg, "op").unwrap_or("");
    let project_root_str = str_arg(msg, "projectRoot");
    let project_root_path = project_root_str.map(Path::new);

    if op == "kernels" {
        let kernels = state.notebooks().list_kernels(project_root_path);
        return vec![json!({
            "type": "notebookCommand",
            "requestId": request_id,
            "data": { "kernels": kernels },
        })
        .to_string()];
    }

    let Some(raw_path) = str_arg(msg, "path") else {
        return vec![json!({
            "type": "notebookCommand",
            "requestId": request_id,
            "error": "path manquant",
        })
        .to_string()];
    };

    let path = match resolve_notebook_path(project_root_str, raw_path) {
        Ok(p) => p,
        Err(err) => {
            return vec![json!({
                "type": "notebookCommand",
                "requestId": request_id,
                "error": err,
            })
            .to_string()]
        }
    };

    let outcome: Result<Value, String> = match op {
        "open" => match state.notebooks().get_or_open(&path).await {
            Ok(ws) => {
                let snap = ws.snapshot().await;
                let kernels = state.notebooks().list_kernels(project_root_path);
                Ok(json!({ "snapshot": snap, "kernels": kernels }))
            }
            Err(e) => Err(e.to_string()),
        },
        "save" => state
            .notebooks()
            .save(&path)
            .await
            .map(|snap| json!({ "snapshot": snap }))
            .map_err(|e| e.to_string()),
        "runCell" => {
            let cell_id = str_arg(msg, "cellId").unwrap_or("");
            let source = msg
                .get("source")
                .and_then(Value::as_str)
                .map(str::to_string);
            state
                .notebooks()
                .run_cell(&path, project_root_path, cell_id, source)
                .await
                .map(|snap| json!({ "snapshot": snap }))
        }
        "runAll" => state
            .notebooks()
            .run_all(&path, project_root_path)
            .await
            .map(|snap| json!({ "snapshot": snap })),
        "restart" => {
            let kernel_id = str_arg(msg, "kernelId");
            state
                .notebooks()
                .restart_kernel(&path, project_root_path, kernel_id)
                .await
                .map(|snap| json!({ "snapshot": snap }))
        }
        "stopKernel" => state
            .notebooks()
            .stop_kernel(&path)
            .await
            .map(|snap| json!({ "snapshot": snap })),
        "updateCell" => {
            let cell_id = str_arg(msg, "cellId").unwrap_or("");
            let source = msg
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let cell_type = match str_arg(msg, "cellType") {
                Some("markdown") => Some(CellKind::Markdown),
                Some("raw") => Some(CellKind::Raw),
                Some("code") => Some(CellKind::Code),
                _ => None,
            };
            state
                .notebooks()
                .update_cell_source(&path, cell_id, source, cell_type)
                .await
                .map(|snap| json!({ "snapshot": snap }))
        }
        "insertCell" => {
            let after = msg.get("afterCellId").and_then(Value::as_str);
            let cell_type = match str_arg(msg, "cellType") {
                Some("markdown") => CellKind::Markdown,
                _ => CellKind::Code,
            };
            let source = msg
                .get("source")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            state
                .notebooks()
                .insert_cell(&path, after, cell_type, source)
                .await
                .map(|(new_id, snap)| json!({ "cellId": new_id, "snapshot": snap }))
        }
        "deleteCell" => {
            let cell_id = str_arg(msg, "cellId").unwrap_or("");
            state
                .notebooks()
                .delete_cell(&path, cell_id)
                .await
                .map(|snap| json!({ "snapshot": snap }))
        }
        "acceptProposal" => {
            let proposal_id = str_arg(msg, "proposalId").unwrap_or("");
            let run_after = msg
                .get("runAfter")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            state
                .notebooks()
                .accept_proposal(&path, project_root_path, proposal_id, run_after)
                .await
                .map(|snap| json!({ "snapshot": snap }))
        }
        "discardProposal" => {
            let proposal_id = str_arg(msg, "proposalId").unwrap_or("");
            state
                .notebooks()
                .discard_proposal(&path, proposal_id)
                .await
                .map(|snap| json!({ "snapshot": snap }))
        }
        "complete" => {
            let code = msg.get("code").and_then(Value::as_str).unwrap_or("");
            let cursor = usize_arg(msg, "cursorPos").unwrap_or(code.len());
            state.notebooks().complete(&path, code, cursor).await
        }
        "inspect" => {
            let code = msg.get("code").and_then(Value::as_str).unwrap_or("");
            let cursor = usize_arg(msg, "cursorPos").unwrap_or(code.len());
            state.notebooks().inspect(&path, code, cursor).await
        }
        "gitDiff" => compute_git_cell_diff(state, project_root_str, &path).await,
        "saveFigure" => save_notebook_figure(project_root_str, &path, msg),
        _ => Err(format!("opération notebookCommand inconnue : `{op}`")),
    };

    match outcome {
        Ok(data) => vec![json!({
            "type": "notebookCommand",
            "requestId": request_id,
            "data": data,
        })
        .to_string()],
        Err(err) => vec![json!({
            "type": "notebookCommand",
            "requestId": request_id,
            "error": err,
        })
        .to_string()],
    }
}

async fn compute_git_cell_diff(
    state: &AppState,
    project_root: Option<&str>,
    path: &Path,
) -> Result<Value, String> {
    let Some(root_str) = project_root.filter(|s| !s.trim().is_empty()) else {
        return Ok(json!({ "entries": [], "untracked": true }));
    };
    let root_canon = Path::new(root_str)
        .canonicalize()
        .map_err(|e| format!("projet : {e}"))?;
    let rel = path
        .strip_prefix(&root_canon)
        .map_err(|_| "cahier hors projet".to_string())?
        .to_string_lossy()
        .to_string();

    let head_contents = match atelier_workspace::diff_contents(
        &root_canon.to_string_lossy(),
        &rel,
        "working",
        None,
    ) {
        Ok(c) => c.before,
        Err(_) => String::new(),
    };

    if head_contents.trim().is_empty() {
        return Ok(json!({ "entries": [], "untracked": true }));
    }

    let entries = state
        .notebooks()
        .diff_against_str(path, &head_contents)
        .await?;
    Ok(json!({ "entries": entries, "untracked": false }))
}

fn save_notebook_figure(
    project_root: Option<&str>,
    notebook_path: &Path,
    msg: &Value,
) -> Result<Value, String> {
    let root_str = project_root
        .filter(|s| !s.trim().is_empty())
        .ok_or("projet actif requis pour enregistrer dans la galerie")?;
    let root = Path::new(root_str)
        .canonicalize()
        .map_err(|e| format!("projet : {e}"))?;
    let gallery_rel = str_arg(msg, "galleryDir").unwrap_or("figures");
    let clean_gallery = gallery_rel.trim_matches('/').replace("..", "");
    let target_dir = if clean_gallery.is_empty() {
        root.join("figures")
    } else {
        root.join(clean_gallery)
    };
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("dossier figures : {e}"))?;

    let stem = notebook_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("notebook");
    let cell_index = usize_arg(msg, "cellIndex").unwrap_or(1);
    let format = str_arg(msg, "format").unwrap_or("png");

    let (ext, bytes) = if format == "svg" {
        let svg = msg
            .get("payload")
            .and_then(Value::as_str)
            .ok_or("SVG vide")?;
        ("svg", svg.as_bytes().to_vec())
    } else if format == "jpeg" {
        let b64 = msg
            .get("payload")
            .and_then(Value::as_str)
            .ok_or("JPEG vide")?;
        ("jpg", base64_decode(b64)?)
    } else {
        let b64 = msg
            .get("payload")
            .and_then(Value::as_str)
            .ok_or("PNG vide")?;
        ("png", base64_decode(b64)?)
    };

    let filename = format!("{stem}_cell{cell_index}.{ext}");
    let out_path = target_dir.join(&filename);
    crate::atomic::write_file_atomic(&out_path, &bytes)
        .map_err(|e| format!("écriture figure : {e}"))?;

    let rel_saved = out_path
        .strip_prefix(&root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(filename);
    Ok(json!({ "savedRel": rel_saved }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;

    fn test_state(app_dir: &Path) -> AppState {
        let paths = AppPaths::from_app_dir(app_dir.to_path_buf());
        AppState::new(
            paths,
            None,
            "2026-11-18T00:00:00Z".into(),
            "2.3.0".into(),
            "test".into(),
            String::new(),
        )
    }

    #[tokio::test]
    async fn mcp_notebook_read_neighborhood_and_propose_edit_respect_project_boundary() {
        let tmp = tempfile::tempdir().unwrap();
        let proj = tmp.path().join("projet");
        let outside = tmp.path().join("outside.ipynb");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::write(&outside, r#"{"nbformat":4,"nbformat_minor":5,"metadata":{},"cells":[]}"#)
            .unwrap();
        let nb = proj.join("albedo.ipynb");
        std::fs::write(
            &nb,
            r#"{
  "nbformat": 4,
  "nbformat_minor": 5,
  "metadata": {},
  "cells": [
    {"id": "c1", "cell_type": "code", "source": ["import pymc as pm\nx = 10\n"], "outputs": []},
    {"id": "c2", "cell_type": "code", "source": ["m = x * 2\n"], "outputs": []},
    {"id": "c3", "cell_type": "code", "source": ["print(m)\n"], "outputs": []}
  ]
}"#,
        )
        .unwrap();

        let state = test_state(&tmp.path().join("app"));
        {
            let mut store = state.threads().lock().await;
            store
                .upsert(
                    json!({
                        "id": "t-1",
                        "projectRoot": proj.display().to_string(),
                        "provider": "claude",
                        "title": "Test",
                        "status": "idle",
                    }),
                    true,
                )
                .unwrap();
        }

        // Refus hors projet
        let err = mcp_action(
            &state,
            "t-1",
            "notebook_read",
            &json!({"path": "../outside.ipynb"}),
        )
        .await
        .unwrap_err();
        assert!(err.contains("dans le projet"), "{err}");

        // Lecture complète
        let read = mcp_action(&state, "t-1", "notebook_read", &json!({"path": "albedo.ipynb"}))
            .await
            .unwrap();
        assert_eq!(read["cellCount"], 3);
        let rev = read["revision"].as_str().unwrap().to_string();

        // Voisinage de [2]
        let nbh = mcp_action(
            &state,
            "t-1",
            "notebook_neighborhood",
            &json!({"path": "albedo.ipynb", "cell": "2"}),
        )
        .await
        .unwrap();
        assert_eq!(nbh["neighborhood"]["upstreamImports"][0]["alias"], "pm");
        assert_eq!(nbh["neighborhood"]["downstreamConsumers"][0]["symbol"], "m");

        // Proposition inline signalant un ré-import redondant
        let prop = mcp_action(
            &state,
            "t-1",
            "notebook_propose_edit",
            &json!({
                "path": "albedo.ipynb",
                "cell": "2",
                "code": "import pymc as pm\nm = x * 3\n",
                "purpose": "Tripler x",
                "revision": rev,
            }),
        )
        .await
        .unwrap();
        assert_eq!(prop["diagnostics"]["redundantImports"].as_array().unwrap().len(), 1);
    }
}
