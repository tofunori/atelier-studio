# Brief — Portage galerie Node, suite : P3+P4 + architecture données

Contexte : gallery/server/ contient P1+P2 (parité prouvée par tests/parity.mjs — Claude l'exécute, ton sandbox ne peut pas binder ; écris les tests, il les lancera). Réfère-toi à docs/BRIEF_GALLERY_NODE_PORT.md pour la méthode.

## 1. P3 — éditeurs/LaTeX (routes du fig_annotate_server.py à porter dans gallery/server/routes/editors.mjs)
/code?, /codesave, /lint?, /findscript?, /texroot?, /compile, /synctex, /save-svg, /export, /export-png, /rasterize?, /rev, /delete, /open.
Lire CHAQUE implémentation Python en entier avant de porter (latexmk, synctex, résolution texroot, confinement chemins).

## 2. P4 — boards/notes/zotero (routes/boards.mjs)
/board, /board/save, /board/load, /board/poll, /board/command, /notes/save, /notes/load, /zotero/*, /orca-native-fullscreen, /orca-fullscreen-exit.

## 3. Architecture données (ADDENDUM non appliqué en P1)
Restructurer builder.mjs : émettre une coquille figures_index.html FIXE + figures_data.json (la liste scannée). /rescan ne régénère que le JSON. Route GET /data (no-cache). La coquille détecte : données inline présentes (ancien format Python) → les utilise ; sinon fetch /data. Adapter assets/gallery_template.html pour ce chargement (fetch au boot, même rendu ensuite). Le test de parité doit vérifier que la page rendue affiche les mêmes cartes dans les deux modes.

## Contraintes
node --check sur tout ; étendre tests/parity.mjs aux routes P3 sans effets de bord (/texroot, /findscript, /code) ; ne pas committer ; ne pas toucher au Rust.
