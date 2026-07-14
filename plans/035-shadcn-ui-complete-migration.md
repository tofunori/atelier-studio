# Plan 035 — Migration complète d’Atelier vers shadcn/ui

> **Mandat d’exécution** : migrer progressivement l’interface desktop React
> d’Atelier vers shadcn/ui sans remplacer son identité Precision Native, son
> shell verrouillé, ses contrats métier ni ses validations natives. Chaque lot
> est implémenté, revu, vérifié et relancé dans l’app buildée avant le suivant.

## 0. Statut, portée et principes

- **Statut** : TERMINÉ — fondation, wrappers, Sidebar, Rail, TopBar, Settings,
  champs, menus, ToggleGroup, Tabs, Command Palette, surfaces de travail et
  shell React de la Galerie sont migrés. Les contrôles natifs restants sont des
  entités métier explicitement classées; la validation complète, les goldens,
  le build signé et la convergence de l’app ont été vérifiés le 2026-07-13.
- **Priorité** : P2.
- **Effort** : XL, 10 à 12 lots indépendants.
- **Risque** : HIGH pour le CSS global, les overlays, le focus et le bundle.
- **Dépendances** : plans 014–024, contrat `docs/ui/ATELIER_DESIGN.md`,
  gouvernance `docs/ui/DESIGN_SYSTEM_GOVERNANCE.md` et protocole `AGENTS.md`.
- **Périmètre initial** : frontend desktop React/Vite/Tauri à la racine et
  chrome interactif de `gallery/`.
- **Hors périmètre initial** : `mobile/`, backend Rust/Node, providers, moteurs
  scientifiques et éditeurs internes de `gallery/`, DOM CodeMirror et DOM
  xterm.

### Résultat attendu

À la fin de la migration :

1. shadcn/ui est la fondation des contrôles standards : boutons, champs,
   menus, dialogs, popovers, tooltips, badges, états vides et feedback;
2. Atelier conserve ses tokens, son identité, ses timings Quiet Instrument et
   ses composants métier;
3. `src/components/ui/` reste l’API produit Atelier, construite au-dessus des
   primitives shadcn;
4. les fichiers générés par shadcn vivent séparément dans
   `src/components/shadcn/`;
5. les interfaces dark/light, 800/1280/1512 px, clavier et reduced-motion
   restent conformes aux baselines;
6. le Skill, `llms.txt`, le CLI et le serveur MCP shadcn sont intégrés au
   workflow des agents;
7. l’app buildée passe toutes les validations et ne sert jamais un bundle
   ancien.

### État vérifié au 2026-07-13

- Base UI + style `base-nova` sélectionnés; Tailwind v4 est isolé dans
  `src/styles/shadcn.css` avec préfixe `tw` et sans Preflight;
- `components.json`, `cn()`, le Skill projet et `.mcp.json` existent;
- Button, Spinner, Badge, Alert, Empty, Separator, Skeleton, Tooltip,
  Popover, DropdownMenu, ContextMenu, Dialog, AlertDialog, Sheet, Sonner,
  Sidebar, Input, Textarea, Field, Select, Switch, Checkbox, Slider,
  ToggleGroup et Tabs sont présents dans `src/components/shadcn/`;
- `Button`, `EmptyState`, `InlineNotice`, `StatusBadge`, le Dialog de création
  de chat, la Command Palette, la Sidebar/Research Navigator et les overflow
  menus de ProjectHeader/ChatHeader utilisent déjà la fondation shadcn;
- Settings, BiblioSurface, GitSurface, Explorer, GeneratorSurface, GoalBar,
  BrowserTab et RemoteDevicesPanel utilisent les adaptateurs Input/Select/
  Textarea/Checkbox/ToggleGroup/Slider selon leurs contrats métier;
- l’audit shadcn du 2026-07-13 a rétabli `IconButton` sur la primitive Button,
  complété la famille `Field*`, remplacé le Radio maison par `radio-group`,
  regroupé les items de DropdownMenu, remplacé le `<hr>` de Sidebar par
  Separator et déplacé les compositions Dialog/Menu dans `src/components/ui/`;
- le test de contrat inspecte désormais toutes les primitives shadcn et bloque
  les variantes `dark:` locales, z-index locaux, `transition-all`,
  `space-x/space-y`, `<hr>` brut et compositions produit dans ce dossier;
- la Galerie charge maintenant un bundle React/shadcn isolé : Input, Select,
  DropdownMenu, ToggleGroup, Sheet d’inspection et AlertDialog de confirmation;
  le bridge conserve les moteurs historiques de recherche, sélection, rendu et
  édition, et les tests verrouillent clavier, focus, responsive et budgets;
- TopBar, Rail, TerminalSurface, BrowserTab, GitSurface, BiblioSurface,
  Settings, QuickAsk, Banner et le chrome d’AtelierPane utilisent l’API produit
  `src/components/ui/` pour leurs actions génériques;
- Base UI est isolé dans un chunk Vite partagé; la dernière entrée mesurée est
  900 KB, sous le budget bloquant de 950 KB;
- `npm run verify` passe : 363 tests frontend, 346 sidecar, 37 Gallery Python,
  parité, 166 tests diff, Rust, protocole et politique backend;
- `npm run verify:e2e` passe avec 50/50 scénarios Gallery et les 14/14 goldens
  passent en dark/light et aux largeurs prévues;
- l’entrée desktop mesure 947 KB pour un budget bloquant de 950 KB;
- le build Tauri signé avec `Atelier Dev Signing` produit l’app et le DMG;
- après arrêt exhaustif des processus et restaging Gallery, l’app arm64 et le
  sidecar Rust convergent et `/health` répond `200 OK` avec le bundle courant.

### Définition de « shadcn partout »

« Partout » signifie : partout où le besoin correspond à une primitive UI
générique. Cela ne signifie pas remplacer les composants métier par des blocs
génériques.

- **shadcn** : Button, Dialog, AlertDialog, DropdownMenu, ContextMenu, Popover,
  Sheet, Tooltip, Field, Input, Select, Switch, Tabs simples, Sidebar,
  Collapsible, Badge, Alert, Empty, Skeleton, Sonner, Command.
- **Atelier composé avec shadcn** : Research Navigator, SurfaceHeader,
  InspectorPanel, ContextChip, activité agentique, Settings, Command Palette.
- **Atelier spécialisé** : ChatTimeline, composer agentique, lignes de listes
  riches ou réordonnables, onglets
  éditoriaux fermables/réordonnables, figure workflow, galerie scientifique,
  CodeMirror, xterm, zones Tauri drag et handles de resize.

Les menus qui contiennent une logique métier multi-étapes ou un sous-menu
spécifique (sélecteur de modèle du composer, couleur/style des pins, choix de
projet avec chemin courant, restauration Git en deux temps) restent des
compositions Atelier tant que leur contrat clavier et leur placement ne sont
pas couverts par un test de caractérisation; ils ne doivent pas être remplacés
par un `DropdownMenu` générique sans ce test.

## 1. Architecture cible

```text
src/styles/tokens.css
  └─ source de vérité visuelle Atelier

src/styles/shadcn.css
  └─ adaptateur Tailwind/shadcn vers les tokens Atelier

src/components/shadcn/
  └─ composants générés par le CLI shadcn

src/components/ui/
  └─ API produit Atelier composée avec shadcn

src/components/chat/
src/components/sidebar/
src/components/*.tsx
  └─ composants métier Atelier
```

### Pourquoi séparer `shadcn/` et `ui/`

Le dépôt contient déjà des fichiers comme `Button.tsx`, `Popover.tsx`,
`Tabs.tsx` et `Tooltip.tsx` dans `src/components/ui/`. Le CLI shadcn génère
normalement `button.tsx`, `popover.tsx`, etc. Sur le filesystem macOS
insensible à la casse, ces fichiers entreraient en collision.

La séparation permet aussi :

- de mettre à jour les sources shadcn avec `--dry-run` et `--diff`;
- de préserver l’API produit Atelier;
- de limiter les personnalisations dans les fichiers générés;
- de distinguer clairement primitive externe et pattern métier.

## 2. Conditions STOP générales

Arrêter le lot en cours si l’une de ces conditions survient :

- le CLI veut écraser un fichier existant;
- `components.json` pointe vers `src/components/ui/`;
- Tailwind Preflight modifie visuellement une surface non migrée;
- un composant nécessite une transition supérieure à 150 ms;
- un overlay passe derrière une iframe/webview ou perd le retour focus;
- un raccourci shadcn entre en conflit avec un raccourci Atelier;
- le bundle d’entrée dépasse le budget de 950 KB;
- une baseline change sans explication intentionnelle;
- `npm run verify`, les tests ciblés ou le build Tauri échouent;
- le worktree contient des modifications hors périmètre;
- l’app buildée ne converge pas après la relance AGENTS.

Ne jamais utiliser `--force`, `--overwrite`, `add --all` ou mettre à jour un
preset sans revue explicite du diff.

## 3. Lot 0 — Isoler le chantier et capturer la baseline

### Préparation

1. Noter le commit de départ et `git status --short --branch`.
2. Créer une branche et un worktree dédiés à partir du HEAD approuvé.
3. Ne pas transporter les modifications non commitées de `mobile/` et Rust.
4. Lire intégralement ce plan, `AGENTS.md`, `ATELIER_DESIGN.md`,
   `DESIGN_SYSTEM_GOVERNANCE.md` et `ATELIER_VISUAL_QA.md`.
5. Inventorier les classes globales susceptibles de toucher les composants
   générés : `.sidebar button`, `button`, `input`, `select`, `.flex`, `.card`,
   `.hidden`, `.grid`, z-index et styles de focus.

### Baseline à enregistrer

```bash
git status --short --branch
npm run verify
npm run verify:e2e
npm run test:visual
du -sh dist
```

Conserver :

- taille de l’entrée Vite et chunks principaux;
- captures golden actuelles;
- nombre de tests frontend/sidecar/galerie;
- comportement clavier de Menu, Popover, Select, CommandPalette et Sidebar;
- focus return et ordre de tabulation;
- screenshots dark/light aux tailles 800, 1280 et 1512.

### Livrable

Un rapport de baseline attaché au premier commit de migration. Aucun composant
shadcn n’est encore ajouté.

## 4. Lot 1 — Choisir Base ou Radix avant l’initialisation

Les décisions `base`, `style`, `baseColor` et `cssVariables` sont difficiles à
changer après initialisation. Ne pas choisir sur réputation.

### Spike temporaire

Créer deux projets Vite temporaires, sans modifier Atelier :

- candidat A : `base-nova`;
- candidat B : `radix-nova`.

Ajouter dans les deux :

```bash
npx shadcn@latest add button dialog dropdown-menu select sidebar
```

Comparer sur React 19/Vite :

- navigation clavier et roving focus;
- ouverture/fermeture contrôlée;
- retour focus;
- portals et stacking;
- Select contrôlé, objets et valeurs multiples si nécessaires;
- composition de triggers (`render` Base ou `asChild` Radix);
- comportement dans un WebView Tauri;
- poids JS/CSS;
- capacité à respecter Quiet Instrument;
- facilité de tests Testing Library.

### Décision

La préférence initiale est **Base Nova**, alignée avec les docs et skills
shadcn actuels. Le choix final est inscrit dans un ADR seulement après le
spike. Une fois verrouillé, ne pas mélanger Base et Radix.

### Livrables

- ADR Base vs Radix;
- mesures de bundle;
- checklist clavier/focus;
- preset final exact;
- liste des adaptations Atelier nécessaires.

## 5. Lot 2 — Installer les outils pour agents

### 5.1 Skill officiel shadcn

Installer dans le projet :

```bash
npx skills add shadcn/ui
```

Vérifier les destinations réellement créées pour Codex et Claude Code. Le
skill doit :

- s’activer en présence de `components.json`;
- exécuter/lire `shadcn info --json`;
- connaître framework, aliases, Tailwind, base et icon library;
- imposer les règles de composition et la procédure smart merge.

Mettre à jour `AGENTS.md` pour exiger ce skill avant toute création,
modification ou mise à jour shadcn.

### 5.2 Documentation LLM

Ajouter au runbook agent :

- index officiel : <https://ui.shadcn.com/llms.txt>;
- docs ciblées : `npx shadcn@latest docs <component>`;
- recherche : `npx shadcn@latest search @shadcn -q "<besoin>"`;
- prévisualisation projet : `npx shadcn@latest add <component> --dry-run`;
- diff ciblé : `npx shadcn@latest add <component> --diff <file>`.

Ne pas copier `llms.txt` dans le dépôt : conserver le lien officiel et
documenter la date de consultation.

### 5.3 MCP pour Claude Code

Ajouter `.mcp.json` :

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

Redémarrer Claude Code et vérifier `/mcp` → `Connected`.

### 5.4 MCP pour Codex

La configuration officielle est globale et ne doit pas être écrite sans
autorisation explicite. Ajouter manuellement à `~/.codex/config.toml` :

```toml
[mcp_servers.shadcn]
command = "npx"
args = ["shadcn@latest", "mcp"]
```

Redémarrer Codex après modification.

### 5.5 Smoke MCP

Demander successivement :

1. lister les composants du registre shadcn;
2. rechercher `sidebar`;
3. afficher la documentation de `dialog`;
4. prévisualiser `button` sans installation;
5. confirmer que le worktree est inchangé.

Le MCP est un outil de développement. Il n’entre jamais dans le bundle ou le
runtime d’Atelier.app.

## 6. Lot 3 — Introduire Tailwind v4 de façon isolée

### Dépendances

```bash
npm install tailwindcss @tailwindcss/vite
npm install -D @types/node
```

Ajouter `tailwindcss()` dans `vite.config.ts` sans modifier les réglages Tauri
existants.

### Preflight

Ne pas utiliser directement :

```css
@import "tailwindcss";
```

Cette forme injecte Preflight et peut changer les boutons, marges, bordures et
titres des surfaces non migrées. Importer uniquement `theme.css` et
`utilities.css`, en omettant `preflight.css`, conformément à la documentation
Tailwind pour l’intégration dans une application existante.

### Préfixe

Configurer un préfixe Tailwind `tw` dans `components.json` et dans les imports
Tailwind v4. Le CLI doit générer les classes préfixées. Vérifier cela dans le
spike avant tout ajout réel.

Objectifs :

- aucune collision avec `.flex`, `.grid`, `.hidden`, `.card`, `.sidebar`;
- aucune variable Tailwind non préfixée qui masque un token Atelier;
- aucun effet visuel sur une surface sans composant shadcn;
- source detection limitée à `src/`.

### Reset local

Si les composants shadcn dépendent d’hypothèses Preflight, ajouter un reset
minimal ciblé sur leurs `data-slot`, jamais un reset global. Chaque règle doit
être couverte par un test et motivée par un défaut visible.

## 7. Lot 4 — Configurer aliases et `components.json`

### Aliases

Ajouter `@/* -> ./src/*` dans `tsconfig.json` et la résolution `@` dans
`vite.config.ts`. Conserver `moduleResolution: "bundler"`.

### Configuration cible

Créer `components.json` via le CLI dans le worktree, puis conserver seulement
le diff approuvé. Paramètres attendus :

- `rsc: false`;
- `tsx: true`;
- base/style issus de l’ADR;
- `tailwind.config: ""` pour Tailwind v4;
- `tailwind.css: "src/styles/shadcn.css"`;
- `tailwind.baseColor`: zinc ou neutral selon le spike;
- `tailwind.cssVariables: true`;
- `tailwind.prefix: "tw"`;
- `iconLibrary`: choix verrouillé par l’ADR;
- `aliases.components: "@/components"`;
- `aliases.ui: "@/components/shadcn"`;
- `aliases.lib: "@/lib"`;
- `aliases.hooks: "@/hooks"`;
- `aliases.utils: "@/lib/utils"`;
- aucun registre tiers initial.

Exécuter ensuite :

```bash
npx shadcn@latest info
```

Vérifier framework Vite, React, Tailwind v4, `rsc=false`, chemins résolus,
préfixe, base, style et icon library.

## 8. Lot 5 — Construire le pont de thème Atelier ↔ shadcn

Créer `src/styles/shadcn.css`, configuré comme fichier CSS global shadcn. Il
importe Tailwind sans Preflight et mappe les tokens shadcn sur les tokens
Atelier existants.

| Token shadcn | Source Atelier | Raison |
|---|---|---|
| `background` | `--surface-app` | canvas principal |
| `foreground` | `--text-primary` | texte principal |
| `card` | `--surface-raised` | entités/choix seulement |
| `card-foreground` | `--text-primary` | contenu de carte |
| `popover` | `--surface-overlay` | overlays |
| `popover-foreground` | `--text-primary` | contenu overlay |
| `primary` | `--text-primary` | primaire neutre fort |
| `primary-foreground` | `--surface-app` | contraste bouton |
| `secondary` | `--surface-inset` | action secondaire |
| `secondary-foreground` | `--text-secondary` | texte secondaire |
| `muted` | `--surface-inset` | surfaces discrètes |
| `muted-foreground` | `--text-muted` | métadonnées |
| `accent` | `--selection-surface` | hover/sélection neutres |
| `accent-foreground` | `--text-primary` | texte sélectionné |
| `destructive` | `--status-error` | action destructive |
| `border` | `--border-subtle` | séparateurs |
| `input` | `--border-interactive` | contrôles |
| `ring` | `--accent-base` | focus clavier orange |
| `sidebar` | `--surface-panel` | panneau projet |
| `sidebar-accent` | `--selection-surface` | navigation active neutre |
| `sidebar-border` | `--border-subtle` | séparation shell |
| `sidebar-ring` | `--accent-base` | focus clavier |

### Règle critique sur l’accent

Ne jamais mapper le token shadcn `accent` sur l’orange Atelier. Chez shadcn,
`accent` sert souvent au hover et à la sélection. Chez Atelier, l’orange est un
budget réservé aux actions primaires, au running, au focus et à l’attention.

### Géométrie et mouvement

Le bridge doit conserver :

- contrôles 6 px, surfaces 10 px, pills uniquement pour tags/statuts;
- grille 4/8/12/16/20/24/32;
- fontes `--font-chrome` et `--font-code`;
- transitions 120/140/150 ms maximum;
- `--ease-out` Atelier;
- zéro `transition: all`;
- zéro animation de width/height/padding/margin;
- une seule boucle continue par surface;
- neutralisation translate/scale/boucles en reduced-motion.

Étendre `src/components/ui/css-contract.test.ts` aux fichiers
`src/components/shadcn/` et `src/styles/shadcn.css`.

## 9. Lot 6 — Installer les composants par familles

Pour chaque composant :

```bash
npx shadcn@latest docs <component>
npx shadcn@latest add <component> --dry-run
npx shadcn@latest add <component> --diff
npx shadcn@latest add <component>
```

Lire ensuite chaque fichier généré. Vérifier imports, groupes, Title des
dialogs/sheets, icon library, variants, reduced-motion et timings.

### Famille A — Fondation visuelle

```text
button separator badge spinner skeleton alert empty kbd tooltip
```

### Famille B — Overlays

```text
dialog alert-dialog dropdown-menu context-menu popover sheet hover-card sonner
```

### Famille C — Formulaires

```text
field label input textarea input-group switch checkbox radio-group
select native-select toggle-group slider
```

### Famille D — Navigation et layout

```text
sidebar tabs collapsible accordion scroll-area resizable command item
```

Ne pas installer `calendar`, `carousel`, `chart`, `data-table` ou un bloc tiers
sans consommateur réel et registre explicitement choisi.

## 10. Lot 7 — Adapter l’API UI Atelier

Les wrappers publics conservent leur API tant que leurs consommateurs ne sont
pas migrés. La primitive shadcn reste interne.

| API Atelier | Fondation shadcn | Décision |
|---|---|---|
| `Button` | Button + Spinner | conserver `loading` dans le wrapper |
| `IconButton` | Button `size="icon"` + Tooltip | label accessible obligatoire |
| `Tooltip` | Tooltip | délai 420 ms Atelier |
| `Menu` | DropdownMenu | réécrire progressivement les consommateurs |
| `Popover` | Popover | conserver placement et retour focus |
| `SegmentedControl` | ToggleGroup | single select et flèches |
| `EmptyState` | Empty | conserver vocabulaire produit |
| `InlineNotice` | Alert | variants info/success/warning/error |
| `StatusBadge` | Badge | texte obligatoire, jamais couleur seule |
| `InspectorPanel` | wrapper + Sheet étroit | docké desktop, overlay ≤900 px |
| `ActivityDisclosure` | Collapsible | activité cardless |
| `ContextChip` | Badge/Item composé | provenance + remove accessible |
| `SurfaceHeader` | wrapper produit | conserver hiérarchie surface |
| `JumpNavigation` | Atelier | aucun remplacement générique |
| tabs d’éditeur | Atelier | fermeture, DnD et ordre métier |

Ne pas émuler indéfiniment l’ancienne API si l’API shadcn est meilleure : une
compatibilité temporaire doit avoir un lot de suppression explicite.

## 11. Lots 8–10 — Migration des surfaces

### Ordre obligatoire

1. `UiBench` : afficher les composants shadcn et wrappers Atelier en
   dark/light, texte long, disabled/loading/error et zoom 125 %.
2. Settings : Fields, Inputs, Switches, Selects, Slider, notices et confirmations — fait;
3. Research Home, LazyBoundary, Banner et états vides.
4. Dialog de nouvelle conversation/provider.
5. Menus contextuels, popovers et Select maison — Select fait; menus contextuels
   métier et popovers restants à traiter.
6. Command Palette avec `Command` + `Dialog`, en conservant `fuzzyScore`, les
   sections et les actions existantes — Dialog/Input fait; primitive Command
   dédiée restant à évaluer.
7. Sidebar/Research Navigator — fait, avec largeur dockée conservée.
8. Rail, TopBar, headers de surface et inspecteur — wrappers principaux faits;
   picker projet et menus métier restent à auditer.
9. ChatHeader et menus du composer.
10. Feedback chat : badges, alerts, collapsibles, skeletons et Sonner si
    pertinent.
11. Explorer, GitSurface, BiblioSurface et GeneratorSurface — contrôles texte,
    Select, Checkbox, ToggleGroup et actions génériques faits; lignes et
    disclosures métier restent volontairement natifs.
12. Galerie — toolbar, filtres, menus, densité, inspecteur et confirmations
    migrés dans un bundle React/shadcn isolé, avec bridge vers le moteur legacy.
13. Nettoyage final d’`App.tsx`, `App.css` et des anciennes primitives.

Une surface ne commence que lorsque la précédente est acceptée dans l’app
buildée.

## 12. Migration particulière de la Sidebar

Conserver intégralement :

- `projectNavigatorModel`;
- `ProjectHeader`;
- `ThreadRow`;
- Continuer, Épinglés et Conversations par récence;
- recherche, renommage, favoris et menus contextuels;
- statuts agentiques et provenance provider;
- sélection du projet dans Rail/TopBar.

Remplacer la structure par :

```text
SidebarProvider
└── Sidebar
    ├── SidebarHeader
    │   └── ProjectHeader
    └── SidebarContent
        ├── SidebarGroup Continuer
        ├── SidebarGroup Épinglés
        └── SidebarGroup Conversations
```

### Points à vérifier

- désactiver ou remapper `⌘B` si conflit avec Atelier;
- ne pas ajouter une seconde navigation de projet;
- préserver la largeur du panneau et le resize actuel;
- ne pas transformer le panneau docké en carte/floating sidebar;
- actif neutre, jamais orange;
- collapse piloté par l’état UI Atelier, pas un cookie web;
- 800 px : comportement approuvé du shell, pas l’offcanvas mobile par défaut;
- ThreadRow reste une entité métier, pas un simple SidebarMenuButton générique;
- focus visible sur action principale, étoile et overflow;
- menus au-dessus de la surface de travail et des iframes.

## 13. Frontières non React

### Galerie

Le contenu de `gallery/` est servi dans une iframe et ne reçoit pas le contexte
React/Tailwind de l’hôte. Un bundle React/shadcn séparé est donc construit dans
`gallery/react-ui/`, émis dans `gallery/assets/shadcn-ui/`, puis staged avec la
galerie. Il porte uniquement le chrome générique : toolbar, filtres, menus,
densité, Sheet d’inspection et AlertDialog. Les moteurs scientifiques, cartes,
sélection, recherche, éditeurs et protocoles `postMessage` restent dans le code
historique; le bridge réutilise leurs fonctions et leur état au lieu de les
dupliquer.

Budgets bloquants du bundle Galerie : JavaScript brut inférieur à 750 KB et
CSS inférieur à 50 KB. `parity.mjs` vérifie aussi la présence du mount, des
imports et des contrats React/shadcn dans le bundle staged.

### CodeMirror et xterm

Le DOM interne des éditeurs et du terminal demeure géré par leurs moteurs. Les
headers, menus et dialogs autour peuvent utiliser shadcn; le contenu interne
reste thémé via leurs APIs propres.

### Mobile

`mobile/` a son propre plan 034 et ses propres budgets iOS. Ne pas propager la
migration desktop sans ADR et benchmarks sur appareil physique.

## 14. Nettoyage et gouvernance finale

Après chaque famille migrée :

1. supprimer les règles `.ui-*` devenues sans consommateur;
2. supprimer les sélecteurs globaux qui ciblent des éléments bruts;
3. supprimer les helpers overlay maison devenus inutiles;
4. remplacer les couleurs brutes par des tokens;
5. supprimer les implémentations locales de patterns désormais officiels;
6. ajouter un test empêchant leur réintroduction;
7. vérifier qu’aucun fichier shadcn n’a été écrasé sans smart merge.

État final souhaité :

- `tokens.css` : source des valeurs et rôles Atelier;
- `shadcn.css` : adaptateur Tailwind/shadcn uniquement;
- `src/components/shadcn/` : primitives générées et modifications minimales;
- `src/components/ui/` : patterns produit stables;
- `primitives.css` supprimé ou réduit aux patterns Atelier non couverts;
- `App.css` sans seconde définition des primitives.

Mettre à jour `DESIGN_SYSTEM_GOVERNANCE.md` pour documenter les deux couches et
la procédure de mise à jour upstream.

## 15. Stratégie de mise à jour shadcn

Pour chaque mise à jour future :

```bash
npx shadcn@latest info
npx shadcn@latest docs <component>
npx shadcn@latest add <component> --dry-run
npx shadcn@latest add <component> --diff <file>
```

Décider fichier par fichier :

- sans modification locale : remplacement possible après tests;
- avec modification locale : smart merge manuel;
- changement de base/style/preset : nouveau plan et approbation humaine;
- registre tiers : audit source, dépendances, licences et imports avant ajout.

Ne jamais utiliser `npx shadcn diff`; utiliser `add --diff`.

## 16. Validation de chaque lot

### Tests ciblés

Ajouter ou adapter des tests pour :

- activation souris et clavier;
- Tab, flèches, Home/End et Escape;
- ouverture/fermeture contrôlée;
- focus initial et retour focus;
- titre obligatoire des dialogs/sheets;
- disabled, loading et `aria-busy`;
- forms `data-invalid` + `aria-invalid`;
- hover et focus-within;
- texte long et troncature;
- dark/light;
- reduced-motion;
- absence de layout shift;
- overlay au-dessus des iframes;
- raccourcis Tauri et zones drag;
- StrictMode et absence de listeners dupliqués.

### Vérifications frontend

```bash
npx tsc --noEmit
npx vite build
npx vitest run
npm run test:visual
node scripts/check_entry_budget.mjs
git diff --check
```

Les goldens ne sont mis à jour qu’après revue visuelle explicite. Toute
différence doit être expliquée dans le handoff du lot.

### Vérification complète

```bash
npm run verify
npm run verify:e2e
```

Si `gallery/` est touché, exécuter aussi explicitement la parité et la suite de
diff avant le build Tauri.

### App buildée

À la fin de chaque lot accepté, suivre **exactement** `AGENTS.md` :

1. validations obligatoires;
2. tuer `tauri-app`, les sidecars Node/Rust et tous les serveurs galerie;
3. build Tauri avec log dans `/tmp/tauri-build.log`;
4. vérifier l’absence d’erreurs hors DMG;
5. ouvrir l’app buildée;
6. vérifier `tauri-app`;
7. vérifier la convergence sidecar/lock/health;
8. contrôler visuellement le comportement réel.

## 17. Budget performance

Mesurer après chaque famille :

- taille de l’entrée non compressée et gzip;
- nouveaux chunks;
- coût des primitives Base/Radix;
- coût de `cmdk`, Sonner et Sidebar;
- temps de build;
- temps d’ouverture de l’app;
- rerenders sur Sidebar et ChatTimeline;
- fluidité du scroll chat et listes de threads.

Le budget `scripts/check_entry_budget.mjs` reste bloquant. Si shadcn fait
dépasser 950 KB, préférer lazy loading des surfaces lourdes ou retirer un
composant non essentiel avant d’augmenter le budget.

## 18. Commits recommandés

1. `plan: add shadcn migration blueprint`
2. `docs: record base-vs-radix decision`
3. `chore: add shadcn skill and mcp configuration`
4. `build: add isolated tailwind v4 foundation`
5. `style: bridge shadcn tokens to atelier`
6. `ui: add foundational shadcn primitives`
7. `ui: migrate atelier primitive wrappers`
8. `ui: migrate settings and dialogs`
9. `ui: migrate menus selects and command palette`
10. `ui: migrate research navigator sidebar`
11. `ui: migrate workspace and chat controls`
12. `refactor: remove legacy ui implementations`
13. `test: lock shadcn visual and accessibility contracts`
14. `docs: finalize shadcn governance and maintenance`

Ne pas mélanger installation, migration de plusieurs surfaces et suppression
CSS massive dans un même commit.

## 19. Critères de DONE

Le plan est DONE uniquement si :

- le Skill shadcn est installé et reconnu dans le projet;
- le MCP shadcn fonctionne dans les clients choisis;
- `components.json` pointe vers `src/components/shadcn/`;
- Tailwind v4 est préfixé et n’injecte pas Preflight global;
- tous les composants standards utilisent shadcn ou une exception documentée;
- Sidebar conserve tous ses comportements métier;
- les patterns Atelier composent shadcn sans perdre leur identité;
- aucun composant ne viole le contrat Quiet Instrument;
- aucune ancienne primitive n’a encore de consommateur involontaire;
- dark/light et 800/1280/1512 sont approuvés;
- clavier, focus, Escape, zoom 125 % et reduced-motion sont approuvés;
- les captures golden sont revues;
- `npm run verify` et `npm run verify:e2e` passent;
- le bundle reste dans son budget;
- le build Tauri passe et l’app réelle converge sans zombie;
- aucun fichier hors périmètre n’a été modifié;
- la gouvernance et la procédure smart merge sont documentées.

## 20. Sources officielles à relire pendant l’exécution

- shadcn LLM index : <https://ui.shadcn.com/llms.txt>
- installation Vite : <https://ui.shadcn.com/docs/installation/vite>
- Skills : <https://ui.shadcn.com/docs/skills>
- MCP : <https://ui.shadcn.com/docs/mcp>
- `components.json` : <https://ui.shadcn.com/docs/components-json>
- theming : <https://ui.shadcn.com/docs/theming>
- Tailwind v4 : <https://ui.shadcn.com/docs/tailwind-v4>
- Sidebar : <https://ui.shadcn.com/docs/components/sidebar>
- Tailwind Preflight : <https://tailwindcss.com/docs/preflight>

Les docs d’un composant précis doivent être résolues avec
`npx shadcn@latest docs <component>` au moment du lot concerné.
