# Parité d’orchestration Synara et rendu de tour Codex

**Statut :** terminé et revu le 15 juillet 2026
**Branche :** `codex/synara-chat-parity`
**Références auditées :** Synara 0.5.3 et Codex App 26.707.72221 (build 5307)

## Objectif

Atelier doit offrir une conversation multi-provider cohérente sans exposer le
flux brut des CLIs. L’orchestration suit Synara : un provider appartient à un
thread et un changement de provider crée un handoff vers un nouveau thread. Le
rendu suit Codex : chaque tour possède une phase, des items typés, une activité
sémantique active, un seul fallback `Thinking` et un résumé repliable en fin de
travail.

La parité visée est comportementale. Les capacités natives restent propres au
provider et ne sont jamais simulées par le frontend.

## Constats confirmés dans les bundles de référence

### Synara

1. `modelSelection.provider` est attaché au thread.
2. `thread.handoff.create` reçoit un nouvel identifiant, le thread source, un
   provider cible et une copie bornée des messages terminés.
3. Le handoff est refusé pendant un run, une approbation ou une interaction.
4. Le thread cible possède une nouvelle session native et garde une relation
   explicite avec le thread source.
5. Les brouillons et relances en file capturent provider, modèle, effort,
   permissions et références au moment de leur création.

### Codex App

1. La timeline rend un modèle de tour, pas une suite de lignes de log.
2. Les phases `idle`, `prework` et `final_answer` pilotent le rendu et le suivi
   du scroll.
3. L’activité visible est choisie sémantiquement : lecture, recherche, édition,
   commande, web, approbation ou intégration.
4. Une activité en cours est préférée; sinon la dernière activité utile est
   utilisée pour le résumé repliable.
5. `Thinking` est un fallback synthétique unique. Il n’est montré que lorsque
   le tour travaille encore et qu’aucun reasoning, outil, interaction ou autre
   activité utile ne représente l’état courant.
6. `Working`, `Worked for` et `You stopped after` sont des états de premier
   ordre avec une durée stable.
7. Les items `exec`, `patch`, `reasoning`, `mcp-tool-call`,
   `permission-request`, `proposed-plan`, `model-changed` et `turn-diff` ont des
   renderers dédiés.
8. Les tours sont virtualisés et le suivi automatique s’arrête dès que
   l’utilisateur remonte dans l’historique.

## Invariants Atelier

### I1 — Provider immuable

- Un thread sans historique ni session peut encore choisir son provider avant
  le premier envoi.
- Dès le premier événement durable ou la première session native, son provider
  est verrouillé.
- Un `send` portant un autre provider est refusé par Node et Rust.
- Changer de provider dans le composer déclenche un handoff atomique vers un
  nouvel identifiant de thread.

### I2 — Handoff atomique et explicite

- Le message `send` peut porter `handoffFromThreadId` uniquement pour un thread
  cible neuf.
- Le backend valide le thread source, son état non actif et le provider cible.
- Il crée le thread cible, copie son journal visible, construit une seule fois
  le contexte provider, initialise une session native neuve et enregistre
  `{sourceThreadId, sourceProvider, targetProvider}`.
- Le message réellement tapé reste le seul nouveau message user visible.
- Les événements importés conservent leur provider d’origine; les nouveaux
  événements portent celui du thread cible.

### I3 — Modèle canonique de tour

Une fonction pure transforme `AgentEvent[]` en `ChatTurnViewModel[]` :

- identité stable par `meta.turnId`, sinon identité legacy user → terminal;
- phase : `idle`, `prework`, `waiting`, `final_answer`, `completed`, `stopped`
  ou `failed`;
- message user, narrations intermédiaires et réponse finale distincts;
- reasoning consolidé par tour;
- outils indexés par `(turnId, itemId)` et groupés sémantiquement;
- interactions, permissions, plans, edits, erreurs et terminaux conservés;
- durée dérivée des timestamps du tour, jamais d’un état React secondaire.

### I4 — Activité sémantique unique

Priorité de l’état actif :

1. interaction ou permission en attente;
2. activité/provider explicitement `running`;
3. outil non terminé;
4. reasoning live utile;
5. fallback `Thinking`.

Les commandes shell sont classées en lecture, recherche, édition, test,
formatage, navigation web ou commande générique. `Bash`, `execute_command` et
les noms techniques ne sont jamais le titre principal.

### I5 — Fin de tour

- Les narrations et actions antérieures à la réponse finale deviennent le
  contenu de `Worked for…`.
- Une interruption devient `Stopped after…` et non une erreur générique.
- Les erreurs et interactions finales restent visibles hors du pli.
- Le détail brut, l’input et la sortie des outils restent accessibles au clic.

### I6 — Capacités provider

La matrice de capacités est la seule autorité pour les commandes et cartes :

| Capacité | Codex | Claude | Grok/API |
|---|---:|---:|---:|
| reasoning | oui | oui si émis | si émis |
| approbation | native | native/relay | si adapter |
| user input | native | si SDK | si adapter |
| MCP elicitation | native | si adapter | si adapter |
| widgets MCP | Codex seulement | non | non |
| plugins Codex | oui | non | non |
| skills textuels | oui | oui | selon adapter |
| review/goal/compact natifs | Codex | selon CLI | non par défaut |

Un contrôle absent des capacités du thread n’est pas affiché.

### I7 — Scroll et virtualisation

- `prework` suit le bas tant que l’utilisateur n’a pas remonté la liste.
- `final_answer` ancre le début de la réponse finale sans arracher la position
  à un utilisateur qui lit l’historique.
- Le bouton de retour en bas réactive explicitement le suivi.
- Les clés de lignes sont dérivées du thread, du turn et de l’item, jamais de
  l’index seul lorsque la metadata canonique existe.

## Découpage d’implémentation

1. Ajouter le contrat de handoff au protocole frontend, Node et Rust.
2. Verrouiller le provider dans les deux backends et supprimer le changement de
   provider in-place.
3. Ajouter `handoff` au modèle `Thread` et à la présentation du chat.
4. Extraire `chatTurnViewModel.ts` avec ses types et tests purs.
5. Remplacer les heuristiques de `Chat.tsx` par la projection canonique.
6. Ajouter le résumé d’activité sémantique et le fallback Thinking conditionnel.
7. Uniformiser les états Working/Worked/Stopped et les cartes interactives.
8. Ajouter le suivi de scroll par phase autour de `LegendList`.
9. Vérifier parité live/replay, provider lock, handoff, longue timeline et UI.

## Preuves de complétion requises

- Tests unitaires de la projection couvrant toutes les phases et la priorité de
  l’activité active.
- Tests frontend prouvant zéro `Thinking` redondant et un seul résumé actif.
- Tests d’orchestration prouvant qu’un changement de provider crée un nouvel ID
  et préserve le thread source.
- Tests Node et Rust prouvant le rejet d’un provider différent sur un thread
  verrouillé et l’acceptation du handoff atomique.
- Tests live/replay avec événements hors ordre et IDs réutilisés entre turns.
- `npx tsc --noEmit`, `npx vite build`, suite frontend complète, suite sidecar,
  tests Rust workspace et vérifications galerie si touchée.
- Build release, arrêt exhaustif des anciens processus, relance de
  `Atelier.app`, vérification du process `tauri-app` et revue visible du chat.

Le goal n’est terminé que lorsque toutes ces preuves sont vertes et que la
revue finale ne trouve plus de divergence structurante avec ces invariants.

## Validation finale

- projection canonique, scroll, rendu des tours et orchestration : 445 tests
  frontend verts dans 57 fichiers;
- catalogue, handoff et verrouillage provider : 372 tests sidecar verts dans
  26 fichiers;
- workspace Rust entièrement vert, dont les tests de provider immuable et de
  handoff lié;
- `npx tsc --noEmit`, `npx vite build` et `git diff --check` verts;
- revue visuelle du vrai composant `Chat` sur les fixtures `running` et
  `completed` : un seul état actif, aucun `Thinking` redondant, aucun titre
  `Bash`, ordre vertical correct et aucune barre de défilement horizontale;
- build release et relance contrôlée de `Atelier.app` vérifiés après la dernière
  modification de code.
