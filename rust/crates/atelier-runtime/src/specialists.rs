//! Spécialistes d'Atelier (plan specialistes-2026-10-18, lot 1).
//!
//! Une fiche vit dans les réglages (`settings.json → specialistes`, écrit par
//! le front via `saveSettings`). Le fil qui en porte une la reçoit par le
//! chemin des consignes (copie dans `extra.consigne`, voir
//! `src/lib/specialistes.ts`). Ce module donne à l'agent ce qu'il lui faut
//! pour COMPRENDRE le mot « spécialiste » et en PROPOSER un :
//! - le bloc `<atelier-specialists>` ajouté au message (liste courte) ;
//! - l'action `specialists` d'`atelier_sessions` (fiches complètes) ;
//! - l'action `propose_specialist`, qui pose une carte dans le fil. Rien
//!   n'est enregistré sans le clic de l'utilisateur (Garder / Modifier dans
//!   Réglages / Écarter), comme les codes proposés du livre de codes.

use crate::state::AppState;
use serde_json::{json, Value};
use uuid::Uuid;

/// Bornes d'une proposition : un modèle ne doit jamais perdre sa carte pour
/// un détail, seule une charge franchement hors gabarit est refusée.
pub const NOM_MAX: usize = 60;
pub const NOM_COURT_MAX: usize = 16;
pub const ROLE_MAX: usize = 600;
pub const INSTRUCTIONS_MAX: usize = 20_000;
pub const LISTE_MAX: usize = 40;
/// Le bloc du message ne liste pas plus de fiches que ça (les rôles y sont
/// tronqués) : l'action `specialists` donne le reste.
const BLOC_FICHES_MAX: usize = 30;
const BLOC_ROLE_MAX: usize = 160;

fn texte(v: &Value, cle: &str) -> String {
    v.get(cle)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn tronque(s: &str, max: usize) -> String {
    let court: String = s.chars().take(max).collect();
    if court.chars().count() < s.chars().count() {
        format!("{}…", court.trim_end())
    } else {
        court
    }
}

fn liste(v: &Value, cle: &str) -> Vec<String> {
    v.get(cle)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|s| tronque(s.trim(), 80))
                .filter(|s| !s.is_empty())
                .take(LISTE_MAX)
                .collect()
        })
        .unwrap_or_default()
}

/// Fiches visibles des réglages, dans l'ordre de l'utilisateur.
pub fn fiches(settings: &Value) -> Vec<Value> {
    settings
        .get("specialistes")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|f| f.get("visible").and_then(Value::as_bool) != Some(false))
                .filter(|f| !texte(f, "nom").is_empty())
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

fn nom_court(fiche: &Value) -> String {
    let court = texte(fiche, "nomCourt");
    if !court.is_empty() {
        return court;
    }
    texte(fiche, "nom")
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string()
}

/// Bloc ajouté au message (Claude, Codex : les fournisseurs qui ont le MCP
/// d'Atelier). `None` quand le fournisseur ne peut pas proposer de fiche.
/// Sans fiche, le bloc explique quand même le mot : c'est justement le cas
/// où l'utilisateur dira « crée-moi un spécialiste ».
pub fn bloc_contexte(settings: &Value, provider: &str) -> Option<String> {
    if !crate::agent_mcp::is_mcp_compatible_provider(provider) {
        return None;
    }
    let fiches = fiches(settings);
    let liste = if fiches.is_empty() {
        "The user has no specialist yet.".to_string()
    } else {
        let mut lignes: Vec<String> = fiches
            .iter()
            .take(BLOC_FICHES_MAX)
            .map(|f| {
                let role = tronque(&texte(f, "role"), BLOC_ROLE_MAX);
                let role = if role.is_empty() { String::new() } else { format!(": {role}") };
                format!("- {} (@{}){role}", texte(f, "nom"), nom_court(f))
            })
            .collect();
        if fiches.len() > BLOC_FICHES_MAX {
            lignes.push(format!("- … and {} more", fiches.len() - BLOC_FICHES_MAX));
        }
        format!("The user's specialists:\n{}", lignes.join("\n"))
    };
    Some(format!(
        "\n\n<atelier-specialists>\nIn Atelier, a \"specialist\" (spécialiste) is a named profile the user keeps in Settings › Specialists: a role, standing instructions, preferred skills and connectors. A conversation can carry one specialist, picked in the composer's Specialist menu; its instructions then apply to the whole conversation. When the user talks about specialists (\"mes spécialistes\", \"le spécialiste …\", \"@Name\"), they mean these profiles.\n{liste}\nTo read full profiles, call the MCP tool `atelier_sessions` with action \"specialists\". When the user asks you to create or change a specialist, ask at most one or two short questions, then call `atelier_sessions` with action \"propose_specialist\" (nom, nomCourt: one word, role, instructions, skills, connecteurs; replaceId to change an existing one). It shows a proposal card that the user keeps, edits in Settings or dismisses: nothing is saved until they click, so never write a profile to a file.\n</atelier-specialists>"
    ))
}

/// Empreinte du bloc : il ne repart que si la liste change (même cadence
/// que le bloc de la base de connaissances).
pub fn empreinte_bloc(bloc: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bloc.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Action `specialists` : fiches complètes, sans les champs internes.
pub fn action_specialists(settings: &Value) -> Value {
    let fiches: Vec<Value> = fiches(settings)
        .iter()
        .map(|f| {
            json!({
                "id": texte(f, "id"),
                "nom": texte(f, "nom"),
                "nomCourt": nom_court(f),
                "role": texte(f, "role"),
                "instructions": texte(f, "instructions"),
                "skills": liste(f, "skills"),
                "tousSkills": f.get("tousSkills").and_then(Value::as_bool).unwrap_or(false),
                "connecteurs": liste(f, "connecteurs"),
            })
        })
        .collect();
    json!({
        "specialists": fiches,
        "note": "Profiles the user keeps in Settings › Specialists. To create or change one, use action propose_specialist; never edit settings files."
    })
}

/// Proposition validée, prête à devenir une carte.
pub fn parse_proposition(req: &Value, settings: &Value) -> Result<Value, String> {
    let nom = tronque(&texte(req, "nom"), NOM_MAX);
    if nom.is_empty() {
        return Err("specialist_missing_nom".into());
    }
    let instructions = texte(req, "instructions");
    if instructions.chars().count() > INSTRUCTIONS_MAX {
        return Err("specialist_instructions_too_long".into());
    }
    let nom_court = {
        let donne = texte(req, "nomCourt");
        let base = if donne.is_empty() {
            nom.split_whitespace().next().unwrap_or("").to_string()
        } else {
            donne
        };
        // un mot : c'est aussi la future @mention
        base.split_whitespace()
            .next()
            .unwrap_or("")
            .trim_start_matches('@')
            .chars()
            .take(NOM_COURT_MAX)
            .collect::<String>()
    };
    let remplace = texte(req, "replaceId");
    let remplace = if remplace.is_empty() {
        Value::Null
    } else if fiches(settings).iter().any(|f| texte(f, "id") == remplace) {
        json!(remplace)
    } else {
        return Err("specialist_replace_unknown".into());
    };
    Ok(json!({
        "nom": nom,
        "nomCourt": nom_court,
        "role": tronque(&texte(req, "role"), ROLE_MAX),
        "instructions": instructions,
        "skills": liste(req, "skills"),
        "connecteurs": liste(req, "connecteurs"),
        "replaceId": remplace,
    }))
}

pub fn proposal_event(
    thread_id: &str,
    id: &str,
    proposition: &Value,
    sequence: u64,
    ts: i64,
    turn_id: Option<&str>,
) -> Value {
    json!({
        "kind": "specialist_proposal",
        "id": id,
        "proposal": proposition,
        "ts": ts,
        "meta": {
            "threadId": thread_id,
            "sequence": sequence,
            "eventId": Uuid::new_v4().to_string(),
            "ts": ts,
            // Même raison que pour les widgets : sans turnId, la carte
            // ouvrirait un tour fantôme après le tour en cours.
            "turnId": turn_id,
        }
    })
}

/// Action `propose_specialist` : pose la carte dans le fil appelant.
pub async fn action_propose_specialist(
    state: &AppState,
    caller_id: &str,
    req: &Value,
) -> Result<Value, String> {
    let settings = atelier_store::read_settings(&state.settings_path()).unwrap_or(Value::Null);
    let proposition = parse_proposition(req, &settings)?;
    let turn_id = state.capabilities().lock().await.turn_id_of(caller_id);
    let id = format!("sp_{}", &Uuid::new_v4().simple().to_string()[..16]);
    let sequence = state.journal().last_sequence(caller_id) + 1;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let durable = proposal_event(caller_id, &id, &proposition, sequence, ts, turn_id.as_deref());
    let _ = state.journal().append(&durable);
    state.publish(crate::ws_router::json_msg(json!({
        "type": "event",
        "threadId": caller_id,
        "event": durable,
    })));
    Ok(json!({
        "ok": true,
        "proposalId": id,
        "note": "The proposal card is shown in the conversation. Nothing is saved until the user clicks Keep; do not repeat the profile in full in your reply."
    }))
}

/// Connecteurs du spécialiste que le fil porte (copie
/// `extra.consigne.specialiste.connecteurs`, posée par l'interface).
pub fn connecteurs_du_fil(thread: Option<&atelier_store::Thread>) -> Vec<String> {
    thread
        .and_then(|t| t.extra.get("consigne"))
        .and_then(|c| c.get("specialiste"))
        .map(|s| liste(s, "connecteurs"))
        .unwrap_or_default()
}

/// Ne garder que les connecteurs du spécialiste (comme Claude Science) :
/// chaque nom est cherché parmi les serveurs MCP du Mac, à la casse et la
/// ponctuation près. Rend la restriction au format du provider et les noms
/// introuvables. `None` sans connecteur (le fil garde tous ses MCP) ou pour
/// un provider qui ne sait pas filtrer.
pub fn restriction_mcp(
    provider: &str,
    connecteurs: &[String],
    home: &std::path::Path,
    codex_home: &std::path::Path,
    cwd: Option<&std::path::Path>,
) -> Option<(atelier_providers::RestrictionMcp, Vec<String>)> {
    use atelier_workspace::{cle_mcp, definition_codex, noms_mcp_codex, serveurs_mcp_claude};
    if connecteurs.is_empty() || !matches!(provider, "claude" | "codex") {
        return None;
    }
    let voulus: Vec<String> = connecteurs.iter().map(|c| cle_mcp(c)).collect();
    let claude = serveurs_mcp_claude(home, cwd);
    let mut restriction = atelier_providers::RestrictionMcp::default();
    let mut trouves: Vec<String> = Vec::new();
    if provider == "codex" {
        for nom in noms_mcp_codex(codex_home) {
            if voulus.contains(&cle_mcp(&nom)) {
                trouves.push(cle_mcp(&nom));
            } else {
                restriction.a_couper.push(nom);
            }
        }
    }
    for serveur in claude {
        let cle = cle_mcp(&serveur.nom);
        if !voulus.contains(&cle) || trouves.contains(&cle) {
            continue;
        }
        let definition = if provider == "codex" {
            definition_codex(&serveur.definition)
        } else {
            Some(serveur.definition)
        };
        if let Some(definition) = definition {
            restriction.serveurs.push((serveur.nom, definition));
            trouves.push(cle);
        }
    }
    let absents = connecteurs
        .iter()
        .filter(|c| !trouves.contains(&cle_mcp(c)))
        .cloned()
        .collect();
    Some((restriction, absents))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reglages() -> Value {
        json!({"specialistes": [
            {"id":"s1","nom":"Glaciologue albédo","nomCourt":"Glaciologue","role":"Albédo des glaciers, MODIS et Landsat",
             "instructions":"Tu es glaciologue.","skills":["bilan-energie-fonte"],"connecteurs":["scholar"],"visible":true},
            {"id":"s2","nom":"Paper Writer","role":"","instructions":"x","visible":false},
            {"id":"s3","nom":"Références","role":"r".repeat(400),"instructions":"y"}
        ]})
    }

    #[test]
    fn le_bloc_liste_les_fiches_visibles_avec_leur_mention() {
        let bloc = bloc_contexte(&reglages(), "codex").unwrap();
        assert!(bloc.contains("<atelier-specialists>") && bloc.contains("</atelier-specialists>"));
        assert!(bloc.contains("- Glaciologue albédo (@Glaciologue): Albédo des glaciers"));
        assert!(!bloc.contains("Paper Writer"), "une fiche masquée n'est pas annoncée");
        assert!(bloc.contains("(@Références)"), "sans nom court, le premier mot");
        assert!(bloc.contains("…"), "un rôle long est tronqué");
        assert!(bloc.contains("propose_specialist") && bloc.contains("\"specialists\""));
    }

    #[test]
    fn sans_fiche_le_bloc_explique_quand_meme_le_mot() {
        let bloc = bloc_contexte(&json!({}), "claude").unwrap();
        assert!(bloc.contains("no specialist yet"));
        assert!(bloc.contains("propose_specialist"));
    }

    #[test]
    fn un_fournisseur_sans_mcp_n_a_pas_de_bloc() {
        assert_eq!(bloc_contexte(&reglages(), "openrouter"), None);
    }

    #[test]
    fn l_empreinte_suit_la_liste() {
        let a = bloc_contexte(&reglages(), "codex").unwrap();
        let mut autres = reglages();
        autres["specialistes"][0]["role"] = json!("Autre rôle");
        let b = bloc_contexte(&autres, "codex").unwrap();
        assert_eq!(empreinte_bloc(&a), empreinte_bloc(&a));
        assert_ne!(empreinte_bloc(&a), empreinte_bloc(&b));
    }

    #[test]
    fn l_action_specialists_rend_les_fiches_completes() {
        let out = action_specialists(&reglages());
        let fiches = out["specialists"].as_array().unwrap();
        assert_eq!(fiches.len(), 2);
        assert_eq!(fiches[0]["instructions"], "Tu es glaciologue.");
        assert_eq!(fiches[0]["connecteurs"], json!(["scholar"]));
        assert_eq!(fiches[1]["nomCourt"], "Références");
    }

    #[test]
    fn une_proposition_est_bornee_et_son_nom_court_est_un_mot() {
        let p = parse_proposition(
            &json!({"nom":"Spécialiste Peyto","nomCourt":"@Peyto glacier","role":"Bilan de masse",
                    "instructions":"Tu connais Peyto.","skills":["a","",3],"connecteurs":["scholar"]}),
            &reglages(),
        )
        .unwrap();
        assert_eq!(p["nomCourt"], "Peyto");
        assert_eq!(p["skills"], json!(["a"]));
        assert_eq!(p["replaceId"], Value::Null);
    }

    #[test]
    fn une_proposition_sans_nom_ou_qui_remplace_une_fiche_inconnue_est_refusee() {
        assert_eq!(
            parse_proposition(&json!({"instructions":"x"}), &reglages()).unwrap_err(),
            "specialist_missing_nom"
        );
        assert_eq!(
            parse_proposition(&json!({"nom":"X","replaceId":"nope"}), &reglages()).unwrap_err(),
            "specialist_replace_unknown"
        );
        let ok = parse_proposition(&json!({"nom":"X","replaceId":"s1"}), &reglages()).unwrap();
        assert_eq!(ok["replaceId"], "s1");
        let trop = "x".repeat(INSTRUCTIONS_MAX + 1);
        assert!(parse_proposition(&json!({"nom":"X","instructions":trop}), &reglages()).is_err());
    }

    #[test]
    fn l_evenement_porte_le_tour_pour_ne_pas_ouvrir_un_tour_fantome() {
        let ev = proposal_event("t1", "sp_1", &json!({"nom":"X"}), 4, 10, Some("turn-9"));
        assert_eq!(ev["kind"], "specialist_proposal");
        assert_eq!(ev["meta"]["turnId"], "turn-9");
        assert_eq!(ev["meta"]["sequence"], 4);
        assert_eq!(ev["proposal"]["nom"], "X");
    }

    #[test]
    fn restriction_claude_et_codex() {
        let home = tempfile::tempdir().unwrap();
        let codex = tempfile::tempdir().unwrap();
        std::fs::write(
            home.path().join(".claude.json"),
            r#"{"mcpServers":{"Scholar":{"command":"scholar-mcp"},"gbrain":{"command":"g"},"ragdoc":{"type":"http","url":"https://r"}}}"#,
        )
        .unwrap();
        std::fs::write(codex.path().join("config.toml"), "[mcp_servers.gbrain]\ncommand = \"g\"\n[mcp_servers.context7]\ncommand = \"c\"\n").unwrap();
        let voulus = vec!["scholar".to_string(), "ragdoc".into(), "zotero".into()];

        let (claude, absents) = restriction_mcp("claude", &voulus, home.path(), codex.path(), None).unwrap();
        let noms: Vec<_> = claude.serveurs.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(noms, ["Scholar", "ragdoc"]);
        assert!(claude.a_couper.is_empty());
        assert_eq!(absents, ["zotero"]);

        let (codex_r, absents) = restriction_mcp("codex", &voulus, home.path(), codex.path(), None).unwrap();
        assert_eq!(codex_r.a_couper, ["gbrain", "context7"]);
        assert_eq!(codex_r.serveurs[0], ("Scholar".to_string(), json!({"command": "scholar-mcp", "args": [], "env": {}})));
        assert_eq!(codex_r.serveurs[1].1, json!({"url": "https://r"}));
        assert_eq!(absents, ["zotero"]);

        assert!(restriction_mcp("claude", &[], home.path(), codex.path(), None).is_none());
        assert!(restriction_mcp("grok", &voulus, home.path(), codex.path(), None).is_none());
    }
}
