//! Gallery thumbnails for the phone: `GET /remote/v1/thumb/{fileId}`.
//!
//! Images (png, jpg, jpeg, gif, webp) and PDFs only, at most 480 px. The
//! desktop gallery's `.fig_thumbs/` cache is read first; otherwise the
//! gateway renders into its own capped cache, `{data_dir}/thumbs/`, with
//! `sips` (images) or `qlmanage` (PDF) on macOS. Anything else, or any
//! failure, answers 404 `thumbnail_unavailable`: the phone then shows its
//! placeholder.
use super::*;
use std::path::{Path as FsPath, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const THUMB_SIZE: u32 = 480;
/// A thumbnail larger than this is not a thumbnail: never served.
const MAX_THUMB_BYTES: u64 = 8 * 1024 * 1024;
const CACHE_CAP_BYTES: u64 = 200 * 1024 * 1024;
const PRUNE_EVERY: Duration = Duration::from_secs(60);
/// A failed render is retried after this delay (or as soon as the file changes).
const FAILURE_TTL: Duration = Duration::from_secs(3600);
const RENDER_TIMEOUT: Duration = Duration::from_secs(15);
const RENDER_WAIT: Duration = Duration::from_secs(20);
const CACHE_CONTROL: &str = "private, max-age=86400";
const PNG_MAGIC: &[u8] = b"\x89PNG\r\n\x1a\n";

static LAST_PRUNE: std::sync::Mutex<std::collections::BTreeMap<PathBuf, Instant>> =
    std::sync::Mutex::new(std::collections::BTreeMap::new());

#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind { Image, Pdf }

fn kind_of(path: &FsPath) -> Option<Kind> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "gif" | "webp" => Some(Kind::Image),
        "pdf" => Some(Kind::Pdf),
        _ => None,
    }
}

fn unavailable() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "thumbnail_unavailable", "Aperçu indisponible")
}

/// The source file, resolved under its project root like the file route.
struct Source {
    kind: Kind,
    /// Canonical project root and file path.
    root: PathBuf,
    path: PathBuf,
    /// Path relative to `root`, `/`-separated (key of PDF gallery thumbnails).
    rel: String,
    size: u64,
    mtime: Duration,
}

impl Source {
    fn resolve(project_root: &FsPath, relative: &str) -> ApiResult<Self> {
        let path = crate::path_policy::resolve_under_root(project_root, relative)?;
        check_file_readable(&path)?;
        // The target of a symlink decides, not the requested name.
        let kind = kind_of(&path).ok_or_else(unavailable)?;
        let root = std::fs::canonicalize(project_root).map_err(|_| ApiError::not_found("projet inaccessible"))?;
        let rel = path.strip_prefix(&root).map_err(|_| unavailable())?.to_string_lossy().replace('\\', "/");
        let meta = std::fs::metadata(&path).map_err(|_| ApiError::not_found("fichier introuvable"))?;
        let mtime = meta.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).unwrap_or_default();
        Ok(Self { kind, root, path, rel, size: meta.len(), mtime })
    }

    /// Weak: the gallery's and the gateway's renders of one revision may
    /// differ by a few bytes but show the same image.
    fn etag(&self) -> String {
        format!("W/\"t{THUMB_SIZE}-{:x}-{:x}\"", self.size, self.mtime.as_nanos())
    }

    /// File in the desktop gallery's cache, keyed exactly as `gallery_builder`
    /// and the gallery's `/thumb` route write it.
    fn gallery_thumb(&self) -> PathBuf {
        use atelier_core::gallery_builder::{image_thumb_key, stable_thumb_key};
        let secs = self.mtime.as_secs();
        let name = match self.kind {
            Kind::Image => format!("imgthumb_{}.png", image_thumb_key(&self.path, secs)),
            Kind::Pdf => format!("{}.png", stable_thumb_key(&self.rel, secs)),
        };
        self.root.join(".fig_thumbs").join(name)
    }

    /// Name (without extension) in the gateway's own cache.
    fn cache_key(&self) -> String {
        use sha2::{Digest, Sha256};
        let identity = format!("{}\0{}\0{}\0{THUMB_SIZE}", self.path.to_string_lossy(), self.mtime.as_nanos(), self.size);
        hex::encode(Sha256::digest(identity.as_bytes()))
    }
}

/// Reads a cached PNG, refusing symlinks, oversized files and non-PNG data.
fn read_png(path: &FsPath) -> Option<Vec<u8>> {
    use std::io::Read;
    let link = std::fs::symlink_metadata(path).ok()?;
    if !link.is_file() || link.len() > MAX_THUMB_BYTES { return None; }
    let mut file = std::fs::File::open(path).ok()?;
    #[cfg(unix)]
    {
        // The file opened must be the regular file inspected, not a link swapped in since.
        use std::os::unix::fs::MetadataExt;
        let opened = file.metadata().ok()?;
        if (opened.dev(), opened.ino()) != (link.dev(), link.ino()) { return None; }
    }
    let mut bytes = Vec::new();
    file.by_ref().take(MAX_THUMB_BYTES + 1).read_to_end(&mut bytes).ok()?;
    (bytes.len() as u64 <= MAX_THUMB_BYTES && bytes.starts_with(PNG_MAGIC)).then_some(bytes)
}

/// Thumbnail of the gallery cache, only when `.fig_thumbs` is a real directory.
fn from_gallery(src: &Source) -> Option<Vec<u8>> {
    let dir = std::fs::symlink_metadata(src.root.join(".fig_thumbs")).ok()?;
    if !dir.is_dir() { return None; }
    read_png(&src.gallery_thumb())
}

enum Cached { Hit(Vec<u8>), RecentFailure, Miss }

fn lookup(src: &Source, cache: &FsPath, key: &str) -> Cached {
    if let Some(bytes) = from_gallery(src).or_else(|| read_png(&cache.join(format!("{key}.png")))) {
        return Cached::Hit(bytes);
    }
    let failed = std::fs::metadata(cache.join(format!("{key}.fail"))).ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok())
        .is_some_and(|age| age < FAILURE_TTL);
    if failed { Cached::RecentFailure } else { Cached::Miss }
}

/// Renders `src` with `program` (`sips` or `qlmanage`) into a private
/// directory of the cache, then renames the PNG into place. A failure
/// leaves a `.fail` marker so the same revision is not retried at once.
fn render(src: &Source, cache: &FsPath, key: &str, program: &std::ffi::OsStr) -> Option<Vec<u8>> {
    use std::process::{Command, Stdio};
    std::fs::create_dir_all(cache).ok()?;
    let work = cache.join(format!(".tmp-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&work).ok()?;
    let size = THUMB_SIZE.to_string();
    let mut command = Command::new(program);
    match src.kind {
        Kind::Image => command.args(["-Z", &size, "-s", "format", "png"]).arg(&src.path).arg("--out").arg(work.join("thumb.png")),
        Kind::Pdf => command.args(["-t", "-s", &size, "-o"]).arg(&work).arg(&src.path),
    };
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let rendered = atelier_core::gallery_builder::command_success_with_timeout(&mut command, RENDER_TIMEOUT)
        .then(|| std::fs::read_dir(&work).ok())
        .flatten()
        .and_then(|entries| entries.flatten().map(|e| e.path())
            .find(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("png"))))
        .and_then(|produced| {
            let bytes = read_png(&produced)?;
            std::fs::rename(&produced, cache.join(format!("{key}.png"))).ok()?;
            Some(bytes)
        });
    let _ = std::fs::remove_dir_all(&work);
    if rendered.is_none() {
        let _ = std::fs::write(cache.join(format!("{key}.fail")), b"");
    }
    rendered
}

/// Keeps the gateway cache under `cap` bytes, oldest files first (a hit
/// refreshes a file's date, so this is close to least recently used).
/// Leftover render directories older than an hour are removed as well.
fn prune(cache: &FsPath, cap: u64) {
    let Ok(entries) = std::fs::read_dir(cache) else { return };
    let mut files = Vec::new();
    let mut total = 0u64;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        let modified = meta.modified().unwrap_or(UNIX_EPOCH);
        if meta.is_dir() {
            let stale = modified.elapsed().is_ok_and(|age| age > Duration::from_secs(3600));
            if stale && entry.file_name().to_string_lossy().starts_with(".tmp-") {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        } else if meta.is_file() {
            total += meta.len();
            files.push((modified, meta.len(), entry.path()));
        }
    }
    if total <= cap { return; }
    files.sort();
    // Go a little below the cap so the next render does not prune again.
    let target = cap / 10 * 9;
    for (_, len, path) in files {
        if total <= target { break; }
        if std::fs::remove_file(&path).is_ok() { total -= len; }
    }
}

fn prune_at_most_every_minute(cache: &FsPath) {
    let due = LAST_PRUNE.lock().map(|mut last| {
        let due = last.get(cache).is_none_or(|at| at.elapsed() >= PRUNE_EVERY);
        if due { last.insert(cache.to_path_buf(), Instant::now()); }
        due
    }).unwrap_or(false);
    if due { prune(cache, CACHE_CAP_BYTES); }
}

/// Refreshes the date of a cache hit at most once a day (see `prune`).
fn touch(path: &FsPath) {
    let old = std::fs::metadata(path).ok().and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok()).is_some_and(|age| age > Duration::from_secs(86_400));
    if old {
        if let Ok(file) = std::fs::File::options().write(true).open(path) { let _ = file.set_modified(SystemTime::now()); }
    }
}

/// `files:read` with its own per-device budget: a gallery grid asks for
/// dozens of thumbnails and must not exhaust the budget of real file opens.
async fn require_thumb_reader(state: &GatewayState, headers: &HeaderMap) -> ApiResult<()> {
    let token = extract_bearer(headers).ok_or_else(ApiError::unauthorized)?;
    let inner = state.inner.clone();
    tokio::task::spawn_blocking(move || {
        let mut g = inner.blocking_lock();
        let dev = g.auth.authenticate_token(&token).ok_or_else(ApiError::unauthorized)?;
        if !has_scope(&dev.scopes, Scope::FilesRead) { return Err(ApiError::forbidden_scope(Scope::FilesRead.as_str())); }
        if !g.thumb_limiter.check(&format!("{}:thumb", dev.device_id)) { return Err(ApiError::rate_limited()); }
        Ok(())
    }).await.map_err(|_| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "auth_unavailable", "Authentification temporairement indisponible"))?
}

fn thumb_response(status: StatusCode, etag: &str, png: Option<Vec<u8>>) -> Response {
    let builder = Response::builder().status(status)
        .header(header::ETAG, etag)
        .header(header::CACHE_CONTROL, CACHE_CONTROL)
        .header("X-Content-Type-Options", "nosniff");
    match png {
        Some(bytes) => builder.header(header::CONTENT_TYPE, "image/png").header(header::CONTENT_LENGTH, bytes.len())
            .header("Content-Security-Policy", "default-src 'none'; sandbox")
            .body(axum::body::Body::from(bytes)).unwrap(),
        None => builder.body(axum::body::Body::empty()).unwrap(),
    }
}

pub(super) async fn thumb(State(state): State<GatewayState>, headers: HeaderMap, Path(file_id): Path<String>) -> ApiResult<Response> {
    guard_headers(&state, &headers).await?;
    require_thumb_reader(&state, &headers).await?;
    let (project, relative, cache) = {
        let g = state.inner.lock().await;
        let (project, relative) = g.projects.file_identity(&file_id)?;
        (project, relative, g.config.data_dir.join("thumbs"))
    };
    if kind_of(FsPath::new(&relative)).is_none() { return Err(unavailable()); }
    let src = tokio::task::spawn_blocking(move || Source::resolve(&project.root, &relative))
        .await.map_err(|_| unavailable())??;
    let etag = src.etag();
    if if_none_match_fresh(&headers, &etag) {
        return Ok(thumb_response(StatusCode::NOT_MODIFIED, &etag, None));
    }
    let key = src.cache_key();
    let (src, found) = {
        let (cache, key) = (cache.clone(), key.clone());
        tokio::task::spawn_blocking(move || {
            let found = lookup(&src, &cache, &key);
            if matches!(found, Cached::Hit(_)) { touch(&cache.join(format!("{key}.png"))); }
            (src, found)
        }).await.map_err(|_| unavailable())?
    };
    match found {
        Cached::Hit(bytes) => return Ok(thumb_response(StatusCode::OK, &etag, Some(bytes))),
        Cached::RecentFailure => return Err(unavailable()),
        Cached::Miss if !cfg!(target_os = "macos") => return Err(unavailable()),
        Cached::Miss => {}
    }
    let permit = tokio::time::timeout(RENDER_WAIT, state.thumb_jobs.clone().acquire_owned()).await
        .map_err(|_| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "thumbnail_busy", "Aperçus en cours de préparation, réessayez"))?
        .map_err(|_| unavailable())?;
    // The permit follows the render: a phone that gives up does not free a
    // slot while `sips`/`qlmanage` is still running.
    let png = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        // Another request may have rendered it while this one waited.
        if let Some(bytes) = read_png(&cache.join(format!("{key}.png"))) { return Some(bytes); }
        let program = match src.kind { Kind::Image => "sips", Kind::Pdf => "qlmanage" };
        let png = render(&src, &cache, &key, program.as_ref());
        if png.is_some() { prune_at_most_every_minute(&cache); }
        png
    }).await.map_err(|_| unavailable())?;
    png.map(|bytes| thumb_response(StatusCode::OK, &etag, Some(bytes))).ok_or_else(unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nfake image data";

    fn source(dir: &FsPath, name: &str) -> Source {
        std::fs::write(dir.join(name), PNG).unwrap();
        Source::resolve(dir, name).unwrap()
    }

    #[test]
    fn only_images_and_pdfs_have_thumbnails() {
        for (name, kind) in [("a.PNG", Some(Kind::Image)), ("b.jpeg", Some(Kind::Image)), ("c.webp", Some(Kind::Image)),
            ("d.gif", Some(Kind::Image)), ("e.pdf", Some(Kind::Pdf)), ("f.svg", None), ("g.txt", None), ("h", None)] {
            assert_eq!(kind_of(FsPath::new(name)), kind, "{name}");
        }
    }

    #[test]
    fn cached_png_must_be_a_regular_png_file() {
        let dir = tempfile::tempdir().unwrap();
        let good = dir.path().join("good.png");
        std::fs::write(&good, PNG).unwrap();
        assert_eq!(read_png(&good).unwrap(), PNG);
        let text = dir.path().join("text.png");
        std::fs::write(&text, b"not a png").unwrap();
        assert!(read_png(&text).is_none());
        #[cfg(unix)]
        {
            let link = dir.path().join("link.png");
            std::os::unix::fs::symlink(&good, &link).unwrap();
            assert!(read_png(&link).is_none());
        }
    }

    #[test]
    fn gallery_keys_match_the_desktop_builder() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("figs")).unwrap();
        let image = source(dir.path(), "figs/plot.png");
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let expected = atelier_core::gallery_builder::image_thumb_key(&root.join("figs/plot.png"), image.mtime.as_secs());
        assert_eq!(image.gallery_thumb(), root.join(".fig_thumbs").join(format!("imgthumb_{expected}.png")));
        let pdf = source(dir.path(), "figs/paper.pdf");
        let expected = atelier_core::gallery_builder::stable_thumb_key("figs/paper.pdf", pdf.mtime.as_secs());
        assert_eq!(pdf.gallery_thumb(), root.join(".fig_thumbs").join(format!("{expected}.png")));
        assert_ne!(image.cache_key(), pdf.cache_key());
    }

    #[cfg(unix)]
    fn fake_tool(dir: &FsPath, script: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let path = dir.join("tool.sh");
        std::fs::write(&path, format!("#!/bin/sh\n{script}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[cfg(unix)]
    #[test]
    fn render_moves_the_png_into_the_cache_or_marks_the_failure() {
        let dir = tempfile::tempdir().unwrap();
        let cache = dir.path().join("thumbs");
        let image = source(dir.path(), "plot.png");
        // sips -Z 480 -s format png <src> --out <out>
        let sips = fake_tool(dir.path(), "cp \"$6\" \"$8\"");
        let key = image.cache_key();
        assert_eq!(render(&image, &cache, &key, sips.as_os_str()).unwrap(), PNG);
        assert_eq!(read_png(&cache.join(format!("{key}.png"))).unwrap(), PNG);
        assert!(matches!(lookup(&image, &cache, &key), Cached::Hit(_)));
        // qlmanage -t -s 480 -o <dir> <pdf> writes <dir>/<name>.png
        let pdf = source(dir.path(), "paper.pdf");
        let qlmanage = fake_tool(dir.path(), "cp \"$6\" \"$5/$(basename \"$6\").png\"");
        let key = pdf.cache_key();
        assert_eq!(render(&pdf, &cache, &key, qlmanage.as_os_str()).unwrap(), PNG);
        // a tool producing something else than a PNG is a failure
        let broken = source(dir.path(), "broken.png");
        let bad = fake_tool(dir.path(), "echo text > \"$8\"");
        let key = broken.cache_key();
        assert!(render(&broken, &cache, &key, bad.as_os_str()).is_none());
        assert!(matches!(lookup(&broken, &cache, &key), Cached::RecentFailure));
        // no render directory is left behind
        let leftovers = std::fs::read_dir(&cache).unwrap().flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(".tmp-")).count();
        assert_eq!(leftovers, 0);
    }

    #[test]
    fn prune_removes_the_oldest_files_first() {
        let dir = tempfile::tempdir().unwrap();
        for (i, name) in ["old.png", "mid.png", "new.png"].into_iter().enumerate() {
            let path = dir.path().join(name);
            std::fs::write(&path, vec![0u8; 100]).unwrap();
            let file = std::fs::File::options().write(true).open(&path).unwrap();
            file.set_modified(SystemTime::now() - Duration::from_secs(1000 - i as u64 * 100)).unwrap();
        }
        prune(dir.path(), 300);
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 3);
        // over the cap: down to 90 % of it, oldest first
        prune(dir.path(), 250);
        assert!(!dir.path().join("old.png").exists());
        assert!(dir.path().join("mid.png").exists());
        prune(dir.path(), 150);
        assert!(!dir.path().join("mid.png").exists());
        assert!(dir.path().join("new.png").exists());
    }
}
