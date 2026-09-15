//! Independent A2 acceptance cases. These assert the required behavior.
use atelier_runtime::review::{
    build_review_input, coverage_of, decide_review, handle_request_review, last_finished_turn_id,
    transmitted_dossier, MAX_DOSSIER_BYTES,
};
use atelier_runtime::{AppPaths, AppState};
use atelier_store::{ReviewInput, ReviewStore};
use serde_json::{json, Value};

const PASSED: &str =
    r#"{"checks":[{"id":"git-turn-diff","outcome":"passed","evidenceIds":["git-diff"]}]}"#;

fn events(turn: &str, sequence_offset: u64) -> Vec<Value> {
    let mut events = vec![
        json!({"kind":"user","text":"corrige a.py"}),
        json!({"kind":"text","text":"a.py corrigé"}),
        json!({"kind":"edit","files":[{"path":"a.py","unified":"-old\n+new"}]}),
        json!({"kind":"done","ok":true,"filesChanged":["a.py"]}),
    ];
    for (index, event) in events.iter_mut().enumerate() {
        event["meta"] = json!({
            "threadId":"audit-thread", "turnId":turn,
            "eventId":format!("{turn}-{index}"),
            "sequence":sequence_offset + index as u64 + 1, "durable":true,
        });
    }
    events
}

fn input(events: &[Value]) -> ReviewInput {
    build_review_input("audit-thread", "turn-1", "git", events)
}

#[test]
fn missing_diff_for_one_changed_file_cannot_be_complete() {
    let mut events = events("turn-1", 0);
    events[3]["filesChanged"] = json!(["a.py", "b.py"]);
    let input = input(&events);
    assert_ne!(coverage_of(&input, &[]), "complete");
    assert_ne!(decide_review(&input, PASSED).outcome, "passed");
}

#[test]
fn required_check_without_its_required_evidence_cannot_pass() {
    let input = input(&events("turn-1", 0));
    for evidence_ids in [json!([]), json!(["prompt"])] {
        let reply = json!({"checks":[{
            "id":"git-turn-diff", "outcome":"passed", "evidenceIds":evidence_ids,
        }]})
        .to_string();
        assert_ne!(decide_review(&input, &reply).outcome, "passed", "{reply}");
    }
}

#[test]
fn transmission_then_decision_must_preserve_partial_coverage() {
    let mut events = events("turn-1", 0);
    events[2]["files"][0]["unified"] = json!("x".repeat(MAX_DOSSIER_BYTES + 1));
    let input = input(&events);
    let (_, truncated, coverage) = transmitted_dossier(&input);
    assert!(!truncated.is_empty());
    assert_eq!(coverage, "partial");
    // The public decision helper must account for the same transmission limits as the runner.
    let decision = decide_review(&input, PASSED);
    assert_ne!(
        decision.outcome, "passed",
        "coverage was {coverage}, now {}",
        decision.coverage
    );
}

#[test]
fn transmitted_unicode_dossier_respects_byte_limit() {
    let mut events = events("turn-1", 0);
    events[0]["text"] = json!("é".repeat(MAX_DOSSIER_BYTES));
    let (dossier, _, _) = transmitted_dossier(&input(&events));
    assert!(
        dossier.len() <= MAX_DOSSIER_BYTES,
        "{} transmitted bytes",
        dossier.len()
    );
}

#[test]
fn modified_input_cannot_be_loaded_under_original_hash() {
    let dir = tempfile::tempdir().unwrap();
    let store = ReviewStore::open(dir.path().to_path_buf());
    let mut input = input(&events("turn-1", 0));
    let hash = store.put_input(&input).unwrap();
    input.prompt = "modified after reservation".into();
    std::fs::write(
        dir.path().join("inputs").join(format!("{hash}.json")),
        serde_json::to_vec(&input).unwrap(),
    )
    .unwrap();
    assert!(
        store.get_input(&hash).is_err(),
        "changed content accepted under original hash"
    );
}

#[tokio::test]
async fn retry_returns_original_review_after_another_turn_finishes() {
    let dir = tempfile::tempdir().unwrap();
    let state = AppState::new(
        AppPaths::from_app_dir(dir.path().to_path_buf()),
        None,
        "audit".into(),
        "0.1".into(),
        "hash".into(),
        "/tmp".into(),
    );
    state
        .threads()
        .lock()
        .await
        .upsert(
            json!({"id":"audit-thread", "projectRoot":"/tmp", "provider":"codex"}),
            true,
        )
        .unwrap();
    for event in events("turn-1", 0) {
        state.journal().try_append(&event).unwrap();
    }
    let request = json!({
        "type":"requestReview", "requestId":"audit-retry", "threadId":"audit-thread",
        "mode":"git", "autoReview":{"provider":"audit-unavailable", "model":"m", "effort":"high"},
    });
    let first = handle_request_review(&state, &request).await;
    let first: Value = serde_json::from_str(&first[0]).unwrap();
    assert!(first["reviewId"].is_string(), "{first}");
    for event in events("turn-2", 4) {
        state.journal().try_append(&event).unwrap();
    }
    assert_eq!(
        last_finished_turn_id(&state.journal().materialize("audit-thread")).as_deref(),
        Some("turn-2")
    );
    let retry = handle_request_review(&state, &request).await;
    let retry: Value = serde_json::from_str(&retry[0]).unwrap();
    assert_eq!(
        retry["reviewId"], first["reviewId"],
        "retry response: {retry}"
    );
    assert_eq!(retry["turnId"], "turn-1");
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            if state
                .reviews()
                .get(first["reviewId"].as_str().unwrap())
                .unwrap()
                .status
                == "error"
            {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let reopened = AppState::new(
        AppPaths::from_app_dir(dir.path().to_path_buf()),
        None,
        "audit".into(),
        "0.1".into(),
        "hash".into(),
        "/tmp".into(),
    );
    let replay = handle_request_review(&reopened, &request).await;
    let replay: Value = serde_json::from_str(&replay[0]).unwrap();
    assert_eq!(replay["reviewId"], first["reviewId"]);
    assert_eq!(replay["turnId"], "turn-1");
    let original = state
        .reviews()
        .get(first["reviewId"].as_str().unwrap())
        .unwrap();
    assert_eq!(
        reopened
            .reviews()
            .get(first["reviewId"].as_str().unwrap())
            .unwrap()
            .input_hash,
        original.input_hash
    );
    for (field, value) in [("turnId", json!("turn-1")), ("mode", json!("claims"))] {
        let mut changed = request.clone();
        changed[field] = value;
        let collision = handle_request_review(&reopened, &changed).await;
        let collision: Value = serde_json::from_str(&collision[0]).unwrap();
        assert_eq!(collision["type"], "error");
        assert!(collision["message"]
            .as_str()
            .unwrap()
            .contains("REQUEST_COLLISION"));
    }
    assert_eq!(
        reopened
            .reviews()
            .list_thread("audit-thread", None, 20)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn tool_proof_retains_invocation_exit_code_reference_and_loss_markers() {
    let mut events = events("turn-1", 0);
    let tool = json!({"kind":"tool_update", "name":"Bash", "status":"done",
        "input":{"command":"python verify.py --strict", "cwd":"/tmp"},
        "exitCode":1, "output":"partial", "outputLength":1000, "truncated":true,
        "storageFault":"payload absent", "meta":{"turnId":"turn-1", "eventId":"tool-result"}});
    events.insert(3, tool.clone());
    let input = input(&events);
    let proof = input
        .evidence
        .iter()
        .find(|item| item.kind == "tool")
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(proof.content.as_ref().unwrap()).unwrap(),
        tool
    );
    assert!(input.missing.contains(&proof.evidence_id));
    assert!(input.truncated.contains(&proof.evidence_id));
    assert_ne!(decide_review(&input, PASSED).outcome, "passed");
}

#[test]
fn corrupt_evidence_metadata_is_rejected_even_with_matching_global_hash() {
    let dir = tempfile::tempdir().unwrap();
    let store = ReviewStore::open(dir.path());
    let original = input(&events("turn-1", 0));
    for field in ["length", "sha256", "payloadRef"] {
        let mut altered = original.clone();
        match field {
            "length" => altered.evidence[0].bytes += 1,
            "sha256" => altered.evidence[0].sha256 = "0".repeat(64),
            _ => altered.evidence[0].payload_ref = Some("0".repeat(64)),
        }
        let hash = atelier_store::hash_input(&altered);
        let path = dir.path().join("inputs").join(format!("{hash}.json"));
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let bytes = serde_json::to_vec(&altered).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        assert!(store.get_input(&hash).is_err(), "{field}");
        assert!(store.put_input(&altered).is_err(), "{field}");
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }
}

#[test]
fn shell_rewrite_of_an_already_covered_file_is_not_complete() {
    let mut events = events("turn-1", 0);
    events.insert(
        3,
        json!({"kind":"tool_update", "name":"Bash", "status":"done",
        "input":{"command":"printf different > a.py"}, "output":"", "exitCode":0,
        "meta":{"turnId":"turn-1", "eventId":"shell-rewrite"}}),
    );
    let input = input(&events);
    assert!(input
        .missing
        .contains(&"git-diff:tool-effects-unverified".into()));
    assert_ne!(decide_review(&input, PASSED).outcome, "passed");
}

#[test]
fn missing_journal_payload_activity_makes_coverage_partial() {
    let mut events = events("turn-1", 0);
    // Exact activity shape returned by HarnessJournal::payload_fault.
    events.insert(
        3,
        json!({"kind":"activity", "name":"journal", "status":"failed",
        "storageFault":{"code":"payload_absent", "detail":"missing"},
        "meta":{"turnId":"turn-1", "eventId":"lost-tool"}}),
    );
    let input = input(&events);
    assert!(input
        .missing
        .iter()
        .any(|id| id.starts_with("journal-limit-")));
    assert!(input.evidence.iter().any(|proof| proof.origin == "journal"));
    assert_eq!(decide_review(&input, PASSED).coverage, "partial");
    assert_ne!(decide_review(&input, PASSED).outcome, "passed");
}
