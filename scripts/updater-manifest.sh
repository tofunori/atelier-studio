#!/usr/bin/env bash
# Assemble le manifeste `latest.json` lu par la mise à jour intégrée
# (src-tauri/src/updater.rs, tauri-plugin-updater). Appelé par le job
# `updater-manifest` de release.yml une fois les paquets Mac et Linux publiés.
#
#   scripts/updater-manifest.sh <tag> <dossier des .sig> <dépôt owner/nom>
#
# Chaque `<paquet>.sig` du dossier donne une entrée ; le paquet doit porter le
# même nom dans la release. Clés lues par le plugin, dans cet ordre :
# `{os}-{arch}-{installeur}` puis `{os}-{arch}`.
set -euo pipefail

TAG="${1:?tag manquant}"
SIG_DIR="${2:?dossier des signatures manquant}"
REPO="${3:?dépôt manquant}"
VERSION="${TAG#v}"
BASE="https://github.com/$REPO/releases/download/$TAG"

platforms='{}'
add() { # clé, paquet, fichier .sig
  platforms="$(jq --arg k "$1" --arg url "$BASE/$2" --rawfile sig "$3" \
    '. + {($k): {url: $url, signature: ($sig | rtrimstr("\n"))}}' <<<"$platforms")"
}

shopt -s nullglob
for sig in "$SIG_DIR"/*.sig; do
  asset="$(basename "$sig" .sig)"
  case "$asset" in
    *aarch64*.app.tar.gz)  add darwin-aarch64-app "$asset" "$sig"; add darwin-aarch64 "$asset" "$sig" ;;
    *x86_64*.app.tar.gz|*x64*.app.tar.gz) add darwin-x86_64-app "$asset" "$sig"; add darwin-x86_64 "$asset" "$sig" ;;
    *_amd64.AppImage)      add linux-x86_64-appimage "$asset" "$sig"; add linux-x86_64 "$asset" "$sig" ;;
    *_aarch64.AppImage)    add linux-aarch64-appimage "$asset" "$sig"; add linux-aarch64 "$asset" "$sig" ;;
    *_amd64.deb)           add linux-x86_64-deb "$asset" "$sig" ;;
    *_arm64.deb)           add linux-aarch64-deb "$asset" "$sig" ;;
    *) echo "updater-manifest : signature ignorée ($asset)" >&2 ;;
  esac
done

if [[ "$platforms" == '{}' ]]; then
  echo "updater-manifest : aucune signature dans $SIG_DIR" >&2
  exit 1
fi

jq -n --arg v "$VERSION" --arg tag "$TAG" --arg repo "$REPO" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson p "$platforms" \
  '{version: $v,
    notes: ("https://github.com/" + $repo + "/releases/tag/" + $tag),
    pub_date: $date,
    platforms: $p}'
