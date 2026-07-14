# Plan 036 — Typeset et achèvement shadcn des surfaces Atelier

> **Mandat d’exécution** : terminer la migration shadcn des surfaces où une
> primitive officielle apporte un gain produit réel, en commençant par le chat,
> le composer et la conformité de la Galerie. La migration doit préserver les
> contrats métier Atelier, le rendu scientifique, le streaming, les performances
> et l’identité Precision Native.

## 0. Positionnement du plan

- **Statut** : TERMINÉ.
- **Date de référence** : 2026-07-13.
- **Priorité** : P0 pour Typeset et la famille chat; P1/P2 pour le reste.
- **Effort estimé** : XL, 10 lots indépendants.
- **Risque principal** : scroll et streaming du chat, régressions Markdown,
  focus clavier du composer et bridge React/DOM de la Galerie.
- **Plan parent** : `plans/035-shadcn-ui-complete-migration.md`.
- **Inventaire de départ** :
  `docs/ui/SHADCN_COMPONENT_AUDIT_2026-07-13.md`.
- **Gouvernance** : `docs/ui/DESIGN_SYSTEM_GOVERNANCE.md`.
- **Relance obligatoire** : `AGENTS.md` après chaque lot modifiant le code.

### Journal d’exécution

| Lot | État | Preuve courante |
|---|---|---|
| 0 — Baseline et caractérisation | TERMINÉ | 339 tests frontend, 346 tests sidecar, TypeScript/Vite verts; entrée 933,66 Ko; baseline visuelle capturée |
| 1 — Typeset | TERMINÉ | Source officielle + preset chat; final/streaming, code/Mermaid et tableaux couverts; 342 tests frontend verts |
| 2 — MessageScroller | TERMINÉ | Primitive officielle + @shadcn/react; auto-follow, détachement, ancres et navigation couverts; 343 tests + 14 visuels verts |
| 3 — Message + Bubble | TERMINÉ | Tours utilisateur/assistant/streaming composés; footer d’actions préservé; 344 tests + 14 visuels verts |
| 4 — Marker + Collapsible | TERMINÉ | ActivityDisclosure et statut Working migrés; 344 tests frontend, 346 sidecar et 14 visuels verts |
| 5 — Composer | TERMINÉ | InputGroup/ButtonGroup/DropdownMenu/Toggle + Field/Input; 353 tests frontend, 346 sidecar, 14 visuels; entrée 945 Ko |
| 6 — Primitives installées | TERMINÉ | Tooltip/Popover officiels, Toaster unique lazy, Field formulaires, Skeleton galerie, ContextMenu onglets; 358 frontend, 346 sidecar, 14 visuels; entrée 949 Ko; app/health verts |
| 7 — Navigation/P2 | TERMINÉ | Command Palette officielle lazy + Kbd, Progress GoalBar, Attachment repoli; 361 frontend, 346 sidecar, 14 visuels; entrée 947 Ko; app/health verts |
| 8 — Galerie | TERMINÉ | Chrome React/shadcn conforme, Rescan direct dans le header, stacking partagé panel/modal, Tooltip icône, Tailwind isolé; parity + 166 diff + 50 E2E; CSS 37,9 Ko; staged/app/health verts |
| 9 — Nettoyage/audit | TERMINÉ | Audit 64 composants actualisé; 38 sources, 0 inutilisée; next-themes retiré; 363 frontend, 346 sidecar, parity + 166 diff; entrée 947 Ko |

Ce plan ne cherche pas à installer les 64 composants officiels. Il termine les
composants classés pertinents par l’audit et conserve explicitement les
composants « non planifiés » hors du bundle tant qu’aucun besoin produit ne les
justifie.

Typeset est traité séparément : ce n’est pas une primitive du registre shadcn
et le CLI ne l’installe pas. C’est un fichier CSS officiel, possédé par le
projet, destiné au HTML et au Markdown rendu.

## 1. Résultat attendu

À la fin du plan :

1. les réponses Markdown utilisent un preset `typeset-chat` compatible avec
   GFM, KaTeX, Mermaid, Highlight.js, références de fichiers et streaming;
2. `MessageScroller` possède le scroll, l’ancrage des tours, le suivi du
   streaming et le bouton de retour au dernier message;
3. les tours sont structurés par `Message` et leurs surfaces par `Bubble`, sans
   perte d’actions, de sélection, de pin, de fork ou de reviewer;
4. les notes système et séparateurs annotés utilisent `Marker`;
5. les groupes repliables génériques du chat utilisent `Collapsible`;
6. le composer utilise `InputGroup`, `ButtonGroup`, `Button`, les menus
   officiels appropriés et une composition accessible;
7. Tooltip, Sonner, Command, Separator et Skeleton sont réellement adoptés ou
   retirés après décision documentée;
8. la Galerie respecte les contrats shadcn et étend uniquement son chrome
   générique, sans convertir ses moteurs scientifiques;
9. les composants P2 pertinents sont évalués un à un et installés seulement
   avec un consommateur réel;
10. l’audit final distingue clairement source installée, usage produit et
    occurrences historiques volontairement spécialisées.

## 2. Architecture cible

```text
src/styles/tokens.css
  └─ valeurs et rôles Precision Native

src/styles/shadcn.css
  ├─ Tailwind v4 préfixé tw, sans Preflight
  ├─ mapping des tokens shadcn
  └─ import de typeset.css après Tailwind

src/styles/typeset.css
  ├─ source Typeset possédée par Atelier
  ├─ classe de base .typeset
  └─ preset .typeset-chat

src/components/shadcn/
  └─ sources officielles ajoutées par le CLI

src/components/ui/
  └─ API produit et adaptateurs Atelier

src/components/chat/
  ├─ compositions MessageScroller/Message/Bubble/Marker
  ├─ renderer Markdown spécialisé conservé
  └─ composer agentique composé avec shadcn

gallery/react-ui/
  └─ chrome React/shadcn isolé au-dessus du moteur legacy
```

### Frontières à préserver

- `react-markdown`, `remark-gfm`, `remark-math` et `rehype-katex` restent le
  pipeline de contenu.
- Mermaid et Highlight.js restent propriétaires de leurs rendus spécialisés.
- Les références `fichier:ligne` restent cliquables et ouvrent Atelier.
- Les résultats d’outils, diffs, reviewers, plans, goals et événements
  agentiques restent des composants métier.
- CodeMirror, xterm, les éditeurs internes et les cartes scientifiques de la
  Galerie ne sont pas convertis automatiquement.
- `mobile/` reste hors périmètre de ce plan.

## 3. Règles de travail communes à chaque lot

### 3.1 Avant toute primitive shadcn

```bash
npx shadcn@latest info --json
npx shadcn@latest docs <component>
npx shadcn@latest search @shadcn -q "<component>" -t ui
npx shadcn@latest add <component> --dry-run
```

Si le dry-run touche un fichier existant, exécuter ensuite :

```bash
npx shadcn@latest add <component> --diff <fichier>
```

Lire intégralement chaque source ajoutée. Ne jamais utiliser `--overwrite`,
`--force` ou `add --all`. Si la commande CLI se bloque sur le DNS macOS,
documenter la limitation, interrompre uniquement ce processus et ne pas
inventer la source de la primitive.

### 3.2 Contrats permanents

- Base UI et style `base-nova` seulement.
- Sources officielles dans `src/components/shadcn/`.
- API produit dans `src/components/ui/`.
- Préfixe Tailwind `tw` partout dans les classes générées.
- Aucun Preflight global.
- Couleurs sémantiques et tokens Precision Native, aucune couleur brute.
- Aucun z-index local sur Dialog, Sheet, Popover, Tooltip ou autres overlays.
- `className` sert au layout, pas à recolorer ou refaire une primitive.
- `gap-*`, jamais `space-x-*` ou `space-y-*`.
- Icônes Lucide sans sizing local à l’intérieur des composants shadcn.
- `data-icon` pour les icônes de Button.
- Durées Quiet Instrument inférieures ou égales à 150 ms.
- Dark/light, reduced-motion, clavier et focus font partie du DONE.

### 3.3 Taille des lots

Une primitive structurelle par lot de risque :

- Typeset seul;
- MessageScroller seul;
- Message + Bubble ensemble parce que leur composition est indissociable;
- Marker + Collapsible après stabilisation des tours;
- composer après stabilisation de la timeline.

Ne pas migrer simultanément le scroll, le renderer Markdown et le composer.

## 4. Lot 0 — Baseline et tests de caractérisation

### Objectif

Verrouiller le comportement visible actuel avant de changer sa structure.

### Actions

1. Enregistrer `git status --short --branch` et préserver toutes les
   modifications hors périmètre.
2. Inventorier les responsabilités actuelles de `ChatTimeline.tsx`,
   `turns.tsx`, `md.tsx`, `ChatComposer.tsx`, `PromptInput.tsx` et
   `ComposerControls.tsx`.
3. Capturer les métriques Vite : taille de l’entrée, chunks Markdown/KaTeX et
   chunk Base UI.
4. Ajouter ou compléter des tests de caractérisation pour :
   - collage au dernier message lorsqu’on est près du bas;
   - détachement lorsque l’utilisateur remonte;
   - apparition et activation de la navigation de retour;
   - conservation de la position pendant le streaming;
   - sélection de texte et création de citation;
   - rendu accueil, état vide et thread existant;
   - actions copy/edit/revert/pin/fork;
   - code en streaming sans Highlight.js coûteux;
   - upgrade KaTeX après chargement différé;
   - tableau large, Mermaid et référence de fichier;
   - IME, Entrée, Maj+Entrée, Échap et collage dans le composer.
5. Capturer des screenshots dark/light à 800, 1280 et 1512 px dans l’app
   buildée, avec une conversation contenant texte, listes, tableau, code,
   maths, outil, pièce jointe et réponse en streaming.

### Critère de sortie

Les tests décrivent le comportement actuel sans dépendre inutilement des noms
de classes historiques. Aucun changement visuel n’est introduit dans ce lot.

## 5. Lot 1 — Introduire Typeset pour le Markdown du chat

### Documentation obligatoire

- <https://ui.shadcn.com/docs/typeset>
- <https://ui.shadcn.com/typeset>
- <https://ui.shadcn.com/llms.txt>

### Actions

1. Exporter le `typeset.css` actuel depuis le builder officiel; ne pas
   reconstruire le système de mémoire.
2. Ajouter `src/styles/typeset.css` et l’importer après Tailwind dans
   `src/styles/shadcn.css`.
3. Créer un preset `.typeset-chat` piloté principalement par :
   - `--typeset-size`;
   - `--typeset-leading`;
   - `--typeset-flow`;
   - les fontes body/heading/mono existantes.
4. Mapper couleurs, rayon et fontes sur les tokens Atelier; ne pas ajouter une
   palette dark séparée.
5. Ajouter `typeset typeset-chat` autour de chaque `ReactMarkdown` assistant,
   terminé ou en streaming.
6. Laisser la bulle utilisateur en texte simple au départ; n’activer Typeset
   que si son contrat Markdown est explicitement conservé.
7. Marquer `codeblock`, Mermaid, composants interactifs, actions et autres
   sous-arbres spécialisés avec `not-typeset` ou `data-not-typeset` lorsque
   Typeset perturbe leur géométrie.
8. Conserver le wrapper `.md-table` ou le remplacer par `typeset-scroll` après
   comparaison; le tableau doit rester un vrai `<table>` et défiler
   horizontalement sans élargir la timeline.
9. Supprimer uniquement les règles `.msg h*`, `.msg p`, `.msg ul/ol`,
   `.msg blockquote`, `.msg table` et `.msg code` devenues redondantes. Les
   règles spécifiques à KaTeX, Highlight.js, Mermaid et aux file refs restent.
10. Ajouter un test de contrat CSS interdisant une seconde typographie
    Markdown globale hors `typeset.css`.

### Critères d’acceptation

- Aucun saut de marge d’un bloc déjà rendu lorsqu’un nouveau bloc est streamé.
- Titres, paragraphes, listes, citations et tableaux ont un rythme cohérent.
- Les blocs code, KaTeX et Mermaid sont visuellement inchangés ou améliorés de
  façon intentionnelle.
- Les références de fichiers restent accessibles au clavier.
- Les tableaux larges n’élargissent pas le chat.
- Le texte reste lisible à 800 px et au zoom 125 %.

### Condition STOP

Arrêter si Typeset impose Preflight, casse KaTeX/Mermaid, augmente fortement le
layout shift ou nécessite des `!important` généralisés.

## 6. Lot 2 — Remplacer le scroll manuel par MessageScroller

### Primitive

`MessageScroller`, `MessageScrollerProvider`, `MessageScrollerViewport`,
`MessageScrollerContent`, `MessageScrollerItem` et `MessageScrollerButton`.

### Actions

1. Exécuter le workflow CLI complet pour `message-scroller` et examiner la
   dépendance `@shadcn/react`.
2. Lire l’API des hooks uniquement comme escape hatch; privilégier la
   composition standard.
3. Remplacer dans `ChatTimeline.tsx` uniquement :
   - le conteneur `.messages` propriétaire du scroll;
   - `messagesRef` lorsqu’il ne sert plus qu’au scroll;
   - `stickRef`;
   - le calcul `scrollHeight - scrollTop - clientHeight`;
   - `showJump` et le gating manuel du retour au dernier message.
4. Conserver verbatim le rendu de `renderedEvents` durant ce lot.
5. Envelopper chaque enfant direct mesurable dans un
   `MessageScrollerItem` avec une clé et un `messageId` stables.
6. Utiliser `scrollAnchor` sur le tour utilisateur qui ouvre un échange.
7. Laisser `MessageScrollerButton` gérer sa propre visibilité et son action.
8. Adapter ou retirer `JumpNavigation` seulement pour la fonction « dernier
   message ». Conserver toute navigation « précédent/suivant » métier qui
   n’est pas couverte par la primitive.
9. Préserver `onMouseUp` au bon niveau afin que la création de citation à partir
   d’une sélection continue de fonctionner.
10. Tester l’ajout d’historique en amont si Atelier charge des événements plus
    anciens; aucune position ne doit sauter.

### Critères d’acceptation

- Le streaming suit le bord bas seulement lorsque l’utilisateur y était.
- Remonter détache immédiatement le suivi sans combat de scroll.
- Le bouton de retour apparaît et disparaît selon l’état interne officiel.
- Cliquer un résultat de recherche ou une navigation vers `msg-*` fonctionne.
- L’accueil et l’état vide occupent correctement le viewport.
- Aucun hook maison de stick-to-bottom ou calcul manuel ne subsiste.

### Condition STOP

Arrêter si les identifiants d’événements ne permettent pas des
`MessageScrollerItem` stables ou si une navigation métier dépend d’un ref DOM
non exposé. Ajouter alors un adaptateur basé sur les hooks officiels, pas un
second moteur de scroll.

## 7. Lot 3 — Structurer les tours avec Message et Bubble

### Primitives

`Message`, `MessageGroup`, `MessageContent`, `MessageHeader`, `MessageFooter`,
`Bubble`, `BubbleContent` et, si nécessaire, `BubbleGroup`.

### Actions

1. Exécuter docs, search, dry-run et diff pour `message` et `bubble`.
2. Créer une composition produit dans `src/components/chat/`, sans placer de
   logique métier dans `src/components/shadcn/`.
3. Migrer d’abord un tour assistant statique :
   - `Message align="start"`;
   - `MessageContent`;
   - `Bubble` avec une variante Precision Native approuvée;
   - `BubbleContent` contenant le renderer Typeset/Markdown existant;
   - actions dans un footer ou une zone produit adjacente.
4. Migrer ensuite le tour assistant en streaming avec exactement le même arbre
   afin d’éviter un remount structurel à la fin du streaming.
5. Migrer le tour utilisateur avec `Message align="end"` et Bubble, en
   conservant édition, renvoi et rendu des mentions.
6. Grouper uniquement les événements réellement consécutifs du même rôle avec
   `MessageGroup`; ne pas absorber les événements outil ou système.
7. Décider Avatar séparément : ajouter `Avatar` seulement si une identité
   visible apporte de l’information. Toujours fournir `AvatarFallback`.
8. Remplacer les boutons d’action génériques par l’API produit Button/
   IconButton et Tooltip; conserver des labels accessibles.
9. Supprimer `.msg-wrap`, `.msg`, `.user-bubble` et `.msg-actions` seulement
   lorsque tous leurs consommateurs sont migrés.

### Critères d’acceptation

- Le contenu Markdown n’est pas reparsé ou remounté inutilement.
- Les actions copy/edit/revert/pin/fork restent identiques au clavier et à la
  souris.
- Les tours utilisateur/assistant restent visuellement sobres et compacts.
- Les résultats d’outils et panneaux reviewer conservent leur hiérarchie.
- Les ancres `msg-*` et la recherche dans la conversation fonctionnent.
- Aucun `div` ne recrée manuellement une bulle générique.

## 8. Lot 4 — Marker et Collapsible pour les événements secondaires

### Marker

1. Inventorier les événements système, séparateurs de date, changements de
   provider, reprises, états et notes centrées.
2. Migrer les lignes sémantiquement équivalentes vers `Marker` :
   - `default` pour une note simple;
   - `separator` pour un libellé entre deux règles;
   - `border` pour une ligne de statut bordée.
3. Utiliser `MarkerIcon` et `MarkerContent`; ne pas composer Separator + span.
4. Ne pas utiliser Marker pour un résultat d’outil interactif ou une alerte.

### Collapsible

1. Exécuter le workflow CLI complet pour `collapsible`.
2. Migrer `ActivityDisclosure` et les groupes d’outils génériques après tests
   de caractérisation.
3. Utiliser l’API Base UI `render`, jamais `asChild`.
4. Conserver l’état contrôlé lorsqu’il est persistant ou piloté par le modèle.
5. Vérifier `aria-expanded`, clavier, focus et reduced-motion.

### Critères d’acceptation

- Les notes système ne ressemblent pas à des messages utilisateur.
- Les disclosures conservent résumé, durée, nombre d’outils et contenu.
- Aucune animation de hauteur non bornée ou supérieure à 150 ms.
- Les résultats importants ne sont pas cachés par défaut sans décision produit.

## 9. Lot 5 — Composer avec InputGroup et ButtonGroup

### Primitives candidates

- `InputGroup`, `InputGroupTextarea`, `InputGroupAddon`;
- `ButtonGroup`, `ButtonGroupSeparator`, `ButtonGroupText`;
- Button, DropdownMenu, Popover, Select, Toggle, Tooltip;
- Command pour les suggestions si son contrat convient.

### Actions

1. Caractériser avant migration : auto-resize, backdrop des mentions, IME,
   collage image/texte, suggestions, submit, stop, quick ask, modèles,
   permissions, effort, goal et indicateur de contexte.
2. Installer `input-group` et `button-group` séparément avec dry-run/diff.
3. Remplacer le conteneur du textarea par `InputGroup` et le contrôle par
   `InputGroupTextarea`; ne jamais placer le `Textarea` brut dans InputGroup.
4. Conserver le backdrop de mentions comme couche produit `data-not-typeset` et
   vérifier qu’il suit exactement le scroll et la typographie du textarea.
5. Positionner les actions attachées avec `InputGroupAddon`, sans absolute
   positioning maison lorsqu’une composition officielle existe.
6. Regrouper les actions adjacentes avec ButtonGroup uniquement lorsqu’elles
   forment un ensemble visuel et fonctionnel.
7. Convertir les boutons toggle binaires en `Toggle`; conserver ToggleGroup
   pour les ensembles de 2 à 7 choix.
8. Migrer le menu « + » vers DropdownMenu si le mélange menuitem/
   menuitemcheckbox est couvert sans perte de contrat; sinon créer une
   composition produit documentée au-dessus des primitives officielles.
9. Conserver Select pour les permissions courtes. Évaluer Combobox pour les
   longues listes de modèles/projets seulement après mesure réelle.
10. Évaluer Command pour la liste `/skill` et `@fichier` : groupes, empty,
    sélection, virtualisation éventuelle et application sur Entrée/Tab.
11. Remplacer les couleurs brutes de l’anneau de contexte par des tokens
    sémantiques; évaluer Progress seulement si l’information est réellement un
    progrès déterminé.
12. Migrer l’éditeur de goal vers Field + Input + ButtonGroup et appliquer
    `data-invalid`/`aria-invalid` si une validation est affichée.

### Décisions d’exécution du Lot 5

- `InputGroup`, `InputGroupTextarea` et `InputGroupAddon` portent désormais la
  surface de saisie; le backdrop de mentions reste une couche produit marquée
  `data-not-typeset`.
- `ButtonGroup` est limité aux outils Quick Ask/ajout, aux actions goal et au
  couple file d’attente/envoi. Le favori modèle est un `Toggle` contrôlé.
- Le menu « + » est migré vers `DropdownMenu`; Plan et Auto-review utilisent
  des `DropdownMenuCheckboxItem`, avec focus et navigation gérés par Base UI.
- `Select` reste le bon contrôle pour les quatre permissions. `Combobox` n’est
  pas adopté pour le modèle, car ce panneau compose aussi effort, favoris et
  contexte Claude; ce n’est pas une simple longue liste.
- `Command` est réservé au Lot 7 et à la palette globale. Dans le composer, il
  prendrait le focus au textarea et modifierait les contrats IME, Tab et
  Entrée; le listbox léger existant reste annoncé et couvert. Le dry-run CLI
  imposerait en outre l’écrasement de cinq primitives Atelier adaptées.

### Critères d’acceptation

- IME ne déclenche jamais l’envoi.
- Entrée, Maj+Entrée, Option+Entrée, Échap et Tab restent corrects.
- Les suggestions restent alignées, navigables et correctement annoncées.
- Le textarea n’est jamais masqué par ses addons.
- Le focus retourne au déclencheur après fermeture d’un menu.
- Le composer reste utilisable à 800 px et avec texte très long.
- Aucun positionnement absolu générique ne remplace InputGroup.

## 10. Lot 6 — Terminer les primitives déjà installées

### Tooltip

1. Remplacer le portail maison de `src/components/ui/Tooltip.tsx` par la
   primitive officielle.
2. Monter un `TooltipProvider` unique au niveau approprié.
3. Conserver le délai Atelier, les labels accessibles et le fonctionnement au
   clavier.

### Sonner

1. Monter exactement un `Toaster`.
2. Cartographier succès, erreur, information et action Undo.
3. Remplacer uniquement les notifications web éphémères; conserver les alertes
   persistantes dans `Alert` et les erreurs natives appartenant à Tauri.

### Separator, Skeleton et ContextMenu

Pour chacun, prendre une décision explicite :

- **adopter** avec au moins un consommateur et un test;
- **conserver comme dépendance** si une primitive installée l’importe;
- **retirer** si la source est inutilisée et sans dépendant.

Cas pressentis : Separator pour les séparations génériques hors Marker;
Skeleton pour chargements de projets/galerie; ContextMenu uniquement pour de
vrais clics droits, jamais comme doublon systématique de DropdownMenu.

### Popover et Field

- Terminer les popovers génériques restant sur une implémentation maison.
- Compléter Field dans Settings, HarnessInteraction et l’éditeur de goal.
- Chaque Dialog/Sheet conserve Title, description et retour focus.

### Décisions d’exécution du Lot 6

- `Tooltip` et `Popover` passent par les primitives Base UI officielles; un
  seul `TooltipProvider` est monté dans `AppOverlays` avec le délai Atelier de
  420 ms.
- `Sonner` est adopté avec exactement un `Toaster` global et les API produit
  succès, erreur, information et Undo. Son chunk est chargé hors de l’entrée;
  les alertes persistantes et natives restent inchangées.
- `Skeleton` est adopté pour le chargement de la galerie principale.
- `ContextMenu` remplace le menu artisanal au clic droit des onglets Atelier,
  avec épinglage, inspection, couleur et fermeture accessibles.
- `Separator` est conservé comme dépendance officielle de `ButtonGroup`,
  `Field` et `Sidebar`; il ne remplace pas `Marker` dans le chat.
- `Field` couvre Settings, l’éditeur de goal et `HarnessInteraction`; les
  radios conservent un nom accessible propre à chaque option.
- `DropdownMenuSurface` et Sonner sont lazy-loadés pour respecter le budget
  bloquant : entrée de production 949 Ko pour une limite de 950 Ko.
- Preuves : 358 tests frontend, 346 sidecar, parity galerie, 166 tests diff,
  14 tests visuels, build Tauri signé exit 0, app et sidecar Rust `/health`
  verts.

## 11. Lot 7 — Command Palette, navigation et composants P2

### Ordre d’évaluation

1. `Command` pour `CommandPalette` et éventuellement les suggestions du
   composer.
2. `Kbd` pour afficher les raccourcis réellement actifs.
3. `Breadcrumb` pour les chemins Explorer/projet.
4. `Item` pour des lignes génériques qui ne sont ni ThreadRow ni résultat
   scientifique.
5. `ScrollArea` pour panneaux ordinaires, jamais pour le chat.
6. `Progress` pour opérations déterminées et GoalBar si les données sont
   réelles.
7. `Accordion` après Collapsible, uniquement pour des groupes structurés.
8. `Combobox` lorsque Select devient réellement trop long.
9. `HoverCard` pour une information riche non essentielle au clic.
10. `Avatar` si la migration Message révèle un besoin d’identité visible.
11. `Toggle` pour les états pressed binaires.
12. `Resizable` dans un spike isolé Tauri/iframe/restauration de layout.

### Garde-fous

- Ne pas installer toute cette liste à l’avance.
- Un composant = un consommateur identifié + tests + mesure bundle.
- Resizable ne remplace pas le splitter actuel sans preuve sur iframe,
  persistance, clavier et taille minimale.
- Card, Table, DataTable, Chart, Drawer, Calendar et autres composants classés
  non planifiés restent hors périmètre.

### Décisions d’exécution du Lot 7

- `Command` remplace la liste artisanale de la palette globale tout en
  conservant le scoring flou Atelier. Le chunk `cmdk` est lazy-loadé seulement
  à l’ouverture; navigation clavier, Entrée, Échap et retour focus sont testés.
- `Kbd` rend les raccourcis réellement actifs dans le pied de la palette, avec
  libellés français et anglais.
- `Progress` est adopté uniquement dans `GoalBar`, où `tokensUsed` et
  `tokenBudget` fournissent une progression déterminée réelle.
- `Attachment`, déjà officiel, est repoli avec une seule surface discrète, un
  média sémantique et une action circulaire silencieuse; les pièces jointes,
  textes collés, images et citations groupées conservent leurs contrats.
- `Breadcrumb`, `Item`, `ScrollArea`, `Accordion`, `Combobox`, `HoverCard` et
  `Avatar` ne sont pas installés faute de consommateur produit justifié.
  `Resizable` reste refusé sans spike prouvant iframe, persistance, clavier et
  tailles minimales. `Toggle` était déjà adopté au Lot 5.
- Preuves : 361 tests frontend, 346 sidecar, 14 tests visuels, TypeScript et
  Vite verts; entrée 947 Ko pour une limite de 950 Ko; build Tauri signé et
  DMG générés; app buildée et sidecar Rust `/health` verts.

## 12. Lot 8 — Conformité et extension raisonnée de la Galerie

### Corrections immédiates

1. Retirer l’attribut `type="search"` dupliqué.
2. Retirer les z-index locaux de `AlertDialogContent` et `SheetContent`; porter
   le contrat de stacking dans la primitive ou l’adaptateur partagé si le
   WebView l’exige.
3. Retirer sizing et positionnement locaux inutiles des icônes de Button.
4. Vérifier les groupes de DropdownMenu et Select.
5. Conserver les Title/Description obligatoires de Sheet et AlertDialog.

### Extensions possibles

- Tooltip pour les boutons icônes du chrome React.
- Skeleton pour chargement du catalogue.
- Empty pour absence de résultats.
- Badge/Toggle pour filtres d’état génériques.
- Breadcrumb pour le dossier courant si le besoin est visible.

### Frontière stricte

Ne pas migrer automatiquement : cartes de figures, lightbox, annotations,
workflow scientifique, moteurs de recherche/tri, éditeurs, CodeMirror,
protocoles `postMessage` et persistance `/state`.

### Validation Galerie

```bash
(cd gallery && node server/tests/parity.mjs)
(cd gallery && node server/tests/diff_suite.mjs)
npm run verify:e2e
```

Vérifier également les budgets du bundle React de la Galerie et la copie
staged dans le bundle final.

### Décisions d’exécution du Lot 8

- La barre de commande React conserve `InputGroup`, `DropdownMenu`, `Select`,
  `ToggleGroup`, `Button`, `AlertDialog` et `Sheet`; les groupes de menus et de
  sélections sont explicites et les Title/Description restent présents.
- L’attribut `type="search"` redondant est retiré. Le bouton icône des outils
  utilise l’adaptateur `Tooltip` shadcn partagé et son provider local à la racine
  React de la Galerie.
- Le stacking n’appartient plus aux consommateurs Galerie. Les primitives
  partagées utilisent l’échelle `--z-*`; `SheetContent` distingue le panneau
  desktop non modal du tiroir mobile modal, ce qui préserve la lightbox et les
  outils d’annotation.
- La frontière legacy reste intacte : cartes, lightbox, annotation, workflow,
  recherche/tri, éditeurs, protocoles `postMessage` et persistance ne sont pas
  réécrits.
- Le build Tailwind de la Galerie est isolé à `gallery/react-ui` et aux seules
  primitives importées. Le CSS produit passe de 75,4 Ko à 37,7 Ko; le JS reste
  à 726,5 Ko sous la limite de 750 Ko.
- Preuves : parity verte, 166 tests diff, 50 E2E, 361 frontend, 346 sidecar et
  14 visuels; source et `src-tauri/gallery-dist` identiques pour les artefacts
  contrôlés; app buildée et sidecar Rust `/health` verts. Le second build a
  produit l’app signée mais le DMG a rencontré l’échec cosmétique autorisé de
  `bundle_dmg.sh`, sans autre erreur.

## 13. Lot 9 — Nettoyage, audit final et documentation

### Nettoyage

1. Supprimer les classes historiques devenues sans consommateur.
2. Supprimer le scroll manuel, les bulles génériques maison, les séparateurs
   annotés maison et les groupes de boutons génériques remplacés.
3. Conserver les composants métier dont le contrat dépasse la primitive.
4. Auditer les balises `<button>`, `<input>`, `<textarea>`, `<table>` et les
   overlays bruts restants; documenter chaque catégorie légitime.
5. Vérifier qu’aucune composition produit n’a glissé dans
   `src/components/shadcn/`.
6. Étendre `css-contract.test.ts` aux nouveaux fichiers et interdire les
   anciennes classes supprimées.

### Documentation

1. Mettre à jour le statut de ce plan lot par lot.
2. Mettre à jour `SHADCN_COMPONENT_AUDIT_2026-07-13.md` avec :
   - source installée;
   - usage produit;
   - couverture desktop;
   - couverture Galerie;
   - décision non planifiée.
3. Ajouter Typeset dans une section « fondations hors composants ».
4. Mettre à jour `DESIGN_SYSTEM_GOVERNANCE.md` avec le contrat
   `typeset.css`, MessageScroller et la frontière des composants métier.
5. Documenter les écarts locaux indispensables par rapport aux sources
   officielles.

### Décisions d’exécution du Lot 9

- L’audit final couvre les 64 composants : 36 faits, 1 partiel (`Sidebar`),
  1 dépendance (`Separator`), 8 évalués non retenus et 18 non planifiés.
- Les 38 sources présentes dans `src/components/shadcn/` ont toutes un usage
  direct ou une dépendance explicite; aucune composition produit n’y est
  importée.
- `next-themes`, seule dépendance orpheline, est retirée. `cmdk` et `sonner`
  restent parce qu’ils ont des consommateurs vérifiés.
- L’audit des balises natives recense 64 boutons directs spécialisés, un color
  picker natif, aucune textarea/select/hr brute et deux tables métier. Leur
  justification et leurs principales concentrations sont documentées.
- `css-contract.test.ts` verrouille désormais l’inventaire exact, la frontière
  Galerie, l’absence de stacking local et les règles du skill shadcn.
- Preuves avant bundle final : 363 tests frontend, 346 sidecar, TypeScript et
  Vite verts, parity Galerie et 166 tests diff verts; entrée 947 Ko sous la
  limite de 950 Ko. Les preuves visuelles et E2E immédiatement précédentes
  restent respectivement à 14/14 et 50/50.

## 14. Matrice de validation par lot

| Lot | Tests ciblés | Frontend complet | Galerie | Tauri buildé | Revue visuelle |
|---|---|---|---|---|---|
| 0 Baseline | Oui | Oui | Si capturée | Oui | Oui |
| 1 Typeset | Markdown/streaming | Oui | Non | Oui | Obligatoire |
| 2 MessageScroller | scroll/ancrage | Oui | Non | Oui | Obligatoire |
| 3 Message/Bubble | tours/actions | Oui | Non | Oui | Obligatoire |
| 4 Marker/Collapsible | événements/a11y | Oui | Non | Oui | Obligatoire |
| 5 Composer | IME/clavier/menus | Oui | Non | Oui | Obligatoire |
| 6 Primitives installées | overlay/feedback | Oui | Selon usage | Oui | Oui |
| 7 Navigation/P2 | composant concerné | Oui | Selon usage | Oui | Oui |
| 8 Galerie | bridge/parity/E2E | Oui | Obligatoire | Oui | Obligatoire |
| 9 Nettoyage | contrats anti-retour | Oui | Obligatoire | Oui | Finale |

### Vérifications frontend minimales

```bash
npx tsc --noEmit
npx vite build
npx vitest run
node scripts/check_entry_budget.mjs
git diff --check
```

Le budget d’entrée de 950 KB reste bloquant. KaTeX et les dépendances de
contenu doivent continuer à être chargés hors du chemin critique lorsque cela
est déjà le cas.

### Protocole de relance après chaque modification

Suivre `AGENTS.md` exactement :

1. `npx tsc --noEmit`;
2. `npx vite build`;
3. `(cd sidecar && npx vitest run)`;
4. parity/diff si `gallery/` est touché;
5. tuer `tauri-app`, sidecars Node/Rust et tous les `server/main.mjs`;
6. supprimer le DMG et lancer `npm run tauri build` avec log;
7. vérifier l’absence d’erreur hors exception DMG autorisée;
8. ouvrir le bundle macOS construit;
9. vérifier `tauri-app`, pid/lock et `/health` après convergence;
10. vérifier le comportement dans l’app réelle, jamais seulement dans les
    sources ou Vite.

## 15. Critères visuels transversaux

Pour chaque lot visible :

- dark et light;
- largeurs 800, 1280 et 1512 px;
- zoom 125 %;
- texte français et anglais long;
- réponse courte, longue et streaming;
- clavier seul;
- focus visible et retour focus;
- reduced-motion;
- sélection et copie de texte;
- tableau, code, KaTeX, Mermaid et pièce jointe;
- overlay au-dessus des iframes et panneaux;
- absence de scroll horizontal global;
- aucune animation continue supplémentaire.

Les screenshots ne sont pas mis à jour automatiquement. Toute baseline
visuelle modifiée doit être revue comme un changement intentionnel.

## 16. Conditions STOP générales

Arrêter le lot si :

- le CLI veut écraser un composant adapté sans smart merge;
- `components.json` change de base, style, aliases ou préfixe;
- Preflight apparaît;
- le scroll lutte contre l’utilisateur ou perd sa position;
- le streaming remount les blocs précédents;
- KaTeX, Mermaid, Highlight.js ou les file refs régressent;
- le composer casse IME, Tab, Escape ou le retour focus;
- un overlay passe derrière une iframe;
- le bundle d’entrée dépasse 950 KB;
- un test existant échoue sans explication liée au lot;
- la Galerie sert une copie staged différente de `gallery/`;
- l’app buildée ou le sidecar ne converge pas après le protocole AGENTS.

## 17. Séquence d’exécution recommandée

```text
Lot 0  Baseline et caractérisation
  ↓
Lot 1  Typeset
  ↓
Lot 2  MessageScroller
  ↓
Lot 3  Message + Bubble
  ↓
Lot 4  Marker + Collapsible
  ↓
Lot 5  InputGroup + ButtonGroup du composer
  ↓
Lot 6  Tooltip + Sonner + primitives installées
  ↓
Lot 7  Command et composants P2 justifiés
  ↓
Lot 8  Conformité Galerie
  ↓
Lot 9  Nettoyage, audit et validation finale
```

Chaque flèche signifie : tests verts, build Tauri relancé, app réelle vérifiée
et résultat accepté avant de modifier la structure suivante.

## 18. Définition de DONE globale

Le plan est terminé uniquement lorsque :

- tous les lots retenus sont marqués terminés avec preuves;
- Typeset est la seule fondation typographique générique du Markdown chat;
- MessageScroller possède tout le comportement de scroll chat;
- Message/Bubble structurent les tours ordinaires;
- Marker et Collapsible couvrent leurs besoins génériques;
- le composer utilise les groupes officiels sans perte fonctionnelle;
- les primitives installées ont un usage ou une justification documentée;
- la Galerie est conforme et son bridge legacy reste fonctionnel;
- les composants non planifiés ne sont pas ajoutés « au cas où »;
- les tests frontend, sidecar, Galerie, budget et Tauri passent;
- aucun zombie ne sert un ancien bundle;
- la version visible dans `Atelier.app` est celle qui a été validée;
- l’audit et la gouvernance reflètent l’état réel du code.

## 19. Sources officielles

- Typeset : <https://ui.shadcn.com/docs/typeset>
- Builder Typeset : <https://ui.shadcn.com/typeset>
- Composants : <https://ui.shadcn.com/docs/components>
- MessageScroller :
  <https://ui.shadcn.com/docs/components/base/message-scroller>
- MCP : <https://ui.shadcn.com/docs/mcp>
- Documentation LLM : <https://ui.shadcn.com/llms.txt>
- Skill projet : `.agents/skills/shadcn/SKILL.md`
- Règles chat : `.agents/skills/shadcn/rules/chat.md`
- Règles styling : `.agents/skills/shadcn/rules/styling.md`
- Règles composition : `.agents/skills/shadcn/rules/composition.md`
- Règles formulaires : `.agents/skills/shadcn/rules/forms.md`
- Règles Base/Radix : `.agents/skills/shadcn/rules/base-vs-radix.md`
