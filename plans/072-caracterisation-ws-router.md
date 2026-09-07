# Plan 072 : Chaque famille de messages WebSocket de `ws_router.rs` a un test de caractérisation avant tout découpage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- rust/crates/atelier-runtime/src/ws_router.rs rust/crates/atelier-runtime/src/state.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: LOW
- **Depends on**: none (mais **prérequis** à tout plan de découpage de `ws_router.rs`)
- **Category**: tests
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

`rust/crates/atelier-runtime/src/ws_router.rs` est le plus gros fichier du repo
(5 225 lignes), le plus modifié des 60 derniers jours côté Rust, et il route
**121** types de messages WebSocket (`"send"`, `"getHistory"`, `"listThreads"`,
`"saveSettings"`, `"kbAdd"`, `"zoteroSearch"`…) pour **6 tests** — contre 35
dans `send.rs`, deux fois plus petit. Toute régression de routage n'est
détectée que par les suites d'intégration lourdes ou en usage réel. Ce plan
pose un test de caractérisation par famille de messages, dans le style des six
qui existent, pour qu'un découpage ultérieur du fichier (par domaine : fils,
historique, réglages, KB, Zotero, Narval, automations) se fasse sous filet.
Il ne modifie **aucune** logique.

## Current state

- `rust/crates/atelier-runtime/src/ws_router.rs` : `pub async fn route_ws(state: &AppState, text: &str) -> Vec<String>` (l.202) ; grand `match` sur `msg["type"]` à partir de l.209 (`"ping"`, `"send"`, `"interrupt"`, `"providerStatus"`, `"status"`, `"listThreads"`, `"renameThread"`, `"moveThread"`, `"deleteThread"`, `"getHistory"` l.277, `"getAgentHistory"` l.346, `"listHighlights"`, `"listAutomations"`…`"runAutomationNow"` l.374-378, `"addHighlight"`/`"removeHighlight"`, `"getSettings"`/`"saveSettings"` l.396-402, `"getLedger"`, `"upsertThread"`, `"projectFolderCatalog"`, `"listFiles"`, `"narval*"` l.493-580, `"listCommands"`, `"listPlugins"`, `"listPasted"`/`"clearPasted"`/`"saveImage"`, `"kbAdd"`…`"kbList"` l.681-684, puis `"zotero*"` ~l.1078-1130, etc. — 121 branches en tout : `grep -nE '^\s*"[a-zA-Z]+" =>' rust/crates/atelier-runtime/src/ws_router.rs`).
- Module de tests existant : `mod tests` l.4155, avec une fabrique `state(dir: &Path) -> AppState` (l.~4160-4181 : construit un `AppState` sur un `tempdir`, version `"0.1.0"`, `server_dir`) et 6 `#[tokio::test]` du style :
  ```rust
  #[tokio::test]
  async fn list_commands_propose_la_gachette_ref_native() {
      let dir = tempdir().unwrap();
      let s = state(dir.path());
      let out = route_ws(&s, r#"{"type":"listCommands"}"#).await;
      let response: Value = serde_json::from_str(&out[0]).unwrap();
      assert!(response["commands"].as_array().unwrap().iter().any(|c| c["name"] == "ref"));
  }
  ```
  et `zotero_add_pdf_returns_the_ui_result_contract` (même forme, message JSON construit avec `json!`, réponse parsée, champs assertés).
- Providers factices : `rust/crates/atelier-runtime/src/state.rs:283-297` enregistre `atelier_providers::FakeProvider::new(id)` (et `.with_delay(delay_ms)`) ; `state.rs:375` `fn test_state() -> AppState`. Le fil `"send"` est déjà couvert par `send.rs` (35 tests) — ne pas le re-caractériser ici, seulement vérifier que `route_ws` le délègue.
- Conventions : tests nommés en français, un comportement par test, assertions sur la forme JSON de la réponse (`type`, champs) ; `tempdir` de `tempfile`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests runtime | `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` | `test result: ok` (192+ tests) |
| Un test | `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml <nom>` | `1 passed` |
| Compter | `grep -c "#\[tokio::test\]" rust/crates/atelier-runtime/src/ws_router.rs` | ≥ 30 à la fin |

## Scope

**In scope**:
- `rust/crates/atelier-runtime/src/ws_router.rs` — **uniquement le module `mod tests`** (et, si nécessaire, `mod compaction_contrat_tests`) ; aucune ligne hors des modules de test.
- `rust/crates/atelier-runtime/src/state.rs` — uniquement si un helper de test manquant est indispensable (ex. un `test_state` avec journal pré-rempli) ; le signaler.

**Out of scope**:
- Toute logique de `route_ws` et des handlers ; tout découpage de fichier (c'est le plan **suivant**, pas celui-ci).
- `send.rs` (déjà couvert), `sidecar/**`, `src/**`.

## Git workflow

- Branche : `advisor/072-caracterisation-ws-router` ; un commit par famille (`test(ws_router): caractérisation fils/historique`, …) ; ne pas pousser.

## Steps

Pour chaque étape : un test = un message JSON envoyé à `route_ws`, la réponse
parsée, la forme assertée **telle que le code répond aujourd'hui** (si un
comportement surprend, l'écrire tel quel avec un commentaire « caractérisation »
et le lister dans le rapport). Reprendre la fabrique `state(dir.path())`.

### Step 1 : Inventaire

Générer la liste des 121 types (`grep` ci-dessus) et la coller en commentaire en
tête de `mod tests` sous forme de checklist groupée par famille (fils, historique,
réglages, surlignages, automations, fichiers/projet, Narval, commandes/plugins,
presse-papiers/images, KB, Zotero, agents liés, divers). Cocher au fil des étapes.

**Verify**: `grep -c "\[x\]\|\[ \]" rust/crates/atelier-runtime/src/ws_router.rs` → 121.

### Step 2 : Fils et historique

Tests : `ping` → `pong` ; `listThreads` sur état vide → tableau vide ; `upsertThread` puis `listThreads` → le fil apparaît avec ses champs ; `renameThread`/`moveThread`/`deleteThread` → effet visible dans `listThreads` ; `getHistory` d'un fil inconnu → réponse vide bien formée ; `getHistory` d'un fil dont le journal contient 3 événements écrits via l'API du journal (`state.journal()` — cherche `append`/`emit` dans `atelier-store/src/journal.rs`) → 3 événements dans l'ordre ; message de type inconnu → réponse d'erreur (forme exacte à caractériser).

**Verify**: `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml ws_router` → nouveaux tests verts.

### Step 3 : Réglages, surlignages, presse-papiers

`getSettings` défaut ; `saveSettings` puis `getSettings` → persistance ; `addHighlight`/`listHighlights`/`removeHighlight` ; `listPasted` vide, `saveImage` avec un PNG minimal en base64 puis `listPasted` → 1 entrée, `clearPasted` → vide.

**Verify**: idem.

### Step 4 : Fichiers, projet, commandes, plugins

`projectFolderCatalog` et `listFiles` sur un `tempdir` contenant 3 fichiers (dont un `.gitignore`d si le code le respecte — caractériser) ; `listCommands` (déjà 1 test — ajouter le cas « aucune commande projet ») ; `listPlugins`.

**Verify**: idem.

### Step 5 : KB, Zotero, automations, Narval

`kbList` vide ; `kbAdd` avec un fichier texte du tempdir puis `kbList` → 1 ; `zoteroSearch` sans base → erreur `"zotero-introuvable"` avec `requestId` écho (1 test existe déjà — compléter `zoteroCollections`, `zoteroFav` sur base absente) ; `listAutomations` vide, `createAutomation`/`updateAutomation`/`deleteAutomation` ; `narvalStatus` sans configuration → réponse d'erreur bien formée (ne pas appeler le réseau : si un handler tente une connexion SSH, caractériser la réponse « non configuré » seulement).

**Verify**: idem.

### Step 6 : Bilan

Compter les tests, cocher la checklist, lister dans le rapport les branches
**non** caractérisées et pourquoi (ex. nécessitent un binaire externe).

**Verify**: `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` → `test result: ok` ; `grep -c "#\[tokio::test\]" rust/crates/atelier-runtime/src/ws_router.rs` → ≥ 30.

## Test plan

- ≥ 24 nouveaux `#[tokio::test]` répartis par famille (étapes 2-5), chacun sur `route_ws` avec la fabrique `state()`.
- Modèle : les 6 tests existants de `mod tests` (l.4183-4320).

## Done criteria

- [ ] `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` → ok, ≥ 24 tests de plus.
- [ ] `git diff -- rust/crates/atelier-runtime/src/ws_router.rs` ne contient que des lignes dans `mod tests`/`mod compaction_contrat_tests` (vérifier : aucune modification avant la ligne `mod compaction_contrat_tests`).
- [ ] Checklist des 121 types présente et cochée.
- [ ] Ligne 072 de `plans/README.md` mise à jour, avec la liste des branches non couvertes.

## STOP conditions

- Un handler exige un binaire ou un réseau (Narval SSH, CLI provider) et n'a pas de branche « non configuré » testable — rapporte-le et passe à la famille suivante.
- Caractériser un comportement exigerait de modifier `route_ws` ou un handler.
- La fabrique `state()` ne permet pas de pré-remplir le journal d'un fil sans toucher `state.rs` : rapporte ce qu'il faudrait ajouter (nom, signature) plutôt que d'improviser.

## Maintenance notes

- Le découpage de `ws_router.rs` (plan à écrire ensuite) doit laisser ces tests **inchangés et verts** : ils sont le contrat de non-régression du routage.
- Reviewer : refuser un test qui n'assert que `out.len() == 1` sans regarder la forme de la réponse.
