# Plan 012: Réduire le coût de chargement frontend et des fontes

> **Status historique : SUPERSEDED.** Ne pas exécuter ce plan. Le plan 022
> reprend la mesure et l'optimisation après stabilisation des nouvelles
> frontières UI, pour éviter d'optimiser un graphe de composants transitoire.

> **Executor instructions**: charger `/efficient-fable`. Mesurer avant de
> modifier. Aucun manualChunks arbitraire et aucun retrait de fonte sans contrôle
> visuel terminal.
>
> **Drift check**: `git diff --stat 8a5d0ca..HEAD -- vite.config.ts src/App.tsx src/components/AtelierPane.tsx src/components/Terminal.tsx src/assets/fonts src/*.css src/**/*.css`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 011
- **Category**: performance
- **Planned at**: commit `8a5d0ca`, 2026-07-09

## Baseline

Audit Vite: entrée JS ~1.624 MB minifiée / ~474 KB gzip, CSS ~156 KB. Quatre
Monaspace Neon font ~1.3 MB chacune (~5.2 MB). Mermaid est déjà dynamique: ne
pas annuler cela. Terminal/xterm est statique et candidat naturel au lazy load.

## Scope

**In scope**: `vite.config.ts`, points d'import React des surfaces mesurées,
`src/components/Terminal.tsx`, déclarations et fichiers Monaspace réellement
utilisés, tests frontend de chargement.

**Out of scope**: changement visuel, remplacement de xterm/ReactMarkdown,
réécriture Mermaid, suppression de glyphes sans test, optimisation des bundles
vendorisés de la galerie.

## Steps

1. Capturer tableau assets + trace démarrage app buildée.
2. Lazy imports surfaces rares indépendantes, Terminal d'abord; Settings/Library
   seulement si graphe le justifie. Fallback sobre, état conservé.
3. Vérifier que Chat/ReactMarkdown critique ne crée pas waterfall; ne pas lazy
   sans bénéfice.
4. Auditer fontes: tester Regular+Bold avec synthèse italic. Retirer variantes
   seulement si ANSI italic/gras/Nerd Font restent acceptables. Garder licence.
5. Comparer. Cible: entrée initiale <1.0 MB minifiée, fontes <3.0 MB, ou expliquer
   pourquoi poursuivre n'est pas rentable.

## Verification

`npm run verify`, build Tauri, puis chat initial, premier/second terminal,
Mermaid, highlight, thème, terminal gras/italique/icônes. Aucune erreur chunk.

## Done criteria

- [ ] Mesures avant/après.
- [ ] Terminal absent chunk initial.
- [ ] Fallback cohérent.
- [ ] Aucun flash/perte d'état.
- [ ] Fontes contrôlées avant retrait.
- [ ] Cibles atteintes ou décision argumentée.

## STOP conditions

- Temps interactif pire/écran vide.
- Glyphes ou alignement terminal cassés.
- Gain gzip <5% pour complexité runtime nouvelle.

## Maintenance notes

Conserver les mesures dans le rapport de plan afin que toute nouvelle dépendance
lourde puisse être comparée à cette baseline. Préférer une frontière lazy liée à
une surface utilisateur réelle plutôt qu'un découpage vendor arbitraire.
