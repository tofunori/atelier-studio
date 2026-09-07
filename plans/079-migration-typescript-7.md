# Migration vers TypeScript 7

## Objectif et périmètre

Migrer la vérification des types des cinq projets TypeScript vers la version
stable 7.0.2 : interface principale, galerie, mobile web, protocole partagé et
site. Conserver une dépendance de compatibilité explicite pour les outils qui
requièrent l'ancienne API. Rust et Swift ne sont pas concernés.

Demande du 6 septembre 2026 : réalisation par des sous-agents Luna, raisonnement
maximal, avec revue et validation intégrée par l'agent principal.

## État initial vérifié

- Le checkout possède de nombreux fichiers non suivis appartenant au travail
  existant. Les préserver ; aucun nettoyage global, commit ou push implicite.
- TS 7.0.2 a été installé dans un répertoire temporaire pour l'audit.
- La galerie et le site passent directement le contrôle des types.
- L'interface et le mobile passent après retrait de `baseUrl`, déclaration
  explicite des types Node/Vite et, pour l'interface, du module de police.
- Le protocole a 45 diagnostics identiques sous TS 5.8 et TS 7. L'autorisation
  des imports `.ts` en élimine 32 ; les autres doivent être corrigés proprement.
- Next.js utilise l'ancienne API TypeScript. Un simple remplacement du paquet
  casserait l'intégration : vérifier une coexistence explicite.
- L'audit ne constitue pas une validation du build ou de l'application.

## Répartition et séquence

### A — Interface principale (Luna max)

Propriété : `package.json`, `package-lock.json`, `tsconfig*.json`, déclarations
minimales sous `src/` nécessaires à la migration.

1. Vérifier les dépendances utilisant l'API TypeScript (notamment les outils de
   diagnostic) et choisir une installation TS 7 seule ou avec compatibilité.
2. Épingler le compilateur natif stable et synchroniser le lockfile.
3. Adapter les configurations sans désactiver les contrôles de types.
4. Vérifier les commandes `typecheck`, `build`, les configurations Vite et les
   tests frontend. Ne pas construire ni relancer l'app : réservé au reviewer.
5. Rapporter les changements, commandes, résultats et limites.

### B — Mobile, galerie et protocole (Luna max)

Propriété : `mobile/`, sources `gallery/`, `packages/atelier-protocol/`.

1. Lire les instructions locales de galerie ; préserver ses sources existantes.
2. Migrer les paquets et configurations et synchroniser leurs lockfiles.
3. Corriger les erreurs préexistantes du protocole au minimum nécessaire, avec
   types précis et tests significatifs ; ne pas masquer les erreurs par `any`.
4. Exécuter les contrôles de types de ces trois projets, les tests du protocole,
   les tests et le build mobile, puis les tests pertinents de galerie dont
   `parity.mjs` et `diff_suite.mjs`.
5. Ne pas modifier `src-tauri/gallery-dist/` ni lancer de build Tauri.

### C — Site et ancienne API (Luna max)

Propriété : `website/` uniquement.

1. Migrer la commande explicite de vérification des types vers TS 7.
2. Maintenir Next.js et ESLint fonctionnels avec une dépendance de compatibilité
   si nécessaire ; ne pas contourner les contrôles du build.
3. Mettre à jour les dépendances et lockfiles au strict nécessaire.
4. Exécuter le contrôle des types, le build, les tests du site et le lint ;
   distinguer les problèmes préexistants de ceux introduits.

### D — Revue de l'agent principal

1. Examiner chaque diff indépendamment de l'explication des auteurs : portée,
   typage, API anciennes, lockfiles, scripts et couverture réelle.
2. Demander et vérifier les corrections nécessaires aux agents responsables.
3. Vérifier la version exécutée par les commandes de chaque projet.
4. Effectuer les contrôles intégrés et appliquer intégralement le protocole
   `docs/agent-reference/atelier-runtime.md` : typecheck, Vite, sidecar, galerie,
   arrêt des processus, `npm run tauri:build:app`, inspection du journal,
   relance du `.app` du checkout et vérification du chemin du processus.
5. Inspecter l'app en fonctionnement et vérifier les parcours accessibles.
6. Mettre ce plan à jour avec les résultats, limites et exceptions de
   compatibilité. Donner un bilan distinguant migration et validation.

## Critères d'acceptation

- Les contrôles explicites des cinq projets exécutent TS 7.0.2 et passent.
- Les scripts de build et les outils qui utilisent l'ancienne API fonctionnent.
- Aucun affaiblissement global du typage ni suppression de tests pour passer.
- Les tests pertinents passent, ou tout échec préexistant est documenté et
  évalué avant conclusion ; aucun échec nouveau inexpliqué.
- Le `.app` du checkout est construit, relancé et contrôlé selon le protocole.
- Aucun fichier de travail utilisateur n'est supprimé ou réinitialisé.

## Résultats

### Migration et revue

- Les cinq exécutables locaux `tsc --version` retournent `Version 7.0.2`.
- `npm run typecheck:all` contrôle l'interface, la configuration Vite, la
  galerie, le mobile et le protocole ; `verify` l'appelle désormais.
- Le site exécute `next typegen` puis TS 7 avant chaque build. Next.js et ESLint
  utilisent l'alias explicite `typescript` vers `@typescript/typescript6@6.0.2`;
  le compilateur natif est installé sous l'alias `@typescript/native`.
- React Doctor conserve sa dépendance imbriquée TS 5.9.3. Une installation
  propre et la résolution de son API ont été vérifiées.
- Le protocole conserve son comportement : les modifications portent sur sa
  configuration, les déclarations WebSocket et le typage de tests existants.
  La revue a demandé des assertions qui échouent sur une réponse `history`
  mal formée, au lieu de branches pouvant sauter silencieusement les assertions.
- `manualChunks(id: string)` rend la configuration Vite vérifiable séparément.
- Aucun changement global à `strict`, aucun contournement des contrôles Next.

### Contrôles exécutés

| Contrôle | Résultat |
| --- | --- |
| Types regroupés, y compris configuration Vite | Réussite |
| Types du site sous TS 7 | Réussite |
| Installation propre racine `npm ci --ignore-scripts --no-audit --no-fund` | Réussite |
| Cohérence `npm ci --dry-run`, galerie/mobile/protocole/site | Réussite |
| Interface `npm run test:frontend` | 175 fichiers, 1 764 tests réussis |
| Sidecar `npm --prefix sidecar test` | 40 fichiers, 654 tests réussis |
| Protocole | 49 tests réussis |
| Mobile | 103 tests réussis, build réussi |
| Galerie Python / serveur | 37 / 74 tests réussis |
| Galerie parity / diff | OK / 207 tests réussis |
| Site build / tests / lint | Réussite / 3 tests réussis / réussite |
| React Doctor | Sortie 0, 9 diagnostics consultatifs existants ou concurrents |
| Build web principal et `npm run build` | Réussite |
| Revue indépendante Luna max | Terminée, aucun constat actionnable dans le périmètre TS |
| Build `.app`, relance et inspection UI | Réussite ; processus du checkout confirmé |

Les tests mobiles ont été exécutés avec
`NODE_OPTIONS=--no-experimental-webstorage npm test -- --testTimeout=15000` :
Node 26 expose un `localStorage` expérimental sans stockage configuré et les
délais standards ont échoué dans cette exécution parallèle. Cette réserve
concerne l'environnement de test local ; la commande standard sans options
n'a pas été validée verte. La CI utilise Node 22.

Les avertissements Vite de taille de chunks et d'import dynamique/statique
persistent. Le présent travail n'est pas une nouvelle validation exhaustive
des parcours E2E, des tests Rust ou de l'application iOS native.

### Travail concurrent et traçabilité

La base de revue est `f2b5fd81`. Un mécanisme extérieur a créé les auto-commits
`072f2e4e` et `a95fad2e` pendant la migration et y a inclus des fichiers déjà
modifiés. Aucun agent de cette migration n'a demandé de commit ou de push.
Des modifications Bibliothèque ont également été apportées en parallèle
(`b689ef56`) ; elles restent distinctes du périmètre TS 7.

Les bundles générés initiaux ont été sauvegardés sous
`/private/tmp/atelier-ts7-prebuild/` avant staging. Les journaux de validation
du reviewer sont sous `/private/tmp/atelier-ts7-*.log` et l'audit initial sous
`/private/tmp/atelier-ts7-audit-20260906/`.

Le premier build a été refusé normalement par le verrou : un autre build
était actif. Aucun contournement ni arrêt de ce build ; une nouvelle tentative
a été lancée après sa fin.

Le build final `npm run tauri:build:app` a terminé avec succès. La recherche
`grep -iE error` dans son journal est vide. Atelier a été relancé depuis
`src-tauri/target/release/bundle/macos/Atelier.app` et le chemin du processus
`tauri-app` a été confirmé. Le backend répond `HTTP 200`, `ok: true` à `/health`.
L'inspection UI a vérifié l'ouverture et le retour des réglages, le chargement
de la galerie et l'affichage d'un PDF via la surface Bibliothèque. Aucun
message n'a été envoyé à un modèle pour cette validation. La galerie a été
rétablie à la fin du contrôle.
