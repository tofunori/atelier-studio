//! Port de `KnowledgeStore` (`sidecar/knowledge.mjs`) — registre
//! `knowledge.json` (v2) + cache d'extraction en pages + verrou
//! inter-processus. Store local (vague 1) + gbrain/article-local (vague 2) +
//! `web` en fetch réel (vague 3, groupe d) : seuls `youtube`/`zotero`
//! restent hors périmètre et lèvent une erreur explicite si invoqués.

use crate::csv_digest::{csv_digest, js_len, CSV_FULL_MAX};
use crate::folder::{folder_fingerprint, scan_folder, FolderFile};
use crate::pdf::extract_pdf_pages;
use crate::search::{search_passages, Page};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use unicode_normalization::UnicodeNormalization;

const REGISTRY_VERSION: u64 = 2;
const PAGES_CACHE_VERSION: u64 = 1;
const LOCK_TIMEOUT: Duration = Duration::from_millis(3000);
const LOCK_STALE: Duration = Duration::from_millis(10_000);

pub const KB_KINDS: &[&str] = &["file", "pdf", "web", "note", "folder", "youtube", "gbrain", "zotero"];
const TEXT_EXTS: &[&str] = &[".md", ".tex", ".txt"];
const TABLE_EXTS: &[&str] = &[".csv", ".tsv"];

/// Miroir de `defaultKnowledgeDir()` : `$ATELIER_APP_DIR/knowledge`, à
/// défaut `~/Library/Application Support/atelier-studio/knowledge`.
pub fn default_knowledge_dir() -> PathBuf {
    let app_dir = std::env::var("ATELIER_APP_DIR").ok().filter(|s| !s.is_empty()).map(PathBuf::from).unwrap_or_else(|| {
        dirs_home().join("Library").join("Application Support").join("atelier-studio")
    });
    app_dir.join("knowledge")
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/"))
}

/// Ajoute `warning` à la réponse si le registre a été récupéré d'une
/// corruption (miroir de `flag()` dans kb_cli.mjs) — utilisé par
/// list/collection/tag/archive/remove/search/add uniquement.
pub fn flag(mut base: Value, warning: &Option<String>) -> Value {
    if let Some(w) = warning {
        if let Some(obj) = base.as_object_mut() {
            obj.insert("warning".into(), json!(w));
        }
    }
    base
}

pub fn source_id(kind: &str, key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{kind}\n{key}").as_bytes());
    hex::encode(hasher.finalize())[..8].to_string()
}

/// Miroir de `collectionSlug` : NFKD, retrait diacritiques, minuscule,
/// non-alphanum -> `-`, trim des tirets, 40 caractères max.
pub fn collection_slug(title: &str) -> String {
    let decomposed: String = title.nfkd().collect();
    let stripped: String = decomposed.chars().filter(|c| !('\u{0300}'..='\u{036f}').contains(c)).collect();
    let lower = stripped.to_lowercase();
    let mut out = String::new();
    let mut last_dash = false;
    for c in lower.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    let capped: String = trimmed.chars().take(40).collect();
    capped
}

fn now_iso() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let dt = chrono::DateTime::<chrono::Utc>::from(UNIX_EPOCH + now);
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let mut tmp_name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    tmp_name.push(format!(".{}.{}.tmp", std::process::id(), ts));
    let tmp = path.with_file_name(tmp_name);
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Garde RAII du verrou mkdir de `with_lock` — libère `.lock` même si la
/// fermeture protégée panique (unwind), voir `with_lock`.
struct LockGuard {
    lock_dir: PathBuf,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.lock_dir);
    }
}

pub struct KnowledgeStore {
    pub dir: PathBuf,
    registry_path: PathBuf,
    cache_dir: PathBuf,
    pdf_cache_dir: PathBuf,
    lock_dir: PathBuf,
    pub sources: Map<String, Value>,
    pub source_order: Vec<String>,
    pub collections: Vec<Value>,
    pub warning: Option<String>,
}

impl KnowledgeStore {
    pub fn open(dir: PathBuf) -> Self {
        let mut store = KnowledgeStore {
            registry_path: dir.join("knowledge.json"),
            cache_dir: dir.join("cache"),
            pdf_cache_dir: dir.join("pdf-cache"),
            lock_dir: dir.join(".lock"),
            dir,
            sources: Map::new(),
            source_order: Vec::new(),
            collections: Vec::new(),
            warning: None,
        };
        store.reload_from_disk();
        store
    }

    fn reload_from_disk(&mut self) {
        self.sources = Map::new();
        self.source_order.clear();
        self.collections = Vec::new();
        let raw = match std::fs::read_to_string(&self.registry_path) {
            Ok(r) => r,
            Err(_) => return,
        };
        match serde_json::from_str::<Value>(&raw) {
            Ok(parsed) => {
                self.collections = parsed
                    .get("collections")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|c| c.get("slug").and_then(Value::as_str).map(|s| !s.is_empty()).unwrap_or(false))
                    .collect();
                if let Some(sources) = parsed.get("sources").and_then(Value::as_array) {
                    for entry in sources {
                        let Some(id) = entry.get("id").and_then(Value::as_str) else { continue };
                        if id.is_empty() {
                            continue;
                        }
                        let mut obj = entry.as_object().cloned().unwrap_or_default();
                        if !obj.get("collections").map(|v| v.is_array()).unwrap_or(false) {
                            obj.insert("collections".into(), json!([]));
                        }
                        let archived = obj.get("archived").and_then(Value::as_bool).unwrap_or(false);
                        obj.insert("archived".into(), json!(archived));
                        self.source_order.push(id.to_string());
                        self.sources.insert(id.to_string(), Value::Object(obj));
                    }
                }
            }
            Err(_) => {
                let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
                let backup = self.registry_path.with_file_name(format!(
                    "knowledge.json.corrupt-{ts}"
                ));
                if std::fs::rename(&self.registry_path, &backup).is_ok() {
                    let name = backup.file_name().unwrap().to_string_lossy().into_owned();
                    self.warning = Some(format!(
                        "Registre illisible — sauvegardé dans {name}, base repartie à vide"
                    ));
                } else {
                    self.warning =
                        Some("Registre illisible et non sauvegardable — base repartie à vide".to_string());
                }
                eprintln!("[atelier-kb] {}", self.warning.as_deref().unwrap_or(""));
            }
        }
    }

    /// Verrou mkdir inter-processus. Un seul appel par invocation CLI, donc
    /// pas de ré-entrance à gérer (contrairement au sidecar Node qui peut
    /// vivre plusieurs commandes dans le même process via `runKbCommand`).
    /// Libéré via `LockGuard` (RAII, `Drop`) plutôt qu'un retrait manuel
    /// après l'appel — B5 (plans/065-revue-findings.md, KBC-29) : un panic
    /// dans `f` laissait le répertoire `.lock` en place, bloquant toute
    /// invocation suivante jusqu'au délai `LOCK_STALE` (10 s).
    fn with_lock<T>(&mut self, f: impl FnOnce(&mut Self) -> Result<T, String>) -> Result<T, String> {
        std::fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        let deadline = std::time::Instant::now() + LOCK_TIMEOUT;
        loop {
            match std::fs::create_dir(&self.lock_dir) {
                Ok(()) => break,
                Err(_) => {
                    if let Ok(meta) = std::fs::metadata(&self.lock_dir) {
                        if let Ok(modified) = meta.modified() {
                            if modified.elapsed().unwrap_or_default() > LOCK_STALE {
                                let _ = std::fs::remove_dir_all(&self.lock_dir);
                                continue;
                            }
                        }
                    }
                    if std::time::Instant::now() > deadline {
                        return Err("Base de connaissances occupée (verrou) — réessayer".to_string());
                    }
                    std::thread::sleep(Duration::from_millis(25));
                }
            }
        }
        let _guard = LockGuard { lock_dir: self.lock_dir.clone() };
        f(self)
    }

    fn ordered_sources(&self) -> Vec<&Value> {
        self.source_order.iter().filter_map(|id| self.sources.get(id)).collect()
    }

    pub fn list_all(&self) -> Vec<Value> {
        let mut items: Vec<Value> = self.ordered_sources().into_iter().cloned().collect();
        items.sort_by(|a, b| updated_at(b).cmp(&updated_at(a)));
        items
    }

    pub fn list(&self, collection: Option<&str>, archived: bool) -> Vec<Value> {
        self.ordered_sources()
            .into_iter()
            .filter(|s| {
                let is_archived = s.get("archived").and_then(Value::as_bool).unwrap_or(false);
                if archived {
                    is_archived
                } else {
                    !is_archived
                }
            })
            .filter(|s| match collection {
                None => true,
                Some(slug) => s
                    .get("collections")
                    .and_then(Value::as_array)
                    .map(|arr| arr.iter().any(|c| c.as_str() == Some(slug)))
                    .unwrap_or(false),
            })
            .cloned()
            .collect::<Vec<_>>()
            .tap_sort()
    }

    pub fn get(&self, id: &str) -> Option<&Value> {
        self.sources.get(id)
    }

    /// Cache d'extraction PDF namespacé sous `<dir>/pdf-cache` — réutilisé
    /// par `article-import` (vague 2) pour l'extraction locale, isolé par
    /// `ATELIER_APP_DIR` (contrairement au cache Node par défaut de
    /// `article.mjs::convertPdf`, non namespacé — voir la note dans cli.rs).
    pub fn pdf_cache_dir(&self) -> &Path {
        &self.pdf_cache_dir
    }

    fn persist(&self) -> Result<(), String> {
        let payload = json!({
            "version": REGISTRY_VERSION,
            "collections": self.collections,
            "sources": self.list_all(),
        });
        write_atomic(&self.registry_path, serde_json::to_string_pretty(&payload).unwrap().as_bytes())
    }

    fn cache_path(&self, id: &str) -> PathBuf {
        self.cache_dir.join(format!("{id}.json"))
    }

    fn read_pages_cache(&self, id: &str) -> Option<Vec<Page>> {
        let raw = std::fs::read_to_string(self.cache_path(id)).ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        if v.get("version").and_then(Value::as_u64) != Some(PAGES_CACHE_VERSION) {
            return None;
        }
        let pages = v.get("pages")?.as_array()?;
        Some(
            pages
                .iter()
                .map(|p| Page {
                    page: p.get("page").and_then(Value::as_u64).unwrap_or(1) as u32,
                    text: p.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
                })
                .collect(),
        )
    }

    fn read_folder_cache(&self, id: &str) -> Option<Vec<FolderFile>> {
        let raw = std::fs::read_to_string(self.cache_path(id)).ok()?;
        let v: Value = serde_json::from_str(&raw).ok()?;
        if v.get("version").and_then(Value::as_u64) != Some(PAGES_CACHE_VERSION) {
            return None;
        }
        let files = v.get("files")?.as_array()?;
        Some(
            files
                .iter()
                .map(|f| FolderFile {
                    rel: f.get("rel").and_then(Value::as_str).unwrap_or("").to_string(),
                    mtime_ms: f.get("mtimeMs").and_then(Value::as_f64).unwrap_or(0.0),
                    size: f.get("size").and_then(Value::as_u64).unwrap_or(0),
                    chars: f.get("chars").and_then(Value::as_u64).unwrap_or(0) as usize,
                    pages: f
                        .get("pages")
                        .and_then(Value::as_array)
                        .map(|pages| {
                            pages
                                .iter()
                                .map(|p| Page {
                                    page: p.get("page").and_then(Value::as_u64).unwrap_or(1) as u32,
                                    text: p.get("text").and_then(Value::as_str).unwrap_or("").to_string(),
                                })
                                .collect()
                        })
                        .unwrap_or_default(),
                })
                .collect(),
        )
    }

    fn write_cache(&self, id: &str, payload: &Value) -> Result<(), String> {
        let mut obj = payload.as_object().cloned().unwrap_or_default();
        obj.insert("version".into(), json!(PAGES_CACHE_VERSION));
        write_atomic(&self.cache_path(id), serde_json::to_vec(&Value::Object(obj)).unwrap().as_slice())
    }

    /// Insère/actualise une entrée puis persiste registre + cache. `chars`
    /// est fourni tel quel (source de vérité déjà calculée par l'appelant,
    /// miroir de `upsertRaw`).
    #[allow(clippy::too_many_arguments)]
    fn upsert_raw(
        &mut self,
        id: &str,
        kind: &str,
        title: Option<&str>,
        origin: Option<&str>,
        chars: u64,
        meta: Value,
        cache_payload: Value,
    ) -> Result<(Value, bool), String> {
        let id = id.to_string();
        let kind = kind.to_string();
        let title = title.map(|s| s.to_string());
        let origin = origin.map(|s| s.to_string());
        self.with_lock(move |this| {
            this.reload_from_disk();
            let prev = this.sources.get(&id).cloned();
            let now = now_iso();
            let title_final = title
                .filter(|t| !t.is_empty())
                .or_else(|| prev.as_ref().and_then(|p| p.get("title")).and_then(Value::as_str).map(|s| s.to_string()))
                .unwrap_or_else(|| "Sans titre".to_string());
            let added_at = prev
                .as_ref()
                .and_then(|p| p.get("addedAt"))
                .and_then(Value::as_str)
                .map(|s| s.to_string())
                .unwrap_or_else(|| now.clone());
            let prev_collections = prev
                .as_ref()
                .and_then(|p| p.get("collections"))
                .cloned()
                .unwrap_or_else(|| json!([]));
            let prev_archived = prev
                .as_ref()
                .and_then(|p| p.get("archived"))
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let entry = json!({
                "id": id,
                "kind": kind,
                "title": title_final,
                "origin": origin,
                "chars": chars,
                "addedAt": added_at,
                "updatedAt": now,
                "meta": meta,
                "collections": prev_collections,
                "archived": prev_archived,
            });
            if !this.source_order.contains(&id) {
                this.source_order.push(id.clone());
            }
            this.sources.insert(id.clone(), entry.clone());
            this.write_cache(&id, &cache_payload)?;
            this.persist()?;
            Ok((entry, prev.is_some()))
        })
    }

    fn upsert_entry(
        &mut self,
        id: &str,
        kind: &str,
        title: Option<&str>,
        origin: Option<&str>,
        pages: Vec<Page>,
        meta: Value,
    ) -> Result<(Value, bool), String> {
        let chars: u64 = pages.iter().map(|p| js_len(&p.text) as u64).sum();
        let cache_payload = json!({ "pages": pages.iter().map(|p| json!({"page": p.page, "text": p.text})).collect::<Vec<_>>() });
        self.upsert_raw(id, kind, title, origin, chars, meta, cache_payload)
    }

    pub fn remove(&mut self, id: &str) -> Result<(), String> {
        let id = id.to_string();
        let cache_path = self.cache_path(&id);
        self.with_lock(move |this| {
            this.reload_from_disk();
            if this.sources.remove(&id).is_none() {
                return Err(format!("Source inconnue: {id}"));
            }
            this.source_order.retain(|x| x != &id);
            let _ = std::fs::remove_file(&cache_path);
            this.persist()
        })
    }

    pub fn collection_add(&mut self, title: &str) -> Result<String, String> {
        let title = title.to_string();
        self.with_lock(move |this| {
            this.reload_from_disk();
            let clean = title.trim().to_string();
            if clean.is_empty() {
                return Err("Titre de collection requis (--add <titre>)".to_string());
            }
            let slug = collection_slug(&clean);
            if slug.is_empty() {
                return Err(format!("Titre de collection invalide: {clean}"));
            }
            if !this.collections.iter().any(|c| c.get("slug").and_then(Value::as_str) == Some(slug.as_str())) {
                this.collections.insert(0, json!({"slug": slug, "title": clean}));
            }
            this.persist()?;
            Ok(slug)
        })
    }

    pub fn collection_rename(&mut self, slug: &str, title: &str) -> Result<(), String> {
        let slug = slug.to_string();
        let title = title.to_string();
        self.with_lock(move |this| {
            this.reload_from_disk();
            let clean = title.trim().to_string();
            let pos = this
                .collections
                .iter()
                .position(|c| c.get("slug").and_then(Value::as_str) == Some(slug.as_str()))
                .ok_or_else(|| format!("Collection inconnue: {slug}"))?;
            if clean.is_empty() {
                return Err("Nouveau titre requis (--title)".to_string());
            }
            this.collections[pos]["title"] = json!(clean);
            this.persist()
        })
    }

    pub fn collection_remove(&mut self, slug: &str) -> Result<(), String> {
        let slug = slug.to_string();
        self.with_lock(move |this| {
            this.reload_from_disk();
            let exists = this
                .collections
                .iter()
                .any(|c| c.get("slug").and_then(Value::as_str) == Some(slug.as_str()));
            if !exists {
                return Err(format!("Collection inconnue: {slug}"));
            }
            this.collections.retain(|c| c.get("slug").and_then(Value::as_str) != Some(slug.as_str()));
            for id in this.source_order.clone() {
                if let Some(entry) = this.sources.get_mut(&id) {
                    if let Some(arr) = entry.get_mut("collections").and_then(Value::as_array_mut) {
                        arr.retain(|c| c.as_str() != Some(slug.as_str()));
                    }
                }
            }
            this.persist()
        })
    }

    pub fn tag_source(&mut self, id: &str, slug: &str, off: bool) -> Result<(), String> {
        let id = id.to_string();
        let slug = slug.to_string();
        self.with_lock(move |this| {
            this.reload_from_disk();
            if !this.sources.contains_key(&id) {
                return Err(format!("Source inconnue: {id}"));
            }
            if !this.collections.iter().any(|c| c.get("slug").and_then(Value::as_str) == Some(slug.as_str())) {
                return Err(format!("Collection inconnue: {slug}"));
            }
            let entry = this.sources.get_mut(&id).unwrap();
            let mut set: Vec<String> = entry
                .get("collections")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default();
            let mut seen: HashSet<String> = set.iter().cloned().collect();
            if off {
                set.retain(|x| x != &slug);
            } else if seen.insert(slug.clone()) {
                set.push(slug.clone());
            }
            entry["collections"] = json!(set);
            this.persist()
        })
    }

    pub fn archive_source(&mut self, id: &str, off: bool) -> Result<(), String> {
        let id = id.to_string();
        self.with_lock(move |this| {
            this.reload_from_disk();
            let entry = this.sources.get_mut(&id).ok_or_else(|| format!("Source inconnue: {id}"))?;
            entry["archived"] = json!(!off);
            this.persist()
        })
    }

    pub fn tag_many(&mut self, ids: &[String], slug: &str, off: bool) -> Result<u64, String> {
        let ids = ids.to_vec();
        let slug = slug.to_string();
        self.with_lock(move |this| {
            this.reload_from_disk();
            if !this.collections.iter().any(|c| c.get("slug").and_then(Value::as_str) == Some(slug.as_str())) {
                return Err(format!("Collection inconnue: {slug}"));
            }
            let mut applied = 0u64;
            for id in &ids {
                let Some(entry) = this.sources.get_mut(id) else { continue };
                let mut set: Vec<String> = entry
                    .get("collections")
                    .and_then(Value::as_array)
                    .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                    .unwrap_or_default();
                if off {
                    set.retain(|x| x != &slug);
                } else if !set.contains(&slug) {
                    set.push(slug.clone());
                }
                entry["collections"] = json!(set);
                applied += 1;
            }
            this.persist()?;
            Ok(applied)
        })
    }

    pub fn archive_many(&mut self, ids: &[String], off: bool) -> Result<u64, String> {
        let ids = ids.to_vec();
        self.with_lock(move |this| {
            this.reload_from_disk();
            let mut applied = 0u64;
            for id in &ids {
                let Some(entry) = this.sources.get_mut(id) else { continue };
                entry["archived"] = json!(!off);
                applied += 1;
            }
            this.persist()?;
            Ok(applied)
        })
    }

    /// `add` — kinds locaux + gbrain (vague 2) + web fetch réel (vague 3).
    /// `youtube`/`zotero` restent hors périmètre : validés par `KB_KINDS`
    /// (même message d'erreur que Node) mais non implémentés — erreur
    /// explicite si vraiment invoqués.
    pub fn add(
        &mut self,
        kind: &str,
        origin: Option<&str>,
        title: Option<&str>,
        text: Option<&str>,
    ) -> Result<(Value, bool), String> {
        if !KB_KINDS.contains(&kind) {
            return Err(format!(
                "Kind non pris en charge (v1: {}) : {kind}",
                KB_KINDS.join(", ")
            ));
        }
        match kind {
            "note" => {
                let clean_title = title.unwrap_or("").trim().to_string();
                let body = text.unwrap_or("").trim().to_string();
                if clean_title.is_empty() || body.is_empty() {
                    return Err("Une note demande --title et --text".to_string());
                }
                let id = source_id("note", &clean_title);
                let pages = pages_from_text(&body);
                self.upsert_entry(&id, "note", Some(&clean_title), None, pages, json!({}))
            }
            "file" => self.add_file(origin, title),
            "folder" => self.add_folder(origin, title),
            "pdf" => self.add_pdf(origin, title),
            "web" => self.add_web(origin, title, text),
            "gbrain" => self.add_gbrain(origin, title),
            other => Err(format!(
                "kind '{other}' non pris en charge par ce moteur (vague 3 : store local + gbrain + web (texte fourni ou fetch réel) ; youtube/zotero hors périmètre)"
            )),
        }
    }

    /// `add --kind gbrain` — miroir de la branche `gbrain` de
    /// `KnowledgeStore.add` (`knowledge.mjs`) : lecture seule (`gbrain get`),
    /// jamais d'écriture au passage.
    fn add_gbrain(&mut self, origin: Option<&str>, title: Option<&str>) -> Result<(Value, bool), String> {
        let slug = origin.unwrap_or("").trim().to_string();
        if slug.is_empty() || slug.chars().any(char::is_whitespace) {
            return Err("Slug gbrain requis (--origin <slug>, sans espace)".to_string());
        }
        let markdown = crate::gbrain::run_gbrain(&["get", &slug], None)?.trim().to_string();
        if markdown.is_empty() || crate::gbrain::gbrain_not_found(&markdown) {
            return Err(format!("Page gbrain introuvable: {slug}"));
        }
        let final_title = title
            .filter(|t| !t.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| crate::gbrain::gbrain_title(&markdown, &slug));
        let id = source_id("gbrain", &slug);
        let pages = pages_from_text(&markdown);
        let meta = json!({ "slug": slug, "syncedAt": now_iso() });
        self.upsert_entry(&id, "gbrain", Some(&final_title), Some(&slug), pages, meta)
    }

    fn add_file(&mut self, origin: Option<&str>, title: Option<&str>) -> Result<(Value, bool), String> {
        let origin = origin.unwrap_or("");
        if origin.is_empty() {
            return Err(format!("Fichier introuvable: {origin}"));
        }
        let path = resolve_path(origin);
        if !path.exists() {
            return Err(format!("Fichier introuvable: {origin}"));
        }
        let ext = ext_lower(&path);
        let table = TABLE_EXTS.contains(&ext.as_str());
        if !TEXT_EXTS.contains(&ext.as_str()) && !table {
            let accepted = TEXT_EXTS.iter().chain(TABLE_EXTS.iter()).cloned().collect::<Vec<_>>().join(" ");
            return Err(format!(
                "Extension non prise en charge ({accepted} ; PDF via --kind pdf) : {}",
                if ext.is_empty() { path.to_string_lossy().into_owned() } else { ext }
            ));
        }
        let stat = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let body = if table {
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            csv_digest(&raw, &name, CSV_FULL_MAX)?
        } else {
            raw
        };
        let pages = pages_from_text(&body);
        if pages.is_empty() {
            return Err(format!("Fichier vide: {}", path.display()));
        }
        let file_title = title
            .filter(|t| !t.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| basename(&path));
        let mut meta = json!({ "mtimeMs": stat.modified_ms(), "size": stat.len() });
        if table {
            meta["table"] = json!(true);
        }
        let id = source_id("file", &path.to_string_lossy());
        self.upsert_entry(&id, "file", Some(&file_title), Some(&path.to_string_lossy()), pages, meta)
    }

    fn add_folder(&mut self, origin: Option<&str>, title: Option<&str>) -> Result<(Value, bool), String> {
        let origin_str = origin.unwrap_or("");
        let path = resolve_path(origin_str);
        if origin_str.is_empty() || !path.is_dir() {
            return Err(format!("Dossier introuvable: {origin_str}"));
        }
        let id = source_id("folder", &path.to_string_lossy());
        let previous = self.read_folder_cache(&id).unwrap_or_default();
        let (files, skipped) = scan_folder(&path, &previous);
        if files.is_empty() {
            return Err(format!(
                "Aucun fichier texte (.md .tex .txt) dans {}",
                path.display()
            ));
        }
        let chars: u64 = files.iter().map(|f| f.chars as u64).sum();
        let mut meta = json!({ "files": files.len() });
        if skipped > 0 {
            meta["skipped"] = json!(skipped);
        }
        let folder_title = title
            .filter(|t| !t.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| basename(&path));
        let cache_payload = json!({
            "files": files.iter().map(|f| json!({
                "rel": f.rel, "mtimeMs": f.mtime_ms, "size": f.size, "chars": f.chars,
                "pages": f.pages.iter().map(|p| json!({"page": p.page, "text": p.text})).collect::<Vec<_>>(),
            })).collect::<Vec<_>>(),
        });
        self.upsert_raw(&id, "folder", Some(&folder_title), Some(&path.to_string_lossy()), chars, meta, cache_payload)
    }

    fn add_pdf(&mut self, origin: Option<&str>, title: Option<&str>) -> Result<(Value, bool), String> {
        let origin_str = origin.unwrap_or("");
        if origin_str.is_empty() {
            return Err(format!("PDF introuvable: {origin_str}"));
        }
        let path = resolve_path(origin_str);
        if !path.exists() {
            return Err(format!("PDF introuvable: {origin_str}"));
        }
        if !path.to_string_lossy().to_lowercase().ends_with(".pdf") {
            return Err(format!("--kind pdf attend un fichier .pdf : {}", path.display()));
        }
        let stat = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let extracted = extract_pdf_pages(&path, &self.pdf_cache_dir)?;
        let pdf_title = title
            .filter(|t| !t.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()
            });
        let meta = json!({ "pages": extracted.pages.len(), "mtimeMs": stat.modified_ms(), "size": stat.len() });
        let id = source_id("pdf", &path.to_string_lossy());
        self.upsert_entry(&id, "pdf", Some(&pdf_title), Some(&path.to_string_lossy()), extracted.pages, meta)
    }

    /// `add --kind web` — miroir de la branche `web` de `KnowledgeStore.add`
    /// (`knowledge.mjs`) : texte fourni (capture browser, page derrière
    /// login) sinon fetch réseau réel (`web::fetch_page` + `html_to_text`,
    /// vague 3, groupe d de la parité).
    fn add_web(
        &mut self,
        origin: Option<&str>,
        title: Option<&str>,
        text: Option<&str>,
    ) -> Result<(Value, bool), String> {
        let origin = origin.unwrap_or("");
        let url = parse_http_url(origin)?;
        let provided = text.unwrap_or("").trim().to_string();
        const WEB_TEXT_MAX: usize = 300_000;
        let (mut page_title, mut body, mut content_type) = (title.filter(|t| !t.is_empty()).map(|s| s.to_string()).unwrap_or_default(), provided, String::new());
        if body.is_empty() {
            let (html, fetched_content_type) = crate::web::fetch_page(&url)?;
            let (parsed_title, parsed_text) = crate::web::html_to_text(&html);
            if page_title.is_empty() {
                page_title = parsed_title;
            }
            body = parsed_text;
            content_type = fetched_content_type;
        }
        body = body.chars().take(WEB_TEXT_MAX).collect();
        if body.is_empty() {
            return Err(format!("Aucun texte extractible sur {url}"));
        }
        if page_title.is_empty() {
            page_title = url.clone();
        }
        let id = source_id("web", &url);
        let meta = if content_type.is_empty() { json!({}) } else { json!({ "contentType": content_type }) };
        self.upsert_entry(&id, "web", Some(&page_title), Some(&url), pages_from_text(&body), meta)
    }

    /// Re-lit les sources locales périmées (mtime/size) avant usage —
    /// fichiers texte ET PDF (un PDF remplacé au même chemin est
    /// ré-extrait), dossier par empreinte (fingerprint des rel/mtime/size).
    /// Miroir de `ensureFresh` (`sidecar/knowledge.mjs:871-938`) — B2
    /// (plans/065-revue-findings.md) : jamais porté jusqu'ici, texte périmé
    /// servi sans signal, erreur dure sur cache absent alors que Node se
    /// répare seul en reconstruisant depuis l'origine quand elle existe
    /// encore sur disque.
    fn ensure_fresh(&mut self, id: &str) -> Result<Value, String> {
        let entry = self.sources.get(id).cloned().ok_or_else(|| format!("Source inconnue: {id}"))?;
        let kind = entry.get("kind").and_then(Value::as_str).unwrap_or("").to_string();
        let origin = entry.get("origin").and_then(Value::as_str).map(str::to_string);
        let title = entry.get("title").and_then(Value::as_str).map(str::to_string);
        let meta_mtime = entry.get("meta").and_then(|m| m.get("mtimeMs")).and_then(Value::as_f64);
        let meta_size = entry.get("meta").and_then(|m| m.get("size")).and_then(Value::as_u64);

        if kind == "file" {
            if let Some(origin) = origin.as_deref() {
                let path = Path::new(origin);
                if path.exists() {
                    if let Ok(stat) = std::fs::metadata(path) {
                        let stale = Some(stat.modified_ms()) != meta_mtime || Some(stat.len()) != meta_size;
                        if stale {
                            if let Ok(raw) = std::fs::read_to_string(path) {
                                let pages = pages_from_text(&raw);
                                if !pages.is_empty() {
                                    let meta = json!({"mtimeMs": stat.modified_ms(), "size": stat.len()});
                                    self.upsert_entry(id, "file", title.as_deref(), Some(origin), pages, meta)?;
                                }
                            }
                        }
                    }
                }
            }
        } else if kind == "pdf" || kind == "zotero" {
            if let Some(origin) = origin.as_deref() {
                let path = Path::new(origin);
                if path.exists() {
                    if let Ok(stat) = std::fs::metadata(path) {
                        let stale = Some(stat.modified_ms()) != meta_mtime || Some(stat.len()) != meta_size;
                        if stale || self.read_pages_cache(id).is_none() {
                            let extracted = extract_pdf_pages(path, &self.pdf_cache_dir)?;
                            let mut meta = entry.get("meta").cloned().unwrap_or_else(|| json!({}));
                            if let Some(obj) = meta.as_object_mut() {
                                obj.insert("pages".into(), json!(extracted.pages.len()));
                                obj.insert("mtimeMs".into(), json!(stat.modified_ms()));
                                obj.insert("size".into(), json!(stat.len()));
                            }
                            self.upsert_entry(id, &kind, title.as_deref(), Some(origin), extracted.pages, meta)?;
                        }
                    }
                }
            }
        } else if kind == "folder" {
            if let Some(origin) = origin.as_deref() {
                let path = Path::new(origin);
                if path.is_dir() {
                    let previous = self.read_folder_cache(id).unwrap_or_default();
                    let (files, skipped) = scan_folder(path, &previous);
                    if folder_fingerprint(&previous) != folder_fingerprint(&files) {
                        let chars: u64 = files.iter().map(|f| f.chars as u64).sum();
                        let mut meta = json!({"files": files.len()});
                        if skipped > 0 {
                            meta["skipped"] = json!(skipped);
                        }
                        let cache_payload = json!({
                            "files": files.iter().map(|f| json!({
                                "rel": f.rel, "mtimeMs": f.mtime_ms, "size": f.size, "chars": f.chars,
                                "pages": f.pages.iter().map(|p| json!({"page": p.page, "text": p.text})).collect::<Vec<_>>(),
                            })).collect::<Vec<_>>(),
                        });
                        self.upsert_raw(id, "folder", title.as_deref(), Some(origin), chars, meta, cache_payload)?;
                    }
                }
            }
        }
        Ok(self.sources.get(id).cloned().unwrap_or(entry))
    }

    /// Pages d'une source, cache reconstruit depuis l'origine quand elle
    /// existe encore. Miroir de `pagesFor` (`sidecar/knowledge.mjs:922-938`).
    fn pages_for(&mut self, id: &str) -> Result<Vec<Page>, String> {
        let entry = self.ensure_fresh(id)?;
        if let Some(pages) = self.read_pages_cache(id) {
            return Ok(pages);
        }
        if entry.get("kind").and_then(Value::as_str) == Some("file") {
            if let Some(origin) = entry.get("origin").and_then(Value::as_str) {
                let path = Path::new(origin);
                if path.exists() {
                    if let Ok(stat) = std::fs::metadata(path) {
                        if let Ok(raw) = std::fs::read_to_string(path) {
                            let pages = pages_from_text(&raw);
                            if !pages.is_empty() {
                                let title = entry.get("title").and_then(Value::as_str).map(str::to_string);
                                let meta = json!({"mtimeMs": stat.modified_ms(), "size": stat.len()});
                                self.upsert_entry(id, "file", title.as_deref(), Some(origin), pages.clone(), meta)?;
                                return Ok(pages);
                            }
                        }
                    }
                }
            }
        }
        Err(format!("Cache absent pour {id} — ré-épingler la source"))
    }

    /// Texte stocké tel quel (registre + cache, pas le fichier disque).
    pub fn full_text(&mut self, id: &str) -> Result<String, String> {
        let entry = self.sources.get(id).cloned().ok_or_else(|| format!("Source inconnue: {id}"))?;
        if entry.get("kind").and_then(Value::as_str) == Some("folder") {
            let files = self.folder_files_for(id)?;
            return Ok(files
                .iter()
                .map(|f| {
                    let text = f.pages.iter().map(|p| p.text.as_str()).collect::<Vec<_>>().join("\n\n");
                    format!("# {}\n\n{text}", f.rel)
                })
                .collect::<Vec<_>>()
                .join("\n\n"));
        }
        let pages = self.pages_for(id)?;
        Ok(pages.iter().map(|p| p.text.as_str()).collect::<Vec<_>>().join("\n\n"))
    }

    /// Fichiers d'un dossier, cache reconstruit quand l'origine le permet
    /// (`ensureFresh` avant lecture — B2).
    pub fn folder_files_for(&mut self, id: &str) -> Result<Vec<FolderFile>, String> {
        self.ensure_fresh(id)?;
        self.read_folder_cache(id).ok_or_else(|| format!("Cache absent pour {id} — ré-épingler la source"))
    }

    /// Recherche par source (per-source, lexical) — `search --id --query`.
    /// Le second élément du tuple porte `(passage, file_rel)` : `file_rel`
    /// n'est renseigné que pour une source `folder` (miroir de
    /// `passage.file` côté Node, utilisé par `decoratePassage`).
    pub fn search(
        &mut self,
        id: &str,
        query: &str,
        limit: usize,
    ) -> Result<(Value, Vec<(crate::search::Passage, Option<String>)>), String> {
        let entry = self.sources.get(id).ok_or_else(|| format!("Source inconnue: {id}"))?.clone();
        let kind = entry.get("kind").and_then(Value::as_str).unwrap_or("file").to_string();
        let summary = json!({
            "id": entry.get("id").cloned().unwrap_or(Value::Null),
            "title": entry.get("title").cloned().unwrap_or(Value::Null),
            "kind": entry.get("kind").cloned().unwrap_or(Value::Null),
            "origin": entry.get("origin").cloned().unwrap_or(Value::Null),
            "meta": entry.get("meta").cloned().unwrap_or_else(|| json!({})),
        });
        if kind == "folder" {
            let capped = limit.clamp(1, 10);
            let files = self.folder_files_for(id)?;
            let mut merged: Vec<(crate::search::Passage, Option<String>)> = Vec::new();
            for file in &files {
                for passage in search_passages(&file.pages, query, capped) {
                    merged.push((passage, Some(file.rel.clone())));
                }
            }
            merged.sort_by(|a, b| b.0.score.partial_cmp(&a.0.score).unwrap());
            merged.truncate(capped);
            return Ok((summary, merged));
        }
        let pages = self.pages_for(id)?;
        let passages = search_passages(&pages, query, limit);
        Ok((summary, passages.into_iter().map(|p| (p, None)).collect()))
    }
}

trait ModifiedMs {
    fn modified_ms(&self) -> f64;
}
impl ModifiedMs for std::fs::Metadata {
    fn modified_ms(&self) -> f64 {
        self.modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64() * 1000.0)
            .unwrap_or(0.0)
    }
}

trait TapSort {
    fn tap_sort(self) -> Self;
}
impl TapSort for Vec<Value> {
    fn tap_sort(mut self) -> Self {
        self.sort_by(|a, b| updated_at(b).cmp(&updated_at(a)));
        self
    }
}

fn updated_at(v: &Value) -> String {
    v.get("updatedAt").and_then(Value::as_str).unwrap_or("").to_string()
}

fn ext_lower(path: &Path) -> String {
    path.extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase())).unwrap_or_default()
}

/// Miroir de `basename(path)` (Node) : `Path::file_name` retourne `None`
/// pour un chemin racine ("/") — Node répond "" dans ce cas plutôt que de
/// paniquer. B5 (plans/065-revue-findings.md, KBS-01) : `add --kind folder
/// --origin /` sans `--title` faisait paniquer le process en `.unwrap()`.
fn basename(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn resolve_path(origin: &str) -> PathBuf {
    let p = Path::new(origin);
    if p.is_absolute() {
        normalize_path(p)
    } else {
        let cwd = std::env::current_dir().unwrap_or_default();
        normalize_path(&cwd.join(p))
    }
}

/// `path.resolve()`-like : nettoie `.`/`..` sans exiger que le chemin existe.
fn normalize_path(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn pages_from_text(text: &str) -> Vec<Page> {
    let clean = text.replace('\r', "");
    let clean = clean.trim();
    if clean.is_empty() {
        Vec::new()
    } else {
        vec![Page { page: 1, text: clean.to_string() }]
    }
}

fn parse_http_url(origin: &str) -> Result<String, String> {
    if origin.is_empty() {
        return Err("Argument requis: --origin (URL de la page)".to_string());
    }
    if !origin.starts_with("http://") && !origin.starts_with("https://") {
        return Err(format!("Seuls http(s) sont pris en charge: {origin}"));
    }
    Ok(origin.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn source_id_est_deterministe_et_depend_de_la_cle() {
        let a = source_id("note", "Titre A");
        let b = source_id("note", "Titre A");
        let c = source_id("note", "Titre B");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 8);
        // valeur figée (vérifiée aussi contre le sha256 de référence, voir
        // rapport 065-w1) : garde-fou si l'algorithme dérive un jour.
        assert_eq!(source_id("note", "Note fixture"), "6746246a");
        assert_eq!(source_id("web", "https://example.org/fixture"), "08e91a5c");
    }

    #[test]
    fn collection_slug_translitere_et_tronque() {
        assert_eq!(collection_slug("Glaciologie"), "glaciologie");
        assert_eq!(collection_slug("Météo & Climat"), "meteo-climat");
        assert_eq!(collection_slug("  --Titre étrange!!  "), "titre-etrange");
        let long = "a".repeat(60);
        assert_eq!(collection_slug(&long).chars().count(), 40);
    }

    #[test]
    fn note_add_list_tag_archive_remove_round_trip() {
        let dir = tempdir().unwrap();
        let mut store = KnowledgeStore::open(dir.path().to_path_buf());

        let (source, refreshed) = store.add("note", None, Some("Ma note"), Some("Corps de la note.")).unwrap();
        assert_eq!(refreshed, false);
        let id = source["id"].as_str().unwrap().to_string();
        assert_eq!(source["kind"], json!("note"));
        assert_eq!(source["archived"], json!(false));
        assert_eq!(source["collections"], json!([]));

        // ré-épingler la même note (même clé -> même id) : refreshed=true
        let (source2, refreshed2) = store.add("note", None, Some("Ma note"), Some("Corps de la note.")).unwrap();
        assert_eq!(source2["id"], json!(id));
        assert!(refreshed2);

        let slug = store.collection_add("Glaciologie").unwrap();
        assert_eq!(slug, "glaciologie");
        store.tag_source(&id, &slug, false).unwrap();
        let tagged = store.get(&id).unwrap();
        assert_eq!(tagged["collections"], json!(["glaciologie"]));
        let updated_at_before = tagged["updatedAt"].as_str().unwrap().to_string();

        store.archive_source(&id, false).unwrap();
        let archived = store.get(&id).unwrap();
        assert_eq!(archived["archived"], json!(true));
        // archive ne touche jamais updatedAt (piège volontaire côté Node).
        assert_eq!(archived["updatedAt"].as_str().unwrap(), updated_at_before);

        let active = store.list(None, false);
        assert!(active.is_empty());
        let archived_list = store.list(None, true);
        assert_eq!(archived_list.len(), 1);

        store.archive_source(&id, true).unwrap();
        assert_eq!(store.list(None, false).len(), 1);

        store.remove(&id).unwrap();
        assert!(store.get(&id).is_none());
        assert_eq!(store.remove(&id).unwrap_err(), format!("Source inconnue: {id}"));
    }

    #[test]
    fn note_sans_titre_ou_texte_echoue() {
        let dir = tempdir().unwrap();
        let mut store = KnowledgeStore::open(dir.path().to_path_buf());
        let err = store.add("note", None, None, Some("texte")).unwrap_err();
        assert_eq!(err, "Une note demande --title et --text");
        let err = store.add("note", None, Some("titre"), None).unwrap_err();
        assert_eq!(err, "Une note demande --title et --text");
    }

    #[test]
    fn kind_inconnu_liste_les_huit_kinds_v1() {
        let dir = tempdir().unwrap();
        let mut store = KnowledgeStore::open(dir.path().to_path_buf());
        let err = store.add("bogus", Some("x"), None, None).unwrap_err();
        assert_eq!(
            err,
            "Kind non pris en charge (v1: file, pdf, web, note, folder, youtube, gbrain, zotero) : bogus"
        );
    }

    #[test]
    fn registre_corrompu_est_sauvegarde_et_signale() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("knowledge.json"), "{ pas du json valide").unwrap();
        let store = KnowledgeStore::open(dir.path().to_path_buf());
        assert!(store.warning.is_some());
        assert!(store.sources.is_empty());
        let backups: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("knowledge.json.corrupt-"))
            .collect();
        assert_eq!(backups.len(), 1);
    }

    // --- B2 (plans/065-revue-findings.md) : ensureFresh — revalidation
    // mtime/size, reconstruction du cache absent, folder_fingerprint. ---

    #[test]
    fn ensure_fresh_relit_un_fichier_perime_mtime_size() {
        let dir = tempdir().unwrap();
        let mut store = KnowledgeStore::open(dir.path().to_path_buf());
        let file_path = dir.path().join("note.md");
        std::fs::write(&file_path, "Version initiale du texte source.").unwrap();
        let (source, _) = store.add("file", Some(file_path.to_str().unwrap()), None, None).unwrap();
        let id = source["id"].as_str().unwrap().to_string();
        assert!(store.full_text(&id).unwrap().contains("Version initiale"));

        // Taille ET mtime changent forcément (contenu plus long) — la
        // staleness ne dépend donc pas de la résolution du système de
        // fichiers pour l'horodatage.
        std::fs::write(&file_path, "Version mise a jour, notablement plus longue que l'originale.").unwrap();

        let text2 = store.full_text(&id).unwrap();
        assert!(text2.contains("mise a jour"), "ensureFresh doit relire le fichier périmé (B2)");
        assert!(!text2.contains("Version initiale"));
    }

    #[test]
    fn ensure_fresh_reconstruit_le_cache_absent_pour_un_fichier() {
        let dir = tempdir().unwrap();
        let mut store = KnowledgeStore::open(dir.path().to_path_buf());
        let file_path = dir.path().join("note.md");
        std::fs::write(&file_path, "Texte a retrouver apres suppression du cache.").unwrap();
        let (source, _) = store.add("file", Some(file_path.to_str().unwrap()), None, None).unwrap();
        let id = source["id"].as_str().unwrap().to_string();

        // Supprime le cache d'extraction sans toucher le registre ni le
        // fichier source (mtime/size inchangés -> pas "stale" au sens strict,
        // mais le cache est absent : Node se répare seul, jamais d'erreur).
        let cache_path = dir.path().join("cache").join(format!("{id}.json"));
        assert!(cache_path.exists());
        std::fs::remove_file(&cache_path).unwrap();

        let text = store.full_text(&id).unwrap();
        assert!(
            text.contains("Texte a retrouver"),
            "cache absent doit être reconstruit depuis l'origine (B2), pas une erreur dure"
        );
        assert!(cache_path.exists(), "le cache doit être régénéré après reconstruction");
    }

    #[test]
    fn ensure_fresh_detecte_un_nouveau_fichier_dans_un_dossier_deja_epingle() {
        let dir = tempdir().unwrap();
        let mut store = KnowledgeStore::open(dir.path().to_path_buf());
        let folder = dir.path().join("docs");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("a.md"), "Premier fichier du dossier.").unwrap();
        let (source, _) = store.add("folder", Some(folder.to_str().unwrap()), None, None).unwrap();
        let id = source["id"].as_str().unwrap().to_string();
        assert_eq!(source["meta"]["files"], json!(1));

        std::fs::write(folder.join("b.md"), "Deuxieme fichier ajoute apres l'epinglage initial.").unwrap();
        let text = store.full_text(&id).unwrap();
        assert!(
            text.contains("Deuxieme fichier"),
            "ensureFresh doit détecter le nouveau fichier via folder_fingerprint (B2)"
        );
        let refreshed = store.get(&id).unwrap();
        assert_eq!(refreshed["meta"]["files"], json!(2));
    }

    // --- B5 (plans/065-revue-findings.md, KBS-01/KBC-29) : plus de panic
    // in-process sur dossier racine, verrou libéré même si la fermeture
    // protégée panique. ---

    #[test]
    fn basename_ne_panique_pas_sur_la_racine() {
        assert_eq!(basename(Path::new("/")), "");
        assert_eq!(basename(Path::new("/foo/bar")), "bar");
        assert_eq!(basename(Path::new("/foo/")), "foo");
    }

    #[test]
    fn with_lock_libere_le_verrou_meme_si_la_fermeture_panique() {
        let dir = tempdir().unwrap();
        let mut store = KnowledgeStore::open(dir.path().to_path_buf());
        let lock_dir = store.lock_dir.clone();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            store.with_lock(|_| -> Result<(), String> { panic!("boom (test RAII, B5/KBC-29)") })
        }));
        assert!(result.is_err());
        assert!(
            !lock_dir.exists(),
            "le verrou .lock doit être libéré même après un panic dans la fermeture protégée (B5/KBC-29)"
        );
    }
}
