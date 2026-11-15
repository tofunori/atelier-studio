//! Correction d'une équation en suivi, notée comme Word la note : à
//! l'intérieur de l'équation, seul ce qui change est barré ou ajouté.
//!
//! Word écrit un symbole effacé ou ajouté dans un `w:del` / `w:ins` autour
//! du `m:r` qui le porte (le texte reste en `m:t`), et une structure entière
//! (fraction, indice…) effacée ou ajoutée par une marque dans ses
//! propriétés, `m:fPr/m:ctrlPr/w:del`, ses symboles étant aussi marqués.
//! On compare l'équation du document et celle écrite en LaTeX symbole par
//! symbole (les structures se comparent par leur LaTeX) ; deux structures
//! de même forme qui diffèrent se comparent argument par argument, si bien
//! que `y_{rzt}` → `\alpha_{rzt}` ne barre que le `y`. Ce qui ne change pas
//! garde son XML d'origine (police, mise en forme de Word).

use crate::math::{STRUCTS, child, elem_key, is_m, val};
use crate::xml::{M, escape_attr, escape_text};
use roxmltree::Node;

/// Arguments d'une structure : leur contenu se compare récursivement.
const ARGS: &[&str] = &["e", "sub", "sup", "num", "den", "deg", "lim", "fName"];

/// Au-delà (atomes avant × après), la comparaison est abandonnée : on
/// barre l'équation entière et on ajoute la nouvelle.
const MAX_CELLS: usize = 400_000;

/// Les marques posées par une correction : un identifiant par marque.
pub(crate) struct Marks {
    pub author: String,
    pub date: String,
    pub next: u32,
    pub ids: Vec<u32>,
}

impl Marks {
    fn open(&mut self, kind: &str) -> String {
        let id = self.next;
        self.next += 1;
        self.ids.push(id);
        format!(r#"<w:{kind} w:id="{id}" w:author="{}" w:date="{}">"#, escape_attr(&self.author), escape_attr(&self.date))
    }
}

/// Un côté de la comparaison : le document (avant) ou l'équation écrite.
#[derive(Clone, Copy)]
struct Side<'s> {
    src: &'s str,
    /// Propriétés Word des symboles ajoutés (police de l'équation d'origine).
    wrpr: &'s str,
}

#[derive(Clone)]
enum Atom<'a, 'i> {
    Ch { c: char, run: Node<'a, 'i>, style: String },
    El { node: Node<'a, 'i>, key: String },
}

impl PartialEq for Atom<'_, '_> {
    fn eq(&self, o: &Self) -> bool {
        match (self, o) {
            (Atom::Ch { c: a, style: s, .. }, Atom::Ch { c: b, style: t, .. }) => a == b && s == t,
            (Atom::El { key: a, .. }, Atom::El { key: b, .. }) => a == b,
            _ => false,
        }
    }
}

/// Style mathématique d'un symbole : droit, texte ordinaire, écriture.
fn style_of(run: Node) -> String {
    let pr = child(run, "rPr");
    format!("{}|{}|{}", val(pr, "sty").unwrap_or_default(), pr.and_then(|p| child(p, "nor")).is_some(), val(pr, "scr").unwrap_or_default())
}

/// Run fait seulement de propriétés et de texte : comparé symbole par symbole.
fn plain_run(n: Node) -> bool {
    is_m(n, "r") && n.children().filter(|c| c.is_element()).all(|c| is_m(c, "rPr") || is_m(c, "t") || crate::xml::is_w(c, "rPr"))
}

/// Propriétés, marques de fin d'argument, signets : recopiés tels quels.
fn passthrough(n: Node) -> bool {
    let name = n.tag_name().name();
    if n.tag_name().namespace() == Some(M) {
        return name.ends_with("Pr");
    }
    crate::math::rev_name(n).is_none() && !crate::xml::is_w(n, "r")
}

type Atoms<'a, 'i> = (Vec<Atom<'a, 'i>>, Vec<(usize, Node<'a, 'i>)>);

/// Atomes d'un conteneur (équation ou argument) et ce qui se recopie, avec
/// l'atome devant lequel il se trouve. `None` : suivi déjà présent dedans.
fn atoms<'a, 'i>(parent: Node<'a, 'i>) -> Option<Atoms<'a, 'i>> {
    let (mut out, mut kept) = (Vec::new(), Vec::new());
    for c in parent.children().filter(|c| c.is_element()) {
        if crate::math::rev_name(c).is_some() {
            return None;
        }
        if passthrough(c) {
            kept.push((out.len(), c));
        } else if plain_run(c) {
            let style = style_of(c);
            for t in c.children().filter(|t| is_m(*t, "t")) {
                out.extend(t.text().unwrap_or("").chars().map(|ch| Atom::Ch { c: ch, run: c, style: style.clone() }));
            }
        } else {
            out.push(Atom::El { node: c, key: elem_key(c) });
        }
    }
    Some((out, kept))
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Step {
    Keep(usize, usize),
    Del(usize),
    Ins(usize),
}

/// Plus longue sous-suite commune : ce qui reste, ce qui part, ce qui vient
/// (à égalité, les suppressions d'abord, comme Word).
fn align<T: PartialEq>(a: &[T], b: &[T]) -> Option<Vec<Step>> {
    let (n, m) = (a.len(), b.len());
    if (n + 1) * (m + 1) > MAX_CELLS {
        return None;
    }
    let mut t = vec![0u32; (n + 1) * (m + 1)];
    let at = |i: usize, j: usize| i * (m + 1) + j;
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            t[at(i, j)] = if a[i] == b[j] { t[at(i + 1, j + 1)] + 1 } else { t[at(i + 1, j)].max(t[at(i, j + 1)]) };
        }
    }
    let (mut i, mut j, mut out) = (0, 0, Vec::new());
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            out.push(Step::Keep(i, j));
            i += 1;
            j += 1;
        } else if i < n && (j == m || t[at(i + 1, j)] >= t[at(i, j + 1)]) {
            out.push(Step::Del(i));
            i += 1;
        } else {
            out.push(Step::Ins(j));
            j += 1;
        }
    }
    Some(out)
}

/// Valeur d'une propriété qui change le rendu, défaut de Word compris.
fn prop(n: Node, name: &str) -> String {
    let tag = n.tag_name().name();
    let v = val(child(n, &format!("{tag}Pr")), name);
    let on = |v: Option<String>| match v.as_deref() {
        None | Some("0" | "off" | "false") => "0".to_string(),
        Some(_) => "1".to_string(),
    };
    match (tag, name) {
        (_, "degHide" | "subHide" | "supHide") => on(v),
        ("d", "begChr") => v.unwrap_or_else(|| "(".into()),
        ("d", "endChr") => v.unwrap_or_else(|| ")".into()),
        ("d", "sepChr") => v.unwrap_or_else(|| "|".into()),
        ("nary", "chr") => v.unwrap_or_else(|| "∫".into()),
        ("acc", "chr") => v.unwrap_or_else(|| "\u{302}".into()),
        ("groupChr", "chr") => v.unwrap_or_else(|| "⏟".into()),
        (_, "pos") => v.unwrap_or_else(|| "bot".into()),
        ("f", "type") => v.unwrap_or_else(|| "bar".into()),
        _ => v.unwrap_or_default(),
    }
}

fn props_of(tag: &str) -> &'static [&'static str] {
    match tag {
        "d" => &["begChr", "endChr", "sepChr"],
        "nary" => &["chr", "subHide", "supHide"],
        "acc" => &["chr"],
        "groupChr" => &["chr", "pos"],
        "bar" => &["pos"],
        "f" => &["type"],
        "rad" => &["degHide"],
        _ => &[],
    }
}

/// Enfants qui portent du contenu (arguments, lignes de matrice).
fn parts<'a, 'i>(n: Node<'a, 'i>) -> Vec<Node<'a, 'i>> {
    n.children().filter(|c| c.is_element() && c.tag_name().namespace() == Some(M) && !c.tag_name().name().ends_with("Pr")).collect()
}

/// Deux structures de même forme (même genre, mêmes arguments, mêmes
/// délimiteurs) : on les compare argument par argument.
fn same_shape(a: Node, b: Node) -> bool {
    let tag = a.tag_name().name();
    if a.tag_name().namespace() != Some(M) || b.tag_name().name() != tag || !STRUCTS.contains(&tag) {
        return false;
    }
    let (pa, pb) = (parts(a), parts(b));
    pa.len() == pb.len()
        && pa.iter().zip(&pb).all(|(x, y)| x.tag_name().name() == y.tag_name().name() && (ARGS.contains(&x.tag_name().name()) || (is_m(*x, "mr") && parts(*x).len() == parts(*y).len())))
        && props_of(tag).iter().all(|p| prop(a, p) == prop(b, p))
}

/// `w:rPr` d'une marque de structure : celle de l'équation, sinon Cambria Math.
fn ctrl_rpr(side: Side) -> String {
    if side.wrpr.is_empty() { r#"<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>"#.to_string() } else { side.wrpr.to_string() }
}

/// Un élément entier effacé (`del`) ou ajouté (`ins`), noté comme Word :
/// ses symboles dans des enveloppes, ses structures marquées.
fn marked(side: Side, n: Node, kind: &str, marks: &mut Marks) -> String {
    let src = side.src;
    let base = n.range().start;
    let mut edits: Vec<(std::ops::Range<usize>, String)> = Vec::new();
    for d in n.descendants().filter(|d| d.is_element()) {
        if is_m(d, "r") || crate::xml::is_w(d, "r") {
            let mut run = src[d.range()].to_string();
            if kind == "del" && crate::xml::is_w(d, "r") {
                run = run.replace("<w:t>", "<w:delText>").replace("<w:t ", "<w:delText ").replace("</w:t>", "</w:delText>");
            }
            edits.push((d.range().start - base..d.range().end - base, format!("{}{run}</w:{kind}>", marks.open(kind))));
            continue;
        }
        let tag = d.tag_name().name();
        if d.tag_name().namespace() != Some(M) || !STRUCTS.contains(&tag) {
            continue;
        }
        let open = marks.open(kind);
        let mark = format!("<m:ctrlPr>{open}{}</w:{kind}></m:ctrlPr>", ctrl_rpr(side));
        match child(d, &format!("{tag}Pr")) {
            Some(pr) => {
                let r = pr.range();
                let text = &src[r.clone()];
                let new = match child(pr, "ctrlPr") {
                    Some(c) => {
                        // Sa w:rPr (police) passe dans la marque.
                        let inner = crate::xml::inner_range(c).map(|ir| src[ir].to_string()).unwrap_or_default();
                        let rpr = if inner.contains("<w:rPr") { inner } else { ctrl_rpr(side) };
                        let cr = c.range();
                        format!("{}<m:ctrlPr>{open}{rpr}</w:{kind}></m:ctrlPr>{}", &src[r.start..cr.start], &src[cr.end..r.end])
                    }
                    None if text.ends_with("/>") => format!("<m:{tag}Pr>{mark}</m:{tag}Pr>"),
                    None => format!("{}{mark}</m:{tag}Pr>", &text[..text.len() - format!("</m:{tag}Pr>").len()]),
                };
                edits.push((r.start - base..r.end - base, new));
            }
            None => {
                let at = src[d.range()].find('>').map(|k| k + 1).unwrap_or(0) + d.range().start - base;
                edits.push((at..at, format!("<m:{tag}Pr>{mark}</m:{tag}Pr>")));
            }
        }
    }
    crate::xml::splice(&src[n.range()], edits).unwrap_or_else(|_| src[n.range()].to_string())
}

/// Symboles d'un même run, dans le même état, réunis en un `m:r`.
struct Pending<'a, 'i> {
    state: char,
    run: Option<Node<'a, 'i>>,
    new_side: bool,
    text: String,
}

/// Propriétés d'un run : `m:rPr`, puis `w:rPr` (ou celle de l'équation).
fn run_props(src: &str, run: Node, wrpr: &str) -> String {
    let m = child(run, "rPr").map(|p| &src[p.range()]).unwrap_or("");
    let w = run.children().find(|c| crate::xml::is_w(*c, "rPr")).map(|p| &src[p.range()]).unwrap_or(wrpr);
    format!("{m}{w}")
}

struct Emit<'s, 'm, 'a, 'i> {
    old: Side<'s>,
    new: Side<'s>,
    marks: &'m mut Marks,
    out: String,
    pending: Pending<'a, 'i>,
}

impl<'a, 'i> Emit<'_, '_, 'a, 'i> {
    fn flush(&mut self) {
        let p = std::mem::replace(&mut self.pending, Pending { state: ' ', run: None, new_side: false, text: String::new() });
        let Some(run) = p.run.filter(|_| !p.text.is_empty()) else { return };
        let side = if p.new_side { self.new } else { self.old };
        // Run gardé en entier : son XML d'origine, tel quel.
        if p.state == ' ' && !p.new_side && run.children().filter(|t| is_m(*t, "t")).filter_map(|t| t.text()).collect::<String>() == p.text {
            self.out.push_str(&side.src[run.range()]);
            return;
        }
        let props = run_props(side.src, run, if p.new_side { self.old.wrpr } else { "" });
        let r = format!(r#"<m:r>{props}<m:t xml:space="preserve">{}</m:t></m:r>"#, escape_text(&p.text));
        match p.state {
            '-' => {
                let o = self.marks.open("del");
                self.out.push_str(&format!("{o}{r}</w:del>"));
            }
            '+' => {
                let o = self.marks.open("ins");
                self.out.push_str(&format!("{o}{r}</w:ins>"));
            }
            _ => self.out.push_str(&r),
        }
    }

    fn ch(&mut self, state: char, run: Node<'a, 'i>, new_side: bool, c: char) {
        if self.pending.state != state || self.pending.run != Some(run) || self.pending.new_side != new_side {
            self.flush();
            self.pending = Pending { state, run: Some(run), new_side, text: String::new() };
        }
        self.pending.text.push(c);
    }

    fn raw(&mut self, s: &str) {
        self.flush();
        self.out.push_str(s);
    }

    fn atom(&mut self, a: &Atom<'a, 'i>, state: char) {
        let new_side = state == '+';
        match a {
            // Un symbole gardé reste dans son run d'origine.
            Atom::Ch { c, run, .. } => self.ch(state, *run, new_side, *c),
            Atom::El { node, .. } => {
                let side = if new_side { self.new } else { self.old };
                let s = match state {
                    '-' => marked(side, *node, "del", self.marks),
                    '+' => marked(side, *node, "ins", self.marks),
                    _ => side.src[node.range()].to_string(),
                };
                self.raw(&s);
            }
        }
    }
}

/// Contenu fusionné de deux conteneurs (`None` : à réécrire en entier).
fn merge_seq<'a, 'i>(old: Node<'a, 'i>, new: Node<'a, 'i>, e: &mut Emit<'_, '_, 'a, 'i>) -> Option<()> {
    let (a, kept) = atoms(old)?;
    let (b, _) = atoms(new)?;
    let steps = align(&a, &b)?;
    let mut kept = kept.into_iter().peekable();
    // Ce qui se recopie (propriétés, signets) devant l'atome d'avant `i`.
    let mut before = |e: &mut Emit, i: usize| {
        while let Some((_, n)) = kept.next_if(|(at, _)| *at <= i) {
            e.raw(&e.old.src[n.range()].to_string());
        }
    };
    let mut k = 0;
    while k < steps.len() {
        if let Step::Keep(i, _) = steps[k] {
            before(e, i);
            e.atom(&a[i], ' ');
            k += 1;
            continue;
        }
        // Un bloc de changements : ce qui part, ce qui vient.
        let start = k;
        while k < steps.len() && !matches!(steps[k], Step::Keep(..)) {
            k += 1;
        }
        let dels: Vec<usize> = steps[start..k].iter().filter_map(|s| if let Step::Del(i) = s { Some(*i) } else { None }).collect();
        let ins: Vec<usize> = steps[start..k].iter().filter_map(|s| if let Step::Ins(j) = s { Some(*j) } else { None }).collect();
        let del_els: Vec<usize> = dels.iter().copied().filter(|i| matches!(a[*i], Atom::El { .. })).collect();
        let ins_els: Vec<usize> = ins.iter().copied().filter(|j| matches!(b[*j], Atom::El { .. })).collect();
        let node = |x: &Atom<'a, 'i>| if let Atom::El { node, .. } = x { Some(*node) } else { None };
        let paired = !del_els.is_empty()
            && del_els.len() == ins_els.len()
            && del_els.iter().zip(&ins_els).all(|(i, j)| same_shape(node(&a[*i]).unwrap(), node(&b[*j]).unwrap()));
        let (mut di, mut ii) = (0, 0);
        let pairs: Vec<(usize, usize)> = if paired { del_els.into_iter().zip(ins_els).collect() } else { Vec::new() };
        for (pi, pj) in pairs.iter().copied().chain(std::iter::once((usize::MAX, usize::MAX))) {
            while di < dels.len() && dels[di] != pi {
                before(e, dels[di]);
                e.atom(&a[dels[di]], '-');
                di += 1;
            }
            while ii < ins.len() && ins[ii] != pj {
                e.atom(&b[ins[ii]], '+');
                ii += 1;
            }
            if pi == usize::MAX {
                break;
            }
            before(e, pi);
            merge_struct(node(&a[pi]).unwrap(), node(&b[pj]).unwrap(), e)?;
            di += 1;
            ii += 1;
        }
    }
    before(e, usize::MAX);
    e.flush();
    Some(())
}

/// Deux structures de même forme : propriétés d'origine, arguments comparés.
fn merge_struct<'a, 'i>(old: Node<'a, 'i>, new: Node<'a, 'i>, e: &mut Emit<'_, '_, 'a, 'i>) -> Option<()> {
    let tag = old.tag_name().name();
    e.raw(&format!("<m:{tag}>"));
    let mut news = parts(new).into_iter();
    for c in old.children().filter(|c| c.is_element()) {
        if c.tag_name().namespace() != Some(M) || c.tag_name().name().ends_with("Pr") {
            e.raw(&e.old.src[c.range()].to_string());
            continue;
        }
        let n = news.next()?;
        let name = c.tag_name().name();
        e.raw(&format!("<m:{name}>"));
        if name == "mr" {
            let mut cells = parts(n).into_iter();
            for cell in c.children().filter(|x| x.is_element()) {
                if !is_m(cell, "e") {
                    e.raw(&e.old.src[cell.range()].to_string());
                    continue;
                }
                e.raw("<m:e>");
                merge_seq(cell, cells.next()?, e)?;
                e.raw("</m:e>");
            }
        } else {
            merge_seq(c, n, e)?;
        }
        e.raw(&format!("</m:{name}>"));
    }
    e.raw(&format!("</m:{tag}>"));
    Some(())
}

/// Contenu d'une équation neuve (`m:oMath` de [`crate::math::from_latex`]),
/// chaque symbole et chaque structure marqués ajoutés.
pub(crate) fn inserted(src: &str, root: Node, marks: &mut Marks) -> String {
    let side = Side { src, wrpr: "" };
    root.children().filter(|c| c.is_element()).map(|c| marked(side, c, "ins", marks)).collect()
}

/// Contenu de l'équation `old` (du document `old_src`) devenue `new` (une
/// équation `m:oMath` écrite par [`crate::math::from_latex`]), ce qui change
/// noté en suivi. `None` : forme que l'on ne sait pas comparer.
pub(crate) fn merge(old_src: &str, old: Node, new_src: &str, new: Node, marks: &mut Marks) -> Option<String> {
    // Police de l'équation d'origine, pour les symboles ajoutés.
    let wrpr = old
        .descendants()
        .filter(|r| is_m(*r, "r"))
        .find_map(|r| r.children().find(|c| crate::xml::is_w(*c, "rPr")))
        .map(|p| &old_src[p.range()])
        .unwrap_or("");
    let mut e = Emit {
        old: Side { src: old_src, wrpr },
        new: Side { src: new_src, wrpr },
        marks,
        out: String::new(),
        pending: Pending { state: ' ', run: None, new_side: false, text: String::new() },
    };
    merge_seq(old, new, &mut e)?;
    Some(e.out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(old_latex: &str, new_latex: &str) -> (String, Vec<u32>) {
        let old = crate::math::from_latex(old_latex);
        let new = crate::math::from_latex(new_latex);
        let (od, nd) = (roxmltree::Document::parse(&old).unwrap(), roxmltree::Document::parse(&new).unwrap());
        let mut marks = Marks { author: "Thierry".into(), date: "2026-11-15T00:00:00Z".into(), next: 10, ids: Vec::new() };
        let inner = merge(&old, od.root_element(), &new, nd.root_element(), &mut marks).unwrap();
        (inner, marks.ids)
    }

    /// L'équation fusionnée, lue avant et après les suivis.
    fn views(inner: &str) -> (String, String) {
        let xml = format!(r#"<m:oMath xmlns:m="{M}" xmlns:w="{}">{inner}</m:oMath>"#, crate::xml::W);
        let d = roxmltree::Document::parse(&xml).unwrap();
        (crate::math::to_latex_view(d.root_element(), crate::math::View::Before), crate::math::to_latex_view(d.root_element(), crate::math::View::Now))
    }

    #[test]
    fn seul_le_symbole_change_est_marque() {
        let (inner, ids) = run(r"y_{rzt}", r"\alpha_{rzt}");
        assert_eq!(ids.len(), 2, "{inner}");
        assert!(inner.contains(r#"<w:del w:id="10""#) && inner.contains("<m:t xml:space=\"preserve\">y</m:t></m:r></w:del>"), "{inner}");
        assert!(inner.contains("α</m:t></m:r></w:ins>"), "{inner}");
        assert!(inner.contains("<m:sub>") && !inner.contains("<w:del w:id=\"12\""), "{inner}");
        assert_eq!(views(&inner), ("y_{rzt}".to_string(), r"\alpha_{rzt}".to_string()));
    }

    #[test]
    fn une_structure_neuve_est_marquee_comme_word() {
        let (inner, _) = run(r"\tau_{za}\sim x", r"\tau_{z}^{a}\sim x");
        // L'ancienne structure barrée (marque dans m:sSubPr), la nouvelle ajoutée.
        assert!(inner.contains("<m:sSubPr><m:ctrlPr><w:del "), "{inner}");
        assert!(inner.contains("<m:sSubSupPr><m:ctrlPr><w:ins "), "{inner}");
        assert!(inner.contains("∼"), "le reste est gardé : {inner}");
        assert_eq!(views(&inner), (r"\tau_{za}\sim x".to_string(), r"\tau_{z}^{a}\sim x".to_string()));
    }

    #[test]
    fn rien_ne_change_rien_n_est_marque() {
        let (inner, ids) = run(r"\frac{a}{b}+c", r"\frac{a}{b}+c");
        assert!(ids.is_empty(), "{inner}");
        let (inner, ids) = run(r"m_{rzt}=\alpha_{rz}+x", r"m_{rzt}=a_{rz}+x");
        assert_eq!(ids.len(), 2, "{inner}");
        assert_eq!(views(&inner).1, "m_{rzt}=a_{rz}+x");
    }
}
