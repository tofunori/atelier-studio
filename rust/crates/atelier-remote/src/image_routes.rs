//! Authenticated, bounded access to native Codex image-generation artifacts.
//!
//! The image URL is an opaque `(thread_id, event_id)` reference.  The client
//! never supplies a filesystem path: the path is read from the durable native
//! journal and is accepted only when it resolves below the configured native
//! Codex `generated_images/` directory.

use super::*;
use std::io::Read;
use std::path::{Component, Path as FsPath, PathBuf};

// Keep the wire/memory bound aligned with the native companion's decode cap.
const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_REFERENCE_LENGTH: usize = 128;
const MAX_PATH_LENGTH: usize = 4096;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImageFormat {
    Png,
    Jpeg,
    Gif,
    Webp,
}

impl ImageFormat {
    fn mime(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Gif => "image/gif",
            Self::Webp => "image/webp",
        }
    }

    fn extension_allowed(self, extension: &str) -> bool {
        match self {
            Self::Png => extension == "png",
            Self::Jpeg => matches!(extension, "jpg" | "jpeg"),
            Self::Gif => extension == "gif",
            Self::Webp => extension == "webp",
        }
    }
}

/// GET `/remote/v1/threads/{thread_id}/images/{event_id}`.
///
/// Both scopes are deliberate.  Chat read authorizes looking up the event;
/// files read authorizes returning bytes from the Mac filesystem.  Keeping
/// these checks separate also preserves the gateway's existing scope errors
/// for older devices.
pub(super) async fn image(
    State(state): State<GatewayState>,
    headers: HeaderMap,
    Path((thread_id, event_id)): axum::extract::Path<(String, String)>,
) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::ChatRead).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;

    validate_reference(&thread_id, "thread")?;
    validate_reference(&event_id, "image")?;

    let (events, root) = {
        let g = state.inner.lock().await;
        let events = g
            .fixture_history
            .get(&thread_id)
            .cloned()
            .unwrap_or_else(|| g.journal.materialize(&thread_id));
        (events, g.config.generated_images_dir.clone())
    };
    let raw_path = find_image_path(&events, &thread_id, &event_id)
        .ok_or_else(|| ApiError::not_found("image générée introuvable"))?;

    // File I/O is synchronous; keep it outside the gateway mutex and bound
    // both the size check and the amount read in case the file changes while
    // the request is in flight.
    let loaded = tokio::task::spawn_blocking(move || load_image(&root, &raw_path))
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "image_read_failed",
                "lecture de l’image interrompue",
            )
        })??;
    let (bytes, format) = loaded;

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, format.mime())
        .header(header::CONTENT_LENGTH, bytes.len())
        .header(header::CACHE_CONTROL, "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Disposition", "inline")
        .body(axum::body::Body::from(bytes))
        .unwrap())
}

pub(super) async fn save_to_gallery(
    State(state): State<GatewayState>, headers: HeaderMap,
    Path((thread_id, event_id)): axum::extract::Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    guard_headers(&state, &headers).await?;
    require_device(&state, &headers, Scope::ChatRead).await?;
    require_device(&state, &headers, Scope::FilesRead).await?;
    require_device(&state, &headers, Scope::FilesWrite).await?;
    validate_reference(&thread_id, "thread")?;
    validate_reference(&event_id, "image")?;
    let (events, source_root, project) = {
        let mut g = state.inner.lock().await;
        g.threads = atelier_store::ThreadStore::open(g.config.atelier_dir.join("threads.json"));
        let thread = g.threads.get(&thread_id).ok_or_else(|| ApiError::not_found("conversation introuvable"))?;
        if thread.project_root.is_empty() { return Err(ApiError::bad_request("no_project", "Ce chat n’est associé à aucun projet")); }
        let id = crate::path_policy::project_id_for(FsPath::new(&thread.project_root));
        let project = g.projects.get(&id).cloned().ok_or_else(|| ApiError::not_found("projet introuvable"))?;
        let events = g.fixture_history.get(&thread_id).cloned().unwrap_or_else(|| g.journal.materialize(&thread_id));
        (events, g.config.generated_images_dir.clone(), project)
    };
    let raw_path = find_image_path(&events, &thread_id, &event_id).ok_or_else(|| ApiError::not_found("image générée introuvable"))?;
    let project_id = project.project_id;
    let relative = tokio::task::spawn_blocking(move || {
        let (bytes, format) = load_image(&source_root, &raw_path)?;
        let extension = match format { ImageFormat::Png => "png", ImageFormat::Jpeg => "jpg", ImageFormat::Gif => "gif", ImageFormat::Webp => "webp" };
        atelier_workspace::save_generated_image(&project.root, &bytes, extension)
            .map_err(|e| ApiError::bad_request("image_save_failed", e))
    }).await.map_err(|_| ApiError::bad_request("image_save_failed", "Enregistrement interrompu"))??;
    let mut g = state.inner.lock().await;
    let file_id = g.projects.register_file(&project_id, &relative)?;
    Ok(Json(json!({"relativePath":relative,"projectId":project_id,"fileId":file_id})))
}

fn validate_reference(value: &str, kind: &str) -> ApiResult<()> {
    if value.is_empty()
        || value.len() > MAX_REFERENCE_LENGTH
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(ApiError::bad_request(
            "invalid_image_reference",
            format!("référence {kind} image invalide"),
        ));
    }
    Ok(())
}

/// Find the durable path associated with one terminal image-generation event.
///
/// `meta.eventId` is the stable public reference.  `meta.itemId` and the
/// top-level item `id` are accepted as compatibility aliases because old
/// journals did not persist `meta.itemId`; all aliases remain scoped to this
/// one image-generation event and are never interpreted as paths.
fn find_image_path(events: &[Value], thread_id: &str, reference: &str) -> Option<String> {
    events.iter().rev().find_map(|event| {
        if event.get("kind").and_then(Value::as_str) != Some("tool_update")
            || event.pointer("/meta/threadId").and_then(Value::as_str) != Some(thread_id)
            || event.pointer("/meta/durable") != Some(&Value::Bool(true))
            || !is_image_generation_name(event.get("name").and_then(Value::as_str).unwrap_or(""))
            || !is_successful_terminal_status(
                event.get("status").and_then(Value::as_str).unwrap_or(""),
            )
            || !event_matches_reference(event, reference)
        {
            return None;
        }
        image_path_candidates(event).find(|path| is_absolute_image_path(path))
    })
}

fn event_matches_reference(event: &Value, reference: &str) -> bool {
    [
        event.pointer("/meta/eventId").and_then(Value::as_str),
        event.pointer("/meta/itemId").and_then(Value::as_str),
        event.get("id").and_then(Value::as_str),
    ]
    .into_iter()
    .flatten()
    .any(|value| value == reference)
}

fn image_path_candidates(event: &Value) -> impl Iterator<Item = String> {
    let mut paths = Vec::new();
    for value in [event.get("savedPath"), event.get("output")] {
        if let Some(path) = value.and_then(Value::as_str) {
            paths.push(path.trim().to_string());
        }
    }
    if let Some(input) = event.get("input") {
        for value in [input.get("savedPath"), input.get("path")] {
            if let Some(path) = value.and_then(Value::as_str) {
                paths.push(path.trim().to_string());
            }
        }
        if let Some(path) = input
            .get("paths")
            .and_then(Value::as_array)
            .and_then(|values| values.iter().find_map(Value::as_str))
        {
            paths.push(path.trim().to_string());
        }
    }
    paths.into_iter()
}

fn is_absolute_image_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= MAX_PATH_LENGTH
        && !path.chars().any(char::is_control)
        && FsPath::new(path).is_absolute()
}

fn is_image_generation_name(name: &str) -> bool {
    name.trim().to_ascii_lowercase().replace(['-', '_'], "") == "imagegeneration"
}

fn is_successful_terminal_status(status: &str) -> bool {
    matches!(
        status
            .trim()
            .to_ascii_lowercase()
            .replace(['-', '_'], "")
            .as_str(),
        "completed" | "complete" | "succeeded" | "success" | "done"
    )
}

/// Resolve a journal path only below the generated-image root.
///
/// The lexical checks stop `..` and alternate absolute paths before
/// canonicalization.  Canonicalization then handles symlink escapes, while
/// the component walk rejects symlinks inside the allowed tree as well.
fn resolve_image_path(root: &FsPath, raw_path: &str) -> ApiResult<(PathBuf, String)> {
    let candidate = FsPath::new(raw_path);
    if !is_absolute_image_path(raw_path) || !candidate.starts_with(root) {
        return Err(ApiError::not_found("image générée introuvable"));
    }
    let relative = candidate
        .strip_prefix(root)
        .map_err(|_| ApiError::not_found("image générée introuvable"))?;
    if relative
        .components()
        .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
    {
        return Err(ApiError::not_found("image générée introuvable"));
    }

    let root_canonical = std::fs::canonicalize(root)
        .map_err(|_| ApiError::not_found("image générée introuvable"))?;
    let candidate = candidate.to_path_buf();

    // A symlinked component can point back inside the root and still change
    // between validation and read. Reject it before canonicalization.
    let mut component_path = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err(ApiError::not_found("image générée introuvable"));
        };
        component_path.push(name);
        let metadata = std::fs::symlink_metadata(&component_path)
            .map_err(|_| ApiError::not_found("image générée introuvable"))?;
        if metadata.file_type().is_symlink() {
            return Err(ApiError::not_found("image générée introuvable"));
        }
    }

    let canonical = std::fs::canonicalize(&candidate)
        .map_err(|_| ApiError::not_found("image générée introuvable"))?;
    if canonical == root_canonical || !canonical.starts_with(&root_canonical) {
        return Err(ApiError::not_found("image générée introuvable"));
    }
    let metadata = std::fs::symlink_metadata(&candidate)
        .map_err(|_| ApiError::not_found("image générée introuvable"))?;
    if !metadata.file_type().is_file() {
        return Err(ApiError::not_found("image générée introuvable"));
    }
    let extension = candidate
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp") {
        return Err(ApiError::not_found("image générée introuvable"));
    }
    Ok((canonical, extension))
}

fn load_image(root: &FsPath, raw_path: &str) -> ApiResult<(Vec<u8>, ImageFormat)> {
    let (path, extension) = resolve_image_path(root, raw_path)?;
    let mut file =
        std::fs::File::open(&path).map_err(|_| ApiError::not_found("image générée introuvable"))?;
    let metadata = file
        .metadata()
        .map_err(|_| ApiError::not_found("image générée introuvable"))?;
    if !metadata.is_file() || metadata.len() > MAX_IMAGE_BYTES {
        return Err(ApiError::not_found("image générée introuvable"));
    }
    let capacity = usize::try_from(metadata.len()).unwrap_or(0);
    let mut bytes = Vec::with_capacity(capacity.min(MAX_IMAGE_BYTES as usize));
    let read = file
        .by_ref()
        .take(MAX_IMAGE_BYTES.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(|_| ApiError::not_found("image générée introuvable"))?;
    if read as u64 > MAX_IMAGE_BYTES {
        return Err(ApiError::not_found("image générée introuvable"));
    }
    let format = detect_format(&bytes).filter(|format| format.extension_allowed(&extension));
    let Some(format) = format else {
        return Err(ApiError::not_found("image générée introuvable"));
    };
    Ok((bytes, format))
}

fn detect_format(bytes: &[u8]) -> Option<ImageFormat> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(ImageFormat::Png);
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(ImageFormat::Jpeg);
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(ImageFormat::Gif);
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(ImageFormat::Webp);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use atelier_store::HarnessJournal;
    use serde_json::json;
    use std::fs;

    fn durable_event(thread_id: &str, event_id: &str, output: &str) -> Value {
        json!({
            "kind": "tool_update",
            "id": "exec-legacy-item",
            "name": "image_generation",
            "output": output,
            "status": "completed",
            "meta": {"threadId": thread_id, "eventId": event_id, "durable": true, "sequence": 1}
        })
    }

    #[test]
    fn legacy_output_only_event_resolves_by_event_id() {
        let event = durable_event("thread-1", "event-1", "/tmp/image.png");
        let events = vec![event];
        assert_eq!(
            find_image_path(&events, "thread-1", "event-1").as_deref(),
            Some("/tmp/image.png")
        );
        assert!(find_image_path(&events, "thread-1", "missing").is_none());
    }

    #[test]
    fn terminal_and_durable_checks_reject_unfinished_or_transient_events() {
        let mut event = durable_event("thread-1", "event-1", "/tmp/image.png");
        event["status"] = json!("inProgress");
        assert!(find_image_path(&[event.clone()], "thread-1", "event-1").is_none());
        event["status"] = json!("completed");
        event["meta"]["durable"] = json!(false);
        assert!(find_image_path(&[event], "thread-1", "event-1").is_none());
    }

    #[test]
    fn generated_root_rejects_bad_extensions_signatures_and_symlink_escape() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("generated_images");
        fs::create_dir_all(&root).unwrap();
        let good = root.join("good.png");
        fs::write(&good, b"\x89PNG\r\n\x1a\nvalid").unwrap();
        let (resolved, ext) = resolve_image_path(&root, good.to_str().unwrap()).unwrap();
        assert_eq!(resolved, good.canonicalize().unwrap());
        assert_eq!(ext, "png");
        assert_eq!(
            load_image(&root, good.to_str().unwrap()).unwrap().1,
            ImageFormat::Png
        );

        let bad = root.join("bad.png");
        fs::write(&bad, b"not an image").unwrap();
        assert!(load_image(&root, bad.to_str().unwrap()).is_err());

        let outside = temp.path().join("outside.png");
        fs::write(&outside, b"\x89PNG\r\n\x1a\nsecret").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, root.join("linked.png")).unwrap();
            assert!(load_image(&root, root.join("linked.png").to_str().unwrap()).is_err());
        }
        assert!(load_image(&root, temp.path().join("outside.png").to_str().unwrap()).is_err());
    }

    #[test]
    fn journal_reload_keeps_image_event_resolvable_without_memory_state() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("generated_images");
        fs::create_dir_all(&root).unwrap();
        let image = root.join("reload.png");
        fs::write(&image, b"\x89PNG\r\n\x1a\nreloaded").unwrap();
        let journal = HarnessJournal::new(temp.path());
        assert!(journal.append(&durable_event(
            "thread-reload",
            "event-reload",
            image.to_str().unwrap(),
        )));

        // A new journal instance models the gateway after a process reload.
        let replay = HarnessJournal::new(temp.path()).materialize("thread-reload");
        let path = find_image_path(&replay, "thread-reload", "event-reload").unwrap();
        let (bytes, format) = load_image(&root, &path).unwrap();
        assert_eq!(format, ImageFormat::Png);
        assert_eq!(bytes, b"\x89PNG\r\n\x1a\nreloaded");
    }
}
