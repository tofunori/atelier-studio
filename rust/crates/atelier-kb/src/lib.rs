//! atelier-kb — port Rust de `sidecar/kb_cli.mjs` (plan 065). Vague 1 :
//! groupe « store local ». Vague 2 : groupes « gbrain » et « article-local »
//! (MinerU réel et `article-doi` en réseau restent hors périmètre — voir
//! `plans/065-inventaire-kb.md` et `gallery/server/tests/kb_parity/README.md`).
//! Binaire `atelier-kb-rs` (voir `src/main.rs`) : même contrat argv/stdin ->
//! stdout JSON que le CLI Node, vérifié par les fixtures
//! `kb_parity/fixtures/{a-local-store,b-gbrain,c-article-local}.json`.

pub mod article;
pub mod article_meta;
pub mod cli;
pub mod csv_digest;
pub mod folder;
pub mod gbrain;
pub mod pdf;
pub mod search;
pub mod store;
pub mod web;
pub mod youtube;
pub mod zotero;
pub mod zotero_cli;
