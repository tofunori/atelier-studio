use super::*;
static LIBRARY_READ: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Deserialize)]
pub(super) struct AnnotationsQuery { file: String }

/// Key of a Zotero PDF in the Mac viewer's store (`pdf_annots.json`).
fn shared_rel(key: &str, file: &str) -> ApiResult<String> {
    if key.len() != 8 || !key.bytes().all(|c| c.is_ascii_alphanumeric())
        || file.is_empty() || file.contains(['/', '\\', '\0'])
        || !file.to_ascii_lowercase().ends_with(".pdf") {
        return Err(ApiError::bad_request("invalid_attachment", "Pièce jointe Zotero invalide"));
    }
    Ok(format!("zotero/{key}/{file}"))
}

/// Read the exact attachment's shared Atelier marks, never the whole library.
pub(super) async fn annotations(State(state): State<GatewayState>, headers: HeaderMap, Path(key): Path<String>, Query(query): Query<AnnotationsQuery>) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    let rel = shared_rel(&key, &query.file)?;
    let path = state.inner.lock().await.config.atelier_dir.join("pdf_annots.json");
    let payload = tokio::task::spawn_blocking(move || -> ApiResult<Value> {
        let failed = || ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "annotations_unavailable", "Annotations du Mac indisponibles");
        let store: Value = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| failed())?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
            Err(_) => return Err(failed()),
        };
        let object = store.as_object().ok_or_else(failed)?;
        let annots = object.get(&rel).cloned().unwrap_or_else(|| json!([]));
        if !annots.is_array() { return Err(failed()); }
        Ok(json!({"attachmentKey":key, "fileName":query.file, "annots":annots}))
    }).await.map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "annotations_failed", "Lecture interrompue"))??;
    Ok(Response::builder().header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "private, no-store")
        .body(axum::body::Body::from(payload.to_string())).unwrap())
}

#[derive(Deserialize)]
pub(super) struct PhoneMarks { marks: Vec<PhoneMark> }
#[derive(Deserialize)]
struct PhoneMark { id: String, #[serde(default)] annots: Vec<PhoneAnnot> }
/// One page of an iPhone mark, already in the viewer's format: `rects` are
/// `[x, y, w, h]` fractions of the displayed page, top left, one per line.
#[derive(Deserialize)]
struct PhoneAnnot { page: u32, rects: Vec<[f64; 4]>, text: String, kind: String, color: String, #[serde(default)] memo: String }

/// Marks made on the iPhone go into the Mac viewer's store, under the lock the
/// gallery server and the annotations MCP take. A mark is the group of
/// `iphone-{uuid}-p{page}` entries and is replaced as a whole: sending it again
/// changes nothing, sending it without `annots` removes it. Everything else in
/// the store, the Mac's own marks included, is kept.
pub(super) async fn save_annotations(State(state): State<GatewayState>, headers: HeaderMap, Path(key): Path<String>, Query(query): Query<AnnotationsQuery>, Json(body): Json<PhoneMarks>) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesWrite).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    let rel = shared_rel(&key, &query.file)?;
    let groups = phone_groups(&body)?;
    let dir = state.inner.lock().await.config.atelier_dir.clone();
    let annots = tokio::task::spawn_blocking(move || replace_phone_marks(&dir, &rel, &groups))
        .await.map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "annotations_failed", "Écriture interrompue"))??;
    let payload = json!({"attachmentKey":key, "fileName":query.file, "annots":annots});
    Ok(Response::builder().header(header::CONTENT_TYPE, "application/json")
        .header(header::CACHE_CONTROL, "private, no-store")
        .body(axum::body::Body::from(payload.to_string())).unwrap())
}

fn phone_groups(body: &PhoneMarks) -> ApiResult<Vec<(String, Vec<Value>)>> {
    let invalid = || ApiError::bad_request("invalid_annotation", "Annotation iPhone invalide");
    let rect_ok = |r: &[f64; 4]| r.iter().all(|v| v.is_finite()) && r[0] >= 0. && r[1] >= 0.
        && r[2] > 0. && r[3] > 0. && r[0] + r[2] <= 1.001 && r[1] + r[3] <= 1.001;
    // `rgba(…)` only: the viewer writes this value into a style attribute.
    let color_ok = |c: &str| c.len() <= 40 && c.strip_prefix("rgba(").and_then(|c| c.strip_suffix(')'))
        .is_some_and(|c| c.bytes().all(|b| b.is_ascii_digit() || b"., ".contains(&b)));
    if body.marks.len() > 500 { return Err(invalid()); }
    let mut groups = Vec::new();
    for mark in &body.marks {
        let group = format!("iphone-{}", uuid::Uuid::parse_str(&mark.id).map_err(|_| invalid())?);
        if mark.annots.len() > 20 || groups.iter().any(|(g, _)| g == &group) { return Err(invalid()); }
        let mut annots: Vec<Value> = Vec::new();
        for a in &mark.annots {
            if a.page == 0 || a.page > 100_000 || annots.iter().any(|o| o["page"] == a.page)
                || a.rects.is_empty() || a.rects.len() > 500 || !a.rects.iter().all(rect_ok)
                || !["hl", "ul"].contains(&a.kind.as_str()) || !color_ok(&a.color)
                || a.text.trim().is_empty() || a.text.len() > 20_000 || a.memo.len() > 20_000 {
                return Err(invalid());
            }
            let mut annot = json!({"id": format!("{group}-p{}", a.page), "page": a.page, "rects": a.rects,
                "text": a.text, "kind": a.kind, "color": a.color, "note": "", "by": "iphone"});
            if !a.memo.trim().is_empty() { annot["memo"] = json!(a.memo.trim()); }
            annots.push(annot);
        }
        groups.push((group, annots));
    }
    Ok(groups)
}

/// Replaces each group in place and returns the attachment's marks. The store
/// is rewritten (in one rename) only when something changed, so a mark sent
/// again does not make an open viewer reload.
fn replace_phone_marks(dir: &std::path::Path, rel: &str, groups: &[(String, Vec<Value>)]) -> ApiResult<Value> {
    use fs2::FileExt;
    let failed = || ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "annotations_unavailable", "Annotations du Mac indisponibles");
    std::fs::create_dir_all(dir).map_err(|_| failed())?;
    let path = dir.join("pdf_annots.json");
    let lock = std::fs::OpenOptions::new().create(true).truncate(false).read(true).write(true)
        .open(dir.join("pdf_annots.lock")).map_err(|_| failed())?;
    lock.lock_exclusive().map_err(|_| failed())?;
    let result = (|| {
        // An unreadable store is never replaced: that would lose every mark.
        let mut store: Value = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| failed())?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
            Err(_) => return Err(failed()),
        };
        let map = store.as_object_mut().ok_or_else(failed)?;
        let before = map.get(rel).cloned();
        let mut list = match &before {
            Some(Value::Array(list)) => list.clone(),
            None => Vec::new(),
            Some(_) => return Err(failed()),
        };
        for (group, annots) in groups {
            let member = |a: &Value| a["id"].as_str()
                .is_some_and(|id| id.strip_prefix(group.as_str()).is_some_and(|rest| rest.is_empty() || rest.starts_with('-')));
            let at = list.iter().position(member).unwrap_or(list.len());
            let old: Vec<Value> = list.iter().filter(|a| member(a)).cloned().collect();
            list.retain(|a| !member(a));
            let fresh = annots.iter().map(|annot| {
                let mut annot = annot.clone();
                // A chat text typed on the Mac for this passage stays.
                if let Some(note) = old.iter().find(|o| o["id"] == annot["id"]).and_then(|o| o.get("note")) {
                    annot["note"] = note.clone();
                }
                annot
            });
            list.splice(at.min(list.len())..at.min(list.len()), fresh);
        }
        let after = Value::Array(list);
        if before.as_ref().unwrap_or(&json!([])) != &after {
            map.insert(rel.to_owned(), after.clone());
            let payload = format!("{}\n", serde_json::to_string_pretty(&store).map_err(|_| failed())?);
            let tmp = dir.join(format!(".pdf_annots.json.{}.remote.tmp", std::process::id()));
            std::fs::write(&tmp, payload).map_err(|_| failed())?;
            std::fs::rename(&tmp, &path).map_err(|_| failed())?;
        }
        Ok(after)
    })();
    let _ = FileExt::unlock(&lock);
    result
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

/// Item key -> (attachment key, file name), remembered briefly so a viewer
/// reading a PDF by ranges does not rescan the library on every request.
static PDF_LOCATIONS: std::sync::Mutex<Vec<(String, std::time::Instant, String, String)>> = std::sync::Mutex::new(Vec::new());
const PDF_LOCATION_TTL: std::time::Duration = std::time::Duration::from_secs(60);

/// Finds the stored attachment of `key` (`true` when it was remembered).
/// Only the library scan holds `LIBRARY_READ`; the PDF itself is read
/// later, without any lock.
fn pdf_location(dir: &std::path::Path, key: &str, rescan: bool) -> ApiResult<(String, String, bool)> {
    let remembered = PDF_LOCATIONS.lock().ok().filter(|_| !rescan).and_then(|cache| cache.iter()
        .find(|(k, at, _, _)| k == key && at.elapsed() < PDF_LOCATION_TTL)
        .map(|(_, _, pdf_key, file)| (pdf_key.clone(), file.clone(), true)));
    if let Some(found) = remembered { return Ok(found); }
    let items = {
        let _read = LIBRARY_READ.lock().map_err(|_| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "zotero_busy", "Zotero occupé"))?;
        atelier_workspace::zotero_search(dir, "", None, None, 5000)
            .map_err(|_| ApiError::not_found("Bibliothèque Zotero indisponible"))?
    };
    let item = items.iter().find(|v| v["key"].as_str() == Some(key)).ok_or_else(|| ApiError::not_found("Article Zotero introuvable"))?;
    let pdf_key = item["pdfKey"].as_str().ok_or_else(|| ApiError::not_found("Aucun PDF associé"))?.to_owned();
    let filename = item["pdfFile"].as_str().ok_or_else(|| ApiError::not_found("Aucun PDF associé"))?.to_owned();
    if let Ok(mut cache) = PDF_LOCATIONS.lock() {
        cache.retain(|(k, at, _, _)| k != key && at.elapsed() < PDF_LOCATION_TTL);
        if cache.len() >= 64 { cache.remove(0); }
        cache.push((key.to_owned(), std::time::Instant::now(), pdf_key.clone(), filename.clone()));
    }
    Ok((pdf_key, filename, false))
}

/// Canonical path, size and validator of a stored Zotero PDF.
fn stored_pdf(pdf_key: &str, filename: &str) -> ApiResult<(std::path::PathBuf, u64, String)> {
    let path = atelier_workspace::pdf_absolute_path(pdf_key, filename).ok_or_else(|| ApiError::not_found("PDF absent du Mac"))?;
    // A symlinked storage item must never turn this bounded route into arbitrary file access.
    let canonical = path.canonicalize().map_err(|_| ApiError::not_found("PDF absent"))?;
    let root = atelier_workspace::zotero_dir().join("storage").canonicalize().map_err(|_| ApiError::not_found("Stockage Zotero absent"))?;
    if !canonical.starts_with(root) { return Err(ApiError::bad_request("invalid_pdf", "PDF hors du stockage Zotero")); }
    let (len, mime) = check_file_readable(&canonical)?;
    if mime != "application/pdf" { return Err(ApiError::bad_request("invalid_pdf", "La pièce jointe n’est pas un PDF")); }
    let etag = file_etag(&canonical, len);
    Ok((canonical, len, etag))
}

/// Streams the item's PDF like the project file route: `ETag`, 304 on a
/// matching `If-None-Match`, single `Range`, and `private, no-cache` so the
/// phone revalidates instead of downloading the whole PDF again.
pub(super) async fn pdf(State(state): State<GatewayState>, headers: HeaderMap, Path(key): Path<String>) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    if key.len() != 8 || !key.bytes().all(|c| c.is_ascii_alphanumeric()) { return Err(ApiError::bad_request("invalid_key", "Référence Zotero invalide")); }
    let permit = state.file_calls.clone().try_acquire_owned().map_err(|_| ApiError::rate_limited())?;
    let dir = state.inner.lock().await.config.data_dir.join("zotero-library");
    let (path, len, etag) = tokio::task::spawn_blocking(move || {
        let (pdf_key, filename, remembered) = pdf_location(&dir, &key, false)?;
        match stored_pdf(&pdf_key, &filename) {
            // The attachment may have been replaced since it was remembered.
            Err(_) if remembered => {
                let (pdf_key, filename, _) = pdf_location(&dir, &key, true)?;
                stored_pdf(&pdf_key, &filename)
            }
            found => found,
        }
    }).await.map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "zotero_failed", "Lecture PDF interrompue"))??;
    let mut response = stream_resolved_file(permit, path, len, "application/pdf".into(), etag, &headers).await?;
    response.headers_mut().insert(header::CACHE_CONTROL, header::HeaderValue::from_static("private, no-cache"));
    Ok(response)
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
    fn phone(value: Value) -> ApiResult<Vec<(String, Vec<Value>)>> {
        phone_groups(&serde_json::from_value(value).unwrap())
    }
    const MARK: &str = "dcb00329-a75a-4d9b-bbb1-6b9a42f00a12";
    fn page(page: u32, memo: &str) -> Value {
        json!({"page": page, "rects": [[0.1, 0.2, 0.5, 0.02]], "text": "Black carbon", "kind": "hl", "color": "rgba(120,220,140,.40)", "memo": memo})
    }
    #[test] fn phone_marks_become_viewer_entries() {
        let groups = phone(json!({"marks": [{"id": MARK.to_uppercase(), "annots": [page(2, " à citer "), page(3, "")]}]})).unwrap();
        let (group, annots) = &groups[0];
        assert_eq!(group, &format!("iphone-{MARK}"));
        assert_eq!(annots[0]["id"], format!("iphone-{MARK}-p2"));
        assert_eq!(annots[0]["memo"], "à citer");
        assert_eq!(annots[0]["by"], "iphone");
        assert!(annots[1].get("memo").is_none());
        // removal = a mark without annots
        assert!(phone(json!({"marks": [{"id": MARK}]})).unwrap()[0].1.is_empty());
    }
    #[test] fn invalid_phone_marks_are_refused() {
        let mut bad_rect = page(1, ""); bad_rect["rects"] = json!([[0.8, 0.2, 0.5, 0.02]]);
        let mut bad_color = page(1, ""); bad_color["color"] = json!("red;background:url(x)");
        let mut bad_kind = page(1, ""); bad_kind["kind"] = json!("area");
        for annots in [json!([bad_rect]), json!([bad_color]), json!([bad_kind]), json!([page(0, "")]), json!([page(1, ""), page(1, "")])] {
            assert!(phone(json!({"marks": [{"id": MARK, "annots": annots}]})).is_err());
        }
        assert!(phone(json!({"marks": [{"id": "../x", "annots": []}]})).is_err());
        assert!(phone(json!({"marks": [{"id": MARK}, {"id": MARK}]})).is_err());
    }
    #[test] fn phone_marks_replace_only_their_group() {
        let dir = tempfile::tempdir().unwrap();
        let store = dir.path().join("pdf_annots.json");
        let rel = "zotero/ABCD2345/a.pdf";
        let mac = json!({"id": "1700-3", "page": 3, "text": "Mac", "kind": "hl"});
        let stale = json!({"id": format!("iphone-{MARK}-p9"), "page": 9, "note": "déjà au chat"});
        let kept = json!({"id": format!("iphone-{MARK}0-p1"), "page": 1});
        std::fs::write(&store, json!({rel: [mac, stale, kept], "other.pdf": [{"id": "x"}]}).to_string()).unwrap();
        let mut groups = phone(json!({"marks": [{"id": MARK, "annots": [page(9, "")]}]})).unwrap();
        let annots = replace_phone_marks(dir.path(), rel, &groups).unwrap();
        let ids: Vec<_> = annots.as_array().unwrap().iter().map(|a| a["id"].as_str().unwrap().to_owned()).collect();
        assert_eq!(ids, ["1700-3".to_owned(), format!("iphone-{MARK}-p9"), format!("iphone-{MARK}0-p1")]);
        assert_eq!(annots[1]["note"], "déjà au chat");
        assert_eq!(annots[1]["text"], "Black carbon");
        let written: Value = serde_json::from_slice(&std::fs::read(&store).unwrap()).unwrap();
        assert_eq!(written["other.pdf"], json!([{"id": "x"}]));
        // sending the same mark again leaves the file untouched
        let modified = std::fs::metadata(&store).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        assert_eq!(replace_phone_marks(dir.path(), rel, &groups).unwrap(), annots);
        assert_eq!(std::fs::metadata(&store).unwrap().modified().unwrap(), modified);
        groups[0].1.clear();
        let annots = replace_phone_marks(dir.path(), rel, &groups).unwrap();
        assert_eq!(annots.as_array().unwrap().len(), 2);
        // an unreadable store is never replaced
        std::fs::write(&store, "broken").unwrap();
        assert!(replace_phone_marks(dir.path(), rel, &groups).is_err());
        assert_eq!(std::fs::read_to_string(&store).unwrap(), "broken");
    }
    #[test] fn note_markup_is_escaped_and_invalid_rects_refused() {
        assert_eq!(html_text("<script>&"), "&lt;script&gt;&amp;");
        let body: NoteBody = serde_json::from_value(json!({"id":"dcb00329-a75a-4d9b-bbb1-6b9a42f00a12","citation":"page 1","passage":"Texte","note":"Note","attachmentKey":"ABCD2345","regions":[{"pageIndex":1,"rect":[10,20,0,40]}]})).unwrap();
        assert!(note_objects("ZYXW6789", &body).is_err());
    }
}
