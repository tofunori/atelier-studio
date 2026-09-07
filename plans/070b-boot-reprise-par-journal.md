# Plan 070b : Au démarrage, un message « delivering » n'est plus remis en file à l'aveugle — la réconciliation par le journal de 070 fait foi

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Base obligatoire** : ce plan s'applique **par-dessus la branche `advisor/070-mailbox-delivering`** (commit `28cc36f4`). Étape 0 : `git merge --no-edit main` puis `git merge --no-edit advisor/070-mailbox-delivering` ; en cas de conflit, `git merge --abort` et STOP.
> **Drift check (après l'étape 0)**: `git diff --stat 28cc36f4..HEAD -- rust/crates/atelier-runtime/src/server.rs rust/crates/atelier-runtime/src/agent_mailbox.rs rust/crates/atelier-store/src/agent_mailbox.rs` — seuls des changements venant de `main` sont attendus ; `serve_once` doit toujours contenir l'appel à `recover_delivering` décrit ci-dessous.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/070 (branche `advisor/070-mailbox-delivering`)
- **Category**: bug
- **Planned at**: commit `28cc36f4` (branche 070) / main `c0c47839`, 2026-09-06

## Why this matters

Le plan 070 a ajouté `recover_stuck_deliveries` : au premier `drain_mailbox`,
un message resté `"delivering"` après un crash est marqué `"delivered"` si le
journal du fil cible porte déjà sa trace (`meta.messageId == "agent:<id>"`),
sinon remis en `"queued"`. Mais le démarrage de l'app (`server.rs::serve_once`)
appelle **avant** cela `mailbox.recover_delivering(...)`, qui remet en file
**tous** les `"delivering"` sans regarder le journal : au redémarrage, un
message dont l'envoi avait abouti juste avant le crash est **livré une seconde
fois** au fil enfant, et la réconciliation de 070 n'a jamais rien à faire sur ce
chemin. Ce plan retire la remise en file aveugle ; `drain_mailbox` (déjà spawné
juste après) réconcilie sous son verrou.

## Current state

- `rust/crates/atelier-runtime/src/server.rs` (~l.205-215) :
  ```rust
  {
      let mut mailbox = state.mailbox().lock().await;
      let _ = mailbox.recover_delivering(&atelier_store::iso_now());
  }
  let recovery_state = state.clone();
  tokio::spawn(async move {
      crate::agent_mailbox::drain_mailbox(&recovery_state).await;
  ```
- `rust/crates/atelier-store/src/agent_mailbox.rs` : `pub fn recover_delivering(&mut self, updated_at: &str) -> Result<usize, String>` — boucle `if m.status == "delivering" { m.status = "queued".into(); … }` ; a un test unitaire dans le même fichier (cherche `recover_delivering` dans `mod tests`). `pub fn stuck_delivering(&self)` ajouté par 070.
- `rust/crates/atelier-runtime/src/agent_mailbox.rs` (branche 070) : `async fn recover_stuck_deliveries(state)` puis `pub async fn drain_mailbox(state)` qui prend `mailbox_drain_lock` et appelle `recover_stuck_deliveries(state).await` en premier ; tests `stuck_delivering_without_target_trace_is_requeued_and_redelivered` et `stuck_delivering_with_target_trace_is_marked_delivered_without_resend` (module `tests` en fin de fichier, `AppState` via `crate::state::test_state()` ou équivalent — regarde ce que ces tests utilisent).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `cargo test -q -p atelier-store -p atelier-runtime --manifest-path rust/Cargo.toml` | `test result: ok` (22 + 189 après 070) |
| Build | `cargo build -q --manifest-path rust/Cargo.toml` | exit 0 |

## Scope

**In scope**: `rust/crates/atelier-runtime/src/server.rs` (uniquement le bloc `recover_delivering` de `serve_once`), `rust/crates/atelier-store/src/agent_mailbox.rs` (retrait de `recover_delivering` et de son test si plus aucun appelant), `rust/crates/atelier-runtime/src/agent_mailbox.rs` (un test de plus).
**Out of scope**: `send.rs`, `agent_links.rs`, tout le reste de `server.rs`.

## Git workflow

Branche `advisor/070b-boot-reprise-journal` (créée à partir du worktree après l'étape 0) ; commit `fix(mailbox): au boot, réconciliation par le journal au lieu de la remise en file aveugle` ; ne pas pousser.

## Steps

### Step 1 : Test rouge
Dans le module de tests de `atelier-runtime/src/agent_mailbox.rs`, ajouter `boot_ne_relivre_pas_un_message_delivering_deja_trace` : état avec un message `delivering` dont le journal du fil cible porte `meta.messageId = "agent:<id>"` ; reproduire la séquence de boot **telle qu'elle est aujourd'hui** (appeler `recover_delivering` puis `drain_mailbox`) et vérifier que le fil cible ne reçoit **pas** de second événement — ce test doit ÉCHOUER avant le correctif (c'est la preuve du bug).
**Verify**: `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml boot_ne_relivre_pas` → `1 failed`.

### Step 2 : Retirer la remise en file aveugle
Dans `server.rs::serve_once`, supprimer le bloc `mailbox.recover_delivering(...)` (les 4 lignes) ; laisser le `tokio::spawn(drain_mailbox)` qui suit. Commenter en une ligne pourquoi (« la réconciliation par le journal vit dans `drain_mailbox`, plan 070 »). Adapter le test de l'étape 1 pour qu'il n'appelle plus `recover_delivering` mais seulement `drain_mailbox` (séquence de boot réelle après correctif).
**Verify**: `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml boot_ne_relivre_pas` → `1 passed`.

### Step 3 : Nettoyage du magasin
`grep -rn "recover_delivering" rust/crates` : s'il ne reste que la définition et son test unitaire, supprimer les deux ; sinon (un autre appelant existe) — STOP et rapporte l'appelant.
**Verify**: `grep -rn "recover_delivering" rust/crates` → aucune sortie ; `cargo test -q -p atelier-store -p atelier-runtime --manifest-path rust/Cargo.toml` → ok.

## Done criteria

- [ ] `grep -rn "recover_delivering" rust/crates` → vide.
- [ ] `cargo test -q -p atelier-store -p atelier-runtime --manifest-path rust/Cargo.toml` → ok, +1 test runtime, −1 test store (ou ±0 si le test store est réécrit sur `stuck_delivering`).
- [ ] `git status --short` limité au scope.

## STOP conditions

- Conflit à l'étape 0.
- `recover_delivering` a un autre appelant que `serve_once`.
- Le test de l'étape 1 ne peut pas reproduire la séquence de boot sans construire un serveur complet — rapporte ce qui manque à `test_state()`.

## Maintenance notes

Toute nouvelle « récupération » au boot doit passer par `drain_mailbox` (sous `mailbox_drain_lock`) : deux chemins de reprise concurrents recréent le bug.
