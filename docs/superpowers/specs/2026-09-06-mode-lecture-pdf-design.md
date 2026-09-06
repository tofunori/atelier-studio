# Mode lecture PDF (reflow) — design

Date : 2026-09-06. Décision : Thierry. Contexte : Zotero 10 (17 août 2026) a
introduit un « Reading Mode » qui refond le PDF en une colonne de texte
(typographie réglable, figures rasterisées, annotations texte conservées).
Atelier reprend l'idée dans son lecteur unique `gallery/assets/pdf_viewer.html`
(bibliothèque Zotero, galerie figures, aperçu LaTeX).

## Objectif

Un bouton dans la barre d'outils bascule le lecteur entre la vue « pages » et
une vue « lecture » : colonne unique, paragraphes recomposés, titres, figures /
tableaux / équations découpés en bitmap, réglages typographiques persistés,
position conservée dans les deux sens, recherche et liens de passage
fonctionnels, surlignages existants visibles et nouveaux surlignages
créables depuis le reflow.

## Décisions

| Question | Décision | Raison |
|---|---|---|
| Où analyser le document | **Rust** (`atelier-gallery`), résultat mis en cache par PDF | règle Rust-first ; instantané à la 2e ouverture ; réutilisable par la KB |
| Outil d'extraction | `pdftohtml -xml` (Poppler 26, installé) | seul flux avec lignes + police + taille + images + ordre deux colonnes correct ; `mutool` absent ; `pdftotext -bbox-layout` n'a pas les tailles |
| Lib Zotero `structured-document-text` | **écartée** | aucune licence sur le schéma ; producteur `document-worker` en AGPL avec modèles ONNX privés et fork de pdf.js. Son modèle de blocs sert de référence |
| Annotations | afficher **et** créer depuis le reflow | différenciateur de Zotero 10 |
| Typographie | taille, largeur, interligne, police | demandé |
| Tableaux | découpe bitmap (pas de reconstruction HTML) | hors périmètre v1 |
| Iframe persistante | non | hors périmètre (43 usages de `rel`) |

## Architecture

```
pdf_viewer.html ──GET /reflow?path=<rel>──▶ atelier-gallery (Rust)
   │                                          │ cache hit ? ─▶ JSON
   │                                          │ sinon spawn pdftohtml -xml -stdout
   │                                          │ → reflow::parse → group → classify
   │                                          │ → écrit cache, renvoie JSON
   ▼
pdf_reading.js : blocs → DOM colonne ; découpes bitmap via pdf.js ;
typographie ; position ; recherche ; annotations (affichage + création)
```

### Composant 1 — `rust/crates/atelier-gallery/src/reflow.rs`

Entrée : chemin absolu d'un PDF (résolu par la même logique que `zotero_pdf`
/ `safe_project_path`). Sortie : `ReflowDoc` sérialisé en JSON.

```
ReflowDoc { version: 1, source: {mtime, size}, pages: [{w, h}], blocks: [Block] }
Block { id: u32, page: u16, kind, bbox: [x1,y1,x2,y2] (pt, origine haut-gauche),
        text: String (vide pour figure/table/math), level?: 1|2|3,
        lines: [{bbox, text}] }
kind ∈ heading | paragraph | caption | footnote | math | figure | table | list
```

Pipeline :

1. **Spawn** `pdftohtml -xml -stdout <pdf>` (motif « spawns inchangés » de
   `atelier-kb/src/pdf.rs`) ; délai 60 s ; erreur → 502 `{error}`. Si le
   drapeau `-i` supprime les `<image>` (à vérifier au premier pas du plan),
   ne pas l'utiliser ; sinon l'utiliser.
2. **Parse** XML avec `roxmltree` : `<page number width height>`,
   `<fontspec id size family>`, `<text top left width height font>`,
   `<image top left width height>`.
3. **Colonnes** : par page, gouttière = abscisse entre 35 % et 65 % de la
   largeur croisée par le moins de lignes étroites (port de `readingOrder`
   du lecteur) ; colonne = centre de la ligne vs gouttière ; les lignes larges
   (> 55 %) sont « pleine largeur ».
4. **Blocs** : lignes consécutives (ordre du flux) de même colonne, écart
   vertical < 0,6 × hauteur de ligne, même classe de taille (± 0,5 pt) →
   un bloc. Fusion inter-colonne / inter-page : un bloc `paragraph` qui ne
   finit pas par `.?!:` et dont le suivant commence en minuscule est
   concaténé. Dé-césure : `-` final + minuscule initiale → jointure sans
   espace.
5. **Classification** (corps = taille médiane pondérée par le nombre de
   caractères) : `heading` si taille > 1,15 × corps et ≤ 3 lignes (niveau
   par rang de taille) ; `caption` si `^(Fig\.?|Figure|Table|Tableau)\s*\d` ;
   `footnote` si taille < 0,9 × corps et bas de page ; en-tête / pied =
   bande haute / basse de 6 % dont le texte normalisé se répète sur ≥ 2
   pages → **supprimé** ; `math` si ≥ 60 % des caractères en police math
   (`CMMI|CMSY|MTMI|MTSY|MSAM|Math`) ou ligne isolée finissant par `(\d+)` ;
   `list` si `^([•\-–]|\d+[.)])\s` ; sinon `paragraph`.
6. **Figures** : `<image>` ≥ 40 × 40 pt, fusion des images qui se chevauchent
   ou se touchent ; une `caption` sans image dans la même colonne au-dessus
   → bloc `figure` synthétique couvrant l'espace entre le bloc texte
   précédent et la légende (figures vectorielles). Une `caption` « Table » →
   la zone est `table`. Les blocs `math` gardent leur bbox de lignes.
7. **Cache** : clé = `sha1(chemin absolu)`, fichier `<clé>.json` ; valide si
   `source.mtime/size` correspondent et `version` = courante. Emplacement :
   PDF Zotero → `~/Library/Application Support/cmux-gallery/reflow/` ; PDF de
   projet → `<root>/.fig_thumbs/reflow/`.

Route : `GET /reflow?path=<rel>` → 200 JSON, 404 fichier inconnu, 502
extraction échouée. `HEAD` renvoie 200 si le cache existe (le front peut
afficher « analyse en cours » avant le GET).

### Composant 2 — `gallery/assets/pdf_reading.js` + `pdf_reading.css`

Script compagnon classique (comme `pdf_passage.js`), expose
`window.AtelierPdfReading` avec des fonctions pures testables :

- `buildReadingDom(doc, {figure: (block) => HTMLElement})` → fragment :
  `h1..h3`, `p`, `p.caption`, `p.footnote`, `figure` (conteneur de découpe),
  `ol/ul`. Chaque élément porte `data-block`, `data-page`.
- `cropViewport(page, block, scale)` → paramètres `{viewport, canvas}` pour
  peindre uniquement le rectangle du bloc (viewport pdf.js avec `offsetX/Y`
  négatifs, canvas de la taille du rectangle × min(2, DPR)).
- `selectionToAnnotation(block, startOffset, endOffset, pageSize)` → `{page,
  text, rects}` : lignes couvertes, x interpolé proportionnellement aux
  caractères pour la première et la dernière ligne, lignes intermédiaires
  entières ; `rects` au format existant du lecteur : fractions normalisées
  `[x/w, y/h, largeur/w, hauteur/h]` de la page (voir la création d'une zone
  dans `pdf_viewer.html`).
- `anchorAnnotations(doc, annots)` → `[{annotId, blockId, start, end}]` :
  réutilise `AtelierPdfPassage.findAllSpanRanges` sur le texte des blocs de
  la page de l'annotation (fenêtre ± 1 page).
- `blockForScroll(top)` / `pageForBlock(id)` : correspondance position.

Intégration dans `pdf_viewer.html` :

- bouton `#readBtn` (SVG monochrome, `aria-pressed`) ; `body.read-mode` masque
  `#pages`, affiche `#reading` ; état non persisté (on rouvre en vue pages).
- Chargement : `GET /reflow` au premier basculement ; squelette pendant
  l'attente ; erreur → message dans la colonne, retour possible.
- Découpes : `IntersectionObserver` (marge 100 %), peinture via
  `pdf.getPage(page).render(cropViewport(...))`, annulation à la sortie
  (même discipline que le pipeline des pages).
- Typographie : boutons dans une petite barre en tête de colonne (taille
  −/+, largeur 65/80/100, interligne 1,4/1,6/1,8, serif/sans) ;
  `localStorage` `pdfRead.fs|width|lh|font` ; Cmd+/− modifient la taille en
  mode lecture (au lieu du zoom).
- Position : entrée → bloc de la page en haut de fenêtre ; sortie → page du
  bloc en haut de fenêtre.
- Recherche : la barre existante cible `#reading` en mode lecture (mêmes
  compteur / navigation) ; `?quote` en mode lecture est résolu sur les blocs.
- Annotations : après `anchorAnnotations`, envelopper les plages dans
  `<mark class="pdfhl" data-annot>` ; clic → `annotMenu` existant. Sélection
  dans `#reading` → pilule existante « Annoter » → `selectionToAnnotation`
  → même objet `{kind:"comment", page, text, rects, note}` que la vue pages,
  `PDF_ANNOTS.push` + `saveAnnots()` ; la vue pages la dessine au retour.
  `area` et `note` ne sont pas créables en lecture (affichées sous forme
  d'icône en marge du bloc le plus proche).

### Style

Système de design du projet : tailles 10/11/12/13/15 pour l'UI ; corps de
lecture 13–24 px (réglage), interligne 1,4–1,8, largeur en `ch`, couleurs par
variables (`--bg`, `--fg`, `--card`…), rayons 6/10, transitions 120–150 ms,
`prefers-reduced-motion`. Mode sombre : le texte suit le thème ; les découpes
bitmap suivent le réglage `pdf_invert` existant.

## Erreurs et limites

- `pdftohtml` absent → 502 `{error:"pdftohtml introuvable"}` ; bouton
  désactivé avec infobulle.
- PDF scanné (aucun texte) → 200 avec `blocks:[]` ; message « ce PDF n'a pas
  de couche texte ».
- Équations inline dans un paragraphe : restent du texte (fragments) ; seules
  les équations en ligne isolée deviennent des découpes.
- Tableaux : découpe bitmap.
- Les rectangles d'une annotation créée en lecture sont approximés à la ligne
  (x interpolé) — précision suffisante pour le surlignage, documentée.

## Tests

- Rust : fixtures `tests/fixtures/reflow/*.xml` (sortie réelle de `pdftohtml`
  sur 3 pages d'un article deux colonnes, d'un preprint une colonne, d'un
  document à équations, anonymisées si besoin) ; tests unitaires sur
  colonnes, regroupement, dé-césure, classification, en-têtes répétés,
  figures synthétiques ; test d'intégration `http_smoke` sur `/reflow` avec
  un petit PDF fixture commité (`tests/fixtures/reflow/twocol.pdf`, ≤ 100 Ko)
  et cache (2e appel sans spawn : vérifié par mtime du fichier cache).
- JS : `gallery/server/tests/pdf_reading.test.mjs` sur les fonctions pures ;
  `pdf_render_pipeline.test.mjs` et `diff_suite.mjs` doivent rester verts ;
  `theme_contract` et `studio_editor_contract` (le lecteur est scanné).
- E2E : `gallery/tests/e2e/pdf_reading.spec.js` (WebKit) : basculer, blocs
  présents, découpe peinte, réglage de taille persisté, Cmd+F, création
  d'une annotation puis retour en vue pages avec surlignage visible.

## Hors périmètre

Tableaux HTML, EPUB, lecture à voix haute, iframe persistante, réglages côté
React (`BiblioSurface`), export du reflow vers la KB (piste future : le JSON
de blocs est réutilisable par `atelier-kb`).
