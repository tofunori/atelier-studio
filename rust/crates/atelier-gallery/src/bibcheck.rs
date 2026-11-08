//! Vérification des références d'une `.bib` contre Crossref (panneau
//! « Références » de l'éditeur LaTeX).
//!
//! - `POST /bibcheck/plan`   : quelles .bib, quelles entrées, lesquelles sont
//!   citées, quelles clés citées manquent. Aucun appel réseau.
//! - `POST /bibcheck/entry`  : une entrée comparée à Crossref (par DOI, sinon
//!   recherche par titre et auteurs) ; rend la correction proposée.
//! - `POST /bibcheck/ignore` : « Ignorer » mémorisé jusqu'à la prochaine
//!   modification de l'entrée (`.fig_thumbs/bibcheck.json`).
//! - `POST /bibcheck/zotero` : ouvre la fiche correspondante dans Zotero.
//!
//! Le serveur ne modifie JAMAIS la .bib : la correction proposée revient au
//! navigateur, qui ne l'applique qu'au clic de l'utilisateur.

use crate::bib::{self, BibEntry, Change, Work};
use crate::{AppState, request_allowed};
use atelier_core::{atomic_write_text, find_tex_root, safe_project_path};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use md5::{Digest, Md5};
use regex::Regex;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const CACHE_TTL: Duration = Duration::from_secs(30 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_TEX_FILES: usize = 200;

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

// ---------------------------------------------------------------------------
// Crossref
// ---------------------------------------------------------------------------

fn crossref_base() -> String {
    std::env::var("ATELIER_CROSSREF_BASE")
        .ok()
        .filter(|base| !base.is_empty())
        .unwrap_or_else(|| "https://api.crossref.org".into())
        .trim_end_matches('/')
        .to_string()
}

fn encode_component(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for byte in raw.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

/// `Ok(None)` : Crossref ne connaît pas ce DOI (404). `Err` : hors ligne,
/// délai dépassé ou erreur du service — l'entrée reste « non vérifiée ».
type CrossrefResult = Result<Option<Value>, String>;

fn cache() -> &'static Mutex<HashMap<String, (Instant, Option<Value>)>> {
    static CACHE: OnceLock<Mutex<HashMap<String, (Instant, Option<Value>)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn crossref_get(url: &str) -> CrossrefResult {
    if let Ok(guard) = cache().lock()
        && let Some((at, value)) = guard.get(url)
        && at.elapsed() < CACHE_TTL
    {
        return Ok(value.clone());
    }
    let contact = atelier_integrations::Integrations::load().crossref_mailto();
    let full = match &contact {
        Some(mail) => format!(
            "{url}{}mailto={}",
            if url.contains('?') { '&' } else { '?' },
            encode_component(mail)
        ),
        None => url.to_string(),
    };
    let agent = crate::tectonic::agent_for(&full);
    let user_agent = match &contact {
        Some(mail) => format!(
            "atelier-studio/{} (mailto:{mail})",
            env!("CARGO_PKG_VERSION")
        ),
        None => format!("atelier-studio/{}", env!("CARGO_PKG_VERSION")),
    };
    let response = agent
        .get(&full)
        .set("User-Agent", &user_agent)
        .timeout(REQUEST_TIMEOUT)
        .call();
    let value = match response {
        Ok(response) => {
            let body: Value = response
                .into_json()
                .map_err(|error| format!("réponse illisible : {error}"))?;
            Some(body.get("message").cloned().unwrap_or(Value::Null))
        }
        Err(ureq::Error::Status(404, _)) => None,
        Err(ureq::Error::Status(429, _)) => return Err("Crossref demande de ralentir".into()),
        Err(ureq::Error::Status(code, _)) => return Err(format!("Crossref a répondu {code}")),
        Err(ureq::Error::Transport(transport)) => {
            return Err(format!("Crossref injoignable : {transport}"));
        }
    };
    if let Ok(mut guard) = cache().lock() {
        if guard.len() > 4000 {
            guard.clear();
        }
        guard.insert(url.to_string(), (Instant::now(), value.clone()));
    }
    Ok(value)
}

fn crossref_work(doi: &str) -> Result<Option<Work>, String> {
    let url = format!("{}/works/{}", crossref_base(), encode_component(doi));
    Ok(crossref_get(&url)?
        .filter(|message| message.is_object())
        .map(|message| bib::work_from(&message)))
}

fn crossref_search(entry: &BibEntry) -> Result<Vec<Work>, String> {
    let Some(title) = entry.value("title") else {
        return Ok(Vec::new());
    };
    let mut query = bib::delatex(title);
    if let Some(first) = entry
        .value("author")
        .and_then(|raw| bib::split_authors(raw).into_iter().next())
    {
        query.push(' ');
        query.push_str(&bib::family_of(&first));
    }
    if let Some(year) = entry.value("year") {
        query.push(' ');
        query.push_str(year);
    }
    let url = format!(
        "{}/works?rows=5&select=DOI,title,subtitle,author,container-title,short-container-title,issued,published-print,published-online,volume,issue,page,article-number,type&query.bibliographic={}",
        crossref_base(),
        encode_component(&query)
    );
    let message = crossref_get(&url)?;
    Ok(message
        .and_then(|message| message.get("items").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .iter()
        .map(bib::work_from)
        .collect())
}

// ---------------------------------------------------------------------------
// Vérification d'une entrée
// ---------------------------------------------------------------------------

fn entry_hash(text: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

/// Types que Crossref sait décrire même sans DOI dans l'entrée.
fn searchable(entry: &BibEntry) -> bool {
    matches!(
        entry.kind.as_str(),
        "article" | "inproceedings" | "incollection" | "conference"
    )
}

fn work_json(work: &Work) -> Value {
    json!({
        "doi": work.doi,
        "title": work.full_title(),
        "authors": work.authors.iter().map(|(family, _)| family.clone()).collect::<Vec<_>>(),
        "journal": work.journal,
        "journalShort": work.journal_short.first().cloned().unwrap_or_default(),
        "year": work.year,
        "volume": work.volume,
        "issue": work.issue,
        "pages": work.pages_bibtex(),
    })
}

fn changes_json(changes: &[Change]) -> Value {
    serde_json::to_value(changes).unwrap_or(Value::Array(Vec::new()))
}

/// Résultat complet pour une entrée : statut, résumé en une phrase, champs
/// à corriger et texte d'entrée corrigé (jamais écrit ici).
pub fn check_entry(text: &str, entry: &BibEntry) -> Value {
    let old = &text[entry.start..entry.end];
    let base = json!({
        "key": entry.key,
        "kind": entry.kind,
        "line": bib::line_of(text, entry.start),
        "endLine": bib::line_of(text, entry.end.saturating_sub(1)),
        "hash": entry_hash(old),
        "title": entry.value("title").map(bib::delatex).unwrap_or_default(),
        "old": old,
    });
    let mut result = base.as_object().cloned().unwrap_or_default();
    let mut set = |key: &str, value: Value| {
        result.insert(key.to_string(), value);
    };
    match bib::entry_doi(entry) {
        Some(doi) => match crossref_work(&doi) {
            Err(error) => {
                set("status", json!("error"));
                set("summary", json!("Non vérifiée"));
                set("error", json!(error));
            }
            Ok(None) => {
                set("status", json!("notfound"));
                set("summary", json!("DOI introuvable chez Crossref"));
                set("doi", json!(doi));
            }
            Ok(Some(work)) => {
                let changes = bib::compare(entry, &work);
                set("doi", json!(work.doi));
                set("crossref", work_json(&work));
                if !changes.is_empty() {
                    let pairs: Vec<(String, String)> = changes
                        .iter()
                        .map(|c| (c.field.clone(), c.new.clone()))
                        .collect();
                    if let Some(proposed) = bib::rewrite_entry(old, &pairs) {
                        set("proposed", json!(proposed));
                    }
                }
                set("changes", changes_json(&changes));
                if let Some((kind, when)) = &work.retraction {
                    let what = if kind == "retraction" {
                        "Rétractée"
                    } else {
                        "Retirée"
                    };
                    set("status", json!("retracted"));
                    set(
                        "summary",
                        json!(if when.is_empty() {
                            what.to_string()
                        } else {
                            format!("{what} en {when}")
                        }),
                    );
                    set("retraction", json!({"kind": kind, "date": when}));
                } else if changes.is_empty() {
                    set("status", json!("ok"));
                    set("summary", json!("Conforme"));
                } else {
                    set("status", json!("diff"));
                    set("summary", json!(bib::summary(&changes)));
                }
            }
        },
        None if searchable(entry) => match crossref_search(entry) {
            Err(error) => {
                set("status", json!("error"));
                set("summary", json!("Non vérifiée"));
                set("error", json!(error));
            }
            Ok(found) => match found
                .into_iter()
                .find(|work| !work.doi.is_empty() && bib::candidate_matches(entry, work))
            {
                Some(work) => {
                    let changes = vec![Change {
                        field: "doi".into(),
                        label: "DOI".into(),
                        old: None,
                        new: work.doi.clone(),
                    }];
                    if let Some(proposed) =
                        bib::rewrite_entry(old, &[("doi".into(), work.doi.clone())])
                    {
                        set("proposed", json!(proposed));
                    }
                    set("status", json!("candidate"));
                    set("summary", json!("DOI manquant, Crossref en propose un"));
                    set("doi", json!(work.doi));
                    set("crossref", work_json(&work));
                    set("changes", changes_json(&changes));
                }
                None => {
                    set("status", json!("nodoi"));
                    set("summary", json!("Sans DOI, introuvable chez Crossref"));
                }
            },
        },
        None => {
            set("status", json!("nodoi"));
            set("summary", json!("Sans DOI, non vérifiable"));
        }
    }
    Value::Object(result)
}

// ---------------------------------------------------------------------------
// Manuscrit : .bib utilisées, clés citées
// ---------------------------------------------------------------------------

fn strip_tex_comments(text: &str) -> String {
    text.lines()
        .map(|line| {
            let bytes = line.as_bytes();
            let mut cut = line.len();
            for (index, byte) in bytes.iter().enumerate() {
                if *byte == b'%' && (index == 0 || bytes[index - 1] != b'\\') {
                    cut = index;
                    break;
                }
            }
            &line[..cut]
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn input_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\\(?:input|include|subfile)\s*\{([^}]+)\}").unwrap())
}
fn bibliography_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"\\(?:bibliography|addbibresource|addglobalbib)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}",
        )
        .unwrap()
    })
}
fn cite_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]*)\}")
            .unwrap()
    })
}

#[derive(Default)]
struct Manuscript {
    tex_files: Vec<PathBuf>,
    bibs: Vec<PathBuf>,
    /// clé → (fichier, ligne) de la première citation.
    cited: BTreeMap<String, (PathBuf, usize)>,
    cite_all: bool,
}

fn with_ext(raw: &str, ext: &str) -> String {
    let raw = raw.trim();
    if Path::new(raw)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(ext))
    {
        raw.to_string()
    } else {
        format!("{raw}.{ext}")
    }
}

/// Parcourt le manuscrit à partir de sa racine (`\input`, `\include`) ;
/// `overrides` remplace le texte disque d'un fichier ouvert non enregistré.
fn read_manuscript(root: &Path, overrides: &HashMap<PathBuf, String>) -> Manuscript {
    let mut manuscript = Manuscript::default();
    let base = root.parent().unwrap_or(Path::new(".")).to_path_buf();
    let mut queue = vec![root.to_path_buf()];
    let mut seen = BTreeSet::new();
    while let Some(file) = queue.pop() {
        if manuscript.tex_files.len() >= MAX_TEX_FILES || !seen.insert(file.clone()) {
            continue;
        }
        let Some(text) = overrides
            .get(&file)
            .cloned()
            .or_else(|| fs::read_to_string(&file).ok())
        else {
            continue;
        };
        manuscript.tex_files.push(file.clone());
        let text = strip_tex_comments(&text);
        for capture in input_re().captures_iter(&text) {
            let child = base.join(with_ext(&capture[1], "tex"));
            if let Ok(child) = fs::canonicalize(&child) {
                queue.push(child);
            }
        }
        for capture in bibliography_re().captures_iter(&text) {
            for name in capture[1].split(',').filter(|name| !name.trim().is_empty()) {
                if let Ok(path) = fs::canonicalize(base.join(with_ext(name, "bib")))
                    && !manuscript.bibs.contains(&path)
                {
                    manuscript.bibs.push(path);
                }
            }
        }
        for capture in cite_re().captures_iter(&text) {
            let line = bib::line_of(&text, capture.get(0).map_or(0, |m| m.start()));
            for key in capture[1]
                .split(',')
                .map(str::trim)
                .filter(|key| !key.is_empty())
            {
                if key == "*" {
                    manuscript.cite_all = true;
                    continue;
                }
                manuscript
                    .cited
                    .entry(key.to_string())
                    .or_insert((file.clone(), line));
            }
        }
    }
    manuscript
}

/// Pour une .bib ouverte seule : les .tex voisins qui l'utilisent.
fn manuscripts_using(bib_path: &Path) -> Vec<PathBuf> {
    let Some(dir) = bib_path.parent() else {
        return Vec::new();
    };
    let stem = bib_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut roots = Vec::new();
    let mut stack = vec![(dir.to_path_buf(), 0usize)];
    let mut visited = 0usize;
    while let Some((folder, depth)) = stack.pop() {
        let Ok(read) = fs::read_dir(&folder) else {
            continue;
        };
        for item in read.flatten() {
            let path = item.path();
            let name = item.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if path.is_dir() {
                if depth < 2 {
                    stack.push((path, depth + 1));
                }
                continue;
            }
            if !name.ends_with(".tex") {
                continue;
            }
            visited += 1;
            if visited > MAX_TEX_FILES {
                return roots;
            }
            let Ok(text) = fs::read_to_string(&path) else {
                continue;
            };
            let text = strip_tex_comments(&text);
            let uses = bibliography_re().captures_iter(&text).any(|capture| {
                capture[1].split(',').any(|name| {
                    Path::new(&with_ext(name, "bib"))
                        .file_stem()
                        .is_some_and(|s| s.to_string_lossy() == stem)
                })
            });
            if uses && let Ok(path) = fs::canonicalize(&path) {
                roots.push(find_tex_root(&path));
            }
        }
    }
    roots.sort();
    roots.dedup();
    roots
}

// ---------------------------------------------------------------------------
// Zotero
// ---------------------------------------------------------------------------

/// La .bib est-elle tenue par un export automatique de Zotero ? Registre de
/// Better BibTeX si lisible, sinon des indices dans le fichier.
fn exported_by_zotero(bib_path: &Path, text: &str) -> bool {
    let head: String = text
        .chars()
        .take(2000)
        .collect::<String>()
        .to_ascii_lowercase();
    if head.contains("better bibtex") || head.contains("zotero") {
        return true;
    }
    if better_bibtex_exports().iter().any(|path| path == bib_path) {
        return true;
    }
    let entries = bib::parse_bib(text);
    let with_storage = entries
        .iter()
        .filter(|entry| {
            entry
                .value("file")
                .is_some_and(|file| file.contains("Zotero") || file.contains("/storage/"))
        })
        .count();
    entries.len() >= 3 && with_storage * 2 >= entries.len()
}

fn better_bibtex_exports() -> Vec<PathBuf> {
    let db = atelier_integrations::Integrations::load()
        .zotero_dir()
        .join("better-bibtex.sqlite");
    if !db.is_file() {
        return Vec::new();
    }
    // `immutable=1` : lecture sans verrou, Zotero peut tenir la base ouverte.
    let uri = format!("file:{}?immutable=1", db.display());
    let Ok(connection) = rusqlite::Connection::open_with_flags(
        &uri,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    ) else {
        return Vec::new();
    };
    let tables: Vec<String> = connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .and_then(|mut statement| statement.query_map([], |row| row.get(0))?.collect())
        .unwrap_or_default();
    let mut paths = Vec::new();
    for table in tables {
        if !table.to_ascii_lowercase().contains("export") || table.contains('"') {
            continue;
        }
        let sql = format!("SELECT path FROM \"{table}\"");
        if let Ok(mut statement) = connection.prepare(&sql)
            && let Ok(rows) = statement.query_map([], |row| row.get::<_, String>(0))
        {
            paths.extend(
                rows.flatten()
                    .map(|raw| fs::canonicalize(&raw).unwrap_or_else(|_| PathBuf::from(raw))),
            );
        }
    }
    paths
}

// ---------------------------------------------------------------------------
// « Ignorer »
// ---------------------------------------------------------------------------

fn ignore_store(root: &Path) -> PathBuf {
    root.join(".fig_thumbs").join("bibcheck.json")
}

fn ignore_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn read_ignored(root: &Path) -> Value {
    fs::read_to_string(ignore_store(root))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({"ignored": {}}))
}

fn ignored_hash(store: &Value, bib_path: &Path, key: &str) -> Option<String> {
    store
        .get("ignored")?
        .get(bib_path.to_string_lossy().as_ref())?
        .get(key)?
        .as_str()
        .map(str::to_string)
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PlanBody {
    path: String,
    /// Tampon de l'éditeur (fichier ouvert, peut-être non enregistré).
    #[serde(default)]
    text: Option<String>,
}

pub async fn plan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PlanBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(path) = safe_project_path(&state.root, &body.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let root = state.root.clone();
    let result = tokio::task::spawn_blocking(move || build_plan(&root, &path, body.text)).await;
    match result {
        Ok(Ok(value)) => (StatusCode::OK, Json(value)).into_response(),
        Ok(Err(message)) => json_error(StatusCode::BAD_REQUEST, message),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

fn build_plan(project: &Path, path: &Path, text: Option<String>) -> Result<Value, String> {
    let is_bib = path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("bib"));
    let mut overrides = HashMap::new();
    if let Some(text) = &text {
        overrides.insert(path.to_path_buf(), text.clone());
    }
    let (bibs, manuscripts) = if is_bib {
        let roots = manuscripts_using(path);
        let manuscripts: Vec<Manuscript> = roots
            .iter()
            .map(|root| read_manuscript(root, &overrides))
            .collect();
        (vec![path.to_path_buf()], manuscripts)
    } else {
        let root = find_tex_root(path);
        let manuscript = read_manuscript(&root, &overrides);
        (manuscript.bibs.clone(), vec![manuscript])
    };
    let cite_known = !manuscripts.is_empty() && !manuscripts.iter().any(|m| m.cite_all);
    let mut cited: BTreeMap<String, (PathBuf, usize)> = BTreeMap::new();
    for manuscript in &manuscripts {
        for (key, at) in &manuscript.cited {
            cited.entry(key.clone()).or_insert_with(|| at.clone());
        }
    }
    let store = read_ignored(project);
    let mut entries = Vec::new();
    let mut keys = BTreeSet::new();
    let mut bib_list = Vec::new();
    for bib_path in &bibs {
        let bib_text = overrides
            .get(bib_path)
            .cloned()
            .or_else(|| fs::read_to_string(bib_path).ok());
        let Some(bib_text) = bib_text else {
            bib_list.push(json!({"path": bib_path, "name": file_name(bib_path), "missing": true, "zotero": false}));
            continue;
        };
        bib_list.push(json!({
            "path": bib_path,
            "name": file_name(bib_path),
            "zotero": exported_by_zotero(bib_path, &bib_text),
        }));
        for entry in bib::parse_bib(&bib_text) {
            keys.insert(entry.key.clone());
            let hash = entry_hash(&bib_text[entry.start..entry.end]);
            let ignored =
                ignored_hash(&store, bib_path, &entry.key).is_some_and(|saved| saved == hash);
            entries.push(json!({
                "key": entry.key,
                "kind": entry.kind,
                "bib": bib_path,
                "line": bib::line_of(&bib_text, entry.start),
                "title": entry.value("title").map(bib::delatex).unwrap_or_default(),
                "doi": bib::entry_doi(&entry),
                "cited": !cite_known || cited.contains_key(&entry.key),
                "ignored": ignored,
            }));
        }
    }
    let missing: Vec<Value> = if cite_known && !bibs.is_empty() {
        cited
            .iter()
            .filter(|(key, _)| !keys.contains(*key))
            .map(|(key, (file, line))| json!({"key": key, "file": file, "name": file_name(file), "line": line}))
            .collect()
    } else {
        Vec::new()
    };
    let cited_count = entries
        .iter()
        .filter(|entry| entry["cited"] == json!(true))
        .count();
    Ok(json!({
        "bibs": bib_list,
        "entries": entries,
        "missing": missing,
        "total": entries.len(),
        "cited": if cite_known { json!(cited_count) } else { Value::Null },
        "contact": atelier_integrations::Integrations::load().crossref_mailto().is_some(),
    }))
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default()
}

#[derive(Deserialize)]
pub struct EntryBody {
    /// La .bib qui contient l'entrée.
    path: String,
    key: String,
    #[serde(default)]
    text: Option<String>,
}

pub async fn entry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<EntryBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(path) = safe_project_path(&state.root, &body.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let root = state.root.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<Value, (StatusCode, String)> {
        let text = match body.text {
            Some(text) => text,
            None => fs::read_to_string(&path)
                .map_err(|error| (StatusCode::NOT_FOUND, error.to_string()))?,
        };
        let entries = bib::parse_bib(&text);
        let found = entries.iter().find(|entry| entry.key == body.key).ok_or((
            StatusCode::NOT_FOUND,
            format!("entrée {} introuvable", body.key),
        ))?;
        let mut value = check_entry(&text, found);
        let store = read_ignored(&root);
        let ignored = ignored_hash(&store, &path, &found.key)
            .is_some_and(|saved| value["hash"] == json!(saved));
        value["ignored"] = json!(ignored);
        value["bib"] = json!(path);
        Ok(value)
    })
    .await;
    match result {
        Ok(Ok(value)) => (StatusCode::OK, Json(value)).into_response(),
        Ok(Err((status, message))) => json_error(status, message),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

#[derive(Deserialize)]
pub struct IgnoreBody {
    path: String,
    key: String,
    /// Empreinte de l'entrée ignorée ; `null` annule.
    #[serde(default)]
    hash: Option<String>,
}

pub async fn ignore(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<IgnoreBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(path) = safe_project_path(&state.root, &body.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let root = state.root.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let _guard = ignore_lock().lock().map_err(|error| error.to_string())?;
        let mut store = read_ignored(&root);
        let bib_key = path.to_string_lossy().to_string();
        let ignored = store
            .as_object_mut()
            .ok_or("état illisible")?
            .entry("ignored")
            .or_insert_with(|| json!({}));
        if !ignored.is_object() {
            *ignored = json!({});
        }
        let per_bib = ignored
            .as_object_mut()
            .unwrap()
            .entry(bib_key)
            .or_insert_with(|| json!({}));
        if !per_bib.is_object() {
            *per_bib = json!({});
        }
        let map = per_bib.as_object_mut().unwrap();
        match body.hash {
            Some(hash) => {
                map.insert(body.key, json!(hash));
            }
            None => {
                map.remove(&body.key);
            }
        }
        let file = ignore_store(&root);
        if let Some(parent) = file.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        atomic_write_text(
            &file,
            &serde_json::to_string_pretty(&store).unwrap_or_default(),
        )
        .map_err(|error| error.to_string())
    })
    .await;
    match result {
        Ok(Ok(())) => (StatusCode::OK, Json(json!({"ok": true}))).into_response(),
        Ok(Err(message)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, message),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

#[derive(Deserialize)]
pub struct ZoteroBody {
    #[serde(default)]
    doi: Option<String>,
    #[serde(default)]
    title: Option<String>,
}

pub async fn zotero(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ZoteroBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let cache = state.zotero.clone();
    let found = tokio::task::spawn_blocking(move || {
        crate::zotero::item_link(&cache, body.doi.as_deref(), body.title.as_deref())
    })
    .await;
    let link = match found {
        Ok(Ok(Some(link))) => link,
        Ok(Ok(None)) => return json_error(StatusCode::NOT_FOUND, "Fiche introuvable dans Zotero"),
        Ok(Err(message)) => return json_error(StatusCode::SERVICE_UNAVAILABLE, message),
        Err(error) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    };
    let mut command = tokio::process::Command::new("open");
    command.arg(&link);
    match tokio::time::timeout(Duration::from_secs(10), command.output()).await {
        Ok(Ok(output)) if output.status.success() => {
            (StatusCode::OK, Json(json!({"ok": true, "link": link}))).into_response()
        }
        Ok(Ok(_)) => json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Zotero n'a pas pu s'ouvrir",
        ),
        Ok(Err(error)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "Zotero ne répond pas"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manuscript_follows_inputs_bibliographies_and_citations() {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(root.join("sections")).unwrap();
        fs::write(
            root.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\nAs shown \\citep[p.~3]{tremblay2021, roy2018}.\n% \\cite{commented}\n\\input{sections/data}\n\\bibliography{refs}\n\\end{document}\n",
        )
        .unwrap();
        fs::write(
            root.join("sections/data.tex"),
            "Data from \\textcite{lefebvre2020}.\n",
        )
        .unwrap();
        fs::write(root.join("refs.bib"), "@article{tremblay2021, title={A}}\n@article{roy2018, title={B}}\n@book{unused, title={C}}\n").unwrap();
        let manuscript = read_manuscript(&root.join("main.tex"), &HashMap::new());
        assert_eq!(manuscript.tex_files.len(), 2);
        assert_eq!(manuscript.bibs, vec![root.join("refs.bib")]);
        let keys: Vec<&str> = manuscript.cited.keys().map(String::as_str).collect();
        assert_eq!(keys, ["lefebvre2020", "roy2018", "tremblay2021"]);
        assert_eq!(manuscript.cited["lefebvre2020"].1, 1);

        let plan = build_plan(&root, &root.join("refs.bib"), None).unwrap();
        assert_eq!(plan["total"], json!(3));
        assert_eq!(plan["cited"], json!(2));
        assert_eq!(plan["missing"][0]["key"], json!("lefebvre2020"));
        assert_eq!(plan["entries"][2]["cited"], json!(false));
        let from_tex = build_plan(&root, &root.join("main.tex"), None).unwrap();
        assert_eq!(from_tex["bibs"][0]["name"], json!("refs.bib"));
        assert_eq!(from_tex["missing"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn detects_a_zotero_export() {
        let path = Path::new("/nonexistent/refs.bib");
        assert!(exported_by_zotero(
            path,
            "% Generated by Better BibTeX\n@article{a, title={x}}"
        ));
        assert!(!exported_by_zotero(path, "@article{a, title={x}}"));
    }

    #[test]
    fn entry_check_against_a_local_crossref() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(3) {
                let mut stream = stream.unwrap();
                let mut buffer = [0u8; 4096];
                let read = stream.read(&mut buffer).unwrap();
                let request = String::from_utf8_lossy(&buffer[..read]).to_string();
                let (status, body) = if request.starts_with("GET /works/10.5194%2Ftc-15-2281-2021")
                {
                    (
                        "200 OK",
                        r#"{"status":"ok","message":{"DOI":"10.5194/tc-15-2281-2021","type":"journal-article","title":["Wildfire soot darkens glaciers"],"author":[{"family":"Tremblay","given":"Julie"}],"issued":{"date-parts":[[2021]]},"container-title":["The Cryosphere"],"volume":"15","page":"2281-2297"}}"#,
                    )
                } else if request.starts_with("GET /works?") {
                    (
                        "200 OK",
                        r#"{"status":"ok","message":{"items":[{"DOI":"10.1017/jog.2019.54","title":["Black carbon deposition on Andean glaciers"],"author":[{"family":"Nguyen"}],"issued":{"date-parts":[[2019]]}}]}}"#,
                    )
                } else {
                    ("404 Not Found", "Resource not found.")
                };
                let _ = write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            }
        });
        // SAFETY: test à fil unique sur cette variable.
        unsafe { std::env::set_var("ATELIER_CROSSREF_BASE", format!("http://127.0.0.1:{port}")) };
        let text = "@article{tremblay2021,\n  author = {Tremblay, Julie},\n  title = {Wildfire soot darkens glaciers},\n  journal = {The Cryosphere},\n  year = {2020},\n  volume = {15},\n  doi = {10.5194/tc-15-2281-2021}\n}\n@article{nguyen2019, author={Nguyen, Anh}, title={Black carbon deposition on Andean glaciers}, year={2019}}\n@article{ghost, title={x}, doi={10.9999/nope}}\n";
        let entries = bib::parse_bib(text);
        let first = check_entry(text, &entries[0]);
        assert_eq!(first["status"], json!("diff"), "{first}");
        assert_eq!(
            first["summary"],
            json!("Année différente, pages manquantes")
        );
        assert!(
            first["proposed"]
                .as_str()
                .unwrap()
                .contains("year = {2021}")
        );
        let second = check_entry(text, &entries[1]);
        assert_eq!(second["status"], json!("candidate"), "{second}");
        assert_eq!(second["doi"], json!("10.1017/jog.2019.54"));
        let third = check_entry(text, &entries[2]);
        assert_eq!(third["status"], json!("notfound"), "{third}");
    }
}
