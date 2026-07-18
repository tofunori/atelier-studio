#!/usr/bin/env bash
set -euo pipefail

if ! command -v sccache >/dev/null 2>&1; then
  echo "sccache n'est pas installé. Sur ce Mac : brew install sccache" >&2
  exit 1
fi

sccache --show-stats
