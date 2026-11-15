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

/// Le document de la fixture où le run de la figure devient `wrap(run)`.
fn with_figure_run(d: &mut atelier_docx::Docx, wrap: impl Fn(&str, &str) -> String) -> atelier_docx::Docx {
    let xml = d.part("word/document.xml").unwrap().unwrap();
    let start = xml.find("<w:drawing>").unwrap();
    let end = xml.find("</w:drawing>").unwrap() + "</w:drawing>".len();
    let run_start = xml[..start].rfind("<w:r>").unwrap();
    let run_end = end + "</w:r>".len();
    assert_eq!(&xml[end..run_end], "</w:r>");
    with_document(&format!("{}{}{}", &xml[..run_start], wrap(&xml[run_start..run_end], &xml[start..end]), &xml[run_end..]))
}

fn figures_of(d: &atelier_docx::Docx, p: &str) -> Vec<(Option<String>, Option<&'static str>)> {
    let m = reopen(d).model().unwrap();
    m.paragraphs.iter().find(|x| x.id == p).unwrap().segments.iter().filter(|s| s.media.is_some()).map(|s| (s.media.clone(), s.rev)).collect()
}

#[test]
fn une_figure_en_haut_de_page_et_commentee_se_remplace_et_garde_son_commentaire() {
    // Thierry, 2026-11-15 (revCK) : la figure commentée par Christophe était
    // refusée. Word glisse dans son run la marque de saut de page rendue et,
    // ici, une espace et une tabulation ; le commentaire l'entoure.
    let (claude, me) = (sig("Claude"), sig("Thierry"));
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    let mut d = with_figure_run(&mut d, |_, drawing| {
        format!(
            r#"<w:commentRangeStart w:id="90"/><w:r><w:rPr><w:noProof/></w:rPr><w:lastRenderedPageBreak/><w:t xml:space="preserve">avant </w:t>{drawing}<w:tab/><w:t>après</w:t></w:r><w:commentRangeEnd w:id="90"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="90"/></w:r>"#
        )
    });
    let r = apply(&mut d, &replace(&p, 0, png(200, 100), ""), true, &claude).unwrap();
    let rel = r["id"].as_str().unwrap().to_string();
    assert_eq!(figures_of(&d, &p), [(Some("rId5".into()), Some("del")), (Some(rel.clone()), Some("ins"))]);
    let x = reopen(&d).part("word/document.xml").unwrap().unwrap();
    // Le texte autour reste, avec la même mise en forme ; la marque de rendu aussi.
    let text: String = reopen(&d).model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().segments.iter().filter(|s| s.media.is_none() && s.rev.is_none()).map(|s| s.text.clone()).collect();
    assert_eq!(text, "avant \taprès");
    assert!(x.contains(r#"<w:r><w:rPr><w:noProof/></w:rPr><w:lastRenderedPageBreak/><w:t xml:space="preserve">avant </w:t></w:r>"#), "{x}");
    // Ancienne et nouvelle entre les bornes du commentaire de Christophe.
    let inside = |x: &str, what: &str| {
        let (a, b) = (x.find(r#"<w:commentRangeStart w:id="90"/>"#).unwrap(), x.find(r#"<w:commentRangeEnd w:id="90"/>"#).unwrap());
        x.find(what).is_some_and(|i| a < i && i < b)
    };
    assert!(inside(&x, r#"r:embed="rId5""#) && inside(&x, &format!(r#"r:embed="{rel}""#)), "{x}");
    // Une fois accepté, le commentaire tient sur la nouvelle.
    apply(&mut d, &op(json!({"op": "accept_all", "author": "Claude"})), true, &me).unwrap();
    let x = reopen(&d).part("word/document.xml").unwrap().unwrap();
    assert!(!x.contains(r#"r:embed="rId5""#) && inside(&x, &format!(r#"r:embed="{rel}""#)), "{x}");
    assert_eq!(figures_of(&d, &p), [(Some(rel), None)]);
}

#[test]
fn une_figure_seule_avec_la_marque_de_saut_de_page_s_efface_sans_toucher_au_run() {
    let claude = sig("Claude");
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    let mut d = with_figure_run(&mut d, |_, drawing| format!("<w:r><w:lastRenderedPageBreak/>{drawing}</w:r>"));
    apply(&mut d, &op(json!({"op": "delete_image", "paragraph": p, "index": 0})), true, &claude).unwrap();
    assert_eq!(figures_of(&d, &p), [(Some("rId5".into()), Some("del"))]);
}

#[test]
fn une_figure_d_un_champ_includepicture_se_remplace_avec_son_champ() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    let field = |drawing: &str| {
        format!(
            r#"<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> INCLUDEPICTURE "figures/albedo.png" \* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r>{drawing}</w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>"#
        )
    };
    let mut d = with_figure_run(&mut d, |_, drawing| field(drawing));
    apply(&mut d, &replace(&p, 0, png(100, 50), ""), true, &me).unwrap();
    let x = reopen(&d).part("word/document.xml").unwrap().unwrap();
    // Le champ entier part barré (sinon Word remettrait l'ancienne à la mise à jour des champs).
    assert!(x.contains(r#"<w:delInstrText xml:space="preserve"> INCLUDEPICTURE"#), "{x}");
    assert_eq!(figures_of(&d, &p).iter().map(|f| f.1).collect::<Vec<_>>(), [Some("del"), Some("ins")]);

    // Un champ dont le début est rangé ailleurs (dans un lien) : refus nommé.
    let mut d = open("christophe");
    let mut d = with_figure_run(&mut d, |_, drawing| {
        field(drawing).replacen(r#"<w:r><w:fldChar w:fldCharType="begin"/></w:r>"#, r#"<w:hyperlink w:anchor="x"><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:hyperlink>"#, 1)
    });
    let e = apply(&mut d, &op(json!({"op": "delete_image", "paragraph": p, "index": 0})), true, &me).unwrap_err();
    assert!(e.0.contains("champ Word (includepicture)") && e.0.contains("dissocier"), "{}", e.0);
}

#[test]
fn une_figure_deplacee_en_suivi_ou_dans_un_controle_dit_pourquoi() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let p = figure_paragraph(&mut d);
    let mut d = with_figure_run(&mut d, |run, _| {
        format!(r#"<w:moveTo w:id="77" w:author="Christophe Kinnard" w:date="2026-11-02T10:00:00Z">{run}</w:moveTo>"#)
    });
    let e = apply(&mut d, &replace(&p, 0, png(10, 10), ""), true, &me).unwrap_err();
    assert!(e.0.contains("déplacée en suivi par Christophe Kinnard"), "{}", e.0);

    let mut d = open("christophe");
    let mut d = with_figure_run(&mut d, |run, _| format!("<w:sdt><w:sdtPr/><w:sdtContent>{run}</w:sdtContent></w:sdt>"));
    let e = apply(&mut d, &op(json!({"op": "delete_image", "paragraph": p, "index": 0})), true, &me).unwrap_err();
    assert!(e.0.contains("contrôle de contenu"), "{}", e.0);
}
