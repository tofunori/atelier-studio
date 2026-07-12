# Plan 021: Finaliser Settings, accessibilité, responsive et QA visuelle

> **Executor instructions**: charger `/efficient-fable` puis `/design`. Ce plan
> harmonise les surfaces 017–020 et ferme leurs écarts mesurés. Il ne doit pas
> devenir une deuxième refonte ni ajouter de fonctionnalité produit.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/components/Settings.tsx src/components/ui src/components/shell src/components/chat src/components/ResearchHome.tsx src/App.css src/styles gallery tests`
> puis `git status --short --` sur ces chemins.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans 017 à 020
- **Category**: polish / accessibility / responsive / regression testing
- **Planned at**: commit `8baafca`, 2026-07-09

## Objectif

Atelier ne devient « haute qualité » que si ses états secondaires sont aussi
solides que son happy path : clavier, light mode, petite fenêtre, texte long,
erreurs, chargement, focus et préférences. Cette passe apporte cette cohérence,
améliore Settings et installe une QA visuelle reproductible.

## Partie A — Recomposer Settings

### Architecture

Conserver la navigation à gauche sur écran large, mais organiser chaque page :

1. `SurfaceHeader` avec titre et description d'une phrase;
2. groupes nommés selon la tâche, pas selon l'implémentation;
3. lignes réglage avec label, aide, contrôle et valeur actuelle;
4. diagnostics/états avec InlineNotice;
5. actions destructives isolées en fin de page.

Ne pas présenter chaque ligne dans une carte. Utiliser rythme, alignement et
séparateurs. Exploiter la largeur jusqu'à une limite de lecture appropriée;
éviter un corps étroit perdu dans une grande fenêtre.

### Navigation

- ordre : Général, Apparence, Agents/Providers, Permissions, Galerie, Raccourcis,
  Avancé/Diagnostics selon sections réellement existantes;
- labels stables et français/anglais cohérents avec l'app actuelle;
- section active visible par deux signaux;
- clavier flèches/Tab selon type de contrôle;
- à 800 px, navigation devient select/menu de section ou liste au-dessus, pas une
  colonne 220 px qui écrase le contenu;
- recherche Settings seulement si le nombre de réglages le justifie et si elle
  peut indexer labels/aides de façon déterministe. Sinon hors scope.

### Contrôles

- remplacer variantes artisanales par primitives 016;
- switches réservés aux booléens immédiats et réversibles;
- actions nécessitant sauvegarde ont un feedback persistant;
- champs secrets n'affichent jamais la valeur en logs/captures;
- chemins ont Browse/Open si déjà supporté, avec texte complet accessible;
- diagnostics ont Copy details et statut précis;
- reset indique portée exacte et confirmation si destructif;
- erreurs validation sont proches du champ et annoncées.

## Partie B — Audit accessibilité complet

Créer une checklist par surface dans `docs/ui/ATELIER_VISUAL_QA.md` et corriger :

### Clavier et focus

- toutes les actions accessibles sans souris;
- ordre Tab correspond à l'ordre visuel;
- focus visible sur fond dark et light;
- aucun `outline: none` sans remplacement;
- focus rendu au déclencheur après menu/popover/inspecteur;
- focus initial logique après navigation de surface;
- aucun piège hors modal;
- éléments seulement visibles au hover accessibles au focus;
- raccourcis ne s'activent pas pendant saisie/IME.

### Sémantique

- boutons natifs, headings hiérarchiques, listes et landmarks;
- IconButton avec accessible name;
- tabs/segmented controls avec rôles/états cohérents;
- statut running/error annoncé sans spam;
- champs avec label, aide et erreur reliés;
- cartes sélectionnables sans `div onClick` non focusable;
- images/figures avec alt descriptif ou décoratif explicite;
- chemins tronqués accessibles en entier.

### Vision et mouvement

- contraste texte/bordure/focus vérifié dark/light;
- statut jamais transmis par couleur seule;
- zoom 125 % et 200 % sans perte de fonction majeure;
- reduced motion neutralise translations/spinners non essentiels;
- pas de flash ou clignotement;
- zones interactives ≥40 px ou cible étendue documentée.

Utiliser un audit automatisé si disponible sans introduire une grosse dépendance
runtime; toute exception est documentée avec justification et test manuel.

## Partie C — Responsive et densité

Tester les largeurs de fenêtre, pas des appareils mobiles arbitraires :

- **1512×883** — workspace complet;
- **1280×800** — ordinateur portable courant;
- **1000×700** — split contraint;
- **800×600** — minimum fonctionnel visé;
- zoom 125 % et 200 %.

Règles globales :

- aucun scroll horizontal de page;
- les panneaux ont un min-width explicite et une stratégie de collapse;
- jamais quatre colonnes permanentes;
- inspecteur devient drawer/détail selon décision 018;
- view panel peut se compacter mais le rail reste 48 px;
- top bar conserve command center et mode switch sans chevauchement;
- composer reste utilisable et Send/Stop visible;
- tableaux/code peuvent scroller localement;
- texte UI long se tronque, contenu de recherche peut wrap;
- densité Compact/Comfortable suit le choix 014 et ne change pas l'information.

## Partie D — États transverses

Faire un inventaire de toutes les occurrences `alert`, erreurs console seulement,
spinners et empty states dans les surfaces touchées. Remplacer dans le scope :

- erreur action → InlineNotice près de l'action;
- succès durable → confirmation locale ou toast accessible et limité;
- erreur globale → notice surface;
- chargement initial → placeholder stable après seuil;
- données vides → explication + prochaine action réelle;
- permission refusée → cause et action sûre;
- disconnected → capacités encore disponibles clairement distinguées.

Ne pas créer un système de toast global si deux notices locales suffisent. Si un
toast devient réellement nécessaire, une seule implémentation, pause au hover/
focus, annonce non intrusive, historique des erreurs importantes ailleurs.

## Partie E — Régression visuelle déterministe

Installer un harnais léger basé sur les outils de test existants, sans Storybook.
Les captures doivent :

- utiliser fixtures 015 et horloge/UUID fixes;
- fixer taille viewport, thème, densité et fontes;
- désactiver mouvement/caret;
- attendre les fontes et le rendu stable;
- masquer seulement les régions réellement non déterministes;
- ne pas capturer une app connectée à des données personnelles réelles;
- produire un diff consultable en CI, sans mise à jour automatique des baselines.

Golden states minimum :

1. Research Home riche et vide;
2. Chat idle/running/error/result riche;
3. Composer avec contextes et menus;
4. Galerie grille, filtres actifs, inspecteur, zéro résultat;
5. Settings Général/Providers/Diagnostics;
6. disconnected;
7. 1512 dark/light, 1280 et 800 pour les surfaces critiques.

Si une iframe/preview est instable, injecter une fixture statique ou masquer la
zone de contenu seulement, jamais tout le panneau.

## Partie F — Revue de cohérence

Faire une passe côte à côte des surfaces et corriger uniquement les écarts au
blueprint :

- mêmes titres/labels/espacements de headers;
- mêmes boutons, focus, badges, notices, menus et inspecteurs;
- un seul modèle de sélection;
- même vocabulaire running/done/error;
- mêmes rayons 6/10/pill;
- ombres limitées aux overlays;
- accent orange rare;
- pas de valeurs CSS quasi identiques en doublon;
- pas de texte 10 px pour une information essentielle.

Toute « amélioration » non traçable à `ATELIER_DESIGN.md` est hors scope et va
dans un futur plan.

## Tests

- RTL pour Settings, menus responsives, erreurs et focus;
- E2E clavier pour chaque surface principale;
- test reduced motion;
- test 800×600 sur Research Home, Chat, Galerie, Settings;
- screenshots/golden states;
- suite galerie complète si ses styles/templates changent;
- aucun test seulement snapshot pour comportement critique.

## Verification

```bash
npm run test:frontend
npm run verify
npm run verify:e2e
```

Si galerie touchée :

```bash
npm run test:gallery:unit
npm run test:gallery:parity
npm run test:gallery:diff
```

Puis protocole `AGENTS.md`. Parcours app buildée au clavier seulement, dark/light,
1512/1280/1000/800, zoom 125/200, reduced motion, texte long et sidecar coupé.

## Done criteria

- [ ] Settings suit la même hiérarchie que les autres surfaces.
- [ ] Toutes les actions critiques sont utilisables au clavier avec focus visible.
- [ ] Aucun statut ne repose seulement sur la couleur.
- [ ] 800×600 reste fonctionnel sans scroll horizontal global.
- [ ] Dark/light, zoom et reduced motion sont contrôlés.
- [ ] Erreurs/empty/loading sont cohérents et actionnables.
- [ ] Golden states déterministes couvrent les surfaces clés.
- [ ] Les baselines ne contiennent aucune donnée personnelle/secrète.
- [ ] La passe ne crée pas une seconde refonte ni de nouvelle feature.

## STOP conditions

- Un correctif accessibilité exige un changement majeur de navigation : créer un
  plan ciblé et le faire approuver.
- Les captures ne peuvent pas devenir déterministes sans masquer la majorité de
  la surface.
- Une nouvelle dépendance runtime est proposée pour des tests ou tooltips.
- Le minimum 800×600 est incompatible avec le shell validé; documenter le
  conflit et retourner à Thierry.
- Une baseline capture un chemin, token, prompt ou donnée personnelle réelle.

## Git workflow

Pas de commit/push sans demande. Si autorisé, branche
`fable/021-accessibility-visual-qa`; séparer Settings, accessibilité/responsive et
harnais de screenshots en commits distincts. Les mises à jour de golden images
doivent être explicitement revues.
