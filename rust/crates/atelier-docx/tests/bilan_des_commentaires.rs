//! Bilan des commentaires du relecteur : la version reçue, gardée par
//! l'historique même après « Accepter » ou un commentaire effacé, comparée
//! au document d'aujourd'hui (Thierry, 2026-11-16).

mod common;

use atelier_docx::bilan::{self, reviewer_filter};
use atelier_docx::history::{self, Origin};
use atelier_docx::ops::{Op, apply};
use atelier_docx::Docx;
use common::*;
use std::path::Path;
use std::sync::Once;

fn history_root() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| history::set_root(std::env::temp_dir().join(format!("atelier-docx-bilan-tests-{}", std::process::id()))));
}

fn comment(d: &mut Docx, paragraph: &str, find: &str, text: &str) {
    let op = Op::Comment { paragraph: Some(paragraph.into()), find: find.into(), occurrence: None, text: text.into() };
    apply(d, &op, true, &sig("Christophe")).unwrap();
}

fn id_of(path: &Path, text: &str) -> u32 {
    let m = Docx::open(path).unwrap().model().unwrap();
    m.comments.iter().find(|c| c.text.contains(text)).unwrap().id
}

/// Geste de Thierry dans Atelier (l'historique garde d'abord la version reçue).
fn thierry(path: &Path, op: Op) {
    let origin = Origin { source: "panneau", author: "Thierry", label: "retouche" };
    let rev = Docx::open(path).unwrap().revision();
    atelier_docx::edit_file_as(path, Some(&rev), &origin, |d| apply(d, &op, true, &sig("Thierry"))).unwrap();
}

#[test]
fn chaque_commentaire_du_relecteur_retrouve_son_passage_d_alors_et_d_aujourd_hui() {
    history_root();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Chap_revCK.docx");
    // Le fichier tel que Christophe le renvoie : ses suivis et trois commentaires de plus.
    let mut d = open("christophe");
    comment(&mut d, "p12", "La correction topographique", "Quelle version de la méthode ?");
    comment(&mut d, "p4", "en fin d'été", "Donner le mois exact.");
    comment(&mut d, "p13", "avec tabulation", "Phrase à reprendre.");
    std::fs::write(&path, d.to_bytes().unwrap()).unwrap();

    // Un mois de corrections dans Atelier.
    thierry(&path, Op::Accept { id: 101 });
    thierry(&path, Op::Accept { id: 102 });
    thierry(&path, Op::Reject { id: 106 });
    thierry(&path, Op::Resolve { id: 1, done: Some(true) });
    thierry(&path, Op::Reply { parent: id_of(&path, "Quelle version"), text: "Celle de 2009, précisé.".into() });
    thierry(&path, Op::Replace { paragraph: Some("p12".into()), find: "Sirguey et al.".into(), occurrence: None, with: "Sirguey et al. (2009)".into() });
    thierry(&path, Op::DeleteComment { id: id_of(&path, "mois exact") });

    let keep = reviewer_filter(Some("christophe"), "Thierry");
    let (label, r) = bilan::report(&path, None, &keep).unwrap();
    assert!(label.starts_with("la version reçue le "), "{label}");
    assert_eq!(r.reviewers, vec!["Christophe".to_string()]);
    assert_eq!(r.items.len(), 4, "le commentaire effacé compte encore");

    let by = |t: &str| r.items.iter().find(|i| i.then.text.contains(t)).unwrap();
    let seuil = by("Pourquoi 0,6");
    assert!(seuil.now.as_ref().is_some_and(|c| c.done), "résolu");
    assert_eq!(seuil.replies.len(), 1, "la réponse de Thierry suit");
    assert_eq!(seuil.after.as_deref(), Some(seuil.before.as_str()), "passage identique");

    let methode = by("Quelle version");
    assert!(methode.after.as_deref().unwrap().contains("(2009)"), "{:?}", methode.after);
    assert_eq!(methode.replies[0].1, "Celle de 2009, précisé.");

    let mois = by("mois exact");
    assert!(mois.now.is_none(), "effacé du document, gardé dans la version reçue");
    assert_eq!(mois.now_para.as_deref(), Some("p4"));

    let phrase = by("Phrase à reprendre");
    assert!(phrase.now.as_ref().is_some_and(|c| !c.done));

    // Ses suivis : les deux de p1 acceptés (même « On », trop court seul :
    // jugé avec le texte autour), Z3 refusé dans une cellule désormais vide
    // (rien ne la retrouve : décidé), les huit autres en attente.
    assert_eq!((r.marks.accepted, r.marks.rejected, r.marks.pending, r.marks.decided), (2, 0, 8, 1), "{:?}", r.marks);

    let text = bilan::render(&r, "Chap_revCK.docx", &label, 1);
    println!("{text}");
    assert!(text.contains("4 commentaires. Encore dans le document : 3 (résolus : 1, ouverts : 2). Effacés : 1."), "{text}");
    assert!(text.contains("effacé du document"), "{text}");
    assert!(text.contains("[+(2009)+]"), "{text}");
    assert!(text.contains("Passage : identique à la version reçue."), "{text}");
}

#[test]
fn sans_version_recue_le_bilan_le_dit_et_accepte_une_copie() {
    history_root();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Chap.docx");
    std::fs::write(&path, build("christophe")).unwrap();
    let keep = reviewer_filter(None, "Thierry");
    // Rien de retouché : l'historique n'a encore rien gardé.
    let e = bilan::report(&path, None, &keep).unwrap_err();
    assert!(e.0.contains("since"), "{}", e.0);
    // Une copie du fichier reçu fait l'affaire.
    let copy = dir.path().join("Chap_recu.docx");
    std::fs::copy(&path, &copy).unwrap();
    let (label, r) = bilan::report(&path, Some(&copy), &keep).unwrap();
    assert_eq!(label, "le fichier Chap_recu.docx");
    assert_eq!(r.items.len(), 1, "Christophe seulement : ni Thierry ni un agent");
}

#[test]
fn la_difference_mot_a_mot_raccourcit_ce_qui_ne_change_pas() {
    let before = "un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize fin";
    let after = "un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize la fin";
    let d = bilan::word_diff(before, after);
    assert_eq!(d, "… onze douze treize quatorze quinze seize [+la+] fin");
    assert_eq!(bilan::word_diff("a b c", "a x c"), "a [-b-] [+x+] c");
}
