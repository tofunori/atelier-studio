//! Panneau .docx : lecture du document et retouches (crate `atelier-docx`).
//!
//! Chaque retouche rouvre le fichier, vérifie qu'il n'a pas changé depuis la
//! version affichée, l'applique et enregistre à la place (écriture atomique,
//! sous verrou partagé avec l'agent). La réponse porte le modèle à jour :
//! le panneau se redessine d'après lui, jamais d'après une prédiction.

use atelier_core::safe_project_path;
use atelier_docx::ops::{self, Op};
use atelier_docx::{Docx, Signature, format};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::{AppState, request_allowed};

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

#[derive(Deserialize)]
pub struct PathQuery {
    path: String,
}

#[derive(Deserialize)]
pub struct OpBody {
    path: String,
    /// Révision affichée par le panneau ; absente = pas de contrôle.
    revision: Option<String>,
    author: String,
    #[serde(default = "yes")]
    tracked: bool,
    op: Op,
}

fn yes() -> bool {
    true
}

fn docx_path(state: &AppState, rel: &str) -> Result<PathBuf, axum::response::Response> {
    let ok_ext = Path::new(rel).extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("docx"));
    if !ok_ext {
        return Err(json_error(StatusCode::BAD_REQUEST, "ce n'est pas un fichier .docx"));
    }
    let Ok(path) = safe_project_path(&state.root, rel) else {
        return Err(json_error(StatusCode::FORBIDDEN, "outside the project"));
    };
    if !path.is_file() {
        return Err(json_error(StatusCode::NOT_FOUND, "fichier introuvable"));
    }
    Ok(path)
}

/// Word pose `~$` + la fin du nom à côté d'un document ouvert : enregistrer
/// dans Word écraserait alors les retouches faites ici.
fn open_in_word(path: &Path) -> bool {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name().and_then(|n| n.to_str())) else { return false };
    let tail: String = name.chars().skip(2).collect();
    let Ok(entries) = std::fs::read_dir(dir) else { return false };
    entries.flatten().any(|e| {
        let n = e.file_name();
        let n = n.to_string_lossy();
        n.starts_with("~$") && (n[2..] == *name || (!tail.is_empty() && n.ends_with(&tail)))
    })
}

fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

fn model_json(path: &Path) -> Result<Value, String> {
    let mut docx = Docx::open(path).map_err(|e| e.0)?;
    let model = docx.model().map_err(|e| e.0)?;
    let styles = format::styles(&mut docx).map_err(|e| e.0)?;
    let mut v = serde_json::to_value(model).map_err(|e| e.to_string())?;
    v["styles"] = json!(styles);
    v["mtime"] = json!(mtime_ms(path));
    v["openInWord"] = json!(open_in_word(path));
    Ok(v)
}

/// `GET /docx/model?path=` — paragraphes, suivis, commentaires, styles.
pub async fn model(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    match tokio::task::spawn_blocking(move || model_json(&path)).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err(e)) => json_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /docx/stat?path=` — ce que le panneau sonde pour voir arriver les
/// retouches de l'agent ou un enregistrement de Word.
pub async fn stat(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    match docx_path(&state, &q.path) {
        Ok(p) => (StatusCode::OK, Json(json!({"mtime": mtime_ms(&p), "openInWord": open_in_word(&p)}))).into_response(),
        Err(r) => r,
    }
}

/// `POST /docx/op` — une retouche ; rend le modèle à jour.
pub async fn op(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<OpBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let author = body.author.trim().chars().take(80).collect::<String>();
    if author.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "auteur manquant");
    }
    let sig = Signature::now(&author);
    let job = move || -> Result<Value, (StatusCode, String)> {
        let (result, revision) = atelier_docx::edit_file(&path, body.revision.as_deref(), |d| ops::apply(d, &body.op, body.tracked, &sig))
            .map_err(|e| (if e.is_conflict() { StatusCode::CONFLICT } else { StatusCode::UNPROCESSABLE_ENTITY }, e.0))?;
        let model = model_json(&path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        Ok(json!({"ok": true, "result": result, "revision": revision, "model": model}))
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, e))) => json_error(status, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_fichier_de_verrou_de_word_est_reconnu() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("Chapitre 2 corrigé CK.docx");
        std::fs::write(&doc, b"x").unwrap();
        assert!(!open_in_word(&doc));
        // Word garde la fin du nom pour les noms longs.
        std::fs::write(dir.path().join("~$apitre 2 corrigé CK.docx"), b"x").unwrap();
        assert!(open_in_word(&doc));
    }
}
