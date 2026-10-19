#![allow(dead_code)]

use atelier_docx::{Docx, Signature};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;

pub fn fixture_dir(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

/// Zippe un dossier de fixture dans l'ordre de Word ([Content_Types] d'abord).
pub fn build(name: &str) -> Vec<u8> {
    let dir = fixture_dir(name);
    let mut files = Vec::new();
    collect(&dir, &dir, &mut files);
    files.sort_by_key(|(rel, _)| (rel != "[Content_Types].xml", rel.clone()));
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for (rel, path) in files {
        out.start_file(rel, SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)).unwrap();
        out.write_all(&std::fs::read(path).unwrap()).unwrap();
    }
    out.finish().unwrap().into_inner()
}

fn collect(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            collect(root, &p, out);
        } else {
            out.push((p.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/"), p));
        }
    }
}

pub fn open(name: &str) -> Docx {
    Docx::from_bytes(build(name)).unwrap()
}

pub fn sig(author: &str) -> Signature {
    Signature { author: author.into(), initials: atelier_docx::initials(author), date: "2026-10-19T19:00:00Z".into() }
}

/// Enregistre puis rouvre : vérifie que le paquet reste lisible.
pub fn reopen(docx: &Docx) -> Docx {
    Docx::from_bytes(docx.to_bytes().unwrap()).unwrap()
}

pub fn entries(bytes: &[u8]) -> Vec<(String, Vec<u8>)> {
    let mut a = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    (0..a.len())
        .map(|i| {
            let mut f = a.by_index(i).unwrap();
            let mut v = Vec::new();
            f.read_to_end(&mut v).unwrap();
            (f.name().to_string(), v)
        })
        .collect()
}

pub fn para_text(docx: &mut Docx, id: &str) -> String {
    docx.model().unwrap().paragraphs.into_iter().find(|p| p.id == id).unwrap().text
}

/// LibreOffice sait-il ouvrir le résultat ? (test sauté s'il est absent)
pub fn libreoffice_text(bytes: &[u8]) -> Option<String> {
    let bin = ["soffice", "libreoffice"].into_iter().find(|b| std::process::Command::new("which").arg(b).output().is_ok_and(|o| o.status.success()))?;
    let dir = tempfile::tempdir().unwrap();
    let input = dir.path().join("doc.docx");
    std::fs::write(&input, bytes).unwrap();
    let status = std::process::Command::new(bin)
        .args(["--headless", &format!("-env:UserInstallation=file://{}/profile", dir.path().display()), "--convert-to", "txt:Text (encoded):UTF8", "--outdir"])
        .arg(dir.path())
        .arg(&input)
        .output()
        .ok()?;
    if !status.status.success() {
        return None;
    }
    std::fs::read_to_string(dir.path().join("doc.txt")).ok()
}
