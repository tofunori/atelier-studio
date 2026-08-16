//! Binaire `atelier-zotero-passages-rs` — port de
//! `sidecar/zotero_passage_cli.mjs`, même contrat que le wrapper sh existant
//! `sidecar/atelier-zotero-passages` : succès -> une ligne JSON sur stdout,
//! exit 0 ; échec -> message sur stderr, stdout vide, exit 1.
//!
//! Stagé À CÔTÉ du script sh (suffixe `-rs`, voir
//! `scripts/stage-rust-server.sh`) — jamais invoqué en production tant que
//! le chemin injecté dans les prompts (`send.rs:47-49`) n'a pas basculé
//! (plan 065, vague 3 : préparation seulement, pas d'activation).

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match atelier_kb::zotero_cli::run(&argv) {
        Ok(value) => {
            println!("{}", serde_json::to_string(&value).unwrap());
        }
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    }
}
