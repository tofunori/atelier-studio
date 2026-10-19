mod common;

use atelier_docx::review::{Decision, decide, decide_all};
use common::*;

#[test]
fn modele_lit_paragraphes_suivis_et_commentaires() {
    let mut d = open("christophe");
    let m = d.model().unwrap();
    let p = &m.paragraphs;
    assert_eq!(p[0].heading, Some(1));
    assert_eq!(p[0].text, "2.2 Fraction de glace et filtrage des pixels");
    // Le texte courant exclut la suppression de Christophe, garde son insertion.
    assert!(p[1].text.contains("(Ren et al., 2021). On ne conserve"), "{}", p[1].text);
    assert!(!p[1].text.contains("ADDIN"), "l'instruction Zotero reste cachée");
    let zot = p[1].segments.iter().find(|s| s.kind == "field").unwrap();
    assert_eq!(zot.label.as_deref(), Some("zotero"));
    assert_eq!(zot.text, "(Ren et al., 2021)");
    assert!(!zot.editable);
    let del = p[1].segments.iter().find(|s| s.rev == Some("del")).unwrap();
    assert_eq!((del.text.as_str(), del.change), ("Ensuite, on", Some(101)));
    assert!(p[1].segments.iter().any(|s| s.kind == "object" && s.label.as_deref() == Some("note")));
    assert!(p[1].segments.iter().any(|s| s.i && s.text == "MOD09GA"));

    let kinds: Vec<(u32, &str)> = m.changes.iter().map(|c| (c.id, c.kind.as_str())).collect();
    for want in [(101, "del"), (102, "ins"), (103, "paragraph-del"), (104, "format"), (105, "row-ins"), (106, "ins"), (108, "format"), (110, "moveFrom"), (112, "moveTo")] {
        assert!(kinds.contains(&want), "{want:?} absent de {kinds:?}");
    }
    assert!(m.changes.iter().all(|c| c.author == "Christophe"));
    assert_eq!(m.changes.iter().find(|c| c.id == 101).unwrap().paragraph.as_deref(), Some("p1"));

    assert_eq!(m.comments.len(), 2);
    let c1 = &m.comments[0];
    assert_eq!((c1.author.as_str(), c1.quote.as_str(), c1.paragraph.as_deref()), ("Christophe", "Le seuil de 0,6 retenu ici", Some("p2")));
    assert_eq!(m.comments[1].parent, Some(1));
    assert!(!c1.done);

    // Cellules de tableau, équation, figure, renvoi SEQ
    assert!(p.iter().any(|x| x.cell == Some([0, 1, 0]) && x.text == "Z3"));
    assert!(p.iter().any(|x| x.segments.iter().any(|s| s.label.as_deref() == Some("équation") && s.text.contains("α=0,356"))));
    assert!(p.iter().any(|x| x.segments.iter().any(|s| s.label.as_deref() == Some("image"))));
    assert!(p.iter().any(|x| x.segments.iter().any(|s| s.label.as_deref() == Some("seq") && s.text == "4")));
    assert!(m.other_parts.is_empty());

    // Note de bas de page : numérotée par son appel, lue avec son suivi.
    let call = p[1].segments.iter().find(|s| s.label.as_deref() == Some("note")).unwrap();
    assert_eq!(call.number, Some(1));
    assert_eq!(m.notes.len(), 1);
    let n = &m.notes[0];
    assert_eq!((n.id.as_str(), n.kind, n.number), ("n1", "footnote", Some(1)));
    assert_eq!(n.paragraphs[0].id, "n1.p0");
    assert_eq!(n.paragraphs[0].text, " Seuil appliqué à la fraction Sentinel-2 moyenne de juillet à septembre.");
    let c = m.changes.iter().find(|c| c.id == 120).unwrap();
    assert_eq!((c.text.as_str(), c.paragraph.as_deref()), ("Sentinel-2 ", Some("n1.p0")));

    // En-tête et pied de page de la section.
    let ids: Vec<(&str, &str)> = m.headers.iter().map(|h| (h.id.as_str(), h.kind)).collect();
    assert_eq!(ids, [("header1", "header"), ("footer1", "footer")]);
    assert_eq!(m.headers[0].paragraphs[0].text, "Chapitre 2 – Albédo des glaciers tropicaux");
    assert_eq!(m.headers[1].paragraphs[0].text, "Page 12");
}

#[test]
fn ouvrir_puis_enregistrer_sans_rien_toucher_rend_le_meme_contenu() {
    let src = build("christophe");
    let d = atelier_docx::Docx::from_bytes(src.clone()).unwrap();
    assert!(!d.is_dirty());
    let out = d.to_bytes().unwrap();
    assert_eq!(entries(&src), entries(&out));
}

#[test]
fn accepter_et_refuser_un_remplacement() {
    let mut d = open("christophe");
    decide(&mut d, 101, Decision::Accept).unwrap();
    decide(&mut d, 102, Decision::Accept).unwrap();
    let t = para_text(&mut d, "p1");
    assert!(t.contains("2021). On ne conserve"));
    let m = d.model().unwrap();
    assert!(!m.changes.iter().any(|c| c.id == 101 || c.id == 102));

    let mut d = open("christophe");
    decide(&mut d, 101, Decision::Reject).unwrap();
    decide(&mut d, 102, Decision::Reject).unwrap();
    let t = para_text(&mut d, "p1");
    assert!(t.contains("2021). Ensuite, on ne conserve"), "{t}");
    // Le texte rétabli est redevenu retouchable.
    let m = d.model().unwrap();
    assert!(m.paragraphs[1].segments.iter().any(|s| s.editable && s.text.contains("Ensuite, on")));
    assert!(!d.document_xml().contains("delText"));
}

#[test]
fn marque_de_paragraphe_supprimee_fusionne_les_paragraphes() {
    let mut d = open("christophe");
    let before = d.model().unwrap().paragraphs.len();
    decide(&mut d, 103, Decision::Accept).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), before - 1);
    assert_eq!(m.paragraphs[3].text, "Ces valeurs sont systématiquement inférieures à celles du produit MCD43A3,l'écart atteignant 0,04 en fin d'été.");
    // Refuser : la marque reste, le suivi disparaît.
    let mut d = open("christophe");
    decide(&mut d, 103, Decision::Reject).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), before);
    assert!(m.paragraphs[3].mark_change.is_none());
}

#[test]
fn mises_en_forme_lignes_et_deplacements() {
    let mut d = open("christophe");
    decide(&mut d, 104, Decision::Reject).unwrap();
    let m = d.model().unwrap();
    assert!(m.paragraphs[4].segments.iter().all(|s| !s.b), "le gras ajouté est retiré");

    let mut d = open("christophe");
    decide(&mut d, 104, Decision::Accept).unwrap();
    let m = d.model().unwrap();
    assert!(m.paragraphs[4].segments.iter().any(|s| s.b && s.text == "0,04"));
    assert!(!d.document_xml().contains("rPrChange"));

    let mut d = open("christophe");
    decide(&mut d, 108, Decision::Reject).unwrap();
    assert!(!d.document_xml().contains("pPrChange"));
    assert!(d.document_xml().contains(r#"<w:pPr><w:pStyle w:val="Lgende"/></w:pPr><w:r><w:t xml:space="preserve">Figure 2.4"#));

    let mut d = open("christophe");
    let n = d.model().unwrap().paragraphs.len();
    decide(&mut d, 105, Decision::Reject).unwrap();
    assert_eq!(d.model().unwrap().paragraphs.len(), n - 2, "la ligne insérée disparaît");

    let mut d = open("christophe");
    decide(&mut d, 110, Decision::Accept).unwrap();
    decide(&mut d, 112, Decision::Accept).unwrap();
    let last = d.model().unwrap().paragraphs.iter().find(|p| p.text.contains("Sirguey")).unwrap().text.clone();
    assert_eq!(last, "La correction topographique suit l'approche de Sirguey et al. Les petits glaciers demandent de la prudence.");
}

#[test]
fn tout_accepter_et_tout_refuser() {
    for decision in [Decision::Accept, Decision::Reject] {
        let mut d = open("christophe");
        let batch = decide_all(&mut d, decision, None).unwrap();
        assert!(batch.skipped.is_empty(), "{batch:?}");
        let mut again = reopen(&d);
        let m = again.model().unwrap();
        assert!(m.changes.is_empty(), "{decision:?} : {:?}", m.changes);
        assert_eq!(m.comments.len(), 2, "les commentaires survivent");
        // Les autres parties ne bougent pas.
        let (a, b) = (entries(&build("christophe")), entries(&d.to_bytes().unwrap()));
        for ((na, va), (nb, vb)) in a.iter().zip(&b) {
            assert_eq!(na, nb);
            if na != "word/document.xml" && na != "word/footnotes.xml" {
                assert_eq!(va, vb, "{na} a changé");
            }
        }
        if let Some(txt) = libreoffice_text(&d.to_bytes().unwrap()) {
            assert!(txt.contains("Fraction de glace"));
        }
    }
}

#[test]
fn tout_accepter_d_un_seul_auteur() {
    let mut d = open("christophe");
    let batch = decide_all(&mut d, Decision::Accept, Some("Quelqu'un d'autre")).unwrap();
    assert_eq!(batch.done, 0);
    assert!(!d.is_dirty());
}

#[test]
fn mise_en_page_resolue_comme_word() {
    let mut d = open("christophe");
    let m = d.model().unwrap();
    let page = m.page.as_ref().unwrap();
    assert_eq!((page.width, page.height, page.left, page.right), (612.0, 792.0, 72.0, 72.0));
    let ln = page.line_numbers.as_ref().unwrap();
    assert_eq!((ln.count_by, ln.start, ln.restart.as_str(), ln.size), (1, 1, "continuous", Some(12.0)));
    // Titre 1 : gras et 16 pt du style, espacements du style, interligne hérité de Normal.
    let t = &m.paragraphs[0].look;
    assert_eq!((t.b, t.size, t.before, t.after, t.line), (Some(true), Some(16.0), Some(12.0), Some(3.0), Some(1.5)));
    assert_eq!(t.font.as_deref(), Some("Times New Roman"));
    // Corps : 12 pt des valeurs par défaut, alignement direct.
    let b = &m.paragraphs[1].look;
    assert_eq!((b.size, b.b, b.align.as_deref(), b.after), (Some(12.0), None, Some("both"), Some(6.0)));
    // Légende : italique 10 pt, centrée.
    let c = m.paragraphs.iter().find(|p| p.style.as_deref() == Some("Lgende")).unwrap();
    assert_eq!((c.look.i, c.look.size, c.look.align.as_deref()), (Some(true), Some(10.0), Some("center")));
    // Le texte sans taille directe suit celle du paragraphe.
    assert!(m.paragraphs[2].segments.iter().filter(|s| s.kind == "text").all(|s| s.size.is_none()));
}
