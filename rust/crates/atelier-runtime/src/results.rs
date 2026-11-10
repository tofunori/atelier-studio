//! Écran « Résultats » (2026-11-10, variante A validée par Thierry) : la
//! bibliothèque de ce que le projet a produit — figures, tableaux, PDF.
//!
//! Aucune base à tenir : la source est la recette qui voyage avec chaque
//! fichier (`<fichier>.prov.json`, écrite par `prov.rs`). On en tire
//! - la version courante (compteur `generations`, ou longueur de `history`) ;
//! - l'origine : script, cellule du noyau Python ou commande ;
//! - l'état « périmé » : une entrée DIRECTE de la dernière recette n'a plus
//!   l'empreinte notée (pas de propagation en cascade dans cette version) ;
//! - « dépend de » (entrées qui sont elles-mêmes des résultats) et « utilisé
//!   par » (résultats dont il est une entrée).
//!
//! Les étoiles vivent hors du projet, dans `app_dir/results/<sha256>.json`
//! (même discipline que les épingles : un fichier illisible est mis de côté,
//! jamais écrasé). Ce module ne fait que LIRE le dossier du projet : il n'y
//! écrit rien, pas même la copie d'un sidecar illisible.
//!
//! Tout tourne dans un worker de lecture (`ws_dispatch::blocking`), hors du
//! chemin du chat, avec des plafonds : dossiers parcourus, résultats rendus,
//! octets relus pour vérifier une empreinte.

use crate::state::AppState;
use crate::ws_router::json_msg;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet, VecDeque};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Résultats rendus au plus : au-delà, la liste dit qu'elle est tronquée.
const MAX_RESULTS: usize = 500;
/// Dossiers parcourus au plus, et profondeur, pour trouver les recettes.
const MAX_DIRS: usize = 4000;
const MAX_DEPTH: usize = 8;
/// Une recette plus grosse n'est pas lue (le plafond de `history` la garde à
/// quelques kilo-octets ; au-delà, ce n'est pas une recette d'Atelier).
const SIDECAR_MAX_BYTES: u64 = 2 << 20;
/// Mêmes plafonds que la prise d'empreinte d'une recette (`recipe.rs`) : 64 Mo
/// par fichier, 256 Mo par demande.
const HASH_FILE_MAX_BYTES: u64 = 64 << 20;
const HASH_REQUEST_BUDGET_BYTES: u64 = 256 << 20;
const HASH_CACHE_MAX: usize = 4096;
/// Âge minimal d'un fichier pour que son empreinte entre en cache.
const HASH_SETTLE_MS: i64 = 3000;
/// Dossiers qui ne contiennent jamais de résultat à montrer.
const SKIPPED_DIRS: [&str; 6] = ["node_modules", "target", "__pycache__", "site-packages", "venv", "renv"];
/// Résultats dont deux versions se comparent en texte (diff de l'historique).
const TEXT_EXTS: [&str; 3] = ["csv", "tsv", "svg"];
const SIDECAR_SUFFIX: &str = ".prov.json";

/// Empreintes déjà calculées, par fichier et par état (taille, date) : un
/// fichier qui n'a pas bougé n'est relu qu'une fois par vie du serveur.
static HASH_CACHE: Mutex<Option<HashMap<PathBuf, (u64, i64, String)>>> = Mutex::new(None);
/// Les écritures d'étoiles passent une à une.
static STAR_LOCK: Mutex<()> = Mutex::new(());

fn root_of(msg: &Value) -> String {
    msg.get("projectRoot")
        .or_else(|| msg.get("root"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

pub async fn handle(state: &AppState, msg_type: &str, msg: &Value) -> Vec<String> {
    let root = root_of(msg);
    let request_id = msg.get("requestId").cloned().unwrap_or(Value::Null);
    let path = msg.get("path").and_then(Value::as_str).unwrap_or("").to_string();
    let app_dir = state.app_dir().to_path_buf();
    match msg_type {
        "projectResults" => {
            let recipes = atelier_store::load_settings(&state.settings_path())
                .ok()
                .flatten()
                .is_some_and(|settings| crate::prov::recipes_enabled(&settings));
            let r = root.clone();
            let listed = crate::ws_dispatch::blocking(move || list_results(&app_dir, &r))
                .await
                .unwrap_or_else(|e| Err(e.to_string()));
            let mut reply = match listed {
                Ok(listed) => listed,
                Err(error) => json!({"results": [], "error": error}),
            };
            reply["type"] = json!("projectResults");
            reply["projectRoot"] = json!(root);
            reply["requestId"] = request_id;
            reply["recipes"] = json!(recipes);
            vec![json_msg(reply)]
        }
        "projectResultDetail" => {
            let ledger = atelier_store::get_ledger(&state.ledger_dir(), &root, 1000);
            let (r, p) = (root.clone(), path.clone());
            let detail = crate::ws_dispatch::blocking(move || result_detail(&app_dir, &r, &p, &ledger))
                .await
                .unwrap_or_else(|e| Err(e.to_string()));
            let reply = match detail {
                Ok(result) => json!({"type": "projectResultDetail", "projectRoot": root, "requestId": request_id,
                    "path": path, "result": result}),
                Err(error) => json!({"type": "projectResultDetail", "projectRoot": root, "requestId": request_id,
                    "path": path, "error": error}),
            };
            vec![json_msg(reply)]
        }
        "projectResultStar" => {
            let starred = msg.get("starred").and_then(Value::as_bool).unwrap_or(true);
            let (r, p) = (root.clone(), path.clone());
            let saved = crate::ws_dispatch::blocking(move || set_star(&app_dir, &r, &p, starred))
                .await
                .unwrap_or_else(|e| Err(e.to_string()));
            let reply = match saved {
                Ok(()) => json!({"type": "projectResultStarred", "projectRoot": root, "requestId": request_id,
                    "ok": true, "path": path, "starred": starred}),
                Err(error) => json!({"type": "projectResultStarred", "projectRoot": root, "requestId": request_id,
                    "ok": false, "path": path, "error": error}),
            };
            vec![json_msg(reply)]
        }
        _ => Vec::new(),
    }
}

// ─── Étoiles ────────────────────────────────────────────────────────────────

#[derive(Debug, Default, Serialize, Deserialize)]
struct StarFile {
    version: u32,
    starred: Vec<String>,
}

/// `app_dir/results/<sha256(project_root)>.json`.
fn star_path(app_dir: &Path, project_root: &str) -> PathBuf {
    let hash = format!("{:x}", Sha256::digest(project_root.as_bytes()));
    app_dir.join("results").join(format!("{hash}.json"))
}

/// Étoiles du projet. Absent : aucune. Présent mais illisible : erreur (une
/// copie `.corrupt-…` est mise de côté à côté du store, dans le dossier de
/// l'app) — jamais une liste vide que l'étoile suivante écrirait par-dessus.
fn load_stars(app_dir: &Path, project_root: &str) -> Result<Vec<String>, String> {
    let file: Option<StarFile> = atelier_store::durable::load_typed(&star_path(app_dir, project_root))
        .map_err(|e| e.to_string())?;
    Ok(file.map(|f| f.starred).unwrap_or_default())
}

/// Chemin de résultat acceptable : relatif au projet, sans remontée.
fn valid_rel(rel: &str) -> bool {
    !rel.is_empty()
        && rel.len() <= 1024
        && !Path::new(rel).is_absolute()
        && Path::new(rel)
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
}

/// Pose ou retire l'étoile d'un résultat.
pub fn set_star(app_dir: &Path, project_root: &str, rel: &str, starred: bool) -> Result<(), String> {
    if project_root.is_empty() {
        return Err("projet requis".into());
    }
    if !valid_rel(rel) {
        return Err("chemin invalide".into());
    }
    let _guard = STAR_LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let mut list = load_stars(app_dir, project_root)?;
    list.retain(|p| p != rel);
    if starred {
        list.push(rel.to_string());
    }
    list.sort();
    let file = StarFile { version: 1, starred: list };
    atelier_store::durable::save_json_pretty(&star_path(app_dir, project_root), &file).map_err(|e| e.to_string())
}

// ─── Parcours du projet ─────────────────────────────────────────────────────

/// Un résultat trouvé : son fichier, sa famille et sa recette.
struct Found {
    rel: String,
    abs: PathBuf,
    kind: &'static str,
    /// Entrées de `history`, la plus récente en tête.
    history: Vec<Value>,
    generations: u64,
}

impl Found {
    fn latest(&self) -> &Value {
        &self.history[0]
    }

    fn name(&self) -> String {
        file_name(&self.rel)
    }

    fn brief(&self) -> Value {
        json!({"path": self.rel, "name": self.name(), "kind": self.kind, "version": self.generations})
    }
}

fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string()
}

fn extension_lower(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default()
}

/// Famille montrée par l'écran : `figure`, `table` ou `pdf`. Les `.tex` et
/// `.md` reçoivent aussi une recette mais ce sont des sources, pas des
/// résultats.
fn result_kind(rel: &str) -> Option<&'static str> {
    crate::prov::recipe_kind(rel).filter(|kind| matches!(*kind, "figure" | "table" | "pdf"))
}

/// Lit une recette sans jamais rien écrire à côté : illisible, elle est
/// simplement ignorée (c'est `prov.rs` qui la mettra de côté à la prochaine
/// régénération).
fn read_sidecar(sidecar: &Path) -> Option<(Vec<Value>, u64)> {
    let meta = std::fs::metadata(sidecar).ok()?;
    if !meta.is_file() || meta.len() > SIDECAR_MAX_BYTES {
        return None;
    }
    let document: Value = serde_json::from_slice(&std::fs::read(sidecar).ok()?).ok()?;
    let history: Vec<Value> = document
        .get("history")?
        .as_array()?
        .iter()
        .filter(|e| e.is_object())
        .cloned()
        .collect();
    if history.is_empty() {
        return None;
    }
    let generations = crate::prov::generations_of(&document, history.len());
    Some((history, generations))
}

/// Parcourt le projet (en largeur, borné) et rend les résultats qui ont une
/// recette. Le booléen dit si un plafond a coupé le parcours.
fn scan(root: &Path) -> (Vec<Found>, bool) {
    let mut found = Vec::new();
    let mut truncated = false;
    let mut queue: VecDeque<(PathBuf, usize)> = VecDeque::from([(root.to_path_buf(), 0)]);
    let mut visited = 0usize;
    while let Some((dir, depth)) = queue.pop_front() {
        if visited >= MAX_DIRS {
            truncated = true;
            break;
        }
        visited += 1;
        let Ok(read) = std::fs::read_dir(&dir) else { continue };
        for item in read.flatten() {
            let name = item.file_name();
            let Some(name) = name.to_str() else { continue };
            let Ok(file_type) = item.file_type() else { continue };
            if file_type.is_dir() {
                // Les dossiers cachés et les liens vers un dossier ne sont pas
                // suivis (pas de boucle, pas de `.git`, `.venv`, `.fig_thumbs`).
                if depth < MAX_DEPTH && !name.starts_with('.') && !SKIPPED_DIRS.contains(&name) {
                    queue.push_back((item.path(), depth + 1));
                }
                continue;
            }
            let Some(target) = name.strip_suffix(SIDECAR_SUFFIX).filter(|t| !t.is_empty()) else { continue };
            let abs = dir.join(target);
            let Ok(rel) = abs.strip_prefix(root) else { continue };
            let rel = rel.to_string_lossy().replace('\\', "/");
            let Some(kind) = result_kind(&rel) else { continue };
            // Recette orpheline (fichier supprimé ou déplacé) : rien à montrer.
            if !abs.is_file() {
                continue;
            }
            let Some((history, generations)) = read_sidecar(&item.path()) else { continue };
            if found.len() >= MAX_RESULTS {
                truncated = true;
                break;
            }
            found.push(Found { rel, abs, kind, history, generations });
        }
        if found.len() >= MAX_RESULTS && truncated {
            break;
        }
    }
    (found, truncated)
}

// ─── Empreintes et état des entrées ─────────────────────────────────────────

fn iso_ms(value: Option<&Value>) -> Option<i64> {
    let text = value?.as_str()?;
    chrono::DateTime::parse_from_rfc3339(text).ok().map(|d| d.timestamp_millis())
}

fn mtime_ms(meta: &std::fs::Metadata) -> Option<i64> {
    let modified = meta.modified().ok()?;
    let since = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(since.as_millis() as i64)
}

fn sha256_file(path: &Path) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(hex::encode(hasher.finalize()))
}

enum Hashed {
    Sha(String),
    /// Fichier au-dessus du plafond par fichier.
    TooBig,
    /// Budget de la demande épuisé, ou fichier illisible : on ne sait pas.
    Unknown,
}

/// Vérificateur d'une demande : il porte le budget d'octets relus.
struct Checker {
    budget: u64,
}

impl Default for Checker {
    fn default() -> Self {
        Self { budget: HASH_REQUEST_BUDGET_BYTES }
    }
}

impl Checker {
    /// Empreinte actuelle d'un fichier dans l'état (taille, date) donné.
    fn sha(&mut self, abs: &Path, size: u64, mtime: i64) -> Hashed {
        if let Ok(cache) = HASH_CACHE.lock() {
            if let Some((s, m, sha)) = cache.as_ref().and_then(|c| c.get(abs)) {
                if *s == size && *m == mtime {
                    return Hashed::Sha(sha.clone());
                }
            }
        }
        if size > HASH_FILE_MAX_BYTES {
            return Hashed::TooBig;
        }
        if size > self.budget {
            return Hashed::Unknown;
        }
        let Some(sha) = sha256_file(abs) else { return Hashed::Unknown };
        self.budget -= size;
        // Un fichier écrit à l'instant peut l'être encore dans le même tic
        // d'horloge sans que sa date bouge : son empreinte n'est gardée en
        // cache qu'une fois le fichier posé depuis quelques secondes.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        if now - mtime < HASH_SETTLE_MS {
            return Hashed::Sha(sha);
        }
        if let Ok(mut cache) = HASH_CACHE.lock() {
            let cache = cache.get_or_insert_with(HashMap::new);
            if cache.len() >= HASH_CACHE_MAX {
                cache.clear();
            }
            cache.insert(abs.to_path_buf(), (size, mtime, sha.clone()));
        }
        Hashed::Sha(sha)
    }
}

/// État d'une entrée de recette par rapport au disque.
struct InputState {
    /// Chemin tel que la recette l'écrit (relatif au projet, ou absolu).
    path: String,
    /// Chemin relatif au projet quand l'entrée y vit.
    rel: Option<String>,
    /// `unchanged`, `changed`, `missing` ou `unknown`.
    state: &'static str,
    /// Date de modification actuelle du fichier.
    modified: Option<i64>,
    size: Option<u64>,
    sha: Option<String>,
}

/// Chemin absolu d'une entrée et, si elle vit dans le projet, son chemin
/// relatif normalisé (celui d'un résultat).
fn resolve_input(root: &Path, path: &str) -> (PathBuf, Option<String>) {
    let given = Path::new(path);
    let abs = if given.is_absolute() { given.to_path_buf() } else { root.join(given) };
    let rel = abs
        .strip_prefix(root)
        .ok()
        .map(|rel| rel.to_string_lossy().replace('\\', "/"))
        .filter(|rel| valid_rel(rel));
    (abs, rel)
}

/// Règle « périmé », entrée par entrée :
/// 1. fichier absent → `missing` (on ne peut rien dire : disque non monté) ;
/// 2. taille différente → `changed` ;
/// 3. même taille et même date (à la seconde) que dans la recette →
///    `unchanged`, sans rien relire ;
/// 4. sinon, si la recette a une empreinte, on recalcule celle du fichier
///    (une fois par état, plafonnée) : égale → `unchanged`, différente →
///    `changed`, budget épuisé → `unknown` ;
/// 5. sans empreinte comparable (fichier trop gros) : la date tranche —
///    différente de celle de la recette, ou postérieure à la version quand la
///    recette n'a pas noté de date → `changed`.
fn input_state(root: &Path, input: &Value, version_ms: Option<i64>, checker: &mut Checker) -> Option<InputState> {
    let path = input.get("path")?.as_str()?.to_string();
    let (abs, rel) = resolve_input(root, &path);
    let recorded_size = input.get("size").and_then(Value::as_u64);
    let recorded_sha = input.get("sha256").and_then(Value::as_str).filter(|s| !s.is_empty());
    let recorded_mtime = iso_ms(input.get("mtime"));
    let mut out = InputState {
        path,
        rel,
        state: "missing",
        modified: None,
        size: recorded_size,
        sha: recorded_sha.map(str::to_string),
    };
    let Some(meta) = std::fs::metadata(&abs).ok().filter(|m| m.is_file()) else { return Some(out) };
    let modified = mtime_ms(&meta);
    out.modified = modified;
    let by_date = || match (recorded_mtime, modified, version_ms) {
        (Some(_), _, _) => "changed",
        (None, Some(now), Some(version)) if now > version => "changed",
        _ => "unchanged",
    };
    out.state = if recorded_size.is_some_and(|size| size != meta.len()) {
        "changed"
    } else if recorded_mtime.is_some() && recorded_mtime.map(|m| m / 1000) == modified.map(|m| m / 1000) {
        "unchanged"
    } else if let Some(expected) = recorded_sha {
        match checker.sha(&abs, meta.len(), modified.unwrap_or(0)) {
            Hashed::Sha(sha) if sha == expected => "unchanged",
            Hashed::Sha(_) => "changed",
            Hashed::TooBig => by_date(),
            Hashed::Unknown => "unknown",
        }
    } else {
        by_date()
    };
    Some(out)
}

/// Instant de la version, pour la règle de date : le début de la cellule
/// quand c'en est une (elle a lu ses entrées avant d'écrire), sinon la fin du
/// tour.
fn version_ms(entry: &Value) -> Option<i64> {
    iso_ms(entry.pointer("/cell/startedAt")).or_else(|| iso_ms(entry.get("ts")))
}

fn input_states(root: &Path, entry: &Value, checker: &mut Checker) -> Vec<InputState> {
    let version = version_ms(entry);
    entry
        .get("inputs")
        .and_then(Value::as_array)
        .map(|inputs| inputs.iter().filter_map(|i| input_state(root, i, version, checker)).collect())
        .unwrap_or_default()
}

// ─── Liste ──────────────────────────────────────────────────────────────────

fn first_str<'a>(entry: &'a Value, key: &str) -> Option<&'a str> {
    entry
        .get(key)?
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .find(|s| !s.trim().is_empty())
}

fn command_of(entry: &Value) -> Option<&str> {
    entry
        .get("command")
        .and_then(Value::as_str)
        .filter(|c| !c.trim().is_empty())
        .or_else(|| first_str(entry, "commands"))
}

/// D'où vient la version : cellule du noyau, script, commande, ou à défaut
/// le tour d'agent qui l'a écrite.
fn origin(entry: &Value) -> Value {
    if let Some(id) = entry.pointer("/cell/id").and_then(Value::as_u64) {
        return json!({"kind": "cell", "label": id.to_string(), "cell": id,
            "threadId": entry.pointer("/cell/threadId")});
    }
    let script = first_str(entry, "scripts");
    let command = command_of(entry);
    // Un document compilé (`tectonic main.tex`) se lit mieux par sa commande
    // que par son `.tex`.
    match (script, command) {
        (Some(script), _) if extension_lower(script) != "tex" => {
            json!({"kind": "script", "label": file_name(script), "path": script})
        }
        (_, Some(command)) => json!({"kind": "command", "label": command}),
        (Some(script), None) => json!({"kind": "script", "label": file_name(script), "path": script}),
        (None, None) => {
            let label = entry
                .get("threadTitle")
                .and_then(Value::as_str)
                .or_else(|| entry.get("provider").and_then(Value::as_str))
                .unwrap_or("");
            json!({"kind": "turn", "label": label, "threadId": entry.get("threadId")})
        }
    }
}

fn stale_of(states: &[InputState]) -> Value {
    let changed: Vec<&InputState> = states.iter().filter(|s| s.state == "changed").collect();
    match changed.first() {
        Some(first) => json!({
            "input": first.path,
            "name": file_name(&first.path),
            "changedAt": first.modified,
            "count": changed.len(),
        }),
        None => Value::Null,
    }
}

fn summary(found: &Found, states: &[InputState], starred: bool) -> Value {
    let entry = found.latest();
    let meta = std::fs::metadata(&found.abs).ok();
    let ts = iso_ms(entry.get("ts")).or_else(|| meta.as_ref().and_then(mtime_ms));
    json!({
        "path": found.rel,
        "name": found.name(),
        "kind": found.kind,
        "ext": extension_lower(&found.rel),
        "version": found.generations,
        "ts": ts,
        "size": meta.map(|m| m.len()),
        "origin": origin(entry),
        "starred": starred,
        "stale": stale_of(states),
    })
}

/// Liste des résultats du projet, du plus récent au plus ancien.
pub fn list_results(app_dir: &Path, root: &str) -> Result<Value, String> {
    if root.is_empty() {
        return Err("projet requis".into());
    }
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err("dossier du projet introuvable".into());
    }
    let (found, truncated) = scan(root_path);
    let (stars, stars_error) = match load_stars(app_dir, root) {
        Ok(stars) => (stars, None),
        Err(error) => (Vec::new(), Some(error)),
    };
    let stars: HashSet<&str> = stars.iter().map(String::as_str).collect();
    let mut checker = Checker::default();
    let mut results: Vec<Value> = found
        .iter()
        .map(|f| {
            let states = input_states(root_path, f.latest(), &mut checker);
            summary(f, &states, stars.contains(f.rel.as_str()))
        })
        .collect();
    results.sort_by_key(|r| std::cmp::Reverse(r["ts"].as_i64().unwrap_or(0)));
    Ok(json!({"results": results, "truncated": truncated, "starsError": stars_error}))
}

// ─── Détail ─────────────────────────────────────────────────────────────────

fn short(sha: &str) -> String {
    sha.chars().take(7).collect()
}

/// Largeur et hauteur d'un PNG, lues dans son en-tête (24 octets).
fn png_size(path: &Path) -> Option<(u32, u32)> {
    let mut head = [0u8; 24];
    std::fs::File::open(path).ok()?.read_exact(&mut head).ok()?;
    if &head[..8] != b"\x89PNG\r\n\x1a\n" || &head[12..16] != b"IHDR" {
        return None;
    }
    let number = |at: usize| u32::from_be_bytes([head[at], head[at + 1], head[at + 2], head[at + 3]]);
    Some((number(16), number(20)))
}

fn valid_hex(value: &str) -> bool {
    (4..=64).contains(&value.len()) && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Arbre Git de fin du tour qui a écrit cette version, lu dans le journal des
/// tours : c'est l'état « après » que le diff de l'historique sait relire.
fn end_tree<'a>(entry: &Value, ledger: &'a [Value]) -> Option<&'a str> {
    fn text<'v>(value: &'v Value, key: &str) -> Option<&'v str> {
        value.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
    }
    let turn = text(entry, "turnId");
    let thread = text(entry, "threadId");
    let snapshot = text(entry, "snapshotSha");
    ledger
        .iter()
        .find(|line| match turn {
            Some(turn) => text(line, "turnId") == Some(turn),
            None => thread.is_some() && snapshot.is_some()
                && text(line, "threadId") == thread && text(line, "snapshotSha") == snapshot,
        })
        .and_then(|line| text(line, "endTree"))
        .filter(|sha| valid_hex(sha))
}

fn recipe_json(entry: &Value, states: &[InputState], results: &HashSet<&str>) -> Value {
    let script = first_str(entry, "scripts");
    let script_sha = script.and_then(|path| {
        entry
            .get("scriptVersions")?
            .as_array()?
            .iter()
            .find(|v| v.get("path").and_then(Value::as_str) == Some(path))?
            .get("sha256")?
            .as_str()
            .map(short)
    });
    let env = entry.get("env").cloned().unwrap_or(Value::Null);
    // Env pixi (verrou noté dans la recette) avant conda : c'est lui qui fixe
    // tout l'env, et c'est son empreinte de verrou que l'écran montre.
    let pixi = env.get("pixi").and_then(Value::as_str);
    let conda = env.get("conda").and_then(Value::as_str);
    let env_name = pixi
        .or(conda)
        .or_else(|| entry.pointer("/cell/env").and_then(Value::as_str));
    let env_manager = if pixi.is_some() {
        Some("pixi")
    } else if conda.is_some() {
        Some("conda")
    } else {
        None
    };
    let env_lock = env.pointer("/lock/sha256").and_then(Value::as_str).map(short);
    let inputs: Vec<Value> = states
        .iter()
        .map(|s| json!({
            "path": s.path,
            "name": file_name(&s.path),
            "sha": s.sha.as_deref().map(short),
            "size": s.size,
            "state": s.state,
            "changedAt": s.modified,
            "result": s.rel.as_deref().is_some_and(|rel| results.contains(rel)),
        }))
        .collect();
    json!({
        "script": script.map(|path| json!({"path": path, "sha": script_sha})),
        "command": command_of(entry),
        "cell": entry.get("cell").filter(|c| c.is_object()).map(|c| json!({
            "id": c.get("id"), "purpose": c.get("purpose"), "env": c.get("env"),
            "author": c.get("author"), "threadId": c.get("threadId"),
        })),
        "inputs": inputs,
        "env": {
            "name": env_name,
            "manager": env_manager,
            "lock": env_lock,
            "python": env.get("python").and_then(Value::as_str),
            "sha": env.get("snapshotSha256").and_then(Value::as_str).map(short),
            "packages": env.get("packages").and_then(Value::as_object).map(|p| p.len()).unwrap_or(0),
        },
        "threadId": entry.get("threadId"),
        "threadTitle": entry.get("threadTitle"),
        "head": entry.get("head").and_then(Value::as_str).map(short),
    })
}

/// Détail d'un résultat : recette complète, versions, liens.
pub fn result_detail(app_dir: &Path, root: &str, rel: &str, ledger: &[Value]) -> Result<Value, String> {
    if root.is_empty() {
        return Err("projet requis".into());
    }
    if !valid_rel(rel) || result_kind(rel).is_none() {
        return Err("chemin invalide".into());
    }
    let root_path = Path::new(root);
    let (found, _) = scan(root_path);
    let Some(target) = found.iter().find(|f| f.rel == rel) else {
        return Err("résultat introuvable".into());
    };
    let starred = load_stars(app_dir, root).unwrap_or_default().iter().any(|p| p == rel);
    let mut checker = Checker::default();
    let states = input_states(root_path, target.latest(), &mut checker);
    let by_rel: HashMap<&str, &Found> = found.iter().map(|f| (f.rel.as_str(), f)).collect();
    let known: HashSet<&str> = by_rel.keys().copied().collect();

    let depends_on: Vec<Value> = states
        .iter()
        .filter_map(|s| s.rel.as_deref())
        .filter(|rel| *rel != target.rel)
        .filter_map(|rel| by_rel.get(rel))
        .map(|f| f.brief())
        .collect();
    let used_by: Vec<Value> = found
        .iter()
        .filter(|other| other.rel != target.rel)
        .filter(|other| {
            other.latest().get("inputs").and_then(Value::as_array).is_some_and(|inputs| {
                inputs
                    .iter()
                    .filter_map(|i| i.get("path").and_then(Value::as_str))
                    .any(|path| resolve_input(root_path, path).1.as_deref() == Some(rel))
            })
        })
        .map(|f| f.brief())
        .collect();

    // « Comparer » : seulement pour un résultat texte, et seulement quand
    // l'état de la version existe encore dans le dépôt (arbre de fin de tour).
    let comparable = TEXT_EXTS.contains(&extension_lower(rel).as_str()) && atelier_workspace::is_repo(root);
    let diff_path = comparable
        .then(|| atelier_workspace::history_base(root).ok())
        .flatten()
        .map(|(_, prefix)| format!("{prefix}{rel}"));
    let versions: Vec<Value> = target
        .history
        .iter()
        .enumerate()
        .map(|(index, entry)| {
            let compare = (index > 0)
                .then(|| end_tree(entry, ledger))
                .flatten()
                .filter(|_| diff_path.is_some())
                .filter(|sha| atelier_workspace::history_object_exists(root, sha))
                .map(|sha| json!({"git": sha}));
            json!({
                "version": target.generations.saturating_sub(index as u64),
                "ts": iso_ms(entry.get("ts")),
                "current": index == 0,
                "origin": origin(entry),
                "compare": compare,
            })
        })
        .collect();

    let mut result = summary(target, &states, starred);
    let (width, height) = match png_size(&target.abs) {
        Some((w, h)) => (Some(w), Some(h)),
        None => (None, None),
    };
    result["width"] = json!(width);
    result["height"] = json!(height);
    result["abs"] = json!(target.abs.to_string_lossy());
    result["sidecar"] = json!(format!("{}{SIDECAR_SUFFIX}", target.abs.to_string_lossy()));
    result["recipe"] = recipe_json(target.latest(), &states, &known);
    result["entry"] = target.latest().clone();
    result["versions"] = json!(versions);
    result["versionCount"] = json!(target.generations);
    result["diffPath"] = json!(diff_path);
    result["dependsOn"] = json!(depends_on);
    result["usedBy"] = json!(used_by);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prov::TurnProvenance;
    use std::time::{Duration, SystemTime};
    use tempfile::tempdir;

    fn write(root: &Path, rel: &str, body: &str) -> PathBuf {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, body).unwrap();
        path
    }

    /// Fixe la date de modification d'un fichier : la recette la note à la
    /// seconde, les tests ne peuvent pas compter sur l'horloge.
    fn set_mtime(path: &Path, secs_ago: u64) {
        let when = SystemTime::now() - Duration::from_secs(secs_ago);
        std::fs::File::options().write(true).open(path).unwrap().set_modified(when).unwrap();
    }

    /// Un tour d'agent qui lance `command` et produit `outputs`.
    fn turn(root: &Path, thread: &str, command: &str, outputs: &[&str]) {
        let prov = TurnProvenance::new(thread.into(), Some("Figures du chapitre 1".into()), "claude".into(), None, "trace".into());
        prov.note_event(&json!({"kind": "tool_update", "name": "Bash", "input": {"command": command}}));
        let changed: Vec<String> = outputs.iter().map(|s| s.to_string()).collect();
        let written = prov.write_recipes(root.to_str().unwrap(), None, &changed);
        assert_eq!(written.len(), outputs.len(), "recettes écrites");
    }

    fn sidecar(root: &Path, rel: &str, document: Value) {
        write(root, &format!("{rel}{SIDECAR_SUFFIX}"), &serde_json::to_string_pretty(&document).unwrap());
    }

    fn by_path<'a>(listed: &'a Value, rel: &str) -> &'a Value {
        listed["results"]
            .as_array()
            .unwrap()
            .iter()
            .find(|r| r["path"] == rel)
            .unwrap_or_else(|| panic!("{rel} absent de {listed}"))
    }

    /// Projet d'exemple : un script lit un parquet et un CSV, écrit une figure.
    fn project() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let dir = tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap().join("these");
        let app = std::fs::canonicalize(dir.path()).unwrap().join("app");
        std::fs::create_dir_all(&app).unwrap();
        write(&root, "data/panel.parquet", "PAR1-aaaa");
        write(&root, "out/tendances.csv", "region,pente\nsask,-0.02\n");
        write(
            &root,
            "analysis/fig3_regional.py",
            "import pandas as pd\ndf = pd.read_parquet('data/panel.parquet')\nt = pd.read_csv('out/tendances.csv')\n",
        );
        write(&root, "figures/fig3_regional.png", "png");
        set_mtime(&root.join("data/panel.parquet"), 3600);
        set_mtime(&root.join("out/tendances.csv"), 3600);
        turn(&root, "th-1", "python analysis/fig3_regional.py --annees 2002-2023", &["figures/fig3_regional.png"]);
        (dir, root, app)
    }

    #[test]
    fn liste_version_origine_et_etoile() {
        let (_dir, root, app) = project();
        let r = root.to_str().unwrap();
        // Un tableau écrit par une cellule du noyau, un PDF compilé, et des
        // fichiers qui ne sont pas des résultats.
        sidecar(&root, "out/tendances.csv", json!({"version": 2, "figure": "out/tendances.csv", "generations": 27,
            "history": [
                {"ts": "2026-11-08T01:25:00Z", "kind": "table", "cell": {"id": 29, "threadId": "th-1", "env": "pymc-albedo"}, "inputs": []},
                {"ts": "2026-11-07T10:00:00Z", "kind": "table", "cell": {"id": 12, "threadId": "th-1"}, "inputs": []},
            ]}));
        write(&root, "main.tex", "\\includegraphics{figures/fig3_regional.png}\n");
        write(&root, "main.pdf", "%PDF");
        turn(&root, "th-2", "tectonic main.tex", &["main.pdf", "main.tex"]);
        write(&root, ".fig_thumbs/cache.png", "x");
        sidecar(&root, ".fig_thumbs/cache.png", json!({"history": [{"ts": "2026-11-09T00:00:00Z"}]}));
        sidecar(&root, "figures/supprimee.png", json!({"history": [{"ts": "2026-11-09T00:00:00Z"}]}));
        write(&root, "figures/cassee.png", "x");
        write(&root, "figures/cassee.png.prov.json", "{pas du json");

        let listed = list_results(&app, r).unwrap();
        let paths: Vec<&str> = listed["results"].as_array().unwrap().iter().map(|x| x["path"].as_str().unwrap()).collect();
        assert_eq!(paths.len(), 3, "{paths:?}");
        assert!(!paths.contains(&"main.tex"), "un .tex est une source, pas un résultat");
        assert_eq!(listed["truncated"], false);

        let fig = by_path(&listed, "figures/fig3_regional.png");
        assert_eq!(fig["kind"], "figure");
        assert_eq!(fig["name"], "fig3_regional.png");
        assert_eq!(fig["version"], 1);
        assert_eq!(fig["origin"], json!({"kind": "script", "label": "fig3_regional.py", "path": "analysis/fig3_regional.py"}));
        assert_eq!(fig["starred"], false);
        assert_eq!(fig["stale"], Value::Null);
        assert!(fig["ts"].as_i64().unwrap() > 0);

        let table = by_path(&listed, "out/tendances.csv");
        assert_eq!(table["kind"], "table");
        assert_eq!(table["version"], 27, "le compteur survit au plafond de history");
        assert_eq!(table["origin"]["kind"], "cell");
        assert_eq!(table["origin"]["label"], "29");

        let pdf = by_path(&listed, "main.pdf");
        assert_eq!(pdf["kind"], "pdf");
        assert_eq!(pdf["origin"], json!({"kind": "command", "label": "tectonic main.tex"}));

        // Plus récent en tête.
        let ts: Vec<i64> = listed["results"].as_array().unwrap().iter().map(|x| x["ts"].as_i64().unwrap()).collect();
        assert!(ts.windows(2).all(|w| w[0] >= w[1]), "{ts:?}");

        set_star(&app, r, "figures/fig3_regional.png", true).unwrap();
        set_star(&app, r, "main.pdf", true).unwrap();
        set_star(&app, r, "main.pdf", false).unwrap();
        let listed = list_results(&app, r).unwrap();
        assert_eq!(by_path(&listed, "figures/fig3_regional.png")["starred"], true);
        assert_eq!(by_path(&listed, "main.pdf")["starred"], false);
        assert!(set_star(&app, r, "../ailleurs.png", true).is_err());
        assert!(set_star(&app, r, "/abs/fig.png", true).is_err());
    }

    #[test]
    fn perime_quand_une_entree_directe_change() {
        let (_dir, root, app) = project();
        let r = root.to_str().unwrap();
        let fig = "figures/fig3_regional.png";
        let panel = root.join("data/panel.parquet");
        let stale = |label: &str| {
            let listed = list_results(&app, r).unwrap();
            let s = by_path(&listed, fig)["stale"].clone();
            eprintln!("{label} : {s}");
            s
        };
        assert_eq!(stale("au départ"), Value::Null);

        // Même contenu, date changée (un `touch`) : l'empreinte est recalculée
        // et le résultat reste à jour.
        set_mtime(&panel, 60);
        assert_eq!(stale("touch"), Value::Null);

        // Même taille, contenu différent : périmé, avec l'entrée et sa date.
        std::fs::write(&panel, "PAR1-bbbb").unwrap();
        set_mtime(&panel, 30);
        let s = stale("contenu");
        assert_eq!(s["input"], "data/panel.parquet");
        assert_eq!(s["name"], "panel.parquet");
        assert_eq!(s["count"], 1);
        assert_eq!(s["changedAt"].as_i64(), mtime_ms(&std::fs::metadata(&panel).unwrap()));

        // Le détail marque la seule entrée modifiée.
        let detail = result_detail(&app, r, fig, &[]).unwrap();
        let states: Vec<(&str, &str)> = detail["recipe"]["inputs"]
            .as_array()
            .unwrap()
            .iter()
            .map(|i| (i["path"].as_str().unwrap(), i["state"].as_str().unwrap()))
            .collect();
        assert_eq!(states, vec![("data/panel.parquet", "changed"), ("out/tendances.csv", "unchanged")]);
        assert_eq!(detail["stale"]["input"], "data/panel.parquet");

        // Taille différente : périmé sans même relire le fichier.
        std::fs::write(&panel, "PAR1-plus-long").unwrap();
        assert_eq!(stale("taille")["count"], 1);

        // Deux entrées changées : la première nommée, le compte suit.
        std::fs::write(root.join("out/tendances.csv"), "region,pente\n").unwrap();
        let s = stale("deux");
        assert_eq!(s["count"], 2);
        assert_eq!(s["input"], "data/panel.parquet");

        // Entrée absente (disque non monté) : on ne conclut pas « périmé ».
        std::fs::remove_file(&panel).unwrap();
        let s = stale("absente");
        assert_eq!(s["input"], "out/tendances.csv");
        assert_eq!(s["count"], 1);
        let detail = result_detail(&app, r, fig, &[]).unwrap();
        assert_eq!(detail["recipe"]["inputs"][0]["state"], "missing");

        // Régénérer le résultat le remet à jour.
        write(&root, "data/panel.parquet", "PAR1-cccc");
        turn(&root, "th-1", "python analysis/fig3_regional.py --annees 2002-2023", &[fig]);
        assert_eq!(stale("régénéré"), Value::Null);
        assert_eq!(by_path(&list_results(&app, r).unwrap(), fig)["version"], 2);
    }

    #[test]
    fn entree_d_une_cellule_sans_date_notee() {
        let dir = tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let r = root.to_str().unwrap();
        let data = write(&root, "data/albedo.nc", "netcdf-1");
        write(&root, "out/albedo_aout.csv", "x\n");
        let sha = sha256_file(&data).unwrap();
        // Recette de cellule : taille et empreinte, pas de date.
        sidecar(&root, "out/albedo_aout.csv", json!({"history": [{
            "ts": "2026-11-09T13:58:00Z", "cell": {"id": 27, "startedAt": "2026-11-09T13:57:50Z"},
            "inputs": [{"path": "data/albedo.nc", "size": 8, "sha256": sha}],
        }]}));
        let stale = || by_path(&list_results(&root, r).unwrap(), "out/albedo_aout.csv")["stale"].clone();
        assert_eq!(stale(), Value::Null);
        std::fs::write(&data, "netcdf-2").unwrap();
        assert_eq!(stale()["input"], "data/albedo.nc");
        // Sans empreinte ni date notées, la date du fichier tranche : modifié
        // après la version.
        sidecar(&root, "out/albedo_aout.csv", json!({"history": [{
            "ts": "2026-11-09T13:58:00Z", "inputs": [{"path": "data/albedo.nc", "size": 8}],
        }]}));
        assert_eq!(stale()["input"], "data/albedo.nc");
        sidecar(&root, "out/albedo_aout.csv", json!({"history": [{
            "ts": "2099-01-01T00:00:00Z", "inputs": [{"path": "data/albedo.nc", "size": 8}],
        }]}));
        assert_eq!(stale(), Value::Null);
    }

    #[test]
    fn detail_recette_versions_et_liens() {
        let (_dir, root, app) = project();
        let r = root.to_str().unwrap();
        let fig = "figures/fig3_regional.png";
        // Le CSV lu par la figure est lui-même un résultat ; un PDF inclut la
        // figure.
        sidecar(&root, "out/tendances.csv", json!({"generations": 4, "history": [
            {"ts": "2026-11-08T01:25:00Z", "cell": {"id": 29}, "inputs": []}]}));
        write(&root, "main.tex", "\\includegraphics{figures/fig3_regional}\n");
        write(&root, "main.pdf", "%PDF");
        turn(&root, "th-2", "tectonic main.tex", &["main.pdf"]);
        // Une vraie figure PNG de 3 × 2 pixels (en-tête seul).
        let mut png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR".to_vec();
        png.extend_from_slice(&3u32.to_be_bytes());
        png.extend_from_slice(&2u32.to_be_bytes());
        std::fs::write(root.join(fig), &png).unwrap();
        turn(&root, "th-1", "python analysis/fig3_regional.py --annees 2002-2023", &[fig]);

        let detail = result_detail(&app, r, fig, &[]).unwrap();
        assert_eq!(detail["version"], 2);
        assert_eq!((detail["width"].as_u64(), detail["height"].as_u64()), (Some(3), Some(2)));
        assert_eq!(detail["abs"], root.join(fig).to_str().unwrap());
        assert_eq!(detail["sidecar"], format!("{}.prov.json", root.join(fig).to_str().unwrap()));
        let recipe = &detail["recipe"];
        assert_eq!(recipe["script"]["path"], "analysis/fig3_regional.py");
        assert_eq!(recipe["script"]["sha"].as_str().unwrap().len(), 7);
        assert_eq!(recipe["command"], "python analysis/fig3_regional.py --annees 2002-2023");
        assert_eq!(recipe["inputs"].as_array().unwrap().len(), 2);
        assert_eq!(recipe["inputs"][0]["sha"].as_str().unwrap().len(), 7);
        assert_eq!(recipe["inputs"][0]["result"], false);
        assert_eq!(recipe["inputs"][1]["result"], true, "tendances.csv est un résultat");
        assert_eq!(detail["entry"]["command"], recipe["command"]);

        let versions = detail["versions"].as_array().unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!((versions[0]["version"].as_u64(), versions[0]["current"].as_bool()), (Some(2), Some(true)));
        assert_eq!((versions[1]["version"].as_u64(), versions[1]["current"].as_bool()), (Some(1), Some(false)));
        // Une figure n'a pas de diff texte : pas de « Comparer ».
        assert!(versions.iter().all(|v| v["compare"].is_null()));

        assert_eq!(detail["dependsOn"], json!([{"path": "out/tendances.csv", "name": "tendances.csv", "kind": "table", "version": 4}]));
        assert_eq!(detail["usedBy"], json!([{"path": "main.pdf", "name": "main.pdf", "kind": "pdf", "version": 1}]));

        // Le PDF dépend de la figure ; régénérer la figure le périme.
        let pdf = result_detail(&app, r, "main.pdf", &[]).unwrap();
        assert_eq!(pdf["dependsOn"][0]["path"], fig);
        assert_eq!(pdf["stale"]["input"], fig);

        // Une cellule du noyau sous l'env pixi : l'écran nomme pixi et montre
        // l'empreinte du verrou.
        let csv = result_detail(&app, r, "out/tendances.csv", &[]).unwrap();
        assert_eq!(csv["recipe"]["env"]["manager"], Value::Null, "ni pixi ni conda noté");
        write(&root, "out/pixi.csv", "a,b\n");
        sidecar(&root, "out/pixi.csv", json!({"history": [{"ts": "2026-11-10T10:00:00Z", "cell": {"id": 3, "env": "atelier"},
            "inputs": [], "env": {"pixi": "atelier", "python": "3.12.7",
                "lock": {"file": "python/pixi.lock", "sha256": "0123456789abcdef0123456789abcdef"}}}]}));
        let pixi = result_detail(&app, r, "out/pixi.csv", &[]).unwrap();
        assert_eq!(pixi["recipe"]["env"]["name"], "atelier");
        assert_eq!(pixi["recipe"]["env"]["manager"], "pixi");
        assert_eq!(pixi["recipe"]["env"]["lock"], "0123456");

        assert!(result_detail(&app, r, "figures/inconnue.png", &[]).is_err());
        assert!(result_detail(&app, r, "../fig.png", &[]).is_err());
        assert!(result_detail(&app, r, "main.tex", &[]).is_err());
    }

    #[test]
    fn comparer_une_ancienne_version_d_un_tableau() {
        use std::process::Command;
        let dir = tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let r = root.to_str().unwrap().to_string();
        let git = |args: &[&str]| {
            assert!(Command::new("git").args(args).current_dir(&root)
                .env("GIT_AUTHOR_NAME", "T").env("GIT_AUTHOR_EMAIL", "t@t")
                .env("GIT_COMMITTER_NAME", "T").env("GIT_COMMITTER_EMAIL", "t@t")
                .status().unwrap().success());
        };
        git(&["init", "-q"]);
        write(&root, "README.md", "x\n");
        git(&["add", "README.md"]);
        git(&["commit", "-q", "-m", "premier"]);
        let snap = atelier_workspace::snapshot(&r).unwrap();
        write(&root, "out/stats.csv", "a,b\n1,2\n");
        let (_, end_tree) = atelier_workspace::changed_since_stats_and_tree(&r, &snap).unwrap();
        write(&root, "out/stats.csv", "a,b\n1,3\n");
        sidecar(&root, "out/stats.csv", json!({"history": [
            {"ts": "2026-11-09T12:00:00Z", "threadId": "t1", "turnId": "u2", "snapshotSha": snap},
            {"ts": "2026-11-08T12:00:00Z", "threadId": "t1", "turnId": "u1", "snapshotSha": snap},
            {"ts": "2026-11-07T12:00:00Z", "threadId": "t1", "turnId": "u0", "snapshotSha": snap},
        ]}));
        let ledger = vec![
            json!({"threadId": "t1", "turnId": "u1", "snapshotSha": snap, "endTree": end_tree}),
            json!({"threadId": "t1", "turnId": "u0", "snapshotSha": snap, "endTree": "0000000000000000000000000000000000000000"}),
        ];
        let detail = result_detail(&root, &r, "out/stats.csv", &ledger).unwrap();
        assert_eq!(detail["diffPath"], "out/stats.csv");
        let versions = detail["versions"].as_array().unwrap();
        assert!(versions[0]["compare"].is_null(), "la version courante ne se compare pas à elle-même");
        assert_eq!(versions[1]["compare"], json!({"git": end_tree}));
        assert!(versions[2]["compare"].is_null(), "arbre élagué : pas de bouton");
        let before = atelier_workspace::history_read(&r, &end_tree, "out/stats.csv").unwrap();
        assert_eq!(before, atelier_workspace::HistoryText::Text("a,b\n1,2\n".into()));
    }

    #[test]
    fn etoiles_illisibles_jamais_ecrasees() {
        use atelier_store::durable::{corrupt_copies_of, UNREADABLE_SAMPLES};
        for (label, raw) in UNREADABLE_SAMPLES {
            let (_dir, root, app) = project();
            let r = root.to_str().unwrap();
            let path = star_path(&app, r);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, raw).unwrap();
            let error = set_star(&app, r, "figures/fig3_regional.png", true).unwrap_err();
            assert!(error.contains("illisible"), "{label} : {error}");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), raw, "{label} : store intact");
            assert_eq!(corrupt_copies_of(&path, raw.as_bytes()), 1, "{label} : copie mise de côté");
            // La liste reste lisible, sans étoile, et dit pourquoi.
            let listed = list_results(&app, r).unwrap();
            assert_eq!(listed["results"].as_array().unwrap().len(), 1, "{label}");
            assert_eq!(listed["results"][0]["starred"], false, "{label}");
            assert!(listed["starsError"].as_str().unwrap().contains("illisible"), "{label}");
        }
    }

    /// Tous les fichiers du dossier, avec leur contenu.
    fn snapshot(dir: &Path) -> Vec<(PathBuf, Vec<u8>)> {
        let mut out = Vec::new();
        let mut queue = vec![dir.to_path_buf()];
        while let Some(current) = queue.pop() {
            for item in std::fs::read_dir(&current).unwrap().flatten() {
                let path = item.path();
                if path.is_dir() {
                    queue.push(path);
                } else {
                    out.push((path.clone(), std::fs::read(&path).unwrap()));
                }
            }
        }
        out.sort();
        out
    }

    #[test]
    fn rien_n_est_ecrit_dans_le_projet() {
        let (_dir, root, app) = project();
        let r = root.to_str().unwrap();
        write(&root, "figures/cassee.png", "x");
        write(&root, "figures/cassee.png.prov.json", "");
        std::fs::write(root.join("data/panel.parquet"), "PAR1-bbbb").unwrap();
        let before = snapshot(&root);
        list_results(&app, r).unwrap();
        result_detail(&app, r, "figures/fig3_regional.png", &[]).unwrap();
        set_star(&app, r, "figures/fig3_regional.png", true).unwrap();
        list_results(&app, r).unwrap();
        assert_eq!(snapshot(&root), before, "le dossier du projet est intact");
        assert!(star_path(&app, r).is_file(), "l'étoile vit dans le dossier de l'app");
    }

    #[test]
    fn parcours_borne_et_dossiers_ignores() {
        let dir = tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let recipe = json!({"history": [{"ts": "2026-11-09T00:00:00Z"}]});
        for rel in ["a/fig.png", "node_modules/pkg/fig.png", ".venv/fig.png", "annotations/fig.png", "a/_view_x.png"] {
            write(&root, rel, "x");
            sidecar(&root, rel, recipe.clone());
        }
        // Trop profond pour être parcouru.
        let deep = format!("{}/fig.png", (0..=MAX_DEPTH).map(|i| format!("d{i}")).collect::<Vec<_>>().join("/"));
        write(&root, &deep, "x");
        sidecar(&root, &deep, recipe);
        let (found, truncated) = scan(&root);
        assert_eq!(found.iter().map(|f| f.rel.as_str()).collect::<Vec<_>>(), vec!["a/fig.png"]);
        assert!(!truncated);
    }

    #[tokio::test]
    async fn messages_du_routeur() {
        let dir = tempdir().unwrap();
        let app = dir.path().join("app");
        std::fs::create_dir_all(&app).unwrap();
        let root = dir.path().join("proj");
        write(&root, "fig.png", "x");
        sidecar(&root, "fig.png", json!({"history": [{"ts": "2026-11-09T00:00:00Z", "command": "python plot.py"}]}));
        let state = AppState::new(
            crate::AppPaths::from_app_dir(app.clone()),
            None,
            "t".into(),
            "0.1.0".into(),
            "h".into(),
            "/tmp".into(),
        );
        let r = root.to_str().unwrap();
        let ask = |kind: &str, extra: Value| {
            let mut msg = json!({"type": kind, "projectRoot": r, "requestId": "q1"});
            for (k, v) in extra.as_object().unwrap() {
                msg[k] = v.clone();
            }
            msg.to_string()
        };
        let reply = |out: Vec<String>| serde_json::from_str::<Value>(&out[0]).unwrap();

        // Recettes éteintes par défaut : la liste le dit, et montre quand même
        // les recettes déjà présentes.
        let listed = reply(crate::ws_router::route_ws(&state, &ask("projectResults", json!({}))).await);
        assert_eq!(listed["type"], "projectResults");
        assert_eq!(listed["requestId"], "q1");
        assert_eq!(listed["recipes"], false);
        assert_eq!(listed["results"][0]["path"], "fig.png");

        std::fs::write(state.settings_path(), r#"{"recipes": true}"#).unwrap();
        let listed = reply(crate::ws_router::route_ws(&state, &ask("projectResults", json!({}))).await);
        assert_eq!(listed["recipes"], true);

        let starred = reply(crate::ws_router::route_ws(&state, &ask("projectResultStar", json!({"path": "fig.png", "starred": true}))).await);
        assert_eq!((starred["type"].as_str(), starred["ok"].as_bool()), (Some("projectResultStarred"), Some(true)));
        let detail = reply(crate::ws_router::route_ws(&state, &ask("projectResultDetail", json!({"path": "fig.png"}))).await);
        assert_eq!(detail["type"], "projectResultDetail");
        assert_eq!(detail["result"]["starred"], true);
        assert_eq!(detail["result"]["origin"]["label"], "python plot.py");
        let missing = reply(crate::ws_router::route_ws(&state, &ask("projectResultDetail", json!({"path": "absent.png"}))).await);
        assert!(missing["error"].as_str().unwrap().contains("introuvable"));
    }
}
