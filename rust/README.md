# Atelier Studio — backend Rust (plan 033)

Migration à **parité fonctionnelle** du sidecar Node + serveur galerie Node vers un binaire Rust unique (à terme).

## État

| Livraison | Contenu | Backend production |
|-----------|---------|-------------------|
| **R1** | Sidecar HTTP/WS minimal | **Node** (défaut) |
| **R2** | Galerie Rust vendored (`atelier-gallery-server`) | **Node** galerie (défaut) |
| **R3** | `atelier-store` + WS threads/history/highlights | Node chat (défaut) |
| **R4** | `atelier-workspace` Git/term/Zotero/scan | Node chat (défaut) |
| **R5** | Harness + FakeProvider + `send`/`interrupt` | Node défaut |
| **R6** | Claude CLI stream-json | Node défaut |
| **R7** | Codex `app-server` JSON-RPC | Node défaut |
| **R8** | Grok legacy CLI, OpenCode, API OpenAI-compat, images Seedream | Node défaut |
| **R9** | Routeur WS exhaustif + corpus/compare lecture seule | (transition) |
| **R10** (actuel) | **Rust défaut** dans Tauri + binaire bundlé | Rust défaut ; `ATELIER_BACKEND=node` soak |
| R11 | Soak puis retrait Node de la distro | voir `plans/033-*.md` |

### Providers réels (R6–R8)

```bash
export ATELIER_BACKEND=rust
which claude   # ATELIER_CLAUDE_BIN=…
which codex    # ATELIER_CODEX_BIN=…
which grok     # ATELIER_GROK_BIN=…
which opencode # ATELIER_OPENCODE_BIN=…
# API : ~/Library/Application Support/atelier-studio/api_providers.json
# Images Seedream : ARK_API_KEY ou entry byteplus-images
# ATELIER_CLAUDE_BARE=1  # optionnel
```

### Ticket de réunification (cmux-gallery)

Les crates `atelier-core` et `atelier-gallery` sont une **copie temporaire** de
`/Users/tofunori/Documents/cmux-gallery/rust` (Porte 2). Avant bascule
production : extraire un noyau partagé versionné et supprimer la copie.

Matrice d'inventaire : [`../plans/033-parity-matrix.md`](../plans/033-parity-matrix.md)

## Build & tests

```bash
cargo fmt --check --manifest-path rust/Cargo.toml
cargo clippy --manifest-path rust/Cargo.toml --workspace --all-targets -- -D warnings
cargo test --manifest-path rust/Cargo.toml --workspace --locked
```

Binaire :

```bash
cargo build -p atelier-server --manifest-path rust/Cargo.toml
# → rust/target/debug/atelier-studio-server
```

## Lancer seul (smoke)

```bash
export ATELIER_TOKEN=devtoken
export ATELIER_APP_DIR=/tmp/atelier-rust-smoke
export ATELIER_SKIP_SINGLE_INSTANCE=1
export ATELIER_WRITE_LOCK=1
./rust/target/debug/atelier-studio-server
# 1re ligne stdout = JSON health { ok, service: atelier-sidecar, port, … }
curl -s -H "x-atelier-token: devtoken" "http://127.0.0.1:$PORT/health"
```

## Comparaison Node ↔ Rust (Porte 9, lecture seule)

```bash
# 1) lancer les deux backends sur des ports/app dirs séparés (jamais le même app_dir en écriture)
# 2) corpus WS non-mutant :
node sidecar/scripts/parity_ws_compare.mjs \
  --node "ws://127.0.0.1:$NODE_PORT?token=$TOKEN" \
  --rust "ws://127.0.0.1:$RUST_PORT?token=$TOKEN"
# exit 0 = zéro divergence normalisée ; rapport JSON sur stdout
# Tests unitaires : cargo test -p atelier-runtime parity::
```

## Via Tauri (R10)

```bash
# Chat : Rust est le DÉFAUT (plus besoin de ATELIER_BACKEND=rust)
cargo build -p atelier-server --release --manifest-path rust/Cargo.toml
# ou stage pour le bundle :
bash scripts/stage-rust-server.sh

# Soak / secours Node pendant la période de transition :
export ATELIER_BACKEND=node

# Galerie : toujours Node par défaut (opt-in Rust)
export ATELIER_GALLERY_BACKEND=rust   # optionnel
cargo build -p atelier-gallery --manifest-path rust/Cargo.toml
```

**Important** : Node sidecar reste **staged** jusqu'à la Porte 11 (retrait).  
Galerie Node par défaut (`ATELIER_GALLERY_BACKEND`).

## Crates

```
rust/crates/
  atelier-protocol/     # types JSON sidecar
  atelier-runtime/      # serveur sidecar axum + ws_router
  atelier-store/        # threads, highlights, settings, journal, ledger
  atelier-workspace/    # files, git, terminal PTY, zotero, scan
  atelier-harness/      # turns, sequence, journal-before-UI
  atelier-providers/    # Fake, Claude, Codex, Grok, OpenCode, API, images
  atelier-server/       # binaire atelier-studio-server (chat)
  atelier-core/         # noyau galerie (vendored cmux)
  atelier-gallery/      # binaire atelier-gallery-server
```

## Référence

Backend galerie Rust déjà mature : `/Users/tofunori/Documents/cmux-gallery/rust`  
À intégrer en Porte 2 sans diverger durablement (path-dep temporaire + ticket de réunification OK).
