//! Réparation ponctuelle d'un .docx retouché par l'agent avant que ses
//! suivis soient signés du nom de l'utilisateur (2026-11-13) :
//!
//!     cargo run -p atelier-docx --example signer_retouches_agent -- <fichier.docx> "<Nom>" [--essai]
//!
//! Les suivis signés « Claude », « Codex »… passent au nom donné ; Atelier
//! garde en mémoire qu'ils viennent de l'agent. `--essai` compte sans
//! écrire. Comme toute retouche : refus si Word a le fichier ouvert,
//! contrôle du paquet, version d'avant gardée dans l'historique.

use atelier_docx::{history::Origin, marks, Docx};
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let dry = args.iter().any(|a| a == "--essai");
    let pos: Vec<&String> = args.iter().filter(|a| !a.starts_with("--")).collect();
    let (Some(path), Some(name)) = (pos.first(), pos.get(1)) else {
        eprintln!("usage : signer_retouches_agent <fichier.docx> \"<Nom>\" [--essai]");
        std::process::exit(2);
    };
    let path = PathBuf::from(path);
    let run = || -> atelier_docx::Result<usize> {
        if dry {
            let mut d = Docx::open(&path)?;
            let before = d.model()?;
            let stamps = marks::adopt(&mut d, name)?;
            let n = before.changes.iter().filter(|c| marks::is_agent(&c.author)).count();
            println!("essai : {n} suivis signés par un agent, {} signatures ; rien d'écrit", stamps.len());
            return Ok(n);
        }
        let origin = Origin { source: "atelier", author: name, label: "signature" };
        let (stamps, rev) = atelier_docx::edit_file_as(&path, None, &origin, |d| marks::adopt(d, name))?;
        marks::remember(&path, &stamps)?;
        let model = Docx::open(&path)?.model()?;
        let left = model.changes.iter().filter(|c| marks::is_agent(&c.author)).count();
        let kept = marks::list(&path, &model)?.len();
        println!("écrit (révision {rev}) : {kept} suivis au nom de {name} marqués « proposé par l'agent », {left} encore signés par un agent");
        Ok(kept)
    };
    if let Err(e) = run() {
        eprintln!("échec : {}", e.0);
        std::process::exit(1);
    }
}
