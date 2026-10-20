#!/usr/bin/env bash
# Archive AtelierNative et l'envoie sur App Store Connect pour TestFlight.
#
#   mobile-native/scripts/upload-testflight.sh
#
# Prérequis : compte Apple Developer Program connecté dans Xcode (Settings >
# Accounts), XcodeGen, Config/Local.xcconfig rempli (même identifiant et même
# équipe que l'app installée, voir Local.xcconfig.example), et une fiche
# d'app créée dans App Store Connect pour cet identifiant.
#
# Xcode crée lui-même le certificat « Apple Distribution » et le profil App
# Store au premier envoi (-allowProvisioningUpdates). Le build installé depuis
# TestFlight remplace l'app en gardant ses données : même identifiant, même
# équipe.
#
# Variables facultatives :
#   ATELIER_TESTFLIGHT_BUILD  numéro de build (défaut : AAAAMMJJ.HHMM, UTC) ;
#                             il doit croître d'un envoi à l'autre.
#
# Codes de sortie : 1 configuration, 3 archive, 5 envoi.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
native_dir="$(cd "$script_dir/.." && pwd)"
project="$native_dir/AtelierNative.xcodeproj"
build_number="${ATELIER_TESTFLIGHT_BUILD:-$(date -u '+%Y%m%d.%H%M')}"

for dir in /usr/local/bin /opt/homebrew/bin; do
  if [[ -d "$dir" && ":$PATH:" != *":$dir:"* ]]; then
    PATH="$dir:$PATH"
  fi
done
export PATH

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() {
  local code="$1"
  shift
  printf '[%s] ERREUR : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  exit "$code"
}

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

log "Génération du projet Xcode"
xcodegen generate --spec "$native_dir/project.yml" --quiet \
  || fail 1 "xcodegen generate a échoué (mobile-native/project.yml)."
xcodebuild -project "$project" -scheme AtelierNative -configuration Release \
  -sdk iphoneos -showBuildSettings -json >"$work/settings.json" 2>/dev/null \
  || fail 1 "lecture des réglages Xcode impossible (xcodebuild -showBuildSettings)."
settings="$(python3 - "$work/settings.json" <<'PY'
import json
import sys

with open(sys.argv[1]) as handle:
    entries = json.load(handle)
values = next(e["buildSettings"] for e in entries if e.get("target") == "AtelierNative")
print("\t".join(values.get(key, "") for key in ("PRODUCT_BUNDLE_IDENTIFIER", "DEVELOPMENT_TEAM")))
PY
)" || fail 1 "réglages de la cible AtelierNative introuvables."
IFS=$'\t' read -r bundle_id team <<<"$settings"
[[ -n "$team" && "$bundle_id" != *.preview ]] \
  || fail 1 "Config/Local.xcconfig incomplet : PRODUCT_BUNDLE_IDENTIFIER et DEVELOPMENT_TEAM de l'app installée (voir Local.xcconfig.example)."
log "App : $bundle_id, équipe $team, build $build_number"

archive="$work/AtelierNative.xcarchive"
log "Archive (Release, iOS)"
xcodebuild -project "$project" -scheme AtelierNative -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$archive" \
  -allowProvisioningUpdates -quiet \
  CURRENT_PROJECT_VERSION="$build_number" archive \
  || fail 3 "l'archive a échoué. Le compte Apple doit être connecté dans Xcode > Settings > Accounts."

cat >"$work/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>teamID</key>
  <string>$team</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
PLIST

log "Envoi sur App Store Connect"
xcodebuild -exportArchive -archivePath "$archive" \
  -exportOptionsPlist "$work/ExportOptions.plist" -exportPath "$work/export" \
  -allowProvisioningUpdates \
  || fail 5 "l'envoi a échoué. La fiche de l'app existe-t-elle dans App Store Connect pour $bundle_id ?"

log "Envoyé : build $build_number. Il apparaît dans TestFlight après le traitement d'Apple."
