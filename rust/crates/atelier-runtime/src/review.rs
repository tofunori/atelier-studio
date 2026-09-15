//! Isolated structured review (plan 080 A2) and native Git classification (A1).

use crate::state::AppState;
use crate::ws_router::{err_thread, json_msg};
use atelier_providers::{ReviewError, ReviewRequest};
use atelier_store::{
    dedup_key, evidence_sha256, hash_config, new_review_id, now_iso, RequiredCheck, ReviewCheck,
    ReviewConfig, ReviewErrorInfo, ReviewEvidence, ReviewInput, ReviewPolicy, ReviewRecord,
    ReviewReservation, REVIEW_SCHEMA_VERSION,
};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, OwnedSemaphorePermit, Semaphore};

pub const REVIEW_MODE_GIT: &str = "git";
pub const REVIEW_MODE_CLAIMS: &str = "claims";
pub const MAX_CONCURRENT_REVIEWS: usize = 2;
pub const MAX_REVIEWS_PER_THREAD: usize = 1;
pub const REVIEW_TIMEOUT: Duration = Duration::from_secs(90);
pub const MAX_DOSSIER_BYTES: usize = 128 * 1024;
pub const GET_REVIEWS_DEFAULT: usize = 20;
pub const GET_REVIEWS_MAX: usize = 100;

pub fn review_running(thread_id: &str) -> Value {
    json!({
        "type": "reviewResult",
        "threadId": thread_id,
        "status": "running",
        "mode": REVIEW_MODE_GIT,
        "executionStatus": "running",
    })
}

pub fn review_result_from_native(thread_id: &str, result: Result<Value, String>) -> Value {
    match result {
        Err(error) => json!({
            "type": "reviewResult",
            "threadId": thread_id,
            "status": "done",
            "verdict": "error",
            "mode": REVIEW_MODE_GIT,
            "issues": [],
            "error": error,
        }),
        Ok(value) => {
            let text = native_review_text(&value);
            json!({
                "type": "reviewResult",
                "threadId": thread_id,
                "status": "done",
                "verdict": "inconclusive",
                "mode": REVIEW_MODE_GIT,
                "issues": [],
                "text": text,
            })
        }
    }
}

fn native_review_text(value: &Value) -> Option<&str> {
    let raw = value.get("review").and_then(Value::as_str)?;
    if raw.trim().is_empty() {
        None
    } else {
        Some(raw)
    }
}

#[derive(Clone)]
pub struct ReviewLimiter {
    global: Arc<Semaphore>,
    threads: Arc<Mutex<HashMap<String, Arc<Semaphore>>>>,
}

impl ReviewLimiter {
    pub fn new() -> Self {
        Self {
            global: Arc::new(Semaphore::new(MAX_CONCURRENT_REVIEWS)),
            threads: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    async fn acquire(&self, thread_id: &str) -> (OwnedSemaphorePermit, OwnedSemaphorePermit) {
        let thread = {
            let mut guard = self.threads.lock().await;
            guard
                .entry(thread_id.to_string())
                .or_insert_with(|| Arc::new(Semaphore::new(MAX_REVIEWS_PER_THREAD)))
                .clone()
        };
        let thread = thread.acquire_owned().await.expect("review thread limiter");
        let global = self
            .global
            .clone()
            .acquire_owned()
            .await
            .expect("review limiter");
        (global, thread)
    }
}

pub fn normalize_trigger(raw: Option<&str>) -> Result<String, String> {
    match raw.unwrap_or("always") {
        "turn" | "always" => Ok("always".into()),
        "files-changed" => Ok("files-changed".into()),
        "manual" => Ok("manual".into()),
        other => Err(format!("déclencheur de revue inconnu: {other}")),
    }
}

pub fn parse_mode(raw: Option<&str>) -> Result<String, String> {
    match raw.unwrap_or(REVIEW_MODE_CLAIMS) {
        REVIEW_MODE_GIT => Ok(REVIEW_MODE_GIT.into()),
        REVIEW_MODE_CLAIMS => Ok(REVIEW_MODE_CLAIMS.into()),
        other => Err(format!("mode de revue inconnu: {other}")),
    }
}

pub fn last_finished_turn_id(events: &[Value]) -> Option<String> {
    events.iter().rev().find_map(|event| {
        let kind = event.get("kind").and_then(Value::as_str)?;
        if kind == "done" || kind == "error" {
            event
                .pointer("/meta/turnId")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .map(str::to_string)
        } else {
            None
        }
    })
}

pub fn events_for_turn<'a>(events: &'a [Value], turn_id: &str) -> Vec<&'a Value> {
    events
        .iter()
        .filter(|event| event.pointer("/meta/turnId").and_then(Value::as_str) == Some(turn_id))
        .collect()
}

pub fn build_review_input(
    thread_id: &str,
    turn_id: &str,
    mode: &str,
    events: &[Value],
) -> ReviewInput {
    let turn_events = events_for_turn(events, turn_id);
    let prompt = turn_events
        .iter()
        .filter(|event| event.get("kind").and_then(Value::as_str) == Some("user"))
        .filter_map(|event| event.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n");
    let responses: Vec<String> = turn_events
        .iter()
        .filter(|event| event.get("kind").and_then(Value::as_str) == Some("text"))
        .filter_map(|event| {
            event
                .get("text")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();
    let mut evidence = Vec::new();
    let mut missing = Vec::new();
    let mut truncated = Vec::new();
    push_evidence(
        &mut evidence,
        "prompt",
        "user",
        "prompt",
        &prompt,
        "demande du tour",
    );
    for (index, text) in responses.iter().enumerate() {
        push_evidence(
            &mut evidence,
            &format!("response-{index}"),
            "assistant",
            "response",
            text,
            "réponse du tour",
        );
    }
    for (index, event) in turn_events
        .iter()
        .filter(|event| {
            matches!(
                event.get("kind").and_then(Value::as_str),
                Some("tool") | Some("tool_update")
            )
        })
        .enumerate()
    {
        let name = event.get("name").and_then(Value::as_str).unwrap_or("outil");
        // Preserve the journal reference, exact invocation, exit code and all
        // upstream loss markers; a preview must not become a complete proof.
        let body = serde_json::to_string(event).expect("journal event JSON");
        let evidence_id = format!("tool-{index}");
        let output_shortened = event
            .get("outputLength")
            .and_then(Value::as_u64)
            .zip(event.get("output").and_then(Value::as_str))
            .is_some_and(|(bytes, output)| bytes > output.len() as u64);
        if event.get("truncated").and_then(Value::as_bool) == Some(true) || output_shortened {
            truncated.push(evidence_id.clone());
        }
        if event
            .get("storageFault")
            .is_some_and(|v| !v.is_null() && v != &json!(false))
        {
            missing.push(evidence_id.clone());
        }
        push_evidence(
            &mut evidence,
            &format!("tool-{index}"),
            "tool",
            "tool",
            &body,
            name,
        );
    }
    // Journal payload failures are materialized as activity events, not tools.
    for (index, event) in turn_events.iter().enumerate() {
        if matches!(
            event.get("kind").and_then(Value::as_str),
            Some("tool") | Some("tool_update")
        ) {
            continue;
        }
        let fault = event
            .get("storageFault")
            .is_some_and(|v| !v.is_null() && v != &json!(false));
        let clipped = event.get("truncated").and_then(Value::as_bool) == Some(true);
        if fault || clipped {
            let id = format!("journal-limit-{index}");
            let content = serde_json::to_string(event).expect("journal event JSON");
            push_evidence(
                &mut evidence,
                &id,
                "journal",
                "limitation",
                &content,
                "historique incomplet",
            );
            if fault {
                missing.push(id.clone());
            }
            if clipped {
                truncated.push(id);
            }
        }
    }
    let mut diff_chunks = Vec::new();
    let mut changed_files = Vec::new();
    let mut diff_files = HashSet::new();
    let mut missing_diff_files = HashSet::new();
    for event in &turn_events {
        if event.get("kind").and_then(Value::as_str) == Some("edit") {
            if let Some(files) = event.get("files").and_then(Value::as_array) {
                for file in files {
                    let path = file
                        .get("path")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    if !path.is_empty() {
                        changed_files.push(path.clone());
                    }
                    if let Some(unified) = file.get("unified").and_then(Value::as_str) {
                        if !path.is_empty() && !unified.trim().is_empty() {
                            diff_files.insert(path.clone());
                            diff_chunks.push(format!("--- {path}\n{unified}"));
                        } else {
                            missing_diff_files.insert(path.clone());
                        }
                    } else if let (Some(old), Some(new)) = (
                        file.get("oldText").and_then(Value::as_str),
                        file.get("newText").and_then(Value::as_str),
                    ) {
                        diff_files.insert(path.clone());
                        diff_chunks.push(format!("--- {path}\n<<<\n{old}\n>>>\n{new}"));
                    } else {
                        missing_diff_files.insert(path.clone());
                    }
                }
            }
        }
        if event.get("kind").and_then(Value::as_str) == Some("done") {
            if let Some(files) = event.get("filesChanged").and_then(Value::as_array) {
                for file in files {
                    if let Some(path) = file.as_str() {
                        changed_files.push(path.to_string());
                    }
                }
            }
        }
    }
    changed_files.sort();
    changed_files.dedup();
    // Edit snippets do not establish the final state after a shell/MCP call.
    // Until a terminal snapshot is captured, unknown tool effects keep Git
    // coverage partial, even if every changed path has an earlier edit snippet.
    let unverified_tool_effects = turn_events.iter().any(|event| {
        matches!(
            event.get("kind").and_then(Value::as_str),
            Some("tool") | Some("tool_update")
        ) && !matches!(
            event
                .get("name")
                .or_else(|| event.get("tool"))
                .and_then(Value::as_str),
            Some("Edit") | Some("Write") | Some("MultiEdit") | Some("apply_patch")
        )
    });
    if mode == REVIEW_MODE_GIT && !changed_files.is_empty() && unverified_tool_effects {
        missing.push("git-diff:tool-effects-unverified".into());
    }
    if mode == REVIEW_MODE_GIT {
        for path in &changed_files {
            if !diff_files.contains(path) || missing_diff_files.contains(path) {
                missing.push(format!("git-diff:{path}"));
            }
        }
    }
    let diff = if diff_chunks.is_empty() {
        None
    } else {
        Some(diff_chunks.join("\n\n"))
    };
    if let Some(diff_text) = diff.as_deref() {
        push_evidence(
            &mut evidence,
            "git-diff",
            "turn-diff",
            "diff",
            diff_text,
            "diff figé du tour",
        );
    } else if mode == REVIEW_MODE_GIT {
        missing.push("git-diff".into());
    }
    for (index, path) in changed_files.iter().enumerate() {
        push_evidence(
            &mut evidence,
            &format!("file-{index}"),
            "turn-files",
            "artifact",
            path,
            path,
        );
    }
    let required_checks = required_checks_for(mode, &evidence, &missing);
    if prompt.trim().is_empty() {
        missing.push("prompt".into());
    }
    if responses.is_empty() {
        missing.push("response".into());
    }
    ReviewInput {
        schema_version: REVIEW_SCHEMA_VERSION,
        thread_id: thread_id.into(),
        turn_id: turn_id.into(),
        mode: mode.into(),
        scope_id: format!("{mode}:{turn_id}"),
        prompt,
        responses,
        evidence,
        required_checks,
        missing,
        truncated,
        diff,
        diff_scope: "turn".into(),
        extra: Map::new(),
    }
}

fn push_evidence(
    evidence: &mut Vec<ReviewEvidence>,
    id: &str,
    origin: &str,
    kind: &str,
    content: &str,
    summary: &str,
) {
    evidence.push(ReviewEvidence {
        evidence_id: id.into(),
        origin: origin.into(),
        sha256: evidence_sha256(content),
        bytes: content.len() as u64,
        kind: kind.into(),
        summary: summary.into(),
        payload_ref: Some(evidence_sha256(content)),
        content: Some(content.into()),
    });
}

fn required_checks_for(
    mode: &str,
    evidence: &[ReviewEvidence],
    missing: &[String],
) -> Vec<RequiredCheck> {
    if mode != REVIEW_MODE_GIT {
        return Vec::new();
    }
    let diff_id = evidence
        .iter()
        .find(|item| item.evidence_id == "git-diff")
        .map(|item| item.evidence_id.clone());
    let required = match diff_id.clone() {
        Some(id) => vec![id],
        None if missing.iter().any(|item| item == "git-diff") => vec!["git-diff".into()],
        None => Vec::new(),
    };
    vec![RequiredCheck {
        id: "git-turn-diff".into(),
        claim: "Le diff figé du tour ciblé est cohérent et ne couvre pas le worktree entier."
            .into(),
        target_evidence_ids: required.clone(),
        required_evidence_ids: required,
    }]
}

pub fn transmitted_dossier(input: &ReviewInput) -> (String, Vec<String>, String) {
    let full = render_dossier(input, true);
    if full.len() <= MAX_DOSSIER_BYTES {
        let coverage = coverage_of(input, &[]);
        return (full, Vec::new(), coverage);
    }
    let compact = render_dossier(input, false);
    let truncated = vec!["dossier-transmitted".into()];
    let coverage = coverage_of(input, &truncated);
    if compact.len() <= MAX_DOSSIER_BYTES {
        (compact, truncated, coverage)
    } else {
        let mut end = MAX_DOSSIER_BYTES;
        while !compact.is_char_boundary(end) {
            end -= 1;
        }
        let clipped = compact[..end].to_string();
        (clipped, truncated, coverage)
    }
}

fn render_dossier(input: &ReviewInput, include_content: bool) -> String {
    let checks =
        serde_json::to_string_pretty(&input.required_checks).unwrap_or_else(|_| "[]".into());
    let mut body = String::new();
    body.push_str(
        "Tu es un vérificateur indépendant. N'utilise aucun outil. Réponds uniquement par JSON.\n",
    );
    body.push_str(&format!("scopeId: {}\n", input.scope_id));
    body.push_str(&format!("mode: {}\n", input.mode));
    body.push_str("diffScope: changements du tour ciblé uniquement, pas le dépôt entier.\n");
    body.push_str(&format!("requiredChecks:\n{checks}\n"));
    body.push_str(&format!("prompt:\n{}\n", input.prompt));
    body.push_str("responses:\n");
    for response in &input.responses {
        body.push_str(response);
        body.push('\n');
    }
    body.push_str("evidence:\n");
    for item in &input.evidence {
        body.push_str(&format!(
            "- id={} kind={} origin={} sha256={}\n",
            item.evidence_id, item.kind, item.origin, item.sha256
        ));
        if include_content {
            if let Some(content) = &item.content {
                body.push_str(content);
                body.push('\n');
            }
        }
    }
    if let Some(diff) = &input.diff {
        if include_content {
            body.push_str("--- DIFF FIGE DU TOUR ---\n");
            body.push_str(diff);
            body.push('\n');
        }
    }
    body.push_str(
        "Réponds exclusivement avec {\"checks\":[{\"id\":\"...\",\"claim\":\"...\",\"outcome\":\"passed|failed|inconclusive\",\"evidenceIds\":[\"...\"]}],\"limitations\":[]}\n",
    );
    body
}

pub fn coverage_of(input: &ReviewInput, extra_truncated: &[String]) -> String {
    let truncated = !input.truncated.is_empty() || !extra_truncated.is_empty();
    let required_ids: Vec<_> = input
        .required_checks
        .iter()
        .flat_map(|check| check.required_evidence_ids.iter())
        .cloned()
        .collect();
    if required_ids.is_empty() {
        return "partial".into();
    }
    let available: HashSet<_> = input
        .evidence
        .iter()
        .filter(|item| item.content.is_some())
        .map(|item| item.evidence_id.as_str())
        .collect();
    let missing = required_ids
        .iter()
        .any(|id| !available.contains(id.as_str()))
        || !input.missing.is_empty();
    if missing && available.is_empty() {
        "unavailable".into()
    } else if missing || truncated {
        "partial".into()
    } else {
        "complete".into()
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ReviewDecision {
    pub outcome: String,
    pub coverage: String,
    pub checks: Vec<ReviewCheck>,
    pub limitations: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ModelOutput {
    checks: Option<Vec<ModelCheck>>,
    limitations: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct ModelCheck {
    id: String,
    claim: Option<String>,
    outcome: String,
    #[serde(rename = "evidenceIds", default)]
    evidence_ids: Vec<String>,
}

pub fn decide_review(input: &ReviewInput, raw_text: &str) -> ReviewDecision {
    let (_, truncated, _) = transmitted_dossier(input);
    decide_transmitted_review(input, raw_text, &truncated)
}

fn decide_transmitted_review(
    input: &ReviewInput,
    raw_text: &str,
    truncated: &[String],
) -> ReviewDecision {
    let coverage = coverage_of(input, truncated);
    let known_ids: HashSet<_> = input
        .evidence
        .iter()
        .map(|item| item.evidence_id.as_str())
        .collect();
    let parsed = parse_model_output(raw_text);
    let mut limitations = input.missing.clone();
    limitations.extend(input.truncated.clone());
    limitations.extend_from_slice(truncated);
    let Ok(output) = parsed else {
        limitations.push("unparseable".into());
        return ReviewDecision {
            outcome: "inconclusive".into(),
            coverage,
            checks: Vec::new(),
            limitations,
        };
    };
    if let Some(extra) = output.limitations {
        limitations.extend(extra);
    }
    let mut seen = HashSet::new();
    let mut checks = Vec::new();
    let mut unknown_evidence = false;
    let mut duplicate = false;
    for item in output.checks.unwrap_or_default() {
        if !seen.insert(item.id.clone()) {
            duplicate = true;
            continue;
        }
        if item
            .evidence_ids
            .iter()
            .any(|id| !known_ids.contains(id.as_str()))
        {
            unknown_evidence = true;
        }
        let outcome = match item.outcome.as_str() {
            "passed" | "failed" | "inconclusive" => item.outcome,
            _ => "inconclusive".into(),
        };
        checks.push(ReviewCheck {
            id: item.id,
            claim: item.claim.unwrap_or_default(),
            outcome,
            evidence_ids: item.evidence_ids,
        });
    }
    if duplicate {
        limitations.push("duplicate-check-id".into());
    }
    if unknown_evidence {
        limitations.push("unknown-evidence".into());
    }
    let required_ids: Vec<_> = input
        .required_checks
        .iter()
        .map(|check| check.id.as_str())
        .collect();
    let produced: HashSet<_> = checks.iter().map(|check| check.id.as_str()).collect();
    let omitted = required_ids.iter().any(|id| !produced.contains(id));
    if omitted {
        limitations.push("omitted-required-check".into());
    }
    let missing_check_evidence = input.required_checks.iter().any(|required| {
        let Some(check) = checks.iter().find(|check| check.id == required.id) else {
            return true;
        };
        required
            .required_evidence_ids
            .iter()
            .chain(&required.target_evidence_ids)
            .any(|id| !check.evidence_ids.contains(id))
    });
    if missing_check_evidence {
        limitations.push("missing-required-check-evidence".into());
    }
    let any_failed = checks.iter().any(|check| check.outcome == "failed");
    let required_all_passed = !required_ids.is_empty()
        && required_ids.iter().all(|id| {
            checks
                .iter()
                .any(|check| check.id == *id && check.outcome == "passed")
        });
    let outcome = if any_failed {
        "failed".into()
    } else if unknown_evidence
        || missing_check_evidence
        || omitted
        || duplicate
        || required_ids.is_empty()
        || coverage != "complete"
        || !required_all_passed
        || checks.iter().any(|check| check.outcome != "passed")
    {
        "inconclusive".into()
    } else {
        "passed".into()
    };
    ReviewDecision {
        outcome,
        coverage,
        checks,
        limitations,
    }
}

fn parse_model_output(raw: &str) -> Result<ModelOutput, ()> {
    let start = raw.find('{').ok_or(())?;
    let end = raw.rfind('}').ok_or(())?;
    if end <= start {
        return Err(());
    }
    serde_json::from_str(&raw[start..=end]).map_err(|_| ())
}

pub fn project_review_result(record: &ReviewRecord, request_id: Option<&str>) -> Value {
    let execution_status = record.status.as_str();
    let status = match execution_status {
        "queued" | "running" => "running",
        _ => "done",
    };
    let verdict = match (execution_status, record.outcome.as_deref()) {
        ("queued" | "running", _) => Value::Null,
        ("error", _) => json!("error"),
        ("cancelled" | "interrupted", _) => json!("inconclusive"),
        (_, Some("passed")) => json!("ok"),
        (_, Some("failed")) => json!("issues"),
        (_, Some("inconclusive")) => json!("inconclusive"),
        _ => json!("inconclusive"),
    };
    let issues: Vec<Value> = record
        .checks
        .iter()
        .filter(|check| check.outcome == "failed")
        .map(|check| {
            json!({
                "claim": check.claim,
                "problem": check.outcome,
                "severity": "review",
            })
        })
        .collect();
    let mut payload = json!({
        "type": "reviewResult",
        "threadId": record.thread_id,
        "turnId": record.turn_id,
        "reviewId": record.review_id,
        "status": status,
        "executionStatus": execution_status,
        "verdict": verdict,
        "outcome": record.outcome,
        "coverage": record.coverage,
        "mode": record.mode,
        "issues": issues,
        "checks": record.checks.len(),
        "limitations": record.limitations,
        "createdAt": record.created_at,
        "updatedAt": record.updated_at,
    });
    if let Some(request_id) = request_id {
        payload
            .as_object_mut()
            .unwrap()
            .insert("requestId".into(), json!(request_id));
    }
    if let Some(error) = &record.error {
        payload.as_object_mut().unwrap().insert(
            "error".into(),
            json!({"code": error.code, "message": error.message}),
        );
    }
    payload
}

pub async fn handle_request_review(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").and_then(Value::as_str);
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    if thread_id.is_empty() {
        return vec![err_thread("", "review: threadId requis")];
    }
    let thread = state.threads().lock().await.get(thread_id).cloned();
    let Some(thread) = thread else {
        return vec![err_thread(thread_id, "review: chat absent")];
    };
    if let Some(project_root) = msg.get("projectRoot").and_then(Value::as_str) {
        if thread.project_root != project_root {
            return vec![err_thread(
                thread_id,
                "review: fil d'un autre projet refusé",
            )];
        }
    }
    let mode = match parse_mode(msg.get("mode").and_then(Value::as_str)) {
        Ok(mode) => mode,
        Err(error) => return vec![err_thread(thread_id, error)],
    };
    let auto = msg.get("autoReview");
    let trigger =
        match normalize_trigger(auto.and_then(|v| v.get("trigger")).and_then(Value::as_str)) {
            Ok(trigger) => trigger,
            Err(error) => return vec![err_thread(thread_id, error)],
        };
    let config = ReviewConfig {
        provider: auto
            .and_then(|v| v.get("provider"))
            .and_then(Value::as_str)
            .unwrap_or("codex")
            .to_string(),
        model: auto
            .and_then(|v| v.get("model"))
            .and_then(Value::as_str)
            .unwrap_or("gpt-5.5")
            .to_string(),
        effort: auto
            .and_then(|v| v.get("effort"))
            .and_then(Value::as_str)
            .unwrap_or("high")
            .to_string(),
    };
    let policy = ReviewPolicy {
        enabled: auto
            .and_then(|v| v.get("enabled"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        trigger: trigger.clone(),
        autofix: auto
            .and_then(|v| v.get("autofix"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        max_corrections: 1,
    };
    // Hash the admitted payload, not the subsequently resolved implicit turn.
    let mut payload = msg.as_object().cloned().unwrap_or_default();
    payload.remove("requestId");
    payload.remove("type");
    let fingerprint = atelier_store::canonical_sha256(&Value::Object(payload));
    if let Some(request_id) = request_id {
        match state.reviews().get_by_request(request_id) {
            Ok(Some(existing)) => {
                if existing.thread_id == thread_id
                    && existing
                        .extra
                        .get("requestFingerprint")
                        .and_then(Value::as_str)
                        == Some(fingerprint.as_str())
                {
                    return vec![json_msg(project_review_result(&existing, Some(request_id)))];
                }
                return vec![err_thread(thread_id, "REQUEST_COLLISION")];
            }
            Ok(None) => {}
            Err(error) => return vec![err_thread(thread_id, error.to_string())],
        }
    }
    let events = state.journal().materialize(thread_id);
    let turn_id = match msg
        .get("turnId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
    {
        Some(id) => id.to_string(),
        None => match last_finished_turn_id(&events) {
            Some(id) => id,
            None => return vec![err_thread(thread_id, "review: aucun tour terminé")],
        },
    };
    let input = build_review_input(thread_id, &turn_id, &mode, &events);
    let input_hash = match state.reviews().put_input(&input) {
        Ok(hash) => hash,
        Err(error) => return vec![err_thread(thread_id, error.to_string())],
    };
    let config_hash = hash_config(&config, &policy);
    let now = now_iso();
    let record = ReviewRecord {
        schema_version: REVIEW_SCHEMA_VERSION,
        review_id: new_review_id(),
        thread_id: thread_id.into(),
        turn_id: turn_id.clone(),
        input_hash: input_hash.clone(),
        config_hash: config_hash.clone(),
        dedup_key: dedup_key(thread_id, &turn_id, &input_hash, &config_hash, &mode),
        client_request_id: request_id.map(str::to_string),
        mode: mode.clone(),
        trigger: "manual".into(),
        config: config.clone(),
        policy,
        status: "queued".into(),
        outcome: None,
        coverage: coverage_of(&input, &[]),
        checks: vec![],
        limitations: input.missing.clone(),
        attempt: 1,
        created_at: now.clone(),
        updated_at: now,
        error: None,
        extra: Map::from_iter([("requestFingerprint".into(), json!(fingerprint))]),
    };
    let reserved = match state.reviews().reserve(record) {
        Ok(reserved) => reserved,
        Err(error) => return vec![err_thread(thread_id, error.to_string())],
    };
    match reserved {
        ReviewReservation::Collision(existing) => {
            vec![err_thread(
                thread_id,
                format!("REQUEST_COLLISION:{}", existing.review_id),
            )]
        }
        ReviewReservation::Existing(existing) => {
            vec![json_msg(project_review_result(&existing, request_id))]
        }
        ReviewReservation::New(record) => {
            let projected = project_review_result(&record, request_id);
            let state = state.clone();
            let review_id = record.review_id.clone();
            let thread_id_owned = thread_id.to_string();
            tokio::spawn(async move {
                run_isolated_review(state, review_id, thread_id_owned, input).await;
            });
            vec![json_msg(projected)]
        }
    }
}

async fn run_isolated_review(
    state: AppState,
    review_id: String,
    thread_id: String,
    input: ReviewInput,
) {
    let _permits = state.review_limiter().acquire(&thread_id).await;
    let Ok(mut record) = state.reviews().get(&review_id) else {
        return;
    };
    record.status = "running".into();
    record.updated_at = now_iso();
    let Ok(record) = state.reviews().put(record) else {
        return;
    };
    state.publish(json_msg(project_review_result(
        &record,
        record.client_request_id.as_deref(),
    )));
    let provider_id = record.config.provider.clone();
    let Some(provider) = state.provider(&provider_id) else {
        finish_error(
            &state,
            record,
            "REVIEW_UNSUPPORTED",
            format!("provider {provider_id} absent"),
        )
        .await;
        return;
    };
    if !provider.structured_review() {
        finish_error(
            &state,
            record,
            "REVIEW_UNSUPPORTED",
            format!("structuredReview indisponible pour {provider_id}"),
        )
        .await;
        return;
    }
    let (dossier, truncated, coverage) = transmitted_dossier(&input);
    let request = ReviewRequest {
        model: record.config.model.clone(),
        effort: record.config.effort.clone(),
        dossier,
    };
    let result = tokio::time::timeout(REVIEW_TIMEOUT, provider.review(request)).await;
    let mut next = record;
    next.coverage = coverage;
    next.limitations.extend(truncated.clone());
    next.updated_at = now_iso();
    match result {
        Err(_) => {
            next.status = "error".into();
            next.outcome = None;
            next.error = Some(ReviewErrorInfo {
                code: "REVIEW_TIMEOUT".into(),
                message: "délai de revue dépassé".into(),
            });
        }
        Ok(Err(ReviewError::Unsupported)) => {
            next.status = "error".into();
            next.outcome = None;
            next.error = Some(ReviewErrorInfo {
                code: "REVIEW_UNSUPPORTED".into(),
                message: "revue isolée non supportée par le provider".into(),
            });
        }
        Ok(Err(ReviewError::Timeout)) => {
            next.status = "error".into();
            next.outcome = None;
            next.error = Some(ReviewErrorInfo {
                code: "REVIEW_TIMEOUT".into(),
                message: "délai de revue dépassé".into(),
            });
        }
        Ok(Err(ReviewError::Provider(message))) => {
            next.status = "error".into();
            next.outcome = None;
            next.error = Some(ReviewErrorInfo {
                code: "REVIEW_PROVIDER".into(),
                message,
            });
        }
        Ok(Ok(response)) => {
            let decision = decide_transmitted_review(&input, &response.text, &truncated);
            next.status = "completed".into();
            next.outcome = Some(decision.outcome);
            next.coverage = decision.coverage;
            next.checks = decision.checks;
            next.limitations = decision.limitations;
            next.error = None;
        }
    }
    if let Ok(saved) = state.reviews().put(next) {
        state.publish(json_msg(project_review_result(
            &saved,
            saved.client_request_id.as_deref(),
        )));
    }
}

async fn finish_error(state: &AppState, mut record: ReviewRecord, code: &str, message: String) {
    record.status = "error".into();
    record.outcome = None;
    record.updated_at = now_iso();
    record.error = Some(ReviewErrorInfo {
        code: code.into(),
        message,
    });
    if let Ok(saved) = state.reviews().put(record) {
        state.publish(json_msg(project_review_result(
            &saved,
            saved.client_request_id.as_deref(),
        )));
    }
}

pub async fn handle_get_reviews(state: &AppState, msg: &Value) -> Vec<String> {
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let thread_id = msg.get("threadId").and_then(Value::as_str).unwrap_or("");
    if thread_id.is_empty() {
        return vec![err_thread("", "getReviews: threadId requis")];
    }
    let thread = state.threads().lock().await.get(thread_id).cloned();
    let Some(thread) = thread else {
        return vec![err_thread(thread_id, "getReviews: chat absent")];
    };
    if let Some(project_root) = msg.get("projectRoot").and_then(Value::as_str) {
        if thread.project_root != project_root {
            return vec![err_thread(
                thread_id,
                "getReviews: fil d'un autre projet refusé",
            )];
        }
    }
    let limit = msg
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(GET_REVIEWS_DEFAULT as u64)
        .clamp(1, GET_REVIEWS_MAX as u64) as usize;
    let before = msg.get("before").and_then(Value::as_str);
    match state.reviews().list_thread(thread_id, before, limit) {
        Ok(records) => {
            let reviews: Vec<Value> = records
                .iter()
                .map(|record| project_review_result(record, None))
                .collect();
            vec![json_msg(json!({
                "type": "reviews",
                "requestId": request_id,
                "threadId": thread_id,
                "reviews": reviews,
            }))]
        }
        Err(error) => vec![err_thread(thread_id, error.to_string())],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::AppPaths;
    use atelier_providers::{FakeProvider, Provider};
    use serde_json::json;
    use tempfile::tempdir;

    fn native_verdict(value: &Value) -> &str {
        value.get("verdict").and_then(Value::as_str).unwrap_or("")
    }

    #[test]
    fn empty_native_review_is_inconclusive_without_issues() {
        let msg = review_result_from_native("t1", Ok(json!({"review": ""})));
        assert_eq!(native_verdict(&msg), "inconclusive");
        assert_eq!(msg["issues"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn whitespace_native_review_is_inconclusive_without_issues() {
        let msg = review_result_from_native("t1", Ok(json!({"review": "  \n\t  "})));
        assert_eq!(native_verdict(&msg), "inconclusive");
    }

    #[test]
    fn missing_review_field_is_inconclusive() {
        let msg = review_result_from_native("t1", Ok(json!({"other": "x"})));
        assert_eq!(native_verdict(&msg), "inconclusive");
    }

    #[test]
    fn no_findings_substring_is_not_ok() {
        let msg = review_result_from_native("t1", Ok(json!({"review": "No findings."})));
        assert_eq!(native_verdict(&msg), "inconclusive");
        assert_eq!(msg["text"], "No findings.");
    }

    #[test]
    fn french_aucun_probleme_is_not_ok() {
        let msg = review_result_from_native(
            "t1",
            Ok(json!({"review": "Aucun problème détecté dans le diff."})),
        );
        assert_eq!(native_verdict(&msg), "inconclusive");
    }

    #[test]
    fn mixed_no_findings_and_error_is_not_ok() {
        let body = "no findings dans X, mais erreur dans Y";
        let msg = review_result_from_native("t1", Ok(json!({"review": body})));
        assert_eq!(native_verdict(&msg), "inconclusive");
        assert_eq!(msg["text"], body);
    }

    #[test]
    fn unstructured_native_text_is_preserved_and_inconclusive() {
        let body = "Le fichier albedo.py change la pente sans test.";
        let msg = review_result_from_native("t1", Ok(json!({"review": body})));
        assert_eq!(native_verdict(&msg), "inconclusive");
        assert_eq!(msg["text"], body);
    }

    #[test]
    fn provider_error_keeps_reason_and_is_not_ok() {
        let msg = review_result_from_native("t1", Err("codex unavailable".into()));
        assert_eq!(native_verdict(&msg), "error");
        assert_eq!(msg["error"], "codex unavailable");
    }

    #[test]
    fn native_git_review_never_emits_ok() {
        for sample in [
            json!({"review": ""}),
            json!({"review": "no findings"}),
            json!({"review": "aucun probleme"}),
            json!({}),
        ] {
            let msg = review_result_from_native("t1", Ok(sample));
            assert_ne!(native_verdict(&msg), "ok");
        }
    }

    #[test]
    fn review_running_is_not_a_terminal_verdict() {
        let msg = review_running("t1");
        assert_eq!(msg["status"], "running");
        assert!(msg.get("verdict").is_none() || msg["verdict"].is_null());
    }

    fn sample_events(thread_id: &str, turn: &str) -> Vec<Value> {
        vec![
            json!({"kind":"user","text":"corrige turn.py","meta":{"threadId":thread_id,"turnId":turn,"eventId":format!("{turn}-u1"),"sequence":1,"durable":true}}),
            json!({"kind":"text","text":"j'ai modifié turn.py","meta":{"threadId":thread_id,"turnId":turn,"eventId":format!("{turn}-t1"),"sequence":2,"durable":true}}),
            json!({"kind":"edit","files":[{"path":"turn.py","unified":"-a\n+b"}],"meta":{"threadId":thread_id,"turnId":turn,"eventId":format!("{turn}-e1"),"sequence":3,"durable":true}}),
            json!({"kind":"done","ok":true,"filesChanged":["turn.py"],"meta":{"threadId":thread_id,"turnId":turn,"eventId":format!("{turn}-d1"),"sequence":4,"durable":true}}),
        ]
    }

    #[test]
    fn git_dossier_uses_turn_files_not_unrelated_worktree_names() {
        let events = sample_events("thread-a", "turn-1");
        let input = build_review_input("thread-a", "turn-1", REVIEW_MODE_GIT, &events);
        let files: Vec<_> = input
            .evidence
            .iter()
            .filter(|item| item.kind == "artifact")
            .map(|item| item.summary.as_str())
            .collect();
        assert_eq!(files, vec!["turn.py"]);
        assert!(!files.iter().any(|path| *path == "preexisting.py"));
        assert_eq!(input.diff_scope, "turn");
        assert_eq!(input.required_checks[0].id, "git-turn-diff");
    }

    #[test]
    fn zero_required_checks_cannot_pass() {
        let input = build_review_input(
            "thread-a",
            "turn-1",
            REVIEW_MODE_CLAIMS,
            &sample_events("thread-a", "turn-1"),
        );
        assert!(input.required_checks.is_empty());
        let decision = decide_review(
            &input,
            r#"{"checks":[{"id":"easy","claim":"ok","outcome":"passed","evidenceIds":["prompt"]}]}"#,
        );
        assert_eq!(decision.outcome, "inconclusive");
        assert_ne!(decision.outcome, "passed");
    }

    #[test]
    fn unknown_evidence_never_passes() {
        let input = build_review_input(
            "thread-a",
            "turn-1",
            REVIEW_MODE_GIT,
            &sample_events("thread-a", "turn-1"),
        );
        let decision = decide_review(
            &input,
            r#"{"checks":[{"id":"git-turn-diff","claim":"x","outcome":"passed","evidenceIds":["missing"]}]}"#,
        );
        assert_ne!(decision.outcome, "passed");
        assert!(decision
            .limitations
            .iter()
            .any(|item| item == "unknown-evidence"));
    }

    #[test]
    fn omitted_required_check_never_passes() {
        let input = build_review_input(
            "thread-a",
            "turn-1",
            REVIEW_MODE_GIT,
            &sample_events("thread-a", "turn-1"),
        );
        let decision = decide_review(
            &input,
            r#"{"checks":[{"id":"other","claim":"x","outcome":"passed","evidenceIds":["git-diff"]}]}"#,
        );
        assert_ne!(decision.outcome, "passed");
        assert!(decision
            .limitations
            .iter()
            .any(|item| item == "omitted-required-check"));
    }

    #[test]
    fn duplicate_check_id_never_passes() {
        let input = build_review_input(
            "thread-a",
            "turn-1",
            REVIEW_MODE_GIT,
            &sample_events("thread-a", "turn-1"),
        );
        let decision = decide_review(
            &input,
            r#"{"checks":[
                {"id":"git-turn-diff","claim":"x","outcome":"passed","evidenceIds":["git-diff"]},
                {"id":"git-turn-diff","claim":"y","outcome":"passed","evidenceIds":["git-diff"]}
            ]}"#,
        );
        assert_ne!(decision.outcome, "passed");
        assert!(decision
            .limitations
            .iter()
            .any(|item| item == "duplicate-check-id"));
    }

    #[test]
    fn claimed_complete_coverage_with_missing_evidence_never_passes() {
        let mut events = sample_events("thread-a", "turn-1");
        events[2] = json!({"kind":"edit","files":[{"path":"turn.py"}],"meta":{"threadId":"thread-a","turnId":"turn-1","eventId":"e1","durable":true}});
        let input = build_review_input("thread-a", "turn-1", REVIEW_MODE_GIT, &events);
        assert!(input.missing.iter().any(|item| item == "git-diff"));
        let decision = decide_review(
            &input,
            r#"{"checks":[{"id":"git-turn-diff","claim":"x","outcome":"passed","evidenceIds":[]}],"limitations":[]}"#,
        );
        assert_ne!(decision.outcome, "passed");
        assert_ne!(decision.coverage, "complete");
    }

    #[test]
    fn failed_check_wins() {
        let input = build_review_input(
            "thread-a",
            "turn-1",
            REVIEW_MODE_GIT,
            &sample_events("thread-a", "turn-1"),
        );
        let decision = decide_review(
            &input,
            r#"{"checks":[{"id":"git-turn-diff","claim":"bug","outcome":"failed","evidenceIds":["git-diff"]}]}"#,
        );
        assert_eq!(decision.outcome, "failed");
    }

    #[test]
    fn queued_projection_is_running_not_a_verdict() {
        let record = ReviewRecord {
            schema_version: 1,
            review_id: "11111111-1111-1111-1111-111111111111".into(),
            thread_id: "t".into(),
            turn_id: "turn".into(),
            input_hash: "a".repeat(64),
            config_hash: "b".repeat(64),
            dedup_key: "c".repeat(64),
            client_request_id: None,
            mode: "claims".into(),
            trigger: "manual".into(),
            config: ReviewConfig {
                provider: "codex".into(),
                model: "gpt-5.5".into(),
                effort: "high".into(),
            },
            policy: ReviewPolicy {
                enabled: false,
                trigger: "manual".into(),
                autofix: false,
                max_corrections: 1,
            },
            status: "queued".into(),
            outcome: None,
            coverage: "partial".into(),
            checks: vec![],
            limitations: vec![],
            attempt: 1,
            created_at: now_iso(),
            updated_at: now_iso(),
            error: None,
            extra: Map::new(),
        };
        let msg = project_review_result(&record, None);
        assert_eq!(msg["status"], "running");
        assert_eq!(msg["executionStatus"], "queued");
        assert!(msg["verdict"].is_null());
    }

    fn test_state() -> AppState {
        let dir = tempdir().unwrap().keep();
        AppState::new(
            AppPaths::from_app_dir(dir),
            None,
            "t".into(),
            "0.1.0".into(),
            "hash".into(),
            "/tmp".into(),
        )
    }

    async fn seed_thread(state: &AppState, thread_id: &str, project: &str, turn: &str) {
        state
            .threads()
            .lock()
            .await
            .upsert(
                json!({"id": thread_id, "projectRoot": project, "provider": "codex"}),
                true,
            )
            .unwrap();
        for event in sample_events(thread_id, turn) {
            state
                .journal()
                .try_append(&event)
                .unwrap_or_else(|error| panic!("{error}: {event}"));
        }
        let seeded = state.journal().materialize(thread_id);
        assert!(
            last_finished_turn_id(&seeded).is_some(),
            "seeded journal empty or without done: {seeded:?}"
        );
    }

    #[tokio::test]
    async fn request_review_without_structured_capability_is_unsupported() {
        let state = test_state().with_test_provider("codex");
        seed_thread(&state, "thread-a", "/proj-a", "turn-1").await;
        let replies = handle_request_review(
            &state,
            &json!({
                "type": "requestReview",
                "requestId": "req-1",
                "threadId": "thread-a",
                "mode": "git",
                "autoReview": {"provider":"codex","model":"gpt-5.5","effort":"high","trigger":"always"}
            }),
        )
        .await;
        assert_eq!(
            replies.len(),
            1,
            "{}",
            replies.get(0).cloned().unwrap_or_default()
        );
        let first: Value = serde_json::from_str(&replies[0]).unwrap();
        assert_eq!(first["status"], "running", "{first}");
        assert_eq!(first["mode"], "git");
        tokio::time::sleep(Duration::from_millis(50)).await;
        let listed = state.reviews().list_thread("thread-a", None, 20).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].status, "error");
        assert_eq!(listed[0].error.as_ref().unwrap().code, "REVIEW_UNSUPPORTED");
        assert_eq!(listed[0].config.model, "gpt-5.5");
        assert_eq!(listed[0].config.effort, "high");
    }

    #[tokio::test]
    async fn isolated_review_uses_configured_model_and_does_not_call_native_review() {
        let json_body = r#"{"checks":[{"id":"git-turn-diff","claim":"diff du tour","outcome":"passed","evidenceIds":["git-diff"]}]}"#;
        let state = test_state().with_test_review_provider("codex", json_body);
        seed_thread(&state, "thread-a", "/proj-a", "turn-1").await;
        handle_request_review(
            &state,
            &json!({
                "requestId": "req-ok",
                "threadId": "thread-a",
                "mode": "git",
                "autoReview": {"provider":"codex","model":"gpt-5.6-sol","effort":"low","trigger":"files-changed"}
            }),
        )
        .await;
        tokio::time::sleep(Duration::from_millis(80)).await;
        let listed = state.reviews().list_thread("thread-a", None, 20).unwrap();
        assert_eq!(listed[0].config.model, "gpt-5.6-sol");
        assert_eq!(listed[0].config.effort, "low");
        assert_eq!(listed[0].outcome.as_deref(), Some("passed"));
        assert_eq!(listed[0].status, "completed");
    }

    #[tokio::test]
    async fn review_truncation_cannot_persist_a_positive_verdict() {
        let state = test_state().with_test_review_provider(
            "codex",
            r#"{"checks":[{"id":"git-turn-diff","outcome":"passed","evidenceIds":["git-diff"]}]}"#,
        );
        state
            .threads()
            .lock()
            .await
            .upsert(
                json!({"id":"large-review", "projectRoot":"/tmp", "provider":"codex"}),
                true,
            )
            .unwrap();
        let mut events = sample_events("large-review", "turn-large");
        events[2]["files"][0]["unified"] = json!("x".repeat(MAX_DOSSIER_BYTES + 1));
        for event in events {
            state.journal().try_append(&event).unwrap();
        }
        let replies = handle_request_review(
            &state,
            &json!({
                "threadId":"large-review", "requestId":"large-request", "mode":"git",
                "autoReview":{"provider":"codex", "model":"m", "effort":"high"},
            }),
        )
        .await;
        let first: Value = serde_json::from_str(&replies[0]).unwrap();
        let id = first["reviewId"].as_str().unwrap();
        let saved = tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let record = state.reviews().get(id).unwrap();
                if record.status == "completed" || record.status == "error" {
                    break record;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert_eq!(saved.status, "completed");
        assert_eq!(saved.outcome.as_deref(), Some("inconclusive"));
        assert_eq!(saved.coverage, "partial");
        assert!(saved.limitations.contains(&"dossier-transmitted".into()));
        let reopened = atelier_store::ReviewStore::open(state.app_dir().join("reviews"));
        assert_eq!(reopened.get(id).unwrap(), saved);
        let full = reopened.get_input(&saved.input_hash).unwrap();
        assert!(full.diff.unwrap().len() > MAX_DOSSIER_BYTES);
    }

    #[tokio::test]
    async fn review_queued_in_one_thread_does_not_block_another_thread() {
        let limiter = ReviewLimiter::new();
        let _first = limiter.acquire("a").await;
        let next = limiter.clone();
        let queued = tokio::spawn(async move { next.acquire("a").await });
        tokio::task::yield_now().await;
        let other = tokio::time::timeout(Duration::from_millis(200), limiter.acquire("b")).await;
        queued.abort();
        assert!(other.is_ok());
    }

    #[tokio::test]
    async fn retry_keeps_frozen_turn_when_a_newer_turn_exists() {
        let state = test_state().with_test_provider("codex");
        seed_thread(&state, "thread-a", "/proj-a", "turn-1").await;
        handle_request_review(
            &state,
            &json!({"requestId":"same","threadId":"thread-a","mode":"git","autoReview":{"provider":"codex","model":"m","effort":"high"}}),
        )
        .await;
        for event in sample_events("thread-a", "turn-2") {
            state
                .journal()
                .try_append(&event)
                .unwrap_or_else(|error| panic!("{error}: {event}"));
        }
        handle_request_review(
            &state,
            &json!({"requestId":"same","threadId":"thread-a","mode":"git","autoReview":{"provider":"codex","model":"m","effort":"high"}}),
        )
        .await;
        let listed = state.reviews().list_thread("thread-a", None, 20).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].turn_id, "turn-1");
    }

    #[tokio::test]
    async fn other_project_thread_is_refused() {
        let state = test_state();
        seed_thread(&state, "thread-b", "/proj-b", "turn-1").await;
        let replies = handle_request_review(
            &state,
            &json!({
                "threadId": "thread-b",
                "projectRoot": "/proj-a",
                "mode": "claims"
            }),
        )
        .await;
        let msg: Value = serde_json::from_str(&replies[0]).unwrap();
        assert!(msg["message"].as_str().unwrap().contains("autre projet"));
    }

    #[tokio::test]
    async fn get_reviews_is_filtered_and_survives_reload() {
        let json_body = r#"{"checks":[{"id":"git-turn-diff","claim":"x","outcome":"failed","evidenceIds":["git-diff"]}]}"#;
        let state = test_state().with_test_review_provider("codex", json_body);
        seed_thread(&state, "thread-a", "/proj-a", "turn-1").await;
        handle_request_review(
            &state,
            &json!({"requestId":"r1","threadId":"thread-a","mode":"git","autoReview":{"provider":"codex","model":"m","effort":"high"}}),
        )
        .await;
        tokio::time::sleep(Duration::from_millis(80)).await;
        let replies = handle_get_reviews(
            &state,
            &json!({"requestId":"g1","threadId":"thread-a","projectRoot":"/proj-a"}),
        )
        .await;
        let msg: Value = serde_json::from_str(&replies[0]).unwrap();
        assert_eq!(msg["type"], "reviews");
        assert_eq!(msg["reviews"].as_array().unwrap().len(), 1);
        assert_eq!(msg["reviews"][0]["turnId"], "turn-1");
        let reopened = atelier_store::ReviewStore::open(state.app_dir().join("reviews"));
        assert_eq!(reopened.list_thread("thread-a", None, 20).unwrap().len(), 1);
    }

    #[tokio::test]
    async fn review_request_does_not_include_a_source_session() {
        let req = ReviewRequest {
            model: "m".into(),
            effort: "high".into(),
            dossier: "scopeId: git:turn-1".into(),
        };
        let provider = FakeProvider::new("codex");
        assert!(!provider.structured_review());
        assert!(matches!(
            provider.review(req).await,
            Err(ReviewError::Unsupported)
        ));
    }

    #[test]
    fn unknown_trigger_is_rejected() {
        assert!(normalize_trigger(Some("whenever")).is_err());
        assert_eq!(normalize_trigger(Some("turn")).unwrap(), "always");
    }
}
