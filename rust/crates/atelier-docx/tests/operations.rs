mod common;

use atelier_docx::ops::{Op, apply, outline};
use common::*;
use serde_json::json;

fn op(v: serde_json::Value) -> Op {
    serde_json::from_value(v).unwrap()
}

#[test]
fn les_positions_du_panneau_suivent_le_texte_courant_de_chaque_paragraphe() {
    // Le panneau calcule ses positions sur `text` du modèle : la base doit
    // compter pareil, partout (champs, objets, suivis, cellules).
    let mut d = open("christophe");
    let m = d.model().unwrap();
    for p in &m.paragraphs {
        let n = p.text.chars().count();
        let mut copy = open("christophe");
        let r = apply(&mut copy, &op(json!({"op": "insert", "paragraph": p.id, "at": n, "with": "Z"})), true, &sig("Thierry"));
        if r.is_ok() {
            assert_eq!(copy.model().unwrap().paragraphs.iter().find(|x| x.id == p.id).unwrap().text, format!("{}Z", p.text), "{}", p.id);
        }
        let past = apply(&mut open("christophe"), &op(json!({"op": "insert", "paragraph": p.id, "at": n + 1, "with": "Z"})), true, &sig("Thierry"));
        assert!(past.is_err(), "{} : au-delà de la fin refusé", p.id);
    }
    // Retour arrière (plage) puis frappe par-dessus une sélection.
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": "p13", "start": 0, "end": 9, "with": ""})), true, &sig("Thierry")).unwrap();
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": "p13", "start": 0, "end": 0, "with": "Le texte "})), true, &sig("Thierry")).unwrap();
    let m = d.model().unwrap();
    assert!(m.paragraphs[13].text.starts_with("Le texte Un texte"), "{}", m.paragraphs[13].text);
    assert!(m.paragraphs[13].segments.iter().any(|s| s.rev == Some("del") && s.text == "Un texte "));
}

#[test]
fn l_agent_cite_un_passage_sans_connaitre_le_paragraphe() {
    let mut d = open("christophe");
    let claude = sig("Claude");
    let r = apply(&mut d, &op(json!({"op": "replace", "find": "compromis", "with": "équilibre"})), true, &claude).unwrap();
    assert_eq!(r["paragraph"], "p2");
    let m = d.model().unwrap();
    assert!(m.changes.iter().any(|c| c.author == "Claude" && c.kind == "ins" && c.text == "équilibre"));
    assert!(m.changes.iter().any(|c| c.author == "Claude" && c.kind == "del" && c.text == "compromis"));

    // « Un texte » apparaît deux fois dans p13 : il faut préciser.
    let e = apply(&mut d, &op(json!({"op": "replace", "find": "Un texte", "with": "Ce texte"})), true, &claude).unwrap_err();
    assert!(e.0.contains("2 fois"), "{e}");
    apply(&mut d, &op(json!({"op": "replace", "find": "Un texte", "occurrence": 2, "with": "Ce texte"})), true, &claude).unwrap();
    assert!(d.model().unwrap().paragraphs[13].text.starts_with("Un texte Ce texte"));
    let e = apply(&mut d, &op(json!({"op": "replace", "find": "glacier tropical", "with": "x"})), true, &claude).unwrap_err();
    assert!(e.0.contains("introuvable"));

    // Commenter et répondre, puis résoudre le fil de Christophe.
    let c = apply(&mut d, &op(json!({"op": "comment", "find": "pureté du signal", "text": "Préciser la métrique."})), true, &claude).unwrap();
    let id = c["id"].as_u64().unwrap();
    apply(&mut d, &op(json!({"op": "reply", "parent": 1, "text": "Seuil justifié en 2.3."})), true, &claude).unwrap();
    apply(&mut d, &op(json!({"op": "resolve", "id": 1})), true, &claude).unwrap();
    let m = d.model().unwrap();
    assert!(m.comments.iter().any(|x| x.id as u64 == id && x.quote == "pureté du signal" && x.author == "Claude"));
    assert!(m.comments.iter().find(|x| x.id == 1).unwrap().done);
    assert_eq!(m.comments.iter().filter(|x| x.parent == Some(1)).count(), 2);
    assert!(libreoffice_text(&d.to_bytes().unwrap()).is_none_or(|t| t.contains("équilibre")));
}

#[test]
fn les_operations_du_panneau_en_json() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let n = d.model().unwrap().paragraphs.len();
    apply(&mut d, &op(json!({"op": "split", "paragraph": "p2", "at": 26})), true, &me).unwrap();
    apply(&mut d, &op(json!({"op": "join", "paragraph": "p3"})), true, &me).unwrap();
    assert_eq!(d.model().unwrap().paragraphs.len(), n);
    apply(&mut d, &op(json!({"op": "format_range", "paragraph": "p2", "start": 0, "end": 9, "props": {"b": true}})), true, &me).unwrap();
    apply(&mut d, &op(json!({"op": "format_paragraph", "paragraph": "p2", "props": {"align": "both"}})), true, &me).unwrap();
    apply(&mut d, &op(json!({"op": "comment_range", "paragraph": "p2", "start": 3, "end": 8, "text": "Valeur ?"})), true, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[2].align.as_deref(), Some("both"));
    assert!(m.comments.iter().any(|c| c.quote == "seuil" && c.author == "Thierry"));
    let r = apply(&mut d, &op(json!({"op": "reject_all", "author": "Thierry"})), true, &me).unwrap();
    assert_eq!(r["done"], 2);
    let r = apply(&mut d, &op(json!({"op": "accept", "id": 101})), true, &me);
    assert!(r.is_ok());
    assert!(serde_json::from_value::<Op>(json!({"op": "effacer_tout"})).is_err());
}

#[test]
fn le_texte_pour_l_agent_marque_suivis_et_commentaires() {
    let mut d = open("christophe");
    let m = d.model().unwrap();
    let t = outline(&m, 0, None, 100_000);
    assert!(t.contains("p0 [titre 1] : 2.2 Fraction de glace"), "{t}");
    assert!(t.contains("[-Ensuite, on-]#101[+On+]#102"), "{t}");
    assert!(t.contains("{citation : (Ren et al., 2021)}"), "{t}");
    assert!(t.contains("⟦c1⟧⟦c2⟧Le seuil de 0,6 retenu ici⟦/c1⟧⟦/c2⟧") || t.contains("⟦c1⟧"), "{t}");
    assert!(t.contains("c1 Christophe"), "{t}");
    assert!(t.contains("  ↳ c2 Thierry"), "{t}");
    assert!(t.contains("#103 paragraph-del Christophe"), "{t}");
    assert!(t.contains("hors du corps"), "{t}");
    // Bornes et découpe annoncée.
    let part = outline(&m, 2, Some(3), 100_000);
    assert!(part.contains("p2 : ") && !part.contains("p1 : ") && !part.contains("p3 : "));
    let short = outline(&m, 0, None, 200);
    assert!(short.contains("suite à partir de p"), "{short}");
}

#[test]
fn enregistrer_sur_disque_refuse_une_version_perimee() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Chapitre 2 corrigé CK.docx");
    std::fs::write(&path, build("christophe")).unwrap();
    let rev0 = atelier_docx::Docx::open(&path).unwrap().revision();
    let me = sig("Thierry");
    let (_, rev1) = atelier_docx::edit_file(&path, Some(&rev0), |d| apply(d, &op(json!({"op": "accept", "id": 101})), true, &me)).unwrap();
    assert_ne!(rev0, rev1);
    assert_eq!(atelier_docx::Docx::open(&path).unwrap().revision(), rev1);
    // Une retouche calculée sur rev0 est refusée, et le fichier reste intact.
    let e = atelier_docx::edit_file(&path, Some(&rev0), |d| apply(d, &op(json!({"op": "accept", "id": 102})), true, &me)).unwrap_err();
    assert!(e.is_conflict());
    assert_eq!(atelier_docx::Docx::open(&path).unwrap().revision(), rev1);
    // Une retouche qui échoue n'écrit rien non plus ; aucun fichier ne traîne à côté.
    assert!(atelier_docx::edit_file(&path, None, |d| apply(d, &op(json!({"op": "accept", "id": 999})), true, &me)).is_err());
    assert_eq!(atelier_docx::Docx::open(&path).unwrap().revision(), rev1);
    let names: Vec<_> = std::fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
    assert_eq!(names.len(), 1, "{names:?}");
}
