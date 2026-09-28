//! L'outil `atelier-pdf` contre les sorties de poppler déjà figées dans le
//! dépôt : la fixture `twocol.xml` du mode lecture (`pdftohtml -xml -zoom 1`)
//! et `sample.pdf` de la base d'articles.
//!
//! Sans `libpdfium` (développement sans `scripts/fetch-pdfium.sh`), l'outil
//! passerait la main à poppler et ne testerait plus rien : ces tests sont
//! alors sautés, sauf en CI (`CI` défini) où la bibliothèque est exigée.

use std::path::{Path, PathBuf};
use std::process::Command;

fn repo() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn pdfium_ready() -> bool {
    if atelier_pdf::engine::library_candidates().iter().any(|p| p.is_file()) {
        return true;
    }
    assert!(
        std::env::var_os("CI").is_none(),
        "libpdfium absente en CI : lancer scripts/fetch-pdfium.sh"
    );
    eprintln!("libpdfium absente : test sauté (scripts/fetch-pdfium.sh)");
    false
}

fn run(kind: &str, pdf: &Path) -> String {
    let out = Command::new(env!("CARGO_BIN_EXE_atelier-pdf"))
        .arg(kind)
        .arg(pdf)
        .output()
        .expect("atelier-pdf lancé");
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8(out.stdout).expect("UTF-8")
}

fn twocol() -> PathBuf {
    repo().join("rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.pdf")
}

/// `<text>` d'un XML de pdftohtml : (top, left, texte).
fn texts(xml: &str) -> Vec<(i32, i32, String)> {
    let options = roxmltree::ParsingOptions { allow_dtd: true, ..Default::default() };
    let doc = roxmltree::Document::parse_with_options(xml, options).expect("XML valide");
    doc.descendants()
        .filter(|n| n.has_tag_name("text"))
        .map(|n| {
            let num = |name| n.attribute(name).and_then(|v| v.parse().ok()).expect("coordonnée");
            let text: String = n.descendants().filter(|d| d.is_text()).filter_map(|d| d.text()).collect();
            (num("top"), num("left"), text)
        })
        .collect()
}

#[test]
fn reading_xml_matches_the_pdftohtml_fixture() {
    if !pdfium_ready() {
        return;
    }
    let ours = run("xml", &twocol());
    let fixture = std::fs::read_to_string(
        repo().join("rust/crates/atelier-gallery/tests/fixtures/reflow/twocol.xml"),
    )
    .unwrap();
    let (ours, theirs) = (texts(&ours), texts(&fixture));
    assert_eq!(ours.len(), theirs.len());
    let matched = theirs
        .iter()
        .filter(|(top, left, text)| {
            ours.iter().any(|(t, l, o)| o == text && (t - top).abs() <= 2 && (l - left).abs() <= 2)
        })
        .count();
    assert!(matched * 100 >= theirs.len() * 95, "{matched}/{} morceaux retrouvés", theirs.len());
    assert!(ours.iter().any(|(_, _, t)| t == "Introduction"));
}

#[test]
fn word_boxes_follow_the_pdftotext_layout() {
    if !pdfium_ready() {
        return;
    }
    let xml = run("bbox", &twocol());
    let doc = roxmltree::Document::parse(&xml).expect("XHTML valide");
    let pages: Vec<_> = doc.descendants().filter(|n| n.has_tag_name("page")).collect();
    assert_eq!(pages.len(), 2);
    assert_eq!(pages[0].attribute("width"), Some("595.276000"));
    assert_eq!(pages[0].attribute("height"), Some("841.890000"));
    let words: Vec<_> = pages[0].descendants().filter(|n| n.has_tag_name("word")).collect();
    assert!(words.len() > 200, "{} mots", words.len());
    for word in &words {
        let v = |name| word.attribute(name).and_then(|v| v.parse::<f32>().ok()).unwrap();
        assert!(v("xMin") < v("xMax") && v("yMin") < v("yMax"));
        assert!(v("xMax") <= 596.0 && v("yMax") <= 842.0);
    }
    for kind in ["flow", "block", "line"] {
        assert!(doc.descendants().any(|n| n.has_tag_name(kind)), "<{kind}> manquant");
    }
}

#[test]
fn text_reads_the_article_sample_page_by_page() {
    if !pdfium_ready() {
        return;
    }
    let text = run("text", &repo().join("gallery/tests/kb_parity/inputs/sample.pdf"));
    assert!(text.starts_with("Melting of Alpine Glaciers Under Recent Warming\n"), "{text}");
    assert!(text.contains("10.1234/fixture.2022.001"));
    assert!(text.ends_with('\u{c}'));
}

#[test]
fn a_bad_call_fails_without_output() {
    let out = Command::new(env!("CARGO_BIN_EXE_atelier-pdf")).arg("text").output().unwrap();
    assert_eq!(out.status.code(), Some(2));
    let out = Command::new(env!("CARGO_BIN_EXE_atelier-pdf"))
        .args(["text", "/nulle/part.pdf"])
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(1));
    assert!(out.stdout.is_empty());
    assert!(String::from_utf8_lossy(&out.stderr).contains("PDF introuvable"));
}
