# Plan 030: Rendre CM6 reproductible et pleinement compatible avec le diff

> **Instructions exécuteur** : CM5 reste le défaut et le rollback. Ne changer
> aucun comportement produit du diff. Le réviseur maintient l'index.
>
> **Drift check** :
> `git diff --stat 9f7341e..HEAD -- gallery/package.json gallery/package-lock.json gallery/assets/cm6 gallery/assets/latex_studio.html gallery/server/tests/studio_compat.test.mjs gallery/tests/e2e/diff.spec.js`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/029-nonblocking-diff-rendering.md`
- **Category**: migration
- **Planned at**: commit `9f7341e`, 2026-07-10

## Why this matters

La phase A CM6 existe derrière `?engine=cm6`, mais le diff appelle encore des
méthodes absentes de la façade et les bundles sont générés via un `npm install`
temporaire non décrit par les manifests. Avant de migrer les utilisateurs, CM6
doit reproduire le contrat complet et son build doit être déterministe.

**Dependency gate** : ne commencer que si l'index marque 029
`DONE (accepted <sha>)` et si ce sha est ancêtre de HEAD. Sinon STOP.

## Current state

- `gallery/assets/cm6/studio_editor.mjs:139-206` implémente une façade partielle.
- Sont absents ou incomplets : `posFromIndex`, `indexFromPos`, `setBookmark`,
  `operation`, vraie gouttière, `gutterClick`, `readOnly`, marques suivies
  `find()/getRange()`.
- `gallery/assets/diff_versions.js` dépend de ces capacités pour les ajouts,
  suppressions, navigation et marques Git.
- `gallery/package.json` ne déclare que Playwright ; les paquets CM6/esbuild ne
  sont pas des dépendances reproductibles de la galerie.
- Le document historique
  `docs/superpowers/plans/2026-07-07-studio-cm6-migration.md` décrit Phase A ;
  il ne remplace pas cette phase de parité.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install locked | `npm --prefix gallery ci` | exit 0 |
| Build CM6 | `npm --prefix gallery run build:cm6` | bundles régénérés |
| Compat tests | `node --test gallery/server/tests/studio_compat.test.mjs` | tous verts |
| Diff both engines | `npm --prefix gallery exec -- playwright test tests/e2e/diff.spec.js` | CM5 et CM6 verts |
| Gallery | `npm run test:gallery` | exit 0 |

## Scope

**In scope**:
- `gallery/package.json`, `gallery/package-lock.json`
- `gallery/assets/cm6/studio_editor.mjs`
- `gallery/assets/cm6/studio_compat.mjs`
- `gallery/assets/cm6/studio_cm6.bundle.js`
- `gallery/assets/cm6/latex_cm6.bundle.js` seulement si la recette commune le
  régénère sans changement fonctionnel
- `gallery/server/tests/studio_compat.test.mjs`
- `gallery/server/tests/studio_editor_contract.test.mjs` (créer)
- `gallery/tests/e2e/diff.spec.js`
- `gallery/scripts/build-cm6.mjs` (créer)
- `gallery/assets/latex_studio.html` uniquement pour un dispatch moteur

**Out of scope**:
- `code_editor.html` et `md_viewer.html` (plan 031).
- Suppression des assets CM5.
- Changement du modèle d'interventions.

## Steps

### Step 1: Installer une recette de build verrouillée

Déclarer explicitement esbuild et tous les paquets `@codemirror/*` importés,
ajouter `build:cm6`, et faire produire les bundles depuis les sources du repo.
Deux builds consécutifs depuis `npm ci` doivent produire les mêmes hashes.

**Verify**: supprimer seulement les bundles générés dans un worktree, exécuter
le build deux fois et comparer les hashes.

### Step 2: Compléter les primitives de positions et widgets

Implémenter et tester `posFromIndex`, `indexFromPos`, `getRange`, `setBookmark`
via `Decoration.widget`, `operation`, et le nettoyage idempotent des
décorations. Étendre `markText()` pour retourner `clear()` **et** `find()` avec
positions remappées après chaque transaction; les commentaires LaTeX utilisent
ce contrat pour survivre à la frappe, au rewrap et au reload. Le widget de
suppression doit garder son texte, title et position.

**Verify**: tests unitaires positions début/fin/multiligne et clear deux fois.

### Step 3: Implémenter readOnly réellement

Utiliser des Compartments CM6 pour `EditorState.readOnly` et
`EditorView.editable`. Les commandes programmatiques de voyage temporel
restent possibles, mais frappe, collage et Cmd+S historique sont bloqués comme
en CM5.

**Verify**: E2E ouvre `tout`, frappe sans effet, ferme, frappe avec effet.

### Step 4: Implémenter la gouttière diff native

Ajouter StateField/GutterMarker et événements clic pour les marqueurs ajout,
modification et suppression. `clearGutter`, `setGutterMarker` et `gutterClick`
doivent préserver les numéros et fold gutter.

**Verify**: E2E inspecte une marque, clique et arrive au changement attendu.

### Step 5: Fermer les autres trous de façade nécessaires au studio

Implémenter `execCommand("selectAll")`. Fournir un batching `operation()`
prévisible. Remplacer le chemin CM5 `renderLine` utilisé pour le hanging-indent
par une extension/thème CM6 natif au lieu d'inventer un faux événement.

**Verify**: Cmd+A sélectionne tout, rewrap fonctionne et les lignes repliées
gardent leur indentation visuelle sous CM6.

### Step 6: Exécuter la matrice diff CM5/CM6

Paramétrer tous les scénarios du plan 026 sur `engine=cm5` et `engine=cm6` :
une action multi-mots, trois interventions, all, restore, reload, whitespace,
conflit, commentaires ancrés avant/après rewrap, et gros diff Worker.

**Verify**: même compteur, mêmes textes restaurés et mêmes zones sémantiques
sur les deux moteurs.

Les tests Playwright doivent porter exactement ces titres :
`diff multi-zone is one intervention`, `diff timeline cumulative and steps`,
`diff restore exact target`, `diff whitespace semantics`,
`diff anchored comments survive rewrap`, `diff worker stays responsive`, chacun
paramétré pour CM5 et CM6.

## Test plan

- Helpers de positions, widgets, marks `find`, clear idempotent et readOnly.
- Gouttières ajout/modifié/supprimé et clic de navigation.
- Cmd+A, rewrap, hanging-indent et commentaires ancrés.
- Six scénarios Playwright nommés, chacun CM5 et CM6.
- Deux builds CM6 verrouillés aux hashes identiques.

## Done criteria

- [ ] Build CM6 reproductible depuis les manifests.
- [ ] Aucun appel requis par DiffVersions ne manque sous CM6.
- [ ] Matrice diff complète verte sur CM5 et CM6.
- [ ] CM5 reste le défaut et le fallback.
- [ ] Tous les tests galerie passent.

## STOP conditions

- Une méthode CM5 ne peut pas être traduite sans exposer EditorView au module
  diff : proposer une interface moteur neutre et attendre revue.
- Les hashes de bundle divergent sans raison identifiée.
- La gouttière CM6 remplace ou casse les line numbers/folds.

## Maintenance notes

La façade peut conserver des noms compatibles pour limiter le risque, mais
son implémentation doit être native CM6 et testée. Aucun nouveau code produit
ne doit dépendre du global CM5.
