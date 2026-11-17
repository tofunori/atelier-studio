//! Tests du provider Antigravity contre `tests/fixtures/fake_agy_acp.mts`.

use super::*;
use crate::traits::SendMode;

fn node_bin() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ATELIER_TEST_NODE") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let out = std::process::Command::new("which")
        .arg("node")
        .output()
        .ok()?;
    let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !p.is_empty()).then(|| PathBuf::from(p))
}

fn fixture_provider(mode: &str) -> Option<AntigravityProvider> {
    let node = node_bin().or_else(|| {
        eprintln!("SKIP: node introuvable pour le faux agy");
        None
    })?;
    let fixture = format!(
        "{}/tests/fixtures/fake_agy_acp.mts",
        env!("CARGO_MANIFEST_DIR")
    );
    Some(AntigravityProvider::with_bin(
        node,
        vec![fixture.clone(), mode.into()],
        vec![fixture],
    ))
}

struct TurnOutput {
    result: SendResult,
    events: Vec<Value>,
}

impl TurnOutput {
    fn text(&self) -> String {
        self.events
            .iter()
            .filter(|e| e["kind"] == "delta")
            .filter_map(|e| e["text"].as_str())
            .collect()
    }
    fn errors(&self) -> Vec<String> {
        self.events
            .iter()
            .filter(|e| e["kind"] == "error")
            .filter_map(|e| e["message"].as_str().map(str::to_string))
            .collect()
    }
    fn done(&self) -> Option<&Value> {
        self.events.iter().find(|e| e["kind"] == "done")
    }
    fn tools(&self) -> Vec<&Value> {
        self.events
            .iter()
            .filter(|e| e["kind"] == "tool_update")
            .collect()
    }
}

#[derive(Default, Clone)]
struct Turn {
    thread: &'static str,
    session_id: Option<String>,
    model: Option<&'static str>,
    effort: Option<&'static str>,
    mode: Option<&'static str>,
    consigne: Option<&'static str>,
    inputs: Option<Vec<Value>>,
}

async fn run(
    p: &AntigravityProvider,
    prompt: &str,
    t: Turn,
    on_interaction: Option<InteractionFn>,
    is_cancelled: Option<Arc<dyn Fn() -> bool + Send + Sync>>,
) -> TurnOutput {
    let events: Arc<StdMutex<Vec<Value>>> = Arc::new(StdMutex::new(vec![]));
    let sink = Arc::clone(&events);
    let req = SendRequest {
        additional_directories: Vec::new(),
        thread_id: if t.thread.is_empty() {
            "t-agy".into()
        } else {
            t.thread.into()
        },
        turn_id: "turn-1".into(),
        prompt: prompt.into(),
        inputs: t.inputs,
        project_root: "/tmp/fake-agy-proj".into(),
        session_id: t.session_id,
        model: t.model.map(str::to_string),
        effort: t.effort.map(str::to_string),
        fast_mode: false,
        permission_mode: t.mode.map(str::to_string),
        fork_pending: false,
        mode: SendMode::Normal,
        on_event: Arc::new(move |ev| sink.lock().unwrap().push(ev)),
        on_session_opened: None,
        on_interaction,
        is_cancelled: is_cancelled.unwrap_or_else(|| Arc::new(|| false)),
        consigne: t.consigne.map(str::to_string),
        atelier_mcp: None,
    };
    let result = p.send(req).await;
    let events = events.lock().unwrap().clone();
    TurnOutput { result, events }
}

/// Relais d'interface qui note chaque demande et répond `answer`.
fn relay(answer: Value) -> (InteractionFn, Arc<StdMutex<Vec<(String, Value)>>>) {
    let seen: Arc<StdMutex<Vec<(String, Value)>>> = Arc::new(StdMutex::new(vec![]));
    let log = Arc::clone(&seen);
    let f: InteractionFn = Arc::new(move |method: String, params: Value| {
        log.lock().unwrap().push((method, params));
        let answer = answer.clone();
        Box::pin(async move { Some(answer) })
    });
    (f, seen)
}

async fn counters(p: &AntigravityProvider) -> Value {
    p.acp
        .request("_fake/counters", json!({}), Some(5_000))
        .await
        .unwrap()
}

// --------------------------------------------------------------------- tours

#[tokio::test]
async fn tour_nominal_flux_usage_et_mode_pose() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(&p, "bonjour", Turn::default(), None, None).await;
    assert!(out.result.ok, "{:?}", out.errors());
    assert!(out
        .result
        .session_id
        .as_deref()
        .unwrap()
        .starts_with("agy_sess_"));
    let text = out.text();
    assert!(
        text.contains("model=gemini-4-carbon,effort=medium,mode=default"),
        "{text}"
    );
    assert!(out.events.iter().any(|e| e["kind"] == "thinking_delta"));
    let done = out.done().unwrap();
    assert_eq!(done["usage"]["context"], 1052);
    assert_eq!(done["usage"]["window"], 1048576);
    // Le mode est posé même quand il vaut déjà `default` (D6).
    assert_eq!(counters(&p).await["set_mode"], json!(["default"]));
}

#[tokio::test]
async fn le_process_vit_dans_un_dossier_neutre() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(&p, "bonjour", Turn::default(), None, None).await;
    let text = out.text();
    let pcwd = text
        .split("pcwd=")
        .nth(1)
        .unwrap_or("")
        .split_whitespace()
        .next()
        .unwrap_or("");
    assert_eq!(
        canonical(pcwd),
        canonical(&std::env::temp_dir().to_string_lossy())
    );
    assert_ne!(canonical(pcwd), canonical("/tmp/fake-agy-proj"));
}

#[tokio::test]
async fn modele_et_effort_sont_deux_options() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(
        &p,
        "bonjour",
        Turn {
            model: Some("claude-opus-5-5"),
            effort: Some("high"),
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert!(out.result.ok, "{:?}", out.errors());
    assert!(
        out.text().contains("model=claude-opus-5-5,effort=high"),
        "{}",
        out.text()
    );
}

#[tokio::test]
async fn effort_ignore_pour_un_modele_sans_reflexion() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(
        &p,
        "bonjour",
        Turn {
            model: Some("gpt-oss-120b-medium"),
            effort: Some("high"),
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert!(out.result.ok, "{:?}", out.errors());
    assert!(out.text().contains("model=gpt-oss-120b-medium,effort=n/a"));
}

#[tokio::test]
async fn modele_inconnu_arrete_le_tour_avant_le_prompt() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(
        &p,
        "bonjour",
        Turn {
            model: Some("gemini-4-carbon-high"),
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert!(!out.result.ok);
    assert!(out.done().is_none());
    assert!(
        out.errors()[0].contains("gemini-4-carbon-high"),
        "{:?}",
        out.errors()
    );
}

#[tokio::test]
async fn effort_hors_crans_refuse() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(
        &p,
        "bonjour",
        Turn {
            effort: Some("xhigh"),
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert!(!out.result.ok);
    assert!(
        out.errors()[0].contains("low, medium, high"),
        "{:?}",
        out.errors()
    );
}

#[tokio::test]
async fn consigne_en_tete_du_prompt() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(
        &p,
        "bonjour",
        Turn {
            consigne: Some("Réponds en une phrase."),
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert!(out.text().contains("consigne=oui"));
}

#[tokio::test]
async fn tour_muet_denonce() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(&p, "[silent]", Turn::default(), None, None).await;
    assert!(!out.result.ok);
    assert!(out.errors()[0].contains("sans répondre"));
}

#[tokio::test]
async fn refus_du_modele() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(&p, "[refusal]", Turn::default(), None, None).await;
    assert!(!out.result.ok);
    assert!(out.result.error.unwrap().contains("refusal"));
}

#[tokio::test]
async fn image_envoyee() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let dir = tempfile::tempdir().unwrap();
    let img = dir.path().join("a.png");
    std::fs::write(&img, [0x89, b'P', b'N', b'G']).unwrap();
    let inputs = vec![json!({"type":"local_image","path": img.to_string_lossy()})];
    let out = run(
        &p,
        "[image]",
        Turn {
            inputs: Some(inputs),
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert!(out.result.ok, "{:?}", out.errors());
    assert!(out.text().contains("img:image/png"));
}

// -------------------------------------------------------------- permissions

#[tokio::test]
async fn permission_relayee_avec_id_en_chaine() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let (f, seen) = relay(json!({"optionId": "allow"}));
    let out = run(&p, "[command]", Turn::default(), Some(f), None).await;
    assert!(out.result.ok, "{:?}", out.errors());
    assert!(out.text().contains("permission=allow"), "{}", out.text());
    let seen = seen.lock().unwrap();
    assert_eq!(seen.len(), 1);
    assert_eq!(seen[0].0, PERMISSION_METHOD);
    let spec = interaction_spec(&seen[0].1);
    assert_eq!(spec["title"], "Exécution de commande");
    assert_eq!(spec["detail"], "ls -la");
    let ids: Vec<&str> = spec["choices"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|c| c["optionId"].as_str())
        .collect();
    assert_eq!(ids, vec!["allow", OPT_ALWAYS_THREAD, "deny"]);
    let cmd = out
        .tools()
        .into_iter()
        .rev()
        .find(|t| t["name"] == "run_command")
        .unwrap();
    assert_eq!(cmd["status"], "completed");
    assert_eq!(cmd["output"], "a.txt\nb.txt\n");
}

#[tokio::test]
async fn sans_interface_la_permission_est_annulee() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(&p, "[command]", Turn::default(), None, None).await;
    assert!(
        out.text().contains("permission=cancelled"),
        "{}",
        out.text()
    );
}

#[tokio::test]
async fn refuser() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let (f, _) = relay(json!({"optionId": "deny"}));
    let out = run(&p, "[command]", Turn::default(), Some(f), None).await;
    assert!(out.text().contains("permission=deny"));
}

#[tokio::test]
async fn toujours_pour_ce_fil_ne_redemande_plus() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let (f, seen) = relay(json!({"optionId": OPT_ALWAYS_THREAD}));
    let t = Turn {
        thread: "t-regle",
        ..Default::default()
    };
    let out1 = run(&p, "[command]", t.clone(), Some(f.clone()), None).await;
    assert!(out1.text().contains("permission=allow"), "{}", out1.text());
    let sid = out1.result.session_id.clone();
    let out2 = run(
        &p,
        "[command]",
        Turn {
            session_id: sid,
            ..t
        },
        Some(f.clone()),
        None,
    )
    .await;
    assert!(out2.text().contains("permission=allow"));
    assert_eq!(seen.lock().unwrap().len(), 1, "la règle répond sans carte");
    // Un autre fil n'hérite pas de la règle.
    let out3 = run(
        &p,
        "[command]",
        Turn {
            thread: "t-autre",
            ..Default::default()
        },
        Some(f),
        None,
    )
    .await;
    assert!(out3.text().contains("permission=allow"));
    assert_eq!(seen.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn toujours_les_modifications_passe_en_accept_edits() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let (f, seen) = relay(json!({"optionId": OPT_ALWAYS_EDITS}));
    let t = Turn {
        thread: "t-edits",
        ..Default::default()
    };
    let out1 = run(&p, "[edit]", t.clone(), Some(f.clone()), None).await;
    assert!(out1.text().contains("permission=allow"), "{}", out1.text());
    assert!(out1.events.iter().any(|e| e["kind"] == "edit"));
    let spec = interaction_spec(&seen.lock().unwrap()[0].1);
    assert_eq!(spec["title"], "Modification de fichiers");
    assert_eq!(spec["detail"], "/tmp/fake-agy-proj/notes.md");
    // Le tour suivant, en mode Atelier `default`, garde `accept-edits`.
    let sid = out1.result.session_id.clone();
    let out2 = run(
        &p,
        "bonjour",
        Turn {
            session_id: sid,
            ..t
        },
        None,
        None,
    )
    .await;
    assert!(out2.text().contains("mode=accept-edits"), "{}", out2.text());
}

#[tokio::test]
async fn bypass_autorise_mais_jamais_la_revue_de_plan() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let t = Turn {
        mode: Some("bypassPermissions"),
        ..Default::default()
    };
    let out = run(&p, "[command]", t.clone(), None, None).await;
    assert!(out.text().contains("permission=allow"), "{}", out.text());
    assert!(
        out.text().contains("mode=default"),
        "bypass reste `default` côté agy"
    );
    let out = run(&p, "[plan-review]", t, None, None).await;
    assert!(
        out.text().contains("permission=cancelled"),
        "{}",
        out.text()
    );
}

#[tokio::test]
async fn revue_de_plan_montre_le_plan() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let (f, seen) = relay(json!({"optionId": "allow"}));
    let out = run(
        &p,
        "[plan-review]",
        Turn {
            mode: Some("plan"),
            ..Default::default()
        },
        Some(f),
        None,
    )
    .await;
    assert!(out.text().contains("mode=plan"));
    assert!(out.text().contains("permission=allow"));
    let spec = interaction_spec(&seen.lock().unwrap()[0].1);
    assert_eq!(spec["title"], "Plan prêt à exécuter");
    assert_eq!(spec["markdown"], "# Plan\n1. Lire\n2. Écrire");
    assert_eq!(spec["choices"].as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn question_orpheline_fermee() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(&p, "[question]", Turn::default(), None, None).await;
    assert!(out.result.ok, "{:?}", out.errors());
    let q: Vec<&Value> = out
        .tools()
        .into_iter()
        .filter(|t| t["name"] == "ask_question")
        .collect();
    assert_eq!(q.last().unwrap()["status"], "completed");
    assert!(out.text().contains("Laquelle"));
}

// ---------------------------------------------------- sessions et erreurs

#[tokio::test]
async fn auth_requise_message_actionnable() {
    let Some(p) = fixture_provider("auth_required") else {
        return;
    };
    let out = run(&p, "bonjour", Turn::default(), None, None).await;
    assert!(!out.result.ok);
    assert!(
        out.errors()[0].contains("Connexion Antigravity"),
        "{:?}",
        out.errors()
    );
}

#[tokio::test]
async fn version_trop_ancienne() {
    let Some(p) = fixture_provider("old_version") else {
        return;
    };
    let out = run(&p, "bonjour", Turn::default(), None, None).await;
    assert!(!out.result.ok);
    assert!(out.errors()[0].contains("1.5.10"), "{:?}", out.errors());
}

#[tokio::test]
async fn session_disparue_puis_nouvelle_session() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let t = Turn {
        session_id: Some("agy_inconnue".into()),
        ..Default::default()
    };
    let out = run(&p, "bonjour", t.clone(), None, None).await;
    assert!(!out.result.ok);
    assert!(out.errors()[0].contains("n'existe plus"));
    let out = run(&p, "bonjour", t, None, None).await;
    assert!(out.result.ok, "{:?}", out.errors());
    assert_ne!(out.result.session_id.as_deref(), Some("agy_inconnue"));
}

#[tokio::test]
async fn reprise_sans_resume_quand_la_session_est_ouverte() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let out = run(&p, "bonjour", Turn::default(), None, None).await;
    let sid = out.result.session_id.clone();
    let out = run(
        &p,
        "encore",
        Turn {
            session_id: sid.clone(),
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert_eq!(out.result.session_id, sid);
    assert_eq!(counters(&p).await["resume"], 0);
}

#[tokio::test]
async fn stop_via_is_cancelled() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let started = std::time::Instant::now();
    let flag: Arc<dyn Fn() -> bool + Send + Sync> =
        Arc::new(move || started.elapsed() > Duration::from_millis(400));
    let out = run(&p, "[cancel]", Turn::default(), None, Some(flag)).await;
    assert!(out.result.ok, "Stop = succès");
    assert_eq!(
        counters(&p).await["close"],
        0,
        "pas d'escalade quand cancel suffit"
    );
}

#[tokio::test]
async fn stop_sans_effet_ferme_la_session_puis_la_rouvre() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let p = p.with_stop_close_after(Duration::from_millis(300));
    let started = std::time::Instant::now();
    let flag: Arc<dyn Fn() -> bool + Send + Sync> =
        Arc::new(move || started.elapsed() > Duration::from_millis(300));
    let out = run(&p, "[stuck]", Turn::default(), None, Some(flag)).await;
    assert!(out.result.ok);
    assert_eq!(counters(&p).await["close"], 1);
    let sid = out.result.session_id.clone();
    let out = run(
        &p,
        "bonjour",
        Turn {
            session_id: sid,
            ..Default::default()
        },
        None,
        None,
    )
    .await;
    assert!(out.result.ok, "{:?}", out.errors());
    assert_eq!(
        counters(&p).await["resume"],
        1,
        "session oubliée puis rouverte"
    );
}

#[tokio::test]
async fn cli_fige_coupe_par_le_filet() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let p = p.with_idle(Duration::from_millis(800));
    let out = run(&p, "[mute]", Turn::default(), None, None).await;
    assert!(!out.result.ok);
    assert!(out.errors()[0].contains("timeout Antigravity"));
}

#[tokio::test]
async fn tour_long_qui_parle_pas_coupe() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let p = p.with_idle(Duration::from_millis(800));
    let out = run(&p, "[chatty]", Turn::default(), None, None).await;
    assert!(out.result.ok, "{:?}", out.errors());
}

#[tokio::test]
async fn liste_filtree_par_dossier_cote_atelier() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let list = p.list_sessions("/tmp/fake-agy-list").await.unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0]["id"], "agy_hist_1");
    assert_eq!(list[0]["title"], "Session du projet");
    assert!(list[0]["mtime"].as_u64().unwrap() > 0);
    assert_eq!(p.list_sessions("").await.unwrap().len(), 2);
}

#[tokio::test]
async fn historique_rejoue_une_seule_fois() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let hist = p
        .native_history("agy_hist_1", "/tmp/fake-agy-list")
        .await
        .unwrap();
    let kinds: Vec<&str> = hist.iter().filter_map(|e| e["kind"].as_str()).collect();
    assert!(kinds.contains(&"user"), "{kinds:?}");
    assert!(kinds.contains(&"text"), "{kinds:?}");
    assert!(p
        .native_history("agy_hist_1", "/tmp/fake-agy-list")
        .await
        .is_none());
}

// ------------------------------------------------------------- unitaires

fn perm(tool_call: Value) -> Value {
    json!({"sessionId":"s","toolCall": tool_call, "options":[
        {"optionId":"allow","name":"Allow","kind":"allow_once"},
        {"optionId":"deny","name":"Deny","kind":"reject_once"}]})
}

#[test]
fn classement_des_demandes() {
    assert_eq!(
        classify(&perm(
            json!({"name":"run_command","args":{"CommandLine":" git status "}})
        )),
        Demande::Command("git status".into())
    );
    assert_eq!(
        classify(&perm(json!({"name":"mcp_zotero_search","kind":"other"}))),
        Demande::Mcp("mcp_zotero_search".into())
    );
    assert_eq!(
        classify(&perm(json!({"name":"edit_file","kind":"edit"}))),
        Demande::Edit
    );
    assert_eq!(
        classify(&perm(json!({"title":"x","kind":"edit"}))),
        Demande::Edit
    );
    assert_eq!(
        classify(&perm(json!({"name":"write_file","kind":"edit",
            "content":[{"type":"diff","path":"/Users/t/.gemini/antigravity-cli/brain/s/implementation_plan.md","newText":"p"}]}))),
        Demande::Plan
    );
    assert_eq!(
        classify(&perm(
            json!({"name":"write_file","args":{"ArtifactMetadata":{"RequestFeedback":true}}})
        )),
        Demande::Plan
    );
    assert_eq!(
        classify(&perm(json!({"name":"ask_question"}))),
        Demande::Other
    );
    assert_eq!(
        classify(&perm(json!({"name":"run_command"}))),
        Demande::Other,
        "sans ligne, pas de règle"
    );
}

#[test]
fn toujours_lu_avant_l_outcome() {
    let p = perm(json!({"name":"run_command","args":{"CommandLine":"ls"}}));
    let (o, s) = resolve_answer(&p, Some(json!({"optionId": OPT_ALWAYS_THREAD})));
    assert_eq!(
        o,
        json!({"outcome":{"outcome":"selected","optionId":"allow"}})
    );
    assert_eq!(s, Suite::Regle("cmd:ls".into()));
    // Forme héritée {allow, scope:"session"} : même règle.
    let (_, s) = resolve_answer(&p, Some(json!({"allow": true, "scope": "session"})));
    assert_eq!(s, Suite::Regle("cmd:ls".into()));
    // Une fois : pas de règle.
    let (o, s) = resolve_answer(&p, Some(json!({"allow": true})));
    assert_eq!(o["outcome"]["optionId"], "allow");
    assert_eq!(s, Suite::Rien);
    let (o, _) = resolve_answer(&p, Some(json!({"allow": false})));
    assert_eq!(o["outcome"]["optionId"], "deny");
    let (o, _) = resolve_answer(&p, None);
    assert_eq!(o["outcome"]["outcome"], "cancelled");
    let (o, _) = resolve_answer(&p, Some(json!({"optionId": "inventé"})));
    assert_eq!(o["outcome"]["outcome"], "cancelled");
    let e = perm(json!({"name":"write_file","kind":"edit"}));
    let (_, s) = resolve_answer(&e, Some(json!({"optionId": OPT_ALWAYS_EDITS})));
    assert_eq!(s, Suite::ModificationsToujours);
}

#[test]
fn reponse_automatique_regles_et_bypass() {
    let cmd = perm(json!({"name":"run_command","args":{"CommandLine":"ls"}}));
    assert!(auto_answer(&cmd, false, None).is_none());
    let rules: HashSet<String> = ["cmd:ls".to_string()].into();
    assert!(auto_answer(&cmd, false, Some(&rules)).is_some());
    let other = perm(json!({"name":"run_command","args":{"CommandLine":"ls -la"}}));
    assert!(
        auto_answer(&other, false, Some(&rules)).is_none(),
        "commande exacte seulement"
    );
    assert!(auto_answer(&other, true, None).is_some());
    let plan =
        perm(json!({"name":"write_file","args":{"ArtifactMetadata":{"RequestFeedback":true}}}));
    assert!(auto_answer(&plan, true, None).is_none());
    let q = perm(json!({"name":"ask_question"}));
    assert!(auto_answer(&q, true, None).is_none());
}

#[test]
fn modes_atelier_vers_agy() {
    assert_eq!(map_permission_mode("", false), Some("default"));
    assert_eq!(map_permission_mode("default", true), Some("accept-edits"));
    assert_eq!(
        map_permission_mode("acceptEdits", false),
        Some("accept-edits")
    );
    assert_eq!(map_permission_mode("plan", true), Some("plan"));
    assert_eq!(
        map_permission_mode("bypassPermissions", false),
        Some("default")
    );
    assert_eq!(map_permission_mode("auto", false), Some("auto"));
    assert_eq!(map_permission_mode("yolo", false), None);
}

#[test]
fn session_disparue_codes() {
    let e = |code: i64, msg: &str| AcpRpcError {
        code: Some(code),
        message: msg.into(),
        data: None,
        transport: false,
    };
    assert!(is_session_gone(&e(-32002, "Resource not found")));
    assert!(is_session_gone(&e(-32602, "Session not found: abc")));
    assert!(!is_session_gone(&e(
        -32602,
        "Invalid params: cwd must be absolute"
    )));
    assert!(!is_session_gone(&e(-32000, "Authentication required")));
}

#[test]
fn carte_de_forme_inattendue_garde_les_options() {
    let p = json!({"toolCall":{"title":"Truc"},"options":[{"optionId":"x","name":"X","kind":"allow_once"},
        {"optionId":"y","name":"Y","kind":"allow_once"}]});
    let spec = interaction_spec(&p);
    assert_eq!(spec["choices"].as_array().unwrap().len(), 2);
    assert_eq!(spec["title"], "Truc");
}

#[test]
fn environnement_sans_cles_api() {
    assert!(ENV_REMOVED.contains(&"GEMINI_API_KEY"));
    assert!(ENV_REMOVED.contains(&"GOOGLE_API_KEY"));
}

// ------------------------------------------------- catalogue et sonde (lot 3)

#[tokio::test]
async fn sonde_reglages_prete_avec_palier() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let probe = p.setup_probe().await.unwrap();
    assert_eq!(probe["state"], "ready", "{probe}");
    assert_eq!(probe["version"], "1.5.10");
    assert_eq!(probe["models"], 3);
    assert_eq!(probe["tier"], "Google AI Pro");
    assert_eq!(probe["loginCommand"], "agy");
    // La session de sonde est refermée.
    assert_eq!(counters(&p).await["close"], 1);
}

#[tokio::test]
async fn sonde_connexion_manquante_sans_authenticate() {
    let Some(p) = fixture_provider("auth_required") else {
        return;
    };
    let probe = p.setup_probe().await.unwrap();
    assert_eq!(probe["state"], "login_needed");
    assert_eq!(
        counters(&p).await["authenticate"],
        0,
        "jamais authenticate (D7)"
    );
}

#[tokio::test]
async fn sonde_version_trop_ancienne() {
    let Some(p) = fixture_provider("old_version") else {
        return;
    };
    let probe = p.setup_probe().await.unwrap();
    assert_eq!(probe["state"], "version_unsupported");
}

#[tokio::test]
async fn catalogue_vivant_modeles_efforts_libelles() {
    let Some(p) = fixture_provider("nominal") else {
        return;
    };
    let cat = p.dynamic_models().await.unwrap();
    assert_eq!(
        cat["models"],
        json!(["gemini-4-carbon", "claude-opus-5-5", "gpt-oss-120b-medium"])
    );
    assert_eq!(cat["defaultModel"], "gemini-4-carbon");
    assert_eq!(cat["modelLabels"]["gemini-4-carbon"], "Gemini 4 Carbon");
    assert_eq!(
        cat["modelLabels"]["claude-opus-5-5"],
        "Claude Opus 5.5 (Thinking)"
    );
    assert_eq!(
        cat["modelReasoning"]["claude-opus-5-5"]["supported_efforts"],
        json!(["low", "medium", "high"])
    );
    assert_eq!(
        cat["modelReasoning"]["claude-opus-5-5"]["default_effort"],
        "medium"
    );
}

#[test]
fn lecture_de_agy_models() {
    let out = "Fetching available models...\ngemini-4-carbon-high\tGemini 4 Carbon (High)\n\
               gpt-oss-120b-medium\tGPT-OSS 120B (Medium)\n\nligne sans tabulation\n";
    assert_eq!(
        parse_agy_models(out),
        vec![
            (
                "gemini-4-carbon-high".to_string(),
                "Gemini 4 Carbon (High)".to_string()
            ),
            (
                "gpt-oss-120b-medium".to_string(),
                "GPT-OSS 120B (Medium)".to_string()
            ),
        ]
    );
}

#[test]
fn lecture_de_version() {
    assert_eq!(parse_version("agy 1.5.10\n").as_deref(), Some("1.5.10"));
    assert_eq!(parse_version("1.5.10").as_deref(), Some("1.5.10"));
    assert_eq!(
        parse_version("antigravity v1.6.0 (abc)").as_deref(),
        Some("1.6.0")
    );
    assert_eq!(parse_version("rien"), None);
}

#[test]
fn ids_de_modele_jamais_coupes() {
    let snapshot = json!([{"id":"model","category":"model","currentValue":"gpt-oss-120b-medium",
        "options":[{"value":"gpt-oss-120b-medium","name":"GPT-OSS"}]}]);
    let cat = catalog_from_snapshot(&snapshot, &serde_json::Map::new()).unwrap();
    assert_eq!(cat["models"], json!(["gpt-oss-120b-medium"]));
    assert_eq!(cat["modelLabels"]["gpt-oss-120b-medium"], "GPT-OSS");
    assert!(cat["modelReasoning"].as_object().unwrap().is_empty());
}
