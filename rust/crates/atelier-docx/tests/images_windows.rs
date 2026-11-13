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
    with_emf_and(emf, |doc| doc)
}

fn with_emf_and(emf: &[u8], doc: impl Fn(String) -> String) -> Docx {
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
            "word/document.xml" => (name, doc(String::from_utf8(bytes).unwrap()).into_bytes()),
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

/// La bitmap PNG que le SVG embarque, en pixels RGBA.
fn png_in(svg: &str) -> (u32, u32, Vec<u8>) {
    use base64::Engine as _;
    let start = svg.find("data:image/png;base64,").expect("PNG dans le SVG") + "data:image/png;base64,".len();
    let end = start + svg[start..].find('"').unwrap();
    let png = base64::engine::general_purpose::STANDARD.decode(&svg[start..end]).unwrap();
    let mut reader = png::Decoder::new(Cursor::new(png)).read_info().unwrap();
    let mut buf = vec![0; reader.output_buffer_size()];
    let info = reader.next_frame(&mut buf).unwrap();
    buf.truncate(info.buffer_size());
    assert_eq!(info.color_type, png::ColorType::Rgba);
    (info.width, info.height, buf)
}

fn svg_of(mut d: Docx) -> String {
    let (bytes, mime) = atelier_docx::objects::media(&mut d, "p11", "rId5").unwrap().unwrap();
    assert_eq!(mime, "image/svg+xml");
    String::from_utf8(bytes).unwrap()
}

/// Word demande parfois un pixel de plus que la bitmap (formule collée :
/// 304 × 85 sur une image de 303 × 85). Windows le tolère ; l'image doit
/// s'afficher quand même, pas rester un « ? ».
#[test]
fn une_formule_qui_deborde_d_un_pixel_s_affiche_quand_meme() {
    let mut emf = emf_bitmap();
    // cxSrc de l'EMR_STRETCHDIBITS (enregistrement à 108, champ à +40) : 3 sur 2.
    emf[148..152].copy_from_slice(&3u32.to_le_bytes());
    let svg = svg_of(with_emf(&emf));
    let (w, h, _) = png_in(&svg);
    assert_eq!((w, h), (2, 2));
}

/// Un EMF « EMF+ seulement » comme celui d'une capture collée dans Word :
/// une bitmap brute de 1 × 2 pixels, ligne du haut noire, ligne du bas
/// blanche, pas positif (lignes rangées de haut en bas, comme GDI+).
fn emf_plus_capture() -> Vec<u8> {
    fn rec(kind: u16, flags: u16, data: &[u8]) -> Vec<u8> {
        let mut r = Vec::new();
        r.extend_from_slice(&kind.to_le_bytes());
        r.extend_from_slice(&flags.to_le_bytes());
        r.extend_from_slice(&(12 + data.len() as u32).to_le_bytes());
        r.extend_from_slice(&(data.len() as u32).to_le_bytes());
        r.extend_from_slice(data);
        r
    }
    let le = |v: &[u32]| v.iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>();
    let fl = |v: &[f32]| v.iter().flat_map(|x| x.to_le_bytes()).collect::<Vec<u8>>();
    let mut stream = rec(0x4001, 0, &le(&[0xdbc0_1002, 0, 96, 96]));
    let mut image = le(&[0xdbc0_1002, 1, 1, 2, 4, 0x0026_200a, 0]);
    image.extend_from_slice(&[0, 0, 0, 255, 255, 255, 255, 255]);
    stream.extend(rec(0x4008, 0x0500, &image));
    let mut draw = le(&[u32::MAX, 2]);
    draw.extend(fl(&[0.0, 0.0, 1.0, 2.0, 0.0, 0.0, 10.0, 20.0]));
    stream.extend(rec(0x401a, 0, &draw));
    stream.extend(rec(0x4002, 0, &[]));
    // EMR_GDICOMMENT : type 70, taille, taille des données, « EMF+ », flux.
    let mut comment = le(&[70, 12 + 4 + stream.len() as u32, 4 + stream.len() as u32]);
    comment.extend_from_slice(b"EMF+");
    comment.extend(stream);
    let eof = le(&[14, 20, 0, 16, 20]);
    let total = 108 + comment.len() + eof.len();
    let mut e = le(&[1, 108, 0, 0, 10, 20, 0, 0, 265, 529, 0x464D_4520, 0x10000, total as u32, 3, 1, 0, 0, 0, 1024, 768, 320, 240, 0, 0, 0, 320_000, 240_000]);
    assert_eq!(e.len(), 108);
    e.extend(comment);
    e.extend(eof);
    e
}

#[test]
fn une_capture_emf_plus_s_affiche_a_l_endroit() {
    let svg = svg_of(with_emf(&emf_plus_capture()));
    let (w, h, px) = png_in(&svg);
    assert_eq!((w, h), (1, 2));
    assert_eq!(&px[..4], &[0, 0, 0, 255], "la ligne du haut est noire");
    assert_eq!(&px[4..8], &[255, 255, 255, 255], "la ligne du bas est blanche");
}

/// Image recadrée dans Word (`a:srcRect`) : le modèle porte le recadrage et
/// l'image ne montre que la zone gardée.
#[test]
fn une_image_recadree_dans_word_l_est_aussi_dans_atelier() {
    let mut d = with_emf_and(&emf_bitmap(), |doc| doc.replace(r#"<a:blip r:embed="rId5"/>"#, r#"<a:blip r:embed="rId5"/><a:srcRect l="10700" t="8500" r="29500" b="40000"/>"#));
    let m = d.model().unwrap();
    let img = m.all_paragraphs().flat_map(|p| p.segments.clone()).find(|s| s.media.is_some()).unwrap();
    let c = img.crop.expect("recadrage lu");
    for (got, want) in c.iter().zip([0.107, 0.085, 0.295, 0.4]) {
        assert!((got - want).abs() < 1e-9, "{c:?}");
    }
    let (bytes, mime) = atelier_docx::objects::cropped((b"\x89PNG".to_vec(), "image/png"), c);
    assert_eq!(mime, "image/svg+xml");
    let svg = String::from_utf8(bytes).unwrap();
    // Zone gardée : 59,8 % de la largeur, 51,5 % de la hauteur.
    assert!(svg.contains(r#"x="-178.930" y="-165.049" width="1672.241" height="1941.748""#), "{svg}");
    assert!(svg.contains("data:image/png;base64,iVBORw=="), "{svg}");
}

#[test]
fn une_image_sans_recadrage_ne_change_pas() {
    let img = (b"\x89PNG".to_vec(), "image/png");
    assert_eq!(atelier_docx::objects::cropped(img.clone(), [0.0; 4]), img);
}
