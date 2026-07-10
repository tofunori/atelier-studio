# Plan 028: Rendre restauration, base et persistance du diff durables

> **Instructions exécuteur** : ce plan suppose le journal explicite du plan
> 027. Ne contourner aucune condition STOP et ne toucher qu'au scope.
>
> **Drift check** :
> `git diff --stat 9f7341e..HEAD -- gallery/assets/diff_versions.js gallery/assets/latex_studio.html gallery/assets/code_editor.html gallery/server/routes/editors.mjs gallery/server/shared.mjs gallery/server/tests/diff_suite.mjs gallery/tests/e2e/diff.spec.js`

## Status

- **Priority**: P0
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/027-explicit-diff-interventions.md`
- **Category**: bug
- **Planned at**: commit `9f7341e`, 2026-07-10

## Why this matters

Le bouton Rétablir peut actuellement utiliser `VERSIONS[idx]` au lieu de la
version réellement affichée. La persistance est silencieuse, plafonne des
snapshots complets et écrit directement le JSON. Une restauration ou un crash
peut donc déplacer la base, recréer une fausse modification ou perdre
l'historique.

**Dependency gate** : ne commencer que si l'index marque 027
`DONE (accepted <sha>)` et si ce sha est ancêtre de HEAD. Sinon STOP.

## Current state

- `gallery/assets/diff_versions.js:773-778` restaure `VERSIONS[idx]` même quand
  `extCmp` représente une intervention ou un commit externe.
- `gallery/assets/latex_studio.html:2279-2284` ne met pas `lastSavedText` à jour
  après restauration.
- `gallery/assets/diff_versions.js:68-85` supprime les plus vieux documents au
  plafond de 1,5 Mo et ignore les erreurs POST.
- `gallery/server/routes/editors.mjs:828-845` écrit le JSON directement.
- `gallery/server/routes/core.mjs:234-235` fournit le pattern local
  temp-file + rename atomique à reproduire.

## Target storage contract

Version 2 côté serveur (format durable compact; le modèle en mémoire peut
matérialiser `before/after`) :

```js
{
  v: 2, path, revision, // entier serveur, commence à 0
  base: {hash, kind, sha, ts},
  texts: {"<sha256>": "contenu exact"},
  interventions: [{
    id, fromHash, toHash,
    ts, source, status // applied | pending-conflict
  }],
  legacySnapshots: [{hash,ts,label}],
  current: {hash, ts}
}
```

La base et les événements ne sont jamais supprimés par le plafond. La
compaction est content-addressed : les textes identiques n'existent qu'une fois
et seuls les blobs qui ne sont référencés ni par base, current, intervention ou
legacySnapshot peuvent être collectés. Le fichier disque v2 est compressé avec
`zlib.gzipSync` puis remplacé atomiquement. La compaction ne change ni N, ni les
ids, ni l'ordre, ni la navigation. Tout hash recalculé doit correspondre avant
écriture; sinon le serveur conserve l'ancien état et répond en erreur.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Diff | `node gallery/server/tests/diff_suite.mjs` | tous verts |
| Browser | `npm --prefix gallery exec -- playwright test tests/e2e/diff.spec.js` | tous verts |
| Parity | `(cd gallery && node server/tests/parity.mjs)` | `parity: ok` |
| Gallery | `npm run test:gallery` | exit 0 |

## Scope

**In scope**:
- `gallery/assets/diff_versions.js`
- `gallery/assets/latex_studio.html`
- `gallery/assets/code_editor.html`
- `gallery/server/routes/editors.mjs`
- `gallery/server/shared.mjs` seulement pour un helper atomique générique
- `gallery/server/tests/diff_suite.mjs`
- `gallery/tests/e2e/diff.spec.js`

**Out of scope**:
- Diff Worker.
- CM6.
- Modification du fichier utilisateur sans confirmation via Rétablir.

## Steps

### Step 1: Corriger la cible de restauration

Activer d'abord les deux TODO restauration laissés par le plan 027; ils doivent
échouer avant le correctif. À la fin de cette étape, le registre TODO doit être
vide et la suite imprime `diff suite: todo (0)`.

Créer une fonction unique qui retourne le texte affiché : `all` → buffer
courant, intervention → `after`, comparaison externe → texte externe. Le
bouton Rétablir doit utiliser cette cible, puis enregistrer une nouvelle
intervention `restore`; il ne doit jamais supprimer l'historique.

Quitter le voyage temporel avant l'écriture et invalider `tt.realText` afin que
la fermeture du diff ne puisse pas réinjecter l'ancien buffer par-dessus la
restauration réussie.

Mettre à jour `lastSavedText`, `lastKnown`, `diskMtime`, buffer et état dirty
dans les deux hôtes après succès seulement.

**Verify**: tests restauration depuis `2 / 3`, commit externe et échec 409.

### Step 2: Ajouter revision et sérialiser les écritures client

Le serveur est l'autorité de révision. Nouveau fichier = revision 0. POST envoie
`{path,expectedRevision,ops}` où chaque op append contient l'événement et les
nouveaux blobs `texts` référencés. Si égal à la révision serveur, appliquer et
répondre `{ok:true,revision:expectedRevision+1}`. Sinon répondre HTTP 409
`{ok:false,error:"revision-conflict",revision,state}`.

Le client maintient une file unique par page. Pendant un POST, toute nouvelle
intervention reste dans `pendingById`; après ack, elle est envoyée dans le POST
suivant. Sur 409, fusionner par id les événements append-only, ordre `(ts,id)`,
préserver tous les pending locaux, puis retry une seule fois avec la nouvelle
revision. Si `base.hash` diverge ou qu'un même id a deux contenus différents,
STOP côté client avec statut visible; ne choisir aucune version. Deux pages
concurrentes doivent converger par ce protocole.

**Verify**: test avec réponses POST inversées conserve la révision la plus
récente.

### Step 3: Écrire atomiquement côté serveur

Valider le schéma et les tailles, écrire dans un fichier temporaire du même
dossier, fermer puis `renameSync`. En cas de révision obsolète, répondre 409
avec la révision courante. Conserver une sauvegarde du dernier JSON valide.

**Verify**: tests serveur couvrent succès, payload invalide, révision obsolète
et JSON principal tronqué avec récupération backup.

### Step 4: Implémenter migration et compaction déterministes

Migrer v1 une fois, écrire v2 après validation, garder base, current,
legacySnapshots et status. Construire les blobs SHA-256 et les références
fromHash/toHash; ne jamais supprimer une intervention. Collecter uniquement les
blobs réellement non référencés. Pour un fichier non suivi, `tout` doit encore
partir de la base de session après au moins 30 interventions.
Le fallback localStorage v2 doit conserver `current/lastKnown` en plus des
interventions; il ne doit pas recréer une fausse modification après reload.

**Verify**: test de 45 interventions prouve avant/après reload et compression :
base identique, N=45, ids identiques, navigation 1/45, 20/45, 45/45 exacte,
status conflit préservé, chaque hash valide et diff net identique.

### Step 5: Tester le redémarrage complet

E2E : trois interventions, fermeture page, nouvelle page, `tout · 3`,
restauration de 2/3, reload, `tout · 4` avec base inchangée.

**Verify**: scénario Playwright vert deux fois de suite.

## Test plan

- Restauration exacte depuis all, k/N et commit externe, succès et 409.
- Deux pages concurrentes, POST inversés, retry unique et conflit de base.
- Migration v1, legacySnapshots et status pending-conflict après reload.
- 45 interventions content-addressed : N, ids, navigation et hashes inchangés.
- JSON gzip tronqué : récupération du dernier état atomique valide.

## Done criteria

- [ ] Rétablir restaure exactement la vue affichée.
- [ ] La restauration devient une intervention unique.
- [ ] Écritures atomiques et révisions testées.
- [ ] Base préservée sous compaction et redémarrage.
- [ ] N, ids, navigation et status préservés sous compaction.
- [ ] Aucun échec de persistance permanent n'est entièrement silencieux.
- [ ] Toutes les suites galerie passent.

## STOP conditions

- Le format v1 observé diverge de `{items,last}`.
- Une restauration correcte nécessiterait d'écraser un conflit 409.
- L'atomicité exige un autre filesystem/dossier pour le temp file.

## Maintenance notes

Le format v2 devient une donnée durable. Toute évolution future nécessite une
version de schéma et un test de migration.
