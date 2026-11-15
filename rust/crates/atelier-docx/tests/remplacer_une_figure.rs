//! Remplacer ou effacer une figure (Thierry, 2026-11-15 : l'agent posait la
//! nouvelle figure à côté de l'ancienne et lui demandait d'effacer
//! l'ancienne à la main, dans un paragraphe au mauvais style).

mod common;
use atelier_docx::ops::{Op, apply, outline};
use common::{build, entries, open, reopen, sig};
use serde_json::json;

fn op(v: serde_json::Value) -> Op {
    serde_json::from_value(v).unwrap()
}

/// La fixture avec un autre document.xml.
fn with_document(xml: &str) -> atelier_docx::Docx {
    use std::io::Write;
    let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, data) in entries(&build("christophe")) {
        out.start_file(name.as_str(), zip::write::SimpleFileOptions::default()).unwrap();
        out.write_all(if name == "word/document.xml" { xml.as_bytes() } else { &data }).unwrap();
    }
    atelier_docx::Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap()
}

/// PNG minimal (en-tête seulement) de `w`×`h` px.
fn png(w: u32, h: u32) -> Vec<u8> {
    let mut b = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    b.extend_from_slice(&w.to_be_bytes());
    b.extend_from_slice(&h.to_be_bytes());
    b.extend_from_slice(&[8, 6, 0, 0, 0]);
    b
}

/// Le paragraphe de la figure de la fixture (« Figure 2.4 », 96×96 px).
fn figure_paragraph(d: &mut atelier_docx::Docx) -> String {
    let m = d.model().unwrap();
    m.paragraphs.iter().find(|p| p.segments.iter().any(|s| s.media.is_some())).unwrap().id.clone()
}

fn replace(paragraph: &str, image: usize, bytes: Vec<u8>, alt: &str) -> Op {
    let mut o = op(json!({"op": "replace_image", "paragraph": paragraph, "index": image, "path": "figures/nouvelle.png", "alt": alt}));
    o.load_images(&mut |p| {
        assert_eq!(p, "figures/nouvelle.png");
        Ok(bytes.clone())
    })
    .unwrap();
    o
}

#[test]
fn la_nouvelle_figure_prend_la_place_et_la_largeur_de_l_ancienne_en_suivi() {
    let claude = sig("Claude");
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    let style_before = d.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().style.clone();

    // Sans figure chargée : refus.
    let unloaded = op(json!({"op": "replace_image", "paragraph": p, "index": 0, "path": "f.png"}));
    assert!(apply(&mut d, &unloaded, true, &claude).is_err());

    let r = apply(&mut d, &replace(&p, 0, png(1200, 600), ""), true, &claude).unwrap();
    let rel = r["id"].as_str().unwrap().to_string();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let para = m.paragraphs.iter().find(|x| x.id == p).unwrap();
    // Même paragraphe, même style : rien à reprendre à la main.
    assert_eq!(para.style, style_before);
    let figs: Vec<_> = para.segments.iter().filter(|s| s.media.is_some()).collect();
    assert_eq!(figs.len(), 2, "l'ancienne barrée, la nouvelle ajoutée");
    assert_eq!((figs[0].media.as_deref(), figs[0].rev), (Some("rId5"), Some("del")));
    assert_eq!((figs[1].media.as_deref(), figs[1].rev), (Some(rel.as_str()), Some("ins")));
    // Largeur de l'ancienne (96 px), proportions de la nouvelle (2:1) ;
    // texte de remplacement repris.
    assert_eq!((figs[1].width, figs[1].height, figs[1].alt.as_deref()), (Some(96), Some(48), Some("Figure 2.4")));
    // Deux suivis de Claude : la suppression et l'ajout.
    let mine: Vec<_> = m.changes.iter().filter(|c| c.author == "Claude").collect();
    assert_eq!(mine.iter().map(|c| c.kind.as_str()).collect::<Vec<_>>(), ["del", "ins"], "{mine:?}");
    // L'agent lit l'ancienne barrée, sans numéro, et la nouvelle en image 1.
    let plan = outline(&m, 0, None, 200_000);
    let line = plan.lines().find(|l| l.starts_with(&format!("{p} "))).unwrap();
    assert!(line.contains("[-{image : Figure 2.4}-]#") && line.contains("[+{image 1 : Figure 2.4}+]#"), "{line}");
    let (bytes, mime) = atelier_docx::objects::media(&mut d, &p, &rel).unwrap().unwrap();
    assert_eq!((bytes, mime), (png(1200, 600), "image/png"));

    // Accepter : seule la nouvelle reste.
    let mut accepted = d.clone();
    apply(&mut accepted, &op(json!({"op": "accept_all", "author": "Claude"})), true, &claude).unwrap();
    let m = reopen(&accepted).model().unwrap();
    let figs: Vec<_> = m.paragraphs.iter().find(|x| x.id == p).unwrap().segments.iter().filter(|s| s.media.is_some()).cloned().collect();
    assert_eq!(figs.len(), 1);
    assert_eq!((figs[0].media.as_deref(), figs[0].rev), (Some(rel.as_str()), None));
    // Refuser : l'ancienne revient, seule.
    apply(&mut d, &op(json!({"op": "reject_all", "author": "Claude"})), true, &claude).unwrap();
    let m = reopen(&d).model().unwrap();
    let figs: Vec<_> = m.paragraphs.iter().find(|x| x.id == p).unwrap().segments.iter().filter(|s| s.media.is_some()).cloned().collect();
    assert_eq!(figs.len(), 1);
    assert_eq!((figs[0].media.as_deref(), figs[0].rev), (Some("rId5"), None));
}

#[test]
fn texte_de_remplacement_neuf_et_largeur_bornee_au_texte() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    // L'ancienne plus large que le texte (cadre de 10 po) : la nouvelle s'arrête à la marge.
    let xml = d.part("word/document.xml").unwrap().unwrap().replace(r#"cx="914400" cy="914400""#, r#"cx="9144000" cy="914400""#);
    let mut d = with_document(&xml);
    apply(&mut d, &replace(&p, 0, png(400, 400), "Albédo 2019, barres"), false, &me).unwrap();
    let m = reopen(&d).model().unwrap();
    let figs: Vec<_> = m.paragraphs.iter().find(|x| x.id == p).unwrap().segments.iter().filter(|s| s.media.is_some()).cloned().collect();
    // Hors suivi : l'ancienne n'est plus là.
    assert_eq!(figs.len(), 1);
    assert_eq!((figs[0].width, figs[0].height, figs[0].alt.as_deref()), (Some(624), Some(624), Some("Albédo 2019, barres")));
}

#[test]
fn effacer_une_figure_en_suivi_et_numeros_hors_limites() {
    let (claude, me) = (sig("Claude"), sig("Thierry"));
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    let e = apply(&mut d, &op(json!({"op": "delete_image", "paragraph": p, "index": 1})), true, &claude).unwrap_err();
    assert!(e.0.contains("n'a que 1 figure"), "{}", e.0);
    let e = apply(&mut d, &op(json!({"op": "delete_image", "paragraph": "p0", "index": 0})), true, &claude).unwrap_err();
    assert!(e.0.contains("aucune figure dans p0"), "{}", e.0);

    apply(&mut d, &op(json!({"op": "delete_image", "paragraph": p, "index": 0})), true, &claude).unwrap();
    let m = reopen(&d).model().unwrap();
    let del = m.changes.iter().find(|c| c.author == "Claude" && c.kind == "del").unwrap().id;
    assert!(d.part("word/document.xml").unwrap().unwrap().contains("<w:drawing"), "barrée, pas encore partie");
    // Plus aucune figure vivante dans le paragraphe.
    assert!(apply(&mut d, &op(json!({"op": "delete_image", "paragraph": p, "index": 0})), true, &claude).is_err());
    apply(&mut d, &op(json!({"op": "accept", "id": del})), true, &me).unwrap();
    assert!(!d.part("word/document.xml").unwrap().unwrap().contains("<w:drawing"));
}

#[test]
fn remplacer_sa_propre_figure_toute_neuve_ne_laisse_pas_de_trace() {
    let claude = sig("Claude");
    let mut d = open("christophe");
    let mut o = op(json!({"op": "insert_image", "paragraph": "p2", "at": 0, "path": "a.png"}));
    o.load_images(&mut |_| Ok(png(10, 10))).unwrap();
    apply(&mut d, &o, true, &claude).unwrap();
    let before = d.model().unwrap().changes.len();
    apply(&mut d, &replace("p2", 0, png(20, 10), ""), true, &claude).unwrap();
    let m = reopen(&d).model().unwrap();
    // Son propre ajout est remplacé en place : toujours un seul suivi.
    assert_eq!(m.changes.len(), before);
    let figs: Vec<_> = m.paragraphs[2].segments.iter().filter(|s| s.media.is_some()).collect();
    assert_eq!(figs.len(), 1);
    assert_eq!((figs[0].rev, figs[0].width, figs[0].height), (Some("ins"), Some(10), Some(5)));
    // Celle d'un autre auteur, encore en suivi : on refuse son ajout d'abord.
    let e = apply(&mut d, &replace("p2", 0, png(20, 10), ""), true, &sig("Thierry")).unwrap_err();
    assert!(e.0.contains("ajouté en suivi par Claude"), "{}", e.0);
}

#[test]
fn une_figure_rangee_dans_un_contenu_alternatif_se_remplace_aussi() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    // Image enveloppée comme Word le fait pour une figure avec effets (mc:AlternateContent).
    let xml = d.part("word/document.xml").unwrap().unwrap();
    let start = xml.find("<w:drawing>").unwrap();
    let end = xml.find("</w:drawing>").unwrap() + "</w:drawing>".len();
    let drawing = xml[start..end].to_string();
    let wrapped = format!(
        r#"<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><mc:Choice Requires="wps">{drawing}</mc:Choice><mc:Fallback>{drawing}</mc:Fallback></mc:AlternateContent>"#
    );
    let mut d = with_document(&format!("{}{wrapped}{}", &xml[..start], &xml[end..]));
    let plan = outline(&d.model().unwrap(), 0, None, 200_000);
    assert!(plan.lines().any(|l| l.starts_with(&format!("{p} ")) && l.contains("{image 1 : Figure 2.4}")), "{plan}");
    apply(&mut d, &replace(&p, 0, png(100, 50), ""), true, &me).unwrap();
    let x = reopen(&d).part("word/document.xml").unwrap().unwrap();
    // Le run entier (contenu alternatif compris) part dans la suppression.
    assert!(x.contains(r#"w:author="Thierry" w:date="2026-10-19T15:00:00Z"><w:r><mc:AlternateContent"#), "{x}");
    let m = reopen(&d).model().unwrap();
    let figs: Vec<_> = m.paragraphs.iter().find(|x| x.id == p).unwrap().segments.iter().filter(|s| s.media.is_some()).cloned().collect();
    assert_eq!(figs.iter().map(|s| s.rev).collect::<Vec<_>>(), [Some("del"), Some("ins")]);
}
