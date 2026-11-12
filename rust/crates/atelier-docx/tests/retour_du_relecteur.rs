//! Retour d'un relecteur (.docx issu du .tex) posé sur le LaTeX.

mod common;

use atelier_docx::feedback::{self, Fit};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const MAIN: &str = "\\documentclass{article}\n\\begin{document}\n\\section{Methods}\n\\input{sections/methods}\n\
\\begin{figure}\n\\includegraphics{fig1}\n\\caption{Observed and modelled albedo.}\n\\end{figure}\n\\end{document}\n";

const METHODS: &str = "Values below 0.05 or above 0.99 are removed.\n\
Following \\citet{stroeve2006}, we remove images with a solar zenith angle greater than $70^\\circ$.\n\n\
Summer albedo is the mean over June to August, by elevation zone.\n\n\
The model is $x = a + b$ fitted to all zones.\n";

fn import() -> feedback::Feedback {
    let files: HashMap<PathBuf, String> = [("/p/main.tex", MAIN), ("/p/sections/methods.tex", METHODS)]
        .into_iter()
        .map(|(p, t)| (PathBuf::from(p), t.to_string()))
        .collect();
    let tex = feedback::read_tex(Path::new("/p/main.tex"), &move |p: &Path| files.get(p).cloned());
    let mut docx = common::open("retour");
    feedback::import(&mut docx, &tex).unwrap()
}

fn find(f: &feedback::Feedback, id: u32) -> &feedback::Imported {
    f.comments.iter().find(|c| c.id == id).unwrap()
}

#[test]
fn every_comment_gets_a_place() {
    let f = import();
    assert_eq!(f.reviewer, "Christophe Kinnard");
    assert_eq!(f.counts.received, 6);
    assert_eq!(f.comments.len(), 5);
    assert_eq!(f.counts.placed, 6);
    assert_eq!(f.counts.replies, 1);
    assert_eq!(f.counts.exact + f.counts.changed + f.counts.paragraph + f.counts.near, 5);
    assert_eq!(f.files.len(), 2);
}

#[test]
fn untouched_passage_is_exact() {
    let f = import();
    let c = find(&f, 1);
    assert_eq!(c.place.fit, Fit::Exact);
    assert_eq!(c.place.text, "solar zenith angle");
    assert_eq!(f.files[c.place.file], PathBuf::from("/p/sections/methods.tex"));
    // ligne 2 du chapitre, colonne de « solar »
    assert_eq!(c.place.from.0, 1);
    assert_eq!(&METHODS.lines().nth(1).unwrap()[c.place.from.1..c.place.to.1], "solar zenith angle");
    assert_eq!(c.kind, "question");
    assert_eq!(c.on, "text");
    assert_eq!(c.replies.len(), 1);
    assert_eq!(c.replies[0].author, "Thierry");
}

#[test]
fn passage_edited_since_sending_is_changed() {
    let f = import();
    let c = find(&f, 3);
    assert_eq!(c.place.fit, Fit::Changed);
    assert_eq!(c.place.text, "Summer albedo is");
    assert_eq!(c.quote, "Summer albedo is averaged");
}

#[test]
fn equation_and_inserted_text_fall_back_to_their_sentence() {
    let f = import();
    let eq = find(&f, 4);
    assert_eq!(eq.on, "equation");
    assert_eq!(eq.place.fit, Fit::Paragraph);
    assert_eq!(eq.place.text, "The model is $x = a + b$ fitted to all zones.");
    let ins = find(&f, 5);
    assert_eq!(ins.on, "inserted");
    assert_eq!(ins.quote.trim(), "with care");
    assert_eq!(ins.place.fit, Fit::Paragraph);
    assert_eq!(ins.place.text, eq.place.text);
}

#[test]
fn figure_comment_goes_to_its_caption() {
    let f = import();
    let c = find(&f, 6);
    assert_eq!(c.on, "figure");
    assert_eq!(c.place.fit, Fit::Near);
    assert_eq!(c.place.text, "\\caption{Observed and modelled albedo.}");
    assert_eq!(f.files[c.place.file], PathBuf::from("/p/main.tex"));
}
