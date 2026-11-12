//! Ses modifications suivies (lot 2 de la révision avec le relecteur), posées
//! sur le .tex phrase par phrase : prêtes à accepter, déjà faites, changées
//! depuis, ou consignes en français. Fixture synthétique `retouches`.

mod common;

use atelier_docx::feedback::{self, Edit, Fit};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const MAIN: &str =
    "\\documentclass{article}\n\\begin{document}\n\\input{sections/results}\n\\end{document}\n";

const RESULTS: &str = "Glaciers darken in summer \\citep{Ren_2021}.\n\
Values below 0.05 are removed.\n\
The darkening is 0.003 in 2018 (Fig.~\\ref{fig:map}b).\n\n\
This sentence goes away.\n\
Summer albedo is the mean over June to August.\n\n\
The model is fitted to all zones.\n\n\
Snow covers the ice in June.\n\n\
Melt begins in May.\n";

fn edits() -> Vec<Edit> {
    let files: HashMap<PathBuf, String> =
        [("/p/main.tex", MAIN), ("/p/sections/results.tex", RESULTS)]
            .into_iter()
            .map(|(p, t)| (PathBuf::from(p), t.to_string()))
            .collect();
    let tex = feedback::read_tex(Path::new("/p/main.tex"), &move |p: &Path| {
        files.get(p).cloned()
    });
    let mut docx = common::open("retouches");
    feedback::import(&mut docx, &tex).unwrap().edits
}

fn by_after<'a>(edits: &'a [Edit], start: &str) -> &'a Edit {
    edits
        .iter()
        .find(|e| e.after.starts_with(start))
        .unwrap_or_else(|| panic!("aucune retouche « {start} » dans {edits:#?}"))
}

/// Le .tex une fois la retouche acceptée.
fn accepted(e: &Edit) -> String {
    let mut text = RESULTS.to_string();
    text.replace_range(e.place.start..e.place.end, e.latex.as_deref().unwrap());
    text
}

#[test]
fn a_word_swap_is_ready_to_accept() {
    let all = edits();
    let e = by_after(&all, "Values below 0.05 are discarded");
    assert_eq!(e.status, "apply");
    assert_eq!(e.author, "Christophe Kinnard");
    assert_eq!(e.place.text, "Values below 0.05 are removed.");
    assert_eq!(e.latex.as_deref(), Some("Values below 0.05 are discarded."));
    assert_eq!(
        e.diff,
        vec![("", "Values below 0.05 are ".to_string()), ("-", "removed.".to_string()), ("+", "discarded.".to_string())]
    );
}

#[test]
fn figure_numbers_stay_references() {
    let all = edits();
    let e = by_after(&all, "The darkening was");
    assert_eq!(e.status, "apply");
    assert_eq!(
        e.latex.as_deref(),
        Some("The darkening was 0.003 in 2018 (Fig.~\\ref{fig:map}b).")
    );
}

#[test]
fn a_removed_sentence_goes_with_its_line_break() {
    let all = edits();
    let e = all
        .iter()
        .find(|e| e.before == "This sentence goes away.")
        .unwrap();
    assert_eq!(e.status, "apply");
    assert_eq!(e.latex.as_deref(), Some(""));
    assert!(
        accepted(e).contains("\n\nSummer albedo is the mean"),
        "{}",
        accepted(e)
    );
}

#[test]
fn a_plain_text_citation_becomes_a_cite() {
    let all = edits();
    let e = by_after(&all, "Summer albedo is the mean over June to August (Ren");
    assert_eq!(e.status, "apply");
    assert_eq!(
        e.latex.as_deref(),
        Some("Summer albedo is the mean over June to August \\citep{Ren_2021}.")
    );
}

#[test]
fn french_instructions_become_a_note() {
    let all = edits();
    let e = by_after(&all, "Ici expliquer");
    assert_eq!(e.status, "note");
    assert!(e.latex.is_none());
}

#[test]
fn added_sentences_come_together_after_their_neighbour() {
    let all = edits();
    let e = by_after(&all, "It converges");
    assert_eq!(e.status, "apply");
    assert_eq!(e.place.text, "\n\n");
    assert!(
        e.after.contains("A second new sentence follows."),
        "{}",
        e.after
    );
    assert!(
        accepted(e).contains(
            "The model is fitted to all zones.\nIt converges in all cases \\citep{Ren_2021}.\nA second new sentence follows.\n\nSnow"
        ),
        "{}",
        accepted(e)
    );
}

#[test]
fn text_changed_since_is_left_to_merge() {
    let all = edits();
    let e = by_after(&all, "Snow covers ice in early July");
    assert_eq!(e.status, "changed");
    assert!(e.latex.is_none());
    assert_eq!(e.place.text, "Snow covers the ice in June.");
    assert_eq!(e.place.fit, Fit::Changed);
}

#[test]
fn already_done_is_recognised() {
    let all = edits();
    let e = by_after(&all, "Melt begins in May");
    assert_eq!(e.status, "done");
    assert_eq!(e.place.text, "Melt begins in May.");
}

#[test]
fn numbered_in_document_order() {
    let all = edits();
    let n: Vec<usize> = all.iter().map(|e| e.n).collect();
    assert_eq!(n, (1..=all.len()).collect::<Vec<_>>());
    assert_eq!(all.len(), 8, "{all:#?}");
}
