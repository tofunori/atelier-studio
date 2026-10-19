//! Nouveaux documents : vide, article, ou mise en forme copiée d'un autre.

mod common;

use atelier_docx::new::{Template, create};
use atelier_docx::{Docx, format};
use common::fixture_dir;

#[test]
fn copier_reprend_styles_et_page_sans_texte_ni_entetes() {
    let src = std::fs::read(fixture_dir("christophe.docx")).unwrap();
    let mut original = Docx::from_bytes(src.clone()).unwrap();
    let page = original.model().unwrap().page.unwrap();
    let names: Vec<String> = format::styles(&mut original).unwrap().into_iter().map(|s| s.id).collect();

    let mut d = Docx::from_bytes(create(Template::Copy(&src)).unwrap()).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), 1);
    assert!(m.paragraphs[0].text.is_empty());
    assert!(m.headers.is_empty(), "les en-têtes et pieds ne suivent pas");
    let copied = m.page.unwrap();
    assert_eq!((copied.width, copied.height, copied.left), (page.width, page.height, page.left));
    assert_eq!(copied.line_numbers.map(|l| l.restart), page.line_numbers.map(|l| l.restart));
    let ids: Vec<String> = format::styles(&mut d).unwrap().into_iter().map(|s| s.id).collect();
    assert_eq!(ids, names);
    assert!(!d.document_xml().contains("headerReference"));
}

#[test]
fn un_document_neuf_se_retouche() {
    for tracked in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("neuf.docx");
        std::fs::write(&path, create(Template::Article).unwrap()).unwrap();
        let mut d = Docx::open(&path).unwrap();
        let rev = d.revision();
        let id = d.model().unwrap().paragraphs[0].id.clone();
        let op: atelier_docx::ops::Op = serde_json::from_value(serde_json::json!({"op": "insert", "paragraph": id, "at": 0, "with": "Premier jet"})).unwrap();
        atelier_docx::edit_file(&path, Some(&rev), |d| atelier_docx::ops::apply(d, &op, tracked, &atelier_docx::Signature::now("Thierry"))).unwrap();
        let mut back = Docx::open(&path).unwrap();
        let m = back.model().unwrap();
        assert_eq!(m.paragraphs[0].text, "Premier jet");
        assert_eq!(m.changes.len(), usize::from(tracked));
        // Entrée à la fin : un deuxième paragraphe.
        let rev = back.revision();
        let split: atelier_docx::ops::Op = serde_json::from_value(serde_json::json!({"op": "split", "paragraph": id, "at": 11})).unwrap();
        atelier_docx::edit_file(&path, Some(&rev), |d| atelier_docx::ops::apply(d, &split, tracked, &atelier_docx::Signature::now("Thierry"))).unwrap();
        assert_eq!(Docx::open(&path).unwrap().model().unwrap().paragraphs.len(), 2);
    }
}
