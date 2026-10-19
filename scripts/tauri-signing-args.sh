#!/usr/bin/env bash
# Sourcé par build-tauri-app.sh et build-tauri-dmg.sh : remplit SIGNING_ARGS.
#
# tauri.conf.json signe en ad hoc (« - ») pour que n'importe qui puisse
# compiler Atelier depuis les sources. Sur un Mac de développement qui possède
# le certificat « Atelier Dev Signing » (ou celui nommé par
# ATELIER_SIGNING_IDENTITY), le build le reprend : identité stable, donc
# macOS garde ses autorisations TCC d'un build à l'autre.
#
# Avec ATELIER_PREFER_DEVELOPER_ID=1 (posé par build-tauri-dmg.sh), un
# certificat « Developer ID Application » du trousseau passe avant le
# certificat maison : c'est celui qu'Apple accepte de notariser.
#
# Quand l'identité retenue est un Developer ID, elle est aussi exportée dans
# ATELIER_RESOURCE_SIGNING_IDENTITY : Tauri ne signe que l'exécutable
# principal, et sign-staged-resources.sh (lancé par beforeBuildCommand) signe
# alors les binaires rangés dans Resources/ avec le runtime renforcé, sans
# quoi la notarisation les refuse.
SIGNING_ARGS=()
unset ATELIER_RESOURCE_SIGNING_IDENTITY
DEV_IDENTITY="${ATELIER_SIGNING_IDENTITY:-}"
if [[ -z "$DEV_IDENTITY" && "${ATELIER_PREFER_DEVELOPER_ID:-0}" == 1 ]] && command -v security >/dev/null 2>&1; then
  # Nom complet, ex. « Developer ID Application: Nom (ABCDE12345) ».
  DEV_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -n 1)"
fi
DEV_IDENTITY="${DEV_IDENTITY:-Atelier Dev Signing}"
if command -v security >/dev/null 2>&1 \
  && security find-identity -p codesigning 2>/dev/null | grep -qF "\"$DEV_IDENTITY\""; then
  SIGNING_ARGS=(--config "{\"bundle\":{\"macOS\":{\"signingIdentity\":\"$DEV_IDENTITY\"}}}")
  echo "Signature : $DEV_IDENTITY"
  if [[ "$DEV_IDENTITY" == "Developer ID Application:"* ]]; then
    export ATELIER_RESOURCE_SIGNING_IDENTITY="$DEV_IDENTITY"
  fi
else
  echo "Signature : ad hoc (certificat « $DEV_IDENTITY » absent du trousseau)"
fi
