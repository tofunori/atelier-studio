//! Binaire `atelier-kb-rs` — même contrat que `sidecar/kb_cli.mjs main()` :
//! succès -> une ligne JSON sur stdout, exit 0 ; échec -> message sur
//! stderr, stdout vide, exit 1.

fn main() {
    atelier_fdlimit::raise_nofile_limit();
    let argv: Vec<String> = std::env::args().skip(1).collect();
    match atelier_kb::cli::run(&argv) {
        Ok(value) => {
            println!("{}", serde_json::to_string(&value).unwrap());
        }
        Err(message) => {
            eprintln!("{message}");
            std::process::exit(1);
        }
    }
}
