mod common;

use atelier_docx::drafts;
use common::*;

fn doc() -> (tempfile::TempDir, std::path::PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Chapitre corrigé.docx");
    std::fs::write(&path, build("christophe")).unwrap();
    (dir, path)
}

#[test]
fn le_brouillon_de_l_agent_reste_hors_du_document() {
    let (_dir, path) = doc();
    let before = std::fs::read(&path).unwrap();
    assert!(drafts::list(&path).unwrap().is_empty());
    let d = drafts::put(&path, 1, "  Bonne remarque, je l'ajoute en annexe.  ", "Claude").unwrap();
    assert_eq!(d.text, "Bonne remarque, je l'ajoute en annexe.");
    assert_eq!(d.author, "Claude");
    // Le .docx n'a pas bougé d'un octet : seul l'utilisateur envoie la réponse.
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let all = drafts::list(&path).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[&1].text, d.text);
    // Refaire remplace le brouillon précédent.
    drafts::put(&path, 1, "Autre version.", "Claude").unwrap();
    assert_eq!(drafts::list(&path).unwrap()[&1].text, "Autre version.");
    assert!(drafts::clear(&path, 1).unwrap());
    assert!(!drafts::clear(&path, 1).unwrap());
    assert!(drafts::list(&path).unwrap().is_empty());
}

#[test]
fn seul_un_commentaire_de_tete_existant_recoit_un_brouillon() {
    let (_dir, path) = doc();
    // c2 est la réponse de Thierry à c1.
    assert!(drafts::put(&path, 2, "x", "Claude").unwrap_err().0.contains("c1"));
    assert!(drafts::put(&path, 99, "x", "Claude").unwrap_err().0.contains("introuvable"));
    assert!(drafts::put(&path, 1, "   ", "Claude").is_err());
    assert!(drafts::put(&path, 1, &"a".repeat(drafts::MAX_CHARS + 1), "Claude").is_err());
    assert!(drafts::list(&path).unwrap().is_empty());
}

#[test]
fn deux_documents_ont_chacun_leurs_brouillons() {
    let (_a, one) = doc();
    let (_b, two) = doc();
    drafts::put(&one, 1, "Pour le premier.", "Codex").unwrap();
    assert!(drafts::list(&two).unwrap().is_empty());
    assert_eq!(drafts::list(&one).unwrap()[&1].author, "Codex");
}
