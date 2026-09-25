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
    /// Outil de la liste de tâches (TaskCreate/TaskUpdate…) : jamais de
    /// ligne d'outil, la liste complète devient l'événement `todos`.
    pub task_op: Option<TaskOp>,
}

/// Opération sur la liste de tâches du CLI (≥ 2.1.2xx : TaskCreate et
/// TaskUpdate ont remplacé TodoWrite). Le terminal ne montre pas ces appels :
/// il affiche la liste elle-même sous le spinner (◻ à faire, ◼ en cours,
/// ✔ terminée).
#[derive(Debug, Clone)]
pub enum TaskOp {
    Create {
        subject: String,
    },
    Update {
        id: String,
        status: Option<String>,
        subject: Option<String>,
    },
    /// TaskList / TaskGet : lecture, rien ne change.
    Read,
}

/// Une tâche de la liste du CLI, telle qu'Atelier la montre.
#[derive(Debug, Clone, Default)]
pub struct SubagentMeta {
    pub agent_path: Value,
    pub prompt: Value,
    /// Dernière activité connue (verbe d'outil, résumé ou description).
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TaskEntry {
    pub id: String,
    pub subject: String,
    pub status: String,
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
    /// Identité de chaque sous-agent (`task_started`) : le frontend remplace
    /// l'item `subagent:<id>` à chaque mise à jour, qui doit donc la reporter
    /// sans quoi l'agent perdait son nom et sa mission en fin de course.
    pub subagents: std::collections::HashMap<String, SubagentMeta>,
    /// Tâches de fond vivantes (`system.background_tasks_changed`, liste
    /// complète à chaque changement) : Bash `run_in_background`, sous-agents,
    /// Monitor. Tant qu'il en reste, un `result` ne clôt pas la session — le
    /// CLI reprendra la main à leur fin, comme dans le terminal. Les tâches
    /// `ambient` (mémoire automatique, rêve, veilleurs) n'y comptent pas.
    pub background_tasks: usize,
    /// `uuid` des messages utilisateur que le CLI vient de prendre en compte
    /// (`--replay-user-messages`, `isReplay: true`). `claude.rs` les retire de
    /// ses envois en attente ; le parseur ne fait que les relever.
    pub replayed: Vec<String>,
    /// Un tour du CLI est en cours (requête partie, flux du modèle) : vrai du
    /// premier signe de tour jusqu'à son `result`.
    pub turn_active: bool,
    pub saw_terminal: bool,
    /// Liste de tâches connue de ce processus (TaskCreate/TaskUpdate). Le
    /// disque du CLI fait foi quand il est lisible (tâches des tours
    /// précédents comprises) ; cette copie sert de repli.
    pub tasks: Vec<TaskEntry>,
    /// Racine des listes de tâches du CLI (`~/.claude/tasks`). `None` =
    /// résolue depuis l'environnement ; les tests y mettent un dossier jetable.
    pub tasks_root: Option<std::path::PathBuf>,
    /// Hooks en cours (`hook_id`, nom) : la note du chrono nomme le dernier
    /// lancé et s'efface quand il n'en reste plus.
    pub running_hooks: Vec<(String, String)>,
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
    // Seul le fil principal compte : un sous-agent de fond parle aussi
    // (`parent_tool_use_id` non nul) sans que Claude ait repris la main.
    let fil_principal = msg
        .get("parent_tool_use_id")
        .and_then(|v| v.as_str())
        .is_none();
    if fil_principal && (ty == "assistant"
        || ty == "stream_event"
        || (ty == "system"
            && matches!(
                msg.get("subtype").and_then(|v| v.as_str()),
                Some("init" | "compact_boundary")
            ))
        || (ty == "system"
            && msg.get("subtype").and_then(|v| v.as_str()) == Some("status")
            && matches!(
                msg.get("status").and_then(|v| v.as_str()),
                Some("requesting" | "compacting")
            )))
    {
        state.turn_active = true;
    }

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
        // Compaction en cours : le terminal affiche « Compacting… ». Sur un
        // contexte de 1M elle dure, et le chrono nu passait pour un gel.
        if subtype == "status" && msg.get("status").and_then(|v| v.as_str()) == Some("compacting") {
            out.push(json!({"kind":"heartbeat","note":"compaction de la conversation…"}));
        }
        // Réessai de l'API (surcharge, limite de débit) : le terminal affiche
        // « Retrying in Ns · attempt n/m », le fil restait muet.
        if subtype == "api_retry" {
            let tentative = msg.get("attempt").and_then(|v| v.as_u64());
            let max = msg.get("max_retries").and_then(|v| v.as_u64());
            let delai = msg
                .get("retry_delay_ms")
                .and_then(|v| v.as_u64())
                .map(|ms| ms.div_ceil(1000));
            let cause = match msg.get("error_status").and_then(|v| v.as_u64()) {
                Some(429) => "limite de débit",
                Some(529) => "API surchargée",
                _ => "erreur de l'API",
            };
            let mut note = format!("{cause} — nouvel essai");
            if let (Some(n), Some(m)) = (tentative, max) {
                note.push_str(&format!(" {n}/{m}"));
            }
            if let Some(s) = delai {
                note.push_str(&format!(" dans {s} s"));
            }
            out.push(json!({"kind":"heartbeat","note": note}));
        }
        // Une tâche `ambient` n'est pas de l'activité selon le CLI lui-même
        // (« hosts should exclude them from activity indicators », 2.1.283) :
        // mémoire automatique, rêve, veilleurs. Le terminal ne l'attend pas,
        // le tour d'Atelier non plus.
        if subtype == "background_tasks_changed" {
            let activite = |t: &&Value| t.get("ambient").and_then(Value::as_bool) != Some(true);
            state.background_tasks = msg
                .get("tasks")
                .and_then(|v| v.as_array())
                .map_or(0, |taches| taches.iter().filter(activite).count());
        }
        // Les hooks tournent invisiblement — 69 chez Thierry. Comme le
        // terminal (« running PreToolUse hook »), ils occupent l'attente au
        // lieu de laisser croire que rien ne se passe ; la note s'efface
        // quand le dernier hook lancé a répondu.
        if subtype == "hook_started" || subtype == "hook_response" {
            let nom = msg
                .get("hook_name")
                .or_else(|| msg.get("hook_event_name"))
                .or_else(|| msg.get("hook"))
                .and_then(|v| v.as_str())
                .filter(|nom| !nom.is_empty())
                .map(str::to_string);
            let id = msg
                .get("hook_id")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            if subtype == "hook_started" {
                if let Some(nom) = nom.clone() {
                    if let Some(id) = id.clone() {
                        state.running_hooks.push((id, nom.clone()));
                    }
                    out.push(json!({"kind":"heartbeat", "note": format!("hook {nom}")}));
                }
            } else {
                let avant = state.running_hooks.len();
                if let Some(id) = id.as_deref() {
                    state.running_hooks.retain(|(h, _)| h != id);
                }
                if state.running_hooks.len() < avant {
                    let note = state
                        .running_hooks
                        .last()
                        .map(|(_, nom)| format!("hook {nom}"))
                        .unwrap_or_default();
                    out.push(json!({"kind":"heartbeat", "note": note}));
                }
                if let Some(avis) = hook_failure_notice(msg, nom.as_deref().unwrap_or("hook")) {
                    out.push(avis);
                }
            }
        }
        // Bannières du CLI : raison d'un message bloqué par un hook
        // UserPromptSubmit, retour de commande, suggestion… Le terminal les
        // affiche (en gris ou en évidence) ; `info` ne se voit qu'en mode
        // transcript, il reste donc muet ici aussi.
        if subtype == "informational" {
            let niveau = msg.get("level").and_then(|v| v.as_str()).unwrap_or("info");
            if niveau != "info" {
                if let Some(texte) = msg
                    .get("content")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|t| !t.is_empty())
                {
                    out.push(notice(texte, niveau == "warning"));
                }
            }
        }
        // Notifications de la boucle (coin de l'écran dans le terminal) :
        // les urgentes restent dans le fil, les autres passent par la note.
        // « Stop hook error occurred » double l'avis du hook, déjà montré.
        if subtype == "notification" {
            let cle = msg.get("key").and_then(|v| v.as_str()).unwrap_or("");
            if let Some(texte) = msg
                .get("text")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|t| !t.is_empty())
            {
                if cle != "stop-hook-error" {
                    let urgente = matches!(
                        msg.get("priority").and_then(|v| v.as_str()),
                        Some("high" | "immediate")
                    );
                    if urgente {
                        let alerte = matches!(
                            msg.get("color").and_then(|v| v.as_str()),
                            Some("error" | "warning")
                        );
                        out.push(notice(texte, alerte));
                    } else {
                        out.push(json!({"kind":"heartbeat","note": texte}));
                    }
                }
            }
        }
        // Bascule sur le modèle de repli (surcharge, modèle retiré…) : le
        // terminal le dit, sinon la réponse change de qualité sans raison.
        if subtype == "model_fallback" {
            let repli = msg
                .get("fallback_model")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let origine = msg
                .get("original_model")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if !repli.is_empty() {
                let texte = if origine.is_empty() {
                    format!("Ce tour passe sur le modèle de repli {repli}.")
                } else {
                    format!("Ce tour passe sur le modèle de repli {repli} au lieu de {origine}.")
                };
                out.push(notice(&texte, true));
            }
        }
        // Mémoire automatique écrite (« Saved 2 memories » dans le terminal).
        if subtype == "memory_saved" {
            let n = msg
                .get("written_paths")
                .and_then(|v| v.as_array())
                .map_or(0, Vec::len);
            if n > 0 {
                let texte = if n == 1 {
                    "Mémoire enregistrée (1 fichier).".to_string()
                } else {
                    format!("Mémoire enregistrée ({n} fichiers).")
                };
                out.push(notice(&texte, false));
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
                state.subagents.insert(
                    task_id.clone(),
                    SubagentMeta {
                        agent_path: msg.get("subagent_type").cloned().unwrap_or(Value::Null),
                        prompt: msg.get("prompt").cloned().unwrap_or(Value::Null),
                        message: description.map(str::to_string),
                    },
                );
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
        // Avancement d'un sous-agent : ce qu'il fait (« Reading a.txt » ou
        // le résumé du modèle) et ses compteurs — le terminal les montre sur
        // la rangée de l'agent (« 4s · ↓ 17.1k tokens »). Éphémère : seul
        // le dernier état compte.
        if subtype == "task_progress" {
            if let Some(task_id) = msg
                .get("task_id")
                .and_then(|v| v.as_str())
                .map(str::to_string)
            {
                if let Some(tool_use_id) = msg.get("tool_use_id").and_then(|v| v.as_str()) {
                    state
                        .task_id_by_tool_use_id
                        .entry(tool_use_id.to_string())
                        .or_insert_with(|| task_id.clone());
                }
                // Le résumé du modèle (option agentProgressSummaries) prime ;
                // sinon le verbe d'outil déjà noté par le message enfant, en
                // français, plutôt que la description anglaise du CLI.
                let resume = msg
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(|s| truncate_chars(s, 200));
                let meta = state.subagents.entry(task_id.clone()).or_default();
                if resume.is_some() {
                    meta.message = resume;
                } else if meta.message.is_none() {
                    meta.message = msg
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(|s| truncate_chars(s.trim(), 200));
                }
                let message = meta.message.clone();
                let detail = msg.get("usage").and_then(task_notification_detail);
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
                with_subagent_identity(state, &task_id, &mut activity);
                out.push(subagent_event(
                    &task_id,
                    "inProgress",
                    detail.map(|d| json!(d)),
                    true,
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
                // En cours de route, l'activité connue reste affichée.
                let message = if is_subagent_terminal(&status) {
                    None
                } else {
                    state
                        .subagents
                        .get(&task_id)
                        .and_then(|m| m.message.clone())
                };
                let mut agents_states = serde_json::Map::new();
                agents_states.insert(
                    task_id.clone(),
                    json!({"status": status, "message": message}),
                );
                let mut activity = serde_json::Map::new();
                activity.insert("tool".into(), json!("activity"));
                activity.insert("receiverThreadIds".into(), json!([task_id.clone()]));
                activity.insert("agentsStates".into(), Value::Object(agents_states));
                activity.insert("agentThreadId".into(), json!(task_id.clone()));
                activity.insert("activityKind".into(), json!("updated"));
                with_subagent_identity(state, &task_id, &mut activity);
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
                // Le rapport ENTIER du sous-agent : c'est ce que le panneau
                // de l'agent affiche (en Markdown), comme ctrl+o dans le
                // terminal. Coupé à 200 signes, il s'arrêtait en pleine phrase.
                let summary = msg
                    .get("summary")
                    .and_then(|v| v.as_str())
                    .map(|s| truncate_chars(s, SUBAGENT_REPORT_MAX));
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
                with_subagent_identity(state, &task_id, &mut activity);
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
                        state.subagents.entry(task_id.clone()).or_default().message =
                            Some(message.clone());
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
                        with_subagent_identity(state, &task_id, &mut activity);
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
                                task_op: None,
                            },
                        );
                        continue;
                    }
                    // Liste de tâches (TaskCreate/TaskUpdate, CLI ≥ 2.1.2xx) et
                    // chargement de schémas d'outils (ToolSearch) : de la
                    // plomberie que le terminal ne montre jamais comme ligne
                    // d'outil. La liste, elle, devient l'événement `todos`.
                    let task_op = match name.as_str() {
                        "TaskCreate" => Some(TaskOp::Create {
                            subject: input
                                .get("subject")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_string(),
                        }),
                        "TaskUpdate" => Some(TaskOp::Update {
                            id: json_id(input.get("taskId")),
                            status: input
                                .get("status")
                                .and_then(|v| v.as_str())
                                .map(str::to_string),
                            subject: input
                                .get("subject")
                                .and_then(|v| v.as_str())
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty()),
                        }),
                        "TaskList" | "TaskGet" => Some(TaskOp::Read),
                        _ => None,
                    };
                    if task_op.is_some() || name == "ToolSearch" {
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
                                todos_items: None,
                                started_at_ms: now_ms(),
                                denial_message: None,
                                task_op,
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
                        // Fichier existant : son contenu est lu MAINTENANT, avant
                        // l'exécution de l'outil (le bloc `assistant` la précède
                        // toujours) — l'avant/après s'affiche comme dans le
                        // terminal, y compris hors dépôt git.
                        let new_text =
                            input.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        match edit_path.as_deref() {
                            _ if new_text.len() > SNIPPET_MAX => None,
                            Some(p) if !std::path::Path::new(p).exists() => {
                                (!new_text.is_empty()).then(|| json!({"newText": new_text}))
                            }
                            Some(p) => std::fs::metadata(p)
                                .ok()
                                .filter(|m| m.is_file() && m.len() as usize <= SNIPPET_MAX)
                                .and_then(|_| std::fs::read_to_string(p).ok())
                                .map(|old_text| json!({"oldText": old_text, "newText": new_text})),
                            None => None,
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
                        task_op: None,
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
        // Accusé de prise en compte d'un message écrit sur stdin
        // (`--replay-user-messages`) : ce n'est pas un nouvel événement de fil
        // — le message utilisateur y est déjà.
        if msg.get("isReplay").and_then(Value::as_bool) == Some(true) {
            if let Some(uuid) = msg.get("uuid").and_then(Value::as_str) {
                state.replayed.push(uuid.to_string());
            }
            return out;
        }
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
                            // TaskCreate/TaskUpdate : la liste ENTIÈRE, à jour.
                            if let Some(op) = pt.task_op {
                                if !matches!(op, TaskOp::Read) {
                                    apply_task_op(state, op, &output, msg.get("tool_use_result"));
                                    if let Some(items) = task_list_items(state) {
                                        out.push(json!({"kind":"todos","items": items}));
                                    }
                                }
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
        state.turn_active = false;
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
/// Reporte le type d'agent et sa mission sur une mise à jour (voir
/// `ClaudeStreamState::subagents`).
fn with_subagent_identity(
    state: &ClaudeStreamState,
    task_id: &str,
    activity: &mut serde_json::Map<String, Value>,
) {
    if let Some(meta) = state.subagents.get(task_id) {
        if !meta.agent_path.is_null() {
            activity.insert("agentPath".into(), meta.agent_path.clone());
        }
        if !meta.prompt.is_null() {
            activity.insert("prompt".into(), meta.prompt.clone());
        }
    }
}

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

/// Rapport final d'un sous-agent gardé pour son panneau (Markdown).
const SUBAGENT_REPORT_MAX: usize = 8_000;
/// Sortie d'un hook en échec montrée dans le fil.
const HOOK_OUTPUT_MAX: usize = 600;
/// Garde-fou : une liste de tâches de plus de fichiers n'est pas lue.
const TASK_FILES_MAX: usize = 500;

/// Avis du CLI dans le fil (pseudo-outil `__notice` : une annotation, pas du
/// travail). `warning` = hook en échec, message bloqué, modèle de repli.
fn notice(texte: &str, alerte: bool) -> Value {
    json!({
        "kind": "tool",
        "name": "__notice",
        "detail": truncate_chars(texte, 1_200),
        "tone": if alerte { "warning" } else { "info" },
    })
}

/// Échec d'un hook, comme le terminal le montre (« PostToolUse:Bash hook
/// error — Failed with non-blocking status code: … », « Stop hook error: … »).
/// Un blocage de PreToolUse est déjà dans la ligne de l'outil refusé, celui
/// d'UserPromptSubmit dans la bannière `informational` : pas de doublon.
fn hook_failure_notice(msg: &Value, nom: &str) -> Option<Value> {
    if msg.get("outcome").and_then(|v| v.as_str()) != Some("error") {
        return None;
    }
    let evenement = msg.get("hook_event").and_then(|v| v.as_str()).unwrap_or("");
    let code = msg.get("exit_code").and_then(|v| v.as_i64());
    let raison = ["stderr", "output", "stdout"]
        .iter()
        .filter_map(|cle| msg.get(*cle).and_then(|v| v.as_str()))
        .map(str::trim)
        .find(|s| !s.is_empty())
        .map(|s| truncate_chars(s, HOOK_OUTPUT_MAX));
    if code == Some(2) {
        if matches!(
            evenement,
            "PreToolUse" | "UserPromptSubmit" | "PermissionRequest"
        ) {
            return None;
        }
        let texte = match raison {
            Some(r) => format!("Hook {nom}, renvoyé à Claude : {r}"),
            None => format!("Hook {nom} : blocage sans message."),
        };
        return Some(notice(&texte, true));
    }
    let texte = match (code, raison) {
        (Some(c), Some(r)) => format!("Hook {nom} en erreur (code {c}) : {r}"),
        (Some(c), None) => format!("Hook {nom} en erreur (code {c}), sans message."),
        (None, Some(r)) => format!("Hook {nom} en erreur : {r}"),
        (None, None) => format!("Hook {nom} en erreur."),
    };
    Some(notice(&texte, true))
}

/// Identifiant de tâche : le CLI l'écrit en chaîne (« "3" ») mais un modèle
/// peut passer un nombre.
fn json_id(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// « Task #3 created successfully: … » → « 3 ».
fn task_number(output: &str) -> Option<String> {
    let reste = &output[output.find('#')? + 1..];
    let chiffres: String = reste.chars().take_while(char::is_ascii_digit).collect();
    (!chiffres.is_empty()).then_some(chiffres)
}

/// Dossier de la liste de tâches du CLI pour cette session :
/// `$CLAUDE_CONFIG_DIR/tasks/<session>` ou `~/.claude/tasks/<session>`.
fn tasks_dir(state: &ClaudeStreamState) -> Option<std::path::PathBuf> {
    let sid = state.session_id.as_deref()?;
    if sid.is_empty() || !sid.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return None;
    }
    let root = match &state.tasks_root {
        Some(root) => root.clone(),
        None => std::env::var_os("CLAUDE_CONFIG_DIR")
            .map(std::path::PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|h| std::path::PathBuf::from(h).join(".claude"))
            })?
            .join("tasks"),
    };
    Some(root.join(sid))
}

/// Relit la liste depuis le disque du CLI (tâches créées aux tours
/// précédents comprises, suppressions appliquées). Faux si illisible.
fn reload_tasks_from_disk(state: &mut ClaudeStreamState) -> bool {
    let Some(dir) = tasks_dir(state) else {
        return false;
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return false;
    };
    let mut tasks = Vec::new();
    for entry in entries.flatten().take(TASK_FILES_MAX) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Some(v) = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        else {
            continue;
        };
        let id = json_id(v.get("id"));
        let status = v
            .get("status")
            .and_then(|s| s.as_str())
            .unwrap_or("pending")
            .to_string();
        let interne = v.pointer("/metadata/_internal").and_then(Value::as_bool) == Some(true);
        if id.is_empty() || status == "deleted" || interne {
            continue;
        }
        let subject = v
            .get("subject")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        tasks.push(TaskEntry {
            id,
            subject,
            status,
        });
    }
    state.tasks = tasks;
    true
}

/// Applique TaskCreate/TaskUpdate réussi à la liste connue.
fn apply_task_op(state: &mut ClaudeStreamState, op: TaskOp, output: &str, result: Option<&Value>) {
    if reload_tasks_from_disk(state) {
        return;
    }
    match op {
        TaskOp::Create { subject } => {
            let id = result
                .and_then(|r| r.pointer("/task/id"))
                .map(|v| json_id(Some(v)))
                .filter(|id| !id.is_empty())
                .or_else(|| task_number(output));
            let Some(id) = id else {
                return;
            };
            let subject = if subject.is_empty() {
                result
                    .and_then(|r| r.pointer("/task/subject"))
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string()
            } else {
                subject
            };
            state.tasks.retain(|t| t.id != id);
            state.tasks.push(TaskEntry {
                id,
                subject,
                status: "pending".into(),
            });
        }
        TaskOp::Update {
            id,
            status,
            subject,
        } => {
            if status.as_deref() == Some("deleted") {
                state.tasks.retain(|t| t.id != id);
                return;
            }
            if let Some(tache) = state.tasks.iter_mut().find(|t| t.id == id) {
                if let Some(s) = status {
                    tache.status = s;
                }
                if let Some(s) = subject {
                    tache.subject = s;
                }
            }
        }
        TaskOp::Read => {}
    }
}

/// La liste au format `todos` (checklist du fil), dans l'ordre des numéros.
fn task_list_items(state: &ClaudeStreamState) -> Option<Value> {
    let mut tasks: Vec<&TaskEntry> = state
        .tasks
        .iter()
        .filter(|t| !t.subject.is_empty())
        .collect();
    if tasks.is_empty() {
        return None;
    }
    tasks.sort_by(|a, b| {
        (a.id.parse::<u64>().unwrap_or(u64::MAX), &a.id)
            .cmp(&(b.id.parse::<u64>().unwrap_or(u64::MAX), &b.id))
    });
    Some(Value::Array(
        tasks
            .into_iter()
            .map(|t| {
                let mut item = json!({"text": t.subject, "completed": t.status == "completed"});
                if t.status == "in_progress" {
                    item.as_object_mut()
                        .expect("todo object")
                        .insert("active".into(), json!(true));
                }
                item
            })
            .collect(),
    ))
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
    fn reessai_et_compaction_occupent_le_chrono() {
        let mut st = ClaudeStreamState::default();
        let ev = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"api_retry","attempt":2,"max_retries":10,"retry_delay_ms":4200,"error_status":529,"error":"overloaded"}"#,
        );
        assert_eq!(ev[0]["note"], "API surchargée — nouvel essai 2/10 dans 5 s");
        let ev = parse_line(&mut st, r#"{"type":"system","subtype":"status","status":"compacting"}"#);
        assert_eq!(ev[0]["note"], "compaction de la conversation…");
    }

    #[test]
    fn taches_de_fond_et_accuses_sont_releves_sans_evenement() {
        let mut st = ClaudeStreamState::default();
        let ev = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"background_tasks_changed","tasks":[{"task_id":"a"},{"task_id":"b"}]}"#,
        );
        assert!(ev.is_empty());
        assert_eq!(st.background_tasks, 2);
        parse_line(&mut st, r#"{"type":"system","subtype":"background_tasks_changed","tasks":[]}"#);
        assert_eq!(st.background_tasks, 0);
        // Rêve et mémoire automatique : ambiants, ils ne retiennent pas le tour.
        parse_line(
            &mut st,
            r#"{"type":"system","subtype":"background_tasks_changed","tasks":[{"task_id":"d","task_type":"dream","ambient":true},{"task_id":"b","task_type":"local_bash","ambient":false}]}"#,
        );
        assert_eq!(st.background_tasks, 1);
        let ev = parse_line(
            &mut st,
            r#"{"type":"user","isReplay":true,"uuid":"u-1","message":{"role":"user","content":[{"type":"text","text":"salut"}]}}"#,
        );
        assert!(ev.is_empty());
        assert_eq!(st.replayed, ["u-1"]);
    }

    #[test]
    fn un_sous_agent_ne_rouvre_pas_le_tour_principal() {
        let mut st = ClaudeStreamState::default();
        parse_line(&mut st, r#"{"type":"result","subtype":"success","is_error":false,"result":"x","usage":{}}"#);
        assert!(!st.turn_active);
        parse_line(
            &mut st,
            r#"{"type":"assistant","parent_tool_use_id":"toolu_9","message":{"content":[]}}"#,
        );
        assert!(!st.turn_active);
        parse_line(&mut st, r#"{"type":"system","subtype":"init","session_id":"s"}"#);
        assert!(st.turn_active);
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
    fn write_snippet_shows_before_after_and_is_bounded() {
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

        // fichier EXISTANT → avant/après, l'avant lu sur disque AVANT
        // l'exécution (comme le terminal, et même hors dépôt git)
        let dir = tempfile::tempdir().unwrap();
        let existant = dir.path().join("a.py");
        std::fs::write(&existant, "x = 1\n").unwrap();
        let chemin = existant.to_str().unwrap();
        let mut st2 = ClaudeStreamState::default();
        parse_line(
            &mut st2,
            &serde_json::json!({"type":"assistant","message":{"content":[{"type":"tool_use","id":"t2","name":"Write","input":{"file_path": chemin,"content":"x = 2\n"}}]}}).to_string(),
        );
        std::fs::write(&existant, "x = 2\n").unwrap();
        let e2 = parse_line(
            &mut st2,
            r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","content":"ok"}]}}"#,
        );
        assert_eq!(e2[1]["kind"], "edit");
        assert_eq!(
            e2[1]["snippets"][chemin],
            serde_json::json!({"oldText":"x = 1\n","newText":"x = 2\n"})
        );

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

    /// Hook en échec : le terminal l'écrit (« PostToolUse:Bash hook error »),
    /// le fil aussi ; un hook réussi ne dit rien et sa note s'efface.
    #[test]
    fn hook_en_echec_devient_un_avis() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"hook_started","hook_id":"h1","hook_name":"PostToolUse:Bash","hook_event":"PostToolUse"}"#,
        );
        assert_eq!(e[0]["note"], "hook PostToolUse:Bash");
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"hook_response","hook_id":"h1","hook_name":"PostToolUse:Bash","hook_event":"PostToolUse","output":"ok\navertissement du post-hook\n","stdout":"ok\n","stderr":"avertissement du post-hook\n","exit_code":1,"outcome":"error"}"#,
        );
        assert_eq!(e[0]["kind"], "heartbeat");
        assert_eq!(e[0]["note"], "");
        assert_eq!(e[1]["name"], "__notice");
        assert_eq!(e[1]["tone"], "warning");
        assert_eq!(
            e[1]["detail"],
            "Hook PostToolUse:Bash en erreur (code 1) : avertissement du post-hook"
        );

        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"hook_response","hook_id":"h2","hook_name":"PreToolUse:Bash","hook_event":"PreToolUse","stderr":"","exit_code":0,"outcome":"success"}"#,
        );
        assert!(e.is_empty(), "hook réussi et inconnu : rien");
    }

    /// Code 2 : le retour est renvoyé à Claude. Pour Stop/PostToolUse le
    /// terminal le montre ; pour PreToolUse il est déjà dans la ligne de
    /// l'outil refusé, pour UserPromptSubmit dans la bannière.
    #[test]
    fn hook_bloquant_code_2() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"hook_response","hook_id":"h","hook_name":"Stop","hook_event":"Stop","stderr":"Lance les tests d'abord","exit_code":2,"outcome":"error"}"#,
        );
        assert_eq!(
            e[0]["detail"],
            "Hook Stop, renvoyé à Claude : Lance les tests d'abord"
        );
        for ev in ["PreToolUse", "UserPromptSubmit"] {
            let ligne = format!(
                r#"{{"type":"system","subtype":"hook_response","hook_id":"x","hook_name":"{ev}","hook_event":"{ev}","stderr":"non","exit_code":2,"outcome":"error"}}"#
            );
            assert!(parse_line(&mut st, &ligne).is_empty(), "{ev}");
        }
    }

    /// Bannières et notifications du CLI (message bloqué par un hook,
    /// modèle de repli, mémoire enregistrée).
    #[test]
    fn bannieres_du_cli() {
        let mut st = ClaudeStreamState::default();
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"informational","content":"UserPromptSubmit operation blocked by hook:\nMot interdit","level":"warning","prevent_continuation":true}"#,
        );
        assert_eq!(e[0]["name"], "__notice");
        assert_eq!(e[0]["tone"], "warning");
        assert!(parse_line(
            &mut st,
            r#"{"type":"system","subtype":"informational","content":"détail","level":"info"}"#
        )
        .is_empty());

        // « Stop hook error occurred » double l'avis du hook.
        assert!(parse_line(
            &mut st,
            r#"{"type":"system","subtype":"notification","key":"stop-hook-error","text":"Stop hook error occurred · ctrl+o to see","priority":"immediate"}"#
        )
        .is_empty());
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"notification","key":"k","text":"Serveur MCP déconnecté","priority":"high","color":"error"}"#,
        );
        assert_eq!(e[0]["detail"], "Serveur MCP déconnecté");
        assert_eq!(e[0]["tone"], "warning");
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"notification","key":"k2","text":"Astuce","priority":"low"}"#,
        );
        assert_eq!(e[0]["kind"], "heartbeat");
        assert_eq!(e[0]["note"], "Astuce");

        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"model_fallback","original_model":"claude-a","fallback_model":"claude-b"}"#,
        );
        assert_eq!(
            e[0]["detail"],
            "Ce tour passe sur le modèle de repli claude-b au lieu de claude-a."
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"memory_saved","written_paths":["a.md","b.md"]}"#,
        );
        assert_eq!(e[0]["detail"], "Mémoire enregistrée (2 fichiers).");
        assert_eq!(e[0]["tone"], "info");
    }

    /// Avancement d'un sous-agent : ce qu'il fait et ses compteurs, sur sa
    /// rangée, comme le terminal (« Reading b.txt · 2 tool uses »).
    #[test]
    fn avancement_dun_sous_agent() {
        let mut st = ClaudeStreamState::default();
        parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_started","task_id":"adae","tool_use_id":"toolu_A","description":"Lire a.txt et b.txt","subagent_type":"general-purpose","prompt":"Lis a.txt et b.txt"}"#,
        );
        // Ordre réel du CLI : task_progress PUIS le tool_use enfant.
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_progress","task_id":"adae","tool_use_id":"toolu_A","description":"Reading b.txt","subagent_type":"general-purpose","usage":{"total_tokens":12035,"tool_uses":2,"duration_ms":3763},"last_tool_name":"Read"}"#,
        );
        assert_eq!(e[0]["id"], "subagent:adae");
        assert_eq!(e[0]["status"], "inProgress");
        let act = &e[0]["agentActivity"];
        assert_eq!(
            act["agentsStates"]["adae"]["message"],
            "Lire a.txt et b.txt"
        );
        assert_eq!(act["agentPath"], "general-purpose");
        assert_eq!(act["prompt"], "Lis a.txt et b.txt");
        assert!(e[0]["detail"].as_str().is_some_and(|d| !d.is_empty()));

        let e = parse_line(
            &mut st,
            r#"{"type":"assistant","message":{"content":[
                {"type":"tool_use","id":"toolu_r","name":"Read","input":{"file_path":"/w/b.txt"}}
            ]},"parent_tool_use_id":"toolu_A"}"#,
        );
        let verbe = e[0]["agentActivity"]["agentsStates"]["adae"]["message"].clone();
        assert!(
            verbe.as_str().is_some_and(|m| m.contains("b.txt")),
            "{verbe}"
        );

        // Le résumé du modèle prime ; une mise à jour garde nom et activité.
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_progress","task_id":"adae","description":"x","summary":"Compare les deux fichiers","usage":{}}"#,
        );
        assert_eq!(
            e[0]["agentActivity"]["agentsStates"]["adae"]["message"],
            "Compare les deux fichiers"
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_updated","task_id":"adae","patch":{"is_backgrounded":true}}"#,
        );
        assert_eq!(
            e[0]["agentActivity"]["agentsStates"]["adae"]["message"],
            "Compare les deux fichiers"
        );
        let e = parse_line(
            &mut st,
            r#"{"type":"system","subtype":"task_notification","task_id":"adae","status":"completed","summary":"Fini","usage":{}}"#,
        );
        assert_eq!(e[0]["agentActivity"]["agentPath"], "general-purpose");
        assert_eq!(
            st.task_id_by_tool_use_id.get("toolu_A").map(String::as_str),
            Some("adae")
        );
    }

    /// Le rapport final d'un sous-agent n'est plus coupé à 200 signes.
    #[test]
    fn rapport_de_sous_agent_entier() {
        let mut st = ClaudeStreamState::default();
        let rapport = "mot ".repeat(400);
        let ligne = json!({"type":"system","subtype":"task_notification","task_id":"t",
            "status":"completed","summary": rapport,"usage":{}})
        .to_string();
        let e = parse_line(&mut st, &ligne);
        assert_eq!(
            e[0]["agentActivity"]["agentsStates"]["t"]["message"],
            rapport.as_str()
        );
    }

    fn outil(id: &str, name: &str, input: Value) -> String {
        json!({"type":"assistant","message":{"content":[
            {"type":"tool_use","id": id,"name": name,"input": input}]}})
        .to_string()
    }

    fn resultat(id: &str, texte: &str, extra: Value) -> String {
        json!({"type":"user","message":{"content":[
            {"type":"tool_result","tool_use_id": id,"content": texte}]},
            "tool_use_result": extra})
        .to_string()
    }

    /// TaskCreate/TaskUpdate (qui remplacent TodoWrite) : la checklist du
    /// fil, jamais des lignes d'outil brutes. ToolSearch ne montre rien.
    #[test]
    fn liste_de_taches_en_checklist() {
        let dir = tempfile::tempdir().unwrap();
        let mut st = ClaudeStreamState {
            session_id: Some("0199aaaa-bbbb".into()),
            tasks_root: Some(dir.path().join("absent")),
            ..Default::default()
        };
        assert!(parse_line(
            &mut st,
            &outil("s", "ToolSearch", json!({"query":"select:TaskCreate"}))
        )
        .is_empty());
        assert!(parse_line(&mut st, &resultat("s", "ok", json!({}))).is_empty());

        assert!(parse_line(
            &mut st,
            &outil(
                "c1",
                "TaskCreate",
                json!({"subject":"Lire","description":"d"})
            )
        )
        .is_empty());
        let e = parse_line(
            &mut st,
            &resultat(
                "c1",
                "Task #1 created successfully: Lire",
                json!({"task":{"id":"1","subject":"Lire"}}),
            ),
        );
        assert_eq!(
            e,
            vec![json!({"kind":"todos","items":[{"text":"Lire","completed":false}]})]
        );

        parse_line(
            &mut st,
            &outil("c2", "TaskCreate", json!({"subject":"Écrire"})),
        );
        // Sans tool_use_result : le numéro vient du texte.
        parse_line(
            &mut st,
            &resultat("c2", "Task #2 created successfully: Écrire", Value::Null),
        );
        parse_line(
            &mut st,
            &outil(
                "u1",
                "TaskUpdate",
                json!({"taskId":"1","status":"completed"}),
            ),
        );
        parse_line(
            &mut st,
            &resultat("u1", "Updated task #1 status", json!({"success":true})),
        );
        parse_line(
            &mut st,
            &outil(
                "u2",
                "TaskUpdate",
                json!({"taskId":2,"status":"in_progress"}),
            ),
        );
        let e = parse_line(
            &mut st,
            &resultat("u2", "Updated task #2 status", json!({"success":true})),
        );
        assert_eq!(
            e[0]["items"],
            json!([{"text":"Lire","completed":true},{"text":"Écrire","completed":false,"active":true}])
        );

        // Suppression : la tâche quitte la liste ; liste vide → rien.
        parse_line(
            &mut st,
            &outil("u3", "TaskUpdate", json!({"taskId":"1","status":"deleted"})),
        );
        let e = parse_line(
            &mut st,
            &resultat("u3", "Updated task #1 deleted", json!({})),
        );
        assert_eq!(e[0]["items"].as_array().unwrap().len(), 1);
        assert!(parse_line(&mut st, &outil("l", "TaskList", json!({}))).is_empty());
        assert!(parse_line(
            &mut st,
            &resultat("l", "#2 [in_progress] Écrire", json!({}))
        )
        .is_empty());
    }

    /// Quand le dossier du CLI est lisible, la liste vient de lui : tâches
    /// des tours précédents comprises, internes et supprimées exclues.
    #[test]
    fn liste_de_taches_relue_sur_disque() {
        let dir = tempfile::tempdir().unwrap();
        let sid = "89a227ef-4474-4fe1-891f-15529090af24";
        let taches = dir.path().join(sid);
        std::fs::create_dir_all(&taches).unwrap();
        let ecrire = |n: &str, v: Value| {
            std::fs::write(taches.join(format!("{n}.json")), v.to_string()).unwrap()
        };
        ecrire(
            "10",
            json!({"id":"10","subject":"Dixième","status":"pending"}),
        );
        ecrire(
            "2",
            json!({"id":"2","subject":"Deuxième","status":"completed"}),
        );
        ecrire(
            "3",
            json!({"id":"3","subject":"Interne","status":"pending","metadata":{"_internal":true}}),
        );
        ecrire(
            "4",
            json!({"id":"4","subject":"Supprimée","status":"deleted"}),
        );
        std::fs::write(taches.join(".lock"), "").unwrap();
        let mut st = ClaudeStreamState {
            session_id: Some(sid.into()),
            tasks_root: Some(dir.path().to_path_buf()),
            ..Default::default()
        };
        parse_line(
            &mut st,
            &outil("c", "TaskCreate", json!({"subject":"Dixième"})),
        );
        let e = parse_line(
            &mut st,
            &resultat("c", "Task #10 created successfully: Dixième", json!({})),
        );
        assert_eq!(
            e[0]["items"],
            json!([{"text":"Deuxième","completed":true},{"text":"Dixième","completed":false}])
        );

        // Un identifiant de session douteux ne sort jamais du dossier.
        st.session_id = Some("../x".into());
        assert!(tasks_dir(&st).is_none());
    }
}
