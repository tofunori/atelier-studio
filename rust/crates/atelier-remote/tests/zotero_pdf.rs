//! `GET /remote/v1/zotero/pdf/{key}` against a fixture Zotero library.
//!
//! Its own test binary: `ATELIER_ZOTERO_DIR` is process-wide, so this file
//! holds a single test.

mod common;

use common::{boot, client, set_mtime};
use serde_json::Value;

/// Minimal Zotero schema read by `atelier_workspace::zotero_search`.
fn library(zotero: &std::path::Path) {
    let db = rusqlite::Connection::open(zotero.join("zotero.sqlite")).unwrap();
    db.execute_batch(
        r#"
        CREATE TABLE itemTypes (itemTypeID INTEGER, typeName TEXT);
        CREATE TABLE items (itemID INTEGER, key TEXT, itemTypeID INTEGER, dateAdded TEXT, dateModified TEXT);
        CREATE TABLE deletedItems (itemID INTEGER);
        CREATE TABLE fields (fieldID INTEGER, fieldName TEXT);
        CREATE TABLE itemDataValues (valueID INTEGER, value TEXT);
        CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
        CREATE TABLE creators (creatorID INTEGER, lastName TEXT);
        CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, orderIndex INTEGER);
        CREATE TABLE tags (tagID INTEGER, name TEXT);
        CREATE TABLE itemTags (itemID INTEGER, tagID INTEGER);
        CREATE TABLE itemAttachments (itemID INTEGER, parentItemID INTEGER, contentType TEXT, path TEXT);
        CREATE TABLE collections (collectionID INTEGER, collectionName TEXT, parentCollectionID INTEGER);
        CREATE TABLE collectionItems (collectionID INTEGER, itemID INTEGER);
        CREATE TABLE deletedCollections (collectionID INTEGER);
        INSERT INTO itemTypes VALUES (1, 'journalArticle'), (2, 'attachment');
        INSERT INTO items VALUES
            (1, 'ITEM0001', 1, '2024-01-01', '2024-01-03'),
            (2, 'ITEM0002', 1, '2024-01-01', '2024-01-02'),
            (3, 'ITEM0003', 1, '2024-01-01', '2024-01-01'),
            (101, 'ATTACH01', 2, '2024-01-01', '2024-01-01'),
            (102, 'ATTACH02', 2, '2024-01-01', '2024-01-01'),
            (103, 'ATTACH03', 2, '2024-01-01', '2024-01-01');
        INSERT INTO itemAttachments VALUES
            (101, 1, 'application/pdf', 'storage:paper.pdf'),
            (102, 2, 'application/pdf', 'storage:escape.pdf'),
            (103, 3, 'application/pdf', 'storage:notes.pdf');
        "#,
    )
    .unwrap();
}

#[tokio::test]
async fn zotero_pdf_is_streamed_with_an_etag_and_revalidated() {
    let tmp = tempfile::tempdir().unwrap();
    let zotero = tmp.path().join("Zotero");
    let storage = zotero.join("storage");
    for dir in ["ATTACH01", "ATTACH02", "ATTACH03"] {
        std::fs::create_dir_all(storage.join(dir)).unwrap();
    }
    library(&zotero);
    let paper = storage.join("ATTACH01/paper.pdf");
    std::fs::write(&paper, b"%PDF-1.4 first revision").unwrap();
    set_mtime(&paper, -100);
    std::env::set_var("ATELIER_ZOTERO_DIR", &zotero);
    let gw = boot(tmp.path()).await;

    let response = gw.get("/remote/v1/zotero/pdf/ITEM0001", &[]).await;
    assert_eq!(response.status(), 200);
    let headers = response.headers().clone();
    assert_eq!(headers["content-type"], "application/pdf");
    assert_eq!(headers["cache-control"], "private, no-cache");
    assert_eq!(headers["x-content-type-options"], "nosniff");
    assert_eq!(headers["accept-ranges"], "bytes");
    assert_eq!(headers["content-length"], "23");
    let etag = headers["etag"].to_str().unwrap().to_owned();
    assert!(etag.starts_with("\"17-"), "{etag}");
    assert_eq!(response.bytes().await.unwrap().as_ref(), b"%PDF-1.4 first revision");

    let response = gw.get("/remote/v1/zotero/pdf/ITEM0001", &[("if-none-match", &etag)]).await;
    assert_eq!(response.status(), 304);
    assert_eq!(response.headers()["etag"], etag.as_str());
    assert_eq!(response.headers()["cache-control"], "private, no-cache");
    assert!(response.bytes().await.unwrap().is_empty());

    let response = gw.get("/remote/v1/zotero/pdf/ITEM0001", &[("range", "bytes=0-7")]).await;
    assert_eq!(response.status(), 206);
    assert_eq!(response.headers()["content-range"], "bytes 0-7/23");
    assert_eq!(response.bytes().await.unwrap().as_ref(), b"%PDF-1.4");

    // The PDF changes on the Mac: the old validator no longer matches.
    std::fs::write(&paper, b"%PDF-1.4 annotated").unwrap();
    set_mtime(&paper, -50);
    let response = gw.get("/remote/v1/zotero/pdf/ITEM0001", &[("if-none-match", &etag)]).await;
    assert_eq!(response.status(), 200);
    assert_ne!(response.headers()["etag"], etag.as_str());
    assert_eq!(response.bytes().await.unwrap().as_ref(), b"%PDF-1.4 annotated");

    // Storage links never reach a file outside the storage, nor a non-PDF.
    #[cfg(unix)]
    {
        let outside = tmp.path().join("secret.pdf");
        std::fs::write(&outside, b"%PDF-1.4 secret").unwrap();
        std::os::unix::fs::symlink(&outside, storage.join("ATTACH02/escape.pdf")).unwrap();
        let notes = storage.join("ATTACH03/notes.txt");
        std::fs::write(&notes, b"private notes").unwrap();
        std::os::unix::fs::symlink(&notes, storage.join("ATTACH03/notes.pdf")).unwrap();
        for key in ["ITEM0002", "ITEM0003"] {
            let response = gw.get(&format!("/remote/v1/zotero/pdf/{key}"), &[]).await;
            assert_eq!(response.status(), 400, "{key}");
            assert_eq!(response.json::<Value>().await.unwrap()["code"], "invalid_pdf");
        }
    }

    assert_eq!(gw.get("/remote/v1/zotero/pdf/NOTHERE1", &[]).await.status(), 404);
    assert_eq!(gw.get("/remote/v1/zotero/pdf/bad", &[]).await.status(), 400);
    let anonymous = client().get(format!("{}/remote/v1/zotero/pdf/ITEM0001", gw.base)).header("host", &gw.host).send().await.unwrap();
    assert_eq!(anonymous.status(), 401);
    gw.handle.shutdown().await;
}
