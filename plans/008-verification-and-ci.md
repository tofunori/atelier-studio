# Plan 008: Créer une validation unique et une CI de pull request

> **Executor instructions**: charger `/efficient-fable`. Ce plan ne corrige pas
> les tests: 004–007 doivent être verts. Ajouter des commandes déterministes,
> puis les faire exécuter par CI et release.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- package.json package-lock.json gallery/package.json gallery/package-lock.json .github/workflows/release.yml .github/workflows/ci.yml vite.config.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans 004–007
- **Category**: tests / DX
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

La release tag/manual construit sans exécuter explicitement toutes les suites.
Le package racine n'a ni test ni verify; Playwright est déclaré dans gallery
mais absent de l'installation auditée. Une commande unique doit devenir le
contrat de merge/release.

## Target command matrix

Scripts racine:

- `typecheck`: `tsc --noEmit`
- `test:frontend`: Vitest racine
- `test:sidecar`: `npm --prefix sidecar test`
- `test:gallery:unit`: unittest Python
- `test:gallery:parity`: parity Node
- `test:gallery:diff`: diff suite
- `test:gallery`: composition des trois
- `test:rust`: cargo test manifest Tauri locked
- `build:web`: vite build
- `verify`: typecheck + build + frontend + sidecar + gallery + Rust
- `verify:e2e`: Playwright galerie

Pas de `|| true`, pas de résultat caché.

## Scope

**In scope**: package/lock racine, config/tests frontend minimum,
gallery lock si requis, nouveau `ci.yml`, release workflow, README Verification.

**Out of scope**: correction métier test rouge, format global, publication,
upgrade framework majeur.

## Steps

### 1. Runner frontend minimal

Ajouter Vitest, jsdom, Testing Library React/jest-dom. Créer setup jsdom et un
test smoke d'un helper pur `src/lib/ipc.ts`; jamais une suite verte à zéro test.

### 2. Scripts et exécution locale

Lancer chaque commande seule puis `npm run verify`. Mesurer durée. Ne pas
paralléliser suites à serveurs/ports avant preuve d'isolation.

### 3. CI PR/push macOS

Étapes: checkout, Node 22 cache npm, Rust stable + cache, Python, npm ci racine,
sidecar et gallery, install Chromium Playwright, verify, verify:e2e, upload
test-results seulement en échec. Ajouter concurrency annulant ancien run branche.

### 4. Durcir release

Installer deps gallery et exécuter verify avant tauri-action. E2E aussi si le tag
peut contourner CI. Bundle ne court jamais après verify rouge.

### 5. Docs vraies

README: commande unique, E2E, prérequis. Supprimer phrase normalisant typecheck
rouge; déplacer/exclure proprement les fixtures invalides.

## Done criteria

- [ ] `npm run verify` couvre six couches et sort 0.
- [ ] verify:e2e trouve Playwright et passe.
- [ ] CI sur PR/push.
- [ ] Release dépend de verify vert.
- [ ] Test frontend réel existe.
- [ ] README exact.
- [ ] Protocole Tauri final passe.

## STOP conditions

- Suite exige credentials/réseau live.
- Playwright touche données utilisateur.
- Typecheck ne passe qu'en ignorant production.
- CI exige secret non documenté.

## Maintenance notes

Tout nouveau sous-système rejoint verify avec test déterministe. Les tests
réseau/live restent opt-in.
