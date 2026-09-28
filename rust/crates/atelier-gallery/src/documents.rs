//! Phase 4 — LaTeX, PDF, annotations documentaires, export PNG.
//!
//! Outils externes en argv séparé (jamais de shell) : latexmk/tectonic,
//! rsvg-convert, ruff. Chemins pinnés sous le projet. SyncTeX est lu en Rust
//! (`crate::synctex`) : plus besoin de la CLI `synctex` de MacTeX.

use atelier_core::{atomic_write, atomic_write_text, find_tex_root, safe_project_path};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::IntoResponse,
};
use fs2::FileExt;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    fs,
    fs::OpenOptions,
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::process::Command;

use crate::{AppState, request_allowed};

// ---------------------------------------------------------------------------
// Tool discovery
// ---------------------------------------------------------------------------

fn which(bin: &str) -> Option<PathBuf> {
    std::process::Command::new("which")
        .arg(bin)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
}

/// Ordre de fallback : chemin MacTeX Python → PATH → (compile) tectonic.
fn latexmk_bin() -> Option<PathBuf> {
    const FIXED: &str = "/Library/TeX/texbin/latexmk";
    if Path::new(FIXED).is_file() {
        return Some(PathBuf::from(FIXED));
    }
    which("latexmk")
}

fn tectonic_bin() -> Option<PathBuf> {
    which("tectonic")
}

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

/// Neutralise l'injection d'options argv pour latexmk/tectonic (plan 063,
/// finding SEC-07) : un nom de fichier commençant par `-` (ex. `-evil.tex`)
/// serait interprété comme une option par les deux outils plutôt qu'un nom
/// de fichier. `current_dir` est déjà posé sur `cwd` ; préfixer `./` suffit à
/// lever l'ambiguïté pour n'importe quel basename, y compris hostile.
fn prefix_argv_basename(basename: &str) -> String {
    format!("./{basename}")
}

/// Ceinture-bretelles au-dessus de `prefix_argv_basename` (qui suffirait déjà
/// seul à neutraliser l'injection) : refuse explicitement, avec un message
/// clair, tout basename commençant par `-` avant même de construire l'argv.
fn safe_argv_basename(basename: &str) -> Result<String, String> {
    if basename.starts_with('-') {
        return Err(format!(
            "nom de fichier invalide (commence par '-'): {basename}"
        ));
    }
    Ok(prefix_argv_basename(basename))
}

fn project_rel(root: &Path, full: &Path) -> String {
    full.strip_prefix(root)
        .unwrap_or(full)
        .to_string_lossy()
        .replace('\\', "/")
}

// ---------------------------------------------------------------------------
// POST /compile
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct CompileBody {
    path: String,
    #[serde(default)]
    force: bool,
}

#[derive(Default)]
struct CompileQueue {
    pending: bool,
    force: bool,
}

struct CompileFlight {
    queue: std::sync::Mutex<CompileQueue>,
    result: tokio::sync::watch::Sender<Option<Value>>,
}

/// One live worker per canonical root, shared by every editor/PDF tab.
/// Requests arriving during a pass are folded into one incremental follow-up:
/// edits saved during latexmk are checked again before any waiter is released.
fn compile_flights()
-> &'static std::sync::Mutex<std::collections::HashMap<PathBuf, std::sync::Weak<CompileFlight>>> {
    static FLIGHTS: std::sync::OnceLock<
        std::sync::Mutex<std::collections::HashMap<PathBuf, std::sync::Weak<CompileFlight>>>,
    > = std::sync::OnceLock::new();
    FLIGHTS.get_or_init(Default::default)
}

async fn coordinated_compile(root: PathBuf, force: bool) -> Value {
    coordinated_compile_with(root, force, |root, force| async move {
        compile_document(&root, force).await
    })
    .await
}

async fn coordinated_compile_with<F, Fut>(root: PathBuf, force: bool, run: F) -> Value
where
    F: Fn(PathBuf, bool) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Value> + Send,
{
    let (flight, start) = {
        let mut flights = compile_flights().lock().unwrap_or_else(|e| e.into_inner());
        flights.retain(|_, flight| flight.strong_count() > 0);
        // A completed flight can still have response waiters. A new request
        // must check the filesystem again, rather than reuse its old result.
        let existing = flights
            .get(&root)
            .and_then(std::sync::Weak::upgrade)
            .filter(|flight| flight.result.borrow().is_none());
        if let Some(flight) = existing {
            let mut queue = flight.queue.lock().unwrap_or_else(|e| e.into_inner());
            queue.pending = true;
            queue.force |= force;
            drop(queue);
            (flight, false)
        } else {
            let (result, _) = tokio::sync::watch::channel(None);
            let flight = std::sync::Arc::new(CompileFlight {
                queue: std::sync::Mutex::new(CompileQueue::default()),
                result,
            });
            flights.insert(root.clone(), std::sync::Arc::downgrade(&flight));
            (flight, true)
        }
    };
    let mut result = flight.result.subscribe();
    if start {
        let worker = flight.clone();
        // Own the process independently of a disconnected HTTP request.
        tokio::spawn(async move {
            let mut force = force;
            loop {
                let response = run(root.clone(), force).await;
                // Same lock order as admission: close the flight atomically
                // so a late request never joins a result already published.
                let _flights = compile_flights().lock().unwrap_or_else(|e| e.into_inner());
                let mut queue = worker.queue.lock().unwrap_or_else(|e| e.into_inner());
                if queue.pending {
                    force = queue.force;
                    *queue = CompileQueue::default();
                } else {
                    worker.result.send_replace(Some(response));
                    break;
                }
            }
        });
    }
    loop {
        if let Some(response) = result.borrow().clone() {
            return response;
        }
        if result.changed().await.is_err() {
            return json!({"ok": false, "error": "compilation interrompue"});
        }
    }
}

pub async fn compile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CompileBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(p) = safe_project_path(&state.root, &body.path) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let root = find_tex_root(&p);
    // Recheck the resolved TeX root as a magic-root directive may escape the
    // requested file's directory. This also normalizes the coordinator key.
    let Ok(root) = safe_project_path(&state.root, &root.to_string_lossy()) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    (
        StatusCode::OK,
        Json(coordinated_compile(root, body.force).await),
    )
        .into_response()
}

fn latexmk_args(basename: &str, force: bool) -> Vec<String> {
    let mut args = vec![
        "-pdf",
        "-synctex=1",
        "-interaction=nonstopmode",
        "-halt-on-error",
    ];
    if force {
        args.push("-g");
    }
    args.push(basename);
    args.into_iter().map(str::to_owned).collect()
}

/// `--synctex` : sans lui tectonic n'écrit pas de `.synctex.gz`, et la
/// synchronisation éditeur ↔ PDF ne trouve rien.
fn tectonic_args(basename: &str) -> Vec<String> {
    ["-X", "compile", "--synctex", basename]
        .into_iter()
        .map(str::to_owned)
        .collect()
}

/// Budget d'une passe : tectonic télécharge ses paquets TeX (bundle) à la
/// première compilation, bien plus longue qu'une passe latexmk.
fn compile_budget(latexmk: bool) -> Duration {
    Duration::from_secs(if latexmk { 180 } else { 600 })
}

async fn compile_document(root: &Path, force: bool) -> Value {
    let pdf = root.with_extension("pdf");
    let cwd = root.parent().unwrap_or_else(|| Path::new("."));
    let basename = match safe_argv_basename(
        root.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("main.tex"),
    ) {
        Ok(b) => b,
        Err(err) => return json!({"ok": false, "error": err}),
    };
    // latexmk (MacTeX) d'abord, puis tectonic du PATH, puis le tectonic
    // d'Atelier — téléchargé ici une seule fois s'il manque (réseau, verrou :
    // hors du runtime async).
    let compiler = tokio::task::spawn_blocking(|| {
        if let Some(path) = latexmk_bin() {
            return Ok(Some((path, true)));
        }
        if let Some(path) = tectonic_bin() {
            return Ok(Some((path, false)));
        }
        crate::tectonic::ensure().map(|found| found.map(|path| (path, false)))
    })
    .await
    .unwrap_or_else(|error| Err(error.to_string()));
    let (compiler, latexmk) = match compiler {
        Ok(Some(found)) => found,
        // `reason` : l'éditeur affiche une consigne d'installation au lieu du
        // générique « échec — voir la console » (plan 060, étape 3).
        Ok(None) => {
            return json!({
                "ok": false,
                "reason": "toolchain-missing",
                "error": "LaTeX introuvable (ni latexmk ni tectonic) : installez tectonic (brew install tectonic) ou MacTeX, voir Réglages → Environnement"
            });
        }
        // Rien n'a été installé : la prochaine compilation retentera.
        Err(error) => {
            return json!({
                "ok": false,
                "reason": "toolchain-download-failed",
                "error": format!(
                    "Téléchargement de tectonic impossible ({error}). Vérifiez la connexion Internet puis recompilez, ou installez MacTeX (Réglages → Environnement)."
                )
            });
        }
    };
    let mut cmd = Command::new(compiler);
    if latexmk {
        cmd.args(latexmk_args(&basename, force));
    } else {
        cmd.args(tectonic_args(&basename));
    }
    cmd.current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    // Retain the process-group id: killing just latexmk can leave TeX children
    // writing the PDF while the next coordinated pass starts.
    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(error) => return json!({"ok": false, "error": error.to_string()}),
    };
    let pid = child.id();
    let budget = compile_budget(latexmk);
    match tokio::time::timeout(budget, child.wait_with_output()).await {
        Ok(Ok(output)) => {
            let log = format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            let ok = output.status.success() && pdf.is_file();
            json!({"ok": ok, "pdf": if ok {json!(pdf.to_string_lossy())} else {Value::Null},
                "root": root.to_string_lossy(), "log": log,
                "error": if ok {String::new()} else {compile_error_excerpt(&log)}})
        }
        Ok(Err(error)) => json!({"ok": false, "error": error.to_string()}),
        Err(_) => {
            #[cfg(unix)]
            if let Some(pid) = pid {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGKILL);
                }
            }
            json!({"ok": false, "error": format!("compilation > {} s", budget.as_secs())})
        }
    }
}

fn compile_error_excerpt(log: &str) -> String {
    let lines: Vec<&str> = log
        .lines()
        .filter(|l| l.starts_with('!') || l.contains("Error"))
        .take(8)
        .collect();
    if !lines.is_empty() {
        return lines.join("\n");
    }
    let count = log.chars().count();
    log.chars().skip(count.saturating_sub(1500)).collect()
}

// ---------------------------------------------------------------------------
// POST /synctex
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct SynctexBody {
    tex: String,
    pdf: String,
    dir: String,
    line: Option<Value>,
    col: Option<Value>,
    page: Option<Value>,
    x: Option<Value>,
    y: Option<Value>,
}

fn value_as_i64(v: Option<&Value>) -> Option<i64> {
    v.and_then(|val| {
        val.as_i64()
            .or_else(|| val.as_f64().map(|f| f as i64))
            .or_else(|| val.as_str().and_then(|s| s.parse().ok()))
    })
}

fn value_as_f64(v: Option<&Value>) -> Option<f64> {
    v.and_then(|val| {
        val.as_f64()
            .or_else(|| val.as_i64().map(|i| i as f64))
            .or_else(|| val.as_str().and_then(|s| s.parse().ok()))
    })
}

pub async fn synctex(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SynctexBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let Ok(tex) = safe_project_path(&state.root, &body.tex) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let Ok(pdf) = safe_project_path(&state.root, &body.pdf) else {
        return json_error(StatusCode::FORBIDDEN, "outside the project");
    };
    let view = body.dir == "view";
    let line = value_as_i64(body.line.as_ref()).unwrap_or(1);
    let col = value_as_i64(body.col.as_ref()).unwrap_or(1);
    let page = value_as_i64(body.page.as_ref()).unwrap_or(1);
    let x = value_as_f64(body.x.as_ref()).unwrap_or(0.0);
    let y = value_as_f64(body.y.as_ref()).unwrap_or(0.0);
    // Lecture du `.synctex.gz` et requête hors du runtime async ; même budget
    // de 10 s que l'ancienne CLI. Réponses au format de la CLI : premier
    // résultat (« le plus précis »), coordonnées PDF en points, origine en
    // haut à gauche.
    let lookup = tokio::task::spawn_blocking(move || {
        let synctex = crate::synctex::load_for_pdf(&pdf).ok()?;
        if view {
            let clamp = |v: i64| v.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32;
            synctex.view(&tex, clamp(line), clamp(col)).map(
                |hit| json!({"page": hit.page, "x": round_coord(hit.x), "y": round_coord(hit.y)}),
            )
        } else {
            let page = page.clamp(1, i64::from(i32::MAX)) as i32;
            synctex
                .edit(page, x, y)
                .map(|hit| json!({"line": hit.line, "input": hit.input}))
        }
    });
    match tokio::time::timeout(Duration::from_secs(10), lookup).await {
        Ok(Ok(Some(found))) => (StatusCode::OK, Json(found)).into_response(),
        // Pas de `.synctex(.gz)` (PDF non compilé ici) ou aucun nœud : comme
        // la CLI, qui n'imprimait alors rien.
        Ok(Ok(None)) => (StatusCode::OK, Json(json!({"error": "no match"}))).into_response(),
        Ok(Err(error)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "synctex timed out"),
    }
}

/// La CLI imprime ses coordonnées avec 6 décimales (`%f`).
fn round_coord(value: f64) -> f64 {
    (value * 1e6).round() / 1e6
}

// ---------------------------------------------------------------------------
// GET/POST /pdfannot
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct PdfAnnotQuery {
    rel: Option<String>,
}

/// Store commun aux serveurs de projets. Seules les cles Zotero y sont
/// ecrites : les chemins relatifs ordinaires ne sont pas globalement uniques.
fn shared_pdf_annots_path(root: &Path) -> PathBuf {
    if let Some(dir) = std::env::var_os("ATELIER_APP_DIR") {
        let dir = PathBuf::from(dir);
        if !dir.as_os_str().is_empty() {
            return dir.join("pdf_annots.json");
        }
    }
    root.join(".fig_thumbs").join("pdf_annots.json")
}

/// Ancien emplacement (par projet) : lu en secours pour ne pas perdre les
/// annotations posées avant le passage au store partagé. La première
/// écriture les recopie dans le store partagé.
fn legacy_pdf_annots_path(root: &Path) -> PathBuf {
    root.join(".fig_thumbs").join("pdf_annots.json")
}

fn is_zotero_pdf_rel(rel: &str) -> bool {
    let Some(rest) = rel.strip_prefix("zotero/") else {
        return false;
    };
    let Some((key, file)) = rest.split_once('/') else {
        return false;
    };
    key.len() == 8
        && key.chars().all(|c| c.is_ascii_alphanumeric())
        && !file.contains('/')
        && !file.contains('\\')
        && file.to_ascii_lowercase().ends_with(".pdf")
}

#[derive(Clone, PartialEq, Eq)]
struct PdfStoreStamp {
    modified: Option<std::time::SystemTime>,
    size: u64,
    #[cfg(unix)]
    identity: (u64, i64, i64),
}
impl PdfStoreStamp {
    fn read(path: &Path) -> Option<Self> {
        let meta = fs::metadata(path).ok()?;
        Some(Self { modified:meta.modified().ok(), size:meta.len(),
            #[cfg(unix)]
            identity:{ use std::os::unix::fs::MetadataExt; (meta.ino(), meta.ctime(), meta.ctime_nsec()) },
        })
    }
}
struct CachedPdfStore { stamp:PdfStoreStamp, value:std::sync::Arc<Value>, bytes:u64 }
fn pdf_store_cache() -> &'static std::sync::Mutex<std::collections::HashMap<PathBuf, CachedPdfStore>> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<PathBuf, CachedPdfStore>>> = std::sync::OnceLock::new();
    CACHE.get_or_init(std::sync::Mutex::default)
}

/// Shared immutable values make a one-document GET clone only its annotations.
/// Atomic replacements and in-place edits invalidate via inode/ctime/mtime/size;
/// all metadata and JSON work runs on a blocking worker at the route boundary.
fn read_pdf_store(path: &Path) -> std::sync::Arc<Value> {
    let Some(stamp) = PdfStoreStamp::read(path) else { return std::sync::Arc::new(json!({})); };
    {
        let cache = pdf_store_cache().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(cached) = cache.get(path).filter(|entry| entry.stamp == stamp) { return cached.value.clone(); }
    }
    let value = std::sync::Arc::new(fs::read(path).ok().and_then(|raw| serde_json::from_slice(&raw).ok()).unwrap_or_else(|| json!({})));
    // Do not cache a read that raced an external writer. The next GET will
    // retry; shared-store reads additionally retain their interprocess lock.
    if stamp.size <= 16 * 1024 * 1024 && PdfStoreStamp::read(path).as_ref() == Some(&stamp) {
        let mut cache = pdf_store_cache().lock().unwrap_or_else(|e| e.into_inner());
        if cache.len() >= 16 || cache.values().map(|entry| entry.bytes).sum::<u64>() + stamp.size > 32 * 1024 * 1024 { cache.clear(); }
        cache.insert(path.to_path_buf(), CachedPdfStore {bytes:stamp.size, stamp, value:value.clone()});
    }
    value
}

fn write_pdf_store(path: &Path, store: &Value) -> Result<(), String> {
    let payload = format!(
        "{}\n",
        serde_json::to_string_pretty(store).unwrap_or_else(|_| "{}".into())
    );
    atomic_write_text(path, &payload).map_err(|error| error.to_string())?;
    pdf_store_cache().lock().unwrap_or_else(|e| e.into_inner()).remove(path);
    Ok(())
}

#[cfg(test)]
mod pdf_store_cache_tests {
    use super::*;

    #[test]
    fn cached_reads_share_a_value_and_external_atomic_updates_invalidate_it() {
        let root = tempfile::tempdir().unwrap(); let path = root.path().join("pdf_annots.json");
        write_pdf_store(&path, &json!({"a.pdf":[{"id":"old"}]})).unwrap();
        let first = read_pdf_store(&path); let warm = read_pdf_store(&path);
        assert!(std::sync::Arc::ptr_eq(&first, &warm));
        atomic_write_text(&path, r#"{"a.pdf":[{"id":"new"}]}"#).unwrap();
        let external = read_pdf_store(&path);
        assert_eq!(external["a.pdf"][0]["id"], "new");
        assert!(!std::sync::Arc::ptr_eq(&first, &external));
        write_pdf_store(&path, &json!({"a.pdf":[]})).unwrap();
        assert_eq!(read_pdf_store(&path)["a.pdf"], json!([]));
        // Readers holding the old snapshot remain immutable across writes.
        assert_eq!(first["a.pdf"][0]["id"], "old");
    }

    #[test]
    fn cached_project_stores_never_mix_same_relative_pdf_names() {
        let a = tempfile::tempdir().unwrap(); let b = tempfile::tempdir().unwrap();
        let a = a.path().join("pdf_annots.json"); let b = b.path().join("pdf_annots.json");
        write_pdf_store(&a, &json!({"same.pdf":[{"id":"a"}]})).unwrap();
        write_pdf_store(&b, &json!({"same.pdf":[{"id":"b"}]})).unwrap();
        assert_eq!(read_pdf_store(&a)["same.pdf"][0]["id"], "a");
        assert_eq!(read_pdf_store(&b)["same.pdf"][0]["id"], "b");
    }
}

fn annotation_id(value: &Value) -> Option<String> {
    value.get("id").and_then(|id| match id {
        Value::String(id) => Some(id.clone()),
        Value::Number(id) => Some(id.to_string()),
        _ => None,
    })
}

/// Fusion additive d'un ancien store de projet vers le store Zotero commun.
/// Le commun gagne en cas de meme id : il contient l'etat le plus recent
/// (par exemple une note modifiee apres migration).
fn merge_legacy_zotero_entries(shared: &mut Value, legacy: &Value) -> bool {
    if !shared.is_object() {
        *shared = json!({});
    }
    let Some(shared) = shared.as_object_mut() else {
        return false;
    };
    let Some(legacy) = legacy.as_object() else {
        return false;
    };
    let mut changed = false;
    for (rel, old_value) in legacy {
        if !is_zotero_pdf_rel(rel) {
            continue;
        }
        let Some(old_annots) = old_value.as_array() else {
            continue;
        };
        let current = shared.entry(rel.clone()).or_insert_with(|| json!([]));
        let Some(current_annots) = current.as_array_mut() else {
            *current = json!([]);
            let Some(current_annots) = current.as_array_mut() else {
                continue;
            };
            for annot in old_annots {
                current_annots.push(annot.clone());
            }
            changed |= !old_annots.is_empty();
            continue;
        };
        for annot in old_annots {
            let duplicate = annotation_id(annot)
                .map(|id| {
                    current_annots
                        .iter()
                        .any(|item| annotation_id(item).as_deref() == Some(&id))
                })
                .unwrap_or_else(|| current_annots.contains(annot));
            if !duplicate {
                current_annots.push(annot.clone());
                changed = true;
            }
        }
    }
    changed
}

fn migration_key(root: &Path) -> String {
    fs::canonicalize(root)
        .unwrap_or_else(|_| root.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// Ouvre le store Zotero sous verrou inter-processus, puis importe une seule
/// fois l'ancien store du projet courant. Plusieurs serveurs Galerie peuvent
/// ainsi partager le fichier sans perdre la derniere ecriture.
fn with_shared_pdf_store<T>(
    root: &Path,
    operation: impl FnOnce(&mut std::sync::Arc<Value>) -> Result<(T, bool), String>,
) -> Result<T, String> {
    let shared_path = shared_pdf_annots_path(root);
    let legacy_path = legacy_pdf_annots_path(root);
    if let Some(parent) = shared_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let lock_path = shared_path.with_file_name("pdf_annots.lock");
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&lock_path)
        .map_err(|error| error.to_string())?;
    lock.lock_exclusive().map_err(|error| error.to_string())?;

    let result = (|| {
        let mut store = read_pdf_store(&shared_path);
        let ledger_path = shared_path.with_file_name("pdf_annots_migrations.json");
        let mut ledger = read_pdf_store(&ledger_path);
        if !ledger.is_object() {
            ledger = std::sync::Arc::new(json!({}));
        }
        let key = migration_key(root);
        let should_migrate =
            shared_path != legacy_path && ledger.get(&key).and_then(Value::as_bool) != Some(true);
        let migrated = should_migrate
            && merge_legacy_zotero_entries(std::sync::Arc::make_mut(&mut store), &read_pdf_store(&legacy_path));
        let (value, changed) = operation(&mut store)?;
        if migrated || changed {
            write_pdf_store(&shared_path, &store)?;
        }
        if should_migrate {
            if let Some(entries) = std::sync::Arc::make_mut(&mut ledger).as_object_mut() {
                entries.insert(key, Value::Bool(true));
            }
            write_pdf_store(&ledger_path, &ledger)?;
        }
        Ok(value)
    })();

    let _ = FileExt::unlock(&lock);
    result
}

fn updated_annotations(store: &Value, rel: &str, body: &Value) -> Result<Value, String> {
    if let Some(ids) = body.get("removeIds") {
        let Some(ids) = ids
            .as_array()
            .filter(|ids| ids.iter().all(Value::is_string))
        else {
            return Err("removeIds must be an array of strings".into());
        };
        let existing = store.get(rel).cloned().unwrap_or_else(|| json!([]));
        return Ok(json!(
            existing
                .as_array()
                .into_iter()
                .flatten()
                .filter(|annot| {
                    let Some(id) = annotation_id(annot) else {
                        return true;
                    };
                    !ids.iter()
                        .any(|remove| remove.as_str() == Some(id.as_str()))
                })
                .collect::<Vec<_>>()
        ));
    }
    let annots = body.get("annots").cloned().unwrap_or_else(|| json!([]));
    let Some(known) = body.get("known") else {
        return Ok(annots);
    };
    let Some(known) = known
        .as_array()
        .filter(|ids| ids.iter().all(Value::is_string))
    else {
        return Err("known must be an array of strings".into());
    };
    let Some(list) = annots.as_array() else {
        return Ok(annots);
    };
    // `known` = ids que l'écrivain a vus dans le store. Une annotation du
    // store qu'il n'a jamais vue a été posée ailleurs (MCP, autre fenêtre)
    // pendant qu'il travaillait : on la garde au lieu de l'écraser. Une
    // annotation vue puis absente de `annots` a été retirée exprès.
    let mut merged = list.clone();
    for annot in store
        .get(rel)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(id) = annotation_id(annot) else {
            continue;
        };
        let seen = known.iter().any(|k| k.as_str() == Some(id.as_str()));
        let sent = list
            .iter()
            .any(|item| annotation_id(item).as_deref() == Some(id.as_str()));
        if !seen && !sent {
            merged.push(annot.clone());
        }
    }
    Ok(Value::Array(merged))
}

fn apply_pdf_store_update(
    path: &Path,
    store: &mut Value,
    rel: &str,
    body: &Value,
) -> Result<(), String> {
    let new_annots = updated_annotations(store, rel, body)?;
    if !new_annots.is_array() {
        return Err("annots must be an array".into());
    }
    let clearing = new_annots
        .as_array()
        .is_some_and(|annots| annots.is_empty())
        && store
            .get(rel)
            .and_then(Value::as_array)
            .is_some_and(|annots| !annots.is_empty());
    if clearing {
        let backup = PathBuf::from(format!("{}.bak", path.display()));
        atomic_write(
            &backup,
            serde_json::to_vec(store).unwrap_or_default().as_slice(),
        )
        .map_err(|error| error.to_string())?;
    }
    if !store.is_object() {
        *store = json!({});
    }
    store
        .as_object_mut()
        .ok_or_else(|| "invalid annotation store".to_string())?
        .insert(rel.to_string(), new_annots);
    Ok(())
}

pub async fn get_pdfannot(
    State(state): State<AppState>,
    Query(query): Query<PdfAnnotQuery>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let rel = query.rel.unwrap_or_default();
        if is_zotero_pdf_rel(&rel) {
            with_shared_pdf_store(&state.root, |store| Ok((store.get(&rel).cloned().unwrap_or_else(|| json!([])), false)))
        } else {
            Ok(read_pdf_store(&legacy_pdf_annots_path(&state.root)).get(&rel).cloned().unwrap_or_else(|| json!([])))
        }
    }).await;
    match result {
        Ok(Ok(annots)) => (StatusCode::OK, Json(json!({"annots": annots}))).into_response(),
        Ok(Err(error)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

/// GET /pdfannot-stamp — date de dernière écriture du store qui porte `rel`
/// (ms, 0 s'il n'existe pas). Le lecteur la veille pour recharger ses
/// annotations quand un autre écrivain (MCP, autre fenêtre) les change,
/// sans relire tout le store à chaque tick.
pub async fn get_pdfannot_stamp(
    State(state): State<AppState>,
    Query(query): Query<PdfAnnotQuery>,
) -> impl IntoResponse {
    let rel = query.rel.unwrap_or_default();
    let path = if is_zotero_pdf_rel(&rel) {
        shared_pdf_annots_path(&state.root)
    } else {
        legacy_pdf_annots_path(&state.root)
    };
    let stamp = tokio::fs::metadata(&path).await
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0);
    (StatusCode::OK, Json(json!({"stamp": stamp}))).into_response()
}

/// GET /pdfannot-all — les annotations Zotero communes, superposees aux
/// annotations des PDF du projet courant pour la portee « Bibliotheque ».
pub async fn get_pdfannot_all(State(state): State<AppState>) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let shared = with_shared_pdf_store(&state.root, |store| Ok((store.clone(), false)))?;
        let mut combined = (*read_pdf_store(&legacy_pdf_annots_path(&state.root))).clone();
        if !combined.is_object() { combined = json!({}); }
        if let (Some(combined), Some(shared)) = (combined.as_object_mut(), shared.as_object()) {
            for (rel, annots) in shared {
                if is_zotero_pdf_rel(rel) { combined.insert(rel.clone(), annots.clone()); }
            }
        }
        Ok(combined)
    }).await;
    match result {
        Ok(Ok(annots)) => (StatusCode::OK, Json(json!({"annots":annots}))).into_response(),
        Ok(Err(error)) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
    }
}

pub async fn post_pdfannot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    // Amélioration de sécurité vs Python (pas de garde) : loopback + cap 64 Mo.
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "loopback origin required");
    }
    if let Some(len) = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<u64>().ok())
        && len > 64 * 1024 * 1024
    {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "payload too large"})),
        )
            .into_response();
    }
    let rel_key = body
        .get("rel")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if rel_key.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "rel required");
    }
    let result = tokio::task::spawn_blocking(move || {
        if is_zotero_pdf_rel(&rel_key) {
            let shared_path = shared_pdf_annots_path(&state.root);
            with_shared_pdf_store(&state.root, |store| {
                apply_pdf_store_update(&shared_path, std::sync::Arc::make_mut(store), &rel_key, &body)?;
                Ok(((), true))
            })
        } else {
            let store_path = legacy_pdf_annots_path(&state.root);
            if let Some(parent) = store_path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            let lock = OpenOptions::new().create(true).truncate(false).read(true).write(true)
                .open(store_path.with_file_name("pdf_annots.lock")).map_err(|e| e.to_string())?;
            lock.lock_exclusive().map_err(|e| e.to_string())?;
            let mut store = read_pdf_store(&store_path);
            let result = apply_pdf_store_update(&store_path, std::sync::Arc::make_mut(&mut store), &rel_key, &body)
                .and_then(|()| write_pdf_store(&store_path, &store));
            let _ = FileExt::unlock(&lock);
            result
        }
    }).await.unwrap_or_else(|error| Err(error.to_string()));
    match result {
        Ok(()) => (StatusCode::OK, Json(json!({"ok": true}))).into_response(),
        Err(error)
            if error == "removeIds must be an array of strings"
                || error == "known must be an array of strings"
                || error == "annots must be an array" =>
        {
            json_error(StatusCode::BAD_REQUEST, error)
        }
        Err(error) => json_error(StatusCode::INTERNAL_SERVER_ERROR, error),
    }
}

// ---------------------------------------------------------------------------
// POST /export-png
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ExportPngBody {
    rel: Option<String>,
    name: Option<String>,
    svg: String,
    dpi: Option<Value>,
}

pub async fn export_png(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ExportPngBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if body.svg.is_empty() || body.svg.len() > 64 * 1024 * 1024 {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(json!({"error": "empty or oversized svg"})),
        )
            .into_response();
    }
    let head = if body.svg.len() > 4000 {
        &body.svg[..4000]
    } else {
        &body.svg
    };
    if !head.contains("<svg") {
        return json_error(StatusCode::BAD_REQUEST, "not an svg payload");
    }
    let dpi = body
        .dpi
        .as_ref()
        .and_then(|v| {
            v.as_i64()
                .or_else(|| v.as_f64().map(|f| f as i64))
                .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        })
        .map(|d| d.clamp(72, 1200))
        .unwrap_or(300);

    let rel = body
        .rel
        .as_deref()
        .or(body.name.as_deref())
        .unwrap_or("")
        .to_string();
    let Ok(dst) = safe_project_path(&state.root, &rel) else {
        return json_error(StatusCode::BAD_REQUEST, "svg not found / non-svg / symlink");
    };
    let is_svg = dst
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("svg"));
    if !is_svg || !dst.is_file() || dst.is_symlink() {
        return json_error(StatusCode::BAD_REQUEST, "svg not found / non-svg / symlink");
    }
    // Sibling .png (Python: dst[:-4] + ".png" for paths ending in .svg).
    let mut png = dst.clone();
    png.set_extension("png");
    if png.is_symlink() || safe_project_path(&state.root, &png.to_string_lossy()).is_err() {
        return json_error(StatusCode::BAD_REQUEST, "bad png output path");
    }

    let Some(rsvg) = which("rsvg-convert") else {
        return (
            StatusCode::NOT_IMPLEMENTED,
            Json(json!({
                "error": "rsvg-convert not installed (brew install librsvg / apt install librsvg2-bin)"
            })),
        )
            .into_response();
    };

    let parent = dst.parent().unwrap_or_else(|| Path::new("."));
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_svg = parent.join(format!(".exp.{nonce}.svg"));
    let tmp_png = parent.join(format!(".exp.{nonce}.png"));
    if let Err(error) = fs::write(&tmp_svg, body.svg.as_bytes()) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
    }
    // Create empty tmp_png so path exists for -o (like mkstemp + close).
    let _ = fs::File::create(&tmp_png);

    let mut cmd = Command::new(&rsvg);
    cmd.args([
        "--dpi-x",
        &dpi.to_string(),
        "--dpi-y",
        &dpi.to_string(),
        "-o",
    ])
    .arg(&tmp_png)
    .arg(&tmp_svg)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true);

    let result = tokio::time::timeout(Duration::from_secs(120), cmd.output()).await;
    let cleanup = || {
        let _ = fs::remove_file(&tmp_svg);
        let _ = fs::remove_file(&tmp_png);
    };

    match result {
        Ok(Ok(output)) => {
            let size = fs::metadata(&tmp_png).map(|m| m.len()).unwrap_or(0);
            if !output.status.success() || size == 0 {
                let err = String::from_utf8_lossy(&output.stderr);
                let count = err.chars().count();
                let tail: String = err.chars().skip(count.saturating_sub(300)).collect();
                cleanup();
                return json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("rsvg-convert failed: {tail}"),
                );
            }
            if let Err(error) = fs::rename(&tmp_png, &png) {
                cleanup();
                return json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string());
            }
            let _ = fs::remove_file(&tmp_svg);
            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "path": project_rel(&state.root, &png),
                    "dpi": dpi,
                })),
            )
                .into_response()
        }
        Ok(Err(error)) => {
            cleanup();
            json_error(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
        }
        Err(_) => {
            cleanup();
            json_error(StatusCode::INTERNAL_SERVER_ERROR, "rsvg-convert timed out")
        }
    }
}

// ---------------------------------------------------------------------------
// GET /lint (STUDIO side-car ; always registered, available:false otherwise)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct LintQuery {
    path: Option<String>,
}

pub async fn lint(Query(query): Query<LintQuery>) -> impl IntoResponse {
    // Python only exposes this under STUDIO; when registered we still apply the
    // same path policy: ~/Documents or ~/Desktop, *.py only.
    let requested = query.path.as_deref().unwrap_or("");
    let expanded = if requested.starts_with('~') {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        if requested == "~" {
            home
        } else if let Some(rest) = requested.strip_prefix("~/") {
            format!("{home}/{rest}")
        } else {
            requested.to_string()
        }
    } else {
        requested.to_string()
    };
    let Ok(p) = fs::canonicalize(&expanded) else {
        return (StatusCode::OK, Json(json!({"available": false}))).into_response();
    };
    let home = std::env::var("HOME").unwrap_or_default();
    let allowed = ["Documents", "Desktop"].iter().any(|d| {
        let base = PathBuf::from(&home).join(d);
        p.starts_with(&base)
    });
    if !allowed || p.extension().and_then(|e| e.to_str()) != Some("py") || !p.is_file() {
        return (StatusCode::OK, Json(json!({"available": false}))).into_response();
    }
    let Some(ruff) = which("ruff") else {
        return (StatusCode::OK, Json(json!({"available": false}))).into_response();
    };
    let mut cmd = Command::new(ruff);
    cmd.args(["check", "--output-format", "json", "--quiet"])
        .arg(&p)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let output = match tokio::time::timeout(Duration::from_secs(5), cmd.output()).await {
        Ok(Ok(o)) => o,
        _ => return (StatusCode::OK, Json(json!({"available": false}))).into_response(),
    };
    let diags: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap_or_default();
    let out: Vec<Value> = diags
        .into_iter()
        .take(200)
        .map(|d| {
            let loc = d.get("location").cloned().unwrap_or(Value::Null);
            json!({
                "row": loc.get("row").and_then(Value::as_i64).unwrap_or(1),
                "col": loc.get("column").and_then(Value::as_i64).unwrap_or(1),
                "code": d.get("code").and_then(Value::as_str).unwrap_or(""),
                "message": d.get("message").and_then(Value::as_str).unwrap_or(""),
            })
        })
        .collect();
    (
        StatusCode::OK,
        Json(json!({"available": true, "diagnostics": out})),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compilation_is_incremental_unless_force_is_explicit() {
        assert!(!latexmk_args("./main.tex", false).contains(&"-g".into()));
        assert!(latexmk_args("./main.tex", true).contains(&"-g".into()));
        assert!(latexmk_args("./main.tex", false).contains(&"-synctex=1".into()));
        let request: CompileBody = serde_json::from_value(json!({"path": "main.tex"})).unwrap();
        assert!(!request.force);
    }

    #[tokio::test]
    async fn compile_requests_share_one_worker_and_one_latest_followup() {
        use std::sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        };
        let root = PathBuf::from("/test/compile_requests_share_one_worker.tex");
        let calls = Arc::new(AtomicUsize::new(0));
        let entered = Arc::new(tokio::sync::Notify::new());
        let release = Arc::new(tokio::sync::Notify::new());
        let runner = {
            let calls = calls.clone();
            let entered = entered.clone();
            let release = release.clone();
            move |_: PathBuf, force| {
                let calls = calls.clone();
                let entered = entered.clone();
                let release = release.clone();
                async move {
                    let call = calls.fetch_add(1, Ordering::SeqCst) + 1;
                    if call == 1 {
                        entered.notify_one();
                        release.notified().await;
                    }
                    json!({"ok": true, "call": call, "force": force})
                }
            }
        };
        let first = tokio::spawn(coordinated_compile_with(
            root.clone(),
            false,
            runner.clone(),
        ));
        entered.notified().await;
        let mut queued = Vec::new();
        for n in 0..8 {
            queued.push(tokio::spawn(coordinated_compile_with(
                root.clone(),
                n == 7,
                runner.clone(),
            )));
        }
        // Give every request a turn to join the running job before release.
        for _ in 0..16 {
            tokio::task::yield_now().await;
        }
        release.notify_one();
        let response = first.await.unwrap();
        assert_eq!(response["call"], 2);
        assert_eq!(response["force"], true);
        for request in queued {
            assert_eq!(request.await.unwrap(), response);
        }
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        // A later request must check changed dependencies, not reuse a result.
        assert_eq!(
            coordinated_compile_with(root, false, runner).await["call"],
            3
        );
    }

    #[test]
    fn compile_error_prefers_bang_lines() {
        let log = "normal\n! Undefined control sequence\nmore\nError: foo\n";
        let err = compile_error_excerpt(log);
        assert!(err.contains('!'));
    }

    #[test]
    fn latexmk_or_tectonic_discovery_does_not_panic() {
        let _ = latexmk_bin();
        let _ = tectonic_bin();
    }

    #[test]
    fn prefix_argv_basename_neutralizes_dash_prefixed_names() {
        // plan 063, SEC-07 : ./ seul suffit déjà à lever l'ambiguïté argv,
        // même pour un nom hostile qui commencerait par '-'.
        assert_eq!(prefix_argv_basename("-evil.tex"), "./-evil.tex");
    }

    #[test]
    fn safe_argv_basename_prefixes_dot_slash() {
        assert_eq!(safe_argv_basename("main.tex").unwrap(), "./main.tex");
    }

    #[test]
    fn safe_argv_basename_refuses_dash_prefixed_name_upfront() {
        // Ceinture-bretelles : refus explicite en amont, avec message clair,
        // même si `./` seul lèverait déjà l'ambiguïté.
        let err = safe_argv_basename("-evil.tex").unwrap_err();
        assert!(err.contains("-evil.tex"));
    }

    #[test]
    fn zotero_identity_is_global_but_project_paths_are_not() {
        assert!(is_zotero_pdf_rel("zotero/ABCD1234/article.pdf"));
        assert!(!is_zotero_pdf_rel("article.pdf"));
        assert!(!is_zotero_pdf_rel("zotero/SHORT/article.pdf"));
        assert!(!is_zotero_pdf_rel("zotero/ABCD1234/folder/article.pdf"));
    }

    #[test]
    fn legacy_zotero_merge_is_additive_and_idempotent() {
        let mut shared = json!({
            "zotero/ABCD1234/article.pdf": [
                {"id": "a1", "note": "version commune"}
            ]
        });
        let legacy = json!({
            "zotero/ABCD1234/article.pdf": [
                {"id": "a1", "note": "ancienne version"},
                {"id": "a2", "note": "annotation d'un autre projet"}
            ],
            "article.pdf": [
                {"id": "local", "note": "reste dans le projet"}
            ]
        });

        assert!(merge_legacy_zotero_entries(&mut shared, &legacy));
        let annots = shared["zotero/ABCD1234/article.pdf"].as_array().unwrap();
        assert_eq!(annots.len(), 2);
        assert_eq!(annots[0]["note"], "version commune");
        assert!(shared.get("article.pdf").is_none());
        assert!(!merge_legacy_zotero_entries(&mut shared, &legacy));
    }

    #[test]
    fn a_save_keeps_annotations_its_writer_never_saw() {
        let rel = "zotero/ABCD1234/article.pdf";
        let store = json!({rel: [
            {"id": "a", "note": "vue par le lecteur"},
            {"id": "b", "note": "vue puis supprimée"},
            {"id": "c", "note": "posée par le MCP pendant ce temps"},
            {"note": "sans id"}
        ]});
        let body = json!({"rel": rel, "known": ["a", "b"], "annots": [
            {"id": "a", "note": "modifiée"},
            {"id": "d", "note": "nouvelle"}
        ]});
        let merged = updated_annotations(&store, rel, &body).unwrap();
        let ids: Vec<_> = merged
            .as_array()
            .unwrap()
            .iter()
            .map(|a| a["id"].as_str().unwrap_or("?"))
            .collect();
        assert_eq!(ids, ["a", "d", "c"]);
        assert_eq!(merged[0]["note"], "modifiée");
    }

    #[test]
    fn a_save_without_known_still_replaces_the_list() {
        let rel = "zotero/ABCD1234/article.pdf";
        let store = json!({rel: [{"id": "c"}]});
        let merged =
            updated_annotations(&store, rel, &json!({"rel": rel, "annots": [{"id": "a"}]}))
                .unwrap();
        assert_eq!(merged, json!([{"id": "a"}]));
        assert!(
            updated_annotations(
                &store,
                rel,
                &json!({"rel": rel, "known": [1], "annots": []})
            )
            .is_err()
        );
    }
}
