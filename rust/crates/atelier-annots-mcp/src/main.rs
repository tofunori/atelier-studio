//! `atelier-annots-mcp` — serveur MCP stdio qui expose à un client externe
//! (Claude Desktop) les annotations PDF posées dans Atelier et les notes
//! personnelles qui les accompagnent. Écritures : `highlight_passage` et ses
//! retouches (`highlight.rs`) sur les surlignages de Claude, et le codage
//! qualitatif (`coding.rs`) : créer un code, proposer des codes.
//!
//! Sources :
//! - `$ATELIER_APP_DIR/pdf_annots.json` (défaut
//!   `~/Library/Application Support/atelier-studio`), écrit par le lecteur PDF
//!   (`atelier-gallery`, `documents.rs`) ; relu à chaque appel, donc toujours à jour ;
//! - `$ATELIER_ZOTERO_DIR/zotero.sqlite` (défaut `~/Zotero`), lu sur une COPIE
//!   (Zotero verrouille sa base) : titre, auteurs, année de chaque article, et
//!   les annotations faites dans Zotero lui-même.
//!
//! Le texte tapé dans le champ du chat (`note`) n'est jamais exposé comme une
//! note : seule la note personnelle (`memo`) l'est, plus le texte d'une note
//! libre (`kind: "note"`), qui est une note par nature.

mod activity;
mod app_view;
mod coding;
mod compile;
mod connector;
mod highlight;
mod library;
mod oauth;
mod project;
mod revision;
mod server;
mod zotero;

fn main() {
    let config = library::Config::from_env();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let outcome = match args.first().map(String::as_str) {
        // Connecteur distant pour claude.ai (voir connector.rs).
        Some("--http") => {
            let port = args
                .get(1)
                .and_then(|p| p.parse().ok())
                .unwrap_or(connector::DEFAULT_PORT);
            connector::run(config, port)
        }
        Some("--set-code") => set_code(&config),
        // Page « Claude » des réglages d'Atelier : état et déconnexion.
        Some("--status") => {
            let mut status = oauth::OAuth::load(&config.app_dir).summary();
            status["roots"] = serde_json::json!(connector::config_roots(&config.app_dir)
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>());
            status["activity"] = serde_json::json!(activity::recent(&config.app_dir, 20));
            println!("{status}");
            Ok(())
        }
        Some("--disconnect") => oauth::OAuth::load(&config.app_dir).disconnect(),
        // Processus enfant de `render_pdf_page` (voir compile.rs).
        Some("--render-page") => compile::render_child(&args[1..]),
        Some(other) => Err(format!(
            "option inconnue : {other} (--http [port], --set-code, --status, --disconnect)"
        )),
        None => server::run(&config),
    };
    if let Err(error) = outcome {
        eprintln!("atelier-annots-mcp: {error}");
        std::process::exit(1);
    }
}

/// Choisit le code que l'utilisateur tapera pour connecter Claude. Lu sur
/// l'entrée standard, sans écho dans un terminal.
fn set_code(config: &library::Config) -> Result<(), String> {
    use std::io::{BufRead, IsTerminal, Write};
    let tty = std::io::stdin().is_terminal();
    let echo = |on: bool| {
        if tty {
            let _ = std::process::Command::new("stty")
                .arg(if on { "echo" } else { "-echo" })
                .stdin(std::process::Stdio::inherit())
                .status();
        }
    };
    let read = |prompt: &str| -> Result<String, String> {
        eprint!("{prompt}");
        let _ = std::io::stderr().flush();
        echo(false);
        let mut line = String::new();
        let res = std::io::stdin().lock().read_line(&mut line);
        echo(true);
        if tty {
            eprintln!();
        }
        res.map_err(|e| e.to_string())?;
        Ok(line.trim().to_string())
    };
    let first = read(&format!(
        "Code pour connecter Claude à Atelier ({} caractères au moins) : ",
        oauth::SECRET_MIN
    ))?;
    if tty && read("Encore une fois : ")? != first {
        return Err("les deux codes diffèrent ; rien n'a changé".into());
    }
    oauth::OAuth::load(&config.app_dir).set_secret(&first)?;
    eprintln!("Code enregistré. Les connexions déjà accordées à Claude sont retirées.");
    Ok(())
}
