//! Brouillons de secours des éditeurs (LaTeX, Markdown, code).
//!
//! Un tampon modifié et non enregistré vit dans l'iframe de l'éditeur : fermer
//! l'onglet, changer de projet, passer en vue chat seule ou quitter l'app
//! démonte cette iframe et le texte disparaissait (audit du 2026-10-18). Les
//! éditeurs écrivent donc régulièrement leur tampon ici, et le relisent à la
//! réouverture du fichier : le texte revient avec son état « modifié », jamais
//! écrit en silence dans le fichier lui-même.
//!
//! Le stockage est côté serveur, pas dans le `localStorage` de la WebView, qui
//! ne survit pas au redémarrage de l'app (docs/PIEGES_CONNUS.md §1).
//!
//! - `GET /draft?path=` : `{ok:true, draft:{text, base, baseMtime, savedAt} | null}`
//! - `POST /draft {path, text, base, baseMtime}` : écrit le brouillon
//! - `POST /draft {path, clear:true}` : l'efface (tampon enregistré ou abandonné)
//!
//! Fichier : `.fig_thumbs/drafts/<md5(realpath)>.json`, écrit atomiquement.

use atelier_core::{atomic_write, safe_project_path};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use md5::{Digest as Md5Digest, Md5};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{AppState, request_allowed};

/// Plafond d'un brouillon (texte + base) : un chapitre de thèse tient
/// largement dedans ; au-delà, l'éditeur garde seulement son tampon.
pub const DRAFT_MAX_BYTES: usize = 16 * 1024 * 1024;

#[derive(Deserialize)]
pub struct DraftQuery {
    path: String,
}

#[derive(Deserialize)]
pub struct DraftBody {
    path: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    base: Option<String>,
    #[serde(default, rename = "baseMtime")]
    base_mtime: Option<f64>,
    #[serde(default)]
    clear: bool,
}

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"ok": false, "error": message.into()}))).into_response()
}

/// Chemin réel d'un fichier (liens symboliques résolus), le chemin donné
/// s'il n'existe pas encore.
fn real_path(path: &Path) -> String {
    fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// Même clé que le journal des versions (`dv_versions`) : chemin réel du
/// fichier, pour qu'un même fichier ouvert par deux chemins partage son
/// brouillon (`read_draft` compare aussi les chemins réels).
pub fn draft_file(project: &Path, path: &Path) -> PathBuf {
    let mut hasher = Md5::new();
    hasher.update(real_path(path).as_bytes());
    let key = hex::encode(hasher.finalize());
    project
        .join(".fig_thumbs")
        .join("drafts")
        .join(format!("{key}.json"))
}

/// Lit un brouillon. Un fichier absent, illisible ou d'un autre fichier
/// (collision improbable de hachage) ne donne aucun brouillon : on ne
/// restaure jamais un texte dont on n'est pas sûr.
pub fn read_draft(file: &Path, path: &Path) -> Option<Value> {
    let raw = fs::read(file).ok()?;
    let value: Value = serde_json::from_slice(&raw).ok()?;
    let stored = value.get("path").and_then(Value::as_str)?;
    if stored != path.to_string_lossy() && real_path(Path::new(stored)) != real_path(path) {
        return None;
    }
    let text = value.get("text").and_then(Value::as_str)?;
    Some(json!({
        "text": text,
        "base": value.get("base").cloned().unwrap_or(Value::Null),
        "baseMtime": value.get("baseMtime").cloned().unwrap_or(Value::Null),
        "savedAt": value.get("savedAt").cloned().unwrap_or(Value::Null),
    }))
}

fn now_secs() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

/// `GET /draft?path=`
pub async fn get_draft(
    State(state): State<AppState>,
    Query(query): Query<DraftQuery>,
) -> impl IntoResponse {
    let Ok(path) = safe_project_path(&state.root, &query.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let draft = read_draft(&draft_file(&state.root, &path), &path).unwrap_or(Value::Null);
    (StatusCode::OK, Json(json!({"ok": true, "draft": draft}))).into_response()
}

/// `POST /draft`
pub async fn post_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<DraftBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(path) = safe_project_path(&state.root, &body.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let file = draft_file(&state.root, &path);
    if body.clear {
        return match fs::remove_file(&file) {
            Ok(()) => (StatusCode::OK, Json(json!({"ok": true, "cleared": true}))).into_response(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                (StatusCode::OK, Json(json!({"ok": true, "cleared": false}))).into_response()
            }
            Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        };
    }
    let Some(text) = body.text else {
        return json_error(StatusCode::BAD_REQUEST, "text must be a string");
    };
    let size = text.len() + body.base.as_ref().map_or(0, String::len);
    if size > DRAFT_MAX_BYTES {
        return json_error(StatusCode::PAYLOAD_TOO_LARGE, "draft too large");
    }
    let base_mtime = body.base_mtime.filter(|value| value.is_finite());
    let record = json!({
        "v": 1,
        "path": path.to_string_lossy(),
        "text": text,
        "base": body.base,
        "baseMtime": base_mtime,
        "savedAt": now_secs(),
    });
    let payload = match serde_json::to_vec(&record) {
        Ok(bytes) => bytes,
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    };
    match atomic_write(&file, &payload) {
        Ok(()) => (StatusCode::OK, Json(json!({"ok": true}))).into_response(),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_draft_of_another_file_is_never_restored() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("d.json");
        fs::write(
            &file,
            serde_json::to_vec(
                &json!({"v":1,"path":"/a.tex","text":"x","base":"b","baseMtime":1.0}),
            )
            .unwrap(),
        )
        .unwrap();
        assert!(read_draft(&file, Path::new("/b.tex")).is_none());
        let draft = read_draft(&file, Path::new("/a.tex")).unwrap();
        assert_eq!(draft["text"], "x");
        assert_eq!(draft["base"], "b");
    }

    #[test]
    fn a_corrupt_draft_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("d.json");
        fs::write(&file, b"{\"path\":\"/a.tex\",\"text\":").unwrap();
        assert!(read_draft(&file, Path::new("/a.tex")).is_none());
        assert!(read_draft(&dir.path().join("absent.json"), Path::new("/a.tex")).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn a_draft_follows_the_file_through_a_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("these.tex");
        fs::write(&real, "x").unwrap();
        let link = dir.path().join("lien.tex");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        // même clé de brouillon par les deux chemins
        assert_eq!(draft_file(dir.path(), &real), draft_file(dir.path(), &link));
        let file = dir.path().join("d.json");
        fs::write(
            &file,
            serde_json::to_vec(&json!({"v":1,"path":real.to_string_lossy(),"text":"tampon"}))
                .unwrap(),
        )
        .unwrap();
        // écrit sous le vrai chemin, relu par le lien : restauré
        assert_eq!(read_draft(&file, &link).unwrap()["text"], "tampon");
    }
}
