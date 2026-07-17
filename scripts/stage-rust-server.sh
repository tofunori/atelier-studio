#!/bin/bash
# Stage atelier-studio-server into the Tauri resource tree (plan 033 Porte 10).
# Bundled so the app can default to the Rust backend without a local cargo tree.
set -euo pipefail
cd "$(dirname "$0")/.."
DIST=src-tauri/rust-server-dist
BIN_NAMES=(atelier-studio-server atelier-remote-gateway atelier-gallery-server)

mkdir -p "$DIST"

if [[ "${ATELIER_SKIP_RUST_BUILD:-}" != "1" ]]; then
  echo "[stage-rust-server] cargo build -p atelier-server -p atelier-remote -p atelier-gallery --release"
  cargo build -p atelier-server -p atelier-remote -p atelier-gallery --release --manifest-path rust/Cargo.toml
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
cp sidecar/gallery_tool_cli.mjs sidecar/atelier-gallery-tool \
  sidecar/zotero_passages.mjs sidecar/zotero_passage_cli.mjs sidecar/atelier-zotero-passages \
  sidecar/knowledge.mjs sidecar/kb_cli.mjs sidecar/atelier-kb "$DIST/"
chmod +x "$DIST/atelier-gallery-tool" "$DIST/atelier-zotero-passages" "$DIST/atelier-kb"
# Drop a tiny stamp for diagnostics (not hashed as the server binary itself is the identity).
{
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  for BIN_NAME in "${BIN_NAMES[@]}"; do
    shasum -a 256 "$DIST/$BIN_NAME" | awk -v name="$BIN_NAME" '{print name "_sha256=" $1}'
  done
} >"$DIST/BUILD_STAMP.txt"

du -sh "$DIST"
ls -la "${BIN_NAMES[@]/#/$DIST/}"
