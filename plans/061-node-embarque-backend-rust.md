# Plan 061: Brancher le backend Rust sur le Node embarqué (KB fonctionnelle sur Mac vierge)

> **Executor instructions**: Follow this plan step by step, verify each step.
> On a STOP condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 49c52384..HEAD -- src-tauri/src/sidecar.rs src-tauri/src/bin_resolver.rs rust/crates/atelier-runtime/src/ws_router.rs sidecar/atelier-kb sidecar/atelier-zotero-passages sidecar/atelier-gallery-tool scripts/stage-rust-server.sh README.md docs/distribution-decision.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / portabilité
- **Planned at**: commit `49c52384`, 2026-08-15

## Why this matters

Findings PORTA-01/-02/-04. La décision de distribution (2026-07-11) a embarqué
Node 22 précisément pour que « End users do not need to install Node »
(README:106). Mais le backend Rust, devenu défaut le 2026-07-16, ne connaît pas
ce runtime : sur un Mac sans Node, TOUTE la base de connaissances échoue
(« node introuvable pour atelier-kb »), et les wrappers `atelier-kb` /
`atelier-zotero-passages` que le prompt système ordonne aux agents d'appeler
meurent en `node: command not found` — l'agent improvise alors au lieu de citer,
exactement ce que le prompt interdit. Trois petits raccords referment la dérive.

## Current state

- `rust/crates/atelier-runtime/src/ws_router.rs:1619-1641` — `kb_node_bin()` :
  `ATELIER_TEST_NODE` → `which node` → `/opt/homebrew/bin/node` →
  `/usr/local/bin/node`. **Aucune mention du runtime embarqué** (vérifié :
  0 occurrence de `ATELIER_NODE_BIN` dans le fichier).
- Utilisé par `kb_cli_run`/`kb_cli_stream` (lignes 1656, 1704, 1852, 1885,
  1915, 1992, 2132, 2155, 2184, 2315, 2326) — toute la KB passe par là.
- `src-tauri/src/bin_resolver.rs:59-92` — `node_bin()` côté Tauri fait le bon
  choix (embarqué d'abord, PATH seulement en debug) : c'est LA source du chemin.
- `src-tauri/src/sidecar.rs:430-437` — spawn du serveur Rust avec
  `ATELIER_TOKEN`, `ATELIER_APP_VERSION`, `ATELIER_BUNDLE_HASH` ; pas de chemin
  Node transmis.
- `sidecar/atelier-kb` (2 lignes) :
  ```sh
  #!/bin/sh
  exec node "$(dirname "$0")/kb_cli.mjs" "$@"
  ```
  `sidecar/atelier-zotero-passages` : idem. Le troisième wrapper,
  `sidecar/atelier-gallery-tool:4-9`, contient déjà le bon motif :
  ```sh
  NODE="$HERE/../node-runtime/bin/node"   # si exécutable
  … else NODE="${ATELIER_NODE_BIN:-node}"
  exec "$NODE" "$HERE/gallery_tool_cli.mjs" "$@"
  ```
- Ces wrappers sont injectés en chemin absolu dans le prompt système :
  `rust/crates/atelier-runtime/src/kb_block.rs:280`,
  `rust/crates/atelier-runtime/src/send.rs:47-49`.
- `README.md:106` — « End users do not need to install Node or Python » ;
  `docs/distribution-decision.md:14-18` — option « Node système » explicitement
  rejetée. La doc est correcte UNE FOIS ce plan exécuté.
- Staging : `scripts/stage-rust-server.sh` copie wrappers et `.mjs` dans
  `src-tauri/rust-server-dist/`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests Rust | `cd rust && cargo test -p atelier-runtime` | verts |
| Check Tauri | `cd src-tauri && cargo check` | exit 0 |
| Vitest sidecar | `cd sidecar && npx vitest run` | verts |
| Smoke sans PATH | voir Step 4 | KB répond |

## Scope

**In scope** : `src-tauri/src/sidecar.rs`, `rust/crates/atelier-runtime/src/ws_router.rs`,
`sidecar/atelier-kb`, `sidecar/atelier-zotero-passages`,
`scripts/stage-rust-server.sh` (garde anti-régression), `README.md` (une ligne
pdftotext, cf. Step 5).

**Out of scope** :
- `sidecar/atelier-gallery-tool` — déjà correct, ne pas y toucher.
- `bin_resolver.rs` — sa logique est bonne ; on la CONSOMME.
- Embarquer poppler (hors périmètre, voir plan 060/PORTA-03).

## Git workflow

- Branch: `advisor/061-node-embarque` ; commits `fix(kb): …`.

## Steps

### Step 1: transmettre le chemin du Node embarqué au serveur Rust

Dans `sidecar.rs`, au spawn des backends, ajouter
`.env("ATELIER_NODE_BIN", bin_resolver::node_bin(...))` (le chemin est déjà
calculé pour le sidecar Node ; réutiliser la même valeur).

**Verify**: `cargo check` exit 0 ; lancer l'app, `ps eww <pid serveur rust>`
montre `ATELIER_NODE_BIN=…/node-runtime/bin/node`.

### Step 2: `kb_node_bin()` préfère `ATELIER_NODE_BIN`

En tête de cascade : si `ATELIER_NODE_BIN` est posé ET exécutable → le
retourner. Garder le reste de la cascade intact (dev sans bundle).

**Verify**: nouveau test Rust : avec `ATELIER_NODE_BIN` pointant un faux
exécutable, `kb_node_bin()` le retourne ; sans la variable, comportement
inchangé.

### Step 3: aligner les deux wrappers nus

Copier le bloc de résolution de `atelier-gallery-tool` (6 lignes) dans
`atelier-kb` et `atelier-zotero-passages`, en adaptant le nom du script cible.
Dans `stage-rust-server.sh`, ajouter un contrôle qui échoue si un wrapper stagé
contient `exec node ` nu :
`grep -l '^exec node ' "$DIST"/atelier-* && { echo "wrapper nu"; exit 1; }`.

**Verify**: `bash -n sidecar/atelier-kb` ; `PATH=/usr/bin sidecar/atelier-kb --help`
répond depuis le repo (via ATELIER_NODE_BIN exporté à la main) ; le staging
passe et le contrôle attrape un wrapper volontairement cassé (test manuel).

### Step 4: smoke « Mac vierge simulé »

App buildée, lancée avec un PATH minimal :
`env -i HOME="$HOME" PATH=/usr/bin:/bin open -n .../Atelier.app` n'est pas
fiable (open réutilise l'env de launchd) — à la place, renommer temporairement
`node` de Homebrew (`brew unlink node` ou `sudo mv` — demander à l'opérateur si
non-root) puis : épingler une source KB et lancer une recherche de passage.

**Verify**: la KB répond ; `logs`/console sans « node introuvable ».

### Step 5: refermer la doc

`README.md` : la promesse « no Node » redevient vraie — ne changer QUE la
section Requirements pour ajouter `pdftotext (poppler)` comme dépendance des
fonctions PDF (état réel, cf. PORTA-03), et corriger le nom de DMG versionné
s'il est encore « 1.3.6 » (cf. plan 064 qui traite le README en entier — si le
plan 064 est déjà DONE, sauter cette partie).

**Verify**: relecture ; aucun autre paragraphe modifié.

## Test plan

- Rust : test `kb_node_bin` (step 2).
- Garde staging (step 3).
- Smoke manuel step 4 — c'est le test d'acceptation que le plan 013 listait
  (« essai sans Node ») et qui n'a jamais été fait.

## Done criteria

- [ ] `kb_node_bin()` retourne le Node embarqué dans l'app bundlée
- [ ] Les trois wrappers résolvent node-runtime puis ATELIER_NODE_BIN
- [ ] Garde anti « exec node nu » dans le staging
- [ ] KB fonctionnelle sans Node système (smoke step 4)
- [ ] cargo test + vitest sidecar verts ; `plans/README.md` à jour

## STOP conditions

- Drift sur les excerpts.
- `bin_resolver::node_bin` n'est pas accessible depuis `sidecar.rs` sans cycle
  de dépendance : signaler l'architecture plutôt que dupliquer la logique.

## Maintenance notes

- Tout nouveau `.mjs` invoqué par le Rust doit passer par `kb_node_bin()` —
  jamais `Command::new("node")` nu.
- Le badge `bundled` de Réglages (plan 060) reflète désormais la réalité.
