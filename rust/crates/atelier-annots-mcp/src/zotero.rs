//! Lecture de `zotero.sqlite` : métadonnées des articles et annotations faites
//! dans Zotero. Zotero garde un verrou exclusif sur sa base pendant qu'il
//! tourne : on lit une copie, rafraîchie quand l'original change (même
//! approche que `atelier-gallery/src/zotero.rs`).

use crate::library::{color_name, Annotation, Source};
use rusqlite::{Connection, OpenFlags};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default)]
pub struct ArticleMeta {
    pub title: String,
    /// Noms de famille, dans l'ordre, séparés par « , ».
    pub authors: String,
    pub year: String,
}

const META_SQL: &str = r#"
SELECT ai.key,
  (SELECT v.value FROM itemData d
     JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'title'
     JOIN itemDataValues v ON v.valueID = d.valueID
   WHERE d.itemID = ia.parentItemID) AS title,
  (SELECT v.value FROM itemData d
     JOIN fields f ON f.fieldID = d.fieldID AND f.fieldName = 'date'
     JOIN itemDataValues v ON v.valueID = d.valueID
   WHERE d.itemID = ia.parentItemID) AS date,
  (SELECT GROUP_CONCAT(lastName, ', ') FROM (
     SELECT c.lastName FROM itemCreators ic JOIN creators c ON c.creatorID = ic.creatorID
     WHERE ic.itemID = ia.parentItemID ORDER BY ic.orderIndex)) AS creators
FROM itemAttachments ia
JOIN items ai ON ai.itemID = ia.itemID
WHERE ia.parentItemID IS NOT NULL AND ia.contentType = 'application/pdf'
"#;

const ANNOTS_SQL: &str = r#"
SELECT att.key, an.text, an.comment, an.color, an.pageLabel
FROM itemAnnotations an
JOIN items att ON att.itemID = an.parentItemID
WHERE an.itemID NOT IN (SELECT itemID FROM deletedItems)
"#;

fn fresh_copy(src: &Path, cache_dir: &Path) -> Result<PathBuf, String> {
    let copy = cache_dir.join("zotero-read.sqlite");
    let stamp = |p: &Path| p.metadata().ok().map(|m| (m.len(), m.modified().ok()));
    let wal = |p: &Path| PathBuf::from(format!("{}-wal", p.display()));
    let stale = stamp(&copy).map(|(_, t)| t) < stamp(src).map(|(_, t)| t)
        || stamp(&wal(&copy)).map(|(_, t)| t) < stamp(&wal(src)).map(|(_, t)| t);
    if stale || !copy.is_file() {
        std::fs::create_dir_all(cache_dir).map_err(|e| e.to_string())?;
        std::fs::copy(src, &copy).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(wal(&copy));
        if wal(src).is_file() {
            std::fs::copy(wal(src), wal(&copy)).map_err(|e| e.to_string())?;
        }
    }
    Ok(copy)
}

pub fn read(
    zotero_dir: &Path,
    cache_dir: &Path,
) -> Result<(HashMap<String, ArticleMeta>, Vec<Annotation>), String> {
    let src = zotero_dir.join("zotero.sqlite");
    if !src.is_file() {
        return Err(format!("{} introuvable", src.display()));
    }
    let copy = fresh_copy(&src, cache_dir)?;
    let db = Connection::open_with_flags(&copy, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;

    let mut meta = HashMap::new();
    let mut stmt = db.prepare(META_SQL).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                r.get::<_, Option<String>>(3)?.unwrap_or_default(),
            ))
        })
        .map_err(|e| e.to_string())?;
    for (key, title, date, authors) in rows.flatten() {
        // Zotero stocke « 1982-00-00 1982 » : l'année est en tête.
        let year: String = date.chars().take(4).filter(char::is_ascii_digit).collect();
        let year = if year.len() == 4 { year } else { String::new() };
        meta.insert(
            key,
            ArticleMeta {
                title,
                authors,
                year,
            },
        );
    }

    // Les annotations Zotero sont un bonus : une base trop ancienne (sans
    // `itemAnnotations`) garde quand même les métadonnées.
    let mut annots = Vec::new();
    if let Ok(mut stmt) = db.prepare(ANNOTS_SQL) {
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                r.get::<_, Option<String>>(3)?.unwrap_or_default(),
                r.get::<_, Option<String>>(4)?.unwrap_or_default(),
            ))
        });
        for (key, text, comment, color, page) in rows.into_iter().flatten().flatten() {
            let passage = text.split_whitespace().collect::<Vec<_>>().join(" ");
            let note = comment.trim().to_string();
            if passage.is_empty() && note.is_empty() {
                continue;
            }
            annots.push(Annotation {
                source: Source::Zotero,
                article: key,
                page,
                passage,
                note,
                color: color_name(&color),
            });
        }
    }
    Ok((meta, annots))
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// Base Zotero minimale : un article (Warren & Wiscombe 1980), son PDF
    /// `ABCD1234`, une annotation Zotero commentée et une supprimée.
    pub fn fixture(dir: &Path) {
        let db = Connection::open(dir.join("zotero.sqlite")).unwrap();
        db.execute_batch(
            r#"
            CREATE TABLE items (itemID INTEGER PRIMARY KEY, key TEXT);
            CREATE TABLE itemAttachments (itemID INTEGER, parentItemID INTEGER, contentType TEXT, path TEXT);
            CREATE TABLE fields (fieldID INTEGER PRIMARY KEY, fieldName TEXT);
            CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value TEXT);
            CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
            CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT, lastName TEXT);
            CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, orderIndex INTEGER);
            CREATE TABLE deletedItems (itemID INTEGER);
            CREATE TABLE itemAnnotations (itemID INTEGER, parentItemID INTEGER, type INTEGER,
              text TEXT, comment TEXT, color TEXT, pageLabel TEXT);
            INSERT INTO items VALUES (1, 'PARENT01'), (2, 'ABCD1234'), (3, 'ANNOT001'), (4, 'ANNOT002');
            INSERT INTO itemAttachments VALUES (2, 1, 'application/pdf', 'storage:paper.pdf');
            INSERT INTO fields VALUES (1, 'title'), (2, 'date');
            INSERT INTO itemDataValues VALUES (1, 'A model for the spectral albedo of snow'), (2, '1980-12-00 December 1980');
            INSERT INTO itemData VALUES (1, 1, 1), (1, 2, 2);
            INSERT INTO creators VALUES (1, 'Stephen', 'Warren'), (2, 'Warren', 'Wiscombe');
            INSERT INTO itemCreators VALUES (1, 2, 1), (1, 1, 0);
            INSERT INTO itemAnnotations VALUES
              (3, 2, 1, 'Impurities lower visible albedo', 'Comparer avec nos glaciers', '#ffd400', '7'),
              (4, 2, 1, 'Deleted passage', '', '#ff6666', '8');
            INSERT INTO deletedItems VALUES (4);
            "#,
        )
        .unwrap();
    }

    #[test]
    fn reads_metadata_and_zotero_annotations_from_a_copy() {
        let dir = tempfile::tempdir().unwrap();
        fixture(dir.path());
        let (meta, annots) = read(dir.path(), &dir.path().join("cache")).unwrap();
        let m = &meta["ABCD1234"];
        assert_eq!(m.title, "A model for the spectral albedo of snow");
        assert_eq!(m.authors, "Warren, Wiscombe");
        assert_eq!(m.year, "1980");
        assert_eq!(annots.len(), 1, "deleted annotations are skipped");
        assert_eq!(annots[0].note, "Comparer avec nos glaciers");
        assert_eq!(annots[0].page, "7");
        assert_eq!(annots[0].color, "jaune");
        assert!(dir.path().join("cache/zotero-read.sqlite").is_file());
    }

    #[test]
    fn missing_database_is_an_error_not_a_panic() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(&dir.path().join("nope"), dir.path()).is_err());
    }
}
