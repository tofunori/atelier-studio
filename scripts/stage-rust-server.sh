#!/bin/bash
# Stage atelier-studio-server into the Tauri resource tree (plan 033 Porte 10).
# Bundled so the app can default to the Rust backend without a local cargo tree.
set -euo pipefail
cd "$(dirname "$0")/.."
DIST=src-tauri/rust-server-dist
BIN_NAME=atelier-studio-server
SRC_RELEASE=rust/target/release/$BIN_NAME
SRC_DEBUG=rust/target/debug/$BIN_NAME

mkdir -p "$DIST"

if [[ "${ATELIER_SKIP_RUST_BUILD:-}" != "1" ]]; then
  echo "[stage-rust-server] cargo build -p atelier-server --release"
  cargo build -p atelier-server --release --manifest-path rust/Cargo.toml
fi

if [[ -f "$SRC_RELEASE" ]]; then
  cp -f "$SRC_RELEASE" "$DIST/$BIN_NAME"
elif [[ -f "$SRC_DEBUG" ]]; then
  echo "[stage-rust-server] WARNING: using debug binary (release missing)"
  cp -f "$SRC_DEBUG" "$DIST/$BIN_NAME"
else
  echo "[stage-rust-server] ERROR: $BIN_NAME not found. Build first or unset ATELIER_SKIP_RUST_BUILD."
  exit 1
fi

chmod +x "$DIST/$BIN_NAME"
# Drop a tiny stamp for diagnostics (not hashed as the server binary itself is the identity).
{
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source=$(if [[ -f $SRC_RELEASE ]]; then echo release; else echo debug; fi)"
  shasum -a 256 "$DIST/$BIN_NAME" | awk '{print "sha256="$1}'
} >"$DIST/BUILD_STAMP.txt"

du -sh "$DIST"
ls -la "$DIST/$BIN_NAME"
