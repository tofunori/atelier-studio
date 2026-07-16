//! Mapping Kimi ACP `session/update` → events Atelier (plan 046, étape 3).
//!
//! Réutilise les helpers ACP standard d'`acp_map` (formes wire identiques,
//! vérifiées contre le tag officiel 0.26.0) avec `source:"kimi"`, et ajoute
//! ce que Kimi émet en plus d'OpenCode : `plan` (→ singleton `todos`),
//! `config_option_update` et `available_commands_update` (état éphémère —
//! JAMAIS le transcript, le provider les intercepte à part).
//!
//! Invariants (plan 046) :
//! - `tool_update.output` est toujours une string ;
//! - `toolCallId` reste EXACTEMENT celui du wire (préfixe `${turnId}:` inclus) ;
//! - aucun event usage synthétique : sans usage Kimi, le `done` n'a pas de
//!   clé `usage` (différence absence ≠ zéro) ;
//! - update inconnue ⇒ ignorée avec une trace debug bornée (jamais d'erreur).

use crate::acp_map::{edit_events, text_of, tool_call_event, tool_call_update_event, TurnCtx};
use serde_json::{json, Value};

/// Updates connues et volontairement absentes du transcript : replay
/// (`user_message_chunk`), métadonnées (`session_info_update`), formes plan
/// expérimentales non émises par Kimi 0.26, mode legacy, et `usage_update`
/// (absorbé dans le ctx). Aucune trace pour celles-ci.
const KNOWN_SILENT: &[&str] = &[
    "user_message_chunk",
    "session_info_update",
    "plan_update",
    "plan_removed",
    "current_mode_update",
];

/// `plan.entries` → items du singleton `todos` Atelier :
/// completed ⇒ (true, false), in_progress ⇒ (false, true), pending ⇒ (false, false).
fn todos_event(update: &Value) -> Value {
    let items: Vec<Value> = update
        .get("entries")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .map(|e| {
                    let status = e.get("status").and_then(Value::as_str).unwrap_or("");
                    json!({
                        "text": e.get("content").and_then(Value::as_str).unwrap_or(""),
                        "completed": status == "completed",
                        "active": status == "in_progress",
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    json!({"kind": "todos", "items": items})
}

/// `params.update` Kimi → 0..n events Atelier destinés au transcript.
///
/// `config_option_update` et `available_commands_update` retournent `[]` ici :
/// ce sont des états éphémères que le provider consomme directement depuis
/// l'update brute (snapshot configOptions, catalogue commandes) sans jamais
/// gonfler le journal.
pub fn map_kimi_session_update(update: &Value, ctx: &mut TurnCtx) -> Vec<Value> {
    match update.get("sessionUpdate").and_then(Value::as_str) {
        Some("agent_thought_chunk") => {
            vec![json!({"kind": "thinking_delta", "text": text_of(update)})]
        }
        Some("agent_message_chunk") => {
            vec![json!({"kind": "delta", "text": text_of(update)})]
        }
        Some("tool_call") => vec![tool_call_event(update, ctx, "kimi")],
        Some("tool_call_update") => {
            let mut evs = vec![tool_call_update_event(update, ctx, "kimi")];
            evs.extend(edit_events(update, ctx));
            evs
        }
        Some("plan") => vec![todos_event(update)],
        Some("config_option_update") | Some("available_commands_update") => vec![],
        Some("usage_update") => {
            // Hors contrat Kimi 0.26 (jamais émis) — absorbé par tolérance,
            // fusionné dans le done UNIQUEMENT si un usage réel existe.
            ctx.last_usage_update = Some(update.clone());
            vec![]
        }
        Some(kind) if KNOWN_SILENT.contains(&kind) => vec![],
        Some(kind) => {
            // Trace debug bornée : le TYPE seulement, jamais le payload.
            let bounded: String = kind.chars().take(64).collect();
            eprintln!("[kimi] session/update inconnue ignorée: {bounded}");
            vec![]
        }
        None => vec![],
    }
}

/// Réponse de `session/prompt` → event `done`.
///
/// `ok` couvre `end_turn` ET `cancelled` (interruption utilisateur = succès,
/// même règle que grok/opencode). `refusal` et le reste ⇒ `ok:false` — le
/// provider en dérive un résultat explicite, jamais un second prompt.
///
/// La clé `usage` n'existe que si Kimi a fourni un usage réel dans la
/// réponse (`usage.totalTokens`/`outputTokens`, contrat zUsage : champs
/// requis ensemble). Kimi 0.26 n'en envoie jamais ⇒ pas de clé, aucun
/// compteur synthétique (décision 12 du plan 046).
pub fn map_kimi_prompt_result(result: &Value, ctx: &TurnCtx) -> Value {
    let stop = result
        .get("stopReason")
        .and_then(Value::as_str)
        .unwrap_or("");
    let ok = stop == "end_turn" || stop == "cancelled";
    let mut done = json!({"kind": "done", "ok": ok, "result": ""});

    if let Some(usage) = result.get("usage").filter(|u| !u.is_null()) {
        let uu = ctx.last_usage_update.as_ref();
        done["usage"] = json!({
            "context": usage.get("totalTokens").and_then(Value::as_u64).unwrap_or(0),
            "output": usage.get("outputTokens").and_then(Value::as_u64).unwrap_or(0),
            "cost": uu.and_then(|u| u.pointer("/cost/amount").and_then(Value::as_f64)),
            "turns": null,
            "window": uu.and_then(|u| u.get("size").and_then(Value::as_u64)),
        });
    }
    done
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp_map::TurnEmitter;
    use std::sync::{Arc, Mutex};

    #[test]
    fn thought_chunk_vers_thinking_delta() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"agent_thought_chunk",
            "content":{"type":"text","text":"je réfléchis"}});
        assert_eq!(
            map_kimi_session_update(&u, &mut ctx),
            vec![json!({"kind":"thinking_delta","text":"je réfléchis"})]
        );
    }

    #[test]
    fn message_chunk_vers_delta() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"agent_message_chunk",
            "content":{"type":"text","text":"ok"}});
        assert_eq!(
            map_kimi_session_update(&u, &mut ctx),
            vec![json!({"kind":"delta","text":"ok"})]
        );
    }

    #[test]
    fn tool_call_source_kimi_et_id_prefixe_conserve() {
        let mut ctx = TurnCtx::default();
        // toolCallId wire Kimi = `${turnId}:${rawId}` — conservé tel quel.
        let u = json!({"sessionUpdate":"tool_call","toolCallId":"3:call_abc",
            "title":"Bash","kind":"execute","status":"in_progress",
            "rawInput":{"command":"ls"}});
        let evs = map_kimi_session_update(&u, &mut ctx);
        assert_eq!(evs.len(), 1);
        let ev = &evs[0];
        assert_eq!(ev["kind"], "tool_update");
        assert_eq!(ev["id"], "3:call_abc");
        assert_eq!(ev["name"], "Bash");
        assert_eq!(ev["status"], "running");
        assert_eq!(ev["source"], "kimi");
        assert!(ev["output"].is_string(), "output string, jamais absent");
    }

    #[test]
    fn tool_call_update_statut_output_et_edit_dedup() {
        let mut ctx = TurnCtx::default();
        map_kimi_session_update(
            &json!({"sessionUpdate":"tool_call","toolCallId":"1:c","title":"Write","kind":"edit"}),
            &mut ctx,
        );
        let u = json!({"sessionUpdate":"tool_call_update","toolCallId":"1:c","status":"completed",
            "content":[{"type":"diff","path":"/tmp/a.txt","oldText":"","newText":"neuf"}]});
        let evs = map_kimi_session_update(&u, &mut ctx);
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0]["kind"], "tool_update");
        assert_eq!(evs[0]["status"], "completed");
        assert_eq!(evs[0]["name"], "Write", "méta reprise du tool_call");
        assert!(evs[0]["output"].as_str().unwrap().contains("/tmp/a.txt"));
        assert_eq!(evs[1], json!({"kind":"edit","files":["/tmp/a.txt"]}));
        // Rejouée : le diff est dédupliqué, plus d'event edit.
        let evs2 = map_kimi_session_update(&u, &mut ctx);
        assert_eq!(evs2.len(), 1);
    }

    #[test]
    fn tool_call_update_failed() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"tool_call_update","toolCallId":"1:c","status":"failed"});
        let evs = map_kimi_session_update(&u, &mut ctx);
        assert_eq!(evs[0]["status"], "failed");
    }

    #[test]
    fn plan_vers_todos_singleton() {
        let mut ctx = TurnCtx::default();
        let u = json!({"sessionUpdate":"plan","entries":[
            {"content":"Lire","priority":"medium","status":"completed"},
            {"content":"Écrire","priority":"medium","status":"in_progress"},
            {"content":"Tester","priority":"medium","status":"pending"}
        ]});
        let evs = map_kimi_session_update(&u, &mut ctx);
        assert_eq!(
            evs,
            vec![json!({"kind":"todos","items":[
                {"text":"Lire","completed":true,"active":false},
                {"text":"Écrire","completed":false,"active":true},
                {"text":"Tester","completed":false,"active":false}
            ]})]
        );
        // Un second plan REMPLACE (sémantique singleton todos côté reducer).
        let u2 = json!({"sessionUpdate":"plan","entries":[
            {"content":"Lire","priority":"medium","status":"completed"}
        ]});
        let evs2 = map_kimi_session_update(&u2, &mut ctx);
        assert_eq!(evs2[0]["items"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn config_et_commandes_jamais_transcript() {
        let mut ctx = TurnCtx::default();
        for u in [
            json!({"sessionUpdate":"config_option_update","configOptions":[
                {"type":"select","id":"model","name":"Model","category":"model",
                 "currentValue":"m1","options":[{"value":"m1","name":"M1"}]}
            ]}),
            json!({"sessionUpdate":"available_commands_update","availableCommands":[
                {"name":"compact","description":"Compact the conversation context"}
            ]}),
        ] {
            assert!(
                map_kimi_session_update(&u, &mut ctx).is_empty(),
                "état éphémère, jamais dans le journal: {u}"
            );
        }
    }

    #[test]
    fn updates_connues_silencieuses_et_inconnues_ignorees() {
        let mut ctx = TurnCtx::default();
        for k in [
            "user_message_chunk",
            "session_info_update",
            "plan_update",
            "plan_removed",
            "current_mode_update",
            "extension_future_inconnue",
        ] {
            let u = json!({"sessionUpdate": k});
            assert!(map_kimi_session_update(&u, &mut ctx).is_empty(), "{k}");
        }
    }

    #[test]
    fn done_sans_usage_kimi_aucune_cle_usage() {
        let ctx = TurnCtx::default();
        // Contrat Kimi 0.26 réel : {stopReason} seul.
        let done = map_kimi_prompt_result(&json!({"stopReason":"end_turn"}), &ctx);
        assert_eq!(done["kind"], "done");
        assert_eq!(done["ok"], true);
        assert!(
            done.get("usage").is_none(),
            "absence d'usage ≠ usage nul — aucun compteur synthétique"
        );
    }

    #[test]
    fn done_usage_reel_mappe_et_enrichi() {
        let mut ctx = TurnCtx::default();
        map_kimi_session_update(
            &json!({"sessionUpdate":"usage_update","used":1234,"size":200000,
                "cost":{"amount":0.005,"currency":"USD"}}),
            &mut ctx,
        );
        let done = map_kimi_prompt_result(
            &json!({"stopReason":"end_turn","usage":{
                "inputTokens":100,"outputTokens":7,"totalTokens":107}}),
            &ctx,
        );
        assert_eq!(done["usage"]["context"], 107);
        assert_eq!(done["usage"]["output"], 7);
        assert_eq!(done["usage"]["cost"], 0.005);
        assert_eq!(done["usage"]["window"], 200000);
    }

    #[test]
    fn cancelled_ok_refusal_ko() {
        let ctx = TurnCtx::default();
        assert_eq!(
            map_kimi_prompt_result(&json!({"stopReason":"cancelled"}), &ctx)["ok"],
            true
        );
        let refusal = map_kimi_prompt_result(&json!({"stopReason":"refusal"}), &ctx);
        assert_eq!(refusal["ok"], false);
        assert!(refusal.get("usage").is_none());
    }

    #[test]
    fn adjacence_buffers_avec_events_kimi() {
        let seen: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(vec![]));
        let seen2 = Arc::clone(&seen);
        let mut em = TurnEmitter::new(Arc::new(move |ev: Value| {
            seen2
                .lock()
                .unwrap()
                .push(ev["kind"].as_str().unwrap_or("").to_string());
        }));
        let mut ctx = TurnCtx::default();
        for u in [
            json!({"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"a"}}),
            json!({"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"b"}}),
            json!({"sessionUpdate":"plan","entries":[]}),
        ] {
            for ev in map_kimi_session_update(&u, &mut ctx) {
                em.emit(ev);
            }
        }
        em.flush();
        // Le todos est précédé des blocs finaux thinking puis text.
        assert_eq!(
            *seen.lock().unwrap(),
            vec!["thinking_delta", "thinking", "delta", "text", "todos"]
        );
    }
}
