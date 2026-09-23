//! Ragdoc corpus and Ragdrop conversion adapter. Drafts stay local until approval.
use crate::article::{self, ArticleMeta};
use crate::gbrain::{spawn_with_timeout, SpawnOutcome};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;

const REMOTE: &str = include_str!("ragdoc_remote.py");

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

pub fn call(request: Value) -> Result<Value, String> {
    let host = std::env::var("ATELIER_RAGDOC_HOST").unwrap_or_else(|_| "rorqual".into());
    let root = std::env::var("ATELIER_RAGDOC_ROOT")
        .unwrap_or_else(|_| "/volume1/Services/mcp/ragdoc".into());
    if host.starts_with('-')
        || host.is_empty()
        || !host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return Err("Hôte Ragdoc invalide".into());
    }
    if !root.starts_with('/') || root.contains('\0') {
        return Err("Dossier Ragdoc invalide".into());
    }
    let writing = request["operation"] == "write";
    let seconds = if writing { 7200 } else { 120 };
    let command = format!(
        "cd {} && /usr/bin/timeout {}s ./ragdoc-env-new/bin/python3 -c {}",
        quote(&root),
        seconds,
        quote(REMOTE)
    );
    let payload = serde_json::to_string(&request).map_err(|e| e.to_string())?;
    let outcome = spawn_with_timeout(
        "ssh",
        &[
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            "-o",
            "ServerAliveInterval=10",
            "-o",
            "ServerAliveCountMax=3",
            &host,
            &command,
        ],
        Some(&payload),
        Duration::from_secs(seconds + 15),
    );
    match outcome {
        SpawnOutcome::Finished {
            code,
            stdout,
            stderr,
        } => {
            let output = String::from_utf8_lossy(&stdout);
            let value = output
                .lines()
                .rev()
                .find_map(|line| serde_json::from_str::<Value>(line).ok());
            match value {
                Some(v) if code == 0 && v.get("ok").and_then(Value::as_bool) != Some(false) => {
                    Ok(v)
                }
                Some(v) => Err(v["error"]
                    .as_str()
                    .unwrap_or("Ragdoc : opération échouée")
                    .to_string()),
                None => Err(format!(
                    "Ragdoc indisponible : {}",
                    String::from_utf8_lossy(&stderr)
                        .chars()
                        .rev()
                        .take(600)
                        .collect::<String>()
                        .chars()
                        .rev()
                        .collect::<String>()
                )),
            }
        }
        SpawnOutcome::TimedOut => {
            Err("Ragdoc : délai dépassé. Le résultat doit être revérifié avant de relancer.".into())
        }
        SpawnOutcome::SpawnError(error) => Err(format!("Connexion Ragdoc impossible : {error}")),
    }
}

pub fn read(source: &str) -> Result<Value, String> {
    call(json!({"operation":"read", "source":source}))
}

fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn source_name(title: &str, fingerprint: &str) -> String {
    let stem = crate::gbrain::slugify_title(title)
        .chars()
        .take(100)
        .collect::<String>();
    format!(
        "{}_{}.md",
        if stem.is_empty() { "Document" } else { &stem },
        &fingerprint[..12]
    )
}

fn context_path(dir: &Path, draft: &str) -> PathBuf {
    dir.join(article::ARTICLE_DRAFT_DIR)
        .join(format!("{draft}.ragdoc.json"))
}

fn draft_result(
    dir: &Path,
    markdown: &str,
    path: &str,
    source: &str,
    meta: &ArticleMeta,
    converter: &str,
    context: Value,
    duplicates: Value,
) -> Result<Value, String> {
    let draft = hash(format!("{source}\n{markdown}").as_bytes())[..12].to_string();
    let folder = dir.join(article::ARTICLE_DRAFT_DIR);
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    std::fs::write(folder.join(format!("{draft}.md")), markdown).map_err(|e| e.to_string())?;
    let mut context = context;
    if let Some(bundle) = context["bundle"].as_str() {
        let bundle = PathBuf::from(bundle);
        let durable = folder.join(format!("{draft}.artifacts"));
        copy_bundle(&bundle, &durable)?;
        context["bundle"] = json!(durable);
    }
    std::fs::write(
        context_path(dir, &draft),
        serde_json::to_vec(&context).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(
        json!({"ok":true,"draftId":draft,"path":path,"slug":source,"exists":false,
        "meta":{"title":meta.title,"authors":meta.authors,"doi":meta.doi,"journal":meta.journal,"year":meta.year},
        "converter":converter,"metaSource":"texte","chars":markdown.chars().count(),
        "preview":markdown.chars().take(8000).collect::<String>(),"duplicates":duplicates}),
    )
}

pub fn import_pdf(path: &str, dir: &Path, step: &mut dyn FnMut(Value)) -> Result<Value, String> {
    import_pdf_with_converter(path, dir, None, step)
}

pub fn import_pdf_with_converter(path: &str, dir: &Path, selected: Option<&str>, step: &mut dyn FnMut(Value)) -> Result<Value, String> {
    let pdf = Path::new(path);
    if pdf
        .extension()
        .and_then(|x| x.to_str())
        .map(|x| x.eq_ignore_ascii_case("pdf"))
        != Some(true)
    {
        return Err("Sélectionnez un fichier PDF".into());
    }
    if std::fs::metadata(pdf).map_err(|e| e.to_string())?.len() > 512 * 1024 * 1024 {
        return Err("PDF supérieur à 512 Mo".into());
    }
    let bytes = std::fs::read(pdf).map_err(|e| format!("PDF illisible : {e}"))?;
    if !bytes.starts_with(b"%PDF-") {
        return Err("Le fichier n’est pas un PDF valide".into());
    }
    let fingerprint = hash(&bytes);
    drop(bytes);
    step(json!({"stage":"duplicates"}));
    let probe = call(json!({"operation":"probe", "fingerprint":fingerprint}))?;
    if let Some(source) = probe["duplicates"]
        .as_array()
        .and_then(|a| a.first())
        .and_then(|v| v["slug"].as_str())
    {
        return Ok(json!({"ok":true,"duplicate":true,"slug":source,"path":path,"exists":true,"meta":{"title":source}}));
    }
    let stem = pdf
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Article");
    let source = source_name(stem, &fingerprint);
    let output_name = source.trim_end_matches(".md");
    let home = std::env::var("HOME").unwrap_or_default();
    let project = std::env::var("ATELIER_RAGDOC_LOCAL_ROOT")
        .unwrap_or_else(|_| format!("{home}/Documents/Ragdoc"));
    let converter = selected.map(str::to_string).unwrap_or_else(|| std::env::var("ATELIER_RAGDOC_CONVERTER").unwrap_or_else(|_| "mistral".into()));
    if converter != "mistral" && converter != "mineru" {
        return Err("Convertisseur Ragdrop inconnu".into());
    }
    let script = Path::new(&project).join(format!("scripts/ragdrop_{converter}_convert.py"));
    if !script.is_file() {
        return Err(format!(
            "Convertisseur Ragdrop introuvable : {}",
            script.display()
        ));
    }
    step(json!({"stage":"ocr"}));
    let python = [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ]
    .into_iter()
    .find(|path| Path::new(path).is_file())
    .ok_or("Python 3 introuvable")?;
    let outcome = spawn_with_timeout(
        python,
        &[&script.to_string_lossy(), path, output_name],
        None,
        Duration::from_secs(5400),
    );
    match outcome {
        SpawnOutcome::Finished { code: 0, .. } => {}
        SpawnOutcome::Finished { stderr, .. } => {
            return Err(String::from_utf8_lossy(&stderr)
                .chars()
                .rev()
                .take(1200)
                .collect::<String>()
                .chars()
                .rev()
                .collect())
        }
        SpawnOutcome::TimedOut => return Err("Conversion Ragdrop : délai dépassé".into()),
        SpawnOutcome::SpawnError(e) => return Err(e),
    }
    let temporary = Path::new("/tmp");
    let markdown = std::fs::read_to_string(temporary.join(&source))
        .map_err(|e| format!("Conversion sans Markdown : {e}"))?;
    if markdown.trim().is_empty() {
        return Err("La conversion a produit un texte vide".into());
    }
    step(json!({"stage":"meta"}));
    let guessed = article::parse_article_meta(&markdown, path);
    let (meta, _) = crate::article_meta::resolve_article_meta(path, &guessed);
    let bundle = temporary.join(format!("{output_name}.ragdoc-artifacts"));
    let manifest: Value = std::fs::read(bundle.join("manifest.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(json!({}));
    let context = json!({"source":source,"bundle":bundle,"metadata":{
        "version":"atelier-pdf","source_pdf":path,"pdf_sha256":fingerprint,"parsed_pdf_sha256":fingerprint,
        "parser":format!("{converter}-ocr"),"completeness":"not_assessed", "content_sha256":hash(markdown.as_bytes()),
        "page_spans":manifest.get("page_spans").cloned().unwrap_or(json!([]))}});
    draft_result(
        dir,
        &markdown,
        path,
        &source,
        &meta,
        &converter,
        context,
        probe["duplicates"].clone(),
    )
}

pub fn import_doi(doi: &str, dir: &Path) -> Result<Value, String> {
    let clean = crate::article_meta::clean_doi(doi);
    if !crate::article_meta::is_valid_doi_shape(&clean) {
        return Err("DOI invalide".into());
    }
    let work =
        crate::article_meta::crossref_meta(&clean).ok_or("Référence Crossref indisponible")?;
    let meta = ArticleMeta {
        title: work.title,
        authors: work.authors,
        journal: work.journal,
        doi: work.doi,
        year: work.year,
    };
    let markdown = format!(
        "# {}\n\nFiche bibliographique — texte intégral non fourni.\n\n{}",
        meta.title,
        crate::article_meta::abstract_text(&work.abstract_text)
    );
    let source = source_name(&meta.title, &hash(clean.as_bytes()));
    draft_result(
        dir,
        &markdown,
        &format!("doi:{clean}"),
        &source,
        &meta,
        "crossref",
        json!({"source":source,"metadata":{"parser":"crossref","completeness":"abstract_only","page_spans":[]}}),
        json!([]),
    )
}

fn copy_bundle(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.join("manifest.json").is_file() {
        return Err("Manifeste Ragdrop absent ; conversion incomplète".into());
    }
    let mut files = Vec::new();
    artifact_files(source, source, &mut files, &mut 0)?;
    for item in files {
        let path = destination.join(item["path"].as_str().ok_or("Chemin absent")?);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(
            path,
            hex::decode(item["hex"].as_str().unwrap_or("")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn artifact_files(
    root: &Path,
    path: &Path,
    files: &mut Vec<Value>,
    size: &mut u64,
) -> Result<(), String> {
    if !path.exists() {
        return Err("Illustrations du brouillon introuvables ; reconvertir le PDF".into());
    }
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_symlink() {
            return Err("Lien symbolique interdit dans les illustrations".into());
        }
        if kind.is_dir() {
            artifact_files(root, &entry.path(), files, size)?;
        } else if kind.is_file() {
            *size += entry.metadata().map_err(|e| e.to_string())?.len();
            if *size > 100 * 1024 * 1024 {
                return Err("Illustrations supérieures à 100 Mo".into());
            }
            files.push(json!({"path":entry.path().strip_prefix(root).map_err(|e|e.to_string())?.to_string_lossy(),"hex":hex::encode(std::fs::read(entry.path()).map_err(|e|e.to_string())?)}));
        }
    }
    Ok(())
}

pub fn write_draft(
    dir: &Path,
    draft: &str,
    source: &str,
    meta: &ArticleMeta,
) -> Result<Value, String> {
    let markdown = article::read_draft(dir, draft)?;
    let context: Value = serde_json::from_slice(
        &std::fs::read(context_path(dir, draft))
            .map_err(|_| "Brouillon Ragdoc incomplet ; reconvertir le document")?,
    )
    .map_err(|e| e.to_string())?;
    // Artifact links contain the original source stem. Never silently rename it.
    if context["source"].as_str() != Some(source) {
        return Err(
            "Le nom Ragdoc est fixé à l’import pour préserver les liens des figures".into(),
        );
    }
    if let Some(pdf) = context["metadata"]["source_pdf"].as_str() {
        let bytes = std::fs::read(pdf).map_err(|_| "PDF original introuvable ; approbation suspendue")?;
        if context["metadata"]["pdf_sha256"].as_str() != Some(hash(&bytes).as_str()) {
            return Err("Le PDF original a changé depuis la conversion ; reconvertissez-le avant approbation".into());
        }
    }
    let mut metadata = context["metadata"].clone();
    metadata["title"] = json!(meta.title);
    metadata["authors"] = json!(meta
        .authors
        .split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>());
    metadata["doi"] = json!(meta.doi);
    if let Some(year) = meta.year {
        if !(1000..=3000).contains(&year) {
            return Err("Année invalide".into());
        }
        metadata["year"] = json!(year);
    }
    metadata["journal"] = json!(meta.journal);
    let mut files = Vec::new();
    if let Some(bundle) = context["bundle"].as_str() {
        if !Path::new(bundle).join("manifest.json").is_file() {
            return Err("Manifeste du brouillon absent ; reconvertir le PDF".into());
        }
        artifact_files(Path::new(bundle), Path::new(bundle), &mut files, &mut 0)?;
    }
    let result = call(
        json!({"operation":"write", "source":source,"markdown":markdown,"metadata":metadata,"artifacts":files}),
    )?;
    // A durable success receipt reconciles a disconnected UI without re-indexing.
    std::fs::write(dir.join(article::ARTICLE_DRAFT_DIR).join(format!("{draft}.indexed.json")),serde_json::to_vec(&result).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    Ok(result)
}

pub fn promote(entry: &Value, text: &str, write: bool) -> Result<Value, String> {
    let title = entry["title"].as_str().unwrap_or("Note");
    let source = source_name(title, &hash(text.as_bytes()));
    if !write {
        return Ok(
            json!({"ok":true,"id":entry["id"],"slug":source,"exists":false,"title":title,"chars":text.chars().count(),"preview":text.chars().take(8000).collect::<String>()}),
        );
    }
    let mut result = call(
        json!({"operation":"write","source":source,"markdown":text,"metadata":{"version":"atelier-note","title":title,"parser":"atelier-text","completeness":"not_assessed","page_spans":[]}}),
    )?;
    result["id"] = entry["id"].clone();
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deterministic_names_preserve_pdf_identity() {
        let fingerprint = hash(b"pdf");
        assert_eq!(
            source_name("L’albédo / été", &fingerprint),
            source_name("L’albédo / été", &fingerprint)
        );
        assert!(!source_name("../../a", &fingerprint).contains('/'));
        assert_ne!(
            source_name("article", &fingerprint),
            source_name("article", &hash(b"another pdf"))
        );
    }
    #[test]
    fn renamed_draft_is_rejected_before_network() {
        let dir = tempfile::tempdir().unwrap();
        let draft = article::save_draft(dir.path(), "text").unwrap();
        std::fs::write(
            context_path(dir.path(), &draft),
            r#"{"source":"original.md","metadata":{}}"#,
        )
        .unwrap();
        let meta = ArticleMeta {
            title: String::new(),
            authors: String::new(),
            journal: String::new(),
            doi: String::new(),
            year: None,
        };
        assert!(write_draft(dir.path(), &draft, "other.md", &meta)
            .unwrap_err()
            .contains("fixé"));
        assert!(article::read_draft(dir.path(), &draft).is_ok());
    }
}

pub fn apply_zotero_metadata(dir: &Path, result: &mut Value, zotero: &Value) -> Result<(),String> {
    let draft=result["draftId"].as_str().ok_or("Brouillon manquant")?;
    article::read_draft(dir,draft)?;
    let file=context_path(dir,draft);
    let mut context:Value=serde_json::from_slice(&std::fs::read(&file).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    for (key,target) in [("key","zotero_attachment_key"),("parentKey","zotero_item_key")] {
        if let Some(value)=zotero[key].as_str().filter(|s|s.len()==8 && s.bytes().all(|c|c.is_ascii_alphanumeric())) {context["metadata"][target]=json!(value);}
    }
    for field in ["title","authors","doi","journal"] {
        if let Some(value)=zotero[field].as_str().filter(|s|!s.trim().is_empty()) {result["meta"][field]=json!(value);}
    }
    if let Some(year)=zotero["year"].as_str().and_then(|s|s.parse::<u32>().ok()).filter(|y|(1000..=3000).contains(y)) {result["meta"]["year"]=json!(year);}
    result["metaSource"]=json!("zotero");
    std::fs::write(file,serde_json::to_vec(&context).map_err(|e|e.to_string())?).map_err(|e|e.to_string())
}

#[cfg(test)]
mod workspace_tests {
    use super::*;
    #[test]
    fn linked_zotero_metadata_is_retained_in_draft() {
        let dir=tempfile::tempdir().unwrap();let draft=article::save_draft(dir.path(),"text").unwrap();
        std::fs::write(context_path(dir.path(),&draft),r#"{"metadata":{}}"#).unwrap();
        let mut value=json!({"draftId":draft,"meta":{}});
        apply_zotero_metadata(dir.path(),&mut value,&json!({"key":"ABCD1234","parentKey":"EFGH5678","title":"Exact title","authors":"A; B","doi":"10.1234/test","year":"2024"})).unwrap();
        assert_eq!(value["meta"]["authors"],"A; B");assert_eq!(value["meta"]["year"],2024);
        let context:Value=serde_json::from_slice(&std::fs::read(context_path(dir.path(),&draft)).unwrap()).unwrap();
        assert_eq!(context["metadata"]["zotero_attachment_key"],"ABCD1234");
    }
    #[test]
    fn changed_pdf_blocks_approval_before_any_remote_call() {
        let dir=tempfile::tempdir().unwrap();let draft=article::save_draft(dir.path(),"text").unwrap();
        let pdf=dir.path().join("changed.pdf");std::fs::write(&pdf,b"different").unwrap();
        std::fs::write(context_path(dir.path(),&draft),serde_json::to_vec(&json!({"source":"a.md","metadata":{"source_pdf":pdf,"pdf_sha256":"old"}})).unwrap()).unwrap();
        let meta=ArticleMeta{title:"Title".into(),authors:String::new(),journal:String::new(),doi:String::new(),year:None};
        assert!(write_draft(dir.path(),&draft,"a.md",&meta).unwrap_err().contains("changé"));
        assert!(article::read_draft(dir.path(),&draft).is_ok());
    }
}
