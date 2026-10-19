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
    assert!(t.contains("{note 1 : n1}"), "{t}");
    assert!(t.contains("[note 1]\nn1.p0 [Notedebasdepage] :  Seuil appliqué à la fraction [+Sentinel-2 +]#120"), "{t}");
    assert!(t.contains("[en-tête]\nheader1.p0"), "{t}");
    assert!(t.contains("#120 ins Christophe 2026-10-14 (n1.p0)"), "{t}");
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

#[test]
fn l_agent_ajoute_un_paragraphe_en_suivi() {
    let mut d = open("christophe");
    let claude = sig("Claude");
    let n = d.model().unwrap().paragraphs.len();
    let r = apply(&mut d, &op(json!({"op": "insert_paragraph", "after": "p2", "text": "Ce seuil est discuté en 2.3."})), true, &claude).unwrap();
    assert_eq!(r["paragraph"], "p3");
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs.len(), n + 1);
    assert_eq!(m.paragraphs[3].text, "Ce seuil est discuté en 2.3.");
    assert!(m.paragraphs[2].text.ends_with("signal glaciaire."));
    let kinds: Vec<&str> = m.changes.iter().filter(|c| c.author == "Claude").map(|c| c.kind.as_str()).collect();
    assert!(kinds.contains(&"paragraph-ins") && kinds.contains(&"ins"), "{kinds:?}");
    // Tout refuser rend le document d'origine.
    apply(&mut d, &op(json!({"op": "reject_all", "author": "Claude"})), true, &claude).unwrap();
    let back = d.model().unwrap();
    assert_eq!(back.paragraphs.len(), n);
    assert!(libreoffice_text(&d.to_bytes().unwrap()).is_none_or(|t| !t.contains("discuté en 2.3")));
}

#[test]
fn une_selection_sur_plusieurs_paragraphes_s_efface_d_un_seul_geste() {
    // Ce que le panneau envoie pour « sélection de p2 (après « Le seuil ») à
    // p4 (avant « 0,04 ») puis retour arrière », sans suivi : du dernier au premier.
    let me = sig("Thierry");
    let mut d = open("christophe");
    let m = d.model().unwrap();
    let len = |i: usize| m.paragraphs[i].text.chars().count();
    let o4 = m.paragraphs[4].text.find("0,04").map(|b| m.paragraphs[4].text[..b].chars().count()).unwrap();
    let batch = json!({"op": "batch", "ops": [
        {"op": "replace_range", "paragraph": "p4", "start": 0, "end": o4, "with": ""},
        {"op": "join", "paragraph": "p4"},
        {"op": "replace_range", "paragraph": "p3", "start": 0, "end": len(3), "with": ""},
        {"op": "join", "paragraph": "p3"},
        {"op": "replace_range", "paragraph": "p2", "start": 8, "end": len(2), "with": ""},
    ]});
    let n = m.paragraphs.len();
    apply(&mut d, &op(batch.clone()), false, &me).unwrap();
    let after = d.model().unwrap();
    assert_eq!(after.paragraphs.len(), n - 2);
    assert!(after.paragraphs[2].text.starts_with("Le seuil0,04"), "{}", after.paragraphs[2].text);

    // Une étape impossible : rien n'est touché.
    let mut d = open("christophe");
    let before = d.document_xml().to_string();
    let bad = json!({"op": "batch", "ops": [
        {"op": "replace_range", "paragraph": "p2", "start": 0, "end": 3, "with": ""},
        {"op": "accept", "id": 999},
    ]});
    let e = apply(&mut d, &op(bad), true, &me).unwrap_err();
    assert!(e.0.starts_with("étape 2"), "{e}");
    assert_eq!(d.document_xml(), before);
    assert!(!d.is_dirty());
}

#[test]
fn annuler_remet_le_paquet_d_avant() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.docx");
    std::fs::write(&path, build("christophe")).unwrap();
    let me = sig("Thierry");
    let (_, rev1, before) = atelier_docx::edit_file_keep(&path, None, |d| apply(d, &op(json!({"op": "accept", "id": 101})), true, &me)).unwrap();
    let before = before.unwrap();
    let rev0 = atelier_docx::revision_of(&before);
    let undone = atelier_docx::replace_file(&path, &rev1, &before).unwrap();
    assert_eq!(atelier_docx::Docx::open(&path).unwrap().revision(), rev0);
    assert!(atelier_docx::replace_file(&path, &rev1, &undone).unwrap_err().is_conflict());
    atelier_docx::replace_file(&path, &rev0, &undone).unwrap();
    assert_eq!(atelier_docx::Docx::open(&path).unwrap().revision(), rev1);
}

#[test]
fn entree_dans_sa_propre_frappe_ou_un_lien_garde_un_xml_valide() {
    // Le paragraphe ne doit jamais se couper à l'intérieur d'un w:ins resté
    // ouvert : au bord, la coupe passe dehors ; au milieu, il est rouvert.
    let me = sig("Thierry");
    for (at, first, second) in [(41, "Le seuil de 0,6 retenu ici, fixé a priori", " offre"), (32, "Le seuil de 0,6 retenu ici, fixé", " a priori offre"), (26, "Le seuil de 0,6 retenu ici", ", fixé a priori offre")] {
        let mut d = open("christophe");
        apply(&mut d, &op(json!({"op": "insert", "paragraph": "p2", "at": 26, "with": ", fixé a priori"})), true, &me).unwrap();
        assert!(d.model().unwrap().paragraphs[2].text.starts_with("Le seuil de 0,6 retenu ici, fixé a priori offre"));
        apply(&mut d, &op(json!({"op": "split", "paragraph": "p2", "at": at})), true, &me).unwrap();
        let m = d.model().unwrap();
        assert_eq!(m.paragraphs[2].text, first, "at={at}");
        assert!(m.paragraphs[3].text.starts_with(second), "at={at} : {}", m.paragraphs[3].text);
        // L'insertion reste une insertion de part et d'autre.
        let ins: String = m.changes.iter().filter(|c| c.author == "Thierry" && c.kind == "ins").map(|c| c.text.as_str()).collect();
        assert_eq!(ins, ", fixé a priori", "at={at}");
        let mut ids: Vec<u32> = m.changes.iter().map(|c| c.id).collect();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n, "identifiants uniques");
    }
    // Entrée au milieu du lien vers le NSIDC.
    let mut d = open("christophe");
    let p = d.model().unwrap().paragraphs.iter().position(|p| p.text.contains("site du NSIDC")).unwrap();
    let text = d.model().unwrap().paragraphs[p].text.clone();
    let at = text.chars().count() - text.split("NSIDC").nth(1).unwrap().chars().count() - 2;
    apply(&mut d, &op(json!({"op": "split", "paragraph": format!("p{p}"), "at": at})), false, &me).unwrap();
    let m = d.model().unwrap();
    assert_eq!(format!("{}{}", m.paragraphs[p].text, m.paragraphs[p + 1].text), text);
}

#[test]
fn notes_en_tetes_et_pieds_se_retouchent_comme_le_corps() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    // Frappe en suivi dans la note, puis accepter le suivi de Christophe.
    apply(&mut d, &op(json!({"op": "insert", "paragraph": "n1.p0", "at": 1, "with": "Ce "})), true, &me).unwrap();
    apply(&mut d, &op(json!({"op": "accept", "id": 120})), true, &me).unwrap();
    // L'agent cite un passage de la note sans dire où il est.
    let r = apply(&mut d, &op(json!({"op": "replace", "find": "juillet à septembre", "with": "juin à septembre"})), true, &sig("Claude")).unwrap();
    assert_eq!(r["paragraph"], "n1.p0");
    let c = apply(&mut d, &op(json!({"op": "comment", "paragraph": "n1.p0", "find": "Sentinel-2", "text": "Landsat aussi ?"})), true, &me).unwrap();
    let cid = c["id"].as_u64().unwrap() as u32;
    apply(&mut d, &op(json!({"op": "reply", "parent": cid, "text": "Non, MODIS seulement."})), true, &sig("Claude")).unwrap();
    // En-tête : mise en forme et Entrée ; pied de page : alignement.
    apply(&mut d, &op(json!({"op": "format_range", "paragraph": "header1.p0", "start": 0, "end": 10, "props": {"b": true}})), true, &me).unwrap();
    apply(&mut d, &op(json!({"op": "split", "paragraph": "header1.p0", "at": 10})), true, &me).unwrap();
    apply(&mut d, &op(json!({"op": "format_paragraph", "paragraph": "footer1.p0", "props": {"align": "right"}})), true, &me).unwrap();

    let bytes = d.to_bytes().unwrap();
    let mut d = atelier_docx::Docx::from_bytes(bytes).unwrap();
    let m = d.model().unwrap();
    let n = &m.notes[0].paragraphs[0];
    assert_eq!(n.text, " Ce Seuil appliqué à la fraction Sentinel-2 moyenne de juin à septembre.");
    assert!(!m.changes.iter().any(|c| c.id == 120));
    assert!(m.changes.iter().any(|c| c.author == "Thierry" && c.text == "Ce " && c.paragraph.as_deref() == Some("n1.p0")));
    assert!(m.changes.iter().any(|c| c.author == "Claude" && c.kind == "del" && c.text == "juillet à septembre"));
    let cm = m.comments.iter().find(|x| x.id == cid).unwrap();
    assert_eq!((cm.quote.as_str(), cm.paragraph.as_deref()), ("Sentinel-2", Some("n1.p0")));
    assert!(m.comments.iter().any(|x| x.parent == Some(cid) && x.author == "Claude"));
    let h = &m.headers[0].paragraphs;
    assert_eq!((h[0].text.as_str(), h[1].text.as_str()), ("Chapitre 2", " – Albédo des glaciers tropicaux"));
    assert!(h[0].segments[0].b);
    assert_eq!(m.headers[1].paragraphs[0].align.as_deref(), Some("right"));
    // Les identifiants restent uniques d'une partie à l'autre.
    let mut ids: Vec<u32> = m.changes.iter().map(|c| c.id).collect();
    let k = ids.len();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), k);

    // Tout refuser couvre aussi la note et l'en-tête.
    apply(&mut d, &op(json!({"op": "reject_all"})), true, &me).unwrap();
    let m = d.model().unwrap();
    assert!(m.changes.is_empty(), "{:?}", m.changes);
    assert_eq!(m.headers[0].paragraphs.len(), 1);
    // Supprimer le commentaire de la note retire ses ancrages.
    apply(&mut d, &op(json!({"op": "delete_comment", "id": cid})), true, &me).unwrap();
    assert!(!d.part("word/footnotes.xml").unwrap().unwrap().contains("commentRangeStart"));
}

/// Position (en caractères) et longueur du premier segment qui répond à `f`.
fn seg(d: &mut atelier_docx::Docx, f: impl Fn(&atelier_docx::model::Segment) -> bool) -> (String, usize, usize) {
    let m = d.model().unwrap();
    for p in m.all_paragraphs() {
        let mut at = 0;
        for s in &p.segments {
            let n = s.text.chars().count();
            if f(s) {
                return (p.id.clone(), at, n);
            }
            if s.rev != Some("del") {
                at += n;
            }
        }
    }
    panic!("segment introuvable");
}

#[test]
fn figures_notes_citations_et_equations_s_effacent_d_un_bloc() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let (p, at, n) = seg(&mut d, |s| s.media.is_some());
    assert_eq!(n, 1);
    let m = d.model().unwrap();
    let img = m.all_paragraphs().into_iter().find(|x| x.id == p).unwrap().segments.iter().find(|s| s.media.is_some()).unwrap().clone();
    assert_eq!((img.media.as_deref(), img.width, img.alt.as_deref(), img.whole), (Some("rId5"), Some(96), Some("Figure 2.4"), true));

    // Figure : effacée en suivi, elle reste dans le fichier jusqu'à l'acceptation.
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": p, "start": at, "end": at + 1, "with": ""})), true, &me).unwrap();
    let m = d.model().unwrap();
    let del = m.changes.iter().find(|c| c.author == "Thierry" && c.kind == "del").unwrap().id;
    assert!(d.part("word/document.xml").unwrap().unwrap().contains("<w:del"));
    apply(&mut d, &op(json!({"op": "accept", "id": del})), true, &me).unwrap();
    assert!(!d.part("word/document.xml").unwrap().unwrap().contains("<w:drawing"));

    // Citation Zotero : un bloc, en suivi le code du champ passe en delInstrText.
    let (p, at, n) = seg(&mut d, |s| s.whole && s.text == "(Ren et al., 2021)");
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": p, "start": at, "end": at + n, "with": ""})), true, &me).unwrap();
    let x = d.part("word/document.xml").unwrap().unwrap();
    assert!(x.contains("<w:delInstrText") && x.contains("<w:delText>(Ren et al., 2021)</w:delText>"), "{x}");
    // Une sélection qui coupe la citation est refusée.
    apply(&mut d, &op(json!({"op": "reject_all"})), true, &me).unwrap();
    let (p, at, _) = seg(&mut d, |s| s.whole && s.text == "(Ren et al., 2021)");
    assert!(apply(&mut d, &op(json!({"op": "replace_range", "paragraph": p, "start": at + 1, "end": at + 4, "with": ""})), true, &me).is_err());

    // Appel de note effacé sans suivi : la note disparaît avec lui.
    let (p, at, n) = seg(&mut d, |s| s.label.as_deref() == Some("note"));
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": p, "start": at, "end": at + n, "with": ""})), false, &me).unwrap();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    assert!(m.notes.is_empty());
    assert!(!d.part("word/footnotes.xml").unwrap().unwrap().contains("w:id=\"1\""));

    // Équation : on ne peut pas l'effacer en suivi, mais bien sans.
    let (p, at, n) = seg(&mut d, |s| s.whole && s.label.as_deref() == Some("équation"));
    assert!(apply(&mut d, &op(json!({"op": "replace_range", "paragraph": p, "start": at, "end": at + n, "with": ""})), true, &me).is_err());
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": p, "start": at, "end": at + n, "with": ""})), false, &me).unwrap();
    assert_eq!(d.part("word/document.xml").unwrap().unwrap().matches("<m:oMath>").count(), 0);
    reopen(&d);
}

#[test]
fn inserer_une_note_et_une_figure() {
    let me = sig("Claude");
    let mut d = open("christophe");
    // Note en suivi : appel dans le corps, note signée dans footnotes.xml.
    let r = apply(&mut d, &op(json!({"op": "insert_note", "paragraph": "p2", "at": 5, "text": "Voir Rabatel et al. (2013)."})), true, &me).unwrap();
    assert_eq!(r["id"], "n2");
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let note = m.notes.iter().find(|n| n.id == "n2").unwrap();
    assert_eq!(note.paragraphs[0].text, " Voir Rabatel et al. (2013).");
    assert_eq!(note.paragraphs[0].style.as_deref(), Some("Notedebasdepage"));
    assert_eq!(m.changes.iter().filter(|c| c.author == "Claude" && c.kind == "ins").count(), 2);
    // Refuser l'appel fait disparaître la note.
    let call = m.changes.iter().find(|c| c.author == "Claude" && c.paragraph.as_deref() == Some("p2")).unwrap().id;
    apply(&mut d, &op(json!({"op": "reject", "id": call})), true, &me).unwrap();
    assert!(d.model().unwrap().notes.iter().all(|n| n.id != "n2"));
    // Pas de note dans une note.
    assert!(apply(&mut d, &op(json!({"op": "insert_note", "paragraph": "n1.p0", "at": 0, "text": "x"})), true, &me).is_err());

    // Figure : chargée par l'appelant, réduite à la largeur du texte.
    let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    png.extend_from_slice(&1200u32.to_be_bytes());
    png.extend_from_slice(&600u32.to_be_bytes());
    png.extend_from_slice(&[8, 6, 0, 0, 0]);
    let mut o = op(json!({"op": "insert_image", "paragraph": "p2", "at": 0, "path": "figures/albedo.png", "alt": "Albédo 2019"}));
    assert!(apply(&mut d, &o, false, &me).is_err());
    o.load_images(&mut |p| { assert_eq!(p, "figures/albedo.png"); Ok(png.clone()) }).unwrap();
    let r = apply(&mut d, &o, false, &me).unwrap();
    let rel = r["id"].as_str().unwrap().to_string();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let s = m.paragraphs[2].segments.iter().find(|s| s.media.as_deref() == Some(rel.as_str())).unwrap();
    // 6,5 po de texte = 624 px ; 1200×600 → 624×312.
    assert_eq!((s.width, s.height, s.alt.as_deref()), (Some(624), Some(312), Some("Albédo 2019")));
    let (bytes, mime) = atelier_docx::objects::media(&mut d, "p2", &rel).unwrap().unwrap();
    assert_eq!((bytes, mime), (png, "image/png"));
    assert!(d.part("[Content_Types].xml").unwrap().unwrap().contains(r#"Extension="png""#));
    // La figure d'origine se lit aussi.
    assert_eq!(atelier_docx::objects::media(&mut d, "p11", "rId5").unwrap().unwrap().1, "image/png");
}

#[test]
fn effacer_sa_propre_figure_ou_note_en_suivi_ne_laisse_pas_de_trace() {
    let (claude, me) = (sig("Claude"), sig("Thierry"));
    let mut d = open("christophe");
    let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
    png.extend_from_slice(&[0, 0, 0, 10, 0, 0, 0, 10, 8, 6, 0, 0, 0]);
    let mut o = op(json!({"op": "insert_image", "paragraph": "p2", "at": 0, "path": "f.png"}));
    o.load_images(&mut |_| Ok(png.clone())).unwrap();
    apply(&mut d, &o, true, &claude).unwrap();
    // Un autre auteur ne l'efface pas : il refuse l'ajout.
    let e = apply(&mut d, &op(json!({"op": "replace_range", "paragraph": "p2", "start": 0, "end": 1, "with": ""})), true, &me).unwrap_err();
    assert!(e.0.contains("ajouté en suivi par Claude"), "{}", e.0);
    let before = d.model().unwrap().changes.len();
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": "p2", "start": 0, "end": 1, "with": ""})), true, &claude).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.changes.len(), before - 1);
    assert!(m.paragraphs[2].segments.iter().all(|s| s.media.is_none()));

    // Note ajoutée en suivi puis effacée par son auteur : la note part aussi.
    apply(&mut d, &op(json!({"op": "insert_note", "paragraph": "p2", "at": 3, "text": "x"})), true, &me).unwrap();
    assert_eq!(d.model().unwrap().notes.len(), 2);
    apply(&mut d, &op(json!({"op": "replace_range", "paragraph": "p2", "start": 3, "end": 4, "with": ""})), true, &me).unwrap();
    let m = reopen(&d).model().unwrap();
    assert_eq!(m.notes.len(), 1);
    assert!(!m.changes.iter().any(|c| c.author == "Thierry"), "{:?}", m.changes);
}

#[test]
fn lignes_en_suivi_et_colonnes_de_tableau() {
    let me = sig("Thierry");
    let mut d = open("christophe");
    let cells = |d: &mut atelier_docx::Docx| -> Vec<(String, [u32; 3])> {
        d.model().unwrap().paragraphs.iter().filter_map(|p| p.cell.map(|c| (p.text.clone(), c))).collect()
    };
    // Ligne ajoutée sous l'en-tête, en suivi ; on y écrit.
    apply(&mut d, &op(json!({"op": "insert_row", "paragraph": "p7"})), true, &me).unwrap();
    let c = cells(&mut d);
    assert_eq!(c.len(), 6);
    assert_eq!((c[2].0.as_str(), c[2].1), ("", [0, 1, 0]));
    apply(&mut d, &op(json!({"op": "insert", "paragraph": "p9", "at": 0, "with": "Z4"})), true, &me).unwrap();
    let m = d.model().unwrap();
    assert!(m.changes.iter().any(|c| c.kind == "row-ins" && c.author == "Thierry"));
    // La ligne de Christophe ne se supprime pas : on refuse son ajout.
    assert!(apply(&mut d, &op(json!({"op": "delete_row", "paragraph": "p11"})), true, &me).unwrap_err().0.contains("Christophe"));
    // Sa propre ligne part sans trace.
    apply(&mut d, &op(json!({"op": "delete_row", "paragraph": "p9"})), true, &me).unwrap();
    assert_eq!(cells(&mut d).len(), 4);
    assert!(!d.model().unwrap().changes.iter().any(|c| c.author == "Thierry"));

    // Ligne d'en-tête supprimée en suivi : marquée, texte barré ; accepter l'enlève.
    apply(&mut d, &op(json!({"op": "delete_row", "paragraph": "p7"})), true, &me).unwrap();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let row = m.changes.iter().find(|c| c.kind == "row-del" && c.author == "Thierry").unwrap().id;
    assert!(m.changes.iter().any(|c| c.kind == "del" && c.text == "Zone"), "{:?}", m.changes);
    apply(&mut d, &op(json!({"op": "accept", "id": row})), true, &me).unwrap();
    let c = cells(&mut d);
    assert_eq!(c.iter().map(|x| x.0.as_str()).collect::<Vec<_>>(), ["Z3", "0,41"]);

    // Colonnes : directement, la largeur partagée.
    apply(&mut d, &op(json!({"op": "insert_column", "paragraph": "p6"})), true, &me).unwrap();
    let c = cells(&mut d);
    assert_eq!(c.iter().map(|x| x.1).collect::<Vec<_>>(), [[0, 0, 0], [0, 0, 1], [0, 0, 2]]);
    let x = d.part("word/document.xml").unwrap().unwrap();
    assert!(x.contains(r#"<w:gridCol w:w="2250"/><w:gridCol w:w="2250"/><w:gridCol w:w="4500"/>"#), "{x}");
    apply(&mut d, &op(json!({"op": "insert", "paragraph": "p7", "at": 0, "with": "n"})), false, &me).unwrap();
    // La colonne de Christophe porte un suivi : on ne la supprime pas.
    assert!(apply(&mut d, &op(json!({"op": "delete_column", "paragraph": "p6"})), true, &me).is_err());
    apply(&mut d, &op(json!({"op": "delete_column", "paragraph": "p7"})), true, &me).unwrap();
    let x = reopen(&d).part("word/document.xml").unwrap().unwrap();
    assert!(x.contains(r#"<w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>"#), "{x}");
    assert_eq!(cells(&mut d).len(), 2);
}

#[test]
fn entree_en_fin_de_legende_laisse_le_champ_entier_dans_la_legende() {
    // La légende finit par un champ SEQ : sa marque de fin ne doit pas
    // partir dans le paragraphe suivant (le texte tapé deviendrait du champ).
    let m = open("christophe").model().unwrap();
    let cap = m.paragraphs.iter().position(|p| p.text.starts_with("Figure 2.4")).unwrap();
    let id = m.paragraphs[cap].id.clone();
    for (o, tracked) in [(json!({"op": "insert_paragraph", "after": id, "text": "Suite."}), true), (json!({"op": "split", "paragraph": id, "at": m.paragraphs[cap].text.chars().count()}), false)] {
        let mut d = open("christophe");
        apply(&mut d, &op(o), tracked, &sig("Thierry")).unwrap();
        let m2 = d.model().unwrap();
        let caption = &m2.paragraphs[cap];
        assert!(caption.segments.iter().any(|s| s.kind == "field" && s.text == "4"), "{:?}", caption.segments);
        assert!(m2.paragraphs[cap + 1].segments.iter().all(|s| s.kind != "field"), "{:?}", m2.paragraphs[cap + 1].segments);
    }
}
