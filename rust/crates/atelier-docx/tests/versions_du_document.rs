//! « Enregistrer une nouvelle version » et « Ouvrir la version reçue » :
//! des copies à côté du document, jamais d'écrasement.

mod common;

use atelier_docx::history::{self, Origin};
use atelier_docx::ops::{Op, apply};
use atelier_docx::{Docx, revision_of, versions};
use common::*;
use serde_json::json;
use std::path::{Path, PathBuf};
use std::sync::Once;

fn history_root() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        history::set_root(std::env::temp_dir().join(format!("atelier-docx-versions-tests-{}", std::process::id())));
    });
}

fn temp_doc(name: &str) -> (tempfile::TempDir, PathBuf) {
    history_root();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(name);
    std::fs::write(&path, build("christophe")).unwrap();
    (dir, path)
}

fn accept(path: &Path, id: u32) {
    let s = sig("Thierry");
    let origin = Origin { source: "panneau", author: "Thierry", label: "accepter" };
    let rev = Docx::open(path).unwrap().revision();
    let op: Op = serde_json::from_value(json!({"op": "accept", "id": id})).unwrap();
    atelier_docx::edit_file_as(path, Some(&rev), &origin, |d| apply(d, &op, true, &s)).unwrap();
}

fn name(p: &Path) -> String {
    p.file_name().unwrap().to_string_lossy().into_owned()
}

#[test]
fn chaque_nouvelle_version_prend_le_numero_suivant_sans_toucher_l_original() {
    let (_dir, path) = temp_doc("Chap_revCK.docx");
    let before = std::fs::read(&path).unwrap();
    assert_eq!(versions::next_version_name(&path).as_deref(), Some("Chap_revCK_v2.docx"));
    let v2 = versions::save_version(&path).unwrap();
    assert_eq!(name(&v2), "Chap_revCK_v2.docx");
    assert_eq!(std::fs::read(&v2).unwrap(), before);
    assert_eq!(std::fs::read(&path).unwrap(), before, "l'original ne bouge pas");
    let v3 = versions::save_version(&path).unwrap();
    assert_eq!(name(&v3), "Chap_revCK_v3.docx");
    // Depuis une version, la suivante continue la série.
    accept(&v3, 101);
    let v4 = versions::save_version(&v3).unwrap();
    assert_eq!(name(&v4), "Chap_revCK_v4.docx");
    assert_eq!(revision_of(&std::fs::read(&v4).unwrap()), revision_of(&std::fs::read(&v3).unwrap()));
}

#[test]
fn la_version_recue_se_rouvre_telle_qu_elle_est_arrivee() {
    let (_dir, path) = temp_doc("Chap_revCK.docx");
    let original = std::fs::read(&path).unwrap();
    assert!(versions::received(&path).is_none(), "rien de reçu d'autre tant que rien n'a changé");
    assert!(versions::open_received(&path).is_err());
    accept(&path, 101);
    let (rev, _) = versions::received(&path).expect("version reçue gardée");
    assert_eq!(rev, revision_of(&original));
    let copy = versions::open_received(&path).unwrap();
    assert_eq!(name(&copy), "Chap_revCK_recu.docx");
    assert_eq!(std::fs::read(&copy).unwrap(), original);
    // Une seconde demande reprend la même copie au lieu d'en créer une autre.
    assert_eq!(versions::open_received(&path).unwrap(), copy);
    // Le document retouché, lui, garde la retouche.
    assert_ne!(revision_of(&std::fs::read(&path).unwrap()), revision_of(&original));
}

#[test]
fn un_fichier_qui_n_est_pas_un_docx_ne_se_copie_pas() {
    history_root();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("faux.docx");
    std::fs::write(&path, b"pas un zip").unwrap();
    assert!(versions::save_version(&path).is_err());
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
}
