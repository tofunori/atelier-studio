mod common;

use atelier_docx::format::{ParaProps, RunProps, format_paragraph, format_range, format_text, styles};
use atelier_docx::review::{Decision, decide, decide_all};
use atelier_docx::{edit, structure};
use common::*;

#[test]
fn la_frappe_prolonge_son_propre_ajout_sans_nouveau_suivi() {
    let mut d = open("christophe");
    let me = sig("Thierry");
    edit::insert(&mut d, "p4", 0, "E", true, &me).unwrap();
    edit::insert(&mut d, "p4", 1, "n", true, &me).unwrap();
    edit::insert(&mut d, "p4", 2, "fin, ", true, &me).unwrap();
    // Corriger une faute dans son propre ajout : pas de suppression en suivi.
    edit::replace(&mut d, "p4", "Enfin", None, "Enfiin", true, &me).unwrap();
    edit::replace(&mut d, "p4", "fiin", None, "fin", true, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[4].text, "Enfin, l'écart atteignant 0,04 en fin d'été.");
    let mine: Vec<_> = m.changes.iter().filter(|c| c.author == "Thierry").collect();
    assert_eq!(mine.len(), 1, "un seul ajout : {mine:?}");
    assert_eq!((mine[0].kind.as_str(), mine[0].text.as_str()), ("ins", "Enfin, "));
    // L'ajout de Christophe, lui, reste intouchable par Thierry.
    let e = edit::replace(&mut d, "p1", "On", None, "Puis on", true, &me).unwrap_err();
    assert!(e.0.contains("suivi"));
}

#[test]
fn entree_puis_retour_arriere_en_suivi_et_sans_suivi() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let n = d.model().unwrap().paragraphs.len();
    structure::split(&mut d, "p2", 26, true, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), n + 1);
    assert_eq!(m.paragraphs[2].text, "Le seuil de 0,6 retenu ici");
    assert_eq!(m.paragraphs[3].text, " offre un compromis entre le nombre de pixels retenus et la pureté du signal glaciaire.");
    assert_eq!(m.changes.iter().find(|c| c.author == "Thierry").unwrap().kind, "paragraph-ins");
    assert_eq!(m.paragraphs[3].para_id.as_deref(), Some("1A2B3C03"), "la seconde moitié garde l'identité");
    assert_ne!(m.paragraphs[2].para_id.as_deref(), Some("1A2B3C03"));
    assert_eq!(m.comments[0].quote, "Le seuil de 0,6 retenu ici", "le commentaire suit son passage");
    // Retour arrière sur sa propre Entrée : défait, sans suivi.
    structure::join(&mut d, "p3", true, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), n);
    assert!(m.changes.iter().all(|c| c.author != "Thierry"));
    assert_eq!(m.paragraphs[2].text, "Le seuil de 0,6 retenu ici offre un compromis entre le nombre de pixels retenus et la pureté du signal glaciaire.");

    // Joindre en suivi deux paragraphes d'origine : marque supprimée, puis acceptée.
    structure::join(&mut d, "p5", true, &me).unwrap();
    let m = d.model().unwrap();
    let del = m.changes.iter().find(|c| c.author == "Thierry").unwrap();
    assert_eq!(del.kind, "paragraph-del");
    let id = del.id;
    decide(&mut d, id, Decision::Accept).unwrap();
    assert!(d.model().unwrap().paragraphs[4].text.ends_with("en fin d'été.L'albédo large bande suit α=0,356ρ1 (Liang, 2001) ; détails sur le site du NSIDC."));
    if let Some(txt) = libreoffice_text(&d.to_bytes().unwrap()) {
        assert!(txt.contains("Le seuil de 0,6 retenu ici offre"));
    }
}

#[test]
fn entree_en_fin_de_titre_donne_un_paragraphe_normal() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let len = para_text(&mut d, "p0").chars().count();
    structure::split(&mut d, "p0", len, false, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!((m.paragraphs[0].heading, m.paragraphs[1].heading), (Some(1), None));
    assert_eq!(m.paragraphs[1].text, "");
    edit::insert(&mut d, "p1", 0, "Nouveau texte.", false, &me).unwrap();
    assert_eq!(para_text(&mut d, "p1"), "Nouveau texte.");
    // Défaire l'Entrée rend le titre intact.
    let mut d = open("christophe");
    structure::split(&mut d, "p0", len, true, &me).unwrap();
    structure::join(&mut d, "p1", true, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!((m.paragraphs[0].heading, m.paragraphs[0].text.as_str()), (Some(1), "2.2 Fraction de glace et filtrage des pixels"));
}

#[test]
fn mise_en_forme_des_caracteres_en_suivi() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    format_text(&mut d, "p2", "compromis", None, &RunProps { b: Some(true), i: Some(true), ..Default::default() }, true, &me).unwrap();
    let m = d.model().unwrap();
    let seg = m.paragraphs[2].segments.iter().find(|s| s.text == "compromis").unwrap();
    assert!(seg.b && seg.i);
    assert!(m.changes.iter().any(|c| c.author == "Thierry" && c.kind == "format"));
    // Refuser rend le texte d'origine.
    let id = m.changes.iter().find(|c| c.author == "Thierry").unwrap().id;
    decide(&mut d, id, Decision::Reject).unwrap();
    let m = d.model().unwrap();
    assert!(m.paragraphs[2].segments.iter().all(|s| !s.b && !s.i));

    // Police, taille, exposant, sans suivi ; ordre du schéma respecté.
    let n = para_text(&mut d, "p4").chars().count();
    format_range(&mut d, "p4", 0, n, &RunProps { font: Some("Arial".into()), size: Some(11.0), sup: Some(true), u: Some(true), ..Default::default() }, false, &me).unwrap();
    assert!(
        d.document_xml().contains(r#"<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:u w:val="single"/><w:vertAlign w:val="superscript"/><w:rPrChange w:id="104""#),
        "ordre du schéma CT_RPr, ancienne mise en forme de Christophe gardée"
    );
    let m = d.model().unwrap();
    assert!(m.paragraphs[4].segments.iter().filter(|s| s.kind == "text").all(|s| s.sup && s.font.as_deref() == Some("Arial") && s.size == Some(11.0)));
    // La mise en forme de Christophe (rPrChange) est conservée sur « 0,04 ».
    assert!(d.document_xml().contains("w:id=\"104\""));
    // Une citation Zotero n'est pas reformatée : elle est comptée à part.
    let r = format_range(&mut d, "p1", 0, 100, &RunProps { b: Some(true), ..Default::default() }, false, &me).unwrap();
    assert_eq!(r.skipped, 1);
}

#[test]
fn style_et_alignement_de_paragraphe() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let names: Vec<String> = styles(&mut d).unwrap().into_iter().map(|s| s.id).collect();
    assert!(names.contains(&"Titre2".to_string()) && names.contains(&"Normal".to_string()));
    format_paragraph(&mut d, "p2", &ParaProps { style: Some("Titre2".into()), align: Some("center".into()) }, true, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!((m.paragraphs[2].heading, m.paragraphs[2].align.as_deref()), (Some(2), Some("center")));
    assert!(d.document_xml().contains("<w:pPr><w:pStyle w:val=\"Titre2\"/><w:jc w:val=\"center\"/><w:pPrChange"));
    format_paragraph(&mut d, "p1", &ParaProps { align: Some("right".into()), ..Default::default() }, false, &me).unwrap();
    assert_eq!(d.model().unwrap().paragraphs[1].align.as_deref(), Some("right"));
    assert!(format_paragraph(&mut d, "p1", &ParaProps { style: Some("Inexistant".into()), ..Default::default() }, false, &me).is_err());
    let batch = decide_all(&mut d, Decision::Reject, Some("Thierry")).unwrap();
    assert_eq!(batch.done, 1);
    assert_eq!(d.model().unwrap().paragraphs[2].heading, None);
    if let Some(txt) = libreoffice_text(&d.to_bytes().unwrap()) {
        assert!(txt.contains("compromis"));
    }
}
