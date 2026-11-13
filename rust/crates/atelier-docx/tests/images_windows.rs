//! Images au format de Windows (EMF, WMF) : formules collées depuis
//! l'éditeur d'équations, captures, graphiques d'Excel. Aucun navigateur ne
//! les affiche ; le moteur les rend en SVG (2026-11-13, un TP où la formule
//! de conductivité hydraulique restait un cadre vide avec un « ? »).

mod common;

use atelier_docx::Docx;
use std::io::{Cursor, Read, Write};
use zip::write::SimpleFileOptions;

/// Le paquet de la fixture, avec sa figure remplacée par `media/image1.emf`.
fn with_emf(emf: &[u8]) -> Docx {
    let src = common::build("christophe");
    let mut zin = zip::ZipArchive::new(Cursor::new(src)).unwrap();
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for i in 0..zin.len() {
        let mut f = zin.by_index(i).unwrap();
        let name = f.name().to_string();
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).unwrap();
        let (name, bytes) = match name.as_str() {
            "word/media/image1.png" => ("word/media/image1.emf".to_string(), emf.to_vec()),
            "word/_rels/document.xml.rels" => (
                name,
                String::from_utf8(bytes)
                    .unwrap()
                    .replace("media/image1.png", "media/image1.emf")
                    .into_bytes(),
            ),
            "[Content_Types].xml" => {
                let ct = String::from_utf8(bytes).unwrap().replace("<Default Extension=\"xml\"", "<Default Extension=\"emf\" ContentType=\"image/x-emf\"/><Default Extension=\"xml\"");
                (name, ct.into_bytes())
            }
            _ => (name, bytes),
        };
        out.start_file(name, SimpleFileOptions::default()).unwrap();
        out.write_all(&bytes).unwrap();
    }
    Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap()
}

fn u32s(out: &mut Vec<u8>, v: &[u32]) {
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
}

/// Un EMF comme ceux que Word fabrique au collage d'une formule : une seule
/// image bitmap (EMR_STRETCHDIBITS) de 2 × 2 pixels.
fn emf_bitmap() -> Vec<u8> {
    let mut e = Vec::new();
    // En-tête (EMR_HEADER, 108 octets) : bornes, cadre en 0,01 mm, signature « EMF ».
    u32s(
        &mut e,
        &[
            1,
            108,
            0,
            0,
            1,
            1,
            0,
            0,
            53,
            53,
            0x464D_4520,
            0x10000,
            264,
            3,
            1,
            0,
            0,
            0,
            1024,
            768,
            320,
            240,
            0,
            0,
            0,
            320_000,
            240_000,
        ],
    );
    assert_eq!(e.len(), 108);
    // EMR_STRETCHDIBITS : 80 octets d'enregistrement, BITMAPINFOHEADER, pixels.
    u32s(
        &mut e,
        &[
            81,
            136,
            0,
            0,
            1,
            1,
            0,
            0,
            0,
            0,
            2,
            2,
            80,
            40,
            120,
            16,
            0,
            0x00CC_0020,
            2,
            2,
        ],
    );
    u32s(&mut e, &[40, 2, 2]);
    e.extend_from_slice(&1u16.to_le_bytes());
    e.extend_from_slice(&32u16.to_le_bytes());
    u32s(&mut e, &[0, 16, 0, 0, 0, 0]);
    for px in [
        [0u8, 0, 0, 255],
        [255, 255, 255, 255],
        [255, 255, 255, 255],
        [0, 0, 0, 255],
    ] {
        e.extend_from_slice(&px);
    }
    // EMR_EOF.
    u32s(&mut e, &[14, 20, 0, 16, 20]);
    assert_eq!(e.len(), 264);
    e
}

#[test]
fn une_formule_en_emf_s_affiche_en_svg() {
    let mut d = with_emf(&emf_bitmap());
    let (bytes, mime) = atelier_docx::objects::media(&mut d, "p11", "rId5")
        .unwrap()
        .unwrap();
    assert_eq!(mime, "image/svg+xml");
    let svg = String::from_utf8(bytes).unwrap();
    assert!(
        svg.starts_with("<svg") || svg.starts_with("<?xml"),
        "{}",
        &svg[..svg.len().min(200)]
    );
    assert!(
        svg.contains("data:image/png;base64,"),
        "la bitmap de la formule doit être dans le SVG"
    );
}

#[test]
fn un_emf_illisible_part_tel_quel() {
    let mut broken = emf_bitmap();
    broken.truncate(120);
    let mut d = with_emf(&broken);
    let (bytes, mime) = atelier_docx::objects::media(&mut d, "p11", "rId5")
        .unwrap()
        .unwrap();
    assert_eq!((bytes, mime), (broken, "image/x-emf"));
}

#[test]
fn les_images_ordinaires_ne_changent_pas() {
    let mut d = common::open("christophe");
    assert_eq!(
        atelier_docx::objects::media(&mut d, "p11", "rId5")
            .unwrap()
            .unwrap()
            .1,
        "image/png"
    );
}
