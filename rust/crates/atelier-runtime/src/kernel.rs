//! Noyau Python persistant du fil (chantier 5) : outil de l'agent, consigne,
//! requêtes du panneau « Cellules ». Le noyau lui-même vit dans
//! `atelier-kernel` ; ce module le relie aux fils, au pont MCP et au bus.

use crate::state::AppState;
use atelier_kernel::usage::human_bytes;
use atelier_kernel::{CellEvent, KernelStatus, RunRequest};
use atelier_protocol::agent_mcp_limits as lim;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Un noyau sans cellule depuis ce délai est arrêté (ses variables avec).
const IDLE_SHUTDOWN: Duration = Duration::from_secs(30 * 60);
/// Attente maximale d'un appel `run` ou `wait` : le pont coupe à 65 s et
/// Codex à 60 s par défaut. Au-delà, l'agent reçoit « running » et revient.
const WAIT_MAX_SECS: u64 = 50;
const WAIT_DEFAULT_SECS: u64 = 45;
/// Rythme du relevé de mémoire et de processeur des noyaux vivants.
const USAGE_TICK: Duration = Duration::from_secs(5);

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

/// Mémoire et processeur de chaque noyau vivant, relevés sans lancer de
/// processus. Le relevé part dans `kernelStatus`, le message que le panneau
/// reçoit déjà, et seulement quand les chiffres ont bougé : un noyau au
/// repos ne publie rien.
pub fn spawn_usage_ticker(state: AppState) {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(USAGE_TICK);
        loop {
            tick.tick().await;
            for thread_id in state.kernels().usage_updates() {
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
    dispatch(state, caller_id, action, req, false).await
}

/// `from_panel` : la commande vient du panneau du noyau, pas de l'agent. Ce
/// que l'utilisateur fait là sans l'agent (redémarrer) lui est dit à sa
/// prochaine cellule.
async fn dispatch(
    state: &AppState,
    caller_id: &str,
    action: &str,
    req: &Value,
    from_panel: bool,
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
                    resumed_from: None,
                })
                .await
                .map_err(|e| e.message())?;
            if outcome.note.is_some() {
                remember_env(state, caller_id).await;
                publish_status(state, caller_id);
            }
            let mut out = serde_json::to_value(outcome).map_err(|e| e.to_string())?;
            attach_figures(state, caller_id, &mut out).await;
            out
        }
        "kernel_wait" => {
            let id = req
                .get("cell")
                .and_then(Value::as_u64)
                .ok_or("kernel_missing_cell — passe le numéro de la cellule dans cell.")?;
            let mut out = serde_json::to_value(
                kernels
                    .wait(caller_id, id, wait)
                    .await
                    .map_err(|e| e.message())?,
            )
            .map_err(|e| e.to_string())?;
            // Cellule longue enfin finie, ou cellule relue : ses figures
            // reviennent ici comme à la fin d'un `run`.
            attach_figures(state, caller_id, &mut out).await;
            out
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
                .restart(caller_id, &cwd, env, default_env, !from_panel)
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
        "kernel_status" => {
            let status = kernels.status(caller_id);
            let mut out = json!({
                "enabled": enabled(Some(&thread)),
                "idleShutdownSeconds": IDLE_SHUTDOWN.as_secs(),
                "lastCells": kernels.journal().list(caller_id, 5).iter().map(|c| json!({
                    "cell": c.id, "status": c.status, "startedAt": c.started_at,
                    "code": atelier_kernel::journal::clip(&c.code, 600),
                })).collect::<Vec<_>>(),
            });
            if let Some(memory) = memory_line(&status) {
                out["memory"] = json!(memory);
            }
            if let Some(stop) = &status.last_stop {
                out["note"] = json!(format!(
                    "{} : ses variables sont perdues. La prochaine cellule (action run) démarre un noyau neuf ; reprends d'abord les cellules dont la suite dépend (lastCells donne le code des dernières).",
                    stop.sentence()
                ));
            }
            out["status"] = json!(status);
            out
        }
        _ => return Err("unknown_action".into()),
    };
    Ok(out)
}

/// Joint à la réponse d'une cellule finie les images de ses figures (clé
/// réservée du pont, que le shim MCP rend en contenu image) et dit à
/// l'agent lesquelles il voit. Sans figure, la réponse ne change pas.
async fn attach_figures(state: &AppState, thread_id: &str, out: &mut Value) {
    let figures: Vec<String> = out["cell"]["figures"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|f| f.as_str().map(str::to_string))
        .collect();
    if figures.is_empty() {
        return;
    }
    let dir = state.kernels().figures_dir(thread_id);
    let found =
        tokio::task::spawn_blocking(move || crate::kernel_figures::attach(&dir, &figures)).await;
    let Ok(Some(found)) = found else {
        return;
    };
    out["cell"]["figuresSeen"] = json!(found.seen);
    if !found.images.is_empty() {
        out[lim::BRIDGE_IMAGES_KEY] = json!(found.images);
    }
}

/// Mémoire du noyau en clair, pour que l'agent s'adapte avant de charger de
/// grosses données.
fn memory_line(status: &KernelStatus) -> Option<String> {
    let rss = status.rss_bytes?;
    let who = match status.processes {
        Some(n) if n > 1 => format!(" (noyau et {} sous-processus)", n - 1),
        _ => String::new(),
    };
    let machine = atelier_kernel::usage::machine_memory_bytes()
        .map(|total| format!(" ; la machine a {} de mémoire physique", human_bytes(total)))
        .unwrap_or_default();
    Some(format!(
        "Le noyau occupe {} de mémoire résidente{who}{machine}.",
        human_bytes(rss)
    ))
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
            dispatch(state, thread_id, &format!("kernel_{op}"), msg, true).await
        }
        "link" => link_file(state, thread_id, msg).await,
        "verify" => Ok(verify_claims(state, thread_id, msg)),
        "rerun" => rerun(state, thread_id, msg).await,
        "replay" => start_replay(state, thread_id).await,
        "cancelReplay" => Ok(json!({"cancelled": state.kernels().cancel_replay(thread_id)})),
        "export" => export(state, thread_id, msg).await,
        "projectThreads" => Ok(project_threads(state, thread_id).await),
        "resume" => resume(state, thread_id, msg).await,
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
            resumed_from: None,
        })
        .await
        .map_err(|e| e.message())?;
    if outcome.note.is_some() {
        remember_env(state, thread_id).await;
        publish_status(state, thread_id);
    }
    Ok(json!({"cell": outcome.cell["cell"]}))
}

/// Autres fils du même projet qui ont des cellules, le plus récent d'abord :
/// de quoi reprendre là où on en était depuis un nouveau fil.
async fn project_threads(state: &AppState, thread_id: &str) -> Value {
    let others: Vec<(String, String)> = {
        let store = state.threads().lock().await;
        let Some(root) = store
            .get(thread_id)
            .map(|t| t.project_root.clone())
            .filter(|r| !r.is_empty())
        else {
            return json!({"threads": []});
        };
        store
            .list()
            .into_iter()
            .filter(|t| t.id != thread_id && t.project_root == root)
            .map(|t| (t.id, t.title))
            .collect()
    };
    let journal = state.kernels().journal();
    let mut rows: Vec<Value> = others
        .into_iter()
        .filter_map(|(id, title)| {
            let cells = journal.list(&id, RESUME_MAX_CELLS);
            let last = cells.last()?;
            Some(json!({
                "threadId": id,
                "title": title,
                "cells": cells.len(),
                "ok": cells.iter().filter(|c| c.status == "ok").count(),
                "lastAt": last.started_at,
                "lastPurpose": last.purpose,
            }))
        })
        .collect();
    rows.sort_by(|a, b| b["lastAt"].as_str().cmp(&a["lastAt"].as_str()));
    rows.truncate(20);
    json!({"threads": rows})
}

/// Cellules relues au plus dans un autre fil.
const RESUME_MAX_CELLS: usize = 500;
/// Attente d'une cellule reprise avant de relire où elle en est.
const RESUME_WAIT: Duration = Duration::from_secs(600);

/// Fils dont une reprise tourne : une seule à la fois par fil.
fn resuming() -> &'static std::sync::Mutex<std::collections::HashSet<String>> {
    static SET: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    SET.get_or_init(Default::default)
}

/// Reprend ici des cellules d'un autre fil du même projet (`fromThread`) :
/// toutes ses cellules réussies, ou celles de `cells`, relancées une à une
/// dans l'ordre dans le noyau de ce fil, chacune liée à son origine. Arrêt à
/// la première erreur. L'avancement part sur le bus (`kernelResume`).
async fn resume(state: &AppState, thread_id: &str, msg: &Value) -> Result<Value, String> {
    let (thread, source) = {
        let store = state.threads().lock().await;
        let source = msg
            .get("fromThread")
            .and_then(Value::as_str)
            .and_then(|id| store.get(id).cloned());
        (store.get(thread_id).cloned(), source)
    };
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
    let Some(source) = source.filter(|s| s.id != thread.id && s.project_root == thread.project_root) else {
        return Err("kernel_resume_source — ce fil n'est pas du même projet.".into());
    };
    let wanted: Option<Vec<u64>> = msg
        .get("cells")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_u64).collect());
    let cells: Vec<atelier_kernel::CellRecord> = state
        .kernels()
        .journal()
        .list(&source.id, RESUME_MAX_CELLS)
        .into_iter()
        .filter(|c| match &wanted {
            Some(ids) => ids.contains(&c.id),
            None => c.status == "ok",
        })
        .collect();
    if cells.is_empty() {
        return Err("kernel_resume_empty — aucune cellule à reprendre dans ce fil.".into());
    }
    if let Some(busy) = state.kernels().status(thread_id).busy_cell {
        return Err(format!("kernel_busy — la cellule {busy} tourne encore."));
    }
    if state.kernels().replaying(thread_id)
        || !resuming().lock().unwrap_or_else(|e| e.into_inner()).insert(thread_id.to_string())
    {
        return Err("kernel_resume_running — une reprise ou un rejeu tourne déjà dans ce fil.".into());
    }
    let total = cells.len();
    let default_env = thread.extra.get(ENV_KEY).and_then(Value::as_str).map(str::to_string);
    let (state, thread_id) = (state.clone(), thread_id.to_string());
    tokio::spawn(async move {
        let publish = |done: usize, extra: Value| {
            let mut message = json!({
                "type": "kernelResume",
                "threadId": thread_id,
                "fromThread": source.id,
                "state": "running",
                "done": done,
                "total": total,
            });
            if let (Some(o), Some(e)) = (message.as_object_mut(), extra.as_object()) {
                o.extend(e.clone());
            }
            state.publish(message.to_string());
        };
        let mut done = 0;
        let mut error: Option<String> = None;
        for cell in &cells {
            publish(done, json!({"cell": cell.id}));
            let outcome = state
                .kernels()
                .run(RunRequest {
                    thread_id: &thread_id,
                    cwd: &cwd,
                    env: None,
                    default_env: default_env.as_deref(),
                    code: &cell.code,
                    wait: RESUME_WAIT,
                    turn_id: None,
                    purpose: cell.purpose.as_deref(),
                    author: Some("user"),
                    from_cell: None,
                    resumed_from: Some(atelier_kernel::ResumedFrom {
                        thread_id: source.id.clone(),
                        title: source.title.clone(),
                        cell: cell.id,
                    }),
                })
                .await;
            let mut outcome = match outcome {
                Ok(outcome) => outcome,
                Err(e) => {
                    error = Some(e.message());
                    break;
                }
            };
            if outcome.note.is_some() {
                remember_env(&state, &thread_id).await;
                publish_status(&state, &thread_id);
            }
            let id = outcome.cell["cell"].as_u64().unwrap_or(0);
            while !outcome.finished {
                outcome = match state.kernels().wait(&thread_id, id, RESUME_WAIT).await {
                    Ok(next) => next,
                    Err(e) => {
                        error = Some(e.message());
                        break;
                    }
                };
            }
            if error.is_some() {
                break;
            }
            if outcome.cell["status"] == "error" {
                error = Some(format!("kernel_resume_error — la cellule {id} (reprise de [{}]) a échoué.", cell.id));
                break;
            }
            done += 1;
        }
        resuming().lock().unwrap_or_else(|e| e.into_inner()).remove(&thread_id);
        publish(done, json!({"state": "done", "error": error}));
        publish_status(&state, &thread_id);
    });
    Ok(json!({"started": true, "total": total}))
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
The user wrote or edited kernel cells and ran them themselves since your last turn. Their versions now shape the kernel state: build on them, do not silently redo your earlier version. Cite them like your own cells ([cellule N](atelier-cell:N)).
",
    );
    let (resumed, cells): (Vec<_>, Vec<_>) = cells.into_iter().partition(|c| c.resumed_from.is_some());
    if let (Some(first), Some(end)) = (resumed.first(), resumed.last()) {
        let from = first.resumed_from.as_ref().map(|r| r.title.as_str()).unwrap_or("");
        let failed = resumed.iter().filter(|c| c.status != "ok").count();
        block.push_str(&format!(
            "- Cells {}–{} re-run here from the earlier thread « {from} » to restore its kernel state ({} cells, {failed} failed). Their variables are now loaded.\n",
            first.id,
            end.id,
            resumed.len()
        ));
    }
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
figures with savefig (the backend is Agg) and leave them open (no plt.close()): the matplotlib figures still open \
when a cell ends are captured as PNG, and the first {figures} of a cell come back to you as images in the tool \
result, on \"run\" and on \"wait\" (`figuresSeen` says which; a figure over {figure_mb} MB or {figure_side} px, or \
beyond the first {figures}, comes back as a path only). You see what you plot: look at every image before you \
describe or show it (axes, units, legend, empty panels, overlapping text) and fix the code if it is wrong. Keep \
using the shell for git, file management and non-Python tools.\n\
The kernel is stopped after {idle} minutes without a cell, and its variables with it. The next run then starts a \
fresh kernel and says so first (`attention`): re-run the cells you still need before going on. Action \"status\" \
gives the kernel's memory (`memory`, `status.rssBytes`): check it before loading large data.\n\
Give each run a `purpose`: one short sentence, in the user's language, saying what the cell does (it titles \
the cell in the user's notebook). When your answer states a number that a cell printed, cite that cell right \
after it as a link `[cellule N](atelier-cell:N)` (N = the cell number), with the number written as the cell \
printed it or rounded: the app checks every cited number against the cell's output.\n</atelier-kernel>",
            figures = crate::kernel_figures::ATTACHED_MAX,
            figure_mb = crate::kernel_figures::BYTES_MAX / (1024 * 1024),
            figure_side = crate::kernel_figures::SIDE_MAX,
            idle = IDLE_SHUTDOWN.as_secs() / 60,
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

    #[test]
    fn la_consigne_dit_que_l_agent_voit_ses_figures_et_que_le_noyau_s_arrete() {
        let on = fil(json!({"kernelEnabled": true}), Some("s1"));
        let (bloc, _) = announcement(Some(&on), "claude").unwrap();
        for attendu in [
            "the first 3 of a cell come back to you as images in the tool result, on \"run\" and on \"wait\"",
            "`figuresSeen`",
            "a figure over 1 MB or 4096 px",
            "look at every image before you describe or show it",
            "stopped after 30 minutes without a cell",
            "`attention`",
            "`status.rssBytes`",
        ] {
            assert!(bloc.contains(attendu), "« {attendu} » manque : {bloc}");
        }
    }

    /// Fil « fil » au noyau allumé, dans un projet vide.
    async fn etat_avec_noyau(dir: &Path, projet: &Path) -> AppState {
        let state = AppState::new(
            crate::paths::AppPaths::from_app_dir(dir.to_path_buf()),
            None,
            "t".into(),
            "0.1.0".into(),
            "hash".into(),
            "/tmp".into(),
        );
        state
            .threads()
            .lock()
            .await
            .upsert(
                json!({"id": "fil", "projectRoot": projet.display().to_string(),
                       "provider": "claude", ENABLED_KEY: true}),
                false,
            )
            .unwrap();
        state
    }

    /// Faux pyplot (matplotlib n'est pas requis) : `ouvertes` liste les
    /// figures ouvertes, et `savefig` écrit un vrai PNG de (40 + n)×30.
    const FAUX_PYPLOT: &str = r#"
import struct, sys, types, zlib
def _png(largeur, hauteur):
    def bloc(nom, d):
        return struct.pack(">I", len(d)) + nom + d + struct.pack(">I", zlib.crc32(nom + d) & 0xffffffff)
    lignes = b"".join(b"\x00" + b"\xff" * (3 * largeur) for _ in range(hauteur))
    entete = struct.pack(">IIBBBBB", largeur, hauteur, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + bloc(b"IHDR", entete) + bloc(b"IDAT", zlib.compress(lignes)) + bloc(b"IEND", b"")
plt = types.ModuleType("matplotlib.pyplot")
ouvertes = [1, 2, 3, 4]
class Fig:
    def __init__(self, n): self.n = n
    def savefig(self, chemin, **kw): open(chemin, "wb").write(_png(40 + self.n, 30))
plt.get_fignums = lambda: list(ouvertes)
plt.figure = lambda n: Fig(n)
plt.close = lambda quoi: ouvertes.clear()
sys.modules["matplotlib.pyplot"] = plt
"#;

    fn images(out: &Value) -> Vec<Vec<u8>> {
        use base64::Engine;
        out[lim::BRIDGE_IMAGES_KEY]
            .as_array()
            .into_iter()
            .flatten()
            .map(|image| {
                assert_eq!(image["mimeType"], "image/png");
                base64::engine::general_purpose::STANDARD
                    .decode(image["data"].as_str().unwrap())
                    .unwrap()
            })
            .collect()
    }

    #[tokio::test]
    async fn l_agent_recoit_ses_figures_en_images_au_run_au_wait_et_apres_un_rejeu() {
        let Some(py) = python() else {
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let projet = tempfile::tempdir().unwrap();
        let state = etat_avec_noyau(dir.path(), projet.path()).await;

        // Quatre figures ouvertes : trois jointes en image, la quatrième en chemin.
        let out = action(&state, "fil", "kernel_run", &json!({"code": FAUX_PYPLOT, "env": py}))
            .await
            .unwrap();
        assert_eq!(out["cell"]["status"], "ok", "{out}");
        assert_eq!(out["cell"]["figures"].as_array().unwrap().len(), 4);
        let vues = images(&out);
        assert_eq!(vues.len(), 3);
        for (rang, png) in vues.iter().enumerate() {
            let fichier = std::fs::read(out["cell"]["figures"][rang].as_str().unwrap()).unwrap();
            assert_eq!(png, &fichier, "l'image jointe est le PNG de la figure, dans l'ordre");
            assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        }
        let dit = out["cell"]["figuresSeen"].as_str().unwrap();
        assert!(
            dit.starts_with("Images jointes à ce résultat, dans l'ordre : figure 1 (41×30 px), figure 2 (42×30 px), figure 3 (43×30 px). Chemin seul, sans image : figure 4 (au-delà de 3 images par cellule)."),
            "{dit}"
        );
        // Le pont laisse passer la réponse avec ses images.
        let borne = crate::agent_mcp::bound_response(out.clone());
        assert_eq!(borne, out);

        // Sans figure, la réponse ne change pas.
        let out = action(&state, "fil", "kernel_run", &json!({"code": "1 + 1"}))
            .await
            .unwrap();
        assert!(out.get(lim::BRIDGE_IMAGES_KEY).is_none(), "{out}");
        assert!(out["cell"].get("figuresSeen").is_none(), "{out}");

        // Cellule longue : rien avec « running », la figure arrive au wait.
        let longue = "import time\ntime.sleep(1)\nouvertes.append(7)";
        let out = action(&state, "fil", "kernel_run", &json!({"code": longue, "waitSeconds": 0}))
            .await
            .unwrap();
        assert_eq!(out["cell"]["status"], "running", "{out}");
        assert!(out.get(lim::BRIDGE_IMAGES_KEY).is_none(), "{out}");
        let fin = action(&state, "fil", "kernel_wait", &json!({"cell": 3}))
            .await
            .unwrap();
        assert_eq!(fin["cell"]["status"], "ok", "{fin}");
        assert_eq!(images(&fin).len(), 1, "{fin}");
        assert!(
            fin["cell"]["figuresSeen"].as_str().unwrap().contains("figure 1 (47×30 px)"),
            "{fin}"
        );

        // Rejouer à neuf écrit ses figures ailleurs et les efface : celles
        // des cellules d'origine restent là pour l'agent.
        state.kernels().shutdown("fil").await;
        let bilan = state
            .kernels()
            .replay("fil", projet.path(), |_, _, _| {})
            .await
            .unwrap();
        assert_eq!(bilan.error, 0, "{bilan:?}");
        assert!(!state.kernels().kernel_dir().join("replay-figures").join(atelier_kernel::journal::thread_key("fil")).exists());
        let relue = action(&state, "fil", "kernel_wait", &json!({"cell": 1}))
            .await
            .unwrap();
        assert_eq!(images(&relue), vues, "{}", relue["cell"]["figuresSeen"]);

        // Figure effacée du disque : chemin seul, et la réponse le dit.
        std::fs::remove_file(relue["cell"]["figures"][0].as_str().unwrap()).unwrap();
        let relue = action(&state, "fil", "kernel_wait", &json!({"cell": 1}))
            .await
            .unwrap();
        assert_eq!(images(&relue).len(), 3, "la quatrième figure prend la place libre");
        assert!(
            relue["cell"]["figuresSeen"].as_str().unwrap().contains("figure 1 (fichier absent)"),
            "{relue}"
        );
        state.kernels().shutdown_all().await;
    }

    #[tokio::test]
    async fn l_agent_est_prevenu_quand_le_noyau_a_ete_fauche_et_voit_sa_memoire() {
        let Some(py) = python() else {
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let projet = tempfile::tempdir().unwrap();
        let state = etat_avec_noyau(dir.path(), projet.path()).await;
        let out = action(&state, "fil", "kernel_run", &json!({"code": "a = 41", "env": py}))
            .await
            .unwrap();
        assert!(out.get("attention").is_none(), "{out}");

        // État demandé par l'agent : mémoire du noyau, délai d'arrêt.
        let etat = action(&state, "fil", "kernel_status", &json!({})).await.unwrap();
        assert_eq!(etat["idleShutdownSeconds"], 1800);
        assert_eq!(etat["status"]["running"], true);
        if cfg!(any(target_os = "linux", target_os = "macos")) {
            assert!(etat["status"]["rssBytes"].as_u64().unwrap() > 1024 * 1024, "{etat}");
            let memoire = etat["memory"].as_str().unwrap();
            assert!(
                memoire.starts_with("Le noyau occupe ") && memoire.contains("de mémoire résidente ; la machine a "),
                "{memoire}"
            );
        }

        // Le relevé part dans le `kernelStatus` que le panneau reçoit déjà.
        let mut bus = state.subscribe_bus();
        spawn_usage_ticker(state.clone());
        let message = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let v: Value = serde_json::from_str(&bus.recv().await.unwrap()).unwrap();
                if v["type"] == "kernelStatus" {
                    return v;
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(message["threadId"], "fil");
        assert_eq!(message["status"]["running"], true);
        if cfg!(any(target_os = "linux", target_os = "macos")) {
            assert!(message["status"]["rssBytes"].as_u64().unwrap() > 0, "{message}");
            assert_eq!(message["status"]["processes"], 1);
        }

        // Fauché pour inactivité : l'état le dit, puis la cellule suivante.
        assert_eq!(state.kernels().reap_idle(Duration::ZERO).await, vec!["fil".to_string()]);
        let etat = action(&state, "fil", "kernel_status", &json!({})).await.unwrap();
        assert_eq!(etat["status"]["running"], false);
        assert_eq!(etat["status"]["lastStop"]["reason"], "idle");
        let note = etat["note"].as_str().unwrap();
        assert!(note.contains("inactivité") && note.contains("variables sont perdues"), "{note}");
        assert_eq!(etat["lastCells"][0]["code"], "a = 41");
        let refus = action(&state, "fil", "kernel_variables", &json!({})).await.unwrap_err();
        assert!(refus.starts_with("no_kernel") && refus.contains("inactivité"), "{refus}");

        let out = action(&state, "fil", "kernel_run", &json!({"code": "a + 1"}))
            .await
            .unwrap();
        assert_eq!(out["cell"]["error"]["ename"], "NameError", "{out}");
        let attention = out["attention"].as_str().unwrap();
        for attendu in ["noyau neuf", "inactivité", "par la cellule 1 n'existent plus", "Reprends d'abord"] {
            assert!(attention.contains(attendu), "« {attendu} » manque : {attention}");
        }
        // L'avertissement ouvre le texte que l'agent lit.
        assert!(serde_json::to_string_pretty(&out).unwrap().starts_with("{\n  \"attention\":"));

        // L'agent reprend la cellule perdue ; plus rien à signaler ensuite.
        let out = action(&state, "fil", "kernel_run", &json!({"code": "a = 41\na + 1"}))
            .await
            .unwrap();
        assert_eq!(out["cell"]["result"], "42", "{out}");
        assert!(out.get("attention").is_none() && out.get("note").is_none(), "{out}");

        // Fauché, puis relancé par l'utilisateur (bouton Démarrer du panneau,
        // cellule écrite à la main) : l'agent n'a rien vu, sa cellule
        // suivante le lui dit quand même.
        state.kernels().reap_idle(Duration::ZERO).await;
        let reponse = handle_command(&state, &json!({"threadId": "fil", "op": "restart"})).await;
        assert!(reponse[0].contains("\"restarted\":true"), "{reponse:?}");
        let main = rerun(&state, "fil", &json!({"code": "b = 1"})).await.unwrap();
        action(&state, "fil", "kernel_wait", &json!({"cell": main["cell"]}))
            .await
            .unwrap();
        let out = action(&state, "fil", "kernel_run", &json!({"code": "a"}))
            .await
            .unwrap();
        assert_eq!(out["cell"]["error"]["ename"], "NameError", "{out}");
        let attention = out["attention"].as_str().unwrap();
        assert!(
            attention.contains("noyau neuf") && attention.contains("inactivité"),
            "{attention}"
        );

        // Redémarrage demandé par l'agent : sa réponse le dit déjà, la
        // cellule suivante n'a rien à ajouter.
        let out = action(&state, "fil", "kernel_restart", &json!({})).await.unwrap();
        assert_eq!(out["note"], "Noyau neuf : les variables précédentes sont perdues.");
        let out = action(&state, "fil", "kernel_run", &json!({"code": "1"}))
            .await
            .unwrap();
        assert!(out.get("attention").is_none(), "{out}");
        state.kernels().shutdown_all().await;
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

    #[tokio::test]
    async fn un_nouveau_fil_reprend_les_cellules_d_un_fil_precedent() {
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
        let root = projet.path().display().to_string();
        for (id, title) in [("ancien", "Albédo 2024"), ("neuf", "Rédacteur"), ("ailleurs", "Autre")] {
            let project = if id == "ailleurs" { "/autre".to_string() } else { root.clone() };
            state
                .threads()
                .lock()
                .await
                .upsert(
                    json!({"id": id, "projectRoot": project, "provider": "codex", "title": title,
                           ENABLED_KEY: true, ENV_KEY: py}),
                    false,
                )
                .unwrap();
        }
        for code in ["a = 6 * 7", "b = a + 1\nb", "1 / 0"] {
            let out = action(&state, "ancien", "kernel_run", &json!({"code": code})).await.unwrap();
            assert!(out["finished"] == true, "{out}");
        }
        state.kernels().shutdown("ancien").await;

        // Le nouveau fil voit l'ancien (même projet), pas l'autre projet.
        let list = project_threads(&state, "neuf").await;
        assert_eq!(list["threads"].as_array().unwrap().len(), 1, "{list}");
        assert_eq!(list["threads"][0]["threadId"], "ancien");
        assert_eq!(list["threads"][0]["cells"], 3);
        assert_eq!(list["threads"][0]["ok"], 2);
        assert!(resume(&state, "neuf", &json!({"fromThread": "ailleurs"})).await.is_err());

        // Reprendre : les cellules réussies, dans l'ordre, liées à l'origine.
        let mut bus = state.subscribe_bus();
        let out = resume(&state, "neuf", &json!({"fromThread": "ancien"})).await.unwrap();
        assert_eq!(out["total"], 2);
        let end = tokio::time::timeout(Duration::from_secs(60), async {
            loop {
                let v: Value = serde_json::from_str(&bus.recv().await.unwrap()).unwrap();
                if v["type"] == "kernelResume" && v["state"] == "done" {
                    return v;
                }
            }
        })
        .await
        .unwrap();
        assert_eq!(end["done"], 2, "{end}");
        assert_eq!(end["error"], Value::Null);
        let vars = action(&state, "neuf", "kernel_variables", &json!({})).await.unwrap();
        let names: Vec<&str> = vars["variables"].as_array().unwrap().iter().filter_map(|v| v["name"].as_str()).collect();
        assert!(names.contains(&"a") && names.contains(&"b"), "{vars}");
        let record = state.kernels().journal().get("neuf", 2).unwrap();
        assert_eq!(record.author.as_deref(), Some("user"));
        let from = record.resumed_from.unwrap();
        assert_eq!((from.thread_id.as_str(), from.title.as_str(), from.cell), ("ancien", "Albédo 2024", 2));

        // Cellule libre écrite à la main, sans cellule d'origine.
        let out = rerun(&state, "neuf", &json!({"code": "b * 2"})).await.unwrap();
        let done = action(&state, "neuf", "kernel_wait", &json!({"cell": out["cell"]})).await.unwrap();
        assert_eq!(done["cell"]["result"], "86", "{done}");

        // L'agent apprend la reprise en une ligne, puis la cellule libre.
        let fil = state.threads().lock().await.get("neuf").cloned().unwrap();
        let (block, last) = user_cells_block(&state, "neuf", Some(&fil), "codex").unwrap();
        assert_eq!(last, 3);
        assert!(block.contains("Cells 1–2 re-run here from the earlier thread « Albédo 2024 »"), "{block}");
        assert!(block.contains("b * 2"), "{block}");
        state.kernels().shutdown("neuf").await;
    }
}
