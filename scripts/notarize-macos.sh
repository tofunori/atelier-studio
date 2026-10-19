#!/usr/bin/env bash
# Notarise puis agrafe un .dmg ou un .app signé Developer ID.
#
#   bash scripts/notarize-macos.sh <chemin.dmg|chemin.app>
#
# Les identifiants Apple ne passent ni par le dépôt ni par l'environnement :
# notarytool les lit dans le trousseau, sous le profil ATELIER_NOTARY_PROFILE
# (« atelier-notary » par défaut), créé une fois par Thierry, voir
# docs/PROTOCOLE_RELANCE.md, « Signature Developer ID et notarisation ».
#
# Codes de sortie : 0 notarisé et agrafé, 2 usage, 3 profil absent,
# 4 refusé par Apple (journal affiché), 5 agrafage impossible.
set -euo pipefail

TARGET="${1:-}"
PROFILE="${ATELIER_NOTARY_PROFILE:-atelier-notary}"
if [[ -z "$TARGET" || ! -e "$TARGET" ]]; then
  echo "Usage : $0 <chemin.dmg|chemin.app>" >&2
  exit 2
fi

if ! xcrun notarytool history --keychain-profile "$PROFILE" >/dev/null 2>&1; then
  echo "Notarisation impossible : profil « $PROFILE » absent du trousseau." >&2
  echo "Le créer une fois : xcrun notarytool store-credentials $PROFILE --apple-id <identifiant Apple> --team-id <équipe>" >&2
  exit 3
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

SUBMIT="$TARGET"
if [[ -d "$TARGET" ]]; then
  # Un .app s'envoie zippé ; c'est le .app lui-même qu'on agrafe ensuite.
  SUBMIT="$WORK/$(basename "$TARGET").zip"
  ditto -c -k --keepParent "$TARGET" "$SUBMIT"
fi

echo "Notarisation de $(basename "$TARGET") (profil $PROFILE)…"
xcrun notarytool submit "$SUBMIT" --keychain-profile "$PROFILE" --wait \
  --output-format json >"$WORK/result.json"
read -r status submission_id < <(python3 - "$WORK/result.json" <<'PY'
import json
import sys

with open(sys.argv[1]) as handle:
    result = json.load(handle)
print(result.get("status", "?"), result.get("id", "?"))
PY
)
if [[ "$status" != "Accepted" ]]; then
  echo "Notarisation refusée ($status, soumission $submission_id). Journal d'Apple :" >&2
  xcrun notarytool log "$submission_id" --keychain-profile "$PROFILE" >&2 || true
  exit 4
fi

xcrun stapler staple "$TARGET" || {
  echo "Notarisé (soumission $submission_id), mais l'agrafage du ticket a échoué." >&2
  exit 5
}
xcrun stapler validate "$TARGET"
echo "Notarisé et agrafé : $TARGET"
