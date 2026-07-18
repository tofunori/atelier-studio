#!/usr/bin/env bash
set -euo pipefail

# Cargo passes the real rustc path as the first argument. Keep builds portable:
# use the shared cache when available, otherwise invoke rustc directly.
if command -v sccache >/dev/null 2>&1; then
  exec sccache "$@"
fi

exec "$@"
