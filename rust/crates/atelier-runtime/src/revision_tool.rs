//! Outil `atelier_revision` : l'agent répond aux notes d'une ronde
//! d'annotations de l'éditeur LaTeX. Il ne modifie jamais le fichier : il
//! dépose une proposition (texte qui remplacerait le passage annoté, et sa
//! raison) ou une question. L'utilisateur accepte, rejette ou redemande dans
//! l'éditeur, qui seul applique le texte. Voir `atelier_store::tex_revisions`.

use atelier_store::tex_revisions::{self, Reply};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

use crate::state::AppState;

fn str_arg<'a>(req: &'a Value, key: &str) -> Option<&'a str> {
    req.get(key).and_then(Value::as_str)
}

/// Fichier de la ronde : le chemin absolu donné dans la demande (ou relatif
/// au projet du fil). Il doit exister : la clé du store est ce chemin, celui
/// que l'éditeur interroge.
fn resolve(project_root: &str, requested: &str) -> Result<PathBuf, String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err("path manquant : reprends le chemin du fichier donné dans la demande de ronde".into());
    }
    let p = Path::new(requested);
    let candidate = if p.is_absolute() { p.to_path_buf() } else { Path::new(project_root).join(p) };
    if !candidate.is_file() {
        return Err(format!("fichier introuvable : {requested}"));
    }
    Ok(candidate)
}

/// La réponse décrite par l'appel, avant toute écriture.
pub fn reply_of(action: &str, req: &Value) -> Result<Reply, String> {
    match action {
        "propose" => {
            let text = str_arg(req, "text").ok_or("text manquant : le passage réécrit, en LaTeX, qui remplace exactement le passage cité")?;
            if text.trim().is_empty() {
                return Err("text vide : pour une question, utilise action ask".into());
            }
            Ok(Reply::Propose { text: text.to_string(), reason: str_arg(req, "reason").unwrap_or("").to_string() })
        }
        "ask" => Ok(Reply::Ask { question: str_arg(req, "question").ok_or("question manquante")?.to_string() }),
        other => Err(format!("action inconnue : {other} (propose ou ask)")),
    }
}

fn run(store_dir: &Path, project_root: &str, author: &str, action: &str, req: &Value) -> Result<Value, String> {
    let reply = reply_of(action, req)?;
    let path = resolve(project_root, str_arg(req, "path").unwrap_or(""))?;
    let round = str_arg(req, "round").unwrap_or("");
    let note = str_arg(req, "note").unwrap_or("");
    let file = path.to_string_lossy();
    let out = tex_revisions::record(store_dir, &file, round, note, &reply, author)?;
    Ok(json!({
        "ok": true,
        "seq": out["seq"],
        "note": "Réponse affichée sur place dans l'éditeur. Le fichier n'est pas modifié : l'utilisateur accepte ou rejette.",
    }))
}

/// Point d'entrée du pont : `revision_propose`, `revision_ask`.
pub async fn action(state: &AppState, caller_id: &str, action: &str, req: &Value) -> Result<Value, String> {
    let (project_root, provider) = {
        let store = state.threads().lock().await;
        let caller = store
            .get(caller_id)
            .ok_or_else(|| atelier_protocol::agent_mcp_errors::CALLER_UNKNOWN.to_string())?;
        (caller.project_root.clone(), caller.provider.clone())
    };
    let author = crate::docx_tool::author_for(&provider).to_string();
    let store_dir = state.app_dir().to_path_buf();
    let action = action.trim_start_matches("revision_").to_string();
    let req = req.clone();
    match tokio::task::spawn_blocking(move || run(&store_dir, &project_root, &author, &action, &req)).await {
        Ok(Ok(v)) => Ok(v),
        // Une réponse refusée n'est pas une panne : l'agent lit la raison et corrige.
        Ok(Err(message)) => Ok(json!({"ok": false, "error": message})),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn propose_then_ask_are_written_for_the_editor_and_the_file_is_untouched() {
        let project = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let tex = project.path().join("main.tex");
        std::fs::write(&tex, "Wildfire smoke deposits particles.\n").unwrap();
        let root = project.path().to_str().unwrap();
        let r = run(app.path(), root, "Claude", "propose", &json!({
            "path": tex.to_str().unwrap(), "round": "r1700000000000", "note": "c1",
            "text": "Glacier albedo drops by 0.02.", "reason": "Le chiffre d'abord."
        })).unwrap();
        assert_eq!(r["ok"], true);
        run(app.path(), root, "Claude", "ask", &json!({
            "path": "main.tex", "round": "r1700000000000", "note": "c2", "question": "Quelle étude ?"
        })).unwrap();
        let e = tex_revisions::entry(app.path(), tex.to_str().unwrap()).unwrap();
        assert_eq!(e["items"]["c1"]["text"], "Glacier albedo drops by 0.02.");
        assert_eq!(e["items"]["c1"]["author"], "Claude");
        assert_eq!(e["items"]["c2"]["kind"], "ask");
        assert_eq!(std::fs::read_to_string(&tex).unwrap(), "Wildfire smoke deposits particles.\n");
    }

    #[test]
    fn missing_file_or_text_is_refused_with_a_readable_reason() {
        let app = tempfile::tempdir().unwrap();
        let project = tempfile::tempdir().unwrap();
        let root = project.path().to_str().unwrap();
        let e = run(app.path(), root, "Codex", "propose", &json!({"path": "absent.tex", "round": "r1", "note": "c1", "text": "x"})).unwrap_err();
        assert!(e.contains("introuvable"), "{e}");
        let e = reply_of("propose", &json!({"text": "  "})).unwrap_err();
        assert!(e.contains("ask"), "{e}");
        assert!(reply_of("accept", &json!({})).is_err(), "l'agent ne décide jamais à la place de l'utilisateur");
    }
}
