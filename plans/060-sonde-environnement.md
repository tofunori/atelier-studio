# Plan 060: Faire dire à l'app ce qui manque sur la machine (sonde d'environnement)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On a
> STOP condition, stop and report. When done, update `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 49c52384..HEAD -- rust/crates/atelier-runtime/src/ws_router.rs rust/crates/atelier-gallery/src/documents.rs gallery/src/studio/features/latex/compile.ts src/components/Settings.tsx`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (synergie avec 059 ; exécutable avant ou après)
- **Category**: dx / portabilité
- **Planned at**: commit `49c52384`, 2026-08-15

## Why this matters

Findings PORTA-05/-13/-12/-03/-06 : sur un Mac neuf, chaque dépendance absente
(TeX, pdftotext, Node, CLT, CLI claude) se découvre à l'usage, par un échec
opaque — « échec — voir la console » quand MacTeX manque, un provider
définitivement absent tant que l'app n'est pas relancée, un badge « system »
figé qui ne décrit rien. Le mécanisme de sonde existe déjà pour les providers ;
ce plan l'étend à l'environnement et fait remonter les messages actionnables.

## Current state

- `rust/crates/atelier-runtime/src/ws_router.rs:2381-2440` — `handle_setup_status` :
  sonde par provider de qualité (`not_installed`/`login_needed`/`shadowed`…).
- `ws_router.rs:2431-2435` — bloc `runtime` FIGÉ :
  `{"node":"rust","version":CARGO_PKG_VERSION,"bundled":false}` — aucun probe.
- `rust/crates/atelier-runtime/src/state.rs:110` — `build_registry` appelé une
  seule fois ; un CLI installé après le boot n'apparaît qu'au redémarrage
  (`registry.rs:148-165`, `claude.rs:33-38`).
- Résolveurs réutilisables existants : `kb_node_bin()` (`ws_router.rs:1619-1641`),
  `latexmk`/`synctex`/`tectonic` (`rust/crates/atelier-gallery/src/documents.rs:41-58`),
  `zotero_available` (`rust/crates/atelier-workspace/src/zotero.rs`),
  `gbrain_bin()` (`ws_router.rs:1756-1785`).
- `rust/crates/atelier-gallery/src/documents.rs:210-216` — toolchain TeX absente
  → HTTP 200 `{ok:false, error:"latexmk not found …"}` SANS champ `log` ni `reason`.
- `gallery/src/studio/features/latex/compile.ts:51-73` — `analyzeCompileResponse`
  compte les erreurs par motifs TeX (`/^!|Fatal error|…/`) ; « latexmk not
  found » ne matche pas → `errors=0` → `compile.ts:152-154` affiche le libellé
  générique « échec — voir la console ».
- `src/components/Settings.tsx:618-623` — badge runtime `bundled ? ok : warn`,
  perpétuellement « system » à cause du bloc figé.
- `sidecar/zotero_passages.mjs:174-199` — `pdftotext` spawné sans détection ;
  seul moteur d'extraction PDF du produit (aucun équivalent Rust).
- i18n : toutes les chaînes UI passent par `t()` (`src/lib/i18n.ts`, dicts fr
  ET en, parité obligatoire).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests Rust runtime | `cd rust && cargo test -p atelier-runtime` | verts |
| Tests Rust gallery | `cd rust && cargo test -p atelier-gallery` | verts |
| Typecheck studio | `cd gallery && npm run typecheck:studio` | exit 0 |
| Build studio | `cd gallery && npm run build:cm6` | exit 0 |
| Suite diff (obligatoire si gallery/ touché) | `node gallery/server/tests/diff_suite.mjs` | ok (183+) |
| Typecheck front | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** :
- `rust/crates/atelier-runtime/src/ws_router.rs` (probe environnement +
  re-probe providers dans `handle_setup_status`)
- `rust/crates/atelier-gallery/src/documents.rs` (champ `reason`)
- `gallery/src/studio/features/latex/compile.ts` (cas `toolchain-missing`)
- `gallery/server/routes/editors.mjs` (même champ `reason`, parité Node)
- `src/components/Settings.tsx`, `src/lib/i18n.ts` (section Environnement)

**Out of scope** :
- Embarquer poppler ou réécrire l'extraction PDF en Rust (décision produit).
- `bin_resolver.rs` / spawn env — c'est le plan 061.
- La suppression du badge « system » sans le remplacer.

## Git workflow

- Branch: `advisor/060-sonde-environnement` ; commits `feat(setup): …`.

## Steps

### Step 1: `probe_environment()` dans ws_router.rs

Fonction qui retourne un JSON `environment` : pour chacun de `node`,
`pdftotext`, `latexmk`, `synctex`, `tectonic`, `git` (via `xcode-select -p`
d'abord), `zotero`, `gbrain` → `{found: bool, path: Option<String>, hint: &str}`
(hint = phrase d'installation, ex. « brew install poppler »). Réutiliser les
résolveurs existants listés plus haut — ne pas dupliquer leurs listes de
chemins. Chaque probe avec timeout court (500 ms) et mise en cache 30 s.
Intégrer au payload de `handle_setup_status`, remplacer le `"bundled": false`
figé par la vraie détection (le runtime embarqué existe si
`ATELIER_NODE_BIN`/chemin bundle résout — voir plan 061 ; en attendant,
`bundled = kb_node_bin() porte "node-runtime"`).

**Verify**: `cargo test -p atelier-runtime` + nouveau test : payload contient
`environment.pdftotext.hint` non vide quand le binaire est introuvable
(simuler avec PATH vide + env override).

### Step 2: re-sonder les providers absents à chaque `setupStatus`

Dans `handle_setup_status`, pour tout provider absent du registre, retenter
`X::new()` et l'insérer si la résolution réussit — n'ajouter que les manquants,
ne jamais remplacer un provider existant (runs en cours).

**Verify**: test Rust : registre construit avec PATH vide → 0 provider ; après
injection de `ATELIER_CLAUDE_BIN` valide, `setup_status` en expose 1.

### Step 3: `reason: "toolchain-missing"` sur /compile

`documents.rs:210-216` : ajouter `"reason": "toolchain-missing"` au JSON (statut
HTTP inchangé). Même ajout dans `gallery/server/routes/editors.mjs` (branche
ENOENT existante, `~:988-990`). Dans `compile.ts`, si `response.reason ===
"toolchain-missing"` → pastille affiche directement `response.error` (pas le
libellé générique).

**Verify**: `cargo test -p atelier-gallery` ; `npm run typecheck:studio` ;
`node gallery/server/tests/diff_suite.mjs` ok ; test unitaire ajouté dans la
suite du studio ou en e2e : mock `/compile` → `{ok:false,reason:"toolchain-missing",error:"X"}`
→ la pastille contient « X ».

### Step 4: section « Environnement » dans Réglages

Sous la sonde providers existante : liste des dépendances avec état
(✓ chemin / ✗ hint), clés i18n `settings.env-*` (fr+en). Bouton « Revérifier »
qui redemande `setupStatus` (le re-probe du step 2 rend le bouton utile après
installation d'un CLI, sans redémarrage).

**Verify**: `npx tsc --noEmit` ; `npx vitest run src/App.settings-crash.test.tsx` vert.

## Test plan

- Rust : 2 tests (probe hint, re-probe provider).
- Studio : 1 test toolchain-missing.
- Manuel : `PATH=/usr/bin` au lancement → Réglages liste les manquants avec
  hints ; bouton compile → message MacTeX directement visible.

## Done criteria

- [ ] `setupStatus` expose `environment` avec found/path/hint pour 8 dépendances
- [ ] Provider installé post-boot apparaît après « Revérifier » sans relance
- [ ] TeX absent → la pastille de compilation affiche « install MacTeX… »
- [ ] Toutes suites vertes (cargo ×2, typecheck ×2, diff_suite, vitest settings)
- [ ] i18n fr/en en parité pour toutes les nouvelles clés
- [ ] `plans/README.md` mis à jour

## STOP conditions

- Drift sur les excerpts ; ou la sonde ralentit `setupStatus` > 1 s à froid.
- `handle_setup_status` s'avère appelé sur un chemin chaud (par tour de chat) :
  signaler avant d'ajouter les probes.

## Maintenance notes

- Toute nouvelle dépendance externe DOIT s'ajouter à `probe_environment()` —
  c'est désormais le contrat (à noter dans docs/PIEGES_CONNUS.md côté équipe).
- Le plan 061 branchera `bundled` sur le vrai chemin embarqué ; garder le champ.
