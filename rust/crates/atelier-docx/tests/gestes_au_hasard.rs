//! 1 200 gestes au hasard (frappe, effacement, Entrée, retour arrière,
//! commentaires, mise en forme, accepter / refuser) par trois auteurs, en
//! suivi ou non, sur chaque document d'essai. Après chaque geste réussi le
//! paquet doit se rouvrir, se lire, et ne porter aucun défaut que le
//! document d'origine n'avait pas ; un geste refusé ne doit rien changer.

mod common;

use atelier_docx::ops::{Op, apply};
use atelier_docx::{Docx, check};
use common::*;
use serde_json::{Value, json};

/// Générateur pseudo-aléatoire minimal (xorshift), reproductible.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn below(&mut self, n: usize) -> usize {
        if n == 0 { 0 } else { (self.next() % n as u64) as usize }
    }
    fn pick<'a, T>(&mut self, v: &'a [T]) -> &'a T {
        &v[self.below(v.len())]
    }
}

const AUTHORS: [&str; 3] = ["Thierry", "Christophe", "Claude"];
const BITS: [&str; 10] = ["a", "é", "glace ", "Albédo", " ", "\t", ",", "0,04", "œ", "x"];

fn gesture(rng: &mut Rng, d: &mut Docx) -> Option<Value> {
    let m = d.model().ok()?;
    let paras: Vec<_> = m.paragraphs.iter().filter(|p| !p.id.contains('.')).collect();
    let p = *rng.pick(&paras);
    let n = p.text.chars().count();
    let (a, b) = {
        let x = rng.below(n + 1);
        let y = rng.below(n + 1);
        (x.min(y), x.max(y))
    };
    let mut text = String::new();
    for _ in 0..=rng.below(3) {
        text.push_str(rng.pick(&BITS));
    }
    let change = (!m.changes.is_empty()).then(|| m.changes[rng.below(m.changes.len())].id);
    let comment = (!m.comments.is_empty()).then(|| m.comments[rng.below(m.comments.len())].id);
    Some(match rng.below(14) {
        0..=3 => json!({"op": "insert", "paragraph": p.id, "at": a, "with": text}),
        4..=5 => json!({"op": "replace_range", "paragraph": p.id, "start": a, "end": b, "with": if rng.below(2) == 0 { String::new() } else { text }}),
        6 => json!({"op": "split", "paragraph": p.id, "at": a}),
        7 => json!({"op": "join", "paragraph": p.id}),
        8 => json!({"op": "comment_range", "paragraph": p.id, "start": a, "end": b.max(a + 1).min(n), "text": "Note."}),
        9 => match comment {
            Some(c) => match rng.below(3) {
                0 => json!({"op": "reply", "parent": c, "text": "D'accord."}),
                1 => json!({"op": "resolve", "id": c, "done": true}),
                _ => json!({"op": "delete_comment", "id": c}),
            },
            None => return None,
        },
        10 => json!({"op": "format_range", "paragraph": p.id, "start": a, "end": b, "props": {"b": rng.below(2) == 0, "i": true}}),
        11..=12 => match change {
            Some(c) => json!({"op": if rng.below(2) == 0 { "accept" } else { "reject" }, "id": c}),
            None => return None,
        },
        _ => json!({"op": if rng.below(2) == 0 { "accept_all" } else { "reject_all" }, "author": rng.pick(&AUTHORS)}),
    })
}

fn run(name: &str, bytes: Vec<u8>, seed: u64, steps: usize) {
    let mut rng = Rng(seed);
    let mut d = Docx::from_bytes(bytes).unwrap();
    let base = check::problems(&mut d).unwrap();
    let (mut ok, mut refused) = (0, 0);
    for step in 0..steps {
        let Some(v) = gesture(&mut rng, &mut d) else { continue };
        let author = *rng.pick(&AUTHORS);
        let tracked = rng.below(4) != 0;
        let op: Op = serde_json::from_value(v.clone()).unwrap();
        let before = d.clone();
        match apply(&mut d, &op, tracked, &sig(author)) {
            Ok(_) => {
                ok += 1;
                let bytes = d.to_bytes().unwrap_or_else(|e| panic!("{name} pas {step} {v} : paquet illisible : {e}"));
                let mut again = Docx::from_bytes(bytes).unwrap_or_else(|e| panic!("{name} pas {step} {v} : réouverture : {e}"));
                again.model().unwrap_or_else(|e| panic!("{name} pas {step} {v} ({author}, suivi {tracked}) : lecture : {e}"));
                let now = check::problems(&mut again).unwrap();
                for (k, n) in &now {
                    let was = base.get(k).copied().unwrap_or(0);
                    assert!(*n <= was, "{name} pas {step} : {v} ({author}, suivi {tracked}) a ajouté « {k} » ({was} → {n})");
                }
                d = again;
            }
            Err(_) => {
                refused += 1;
                // Un geste refusé est jeté en entier (c'est ce que fait edit_file).
                d = before;
            }
        }
    }
    assert!(ok > steps / 4, "{name} : trop peu de gestes acceptés ({ok} sur {steps}, {refused} refusés)");
}

#[test]
fn quatre_cents_gestes_sur_le_document_de_christophe() {
    run("christophe", build("christophe"), 0x9E37_79B9_7F4A_7C15, 400);
}

#[test]
fn quatre_cents_gestes_sur_le_dialecte_libreoffice() {
    let bytes = std::fs::read(fixture_dir("christophe-libreoffice.docx")).unwrap();
    run("libreoffice", bytes, 0xD1B5_4A32_D192_ED03, 400);
}

#[test]
fn quatre_cents_gestes_sur_un_article_neuf() {
    let bytes = atelier_docx::new::create(atelier_docx::new::Template::Article).unwrap();
    run("article", bytes, 0x2545_F491_4F6C_DD1D, 400);
}

/// Exploration plus longue, à la main :
/// `GESTES=20000 cargo test -p atelier-docx --test gestes_au_hasard -- --ignored`
#[test]
#[ignore = "exploration longue, lancée à la main"]
fn exploration_longue() {
    let n: usize = std::env::var("GESTES").ok().and_then(|v| v.parse().ok()).unwrap_or(5000);
    for seed in 1..=8u64 {
        let seed = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15);
        run("christophe", build("christophe"), seed, n / 8);
        run("libreoffice", std::fs::read(fixture_dir("christophe-libreoffice.docx")).unwrap(), seed ^ 1, n / 8);
    }
}
