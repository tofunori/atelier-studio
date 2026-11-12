//! Lot « solidité » : écrire dans l'ajout d'un autre, historique sur disque,
//! refus quand Word a le fichier ouvert, écriture sûre, parties de Word
//! 2016+ tenues à jour, contrôle à chaque écriture.

mod common;

use atelier_docx::history::{self, Origin};
use atelier_docx::ops::{Op, apply};
use atelier_docx::{Docx, check, revision_of};
use common::*;
use serde_json::json;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::sync::Once;

fn op(v: serde_json::Value) -> Op {
    serde_json::from_value(v).unwrap()
}

/// Historique des tests dans un dossier jetable, jamais dans celui de l'app.
fn history_root() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let dir = std::env::temp_dir().join(format!("atelier-docx-historique-tests-{}", std::process::id()));
        history::set_root(dir);
    });
}

fn temp_doc(bytes: &[u8]) -> (tempfile::TempDir, PathBuf) {
    history_root();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("article.docx");
    std::fs::write(&path, bytes).unwrap();
    (dir, path)
}

fn edit(path: &Path, v: serde_json::Value, author: &str) -> atelier_docx::Result<String> {
    let s = sig(author);
    let origin = Origin { source: "panneau", author, label: "frappe" };
    let rev = Docx::open(path)?.revision();
    atelier_docx::edit_file_as(path, Some(&rev), &origin, |d| apply(d, &op(v), true, &s)).map(|(_, r)| r)
}

/// Paquet de la fixture avec des parties remplacées ou ajoutées.
fn package_with(name: &str, parts: &[(&str, &str)]) -> Vec<u8> {
    let base = build(name);
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (n, bytes) in entries(&base) {
        out.start_file(n.as_str(), opts).unwrap();
        match parts.iter().find(|(p, _)| *p == n) {
            Some((_, text)) => out.write_all(text.as_bytes()).unwrap(),
            None => out.write_all(&bytes).unwrap(),
        }
    }
    for (p, text) in parts {
        if !entries(&base).iter().any(|(n, _)| n == p) {
            out.start_file(*p, opts).unwrap();
            out.write_all(text.as_bytes()).unwrap();
        }
    }
    out.finish().unwrap().into_inner()
}

fn para_with(d: &mut Docx, needle: &str) -> String {
    d.model().unwrap().paragraphs.iter().find(|p| p.text.contains(needle)).map(|p| p.id.clone()).unwrap_or_else(|| panic!("« {needle} » introuvable"))
}

// ------------------------------------------------- ajout d'un autre auteur

#[test]
fn thierry_efface_dans_l_ajout_de_christophe_en_suivi_imbrique() {
    let mut d = open("christophe");
    let p = para_with(&mut d, "On ne conserve");
    // « On » est l'ajout 102 de Christophe ; Thierry en efface le « n ».
    let at = d.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().text.find("On ne").unwrap();
    let at = d.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().text[..at].chars().count();
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": p, "start": at + 1, "end": at + 2, "with": ""})), true, &sig("Thierry")).unwrap();
    let xml = d.document_xml().to_string();
    let ins = &xml[xml.find("<w:ins w:id=\"102\"").unwrap()..];
    let ins = &ins[..ins.find("</w:ins>").unwrap()];
    assert!(ins.contains("<w:del ") && ins.contains("w:author=\"Thierry\"") && ins.contains("<w:delText xml:space=\"preserve\">n</w:delText>"), "{ins}");
    let mut r = reopen(&d);
    let m = r.model().unwrap();
    let para = m.paragraphs.iter().find(|x| x.id == p).unwrap();
    assert!(para.text.contains("O ne conserve"), "{}", para.text);
    let del = m.changes.iter().find(|c| c.kind == "del" && c.author == "Thierry").unwrap().id;

    // Refuser l'effacement de Thierry : le « n » revient dans l'ajout de Christophe.
    let mut back = reopen(&d);
    apply(&mut back, &op(json!({"op": "reject", "id": del})), true, &sig("Thierry")).unwrap();
    assert!(back.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().text.contains("On ne conserve"));
    assert!(back.document_xml().contains("<w:ins w:id=\"102\""));

    // Accepter l'effacement : l'ajout de Christophe ne garde que « O ».
    apply(&mut r, &op(json!({"op": "accept", "id": del})), true, &sig("Thierry")).unwrap();
    let xml = r.document_xml().to_string();
    assert!(!xml.contains("<w:delText xml:space=\"preserve\">n</w:delText>"));
    // Puis accepter l'ajout de Christophe : plus aucun suivi à cet endroit.
    apply(&mut r, &op(json!({"op": "accept", "id": 102})), true, &sig("Thierry")).unwrap();
    assert!(r.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().text.contains("O ne conserve"));
    assert_eq!(check::problems(&mut reopen(&r)).unwrap(), check::problems(&mut open("christophe")).unwrap());
}

#[test]
fn thierry_ecrit_au_milieu_de_l_ajout_de_christophe_qui_est_coupe() {
    let mut d = open("christophe");
    let p = para_with(&mut d, "On ne conserve");
    let text = d.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().text.clone();
    let at = text[..text.find("On ne").unwrap()].chars().count() + 1;
    apply(&mut d, &op(json!({"op": "insert", "paragraph": p, "at": at, "with": "XY"})), true, &sig("Thierry")).unwrap();
    let mut r = reopen(&d);
    let m = r.model().unwrap();
    assert!(m.paragraphs.iter().find(|x| x.id == p).unwrap().text.contains("OXYn ne conserve"));
    // Trois suivis d'insertion : « O » (Christophe), « XY » (Thierry), « n » (Christophe).
    let xml = r.document_xml().to_string();
    let a = xml.find("<w:t xml:space=\"preserve\">O</w:t>").unwrap();
    let b = xml.find("XY").unwrap();
    let c = xml.find("<w:t xml:space=\"preserve\">n</w:t>").unwrap();
    assert!(a < b && b < c);
    let between = &xml[a..c];
    assert_eq!(between.matches("</w:ins>").count(), 2, "{between}");
    assert!(between.contains("w:author=\"Thierry\""));
    // Aucun w:ins dans un w:ins : chaque morceau a son auteur.
    let thierry = m.changes.iter().find(|c| c.kind == "ins" && c.author == "Thierry").unwrap();
    assert_eq!(thierry.text, "XY");
    assert_eq!(m.changes.iter().filter(|c| c.kind == "ins" && c.author == "Christophe" && (c.text == "O" || c.text == "n")).count(), 2);
    // Refuser l'ajout de Thierry rend exactement « On ».
    apply(&mut r, &op(json!({"op": "reject", "id": thierry.id})), true, &sig("Thierry")).unwrap();
    assert!(r.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().text.contains("On ne conserve"));
}

#[test]
fn frappe_au_bord_de_l_ajout_de_christophe_reste_hors_de_son_ajout() {
    let mut d = open("christophe");
    let p = para_with(&mut d, "On ne conserve");
    let text = d.model().unwrap().paragraphs.iter().find(|x| x.id == p).unwrap().text.clone();
    let at = text[..text.find("On ne").unwrap()].chars().count();
    apply(&mut d, &op(json!({"op": "insert", "paragraph": p, "at": at, "with": "Z"})), true, &sig("Thierry")).unwrap();
    let xml = d.document_xml().to_string();
    // L'ajout de Christophe n'a pas été coupé : il commence toujours par « On ».
    let ins = &xml[xml.find("<w:ins w:id=\"102\"").unwrap()..];
    assert!(ins[..ins.find("</w:ins>").unwrap()].contains("<w:t>On</w:t>"), "{}", &ins[..200]);
}

// ------------------------------------------------- historique sur disque

#[test]
fn l_original_recu_est_copie_et_annuler_survit_a_la_relance() {
    let original = build("christophe");
    let (_dir, path) = temp_doc(&original);
    let rev0 = revision_of(&original);
    let rev1 = edit(&path, json!({"op": "accept", "id": 101}), "Thierry").unwrap();
    let rev2 = edit(&path, json!({"op": "accept", "id": 102}), "Thierry").unwrap();

    // Une nouvelle lecture du journal (comme après une relance).
    let j = history::load(&path);
    assert_eq!(j.bases.len(), 1);
    assert_eq!(j.bases[0].revision, rev0);
    assert_eq!(history::base_bytes(&path, &rev0).unwrap(), original);
    assert_eq!(j.undo.len(), 2);
    assert!(!history::dir_for(&path).starts_with(path.parent().unwrap()), "l'historique ne vit jamais à côté du document");

    let u = history::undo(&path, &rev2, false).unwrap();
    assert_eq!(u.revision, rev1);
    let u = history::undo(&path, &rev1, false).unwrap();
    assert_eq!(u.revision, rev0);
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert!(history::undo(&path, &rev0, false).is_err());
    let r = history::undo(&path, &rev0, true).unwrap();
    assert_eq!(r.revision, rev1);
    // Une révision périmée ne touche à rien.
    assert!(history::undo(&path, &rev0, true).unwrap_err().is_conflict());
    // Une nouvelle retouche efface la pile « rétablir ».
    edit(&path, json!({"op": "reject", "id": 102}), "Thierry").unwrap();
    assert!(history::load(&path).redo.is_empty());
}

#[test]
fn une_version_venue_de_word_devient_une_nouvelle_base_et_coupe_l_annulation() {
    let (_dir, path) = temp_doc(&build("christophe"));
    let rev1 = edit(&path, json!({"op": "accept", "id": 101}), "Thierry").unwrap();
    // Christophe renvoie une nouvelle ronde, enregistrée par-dessus.
    let doc = String::from_utf8(entries(&build("christophe")).into_iter().find(|(n, _)| n == "word/document.xml").unwrap().1).unwrap();
    let round2 = package_with("christophe", &[("word/document.xml", &doc.replacen("2.2 Fraction", "2.3 Fraction", 1))]);
    std::fs::write(&path, &round2).unwrap();
    let rev_round2 = revision_of(&round2);
    assert!(history::undo(&path, &rev_round2, false).is_err(), "on n'annule pas par-dessus le travail de Word");
    edit(&path, json!({"op": "accept", "id": 102}), "Thierry").unwrap();
    let j = history::load(&path);
    assert_eq!(j.bases.len(), 2);
    assert_eq!(j.bases[1].revision, rev_round2);
    assert_eq!(j.undo.len(), 1, "la pile repart de la nouvelle ronde");
    assert_ne!(rev1, rev_round2);
}

#[test]
fn les_retouches_de_l_agent_s_annulent_aussi() {
    let (_dir, path) = temp_doc(&build("christophe"));
    let s = sig("Claude");
    let rev0 = Docx::open(&path).unwrap().revision();
    let origin = Origin { source: "agent", author: "Claude", label: "retouche" };
    let (_, rev1) = atelier_docx::edit_file_as(&path, Some(&rev0), &origin, |d| apply(d, &op(json!({"op": "replace", "find": "compromis", "with": "équilibre"})), true, &s)).unwrap();
    let st = history::status(&path, &rev1);
    assert!(st.can_undo);
    assert_eq!(st.undo_label.as_deref(), Some("retouche de Claude"));
    let u = history::undo(&path, &rev1, false).unwrap();
    assert_eq!(u.revision, rev0);
}

// ------------------------------------------------- Word ouvert

#[test]
fn rien_ne_s_ecrit_quand_word_a_le_document_ouvert() {
    let (dir, path) = temp_doc(&build("christophe"));
    let before = std::fs::read(&path).unwrap();
    std::fs::write(dir.path().join("~$ticle.docx"), b"verrou de Word").unwrap();
    assert!(atelier_docx::open_in_word(&path));
    let e = edit(&path, json!({"op": "accept", "id": 101}), "Thierry").unwrap_err();
    assert!(e.is_open_in_word(), "{e}");
    assert_eq!(std::fs::read(&path).unwrap(), before);
    std::fs::remove_file(dir.path().join("~$ticle.docx")).unwrap();
    edit(&path, json!({"op": "accept", "id": 101}), "Thierry").unwrap();
}

// ------------------------------------------------- écriture sûre

#[cfg(unix)]
#[test]
fn l_enregistrement_garde_les_droits_et_les_attributs_du_fichier() {
    use std::os::unix::fs::PermissionsExt;
    let (dir, path) = temp_doc(&build("christophe"));
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o640)).unwrap();
    let tagged = xattr::set(&path, "user.atelier.essai", b"rouge").is_ok();
    edit(&path, json!({"op": "accept", "id": 101}), "Thierry").unwrap();
    assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o640);
    if tagged {
        assert_eq!(xattr::get(&path, "user.atelier.essai").unwrap().as_deref(), Some(&b"rouge"[..]));
    }
    // Aucun fichier temporaire ne traîne à côté.
    let names: Vec<String> = std::fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(names, vec!["article.docx".to_string()]);
}

// ------------------------------------------------- fidélité Word

const IDS: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cid:commentsIds xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"></w16cid:commentsIds>"#;
const CEX: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w16cex:commentsExtensible xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"></w16cex:commentsExtensible>"#;
const PEOPLE: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:person w15:author="Christophe"><w15:presenceInfo w15:providerId="None" w15:userId="Christophe"/></w15:person></w15:people>"#;

fn with_word2016_parts() -> Docx {
    let ct = String::from_utf8(entries(&build("christophe")).into_iter().find(|(n, _)| n == "[Content_Types].xml").unwrap().1).unwrap();
    let ct = ct.replace(
        "</Types>",
        r#"<Override PartName="/word/commentsIds.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml"/><Override PartName="/word/commentsExtensible.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml"/><Override PartName="/word/people.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"/></Types>"#,
    );
    Docx::from_bytes(package_with("christophe", &[("[Content_Types].xml", &ct), ("word/commentsIds.xml", IDS), ("word/commentsExtensible.xml", CEX), ("word/people.xml", PEOPLE)])).unwrap()
}

#[test]
fn un_commentaire_ajoute_a_ses_entrees_dans_les_parties_de_word_2016() {
    let mut d = with_word2016_parts();
    let r = apply(&mut d, &op(json!({"op": "comment", "find": "compromis", "text": "À préciser."})), true, &sig("Thierry Laurent")).unwrap();
    let id = r["id"].as_u64().unwrap() as u32;
    let ids = d.part("word/commentsIds.xml").unwrap().unwrap();
    let cex = d.part("word/commentsExtensible.xml").unwrap().unwrap();
    let people = d.part("word/people.xml").unwrap().unwrap();
    let durable = ids.split("w16cid:durableId=\"").nth(1).unwrap().split('"').next().unwrap().to_string();
    assert!(u32::from_str_radix(&durable, 16).unwrap() < 0x8000_0000);
    assert!(cex.contains(&format!("w16cex:durableId=\"{durable}\" w16cex:dateUtc=\"2026-10-19T19:00:00Z\"")), "{cex}");
    assert!(people.contains("w15:author=\"Thierry Laurent\""));
    // Une réponse du même auteur n'ajoute pas une seconde personne.
    apply(&mut d, &op(json!({"op": "reply", "parent": id, "text": "Fait."})), true, &sig("Thierry Laurent")).unwrap();
    let people = d.part("word/people.xml").unwrap().unwrap();
    assert_eq!(people.matches("Thierry Laurent\"><").count(), 1);
    assert_eq!(d.part("word/commentsIds.xml").unwrap().unwrap().matches("<w16cid:commentId ").count(), 2);
    assert_eq!(check::problems(&mut reopen(&d)).unwrap(), check::problems(&mut with_word2016_parts()).unwrap());
    // Supprimer le fil retire ses entrées.
    apply(&mut d, &op(json!({"op": "delete_comment", "id": id})), true, &sig("Thierry Laurent")).unwrap();
    assert!(!d.part("word/commentsIds.xml").unwrap().unwrap().contains("<w16cid:commentId "));
    assert!(!d.part("word/commentsExtensible.xml").unwrap().unwrap().contains("<w16cex:commentExtensible "));
}

#[test]
fn la_date_de_word_est_l_heure_locale_et_la_vraie_utc_est_gardee_a_part() {
    let s = atelier_docx::Signature::now("Thierry");
    for d in [&s.date, &s.date_utc] {
        assert_eq!(d.len(), 20, "{d}");
        assert!(d.ends_with('Z') && d.as_bytes()[10] == b'T');
    }
}

#[test]
fn une_tabulation_de_position_survit_a_la_coupe_du_run() {
    let doc = String::from_utf8(entries(&build("christophe")).into_iter().find(|(n, _)| n == "word/document.xml").unwrap().1).unwrap();
    let ptab = r#"<w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/>"#;
    let doc = doc.replacen("<w:t>2.2 Fraction de glace et filtrage des pixels</w:t>", &format!("<w:t>2.2 Fraction</w:t>{ptab}<w:t>de glace et filtrage des pixels</w:t>"), 1);
    let mut d = Docx::from_bytes(package_with("christophe", &[("word/document.xml", &doc)])).unwrap();
    apply(&mut d, &op(json!({"op": "insert", "paragraph": "p0", "at": 3, "with": "!"})), true, &sig("Thierry")).unwrap();
    assert!(d.document_xml().contains(ptab), "la w:ptab ne doit pas devenir une w:tab");
}

// ------------------------------------------------- contrôle à chaque écriture

#[test]
fn le_controle_repere_ce_que_word_refuserait() {
    let doc = String::from_utf8(entries(&build("christophe")).into_iter().find(|(n, _)| n == "word/document.xml").unwrap().1).unwrap();
    let mut clean = open("christophe");
    let base = check::problems(&mut clean).unwrap();
    // Identifiant de paragraphe en double, texte ordinaire dans une suppression.
    let broken = doc.replacen("w14:paraId=\"1A2B3C02\"", "w14:paraId=\"1A2B3C01\"", 1).replacen("<w:delText>Ensuite, on</w:delText>", "<w:t>Ensuite, on</w:t>", 1);
    let mut d = Docx::from_bytes(package_with("christophe", &[("word/document.xml", &broken)])).unwrap();
    let p = check::problems(&mut d).unwrap();
    assert_eq!(p.get("identifiant de paragraphe en double").copied().unwrap_or(0), base.get("identifiant de paragraphe en double").copied().unwrap_or(0) + 1, "{p:?}");
    assert!(p.contains_key("texte ordinaire dans une suppression"), "{p:?}");
}

#[test]
fn un_fichier_deja_irregulier_reste_retouchable() {
    // Le défaut existait à l'arrivée : Atelier ne le corrige pas, mais ne
    // bloque pas non plus les retouches qui n'en ajoutent pas.
    let doc = String::from_utf8(entries(&build("christophe")).into_iter().find(|(n, _)| n == "word/document.xml").unwrap().1).unwrap();
    let broken = doc.replacen("w14:paraId=\"1A2B3C02\"", "w14:paraId=\"1A2B3C01\"", 1);
    let (_dir, path) = temp_doc(&package_with("christophe", &[("word/document.xml", &broken)]));
    edit(&path, json!({"op": "accept", "id": 101}), "Thierry").unwrap();
}

/// Dix paragraphes insérés d'un coup au même endroit (même texte de départ,
/// même date) : chacun son w14:paraId, sinon le contrôle refuse le lot.
#[test]
fn dix_paragraphes_d_un_coup_ont_chacun_leur_identifiant() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("c.docx");
    std::fs::write(&path, build("christophe")).unwrap();
    let rev = atelier_docx::Docx::open(&path).unwrap().revision().to_string();
    let long = "Les glaciers tropicaux perdent leur masse. ".repeat(6);
    let ops: Vec<_> = (0..10).map(|k| serde_json::json!({"op": "insert_paragraph", "after": "p2", "text": format!("{k}. {long}")})).collect();
    let op: atelier_docx::ops::Op = serde_json::from_value(serde_json::json!({"op": "batch", "ops": ops})).unwrap();
    atelier_docx::edit_file(&path, Some(&rev), |d| atelier_docx::ops::apply(d, &op, false, &sig("Thierry")).map(|_| ())).unwrap();
    let mut d = atelier_docx::Docx::open(&path).unwrap();
    let p = atelier_docx::check::problems(&mut d).unwrap();
    assert!(!p.contains_key("identifiant de paragraphe en double"), "{p:?}");
}
