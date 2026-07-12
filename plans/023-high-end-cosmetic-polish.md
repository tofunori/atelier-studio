# Plan 023: Appliquer une direction artistique et une finition cosmétique haut de gamme

> **Executor instructions**: charger `/efficient-fable`, puis `/design`. Lire
> intégralement `docs/ui/ATELIER_DESIGN.md` et la décision A/B/C du plan 014.
> Ce plan est une passe d'art direction et de craft, pas une refonte structurelle.
> Chaque ajustement doit être montré avant/après dans l'app buildée. Si aucune
> direction n'a été approuvée, utiliser A — Precision Native et le noter.
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/App.css src/styles src/components/ui src/components/shell src/components/chat src/components/ResearchHome.tsx src/components/Settings.tsx src/components/TopBar.tsx src/components/Rail.tsx gallery/assets/gallery_template.html docs/ui`
> puis `git status --short --` sur ces chemins. Si 016–021 ne sont pas DONE ou
> si une surface est encore en refactorisation, STOP : ne pas polir une structure
> transitoire.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans 014 et 021
- **Category**: direction artistique / frontend craft
- **Planned at**: commit `8baafca`, 2026-07-09

## Pourquoi ce plan existe

Atelier possède déjà une base sobre et crédible, mais l'écran actuel paraît
encore assemblé à partir de contrôles utilitaires : trop de rectangles bordés de
même poids, hiérarchie typographique faible, galerie très chargée, aperçus blancs
brutaux, signaux du rail disparates et peu de personnalité hors de l'orange.

Cette passe doit produire le sentiment d'un outil dessiné par une équipe produit
senior : chaque alignement est intentionnel, chaque niveau de profondeur a un
rôle, la recherche réelle fournit la richesse visuelle et l'accent n'est jamais
utilisé comme décoration.

## Direction par défaut

**Precision Native** : « instrument scientifique macOS, graphite calme, compact
et précis, avec une trace orange rare et des artefacts réels comme ancre
visuelle ». La qualité recherchée vient du rythme, de la typographie, des
surfaces et des états, pas d'effets spectaculaires.

### Content plan

Orienter avec le projet actif → montrer le travail/artefact réel → rendre la
prochaine action évidente → exposer provenance et résultat au moment utile.
Aucun hero marketing ou panneau décoratif.

### Interaction thesis

- press discret `scale(.98)` sur les contrôles appropriés;
- cross-fade 120–140 ms lors d'une sélection ou d'un changement d'inspecteur;
- apparition du ContextChip après transfert par opacity + translate 2 px;
- aucun bounce, blur décoratif, parallaxe ou animation de layout.

## État actuel à reconnaître

- `src/App.css:13-24` contient déjà les bons rôles de base : fonds, trois gris,
  orange, tailles 10/11/12/13/15, rayons 6/10/pill et motion 140 ms.
- `src/App.css:416-487` définit le shell approuvé, collé et sans cartes flottantes.
  Ce shell ne doit pas être remis en cause.
- `src/App.css:75-84` rend l'accueil comme une carte générique centrée; 017 doit
  l'avoir remplacée par le Research Home avant cette passe.
- `src/App.css:497-527` mélange fond actif, bordure orange, couleur projet et
  liseré bas dans le rail; la hiérarchie peut être simplifiée sans changer les
  actions.
- `gallery/assets/gallery_template.html:14` utilise encore un blur de header;
  `:121-125` donne une bordure à chaque carte et un fond blanc dur à chaque
  preview. Ces détails donnent un aspect web-template au lieu d'un outil natif.
- les règles contraignantes de `CLAUDE.md:5-19` restent prioritaires : icônes
  monochromes 1.3–1.5, valeurs tokenisées, tailles/poids/rayons fixes, deux thèmes.

## Scope

**In scope**:

- valeurs et rôles des tokens dans `src/styles/` / `src/App.css`;
- alignements, états, profondeur et traitements visuels des composants 016–021;
- TopBar, Rail, Research Home, Chat, Composer, Inspector, Gallery et Settings;
- `gallery/assets/gallery_template.html` comme source galerie;
- captures/golden states et documentation de la direction finale.

**Out of scope**:

- nouvelle navigation, nouveau layout global ou nouvelle fonctionnalité;
- modification sidecar, Tauri, protocole WS/postMessage ou modèles de données;
- logo, illustration de marque ou app icon inventés par l'agent;
- nouvelle bibliothèque UI, animation ou fonte payante;
- dégradés, glassmorphism, textures décoratives, emojis ou cartes flottantes;
- edit direct de `src-tauri/gallery-dist/`.

## Étape 1 — Baseline cosmétique

Capturer les mêmes données et le même viewport avant modification :

- Research Home, thread actif, galerie+inspecteur, Settings;
- 1512×883 dark et light;
- 1280×800 dark;
- 800×600 dark;
- running, error et disconnected.

Pour chaque capture, annoter :

1. premier point de regard;
2. nombre d'accents orange dominants;
3. rectangles/bordures imbriqués;
4. zones visuellement mortes;
5. alignements qui ne partagent pas une grille;
6. contrôles dont le poids dépasse leur fréquence;
7. élément qui rend Atelier reconnaissable sans voir le rail.

## Étape 2 — Palette graphite et profondeur

Conserver l'orange Atelier actuel comme ancre de marque. Convertir ou documenter
les nouveaux tokens dans un espace perceptuel cohérent, idéalement OKLCH. Point
de départ pour A, à calibrer par contraste et capture :

### Dark

| Rôle | Candidat | Intention |
|------|----------|-----------|
| canvas | `oklch(0.185 0.008 255)` | graphite principal, jamais noir pur |
| sidebar | `oklch(0.155 0.010 255)` | chrome en retrait |
| panel | `oklch(0.215 0.008 255)` | contenu docké |
| control | `oklch(0.255 0.010 255)` | hover/contrôle sans contour lourd |
| raised | `oklch(0.235 0.010 255)` | composer, menu, popover |
| text | `oklch(0.90 0.008 255)` | blanc cassé, pas `#fff` |
| muted | `oklch(0.67 0.012 255)` | secondaire lisible |
| muted-2 | `oklch(0.50 0.010 255)` | metadata non critique |
| accent | `oklch(0.70 0.15 50)` | orange cadmium Atelier |

### Light

| Rôle | Candidat | Intention |
|------|----------|-----------|
| canvas | `oklch(0.965 0.006 255)` | gris papier froid |
| sidebar | `oklch(0.925 0.008 255)` | chrome distinct ≥4 % |
| panel | `oklch(0.99 0.003 255)` | surface de travail |
| control | `oklch(0.90 0.009 255)` | contrôle/hover |
| text | `oklch(0.23 0.010 255)` | encre graphite |
| muted | `oklch(0.48 0.012 255)` | secondaire |
| muted-2 | `oklch(0.62 0.010 255)` | metadata |
| accent | `oklch(0.64 0.16 50)` | orange suffisamment contrasté |

Ces valeurs ne sont pas une permission d'ajouter des couleurs locales. Les
statuts info/running/success/warning/error ont des tokens sémantiques désaturés.
Vérifier contrastes texte/focus dans les deux thèmes et ajuster les valeurs
globales, jamais composant par composant.

### Règles de profondeur

- shell docké : différences de fond + séparateur 1 px;
- sections de page : cardless par défaut;
- entité sélectionnable : fond léger et éventuellement outline interne;
- composer : seule surface persistante avec élévation douce;
- menus/popovers : fond raised + ombre à deux couches, sans bordure additionnelle;
- images : outline inset 1 px, jamais cadre lourd;
- dark : aucune ombre noire prétendant séparer deux fonds noirs;
- light : différence de luminance visible ou ombre réelle, jamais blanc sur blanc.

## Étape 3 — Typographie de craft

Pour A, conserver SF Pro système : c'est un choix natif, pas un défaut. Inter ne
sert que de fallback. Ne pas charger une nouvelle display font.

- titres locaux : 15 px/600, `letter-spacing:-0.01em`, ligne 1.3;
- corps/chat : 13 ou 15 px/400 selon rôle, ligne 1.5–1.65;
- labels : 12 px/500;
- metadata : 11 px/400;
- eyebrow : 10 px/500, uppercase rare et tracking positif limité;
- code/path/mesure : police mono, jamais les paragraphes;
- compteurs, temps, tokens, tailles : chiffres tabulaires;
- titres courts : `text-wrap: balance`; prose : `text-wrap: pretty` si supporté;
- aucune information essentielle en muted-2 10 px;
- poids 600 réservé aux vrais titres/noms, pas chaque nom de bouton.

Créer une hiérarchie par contraste, espace et alignement avant d'augmenter une
taille. Les tokens 18/20 ne sont utilisés que si 014 les a explicitement
approuvés pour Research Home; jamais dans le shell.

## Étape 4 — Grille, rythme et alignement optique

- grille de base 4 px; espacements visibles 4/8/12/16/20/24 uniquement;
- même gutter de contenu pour headers et bodies d'une surface;
- aligner titres, premières lignes de contenu et composer sur une colonne;
- réduire l'espace vertical entre label et contrôle, augmenter entre groupes;
- icônes dans une grille 16 px, stroke 1.4 par défaut;
- corriger optiquement triangles, chevrons et icônes asymétriques de 1 px si
  nécessaire dans le SVG, pas par valeurs CSS aléatoires;
- cibles 40×40 invisibles si l'icône visible reste 26–32 px;
- handle Split : hit target généreux mais ligne visible 1 px;
- aucun composant ne semble décalé de 1–2 px à 100 % ou écran Retina.

## Étape 5 — Signature visuelle Atelier

La signature n'est pas un logo généré. Elle est composée de trois éléments :

1. **La planche scientifique** : dernière figure/source réelle affichée sur un
   matte graphite/papier, avec légende courte et provenance.
2. **La trace orange** : point ou court segment utilisé pour la sélection et le
   contexte actif, jamais une bordure orange autour de tout.
3. **La provenance typographique** : source, chemin et timestamp alignés en mono
   discret, donnant l'impression d'un instrument de recherche traçable.

Au Research Home, la planche est l'ancre visuelle principale. Sans artefact, ne
pas afficher un faux graphique : utiliser une composition typographique sobre et
l'action suivante. Dans la galerie, chaque preview est présentée comme une
pièce scientifique, pas comme une image de e-commerce.

## Étape 6 — Traitement cosmétique par surface

### Top bar

- fond légèrement plus sombre que le canvas;
- command center centré, contraste discret, focus net;
- réduire les contours visibles au repos;
- raccourci `⌘K` traité comme un keycap secondaire, pas un badge;
- une seule zone active dans le segmented control;
- conserver traffic lights et drag region exactement.

### Rail

- uniformiser toutes les icônes en 16–18 px, stroke 1.3–1.5;
- état actif = fond + trace orange courte; pas fond + bordure orange + liseré;
- couleur projet = petit point/segment secondaire, pas décoration dominante;
- monogrammes centrés optiquement, poids constant;
- réduire la variété des rouges/roses/violets visibles simultanément;
- flyouts élevés par ombre/fond, pas par bordure épaisse.

### Research Home

- supprimer toute sensation de carte générique centrée;
- projet/titre comme ancre typographique, artefact récent comme ancre visuelle;
- « Continuer » clairement dominant, sans gros bouton marketing;
- sections cardless avec rythme de page;
- aligner métadonnées sur une grille et limiter les badges;
- contenu réel avant illustrations ou placeholders.

### Chat et activité

- demande utilisateur distinguée par placement/ton, pas une grande bulle bleue;
- réponse sur colonne de lecture calme;
- ActivityGroup plus sombre/inset, compact, statut par point + texte;
- ResultCapsule légèrement élevée uniquement parce qu'elle est une entité;
- code blocks avec header plus sombre, coins concentriques et bouton copie précis;
- erreurs visibles mais non fluorescentes;
- actions secondaires visibles au focus, pas seulement au hover.

### Composer

- surface raised avec ombre très douce et contour presque invisible;
- focus via ring/halo 1–2 px tokenisé, pas changement de géométrie;
- textarea domine; contrôles avancés sont visuellement secondaires;
- Send/Stop forme cohérente avec les boutons Atelier, pas une icône circulaire
  générique si les autres actions utilisent 6 px;
- ContextChips ressemblent à des pièces jointes de recherche, avec type/source;
- hauteur et shadow stables entre idle/running/error.

### Galerie

- retirer `backdrop-filter: blur(8px)` du header; surface opaque stepped;
- réduire les rangées de contrôles selon 019;
- remplacer le blanc plein des previews par un matte neutre; le document blanc
  reste visible à l'intérieur avec outline inset;
- ratio/hauteur de previews cohérents, objets centrés optiquement;
- cartes : moins de bordures, hover par légère élévation/luminance;
- sélection par outline interne + trace orange, pas bordure de toutes couleurs;
- métadonnées hiérarchisées : nom > type/source > date/taille;
- workflow par badge discret et texte; étoile/favori moins criarde;
- actions de hover n'écrasent pas les métadonnées et restent accessibles au focus;
- inspecteur donne de l'espace à la preview et à la provenance.

### Settings

- groupes séparés par espace/separateur, pas une pile de cartes identiques;
- labels/contrôles alignés sur une grille commune;
- descriptions plus faibles mais lisibles;
- valeurs et états alignés à droite lorsque pertinent;
- diagnostics comme lignes instrumentées, chiffres tabulaires;
- actions destructives isolées, jamais accent orange primaire.

## Étape 7 — Auditer le contrat Quiet Instrument

Cette passe ne crée pas un style d'animation supplémentaire. Elle vérifie que
chaque surface respecte le contrat installé en 016 : 120 ms pour hover/press,
140 ms pour sélection, overlays et transferts de contexte, 150 ms au maximum
pour un panneau, avec `cubic-bezier(0.16, 1, 0.3, 1)`.

### Règles globales

- hover : variation de fond/luminance/texte en 120 ms, jamais glow;
- press : `scale(.98)` 120 ms sur boutons appropriés seulement;
- sélection : fond/outline + point orange en cross-fade 140 ms;
- menu/popover : opacity + translate 2 px en 140 ms; sortie en 120 ms;
- tooltip : délai 400–450 ms, fade 120 ms;
- ContextChip : opacity + translateY 2 px en 140 ms;
- inspecteur : opacity + translateX 4 px en 150 ms;
- échange d'icône : opacity + scale `.9`→`1` en 120 ms;
- icône expand/collapse : rotation uniquement pour un chevron sémantique;
- scrollbars minces, visibles au scroll/hover sans masquer la zone;
- aucune animation de width, height, padding ou margin, aucun
  `transition:all`, bounce, spring, glow ou shimmer.

Auditer et remplacer les dettes existantes : permutations `display:none` /
`display:flex` sur hover, margins ajoutées pour faire place aux actions,
transitions `all`, animations de hauteur, hovers par `filter:brightness` et
combinaisons pulse + spinner + shimmer. Les actions secondaires utilisent une
géométrie réservée et un cross-fade réversible; hover et `focus-within` ont le
même résultat fonctionnel.

### Budget de mouvement continu

Une surface active affiche au maximum une animation en boucle : spinner **ou**
point respirant. Unread et Stop restent statiques; le label Working ne shimmer
pas; Review réutilise le spinner standard; le caret de saisie est permis. Aucun
état stable ne pulse pour attirer l'attention.

### Application par surface

- **Rail** : fond en fade, press `.98`, trace orange active; aucune translation
  d'icône; tooltip différé; un seul indicateur running.
- **Research Navigator** : slot terminal 48 px; heure et actions se cross-fadent
  sans déplacement; projet A/B en cross-fade 120–140 ms; actif statique après
  son fond + point orange.
- **Galerie** : aucune image zoomée; carte au plus `translateY(-1px)`; overlay
  d'actions dans une zone fixe; sélection par outline + point orange;
  inspecteur entrant de 4 px.
- **Chat** : nouveau message opacity + translateY 3 px en 140 ms; aucun effet par
  token pendant le streaming; étape d'outil et statut en cross-fade 120 ms;
  aucune secousse d'erreur.
- **Composer** : focus ring par opacity; Send press `.98`; Send↔Stop par échange
  d'icône; chips courts et stables entre idle/running/error.

Le geste signature Atelier est source/figure → Add to context → cross-fade du
libellé/icône vers Added → apparition du `ContextChip` dans le composer. Ne pas
faire voler une vignette ou un objet dans l'interface.

Sous `prefers-reduced-motion`, supprimer translations, scales et boucles. Les
états restent explicites par fond, point, texte, statut et icône statique.

## Étape 8 — Tests de goût obligatoires

À chaque surface, effectuer :

1. **Test flou** : en floutant la capture, titre, contenu et action restent trois
   masses distinctes.
2. **Test niveaux de gris** : hiérarchie compréhensible sans l'orange.
3. **Test accent** : une seule zone orange dominante par surface.
4. **Test bordures** : jamais plus de deux rectangles bordés imbriqués.
5. **Test marque sans rail** : l'artefact, la provenance et le traitement donnent
   encore une identité scientifique à Atelier.
6. **Test contenu long** : noms de projet, fichiers et modèles ne cassent pas les
   alignements.
7. **Test Retina/100 %** : pas d'icône ou séparateur visiblement flou.
8. **AI Slop test** : pas de gradient violet/bleu, cartes clonées, hero générique,
   glassmorphism, badges excessifs ou décoration sans fonction.

Corriger l'élément qui échoue avant de poursuivre. Ne pas compenser un problème
de hiérarchie en ajoutant une ombre ou une couleur.

## Test plan

- réutiliser les golden states déterministes du plan 021;
- mettre à jour les baselines uniquement après revue avant/après;
- tests RTL inchangés pour comportement, plus focus/pressed si markup change;
- contrastes dark/light vérifiés automatiquement ou par outil documenté;
- E2E galerie si template modifié;
- capture zoom 125 % et fenêtre 800×600;
- comparaison composer idle/running/error sans layout shift;
- galerie avec images transparentes, documents blancs, code et fichier sans preview.
- passages rapides du pointeur sur rail, lignes, cartes et actions sans flicker;
- parité hover/`focus-within` et retour de focus après overlays;
- comparaison des bounding boxes avant/pendant/après interaction;
- comptage des animations continues par surface, maximum une;
- reduced motion sans translate, scale, pulse, shimmer ni spinner en boucle.

## Verification

```bash
npm run test:frontend
npx tsc --noEmit
npx vite build
npm run verify
npm run verify:e2e
```

Galerie touchée, donc obligatoire :

```bash
npm run test:gallery:unit
npm run test:gallery:parity
npm run test:gallery:diff
```

Puis protocole complet `AGENTS.md` : kill exhaustif, rebuild release, relance et
captures de l'app buildée. Contrôler dark/light, 1512/1280/800, clavier, zoom,
reduced motion, Research Home, Chat, Galerie, Settings et disconnected.

## Done criteria

- [ ] Direction A/B/C documentée; A utilisée si aucun autre choix.
- [ ] Palette dark/light a des paliers perceptibles et contrastes vérifiés.
- [ ] Orange rare : aucune surface n'a plusieurs actions dominantes.
- [ ] Typographie suit les rôles et tailles autorisés.
- [ ] Icônes monochromes cohérentes et optiquement alignées.
- [ ] Shell validé inchangé structurellement.
- [ ] Research Home possède une ancre scientifique réelle quand disponible.
- [ ] Galerie n'a plus header glass/blur ni previews blanc plein non maîtrisées.
- [ ] Composer paraît élevé sans carte lourde ou glow.
- [ ] Settings et Chat n'utilisent pas une pile de cartes identiques.
- [ ] Quiet Instrument est cohérent sur rail, navigateur, galerie, chat et composer.
- [ ] Aucun hover/focus ne modifie la géométrie ou dépend de `display:none`.
- [ ] Une seule animation continue au maximum est visible par surface active.
- [ ] Le transfert Add to context → Added → ContextChip est le geste signature.
- [ ] Reduced motion conserve tous les états par signaux statiques accessibles.
- [ ] Tous les tests de goût passent sur les golden states.
- [ ] Tests, galerie, build Tauri et app buildée passent.
- [ ] Rapport avant/après explique chaque choix non évident.

## STOP conditions

- 014 n'a pas de direction approuvée et Thierry refuse A par défaut.
- 016–021 ne sont pas stabilisés.
- Un ajustement cosmétique exige une modification de comportement/protocole.
- Une nouvelle fonte, bibliothèque, illustration, logo ou app icon est proposé :
  présenter d'abord un choix humain séparé.
- La light mode ne peut pas obtenir des paliers visibles sans casser le contraste.
- Les previews scientifiques perdent détails, couleurs ou proportions.
- Une baseline visuelle contient des données personnelles ou devient instable.
- Le changement semble « plus décoré » mais pas plus hiérarchisé : le rejeter.

## Maintenance notes

- Tout nouveau composant doit réutiliser les rôles de surface, texte, statut et
  motion; ne pas ajouter une teinte locale « pour que ça se voie ».
- Les captures de référence sont un contrat, pas une autorisation de bloquer une
  amélioration : toute mise à jour demande une revue humaine.
- Les thèmes alternatifs de galerie peuvent rester opt-in, mais le thème Atelier
  injecté par l'app est la référence de qualité.
- Un futur app icon/wordmark constitue un projet de marque séparé avec choix de
  Thierry et vrais assets; l'agent ne l'improvise pas.

## Git workflow

Aucun commit/push sans instruction. Si autorisé, branche
`fable/023-high-end-cosmetic-polish`; commits séparés : tokens/profondeur,
iconographie/rythme, surfaces, galerie, puis golden states. Chaque commit doit
être réversible et conserver les tests fonctionnels.
