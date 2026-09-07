# Plan 075 : DOMPurify vient d'une dépendance versionnée partout, et `npm audit` le voit

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat b70ac4b3..HEAD -- gallery/assets/purify.min.js gallery/assets/md_viewer.html gallery/assets/latex_studio.html gallery/scripts/build-cm6.mjs gallery/package.json package.json`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b70ac4b3`, 2026-09-06

## Why this matters

Le lecteur Markdown et l'éditeur LaTeX de l'atelier assainissent du HTML
produit par des agents ou copié de sources externes avec **un `purify.min.js`
copié à la main, version 3.1.7**, absent de tout `package.json` : `npm audit`
ne peut ni le voir ni le mettre à jour, et plusieurs correctifs DOMPurify
publiés depuis 2024 ne lui ont jamais été appliqués. Par ailleurs `mermaid`
(dépendance directe, rendu de diagrammes potentiellement générés par un agent)
embarque `dompurify@3.4.11`, visé par deux advisories modérées atteignables
(`npm audit`). Après ce plan, une seule version, tirée de npm, alimente les
trois usages, et un test empêche le fichier vendorisé de dériver.

## Current state

- Fichier vendorisé : `gallery/assets/purify.min.js` (s'identifie « DOMPurify 3.1.7 »), chargé par `gallery/assets/md_viewer.html:11` (`<script src="purify.min.js">`) et `gallery/assets/latex_studio.html:14` (`<script src="/.fig_thumbs/purify.min.js">`) ; utilisé `md_viewer.html:39` : `bootstrapMarkdownSurface({…, sanitizer: DOMPurify})`.
- Racine : `package.json:67` `"mermaid": "^11"` → `dompurify@3.4.11` (`npm ls dompurify`). Versions publiées au moment du plan : `dompurify 3.4.15`, `mermaid 11.17.2`.
- `gallery/package.json` : dépend d'`esbuild` ; les bundles de l'atelier sont produits par `gallery/scripts/build-cm6.mjs` (esbuild) — ce script sait déjà écrire dans `gallery/assets/`.
- Contrainte : la galerie est vendorisée dans `gallery/` et restagée dans `src-tauri/gallery-dist/` au build ; les tests galerie sont `cd gallery && node server/tests/parity.mjs` et `node server/tests/diff_suite.mjs`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Audit | `npm audit --omit=dev` | plus d'advisory `dompurify`/`mermaid` |
| Galerie | `cd gallery && node server/tests/parity.mjs && node server/tests/diff_suite.mjs` | `parity: ok`, `diff suite: ok` |
| Front | `npx vitest run src/components/chat` | 0 failed (rendu Mermaid) |
| Build web | `npx vite build && node scripts/check_entry_budget.mjs` | ✓ (attention : budget à 1 Ko près — si `mermaid` grossit l'entrée, voir STOP) |

## Scope

**In scope**: `package.json` + `package-lock.json` (bump `mermaid`), `gallery/package.json` + lockfile (ajout `dompurify`), `gallery/scripts/build-cm6.mjs` (copie du fichier), `gallery/assets/purify.min.js` (régénéré), un test `gallery/server/tests/purify_version.test.mjs` (créer).
**Out of scope**: `md_viewer.html`, `latex_studio.html` (les balises `<script>` restent, seul le fichier change), tout autre usage de `mermaid`.

## Git workflow

Branche `advisor/075-dompurify` ; commits `chore(deps): mermaid ^11.17 (dompurify 3.4.15)` et `build(galerie): purify.min.js copié depuis npm + test de version` ; ne pas pousser.

## Steps

### Step 1 : mermaid à jour
`npm install mermaid@^11.17` à la racine ; `npm ls dompurify` doit montrer ≥ 3.4.13.
**Verify**: `npm audit --omit=dev | grep -i dompurify` → aucune sortie.

### Step 2 : DOMPurify versionné pour la galerie
`cd gallery && npm install dompurify@^3.4.15`. Dans `scripts/build-cm6.mjs`, ajouter une étape qui copie `node_modules/dompurify/dist/purify.min.js` vers `gallery/assets/purify.min.js` (préserver l'en-tête de licence contenu dans le fichier). Lancer `node scripts/build-cm6.mjs`.
**Verify**: `grep -oE "DOMPurify [0-9.]+" gallery/assets/purify.min.js | head -1` → `DOMPurify 3.4.15` (ou supérieur).

### Step 3 : test anti-dérive
Créer `gallery/server/tests/purify_version.test.mjs` (node:test, comme les voisins) : la version lue dans `gallery/assets/purify.min.js` égale celle de `gallery/node_modules/dompurify/package.json`. Ajouter le fichier à la commande de tests galerie si elle liste les fichiers explicitement (regarde `package.json` racine, script `test:gallery`).
**Verify**: `cd gallery && node --test server/tests/purify_version.test.mjs` → pass.

### Step 4 : régression
**Verify**: `cd gallery && node server/tests/parity.mjs && node server/tests/diff_suite.mjs` → ok ; `npx vitest run src/components/chat` → 0 failed ; `npx vite build && node scripts/check_entry_budget.mjs` → ✓.

## Done criteria

- [ ] `npm audit --omit=dev` sans advisory `dompurify` ni `mermaid`.
- [ ] `purify.min.js` ≥ 3.4.15 et test de version vert.
- [ ] Suites galerie ok ; budget d'entrée ✓.
- [ ] `git status --short` limité au scope (+ lockfiles).

## STOP conditions

- Le bump `mermaid` fait dépasser le budget d'entrée (1 024 Ko, marge ~1 Ko) — rapporte la taille ; ne touche pas au budget (c'est le plan 076).
- `node_modules/dompurify/dist/purify.min.js` n'existe pas sous ce nom dans la version installée — rapporte le chemin réel.
- `diff_suite.mjs` échoue après le remplacement du fichier (comportement de sanitisation changé) — rapporte le test exact.

## Maintenance notes

Toute nouvelle bibliothèque vendorisée dans `gallery/assets/` doit passer par le même mécanisme (npm + copie au build + test de version) ; sinon elle sort du radar d'audit.
