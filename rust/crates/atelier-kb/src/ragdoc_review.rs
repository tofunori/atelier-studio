//! Read-only review data. PDF identity and page spans are checked locally.
use crate::article;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;

pub fn review(dir: &Path, draft: &str) -> Result<Value, String> {
    let markdown = article::read_draft(dir, draft)?;
    if markdown.len() > 20 * 1024 * 1024 {
        return Err("Extraction supérieure à 20 Mo ; ouvrez le fichier extrait dans un éditeur.".into());
    }
    let folder = dir.join(article::ARTICLE_DRAFT_DIR);
    let context: Value = serde_json::from_slice(&std::fs::read(folder.join(format!("{draft}.ragdoc.json"))).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    let metadata = &context["metadata"];
    let pdf = metadata["source_pdf"].as_str();
    let pdf_verified = pdf.and_then(|p| {
        if std::fs::metadata(p).ok()?.len() > 512 * 1024 * 1024 { return None; }
        std::fs::read(p).ok()
    }).map(|bytes| {
        let verified = bytes.starts_with(b"%PDF-") && metadata["pdf_sha256"].as_str() == Some(hex::encode(Sha256::digest(&bytes)).as_str());
        verified && std::fs::write(folder.join(format!("{draft}.pdf")), bytes).is_ok()
    }).unwrap_or(false);
    let content_verified = metadata["content_sha256"].as_str() == Some(hex::encode(Sha256::digest(markdown.as_bytes())).as_str());
    let chars: Vec<char> = markdown.chars().collect();
    let mut pages = Vec::new();
    let mut cursor = 0usize;
    if pdf_verified && content_verified {
        for span in metadata["page_spans"].as_array().into_iter().flatten() {
            let values = span["page"].as_u64().zip(span["start"].as_u64()).zip(span["end"].as_u64());
            let Some(((page, start), end)) = values else { pages.clear(); break };
            let (start, end) = (start as usize, end as usize);
            if page == 0 || start < cursor || end <= start || end > chars.len() { pages.clear(); break; }
            pages.push(json!({"page":page,"text":chars[start..end].iter().collect::<String>()}));
            cursor = end;
        }
    }
    let manifest = context["bundle"].as_str().and_then(|p|std::fs::read(Path::new(p).join("manifest.json")).ok())
        .and_then(|bytes|serde_json::from_slice::<Value>(&bytes).ok()).unwrap_or(json!({}));
    let indexed = std::fs::read(folder.join(format!("{draft}.indexed.json"))).ok().and_then(|b|serde_json::from_slice::<Value>(&b).ok())
        .filter(|v|v["ragdoc"]["verified"]==true && v["ragdoc"]["contentSha256"].as_str()==Some(hex::encode(Sha256::digest(markdown.as_bytes())).as_str()));
    Ok(json!({"draftId":draft,"indexed":indexed,"markdown":markdown,"pages":pages,
        "artifacts":manifest["artifacts"].as_array().cloned().unwrap_or_default(),
        "pdfAvailable":pdf_verified,"referenceOnly":pdf.is_none(),"pageLocationsVerified":!pages.is_empty(),
        "converter":metadata["parser"],"source":context["source"]}))
}

/// Compare file contents, never titles or attachment paths, to the canonical index.
pub fn zotero_with_status() -> Result<Value, String> {
    use std::io::Read;
    let mut result = zotero()?;
    let items = result["items"].as_array_mut().ok_or("Liste Zotero invalide")?;
    let mut fingerprints = Vec::new();
    for item in items.iter_mut() {
        item["ragdocStatus"] = json!("unknown");
        let digest = (|| -> Option<String> {
            let mut file = std::fs::File::open(item["path"].as_str()?).ok()?;
            if file.metadata().ok()?.len() > 512 * 1024 * 1024 { return None; }
            let mut hasher = Sha256::new();
            let mut buffer = [0u8; 65536];
            loop {
                let count = file.read(&mut buffer).ok()?;
                if count == 0 { break; }
                hasher.update(&buffer[..count]);
            }
            Some(hex::encode(hasher.finalize()))
        })();
        if let Some(digest) = digest { fingerprints.push(digest.clone()); item["pdfSha256"] = json!(digest); }
    }
    match crate::ragdoc::call(json!({"operation":"pdf_status", "fingerprints":fingerprints})) {
        Ok(status) => for item in items.iter_mut() {
            if let Some(hash) = item["pdfSha256"].as_str() {
                if let Some(source) = status["matches"][hash].as_str() {
                    item["ragdocSource"] = json!(source);
                    item["ragdocStatus"] = json!("indexed");
                } else { item["ragdocStatus"] = json!("missing"); }
            }
        },
        Err(error) => { result["statusError"] = json!(error); }
    }
    Ok(result)
}

fn zotero_year(date: &str) -> String {
    date.split(|c: char| !c.is_ascii_digit())
        .find(|part| part.len() == 4 && part.parse::<u16>().is_ok_and(|year| (1000..=3000).contains(&year)))
        .unwrap_or("").to_string()
}

pub fn zotero() -> Result<Value, String> {
    let client = reqwest::blocking::Client::builder().timeout(std::time::Duration::from_secs(15)).build().map_err(|e|e.to_string())?;
    let fetch = |endpoint: &str, attachments: bool| -> Result<Vec<Value>,String> {
        let mut all = Vec::new();
        for offset in (0..20000).step_by(100) {
            let mut url = format!("http://127.0.0.1:23119/api/users/0/items{endpoint}?limit=100&start={offset}");
            if attachments { url.push_str("&itemType=attachment"); }
            let rows: Vec<Value> = client.get(url).header("Zotero-API-Version","3").send().and_then(|r|r.error_for_status()).map_err(|_|"Zotero indisponible. Ouvrez Zotero et activez son API locale dans les réglages avancés.".to_string())?.json().map_err(|e|e.to_string())?;
            let done = rows.len() < 100;
            all.extend(rows);
            if done { return Ok(all); }
        }
        Err("Bibliothèque Zotero trop grande pour une lecture complète.".into())
    };
    let attachments = fetch("", true)?;
    let parents = fetch("/top", false)?;
    let parents: std::collections::HashMap<String,Value> = parents.into_iter().filter_map(|p|Some((p["key"].as_str()?.to_string(),p))).collect();
    let mut items = Vec::new();
    for a in attachments {
        if a["data"]["contentType"] != "application/pdf" {continue;}
        let Some(url) = a.pointer("/links/enclosure/href").and_then(Value::as_str).and_then(|s|url::Url::parse(s).ok()) else {continue};
        let Ok(path) = url.to_file_path() else {continue};
        let Ok(path) = path.canonicalize() else {continue};
        let Ok(meta) = path.metadata() else {continue};
        if !meta.is_file() {continue;}
        let parent = parents.get(a["data"]["parentItem"].as_str().unwrap_or("")).unwrap_or(&a);
        let stamp = meta.modified().ok().and_then(|t|t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d|d.as_secs()).unwrap_or(0);
        items.push(json!({"key":a["key"],"title":parent["data"]["title"],"path":path,
            "doi":parent["data"]["DOI"], "parentKey":a["data"]["parentItem"],
            "authors":parent["data"]["creators"].as_array().into_iter().flatten().filter(|c|c["creatorType"] == "author").map(|c|c["name"].as_str().map(str::to_string).unwrap_or_else(||format!("{} {}",c["firstName"].as_str().unwrap_or(""),c["lastName"].as_str().unwrap_or("")))).collect::<Vec<_>>().join("; "),
            "year":zotero_year(parent["data"]["date"].as_str().unwrap_or("")),"journal":parent["data"]["publicationTitle"],"identity":format!("{}:{}:{stamp}",a["key"].as_str().unwrap_or(""),meta.len())}));
    }
    Ok(json!({"items":items}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn zotero_dates_keep_the_year() {
        assert_eq!(zotero_year("June 2024"), "2024");
        assert_eq!(zotero_year("2021-03-12"), "2021");
        assert_eq!(zotero_year("no date"), "");
        assert_eq!(zotero_year("12345"), "");
    }
    fn fixture(dir: &Path, text: &str, spans: Value) -> String {
        let draft = article::save_draft(dir,text).unwrap();
        let pdf=dir.join("source.pdf");std::fs::write(&pdf,b"%PDF-test").unwrap();
        let context=json!({"metadata":{"source_pdf":pdf,"pdf_sha256":hex::encode(Sha256::digest(b"%PDF-test")),"content_sha256":hex::encode(Sha256::digest(text.as_bytes())),"page_spans":spans}});
        std::fs::write(dir.join(article::ARTICLE_DRAFT_DIR).join(format!("{draft}.ragdoc.json")),serde_json::to_vec(&context).unwrap()).unwrap();draft
    }
    #[test]
    fn unicode_page_offsets_and_durable_pdf() {
        let dir=tempfile::tempdir().unwrap();let draft=fixture(dir.path(),"é😀 page",json!([{"page":1,"start":1,"end":7}]));
        let result=review(dir.path(),&draft).unwrap();
        assert_eq!(result["pages"][0]["text"],"😀 page");assert_eq!(result["pdfAvailable"],true);
        assert_eq!(std::fs::read(dir.path().join(article::ARTICLE_DRAFT_DIR).join(format!("{draft}.pdf"))).unwrap(),b"%PDF-test");
    }
    #[test]
    fn changed_pdf_and_overlapping_spans_disable_page_claims() {
        let dir=tempfile::tempdir().unwrap();let draft=fixture(dir.path(),"abcdef",json!([{"page":1,"start":0,"end":4},{"page":2,"start":3,"end":6}]));
        assert_eq!(review(dir.path(),&draft).unwrap()["pages"],json!([]));
        std::fs::write(dir.path().join("source.pdf"),b"%PDF-other").unwrap();
        let result=review(dir.path(),&draft).unwrap();assert_eq!(result["pdfAvailable"],false);assert_eq!(result["markdown"],"abcdef");
    }
}
