# Plan 032: Retirer CM5 seulement après acceptation de CM6 sur du travail réel

> **Instructions exécuteur** : ce plan contient une approbation humaine
> obligatoire. Sans elle, arrêter avant toute suppression. Aucun agent ne peut
> auto-approuver cette condition.
>
> **Drift check** :
> `git diff --stat 9f7341e..HEAD -- gallery/assets gallery/tests gallery/package.json gallery/package-lock.json scripts/stage-gallery.sh`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: `plans/031-migrate-all-editors-to-cm6.md` + acceptation humaine
- **Category**: migration, tech-debt
- **Planned at**: commit `9f7341e`, 2026-07-10

## Why this matters

Une fois CM6 réellement éprouvé, conserver CM5 double les assets, les branches
et la surface de test. Mais le retirer trop tôt supprime le seul rollback fiable.
La suppression doit donc suivre une période d'utilisation réelle du manuscrit
et une décision explicite de Thierry.

**Dependency gate** : ne commencer que si l'index marque 031
`DONE (accepted <sha>)` et si ce sha est ancêtre de HEAD. Sinon STOP.

## Current state

- `gallery/assets/latex_studio.html:6-52` charge encore les styles, cœur,
  addons et modes CM5 pour permettre le fallback.
- `gallery/assets/code_editor.html:6-17` et `gallery/assets/md_viewer.html:8-12`
  chargent directement les assets CM5 avant le plan 031.
- `gallery/assets/cm/` contient le runtime, les addons, modes et thème CM5.
- Le plan 031 doit avoir rendu CM6 par défaut sur les trois surfaces tout en
  conservant ce fallback pour la période d'observation.

## Human acceptance gate

Avant toute édition, obtenir une confirmation explicite que CM6 a été utilisé
dans l'app buildée sur du travail réel et que sont acceptés : diff `tout`,
restauration, sauvegarde, ghost, compilation, PDF/SyncTeX, annotations, rewrap,
code editor et Markdown. Exiger au minimum trois sessions réelles distinctes,
dont une action agent multi-zone et une restauration. Le réviseur consigne les
trois dates, scénarios et l'accord explicite dans
`plans/032-cm6-acceptance.md`. Sans ce fichier rempli par le réviseur et accord
de Thierry : **STOP**.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Consumer audit | `rg -n "cm/codemirror|cm/mark-selection|cm/(stex|python|r|markdown|julia|shell)\\.min|engine=cm5|defaultEngine.*cm5" gallery/assets/*.html gallery/assets/editor_factory.js` | aucun chargement/fallback CM5 après Step 2 |
| CM6 build | `npm --prefix gallery ci && npm --prefix gallery run build:cm6` | exit 0 |
| Full verify | `npm run verify` | exit 0 |
| Browser | `npm --prefix gallery run test:e2e` | tous verts |

## Scope

**In scope**:
- `gallery/assets/latex_studio.html`
- `gallery/assets/code_editor.html`
- `gallery/assets/md_viewer.html`
- `gallery/assets/cm/` assets CM5 devenus inutilisés
- `gallery/assets/cm6/studio_cm6.bundle.js` seulement comme artefact régénéré
- `gallery/assets/editor_factory.js`
- `gallery/tests/e2e/diff.spec.js`
- `gallery/tests/e2e/editor_cm6.spec.js`
- `gallery/server/tests/studio_editor_contract.test.mjs`
- `gallery/scripts/build-cm6.mjs`
- `gallery/package.json`, `gallery/package-lock.json`

`plans/032-cm6-acceptance.md` est une entrée de gate maintenue par le réviseur,
pas par l'exécuteur.

**Out of scope**:
- Refonte UI.
- Changement du contrat diff ou des routes.
- Suppression de `diff.min.js` tant que le Worker/modèle l'utilise.

## Steps

### Step 1: Relever tous les consommateurs CM5

Produire une liste exhaustive avec `rg` des scripts, CSS, globals et branches
`engine=cm5`. Classer chaque résultat : supprimer, remplacer CM6, ou conserver
avec justification non-CM5.

**Verify**: inventaire revu avant suppression.

### Step 2: Supprimer les branches et assets CM5

Retirer les `<script>/<link>` CM5, chemins de création CM5, adaptations
`CodeMirror.Pass/countColumn`, CSS exclusivement CM5, fallback et fichiers
`gallery/assets/cm/` non utilisés. Garder une erreur claire si une ancienne
préférence `studioEngine=cm5` existe : migrer automatiquement vers CM6 une fois.

**Verify**: la commande `Consumer audit` ne retourne rien. Un second
`rg -n "CodeMirror" gallery/assets/cm6 --glob '!**/*.bundle.js'` peut encore
trouver des noms de compatibilité internes CM6; ce n'est pas un runtime CM5 et
doit seulement être revu, pas forcé à zéro.

### Step 3: Nettoyer le build et les tests

Retirer les tests de comparaison des moteurs et conserver tous les scénarios
fonctionnels sous CM6. Vérifier que le bundle CM6 est toujours reproductible et
que `stage-gallery.sh` ne transporte plus CM5.

**Verify**: build propre depuis `npm ci`; source/staging/app ont les mêmes
hashes pour les assets éditeur.

### Step 4: Validation complète et relance stricte

Exécuter `npm run verify`, les E2E, puis le protocole AGENTS.md complet. Tester
les trois surfaces et la matrice diff dans l'app buildée.

**Verify**: toutes les couches vertes, aucun serveur galerie antérieur au build,
app et sidecar convergés.

## Test plan

- Rejouer tous les tests CM6 des plans 030-031 sans paramètre moteur.
- Vérifier les trois anciennes valeurs `studioEngine=cm5`, invalide et absente.
- Prouver par `rg` et inspection réseau qu'aucun asset CM5 n'est chargé.
- Refaire le scénario réel multi-zone → une intervention → tout → restore.
- Comparer taille source, staging et bundle avant/après suppression.

## Done criteria

- [ ] Acceptation humaine consignée.
- [ ] Aucun runtime CM5 dans les assets source/staging/app.
- [ ] Trois surfaces et diff entièrement verts sous CM6.
- [ ] Build CM6 reproductible.
- [ ] Taille avant/après documentée.
- [ ] Aucun fichier hors scope modifié.

## STOP conditions

- Acceptation humaine absente ou ambiguë.
- Une seule fonction ne passe qu'en CM5.
- Un consumer CM5 ne peut pas être expliqué.
- L'app buildée sert encore une copie CM5 après staging.

## Maintenance notes

Après ce plan, toute nouvelle fonctionnalité d'éditeur doit utiliser les
extensions/transactions CM6 ou l'interface moteur neutre, jamais recréer une
API globale CodeMirror 5.
