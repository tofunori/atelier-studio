use super::*;
static LIBRARY_READ: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Deserialize)]
pub(super) struct AnnotationsQuery { file: String }

/// Read the exact attachment's shared Atelier marks, never the whole library.
pub(super) async fn annotations(State(state): State<GatewayState>, headers: HeaderMap, Path(key): Path<String>, Query(query): Query<AnnotationsQuery>) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    if key.len() != 8 || !key.bytes().all(|c| c.is_ascii_alphanumeric())
        || query.file.is_empty() || query.file.contains(['/', '\\', '\0'])
        || !query.file.to_ascii_lowercase().ends_with(".pdf") {
        return Err(ApiError::bad_request("invalid_attachment", "Pièce jointe Zotero invalide"));
    }
    let path = state.inner.lock().await.config.atelier_dir.join("pdf_annots.json");
    let payload = tokio::task::spawn_blocking(move || -> ApiResult<Value> {
        let failed = || ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "annotations_unavailable", "Annotations du Mac indisponibles");
        let store: Value = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| failed())?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
            Err(_) => return Err(failed()),
        };
        let object = store.as_object().ok_or_else(failed)?;
        let rel = format!("zotero/{key}/{}", query.file);
        let annots = object.get(&rel).cloned().unwrap_or_else(|| json!([]));
        if !annots.is_array() { return Err(failed()); }
        Ok(json!({"attachmentKey":key, "fileName":query.file, "annots":annots}))
    }).await.map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "annotations_failed", "Lecture interrompue"))??;
    Ok(Response::builder().header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "private, no-store")
        .body(axum::body::Body::from(payload.to_string())).unwrap())
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LibraryQuery { collection_id: Option<i64> }


pub(super) async fn library(State(state): State<GatewayState>, headers: HeaderMap, Query(query): Query<LibraryQuery>) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    let dir = state.inner.lock().await.config.data_dir.join("zotero-library");
    let result = tokio::task::spawn_blocking(move || {
        let _read = LIBRARY_READ.lock().map_err(|_| "Zotero occupé".to_owned())?;
        let items = atelier_workspace::zotero_search(&dir, "", query.collection_id, None, 5000)?;
        let collections = atelier_workspace::zotero_collections(&dir)?;
        Ok::<_, String>(json!({"items": items, "collections": collections}))
    }).await.map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "zotero_failed", "Lecture Zotero interrompue"))?
        .map_err(|_| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "zotero_unavailable", "Bibliothèque Zotero indisponible sur le Mac"))?;
    Ok(Json(result))
}

pub(super) async fn pdf(State(state): State<GatewayState>, headers: HeaderMap, Path(key): Path<String>) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    if key.len() != 8 || !key.bytes().all(|c| c.is_ascii_alphanumeric()) { return Err(ApiError::bad_request("invalid_key", "Référence Zotero invalide")); }
    let dir = state.inner.lock().await.config.data_dir.join("zotero-library");
    let data = tokio::task::spawn_blocking(move || -> ApiResult<Vec<u8>> {
        let _read = LIBRARY_READ.lock().map_err(|_| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "zotero_busy", "Zotero occupé"))?;
        let items = atelier_workspace::zotero_search(&dir, "", None, None, 5000)
            .map_err(|_| ApiError::not_found("Bibliothèque Zotero indisponible"))?;
        let item = items.iter().find(|v| v["key"].as_str() == Some(&key)).ok_or_else(|| ApiError::not_found("Article Zotero introuvable"))?;
        let pdf_key = item["pdfKey"].as_str().ok_or_else(|| ApiError::not_found("Aucun PDF associé"))?;
        let filename = item["pdfFile"].as_str().ok_or_else(|| ApiError::not_found("Aucun PDF associé"))?;
        let path = atelier_workspace::pdf_absolute_path(pdf_key, filename).ok_or_else(|| ApiError::not_found("PDF absent du Mac"))?;
        // A symlinked storage item must never turn this bounded route into arbitrary file access.
        let canonical = path.canonicalize().map_err(|_| ApiError::not_found("PDF absent"))?;
        let root = std::path::PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join("Zotero/storage").canonicalize().map_err(|_| ApiError::not_found("Stockage Zotero absent"))?;
        if !canonical.starts_with(root) { return Err(ApiError::bad_request("invalid_pdf", "PDF hors du stockage Zotero")); }
        check_file_readable(&canonical)?;
        std::fs::read(canonical).map_err(|_| ApiError::not_found("PDF illisible"))
    }).await.map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "zotero_failed", "Lecture PDF interrompue"))??;
    Ok(Response::builder().header(header::CONTENT_TYPE, "application/pdf")
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, no-store")
        .body(axum::body::Body::from(data)).unwrap())
}


#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NoteBody {
    id: String, citation: String, passage: String, note: String,
    attachment_key: Option<String>,
    #[serde(default)] regions: Vec<NoteRegion>,
    #[serde(default)] expected_versions: std::collections::HashMap<String, u64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NoteRegion { page_index: u32, rect: [f64; 4] }

pub(super) async fn save_note(State(state): State<GatewayState>, headers: HeaderMap, Path(key): Path<String>, Json(body): Json<NoteBody>) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesWrite).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    let mut objects = note_objects(&key, &body)?;
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).redirect(reqwest::redirect::Policy::none()).build().map_err(zotero_error)?;
    let base = "http://127.0.0.1:23119/api";
    let info = client.get(format!("{base}/")).send().await.map_err(zotero_error)?;
    let server_id = info.headers().get("Zotero-Server-ID").and_then(|h| h.to_str().ok()).ok_or_else(|| ApiError::new(StatusCode::BAD_GATEWAY, "zotero_upgrade", "Zotero 10 doit être ouvert sur le Mac"))?.to_owned();
    let parent_response = client.get(format!("{base}/users/0/items/{key}")).header("Zotero-Server-ID", &server_id).send().await.map_err(zotero_error)?;
    if !parent_response.status().is_success() { return Err(ApiError::not_found("Article Zotero introuvable")); }
    let parent: Value = parent_response.json().await.map_err(zotero_error)?;
    if ["attachment", "note", "annotation"].contains(&parent["data"]["itemType"].as_str().unwrap_or("")) { return Err(ApiError::bad_request("invalid_parent", "Sélectionnez un article Zotero")); }
    if !body.regions.is_empty() {
        let attachment_key = body.attachment_key.as_deref().unwrap_or("");
        let attachment = client.get(format!("{base}/users/0/items/{attachment_key}")).header("Zotero-Server-ID", &server_id).send().await.map_err(zotero_error)?;
        if !attachment.status().is_success() { return Err(ApiError::not_found("PDF Zotero introuvable")); }
        let attachment: Value = attachment.json().await.map_err(zotero_error)?;
        if attachment["data"]["parentItem"].as_str() != Some(&key) || attachment["data"]["contentType"] != "application/pdf" {
            return Err(ApiError::bad_request("invalid_attachment", "Ce PDF ne correspond pas à cet article"));
        }
    }
    let mut versions = serde_json::Map::new();
    let mut writes = Vec::new();
    for object in &mut objects {
        let object_key = object["key"].as_str().unwrap().to_owned();
        let existing = client.get(format!("{base}/users/0/items/{object_key}")).header("Zotero-Server-ID", &server_id).send().await.map_err(zotero_error)?;
        if existing.status().is_success() {
            let existing: Value = existing.json().await.map_err(zotero_error)?;
            let old = &existing["data"];
            if old["parentItem"] != object["parentItem"] || old["itemType"] != object["itemType"] {
                return Err(ApiError::new(StatusCode::CONFLICT, "note_collision", "Identifiant d’annotation déjà utilisé"));
            }
            let version = existing["version"].as_u64().ok_or_else(|| ApiError::new(StatusCode::BAD_GATEWAY, "invalid_version", "Version Zotero absente"))?;
            let identical = same_annotation_fields(old, object);
            if identical { versions.insert(object_key, json!(version)); continue; }
            if body.expected_versions.get(&object_key) != Some(&version) {
                return Err(ApiError::new(StatusCode::CONFLICT, "zotero_note_changed", "Cette annotation a changé dans Zotero. Votre note locale est conservée ; vérifiez la version Zotero avant de réessayer."));
            }
            object["version"] = json!(version);
            // A note edited on the phone must not erase tags set in Zotero.
            object["tags"] = old["tags"].clone();
        } else if existing.status() != reqwest::StatusCode::NOT_FOUND {
            return Err(ApiError::new(StatusCode::BAD_GATEWAY, "zotero_read_failed", "Impossible de vérifier l’annotation Zotero"));
        } else if body.expected_versions.contains_key(&object_key) {
            return Err(ApiError::new(StatusCode::CONFLICT, "zotero_note_deleted", "Cette annotation a été supprimée dans Zotero. Votre note reste dans Atelier."));
        }
        writes.push(object.clone());
    }
    if !writes.is_empty() {
        let authorization = client.post(format!("{base}/local/authorize")).header("Zotero-Server-ID", &server_id)
            .json(&json!({"appName": "Atelier — annotations iPhone"})).send().await.map_err(zotero_error)?;
        if !authorization.status().is_success() { return Err(ApiError::new(StatusCode::FORBIDDEN, "zotero_denied", "Autorisation Zotero refusée ou indisponible. Votre note reste dans Atelier.")); }
        let authorization: Value = authorization.json().await.map_err(zotero_error)?;
        let api_key = authorization["key"].as_str().ok_or_else(|| ApiError::new(StatusCode::BAD_GATEWAY, "zotero_auth_failed", "Autorisation Zotero incomplète"))?;
        // Recheck revocation after the potentially long user authorization dialog.
        require_device(&state, &headers, Scope::FilesWrite).await?;
        let reply = client.post(format!("{base}/users/0/items")).header("Zotero-Server-ID", &server_id).header("Zotero-API-Key", api_key)
            .json(&writes).send().await.map_err(zotero_error)?;
        if !reply.status().is_success() { return Err(ApiError::new(StatusCode::BAD_GATEWAY, "zotero_write_failed", "Zotero n’a pas confirmé l’enregistrement. La note reste dans Atelier.")); }
        let reply: Value = reply.json().await.map_err(zotero_error)?;
        for (index, object) in writes.iter().enumerate() {
            let i = index.to_string();
            let success = &reply["successful"][&i];
            if success.is_null() && reply["unchanged"][&i].is_null() { return Err(ApiError::new(StatusCode::CONFLICT, "zotero_note_failed", "Zotero n’a pas confirmé toutes les annotations. Votre note est conservée ; un réessai vérifiera les annotations déjà créées.")); }
            let key = object["key"].as_str().unwrap();
            // Read the authoritative version, including for an unchanged item.
            let confirmed = client.get(format!("{base}/users/0/items/{key}")).header("Zotero-Server-ID", &server_id).send().await.map_err(zotero_error)?;
            if !confirmed.status().is_success() { return Err(ApiError::new(StatusCode::BAD_GATEWAY, "zotero_confirmation", "Annotation transmise, mais confirmation indisponible. Réessayez pour vérifier son état.")); }
            let confirmed: Value = confirmed.json().await.map_err(zotero_error)?;
            if !same_annotation_fields(&confirmed["data"], object) || confirmed["version"].as_u64().is_none() {
                return Err(ApiError::new(StatusCode::CONFLICT, "zotero_confirmation_changed", "L’annotation a changé pendant la confirmation. Votre note locale est conservée."));
            }
            versions.insert(key.to_owned(), confirmed["version"].clone());
        }
    }
    Ok(Json(json!({"ok": true, "key": objects[0]["key"], "versions": versions})))
}

fn note_objects(key: &str, body: &NoteBody) -> ApiResult<Vec<Value>> {
    let valid_key = |key: &str| key.len() == 8 && key.bytes().all(|c| c.is_ascii_alphanumeric());
    if !valid_key(key) || uuid::Uuid::parse_str(&body.id).is_err() || body.note.trim().is_empty()
        || body.note.len() + body.passage.len() > 50_000 || body.regions.len() > 1000 {
        return Err(ApiError::bad_request("invalid_note", "Note Zotero invalide"));
    }
    let object_key = |suffix: &str| {
        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(format!("atelier-note:{key}:{}:{suffix}", body.id).as_bytes());
        let alphabet = b"23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";
        hash[..8].iter().map(|b| alphabet[*b as usize % alphabet.len()] as char).collect::<String>()
    };
    if body.regions.is_empty() {
        let html = format!("<h2>{}</h2><blockquote>{}</blockquote><p>{}</p>", html_text(&body.citation), html_text(&body.passage), html_text(&body.note));
        return Ok(vec![json!({"key": object_key("note"), "version": 0, "itemType":"note", "parentItem":key, "note":html, "tags":[]})]);
    }
    let attachment = body.attachment_key.as_deref().filter(|k| valid_key(k)).ok_or_else(|| ApiError::bad_request("invalid_attachment", "PDF Zotero absent"))?;
    let mut pages = std::collections::BTreeMap::<u32, Vec<[f64; 4]>>::new();
    for region in &body.regions {
        let r = region.rect;
        if region.page_index > 99999 || r.iter().any(|v| !v.is_finite() || v.abs() > 100_000.) || r[2] <= r[0] || r[3] <= r[1] {
            return Err(ApiError::bad_request("invalid_region", "Position PDF invalide"));
        }
        pages.entry(region.page_index).or_default().push(r);
    }
    if pages.len() > 20 { return Err(ApiError::bad_request("too_many_pages", "Sélection limitée à 20 pages")); }
    Ok(pages.into_iter().map(|(page, rects)| json!({
        "key": object_key(&format!("page-{page}")), "version":0, "itemType":"annotation", "parentItem":attachment,
        "annotationType":"highlight", "annotationText":body.passage, "annotationComment":body.note,
        "annotationColor":"#ffd400", "annotationPageLabel":(page+1).to_string(),
        "annotationSortIndex":format!("{page:05}|000000|00000"),
        "annotationPosition":json!({"pageIndex":page,"rects":rects}).to_string(), "tags":[]
    })).collect())
}
fn same_annotation_fields(old: &Value, desired: &Value) -> bool {
    desired.as_object().is_some_and(|fields| fields.iter()
        .filter(|(k, _)| !["key", "version", "tags"].contains(&k.as_str()))
        .all(|(k, v)| {
            if k == "annotationPosition" {
                let parse = |value: &Value| value.as_str().and_then(|s| serde_json::from_str::<Value>(s).ok()).unwrap_or_else(|| value.clone());
                parse(&old[k]) == parse(v)
            } else { old.get(k) == Some(v) }
        }))
}
fn html_text(text: &str) -> String { text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\n', "<br>") }
fn zotero_error(_: reqwest::Error) -> ApiError { ApiError::new(StatusCode::BAD_GATEWAY, "zotero_unavailable", "Zotero doit être ouvert sur le Mac. Si une autorisation est affichée, répondez dans Zotero puis réessayez.") }

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn highlight_objects_are_stable_and_grouped_by_page() {
        let body: NoteBody = serde_json::from_value(json!({"id":"dcb00329-a75a-4d9b-bbb1-6b9a42f00a12","citation":"page 2","passage":"Texte","note":"Note","attachmentKey":"ABCD2345","regions":[{"pageIndex":1,"rect":[10,20,30,40]},{"pageIndex":1,"rect":[10,10,30,19]},{"pageIndex":2,"rect":[10,20,30,40]}]})).unwrap();
        let objects = note_objects("ZYXW6789", &body).unwrap();
        assert_eq!(objects.len(), 2);
        let position: Value = serde_json::from_str(objects[0]["annotationPosition"].as_str().unwrap()).unwrap();
        assert_eq!(position["rects"].as_array().unwrap().len(),2);
        assert_eq!(objects[0]["parentItem"], "ABCD2345");
        assert_eq!(objects, note_objects("ZYXW6789", &body).unwrap());
    }
    #[test] fn note_markup_is_escaped_and_invalid_rects_refused() {
        assert_eq!(html_text("<script>&"), "&lt;script&gt;&amp;");
        let body: NoteBody = serde_json::from_value(json!({"id":"dcb00329-a75a-4d9b-bbb1-6b9a42f00a12","citation":"page 1","passage":"Texte","note":"Note","attachmentKey":"ABCD2345","regions":[{"pageIndex":1,"rect":[10,20,0,40]}]})).unwrap();
        assert!(note_objects("ZYXW6789", &body).is_err());
    }
}
