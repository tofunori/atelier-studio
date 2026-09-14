#!/bin/bash
# Copie la galerie vendorisée (gallery/) dans les ressources Tauri.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:gallery-ui
npm --prefix gallery run build:cm6
DIST=src-tauri/gallery-dist
rm -rf "$DIST"
mkdir -p "$DIST"
# gallery/server/ (serveur HTTP Node + routes) n'est jamais exécuté par l'app :
# le backend galerie est atelier-gallery-server (Rust), qui sert gallery/assets/
# + l'UI construite via ATELIER_ASSETS_DIR (plan 065 Phase B). Les harnais
# (gallery/tests/, dont kb_parity/ utilisé aussi par des tests Rust) ne sont
# jamais embarqués dans le bundle applicatif.
rsync -a --exclude '.fig_thumbs' --exclude 'figures_index.html' --exclude '__pycache__' \
  --exclude '*.pyc' --exclude 'example' --exclude 'docs' --exclude 'node_modules' \
  --exclude 'server' --exclude 'tests' gallery/ "$DIST/"
du -sh "$DIST"
