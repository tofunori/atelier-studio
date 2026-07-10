# Plan 031: Migrer toutes les surfaces d'édition vers CM6 avec fallback CM5

> **Instructions exécuteur** : migrer surface par surface et garder CM5 comme
> fallback jusqu'à validation finale. Ne supprimer aucun asset CM5 ici.
>
> **Drift check** :
> `git diff --stat 9f7341e..HEAD -- gallery/assets/latex_studio.html gallery/assets/code_editor.html gallery/assets/md_viewer.html gallery/assets/cm6 gallery/tests/e2e gallery/server/tests`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/030-reproducible-cm6-diff-parity.md`
- **Category**: migration
- **Planned at**: commit `9f7341e`, 2026-07-10

## Why this matters

Une migration complète ne concerne pas seulement `latex_studio.html`.
`code_editor.html` et `md_viewer.html` créent encore directement CM5. Ce plan
porte les trois surfaces sur le même moteur CM6, conserve le fallback et prouve
la parité fonctionnelle avant tout changement de défaut.

**Dependency gate** : ne commencer que si l'index marque 030
`DONE (accepted <sha>)` et si ce sha est ancêtre de HEAD. Sinon STOP.

## Current state

- `latex_studio.html:889-904` possède déjà le toggle CM5/CM6.
- `code_editor.html:158-183` crée directement CM5 et utilise le diff partagé.
- `md_viewer.html:148-176` crée directement CM5 pour le mode Edit/Split.
- CSS des trois pages cible largement `.CodeMirror*`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Locked install | `npm --prefix gallery ci` | exit 0 |
| CM6 build | `npm --prefix gallery run build:cm6` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Web build | `npx vite build` | exit 0 |
| Sidecar | `(cd sidecar && npx vitest run)` | tous verts |
| Gallery diff | `node gallery/server/tests/diff_suite.mjs` | tous verts |
| Gallery parity | `(cd gallery && node server/tests/parity.mjs)` | `parity: ok` |
| Browser | `npm --prefix gallery run test:e2e` | tous verts |

## Scope

**In scope**:
- `gallery/assets/latex_studio.html`
- `gallery/assets/code_editor.html`
- `gallery/assets/md_viewer.html`
- `gallery/assets/cm6/studio_editor.mjs`
- `gallery/assets/cm6/studio_cm6.bundle.js`
- `gallery/assets/editor_factory.js` (créer)
- `gallery/tests/e2e/core.spec.js`
- `gallery/tests/e2e/diff.spec.js`
- `gallery/tests/e2e/editor_cm6.spec.js` (créer)
- `gallery/server/tests/studio_editor_contract.test.mjs`
- `gallery/scripts/build-cm6.mjs`
- `gallery/package.json`, `gallery/package-lock.json` seulement si une langue
  CM6 manquante doit être déclarée

**Out of scope**:
- Suppression des assets CM5; leur chargement fallback reste obligatoire.
- Refonte visuelle.
- Modification des routes serveur.

## Steps

### Step 1: Définir une factory commune

Fournir une création unique qui reçoit `{parent,value,ext,wrap,readOnly}` et
retourne le contrat utilisé par les trois pages. Éviter trois branches CM6
divergentes. Conserver l'accès CM5 derrière le même seam pour le fallback.

Créer exactement `window.AtelierEditorFactory` dans
`gallery/assets/editor_factory.js`, avec `resolveEngine(search,storage)` et
`createEditor(options)`. Priorité immuable : paramètre query `engine` valide,
puis `localStorage.studioEngine` valide, puis `options.defaultEngine`. Les pages
passent `cm5` jusqu'à Step 5, puis `cm6`. Aucun toggle UI nouveau; le mécanisme
reste URL/localStorage.

**Verify**: tests factory pour tex, py, md, r, jl, sh, js/ts et texte brut.
Compléter explicitement le routage pour `sty`, `bib`, `R`, `bash`, JSON,
YAML et TOML; une extension inconnue doit rester en texte brut sans exception.

### Step 2: Migrer code_editor

Ajouter le toggle moteur, charger CM6, adapter thème/wrap/sélection/save,
rechargement agent, merge dirty et tout le diff. Exécuter la matrice diff du
plan 030 sur cette page également.

**Verify**: E2E `.py` indentation, save, reload externe, `tout · N`, restore.

### Step 3: Migrer md_viewer

Porter Edit/Split, preview live, sélection persistante, Cmd+S, conflit et
auto-reload. Adapter le CSS avec classes CM6 sans changer l'identité visuelle.
Ne pas ajouter `DiffVersions` à `md_viewer` : cette surface n'a pas aujourd'hui
de timeline. La parité signifie conserver ses fonctions actuelles, tandis que
le diff doit être vert seulement dans `latex_studio` et `code_editor`.

**Verify**: E2E Preview → Split → Edit, sélection, sauvegarde et reload.

### Step 4: Valider latex_studio fonction par fonction

Matrice obligatoire sous CM6 : frappe/undo/redo, ghost, save, compile/log,
PDF, SyncTeX dans les deux directions, annotations texc, outline, sélection,
Add to chat, read mode, rewrap, diff, historique/restore, Python lint et file
picker. Aucun item ne peut être accepté sur lecture du code seulement.

**Verify**: tests automatisés pour les chemins déterministes et checklist live
avec preuves (sorties/captures) pour PDF/SyncTeX/TCC.

`editor_cm6.spec.js` doit contenir les tests titrés :
`code editor save reload and diff`, `code editor preserves Python indentation`,
`markdown preview split edit roundtrip`, `engine resolution precedence`,
`latex deterministic parity`. Les preuves manuelles PDF/SyncTeX sont consignées
dans `plans/031-execution-notes.md` par le réviseur, avec date et résultat.

### Step 5: Faire de CM6 le défaut avec fallback explicite

Après matrice verte, changer le défaut logique à CM6, mais conserver
`?engine=cm5` et `localStorage.studioEngine=cm5`. Ajouter une bannière ou log
diagnostique indiquant le moteur actif pour les rapports de bug.

**Verify**: sans paramètre les trois pages indiquent CM6 ; avec `engine=cm5`,
les trois montent et passent leur smoke.

### Step 6: Suivre exactement le protocole de relance Atelier

Exécuter les vérifications obligatoires de `AGENTS.md`, tuer app/sidecar/serveurs
galerie, builder, relancer l'app buildée et vérifier la convergence santé.

**Verify**: app buildée active, sidecar santé OK, tests galerie parity+diff verts,
smokes trois surfaces dans l'app.

## Test plan

- Résolution moteur query > localStorage > défaut sur les trois pages.
- code_editor : langages, indentation, sauvegarde, reload, merge et diff.
- md_viewer : Preview/Split/Edit sans ajout de timeline.
- latex_studio : matrice déterministe automatisée et checklist PDF/SyncTeX live.
- Smoke CM5 explicite conservé sur chaque surface pendant l'observation.

## Done criteria

- [ ] Trois surfaces CM6 par défaut; diff vert sur les deux surfaces qui le
  proposent, comportement actuel préservé sur md_viewer.
- [ ] Fallback CM5 fonctionnel sur trois surfaces.
- [ ] Contrat diff identique et une action = une intervention.
- [ ] Build/stage/app validés selon AGENTS.md.
- [ ] Aucune régression fonctionnelle connue laissée sans STOP/revue.

## STOP conditions

- Un item de la matrice latex ne peut pas être vérifié.
- Une surface nécessite une API CM5 directe non couverte par le seam.
- Le fallback CM5 cesse de fonctionner avant acceptation humaine.
- La suite requiert de modifier directement `src-tauri/gallery-dist/`.

## Maintenance notes

Ce plan commence la période d'observation. Les assets CM5 restent présents
jusqu'au plan 032 et ne doivent pas être déclarés morts prématurément.
