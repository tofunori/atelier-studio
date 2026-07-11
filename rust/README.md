# Atelier Studio — backend Rust (plan 033)

Migration à **parité fonctionnelle** du sidecar Node + serveur galerie Node vers un binaire Rust unique (à terme).

## État

| Livraison | Contenu | Backend production |
|-----------|---------|-------------------|
| **R1** (actuel) | Protocole minimal : `/health`, `/providers`, `/setup`, `/uistate`, WS `ping`/`pong`, pid/lock, sélecteur `ATELIER_BACKEND` | **Node** (défaut) |
| R2+ | Galerie + store + harness + providers | voir `plans/033-*.md` |

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
# Compiler le binaire Rust d'abord
cargo build -p atelier-server --manifest-path rust/Cargo.toml

# Forcer le backend Rust (Node reste le défaut)
export ATELIER_BACKEND=rust
# optionnel : chemin explicite
export ATELIER_RUST_SERVER="$PWD/rust/target/debug/atelier-studio-server"
```

**Important** : R1 ne remplace **pas** le chat agents ni la galerie. Seul le transport HTTP/WS de base est branché. Revenir à Node : `unset ATELIER_BACKEND` ou `ATELIER_BACKEND=node`.

## Crates

```
rust/crates/
  atelier-protocol/   # types JSON (health, providers, WS frames)
  atelier-runtime/    # serveur axum, auth, pid/lock, uistate
  atelier-server/     # binaire atelier-studio-server
```

Crates futures (plan) : store, harness, providers, workspace, library, gallery.

## Référence

Backend galerie Rust déjà mature : `/Users/tofunori/Documents/cmux-gallery/rust`  
À intégrer en Porte 2 sans diverger durablement (path-dep temporaire + ticket de réunification OK).
