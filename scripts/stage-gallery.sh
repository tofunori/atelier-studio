#!/bin/bash
# Copie la galerie vendorisée (gallery/) dans les ressources Tauri.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:gallery-ui
npm --prefix gallery run build:cm6
DIST=src-tauri/gallery-dist
rm -rf "$DIST"
mkdir -p "$DIST"
# Le backend galerie est atelier-gallery-server (Rust) ; l'app ne lui passe
# que ATELIER_ASSETS_DIR=<dist>/assets (src-tauri/src/atelier.rs) et le serveur
# ne lit rien d'autre sous cette racine. Le bundle n'embarque donc QUE assets/
# (template, bundles CM6/React construits ci-dessus, viewers) — ni sources TS
# (src/, *-src/, react-ui/), ni scripts Python historiques, ni harnais
# (tests/), ni artefacts Playwright (test-results/) : 2026-09-14, ~1 Mo de
# moins et surtout rien d'exécutable inutile dans le .app.
mkdir -p "$DIST/assets"
rsync -a --exclude '.fig_thumbs' --exclude '__pycache__' --exclude '*.pyc' \
  --exclude 'node_modules' gallery/assets/ "$DIST/assets/"
du -sh "$DIST"
