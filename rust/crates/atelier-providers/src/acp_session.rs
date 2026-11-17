//! Socle commun des providers ACP à sessions (plan Antigravity, lot 1).
//!
//! Extrait de `kimi.rs` sans changement de comportement pour Kimi : livre de
//! sessions par génération, lecture des `configOptions`, modes de session
//! standard, blocs de prompt (texte, images, liens), verdict de permission,
//! rejeu d'une session chargée vers l'historique Atelier, et sonde
//! d'annulation avec escalade optionnelle du Stop.
//!
//! Ce module ne connaît aucun CLI : chaque provider lui passe son libellé
//! (« Kimi », « Antigravity »…) pour les messages, et son propre mapper de
//! `session/update` pour le rejeu.

use crate::acp_map::TurnCtx;
use crate::acp_rpc::{AcpRpcError, AcpServer};
use base64::Engine as _;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

// ---------------------------------------------------------------------------
// Livre des sessions (G1)
// ---------------------------------------------------------------------------

/// État lié à la génération du process ACP courant — invalidé au respawn.
#[derive(Default)]
pub(crate) struct SessionBook {
    generation: u64,
    /// Sessions ouvertes (new/resume/load) dans CETTE génération, avec
    /// l'empreinte des `mcpServers` déclarés à l'ouverture : la session n'a
    /// besoin d'être rouverte que si cette déclaration a changé.
    opened: HashMap<String, u64>,
    /// Sessions refusées au resume (session disparue) : le tour suivant
    /// repart sur `session/new` (jamais de création silencieuse dans le MÊME
    /// tour).
    invalid: HashSet<String>,
}

impl SessionBook {
    /// Remet le livre à zéro si le process a été respawné. Renvoie `true`
    /// quand c'est le cas (l'appelant vide alors ses caches par session).
    pub(crate) fn reset_if_respawned(&mut self, generation: u64) -> bool {
        if self.generation == generation {
            return false;
        }
        *self = SessionBook {
            generation,
            ..Default::default()
        };
        true
    }

    /// Session déjà ouverte avec exactement cette déclaration MCP.
    pub(crate) fn is_open_with(&self, sid: &str, fingerprint: u64) -> bool {
        self.opened.get(sid) == Some(&fingerprint)
    }

    /// Session ouverte dans cette génération, quelle que soit sa déclaration MCP.
    pub(crate) fn is_open(&self, sid: &str) -> bool {
        self.opened.contains_key(sid)
    }

    pub(crate) fn mark_open(&mut self, sid: &str, fingerprint: u64) {
        self.opened.insert(sid.to_string(), fingerprint);
    }

    /// Oublie une session (fermée par l'escalade du Stop) : le tour suivant
    /// la rouvrira au lieu de prendre la voie rapide.
    pub(crate) fn forget(&mut self, sid: &str) {
        self.opened.remove(sid);
    }

    pub(crate) fn mark_invalid(&mut self, sid: &str) {
        self.invalid.insert(sid.to_string());
    }

    pub(crate) fn is_invalid(&self, sid: &str) -> bool {
        self.invalid.contains(sid)
    }
}

// ---------------------------------------------------------------------------
// Options de session (G2)
// ---------------------------------------------------------------------------

/// Cache sessionId → dernier snapshot `configOptions` (réponse ou
/// notification). Std mutex : alimenté par le SessionUpdateHandler synchrone.
pub(crate) type ConfigCache = Arc<std::sync::Mutex<HashMap<String, Value>>>;

/// Mémorise le snapshot `configOptions` porté par une réponse ACP.
pub(crate) fn remember_config_snapshot(cache: &ConfigCache, sid: &str, result: &Value) {
    if let Some(opts) = result.get("configOptions").filter(|o| o.is_array()) {
        cache.lock().unwrap().insert(sid.to_string(), opts.clone());
    }
}

/// Option par identifiant exact (`model`, `thinking`, `mode` chez Kimi).
pub(crate) fn find_config_option<'a>(snapshot: &'a Value, id: &str) -> Option<&'a Value> {
    snapshot
        .as_array()?
        .iter()
        .find(|o| o.get("id").and_then(Value::as_str) == Some(id))
}

/// Option par catégorie ACP (`model`, `thought_level`, `mode`), puis par
/// identifiant de repli. Les ids varient d'un agent à l'autre ; la catégorie
/// est le contrat du protocole.
pub(crate) fn find_config_option_by<'a>(
    snapshot: &'a Value,
    category: &str,
    fallback_id: &str,
) -> Option<&'a Value> {
    snapshot
        .as_array()?
        .iter()
        .find(|o| o.get("category").and_then(Value::as_str) == Some(category))
        .or_else(|| find_config_option(snapshot, fallback_id))
}

/// Valeur courante d'une option désignée par son id.
pub(crate) fn option_current_value(snapshot: &Value, id: &str) -> Option<String> {
    find_config_option(snapshot, id)?
        .get("currentValue")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Valeurs proposées par une option select (groupes aplatis).
pub(crate) fn option_values(option: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(items) = option.get("options").and_then(Value::as_array) {
        for item in items {
            if let Some(v) = item.get("value").and_then(Value::as_str) {
                out.push(v.to_string());
            } else if let Some(group) = item.get("options").and_then(Value::as_array) {
                for o in group {
                    if let Some(v) = o.get("value").and_then(Value::as_str) {
                        out.push(v.to_string());
                    }
                }
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Modes de session standard (G3)
// ---------------------------------------------------------------------------

/// Modes annoncés par une réponse `session/new|load|resume` :
/// `{modes: {currentModeId, availableModes: [{id, name}]}}`.
#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct SessionModes {
    pub current: Option<String>,
    pub available: Vec<String>,
}

impl SessionModes {
    pub(crate) fn from_result(result: &Value) -> Option<Self> {
        let modes = result.get("modes").filter(|m| m.is_object())?;
        let available = modes
            .get("availableModes")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(|m| m.get("id").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        let current = modes
            .get("currentModeId")
            .and_then(Value::as_str)
            .map(str::to_string);
        Some(Self { current, available })
    }

    /// Applique une notification `current_mode_update` (`currentModeId`).
    pub(crate) fn apply_update(&mut self, update: &Value) -> bool {
        if update.get("sessionUpdate").and_then(Value::as_str) != Some("current_mode_update") {
            return false;
        }
        match update.get("currentModeId").and_then(Value::as_str) {
            Some(id) => {
                self.current = Some(id.to_string());
                true
            }
            None => false,
        }
    }
}

/// Pose un mode de session standard. Ne fait rien si le mode est déjà le
/// courant ; refuse un mode non annoncé AVANT d'écrire sur le fil (un mode
/// inconnu ne doit jamais retomber en silence sur le mode par défaut).
pub(crate) async fn set_session_mode(
    acp: &AcpServer,
    sid: &str,
    modes: &mut SessionModes,
    target: &str,
    label: &str,
) -> Result<(), String> {
    // Toujours renvoyé, même si le cache dit que c'est déjà le mode courant :
    // les handlers sont retirés entre deux tours, une `current_mode_update`
    // peut donc avoir été manquée (0,05 s chez agy).
    if !modes.available.iter().any(|m| m == target) {
        return Err(format!(
            "{label} ne propose pas le mode « {target} » (modes : {}).",
            modes.available.join(", ")
        ));
    }
    acp.request(
        "session/set_mode",
        json!({"sessionId": sid, "modeId": target}),
        Some(15_000),
    )
    .await
    .map_err(|e| format!("{label} a refusé le mode « {target} » : {e}"))?;
    modes.current = Some(target.to_string());
    Ok(())
}

// ---------------------------------------------------------------------------
// Blocs de prompt
// ---------------------------------------------------------------------------

fn image_mime_for(path: &std::path::Path) -> Option<&'static str> {
    match path
        .extension()
        .and_then(|e| e.to_str())?
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

/// Image locale → bloc `{type:"image", data, mimeType}` : canonicalisation,
/// MIME par extension, limite de taille (octets sur disque, AVANT base64),
/// base64 encodé au dernier moment. Toute erreur porte le NOM du fichier —
/// jamais le base64.
pub(crate) fn image_block(path: &str, max_bytes: u64, label: &str) -> Result<Value, String> {
    let canon =
        std::fs::canonicalize(path).map_err(|e| format!("image illisible « {path} » : {e}"))?;
    let Some(mime) = image_mime_for(&canon) else {
        return Err(format!(
            "extension d'image non supportée pour {label} « {path} » (png/jpg/jpeg/gif/webp)."
        ));
    };
    let meta =
        std::fs::metadata(&canon).map_err(|e| format!("image illisible « {path} » : {e}"))?;
    if meta.len() > max_bytes {
        return Err(format!(
            "image « {path} » trop volumineuse ({} octets, max {max_bytes}).",
            meta.len()
        ));
    }
    let bytes = std::fs::read(&canon).map_err(|e| format!("image illisible « {path} » : {e}"))?;
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(json!({"type": "image", "data": data, "mimeType": mime}))
}

/// Inputs structurés Atelier → content blocks ACP. Un input invalide échoue
/// AVANT le prompt (jamais de drop silencieux) ; skills et mentions passent en
/// `resource_link` file:// que l'agent résout localement.
pub(crate) fn build_prompt_blocks(
    prompt: &str,
    inputs: Option<&Vec<Value>>,
    label: &str,
    image_max_bytes: u64,
) -> Result<Vec<Value>, String> {
    let Some(inputs) = inputs.filter(|list| !list.is_empty()) else {
        return Ok(vec![json!({"type": "text", "text": prompt})]);
    };
    let mut blocks: Vec<Value> = Vec::new();
    let mut has_text = false;
    for input in inputs {
        match input.get("type").and_then(Value::as_str).unwrap_or("") {
            "text" => {
                has_text = true;
                let text = input.get("text").and_then(Value::as_str).unwrap_or("");
                blocks.push(json!({"type": "text", "text": text}));
            }
            "local_image" => {
                let path = input
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or("input image sans chemin")?;
                blocks.push(image_block(path, image_max_bytes, label)?);
            }
            "skill" | "mention" => {
                let path = input.get("path").and_then(Value::as_str).unwrap_or("");
                let name = input.get("name").and_then(Value::as_str).unwrap_or(path);
                if path.is_empty() {
                    return Err(format!("input « {name} » sans chemin pour {label}."));
                }
                blocks.push(json!({
                    "type": "resource_link",
                    "uri": format!("file://{path}"),
                    "name": name,
                }));
            }
            other => {
                return Err(format!(
                    "type d'input non supporté pour {label} : « {} ».",
                    other.chars().take(32).collect::<String>()
                ));
            }
        }
    }
    if !has_text {
        blocks.insert(0, json!({"type": "text", "text": prompt}));
    }
    Ok(blocks)
}

/// Le prompt contient-il un bloc image ? (à vérifier contre
/// `promptCapabilities.image` avant tout envoi.)
pub(crate) fn has_image_block(blocks: &[Value]) -> bool {
    blocks
        .iter()
        .any(|b| b.get("type").and_then(Value::as_str) == Some("image"))
}

// ---------------------------------------------------------------------------
// Verdict de permission
// ---------------------------------------------------------------------------

/// Traduit la réponse UI (ou son absence) en outcome ACP.
///
/// Fidélité : l'`optionId` fait l'aller-retour OPAQUE ; absence d'UI,
/// timeout, fermeture ou option inconnue ⇒ `cancelled`, jamais une
/// approbation implicite.
///
/// La forme héritée `{allow, scope}` est mappée sur une option qui EXISTE dans
/// la requête : d'abord les ids canoniques de Kimi (`approve_once`,
/// `approve_always`, `reject`), puis — seulement si `kind_fallback` — les
/// `kind` standard ACP (`allow_once`, `allow_always`, `reject_once`), et
/// uniquement quand UNE seule option porte ce kind : une revue de plan ou une
/// question à choix (plusieurs `allow_once`) n'est jamais tranchée par la
/// forme héritée. Jamais d'id inventé.
pub(crate) fn permission_outcome(
    params: &Value,
    answer: Option<Value>,
    label: &str,
    kind_fallback: bool,
) -> Value {
    let cancelled = || json!({"outcome": {"outcome": "cancelled"}});
    let options: Vec<&Value> = params
        .get("options")
        .and_then(Value::as_array)
        .map(|opts| opts.iter().collect())
        .unwrap_or_default();
    let option_ids: Vec<&str> = options
        .iter()
        .filter_map(|o| o.get("optionId").and_then(Value::as_str))
        .collect();
    let id_of_kind = |kind: &str| -> Option<&str> {
        if !kind_fallback {
            return None;
        }
        let mut of_kind = options
            .iter()
            .filter(|o| o.get("kind").and_then(Value::as_str) == Some(kind));
        let first = of_kind.next()?;
        if of_kind.next().is_some() {
            return None; // ambigu (plan, question) : refus sûr
        }
        first.get("optionId").and_then(Value::as_str)
    };
    let selected = |id: &str| json!({"outcome": {"outcome": "selected", "optionId": id}});

    let Some(ans) = answer else {
        return cancelled();
    };

    // 1. Réponse dynamique {optionId} — le chemin nominal.
    if let Some(oid) = ans.get("optionId").and_then(Value::as_str) {
        if option_ids.contains(&oid) {
            return selected(oid);
        }
        // Option inconnue : warning borné (id seulement), refus sûr.
        let bounded: String = oid.chars().take(64).collect();
        eprintln!(
            "[{}] optionId inconnu renvoyé par l'UI, cancelled: {bounded}",
            label.to_lowercase()
        );
        return cancelled();
    }

    // 2. Réponse user_input {answers:{champ: valeur}} — la valeur est l'id
    //    opaque (options de champ avec `value`). Vide = skip ⇒ cancelled.
    if let Some(answers) = ans.get("answers").and_then(Value::as_object) {
        if let Some(v) = answers
            .values()
            .filter_map(Value::as_str)
            .find(|s| !s.is_empty())
        {
            if option_ids.contains(&v) {
                return selected(v);
            }
        }
        return cancelled();
    }

    // 3. Forme héritée {allow, scope}.
    if let Some(allow) = ans.get("allow").and_then(Value::as_bool) {
        let session = ans.get("scope").and_then(Value::as_str) == Some("session");
        let target: Option<&str> = if allow {
            if session && option_ids.contains(&"approve_always") {
                Some("approve_always")
            } else if option_ids.contains(&"approve_once") {
                Some("approve_once")
            } else if session {
                id_of_kind("allow_always").or_else(|| id_of_kind("allow_once"))
            } else {
                id_of_kind("allow_once")
            }
        } else if option_ids.contains(&"reject") {
            Some("reject")
        } else {
            id_of_kind("reject_once")
        };
        return match target {
            Some(id) if option_ids.contains(&id) => selected(id),
            _ => cancelled(),
        };
    }

    cancelled()
}

// ---------------------------------------------------------------------------
// Rejeu d'une session chargée
// ---------------------------------------------------------------------------

/// `updatedAt` ISO-8601 UTC → epoch millisecondes (shape `mtime` du
/// navigateur de sessions). Timestamp invalide ⇒ None (tolérance exigée).
pub(crate) fn iso8601_to_epoch_ms(s: &str) -> Option<u64> {
    let bytes = s.as_bytes();
    if bytes.len() < 20 || bytes[4] != b'-' || bytes[7] != b'-' || bytes[10] != b'T' {
        return None;
    }
    let num = |range: std::ops::Range<usize>| -> Option<i64> { s.get(range)?.parse::<i64>().ok() };
    let (year, month, day) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hour, minute, second) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let millis = if bytes.get(19) == Some(&b'.') {
        num(20..23).unwrap_or(0)
    } else {
        0
    };
    // Days from civil (Howard Hinnant) — UTC uniquement (suffixe Z).
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + hour * 3_600 + minute * 60 + second;
    if secs < 0 {
        return None;
    }
    Some((secs * 1_000 + millis) as u64)
}

/// Les sessions natives persistent le prompt provider COMPLET : blocs
/// d'instructions injectés (`<atelier-*>`) et `<system-reminder>` des hooks.
/// Au replay, ne montrer que ce que l'utilisateur a réellement tapé — un
/// message réduit à un rappel système disparaît entièrement.
pub(crate) fn sanitize_replay_user(text: &str) -> String {
    let mut out = text.to_string();
    for (open, close) in [
        ("<atelier-file-scope>", "</atelier-file-scope>"),
        (
            "<atelier-discussion-workspace>",
            "</atelier-discussion-workspace>",
        ),
        (
            "<atelier-gallery-integration>",
            "</atelier-gallery-integration>",
        ),
        ("<atelier-zotero-passages>", "</atelier-zotero-passages>"),
        ("<atelier-kb>", "</atelier-kb>"),
        ("<system-reminder>", "</system-reminder>"),
    ] {
        while let Some(start) = out.find(open) {
            let Some(rel_end) = out[start + open.len()..].find(close) else {
                break;
            };
            let end = start + open.len() + rel_end + close.len();
            let remove_from = out[..start].trim_end_matches(['\r', '\n']).len();
            out.replace_range(remove_from..end, "");
        }
    }
    out.trim().to_string()
}

/// Mapper `session/update` → events Atelier propre à un agent.
pub(crate) type UpdateMapper = fn(&Value, &mut TurnCtx) -> Vec<Value>;

/// Replay capturé de `session/load` → events d'historique Atelier
/// (user/thinking/text coalescés, outils via le mapper de l'agent). Ces
/// events servent à l'AFFICHAGE d'une session importée — jamais ré-émis dans
/// un tour.
pub(crate) fn replay_to_history(updates: &[Value], map_tool: UpdateMapper) -> Vec<Value> {
    use crate::acp_map::text_of;
    let mut events: Vec<Value> = Vec::new();
    let mut ctx = TurnCtx::default();
    let mut user = String::new();
    let mut think = String::new();
    let mut text = String::new();
    fn flush(events: &mut Vec<Value>, buf: &mut String, kind: &str) {
        if buf.is_empty() {
            return;
        }
        let taken = std::mem::take(buf);
        let cleaned = if kind == "user" {
            sanitize_replay_user(&taken)
        } else {
            taken
        };
        if !cleaned.is_empty() {
            events.push(json!({"kind": kind, "text": cleaned}));
        }
    }
    for u in updates {
        match u.get("sessionUpdate").and_then(Value::as_str) {
            Some("user_message_chunk") => {
                flush(&mut events, &mut think, "thinking");
                flush(&mut events, &mut text, "text");
                user.push_str(&text_of(u));
            }
            Some("agent_thought_chunk") => {
                flush(&mut events, &mut user, "user");
                flush(&mut events, &mut text, "text");
                think.push_str(&text_of(u));
            }
            Some("agent_message_chunk") => {
                flush(&mut events, &mut user, "user");
                flush(&mut events, &mut think, "thinking");
                text.push_str(&text_of(u));
            }
            Some("tool_call") | Some("tool_call_update") => {
                flush(&mut events, &mut user, "user");
                flush(&mut events, &mut think, "thinking");
                flush(&mut events, &mut text, "text");
                events.extend(map_tool(u, &mut ctx));
            }
            _ => {}
        }
    }
    flush(&mut events, &mut user, "user");
    flush(&mut events, &mut think, "thinking");
    flush(&mut events, &mut text, "text");
    events
}

// ---------------------------------------------------------------------------
// Stop et escalade (G6)
// ---------------------------------------------------------------------------

/// Escalade du Stop quand `session/cancel` reste sans effet : `session/close`
/// après `close_after`. Jamais d'arrêt du process ACP depuis ici : il porte
/// les tours des AUTRES fils (et un respawn pendant l'attente serait tué par
/// erreur) ; un CLI réellement figé reste l'affaire du filet d'inactivité.
/// `closed` passe à `true` quand le close est parti : l'appelant oublie alors
/// la session (`SessionBook::forget`) pour que le tour suivant la rouvre.
#[derive(Debug, Clone)]
pub(crate) struct StopEscalation {
    pub close_after: Duration,
    pub closed: Arc<std::sync::atomic::AtomicBool>,
}

/// Sonde d'annulation d'un tour. Sans escalade (Kimi) : UNE notification
/// `session/cancel`, le prompt en cours se résout ensuite avec
/// `stopReason:"cancelled"`. Avec escalade : la tâche reste en vie après le
/// cancel et envoie `session/close` si le prompt ne s'est toujours pas
/// résolu ; l'appelant l'interrompt (`abort`) dès que le prompt s'est résolu.
pub(crate) fn spawn_cancel_watcher(
    acp: AcpServer,
    sid: String,
    is_cancelled: Arc<dyn Fn() -> bool + Send + Sync>,
    escalation: Option<StopEscalation>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            if is_cancelled() {
                acp.notify("session/cancel", json!({"sessionId": sid}))
                    .await;
                break;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        let Some(esc) = escalation else {
            return;
        };
        let generation = acp.generation();
        tokio::time::sleep(esc.close_after).await;
        if acp.generation() != generation {
            return; // process remplacé : la session n'existe plus de toute façon
        }
        esc.closed
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let _ = close_session(&acp, &sid).await;
    })
}

/// `session/close` best-effort (agents qui l'annoncent). Une erreur
/// « méthode inconnue » n'est pas un échec du tour.
pub(crate) async fn close_session(acp: &AcpServer, sid: &str) -> Result<(), AcpRpcError> {
    acp.request("session/close", json!({"sessionId": sid}), Some(5_000))
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn livre_remis_a_zero_au_respawn() {
        let mut book = SessionBook::default();
        assert!(book.reset_if_respawned(1));
        book.mark_open("s1", 42);
        book.mark_invalid("s2");
        assert!(book.is_open_with("s1", 42));
        assert!(!book.is_open_with("s1", 43));
        assert!(book.is_invalid("s2"));
        assert!(
            !book.reset_if_respawned(1),
            "même génération : rien ne bouge"
        );
        assert!(book.is_open_with("s1", 42));
        book.forget("s1");
        assert!(!book.is_open("s1"), "oubliée après un close");
        book.mark_open("s1", 42);
        assert!(book.reset_if_respawned(2));
        assert!(!book.is_open_with("s1", 42));
        assert!(!book.is_invalid("s2"));
    }

    #[test]
    fn option_trouvee_par_categorie_puis_par_id() {
        let snap = json!([
            {"id": "agy_model", "category": "model", "currentValue": "carbon"},
            {"id": "thinking", "currentValue": "high"},
            {"id": "mode", "category": "mode", "currentValue": "default"}
        ]);
        let m = find_config_option_by(&snap, "model", "model").unwrap();
        assert_eq!(m["id"], "agy_model", "la catégorie prime sur l'id");
        let t = find_config_option_by(&snap, "thought_level", "thinking").unwrap();
        assert_eq!(t["id"], "thinking", "repli sur l'id sans catégorie");
        assert!(find_config_option_by(&snap, "inconnue", "absente").is_none());
        assert!(find_config_option_by(&Value::Null, "model", "model").is_none());
    }

    #[test]
    fn valeurs_d_option_aplaties_par_groupe() {
        let opt = json!({"options": [
            {"value": "a"},
            {"group": "Claude", "options": [{"value": "b"}, {"value": "c"}]}
        ]});
        assert_eq!(option_values(&opt), vec!["a", "b", "c"]);
        let snap = json!([{"id": "model", "currentValue": "b"}]);
        assert_eq!(option_current_value(&snap, "model").as_deref(), Some("b"));
    }

    #[test]
    fn modes_lus_et_mis_a_jour() {
        let res = json!({"sessionId": "s", "modes": {
            "currentModeId": "auto",
            "availableModes": [{"id": "default"}, {"id": "accept-edits"}, {"id": "plan"}, {"id": "auto"}]
        }});
        let mut modes = SessionModes::from_result(&res).unwrap();
        assert_eq!(modes.current.as_deref(), Some("auto"));
        assert_eq!(
            modes.available,
            vec!["default", "accept-edits", "plan", "auto"]
        );
        assert!(modes.apply_update(
            &json!({"sessionUpdate": "current_mode_update", "currentModeId": "plan"})
        ));
        assert_eq!(modes.current.as_deref(), Some("plan"));
        assert!(!modes.apply_update(&json!({"sessionUpdate": "agent_message_chunk"})));
        assert!(SessionModes::from_result(&json!({"sessionId": "s"})).is_none());
    }

    #[test]
    fn permission_par_kind_standard_acp() {
        let params = json!({"options": [
            {"optionId": "o1", "kind": "allow_once", "name": "Autoriser"},
            {"optionId": "o2", "kind": "allow_always", "name": "Toujours"},
            {"optionId": "o3", "kind": "reject_once", "name": "Refuser"}
        ]});
        let sel = |v: Value| v["outcome"]["optionId"].as_str().map(str::to_string);
        assert_eq!(
            sel(permission_outcome(
                &params,
                Some(json!({"allow": true})),
                "Agent",
                true
            ))
            .as_deref(),
            Some("o1")
        );
        assert_eq!(
            sel(permission_outcome(
                &params,
                Some(json!({"allow": true, "scope": "session"})),
                "Agent",
                true
            ))
            .as_deref(),
            Some("o2")
        );
        assert_eq!(
            sel(permission_outcome(
                &params,
                Some(json!({"allow": false})),
                "Agent",
                true
            ))
            .as_deref(),
            Some("o3")
        );
        assert_eq!(
            sel(permission_outcome(
                &params,
                Some(json!({"optionId": "o2"})),
                "Agent",
                true
            ))
            .as_deref(),
            Some("o2")
        );
        let none = permission_outcome(&params, None, "Agent", true);
        assert_eq!(none["outcome"]["outcome"], "cancelled");
        let unknown = permission_outcome(&params, Some(json!({"optionId": "zz"})), "Agent", true);
        assert_eq!(unknown["outcome"]["outcome"], "cancelled");
    }

    #[test]
    fn toujours_sans_option_toujours_retombe_sur_une_fois() {
        let params = json!({"options": [
            {"optionId": "a", "kind": "allow_once"},
            {"optionId": "r", "kind": "reject_once"}
        ]});
        let out = permission_outcome(
            &params,
            Some(json!({"allow": true, "scope": "session"})),
            "Agent",
            true,
        );
        assert_eq!(out["outcome"]["optionId"], "a");
        let only_reject = json!({"options": [{"optionId": "r", "kind": "reject_once"}]});
        let out = permission_outcome(&only_reject, Some(json!({"allow": true})), "Agent", true);
        assert_eq!(
            out["outcome"]["outcome"], "cancelled",
            "jamais d'id inventé"
        );
        let plan = json!({"options": [
            {"optionId": "plan_a", "kind": "allow_once"},
            {"optionId": "plan_b", "kind": "allow_once"}
        ]});
        let out = permission_outcome(&plan, Some(json!({"allow": true})), "Agent", true);
        assert_eq!(
            out["outcome"]["outcome"], "cancelled",
            "plusieurs allow_once : ambigu"
        );
        let kinds_only = json!({"options": [{"optionId": "o1", "kind": "allow_once"}]});
        let out = permission_outcome(&kinds_only, Some(json!({"allow": true})), "Kimi", false);
        assert_eq!(
            out["outcome"]["outcome"], "cancelled",
            "sans repli par kind (Kimi)"
        );
    }

    #[test]
    fn blocs_de_prompt_portent_le_libelle_de_l_agent() {
        let inputs = vec![json!({"type": "blob"})];
        let err = build_prompt_blocks("p", Some(&inputs), "Antigravity", 1024).unwrap_err();
        assert!(err.contains("Antigravity") && err.contains("blob"), "{err}");
        let blocks = build_prompt_blocks("salut", None, "Antigravity", 1024).unwrap();
        assert!(!has_image_block(&blocks));
    }

    fn mapper_vide(_: &Value, _: &mut TurnCtx) -> Vec<Value> {
        vec![json!({"kind": "tool"})]
    }

    #[test]
    fn rejeu_coalesce_et_nettoie() {
        let updates = vec![
            json!({"sessionUpdate": "user_message_chunk", "content": {"type": "text", "text": "Bonjour<system-reminder>x</system-reminder>"}}),
            json!({"sessionUpdate": "agent_thought_chunk", "content": {"type": "text", "text": "je pense"}}),
            json!({"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": "Salut"}}),
            json!({"sessionUpdate": "tool_call", "toolCallId": "t"}),
        ];
        let ev = replay_to_history(&updates, mapper_vide);
        let kinds: Vec<&str> = ev.iter().filter_map(|e| e["kind"].as_str()).collect();
        assert_eq!(kinds, vec!["user", "thinking", "text", "tool"]);
        assert_eq!(ev[0]["text"], "Bonjour");
    }
}
