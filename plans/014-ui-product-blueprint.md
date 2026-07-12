# Plan 014: Verrouiller le blueprint produit et visuel d'Atelier

> **Executor instructions**: charger `/efficient-fable`, puis `/design`. Ce plan
> produit des décisions, des états de référence et des critères vérifiables. Il
> ne modifie aucun composant produit. **STOP obligatoire pour approbation de
> Thierry avant de marquer DONE ou de commencer 015.**
>
> **Drift check**:
> `git diff --stat 8baafca..HEAD -- src/App.tsx src/App.css src/components/Chat.tsx src/components/TopBar.tsx src/components/Rail.tsx src/components/Settings.tsx gallery/assets/gallery_template.html docs/superpowers/specs`
> puis `git status --short --` sur les mêmes chemins. Si des travaux UI non
> documentés sont en cours, les inventorier et arrêter avant de figer le design.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW pour le code, HIGH pour l'orientation produit
- **Depends on**: plan 008
- **Category**: direction produit / UX / design system
- **Planned at**: commit `8baafca`, 2026-07-09

## Résultat attendu

À la fin, Fable remet trois documents versionnés qui permettent à un autre
exécuteur d'implémenter Atelier sans interpréter « premium », « moderne » ou
« comme Codex » à sa façon :

1. `docs/ui/ATELIER_DESIGN.md` — contrat visuel et comportemental.
2. `docs/ui/ATELIER_WIREFRAMES.md` — quatre états de référence annotés.
3. `docs/ui/ATELIER_VISUAL_QA.md` — matrice de contrôle dark/light et tailles.

Le document doit décrire Atelier comme un **poste de commande scientifique
natif, dense mais calme, précis et orienté artefacts**. Il ne doit pas en faire
une landing page, un dashboard marketing, ni une copie littérale de Codex.

## Décisions déjà verrouillées

Ne pas rouvrir ces décisions sans contradiction technique démontrée :

- conserver le shell validé dans
  `docs/superpowers/specs/2026-07-09-shell-vscode.md`;
- conserver la top bar, le rail de 48 px et les panneaux dockés;
- ne pas réintroduire les panneaux flottants de la spec antérieure;
- conserver React 19, Tauri 2 et le CSS vanilla;
- utiliser les fontes système SF Pro/Inter pour le chrome et le texte;
- réserver Monaspace au terminal, au code et aux données monospace;
- conserver l'orange Atelier comme accent rare : action primaire, sélection,
  activité et statut nécessitant l'attention;
- aucun dégradé décoratif, glassmorphism, halo néon, emoji de navigation ou
  animation ornementale;
- profondeur par paliers de fond et séparateurs 1 px; ombres seulement pour les
  menus, popovers et éléments temporairement superposés;
- rayons fixes 6 px pour contrôles, 10 px pour contenants, pill uniquement pour
  tags et statuts;
- transitions ciblées de 120–150 ms; jamais `transition: all`;
- cartes seulement lorsqu'elles matérialisent une entité ou un choix. Les
  sections de page courantes restent cardless.

## Thèse d'interaction

Le geste mémorable d'Atelier est le transfert continu du contexte scientifique :

`source ou figure sélectionnée → inspecteur → ajout au contexte → chat → résultat`

Le blueprint doit montrer ce trajet dans chaque surface concernée. Le transfert
utilise une animation discrète d'opacité + translation de 2–4 px en 140 ms et un
changement d'état explicite. Aucun objet ne « vole » à travers l'écran.

## Trois directions cosmétiques à présenter

Fable doit produire un spécimen 1512×883 de chacune des directions suivantes à
partir du même contenu et du même shell. Elles doivent varier par typographie,
densité, traitement des surfaces et caractère, pas seulement par couleur.

### A — Precision Native (recommandée)

- Atmosphère : instrument macOS scientifique, graphite calme, précis, compact.
- Typographie : SF Pro système pour toute l'UI; Monaspace seulement pour code,
  chemins, mesures et terminal.
- Profondeur : paliers de luminance très fins; presque aucune carte; menus et
  composer seuls réellement élevés.
- Accent : orange Atelier, rare et net; statuts sémantiques moins saturés.
- Signature : la dernière figure ou source réelle du projet devient l'ancre
  visuelle du Research Home, encadrée comme une planche scientifique.
- Motion : press `scale(.98)`, cross-fade de sélection et transfert de contexte.
- Bénéfice : paraît natif et durable, sans dépendance typographique ni effet de
  mode; c'est la direction la plus proche de la qualité Codex/Linear sans copie.

### B — Editorial Research

- Atmosphère : carnet de laboratoire éditorial, plus chaleureux et contemplatif.
- Typographie : SF Pro pour le chrome; serif macOS/New York uniquement pour le
  nom de projet et les grands titres du Research Home, sous réserve de fallback.
- Profondeur : davantage d'espace vertical, séparateurs typographiques, quelques
  surfaces couleur papier en light mode.
- Signature : titres de projets et légendes de figures traités comme un ouvrage
  scientifique; provenance très lisible.
- Motion : transitions plus lentes mais toujours sous 150 ms, sans animation
  décorative.
- Risque : moins cohérent dans les panneaux très denses et plus difficile à
  maintenir entre macOS/fonts; ne pas retenir sans préférence explicite.

### C — Technical Instrument

- Atmosphère : console d'observation scientifique, plus dense et analytique.
- Typographie : SF Pro pour commandes; Monaspace étendue aux métadonnées,
  compteurs et statuts, jamais au corps de réponse.
- Profondeur : panneaux plus plats, données alignées, lignes et repères plus
  présents; densité Compact par défaut.
- Signature : colonne de provenance/mesures très structurée et tabulaire.
- Motion : quasi absente, uniquement changements d'état 120 ms.
- Risque : peut devenir froid et ressembler à un outil d'ingénierie générique.

La recommandation de planification est **A — Precision Native**. Sans autre
choix de Thierry, les plans 016–023 utilisent A. Aucun mélange opportuniste
entre les trois directions : si B est retenue, son serif reste strictement
limité aux rôles approuvés; si C est retenue, la densité ne réduit pas les
cibles interactives.

## Étape 1 — Capturer l'état réel

Lancer l'app buildée selon `AGENTS.md`, puis capturer sans recadrage :

- 1512×883 dark : aucun thread actif;
- 1512×883 dark : thread actif avec outils et résultat;
- 1512×883 dark : galerie avec plusieurs formats;
- 1280×800 light : Settings;
- 800×600 dark : Split;
- états running, error et sidecar indisponible si reproductibles.

Ranger les captures dans `docs/ui/baseline/` avec taille, thème et état dans le
nom. Ne pas retoucher les images. Ajouter sous chacune une courte annotation :
ce qui guide l'œil, ce qui concurrence l'action principale, ce qui manque pour
comprendre l'état scientifique.

## Étape 2 — Écrire le contrat visuel

`ATELIER_DESIGN.md` contient obligatoirement les sections suivantes :

1. **Promesse** — « reprendre une recherche, comprendre son état, agir ».
2. **Principes** — artifact-first, calme, natif, traçable, compact lisible.
3. **Anatomie du shell** — global, projet, surface, contexte local.
4. **Hiérarchie** — un titre local, une action primaire, actions secondaires.
5. **Couleur** — fonds, texte, bordures, orange, succès, avertissement, erreur.
6. **Typographie** — rôles, tailles, poids, interlignage, troncature.
7. **Espacement et densité** — grille 4 px, zones tactiles, largeur de lecture.
8. **Profondeur et formes** — fonds, bordures, ombres, rayons.
9. **Mouvement** — transitions autorisées et `prefers-reduced-motion`.
10. **États** — empty, loading, running, success, warning, error, disabled.
11. **Contenu** — verbes, labels, preuves, absence de formulations marketing.
12. **Accessibilité** — focus, contraste, clavier, annonces de statut.
13. **Do / Don't** — exemples Atelier précis, pas de recommandations génériques.

### Décision typographique obligatoire

`CLAUDE.md` limite aujourd'hui les tailles à 10/11/12/13/15 px. Le blueprint
doit préparer deux spécimens côte à côte :

- **A — échelle actuelle** : titres locaux à 15 px, structure par poids/espace;
- **B — display restreint** : tokens 18 et 20 px réservés au Research Home et
  aux titres de pages, jamais à la top bar ou aux panneaux.

Thierry choisit A ou B. Sans choix explicite, A reste la règle. Fable ne crée
aucun nouveau token 18/20 dans ce plan.

## Étape 3 — Produire quatre wireframes de référence

Les wireframes sont annotés avec largeur, zones scrollables, ordre tabulation,
action primaire, états vides et comportement à 800 px.

### A. Research Home

```text
┌ rail ┬──────────────────────────────────────────────────────────────┐
│      │ Projet actif                                      actions   │
│      │ Question de recherche / statut court                         │
│      ├───────────────────────────────┬──────────────────────────────┤
│      │ CONTINUER                     │ À TRAITER                    │
│      │ Dernier thread, statut, date  │ validations / erreurs        │
│      │ [Reprendre]                   │ liens directs                │
│      ├───────────────────────────────┴──────────────────────────────┤
│      │ ARTEFACTS RÉCENTS        liste dense, provenance visible    │
│      ├──────────────────────────────────────────────────────────────┤
│      │ DÉMARRER   Nouveau chat · Importer · Ouvrir une figure       │
└──────┴──────────────────────────────────────────────────────────────┘
```

### B. Thread actif

```text
┌ rail ┬ chat / titre + état ┬────── contexte actif / surface ──────┐
│      │ prompt utilisateur  │ document ou galerie                   │
│      │ activité repliable  │ sélection → inspecteur                │
│      │ réponse             │ provenance / actions                  │
│      │ capsule résultat    │ [Ajouter au chat]                     │
│      │                     │                                       │
│      │ contexte composer   │                                       │
│      │ composer            │                                       │
└──────┴─────────────────────┴───────────────────────────────────────┘
```

### C. Galerie + inspecteur

```text
┌ surface header: Galerie / projet ──────────────────────────────────┐
│ recherche                 [Filtres] [Tri] [Densité] [⋯]            │
│ filtres actifs seulement                                             │
├────────────────────────────────────────┬───────────────────────────┤
│ grille déterministe d'artefacts         │ INSPECTEUR                │
│ sélection nette, métadonnées minimales  │ aperçu, statut, source    │
│                                         │ collections, provenance   │
│                                         │ [Ajouter au chat]         │
└────────────────────────────────────────┴───────────────────────────┘
```

### D. Settings

```text
┌ Settings ──────────────────────────────────────────────────────────┐
│ navigation  │ section courante / explication courte               │
│             │ groupe label                                         │
│             │ contrôle                           valeur / aide      │
│             │ séparateur                                          │
│             │ état de connexion / diagnostic                       │
└─────────────┴───────────────────────────────────────────────────────┘
```

## Étape 4 — Définir la matrice de QA

`ATELIER_VISUAL_QA.md` est une table avec les lignes suivantes pour chaque
surface : dark, light, 1512×883, 1280×800, 800×600, clavier, zoom 125 %, reduced
motion, texte long, zéro donnée, erreur, running. Chaque cellule indique :

- attendu visuel;
- interaction testée;
- capture de référence éventuelle;
- sévérité d'une régression;
- mécanisme de test futur (RTL, Playwright ou inspection app buildée).

## Validation humaine

Présenter les quatre wireframes et les deux spécimens typographiques à Thierry.
Recueillir dans `ATELIER_DESIGN.md` une section **Décisions approuvées** datée :

- direction cosmétique A, B ou C;
- échelle typographique A ou B;
- niveau de densité par défaut Compact ou Comfortable;
- Research Home comme état d'accueil;
- inspecteur à droite comme modèle commun;
- hiérarchie des contrôles du composer;
- déplacement éventuel de Board/Notes dans le menu de surface.

Décision déjà approuvée le 2026-07-09, à reporter telle quelle : **panneau
projet Option A — Research Navigator du projet actif**. Le rail et la top bar
restent les sélecteurs globaux; le panneau n'affiche que l'identité, Continuer,
Épinglés et les conversations du contexte actif. L'implémentation est détaillée
dans le plan 024.

Décision motion déjà approuvée le 2026-07-09, à reporter telle quelle :
**Quiet Instrument**. Atelier utilise un mouvement précis, bref et retenu :
120 ms pour hover/press, 140 ms pour sélection, menus et transferts de contexte,
150 ms au maximum pour un panneau, avec
`cubic-bezier(0.16, 1, 0.3, 1)`. Aucun bounce, spring, glow, shimmer ou mouvement
de layout. Une surface active ne peut montrer qu'une seule animation continue.
Le geste signature est le transfert source/figure → Add to context → état
Added → apparition du ContextChip, par cross-fades courts sans objet volant.
`prefers-reduced-motion` supprime translations, scales et boucles tout en
conservant chaque état par texte, couleur et icône statique. Le contrat complet
est défini en 016, appliqué au Research Navigator en 024 et audité en 023.

## Verification

Ce plan ne modifie pas le code produit. Vérifier néanmoins :

```bash
git diff --check -- docs/ui plans
rg -n "gradient|glass|floating card|transition: all" docs/ui
rg -n "Research Home|inspecteur|contexte|clavier|800.600|dark|light" docs/ui
```

Lire les documents côte à côte avec les specs shell existantes. Toute
contradiction doit être résolue explicitement, pas laissée à l'exécuteur suivant.

## Done criteria

- [ ] Baselines réelles capturées et annotées.
- [ ] Trois documents complets présents.
- [ ] Quatre wireframes couvrent contenu, interaction et petite fenêtre.
- [ ] Aucun shell concurrent ou navigation globale additionnelle.
- [ ] Choix typographique et densité approuvés par Thierry.
- [ ] Une direction cosmétique unique A/B/C est approuvée; A sert de défaut.
- [ ] Le contrat de mouvement Quiet Instrument est documenté sans ambiguïté.
- [ ] États running/error/empty font partie du design, pas d'une passe future.
- [ ] Plan 015 peut citer chaque décision sans inventer de détail.

## STOP conditions

- Le shell validé devrait être remplacé pour faire fonctionner les wireframes.
- Les données nécessaires au Research Home n'existent pas dans l'état courant.
- Les specs existantes se contredisent sur une décision structurante.
- Thierry n'a pas approuvé les décisions listées ci-dessus.

## Git workflow

Ne pas créer de branche ni commit sans instruction. Si Thierry demande un
commit, limiter le diff à `docs/ui/` et aux plans de suivi, puis utiliser un nom
de branche `fable/014-ui-product-blueprint`.
