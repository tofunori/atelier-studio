# Plan 059: Donner à l'app un canal de diagnostic exploitable par le support

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 49c52384..HEAD -- src-tauri/src/sidecar.rs src-tauri/src/lib.rs src/components/Settings.tsx rust/crates/atelier-runtime/src/ws_router.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx / supportabilité
- **Planned at**: commit `49c52384`, 2026-08-15

## Why this matters

Audit finding SILENT-09 : quand un client écrira « mes annotations ont disparu »
ou « mon automatisation ne tourne plus », il n'existe **aucun** endroit où une
erreur se soit écrite. Le stderr du sidecar part dans un tampon mémoire de
12 Ko jamais persisté, son stdout est fermé après la première ligne, et aucun
`tracing_subscriber` n'est initialisé dans `src-tauri`. Chaque incident client
est donc non diagnosticable et le coût de support est non borné. Ce plan est le
prérequis de tous les correctifs « échecs silencieux » : remplir les `catch`
ne sert à rien s'il n'y a nulle part où écrire.

## Current state

- `src-tauri/src/sidecar.rs:435-447` — spawn du sidecar avec
  `.stdout(Stdio::piped()).stderr(Stdio::piped())`.
- `src-tauri/src/sidecar.rs:309-331` — `capture_stderr` : boucle qui pousse dans
  un `Arc<Mutex<String>>` avec la garde :
  ```rust
  if s.len() < 12_000 {
      s.push_str(&line);
      if s.len() > 12_000 { /* tronque */ }
  ```
  Jamais écrit sur disque ; lu uniquement par `stderr_snapshot()` pour décorer
  trois messages d'erreur de démarrage.
- `src-tauri/src/sidecar.rs:451-453` — `read_startup_line(stdout, ...)` prend
  `stdout` **par valeur** ; le tube est droppé après la première ligne, les
  `console.log` suivants du sidecar écrivent dans un tube fermé.
- Modèle À SUIVRE, déjà dans le repo : `src-tauri/src/remote_gateway.rs:279-285`
  redirige le stderr du gateway vers
  `~/Library/Application Support/atelier-studio/remote/gateway.log` (append).
  ATTENTION : le plan 062 impose `mode(0o600)` sur ce fichier — fais pareil ici
  dès la création (exemple de permissions 0600 :
  `rust/crates/atelier-runtime/src/instance.rs:190-194`).
- Répertoire de données canonique : `~/Library/Application Support/atelier-studio`
  (`rust/crates/atelier-runtime/src/paths.rs:17`). Les logs iront dans un
  sous-dossier `logs/`.
- Rédaction de données sensibles : `sidecar/sanitize.mjs` exporte
  `redactSensitiveText`, déjà importé par `sidecar/harness_journal.mjs:6`.
- `src/components/Settings.tsx` — panneau Réglages ; aucune entrée
  « diagnostic » (grep `diagnostic|export.*log` : 0 résultat). Les requêtes vers
  le backend passent par le WS (`ws_router.rs`) ; exemple de handler simple à
  imiter : `handle_setup_status` (`rust/crates/atelier-runtime/src/ws_router.rs:2381`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck front | `npx tsc --noEmit` | exit 0 (ignorer src/test_auto_review*) |
| Build front | `npx vite build` | exit 0 |
| Tests Rust | `cd rust && cargo test -p atelier-runtime` | tous verts |
| Build Rust app | `cd src-tauri && cargo check` | exit 0 |
| Tests sidecar | `cd sidecar && npx vitest run` | tous verts |

## Scope

**In scope** :
- `src-tauri/src/sidecar.rs` (redirection stderr → fichier, drain stdout)
- `src-tauri/src/lib.rs` (init `tracing_subscriber` minimal)
- `rust/crates/atelier-runtime/src/ws_router.rs` (handler `diagnosticExport`)
- `src/components/Settings.tsx` (+ clés i18n dans `src/lib/i18n.ts`) — bouton
  « Exporter le diagnostic »
- Nouveau : `rust/crates/atelier-runtime/src/diagnostic.rs`

**Out of scope** :
- `sidecar/harness_journal.mjs` — journal de conversations, données utilisateur
  sensibles : ne JAMAIS l'inclure dans l'export.
- La migration des 25 `eprintln!` vers `tracing` (suivi ultérieur, pas ce plan).
- `remote_gateway.rs` — traité par le plan 062 ; ne pas y toucher ici.

## Git workflow

- Branch: `advisor/059-canal-diagnostic`
- Commits par étape, style repo : `feat(diagnostic): …` / `fix(sidecar): …`
  (voir `git log --oneline -10`). Ne pas pusher.

## Steps

### Step 1: rediriger le stderr du sidecar vers un fichier tournant

Dans `sidecar.rs`, en plus du tampon mémoire existant (le garder : il décore
les erreurs de démarrage), écrire chaque ligne dans
`app_dir/logs/sidecar.log`, créé avec `mode(0o600)`, avec rotation simple :
si le fichier dépasse 5 Mo au démarrage, le renommer `sidecar.log.1`
(écraser l'ancien `.1`). Préfixer chaque ligne d'un horodatage RFC3339.

**Verify**: lancer l'app buildée, puis
`wc -l ~/Library/Application\ Support/atelier-studio/logs/sidecar.log` → > 0 ;
`stat -f "%Lp" …/sidecar.log` → `600`.

### Step 2: drainer stdout après la ligne de démarrage

`read_startup_line` ne doit plus consommer/dropper le tube : après la première
ligne, spawner un thread qui continue de lire stdout et l'écrit dans le même
fichier de log (préfixe `[out]`).

**Verify**: `cd src-tauri && cargo check` → exit 0 ; après relance, un
`console.log` tardif du sidecar (ex. log d'auto-commit) apparaît dans le fichier.

### Step 3: initialiser tracing dans src-tauri

Dans `lib.rs`, avant le builder Tauri :
`tracing_subscriber::fmt().with_env_filter(EnvFilter::from_default_env().add_directive("info".parse().unwrap())).init();`
(les crates déclarent déjà `tracing-subscriber` avec `env-filter` —
`rust/Cargo.toml:37-38` ; ajouter la dépendance à `src-tauri/Cargo.toml` si absente).

**Verify**: `cargo check` exit 0 ; `ATELIER_LOG=debug` au lancement produit des
lignes `tracing` sur stderr de l'app.

### Step 4: handler `diagnosticExport` côté runtime

Nouveau module `diagnostic.rs` : fonction qui assemble un zip en mémoire
contenant `logs/sidecar.log` (dernier Mo), `boot_metrics` (voir
`src-tauri/src/boot_metrics.rs:109-113` pour le chemin), la sortie de
`handle_setup_status`, et la version app. AUCUN contenu de
`harness_journal`, aucun fichier de `api_providers.json`. Passer chaque texte
par une rédaction équivalente à `redactSensitiveText` (porter la liste de
motifs de `sidecar/sanitize.mjs` en Rust — motifs `sk-…`, `Bearer …`, chemins
home → `~`). Exposer dans `ws_router.rs` sous le type `diagnosticExport`,
répondre `{ok, path}` après écriture dans `~/Downloads/atelier-diagnostic-<date>.zip`.

**Verify**: `cargo test -p atelier-runtime` — ajouter un test unitaire : la
rédaction remplace un faux `sk-abc123…` par `[redacted]` ; le zip ne contient
pas `harness` dans ses noms d'entrées.

### Step 5: bouton dans Réglages

Dans `Settings.tsx`, section « À propos »/diagnostic : bouton `t("settings.export-diagnostic")`
(ajouter les clés FR « Exporter le diagnostic » / EN « Export diagnostics » dans
`src/lib/i18n.ts`, les DEUX dictionnaires — parité obligatoire), qui envoie
`{type:"diagnosticExport"}` sur le WS et affiche le chemin retourné via le
toast existant (`showSuccess`).

**Verify**: `npx tsc --noEmit` exit 0 ; test UI existant de Settings toujours
vert (`npx vitest run src/App.settings-crash.test.tsx`).

## Test plan

- Rust : test de rédaction (step 4) + test « le zip exclut harness_journal ».
- Sidecar : aucun changement de code sidecar — suite complète en garde-fou.
- Manuel : app buildée → Réglages → Exporter → ouvrir le zip, vérifier qu'il
  contient sidecar.log/boot_metrics/setup et rien de sensible.

## Done criteria

- [ ] `logs/sidecar.log` existe, 0600, alimenté après le boot (stdout inclus)
- [ ] `cargo test -p atelier-runtime` vert, tests de rédaction inclus
- [ ] Bouton Réglages produit un zip dans ~/Downloads
- [ ] `npx tsc --noEmit` et `npx vite build` verts ; vitest sidecar vert
- [ ] Aucun fichier hors scope modifié (`git status`)
- [ ] Ligne de statut mise à jour dans `plans/README.md`

## STOP conditions

- Les excerpts de `sidecar.rs` ne correspondent plus (drift).
- L'écriture du log ralentit le boot mesuré (`boot_metrics`) de > 50 ms.
- Impossible d'écrire le zip sans embarquer de données de conversation :
  s'arrêter et signaler plutôt que d'élargir le contenu.

## Maintenance notes

- Toute nouvelle famille d'erreurs (futurs correctifs SILENT-01…10) doit écrire
  dans ce canal — c'est le point d'accumulation.
- Si un jour une télémétrie opt-in est ajoutée, elle se branche ici, jamais
  l'inverse.
