//! « Tout accepter / tout refuser » en quelques passes sur le XML : même
//! résultat, à l'octet près, que l'ancien traitement suivi par suivi, sur
//! les documents d'essai et sur des documents retouchés au hasard ; et
//! `decide_set` (un lot de suivis choisis) comme `decide` un par un.

mod common;

use atelier_docx::Docx;
use atelier_docx::ops::{Op, apply};
use atelier_docx::review::{Decision, decide, decide_all, decide_all_one_by_one, decide_set};
use common::*;
use serde_json::json;

struct Rng(u64);

impl Rng {
    fn below(&mut self, n: usize) -> usize {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        if n == 0 { 0 } else { (x % n as u64) as usize }
    }
}

const AUTHORS: [&str; 3] = ["Thierry", "Christophe", "Claude"];

/// Un document aux suivis emmêlés : frappe, effacements, Entrée et retour
/// arrière en suivi par plusieurs auteurs (suivis imbriqués, marques de
/// paragraphe à la suite).
fn tangled(bytes: Vec<u8>, seed: u64, steps: usize) -> Docx {
    let mut rng = Rng(seed);
    let mut d = Docx::from_bytes(bytes).unwrap();
    for _ in 0..steps {
        let m = d.model().unwrap();
        let paras: Vec<_> = m.paragraphs.iter().filter(|p| !p.id.contains('.')).collect();
        let p = paras[rng.below(paras.len())];
        let n = p.text.chars().count();
        let (x, y) = (rng.below(n + 1), rng.below(n + 1));
        let (a, b) = (x.min(y), x.max(y));
        let v = match rng.below(6) {
            0 | 1 => json!({"op": "insert", "paragraph": p.id, "at": a, "with": "glace "}),
            2 => json!({"op": "replace_range", "paragraph": p.id, "start": a, "end": b, "with": ""}),
            3 => json!({"op": "replace_range", "paragraph": p.id, "start": a, "end": b, "with": "névé"}),
            4 => json!({"op": "split", "paragraph": p.id, "at": a}),
            _ => json!({"op": "join", "paragraph": p.id}),
        };
        let op: Op = serde_json::from_value(v).unwrap();
        let before = d.clone();
        let author = AUTHORS[rng.below(3)];
        if apply(&mut d, &op, true, &sig(author)).is_err() {
            d = before;
        } else {
            d = reopen(&d);
        }
    }
    d
}

fn docs() -> Vec<(String, Docx)> {
    let mut out = vec![
        ("christophe".to_string(), open("christophe")),
        ("libreoffice".to_string(), Docx::from_bytes(std::fs::read(fixture_dir("christophe-libreoffice.docx")).unwrap()).unwrap()),
        ("retouches".to_string(), open("retouches")),
        ("retour".to_string(), open("retour")),
    ];
    for seed in 1..=3u64 {
        out.push((format!("emmêlé {seed}"), tangled(build("christophe"), seed.wrapping_mul(0x9E37_79B9_7F4A_7C15), 120)));
    }
    out
}

#[test]
fn tout_accepter_ou_refuser_donne_le_meme_paquet_qu_un_par_un() {
    for (name, d) in docs() {
        for decision in [Decision::Accept, Decision::Reject] {
            for author in [None, Some("Christophe"), Some("Thierry"), Some("Claude")] {
                let (mut a, mut b) = (d.clone(), d.clone());
                let ba = decide_all(&mut a, decision, author).unwrap();
                let bb = decide_all_one_by_one(&mut b, decision, author).unwrap();
                assert_eq!((ba.done, &ba.skipped), (bb.done, &bb.skipped), "{name} {decision:?} {author:?} : bilan");
                assert!(entries(&a.to_bytes().unwrap()) == entries(&b.to_bytes().unwrap()), "{name} {decision:?} {author:?} : paquets différents");
            }
        }
    }
}

#[test]
fn un_lot_de_suivis_comme_un_par_un() {
    for (name, d) in docs() {
        let mut m = d.clone();
        let ids: Vec<u32> = m.model().unwrap().changes.iter().map(|c| c.id).step_by(2).collect();
        if ids.is_empty() {
            continue;
        }
        for decision in [Decision::Accept, Decision::Reject] {
            let mut a = d.clone();
            let batch = decide_set(&mut a, &ids, decision).unwrap();
            let mut b = d.clone();
            let mut done = 0;
            for id in &ids {
                if decide(&mut b, *id, decision).is_ok() {
                    done += 1;
                }
            }
            assert!(batch.done >= done.min(1), "{name} {decision:?} : rien traité");
            let left = |x: &mut Docx| x.model().unwrap().changes.iter().map(|c| c.id).filter(|id| ids.contains(id)).count();
            assert_eq!(left(&mut a), left(&mut b), "{name} {decision:?} : suivis restants");
            let text = |x: &mut Docx| x.model().unwrap().paragraphs.iter().map(|p| p.text.clone()).collect::<Vec<_>>();
            assert_eq!(text(&mut a), text(&mut b), "{name} {decision:?} : texte");
            reopen(&a).model().unwrap();
        }
    }
}

#[test]
fn un_lot_rend_les_identifiants_introuvables() {
    let mut d = open("christophe");
    let batch = decide_set(&mut d, &[101, 999_999], Decision::Accept).unwrap();
    assert_eq!(batch.done, 1);
    assert_eq!(batch.skipped, vec![999_999]);
    assert!(!d.model().unwrap().changes.iter().any(|c| c.id == 101));
}
