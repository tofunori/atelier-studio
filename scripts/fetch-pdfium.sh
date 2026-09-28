#!/bin/bash
# PDFium (le moteur PDF de Chromium, licence BSD/Apache) pour `atelier-pdf`.
# Télécharge UNE version épinglée pour la plateforme courante dans
# rust/vendor/pdfium/ (hors git), vérifie son sha256 et affiche le chemin de
# la bibliothèque. Idempotent : ne retélécharge pas une version déjà là.
# Appelé par stage-rust-server.sh (le .app embarque la bibliothèque), par la
# CI avant les tests Rust, et à la main en développement.
set -euo pipefail
cd "$(dirname "$0")/.."

PDFIUM_BUILD=8066
DEST=rust/vendor/pdfium

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  ASSET=pdfium-mac-arm64;  SHA=336219e80580b93c6523f44db7dc1de59cc497b13a7390ddac84223f68ca162b; LIB=libpdfium.dylib ;;
  Darwin-x86_64) ASSET=pdfium-mac-x64;    SHA=841ecac278cdd46288dd065873522cf72f3996560d8978f473d336f01d59942c; LIB=libpdfium.dylib ;;
  Linux-x86_64)  ASSET=pdfium-linux-x64;  SHA=0b43f405477cf2cfc4dbff06905093c3309756c6bca1fb9da99234a2ca97fed2; LIB=libpdfium.so ;;
  *) echo "[fetch-pdfium] plateforme non prise en charge : $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

STAMP="$DEST/VERSION.atelier"
if [[ -f "$DEST/lib/$LIB" && -f "$STAMP" && "$(cat "$STAMP")" == "$ASSET-$PDFIUM_BUILD" ]]; then
  echo "$PWD/$DEST/lib/$LIB"
  exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
URL="https://github.com/bblanchon/pdfium-binaries/releases/download/chromium/$PDFIUM_BUILD/$ASSET.tgz"
echo "[fetch-pdfium] $URL" >&2
curl -fsSL --retry 3 -o "$TMP/pdfium.tgz" "$URL"
GOT="$( (command -v sha256sum >/dev/null && sha256sum "$TMP/pdfium.tgz") || shasum -a 256 "$TMP/pdfium.tgz")"
if [[ "${GOT%% *}" != "$SHA" ]]; then
  echo "[fetch-pdfium] sha256 inattendu pour $ASSET : ${GOT%% *}" >&2
  exit 1
fi
mkdir -p "$TMP/x"
tar xzf "$TMP/pdfium.tgz" -C "$TMP/x"
rm -rf "$DEST"
mkdir -p "$DEST/lib"
cp "$TMP/x/lib/$LIB" "$DEST/lib/$LIB"
cp "$TMP/x/LICENSE" "$DEST/LICENSE"
# macOS arm64 refuse de charger du code sans signature : une signature ad hoc
# suffit (les serveurs d'Atelier ne sont pas en runtime durci).
if [[ "$(uname -s)" == Darwin ]]; then
  codesign --force --sign - "$DEST/lib/$LIB" >/dev/null 2>&1 || true
fi
echo "$ASSET-$PDFIUM_BUILD" >"$STAMP"
echo "$PWD/$DEST/lib/$LIB"
