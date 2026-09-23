# Backend Rust (stagé)

Rempli par `scripts/stage-rust-server.sh` (lancé aussi par `beforeBuildCommand`
et par `.github/workflows/release.yml`). **Rien ici n'est suivi par git** sauf ce
README, qui garde le dossier présent pour tauri-build (ressource `rust-server`).

Contenu après stage :
- `atelier-studio-server`, `atelier-remote-gateway`, `atelier-gallery-server`,
  `atelier-gallery-tool`, `atelier-agent-mcp`, `atelier-kb-rs`,
  `atelier-zotero-passages-rs` — binaires release de `rust/`
- `atelier_figure_qc.py` — module de contrôle des figures
- `BUILD_STAMP.txt` — date du build et sha256 de chaque binaire

En dev (`tauri dev`), les résolveurs retombent sur `rust/target/{release,debug}/`.
