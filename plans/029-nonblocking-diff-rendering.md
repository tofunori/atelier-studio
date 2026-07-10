# Plan 029: Empêcher les gros diffs de bloquer l'éditeur

> **Instructions exécuteur** : préserver le rendu et l'unité d'intervention des
> plans 026-028. Optimiser après mesure, jamais en affaiblissant les résultats.
>
> **Drift check** :
> `git diff --stat 9f7341e..HEAD -- gallery/assets/diff_versions.js gallery/assets/diff_worker.js gallery/server/tests/diff_suite.mjs gallery/tests/e2e/diff.spec.js scripts/stage-gallery.sh`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/028-diff-restore-and-durability.md`
- **Category**: perf
- **Planned at**: commit `9f7341e`, 2026-07-10

## Why this matters

`Diff.diffWordsWithSpace` s'exécute actuellement sur le thread UI. Une petite
insertion dans 1 Mo est rapide, mais une réécriture quasi complète de 20 Ko a
pris environ 4,7 s pendant l'audit. Les gros passages d'agent sont donc le pire
cas réel et peuvent donner l'impression que `tout` ne fonctionne pas.

**Dependency gate** : ne commencer que si l'index marque 028
`DONE (accepted <sha>)` et si ce sha est ancêtre de HEAD. Sinon STOP.

## Current state

- `gallery/assets/diff_versions.js:114-221` calcule et rend synchroniquement.
- `gallery/assets/diff_versions.js:640-741` recalcule la gouttière après frappe.
- `gallery/assets/diff.min.js` est un bundle jsdiff classique disponible dans
  les assets galerie.
- `scripts/stage-gallery.sh` copie tout `gallery/` dans le bundle Tauri.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Diff | `node gallery/server/tests/diff_suite.mjs` | tous verts |
| Browser | `npx playwright test gallery/tests/e2e/diff.spec.js` | tous verts |
| Parity | `(cd gallery && node server/tests/parity.mjs)` | `parity: ok` |
| Stage check | `bash scripts/stage-gallery.sh && cmp gallery/assets/diff_worker.js src-tauri/gallery-dist/assets/diff_worker.js` | exit 0 |
| Benchmark | `node gallery/server/tests/diff_bench.mjs` | JSON avec `heartbeatMaxGapMs < 250` et `completedMs < 15000` |

## Scope

**In scope**:
- `gallery/assets/diff_versions.js`
- `gallery/assets/diff_worker.js` (créer)
- `gallery/server/tests/diff_suite.mjs`
- `gallery/server/tests/diff_bench.mjs` (créer)
- `gallery/tests/e2e/diff.spec.js`
- `scripts/stage-gallery.sh` seulement si nécessaire pour inclure le Worker

**Out of scope**:
- Changer l'algorithme sémantique ou le regroupement visuel.
- CM6.
- Dépendance réseau/CDN.

## Steps

### Step 1: Ajouter un benchmark déterministe

Créer `diff_bench.mjs` avec petits cas de correction et réécriture de 20 Ko.
Le navigateur lance un heartbeat toutes les 50 ms pendant le calcul; le plus
grand intervalle observé doit rester sous 250 ms et le résultat doit arriver
en moins de 15 s. Imprimer un JSON stable avec les deux mesures.

**Verify**: commande documentée imprime les temps pour insertion et réécriture.

### Step 2: Déporter le calcul dans un Worker annulable

Worker same-origin charge jsdiff localement, reçoit `{requestId,before,after}`
et renvoie les parts. Chaque nouvelle demande invalide la précédente. Le DOM,
les marqueurs CodeMirror et la navigation restent sur le thread principal.
Utiliser le Worker pour tous les calculs quand disponible. Sans Worker,
autoriser le fallback mot-à-mot uniquement si
`before.length + after.length <= 50000`; au-delà, utiliser un diff
ligne-à-ligne non bloquant par tranches et afficher exactement
`diff détaillé indisponible — affichage par lignes`.

**Verify**: test avec deux requêtes inversées n'applique que la plus récente.

### Step 3: Séparer diff ligne puis raffinement mot

Pour les grosses réécritures, localiser d'abord les blocs avec `diffLines`,
puis exécuter `diffWordsWithSpace` seulement dans les blocs modifiés. Conserver
les mêmes positions finales et les mêmes zones sémantiques sur les fixtures
existantes.

**Verify**: snapshots structurés des parts identiques sur les cas actuels ;
cas 20 Ko termine sans bloquer le heartbeat navigateur.

### Step 4: Éviter les recalculs redondants

Débouncer par paire de hash base/current, annuler au changement de vue, ne pas
recalculer la gouttière pendant voyage temporel, et mettre en cache le dernier
résultat valide.

**Verify**: instrumentation de test prouve un calcul pour plusieurs appels
identiques.

## Test plan

- Résultat Worker identique aux fixtures synchrones existantes.
- Deux générations hors ordre : seule la dernière est appliquée.
- Réécriture 20 Ko : heartbeat max <250 ms, résultat <15 s.
- Worker indisponible sous/au-dessus de 50 000 caractères.
- Cache par paire base/current et annulation au changement de vue.

## Done criteria

- [ ] Le thread UI répond pendant un gros calcul.
- [ ] Les résultats obsolètes ne sont jamais rendus.
- [ ] Le compteur reste un compteur d'interventions.
- [ ] Worker inclus dans la source, staging et app buildée.
- [ ] Diff suite, E2E et parity passent.

## STOP conditions

- Le Worker exige une ressource distante ou `eval`.
- Le raffinement change les offsets des fixtures existantes.
- Le fallback peut verrouiller l'UI sans avertissement sur le cas mesuré.

## Maintenance notes

Le Worker calcule uniquement des données. Il ne doit jamais connaître CM5 ou
CM6, ce qui rend le plan compatible avec la migration suivante.
