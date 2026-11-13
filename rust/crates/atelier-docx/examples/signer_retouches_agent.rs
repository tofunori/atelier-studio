//! Réparation ponctuelle d'un .docx retouché par l'agent avant que ses
//! suivis soient signés du nom de l'utilisateur (2026-11-13) :
//!
//!     cargo run -p atelier-docx --example signer_retouches_agent -- <fichier.docx> "<Nom>" [--rouvrir] [--brouillons] [--essai]
//!
//! - toujours : les suivis signés « Claude », « Codex »… passent au nom
//!   donné ; Atelier garde en mémoire qu'ils viennent de l'agent ; leurs
//!   commentaires et réponses aussi (auteur et initiales) ;
//! - `--rouvrir` : rouvre les fils où `<Nom>` a répondu (Word replie les
//!   fils résolus, et leurs réponses avec) ;
//! - `--brouillons` : les brouillons de réponse restés dans la carte
//!   deviennent des réponses signées `<Nom>`, fil rouvert, puis s'effacent ;
//! - `--essai` : compte sans rien écrire.
//!
//! Comme toute retouche : refus si Word a le fichier ouvert, contrôle du
//! paquet, version d'avant gardée dans l'historique.

use atelier_docx::{drafts, history::Origin, marks, Docx};
use std::path::PathBuf;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let flag = |f: &str| args.iter().any(|a| a == f);
    let (dry, reopen, send_drafts) = (flag("--essai"), flag("--rouvrir"), flag("--brouillons"));
    let pos: Vec<&String> = args.iter().filter(|a| !a.starts_with("--")).collect();
    let (Some(path), Some(name)) = (pos.first(), pos.get(1)) else {
        eprintln!("usage : signer_retouches_agent <fichier.docx> \"<Nom>\" [--rouvrir] [--brouillons] [--essai]");
        std::process::exit(2);
    };
    let name = name.trim().to_string();
    let path = PathBuf::from(path);
    let pending = if send_drafts { drafts::list(&path).unwrap_or_default() } else { Default::default() };

    let repair = |d: &mut Docx| marks::repair(d, &name, &pending, reopen);

    let run = || -> atelier_docx::Result<()> {
        if dry {
            let mut d = Docx::open(&path)?;
            let m = d.model()?;
            let agent = m.changes.iter().filter(|c| marks::is_agent(&c.author)).count();
            let notes = m.comments.iter().filter(|c| marks::is_agent(&c.author)).count();
            let done = repair(&mut d)?;
            println!(
                "essai : {agent} suivis et {notes} commentaires signés par un agent passeraient à {name} ; {} fils rouverts ; {} brouillons envoyés ; rien d'écrit",
                done.reopened,
                done.replied.len()
            );
            return Ok(());
        }
        let origin = Origin { source: "atelier", author: &name, label: "réparation" };
        let (done, rev) = atelier_docx::edit_file_as(&path, None, &origin, repair)?;
        marks::remember(&path, &done.stamps)?;
        for id in &done.replied {
            drafts::clear(&path, *id)?;
        }
        let model = Docx::open(&path)?.model()?;
        let left = model.changes.iter().filter(|c| marks::is_agent(&c.author)).count() + model.comments.iter().filter(|c| marks::is_agent(&c.author)).count();
        let kept = marks::list(&path, &model)?.len();
        let mine = model.comments.iter().filter(|c| c.author == name && c.parent.is_some()).count();
        let hidden = model
            .comments
            .iter()
            .filter(|c| c.author == name)
            .filter_map(|c| c.parent)
            .filter(|p| model.comments.iter().any(|x| x.id == *p && x.done))
            .count();
        println!(
            "écrit (révision {rev}) : {kept} suivis à ton nom marqués « proposé par l'agent », {left} suivis ou commentaires encore signés par un agent ; {} fils rouverts ; {} brouillons envoyés ; {mine} réponses à ton nom, dont {hidden} sous un fil résolu",
            done.reopened,
            done.replied.len()
        );
        Ok(())
    };
    if let Err(e) = run() {
        eprintln!("échec : {}", e.0);
        std::process::exit(1);
    }
}
