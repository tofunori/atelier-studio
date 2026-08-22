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
# Garde-fou : la chaîne d'imports des modules stagés doit se résoudre DANS le
# dist (un import ajouté côté sidecar/ mais absent de la liste cp ci-dessus a
# déjà cassé le CLI kb dans le bundle — échouer au build, pas au runtime).
# kb_cli.mjs est la RACINE réelle (il tire knowledge.mjs, article.mjs,
# zotero_passages.mjs) : c'est lui qu'il faut charger, sinon un import ajouté
# plus haut dans la chaîne passe le garde-fou et casse au runtime.
# Le chemin passe par l'ENVIRONNEMENT, pas par argv[1] : kb_cli.mjs décide
# s'il est un point d'entrée en comparant `import.meta.url` à `process.argv[1]`.
# Le lui donner en argv le faisait se croire lancé en CLI — il affichait son
# mode d'emploi et sortait en 1, faisant échouer tous les builds alors que
# l'import lui-même avait réussi.
KB_ENTRY="$DIST/kb_cli.mjs" node -e "import(require('node:url').pathToFileURL(process.env.KB_ENTRY).href).then(()=>{}, (e)=>{ console.error('[stage-rust-server] import du dist KO:', e.message); process.exit(1); })"
# Drop a tiny stamp for diagnostics (not hashed as the server binary itself is the identity).
{
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for BIN_NAME in "${BIN_NAMES[@]}" "${KB_BIN_NAMES[@]}"; do
    shasum -a 256 "$DIST/$BIN_NAME" | awk -v name="$BIN_NAME" '{print name "_sha256=" $1}'
  done
} >"$DIST/BUILD_STAMP.txt"

du -sh "$DIST"
ls -la "${BIN_NAMES[@]/#/$DIST/}" "${KB_BIN_NAMES[@]/#/$DIST/}"
