//! Panneau .docx : lecture du document et retouches (crate `atelier-docx`).
//!
//! Chaque retouche rouvre le fichier, vérifie qu'il n'a pas changé depuis la
//! version affichée, l'applique et enregistre à la place (écriture atomique,
//! sous verrou partagé avec l'agent). La réponse porte le modèle à jour :
//! le panneau se redessine d'après lui, jamais d'après une prédiction.

use atelier_core::{atomic_write, safe_project_path};
use atelier_docx::ops::{self, Op};
use atelier_docx::{Docx, Signature, format};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use crate::{AppState, request_allowed};

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

#[derive(Deserialize)]
pub struct PathQuery {
    path: String,
}

#[derive(Deserialize)]
pub struct OpBody {
    path: String,
    /// Révision affichée par le panneau ; absente = pas de contrôle.
    revision: Option<String>,
    author: String,
    #[serde(default = "yes")]
    tracked: bool,
    op: Op,
}

fn yes() -> bool {
    true
}

#[derive(Deserialize)]
pub struct UndoBody {
    path: String,
    revision: String,
    #[serde(default)]
    redo: bool,
}

/// Une étape annulable : la révision qu'elle a produite et le paquet d'avant.
struct Step {
    after: String,
    before: Vec<u8>,
}

#[derive(Default)]
struct History {
    undo: Vec<Step>,
    redo: Vec<Step>,
}

const HISTORY_STEPS: usize = 50;
const HISTORY_BYTES: usize = 160 * 1024 * 1024;

/// Annuler / rétablir, par document, en mémoire du serveur : une retouche
/// de Word ou de l'agent entre-temps rend la pile caduque (contrôle de
/// révision), elle ne réécrit jamais leur travail.
static HISTORIES: Mutex<Option<HashMap<PathBuf, History>>> = Mutex::new(None);

fn with_history<T>(path: &Path, f: impl FnOnce(&mut History) -> T) -> T {
    let mut guard = HISTORIES.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    f(map.entry(path.to_path_buf()).or_default())
}

fn trim(steps: &mut Vec<Step>) {
    while steps.len() > HISTORY_STEPS || (steps.len() > 1 && steps.iter().map(|s| s.before.len()).sum::<usize>() > HISTORY_BYTES) {
        steps.remove(0);
    }
}

fn docx_path(state: &AppState, rel: &str) -> Result<PathBuf, axum::response::Response> {
    let ok_ext = Path::new(rel).extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("docx"));
    if !ok_ext {
        return Err(json_error(StatusCode::BAD_REQUEST, "ce n'est pas un fichier .docx"));
    }
    let Ok(path) = safe_project_path(&state.root, rel) else {
        return Err(json_error(StatusCode::FORBIDDEN, "outside the project"));
    };
    if !path.is_file() {
        return Err(json_error(StatusCode::NOT_FOUND, "fichier introuvable"));
    }
    Ok(path)
}

/// Word pose `~$` + la fin du nom à côté d'un document ouvert : enregistrer
/// dans Word écraserait alors les retouches faites ici.
fn open_in_word(path: &Path) -> bool {
    let (Some(dir), Some(name)) = (path.parent(), path.file_name().and_then(|n| n.to_str())) else { return false };
    let tail: String = name.chars().skip(2).collect();
    let Ok(entries) = std::fs::read_dir(dir) else { return false };
    entries.flatten().any(|e| {
        let n = e.file_name();
        let n = n.to_string_lossy();
        n.starts_with("~$") && (n[2..] == *name || (!tail.is_empty() && n.ends_with(&tail)))
    })
}

fn mtime_ms(path: &Path) -> u64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

fn model_json(path: &Path) -> Result<Value, String> {
    let mut docx = Docx::open(path).map_err(|e| e.0)?;
    let model = docx.model().map_err(|e| e.0)?;
    let styles = format::styles(&mut docx).map_err(|e| e.0)?;
    let mut v = serde_json::to_value(model).map_err(|e| e.to_string())?;
    v["styles"] = json!(styles);
    v["mtime"] = json!(mtime_ms(path));
    v["openInWord"] = json!(open_in_word(path));
    Ok(v)
}

/// `GET /docx/model?path=` — paragraphes, suivis, commentaires, styles.
pub async fn model(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    match tokio::task::spawn_blocking(move || model_json(&path)).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err(e)) => json_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /docx/stat?path=` — ce que le panneau sonde pour voir arriver les
/// retouches de l'agent ou un enregistrement de Word.
pub async fn stat(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    match docx_path(&state, &q.path) {
        Ok(p) => (StatusCode::OK, Json(json!({"mtime": mtime_ms(&p), "openInWord": open_in_word(&p)}))).into_response(),
        Err(r) => r,
    }
}

/// `POST /docx/op` — une retouche ; rend le modèle à jour.
pub async fn op(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<OpBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let author = body.author.trim().chars().take(80).collect::<String>();
    if author.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "auteur manquant");
    }
    let sig = Signature::now(&author);
    let root = state.root.clone();
    let job = move || -> Result<Value, (StatusCode, String)> {
        let mut op = body.op;
        op.load_images(&mut |rel| read_figure(&root, rel)).map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.0))?;
        let (result, revision, before) = atelier_docx::edit_file_keep(&path, body.revision.as_deref(), |d| ops::apply(d, &op, body.tracked, &sig))
            .map_err(|e| (if e.is_conflict() { StatusCode::CONFLICT } else { StatusCode::UNPROCESSABLE_ENTITY }, e.0))?;
        if let Some(before) = before {
            with_history(&path, |h| {
                h.undo.push(Step { after: revision.clone(), before });
                trim(&mut h.undo);
                h.redo.clear();
            });
        }
        let model = model_json(&path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        Ok(json!({"ok": true, "result": result, "revision": revision, "model": model}))
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, e))) => json_error(status, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

const FIGURE_EXTS: [&str; 4] = ["png", "jpg", "jpeg", "gif"];
const FIGURE_MAX: u64 = 40 * 1024 * 1024;

fn is_figure(p: &Path) -> bool {
    p.extension().and_then(|e| e.to_str()).is_some_and(|e| FIGURE_EXTS.iter().any(|x| e.eq_ignore_ascii_case(x)))
}

/// Une figure du projet à insérer : chemin dans le projet, format d'image.
fn read_figure(root: &Path, rel: &str) -> atelier_docx::Result<Vec<u8>> {
    let bad = |m: &str| atelier_docx::DocxError(m.to_string());
    let path = safe_project_path(root, rel).map_err(|_| bad("figure hors du projet"))?;
    if !is_figure(&path) {
        return Err(bad("figure : PNG, JPEG ou GIF"));
    }
    let meta = std::fs::metadata(&path).map_err(|_| bad("figure introuvable"))?;
    if !meta.is_file() || meta.len() > FIGURE_MAX {
        return Err(bad("figure introuvable ou trop lourde"));
    }
    std::fs::read(&path).map_err(|e| bad(&format!("figure illisible : {e}")))
}

#[derive(Deserialize)]
pub struct MediaQuery {
    path: String,
    para: String,
    rel: String,
}

/// `GET /docx/media?path=&para=&rel=` — une image du document.
pub async fn media(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<MediaQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<Option<(Vec<u8>, &'static str)>, String> {
        let mut d = Docx::open(&path).map_err(|e| e.0)?;
        atelier_docx::objects::media(&mut d, &q.para, &q.rel).map_err(|e| e.0)
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(Some((bytes, mime)))) => {
            ([(axum::http::header::CONTENT_TYPE, mime), (axum::http::header::CACHE_CONTROL, "private, max-age=60")], bytes).into_response()
        }
        Ok(Ok(None)) => json_error(StatusCode::NOT_FOUND, "image introuvable"),
        Ok(Err(e)) => json_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /docx/figures` — images du projet à insérer (les plus récentes
/// d'abord), sans dossiers cachés ni dépendances.
pub async fn figures(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let root = state.root.clone();
    let job = move || {
        let mut out: Vec<(u64, String)> = Vec::new();
        let mut stack = vec![(root.clone(), 0usize)];
        let mut seen = 0usize;
        while let Some((dir, depth)) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for e in entries.flatten() {
                seen += 1;
                if seen > 50_000 {
                    break;
                }
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || matches!(name.as_str(), "node_modules" | "target" | "__pycache__" | "venv") {
                    continue;
                }
                let p = e.path();
                let Ok(ft) = e.file_type() else { continue };
                if ft.is_dir() && depth < 8 {
                    stack.push((p, depth + 1));
                } else if ft.is_file() && is_figure(&p)
                    && let Ok(rel) = p.strip_prefix(&root)
                {
                    out.push((mtime_ms(&p), rel.to_string_lossy().replace('\\', "/")));
                }
            }
        }
        out.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        out.truncate(400);
        out.into_iter().map(|(m, p)| json!({"path": p, "mtime": m})).collect::<Vec<_>>()
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(v) => (StatusCode::OK, Json(json!({"figures": v}))).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct PrefsBody {
    author: Option<String>,
    page: Option<String>,
}

fn prefs_path(root: &Path) -> PathBuf {
    root.join(".fig_thumbs").join("docx_prefs.json")
}

/// Nom complet de l'utilisateur du Mac (celui que Word propose par défaut).
fn system_user_name() -> String {
    let full = std::process::Command::new("id")
        .arg("-F")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
    full.or_else(|| std::env::var("USER").ok()).unwrap_or_else(|| "Moi".into())
}

/// `GET /docx/prefs` — signature des retouches et couleur de la page,
/// gardées côté serveur (le localStorage du WebView ne survit pas à la relance).
pub async fn get_prefs(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let stored: Value = std::fs::read(prefs_path(&state.root)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_else(|| json!({}));
    let fallback = tokio::task::spawn_blocking(system_user_name).await.unwrap_or_else(|_| "Moi".into());
    (StatusCode::OK, Json(json!({
        "author": stored.get("author").and_then(Value::as_str),
        "page": stored.get("page").and_then(Value::as_str).unwrap_or("blanche"),
        "systemAuthor": fallback,
    })))
        .into_response()
}

/// `POST /docx/prefs` — `{author?, page?: "blanche" | "theme"}`.
pub async fn post_prefs(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<PrefsBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = prefs_path(&state.root);
    let mut stored: Value = std::fs::read(&path).ok().and_then(|b| serde_json::from_slice(&b).ok()).filter(Value::is_object).unwrap_or_else(|| json!({}));
    if let Some(a) = body.author.map(|a| a.trim().chars().take(80).collect::<String>()).filter(|a| !a.is_empty()) {
        stored["author"] = json!(a);
    }
    if let Some(p) = body.page.filter(|p| p == "blanche" || p == "theme") {
        stored["page"] = json!(p);
    }
    match atomic_write(&path, stored.to_string().as_bytes()) {
        Ok(()) => (StatusCode::OK, Json(stored)).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /docx/undo` — annule (ou rétablit, `redo`) la dernière retouche
/// faite depuis le panneau, si le document n'a pas bougé depuis.
pub async fn undo(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<UndoBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<Value, (StatusCode, String)> {
        let step = with_history(&path, |h| if body.redo { h.redo.pop() } else { h.undo.pop() });
        let Some(step) = step else {
            return Err((StatusCode::CONFLICT, if body.redo { "rien à rétablir".into() } else { "rien à annuler".into() }));
        };
        if step.after != body.revision {
            // Le document a changé (Word, l'agent) : la pile ne vaut plus.
            with_history(&path, |h| *h = History::default());
            return Err((StatusCode::CONFLICT, "le document a changé depuis : plus rien à annuler ici".into()));
        }
        let replaced = atelier_docx::replace_file(&path, &step.after, &step.before).map_err(|e| {
            with_history(&path, |h| *h = History::default());
            (StatusCode::CONFLICT, e.0)
        })?;
        let revision = atelier_docx::revision_of(&step.before);
        with_history(&path, |h| {
            let other = if body.redo { &mut h.undo } else { &mut h.redo };
            other.push(Step { after: revision.clone(), before: replaced });
            trim(other);
        });
        let model = model_json(&path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        Ok(json!({"ok": true, "revision": revision, "model": model}))
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, e))) => json_error(status, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// Nom de fichier sûr pour un nouveau document : sans séparateur ni
/// caractère de contrôle, sans point initial, `.docx` ajouté.
fn clean_name(raw: &str) -> Option<String> {
    let mut base = raw.trim();
    if base.len() >= 5 && base.is_char_boundary(base.len() - 5) && base[base.len() - 5..].eq_ignore_ascii_case(".docx") {
        base = base[..base.len() - 5].trim_end();
    }
    let name: String = base
        .chars()
        .map(|c| if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '-' } else { c })
        .take(120)
        .collect();
    let name = name.trim().trim_start_matches('.').trim().to_string();
    (!name.is_empty() && !name.starts_with("~$")).then_some(name)
}

/// Crée `nom.docx`, ou `nom 2.docx`… si le nom est pris : jamais d'écrasement.
fn create_unique(dir: &Path, name: &str, bytes: &[u8]) -> std::io::Result<PathBuf> {
    use std::io::Write;
    for n in 1..100 {
        let file = if n == 1 { format!("{name}.docx") } else { format!("{name} {n}.docx") };
        let path = dir.join(file);
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut f) => {
                f.write_all(bytes)?;
                f.sync_all()?;
                return Ok(path);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "trop de documents portent déjà ce nom"))
}

#[derive(Deserialize)]
pub struct NewBody {
    name: String,
    /// Dossier du projet ; `documents` par défaut.
    dir: Option<String>,
    /// `blank`, `article` ou `copy` (avec `from`).
    template: String,
    from: Option<String>,
}

/// `POST /docx/new` — nouveau document dans le projet ; rend son chemin.
pub async fn create(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<NewBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Some(name) = clean_name(&body.name) else {
        return json_error(StatusCode::BAD_REQUEST, "donne un nom au document");
    };
    let rel_dir = body.dir.as_deref().map(str::trim).filter(|d| !d.is_empty()).unwrap_or("documents").to_string();
    let Ok(dir) = safe_project_path(&state.root, &rel_dir) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let from = match (body.template.as_str(), &body.from) {
        ("copy", Some(f)) => match docx_path(&state, f) {
            Ok(p) => Some(p),
            Err(r) => return r,
        },
        ("copy", None) => return json_error(StatusCode::BAD_REQUEST, "choisis le document à copier"),
        ("blank" | "article", _) => None,
        _ => return json_error(StatusCode::BAD_REQUEST, "modèle inconnu"),
    };
    let root = state.root.clone();
    let template = body.template.clone();
    let job = move || -> Result<Value, (StatusCode, String)> {
        let src = from.as_deref().map(std::fs::read).transpose().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let t = match (template.as_str(), &src) {
            ("article", _) => atelier_docx::new::Template::Article,
            (_, Some(bytes)) => atelier_docx::new::Template::Copy(bytes),
            _ => atelier_docx::new::Template::Blank,
        };
        let bytes = atelier_docx::new::create(t).map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.0))?;
        std::fs::create_dir_all(&dir).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        // Le dossier créé doit rester dans le projet (lien symbolique compris).
        let real = std::fs::canonicalize(&dir).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        let real_root = std::fs::canonicalize(&root).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if !real.starts_with(&real_root) {
            return Err((StatusCode::FORBIDDEN, "outside the project".into()));
        }
        let path = create_unique(&real, &name, &bytes).map_err(|e| (StatusCode::CONFLICT, e.to_string()))?;
        let rel = path.strip_prefix(&real_root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        Ok(json!({"path": rel, "abs": path.to_string_lossy()}))
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, e))) => json_error(status, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// Nombre de suivis d'un .docx, compté vite sur le XML brut.
fn tracked_count(path: &Path) -> usize {
    let Ok(file) = std::fs::File::open(path) else { return 0 };
    let Ok(mut zip) = zip::ZipArchive::new(file) else { return 0 };
    let Ok(mut doc) = zip.by_name(atelier_docx::DOCUMENT) else { return 0 };
    if doc.size() > 64 * 1024 * 1024 {
        return 0;
    }
    let mut xml = String::new();
    if std::io::Read::read_to_string(&mut doc, &mut xml).is_err() {
        return 0;
    }
    ["<w:ins ", "<w:del ", "<w:moveFrom ", "<w:moveTo "].iter().map(|t| xml.matches(t).count()).sum()
}

/// `GET /docx/list` — les .docx du projet, du plus récent au plus ancien.
pub async fn list(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let root = state.root.clone();
    let job = move || {
        let mut out: Vec<(u64, PathBuf)> = Vec::new();
        let mut stack = vec![(root.clone(), 0usize)];
        let mut seen = 0usize;
        while let Some((dir, depth)) = stack.pop() {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for e in entries.flatten() {
                seen += 1;
                if seen > 50_000 {
                    break;
                }
                let name = e.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || name.starts_with("~$") || matches!(name.as_str(), "node_modules" | "target" | "__pycache__" | "venv") {
                    continue;
                }
                let p = e.path();
                let Ok(ft) = e.file_type() else { continue };
                if ft.is_dir() && depth < 8 {
                    stack.push((p, depth + 1));
                } else if ft.is_file() && p.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("docx")) {
                    out.push((mtime_ms(&p), p));
                }
            }
        }
        out.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        out.truncate(300);
        out.into_iter()
            .map(|(m, p)| {
                let rel = p.strip_prefix(&root).unwrap_or(&p).to_string_lossy().replace('\\', "/");
                json!({"path": rel, "mtime": m, "changes": tracked_count(&p), "openInWord": open_in_word(&p)})
            })
            .collect::<Vec<_>>()
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(v) => (StatusCode::OK, Json(json!({"documents": v}))).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn le_fichier_de_verrou_de_word_est_reconnu() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("Chapitre 2 corrigé CK.docx");
        std::fs::write(&doc, b"x").unwrap();
        assert!(!open_in_word(&doc));
        // Word garde la fin du nom pour les noms longs.
        std::fs::write(dir.path().join("~$apitre 2 corrigé CK.docx"), b"x").unwrap();
        assert!(open_in_word(&doc));
    }

    #[test]
    fn noms_de_nouveaux_documents() {
        assert_eq!(clean_name(" Chapitre 3 — Bilan.docx ").as_deref(), Some("Chapitre 3 — Bilan"));
        assert_eq!(clean_name("../../etc/passwd").as_deref(), Some("-..-etc-passwd"));
        assert_eq!(clean_name(".docx"), None);
        assert_eq!(clean_name("   "), None);
        let dir = tempfile::tempdir().unwrap();
        let a = create_unique(dir.path(), "Brouillon", b"x").unwrap();
        let b = create_unique(dir.path(), "Brouillon", b"y").unwrap();
        assert!(a.ends_with("Brouillon.docx") && b.ends_with("Brouillon 2.docx"));
        assert_eq!(std::fs::read(&a).unwrap(), b"x");
    }
}
