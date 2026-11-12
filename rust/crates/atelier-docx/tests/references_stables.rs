//! Références de paragraphe stables : le panneau montre ses gestes d'avance
//! (Entrée, retour arrière, frappe) et les envoie ensuite. Un rang `pN` se
//! décale à chaque Entrée ; la forme `id:<w14:paraId>` vise toujours le même
//! paragraphe, quels que soient les paragraphes coupés ou joints avant lui.

mod common;

use atelier_docx::ops::{Op, apply};
use common::*;
use serde_json::json;

fn op(v: serde_json::Value) -> Op {
    serde_json::from_value(v).unwrap()
}

/// Rang et paraId du premier paragraphe du corps dont le texte contient `needle`.
fn find(d: &mut atelier_docx::Docx, needle: &str) -> (usize, String) {
    let m = d.model().unwrap();
    let i = m.paragraphs.iter().position(|p| p.text.contains(needle)).unwrap_or_else(|| panic!("introuvable : {needle}"));
    (i, m.paragraphs[i].para_id.clone().expect("paraId attendu dans la fixture"))
}

#[test]
fn id_vise_le_meme_paragraphe_apres_une_entree_plus_haut() {
    let mut d = open("christophe");
    let t = sig("Thierry");
    let (i, pid) = find(&mut d, "retenu ici");
    // Entrée au début du document : tous les rangs suivants se décalent.
    apply(&mut d, &op(json!({"op": "split", "paragraph": "p0", "at": 1})), true, &t).unwrap();
    let m = d.model().unwrap();
    assert!(m.paragraphs[i + 1].text.contains("retenu ici"));
    // Le rang d'avant vise désormais le paragraphe précédent ; l'identifiant, lui, suit.
    apply(&mut d, &op(json!({"op": "insert", "paragraph": format!("id:{pid}"), "at": 0, "with": "Z"})), true, &t).unwrap();
    let m = d.model().unwrap();
    assert!(m.paragraphs[i + 1].text.starts_with('Z'), "{}", m.paragraphs[i + 1].text);
    assert_eq!(m.paragraphs[i + 1].para_id.as_deref(), Some(pid.as_str()));
    // Minuscules acceptées (Word lit l'hexadécimal dans les deux casses).
    let n = m.paragraphs[i + 1].text.chars().count();
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": format!("id:{}", pid.to_lowercase()), "start": 0, "end": 1, "with": ""})), true, &t).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[i + 1].text.chars().count(), n - 1);
    assert!(!m.paragraphs[i + 1].text.starts_with('Z'));
}

#[test]
fn apres_une_coupe_la_seconde_moitie_garde_l_identifiant() {
    let mut d = open("christophe");
    let t = sig("Thierry");
    let (i, pid) = find(&mut d, "retenu ici");
    let text = d.model().unwrap().paragraphs[i].text.clone();
    let at = text.find("retenu ici").map(|b| text[..b].chars().count()).unwrap();
    apply(&mut d, &op(json!({"op": "split", "paragraph": format!("id:{pid}"), "at": at})), true, &t).unwrap();
    let m = d.model().unwrap();
    let first = &m.paragraphs[i];
    let second = &m.paragraphs[i + 1];
    assert!(second.text.starts_with("retenu ici"));
    assert_eq!(second.para_id.as_deref(), Some(pid.as_str()), "la seconde moitié garde son identité");
    let new_pid = first.para_id.clone().expect("la première moitié reçoit un paraId neuf");
    assert_ne!(new_pid, pid);
    // Frappe dans la première moitié par son nouvel identifiant, puis jointure par l'ancien.
    apply(&mut d, &op(json!({"op": "insert", "paragraph": format!("id:{new_pid}"), "at": 0, "with": "A"})), true, &t).unwrap();
    assert!(d.model().unwrap().paragraphs[i].text.starts_with('A'));
    let n = d.model().unwrap().paragraphs.len();
    apply(&mut d, &op(json!({"op": "join", "paragraph": format!("id:{pid}")})), true, &t).unwrap();
    // Sa propre Entrée défaite : les deux moitiés se rejoignent pour de bon.
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), n - 1);
    assert!(m.paragraphs[i].text.starts_with('A') && m.paragraphs[i].text.contains("retenu ici"));
}

#[test]
fn id_marche_pour_la_mise_en_forme_le_commentaire_et_l_ajout_de_paragraphe() {
    let mut d = open("christophe");
    let t = sig("Thierry");
    let (i, pid) = find(&mut d, "retenu ici");
    let r = format!("id:{pid}");
    apply(&mut d, &op(json!({"op": "format_range", "paragraph": r, "start": 0, "end": 3, "props": {"b": true}})), true, &t).unwrap();
    assert!(d.model().unwrap().paragraphs[i].segments.iter().any(|s| s.b));
    apply(&mut d, &op(json!({"op": "comment_range", "paragraph": r, "start": 0, "end": 3, "text": "Vu."})), true, &t).unwrap();
    assert!(d.model().unwrap().comments.iter().any(|c| c.text == "Vu."));
    let n = d.model().unwrap().paragraphs.len();
    let out = apply(&mut d, &op(json!({"op": "insert_paragraph", "after": r, "text": "Nouveau."})), true, &t).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), n + 1);
    assert_eq!(out["paragraph"], format!("p{}", i + 1));
    assert_eq!(m.paragraphs[i + 1].text, "Nouveau.");
}

#[test]
fn un_identifiant_inconnu_est_refuse_sans_rien_toucher() {
    let mut d = open("christophe");
    let t = sig("Thierry");
    let before = d.model().unwrap().paragraphs.iter().map(|p| p.text.clone()).collect::<Vec<_>>();
    for bad in ["id:DEADBEEF", "id:", "n1.id:DEADBEEF"] {
        let e = apply(&mut d, &op(json!({"op": "insert", "paragraph": bad, "at": 0, "with": "Z"})), true, &t).unwrap_err();
        assert!(e.0.contains("introuvable"), "{bad} : {e}");
    }
    let after = d.model().unwrap().paragraphs.iter().map(|p| p.text.clone()).collect::<Vec<_>>();
    assert_eq!(before, after);
    // Le rang reste accepté tel quel (paragraphe sans paraId : repli du panneau).
    apply(&mut d, &op(json!({"op": "insert", "paragraph": "p1", "at": 0, "with": "Z"})), true, &t).unwrap();
    assert!(d.model().unwrap().paragraphs[1].text.starts_with('Z'));
}
