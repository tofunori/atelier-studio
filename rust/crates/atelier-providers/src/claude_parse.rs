//! Map Claude CLI `--output-format stream-json` lines → harness event payloads.
//! Mirrors `sidecar/providers/claude.mjs` emit mapping (plan 033 Porte 6).

use serde_json::{json, Value};

const TOOL_OUTPUT_MAX: usize = 64 * 1024;
const TOOL_INPUT_MAX: usize = 16 * 1024;
/// Avant/après d'un Edit (ou contenu d'un Write de fichier NOUVEAU) porté par
/// l'événement `edit` pour un diff immédiat côté front — au-delà, fallback git.
const SNIPPET_MAX: usize = 24 * 1024;

/// Pending tool_use awaiting tool_result.
#[derive(Debug, Clone)]
pub struct PendingTool {
    pub id: String,
    pub name: String,
    pub detail: String,
    pub input: Value,
    pub source: Option<String>,
    pub edit_path: Option<String>,
    /// Avant/après capturé sur l'input (Edit/Write) pour le diff immédiat.
    pub snippet: Option<Value>,
    /// TodoWrite : jamais de ligne d'outil — la liste devient l'événement `todos`.
    pub silent: bool,
    pub todos_items: Option<Value>,
    pub started_at_ms: u128,
    /// `system.permission_denied.message` reçu pendant que cet outil est en
    /// attente — sert d'`output` de repli si le `tool_result` arrive vide.
    pub denial_message: Option<String>,
}

/// State carried across a single Claude process stream.
#[derive(Debug, Default)]
pub struct ClaudeStreamState {
    pub session_id: Option<String>,
    pub last_ctx: Option<u64>,
    /// Ticker tokens du tour (heartbeat, éphémère par kind). Le CLI ne donne le
    /// vrai output_tokens d'un message qu'au message_delta FINAL (les lignes
    /// `assistant` portent un placeholder) — cumul = messages terminés + max(
    /// dernier message_delta, estimation chars/4 des deltas du message courant).
    pub completed_output_tokens: u64,
    pub current_msg_output_tokens: u64,
    pub current_msg_est_chars: usize,
    pub last_beat_tokens: u64,
    /// Compteur de `thinking_delta` VIDES du message courant. Le CLI ≥2.1.8
    /// caviarde le thinking en stream-json (`"thinking":""`) : le vrai texte
    /// a disparu, mais ce compteur donne quand même un signal de progression
    /// à l'UI. Remis à zéro partout où current_msg_* se réinitialise.
    pub thinking_chunks: u64,
    /// Estimation native (`system.thinking_tokens.estimated_tokens`) du
    /// message courant — alimente le ticker au même titre que les deltas de
    /// texte. Remis à zéro partout où current_msg_* le sont (le CLI ne le
    /// fait pas savoir autrement qu'en enchaînant sur le message suivant).
    pub current_msg_thinking_tokens: u64,
    /// Nom de l'outil EN RÉDACTION (content_block_start tool_use, input vide) :
    /// le vrai `tool_update` running le remplace ; sert au test pour vérifier
    /// que le drafting ne survit pas à l'arrivée du bloc complet.
    pub drafting_tool: Option<String>,
    pub pending_tools: std::collections::HashMap<String, PendingTool>,
    /// Dernier `system.task_summary.detail` émis — dédup du même détail
    /// consécutif (le CLI le répète parfois tel quel).
    pub last_task_summary: Option<String>,
    /// `tool_use_id` de l'outil Task/Agent PARENT → `task_id` du sous-agent,
    /// alimentée par `system.task_started`. Sert à router les messages
    /// enfants (`parent_tool_use_id`) vers le bon fil d'agent.
    pub task_id_by_tool_use_id: std::collections::HashMap<String, String>,
    pub saw_terminal: bool,
}

impl ClaudeStreamState {
    fn ticker_tokens(&self) -> u64 {
        self.completed_output_tokens
            + self
                .current_msg_output_tokens
                .max((self.current_msg_est_chars / 4) as u64)
                .max(self.current_msg_thinking_tokens)
    }
}

/// Events emitted from one stream-json line (0..N harness payloads).
pub fn parse_line(state: &mut ClaudeStreamState, line: &str) -> Vec<Value> {
    let line = line.trim();
    if line.is_empty() {
        return Vec::new();
    }
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    parse_message(state, &msg)
}

/// Délai jusqu'à la reprise, en clair. Plus utile qu'une heure absolue et
/// sans dépendance de fuseau : ce qu'on veut savoir, c'est l'attente.
fn delai_jusqua(epoch: u64) -> Option<String> {
    let maintenant = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();
    let reste = epoch.checked_sub(maintenant)?;
    Some(match reste {
        0..=90 => "moins d'une minute".to_string(),
        91..=5400 => format!("{} min", reste.div_ceil(60)),
        _ => format!("{} h {:02}", reste / 3600, (reste % 3600) / 60),
    })
}

pub fn parse_message(state: &mut ClaudeStreamState, msg: &Value) -> Vec<Value> {
    let mut out = Vec::new();
    let ty = msg.get("type").and_then(|v| v.as_str()).unwrap_or("");

    if ty == "system" {
        let subtype = msg.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
        if subtype == "init" {
            if let Some(sid) = msg.get("session_id").and_then(|v| v.as_str()) {
                state.session_id = Some(sid.to_string());
            }
            // Occupe l'attente : la session (potentiellement volumineuse en
            // --resume) vient d'être chargée, la requête part ensuite.
            out.push(json!({"kind":"heartbeat","note":"session chargée"}));
        }
        // « requesting » = la requête est partie, on attend le premier jeton.
        // C'est LE trou visible des gros tours (13-55 s mesurés 2026-08-24) :
        // sans note, le chrono tourne nu et le fil paraît bloqué.
        if subtype == "status" && msg.get("status").and_then(|v| v.as_str()) == Some("requesting") {
            out.push(json!({"kind":"heartbeat","note":"en attente du modèle…"}));
        }
        if subtype == "compact_boundary" {
            out.push(json!({"kind":"tool","name":"__compacted"}));
        }
        // Les hooks tournent invisiblement — 69 chez Thierry. Comme le
        // démarrage MCP de Grok, ils occupent l'attente au lieu de laisser
        // croire que rien ne se passe.
        if subtype == "hook_started" || subtype == "hook_response" {
            if let Some(nom) = msg
                .get("hook_name")
                .or_else(|| msg.get("hook_event_name"))
                .or_else(|| msg.get("hook"))
                .and_then(|v| v.as_str())
                .filter(|nom| !nom.is_empty())
            {
                out.push(json!({"kind":"heartbeat", "note": format!("hook {nom}")}));
            }
        }
        // Claude classe lui-même son tour. Un tour « bloqué » qui attend une
        // précision se terminait sans que rien ne le dise.
        if subtype == "post_turn_summary" {
            let categorie = msg
                .get("status_category")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if categorie == "blocked" || categorie == "failed" {
                if let Some(attendu) = msg
                    .get("needs_action")
                    .or_else(|| msg.get("status_detail"))
                    .and_then(|v| v.as_str())
                    .filter(|texte| !texte.is_empty())
                {
                    // Pseudo-outil `__waiting` (convention `__` = annotation,
                    // pas du travail) : un nom d'outil ordinaire APRÈS le texte
                    // final retirait à la réponse son statut de réponse détachée
                    // (terminalAssistantIndex) — elle disparaissait dans le
                    // repli « A travaillé pendant Ns » (régression vécue 2026-08-15).
                    out.push(json!({"kind":"tool", "name": "__waiting", "detail": attendu}));
                }
            }
        }
        // Résumé natif de l'étape en cours (façon Codex summaryTextDelta) :
        // ignoré si vide/null, et jamais répété tel quel d'affilée.
        if subtype == "task_summary" {
            if let Some(detail) = msg
                .get("detail")
                .and_then(|v| v.as_str())
                .filter(|d| !d.is_empty())
            {
                if state.last_task_summary.as_deref() != Some(detail) {
                    state.last_task_summary = Some(detail.to_string());
                    out.push(json!({"kind":"tool","name":"__thinking-step","detail": detail}));
                }
            }
        }
        // Estimation native du thinking (CLI ≥2.1.261) : alimente le ticker
        // au même titre que les deltas de texte du message courant.
        if subtype == "thinking_tokens" {
            if let Some(tok) = msg.get("estimated_tokens").and_then(|v| v.as_u64()) {
                state.current_msg_thinking_tokens = tok;
                let ticker = state.ticker_tokens();
                state.last_beat_tokens = ticker;
                out.push(json!({"kind":"heartbeat","tokens": ticker}));
            }
        }
        // Refus de permission : le tool_use en attente garde le message pour
        // servir d'output si le tool_result revient vide, et une note dit
        // tout de suite ce qui vient d'être refusé.
        if subtype == "permission_denied" {
            let tool_name = msg
                .get("tool_name")
                .and_then(|v| v.as_str())
                .unwrap_or("outil");
            if let Some(id) = msg.get("tool_use_id").and_then(|v| v.as_str()) {
                if let Some(pt) = state.pending_tools.get_mut(id) {
                    pt.denial_message = msg
                        .get("message")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                }
            }
            out.push(
                json!({"kind":"heartbeat","note": format!("Permission refusée — {tool_name}")}),
            );
        }
        // Cycle de vie natif des sous-agents (plan phase C). Les messages du
        // sous-agent lui-même (parent_tool_use_id non nul, cf. plus bas) ne
        // portent aucune ligne de fil principal — seule cette activité
        // groupée le représente.
        if subtype == "task_started" {
            if let Some(task_id) = msg
                .get("task_id")
                .and_then(|v| v.as_str())
                .map(str::to_string)
            {
                if let Some(tool_use_id) = msg.get("tool_use_id").and_then(|v| v.as_str()) {
                    state
                        .task_id_by_tool_use_id
                        .insert(tool_use_id.to_string(), task_id.clone());
                }
                let description = msg.get("description").and_then(|v| v.as_str());
                let mut agents_states = serde_json::Map::new();
                agents_states.insert(
                    task_id.clone(),
                    json!({"status":"running","message": description}),
                );
                let mut activity = serde_json::Map::new();
                activity.insert("tool".into(), json!("activity"));
                activity.insert("receiverThreadIds".into(), json!([task_id.clone()]));
                activity.insert("agentsStates".into(), Value::Object(agents_states));
                activity.insert("agentThreadId".into(), json!(task_id.clone()));
                activity.insert(
                    "agentPath".into(),
                    msg.get("subagent_type").cloned().unwrap_or(Value::Null),
                );
                activity.insert("activityKind".into(), json!("started"));
                activity.insert(
                    "prompt".into(),
                    msg.get("prompt").cloned().unwrap_or(Value::Null),
                );
                out.push(subagent_event(
                    &task_id,
                    "inProgress",
                    description.map(|d| json!(d)),
                    false,
                    activity,
                ));
            }
        }
        if subtype == "task_updated" {
            if let Some(task_id) = msg
                .get("task_id")
                .and_then(|v| v.as_str())
                .map(str::to_string)
            {
                let status = msg
                    .pointer("/patch/status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("running")
                    .to_string();
                let mut agents_states = serde_json::Map::new();
                agents_states.insert(task_id.clone(), json!({"status": status, "message": null}));
                let mut activity = serde_json::Map::new();
                activity.insert("tool".into(), json!("activity"));
                activity.insert("receiverThreadIds".into(), json!([task_id.clone()]));
                activity.insert("agentsStates".into(), Value::Object(agents_states));
                activity.insert("agentThreadId".into(), json!(task_id.clone()));
                activity.insert("activityKind".into(), json!("updated"));
                let tool_status = if is_subagent_terminal(
                    msg.pointer("/patch/status")
                        .and_then(|v| v.as_str())
                        .unwrap_or(""),
                ) {
                    "completed"
                } else {
                    "inProgress"
                };
                out.push(subagent_event(&task_id, tool_status, None, false, activity));
            }
        }
        if subtype == "task_notification" {
            if let Some(task_id) = msg
                .get("task_id")
                .and_then(|v| v.as_str())
                .map(str::to_string)
            {
                let status = msg
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("completed")
                    .to_string();
                let summary = msg
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .map(|s| truncate_chars(s, 200));
                let usage = msg.get("usage").cloned().unwrap_or(json!({}));
                let detail = task_notification_detail(&usage);
                let mut agents_states = serde_json::Map::new();
                agents_states.insert(
                    task_id.clone(),
                    json!({"status": status.clone(), "message": summary}),
                );
                let mut activity = serde_json::Map::new();
                activity.insert("tool".into(), json!("activity"));
                activity.insert("receiverThreadIds".into(), json!([task_id.clone()]));
                activity.insert("agentsStates".into(), Value::Object(agents_states));
                activity.insert("agentThreadId".into(), json!(task_id.clone()));
                activity.insert("activityKind".into(), json!("notification"));
                let tool_status = if matches!(
                    status.replace(['_', '-'], "").to_ascii_lowercase().as_str(),
                    "failed" | "errored" | "error"
                ) {
                    "failed"
                } else {
                    "completed"
                };
                out.push(subagent_event(
                    &task_id,
                    tool_status,
                    detail.map(|d| json!(d)),
                    false,
                    activity,
                ));
            }
        }
        // `background_tasks_changed` : instantané redondant avec le cycle
        // started/updated/notification déjà mappé — ignoré.
        return out;
    }

    // Fenêtre de quota annoncée à chaque tour. Sans elle, la limite se
    // découvre en la heurtant.
    if ty == "rate_limit_event" {
        let info = msg.get("rate_limit_info").cloned().unwrap_or(json!({}));
        let statut = info.get("status").and_then(|v| v.as_str()).unwrap_or("");
        // `allowed` est le cas normal : ne rien afficher tant que tout va bien.
        if statut.is_empty() || statut == "allowed" {
            return out;
        }
        let fenetre = info
            .get("rateLimitType")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let delai = info
            .get("resetsAt")
            .and_then(|v| v.as_u64())
            .and_then(delai_jusqua);
        // `allowed_warning` (et tout autre `allowed_*`) : la fenêtre approche
        // MAIS la requête passe. Une note d'avancement, jamais une erreur —
        // un événement `error` termine le tour (« Échec après 6 s » affiché
        // le 2026-08-25 alors que la réponse était bien arrivée).
        if statut.starts_with("allowed") {
            let remise = delai
                .map(|d| format!(" — remise à zéro dans {d}"))
                .unwrap_or_default();
            out.push(json!({
                "kind": "heartbeat",
                "note": format!("quota Claude bientôt atteint (fenêtre {fenetre}){remise}"),
            }));
            return out;
        }
        let reprise = delai
            .map(|d| format!(" — reprise dans {d}"))
            .unwrap_or_default();
        out.push(json!({
            "kind": "error",
            "message": format!("Limite d'usage Claude ({statut}, fenêtre {fenetre}){reprise}"),
        }));
        return out;
    }

    if ty == "stream_event" {
        // Flux d'un sous-agent (`parent_tool_use_id` non nul) : jamais de
        // delta/text/thinking* dans la bulle principale — ils polluaient le
        // fil (plan phase C). Seuls task_started/updated/notification (côté
        // `system`) et le tool_use enfant (côté `assistant`, plus bas)
        // portent l'activité de l'agent.
        if msg
            .get("parent_tool_use_id")
            .and_then(|v| v.as_str())
            .is_some()
        {
            return out;
        }
        if let Some(ev) = msg.get("event") {
            let et = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if et == "message_start" {
                // Le stream démarre : la note d'attente (« en attente du
                // modèle… ») ne doit pas survivre au premier jeton. Note
                // vide → le frontend remet liveNotes à null.
                out.push(json!({"kind":"heartbeat","note":""}));
            }
            if et == "content_block_delta" {
                if let Some(delta) = ev.get("delta") {
                    let dt = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if dt == "text_delta" {
                        if let Some(t) = delta.get("text").and_then(|v| v.as_str()) {
                            state.current_msg_est_chars += t.len();
                            out.push(json!({"kind":"delta","text": t}));
                        }
                    }
                    if dt == "thinking_delta" {
                        if let Some(t) = delta.get("thinking").and_then(|v| v.as_str()) {
                            state.current_msg_est_chars += t.len();
                            if !t.is_empty() {
                                out.push(json!({"kind":"thinking_delta","text": t}));
                            } else {
                                // Thinking caviardé par le CLI : pas de vrai texte, mais
                                // un signal de progression pour que l'UI montre que la
                                // réflexion avance. Si le texte revient un jour, la
                                // branche ci-dessus reprend seule (aucun progress alors).
                                state.thinking_chunks += 1;
                                out.push(json!({"kind":"thinking_progress","count": state.thinking_chunks}));
                            }
                        }
                    }
                }
                // ticker throttlé : un heartbeat quand l'estimation avance de ≥ 24 tokens
                let ticker = state.ticker_tokens();
                if ticker >= state.last_beat_tokens + 24 {
                    state.last_beat_tokens = ticker;
                    out.push(json!({"kind":"heartbeat","tokens": ticker}));
                }
            }
            if et == "content_block_start" {
                // Verbe de rédaction (façon Hermes tool.generating) : le CLI
                // annonce le NOM de l'outil avec input VIDE bien avant le bloc
                // `assistant` complet (~780 ms mesurés, spike 2026-08-21).
                // Event ÉPHÉMÈRE dédié — jamais journalisé ni rendu comme une
                // ligne du fil ; l'UI l'affiche comme verbe d'attente nommé et
                // le vrai `tool_update` running le remplace à l'arrivée.
                if let Some(cb) = ev.get("content_block") {
                    let cbt = cb.get("type").and_then(|v| v.as_str()).unwrap_or("");
                    if cbt == "tool_use" {
                        if let Some(name) = cb.get("name").and_then(|v| v.as_str()) {
                            state.drafting_tool = Some(name.to_string());
                            out.push(json!({"kind":"drafting","tool": name}));
                        }
                    }
                }
            }
            if et == "message_delta" {
                // seul endroit où le CLI donne le VRAI output_tokens cumulé du message
                if let Some(tok) = ev.pointer("/usage/output_tokens").and_then(|v| v.as_u64()) {
                    state.current_msg_output_tokens = tok;
                    let ticker = state.ticker_tokens();
                    state.last_beat_tokens = ticker;
                    out.push(json!({"kind":"heartbeat","tokens": ticker}));
                }
            }
            if et == "message_stop" {
                state.completed_output_tokens += state
                    .current_msg_output_tokens
                    .max((state.current_msg_est_chars / 4) as u64)
                    .max(state.current_msg_thinking_tokens);
                state.current_msg_output_tokens = 0;
                state.current_msg_est_chars = 0;
                state.thinking_chunks = 0;
                state.current_msg_thinking_tokens = 0;
            }
        }
        return out;
    }

    if ty == "assistant" {
        // Message d'un sous-agent (`parent_tool_use_id` non nul) : jamais de
        // texte/thinking dans la bulle principale. Seul son tool_use devient
        // une mise à jour éphémère de `agentsStates[task_id].message` (verbe
        // outil), à condition que `task_started` ait déjà lié ce
        // `tool_use_id` parent à un `task_id`.
        if let Some(parent_id) = msg.get("parent_tool_use_id").and_then(|v| v.as_str()) {
            if let Some(task_id) = state.task_id_by_tool_use_id.get(parent_id).cloned() {
                if let Some(blocks) = msg.pointer("/message/content").and_then(|v| v.as_array()) {
                    for block in blocks {
                        if block.get("type").and_then(|v| v.as_str()) != Some("tool_use") {
                            continue;
                        }
                        let name = block.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
                        let input = block.get("input").cloned().unwrap_or(json!({}));
                        let verb = tool_detail(name, &input);
                        let message = if verb.is_empty() {
                            name.to_string()
                        } else {
                            verb
                        };
                        let mut agents_states = serde_json::Map::new();
                        agents_states.insert(
                            task_id.clone(),
                            json!({"status":"running","message": message}),
                        );
                        let mut activity = serde_json::Map::new();
                        activity.insert("tool".into(), json!("activity"));
                        activity.insert("receiverThreadIds".into(), json!([task_id.clone()]));
                        activity.insert("agentsStates".into(), Value::Object(agents_states));
                        activity.insert("agentThreadId".into(), json!(task_id.clone()));
                        activity.insert("activityKind".into(), json!("interacted"));
                        out.push(subagent_event(&task_id, "inProgress", None, true, activity));
                    }
                }
            }
            return out;
        }
        if let Some(au) = msg.pointer("/message/usage") {
            let ctx = au.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
                + au.get("cache_read_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
                + au.get("cache_creation_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
            if ctx > 0 {
                state.last_ctx = Some(ctx);
                // Barre de contexte en direct : le CLI ne redonne le vrai
                // total qu'au `result` final, mais l'input_tokens de CHAQUE
                // message assistant suffit à faire vivre la barre pendant le
                // tour. Éphémère : jamais journalisé, remplacé au prochain.
                out.push(json!({
                    "kind": "usage",
                    "usage": {
                        "context": ctx,
                        "output": state.ticker_tokens(),
                        "cost": null,
                        "turns": null,
                    },
                    "__ephemeral": true,
                }));
            }
        }
        if let Some(blocks) = msg.pointer("/message/content").and_then(|v| v.as_array()) {
            for block in blocks {
                let bt = block.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if bt == "text" {
                    if let Some(t) = block.get("text").and_then(|v| v.as_str()) {
                        out.push(json!({"kind":"text","text": t}));
                    }
                }
                if bt == "thinking" {
                    if let Some(t) = block.get("thinking").and_then(|v| v.as_str()) {
                        if !t.is_empty() {
                            out.push(json!({"kind":"thinking","text": t}));
                        }
                    }
                }
                if bt == "tool_use" {
                    let id = block
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let name = block
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("tool")
                        .to_string();
                    let input = block.get("input").cloned().unwrap_or(json!({}));
                    // TodoWrite : pas de ligne d'outil — la liste devient l'événement
                    // `todos` (checklist du fil, singleton côté reducer), émis au
                    // succès. Même rendu que le plan Codex (turn/plan/updated).
                    if name == "TodoWrite" {
                        let items: Vec<Value> = input
                            .get("todos")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|td| {
                                        let text = td
                                            .get("content")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("");
                                        if text.is_empty() {
                                            return None;
                                        }
                                        let status =
                                            td.get("status").and_then(|v| v.as_str()).unwrap_or("");
                                        let mut item = json!({
                                            "text": text,
                                            "completed": status == "completed",
                                        });
                                        if status == "in_progress" {
                                            item.as_object_mut()
                                                .unwrap()
                                                .insert("active".into(), json!(true));
                                        }
                                        Some(item)
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        state.pending_tools.insert(
                            id.clone(),
                            PendingTool {
                                id,
                                name,
                                detail: String::new(),
                                input: json!({}),
                                source: None,
                                edit_path: None,
                                snippet: None,
                                silent: true,
                                todos_items: if items.is_empty() {
                                    None
                                } else {
                                    Some(Value::Array(items))
                                },
                                started_at_ms: now_ms(),
                                denial_message: None,
                            },
                        );
                        continue;
                    }
                    let detail = tool_detail(&name, &input);
                    let edit_path = if matches!(name.as_str(), "Edit" | "Write" | "NotebookEdit") {
                        input
                            .get("file_path")
                            .or_else(|| input.get("notebook_path"))
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                            .filter(|s| !s.is_empty())
                    } else {
                        None
                    };
                    // Diff immédiat : l'input porte déjà l'avant/après (Edit) ou le
                    // contenu d'un fichier NOUVEAU (Write, vérifié sur disque avant
                    // exécution) — attaché à l'événement `edit` au succès.
                    let snippet = if name == "Edit" {
                        let old_text = input
                            .get("old_string")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let new_text = input
                            .get("new_string")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        if old_text.len() <= SNIPPET_MAX && new_text.len() <= SNIPPET_MAX {
                            Some(json!({"oldText": old_text, "newText": new_text}))
                        } else {
                            None
                        }
                    } else if name == "Write" {
                        match edit_path.as_deref() {
                            Some(p) if !std::path::Path::new(p).exists() => {
                                let new_text =
                                    input.get("content").and_then(|v| v.as_str()).unwrap_or("");
                                if !new_text.is_empty() && new_text.len() <= SNIPPET_MAX {
                                    Some(json!({"newText": new_text}))
                                } else {
                                    None
                                }
                            }
                            _ => None,
                        }
                    } else {
                        None
                    };
                    let source = if name.starts_with("mcp__") {
                        Some("mcp".into())
                    } else {
                        None
                    };
                    let pt = PendingTool {
                        id: id.clone(),
                        name: name.clone(),
                        detail: detail.clone(),
                        input: bounded_input(&input),
                        source: source.clone(),
                        edit_path,
                        snippet,
                        silent: false,
                        todos_items: None,
                        started_at_ms: now_ms(),
                        denial_message: None,
                    };
                    state.pending_tools.insert(id.clone(), pt.clone());
                    // Le bloc complet (input intégral) remplace le verbe de
                    // rédaction : l'état d'affichage drafting est consommé.
                    state.drafting_tool = None;
                    out.push(json!({
                        "kind": "tool_update",
                        "id": id,
                        "name": name,
                        "detail": detail,
                        "input": pt.input,
                        "source": source,
                        "status": "running",
                        "output": "",
                    }));
                }
            }
        }
        // auth failure often arrives as assistant + error field
        if msg.get("error").is_some() {
            if let Some(text) = msg
                .pointer("/message/content/0/text")
                .and_then(|v| v.as_str())
            {
                if text.to_lowercase().contains("not logged in")
                    || text.to_lowercase().contains("login")
                {
                    // still emit text; result will follow
                }
            }
        }
        return out;
    }

    if ty == "user" {
        // tool_result d'un sous-agent (`parent_tool_use_id` non nul) : son
        // tool_use n'a jamais rejoint `pending_tools` (cf. bloc `assistant`
        // ci-dessus) — aucune ligne de fil principal à produire ici non plus.
        if msg
            .get("parent_tool_use_id")
            .and_then(|v| v.as_str())
            .is_some()
        {
            return out;
        }
        if let Some(blocks) = msg.pointer("/message/content").and_then(|v| v.as_array()) {
            for block in blocks {
                if block.get("type").and_then(|v| v.as_str()) != Some("tool_result") {
                    continue;
                }
                let (output, truncated, original_length) = normalize_tool_result(block);
                let tool_use_id = block
                    .get("tool_use_id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let failed = block
                    .get("is_error")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if let Some(pt) = state.pending_tools.remove(tool_use_id) {
                    if pt.silent {
                        // TodoWrite : la checklist remplace la ligne d'outil
                        if !failed {
                            if let Some(items) = pt.todos_items {
                                out.push(json!({"kind":"todos","items": items}));
                            }
                        }
                        continue;
                    }
                    let duration = now_ms().saturating_sub(pt.started_at_ms);
                    // Refus de permission déjà vu pour cet id : sert d'output
                    // de repli si le tool_result revient vide (cas observé
                    // à la sonde — le refus lui-même ne porte pas de sortie).
                    let output = if output.is_empty() {
                        pt.denial_message.clone().unwrap_or(output)
                    } else {
                        output
                    };
                    let mut ev = json!({
                        "kind": "tool_update",
                        "id": pt.id,
                        "name": pt.name,
                        "detail": pt.detail,
                        "input": pt.input,
                        "source": pt.source,
                        "status": if failed { "failed" } else { "completed" },
                        "output": output,
                        "durationMs": duration,
                    });
                    if truncated {
                        ev.as_object_mut()
                            .unwrap()
                            .insert("truncated".into(), json!(true));
                        ev.as_object_mut()
                            .unwrap()
                            .insert("outputLength".into(), json!(original_length));
                    }
                    out.push(ev);
                    if let Some(path) = pt.edit_path {
                        if !failed {
                            let mut edit = json!({"kind":"edit","files":[path.clone()]});
                            if let Some(sn) = pt.snippet {
                                let mut snippets = serde_json::Map::new();
                                snippets.insert(path, sn);
                                edit.as_object_mut()
                                    .unwrap()
                                    .insert("snippets".into(), Value::Object(snippets));
                            }
                            out.push(edit);
                        }
                    }
                } else {
                    out.push(json!({
                        "kind": "tool_update",
                        "id": tool_use_id,
                        "name": "unknown",
                        "source": "unknown",
                        "status": "completed",
                        "output": output,
                    }));
                }
            }
        }
        return out;
    }

    if ty == "result" {
        flush_pending(state, &mut out);
        // le ticker repart à zéro au prochain tour
        state.completed_output_tokens = 0;
        state.current_msg_output_tokens = 0;
        state.current_msg_est_chars = 0;
        state.last_beat_tokens = 0;
        state.thinking_chunks = 0;
        state.current_msg_thinking_tokens = 0;
        let subtype = msg.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
        let ok = subtype == "success"
            && !msg
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
        if let Some(sid) = msg.get("session_id").and_then(|v| v.as_str()) {
            state.session_id = Some(sid.to_string());
        }
        let u = msg.get("usage").cloned().unwrap_or(json!({}));
        let context = state.last_ctx.unwrap_or_else(|| {
            u.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0)
                + u.get("cache_read_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
                + u.get("cache_creation_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
        });
        if ok {
            out.push(json!({
                "kind": "done",
                "ok": true,
                "result": msg.get("result").and_then(|v| v.as_str()).unwrap_or(""),
                "usage": build_result_usage(context, &u, msg),
            }));
        } else {
            // `result` n'est posé que sur `success` ; les autres subtypes
            // (error_during_execution, error_max_turns…) portent le vrai
            // message dans `errors[]` (CLI 2.1.261, vu avec un --resume
            // périmé : « No conversation found with session ID »).
            let errors = msg
                .get("errors")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|e| e.as_str())
                        .filter(|e| !e.trim().is_empty())
                        .collect::<Vec<_>>()
                        .join(" — ")
                })
                .filter(|s| !s.is_empty());
            let message = msg
                .get("result")
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(str::to_string)
                .or(errors)
                .unwrap_or_else(|| "claude error".to_string());
            // Prefer done with ok:false to match Node when subtype success+is_error
            if subtype == "success" {
                out.push(json!({
                    "kind": "done",
                    "ok": false,
                    "result": message,
                    "usage": build_result_usage(context, &u, msg),
                }));
            } else {
                out.push(json!({"kind":"error","message": message}));
            }
        }
        state.saw_terminal = true;
        return out;
    }

    out
}

pub fn flush_pending(state: &mut ClaudeStreamState, out: &mut Vec<Value>) {
    for pt in state.pending_tools.values() {
        if pt.silent {
            continue; // TodoWrite : jamais de ligne d'outil, même interrompue
        }
        out.push(json!({
            "kind": "tool_update",
            "id": pt.id,
            "name": pt.name,
            "detail": pt.detail,
            "input": pt.input,
            "source": pt.source,
            "status": "interrupted",
            "output": "",
        }));
    }
    state.pending_tools.clear();
}

/// `done.usage` enrichi des champs optionnels du `result` final (plan phase A) :
/// `durationMs` préfère le temps API (hors attentes de permission) au temps
/// mur ; `permissionDenials` est un compte, pas le détail (déjà visible par
/// outil via les notes de refus).
fn build_result_usage(context: u64, u: &Value, msg: &Value) -> Value {
    let mut usage = json!({
        "context": context,
        "output": u.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
        "cost": msg.get("total_cost_usd"),
        "turns": msg.get("num_turns"),
    });
    let duration_ms = msg
        .get("duration_api_ms")
        .and_then(|v| v.as_u64())
        .or_else(|| msg.get("duration_ms").and_then(|v| v.as_u64()));
    if let Some(d) = duration_ms {
        usage
            .as_object_mut()
            .unwrap()
            .insert("durationMs".into(), json!(d));
    }
    if let Some(denials) = msg.get("permission_denials").and_then(|v| v.as_array()) {
        usage
            .as_object_mut()
            .unwrap()
            .insert("permissionDenials".into(), json!(denials.len()));
    }
    usage
}

/// Enveloppe commune des trois événements du cycle de vie d'un sous-agent
/// (`task_started`/`task_updated`/`task_notification`) et de la mise à jour
/// éphémère portée par son `tool_use` (plan phase C) : même `id` stable
/// (`subagent:<task_id>`) pour que le transcript groupe tout sous le même
/// agent, seul le contenu d'`agentActivity` change.
fn subagent_event(
    task_id: &str,
    status: &str,
    detail: Option<Value>,
    ephemeral: bool,
    activity: serde_json::Map<String, Value>,
) -> Value {
    let mut ev = json!({
        "kind": "tool_update",
        "id": format!("subagent:{task_id}"),
        "name": "agent:activity",
        "output": "",
        "status": status,
        "source": "claude",
    });
    let obj = ev.as_object_mut().expect("tool_update object");
    if let Some(d) = detail {
        obj.insert("detail".into(), d);
    }
    obj.insert("agentActivity".into(), Value::Object(activity));
    if ephemeral {
        obj.insert("__ephemeral".into(), json!(true));
    }
    ev
}

/// `running/pending/queued/started` = pas terminal ; tout le reste
/// (`completed`, `failed`, `interrupted`, `shutdown`, `errored`…) l'est.
fn is_subagent_terminal(status: &str) -> bool {
    !matches!(
        status.replace(['_', '-'], "").to_ascii_lowercase().as_str(),
        "running" | "pending" | "queued" | "started" | "inprogress" | ""
    )
}

fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        s.chars().take(max).collect()
    }
}

/// « 13,6k tokens · 2 outils · 1,1 s » — même esprit que le résumé Codex,
/// virgule décimale française.
fn task_notification_detail(usage: &Value) -> Option<String> {
    let total_tokens = usage.get("total_tokens").and_then(|v| v.as_u64());
    let tool_uses = usage.get("tool_uses").and_then(|v| v.as_u64());
    let duration_ms = usage.get("duration_ms").and_then(|v| v.as_u64());
    if total_tokens.is_none() && tool_uses.is_none() && duration_ms.is_none() {
        return None;
    }
    let mut parts = Vec::new();
    if let Some(t) = total_tokens {
        parts.push(format!("{} tokens", format_token_count(t)));
    }
    if let Some(n) = tool_uses {
        parts.push(format!("{n} outil{}", if n > 1 { "s" } else { "" }));
    }
    if let Some(d) = duration_ms {
        parts.push(format_seconds(d));
    }
    Some(parts.join(" · "))
}

fn format_token_count(n: u64) -> String {
    if n >= 1000 {
        format!("{}k", format_one_decimal(n as f64 / 1000.0))
    } else {
        n.to_string()
    }
}

fn format_seconds(ms: u64) -> String {
    format!("{} s", format_one_decimal(ms as f64 / 1000.0))
}

/// Une décimale, virgule française, sans `,0` superflu sur les entiers.
fn format_one_decimal(v: f64) -> String {
    let rounded = (v * 10.0).round() / 10.0;
    if (rounded.fract()).abs() < f64::EPSILON {
        format!("{}", rounded as i64)
    } else {
        format!("{rounded:.1}").replace('.', ",")
    }
}

pub fn tool_detail(name: &str, input: &Value) -> String {
    let first = |v: Option<&Value>| {
        v.and_then(|x| x.as_str())
            .unwrap_or("")
            .lines()
            .next()
            .unwrap_or("")
            .chars()
            .take(80)
            .collect::<String>()
    };
    match name {
        // même rendu que Claude Code desktop : la description rédigée par le
        // modèle prime sur la commande brute (visible dans l'input déplié)
        "Bash" => {
            let d = first(input.get("description"));
            if d.is_empty() {
                first(input.get("command"))
            } else {
                d
            }
        }
        "Read" | "Edit" | "Write" | "NotebookEdit" => {
            let p = input
                .get("file_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if p.len() > 60 {
                format!("…{}", &p[p.len() - 59..])
            } else {
                p.to_string()
            }
        }
        "Grep" | "Glob" => first(input.get("pattern")),
        "WebFetch" => first(input.get("url")),
        "WebSearch" => first(input.get("query")),
        "Task" | "Agent" => {
            let d = first(input.get("description"));
            if d.is_empty() {
                first(input.get("prompt"))
            } else {
                d
            }
        }
        _ => String::new(),
    }
}

fn bounded_input(input: &Value) -> Value {
    match serde_json::to_string(input) {
        Ok(s) if s.len() <= TOOL_INPUT_MAX => input.clone(),
        Ok(s) => {
            json!({"truncated": true, "preview": s.chars().take(TOOL_INPUT_MAX).collect::<String>()})
        }
        Err(_) => json!({}),
    }
}

fn normalize_tool_result(block: &Value) -> (String, bool, usize) {
    let c = block.get("content");
    let text = match c {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(arr)) => arr
            .iter()
            .map(|b| {
                if let Some(s) = b.as_str() {
                    s.to_string()
                } else if b.get("type").and_then(|v| v.as_str()) == Some("text") {
                    b.get("text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                } else {
                    b.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        Some(other) => other.to_string(),
        None => String::new(),
    };
    let original = text.len();
    let truncated = original > TOOL_OUTPUT_MAX;
    let output = if truncated {
        text.chars().take(TOOL_OUTPUT_MAX).collect()
    } else {
        text
    };
    (output, truncated, original)
}

fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Charges utiles réelles (sonde 2026-08-13). Claude annonce sa fenêtre de
    /// quota à chaque tour ; Atelier n'en montrait rien, donc la limite se
    /// découvrait en la heurtant.
    #[test]
    fn la_limite_dusage_ne_parle_que_quand_elle_menace() {
        let mut state = ClaudeStreamState::default();

        // Cas normal : rien à dire, pas de bruit à chaque tour.
        let ok = parse_message(
            &mut state,
            &json!({"type":"rate_limit_event","rate_limit_info":{
                "status":"allowed","rateLimitType":"five_hour"}}),
        );
        assert!(ok.is_empty());

        let epoch = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 1_800;
        let alerte = parse_message(
            &mut state,
            &json!({"type":"rate_limit_event","rate_limit_info":{
                "status":"rejected","rateLimitType":"five_hour","resetsAt":epoch}}),
        );
        assert_eq!(alerte[0]["kind"], "error");
        let texte = alerte[0]["message"].as_str().unwrap();
        assert!(texte.contains("five_hour"), "{texte}");
        assert!(texte.contains("30 min"), "{texte}");
    }

    /// `allowed_warning` = « tu approches de ta fenêtre 7 jours », la requête
    /// passe quand même. Émis en `error`, il teintait la réponse en rouge ET
    /// terminait le tour en « Échec après 6 s » (vécu 2026-08-25).
    #[test]
    fn un_avertissement_de_quota_nest_pas_un_echec() {
        let mut state = ClaudeStreamState::default();
        let epoch = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 1_800;
        let avert = parse_message(
            &mut state,
            &json!({"type":"rate_limit_event","rate_limit_info":{
                "status":"allowed_warning","rateLimitType":"seven_day","resetsAt":epoch}}),
        );
        assert_eq!(avert.len(), 1);
        assert_eq!(avert[0]["kind"], "heartbeat");
        let note = avert[0]["note"].as_str().unwrap();
        assert!(note.contains("seven_day"), "{note}");
        assert!(note.contains("30 min"), "{note}");
    }

    /// Claude classe lui-même son tour : « bloqué, en attente de précision ».
    /// Sans ça, le tour se terminait sans rien dire.
    #[test]
    fn un_tour_bloque_dit_ce_quil_attend() {
        let mut state = ClaudeStreamState::default();
        let bloque = parse_message(
            &mut state,
            &json!({"type":"system","subtype":"post_turn_summary",
                "status_category":"blocked",
                "needs_action":"clarify the task: what would you like me to do?"}),
        );
        assert_eq!(bloque[0]["kind"], "tool");
        // Nom d'annotation `__waiting` : un nom ordinaire faisait disparaître
        // la réponse finale dans le repli du tour (cf. terminalAssistantIndex).
        assert_eq!(bloque[0]["name"], "__waiting");
        assert!(bloque[0]["detail"]
            .as_str()
            .unwrap()
            .contains("clarify the task"));

        // Un tour normal ne doit rien ajouter au transcript.
        let normal = parse_message(
            &mut state,
            &json!({"type":"system","subtype":"post_turn_summary","status_category":"completed"}),
        );
        assert!(normal.is_empty());
    }

    /// Verbe de rédaction (spike 2026-08-21, GO Claude) : `content_block_start`
    /// tool_use avec input VIDE émet un event éphémère `drafting` portant le
    /// nom de l'outil, BIEN AVANT le bloc `assistant` complet (~780 ms). Le
    /// vrai `tool_update` running suit et remplace l'affichage.
    #[test]
    fn content_block_start_tool_use_emet_le_verbe_de_redaction() {
        let mut state = ClaudeStreamState::default();
        // 1. Le signal amont : nom connu, input vide.
        let start = parse_message(
            &mut state,
            &json!({"type":"stream_event","event":{
                "type":"content_block_start",
                "content_block":{"type":"tool_use","id":"toolu_01","name":"Bash","input":{}}}}),
        );
        assert_eq!(start.len(), 1);
        assert_eq!(start[0]["kind"], "drafting");
        assert_eq!(start[0]["tool"], "Bash");
        assert_eq!(state.drafting_tool.as_deref(), Some("Bash"));

        // 2. Un content_block_start NON-tool (texte) n'émet rien.
        let text_start = parse_message(
            &mut state,
            &json!({"type":"stream_event","event":{
                "type":"content_block_start",
                "content_block":{"type":"text","text":""}}}),
        );
        assert!(text_start.iter().all(|e| e["kind"] != "drafting"));

        // 3. Les deltas d'arguments ne re-émettent PAS le drafting.
        let delta = parse_message(
            &mut state,
            &json!({"type":"stream_event","event":{
                "type":"content_block_delta",
                "delta":{"type":"input_json_delta","partial_json":"{\"command\""}}}),
        );
        assert!(delta.iter().all(|e| e["kind"] != "drafting"));

        // 4. Le bloc assistant COMPLET arrive : le tool_update running est
        // émis, le drafting ne survit pas comme état d'affichage.
        let full = parse_message(
            &mut state,
            &json!({"type":"assistant","message":{
                "content":[{"type":"tool_use","id":"toolu_01","name":"Bash",
                    "input":{"command":"echo bonjour > hello.txt"}}]}}),
        );
        assert!(
            full.iter()
                .any(|e| e["kind"] == "tool_update" && e["status"] == "running"),
            "le bloc complet doit émettre le tool_update running: {full:?}"
        );
        assert!(full.iter().all(|e| e["kind"] != "drafting"));
        assert_eq!(state.drafting_tool, None);
    }

    /// Les hooks tournent invisiblement (69 chez Thierry) : ils occupent
    /// Le trou visible du tour (13-55 s mesurés, 2026-08-24) est l'attente
    /// du modèle après `status: requesting` : sans note, le chrono tourne nu
    /// et le fil paraît bloqué. L'init et le statut occupent l'attente ; le
    /// début du stream efface la note (sinon « en attente du modèle » resterait
    /// pendant que le texte coule).
    #[test]
    fn linit_et_le_statut_requesting_occupent_lattente() {
        let mut state = ClaudeStreamState::default();
        let init = parse_message(
            &mut state,
            &json!({"type":"system","subtype":"init","session_id":"0199aaaa-bbbb-4ccc-8ddd-eeeeffff0000"}),
        );
        assert!(init
            .iter()
            .any(|v| v["kind"] == "heartbeat" && v["note"] == "session chargée"));

        let req = parse_message(
            &mut state,
            &json!({"type":"system","subtype":"status","status":"requesting"}),
        );
        assert!(req
            .iter()
            .any(|v| v["kind"] == "heartbeat" && v["note"] == "en attente du modèle…"));

        // Un autre statut ne fabrique PAS de note.
        let autre = parse_message(
            &mut state,
            &json!({"type":"system","subtype":"status","status":"idle"}),
        );
        assert!(autre.iter().all(|v| v["kind"] != "heartbeat"));

        // Le stream démarre : la note d'attente s'efface (note vide → le
        // frontend remet liveNotes à null).
        let start = parse_message(
            &mut state,
            &json!({"type":"stream_event","event":{"type":"message_start","message":{}}}),
        );
        assert!(start
            .iter()
            .any(|v| v["kind"] == "heartbeat" && v["note"] == ""));
    }

    /// l'attente, comme le démarrage MCP de Grok.
    #[test]
    fn les_hooks_occupent_lattente() {
        let mut state = ClaudeStreamState::default();
        let note = parse_message(
            &mut state,
            &json!({"type":"system","subtype":"hook_started","hook_event_name":"pre_tool_use"}),
        );
        assert_eq!(note[0]["kind"], "heartbeat");
        assert_eq!(note[0]["note"], "hook pre_tool_use");

        // Sans nom, pas de note vide dans le fil.
        assert!(parse_message(
            &mut state,
            &json!({"type":"system","subtype":"hook_started"})
        )
        .is_empty());
    }

    #[test]
    fn parses_init_and_text_and_result() {
        let mut st = ClaudeStreamState::default();
        let e1 = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"init","session_id":"abc-123"}"#,
        );
        // L'init émet désormais la note « session chargée » (occupation de
        // l'attente) — plus d'événement durable pour autant.
        assert!(e1.iter().all(|v| v["kind"] == "heartbeat"));
        assert_eq!(st.session_id.as_deref(), Some("abc-123"));

        let e2 = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}"#,
        );
        assert_eq!(e2[0]["kind"], "text");
        assert_eq!(e2[0]["text"], "hi");

        let e3 = parse_line(
            &mut st,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"hi","session_id":"abc-123","usage":{"input_tokens":10,"output_tokens":2},"num_turns":1}"#,
        );
        assert_eq!(e3[0]["kind"], "done");
        assert_eq!(e3[0]["ok"], true);
        assert!(st.saw_terminal);
    }

    #[test]
    fn tool_use_and_result() {
        let mut st = ClaudeStreamState::default();
        let e1 = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]}}"#,
        );
        assert_eq!(e1[0]["kind"], "tool_update");
        assert_eq!(e1[0]["status"], "running");
        assert_eq!(e1[0]["detail"], "ls");

        let e2 = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"a\nb"}]}}"#,
        );
        assert_eq!(e2[0]["status"], "completed");
        assert_eq!(e2[0]["output"], "a\nb");
    }

    #[test]
    fn stream_delta() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}}"#,
        );
        assert_eq!(e[0]["kind"], "delta");
        assert_eq!(e[0]["text"], "Hel");
    }

    #[test]
    fn bash_description_takes_precedence_over_command() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"python3 -c 'import statsmodels'","description":"Checked Python imports availability"}}]}}"#,
        );
        assert_eq!(e[0]["detail"], "Checked Python imports availability");

        let mut st2 = ClaudeStreamState::default();
        let e2 = parse_line(
            &mut st2,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Bash","input":{"command":"ls","description":""}}]}}"#,
        );
        assert_eq!(
            e2[0]["detail"], "ls",
            "description vide → fallback commande"
        );
    }

    #[test]
    fn todowrite_becomes_todos_event_without_tool_line() {
        let mut st = ClaudeStreamState::default();
        let e1 = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"TodoWrite","input":{"todos":[{"content":"Lire","status":"completed"},{"content":"Corriger","status":"in_progress"},{"content":"Tester","status":"pending"}]}}]}}"#,
        );
        assert!(e1.is_empty(), "pas de ligne d'outil pour TodoWrite");
        let e2 = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"Todos modified"}]}}"#,
        );
        assert_eq!(e2.len(), 1);
        assert_eq!(e2[0]["kind"], "todos");
        assert_eq!(
            e2[0]["items"],
            serde_json::json!([
                {"text":"Lire","completed":true},
                {"text":"Corriger","completed":false,"active":true},
                {"text":"Tester","completed":false}
            ])
        );
    }

    #[test]
    fn todowrite_failed_or_interrupted_stays_silent() {
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"TodoWrite","input":{"todos":[{"content":"X","status":"pending"}]}}]}}"#,
        );
        let failed = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"denied","is_error":true}]}}"#,
        );
        assert!(failed.is_empty(), "échec : ni todos ni ligne d'outil");

        parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"TodoWrite","input":{"todos":[{"content":"Y","status":"pending"}]}}]}}"#,
        );
        let mut out = Vec::new();
        flush_pending(&mut st, &mut out);
        assert!(out.is_empty(), "pas de ligne interrupted fantôme");
    }

    #[test]
    fn edit_event_carries_snippets_for_immediate_diff() {
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Edit","input":{"file_path":"/p/a.py","old_string":"x = 1","new_string":"x = 2"}}]}}"#,
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}"#,
        );
        assert_eq!(e[1]["kind"], "edit");
        assert_eq!(e[1]["files"], serde_json::json!(["/p/a.py"]));
        assert_eq!(
            e[1]["snippets"]["/p/a.py"],
            serde_json::json!({"oldText":"x = 1","newText":"x = 2"})
        );
    }

    #[test]
    fn write_snippet_only_for_new_files_and_bounded() {
        // fichier NOUVEAU → snippet newText
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"/p/inexistant.py","content":"print(1)\n"}}]}}"#,
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"ok"}]}}"#,
        );
        assert_eq!(
            e[1]["snippets"]["/p/inexistant.py"],
            serde_json::json!({"newText":"print(1)\n"})
        );

        // fichier EXISTANT → pas de snippet (le diff git dit vrai, pas l'input)
        let mut st2 = ClaudeStreamState::default();
        parse_line(
            &mut st2,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Write","input":{"file_path":"/etc/hosts","content":"x"}}]}}"#,
        );
        let e2 = parse_line(
            &mut st2,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":"ok"}]}}"#,
        );
        assert_eq!(e2[1]["kind"], "edit");
        assert!(e2[1].get("snippets").is_none());

        // Edit volumineux (> 24 KiB) → pas de snippet, l'edit reste émis
        let mut st3 = ClaudeStreamState::default();
        let big = "z".repeat(30 * 1024);
        let line = format!(
            r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","id":"t3","name":"Edit","input":{{"file_path":"/p/gros.py","old_string":"a","new_string":"{big}"}}}}]}}}}"#
        );
        parse_line(&mut st3, &line);
        let e3 = parse_line(
            &mut st3,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t3","content":"ok"}]}}"#,
        );
        assert_eq!(e3[1]["kind"], "edit");
        assert!(e3[1].get("snippets").is_none());
    }

    #[test]
    fn ticker_uses_message_delta_truth_and_char_estimates() {
        let mut st = ClaudeStreamState::default();
        // 200 chars streamés → estimation 50 tokens ≥ seuil 24 → heartbeat
        let line = format!(
            r#"{{"type":"stream_event","event":{{"type":"content_block_delta","delta":{{"type":"text_delta","text":"{}"}}}}}}"#,
            "x".repeat(200)
        );
        let e = parse_line(&mut st, &line);
        assert!(e
            .iter()
            .any(|v| v["kind"] == "heartbeat" && v["tokens"] == serde_json::json!(50)));

        // message_delta = seule vérité du CLI pour le message courant
        let e2 = parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"message_delta","delta":{},"usage":{"output_tokens":120}}}"#,
        );
        assert!(e2
            .iter()
            .any(|v| v["kind"] == "heartbeat" && v["tokens"] == serde_json::json!(120)));

        // fin de message → cumul ; message suivant repart au-dessus
        parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"message_stop"}}"#,
        );
        let e3 = parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"message_delta","delta":{},"usage":{"output_tokens":30}}}"#,
        );
        assert!(e3
            .iter()
            .any(|v| v["kind"] == "heartbeat" && v["tokens"] == serde_json::json!(150)));

        // les lignes assistant portent un output_tokens placeholder : ignorées
        let e4 = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"usage":{"output_tokens":2},"content":[]}}"#,
        );
        assert!(e4.iter().all(|v| v["kind"] != "heartbeat"));

        // result → le ticker repart à zéro
        parse_line(
            &mut st,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"fin","usage":{}}"#,
        );
        assert_eq!(st.completed_output_tokens, 0);
        assert_eq!(st.last_beat_tokens, 0);
    }

    /// CLI ≥2.1.8 caviarde le thinking en stream-json : les thinking_delta
    /// arrivent avec `"thinking":""`. Le parseur ignorait ce vide en silence ;
    /// il doit maintenant émettre une progression (count croissant) pour que
    /// l'UI montre que la réflexion avance, sans jamais rejouer "thinking"
    /// ni "thinking_delta" tant que le vrai texte ne revient pas.
    #[test]
    fn thinking_delta_vide_emet_une_progression_croissante() {
        let mut st = ClaudeStreamState::default();
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":""}}}"#;

        let e1 = parse_line(&mut st, line);
        assert!(e1
            .iter()
            .any(|v| v["kind"] == "thinking_progress" && v["count"] == serde_json::json!(1)));
        assert!(!e1
            .iter()
            .any(|v| v["kind"] == "thinking" || v["kind"] == "thinking_delta"));

        let e2 = parse_line(&mut st, line);
        assert!(e2
            .iter()
            .any(|v| v["kind"] == "thinking_progress" && v["count"] == serde_json::json!(2)));

        let e3 = parse_line(&mut st, line);
        assert!(e3
            .iter()
            .any(|v| v["kind"] == "thinking_progress" && v["count"] == serde_json::json!(3)));
        assert!(!e3
            .iter()
            .any(|v| v["kind"] == "thinking" || v["kind"] == "thinking_delta"));
    }

    /// Si le CLI rétablit le vrai texte, le flux normal reprend seul : aucune
    /// progression ne doit s'ajouter à côté d'un thinking_delta non vide.
    #[test]
    fn thinking_delta_non_vide_najoute_pas_de_progression() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"réfléchit"}}}"#,
        );
        assert!(e
            .iter()
            .any(|v| v["kind"] == "thinking_delta" && v["text"] == "réfléchit"));
        assert!(!e.iter().any(|v| v["kind"] == "thinking_progress"));
    }

    #[test]
    fn auth_failure_result() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"result","subtype":"success","is_error":true,"result":"Not logged in · Please run /login","session_id":"x","usage":{}}"#,
        );
        assert_eq!(e[0]["kind"], "done");
        assert_eq!(e[0]["ok"], false);
    }

    /// Audit 2026-09-04 : sur `subtype != success` (ex. `--resume` d'un
    /// session_id périmé), le CLI 2.1.261 met le vrai message dans `errors[]`
    /// et n'envoie PAS de `result` — l'utilisateur ne voyait que « claude
    /// error ».
    #[test]
    fn le_message_derreur_vient_du_tableau_errors() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["No conversation found with session ID: 0000","second"],"session_id":"x","usage":{}}"#,
        );
        assert_eq!(e[0]["kind"], "error");
        assert_eq!(
            e[0]["message"],
            "No conversation found with session ID: 0000 — second"
        );
    }

    /// Sans `errors[]` ni `result`, le repli reste le message générique.
    #[test]
    fn sans_errors_ni_result_le_repli_generique_tient() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"result","subtype":"error_max_turns","is_error":true,"session_id":"x","usage":{}}"#,
        );
        assert_eq!(e[0]["kind"], "error");
        assert_eq!(e[0]["message"], "claude error");
    }

    // ---- Phase A : signaux natifs inexploités ------------------------------

    /// `system.task_summary` → pseudo-outil `__thinking-step`, façon Codex
    /// summaryTextDelta. `detail` null/vide ignoré, jamais répété d'affilée.
    #[test]
    fn task_summary_devient_un_thinking_step_dedupe() {
        let mut st = ClaudeStreamState::default();
        let e1 = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_summary","detail":"Simple test agent","session_id":"s"}"#,
        );
        assert_eq!(e1.len(), 1);
        assert_eq!(e1[0]["kind"], "tool");
        assert_eq!(e1[0]["name"], "__thinking-step");
        assert_eq!(e1[0]["detail"], "Simple test agent");

        // Même détail répété : silence.
        let e2 = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_summary","detail":"Simple test agent","session_id":"s"}"#,
        );
        assert!(e2.is_empty(), "le même détail ne se répète pas");

        // `detail: null` : ignoré.
        let e3 = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_summary","detail":null,"session_id":"s"}"#,
        );
        assert!(e3.is_empty());

        // Un détail différent redevient audible.
        let e4 = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_summary","detail":"Autre étape","session_id":"s"}"#,
        );
        assert_eq!(e4[0]["detail"], "Autre étape");
    }

    /// `system.thinking_tokens` alimente le ticker au même titre que les
    /// deltas de texte — même quand le message courant n'a encore streamé
    /// aucun caractère.
    #[test]
    fn thinking_tokens_alimente_le_ticker() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"thinking_tokens","estimated_tokens":150,"estimated_tokens_delta":100,"session_id":"s"}"#,
        );
        assert_eq!(e.len(), 1);
        assert_eq!(e[0]["kind"], "heartbeat");
        assert_eq!(e[0]["tokens"], 150);
        assert_eq!(st.current_msg_thinking_tokens, 150);

        // message_stop remet le compteur à zéro comme les autres current_msg_*.
        parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"message_stop"}}"#,
        );
        assert_eq!(st.current_msg_thinking_tokens, 0);
    }

    /// `system.permission_denied` : note immédiate + le refus sert d'output
    /// de repli si le tool_result revient vide (cas vu à la sonde).
    #[test]
    fn permission_denied_note_et_output_de_repli() {
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"rm -rf /tmp/x"}}]}}"#,
        );
        let note = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"permission_denied","tool_name":"Bash","tool_use_id":"toolu_1","message":"L'utilisateur a refusé Bash","session_id":"s"}"#,
        );
        assert_eq!(note.len(), 1);
        assert_eq!(note[0]["kind"], "heartbeat");
        assert_eq!(note[0]["note"], "Permission refusée — Bash");

        // tool_result vide → l'output devient le message de refus.
        let e = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"","is_error":true}]}}"#,
        );
        assert_eq!(e[0]["status"], "failed");
        assert_eq!(e[0]["output"], "L'utilisateur a refusé Bash");
    }

    /// Sans tool en attente pour l'id refusé, la note sort quand même seule.
    #[test]
    fn permission_denied_sans_tool_en_attente_note_seule() {
        let mut st = ClaudeStreamState::default();
        let note = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"permission_denied","tool_name":"Write","tool_use_id":"toolu_inconnu","message":"non","session_id":"s"}"#,
        );
        assert_eq!(note.len(), 1);
        assert_eq!(note[0]["kind"], "heartbeat");
        assert_eq!(note[0]["note"], "Permission refusée — Write");
    }

    /// Une sortie de tool_result NON vide garde la priorité sur le refus.
    #[test]
    fn permission_denied_naffecte_pas_une_sortie_non_vide() {
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_2","name":"Bash","input":{"command":"ls"}}]}}"#,
        );
        parse_line(
            &mut st,
            r#"{"type":"system","subtype":"permission_denied","tool_name":"Bash","tool_use_id":"toolu_2","message":"refus","session_id":"s"}"#,
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_2","content":"a.txt"}]}}"#,
        );
        assert_eq!(e[0]["output"], "a.txt");
    }

    /// Chaque message assistant dont le contexte avance émet un `usage`
    /// éphémère — la barre de contexte en direct, indépendante du `result`
    /// final qui ne connaît le vrai output_tokens qu'à la fin du tour.
    #[test]
    fn chaque_message_assistant_alimente_lusage_ephemere() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"usage":{"input_tokens":500,"cache_read_input_tokens":200},"content":[{"type":"text","text":"bonjour"}]}}"#,
        );
        let usage_ev = e
            .iter()
            .find(|v| v["kind"] == "usage")
            .expect("un événement usage éphémère attendu");
        assert_eq!(usage_ev["usage"]["context"], 700);
        assert_eq!(usage_ev["usage"]["cost"], serde_json::Value::Null);
        assert_eq!(usage_ev["usage"]["turns"], serde_json::Value::Null);
        assert_eq!(usage_ev["__ephemeral"], true);

        // ctx == 0 (pas de bloc usage) : aucun événement usage.
        let mut st2 = ClaudeStreamState::default();
        let e2 = parse_line(
            &mut st2,
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"x"}]}}"#,
        );
        assert!(e2.iter().all(|v| v["kind"] != "usage"));
    }

    /// `result.duration_api_ms` (préféré à `duration_ms`) et
    /// `permission_denials[]` (compte) enrichissent `done.usage`.
    #[test]
    fn le_result_final_porte_duree_et_refus_dans_lusage() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"fini",
                "duration_ms":9000,"duration_api_ms":7200,
                "permission_denials":[{"tool_name":"Bash"},{"tool_name":"Write"}],
                "usage":{"input_tokens":10,"output_tokens":5},"num_turns":1}"#,
        );
        assert_eq!(e[0]["kind"], "done");
        assert_eq!(e[0]["usage"]["durationMs"], 7200);
        assert_eq!(e[0]["usage"]["permissionDenials"], 2);

        // Sans duration_api_ms : repli sur duration_ms.
        let mut st2 = ClaudeStreamState::default();
        let e2 = parse_line(
            &mut st2,
            r#"{"type":"result","subtype":"success","is_error":false,"result":"fini",
                "duration_ms":9000,"usage":{}}"#,
        );
        assert_eq!(e2[0]["usage"]["durationMs"], 9000);
        assert!(e2[0]["usage"].get("permissionDenials").is_none());
    }

    // ---- Phase C : cycle de vie natif des sous-agents ----------------------

    /// Scénario complet : `task_started` → tool_use enfant (message avec
    /// `parent_tool_use_id`) → `task_updated` → `task_notification`. Vérifie
    /// ids stables, `receiverThreadIds`, `agentsStates`, `agentPath`, et
    /// l'absence totale de delta/text pour les messages enfants.
    #[test]
    fn scenario_complet_de_sous_agent() {
        let mut st = ClaudeStreamState::default();

        // 1. task_started : lie tool_use_id parent → task_id, ouvre l'agent.
        let started = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_started","task_id":"a927b98e",
                "tool_use_id":"toolu_015k","description":"Simple test agent",
                "subagent_type":"Explore","is_backgrounded":true,"spawn_depth":1,
                "task_type":"local_agent","prompt":"Respond with exactly: pong",
                "session_id":"s"}"#,
        );
        assert_eq!(started.len(), 1);
        assert_eq!(started[0]["kind"], "tool_update");
        assert_eq!(started[0]["id"], "subagent:a927b98e");
        assert_eq!(started[0]["name"], "agent:activity");
        assert_eq!(started[0]["status"], "inProgress");
        assert_eq!(started[0]["source"], "claude");
        assert_eq!(started[0]["detail"], "Simple test agent");
        let act = &started[0]["agentActivity"];
        assert_eq!(act["tool"], "activity");
        assert_eq!(act["receiverThreadIds"], serde_json::json!(["a927b98e"]));
        assert_eq!(act["agentThreadId"], "a927b98e");
        assert_eq!(act["agentPath"], "Explore");
        assert_eq!(act["activityKind"], "started");
        assert_eq!(act["prompt"], "Respond with exactly: pong");
        assert_eq!(act["agentsStates"]["a927b98e"]["status"], "running");
        assert_eq!(
            act["agentsStates"]["a927b98e"]["message"],
            "Simple test agent"
        );
        assert_eq!(
            st.task_id_by_tool_use_id.get("toolu_015k"),
            Some(&"a927b98e".to_string())
        );

        // 2. Un stream_event portant `parent_tool_use_id` (message du
        // sous-agent) ne doit produire STRICTEMENT rien dans le fil principal.
        let child_stream = parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{"type":"content_block_delta",
                "delta":{"type":"text_delta","text":"ne doit jamais apparaître"}},
                "session_id":"s","parent_tool_use_id":"toolu_015k"}"#,
        );
        assert!(
            child_stream.is_empty(),
            "aucun delta pour un message enfant"
        );

        // 3. Un message `assistant` enfant avec du texte : pas de "text"/
        // "thinking", seul son tool_use produit une mise à jour éphémère.
        let child_text = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[
                {"type":"text","text":"je réfléchis"},
                {"type":"thinking","thinking":"plan interne"}
            ]},"session_id":"s","parent_tool_use_id":"toolu_015k"}"#,
        );
        assert!(
            child_text
                .iter()
                .all(|v| v["kind"] != "text" && v["kind"] != "thinking"),
            "un message enfant ne doit jamais alimenter le fil principal: {child_text:?}"
        );

        let child_tool = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[
                {"type":"tool_use","id":"toolu_child1","name":"Read",
                 "input":{"file_path":"src/x.rs"}}
            ]},"session_id":"s","parent_tool_use_id":"toolu_015k"}"#,
        );
        assert_eq!(child_tool.len(), 1);
        assert_eq!(child_tool[0]["kind"], "tool_update");
        assert_eq!(child_tool[0]["id"], "subagent:a927b98e");
        assert_eq!(child_tool[0]["__ephemeral"], true);
        assert_eq!(
            child_tool[0]["agentActivity"]["agentsStates"]["a927b98e"]["message"],
            "src/x.rs"
        );
        assert_eq!(child_tool[0]["agentActivity"]["activityKind"], "interacted");
        assert!(
            !st.pending_tools.contains_key("toolu_child1"),
            "le tool_use enfant ne doit jamais rejoindre pending_tools"
        );

        // 4. Le tool_result de cet outil enfant ne produit AUCUNE ligne
        // (ni tool_update "unknown", ni rien d'autre).
        let child_result = parse_line(
            &mut st,
            r#"{"type":"user","message":{"content":[
                {"type":"tool_result","tool_use_id":"toolu_child1","content":"contenu du fichier"}
            ]},"session_id":"s","parent_tool_use_id":"toolu_015k"}"#,
        );
        assert!(
            child_result.is_empty(),
            "le tool_result d'un enfant ne produit rien: {child_result:?}"
        );

        // 5. task_updated : statut terminal → agentsStates + tool status.
        let updated = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_updated","task_id":"a927b98e",
                "patch":{"status":"completed","end_time":1788557712978},"session_id":"s"}"#,
        );
        assert_eq!(updated[0]["id"], "subagent:a927b98e");
        assert_eq!(updated[0]["status"], "completed");
        assert_eq!(
            updated[0]["agentActivity"]["agentsStates"]["a927b98e"]["status"],
            "completed"
        );

        // 6. task_notification : résumé tronqué + détail formaté + statut.
        let notif = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_notification","task_id":"a927b98e",
                "tool_use_id":"toolu_015k","status":"completed",
                "output_file":"/tmp/a927b98e.output","summary":"pong",
                "usage":{"total_tokens":13615,"tool_uses":2,"duration_ms":1100},
                "session_id":"s"}"#,
        );
        assert_eq!(notif[0]["id"], "subagent:a927b98e");
        assert_eq!(notif[0]["status"], "completed");
        assert_eq!(
            notif[0]["agentActivity"]["agentsStates"]["a927b98e"]["message"],
            "pong"
        );
        assert_eq!(notif[0]["detail"], "13,6k tokens · 2 outils · 1,1 s");

        // 7. `background_tasks_changed` : ignoré.
        let ignored = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"background_tasks_changed","tasks":[]}"#,
        );
        assert!(ignored.is_empty());
    }

    /// Un `task_updated` échoué reste `agentsStates.status = "failed"`, mais
    /// le plan ne distingue pas "failed" au niveau du statut de l'outil lui
    /// -même sur cette branche (seul task_notification le fait) : "completed"
    /// dès que le statut est terminal.
    #[test]
    fn task_updated_echoue_reste_terminal_cote_outil() {
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_started","task_id":"t1",
                "tool_use_id":"tu1","description":"x","subagent_type":"Explore",
                "session_id":"s"}"#,
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_updated","task_id":"t1",
                "patch":{"status":"failed"},"session_id":"s"}"#,
        );
        assert_eq!(e[0]["status"], "completed");
        assert_eq!(
            e[0]["agentActivity"]["agentsStates"]["t1"]["status"],
            "failed"
        );
    }

    /// `task_notification` en échec → statut de l'outil "failed".
    #[test]
    fn task_notification_echouee_status_failed() {
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_started","task_id":"t2",
                "tool_use_id":"tu2","description":"x","subagent_type":"Explore",
                "session_id":"s"}"#,
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_notification","task_id":"t2",
                "status":"failed","summary":"boom","usage":{},"session_id":"s"}"#,
        );
        assert_eq!(e[0]["status"], "failed");
    }

    /// Un tool_use enfant dont le `parent_tool_use_id` ne correspond à
    /// AUCUN `task_started` connu (ordre de livraison, sonde incomplète)
    /// ne doit rien produire — pas de crash, pas d'id `subagent:unknown`.
    #[test]
    fn tool_use_enfant_sans_task_started_connu_ne_produit_rien() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[
                {"type":"tool_use","id":"toolu_x","name":"Bash","input":{"command":"ls"}}
            ]},"session_id":"s","parent_tool_use_id":"toolu_inconnu"}"#,
        );
        assert!(e.is_empty());
    }

    /// `stream_event` d'annonce ("event": nested) portant `parent_tool_use_id`
    /// est bien coupé même s'il s'agit d'un `content_block_start` tool_use
    /// (drafting) — jamais de verbe de rédaction pour un enfant.
    #[test]
    fn drafting_dun_enfant_est_coupe() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"stream_event","event":{
                "type":"content_block_start",
                "content_block":{"type":"tool_use","id":"toolu_y","name":"Bash","input":{}}},
                "session_id":"s","parent_tool_use_id":"toolu_015k"}"#,
        );
        assert!(e.is_empty());
        assert_eq!(st.drafting_tool, None);
    }
}
