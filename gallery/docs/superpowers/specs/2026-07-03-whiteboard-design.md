# Whiteboard tldraw intégré — design

Date : 2026-07-03. Approuvé (approche A).

## But

Un whiteboard par projet pour organiser idées, plots et images, intégré à la
galerie, persisté dans le projet, pilotable par Claude.

## Architecture

- `whiteboard-src/` — mini-projet Vite + React + tldraw (dev uniquement).
  `npm run build` → bundle statique dans `assets/whiteboard/` (commité).
  `base: './'` : servi tel quel depuis `/.fig_thumbs/whiteboard/index.html`
  (provision_viewers copie déjà tout `assets/` vers `.fig_thumbs/`).
- `fig_annotate_server.py` — 4 endpoints :
  - `GET /board/load` → `{snapshot}` depuis `.fig_thumbs/board.tldr.json` (null si absent)
  - `POST /board/save` → écrit le snapshot (atomique, cap 64 Mo)
  - `POST /board/command` → pousse une commande dans une file en mémoire (cap 500) ;
    `add_image` valide le chemin dans le projet
  - `GET /board/poll` → vide la file (pollé ~1 s par le canvas)
- Galerie : chip toolbar « ▣ Board » (ouvre le canvas dans un onglet) ;
  bouton « ▦ » sur les cartes image → `add_image`.
- Skill `~/.claude/skills/tldraw` réécrite vers cette API (l'ancien projet
  tldraw-mcp n'existe plus).

## Commandes canvas

`add_image`, `create_rectangle`, `create_ellipse`, `create_text`,
`create_arrow` (fromId/toId ou points absolus), `clear_canvas`,
`zoom_to_fit`, `load_snapshot`, `export_png`. Couleurs = palette tldraw.

## Comportement client

Autosave debounce 1 s → `/board/save` (toast discret si échec, retry au
prochain change). Poll 1 s → exécute les commandes ; une commande en erreur
ne tue pas la boucle. Images référencées par URL même-origine (pas de copie).

## Hors scope v1

Multi-boards, sélection de zone → Claude, collaboration temps réel.

## Tests

`tests/test_board.py` : round-trip load/save, rejet snapshot non-objet,
file de commandes, validation `type`, validation chemin `add_image`
(y compris traversée `..`). Vérification manuelle du canvas au build.
