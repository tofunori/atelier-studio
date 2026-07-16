//! Local scheduled tasks. Heartbeats resume one existing task; cron runs create tasks.

use crate::state::AppState;
use atelier_store::{Automation, AutomationRun};
use chrono::{Datelike, Local, NaiveDate, TimeZone, Weekday};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::task::JoinHandle;
use uuid::Uuid;

const MAX_RUNS_PER_TICK: usize = 3;

pub fn spawn_scheduler(state: AppState) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        interval.tick().await;
        loop {
            interval.tick().await;
            run_due_once(&state).await;
        }
    })
}

pub async fn run_due_once(state: &AppState) {
    let due = state
        .automations()
        .lock()
        .await
        .due(now_ms(), MAX_RUNS_PER_TICK);
    for item in due {
        if let Err(error) = execute(state, &item.id, true).await {
            tracing::warn!(automation_id = %item.id, %error, "automation skipped");
        }
    }
}

pub async fn list(state: &AppState) -> Vec<String> {
    automations_reply(state).await
}

pub async fn create(state: &AppState, msg: &Value) -> Vec<String> {
    let source = msg.get("automation").unwrap_or(msg);
    match create_item(state, source).await {
        Ok(_) => automations_reply(state).await,
        Err(error) => vec![error_reply(error)],
    }
}

pub async fn update(state: &AppState, msg: &Value) -> Vec<String> {
    let source = msg.get("automation").unwrap_or(msg);
    match update_item(state, source).await {
        Ok(_) => automations_reply(state).await,
        Err(error) => vec![error_reply(error)],
    }
}

pub async fn delete(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() {
        return vec![error_reply("id d’automatisation requis")];
    }
    match state.automations().lock().await.delete(id) {
        Ok(_) => automations_reply(state).await,
        Err(error) => vec![error_reply(error)],
    }
}

pub async fn run_now(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(Value::as_str).unwrap_or("");
    match execute(state, id, false).await {
        Ok(thread_id) => {
            let mut replies = vec![json!({
                "type": "automationRunStarted",
                "id": id,
                "threadId": thread_id,
            })
            .to_string()];
            replies.extend(automations_reply(state).await);
            replies
        }
        Err(error) => vec![error_reply(error)],
    }
}

pub async fn record_thread_event(state: &AppState, thread_id: &str, event: &Value) {
    let kind = event.get("kind").and_then(Value::as_str).unwrap_or("");
    if !matches!(kind, "done" | "error") {
        return;
    }
    let Some((automation_id, run_id)) = state.automation_runs().lock().await.remove(thread_id)
    else {
        return;
    };
    let mut store = state.automations().lock().await;
    let Some(mut item) = store.get(&automation_id).cloned() else {
        return;
    };
    if let Some(run) = item.runs.iter_mut().find(|run| run.id == run_id) {
        run.status = if kind == "done" && event.get("ok").and_then(Value::as_bool) != Some(false) {
            "COMPLETED".into()
        } else {
            "FAILED".into()
        };
        run.completed_at = Some(now_ms());
        run.error = if kind == "error" {
            event
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        };
        item.last_error = run.error.clone();
        item.updated_at = now_ms();
        let _ = store.upsert(item);
    }
    drop(store);
    publish_automations(state).await;
}

async fn create_item(state: &AppState, source: &Value) -> Result<Automation, String> {
    let now = now_ms();
    let name = required_string(source, "name")?;
    let prompt = required_string(source, "prompt")?;
    let rrule = required_string(source, "rrule")?;
    validate_rrule(&rrule)?;
    let status = string_or(source, "status", "ACTIVE");
    let kind = string_or(source, "kind", "heartbeat");
    validate_status_kind(&status, &kind)?;
    let target = optional_string(source, "targetThreadId");
    validate_target(state, &kind, &status, target.as_deref(), None).await?;
    let mut store = state.automations().lock().await;
    let base = slug(&name);
    let mut id = base.clone();
    while store.get(&id).is_some() {
        id = format!("{}-{}", base, &Uuid::new_v4().simple().to_string()[..6]);
    }
    let item = Automation {
        id,
        name,
        prompt,
        status: status.clone(),
        kind,
        rrule: rrule.clone(),
        target_thread_id: target,
        project_root: string_or(source, "projectRoot", ""),
        provider: string_or(source, "provider", "codex"),
        model: optional_string(source, "model"),
        effort: optional_string(source, "effort"),
        permission_mode: optional_string(source, "permissionMode"),
        next_run_at: active_next(&status, &rrule, now)?,
        last_run_at: None,
        last_error: None,
        runs: Vec::new(),
        created_at: now,
        updated_at: now,
    };
    store.upsert(item)
}

async fn update_item(state: &AppState, source: &Value) -> Result<Automation, String> {
    let id = required_string(source, "id")?;
    let previous = state
        .automations()
        .lock()
        .await
        .get(&id)
        .cloned()
        .ok_or_else(|| "automatisation introuvable".to_string())?;
    let status = string_or(source, "status", &previous.status);
    let kind = string_or(source, "kind", &previous.kind);
    let rrule = string_or(source, "rrule", &previous.rrule);
    validate_status_kind(&status, &kind)?;
    validate_rrule(&rrule)?;
    let target = if source.get("targetThreadId").is_some() {
        optional_string(source, "targetThreadId")
    } else {
        previous.target_thread_id.clone()
    };
    validate_target(state, &kind, &status, target.as_deref(), Some(&id)).await?;
    let now = now_ms();
    let schedule_changed = rrule != previous.rrule || status != previous.status;
    let item = Automation {
        id,
        name: string_or(source, "name", &previous.name),
        prompt: string_or(source, "prompt", &previous.prompt),
        status: status.clone(),
        kind,
        rrule: rrule.clone(),
        target_thread_id: target,
        project_root: string_or(source, "projectRoot", &previous.project_root),
        provider: string_or(source, "provider", &previous.provider),
        model: optional_or(source, "model", previous.model),
        effort: optional_or(source, "effort", previous.effort),
        permission_mode: optional_or(source, "permissionMode", previous.permission_mode),
        next_run_at: if status == "ACTIVE" {
            if schedule_changed || previous.next_run_at.is_none() {
                Some(next_run_at(&rrule, now)?)
            } else {
                previous.next_run_at
            }
        } else {
            None
        },
        last_run_at: previous.last_run_at,
        last_error: previous.last_error,
        runs: previous.runs,
        created_at: previous.created_at,
        updated_at: now,
    };
    state.automations().lock().await.upsert(item)
}

async fn validate_target(
    state: &AppState,
    kind: &str,
    status: &str,
    target: Option<&str>,
    except_id: Option<&str>,
) -> Result<(), String> {
    if kind != "heartbeat" {
        return Ok(());
    }
    let target = target
        .filter(|id| !id.is_empty())
        .ok_or_else(|| "chat cible requis".to_string())?;
    if state.threads().lock().await.get(target).is_none() {
        return Err("chat cible introuvable".into());
    }
    if status == "ACTIVE"
        && state
            .automations()
            .lock()
            .await
            .active_heartbeat_for_thread(target, except_id)
    {
        return Err("ce chat possède déjà un heartbeat actif".into());
    }
    Ok(())
}

async fn execute(state: &AppState, id: &str, scheduled: bool) -> Result<String, String> {
    let item = state
        .automations()
        .lock()
        .await
        .get(id)
        .cloned()
        .ok_or_else(|| "automatisation introuvable".to_string())?;
    if scheduled && item.status != "ACTIVE" {
        return Err("automatisation en pause".into());
    }
    let (thread_id, provider, project_root, model, effort, permission_mode) =
        if item.kind == "heartbeat" {
            let target = item
                .target_thread_id
                .as_deref()
                .ok_or_else(|| "chat cible manquant".to_string())?;
            let thread = state
                .threads()
                .lock()
                .await
                .get(target)
                .cloned()
                .ok_or_else(|| "chat cible introuvable".to_string())?;
            if state.harness().is_running(target).await || thread.status == "running" {
                if scheduled {
                    postpone_busy(state, &item).await?;
                }
                return Err("chat cible occupé; nouvel essai dans une minute".into());
            }
            let last = thread
                .extra
                .get("lastTurn")
                .cloned()
                .unwrap_or_else(|| json!({}));
            (
                target.to_string(),
                thread.provider,
                thread.project_root,
                last.get("model")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                last.get("effort")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                last.get("permissionMode")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            )
        } else {
            (
                format!("automation-{}", Uuid::new_v4()),
                item.provider.clone(),
                item.project_root.clone(),
                item.model.clone(),
                item.effort.clone(),
                item.permission_mode.clone(),
            )
        };

    let now = now_ms();
    let run_id = Uuid::new_v4().to_string();
    let run = AutomationRun {
        id: run_id.clone(),
        status: "IN_PROGRESS".into(),
        thread_id: thread_id.clone(),
        created_at: now,
        completed_at: None,
        error: None,
    };
    let mut updated = item.clone();
    updated.runs.insert(0, run);
    updated.last_run_at = Some(now);
    updated.last_error = None;
    updated.updated_at = now;
    updated.next_run_at = active_next(&updated.status, &updated.rrule, now)?;
    state.automations().lock().await.upsert(updated)?;
    state
        .automation_runs()
        .lock()
        .await
        .insert(thread_id.clone(), (item.id.clone(), run_id.clone()));

    let prompt = if item.kind == "heartbeat" {
        format!(
            "<heartbeat>\n  <automation_id>{}</automation_id>\n  <current_time_ms>{}</current_time_ms>\n  <instructions>{}</instructions>\n</heartbeat>",
            item.id, now, item.prompt
        )
    } else {
        item.prompt.clone()
    };
    let mut send = json!({
        "type":"send",
        "threadId":thread_id,
        "provider":provider,
        "projectRoot":project_root,
        "prompt":prompt,
        "title":item.name,
        "clientMessageId":Uuid::new_v4().to_string(),
        "displayEvent":{"kind":"user","text":item.prompt,"label":"Automatisation"}
    });
    if let Some(value) = model {
        send["model"] = json!(value);
    }
    if let Some(value) = effort {
        send["effort"] = json!(value);
    }
    if let Some(value) = permission_mode {
        send["permissionMode"] = json!(value);
    }

    let replies = crate::send::handle_send(state, &send).await;
    let immediate_error = replies.iter().find_map(|reply| {
        serde_json::from_str::<Value>(reply)
            .ok()
            .filter(|value| value.get("type").and_then(Value::as_str) == Some("error"))
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
    });
    for reply in replies {
        state.publish(reply);
    }
    if let Some(error) = immediate_error {
        fail_run(state, &item.id, &run_id, &thread_id, &error).await;
        return Err(error);
    }
    publish_automations(state).await;
    Ok(thread_id)
}

async fn fail_run(
    state: &AppState,
    automation_id: &str,
    run_id: &str,
    thread_id: &str,
    error: &str,
) {
    state.automation_runs().lock().await.remove(thread_id);
    let mut store = state.automations().lock().await;
    if let Some(mut item) = store.get(automation_id).cloned() {
        if let Some(run) = item.runs.iter_mut().find(|run| run.id == run_id) {
            run.status = "FAILED".into();
            run.completed_at = Some(now_ms());
            run.error = Some(error.to_string());
        }
        item.last_error = Some(error.to_string());
        item.updated_at = now_ms();
        let _ = store.upsert(item);
    }
    drop(store);
    publish_automations(state).await;
}

async fn postpone_busy(state: &AppState, item: &Automation) -> Result<(), String> {
    let mut updated = item.clone();
    updated.next_run_at = Some(now_ms() + 60_000);
    updated.last_error = Some("Chat occupé; nouvel essai dans une minute".into());
    updated.updated_at = now_ms();
    state.automations().lock().await.upsert(updated)?;
    publish_automations(state).await;
    Ok(())
}

async fn automations_reply(state: &AppState) -> Vec<String> {
    let items = state.automations().lock().await.list();
    vec![json!({"type":"automations","automations":items}).to_string()]
}

async fn publish_automations(state: &AppState) {
    if let Some(message) = automations_reply(state).await.into_iter().next() {
        state.publish(message);
    }
}

fn active_next(status: &str, rrule: &str, after: i64) -> Result<Option<i64>, String> {
    if status == "ACTIVE" {
        Ok(Some(next_run_at(rrule, after)?))
    } else {
        Ok(None)
    }
}

fn error_reply(message: impl Into<String>) -> String {
    json!({"type":"error","message":message.into()}).to_string()
}

fn required_string(value: &Value, field: &str) -> Result<String, String> {
    optional_string(value, field).ok_or_else(|| format!("{field} requis"))
}

fn string_or(value: &Value, field: &str, fallback: &str) -> String {
    optional_string(value, field).unwrap_or_else(|| fallback.to_string())
}

fn optional_string(value: &Value, field: &str) -> Option<String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn optional_or(value: &Value, field: &str, previous: Option<String>) -> Option<String> {
    if value.get(field).is_some() {
        optional_string(value, field)
    } else {
        previous
    }
}

fn validate_status_kind(status: &str, kind: &str) -> Result<(), String> {
    if !matches!(status, "ACTIVE" | "PAUSED") {
        return Err("statut invalide".into());
    }
    if !matches!(kind, "cron" | "heartbeat") {
        return Err("destination invalide".into());
    }
    Ok(())
}

fn slug(name: &str) -> String {
    let value = name
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if value.is_empty() {
        format!("automation-{}", &Uuid::new_v4().simple().to_string()[..8])
    } else {
        value
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn parse_rrule(rrule: &str) -> Result<HashMap<String, String>, String> {
    let body = rrule.trim().strip_prefix("RRULE:").unwrap_or(rrule.trim());
    let mut fields = HashMap::new();
    for part in body.split(';') {
        let (key, value) = part
            .split_once('=')
            .ok_or_else(|| "règle RRULE invalide".to_string())?;
        fields.insert(key.trim().to_uppercase(), value.trim().to_uppercase());
    }
    if !fields.contains_key("FREQ") {
        return Err("FREQ requis".into());
    }
    Ok(fields)
}

fn validate_rrule(rrule: &str) -> Result<(), String> {
    let fields = parse_rrule(rrule)?;
    let frequency = fields.get("FREQ").map(String::as_str).unwrap_or("");
    if !matches!(
        frequency,
        "MINUTELY" | "HOURLY" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
    ) {
        return Err("fréquence non prise en charge".into());
    }
    for (field, min, max) in [
        ("INTERVAL", 1, 999),
        ("BYHOUR", 0, 23),
        ("BYMINUTE", 0, 59),
        ("BYMONTHDAY", 1, 31),
        ("BYMONTH", 1, 12),
    ] {
        if let Some(raw) = fields.get(field) {
            raw.parse::<u32>()
                .ok()
                .filter(|value| *value >= min && *value <= max)
                .ok_or_else(|| format!("{field} invalide"))?;
        }
    }
    if fields
        .get("BYDAY")
        .is_some_and(|days| days.split(',').any(|day| parse_weekday(day).is_none()))
    {
        return Err("BYDAY invalide".into());
    }
    Ok(())
}

pub fn next_run_at(rrule: &str, after_ms: i64) -> Result<i64, String> {
    validate_rrule(rrule)?;
    let fields = parse_rrule(rrule)?;
    let frequency = fields.get("FREQ").map(String::as_str).unwrap_or("");
    let interval = number(&fields, "INTERVAL", 1) as i64;
    let minute = number(&fields, "BYMINUTE", 0);
    let after = Local
        .timestamp_millis_opt(after_ms)
        .single()
        .ok_or_else(|| "date invalide".to_string())?;
    if frequency == "MINUTELY" {
        let current = after_ms.div_euclid(60_000);
        return Ok((current + interval - current.rem_euclid(interval)) * 60_000);
    }
    if frequency == "HOURLY" {
        let current_hour = after_ms.div_euclid(3_600_000);
        let mut next_hour = current_hour + 1;
        while next_hour.rem_euclid(interval) != 0 {
            next_hour += 1;
        }
        return Ok(next_hour * 3_600_000 + i64::from(minute) * 60_000);
    }
    let hour = number(&fields, "BYHOUR", 9);
    let month_day = number(&fields, "BYMONTHDAY", after.day());
    let month = number(&fields, "BYMONTH", after.month());
    let days = fields
        .get("BYDAY")
        .map(|value| {
            value
                .split(',')
                .filter_map(parse_weekday)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let start_date = after.date_naive();
    let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
    for offset in 0..=(366 * 6) {
        let Some(date) = start_date.checked_add_days(chrono::Days::new(offset)) else {
            break;
        };
        let Some(candidate) = Local
            .with_ymd_and_hms(date.year(), date.month(), date.day(), hour, minute, 0)
            .earliest()
        else {
            continue;
        };
        if candidate.timestamp_millis() <= after_ms {
            continue;
        }
        let epoch_days = date.signed_duration_since(epoch).num_days();
        let weekday_ok = days.is_empty() || days.contains(&date.weekday());
        let matches = match frequency {
            "DAILY" => epoch_days.rem_euclid(interval) == 0 && weekday_ok,
            "WEEKLY" => {
                epoch_days.div_euclid(7).rem_euclid(interval) == 0
                    && if days.is_empty() {
                        date.weekday() == after.weekday()
                    } else {
                        weekday_ok
                    }
            }
            "MONTHLY" => {
                (i64::from(date.year()) * 12 + i64::from(date.month0())).rem_euclid(interval) == 0
                    && date.day() == month_day
                    && weekday_ok
            }
            "YEARLY" => {
                i64::from(date.year()).rem_euclid(interval) == 0
                    && date.month() == month
                    && date.day() == month_day
                    && weekday_ok
            }
            _ => false,
        };
        if matches {
            return Ok(candidate.timestamp_millis());
        }
    }
    Err("aucune prochaine exécution trouvée".into())
}

fn number(fields: &HashMap<String, String>, key: &str, fallback: u32) -> u32 {
    fields
        .get(key)
        .and_then(|value| value.parse().ok())
        .unwrap_or(fallback)
}

fn parse_weekday(value: &str) -> Option<Weekday> {
    match value {
        "MO" => Some(Weekday::Mon),
        "TU" => Some(Weekday::Tue),
        "WE" => Some(Weekday::Wed),
        "TH" => Some(Weekday::Thu),
        "FR" => Some(Weekday::Fri),
        "SA" => Some(Weekday::Sat),
        "SU" => Some(Weekday::Sun),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_schedules_minute_heartbeat() {
        let after = 1_767_225_600_000_i64;
        let next = next_run_at("FREQ=MINUTELY;INTERVAL=5", after).unwrap();
        assert!(next > after);
        assert_eq!(next.div_euclid(60_000).rem_euclid(5), 0);
        assert!(validate_rrule("FREQ=YEARLY;BYMONTH=13").is_err());
    }
}
