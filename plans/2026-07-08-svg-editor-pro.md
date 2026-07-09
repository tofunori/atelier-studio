# Éditeur SVG pro — spec d'architecture (contrat inter-agents)

Cible : `gallery/assets/svg_viewer.html` (éditeur SVG des figures), `gallery/fig_annotate_server.py`, `gallery/reapply_svg_edits.py`, `gallery/assets/annot_kit.js`.

Contexte : viewer servi dans un iframe WKWebView (Tauri). Voir docs/PIEGES_CONNUS.md
(localStorage non fiable → toute persistance passe par le serveur ; pas de
visibilitychange sur les onglets internes).

## Décisions d'architecture (NE PAS dévier)

1. **Fichier unique conservé.** `svg_viewer.html` reste self-contained (HTML+CSS+JS inline).
   Pas de split en modules ES — le viewer est copié tel quel dans `src-tauri/gallery-dist/`.
   Organiser le JS en sections commentées (`// ==== history ====`, etc.).
2. **Design system Atelier contraignant** : tailles texte 10/11/12/13/15px, poids 400/500/600,
   rayons 6/10/999, espacement multiples de 4, couleurs via les variables `--bg --card --txt
   --muted --accent --border` (thèmes commutables — ne JAMAIS hardcoder un hex sauf sémantique
   ok/warn/erreur). Icônes = SVG inline monochromes `stroke="currentColor"` stroke-width 1.3–1.5,
   16×16 viewBox. Zéro emoji dans l'UI.
3. **Sélection** :
   - Shift garde son sens actuel = saisir le bloc legend_/axes_ entier (grabTarget).
   - **⌘-clic (metaKey) / Ctrl-clic = sélection additive** (toggle dans moveSet).
4. **Zoom** : implémenté en faisant varier la largeur CSS de `#plot`
   (`plot.style.width = (zoom*100) + "%"`), `#stagewrap` scrolle déjà (overflow:auto).
   Les overlays (`rectIn`) sont calculés en coords client relatives à `#stage` → ils suivent
   automatiquement. Zoom molette (⌘+molette ou trackpad pinch → ctrlKey+wheel) centré sur le
   curseur (ajuster scrollLeft/Top de #stagewrap), boutons +/-/fit, ⌘0 = fit (100%),
   plage 0.25–8. Pan = espace+drag ou drag du fond hors élément… NON : pan = espace+drag
   uniquement (le drag déplace des éléments). Afficher le % dans la statusbar.
5. **Historique** : deux piles `undoStack`/`redoStack`. Chaque entrée porte l'état AVANT et
   APRÈS (snapshots) pour permettre le redo par ré-application. Types : move, delete, edit,
   add, style. Toute nouvelle action vide redoStack. ⌘Z / ⌘⇧Z. Boutons undo+redo désactivés
   selon l'état des piles.
6. **Dirty-state** : indicateur visuel sur le bouton Save (point accent), compteur dans la
   statusbar, garde `beforeunload` si dirty. `dirty=false` après save OK.

## Format `.edits.json` v2 (contrat client ↔ serveur ↔ reapply)

Le client (`collectEdits()`) émet désormais :

```json
{
  "version": 2,
  "transforms": [ { "id": "...", "text": "...", "delta": "translate(3,4) " } ],
  "added":      [ { "id": "added_text_1", "x": 120.5, "y": 88.2, "content": "Label",
                    "style": "font: 12px sans-serif; fill: #000", "transform": "" } ],
  "removed":    [ { "id": "...", "text": "..." } ],
  "styles":     [ { "id": "...", "text": "...", "props": { "fill": "#c00", "font-size": "14px" } } ]
}
```

- `transforms` = l'ancien format (delta de transform, l'original en suffixe).
- `added` = textes créés dans l'éditeur (survivent à une régénération matplotlib).
- `removed` = éléments supprimés (id + label pour matching de secours par texte).
- `styles` = surcharges de style appliquées via le panneau de propriétés.
- **Rétro-compat** : serveur et `reapply_svg_edits.py` doivent accepter l'ancien format
  (liste JSON nue = v1 ≡ `transforms` seul).

Matching côté reapply : par `id` d'abord, fallback par label texte (commentaires
matplotlib `<!-- -->`) comme aujourd'hui. `removed` → retirer le nœud ; `added` →
append `<text>` au root svg avec id/x/y/style/transform ; `styles` → merger dans
l'attribut style de l'élément.

## Lots

- **Lot A (cœur, svg_viewer.html)** : undo/redo bipile ; ⌘-clic additif ; lasso par
  intersection bbox↔polygone (pas centre seul) ; nudge flèches (1 unité user, Shift=10,
  entrée history 'move' fusionnée par rafale) ; dirty-state + beforeunload ;
  collectEdits() v2 (transforms + added + removed) ; tracking des suppressions.
- **Lot B (persistance, serveur + python)** : `/save-svg` accepte edits v2 (dict) ou v1
  (liste) ; `reapply_svg_edits.py` réapplique v2 complet ; tests rapides inline (voir lot).
- **Lot C (annot_kit.js)** : remplacer les hex hardcodés UI par `var(--accent, #c96442)`
  etc. avec fallbacks identiques aux valeurs actuelles (le kit est partagé par d'autres
  viewers qui ne définissent pas forcément les variables).
- **Lot D (zoom/pan)** : selon décision #4 ci-dessus + statusbar zoom %.
- **Lot E (panneau de propriétés)** : sélection non vide → panneau flottant ancré à droite
  (position:fixed, fond var(--card), ombre douce 0 4px 16px rgba(0,0,0,.25), radius 10,
  padding 12) : fill, stroke, stroke-width, opacity ; pour <text> : font-size, contenu non
  (déjà dbl-clic). Application à tout moveSet, entrée history type 'style'
  {el, before:{...}, after:{...}}, alimenter `styles` du sidecar v2. Inputs 12px,
  labels 11px var(--muted).
- **Lot F (passe UI pro)** : icônes SVG inline monochromes (remplacer ✕ 🗑 T+ ▱ ↶ 💾 🖼 ✎ ⛶ +
  redo) — `flash()` doit restaurer le innerHTML d'origine, pas textContent ; groupes de
  toolbar séparés par des dividers 1px var(--border) ; tooltips existants conservés/enrichis
  avec raccourcis ; statusbar 24px en bas (fname déplacé ? NON — fname reste en header ;
  statusbar = zoom %, n sélectionnés, état Enregistré/Modifié, msinfo) ; curseurs
  contextuels (text en addmode ok, grabbing pendant drag, crosshair lasso ok).

## Vérification

- `node gallery/server/tests/diff_suite.mjs` doit passer (67 tests) dès que gallery/ change.
- Test manuel serveur : `python3 -c "import ast; ast.parse(open('gallery/fig_annotate_server.py').read())"` + reapply sur un SVG de test.
- Copier `gallery/assets/svg_viewer.html` et `annot_kit.js` vers `src-tauri/gallery-dist/assets/` s'ils y existent.
- Vérificateur indépendant final (voit résultat + critères, pas le raisonnement).
