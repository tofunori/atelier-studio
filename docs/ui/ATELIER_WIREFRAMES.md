# ATELIER_WIREFRAMES — quatre états de référence annotés

Version 1.0 — 2026-07-09 — plan 014. Complète `ATELIER_DESIGN.md`.
Conventions : shell verrouillé (TopBar 32 + rail 48 + panneaux collés) présent
partout et omis des annotations. Tailles en px logiques à 1512×883 sauf mention.
Le panneau vue (quand il est ouvert) suit la décision **Option A — Research
Navigator du projet actif** (plan 024). Décisions typographiques : échelle
**B** — les titres de page (Research Home, titres locaux de surface pleine
page) utilisent les tokens display 18/20 créés au plan 016.

---

## A. Research Home (état d'accueil d'un projet)

Remplace l'empty state « Ready for a session » quand un projet actif existe.

```text
┌ rail ┬──────────────────────────────────────────────────────────────┐
│      │ Albedo-Modis-Pipeline-Analysis                    [actions]  │ ← titre page 20/600 (display, décision B)
│      │ Question : forçage aérosols → albédo glaciaire · 11 régions  │ ← statut court, --muted
│      ├───────────────────────────────┬──────────────────────────────┤
│      │ CONTINUER                     │ À TRAITER                    │ ← labels 11/500 uppercase
│      │ « Albédo glaciaire et         │ · 2 figures candidate à      │
│      │ aérosols de feu » · idle · 2 j│   valider → galerie          │
│      │ dernier résultat : validation │ · 1 tour en erreur hier      │
│      │ W&M reproduite                │   → rouvrir le thread        │
│      │ [Reprendre]  (action accent)  │ (liens directs, pas de CTA)  │
│      ├───────────────────────────────┴──────────────────────────────┤
│      │ ARTEFACTS RÉCENTS                                            │
│      │ fig4_melt_upper_bound.svg   manuscrit_c…  15:51  final      │ ← liste dense 12px,
│      │ fig3_spatial.svg            manuscrit_c…  15:51  candidate  │   provenance + statut
│      │ raqdps_smoke_proxy_calc…    output…       17:36  —          │   visibles, 5–8 lignes
│      ├──────────────────────────────────────────────────────────────┤
│      │ DÉMARRER   [Nouveau chat] [Importer] [Ouvrir une figure]     │ ← ghost, 1 ligne
└──────┴──────────────────────────────────────────────────────────────┘
```

- **Largeur** : colonne unique max 960, centrée ; CONTINUER/À TRAITER en deux
  colonnes 1fr/1fr, gap 16.
- **Scroll** : seule ARTEFACTS RÉCENTS scrolle (max ~40 % hauteur) ; le reste
  est fixe.
- **Tabulation** : Reprendre → liens À TRAITER (ordre visuel) → lignes
  d'artefacts → Démarrer.
- **Action primaire** : Reprendre (unique bouton accent de la page).
- **État vide** (projet neuf) : « Aucune session dans ce projet » + Nouveau
  chat en primaire ; sections À TRAITER/ARTEFACTS masquées, pas de squelette.
- **À 800 px** : CONTINUER et À TRAITER s'empilent ; ARTEFACTS garde 3 colonnes
  d'infos (nom tronqué milieu, heure, statut) ; DÉMARRER passe en menu ⋯.
- **Données requises (disponibles aujourd'hui)** : threads + statuts
  (ThreadStore), figures et workflow (`figures_data.json` + `.fig_state.json`),
  erreurs de tour (ledger). Aucune nouvelle source à inventer.

## B. Thread actif (split chat + surface)

```text
┌ rail ┬ ~640–720 chat ─────────┬────── surface / contexte actif ──────┐
│      │ Albédo glaciaire… ·idle│ Galerie · manuscrit_ch1              │ ← titres locaux
│      │ ────────────────────── │ ──────────────────────────────────── │
│      │ ▸ bulle user (repliée  │ [vignette sélectionnée]              │
│      │   si collage > 12 li.) │ ┌ INSPECTEUR ────────────────┐       │
│      │ ▸ Read 2 files · 1,2 s │ │ fig3_spatial.svg · 1,4 MB  │       │
│      │   (activité repliable) │ │ statut: candidate ▾        │       │
│      │ réponse markdown       │ │ source: plot_spatial.py    │       │
│      │ …                      │ │ modifié 15:51 · manuscrit  │       │
│      │ ┌ capsule résultat ──┐ │ │ [Ajouter au chat] (accent) │       │
│      │ │ ✓ 3 fichiers · 8,1k│ │ └────────────────────────────┘       │
│      │ │ [diff] [annuler]   │ │                                      │
│      │ └────────────────────┘ │                                      │
│      │ ┌ ContextShelf ──────┐ │                                      │
│      │ │ ▣ fig3_spatial.svg ×│ │  ← chips de contexte, au-dessus     │
│      │ └────────────────────┘ │                                      │
│      │ ┌ composer ──────────┐ │                                      │
│      │ │ zone de saisie     │ │  ← dominante (multi-lignes)          │
│      │ │ (texte…)           │ │                                      │
│      │ ├────────────────────┤ │                                      │
│      │ │[+ ctx][Claude·Son.5]  [⏎ Envoyer]│ ← barre compacte         │
│      │ └────────────────────┘ │                                      │
└──────┴────────────────────────┴──────────────────────────────────────┘
```

**Composer (décision 2026-07-09)** : ContextShelf au-dessus ; zone de saisie
dominante ; barre inférieure compacte avec **ajout de contexte** et
**provider·modèle** visibles ; **Envoyer/Stop = seule action primaire**
(accent ; devient Stop pendant running). Effort, permissions détaillées et
réglages rares vivent dans des **popovers** (clic sur provider·modèle ou sur
`+`), jamais dans la barre.

- **Largeur** : chat 640–720 (min 400) ; surface prend le reste ; poignée de
  split au séparateur 1 px.
- **Scroll** : messages seuls ; composer et titre fixes ; surface scrolle
  indépendamment.
- **Tabulation** : zone de saisie (défaut) → barre compacte (+ ctx,
  provider·modèle, Envoyer) → ContextShelf → capsule résultat → messages
  (remontée) ; ⌘K court-circuite tout.
- **Action primaire** : Envoyer/Stop (accent, unique) ; dans l'inspecteur :
  Ajouter au chat (l'accent vit dans UN panneau à la fois — celui qui a le
  focus).
- **Geste signature** : sélection d'une figure → l'inspecteur se remplit
  (fade 140 ms) → « Ajouter au chat » → chip apparaît au-dessus du composer
  (opacity + translateY(2px), 140 ms). Aucun objet volant.
- **États** : running = ligne d'activité accent + durée ; error = capsule
  `--u-hot` avec cause + « Réessayer » ; empty (nouveau thread) = composer
  focus + suggestion du Research Home.
- **À 800 px** : la surface se replie (layout chat seul, ⌘1) ; l'inspecteur
  devient un panneau latéral overlay temporaire (ombre autorisée) fermé par
  Échap.

## C. Galerie + inspecteur

```text
┌ Galerie · manuscrit_ch1 ────────────────────────────────────────────┐
│ [recherche……]  [Formats ▾][Statut ▾][Tri ▾]  [Grille|Board|Notes] [⋯]│ ← filtres + sélecteur de vue + ⋯
│ statut: candidate ×   format: svg ×                                 │ ← filtres ACTIFS seuls
├────────────────────────────────────────────┬────────────────────────┤
│ grille déterministe (S/M/L via ⋯)          │ INSPECTEUR             │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐               │ aperçu                 │
│ │ ▣  │ │    │ │    │ │    │               │ fig3_spatial.svg       │
│ └────┘ └────┘ └────┘ └────┘               │ 1,4 MB · svg · 15:51   │
│ nom tronqué milieu · statut discret        │ statut: candidate ▾    │
│ sélection = contour --accent 1px           │ source: plot_spatial.py│
│                                            │ collections: fig-ch1   │
│                                            │ provenance: manuscrit  │
│                                            │ [Ajouter au chat]      │
│                                            │ [Ouvrir] [⋯]           │
└────────────────────────────────────────────┴────────────────────────┘
```

- **Largeur** : inspecteur 300–340 fixe, repliable (persisté par projet) ;
  grille responsive 160–260 par carte selon densité.
- **Scroll** : grille seule ; header + inspecteur fixes.
- **Tabulation** : recherche → filtres → sélecteur de vue → ⋯ → grille
  (flèches directionnelles dans la grille) → inspecteur.
- **Action primaire** : Ajouter au chat (inspecteur). La carte n'a AUCUN
  bouton visible au repos (survol : ⋯ seul).
- **États vides** : projet sans figures = « Aucune figure détectée » +
  [Relancer le scan] ; filtre sans résultat = « Rien pour ces filtres » +
  [Effacer les filtres].
- **À 800 px** : inspecteur en overlay (comme B) ; toolbar = recherche +
  ⋯ — le sélecteur Grille/Board/Notes rejoint ⋯ à cette taille seulement.
- **Écart vs baseline (décision 2026-07-09)** : Board/Notes restent visibles
  comme **sélecteur compact de vue** dans le header ; Settings, refresh
  (rescan), densité, Library et actions rares migrent dans ⋯ ; svg/png du
  même stem se regroupent en une carte à variantes (détail plan 019).

## D. Settings

```text
┌ Settings ──────────────────────────────────────────────────────────┐
│ ← Back to app                                                       │
│ General      │ Appearance                                           │
│ Setup        │ Theme, colors, typography, and layout.               │ ← 1 phrase, --muted
│ Appearance   │ THEME                                                │
│ Models       │ [préset Atelier ✓] [One Dark] … (bandes de palette)  │
│ Auto-review  │ Light | Dark | System            (segmenté)          │
│ Atelier      │ COLORS                                               │
│ Providers    │ Accent  ○ #E8823A                [valeur / aide]     │
│ Advanced     │ ──────────────────────────────                       │
│ [Restore…]   │ état de connexion / diagnostic (Setup)               │
└──────────────┴──────────────────────────────────────────────────────┘
```

- **Largeur** : nav 200 fixe ; contenu max 720.
- **Scroll** : contenu seul ; nav fixe.
- **Tabulation** : nav → contrôles du groupe dans l'ordre de lecture.
- **Action primaire** : aucune (les réglages s'appliquent immédiatement) ;
  « Restore defaults » en danger ghost, confirmation requise.
- **États** : diagnostic de connexion (Setup) réutilise les tokens statut ;
  toute clé API manquante = warning avec lien direct vers le champ.
- **À 800 px** : nav en select compact au-dessus du contenu.
- **Baseline** : la page actuelle est déjà conforme à ce modèle — la conserver
  comme référence de calme pour les autres surfaces.
