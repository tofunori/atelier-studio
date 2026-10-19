//! Délégation à un spécialiste (plan specialistes-2026-10-18, lot 2).
//!
//! Comme dans Claude Science, l'agent d'un fil (action `delegate`
//! d'`atelier_sessions`) ou l'utilisateur (`@Bayes …` dans le compositeur)
//! confie une sous-tâche à un spécialiste. Elle tourne dans un fil enfant lié
//! (plan 057) qui porte la fiche du spécialiste (copie `extra.consigne`, donc
//! ses instructions et ses seuls connecteurs MCP) et rend compte au parent
//! avec `report_to_parent`. Garde-fous :
//! - profondeur 1 : un fil délégué ne délègue pas à son tour ;
//! - au plus `MAX_EN_PARALLELE` spécialistes au travail pour un même parent ;
//! - un même spécialiste réutilise son fil enfant (il garde son contexte) ;
//! - Stop sur le parent arrête aussi ses spécialistes (`arreter_les_delegues`).

use crate::state::AppState;
use crate::ws_router::{broadcast_threads, json_msg};
use atelier_protocol::agent_mcp_limits as lim;
use atelier_store::{AgentLink, Thread};
use serde_json::{json, Value};
use uuid::Uuid;

pub const MAX_EN_PARALLELE: usize = 3;
const TACHE_MAX: usize = 20_000;
const TITRE_TACHE_MAX: usize = 48;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Par {
    Agent,
    Utilisateur,
}

impl Par {
    fn cle(self) -> &'static str {
        match self {
            Par::Agent => "agent",
            Par::Utilisateur => "user",
        }
    }
}

/// Identifiant de la fiche qu'un fil délégué porte (`extra.delegue`).
pub fn specialiste_delegue(thread: &Thread) -> Option<&str> {
    thread.extra.get("delegue")?.get("specialisteId")?.as_str()
}

fn titre(nom_court: &str, tache: &str) -> String {
    let ligne = tache.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    let court: String = ligne.chars().take(TITRE_TACHE_MAX).collect();
    let court = if court.chars().count() < ligne.chars().count() {
        format!("{}…", court.trim_end())
    } else {
        court
    };
    if court.is_empty() {
        nom_court.to_string()
    } else {
        format!("{nom_court} · {court}")
    }
}

/// Message remis au fil du spécialiste.
pub fn message_de_tache(nom: &str, tache: &str) -> String {
    format!(
        "Task delegated to you as the specialist {nom}:\n{tache}\n\nWork on this task only. When you are done, call the MCP tool `atelier_sessions` with action \"report_to_parent\", a requestId and report.summary: a short summary of your result (files written, numbers, open questions). The parent can read your full answer with read_context."
    )
}

fn au_travail(state_mailbox: &atelier_store::AgentMailboxStore, parent_id: &str, child: &Thread) -> bool {
    child.status == "running"
        || state_mailbox
            .list_for_link(parent_id, &child.id)
            .iter()
            .any(|m| m.to_thread_id == child.id && matches!(m.status.as_str(), "queued" | "delivering"))
}

/// Confie `tache` au spécialiste `fiche` depuis le fil `parent_id`.
pub async fn deleguer(
    state: &AppState,
    parent_id: &str,
    fiche: &Value,
    tache: &str,
    par: Par,
    request_id: &str,
) -> Result<Value, String> {
    let tache = tache.trim();
    if tache.is_empty() {
        return Err("missing_task".into());
    }
    if tache.len() > TACHE_MAX {
        return Err(atelier_protocol::agent_mcp_errors::PAYLOAD_TOO_LARGE.into());
    }
    let fiche_id = fiche.get("id").and_then(Value::as_str).unwrap_or("").to_string();
    let consigne = crate::specialists::consigne_du_specialiste(fiche);
    let nom = consigne["specialiste"]["nom"].as_str().unwrap_or("").to_string();
    let nom_court = consigne["specialiste"]["nomCourt"].as_str().unwrap_or("").to_string();

    // Fil et enfants lus d'abord, boîte aux lettres ensuite, écriture en
    // dernier : jamais deux verrous tenus à la fois.
    let (parent, enfants) = {
        let store = state.threads().lock().await;
        let parent = store
            .get(parent_id)
            .cloned()
            .ok_or_else(|| atelier_protocol::agent_mcp_errors::CALLER_UNKNOWN.to_string())?;
        (parent, store.children_of(parent_id))
    };
    if parent.agent_link.is_some() {
        return Err("delegation_depth_exceeded: a delegated specialist cannot delegate in turn".into());
    }
    if !matches!(parent.provider.as_str(), "claude" | "codex") || state.provider(&parent.provider).is_none() {
        return Err("specialist_provider_unsupported: delegation needs a Claude or Codex conversation".into());
    }
    if !parent.project_root.starts_with('/') {
        return Err("delegation_project_missing".into());
    }
    let existant = enfants
        .iter()
        .find(|t| specialiste_delegue(t) == Some(fiche_id.as_str()))
        .cloned();
    let (occupes, en_attente) = {
        let mailbox = state.mailbox().lock().await;
        let occupes = enfants
            .iter()
            .filter(|t| specialiste_delegue(t).is_some())
            .filter(|t| Some(&t.id) != existant.as_ref().map(|e| &e.id))
            .filter(|t| au_travail(&mailbox, parent_id, t))
            .count();
        let en_attente = existant.as_ref().map_or(0, |e| {
            mailbox
                .list_for_link(parent_id, &e.id)
                .iter()
                .filter(|m| matches!(m.status.as_str(), "queued" | "delivering" | "paused"))
                .count() as u32
        });
        (occupes, en_attente)
    };
    if occupes >= MAX_EN_PARALLELE {
        return Err(format!(
            "specialists_busy: {MAX_EN_PARALLELE} specialists are already working for this conversation; wait for one to finish"
        ));
    }
    let (enfant_id, reutilise) = {
        let mut store = state.threads().lock().await;
        match existant {
            Some(enfant) => {
                let mut link = enfant.agent_link.clone().ok_or("relation_required")?;
                // La tâche et son rapport : deux remises de plus.
                link.auto_delivery_limit = link
                    .auto_delivery_used
                    .saturating_add(en_attente)
                    .saturating_add(2)
                    .min(lim::MAX_AUTO_DELIVERY);
                link.paused = false;
                store.upsert(json!({"id": enfant.id, "agentLink": link, "consigne": consigne}), true)?;
                (enfant.id, true)
            }
            None => {
                if enfants.len() >= lim::MAX_CHILDREN {
                    return Err(format!("delegation_children_limit: at most {} linked threads", lim::MAX_CHILDREN));
                }
                let id = Uuid::new_v4().to_string();
                let now = atelier_store::iso_now();
                let link = AgentLink {
                    parent_thread_id: parent_id.to_string(),
                    role: "specialist".into(),
                    access: "read_write".into(),
                    created_at: now.clone(),
                    created_by: par.cle().into(),
                    auto_delivery_limit: 2,
                    auto_delivery_used: 0,
                    paused: false,
                };
                let mut patch = json!({
                    "id": id,
                    "projectRoot": parent.project_root,
                    "provider": parent.provider,
                    "title": titre(&nom_court, tache),
                    "sessionId": null,
                    "status": "idle",
                    "agentLink": link,
                    "createdAt": now,
                    "consigne": consigne,
                    "delegue": {"specialisteId": fiche_id, "par": par.cle()},
                });
                for cle in ["model", "effort", "permissionMode"] {
                    if let Some(v) = parent.extra.get(cle).filter(|v| !v.is_null()) {
                        patch[cle] = v.clone();
                    }
                }
                store.upsert(patch, false)?;
                (id, false)
            }
        }
    };

    let texte = message_de_tache(&nom, tache);
    match crate::agent_mailbox::enqueue_user_mention(state, parent_id, &enfant_id, &texte, request_id).await {
        Ok(delivery) => {
            for m in broadcast_threads(state).await {
                state.publish(m);
            }
            Ok(json!({
                "targetThreadId": enfant_id,
                "specialist": nom,
                "reused": reutilise,
                "delivery": delivery,
                "note": "The specialist works in a linked conversation beside this one and reports back with report_to_parent. Follow it with wait/read_context (targetThreadId) if you need its result in this turn.",
            }))
        }
        Err(error) => {
            if !reutilise {
                let _ = state.threads().lock().await.delete(&enfant_id);
            }
            Err(error)
        }
    }
}

/// Action `delegate` d'`atelier_sessions` (`specialist`, `task`).
pub async fn action_delegate(state: &AppState, caller_id: &str, req: &Value) -> Result<Value, String> {
    let designation = req.get("specialist").and_then(Value::as_str).unwrap_or("").trim();
    if designation.is_empty() {
        return Err("missing_specialist".into());
    }
    let settings = atelier_store::read_settings(&state.settings_path()).unwrap_or(Value::Null);
    let fiche = crate::specialists::fiche_designee(&settings, designation)
        .ok_or_else(|| format!("specialist_unknown: {designation} (see action specialists)"))?;
    let tache = req.get("task").and_then(Value::as_str).unwrap_or("");
    let request_id = req
        .get("requestId")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    deleguer(state, caller_id, &fiche, tache, Par::Agent, &request_id).await
}

fn echec_mention(thread_id: &str, request_id: &str, message: impl Into<String>) -> String {
    json_msg(json!({
        "type": "agentMentionFailed",
        "threadId": thread_id,
        "requestId": request_id,
        "message": message.into(),
    }))
}

/// `@NomCourt tâche` tapé dans le compositeur (`mentionAgent` avec
/// `specialistId`).
pub async fn handle_mention_specialiste(state: &AppState, msg: &Value) -> Vec<String> {
    let source_id = msg.get("sourceThreadId").and_then(Value::as_str).unwrap_or("");
    let specialiste_id = msg.get("specialistId").and_then(Value::as_str).unwrap_or("");
    let text = msg.get("text").and_then(Value::as_str).unwrap_or("").trim();
    let request_id = msg.get("requestId").and_then(Value::as_str).unwrap_or("");
    if source_id.is_empty() || specialiste_id.is_empty() || text.is_empty() || request_id.is_empty() {
        return vec![echec_mention(source_id, request_id, "mentionAgent: champs requis manquants")];
    }
    let settings = atelier_store::read_settings(&state.settings_path()).unwrap_or(Value::Null);
    let Some(fiche) = crate::specialists::fiche_designee(&settings, specialiste_id) else {
        return vec![echec_mention(source_id, request_id, "Ce spécialiste n'existe plus dans Réglages › Spécialistes.")];
    };

    let display_text = msg.get("displayText").and_then(Value::as_str).unwrap_or(text);
    let user_event = json!({
        "kind": "user",
        "text": display_text,
        "meta": {
            "threadId": source_id,
            "sequence": state.journal().next_sequence(source_id),
            "eventId": Uuid::new_v4().to_string(),
            "messageId": request_id,
            "ts": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0),
        }
    });
    let _ = state.journal().append(&user_event);
    state.publish(json_msg(json!({"type":"event", "threadId":source_id, "event":user_event})));

    match deleguer(state, source_id, &fiche, text, Par::Utilisateur, request_id).await {
        Ok(reponse) => {
            let mut out = vec![json_msg(json!({
                "type": "agentMentionAccepted",
                "sourceThreadId": source_id,
                "targetThreadId": reponse["targetThreadId"],
                "specialistId": specialiste_id,
                "requestId": request_id,
                "reused": reponse["reused"],
                "delivery": reponse["delivery"],
            }))];
            out.extend(broadcast_threads(state).await);
            out
        }
        Err(error) => vec![echec_mention(source_id, request_id, message_lisible(&error))],
    }
}

/// Message d'échec montré dans le fil quand l'utilisateur a tapé @Nom.
fn message_lisible(code: &str) -> String {
    let cle = code.split(':').next().unwrap_or(code);
    match cle {
        "specialists_busy" => format!("{MAX_EN_PARALLELE} spécialistes travaillent déjà pour ce fil : attends qu'un d'eux ait fini."),
        "delegation_depth_exceeded" => "Un spécialiste délégué ne peut pas déléguer à son tour.".into(),
        "specialist_provider_unsupported" => "La délégation demande un fil Claude ou Codex.".into(),
        "delegation_children_limit" => format!("Ce fil a déjà {} fils liés.", lim::MAX_CHILDREN),
        _ => format!("Délégation impossible ({code})."),
    }
}

/// Stop sur un fil : ses spécialistes délégués s'arrêtent aussi, et les
/// tâches qu'il leur avait confiées et qui attendent ne partent plus.
pub async fn arreter_les_delegues(state: &AppState, parent_id: &str) -> Vec<String> {
    let delegues: Vec<Thread> = {
        let store = state.threads().lock().await;
        store
            .children_of(parent_id)
            .into_iter()
            .filter(|t| specialiste_delegue(t).is_some())
            .collect()
    };
    let now = atelier_store::iso_now();
    for enfant in &delegues {
        {
            let mut mailbox = state.mailbox().lock().await;
            let en_attente: Vec<String> = mailbox
                .list_for_link(parent_id, &enfant.id)
                .into_iter()
                .filter(|m| m.to_thread_id == enfant.id && matches!(m.status.as_str(), "queued" | "paused"))
                .map(|m| m.id)
                .collect();
            for id in en_attente {
                let _ = mailbox.update_status(&id, "failed", Some("cancelled_by_parent".into()), &now);
            }
        }
        if state.harness().is_running(&enfant.id).await {
            state.harness().request_cancel(&enfant.id).await;
            if let Some(p) = state.provider(&enfant.provider) {
                let _ = p.interrupt(&enfant.id).await;
            }
        }
    }
    delegues.into_iter().map(|t| t.id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;

    fn etat() -> AppState {
        let dir = tempfile::tempdir().unwrap().keep();
        let s = AppState::new(AppPaths::from_app_dir(dir), None, "t".into(), "0.1.0".into(), "hash".into(), "/tmp".into())
            .with_test_provider("codex");
        atelier_store::write_settings(
            &s.settings_path(),
            &json!({"specialistes": [
                {"id": "s1", "nom": "Analyste stats", "nomCourt": "Stats", "role": "Modèles", "instructions": "Vérifie R-hat.", "skills": [], "tousSkills": true, "connecteurs": ["ragdoc"], "visible": true},
                {"id": "s2", "nom": "Réviseur", "nomCourt": "Revue", "role": "", "instructions": "", "skills": [], "tousSkills": true, "connecteurs": [], "visible": true},
                {"id": "s3", "nom": "Code", "nomCourt": "Code", "role": "", "instructions": "", "skills": [], "tousSkills": true, "connecteurs": [], "visible": true},
                {"id": "s4", "nom": "Figures", "nomCourt": "Figures", "role": "", "instructions": "", "skills": [], "tousSkills": true, "connecteurs": [], "visible": true}
            ]}),
        );
        s
    }

    async fn parent(s: &AppState) {
        s.threads()
            .lock()
            .await
            .upsert(json!({"id": "p", "projectRoot": "/tmp/proj", "provider": "codex", "title": "P", "status": "idle", "model": "gpt-x"}), false)
            .unwrap();
    }

    #[tokio::test]
    async fn deleguer_cree_un_fil_lie_qui_porte_la_fiche_puis_le_reutilise() {
        let s = etat();
        parent(&s).await;
        let r = action_delegate(&s, "p", &json!({"specialist": "@stats", "task": "Vérifie la convergence de M3"})).await.unwrap();
        let id = r["targetThreadId"].as_str().unwrap().to_string();
        assert_eq!(r["reused"], false);
        {
            let store = s.threads().lock().await;
            let enfant = store.get(&id).unwrap();
            assert_eq!(enfant.provider, "codex");
            assert_eq!(enfant.title, "Stats · Vérifie la convergence de M3");
            assert_eq!(enfant.agent_link.as_ref().unwrap().parent_thread_id, "p");
            assert_eq!(specialiste_delegue(enfant), Some("s1"));
            assert_eq!(enfant.extra["model"], "gpt-x");
            let consigne = &enfant.extra["consigne"];
            assert!(consigne["texte"].as_str().unwrap().contains("Vérifie R-hat."));
            assert_eq!(consigne["specialiste"]["connecteurs"], json!(["ragdoc"]));
        }
        let messages = s.mailbox().lock().await.list_for_link("p", &id);
        assert!(messages.iter().any(|m| m.text.contains("Vérifie la convergence de M3") && m.text.contains("report_to_parent")));

        let encore = action_delegate(&s, "p", &json!({"specialist": "Analyste stats", "task": "Et M4"})).await.unwrap();
        assert_eq!(encore["targetThreadId"], id.as_str());
        assert_eq!(encore["reused"], true);
        assert_eq!(s.threads().lock().await.children_of("p").len(), 1);
    }

    #[tokio::test]
    async fn garde_fous_profondeur_inconnu_et_trois_au_plus() {
        let s = etat();
        parent(&s).await;
        assert!(action_delegate(&s, "p", &json!({"specialist": "nope", "task": "x"})).await.unwrap_err().starts_with("specialist_unknown"));
        assert_eq!(action_delegate(&s, "p", &json!({"specialist": "Stats", "task": " "})).await.unwrap_err(), "missing_task");

        let mut enfants = Vec::new();
        for nom in ["Stats", "Revue", "Code"] {
            let r = action_delegate(&s, "p", &json!({"specialist": nom, "task": "t"})).await.unwrap();
            enfants.push(r["targetThreadId"].as_str().unwrap().to_string());
        }
        let trop = action_delegate(&s, "p", &json!({"specialist": "Figures", "task": "t"})).await.unwrap_err();
        assert!(trop.starts_with("specialists_busy"), "{trop}");
        // Un spécialiste déjà au travail reçoit quand même sa tâche suivante.
        assert!(action_delegate(&s, "p", &json!({"specialist": "Stats", "task": "suite"})).await.is_ok());

        let profond = action_delegate(&s, &enfants[0], &json!({"specialist": "Figures", "task": "t"})).await.unwrap_err();
        assert!(profond.starts_with("delegation_depth_exceeded"), "{profond}");
    }

    #[tokio::test]
    async fn stop_sur_le_parent_annule_les_taches_en_attente() {
        let s = etat();
        parent(&s).await;
        let r = action_delegate(&s, "p", &json!({"specialist": "Stats", "task": "t"})).await.unwrap();
        let id = r["targetThreadId"].as_str().unwrap().to_string();
        let arretes = arreter_les_delegues(&s, "p").await;
        assert_eq!(arretes, [id.clone()]);
        let statuts: Vec<String> = s.mailbox().lock().await.list_for_link("p", &id).into_iter().map(|m| m.status).collect();
        assert!(statuts.iter().all(|st| st != "queued"), "{statuts:?}");
    }

    #[tokio::test]
    async fn une_mention_de_l_utilisateur_delegue_et_s_affiche_dans_le_parent() {
        let s = etat();
        parent(&s).await;
        let out = handle_mention_specialiste(
            &s,
            &json!({"sourceThreadId": "p", "specialistId": "s2", "text": "Relis la section 3", "displayText": "@Revue Relis la section 3", "requestId": "r1"}),
        )
        .await;
        let ack = out
            .iter()
            .filter_map(|raw| serde_json::from_str::<Value>(raw).ok())
            .find(|v| v["type"] == "agentMentionAccepted")
            .expect("ack");
        assert_eq!(ack["specialistId"], "s2");
        let events = s.journal().materialize("p");
        assert!(events.iter().any(|e| e["kind"] == "user" && e["text"] == "@Revue Relis la section 3"));
        let raté = handle_mention_specialiste(&s, &json!({"sourceThreadId": "p", "specialistId": "zz", "text": "x", "requestId": "r2"})).await;
        assert!(raté[0].contains("agentMentionFailed"));
    }

    #[test]
    fn le_titre_reprend_le_nom_court_et_la_premiere_ligne() {
        assert_eq!(titre("Bayes", "\n  vérifie la convergence de M3\nensuite…"), "Bayes · vérifie la convergence de M3");
        let long = "x".repeat(80);
        assert!(titre("Bayes", &long).ends_with('…'));
        assert_eq!(titre("Bayes", "   "), "Bayes");
    }

    #[test]
    fn la_tache_demande_un_rapport_au_parent() {
        let m = message_de_tache("Analyste stats", "vérifie M3");
        assert!(m.contains("Analyste stats") && m.contains("vérifie M3") && m.contains("report_to_parent"));
    }

    #[test]
    fn les_codes_d_echec_deviennent_lisibles() {
        assert!(message_lisible("specialists_busy: 3 …").contains("3 spécialistes"));
        assert!(message_lisible("delegation_depth_exceeded: x").contains("déléguer"));
        assert!(message_lisible("autre").contains("autre"));
    }
}
