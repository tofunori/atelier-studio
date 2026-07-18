#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
LOCK_ID="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | awk '{print $1}')"
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
npm run tauri -- build --bundles app "$@"
