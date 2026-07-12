# Plan 006: Rendre les snapshots Git durables et l'annulation non destructive

> **Executor instructions**: charger `/efficient-fable`. Ne jamais tester restore
> dans Atelier; uniquement dans les repos temporaires Vitest.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- sidecar/gitops.mjs sidecar/gitops.test.mjs sidecar/router.mjs sidecar/router.test.mjs src/App.tsx src/components/GitSurface.tsx src/lib/i18n.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 004
- **Category**: correctness / data safety
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

`snapshot()` crée un commit sans ref, donc élagable. `restore()` exécute
`git clean -fd`, qui peut supprimer du travail non suivi créé après snapshot.
L'annulation doit refuser une situation ambiguë plutôt que détruire.

## Current state

- `sidecar/gitops.mjs:307-325`: commit-tree, SHA seul.
- `sidecar/gitops.mjs:331-347`: checkout puis clean.
- `sidecar/router.mjs:679-688`: undo sans preview.
- tests 43-70 attendent actuellement la suppression du nouveau fichier.
- ledger garde `snapshotSha` (`router.mjs:268-280`).

## Target contract

- Ref `refs/atelier/snapshots/<sha>` créée par `git update-ref`.
- Aucun clean/rm dans restore.
- Avant écriture, calcul des chemins présents maintenant mais absents du
  snapshot; s'il y en a, refus atomique sans modification.
- Sinon, fichiers connus du snapshot restaurés.
- UI distingue succès et refus.

## Scope

**In scope**: gitops + tests, router + tests, App, GitSurface, i18n.

**Out of scope**: rétention des refs, restauration interactive, stash/index réel,
commande destructive dans Atelier.

## Steps

### 1. Ancrer le snapshot

Après commit-tree, valider SHA puis `git update-ref
refs/atelier/snapshots/<sha> <sha>`. Garder l'API publique en SHA.

Test: show-ref égale SHA; `git gc --prune=now`; cat-file commit réussit.

### 2. Détecter les nouveaux chemins avant mutation

Comparer arbre snapshot (`git ls-tree -r --name-only`) avec ajouts suivis/stagés
et untracked actuels. Normaliser/dédupliquer, refuser chemins absolus/`..`. Si un
chemin actuel est absent du snapshot, lever erreur bornée avant read-tree.

### 3. Restaurer sans nettoyage

Conserver index temporaire et checkout-index pour restaurer. Supprimer clean.
Cas: modifié→restauré; supprimé→recréé; untracked existant au snapshot→restauré;
nouveau chemin→refus/conservé; HEAD unborn identique.

### 4. Afficher le refus

Routeur envoie `gitUndoLastTurnError` avec ids/root/message; Done seulement après
succès. App redispatche; GitSurface affiche dans notification existante. Ajouter
FR/EN, sans style nouveau.

### 5. Vérifier

```bash
(cd sidecar && npx vitest run gitops.test.mjs router.test.mjs)
npx tsc --noEmit
npx vite build
(cd sidecar && npx vitest run)
```

Puis protocole Tauri et test manuel sur repo temporaire créé exprès.

## Test plan

1. ref durable après prune;
2. fichier modifié;
3. fichier supprimé;
4. refus atomique nouveau untracked;
5. refus atomique nouveau staged;
6. HEAD unborn;
7. SHA invalide;
8. routeur Error jamais Done au refus;
9. routeur Done au succès.

## Done criteria

- [ ] Aucun git clean dans restore.
- [ ] Snapshot survit au prune.
- [ ] Nouveau fichier jamais supprimé.
- [ ] Refus ne modifie rien.
- [ ] UI distingue succès/refus.
- [ ] Gates/app buildée passent.

## STOP conditions

- Calcul lit/supprime hors repo.
- Mutation avant refus.
- Index réel doit être altéré.
- Produit exige suppression automatique: demander UX preview explicite.

## Maintenance notes

Les refs croîtront. Ajouter plus tard rétention basée sur SHAs encore référencés;
aucun prune temporel aveugle ici.
