//! Lot 2 de « Git pour Word » : l'historique ne détruit plus rien et suit
//! le document s'il est déplacé.

mod common;

use atelier_docx::history::{self, Origin};
use atelier_docx::ops::{Op, apply};
use atelier_docx::{Docx, revision_of};
use common::*;
use serde_json::json;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::Once;

fn history_root() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        history::set_root(std::env::temp_dir().join(format!("atelier-docx-sans-perte-tests-{}", std::process::id())));
    });
}

fn temp_doc(bytes: &[u8]) -> (tempfile::TempDir, PathBuf) {
    history_root();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("article.docx");
    std::fs::write(&path, bytes).unwrap();
    (dir, path)
}

fn edit(path: &Path, v: serde_json::Value) -> String {
    let s = sig("Thierry");
    let origin = Origin { source: "panneau", author: "Thierry", label: "frappe" };
    let rev = Docx::open(path).unwrap().revision();
    let op: Op = serde_json::from_value(v).unwrap();
    atelier_docx::edit_file_as(path, Some(&rev), &origin, |d| apply(d, &op, true, &s)).unwrap().1
}

/// Une nouvelle ronde « de Word », au contenu propre à `n`.
fn word_round(n: usize) -> Vec<u8> {
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, bytes) in entries(&build("christophe")) {
        out.start_file(name.as_str(), opts).unwrap();
        if name == "word/document.xml" {
            let doc = String::from_utf8(bytes).unwrap().replacen("2.2 Fraction", &format!("2.{} Fraction", n + 10), 1);
            out.write_all(doc.as_bytes()).unwrap();
        } else {
            out.write_all(&bytes).unwrap();
        }
    }
    out.finish().unwrap().into_inner()
}

#[test]
fn la_fin_de_seance_reste_quand_word_remplace_le_document() {
    let (_d, path) = temp_doc(&build("christophe"));
    edit(&path, json!({"op": "accept", "id": 101}));
    let rev_atelier = edit(&path, json!({"op": "accept", "id": 102}));
    let laisse = std::fs::read(&path).unwrap();
    std::fs::write(&path, word_round(1)).unwrap();
    edit(&path, json!({"op": "reject", "id": 101}));

    let j = history::load(&path);
    assert_eq!(j.bases.len(), 2);
    assert_eq!(j.milestones.len(), 1, "le travail d'Atelier d'avant Word est un jalon");
    assert_eq!(j.milestones[0].revision, rev_atelier);
    assert_eq!(j.milestones[0].kind, "seance");
    assert_eq!(history::base_bytes(&path, &rev_atelier).unwrap(), laisse, "on peut toujours le rouvrir");
    let st = history::status(&path, &Docx::open(&path).unwrap().revision());
    assert_eq!(st.milestones.len(), 1);
}

#[test]
fn toutes_les_versions_recues_sont_gardees() {
    let original = build("christophe");
    let (_d, path) = temp_doc(&original);
    for n in 0..15 {
        edit(&path, json!({"op": "accept", "id": 101}));
        std::fs::write(&path, word_round(n)).unwrap();
    }
    edit(&path, json!({"op": "accept", "id": 101}));
    let j = history::load(&path);
    assert_eq!(j.bases.len(), 16, "plus de limite de 12 versions reçues");
    assert_eq!(history::base_bytes(&path, &revision_of(&original)).unwrap(), original);
    for b in &j.bases {
        assert!(history::base_bytes(&path, &b.revision).is_ok(), "version {} perdue", b.revision);
    }
    assert_eq!(j.milestones.len(), 15);
}

#[test]
fn un_journal_illisible_est_mis_de_cote_sans_rien_effacer() {
    let original = build("christophe");
    let (_d, path) = temp_doc(&original);
    edit(&path, json!({"op": "accept", "id": 101}));
    let dir = history::dir_for(&path);
    let avant: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name()).filter(|n| n.to_string_lossy().ends_with(".docx")).collect();
    assert!(!avant.is_empty());
    std::fs::write(dir.join("journal.json"), b"{ abime").unwrap();

    edit(&path, json!({"op": "accept", "id": 102}));
    for n in &avant {
        assert!(dir.join(n).is_file(), "{n:?} effacé");
    }
    let mis_de_cote = std::fs::read_dir(&dir).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with("journal-illisible-"));
    assert!(mis_de_cote, "l'ancien journal est gardé à part");
    assert_eq!(std::fs::read(dir.join(avant.iter().find(|n| n.to_string_lossy().starts_with(&revision_of(&original))).unwrap())).unwrap(), original);
}

#[test]
fn un_document_deplace_retrouve_son_historique() {
    let original = build("christophe");
    let (d, path) = temp_doc(&original);
    edit(&path, json!({"op": "accept", "id": 101}));
    let rev2 = edit(&path, json!({"op": "accept", "id": 102}));
    let ailleurs = d.path().join("iCloud");
    std::fs::create_dir(&ailleurs).unwrap();
    let neuf = ailleurs.join("article renommé.docx");
    std::fs::rename(&path, &neuf).unwrap();

    let st = history::status(&neuf, &rev2);
    assert!(st.can_undo, "l'annulation suit le document");
    assert_eq!(st.bases.len(), 1);
    assert_eq!(history::base_bytes(&neuf, &st.bases[0].revision).unwrap(), original);
    assert!(history::undo(&neuf, &rev2, false).is_ok());
    assert!(history::load(&neuf).path.ends_with("article renommé.docx"));
}

#[test]
fn un_document_disparu_garde_son_historique() {
    let (d, path) = temp_doc(&build("christophe"));
    edit(&path, json!({"op": "accept", "id": 101}));
    let dir = history::dir_for(&path);
    std::fs::remove_file(&path).unwrap();
    // Un autre document retouché ensuite ne range plus rien.
    let autre = d.path().join("autre.docx");
    std::fs::write(&autre, word_round(3)).unwrap();
    edit(&autre, json!({"op": "accept", "id": 101}));
    assert!(dir.join("journal.json").is_file());
}
