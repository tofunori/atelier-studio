//! Copie corrigée : les commentaires doivent être lisibles dans le contenu
//! de la page (marge à droite, quelle que soit la rotation), rester des
//! annotations PDF signées, et remplacer les commentaires que le PDF portait
//! déjà au lieu de s'y ajouter.

use atelier_pdf::corrige::MARGIN;
use pdfium_render::prelude::*;
use std::path::Path;
use std::process::Command;
use unicode_normalization::UnicodeNormalization;

/** Texte relu par PDFium, sans accents ni espaces doubles : selon la police
 *  de la machine (Arial sur macOS, DejaVu sous Linux), « é » peut revenir
 *  décomposé ou en glyphe de base suivi de l'accent. */
fn fold(text: &str) -> String {
    let bare: String = text.nfd().filter(|c| !('\u{300}'..='\u{36f}').contains(c) && *c != '\u{b4}' && *c != '`').collect();
    bare.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn pdfium() -> Option<Pdfium> {
    if !atelier_pdf::engine::library_candidates().iter().any(|p| p.is_file()) {
        assert!(std::env::var_os("CI").is_none(), "libpdfium absente en CI : lancer scripts/fetch-pdfium.sh");
        eprintln!("libpdfium absente : test sauté (scripts/fetch-pdfium.sh)");
        return None;
    }
    Some(atelier_pdf::engine::bind().expect("PDFium"))
}

/// Deux pages A4 : la première droite, la seconde tournée de 90° ; un
/// surlignage déjà commenté (comme une copie annotée ailleurs) sur la première.
fn student_copy(pdfium: &Pdfium, path: &Path) {
    let mut doc = pdfium.create_new_pdf().unwrap();
    let font = doc.fonts_mut().helvetica();
    for rotation in [PdfPageRenderRotation::None, PdfPageRenderRotation::Degrees90] {
        let mut page = doc.pages_mut().create_page_at_end(PdfPagePaperSize::a4()).unwrap();
        page.set_rotation(rotation);
        page.objects_mut()
            .create_text_object(PdfPoints::new(72.0), PdfPoints::new(700.0), "Le taux de fonte est de 794 mm.", font, PdfPoints::new(12.0))
            .unwrap();
    }
    {
        let mut page = doc.pages().get(0).unwrap();
        let mut old = page.annotations_mut().create_highlight_annotation().unwrap();
        old.set_contents("ancien commentaire caché").unwrap();
        old.set_creator("Thierry Laurent").unwrap();
        old.set_bounds(PdfRect::new_from_values(698.0, 72.0, 712.0, 200.0)).unwrap();
    }
    doc.save_to_file(path).unwrap();
}

fn run(src: &Path, out: &Path, json: &Path) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_atelier-pdf"))
        .arg("corrige")
        .arg(src)
        .arg(out)
        .arg(json)
        .output()
        .expect("atelier-pdf lancé")
}

#[test]
fn corrected_copy_prints_comments_in_a_margin_and_keeps_signed_annotations() {
    let Some(pdfium) = pdfium() else { return };
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("TP6_Eleve.pdf");
    student_copy(&pdfium, &src);
    let json = dir.path().join("commentaires.json");
    std::fs::write(
        &json,
        r#"{"comments":[
            {"page":1,"rects":[[0.12,0.15,0.3,0.02]],"kind":"hl","color":"rgba(255,213,74,.4)","author":"Thierry Laurent",
             "text":"Unité manquante : 794 mm w.e.","replies":[{"author":"Élève","text":"Corrigé, merci."}],"at":1763000000000},
            {"page":2,"rects":[[0.2,0.4,0.25,0.03]],"kind":"ul","color":"rgba(90,140,220,1)","author":"Thierry Laurent","text":"Arrondir à 10⁻³ près."},
            {"page":2,"rects":[],"kind":"note","author":"Thierry Laurent","text":"","replies":[]}
        ]}"#,
    )
    .unwrap();
    let out = atelier_pdf::corrige::output_path(&src);
    assert!(out.ends_with("TP6_Eleve_corrigé.pdf"));
    let result = run(&src, &out, &json);
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    assert_eq!(String::from_utf8_lossy(&result.stdout).trim(), r#"{"comments":2,"pages":2,"removed":1}"#);

    let original = pdfium.load_pdf_from_file(&src, None).unwrap();
    let copy = pdfium.load_pdf_from_file(&out, None).unwrap();
    for i in 0..2 {
        let (before, after) = (original.pages().get(i).unwrap(), copy.pages().get(i).unwrap());
        // la page s'élargit vers la droite de l'écran, même tournée
        assert!((after.width().value - before.width().value - MARGIN).abs() < 0.5, "page {i} : {} → {}", before.width().value, after.width().value);
        assert!((after.height().value - before.height().value).abs() < 0.5);
    }

    if let Some(keep) = std::env::var_os("CORRIGE_KEEP") {
        std::fs::copy(&out, keep).unwrap();
    }
    let first = copy.pages().get(0).unwrap();
    let text = fold(&first.text().unwrap().all());
    assert!(text.contains(&fold("Unité manquante")), "texte de la marge absent : {text:?}");
    assert!(text.contains(&fold("Corrigé, merci.")), "{text:?}");
    assert!(text.contains("Thierry Laurent"));
    // l'ancien commentaire caché est remplacé, pas doublé
    let notes: Vec<_> = first.annotations().iter().filter(|a| a.annotation_type() == PdfPageAnnotationType::Highlight).collect();
    assert_eq!(notes.len(), 1);
    assert_eq!(notes[0].contents().as_deref(), Some("Unité manquante : 794 mm w.e.\n\nÉlève : Corrigé, merci."));
    assert_eq!(notes[0].creator().as_deref(), Some("Thierry Laurent"));
    assert!(notes[0].creation_date().is_some());

    let second = copy.pages().get(1).unwrap();
    // (`all()` borne au format non tourné : on lit les caractères un à un)
    let all: String = second.text().unwrap().chars().iter().filter_map(|c| c.unicode_char()).collect();
    assert!(fold(&all).contains(&fold("Arrondir à 10")), "{all:?}");
    let under: Vec<_> = second.annotations().iter().filter(|a| a.annotation_type() == PdfPageAnnotationType::Underline).collect();
    assert_eq!(under.len(), 1);
    // le texte de la marge est horizontal à l'écran : sur la page tournée de
    // 90°, il court le long de y dans l'espace de la page
    let page_text = second.text().unwrap();
    let chars = page_text.chars();
    let a = chars.iter().find(|c| c.unicode_char() == Some('A')).expect("« Arrondir » dans la marge");
    let bounds = a.loose_bounds().unwrap();
    assert!(bounds.top().value > 841.0, "marge au-dessus de la page d'origine en y : {bounds:?}");

    // une copie corrigée ne se recorrige pas (sa marge doublerait)
    let again = run(&out, &dir.path().join("x.pdf"), &json);
    assert!(!again.status.success());
    assert!(String::from_utf8_lossy(&again.stderr).contains("déjà une copie corrigée"));
}
