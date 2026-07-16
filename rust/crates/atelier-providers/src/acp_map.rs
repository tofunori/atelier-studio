//! Mapping ACP standard `session/update` → events Atelier (plan 045).
//!
//! Miroir Rust de la logique éprouvée de `sidecar/providers/grok.mjs`
//! (mapSessionUpdate/mapPromptResult/makeTurnEmitter), sans les extensions
//! xAI (`_meta["x.ai/tool"]`) : champs ACP standard uniquement
//! (title/kind/status/content/rawInput). Contrat frontend (src/lib/ws.ts) :
//! `tool_update.output` est une string REQUISE — jamais absente.

use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

/// Métadonnées mémorisées d'un toolCallId — une update de suivi sans
/// title/rawInput ne doit pas dégrader la carte déjà affichée (comportement
/// observé en E2E grok 2026-07-08, cf. rememberToolMeta grok.mjs:382).
#[derive(Default, Clone)]
pub struct ToolMeta {
    pub name: Option<String>,
    pub detail: Option<String>,
    pub input: Option<Value>,
}

/// État mémoire d'un tour.
#[derive(Default)]
pub struct TurnCtx {
    pub tool_meta: HashMap<String, ToolMeta>,
    /// Clés "toolCallId:path:len(newText)" déjà émises en `edit`.
    pub seen_edits: HashSet<String>,
    /// Dernier `usage_update` brut — absorbé, jamais ré-émis (piège journal).
    pub last_usage_update: Option<Value>,
}

fn text_of(update: &Value) -> String {
    update
        .pointer("/content/text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn non_empty(v: Option<&str>) -> Option<&str> {
    v.filter(|s| !s.is_empty())
}

/// Statut d'un tool_call_update — mêmes heuristiques que grok.mjs:346-359 :
/// pas de statut explicite ⇒ la présence d'un contenu signale la fin.
fn tool_status(update: &Value) -> String {
    if let Some(raw) = non_empty(update.get("status").and_then(|v| v.as_str())) {
        let s = raw.to_lowercase();
        if s.contains("fail") || s.contains("error") || s.contains("reject") {
            return "failed".into();
        }
        if s.contains("complet") || s.contains("done") || s.contains("success") {
            return "completed".into();
        }
        if s.contains("progress") || s.contains("pending") {
            return "running".into();
        }
        return s;
    }
    let has_content = update
        .get("content")
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);
    if has_content {
        "completed".into()
    } else {
        "running".into()
    }
}

/// Concatène le contenu d'un tool call en string (diff → "# path\nnewText",
/// texte direct ou imbriqué {type:"content",content:{text}}), grok.mjs:361-374.
fn tool_output(update: &Value) -> String {
    let mut parts: Vec<String> = Vec::new();
    let items = update.get("content").and_then(|v| v.as_array());
    for c in items.into_iter().flatten() {
        match c.get("type").and_then(|v| v.as_str()).unwrap_or("") {
            "diff" => {
                let label = c
                    .get("path")
                    .and_then(|v| v.as_str())
                    .map(|p| format!("# {p}"))
                    .unwrap_or_else(|| "# fichier".into());
                let new_text = c.get("newText").and_then(|v| v.as_str()).unwrap_or("");
                parts.push(format!("{label}\n{new_text}"));
            }
            "text" => {
                if let Some(t) = non_empty(c.get("text").and_then(|v| v.as_str())) {
                    parts.push(t.to_string());
                }
            }
            _ => {
                if let Some(t) = non_empty(c.pointer("/content/text").and_then(|v| v.as_str())) {
                    parts.push(t.to_string());
                }
            }
        }
    }
    parts.join("\n\n")
}

fn remember(ctx: &mut TurnCtx, id: &str, name: &str, detail: Option<&str>, input: &Value) {
    if id.is_empty() {
        return;
    }
    let meta = ctx.tool_meta.entry(id.to_string()).or_default();
    if name != "tool" {
        meta.name = Some(name.to_string());
    }
    if let Some(d) = detail {
        meta.detail = Some(d.to_string());
    }
    if !input.is_null() {
        meta.input = Some(input.clone());
    }
}

/// Construit l'event `tool_update` — `output` TOUJOURS string (contrat front).
fn tool_event(
    id: &str,
    name: &str,
    status: &str,
    detail: Option<&str>,
    output: String,
    input: Value,
) -> Value {
    let mut m = Map::new();
    m.insert("kind".into(), json!("tool_update"));
    m.insert("id".into(), json!(id));
    m.insert("name".into(), json!(name));
    m.insert("status".into(), json!(status));
    if let Some(d) = detail {
        // clé absente quand vide — même forme wire que grok.mjs (detail: undefined)
        m.insert("detail".into(), json!(d));
    }
    m.insert("output".into(), json!(output));
    m.insert("input".into(), input);
    m.insert("source".into(), json!("opencode"));
    Value::Object(m)
}

fn tool_call_event(update: &Value, ctx: &mut TurnCtx) -> Value {
    let id = update
        .get("toolCallId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let title = non_empty(update.get("title").and_then(|v| v.as_str()));
    let kind = non_empty(update.get("kind").and_then(|v| v.as_str()));
    let name = title.or(kind).unwrap_or("tool");
    let detail = kind.filter(|k| *k != name);
    let input = update.get("rawInput").cloned().unwrap_or(Value::Null);
    remember(ctx, id, name, detail, &input);
    tool_event(id, name, "running", detail, String::new(), input)
}

fn tool_call_update_event(update: &Value, ctx: &mut TurnCtx) -> Value {
    let id = update
        .get("toolCallId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let cached = ctx.tool_meta.get(id).cloned().unwrap_or_default();
    let title = non_empty(update.get("title").and_then(|v| v.as_str()));
    let kind = non_empty(update.get("kind").and_then(|v| v.as_str()));
    let name = title
        .map(str::to_string)
        .or(cached.name.clone())
        .or(kind.map(str::to_string))
        .unwrap_or_else(|| "tool".into());
    let detail = kind
        .filter(|k| *k != name)
        .map(str::to_string)
        .or(cached.detail.clone());
    let input = update
        .get("rawInput")
        .cloned()
        .filter(|v| !v.is_null())
        .or(cached.input.clone())
        .unwrap_or(Value::Null);
    let status = tool_status(update);
    remember(ctx, id, &name, detail.as_deref(), &input);
    tool_event(
        id,
        &name,
        &status,
        detail.as_deref(),
        tool_output(update),
        input,
    )
}

/// Events `edit` depuis les contenus diff, dédupliqués par
/// (toolCallId, path, len(newText)) — grok.mjs:427-441. `files` seulement,
/// pas de snippets (piège redaction journal, décision 6 du plan 045).
fn edit_events(update: &Value, ctx: &mut TurnCtx) -> Vec<Value> {
    let id = update
        .get("toolCallId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let mut files: Vec<String> = Vec::new();
    let items = update.get("content").and_then(|v| v.as_array());
    for c in items.into_iter().flatten() {
        if c.get("type").and_then(|v| v.as_str()) != Some("diff") {
            continue;
        }
        let Some(path) = non_empty(c.get("path").and_then(|v| v.as_str())) else {
            continue;
        };
        let len = c
            .get("newText")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .len();
        let key = format!("{id}:{path}:{len}");
        if ctx.seen_edits.contains(&key) {
            continue;
        }
        ctx.seen_edits.insert(key);
        files.push(path.to_string());
    }
    if files.is_empty() {
        vec![]
    } else {
        vec![json!({"kind": "edit", "files": files})]
    }
}

/// `params.update` → 0..n events Atelier. Update inconnue ⇒ vec![] (jamais
/// d'erreur — tolérance aux évolutions du CLI, même règle que grok.mjs:485).
pub fn map_session_update(update: &Value, ctx: &mut TurnCtx) -> Vec<Value> {
    match update.get("sessionUpdate").and_then(|v| v.as_str()) {
        Some("agent_thought_chunk") => {
            vec![json!({"kind": "thinking_delta", "text": text_of(update)})]
        }
        Some("agent_message_chunk") => {
            vec![json!({"kind": "delta", "text": text_of(update)})]
        }
        Some("tool_call") => vec![tool_call_event(update, ctx)],
        Some("tool_call_update") => {
            let mut evs = vec![tool_call_update_event(update, ctx)];
            evs.extend(edit_events(update, ctx));
            evs
        }
        Some("usage_update") => {
            // Absorbé dans le ctx, fusionné dans le `done` final — ne JAMAIS
            // ré-émettre (event fréquent ⇒ gonflement du journal).
            ctx.last_usage_update = Some(update.clone());
            vec![]
        }
        _ => vec![],
    }
}

/// Réponse de `session/prompt` → event `done`. `ok` couvre `cancelled`
/// (interruption utilisateur = succès, comme grok.mjs:518-535). Usage fusionné :
/// tokens de la réponse prompt + window/cost du dernier `usage_update`.
pub fn map_prompt_result(result: &Value, ctx: &TurnCtx) -> Value {
    let stop = result.get("stopReason").and_then(|v| v.as_str()).unwrap_or("");
    let ok = stop == "end_turn" || stop == "cancelled";
    let uu = ctx.last_usage_update.as_ref();
    let context = result
        .pointer("/usage/totalTokens")
        .and_then(|v| v.as_u64())
        .or_else(|| uu.and_then(|u| u.get("used").and_then(|v| v.as_u64())))
        .unwrap_or(0);
    let output = result
        .pointer("/usage/outputTokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let cost = uu.and_then(|u| u.pointer("/cost/amount").and_then(|v| v.as_f64()));
    let window = uu.and_then(|u| u.get("size").and_then(|v| v.as_u64()));
    json!({
        "kind": "done",
        "ok": ok,
        "result": "",
        "usage": {
            "context": context,
            "output": output,
            "cost": cost,
            "turns": null,
            "window": window,
        }
    })
}

/// Émetteur bufferisé d'un tour — adjacence bloc live → bloc final exigée par
/// le reducer du front (miroir makeTurnEmitter, grok.mjs:769-798) : avant
/// d'émettre autre chose que le delta du buffer actif, flusher le(s) buffer(s).
pub struct TurnEmitter {
    on_event: Arc<dyn Fn(Value) + Send + Sync>,
    message_buffer: String,
    thought_buffer: String,
}

impl TurnEmitter {
    pub fn new(on_event: Arc<dyn Fn(Value) + Send + Sync>) -> Self {
        Self {
            on_event,
            message_buffer: String::new(),
            thought_buffer: String::new(),
        }
    }

    fn flush_thinking(&mut self) {
        if self.thought_buffer.is_empty() {
            return;
        }
        let text = std::mem::take(&mut self.thought_buffer);
        (self.on_event)(json!({"kind": "thinking", "text": text}));
    }

    fn flush_text(&mut self) {
        if self.message_buffer.is_empty() {
            return;
        }
        let text = std::mem::take(&mut self.message_buffer);
        (self.on_event)(json!({"kind": "text", "text": text}));
    }

    pub fn flush(&mut self) {
        self.flush_thinking();
        self.flush_text();
    }

    pub fn emit(&mut self, ev: Value) {
        match ev.get("kind").and_then(|v| v.as_str()).unwrap_or("") {
            "thinking_delta" => {
                self.flush_text();
                if let Some(t) = ev.get("text").and_then(|v| v.as_str()) {
                    self.thought_buffer.push_str(t);
                }
                (self.on_event)(ev);
            }
            "delta" => {
                self.flush_thinking();
                if let Some(t) = ev.get("text").and_then(|v| v.as_str()) {
                    self.message_buffer.push_str(t);
                }
                (self.on_event)(ev);
            }
            _ => {
                self.flush();
                (self.on_event)(ev);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn thought_chunk_to_thinking_delta() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"agent_thought_chunk","messageId":"msg_1",
            "content":{"type":"text","text":"The user wants me"}});
        let evs = map_session_update(&u, &mut ctx);
        assert_eq!(evs, vec![json!({"kind":"thinking_delta","text":"The user wants me"})]);
    }

    #[test]
    fn message_chunk_to_delta() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"agent_message_chunk","messageId":"msg_1",
            "content":{"type":"text","text":"ok"}});
        let evs = map_session_update(&u, &mut ctx);
        assert_eq!(evs, vec![json!({"kind":"delta","text":"ok"})]);
    }

    #[test]
    fn tool_call_output_toujours_string() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"tool_call","toolCallId":"call_1","title":"bash","kind":"execute"});
        let evs = map_session_update(&u, &mut ctx);
        assert_eq!(evs.len(), 1);
        let ev = &evs[0];
        assert_eq!(ev["kind"], "tool_update");
        assert_eq!(ev["name"], "bash");
        assert_eq!(ev["status"], "running");
        assert_eq!(ev["source"], "opencode");
        assert!(ev["output"].is_string(), "output doit être une string, jamais absent");
        assert_eq!(ev["output"], "");
    }

    #[test]
    fn tool_call_update_statuses() {
        let cases = [
            (json!({"sessionUpdate":"tool_call_update","toolCallId":"c","status":"failed"}), "failed"),
            (json!({"sessionUpdate":"tool_call_update","toolCallId":"c","status":"completed"}), "completed"),
            (json!({"sessionUpdate":"tool_call_update","toolCallId":"c","status":"in_progress"}), "running"),
            // pas de statut mais un contenu -> completed (heuristique grok)
            (json!({"sessionUpdate":"tool_call_update","toolCallId":"c",
                "content":[{"type":"text","text":"fini"}]}), "completed"),
            (json!({"sessionUpdate":"tool_call_update","toolCallId":"c"}), "running"),
        ];
        for (u, want) in cases {
            let mut ctx = TurnCtx::default();
            let evs = map_session_update(&u, &mut ctx);
            assert_eq!(evs[0]["status"], *want, "update: {u}");
            assert!(evs[0]["output"].is_string());
        }
    }

    #[test]
    fn tool_call_update_reprend_meta_cachee() {
        let mut ctx = TurnCtx::default();
        let call = json!({"sessionUpdate":"tool_call","toolCallId":"call_2","title":"write",
            "kind":"edit","rawInput":{"path":"/tmp/a"}});
        map_session_update(&call, &mut ctx);
        // update de suivi SANS title ni rawInput (vu en réel avec grok)
        let follow = json!({"sessionUpdate":"tool_call_update","toolCallId":"call_2","status":"completed"});
        let evs = map_session_update(&follow, &mut ctx);
        assert_eq!(evs[0]["name"], "write");
        assert_eq!(evs[0]["input"]["path"], "/tmp/a");
        assert_eq!(evs[0]["status"], "completed");
    }

    #[test]
    fn diff_content_donne_edit_dedup() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"tool_call_update","toolCallId":"call_3","status":"completed",
            "content":[{"type":"diff","path":"/a.txt","oldText":"","newText":"x"}]});
        let evs = map_session_update(&u, &mut ctx);
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0]["kind"], "tool_update");
        assert_eq!(evs[1], json!({"kind":"edit","files":["/a.txt"]}));
        // même update rejouée avec le même ctx : plus d'edit
        let evs2 = map_session_update(&u, &mut ctx);
        assert_eq!(evs2.len(), 1);
        assert_eq!(evs2[0]["kind"], "tool_update");
    }

    #[test]
    fn usage_update_absorbe_pas_emis() {
        let mut ctx = TurnCtx::default();
        // forme wire exacte de la sonde du 2026-07-16
        let u = json!({"sessionUpdate":"usage_update","used":80401,"size":200000,
            "cost":{"amount":0,"currency":"USD"}});
        let evs = map_session_update(&u, &mut ctx);
        assert!(evs.is_empty());
        assert_eq!(ctx.last_usage_update.as_ref().unwrap()["size"], 200000);
    }

    #[test]
    fn updates_ignorees() {
        let mut ctx = TurnCtx::default();
        for k in ["user_message_chunk", "available_commands_update", "current_mode_update", "inconnu_futur"] {
            let u = json!({"sessionUpdate": k});
            assert!(map_session_update(&u, &mut ctx).is_empty(), "{k} doit être ignoré");
        }
    }

    #[test]
    fn prompt_result_done_usage_fusionne() {
        let mut ctx = TurnCtx::default();
        map_session_update(
            &json!({"sessionUpdate":"usage_update","used":80401,"size":200000,
                "cost":{"amount":0.0125,"currency":"USD"}}),
            &mut ctx,
        );
        // forme wire exacte de la sonde
        let result = json!({"stopReason":"end_turn","usage":{"inputTokens":78609,
            "outputTokens":4,"totalTokens":80437,"thoughtTokens":32,"cachedReadTokens":1792},"_meta":{}});
        let done = map_prompt_result(&result, &ctx);
        assert_eq!(done["kind"], "done");
        assert_eq!(done["ok"], true);
        assert_eq!(done["usage"]["context"], 80437);
        assert_eq!(done["usage"]["output"], 4);
        assert_eq!(done["usage"]["window"], 200000);
        assert_eq!(done["usage"]["cost"], 0.0125);
    }

    #[test]
    fn prompt_result_cancelled_ok_refusal_ko() {
        let ctx = TurnCtx::default();
        let cancelled = map_prompt_result(&json!({"stopReason":"cancelled"}), &ctx);
        assert_eq!(cancelled["ok"], true);
        let refusal = map_prompt_result(&json!({"stopReason":"refusal"}), &ctx);
        assert_eq!(refusal["ok"], false);
        assert_eq!(refusal["usage"]["context"], 0);
        assert!(refusal["usage"]["window"].is_null());
    }

    #[test]
    fn emitter_adjacence_flush() {
        let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(vec![]));
        let seen2 = Arc::clone(&seen);
        let mut em = TurnEmitter::new(Arc::new(move |ev: Value| {
            seen2
                .lock()
                .unwrap()
                .push(ev["kind"].as_str().unwrap_or("").to_string());
        }));
        em.emit(json!({"kind":"thinking_delta","text":"a"}));
        em.emit(json!({"kind":"delta","text":"b"}));
        em.emit(json!({"kind":"tool_update","id":"t","name":"bash","status":"running",
            "output":"","input":null,"source":"opencode"}));
        em.flush();
        // le tool_update est précédé des blocs finaux thinking puis text
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["thinking_delta", "thinking", "delta", "text", "tool_update"]
        );
    }
}
