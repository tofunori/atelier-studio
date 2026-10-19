mod common;

use atelier_docx::{comments, edit};
use common::*;

#[test]
fn remplacer_en_suivi_signe_par_l_auteur() {
    let mut d = open("christophe");
    let r = edit::replace(&mut d, "p2", "compromis", None, "équilibre", true, &sig("Claude")).unwrap();
    assert_eq!(r.changes.len(), 2);
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[2].text, "Le seuil de 0,6 retenu ici offre un équilibre entre le nombre de pixels retenus et la pureté du signal glaciaire.");
    let mine: Vec<_> = m.changes.iter().filter(|c| c.author == "Claude").collect();
    assert_eq!(mine.len(), 2);
    assert_eq!(mine.iter().find(|c| c.kind == "del").unwrap().text, "compromis");
    assert_eq!(mine.iter().find(|c| c.kind == "ins").unwrap().text, "équilibre");
    // Les commentaires ancrés dans le même paragraphe sont intacts.
    assert_eq!(m.comments[0].quote, "Le seuil de 0,6 retenu ici");
    // Seul document.xml a changé.
    for ((na, va), (_, vb)) in entries(&build("christophe")).iter().zip(&entries(&d.to_bytes().unwrap())) {
        if na != "word/document.xml" {
            assert_eq!(va, vb, "{na}");
        }
    }
}

#[test]
fn remplacer_a_cheval_sur_deux_runs_et_garder_la_mise_en_forme() {
    let mut d = open("christophe");
    edit::replace(&mut d, "p13", "texte Un texte", None, "texte, un autre texte", true, &sig("Thierry")).unwrap();
    assert_eq!(para_text(&mut d, "p13"), "Un texte, un autre texte\tavec tabulation et exposant.");
    edit::replace(&mut d, "p13", "exposant", None, "indice", true, &sig("Thierry")).unwrap();
    let m = d.model().unwrap();
    let ins = m.paragraphs[13].segments.iter().find(|s| s.rev == Some("ins") && s.text == "indice").unwrap();
    assert!(ins.sup, "l'insertion reprend la mise en forme du passage remplacé");
}

#[test]
fn refuser_de_couper_une_citation_zotero_ou_un_suivi() {
    let mut d = open("christophe");
    let e = edit::replace(&mut d, "p1", "MOD09GA (Ren", None, "x", true, &sig("Claude")).unwrap_err();
    assert!(e.0.contains("Zotero"), "{e}");
    let e = edit::replace(&mut d, "p1", "On ne", None, "x", true, &sig("Claude")).unwrap_err();
    assert!(e.0.contains("suivi"), "{e}");
    let e = edit::replace(&mut d, "p1", "introuvable", None, "x", true, &sig("Claude")).unwrap_err();
    assert!(e.0.contains("introuvable"));
    let e = edit::replace(&mut d, "p13", "Un texte", None, "x", true, &sig("Claude")).unwrap_err();
    assert!(e.0.contains("2 fois"), "{e}");
    edit::replace(&mut d, "p13", "Un texte", Some(2), "Le texte", true, &sig("Claude")).unwrap();
    assert!(para_text(&mut d, "p13").starts_with("Un texte Le texte\t"));
    assert!(d.document_xml().contains("ZOTERO_ITEM CSL_CITATION {\"citationID\":\"Xk2p9\""));
}

#[test]
fn remplacer_sans_suivi_et_echapper_le_texte() {
    let mut d = open("christophe");
    let r = edit::replace(&mut d, "p4", "en fin d'été", None, "en <août> & \"septembre\"", false, &sig("Thierry")).unwrap();
    assert!(r.changes.is_empty());
    let mut d = reopen(&d);
    assert_eq!(para_text(&mut d, "p4"), "l'écart atteignant 0,04 en <août> & \"septembre\".");
    assert!(d.model().unwrap().changes.iter().all(|c| c.author == "Christophe"));
}

#[test]
fn inserer_et_supprimer() {
    let mut d = open("christophe");
    edit::insert(&mut d, "p4", 0, "Enfin, ", true, &sig("Thierry")).unwrap();
    edit::replace(&mut d, "p4", " en fin d'été", None, "", true, &sig("Thierry")).unwrap();
    assert_eq!(para_text(&mut d, "p4"), "Enfin, l'écart atteignant 0,04.");
    // Insertion pure au milieu d'un run, puis à la fin du paragraphe.
    edit::insert(&mut d, "p0", 4, " (révisé)", true, &sig("Thierry")).unwrap();
    assert_eq!(para_text(&mut d, "p0"), "2.2  (révisé)Fraction de glace et filtrage des pixels");
    let n = para_text(&mut d, "p2").chars().count();
    edit::insert(&mut d, "p2", n, " Fin.", true, &sig("Thierry")).unwrap();
    assert!(para_text(&mut d, "p2").ends_with("glaciaire. Fin."));
    let ids: Vec<u32> = d.model().unwrap().changes.iter().map(|c| c.id).collect();
    let mut sorted = ids.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(ids.len(), sorted.len(), "identifiants uniques : {ids:?}");
    if let Some(txt) = libreoffice_text(&d.to_bytes().unwrap()) {
        assert!(txt.contains("(révisé)"));
    }
}

#[test]
fn commenter_repondre_resoudre_supprimer() {
    let mut d = open("christophe");
    let c = comments::add(&mut d, "p2", "pureté du signal", None, "Préciser « pureté ».", &sig("Claude")).unwrap();
    let r = comments::reply(&mut d, 1, "Annexe B ajoutée, avec 0,5 et 0,7.", &sig("Claude")).unwrap();
    comments::resolve(&mut d, 1, true).unwrap();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let new = m.comments.iter().find(|x| x.id == c.id).unwrap();
    assert_eq!((new.quote.as_str(), new.author.as_str(), new.parent), ("pureté du signal", "Claude", None));
    let rep = m.comments.iter().find(|x| x.id == r.id).unwrap();
    assert_eq!(rep.parent, Some(1));
    assert_eq!(rep.quote, "Le seuil de 0,6 retenu ici");
    assert!(m.comments.iter().find(|x| x.id == 1).unwrap().done);
    assert_eq!(m.paragraphs[2].text, "Le seuil de 0,6 retenu ici offre un compromis entre le nombre de pixels retenus et la pureté du signal glaciaire.");

    comments::resolve(&mut d, 1, false).unwrap();
    assert!(!d.model().unwrap().comments.iter().find(|x| x.id == 1).unwrap().done);
    comments::delete(&mut d, 1).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.comments.iter().map(|x| x.id).collect::<Vec<_>>(), vec![c.id], "le fil entier part avec son parent");
    assert!(!d.document_xml().contains("commentRangeStart w:id=\"1\""), "ancrages retirés");
    if let Some(txt) = libreoffice_text(&d.to_bytes().unwrap()) {
        assert!(txt.contains("pureté du signal"));
    }
}

#[test]
fn commenter_un_document_sans_commentaires_cree_les_parties() {
    let mut d = open("christophe");
    comments::delete(&mut d, 1).unwrap();
    // Simuler un document qui n'a jamais eu de commentaires : on repart d'un
    // paquet sans comments.xml en retirant les parties.
    let bytes = strip_parts(&build("christophe"), &["word/comments.xml", "word/commentsExtended.xml"]);
    let mut d = atelier_docx::Docx::from_bytes(bytes).unwrap();
    let c = comments::add(&mut d, "p4", "0,04", None, "Arrondi ?", &sig("Thierry")).unwrap();
    let r = comments::reply(&mut d, c.id, "Oui, deux décimales.", &sig("Claude")).unwrap();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    assert_eq!(m.comments.iter().find(|x| x.id == r.id).unwrap().parent, Some(c.id));
    let names: Vec<String> = entries(&d.to_bytes().unwrap()).into_iter().map(|e| e.0).collect();
    assert!(names.contains(&"word/comments.xml".to_string()) && names.contains(&"word/commentsExtended.xml".to_string()));
    let ct = String::from_utf8(entries(&d.to_bytes().unwrap()).into_iter().find(|e| e.0 == "[Content_Types].xml").unwrap().1).unwrap();
    assert_eq!(ct.matches("/word/comments.xml").count(), 1);
}

/// Copie du paquet sans certaines parties ni leurs déclarations.
fn strip_parts(bytes: &[u8], parts: &[&str]) -> Vec<u8> {
    use std::io::Write;
    let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, data) in entries(bytes) {
        if parts.contains(&name.as_str()) {
            continue;
        }
        if !name.ends_with(".xml") && !name.ends_with(".rels") {
            out.start_file(name.as_str(), zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(&data).unwrap();
            continue;
        }
        let mut data = String::from_utf8(data).unwrap();
        if name == "[Content_Types].xml" || name == "word/_rels/document.xml.rels" {
            for p in parts {
                let file = p.rsplit('/').next().unwrap();
                data = data
                    .split('<')
                    .filter(|chunk| !chunk.contains(&format!("\"/{p}\"")) && !chunk.contains(&format!("Target=\"{file}\"")))
                    .collect::<Vec<_>>()
                    .join("<");
            }
        }
        out.start_file(name.as_str(), zip::write::SimpleFileOptions::default()).unwrap();
        out.write_all(data.as_bytes()).unwrap();
    }
    out.finish().unwrap().into_inner()
}
