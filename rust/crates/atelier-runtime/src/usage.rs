//! Rate-limits / usage des CLIs pour le popover Usage (getUsage).
//!
//! Port Rust du sidecar Node (claude.mjs `rateLimitsAsync`, codex.mjs
//! `rateLimits`) étendu à grok (crédits du log unifié) et kimi (tokens du
//! jour). opencode n'expose aucun quota : couvert par le ledger `models`.
//!
//! Toutes les fonctions fichier prennent leurs chemins en paramètre
//! (testabilité — jamais de mutation d'env dans les tests).

use chrono::{DateTime, Local};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------- claude ---

/// Node : utilization > 1.5 ⇒ déjà en %, sinon fraction 0-1.
fn pct(u: f64) -> f64 {
    if u > 1.5 {
        u
    } else {
        u * 100.0
    }
}

/// `resets_at` arrive parfois en epoch s, parfois en ISO 8601 — le front
/// attend des secondes epoch.
fn to_epoch_s(v: Option<&Value>) -> Value {
    match v {
        Some(Value::Number(n)) => json!(n),
        Some(Value::String(s)) => DateTime::parse_from_rfc3339(s)
            .map(|d| json!(d.timestamp()))
            .unwrap_or(Value::Null),
        _ => Value::Null,
    }
}

fn pick_limit(o: Option<&Value>) -> Value {
    match o {
        Some(o) if o.is_object() => json!({
            "used_percent": o.get("utilization").and_then(Value::as_f64).map(pct),
            "resets_at": to_epoch_s(o.get("resets_at").or_else(|| o.get("resetsAt"))),
        }),
        _ => Value::Null,
    }
}

/// Mappe la réponse de `GET /api/oauth/usage` vers `{primary, secondary}`.
pub fn map_claude_oauth(oauth: &Value) -> Option<Value> {
    let five = oauth
        .get("five_hour")
        .or_else(|| oauth.get("fiveHour"))
        .or_else(|| oauth.get("session"));
    let week = oauth
        .get("seven_day")
        .or_else(|| oauth.get("sevenDay"))
        .or_else(|| oauth.get("weekly"))
        .or_else(|| oauth.get("seven_day_sonnet"));
    if five.is_none() && week.is_none() {
        return None;
    }
    Some(json!({"primary": pick_limit(five), "secondary": pick_limit(week)}))
}

fn claude_token_from_file(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&raw)
        .ok()?
        .pointer("/claudeAiOauth/accessToken")?
        .as_str()
        .map(str::to_string)
}

/// Claude Code range son OAuth dans le Keychain macOS quand le fichier
/// `.credentials.json` n'existe pas (cas courant depuis 2025).
fn claude_token_from_keychain() -> Option<String> {
    let out = std::process::Command::new("security")
        .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str::<Value>(raw.trim())
        .ok()?
        .pointer("/claudeAiOauth/accessToken")?
        .as_str()
        .map(str::to_string)
}

/// Cache 60 s — les échecs aussi (`None`), pour ne pas retenter l'appel
/// HTTPS (timeout 8 s) à chaque poll du popover quand le token est mort.
static CLAUDE_CACHE: Mutex<Option<(Instant, Option<Value>)>> = Mutex::new(None);

/// Usage OAuth Anthropic (les vrais %), cache 60 s. `None` si pas de token,
/// token expiré (401), rate-limit (429) ou réseau coupé.
pub async fn claude_usage() -> Option<Value> {
    if let Some((at, v)) = CLAUDE_CACHE.lock().ok()?.clone() {
        if at.elapsed() < Duration::from_secs(60) {
            return v;
        }
    }
    let out = claude_usage_uncached().await;
    if let Ok(mut c) = CLAUDE_CACHE.lock() {
        *c = Some((Instant::now(), out.clone()));
    }
    out
}

async fn claude_usage_uncached() -> Option<Value> {
    let token = tokio::task::spawn_blocking(|| {
        claude_token_from_file(&home().join(".claude/.credentials.json"))
            .or_else(claude_token_from_keychain)
    })
    .await
    .ok()??;
    let resp = reqwest::Client::new()
        .get("https://api.anthropic.com/api/oauth/usage")
        .bearer_auth(token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let oauth: Value = resp.json().await.ok()?;
    let data = map_claude_oauth(&oauth)?;
    Some(json!({"ts": now_ms(), "data": data}))
}

// ----------------------------------------------------------------- codex ---

fn all_jsonl(dir: &Path, depth: u8, out: &mut Vec<(PathBuf, u64)>) {
    if depth > 4 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(meta) = e.metadata() else { continue };
        if meta.is_dir() {
            all_jsonl(&p, depth + 1, out);
        } else if p.extension().is_some_and(|x| x == "jsonl") {
            let mt = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            out.push((p, mt));
        }
    }
}

/// Complète `resets_at` (epoch s) depuis `resets_in_seconds` quand absent.
fn codex_fill_resets(limit: &mut Value, ref_s: u64) {
    let Some(o) = limit.as_object_mut() else { return };
    if !o.contains_key("resets_at") {
        if let Some(s) = o.get("resets_in_seconds").and_then(Value::as_u64) {
            o.insert("resets_at".into(), json!(ref_s + s));
        }
    }
}

/// Rate limits OpenAI des rollouts récents (`~/.codex/sessions`).
///
/// Un rollout fraîchement démarré porte souvent un `rate_limits` aux
/// `primary`/`secondary` nuls — on remonte alors aux fichiers précédents
/// (10 max, du plus récent au plus vieux) jusqu'à trouver de vraies limites.
pub fn codex_rate_limits(base: &Path) -> Option<Value> {
    let mut files = Vec::new();
    all_jsonl(base, 0, &mut files);
    files.sort_by(|a, b| b.1.cmp(&a.1));
    for (path, mtime_ms) in files.into_iter().take(10) {
        let Ok(raw) = fs::read_to_string(&path) else { continue };
        for line in raw.lines().rev() {
            let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
            let Some(pl) = v.get("payload") else { continue };
            if pl.get("type").and_then(Value::as_str) != Some("token_count") {
                continue;
            }
            let Some(rl) = pl.get("rate_limits") else { continue };
            if !rl.get("primary").is_some_and(Value::is_object)
                && !rl.get("secondary").is_some_and(Value::is_object)
            {
                continue;
            }
            let mut data = rl.clone();
            if let Some(o) = data.as_object_mut() {
                for k in ["primary", "secondary"] {
                    if let Some(l) = o.get_mut(k) {
                        codex_fill_resets(l, mtime_ms / 1000);
                    }
                }
            }
            return Some(json!({"ts": mtime_ms, "data": data}));
        }
    }
    None
}

// ------------------------------------------------------------------ grok ---

/// Crédits grok depuis `~/.grok/logs/unified.jsonl` — dernière ligne
/// `billing: fetched credits config`, écrite à chaque démarrage du TUI grok
/// (d'où `stale_s` pour afficher la fraîcheur).
pub fn grok_credits(log_path: &Path, now_epoch_s: u64) -> Option<Value> {
    let raw = fs::read_to_string(log_path).ok()?;
    for line in raw.lines().rev() {
        if !line.contains("billing: fetched credits config") {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
        let cfg = v.pointer("/ctx/config")?;
        let used = cfg.get("creditUsagePercent").and_then(Value::as_f64)?;
        let resets_at = cfg
            .pointer("/currentPeriod/end")
            .and_then(Value::as_str)
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.timestamp());
        let line_ts = v
            .get("ts")
            .and_then(Value::as_str)
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.timestamp())
            .unwrap_or(0);
        return Some(json!({
            "ts": (line_ts.max(0) as u64) * 1000,
            "stale_s": now_epoch_s.saturating_sub(line_ts.max(0) as u64),
            "label": v.pointer("/ctx/subscriptionTier").and_then(Value::as_str),
            "data": {
                "primary": {"used_percent": used, "resets_at": resets_at, "window_minutes": 10080},
                "secondary": Value::Null,
            },
        }));
    }
    None
}

// ------------------------------------------------------------------ kimi ---

/// Tokens kimi du jour, sommés depuis les `usage.record` des `wire.jsonl`
/// (kimi n'expose aucun quota — cf. mémoire kimi ACP : jamais d'usage dans
/// la réponse `session/prompt`). `None` si `~/.kimi-code/sessions` absent.
pub fn kimi_today(base: &Path, midnight_ms: u64) -> Option<Value> {
    if !base.is_dir() {
        return None;
    }
    let (mut input, mut output, mut turns) = (0u64, 0u64, 0u64);
    for wd in fs::read_dir(base).ok()? {
        let Ok(wd) = wd else { continue };
        let Ok(sessions) = fs::read_dir(wd.path()) else { continue };
        for s in sessions.flatten() {
            let wire = s.path().join("agents/main/wire.jsonl");
            let fresh = fs::metadata(&wire)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .is_some_and(|d| d.as_millis() as u64 >= midnight_ms);
            if !fresh {
                continue;
            }
            let Ok(raw) = fs::read_to_string(&wire) else { continue };
            for line in raw.lines() {
                let Ok(v) = serde_json::from_str::<Value>(line) else { continue };
                if v.get("type").and_then(Value::as_str) != Some("usage.record")
                    || v.get("usageScope").and_then(Value::as_str) != Some("turn")
                    || v.get("time").and_then(Value::as_u64).unwrap_or(0) < midnight_ms
                {
                    continue;
                }
                let Some(u) = v.get("usage") else { continue };
                let g = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
                input += g("inputOther") + g("inputCacheRead") + g("inputCacheCreation");
                output += g("output");
                turns += 1;
            }
        }
    }
    Some(json!({"input": input, "output": output, "turns": turns}))
}

/// Minuit local du jour courant, en ms epoch.
pub fn local_midnight_ms() -> u64 {
    let midnight = Local::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .and_then(|n| n.and_local_timezone(Local).single());
    midnight.map(|d| d.timestamp_millis().max(0) as u64).unwrap_or(0)
}

// --------------------------------------------------------------- collect ---

/// Agrège les 5 providers pour le message `{type:"usage"}`.
pub async fn collect_providers() -> Value {
    let h = home();
    let now_s = now_ms() / 1000;
    let midnight = local_midnight_ms();
    let (claude, rest) = tokio::join!(
        claude_usage(),
        tokio::task::spawn_blocking(move || {
            (
                codex_rate_limits(&h.join(".codex/sessions")),
                grok_credits(&h.join(".grok/logs/unified.jsonl"), now_s),
                kimi_today(&h.join(".kimi-code/sessions"), midnight),
            )
        })
    );
    let (codex, grok, kimi) = rest.unwrap_or((None, None, None));
    let wrap_limits = |v: Option<Value>| match v {
        Some(mut v) => {
            if let Some(o) = v.as_object_mut() {
                o.insert("kind".into(), json!("limits"));
                // fraîcheur : âge de la donnée (ex. rollout codex ancien)
                if !o.contains_key("stale_s") {
                    if let Some(ts) = o.get("ts").and_then(Value::as_u64) {
                        o.insert("stale_s".into(), json!(now_s.saturating_sub(ts / 1000)));
                    }
                }
            }
            v
        }
        None => Value::Null,
    };
    json!({
        "claude": wrap_limits(claude),
        "codex": wrap_limits(codex),
        "grok": wrap_limits(grok),
        "kimi": match kimi {
            Some(d) => json!({"kind": "tokens", "ts": now_ms(), "data": d}),
            None => Value::Null,
        },
        "opencode": json!({"kind": "ledger"}),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn map_claude_oauth_five_and_week() {
        let oauth = json!({
            "five_hour": {"utilization": 0.42, "resets_at": 1766400000},
            "seven_day": {"utilization": 87.0, "resets_at": 1766900000},
        });
        let d = map_claude_oauth(&oauth).unwrap();
        assert_eq!(d.pointer("/primary/used_percent").unwrap().as_f64().unwrap(), 42.0);
        assert_eq!(d.pointer("/secondary/used_percent").unwrap().as_f64().unwrap(), 87.0);
        assert_eq!(d.pointer("/primary/resets_at").unwrap().as_i64().unwrap(), 1766400000);
    }

    #[test]
    fn map_claude_oauth_iso_resets_at() {
        let oauth = json!({
            "five_hour": {"utilization": 6.0, "resets_at": "2026-08-22T20:19:59.680364+00:00"},
        });
        let d = map_claude_oauth(&oauth).unwrap();
        let ts = d.pointer("/primary/resets_at").unwrap().as_i64().unwrap();
        assert!(ts > 1_700_000_000, "resets_at epoch attendu, reçu {ts}");
    }

    #[test]
    fn codex_falls_back_to_older_file_when_limits_null() {
        let tmp = tempfile::tempdir().unwrap();
        let day = tmp.path().join("2026/08/22");
        fs::create_dir_all(&day).unwrap();
        fs::write(
            day.join("old.jsonl"),
            concat!(
                r#"{"payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":33.0,"resets_in_seconds":10},"secondary":{"used_percent":7.0}}}}"#,
                "\n",
            ),
        )
        .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(
            day.join("new.jsonl"),
            concat!(
                r#"{"payload":{"type":"token_count","rate_limits":{"primary":null,"secondary":null,"credits":null}}}"#,
                "\n",
            ),
        )
        .unwrap();
        let out = codex_rate_limits(tmp.path()).unwrap();
        assert_eq!(out.pointer("/data/primary/used_percent").unwrap().as_f64().unwrap(), 33.0);
    }

    #[test]
    fn map_claude_oauth_empty_is_none() {
        assert!(map_claude_oauth(&json!({"other": 1})).is_none());
    }

    #[test]
    fn codex_takes_last_token_count_of_newest_file() {
        let tmp = tempfile::tempdir().unwrap();
        let day = tmp.path().join("2026/08/22");
        fs::create_dir_all(&day).unwrap();
        fs::write(
            day.join("rollout.jsonl"),
            concat!(
                r#"{"payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":10.0,"resets_in_seconds":100}}}}"#,
                "\n",
                r#"{"payload":{"type":"other"}}"#,
                "\n",
                r#"{"payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":55.5,"resets_in_seconds":60},"secondary":{"used_percent":12.0}}}}"#,
                "\n",
            ),
        )
        .unwrap();
        let out = codex_rate_limits(tmp.path()).unwrap();
        assert_eq!(out.pointer("/data/primary/used_percent").unwrap().as_f64().unwrap(), 55.5);
        assert_eq!(out.pointer("/data/secondary/used_percent").unwrap().as_f64().unwrap(), 12.0);
        // resets_at complété depuis resets_in_seconds
        assert!(out.pointer("/data/primary/resets_at").unwrap().as_u64().unwrap() > 0);
    }

    #[test]
    fn codex_none_when_empty() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(codex_rate_limits(tmp.path()).is_none());
    }

    #[test]
    fn grok_takes_last_billing_line() {
        let tmp = tempfile::tempdir().unwrap();
        let log = tmp.path().join("unified.jsonl");
        fs::write(&log, concat!(
            r#"{"ts":"2026-08-14T10:00:00.000Z","msg":"billing: fetched credits config","ctx":{"config":{"creditUsagePercent":27.0,"currentPeriod":{"end":"2026-08-16T00:00:00+00:00"}},"subscriptionTier":"SuperGrok"}}"#,
            "\n",
            r#"{"ts":"2026-08-22T01:43:40.989Z","msg":"noise"}"#,
            "\n",
            r#"{"ts":"2026-08-22T01:43:40.989Z","msg":"billing: fetched credits config","ctx":{"config":{"creditUsagePercent":8.0,"currentPeriod":{"end":"2026-08-23T00:34:14.857398+00:00"}},"subscriptionTier":"SuperGrok"}}"#,
            "\n",
        )).unwrap();
        let line_s = DateTime::parse_from_rfc3339("2026-08-22T01:43:40.989Z")
            .unwrap()
            .timestamp() as u64;
        let out = grok_credits(&log, line_s + 7200).unwrap();
        assert_eq!(out.pointer("/data/primary/used_percent").unwrap().as_f64().unwrap(), 8.0);
        assert_eq!(out.get("label").unwrap().as_str().unwrap(), "SuperGrok");
        assert_eq!(out.get("stale_s").unwrap().as_u64().unwrap(), 7200);
        assert!(out.pointer("/data/primary/resets_at").unwrap().as_i64().unwrap() > 0);
    }

    #[test]
    fn grok_none_without_billing() {
        let tmp = tempfile::tempdir().unwrap();
        let log = tmp.path().join("unified.jsonl");
        fs::write(&log, "{\"msg\":\"boot\"}\n").unwrap();
        assert!(grok_credits(&log, 0).is_none());
    }

    #[test]
    fn kimi_sums_only_today() {
        let tmp = tempfile::tempdir().unwrap();
        let main = tmp.path().join("wd_x/session_a/agents/main");
        fs::create_dir_all(&main).unwrap();
        let midnight: u64 = 1_000_000;
        fs::write(
            main.join("wire.jsonl"),
            concat!(
                r#"{"type":"usage.record","usage":{"inputOther":100,"output":5,"inputCacheRead":50,"inputCacheCreation":0},"usageScope":"turn","time":999999}"#,
                "\n",
                r#"{"type":"usage.record","usage":{"inputOther":200,"output":10,"inputCacheRead":100,"inputCacheCreation":25},"usageScope":"turn","time":1000001}"#,
                "\n",
                r#"{"type":"context.append_loop_event","event":{}}"#,
                "\n",
            ),
        )
        .unwrap();
        let out = kimi_today(tmp.path(), midnight).unwrap();
        assert_eq!(out.get("input").unwrap().as_u64().unwrap(), 325);
        assert_eq!(out.get("output").unwrap().as_u64().unwrap(), 10);
        assert_eq!(out.get("turns").unwrap().as_u64().unwrap(), 1);
    }

    #[test]
    fn kimi_none_without_dir() {
        assert!(kimi_today(Path::new("/nonexistent-kimi"), 0).is_none());
    }
}
