//! Nouveaux documents : un .docx minimal que Word ouvre sans réparation.
//!
//! Trois modèles : « Vide » (réglages de Word), « Article » (manuscrit à
//! soumettre : Times 12, double interligne, numéros de ligne repris à chaque
//! page) et « Copier » (styles, thème, listes et mise en page d'un document
//! existant, sans son texte ni ses en-têtes et pieds de page).

use crate::{Docx, Result, err};
use roxmltree::Document;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

/// Modèle d'un nouveau document.
pub enum Template<'a> {
    Blank,
    Article,
    /// Octets d'un .docx dont on reprend la mise en forme.
    Copy(&'a [u8]),
}

const W_NS: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL_NS: &str = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Lettre US, marges d'un pouce : le format courant au Québec et en Amérique du Nord.
const SECT_BLANK: &str = r#"<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>"#;
const SECT_ARTICLE: &str = r#"<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:lnNumType w:countBy="1" w:restart="newPage"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>"#;

/// Paquet complet d'un document neuf.
pub fn create(template: Template) -> Result<Vec<u8>> {
    let mut parts: Vec<(String, Vec<u8>, &'static str)> = Vec::new();
    let mut rels: Vec<(String, String)> = vec![("styles".into(), "styles.xml".into()), ("settings".into(), "settings.xml".into())];
    let (styles, sect) = match template {
        Template::Blank => (styles_xml(BLANK), SECT_BLANK.to_string()),
        Template::Article => (styles_xml(ARTICLE), SECT_ARTICLE.to_string()),
        Template::Copy(bytes) => {
            let mut src = Docx::from_bytes(bytes.to_vec())?;
            let Some(styles) = src.part("word/styles.xml")? else {
                return err("ce document n'a pas de styles à reprendre");
            };
            // Thème, listes et polices : repris tels quels s'ils existent.
            for (kind, name, ct) in [
                ("theme", "word/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"),
                ("numbering", "word/numbering.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"),
                ("fontTable", "word/fontTable.xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"),
            ] {
                if let Some(xml) = src.part(name)? {
                    parts.push((name.to_string(), xml.into_bytes(), ct));
                    rels.push((kind.into(), name.trim_start_matches("word/").into()));
                }
            }
            let sect = section_of(src.document_xml()).unwrap_or_else(|| SECT_BLANK.to_string());
            (styles, sect)
        }
    };
    let document = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="{W_NS}" xmlns:r="{R_NS}"><w:body><w:p/>{sect}</w:body></w:document>"#
    );
    let doc_rels: String = rels
        .iter()
        .enumerate()
        .map(|(i, (kind, target))| format!(r#"<Relationship Id="rId{}" Type="{REL}/{kind}" Target="{target}"/>"#, i + 1))
        .collect();
    let overrides: String = parts.iter().map(|(name, _, ct)| format!(r#"<Override PartName="/{name}" ContentType="{ct}"/>"#)).collect();
    let content_types = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>{overrides}</Types>"#
    );
    let root_rels = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="{REL_NS}"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="word/document.xml"/></Relationships>"#
    );
    let doc_rels = format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="{REL_NS}">{doc_rels}</Relationships>"#);

    let mut out = ZipWriter::new(Cursor::new(Vec::new()));
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, bytes) in [
        ("[Content_Types].xml", content_types.as_bytes()),
        ("_rels/.rels", root_rels.as_bytes()),
        ("word/document.xml", document.as_bytes()),
        ("word/_rels/document.xml.rels", doc_rels.as_bytes()),
        ("word/styles.xml", styles.as_bytes()),
        ("word/settings.xml", SETTINGS.as_bytes()),
    ] {
        out.start_file(name, opts)?;
        out.write_all(bytes)?;
    }
    for (name, bytes, _) in &parts {
        out.start_file(name.as_str(), opts)?;
        out.write_all(bytes)?;
    }
    Ok(out.finish()?.into_inner())
}

/// Mise en page de la dernière section du corps, sans les renvois aux
/// en-têtes et pieds de page (leurs parties ne sont pas reprises).
fn section_of(xml: &str) -> Option<String> {
    let doc = Document::parse(xml).ok()?;
    let body = doc.root_element().children().find(|n| n.has_tag_name((W_NS, "body")))?;
    let sect = body.children().rfind(|n| n.is_element()).filter(|n| n.has_tag_name((W_NS, "sectPr")))?;
    let range = sect.range();
    let mut out = String::new();
    let mut at = range.start;
    for c in sect.children().filter(|n| n.has_tag_name((W_NS, "headerReference")) || n.has_tag_name((W_NS, "footerReference"))) {
        out.push_str(&xml[at..c.range().start]);
        at = c.range().end;
    }
    out.push_str(&xml[at..range.end]);
    // Le préfixe `w:` est celui de notre document.
    let prefix = sect.lookup_prefix(W_NS).unwrap_or("w");
    if prefix != "w" {
        return Some(out.replace(&format!("<{prefix}:"), "<w:").replace(&format!("</{prefix}:"), "</w:").replace(&format!(" {prefix}:"), " w:"));
    }
    Some(out)
}

const SETTINGS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>"#;

/// Réglages d'un jeu de styles : police et taille du corps, interligne
/// (en 240e de ligne), espace après et retrait de première ligne (twips).
struct Look {
    font: &'static str,
    size: u32,
    line: u32,
    after: u32,
    first: u32,
    heading_sizes: [u32; 3],
}

// Word 365 : Aptos 11, interligne 1,15, 8 pt après.
const BLANK: Look = Look { font: "Aptos", size: 22, line: 276, after: 160, first: 0, heading_sizes: [32, 28, 24] };
// Manuscrit : Times New Roman 12, double interligne, alinéa d'un demi-pouce.
const ARTICLE: Look = Look { font: "Times New Roman", size: 24, line: 480, after: 0, first: 720, heading_sizes: [24, 24, 24] };

fn styles_xml(l: Look) -> String {
    let Look { font, size, line, after, first, heading_sizes: [h1, h2, h3] } = l;
    let indent = if first > 0 { format!(r#"<w:ind w:firstLine="{first}"/>"#) } else { String::new() };
    let heading = |id: u32, sz: u32, italic: bool| {
        format!(
            r#"<w:style w:type="paragraph" w:styleId="Heading{id}"><w:name w:val="heading {id}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="{before}" w:after="{after}"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="{lvl}"/></w:pPr><w:rPr><w:b/><w:bCs/>{it}<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/></w:rPr></w:style>"#,
            before = if after == 0 { 0 } else { 360 },
            after = if after == 0 { 0 } else { 80 },
            lvl = id - 1,
            it = if italic { "<w:i/><w:iCs/>" } else { "" },
        )
    };
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="{W_NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:eastAsia="{font}" w:cs="{font}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:lang w:val="fr-CA" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="{after}" w:line="{line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>{normal_ppr}</w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="{title_jc}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="{title}"/><w:szCs w:val="{title}"/></w:rPr></w:style>{h1s}{h2s}{h3s}<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="0"/></w:pPr><w:rPr><w:i/><w:iCs/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:firstLine="0"/></w:pPr></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>"#,
        normal_ppr = if indent.is_empty() { String::new() } else { format!("<w:pPr>{indent}</w:pPr>") },
        title = if size >= 24 { 28 } else { 56 },
        title_jc = if first > 0 { "center" } else { "left" },
        h1s = heading(1, h1, false),
        h2s = heading(2, h2, false),
        h3s = heading(3, h3, first > 0),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modeles_ouverts_par_le_lecteur() {
        for t in [Template::Blank, Template::Article] {
            let bytes = create(t).unwrap();
            let mut d = Docx::from_bytes(bytes).unwrap();
            let m = d.model().unwrap();
            assert_eq!(m.paragraphs.len(), 1);
            assert!(m.page.is_some());
        }
        let mut a = Docx::from_bytes(create(Template::Article).unwrap()).unwrap();
        let page = a.model().unwrap().page.unwrap();
        assert_eq!(page.line_numbers.unwrap().restart, "newPage");
    }
}
