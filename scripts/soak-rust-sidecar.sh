#!/bin/bash
# Porte 11 — N cycles start/health/kill du sidecar Rust (sans UI Tauri).
#
# Mode officiel S2 (défaut) :
#   - exige rust/target/release/atelier-studio-server
#   - 20 rounds par défaut
#   - ligne finale « COUNTS_FOR_S2=yes »
#
# Mode smoke non-S2 (dev uniquement) :
#   SOAK_ALLOW_DEBUG=1  # accepte debug/staged ; COUNTS_FOR_S2=no
#
# Isolation : ne tue JAMAIS un atelier-studio-server global — uniquement le PID
# lancé dans ce script (et le pid file du APP_DIR de ce run, s'il pointe encore
# sur ce PID).
#
# Usage:
#   npm run soak:sidecar
#   SOAK_ROUNDS=5 bash scripts/soak-rust-sidecar.sh
#   SOAK_ALLOW_DEBUG=1 SOAK_ROUNDS=3 bash scripts/soak-rust-sidecar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ROUNDS="${SOAK_ROUNDS:-20}"
ALLOW_DEBUG="${SOAK_ALLOW_DEBUG:-0}"
APP_DIR="${ATELIER_SOAK_APP_DIR:-/tmp/atelier-soak-$$}"
TOKEN="soak-$(openssl rand -hex 8 2>/dev/null || echo soaktoken)"
RELEASE_BIN="rust/target/release/atelier-studio-server"
DEBUG_BIN="rust/target/debug/atelier-studio-server"
STAGED_BIN="src-tauri/rust-server-dist/atelier-studio-server"

BIN=""
PROFILE=""
COUNTS_FOR_S2=no

if [[ -x "$RELEASE_BIN" ]]; then
  BIN="$RELEASE_BIN"
  PROFILE=release
  COUNTS_FOR_S2=yes
elif [[ "$ALLOW_DEBUG" == "1" ]]; then
  if [[ -x "$DEBUG_BIN" ]]; then
    BIN="$DEBUG_BIN"
    PROFILE=debug
  elif [[ -x "$STAGED_BIN" ]]; then
    BIN="$STAGED_BIN"
    PROFILE=staged
  fi
  COUNTS_FOR_S2=no
else
  echo "ERROR: binaire release introuvable: $RELEASE_BIN" >&2
  echo "  S2 exige 20 relances **release**. Construire :" >&2
  echo "    cargo build -p atelier-server --release --manifest-path rust/Cargo.toml" >&2
  echo "  Smoke non-S2 uniquement (ne compte pas pour S2) :" >&2
  echo "    SOAK_ALLOW_DEBUG=1 SOAK_ROUNDS=5 npm run soak:sidecar" >&2
  exit 1
fi

if [[ -z "$BIN" ]]; then
  echo "ERROR: aucun binaire exécutable (release/debug/staged)." >&2
  exit 1
fi

# Staged/debug ne comptent jamais pour S2 même si quelqu'un force un chemin.
if [[ "$PROFILE" != "release" ]]; then
  COUNTS_FOR_S2=no
fi

HASH=$(shasum -a 256 "$BIN" | awk '{print $1}')
echo "[soak] bin=$BIN profile=$PROFILE rounds=$ROUNDS app_dir=$APP_DIR COUNTS_FOR_S2=$COUNTS_FOR_S2"
if [[ "$COUNTS_FOR_S2" != "yes" ]]; then
  echo "[soak] NOTE: ce run ne valide PAS le critère S2 (release ×20)."
fi

# PID du process lancé pour le round courant (shell background job).
CURRENT_SPID=""

kill_pid_soft_then_hard() {
  local pid="${1:-}"
  [[ -z "$pid" || "$pid" == "0" ]] && return 0
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  kill -TERM "$pid" 2>/dev/null || true
  local i
  for i in $(seq 1 30); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done
  kill -9 "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

# Tue uniquement le PID de ce soak (jamais pkill -f atelier-studio-server).
cleanup_round() {
  local pid="${CURRENT_SPID:-}"
  if [[ -n "$pid" ]]; then
    kill_pid_soft_then_hard "$pid"
    CURRENT_SPID=""
  fi
  # Si le serveur a réécrit sidecar.pid avec le même pid, le nettoyer ; s'il
  # pointe vers un autre process vivant, on ne le touche PAS (pas notre job).
  if [[ -f "$APP_DIR/sidecar.pid" ]]; then
    local p
    p=$(tr -d '[:space:]' <"$APP_DIR/sidecar.pid" 2>/dev/null || true)
    if [[ -n "$p" && "$p" == "$pid" ]]; then
      kill_pid_soft_then_hard "$p"
    fi
  fi
}

cleanup_exit() {
  cleanup_round
  rm -rf "$APP_DIR"
}
trap cleanup_exit EXIT

ok=0
for i in $(seq 1 "$ROUNDS"); do
  cleanup_round
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  PORT=""

  ATELIER_TOKEN="$TOKEN" \
  ATELIER_APP_DIR="$APP_DIR" \
  ATELIER_APP_VERSION="soak" \
  ATELIER_BUNDLE_HASH="$HASH" \
  ATELIER_SKIP_SINGLE_INSTANCE=1 \
  ATELIER_WRITE_LOCK=1 \
    "$BIN" >"$APP_DIR/stdout.txt" 2>"$APP_DIR/stderr.txt" &
  CURRENT_SPID=$!
  SPID=$CURRENT_SPID

  ready=0
  for _ in $(seq 1 50); do
    if [[ -f "$APP_DIR/sidecar.lock" ]]; then
      PORT=$(python3 -c "import json;print(json.load(open('$APP_DIR/sidecar.lock'))['port'])" 2>/dev/null || true)
      if [[ -n "${PORT:-}" ]]; then
        if curl -sf -m 2 -H "x-atelier-token: $TOKEN" "http://127.0.0.1:${PORT}/health" \
          | grep -q '"ok":true'; then
          ready=1
          break
        fi
      fi
    fi
    if ! kill -0 "$SPID" 2>/dev/null; then
      echo "[soak] FAIL round $i — process mort (pid=$SPID)"
      echo "--- stdout ---"; cat "$APP_DIR/stdout.txt" 2>/dev/null || true
      echo "--- stderr ---"; cat "$APP_DIR/stderr.txt" 2>/dev/null || true
      exit 1
    fi
    sleep 0.15
  done

  if [[ "$ready" != 1 ]]; then
    echo "[soak] FAIL round $i — health timeout (pid=$SPID)"
    cleanup_round
    cat "$APP_DIR/stdout.txt" 2>/dev/null || true
    cat "$APP_DIR/stderr.txt" 2>/dev/null || true
    exit 1
  fi

  # Arrêt du seul process de ce round
  kill_pid_soft_then_hard "$SPID"
  CURRENT_SPID=""
  wait "$SPID" 2>/dev/null || true

  # Orphelin = encore quelque chose sur NOTRE port de ce round
  if [[ -n "${PORT:-}" ]]; then
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -q .; then
      # dernier recours : tuer uniquement le listener sur ce port s'il est
      # encore notre SPID (sinon échec sans massacre global)
      listeners=$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)
      for lp in $listeners; do
        if [[ "$lp" == "$SPID" ]]; then
          kill -9 "$lp" 2>/dev/null || true
        fi
      done
      if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -q .; then
        echo "[soak] FAIL round $i — port $PORT encore en écoute (orphelin, pid≠$SPID)"
        exit 1
      fi
    fi
  fi

  ok=$((ok + 1))
  echo "[soak] ok $ok/$ROUNDS port=$PORT pid=$SPID"
done

if [[ "$COUNTS_FOR_S2" == "yes" && "$ok" -ge 20 ]]; then
  echo "[soak] PASS $ok/$ROUNDS rounds profile=release COUNTS_FOR_S2=yes — aucun orphelin"
elif [[ "$COUNTS_FOR_S2" == "yes" ]]; then
  echo "[soak] PASS $ok/$ROUNDS rounds profile=release COUNTS_FOR_S2=partial (ROUNDS<20 — pas S2 complet)"
else
  echo "[soak] PASS $ok/$ROUNDS rounds profile=$PROFILE COUNTS_FOR_S2=no — smoke seulement"
fi
