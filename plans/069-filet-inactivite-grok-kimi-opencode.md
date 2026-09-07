# Plan 069 : Un tour Grok, Kimi ou OpenCode ne meurt que sur silence total, jamais pendant qu'il travaille

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- rust/crates/atelier-providers/src/grok.rs rust/crates/atelier-providers/src/kimi.rs rust/crates/atelier-providers/src/opencode.rs rust/crates/atelier-providers/src/turn_idle.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

Atelier pilote cinq CLIs d'agents. Pour Claude et Codex, la fin forcée d'un
tour est un **filet d'inactivité** (`turn_idle.rs`) : le compte à rebours
repart à chaque événement reçu, donc un agent qui travaille dix minutes reste
vivant, et seul un CLI muet est coupé. Grok et Kimi ont gardé une **échéance
sèche** de 600 s sur tout le tour : un tour qui exécute 40 commandes et lit 15
fichiers est tué à la 600e seconde alors qu'il parle en continu — exactement
l'incident qui a motivé `turn_idle.rs` (voir son en-tête, qui note lui-même
« grok et kimi ont leur propre copie, pas encore migrée »). OpenCode est pire :
**aucune borne** — un CLI vivant mais figé laisse le fil « en cours » pour
toujours, seul un Stop manuel y met fin. En plus, Grok relit la variable d'env
du délai à chaque `send()` (course avec les tests qui la mutent, pattern proscrit
dans `claude.rs`) et n'a aucun test du chemin timeout, contrairement à Kimi.

Après ce plan : les trois providers utilisent le même filet que Claude/Codex,
la durée est figée à la construction et injectable en test, et chaque provider
a un test « CLI muet → erreur de timeout, jamais de done ok ».

## Current state

Fichiers :

- `rust/crates/atelier-providers/src/turn_idle.rs` — le filet partagé. API publique
  (lignes 41-76) :
  ```rust
  pub fn idle_from_env() -> Duration            // ATELIER_TURN_TIMEOUT_SECS, défaut 600 s
  pub struct TurnActivity(Arc<AtomicU64>);      // Clone + Default
  impl TurnActivity { pub fn new() -> Self; pub fn bump(&self); }
  pub async fn with_idle_timeout<F: Future>(fut: F, idle: Duration, activity: &TurnActivity)
      -> Result<F::Output, ()>                  // Err(()) = silence total > idle ; idle == 0 désactive
  ```
- `rust/crates/atelier-providers/src/claude.rs` — **exemplaire à imiter** :
  champ `idle: Duration` posé à la construction (`with_bin`, via
  `crate::turn_idle::idle_from_env()`), `#[cfg(test)] fn with_idle(self, Duration)`,
  et dans `send()` (l.816-970) :
  ```rust
  let activity = crate::turn_idle::TurnActivity::new();
  // … chaque ligne lue : activity.bump();  (l.887)
  match crate::turn_idle::with_idle_timeout(read_loop, self.idle, &activity).await {
      Ok(()) => {}
      Err(()) => { /* kill, flush, */ (req.on_event)(json!({"kind":"error",
          "message": format!("Claude muet depuis {minutes} min — tour interrompu")})); /* ok=false, error="timeout" */ }
  }
  ```
- `rust/crates/atelier-providers/src/grok.rs` — délai relu à chaque tour (l.44-50) :
  ```rust
  const TURN_TIMEOUT_SECS_DEFAULT: u64 = 600;
  fn turn_timeout_secs() -> u64 { std::env::var("ATELIER_TURN_TIMEOUT_SECS").ok().and_then(|v| v.parse().ok()).unwrap_or(TURN_TIMEOUT_SECS_DEFAULT) }
  ```
  et échéance sèche sur le tour (l.620-636) :
  ```rust
  let prompt_result = tokio::time::timeout(
      Duration::from_secs(turn_timeout_secs()),
      runtime.acp.request("session/prompt", json!({"sessionId": sid, "prompt": [{"type":"text", "text": prompt}]}), None),
  ).await.unwrap_or_else(|_| Err(AcpRpcError::transport(format!("timeout Grok ({}s) — CLI figé sans répondre", turn_timeout_secs()))));
  ```
  Le handler des notifications `session/update` est posé l.560-595
  (`let handler: SessionUpdateHandler = Arc::new(move |update: &Value| { … })`
  puis `runtime.acp.set_session_handler(&sid, handler).await`) — c'est là que
  l'activité doit être signalée.
- `rust/crates/atelier-providers/src/kimi.rs` — **déjà** la bonne moitié :
  `turn_timeout_secs: u64` figé à la construction (l.78-81, 101), override
  `#[cfg(test)] fn with_turn_timeout_secs(mut self, secs: u64)` (l.106-109),
  test `cli_fige_le_timeout_termine_le_tour_avec_erreur` (l.1556-1578) qui
  utilise `fixture_provider("nominal").map(|p| p.with_turn_timeout_secs(1))` et
  `run_turn(&p, "[hang] question", …)`. Mais l'attente reste une échéance sèche
  (l.1029-1042) : `tokio::time::timeout(Duration::from_secs(self.turn_timeout_secs), self.acp.request("session/prompt", …, None))`.
- `rust/crates/atelier-providers/src/opencode.rs` — aucune borne (l.298-308) :
  ```rust
  let prompt_res = self.acp.request("session/prompt", json!({"sessionId": sid, "prompt": [{"type":"text","text": req.prompt}]}), None).await;
  ```
  Les notifications passent par `map_session_update(update, ctx)` (l.271) dans
  le handler de session ; `pub struct OpenCodeProvider` l.154, `pub fn new()` l.165.
- Mémoire projet (CLAUDE.md / mémoire « Tests Rust : env::set_var = course ») :
  **jamais** `std::env::set_var` dans un test ; la config s'injecte sur la struct.
  Le commentaire de `kimi.rs:78-81` explique le flake vécu.

Conventions : commentaires en français, messages d'erreur utilisateur en
français sur le modèle `"Claude muet depuis {minutes} min — tour interrompu"` ;
le `SendResult` d'un timeout est `ok: false, error: Some("timeout".into())`
(voir `claude.rs` l.944-975).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests providers | `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml` | `test result: ok` (259+ tests avant ce plan, 2 ignorés) |
| Un test ciblé | `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml <nom>` | `test result: ok. 1 passed` |
| Build | `cargo build -q --manifest-path rust/Cargo.toml` | exit 0 (2 warnings `dead_code` préexistants tolérés) |
| Vérif globale | `npm run verify` (à la racine, ~3 min) | exit 0 ; si des tests vitest frontend échouent en timeout, les rejouer seuls : ce sont des flakes sous charge connus |

## Scope

**In scope** (only files to modify):
- `rust/crates/atelier-providers/src/grok.rs`
- `rust/crates/atelier-providers/src/kimi.rs`
- `rust/crates/atelier-providers/src/opencode.rs`
- `rust/crates/atelier-providers/src/turn_idle.rs` (seulement si un helper partagé s'impose — voir étape 1)

**Out of scope** (do NOT touch):
- `claude.rs`, `codex.rs` — déjà migrés ; référence, pas cible.
- `acp_rpc.rs`, `acp_map.rs` — le contrat RPC (`timeout_ms: None` = attente illimitée, « le tour est borné par l'appelant ») est correct ; on borne côté appelant.
- `rust/crates/atelier-runtime/**`, `sidecar/**` (Node en extinction), `src/**`.

## Git workflow

- Branche : `advisor/069-filet-inactivite-acp` (le repo a un hook d'auto-commit qui balaie le worktree : committer tôt et petit, ne jamais réécrire l'historique).
- Messages : conventionnels en français, ex. `fix(grok): filet d'inactivité au lieu de l'échéance sèche`.
- Ne pas pousser.

## Steps

### Step 1 : Grok — durée figée à la construction, override de test

Dans `grok.rs`, ajouter au provider un champ `idle: Duration` peuplé dans le
constructeur par `crate::turn_idle::idle_from_env()` (comme `claude.rs`), un
`#[cfg(test)] fn with_idle(mut self, idle: Duration) -> Self`, et supprimer
`turn_timeout_secs()` + `TURN_TIMEOUT_SECS_DEFAULT` (l.44-50) une fois plus
utilisés. Adapter le message d'erreur pour lire `self.idle.as_secs()`.

**Verify**: `grep -n "turn_timeout_secs\|TURN_TIMEOUT_SECS_DEFAULT" rust/crates/atelier-providers/src/grok.rs` → aucune sortie ; `cargo build -q --manifest-path rust/Cargo.toml` → exit 0.

### Step 2 : Grok — remplacer l'échéance sèche par le filet d'inactivité

Créer `let activity = crate::turn_idle::TurnActivity::new();` avant de poser le
handler de session (l.~560) ; cloner `activity` dans la closure du handler et
appeler `activity_handler.bump()` en tête de chaque notification reçue (toute
notification, y compris deltas de texte/raisonnement : un modèle qui réfléchit
est vivant). Remplacer le bloc `tokio::time::timeout(Duration::from_secs(…), runtime.acp.request(…))`
par :
```rust
let prompt_result = match crate::turn_idle::with_idle_timeout(
    runtime.acp.request("session/prompt", json!({…}), None), self.idle, &activity).await {
    Ok(r) => r,
    Err(()) => Err(AcpRpcError::transport(format!(
        "Grok muet depuis {} min — tour interrompu", self.idle.as_secs() / 60))),
};
```
Conserver tout ce qui suit (`watcher.abort()`, `wait_for_quiet`, `clear_session_handler`).
Le chemin d'erreur existant doit continuer à émettre l'`error` et à retourner
`ok:false` — ne pas changer cette mécanique, seulement la source de l'erreur.

**Verify**: `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml grok` → `test result: ok` (aucune régression des tests grok existants).

### Step 3 : Grok — test « CLI muet »

Sur le modèle de `kimi.rs:1556-1578`, ajouter dans le module de tests grok un
test `#[tokio::test] async fn cli_fige_le_filet_termine_le_tour_avec_erreur()` :
provider de fixture `.with_idle(Duration::from_secs(1))`, tour qui fait pendre le
faux CLI (regarde comment les tests grok existants lancent un faux serveur ACP —
cherche `fixture`/`fake` dans le module de tests de `grok.rs` ; s'il n'existe pas
de fixture « hang », étends la fixture existante avec un mode qui répond à
`session/prompt` par le silence). Attendus : `!result.ok`, une erreur contenant
« muet », aucun `done` avec `ok:true`, durée < 15 s (TICK de 5 s dans `turn_idle`).
Ajouter aussi un test « un tour bavard plus long que `idle` n'est PAS coupé » :
fixture qui émet une notification toutes les 300 ms pendant 2 s avec `idle` = 1 s,
puis répond — attendu `result.ok`.

**Verify**: `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml cli_fige_le_filet` → `1 passed` ; le test bavard → `1 passed`.

### Step 4 : Kimi — même filet

Dans `kimi.rs`, garder `turn_timeout_secs` (déjà figé à la construction) mais
remplacer l'échéance sèche (l.1029-1042) par `with_idle_timeout` avec un
`TurnActivity` bumpé dans le handler de session (même geste qu'à l'étape 2).
Message : « Kimi muet depuis N min — tour interrompu ». Adapter le test
existant `cli_fige_le_timeout_termine_le_tour_avec_erreur` : l'assertion
`m.contains("timeout Kimi")` devient `m.contains("muet")`. Ajouter le test
« bavard non coupé » comme à l'étape 3.

**Verify**: `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml kimi` → `test result: ok`.

### Step 5 : OpenCode — poser le filet qui manquait

Dans `opencode.rs` : champ `idle: Duration` (constructeur `new()` l.165 et tout
constructeur de test), `#[cfg(test)] fn with_idle`, `TurnActivity` bumpé dans le
handler qui appelle `map_session_update` (l.271), et `with_idle_timeout` autour
de `self.acp.request("session/prompt", …)` (l.298-308) avec le message
« OpenCode muet depuis N min — tour interrompu ». Sur `Err(())`, le tour doit se
conclure comme un échec de prompt (même chemin que `prompt_res` en erreur :
`watcher.abort()`, `clear_session_handler`, retrait de `active_turns`, `error`
émis, `ok:false`). Ajouter les deux tests (muet / bavard) sur la fixture ACP
opencode existante (cherche `fake_opencode`/`fixture` dans le module de tests).

**Verify**: `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml opencode` → `test result: ok`.

### Step 6 : Documentation du module partagé

Dans l'en-tête de `turn_idle.rs` (l.1-16), remplacer la phrase « grok et kimi
ont leur propre copie, pas encore migrée » par l'état réel (les cinq providers
passent par ce module). Ne changer aucune logique dans ce fichier.

**Verify**: `grep -n "pas encore migrée" rust/crates/atelier-providers/src/turn_idle.rs` → aucune sortie.

## Test plan

- Nouveaux tests (6) : pour chacun de grok / kimi / opencode — (a) CLI muet →
  erreur contenant « muet », `ok:false`, pas de `done ok:true`, < 15 s ;
  (b) CLI bavard plus long que `idle` → `ok:true`, jamais coupé.
- Modèle structurel : `kimi.rs:1556-1578` (`fixture_provider(...).with_turn_timeout_secs(1)`, `run_turn`, `out.errors()`, `out.done()`).
- Exécution : `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml` → tout vert, 6 tests de plus qu'avant.

## Done criteria

- [ ] `grep -rn "tokio::time::timeout(" rust/crates/atelier-providers/src/{grok,kimi,opencode}.rs` ne montre plus aucune échéance autour de `session/prompt` (les autres `timeout` sur des RPC courts — `session/new`, `initialize` — peuvent rester).
- [ ] `grep -rn "env::var(\"ATELIER_TURN_TIMEOUT_SECS\")" rust/crates/atelier-providers/src/` → uniquement dans `turn_idle.rs`.
- [ ] `grep -rn "env::set_var" rust/crates/atelier-providers/src/` → aucune nouvelle occurrence.
- [ ] `cargo test -q -p atelier-providers --manifest-path rust/Cargo.toml` → `test result: ok`, +6 tests.
- [ ] `cargo build -q --manifest-path rust/Cargo.toml` → exit 0.
- [ ] `git status --short` ne montre que les fichiers in scope.
- [ ] Ligne 069 de `plans/README.md` mise à jour.

## STOP conditions

- Les excerpts « Current state » ne correspondent plus au code (drift).
- La fixture de test d'un provider ne permet pas de simuler un CLI qui se tait après `session/prompt` sans modifier un fichier hors scope (ex. un script Node de fixture dans `rust/crates/atelier-providers/tests/` ou `fixtures/`) — si la fixture vit dans un fichier hors de la liste, **arrête et rapporte** le chemin exact plutôt que de l'éditer.
- Un test provider existant échoue après l'étape 2/4/5 pour une raison que tu ne comprends pas en 2 tentatives.
- `with_idle_timeout` s'avère incompatible avec le type de future retourné par `acp.request` (ex. `!Send`) — rapporte l'erreur du compilateur.

## Maintenance notes

- Tout nouveau provider doit passer par `turn_idle::with_idle_timeout` avec un `TurnActivity` bumpé sur chaque notification ; un `tokio::time::timeout` sec autour d'un tour est une régression (ajouter un test de contrat si cela se reproduit).
- Reviewer : vérifier que le `bump()` est bien dans le handler de **toutes** les notifications de session (pas seulement les blocs texte), sinon un long outil silencieux côté texte serait coupé à tort.
- Différé volontairement : un signal UI « agent muet depuis N s » avant la coupure (aujourd'hui l'utilisateur ne voit rien jusqu'à l'erreur).
