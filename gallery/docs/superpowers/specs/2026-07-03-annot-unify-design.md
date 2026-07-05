# Système d'annotation uniforme — design

Date : 2026-07-03. Demande : « un système d'annotation dans cmux-gallery pour
tous les types de documents qui est complètement uniforme » — l'UI Claude
Science (marqueurs dessinés + carte « Ajouter une annotation… » avec
Annuler/Enregistrer) partout.

## Référence

L'annotation d'images de la lightbox (gallery_template.html) est la référence
visuelle ET fonctionnelle : outils pen/ellipse/rect/arrow, badges numérotés,
carte #annotNote, export PNG composé → `POST /save` → `annotations/` +
message Claude. Elle n'est PAS modifiée (risque nul sur l'existant).

## Architecture

`assets/annot_kit.js` — module partagé autonome (IIFE, pas de build) qui
réplique le langage de la lightbox pour les autres viewers :

- injecte son CSS (mêmes tokens que #annotNote / #annotBar) ;
- gère le modèle de strokes en **coordonnées document**, les badges, la carte,
  la renumérotation, le pill compteur ;
- expose `AnnotKit.init(host)` avec l'interface adaptateur :
  - `host.overlay` : canvas transparent posé sur le contenu (le kit dessine dedans) ;
  - `host.viewToDoc(e)` / `host.docToView(pt)` : conversions (zoom/scroll) ;
  - `host.exportPng(strokes)` : Promise<dataURL> — le viewer compose son fond
    (canvas pdf.js, SVG rasterisé, screenshot serveur pleine page) + le kit
    redessine les strokes dessus ;
  - `host.meta` : `{rel, page?}` pour le nom de fichier et le message ;
- envoi : `POST /save {name, dataURL}` (endpoint existant → `annotations/`)
  puis `POST /quote` avec le chemin du PNG + notes numérotées (même format que
  la lightbox).

## Adaptateurs

| Viewer | Overlay | Export |
|---|---|---|
| pdf_viewer | canvas par page, au-dessus du canvas pdf.js | canvas pdf.js + strokes |
| svg_viewer | canvas sur le stage | drawImage(SVG) même-origine + strokes |
| rapports HTML (sel_overlay.js) | canvas pleine page en coords document | `GET /rasterize?path=&w=` (nouveau, réutilise le rasteriseur Chrome serveur) + strokes |
| md_viewer | idem HTML | idem HTML |
| code_editor / latex_studio | — (phase ultérieure si besoin) | le pill texte canonique reste leur annotation |
| lightbox images | inchangée (référence) | inchangé |

Chaque viewer gagne un bouton « ✎ Annoter » dans sa toolbar qui active/­désactive
le mode annotation (comme la lightbox).

## Serveur

- `POST /save` : existant, réutilisé tel quel.
- `GET /rasterize?path=<rel>&w=<px>` : nouveau — rend le fichier HTML/MD du
  projet en PNG pleine page via le rasteriseur Chrome existant (_chrome_html_screenshot),
  caché dans `.fig_thumbs/`, borné (largeur 320–2400, chemin _safe_path).

## Hors scope

Refactor de la lightbox vers le kit ; annotation dessinée dans code_editor et
latex_studio (leur pill est déjà canonique) ; multi-pages simultanées PDF
(une page annotée à la fois pour l'export).

## Tests

- Endpoint /rasterize : path traversal, largeur bornée, fichier manquant.
- Smoke headless par viewer : la page rend, le bouton ✎ existe, l'overlay
  s'active sans erreur console.
- Vérif manuelle : dessiner + noter + envoyer sur un PDF et un rapport HTML.
