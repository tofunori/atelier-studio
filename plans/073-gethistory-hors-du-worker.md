# Plan 073 : `getHistory` ne bloque plus le worker WebSocket pendant la lecture du journal

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- rust/crates/atelier-runtime/src/ws_router.rs rust/crates/atelier-store/src/journal.rs`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

Chaque bascule de fil ou reconnexion envoie `getHistory`. Le handler lit tout le
journal JSONL du fil sur disque (`std::fs::read_to_string`), le parse, le trie et
le déduplique — **dans le handler async lui-même**, sans `spawn_blocking`. Sur un
fil de recherche long (des milliers d'événements, l'usage normal d'Atelier), ce
travail bloque le worker tokio qui sert aussi les autres messages WebSocket : le
chat paraît figé le temps de la lecture. Le chemin Codex, trois lignes plus bas
dans le même handler, fait déjà la chose correcte avec `spawn_blocking`.

## Current state

- `rust/crates/atelier-runtime/src/ws_router.rs:277-292` :
  ```rust
  "getHistory" => {
      let id = msg.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
      let journal = if state.journal().has_journal(id) {
          state.journal().materialize(id)        // ← bloquant, sur le worker
      } else { Vec::new() };
      let thread = state.threads().lock().await.get(id).cloned();
      let events = match thread {
          Some(t) if t.provider == "codex" => {
              if let Some(session_id) = t.session_id {
                  let native = tokio::task::spawn_blocking(move || load_codex_history(&session_id))
                      .await.unwrap_or_default();   // ← le bon pattern, juste à côté
                  prefer_richer_dialogue(journal, native)
  ```
- `rust/crates/atelier-store/src/journal.rs:153-158` (`fn read_thread` → `std::fs::read_to_string`) et `:216-222` (`pub fn materialize(&self, thread_id: &str) -> Vec<Value>` : lecture + `sort_by_key` sur `/meta/sequence` + dédup).
- `state.journal()` (`rust/crates/atelier-runtime/src/state.rs:238`) retourne `&HarnessJournal`. Pour `spawn_blocking` il faut une valeur `'static` : vérifier si `HarnessJournal` est `Clone` (ou détenu par un `Arc` dans `AppState`) ; sinon cloner ce qui est nécessaire (le chemin racine du journal + l'id) et appeler une fonction associée.
- Tests existants du routeur : `ws_router.rs` `mod tests` (l.~4155), fabrique `state(dir)` + `route_ws(&s, json)`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests runtime | `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` | `test result: ok` |
| Build | `cargo build -q --manifest-path rust/Cargo.toml` | exit 0 |

## Scope

**In scope**: `rust/crates/atelier-runtime/src/ws_router.rs` (branche `getHistory` seulement), `rust/crates/atelier-store/src/journal.rs` (uniquement si un accès `'static`/`Clone` manque), `rust/crates/atelier-runtime/src/state.rs` (idem).
**Out of scope**: le format du journal, `materialize` lui-même (pas d'optimisation du tri ici), le front.

## Git workflow

Branche `advisor/073-gethistory-spawn-blocking` ; commit `perf(ws_router): getHistory lit le journal hors du worker` ; ne pas pousser.

## Steps

### Step 1 : lecture hors du worker
Remplacer `state.journal().materialize(id)` par un `tokio::task::spawn_blocking(move || journal.materialize(&id)).await.unwrap_or_default()` où `journal` est un clone `'static` (ou `Arc`) obtenu avant. Garder `has_journal` (appel léger) tel quel ou l'inclure dans la closure.
**Verify**: `cargo build -q --manifest-path rust/Cargo.toml` → exit 0.

### Step 2 : test
Dans `mod tests` de `ws_router.rs`, ajouter `#[tokio::test] async fn get_history_dun_fil_inconnu_repond_vide()` (`{"type":"getHistory","threadId":"absent"}` → réponse bien formée, tableau vide) et, si le journal expose une API d'écriture accessible depuis le test (cherche `append`/`emit` dans `journal.rs`), un test qui écrit 3 événements puis vérifie l'ordre retourné.
**Verify**: `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml get_history` → tests verts.

## Done criteria

- [ ] `grep -n "journal().materialize" rust/crates/atelier-runtime/src/ws_router.rs` → l'appel est dans une closure `spawn_blocking` (ou aucune occurrence directe).
- [ ] `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` → ok, ≥ 1 test de plus.
- [ ] `git status --short` limité au scope.

## STOP conditions

- `HarnessJournal` n'est ni `Clone` ni derrière un `Arc`, et le rendre tel exige de toucher plus que `state.rs`/`journal.rs` — rapporte.
- Un test existant de `getHistory` (grep `getHistory` dans les tests runtime) change de résultat.

## Maintenance notes

Tout autre handler qui lit un fichier de taille non bornée dans `route_ws` doit suivre ce pattern (`listThreads`, `getLedger` sont des candidats à vérifier lors du plan 072).
