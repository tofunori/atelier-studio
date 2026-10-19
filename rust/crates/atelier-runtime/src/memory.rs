//! Mémoire de projet (chantier 3 du plan rattrapage-claude-science-2026-10-18).
//!
//! - 3a : le magasin vit dans `atelier-store` (`memories.json`) ; ce module
//!   l'expose au front (Réglages › Mémoire) par les messages `memory*`.
//! - 3b : import en lecture seule des souvenirs de Claude Science, projet
//!   par projet, vers le projet d'Atelier choisi.
//! - 3c : bloc `<atelier-memory>` ajouté au message, avec les souvenirs du
//!   projet qui partagent les mots rares de la demande. Une session de
//!   fournisseur ne reçoit jamais deux fois le même souvenir.
//! - 3d : l'agent propose un souvenir (`propose_memory`, carte Garder ou
//!   Écarter) ; l'extraction automatique en fin de tour est COUPÉE par
//!   défaut (`settings.memoire.extraction`) et ne fait, elle aussi, que des
//!   propositions.

use crate::state::AppState;
use atelier_store::{ImportedMemory, Memory, MemoryOrigin, MemoryQuery};
use serde_json::{json, Value};
use std::collections::HashSet;
use uuid::Uuid;

/// Bornes du bloc injecté : quelques souvenirs courts, jamais un dossier.
pub const BLOC_MAX_ITEMS: usize = 8;
pub const BLOC_ITEM_MAX: usize = 500;
pub const BLOC_MAX_CHARS: usize = 3_500;
/// Souvenirs retenus comme « déjà donnés » à une session (les plus récents).
const DONNES_MAX: usize = 400;
/// Propositions d'une extraction automatique.
pub const EXTRACTION_MAX: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Reglages {
    /// Souvenirs utiles en tête du message. Éteint par défaut tant que
    /// Thierry ne l'a pas essayé (audit du 2026-10-18) : né allumé avec #54,
    /// le bloc partait dans chaque tour (automatisations et messages entre
    /// agents compris) dès qu'un souvenir partageait un mot avec la demande,
    /// sans paraître dans le reçu du tour. Seul un `true` explicite l'allume.
    pub injection: bool,
    /// Extraction automatique en fin de tour. Coupée par défaut (plan).
    pub extraction: bool,
}

pub fn reglages(settings: &Value) -> Reglages {
    let m = settings.get("memoire");
    let flag = |key: &str, default: bool| {
        m.and_then(|m| m.get(key))
            .and_then(Value::as_bool)
            .unwrap_or(default)
    };
    Reglages {
        injection: flag("injection", false),
        extraction: flag("extraction", false),
    }
}

fn tronque(s: &str, max: usize) -> String {
    let court: String = s.chars().take(max).collect();
    if court.chars().count() < s.chars().count() {
        format!("{}…", court.trim_end())
    } else {
        court
    }
}

fn date_courte(iso: &str) -> &str {
    iso.get(..10).unwrap_or(iso)
}

/// Souvenirs déjà donnés à la session native du fil (`extra.memoiresDonnees`).
pub fn deja_donnes(previous: Option<&atelier_store::Thread>) -> HashSet<String> {
    let Some(thread) = previous else {
        return HashSet::new();
    };
    let Some(session) = thread.session_id.as_deref().filter(|s| !s.is_empty()) else {
        return HashSet::new();
    };
    let Some(donnes) = thread.extra.get("memoiresDonnees") else {
        return HashSet::new();
    };
    if donnes.get("session").and_then(Value::as_str) != Some(session) {
        return HashSet::new();
    }
    donnes
        .get("ids")
        .and_then(Value::as_array)
        .map(|ids| {
            ids.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Valeur de `extra.memoiresDonnees` après un tour.
pub fn donnes_apres(session: &str, avant: &HashSet<String>, ce_tour: &[String]) -> Value {
    let mut ids: Vec<String> = avant
        .iter()
        .filter(|id| !ce_tour.contains(id))
        .cloned()
        .collect();
    ids.sort();
    ids.extend(ce_tour.iter().cloned());
    let debut = ids.len().saturating_sub(DONNES_MAX);
    json!({"session": session, "ids": &ids[debut..]})
}

/// Texte du bloc pour ces souvenirs. `mcp` : le fournisseur a les outils
/// d'Atelier (recherche, proposition).
pub fn rendre_bloc(souvenirs: &[Memory], mcp: bool) -> (String, Vec<String>) {
    let mut lignes = Vec::new();
    let mut ids = Vec::new();
    let mut taille = 0usize;
    let mut claude_science = false;
    for m in souvenirs.iter().take(BLOC_MAX_ITEMS) {
        let ligne = format!(
            "- ({}) {}",
            date_courte(&m.created_at),
            tronque(&m.text.replace('\n', " "), BLOC_ITEM_MAX)
        );
        if taille + ligne.len() > BLOC_MAX_CHARS && !lignes.is_empty() {
            break;
        }
        taille += ligne.len();
        claude_science |= m.origin.kind == "claude-science";
        lignes.push(ligne);
        ids.push(m.id.clone());
    }
    if lignes.is_empty() {
        return (String::new(), ids);
    }
    let origine = if claude_science {
        "from earlier conversations, some imported from Claude Science"
    } else {
        "from earlier conversations"
    };
    let outils = if mcp {
        "\nTo search more notes, call the MCP tool `atelier_sessions` with action \"memories\" and a query. When the user states a lasting decision or a note turns out wrong, call action \"propose_memory\" (text; replaceId to correct a note): it shows a card the user keeps or dismisses, so never write notes to a file."
    } else {
        ""
    };
    (
        format!(
            "\n\n<atelier-memory>\nProject notes Atelier keeps ({origine}). They were picked because they share words with this message: use them when they help, and trust the files and the user's words over them when they disagree.\n{}{outils}\n</atelier-memory>",
            lignes.join("\n")
        ),
        ids,
    )
}

/// Bloc du tour (3c) : `None` si coupé, sans souvenir utile ou déjà tout
/// donné à cette session.
pub async fn bloc_du_tour(
    state: &AppState,
    settings: &Value,
    project_root: &str,
    prompt: &str,
    exclude: &HashSet<String>,
    provider: &str,
) -> Option<(String, Vec<String>)> {
    if !reglages(settings).injection {
        return None;
    }
    let choisis =
        state
            .memories()
            .lock()
            .await
            .relevant(project_root, prompt, exclude, BLOC_MAX_ITEMS);
    let (bloc, ids) = rendre_bloc(
        &choisis,
        crate::agent_mcp::is_mcp_compatible_provider(provider),
    );
    (!bloc.is_empty()).then_some((bloc, ids))
}

fn memory_json(m: &Memory) -> Value {
    serde_json::to_value(m).unwrap_or(Value::Null)
}

fn str_of<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

fn origin_de(v: Option<&Value>) -> MemoryOrigin {
    let mut origin = v
        .cloned()
        .and_then(|o| serde_json::from_value::<MemoryOrigin>(o).ok())
        .unwrap_or_default();
    // Le front ne peut pas se faire passer pour un import.
    if !matches!(origin.kind.as_str(), "manual" | "agent" | "extraction") {
        origin.kind = "manual".into();
    }
    origin.source_id = None;
    origin.source_project = None;
    origin
}

// ---- Messages du front (Réglages › Mémoire, cartes) ----

pub async fn handle_list(state: &AppState, msg: &Value) -> Value {
    let q = MemoryQuery {
        project_root: msg
            .get("projectRoot")
            .and_then(Value::as_str)
            .map(str::to_string),
        text: str_of(msg, "query").to_string(),
        origin: msg
            .get("origin")
            .and_then(Value::as_str)
            .filter(|o| !o.is_empty())
            .map(str::to_string),
        include_superseded: msg
            .get("includeSuperseded")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        offset: msg.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize,
        limit: msg
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(50)
            .min(500) as usize,
    };
    let mut store = state.memories().lock().await;
    store.refresh();
    let (items, total) = store.list(&q);
    let mut reply = json!({
        "type": "memories",
        "requestId": msg.get("requestId").cloned().unwrap_or(Value::Null),
        "items": items.iter().map(memory_json).collect::<Vec<_>>(),
        "total": total,
        "counts": store.counts(),
    });
    // memories.json illisible : Réglages › Mémoire affiche l'erreur au lieu
    // d'une liste vide (et tout ajout est refusé tant qu'il n'est pas réparé).
    if let Some(error) = store.load_error() {
        reply["ok"] = json!(false);
        reply["error"] = json!(error);
    }
    reply
}

pub async fn handle_save(state: &AppState, msg: &Value) -> Value {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let memory = msg.get("memory").cloned().unwrap_or(Value::Null);
    let text = str_of(&memory, "text");
    let id = str_of(&memory, "id");
    let replace_id = str_of(msg, "replaceId");
    let origin = origin_de(msg.get("origin"));
    let mut store = state.memories().lock().await;
    let result = if !id.is_empty() {
        store.update(id, text, memory.get("projectRoot").and_then(Value::as_str))
    } else if !replace_id.is_empty() {
        store.supersede(replace_id, text, origin)
    } else {
        store.add(str_of(&memory, "projectRoot"), text, origin)
    };
    match result {
        Ok(m) => {
            json!({"type":"memorySaved","requestId":request_id,"ok":true,"memory":memory_json(&m)})
        }
        Err(error) => json!({"type":"memorySaved","requestId":request_id,"ok":false,"error":error}),
    }
}

pub async fn handle_delete(state: &AppState, msg: &Value) -> Value {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let mut store = state.memories().lock().await;
    let result = if let Some(source) = msg.get("importedFrom").filter(|v| !v.is_null()) {
        // `"<projet Claude Science>"` (`""` : sans projet) ou `true` : tout
        match source {
            Value::String(name) => store.remove_imported(Some(name)),
            Value::Bool(true) => store.remove_imported(None),
            _ => Ok(0),
        }
    } else {
        let ids: Vec<String> = msg
            .get("ids")
            .and_then(Value::as_array)
            .map(|ids| {
                ids.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        store.remove(&ids)
    };
    match result {
        Ok(removed) => {
            json!({"type":"memoryDeleted","requestId":request_id,"ok":true,"removed":removed})
        }
        Err(error) => {
            json!({"type":"memoryDeleted","requestId":request_id,"ok":false,"error":error})
        }
    }
}

fn home() -> Result<std::path::PathBuf, String> {
    std::env::var("HOME")
        .map(std::path::PathBuf::from)
        .map_err(|_| "HOME introuvable".to_string())
}

/// Aperçu de l'import (3b) : projets de Claude Science et combien de leurs
/// souvenirs sont déjà dans Atelier.
pub async fn handle_claude_science_preview(state: &AppState, msg: &Value) -> Value {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let overview =
        tokio::task::spawn_blocking(|| atelier_workspace::claude_science_memory_overview(&home()?))
            .await
            .unwrap_or_else(|e| Err(e.to_string()));
    let overview = match overview {
        Ok(o) => o,
        Err(error) => {
            return json!({"type":"memoryClaudeScience","requestId":request_id,"ok":false,"error":error,"projects":[]})
        }
    };
    let store = state.memories().lock().await;
    let (deja, _) = store.list(&MemoryQuery {
        origin: Some("claude-science".into()),
        include_superseded: true,
        limit: usize::MAX,
        ..Default::default()
    });
    let projects: Vec<Value> = overview
        .projects
        .iter()
        .map(|p| {
            let source = (!p.name.is_empty()).then_some(p.name.as_str());
            let importes: Vec<&Memory> = deja
                .iter()
                .filter(|m| m.origin.source_project.as_deref() == source)
                .collect();
            json!({
                "id": p.id,
                "name": p.name,
                "count": p.count,
                "imported": importes.len(),
                "projectRoot": importes.first().map(|m| m.project_root.clone()),
            })
        })
        .collect();
    json!({"type":"memoryClaudeScience","requestId":request_id,"ok":true,"base":overview.base,"projects":projects})
}

/// Import (3b) : `targets: [{projectId, projectRoot}]`. Un projet absent de
/// la liste n'est pas importé ; `projectRoot: ""` = tous les projets.
pub async fn handle_claude_science_import(state: &AppState, msg: &Value) -> Value {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let targets: Vec<(String, String)> = msg
        .get("targets")
        .and_then(Value::as_array)
        .map(|t| {
            t.iter()
                .filter_map(|t| {
                    Some((
                        t.get("projectId")?.as_str()?.to_string(),
                        t.get("projectRoot")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default();
    let ids: Vec<String> = targets.iter().map(|(id, _)| id.clone()).collect();
    let lus = tokio::task::spawn_blocking(move || {
        atelier_workspace::import_claude_science_memories(&home()?, &ids)
    })
    .await
    .unwrap_or_else(|e| Err(e.to_string()));
    let lus = match lus {
        Ok(lus) => lus,
        Err(error) => {
            return json!({"type":"memoryImported","requestId":request_id,"ok":false,"error":error})
        }
    };
    let batch: Vec<ImportedMemory> = lus
        .into_iter()
        .filter_map(|m| {
            let root = targets
                .iter()
                .find(|(id, _)| *id == m.project_id)?
                .1
                .clone();
            Some(ImportedMemory {
                source_id: m.id,
                source_project: m.project_name.filter(|n| !n.is_empty()),
                project_root: root,
                text: m.body,
                evidence: m.evidence,
                created_at: m.created_at,
            })
        })
        .collect();
    match state.memories().lock().await.import(batch) {
        Ok(r) => json!({"type":"memoryImported","requestId":request_id,"ok":true,
            "added":r.added,"updated":r.updated,"unchanged":r.unchanged,
            "forgotten":r.forgotten}),
        Err(error) => {
            json!({"type":"memoryImported","requestId":request_id,"ok":false,"error":error})
        }
    }
}

// ---- Outils de l'agent (MCP atelier_sessions) ----

async fn racine_du_fil(state: &AppState, thread_id: &str) -> String {
    state
        .threads()
        .lock()
        .await
        .get(thread_id)
        .map(|t| t.project_root.clone())
        .unwrap_or_default()
}

/// Action `memories` : recherche dans les souvenirs du projet du fil.
pub async fn action_memories(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let root = racine_du_fil(state, caller_id).await;
    let query = str_of(req, "query").trim().to_string();
    let limit = req
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(15)
        .clamp(1, 50) as usize;
    let store = state.memories().lock().await;
    let items: Vec<Memory> = if query.is_empty() {
        let mut recents = store
            .list(&MemoryQuery {
                project_root: Some(root.clone()),
                limit,
                ..Default::default()
            })
            .0;
        recents.extend(
            store
                .list(&MemoryQuery {
                    project_root: Some(String::new()),
                    limit,
                    ..Default::default()
                })
                .0,
        );
        recents.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        recents.truncate(limit);
        recents
    } else {
        store.relevant(&root, &query, &HashSet::new(), limit)
    };
    Ok(json!({
        "memories": items.iter().map(|m| json!({
            "id": m.id,
            "text": m.text,
            "date": date_courte(&m.created_at),
            "origin": m.origin.kind,
            "allProjects": m.project_root.is_empty(),
        })).collect::<Vec<_>>(),
        "note": "Project notes the user keeps in Settings › Memory. To add or correct one, use action propose_memory; never edit files for this."
    }))
}

/// Proposition validée, prête à devenir une carte.
pub fn parse_proposition(
    req: &Value,
    store: &atelier_store::MemoryStore,
    project_root: &str,
) -> Result<Value, String> {
    let text = str_of(req, "text").trim().to_string();
    if text.is_empty() {
        return Err("memory_missing_text".into());
    }
    if text.chars().count() > atelier_store::MEMORY_TEXT_MAX {
        return Err("memory_too_long".into());
    }
    let replace_id = str_of(req, "replaceId").trim();
    let (replace, replaced_text) = if replace_id.is_empty() {
        (Value::Null, Value::Null)
    } else {
        let old = store
            .get(replace_id)
            .ok_or_else(|| "memory_replace_unknown".to_string())?;
        (json!(replace_id), json!(old.text))
    };
    Ok(json!({
        "text": text,
        "replaceId": replace,
        "replacedText": replaced_text,
        "projectRoot": project_root,
    }))
}

pub fn proposal_event(
    thread_id: &str,
    id: &str,
    proposition: &Value,
    origin: &str,
    sequence: u64,
    ts: i64,
    turn_id: Option<&str>,
) -> Value {
    json!({
        "kind": "memory_proposal",
        "id": id,
        "origin": origin,
        "proposal": proposition,
        "ts": ts,
        "meta": {
            "threadId": thread_id,
            "sequence": sequence,
            "eventId": Uuid::new_v4().to_string(),
            "ts": ts,
            // sans turnId, la carte ouvrirait un tour fantôme
            "turnId": turn_id,
        }
    })
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn poser_carte(
    state: &AppState,
    thread_id: &str,
    proposition: &Value,
    origin: &str,
    turn_id: Option<&str>,
) -> String {
    let id = format!("mp_{}", &Uuid::new_v4().simple().to_string()[..16]);
    let sequence = state.journal().last_sequence(thread_id) + 1;
    let durable = proposal_event(
        thread_id,
        &id,
        proposition,
        origin,
        sequence,
        now_ms(),
        turn_id,
    );
    let _ = state.journal().append(&durable);
    state.publish(crate::ws_router::json_msg(json!({
        "type": "event",
        "threadId": thread_id,
        "event": durable,
    })));
    id
}

/// Action `propose_memory` : pose la carte dans le fil appelant.
pub async fn action_propose_memory(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let root = racine_du_fil(state, caller_id).await;
    let proposition = {
        let store = state.memories().lock().await;
        parse_proposition(req, &store, &root)?
    };
    let turn_id = state.capabilities().lock().await.turn_id_of(caller_id);
    let id = poser_carte(state, caller_id, &proposition, "agent", turn_id.as_deref());
    Ok(json!({
        "ok": true,
        "proposalId": id,
        "note": "The card is shown in the conversation. Nothing is saved until the user clicks Keep; do not repeat the note in your reply."
    }))
}

// ---- Extraction automatique en fin de tour (3d, coupée par défaut) ----

/// Échange du tour tel que le journal l'a gardé : la demande et la réponse.
fn echange_du_tour(state: &AppState, thread_id: &str, turn_id: &str, prompt: &str) -> String {
    let mut reponse = String::new();
    let mut resultat = String::new();
    for e in state.journal().materialize(thread_id) {
        if e.pointer("/meta/turnId").and_then(Value::as_str) != Some(turn_id) {
            continue;
        }
        match e.get("kind").and_then(Value::as_str) {
            Some("delta") => reponse.push_str(str_of(&e, "text")),
            Some("done") => resultat = str_of(&e, "result").to_string(),
            _ => {}
        }
    }
    let reponse = if reponse.trim().is_empty() {
        resultat
    } else {
        reponse
    };
    let reponse: String = {
        // la fin de la réponse porte d'ordinaire la conclusion
        let n = reponse.chars().count();
        reponse.chars().skip(n.saturating_sub(8_000)).collect()
    };
    format!(
        "<user>\n{}\n</user>\n<assistant>\n{}\n</assistant>",
        tronque(prompt.trim(), 4_000),
        reponse.trim()
    )
}

/// Après un tour réussi : si l'extraction est allumée, un petit modèle
/// propose au plus trois souvenirs, chacun sur sa carte.
pub async fn extraire_apres_le_tour(
    state: AppState,
    thread_id: String,
    turn_id: String,
    project_root: String,
    prompt: String,
) {
    let settings = atelier_store::read_settings(&state.settings_path()).unwrap_or(Value::Null);
    if !reglages(&settings).extraction {
        return;
    }
    let Some(provider) = state.provider("claude") else {
        return;
    };
    let echange = echange_du_tour(&state, &thread_id, &turn_id, &prompt);
    let connus: Vec<String> = state
        .memories()
        .lock()
        .await
        .relevant(&project_root, &echange, &HashSet::new(), 15)
        .into_iter()
        .map(|m| m.text)
        .collect();
    let propositions = match provider
        .extract_memories(&echange, &connus, &project_root)
        .await
    {
        Ok(p) => p,
        Err(error) => {
            tracing::warn!(%error, thread_id, "extraction de souvenirs échouée");
            return;
        }
    };
    let deja: HashSet<String> = connus
        .iter()
        .map(|t| atelier_store::fold_memory_text(t))
        .collect();
    for text in propositions
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty() && t.chars().count() <= atelier_store::MEMORY_TEXT_MAX)
        .filter(|t| !deja.contains(&atelier_store::fold_memory_text(t)))
        .take(EXTRACTION_MAX)
    {
        let proposition = json!({"text": text, "replaceId": null, "replacedText": null, "projectRoot": project_root});
        poser_carte(
            &state,
            &thread_id,
            &proposition,
            "extraction",
            Some(&turn_id),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn souvenir(id: &str, text: &str, kind: &str) -> Memory {
        Memory {
            id: id.into(),
            project_root: "/p".into(),
            text: text.into(),
            origin: MemoryOrigin {
                kind: kind.into(),
                ..Default::default()
            },
            created_at: "2026-10-12T08:00:00.000Z".into(),
            updated_at: "2026-10-12T08:00:00.000Z".into(),
            superseded_by: None,
            edited: false,
        }
    }

    /// Injection et extraction éteintes par défaut (audit du 2026-10-18 :
    /// l'injection, née allumée avec #54, attend que Thierry l'essaie).
    #[test]
    fn reglages_par_defaut_du_plan() {
        assert_eq!(
            reglages(&Value::Null),
            Reglages {
                injection: false,
                extraction: false
            }
        );
        assert_eq!(
            reglages(&json!({"memoire":{"extraction":false}})),
            Reglages {
                injection: false,
                extraction: false
            }
        );
        assert!(reglages(&json!({"memoire":{"injection":true}})).injection);
        let r = reglages(&json!({"memoire":{"injection":false,"extraction":true}}));
        assert_eq!(
            r,
            Reglages {
                injection: false,
                extraction: true
            }
        );
    }

    #[test]
    fn le_bloc_est_borne_et_date() {
        let long = "mot ".repeat(400);
        let items = vec![
            souvenir(
                "a",
                "Le dépôt vient de FireWork moins noFire",
                "claude-science",
            ),
            souvenir("b", &long, "manual"),
        ];
        let (bloc, ids) = rendre_bloc(&items, true);
        assert!(bloc.starts_with("\n\n<atelier-memory>\n") && bloc.ends_with("</atelier-memory>"));
        assert!(bloc.contains("- (2026-10-12) Le dépôt vient de FireWork moins noFire"));
        assert!(bloc.contains("imported from Claude Science"));
        assert!(bloc.contains("propose_memory") && bloc.contains("\"memories\""));
        assert!(bloc.contains('…'), "un souvenir long est tronqué");
        assert_eq!(ids, ["a", "b"]);
        let (sans_mcp, _) = rendre_bloc(&items[..1], false);
        assert!(!sans_mcp.contains("propose_memory"));
        assert!(!sans_mcp.contains("Claude Science") || sans_mcp.contains("imported"));
        assert_eq!(rendre_bloc(&[], true).0, "");
    }

    #[test]
    fn le_bloc_ne_depasse_pas_sa_taille() {
        let items: Vec<Memory> = (0..BLOC_MAX_ITEMS + 4)
            .map(|i| souvenir(&format!("m{i}"), &"x".repeat(BLOC_ITEM_MAX), "manual"))
            .collect();
        let (bloc, ids) = rendre_bloc(&items, false);
        assert!(ids.len() < BLOC_MAX_ITEMS);
        assert!(bloc.len() < BLOC_MAX_CHARS + 600);
    }

    #[test]
    fn les_souvenirs_donnes_suivent_la_session() {
        let fil = |extra: Value, session: Option<&str>| -> atelier_store::Thread {
            let mut v = json!({
                "id":"t","title":"","projectRoot":"/p","provider":"claude",
                "sessionId": session, "createdAt":"", "updatedAt":""
            });
            v.as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            serde_json::from_value(v).unwrap()
        };
        let donnes = json!({"memoiresDonnees":{"session":"s1","ids":["a","b"]}});
        assert_eq!(deja_donnes(Some(&fil(donnes.clone(), Some("s1")))).len(), 2);
        assert!(
            deja_donnes(Some(&fil(donnes, Some("s2")))).is_empty(),
            "session neuve : tout repart"
        );
        assert!(deja_donnes(None).is_empty());
        let avant: HashSet<String> = ["a".to_string()].into();
        let apres = donnes_apres("s1", &avant, &["c".into(), "a".into()]);
        assert_eq!(apres["ids"], json!(["c", "a"]));
    }

    #[test]
    fn l_origine_venue_du_front_ne_peut_pas_imiter_un_import() {
        let o = origin_de(Some(
            &json!({"kind":"claude-science","sourceId":"x","threadId":"t"}),
        ));
        assert_eq!(o.kind, "manual");
        assert_eq!(o.source_id, None);
        assert_eq!(o.thread_id.as_deref(), Some("t"));
        assert_eq!(origin_de(Some(&json!({"kind":"agent"}))).kind, "agent");
    }

    #[test]
    fn une_proposition_est_validee() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = atelier_store::MemoryStore::open(dir.path().join("m.json"));
        let ancien = store
            .add(
                "/p",
                "Fenêtre JJA",
                MemoryOrigin {
                    kind: "manual".into(),
                    ..Default::default()
                },
            )
            .unwrap();
        let p = parse_proposition(
            &json!({"text":"  Fenêtre JA  ","replaceId":ancien.id}),
            &store,
            "/p",
        )
        .unwrap();
        assert_eq!(p["text"], "Fenêtre JA");
        assert_eq!(p["replacedText"], "Fenêtre JJA");
        assert_eq!(p["projectRoot"], "/p");
        assert_eq!(
            parse_proposition(&json!({}), &store, "/p").unwrap_err(),
            "memory_missing_text"
        );
        assert_eq!(
            parse_proposition(&json!({"text":"x","replaceId":"nope"}), &store, "/p").unwrap_err(),
            "memory_replace_unknown"
        );
    }

    #[test]
    fn l_evenement_porte_son_tour_et_son_origine() {
        let ev = proposal_event(
            "t1",
            "mp_1",
            &json!({"text":"x"}),
            "extraction",
            3,
            10,
            Some("turn-2"),
        );
        assert_eq!(ev["kind"], "memory_proposal");
        assert_eq!(ev["origin"], "extraction");
        assert_eq!(ev["meta"]["turnId"], "turn-2");
        assert_eq!(ev["proposal"]["text"], "x");
    }
}
