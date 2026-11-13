//! Objets insérés : appels de note (la note naît dans footnotes.xml ou
//! endnotes.xml) et figures (l'image entre dans word/media/). L'appel ou la
//! figure est un run écrit d'avance, épissé à la position voulue comme une
//! frappe : en suivi, il est enveloppé d'un `w:ins` signé.

use crate::edit::{self, EditResult};
use crate::story::{ENDNOTES, FOOTNOTES, Scope, is_real_note, parse_ref};
use crate::xml::{self, escape_attr, escape_text, is_w, w_attr};
use crate::{DOCUMENT, Docx, Result, Signature, err};
use serde::Serialize;

const CT_FOOTNOTES: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml";
const CT_ENDNOTES: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml";
const REL_FOOTNOTES: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
const REL_ENDNOTES: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes";
const REL_IMAGE: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const STYLES: &str = "word/styles.xml";
/// Pixels → EMU (96 ppp).
const EMU_PX: u64 = 9525;

#[derive(Debug, Serialize)]
pub struct Inserted {
    /// Note : `n3` / `e3` (ses paragraphes : `n3.p0`…) ; figure : sa relation.
    pub id: String,
    pub changes: Vec<u32>,
}

/// Identifiant de style dont le nom (`w:name`) est `name`.
fn style_id(docx: &mut Docx, name: &str) -> Result<Option<String>> {
    let Some(src) = docx.part(STYLES)? else { return Ok(None) };
    let doc = xml::parse(&src)?;
    Ok(doc
        .root_element()
        .children()
        .filter(|s| is_w(*s, "style"))
        .find(|s| xml::w_child(*s, "name").and_then(|n| w_attr(n, "val")).is_some_and(|v| v.eq_ignore_ascii_case(name)))
        .and_then(|s| w_attr(s, "styleId").map(str::to_string)))
}

/// Ajoute un appel de note à la position `at` de `paragraph`, et la note
/// (texte `text`) à la fin de footnotes.xml ou endnotes.xml.
pub fn insert_note(docx: &mut Docx, paragraph: &str, at: usize, text: &str, endnote: bool, tracked: bool, sig: &Signature) -> Result<Inserted> {
    if parse_ref(paragraph)?.scope != Scope::Body {
        return err("une note s'appelle depuis le corps du document, pas depuis une note, un en-tête ou un pied de page");
    }
    let (part, tag, letter, ct, rel, label) = if endnote {
        (ENDNOTES, "endnote", 'e', CT_ENDNOTES, REL_ENDNOTES, "endnote")
    } else {
        (FOOTNOTES, "footnote", 'n', CT_FOOTNOTES, REL_FOOTNOTES, "footnote")
    };
    let root = format!("{tag}s");
    if !docx.has_part(part) {
        // Comme Word : les deux séparateurs d'abord.
        let body = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:{root} xmlns:w="{w}"><w:{tag} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:{tag}><w:{tag} w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:{tag}></w:{root}>"#,
            w = xml::W
        );
        docx.create_part(part, ct, rel, body)?;
    }
    let src = docx.part(part)?.unwrap_or_default();
    let id = {
        let doc = xml::parse(&src)?;
        xml::require_w_prefix(&doc)?;
        doc.root_element().children().filter(|n| is_w(*n, tag) && is_real_note(*n)).filter_map(|n| w_attr(n, "id")?.trim().parse::<i64>().ok()).max().unwrap_or(0).max(0) + 1
    };
    let ref_style = style_id(docx, &format!("{label} reference"))?;
    let text_style = style_id(docx, &format!("{label} text"))?;
    let ref_rpr = match &ref_style {
        Some(s) => format!(r#"<w:rPr><w:rStyle w:val="{}"/></w:rPr>"#, escape_attr(s)),
        None => r#"<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>"#.to_string(),
    };

    // L'appel dans le corps, puis la note : leurs suivis se suivent.
    let call = format!(r#"<w:r>{ref_rpr}<w:{tag}Reference w:id="{id}"/></w:r>"#);
    let mut changes = edit::insert_raw(docx, paragraph, at, &call, tracked, sig)?.changes;
    let mut runs = format!(r#"<w:r>{ref_rpr}<w:{tag}Ref/></w:r><w:r><w:t xml:space="preserve"> {}</w:t></w:r>"#, escape_text(text));
    if tracked {
        let ins = edit::next_ids(docx, 1)?[0];
        runs = format!(r#"<w:ins w:id="{ins}" w:author="{}" w:date="{}">{runs}</w:ins>"#, escape_attr(&sig.author), escape_attr(&sig.date));
        changes.push(ins);
    }
    let ppr = text_style.map(|s| format!(r#"<w:pPr><w:pStyle w:val="{}"/></w:pPr>"#, escape_attr(&s))).unwrap_or_default();
    let note = format!(r#"<w:{tag} w:id="{id}"><w:p>{ppr}{runs}</w:p></w:{tag}>"#);
    let src = docx.part(part)?.unwrap_or_default();
    let close = src.rfind(&format!("</w:{root}>")).ok_or_else(|| crate::DocxError(format!("{part} illisible")))?;
    docx.set_part(part, format!("{}{note}{}", &src[..close], &src[close..]));
    Ok(Inserted { id: format!("{letter}{id}"), changes })
}

/// Image d'un paragraphe : octets et type MIME, d'après la relation `rel`
/// de la partie qui porte le paragraphe.
/// Les EMF/WMF sortent en SVG, comme le navigateur peut les afficher.
pub fn media(docx: &mut Docx, paragraph: &str, rel: &str) -> Result<Option<(Vec<u8>, &'static str)>> {
    Ok(media_raw(docx, paragraph, rel)?.map(for_browser))
}

/// Comme [`media`], mais les octets tels qu'ils sont dans le paquet : à
/// convertir avec [`for_browser`] hors du verrou de la séance (un EMF+ de
/// quelques Mo prend un moment).
pub fn media_raw(docx: &mut Docx, paragraph: &str, rel: &str) -> Result<Option<(Vec<u8>, &'static str)>> {
    let part = parse_ref(paragraph)?.part;
    let Some(target) = docx.rel_target(&part, rel)? else { return Ok(None) };
    let Some(bytes) = docx.binary(&target)? else { return Ok(None) };
    let mime = mime_of(&target, &bytes);
    Ok(Some((bytes, mime)))
}

/// Les navigateurs (WebKit compris) n'affichent ni l'EMF ni le WMF de
/// Windows : formules collées depuis l'éditeur d'équations, captures,
/// graphiques d'Excel. On les rejoue en SVG (EMF+ compris) ; en cas
/// d'échec, l'image part telle quelle.
pub fn for_browser((bytes, mime): (Vec<u8>, &'static str)) -> (Vec<u8>, &'static str) {
    let emf = bytes.len() > 44 && bytes[..4] == [1, 0, 0, 0] && &bytes[40..44] == b" EMF";
    let wmf = bytes.starts_with(&[0xD7, 0xCD, 0xC6, 0x9A]) || (bytes.len() > 18 && matches!(bytes[..4], [1 | 2, 0, 9, 0]));
    if !(emf || wmf || matches!(mime, "image/x-emf" | "image/x-wmf")) {
        return (bytes, mime);
    }
    let fixed = if emf { repair_emf(&bytes) } else { None };
    match metafile::to_svg(fixed.as_deref().unwrap_or(&bytes), metafile::RenderOptions::default()) {
        Ok(r) => (r.svg.into_bytes(), "image/svg+xml"),
        Err(_) => (bytes, mime),
    }
}

/// Recadrage de Word (`a:srcRect`, fractions l, t, r, b de l'image retirées
/// de chaque bord) : l'image part dans un SVG qui n'en montre que la zone
/// gardée, étirée à la taille du cadre comme dans Word. Sans recadrage
/// utile, l'image ne change pas.
pub fn cropped((bytes, mime): (Vec<u8>, &'static str), [l, t, r, b]: [f64; 4]) -> (Vec<u8>, &'static str) {
    use base64::Engine as _;
    let (w, h) = (1.0 - l - r, 1.0 - t - b);
    let finite = [l, t, r, b].iter().all(|v| v.is_finite() && v.abs() < 10.0);
    if !finite || w < 0.01 || h < 0.01 || [l, t, r, b].iter().all(|v| v.abs() < 1e-4) {
        return (bytes, mime);
    }
    let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let svg = format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"><image href="data:{mime};base64,{data}" x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" preserveAspectRatio="none"/></svg>"#,
        -l / w * 1000.0,
        -t / h * 1000.0,
        1000.0 / w,
        1000.0 / h,
    );
    (svg.into_bytes(), "image/svg+xml")
}

/// Deux écarts de metafile 1.0.1 face aux EMF de Word, corrigés dans une
/// copie avant le rendu (`None` : rien à corriger).
/// - EMR_STRETCHDIBITS qui demande un pixel de plus que sa bitmap (formule
///   collée : 304 × 85 sur une image de 303 × 85) : Windows le tolère,
///   metafile refuse toute l'image ; la zone est ramenée à la bitmap.
/// - Bitmap brute d'un objet image EMF+ : GDI+ range les lignes de haut en
///   bas quand le pas (stride) est positif, metafile lit l'inverse et la
///   capture sortait à l'envers ; le signe du pas est inversé pour lui.
fn repair_emf(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut out = bytes.to_vec();
    let mut changed = false;
    let mut continuing = false;
    let mut off = 0usize;
    while let (Some(kind), Some(size)) = (u32_at(&out, off), u32_at(&out, off + 4)) {
        let size = size as usize;
        if size < 8 || off + size > out.len() {
            break;
        }
        match kind {
            81 => changed |= clamp_stretchdibits(&mut out[off..off + size]),
            70 if out.get(off + 12..off + 16) == Some(b"EMF+") => {
                let len = (u32_at(&out, off + 8).unwrap_or(0) as usize).min(size - 12);
                if len >= 4 {
                    changed |= emf_plus_strides(&mut out[off + 16..off + 12 + len], &mut continuing);
                }
            }
            14 => break, // EMR_EOF
            _ => {}
        }
        off += size;
    }
    changed.then_some(out)
}

fn u32_at(b: &[u8], o: usize) -> Option<u32> {
    Some(u32::from_le_bytes(b.get(o..o.checked_add(4)?)?.try_into().ok()?))
}

fn i32_at(b: &[u8], o: usize) -> Option<i32> {
    u32_at(b, o).map(|v| v as i32)
}

/// EMR_STRETCHDIBITS : xSrc 32, ySrc 36, cxSrc 40, cySrc 44, offBmiSrc 48
/// (depuis le début de l'enregistrement), puis BITMAPINFOHEADER.
fn clamp_stretchdibits(rec: &mut [u8]) -> bool {
    let (Some(x), Some(y), Some(cx), Some(cy), Some(bmi)) = (i32_at(rec, 32), i32_at(rec, 36), i32_at(rec, 40), i32_at(rec, 44), u32_at(rec, 48)) else { return false };
    let bmi = bmi as usize;
    let (Some(header), Some(w), Some(h)) = (u32_at(rec, bmi), i32_at(rec, bmi + 4), i32_at(rec, bmi + 8)) else { return false };
    if header < 40 || w <= 0 {
        return false;
    }
    let h = i32::try_from(h.unsigned_abs()).unwrap_or(i32::MAX);
    let fit = |origin: i32, extent: i32, max: i32| (extent > 0 && origin >= 0 && origin < max && origin.saturating_add(extent) > max).then(|| max - origin);
    let mut changed = false;
    if let Some(v) = fit(x, cx, w) {
        rec[40..44].copy_from_slice(&v.to_le_bytes());
        changed = true;
    }
    if let Some(v) = fit(y, cy, h) {
        rec[44..48].copy_from_slice(&v.to_le_bytes());
        changed = true;
    }
    changed
}

/// Enregistrements EMF+ d'un commentaire : objets image (EmfPlusObject,
/// type d'objet 5) à bitmap brute ; seul le premier morceau d'un objet en
/// plusieurs porte l'en-tête (chaque morceau commence par la taille totale).
fn emf_plus_strides(recs: &mut [u8], continuing: &mut bool) -> bool {
    let mut changed = false;
    let mut off = 0usize;
    while off + 12 <= recs.len() {
        let kind = u16::from_le_bytes([recs[off], recs[off + 1]]);
        let flags = u16::from_le_bytes([recs[off + 2], recs[off + 3]]);
        let size = u32_at(recs, off + 4).unwrap_or(0) as usize;
        if size < 12 || off + size > recs.len() {
            break;
        }
        if kind == 0x4008 {
            let len = (u32_at(recs, off + 8).unwrap_or(0) as usize).min(size - 12);
            let data = &mut recs[off + 12..off + 12 + len];
            let continued = flags & 0x8000 != 0;
            let first = !*continuing;
            let image = data.get_mut(if continued || *continuing { 4 } else { 0 }..).filter(|_| first && (flags >> 8) & 0x7f == 5);
            if let Some(img) = image {
                // EmfPlusImage : version, type (1 = bitmap) ; EmfPlusBitmap :
                // largeur 8, hauteur 12, pas 16, format 20, données 24 (0 = brutes).
                if let Some(stride) = i32_at(img, 16).filter(|s| *s != 0 && u32_at(img, 4) == Some(1) && u32_at(img, 24) == Some(0)) {
                    img[16..20].copy_from_slice(&stride.wrapping_neg().to_le_bytes());
                    changed = true;
                }
            }
            *continuing = continued;
        }
        off += size;
    }
    changed
}

fn mime_of(name: &str, bytes: &[u8]) -> &'static str {
    match sniff(bytes) {
        Some((ext, _, _)) => content_type(ext),
        None => match name.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "emf" => "image/x-emf",
            "wmf" => "image/x-wmf",
            "tif" | "tiff" => "image/tiff",
            _ => "application/octet-stream",
        },
    }
}

fn content_type(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpeg" => "image/jpeg",
        _ => "image/gif",
    }
}

/// Format et taille en pixels d'une image PNG, JPEG ou GIF.
fn sniff(b: &[u8]) -> Option<(&'static str, u32, u32)> {
    let be32 = |i: usize| b.get(i..i + 4).map(|s| u32::from_be_bytes([s[0], s[1], s[2], s[3]]));
    let be16 = |i: usize| b.get(i..i + 2).map(|s| u16::from_be_bytes([s[0], s[1]]) as u32);
    if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(("png", be32(16)?, be32(20)?));
    }
    if b.starts_with(b"GIF8") {
        let le16 = |i: usize| b.get(i..i + 2).map(|s| u16::from_le_bytes([s[0], s[1]]) as u32);
        return Some(("gif", le16(6)?, le16(8)?));
    }
    if b.starts_with(&[0xFF, 0xD8]) {
        let mut i = 2;
        while i + 9 < b.len() {
            if b[i] != 0xFF {
                i += 1;
                continue;
            }
            let marker = b[i + 1];
            let len = be16(i + 2)? as usize;
            // SOF0..SOF15 sauf DHT (C4), JPG (C8), DAC (CC).
            if (0xC0..=0xCF).contains(&marker) && ![0xC4, 0xC8, 0xCC].contains(&marker) {
                return Some(("jpeg", be16(i + 7)?, be16(i + 5)?));
            }
            i += 2 + len;
        }
    }
    None
}

/// Largeur du texte (EMU) : page moins marges de la dernière section.
fn text_width(docx: &mut Docx) -> Result<u64> {
    let src = docx.part(DOCUMENT)?.unwrap_or_default();
    let doc = xml::parse(&src)?;
    let twips = |n: Option<roxmltree::Node>, a: &str| n.and_then(|n| w_attr(n, a)).and_then(|v| v.parse::<u64>().ok());
    let sect = doc.descendants().rfind(|n| is_w(*n, "sectPr"));
    let pg = sect.and_then(|s| xml::w_child(s, "pgSz"));
    let mar = sect.and_then(|s| xml::w_child(s, "pgMar"));
    let w = twips(pg, "w").unwrap_or(12240).saturating_sub(twips(mar, "left").unwrap_or(1440) + twips(mar, "right").unwrap_or(1440));
    Ok(w.max(1440) * 635)
}

/// Plus grand `wp:docPr/@id` du document : chaque dessin a le sien.
fn max_docpr(docx: &mut Docx) -> Result<u64> {
    let mut max = 0;
    for part in docx.story_parts() {
        let src = docx.part(&part)?.unwrap_or_default();
        let doc = xml::parse(&src)?;
        for n in doc.descendants().filter(|n| n.tag_name().name() == "docPr") {
            max = max.max(n.attribute("id").and_then(|v| v.parse().ok()).unwrap_or(0));
        }
    }
    Ok(max)
}

/// Insère l'image `bytes` (PNG, JPEG ou GIF) à la position `at`, à sa taille
/// réelle à 96 ppp, réduite à la largeur du texte si besoin.
#[allow(clippy::too_many_arguments)]
pub fn insert_image(docx: &mut Docx, paragraph: &str, at: usize, bytes: Vec<u8>, name: &str, alt: &str, tracked: bool, sig: &Signature) -> Result<Inserted> {
    let Some((ext, w, h)) = sniff(&bytes) else {
        return err("format d'image non pris en charge : PNG, JPEG ou GIF");
    };
    if w == 0 || h == 0 {
        return err("image vide");
    }
    let part = parse_ref(paragraph)?.part;
    let (mut cx, mut cy) = (w as u64 * EMU_PX, h as u64 * EMU_PX);
    let max = text_width(docx)?;
    if cx > max {
        cy = cy * max / cx;
        cx = max;
    }
    let names = docx.entry_names();
    let mut k = 1;
    while names.iter().any(|n| *n == format!("word/media/atelier{k}.{ext}")) {
        k += 1;
    }
    let file = format!("word/media/atelier{k}.{ext}");
    docx.add_binary(&file, bytes);
    docx.ensure_default_type(ext, content_type(ext))?;
    // Cible relative au dossier de la partie (word/).
    let rel = docx.add_rel(&part, REL_IMAGE, &format!("media/atelier{k}.{ext}"))?;
    let pr = max_docpr(docx)? + 1;
    let title = if alt.is_empty() { name } else { alt };
    let run = format!(
        concat!(
            r#"<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">"#,
            r#"<wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{pr}" name="{name}" descr="{descr}"/>"#,
            r#"<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">"#,
            r#"<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="{file}"/><pic:cNvPicPr/></pic:nvPicPr>"#,
            r#"<pic:blipFill><a:blip r:embed="{rel}" xmlns:r="{r}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>"#,
            r#"<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>"#,
            r#"</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"#
        ),
        cx = cx,
        cy = cy,
        pr = pr,
        name = escape_attr(&format!("Figure {pr}")),
        descr = escape_attr(title),
        file = escape_attr(&format!("atelier{k}.{ext}")),
        rel = rel,
        r = xml::R,
    );
    let EditResult { changes } = edit::insert_raw(docx, paragraph, at, &run, tracked, sig)?;
    Ok(Inserted { id: rel, changes })
}

#[cfg(test)]
mod tests {
    use super::sniff;

    #[test]
    fn taille_des_images() {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&640u32.to_be_bytes());
        png.extend_from_slice(&480u32.to_be_bytes());
        assert_eq!(sniff(&png), Some(("png", 640, 480)));
        let jpg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 0, 0, 0xFF, 0xC0, 0, 11, 8, 1, 0x2C, 2, 0x58, 3, 0, 0, 0];
        assert_eq!(sniff(&jpg), Some(("jpeg", 600, 300)));
        assert_eq!(sniff(b"GIF89a\x10\0\x20\0"), Some(("gif", 16, 32)));
        assert_eq!(sniff(b"rien"), None);
    }
}
