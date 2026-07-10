# Implementation Plans

Générés par le skill improve le 2026-07-07 (commit `fe78ede`), audit ciblé : **fiabilité du harnais Claude Agent SDK** (chaîne SDK → `sidecar/providers/claude.mjs` → `router.mjs` → WS → `src/App.tsx` → historique). Session non interactive : plans écrits pour le top 3 par levier (défaut du skill).

Chaque exécuteur : lire le plan en entier avant de commencer et respecter ses
conditions STOP. Lorsqu'un réviseur orchestre l'exécution, **le réviseur seul**
met à jour la ligne de statut et le commit accepté dans cet index.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Isoler les sessions Quick Ask (qaId, permissions) | P1 | S | — | DONE (branche `advisor/001-quickask-session-isolation`, non mergée) |
| 002 | Événement done/error garanti en fin de tour Claude | P1 | M | — | DONE (branche `advisor/002-turn-lifecycle-hardening`, non mergée) |
| 003 | Fidélité de l'historique rechargé | P2 | S | — | DONE (branche `advisor/003-history-reload-fidelity`, non mergée) |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (raison en une ligne) | REJECTED (justification en une ligne)

## Dependency notes

- Aucune dépendance entre plans ; 001 et 003 sont indépendants et petits, 002 touche la boucle centrale — fait seul sur sa branche.
- 001 et 002 modifient tous deux `sidecar/router.mjs` mais dans des cases différentes (`quickAsk` ~ligne 711 vs `send` ~ligne 833) : pas de conflit entre les deux branches.

## Exécution (2026-07-07) — 3 exécuteurs sonnet en worktrees isolés, révisés

- **Verdict : les 3 APPROUVÉS.** Tests re-run par le réviseur dans chaque worktree (48 / 47 / 52 verts), scope propre (seuls les fichiers in-scope), diffs conformes aux plans.
- **Base des worktrees = `77a6735`** (≈13 commits derrière le main courant `8b55b0c` — Thierry a avancé main pendant la session). Zéro drift sur `claude.mjs` et `history.mjs` ; le drift de `router.mjs` (garde-fou UUID, case `setupStatus`) est dans des régions disjointes des patches. **Simulation `git merge-tree` : les 3 branches se mergent proprement dans `8b55b0c`.**
- **Branches (non mergées, décision de merge = Thierry)** : `advisor/001-quickask-session-isolation` (315e686), `advisor/002-turn-lifecycle-hardening` (1646f5b), `advisor/003-history-reload-fidelity` (8a1f813).
- **Réserve sur 002** : le test `claude_lifecycle.test.mjs` #2 (rejet onEvent) valide le *motif* de garde répliqué dans un mock, pas le vrai helper `emit` de `claude.mjs` — celui-ci repose sur la revue de code, pas sur un test exécutant (le vrai `emit` exigerait de mocker le SDK). Test #1 (throw synchrone) valide bien le filet router. Suivi possible : extraire `emit`/`sawTerminal` en helper pur testable.

## Findings considered and rejected / deferred

- **Doublon d'affichage thinking+texte (soupçon)** : rejeté — le CLI émet les messages assistant bloc par bloc en stream-json, donc le remplacement « dernier élément streaming » de `App.tsx:478-517` tient ; pas de duplication observée dans le mécanisme réel.
- **Attribution des tours en steering** (`router.mjs:846-889`) : un message steer (`priority:"now"`) remplace `onEvent`/`turn` en plein tour — snapshot git (`lastSnapshot`) écrasé mi-tour, outils répartis entre deux objets `turn`, auto-review/ledger du tour composite approximatifs. Réel mais impact modéré et fix demandant des choix de design (fusionner les turns ? snapshot seulement au repos ?) — différé, à traiter si l'auto-review devient un signal de confiance central.
- **`turn.lastText` ne garde que le dernier bloc texte** (`router.mjs:865`) : l'auto-review ne voit pas les textes intermédiaires d'un tour multi-blocs. Mineur, lié au point précédent — différé.
- **Statut « done » pendant un 2e tour enchaîné** (message `priority:"next"`) : cosmétique (spinner absent pendant le tour suivant), différé.
- **Sécurité locale du sidecar** (hors focus de l'audit) : CORS `*`, token facultatif en dev (`index.mjs:60-66`), token WS en query string. Surface loopback-only (`127.0.0.1`), risque local faible — noté, non planifié ; à revoir si le port devient accessible hors machine.

## Not audited

Audit ciblé harnais Claude uniquement : les providers codex/grok/opencode, la galerie (`gallery/`), le front hors chemin événements/transcript, le code Rust Tauri (`src-tauri/`) et les catégories perf/deps/docs n'ont pas été audités.

---

## Feuille de route Atelier pour Fable 5 — 2026-07-09

Ce second lot a été préparé au commit `8a5d0ca` après l'audit transversal de
l'application. Il ne remplace pas les plans 001–003.

**Règle d'exécution : un seul plan à la fois.** Fable 5 implémente le plan,
produit un diff et les sorties de tests. Codex effectue ensuite une revue
indépendante, rebâtit l'application et teste le comportement réel avant que le
plan suivant ne commence. Le prompt de lancement est dans
`plans/FABLE5_EXECUTION.md`.

### Execution order & status

Le parcours frontend 014–025 a été ajouté au commit de référence `8baafca`,
puis le plan 025 de parité du harnais au commit `47cedb8`.
L'ordre numérique historique est conservé, mais 013 s'exécute après 022 selon
ses dépendances. Les plans 011 et 012 restent comme traces et ne doivent plus
être lancés.

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 004 | Rendre le dépôt reproductible depuis l'index Git | P1 | S | — | DONE (Fable 5, 2026-07-09 ; revue Codex sautée sur instruction de Thierry ; commit auto `c6870ad`) |
| 005 | Fermer l'accès navigateur inter-origines à la galerie | P1 | M | 004 | DONE (Fable 5, 2026-07-09 ; ajout assumé : allowlist origines webview app `tauri://localhost`/`http://tauri.localhost`/`http://localhost:1420` pour préserver le POST /rescan du générateur — non forgeables par un navigateur) |
| 006 | Rendre les snapshots Git durables et l'annulation non destructive | P1 | M | 004 | DONE (Fable 5, 2026-07-09 ; refs/atelier/snapshots/<sha>, restore sans clean + refus atomique, gitUndoLastTurnError → note UI) |
| 007 | Restaurer le workflow scientifique des figures | P1 | M | 005 | DONE (Fable 5, 2026-07-09 ; workflow 4 états + chip Status + menu carte + chip Recent restaurés, 32/32 Python ; E2E Playwright différé au plan 008 — runner non installé, conformément au STOP du plan) |
| 008 | Créer une validation unique et une CI de pull request | P1 | M | 004–007 | DONE (Fable 5, 2026-07-09 ; `npm run verify` 6 couches en ~30 s, E2E Playwright 5/5 réparé [drift préexistant], ci.yml + release durcie + README ; scope assumé : réparation de gallery/tests/e2e/core.spec.js) |
| 009 | Fiabiliser reconnexion, persistance UI et effets React | P2 | M | 008 | DONE (Fable 5, 2026-07-09 ; connectSidecar annulable + SidecarInfo partagée + flusher uistate testable + AtelierPane useEffect ; 15 tests frontend, smoke reconnexion réelle OK ; StrictMode dev à contrôler par Thierry) |
| 010 | Restaurer la fidélité historique et les métriques d'usage | P2 | M | 008 | DONE (Fable 5, 2026-07-09 ; ledger.getAll réparé [readFileSync fantôme], getHistory routé par provider + history() API/OpenCode, transcripts OpenCode persistés [sans rétro-import], 215 tests sidecar ; smoke réel : usage exact + historique API après restart) |
| 011 | Poser des tests de caractérisation puis découper App/Chat | P2 | L | 009–010 | REJECTED (remplacé par 015, qui lie caractérisation et architecture UI cible) |
| 012 | Réduire le coût de chargement frontend et des fontes | P2 | M | 011 | REJECTED (remplacé par 022 après la refonte UI incrémentale) |
| 014 | Verrouiller le blueprint produit et visuel d'Atelier | P1 | M | 008 | IN PROGRESS (correction ciblée demandée par Thierry le 2026-07-09 : portée 015–024, motion plafonné 150 ms, cibles interactives, audit reproductibilité Git — DONE attend la revue Codex) |
| 015 | Caractériser le frontend et établir ses frontières UI | P1 | L | 009–010, 014 | IN PROGRESS — corrections de revue Codex appliquées (2026-07-09) : commit local 47cedb8 (reproductibilité prouvée par git archive+tsc+build), ChatTimeline réel + bundles composer par domaine, listener autoreview unique + test, useAtelierServer durci (stale A→B, vrai restart sonde, démontage), write-through extrait avec exception bootstrap documentée, NUL→u0000 échappé ; 59 tests frontend — nouvelle revue Codex attendue |
| 016 | Installer les tokens et primitives UI partagés | P1 | M | 014–015 | IN PROGRESS — implémenté (2026-07-09) : tokens.css (alias sémantiques + Quiet Instrument 120/140/150 + reduced-motion centralisé), primitives.css, 12 primitives `src/components/ui/` (2 079 lignes avec tests), 47 tests RTL + contrat CSS exécutable, banc #uibench (chunk lazy), 2 pilotes migrés (tb-seg→SegmentedControl 26×22 parité, empty-card→EmptyState+Button), verify 6 couches OK, app buildée relancée + captures docs/ui/primitives/ ; sorties d'overlays instantanées (entrées animées ≤150 ms) documentées ; DONE attend la revue Codex |
| 024 | Transformer le panneau Projets en Research Navigator du projet actif | P1 | M | 014–016 | TODO (Option A approuvée par Thierry, 2026-07-09) |
| 017 | Construire le Research Home | P1 | M | 024 | DONE (Fable 5, 2026-07-09, sur ordre de Thierry avant 024 ; revue Codex reportée en fin de série sur instruction. Modèle pur deriveResearchHomeModel [10 tests] + ResearchHome [10 tests RTL] via primitives 016, monté dans la branche vide de ChatTimeline [s'efface dès qu'un thread est actif], données App uniquement [threads/events/workingSince/usage/recentFiles/wsReady/appBanner], libellés = records, artefacts via openFileTab [modèle tabs Atelier], une action primaire ; banc #homebench + 8 captures docs/ui/home/ ; verify 6 couches OK, app buildée relancée, accueil vérifié sur données réelles. Vérificateur indépendant : 5 écarts corrigés [ordre 800px par display:contents+order, état Chargement via tri-état sidecar connecting/ready/disconnected + squelette, dédup Continuer/À traiter, filtrage artefacts par files DANS le modèle, i18n maps exhaustives] — 130 tests frontend) |
| 018 | Clarifier la hiérarchie du workspace et le contexte actif | P1 | M | 016–017 | DONE (Fable 5, 2026-07-09, orchestration ultracode : 5 agents d'implémentation parallèles + panel adversarial 3 lentilles [31 constats, ~15 corrigés]. presentStatus unique [17 tests, done=ton neutre], ChatHeader/GalleryHeader/DocumentHeader sur SurfaceHeader [3 surfaces pilotes], ContextInspector sur InspectorPanel [Escape capture+retour focus onglet source, tiroir+scrim <900px, transfert pending→added sans éjection de focus], ContextShelf hybride [ContextChip pour les références simples, markup riche conservé, suppressions nommées], refresh galerie TopBar→GalleryHeader [9→8 actions], inventaire docs/ui/018-actions-inventory.md, banc #wsbench + captures docs/ui/workspace/, 177 tests frontend, verify+tauri build OK, app relancée saine. Diagnostic annexe : boucle d'entre-tuerie sidecar au boot post-build [préexistante, hors périmètre — chip de tâche créée]. Revue Codex reportée en fin de série) |
| 019 | Simplifier la galerie et ajouter l'inspecteur scientifique | P1 | L | 016, 018 | DONE (Fable 5, 2026-07-09, 3 passes commitées séparément. Barre de commande unique [recherche · Filters(N) · tri · densité · ⋯] + popover 6 groupes (contrôles historiques relocalisés, handlers intacts) + chips actives supprimables ; clic=sélection (aria-selected), dblclick/Enter/View=ouvrir ; inspecteur scientifique (Preview à la sélection, Identity, Workflow 4 états réels draft/candidate/final/rejected, Provenance via /findscript sinon « Not recorded », Organization, Actions avec add-to-chat idempotent) ; Escape en cascade ; clavier grille ; états vides/erreur inline ; tiroir+scrim ≤800px. E2E 12/12 (7 nouveaux scénarios), unit 32, diff 78, parité OK, verify 6 couches, bundle restagé, app relancée. NOTE : le plan nommait le workflow Draft→Review→Approved→Published — états réels préservés conformément au contrat. Bonus : identité de signature stable « Atelier Dev Signing » (fin des prompts Documents à chaque rebuild — avance sur 013). Revue Codex en fin de série) |
| 025 | Porter le harnais agentique au niveau Claude/Codex | P0 | XL | 008–010, 015–016, 018 | DONE (accepted `9a7202b`, revue Codex + correctifs, 2026-07-10) |
| 020 | Recomposer les tours de chat et le composer | P1 | L | 015–016, 018, 025 | TODO |
| 021 | Finaliser Settings, accessibilité, responsive et QA visuelle | P1 | L | 017–020 | TODO |
| 023 | Appliquer une direction artistique et une finition cosmétique haut de gamme | P1 | M | 014, 021 | TODO |
| 022 | Réduire le coût de chargement du frontend final | P2 | M | 023 | TODO |
| 013 | Préparer une distribution partageable sur Mac propre | P3 | L | 008, 022 | TODO |

### Dependency notes

- 004 passe en premier : `sidecar/index.mjs` importe aujourd'hui un module absent
  de l'index Git.
- 005 précède 007 parce que les deux touchent la galerie : frontière HTTP
  d'abord, workflow ensuite.
- 008 attend que 004–007 soient verts : la CI ne doit pas institutionnaliser une
  suite rouge.
- 009 et 010 sont indépendants après 008, mais tout fichier partagé est intégré
  et revu séquentiellement.
- 014 est un point de décision produit. Aucun code UI ne commence avant
  l'approbation des quatre états de référence et de la hiérarchie visuelle.
- 015 absorbe 011 : la caractérisation précède toujours l'extraction, mais les
  frontières sont choisies pour soutenir les surfaces prévues par 017–020.
- 016 précède toutes les surfaces afin d'éviter que chaque page invente ses
  propres boutons, focus, menus, espacements et états.
- Quiet Instrument est le contrat motion global approuvé : 016 installe ses
  tokens/primitives, 024 l'applique au Research Navigator et 023 audite toute
  l'app. Aucun plan motion séparé ni animation locale improvisée.
- 024 applique l'Option A approuvée : le rail/topbar sélectionnent globalement
  le projet et le panneau Chats devient le Research Navigator du seul contexte
  actif. Il précède 017 afin que le Research Home et le panneau partagent le
  même vocabulaire Projet/Continuer/Épinglés.
- 017–019 sont des lots produit indépendamment vérifiables. Ils conservent le
  shell VS Code-like déjà validé : top bar, rail 48 px, panneaux dockés.
- 025 attend 016 et 018 pour ne pas entrer en conflit avec les primitives et la
  hiérarchie du workspace, puis passe avant 020 : il rend les tours, outils,
  permissions, interactions et historiques attribuables et fidèles. 020
  consomme ensuite ce contrat pour la
  hiérarchie visuelle; il ne doit plus inventer de données depuis le texte ou
  modifier les providers.
- 021 est la passe de cohérence transverse; elle ne doit pas devenir une seconde
  refonte cachée.
- 023 applique la direction cosmétique approuvée après stabilisation des surfaces.
  Elle polit tokens, profondeur, typographie, iconographie et rythme sans changer
  la structure produit. La direction A — Precision Native est recommandée.
- 022 absorbe 012 et mesure le produit final après la finition cosmétique, afin
  d'inclure ses assets et styles dans la vraie baseline.
- 013 commence par une décision de distribution. Aucun packaging irréversible
  avant validation humaine.

### Définition globale de DONE

Un plan n'est DONE que si son test ciblé passe; `npx tsc --noEmit`,
`npx vite build` et `(cd sidecar && npx vitest run)` passent; les tests galerie
obligatoires passent dès que `gallery/` est touché; le protocole de `AGENTS.md`
a rebâti et relancé l'app; le comportement est contrôlé dans l'app buildée;
aucun fichier hors scope n'est modifié; aucun push n'est fait sans demande.

### Findings considered and deferred

- **Token HTTP sur toutes les ressources galerie** : différé après 005. Les
  viewers utilisent de nombreux chemins absolus `/...`; un token de chemin ou
  d'en-tête sans couche URL commune les casserait. 005 ferme d'abord le scénario
  navigateur démontré avec origine stricte et suppression de CORS `*`.
- **Réécriture visuelle générale** : rejetée. Le nouveau parcours 014–024 est
  incrémental et conserve l'identité, le shell et les contrats existants. Il
  améliore la hiérarchie, les états, le contexte scientifique et la cohérence
  des interactions sans remplacer l'application par un nouveau concept.
- **Nouveaux providers** : différés tant que les historiques existants ne sont
  pas tous fidèles.

### Not re-audited for this plan set

Les analyses scientifiques exécutées par les agents, le contenu Zotero et les
CLIs tiers ne sont pas audités ici. Le plan 013 n'est pas un audit juridique des
licences ni une promesse de notarisation réussie.

---

## Diff éditeur et migration complète CM6 — 2026-07-10

Ce lot a été planifié au commit `9f7341e`. Son contrat produit prioritaire est
immuable : **une action complète d'agent, une sauvegarde ou un rechargement =
une intervention**, quel que soit le nombre de mots ou de zones modifiées. Les
zones internes restent surlignées pour expliquer le changement, mais ne sont
jamais comptées comme des interventions séparées.

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 026 | Verrouiller le contrat du diff en navigateur | P0 | M | — | TODO |
| 027 | Enregistrer des interventions explicites | P0 | L | 026 | TODO |
| 028 | Rendre restauration et persistance durables | P0 | L | 027 | TODO |
| 029 | Rendre les gros diffs non bloquants | P1 | M | 028 | TODO |
| 030 | Rendre CM6 reproductible et compatible diff | P1 | L | 029 | TODO |
| 031 | Migrer les trois surfaces vers CM6 avec fallback | P1 | L | 030 | TODO |
| 032 | Retirer CM5 après observation et accord humain | P2 | M | 031 + accord | TODO |

Quand un plan devient DONE, le réviseur remplace son statut par
`DONE (accepted <sha>)`. Le worktree du plan suivant doit être créé depuis ce
commit accepté; partir de `9f7341e` seul est interdit pour les plans dépendants.

### Dependency notes

- 026 précède toute refonte afin qu'un exécuteur ne puisse pas réintroduire un
  diff par mot.
- 027 corrige le modèle de données avant 028 : persister durablement le modèle
  actuel figerait ses ambiguïtés.
- 029 vient après la correction fonctionnelle : le Worker ne doit pas déplacer
  la sémantique du diff.
- 030 prouve le diff complet sous CM6 avant de toucher `code_editor.html` et
  `md_viewer.html`.
- 031 garde CM5 comme rollback pendant l'observation réelle.
- 032 ne peut commencer sans approbation explicite de Thierry ; aucun agent ou
  test automatisé ne peut satisfaire cette porte à sa place.

### Delegation and review protocol

- Un seul plan est confié à un exécuteur à la fois, dans une branche/worktree
  isolé après drift check. Pour 027-032, le parent du worktree est
  obligatoirement le commit `accepted <sha>` du plan précédent.
- Le plan complet est inclus dans le prompt de l'exécuteur ; il ne reçoit pas
  les décisions d'architecture à réinventer.
- Codex relit chaque hunk, vérifie le scope, relance tous les done criteria et
  audite les nouvelles assertions avant verdict APPROVE/REVISE/BLOCK.
- Maximum deux cycles de correction par exécuteur. La fusion dans la branche
  utilisateur reste une décision de Thierry.

### Findings considered and rejected

- **Un diff/version par mot** : rejeté explicitement. Cela détruit la lisibilité
  des passages d'agent et contredit le contrat d'intervention.
- **Basculer CM6 immédiatement pour réparer le diff** : rejeté. Le modèle du
  diff doit être corrigé indépendamment, puis prouvé sur CM5 et CM6.
- **Supprimer CM5 dès que les tests CM6 passent** : rejeté. Le fallback reste
  requis jusqu'à l'acceptation sur du travail réel dans l'app buildée.
