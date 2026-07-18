# Plan 052 : sélection multiple et actions en lot (base de connaissances)

Suite directe du 051 (A+B+C validés par Thierry le 2026-07-18).

- **A — Mode sélection** (surface) : bouton « Sélectionner » / ⇧-clic ; les
  clics cochent (plage au ⇧-clic sur la liste visible aplatie, groupe entier
  via son en-tête) ; barre d'actions en bas : « N sélectionnées — Ajouter
  à ▾ · Archiver · Attacher · Annuler » ; Échap sort.
- **B — Tout le résultat** : recherche/filtre actif → « Sélectionner les N
  affichées » dans la barre.
- **C — Collection active à l'épinglage** : chip-collection sélectionnée →
  tout nouvel épinglage y entre automatiquement (corrélation kbAdded).
- **Backend** : store `tagMany`/`archiveMany` (UN lock + UNE écriture),
  CLI `tag|archive --ids a,b,c`, routes `kbTag`/`kbArchive` avec `ids[]`
  (Node direct, Rust relais CLI) — réponse : liste fraîche unique.
- Hors périmètre : drag & drop des rangées sur les chips.

Gates habituelles + validation vivante (lot réel de 3 sources via WS).
