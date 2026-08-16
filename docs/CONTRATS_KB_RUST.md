# Contrats à préserver en portant la KB en Rust

Écrit le 2026-08-16 pendant le merge KB→Rust, pour que le portage n'écrase pas
deux correctifs frais et trois contrats dont dépendent les Preuves.

## Ce qui est DÉJÀ 100 % Rust (rien à porter)

- Store d'épingles (`evidence.rs`), WS `pinPassage`/`listPins`/`unpinPassage`,
  validation par source, dédup — Rust seulement par décision (pas de miroir Node).
- Expansion `/ref` (`send.rs::expand_ref_command`) + entrée `ref` de `listCommands`.
- Instructions zotero/gbrain injectées au premier tour (`send.rs:43-53`).
- Aiguillage ssh du `gbrain capture` de `kb_promote` (`ws_router.rs`, env
  `ATELIER_GBRAIN_SSH_HOST`, défaut `nas`, `""` = binaire local,
  `ATELIER_TEST_GBRAIN` = hook de test).

## Ce qui est encore NODE sur le chemin du backend Rust (31× kb_cli_run)

1. **`sidecar/kb_cli.mjs` + `sidecar/knowledge.mjs`** — toutes les routes
   `kbGbrainPage`, `gbrain-search`, `kbAdd`, promotion, etc. spawnent ce CLI.
   ⚠️ **Le fix critique du 2026-08-16 vit là** : `gbrainInvocation()` route TOUT
   appel gbrain via `ssh nas gbrain …` (échappement single-quote des args).
   **Raison** : le binaire gbrain local pointe sur un brain PGLite local quasi
   vide (`~/.gbrain/config.json`, transport local) — sans ce routage, toutes
   les lectures de pages font `page_not_found` et les captures écrivent dans le
   vide. UN PORT RUST DE LA KB DOIT REPRENDRE CE ROUTAGE (même env, même défaut).
2. **`sidecar/atelier-zotero-passages` → `zotero_passage_cli.mjs` +
   `zotero_passages.mjs`** — l'outil terminal que l'AGENT invoque (instruction
   send.rs). Porte le mode `--corpus` (recherche multi-index) avec :
   citation bornée au meilleur paragraphe + `matched > 0` obligatoire (une
   quote exacte mais hors sujet est interdite), exclusion des index sans méta
   zotero (jamais de lien approximatif), `passageLink` (quote ≤ 900).

## Contrats de bout en bout que le port ne doit pas casser

- `#atelier-zotero-passage?key…&pdfKey…&file…&page…&quote…` (quote ≤ 900, non
  vide) et `#atelier-gbrain-passage?slug…&quote…` — slugs hiérarchiques :
  segments `[A-Za-z0-9._-]+` séparés par `/`, sans slash tête/queue, sans
  `.`/`..`, ≤ 200 (miroir TS `md.tsx::isValidGbrainSlug` ↔ Rust
  `evidence::is_valid_gbrain_slug` — trois implémentations = interdit, si la
  KB Rust valide des slugs, réutiliser `evidence::is_valid_gbrain_slug`).
- Réponse `gbrainPage {slug, chars, markdown}` (+`error`) — consommée par
  SourceReader (surlignage `highlightQuote`).
- `Page gbrain introuvable: <slug>` : détection amont = `^Error \[page_not_found\]`
  (`GBRAIN_NOT_FOUND`, knowledge.mjs:329).
- Sortie `search --corpus` : `{ok, corpus:true, query, count, results:[{quote,
  page, score, pdfFile, zoteroKey, pdfKey, markdownLink}]}` — l'instruction
  agent (send.rs) promet ce format.

## Tests qui verrouillent tout ça

- `cd sidecar && npx vitest run zotero_passages.test.mjs knowledge.test.mjs`
- `cargo test -p atelier-runtime` (89+) — evidence, ws contrat, /ref, slugs.
- Sondes vivantes (pattern session 2026-08-15/16) : WS `kbGbrainPage` sur
  `aubrywake_2022_fire_and_ice_wildfire_albedo` doit rendre ~66 000 caractères.

## Défauts d'import restants (diagnostiqués 2026-08-16, sondes à l'appui)

- **Conversions MinerU parallèles = perte totale** : 5 imports simultanés → zéro
  brouillon (limite de concurrence cloud probable), alors qu'un import seul
  réussit (640 s, brouillon complet). À faire : sémaphore (1-2 conversions max)
  dans le chemin d'import, et le REPLI « extraction locale » doit produire un
  brouillon en cas d'échec MinerU — aujourd'hui il perd tout en silence.
- **`article-list` ne liste pas un brouillon présent sur disque**
  (knowledge/article-drafts/*.md) — sémantique à clarifier ou bug.
- Corrigés (ne pas régresser) : `python -u` sur le spawn MinerU (étapes en
  direct, ec33e60f) ; `probe_exists` tolère page_not_found (première écriture
  d'un article neuf, b8c06ecd) ; libellé « En attente » avant la première étape.
- Maintenance infra (hors app) : les CLI gbrain Mac ET NAS sont en retard
  (0.42.x → 0.46.2 dispo) — mise à niveau à faire par Thierry le moment venu.

## Note connexe (résolution des pilules fichier, 2026-08-16)

`listFiles` plafonne le catalogue à 5000 entrées — le projet Albedo en déborde
et les fichiers hors plafond deviennent invisibles pour la résolution rapide
des pilules `fichier:ligne` du chat (repli /findfile, désormais avec une
retentative). Pistes côté Rust : plafond plus haut, ou tri qui privilégie les
fichiers de code (.py/.tex/.r/.jl) sur les données pour rester sous le plafond
utile.
