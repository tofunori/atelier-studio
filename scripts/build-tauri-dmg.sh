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
npm run tauri -- build --bundles dmg "$@"
