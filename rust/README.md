# Atelier Studio — backend Rust (plan 033)

Migration à **parité fonctionnelle** du sidecar Node + serveur galerie Node vers un binaire Rust unique (à terme).

## État

| Livraison | Contenu | Backend production |
|-----------|---------|-------------------|
| **R1** | Sidecar HTTP/WS minimal | **Node** (défaut) |
| **R2** | Galerie Rust vendored (`atelier-gallery-server`) | **Node** galerie (défaut) |
| **R3** (actuel) | `atelier-store` + WS threads/history/highlights/settings/ledger | **Node** chat (défaut) ; Rust opt-in |
| R4+ | Workspace/Git/terminal + moteur providers | voir `plans/033-*.md` |

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

## Via Tauri (expérimental)

```bash
# Sidecar chat (R1)
cargo build -p atelier-server --manifest-path rust/Cargo.toml
export ATELIER_BACKEND=rust
export ATELIER_RUST_SERVER="$PWD/rust/target/debug/atelier-studio-server"

# Galerie (R2)
cargo build -p atelier-gallery --manifest-path rust/Cargo.toml
export ATELIER_GALLERY_BACKEND=rust
export ATELIER_GALLERY_SERVER="$PWD/rust/target/debug/atelier-gallery-server"
```

**Important** : Node reste le défaut pour chat **et** galerie. R2 ne retire pas
`gallery/server/main.mjs` de la production.

## Crates

```
rust/crates/
  atelier-protocol/     # types JSON sidecar
  atelier-runtime/      # serveur sidecar axum + ws_router
  atelier-store/        # threads, highlights, settings, journal, ledger
  atelier-server/       # binaire atelier-studio-server (chat)
  atelier-core/         # noyau galerie (vendored cmux)
  atelier-gallery/      # binaire atelier-gallery-server
```

## Référence

Backend galerie Rust déjà mature : `/Users/tofunori/Documents/cmux-gallery/rust`  
À intégrer en Porte 2 sans diverger durablement (path-dep temporaire + ticket de réunification OK).
