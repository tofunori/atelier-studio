//! `atelier-annots-mcp` — serveur MCP stdio, en LECTURE SEULE, qui expose à un
//! client externe (Claude Desktop) les annotations PDF posées dans Atelier et
//! les notes personnelles qui les accompagnent.
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

mod library;
mod server;
mod zotero;

fn main() {
    let config = library::Config::from_env();
    if let Err(error) = server::run(&config) {
        eprintln!("atelier-annots-mcp: {error}");
        std::process::exit(1);
    }
}
