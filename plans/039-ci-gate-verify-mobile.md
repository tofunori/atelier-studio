# Plan 039 : Faire tourner `verify:mobile` en CI — le mobile est staged mais jamais vérifié

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 12e1a04..HEAD -- .github/workflows/ci.yml package.json mobile/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `12e1a04`, 2026-07-16

## Why this matters

L'app iOS companion (`mobile/`) a 101 tests vitest, un typecheck TS, un build de prod et un scan de secrets (`mobile:check-secrets`), tous regroupés dans la commande unique `npm run verify:mobile` — mais **aucun workflow CI ne l'exécute**. Aujourd'hui un typecheck cassé, un test rouge ou un token commité dans `mobile/` merge sur `main` avec un check vert. La porte existe déjà ; il suffit de la brancher. C'est aussi le prérequis de fiabilité des plans 040–043 (qui s'appuient sur `mobile:test` comme gate).

## Current state

- `.github/workflows/ci.yml` — le seul workflow CI. Il stage les ressources mobile mais ne vérifie jamais `mobile/` :

```yaml
# .github/workflows/ci.yml:43-52
      - name: Stage bundled resources for Tauri checks
        run: |
          bash scripts/stage-node-runtime.sh
          bash scripts/stage-sidecar.sh
          bash scripts/stage-gallery.sh
          bash scripts/stage-mobile.sh
      - name: Backend policy (Rust default, soak gates)
        run: npm run check:backend-policy
      - name: Verify (typecheck, build, frontend, sidecar, gallery, Rust)
        run: npm run verify
```

- `npm run verify` (racine `package.json`) = pipeline desktop uniquement : `typecheck && build:web && check_entry_budget && test:frontend && test:sidecar && test:gallery && test:rust && test:protocol && test:rust-workspace && check:backend-policy`. Aucune étape `mobile:*`.
- La porte mobile existe déjà dans `package.json` racine :

```json
"verify:mobile": "npm run test:protocol && npm run test:remote && npm run mobile:typecheck && npm run mobile:test && npm run mobile:build && npm run mobile:check-secrets"
```

  avec `mobile:typecheck` → `npm --prefix mobile run typecheck`, `mobile:test` → `npm --prefix mobile test`, `mobile:build` → `npm --prefix mobile run build`, `mobile:check-secrets` → `node scripts/check-mobile-secrets.mjs` (le script existe : `scripts/check-mobile-secrets.mjs`).
- La CI n'installe **pas** les deps de `mobile/` (`npm --prefix mobile ci` absent) et `mobile/package-lock.json` n'est pas dans `cache-dependency-path` (`ci.yml:23-27`).
- Duplication assumée : `test:protocol` tourne déjà dans `npm run verify`, et `test:remote` (`cargo test -p atelier-remote`) est un sous-ensemble de `test:rust-workspace`. On garde quand même `verify:mobile` tel quel en CI — une seule commande source de vérité (celle documentée dans `docs/mobile/STATUS_FINAL.md`) vaut mieux que 2-3 minutes gagnées.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install mobile deps | `npm --prefix mobile ci` | exit 0 |
| Porte mobile complète | `npm run verify:mobile` | exit 0 (101 tests verts, build OK, secrets OK) |
| Lint YAML (si dispo) | `npx --yes yaml-lint .github/workflows/ci.yml` ou inspection manuelle | pas d'erreur de syntaxe |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/ci.yml`

**Out of scope** (do NOT touch, even though they look related):
- `package.json` racine et `mobile/package.json` — les scripts existent déjà et sont corrects.
- `scripts/stage-mobile.sh`, `scripts/check-mobile-secrets.mjs` — ne pas les modifier.
- Tout autre workflow (`react-doctor.yml`, etc.).

## Git workflow

- Branche : `advisor/039-ci-gate-verify-mobile`
- Un commit unique, message style repo (ex. `ci: exécuter verify:mobile dans le workflow ci`).
- Ne pas pusher ni ouvrir de PR sans instruction de l'opérateur.

## Steps

### Step 1 : Ajouter le lockfile mobile au cache npm

Dans `.github/workflows/ci.yml`, étendre `cache-dependency-path` du step `actions/setup-node@v4` (lignes 19-27) :

```yaml
          cache-dependency-path: |
            package-lock.json
            sidecar/package-lock.json
            gallery/package-lock.json
            packages/atelier-protocol/package-lock.json
            mobile/package-lock.json
```

**Verify**: `grep -n "mobile/package-lock.json" .github/workflows/ci.yml` → une ligne trouvée.

### Step 2 : Installer les deps mobile

Ajouter juste après le step `Install shared protocol deps` (ligne 39-40) :

```yaml
      - name: Install mobile deps
        run: npm --prefix mobile ci
```

**Verify**: `grep -n "npm --prefix mobile ci" .github/workflows/ci.yml` → une ligne trouvée.

### Step 3 : Ajouter le step de vérification mobile

Ajouter après le step `Verify (typecheck, build, frontend, sidecar, gallery, Rust)` (et avant `Gallery E2E`) :

```yaml
      - name: Verify mobile (typecheck, tests, build, secrets)
        run: npm run verify:mobile
```

**Verify**: `grep -n "verify:mobile" .github/workflows/ci.yml` → une ligne trouvée.

### Step 4 : Rejouer la porte localement

Exécuter exactement ce que la CI exécutera :

```bash
npm --prefix mobile ci
npm run verify:mobile
```

**Verify**: exit 0 ; la sortie montre les tests mobile verts (~101 passed), `vite build` OK et le scan secrets OK.

## Test plan

Pas de nouveau test : ce plan branche une suite existante. La vérification est le Step 4 (exécution locale complète de `verify:mobile`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "verify:mobile" .github/workflows/ci.yml` ≥ 1
- [ ] `grep -c "npm --prefix mobile ci" .github/workflows/ci.yml` ≥ 1
- [ ] `npm run verify:mobile` exit 0 en local
- [ ] `git status` ne montre que `.github/workflows/ci.yml` modifié
- [ ] Ligne de statut mise à jour dans `plans/README.md`

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run verify:mobile` échoue localement **avant** toute modification (le problème est dans le code mobile, pas dans la CI — ce plan ne corrige pas le code).
- `npm --prefix mobile ci` échoue (lockfile désynchronisé — à signaler, pas à régénérer).
- La structure de `ci.yml` ne correspond plus aux extraits (drift).

## Maintenance notes

- Quand un futur plan ajoute des tests natifs Rust dans `mobile/src-tauri`, les brancher dans `verify:mobile` (et donc automatiquement en CI).
- Reviewer : vérifier que le step mobile tourne bien **après** l'installation de ses deps et n'introduit pas de cache manquant (temps CI +3-5 min attendu, dont la duplication assumée test:protocol/test:remote).
- Suivi différé : dédupliquer `test:protocol`/`test:remote` entre `verify` et `verify:mobile` si le temps CI devient un problème.
