//! Codage qualitatif (façon NVivo) : le livre de codes et les codes posés sur
//! les passages des PDF Zotero. Le format et les règles vivent dans
//! `atelier-codebook`, partagé avec le MCP des annotations.
//!
//! - `GET /codebook` : les codes, dans l'ordre de l'arbre.
//! - `POST /codebook` : `op` = `create` (`name`, `parent`, `memo`), `update`
//!   (`id` et les champs à changer ; `parent: null` = à la racine) ou
//!   `delete` (`id` : le code, ses sous-codes, et leurs traces dans les
//!   annotations).
//! - `POST /pdfannot-codes` : change les codes d'une annotation (`rel`, `id`,
//!   `add`, `remove`, `keep`, `reject`) sans renvoyer toute la liste du PDF.
//!   Un passage codé (`kind: "code"`) sans plus aucun code disparaît.

use atelier_codebook::{self as codebook, Change, Codebook};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

use crate::documents::{is_zotero_pdf_rel, shared_pdf_annots_path};
use crate::{AppState, request_allowed};

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"ok": false, "error": message.into()}))).into_response()
}

/// Dossier du store commun : le livre de codes est rangé à côté.
fn shared_dir(root: &Path) -> PathBuf {
    shared_pdf_annots_path(root)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| root.to_path_buf())
}

/// Date d'écriture du livre de codes (ms, 0 s'il n'existe pas) : le lecteur
/// la veille avec celle du store.
pub(crate) fn codebook_stamp(root: &Path) -> u64 {
    std::fs::metadata(shared_dir(root).join(codebook::FILE_NAME))
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn codes_json(book: &Codebook) -> Value {
    Value::Array(
        book.ordered()
            .into_iter()
            .map(|(depth, code)| {
                let mut v = code.to_value();
                v["depth"] = json!(depth);
                v["path"] = json!(book.path(&code.id));
                v
            })
            .collect(),
    )
}

pub async fn get_codebook(State(state): State<AppState>) -> impl IntoResponse {
    let root = state.root.clone();
    let result = tokio::task::spawn_blocking(move || {
        codebook::read(&shared_dir(&root)).map(|book| (codes_json(&book), codebook_stamp(&root)))
    })
    .await;
    match result {
        Ok(Ok((codes, stamp))) => (StatusCode::OK, Json(json!({"codes": codes, "stamp": stamp}))).into_response(),
        Ok(Err(error)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

fn text<'a>(body: &'a Value, key: &str) -> Option<&'a str> {
    body.get(key).and_then(Value::as_str)
}

/// `parent` absent = inchangé ; `null` ou vide = à la racine.
fn parent_arg(body: &Value) -> Option<Option<&str>> {
    match body.get("parent") {
        None => None,
        Some(Value::String(s)) if !s.trim().is_empty() => Some(Some(s.as_str())),
        Some(_) => Some(None),
    }
}

/// Erreur de l'utilisateur (nom vide, doublon, boucle…) plutôt que du disque.
fn is_user_error(error: &str) -> bool {
    !error.contains("illisible") && !error.contains("JSON") && !error.contains("os error")
}

pub async fn post_codebook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "loopback origin required");
    }
    let root = state.root.clone();
    let result = tokio::task::spawn_blocking(move || {
        codebook::with_locked(&shared_dir(&root), |store, book| {
            let op = text(&body, "op").unwrap_or("");
            let id = text(&body, "id").unwrap_or("");
            match op {
                "create" => {
                    let parent = parent_arg(&body).flatten();
                    let (code, created) =
                        book.create(text(&body, "name").unwrap_or(""), parent, text(&body, "memo").unwrap_or(""))?;
                    Ok((json!({"code": code.to_value(), "created": created}), false, created))
                }
                "update" => {
                    let code = book.update(
                        id,
                        text(&body, "name"),
                        parent_arg(&body),
                        text(&body, "memo"),
                        body.get("order").and_then(Value::as_i64),
                    )?;
                    Ok((json!({"code": code.to_value()}), false, true))
                }
                "delete" => {
                    let gone = book.delete(id)?;
                    let stripped = codebook::strip(store, &gone);
                    Ok((json!({"removed": gone}), stripped, true))
                }
                _ => Err("op inconnue : create, update ou delete".into()),
            }
            .map(|(mut value, store_changed, book_changed): (Value, bool, bool)| {
                value["codes"] = codes_json(book);
                (value, store_changed, book_changed)
            })
        })
    })
    .await
    .unwrap_or_else(|error| Err(error.to_string()));
    match result {
        Ok(mut value) => {
            value["ok"] = json!(true);
            (StatusCode::OK, Json(value)).into_response()
        }
        Err(error) if is_user_error(&error) => json_error(StatusCode::BAD_REQUEST, error),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

fn id_list(body: &Value, key: &str) -> Vec<String> {
    codebook::ids(body, key)
}

pub async fn post_pdfannot_codes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "loopback origin required");
    }
    let rel = text(&body, "rel").unwrap_or("").to_string();
    let id = match body.get("id") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    };
    if !is_zotero_pdf_rel(&rel) || id.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "rel (PDF Zotero) et id requis");
    }
    let change = Change {
        add: id_list(&body, "add"),
        remove: id_list(&body, "remove"),
        keep: id_list(&body, "keep"),
        reject: id_list(&body, "reject"),
        suggest: Vec::new(),
    };
    let root = state.root.clone();
    let result = tokio::task::spawn_blocking(move || {
        codebook::with_locked(&shared_dir(&root), |store, book| {
            if let Some(unknown) = change.add.iter().find(|c| book.get(c).is_none()) {
                return Err(format!("Code inconnu : {unknown}"));
            }
            let Some(list) = store.get_mut(&rel).and_then(Value::as_array_mut) else {
                return Err("Annotation introuvable.".into());
            };
            let Some(at) = list.iter().position(|a| match a.get("id") {
                Some(Value::String(s)) => *s == id,
                Some(Value::Number(n)) => n.to_string() == id,
                _ => false,
            }) else {
                return Err("Annotation introuvable.".into());
            };
            let changed = codebook::apply(&mut list[at], &change);
            if codebook::is_empty_code_passage(&list[at]) {
                list.remove(at);
                return Ok((Value::Null, true, false));
            }
            Ok((list[at].clone(), changed, false))
        })
    })
    .await
    .unwrap_or_else(|error| Err(error.to_string()));
    match result {
        Ok(annot) => (StatusCode::OK, Json(json!({"ok": true, "annot": annot}))).into_response(),
        Err(error) if error == "Annotation introuvable." => json_error(StatusCode::NOT_FOUND, error),
        Err(error) if is_user_error(&error) => json_error(StatusCode::BAD_REQUEST, error),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}
