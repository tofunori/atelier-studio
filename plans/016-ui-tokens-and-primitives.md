# Plan 016: Installer les tokens et primitives UI partagés

> **Executor instructions**: charger `/efficient-fable`, puis relire
> `docs/ui/ATELIER_DESIGN.md`. Construire les primitives par besoin réel et les
> éprouver sur une petite surface existante. Ne pas lancer une migration CSS
> globale. Aucun framework UI ou CSS-in-JS.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/App.css src/styles src/components/ui src/components/TopBar.tsx src/components/Rail.tsx src/components/Settings.tsx src/main.tsx`
> puis `git status --short --` sur ces chemins.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 014 et 015
- **Category**: design system / accessibilité
- **Planned at**: commit `8baafca`, 2026-07-09

## Objectif

Créer un vocabulaire UI Atelier assez petit pour produire une cohérence de haut
niveau, sans transformer l'app en bibliothèque générique. Les futures surfaces
doivent pouvoir assembler des contrôles accessibles et visuellement cohérents
sans copier du CSS depuis `App.css`.

Le plan conserve le CSS vanilla et crée deux couches explicites :

```text
src/styles/tokens.css       valeurs sémantiques et thèmes
src/styles/primitives.css   règles partagées très stables
src/components/ui/          composants React accessibles
```

Les styles spécifiques aux surfaces restent près de leur surface ou dans la
feuille existante jusqu'à une migration justifiée. Pas de Tailwind, Sass,
styled-components, CSS Modules ou bibliothèque de composants.

## Étape 1 — Inventaire avant création

Établir un tableau dans le rapport du plan :

- couleurs de fond/texte/bordure réellement utilisées;
- rayons et ombres;
- hauteurs de boutons/inputs;
- tailles/poids typographiques;
- z-index;
- durées/easings;
- styles focus/hover/active/disabled;
- variantes de badges/statuts;
- duplications de menus, tooltips et segmented controls.

Pour chaque nouvelle variable, identifier au moins deux consommateurs futurs ou
une exigence sémantique forte. Ne pas créer de token `--gray-17` ou
`--spacing-card-title-left` spécifique à une occurrence.

## Étape 2 — Tokens sémantiques

Créer/normaliser les groupes suivants en respectant les valeurs approuvées :

- **surfaces** : app, panel, raised, inset, overlay;
- **texte** : primary, secondary, muted, disabled, inverse;
- **bordures** : subtle, default, strong, focus;
- **accent** : base, hover, active, subtle, text-on-accent;
- **statuts** : info, running, success, warning, error;
- **typographie** : chrome, body, label, caption, code, display si approuvé;
- **espacement** : 4, 8, 12, 16, 20, 24, 32;
- **formes** : radius-control 6, radius-surface 10, radius-pill;
- **mouvement** : fast 120 ms, standard 140 ms, panel 150 ms,
  `cubic-bezier(0.16, 1, 0.3, 1)`;
- **focus** : couleur, épaisseur, offset;
- **élévation** : popover/menu uniquement;
- **z-index** : base, sticky, popover, modal, toast.

Dark et light doivent partager les mêmes noms sémantiques. Aucun composant ne
conditionne sa logique React sur le thème pour choisir une couleur.

### Contrat Quiet Instrument

Implémenter la décision approuvée avec les tokens suivants, ou leurs noms
sémantiques équivalents déjà présents :

```css
--motion-fast: 120ms;
--motion-standard: 140ms;
--motion-panel: 150ms;
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
```

Les timings sont un contrat, pas des suggestions locales :

| Interaction | Propriété | Durée |
|---|---|---:|
| hover de ligne ou bouton | fond, texte ou opacity | 120 ms |
| press de bouton | `scale(.98)` | 120 ms |
| sélection | fond/outline + point orange en cross-fade | 140 ms |
| menu ou popover entrant | opacity + translate de 2 px | 140 ms |
| menu ou popover sortant | opacity | 120 ms |
| changement de contenu projet | cross-fade, sans déplacement de page | 140 ms max |
| inspecteur | opacity + `translateX(4px)` | 150 ms |
| ContextChip | opacity + `translateY(2px)` | 140 ms |
| échange d'icône | opacity + scale `.9` vers `1` | 120 ms |

Le tooltip attend 400–450 ms avant de paraître puis utilise un fade de 120 ms.
Les durées supérieures à 150 ms, springs, bounces, glows et effets décoratifs
sont interdits. Ne jamais utiliser `transition: all`, ni animer width, height,
padding ou margin. Un élément qui doit cross-fader ne bascule pas entre
`display:none` et `display:flex`; employer un état monté maîtrisé ou
opacity/visibility/pointer-events avec géométrie réservée.

Une surface active a un budget maximal d'**une animation continue** : spinner
ou point respirant, jamais les deux. Unread et Stop sont statiques; le label de
travail ne shimmer pas; Review réutilise le spinner standard; le caret de saisie
reste autorisé. Le geste signature source/figure → Add to context utilise un
cross-fade vers Added puis fait apparaître le `ContextChip`; aucun objet ne vole
à travers l'interface.

Le contrat `prefers-reduced-motion` est centralisé : supprimer translate, scale
et boucles, raccourcir ou neutraliser les transitions non essentielles, mais
préserver sélection, running, erreur et Added via texte, couleur et icônes
statiques. Le focus clavier reçoit le même feedback fonctionnel que le hover,
sans dépendre du pointeur.

## Étape 3 — Primitives minimales

Créer seulement les composants suivants, tous typés et couverts :

1. `Button` — primary, secondary, ghost, danger; loading; icône optionnelle.
2. `IconButton` — label accessible obligatoire, tooltip optionnel, trois tailles.
3. `Tooltip` — délai sobre, clavier, sortie écran, désactivé sur label visible.
4. `Menu` / `MenuItem` — navigation clavier, Escape, focus return, séparateur.
5. `Popover` — ancrage, outside click, Escape, focus initial/retour.
6. `SegmentedControl` — single select, flèches, état sélectionné.
7. `SurfaceHeader` — eyebrow optionnel, titre, statut, actions, overflow.
8. `EmptyState` — titre, description, une primaire, secondaires limitées.
9. `InlineNotice` — info/warning/error/success, action optionnelle.
10. `StatusBadge` — neutre/running/success/warning/error; texte obligatoire.
11. `InspectorPanel` — header sticky, body scrollable, footer actions optionnel.
12. `ContextChip` — type/source, label tronqué, remove/action accessible.

Ne pas créer `Card`, `Stack`, `Box`, `Text` ou une API de layout universelle.
Les layouts restent du CSS lisible; les primitives représentent des contrats
d'interaction ou des patterns produit récurrents.

## Contrats d'accessibilité

Chaque primitive respecte :

- focus visible distinct du hover;
- cible interactive minimale 40×40 px quand l'espace le permet, avec cible
  invisible étendue si le chrome dense exige une icône visuelle plus petite;
- `aria-label` pour boutons icône;
- rôles natifs préférés aux rôles ARIA reconstruits;
- Escape ferme les overlays et rend le focus au déclencheur;
- Tab ne reste jamais piégé hors modal;
- flèches naviguent les menus/segmented controls conformément au pattern;
- disabled est réellement non interactif, pas seulement grisé;
- running/error est annoncé avec une région live appropriée, sans répétition;
- `prefers-reduced-motion` neutralise les translations non essentielles.

Supprimer `outline: none` uniquement dans les zones migrées et le remplacer par
le focus partagé dans le même diff.

## Étape 4 — États interactifs

Pour chaque primitive, spécifier et tester : default, hover, focus-visible,
pressed, selected, disabled, loading et error si applicable.

Règles :

- l'orange n'apparaît pas sur toutes les icônes au hover;
- l'état sélectionné combine au moins deux signaux (fond + texte/bordure);
- active press peut utiliser `scale(.98)` pendant 120 ms, jamais bounce;
- les tooltips n'apparaissent pas instantanément sur chaque déplacement souris;
- aucun layout shift lorsque loading remplace le label;
- les spinners respectent reduced motion.

Les états hover/focus doivent être réversibles lors d'entrées-sorties rapides,
sans clignotement, action coincée ou géométrie qui bouge.

## Étape 5 — Banc d'essai interne

Créer une surface de développement exclue de la navigation/release normale, ou
un fichier de test de rendu, qui présente toutes les variantes en dark/light,
texte court/long et zoom 125 %. Ne pas ajouter Storybook.

La surface doit utiliser des données fixes et être accessible aux tests sans
appel sidecar. Si un routeur de debug serait disproportionné, rendre les
primitives dans des tests RTL et conserver des captures dans le rapport.

## Étape 6 — Migration pilote

Migrer exactement deux zones à faible risque :

- le segmented control Chat/Split/Atelier de la top bar;
- un groupe de boutons/notice dans Settings ou l'état vide actuel.

Ne pas migrer tout le rail, toute la top bar ou tout Settings. Le pilote valide :

- compatibilité avec zones drag Tauri;
- densité identique;
- raccourcis et titres conservés;
- dark/light;
- menus au-dessus des webviews/iframes;
- absence de régression de layout.

## Tests

Ajouter des tests RTL pour :

- activation souris et clavier;
- ordre de focus;
- Escape et retour focus;
- flèches dans Menu/SegmentedControl;
- label obligatoire des IconButton;
- loading/disabled;
- texte long et troncature accessible via title/description lorsque nécessaire;
- reduced motion;
- entrées-sorties rapides sur hover et focus-within;
- géométrie identique avant, pendant et après un cross-fade;
- budget maximal d'une animation continue par surface;
- absence d'événement double après remount.

Ne pas tester des couleurs exactes avec jsdom. Les couleurs/contrastes sont
contrôlés par capture et inspection navigateur/app.

## Verification

```bash
npm run test:frontend
npx tsc --noEmit
npx vite build
npm run verify
```

Puis protocole complet `AGENTS.md` et contrôle app buildée :

- top bar dark/light;
- clavier seul sur le segmented control;
- zoom 125 %;
- fenêtre 800×600;
- menus au-dessus du panneau Atelier;
- focus après fermeture popover;
- aucune variation des zones drag natives.

## Done criteria

- [ ] Tokens sémantiques dark/light documentés.
- [ ] Douze primitives au maximum, chacune motivée par un usage réel.
- [ ] Focus, clavier, disabled et loading couverts.
- [ ] Deux migrations pilotes réussies sans changement structurel.
- [ ] Aucune nouvelle dépendance frontend.
- [ ] Aucun `transition: all`, gradient décoratif ou valeur arbitraire non tokenisée.
- [ ] Quiet Instrument est implémenté par tokens et primitives, sans layout shift.
- [ ] Tooltip, overlays, sélection, press et ContextChip respectent leurs timings.
- [ ] Reduced motion conserve tous les états sans translate, scale ou boucle.
- [ ] Le banc d'essai/captures permet la revue de Thierry.
- [ ] Plans 017–020 n'ont plus à recréer boutons, menus, états ou inspecteur.

## STOP conditions

- Une primitive nécessite une bibliothèque de positionnement ou d'accessibilité.
  Présenter d'abord le coût et l'alternative native.
- Le pilote modifie le shell validé ou les zones drag.
- Le token typographique 18/20 n'a pas été approuvé en 014.
- Les menus ne peuvent pas dépasser correctement une iframe/webview.
- La migration nécessite une réécriture globale de `App.css`.

## Git workflow

Sans instruction, pas de commit/push. Si autorisé : branche
`fable/016-ui-primitives`, commit tokens/primitives, puis commit migration pilote
après validation. Ne pas mélanger une future surface produit dans ce plan.
