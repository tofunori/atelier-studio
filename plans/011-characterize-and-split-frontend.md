# Plan 011: Poser des tests de caractérisation puis découper App et Chat

> **Status historique : SUPERSEDED.** Ne pas exécuter ce plan. Son intention,
> ses garde-fous et ses tests sont absorbés par le plan 015, aligné sur le
> blueprint UI du plan 014.

> **Executor instructions**: charger `/efficient-fable`. Refactorisation sans
> changement visible. Un axe d'extraction par unité logique; tests/build après
> chaque extraction.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- src/App.tsx src/components/Chat.tsx src/components/AtelierPane.tsx src/lib src/components`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 009, 010
- **Category**: tests / tech debt
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Why this matters

`src/App.tsx` fait ~2356 lignes et `Chat.tsx` ~2543. Ils concentrent sockets,
historique, galerie, événements globaux, markdown, composer et état de travail.
Le but n'est pas un nombre arbitraire de lignes mais des frontières testables
avant les futures fonctions de recherche scientifique.

## Ordered slices

1. **Characterization**: tests changement thread, réception history, done/error,
   add-to-chat, événements Git, composer disabled/running.
2. **Infrastructure hooks**: extraire `useSidecarConnection` stabilisé par 009 et
   `useAtelierServer` sans changer contrat.
3. **Event bridges**: une famille window event par hook avec setup/cleanup;
   aucun mega-hook.
4. **Chat rendering**: liste événements + rendu tour en composants memoizables,
   clés/streaming identiques.
5. **Composer**: saisie, attachments et contrôles d'envoi avec props typées.

## Scope

Créer sous `src/hooks/`, `src/components/chat/`, tests. App/Chat délèguent.
Hors scope: CSS, textes, protocole WS, formes événements, design, i18n, features.

## Verification per slice

```bash
npm run test:frontend -- --run
npx tsc --noEmit
npx vite build
```

Après tout: `npm run verify`, protocole Tauri, parcours Claude/Codex/API,
changement thread pendant run, attachment, revert, galerie add-to-chat, Git.

## Done criteria

- [ ] Tests avant déplacement.
- [ ] Chaque hook retire listeners/timers.
- [ ] Aucun changement CSS/texte/protocole.
- [ ] App/Chat orchestrent les modules extraits.
- [ ] Streaming ne duplique/perd rien.
- [ ] Diff en unités révisables, pas déplacement massif unique.

## STOP conditions

- Test exige changement comportement.
- Extraction touche >3 sous-systèmes à la fois.
- Tests surtout snapshots HTML volumineux.
- Correspondance ancien→nouveau d'un état inexplicable.

## Maintenance notes

Les futures fonctions de recherche vont dans module/hook dédié, jamais ajoutées
directement au corps principal App/Chat.
