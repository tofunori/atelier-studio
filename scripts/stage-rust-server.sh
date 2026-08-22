#!/bin/bash
# Stage atelier-studio-server into the Tauri resource tree (plan 033 Porte 10).
# Bundled so the app can default to the Rust backend without a local cargo tree.
set -euo pipefail
cd "$(dirname "$0")/.."
DIST=src-tauri/rust-server-dist
BIN_NAMES=(atelier-studio-server atelier-remote-gateway atelier-gallery-server atelier-gallery-tool atelier-agent-mcp)
# Wrappers agents KB (plan 065, vague 3 — préparation) : binaires Rust
# stagés CÔTÉ À CÔTÉ des scripts sh existants (sidecar/atelier-kb,
# sidecar/atelier-zotero-passages), jamais à leur place — le suffixe `-rs`
# les distingue dans le dist. Rien ne les invoque en production tant que
# les chemins injectés dans les prompts (kb_block.rs, send.rs) n'ont pas
# basculé ; ce basculement est une décision d'activation séparée.
KB_BIN_NAMES=(atelier-kb-rs atelier-zotero-passages-rs)

mkdir -p "$DIST"

# Purge des reliquats Node (2026-08-22) : le dist n'est jamais recréé de zéro,
# donc un fichier qu'on cesse de stager y SURVIT et repart dans le .app. Tous
# les .mjs et les wrappers shell qui les lançaient sont portés en Rust.
find "$DIST" -maxdepth 1 -name '*.mjs' -delete
rm -f "$DIST/atelier-kb" "$DIST/atelier-zotero-passages"

if [[ "${ATELIER_SKIP_RUST_BUILD:-}" != "1" ]]; then
  echo "[stage-rust-server] cargo build -p atelier-server -p atelier-remote -p atelier-gallery -p atelier-agent-mcp -p atelier-kb --release"
  cargo build -p atelier-server -p atelier-remote -p atelier-gallery -p atelier-agent-mcp -p atelier-kb --release --manifest-path rust/Cargo.toml --bins
fi

for BIN_NAME in "${BIN_NAMES[@]}"; do
  SRC_RELEASE="rust/target/release/$BIN_NAME"
  SRC_DEBUG="rust/target/debug/$BIN_NAME"
  if [[ -f "$SRC_RELEASE" ]]; then
    cp -f "$SRC_RELEASE" "$DIST/$BIN_NAME"
  elif [[ -f "$SRC_DEBUG" ]]; then
    echo "[stage-rust-server] WARNING: using debug binary for $BIN_NAME (release missing)"
    cp -f "$SRC_DEBUG" "$DIST/$BIN_NAME"
  else
    echo "[stage-rust-server] ERROR: $BIN_NAME not found. Build first or unset ATELIER_SKIP_RUST_BUILD."
    exit 1
  fi
  chmod +x "$DIST/$BIN_NAME"
done

for BIN_NAME in "${KB_BIN_NAMES[@]}"; do
  SRC_RELEASE="rust/target/release/$BIN_NAME"
  SRC_DEBUG="rust/target/debug/$BIN_NAME"
  if [[ -f "$SRC_RELEASE" ]]; then
    cp -f "$SRC_RELEASE" "$DIST/$BIN_NAME"
  elif [[ -f "$SRC_DEBUG" ]]; then
    echo "[stage-rust-server] WARNING: using debug binary for $BIN_NAME (release missing)"
    cp -f "$SRC_DEBUG" "$DIST/$BIN_NAME"
  else
    echo "[stage-rust-server] ERROR: $BIN_NAME not found. Build first or unset ATELIER_SKIP_RUST_BUILD."
    exit 1
  fi
  chmod +x "$DIST/$BIN_NAME"
done

# Plus AUCUN .mjs stagé : la chaîne KB, l'outil galerie et les passages
# Zotero sont tous portés en Rust (2026-08-22). atelier-gallery-tool est
# désormais le binaire Rust copié par la boucle BIN_NAMES ci-dessus.
# La garde d'imports .mjs a disparu avec les .mjs : le dist ne contient plus
# que des binaires, dont l'intégrité est déjà couverte par BUILD_STAMP.txt.
# Drop a tiny stamp for diagnostics (not hashed as the server binary itself is the identity).
{
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for BIN_NAME in "${BIN_NAMES[@]}" "${KB_BIN_NAMES[@]}"; do
    shasum -a 256 "$DIST/$BIN_NAME" | awk -v name="$BIN_NAME" '{print name "_sha256=" $1}'
  done
} >"$DIST/BUILD_STAMP.txt"

du -sh "$DIST"
ls -la "${BIN_NAMES[@]/#/$DIST/}" "${KB_BIN_NAMES[@]/#/$DIST/}"
