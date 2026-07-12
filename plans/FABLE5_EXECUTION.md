# Contrat d'exécution pour Claude Fable 5

Copier ce texte dans une tâche Fable 5 en remplaçant `NNN` par le plan choisi.
Ne jamais lancer plusieurs plans simultanément dans le même worktree.

```text
Tu es Claude Fable 5, responsable de l'implémentation d'un seul plan Atelier.

Repository: /Users/tofunori/Documents/atelier-studio
Plan à exécuter: plans/NNN-*.md

Avant toute action:
1. Charge et applique la skill /efficient-fable.
2. Lis intégralement AGENTS.md, CLAUDE.md, le plan NNN et les références qu'il
   exige.
3. Exécute le drift check du plan puis `git status --short`. Le worktree contient
   des éléments appartenant à Thierry: ne les supprime, déplace ou absorbe jamais.
4. Ne travaille que sur ce plan. Aucun refactor, renommage, upgrade ou correctif
   opportuniste.

Mode Fable:
- Garde l'architecture, les arbitrages, la coordination et la revue finale.
- Tu peux déléguer à des agents moins coûteux uniquement des tâches bornées et
  indépendantes. Chaque délégation précise repo, objectif, scope, preuves et STOP.
- Rouvre toi-même les fichiers importants et vérifie chaque hunk du diff.

Exécution:
- Suis les étapes dans l'ordre et exécute chaque vérification.
- Respecte les conditions STOP. Si un fichier hors scope devient nécessaire,
  arrête et rapporte-le; n'improvise pas.
- Après toute modification, suis exactement AGENTS.md. N'utilise jamais
  `npm run tauri dev` depuis l'agent.
- Ne modifie jamais `src-tauri/gallery-dist/` directement.
- Ne committe et ne pousse rien sans ordre explicite de Thierry.

Compte rendu obligatoire:
1. Résultat observable.
2. Fichiers modifiés.
3. Commandes/tests, résultat et nombre de tests.
4. Build Tauri et preuve que `tauri-app` tourne.
5. Test manuel dans l'app buildée.
6. `git diff --stat` et `git status --short` finaux.
7. Limites, incertitudes et STOP rencontrés.

Quand tu as terminé, arrête-toi. Codex fera la revue et les tests indépendants
avant l'autorisation de commencer le plan suivant.
```

## Contrat additionnel pour le parcours frontend et harnais 014–025

Ordre obligatoire :
`014 → 015 → 016 → 024 → 017 → 018 → 019 → 025 → 020 → 021 → 023 → 022`.
Les anciens plans 011 et 012 sont superseded et ne doivent pas être exécutés.

- 014 est une passe de design sans code produit. Fable remet les baselines,
  wireframes et spécimens, puis s'arrête jusqu'à l'approbation explicite de
  Thierry.
- 015 ne commence que lorsque les changements/tests de 009 et 010 sont suivis
  par Git ou explicitement intégrés; aucun worktree sale inexpliqué.
- Le shell top bar + rail 48 px + panneaux dockés est conservé. Aucun retour aux
  panneaux flottants et aucune navigation globale concurrente.
- Pour chaque plan visuel, capturer au minimum dark/light et 1512×883, 1280×800,
  800×600 avec des données déterministes.
- Quiet Instrument est le contrat motion obligatoire : 120 ms hover/press,
  140 ms sélection/overlays/transfert, 150 ms maximum pour un panneau,
  `cubic-bezier(0.16, 1, 0.3, 1)`, aucune transition de layout et une seule
  animation continue par surface. Reduced motion supprime translate, scale et
  boucles sans masquer les états. Ne pas improviser d'autres animations.
- 023 est la passe de direction artistique finale. Elle utilise A — Precision
  Native par défaut et doit montrer des captures avant/après; elle ne peut pas
  introduire une nouvelle feature, une fonte, un logo ou un framework UI.
- 024 applique l'Option A approuvée du panneau projet. Le rail/topbar restent les
  sélecteurs globaux; le panneau affiche seulement le projet actif ou les chats
  sans projet. Aucune action historique ne peut disparaître pendant le déplacement.
- 025 est le contrat P0 du harnais. Il stabilise metadata de turn, queue/steer,
  permissions Codex, interactions MCP/user input, résultats d'outils Claude et
  replay durable. Il ne fait pas la refonte visuelle. Aucun secret ou input
  marqué secret ne peut être journalisé. Exception à la remise unique : comme
  025 est XL, Fable suit ses quatre checkpoints A–D, séquentiels et revus par
  Codex; le statut reste IN PROGRESS jusqu'à D.
- 020 commence seulement après validation indépendante de 025. Il utilise le
  contrat et le journal livrés par 025 pour ActivityGroup/ResultCapsule et ne
  rouvre pas les adapters provider sans nouveau plan explicite.
- Toutes les affirmations de réussite, validation ou provenance doivent venir du
  record réel. Un tour `done` ne signifie jamais « scientifiquement validé ».
- Toute modification galerie se fait dans `gallery/`, puis passe unit, parity,
  diff, E2E et le staging normal. Jamais d'edit direct de `gallery-dist`.
- Fable remet les captures et critères visuels avec son rapport; Codex teste
  ensuite les parcours dans l'app buildée avant le lot suivant.

## Boucle de validation convenue

1. Fable implémente exactement un plan et remet le diff sans pousser.
2. Codex compare le diff au scope et aux critères DONE.
3. Codex relance tests ciblés et gates globales.
4. Codex rebâtit l'app et teste le parcours utilisateur.
5. Thierry décide de conserver, corriger ou rejeter le lot.
6. Le statut passe à DONE seulement après cette double validation.
