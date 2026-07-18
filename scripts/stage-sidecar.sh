#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
DIST=src-tauri/sidecar-dist
rm -rf "$DIST"
mkdir -p "$DIST"
cp sidecar/*.mjs sidecar/package.json "$DIST/"
cp sidecar/atelier-gallery-tool sidecar/atelier-zotero-passages sidecar/atelier-kb "$DIST/"
chmod +x "$DIST/atelier-gallery-tool" "$DIST/atelier-zotero-passages" "$DIST/atelier-kb"
[ -f sidecar/package-lock.json ] && cp sidecar/package-lock.json "$DIST/"
cp -R sidecar/providers "$DIST/providers"
(cd "$DIST" && npm install --omit=dev --no-audit --no-fund --silent)
rm -rf "$DIST/node_modules/.bin"
# CLIs embarqués des SDKs retirés : les providers utilisent les CLIs système
# (claude / codex requis de toute façon pour l'auth) — économise ~460 Mo.
rm -rf "$DIST/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64"
rm -rf "$DIST"/node_modules/@openai/codex-darwin-* "$DIST"/node_modules/@openai/codex-linux-* "$DIST"/node_modules/@openai/codex-win32-*
# node-pty : garder seulement le prebuild darwin-arm64
find "$DIST/node_modules/node-pty/prebuilds" -mindepth 1 -maxdepth 1 -type d ! -name "darwin-arm64" -exec rm -rf {} +
find "$DIST/node_modules" -type l -delete
chmod +x "$DIST"/node_modules/node-pty/prebuilds/*/spawn-helper 2>/dev/null || true
du -sh "$DIST"
