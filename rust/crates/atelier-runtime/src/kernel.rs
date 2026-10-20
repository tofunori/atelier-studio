//! Noyau Python persistant du fil (chantier 5) : outil de l'agent, consigne,
//! requêtes du panneau « Cellules ». Le noyau lui-même vit dans
//! `atelier-kernel` ; ce module le relie aux fils, au pont MCP et au bus.

use crate::state::AppState;
use atelier_kernel::{CellEvent, RunRequest};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Un noyau sans cellule depuis ce délai est arrêté (ses variables avec).
const IDLE_SHUTDOWN: Duration = Duration::from_secs(30 * 60);
/// Attente maximale d'un appel `run` ou `wait` : le pont coupe à 65 s et
/// Codex à 60 s par défaut. Au-delà, l'agent reçoit « running » et revient.
const WAIT_MAX_SECS: u64 = 50;
const WAIT_DEFAULT_SECS: u64 = 45;

/// Clé du fil qui porte l'interrupteur (coupé par défaut).
pub const ENABLED_KEY: &str = "kernelEnabled";
/// Env retenu pour le fil, pour qu'un noyau relancé reprenne le même.
pub const ENV_KEY: &str = "kernelEnv";
/// Ce que la session provider sait de l'interrupteur : `{session, on}`.
pub const ANNOUNCED_KEY: &str = "kernelAnnounced";

pub fn enabled(thread: Option<&atelier_store::Thread>) -> bool {
    thread
        .and_then(|t| t.extra.get(ENABLED_KEY))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub fn cell_message(event: &CellEvent) -> String {
    json!({
        "type": "kernelCell",
        "threadId": event.thread_id,
        "phase": event.phase,
        "cell": event.cell,
    })
    .to_string()
}

pub fn spawn_idle_reaper(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        loop {
            tick.tick().await;
            for thread_id in state.kernels().reap_idle(IDLE_SHUTDOWN).await {
                publish_status(&state, &thread_id);
            }
        }
    });
}

fn publish_status(state: &AppState, thread_id: &str) {
    state.publish(
        json!({
            "type": "kernelStatus",
            "threadId": thread_id,
            "status": state.kernels().status(thread_id),
        })
        .to_string(),
    );
}

const OFF_MESSAGE: &str = "kernel_disabled — le noyau Python persistant est coupé pour ce fil. \
Travaille avec ton shell habituel ; l'utilisateur peut l'allumer dans le menu + du compositeur (Noyau Python).";

/// Actions `kernel_*` du pont MCP (outil `atelier_python`).
pub async fn action(
    state: &AppState,
    caller_id: &str,
    action: &str,
    req: &Value,
) -> Result<Value, String> {
    let thread = state.threads().lock().await.get(caller_id).cloned();
    let Some(appelant) = thread else {
        return Err("thread_not_found".into());
    };
    // Un fil lié (spécialiste délégué) travaille dans le noyau de son parent :
    // mêmes variables, cellules au journal du parent.
    let thread = crate::delegation::fil_du_noyau(state, &appelant).await;
    let caller_id = thread.id.as_str();
    let kernels = state.kernels();
    // Lire ce qui existe reste permis noyau coupé : le journal et la liste
    // des envs ne lancent rien.
    if !enabled(Some(&thread)) && !matches!(action, "kernel_envs" | "kernel_status") {
        // Couper l'interrupteur arrête aussi un noyau resté en vie.
        kernels.shutdown(caller_id).await;
        return Err(OFF_MESSAGE.into());
    }
    let cwd = PathBuf::from(&thread.project_root);
    let default_env = thread.extra.get(ENV_KEY).and_then(Value::as_str);
    let env = req
        .get("env")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|e| !e.is_empty());
    let wait = Duration::from_secs(
        req.get("waitSeconds")
            .and_then(Value::as_u64)
            .unwrap_or(WAIT_DEFAULT_SECS)
            .min(WAIT_MAX_SECS),
    );
    let out = match action {
        "kernel_run" => {
            if read_only(&appelant) {
                return Err("kernel_read_only — le fil est en mode lecture seule : le noyau n'exécute rien. \
L'utilisateur peut changer de mode dans le compositeur."
                    .into());
            }
            if thread.project_root.is_empty() || !cwd.is_dir() {
                return Err(
                    "kernel_no_folder — ce fil n'a pas de dossier de projet où lancer le noyau."
                        .into(),
                );
            }
            let code = req
                .get("code")
                .and_then(Value::as_str)
                .filter(|c| !c.trim().is_empty())
                .ok_or("kernel_missing_code — passe le code Python dans code.")?;
            let turn_id = state.capabilities().lock().await.turn_id_of(&appelant.id);
            let outcome = kernels
                .run(RunRequest {
                    thread_id: caller_id,
                    cwd: &cwd,
                    env,
                    default_env,
                    code,
                    wait,
                    turn_id: turn_id.as_deref(),
                    purpose: req.get("purpose").and_then(Value::as_str),
                    author: None,
                    from_cell: None,
                })
                .await
                .map_err(|e| e.message())?;
            if outcome.note.is_some() {
                remember_env(state, caller_id).await;
                publish_status(state, caller_id);
            }
            serde_json::to_value(outcome).map_err(|e| e.to_string())?
        }
        "kernel_wait" => {
            let id = req
                .get("cell")
                .and_then(Value::as_u64)
                .ok_or("kernel_missing_cell — passe le numéro de la cellule dans cell.")?;
            serde_json::to_value(
                kernels
                    .wait(caller_id, id, wait)
                    .await
                    .map_err(|e| e.message())?,
            )
            .map_err(|e| e.to_string())?
        }
        "kernel_variables" => {
            json!({"variables": kernels.variables(caller_id).await.map_err(|e| e.message())?})
        }
        "kernel_interrupt" => match kernels.interrupt(caller_id).await {
            Ok(Some(id)) => {
                json!({"interrupted": id, "hint": format!("Lis la fin de la cellule avec action=wait, cell={id}.")})
            }
            Ok(None) => json!({"interrupted": null, "note": "aucune cellule ne tournait"}),
            Err(e) => return Err(e.message()),
        },
        "kernel_restart" => {
            if thread.project_root.is_empty() || !cwd.is_dir() {
                return Err(
                    "kernel_no_folder — ce fil n'a pas de dossier de projet où lancer le noyau."
                        .into(),
                );
            }
            let info = kernels
                .restart(caller_id, &cwd, env, default_env)
                .await
                .map_err(|e| e.message())?;
            remember_env(state, caller_id).await;
            publish_status(state, caller_id);
            json!({"restarted": true, "kernel": info, "note": "Noyau neuf : les variables précédentes sont perdues."})
        }
        "kernel_envs" => {
            let root = (!thread.project_root.is_empty()).then(|| cwd.as_path());
            let envs = kernels.envs(root);
            let current = kernels.status(caller_id).kernel.map(|k| k.env.name);
            json!({
                "envs": envs.iter().map(|e| json!({"name": e.name, "source": e.source, "prefix": e.prefix})).collect::<Vec<_>>(),
                "current": current,
                "remembered": default_env,
                "default": envs.first().map(|e| e.name.clone()),
            })
        }
        "kernel_status" => json!({
            "enabled": enabled(Some(&thread)),
            "status": kernels.status(caller_id),
            "lastCells": kernels.journal().list(caller_id, 5).iter().map(|c| json!({
                "cell": c.id, "status": c.status, "startedAt": c.started_at,
                "code": atelier_kernel::journal::clip(&c.code, 600),
            })).collect::<Vec<_>>(),
        }),
        _ => return Err("unknown_action".into()),
    };
    Ok(out)
}

fn read_only(thread: &atelier_store::Thread) -> bool {
    thread
        .extra
        .get("lastTurn")
        .and_then(|t| t.get("permissionMode"))
        .and_then(Value::as_str)
        == Some("plan")
}

/// Garde l'env du noyau vivant sur le fil : un noyau arrêté pour inactivité
/// redémarre dans le même.
async fn remember_env(state: &AppState, thread_id: &str) {
    let Some(info) = state.kernels().status(thread_id).kernel else {
        return;
    };
    let mut store = state.threads().lock().await;
    let unchanged = store
        .get(thread_id)
        .and_then(|t| t.extra.get(ENV_KEY).cloned())
        == Some(json!(info.env.name));
    if !unchanged {
        let _ = store.upsert(json!({"id": thread_id, ENV_KEY: info.env.name}), true);
    }
}

/// Requête du panneau : cellules du fil et état du noyau.
pub async fn handle_cells(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    let limit = msg
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(200)
        .min(1000) as usize;
    let kernels = state.kernels();
    let cells = kernels.panel_cells(thread_id, limit);
    vec![json!({
        "type": "kernelCells",
        "requestId": msg.get("requestId"),
        "threadId": thread_id,
        "cells": cells,
        "status": kernels.status(thread_id),
        "chain": kernels.journal().verify_chain(thread_id),
    })
    .to_string()]
}

/// Arrêt demandé par l'utilisateur (interrupteur coupé, bouton Arrêter).
pub async fn handle_stop(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    let stopped = state.kernels().shutdown(thread_id).await;
    publish_status(state, thread_id);
    vec![json!({
        "type": "kernelStopped",
        "requestId": msg.get("requestId"),
        "threadId": thread_id,
        "stopped": stopped,
    })
    .to_string()]
}

/// Fil supprimé : noyau arrêté, journal effacé.
/// Commandes de la surface Noyau : variables, interruption, redémarrage
/// (dans un autre env au besoin), liste des envs, et lien d'une figure
/// enregistrée dans la galerie à sa cellule. Mêmes règles que l'outil de
/// l'agent (`action`), le fil étant celui que la surface affiche.
pub async fn handle_command(state: &AppState, msg: &Value) -> Vec<String> {
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    let op = msg.get("op").and_then(Value::as_str).unwrap_or("");
    let result = match op {
        "variables" | "interrupt" | "restart" | "envs" => {
            action(state, thread_id, &format!("kernel_{op}"), msg).await
        }
        "link" => link_file(state, thread_id, msg).await,
        "verify" => Ok(verify_claims(state, thread_id, msg)),
        "rerun" => rerun(state, thread_id, msg).await,
        "replay" => start_replay(state, thread_id).await,
        "cancelReplay" => Ok(json!({"cancelled": state.kernels().cancel_replay(thread_id)})),
        "export" => export(state, thread_id, msg).await,
        _ => Err("unknown_op".into()),
    };
    let mut reply = json!({
        "type": "kernelCommand",
        "requestId": msg.get("requestId"),
        "threadId": thread_id,
        "op": op,
    });
    match result {
        Ok(value) => reply["result"] = value,
        Err(error) => reply["error"] = json!(error),
    }
    vec![reply.to_string()]
}

/// Chiffres cités par l'agent, vérifiés dans la sortie de leur cellule.
/// `claims` : `[{cell, value}]`, `value` tel qu'écrit dans la réponse.
fn verify_claims(state: &AppState, thread_id: &str, msg: &Value) -> Value {
    let journal = state.kernels().journal();
    let checks: Vec<Value> = msg
        .get("claims")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(200)
        .map(|claim| {
            let cell = claim.get("cell").and_then(Value::as_u64);
            let value = claim.get("value").and_then(Value::as_str).unwrap_or("");
            let check = match cell.and_then(|id| journal.get(thread_id, id)) {
                Some(record) => json!(atelier_kernel::verify::check_claim(&record, value)),
                None => json!({"status": "nocell"}),
            };
            json!({"cell": cell, "value": value, "check": check})
        })
        .collect();
    json!({"checks": checks})
}

/// Cellule modifiée et relancée par l'utilisateur depuis le panneau : une
/// NOUVELLE cellule, signée et liée à l'originale, qui garde son but.
async fn rerun(state: &AppState, thread_id: &str, msg: &Value) -> Result<Value, String> {
    let thread = state.threads().lock().await.get(thread_id).cloned();
    let Some(thread) = thread else {
        return Err("thread_not_found".into());
    };
    if !enabled(Some(&thread)) {
        return Err(OFF_MESSAGE.into());
    }
    let cwd = PathBuf::from(&thread.project_root);
    if thread.project_root.is_empty() || !cwd.is_dir() {
        return Err("kernel_no_folder — ce fil n'a pas de dossier de projet où lancer le noyau.".into());
    }
    let code = msg
        .get("code")
        .and_then(Value::as_str)
        .filter(|c| !c.trim().is_empty())
        .ok_or("kernel_missing_code")?;
    let from = msg.get("fromCell").and_then(Value::as_u64);
    let purpose = from
        .and_then(|id| state.kernels().journal().get(thread_id, id))
        .and_then(|c| c.purpose);
    let default_env = thread.extra.get(ENV_KEY).and_then(Value::as_str);
    let outcome = state
        .kernels()
        .run(RunRequest {
            thread_id,
            cwd: &cwd,
            env: None,
            default_env,
            code,
            // Le panneau suit la cellule par les événements : rien à attendre.
            wait: Duration::ZERO,
            turn_id: None,
            purpose: purpose.as_deref(),
            author: Some("user"),
            from_cell: from,
        })
        .await
        .map_err(|e| e.message())?;
    if outcome.note.is_some() {
        remember_env(state, thread_id).await;
        publish_status(state, thread_id);
    }
    Ok(json!({"cell": outcome.cell["cell"]}))
}

/// Rejouer à neuf, en tâche de fond : l'avancement part sur le bus
/// (`kernelReplay`), chaque cellule rejouée aussi (`kernelCell`).
async fn start_replay(state: &AppState, thread_id: &str) -> Result<Value, String> {
    let thread = state.threads().lock().await.get(thread_id).cloned();
    let Some(thread) = thread else {
        return Err("thread_not_found".into());
    };
    if !enabled(Some(&thread)) {
        return Err(OFF_MESSAGE.into());
    }
    let cwd = PathBuf::from(&thread.project_root);
    if thread.project_root.is_empty() || !cwd.is_dir() {
        return Err("kernel_no_folder — ce fil n'a pas de dossier de projet où lancer le noyau.".into());
    }
    if state.kernels().replaying(thread_id) {
        return Err("kernel_replay_running — un rejeu tourne déjà dans ce fil.".into());
    }
    let (state, thread_id) = (state.clone(), thread_id.to_string());
    tokio::spawn(async move {
        let publisher = state.clone();
        let id = thread_id.clone();
        let progress = move |done: usize, total: usize, cell: Option<&atelier_kernel::CellRecord>| {
            publisher.publish(
                json!({
                    "type": "kernelReplay",
                    "threadId": id,
                    "state": "running",
                    "done": done,
                    "total": total,
                    "cell": cell.map(|c| c.id),
                })
                .to_string(),
            );
        };
        let result = state.kernels().replay(&thread_id, &cwd, progress).await;
        let mut message = json!({"type": "kernelReplay", "threadId": thread_id, "state": "done"});
        match result {
            Ok(summary) => message["summary"] = json!(summary),
            Err(e) => message["error"] = json!(e.message()),
        }
        state.publish(message.to_string());
        publish_status(&state, &thread_id);
    });
    Ok(json!({"started": true}))
}

/// Export `.py` ou `.ipynb` dans `exports/noyau/` du projet ; rend le chemin
/// relatif pour l'ouvrir.
async fn export(state: &AppState, thread_id: &str, msg: &Value) -> Result<Value, String> {
    let thread = state.threads().lock().await.get(thread_id).cloned();
    let Some(thread) = thread else {
        return Err("thread_not_found".into());
    };
    let root = PathBuf::from(&thread.project_root);
    if thread.project_root.is_empty() || !root.is_dir() {
        return Err("kernel_no_folder — ce fil n'a pas de dossier de projet.".into());
    }
    let ipynb = msg.get("format").and_then(Value::as_str) == Some("ipynb");
    let title = if thread.title.trim().is_empty() { "Noyau Python" } else { thread.title.trim() };
    let text = state
        .kernels()
        .export(thread_id, title, ipynb)
        .map_err(|e| e.message())?;
    let slug: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("-");
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M");
    let rel = format!(
        "exports/noyau/{}-{stamp}.{}",
        if slug.is_empty() { "noyau".to_string() } else { slug },
        if ipynb { "ipynb" } else { "py" }
    );
    let path = root.join(&rel);
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;
        std::fs::write(&path, text)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok(json!({"rel": rel}))
}

/// Clé du fil : dernière cellule relancée à la main que l'agent connaît.
pub const USER_CELLS_KEY: &str = "kernelUserCellsTold";

/// Bloc de message qui dit à l'agent quelles cellules l'utilisateur a
/// modifiées et relancées lui-même depuis son dernier tour, avec les lignes
/// changées. Rend aussi le numéro de la dernière, à retenir sur le fil.
pub fn user_cells_block(
    state: &AppState,
    thread_id: &str,
    previous: Option<&atelier_store::Thread>,
    provider: &str,
) -> Option<(String, u64)> {
    if !crate::agent_mcp::is_mcp_compatible_provider(provider) || !enabled(previous) {
        return None;
    }
    let told = previous
        .and_then(|t| t.extra.get(USER_CELLS_KEY))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let journal = state.kernels().journal();
    let cells: Vec<atelier_kernel::CellRecord> = journal
        .list(thread_id, 200)
        .into_iter()
        .filter(|c| c.author.as_deref() == Some("user") && c.id > told)
        .collect();
    let last = cells.iter().map(|c| c.id).max()?;
    let mut block = String::from(
        "

<atelier-kernel-user-cells>
The user edited and re-ran kernel cells themselves since your last turn. Their versions now shape the kernel state: build on them, do not silently redo your earlier version. Cite them like your own cells ([cellule N](atelier-cell:N)).
",
    );
    for cell in cells.iter().take(10) {
        let status = if cell.status == "ok" { "ok".to_string() } else { format!("error {}", cell.error.as_ref().and_then(|e| e["ename"].as_str()).unwrap_or("")) };
        let original = cell.from_cell.and_then(|from| journal.get(thread_id, from));
        match (cell.from_cell, original.and_then(|o| atelier_kernel::diff::line_diff(&o.code, &cell.code))) {
            (Some(from), Some(diff)) => {
                block.push_str(&format!("- Cell {} (edited from cell {from}, {status}), changed lines:
", cell.id));
                for line in &diff.removed {
                    block.push_str(&format!("  - {line}
"));
                }
                for line in &diff.added {
                    block.push_str(&format!("  + {line}
"));
                }
            }
            _ => {
                block.push_str(&format!("- Cell {} ({status}):
", cell.id));
                for line in atelier_kernel::journal::clip(&cell.code, 2000).lines() {
                    block.push_str(&format!("  {line}
"));
                }
            }
        }
    }
    block.push_str("</atelier-kernel-user-cells>");
    Some((block, last))
}

/// Une figure du noyau copiée dans le projet entre dans les écritures de sa
/// cellule : `CellJournal::writers_of` retrouve alors la recette de la copie.
async fn link_file(state: &AppState, thread_id: &str, msg: &Value) -> Result<Value, String> {
    let cell = msg
        .get("cell")
        .and_then(Value::as_u64)
        .ok_or("kernel_missing_cell")?;
    let given = msg
        .get("path")
        .and_then(Value::as_str)
        .filter(|p| !p.trim().is_empty())
        .ok_or("kernel_missing_path")?;
    // Chemin rendu par l'enregistrement dans la galerie : relatif au projet.
    let path = if Path::new(given).is_absolute() {
        given.to_string()
    } else {
        let root = state
            .threads()
            .lock()
            .await
            .get(thread_id)
            .map(|t| t.project_root.clone())
            .filter(|r| !r.is_empty())
            .ok_or("kernel_no_folder")?;
        Path::new(&root).join(given).display().to_string()
    };
    let journal = state.kernels().journal().clone();
    let id = thread_id.to_string();
    let linked = tokio::task::spawn_blocking(move || journal.add_written(&id, cell, &path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    if linked {
        if let Some(record) = state.kernels().journal().get(thread_id, cell) {
            state.publish(cell_message(&CellEvent {
                thread_id: thread_id.to_string(),
                phase: "finished",
                cell: atelier_kernel::panel_view(&record),
            }));
        }
    }
    Ok(json!({"linked": linked}))
}

pub async fn on_delete_thread(state: &AppState, thread_id: &str) {
    state.kernels().shutdown(thread_id).await;
    state.kernels().journal().delete_thread(thread_id);
    let _ = std::fs::remove_dir_all(state.kernels().figures_dir(thread_id));
}

/// Bloc de message qui annonce l'interrupteur à la session provider, une
/// fois par changement (comme la consigne du fil) : allumé, l'agent doit
/// préférer le noyau pour le Python ; coupé, il revient à son shell.
pub fn announcement(
    previous: Option<&atelier_store::Thread>,
    provider: &str,
) -> Option<(String, Value)> {
    if !crate::agent_mcp::is_mcp_compatible_provider(provider) {
        return None;
    }
    let on = enabled(previous);
    let session = previous
        .and_then(|t| t.session_id.as_deref())
        .filter(|s| !s.is_empty());
    let known = previous
        .and_then(|t| t.extra.get(ANNOUNCED_KEY))
        .filter(|a| session.is_some() && a.get("session").and_then(Value::as_str) == session)
        .and_then(|a| a.get("on"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if on == known {
        return None;
    }
    let env = previous
        .and_then(|t| t.extra.get(ENV_KEY))
        .and_then(Value::as_str)
        .map(|e| format!(" The last env used in this conversation is \"{e}\"."))
        .unwrap_or_default();
    let block = if on {
        format!(
            "\n\n<atelier-kernel>\nThe user turned on the persistent Python kernel for this conversation. \
For Python analysis, run your code with the MCP tool `atelier_python` (action \"run\") instead of \
`python -c` or scripts in the shell: variables, loaded data and imports stay in memory between calls, \
like a Jupyter notebook, and every cell is logged with the files it read and wrote. Load data once, \
then work on it in later cells; keep each cell focused. The kernel starts on the first run, in the \
project folder. Pick the env once with `env` on that first run (action \"envs\" lists them, conda and \
Claude Science envs included); use \"restart\" with another env to switch.{env} A cell that runs longer \
than ~45 s returns status \"running\": call action \"wait\" with its cell number, or \"interrupt\". Save \
figures with savefig (the backend is Agg). Keep using the shell for git, file management and non-Python tools.\n\
Give each run a `purpose`: one short sentence, in the user's language, saying what the cell does (it titles \
the cell in the user's notebook). When your answer states a number that a cell printed, cite that cell right \
after it as a link `[cellule N](atelier-cell:N)` (N = the cell number), with the number written as the cell \
printed it or rounded: the app checks every cited number against the cell's output.\n</atelier-kernel>"
        )
    } else {
        "\n\n<atelier-kernel>\nThe user turned off the persistent Python kernel for this conversation: \
`atelier_python` no longer runs code and its variables are gone. Use your usual shell for Python again.\n</atelier-kernel>"
            .to_string()
    };
    Some((block, json!(on)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use atelier_kernel::KernelError;

    fn fil(extra: Value, session: Option<&str>) -> atelier_store::Thread {
        let mut v = json!({
            "id": "t", "projectRoot": "/p", "provider": "claude", "title": "",
            "status": "idle", "updatedAt": "", "createdAt": "",
        });
        if let Some(s) = session {
            v["sessionId"] = json!(s);
        }
        for (k, val) in extra.as_object().unwrap() {
            v[k] = val.clone();
        }
        serde_json::from_value(v).unwrap()
    }

    #[test]
    fn le_noyau_est_coupe_par_defaut() {
        assert!(!enabled(None));
        assert!(!enabled(Some(&fil(json!({}), None))));
        assert!(enabled(Some(&fil(json!({"kernelEnabled": true}), None))));
    }

    #[test]
    fn l_interrupteur_est_annonce_une_fois_par_changement() {
        // Coupé et jamais annoncé : rien.
        assert!(announcement(Some(&fil(json!({}), Some("s1"))), "claude").is_none());
        // Allumé : bloc d'allumage.
        let on = fil(
            json!({"kernelEnabled": true, "kernelEnv": "pymc-albedo"}),
            Some("s1"),
        );
        let (bloc, etat) = announcement(Some(&on), "codex").unwrap();
        assert!(bloc.contains("atelier_python") && bloc.contains("pymc-albedo"));
        assert_eq!(etat, json!(true));
        // Déjà annoncé à cette session : rien.
        let vu = fil(
            json!({"kernelEnabled": true, "kernelAnnounced": {"session": "s1", "on": true}}),
            Some("s1"),
        );
        assert!(announcement(Some(&vu), "claude").is_none());
        // Session neuve : on réannonce.
        let neuve = fil(
            json!({"kernelEnabled": true, "kernelAnnounced": {"session": "s0", "on": true}}),
            Some("s1"),
        );
        assert!(announcement(Some(&neuve), "claude").is_some());
        // Coupé après avoir été annoncé : bloc d'extinction.
        let coupe = fil(
            json!({"kernelEnabled": false, "kernelAnnounced": {"session": "s1", "on": true}}),
            Some("s1"),
        );
        let (bloc, etat) = announcement(Some(&coupe), "claude").unwrap();
        assert!(bloc.contains("turned off"));
        assert_eq!(etat, json!(false));
        // Provider sans MCP : jamais.
        assert!(announcement(Some(&on), "openrouter").is_none());
    }

    #[test]
    fn le_mode_lecture_seule_bloque_l_execution() {
        assert!(read_only(&fil(
            json!({"lastTurn": {"permissionMode": "plan"}}),
            None
        )));
        assert!(!read_only(&fil(
            json!({"lastTurn": {"permissionMode": "default"}}),
            None
        )));
    }

    #[test]
    fn les_erreurs_disent_quoi_faire() {
        assert!(KernelError::Busy(4).message().contains("cell=4"));
    }

    fn python() -> Option<String> {
        let out = std::process::Command::new("python3")
            .args(["-c", "import sys; print(sys.executable)"])
            .output()
            .ok()?;
        let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
        std::path::Path::new(&p).is_file().then_some(p)
    }

    #[tokio::test]
    async fn l_outil_suit_l_interrupteur_et_journalise_les_cellules() {
        let Some(py) = python() else {
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let projet = tempfile::tempdir().unwrap();
        let state = AppState::new(
            crate::paths::AppPaths::from_app_dir(dir.path().to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "hash".into(),
            "/tmp".into(),
        );
        let mut bus = state.subscribe_bus();
        let root = projet.path().display().to_string();
        state
            .threads()
            .lock()
            .await
            .upsert(
                json!({"id": "fil", "projectRoot": root, "provider": "codex"}),
                false,
            )
            .unwrap();
        let run = json!({"code": "y = 6 * 7\ny", "env": py});
        let off = action(&state, "fil", "kernel_run", &run).await.unwrap_err();
        assert!(off.starts_with("kernel_disabled"), "{off}");
        // Les envs restent consultables noyau coupé.
        assert!(action(&state, "fil", "kernel_envs", &json!({}))
            .await
            .is_ok());

        state
            .threads()
            .lock()
            .await
            .upsert(json!({"id": "fil", ENABLED_KEY: true}), false)
            .unwrap();
        let out = action(&state, "fil", "kernel_run", &run).await.unwrap();
        assert_eq!(out["cell"]["result"], "42", "{out}");
        // L'env retenu est gardé sur le fil.
        let fil = state.threads().lock().await.get("fil").cloned().unwrap();
        assert_eq!(fil.extra.get(ENV_KEY), Some(&json!(py)));
        let vars = action(&state, "fil", "kernel_variables", &json!({}))
            .await
            .unwrap();
        assert_eq!(vars["variables"][0]["name"], "y");

        // Le panneau a reçu le début et la fin de la cellule.
        let mut phases = Vec::new();
        while let Ok(msg) = bus.try_recv() {
            let v: Value = serde_json::from_str(&msg).unwrap();
            if v["type"] == "kernelCell" {
                phases.push(v["phase"].as_str().unwrap().to_string());
            }
        }
        assert_eq!(phases, ["started", "finished"]);
        let cells = handle_cells(&state, &json!({"threadId": "fil", "requestId": "r"})).await;
        let cells: Value = serde_json::from_str(&cells[0]).unwrap();
        assert_eq!(cells["cells"][0]["code"], "y = 6 * 7\ny");
        assert_eq!(cells["status"]["running"], true);
        assert_eq!(cells["chain"]["brokenAt"], Value::Null);

        // Chiffres cités par l'agent, vérifiés dans la sortie de la cellule.
        let checks = verify_claims(
            &state,
            "fil",
            &json!({"claims": [{"cell": 1, "value": "42"}, {"cell": 1, "value": "41"}, {"cell": 9, "value": "1"}]}),
        );
        assert_eq!(checks["checks"][0]["check"]["status"], "found", "{checks}");
        assert_eq!(checks["checks"][1]["check"]["status"], "missing");
        assert_eq!(checks["checks"][2]["check"]["status"], "nocell");

        // Cellule modifiée à la main : nouvelle cellule liée à l'originale,
        // annoncée une fois à l'agent avec les lignes changées.
        let out = rerun(&state, "fil", &json!({"code": "y = 6 * 8\ny", "fromCell": 1}))
            .await
            .unwrap();
        assert_eq!(out["cell"], 2);
        let done = action(&state, "fil", "kernel_wait", &json!({"cell": 2})).await.unwrap();
        assert_eq!(done["cell"]["result"], "48", "{done}");
        let record = state.kernels().journal().get("fil", 2).unwrap();
        assert_eq!(record.author.as_deref(), Some("user"));
        assert_eq!(record.from_cell, Some(1));
        let fil = state.threads().lock().await.get("fil").cloned().unwrap();
        let (block, last) = user_cells_block(&state, "fil", Some(&fil), "codex").unwrap();
        assert_eq!(last, 2);
        assert!(block.contains("- y = 6 * 7") && block.contains("+ y = 6 * 8"), "{block}");
        state
            .threads()
            .lock()
            .await
            .upsert(json!({"id": "fil", USER_CELLS_KEY: 2}), false)
            .unwrap();
        let fil = state.threads().lock().await.get("fil").cloned().unwrap();
        assert!(user_cells_block(&state, "fil", Some(&fil), "codex").is_none());

        // Export dans exports/noyau/ du projet.
        let out = export(&state, "fil", &json!({"format": "py"})).await.unwrap();
        let rel = out["rel"].as_str().unwrap();
        assert!(rel.starts_with("exports/noyau/") && rel.ends_with(".py"), "{rel}");
        let script = std::fs::read_to_string(projet.path().join(rel)).unwrap();
        assert!(script.contains("y = 6 * 8"), "{script}");

        // Couper l'interrupteur arrête le noyau au prochain appel.
        state
            .threads()
            .lock()
            .await
            .upsert(json!({"id": "fil", ENABLED_KEY: false}), false)
            .unwrap();
        assert!(action(&state, "fil", "kernel_variables", &json!({}))
            .await
            .is_err());
        assert!(!state.kernels().status("fil").running);

        on_delete_thread(&state, "fil").await;
        assert!(state.kernels().journal().list("fil", 10).is_empty());
    }
}
