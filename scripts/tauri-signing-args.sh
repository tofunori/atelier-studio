#!/usr/bin/env bash
# Sourcé par build-tauri-app.sh et build-tauri-dmg.sh : remplit SIGNING_ARGS.
#
# tauri.conf.json signe en ad hoc (« - ») pour que n'importe qui puisse
# compiler Atelier depuis les sources. Sur un Mac de développement qui possède
# le certificat « Atelier Dev Signing » (ou celui nommé par
# ATELIER_SIGNING_IDENTITY), le build le reprend : identité stable, donc
# macOS garde ses autorisations TCC d'un build à l'autre.
SIGNING_ARGS=()
DEV_IDENTITY="${ATELIER_SIGNING_IDENTITY:-Atelier Dev Signing}"
if command -v security >/dev/null 2>&1 \
  && security find-identity -p codesigning 2>/dev/null | grep -qF "\"$DEV_IDENTITY\""; then
  SIGNING_ARGS=(--config "{\"bundle\":{\"macOS\":{\"signingIdentity\":\"$DEV_IDENTITY\"}}}")
  echo "Signature : $DEV_IDENTITY"
else
  echo "Signature : ad hoc (certificat « $DEV_IDENTITY » absent du trousseau)"
fi
