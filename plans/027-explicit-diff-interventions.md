# Plan 027: Enregistrer des interventions explicites sans créer un diff par mot

> **Instructions exécuteur** : suivre chaque étape et chaque vérification. Une
> intervention représente une action complète. Ne jamais créer une entrée par
> mot, hunk ou zone visuelle. Le réviseur maintient l'index.
>
> **Drift check** :
> `git diff --stat 9f7341e..HEAD -- gallery/assets/diff_versions.js gallery/assets/latex_studio.html gallery/assets/code_editor.html gallery/server/tests/diff_suite.mjs gallery/tests/e2e/diff.spec.js`

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/026-lock-diff-product-contract.md`
- **Category**: bug, tech-debt
- **Planned at**: commit `9f7341e`, 2026-07-10

## Why this matters

Le code stocke seulement des états `before` puis reconstruit les interventions
en supposant que les snapshots sont contigus et que le buffer courant est
l'état `after`. Cette hypothèse devient fausse pendant une fusion, un conflit,
une restauration ou une course au chargement. Il faut stocker chaque action
comme une paire explicite avant/après tout en conservant exactement l'UX
« une action = une intervention ».

**Dependency gate** : ne commencer que si `plans/README.md` marque 026
`DONE (accepted <sha>)` et si `git merge-base --is-ancestor <sha> HEAD` sort 0.
Sinon STOP.

## Current state

- `gallery/assets/diff_versions.js:28` : `VERSIONS` contient `{before, ts}`.
- `gallery/assets/diff_versions.js:237-253` : `interList()` reconstruit les
  paires avec les snapshots et le buffer vivant.
- `gallery/assets/diff_versions.js:377-400` : `push(before, after)` ne conserve
  que `before`.
- `gallery/assets/latex_studio.html:2170-2204` : reload propre, merge et conflit
  appellent tous `diffPush`, mais le buffer affiché n'est pas toujours `after`.
- `gallery/assets/code_editor.html:244-298` duplique ce protocole.

## Target contract

`DiffVersions.push(before, after, meta)` crée exactement une entrée :

```js
{
  id, before, after, ts,
  source: "user-save" | "external-reload" | "external-merge" |
          "external-conflict" | "restore" | "legacy",
  status: "applied" | "pending-conflict"
}
```

- `tout` compare toujours la base immuable au buffer réel courant.
- `k / N` compare `interventions[k].before` à `.after` indépendamment des
  autres entrées ; aucune reconstruction par snapshots adjacents.
- Une intervention peut contenir plusieurs zones visuelles, sans changer N.
- Un conflit externe est visible comme intervention indépendante, mais n'est
  pas présenté comme appliqué au buffer courant.
- Une édition puis annulation peut donner `tout · 2` et zéro changement net ;
  le statut doit l'expliquer clairement.
- Les snapshots v1 sans `after` deviennent des
  `legacySnapshots:[{text,ts,label}]`. Ils restent accessibles dans Historique,
  mais ne participent jamais à N.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Diff suite | `node gallery/server/tests/diff_suite.mjs` | tous verts, compteur augmenté |
| Browser diff | `npm --prefix gallery exec -- playwright test tests/e2e/diff.spec.js` | tous verts |
| Gallery | `npm run test:gallery` | exit 0 |

## Scope

**In scope**:
- `gallery/assets/diff_versions.js`
- `gallery/assets/latex_studio.html`
- `gallery/assets/code_editor.html`
- `gallery/server/tests/diff_suite.mjs`
- `gallery/tests/e2e/diff.spec.js`

**Out of scope**:
- `/versions` serveur et format durable définitif (plan 028).
- Worker/performance (plan 029).
- CM6 (plans 030-032).
- Rendu mot à mot existant, sauf adaptation à l'entrée explicite.

## Git workflow

- Branche : `advisor/027-explicit-diff-interventions`
- Commits : tests rouges, modèle, intégrations, tests verts.
- Style : `fix(gallery): ...`

## Steps

### Step 1: Activer les tests rouges du plan 026

Transformer les TODO concernant dirty merge, conflit et revert en assertions
actives. Ajouter les sources dans les assertions de timeline. Les deux TODO de
restauration restent enregistrés jusqu'au plan 028; la sortie attendue devient
exactement `diff suite: todo (2)`.

**Verify**: le test ciblé échoue d'abord sur le modèle actuel, puis la suite
verte finale imprime exactement `diff suite: todo (2)`.

### Step 2: Remplacer la reconstruction par un journal explicite

Dans `diff_versions.js`, remplacer `VERSIONS` comme source de timeline par
`interventions`. Conserver la pseudo-base Git séparément. `showStep(j)` utilise
directement la paire j. `showAll()` restaure le vrai buffer et utilise la base.
Le compteur N est `interventions.length` après filtrage de base, jamais le
nombre de parties retournées par jsdiff.

**Verify**: tests timeline unitaires verts, y compris une intervention qui
modifie trois paragraphes éloignés mais reste `1 / 1`.

### Step 3: Rendre les sources explicites aux call sites

Mettre à jour les deux éditeurs :

- sauvegarde utilisateur → `user-save` ;
- reload disque propre → `external-reload` ;
- merge non chevauchant → paire base/disque `external-merge`, buffer fusionné
  conservé séparément comme buffer réel ;
- conflit → `external-conflict`, sans prétendre que le texte disque est appliqué.

Pour une fusion non chevauchante, la paire de l'intervention externe reste la
modification réellement faite par l'agent (`base → diskText`), tandis que le
buffer réel peut être `merged`; les deux ne doivent plus être confondus. Pour
un conflit, conserver `base → diskText` avec `status:"pending-conflict"`.

Ne pas dupliquer une même mtime externe. Ne pas transformer les zones de diff
en interventions.

**Verify**: nouveaux tests dirty/merge/conflit verts dans les deux intégrations.

### Step 4: Corriger la classification « rewrap seulement »

Remplacer le `replace(/\s+/g, " ")` global par une politique dépendante de
l'extension :

- code (`py`, `r`, `jl`, `sh`, etc.) : tout changement de whitespace compte ;
- LaTeX : préserver lignes vides, commentaires `%` et environnements
  `verbatim`, `lstlisting`, `minted`; n'ignorer que les retours visuels déplacés
  dans un même paragraphe de prose ;
- texte/Markdown : préserver les frontières de paragraphes.

**Verify**: ligne vide LaTeX, indentation Python et verbatim créent chacun une
intervention ; rewrap de prose pure n'en crée toujours pas.

### Step 5: Maintenir une migration mémoire v1 temporaire

Lire l'ancien `{v:1, items:[{b,t}], last}` en produisant des interventions
best-effort seulement lorsque deux états consécutifs sont disponibles. Marquer
les entrées migrées `source:"legacy"`. Ne jamais inventer un `after` absent ;
dans ce cas conserver la snapshot dans `legacySnapshots` sans la compter comme
intervention.

**Verify**: fixture v1 charge sans exception et le prochain push écrit le
format transitoire v2 attendu par le plan 028.

## Test plan

- Une action multi-mots/multi-paragraphes = une entrée.
- Sources user/reload/merge/conflict/restore.
- Modification puis revert : N=2, net=0.
- Ligne vide LaTeX, verbatim et indentation Python visibles.
- Rewrap de prose ignoré.
- Migration v1 déterministe sans fausse intervention.

## Done criteria

- [ ] Aucun `interList()` ne reconstruit N depuis `VERSIONS.map(...before)`.
- [ ] `tout` reste base → buffer réel.
- [ ] Tous les tests diff et E2E passent.
- [ ] Le texte `20 mots` n'apparaît jamais comme `20 interventions`.
- [ ] Aucun fichier hors scope modifié.

## STOP conditions

- La base Git ne peut pas être séparée de la timeline sans changer `/githead`.
- Un conflit exige de décider automatiquement quelle version écraser.
- La migration v1 ne permet pas de distinguer deux états : conserver comme
  historique legacy et rapporter, ne pas fabriquer une intervention.

## Maintenance notes

Le modèle explicite est le contrat permanent. CM6 devra consommer le même
`DiffVersions`; la migration d'éditeur ne doit pas redéfinir l'unité
d'intervention.
