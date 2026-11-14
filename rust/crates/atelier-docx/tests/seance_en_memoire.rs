//! Séance du panneau en mémoire : retouches confirmées sans écrire le
//! fichier, journal rejoué après un arrêt brutal, écriture coalescée,
//! conflit avec un autre écrivain, et réponses en delta identiques au
//! modèle complet une fois appliquées.

mod common;

use atelier_docx::history::{self, Origin};
use atelier_docx::ops::{Op, apply};
use atelier_docx::session::{Session, apply_delta};
use atelier_docx::{Docx, revision_of};
use common::*;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::Once;

fn history_root() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        history::set_root(std::env::temp_dir().join(format!("atelier-docx-seance-tests-{}", std::process::id())));
    });
}

fn temp_doc(bytes: &[u8]) -> (tempfile::TempDir, PathBuf) {
    history_root();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("article.docx");
    std::fs::write(&path, bytes).unwrap();
    (dir, path.canonicalize().unwrap())
}

/// Le modèle complet tel que le panneau le reçoit (sans date ni Word).
fn full(s: &Session) -> Value {
    let mut v = serde_json::to_value(s.model()).unwrap();
    v["styles"] = s.styles().clone();
    v
}

fn disk_text(path: &Path) -> Vec<String> {
    Docx::open(path).unwrap().model().unwrap().paragraphs.iter().map(|p| p.text.clone()).collect()
}

fn mem_text(s: &Session) -> Vec<String> {
    s.model().paragraphs.iter().map(|p| p.text.clone()).collect()
}

#[test]
fn les_retouches_se_confirment_sans_ecrire_puis_s_ecrivent_d_un_coup() {
    let (_d, path) = temp_doc(&build("christophe"));
    let rev0 = revision_of(&std::fs::read(&path).unwrap());
    let mut s = Session::open(&path).unwrap();
    assert_eq!(s.revision(), rev0, "au départ, la révision du fichier");
    let a = s.apply(Some(&rev0), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "Glace : "}), true, &sig("Thierry")).unwrap();
    let b = s.apply(Some(&a.revision), &json!({"op": "accept", "id": 101}), true, &sig("Thierry")).unwrap();
    assert_ne!(a.revision, rev0);
    assert_ne!(b.revision, a.revision);
    assert_eq!(revision_of(&std::fs::read(&path).unwrap()), rev0, "rien n'est encore écrit");
    assert_eq!(s.pending(), 2);
    // Une révision périmée est refusée.
    let e = s.apply(Some(&a.revision), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "x"}), true, &sig("Thierry")).unwrap_err();
    assert!(e.is_conflict());

    s.flush().unwrap();
    assert_eq!(s.pending(), 0);
    assert_eq!(s.revision(), b.revision, "la révision montrée ne bouge pas à l'écriture");
    assert_eq!(disk_text(&path), mem_text(&s));
    assert!(disk_text(&path)[1].starts_with("Glace : "));
    // Un pas d'annulation par retouche.
    let j = history::load(&path);
    assert_eq!(j.undo.len(), 2);
    let disk_rev = revision_of(&std::fs::read(&path).unwrap());
    let undone = history::undo(&path, &disk_rev, false).unwrap();
    assert_eq!(undone.label, "accepter");
    // La séance voit l'annulation et relit le fichier.
    let d = s.sync().unwrap().expect("fichier changé");
    assert_eq!(d["base"], json!(b.revision));
    assert_eq!(s.revision(), undone.revision);
    assert!(mem_text(&s)[1].starts_with("Glace : "));
    assert!(s.model().changes.iter().any(|c| c.id == 101), "le suivi accepté revient");
}

#[test]
fn le_journal_est_rejoue_apres_un_arret_brutal() {
    let (_d, path) = temp_doc(&build("christophe"));
    let rev0 = revision_of(&std::fs::read(&path).unwrap());
    let expected = {
        let mut s = Session::open(&path).unwrap();
        let a = s.apply(Some(&rev0), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "Névé "}), true, &sig("Thierry")).unwrap();
        s.apply(Some(&a.revision), &json!({"op": "split", "paragraph": "p1", "at": 3}), true, &sig("Thierry")).unwrap();
        mem_text(&s)
        // La séance disparaît sans écrire : arrêt brutal.
    };
    assert_eq!(revision_of(&std::fs::read(&path).unwrap()), rev0);
    assert!(history::dir_for(&path).join("seance.jsonl").is_file(), "le journal tient les retouches");
    // À la réouverture, le journal est rejoué et écrit.
    let s = Session::open(&path).unwrap();
    assert_eq!(mem_text(&s), expected);
    assert_eq!(disk_text(&path), expected);
    assert!(!history::dir_for(&path).join("seance.jsonl").is_file());
    assert_eq!(history::load(&path).undo.len(), 2);
}

#[test]
fn une_ligne_coupee_en_fin_de_journal_est_ignoree() {
    let (_d, path) = temp_doc(&build("christophe"));
    let rev0 = revision_of(&std::fs::read(&path).unwrap());
    let expected = {
        let mut s = Session::open(&path).unwrap();
        s.apply(Some(&rev0), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "Firn "}), true, &sig("Thierry")).unwrap();
        mem_text(&s)
    };
    let j = history::dir_for(&path).join("seance.jsonl");
    let mut text = std::fs::read_to_string(&j).unwrap();
    text.push_str("{\"t\":\"op\",\"op\":{\"op\":\"ins");
    std::fs::write(&j, text).unwrap();
    // L'agent écrit : la séance interrompue passe d'abord.
    let origin = Origin { source: "agent", author: "Claude", label: "retouche" };
    atelier_docx::edit_file_as(&path, None, &origin, |d| apply(d, &serde_json::from_value::<Op>(json!({"op": "accept", "id": 102})).unwrap(), true, &sig("Claude"))).unwrap();
    assert_eq!(disk_text(&path)[1], expected[1]);
}

#[test]
fn l_agent_ecrit_pendant_la_seance_sans_rien_perdre() {
    let (_d, path) = temp_doc(&build("christophe"));
    let rev0 = revision_of(&std::fs::read(&path).unwrap());
    let mut s = Session::open(&path).unwrap();
    let a = s.apply(Some(&rev0), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "Sérac "}), true, &sig("Thierry")).unwrap();
    // L'agent (autre processus) : la frappe en attente est écrite avant sa retouche.
    let origin = Origin { source: "agent", author: "Claude", label: "retouche" };
    let op: Op = serde_json::from_value(json!({"op": "accept", "id": 102})).unwrap();
    atelier_docx::edit_file_as(&path, None, &origin, |d| apply(d, &op, true, &sig("Claude"))).unwrap();
    // La retouche suivante du panneau, calculée sur l'ancienne révision : conflit.
    let e = s.apply(Some(&a.revision), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "x"}), true, &sig("Thierry")).unwrap_err();
    assert!(e.is_conflict(), "{e}");
    assert!(mem_text(&s)[1].starts_with("Sérac "), "la frappe confirmée est dans le fichier");
    assert!(!s.model().changes.iter().any(|c| c.id == 102), "et la retouche de l'agent aussi");
    // Le panneau relit, puis reprend.
    let r = s.revision().to_string();
    s.apply(Some(&r), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "x"}), true, &sig("Thierry")).unwrap();
    s.flush().unwrap();
    assert!(disk_text(&path)[1].starts_with("xSérac "));
}

#[test]
fn un_autre_programme_qui_remplace_le_fichier_ne_fait_rien_perdre_en_silence() {
    let (_d, path) = temp_doc(&build("christophe"));
    let rev0 = revision_of(&std::fs::read(&path).unwrap());
    let mut s = Session::open(&path).unwrap();
    let a = s.apply(Some(&rev0), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "Moraine "}), true, &sig("Thierry")).unwrap();
    // Word enregistre par-dessus, sans connaître le journal.
    std::fs::write(&path, build("retouches")).unwrap();
    let e = s.apply(Some(&a.revision), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "x"}), true, &sig("Thierry")).unwrap_err();
    assert!(e.is_reset(), "{e}");
    assert!(e.0.contains("gardées à part"));
    let aside = std::fs::read_dir(history::dir_for(&path)).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with("seance-mise-de-cote-"));
    assert!(aside, "le journal est mis de côté, pas effacé");
    assert_eq!(std::fs::read(&path).unwrap(), build("retouches"), "le fichier de Word n'est pas touché");
}

#[test]
fn word_ouvert_refuse_la_retouche() {
    let (d, path) = temp_doc(&build("christophe"));
    let mut s = Session::open(&path).unwrap();
    std::fs::write(d.path().join("~$article.docx"), b"x").unwrap();
    let r = s.revision().to_string();
    let e = s.apply(Some(&r), &json!({"op": "accept", "id": 101}), true, &sig("Thierry")).unwrap_err();
    assert!(e.is_open_in_word());
}

/// Gestes variés : chaque delta, appliqué au modèle précédent, redonne le
/// modèle complet ; et le fichier écrit se relit comme la mémoire.
#[test]
fn le_delta_redonne_le_modele_complet() {
    let (_d, path) = temp_doc(&build("christophe"));
    let mut s = Session::open(&path).unwrap();
    let mut shown = full(&s);
    let gestures = [
        json!({"op": "insert", "paragraph": "p1", "at": 2, "with": "abc"}),
        json!({"op": "replace_range", "paragraph": "p1", "start": 0, "end": 4, "with": ""}),
        json!({"op": "split", "paragraph": "p2", "at": 5}),
        json!({"op": "join", "paragraph": "p3"}),
        json!({"op": "accept", "id": 101}),
        json!({"op": "comment_range", "paragraph": "p1", "start": 0, "end": 3, "text": "Pourquoi ?"}),
        json!({"op": "format_range", "paragraph": "p1", "start": 0, "end": 3, "props": {"b": true}}),
        json!({"op": "insert_paragraph", "after": "p0", "text": "Nouveau paragraphe."}),
        json!({"op": "reject_all", "author": null}),
        json!({"op": "accept_all", "author": null}),
    ];
    let mut ok = 0;
    for g in gestures {
        let rev = s.revision().to_string();
        let tracked = g["op"] != "format_range";
        let Ok(a) = s.apply(Some(&rev), &g, tracked, &sig("Thierry")) else { continue };
        let next = apply_delta(&shown, &a.delta).unwrap_or_else(|| panic!("{g} : delta inapplicable"));
        assert_eq!(next, full(&s), "{g} : delta ≠ modèle complet");
        assert!(serde_json::to_vec(&a.delta).unwrap().len() < serde_json::to_vec(&next).unwrap().len());
        shown = next;
        ok += 1;
    }
    assert!(ok >= 8, "trop peu de gestes passés ({ok})");
    // Un delta qui ne part pas de la révision affichée est refusé.
    assert!(apply_delta(&json!({"revision": "autre"}), &json!({"base": "x", "revision": "y"})).is_none());
    s.flush().unwrap();
    assert_eq!(disk_text(&path), mem_text(&s));
}

/// La cible d'une retouche désignée par identifiant, telle que le panneau la voit.
fn expect_of(s: &Session, id: u32) -> Value {
    let c = s.model().comments.iter().find(|c| c.id == id).unwrap();
    json!({"author": c.author, "text": c.text, "date": c.date})
}

/// Thierry, 2026-11-14 : il résolvait et répondait dans le panneau pendant
/// que l'agent posait d'autres bulles dans le même TP ; chaque geste calculé
/// sur la révision d'avant l'écriture de l'agent partait en conflit et se
/// perdait (un toast de 4 s). Résoudre, répondre, accepter visent une cible
/// par son identifiant : ils passent tant que cette cible n'a pas changé,
/// et se retrouvent à la réouverture.
#[test]
fn resoudre_et_repondre_pendant_que_l_agent_ecrit_se_retrouvent_a_la_reouverture() {
    let (_d, path) = temp_doc(&build("christophe"));
    let rev0 = revision_of(&std::fs::read(&path).unwrap());
    let mut s = Session::open(&path).unwrap();
    let seen = expect_of(&s, 1);
    // L'agent pose une bulle (autre processus) : la révision du panneau est dépassée.
    let origin = Origin { source: "agent", author: "Thierry Laurent", label: "commentaire" };
    let op: Op = serde_json::from_value(json!({"op": "comment", "paragraph": "p4", "find": "fin d'été", "text": "Date ?"})).unwrap();
    atelier_docx::edit_file_as(&path, None, &origin, |d| apply(d, &op, true, &sig("Thierry Laurent"))).unwrap();

    // Sans cible attendue, le geste reste un conflit (rien n'est écrit à l'aveugle).
    let e = s.apply(Some(&rev0), &json!({"op": "resolve", "id": 1, "done": true}), true, &sig("Thierry")).unwrap_err();
    assert!(e.is_conflict(), "{e}");
    // Avec la cible vue par le panneau : réponse, résolution et acceptation passent.
    let a = s.apply(Some(&rev0), &json!({"op": "reply", "parent": 1, "text": "Corrigé, merci.", "expect": seen}), true, &sig("Thierry")).unwrap();
    let b = s.apply(Some(&rev0), &json!({"op": "resolve", "id": 1, "done": true, "expect": seen}), true, &sig("Thierry")).unwrap();
    assert_ne!(a.revision, b.revision);
    let ch = s.model().changes.iter().find(|c| c.id == 102).unwrap().clone();
    s.apply(Some(&rev0), &json!({"op": "accept", "id": 102, "expect": {"author": ch.author, "text": ch.text, "kind": ch.kind}}), true, &sig("Thierry")).unwrap();
    // Une cible qui a changé (texte réécrit) : conflit, comme avant.
    let stale = json!({"author": "Christophe", "text": "un autre texte"});
    let e = s.apply(Some(&rev0), &json!({"op": "resolve", "id": 1, "done": false, "expect": stale}), true, &sig("Thierry")).unwrap_err();
    assert!(e.is_conflict(), "{e}");
    s.flush().unwrap();
    drop(s);

    // Réouverture : tout est dans le fichier, la bulle de l'agent comprise.
    let m = Docx::open(&path).unwrap().model().unwrap();
    assert!(m.comments.iter().find(|c| c.id == 1).unwrap().done, "le fil reste résolu");
    assert!(m.comments.iter().any(|c| c.parent == Some(1) && c.text == "Corrigé, merci." && c.author == "Thierry"), "la réponse est là");
    assert!(m.comments.iter().any(|c| c.text == "Date ?"), "la bulle de l'agent est là");
    assert!(!m.changes.iter().any(|c| c.id == 102), "le suivi accepté reste accepté");
    let s = Session::open(&path).unwrap();
    assert!(s.model().comments.iter().find(|c| c.id == 1).unwrap().done);
}

/// La séance se referme après 30 min sans appel ; la révision virtuelle du
/// panneau (`s…-n`) n'existe plus dans la nouvelle. Le premier geste après
/// une longue lecture ne doit pas se perdre.
#[test]
fn une_resolution_apres_une_longue_lecture_n_est_pas_perdue() {
    let (_d, path) = temp_doc(&build("christophe"));
    let rev0 = revision_of(&std::fs::read(&path).unwrap());
    let mut s = Session::open(&path).unwrap();
    let a = s.apply(Some(&rev0), &json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "Névé "}), true, &sig("Thierry")).unwrap();
    let seen = expect_of(&s, 1);
    s.flush().unwrap();
    drop(s); // séance refermée par le fil de fond
    let mut s = Session::open(&path).unwrap();
    assert_ne!(s.revision(), a.revision);
    s.apply(Some(&a.revision), &json!({"op": "resolve", "id": 1, "done": true, "expect": seen}), true, &sig("Thierry")).unwrap();
    s.flush().unwrap();
    let m = Docx::open(&path).unwrap().model().unwrap();
    assert!(m.comments.iter().find(|c| c.id == 1).unwrap().done);
    assert!(m.paragraphs[1].text.starts_with("Névé "));
}
