//! Équations corrigées en LaTeX (`replace_math`) et collage riche
//! (`insert_runs`), en suivi et sans, sur la fixture synthétique.

mod common;

use atelier_docx::ops::{Op, apply};
use common::*;
use serde_json::json;

fn op(v: serde_json::Value) -> Op {
    serde_json::from_value(v).unwrap()
}

/// Le même paquet avec un autre document.xml.
fn with_document(bytes: &[u8], xml: &str) -> atelier_docx::Docx {
    use std::io::Write;
    let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, data) in entries(bytes) {
        out.start_file(name.as_str(), zip::write::SimpleFileOptions::default()).unwrap();
        out.write_all(if name == "word/document.xml" { xml.as_bytes() } else { &data }).unwrap();
    }
    atelier_docx::Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap()
}

fn eq_para(d: &mut atelier_docx::Docx) -> atelier_docx::model::Para {
    d.model().unwrap().paragraphs.into_iter().find(|p| p.segments.iter().any(|s| s.latex.is_some())).unwrap()
}

#[test]
fn corriger_une_equation_en_suivi_signe() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let p = eq_para(&mut d);
    let before = p.segments.iter().find(|s| s.latex.is_some()).unwrap().latex.clone().unwrap();
    assert_eq!(before, r"\alpha =0,356\rho_{1}");

    let r = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"\alpha = 0,356\,\rho_1 + 0,130\,\rho_3"})), true, &me).unwrap();
    let ids: Vec<u32> = serde_json::from_value(r["changes"].clone()).unwrap();
    assert_eq!(ids.len(), 2);
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let p = m.paragraphs.iter().find(|x| x.id == p.id).unwrap();
    let eqs: Vec<_> = p.segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.len(), 2, "l'ancienne barrée, la nouvelle ajoutée");
    assert_eq!(eqs[0].rev, Some("del"));
    assert_eq!(eqs[0].latex.as_deref(), Some(before.as_str()));
    assert_eq!(eqs[1].rev, Some("ins"));
    assert!(eqs[1].latex.as_deref().unwrap().contains(r"\rho_{3}"));
    assert!(eqs[1].whole, "sa propre équation reste effaçable d'un bloc");
    let mine: Vec<_> = m.changes.iter().filter(|c| c.author == "Thierry").map(|c| c.kind.as_str()).collect();
    assert_eq!(mine, ["del", "ins"]);
    // Le texte courant ne compte que la nouvelle.
    assert!(p.text.contains("α=0,356 ρ3") || p.text.contains("0,130"), "{}", p.text);

    // Corriger encore sa propre correction : réécrite sur place, sans nouveau suivi.
    let r = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"\alpha = 0,36\,\rho_1"})), true, &me).unwrap();
    assert_eq!(r["changes"], json!([]));
    let m = d.model().unwrap();
    assert_eq!(m.changes.iter().filter(|c| c.author == "Thierry").count(), 2);
    let p2 = m.paragraphs.iter().find(|x| x.id == p.id).unwrap();
    let ins: Vec<_> = p2.segments.iter().filter(|s| s.rev == Some("ins") && s.latex.is_some()).collect();
    assert_eq!(ins.len(), 1);
    assert!(ins[0].latex.as_deref().unwrap().contains("0,36") && !ins[0].latex.as_deref().unwrap().contains("0,130"), "{:?}", ins[0].latex);

    // Refuser l'ajout et la suppression rend l'équation d'origine.
    apply(&mut d, &op(json!({"op": "reject_all", "author": "Thierry"})), true, &me).unwrap();
    let mut d = reopen(&d);
    let p3 = eq_para(&mut d);
    let eqs: Vec<_> = p3.segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.len(), 1);
    assert_eq!((eqs[0].rev, eqs[0].latex.as_deref()), (None, Some(before.as_str())));

    // Accepter garde la nouvelle seule.
    apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p3.id, "index": 0, "latex": r"\frac{a}{b}"})), true, &me).unwrap();
    apply(&mut d, &op(json!({"op": "accept_all", "author": "Thierry"})), true, &me).unwrap();
    let mut d = reopen(&d);
    let p4 = eq_para(&mut d);
    let eqs: Vec<_> = p4.segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.len(), 1);
    assert_eq!((eqs[0].rev, eqs[0].latex.as_deref()), (None, Some(r"\frac{a}{b}")));
    let x = d.part("word/document.xml").unwrap().unwrap();
    assert!(!x.contains("α=0,356"), "l'ancienne a disparu");
}

#[test]
fn corriger_une_equation_sans_suivi() {
    let mut d = open("christophe");
    let p = eq_para(&mut d);
    let r = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"x^{2}"})), false, &sig("Thierry")).unwrap();
    assert_eq!(r["changes"], json!([]));
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    assert!(m.changes.iter().all(|c| c.author != "Thierry"));
    let p = m.paragraphs.iter().find(|x| x.id == p.id).unwrap();
    let eqs: Vec<_> = p.segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.len(), 1);
    assert_eq!((eqs[0].rev, eqs[0].latex.as_deref()), (None, Some("x^{2}")));
    let x = d.part("word/document.xml").unwrap().unwrap();
    assert!(!x.contains("<w:del ") || !x.contains("Thierry"));
}

#[test]
fn un_latex_qui_ne_se_convertit_pas_est_refuse_sans_toucher_au_fichier() {
    let mut d = open("christophe");
    let p = eq_para(&mut d);
    let xml = d.part("word/document.xml").unwrap().unwrap();
    for (bad, why) in [
        (r"\frac{a}{b", "accolade"),
        (r"\mathcal{L}", "commande inconnue"),
        (r"\left( x", "\\left sans \\right"),
        (r"\begin{array}{cc} a \end{array}", "environnement"),
        ("x^", "exposant"),
        ("   ", "vide"),
    ] {
        let e = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": bad})), true, &sig("Thierry"))
            .unwrap_err();
        assert!(e.0.contains("LaTeX non converti") && e.0.contains(why), "{bad} : {}", e.0);
    }
    let e = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 3, "latex": "x"})), true, &sig("Thierry")).unwrap_err();
    assert!(e.0.contains("introuvable"), "{}", e.0);
    assert_eq!(d.part("word/document.xml").unwrap().unwrap(), xml);
}

#[test]
fn une_equation_en_display_garde_son_cadre() {
    let mut d = open("christophe");
    // Une équation en display collée seule dans un paragraphe neuf.
    let r = apply(&mut d, &op(json!({"op": "insert_runs", "paragraph": "p13", "at": 0, "paragraphs": [[{"latex": r"E = mc^2"}], []]})), false, &sig("Thierry")).unwrap();
    assert_eq!(r["paragraph"], "p14");
    // Comme Word l'écrit : m:oMathPara > m:oMathParaPr + m:oMath.
    let src = d.part("word/document.xml").unwrap().unwrap();
    let open_tag = "<m:oMath xmlns:m=\"http://schemas.openxmlformats.org/officeDocument/2006/math\">";
    let a = src.find(open_tag).unwrap();
    let b = a + src[a..].find("</m:oMath>").unwrap() + "</m:oMath>".len();
    let wrapped = format!("{}<m:oMathPara><m:oMathParaPr><m:jc m:val=\"center\"/></m:oMathParaPr><m:oMath>{}</m:oMathPara>{}", &src[..a], &src[a + open_tag.len()..b], &src[b..]);
    let mut d = with_document(&d.to_bytes().unwrap(), &wrapped);
    let m = d.model().unwrap();
    let s = m.paragraphs[13].segments.iter().find(|s| s.latex.is_some()).unwrap().clone();
    assert!(s.display, "{:?}", s);
    apply(&mut d, &op(json!({"op": "replace_math", "paragraph": "p13", "index": 0, "latex": r"E = m c^{2} + \Delta"})), true, &sig("Thierry")).unwrap();
    let x = d.part("word/document.xml").unwrap().unwrap();
    assert!(x.contains("<w:ins ") && x.contains("<m:jc m:val=\"center\"/></m:oMathParaPr><m:oMath"), "{x}");
    let m = reopen(&d).model().unwrap();
    let eqs: Vec<_> = m.paragraphs[13].segments.iter().filter(|s| s.latex.is_some()).collect();
    assert!(eqs.iter().all(|s| s.display));
    assert_eq!(eqs.iter().map(|s| s.rev).collect::<Vec<_>>(), [Some("del"), Some("ins")]);
}

#[test]
fn coller_du_texte_mis_en_forme_et_des_equations() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let len = para_text(&mut d, "p4").chars().count();
    let r = apply(
        &mut d,
        &op(json!({"op": "insert_runs", "paragraph": "p4", "at": len, "paragraphs": [
            [{"text": " Voir "}, {"text": "Hall", "i": true}, {"text": " et la valeur "}, {"latex": "x^2"}, {"text": " m"}, {"text": "2", "sup": true}],
            [{"text": "CO", "b": true}, {"text": "2", "sub": true}, {"text": " souligné", "u": true}]
        ]})),
        true,
        &me,
    )
    .unwrap();
    assert_eq!(r["paragraph"], "p5");
    assert_eq!(r["at"], 12);
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let p3 = &m.paragraphs[4];
    assert!(p3.text.ends_with(" Voir Hall et la valeur x2 m2"), "{}", p3.text);
    let hall = p3.segments.iter().find(|s| s.text == "Hall").unwrap();
    assert!(hall.i && hall.rev == Some("ins"));
    assert!(p3.segments.iter().any(|s| s.text == "2" && s.sup && s.rev == Some("ins")));
    let eq = p3.segments.iter().find(|s| s.latex.is_some()).unwrap();
    assert_eq!((eq.latex.as_deref(), eq.rev), (Some("x^{2}"), Some("ins")));
    // Le texte collé ne prend pas l'italique du voisin, ni ne le perd.
    assert!(!p3.segments.iter().find(|s| s.text == " et la valeur ").unwrap().i);
    let p4 = &m.paragraphs[5];
    assert_eq!(p4.text, "CO2 souligné");
    assert!(p4.segments.iter().any(|s| s.text == "CO" && s.b));
    assert!(p4.segments.iter().any(|s| s.text == "2" && s.sub));
    assert!(p4.segments.iter().any(|s| s.text == " souligné" && s.u));
    // Une seule insertion suivie (plus la marque de paragraphe), toutes signées.
    assert!(m.changes.iter().filter(|c| c.author == "Thierry").all(|c| c.kind == "ins" || c.kind == "paragraph-ins"));
    // L'ancien paragraphe suivant reste intact après le nouveau.
    assert!(m.paragraphs[6].text.starts_with("L'albédo large bande"));

    // Son équation collée s'efface d'un bloc sans trace.
    let at = p3.text.chars().count() - " m2".chars().count() - "x2".chars().count();
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": "p4", "start": at, "end": at + 2, "with": ""})), true, &me).unwrap();
    let m = d.model().unwrap();
    assert!(m.paragraphs[4].segments.iter().all(|s| s.latex.is_none()));
}

#[test]
fn coller_sans_suivi_et_refuser_un_collage_dont_une_equation_est_fausse() {
    let mut d = open("christophe");
    let xml = d.part("word/document.xml").unwrap().unwrap();
    let e = apply(&mut d, &op(json!({"op": "insert_runs", "paragraph": "p2", "at": 0, "paragraphs": [[{"text": "a"}, {"latex": r"\frac{1}{"}]]})), true, &sig("Thierry")).unwrap_err();
    assert!(e.0.contains("équation 1 du collage"), "{}", e.0);
    assert_eq!(d.part("word/document.xml").unwrap().unwrap(), xml);

    apply(&mut d, &op(json!({"op": "insert_runs", "paragraph": "1A2B3C03", "at": 0, "paragraphs": [[{"text": "Avant ", "i": true}]]})), false, &sig("Thierry")).unwrap();
    let m = reopen(&d).model().unwrap();
    assert!(m.paragraphs[2].text.starts_with("Avant Le seuil"), "{}", m.paragraphs[2].text);
    assert!(m.paragraphs[2].segments[0].i);
    assert!(m.changes.iter().all(|c| c.author != "Thierry"));
}
