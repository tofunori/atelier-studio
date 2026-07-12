#!/bin/bash
# Bundle the phone web companion so Atelier can serve it without a dev server.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd mobile && npm run build)
cp -f src-tauri/icons/128x128@2x.png mobile/dist/apple-touch-icon.png
cp -f src-tauri/icons/128x128@2x.png mobile/dist/icon-192.png
cp -f src-tauri/icons/icon.png mobile/dist/icon-512.png
rm -rf src-tauri/mobile-dist
mkdir -p src-tauri/mobile-dist
cp -R mobile/dist/. src-tauri/mobile-dist/
du -sh src-tauri/mobile-dist
