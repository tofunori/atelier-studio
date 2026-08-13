//! Grok streaming-json + ACP sessionUpdate mapping (plan 033 Porte 8).

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

/// Legacy `grok -p --output-format streaming-json` line → events.
pub fn normalize_grok_message(msg: &Value) -> Vec<Value> {
    let ty = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match ty {
        "error" => vec![json!({
            "kind": "error",
            "message": msg.get("message")
                .or_else(|| msg.get("error"))
                .map(|v| if v.is_string() { v.as_str().unwrap_or("erreur Grok").to_string() } else { v.to_string() })
                .unwrap_or_else(|| "erreur Grok".into()),
        })],
        "thought" => vec![json!({
            "kind": "thinking_delta",
            "text": msg.get("data").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "text" => vec![json!({
            "kind": "delta",
            "text": msg.get("data").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "end" => {
            let stop = msg.get("stopReason").and_then(|v| v.as_str());
            let ok = stop.map(|s| s == "EndTurn").unwrap_or(true);
            vec![json!({
                "kind": "done",
                "ok": ok,
                "sessionId": msg.get("sessionId"),
                "result": "",
                "usage": { "context": 0, "output": 0, "cost": null, "turns": null },
            })]
        }
        _ => vec![],
    }
}

pub fn parse_grok_jsonl(chunk: &str, carry: &str) -> (Vec<Value>, String) {
    let text = format!("{carry}{chunk}");
    let mut lines: Vec<&str> = text.split('\n').collect();
    let rest = lines.pop().unwrap_or("").to_string();
    let mut events = Vec::new();
    for line in lines {
        let t = line.trim().trim_end_matches('\r');
        if t.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(t) {
            Ok(msg) => events.extend(normalize_grok_message(&msg)),
            Err(_) => events.push(json!({
                "kind": "error",
                "message": format!("JSON Grok invalide: {}", t.chars().take(120).collect::<String>()),
            })),
        }
    }
    (events, rest)
}

/// ACP `params.update` mapping (session/update or _x.ai/session_notification).
pub fn map_session_update(
    update: &Value,
    tool_meta: &mut HashMap<String, Value>,
    seen_edits: &mut HashSet<String>,
) -> Vec<Value> {
    let kind = update
        .get("sessionUpdate")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    match kind {
        "agent_thought_chunk" => vec![json!({
            "kind": "thinking_delta",
            "text": update.pointer("/content/text").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "agent_message_chunk" => vec![json!({
            "kind": "delta",
            "text": update.pointer("/content/text").and_then(|v| v.as_str()).unwrap_or(""),
        })],
        "tool_call" => {
            let id = update
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let name = update
                // JSON Pointer : la clé littérale `x.ai/tool` encode `/` en `~1`.
                .pointer("/_meta/x.ai~1tool/name")
                .or_else(|| update.get("title"))
                .and_then(|v| v.as_str())
                .unwrap_or("tool");
            let ev = json!({
                "kind": "tool_update",
                "id": id,
                "name": name,
                "status": "running",
                "detail": update.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "output": "",
                "input": update.get("rawInput"),
                "source": "grok",
            });
            tool_meta.insert(id, ev.clone());
            vec![ev]
        }
        "tool_call_update" => {
            let id = update
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let cached = tool_meta.get(&id).cloned();
            let name = update
                .pointer("/_meta/x.ai~1tool/name")
                .or_else(|| update.get("title"))
                .and_then(|v| v.as_str())
                .or_else(|| {
                    cached
                        .as_ref()
                        .and_then(|c| c.get("name").and_then(|v| v.as_str()))
                })
                .unwrap_or("tool");
            let status = update
                .pointer("/_meta/updateParams/status")
                .or_else(|| update.get("status"))
                .and_then(|v| v.as_str())
                .map(normalize_tool_status)
                .unwrap_or_else(|| {
                    if update
                        .get("content")
                        .and_then(Value::as_array)
                        .is_some_and(|items| !items.is_empty())
                    {
                        "completed"
                    } else {
                        "running"
                    }
                });
            let mut out = vec![json!({
                "kind": "tool_update",
                "id": id,
                "name": name,
                "status": status,
                "detail": update.get("title").and_then(|v| v.as_str()).unwrap_or(""),
                "output": tool_call_output(update),
                "input": update.get("rawInput").cloned().or_else(|| cached.as_ref().and_then(|c| c.get("input").cloned())),
                "source": "grok",
            })];
            // edits from diffs
            if let Some(arr) = update.get("content").and_then(|v| v.as_array()) {
                let mut files = Vec::new();
                for c in arr {
                    if c.get("type").and_then(|v| v.as_str()) != Some("diff") {
                        continue;
                    }
                    let Some(path) = c.get("path").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let key = format!(
                        "{}:{}:{}",
                        id,
                        path,
                        c.get("newText")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .len()
                    );
                    if seen_edits.insert(key) {
                        files.push(path.to_string());
                    }
                }
                if !files.is_empty() {
                    out.push(json!({"kind":"edit","files": files}));
                }
            }
            out
        }
        "pending_interaction" => {
            let k = update.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            vec![json!({
                "kind": "tool",
                "name": if k.is_empty() { "permission en attente".into() } else { format!("permission ({k})") },
            })]
        }
        "plan" => {
            let entries = update
                .get("entries")
                .or_else(|| update.get("plan"))
                .or_else(|| update.get("items"))
                .and_then(Value::as_array);
            let items: Vec<Value> = entries
                .into_iter()
                .flatten()
                .map(|entry| {
                    json!({
                        "text": entry.get("content")
                            .or_else(|| entry.get("step"))
                            .or_else(|| entry.get("text"))
                            .and_then(Value::as_str)
                            .unwrap_or(""),
                        "completed": entry.get("status").and_then(Value::as_str) == Some("completed"),
                    })
                })
                .filter(|item| item.get("text").and_then(Value::as_str).is_some_and(|s| !s.is_empty()))
                .collect();
            if items.is_empty() {
                vec![]
            } else {
                vec![json!({"kind":"todos", "items": items})]
            }
        }
        // Sous-agents : Grok les lance lui-même et rend compte par
        // notification. Sans traduction, seul l'appel `spawn_subagent`
        // apparaissait — on voyait le départ, jamais le travail ni le
        // résultat. Ils empruntent la carte d'outil existante : même
        // affichage vivant, aucun composant neuf.
        "subagent_spawned" | "subagent_progress" | "subagent_finished" => {
            let Some(id) = update
                .get("subagent_id")
                .and_then(|v| v.as_str())
                .filter(|id| !id.is_empty())
            else {
                return vec![];
            };
            let nombre = |cle: &str| update.get(cle).and_then(|v| v.as_u64());
            let secondes = nombre("duration_ms").map(|ms| format!("{:.0} s", ms as f64 / 1000.0));
            let detail = match kind {
                "subagent_progress" | "subagent_finished" => {
                    let mut parts = Vec::new();
                    if let Some(t) = nombre("turn_count").or_else(|| nombre("turns")) {
                        parts.push(format!("{t} tour{}", if t > 1 { "s" } else { "" }));
                    }
                    if let Some(c) = nombre("tool_call_count").or_else(|| nombre("tool_calls")) {
                        parts.push(format!("{c} outil{}", if c > 1 { "s" } else { "" }));
                    }
                    if let Some(j) = nombre("tokens_used") {
                        parts.push(format!("{j} jetons"));
                    }
                    if let Some(d) = secondes {
                        parts.push(d);
                    }
                    parts.join(" · ")
                }
                _ => String::new(),
            };
            let status = if kind == "subagent_finished" {
                match update.get("status").and_then(|v| v.as_str()) {
                    Some("completed") => "completed",
                    Some(other) if other.contains("cancel") => "cancelled",
                    Some(_) => "failed",
                    None => "completed",
                }
            } else {
                "running"
            };
            // `description` et `subagent_type` disent SUR QUOI il travaille —
            // sans eux la carte n'affiche qu'un compteur anonyme.
            let description = update
                .get("description")
                .and_then(|v| v.as_str())
                .filter(|d| !d.is_empty());
            let type_agent = update
                .get("subagent_type")
                .and_then(|v| v.as_str())
                .filter(|t| !t.is_empty());
            let nom = match (type_agent, description) {
                (Some(t), Some(d)) => format!("sous-agent {t} · {d}"),
                (Some(t), None) => format!("sous-agent {t}"),
                (None, Some(d)) => format!("sous-agent · {d}"),
                (None, None) => "sous-agent".to_string(),
            };
            vec![json!({
                "kind": "tool_update",
                "id": format!("subagent:{id}"),
                "name": nom,
                "status": status,
                "detail": detail,
                "output": update.get("output").and_then(|v| v.as_str()).unwrap_or(""),
                "input": update.get("prompt").or_else(|| update.get("description")),
                "source": "grok",
            })]
        }
        // Avancement MCP (liste blanche d'acp_rpc) : occupe l'attente avant le
        // premier jeton, là où Atelier n'affichait qu'un spinner muet.
        "x_mcp_progress" => match update.get("phase").and_then(|v| v.as_str()) {
            Some("_x.ai/mcp/init_progress") => {
                let total = update.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
                if total == 0 {
                    vec![]
                } else {
                    let connected = update.get("connected").and_then(|v| v.as_u64()).unwrap_or(0);
                    vec![json!({"kind":"heartbeat",
                        "note": format!("MCP {connected}/{total}")})]
                }
            }
            Some("_x.ai/mcp_initialized") => {
                let tools = update.get("mcpToolCount").and_then(|v| v.as_u64()).unwrap_or(0);
                vec![json!({"kind":"heartbeat", "note": format!("MCP prêt · {tools} outils")})]
            }
            // Un serveur en panne est silencieux autrement : Thierry ne peut
            // pas deviner qu'un MCP a échoué son handshake.
            Some("_x.ai/mcp/server_status") => {
                let status = update.get("status").and_then(|v| v.as_str()).unwrap_or("");
                let name = update.get("name").and_then(|v| v.as_str()).unwrap_or("");
                // Grok émet un statut par serveur et par transition
                // (`initialized`, `restart_succeeded`, `config_changed`…) :
                // les relayer tous noierait le compteur sous 50 lignes en
                // deux secondes. Seule une panne mérite un mot.
                let failed = status.contains("fail") || status == "unavailable";
                if !failed || name.is_empty() {
                    vec![]
                } else {
                    let reason = update.get("reason").and_then(|v| v.as_str()).unwrap_or(status);
                    vec![json!({"kind":"heartbeat", "note": format!("MCP {name} : {reason}")})]
                }
            }
            _ => vec![],
        },
        "hook_execution"
        | "user_message_chunk"
        | "available_commands_update"
        | "session_summary_generated"
        | "interaction_resolved"
        | "turn_completed" => vec![],
        _ => vec![], // unknown → ignore
    }
}

fn normalize_tool_status(raw: &str) -> &'static str {
    let status = raw.to_ascii_lowercase();
    if status.contains("fail") || status.contains("error") || status.contains("reject") {
        "failed"
    } else if status.contains("complet") || status.contains("done") || status.contains("success") {
        "completed"
    } else {
        "running"
    }
}

fn tool_call_output(update: &Value) -> String {
    if let Some(arr) = update.get("content").and_then(|v| v.as_array()) {
        return arr
            .iter()
            .filter_map(|c| {
                if c.get("type").and_then(|v| v.as_str()) == Some("diff") {
                    Some(format!(
                        "# {}\n{}",
                        c.get("path").and_then(|v| v.as_str()).unwrap_or("file"),
                        c.get("newText").and_then(|v| v.as_str()).unwrap_or("")
                    ))
                } else {
                    c.get("text").and_then(|v| v.as_str()).map(str::to_string)
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
    }
    String::new()
}

pub fn map_prompt_result(result: &Value) -> Value {
    map_prompt_result_for_model(result, None)
}

pub fn map_prompt_result_for_model(result: &Value, model: Option<&str>) -> Value {
    let stop = result.get("stopReason").and_then(|v| v.as_str());
    let ok = matches!(stop, Some("end_turn") | Some("cancelled") | None);
    let meta = result.get("_meta").cloned().unwrap_or(json!({}));
    let window = model.and_then(|id| {
        // Catalogue Grok actuel : la famille 4.x expose 500k. Inconnu ⇒ null,
        // jamais une valeur inventée pour un futur modèle.
        id.starts_with("grok-4").then_some(500_000_u64)
    });
    // Grok chiffre le tour : `costUsdTicks` vaut 1e10 par dollar (source
    // xai-chat-state/src/usage.rs). Atelier affichait `cost: null` alors que
    // l'information arrivait à chaque tour.
    let cost = meta
        .pointer("/usage/costUsdTicks")
        .and_then(|v| v.as_i64())
        .filter(|ticks| *ticks > 0)
        .map(|ticks| ticks as f64 / 1e10);
    json!({
        "kind": "done",
        "ok": ok,
        "result": "",
        "usage": {
            "context": meta.get("totalTokens").and_then(|v| v.as_u64()).unwrap_or(0),
            "output": meta.get("outputTokens").and_then(|v| v.as_u64()).unwrap_or(0),
            "cost": cost,
            "turns": meta.pointer("/usage/numTurns").and_then(|v| v.as_u64()),
            "window": window,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_thought_text_end() {
        let e = normalize_grok_message(&json!({"type":"thought","data":"hmm"}));
        assert_eq!(e[0]["kind"], "thinking_delta");
        let e = normalize_grok_message(&json!({"type":"text","data":"hi"}));
        assert_eq!(e[0]["kind"], "delta");
        let e =
            normalize_grok_message(&json!({"type":"end","stopReason":"EndTurn","sessionId":"s1"}));
        assert_eq!(e[0]["kind"], "done");
        assert_eq!(e[0]["ok"], true);
    }

    #[test]
    fn acp_message_and_thought_chunks() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let e = map_session_update(
            &json!({"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Hel"}}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(e[0]["text"], "Hel");
        let e = map_session_update(
            &json!({"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"think"}}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(e[0]["kind"], "thinking_delta");
    }

    #[test]
    fn unknown_session_update_ignored() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let e = map_session_update(
            &json!({"sessionUpdate":"some_future_event_type","foo":"bar"}),
            &mut meta,
            &mut edits,
        );
        assert!(e.is_empty());
    }

    #[test]
    fn xai_tool_metadata_status_and_cache_are_preserved() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let call = map_session_update(
            &json!({
                "sessionUpdate":"tool_call",
                "toolCallId":"call-xai",
                "title":"Lecture",
                "rawInput":{"path":"/tmp/a"},
                "_meta":{"x.ai/tool":{"name":"read_file"}}
            }),
            &mut meta,
            &mut edits,
        );
        assert_eq!(call[0]["name"], "read_file");
        assert_eq!(call[0]["source"], "grok");

        let update = map_session_update(
            &json!({
                "sessionUpdate":"tool_call_update",
                "toolCallId":"call-xai",
                "_meta":{"updateParams":{"status":"error"}}
            }),
            &mut meta,
            &mut edits,
        );
        assert_eq!(update[0]["name"], "read_file");
        assert_eq!(update[0]["status"], "failed");
        assert!(update[0]["output"].is_string());
    }

    /// Charges utiles réelles (sonde 2026-08-13) : Grok annonce ses
    /// sous-agents par notification. Sans traduction, seul l'appel
    /// `spawn_subagent` était visible — le travail et le résultat, jamais.
    #[test]
    fn un_sous_agent_devient_une_carte_doutil_vivante() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let map = |u: &Value, m: &mut HashMap<String, Value>, e: &mut HashSet<String>| {
            map_session_update(u, m, e)
        };

        let depart = map(
            &json!({"sessionUpdate":"subagent_spawned","subagent_id":"019ffc67-ad93",
                "child_session_id":"019ffc67-ad93"}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(depart[0]["kind"], "tool_update");
        assert_eq!(depart[0]["id"], "subagent:019ffc67-ad93");
        assert_eq!(depart[0]["status"], "running");

        let avance = map(
            &json!({"sessionUpdate":"subagent_progress","subagent_id":"019ffc67-ad93",
                "turn_count":2,"tool_call_count":3,"tokens_used":15368,"duration_ms":4479}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(avance[0]["status"], "running");
        assert_eq!(avance[0]["detail"], "2 tours · 3 outils · 15368 jetons · 4 s");

        let fin = map(
            &json!({"sessionUpdate":"subagent_finished","subagent_id":"019ffc67-ad93",
                "status":"completed","tool_calls":1,"turns":1,"duration_ms":11560,
                "tokens_used":15368,"output":"**Total: 3**"}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(fin[0]["status"], "completed");
        assert_eq!(fin[0]["output"], "**Total: 3**");

        // Même identifiant tout du long : une seule carte qui évolue, pas trois.
        assert_eq!(fin[0]["id"], depart[0]["id"]);
    }

    /// Un sous-agent en échec ne doit pas passer pour terminé.
    /// La description dit ce que fait le sous-agent : sans elle, la carte
    /// n'affiche qu'un compteur anonyme.
    #[test]
    fn la_carte_dit_sur_quoi_le_sous_agent_travaille() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let depart = map_session_update(
            &json!({"sessionUpdate":"subagent_spawned","subagent_id":"a1",
                "subagent_type":"explore","description":"Résumer PIEGES_CONNUS"}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(depart[0]["name"], "sous-agent explore · Résumer PIEGES_CONNUS");
    }

    #[test]
    fn un_sous_agent_en_echec_est_signale() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let fin = map_session_update(
            &json!({"sessionUpdate":"subagent_finished","subagent_id":"x","status":"error"}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(fin[0]["status"], "failed");
        assert!(map_session_update(
            &json!({"sessionUpdate":"subagent_spawned"}),
            &mut meta,
            &mut edits
        )
        .is_empty());
    }

    /// Le coût d'un tour arrivait à chaque réponse et partait à la poubelle.
    /// Unité documentée dans la source amont : 1e10 ticks par dollar.
    #[test]
    fn le_cout_du_tour_est_converti_en_dollars() {
        let done = map_prompt_result_for_model(
            &json!({"stopReason":"end_turn","_meta":{
                "totalTokens": 40646, "outputTokens": 40,
                "usage": {"costUsdTicks": 726180000_i64, "numTurns": 3}
            }}),
            Some("grok-4.6"),
        );
        assert_eq!(done["usage"]["context"], 40646);
        assert_eq!(done["usage"]["turns"], 3);
        assert_eq!(done["usage"]["window"], 500_000);
        let cost = done["usage"]["cost"].as_f64().unwrap();
        assert!((cost - 0.072618).abs() < 1e-9, "coût obtenu : {cost}");
    }

    /// Un tour sans coût rapporté ne doit pas afficher 0 $ — c'est faux et
    /// ça masquerait une facturation réelle.
    #[test]
    fn un_cout_absent_reste_nul_et_non_zero() {
        let done = map_prompt_result_for_model(
            &json!({"stopReason":"end_turn","_meta":{"totalTokens": 10}}),
            Some("grok-4.6"),
        );
        assert!(done["usage"]["cost"].is_null());
        assert!(done["usage"]["turns"].is_null());
    }

    /// Charges utiles réelles de grok 1.0.3 (sonde 2026-08-13).
    #[test]
    fn lavancement_mcp_occupe_lattente() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let map = |update: &Value, meta: &mut HashMap<String, Value>, edits: &mut HashSet<String>| {
            map_session_update(update, meta, edits)
        };

        let progress = map(
            &json!({"sessionUpdate":"x_mcp_progress","phase":"_x.ai/mcp/init_progress",
                "total":23,"connected":7}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(progress[0]["kind"], "heartbeat");
        assert_eq!(progress[0]["note"], "MCP 7/23");

        let ready = map(
            &json!({"sessionUpdate":"x_mcp_progress","phase":"_x.ai/mcp_initialized",
                "mcpToolCount":225,"elapsedMs":798}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(ready[0]["note"], "MCP prêt · 225 outils");

        // Un serveur en panne doit se voir : sinon l'échec est muet.
        let failed = map(
            &json!({"sessionUpdate":"x_mcp_progress","phase":"_x.ai/mcp/server_status",
                "name":"plan","status":"unavailable","reason":"handshake_failed"}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(failed[0]["note"], "MCP plan : handshake_failed");

        // Un serveur sain n'a rien à dire — Grok émet un statut par serveur ET
        // par transition, les relayer noierait le compteur.
        for sain in ["initialized", "restart_succeeded", "config_changed", "ok"] {
            assert!(
                map(
                    &json!({"sessionUpdate":"x_mcp_progress","phase":"_x.ai/mcp/server_status",
                        "name":"exa","status":sain}),
                    &mut meta,
                    &mut edits,
                )
                .is_empty(),
                "statut sain relayé : {sain}"
            );
        }
        assert_eq!(
            map(
                &json!({"sessionUpdate":"x_mcp_progress","phase":"_x.ai/mcp/server_status",
                    "name":"open-knowledge","status":"restart_failed"}),
                &mut meta,
                &mut edits,
            )[0]["note"],
            "MCP open-knowledge : restart_failed"
        );
    }

    /// `detail` porte des URLs et des chemins internes, `servers_updated` des
    /// commandes ssh complètes : rien de tout ça ne doit franchir acp_rpc.
    #[test]
    fn la_sanitisation_mcp_ne_laisse_passer_que_le_sur() {
        let update = crate::acp_rpc::mcp_progress_update(
            "_x.ai/mcp/server_status",
            &json!({
                "sessionId":"019f","name":"plan","source":"local","status":"unavailable",
                "reason":"handshake_failed",
                "detail":"MCP server 'plan' handshake failed: … http://rorqual.tail02163.ts.net:3131/mcp",
                "tools":null
            }),
        );
        assert_eq!(update["name"], "plan");
        assert_eq!(update["reason"], "handshake_failed");
        assert!(update.get("detail").is_none());
        assert!(update.get("sessionId").is_none());
        assert!(update.get("source").is_none());
        assert!(!update.to_string().contains("rorqual"));
    }

    #[test]
    fn grok_plan_becomes_todos() {
        let mut meta = HashMap::new();
        let mut edits = HashSet::new();
        let events = map_session_update(
            &json!({"sessionUpdate":"plan", "entries":[
                {"content":"Inspecter", "status":"completed"},
                {"content":"Corriger", "status":"in_progress"}
            ]}),
            &mut meta,
            &mut edits,
        );
        assert_eq!(events[0]["kind"], "todos");
        assert_eq!(events[0]["items"][0]["completed"], true);
        assert_eq!(events[0]["items"][1]["text"], "Corriger");
    }

    #[test]
    fn prompt_usage_reads_xai_meta_and_known_window() {
        let done = map_prompt_result_for_model(
            &json!({"stopReason":"end_turn", "_meta":{"totalTokens":42,"outputTokens":7}}),
            Some("grok-4.5"),
        );
        assert_eq!(done["ok"], true);
        assert_eq!(done["usage"]["context"], 42);
        assert_eq!(done["usage"]["output"], 7);
        assert_eq!(done["usage"]["window"], 500_000);
    }
}
