//! Panneau .docx : lecture du document et retouches (crate `atelier-docx`).
//!
//! Séance en mémoire (`atelier_docx::session`) : une retouche qui demande
//! `delta: true` (le panneau) s'applique au document gardé ouvert, se note
//! dans le journal de la séance et rend seulement ce qui change ; le fichier
//! est réécrit par un fil de fond (inactivité, attente maximale) ou sur
//! `POST /docx/flush`, et avant toute lecture par un autre client. Sans
//! `delta` (agent, tests, anciens panneaux), comportement d'origine ci-dessous,
//! après avoir vidé la séance. `ATELIER_DOCX_SESSION=0` coupe les séances.
//!
//! Chaque retouche rouvre le fichier, vérifie qu'il n'a pas changé depuis la
//! version affichée et que Word ne l'a pas ouvert, l'applique, contrôle le
//! paquet produit et enregistre à la place (écriture atomique, sous verrou
//! partagé avec l'agent, historique sur disque). La réponse porte le modèle à jour :
//! le panneau se redessine d'après lui, jamais d'après une prédiction.

use atelier_core::{atomic_write, safe_project_path};
use atelier_docx::ops::{self, Op};
use atelier_docx::history::{self, Origin};
use atelier_docx::{Docx, Signature, format};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use atelier_docx::session::Session;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex, Once};
use std::time::{Duration, Instant, UNIX_EPOCH};

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
    op: Value,
    /// Réponse en delta (séance en mémoire) plutôt qu'avec tout le modèle.
    #[serde(default)]
    delta: bool,
}

// ------------------------------------------------------------ séances

type Shared = Arc<Mutex<Session>>;

/// Séances ouvertes, par chemin canonique du document.
static SESSIONS: LazyLock<Mutex<HashMap<PathBuf, Shared>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
/// Une séance sans appel depuis tout ce temps (panneau fermé) est refermée.
const SESSION_IDLE: Duration = Duration::from_secs(30 * 60);

fn sessions_enabled() -> bool {
    std::env::var("ATELIER_DOCX_SESSION").map(|v| v != "0").unwrap_or(true)
}

fn lock_session(s: &Shared) -> std::sync::MutexGuard<'_, Session> {
    s.lock().unwrap_or_else(|e| e.into_inner())
}

fn key(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// La séance ouverte sur ce document, s'il y en a une.
fn existing(path: &Path) -> Option<Shared> {
    SESSIONS.lock().unwrap_or_else(|e| e.into_inner()).get(&key(path)).cloned()
}

/// La séance du document, ouverte au besoin (journal d'une séance
/// interrompue rejoué d'abord).
fn session_for(path: &Path) -> Result<Shared, atelier_docx::DocxError> {
    start_flusher();
    if let Some(s) = existing(path) {
        return Ok(s);
    }
    let opened = Arc::new(Mutex::new(Session::open(path)?));
    let mut map = SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
    Ok(map.entry(key(path)).or_insert(opened).clone())
}

/// Écrit tout de suite les retouches en attente de la séance du document
/// (avant qu'un autre ne le lise ou ne l'écrive).
fn flush_session(path: &Path) {
    if let Some(s) = existing(path)
        && let Err(e) = lock_session(&s).flush()
    {
        eprintln!("[docx] séance de {} non écrite : {e}", path.display());
    }
}

/// Fil de fond : écrit les séances arrivées à échéance, referme celles
/// qu'aucun panneau n'utilise plus. Au premier passage, rejoue les séances
/// interrompues (arrêt brutal) de tous les documents.
fn start_flusher() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        std::thread::Builder::new()
            .name("docx-seances".into())
            .spawn(|| {
                atelier_docx::session::recover_all();
                loop {
                    std::thread::sleep(Duration::from_millis(250));
                    let all: Vec<(PathBuf, Shared)> = SESSIONS.lock().unwrap_or_else(|e| e.into_inner()).iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                    let now = Instant::now();
                    for (k, s) in all {
                        let Ok(mut g) = s.try_lock() else { continue };
                        if g.due(now)
                            && let Err(e) = g.flush()
                        {
                            eprintln!("[docx] séance de {} non écrite : {e}", k.display());
                        }
                        if g.pending() == 0 && g.idle_for(now) > SESSION_IDLE {
                            drop(g);
                            // Sous le verrou de la table : refermée seulement si
                            // aucune requête n'en tient une copie (sinon son
                            // geste partirait dans une séance hors table).
                            let mut map = SESSIONS.lock().unwrap_or_else(|e| e.into_inner());
                            if Arc::strong_count(&s) <= 2 {
                                map.remove(&k);
                            }
                        }
                    }
                }
            })
            .ok();
    });
}

/// Au démarrage du serveur : séances interrompues rejouées, fil de fond prêt.
pub fn start() {
    if sessions_enabled() {
        start_flusher();
    }
}

/// Une révision de séance (montrée au panneau) traduite en révision du
/// fichier, une fois la séance écrite : pour les appels sans séance.
fn disk_revision(path: &Path, revision: Option<String>) -> Option<String> {
    let rev = revision?;
    let Some(s) = existing(path) else { return Some(rev) };
    let mut g = lock_session(&s);
    if g.revision() != rev {
        return Some(rev);
    }
    if let Err(e) = g.flush() {
        eprintln!("[docx] séance de {} non écrite : {e}", path.display());
    }
    // Relu AVANT de comparer : un fichier écrit par un autre (l'agent)
    // depuis le dernier sondage change la révision de la séance, et la
    // révision du panneau, périmée, est alors refusée (409).
    let _ = g.sync();
    if g.revision() != rev || g.pending() > 0 {
        return Some(rev);
    }
    Some(std::fs::read(path).map(|b| atelier_docx::revision_of(&b)).unwrap_or(rev))
}

/// Modèle complet servi depuis la séance (révision de la séance).
fn session_model_json(g: &mut Session) -> Result<Value, String> {
    let agent = atelier_docx::marks::list(g.path(), g.model()).unwrap_or_default();
    let unread = atelier_docx::unread::list(g.path(), g.model()).unwrap_or_default();
    let mut v = serde_json::to_value(g.model()).map_err(|e| e.to_string())?;
    // Suivis signés du nom de l'utilisateur mais proposés par l'agent.
    v["agentChanges"] = json!(agent);
    // Fils que l'agent a touchés et que l'utilisateur n'a pas ouverts.
    v["unreadComments"] = json!(unread);
    v["styles"] = g.styles().clone();
    v["mtime"] = json!(mtime_ms(g.path()));
    v["openInWord"] = json!(atelier_docx::open_in_word(g.path()));
    Ok(v)
}

fn yes() -> bool {
    true
}

#[derive(Deserialize)]
pub struct VersionBody {
    path: String,
    /// `new` : nouvelle version (`nom_v2.docx`) ; `received` : la dernière
    /// version reçue, rouverte comme copie (`nom_recu.docx`).
    kind: String,
}

#[derive(Deserialize)]
pub struct UndoBody {
    path: String,
    revision: String,
    #[serde(default)]
    redo: bool,
    #[serde(default)]
    delta: bool,
}

/// Code HTTP d'un refus du moteur : conflit de révision ou séance relue
/// (409), Word a le fichier ouvert (423), sinon retouche impossible (422).
fn refusal(e: &atelier_docx::DocxError) -> StatusCode {
    if e.is_conflict() || e.is_reset() {
        StatusCode::CONFLICT
    } else if e.is_open_in_word() {
        StatusCode::LOCKED
    } else {
        StatusCode::UNPROCESSABLE_ENTITY
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
    model_value(&mut docx, model, path)
}

/// Le modèle pour le panneau : celui du moteur, avec les styles proposés,
/// la date du fichier, l'état de Word et les suivis venus de l'agent.
fn model_value(docx: &mut Docx, model: atelier_docx::DocModel, path: &Path) -> Result<Value, String> {
    let styles = format::styles(docx).map_err(|e| e.0)?;
    let agent = atelier_docx::marks::list(path, &model).unwrap_or_default();
    let unread = atelier_docx::unread::list(path, &model).unwrap_or_default();
    let mut v = serde_json::to_value(model).map_err(|e| e.to_string())?;
    v["agentChanges"] = json!(agent);
    v["unreadComments"] = json!(unread);
    v["styles"] = json!(styles);
    v["mtime"] = json!(mtime_ms(path));
    v["openInWord"] = json!(atelier_docx::open_in_word(path));
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
    let job = move || match existing(&path) {
        // Une séance ouverte : écrite d'abord (un autre client lit peut-être
        // le fichier), puis servie depuis la mémoire.
        Some(s) => {
            let mut g = lock_session(&s);
            g.flush().map_err(|e| e.0)?;
            g.sync().map_err(|e| e.0)?;
            session_model_json(&mut g)
        }
        None => model_json(&path),
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err(e)) => json_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /docx/peek?path=` — la première page seulement (format, marges,
/// paragraphes allégés), pour la vignette de la galerie. Lecture seule :
/// une séance ouverte sert ses paragraphes en mémoire, sans rien écrire.
pub async fn peek(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<Value, String> {
        let preview = match existing(&path) {
            Some(s) => atelier_docx::preview::first_page(lock_session(&s).model()),
            None => atelier_docx::preview::first_page(&Docx::open(&path).and_then(|mut d| d.model()).map_err(|e| e.0)?),
        };
        serde_json::to_value(preview).map_err(|e| e.to_string())
    };
    match tokio::task::spawn_blocking(job).await {
        // La galerie demande `&v=<mtime>` : une réponse vaut tant que le fichier ne change pas.
        Ok(Ok(v)) => ([(axum::http::header::CACHE_CONTROL, "private, max-age=86400")], Json(v)).into_response(),
        Ok(Err(e)) => json_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct FlushBody {
    path: String,
}

/// `POST /docx/flush` — `{path}` : écrit tout de suite les retouches en
/// attente de la séance (le panneau l'appelle en se cachant ou en se fermant).
pub async fn flush(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<FlushBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<Value, (StatusCode, String)> {
        let Some(s) = existing(&path) else { return Ok(json!({"ok": true, "pending": 0})) };
        let mut g = lock_session(&s);
        g.flush().map_err(|e| (refusal(&e), e.0))?;
        Ok(json!({"ok": true, "revision": g.revision(), "pending": g.pending()}))
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, e))) => json_error(status, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct SeenBody {
    path: String,
    comment: u32,
}

/// `POST /docx/seen` — `{path, comment}` : l'utilisateur a ouvert la carte ;
/// le fil n'est plus « non lu » (rien n'est écrit dans le .docx).
pub async fn seen(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<SeenBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<bool, String> {
        // Les numéros du panneau sont ceux de sa séance quand il y en a une.
        match existing(&path) {
            Some(s) => {
                let g = lock_session(&s);
                atelier_docx::unread::seen(&path, g.model(), body.comment).map_err(|e| e.0)
            }
            None => {
                let model = Docx::open(&path).and_then(|mut d| d.model()).map_err(|e| e.0)?;
                atelier_docx::unread::seen(&path, &model, body.comment).map_err(|e| e.0)
            }
        }
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(had)) => (StatusCode::OK, Json(json!({"ok": true, "had": had}))).into_response(),
        Ok(Err(e)) => json_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// Commande qui ouvre `path` dans Microsoft Word : `open -b com.microsoft.Word`
/// (par identifiant, quel que soit le nom de l'app ou son dossier).
/// `ATELIER_WORD_OPENER` la remplace par un programme qui reçoit le chemin
/// (tests du serveur, machines sans Word).
fn word_command(path: &Path) -> tokio::process::Command {
    match std::env::var_os("ATELIER_WORD_OPENER").filter(|v| !v.is_empty()) {
        Some(program) => {
            let mut cmd = tokio::process::Command::new(program);
            cmd.arg(path);
            cmd
        }
        None => {
            let mut cmd = tokio::process::Command::new("open");
            cmd.args(["-b", "com.microsoft.Word"]).arg(path);
            cmd
        }
    }
}

/// `open` qui ne trouve pas l'app : « Unable to find application… ».
fn word_missing(stderr: &str) -> bool {
    stderr.contains("Unable to find application") || stderr.contains("LSCopyApplicationURLsForBundleIdentifier")
}

/// Dossier des copies de lecture passées à Word (une par clic : Word garde
/// ouverte la précédente, il ne doit pas la confondre avec la nouvelle).
fn word_copies_dir() -> PathBuf {
    std::env::temp_dir().join("atelier-word")
}

/// Copie de lecture de `path` pour Word : `Nom (copie de lecture).docx`,
/// en lecture seule (Word refuse de l'enregistrer par mégarde). Les copies
/// de plus d'un jour sont effacées au passage.
fn reading_copy(path: &Path) -> std::io::Result<PathBuf> {
    let root = word_copies_dir();
    if let Ok(entries) = std::fs::read_dir(&root) {
        for e in entries.flatten() {
            let old = e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok());
            if old.is_some_and(|d| d > Duration::from_secs(24 * 3600)) {
                let _ = remove_tree(&e.path());
            }
        }
    }
    let stamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    let dir = root.join(format!("{stamp}"));
    std::fs::create_dir_all(&dir)?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
    let copy = dir.join(format!("{stem} (copie de lecture).docx"));
    std::fs::copy(path, &copy)?;
    let mut perm = std::fs::metadata(&copy)?.permissions();
    perm.set_readonly(true);
    std::fs::set_permissions(&copy, perm)?;
    Ok(copy)
}

/// Efface un dossier de copies, fichiers en lecture seule compris.
fn remove_tree(dir: &Path) -> std::io::Result<()> {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            if let Ok(meta) = e.metadata() {
                let mut perm = meta.permissions();
                #[allow(clippy::permissions_set_readonly_false)]
                perm.set_readonly(false);
                let _ = std::fs::set_permissions(e.path(), perm);
            }
        }
    }
    std::fs::remove_dir_all(dir)
}

/// `POST /docx/open-word` — `{path}` : écrit d'abord les retouches en attente
/// de la séance, puis ouvre dans Microsoft Word une COPIE DE LECTURE du
/// fichier (pour voir le rendu de Word : commentaires, suivis, mise en page).
/// Le fichier d'origine n'est jamais ouvert dans Word : Atelier reste seul à
/// l'écrire et le panneau reste modifiable.
pub async fn open_word(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<FlushBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let p = path.clone();
    let prepare = move || -> Result<PathBuf, (StatusCode, String)> {
        if let Some(s) = existing(&p) {
            lock_session(&s).flush().map_err(|e| (refusal(&e), format!("retouches pas encore enregistrées : {}", e.0)))?;
        }
        // Les écritures du .docx sont atomiques (fichier à côté puis
        // renommage) : la copie lit l'ancien fichier ou le nouveau, entier.
        reading_copy(&p).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("copie impossible : {e}")))
    };
    let copy = match tokio::task::spawn_blocking(prepare).await {
        Ok(Ok(c)) => c,
        Ok(Err((status, e))) => return json_error(status, e),
        Err(e) => return json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    };
    let mut cmd = word_command(&copy);
    cmd.kill_on_drop(true);
    match tokio::time::timeout(Duration::from_secs(15), cmd.output()).await {
        Ok(Ok(out)) if out.status.success() => (StatusCode::OK, Json(json!({"ok": true, "copy": copy}))).into_response(),
        Ok(Ok(out)) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            if word_missing(&stderr) {
                json_error(StatusCode::NOT_FOUND, "Microsoft Word n'est pas installé sur ce Mac")
            } else {
                json_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Word n'a pas pu ouvrir la copie : {}", stderr.trim()))
            }
        }
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, format!("Word n'a pas pu ouvrir la copie : {e}")),
        Err(_) => json_error(StatusCode::GATEWAY_TIMEOUT, "Word met trop de temps à s'ouvrir"),
    }
}

/// `GET /docx/stat?path=` — ce que le panneau sonde pour voir arriver les
/// retouches de l'agent ou un enregistrement de Word, et les brouillons de
/// réponse que l'agent pose dans la carte d'un commentaire (hors du fichier).
pub async fn stat(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let p = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || {
        let drafts = atelier_docx::drafts::list(&p).unwrap_or_default();
        let checks = atelier_docx::drafts::checks(&p).unwrap_or_default();
        let mut v = json!({"mtime": mtime_ms(&p), "openInWord": atelier_docx::open_in_word(&p), "drafts": drafts, "checks": checks});
        // Séance ouverte : sa révision (le fichier change à chaque écriture
        // coalescée sans que le document montré change) ; un fichier changé
        // par un autre est relu ici, et la révision change.
        if let Some(s) = existing(&p) {
            let mut g = lock_session(&s);
            let _ = g.sync();
            v["revision"] = json!(g.revision());
            v["pending"] = json!(g.pending());
        }
        v
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(v) => (StatusCode::OK, Json(v)).into_response(),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct DraftBody {
    path: String,
    comment: u32,
}

/// `POST /docx/draft/clear` — `{path, comment}` : le brouillon de l'agent a
/// été envoyé (sous le nom de l'utilisateur) ou écarté.
pub async fn clear_draft(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<DraftBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    match tokio::task::spawn_blocking(move || atelier_docx::drafts::clear(&path, body.comment)).await {
        Ok(Ok(had)) => (StatusCode::OK, Json(json!({"ok": true, "cleared": had}))).into_response(),
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.0),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
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
        // Les figures se lisent dans le projet : chemin d'origine.
        let images = body.op.to_string().contains("\"insert_image\"");
        if body.delta && sessions_enabled() && !images {
            let s = session_for(&path).map_err(|e| (refusal(&e), e.0))?;
            let mut g = lock_session(&s);
            let a = g.apply(body.revision.as_deref(), &body.op, body.tracked, &sig).map_err(|e| (refusal(&e), e.0))?;
            let mut delta = a.delta;
            delta["mtime"] = json!(mtime_ms(&path));
            delta["openInWord"] = json!(false);
            return Ok(json!({"ok": true, "result": a.result, "revision": a.revision, "delta": delta}));
        }
        let revision = disk_revision(&path, body.revision.clone());
        let mut op: Op = serde_json::from_value(body.op.clone()).map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, format!("retouche illisible : {e}")))?;
        op.load_images(&mut |rel| read_figure(&root, rel)).map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.0))?;
        let origin = Origin { source: "panneau", author: &sig.author, label: op.label() };
        // Le modèle rendu est celui que le contrôle de l'écriture vient de
        // construire : le fichier n'est pas rouvert.
        let (result, revision, mut docx, model) = atelier_docx::edit_file_model(&path, revision.as_deref(), &origin, |d| ops::apply(d, &op, body.tracked, &sig))
            .map_err(|e| (refusal(&e), e.0))?;
        let model = model_value(&mut docx, model, &path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        // La séance ouverte relira le fichier à son prochain appel.
        Ok(json!({"ok": true, "result": result, "revision": revision, "model": model}))
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, e))) => json_error(status, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /docx/triage?path=` — suivis rangés par nature pour la revue : fond,
/// nombres et renvois, ponctuation et orthographe, espaces et mise en forme
/// (règles déterministes du moteur, `atelier_docx::triage`).
pub async fn triage(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<Value, String> {
        // Séance ouverte : ses retouches en attente d'abord sur le disque.
        flush_session(&path);
        let mut docx = Docx::open(&path).map_err(|e| e.0)?;
        let model = docx.model().map_err(|e| e.0)?;
        serde_json::to_value(atelier_docx::triage::triage(&model)).map_err(|e| e.to_string())
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err(e)) => json_error(StatusCode::UNPROCESSABLE_ENTITY, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

#[derive(Deserialize)]
pub struct DecideSetBody {
    path: String,
    /// Révision affichée par le panneau ; absente = pas de contrôle.
    revision: Option<String>,
    ids: Vec<u32>,
    /// `accept` ou `reject`.
    decision: String,
    #[serde(default)]
    author: String,
}

/// `POST /docx/decide-set` — `{path, revision, ids, decision}` : accepte ou
/// refuse un ensemble de suivis d'un seul geste (« Accepter les mineurs ») ;
/// même verrou, même contrôle et même historique que `/docx/op`, une seule
/// annulation. Rend le modèle à jour.
pub async fn decide_set(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<DecideSetBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let (decision, label) = match body.decision.as_str() {
        "accept" => (atelier_docx::review::Decision::Accept, "accepter un ensemble"),
        "reject" => (atelier_docx::review::Decision::Reject, "refuser un ensemble"),
        _ => return json_error(StatusCode::BAD_REQUEST, "décision : accept ou reject"),
    };
    if body.ids.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "aucun suivi à décider");
    }
    let author = body.author.trim().chars().take(80).collect::<String>();
    let job = move || -> Result<Value, (StatusCode, String)> {
        let origin = Origin { source: "panneau", author: &author, label };
        // Séance ouverte : écrite d'abord ; elle relira le fichier à son
        // prochain appel, comme après une retouche sans delta.
        flush_session(&path);
        let revision = disk_revision(&path, body.revision.clone());
        let (result, revision, mut docx, model) = atelier_docx::edit_file_model(&path, revision.as_deref(), &origin, |d| atelier_docx::review::decide_set(d, &body.ids, decision))
            .map_err(|e| (refusal(&e), e.0))?;
        let model = model_value(&mut docx, model, &path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
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
    /// Recadrage de Word, « l,t,r,b » en fractions (champ `crop` du modèle).
    #[serde(default)]
    crop: Option<String>,
    /// Taille du cadre en px (« l×h ») : un graphique d'Excel s'y dessine.
    #[serde(default)]
    size: Option<String>,
}

/// `GET /docx/media?path=&para=&rel=[&crop=l,t,r,b][&size=LxH]` — une image du document.
pub async fn media(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<MediaQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let crop = q.crop.as_deref().and_then(|c| {
        let v: Vec<f64> = c.split(',').filter_map(|x| x.trim().parse().ok()).collect();
        <[f64; 4]>::try_from(v).ok()
    });
    let size = q.size.as_deref().and_then(|s| {
        let (w, h) = s.split_once(['x', 'X', ','])?;
        let (w, h) = (w.trim().parse::<f64>().ok()?, h.trim().parse::<f64>().ok()?);
        (w.is_finite() && h.is_finite() && (16.0..=4000.0).contains(&w) && (16.0..=4000.0).contains(&h)).then_some((w, h))
    });
    let job = move || -> Result<Option<(Vec<u8>, &'static str)>, String> {
        // Les paragraphes de la séance (pas encore écrits) font foi.
        let read = |d: &mut Docx| -> Result<_, String> {
            let raw = atelier_docx::objects::media_raw(d, &q.para, &q.rel).map_err(|e| e.0)?;
            let theme = match &raw {
                Some((_, m)) if *m == atelier_docx::chart::MIME => atelier_docx::objects::theme(d).map_err(|e| e.0)?,
                _ => None,
            };
            Ok((raw, theme))
        };
        let (raw, theme) = if let Some(s) = existing(&path) {
            let mut g = lock_session(&s);
            read(g.docx_mut())?
        } else {
            read(&mut Docx::open(&path).map_err(|e| e.0)?)?
        };
        // Graphiques, EMF/WMF → SVG et recadrage hors du verrou : la frappe n'attend pas l'image.
        Ok(raw.map(|r| atelier_docx::objects::render(r, theme.as_deref(), size)).map(|img| match crop {
            Some(c) => atelier_docx::objects::cropped(img, c),
            None => img,
        }))
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
/// d'Atelier (panneau ou agent), si le document n'a pas bougé depuis.
/// L'historique est sur disque : il survit à la relance.
pub async fn undo(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<UndoBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<Value, (StatusCode, String)> {
        let status_of = |e: &atelier_docx::DocxError| if e.is_open_in_word() { StatusCode::LOCKED } else { StatusCode::CONFLICT };
        if let Some(s) = existing(&path) {
            // Séance ouverte : chaque retouche est un pas de l'historique une
            // fois écrite ; on écrit, on annule sur le disque, la séance relit.
            let mut g = lock_session(&s);
            g.flush().map_err(|e| (status_of(&e), e.0))?;
            if let Some(e) = g.take_error() {
                return Err((StatusCode::CONFLICT, e));
            }
            // Relu avant de comparer : sinon ⌘Z annulerait une retouche de
            // l'agent que le panneau n'a pas encore vue.
            let _ = g.sync();
            if g.revision() != body.revision || g.pending() > 0 {
                return Err((StatusCode::CONFLICT, "conflit : le document a changé depuis ; recharger puis refaire".into()));
            }
            let disk = std::fs::read(&path).map(|b| atelier_docx::revision_of(&b)).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let old = (g.model().clone(), g.styles().clone(), g.revision().to_string());
            let done = history::undo(&path, &disk, body.redo).map_err(|e| (status_of(&e), e.0))?;
            g.sync().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.0))?;
            let mut out = json!({"ok": true, "revision": g.revision(), "label": done.label});
            if body.delta {
                let mut d = atelier_docx::session::delta(&old.0, g.model(), &old.1, g.styles(), &old.2);
                d["mtime"] = json!(mtime_ms(&path));
                d["openInWord"] = json!(atelier_docx::open_in_word(&path));
                out["delta"] = d;
            } else {
                out["model"] = session_model_json(&mut g).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
            }
            return Ok(out);
        }
        let done = history::undo(&path, &body.revision, body.redo).map_err(|e| (status_of(&e), e.0))?;
        let model = model_json(&path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
        Ok(json!({"ok": true, "revision": done.revision, "label": done.label, "model": model}))
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, e))) => json_error(status, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `GET /docx/history?path=` — versions reçues gardées (l'original, puis
/// chaque nouveau tour), dossier de l'historique, et ce qu'Annuler ferait.
pub async fn history_status(State(state): State<AppState>, headers: HeaderMap, Query(q): Query<PathQuery>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &q.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || -> Result<Value, String> {
        flush_session(&path);
        let rev = atelier_docx::revision_of(&std::fs::read(&path).map_err(|e| e.to_string())?);
        let mut v = serde_json::to_value(history::status(&path, &rev)).map_err(|e| e.to_string())?;
        v["revision"] = json!(rev);
        v["received"] = match atelier_docx::versions::received(&path) {
            Some((revision, at)) => json!({"revision": revision, "at": at}),
            None => Value::Null,
        };
        v["nextVersion"] = json!(atelier_docx::versions::next_version_name(&path));
        Ok(v)
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err(e)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e),
        Err(e) => json_error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
    }
}

/// `POST /docx/version` — copie à côté du document, sans rien écraser :
/// nouvelle version (`nom_v2.docx`…) ou dernière version reçue
/// (`nom_recu.docx`). Rend le chemin de la copie, à ouvrir.
pub async fn version(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<VersionBody>) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let path = match docx_path(&state, &body.path) {
        Ok(p) => p,
        Err(r) => return r,
    };
    let job = move || match { flush_session(&path); body.kind.as_str() } {
        "new" => atelier_docx::versions::save_version(&path).map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, e.0)),
        "received" => atelier_docx::versions::open_received(&path).map_err(|e| (StatusCode::NOT_FOUND, e.0)),
        _ => Err((StatusCode::BAD_REQUEST, "kind : new ou received".to_string())),
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(copy)) => (StatusCode::OK, Json(json!({"ok": true, "path": copy.to_string_lossy()}))).into_response(),
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
        if let Some(f) = from.as_deref() {
            flush_session(f);
        }
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
                json!({"path": rel, "mtime": m, "changes": tracked_count(&p), "openInWord": atelier_docx::open_in_word(&p)})
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
        assert!(!atelier_docx::open_in_word(&doc));
        // Word garde la fin du nom pour les noms longs.
        std::fs::write(dir.path().join("~$apitre 2 corrigé CK.docx"), b"x").unwrap();
        assert!(atelier_docx::open_in_word(&doc));
    }

    #[test]
    fn word_s_ouvre_par_son_identifiant() {
        let cmd = word_command(Path::new("/tmp/a b.docx"));
        let std = cmd.as_std();
        if std::env::var_os("ATELIER_WORD_OPENER").is_none() {
            assert_eq!(std.get_program(), "open");
            let args: Vec<_> = std.get_args().collect();
            assert_eq!(args, ["-b", "com.microsoft.Word", "/tmp/a b.docx"]);
        }
        assert!(word_missing("LSOpenURLsWithRole() failed… Unable to find application with identifier com.microsoft.Word"));
        assert!(!word_missing(""));
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
