//! Rendu des graphiques d'Excel d'un .docx en SVG, comme la surface Word
//! d'Atelier les affiche (vérification sur de vrais documents, lecture seule) :
//!
//!     cargo run -p atelier-docx --example rendre_graphiques -- <dossier de sortie> <fichier.docx>...
//!
//! Écrit `<nom du docx>-<n>.svg` par graphique, à la taille de son cadre.

use atelier_docx::{objects, Docx};
use std::path::{Path, PathBuf};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some((out, files)) = args.split_first().filter(|(_, f)| !f.is_empty()) else {
        eprintln!("usage : rendre_graphiques <dossier de sortie> <fichier.docx>...");
        std::process::exit(2);
    };
    let out = PathBuf::from(out);
    std::fs::create_dir_all(&out).expect("dossier de sortie");
    for f in files {
        let stem = Path::new(f).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let mut d = match Docx::open(Path::new(f)) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("{f} : {}", e.0);
                continue;
            }
        };
        let model = match d.model() {
            Ok(m) => m,
            Err(e) => {
                eprintln!("{f} : {}", e.0);
                continue;
            }
        };
        let theme = objects::theme(&mut d).ok().flatten();
        let mut n = 0;
        for p in &model.paragraphs {
            for s in &p.segments {
                let Some(rel) = &s.media else { continue };
                let Ok(Some(raw)) = objects::media_raw(&mut d, &p.id, rel) else { continue };
                if raw.1 != atelier_docx::chart::MIME {
                    continue;
                }
                n += 1;
                let size = s.width.zip(s.height).map(|(w, h)| (w as f64, h as f64));
                let (svg, _) = objects::render(raw, theme.as_deref(), size);
                let name = out.join(format!("{stem}-{n}.svg"));
                std::fs::write(&name, svg).expect("écriture du SVG");
                println!("{}", name.display());
            }
        }
        if n == 0 {
            println!("{f} : aucun graphique");
        }
    }
}
