//! Mapping `session/update` d'Antigravity (`agy acp`) → events Atelier.
//!
//! Formes relevées par la sonde du 2026-11-17 sur `agy` 1.5.10
//! (plans/antigravity-2026-11-17/sonde-resultats.md) :
//! - les outils portent un nom natif (`run_command`, `write_file`,
//!   `edit_file`, `read_file`, `ask_question`, `mcp_<serveur>_<outil>`) à
//!   côté du titre affiché, et leurs arguments dans `args` quand `rawInput`
//!   manque ;
//! - `run_command` rend `rawOutput {output, exit_code}` sans bloc texte ;
//! - `edit_file` ne porte que le fragment modifié (`oldText` optionnel) ;
//! - sans élicitation annoncée, `ask_question` pose la question en texte,
//!   finit le tour et reste `pending` : le provider le ferme à la fin du tour
//!   (`close_orphan_questions`) ;
//! - `session_info_update`, `config_option_update`,
//!   `available_commands_update` et `current_mode_update` sont des états, pas
//!   du transcript : le provider les lit à part.
//!
//! Invariants partagés avec Kimi : `tool_update.output` toujours string,
//! `toolCallId` tel quel, aucun usage synthétique.

use crate::acp_map::{edit_events, text_of, tool_call_event, tool_call_update_event, TurnCtx};
use serde_json::{json, Value};

/// Source des events `tool_update` (icône et libellé côté interface).
pub(crate) const SOURCE: &str = "antigravity";

/// Nom natif de l'outil qui pose une question à l'utilisateur.
pub(crate) const ASK_QUESTION: &str = "ask_question";

const KNOWN_SILENT: &[&str] = &[
    "user_message_chunk",
    "session_info_update",
    "config_option_update",
    "available_commands_update",
    "current_mode_update",
];

fn non_empty(v: Option<&Value>) -> Option<&str> {
    v.and_then(Value::as_str).filter(|s| !s.is_empty())
}

/// Nom natif d'un outil : champ `name` de l'update (ou de son `toolCall`).
pub(crate) fn native_tool_name(update: &Value) -> Option<&str> {
    non_empty(update.get("name")).or_else(|| non_empty(update.pointer("/toolCall/name")))
}

/// Arguments d'un outil : `rawInput`, sinon `args` (forme agy).
pub(crate) fn tool_input(update: &Value) -> Option<&Value> {
    update
        .get("rawInput")
        .filter(|v| !v.is_null())
        .or_else(|| update.get("args").filter(|v| !v.is_null()))
}

/// Copie de l'update où `args` comble un `rawInput` absent : les helpers ACP
/// génériques ne lisent que `rawInput`.
fn with_input(update: &Value) -> Value {
    let mut u = update.clone();
    if u.get("rawInput").map_or(true, Value::is_null) {
        if let Some(args) = update.get("args").filter(|v| !v.is_null()) {
            u["rawInput"] = args.clone();
        }
    }
    u
}

/// Pose le nom natif sur l'event et garde le titre lisible en `detail`.
fn apply_native_name(ev: &mut Value, update: &Value, ctx: &mut TurnCtx) {
    let id = update
        .get("toolCallId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if let Some(name) = native_tool_name(update) {
        ctx.tool_names.insert(id.to_string(), name.to_string());
    }
    let Some(name) = ctx.tool_names.get(id).cloned() else {
        return;
    };
    let title = non_empty(update.get("title"))
        .map(str::to_string)
        .or_else(|| ctx.tool_meta.get(id).and_then(|m| m.name.clone()))
        .filter(|t| t != &name);
    ev["name"] = json!(name);
    match title {
        Some(t) => ev["detail"] = json!(t),
        None => {
            if let Some(obj) = ev.as_object_mut() {
                obj.remove("detail");
            }
        }
    }
}

/// Sortie d'une commande : `rawOutput {output, exit_code}` quand l'update n'a
/// pas de bloc texte.
fn apply_raw_output(ev: &mut Value, update: &Value) {
    if ev["output"].as_str().is_some_and(|o| !o.is_empty()) {
        return;
    }
    let Some(raw) = update.get("rawOutput").filter(|r| r.is_object()) else {
        return;
    };
    let mut out = raw
        .get("output")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if let Some(code) = raw
        .get("exit_code")
        .and_then(Value::as_i64)
        .filter(|c| *c != 0)
    {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&format!("(code de sortie {code})"));
    }
    ev["output"] = json!(out);
}

fn track_open(ctx: &mut TurnCtx, ev: &Value) {
    let Some(id) = ev["id"].as_str().filter(|i| !i.is_empty()) else {
        return;
    };
    let closed = matches!(ev["status"].as_str(), Some("completed" | "failed"));
    ctx.open_tools.retain(|o| o != id);
    if !closed {
        ctx.open_tools.push(id.to_string());
    }
}

/// `params.update` agy → 0..n events Atelier destinés au transcript.
pub fn map_agy_session_update(update: &Value, ctx: &mut TurnCtx) -> Vec<Value> {
    match update.get("sessionUpdate").and_then(Value::as_str) {
        Some("agent_thought_chunk") => {
            vec![json!({"kind": "thinking_delta", "text": text_of(update)})]
        }
        Some("agent_message_chunk") => {
            vec![json!({"kind": "delta", "text": text_of(update)})]
        }
        Some("tool_call") => {
            let u = with_input(update);
            let mut ev = tool_call_event(&u, ctx, SOURCE);
            // Un tool_call peut arriver déjà terminé (rejeu de session/load).
            if let Some(status) = non_empty(update.get("status")) {
                if status == "completed" || status == "failed" {
                    ev = tool_call_update_event(&u, ctx, SOURCE);
                }
            }
            apply_native_name(&mut ev, update, ctx);
            apply_raw_output(&mut ev, update);
            track_open(ctx, &ev);
            let mut evs = vec![ev];
            evs.extend(edit_events(&u, ctx));
            evs
        }
        Some("tool_call_update") => {
            let u = with_input(update);
            let mut ev = tool_call_update_event(&u, ctx, SOURCE);
            apply_native_name(&mut ev, update, ctx);
            apply_raw_output(&mut ev, update);
            track_open(ctx, &ev);
            let mut evs = vec![ev];
            evs.extend(edit_events(&u, ctx));
            evs
        }
        Some("usage_update") => {
            ctx.last_usage_update = Some(update.clone());
            vec![]
        }
        Some(kind) if KNOWN_SILENT.contains(&kind) => vec![],
        Some(kind) => {
            let bounded: String = kind.chars().take(64).collect();
            eprintln!("[antigravity] session/update inconnue ignorée: {bounded}");
            vec![]
        }
        None => vec![],
    }
}

/// Fin de tour : un `ask_question` resté ouvert a posé sa question dans le
/// texte de la réponse. Il passe `completed` au lieu de tourner à vide.
pub fn close_orphan_questions(ctx: &mut TurnCtx) -> Vec<Value> {
    let open = std::mem::take(&mut ctx.open_tools);
    let mut evs = Vec::new();
    for id in open {
        if ctx.tool_names.get(&id).map(String::as_str) != Some(ASK_QUESTION) {
            ctx.open_tools.push(id);
            continue;
        }
        let meta = ctx.tool_meta.get(&id).cloned().unwrap_or_default();
        let mut ev = json!({
            "kind": "tool_update",
            "id": id,
            "name": ASK_QUESTION,
            "status": "completed",
            "output": "Question posée dans la réponse.",
            "input": meta.input.unwrap_or(Value::Null),
            "source": SOURCE,
        });
        if let Some(title) = meta.name.filter(|t| t != ASK_QUESTION) {
            ev["detail"] = json!(title);
        }
        evs.push(ev);
    }
    evs
}

/// Réponse de `session/prompt` → event `done`. `end_turn` et `cancelled`
/// sont des succès. La clé `usage` n'existe que si agy l'a fournie : un
/// `end_turn` sans usage (premier prompt fusionné) ne fabrique pas de zéros.
pub fn map_agy_prompt_result(result: &Value, ctx: &TurnCtx) -> Value {
    let stop = result
        .get("stopReason")
        .and_then(Value::as_str)
        .unwrap_or("");
    let ok = stop == "end_turn" || stop == "cancelled";
    let mut done = json!({"kind": "done", "ok": ok, "result": ""});
    if let Some(usage) = result.get("usage").filter(|u| u.is_object()) {
        let uu = ctx.last_usage_update.as_ref();
        done["usage"] = json!({
            "context": usage
                .get("totalTokens")
                .and_then(Value::as_u64)
                .or_else(|| uu.and_then(|u| u.get("used").and_then(Value::as_u64)))
                .unwrap_or(0),
            "output": usage.get("outputTokens").and_then(Value::as_u64).unwrap_or(0),
            "cost": null,
            "turns": null,
            "window": uu.and_then(|u| u.get("size").and_then(Value::as_u64)),
        });
    }
    done
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(ctx: &mut TurnCtx, u: Value) -> Vec<Value> {
        map_agy_session_update(&u, ctx)
    }

    #[test]
    fn texte_et_reflexion() {
        let mut ctx = TurnCtx::default();
        assert_eq!(
            map(
                &mut ctx,
                json!({"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"Planning"}})
            ),
            vec![json!({"kind":"thinking_delta","text":"Planning"})]
        );
        assert_eq!(
            map(
                &mut ctx,
                json!({"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"ok"}})
            ),
            vec![json!({"kind":"delta","text":"ok"})]
        );
    }

    #[test]
    fn commande_nom_natif_args_et_sortie_brute() {
        let mut ctx = TurnCtx::default();
        let evs = map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call","toolCallId":"tc1",
            "title":"ls -la","kind":"execute","status":"in_progress",
            "name":"run_command","args":{"CommandLine":"ls -la"}}),
        );
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0]["name"], "run_command");
        assert_eq!(evs[0]["detail"], "ls -la");
        assert_eq!(evs[0]["input"]["CommandLine"], "ls -la");
        assert_eq!(evs[0]["source"], "antigravity");
        assert_eq!(ctx.open_tools, vec!["tc1"]);

        let evs = map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call_update","toolCallId":"tc1",
            "status":"completed","rawOutput":{"output":"a\nb\n","exit_code":0}}),
        );
        assert_eq!(evs[0]["name"], "run_command", "nom natif gardé sans titre");
        assert_eq!(evs[0]["status"], "completed");
        assert_eq!(evs[0]["output"], "a\nb\n");
        assert_eq!(evs[0]["input"]["CommandLine"], "ls -la");
        assert!(ctx.open_tools.is_empty());
    }

    #[test]
    fn code_de_sortie_non_nul_affiche() {
        let mut ctx = TurnCtx::default();
        let evs = map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call_update","toolCallId":"tc2",
            "status":"failed","name":"run_command","rawOutput":{"output":"boom","exit_code":2}}),
        );
        assert_eq!(evs[0]["status"], "failed");
        assert_eq!(evs[0]["output"], "boom\n(code de sortie 2)");
    }

    #[test]
    fn diff_de_fragment_sans_old_text() {
        let mut ctx = TurnCtx::default();
        map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call","toolCallId":"e1","title":"a.txt",
            "kind":"edit","name":"edit_file","status":"in_progress"}),
        );
        let evs = map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call_update","toolCallId":"e1",
            "status":"completed","content":[{"type":"diff","path":"/p/a.txt","newText":"ligne neuve"}]}),
        );
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0]["name"], "edit_file");
        assert_eq!(
            evs[1],
            json!({"kind":"edit","files":["/p/a.txt"],
            "snippets":{"/p/a.txt":{"oldText":"","newText":"ligne neuve"}}})
        );
    }

    #[test]
    fn rejeu_outil_deja_termine_en_un_seul_tool_call() {
        let mut ctx = TurnCtx::default();
        let evs = map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call","toolCallId":"w1",
            "title":"note.md","kind":"edit","name":"write_file","status":"completed",
            "content":[{"type":"diff","path":"/p/note.md","newText":"x"}]}),
        );
        assert_eq!(evs[0]["status"], "completed");
        assert_eq!(evs[1]["kind"], "edit");
        assert!(ctx.open_tools.is_empty());
    }

    #[test]
    fn question_orpheline_fermee_en_fin_de_tour() {
        let mut ctx = TurnCtx::default();
        map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call","toolCallId":"q1",
            "title":"Ask user","kind":"other","name":"ask_question","status":"in_progress"}),
        );
        map(
            &mut ctx,
            json!({"sessionUpdate":"tool_call","toolCallId":"r1",
            "title":"ls","kind":"execute","name":"run_command","status":"in_progress"}),
        );
        let evs = close_orphan_questions(&mut ctx);
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0]["id"], "q1");
        assert_eq!(evs[0]["status"], "completed");
        assert_eq!(evs[0]["detail"], "Ask user");
        assert_eq!(
            ctx.open_tools,
            vec!["r1"],
            "les autres outils restent ouverts"
        );
    }

    #[test]
    fn etats_de_session_hors_transcript() {
        let mut ctx = TurnCtx::default();
        for u in [
            json!({"sessionUpdate":"session_info_update","title":"Titre"}),
            json!({"sessionUpdate":"config_option_update","configOptions":[]}),
            json!({"sessionUpdate":"available_commands_update","availableCommands":[]}),
            json!({"sessionUpdate":"current_mode_update","currentModeId":"plan"}),
            json!({"sessionUpdate":"user_message_chunk","content":{"type":"text","text":"x"}}),
        ] {
            assert!(map(&mut ctx, u).is_empty());
        }
    }

    #[test]
    fn done_avec_et_sans_usage() {
        let mut ctx = TurnCtx::default();
        map(
            &mut ctx,
            json!({"sessionUpdate":"usage_update","used":1200,"size":1048576}),
        );
        let d = map_agy_prompt_result(
            &json!({"stopReason":"end_turn","usage":{
            "inputTokens":1000,"outputTokens":40,"cachedReadTokens":0,"cachedWriteTokens":0,
            "thoughtTokens":12,"totalTokens":1052}}),
            &ctx,
        );
        assert_eq!(d["ok"], true);
        assert_eq!(d["usage"]["context"], 1052);
        assert_eq!(d["usage"]["output"], 40);
        assert_eq!(d["usage"]["window"], 1048576);
        let d = map_agy_prompt_result(&json!({"stopReason":"end_turn"}), &ctx);
        assert!(d.get("usage").is_none(), "absence d'usage ≠ zéro");
        let d = map_agy_prompt_result(&json!({"stopReason":"cancelled"}), &ctx);
        assert_eq!(d["ok"], true);
        let d = map_agy_prompt_result(&json!({"stopReason":"refusal"}), &ctx);
        assert_eq!(d["ok"], false);
    }
}
