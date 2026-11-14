//! Citations Zotero VIVANTES : écrites comme le module Zotero de Word
//! (`ADDIN ZOTERO_ITEM CSL_CITATION`, `ADDIN ZOTERO_BIBL`, préférences
//! `ZOTERO_PREF_n`), pour que le document se rafraîchisse et se modifie dans
//! Word avec Zotero (2026-11-14 : « dans le Word d'Atelier on ne peut pas
//! intégrer de citations Zotero… Claude n'y arrive pas »). Notices
//! synthétiques.

mod common;

use atelier_docx::cite::{self, CiteItem, StyleRef};
use atelier_docx::new::{Template, create};
use atelier_docx::ops::{self, Op};
use atelier_docx::Docx;
use serde_json::{Value, json};

fn notice(key: &str, families: &[&str], year: i64, title: &str) -> CiteItem {
    let author: Vec<Value> = families.iter().map(|f| json!({"family": f, "given": "Brian"})).collect();
    CiteItem {
        key: key.into(),
        id: Some(key.len() as i64 * 7),
        uri: Some(format!("http://zotero.org/users/123/items/{key}")),
        data: Some(json!({
            "id": key.len() * 7, "type": "article-journal", "title": title,
            "container-title": "The Cryosphere", "volume": "15", "page": "1-20",
            "author": author, "issued": {"date-parts": [[year]]}
        })),
        ..Default::default()
    }
}

fn williamson() -> CiteItem {
    notice("WILLIAMS", &["Williamson", "Menounos"], 2021, "Wildfire darkening of glaciers")
}

fn aubry() -> CiteItem {
    notice("AUBRYWAKE", &["Aubry-Wake", "Bertoncini", "Pomeroy"], 2022, "Fire and ice")
}

fn doc_with(text: &[&str]) -> Docx {
    let mut d = Docx::from_bytes(create(Template::Blank).unwrap()).unwrap();
    let s = common::sig("Thierry Laurent");
    ops::apply(&mut d, &Op::Insert { paragraph: "p0".into(), at: 0, with: text[0].into() }, false, &s).unwrap();
    for (k, t) in text.iter().enumerate().skip(1) {
        ops::apply(&mut d, &Op::InsertParagraph { after: format!("p{}", k - 1), text: (*t).into() }, false, &s).unwrap();
    }
    d
}

/// Champs Zotero du corps : (instruction JSON, texte affiché).
fn citations(d: &mut Docx) -> Vec<(Value, String)> {
    let xml = d.document_xml().to_string();
    let mut out = Vec::new();
    for (i, _) in xml.match_indices("ADDIN ZOTERO_ITEM CSL_CITATION ") {
        let rest = &xml[i..];
        let end = rest.find("</w:instrText>").unwrap();
        let instr = rest[..end].replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">");
        let a = instr.find('{').unwrap();
        let b = instr.rfind('}').unwrap();
        let v: Value = serde_json::from_str(&instr[a..=b]).unwrap();
        out.push((v, String::new()));
    }
    let cited = cite::citations(d).unwrap();
    for (k, c) in cited.into_iter().enumerate() {
        out[k].1 = c.text;
    }
    out
}

#[test]
fn une_citation_posee_est_un_vrai_champ_zotero() {
    let mut d = doc_with(&["Les feux assombrissent les glaciers."]);
    let s = common::sig("Thierry Laurent");
    let r = ops::apply(&mut d, &Op::InsertCitation { paragraph: "p0".into(), at: 35, items: vec![williamson()] }, false, &s).unwrap();
    assert_eq!(r["text"], "(Williamson & Menounos, 2021)");
    let mut d = common::reopen(&d);

    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[0].text, "Les feux assombrissent les glaciers(Williamson & Menounos, 2021).");
    let seg = m.paragraphs[0].segments.iter().find(|s| s.cite.is_some()).expect("segment de citation");
    assert_eq!(seg.label.as_deref(), Some("zotero"));
    assert!(seg.whole, "la citation s'efface d'un bloc");

    let c = citations(&mut d);
    assert_eq!(c.len(), 1);
    let (v, shown) = &c[0];
    assert_eq!(v["properties"]["plainCitation"], *shown, "plainCitation = texte affiché, sinon Zotero croit à une retouche");
    assert_eq!(v["citationItems"][0]["uris"][0], "http://zotero.org/users/123/items/WILLIAMS");
    assert_eq!(v["citationItems"][0]["itemData"]["title"], "Wildfire darkening of glaciers");
    assert_eq!(v["schema"], "https://github.com/citation-style-language/schema/raw/master/csl-citation.json");
    let id = v["citationID"].as_str().unwrap();
    assert!(id.len() >= 8 && id.chars().all(|c| c.is_ascii_alphanumeric()));

    // Préférences du document : Zotero sait à quel style il a affaire.
    let custom = d.part("docProps/custom.xml").unwrap().expect("docProps/custom.xml");
    assert!(custom.contains(r#"name="ZOTERO_PREF_1""#), "{custom}");
    assert!(custom.contains("http://www.zotero.org/styles/apa"));
    assert!(custom.contains(r#"fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2""#));
    assert!(d.part("[Content_Types].xml").unwrap().unwrap().contains(r#"PartName="/docProps/custom.xml""#));
    assert!(d.part("_rels/.rels").unwrap().unwrap().contains("relationships/custom-properties"));
    // L'agent lit l'identifiant de la citation pour la retoucher.
    let m = d.model().unwrap();
    let o = ops::outline(&m, 0, None, 100_000);
    assert!(o.contains(&format!("{{citation {id} : (Williamson & Menounos, 2021)}}")), "{o}");
}

#[test]
fn en_suivi_la_citation_est_une_insertion_signee() {
    let mut d = doc_with(&["Les feux assombrissent les glaciers."]);
    let s = common::sig("Thierry Laurent");
    ops::apply(&mut d, &Op::InsertCitation { paragraph: "p0".into(), at: 35, items: vec![williamson()] }, true, &s).unwrap();
    let xml = d.document_xml();
    let ins = xml.find("<w:ins ").unwrap();
    let field = xml.find("ZOTERO_ITEM").unwrap();
    let close = xml[ins..].find("</w:ins>").unwrap() + ins;
    assert!(ins < field && field < close, "le champ entier est dans l'insertion");
    assert!(xml[ins..close].contains("w:author=\"Thierry Laurent\""));
    let m = d.model().unwrap();
    assert_eq!(m.changes.len(), 1);
    // Refuser l'ajout retire la citation entière.
    let id = m.changes[0].id;
    ops::apply(&mut d, &Op::Reject { id }, false, &s).unwrap();
    assert!(!d.document_xml().contains("ZOTERO_ITEM"));
}

#[test]
fn bibliographie_suit_les_citations() {
    let mut d = doc_with(&["Les feux assombrissent les glaciers.", "Références"]);
    let s = common::sig("Thierry Laurent");
    ops::apply(&mut d, &Op::InsertCitation { paragraph: "p0".into(), at: 35, items: vec![williamson()] }, false, &s).unwrap();
    let r = ops::apply(&mut d, &Op::InsertBibliography { after: "p1".into() }, true, &s).unwrap();
    assert_eq!(r["entries"], 1);
    assert_eq!(r["tracked"], false);
    let xml = d.document_xml().to_string();
    assert!(xml.contains(r#"ADDIN ZOTERO_BIBL {"uncited":[],"omitted":[],"custom":[]} CSL_BIBLIOGRAPHY"#), "{xml}");
    assert!(!xml.contains("<w:ins "), "Zotero refait la bibliographie : jamais en suivi");

    // Une deuxième citation : la bibliographie se met à jour, triée par auteur.
    ops::apply(&mut d, &Op::InsertCitation { paragraph: "p0".into(), at: 0, items: vec![aubry()] }, false, &s).unwrap();
    let d2 = common::reopen(&d);
    let mut d = d2;
    let m = d.model().unwrap();
    let bib: Vec<&str> = m.paragraphs[2..].iter().map(|p| p.text.as_str()).collect();
    assert_eq!(bib.len(), 2, "{bib:?}");
    assert!(bib[0].starts_with("Aubry-Wake, B., Bertoncini, B., & Pomeroy, B. (2022). Fire and ice. The Cryosphere, 15, 1-20."), "{bib:?}");
    assert!(bib[1].starts_with("Williamson, B., & Menounos, B. (2021)."), "{bib:?}");
    assert_eq!(m.paragraphs[2].style.as_deref(), Some("Bibliography"));
    assert!(d.document_xml().matches("ZOTERO_BIBL").count() == 1);
    // Deux fois : refusée.
    assert!(ops::apply(&mut d, &Op::InsertBibliography { after: "p1".into() }, false, &s).is_err());
}

#[test]
fn modifier_une_citation_page_et_retrait() {
    let mut d = doc_with(&["Les feux assombrissent les glaciers."]);
    let me = common::sig("Thierry Laurent");
    let r = ops::apply(&mut d, &Op::InsertCitation { paragraph: "p0".into(), at: 35, items: vec![williamson()] }, false, &me).unwrap();
    let id = r["citation"].as_str().unwrap().to_string();

    // Sans suivi : réécrite en place, même identifiant.
    let mut w = williamson();
    w.locator = Some("12".into());
    let r = ops::apply(&mut d, &Op::EditCitation { citation: id.clone(), items: vec![w, aubry()] }, false, &me).unwrap();
    assert_eq!(r["text"], "(Williamson & Menounos, 2021, p. 12; Aubry-Wake et al., 2022)");
    let c = citations(&mut d);
    assert_eq!(c.len(), 1);
    assert_eq!(c[0].0["citationID"], id.as_str());
    assert_eq!(c[0].0["citationItems"][0]["locator"], "12");
    assert_eq!(c[0].0["citationItems"][0]["label"], "page");
    assert_eq!(c[0].0["properties"]["plainCitation"], c[0].1);

    // En suivi par un autre : l'ancienne supprimée, la nouvelle insérée.
    let other = common::sig("Christophe Kinnard");
    let r = ops::apply(&mut d, &Op::EditCitation { citation: id.clone(), items: vec![aubry()] }, true, &other).unwrap();
    assert_eq!(r["text"], "(Aubry-Wake et al., 2022)");
    let xml = d.document_xml().to_string();
    assert!(xml.contains("<w:delInstrText"), "l'ancienne instruction passe en suppression");
    let m = d.model().unwrap();
    assert!(m.paragraphs[0].text.contains("(Aubry-Wake et al., 2022)"));
    assert!(m.changes.len() >= 2);
    // Le panneau et l'agent ne voient que la vivante.
    let live: Vec<_> = cite::citations(&mut d).unwrap();
    assert_eq!(live.len(), 1);
    assert_eq!(live[0].text, "(Aubry-Wake et al., 2022)");

    // Retirer : `items` vide.
    ops::apply(&mut d, &Op::AcceptAll { author: None }, false, &me).unwrap();
    ops::apply(&mut d, &Op::EditCitation { citation: id, items: vec![] }, false, &me).unwrap();
    assert!(!d.document_xml().contains("ZOTERO_ITEM"));
    assert_eq!(d.model().unwrap().paragraphs[0].text, "Les feux assombrissent les glaciers.");
}

#[test]
fn style_numerique_renumerote_tout() {
    let mut d = doc_with(&["Premier constat.", "Second constat.", "Références"]);
    let s = common::sig("Thierry Laurent");
    ops::apply(&mut d, &Op::InsertCitation { paragraph: "p0".into(), at: 15, items: vec![williamson()] }, false, &s).unwrap();
    ops::apply(&mut d, &Op::InsertCitation { paragraph: "p1".into(), at: 14, items: vec![aubry(), williamson()] }, false, &s).unwrap();
    ops::apply(&mut d, &Op::InsertBibliography { after: "p2".into() }, false, &s).unwrap();
    ops::apply(&mut d, &Op::SetCitationStyle { style: StyleRef { id: "http://www.zotero.org/styles/ieee".into(), format: None, locale: Some("en-US".into()) } }, false, &s).unwrap();
    let mut d = common::reopen(&d);
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[0].text, "Premier constat[1].");
    assert_eq!(m.paragraphs[1].text, "Second constat[2, 1].");
    assert!(m.paragraphs[3].text.starts_with("[1] B. Williamson and B. Menounos, “Wildfire darkening of glaciers,” The Cryosphere"), "{}", m.paragraphs[3].text);
    assert!(m.paragraphs[4].text.starts_with("[2] B. Aubry-Wake, B. Bertoncini, and B. Pomeroy"), "{}", m.paragraphs[4].text);
    let st = cite::doc_style(&mut d).unwrap();
    assert_eq!((st.id.as_str(), st.format.as_str(), st.locale.as_deref()), ("http://www.zotero.org/styles/ieee", "numeric", Some("en-US")));
    for (v, shown) in citations(&mut d) {
        assert_eq!(v["properties"]["plainCitation"], shown);
    }
    // Les styles en notes sont refusés plutôt que mal rendus.
    let bad = StyleRef { id: "http://www.zotero.org/styles/chicago-note-bibliography".into(), format: None, locale: None };
    assert!(ops::apply(&mut d, &Op::SetCitationStyle { style: bad }, false, &s).is_err());
}

#[test]
fn les_autres_proprietes_personnalisees_restent() {
    let mut d = doc_with(&["Texte."]);
    // Propriété d'un autre outil, et une préférence Zotero d'un autre style.
    let custom = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="Projet"><vt:i4>42</vt:i4></property><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="ZOTERO_PREF_1"><vt:lpwstr>&lt;data data-version="3" zotero-version="7.0.11"&gt;&lt;session id="Abc12345"/&gt;&lt;style id="http://www.zotero.org/styles/the-cryosphere" locale="en-GB" hasBibliography="1" bibliographyStyleHasBeenSet="1"/&gt;&lt;prefs&gt;&lt;pref name="fieldType" value="Field"/&gt;&lt;/prefs&gt;&lt;/data&gt;</vt:lpwstr></property></Properties>"#;
    let bytes = {
        use std::io::{Cursor, Read, Write};
        let src = d.to_bytes().unwrap();
        let mut zin = zip::ZipArchive::new(Cursor::new(src)).unwrap();
        let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for i in 0..zin.len() {
            let mut f = zin.by_index(i).unwrap();
            let name = f.name().to_string();
            let mut b = Vec::new();
            f.read_to_end(&mut b).unwrap();
            if name == "[Content_Types].xml" {
                b = String::from_utf8(b).unwrap().replace("</Types>", r#"<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>"#).into_bytes();
            }
            out.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(&b).unwrap();
        }
        out.start_file("docProps/custom.xml", zip::write::SimpleFileOptions::default()).unwrap();
        out.write_all(custom.as_bytes()).unwrap();
        out.finish().unwrap().into_inner()
    };
    d = Docx::from_bytes(bytes).unwrap();
    let st = cite::doc_style(&mut d).unwrap();
    assert_eq!((st.id.as_str(), st.format.as_str(), st.stored), ("http://www.zotero.org/styles/the-cryosphere", "author-date", true));
    let s = common::sig("Thierry Laurent");
    ops::apply(&mut d, &Op::SetCitationStyle { style: StyleRef { id: "http://www.zotero.org/styles/apa".into(), format: Some("author-date".into()), locale: None } }, false, &s).unwrap();
    let custom = d.part("docProps/custom.xml").unwrap().unwrap();
    assert!(custom.contains(r#"name="Projet"><vt:i4>42</vt:i4>"#), "{custom}");
    assert!(custom.contains("session id=&quot;Abc12345&quot;") || custom.contains(r#"session id="Abc12345""#), "même séance Zotero : {custom}");
    assert!(custom.contains("styles/apa"));
    assert!(custom.contains("locale=\"en-GB\"") || custom.contains("locale=&quot;en-GB&quot;"), "{custom}");
    assert!(custom.contains("zotero-version=&quot;7.0.11&quot;") || custom.contains(r#"zotero-version="7.0.11""#));
    assert_eq!(d.part("[Content_Types].xml").unwrap().unwrap().matches("/docProps/custom.xml").count(), 1);
}

#[test]
fn les_champs_existants_de_word_se_relisent() {
    // Un champ comme Word l'écrit : instruction coupée en plusieurs
    // `w:instrText`, résultat sur deux runs.
    let d = doc_with(&["Texte."]);
    let item = json!({"citationID":"ab12CD34","properties":{"formattedCitation":"(Smith, 2020)","plainCitation":"(Smith, 2020)","noteIndex":0},"citationItems":[{"id":5,"uris":["http://zotero.org/users/9/items/SMITHKEY"],"itemData":{"id":5,"type":"book","title":"Ice","author":[{"family":"Smith","given":"Jo"}],"issued":{"date-parts":[["2020"]]}}}],"schema":"https://github.com/citation-style-language/schema/raw/master/csl-citation.json"});
    let instr = format!(" ADDIN ZOTERO_ITEM CSL_CITATION {item} ").replace('<', "&lt;");
    let (a, b) = instr.split_at(40);
    let field = format!(r#"<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve">{a}</w:instrText></w:r><w:r><w:instrText xml:space="preserve">{b}</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>(Smith, </w:t></w:r><w:r><w:t>2020)</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>"#);
    let xml = d.document_xml().replacen("<w:t xml:space=\"preserve\">Texte.</w:t></w:r>", &format!("<w:t xml:space=\"preserve\">Texte.</w:t></w:r>{field}"), 1);
    assert_ne!(xml, d.document_xml());
    let bytes = {
        use std::io::{Cursor, Read, Write};
        let src = d.to_bytes().unwrap();
        let mut zin = zip::ZipArchive::new(Cursor::new(src)).unwrap();
        let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for i in 0..zin.len() {
            let mut f = zin.by_index(i).unwrap();
            let name = f.name().to_string();
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).unwrap();
            if name == "word/document.xml" {
                buf = xml.clone().into_bytes();
            }
            out.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(&buf).unwrap();
        }
        out.finish().unwrap().into_inner()
    };
    let mut d = Docx::from_bytes(bytes).unwrap();
    let c = cite::citations(&mut d).unwrap();
    assert_eq!(c.len(), 1);
    assert_eq!(c[0].citation, "ab12CD34");
    assert_eq!(c[0].text, "(Smith, 2020)");
    assert_eq!(c[0].items[0].key, "SMITHKEY");
    // L'actualiser ne touche à rien : déjà à jour.
    assert_eq!(cite::refresh_all(&mut d).unwrap(), 0);
    // Ajouter une page la réécrit en place, instruction recollée en un seul `w:instrText`.
    let mut it = c[0].items[0].clone();
    it.data = Some(item["citationItems"][0]["itemData"].clone());
    it.locator = Some("3-4".into());
    let s = common::sig("Thierry Laurent");
    let r = ops::apply(&mut d, &Op::EditCitation { citation: "ab12CD34".into(), items: vec![it] }, false, &s).unwrap();
    assert_eq!(r["text"], "(Smith, 2020, pp. 3-4)");
    assert_eq!(d.model().unwrap().paragraphs[0].text, "Texte.(Smith, 2020, pp. 3-4)");
}
