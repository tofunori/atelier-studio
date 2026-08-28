# Audit performance Atelier — 2026-08-28

Spec de référence du plan `docs/plans/2026-08-28-perf-atelier.md`.
Trois audits parallèles (frontend React, backend Rust, galerie/processus) + mesures
en direct sur l'app en production (release bundle, session de 33 min).

## Mesures terrain (2026-08-28, app au repos)

- WebContent (webview principale) : **18,7 % CPU**, empreinte physique **1,4 Go** (pic 2,4 Go).
- WebKit.GPU : 7,1 % CPU ; tauri-app : 2,8 %. Total ≈ **29 % CPU permanent**.
- `sample` du WebContent : la quasi-totalité du temps actif est dans
  `Page::updateRendering → updateIntersectionObservations → computeVisibleRectsInContainer`
  (la boucle de rendu tourne en continu et repaie les observers à chaque frame).
- Serveurs Rust au repos : galerie 10 Mo, studio-server 9 Mo, gateway 1 Mo, ~0 % CPU.
- `.fig_thumbs/` du projet Albedo : **652 Mo, 19 126 fichiers** `imgthumb_*` orphelins
  (contre 4 entrées gérées par le GC). 10 caches `.fig_thumbs` trouvés sous ~/Documents.
- Scan galerie : **63 993 fichiers** parcourus par rebuild ici, dont `rust/target`
  (14 236 fichiers) et `src-tauri/target` — non exclus.
- 9 fichiers `.figures_index.html.<pid>.<nonce>.tmp` (160 Ko chacun) abandonnés à la
  racine du dépôt (écriture atomique interrompue, jamais nettoyée).

## Constats vérifiés à la main (pas seulement par les agents)

1. **Throttle rAF du streaming mort** — `src/App.tsx:1740` guette `kind === "streaming"`,
   mais les providers Rust émettent `"delta"` (`atelier-providers/src/api.rs:177`,
   `acp_map.rs:255`) et le runtime ne réécrit rien (`send.rs`). Chaque token ⇒ un
   `setState` immédiat ⇒ re-render de App entier (l'état `events` vit à la racine,
   `App.tsx:530`, et les 4 sous-arbres TopBar/Rail/viewPanel/overlays ne sont pas mémoïsés).
2. **GC des vignettes cassé** — `atelier-core/src/gallery_builder.rs:325-335` : le GC
   n'accepte que les stems de 32 hex ; les vignettes d'images s'appellent
   `imgthumb_<32hex>.png` (41 chars) et ne sont jamais insérées dans `live` ni supprimées.
   La clé inclut le mtime ⇒ chaque réédition orpheline la précédente.
3. **`record_thread_event` ne fait rien sauf done/error** (`automations.rs:87-90`),
   mais `make_emit` (`send.rs:270-292`) clone chaque événement (deltas compris, jusqu'à
   64 Ko) et spawne une tâche tokio avant ce test.

## Constats des agents (fichier:ligne, priorisés)

### Frontend React

- P2 `src/lib/marge.ts:59` : `findIndex + includes` sur tout le fil, par marque, par render.
- P3 `Chat.tsx:756-902`, `ChatTimeline.tsx:173-314` : ~10 projections O(n) refaites par delta.
- P4 `ChatTimeline.tsx:681-711` : LegendList sans `itemsAreEqual`, `virtualItems`
  reconstruit des objets neufs ⇒ ≥12 rangées re-rendues par frame.
- P5 `src/lib/markdown.ts:50` : `splitCodeSegments` construit `buf += text[i]`
  caractère par caractère sur tout le texte révélé, à chaque frame du typewriter.
- P6 `md.tsx:305` : le cache highlight (LRU 300, clé `lang+raw`) est pollué par le bloc
  de code en croissance (une clé neuve par frame) ⇒ éviction de l'historique.
- P8 `toolPresentation.tsx:171-189` : `stripAnsi` (regex sur ≤64 Ko) + `JSON.parse`
  à chaque render, zéro memo.
- P10 `ChatTimeline.tsx:511-520` : interval 300 ms avec 3 lectures de géométrie
  (reflow forcé) dès que autoFollow, même sans streaming.
- P9 mémoire : `events` (App.tsx:530) jamais borné ; AtelierPane garde toutes les
  surfaces montées en `display:none` ; xterm scrollback 10000 + WebGL par terminal.
- P13 bundle : entrée 970 Ko (budget 1 024), App.css 356 Ko source, base-ui 271 Ko au boot.
- P14 `App.css:216-217` : deux règles `:has()` sur les rangées virtualisées (le fichier
  interdit lui-même `:has()` à la ligne 366).
- Déjà bons : hljs par langages, mermaid/KaTeX lazy, MdBlock mémoïsé, listExtraData stable.

### Backend Rust

- `atelier-core/src/lib.rs:15-29` : `EXCLUDED_DIRECTORIES` sans `target`/`dist`/`build`.
- `atelier-gallery/src/main.rs:1980-1990` : lock `watcher.write().await` pris par
  événement FS même quand `relevant_change` a tout filtré.
- `send.rs:1178` : `last_sequence` relit tout le JSONL par événement texte (fils liés,
  O(n²)) ; `linked_reply_text` re-mirror le texte complet à chaque fois.
- `usage.rs:186-298` : getUsage rescanne ~/.codex/sessions + logs grok/kimi sans cache ;
  appelé toutes les 5 min + rafale de 9 à l'ouverture du popover.
- `ledger.rs:71-96` : tous les ledgers lus ET parsés en entier avant troncature à 500.
- `claude.rs:583,839-847` : append_log ouvre/ferme le fichier par ligne, aucune rotation.
- `threads.rs:245-249` : threads.json réécrit en pretty à chaque upsert (plusieurs par tour).
- `atelier.rs:142-145,214` : MD5 du binaire 7,7 Mo à chaque start_atelier, sans cache.
- `atelier.rs:238-252` + `src-tauri/src/lib.rs` : serveurs galerie spawnés détachés,
  un par projet visité, jamais arrêtés (survivent à la fermeture de l'app).
- `host.rs:92-97` : `std::mem::forget(child)` ⇒ un zombie par ouverture de fichier externe.
- `rust/Cargo.toml` + `src-tauri/Cargo.toml` : aucun `[profile.release]` (pas de LTO,
  pas de strip) ; bundle rust-server ≈ 45 Mo.
- `gallery_builder.rs:260-336` : vignettes séquentielles, `canonicalize` par image par
  scan, busy-wait 50 ms.
- RAS : automations 30 s (plafonnée), turn_idle 5 s (pendant tour), watcher annulation.

### Galerie / éditeurs

- `gallery_template.html:2567` : `q.oninput = render` sans debounce ; render() remplace
  jusqu'à 600 cartes.
- `gallery_template.html:802-808` : MutationObserver subtree qui rappelle
  `applyShadcnGalleryContract` (7 querySelectorAll) par nœud ajouté.
- `gallery_template.html:1685` : vignette inspecteur cache-bustée par `Date.now()`.
- `gallery_template.html:2522,2523,2931-2942` : 3 pollings (2,5 s / 30 s / 60 s) sans
  gating `document.hidden`.
- `core/document_session.ts:110-128` + surfaces latex/code/markdown : texte complet
  retéléchargé toutes les 2 s par éditeur ouvert, juste pour comparer un mtime
  (la route `/statfile` existe déjà : `files.rs:352`).
- `features/latex/reading.ts:786-788` : mode Lecture re-rend tout le document (regex +
  KaTeX + innerHTML) à chaque frappe (rAF ≠ debounce).
- `features/latex/pdf_sync.ts:166-190` : toutes les pages PDF rendues en canvas d'un
  coup (≈14 Mo/page en 2×), rechargées à chaque compilation ; `pdf_viewer.html` fait
  mieux mais n'évince pas non plus.
- `surfaces/latex.ts:657-675` : auto-compile 3 s d'inactivité (choix produit, tunable).
- Déjà bons : diff_versions.js (worker + debounce + memo), lazy images, plafond 600,
  snipObserver disconnect/unobserve.
- Sidecar Node : mort en prod (studio-server Rust seul) ; coût = CI + docs périmées.

## Ce qu'il ne faut PAS toucher

- `diff_versions.js` (déjà optimal, suite de 183 tests).
- Les imports lazy existants (mermaid, KaTeX, xterm, CodeMirror).
- `listExtraData` (ChatTimeline) : la discipline d'identité est bonne, c'est `data`
  qui l'annule.
- Les timers déjà gatés (App.tsx:949, :2381, NarvalSurface, RailActivity…).
