mod common;

use atelier_docx::structure;
use atelier_docx::{Docx, edit_file};
use common::*;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;

/// Christophe (Word) laisse une fin de plage (déplacement, signet…) entre
/// deux paragraphes : la fusion doit passer par-dessus, sans la perdre.
fn with_mark_between(mark_start: &str, mark_end: &str) -> (Vec<u8>, usize) {
    let mut d = open("christophe");
    let m = d.model().unwrap();
    let k = m.paragraphs.iter().position(|p| p.text.ends_with("en fin d'été.")).expect("paragraphe d'essai");
    let tail = m.paragraphs[k].text.clone();
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (name, bytes) in entries(&build("christophe")) {
        let bytes = if name == "word/document.xml" {
            let mut x = String::from_utf8(bytes).unwrap();
            let last_word = "été.";
            let at = x.find(last_word).unwrap_or_else(|| panic!("{tail}"));
            let end = at + x[at..].find("</w:p>").unwrap();
            x.insert_str(end + "</w:p>".len(), mark_end);
            x.insert_str(end, mark_start);
            x.into_bytes()
        } else {
            bytes
        };
        out.start_file(name, SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)).unwrap();
        out.write_all(&bytes).unwrap();
    }
    (out.finish().unwrap().into_inner(), k + 1)
}

#[test]
fn la_fusion_passe_une_fin_de_deplacement_ou_de_signet_entre_les_paragraphes() {
    let marks = [
        (r#"<w:moveFromRangeStart w:id="901" w:author="Christophe" w:date="2026-11-08T17:27:00Z" w:name="move1"/>"#, r#"<w:moveFromRangeEnd w:id="901"/>"#),
        (r#"<w:bookmarkStart w:id="902" w:name="_Ref1"/>"#, r#"<w:bookmarkEnd w:id="902"/>"#),
    ];
    for (start, end) in marks {
        for tracked in [true, false] {
            let (bytes, second) = with_mark_between(start, end);
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("doc.docx");
            std::fs::write(&path, &bytes).unwrap();
            let before = Docx::open(&path).unwrap().model().unwrap();
            let first_text = before.paragraphs[second - 1].text.clone();
            let second_text = before.paragraphs[second].text.clone();
            let me = sig("Thierry");
            // edit_file relit et contrôle le paquet produit (check::guard).
            edit_file(&path, None, |d| structure::join(d, &format!("p{second}"), tracked, &me)).unwrap_or_else(|e| panic!("{start} suivi={tracked} : {}", e.0));
            let mut d = Docx::open(&path).unwrap();
            let m = d.model().unwrap();
            if tracked {
                let mark = m.changes.iter().find(|c| c.kind == "paragraph-del" && c.author == "Thierry").unwrap_or_else(|| panic!("{:?}", m.changes)).id;
                // Accepter la marque supprimée réunit vraiment les deux paragraphes.
                edit_file(&path, None, |d| atelier_docx::review::decide(d, mark, atelier_docx::review::Decision::Accept)).unwrap_or_else(|e| panic!("{start} accepter : {}", e.0));
                let mut d = Docx::open(&path).unwrap();
                let m = d.model().unwrap();
                assert_eq!(m.paragraphs.len(), before.paragraphs.len() - 1, "{start}");
                assert_eq!(m.paragraphs[second - 1].text, format!("{first_text}{second_text}"));
                let end_tag = end.split_whitespace().next().unwrap();
                assert!(d.document_xml().contains(end_tag), "la fin de plage est gardée : {end_tag}");
            } else {
                assert_eq!(m.paragraphs.len(), before.paragraphs.len() - 1);
                assert_eq!(m.paragraphs[second - 1].text, format!("{first_text}{second_text}"));
                let xml = d.document_xml().to_string();
                let end_tag = end.split_whitespace().next().unwrap();
                assert!(xml.contains(end_tag), "la fin de plage est gardée : {end_tag}");
            }
        }
    }
}
