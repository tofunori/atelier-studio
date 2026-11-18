#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

SOURCE="src-tauri/appsnap/AppSnapHelper.swift"
DIST="src-tauri/appsnap-dist"
OUTPUT="$DIST/atelier-appsnap-helper"

rm -rf "$DIST"
mkdir -p "$DIST"

if [[ "$(uname -s)" != "Darwin" ]]; then
  # AppSnap relies on ScreenCaptureKit/AppKit and is macOS-only; keep a non-empty
  # directory so Tauri resource bundling succeeds on Linux.
  touch "$DIST/.keep"
  echo "[stage-appsnap] hors macOS : ressource factice stagée dans $DIST"
  exit 0
fi

swiftc \
  -swift-version 5 \
  -O \
  -target arm64-apple-macos12.3 \
  -framework AppKit \
  -framework ApplicationServices \
  -framework CoreGraphics \
  -framework CoreImage \
  -framework CoreMedia \
  -framework CoreVideo \
  -framework ScreenCaptureKit \
  "$SOURCE" \
  -o "$OUTPUT"

chmod +x "$OUTPUT"
"$OUTPUT" --check-permissions
ls -la "$OUTPUT"
