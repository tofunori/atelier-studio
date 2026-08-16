#!/bin/bash
# Stage la chaîne KB Node (repli ATELIER_KB_ENGINE=node, soak plan 065 phase C)
# et les wrappers agent encore résolus par du code Rust. Le sidecar CHAT Node
# a été retiré (plan 065 phase A, voir src-tauri/src/sidecar.rs) : index.mjs,
# router.mjs, terminal.mjs, providers/, package.json/node_modules ne sont
# plus stagés — ce script ne construit plus un runtime Node complet.
set -euo pipefail
cd "$(dirname "$0")/.."
DIST=src-tauri/sidecar-dist
rm -rf "$DIST"
mkdir -p "$DIST"

# Chaîne KB : point d'entrée kb_cli.mjs (repli
# rust/crates/atelier-runtime/src/ws_router.rs::kb_cli_run_node /
# kb_cli_stream_node) + tout .mjs dont il dépend réellement au runtime
# (graphe d'imports relatifs vérifié à la main, plan 065 phase A) :
#   kb_cli.mjs      -> article.mjs, knowledge.mjs, zotero_passages.mjs
#   article.mjs     -> knowledge.mjs, article_meta.mjs, zotero_passages.mjs
#   knowledge.mjs   -> csv_digest.mjs, zotero_passages.mjs, kb_prompt.mjs
#   article_meta.mjs, zotero_passages.mjs, csv_digest.mjs, kb_prompt.mjs
#                   -> aucun import local (uniquement node:*)
# zotero_passage_cli.mjs (-> zotero_passages.mjs) est le CLI frère de
# zotero_passages : même famille de contrat que kb_cli, gardé avec la chaîne.
# ZÉRO import npm dans tout ce groupe : uniquement des modules node:.
cp sidecar/kb_cli.mjs \
   sidecar/kb_prompt.mjs \
   sidecar/knowledge.mjs \
   sidecar/article.mjs \
   sidecar/article_meta.mjs \
   sidecar/zotero_passages.mjs \
   sidecar/csv_digest.mjs \
   sidecar/zotero_passage_cli.mjs \
   "$DIST/"

# Wrappers shell agent : ne garder que ceux qu'un chemin Rust résout encore.
# - atelier-gallery-tool : résolu par
#   rust/crates/atelier-runtime/src/send.rs::with_gallery_tool_instruction
#   (chemin injecté dans le prompt agent ; pas encore porté en binaire Rust,
#   plan 047 phase 1 partielle) -> garder lui ET gallery_tool_cli.mjs.
# - atelier-kb / atelier-zotero-passages : PLUS résolus par aucun code Rust
#   depuis la bascule soak 065 — kb_block.rs pointe sur atelier-kb-rs et
#   send.rs sur atelier-zotero-passages-rs (binaires Rust de
#   rust-server-dist, cf. scripts/stage-rust-server.sh). Ne plus les stager.
cp sidecar/gallery_tool_cli.mjs sidecar/atelier-gallery-tool "$DIST/"
chmod +x "$DIST/atelier-gallery-tool"

du -sh "$DIST"
