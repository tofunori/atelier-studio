//! Demandes `can_use_tool` du CLI Claude (`--permission-prompt-tool stdio`) :
//! la carte montrée dans Atelier, puis la réponse rendue au CLI.
//!
//! Les deux sens vivent ici pour que le contrat reste lisible d'un bout à
//! l'autre (forme lue dans le CLI 2.1.282, 2026-09-25) :
//!
//! - permission ordinaire : les choix du terminal. « Oui, et ne plus
//!   demander » n'existe que si le CLI propose des règles
//!   (`permission_suggestions`) ; elles lui sont rendues telles quelles dans
//!   `updatedPermissions`, et c'est LUI qui les applique et les enregistre.
//!   Un refus peut porter une consigne, transmise au modèle ;
//! - `AskUserQuestion` : un formulaire. Les réponses repartent dans
//!   `updatedInput.answers`, indexées par le TEXTE de la question ;
//! - `ExitPlanMode` : le plan en entier et les trois choix du terminal
//!   (exécuter en acceptant les modifications, exécuter en les validant une à
//!   une, continuer à planifier).

use serde_json::{json, Map, Value};

/// Message rendu au CLI quand Atelier ne peut pas — ou ne veut pas —
/// accorder la permission. Il apparaît tel quel dans le `tool_result`.
pub(crate) const REFUS_ATELIER: &str = "Refusé dans Atelier";

/// Au-delà, l'aperçu avant/après d'une modification n'est pas joint à la
/// carte (le chemin reste affiché) : même borne que le diff du fil.
const APERCU_MAX: usize = 24 * 1024;
/// Plan d'ExitPlanMode : largement au-delà d'un plan réel, borne de sûreté.
const PLAN_MAX: usize = 64 * 1024;

const OPT_AUTORISER: &str = "allow_once";
const OPT_TOUJOURS: &str = "allow_always";
const OPT_REFUSER: &str = "deny";
const OPT_ARRETER: &str = "deny_stop";
const OPT_PLAN_AUTO: &str = "plan_auto";
const OPT_PLAN_MANUEL: &str = "plan_manual";
const OPT_PLAN_CONTINUER: &str = "plan_keep";

fn texte<'a>(v: &'a Value, cle: &str) -> Option<&'a str> {
    v.get(cle)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
}

fn borne(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Retire les séquences ANSI (le CLI prévient que `decision_reason` peut en
/// porter) et les autres caractères de contrôle, sauf le saut de ligne.
fn sans_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for suite in chars.by_ref() {
                    if ('@'..='~').contains(&suite) {
                        break;
                    }
                }
            }
            continue;
        }
        if c.is_control() && c != '\n' {
            continue;
        }
        out.push(c);
    }
    out
}

fn questions(input: &Value) -> Vec<&Value> {
    input
        .get("questions")
        .and_then(Value::as_array)
        .map(|q| q.iter().take(4).collect())
        .unwrap_or_default()
}

/// Portée d'une règle, dite comme le terminal la dit.
fn portee(destination: Option<&str>) -> &'static str {
    match destination {
        Some("userSettings") => "pour tous tes projets",
        Some("projectSettings") | Some("localSettings") => "dans ce projet",
        _ => "pendant cette session",
    }
}

/// Libellé du choix « toujours » construit depuis les règles que le CLI
/// propose. `None` si aucune n'est exploitable : pas de choix « toujours »
/// alors, comme dans le terminal.
fn choix_toujours(suggestions: &[Value]) -> Option<(String, String)> {
    let mut phrases = Vec::new();
    let mut portees = Vec::new();
    for s in suggestions {
        let dest = s.get("destination").and_then(Value::as_str);
        match s.get("type").and_then(Value::as_str) {
            Some("addRules") | Some("replaceRules")
                if s.get("behavior").and_then(Value::as_str) == Some("allow") =>
            {
                let regles: Vec<String> = s
                    .get("rules")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|r| {
                        let outil = texte(r, "toolName")?;
                        Some(match texte(r, "ruleContent") {
                            Some(contenu) => format!("« {} »", borne(contenu, 60)),
                            None => outil.to_string(),
                        })
                    })
                    .take(3)
                    .collect();
                if !regles.is_empty() {
                    phrases.push(format!("ne plus demander pour {}", regles.join(", ")));
                    portees.push(portee(dest));
                }
            }
            Some("setMode") if s.get("mode").and_then(Value::as_str) == Some("acceptEdits") => {
                phrases.push("accepter toutes les modifications".to_string());
                portees.push(portee(dest));
            }
            Some("addDirectories") => {
                let dossiers: Vec<String> = s
                    .get("directories")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_str)
                    .take(2)
                    .map(|d| borne(d, 60))
                    .collect();
                if !dossiers.is_empty() {
                    phrases.push(format!("autoriser {}", dossiers.join(", ")));
                    portees.push(portee(dest));
                }
            }
            _ => {}
        }
    }
    if phrases.is_empty() {
        return None;
    }
    portees.dedup();
    let description = format!("Règle retenue {}", portees.join(", "));
    Some((format!("Oui, et {}", phrases.join(" ; ")), description))
}

/// Aperçu avant/après joint à une demande de modification — ce que le
/// terminal montre au-dessus de sa question. Le fichier existant est lu AVANT
/// l'écriture : la demande précède toujours l'exécution de l'outil.
fn apercu_modification(tool: &str, input: &Value) -> Option<Value> {
    let chemin = texte(input, "file_path")?;
    let (avant, apres) = match tool {
        "Edit" => (
            input.get("old_string").and_then(Value::as_str)?.to_string(),
            input.get("new_string").and_then(Value::as_str)?.to_string(),
        ),
        "Write" => {
            let apres = input.get("content").and_then(Value::as_str)?.to_string();
            let avant = match std::fs::metadata(chemin) {
                Ok(m) if m.len() as usize > APERCU_MAX => return None,
                Ok(_) => std::fs::read_to_string(chemin).ok()?,
                Err(_) => String::new(),
            };
            (avant, apres)
        }
        _ => return None,
    };
    if avant.len() > APERCU_MAX || apres.len() > APERCU_MAX {
        return None;
    }
    Some(json!({"path": chemin, "oldText": avant, "newText": apres}))
}

fn choix(id: &str, libelle: &str, description: &str, kind: &str) -> Value {
    json!({"optionId": id, "label": libelle, "description": description, "kind": kind})
}

/// Carte d'interaction pour une demande `can_use_tool`.
pub fn interaction_spec(params: &Value) -> Value {
    let tool = params
        .get("tool_name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let affiche = texte(params, "display_name").unwrap_or(tool);
    let input = params.get("input").cloned().unwrap_or_else(|| json!({}));
    let item_id = params.get("tool_use_id").cloned().unwrap_or(Value::Null);

    if tool == "AskUserQuestion" {
        let qs = questions(&input);
        let fields: Vec<Value> = qs
            .iter()
            .enumerate()
            .map(|(i, q)| {
                let options: Vec<Value> = q
                    .get("options")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|o| {
                        let label = texte(o, "label")?;
                        let mut opt = json!({"label": label});
                        if let Some(d) = texte(o, "description") {
                            opt["description"] = json!(d);
                        }
                        Some(opt)
                    })
                    .collect();
                json!({
                    "id": format!("q{i}"),
                    "question": q.get("question").and_then(Value::as_str).unwrap_or(""),
                    "header": q.get("header").cloned().unwrap_or(Value::Null),
                    "options": options,
                    // Le terminal offre toujours « Autre » : le modèle lit la
                    // réponse libre telle quelle.
                    "allowOther": true,
                    "multiSelect": q.get("multiSelect").and_then(Value::as_bool).unwrap_or(false),
                    "secret": false,
                })
            })
            .collect();
        return json!({
            "interactionType": "user_input",
            "title": if fields.len() > 1 { "Claude a des questions" } else { "Claude a une question" },
            "fields": fields,
            "itemId": item_id,
        });
    }

    if tool == "ExitPlanMode" {
        let plan = input.get("plan").and_then(Value::as_str).unwrap_or("");
        return json!({
            "interactionType": "approval",
            "title": "Plan prêt à exécuter",
            "markdown": borne(plan, PLAN_MAX),
            "feedback": true,
            "choices": [
                choix(OPT_PLAN_AUTO, "Oui, et accepter les modifications",
                    "Claude exécute le plan sans redemander pour chaque fichier", "allow_always"),
                choix(OPT_PLAN_MANUEL, "Oui, en validant chaque modification",
                    "Claude demande avant chaque modification de fichier", "allow_once"),
                choix(OPT_PLAN_CONTINUER, "Non, continuer à planifier",
                    "Ta consigne ci-dessous lui est transmise", "reject_once"),
            ],
            "itemId": item_id,
        });
    }

    let title = match tool {
        "Bash" => "Exécution de commande".to_string(),
        "Write" | "Edit" | "MultiEdit" | "NotebookEdit" => "Modification de fichiers".to_string(),
        _ => format!("Outil {affiche}"),
    };
    let detail = texte(&input, "command")
        .or_else(|| texte(&input, "file_path"))
        .or_else(|| texte(&input, "notebook_path"))
        .or_else(|| texte(params, "description"))
        .unwrap_or_default();
    let suggestions: Vec<Value> = params
        .get("permission_suggestions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let toujours = if params
        .get("suppress_always_allow_rule")
        .and_then(Value::as_bool)
        == Some(true)
    {
        None
    } else {
        choix_toujours(&suggestions)
    };
    let mut choices = vec![choix(
        OPT_AUTORISER,
        "Autoriser",
        "Cette fois seulement",
        "allow_once",
    )];
    if let Some((libelle, description)) = toujours {
        choices.push(choix(OPT_TOUJOURS, &libelle, &description, "allow_always"));
    }
    choices.push(choix(
        OPT_REFUSER,
        "Refuser",
        "Claude cherche une autre voie ; ta consigne ci-dessous lui est transmise",
        "reject_once",
    ));
    let mut arreter = choix(
        OPT_ARRETER,
        "Refuser et arrêter",
        "Arrête le tour en cours",
        "reject_always",
    );
    arreter["cancelTurn"] = json!(true);
    choices.push(arreter);

    let mut spec = json!({
        "interactionType": "approval",
        "title": title,
        "detail": borne(detail, 400),
        "feedback": true,
        "choices": choices,
        "itemId": item_id,
    });
    if let Some(raison) = texte(params, "decision_reason") {
        spec["reason"] = json!(borne(sans_ansi(raison).trim(), 300));
    }
    if let Some(apercu) = apercu_modification(tool, &input) {
        spec["preview"] = apercu;
    }
    spec
}

fn allow(input: Value, permissions: Option<Value>) -> Value {
    let mut v = json!({"behavior": "allow", "updatedInput": input});
    if let Some(p) = permissions {
        v["updatedPermissions"] = p;
    }
    v
}

fn deny(message: String, interrupt: bool) -> Value {
    let mut v = json!({"behavior": "deny", "message": message});
    if interrupt {
        v["interrupt"] = json!(true);
    }
    v
}

fn consigne(reponse: &Value) -> Option<String> {
    texte(reponse, "message").map(|m| borne(m.trim(), 2000))
}

/// Réponse rendue au CLI (`control_response.response.response`). `None` =
/// pas d'interface ou demande expirée : refus sûr, jamais d'attente infinie.
pub fn verdict(request: &Value, reponse: Option<&Value>) -> Value {
    let input = request.get("input").cloned().unwrap_or_else(|| json!({}));
    let Some(r) = reponse else {
        return deny(REFUS_ATELIER.into(), false);
    };
    let arret = r.get("cancelTurn").and_then(Value::as_bool) == Some(true);
    let tool = request
        .get("tool_name")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if tool == "AskUserQuestion" {
        if arret {
            return deny("L'utilisateur a arrêté le tour.".into(), true);
        }
        let recues = r.get("answers").and_then(Value::as_object);
        let mut answers = Map::new();
        for (i, q) in questions(&input).iter().enumerate() {
            let Some(question) = q.get("question").and_then(Value::as_str) else {
                continue;
            };
            if let Some(a) = recues
                .and_then(|m| m.get(&format!("q{i}")))
                .and_then(Value::as_str)
            {
                if !a.trim().is_empty() {
                    answers.insert(question.to_string(), json!(a.trim()));
                }
            }
        }
        if answers.is_empty() {
            return deny(
                "L'utilisateur a refusé de répondre aux questions.".into(),
                false,
            );
        }
        let mut complet = input;
        if let Some(obj) = complet.as_object_mut() {
            obj.insert("answers".into(), Value::Object(answers));
        }
        return allow(complet, None);
    }

    let option = r.get("optionId").and_then(Value::as_str);
    if tool == "ExitPlanMode" {
        let mode = match option {
            Some(OPT_PLAN_AUTO) => Some("acceptEdits"),
            Some(OPT_PLAN_MANUEL) => Some("default"),
            _ => None,
        };
        return match mode {
            Some(mode) if !arret => allow(
                input,
                Some(json!([{"type": "setMode", "mode": mode, "destination": "session"}])),
            ),
            _ => {
                let mut message =
                    "L'utilisateur ne veut pas encore exécuter ce plan : continue à planifier."
                        .to_string();
                if let Some(c) = consigne(r) {
                    message.push_str(&format!(" Sa consigne : {c}"));
                }
                deny(message, arret)
            }
        };
    }

    // Permission ordinaire. L'ancien contrat oui/non ({allow, scope}) reste
    // compris : il vaut « une fois », jamais une règle que l'utilisateur
    // n'a pas vue.
    let accorde = match option {
        Some(OPT_AUTORISER) | Some(OPT_TOUJOURS) => true,
        Some(_) => false,
        None => r.get("allow").and_then(Value::as_bool) == Some(true),
    };
    if accorde && !arret {
        let regles = (option == Some(OPT_TOUJOURS))
            .then(|| request.get("permission_suggestions").cloned())
            .flatten()
            .filter(|s| s.as_array().is_some_and(|a| !a.is_empty()));
        return allow(input, regles);
    }
    let message = match consigne(r) {
        Some(c) => format!("L'utilisateur a refusé. Sa consigne : {c}"),
        None => REFUS_ATELIER.into(),
    };
    deny(message, arret || option == Some(OPT_ARRETER))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bash() -> Value {
        json!({
            "subtype": "can_use_tool",
            "tool_name": "Bash",
            "display_name": "Bash",
            "input": {"command": "npm test"},
            "tool_use_id": "toolu_1",
            "decision_reason": "\u{1b}[33mCommande non autorisée\u{1b}[0m",
            "permission_suggestions": [{
                "type": "addRules",
                "rules": [{"toolName": "Bash", "ruleContent": "npm test:*"}],
                "behavior": "allow",
                "destination": "localSettings",
            }],
        })
    }

    #[test]
    fn une_permission_offre_les_choix_du_terminal() {
        let spec = interaction_spec(&bash());
        assert_eq!(spec["interactionType"], "approval");
        assert_eq!(spec["title"], "Exécution de commande");
        assert_eq!(spec["detail"], "npm test");
        assert_eq!(spec["reason"], "Commande non autorisée");
        assert_eq!(spec["feedback"], true);
        let ids: Vec<&str> = spec["choices"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["optionId"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["allow_once", "allow_always", "deny", "deny_stop"]);
        assert_eq!(
            spec["choices"][1]["label"],
            "Oui, et ne plus demander pour « npm test:* »"
        );
        assert_eq!(
            spec["choices"][1]["description"],
            "Règle retenue dans ce projet"
        );
        assert_eq!(spec["choices"][3]["cancelTurn"], true);
    }

    #[test]
    fn sans_regle_proposee_pas_de_choix_toujours() {
        let mut req = bash();
        req.as_object_mut()
            .unwrap()
            .remove("permission_suggestions");
        let spec = interaction_spec(&req);
        assert!(spec["choices"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c["optionId"] != "allow_always"));
        let mut req = bash();
        req["suppress_always_allow_rule"] = json!(true);
        let spec = interaction_spec(&req);
        assert!(spec["choices"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c["optionId"] != "allow_always"));
    }

    #[test]
    fn toujours_rend_au_cli_ses_propres_regles() {
        let req = bash();
        let v = verdict(&req, Some(&json!({"optionId": "allow_always"})));
        assert_eq!(v["behavior"], "allow");
        assert_eq!(v["updatedInput"]["command"], "npm test");
        assert_eq!(v["updatedPermissions"], req["permission_suggestions"]);
        let v = verdict(&req, Some(&json!({"optionId": "allow_once"})));
        assert!(v.get("updatedPermissions").is_none());
    }

    #[test]
    fn un_refus_transmet_la_consigne_et_peut_arreter_le_tour() {
        let req = bash();
        let v = verdict(
            &req,
            Some(&json!({"optionId": "deny", "message": "lance plutôt cargo test"})),
        );
        assert_eq!(v["behavior"], "deny");
        assert!(v["message"]
            .as_str()
            .unwrap()
            .contains("lance plutôt cargo test"));
        assert!(v.get("interrupt").is_none());
        let v = verdict(
            &req,
            Some(&json!({"optionId": "deny_stop", "cancelTurn": true})),
        );
        assert_eq!(v["interrupt"], true);
        assert_eq!(v["message"], REFUS_ATELIER);
    }

    #[test]
    fn l_ancien_contrat_oui_non_reste_compris() {
        let req = bash();
        let v = verdict(&req, Some(&json!({"allow": true, "scope": "session"})));
        assert_eq!(v["behavior"], "allow");
        assert!(
            v.get("updatedPermissions").is_none(),
            "jamais une règle non montrée"
        );
        assert_eq!(
            verdict(&req, Some(&json!({"allow": false})))["behavior"],
            "deny"
        );
        assert_eq!(verdict(&req, None)["behavior"], "deny");
    }

    #[test]
    fn une_edition_joint_son_avant_apres() {
        let dir = tempfile::tempdir().unwrap();
        let existant = dir.path().join("a.py");
        std::fs::write(&existant, "x = 1\n").unwrap();
        let spec = interaction_spec(&json!({
            "tool_name": "Write",
            "input": {"file_path": existant.to_str().unwrap(), "content": "x = 2\n"},
            "tool_use_id": "t",
        }));
        assert_eq!(spec["title"], "Modification de fichiers");
        assert_eq!(spec["preview"]["oldText"], "x = 1\n");
        assert_eq!(spec["preview"]["newText"], "x = 2\n");
        let spec = interaction_spec(&json!({
            "tool_name": "Edit",
            "input": {"file_path": "/p/b.py", "old_string": "a", "new_string": "b"},
            "tool_use_id": "t",
        }));
        assert_eq!(
            spec["preview"],
            json!({"path": "/p/b.py", "oldText": "a", "newText": "b"})
        );
    }

    fn question() -> Value {
        json!({
            "tool_name": "AskUserQuestion",
            "tool_use_id": "toolu_q",
            "input": {"questions": [
                {"question": "Quelle méthode ?", "header": "Méthode", "multiSelect": false,
                 "options": [{"label": "LOO", "description": "Validation croisée"}, {"label": "WAIC"}]},
                {"question": "Quelles figures ?", "header": "Figures", "multiSelect": true,
                 "options": [{"label": "Carte"}, {"label": "Série"}]},
            ]},
        })
    }

    #[test]
    fn ask_user_question_devient_un_formulaire() {
        let spec = interaction_spec(&question());
        assert_eq!(spec["interactionType"], "user_input");
        assert_eq!(spec["title"], "Claude a des questions");
        assert_eq!(spec["fields"][0]["id"], "q0");
        assert_eq!(spec["fields"][0]["question"], "Quelle méthode ?");
        assert_eq!(
            spec["fields"][0]["options"][0]["description"],
            "Validation croisée"
        );
        assert_eq!(spec["fields"][0]["allowOther"], true);
        assert_eq!(spec["fields"][1]["multiSelect"], true);
    }

    #[test]
    fn les_reponses_repartent_indexees_par_la_question() {
        let v = verdict(
            &question(),
            Some(&json!({"answers": {"q0": "LOO", "q1": "Carte, Série"}})),
        );
        assert_eq!(v["behavior"], "allow");
        assert_eq!(v["updatedInput"]["answers"]["Quelle méthode ?"], "LOO");
        assert_eq!(
            v["updatedInput"]["answers"]["Quelles figures ?"],
            "Carte, Série"
        );
        assert_eq!(v["updatedInput"]["questions"][0]["header"], "Méthode");
        let v = verdict(&question(), Some(&json!({"answers": {}})));
        assert_eq!(v["behavior"], "deny");
    }

    fn plan() -> Value {
        json!({"tool_name": "ExitPlanMode", "tool_use_id": "toolu_p",
               "input": {"plan": "# Plan\n1. Lire\n2. Corriger"}})
    }

    #[test]
    fn exit_plan_mode_montre_le_plan_et_ses_trois_choix() {
        let spec = interaction_spec(&plan());
        assert_eq!(spec["markdown"], "# Plan\n1. Lire\n2. Corriger");
        assert_eq!(spec["choices"].as_array().unwrap().len(), 3);
        let v = verdict(&plan(), Some(&json!({"optionId": "plan_auto"})));
        assert_eq!(v["behavior"], "allow");
        assert_eq!(v["updatedPermissions"][0]["mode"], "acceptEdits");
        let v = verdict(&plan(), Some(&json!({"optionId": "plan_manual"})));
        assert_eq!(v["updatedPermissions"][0]["mode"], "default");
        let v = verdict(
            &plan(),
            Some(&json!({"optionId": "plan_keep", "message": "ajoute des tests"})),
        );
        assert_eq!(v["behavior"], "deny");
        assert!(v["message"].as_str().unwrap().contains("ajoute des tests"));
    }
}
