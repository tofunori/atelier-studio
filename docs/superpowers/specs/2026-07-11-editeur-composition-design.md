# Éditeur de composition multi-panneaux — spec de design

Date : 2026-07-11 · Statut : validé en brainstorm (artefact « Éditeur de composition — options de design »)

## 1. Contexte et objectif

Assembler plusieurs figures scientifiques (SVG matplotlib/R, cartes PNG/JPG) en une figure
composite prête pour soumission (Nature et revues comparables), directement dans la galerie
d'Atelier Studio. Le différenciateur vs Inkscape/Illustrator/Affinity : **la composition est
liée à ses sources** — quand un script régénère une figure, la composite se met à jour en
conservant placements, échelles, labels et retouches.

## 2. Décisions de cadrage

| Décision | Choix |
|---|---|
| Lien aux sources | Panneaux liés en direct : manifeste qui référence les SVG/PNG sources ; rechargement des sources fraîches à chaque ouverture/export |
| Profondeur d'édition | Arranger + retouches légères (déplacer une légende, un texte) ; les modifs de données restent dans les scripts |
| Export | Intégré à l'éditeur : PDF / EPS / TIFF ≥ 300 dpi via Inkscape CLI côté serveur Node |
| Types de panneaux | SVG + PNG/JPG |
| Layout éditeur | **1A Inspecteur** : rail sources gauche + canevas + inspecteur droit |
| Placement | Grille Nature magnétique (colonnes + gouttière), ⌥ = placement libre |
| Redimensionnement | Poignées d'angle uniquement, homothétique, **ratio toujours verrouillé** |
| Labels | Auto-gérés, `a` minuscule grasse 8 pt (style Nature) par défaut ; styles `(a)` et `A` disponibles par composition ; renumérotation auto |
| Boucle agent | Annotations AnnotKit → envoi à l'agent ; édition live du manifeste/des sources détectée sur disque |
| V1 à la carte | Pré-vol Nature, aperçu daltonisme & gris, auto-trim/rognage, gabarits de mise en page |
| Plus tard | Rendu headless CLI, encarts & connecteurs, légende attachée, versions de composition |

## 3. Non-objectifs

- Édition profonde style Inkscape (recolorer des courbes, éditer des chemins).
- Panneaux PDF (conversion imprécise) ; multi-pages / figure sets.
- Réutilisation de tldraw (ne préserve pas la sémantique SVG).
- Toute écriture dans les SVG sources : les sources ne sont **jamais** modifiées par l'éditeur.

## 4. Architecture d'ensemble

```
scripts (matplotlib/R) ──▶ fig_*.svg / carte.png          (sources, jamais touchées)
                                │  fetch à chaque ouverture/export
                                ▼
<nom>.figcomp (JSON) ◀──▶ compose_editor.html              (rendu live, édition)
   manifeste : canevas mm,      │ POST /compose/save · /compose/export
   panneaux, labels, deltas     ▼
                        serveur Node gallery/server/       (écriture atomique, Inkscape CLI)
                                │
                                ▼
                <nom>.svg composite + PDF / EPS / TIFF     (livrables, visibles en galerie)
```

Boucle de régénération : le script régénère `fig2.svg` → réouverture (ou ré-export) →
le panneau est à jour ; les deltas de retouche sont ré-appliqués par élément (mêmes
sémantiques que `gallery/reapply_svg_edits.py`).

## 5. Format du document `.figcomp`

Fichier JSON, extension `figcomp`, écrit atomiquement (`writeFileAtomicSync`). Tous les
chemins `src` sont relatifs à la racine projet (comme `rel` partout dans la galerie).
Toutes les grandeurs géométriques sont en **mm**.

```json
{
  "version": 1,
  "canvas": { "width_mm": 183, "height_mm": 110 },
  "grid": { "columns": 2, "gutter_mm": 3, "snap": true },
  "label_style": { "preset": "nature", "size_pt": 8 },
  "panels": [
    {
      "id": "p1",
      "src": "figures/fig_albedo.svg",
      "x_mm": 4.0, "y_mm": 5.0,
      "scale": 1.0,
      "trim": "auto",
      "clip_src": null,
      "edits": { "version": 2, "transforms": [], "added": [], "removed": [], "styles": [] }
    },
    {
      "id": "p2",
      "src": "cartes/carte_site.png",
      "x_mm": 96.5, "y_mm": 5.0,
      "scale": 0.42,
      "px_per_in_hint": null
    }
  ],
  "overlays": [
    { "id": "o1", "kind": "text", "x_mm": 60, "y_mm": 100, "content": "…", "style": {} }
  ]
}
```

- `panels[].scale` : facteur homothétique unique (le ratio est structurellement verrouillé —
  il n'existe pas de `scale_x/scale_y`).
- `trim` : `"auto"` (rognage des marges blanches par bbox du contenu, calculé à l'import et
  recalculé à chaque rechargement) ou `null`. `clip_src` : rectangle de rognage manuel en
  unités du SVG source, non destructif.
- `edits` : deltas de retouche légère **par élément du panneau**, format v2 identique à
  celui de `svg_viewer.html` / `reapply_svg_edits.py` (appariement par `id` matplotlib,
  repli sur le texte du label). Ré-appliqués côté client après chaque chargement de source.
- `overlays` : éléments au niveau composition (hors panneaux). V1 : `kind:"text"` seulement ;
  le champ `kind` rend le format extensible (flèches, lignes) sans migration.
- Les labels a/b/c ne sont **pas stockés par panneau** : l'ordre du tableau `panels` est
  l'ordre de numérotation ; le style vient de `label_style`. Réordonner dans l'arbre = renuméroter.
- PNG : la taille physique native est déduite du dpi embarqué si présent, sinon 300 dpi
  supposé (surchargé par `px_per_in_hint`) ; `scale` s'applique par-dessus.

## 6. Éditeur — `gallery/assets/compose_editor.html`

Nouvelle page autonome (pas d'extension de `svg_viewer.html`), même triptyque que les pages
existantes : tokens `:root` + IIFE `figTheme` + toolbar 30 px + `annot_kit.js`.
Ouverte par la lightbox : `compose_editor.html?file=<rel>`.

### 6.1 Layout (1A)

- **Toolbar** : sélection, texte overlay, grille on/off, labels on/off, zoom, aperçus
  (daltonisme/gris), bouton accent « Exporter ».
- **Rail gauche « Sources »** (repliable) : figures SVG/PNG du projet (depuis
  `figures_data.json`), vignettes + nom ; glisser sur le canevas = nouveau panneau.
- **Canevas** : page blanche aux dimensions mm (89 ou 183 de large, hauteur libre ≤ 247),
  ombre portée, fond atelier ; zoom/pan identiques à `svg_viewer.html` ; affichage
  permanent « L×H mm » sous la page.
- **Inspecteur droit** (repliable) :
  - *Panneaux* : arbre a/b/c → nom de fichier source + icône lien ; drag pour réordonner
    (renumérote) ; clic = sélection.
  - *Propriétés du panneau sélectionné* : X, Y, Largeur (mm, éditables au clavier),
    Échelle %, Ratio (verrouillé — affichage seul), **Police effective min (pt)** pour les
    SVG, **Résolution effective (dpi)** pour les rasters ; bouton « Recharger la source ».
  - *Canevas* : largeur 89/183 mm (ou libre), hauteur, colonnes de grille, gouttière.

### 6.2 Rendu des panneaux

- SVG : `fetch` de la source fraîche → `DOMParser` → inliné dans un `<g class="panel">`
  avec `transform="translate(x,y) scale(s)"` (mm→px : 1 mm = 96/25.4 px à zoom 1).
  Isolation des collisions d'`id`/`defs` entre sources par préfixage (`p1__…`) au chargement.
- PNG/JPG : `<image>` avec dimensions physiques calculées (§5).
- `trim:"auto"` : bbox du contenu (`getBBox`) → recadrage du viewBox du panneau.
- Après chargement : ré-application des `edits` v2 du panneau (portage client de la logique
  de `reapply_svg_edits.py` ; tout élément non apparié est signalé dans l'inspecteur,
  jamais deviné).

### 6.3 Interaction

- Déplacement : drag + flèches (nudge 0.5 mm, ⇧ = 2 mm), aimanté à la grille et aux bords
  des panneaux voisins ; ⌥ désactive l'aimantation. Guides d'alignement accent au drag.
- Redimensionnement : 4 poignées d'angle, homothétique ; les champs X/Y/Largeur de
  l'inspecteur restent la voie précise.
- Retouches légères *dans* un panneau : double-clic = entrer dans le panneau (les autres
  s'estompent), sélection/déplacement d'éléments individuels comme dans `svg_viewer.html` ;
  les deltas alimentent `edits`. Échap = sortir.
- Undo/redo : deux piles, entrées `panel-move / panel-scale / panel-add / panel-remove /
  reorder / overlay / inner-edit / canvas`, ⌘Z / ⇧⌘Z.
- Labels : rendus par l'éditeur (non éditables à la main), position coin haut-gauche du
  panneau avec offset réglable global ; masquables.

### 6.4 Annotations & boucle agent

- AnnotKit identique aux autres pages : dessiner flèches/encadrés/texte, « Envoyer à
  Claude » → PNG annoté + `rel` du `.figcomp` + liste des `src` des panneaux.
- **Live reload** : poll léger (~1 s) d'un endpoint de fraîcheur (§7) sur le manifeste et
  les sources ; si le manifeste change sur disque → rechargement complet de l'état
  (zoom, sélection et panneau « entré » conservés quand ils existent encore) ; si une
  source change → rechargement du panneau concerné seulement. Garde anti-boucle : l'éditeur
  ignore l'mtime résultant de sa propre sauvegarde.
- Sélection courante (panneau) publiée dans `~/.claude/fig-selection.json` (même canal que
  le viewer PDF / l'éditeur de code) pour « ma sélection ».

### 6.5 Aperçus V1

- Daltonisme : filtres `feColorMatrix` deutéranopie / protanopie appliqués au canevas.
- Niveaux de gris : `saturate(0)`.
- Gabarits : à la création ou depuis la toolbar — `2×2`, `a large + b/c empilés`,
  `pleine largeur + duo` ; appliquent positions/échelles initiales puis tout reste ajustable.

## 7. Serveur — `gallery/server/routes/compose.mjs`

Nouvelles routes, mêmes conventions que `editors.mjs` (`safePath` borné à la racine projet,
`writeFileAtomicSync`, `spawnCollect`) :

- `POST /compose/save` `{rel, manifest}` → validation (version, types, chemins `src` dans la
  racine), écriture atomique du `.figcomp`.
- `POST /compose/export` `{rel, svg, formats:["pdf","eps","tiff"], dpi}` → écrit
  `<stem>.svg` composite (aplati, dimensions mm, texte conservé) à côté du `.figcomp`,
  puis Inkscape CLI (`findExecutable("inkscape")`) : PDF et EPS directs ;
  TIFF via export PNG au dpi demandé puis `sips -s format tiff` (précédent `sips` existant).
  Réponse : chemins produits + stderr en cas d'échec.
- `GET /compose/stat?rel=…` → `{manifest_mtime, sources:{rel:mtime}}` pour le live reload.
- `POST /compose/new` `{dir, name}` → crée un `.figcomp` minimal (gabarit optionnel) et
  répond son `rel`.

**Prérequis (bug existant à corriger d'abord)** : `editors.mjs:793` ne persiste pas le
`.edits.json` quand `edits` est un objet v2 (`Array.isArray` sur un objet → faux). Corriger
pour accepter liste v1 *et* objet v2, à parité avec `fig_annotate_server.py:1378-1393`.
Test de régression dans `gallery/server/tests/`.

## 8. Intégration galerie

- Extension `figcomp` ajoutée au scan (builder + valeur par défaut de `GALLERY_EXTS` posée
  par `src-tauri/src/atelier.rs`).
- `gallery_template.html` : branche `isComp` dans `lbShow` → iframe
  `compose_editor.html?file=…` (même patron que `isSvg`).
- Vignette : générée à la sauvegarde par le serveur (rsvg-convert du composite exporté) ;
  icône générique tant qu'aucun export n'existe.
- Création : action « Nouvelle composition » dans la galerie → `POST /compose/new`
  (dossier par défaut : `compositions/` sous la racine projet) → ouverture de l'éditeur.
- Toute modif du template galerie est reportée sur `src-tauri/gallery-dist/` et le
  `figures_index.html` servi (règle CLAUDE.md).

## 9. Export & pré-vol Nature

- Dimensions : SVG composite avec `width="183mm"` etc. et viewBox en unités mm — les
  livrables sortent aux mm exacts.
- Pré-vol (panneau non bloquant avant export) :
  - police effective min ≥ 5 pt (taille source × scale ; pt = px·72/96) ;
  - épaisseur de trait effective min ≥ 0.25 pt ;
  - rasters ≥ 300 dpi effectifs (px natifs / largeur rendue en pouces) ;
  - largeur = 89 ou 183 mm (avertit si autre), hauteur ≤ 247 mm ;
  - éléments d'`edits` non appariés ; sources manquantes.
- Le texte reste du texte dans SVG/PDF/EPS (pas de vectorisation) ; polices système
  (Helvetica/Arial) recommandées dans les scripts sources.

## 10. Gestion d'erreurs

- Source manquante/illisible : panneau remplacé par un cadre hachuré avec le `rel` et un
  bouton « Relocaliser » ; le manifeste n'est jamais amputé.
- Delta d'`edits` non appariable après régénération : ignoré et listé dans l'inspecteur
  (comportement `reapply_svg_edits.py` : signaler, ne pas deviner).
- Inkscape introuvable : bouton Exporter actif pour SVG seul, message explicite pour
  PDF/EPS/TIFF (chemin d'installation suggéré).
- Sauvegarde : si l'mtime disque a changé depuis le dernier chargement (édition agent
  concurrente), recharger-fusionner n'est pas tenté — dialogue « le fichier a changé sur
  disque : recharger / écraser ».
- SVG source malformé : erreur de parse affichée, panneau en cadre hachuré.

## 11. Design system

Contraintes CLAUDE.md appliquées : tailles 10/11/12/13/15, poids 400/500/600, rayons
6/10/999, espacement ×4, 3 gris de texte, ombres pour l'élévation, icônes SVG monochromes
stroke 1.3–1.5, transitions 120–150 ms, `tabular-nums` sur X/Y/mm/dpi, aucune couleur en
dur hors tokens (`--bg/--card/--txt/--muted/--accent/--border` + IIFE `figTheme`).

## 12. Tests et vérification

- `node gallery/server/tests/diff_suite.mjs` (78 tests) doit rester vert — obligatoire dès
  que `gallery/` change.
- Nouveaux tests serveur (`gallery/server/tests/`) : save/validation, stat, export (inkscape
  mocké), fix `.edits.json` v2.
- E2E Playwright (`gallery/tests/e2e/compose.spec.js`) : créer une composition, ajouter
  2 panneaux, déplacer/redimensionner (ratio conservé), sauvegarder, modifier le manifeste
  sur disque → live reload, régénérer un SVG source → panneau à jour + deltas conservés.
- `npx tsc --noEmit` et `npx vite build` inchangés (aucun code sous `src/` n'est touché
  hors intégration éventuelle ; si `src-tauri/atelier.rs` change pour `GALLERY_EXTS`,
  build Tauri vérifié via le protocole de relance).
- Vérificateur indépendant (règle globale) avant de déclarer la V1 terminée.

## 13. Découpage

**V1** : fix `.edits.json` Node · page éditeur (layout 1A, grille, ratio verrouillé,
labels auto, retouches légères, undo) · routes save/stat/export/new · intégration galerie ·
pré-vol · aperçus daltonisme/gris · auto-trim · gabarits · annotations + live reload ·
tests ci-dessus.

**Plus tard** : rendu headless CLI · encarts & connecteurs · légende attachée (.tex/.txt) ·
versions de composition (journal dv_versions) · rognage manuel `clip_src` UI (le champ
existe au format dès la V1).

## 14. Risques et points ouverts

- Collisions d'`id`/`defs` entre SVG matplotlib inlinés : le préfixage par panneau doit
  couvrir `url(#…)` dans les attributs et styles (risque principal de rendu).
- Fidélité Inkscape (polices, filtres) : valider tôt sur une vraie figure ; repli
  rsvg-convert pour PNG déjà en place.
- Performance : 4–6 SVG matplotlib inlinés (~1–5 Mo) — acceptable ; si besoin, rendu
  dégradé (image) pour les panneaux non sélectionnés, hors scope V1.
- L'ordre de lecture des labels suit l'ordre du tableau `panels` (drag dans l'arbre), pas
  la position spatiale — choix assumé pour rester prévisible.
