#!/bin/bash
# Porte 11 — N cycles start/health/kill du sidecar Rust (sans UI Tauri).
# Preuve S2 partielle : « N relances sans orphelin ».
# Usage: npm run soak:sidecar   # ou  SOAK_ROUNDS=5 bash scripts/soak-rust-sidecar.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ROUNDS="${SOAK_ROUNDS:-20}"
APP_DIR="${ATELIER_SOAK_APP_DIR:-/tmp/atelier-soak-$$}"
TOKEN="soak-$(openssl rand -hex 8 2>/dev/null || echo soaktoken)"
BIN=""
for c in \
  rust/target/release/atelier-studio-server \
  rust/target/debug/atelier-studio-server \
  src-tauri/rust-server-dist/atelier-studio-server
do
  if [[ -x "$c" ]]; then BIN="$c"; break; fi
done
if [[ -z "$BIN" ]]; then
  echo "ERROR: atelier-studio-server introuvable. cargo build -p atelier-server --manifest-path rust/Cargo.toml"
  exit 1
fi

HASH=$(shasum -a 256 "$BIN" | awk '{print $1}')
echo "[soak] bin=$BIN rounds=$ROUNDS app_dir=$APP_DIR"

cleanup_all() {
  pkill -9 -f "ATELIER_SOAK_MARKER=$APP_DIR" 2>/dev/null || true
  # children may not inherit marker in argv — kill by app dir env is hard; use pid file
  if [[ -f "$APP_DIR/sidecar.pid" ]]; then
    local p
    p=$(cat "$APP_DIR/sidecar.pid" 2>/dev/null || true)
    if [[ -n "${p:-}" ]]; then kill -9 "$p" 2>/dev/null || true; fi
  fi
  pkill -9 -f "atelier-studio-server" 2>/dev/null || true
  sleep 0.3
}
trap 'cleanup_all; rm -rf "$APP_DIR"' EXIT

ok=0
for i in $(seq 1 "$ROUNDS"); do
  cleanup_all
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"

  ATELIER_TOKEN="$TOKEN" \
  ATELIER_APP_DIR="$APP_DIR" \
  ATELIER_APP_VERSION="soak" \
  ATELIER_BUNDLE_HASH="$HASH" \
  ATELIER_SKIP_SINGLE_INSTANCE=1 \
  ATELIER_WRITE_LOCK=1 \
  ATELIER_SOAK_MARKER="$APP_DIR" \
    "$BIN" >"$APP_DIR/stdout.txt" 2>"$APP_DIR/stderr.txt" &
  SPID=$!

  # wait for health line / lock
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
      echo "[soak] FAIL round $i — process mort"
      echo "--- stdout ---"; cat "$APP_DIR/stdout.txt" 2>/dev/null || true
      echo "--- stderr ---"; cat "$APP_DIR/stderr.txt" 2>/dev/null || true
      exit 1
    fi
    sleep 0.15
  done

  if [[ "$ready" != 1 ]]; then
    echo "[soak] FAIL round $i — health timeout"
    kill -9 "$SPID" 2>/dev/null || true
    cat "$APP_DIR/stdout.txt" 2>/dev/null || true
    cat "$APP_DIR/stderr.txt" 2>/dev/null || true
    exit 1
  fi

  # graceful then force
  kill -TERM "$SPID" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$SPID" 2>/dev/null || break
    sleep 0.1
  done
  kill -9 "$SPID" 2>/dev/null || true
  wait "$SPID" 2>/dev/null || true

  # no orphan with our lock port still listening
  if [[ -n "${PORT:-}" ]]; then
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | grep -q .; then
      echo "[soak] FAIL round $i — port $PORT encore en écoute (orphelin)"
      exit 1
    fi
  fi

  ok=$((ok + 1))
  echo "[soak] ok $ok/$ROUNDS port=$PORT"
done

echo "[soak] PASS $ok/$ROUNDS rounds — aucun orphelin détecté"
