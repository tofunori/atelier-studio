#!/usr/bin/env bash
# atelier installer — links the CLI onto your PATH and sanity-checks the setup.
# Usage:  bash install.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="${HOME}/.local/bin"
LINK="${BIN}/atelier"
LEGACY_LINK="${BIN}/cmux-gallery"   # compat alias

echo "atelier: installing from ${REPO}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "  ✗ python3 not found — install Python 3 first (build needs only the stdlib)." >&2
  exit 1
fi
echo "  ✓ $(python3 --version 2>&1)"

mkdir -p "${BIN}"
chmod +x "${REPO}/cmux_gallery.py"
ln -sf "${REPO}/cmux_gallery.py" "${LINK}"
ln -sf "${REPO}/cmux_gallery.py" "${LEGACY_LINK}"
echo "  ✓ linked ${LINK}"

# Is ~/.local/bin on PATH?
case ":${PATH}:" in
  *":${BIN}:"*) echo "  ✓ ${BIN} is on your PATH" ;;
  *)
    case "${SHELL##*/}" in
      zsh)  rc="${HOME}/.zshrc" ;;
      bash) rc="${HOME}/.bashrc" ;;
      *)    rc="your shell rc file" ;;
    esac
    echo "  ⚠ ${BIN} is NOT on your PATH. Add it with:"
    echo "      echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ${rc}"
    echo "      exec \"\$SHELL\""
    ;;
esac

# cmux CLI is needed for `run`/`serve`/open (not for `build`)
if command -v cmux >/dev/null 2>&1; then
  echo "  ✓ cmux CLI found"
else
  echo "  ⚠ cmux CLI not found — 'build' works; 'run'/'serve'/open need cmux (https://cmux.com)"
fi

cat <<'EOF'

Done. Try it in any project directory:
  atelier run             # build + serve + open in cmux (keep the pane open)
  atelier build           # just write the HTML (no server)

To keep the server alive automatically (recommended), copy dock.example.json
into the project's .cmux/dock.json — see the README "Keeping it running" section.
EOF
