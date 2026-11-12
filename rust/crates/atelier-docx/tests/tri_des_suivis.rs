//! Tri des suivis par nature et décision groupée (« Accepter les mineurs »),
//! sur un document synthétique (fixture `tri`, anglais et français).

mod common;

use atelier_docx::review::{self, Decision};
use atelier_docx::triage::{self, Triage};
use common::{build, entries, open, reopen};
use std::path::Path;

fn group<'a>(t: &'a Triage, key: &str) -> &'a triage::Group {
    t.groups.iter().find(|g| g.key == key).unwrap()
}

fn ids_of(t: &Triage, key: &str) -> Vec<u32> {
    let mut v: Vec<u32> = group(t, key).items.iter().flat_map(|i| i.ids.clone()).collect();
    v.sort_unstable();
    v
}

#[test]
fn les_suivis_sont_ranges_par_nature() {
    let mut d = open("tri");
    let t = triage::triage(&d.model().unwrap());
    assert_eq!(t.total, 30);
    assert_eq!(t.groups.iter().map(|g| g.key).collect::<Vec<_>>(), ["fond", "nombres", "ponctuation", "espaces"]);
    assert_eq!(t.groups.iter().map(|g| g.minor).collect::<Vec<_>>(), [false, false, true, true]);
    assert_eq!(ids_of(&t, "fond"), [1, 2, 5, 6, 11, 12, 13, 14, 27, 28, 30]);
    assert_eq!(ids_of(&t, "nombres"), [7, 8, 17, 18, 22, 23]);
    assert_eq!(ids_of(&t, "ponctuation"), [3, 4, 9, 15, 16, 20, 21, 24, 25, 26]);
    assert_eq!(ids_of(&t, "espaces"), [10, 19, 29]);

    // Un remplacement est une seule fiche, avant → après, élargie au mot.
    let fond = group(&t, "fond");
    let smoke = fond.items.iter().find(|i| i.ids == [5, 6]).unwrap();
    assert_eq!((smoke.kind, smoke.before.as_str(), smoke.after.as_str()), ("remplacement", "smoke from wildfires deposited", "wildfire smoke deposited"));
    assert_eq!(smoke.author, "Christophe");
    assert_eq!(smoke.paragraph.as_deref(), Some("p1"));
    let ponct = group(&t, "ponctuation");
    let s = ponct.items.iter().find(|i| i.ids == [3]).unwrap();
    assert_eq!((s.kind, s.before.as_str(), s.after.as_str()), ("suppression", "declines", "decline"));
    let role = ponct.items.iter().find(|i| i.ids == [25, 26]).unwrap();
    assert_eq!((role.before.as_str(), role.after.as_str()), ("role", "rôle"));
    // Fiches dans l'ordre du texte.
    assert_eq!(fond.items.iter().map(|i| i.ids[0]).collect::<Vec<_>>(), [1, 5, 11, 12, 13, 27, 30]);
    let esp = group(&t, "espaces");
    assert_eq!(esp.items.iter().map(|i| i.kind).collect::<Vec<_>>(), ["suppression", "mise en forme", "paragraphe"]);
    // L'autre relecteur garde son nom.
    assert_eq!(fond.items.last().unwrap().author, "Marie Dupont");
}

#[test]
fn accepter_les_mineurs_ne_touche_ni_au_fond_ni_aux_nombres() {
    let mut d = open("tri");
    let t = triage::triage(&d.model().unwrap());
    let minors: Vec<u32> = t.groups.iter().filter(|g| g.minor).flat_map(|g| g.items.iter().flat_map(|i| i.ids.clone())).collect();
    let batch = review::decide_set(&mut d, &minors, Decision::Accept).unwrap();
    assert_eq!(batch.done, minors.len());
    assert!(batch.skipped.is_empty());
    let mut d = reopen(&d);
    let m = d.model().unwrap();
    let mut left: Vec<u32> = m.changes.iter().map(|c| c.id).collect();
    left.sort_unstable();
    assert_eq!(left, [1, 2, 5, 6, 7, 8, 11, 12, 13, 14, 17, 18, 22, 23, 27, 28, 30]);
    let p1 = &m.paragraphs[1].text;
    assert!(p1.contains("largest decline in the Coast Range, where"), "{p1}");
    assert!(p1.contains("uniform: glaciers above 2400 m"), "{p1}");
    let p2 = &m.paragraphs[2].text;
    assert!(p2.contains("Williamson et al. (2020); it also"), "{p2}");
    let p3 = &m.paragraphs[3].text;
    assert!(p3.starts_with("L’albédo") && p3.contains("décennie, et le rôle"), "{p3}");
    // Le paragraphe vide inséré est gardé, sans marque ; « MODIS » reste en italique.
    assert_eq!(m.paragraphs.len(), 6);
    assert!(m.paragraphs[4].mark_change.is_none());
    assert!(m.paragraphs[2].segments.iter().any(|s| s.text == "MODIS" && s.i));
    // Le tri suivant ne montre plus de mineurs.
    let t = triage::triage(&m);
    assert!(t.groups.iter().filter(|g| g.minor).all(|g| g.items.is_empty()));
    assert_eq!(t.total, 17);
}

#[test]
fn decider_un_ensemble_ignore_les_doublons_et_les_absents() {
    let mut d = open("tri");
    let batch = review::decide_set(&mut d, &[3, 3, 999, 4], Decision::Reject).unwrap();
    assert_eq!(batch.done, 2);
    assert_eq!(batch.skipped, [999]);
    let p1 = d.model().unwrap().paragraphs[1].text.clone();
    assert!(p1.contains("largest declines in the Coast Range where"), "{p1}");
}

#[test]
fn decider_un_ensemble_est_une_seule_retouche_sur_le_disque() {
    // Historique dans un dossier jetable, jamais dans celui de l'app.
    atelier_docx::history::set_root(std::env::temp_dir().join(format!("atelier-docx-historique-tri-{}", std::process::id())));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("tri.docx");
    std::fs::write(&path, build("tri")).unwrap();
    let before = atelier_docx::revision_of(&std::fs::read(&path).unwrap());
    let (batch, after) = atelier_docx::edit_file(&path, Some(&before), |d| review::decide_set(d, &[10, 19, 29], Decision::Accept)).unwrap();
    assert_eq!(batch.done, 3);
    assert_ne!(before, after);
    // Une version périmée est refusée, rien n'est écrit.
    let e = atelier_docx::edit_file(&path, Some(&before), |d| review::decide_set(d, &[3], Decision::Accept)).err().unwrap();
    assert!(e.is_conflict());
    assert_eq!(atelier_docx::revision_of(&std::fs::read(&path).unwrap()), after);
}

/// Le banc d'essai du panneau (Playwright) ouvre la même fixture, zippée :
/// `ATELIER_ECRIRE_FIXTURES=1 cargo test -p atelier-docx --test tri_des_suivis`
/// la régénère.
#[test]
fn la_fixture_du_panneau_suit_le_dossier() {
    let target = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../gallery/tests/e2e/fixtures/tri.docx");
    let fresh = build("tri");
    if std::env::var("ATELIER_ECRIRE_FIXTURES").is_ok_and(|v| v == "1") {
        std::fs::write(&target, &fresh).unwrap();
    }
    let Ok(on_disk) = std::fs::read(&target) else {
        panic!("{} manque : ATELIER_ECRIRE_FIXTURES=1 pour la créer", target.display());
    };
    assert_eq!(entries(&on_disk), entries(&fresh), "tri.docx du panneau périmé : ATELIER_ECRIRE_FIXTURES=1 pour le régénérer");
}
