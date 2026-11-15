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
    assert!(!ids.is_empty());
    // Comme Word : les marques sont DANS l'équation, autour des m:r ajoutés ;
    // ce qui ne change pas (« α=0,356 », ρ₁) n'est pas touché.
    let x = d.part("word/document.xml").unwrap().unwrap();
    let eq = &x[x.find("<m:oMath").unwrap()..x.find("</m:oMath>").unwrap()];
    assert!(eq.contains("><m:r><m:t>α=0,356</m:t></m:r>"), "l'ancien run reste tel quel : {eq}");
    assert!(eq.contains("<w:ins ") && !eq.contains("<w:del "), "rien d'effacé : {eq}");
    assert!(eq.contains("<m:sSubPr><m:ctrlPr><w:ins "), "ρ₃ ajouté comme Word marque une structure : {eq}");
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let p = m.paragraphs.iter().find(|x| x.id == p.id).unwrap();
    let eqs: Vec<_> = p.segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.len(), 2, "l'ancienne version barrée, la nouvelle ajoutée");
    assert_eq!(eqs[0].rev, Some("del"));
    assert_eq!(eqs[0].latex.as_deref(), Some(before.as_str()));
    assert_eq!(eqs[1].rev, Some("ins"));
    assert!(eqs[1].latex.as_deref().unwrap().contains(r"\rho_{3}"), "{:?}", eqs[1].latex);
    let mine: Vec<_> = m.changes.iter().filter(|c| c.author == "Thierry").collect();
    assert_eq!(mine.len(), ids.len());
    assert!(mine.iter().all(|c| c.kind == "ins" && c.paragraph.as_deref() == Some(p.id.as_str())), "{mine:?}");
    // Le texte courant ne compte que la nouvelle.
    assert!(p.text.contains("0,130"), "{}", p.text);

    // Corriger encore sa propre correction : repartie de l'équation
    // d'origine, un seul geste en suivi.
    apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"\alpha = 0,36\,\rho_1"})), true, &me).unwrap();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let p2 = m.paragraphs.iter().find(|x| x.id == p.id).unwrap();
    let eqs: Vec<_> = p2.segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.len(), 2);
    assert_eq!(eqs[0].latex.as_deref(), Some(before.as_str()));
    let now = eqs[1].latex.as_deref().unwrap();
    assert!(now.contains("0,36") && !now.contains("0,130") && !now.contains("356"), "{now}");
    assert!(m.changes.iter().filter(|c| c.author == "Thierry").all(|c| c.date == m.changes.iter().find(|c| c.author == "Thierry").unwrap().date));

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

/// L'équation du p6 de la fixture remplacée par une équation écrite comme
/// Word l'écrit (polices Cambria Math, marques de fin d'argument).
fn with_word_equation(body: &str) -> atelier_docx::Docx {
    let d = open("christophe");
    let src = d.clone().part("word/document.xml").unwrap().unwrap();
    let a = src.find("<m:oMath>").unwrap();
    let b = src.find("</m:oMath>").unwrap() + "</m:oMath>".len();
    let xml = format!("{}<m:oMath>{body}</m:oMath>{}", &src[..a], &src[b..]);
    with_document(&d.to_bytes().unwrap(), &xml)
}

const M: &str = "http://schemas.openxmlformats.org/officeDocument/2006/math";

const CAMBRIA: &str = r#"<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>"#;

fn word_run(t: &str) -> String {
    format!("<m:r>{CAMBRIA}<m:t>{t}</m:t></m:r>")
}

/// `y_{rzt} ∼ Student-t` comme dans le modèle de la thèse (p65).
fn y_rzt() -> String {
    format!(
        "<m:sSub><m:sSubPr><m:ctrlPr>{CAMBRIA}</m:ctrlPr></m:sSubPr><m:e>{}</m:e><m:sub>{}</m:sub></m:sSub>{}",
        word_run("y"),
        word_run("rzt"),
        word_run("∼Student")
    )
}

fn eq_segments(d: &mut atelier_docx::Docx) -> Vec<atelier_docx::model::Segment> {
    let m = d.model().unwrap();
    m.paragraphs.into_iter().flat_map(|p| p.segments).filter(|s| s.latex.is_some()).collect()
}

#[test]
fn une_equation_de_word_corrigee_comme_dans_word() {
    let me = sig("Thierry");
    let mut d = with_word_equation(&y_rzt());
    let p = eq_para(&mut d);
    let m = d.model().unwrap();
    let line = atelier_docx::ops::outline(&m, 5, Some(6), 10_000);
    assert!(line.contains(r"{équation 1 : y_{rzt}\sim Student}"), "l'agent lit le LaTeX et le numéro : {line}");

    let r = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"\alpha_{rzt}\sim Student"})), true, &me).unwrap();
    let ids: Vec<u32> = serde_json::from_value(r["changes"].clone()).unwrap();
    assert_eq!(ids.len(), 2, "seul le y est barré, seul le α est ajouté : {r}");
    let x = d.part("word/document.xml").unwrap().unwrap();
    let eq = &x[x.find("<m:oMath").unwrap()..x.find("</m:oMath>").unwrap()];
    // Le y barré garde sa police ; le α ajouté prend celle de l'équation ; le reste ne bouge pas.
    assert!(eq.contains(&format!(r#"<m:e><w:del w:id="{}" w:author="Thierry""#, ids[0])), "{eq}");
    assert!(eq.contains(&format!("{CAMBRIA}<m:t xml:space=\"preserve\">y</m:t></m:r></w:del><w:ins ")), "{eq}");
    assert!(eq.contains(&format!("{CAMBRIA}<m:t xml:space=\"preserve\">α</m:t></m:r></w:ins></m:e>")), "{eq}");
    assert!(eq.contains(&format!("<m:sub>{}</m:sub>", word_run("rzt"))) && eq.contains(&word_run("∼Student")), "{eq}");
    assert!(eq.contains(&format!("<m:sSubPr><m:ctrlPr>{CAMBRIA}</m:ctrlPr></m:sSubPr>")), "la structure reste : {eq}");

    // Le panneau : l'ancienne version barrée, la nouvelle ajoutée ; les suivis disent ce qu'ils touchent.
    let mut d = reopen(&d);
    let eqs = eq_segments(&mut d);
    assert_eq!(eqs.iter().map(|s| (s.rev, s.latex.clone().unwrap())).collect::<Vec<_>>(), [(Some("del"), r"y_{rzt}\sim Student".to_string()), (Some("ins"), r"\alpha_{rzt}\sim Student".to_string())]);
    let m = d.model().unwrap();
    let mine: Vec<_> = m.changes.iter().filter(|c| ids.contains(&c.id)).map(|c| (c.kind.as_str(), c.text.as_str(), c.paragraph.as_deref())).collect();
    assert_eq!(mine, [("del", "y", Some(p.id.as_str())), ("ins", "α", Some(p.id.as_str()))]);
    assert!(m.paragraphs.iter().find(|x| x.id == p.id).unwrap().text.contains("αrzt∼Student"));
    let line = atelier_docx::ops::outline(&m, 5, Some(6), 10_000);
    assert!(line.contains(r"[-{équation : y_{rzt}\sim Student}-]") && line.contains(r"[+{équation 1 : \alpha_{rzt}\sim Student}+]"), "{line}");

    // Accepter l'un accepte le geste entier (l'équation est un seul objet dans le panneau).
    let mut accepted = d.clone();
    apply(&mut accepted, &op(json!({"op": "accept", "id": ids[1]})), true, &me).unwrap();
    let mut accepted = reopen(&accepted);
    let eqs = eq_segments(&mut accepted);
    assert_eq!(eqs.iter().map(|s| (s.rev, s.latex.clone().unwrap())).collect::<Vec<_>>(), [(None, r"\alpha_{rzt}\sim Student".to_string())]);
    let x = accepted.part("word/document.xml").unwrap().unwrap();
    assert!(!x[x.find("<m:oMath").unwrap()..x.find("</m:oMath>").unwrap()].contains("Thierry"));

    // Le paragraphe accepté d'un geste (une décision par suivi, en lot) : les
    // suivis déjà emportés par le geste sont sautés, sans erreur.
    let mut batch = d.clone();
    let ops: Vec<_> = ids.iter().map(|id| json!({"op": "accept", "id": id})).collect();
    apply(&mut batch, &op(json!({"op": "batch", "ops": ops})), true, &me).unwrap();
    assert_eq!(eq_segments(&mut reopen(&batch)).len(), 1);

    // Refuser rend l'équation de Word telle qu'elle était.
    let mut rejected = d.clone();
    apply(&mut rejected, &op(json!({"op": "reject", "id": ids[0]})), true, &me).unwrap();
    let x = rejected.part("word/document.xml").unwrap().unwrap();
    let eq = &x[x.find("<m:oMath").unwrap()..x.find("</m:oMath>").unwrap() + "</m:oMath>".len()];
    assert_eq!(eq.replace(r#" xml:space="preserve""#, "").replace(&format!(r#" xmlns:m="{M}""#), ""), format!("<m:oMath>{}</m:oMath>", y_rzt()));
}

#[test]
fn une_structure_ajoutee_se_refuse_et_une_structure_effacee_s_accepte_d_un_bloc() {
    let me = sig("Thierry");
    // τ_{za} ∼ HalfNormal → τ^{a}_{z} ∼ HalfNormal (p71) : la structure change de genre.
    let tau = format!(
        "<m:sSub><m:sSubPr><m:ctrlPr>{CAMBRIA}</m:ctrlPr></m:sSubPr><m:e>{}</m:e><m:sub>{}</m:sub></m:sSub>{}",
        word_run("τ"),
        word_run("za"),
        word_run("∼HalfNormal")
    );
    let mut d = with_word_equation(&tau);
    let p = eq_para(&mut d);
    let r = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"\tau_{z}^{a}\sim HalfNormal"})), true, &me).unwrap();
    let ids: Vec<u32> = serde_json::from_value(r["changes"].clone()).unwrap();
    let x = d.part("word/document.xml").unwrap().unwrap();
    let eq = &x[x.find("<m:oMath").unwrap()..x.find("</m:oMath>").unwrap()];
    // L'ancienne structure marquée effacée dans ses propriétés, sa police gardée.
    assert!(eq.contains(&format!(r#"<m:sSubPr><m:ctrlPr><w:del w:id="{}" w:author="Thierry""#, ids[0])) && eq.contains(&format!("{CAMBRIA}</w:del></m:ctrlPr>")), "{eq}");
    assert!(eq.contains("<m:sSubSupPr><m:ctrlPr><w:ins "), "{eq}");
    let m = reopen(&d).model().unwrap();
    assert!(atelier_docx::ops::outline(&m, 5, Some(6), 10_000).contains(r"{équation 1 : \tau_{z}^{a}\sim HalfNormal}"));

    // Refuser une seule marque : la structure ajoutée part en entier, l'ancienne revient.
    let mut rejected = d.clone();
    apply(&mut rejected, &op(json!({"op": "reject", "id": *ids.last().unwrap()})), true, &me).unwrap();
    let x = rejected.part("word/document.xml").unwrap().unwrap();
    let eq = &x[x.find("<m:oMath").unwrap()..x.find("</m:oMath>").unwrap() + "</m:oMath>".len()];
    assert_eq!(eq.replace(r#" xml:space="preserve""#, "").replace(&format!(r#" xmlns:m="{M}""#), ""), format!("<m:oMath>{tau}</m:oMath>"));

    // Accepter : l'ancienne structure part en entier, sans case vide.
    apply(&mut d, &op(json!({"op": "accept", "id": ids[0]})), true, &me).unwrap();
    let mut d = reopen(&d);
    assert_eq!(eq_segments(&mut d).iter().map(|s| (s.rev, s.latex.clone().unwrap())).collect::<Vec<_>>(), [(None, r"\tau_{z}^{a}\sim HalfNormal".to_string())]);
    let x = d.part("word/document.xml").unwrap().unwrap();
    let eq = &x[x.find("<m:oMath").unwrap()..x.find("</m:oMath>").unwrap()];
    assert!(!eq.contains("<m:sSub>") && !eq.contains("w:author"), "{eq}");
}

#[test]
fn l_equation_d_un_autre_auteur_en_suivi_attend_sa_decision() {
    let mut d = with_word_equation(&y_rzt());
    let p = eq_para(&mut d);
    apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"\alpha_{rzt}\sim Student"})), true, &sig("Christophe")).unwrap();
    let e = apply(&mut d, &op(json!({"op": "replace_math", "paragraph": p.id, "index": 0, "latex": r"\beta_{rzt}\sim Student"})), true, &sig("Thierry")).unwrap_err();
    assert!(e.0.contains("Christophe"), "{}", e.0);
}

#[test]
fn ajouter_une_equation_en_suivi_comme_word() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    // En ligne, à une position du p13 (« Un texte … »).
    let r = apply(&mut d, &op(json!({"op": "insert_math", "paragraph": "p13", "at": 9, "latex": r"a_{z}+\tau^{a}_{z}"})), true, &me).unwrap();
    let ids: Vec<u32> = serde_json::from_value(r["changes"].clone()).unwrap();
    assert!(ids.len() >= 4, "{r}");
    let x = d.part("word/document.xml").unwrap().unwrap();
    let eq = &x[x.rfind("<m:oMath").unwrap()..];
    let eq = &eq[..eq.find("</m:oMath>").unwrap()];
    assert!(eq.contains("<m:sSubPr><m:ctrlPr><w:ins ") && eq.matches("<m:r>").count() == eq.matches("Z\"><m:r>").count(), "chaque symbole et structure marqués : {eq}");
    let mut d2 = reopen(&d);
    let m = d2.model().unwrap();
    let p = &m.paragraphs[13];
    let eqs: Vec<_> = p.segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.iter().map(|s| (s.rev, s.latex.clone().unwrap())).collect::<Vec<_>>(), [(Some("ins"), r"a_{z}+\tau_{z}^{a}".to_string())], "rien de barré avant elle");
    assert!(atelier_docx::ops::outline(&m, 13, Some(14), 10_000).contains(r"[+{équation 1 : a_{z}+\tau_{z}^{a}}+]"));

    // Refuser : l'équation disparaît entière, sans case vide.
    let mut rejected = d2.clone();
    apply(&mut rejected, &op(json!({"op": "reject", "id": ids[0]})), true, &me).unwrap();
    let x = rejected.part("word/document.xml").unwrap().unwrap();
    assert_eq!(x.matches("<m:oMath").count(), 1, "seule celle du p5 reste");
    // Accepter : une équation ordinaire.
    apply(&mut d2, &op(json!({"op": "accept", "id": ids[2]})), true, &me).unwrap();
    let mut d2 = reopen(&d2);
    let m = d2.model().unwrap();
    let eqs: Vec<_> = m.paragraphs[13].segments.iter().filter(|s| s.latex.is_some()).collect();
    assert_eq!(eqs.iter().map(|s| (s.rev, s.latex.clone().unwrap())).collect::<Vec<_>>(), [(None, r"a_{z}+\tau_{z}^{a}".to_string())]);

    // Seule sur sa ligne, centrée, dans un paragraphe neuf après le p13.
    let r = apply(&mut d2, &op(json!({"op": "insert_math", "paragraph": "p13", "latex": r"\frac{a}{b}", "display": true})), true, &me).unwrap();
    assert_eq!(r["paragraph"], "p14", "{r}");
    let mut d3 = reopen(&d2);
    let m = d3.model().unwrap();
    assert_eq!(m.paragraphs.len(), 15);
    let s = m.paragraphs[14].segments.iter().find(|s| s.latex.is_some()).unwrap();
    assert!(s.display && s.rev == Some("ins") && s.latex.as_deref() == Some(r"\frac{a}{b}"), "{s:?}");
    assert!(m.changes.iter().any(|c| c.kind == "paragraph-ins" && c.author == "Thierry"));
    // Tout refuser : ni équation ni paragraphe neuf.
    apply(&mut d3, &op(json!({"op": "reject_all", "author": "Thierry"})), true, &me).unwrap();
    let m = reopen(&d3).model().unwrap();
    assert_eq!(m.paragraphs.len(), 14);
    let x = d3.part("word/document.xml").unwrap().unwrap();
    assert!(!x.contains("oMathPara"), "{}", &x[x.len() - 2000..]);
}
