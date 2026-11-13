mod common;

use atelier_docx::ops::{Op, apply};
use atelier_docx::{Docx, history::Origin, marks};
use common::*;
use serde_json::json;

fn op(v: serde_json::Value) -> Op {
    serde_json::from_value(v).unwrap()
}

#[test]
fn les_suivis_signes_claude_passent_au_nom_de_l_utilisateur_et_restent_reconnus() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("Chapitre corrigé.docx");
    // Un fichier retouché par l'agent avant la signature au nom de l'utilisateur.
    let mut d = open("christophe");
    let reviewers: Vec<(String, usize)> = d.model().unwrap().changes.iter().map(|c| (c.author.clone(), c.id as usize)).collect();
    apply(&mut d, &op(json!({"op": "replace", "find": "compromis", "with": "équilibre"})), true, &sig("Claude")).unwrap();
    apply(&mut d, &op(json!({"op": "comment", "paragraph": "p2", "find": "équilibre", "text": "Mot plus juste."})), true, &sig("Claude")).unwrap();
    std::fs::write(&path, d.to_bytes().unwrap()).unwrap();
    let before = Docx::open(&path).unwrap().model().unwrap();
    let by_claude = before.changes.iter().filter(|c| c.author == "Claude").count();
    assert!(by_claude >= 2);

    // Un nom d'agent ne remplace pas un autre nom d'agent.
    let mut probe = Docx::open(&path).unwrap();
    assert!(marks::adopt(&mut probe, "Claude").is_err(), "un nom d'agent n'est pas celui de l'utilisateur");

    let origin = Origin { source: "atelier", author: "Thierry", label: "signature" };
    let (stamps, _) = atelier_docx::edit_file_as(&path, None, &origin, |d| marks::adopt(d, "Thierry")).unwrap();
    assert!(!stamps.is_empty() && stamps.iter().all(|s| s.agent == "Claude" && s.author == "Thierry"));
    marks::remember(&path, &stamps).unwrap();

    let after = Docx::open(&path).unwrap().model().unwrap();
    assert!(!after.changes.iter().any(|c| c.author == "Claude"), "Word ne montre plus Claude");
    assert_eq!(after.changes.iter().filter(|c| c.author == "Thierry").count(), by_claude);
    // Les suivis du relecteur n'ont pas bougé.
    for (who, id) in reviewers {
        assert_eq!(after.changes.iter().find(|c| c.id as usize == id).map(|c| c.author.as_str()), Some(who.as_str()));
    }
    // Son commentaire aussi passe au nom de l'utilisateur (Thierry, 2026-11-13).
    assert!(after.comments.iter().any(|c| c.author == "Thierry" && c.initials == "T" && c.text == "Mot plus juste."));
    assert!(!after.comments.iter().any(|c| marks::is_agent(&c.author)));
    // Atelier sait encore qu'ils viennent de Claude.
    let m = marks::list(&path, &after).unwrap();
    assert_eq!(m.len(), by_claude);
    assert!(m.values().all(|a| a == "Claude"));
    // Rejouer ne change plus rien.
    let (again, _) = atelier_docx::edit_file_as(&path, None, &origin, |d| marks::adopt(d, "Thierry")).unwrap();
    assert!(again.is_empty());
}

#[test]
fn la_reparation_rouvre_les_fils_repondus_et_envoie_les_brouillons() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("revCK.docx");
    let mut d = open("christophe");
    apply(&mut d, &op(json!({"op": "replace", "find": "compromis", "with": "équilibre"})), true, &sig("Claude")).unwrap();
    apply(&mut d, &op(json!({"op": "comment", "paragraph": "p2", "find": "pureté", "text": "Source ?"})), true, &sig("Christophe Kinnard")).unwrap();
    let tops: Vec<u32> = d.model().unwrap().comments.iter().filter(|c| c.parent.is_none()).map(|c| c.id).collect();
    assert!(tops.len() >= 2);
    // Une réponse sous un fil ensuite résolu, et un brouillon resté dans la carte.
    apply(&mut d, &op(json!({"op": "reply", "parent": tops[0], "text": "Je l'ajoute."})), true, &sig("Thierry Laurent")).unwrap();
    apply(&mut d, &op(json!({"op": "resolve", "id": tops[0], "done": true})), true, &sig("Thierry Laurent")).unwrap();
    std::fs::write(&path, d.to_bytes().unwrap()).unwrap();
    atelier_docx::drafts::put(&path, tops[1], "Précisé dans la légende.", "Claude").unwrap();

    let before = Docx::open(&path).unwrap().model().unwrap();
    let mine = |m: &atelier_docx::DocModel| m.comments.iter().filter(|c| c.author == "Thierry Laurent").count();
    assert_eq!(mine(&before), 1);

    let pending = atelier_docx::drafts::list(&path).unwrap();
    let origin = Origin { source: "atelier", author: "Thierry Laurent", label: "réparation" };
    let (r, _) = atelier_docx::edit_file_as(&path, None, &origin, |d| marks::repair(d, "Thierry Laurent", &pending, true)).unwrap();
    marks::remember(&path, &r.stamps).unwrap();
    for id in &r.replied {
        atelier_docx::drafts::clear(&path, *id).unwrap();
    }
    assert_eq!(r.replied, vec![tops[1]]);

    let after = Docx::open(&path).unwrap().model().unwrap();
    assert!(!after.changes.iter().any(|c| c.author == "Claude"));
    assert_eq!(mine(&after), 2);
    let sent = after.comments.iter().find(|c| c.text == "Précisé dans la légende.").unwrap();
    assert_eq!((sent.author.as_str(), sent.parent), ("Thierry Laurent", Some(tops[1])));
    // Les deux fils où Thierry répond sont ouverts : Word les montre.
    for id in [tops[0], tops[1]] {
        assert!(!after.comments.iter().find(|c| c.id == id).unwrap().done, "fil {id}");
    }
    assert!(atelier_docx::drafts::list(&path).unwrap().is_empty());
}

/// Commentaire de l'agent dans un fichier qui tient la liste des personnes
/// de Word (people.xml) : auteur, initiales et entrée de la liste passent au
/// nom de l'utilisateur ; les commentaires des autres ne bougent pas.
#[test]
fn les_commentaires_signes_claude_passent_au_nom_de_l_utilisateur() {
    use std::io::{Cursor, Read, Write};
    let src = build("christophe");
    let mut zin = zip::ZipArchive::new(Cursor::new(src)).unwrap();
    let mut out = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for i in 0..zin.len() {
        let mut f = zin.by_index(i).unwrap();
        let name = f.name().to_string();
        let mut bytes = Vec::new();
        f.read_to_end(&mut bytes).unwrap();
        out.start_file(name, zip::write::SimpleFileOptions::default()).unwrap();
        out.write_all(&bytes).unwrap();
    }
    out.start_file("word/people.xml", zip::write::SimpleFileOptions::default()).unwrap();
    out.write_all(br#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w15:people xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"><w15:person w15:author="Claude"><w15:presenceInfo w15:providerId="AD" w15:userId="claude"/></w15:person></w15:people>"#).unwrap();
    let mut d = Docx::from_bytes(out.finish().unwrap().into_inner()).unwrap();
    apply(&mut d, &op(json!({"op": "comment", "paragraph": "p2", "find": "pureté", "text": "Copie soignée. 10/10."})), true, &sig("Claude")).unwrap();
    let top = d.model().unwrap().comments.iter().find(|c| c.text == "Copie soignée. 10/10.").unwrap().id;
    apply(&mut d, &op(json!({"op": "reply", "parent": 1, "text": "D'accord."})), true, &sig("Claude")).unwrap();
    let others: Vec<(u32, String)> = d.model().unwrap().comments.iter().filter(|c| !marks::is_agent(&c.author)).map(|c| (c.id, c.author.clone())).collect();

    assert_eq!(marks::adopt_comments(&mut d, "Thierry Laurent").unwrap(), 2);
    let m = d.model().unwrap();
    let mine = m.comments.iter().find(|c| c.id == top).unwrap();
    assert_eq!((mine.author.as_str(), mine.initials.as_str()), ("Thierry Laurent", "TL"));
    assert!(m.comments.iter().any(|c| c.author == "Thierry Laurent" && c.parent == Some(1) && c.text == "D'accord."));
    for (id, who) in others {
        assert_eq!(m.comments.iter().find(|c| c.id == id).unwrap().author, who);
    }
    let people = d.part("word/people.xml").unwrap().unwrap();
    assert!(people.contains(r#"w15:author="Thierry Laurent""#) && people.contains(r#"w15:userId="Thierry Laurent""#) && !people.contains("Claude"), "{people}");
    // Le fichier reste lisible et rejouer ne change plus rien.
    let mut again = Docx::from_bytes(d.to_bytes().unwrap()).unwrap();
    assert_eq!(marks::adopt_comments(&mut again, "Thierry Laurent").unwrap(), 0);
    assert!(marks::adopt_comments(&mut again, "Codex").is_err());
}
