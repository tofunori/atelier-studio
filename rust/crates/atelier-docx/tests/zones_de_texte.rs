//! Zones de texte et formes posées sur la page (`mc:AlternateContent`,
//! `wps:txbx`, `v:textbox`). Un élève écrit ses valeurs dans des zones de
//! texte par-dessus le schéma d'un exemple : sans elles, le document se lit
//! comme si le schéma était recopié tel quel (2026-11-14, un TP noté à tort).
//! Le modèle les porte (panneau), la lecture de l'agent donne leur texte, et
//! rien de ce qu'on retouche autour ne les abîme. Valeurs synthétiques.

mod common;

use atelier_docx::ops::{self, Op};
use atelier_docx::{Docx, shapes};
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;

/// La fixture, son `word/document.xml` passé par `doc`.
fn with_document(doc: impl Fn(String) -> String) -> Docx {
    let src = common::build("christophe");
    let mut zin = zip::ZipArchive::new(Cursor::new(src)).unwrap();
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for i in 0..zin.len() {
        let mut f = zin.by_index(i).unwrap();
        let name = f.name().to_string();
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).unwrap();
        if name == "word/document.xml" {
            bytes = doc(String::from_utf8(bytes).unwrap()).into_bytes();
        }
        out.start_file(name, SimpleFileOptions::default()).unwrap();
        out.write_all(&bytes).unwrap();
    }
    Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap()
}

/// Un run qui porte une zone de texte comme Word l'écrit : dessin moderne
/// dans `mc:Choice`, copie VML dans `mc:Fallback`. Ancrée à la colonne
/// (`x`) et au paragraphe (`y`), en EMU ; trait orange de 2 points.
fn text_box(x: u32, y: u32, cx: u32, cy: u32, z: u32, lines: &[&str]) -> String {
    let paras: String = lines.iter().map(|l| format!(r#"<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{l}</w:t></w:r></w:p>"#)).collect();
    format!(
        r##"<w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="{z}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>{x}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>{y}</wp:posOffset></wp:positionV><wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="12700" t="12700" r="12700" b="12700"/><wp:wrapNone/><wp:docPr id="{z}" name="Rectangle {z}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="F79646"/></a:solidFill></a:ln></wps:spPr><wps:txbx><w:txbxContent>{paras}</w:txbxContent></wps:txbx><wps:bodyPr rot="0" vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="ctr" anchorCtr="0"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict><v:rect style="position:absolute;margin-left:{}pt;margin-top:{}pt;width:{}pt;height:{}pt;z-index:{z};v-text-anchor:middle" fillcolor="white" strokecolor="#f79646" strokeweight="2pt"><v:textbox><w:txbxContent>{paras}</w:txbxContent></v:textbox></v:rect></w:pict></mc:Fallback></mc:AlternateContent></w:r>"##,
        x / 12700,
        y / 12700,
        cx / 12700,
        cy / 12700
    )
}

/// La fixture, deux zones de texte posées sur sa figure (le paragraphe ne
/// contient qu'elle), comme sur le schéma d'un TP.
fn on_figure() -> Docx {
    with_document(|doc| {
        let boxes = text_box(1270000, 127000, 2540000, 381000, 2, &["Niveau initial", "= 12,5 m"]) + &text_box(0, 508000, 2540000, 381000, 3, &["H = 12,5 – 12,1 = 0,4 m"]);
        let at = doc.find("<w:r><w:drawing><wp:inline").expect("la figure de la fixture");
        format!("{}{boxes}{}", &doc[..at], &doc[at..])
    })
}

#[test]
fn le_modele_porte_les_zones_de_texte_posees_sur_la_figure() {
    let plain = common::open("christophe").model().unwrap();
    let model = on_figure().model().unwrap();
    let para = model.paragraphs.iter().find(|p| !p.shapes.is_empty()).expect("un paragraphe avec ses zones de texte");
    let before = plain.paragraphs.iter().find(|p| p.id == para.id).unwrap();
    // Le texte, les segments et leurs positions ne bougent pas : les zones
    // flottent, elles n'occupent aucun caractère.
    assert_eq!((&para.text, &para.segments), (&before.text, &before.segments));
    assert!(para.segments.iter().any(|s| s.media.is_some()));

    assert_eq!(para.shapes.len(), 2);
    let (a, b) = (&para.shapes[0], &para.shapes[1]);
    assert_eq!((a.wrap, a.x, a.y, a.w, a.h, a.z), ("front", 100.0, 10.0, 200.0, 30.0, 2));
    assert_eq!((b.wrap, b.x, b.y, b.w, b.h, b.z), ("front", 0.0, 40.0, 200.0, 30.0, 3));
    assert!(a.floats() && !a.page_y);
    let part = &a.parts[0];
    assert_eq!((part.geom, part.fill.as_deref(), part.line.as_deref(), part.line_w, part.valign), ("rect", Some("FFFFFF"), Some("F79646"), 2.0, "middle"));
    assert_eq!(part.inset, [7.2, 3.6, 7.2, 3.6]);
    assert_eq!(part.text.len(), 2);
    assert_eq!(part.text[0].look.align.as_deref(), Some("center"));
    assert_eq!(a.text(), "Niveau initial\n= 12,5 m");
    assert_eq!(b.text(), "H = 12,5 – 12,1 = 0,4 m");

    // Le JSON du panneau : `shapes` sur le paragraphe, rien sur les autres.
    let json = serde_json::to_value(&model).unwrap();
    let with: Vec<&serde_json::Value> = json["paragraphs"].as_array().unwrap().iter().filter(|p| p.get("shapes").is_some()).collect();
    assert_eq!(with.len(), 1);
    assert_eq!(with[0]["shapes"][0]["parts"][0]["text"][0]["runs"][0]["text"], "Niveau initial");
    assert_eq!(with[0]["shapes"][1]["seg"], with[0]["shapes"][0]["seg"]);

    // La figure seule dans son paragraphe centré : sa place dans le repère
    // des zones (colonne de 468 points, figure de 72), pour les dessiner dessus.
    let (seg, rect) = shapes::lone_figure(para, model.page.as_ref()).unwrap();
    assert!(para.segments[seg].media.is_some());
    assert_eq!(rect, [198.0, 0.0, 72.0, 72.0]);
    let refs: Vec<&shapes::Shape> = para.shapes.iter().collect();
    let (svg, w, h) = shapes::compose(&refs, Some(shapes::Backdrop { bytes: b"x", mime: "image/png", rect }), &shapes::Pictures::new()).unwrap();
    // Cadre : de x = 0 (zone 2) à 300 (zone 1), de y = 0 à 72 au moins (une
    // zone s'allonge si son texte déborde), marge de 4 points, en pixels.
    assert_eq!(w.round(), 411.0);
    assert!((107.0..=115.0).contains(&h.round()), "{h}");
    assert!(svg.find("<image ").unwrap() < svg.find("Niveau initial").unwrap(), "les zones par-dessus la figure");
}

#[test]
fn la_lecture_de_l_agent_donne_leur_texte() {
    let model = on_figure().model().unwrap();
    let plan = ops::outline(&model, 0, None, 100_000);
    assert!(plan.contains("Zones de texte : 2."), "{plan}");
    let line = plan.lines().find(|l| l.starts_with('p') && l.contains("{image : ")).unwrap();
    assert!(line.contains("{zone de texte : Niveau initial / = 12,5 m}{zone de texte : H = 12,5 – 12,1 = 0,4 m}{image : "), "{line}");
    // Sans zone de texte : ni l'annonce ni une ligne changée.
    let plain = ops::outline(&common::open("christophe").model().unwrap(), 0, None, 100_000);
    assert!(!plain.contains("Zones de texte :"), "{plain}");
    assert_eq!(plain.lines().find(|l| l.starts_with('p') && l.contains("{image : ")).unwrap(), line.replace("{zone de texte : Niveau initial / = 12,5 m}{zone de texte : H = 12,5 – 12,1 = 0,4 m}", ""));
}

/// Dans un paragraphe de texte : une zone ancrée au milieu d'une phrase, une
/// zone VML d'un vieux Word (son propre objet), un trait.
fn in_text() -> Docx {
    with_document(|doc| {
        let needle = "<w:t>Ces valeurs sont";
        let at = doc.find(needle).map(|i| doc[..i].rfind("<w:r>").or(doc[..i].rfind("<w:r ")).unwrap()).expect("le paragraphe de la fixture");
        let old = r##"<w:r><w:pict><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"/><v:shape id="Zone 1" type="#_x0000_t202" style="position:absolute;margin-left:36pt;margin-top:18pt;width:144pt;height:36pt;z-index:5"><v:textbox><w:txbxContent><w:p><w:r><w:t>Ancien Word</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>"##;
        let line = r##"<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor behindDoc="1" relativeHeight="7"><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="1270000" cy="0"/><wp:wrapNone/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvCnPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1270000" cy="0"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></wps:spPr><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r>"##;
        format!("{}{}{old}{line}{}", &doc[..at], text_box(635000, 254000, 1270000, 254000, 4, &["Note en marge"]), &doc[at..])
    })
}

#[test]
fn zones_dans_un_paragraphe_de_texte_et_vml_seul() {
    let mut docx = in_text();
    let model = docx.model().unwrap();
    let para = model.paragraphs.iter().find(|p| p.text.contains("Ces valeurs sont")).unwrap();
    assert_eq!(para.shapes.iter().map(|s| s.label()).collect::<Vec<_>>(), ["zone de texte", "zone de texte", "trait"]);
    // La zone VML garde son objet dans le texte (comme avant) : il renvoie à elle.
    let own = para.segments.iter().find(|s| s.shape.is_some()).expect("l'objet de la zone VML");
    assert_eq!((own.kind, own.shape), ("object", Some(1)));
    let vml = &para.shapes[1];
    assert_eq!((vml.wrap, vml.x, vml.y, vml.w, vml.h, vml.text().as_str()), ("front", 36.0, 18.0, 144.0, 36.0, "Ancien Word"));
    // Forme VML par défaut : fond blanc, trait noir de 0,75 point.
    assert_eq!((vml.parts[0].fill.as_deref(), vml.parts[0].line.as_deref(), vml.parts[0].line_w), (Some("FFFFFF"), Some("000000"), 0.75));
    let arrow = &para.shapes[2];
    assert_eq!((arrow.wrap, arrow.parts[0].geom, arrow.parts[0].line.as_deref()), ("behind", "path", Some("FF0000")));
    assert!(arrow.parts[0].heads.is_some());
    // Du texte à côté : on ne sait pas où tomberait une figure, rien à superposer.
    assert!(shapes::lone_figure(para, model.page.as_ref()).is_none());

    let plan = ops::outline(&model, 0, None, 100_000);
    let line = plan.lines().find(|l| l.contains("Ces valeurs sont")).unwrap();
    assert!(line.contains(" : {zone de texte : Note en marge}{zone de texte : Ancien Word}{trait}Ces valeurs sont"), "{line}");
    assert!(plan.contains("Zones de texte : 2."), "{plan}");
}

#[test]
fn retoucher_le_texte_autour_laisse_les_zones_intactes() {
    let mut docx = in_text();
    let id = docx.model().unwrap().paragraphs.iter().find(|p| p.text.contains("Ces valeurs sont")).unwrap().id.clone();
    ops::apply(&mut docx, &Op::Replace { paragraph: Some(id.clone()), find: "Ces valeurs".into(), occurrence: None, with: "Ces mesures".into() }, true, &common::sig("Thierry")).unwrap();
    let mut again = common::reopen(&docx);
    let model = again.model().unwrap();
    let para = model.paragraphs.iter().find(|p| p.id == id).unwrap();
    assert!(para.text.contains("Ces mesures"), "{}", para.text);
    assert_eq!(para.shapes.iter().map(|s| s.text()).collect::<Vec<_>>(), ["Note en marge", "Ancien Word", ""]);
    let xml = again.document_xml().to_string();
    assert_eq!(xml.matches("<wps:txbx>").count(), 1);
    assert_eq!(xml.matches("<v:textbox>").count(), 2);
}
