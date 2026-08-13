# Spécialistes (profils d'agent) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à Atelier des profils d'agent nommés et réutilisables — un prompt système, une restriction de skills et d'outils — sélectionnables par conversation et basculables en cours de route.

**Architecture:** Un catalogue global dans `profiles.json`, un nom de profil posé sur le fil, et une résolution unique en `ProfileSpec` neutre que chaque provider traduit dans ses propres arguments. Le CRUD passe par un outil MCP destiné à l'agent ; l'UI ne fait que sélectionner.

**Tech Stack:** Rust (workspace `rust/`, crates `atelier-store`, `atelier-runtime`, `atelier-providers`, `atelier-protocol`, `atelier-agent-mcp`), React + TypeScript (`src/`), Vitest, `cargo test`.

**Spec :** [docs/superpowers/specs/2026-08-13-specialistes-profils-agent-design.md](../specs/2026-08-13-specialistes-profils-agent-design.md)

## Global Constraints

- Toutes les commandes `cargo` se lancent depuis `rust/` (racine du workspace).
- `npx tsc --noEmit` et `npx vite build` doivent passer à la fin (ignorer `src/test_auto_review*.ts`).
- Système de design contraignant : tailles de texte 10/11/12/13/15px uniquement ; poids 400/500/600 ; rayons 6px (contrôles), 10px (cartes/menus), 999px (pilules) ; espacement en multiples de 4 ; transitions 120–150ms ; aucune couleur en dur — variables CSS uniquement.
- Aucun `<button>` nu hors `src/components/ui/` et `src/components/shadcn/` — utiliser `Button`, `IconButton` ou `RowButton`. Verrouillé par `src/components/ui/css-contract.test.ts`.
- Icônes : SVG monochromes, `stroke-width` 1.3–1.5, `fill="none"`, jamais d'emoji.
- Accent d'état actif = `var(--primary)` (orange). Jamais de bleu, jamais de `color_key` par profil.
- Le stockage JSON suit le patron de `rust/crates/atelier-store/src/threads.rs` : lecture tolérante, champs inconnus préservés via `#[serde(flatten)]`, écriture par `write_file_atomic`.
- Ne jamais pusher. Commits fréquents et petits (des auto-commits tiers balaient le dépôt).
- Providers concernés : `claude`, `grok`, `codex`. Aucun autre ne doit changer de comportement.

---

## File Structure

| Fichier | Responsabilité |
| --- | --- |
| `rust/crates/atelier-store/src/profiles.rs` | **Créé.** Struct `Profile`, `ProfileStore` (persistance `profiles.json`) |
| `rust/crates/atelier-store/src/lib.rs` | Modifié — déclare et réexporte le module |
| `rust/crates/atelier-store/src/threads.rs` | Modifié — champs `profile` et `profileHash` sur `Thread` |
| `rust/crates/atelier-runtime/src/profiles.rs` | **Créé.** `ProfileSpec`, `resolve_profile`, `spec_hash` |
| `rust/crates/atelier-providers/src/traits.rs` | Modifié — 4 champs sur `SendRequest` |
| `rust/crates/atelier-providers/src/claude.rs` | Modifié — traduction dans `build_args` |
| `rust/crates/atelier-providers/src/grok.rs` | Modifié — args de lancement + respawn conditionné au hash |
| `rust/crates/atelier-providers/src/codex.rs` | Modifié — `baseInstructions` dans `thread_opts` |
| `rust/crates/atelier-runtime/src/state.rs` | Modifié — ouvre `profiles.json` |
| `rust/crates/atelier-runtime/src/send.rs` | Modifié — résolution au site de construction de `SendRequest` |
| `rust/crates/atelier-runtime/src/ws_router.rs` | Modifié — second site + 4 messages WS |
| `rust/crates/atelier-protocol/src/lib.rs` | Modifié — capability `profiles` |
| `rust/crates/atelier-agent-mcp/src/schema.rs` | Modifié — définition de `atelier_specialists` |
| `rust/crates/atelier-agent-mcp/src/server.rs` | Modifié — dispatch du second outil |
| `rust/crates/atelier-agent-mcp/src/bridge.rs` | Modifié — actions vers le runtime |
| `src/lib/profiles.ts` | **Créé.** Types et helpers frontend |
| `src/components/chat/SpecialistMenu.tsx` | **Créé.** Sous-menu de sélection |
| `src/components/chat/ComposerControls.tsx` | Modifié — rangée, glyphe, pastille |
| `src/components/Settings.tsx` | Modifié — section « Spécialistes » |
| `src/lib/providers.ts` | Modifié — `profiles?: boolean` |
| `~/.claude/skills/specialists/SKILL.md` | **Créé.** Flux de création pour l'agent |

L'ordre des tâches suit la dépendance : stockage → résolution → providers → transport → MCP → UI.

### Écart assumé par rapport à la spec

La spec prévoit qu'un `Thread.profile` orphelin (profil supprimé) « pose une
note dans le fil ». Le plan ne l'implémente pas : injecter un message dans le
transcript pour un cas de configuration serait intrusif et polluerait
l'historique du provider. À la place, le nom orphelin s'affiche **barré dans
le sous-menu** (Task 10), et la résolution le traite comme « aucun ». Le
comportement fonctionnel est identique ; seule la façon de le signaler change.

---

### Task 1: Store des profils

**Files:**
- Create: `rust/crates/atelier-store/src/profiles.rs`
- Modify: `rust/crates/atelier-store/src/lib.rs:12` (liste des modules), `:21` (réexports)

**Interfaces:**
- Consomme : `crate::{iso_now, write_file_atomic}`
- Produit : `Profile { name, display_name, description, system_prompt, icon_key, unrestricted, skill_names, skill_tombstones, allowed_tools, denied_tools, enabled, created_at, updated_at, extra }` et `ProfileStore::{open, list, get, upsert, rename, delete}`. `ICON_KEYS: &[&str]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `rust/crates/atelier-store/src/profiles.rs` avec seulement le bloc de tests :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn store(dir: &std::path::Path) -> ProfileStore {
        ProfileStore::open(dir.join("profiles.json"))
    }

    #[test]
    fn upsert_then_reopen_roundtrips() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        s.upsert(serde_json::json!({
            "name": "REDACTEUR",
            "displayName": "Rédacteur",
            "description": "Rédige.",
            "systemPrompt": "Tu es le Rédacteur.",
            "iconKey": "pen"
        }))
        .unwrap();
        let reopened = store(dir.path());
        let p = reopened.get("REDACTEUR").unwrap();
        assert_eq!(p.display_name, "Rédacteur");
        assert_eq!(p.icon_key, "pen");
        assert!(p.unrestricted, "un profil neuf voit tout le catalogue");
        assert!(p.enabled);
    }

    #[test]
    fn unknown_fields_survive_a_roundtrip() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        s.upsert(serde_json::json!({"name": "A", "displayName": "A", "futureField": 42}))
            .unwrap();
        let reopened = store(dir.path());
        assert_eq!(
            reopened.get("A").unwrap().extra.get("futureField"),
            Some(&serde_json::json!(42))
        );
    }

    #[test]
    fn rejects_bad_names() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        for bad in ["minuscule", "A", "AVEC-TIRET", "A".repeat(33).as_str()] {
            assert!(
                s.upsert(serde_json::json!({"name": bad, "displayName": "x"}))
                    .is_err(),
                "{bad} aurait dû être refusé"
            );
        }
    }

    #[test]
    fn rejects_unknown_icon_key() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        assert!(s
            .upsert(serde_json::json!({"name": "A", "displayName": "A", "iconKey": "licorne"}))
            .is_err());
    }

    #[test]
    fn upsert_merges_instead_of_replacing() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        s.upsert(serde_json::json!({"name": "A", "displayName": "A", "systemPrompt": "p"}))
            .unwrap();
        s.upsert(serde_json::json!({"name": "A", "description": "d"}))
            .unwrap();
        let p = s.get("A").unwrap();
        assert_eq!(p.system_prompt, "p", "le champ absent du patch est conservé");
        assert_eq!(p.description, "d");
    }

    #[test]
    fn rename_moves_the_record() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        s.upsert(serde_json::json!({"name": "A", "displayName": "A"}))
            .unwrap();
        assert!(s.rename("A", "B").unwrap());
        assert!(s.get("A").is_none());
        assert_eq!(s.get("B").unwrap().name, "B");
    }

    #[test]
    fn rename_onto_an_existing_name_fails() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        s.upsert(serde_json::json!({"name": "A", "displayName": "A"}))
            .unwrap();
        s.upsert(serde_json::json!({"name": "B", "displayName": "B"}))
            .unwrap();
        assert!(s.rename("A", "B").is_err());
    }

    #[test]
    fn delete_reports_whether_it_existed() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        s.upsert(serde_json::json!({"name": "A", "displayName": "A"}))
            .unwrap();
        assert!(s.delete("A").unwrap());
        assert!(!s.delete("A").unwrap());
    }

    #[test]
    fn list_is_sorted_by_display_name() {
        let dir = tempdir().unwrap();
        let mut s = store(dir.path());
        for (n, d) in [("Z", "Alpha"), ("A", "Zeta")] {
            s.upsert(serde_json::json!({"name": n, "displayName": d}))
                .unwrap();
        }
        let names: Vec<_> = s.list().into_iter().map(|p| p.name).collect();
        assert_eq!(names, vec!["Z", "A"]);
    }
}
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-store profiles`
Expected: FAIL — `cannot find type ProfileStore in this scope`.

- [ ] **Step 3: Implémenter le module**

En tête de `rust/crates/atelier-store/src/profiles.rs`, au-dessus du bloc de tests :

```rust
//! Catalogue des spécialistes — `profiles.json`.
//!
//! Même patron que `threads.rs` : lecture tolérante, champs inconnus
//! préservés, écriture atomique. Le catalogue est global (une seule instance
//! pour toute l'app), contrairement aux fils qui portent un `projectRoot`.

use crate::{iso_now, write_file_atomic};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

/// Jeu fermé de glyphes. L'agent choisit dedans à la création ; aucun
/// sélecteur d'icônes n'est dessiné côté UI.
pub const ICON_KEYS: &[&str] = &[
    "pen", "search", "chart", "book", "flask", "code", "image", "compass", "layers", "sparkle",
    "target", "wrench",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub system_prompt: String,
    #[serde(default = "default_icon")]
    pub icon_key: String,
    /// `true` = voit le catalogue vivant complet, moins les tombstones.
    #[serde(default = "default_true")]
    pub unrestricted: bool,
    #[serde(default)]
    pub skill_names: Vec<String>,
    /// Soustractions sur un profil illimité — une liste blanche ne peut pas
    /// exprimer « tout le catalogue futur, sauf ceux-ci ».
    #[serde(default)]
    pub skill_tombstones: Vec<String>,
    #[serde(default)]
    pub allowed_tools: Vec<String>,
    #[serde(default)]
    pub denied_tools: Vec<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
    /// Préserve les champs écrits par une version plus récente.
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

fn default_icon() -> String {
    "sparkle".into()
}
fn default_true() -> bool {
    true
}

/// UPPER_SNAKE, 2–32, lettres/chiffres/underscore. Le nom est l'identité
/// stable référencée par les fils : il ne doit pas dépendre de la casse.
pub fn valid_name(name: &str) -> bool {
    let n = name.len();
    (2..=32).contains(&n)
        && name
            .chars()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
}

fn normalize(mut raw: Value) -> Option<Profile> {
    let obj = raw.as_object_mut()?;
    let name = obj.get("name")?.as_str()?.to_string();
    if !valid_name(&name) {
        return None;
    }
    let updated_at = obj
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(iso_now);
    let created_at = obj
        .get("createdAt")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| updated_at.clone());
    obj.insert("createdAt".into(), Value::String(created_at));
    obj.insert("updatedAt".into(), Value::String(updated_at));
    serde_json::from_value(raw).ok()
}

#[derive(Debug)]
pub struct ProfileStore {
    file_path: PathBuf,
    profiles: HashMap<String, Profile>,
}

impl ProfileStore {
    pub fn open(file_path: impl Into<PathBuf>) -> Self {
        let file_path = file_path.into();
        let mut profiles = HashMap::new();
        if let Ok(raw) = std::fs::read_to_string(&file_path) {
            if let Ok(Value::Array(arr)) = serde_json::from_str(&raw) {
                for item in arr {
                    if let Some(p) = normalize(item) {
                        profiles.insert(p.name.clone(), p);
                    }
                }
            }
        }
        Self {
            file_path,
            profiles,
        }
    }

    /// Tri par libellé affiché : c'est l'ordre du picker.
    pub fn list(&self) -> Vec<Profile> {
        let mut v: Vec<_> = self.profiles.values().cloned().collect();
        v.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
        v
    }

    pub fn get(&self, name: &str) -> Option<&Profile> {
        self.profiles.get(name)
    }

    /// Fusionne le patch sur l'enregistrement existant — un champ absent du
    /// patch n'est jamais effacé.
    pub fn upsert(&mut self, patch: Value) -> Result<Profile, String> {
        let name = patch
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "nom de profil manquant".to_string())?
            .to_string();
        if !valid_name(&name) {
            return Err(format!(
                "nom « {name} » invalide — UPPER_SNAKE, 2 à 32 caractères"
            ));
        }
        if let Some(icon) = patch.get("iconKey").and_then(|v| v.as_str()) {
            if !ICON_KEYS.contains(&icon) {
                return Err(format!("iconKey « {icon} » hors du jeu autorisé"));
            }
        }
        let mut merged = match self.profiles.get(&name) {
            Some(p) => serde_json::to_value(p).unwrap_or(Value::Object(Default::default())),
            None => Value::Object(Default::default()),
        };
        if let (Some(mo), Some(po)) = (merged.as_object_mut(), patch.as_object()) {
            for (k, v) in po {
                mo.insert(k.clone(), v.clone());
            }
            mo.insert("updatedAt".into(), Value::String(iso_now()));
        }
        let p = normalize(merged).ok_or_else(|| "profil illisible après fusion".to_string())?;
        self.profiles.insert(p.name.clone(), p.clone());
        self.persist().map_err(|e| e.to_string())?;
        Ok(p)
    }

    /// `Ok(false)` si le profil source n'existe pas ; `Err` si la cible est
    /// prise ou le nom invalide.
    pub fn rename(&mut self, from: &str, to: &str) -> Result<bool, String> {
        if !valid_name(to) {
            return Err(format!("nom « {to} » invalide"));
        }
        if self.profiles.contains_key(to) {
            return Err(format!("le profil « {to} » existe déjà"));
        }
        let Some(mut p) = self.profiles.remove(from) else {
            return Ok(false);
        };
        p.name = to.to_string();
        p.updated_at = iso_now();
        self.profiles.insert(p.name.clone(), p);
        self.persist().map_err(|e| e.to_string())?;
        Ok(true)
    }

    pub fn delete(&mut self, name: &str) -> std::io::Result<bool> {
        let existed = self.profiles.remove(name).is_some();
        if existed {
            self.persist()?;
        }
        Ok(existed)
    }

    fn persist(&self) -> std::io::Result<()> {
        let data = serde_json::to_vec_pretty(&self.list()).unwrap_or_else(|_| b"[]".to_vec());
        write_file_atomic(&self.file_path, data)
    }
}
```

Puis dans `rust/crates/atelier-store/src/lib.rs`, ajouter `mod profiles;` après `mod ledger;` (ligne 10) et le réexport après la ligne 20 :

```rust
pub use profiles::{valid_name as valid_profile_name, Profile, ProfileStore, ICON_KEYS};
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test -p atelier-store profiles`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-store/src/profiles.rs rust/crates/atelier-store/src/lib.rs
git commit -m "feat(store): catalogue des profils de spécialistes"
```

---

### Task 2: Le fil porte un profil

**Files:**
- Modify: `rust/crates/atelier-store/src/threads.rs:29` (struct), `:138-148` (clés connues), `:160-171` (construction)

**Interfaces:**
- Consomme : `Profile` (Task 1) — par le nom seulement, aucune dépendance de type
- Produit : `Thread.profile: Option<String>`, `Thread.profile_hash: Option<String>`

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter dans le bloc `#[cfg(test)] mod tests` de `threads.rs` :

```rust
#[test]
fn thread_carries_a_profile_name_and_hash() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("threads.json");
    let mut store = ThreadStore::open(&path);
    store
        .upsert(
            serde_json::json!({"id": "t1", "profile": "REDACTEUR", "profileHash": "abc"}),
            false,
        )
        .unwrap();
    let reopened = ThreadStore::open(&path);
    let t = reopened.get("t1").unwrap();
    assert_eq!(t.profile.as_deref(), Some("REDACTEUR"));
    assert_eq!(t.profile_hash.as_deref(), Some("abc"));
    assert!(
        !t.extra.contains_key("profile"),
        "profile est un champ typé, pas un extra"
    );
}

#[test]
fn thread_without_profile_stays_none() {
    let dir = tempdir().unwrap();
    let mut store = ThreadStore::open(dir.path().join("threads.json"));
    let t = store.upsert(serde_json::json!({"id": "t1"}), false).unwrap();
    assert!(t.profile.is_none());
}
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-store threads`
Expected: FAIL — `no field profile on type Thread`.

- [ ] **Step 3: Implémenter**

Dans `struct Thread`, après le champ `agent_link` (ligne 29) :

```rust
    /// Nom du spécialiste actif — jamais une copie du profil, pour qu'un
    /// changement de prompt s'applique aux fils existants.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<String>,
    /// Hash du `ProfileSpec` résolu au dernier tour. Sert au réveil de Grok,
    /// dont les arguments de lancement sont figés à la naissance du process.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_hash: Option<String>,
```

Dans le tableau `known` (ligne 138), ajouter `"profile"` et `"profileHash"`.

Dans la construction du `Thread` (ligne 160), après `agent_link,` :

```rust
        profile: obj
            .get("profile")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        profile_hash: obj
            .get("profileHash")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string),
```

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test -p atelier-store`
Expected: PASS — les tests existants de `threads.rs` inclus.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-store/src/threads.rs
git commit -m "feat(store): champs profile et profileHash sur le fil"
```

---

### Task 3: Résolution en ProfileSpec

**Files:**
- Create: `rust/crates/atelier-runtime/src/profiles.rs`
- Modify: `rust/crates/atelier-runtime/src/lib.rs` (déclarer `pub mod profiles;`)

**Interfaces:**
- Consomme : `atelier_store::{Profile, ProfileStore}` (Task 1), `atelier_workspace::catalog::list_commands` pour le catalogue de skills
- Produit :
  ```rust
  pub struct ProfileSpec {
      pub system_prompt: Option<String>,
      pub skills: Option<Vec<String>>,
      pub allowed_tools: Option<Vec<String>>,
      pub denied_tools: Option<Vec<String>>,
  }
  pub fn resolve_profile(profile: Option<&Profile>, catalog: &[String]) -> ProfileSpec;
  pub fn spec_hash(spec: &ProfileSpec) -> String;
  ```

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `rust/crates/atelier-runtime/src/profiles.rs` avec seulement le bloc de tests :

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use atelier_store::Profile;

    fn profile(json: serde_json::Value) -> Profile {
        let mut base = serde_json::json!({
            "name": "P", "displayName": "P", "createdAt": "t", "updatedAt": "t"
        });
        let (b, j) = (base.as_object_mut().unwrap(), json.as_object().unwrap().clone());
        for (k, v) in j {
            b.insert(k, v);
        }
        serde_json::from_value(base).unwrap()
    }

    fn catalog() -> Vec<String> {
        vec!["annotation".into(), "concis".into(), "nas".into()]
    }

    #[test]
    fn no_profile_means_no_restriction_at_all() {
        let spec = resolve_profile(None, &catalog());
        assert!(spec.system_prompt.is_none());
        assert!(spec.skills.is_none());
        assert!(spec.allowed_tools.is_none());
        assert!(spec.denied_tools.is_none());
    }

    #[test]
    fn unrestricted_without_tombstones_keeps_the_live_catalog() {
        let p = profile(serde_json::json!({"unrestricted": true}));
        assert!(
            resolve_profile(Some(&p), &catalog()).skills.is_none(),
            "None = catalogue vivant, les skills futurs apparaissent seuls"
        );
    }

    #[test]
    fn tombstones_subtract_from_the_live_catalog() {
        let p = profile(serde_json::json!({
            "unrestricted": true, "skillTombstones": ["nas"]
        }));
        assert_eq!(
            resolve_profile(Some(&p), &catalog()).skills,
            Some(vec!["annotation".to_string(), "concis".to_string()])
        );
    }

    #[test]
    fn restricted_uses_the_exact_list() {
        let p = profile(serde_json::json!({
            "unrestricted": false, "skillNames": ["concis"]
        }));
        assert_eq!(
            resolve_profile(Some(&p), &catalog()).skills,
            Some(vec!["concis".to_string()])
        );
    }

    #[test]
    fn a_skill_missing_from_the_catalog_is_dropped_silently() {
        let p = profile(serde_json::json!({
            "unrestricted": false, "skillNames": ["concis", "disparu"]
        }));
        assert_eq!(
            resolve_profile(Some(&p), &catalog()).skills,
            Some(vec!["concis".to_string()])
        );
    }

    #[test]
    fn empty_system_prompt_resolves_to_none() {
        let p = profile(serde_json::json!({"systemPrompt": "   "}));
        assert!(resolve_profile(Some(&p), &catalog()).system_prompt.is_none());
    }

    #[test]
    fn empty_tool_lists_resolve_to_none() {
        let p = profile(serde_json::json!({"deniedTools": []}));
        assert!(resolve_profile(Some(&p), &catalog()).denied_tools.is_none());
    }

    #[test]
    fn hash_ignores_ordering_but_not_content() {
        let a = ProfileSpec {
            system_prompt: Some("x".into()),
            skills: Some(vec!["b".into(), "a".into()]),
            allowed_tools: None,
            denied_tools: None,
        };
        let b = ProfileSpec {
            skills: Some(vec!["a".into(), "b".into()]),
            ..a.clone()
        };
        assert_eq!(spec_hash(&a), spec_hash(&b), "l'ordre ne doit pas réveiller Grok");

        let c = ProfileSpec {
            skills: Some(vec!["a".into()]),
            ..a.clone()
        };
        assert_ne!(spec_hash(&a), spec_hash(&c), "un detach doit réveiller Grok");
    }

    #[test]
    fn hash_of_the_empty_spec_is_stable() {
        assert_eq!(spec_hash(&ProfileSpec::default()), spec_hash(&ProfileSpec::default()));
    }
}
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-runtime profiles`
Expected: FAIL — `cannot find function resolve_profile`.

- [ ] **Step 3: Implémenter**

En tête du même fichier :

```rust
//! Résolution d'un profil en consigne neutre pour les providers.
//!
//! Le `ProfileSpec` ne nomme aucun provider : c'est chaque adaptateur qui le
//! traduit dans ses propres arguments. `None` signifie partout « aucune
//! restriction », jamais « liste vide ».

use atelier_store::Profile;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ProfileSpec {
    pub system_prompt: Option<String>,
    /// `None` = catalogue vivant complet.
    pub skills: Option<Vec<String>>,
    pub allowed_tools: Option<Vec<String>>,
    pub denied_tools: Option<Vec<String>>,
}

fn non_empty(list: &[String]) -> Option<Vec<String>> {
    let v: Vec<String> = list.iter().filter(|s| !s.trim().is_empty()).cloned().collect();
    (!v.is_empty()).then_some(v)
}

pub fn resolve_profile(profile: Option<&Profile>, catalog: &[String]) -> ProfileSpec {
    let Some(p) = profile.filter(|p| p.enabled) else {
        return ProfileSpec::default();
    };
    let skills = if p.unrestricted {
        // Sans tombstone on renvoie None : le profil reste ouvert aux skills
        // publiés plus tard. Avec, on est obligé de matérialiser la liste.
        non_empty(&p.skill_tombstones).map(|dead| {
            catalog
                .iter()
                .filter(|s| !dead.contains(s))
                .cloned()
                .collect()
        })
    } else {
        Some(
            p.skill_names
                .iter()
                .filter(|s| catalog.contains(s))
                .cloned()
                .collect(),
        )
    };
    ProfileSpec {
        system_prompt: Some(p.system_prompt.trim().to_string()).filter(|s| !s.is_empty()),
        skills,
        allowed_tools: non_empty(&p.allowed_tools),
        denied_tools: non_empty(&p.denied_tools),
    }
}

/// Empreinte du spec résolu. Sert uniquement à décider si le sous-processus
/// ACP de Grok doit être relancé — d'où le tri : réordonner une liste ne
/// change rien au comportement et ne doit pas coûter un respawn.
pub fn spec_hash(spec: &ProfileSpec) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    let mut part = |label: &str, value: Option<&Vec<String>>| {
        h.update(label.as_bytes());
        match value {
            None => h.update(b"\x00none"),
            Some(list) => {
                let mut sorted = list.clone();
                sorted.sort();
                for item in sorted {
                    h.update(b"\x01");
                    h.update(item.as_bytes());
                }
            }
        }
    };
    h.update(spec.system_prompt.as_deref().unwrap_or("").as_bytes());
    part("skills", spec.skills.as_ref());
    part("allow", spec.allowed_tools.as_ref());
    part("deny", spec.denied_tools.as_ref());
    hex::encode(&h.finalize()[..16])
}
```

Déclarer le module dans `rust/crates/atelier-runtime/src/lib.rs` : `pub mod profiles;`.

Vérifier que `atelier-runtime/Cargo.toml` a bien `sha2` et `hex` en dépendances (déjà utilisés par `atelier-providers`) ; les ajouter si absents, avec les mêmes versions que dans `rust/crates/atelier-providers/Cargo.toml`.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test -p atelier-runtime profiles`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-runtime/src/profiles.rs rust/crates/atelier-runtime/src/lib.rs rust/crates/atelier-runtime/Cargo.toml
git commit -m "feat(runtime): résolution d'un profil en ProfileSpec neutre"
```

---

### Task 4: Champs sur SendRequest + traduction Claude

**Files:**
- Modify: `rust/crates/atelier-providers/src/traits.rs:22-47` (struct), `rust/crates/atelier-providers/src/claude.rs:205-261` (`build_args`)
- Modify: tous les sites qui construisent un `SendRequest` — `rust/crates/atelier-runtime/src/send.rs:868`, `:1174`, `rust/crates/atelier-runtime/src/ws_router.rs:2679`, plus les constructions de test dans `claude.rs`, `codex.rs`, `grok.rs`, `fake.rs`

**Interfaces:**
- Consomme : `ProfileSpec` (Task 3) — aplati en 4 champs, pas de dépendance de crate
- Produit : `SendRequest.{system_prompt, skills, allowed_tools, denied_tools}`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le bloc de tests de `rust/crates/atelier-providers/src/claude.rs`, à côté du test `build_args` existant (ligne ~724) :

```rust
fn request_with_profile(
    system_prompt: Option<&str>,
    skills: Option<Vec<&str>>,
    denied: Option<Vec<&str>>,
) -> SendRequest {
    let mut req = request("bypassPermissions");
    req.system_prompt = system_prompt.map(str::to_string);
    req.skills = skills.map(|v| v.into_iter().map(str::to_string).collect());
    req.denied_tools = denied.map(|v| v.into_iter().map(str::to_string).collect());
    req
}

#[test]
fn no_profile_leaves_args_untouched() {
    let args = build_args(&request_with_profile(None, None, None), None);
    assert!(!args.iter().any(|a| a == "--system-prompt"));
    assert!(!args.iter().any(|a| a == "--disable-slash-commands"));
    assert!(!args.iter().any(|a| a == "--disallowedTools"));
}

#[test]
fn system_prompt_is_passed_through() {
    let args = build_args(&request_with_profile(Some("Tu es X."), None, None), None);
    let i = args.iter().position(|a| a == "--system-prompt").unwrap();
    assert_eq!(args[i + 1], "Tu es X.");
}

#[test]
fn an_empty_skill_list_disables_all_skills() {
    let args = build_args(&request_with_profile(None, Some(vec![]), None), None);
    assert!(args.iter().any(|a| a == "--disable-slash-commands"));
}

#[test]
fn a_partial_skill_list_cannot_be_expressed_in_cli() {
    // Le CLI Claude n'a pas de liste blanche de skills : on ne doit surtout
    // pas tout couper, ce qui serait pire que de ne rien filtrer.
    let args = build_args(&request_with_profile(None, Some(vec!["concis"]), None), None);
    assert!(!args.iter().any(|a| a == "--disable-slash-commands"));
}

#[test]
fn denied_tools_are_joined_as_separate_values() {
    let args = build_args(
        &request_with_profile(None, None, Some(vec!["Bash", "mcp__gbrain__submit_job"])),
        None,
    );
    let i = args.iter().position(|a| a == "--disallowedTools").unwrap();
    assert_eq!(args[i + 1], "Bash");
    assert_eq!(args[i + 2], "mcp__gbrain__submit_job");
}

#[test]
fn the_prompt_stays_the_last_argument() {
    let args = build_args(
        &request_with_profile(Some("Tu es X."), Some(vec![]), Some(vec!["Bash"])),
        None,
    );
    assert_eq!(args.last().unwrap(), "hello");
}
```

Le helper `request(mode)` existe déjà dans ce bloc de tests ; il construit un `SendRequest` avec le prompt `"hello"`. S'il n'utilise pas ce prompt, adapter l'assertion du dernier test à la valeur réelle.

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-providers claude`
Expected: FAIL — `no field system_prompt on type SendRequest`.

- [ ] **Step 3: Implémenter**

Dans `traits.rs`, après le champ `permission_mode` (ligne 36) :

```rust
    /// Identité du spécialiste actif — remplace le prompt système du harnais.
    pub system_prompt: Option<String>,
    /// `None` = catalogue complet. `Some(vec![])` = aucun skill.
    pub skills: Option<Vec<String>>,
    pub allowed_tools: Option<Vec<String>>,
    pub denied_tools: Option<Vec<String>>,
```

Dans `claude.rs`, dans `build_args`, juste avant le `--strict-mcp-config` (ligne 252) :

```rust
    // Profil de spécialiste. L'identité remplace le prompt du harnais ; le
    // CLI n'a pas de liste blanche de skills, donc seule la liste vide est
    // traduisible (`--disable-slash-commands`). Une liste partielle est
    // enregistrée côté profil mais non applicable ici — mieux vaut ne rien
    // filtrer que tout couper.
    if let Some(prompt) = req.system_prompt.as_ref().filter(|s| !s.trim().is_empty()) {
        args.push("--system-prompt".into());
        args.push(prompt.clone());
    }
    if req.skills.as_ref().is_some_and(|s| s.is_empty()) {
        args.push("--disable-slash-commands".into());
    }
    if let Some(allowed) = req.allowed_tools.as_ref().filter(|v| !v.is_empty()) {
        args.push("--allowedTools".into());
        args.extend(allowed.iter().cloned());
    }
    if let Some(denied) = req.denied_tools.as_ref().filter(|v| !v.is_empty()) {
        args.push("--disallowedTools".into());
        args.extend(denied.iter().cloned());
    }
```

Puis ajouter les quatre champs à `None` dans **chaque** construction de `SendRequest` que le compilateur signale. Le compilateur les liste toutes — les traiter une par une jusqu'à ce que `cargo build` passe.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test -p atelier-providers && cargo test -p atelier-runtime`
Expected: PASS — aucune régression sur les tests `build_args` existants.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-providers rust/crates/atelier-runtime
git commit -m "feat(providers): profil de spécialiste sur SendRequest, traduction Claude"
```

---

### Task 5: Traduction Grok + respawn conditionné au hash

**Files:**
- Modify: `rust/crates/atelier-providers/src/grok.rs:214-240` (`ensure_runtime`), `:164-208` (`runtime_for`)

**Interfaces:**
- Consomme : `SendRequest.{system_prompt, allowed_tools, denied_tools}` (Task 4)
- Produit : `fn profile_args(req: &SendRequest) -> Vec<String>` (privée) ; `GrokThreadRuntime` gagne un champ `profile_args: Vec<String>`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le bloc de tests de `grok.rs` :

```rust
#[test]
fn profile_args_are_empty_without_a_profile() {
    let mut req = fake_request();
    req.system_prompt = None;
    req.denied_tools = None;
    assert!(profile_args(&req).is_empty());
}

#[test]
fn identity_uses_the_override_flag_not_rules() {
    // `--rules` ajoute au prompt système ; un spécialiste le REMPLACE.
    let mut req = fake_request();
    req.system_prompt = Some("Tu es X.".into());
    let args = profile_args(&req);
    assert_eq!(args, vec!["--system-prompt-override".to_string(), "Tu es X.".to_string()]);
}

#[test]
fn denied_tools_are_one_deny_flag_each() {
    let mut req = fake_request();
    req.system_prompt = None;
    req.denied_tools = Some(vec!["Bash".into(), "mcp__gbrain__submit_job".into()]);
    assert_eq!(
        profile_args(&req),
        vec![
            "--deny".to_string(),
            "Bash".to_string(),
            "--deny".to_string(),
            "mcp__gbrain__submit_job".to_string()
        ]
    );
}

#[test]
fn allowed_tools_are_one_allow_flag_each() {
    let mut req = fake_request();
    req.system_prompt = None;
    req.denied_tools = None;
    req.allowed_tools = Some(vec!["Read".into()]);
    assert_eq!(
        profile_args(&req),
        vec!["--allow".to_string(), "Read".to_string()]
    );
}
```

Ajouter le helper `fake_request()` s'il n'existe pas dans ce bloc — construire un `SendRequest` minimal sur le modèle des helpers de test de `claude.rs`.

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-providers grok`
Expected: FAIL — `cannot find function profile_args`.

- [ ] **Step 3: Implémenter**

Ajouter au-dessus de `impl GrokProvider` :

```rust
/// Traduction du profil en arguments de lancement. Grok remplace l'identité
/// via `--system-prompt-override` (`--rules` ne ferait qu'ajouter au prompt
/// existant) et prend un drapeau par règle de permission.
fn profile_args(req: &SendRequest) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(prompt) = req.system_prompt.as_ref().filter(|s| !s.trim().is_empty()) {
        args.push("--system-prompt-override".into());
        args.push(prompt.clone());
    }
    for tool in req.allowed_tools.iter().flatten() {
        args.push("--allow".into());
        args.push(tool.clone());
    }
    for tool in req.denied_tools.iter().flatten() {
        args.push("--deny".into());
        args.push(tool.clone());
    }
    args
}
```

Dans `struct GrokThreadRuntime`, ajouter `profile_args: Vec<String>` à côté de `cwd`, initialisé dans `GrokThreadRuntime::new(cwd, profile_args)`.

Dans `runtime_for`, la comparaison de réutilisation devient :

```rust
    // Les arguments de lancement sont figés à la naissance du process : un
    // changement de spécialiste (ou de sa liste d'outils) impose donc un
    // nouveau runtime, exactement comme un changement de cwd. Le comparer
    // ici plutôt qu'ailleurs garantit qu'on ne respawn PAS quand rien n'a
    // bougé — c'est ce qui rend la fonctionnalité utilisable au quotidien.
    if existing.cwd == cwd && existing.profile_args == profile_args {
```

`runtime_for` prend donc un paramètre `profile_args: &[String]` ; son appelant (`send`, ligne ~462) le calcule par `let profile_args = profile_args(&req);`.

Dans `ensure_runtime`, insérer les arguments de profil avant le dernier élément d'`agent_args`, comme le fait déjà `--always-approve` :

```rust
        for arg in runtime.profile_args.iter().rev() {
            args.insert(args.len().saturating_sub(1), arg.clone());
        }
```

La session existante est retrouvée par le chemin `session/load` déjà en place (ligne ~292) : le nouveau process reprend `sessionId`, donc le transcript est conservé.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test -p atelier-providers grok`
Expected: PASS — 4 nouveaux tests, aucune régression.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-providers/src/grok.rs
git commit -m "feat(grok): profil de spécialiste et respawn ACP conditionné"
```

---

### Task 6: Traduction Codex

**Files:**
- Modify: `rust/crates/atelier-providers/src/codex.rs:115-159` (`thread_opts`)

**Interfaces:**
- Consomme : `SendRequest.system_prompt` (Task 4)
- Produit : clé `baseInstructions` dans les options de thread

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le bloc de tests de `codex.rs`, près de `assert_eq!(opts["config"]["model_reasoning_effort"], …)` (ligne ~821) :

```rust
#[test]
fn base_instructions_carry_the_specialist_identity() {
    let mut req = request();
    req.system_prompt = Some("Tu es X.".into());
    let opts = thread_opts(&req);
    assert_eq!(opts["baseInstructions"], serde_json::json!("Tu es X."));
}

#[test]
fn no_profile_writes_no_base_instructions() {
    let req = request();
    assert!(thread_opts(&req).get("baseInstructions").is_none());
}

#[test]
fn a_blank_system_prompt_is_not_sent() {
    let mut req = request();
    req.system_prompt = Some("   ".into());
    assert!(thread_opts(&req).get("baseInstructions").is_none());
}
```

Réutiliser le helper de construction de requête déjà présent dans ce bloc (le renommer `request()` s'il porte un autre nom, ou adapter les appels).

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-providers codex`
Expected: FAIL — `baseInstructions` absent (`Value::Null` != `"Tu es X."`).

- [ ] **Step 3: Implémenter**

Dans `thread_opts`, après le bloc `model` (ligne 126) :

```rust
    // `baseInstructions` est accepté par threadStart ET threadResume, donc la
    // bascule de spécialiste en cours de conversation est native ici — rien à
    // relancer, contrairement à Grok.
    if let Some(prompt) = req.system_prompt.as_ref().filter(|s| !s.trim().is_empty()) {
        opts.as_object_mut()
            .unwrap()
            .insert("baseInstructions".into(), json!(prompt));
    }
```

Les listes d'outils ne sont pas appliquées côté Codex en v1 (hors périmètre, cf. spec) — ne rien écrire pour elles.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test -p atelier-providers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-providers/src/codex.rs
git commit -m "feat(codex): baseInstructions depuis le profil de spécialiste"
```

---

### Task 7: Câblage runtime et persistance du hash

**Files:**
- Modify: `rust/crates/atelier-runtime/src/state.rs:86` (ouverture du store), `rust/crates/atelier-runtime/src/send.rs:868`, `rust/crates/atelier-runtime/src/ws_router.rs:2679`

**Interfaces:**
- Consomme : `ProfileStore` (Task 1), `resolve_profile` / `spec_hash` (Task 3), champs de `SendRequest` (Task 4)
- Produit : `AppState::profiles() -> &Mutex<ProfileStore>` ; `fn spec_for_thread(state, thread_id, project_root) -> (ProfileSpec, String)`

- [ ] **Step 1: Écrire le test qui échoue**

Dans `rust/crates/atelier-runtime/src/profiles.rs`, ajouter au bloc de tests :

```rust
#[test]
fn the_hash_written_on_the_thread_matches_the_spec_sent() {
    // Garde-fou du respawn Grok : si ces deux valeurs divergent, le
    // sous-processus est relancé à chaque tour (ou jamais).
    let p = profile(serde_json::json!({"systemPrompt": "Tu es X."}));
    let spec = resolve_profile(Some(&p), &catalog());
    assert_eq!(spec_hash(&spec), spec_hash(&resolve_profile(Some(&p), &catalog())));
}

#[test]
fn a_disabled_profile_resolves_to_nothing() {
    let p = profile(serde_json::json!({"systemPrompt": "Tu es X.", "enabled": false}));
    assert_eq!(resolve_profile(Some(&p), &catalog()), ProfileSpec::default());
}
```

- [ ] **Step 2: Lancer le test pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-runtime profiles`
Expected: FAIL sur `a_disabled_profile_resolves_to_nothing` si le filtre `enabled` de la Task 3 a été omis ; sinon PASS immédiat — dans ce cas, passer directement à l'étape 3, ces tests servent de garde-fou de non-régression.

- [ ] **Step 3: Implémenter le câblage**

Dans `state.rs`, à côté de l'ouverture de `threads.json` (ligne 86) :

```rust
        let profiles = ProfileStore::open(paths.app_dir.join("profiles.json"));
```

Le stocker dans `AppState` derrière le même type de `Mutex` que `threads`, avec un accesseur `pub fn profiles(&self)` calqué sur `pub fn threads(&self)`.

Ajouter dans `rust/crates/atelier-runtime/src/profiles.rs` :

```rust
/// Catalogue des noms de skills visibles pour ce projet — l'entrée
/// `list_commands` sert déjà le picker `/nom`, on réutilise la même source
/// pour que profil et picker ne puissent pas diverger.
pub fn skill_catalog(project_root: &str) -> Vec<String> {
    let root = (!project_root.is_empty()).then_some(project_root);
    atelier_workspace::catalog::list_commands(root)
        .into_iter()
        .filter(|c| c.source != "builtin")
        .map(|c| c.name)
        .collect()
}
```

Adapter le nom du champ `source` / `name` à la définition réelle de `CommandEntry` (`rust/crates/atelier-workspace/src/catalog.rs:193`). Vérifier que `atelier-runtime/Cargo.toml` dépend bien d'`atelier-workspace` ; l'ajouter sinon, sur le modèle des autres dépendances internes du même fichier.

Aux deux sites de construction de `SendRequest`, avant le `let req = SendRequest {` :

```rust
    let (profile_spec, profile_hash) = {
        let threads = state.threads().lock().await;
        let name = threads.get(&thread_id).and_then(|t| t.profile.clone());
        drop(threads);
        let catalog = crate::profiles::skill_catalog(&project_root);
        let profiles = state.profiles().lock().await;
        let spec = crate::profiles::resolve_profile(
            name.as_deref().and_then(|n| profiles.get(n)),
            &catalog,
        );
        let hash = crate::profiles::spec_hash(&spec);
        (spec, hash)
    };
```

Puis dans le littéral `SendRequest` :

```rust
        system_prompt: profile_spec.system_prompt.clone(),
        skills: profile_spec.skills.clone(),
        allowed_tools: profile_spec.allowed_tools.clone(),
        denied_tools: profile_spec.denied_tools.clone(),
```

Et juste après l'envoi, écrire le hash sur le fil pour que Grok sache au tour suivant si quelque chose a bougé :

```rust
    {
        let mut threads = state.threads().lock().await;
        let _ = threads.upsert(
            serde_json::json!({"id": thread_id, "profileHash": profile_hash}),
            true, // preserve_updated_at : le hash n'est pas une activité utilisateur
        );
    }
```

- [ ] **Step 4: Lancer la suite complète**

Run: `cd rust && cargo test`
Expected: PASS sur tout le workspace.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-runtime
git commit -m "feat(runtime): résoudre le profil du fil et propager son hash"
```

---

### Task 8: Transport WS et capability

**Files:**
- Modify: `rust/crates/atelier-runtime/src/ws_router.rs:26-60` (`ALL_MESSAGE_TYPES`), `:198-215` (dispatch), `rust/crates/atelier-protocol/src/lib.rs:78-110` (struct), `:263+` (littéraux par provider)

**Interfaces:**
- Consomme : `ProfileStore` (Task 1), `AppState::profiles()` (Task 7)
- Produit : messages WS `listProfiles`, `upsertProfile`, `deleteProfile`, `setThreadProfile` ; réponse `{"type":"profiles","profiles":[…],"iconKeys":[…]}` ; capability `profiles: bool`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le bloc de tests de `ws_router.rs`, à côté du test `renameThread` (ligne ~3445) :

```rust
#[tokio::test]
async fn list_profiles_returns_the_catalog_and_icon_keys() {
    let s = test_state();
    let out = route_ws(&s, r#"{"type":"listProfiles"}"#).await;
    let msg = &out[0];
    assert_eq!(msg["type"], "profiles");
    assert!(msg["iconKeys"].as_array().unwrap().contains(&serde_json::json!("pen")));
}

#[tokio::test]
async fn upsert_then_list_shows_the_profile() {
    let s = test_state();
    route_ws(
        &s,
        r#"{"type":"upsertProfile","profile":{"name":"REDACTEUR","displayName":"Rédacteur"}}"#,
    )
    .await;
    let out = route_ws(&s, r#"{"type":"listProfiles"}"#).await;
    assert_eq!(out[0]["profiles"][0]["name"], "REDACTEUR");
}

#[tokio::test]
async fn upsert_with_a_bad_name_reports_an_error_and_stores_nothing() {
    let s = test_state();
    let out = route_ws(
        &s,
        r#"{"type":"upsertProfile","profile":{"name":"minuscule","displayName":"x"}}"#,
    )
    .await;
    assert_eq!(out[0]["type"], "error");
    let list = route_ws(&s, r#"{"type":"listProfiles"}"#).await;
    assert_eq!(list[0]["profiles"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn set_thread_profile_writes_the_name_on_the_thread() {
    let s = test_state();
    route_ws(&s, r#"{"type":"upsertThread","thread":{"id":"t1"}}"#).await;
    route_ws(
        &s,
        r#"{"type":"upsertProfile","profile":{"name":"REDACTEUR","displayName":"R"}}"#,
    )
    .await;
    let out = route_ws(
        &s,
        r#"{"type":"setThreadProfile","threadId":"t1","profile":"REDACTEUR"}"#,
    )
    .await;
    assert_eq!(out[0]["type"], "threads");
    let t = &out[0]["threads"][0];
    assert_eq!(t["profile"], "REDACTEUR");
}

#[tokio::test]
async fn set_thread_profile_to_null_clears_it() {
    let s = test_state();
    route_ws(&s, r#"{"type":"upsertThread","thread":{"id":"t1","profile":"R"}}"#).await;
    let out = route_ws(
        &s,
        r#"{"type":"setThreadProfile","threadId":"t1","profile":null}"#,
    )
    .await;
    assert!(out[0]["threads"][0].get("profile").is_none());
}

#[tokio::test]
async fn deleting_a_profile_leaves_threads_alone() {
    // Un nom orphelin se comporte comme « aucun » à la résolution : on ne
    // réécrit pas les fils, ce serait une perte d'information silencieuse.
    let s = test_state();
    route_ws(&s, r#"{"type":"upsertProfile","profile":{"name":"R2","displayName":"R"}}"#).await;
    route_ws(&s, r#"{"type":"upsertThread","thread":{"id":"t1","profile":"R2"}}"#).await;
    route_ws(&s, r#"{"type":"deleteProfile","name":"R2"}"#).await;
    let out = route_ws(&s, r#"{"type":"listThreads"}"#).await;
    assert_eq!(out[0]["threads"][0]["profile"], "R2");
}
```

Adapter `test_state()` au helper réellement utilisé par les tests voisins de ce fichier.

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-runtime ws_router`
Expected: FAIL — les messages inconnus ne produisent aucune réponse typée.

- [ ] **Step 3: Implémenter**

Ajouter les quatre types à `ALL_MESSAGE_TYPES` (la liste doit rester exhaustive), puis dans le `match` :

```rust
        "listProfiles" => {
            let list = state.profiles().lock().await.list();
            vec![json_msg(json!({
                "type": "profiles",
                "profiles": list,
                "iconKeys": atelier_store::ICON_KEYS,
            }))]
        }
        "upsertProfile" => {
            let patch = msg.get("profile").cloned().unwrap_or(Value::Null);
            let result = state.profiles().lock().await.upsert(patch);
            match result {
                Err(e) => vec![json_msg(json!({"type": "error", "error": e}))],
                Ok(_) => {
                    let list = state.profiles().lock().await.list();
                    vec![json_msg(json!({
                        "type": "profiles",
                        "profiles": list,
                        "iconKeys": atelier_store::ICON_KEYS,
                    }))]
                }
            }
        }
        "deleteProfile" => {
            let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let _ = state.profiles().lock().await.delete(name);
            let list = state.profiles().lock().await.list();
            vec![json_msg(json!({
                "type": "profiles",
                "profiles": list,
                "iconKeys": atelier_store::ICON_KEYS,
            }))]
        }
        "setThreadProfile" => {
            let id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
            let profile = msg.get("profile").cloned().unwrap_or(Value::Null);
            {
                let mut store = state.threads().lock().await;
                if store.get(id).is_some() {
                    // preserve_updated_at = true : choisir un spécialiste ne
                    // doit pas faire remonter le fil en tête de la liste.
                    let _ = store.upsert(json!({"id": id, "profile": profile}), true);
                }
            }
            broadcast_threads(state).await
        }
```

Dans `atelier-protocol/src/lib.rs`, ajouter au struct `ProviderCapabilities` :

```rust
    /// Le provider sait porter un profil de spécialiste (prompt système +
    /// restriction d'outils).
    #[serde(default)]
    pub profiles: bool,
```

Puis `profiles: true` dans les littéraux `claude`, `grok` et `codex`, et `profiles: false` dans **tous** les autres (le compilateur les liste).

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-runtime rust/crates/atelier-protocol
git commit -m "feat(ws): CRUD des profils et capability providers"
```

---

### Task 9: Outil MCP `atelier_specialists`

**Files:**
- Modify: `rust/crates/atelier-agent-mcp/src/schema.rs` (nouvelle définition + aide), `rust/crates/atelier-agent-mcp/src/server.rs:55-70` (`tools/list` et dispatch), `rust/crates/atelier-agent-mcp/src/bridge.rs` (relais vers le runtime)

**Interfaces:**
- Consomme : messages WS de la Task 8
- Produit : `SPECIALISTS_TOOL_NAME: &str`, `specialists_tool_definition() -> Value`, `specialists_help_text() -> Value`

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `rust/crates/atelier-agent-mcp/src/schema.rs` :

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_specialists_tool_declares_every_action() {
        let def = specialists_tool_definition();
        let actions = def["inputSchema"]["properties"]["action"]["enum"]
            .as_array()
            .unwrap();
        for expected in [
            "help", "list", "create", "update", "delete", "switch", "attach_skill",
            "detach_skill",
        ] {
            assert!(
                actions.iter().any(|a| a == expected),
                "action {expected} manquante"
            );
        }
    }

    #[test]
    fn the_specialists_tool_has_its_own_name() {
        assert_ne!(SPECIALISTS_TOOL_NAME, TOOL_NAME);
    }

    #[test]
    fn the_help_text_names_the_two_gated_actions() {
        // L'agent doit savoir lesquelles font apparaître une carte
        // d'autorisation, pour prévenir avant d'appeler.
        let help = serde_json::to_string(&specialists_help_text()).unwrap();
        assert!(help.contains("switch"));
        assert!(help.contains("delete"));
    }
}
```

Dans `server.rs` :

```rust
#[test]
fn tools_list_exposes_both_tools() {
    let names: Vec<String> = serde_json::from_value::<Vec<serde_json::Value>>(
        handle_request(&json!({"method": "tools/list"}))["tools"].clone(),
    )
    .unwrap()
    .into_iter()
    .map(|t| t["name"].as_str().unwrap().to_string())
    .collect();
    assert!(names.contains(&crate::schema::TOOL_NAME.to_string()));
    assert!(names.contains(&crate::schema::SPECIALISTS_TOOL_NAME.to_string()));
}
```

Adapter l'appel à la fonction de dispatch réellement exposée par `server.rs`.

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `cd rust && cargo test -p atelier-agent-mcp`
Expected: FAIL — `cannot find function specialists_tool_definition`.

- [ ] **Step 3: Implémenter**

Dans `schema.rs` :

```rust
pub const SPECIALISTS_TOOL_NAME: &str = "atelier_specialists";

pub fn specialists_tool_definition() -> Value {
    json!({
        "name": SPECIALISTS_TOOL_NAME,
        "description": "Créer et gérer les profils de spécialistes d'Atelier. Use action=help for details.",
        "inputSchema": {
            "type": "object",
            "required": ["action"],
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "list", "create", "update", "delete", "switch",
                             "attach_skill", "detach_skill"]
                },
                "name": { "type": "string" },
                "displayName": { "type": "string" },
                "description": { "type": "string" },
                "systemPrompt": { "type": "string" },
                "iconKey": { "type": "string" },
                "unrestricted": { "type": "boolean" },
                "skillNames": { "type": "array", "items": { "type": "string" } },
                "skill": { "type": "string" },
                "allowedTools": { "type": "array", "items": { "type": "string" } },
                "deniedTools": { "type": "array", "items": { "type": "string" } },
                "enabled": { "type": "boolean" }
            },
            "additionalProperties": false
        }
    })
}

pub fn specialists_help_text() -> Value {
    json!({
        "tool": SPECIALISTS_TOOL_NAME,
        "actions": {
            "help": "Ce document",
            "list": "Profils existants, jeu de glyphes (iconKeys) et catalogue des skills",
            "create": "Crée un profil — name en UPPER_SNAKE (2-32), displayName, description, systemPrompt, iconKey pris dans iconKeys",
            "update": "Modifie les champs fournis ; les autres sont conservés",
            "attach_skill": "Ajoute un skill sans changer le mode du profil",
            "detach_skill": "Retire un skill — écrit une tombstone si le profil est unrestricted",
            "switch": "Pose le profil sur le fil courant (carte d'autorisation)",
            "delete": "Supprime le profil (carte d'autorisation)"
        },
        "identity": "systemPrompt REMPLACE l'identité de base. Commencer par « Tu es <displayName> », dire ce que le spécialiste fait ET ce qu'il ne fait pas. Moins de 200 mots — le savoir-faire va dans les skills, pas dans le prompt.",
        "loadout": "unrestricted=true (défaut) = catalogue vivant complet ; detach_skill y écrit une tombstone. Les connecteurs ne se choisissent pas : on refuse leurs outils par motif via deniedTools (mcp__<serveur>__<outil>).",
        "switching": "switch est un changement d'habit, pas une passation : le transcript, la session et les fichiers sont hérités. Rien à résumer avant."
    })
}
```

Dans `server.rs`, `tools/list` renvoie `[tool_definition(), specialists_tool_definition()]`, et le dispatch `tools/call` accepte les deux noms — le second relayant vers les messages WS de la Task 8 via `bridge.rs`, sur le même patron que les actions existantes. `switch` traduit vers `setThreadProfile` avec le `threadId` du capability du process appelant, jamais un id fourni dans les arguments.

`detach_skill` sur un profil `unrestricted` ajoute à `skillTombstones` ; sur un profil restreint, il retire de `skillNames`.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `cd rust && cargo test -p atelier-agent-mcp`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rust/crates/atelier-agent-mcp
git commit -m "feat(mcp): outil atelier_specialists pour le CRUD des profils"
```

---

### Task 10: Sélecteur dans le composer

**Files:**
- Create: `src/lib/profiles.ts`, `src/components/chat/SpecialistMenu.tsx`, `src/components/chat/SpecialistMenu.test.tsx`
- Modify: `src/lib/providers.ts:23` (capability), `src/components/chat/ComposerControls.tsx:200-240` (rangée + glyphe + pastille)

**Interfaces:**
- Consomme : messages WS de la Task 8, capability `profiles`
- Produit : `type Profile`, `PROFILE_ICONS: Record<string, JSX.Element>`, `<SpecialistMenu profiles activeName onSelect onCreate />`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/components/chat/SpecialistMenu.test.tsx` :

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpecialistMenu } from "./SpecialistMenu";

const profiles = [
  { name: "REDACTEUR", displayName: "Rédacteur mémoire", description: "Rédige.", iconKey: "pen", unrestricted: true, skillNames: [], skillTombstones: [], allowedTools: [], deniedTools: [], enabled: true },
  { name: "STATS", displayName: "Analyste stats", description: "Analyse.", iconKey: "chart", unrestricted: true, skillNames: [], skillTombstones: [], allowedTools: [], deniedTools: [], enabled: true },
];

describe("SpecialistMenu", () => {
  it("liste les profils et l'entrée Aucun", () => {
    render(<SpecialistMenu profiles={profiles} activeName={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByText("Aucun")).toBeInTheDocument();
    expect(screen.getByText("Rédacteur mémoire")).toBeInTheDocument();
  });

  it("filtre sur la recherche", () => {
    render(<SpecialistMenu profiles={profiles} activeName={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "stat" } });
    expect(screen.queryByText("Rédacteur mémoire")).not.toBeInTheDocument();
    expect(screen.getByText("Analyste stats")).toBeInTheDocument();
  });

  it("marque le profil actif", () => {
    render(<SpecialistMenu profiles={profiles} activeName="STATS" onSelect={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByRole("menuitemradio", { name: /Analyste stats/ })).toHaveAttribute("aria-checked", "true");
  });

  it("renvoie null quand on choisit Aucun", () => {
    const onSelect = vi.fn();
    render(<SpecialistMenu profiles={profiles} activeName="STATS" onSelect={onSelect} onCreate={vi.fn()} />);
    fireEvent.click(screen.getByText("Aucun"));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("masque les profils désactivés", () => {
    const off = [{ ...profiles[0], enabled: false }, profiles[1]];
    render(<SpecialistMenu profiles={off} activeName={null} onSelect={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.queryByText("Rédacteur mémoire")).not.toBeInTheDocument();
  });

  it("propose la création", () => {
    const onCreate = vi.fn();
    render(<SpecialistMenu profiles={profiles} activeName={null} onSelect={vi.fn()} onCreate={onCreate} />);
    fireEvent.click(screen.getByText(/Créer un spécialiste/));
    expect(onCreate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/components/chat/SpecialistMenu.test.tsx`
Expected: FAIL — `Failed to resolve import "./SpecialistMenu"`.

- [ ] **Step 3: Implémenter**

`src/lib/profiles.ts` — types et glyphes :

```ts
export type Profile = {
  name: string;
  displayName: string;
  description: string;
  iconKey: string;
  unrestricted: boolean;
  skillNames: string[];
  skillTombstones: string[];
  allowedTools: string[];
  deniedTools: string[];
  enabled: boolean;
};

/** Résumé du chargement pour les tags des Réglages. */
export function loadoutTags(p: Profile): string[] {
  const skills = p.unrestricted
    ? p.skillTombstones.length
      ? `tous skills − ${p.skillTombstones.length}`
      : "tous skills"
    : `${p.skillNames.length} skills`;
  const denied = p.deniedTools.length ? [`${p.deniedTools.length} outils refusés`] : [];
  return [skills, ...denied];
}
```

Les glyphes vivent dans `src/components/icons.tsx` sous une map `PROFILE_ICONS: Record<string, ReactNode>` couvrant les 12 clés de `ICON_KEYS` (Task 1), en SVG `stroke-width="1.4"`, `fill="none"`, `viewBox="0 0 16 16"`, sur le modèle exact des SVG inline déjà présents dans `ComposerControls.tsx:203`. Toute clé inconnue retombe sur `sparkle`.

`src/components/chat/SpecialistMenu.tsx` reprend la structure du picker de modèles (`ComposerControls.tsx:340-470`) : `PopoverContent plain side="top" align="end" sideOffset={6}` + champ de recherche + lignes `RowButton` avec `role="menuitemradio"` et `aria-checked`. La coche utilise `var(--primary)`. Aucun `<button>` nu.

Dans `ComposerControls.tsx`, ajouter dans le `DropdownMenuContent` (après l'entrée Auto-review, ligne ~230) une `DropdownMenuItem` qui ouvre le menu, libellée `Spécialiste` avec la valeur courante alignée à droite, conditionnée à `capabilities.profiles`. Le déclencheur du `DropdownMenu` reçoit le glyphe du profil actif et la pastille :

```tsx
{activeProfile && <span className="specialist-dot" aria-hidden="true" />}
```

avec, dans `App.css` :

```css
.specialist-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--primary);
}
```

Ajouter `profiles?: boolean;` à `ProviderCapabilities` dans `src/lib/providers.ts`.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/components/chat/SpecialistMenu.test.tsx src/components/ui/css-contract.test.ts && npx tsc --noEmit`
Expected: PASS — dont le contrat CSS, qui échouerait sur un `<button>` nu ou une ombre Tailwind.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles.ts src/lib/providers.ts src/components/chat/SpecialistMenu.tsx src/components/chat/SpecialistMenu.test.tsx src/components/chat/ComposerControls.tsx src/components/icons.tsx src/App.css
git commit -m "feat(ui): sélecteur de spécialiste dans le composer"
```

---

### Task 11: Persistance du défaut et filtrage du picker `/nom`

**Files:**
- Modify: `src/App.tsx` (création de fil, réception de `profiles`), `src/lib/providers.ts:71-83` (`providerAllowsCommand`), `src/lib/providers.test.ts` (ou le fichier de test voisin de `providers.ts`)

**Interfaces:**
- Consomme : `Profile` (Task 10), `getSettings` / `saveSettings` existants
- Produit : `defaultProfile` dans les réglages ; `providerAllowsCommand(info, command, profile?)` — troisième paramètre optionnel, rétro-compatible

- [ ] **Step 1: Écrire les tests qui échouent**

Dans le fichier de test de `src/lib/providers.ts` :

```ts
const claude = { id: "claude", capabilities: { skills: true, profiles: true } } as any;
const skill = { name: "annotation", source: "skill" };

it("sans profil, le catalogue complet reste proposé", () => {
  expect(providerAllowsCommand(claude, skill)).toBe(true);
});

it("un profil illimité sans tombstone ne filtre rien", () => {
  const p = { unrestricted: true, skillNames: [], skillTombstones: [] } as any;
  expect(providerAllowsCommand(claude, skill, p)).toBe(true);
});

it("une tombstone retire le skill du picker", () => {
  const p = { unrestricted: true, skillNames: [], skillTombstones: ["annotation"] } as any;
  expect(providerAllowsCommand(claude, skill, p)).toBe(false);
});

it("un profil restreint ne propose que sa liste", () => {
  const p = { unrestricted: false, skillNames: ["concis"], skillTombstones: [] } as any;
  expect(providerAllowsCommand(claude, skill, p)).toBe(false);
  expect(providerAllowsCommand(claude, { name: "concis", source: "skill" }, p)).toBe(true);
});

it("le profil ne filtre jamais les commandes natives", () => {
  const p = { unrestricted: false, skillNames: [], skillTombstones: [] } as any;
  expect(providerAllowsCommand(claude, { name: "compact", source: "builtin" }, p)).toBe(
    providerAllowsCommand(claude, { name: "compact", source: "builtin" }),
  );
});
```

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/lib/providers`
Expected: FAIL — le troisième argument est ignoré, la tombstone ne filtre pas.

- [ ] **Step 3: Implémenter**

Dans `providerAllowsCommand`, après le test `command.source !== "builtin"` :

```ts
  if (command.source !== "builtin") {
    if (capabilities.skills === false) return false;
    if (!profile) return true;
    // Le filtrage du picker marche sur TOUS les providers, y compris ceux qui
    // n'ont pas de chargement natif de skills — c'est la part de réduction de
    // bruit qui ne dépend d'aucun drapeau CLI.
    return profile.unrestricted
      ? !profile.skillTombstones.includes(command.name)
      : profile.skillNames.includes(command.name);
  }
```

Dans `App.tsx` :

- à la réception du message `profiles`, garder la liste dans l'état et la passer au composer et aux réglages ;
- au moment de choisir un spécialiste, écrire `defaultProfile` via `saveSettings` en plus du `setThreadProfile` ;
- à la **création** d'un fil, poser `profile: settings.defaultProfile ?? null` dans le patch `upsertThread`. Ne jamais relire `defaultProfile` ensuite : un fil existant garde le sien.

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/lib/providers && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers.ts src/lib/providers.test.ts src/App.tsx
git commit -m "feat(ui): défaut persistant du spécialiste et filtrage du picker /nom"
```

---

### Task 12: Section Réglages

**Files:**
- Modify: `src/components/Settings.tsx`, `src/components/Settings.test.tsx`
- Modify: `src/lib/i18n.ts` (libellés FR et EN)

**Interfaces:**
- Consomme : `Profile`, `loadoutTags` (Task 10) ; liste des profils tenue dans `App.tsx` (Task 11) ; messages `listProfiles` / `upsertProfile` / `deleteProfile` (Task 8)
- Produit : section « Spécialistes » dans les réglages

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/components/Settings.test.tsx` :

```tsx
it("liste les spécialistes avec leur chargement", () => {
  renderSettings({ profiles: [{ ...baseProfile, displayName: "Rédacteur mémoire", deniedTools: ["Bash"] }] });
  expect(screen.getByText("Rédacteur mémoire")).toBeInTheDocument();
  expect(screen.getByText("tous skills")).toBeInTheDocument();
  expect(screen.getByText("1 outils refusés")).toBeInTheDocument();
});

it("demande confirmation avant de supprimer", () => {
  const onDelete = vi.fn();
  renderSettings({ profiles: [baseProfile], onDeleteProfile: onDelete });
  fireEvent.click(screen.getByRole("button", { name: /supprimer/i }));
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /confirmer/i }));
  expect(onDelete).toHaveBeenCalledWith(baseProfile.name);
});

it("affiche un état vide qui explique comment créer", () => {
  renderSettings({ profiles: [] });
  expect(screen.getByText(/demande à l'agent/i)).toBeInTheDocument();
});
```

Adapter `renderSettings` / `baseProfile` aux helpers réellement présents dans ce fichier de test.

- [ ] **Step 2: Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/components/Settings.test.tsx`
Expected: FAIL — les libellés n'existent pas.

- [ ] **Step 3: Implémenter**

Ajouter une section calquée sur les sections existantes de `Settings.tsx` : titre 15px/600, description 11px `var(--muted2)`, lignes séparées par `1px solid var(--sep)`. Chaque ligne affiche le glyphe, le `displayName` (13px/500), la `description` (11px), les tags de `loadoutTags` en pilules `border-radius: 999px`, et deux `IconButton` (renommer, supprimer). La suppression demande confirmation en ligne — pas de dialogue modal.

L'état vide dit : « Aucun spécialiste. Demande à l'agent d'en créer un — par exemple : *crée-moi un spécialiste pour relire mes sections de méthodo*. »

Aucun champ d'édition de prompt système : c'est délibéré, l'édition passe par l'agent.

Ajouter les libellés dans les deux blocs de `src/lib/i18n.ts` (FR et EN).

- [ ] **Step 4: Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/components/Settings.test.tsx src/components/ui/css-contract.test.ts && npx tsc --noEmit && npx vite build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Settings.tsx src/components/Settings.test.tsx src/lib/i18n.ts
git commit -m "feat(ui): section Spécialistes dans les Réglages"
```

---

### Task 13: Skill d'accompagnement et documentation

**Files:**
- Create: `~/.claude/skills/specialists/SKILL.md`
- Modify: `docs/PIEGES_CONNUS.md`

**Interfaces:**
- Consomme : l'outil `atelier_specialists` (Task 9)
- Produit : le flux que l'agent suit quand on lui demande un spécialiste ; aucune interface consommée par une tâche ultérieure

- [ ] **Step 1: Écrire le skill**

`~/.claude/skills/specialists/SKILL.md` :

```markdown
---
name: specialists
description: Créer, modifier et basculer les profils de spécialistes d'Atelier via l'outil MCP atelier_specialists. Use when the user says « crée-moi un spécialiste », « fais un profil pour… », « bascule sur X », « modifie le spécialiste », or asks to restrict an agent's skills or tools.
---

# Spécialistes d'Atelier

Un spécialiste est un profil : une identité, une restriction de skills, une
liste d'outils refusés. Un profil a **un seul métier**.

## Flux de création

1. **Cadrer.** À quoi sert ce spécialiste ? Choisir un nom UPPER_SNAKE
   (`RELECTEUR_METHODO`, pas « aide à la relecture »). Demander si le scope
   n'est pas clair — le nom est visible dans le picker.
2. **Écrire l'identité.** `systemPrompt` REMPLACE l'identité de base, ce n'est
   pas un ajout. Commencer par « Tu es {displayName} ». Dire ce qu'il fait et
   ce qu'il ne fait pas. Moins de 200 mots : le savoir-faire va dans les
   skills, pas dans le prompt.
3. **Demander le chargement.** Accès complet (catalogue vivant, défaut) ou
   sous-ensemble ? Ne pas le déduire du rôle — un spécialiste étroit peut
   vouloir tous ses outils.
4. **Faire valider** nom, libellé, description, prompt et chargement, en une
   seule question.
5. **Créer**, puis proposer de basculer (`action: "switch"`).

## Pièges

- `detach_skill` sur un profil `unrestricted` écrit une **tombstone** : le
  profil reste ouvert aux skills futurs, moins celui-ci. Ne jamais convertir
  en liste blanche pour retirer un skill.
- Les connecteurs MCP ne se choisissent pas — Atelier n'a pas de registre. On
  refuse leurs outils par motif : `deniedTools: ["mcp__gbrain__submit_job"]`.
- Sur Claude, une liste **partielle** de skills n'est pas applicable (le CLI
  n'a que le tout-ou-rien). L'annoncer plutôt que de laisser croire au
  filtrage.
- `switch` est un changement d'habit : transcript, session et fichiers sont
  hérités. Ne rien résumer ni transférer avant.
- `iconKey` se prend dans la liste renvoyée par `action: "list"`. Une clé
  inventée est refusée.
```

- [ ] **Step 2: Vérifier que le skill se charge**

Run: `ls ~/.claude/skills/specialists/SKILL.md && head -4 ~/.claude/skills/specialists/SKILL.md`
Expected: le frontmatter s'affiche, `name: specialists`.

- [ ] **Step 3: Documenter le piège Grok**

Ajouter à `docs/PIEGES_CONNUS.md` :

```markdown
## Spécialistes — respawn ACP côté Grok

Les arguments de lancement de Grok (`--system-prompt-override`, `--allow`,
`--deny`) sont figés à la naissance du sous-processus ACP. Changer de
spécialiste impose donc de retirer le runtime, le relancer et faire
`session/load`. C'est `Thread.profileHash` qui décide : **si le hash n'a pas
changé, ne rien relancer**. Un hash mal calculé (par exemple sensible à
l'ordre des listes) fait respawner le process à chaque tour et détruit la
latence. Voir `rust/crates/atelier-runtime/src/profiles.rs::spec_hash`.
```

- [ ] **Step 4: Vérification finale complète**

Run: `cd rust && cargo test && cd .. && npx vitest run && npx tsc --noEmit && npx vite build`
Expected: PASS partout.

- [ ] **Step 5: Commit**

```bash
git add docs/PIEGES_CONNUS.md
git commit -m "docs: piège du respawn ACP Grok pour les spécialistes"
```

---

## Vérification manuelle (après la Task 13)

L'app ne se relance pas depuis un harnais d'agent — c'est Thierry qui lance
`npm run tauri dev` depuis son terminal, en suivant `docs/PROTOCOLE_RELANCE.md`.
Lui demander de vérifier, dans cet ordre :

1. Menu du composer → `Spécialiste` apparaît sur claude, grok et codex, et
   **pas** sur kimi ni opencode.
2. « Crée-moi un spécialiste qui relit mes sections de méthodo » → l'agent
   pose ses questions, crée le profil, propose de basculer.
3. Après bascule sur un fil Grok : le tour suivant répond dans la nouvelle
   identité, et le transcript précédent est toujours là.
4. Deux tours d'affilée sans changer de spécialiste sur Grok : pas de
   ralentissement au démarrage du second (aucun respawn).
5. Nouvelle conversation → le spécialiste est hérité du dernier choisi.
6. Réglages → la section liste les profils avec leurs tags de chargement.
