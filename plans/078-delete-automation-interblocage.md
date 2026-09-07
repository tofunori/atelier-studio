# Plan 078 : Supprimer une automatisation répond toujours (fin de l'interblocage du Mutex)

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Base obligatoire** : étape 0 `git merge --no-edit main` puis `git merge --no-edit advisor/072-caracterisation-ws-router` (les tests de caractérisation) ; conflit → abort et STOP.
> **Drift check** : `git diff --stat ce9f6bcc..HEAD -- rust/crates/atelier-runtime/src/automations.rs` → vide attendu.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/072
- **Category**: bug
- **Planned at**: commit `ce9f6bcc` (branche 072), 2026-09-06 — trouvé par le plan 072

## Why this matters

`deleteAutomation` avec un id existant ne répond **jamais** : le message WebSocket
reste sans réponse et l'UI attend indéfiniment. Cause : dans
`rust/crates/atelier-runtime/src/automations.rs:63`, la garde du `tokio::sync::Mutex`
obtenue dans le scrutateur du `match` vit jusqu'à la fin du `match` (règle des
temporaires), et le bras `Ok` appelle `automations_reply(state)` qui re-verrouille
le même Mutex → interblocage. `update` (l.52) ne souffre pas du problème parce que
`update_item` relâche le verrou avant de retourner.

## Current state

```rust
// automations.rs:58-67
pub async fn delete(state: &AppState, msg: &Value) -> Vec<String> {
    let id = msg.get("id").and_then(Value::as_str).unwrap_or("");
    if id.is_empty() {
        return vec![error_reply("id d’automatisation requis")];
    }
    match state.automations().lock().await.delete(id) {
        Ok(_) => automations_reply(state).await,   // re-verrouille → interblocage
        Err(error) => vec![error_reply(error)],
    }
}
// automations.rs:414
async fn automations_reply(state: &AppState) -> Vec<String> {
    let items = state.automations().lock().await.list();
    …
}
```

Le même motif « relâcher avant de rappeler » est déjà documenté dans
`ws_router.rs` (bras `addHighlight` : « Drop the mutex before broadcast_highlights
(tokio Mutex is not reentrant) »). Test de caractérisation existant (plan 072) :
`automation_create_update_delete_roundtrip` réduit à create+update, et
`delete_automation_requires_an_id`, dans `mod tests` de `ws_router.rs`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml automation` | `test result: ok` |
| Suite | `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` | ok (224+) |

## Scope

**In scope**: `rust/crates/atelier-runtime/src/automations.rs` (fonction `delete` uniquement), `rust/crates/atelier-runtime/src/ws_router.rs` (module `mod tests` uniquement : étendre le roundtrip au delete).
**Out of scope**: tout autre handler ; le magasin d'automatisations.

## Git workflow

Branche `advisor/078-delete-automation` ; commit `fix(automations): relâcher le verrou avant la réponse (interblocage deleteAutomation)` ; ne pas pousser.

## Steps

### Step 1 : Test rouge
Dans `mod tests` de `ws_router.rs`, étendre `automation_create_update_delete_roundtrip` : après l'update, envoyer `{"type":"deleteAutomation","id":<id>}` et asserter une réponse `type:"automations"` dont le tableau ne contient plus l'id. Envelopper l'appel dans `tokio::time::timeout(Duration::from_secs(5), …)` pour que le test échoue au lieu de pendre.
**Verify**: `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml automation_create_update_delete_roundtrip` → `1 failed` (timeout).

### Step 2 : Correctif
```rust
let result = { state.automations().lock().await.delete(id) };
match result {
    Ok(_) => automations_reply(state).await,
    Err(error) => vec![error_reply(error)],
}
```
(le bloc force la chute de la garde avant le `match`). Vérifier par `grep -n "lock().await" automations.rs` qu'aucun autre `match` ne tient une garde en scrutateur en rappelant une fonction qui verrouille.
**Verify**: le test de l'étape 1 → `1 passed` ; suite complète ok.

## Done criteria

- [ ] `cargo test -q -p atelier-runtime --manifest-path rust/Cargo.toml` → ok, roundtrip couvre create/update/delete.
- [ ] `git diff --stat` = `automations.rs` (+ tests de `ws_router.rs`).

## STOP conditions

- Un autre handler présente le même motif (garde en scrutateur + rappel verrouillant) : rapporte-le sans le corriger (plan séparé).

## Maintenance notes

Jamais de `match state.x().lock().await.f() { … g(state).await … }` avec un Mutex tokio : capturer le résultat dans un bloc d'abord. Reviewer : refuser toute garde vivante à travers un `.await` qui re-verrouille.
