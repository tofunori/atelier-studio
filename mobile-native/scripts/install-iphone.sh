#!/usr/bin/env bash
# Construit AtelierNative pour l'iPhone et l'installe PAR-DESSUS l'app existante.
#
#   mobile-native/scripts/install-iphone.sh
#
# Prérequis : Mac avec Xcode 26 connecté au compte Apple (Xcode > Settings >
# Accounts), XcodeGen (brew install xcodegen), Config/Local.xcconfig rempli
# (voir Config/Local.xcconfig.example), iPhone jumelé avec ce Mac.
#
# Ne désinstalle JAMAIS l'app : ses données (annotations, brouillons,
# association au Mac) vivent dans son conteneur et disparaîtraient avec elle.
# devicectl remplace le binaire et garde le conteneur, comme une mise à jour.
#
# Variables facultatives :
#   ATELIER_IPHONE_DEVICE         nom, UDID ou identifiant devicectl de l'iPhone
#   ATELIER_IPHONE_CONFIGURATION  Debug (défaut) ou Release
#   ATELIER_IPHONE_DERIVED_DATA   dossier de compilation (défaut : DerivedData)
#   ATELIER_IPHONE_FIRST_INSTALL  1 pour accepter une première installation
#                                 (aucune app de cet identifiant sur l'iPhone)
#
# Codes de sortie : 1 configuration, 2 aucun iPhone joignable, 3 compilation,
# 4 identifiant absent de l'iPhone, 5 installation, 6 installé mais profil
# expirant dans moins de 48 h.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
native_dir="$(cd "$script_dir/.." && pwd)"
project="$native_dir/AtelierNative.xcodeproj"
local_config="$native_dir/Config/Local.xcconfig"
configuration="${ATELIER_IPHONE_CONFIGURATION:-Debug}"
derived_data="${ATELIER_IPHONE_DERIVED_DATA:-$HOME/Library/Developer/Xcode/DerivedData/AtelierNative-iphone}"
app="$derived_data/Build/Products/$configuration-iphoneos/AtelierNative.app"

# launchd fournit un PATH minimal : ajouter Homebrew (xcodegen).
for dir in /usr/local/bin /opt/homebrew/bin; do
  if [[ -d "$dir" && ":$PATH:" != *":$dir:"* ]]; then
    PATH="$dir:$PATH"
  fi
done
export PATH

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# Sans terminal (LaunchAgent), une notification macOS signale l'échec.
notify() {
  if [[ ! -t 1 ]] && command -v osascript >/dev/null 2>&1; then
    osascript -e 'on run argv' \
      -e 'display notification (item 1 of argv) with title "Atelier iPhone"' \
      -e 'end run' "$1" >/dev/null 2>&1 || true
  fi
}

fail() {
  local code="$1"
  shift
  printf '[%s] ERREUR : %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  notify "$*"
  exit "$code"
}

[[ "$(uname -s)" == Darwin ]] || fail 1 "ce script tourne sur le Mac (Xcode requis)."
command -v xcodebuild >/dev/null 2>&1 \
  || fail 1 "xcodebuild introuvable : installer Xcode 26 puis sudo xcode-select -s /Applications/Xcode.app."
command -v xcodegen >/dev/null 2>&1 || fail 1 "XcodeGen introuvable : brew install xcodegen."
[[ -f "$local_config" ]] \
  || fail 1 "Config/Local.xcconfig manquant : copier Config/Local.xcconfig.example vers Config/Local.xcconfig et y mettre l'identifiant de l'app installée et l'équipe Apple."

work="$(mktemp -d "${TMPDIR:-/tmp}/atelier-iphone.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# 1. iPhone joignable, avant de compiler (échec rapide quand il est absent).
log "Recherche d'un iPhone joignable"
xcrun devicectl list devices --json-output "$work/devices.json" >/dev/null 2>&1 \
  || fail 2 "xcrun devicectl list devices a échoué : Xcode 15 ou plus récent est requis."
if ! device="$(python3 - "$work/devices.json" "${ATELIER_IPHONE_DEVICE:-}" <<'PY'
import json
import sys

path, wanted = sys.argv[1], sys.argv[2]
with open(path) as handle:
    devices = json.load(handle).get("result", {}).get("devices", [])
candidates = []
for device in devices:
    hardware = device.get("hardwareProperties", {})
    connection = device.get("connectionProperties", {})
    name = device.get("deviceProperties", {}).get("name", "iPhone")
    if hardware.get("platform") != "iOS" or hardware.get("deviceType") != "iPhone":
        continue
    if hardware.get("reality", "physical") != "physical":
        continue
    if connection.get("pairingState") != "paired" or connection.get("tunnelState") == "unavailable":
        continue
    if wanted and wanted not in (device.get("identifier"), hardware.get("udid"), name):
        continue
    # Préférer un lien déjà ouvert, puis le câble au Wi-Fi.
    rank = (connection.get("tunnelState") != "connected", connection.get("transportType") != "wired")
    if device.get("identifier"):
        candidates.append((rank, device["identifier"], name))
if not candidates:
    sys.exit(1)
candidates.sort()
print(f"{candidates[0][1]}\t{candidates[0][2]}")
PY
)"; then
  fail 2 "aucun iPhone joignable. Brancher l'iPhone en USB et le déverrouiller ; pour le Wi-Fi, il doit avoir été jumelé une fois pour le débogage réseau (Xcode > Window > Devices and Simulators > Connect via network) et être sur le même réseau que le Mac. Vérifier avec : xcrun devicectl list devices"
fi
IFS=$'\t' read -r device_id device_name <<<"$device"
log "iPhone : $device_name ($device_id)"

# 2. Projet Xcode et réglages de signature effectifs (Signing + Local.xcconfig).
log "Génération du projet Xcode"
xcodegen generate --spec "$native_dir/project.yml" --quiet \
  || fail 1 "xcodegen generate a échoué (mobile-native/project.yml)."
xcodebuild -project "$project" -scheme AtelierNative -configuration "$configuration" \
  -sdk iphoneos -showBuildSettings -json >"$work/settings.json" 2>/dev/null \
  || fail 1 "lecture des réglages Xcode impossible (xcodebuild -showBuildSettings)."
settings="$(python3 - "$work/settings.json" <<'PY'
import json
import sys

with open(sys.argv[1]) as handle:
    entries = json.load(handle)
values = next(e["buildSettings"] for e in entries if e.get("target") == "AtelierNative")
print("\t".join(values.get(key, "") for key in ("PRODUCT_BUNDLE_IDENTIFIER", "DEVELOPMENT_TEAM", "CODE_SIGN_IDENTITY")))
PY
)" || fail 1 "réglages de la cible AtelierNative introuvables dans xcodebuild -showBuildSettings."
IFS=$'\t' read -r bundle_id team identity <<<"$settings"
[[ -n "$team" && "$identity" != "-" && -n "$identity" ]] \
  || fail 1 "Config/Local.xcconfig incomplet : DEVELOPMENT_TEAM et CODE_SIGN_IDENTITY doivent être définis pour l'iPhone (voir Local.xcconfig.example)."
log "App : $bundle_id, équipe $team, configuration $configuration"

# 3. L'app doit déjà être sur l'iPhone sous CET identifiant : sinon iOS
#    installerait une seconde app, vide, à côté de celle qui a les données.
if xcrun devicectl device info apps --device "$device_id" --json-output "$work/apps.json" >/dev/null 2>&1; then
  if ! python3 - "$work/apps.json" "$bundle_id" <<'PY'
import json
import sys

with open(sys.argv[1]) as handle:
    apps = json.load(handle).get("result", {}).get("apps", [])
sys.exit(0 if any(app.get("bundleIdentifier") == sys.argv[2] for app in apps) else 1)
PY
  then
    if [[ "${ATELIER_IPHONE_FIRST_INSTALL:-0}" != 1 ]]; then
      fail 4 "aucune app $bundle_id sur $device_name. Vérifier PRODUCT_BUNDLE_IDENTIFIER dans Config/Local.xcconfig (il doit être celui de l'app déjà installée). Pour une toute première installation : ATELIER_IPHONE_FIRST_INSTALL=1 $0"
    fi
    log "Première installation de $bundle_id (ATELIER_IPHONE_FIRST_INSTALL=1)"
  fi
else
  log "Avertissement : liste des apps de l'iPhone illisible, identifiant non vérifié."
fi

# 4. Compilation signée : -allowProvisioningUpdates laisse Xcode créer ou
#    renouveler le profil de développement (7 jours avec un compte gratuit).
log "Compilation signée ($configuration, iOS)"
xcodebuild -project "$project" -scheme AtelierNative -configuration "$configuration" \
  -destination 'generic/platform=iOS' -derivedDataPath "$derived_data" \
  -allowProvisioningUpdates -quiet build \
  || fail 3 "la compilation signée a échoué. Le compte Apple doit être connecté dans Xcode > Settings > Accounts, et l'équipe de Local.xcconfig doit être la sienne."
[[ -d "$app" ]] || fail 3 "app compilée introuvable : $app"

# 5. Installation en place : jamais de désinstallation préalable.
log "Installation sur $device_name (mise à jour en place, données conservées)"
xcrun devicectl device install app --device "$device_id" "$app" \
  || fail 5 "l'installation a échoué. iPhone déverrouillé et en mode développeur ? En Wi-Fi : même réseau que le Mac et jumelage réseau actif dans Xcode."

# 6. Échéance du profil embarqué, pour le journal du renouvellement.
security cms -D -i "$app/embedded.mobileprovision" >"$work/profile.plist" 2>/dev/null \
  || fail 6 "app installée, mais son profil embarqué est illisible : échéance inconnue."
profile="$(python3 - "$work/profile.plist" <<'PY'
import datetime
import plistlib
import sys

with open(sys.argv[1], "rb") as handle:
    expires = plistlib.load(handle)["ExpirationDate"].replace(tzinfo=datetime.timezone.utc)
left = (expires - datetime.datetime.now(datetime.timezone.utc)).total_seconds() / 3600
print(expires.astimezone().strftime("%Y-%m-%d %H:%M"), int(left))
PY
)" || fail 6 "app installée, mais l'échéance du profil est illisible."
read -r expiry_day expiry_time hours_left <<<"$profile"
expiry="$expiry_day $expiry_time"
log "Installé. Profil valide jusqu'au $expiry (${hours_left} h)."
if (( hours_left < 48 )); then
  fail 6 "app installée, mais son profil expire dans ${hours_left} h ($expiry) : Xcode ne l'a pas renouvelé. Relancer ce script après l'expiration."
fi
