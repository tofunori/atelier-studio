# ATELIER_DESIGN — contrat visuel et comportemental

Version 1.2 — 2026-07-12 — contrat vivant. S'applique à tout le frontend.
Base : shell validé (`docs/superpowers/specs/2026-07-09-shell-vscode.md`),
tokens réels d'`src/App.css`, baselines `docs/ui/baseline/`.

Atelier est un **poste de commande scientifique natif : dense mais calme,
précis, orienté artefacts**. Ce n'est ni une landing page, ni un dashboard
marketing, ni une copie de Codex.

**Direction cosmétique approuvée : A — Precision Native** (plan 023) :
« instrument scientifique macOS, graphite calme, compact et précis, avec un
accent orange réservé aux actions et états transitoires ». La qualité
vient du rythme, de la typographie, des surfaces et des états — jamais d'effets
spectaculaires.

## 1. Promesse

« Reprendre une recherche, comprendre son état, agir. » Chaque écran doit
répondre en moins de trois secondes à : *où en suis-je, qu'est-ce qui a changé,
quelle est la prochaine action ?* Tout élément qui ne sert pas une de ces trois
questions est du bruit.

## 2. Principes

1. **Artifact-first** — figures, documents, threads et commits sont les objets
   de première classe ; l'UI les montre avec provenance et statut, jamais comme
   décor.
2. **Calme** — un seul point focal par surface ; l'accent orange est un budget
   qu'on dépense, pas une couleur d'ambiance.
3. **Natif** — feux macOS, raccourcis ⌘, menus contextuels, fontes système ;
   aucune métaphore web (pas de hero, pas de footer).
4. **Traçable** — toute donnée affichée montre d'où elle vient (projet, thread,
   fichier, date) et sous quel statut (draft/candidate/final/rejected, running,
   erreur).
5. **Compact lisible** — densité par défaut élevée mais interlignage et
   troncatures maîtrisés ; on scanne, on ne plisse pas les yeux.

## 3. Anatomie du shell (verrouillée)

Conserver tel quel — aucun shell concurrent, aucune navigation additionnelle :

```
┌ TopBar 32px : [feux][projet actif]      [⌘K command center]      [layout][QA] ┐
├ rail ┬ panneau vue (collé, 1px) ┬ surface de travail (collée, 1px) ───────────┤
│ 48px │ threads / fichiers…      │ chat · galerie · terminal · settings…       │
└──────┴──────────────────────────┴──────────────────────────────────────────────┘
```

Quatre niveaux de contexte, du global au local :
**global** (TopBar : projet, palette, layout) → **projet** (rail : surfaces et
projets) → **surface** (header local : titre + actions) → **contexte local**
(sélection, inspecteur, composer). Une information vit à UN seul niveau.

**Panneau vue approuvé : Option A — Research Navigator du projet actif**
(plan 024, approuvé 2026-07-09) : le panneau ne répond qu'à une question —
« dans ce projet, quel travail reprendre et quelles conversations ouvrir ? »
Header de projet clair, action primaire, chronologie calme (Continuer →
Épinglés → Conversations par récence). Le changement de projet reste global
(rail/TopBar) ; plus de double navigation ni de favoris tous-projets dans le
panneau.

## 4. Hiérarchie

- Par surface : **un** titre local (jamais dans la TopBar), **une** action
  primaire (accent), actions secondaires en ghost/muted, le reste dans un
  menu `⋯`.
- Baseline constatée à corriger : la toolbar galerie expose ~13 contrôles au
  même rang (voir baseline README). Cible : recherche + Formats/Statut/Tri +
  sélecteur compact de vue (Grille · Board · Notes) + `⋯` ; filtres actifs
  seuls affichés ; Settings/refresh/densité/actions rares dans `⋯`
  (spec plan 019, décision Board/Notes 2026-07-09).
- L'empty state propose l'action primaire du contexte, pas un catalogue.

## 5. Couleur

Tout passe par les variables CSS — jamais de hex en dur dans un composant.

| Rôle | Token | Dark | Light |
|---|---|---|---|
| Fond app | `--bg` | `#212429` | `#f5f6f8` |
| Fond latéral/panneaux | `--bg-side` | `#1a1d22` | `#ebedf1` |
| Popover/menu | `--bg-pop` | `#1b1f26` | `#ffffff` |
| Carte/entité | `--bg-card` | `#262b31` | `#ffffff` |
| Contrôle | `--bg-ctl` | `#2c313a` | `#e3e6eb` |
| Séparateurs | `--border` / `--border2` | `#333a45` / `#3a414d` | `#d4d8df` / `#c3c9d2` |
| Texte | `--fg` / `--fg2` | `#dbdfe5` / `#b6bdc7` | `#1c1e21` / `#33373d` |
| Secondaire / éteint | `--muted` / `--muted2` | `#868d9a` / `#646d7b` | `#667085` / `#8a93a3` |
| Accent (budget) | `--accent` | `#e8823a` | idem |
| Succès / avert. / erreur | `--u-ok` / `--u-warn` / `--u-hot` | `#98c379` / `#e0b74a` / `#e06c75` | idem |

Règles d'usage de l'orange (exhaustives) : action primaire, activité en cours,
focus clavier et statut exigeant l'attention. **La navigation et les tabs
actifs sont neutres** (`--border-strong` + contraste de surface), jamais orange.
Interdit pour : sélection de navigation, décor, icônes au repos, titres, liens ordinaires. Succès/avertissement/erreur ne servent
qu'aux statuts, jamais à la navigation. Maximum trois gris de texte à l'écran.

## 6. Typographie

- **Chrome et texte** : `--ui-font` (SF Pro/Inter). **Terminal, code, données
  monospace** : `--code-font` (Monaspace au terminal). Aucune autre fonte.
- Rôles : corps 13 (`--fs-l`), secondaire 12 (`--fs-m`), méta/labels 11
  (`--fs-s`), micro-badges 10 (`--fs-xs`), titre local 15 (`--fs-xl`).
- Poids : 400 corps, 500 accent léger, 600 titres. Rien d'autre.
- Interlignage 1.5 corps, 1.3 titres ; `letter-spacing:-0.01em` sur titres ;
  `tabular-nums` sur tout chiffre aligné (tailles, heures, compteurs).
- Troncature : milieu pour les chemins/fichiers (`fig…_bound.svg`), fin pour
  les titres ; jamais deux lignes tronquées superposées.
- **Décision tranchée : B — display restreint** (Thierry, 2026-07-09 ;
  spécimens `docs/ui/specimens/typographie-a-b.html`). Tokens 18/20 px
  réservés au Research Home et aux **vrais titres de page** — jamais TopBar,
  panneaux, cartes ni chips. Les tokens display sont créés au plan 016
  (`--fs-display-s: 18px`, `--fs-display: 20px` ou équivalents sémantiques) ;
  aucun token 18/20 n'est créé dans le plan 014. Toute autre taille reste
  interdite.

## 7. Espacement et densité

- Grille 4 px stricte : 4/8/12/16/20/24. Paddings de panneaux : 16 ou 20.
- Cibles interactives : un contrôle peut être **visuellement compact
  (24–32 px)**, mais sa **cible interactive effective vise 40×40 px** quand
  l'espace le permet (padding/hit-area étendus), **sans chevauchement** entre
  cibles voisines. Rail 48 px : icône 16–18 px centrée, cible pleine largeur.
- Largeur de lecture du chat : 640–720 px cible, centrée dans sa colonne.
- Densité : le mécanisme existe (`data-density` compact 3px / comfortable 6px /
  spacious 10px sur `--pad-y`). **Décision tranchée : défaut Comfortable**
  (Thierry, 2026-07-09) — Compact reste disponible dans Settings.

## 8. Profondeur et formes

- Profondeur par paliers de fond (`--bg-side` < `--bg` < `--bg-card`) et
  séparateurs 1 px. Ombre (`--elev`) réservée aux menus, popovers et éléments
  temporairement superposés — jamais aux panneaux dockés.
- Rayons : 6 px contrôles (`--r-s`), 10 px contenants (`--r-m`), pill
  (`--r-pill`) uniquement tags et statuts.
- Cartes seulement pour matérialiser une entité ou un choix (fiche figure,
  suggestion d'action) ; les sections de page restent cardless.
- Interdits : dégradés décoratifs, glassmorphism, halos néon, emojis de
  navigation, bordures doublées d'ombres.

## 9. Mouvement — contrat « Quiet Instrument » (approuvé)

Décision approuvée (2026-07-09) : le motion suit le contrat **Quiet
Instrument** des plans 016/023/024 — les timings sont un contrat, pas des
suggestions locales. **Plafond strict : 150 ms** pour toute transition
d'interface (seule la temporisation d'apparition des tooltips — un délai, pas
une animation — dépasse ce plafond).

| Interaction | Propriété | Durée |
|---|---|---:|
| hover ligne/bouton | fond, texte ou opacity | 120 ms |
| press bouton | `scale(.98)` | 120 ms |
| sélection | fond/outline neutre en cross-fade | 140 ms |
| menu/popover entrant | opacity + translate 2 px | 140 ms |
| menu/popover sortant | opacity | 120 ms |
| tooltip | délai d'apparition 400–450 ms, puis fade 120 ms | 120 ms |
| inspecteur (ouverture/contenu) | opacity + `translateX(4px)` | 150 ms |
| ContextChip (transfert de contexte) | opacity + translateY(2px) | 140 ms |
| échange d'icône (ex. Envoyer ⇄ Stop) | opacity + scale(.9 → 1) | 120 ms |
| changement de contenu projet | cross-fade, sans déplacement de page | 140 ms max |

- Tokens au plan 016 : `--motion-fast: 120ms`, `--motion-standard: 140ms`,
  `--motion-panel: 150ms`, `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.
- **Maximum une animation continue (boucle) par surface** — un seul spinner ou
  indicateur running à la fois ; jamais deux boucles concurrentes dans la même
  surface.
- Jamais `transition: all`, jamais > 150 ms, aucun bounce, blur décoratif,
  parallaxe ni animation de layout (aucun layout shift déclenché par le motion).
- Geste signature — transfert de contexte (`sélection → inspecteur → ajout au
  contexte → chat`) : opacity + translateY(2px), 140 ms, puis changement
  d'état explicite (ContextChip qui apparaît dans le composer). Aucun objet ne
  traverse l'écran.
- `prefers-reduced-motion: reduce` → supprimer **translate, scale et toutes
  les boucles** ; conserver les états statiques (fonds, contours, couleurs,
  opacité finale). Les fades d'opacité peuvent rester à ≤ 120 ms ou passer à
  0 ms, mais aucun déplacement ni pulsation ne subsiste.

## 10. États

Chaque surface définit les huit états ; aucun n'est « une passe future » :

| État | Contrat |
|---|---|
| empty | Une phrase d'orientation + l'action primaire du contexte. Pas de catalogue. |
| loading | Squelettes neutres (constaté : « Starting atelier… » + placeholders — conserver ce motif), jamais de spinner plein écran. |
| running | Indicateur accent + libellé du travail en cours + durée écoulée ; activité repliable, streaming lisible. |
| success | Capsule de résultat en fin de tour : fichiers changés, usage, actions (revoir diff, annuler le tour). |
| warning | `--u-warn`, bordure 1 px, texte explicite ; jamais bloquant sans action proposée. |
| error | `--u-hot`, message actionnable (cause + prochaine étape), jamais un code brut seul. |
| disabled | `--muted2` + curseur default ; jamais invisible (l'utilisateur doit voir que l'action existe). |
| offline/reconnexion | Bannière accent en haut de la colonne concernée (constaté : « Sidecar disconnected, reconnecting… ») + état de retry. |

## 11. Contenu

- Verbes à l'infinitif pour les actions (« Reprendre », « Ajouter au chat »,
  « Annuler le tour »), pas de nominalisation vague.
- Les labels nomment l'objet scientifique (« 12 figures · 3 final »), pas la
  technologie (« items », « data »).
- Chaque nombre affiché a une unité ou un contexte (« 47 KB », « 2 j », « 58
  favoris »).
- Preuves avant adjectifs : « reproduit −0,35 %/an vs −0,33 » plutôt que
  « excellent résultat ». Aucune formulation marketing (« puissant »,
  « magique », « boostez »).
- Bilingue : FR par défaut, EN accepté dans les données ; jamais de mélange
  dans un même label.

## 12. Accessibilité

- Focus visible partout : anneau 1 px `--accent` + offset 1 px ; ordre de
  tabulation = ordre visuel (rail → panneau → surface → composer).
- Contraste : texte courant ≥ 4.5:1, texte muted ≥ 3:1 sur son fond, dans les
  deux thèmes (à valider par la matrice QA, notamment chips galerie en light).
- Clavier : toute action primaire a un raccourci ou est atteignable en ≤ 3
  tabulations depuis la surface ; Échap ferme menus/lightbox/palette.
- Statuts annoncés : bannières et fins de tour en `aria-live="polite"` ;
  running en `aria-busy`.
- Zoom 125 % sans perte de fonction (repli des chips, pas d'overflow caché).

## 13. Do / Don't (exemples Atelier)

| Do | Don't |
|---|---|
| Badge `final` discret (`--muted`, accent réservé au filtre actif) sur la carte de figure | Répéter « svg/png » comme deux cartes de même rang sans lien (baseline galerie) |
| Replier un collage Zotero en capsule « Référence : Williamson 2021 » avec action Ouvrir | Afficher 40 lignes de résumé brut dans la bulle utilisateur (baseline thread-zotero) |
| Empty state : « Reprendre “Albédo glaciaire…” (il y a 2 j) » + Nouveau chat | « Ready for a session » sans aucun contexte projet (baseline sans-thread) |
| Toolbar galerie : recherche + Formats/Statut/Tri + sélecteur de vue (Grille · Board · Notes) + ⋯ | 13 chips au même niveau (baseline galerie) ; enfouir Board/Notes dans ⋯ au-dessus de 800 px |
| Bannière reconnexion avec étape (« retry 2/∞ ») | Bannière statique sans indication de progrès |
| Capsule fin de tour : « 3 fichiers modifiés · 8,1k tokens · Annuler » | Laisser le tour se terminer par un simple paragraphe de texte |

## Décisions approuvées

Validées par Thierry le **2026-07-09** (validation humaine du plan 014,
décisions déléguées par écrit) :

| Décision | Choix | Date | Note |
|---|---|---|---|
| Direction cosmétique | **A — Precision Native** | 2026-07-09 | Réf. plan 023 ; défaut confirmé explicitement. |
| Échelle typographique (A/B) | **B — display restreint** | 2026-07-09 | 18/20 px uniquement Research Home + vrais titres de page ; tokens créés au plan 016. |
| Densité par défaut | **Comfortable** | 2026-07-09 | Compact reste offert dans Settings. |
| Research Home comme état d'accueil | **Oui** | 2026-07-09 | Wireframe A ; implémentation plan 017. |
| Inspecteur à droite comme modèle commun | **Oui** | 2026-07-09 | Wireframes B/C ; implémentation plan 019. |
| Hiérarchie des contrôles du composer | **ContextShelf + barre compacte** | 2026-07-09 | ContextShelf au-dessus ; zone de saisie dominante ; barre inférieure compacte avec ajout de contexte et provider/modèle visibles ; **Send/Stop = seule action primaire** ; effort, permissions détaillées et réglages rares en popovers. Implémentation plan 020. |
| Board/Notes | **Sélecteur compact de vue dans le header galerie** | 2026-07-09 | Ne pas les enfouir : sélecteur de vue (Grille · Board · Notes) dans le header ; à ≤ 800 px seulement ils rejoignent ⋯. Settings, refresh, densité et actions rares vont dans ⋯. Plan 019. |
| Panneau vue | **Option A — Research Navigator du projet actif** | 2026-07-09 | Réf. plan 024 (décision inscrite au plan). |
| Motion | **Quiet Instrument** | 2026-07-09 | Contrat § 9 ; tokens et audit aux plans 016, 023 et 024. |
