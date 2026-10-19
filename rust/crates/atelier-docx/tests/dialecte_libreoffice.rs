//! Le même document réenregistré par LibreOffice : identifiants de suivis et
//! de commentaires qui se recoupent, runs vides, instructions de champ
//! éclatées. Le modèle et les retouches doivent tenir.
mod common;

use atelier_docx::review::{Decision, decide_all};
use atelier_docx::{Docx, comments, edit};
use common::*;

fn lo() -> Docx {
    Docx::from_bytes(std::fs::read(fixture_dir("christophe-libreoffice.docx")).unwrap()).unwrap()
}

#[test]
fn modele_du_dialecte_libreoffice() {
    let mut d = lo();
    let m = d.model().unwrap();
    assert!(m.paragraphs[1].text.contains("(Ren et al., 2021). On ne conserve"), "{}", m.paragraphs[1].text);
    assert!(m.paragraphs[1].segments.iter().any(|s| s.label.as_deref() == Some("zotero")));
    assert!(m.changes.iter().any(|c| c.kind == "del" && c.text == "Ensuite, on"));
    assert_eq!(m.comments.len(), 2);
    assert!(m.comments.iter().any(|c| c.quote == "Le seuil de 0,6 retenu ici"));
}

#[test]
fn retouches_sur_le_dialecte_libreoffice() {
    let mut d = lo();
    let c = d.model().unwrap().comments.iter().find(|c| c.author == "Christophe").unwrap().id;
    comments::reply(&mut d, c, "Fait.", &sig("Claude")).unwrap();
    edit::replace(&mut d, "p2", "compromis", None, "équilibre", true, &sig("Claude")).unwrap();
    let b = decide_all(&mut d, Decision::Accept, Some("Christophe")).unwrap();
    assert!(b.skipped.is_empty(), "{b:?}");
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    assert!(m.changes.iter().all(|c| c.author == "Claude"));
    assert!(m.comments.iter().any(|x| x.parent == Some(c) && x.author == "Claude"));
    if let Some(txt) = libreoffice_text(&d.to_bytes().unwrap()) {
        assert!(txt.contains("un compromis") || txt.contains("équilibre"));
    }
}
