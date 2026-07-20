# Plan 058 — Workspace modulaire à panes

## Goal

Transformer le panneau Atelier en workspace modulaire façon cmux : chaque pane
possède sa propre barre d'onglets, accepte des documents et des surfaces outil,
et peut être scindé horizontalement ou verticalement par glisser-déposer.

Le résultat doit permettre au minimum :

- deux fichiers de code ou LaTeX visibles côte à côte ;
- un fichier avec Zotero ou Connaissances dans un autre pane ;
- des splits imbriqués gauche/droite/haut/bas ;
- le déplacement d'un onglet au centre d'un pane existant ;
- le redimensionnement et le collapse automatique des branches vides ;
- la restauration de la disposition propre à chaque projet.

## Contrat d'architecture

Le layout persistant est un arbre versionné :

```ts
type WorkspaceNode =
  | { type: "split"; id: string; direction: "horizontal" | "vertical";
      ratio: number; first: WorkspaceNode; second: WorkspaceNode }
  | { type: "pane"; id: string; tabs: WorkspaceTabRef[];
      activeTabId: string | null };
```

Les onglets sont des références stables vers :

- un document déjà possédé par `App.tsx` ;
- une surface singleton (`gallery`, Browser, Terminal, Git, Zotero,
  Connaissances, Générateur, Narval) ;
- l'accueil IDE ;
- le sous-agent actuellement inspecté.

Le modèle et ses transformations restent purs dans `src/lib/workspaceLayout.ts`.
Le rendu, les iframes et les cycles de vie des surfaces restent dans
`AtelierPane.tsx`.

## Interactions

- Drop au centre : déplacer l'onglet dans le pane cible.
- Drop gauche/droite : créer un split horizontal.
- Drop haut/bas : créer un split vertical.
- Drag d'une icône du rail : placer ou déplacer la surface correspondante.
- Menu contextuel d'onglet : alternatives clavier « scinder à droite » et
  « scinder en bas ».
- Chrome adaptatif : Terminal et Browser, qui possèdent déjà leurs propres
  onglets, masquent la barre du workspace lorsqu'ils sont seuls dans un pane.
  Elle ne réapparaît que si plusieurs contenus de workspace doivent cohabiter.
- Un bouton flottant discret ferme ces panes sans réintroduire une barre ; le
  sibling est promu automatiquement par le collapse de l'arbre.
- Drag du séparateur : ratio borné à 20–80 %.
- Fermeture du dernier onglet d'un pane : suppression du pane et promotion de
  son sibling ; la racine conserve toujours au moins un pane.

## Persistance et migration

- Nouvelle clé : `atelier-studio.workspace.v1.<projectRoot>`.
- Validation défensive de tout JSON relu depuis localStorage.
- Migration de `atelier-studio.split.<projectRoot>` vers deux panes lorsque
  l'ancien champ `second` existe.
- Réconciliation avec les documents réellement ouverts : suppression des ids
  obsolètes, ajout des nouveaux documents au pane focalisé, unicité des surfaces.
- Remontage d'`AtelierPane` au changement de projet afin d'éviter de propager le
  layout d'un projet vers un autre.

## Gardes de qualité

- Opérations pures couvertes : création, split dans quatre directions,
  déplacement centre, collapse, ratio, déduplication, migration et JSON hostile.
- Tests React : deux fichiers dans deux panes, déplacement d'une surface du rail,
  activation indépendante et restauration.
- Tous les contenus sont montés une seule fois dans un pool stable à la racine
  du workspace. Un déplacement change uniquement leur géométrie et leur pane
  propriétaire : l'iframe de l'éditeur n'est pas recréée et conserve donc son
  buffer local, même non sauvegardé.
- Le drag désactive temporairement les pointer events des iframes.
- Validation finale obligatoire avec TypeScript, Vite, sidecar, puis build et
  lancement du `.app` appartenant à ce worktree.

## Hors périmètre initial

- Fenêtres détachables macOS.
- Duplication simultanée du même document dans deux panes.
- Plusieurs instances d'une même surface singleton.
- Synchronisation collaborative de deux vues éditables du même fichier.
