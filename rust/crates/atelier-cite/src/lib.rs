//! Notices Zotero en CSL-JSON, lues dans `zotero.sqlite` (Zotero peut être
//! fermé), pour écrire des citations VIVANTES dans un .docx : les champs
//! `ADDIN ZOTERO_ITEM CSL_CITATION` du module Zotero de Word embarquent
//! l'URI de la notice (`http://zotero.org/users/<id>/items/<clé>`) et sa
//! notice complète (`itemData`), ce que produit [`items`].
//!
//! Aussi : la liste des styles CSL installés dans Zotero ([`styles`]), qui
//! donne l'identifiant à écrire dans les préférences du document et la
//! famille du style (auteur-date, numérique, note).

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{Map, Value, json};
use std::collections::HashMap;
use std::path::Path;

/// Une notice prête à citer.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Cited {
    /// Clé Zotero (8 caractères).
    pub key: String,
    /// `items.itemID`, repris dans `citationItems[].id` et `itemData.id`.
    pub id: i64,
    /// URI par laquelle le module Word retrouve la notice dans la bibliothèque.
    pub uri: String,
    /// Notice CSL-JSON (sans le résumé).
    pub data: Value,
}

/// Un style CSL installé.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Style {
    /// `http://www.zotero.org/styles/apa`
    pub id: String,
    pub title: String,
    /// `author-date`, `numeric`, `note`, `label`, `author`.
    pub format: String,
}

fn csl_type(zotero: &str) -> &'static str {
    match zotero {
        "journalArticle" => "article-journal",
        "book" => "book",
        "bookSection" => "chapter",
        "thesis" => "thesis",
        "report" => "report",
        "conferencePaper" => "paper-conference",
        "preprint" => "article",
        "webpage" => "webpage",
        "dataset" => "dataset",
        "magazineArticle" => "article-magazine",
        "newspaperArticle" => "article-newspaper",
        "manuscript" => "manuscript",
        "presentation" => "speech",
        "map" => "map",
        "computerProgram" => "software",
        "encyclopediaArticle" => "entry-encyclopedia",
        "dictionaryEntry" => "entry-dictionary",
        "patent" => "patent",
        "blogPost" => "post-weblog",
        "standard" => "standard",
        "letter" => "personal_communication",
        "interview" => "interview",
        "film" => "motion_picture",
        "artwork" => "graphic",
        "case" => "legal_case",
        "statute" => "legislation",
        "bill" => "bill",
        _ => "document",
    }
}

/// Champ Zotero → variable CSL (texte).
fn csl_field(zotero: &str) -> Option<&'static str> {
    Some(match zotero {
        "title" => "title",
        "shortTitle" => "title-short",
        "publicationTitle" | "bookTitle" | "proceedingsTitle" | "websiteTitle" | "blogTitle" | "forumTitle" | "encyclopediaTitle" | "dictionaryTitle" => "container-title",
        "journalAbbreviation" => "container-title-short",
        "volume" => "volume",
        "issue" => "issue",
        "pages" => "page",
        "numPages" => "number-of-pages",
        "DOI" => "DOI",
        "url" | "URL" => "URL",
        "ISSN" => "ISSN",
        "ISBN" => "ISBN",
        "publisher" | "university" | "institution" | "company" | "label" | "studio" | "distributor" | "repository" => "publisher",
        "place" => "publisher-place",
        "edition" => "edition",
        "series" => "collection-title",
        "seriesNumber" => "collection-number",
        "language" => "language",
        "thesisType" | "reportType" | "genre" | "websiteType" | "presentationType" => "genre",
        "reportNumber" | "number" => "number",
        "conferenceName" | "meetingName" => "event-title",
        "archive" => "archive",
        "archiveLocation" => "archive_location",
        "libraryCatalog" => "source",
        _ => return None,
    })
}

fn csl_creator(zotero: &str) -> Option<&'static str> {
    Some(match zotero {
        "author" | "presenter" | "programmer" | "inventor" | "artist" | "director" | "interviewee" | "podcaster" | "cartographer" | "sponsor" => "author",
        "editor" => "editor",
        "bookAuthor" => "container-author",
        "translator" => "translator",
        "seriesEditor" => "collection-editor",
        "reviewedAuthor" => "reviewed-author",
        "recipient" => "recipient",
        "interviewer" => "interviewer",
        _ => return None,
    })
}

/// `YYYY-MM-DD texte` (forme interne de Zotero, `00` = inconnu) → `date-parts`.
fn date_parts(raw: &str) -> Option<Value> {
    let head: String = raw.chars().take(10).collect();
    let mut parts = head.split('-');
    let y: i64 = parts.next()?.trim().parse().ok().filter(|y| *y != 0)?;
    let mut out = vec![json!(y)];
    for p in parts {
        match p.trim().parse::<i64>() {
            Ok(v) if v > 0 => out.push(json!(v)),
            _ => break,
        }
    }
    Some(json!({"date-parts": [out]}))
}

/// Préfixe d'URI de la bibliothèque personnelle : compte synchronisé
/// (`users/<userID>`) sinon bibliothèque locale (`users/local/<clé>`).
fn user_prefix(conn: &Connection) -> String {
    let setting = |key: &str| -> Option<String> {
        conn.query_row("SELECT value FROM settings WHERE setting = 'account' AND key = ?1", [key], |r| {
            let v: rusqlite::types::Value = r.get(0)?;
            Ok(match v {
                rusqlite::types::Value::Integer(i) => Some(i.to_string()),
                rusqlite::types::Value::Text(t) => Some(t),
                _ => None,
            })
        })
        .optional()
        .ok()
        .flatten()
        .flatten()
        .filter(|s| !s.trim().is_empty())
    };
    match setting("userID") {
        Some(id) => format!("http://zotero.org/users/{id}"),
        None => format!("http://zotero.org/users/local/{}", setting("localUserKey").unwrap_or_else(|| "0".into())),
    }
}

/// Notices des clés demandées, dans l'ordre demandé. Une clé `G/KEY` vise
/// la bibliothèque de groupe `G` ; sinon la bibliothèque personnelle d'abord.
/// Clé inconnue ou supprimée : erreur qui la nomme.
pub fn items(conn: &Connection, keys: &[String]) -> Result<Vec<Cited>, String> {
    let user = user_prefix(conn);
    let mut out = Vec::with_capacity(keys.len());
    for want in keys {
        let (group, key) = match want.split_once('/') {
            Some((g, k)) => (g.trim().parse::<i64>().ok(), k.trim()),
            None => (None, want.trim()),
        };
        let row: Option<(i64, String, String, Option<i64>)> = conn
            .query_row(
                "SELECT i.itemID, i.key, t.typeName, (SELECT g.groupID FROM groups g WHERE g.libraryID = i.libraryID)
                   FROM items i JOIN itemTypes t ON t.itemTypeID = i.itemTypeID
                  WHERE i.key = ?1 AND t.typeName NOT IN ('attachment', 'note', 'annotation')
                    AND i.itemID NOT IN (SELECT itemID FROM deletedItems)
                    AND (?2 IS NULL OR i.libraryID = (SELECT g.libraryID FROM groups g WHERE g.groupID = ?2))
                  ORDER BY (SELECT g.groupID FROM groups g WHERE g.libraryID = i.libraryID) IS NOT NULL, i.libraryID
                  LIMIT 1",
                rusqlite::params![key, group],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((id, key, kind, group)) = row else {
            return Err(format!("notice Zotero {want} introuvable"));
        };
        let uri = match group {
            Some(g) => format!("http://zotero.org/groups/{g}/items/{key}"),
            None => format!("{user}/items/{key}"),
        };
        out.push(Cited { data: item_data(conn, id, &kind)?, key, id, uri });
    }
    Ok(out)
}

fn item_data(conn: &Connection, id: i64, kind: &str) -> Result<Value, String> {
    let mut m = Map::new();
    m.insert("id".into(), json!(id));
    m.insert("type".into(), json!(csl_type(kind)));
    let mut st = conn
        .prepare(
            "SELECT f.fieldName, v.value FROM itemData d JOIN fields f ON f.fieldID = d.fieldID
               JOIN itemDataValues v ON v.valueID = d.valueID WHERE d.itemID = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([id], |r| {
            let v: rusqlite::types::Value = r.get(1)?;
            let text = match v {
                rusqlite::types::Value::Text(t) => t,
                rusqlite::types::Value::Integer(i) => i.to_string(),
                rusqlite::types::Value::Real(f) => f.to_string(),
                _ => String::new(),
            };
            Ok((r.get::<_, String>(0)?, text))
        })
        .map_err(|e| e.to_string())?;
    for row in rows {
        let (field, value) = row.map_err(|e| e.to_string())?;
        if value.trim().is_empty() {
            continue;
        }
        match field.as_str() {
            "date" => {
                if let Some(d) = date_parts(&value) {
                    m.insert("issued".into(), d);
                }
            }
            "accessDate" => {
                if let Some(d) = date_parts(&value) {
                    m.insert("accessed".into(), d);
                }
            }
            f => {
                if let Some(k) = csl_field(f) {
                    m.entry(k.to_string()).or_insert(json!(value));
                }
            }
        }
    }
    // Créateurs dans l'ordre de Zotero (`orderIndex`, pas `creatorID`).
    let mut st = conn
        .prepare(
            "SELECT ct.creatorType, c.firstName, c.lastName, c.fieldMode FROM itemCreators ic
               JOIN creators c ON c.creatorID = ic.creatorID
               JOIN creatorTypes ct ON ct.creatorTypeID = ic.creatorTypeID
              WHERE ic.itemID = ?1 ORDER BY ic.orderIndex",
        )
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([id], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?, r.get::<_, Option<String>>(2)?, r.get::<_, Option<i64>>(3)?)))
        .map_err(|e| e.to_string())?;
    let mut roles: Vec<(&'static str, Vec<Value>)> = Vec::new();
    for row in rows {
        let (role, first, last, mode) = row.map_err(|e| e.to_string())?;
        let Some(role) = csl_creator(&role) else { continue };
        let last = last.unwrap_or_default();
        let name = if mode == Some(1) {
            json!({"literal": last})
        } else {
            json!({"family": last, "given": first.unwrap_or_default()})
        };
        match roles.iter_mut().find(|(r, _)| *r == role) {
            Some((_, v)) => v.push(name),
            None => roles.push((role, vec![name])),
        }
    }
    for (role, names) in roles {
        m.insert(role.into(), Value::Array(names));
    }
    Ok(Value::Object(m))
}

/// Une ligne de recherche (palette, agent).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Brief {
    pub key: String,
    pub authors: String,
    pub year: String,
    pub title: String,
    pub container: String,
}

/// Résumé lisible d'une notice CSL : « Williamson & Menounos », année, titre, revue.
pub fn brief(c: &Cited) -> Brief {
    let names: Vec<String> = c.data.get("author").or_else(|| c.data.get("editor")).and_then(Value::as_array).map(|a| a.iter().map(family).collect()).unwrap_or_default();
    let authors = match names.len() {
        0 => String::new(),
        1 => names[0].clone(),
        2 => format!("{} & {}", names[0], names[1]),
        _ => format!("{} et al.", names[0]),
    };
    let s = |k: &str| c.data.get(k).and_then(Value::as_str).unwrap_or("").to_string();
    let year = c.data.pointer("/issued/date-parts/0/0").map(|v| v.as_i64().map(|y| y.to_string()).or_else(|| v.as_str().map(str::to_string)).unwrap_or_default()).unwrap_or_default();
    Brief { key: c.key.clone(), authors, year, title: s("title"), container: s("container-title") }
}

fn family(n: &Value) -> String {
    n.get("family").or_else(|| n.get("literal")).and_then(Value::as_str).unwrap_or("").to_string()
}

/// Styles CSL installés (`<zotero>/styles/*.csl`), triés par titre.
pub fn styles(zotero_dir: &Path) -> Vec<Style> {
    let mut out = Vec::new();
    let Ok(dir) = std::fs::read_dir(zotero_dir.join("styles")) else { return out };
    for e in dir.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("csl") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&p) else { continue };
        if let Some(s) = parse_style(&text) {
            out.push(s);
        }
    }
    out.sort_by_key(|s| s.title.to_lowercase());
    out
}

/// `<info>` d'un fichier CSL : identifiant, titre, famille.
pub fn parse_style(text: &str) -> Option<Style> {
    let info_end = text.find("</info>").unwrap_or(text.len());
    let info = &text[..info_end];
    let tag = |name: &str| -> Option<String> {
        let open = format!("<{name}>");
        let a = info.find(&open)? + open.len();
        let b = info[a..].find(&format!("</{name}>"))? + a;
        Some(unescape(info[a..b].trim()))
    };
    let id = tag("id")?;
    let title = tag("title").unwrap_or_else(|| id.clone());
    let format = info
        .find("citation-format=\"")
        .map(|i| {
            let rest = &info[i + 17..];
            rest[..rest.find('"').unwrap_or(0)].to_string()
        })
        .unwrap_or_else(|| "author-date".into());
    Some(Style { id, title, format })
}

fn unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

/// Index clé → notice pour un lot de clés (utile aux appelants qui
/// enrichissent plusieurs retouches d'un coup).
pub fn by_key(conn: &Connection, keys: &[String]) -> Result<HashMap<String, Cited>, String> {
    Ok(items(conn, keys)?.into_iter().zip(keys.iter()).map(|(c, k)| (k.clone(), c)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Schéma réel de Zotero réduit aux tables lues.
    fn fixture(account: &[(&str, &str)]) -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(
            r#"
            CREATE TABLE itemTypes (itemTypeID INTEGER, typeName TEXT);
            CREATE TABLE items (itemID INTEGER, itemTypeID INTEGER, libraryID INTEGER, key TEXT);
            CREATE TABLE deletedItems (itemID INTEGER);
            CREATE TABLE fields (fieldID INTEGER, fieldName TEXT);
            CREATE TABLE itemDataValues (valueID INTEGER, value);
            CREATE TABLE itemData (itemID INTEGER, fieldID INTEGER, valueID INTEGER);
            CREATE TABLE creators (creatorID INTEGER, firstName TEXT, lastName TEXT, fieldMode INTEGER);
            CREATE TABLE creatorTypes (creatorTypeID INTEGER, creatorType TEXT);
            CREATE TABLE itemCreators (itemID INTEGER, creatorID INTEGER, creatorTypeID INTEGER, orderIndex INTEGER);
            CREATE TABLE groups (groupID INTEGER, libraryID INTEGER);
            CREATE TABLE settings (setting TEXT, key TEXT, value);
            INSERT INTO itemTypes VALUES (1,'journalArticle'),(2,'report'),(3,'attachment');
            INSERT INTO items VALUES (10,1,1,'WILL2021'),(11,2,1,'NASA2020'),(12,1,1,'GONE0001'),(13,1,5,'GRPITEM1'),(14,3,1,'ATTACH01');
            INSERT INTO deletedItems VALUES (12);
            INSERT INTO groups VALUES (777, 5);
            INSERT INTO fields VALUES (1,'title'),(2,'date'),(3,'publicationTitle'),(4,'volume'),(5,'pages'),(6,'DOI'),(7,'abstractNote'),(8,'institution');
            INSERT INTO itemDataValues VALUES (1,'The influence of forest fire aerosol'),(2,'2021-03-00 March 2021'),(3,'Remote Sensing of Environment'),(4,267),(5,'112-130'),(6,'10.1016/j.rse.2021.112754'),(7,'Long abstract'),
              (8,'Global albedo report'),(9,'2020-00-00 2020'),(10,'NASA'),(11,'Group paper');
            INSERT INTO itemData VALUES (10,1,1),(10,2,2),(10,3,3),(10,4,4),(10,5,5),(10,6,6),(10,7,7),(11,1,8),(11,2,9),(11,8,10),(13,1,11);
            INSERT INTO creatorTypes VALUES (1,'author'),(2,'editor'),(3,'contributor');
            INSERT INTO creators VALUES (1,'Brian','Menounos',0),(2,'Scott N.','Williamson',0),(3,NULL,'NASA Earth Observatory',1),(4,'X','Helper',0);
            -- creatorID dans le désordre : seul orderIndex compte.
            INSERT INTO itemCreators VALUES (10,1,1,1),(10,2,1,0),(10,4,3,2),(11,3,1,0);
            "#,
        )
        .unwrap();
        for (k, v) in account {
            c.execute("INSERT INTO settings VALUES ('account', ?1, ?2)", [k, v]).unwrap();
        }
        c
    }

    #[test]
    fn notice_en_csl_avec_uri_du_compte_synchronise() {
        let c = fixture(&[("userID", "14459619"), ("localUserKey", "abcd")]);
        let got = items(&c, &["WILL2021".into()]).unwrap();
        assert_eq!(got.len(), 1);
        let it = &got[0];
        assert_eq!(it.uri, "http://zotero.org/users/14459619/items/WILL2021");
        assert_eq!(it.id, 10);
        let d = &it.data;
        assert_eq!(d["type"], "article-journal");
        assert_eq!(d["container-title"], "Remote Sensing of Environment");
        assert_eq!(d["volume"], "267");
        assert_eq!(d["page"], "112-130");
        assert_eq!(d["issued"], json!({"date-parts": [[2021, 3]]}));
        assert!(d.get("abstract").is_none(), "résumé omis");
        assert_eq!(d["author"], json!([{"family": "Williamson", "given": "Scott N."}, {"family": "Menounos", "given": "Brian"}]));
        assert_eq!(brief(it).authors, "Williamson & Menounos");
        assert_eq!(brief(it).year, "2021");
    }

    #[test]
    fn bibliotheque_locale_institution_et_groupe() {
        let c = fixture(&[("localUserKey", "abcd")]);
        let got = items(&c, &["NASA2020".into(), "777/GRPITEM1".into()]).unwrap();
        assert_eq!(got[0].uri, "http://zotero.org/users/local/abcd/items/NASA2020");
        assert_eq!(got[0].data["author"], json!([{"literal": "NASA Earth Observatory"}]));
        assert_eq!(got[0].data["publisher"], "NASA");
        assert_eq!(got[0].data["issued"], json!({"date-parts": [[2020]]}));
        assert_eq!(got[1].uri, "http://zotero.org/groups/777/items/GRPITEM1");
        assert_eq!(items(&c, &["GRPITEM1".into()]).unwrap()[0].uri, "http://zotero.org/groups/777/items/GRPITEM1");
    }

    #[test]
    fn cle_supprimee_ou_piece_jointe_refusee() {
        let c = fixture(&[]);
        assert!(items(&c, &["GONE0001".into()]).unwrap_err().contains("GONE0001"));
        assert!(items(&c, &["ATTACH01".into()]).is_err());
        assert!(items(&c, &["NOPE".into()]).is_err());
    }

    #[test]
    fn style_lu_dans_son_info() {
        let s = parse_style(r#"<?xml version="1.0"?><style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0"><info><title>The Cryosphere</title><id>http://www.zotero.org/styles/the-cryosphere</id><category citation-format="author-date"/></info><citation/></style>"#).unwrap();
        assert_eq!(s, Style { id: "http://www.zotero.org/styles/the-cryosphere".into(), title: "The Cryosphere".into(), format: "author-date".into() });
        let n = parse_style(r#"<style><info><title>IEEE &amp; co</title><id>http://www.zotero.org/styles/ieee</id><category citation-format="numeric"/></info></style>"#).unwrap();
        assert_eq!((n.title.as_str(), n.format.as_str()), ("IEEE & co", "numeric"));
    }
}
