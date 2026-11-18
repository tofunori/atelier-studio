#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
if command -v sha256sum >/dev/null 2>&1; then
  LOCK_ID="$(printf '%s' "$REPO_ROOT" | sha256sum | awk '{print $1}')"
else
  LOCK_ID="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | awk '{print $1}')"
fi
LOCK_DIR="${TMPDIR:-/tmp}/atelier-tauri-build-${LOCK_ID}.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  holder_pid="$(cat "$LOCK_PID_FILE" 2>/dev/null || true)"
  if [[ "$holder_pid" =~ ^[0-9]+$ ]] && kill -0 "$holder_pid" 2>/dev/null; then
    echo "Refus : un build Tauri est déjà actif pour ce worktree (pid $holder_pid)." >&2
    echo "Worktree : $REPO_ROOT" >&2
    exit 3
  fi

  if [[ -z "$holder_pid" ]]; then
    echo "Refus : le verrou de build est en cours d'initialisation : $LOCK_DIR" >&2
    exit 3
  fi

  rm -f "$LOCK_PID_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || {
    echo "Refus : verrou de build périmé mais non vide : $LOCK_DIR" >&2
    exit 4
  }
  mkdir "$LOCK_DIR"
fi

cleanup_lock() {
  rm -f "$LOCK_PID_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup_lock EXIT INT TERM
printf '%s\n' "$$" > "$LOCK_PID_FILE"

echo "Build Tauri verrouillé pour : $REPO_ROOT"
cd "$REPO_ROOT"
# macOS 27 (constaté le 2026-10-08 avec ld-27037 de macOS 27.0.1) : les
# proc-macros strippées et compilées pour la cible 12.3 sont refusées au
# chargement (« mis-aligned LINKEDIT string pool ») et le build s'arrête.
# Ne pas stripper les build-scripts ni les proc-macros contourne le problème
# sans toucher aux exécutables livrés ; une valeur déjà exportée l'emporte.
export CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP="${CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP:-none}"
if [[ "$(uname -s)" == "Darwin" ]]; then
  source "$REPO_ROOT/scripts/tauri-signing-args.sh"
  # ${arr[@]+…} : bash 3.2 de macOS refuse un tableau vide sous `set -u`.
  npm run tauri -- build --bundles app ${SIGNING_ARGS[@]+"${SIGNING_ARGS[@]}"} "$@"
else
  # Sur Linux, fenêtre sans barre GTK grise (decorations: false, contrôles dans TopBar)
  # paquets .deb (Debian, Ubuntu) et AppImage (toute distribution).
  LINUX_CONFIG='{"app":{"windows":[{"title":"Atelier","width":1280,"height":820,"minWidth":720,"minHeight":480,"maximized":true,"decorations":false,"dragDropEnabled":false}]},"bundle":{"linux":{"deb":{"depends":["curl","git","xdg-utils"]}}}}'
  npm run tauri -- build --bundles deb,appimage --config "$LINUX_CONFIG" "$@"
fi
