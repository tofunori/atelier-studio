# Captures — plan 016 (tokens + primitives UI)

Preuves visuelles de l'étape 5/6 du plan 016, prises sur le **bundle de
production** (`dist/`, identique au contenu de l'app buildée) et sur l'app
buildée elle-même.

| Fichier | Contenu | Source |
|---|---|---|
| `016-bench-dark-1280.png` | Banc `#uibench`, 12 primitives, thème sombre, 1280 px | Chrome headless sur `vite preview` |
| `016-bench-light-1280.png` | Banc `#uibench-light`, thème clair | idem |
| `016-bench-dark-zoom125.png` | Banc à 1024 px de large (reflow équivalent zoom 125 %) | idem |
| `016-app-dark-1512.png` | App buildée réelle (Atelier.app) : pilote TopBar segmented + pilote EmptyState « Prêt pour une session », sidecar connecté, galerie servie | `screencapture` fenêtre |

Reproduire le banc : `npx vite preview` puis ouvrir
`http://localhost:4173/#uibench` (ou `#uibench-light`). Aucun sidecar requis.

Vérifications interactives faites sur le bundle (preview piloté) :
menu au-dessus d'un iframe témoin (z-index 120, portal body), flèches +
roving tabindex du SegmentedControl (26×22 px, titles ⌘1/⌘0/⌘2 conservés),
Escape du Popover avec retour focus (y compris ancre-wrapper), 800×600 sans
débordement, thème clair (preset `github-light`).
