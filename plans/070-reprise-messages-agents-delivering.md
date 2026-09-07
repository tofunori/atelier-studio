# Plan 070 : Un message d'agent lié coincé en « delivering » après un crash est repris au démarrage, une seule fois

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- rust/crates/atelier-store/src/agent_mailbox.rs rust/crates/atelier-runtime/src/agent_mailbox.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

Les fils d'agents liés (plan 057) s'échangent des messages via une boîte aux
lettres persistée. Le drain marque un message `"delivering"` **avant** de
l'envoyer au fil cible, puis `"delivered"` après. Si le process meurt entre les
deux (crash, kill du sidecar, relance de l'app), le message reste en
`"delivering"` sur disque ; or `queued()` ne reprend que `"queued"`, donc ce
message n'est **jamais** relivré ni marqué en échec : le fil parent croit avoir
parlé, le fil enfant n'a rien reçu, et rien ne le signale. Après ce plan, un
`"delivering"` retrouvé au démarrage est repris une fois (relivré si le fil
cible n'en porte pas déjà trace), et l'utilisateur voit un statut honnête.

## Current state

- `rust/crates/atelier-store/src/agent_mailbox.rs` — le magasin. `pub struct MailboxMessage` (l.11) avec `pub status: String` (l.26) ; `pub fn queued(&self) -> Vec<MailboxMessage>` (l.104-112) :
  ```rust
  .filter(|m| m.status == "queued")
  ```
  `count_queued_for_link` (l.114-122) compte lui `"queued" | "delivering" | "paused"` — cohérent avec l'idée que `delivering` est encore « à faire ». `pub fn update_status(...)` l.143. Tests existants l.270, 303, 340 (`#[test]` sur des opérations du magasin) — modèle à suivre.
- `rust/crates/atelier-runtime/src/agent_mailbox.rs` — le drain (`pub async fn drain_mailbox(state: &AppState)` l.327 ; `async fn deliver_via_send(...)` l.506). Séquence l.419-424 :
  ```rust
  let mut mb = state.mailbox().lock().await;
  let _ = mb.update_status(&msg.id, "delivering", None, &now);
  // … update_agent_message_status(state, &msg, "delivering").await;
  ```
  puis l.474-482 : `let delivery = deliver_via_send(state, &send_msg).await;` et, si `Ok`, `update_status(&msg.id, "delivered", …)`. Le message envoyé porte un `clientMessageId` déterministe `format!("agent:{}", msg.id)` (l.~463), transmis au fil cible ; côté `send.rs` (l.1115) il n'est utilisé que pour la réconciliation de bulle optimiste, pas comme clé d'idempotence.
- Le journal du fil cible (`state.journal()`, `materialize(thread_id)`, voir `ws_router.rs:277-283`) contient les événements `user` avec leur `meta.messageId`/`clientMessageId` — c'est la trace qui permet de savoir si la livraison avait abouti avant le crash.

Conventions : commentaires en français ; statuts de la mailbox = chaînes
(`queued`, `delivering`, `delivered`, `paused`, `failed` — vérifier la liste
exacte par `grep -n '"failed"\|"paused"' rust/crates/atelier-store/src/agent_mailbox.rs rust/crates/atelier-runtime/src/agent_mailbox.rs`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests store | `cargo test -q -p atelier-store --manifest-path rust/Cargo.toml` | `test result: ok` |
| Tests runtime | `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` | `test result: ok` (192+ tests) |
| Build | `cargo build -q --manifest-path rust/Cargo.toml` | exit 0 |

## Scope

**In scope**:
- `rust/crates/atelier-store/src/agent_mailbox.rs`
- `rust/crates/atelier-runtime/src/agent_mailbox.rs`

**Out of scope**:
- `rust/crates/atelier-runtime/src/send.rs` — ne pas y ajouter d'idempotence globale par `clientMessageId` (impact sur tous les envois, hors sujet).
- `src/**` (front), `sidecar/**`.

## Git workflow

- Branche : `advisor/070-mailbox-delivering` ; commits petits en français (`fix(mailbox): reprise des messages delivering orphelins`) ; ne pas pousser.

## Steps

### Step 1 : Test rouge côté magasin

Dans `atelier-store/src/agent_mailbox.rs`, ajouter une fonction
`pub fn stuck_delivering(&self) -> Vec<MailboxMessage>` (même forme que
`queued()`, filtre `"delivering"`, tri par `created_at`) et un test `#[test]`
sur le modèle de ceux des l.270-340 : un message passé en `delivering` n'apparaît
pas dans `queued()` mais apparaît dans `stuck_delivering()`.

**Verify**: `cargo test -q -p atelier-store --manifest-path rust/Cargo.toml stuck_delivering` → `1 passed`.

### Step 2 : Reprise au démarrage, une seule fois

Dans `atelier-runtime/src/agent_mailbox.rs`, au début de `drain_mailbox` (ou dans
la fonction appelée au boot — repère l'appelant de `drain_mailbox` par
`grep -rn "drain_mailbox(" rust/crates/atelier-runtime/src/`), pour chaque
message de `stuck_delivering()` :
1. si le journal du fil cible contient déjà un événement `user` dont le
   `clientMessageId`/`messageId` vaut `format!("agent:{}", msg.id)` → marquer
   `"delivered"` (la livraison avait abouti, seul le statut manquait) ;
2. sinon → remettre en `"queued"` pour que le drain normal le relivre.
Écrire ce choix en commentaire (« crash entre l'envoi et l'écriture du statut »).
Pour lire le journal : `state.journal().has_journal(id)` puis `materialize(id)`
et chercher `ev["meta"]["clientMessageId"] == "agent:<id>"` (vérifie le nom exact
du champ dans un événement `user` réel : `grep -n "clientMessageId" rust/crates/atelier-harness/src/thread.rs`).

**Verify**: `cargo build -q --manifest-path rust/Cargo.toml` → exit 0.

### Step 3 : Tests runtime

Sur le modèle des tests de `agent_mailbox.rs` runtime (cherche `#[tokio::test]`
dans le fichier ; s'il n'y en a pas, utilise `state.rs::test_state()` l.375 pour
construire un `AppState`) : (a) message `delivering` sans trace dans le journal
cible → après reprise, statut `queued` puis livré par le drain (provider
`FakeProvider`, voir `state.rs:283`) ; (b) message `delivering` avec trace
`agent:<id>` dans le journal cible → statut `delivered` sans nouvel envoi
(compter les événements `user` du fil cible avant/après : inchangé).

**Verify**: `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml mailbox` → tout vert, 2 tests de plus.

## Test plan

- Store : `stuck_delivering` (1 test). Runtime : reprise sans trace → relivré ; reprise avec trace → `delivered` sans doublon (2 tests).
- Modèles : `atelier-store/src/agent_mailbox.rs:270-340` ; tests runtime existants du même fichier ou `state.rs::test_state`.

## Done criteria

- [ ] `cargo test -q -p atelier-store -p atelier-runtime --manifest-path rust/Cargo.toml` → ok, +3 tests.
- [ ] `grep -n "stuck_delivering" rust/crates/atelier-runtime/src/agent_mailbox.rs` → au moins une utilisation.
- [ ] `git status --short` limité aux deux fichiers in scope.
- [ ] Ligne 070 de `plans/README.md` mise à jour.

## STOP conditions

- Le champ porteur de `agent:<id>` dans les événements journalisés n'est ni `clientMessageId` ni `messageId` (impossible de détecter une livraison passée) — rapporte le nom réel des champs trouvés.
- La reprise exigerait de modifier `send.rs` ou `thread.rs`.
- Un test existant de la mailbox (drain normal, budget, pause) casse.

## Maintenance notes

- Si un jour le drain devient transactionnel (outbox : statut et envoi dans une même écriture), cette reprise devient inutile — la retirer alors.
- Reviewer : s'assurer qu'un message repris ne peut pas boucler (queued → delivering → crash → queued…) sans limite : ajouter un compteur d'essais si le magasin en offre un, sinon documenter le risque comme accepté.
