# Plan 015: Caractériser le frontend et établir ses frontières UI

> **Executor instructions**: charger `/efficient-fable`. Lire le blueprint 014
> approuvé avant le code. Chaque extraction commence par un test de
> caractérisation et conserve le rendu, le texte, le protocole et l'ordre des
> événements. Un seul axe d'extraction par diff révisable.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/App.tsx src/App.css src/components/Chat.tsx src/components/AtelierPane.tsx src/components/TopBar.tsx src/components/Rail.tsx src/lib src/test vitest.config.ts`
> puis `git status --short --` sur ces chemins. Les tests/uistate de 009 doivent
> être suivis par Git ou explicitement intégrés avant le début. **STOP si des
> modifications 009/010 non terminées sont encore dans le worktree.**

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans 009, 010 et 014 approuvé
- **Category**: caractérisation / architecture frontend
- **Planned at**: commit `8baafca`, 2026-07-09
- **Supersedes**: plan 011

## Pourquoi ce plan existe

`src/App.tsx` (~2360 lignes), `src/components/Chat.tsx` (~2540 lignes) et
`src/App.css` (~2070 lignes) concentrent orchestration, sockets, historique,
timeline, galerie, composer et présentation. Modifier directement ces fichiers
pendant une refonte rend les régressions difficiles à localiser.

Ce plan ne « nettoie » pas le code pour une métrique de lignes. Il crée les
frontières nécessaires aux plans 016–020, avec une preuve comportementale avant
chaque déplacement. **Aucun changement visuel intentionnel n'est autorisé.**

## Résultat architectural cible

```text
App
├─ infrastructure hooks
│  ├─ useSidecarConnection
│  ├─ useAtelierServer
│  ├─ useWorkspaceEvents
│  └─ useUiStatePersistence
├─ WorkspaceShell
│  ├─ TopBar
│  ├─ Rail
│  ├─ ViewPanel
│  └─ SurfaceHost
└─ ChatWorkspace
   ├─ ChatTimeline
   │  ├─ UserTurn
   │  ├─ ActivityGroup
   │  └─ AssistantResult
   └─ ChatComposer
      ├─ ContextShelf
      ├─ PromptInput
      └─ ComposerControls
```

Les noms peuvent varier légèrement si le code existant impose une meilleure
frontière, mais les responsabilités ne doivent pas être regroupées de nouveau
dans un autre mega-composant.

## Scope

**In scope**:

- `src/App.tsx`, `src/components/Chat.tsx`, `src/components/AtelierPane.tsx`;
- nouveaux dossiers `src/hooks/`, `src/components/shell/`,
  `src/components/chat/`;
- fixtures déterministes et tests sous `src/test/`;
- petits types partagés extraits sans changer leur forme réseau;
- commentaires documentant les invariants non évidents.

**Out of scope**:

- CSS, labels, tailles, couleurs et ordre visible des contrôles;
- protocole WebSocket, payloads sidecar, API Tauri ou postMessage galerie;
- nouveaux états produit, Research Home, inspecteur ou capsule résultat;
- nouvelle bibliothèque de state management, routeur, Storybook ou CSS-in-JS;
- snapshots DOM massifs utilisés comme seule protection.

## Slice 0 — Baseline et fixtures

1. Lancer `npm run verify` sur le worktree propre.
2. Capturer les sorties de tests et tailles App/Chat dans le rapport du plan.
3. Créer des builders typés dans `src/test/fixtures/` pour :
   - projet actif;
   - thread vide, actif, terminé et en erreur;
   - événements thinking/tool/result/done/error;
   - fichiers, highlights, figures et usages;
   - sidecar connecté/déconnecté/reconnecté.
4. Figer dates, identifiants, durées et compteurs. Aucun `Date.now()` ou UUID
   aléatoire non injecté dans les tests.
5. Créer des helpers de render avec providers réellement utilisés par l'app.

**Gate**: les fixtures compilent et au moins un test existant les consomme avant
la première extraction.

## Slice 1 — Caractériser l'orchestration App

Ajouter des tests ciblés qui démontrent :

- sélection d'un projet puis d'un thread;
- chargement et remplacement de l'historique;
- réception des événements `working`, `done`, `error`;
- persistance/restauration layout, panneau actif et projet actif;
- réception `atelier:add-to-chat` et attachement du bon artefact;
- ouverture/fermeture de la galerie et changement Chat/Split/Atelier;
- reconnexion sans duplication de listeners;
- changement de thread pendant un tour sans contamination visible;
- affichage des erreurs de revert/snapshot sans perdre le thread.

Tester les effets observables et appels aux adaptateurs, pas l'ordre interne des
`setState`. Les tests qui exigent plus de trois mocks de modules doivent motiver
pourquoi la frontière correspondante n'est pas encore injectable.

## Slice 2 — Extraire les hooks d'infrastructure

Ordre obligatoire :

1. `useSidecarConnection` — connexion, reconnexion, cleanup, informations
   partagées; conserver les temporisations et contrats de 009.
2. `useAtelierServer` — état galerie/serveur, start/stop/rescan et erreurs.
3. `useWorkspaceEvents` — familles d'événements `window` regroupées par domaine,
   jamais un mega-hook unique.
4. `useUiStatePersistence` — délègue au flusher testable de 009; flush au
   changement critique et au démontage.

Après chaque hook : tests dédiés avec montage/démontage deux fois, puis
`npm run test:frontend`, `npx tsc --noEmit`, `npx vite build`.

Invariants :

- tout listener/timer/AbortController est nettoyé;
- une reconnexion ne crée qu'une subscription active;
- aucune closure ne conserve un project/thread périmé;
- aucune erreur silencieuse nouvelle;
- les hooks exposent un objet métier compact, pas vingt setters bruts.

## Slice 3 — Extraire le shell sans le redessiner

Créer `WorkspaceShell` comme frontière de composition seulement :

- reçoit top bar, rail, view panel et surface principale en slots/props typées;
- conserve exactement les largeurs, ordre DOM, classes et raccourcis actuels;
- ne transforme pas le shell en système de routing;
- garde les traffic lights, offsets natifs et zones drag Tauri;
- maintient Chat/Split/Atelier et l'état compact/expanded du rail.

Comparer avant/après à 1512×883 et 800×600 par capture pixel ou inspection
côte à côte. Toute différence non expliquée est une régression.

## Slice 4 — Extraire la timeline Chat

Créer les frontières suivantes en conservant le markup/classes lorsque possible :

- `ChatTimeline` — liste, scroll, ancrage et streaming;
- `UserTurn` — prompt et attachments;
- `ActivityGroup` — thinking/outils/logs et repli;
- `AssistantResult` — texte final, review et actions existantes;
- `ChatEmptyState` — état actuel uniquement, futur point d'injection de 017.

Tests obligatoires :

- texte streamé ne se duplique pas;
- tool result arrive avant/après un bloc texte;
- groupe running devient done/error;
- changement thread remplace la timeline;
- scroll automatique ne vole pas la position après remontée manuelle;
- markdown, code, Mermaid et liens conservent leur rendu/fallback;
- review et usage restent associés au bon tour.

## Slice 5 — Extraire le composer

Créer :

- `ContextShelf` pour attachments/contexte visible;
- `PromptInput` pour textarea, suggestions et composition IME;
- `ComposerControls` pour provider, modèle, effort, permissions, send/stop;
- `ChatComposer` comme orchestration de ces trois parties.

Conserver :

- raccourcis Enter/Shift+Enter et Quick Ask;
- pièces jointes et suppression;
- goal editor;
- modèle/effort/permissions par provider;
- états disabled, running, stop et erreur;
- focus après envoi quand le comportement actuel le prévoit.

Ajouter un test de composition IME pour éviter l'envoi prématuré avec
`isComposing`, ainsi que clavier seul pour menus et suppression d'attachment.

## Slice 6 — Budget de complexité

À la fin, produire un court tableau avant/après : responsabilités de App/Chat,
nombre de listeners directs, composants extraits, tests correspondants. Les
objectifs sont qualitatifs :

- `App` orchestre les domaines, il ne rend pas les détails d'un tour;
- `ChatWorkspace` assemble timeline et composer;
- aucun composant extrait ne dépasse environ 500 lignes sans justification;
- aucune fonction ne mélange connexion, mutation réseau et rendu;
- les types d'événements ont une source partagée identifiable.

Ne pas poursuivre une extraction uniquement pour atteindre un nombre de lignes.

## Verification par slice

```bash
npm run test:frontend
npx tsc --noEmit
npx vite build
```

Verification finale :

```bash
npm run verify
npm run verify:e2e
```

Puis appliquer intégralement `AGENTS.md` et tester dans l'app buildée :

1. ouvrir un projet et un thread historique;
2. lancer un tour Claude et un tour Codex;
3. changer de thread pendant un tour puis revenir;
4. attacher un fichier et une figure depuis la galerie;
5. ouvrir un terminal et Mermaid;
6. basculer Chat/Split/Atelier;
7. provoquer/rejouer une reconnexion sidecar;
8. vérifier revert et message d'échec non destructif.

## Done criteria

- [ ] 009 et 010 sont intégrés et le worktree initial est compris.
- [ ] Tests de caractérisation précèdent les déplacements.
- [ ] App/Chat ont des frontières correspondant aux plans 016–020.
- [ ] Aucun changement CSS, texte, protocole ou comportement intentionnel.
- [ ] Chaque effet dispose d'un cleanup testé.
- [ ] Les tests couvrent streaming, historique, contexte, composer et reconnect.
- [ ] Captures avant/après ne montrent aucune différence inexpliquée.
- [ ] `verify`, E2E et app buildée passent.

## STOP conditions

- Un test révèle un bug produit : documenter et créer un fix séparé avant
  l'extraction concernée.
- Une extraction doit toucher sidecar et frontend pour préserver le comportement.
- Plus de trois sous-systèmes changent dans le même diff.
- Le rendu doit changer pour rendre la frontière possible.
- Les tests reposent surtout sur de grands snapshots HTML illisibles.
- L'association event → turn → usage n'est pas explicable avec les types actuels.

## Git workflow

Aucun commit/push sans demande. Si autorisé, utiliser
`fable/015-frontend-characterization` et un commit par slice réussie. Ne jamais
mélanger la refactorisation avec un fichier de style ou le travail galerie.
