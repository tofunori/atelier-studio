# Audit final des composants shadcn/ui dans Atelier

Date : 2026-07-13  
Source officielle : <https://ui.shadcn.com/docs/components>  
Périmètre : app desktop React/Tauri et chrome React de `gallery/`. Les moteurs
scientifiques historiques, CodeMirror, xterm et `mobile/` restent hors de la
conversion automatique.

Plan exécuté :
[`plans/036-shadcn-typeset-chat-completion.md`](../../plans/036-shadcn-typeset-chat-completion.md).
Typeset est suivi séparément, car il s’agit d’une fondation CSS et non d’une
primitive du registre.

## Résumé vérifié

La documentation officielle recense **64 composants**.

| État | Nombre | Définition |
|---|---:|---|
| ✅ Fait | 36 | Source installée, adaptée à Precision Native et consommée réellement |
| 🟡 Partiel | 1 | Fondation adoptée, logique produit volontairement spécialisée |
| 🔗 Dépendance | 1 | Source nécessaire à d’autres primitives, sans consommateur produit direct |
| ⏸ Évalué, non retenu | 8 | Besoin examiné pendant le plan, mais sans consommateur justifiant l’installation |
| ➖ Non planifié | 18 | Aucun besoin produit ou remplacement explicitement déconseillé |
| **Total** | **64** | Inventaire officiel complet au 2026-07-13 |

État du dépôt :

- **38/64** composants ont une source dans `src/components/shadcn/`;
- **37/38** ont un consommateur produit direct;
- `Separator` est la seule source conservée comme dépendance explicite de
  `ButtonGroup`, `Field` et `Sidebar`;
- **0** source shadcn installée est inutilisée;
- **26/64** ne sont pas installés, après décision documentée;
- la Galerie consomme directement huit familles shadcn et dix sources en
  comptant les dépendances `Input` et `Toggle`.

## Configuration vérifiée

`npx shadcn@latest info --json` confirme :

- Vite, React et TypeScript;
- style `base-nova` sur Base UI;
- Tailwind v4 sans Preflight global;
- préfixe Tailwind `tw`;
- tokens CSS Precision Native;
- Lucide;
- sources dans `src/components/shadcn/`;
- API produit et adaptateurs dans `src/components/ui/`.

Le CLI, les pages `docs`, la recherche du registre, `add --dry-run` et `--diff`
ont été utilisés avant les smart merges. Aucun `--overwrite`, `--force` ou
`add --all` n’a été utilisé.

## Inventaire complet des 64 composants

| Composant | État | Décision finale |
|---|---|---|
| Accordion | ⏸ Évalué, non retenu | `Collapsible` suffit; aucun groupe multi-section structuré ne justifie une seconde primitive. |
| Alert | ✅ Fait | `InlineNotice` compose la primitive officielle. |
| Alert Dialog | ✅ Fait | Confirmation destructive de la Galerie, avec Title/Description et stacking partagé. |
| Aspect Ratio | ➖ Non planifié | Les aperçus de fichiers et figures ont des contraintes métier. |
| Attachment | ✅ Fait | `ContextShelf` couvre fichiers, images, textes collés, citations groupées et retrait accessible. |
| Avatar | ⏸ Évalué, non retenu | Aucun besoin d’identité visuelle dans les messages actuels. |
| Badge | ✅ Fait | `StatusBadge` compose la primitive officielle. |
| Breadcrumb | ⏸ Évalué, non retenu | Aucun fil hiérarchique visible et stable ne justifie encore son ajout. |
| Bubble | ✅ Fait | Surfaces utilisateur et assistant composées sans toucher au renderer scientifique. |
| Button | ✅ Fait | Fondation de `Button`, `IconButton`, composer, app et Galerie. |
| Button Group | ✅ Fait | Groupes d’actions du composer et dépendances officielles. |
| Calendar | ➖ Non planifié | Aucun workflow calendrier. |
| Card | ➖ Non planifié | Precision Native évite les cartes génériques sans sémantique. |
| Carousel | ➖ Non planifié | Aucun parcours carousel. |
| Chart | ➖ Non planifié | Les figures scientifiques appartiennent à la Galerie. |
| Checkbox | ✅ Fait | Git et Settings. |
| Collapsible | ✅ Fait | Détails d’activité et états de travail repliables. |
| Combobox | ⏸ Évalué, non retenu | Le sélecteur de modèle possède des contrats effort/favoris/contexte qui dépassent une combobox générique. |
| Command | ✅ Fait | Palette globale `cmdk`, scoring Atelier préservé et chunk lazy. |
| Context Menu | ✅ Fait | Vrai clic droit des onglets Atelier. |
| Data Table | ➖ Non planifié | Git, bibliographie et appareils sont des listes métier. |
| Date Picker | ➖ Non planifié | Aucun choix de date. |
| Dialog | ✅ Fait | `DialogSurface`, création de chat et palette; stacking modal partagé. |
| Direction | ➖ Non planifié | Pas de chantier RTL. |
| Drawer | ➖ Non planifié | `Sheet` couvre le desktop; mobile est hors périmètre. |
| Dropdown Menu | ✅ Fait | Menus d’app, composer et Galerie. |
| Empty | ✅ Fait | `EmptyState` compose la primitive officielle. |
| Field | ✅ Fait | Settings, éditeur de goal, `HarnessInteraction` et composer. |
| Hover Card | ⏸ Évalué, non retenu | Aucun contenu riche non essentiel au clic ne le justifie. |
| Input | ✅ Fait | Formulaires, recherche, sidebar, surfaces produit et Galerie. |
| Input Group | ✅ Fait | Composer, prompt, palette et recherche Galerie. |
| Input OTP | ➖ Non planifié | Aucun code OTP. |
| Item | ⏸ Évalué, non retenu | Les lignes existantes ont des contrats métier propres. |
| Kbd | ✅ Fait | Raccourcis réellement actifs de la palette. |
| Label | ➖ Non planifié | `FieldLabel` couvre les formulaires. |
| Marker | ✅ Fait | Notes système et séparateurs annotés du chat. |
| Menubar | ➖ Non planifié | La barre de menus reste native macOS/Tauri. |
| Message | ✅ Fait | Structure des tours et métadonnées, comportements métier préservés. |
| Message Scroller | ✅ Fait | Auto-follow, détachement, ancres, streaming et retour au dernier message. |
| Native Select | ➖ Non planifié | Base UI est la voie produit; les selects cachés Galerie sont un bridge legacy. |
| Navigation Menu | ➖ Non planifié | Rail et Sidebar sont une navigation d’application spécialisée. |
| Pagination | ➖ Non planifié | Les listes ne présentent pas un vrai modèle paginé. |
| Popover | ✅ Fait | Adaptateur produit officiel et citations groupées. |
| Progress | ✅ Fait | `GoalBar` seulement quand budget et consommation réels sont disponibles. |
| Radio Group | ✅ Fait | Choix exclusifs de `HarnessInteraction`. |
| Resizable | ⏸ Évalué, non retenu | Refusé sans spike iframe, persistance, clavier et tailles minimales. |
| Scroll Area | ⏸ Évalué, non retenu | Scroll natif conservé pour les panneaux; jamais utilisé pour remplacer `MessageScroller`. |
| Select | ✅ Fait | Adaptateur produit, Settings, bibliographie, composer et Galerie. |
| Separator | 🔗 Dépendance | Conservé pour `ButtonGroup`, `Field` et `Sidebar`; `Marker` reste le séparateur annoté du chat. |
| Sheet | ✅ Fait | Inspecteur Galerie avec niveaux `panel` desktop et `modal` mobile. |
| Sidebar | 🟡 Partiel | Shell et lignes utilisent la primitive; Research Navigator, Rail et logique projet restent spécialisés par conception. |
| Skeleton | ✅ Fait | Chargement de la Galerie principale. |
| Slider | ✅ Fait | Settings. |
| Sonner | ✅ Fait | Un Toaster global lazy; succès, erreur, information et Undo. |
| Spinner | ✅ Fait | État loading des boutons. |
| Switch | ✅ Fait | Préférences immédiates de Settings. |
| Table | ➖ Non planifié | Markdown et appareils distants ont des contrats spécialisés. |
| Tabs | ✅ Fait | `ui/Tabs`; les onglets éditoriaux fermables restent spécialisés. |
| Textarea | ✅ Fait | Composer, QuickAsk, Generator et Settings. |
| Toast | ➖ Non planifié | Sonner est la voie choisie. |
| Toggle | ✅ Fait | États pressed du composer, Generator, Settings et dépendance Galerie. |
| Toggle Group | ✅ Fait | SegmentedControl, Settings, Generator et densité Galerie. |
| Tooltip | ✅ Fait | Adaptateur Base UI partagé, provider global app et provider Galerie. |
| Typography | ➖ Non planifié | Typeset et le renderer Markdown/KaTeX/code sont la fondation adaptée. |

## Galerie : frontière et conformité finales

`gallery/react-ui/main.tsx` compose le chrome générique suivant :

| Surface | Primitives |
|---|---|
| Recherche | `InputGroup`, `Input` |
| Filtres et outils | `Button`, `DropdownMenu`, `Tooltip` |
| Dossier et tri | `Select` |
| Densité | `ToggleGroup`, `Toggle` |
| Rescan | `Button`, `Spinner` |
| Confirmation destructive | `AlertDialog` |
| Inspecteur responsive | `Sheet` |

Les corrections du plan sont appliquées : aucun `type="search"` redondant,
aucun z-index local dans les consommateurs, groupes Menu/Select explicites,
Title/Description conservés et Tooltip sur le bouton icône. La politique de
stacking vit dans les primitives et l’échelle `--z-*`.

Le moteur legacy reste volontairement propriétaire des cartes, lightbox,
annotations, workflows scientifiques, éditeurs, recherche/tri, `postMessage`
et persistance. Les 50 tests E2E prouvent le bridge au lieu de prétendre que la
Galerie est entièrement réécrite en React.

Le build Tailwind Galerie est limité à ses sources et primitives importées :
CSS 37,9 Ko; JavaScript 727,1 Ko, sous la limite de 750 Ko. Les artefacts source
et `src-tauri/gallery-dist` ont été comparés après staging.

## Contrôles natifs restants

Hors sources shadcn et tests, le frontend desktop contient :

- 64 `<button>` directs, contre 112 au début du plan;
- 1 `<input>` direct : le color picker natif de Settings;
- 0 `<textarea>`, `<select>` ou `<hr>` direct;
- 2 `<table>` : table Markdown et appareils distants.

Concentrations principales de boutons directs :

| Fichier | Nombre | Justification |
|---|---:|---|
| `chat/turns.tsx` | 8 | Actions de résultats, reviewer et états de tour spécialisés |
| `chat/HarnessInteraction.tsx` | 7 | Approbations et formulaires dynamiques liés au protocole agent |
| `chat/ChatTimeline.tsx` | 6 | Navigation de chapitres, focus et contrôles de timeline |
| `BrowserTab.tsx` | 5 | Navigation et gestion WebView spécialisées |
| `Sidebar.tsx` | 4 | Splitter et navigation d’application |
| `ResearchHome.tsx` | 4 | Tuiles d’entrée produit et actions projet |

Ces balises ne sont pas des primitives génériques oubliées. Leur conversion
future doit être motivée par un contrat produit et des tests de
caractérisation, pas par un remplacement mécanique de balises.

## Contrats automatisés

- pas de Preflight;
- pas de `tw:dark:`, `transition-all`, `space-x/space-y`, `<hr>` brut ni z-index
  numérique dans les sources shadcn;
- aucune composition produit dans `src/components/shadcn/`;
- overlays sur l’échelle `--z-*`;
- budget d’entrée desktop 950 Ko;
- budget Galerie JS 750 Ko et CSS 75 Ko;
- tests frontend, sidecar, visuels, parity, diff et E2E;
- protocole de kill/build/relaunch et `/health` sur l’app buildée.

## Verdict

La migration shadcn du périmètre retenu est complète. Toutes les primitives
installées ont un rôle vérifié; les composants non installés ont une décision
explicite; le chat, le composer, les overlays, le feedback, la navigation
générique et le chrome Galerie utilisent la fondation commune sans effacer les
composants métier d’Atelier.

« Complète » ne signifie pas « chaque balise est shadcn » : les interactions
scientifiques, WebView, éditeurs, timeline et navigation spécialisée restent
possédées par le produit. C’est une frontière intentionnelle et testée.
