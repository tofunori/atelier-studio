# Plan 033: Migrer le backend d'Atelier Studio vers Rust sans perdre aucune fonction

> **Executor instructions**: charger `/efficient-fable`. Ce plan est une migration
> à parité fonctionnelle stricte, pas une simplification et pas une refonte UI.
> L'interface React, les assets galerie et les éditeurs restent les sources du
> produit visible. Une fonction absente, différente, moins durable ou non prouvée
> bloque la bascule Rust et la suppression du backend historique.
>
> **Drift check**:
> `git diff --stat HEAD -- sidecar gallery src src-tauri rust plans package.json`
> puis `git status --short`. Ne jamais absorber, écraser ou restaurer les travaux
> en cours de Thierry. Avant chaque lot, réinventorier les routes, messages et
> fichiers persistés; ce plan décrit une cible, pas un snapshot éternel.

## Status

- **Priority**: P0
- **Effort**: XL, programme multi-lots
- **Risk**: HIGH
- **Category**: architecture backend / fiabilité runtime / distribution
- **Depends on**: stabilité du contrat galerie et du harnais agents
- **Reference implementation**: backend Rust de `/Users/tofunori/Documents/cmux-gallery/rust`
- **Non-goal**: réécrire React, CodeMirror, les viewers ou les éditeurs en Rust
- **Progress (2026-07-11)**: **R5 en cours** — R1–R4 commités ; Porte 5
  `atelier-harness` + `atelier-providers` (FakeProvider, send/interrupt).
  Claude/Codex réels = Portes 6–7. Node reste défaut.

## Décision produit non négociable

Atelier Studio doit conserver exactement les fonctions visibles et les
comportements utiles de sa galerie actuelle. Le backend Rust de cmux-gallery est
une fondation, pas une définition réductrice du produit.

Quand Atelier possède une fonction absente du backend Rust de référence, le Rust
doit évoluer jusqu'à rejoindre Atelier. La fonction Atelier ne doit pas être
supprimée, masquée, dégradée ou remplacée par une approximation.

La migration est réussie lorsque l'utilisateur ne remarque que des améliorations
de fonctionnement : démarrage plus déterministe, moins de processus, moins de
mémoire et absence de serveur Node zombie. Il ne doit perdre aucun geste, aucune
donnée, aucun raccourci, aucune intégration et aucun état persistant.

## Résultat architectural cible

```text
Interface React / TypeScript conservée
                 │
                 │ contrat JSON HTTP + WebSocket inchangé
                 ▼
       atelier-studio-server (Rust)
       ├── runtime, santé, auth, instance unique
       ├── threads, historique, journal, réglages
       ├── Codex, Claude, Grok, OpenCode, API
       ├── fichiers, Git, terminal, images, Zotero
       └── galerie Rust partagée avec cmux-gallery
                 │
                 ▼
       assets galerie et éditeurs existants
       HTML / CSS / JavaScript / CodeMirror 6
```

Le serveur Rust reste d'abord un processus distinct lancé par Tauri. Cette
frontière permet de redémarrer le backend, isoler les crashs fournisseurs,
tester le serveur hors de l'app et conserver le protocole WebSocket actuel.
L'intégrer au processus Tauri pourra être évalué après la migration, jamais
pendant la phase de parité.

## Fonctions galerie à préserver intégralement

L'inventaire final doit être généré depuis le code et les tests au début du lot,
mais la baseline comprend au minimum :

### Galerie et navigation

- scan initial et rescan manuel;
- watcher automatique par projet;
- projets multiples et serveur associé au projet actif;
- recherche, filtres, tris, dossiers, formats et archives;
- favoris, notes, tags, statuts de workflow et récents;
- cartes, miniatures, métadonnées et provenance;
- ouverture, suppression, export et révélation dans Finder;
- persistance complète après fermeture et relance.

### Viewers et éditeurs

- images, lightbox, zoom et annotation;
- SVG, édition du texte, styles, déplacement, zoom et pan;
- réapplication durable des modifications SVG après régénération;
- PDF, navigation, annotations, sélection et surlignage;
- Markdown lecture et édition;
- code, sauvegarde, modes de langage et fallback texte;
- LaTeX Studio, compilation, logs, SyncTeX, outline et diff;
- CodeMirror 6 et tous les raccourcis existants;
- notes et whiteboard;
- plein écran et comportements spécifiques à WebKit/Tauri.

### Diff, versions et Git

- historique des versions;
- diff fichier et diff cumulatif `tout`;
- sélection de versions, commentaires et audit;
- stage, unstage, commit, push, pull et revert;
- snapshots avant tour et annulation du dernier tour;
- restauration sans perte des modifications indépendantes.

### Recherche, Zotero et documents

- recherche Zotero, collections et favoris;
- bibliographie, pièces jointes et ouverture des PDF;
- digest et ajout de PDF au contexte;
- compilation LaTeX et export PNG;
- lint, diagnostics et navigation SyncTeX;
- génération et service des aperçus.

### Handoff vers les agents

- sélection d'un passage ou d'une zone;
- banque d'annotations;
- ajout fiable au chat Codex ou Claude;
- claim, acknowledgement, release et suppression;
- ancres, provenance, chemins absolus et contexte du projet;
- aucun faux succès visuel lorsque la livraison échoue.

## Comportements internes à préserver

La parité ne se limite pas aux boutons visibles. Elle couvre aussi :

- routes HTTP et codes de statut;
- messages WebSocket entrants et événements sortants;
- noms et formes des champs JSON;
- ordre observable des événements;
- sémantique des erreurs et des annulations;
- formats de fichiers persistés;
- compatibilité avec les projets et profils existants;
- écritures atomiques et récupération après crash;
- validation des chemins et protection contre les escapes;
- token local, CORS et contrôle des origines;
- règles d'instance unique, identité du bundle et santé;
- arrêt des processus enfants et absence d'orphelins;
- reconnexion frontend sans duplication de messages;
- comportement après interruption, relance et mise à jour.

## Workspace Rust cible

```text
rust/
├── Cargo.toml
└── crates/
    ├── atelier-protocol/    # types HTTP/WS et version du protocole
    ├── atelier-runtime/     # serveur, auth, lock, santé, lifecycle
    ├── atelier-store/       # threads, historique, journal, préférences
    ├── atelier-harness/     # processus agents, tours, interactions
    ├── atelier-providers/   # Codex, Claude, Grok, OpenCode, API
    ├── atelier-workspace/   # fichiers, Git, terminal, exports
    ├── atelier-library/     # Zotero et bibliographie
    ├── atelier-gallery/     # noyau partagé avec cmux-gallery
    └── atelier-server/      # binaire final lancé par Tauri
```

Les frontières peuvent être ajustées si le code réel le justifie. Elles ne
doivent pas devenir une collection de micro-crates artificielles. Le critère est
la séparation des contrats et des tests, pas le nombre de packages.

## Stratégie de partage avec cmux-gallery

Ne pas copier durablement le backend Rust de cmux-gallery dans Atelier puis
laisser les deux versions diverger.

Ordre recommandé :

1. identifier les crates réellement génériques dans cmux-gallery;
2. séparer les règles spécifiques au CLI cmux des règles de galerie;
3. publier ou référencer un noyau Rust partagé versionné;
4. faire consommer ce noyau par cmux-gallery et Atelier Studio;
5. ajouter les fonctions propres à Atelier derrière des modules explicites;
6. exécuter les contrats galerie contre les deux applications clientes.

Si l'extraction partagée bloque la progression, une copie temporaire est
tolérée uniquement avec un ticket et une date de réunification avant bascule.

## Porte 0 — Inventaire et contrat exécutable

**Objectif**: rendre mesurable la promesse « exactement les mêmes fonctions ».

### Travail

- [x] Inventorier toutes les routes de `gallery/server/` et du backend Rust de
  cmux-gallery.
- [ ] Inventorier tous les assets/pages et leurs appels réseau.
- [x] Inventorier chaque type de fichier d'état et sa version implicite.
- [x] Inventorier les événements `postMessage`, HTTP, SSE et WebSocket.
- [x] Construire une matrice `fonction → route → UI → persistance → test`.
- [x] Ajouter un identifiant stable à chaque capacité de la matrice.
- [x] Classer chaque ligne : identique, partielle, absente ou différente.
- [x] Interdire la bascule tant qu'une ligne requise n'est pas `PARITY`.

**Sortie R1**: `plans/033-parity-matrix.md` (matrice vivante ; assets/pages à affiner en Porte 2).

### Tests

- tests unitaires des fonctions pures;
- tests HTTP de contrat;
- tests de persistance avec fixtures existantes;
- tests Playwright des parcours visibles;
- captures dark/light aux tailles de référence;
- tests dans l'application Tauri buildée.

### Sortie obligatoire

- matrice exhaustive versionnée;
- corpus de fixtures reproductible;
- baseline vidéo ou captures des parcours critiques;
- aucune route inconnue ou fonction « à vérifier plus tard ».

## Porte 1 — Squelette serveur Rust compatible

**Objectif**: établir le transport sans modifier le produit.

- [x] Créer le workspace Cargo et les crates minimales.
- [x] Définir les enums sérialisés du protocole existant.
- [x] Servir `/health`, `/providers`, `/setup` et `/uistate`.
- [x] Ouvrir le WebSocket avec token local.
- [x] Répondre à `ping` par `pong` avec la forme actuelle.
- [x] Écrire `sidecar.pid` et `sidecar.lock` atomiquement.
- [x] Vérifier l'identité du binaire avant de réutiliser une instance.
- [x] Ajouter logs structurés sans secrets.
- [x] Ajouter arrêt gracieux et nettoyage des enfants.

Pendant cette porte, Node reste le backend par défaut. Un sélecteur temporaire
`ATELIER_BACKEND=node|rust` peut exister pour les tests; il doit être supprimé à
la fin du programme.

**Impl R1**: `rust/` (`atelier-protocol`, `atelier-runtime`, `atelier-server`),
sélecteur dans `src-tauri/src/sidecar.rs`. `/providers` = catalogue statique
(pas encore de probe bin) → statut `PARTIAL` jusqu'à Porte 5+.

## Porte 2 — Galerie Rust à parité complète

**Objectif**: supprimer le serveur galerie Node sans changer ses assets ni ses
fonctions.

- [x] Brancher les crates galerie de cmux-gallery (copie temporaire sous
  `rust/crates/atelier-core` + `atelier-gallery`).
- [x] Faire servir exactement les assets de `gallery/assets/` (`ATELIER_ASSETS_DIR`).
- [~] Porter chaque route absente identifiée à la porte 0 — base cmux (~70 routes) ;
  écarts Studio connus : `GET /findfile`, sémantique exacte `commitmsg` GET vs POST
  (voir matrice).
- [x] Conserver les structures de `.fig_state.json` et fichiers associés.
- [x] Conserver les règles de cache et de watcher.
- [x] Conserver les opérations d'annotations et de handoff (agent bridge inclus).
- [x] Conserver Git, diff, documents, Zotero et exports.
- [x] Modifier `src-tauri/src/atelier.rs` pour lancer le serveur Rust.
- [x] Conserver temporairement le démarrage Node comme comparaison contrôlée
  (`ATELIER_GALLERY_BACKEND=node` défaut).

### Gate de sortie

- [~] 100 % de la matrice galerie en `PARITY` — **pas encore** (défaut Node +
  écarts Studio mineurs) ;
- [x] http_smoke Rust (5) + parity Node de référence ;
- [ ] suites diff/E2E Playwright contre Rust ;
- [ ] inspection visuelle dans l'app buildée ;
- [ ] aucun `gallery/server/main.mjs` en production — **Node reste défaut** ;
- [ ] aucun processus galerie orphelin après vingt relances.

## Porte 3 — Persistance et état applicatif

**Objectif**: porter les domaines sans fournisseur avant le harnais complexe.

- [x] Threads, titres, projets et déplacements (`listThreads`/`rename`/`move`/`delete`/`upsertThread`).
- [~] Historique : journal harness materialize OK ; import sessions provider = Porte 5+.
- [x] Journal durable du harnais (append/materialize/delete, compactage tool_update).
- [x] Ledger lecture (`getLedger`) + append API store.
- [x] Highlights add/remove/list.
- [x] Réglages (`getSettings`/`saveSettings`) + `/uistate` (R1).
- [~] Goals : champs extra préservés dans threads.json ; API goalSet = Porte 5+.
- [x] Écritures atomiques (tmp+rename) ; journal append-only + tombstones.
- [x] Lecture directe des profils JSON existants (formats Node).

Ne pas imposer SQLite pendant cette migration. Une conversion de stockage est un
projet séparé; ici, Rust doit d'abord lire et écrire les formats existants.

**Impl**: `rust/crates/atelier-store` + `atelier-runtime/ws_router.rs`.

## Porte 4 — Workspace, Git, terminal et bibliothèque

- [x] Liste fichiers (`listFiles`) + slash commands (`listCommands`).
- [x] Images collées (`saveImage`/`listPasted`/`clearPasted`).
- [x] Git status/diff/stage/unstage/commit/push/pull/revert/ignore.
- [x] Undo dernier tour via `lastSnapshot` + restore (snapshot API store ok).
- [x] Terminal PTY open/input/resize/close + termData/termExit.
- [x] Zotero search/collections/fav/digest (+ pdf path).
- [x] `scanLocal` + `checkFrame` (loopback only).
- [x] Tests path escape git + list_files fallback.

Les binaires système comme `git`, `latexmk`, `synctex`, `sips` ou les CLI agents
peuvent continuer à être invoqués. « Backend Rust » signifie zéro runtime Node
pour le backend, pas la réimplémentation de tous les outils externes.

**Impl**: `rust/crates/atelier-workspace` + handlers dans `ws_router.rs`.
Gaps connus: `generateCommitMsg` (nécessite Claude), `zoteroAddPdf` (connector),
exportThread markdown, multi-client term fan-out temps réel (drain sur messages).

## Porte 5 — Moteur commun des fournisseurs

**Objectif**: remplacer la gestion Node des processus et événements sans perdre
la fidélité propre à chaque fournisseur.

- [x] Isolation par thread (HarnessManager + run map + cancel flag).
- [~] Lecture JSONL/JSON-RPC : cadre Provider prêt ; parsers réels Portes 6–7.
- [~] Backpressure : canal mpsc non borné pour events ; bornes mémoire à durcir.
- [x] Annulation (`interrupt` + AtomicBool probe).
- [x] Déduplication `eventId` dans le harnais.
- [x] Journal durable **avant** emit UI (dispatch order).
- [~] Interactions/permissions : kinds supportés ; pas encore de waiters UI.
- [x] Replay journal via `getHistory` + materialize (sans double eventId).
- [x] `providerStatus` / `status` / catalogue capacités (static + fake).
- [x] `FakeProvider` déterministe + test send end-to-end.

Le moteur commun normalise le transport, jamais les capacités. Les différences
Codex, Claude et Grok restent explicites et testables.

**Impl**: `atelier-harness`, `atelier-providers`, `runtime/send.rs`.

## Porte 6 — Claude

- [ ] Nouveau thread et reprise de session.
- [ ] Streaming texte et raisonnement exposé par le contrat actuel.
- [ ] `tool_use`, `tool_result` et erreurs.
- [ ] Permissions et interactions.
- [ ] Pièces jointes et contexte projet.
- [ ] Interrupt, crash, reprise et fermeture pendant un tour.
- [ ] Historique et limites d'usage.
- [ ] Parité avec tous les tests `claude_*` existants.

## Porte 7 — Codex

Porter dans cet ordre :

1. initialisation app-server et catalogue;
2. thread start/resume et texte en streaming;
3. commandes et sorties incrémentales;
4. changements de fichiers et patches;
5. approvals et `request_user_input`;
6. appels MCP et progression;
7. steering et interruption;
8. goals, compact, clear, fork et revert;
9. images et pièces jointes;
10. usage, statut et récupération après erreur.

Chaque notification JSON-RPC actuellement comprise par
`sidecar/providers/codex.mjs` doit avoir une fixture Rust. Les événements futurs
inconnus doivent être ignorés ou signalés selon le comportement actuel, jamais
faire tomber le serveur.

## Porte 8 — Grok, OpenCode, API et images

- [ ] Fournisseurs OpenAI-compatibles et registre configurable.
- [ ] Catalogue des modèles et clés protégées.
- [ ] Génération d'images et métadonnées.
- [ ] OpenCode : texte, raisonnement, outils, erreurs et reprise.
- [ ] Grok ACP : messages, plans, tools, interactions et fin de tour.
- [ ] Fallbacks réellement utilisés, sans conserver une branche morte par peur.
- [ ] Gating UI strictement fondé sur les capacités annoncées par Rust.

## Porte 9 — Routeur complet et comparaison contrôlée

- [ ] Porter tous les `case` du routeur Node.
- [ ] Comparer Node et Rust sur les requêtes strictement en lecture seule.
- [ ] Normaliser seulement PID, port, timestamp et ordre documenté comme libre.
- [ ] Ne jamais doubler une mutation, un envoi agent ou une action Git.
- [ ] Produire un rapport automatique des divergences.
- [ ] Atteindre zéro divergence inexpliquée sur le corpus complet.

Les doubles exécutions sont interdites pour `send`, sauvegarde, suppression,
génération d'image, Git mutable, permission et interaction.

## Porte 10 — Rust par défaut dans Tauri

- [ ] Faire lancer `atelier-studio-server` par `src-tauri/src/sidecar.rs`.
- [ ] Bundler le binaire Rust et ses assets au build.
- [ ] Lire le lock existant et vérifier token, santé et identité.
- [ ] Réutiliser uniquement une instance compatible et saine.
- [ ] Tuer uniquement une instance périmée identifiée avec certitude.
- [ ] Attendre la convergence sans boucle de spawn.
- [ ] Vérifier la compatibilité dev/build et plusieurs fenêtres.
- [ ] Vérifier macOS TCC/Gatekeeper dans le contexte de l'app réelle.
- [ ] Garder Node uniquement comme fallback explicitement activable pendant le
  soak final.

## Porte 11 — Soak et suppression de Node en production

### Soak minimal

- [ ] Deux semaines d'usage normal avec Rust par défaut.
- [ ] Vingt relances release successives sans orphelin.
- [ ] Plusieurs projets et galeries simultanés.
- [ ] Codex et Claude actifs simultanément.
- [ ] Interruption suivie immédiatement d'un nouveau tour.
- [ ] Crash forcé du backend puis reconnexion.
- [ ] Mise à jour de l'app avec ancien backend encore présent.
- [ ] Profil existant volumineux et historique long.
- [ ] Aucun défaut P0/P1 Rust ouvert.

### Retrait

- [ ] Supprimer `sidecar/` de la distribution.
- [ ] Supprimer `gallery/server/` de la distribution.
- [ ] Retirer le staging et le runtime Node.
- [ ] Retirer `ATELIER_BACKEND=node`.
- [ ] Ajouter un garde-fou CI interdisant un backend Node de production.
- [ ] Conserver Node/Vitest/Vite pour développer et tester le frontend.
- [ ] Documenter le diagnostic et la récupération Rust.

La suppression physique des sources historiques peut être différée dans un
commit séparé si leur présence facilite un dernier audit. Elles ne doivent plus
être exécutables ni embarquées en production.

## Matrice de livraison

| Livraison | Résultat observable | Backend Node requis |
|---|---|---:|
| R1 | Protocole et serveur Rust minimal | Oui |
| R2 | Galerie Atelier complète servie par Rust | Chat seulement |
| R3 | Persistance, fichiers, Git, terminal, Zotero | Oui |
| R4 | Moteur de fournisseurs | Oui |
| R5 | Claude via Rust | Oui |
| R6 | Codex via Rust | Oui |
| R7 | Grok, OpenCode, API et images via Rust | Fallback |
| R8 | Routeur complet, Rust par défaut | Fallback temporaire |
| R9 | Soak terminé, Node retiré de la production | Non |

## Validation obligatoire à chaque livraison

### Rust

```bash
cargo fmt --check --manifest-path rust/Cargo.toml
cargo clippy --manifest-path rust/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml --workspace --locked
```

### Atelier existant

```bash
npx tsc --noEmit
npx vite build
(cd sidecar && npx vitest run)
(cd gallery && node server/tests/parity.mjs)
(cd gallery && node server/tests/diff_suite.mjs)
npm run verify:e2e
```

Tant que Node existe comme référence, ses tests restent obligatoires. Quand il
est supprimé, chaque test de comportement doit avoir été déplacé vers une suite
Rust ou E2E équivalente; supprimer un test avec son implémentation est interdit.

### Résilience

- backend tué pendant un tour;
- WebSocket coupé puis reconnecté;
- deux démarrages simultanés;
- lock incomplet, PID mort et PID réutilisé;
- fichier JSON tronqué et restauration du dernier état valide;
- fournisseur absent ou version incompatible;
- sortie fournisseur non JSON ou message futur inconnu;
- terminal et enfants encore actifs à la fermeture;
- projet déplacé, supprimé ou non accessible;
- mise à jour du bundle avec ancienne instance vivante.

### App buildée

Après toute modification, suivre exactement `AGENTS.md` : vérifications, kill de
`tauri-app`, du sidecar et des serveurs galerie, build Tauri, relance et preuve
de convergence. Une validation navigateur seule ne prouve jamais la parité dans
WKWebView/Tauri.

## Conditions STOP

Arrêter le lot et rapporter le blocage si :

- une fonction Atelier doit être supprimée pour faciliter le port;
- une route ou un format persistant reste inconnu;
- une divergence Node/Rust est expliquée seulement par « suffisamment proche »;
- un test doit être retiré sans équivalent;
- un fichier utilisateur doit être migré sans rollback;
- la migration exige une refonte React ou éditeur hors scope;
- le backend Rust produit un faux succès de handoff ou de sauvegarde;
- l'app buildée ne converge pas ou laisse des processus orphelins;
- les changements utilisateur présents dans le worktree chevauchent le lot.

## Définition de terminé

Ce plan est `DONE` uniquement lorsque :

- [ ] la matrice fonctionnelle Atelier est à 100 % `PARITY`;
- [ ] tous les parcours galerie existants fonctionnent dans l'app buildée;
- [ ] React, CodeMirror et les assets éditeurs gardent leur comportement;
- [ ] tous les fournisseurs passent par Rust;
- [ ] tous les profils et projets existants restent lisibles;
- [ ] aucun backend Node n'est embarqué ou lancé en production;
- [ ] aucun test de contrat historique n'a été perdu;
- [ ] le soak ne révèle aucun défaut P0/P1;
- [ ] le protocole de relance ne trouve aucun zombie;
- [ ] la documentation d'installation, diagnostic et récupération est à jour.

Une migration compilée mais non prouvée dans l'application n'est pas terminée.
Une migration rapide qui retire une fonction n'est pas une réussite.

## Estimation indicative

- portes 0–2, galerie Rust complète : 4 à 7 semaines;
- portes 3–5, état et moteur commun : 4 à 7 semaines;
- Claude : 2 à 3 semaines;
- Codex : 3 à 5 semaines;
- Grok, OpenCode, API et images : 2 à 4 semaines;
- intégration Tauri, soak et retrait : 3 à 5 semaines.

Ordre de grandeur pour une personne : quatre à six mois pour une migration
solide à fonctionnalité constante. Le programme livre néanmoins un bénéfice dès
R2, lorsque la galerie Atelier complète tourne déjà sur Rust.
