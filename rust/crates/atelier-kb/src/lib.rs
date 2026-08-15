//! atelier-kb — port Rust de `sidecar/kb_cli.mjs` (plan 065, vague 1 :
//! groupe « store local » uniquement — voir `plans/065-inventaire-kb.md` et
//! `gallery/server/tests/kb_parity/README.md`). Binaire `atelier-kb-rs`
//! (voir `src/main.rs`) : même contrat argv/stdin -> stdout JSON que le CLI
//! Node, vérifié par les fixtures `kb_parity/fixtures/a-local-store.json`.

pub mod cli;
pub mod csv_digest;
pub mod folder;
pub mod pdf;
pub mod search;
pub mod store;
