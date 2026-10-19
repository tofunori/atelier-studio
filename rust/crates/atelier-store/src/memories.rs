//! Mémoire de projet d'Atelier — `memories.json` (chantier 3 du plan
//! rattrapage-claude-science-2026-10-18).
//!
//! Un souvenir est une phrase courte rattachée à un projet (sa racine) ou à
//! tous les projets (`project_root` vide). Il garde son origine (saisi à la
//! main, proposé par l'agent, extrait d'un tour, importé de Claude Science)
//! et, quand on le corrige par un autre, l'identifiant de celui qui le
//! remplace : l'ancien reste visible dans Réglages › Mémoire mais ne part
//! plus dans les fils.
//!
//! Le choix des souvenirs à injecter (`relevant`) est lexical : quelques
//! milliers de phrases, pas besoin d'index sémantique pour ressortir celles
//! qui partagent les mots rares de la demande.

use crate::durable;
use crate::iso_now;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use uuid::Uuid;

/// Un souvenir ne doit pas devenir un document : au-delà, la saisie est
/// refusée (le front borne déjà son champ).
pub const MEMORY_TEXT_MAX: usize = 2_000;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryOrigin {
    /// `manual` | `agent` | `extraction` | `claude-science`
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// Identifiant du souvenir d'origine dans Claude Science : un nouvel
    /// import ne double rien.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    /// Nom du projet Claude Science d'où il vient.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_project: Option<String>,
    /// `stated` | `observed` | `inferred` (vocabulaire de Claude Science).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    #[serde(default)]
    pub project_root: String,
    pub text: String,
    #[serde(default)]
    pub origin: MemoryOrigin,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub superseded_by: Option<String>,
    /// Texte corrigé dans Atelier : un nouvel import ne l'écrase pas.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub edited: bool,
}

impl Memory {
    pub fn is_active(&self) -> bool {
        self.superseded_by.is_none()
    }
}

/// Filtre de `list`. `project_root: None` = tous ; `Some("")` = seulement les
/// souvenirs valables pour tous les projets.
#[derive(Debug, Clone, Default)]
pub struct MemoryQuery {
    pub project_root: Option<String>,
    pub text: String,
    pub origin: Option<String>,
    pub include_superseded: bool,
    pub offset: usize,
    pub limit: usize,
}

/// Un souvenir à importer de Claude Science.
#[derive(Debug, Clone)]
pub struct ImportedMemory {
    pub source_id: String,
    pub source_project: Option<String>,
    pub project_root: String,
    pub text: String,
    pub evidence: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub added: usize,
    pub updated: usize,
    pub unchanged: usize,
}

#[derive(Debug)]
pub struct MemoryStore {
    file_path: PathBuf,
    items: Vec<Memory>,
    /// Entrées que cette version ne sait pas lire (écrites par une autre
    /// version de l'app, ou abîmées) : réécrites telles quelles.
    kept: Vec<serde_json::Value>,
    /// `memories.json` présent mais illisible : aucune écriture tant qu'il
    /// n'est pas réparé (le premier souvenir ajouté effacerait tous les autres).
    load_error: Option<String>,
}

fn new_id() -> String {
    format!("mem_{}", &Uuid::new_v4().simple().to_string()[..16])
}

fn clean_text(text: &str) -> Result<String, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("memory_empty".into());
    }
    if text.chars().count() > MEMORY_TEXT_MAX {
        return Err("memory_too_long".into());
    }
    Ok(text.to_string())
}

impl MemoryStore {
    pub fn open(file_path: impl Into<PathBuf>) -> Self {
        let file_path = file_path.into();
        let loaded = durable::load_list(&file_path, |v| {
            serde_json::from_value::<Memory>(v.clone())
                .ok()
                .filter(|m| !m.id.is_empty() && !m.text.trim().is_empty())
        });
        let (entries, load_error) = match loaded {
            Ok(entries) => (entries, None),
            Err(error) => (durable::ListEntries::default(), Some(error.to_string())),
        };
        Self {
            file_path,
            items: entries.items,
            kept: entries.kept,
            load_error,
        }
    }

    /// Pourquoi le magasin refuse d'écrire (fichier illisible), s'il le refuse.
    pub fn load_error(&self) -> Option<&str> {
        self.load_error.as_deref()
    }

    /// Fichier illisible à l'ouverture : on le relit, au cas où il a été
    /// réparé depuis (sans relancer l'app). Encore illisible : l'erreur reste,
    /// et la copie de côté identique est réutilisée. Lisible : le magasin
    /// repart de son contenu et accepte de nouveau les écritures.
    pub fn refresh(&mut self) {
        if self.load_error.is_some() {
            *self = Self::open(self.file_path.clone());
        }
    }

    fn writable(&mut self) -> Result<(), String> {
        self.refresh();
        durable::writable(&self.load_error)
    }

    pub fn get(&self, id: &str) -> Option<&Memory> {
        self.items.iter().find(|m| m.id == id)
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Plus récents d'abord ; `total` compte avant la pagination.
    pub fn list(&self, q: &MemoryQuery) -> (Vec<Memory>, usize) {
        let needle = fold(&q.text);
        let mut hits: Vec<&Memory> = self
            .items
            .iter()
            .filter(|m| q.include_superseded || m.is_active())
            .filter(|m| {
                q.project_root
                    .as_deref()
                    .map_or(true, |root| m.project_root == root)
            })
            .filter(|m| q.origin.as_deref().map_or(true, |o| m.origin.kind == o))
            .filter(|m| needle.is_empty() || fold(&m.text).contains(&needle))
            .collect();
        hits.sort_by(|a, b| {
            b.created_at
                .cmp(&a.created_at)
                .then_with(|| b.id.cmp(&a.id))
        });
        let total = hits.len();
        let limit = if q.limit == 0 { 50 } else { q.limit };
        (
            hits.into_iter()
                .skip(q.offset)
                .take(limit)
                .cloned()
                .collect(),
            total,
        )
    }

    /// Nombre de souvenirs actifs par racine de projet (`""` = tous).
    pub fn counts(&self) -> HashMap<String, usize> {
        let mut out = HashMap::new();
        for m in self.items.iter().filter(|m| m.is_active()) {
            *out.entry(m.project_root.clone()).or_insert(0) += 1;
        }
        out
    }

    pub fn add(
        &mut self,
        project_root: &str,
        text: &str,
        origin: MemoryOrigin,
    ) -> Result<Memory, String> {
        self.writable()?;
        let text = clean_text(text)?;
        let now = iso_now();
        let memory = Memory {
            id: new_id(),
            project_root: project_root.trim().to_string(),
            text,
            origin,
            created_at: now.clone(),
            updated_at: now,
            superseded_by: None,
            edited: false,
        };
        self.items.push(memory.clone());
        self.persist()?;
        Ok(memory)
    }

    /// Correction en place (Réglages › Mémoire) : texte et projet.
    pub fn update(
        &mut self,
        id: &str,
        text: &str,
        project_root: Option<&str>,
    ) -> Result<Memory, String> {
        self.writable()?;
        let text = clean_text(text)?;
        let memory = self
            .items
            .iter_mut()
            .find(|m| m.id == id)
            .ok_or_else(|| "memory_unknown".to_string())?;
        if memory.text != text {
            memory.text = text;
            memory.edited = true;
        }
        if let Some(root) = project_root {
            memory.project_root = root.trim().to_string();
        }
        memory.updated_at = iso_now();
        let out = memory.clone();
        self.persist()?;
        Ok(out)
    }

    /// Un souvenir corrige un autre (proposition de l'agent avec
    /// `replaceId`) : le nouveau prend sa place, l'ancien est marqué
    /// « remplacé par » et ne part plus dans les fils.
    pub fn supersede(
        &mut self,
        old_id: &str,
        text: &str,
        origin: MemoryOrigin,
    ) -> Result<Memory, String> {
        self.writable()?;
        let root = self
            .get(old_id)
            .map(|m| m.project_root.clone())
            .ok_or_else(|| "memory_unknown".to_string())?;
        let text = clean_text(text)?;
        let now = iso_now();
        let memory = Memory {
            id: new_id(),
            project_root: root,
            text,
            origin,
            created_at: now.clone(),
            updated_at: now.clone(),
            superseded_by: None,
            edited: false,
        };
        if let Some(old) = self.items.iter_mut().find(|m| m.id == old_id) {
            old.superseded_by = Some(memory.id.clone());
            old.updated_at = now;
        }
        self.items.push(memory.clone());
        self.persist()?;
        Ok(memory)
    }

    pub fn remove(&mut self, ids: &[String]) -> Result<usize, String> {
        self.writable()?;
        let wanted: HashSet<&str> = ids.iter().map(String::as_str).collect();
        let before = self.items.len();
        self.items.retain(|m| !wanted.contains(m.id.as_str()));
        let removed = before - self.items.len();
        if removed > 0 {
            for m in &mut self.items {
                if m.superseded_by
                    .as_deref()
                    .is_some_and(|s| wanted.contains(s))
                {
                    m.superseded_by = None;
                }
            }
            self.persist()?;
        }
        Ok(removed)
    }

    /// Souvenirs importés d'un projet Claude Science (`Some("")` : ceux qui
    /// n'avaient pas de projet ; `None` : tout l'import) : pour retirer un
    /// import d'un coup.
    pub fn remove_imported(&mut self, source_project: Option<&str>) -> Result<usize, String> {
        let ids: Vec<String> = self
            .items
            .iter()
            .filter(|m| m.origin.kind == "claude-science")
            .filter(|m| {
                source_project.map_or(true, |p| {
                    m.origin.source_project.as_deref().unwrap_or("") == p
                })
            })
            .map(|m| m.id.clone())
            .collect();
        self.remove(&ids)
    }

    /// Identifiants Claude Science déjà importés, avec le projet Atelier
    /// qui les a reçus.
    pub fn imported_sources(&self) -> HashMap<String, String> {
        self.items
            .iter()
            .filter_map(|m| {
                m.origin
                    .source_id
                    .as_ref()
                    .map(|s| (s.clone(), m.project_root.clone()))
            })
            .collect()
    }

    /// Import idempotent : un souvenir déjà là (même `source_id`) prend le
    /// nouveau texte et le projet choisi s'ils ont changé ; un texte corrigé
    /// dans Atelier depuis (`edited`) n'est pas écrasé.
    pub fn import(&mut self, batch: Vec<ImportedMemory>) -> Result<ImportReport, String> {
        self.writable()?;
        let mut report = ImportReport::default();
        let index: HashMap<String, usize> = self
            .items
            .iter()
            .enumerate()
            .filter_map(|(i, m)| m.origin.source_id.clone().map(|s| (s, i)))
            .collect();
        let now = iso_now();
        for item in batch {
            let Ok(text) = clean_text(&truncate_chars(&item.text, MEMORY_TEXT_MAX)) else {
                continue;
            };
            match index.get(&item.source_id) {
                Some(&i) => {
                    let existing = &mut self.items[i];
                    let take_text = !existing.edited && existing.text != text;
                    let move_root = existing.project_root != item.project_root;
                    if !take_text && !move_root {
                        report.unchanged += 1;
                        continue;
                    }
                    if take_text {
                        existing.text = text;
                    }
                    existing.project_root = item.project_root;
                    existing.updated_at = now.clone();
                    report.updated += 1;
                }
                None => {
                    self.items.push(Memory {
                        id: new_id(),
                        project_root: item.project_root,
                        text,
                        origin: MemoryOrigin {
                            kind: "claude-science".into(),
                            source_id: Some(item.source_id),
                            source_project: item.source_project,
                            evidence: item.evidence,
                            ..Default::default()
                        },
                        created_at: item.created_at.clone(),
                        updated_at: item.created_at,
                        superseded_by: None,
                        edited: false,
                    });
                    report.added += 1;
                }
            }
        }
        if report.added + report.updated > 0 {
            self.persist()?;
        }
        Ok(report)
    }

    /// Souvenirs actifs du projet (et ceux valables partout) qui partagent
    /// les mots rares de `prompt`, les mieux classés d'abord. `exclude` :
    /// déjà donnés à la session du fil.
    pub fn relevant(
        &self,
        project_root: &str,
        prompt: &str,
        exclude: &HashSet<String>,
        max_items: usize,
    ) -> Vec<Memory> {
        let candidates: Vec<&Memory> = self
            .items
            .iter()
            .filter(|m| m.is_active())
            .filter(|m| m.project_root.is_empty() || m.project_root == project_root)
            .collect();
        if candidates.is_empty() || max_items == 0 {
            return Vec::new();
        }
        let query: HashSet<String> = tokens(prompt).into_iter().collect();
        if query.is_empty() {
            return Vec::new();
        }
        let docs: Vec<HashSet<String>> = candidates
            .iter()
            .map(|m| tokens(&m.text).into_iter().collect())
            .collect();
        let n = docs.len() as f64;
        let mut df: HashMap<&str, usize> = HashMap::new();
        for doc in &docs {
            for t in doc.iter().filter(|t| query.contains(*t)) {
                *df.entry(t.as_str()).or_insert(0) += 1;
            }
        }
        let mut scored: Vec<(f64, &Memory)> = candidates
            .iter()
            .zip(&docs)
            .filter(|(m, _)| !exclude.contains(&m.id))
            .filter_map(|(m, doc)| {
                let mut score = 0.0;
                let mut matched = 0usize;
                for t in doc.iter().filter(|t| query.contains(*t)) {
                    let d = *df.get(t.as_str()).unwrap_or(&1) as f64;
                    // Un mot présent dans plus de la moitié des souvenirs
                    // (« albédo » dans une thèse sur l'albédo) ne choisit rien.
                    if n >= 10.0 && d > n / 2.0 {
                        continue;
                    }
                    score += ((n - d + 0.5) / (d + 0.5) + 1.0).ln();
                    matched += 1;
                }
                if matched == 0 {
                    return None;
                }
                Some((
                    score / (doc.len() as f64).sqrt().max(1.0) * (matched as f64).sqrt(),
                    *m,
                ))
            })
            .collect();
        scored.sort_by(|a, b| {
            b.0.partial_cmp(&a.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.1.created_at.cmp(&a.1.created_at))
        });
        scored
            .into_iter()
            .take(max_items)
            .map(|(_, m)| m.clone())
            .collect()
    }

    fn persist(&self) -> Result<(), String> {
        durable::writable(&self.load_error)?;
        let list = durable::with_kept(&self.items, &self.kept)?;
        durable::save_json_compact(&self.file_path, &list).map_err(|e| e.to_string())
    }
}

fn truncate_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Minuscules sans accents, pour chercher « albedo » dans « Albédo ».
pub fn fold(s: &str) -> String {
    s.chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'à' | 'â' | 'ä' | 'á' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' => 'i',
            'ô' | 'ö' | 'ó' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ç' => 'c',
            other => other,
        })
        .collect()
}

const STOPWORDS: &[&str] = &[
    // français
    "les", "des", "une", "est", "pour", "que", "qui", "dans", "par", "sur", "avec", "pas", "plus",
    "son", "ses", "aux", "ont", "sont", "mais", "comme", "tout", "cette", "ces", "fait", "faire",
    "peux", "peut", "tu", "moi", "nous", "vous", "elle", "ils", "leur", "aussi", "bien", "encore",
    "quoi", "quel", "quelle", "entre", "sans", "avant", "apres", "deja", "alors", "donc", "car",
    // anglais
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were", "not", "but", "has",
    "have", "had", "its", "into", "than", "then", "when", "what", "which", "also", "can", "will",
    "should", "would", "use", "used", "using", "all", "any", "only", "one", "two", "per", "via",
];

/// Mots d'au moins trois caractères (les chiffres comptent : « 2015 »,
/// « jja » restent des indices forts), sans mots vides.
pub fn tokens(s: &str) -> Vec<String> {
    fold(s)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.chars().count() >= 3)
        .filter(|t| !STOPWORDS.contains(t))
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn manual() -> MemoryOrigin {
        MemoryOrigin {
            kind: "manual".into(),
            ..Default::default()
        }
    }

    #[test]
    fn un_fichier_illisible_n_est_jamais_reecrit() {
        for (case, raw) in crate::durable::UNREADABLE_LIST_SAMPLES {
            let dir = tempdir().unwrap();
            let path = dir.path().join("memories.json");
            std::fs::write(&path, raw).unwrap();
            let mut s = MemoryStore::open(&path);
            let error = s.load_error().unwrap_or_else(|| panic!("{case}")).to_string();
            assert!(error.contains("illisible"), "{case}: {error}");
            assert_eq!(s.add("", "Un nouveau souvenir", manual()).unwrap_err(), error, "{case}");
            assert!(s.remove(&["mem_1".into()]).is_err(), "{case}");
            assert!(s.import(vec![cs("x", "Importé", "")]).is_err(), "{case}");
            assert!(s.is_empty(), "{case}: rien n'est ajouté en mémoire non plus");
            assert_eq!(std::fs::read_to_string(&path).unwrap(), raw, "{case}");
            assert_eq!(crate::durable::corrupt_copies_of(&path, raw.as_bytes()), 1, "{case}");
        }
    }

    #[test]
    fn une_entree_illisible_est_gardee_telle_quelle() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("memories.json");
        let ancienne = serde_json::json!({"id": "mem_x", "texte": "format d'une autre version"});
        let lisible = serde_json::json!({"id": "mem_a", "projectRoot": "", "text": "Lu",
            "createdAt": "2026-10-01T00:00:00.000Z", "updatedAt": "2026-10-01T00:00:00.000Z"});
        std::fs::write(&path, serde_json::to_vec(&serde_json::json!([lisible, ancienne])).unwrap()).unwrap();
        let mut s = MemoryStore::open(&path);
        assert!(s.load_error().is_none());
        assert_eq!(s.len(), 1);
        s.add("", "Ajouté", manual()).unwrap();
        let disque: Vec<serde_json::Value> =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(disque.len(), 3);
        assert!(disque.contains(&ancienne), "l'entrée inconnue survit à la réécriture");
        // la réécriture a d'abord sauvegardé le fichier du jour
        let backups = std::fs::read_dir(dir.path().join(crate::durable::BACKUP_DIR)).unwrap().count();
        assert_eq!(backups, 1);
    }

    #[test]
    fn ajout_liste_recherche_sans_accents_et_persistance() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("memories.json");
        let mut s = MemoryStore::open(&path);
        s.add("/p", "L'albédo MODIS vient de MOD09GA", manual())
            .unwrap();
        s.add("", "Thierry écrit en français", manual()).unwrap();
        let (tous, total) = s.list(&MemoryQuery::default());
        assert_eq!((tous.len(), total), (2, 2));
        let (hits, _) = s.list(&MemoryQuery {
            text: "ALBEDO".into(),
            ..Default::default()
        });
        assert_eq!(hits.len(), 1);
        let (globaux, _) = s.list(&MemoryQuery {
            project_root: Some(String::new()),
            ..Default::default()
        });
        assert_eq!(globaux[0].text, "Thierry écrit en français");
        let rouvert = MemoryStore::open(&path);
        assert_eq!(rouvert.len(), 2);
        assert_eq!(rouvert.counts().get("/p"), Some(&1));
    }

    #[test]
    fn texte_vide_ou_trop_long_refuse() {
        let dir = tempdir().unwrap();
        let mut s = MemoryStore::open(dir.path().join("m.json"));
        assert_eq!(s.add("", "  ", manual()).unwrap_err(), "memory_empty");
        let long = "x".repeat(MEMORY_TEXT_MAX + 1);
        assert_eq!(s.add("", &long, manual()).unwrap_err(), "memory_too_long");
    }

    #[test]
    fn un_souvenir_remplace_sort_des_fils_mais_reste_listable() {
        let dir = tempdir().unwrap();
        let mut s = MemoryStore::open(dir.path().join("m.json"));
        let ancien = s
            .add("/p", "Fenêtre d'été : juin à août (JJA)", manual())
            .unwrap();
        let nouveau = s
            .supersede(
                &ancien.id,
                "Fenêtre d'été : juillet-août seulement",
                manual(),
            )
            .unwrap();
        assert_eq!(nouveau.project_root, "/p");
        assert_eq!(
            s.get(&ancien.id).unwrap().superseded_by.as_deref(),
            Some(nouveau.id.as_str())
        );
        let (actifs, _) = s.list(&MemoryQuery::default());
        assert_eq!(actifs.len(), 1);
        let (tous, _) = s.list(&MemoryQuery {
            include_superseded: true,
            ..Default::default()
        });
        assert_eq!(tous.len(), 2);
        let choisis = s.relevant("/p", "quelle fenêtre d'été ?", &HashSet::new(), 5);
        assert_eq!(choisis.len(), 1);
        assert_eq!(choisis[0].id, nouveau.id);
        // effacer le remplaçant rend l'ancien actif
        s.remove(&[nouveau.id]).unwrap();
        assert!(s.get(&ancien.id).unwrap().is_active());
    }

    fn cs(source: &str, text: &str, root: &str) -> ImportedMemory {
        ImportedMemory {
            source_id: source.into(),
            source_project: Some("Analyses Feux-Albédo".into()),
            project_root: root.into(),
            text: text.into(),
            evidence: Some("observed".into()),
            created_at: "2026-09-01T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn l_import_est_idempotent_et_respecte_une_correction_locale() {
        let dir = tempdir().unwrap();
        let mut s = MemoryStore::open(dir.path().join("m.json"));
        let r = s
            .import(vec![cs("a", "Texte A", "/p"), cs("b", "Texte B", "/p")])
            .unwrap();
        assert_eq!(
            r,
            ImportReport {
                added: 2,
                updated: 0,
                unchanged: 0
            }
        );
        let r = s
            .import(vec![cs("a", "Texte A", "/p"), cs("b", "Texte B v2", "/p")])
            .unwrap();
        assert_eq!(
            r,
            ImportReport {
                added: 0,
                updated: 1,
                unchanged: 1
            }
        );
        let a = s
            .list(&MemoryQuery {
                text: "texte a".into(),
                ..Default::default()
            })
            .0[0]
            .clone();
        assert_eq!(a.origin.kind, "claude-science");
        assert_eq!(
            a.origin.source_project.as_deref(),
            Some("Analyses Feux-Albédo")
        );
        s.update(&a.id, "Texte A corrigé dans Atelier", None)
            .unwrap();
        let r = s.import(vec![cs("a", "Texte A", "/p")]).unwrap();
        assert_eq!(r.unchanged, 1, "la correction locale n'est pas écrasée");
        assert_eq!(s.get(&a.id).unwrap().text, "Texte A corrigé dans Atelier");
        // changer de projet cible déplace sans dupliquer
        let r = s.import(vec![cs("b", "Texte B v2", "/autre")]).unwrap();
        assert_eq!(r.updated, 1);
        assert_eq!(s.len(), 2);
        assert_eq!(
            s.imported_sources().get("b").map(String::as_str),
            Some("/autre")
        );
        assert_eq!(s.remove_imported(Some("Analyses Feux-Albédo")).unwrap(), 2);
        assert!(s.is_empty());
    }

    #[test]
    fn la_selection_suit_les_mots_rares_et_le_projet() {
        let dir = tempdir().unwrap();
        let mut s = MemoryStore::open(dir.path().join("m.json"));
        let o = manual;
        s.add(
            "/these",
            "Le dépôt de carbone suie vient de FireWork moins noFire",
            o(),
        )
        .unwrap();
        s.add(
            "/these",
            "Les figures suivent la largeur de colonne de Nature",
            o(),
        )
        .unwrap();
        s.add("/these", "Le panel albédo utilise la fenêtre JJA", o())
            .unwrap();
        s.add(
            "/autre",
            "FireWork est aussi utilisé dans le projet de bourse",
            o(),
        )
        .unwrap();
        s.add("", "Répondre en français, concis", o()).unwrap();
        let choisis = s.relevant(
            "/these",
            "Refais la carte du dépôt FireWork",
            &HashSet::new(),
            3,
        );
        assert_eq!(choisis.len(), 1);
        assert!(choisis[0].text.contains("FireWork moins noFire"));
        let rien = s.relevant("/these", "ok", &HashSet::new(), 3);
        assert!(
            rien.is_empty(),
            "une demande sans mot porteur n'injecte rien"
        );
        let deja: HashSet<String> = [choisis[0].id.clone()].into();
        assert!(s.relevant("/these", "dépôt FireWork", &deja, 3).is_empty());
        let global = s.relevant("/these", "réponds en français", &HashSet::new(), 3);
        assert_eq!(
            global.len(),
            1,
            "les souvenirs de tous les projets comptent aussi"
        );
    }

    #[test]
    fn un_mot_present_partout_ne_choisit_rien() {
        let dir = tempdir().unwrap();
        let mut s = MemoryStore::open(dir.path().join("m.json"));
        for i in 0..12 {
            s.add("/p", &format!("Albédo de la zone {i}"), manual())
                .unwrap();
        }
        s.add("/p", "Albédo sous le seuil hypsométrique", manual())
            .unwrap();
        assert!(s.relevant("/p", "albédo", &HashSet::new(), 5).is_empty());
        let choisis = s.relevant("/p", "albédo et seuil", &HashSet::new(), 5);
        assert_eq!(choisis.len(), 1);
        assert!(choisis[0].text.contains("seuil"));
    }

    #[test]
    fn les_mots_sont_plies_et_filtres() {
        assert_eq!(
            tokens("L'Albédo de JJA 2015, et les"),
            ["albedo", "jja", "2015"]
        );
    }
}
