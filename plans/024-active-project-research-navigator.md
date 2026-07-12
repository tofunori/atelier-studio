# Plan 024: Transformer le panneau Projets en Research Navigator du projet actif

> **Executor instructions**: charger `/efficient-fable`, puis `/design`. Lire le
> blueprint 014 approuvé, le résultat architectural de 015 et les primitives de
> 016. Implémenter exactement l'option A approuvée par Thierry le 2026-07-09 :
> le rail/topbar sélectionnent le projet global; le panneau Chats affiche
> uniquement le contexte et les conversations du projet actif. Préserver toutes
> les actions existantes, même lorsqu'elles changent de destination visuelle.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/components/Sidebar.tsx src/components/sidebar src/App.tsx src/App.css src/lib/i18n.ts src/components/icons.tsx src/test`
> puis `git status --short --` sur ces chemins. Si 015/016 ne sont pas DONE, si
> `Sidebar.tsx` a été déplacé sans plan de compatibilité, ou si des modifications
> non terminées touchent ces fichiers, STOP et réconcilier avant d'écrire.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 014, 015 et 016
- **Category**: product navigation / frontend design
- **Planned at**: commit `8baafca`, 2026-07-09
- **Decision**: Option A approuvée explicitement par Thierry le 2026-07-09

## Why this matters

Le rail affiche déjà les projets et les surfaces, tandis que la top bar possède
un sélecteur de projet. Le panneau Chats répète pourtant les trois actions
globales, les favoris tous projets, tous les projets et leurs threads, puis une
seconde section de chats sans projet. Cette double navigation rend le projet
actif difficile à percevoir et gaspille la largeur avec des niveaux d'indentation.

Après ce plan, le panneau répond à une seule question : **« Dans ce projet, quel
travail reprendre et quelles conversations ouvrir? »** Le changement de projet
reste global dans le rail/topbar. Le panneau devient une surface stable,
scannable et propre à la recherche en cours.

## Visual thesis

**Research Navigator, Precision Native** : panneau graphite compact, sans arbre
de fichiers générique; un header de projet clair, une action primaire, puis une
chronologie calme des conversations. La personnalité vient de la provenance du
projet et de l'orange utilisé comme trace de sélection, pas de cartes ou
décorations.

## Content plan

Projet actif → action Nouveau chat/recherche → Continuer → Épinglés →
Conversations groupées par récence. Si aucun projet n'est actif, le même panneau
devient explicitement « Chats sans projet » et conserve ce workflow historique.

## Interaction thesis

- sélectionner un projet dans le rail/topbar remplace le contenu du panneau sans
  animation de page, avec un cross-fade 120–140 ms maximum;
- sélectionner un thread utilise fond + point orange de 4 px;
- menus/header apparaissent par opacity/translate 2 px, sans mouvement de layout;
- press discret `scale(.98)` seulement sur boutons, reduced motion respecté;
- la colonne de fin de ligne réserve en permanence 48 px : heure et actions
  partagent exactement ce slot et se cross-fadent au hover ou `focus-within`.
  Aucun `display:none`, changement de margin ou déplacement du titre.

## Current state

### Files and roles

- `src/components/Sidebar.tsx` — rendu du panneau, sections, actions, recherche
  de sessions, menus projet/thread, multi-sélection et rename.
- `src/App.tsx:1954-2018` — transmet tous les projets/threads et les callbacks au
  composant; `selectProject` à `:549-556` ramène déjà sur la vue Chats.
- `src/components/Rail.tsx` — sélecteur global de projets déjà validé; hors scope
  sauf import partagé strictement nécessaire.
- `src/App.css` — styles globaux du panneau et tokens contraignants.
- `src/lib/i18n.ts` — libellés français/anglais.
- tests RTL/fixtures produits par 015 — pattern obligatoire pour les tests.

### Existing behavior to preserve

`Sidebar.tsx:159-181` reçoit déjà `activeProject`, les projets, threads,
favoris, callbacks new/select/delete/rename/remove et métadonnées projet.

`Sidebar.tsx:395-414` affiche aujourd'hui trois actions de poids égal : Nouveau
chat, Recherche globale `⌘K`, Reprendre une session.

`Sidebar.tsx:415-568` rend Favoris puis tous les projets, chacun avec threads,
actions, limite de cinq et « Afficher plus ».

`Sidebar.tsx:569-610+` rend encore les chats sans projet dans une seconde
section. Ce chemin ne doit pas être supprimé; il devient le mode principal quand
`activeProject === null`.

`Sidebar.tsx:25-91` contient déjà les buckets Today/Yesterday/Last 7/Older et
`withRecencySections`, actuellement appliqués seulement aux chats sans projet.

`Sidebar.tsx:276-353` implémente l'ordre visible, Shift/Cmd multi-select, Escape
et Delete. La nouvelle structure doit conserver ces gestes sur les threads
visibles et dédupliquer leurs ids.

### Existing visual debt to remove

- `src/App.css:844-846` et `:948-951` utilisent encore 14 px, hors échelle
  10/11/12/13/15 imposée par `CLAUDE.md`.
- `src/App.css:1744-1753` nomme déjà une « sidebar plate option A », mais il ne
  s'agit que d'un traitement cosmétique partiel; la structure dupliquée demeure.
- `ProjIcon` utilise `strokeWidth="1.2"` à `Sidebar.tsx:123-125`, sous la règle
  1.3–1.5 du système Atelier.
- le projet actif a `background:transparent`; son contexte n'est donc pas un
  header dominant.
- les chevrons texte `▸/▾`, les retraits de 26 px et le menu d'actions qui
  remplace l'heure au hover donnent un arbre utilitaire plutôt qu'un navigateur
  de recherche dessiné.

## Target information architecture

```text
┌────────────────────────────────┐
│ [icon] Nom du projet       [···]│  header local, sticky
│        chemin tronqué           │
│ [＋ Nouveau chat]       [⌕] [◀] │  une primaire, recherche, replier
├────────────────────────────────┤
│ CONTINUER                       │  absent si aucun thread
│ ● Conversation active/récente 2j│
│   Provider · statut             │
├────────────────────────────────┤
│ ÉPINGLÉS                        │  absent si vide
│   Méthodologie                  │
├────────────────────────────────┤
│ CONVERSATIONS                   │
│ Aujourd'hui                     │
│   Analyse albédo             1h │
│ Hier                           │
│   Révision figure            1j │
│ 4 conversations plus anciennes │
└────────────────────────────────┘
```

Le panneau n'affiche jamais la liste complète des projets. Le rail et le
sélecteur de la top bar restent les deux points de changement de projet. Le nom
du projet dans le header est une identité locale, pas un troisième sélecteur.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Frontend tests | `npm run test:frontend` | exit 0, tous les tests verts |
| Typecheck | `npx tsc --noEmit` | exit 0, aucun diagnostic |
| Web build | `npx vite build` | exit 0 |
| Full verify | `npm run verify` | exit 0, toutes les couches vertes |
| E2E | `npm run verify:e2e` | exit 0 |
| Release | protocole `AGENTS.md` | build exit 0 et `tauri-app` actif |

## Suggested executor toolkit

- `/efficient-fable` pour l'exécution bornée et la revue de chaque slice.
- `/design` pour vérifier hiérarchie, focus, densité et AI Slop test.
- React Testing Library/Vitest déjà installés; aucune nouvelle dépendance.

## Scope

### In scope

- `src/components/Sidebar.tsx` — conserve l'export public et délègue le rendu;
- `src/components/sidebar/projectNavigatorModel.ts` — modèle pur à créer;
- `src/components/sidebar/ProjectHeader.tsx` — header et actions;
- `src/components/sidebar/ThreadRow.tsx` — ligne accessible réutilisée;
- `src/components/sidebar/NavigatorSection.tsx` si cela évite une duplication
  réelle; ne pas créer une bibliothèque de layout;
- tests correspondants sous `src/components/sidebar/` et
  `src/components/Sidebar.test.tsx`;
- `src/App.css` — styles `project-nav-*` et suppression des anciens sélecteurs
  devenus morts;
- `src/lib/i18n.ts` — nouvelles clés FR/EN;
- `src/App.tsx` — seulement props/intégration strictement nécessaires.

### Out of scope

- structure/ordre du rail ou de la top bar;
- changement du shell docké, largeur du rail, traffic lights ou surfaces;
- protocole sidecar, forme `Thread`, persistence ou historique;
- Research Home, Chat timeline, Galerie, Composer ou Settings;
- nouveaux compteurs, métriques ou statut Git non déjà disponible;
- suppression des chats sans projet;
- nouvelle bibliothèque d'icônes, routeur, state manager ou CSS strategy;
- changement forcé de la largeur `sideW` sauvegardée par l'utilisateur.

## Git workflow

- aucun commit/push sans instruction de Thierry;
- si autorisé : branche `fable/024-active-project-navigator`;
- commits séparés : caractérisation/modèle, structure, styles/i18n, QA;
- ne pas inclure les fichiers untracked préexistants sans lien avec le plan.

## Steps

### Step 1 — Caractériser le panneau existant avant déplacement

Créer des tests RTL autour de l'export public `Sidebar` avec fixtures 015 :

- clic projet appelle `onSelectProject(root)`;
- clic thread appelle `onSelect(id, root)`;
- Nouveau chat avec projet appelle `onNew(root)`;
- Nouveau chat sans projet appelle `onNewChat()`;
- Resume émet `listSessions` avec le bon `projectRoot`;
- rename, favori, delete, contexte et move conservent leurs callbacks;
- Shift/Cmd multi-select, Escape et Delete fonctionnent;
- running/unread et activeId sont rendus;
- aucun listener `sessions-list`/click/keydown n'est dupliqué après remount.

Ces tests décrivent les contrats, pas le markup actuel. Ne pas snapshotter tout
le panneau.

**Verify**: `npm run test:frontend -- --run` → tous les tests, nouveaux inclus,
passent avant la restructuration.

### Step 2 — Construire un modèle de vue pur

Créer `deriveProjectNavigatorModel(input)` sans React/DOM. Input :

- `activeProject`, `activeId`;
- `projects`, `threads`, `favorites`;
- `threadOrder`;
- `query`;
- état expanded/show-more.

Output typé :

```text
mode: project | unscoped
identity: name, root, metadata
continueThread: Thread | null
pinnedThreads: Thread[]
conversationSections: section label + Thread[]
hiddenCount: number
visibleThreadIds: string[]
```

Règles déterministes :

1. mode `project` : inclure uniquement `threadRoot === activeProject`;
2. mode `unscoped` : inclure uniquement `threadRoot === ""`;
3. `continueThread` : activeId du contexte si présent; sinon thread running le
   plus récent; sinon thread le plus récent;
4. chaque thread apparaît une seule fois : Continuer d'abord, puis Épinglés
   restants, puis Conversations restantes;
5. Épinglés ne contient que les favoris du contexte courant et disparaît vide;
6. ordre `recent` : réutiliser les buckets existants;
7. ordre `manual` : conserver l'ordre manuel sans labels temporels artificiels;
8. query non vide : retourner une section Résultats unique, sans doublon, et
   ignorer Continuer/Épinglés pendant la recherche;
9. comparaison query insensible à la casse/accents si possible sans dépendance;
10. `visibleThreadIds` suit exactement l'ordre DOM et ne contient aucun doublon;
11. dates invalides vont dans Older sans crash;
12. hiddenCount décrit les threads non affichés par la limite existante.

Tests unitaires complets pour ces douze règles, y compris projets A/B mélangés,
favori cross-project, activeId cross-project et zéro thread.

**Verify**: `npm run test:frontend -- --run projectNavigatorModel` → tous les cas
passent.

### Step 3 — Remplacer les actions globales par le header actif

Créer `ProjectHeader` :

- identité statique du projet : icône/point existant, nom max deux lignes, root
  tronqué avec valeur complète dans l'accessibility name/title;
- bouton overflow `···` utilisant un SVG fin, pas trois caractères texte;
- action principale `Nouveau chat` appelle `onNew(activeProject)`;
- bouton recherche ouvre un input local dans le header;
- bouton replier conserve `onCompact`;
- Resume session Claude/Codex va dans l'overflow et réutilise `openResume`;
- actions projet existantes (reveal/open, metadata, remove, etc.) migrent dans
  l'overflow du projet actif; aucune n'est supprimée;
- Add project reste dans le rail/topbar; ne pas le dupliquer ici;
- Search globale `⌘K` disparaît du panneau, car la top bar l'expose déjà;
- Escape ferme recherche/menu; fermeture rend le focus au déclencheur.

Mode sans projet : header « Chats sans projet », Nouveau chat appelle
`onNewChat`, Resume utilise root vide, overflow n'affiche aucune action projet.

Ne pas transformer le nom local en troisième sélecteur de projet. Le rail/topbar
restent les navigateurs globaux.

**Verify**: tests RTL header → callbacks/menus/focus corrects; `npx tsc --noEmit`
exit 0.

### Step 4 — Rendre Continuer, Épinglés et Conversations

Remplacer Favoris/Projets/Chats par trois sections issues du modèle :

- **Continuer** : une ligne maximum, absente si zéro thread;
- **Épinglés** : threads favoris du contexte, absente si vide;
- **Conversations** : groupes temporels ou ordre manuel;
- **Résultats** remplace ces trois sections pendant une recherche active;
- « `{count} conversations plus anciennes` » remplace « Afficher plus »;
- Show less reste disponible après expansion, avec libellé explicite.

Le thread Continue et les épinglés sont exclus des Conversations pour éviter les
doublons. Le thread actif/running conserve son statut; unread reste visible.

Réutiliser les interactions existantes : select, double-click rename, context
menu, favori, delete, move, multi-select. Le calcul Shift-select utilise
`model.visibleThreadIds`, pas une reconstruction depuis les anciennes sections.

**Verify**: tests RTL avec projets A/B → seul le contexte actif apparaît; aucun
id dupliqué; toutes les actions existantes restent appelées.

### Step 5 — Rendre les lignes sémantiques et accessibles

Chaque `li` contient :

- un bouton natif `thread-row-main` pour ouvrir/renommer/context menu;
- des boutons d'actions siblings, jamais des boutons imbriqués;
- nom complet accessible même tronqué;
- temps court à droite avec date relative/complète accessible;
- provider/status/unread via icône + texte accessible, jamais couleur seule;
- `aria-current` ou état sélectionné cohérent pour le thread actif;
- actions hover aussi visibles au focus-within;
- ordre Tab header → actions → liste; flèches optionnelles seulement si pattern
  complet et testé, sinon navigation Tab native.

Les cibles visuelles peuvent rester compactes mais ont une zone active de 40 px
sans chevauchement. Shift/Cmd click continue de fonctionner sur le bouton main.

**Verify**: clavier seul pour header, recherche, chaque ligne, actions, menus,
rename, Escape et suppression; tests RTL focus/roles passent.

### Step 6 — Appliquer le traitement Precision Native

CSS vanilla global, tokens existants uniquement :

- panneau flush `--bg-side`, séparateur shell 1 px inchangé;
- header sticky, fond opaque, padding 12 px, pas de blur;
- titre 13 px/600, root 10–11 px/400, sections 11 px/500;
- conversations 13 px maximum, metadata 10–11 px;
- supprimer toutes les occurrences 14 px du panneau;
- `ProjIcon` stroke 1.4;
- rayons 6 px pour lignes/boutons, 10 px seulement pour menus;
- aucune bordure par ligne;
- hover par palier de fond;
- actif = `--bg-ctl` + point orange 4 px; pas de bordure gauche épaisse;
- projet color = point/icône secondaire, jamais grande bande;
- heure tabulaire avec largeur stable;
- slot terminal fixe de 48 px pour heure/actions : heure opacity 1→0 et actions
  opacity 0→1 au hover ou `focus-within`, sans modifier display, margin ou width;
- actions secondaires opacity 0 au repos seulement si accessibles via focus;
- transitions opacity/transform 120–150 ms, jamais `transition:all`;
- changement de projet par cross-fade du contenu 120–140 ms, sans translation de
  page, sans flash vide et sans retarder la sélection fonctionnelle;
- reduced motion;
- light mode : sidebar et surface principale diffèrent visiblement;
- préserver la largeur sauvegardée `sideW`; à 180–220 px, masquer root et labels
  secondaires avant de tronquer les actions essentielles.

Le panneau doit rester cardless. Continuer est une ligne plus présente, pas une
carte flottante.

**Verify**: recherche statique : aucune valeur 14 px ou chevron texte dans les
nouveaux sélecteurs; captures dark/light à 250 px, 220 px et 180 px.

### Step 7 — Nettoyer l'état devenu obsolète

Après tests de comportement :

- supprimer `secClosed.proj/chats`, `collapsed`, `expandedRoots` par projet et
  anciens toggles seulement s'ils ne servent plus;
- conserver un état expanded/show-more unique pour le contexte courant;
- supprimer CSS mort `.project`, `.project-name`, `.proj-thread`, anciens
  `.side-actions` et `.sec-toggle` seulement après `rg` des usages;
- conserver menus/helper encore partagés;
- migration locale : ignorer proprement anciennes clés
  `atelier-studio.sections`/`collapsed`; ne pas faire de nettoyage destructif;
- vérifier que changer de projet réinitialise query/selection/show-more ou les
  scope par root de façon déterministe; recommandation : reset query et
  multi-select, conserver seulement l'état global expanded.

**Verify**: `rg` ne trouve aucun sélecteur/symbole supprimé; tous les tests
frontend passent.

### Step 8 — QA réelle dans l'app buildée

Captures obligatoires avec données déterministes/réelles non sensibles :

- projet actif avec 10+ conversations;
- autre projet sélectionné depuis le rail;
- projet sans conversations;
- mode chats sans projet;
- running, unread, active, favori;
- recherche zéro résultat et plusieurs résultats;
- multi-select et menu contextuel;
- 1512×883 dark/light;
- 1280×800;
- panneau 250, 220 et 180 px;
- zoom 125 % et reduced motion.

Parcours manuel : sélectionner projet rail, topbar, nouveau chat, resume Claude/
Codex, recherche, rename, favori, move, delete, Shift/Cmd multi-select, compact/
expand, relance app et persistance.

**Verify**: protocole `AGENTS.md` complet; binaire frais, `tauri-app`, sidecar et
galerie attachés au nouveau lancement.

## Test plan

### Unit model

`src/components/sidebar/projectNavigatorModel.test.ts` :

- isolation active project A/B;
- mode unscoped;
- priorité Continue active/running/recent;
- dédup Continue/Pinned/Conversations;
- favori cross-project exclu;
- recent buckets et manual order;
- query case/accent, zéro résultat;
- invalid date;
- hidden count et visible ids;
- switch project reset contract.

### RTL component

`src/components/Sidebar.test.tsx` :

- header projet et path;
- aucun autre projet rendu;
- New chat project/unscoped;
- local search + Escape + focus return;
- Resume root correct;
- overflow actions projet;
- Continue/Pinned sections conditionnelles;
- active/running/unread/date;
- rename, favorite, move, delete;
- Shift/Cmd select, Escape, Delete;
- focus keyboard et accessible names;
- remount sans listener dupliqué.
- hover/focus rapide sur une ligne : heure/actions se renversent sans clignoter;
- bounding boxes du titre, de l'heure et des lignes identiques avant/après hover;
- changement répété A/B sans ancien contenu visible après le cross-fade;
- reduced motion sans transform ni animation continue.

### Regression

- tests App sélection projet/sidebar compact;
- reload UI state si 015 en fournit;
- screenshot baselines 021 mises à jour seulement après approbation visuelle.

## Done criteria

- [ ] Le rail/topbar sont les seuls sélecteurs globaux de projet.
- [ ] Le panneau projet n'affiche que le projet actif ou les chats sans projet.
- [ ] Aucune capacité existante n'est supprimée; les actions ont une destination.
- [ ] Continue, Épinglés et Conversations ne dupliquent aucun thread.
- [ ] Search locale filtre uniquement le contexte courant.
- [ ] Recent/manual order, show more et dates restent cohérents.
- [ ] Multi-select, rename, favorite, move, delete et Resume fonctionnent.
- [ ] Lignes accessibles au clavier avec focus visible.
- [ ] Hover et focus utilisent le slot heure/actions fixe de 48 px sans layout shift.
- [ ] Le cross-fade de projet respecte Quiet Instrument et reste réversible.
- [ ] Aucun texte 14 px, chevron texte ou bordure lourde dans le nouveau panneau.
- [ ] Dark/light, 250/220/180 px, zoom et reduced motion sont contrôlés.
- [ ] `npm run test:frontend`, `npm run verify` et `verify:e2e` passent.
- [ ] Protocole Tauri et parcours app buildée passent.
- [ ] `plans/README.md` est mis à jour avec résultat et preuves.

## STOP conditions

- Le rail ou la topbar ne permet plus réellement de changer de projet.
- Une action projet existante n'a pas de nouvelle destination.
- Les chats sans projet devraient être supprimés ou migrés : hors scope.
- Le changement exige un nouveau payload sidecar ou une nouvelle forme Thread.
- Le modèle ne peut pas attribuer un thread à un root de façon fiable.
- Manual order et recency ne peuvent pas coexister selon les règles définies.
- Multi-select devient ambigu avec les nouvelles sections.
- La structure nécessite plus de trois niveaux permanents ou une nouvelle carte.
- Un test de caractérisation révèle un bug produit non lié : le corriger dans un
  plan séparé avant de poursuivre.

## Maintenance notes

- Tout futur contenu du panneau doit répondre au contexte du projet actif. Une
  information globale appartient au rail, à la topbar ou à Settings.
- Ne pas réintroduire une liste de tous les projets dans le panneau « pour être
  pratique »; utiliser le rail/topbar.
- Si un futur besoin de recherche globale des conversations apparaît, il va dans
  la command palette, pas dans le filtre local.
- Reviewer : vérifier surtout les capacités silencieusement perdues (move,
  multi-select, no-project, Resume) et les doublons d'ids entre sections.
- Plan 017 doit consommer le même vocabulaire Projet/Continuer/Épinglés, sans
  recréer un autre arbre de projets dans le Research Home.
