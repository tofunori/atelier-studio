//! `GET /remote/v1/thumb/{fileId}`: gallery thumbnails for the phone.

mod common;

use atelier_core::gallery_builder::{image_thumb_key, stable_thumb_key};
use common::{boot, client, set_mtime, Gateway};
use serde_json::Value;
use std::path::Path;
use std::time::{Duration, UNIX_EPOCH};

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

fn thumbnail(label: &str) -> Vec<u8> {
    [PNG, label.as_bytes()].concat()
}

fn mtime_secs(path: &Path) -> u64 {
    std::fs::metadata(path).unwrap().modified().unwrap().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

/// Registers `root` and returns the opaque ids of `files`.
async fn register(gw: &Gateway, root: &Path, files: &[&str]) -> Vec<String> {
    let mut g = gw.handle.state.inner.lock().await;
    let project = g.projects.register_project(root, None).project_id;
    files.iter().map(|file| g.projects.register_file(&project, file).unwrap()).collect()
}

async fn assert_unavailable(response: reqwest::Response, code: &str) {
    assert_eq!(response.status(), 404);
    let body: Value = response.json().await.unwrap();
    assert_eq!(body["code"], code);
}

#[tokio::test]
async fn thumbnails_exist_only_for_images_and_pdfs() {
    let tmp = tempfile::tempdir().unwrap();
    let gw = boot(tmp.path()).await;
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("notes.md"), "# notes").unwrap();
    std::fs::write(root.path().join("drawing.svg"), "<svg/>").unwrap();
    std::fs::write(root.path().join("table.csv"), "a,b").unwrap();
    for id in register(&gw, root.path(), &["notes.md", "drawing.svg", "table.csv"]).await {
        assert_unavailable(gw.get(&format!("/remote/v1/thumb/{id}"), &[]).await, "thumbnail_unavailable").await;
    }
    assert_unavailable(gw.get("/remote/v1/thumb/f_unknown", &[]).await, "not_found").await;
    let anonymous = client().get(format!("{}/remote/v1/thumb/f_unknown", gw.base)).header("host", &gw.host).send().await.unwrap();
    assert_eq!(anonymous.status(), 401);
    gw.handle.shutdown().await;
}

#[cfg(not(target_os = "macos"))]
#[tokio::test]
async fn without_sips_an_uncached_image_has_no_thumbnail() {
    let tmp = tempfile::tempdir().unwrap();
    let gw = boot(tmp.path()).await;
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("plot.png"), thumbnail("full size")).unwrap();
    std::fs::write(root.path().join("paper.pdf"), b"%PDF-1.4").unwrap();
    for id in register(&gw, root.path(), &["plot.png", "paper.pdf"]).await {
        assert_unavailable(gw.get(&format!("/remote/v1/thumb/{id}"), &[]).await, "thumbnail_unavailable").await;
    }
    // Nothing was rendered, so nothing is cached, not even a failure.
    let cache = tmp.path().join("remote/thumbs");
    assert!(!cache.exists() || std::fs::read_dir(&cache).unwrap().next().is_none());
    gw.handle.shutdown().await;
}

#[tokio::test]
async fn gallery_thumbnails_are_served_with_an_etag_and_revalidated() {
    let tmp = tempfile::tempdir().unwrap();
    let gw = boot(tmp.path()).await;
    let root = tempfile::tempdir().unwrap();
    let figs = root.path().join("figs");
    std::fs::create_dir(&figs).unwrap();
    let plot = figs.join("plot.png");
    let paper = root.path().join("paper.pdf");
    std::fs::write(&plot, b"source image").unwrap();
    std::fs::write(&paper, b"%PDF-1.4").unwrap();
    set_mtime(&plot, -100);
    let cache = root.path().join(".fig_thumbs");
    std::fs::create_dir(&cache).unwrap();
    let plot_key = image_thumb_key(&std::fs::canonicalize(&plot).unwrap(), mtime_secs(&plot));
    std::fs::write(cache.join(format!("imgthumb_{plot_key}.png")), thumbnail("plot")).unwrap();
    let paper_key = stable_thumb_key("paper.pdf", mtime_secs(&paper));
    std::fs::write(cache.join(format!("{paper_key}.png")), thumbnail("paper")).unwrap();
    let ids = register(&gw, root.path(), &["figs/plot.png", "paper.pdf"]).await;
    let plot_url = format!("/remote/v1/thumb/{}", ids[0]);

    let response = gw.get(&plot_url, &[]).await;
    assert_eq!(response.status(), 200);
    let headers = response.headers().clone();
    assert_eq!(headers["content-type"], "image/png");
    assert_eq!(headers["cache-control"], "private, max-age=86400");
    assert_eq!(headers["x-content-type-options"], "nosniff");
    let etag = headers["etag"].to_str().unwrap().to_owned();
    assert!(etag.starts_with("W/\"t480-"), "{etag}");
    assert_eq!(response.bytes().await.unwrap().as_ref(), thumbnail("plot").as_slice());

    let response = gw.get(&plot_url, &[("if-none-match", &etag)]).await;
    assert_eq!(response.status(), 304);
    assert_eq!(response.headers()["etag"], etag.as_str());
    assert_eq!(response.headers()["cache-control"], "private, max-age=86400");
    assert!(response.bytes().await.unwrap().is_empty());

    let response = gw.get(&format!("/remote/v1/thumb/{}", ids[1]), &[]).await;
    assert_eq!(response.status(), 200);
    assert_eq!(response.bytes().await.unwrap().as_ref(), thumbnail("paper").as_slice());

    // A new revision of the source has a new validator and its own thumbnail.
    std::fs::write(&plot, b"source image, second revision").unwrap();
    set_mtime(&plot, -50);
    let plot_key = image_thumb_key(&std::fs::canonicalize(&plot).unwrap(), mtime_secs(&plot));
    std::fs::write(cache.join(format!("imgthumb_{plot_key}.png")), thumbnail("plot v2")).unwrap();
    let response = gw.get(&plot_url, &[("if-none-match", &etag)]).await;
    assert_eq!(response.status(), 200);
    assert_ne!(response.headers()["etag"], etag.as_str());
    assert_eq!(response.bytes().await.unwrap().as_ref(), thumbnail("plot v2").as_slice());

    // A symlinked `.fig_thumbs` is never followed (and the source is no
    // image `sips` could render on a Mac).
    #[cfg(unix)]
    {
        let outside = tempfile::tempdir().unwrap();
        std::fs::rename(&cache, outside.path().join("thumbs")).unwrap();
        std::os::unix::fs::symlink(outside.path().join("thumbs"), &cache).unwrap();
        assert_unavailable(gw.get(&plot_url, &[]).await, "thumbnail_unavailable").await;
    }
    gw.handle.shutdown().await;
}

#[tokio::test]
async fn thumbnails_have_their_own_rate_budget() {
    let tmp = tempfile::tempdir().unwrap();
    let gw = boot(tmp.path()).await;
    let root = tempfile::tempdir().unwrap();
    let plot = root.path().join("plot.png");
    std::fs::write(&plot, b"source image").unwrap();
    std::fs::create_dir(root.path().join(".fig_thumbs")).unwrap();
    let key = image_thumb_key(&std::fs::canonicalize(&plot).unwrap(), mtime_secs(&plot));
    std::fs::write(root.path().join(format!(".fig_thumbs/imgthumb_{key}.png")), thumbnail("plot")).unwrap();
    let id = register(&gw, root.path(), &["plot.png"]).await.remove(0);
    gw.handle.state.inner.lock().await.api_limiter = atelier_remote::rate_limit::RateLimiter::new(Duration::from_secs(60), 1);
    for _ in 0..5 {
        assert_eq!(gw.get(&format!("/remote/v1/thumb/{id}"), &[]).await.status(), 200);
    }
    // A grid of thumbnails leaves the files:read budget untouched...
    assert_eq!(gw.get(&format!("/remote/v1/file/{id}"), &[]).await.status(), 200);
    assert_eq!(gw.get(&format!("/remote/v1/file/{id}"), &[]).await.status(), 429);
    // ...and has a budget of its own.
    gw.handle.state.inner.lock().await.thumb_limiter = atelier_remote::rate_limit::RateLimiter::new(Duration::from_secs(60), 1);
    assert_eq!(gw.get(&format!("/remote/v1/thumb/{id}"), &[]).await.status(), 200);
    assert_eq!(gw.get(&format!("/remote/v1/thumb/{id}"), &[]).await.status(), 429);
    gw.handle.shutdown().await;
}
