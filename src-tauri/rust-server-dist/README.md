# Rust chat backend (staged)

Populated by `scripts/stage-rust-server.sh` (also run from `beforeBuildCommand`).

Produces:
- `atelier-studio-server` — binary launched by Tauri when `ATELIER_BACKEND` is unset or `rust` (default since plan 033 Porte 10)
- `BUILD_STAMP.txt` — build metadata

Fallback soak: `ATELIER_BACKEND=node` uses the Node sidecar instead.
