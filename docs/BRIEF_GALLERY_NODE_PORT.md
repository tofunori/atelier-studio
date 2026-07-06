# Brief — Portage galerie Python → Node (app 100% autonome)

Objectif : supprimer la dépendance python3. Porter `gallery/fig_annotate_server.py` (1880 l.) et `gallery/build_gallery.py` (323 l.) vers Node dans `gallery/server/` (ESM .mjs, zéro dépendance npm externe si possible — http/fs/path/child_process/crypto de Node).

## Architecture cible
- `gallery/server/main.mjs` — point d'entrée, MÊME interface que le Python : mêmes env vars (GALLERY_ROOT, STUDIO_PORT_BASE, ATELIER_STUDIO…), même choix de port, mêmes chemins de fichiers d'état (annotations/, .fig_thumbs/, board/, notes/, ~/.claude/fig-selection.json). Le remplacement dans Rust sera `node main.mjs` au lieu de `python3 fig_annotate_server.py` — ne PAS toucher au Rust dans ce brief.
- `gallery/server/builder.mjs` — portage de build_gallery.py (scan GALLERY_ROOT, formats, mtimes, génération figures_index.html depuis assets/gallery_template.html en injectant les données ; miniatures via `qlmanage`/`sips` en child_process, mêmes caches .fig_thumbs).
- `gallery/server/routes/*.mjs` — un module par groupe de routes.

## Phases (une à la fois, committables séparément — mais NE PAS committer, je révise)
P1 (cœur, fait la galerie utilisable) : `/` (sert figures_index.html), `/ping`, `/state`, `/rescan` (lance builder), `/raw?`, `/thumb?`, `/ls?`, service statique des viewers depuis assets/.
P2 (annotations/sélection) : `/pdfannot` (GET/POST, backup .bak), `/quote`, `/clear-quote`, `/selinfo`, `/snippet?`, `/claude-targets`, écriture fig-selection.json.
P3 (éditeurs/LaTeX) : `/code?`, `/codesave`, `/lint?`, `/findscript?`, `/texroot?`, `/compile`, `/synctex`, `/save-svg`, `/export`, `/export-png`, `/rasterize?`, `/rev`, `/delete`, `/open`.
P4 : `/board*`, `/notes/*`, `/zotero/*`, `/orca-*fullscreen*`.

## Méthode OBLIGATOIRE — parité
1. AVANT de porter une route : lire son implémentation Python en entier, noter format de réponse exact (status, headers, JSON shape).
2. Écrire `gallery/server/tests/parity.mjs` : lance le serveur Python sur un port, le Node sur un autre, GALLERY_ROOT = un dossier fixture créé par le test (3-4 fichiers : un .png, un .py, un .md), compare status+body des routes GET sans effet de bord (/ping, /state, /ls, /raw, /thumb dimensions, /claude-targets). Les routes à effets (POST) : tester le Node seul (écrit ce qu'on attend au bon endroit).
3. `node --check` sur chaque fichier. Le test de parité doit passer pour P1 avant de passer à P2.

## Pièges connus
- build_gallery : la page émise doit contenir EXACTEMENT un `</script>` (garde existante dans le Python — la répliquer).
- Chemins : le serveur sert des fichiers du projet — répliquer les vérifs de confinement (pas de traversal hors GALLERY_ROOT/dossiers autorisés).
- Annotations PDF : ne JAMAIS répondre à un POST avant d'avoir chargé l'existant (garde ANNOTS_LOADED côté client — le serveur doit garder le comportement backup .bak avant écrasement).
- qlmanage tourne dans sa propre session ; timeout + pkill comme le Python le fait pour /rescan.

Commence par P1+P2. Si le temps le permet, enchaîne P3. Rapporte précisément ce qui est porté et ce qui reste.

## ADDENDUM — architecture données (si tu lis ceci avant de finir builder.mjs)
Le builder Node NE réplique PAS le monolithe : il émet (1) une coquille `figures_index.html` fixe (template + JS, générée une fois) qui charge (2) `figures_data.json` (la liste scannée : fichiers, mtimes, formats, favoris). `/rescan` ne régénère QUE le JSON. Ajouter la route `GET /data` qui sert ce JSON avec no-cache. Rétro-compat : si la coquille détecte des données inline (ancien format), elle les utilise — les deux formats coexistent pendant la transition.
