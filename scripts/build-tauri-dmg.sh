#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
COMMON_DIR="$(git -C "$REPO_ROOT" rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(cd "$COMMON_DIR/.." && pwd -P)"
CURRENT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
BUNDLE_DIR="$REPO_ROOT/src-tauri/target/release/bundle/macos"

if [[ "$REPO_ROOT" != "$MAIN_ROOT" || "$CURRENT_BRANCH" != "main" ]]; then
  echo "Refus : le DMG doit être construit depuis le checkout principal sur main." >&2
  echo "Worktree courant : $REPO_ROOT" >&2
  echo "Branche courante : ${CURRENT_BRANCH:-detached}" >&2
  exit 2
fi

cleanup_temporary_dmgs() {
  [[ -d "$BUNDLE_DIR" ]] || return 0
  # Tauri/create-dmg may leave large writable images behind after a failed DMG
  # build. Only its exact temporary-file pattern is eligible for deletion.
  find "$BUNDLE_DIR" -maxdepth 1 -type f -name 'rw.*.dmg' -print -delete
}

# Clear leftovers from an earlier failed release and always clean this attempt,
# whether the release build succeeds or fails.
cleanup_temporary_dmgs
trap cleanup_temporary_dmgs EXIT

cd "$REPO_ROOT"
# macOS 27 (constaté le 2026-10-08 avec ld-27037 de macOS 27.0.1) : les
# proc-macros strippées et compilées pour la cible 12.3 sont refusées au
# chargement (« mis-aligned LINKEDIT string pool ») et le build s'arrête.
# Ne pas stripper les build-scripts ni les proc-macros contourne le problème
# sans toucher aux exécutables livrés ; une valeur déjà exportée l'emporte.
export CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP="${CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP:-none}"
# Un Developer ID du trousseau passe avant « Atelier Dev Signing » : c'est le
# seul certificat qu'Apple notarise (voir tauri-signing-args.sh).
export ATELIER_PREFER_DEVELOPER_ID=1
source "$REPO_ROOT/scripts/tauri-signing-args.sh"
# ${arr[@]+…} : bash 3.2 de macOS refuse un tableau vide sous `set -u`.
npm run tauri -- build --bundles dmg ${SIGNING_ARGS[@]+"${SIGNING_ARGS[@]}"} "$@"

# Signé Developer ID : notariser le DMG (Apple vérifie aussi l'app qu'il
# contient) puis agrafer le ticket au DMG et au bundle resté dans target/.
if [[ -n "${ATELIER_RESOURCE_SIGNING_IDENTITY:-}" ]]; then
  DMG="$(ls -t "$REPO_ROOT"/src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null | head -n 1)"
  [[ -n "$DMG" ]] || { echo "DMG introuvable après le build." >&2; exit 1; }
  bash "$REPO_ROOT/scripts/notarize-macos.sh" "$DMG"
  xcrun stapler staple "$BUNDLE_DIR/Atelier.app" \
    || echo "Avertissement : ticket non agrafé à $BUNDLE_DIR/Atelier.app (le DMG, lui, l'est)." >&2
fi
