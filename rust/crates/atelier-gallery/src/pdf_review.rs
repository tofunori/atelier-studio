//! Correction d'un PDF du projet (copies d'élèves) : qui signe les
//! commentaires, et la copie corrigée lisible dans tous les lecteurs.
//!
//! Les commentaires vivent dans le store des annotations (`pdf_annots.json`,
//! clé = chemin du PDF) comme toutes les annotations du lecteur. La copie
//! corrigée les imprime dans une marge (outil `atelier-pdf corrige`, PDFium
//! dans son propre processus) à côté du PDF : `<nom>_corrigé.pdf`. Le PDF de
//! l'élève n'est jamais modifié.

use crate::documents::{is_zotero_pdf_rel, legacy_pdf_annots_path, read_pdf_store};
use crate::{AppState, request_allowed};
use atelier_core::safe_project_path;
use atelier_pdf::corrige;
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::time::Duration;

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

#[derive(Deserialize)]
pub struct RelQuery {
    rel: Option<String>,
}

#[derive(Deserialize)]
pub struct CorrectedBody {
    rel: String,
}

fn pdf_path(state: &AppState, rel: &str) -> Result<PathBuf, axum::response::Response> {
    if is_zotero_pdf_rel(rel) {
        return Err(json_error(StatusCode::BAD_REQUEST, "un article de la bibliothèque ne se corrige pas"));
    }
    let is_pdf = Path::new(rel).extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return Err(json_error(StatusCode::BAD_REQUEST, "ce n'est pas un PDF"));
    }
    let Ok(path) = safe_project_path(&state.root, rel) else {
        return Err(json_error(StatusCode::FORBIDDEN, "outside the project"));
    };
    if !path.is_file() {
        return Err(json_error(StatusCode::NOT_FOUND, "PDF introuvable"));
    }
    Ok(path)
}

fn rel_of(root: &Path, path: &Path) -> String {
    let root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    path.strip_prefix(&root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// `GET /pdf/review?rel=` — le nom qui signe les commentaires de ce PDF
/// (celui du panneau Word, sinon celui du Mac), s'il est lui-même une copie
/// corrigée, et sa copie corrigée si elle existe déjà.
pub async fn review(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<RelQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let rel = q.rel.unwrap_or_default();
    if is_zotero_pdf_rel(&rel) {
        return (StatusCode::OK, Json(json!({"library": true}))).into_response();
    }
    let path = match pdf_path(&state, &rel) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let root = state.root.clone();
    let job = move || {
        let copy = corrige::output_path(&path);
        json!({
            "author": atelier_docx::marks::pdf_signer(&path, &root),
            "corrected": corrige::is_corrected(&path),
            "copy": copy.is_file().then(|| rel_of(&root, &copy)),
            "path": path.to_string_lossy(),
            "copyPath": copy.to_string_lossy(),
        })
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// Texte d'une annotation du lecteur : `memo` pour un surlignage, `note` pour
/// un commentaire, une note libre ou une zone, `text` pour une zone de texte.
fn annotation_text(a: &Value) -> String {
    let field = |k: &str| a.get(k).and_then(Value::as_str).map(str::trim).unwrap_or("").to_string();
    let kind = a.get("kind").and_then(Value::as_str).unwrap_or("hl");
    let order: &[&str] = match kind {
        "comment" | "note" | "area" => &["note", "memo"],
        "text" => &["text", "note"],
        _ => &["memo", "note"],
    };
    order.iter().map(|k| field(k)).find(|t| !t.is_empty()).unwrap_or_default()
}

fn is_agent_entry(by: Option<&str>) -> bool {
    matches!(by, Some("agent" | "claude"))
}

/// Les commentaires d'un PDF tels que la copie corrigée les imprime. Ce que
/// Claude a écrit, et les réponses de Thierry (« Toi »), sont signés
/// `signer` ; un relecteur importé garde son nom.
pub(crate) fn comments_for(annots: &Value, signer: &str) -> corrige::Request {
    let author_of = |by: Option<&str>, author: Option<&str>| -> String {
        let author = author.map(str::trim).filter(|a| !a.is_empty());
        match (by, author) {
            (Some("user"), _) | (None, None) => signer.to_string(),
            (by, _) if is_agent_entry(by) => signer.to_string(),
            (_, Some(a)) if a == "Toi" || atelier_docx::marks::is_agent(a) => signer.to_string(),
            (_, Some(a)) => a.to_string(),
            (_, None) => signer.to_string(),
        }
    };
    let mut comments = Vec::new();
    for a in annots.as_array().into_iter().flatten() {
        let kind = a.get("kind").and_then(Value::as_str).unwrap_or("hl").to_string();
        // codes qualitatifs et tampons : pas des commentaires pour l'élève
        if matches!(kind.as_str(), "code" | "stamp") || a.get("done").and_then(Value::as_bool) == Some(true) {
            continue;
        }
        let replies: Vec<corrige::Reply> = a
            .get("thread")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|m| {
                let text = m.get("text").and_then(Value::as_str)?.trim().to_string();
                (!text.is_empty()).then(|| corrige::Reply {
                    author: author_of(m.get("by").and_then(Value::as_str), m.get("author").and_then(Value::as_str)),
                    text,
                })
            })
            .collect();
        let text = annotation_text(a);
        if text.is_empty() && replies.is_empty() {
            continue;
        }
        let Some(page) = a.get("page").and_then(|p| p.as_u64().or_else(|| p.as_str()?.parse().ok())) else {
            continue;
        };
        let rects = a
            .get("rects")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|r| {
                let r = r.as_array()?;
                let n = |i: usize| r.get(i).and_then(Value::as_f64).map(|v| v as f32);
                Some([n(0)?, n(1)?, n(2)?, n(3).unwrap_or(0.0)])
            })
            .collect();
        let pin = a.get("pin").and_then(Value::as_array).and_then(|p| {
            Some([p.first()?.as_f64()? as f32, p.get(1)?.as_f64()? as f32])
        });
        comments.push(corrige::Comment {
            page: page as u32,
            rects,
            pin,
            inline: kind == "text",
            size: a.get("size").and_then(Value::as_f64).map(|v| v as f32),
            ink: a.get("ink").and_then(Value::as_str).map(str::to_string),
            kind,
            color: a.get("color").and_then(Value::as_str).unwrap_or("").to_string(),
            author: author_of(a.get("by").and_then(Value::as_str), a.get("author").and_then(Value::as_str)),
            text,
            replies,
            at: a.get("at").and_then(Value::as_f64).or_else(|| {
                // ids du lecteur : `<ms>-…`
                a.get("id").and_then(Value::as_str)?.split('-').next()?.parse().ok()
            }),
        });
    }
    corrige::Request { comments }
}

/// `POST /pdf/corrected {rel}` — écrit `<nom>_corrigé.pdf` à côté du PDF avec
/// ses commentaires imprimés dans une marge. Remplace une copie corrigée
/// précédente (elle se refait depuis les commentaires d'Atelier).
pub async fn corrected(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<CorrectedBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match pdf_path(&state, &body.rel) {
        Ok(p) => p,
        Err(r) => return r,
    };
    if corrige::is_corrected(&path) {
        return json_error(StatusCode::CONFLICT, "c'est déjà une copie corrigée : corrige le PDF d'origine");
    }
    let root = state.root.clone();
    let rel = body.rel.clone();
    let prepare = move || -> Result<(PathBuf, TempJson, usize), String> {
        let store = read_pdf_store(&legacy_pdf_annots_path(&root))?;
        let signer = atelier_docx::marks::pdf_signer(&path, &root);
        let request = comments_for(store.get(&rel).unwrap_or(&Value::Null), &signer);
        let count = request.comments.len();
        let raw = serde_json::to_vec(&json!({"comments": request.comments.iter().map(comment_json).collect::<Vec<_>>()}))
            .map_err(|e| e.to_string())?;
        let file = TempJson(std::env::temp_dir().join(format!(
            "atelier-corrige-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
        )));
        std::fs::write(&file.0, raw).map_err(|e| e.to_string())?;
        Ok((path, file, count))
    };
    let (path, comments, count) = match tokio::task::spawn_blocking(prepare).await {
        Ok(Ok(v)) => v,
        Ok(Err(e)) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, e),
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    if count == 0 {
        return json_error(StatusCode::UNPROCESSABLE_ENTITY, "aucun commentaire à imprimer");
    }
    let out = corrige::output_path(&path);
    // écrite à côté puis renommée : un lecteur ouvert sur l'ancienne copie
    // ne voit jamais un fichier à moitié écrit
    let partial = out.with_file_name(format!(".{}.partial", out.file_name().unwrap_or_default().to_string_lossy()));
    let Some(command) = atelier_pdf::tool::corrected_copy_command(&path, &partial, &comments.0) else {
        return json_error(StatusCode::SERVICE_UNAVAILABLE, "outil atelier-pdf introuvable (réinstaller Atelier)");
    };
    let mut command = tokio::process::Command::from(command);
    command.kill_on_drop(true);
    let output = match tokio::time::timeout(Duration::from_secs(60), command.output()).await {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, format!("atelier-pdf : {e}")),
        Err(_) => {
            let _ = std::fs::remove_file(&partial);
            return json_error(StatusCode::GATEWAY_TIMEOUT, "la copie corrigée prend trop de temps");
        }
    };
    if !output.status.success() {
        let _ = std::fs::remove_file(&partial);
        let why = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return json_error(StatusCode::UNPROCESSABLE_ENTITY, if why.is_empty() { "copie corrigée impossible".into() } else { why });
    }
    if let Err(e) = std::fs::rename(&partial, &out) {
        let _ = std::fs::remove_file(&partial);
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, format!("copie corrigée non enregistrée : {e}"));
    }
    let report: Value = serde_json::from_slice(&output.stdout).unwrap_or(Value::Null);
    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "rel": rel_of(&state.root, &out),
            "path": out.to_string_lossy(),
            "name": out.file_name().map(|n| n.to_string_lossy().to_string()),
            "comments": report.get("comments").cloned().unwrap_or(json!(count)),
            "pages": report.get("pages").cloned().unwrap_or(Value::Null),
        })),
    )
        .into_response()
}

/// Fichier de commentaires passé à l'outil, effacé quand la requête finit.
struct TempJson(PathBuf);
impl Drop for TempJson {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn comment_json(c: &corrige::Comment) -> Value {
    json!({
        "page": c.page,
        "rects": c.rects,
        "pin": c.pin,
        "kind": c.kind,
        "color": c.color,
        "author": c.author,
        "text": c.text,
        "replies": c.replies.iter().map(|r| json!({"author": r.author, "text": r.text})).collect::<Vec<_>>(),
        "at": c.at,
        "inline": c.inline,
        "size": c.size,
        "ink": c.ink,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comments_are_signed_by_the_user_even_when_claude_wrote_them() {
        let annots = json!([
            {"id":"1763000000000-a","page":2,"rects":[[0.1,0.2,0.3,0.02]],"kind":"hl","color":"rgba(255,213,74,.4)","memo":"Unité ?"},
            {"id":"a1","page":1,"rects":[[0.1,0.5,0.3,0.02]],"kind":"hl","memo":"Vérifié : 0,0047.","by":"agent","author":"Claude",
             "thread":[{"id":"m1","by":"user","author":"Toi","text":"Merci"},{"id":"m2","by":"reviewer","author":"Christophe","text":"OK"}]},
            {"id":"n","page":1,"pin":[0.5,0.5],"kind":"note","note":"Bon travail"},
            {"id":"c","page":1,"rects":[[0.1,0.1,0.1,0.01]],"kind":"code","codes":["x"]},
            {"id":"e","page":1,"rects":[[0.1,0.1,0.1,0.01]],"kind":"hl"},
            {"id":"t","page":3,"rects":[[0.1,0.1,0.2,0]],"kind":"text","text":"À revoir"}
        ]);
        let req = comments_for(&annots, "Thierry Laurent");
        let texts: Vec<&str> = req.comments.iter().map(|c| c.text.as_str()).collect();
        assert_eq!(texts, ["Unité ?", "Vérifié : 0,0047.", "Bon travail", "À revoir"]);
        assert!(req.comments.iter().all(|c| c.author == "Thierry Laurent"));
        let replies: Vec<(&str, &str)> = req.comments[1].replies.iter().map(|r| (r.author.as_str(), r.text.as_str())).collect();
        assert_eq!(replies, [("Thierry Laurent", "Merci"), ("Christophe", "OK")]);
        assert_eq!(req.comments[0].at, Some(1763000000000.0));
        assert_eq!(req.comments[2].pin, Some([0.5, 0.5]));
        assert!(req.comments[3].inline && !req.comments[0].inline);
    }
}
