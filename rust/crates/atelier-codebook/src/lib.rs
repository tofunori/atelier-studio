//! Codage qualitatif, façon NVivo : le livre de codes `codebook.json`, rangé à
//! côté du store d'annotations `pdf_annots.json`, et les codes posés sur les
//! annotations.
//!
//! - Un code : `{id, name, parent, memo, order}`. `parent` est l'id du code
//!   parent ou `null` : les codes forment un arbre de thèmes et sous-thèmes.
//! - Une annotation du store porte `codes` (ids gardés par l'utilisateur) et
//!   `suggested` (ids proposés par Claude, en attente : garder ou retirer).
//!   Les deux listes sont absentes quand elles sont vides.
//! - Un passage codé sans surlignage est une annotation `kind: "code"` : elle
//!   n'a pas d'autre raison d'exister, elle disparaît avec son dernier code.
//!
//! Les deux fichiers s'écrivent sous le verrou du serveur galerie
//! (`pdf_annots.lock`), partagé avec le lecteur, la passerelle iPhone et le MCP
//! des annotations ; un fichier illisible n'est jamais remplacé.

use fs2::FileExt;
use serde_json::{json, Map, Value};
use std::fs::OpenOptions;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};

pub const FILE_NAME: &str = "codebook.json";
pub const STORE_NAME: &str = "pdf_annots.json";
pub const LOCK_NAME: &str = "pdf_annots.lock";
pub const MAX_NAME: usize = 80;
pub const MAX_MEMO: usize = 4000;
/// Champ des codes gardés, et des codes proposés par Claude.
pub const CODES: &str = "codes";
pub const SUGGESTED: &str = "suggested";

#[derive(Debug, Clone, PartialEq)]
pub struct Code {
    pub id: String,
    pub name: String,
    pub parent: Option<String>,
    pub memo: String,
    pub order: i64,
}

impl Code {
    pub fn to_value(&self) -> Value {
        json!({"id": self.id, "name": self.name, "parent": self.parent,
            "memo": self.memo, "order": self.order})
    }
}

#[derive(Debug, Clone, Default)]
pub struct Codebook {
    pub codes: Vec<Code>,
    /// Clés de premier niveau inconnues, gardées telles quelles.
    extra: Map<String, Value>,
}

/// Minuscules sans accents ni espaces doublés : deux codes frères ne peuvent
/// pas porter des noms qui ne diffèrent que par là.
pub fn fold(s: &str) -> String {
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .flat_map(char::to_lowercase)
        .map(|c| match c {
            'à' | 'â' | 'ä' | 'á' | 'ã' => 'a',
            'ç' => 'c',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' | 'ì' => 'i',
            'ô' | 'ö' | 'ó' | 'ò' | 'õ' => 'o',
            'ù' | 'û' | 'ü' | 'ú' => 'u',
            'ÿ' => 'y',
            'œ' => 'o',
            other => other,
        })
        .collect()
}

fn clean_name(name: &str) -> Result<String, String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err("Le nom du code est vide.".into());
    }
    if name.chars().count() > MAX_NAME {
        return Err(format!("Nom de code trop long ({MAX_NAME} caractères au plus)."));
    }
    // « › » sépare les niveaux dans les chemins affichés et cherchés.
    if name.contains('›') {
        return Err("Le nom d'un code ne peut pas contenir « › ».".into());
    }
    Ok(name)
}

fn clean_memo(memo: &str) -> Result<String, String> {
    let memo = memo.trim().to_string();
    if memo.chars().count() > MAX_MEMO {
        return Err(format!("Mémo trop long ({MAX_MEMO} caractères au plus)."));
    }
    Ok(memo)
}

fn new_id() -> String {
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed) as u64 ^ (std::process::id() as u64) << 12;
    format!("c{}{}", base36(ms), base36(seq % 46_656))
}

fn base36(mut n: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut out = Vec::new();
    loop {
        out.push(DIGITS[(n % 36) as usize]);
        n /= 36;
        if n == 0 {
            break;
        }
    }
    out.reverse();
    String::from_utf8(out).unwrap_or_default()
}

impl Codebook {
    pub fn parse(value: &Value) -> Self {
        let mut extra = value.as_object().cloned().unwrap_or_default();
        let list = extra.remove("codes");
        let mut codes: Vec<Code> = Vec::new();
        for (i, c) in list.as_ref().and_then(Value::as_array).into_iter().flatten().enumerate() {
            let text = |k: &str| c.get(k).and_then(Value::as_str).unwrap_or("").trim().to_string();
            let id = text("id");
            let name = text("name");
            if id.is_empty() || name.is_empty() || codes.iter().any(|seen| seen.id == id) {
                continue;
            }
            let parent = Some(text("parent")).filter(|p| !p.is_empty() && *p != id);
            codes.push(Code {
                id,
                name,
                parent,
                memo: text("memo"),
                order: c.get("order").and_then(Value::as_i64).unwrap_or(i as i64),
            });
        }
        // Un parent disparu, ou une boucle écrite à la main, remonte le code
        // à la racine plutôt que de le perdre.
        let ids: Vec<String> = codes.iter().map(|c| c.id.clone()).collect();
        for i in 0..codes.len() {
            if codes[i].parent.as_ref().is_some_and(|p| !ids.contains(p)) {
                codes[i].parent = None;
            }
        }
        let mut book = Codebook { codes, extra };
        for i in 0..book.codes.len() {
            let id = book.codes[i].id.clone();
            if book.ancestors(&id).contains(&id) {
                book.codes[i].parent = None;
            }
        }
        book
    }

    pub fn to_value(&self) -> Value {
        let mut out = self.extra.clone();
        out.insert("version".into(), json!(1));
        out.insert("codes".into(), Value::Array(self.codes.iter().map(Code::to_value).collect()));
        Value::Object(out)
    }

    pub fn get(&self, id: &str) -> Option<&Code> {
        self.codes.iter().find(|c| c.id == id)
    }

    /// Ids des ancêtres de `id`, du parent à la racine (s'arrête sur une boucle).
    fn ancestors(&self, id: &str) -> Vec<String> {
        let mut out: Vec<String> = Vec::new();
        let mut cur = self.get(id).and_then(|c| c.parent.clone());
        while let Some(p) = cur {
            if out.contains(&p) {
                out.push(p);
                break;
            }
            cur = self.get(&p).and_then(|c| c.parent.clone());
            out.push(p);
        }
        out
    }

    /// « Méthode › Limites » : le chemin d'un code depuis la racine.
    pub fn path(&self, id: &str) -> String {
        let Some(code) = self.get(id) else { return String::new() };
        let mut names: Vec<String> = self
            .ancestors(id)
            .iter()
            .filter_map(|a| self.get(a).map(|c| c.name.clone()))
            .collect();
        names.reverse();
        names.push(code.name.clone());
        names.join(" › ")
    }

    pub fn children(&self, parent: Option<&str>) -> Vec<&Code> {
        let mut out: Vec<&Code> = self.codes.iter().filter(|c| c.parent.as_deref() == parent).collect();
        out.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| fold(&a.name).cmp(&fold(&b.name))));
        out
    }

    /// L'arbre à plat, parents avant enfants, avec la profondeur de chacun.
    pub fn ordered(&self) -> Vec<(usize, &Code)> {
        fn walk<'a>(book: &'a Codebook, parent: Option<&str>, depth: usize, out: &mut Vec<(usize, &'a Code)>) {
            for c in book.children(parent) {
                out.push((depth, c));
                walk(book, Some(&c.id), depth + 1, out);
            }
        }
        let mut out = Vec::new();
        walk(self, None, 0, &mut out);
        out
    }

    /// `id` et tous ses sous-codes.
    pub fn descendants(&self, id: &str) -> Vec<String> {
        let mut out = vec![id.to_string()];
        let mut i = 0;
        while i < out.len() {
            let cur = out[i].clone();
            for c in &self.codes {
                if c.parent.as_deref() == Some(cur.as_str()) && !out.contains(&c.id) {
                    out.push(c.id.clone());
                }
            }
            i += 1;
        }
        out
    }

    /// Retrouve un code par son id, son chemin (« Méthode › Limites ») ou son
    /// nom, sans accents ni casse. Un nom porté par deux codes est refusé avec
    /// leurs chemins.
    pub fn resolve(&self, wanted: &str) -> Result<&Code, String> {
        let wanted = wanted.trim();
        if let Some(c) = self.get(wanted) {
            return Ok(c);
        }
        let w = fold(wanted);
        let w_path: String = w.split('›').map(str::trim).collect::<Vec<_>>().join(" › ");
        if let Some(c) = self.codes.iter().find(|c| fold(&self.path(&c.id)) == w_path) {
            return Ok(c);
        }
        let named: Vec<&Code> = self.codes.iter().filter(|c| fold(&c.name) == w).collect();
        match named.as_slice() {
            [one] => Ok(one),
            [] => Err(format!("Aucun code « {wanted} » dans le livre de codes.")),
            many => Err(format!(
                "Plusieurs codes s'appellent « {wanted} » : {} ; donner le chemin complet.",
                many.iter().map(|c| format!("« {} »", self.path(&c.id))).collect::<Vec<_>>().join(", ")
            )),
        }
    }

    fn sibling_named(&self, parent: Option<&str>, name: &str, except: Option<&str>) -> Option<&Code> {
        let f = fold(name);
        self.codes
            .iter()
            .find(|c| c.parent.as_deref() == parent && fold(&c.name) == f && Some(c.id.as_str()) != except)
    }

    /// Crée un code ; un code du même nom sous le même parent est renvoyé tel
    /// quel (`false` : rien de créé).
    pub fn create(&mut self, name: &str, parent: Option<&str>, memo: &str) -> Result<(Code, bool), String> {
        let name = clean_name(name)?;
        let memo = clean_memo(memo)?;
        let parent = parent.map(str::trim).filter(|p| !p.is_empty()).map(str::to_string);
        if let Some(p) = &parent {
            if self.get(p).is_none() {
                return Err("Code parent introuvable.".into());
            }
        }
        if let Some(existing) = self.sibling_named(parent.as_deref(), &name, None) {
            return Ok((existing.clone(), false));
        }
        let order = self
            .codes
            .iter()
            .filter(|c| c.parent == parent)
            .map(|c| c.order + 1)
            .max()
            .unwrap_or(0);
        let mut id = new_id();
        while self.get(&id).is_some() {
            id = new_id();
        }
        let code = Code { id, name, parent, memo, order };
        self.codes.push(code.clone());
        Ok((code, true))
    }

    /// Renomme, déplace (`parent: Some(None)` = à la racine), change le mémo
    /// ou le rang d'un code.
    pub fn update(
        &mut self,
        id: &str,
        name: Option<&str>,
        parent: Option<Option<&str>>,
        memo: Option<&str>,
        order: Option<i64>,
    ) -> Result<Code, String> {
        let Some(current) = self.get(id).cloned() else {
            return Err("Code introuvable.".into());
        };
        let name = match name {
            Some(n) => clean_name(n)?,
            None => current.name.clone(),
        };
        let parent: Option<String> = match parent {
            Some(p) => p.map(str::trim).filter(|p| !p.is_empty()).map(str::to_string),
            None => current.parent.clone(),
        };
        if let Some(p) = &parent {
            if self.get(p).is_none() {
                return Err("Code parent introuvable.".into());
            }
            if self.descendants(id).contains(p) {
                return Err("Un code ne peut pas aller sous l'un de ses sous-codes.".into());
            }
        }
        if self.sibling_named(parent.as_deref(), &name, Some(id)).is_some() {
            return Err(format!("Un code « {name} » existe déjà à cet endroit."));
        }
        let memo = match memo {
            Some(m) => clean_memo(m)?,
            None => current.memo.clone(),
        };
        let moved = parent != current.parent;
        let order = match order {
            Some(o) => o,
            None if moved => self
                .codes
                .iter()
                .filter(|c| c.parent == parent && c.id != id)
                .map(|c| c.order + 1)
                .max()
                .unwrap_or(0),
            None => current.order,
        };
        let code = self.codes.iter_mut().find(|c| c.id == id).expect("code présent");
        code.name = name;
        code.parent = parent;
        code.memo = memo;
        code.order = order;
        Ok(code.clone())
    }

    /// Supprime un code et ses sous-codes ; renvoie leurs ids, à retirer aussi
    /// des annotations (`strip`).
    pub fn delete(&mut self, id: &str) -> Result<Vec<String>, String> {
        if self.get(id).is_none() {
            return Err("Code introuvable.".into());
        }
        let gone = self.descendants(id);
        self.codes.retain(|c| !gone.contains(&c.id));
        Ok(gone)
    }
}

/// Ids d'une liste d'annotation (`codes` ou `suggested`).
pub fn ids(annot: &Value, key: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for v in annot.get(key).and_then(Value::as_array).into_iter().flatten() {
        if let Some(s) = v.as_str().map(str::trim).filter(|s| !s.is_empty()) {
            if !out.iter().any(|seen| seen == s) {
                out.push(s.to_string());
            }
        }
    }
    out
}

fn set_ids(annot: &mut Value, key: &str, list: Vec<String>) {
    let Some(obj) = annot.as_object_mut() else { return };
    if list.is_empty() {
        obj.remove(key);
    } else {
        obj.insert(key.into(), json!(list));
    }
}

/// Ce qu'on change aux codes d'une annotation.
#[derive(Debug, Default, Clone)]
pub struct Change {
    /// Codes posés par l'utilisateur (sortent des propositions).
    pub add: Vec<String>,
    pub remove: Vec<String>,
    /// Propositions de Claude gardées : elles deviennent des codes.
    pub keep: Vec<String>,
    /// Propositions de Claude retirées.
    pub reject: Vec<String>,
    /// Nouvelles propositions (ignorées si le code est déjà posé).
    pub suggest: Vec<String>,
}

/// Applique `change` ; vrai si l'annotation a changé.
pub fn apply(annot: &mut Value, change: &Change) -> bool {
    let before = (ids(annot, CODES), ids(annot, SUGGESTED));
    let (mut codes, mut suggested) = before.clone();
    for id in change.keep.iter().filter(|id| suggested.contains(id)) {
        if !codes.contains(id) {
            codes.push(id.clone());
        }
    }
    suggested.retain(|s| !change.keep.contains(s) && !change.reject.contains(s));
    for id in &change.add {
        if !codes.contains(id) {
            codes.push(id.clone());
        }
    }
    codes.retain(|c| !change.remove.contains(c));
    suggested.retain(|s| !codes.contains(s));
    for id in &change.suggest {
        if !codes.contains(id) && !suggested.contains(id) {
            suggested.push(id.clone());
        }
    }
    if (codes.clone(), suggested.clone()) == before {
        return false;
    }
    set_ids(annot, CODES, codes);
    set_ids(annot, SUGGESTED, suggested);
    true
}

/// Passage codé (`kind: "code"`) qui n'a plus aucun code ni proposition.
pub fn is_empty_code_passage(annot: &Value) -> bool {
    annot.get("kind").and_then(Value::as_str) == Some("code")
        && ids(annot, CODES).is_empty()
        && ids(annot, SUGGESTED).is_empty()
}

/// Retire `gone` de toutes les annotations du store, et les passages codés
/// devenus vides ; vrai si le store a changé.
pub fn strip(store: &mut Map<String, Value>, gone: &[String]) -> bool {
    let change = Change { remove: gone.to_vec(), reject: gone.to_vec(), ..Default::default() };
    let mut changed = false;
    for list in store.values_mut() {
        let Some(list) = list.as_array_mut() else { continue };
        for annot in list.iter_mut() {
            changed |= apply(annot, &change);
        }
        let before = list.len();
        list.retain(|a| !is_empty_code_passage(a));
        changed |= list.len() != before;
    }
    changed
}

/// Lit le livre de codes de `dir` ; absent = livre vide, illisible = erreur.
pub fn read(dir: &Path) -> Result<Codebook, String> {
    let path = dir.join(FILE_NAME);
    match std::fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .map(|v| Codebook::parse(&v))
            .map_err(|e| format!("{} illisible : {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Codebook::default()),
        Err(e) => Err(e.to_string()),
    }
}

fn write_atomic(dir: &Path, name: &str, value: &Value) -> Result<(), String> {
    let payload = format!("{}\n", serde_json::to_string_pretty(value).map_err(|e| e.to_string())?);
    let tmp = dir.join(format!(".{name}.{}.codes.tmp", std::process::id()));
    std::fs::write(&tmp, payload).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(name)).map_err(|e| e.to_string())
}

/// Ouvre le store d'annotations et le livre de codes de `dir` sous le verrou
/// du serveur galerie ; `op` renvoie sa valeur et ce qu'elle a changé (store,
/// livre). Seuls les fichiers changés sont réécrits, chacun d'un bloc.
pub fn with_locked<T>(
    dir: &Path,
    op: impl FnOnce(&mut Map<String, Value>, &mut Codebook) -> Result<(T, bool, bool), String>,
) -> Result<T, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join(LOCK_NAME))
        .map_err(|e| e.to_string())?;
    lock.lock_exclusive().map_err(|e| e.to_string())?;
    let result = (|| {
        let store_path = dir.join(STORE_NAME);
        let mut store = match std::fs::read_to_string(&store_path) {
            Ok(raw) => match serde_json::from_str::<Value>(&raw) {
                Ok(Value::Object(map)) => map,
                Ok(_) => return Err(format!("{} n'est pas un objet JSON", store_path.display())),
                Err(e) => return Err(format!("{} illisible, rien n'est écrit : {e}", store_path.display())),
            },
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Map::new(),
            Err(e) => return Err(e.to_string()),
        };
        let mut book = read(dir)?;
        let (value, store_changed, book_changed) = op(&mut store, &mut book)?;
        if book_changed {
            write_atomic(dir, FILE_NAME, &book.to_value())?;
        }
        if store_changed {
            write_atomic(dir, STORE_NAME, &Value::Object(store))?;
        }
        Ok(value)
    })();
    let _ = FileExt::unlock(&lock);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book() -> Codebook {
        let mut b = Codebook::default();
        let (proc_, _) = b.create("Processus", None, "").unwrap();
        b.create("Rétroaction albédo", Some(&proc_.id), "Boucle").unwrap();
        let (meth, _) = b.create("Méthode", None, "").unwrap();
        b.create("Limites", Some(&meth.id), "").unwrap();
        b
    }

    #[test]
    fn tree_paths_and_resolution() {
        let b = book();
        let fb = b.resolve("retroaction ALBEDO").unwrap();
        assert_eq!(b.path(&fb.id), "Processus › Rétroaction albédo");
        assert_eq!(b.resolve("Méthode › Limites").unwrap().name, "Limites");
        assert!(b.resolve("Inconnu").is_err());
        let order: Vec<(usize, String)> = b.ordered().into_iter().map(|(d, c)| (d, c.name.clone())).collect();
        assert_eq!(order, vec![(0, "Processus".into()), (1, "Rétroaction albédo".into()),
            (0, "Méthode".into()), (1, "Limites".into())]);
    }

    #[test]
    fn same_name_under_same_parent_is_reused_and_cycles_are_refused() {
        let mut b = book();
        let proc_ = b.resolve("Processus").unwrap().id.clone();
        let (again, created) = b.create("  processus ", None, "").unwrap();
        assert!(!created);
        assert_eq!(again.id, proc_);
        let child = b.resolve("Rétroaction albédo").unwrap().id.clone();
        assert!(b.update(&proc_, None, Some(Some(&child)), None, None).is_err());
        assert!(b.update(&child, Some("Limites"), Some(None), None, None).is_ok());
        assert!(b.create("a › b", None, "").is_err());
    }

    #[test]
    fn deleting_a_code_takes_its_subcodes_and_strips_annotations() {
        let mut b = book();
        let proc_ = b.resolve("Processus").unwrap().id.clone();
        let child = b.resolve("Rétroaction albédo").unwrap().id.clone();
        let keep = b.resolve("Limites").unwrap().id.clone();
        let gone = b.delete(&proc_).unwrap();
        assert_eq!(gone, vec![proc_.clone(), child.clone()]);
        let mut store = json!({"zotero/ABCD1234/a.pdf": [
            {"id": "1", "kind": "hl", "codes": [child, keep]},
            {"id": "2", "kind": "code", "suggested": [child]},
        ]}).as_object().unwrap().clone();
        assert!(strip(&mut store, &gone));
        let list = store["zotero/ABCD1234/a.pdf"].as_array().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(ids(&list[0], CODES), vec![keep]);
    }

    #[test]
    fn suggestions_are_kept_or_rejected() {
        let mut a = json!({"id": "1", "kind": "hl"});
        assert!(apply(&mut a, &Change { suggest: vec!["x".into(), "y".into()], ..Default::default() }));
        assert!(apply(&mut a, &Change { keep: vec!["x".into()], reject: vec!["y".into()], ..Default::default() }));
        assert_eq!(ids(&a, CODES), vec!["x"]);
        assert!(a.get(SUGGESTED).is_none());
        // une proposition d'un code déjà posé n'est pas ajoutée
        assert!(!apply(&mut a, &Change { suggest: vec!["x".into()], ..Default::default() }));
    }

    #[test]
    fn parse_survives_lost_parents_and_loops() {
        let b = Codebook::parse(&json!({"codes": [
            {"id": "a", "name": "A", "parent": "b"},
            {"id": "b", "name": "B", "parent": "a"},
            {"id": "c", "name": "C", "parent": "zz"},
            {"id": "c", "name": "doublon"},
        ]}));
        assert_eq!(b.codes.len(), 3);
        assert!(b.get("c").unwrap().parent.is_none());
        assert!(!b.ordered().is_empty());
        assert!(b.codes.iter().all(|c| !b.ancestors(&c.id).contains(&c.id) || c.parent.is_none()));
    }

    #[test]
    fn with_locked_never_replaces_an_unreadable_store() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join(STORE_NAME), "{pas du json").unwrap();
        let res = with_locked(dir.path(), |_, b| {
            b.create("A", None, "")?;
            Ok(((), true, true))
        });
        assert!(res.is_err());
        assert!(!dir.path().join(FILE_NAME).exists());
        assert_eq!(std::fs::read_to_string(dir.path().join(STORE_NAME)).unwrap(), "{pas du json");
    }

    #[test]
    fn with_locked_writes_both_files() {
        let dir = tempfile::tempdir().unwrap();
        let id = with_locked(dir.path(), |store, b| {
            let (c, _) = b.create("Carbone suie", None, "")?;
            store.insert("zotero/ABCD1234/a.pdf".into(), json!([{"id": "1", "codes": [c.id]}]));
            Ok((c.id, true, true))
        })
        .unwrap();
        let b = read(dir.path()).unwrap();
        assert_eq!(b.get(&id).unwrap().name, "Carbone suie");
        let raw = std::fs::read_to_string(dir.path().join(STORE_NAME)).unwrap();
        assert!(raw.contains(&id));
    }
}
