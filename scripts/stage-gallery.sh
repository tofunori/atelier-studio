#!/bin/bash
# Copie la galerie vendorisée (gallery/) dans les ressources Tauri.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:gallery-ui
DIST=src-tauri/gallery-dist
rm -rf "$DIST"
mkdir -p "$DIST"
rsync -a --exclude '.fig_thumbs' --exclude 'figures_index.html' --exclude '__pycache__' \
  --exclude '*.pyc' --exclude 'example' --exclude 'docs' gallery/ "$DIST/"
du -sh "$DIST"
