//! Déplacer une figure à la main, changer sa taille, son texte de
//! remplacement (Thierry, 2026-11-15 : « cliquer sur une figure puis la
//! déplacer manuellement comme dans Word »). En suivi, le déplacement
//! s'écrit comme un couper-coller de Word et se décide d'un seul geste.

mod common;
use atelier_docx::check::problems;
use atelier_docx::ops::{Op, apply};
use atelier_docx::Docx;
use common::{build, entries, open, reopen, sig};
use serde_json::{Value, json};

fn op(v: Value) -> Op {
    serde_json::from_value(v).unwrap()
}

/// Morceaux de la fixture : balise racine, run de la figure, section.
fn parts() -> (String, String, String) {
    let (_, data) = entries(&build("christophe")).into_iter().find(|(n, _)| n == "word/document.xml").unwrap();
    let d = String::from_utf8(data).unwrap();
    let head = d[..d.find("<w:body>").unwrap() + 8].to_string();
    let i = d.find("<w:drawing").unwrap();
    let a = d[..i].rfind("<w:r>").unwrap();
    let b = i + d[i..].find("</w:r>").unwrap() + 6;
    let sect = d[d.rfind("<w:sectPr").unwrap()..].to_string();
    (head, d[a..b].to_string(), sect)
}

/// La fixture avec ce corps (les paragraphes reçoivent un paraId).
fn doc(body: &[String]) -> Docx {
    use std::io::Write;
    let (head, _, sect) = parts();
    let mut xml = head;
    for (k, p) in body.iter().enumerate() {
        xml.push_str(&p.replacen("<w:p>", &format!("<w:p w14:paraId=\"0000A0{k:02X}\">"), 1));
    }
    xml.push_str(&sect);
    let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, data) in entries(&build("christophe")) {
        out.start_file(name.as_str(), zip::write::SimpleFileOptions::default()).unwrap();
        out.write_all(if name == "word/document.xml" { xml.as_bytes() } else { &data }).unwrap();
    }
    Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap()
}

fn text(t: &str) -> String {
    format!("<w:p><w:r><w:t xml:space=\"preserve\">{t}</w:t></w:r></w:p>")
}

fn figure() -> String {
    format!("<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr>{}</w:p>", parts().1)
}

/// Légende au style de Word, numérotée par un champ, avec le signet d'un renvoi.
fn caption() -> String {
    concat!(
        "<w:p><w:pPr><w:pStyle w:val=\"Lgende\"/></w:pPr><w:bookmarkStart w:id=\"50\" w:name=\"_Ref1\"/>",
        "<w:r><w:t xml:space=\"preserve\">Figure </w:t></w:r><w:r><w:fldChar w:fldCharType=\"begin\"/></w:r>",
        "<w:r><w:instrText xml:space=\"preserve\"> SEQ Figure \\* ARABIC </w:instrText></w:r><w:r><w:fldChar w:fldCharType=\"separate\"/></w:r>",
        "<w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType=\"end\"/></w:r><w:bookmarkEnd w:id=\"50\"/>",
        "<w:r><w:t>. Albédo par zone.</w:t></w:r></w:p>"
    )
    .to_string()
}

/// Un, Deux, [figure], [légende], Trois, Quatre.
fn sample() -> Docx {
    doc(&[text("Un."), text("Deux."), figure(), caption(), text("Trois."), text("Quatre.")])
}

/// Texte courant de chaque paragraphe (« ▣ » pour une figure).
fn texts(d: &mut Docx) -> Vec<String> {
    d.model().unwrap().paragraphs.iter().map(|p| p.text.replace('\u{FFFC}', "▣")).collect()
}

/// Suivis du corps (la fixture en garde un dans une note).
fn changes(d: &mut Docx) -> Vec<atelier_docx::model::Change> {
    d.model().unwrap().changes.into_iter().filter(|c| c.paragraph.as_deref().is_some_and(|p| !p.contains('.'))).collect()
}

fn mv(d: &mut Docx, from: &str, to: &str, after: bool, tracked: bool) -> Value {
    apply(d, &op(json!({"op": "move_figure", "paragraph": from, "to": to, "after": after})), tracked, &sig("Thierry")).unwrap()
}

#[test]
fn la_figure_et_sa_legende_sont_reperees() {
    let mut d = sample();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[2].figure.as_ref().unwrap().caption.as_deref(), Some("p3"));
    assert!(m.paragraphs.iter().enumerate().all(|(i, p)| (i == 2) == p.figure.is_some()));
    let v = serde_json::to_value(&m).unwrap();
    assert_eq!(v["paragraphs"][2]["figure"], json!({"caption": "p3"}));
    assert!(v["paragraphs"][0].get("figure").is_none());

    // Sans style : « Figure 2 – … » est une légende, « Figure 2 montre… » non.
    let mut d = doc(&[figure(), text("Figure 2 – Bilan de masse."), figure(), text("Figure 3 montre que la glace fond."), figure(), text("Les figures 3 et 4.")]);
    let m = d.model().unwrap();
    let caps: Vec<Option<&str>> = [0, 2, 4].iter().map(|i| m.paragraphs[*i].figure.as_ref().unwrap().caption.as_deref()).collect();
    assert_eq!(caps, [Some("p1"), None, None]);

    // Légende au-dessus (style de légende), figure dans une ligne de texte.
    let above = caption().replace("_Ref1", "_Ref2");
    let inline = format!("<w:p><w:r><w:t xml:space=\"preserve\">Voir </w:t></w:r>{}</w:p>", parts().1);
    let mut d = doc(&[text("Un."), above, figure(), text("Deux."), inline]);
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[2].figure.as_ref().unwrap().caption.as_deref(), Some("p1"));
    assert!(m.paragraphs[4].figure.is_none(), "une figure dans une ligne de texte ne se déplace pas d'un bloc");
    let e = apply(&mut d, &op(json!({"op": "move_figure", "paragraph": "p4", "to": "p0"})), false, &sig("Thierry")).unwrap_err();
    assert!(e.0.contains("seule dans son paragraphe"), "{e}");
}

#[test]
fn hors_suivi_le_bloc_est_coupe_puis_colle() {
    let mut d = sample();
    let before = problems(&mut d).unwrap();
    let xml0 = d.document_xml().to_string();
    let r = mv(&mut d, "p2", "p5", true, false);
    assert_eq!(r, json!({"moved": true, "paragraph": "p4", "changes": []}));
    let mut d = reopen(&d);
    assert_eq!(texts(&mut d), ["Un.", "Deux.", "Trois.", "Quatre.", "▣", "Figure 1. Albédo par zone."]);
    let m = d.model().unwrap();
    assert!(changes(&mut d).is_empty());
    assert_eq!(m.paragraphs[4].figure.as_ref().unwrap().caption.as_deref(), Some("p5"));
    assert_eq!(problems(&mut d).unwrap(), before);
    // Vers le haut, puis retour : le XML retrouve son état de départ.
    assert_eq!(mv(&mut d, "p4", "p0", false, false)["paragraph"], "p0");
    assert_eq!(texts(&mut d), ["▣", "Figure 1. Albédo par zone.", "Un.", "Deux.", "Trois.", "Quatre."]);
    assert_eq!(mv(&mut d, "p0", "p3", true, false)["paragraph"], "p2");
    assert_eq!(d.document_xml(), xml0);

    // Sur place (devant elle-même, après sa légende, après le paragraphe d'avant) : rien.
    let edits = d.edits();
    for (to, after) in [("p2", false), ("p3", false), ("p3", true), ("p1", true), ("p4", false)] {
        assert_eq!(mv(&mut d, "p2", to, after, true)["moved"], false, "{to} {after}");
    }
    assert_eq!(d.edits(), edits);
    // Par l'identifiant stable des paragraphes, comme le panneau.
    assert_eq!(mv(&mut d, "id:0000A002", "id:0000A000", false, false)["paragraph"], "p0");
}

#[test]
fn en_suivi_l_ancienne_place_est_barree_et_la_nouvelle_ajoutee() {
    let mut d = sample();
    let before = problems(&mut d).unwrap();
    let r = mv(&mut d, "p2", "p0", false, true);
    assert_eq!((r["moved"].clone(), r["paragraph"].clone()), (json!(true), json!("p0")));
    let ids: Vec<u32> = r["changes"].as_array().unwrap().iter().map(|v| v.as_u64().unwrap() as u32).collect();
    assert_eq!(ids.len(), 4);
    let mut d = reopen(&d);
    assert_eq!(problems(&mut d).unwrap(), before, "rien que Word refuserait");
    let m = d.model().unwrap();
    // Texte courant : la figure est à sa nouvelle place ; l'ancienne ne compte plus.
    assert_eq!(texts(&mut d), ["▣", "Figure 1. Albédo par zone.", "Un.", "Deux.", "", "", "Trois.", "Quatre."]);
    let revs = |i: usize| m.paragraphs[i].segments.iter().map(|s| s.rev).collect::<Vec<_>>();
    assert!(revs(0).iter().chain(&revs(1)).all(|r| *r == Some("ins")));
    assert!(revs(4).iter().chain(&revs(5)).all(|r| *r == Some("del")));
    let kind = |id: u32| m.changes.iter().find(|c| c.id == id).unwrap().kind.clone();
    assert_eq!(ids.iter().map(|i| kind(*i)).collect::<Vec<_>>(), ["del", "paragraph-del", "ins", "paragraph-ins"]);
    // Un seul geste : les quatre suivis portent le même groupe, celui de la
    // figure à sa nouvelle place.
    let lead = m.paragraphs[0].segments[0].change.unwrap();
    assert_eq!(lead, ids[2]);
    assert!(changes(&mut d).iter().all(|c| c.group == Some(lead) && c.author == "Thierry"), "{:?}", m.changes);
    // La nouvelle place reste déplaçable ; l'ancienne ne l'est plus.
    assert_eq!(m.paragraphs[0].figure.as_ref().unwrap().caption.as_deref(), Some("p1"));
    assert!(m.paragraphs[4].figure.is_none());

    let xml = d.document_xml().to_string();
    // Le signet du renvoi suit la copie neuve ; les dessins ont chacun leur numéro.
    assert_eq!(xml.matches("w:name=\"_Ref1\"").count(), 1);
    assert!(xml.find("w:name=\"_Ref1\"").unwrap() < xml.find("<w:del ").unwrap());
    assert!(xml.contains("wp:docPr id=\"1\"") && xml.contains("wp:docPr id=\"2\""));
    // Comme Word : texte effacé en delText, champ en delInstrText, marques de paragraphe suivies.
    assert!(xml.contains("<w:delText xml:space=\"preserve\">Figure </w:delText>") && xml.contains("<w:delInstrText xml:space=\"preserve\"> SEQ Figure"));
    assert_eq!(xml.matches(&format!("<w:del w:id=\"{}\"", ids[1])).count(), 2);
    assert_eq!(xml.matches(&format!("<w:ins w:id=\"{}\"", ids[3])).count(), 2);
}

#[test]
fn accepter_ou_refuser_regle_tout_le_geste() {
    let moved = || {
        let mut d = sample();
        let r = mv(&mut d, "p2", "p5", false, true);
        (d, r["changes"].as_array().unwrap().iter().map(|v| v.as_u64().unwrap() as u32).collect::<Vec<u32>>())
    };
    let before = problems(&mut sample()).unwrap();
    // Accepter, par n'importe lequel des quatre suivis.
    for k in 0..4 {
        let (mut d, ids) = moved();
        let r = apply(&mut d, &op(json!({"op": "accept", "id": ids[k]})), true, &sig("Thierry")).unwrap();
        assert_eq!(r["decided"].as_array().unwrap().len(), 4);
        let mut d = reopen(&d);
        assert_eq!(texts(&mut d), ["Un.", "Deux.", "Trois.", "▣", "Figure 1. Albédo par zone.", "Quatre."]);
        assert!(changes(&mut d).is_empty());
        assert_eq!(problems(&mut d).unwrap(), before);
        assert!(!d.document_xml().contains("<w:rPr></w:rPr>") && !d.document_xml().contains("<w:pPr></w:pPr>"));
    }
    // Refuser : la figure retrouve sa place, avec le signet de sa légende.
    for k in 0..4 {
        let (mut d, ids) = moved();
        apply(&mut d, &op(json!({"op": "reject", "id": ids[k]})), true, &sig("Thierry")).unwrap();
        let mut d = reopen(&d);
        assert_eq!(texts(&mut d), ["Un.", "Deux.", "▣", "Figure 1. Albédo par zone.", "Trois.", "Quatre."]);
        let m = d.model().unwrap();
        assert!(changes(&mut d).is_empty());
        assert_eq!(m.paragraphs[2].figure.as_ref().unwrap().caption.as_deref(), Some("p3"));
        let xml = d.document_xml();
        let (s, e, cap) = (xml.find("<w:bookmarkStart w:id=\"50\"").unwrap(), xml.find("<w:bookmarkEnd w:id=\"50\"").unwrap(), xml.find("Lgende").unwrap());
        assert!(cap < s && s < e && e < xml.find("Trois.").unwrap());
        assert_eq!(problems(&mut d).unwrap(), before);
    }
    // Tout refuser, tout accepter, et une suite de décisions d'un lot.
    let (mut d, _) = moved();
    apply(&mut d, &op(json!({"op": "reject_all"})), true, &sig("Thierry")).unwrap();
    assert_eq!(texts(&mut d), ["Un.", "Deux.", "▣", "Figure 1. Albédo par zone.", "Trois.", "Quatre."]);
    assert!(d.document_xml().contains("w:name=\"_Ref1\""));
    let (mut d, _) = moved();
    let r = apply(&mut d, &op(json!({"op": "accept_all", "author": "Thierry"})), true, &sig("Thierry")).unwrap();
    assert_eq!(r["done"], 4);
    assert_eq!(texts(&mut d), ["Un.", "Deux.", "Trois.", "▣", "Figure 1. Albédo par zone.", "Quatre."]);
    let (mut d, ids) = moved();
    let ops: Vec<Value> = ids.iter().map(|id| json!({"op": "reject", "id": id})).collect();
    apply(&mut d, &op(json!({"op": "batch", "ops": ops})), true, &sig("Thierry")).unwrap();
    assert!(changes(&mut d).is_empty());
}

#[test]
fn deplacee_deux_fois_elle_ne_laisse_qu_un_geste() {
    let mut d = sample();
    let first = mv(&mut d, "p2", "p0", false, true);
    // Son propre ajout se déplace tel quel : pas de nouveau suivi.
    let second = mv(&mut d, "p0", "p7", true, true);
    assert_eq!(second, json!({"moved": true, "paragraph": "p6", "changes": []}));
    let mut d = reopen(&d);
    assert_eq!(texts(&mut d), ["Un.", "Deux.", "", "", "Trois.", "Quatre.", "▣", "Figure 1. Albédo par zone."]);
    let all = changes(&mut d);
    assert_eq!(all.len(), 4);
    let lead = first["changes"][2].as_u64().unwrap() as u32;
    assert!(all.iter().all(|c| c.group == Some(lead)));
    // Un autre auteur ne déplace pas ce qui attend encore une décision.
    let e = apply(&mut d, &op(json!({"op": "move_figure", "paragraph": "p6", "to": "p0"})), true, &sig("Claude")).unwrap_err();
    assert!(e.0.contains("en attente"), "{e}");
    apply(&mut d, &op(json!({"op": "reject", "id": lead})), true, &sig("Thierry")).unwrap();
    assert_eq!(texts(&mut d), ["Un.", "Deux.", "▣", "Figure 1. Albédo par zone.", "Trois.", "Quatre."]);
}

#[test]
fn le_geste_se_reconnait_apres_un_passage_par_word() {
    let mut d = sample();
    mv(&mut d, "p2", "p5", true, true);
    // Word renumérote les suivis à l'enregistrement : un identifiant par élément.
    let mut xml = String::new();
    let mut next = 900;
    for (k, piece) in d.document_xml().split("w:id=\"").enumerate() {
        if k == 0 {
            xml.push_str(piece);
            continue;
        }
        let rest = &piece[piece.find('"').unwrap()..];
        let tracked = xml.ends_with("<w:ins ") || xml.ends_with("<w:del ");
        if tracked {
            next += 1;
            xml.push_str(&format!("w:id=\"{next}{rest}"));
        } else {
            xml.push_str(&format!("w:id=\"{piece}"));
        }
    }
    let mut d = {
        use std::io::Write;
        let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, data) in entries(&d.to_bytes().unwrap()) {
            out.start_file(name.as_str(), zip::write::SimpleFileOptions::default()).unwrap();
            out.write_all(if name == "word/document.xml" { xml.as_bytes() } else { &data }).unwrap();
        }
        Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap()
    };
    let all = changes(&mut d);
    assert!(all.len() > 4, "{}", all.len());
    let lead = all[0].group.expect("geste reconnu");
    assert!(all.iter().all(|c| c.group == Some(lead)));
    apply(&mut d, &op(json!({"op": "reject", "id": lead})), true, &sig("Thierry")).unwrap();
    assert_eq!(texts(&mut d), ["Un.", "Deux.", "▣", "Figure 1. Albédo par zone.", "Trois.", "Quatre."]);
    assert!(changes(&mut d).is_empty());
}

#[test]
fn une_retouche_dans_la_legende_deplacee_garde_le_traitement_general() {
    let mut d = sample();
    let r = mv(&mut d, "p2", "p0", false, true);
    let lead = r["changes"][2].as_u64().unwrap() as u32;
    // Claude corrige la légende à sa nouvelle place.
    apply(&mut d, &op(json!({"op": "replace", "paragraph": "p1", "find": "zone", "with": "bande"})), true, &sig("Claude")).unwrap();
    let all = changes(&mut d);
    assert!(all.iter().all(|c| (c.author == "Claude") == c.group.is_none()), "{all:?}");
    apply(&mut d, &op(json!({"op": "accept", "id": lead})), true, &sig("Thierry")).unwrap();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    assert!(changes(&mut d).iter().all(|c| c.author == "Claude"), "{:?}", m.changes);
    assert_eq!(m.paragraphs.iter().filter(|p| p.segments.iter().any(|s| s.media.is_some())).count(), 1);
    assert_eq!(m.paragraphs[0].text, "\u{FFFC}");
}

#[test]
fn ce_qui_ne_se_deplace_pas_est_refuse_avec_une_explication() {
    let thierry = sig("Thierry");
    // La légende de la fixture porte une mise en forme en attente de Christophe.
    let mut d = open("christophe");
    let m = d.model().unwrap();
    let fig = m.paragraphs.iter().position(|p| p.figure.is_some()).unwrap();
    let e = apply(&mut d, &op(json!({"op": "move_figure", "paragraph": format!("p{fig}"), "to": "p0"})), true, &thierry).unwrap_err();
    assert!(e.0.contains("en attente"), "{e}");
    // Hors suivi, elle se déplace avec ce suivi tel quel.
    let before = problems(&mut d).unwrap();
    let n = m.changes.len();
    apply(&mut d, &op(json!({"op": "move_figure", "paragraph": format!("p{fig}"), "to": "p0"})), false, &thierry).unwrap();
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    assert_eq!((m.changes.len(), m.paragraphs[0].figure.is_some()), (n, true));
    assert_eq!(problems(&mut d).unwrap(), before);

    // Vers une cellule de tableau, une note ou un en-tête : refusé.
    let cell = m.paragraphs.iter().find(|p| p.cell.is_some()).unwrap().id.clone();
    for to in [cell.as_str(), "n1.p0", "header1.p0"] {
        assert!(apply(&mut d, &op(json!({"op": "move_figure", "paragraph": "p0", "to": to})), false, &thierry).is_err(), "{to}");
    }
    assert!(apply(&mut d, &op(json!({"op": "move_figure", "paragraph": "p0", "to": "p999"})), false, &thierry).is_err());

    // Une note appelée dans la légende : pas en suivi (l'appel serait en double).
    let noted = caption().replace("<w:r><w:t>. Albédo par zone.</w:t></w:r>", "<w:r><w:footnoteReference w:id=\"1\"/></w:r>");
    let mut d = doc(&[text("Un."), figure(), noted, text("Deux.")]);
    let e = apply(&mut d, &op(json!({"op": "move_figure", "paragraph": "p1", "to": "p0"})), true, &thierry).unwrap_err();
    assert!(e.0.contains("note"), "{e}");
    apply(&mut d, &op(json!({"op": "move_figure", "paragraph": "p1", "to": "p0"})), false, &thierry).unwrap();
}

#[test]
fn un_commentaire_qui_deborde_reste_a_sa_place() {
    // Le commentaire 1 va de « Un. » à la légende ; le 2 tient dans la légende.
    let first = "<w:p><w:commentRangeStart w:id=\"1\"/><w:r><w:t>Un.</w:t></w:r></w:p>".to_string();
    let cap = caption().replace(
        "<w:r><w:t>. Albédo par zone.</w:t></w:r>",
        "<w:commentRangeStart w:id=\"2\"/><w:r><w:t>. Albédo par zone.</w:t></w:r><w:commentRangeEnd w:id=\"2\"/><w:r><w:commentReference w:id=\"2\"/></w:r><w:commentRangeEnd w:id=\"1\"/><w:r><w:commentReference w:id=\"1\"/></w:r>",
    );
    let make = || doc(&[first.clone(), figure(), cap.clone(), text("Deux."), text("Trois.")]);
    let before = problems(&mut make()).unwrap();
    let mut d = make();
    mv(&mut d, "p1", "p4", true, true);
    let mut d = reopen(&d);
    assert_eq!(problems(&mut d).unwrap(), before);
    let m = d.model().unwrap();
    let at = |id: u32| m.comments.iter().find(|c| c.id == id).unwrap().paragraph.clone();
    assert_eq!(at(1).as_deref(), Some("p0"), "le commentaire qui déborde reste");
    assert_eq!(at(2).as_deref(), Some("p6"), "celui de la légende la suit");
    let xml = d.document_xml();
    assert_eq!(xml.matches("<w:commentReference w:id=\"1\"").count(), 1);
    assert_eq!(xml.matches("<w:commentReference w:id=\"2\"").count(), 1);
    // Refusé : tout revient (traitement général, le commentaire 1 n'ayant pas bougé).
    let lead = m.changes.iter().find_map(|c| c.group).unwrap();
    apply(&mut d, &op(json!({"op": "reject", "id": lead})), true, &sig("Thierry")).unwrap();
    let mut d = reopen(&d);
    assert_eq!(problems(&mut d).unwrap(), before);
    assert_eq!(texts(&mut d)[..3], ["Un.", "▣", "Figure 1. Albédo par zone."]);
    assert!(changes(&mut d).is_empty());

    // Hors suivi : le commentaire à cheval empêche le déplacement, avec une piste.
    let e = apply(&mut make(), &op(json!({"op": "move_figure", "paragraph": "p1", "to": "p4", "after": true})), false, &sig("Thierry")).unwrap_err();
    assert!(e.0.contains("commentaire"), "{e}");
}

#[test]
fn une_zone_de_texte_posee_sur_la_figure_la_suit_sans_defaut() {
    // Zone de texte ancrée dans le paragraphe de la figure (réponse d'un étudiant).
    let boxed = "<w:r><w:pict><v:shape style=\"position:absolute;width:60pt;height:20pt\"><v:textbox><w:txbxContent><w:p><w:r><w:t>0,42</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>";
    let fig = figure().replace("</w:p>", &format!("{boxed}</w:p>"));
    let mut d = doc(&[text("Un."), fig, caption(), text("Deux.")]);
    let before = problems(&mut d).unwrap();
    assert!(d.model().unwrap().paragraphs[1].figure.is_some());
    let r = mv(&mut d, "p1", "p0", false, true);
    let mut d = reopen(&d);
    assert_eq!(problems(&mut d).unwrap(), before, "le texte de la zone reste un w:t");
    assert_eq!(d.document_xml().matches("<w:t>0,42</w:t>").count(), 2);
    apply(&mut d, &op(json!({"op": "accept", "id": r["changes"][0]})), true, &sig("Thierry")).unwrap();
    assert_eq!(d.document_xml().matches("<w:t>0,42</w:t>").count(), 1);
    assert_eq!(texts(&mut d)[2..], ["Un.", "Deux."]);
}

#[test]
fn la_taille_et_le_texte_de_remplacement_se_changent_hors_suivi() {
    let thierry = sig("Thierry");
    let mut d = sample();
    let before = problems(&mut d).unwrap();
    let fig = |d: &mut Docx| d.model().unwrap().paragraphs[2].segments[0].clone();
    assert_eq!((fig(&mut d).width, fig(&mut d).height), (Some(96), Some(96)));
    let r = apply(&mut d, &op(json!({"op": "resize_image", "paragraph": "p2", "index": 0, "width": 240})), true, &thierry).unwrap();
    assert_eq!(r, json!({"tracked": false, "width": 240, "height": 240}));
    let mut d = reopen(&d);
    assert_eq!((fig(&mut d).width, fig(&mut d).height), (Some(240), Some(240)));
    // Le cadre et l'image dans le cadre : les deux tailles suivent.
    assert_eq!(d.document_xml().matches("cx=\"2286000\" cy=\"2286000\"").count(), 2);
    assert!(changes(&mut d).is_empty(), "Word ne suit pas la taille d'une image");
    // Jamais plus large que le texte (6,5 po), jamais minuscule.
    let r = apply(&mut d, &op(json!({"op": "resize_image", "paragraph": "p2", "index": 0, "width": 5000})), true, &thierry).unwrap();
    assert_eq!(r["width"], 624);
    let r = apply(&mut d, &op(json!({"op": "resize_image", "paragraph": "p2", "index": 0, "width": 1})), true, &thierry).unwrap();
    assert_eq!(r["width"], 24);
    assert!(apply(&mut d, &op(json!({"op": "resize_image", "paragraph": "p0", "index": 0, "width": 100})), true, &thierry).is_err());
    assert!(apply(&mut d, &op(json!({"op": "resize_image", "paragraph": "p2", "index": 1, "width": 100})), true, &thierry).is_err());

    // Texte de remplacement : ajouté, puis réécrit ; les guillemets sont échappés.
    assert_eq!(fig(&mut d).alt.as_deref(), Some("Figure 2.4"));
    apply(&mut d, &op(json!({"op": "set_image_alt", "paragraph": "p2", "index": 0, "alt": "Albédo \"été\" <2019>"})), true, &thierry).unwrap();
    let mut d = reopen(&d);
    assert_eq!(fig(&mut d).alt.as_deref(), Some("Albédo \"été\" <2019>"));
    apply(&mut d, &op(json!({"op": "set_image_alt", "paragraph": "p2", "index": 0, "alt": "Carte"})), true, &thierry).unwrap();
    assert_eq!(fig(&mut d).alt.as_deref(), Some("Carte"));
    assert_eq!(d.document_xml().matches("descr=").count(), 1);
    assert_eq!(problems(&mut reopen(&d)).unwrap(), before);
}

#[test]
fn une_figure_en_haut_de_page_et_commentee_se_deplace_et_se_regle_aussi() {
    // Le cas de revCK (Thierry, 2026-11-15) : Word glisse la marque de saut
    // de page rendue dans le run de la figure, et un commentaire l'entoure.
    let thierry = sig("Thierry");
    let run = parts().1;
    let marked = run.replacen("<w:r>", "<w:r><w:lastRenderedPageBreak/>", 1);
    assert_ne!(marked, run);
    let fig = format!(
        "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr><w:commentRangeStart w:id=\"1\"/>{marked}<w:commentRangeEnd w:id=\"1\"/><w:r><w:rPr><w:rStyle w:val=\"CommentReference\"/></w:rPr><w:commentReference w:id=\"1\"/></w:r></w:p>"
    );
    let mut d = doc(&[text("Un."), text("Deux."), fig, caption(), text("Trois.")]);
    let before = problems(&mut d).unwrap();
    let m = d.model().unwrap();
    assert_eq!(m.paragraphs[2].figure.as_ref().unwrap().caption.as_deref(), Some("p3"), "seule dans son paragraphe malgré la marque et le commentaire");

    // Taille et texte de remplacement.
    let r = apply(&mut d, &op(json!({"op": "resize_image", "paragraph": "p2", "index": 0, "width": 192})), true, &thierry).unwrap();
    assert_eq!(r["width"], 192);
    apply(&mut d, &op(json!({"op": "set_image_alt", "paragraph": "p2", "index": 0, "alt": "Carte"})), true, &thierry).unwrap();
    let mut d = reopen(&d);
    let seg = d.model().unwrap().paragraphs[2].segments.iter().find(|s| s.media.is_some()).unwrap().clone();
    assert_eq!((seg.width, seg.alt.as_deref()), (Some(192), Some("Carte")));

    // Déplacement en suivi : un seul geste, le commentaire n'existe qu'une fois.
    let r = mv(&mut d, "p2", "p0", false, true);
    assert_eq!((r["moved"].clone(), r["paragraph"].clone()), (json!(true), json!("p0")));
    let mut d = reopen(&d);
    assert_eq!(problems(&mut d).unwrap(), before, "rien que Word refuserait");
    assert_eq!(texts(&mut d)[..2], ["▣", "Figure 1. Albédo par zone."]);
    let xml = d.document_xml().to_string();
    assert_eq!(xml.matches("<w:commentReference w:id=\"1\"/>").count(), 1, "{xml}");
    assert_eq!(xml.matches("<w:commentRangeStart w:id=\"1\"/>").count(), 1);
    assert_eq!(xml.matches("<w:commentRangeEnd w:id=\"1\"/>").count(), 1);
    let lead = changes(&mut d).iter().find_map(|c| c.group).unwrap();
    assert!(changes(&mut d).iter().all(|c| c.group == Some(lead)));
    // Accepté : la figure et sa légende en tête, plus rien à l'ancienne place.
    apply(&mut d, &op(json!({"op": "accept", "id": lead})), true, &thierry).unwrap();
    let mut d = reopen(&d);
    assert_eq!(texts(&mut d), ["▣", "Figure 1. Albédo par zone.", "Un.", "Deux.", "Trois."]);
    assert!(changes(&mut d).is_empty());
    assert_eq!(problems(&mut d).unwrap(), before);
}
