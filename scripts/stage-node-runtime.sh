#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_VERSION="22.22.3"
NODE_PLATFORM="darwin-arm64"
NODE_ARCHIVE="node-v${NODE_VERSION}-${NODE_PLATFORM}.tar.gz"
NODE_SHA256="0da7ff74ef8611328c8212f17943368713a2ad953fb7d89a8c8a0eae87c23207"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
CACHE_DIR=".cache/node-runtime"
CACHE_FILE="${CACHE_DIR}/${NODE_ARCHIVE}"
DIST="src-tauri/node-dist"

if [ "$(uname -m)" != "arm64" ]; then
  echo "Node embarqué: ce build exige macOS arm64" >&2
  exit 1
fi

mkdir -p "$CACHE_DIR"
if [ -n "${ATELIER_NODE_ARCHIVE:-}" ]; then
  if [ "$ATELIER_NODE_ARCHIVE" != "$CACHE_FILE" ]; then
    cp "$ATELIER_NODE_ARCHIVE" "$CACHE_FILE"
  fi
elif [ ! -f "$CACHE_FILE" ]; then
  PARTIAL_FILE="$(mktemp "$CACHE_DIR/.node-download.XXXXXX")"
  trap 'rm -f "$PARTIAL_FILE"' EXIT
  curl --fail --location --proto '=https' --tlsv1.2 --retry 3 \
    --output "$PARTIAL_FILE" "$NODE_URL"
  mv "$PARTIAL_FILE" "$CACHE_FILE"
  trap - EXIT
fi

ACTUAL_SHA256="$(shasum -a 256 "$CACHE_FILE" | awk '{print $1}')"
if [ "$ACTUAL_SHA256" != "$NODE_SHA256" ]; then
  echo "Checksum Node invalide: attendu $NODE_SHA256, obtenu $ACTUAL_SHA256" >&2
  rm -f "$CACHE_FILE"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
tar -xzf "$CACHE_FILE" -C "$TMP_DIR" \
  "node-v${NODE_VERSION}-${NODE_PLATFORM}/bin/node" \
  "node-v${NODE_VERSION}-${NODE_PLATFORM}/LICENSE"

rm -rf "$DIST"
mkdir -p "$DIST/bin"
cp "$TMP_DIR/node-v${NODE_VERSION}-${NODE_PLATFORM}/bin/node" "$DIST/bin/node"
cp "$TMP_DIR/node-v${NODE_VERSION}-${NODE_PLATFORM}/LICENSE" "$DIST/LICENSE"
chmod 755 "$DIST/bin/node"
printf '%s\n' "$NODE_VERSION" > "$DIST/VERSION"

STAGED_VERSION="$("$DIST/bin/node" --version)"
if [ "$STAGED_VERSION" != "v${NODE_VERSION}" ]; then
  echo "Version Node stagée invalide: $STAGED_VERSION" >&2
  exit 1
fi

echo "Node ${STAGED_VERSION} embarqué ($(du -sh "$DIST" | awk '{print $1}'))"
