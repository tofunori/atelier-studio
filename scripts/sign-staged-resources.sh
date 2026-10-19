#!/usr/bin/env bash
# Dernière étape de beforeBuildCommand : signe les binaires stagés dans les
# ressources de l'app (serveurs Rust, PDFium, AppSnap) avec le Developer ID.
#
# Tauri signe l'exécutable principal mais copie Resources/ tel quel : les
# binaires y gardent leur signature ad hoc du linker, et le service de
# notarisation d'Apple refuse toute app qui contient un Mach-O sans
# signature Developer ID, sans horodatage ou sans runtime renforcé.
#
# Ne fait rien sans ATELIER_RESOURCE_SIGNING_IDENTITY, exporté par
# tauri-signing-args.sh seulement quand l'identité retenue est un Developer
# ID : les builds ad hoc et « Atelier Dev Signing » restent inchangés.
#
# Les empreintes de rust-server-dist/BUILD_STAMP.txt, écrites avant cette
# étape, décrivent les binaires non signés (le fichier sert au diagnostic).
set -euo pipefail
cd "$(dirname "$0")/.."

IDENTITY="${ATELIER_RESOURCE_SIGNING_IDENTITY:-}"
if [[ -z "$IDENTITY" ]]; then
  echo "[sign-staged-resources] pas de Developer ID : ressources laissées telles quelles"
  exit 0
fi

signed=0
for DIR in src-tauri/rust-server-dist src-tauri/appsnap-dist src-tauri/gallery-dist; do
  [[ -d "$DIR" ]] || continue
  while IFS= read -r -d '' FILE; do
    file -b "$FILE" | grep -q '^Mach-O' || continue
    # --options runtime : runtime renforcé ; --timestamp : horodatage Apple,
    # exigé par la notarisation (demande l'accès réseau).
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$FILE"
    codesign --verify --strict "$FILE"
    signed=$((signed + 1))
  done < <(find "$DIR" -type f -print0)
done
echo "[sign-staged-resources] $signed binaire(s) signé(s) avec $IDENTITY"
