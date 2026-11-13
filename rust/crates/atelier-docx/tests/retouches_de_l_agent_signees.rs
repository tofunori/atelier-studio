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
    // Le commentaire de l'agent garde son nom.
    assert!(after.comments.iter().any(|c| c.author == "Claude" && c.text == "Mot plus juste."));
    // Atelier sait encore qu'ils viennent de Claude.
    let m = marks::list(&path, &after).unwrap();
    assert_eq!(m.len(), by_claude);
    assert!(m.values().all(|a| a == "Claude"));
    // Rejouer ne change plus rien.
    let (again, _) = atelier_docx::edit_file_as(&path, None, &origin, |d| marks::adopt(d, "Thierry")).unwrap();
    assert!(again.is_empty());
}
