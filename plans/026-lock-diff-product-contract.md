# Plan 026: Verrouiller le contrat produit du diff dans de vrais navigateurs

> **Instructions exécuteur** : lire ce plan entièrement, suivre les étapes dans
> l'ordre et exécuter chaque vérification. Ne modifier que les fichiers listés
> dans Scope. Si une condition STOP survient, arrêter et rapporter sans
> improviser. Le réviseur maintient `plans/README.md`.
>
> **Drift check (première commande)** :
> `git diff --stat 9f7341e..HEAD -- gallery/server/tests/diff_suite.mjs gallery/tests/e2e/core.spec.js gallery/tests/e2e/diff.spec.js`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `9f7341e`, 2026-07-10

## Why this matters

Le contrat non négociable est : **une action d'agent, une sauvegarde ou un
rechargement disque produit une seule intervention**, même si vingt mots ou
plusieurs paragraphes changent. Les mots peuvent être surlignés à l'intérieur
de l'intervention, mais ne deviennent jamais vingt entrées. Avant de refondre
l'historique ou migrer vers CM6, ce comportement doit être prouvé dans un vrai
navigateur, pas seulement avec les stubs VM actuels.

## Current state

- `gallery/server/tests/diff_suite.mjs:111-188` exécute le vrai
  `diff_versions.js`, mais avec DOM et CodeMirror simulés.
- `gallery/server/tests/diff_suite.mjs:435-558` couvre le compteur `tout · N`,
  le voyage temporel et les fichiers sans HEAD.
- `gallery/tests/e2e/core.spec.js` démarre déjà un serveur galerie temporaire,
  mais ne teste pas l'éditeur diff.
- `gallery/assets/diff_versions.js:223-230` définit déjà le bon vocabulaire :
  une intervention est une écriture, indépendamment du nombre de mots.
- Le moteur par défaut reste CM5 via
  `gallery/assets/latex_studio.html:61-64`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Diff unit/integration | `node gallery/server/tests/diff_suite.mjs` | `diff suite: ok (78+ tests)` |
| Gallery browser | `npm --prefix gallery run test:e2e` | tous les tests passent |
| Gallery parity | `(cd gallery && node server/tests/parity.mjs)` | `parity: ok` |
| Full gallery | `npm run test:gallery` | exit 0 |

## Scope

**In scope**:
- `gallery/server/tests/diff_suite.mjs`
- `gallery/tests/e2e/diff.spec.js` (créer)
- `gallery/tests/e2e/core.spec.js` uniquement si un helper existant doit être
  exporté sans changer ses assertions

**Out of scope**:
- Tout code de production.
- Toute migration CM6.
- Toute modification du rendu ou du nombre de zones surlignées.

## Git workflow

- Branche : `advisor/026-lock-diff-product-contract`
- Commit : `test(gallery): lock diff intervention contract in browser`
- Ne pas pousser ni fusionner.

## Steps

### Step 1: Ajouter un harnais navigateur isolé

Créer `gallery/tests/e2e/diff.spec.js` sur le modèle de `core.spec.js` : dépôt
Git temporaire, fichier `.tex`, serveur galerie Node sur port libre, nettoyage
dans `finally`. Ne pas dépendre d'un projet réel ni d'un agent réel.

**Verify**: `npx playwright test gallery/tests/e2e/diff.spec.js --list` liste les
nouveaux scénarios sans erreur de chargement.

### Step 2: Prouver « une action = une intervention »

Dans CM5, ouvrir `latex_studio.html`, modifier plusieurs mots dans un même
passage, sauvegarder une fois, ouvrir `±` et vérifier :

- `tout · 1`, jamais le nombre de mots ;
- plusieurs marques internes sont autorisées ;
- la flèche gauche mène à `1 / 1` ;
- fermer le diff rend l'éditeur modifiable.

Ajouter un second scénario avec trois sauvegardes éloignées : `tout · 3`, puis
`3 / 3`, `2 / 3`, `1 / 3`, retour à `tout · 3`.

**Verify**: le fichier E2E ciblé passe au moins 2 scénarios.

### Step 3: Caractériser les comportements qui seront corrigés ensuite

Ajouter un registre bespoke exact dans `diff_suite.mjs` :

```js
const TODOS = [];
function todo(name, reason) { TODOS.push({name, reason}); }
```

Ajouter cinq cas `todo(...)` explicitement nommés : ligne vide LaTeX
significative, restauration depuis une intervention, restauration depuis un
commit externe, modification agent pendant buffer dirty, édition puis retour
au texte de base. Imprimer `diff suite: todo (5)` à la fin. Ne pas utiliser
`test.todo` : cette suite n'emploie pas `node:test`.

Le plan 027 devra transformer ces cas en tests actifs. Le test happy-path ne
doit jamais être marqué TODO.

**Verify**: `node gallery/server/tests/diff_suite.mjs | tee /tmp/diff026.log && grep -F "diff suite: todo (5)" /tmp/diff026.log`
sort avec exit 0 et exactement cinq cas enregistrés.

## Test plan

- Une sauvegarde de vingt mots = une intervention.
- Trois sauvegardes = trois interventions.
- `tout` montre le diff net depuis la base.
- Sortie du voyage temporel restaure le buffer réel.
- Cas connus incorrects documentés sans masquer les régressions déjà vertes.

## Done criteria

- [ ] `node gallery/server/tests/diff_suite.mjs` passe.
- [ ] `npm --prefix gallery run test:e2e` passe.
- [ ] Les tests E2E lisent le vrai texte de `#dvNav`, pas un état mocké.
- [ ] Aucun test ne compte les mots comme interventions.
- [ ] Aucun fichier de production n'est modifié.

## STOP conditions

- Le test navigateur exige de lancer un agent ou un service externe réel.
- Le harnais ne peut pas isoler le projet temporaire.
- Un correctif de production paraît nécessaire : laisser le test en TODO et
  rapporter au plan 027.

## Maintenance notes

Ces tests sont la porte d'entrée de tous les plans 027-032. Le réviseur doit
refuser tout changement futur qui remplace le compteur d'interventions par un
compteur de mots ou de hunks.
