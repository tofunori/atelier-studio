//! Retour d'un relecteur (.docx) ramené dans le LaTeX.
//!
//! Le .docx envoyé au relecteur a été fabriqué depuis le .tex (pandoc), puis
//! commenté et retouché dans Word. Pour poser chaque commentaire sur son
//! passage dans le .tex :
//!
//! 1. le document est lu « tout refusé » (insertions ignorées, suppressions
//!    gardées) : c'est le texte qu'on lui avait envoyé ;
//! 2. ce texte et le .tex (entrées `\input` déroulées, commandes ôtées,
//!    `\cite` et maths réduits à un jeton) deviennent deux suites de mots ;
//! 3. les deux suites sont alignées (diff « patience » : mots uniques
//!    communs d'abord, puis l'intervalle entre deux ancres) ;
//! 4. chaque commentaire va sur les mots alignés de son passage : `exact`
//!    s'ils le sont tous, `changed` si le passage a été retouché depuis
//!    l'envoi, `paragraph` (la phrase la plus proche dans son paragraphe) si
//!    aucun ne l'est, `near` (paragraphe voisin, pour une figure) sinon.
//!
//! Aucun commentaire n'est perdu : chacun reçoit une place.

use crate::model::{Comment, DocModel};
use crate::xml::{self, M, W, W14};
use crate::{Docx, Result};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Le .tex en jetons
// ---------------------------------------------------------------------------

/// Un fichier du projet LaTeX lu pendant le déroulé des `\input`.
#[derive(Debug, Clone, Serialize)]
pub struct TexFile {
    pub path: PathBuf,
    #[serde(skip)]
    pub text: String,
}

/// Un mot du .tex : sa forme normalisée et ses octets dans son fichier.
#[derive(Debug, Clone)]
pub struct TexToken {
    pub word: String,
    pub file: usize,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Default)]
pub struct TexText {
    pub files: Vec<TexFile>,
    pub tokens: Vec<TexToken>,
}

const MATH_ENVS: [&str; 12] = [
    "equation",
    "equation*",
    "align",
    "align*",
    "gather",
    "gather*",
    "multline",
    "multline*",
    "eqnarray",
    "eqnarray*",
    "displaymath",
    "math",
];
/// Commandes dont l'argument n'est pas du texte lu par le relecteur.
const SKIP_ARG: [&str; 27] = [
    "label",
    "ref",
    "eqref",
    "autoref",
    "cref",
    "Cref",
    "pageref",
    "nameref",
    "includegraphics",
    "usepackage",
    "documentclass",
    "bibliography",
    "bibliographystyle",
    "newcommand",
    "renewcommand",
    "providecommand",
    "def",
    "setlength",
    "addtolength",
    "vspace",
    "hspace",
    "color",
    "pagestyle",
    "thispagestyle",
    "hypersetup",
    "graphicspath",
    "url",
];
const INPUTS: [&str; 3] = ["input", "include", "subfile"];

fn is_cite(name: &str) -> bool {
    name.starts_with("cite")
        || matches!(
            name,
            "parencite" | "textcite" | "autocite" | "footcite" | "nocite"
        )
}

/// Mots d'un passage de texte courant : alphanumériques, en minuscules.
fn words(text: &str, mut push: impl FnMut(String, usize, usize)) {
    let mut start: Option<usize> = None;
    for (i, c) in text
        .char_indices()
        .chain(std::iter::once((text.len(), ' ')))
    {
        if c.is_alphanumeric() {
            start.get_or_insert(i);
        } else if let Some(s) = start.take() {
            push(text[s..i].to_lowercase(), s, i);
        }
    }
}

struct Scanner<'a> {
    files: &'a mut Vec<TexFile>,
    tokens: &'a mut Vec<TexToken>,
    read: &'a dyn Fn(&Path) -> Option<String>,
    root: PathBuf,
    seen: HashSet<PathBuf>,
}

fn skip_spaces(b: &[u8], mut i: usize) -> usize {
    while i < b.len() && (b[i] == b' ' || b[i] == b'\t') {
        i += 1;
    }
    i
}

/// Fin (exclusive) du groupe ouvert en `i` par `open`, en tenant compte des
/// groupes imbriqués et des caractères échappés.
fn group_end(b: &[u8], i: usize, open: u8, close: u8) -> usize {
    let mut depth = 0usize;
    let mut k = i;
    while k < b.len() {
        match b[k] {
            b'\\' => k += 1,
            c if c == open => depth += 1,
            c if c == close => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return k + 1;
                }
            }
            b'%' => {
                while k < b.len() && b[k] != b'\n' {
                    k += 1;
                }
            }
            _ => {}
        }
        k += 1;
    }
    b.len()
}

fn find_from(text: &str, from: usize, needle: &str) -> Option<usize> {
    text.get(from..)?.find(needle).map(|i| from + i)
}

impl Scanner<'_> {
    fn resolve(&self, base: &Path, name: &str) -> Option<PathBuf> {
        let name = name.trim();
        if name.is_empty() {
            return None;
        }
        let with_ext = if Path::new(name).extension().is_some() {
            name.to_string()
        } else {
            format!("{name}.tex")
        };
        [base.join(&with_ext), self.root.join(&with_ext)]
            .into_iter()
            .find(|p| (self.read)(p).is_some())
    }

    fn file(&mut self, path: &Path, body_only: bool) {
        let key = path.to_path_buf();
        if !self.seen.insert(key.clone()) {
            return;
        }
        let Some(text) = (self.read)(path) else {
            return;
        };
        let index = self.files.len();
        self.files.push(TexFile {
            path: key,
            text: text.clone(),
        });
        let (from, to) = if body_only {
            let from = text
                .find("\\begin{document}")
                .map_or(0, |i| i + "\\begin{document}".len());
            let to = find_from(&text, from, "\\end{document}").unwrap_or(text.len());
            (from, to)
        } else {
            (0, text.len())
        };
        let base = path.parent().map(Path::to_path_buf).unwrap_or_default();
        self.scan(index, &text, from, to, &base);
    }

    fn push(&mut self, word: String, file: usize, start: usize, end: usize) {
        self.tokens.push(TexToken {
            word,
            file,
            start,
            end,
        });
    }

    fn scan(&mut self, file: usize, text: &str, from: usize, to: usize, base: &Path) {
        let b = text.as_bytes();
        let mut i = from;
        while i < to {
            let c = b[i];
            if c == b'%' {
                while i < to && b[i] != b'\n' {
                    i += 1;
                }
            } else if c == b'$' {
                let display = b.get(i + 1) == Some(&b'$');
                let open = if display { 2 } else { 1 };
                let mut k = i + open;
                let close = loop {
                    if k >= to {
                        break to;
                    }
                    match b[k] {
                        b'\\' => k += 2,
                        b'$' => break if display { (k + 2).min(to) } else { k + 1 },
                        _ => k += 1,
                    }
                };
                self.push("math".into(), file, i, close);
                i = close;
            } else if c == b'\\' {
                i = self.command(file, text, i, to, base);
            } else if (c as char).is_ascii_alphanumeric() || c >= 0x80 {
                let mut k = i;
                while k < to {
                    let ch = text[k..].chars().next().unwrap_or(' ');
                    if !ch.is_alphanumeric() {
                        break;
                    }
                    k += ch.len_utf8();
                }
                if k == i {
                    // caractère non alphanumérique hors ASCII (tiret, guillemet…)
                    i += text[i..].chars().next().map_or(1, char::len_utf8);
                } else {
                    self.push(text[i..k].to_lowercase(), file, i, k);
                    i = k;
                }
            } else {
                i += 1;
            }
        }
    }

    /// Une commande à l'octet `i` (`\`) : renvoie où reprendre la lecture.
    fn command(&mut self, file: usize, text: &str, i: usize, to: usize, base: &Path) -> usize {
        let b = text.as_bytes();
        let mut k = i + 1;
        while k < to && b[k].is_ascii_alphabetic() {
            k += 1;
        }
        if k == i + 1 {
            // symbole : \[ … \] et \( … \) sont des maths, le reste un caractère
            return match b.get(k) {
                Some(b'[') => self.math_until(file, text, i, to, "\\]"),
                Some(b'(') => self.math_until(file, text, i, to, "\\)"),
                Some(_) => (k + 1).min(to),
                None => to,
            };
        }
        let name = &text[i + 1..k];
        if name == "iffalse" {
            return find_from(text, k, "\\fi").map_or(to, |j| j + 3).min(to);
        }
        let mut j = k;
        if b.get(j) == Some(&b'*') {
            j += 1;
        }
        let arg = |j: usize| -> Option<(usize, usize)> {
            let s = skip_spaces(b, j);
            (b.get(s) == Some(&b'{')).then(|| (s, group_end(b, s, b'{', b'}').min(to)))
        };
        let skip_options = |mut j: usize| -> usize {
            loop {
                let s = skip_spaces(b, j);
                if b.get(s) == Some(&b'[') {
                    j = group_end(b, s, b'[', b']').min(to);
                } else {
                    return j;
                }
            }
        };
        if name == "begin" {
            let Some((s, e)) = arg(j) else { return j };
            let env = text[s + 1..e.saturating_sub(1)].trim();
            if MATH_ENVS.contains(&env) {
                let close = format!("\\end{{{env}}}");
                let end = find_from(text, e, &close)
                    .map_or(to, |x| x + close.len())
                    .min(to);
                self.push("math".into(), file, i, end);
                return end;
            }
            return skip_options(e);
        }
        if name == "end" {
            return arg(j).map_or(j, |(_, e)| e);
        }
        if is_cite(name) {
            let j = skip_options(j);
            let Some((s, e)) = arg(j) else { return j };
            let inner = &text[s + 1..e.saturating_sub(1)];
            let mut offset = s + 1;
            for key in inner.split(',') {
                let norm: String = key
                    .chars()
                    .filter(|c| c.is_alphanumeric())
                    .collect::<String>()
                    .to_lowercase();
                let lead = key.len() - key.trim_start().len();
                if !norm.is_empty() {
                    let start = offset + lead;
                    self.push(format!("cite{norm}"), file, start, start + key.trim().len());
                }
                offset += key.len() + 1;
            }
            return e;
        }
        if INPUTS.contains(&name) {
            let Some((s, e)) = arg(j) else { return j };
            if let Some(path) = self.resolve(base, &text[s + 1..e.saturating_sub(1)]) {
                self.file(&path, false);
            }
            return e;
        }
        if name == "href" {
            // l'adresse ne se lit pas, le texte du lien si
            return arg(j).map_or(j, |(_, e)| e);
        }
        if SKIP_ARG.contains(&name) {
            let j = skip_options(j);
            let j = if name == "def" {
                // \def\nom{…}
                let s = skip_spaces(b, j);
                if b.get(s) == Some(&b'\\') {
                    let mut n = s + 1;
                    while n < to && b[n].is_ascii_alphabetic() {
                        n += 1;
                    }
                    n
                } else {
                    s
                }
            } else {
                j
            };
            let j = if matches!(name, "newcommand" | "renewcommand" | "providecommand") {
                arg(j).map_or(j, |(_, e)| skip_options(e))
            } else {
                j
            };
            return arg(j).map_or(j, |(_, e)| e);
        }
        skip_options(j)
    }

    fn math_until(&mut self, file: usize, text: &str, i: usize, to: usize, close: &str) -> usize {
        let end = find_from(text, i + 2, close)
            .map_or(to, |x| x + close.len())
            .min(to);
        self.push("math".into(), file, i, end);
        end
    }
}

/// Lit le projet à partir de son fichier principal : corps du document
/// (entre `\begin{document}` et `\end{document}` s'il y en a), `\input`
/// déroulés à leur place, chaque fichier une seule fois (un chapitre qui
/// se recompile seul en rechargeant le principal ne boucle pas).
pub fn read_tex(main: &Path, read: &dyn Fn(&Path) -> Option<String>) -> TexText {
    let mut out = TexText::default();
    let root = main.parent().map(Path::to_path_buf).unwrap_or_default();
    let mut scanner = Scanner {
        files: &mut out.files,
        tokens: &mut out.tokens,
        read,
        root,
        seen: HashSet::new(),
    };
    scanner.file(main, true);
    out
}

// ---------------------------------------------------------------------------
// Le .docx « tout refusé » en jetons
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct DocToken {
    word: String,
    para: usize,
}

struct DocText {
    tokens: Vec<DocToken>,
    /// Jetons de chaque commentaire (indices dans `tokens`).
    anchors: HashMap<u32, Vec<usize>>,
    /// Premier jeton de chaque paragraphe (et la fin).
    para_start: Vec<usize>,
    /// Le paragraphe porte une image (figure).
    has_image: Vec<bool>,
    /// Le passage commenté n'est fait que d'équations.
    only_math: HashSet<u32>,
    /// Où chaque commentaire commence, ajouts du relecteur compris : le mot
    /// qui suit et son paragraphe.
    first: HashMap<u32, (usize, usize)>,
}

fn doc_text(model: &DocModel) -> DocText {
    let mut tokens = Vec::new();
    let mut anchors: HashMap<u32, Vec<usize>> = HashMap::new();
    let mut para_start = Vec::new();
    let mut has_image = Vec::new();
    let mut text_anchor: HashSet<u32> = HashSet::new();
    let mut first: HashMap<u32, (usize, usize)> = HashMap::new();
    for (pi, p) in model.paragraphs.iter().enumerate() {
        para_start.push(tokens.len());
        has_image.push(
            p.segments
                .iter()
                .any(|s| s.label.as_deref() == Some("image")),
        );
        for seg in &p.segments {
            for c in &seg.comments {
                first.entry(*c).or_insert((tokens.len(), pi));
            }
            if matches!(seg.rev, Some("ins" | "moveTo")) {
                continue;
            }
            let mut add = |word: String, tokens: &mut Vec<DocToken>| {
                for c in &seg.comments {
                    anchors.entry(*c).or_default().push(tokens.len());
                }
                tokens.push(DocToken { word, para: pi });
            };
            if seg.kind == "object" && seg.latex.is_some() {
                add("math".into(), &mut tokens);
            } else if matches!(seg.kind, "text" | "field") {
                let mut found = Vec::new();
                words(&seg.text, |w, _, _| found.push(w));
                if !found.is_empty() {
                    text_anchor.extend(seg.comments.iter().copied());
                }
                for w in found {
                    add(w, &mut tokens);
                }
            }
        }
    }
    para_start.push(tokens.len());
    let only_math = anchors
        .keys()
        .filter(|c| !text_anchor.contains(c))
        .copied()
        .collect();
    DocText {
        tokens,
        anchors,
        para_start,
        has_image,
        only_math,
        first,
    }
}

// ---------------------------------------------------------------------------
// Alignement (diff « patience »)
// ---------------------------------------------------------------------------

/// Pour chaque mot de `a`, le mot de `b` qui lui correspond.
pub fn align(a: &[&str], b: &[&str]) -> Vec<Option<usize>> {
    let mut out = vec![None; a.len()];
    let mut stack = vec![(0usize, a.len(), 0usize, b.len())];
    while let Some((mut alo, mut ahi, mut blo, mut bhi)) = stack.pop() {
        while alo < ahi && blo < bhi && a[alo] == b[blo] {
            out[alo] = Some(blo);
            alo += 1;
            blo += 1;
        }
        while alo < ahi && blo < bhi && a[ahi - 1] == b[bhi - 1] {
            out[ahi - 1] = Some(bhi - 1);
            ahi -= 1;
            bhi -= 1;
        }
        if alo >= ahi || blo >= bhi {
            continue;
        }
        let anchors = unique_lis(&a[alo..ahi], &b[blo..bhi]);
        if anchors.is_empty() {
            if (ahi - alo) * (bhi - blo) <= 60_000 {
                lcs(a, b, alo, ahi, blo, bhi, &mut out);
            }
            continue;
        }
        let (mut pa, mut pb) = (alo, blo);
        for (x, y) in anchors {
            let (x, y) = (alo + x, blo + y);
            out[x] = Some(y);
            if pa < x && pb < y {
                stack.push((pa, x, pb, y));
            }
            pa = x + 1;
            pb = y + 1;
        }
        if pa < ahi && pb < bhi {
            stack.push((pa, ahi, pb, bhi));
        }
    }
    out
}

/// Mots présents une seule fois de chaque côté, gardés dans le même ordre
/// (plus longue sous-suite croissante).
fn unique_lis(a: &[&str], b: &[&str]) -> Vec<(usize, usize)> {
    let mut count: HashMap<&str, (u32, usize, u32, usize)> = HashMap::new();
    for (i, w) in a.iter().enumerate() {
        let e = count.entry(w).or_insert((0, i, 0, 0));
        e.0 += 1;
    }
    for (j, w) in b.iter().enumerate() {
        if let Some(e) = count.get_mut(w) {
            e.2 += 1;
            e.3 = j;
        }
    }
    let mut pairs: Vec<(usize, usize)> = count
        .values()
        .filter(|e| e.0 == 1 && e.2 == 1)
        .map(|e| (e.1, e.3))
        .collect();
    pairs.sort_unstable();
    // plus longue sous-suite croissante sur le second indice
    let mut tails: Vec<usize> = Vec::new();
    let mut prev: Vec<Option<usize>> = vec![None; pairs.len()];
    for (k, &(_, y)) in pairs.iter().enumerate() {
        let pos = tails.partition_point(|&t| pairs[t].1 < y);
        if pos > 0 {
            prev[k] = Some(tails[pos - 1]);
        }
        if pos == tails.len() {
            tails.push(k);
        } else {
            tails[pos] = k;
        }
    }
    let mut out = Vec::new();
    let mut cur = tails.last().copied();
    while let Some(k) = cur {
        out.push(pairs[k]);
        cur = prev[k];
    }
    out.reverse();
    out
}

fn lcs(
    a: &[&str],
    b: &[&str],
    alo: usize,
    ahi: usize,
    blo: usize,
    bhi: usize,
    out: &mut [Option<usize>],
) {
    let (n, m) = (ahi - alo, bhi - blo);
    let mut dp = vec![0u16; (n + 1) * (m + 1)];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i * (m + 1) + j] = if a[alo + i] == b[blo + j] {
                dp[(i + 1) * (m + 1) + j + 1] + 1
            } else {
                dp[(i + 1) * (m + 1) + j].max(dp[i * (m + 1) + j + 1])
            };
        }
    }
    let (mut i, mut j) = (0, 0);
    while i < n && j < m {
        if a[alo + i] == b[blo + j] {
            out[alo + i] = Some(blo + j);
            i += 1;
            j += 1;
        } else if dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1] {
            i += 1;
        } else {
            j += 1;
        }
    }
}

// ---------------------------------------------------------------------------
// Commentaires placés
// ---------------------------------------------------------------------------

/// Justesse de la place trouvée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Fit {
    /// Tout le passage commenté se retrouve tel quel.
    Exact,
    /// Une partie seulement : le passage a été retouché depuis l'envoi.
    Changed,
    /// Passage introuvable : la phrase la plus proche de son paragraphe.
    Paragraph,
    /// Paragraphe introuvable (figure, paragraphe réécrit) : le plus proche.
    Near,
}

/// Où va un commentaire : fichier, octets, ligne et colonne (UTF-16, base 0,
/// celles de l'éditeur) de début et de fin, et le texte du .tex couvert.
#[derive(Debug, Clone, Serialize)]
pub struct Place {
    pub file: usize,
    pub start: usize,
    pub end: usize,
    pub from: (usize, usize),
    pub to: (usize, usize),
    pub text: String,
    pub fit: Fit,
}

#[derive(Debug, Clone, Serialize)]
pub struct Reply {
    pub id: u32,
    pub author: String,
    pub date: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Imported {
    pub id: u32,
    pub author: String,
    pub initials: String,
    pub date: String,
    pub text: String,
    pub done: bool,
    /// Passage commenté, tel qu'il le voyait (ses retouches comprises).
    pub quote: String,
    /// text, equation, figure, point (commentaire sans passage), inserted
    /// (posé sur un passage qu'il a lui-même ajouté).
    pub on: &'static str,
    /// question (il demande quelque chose) ou remark.
    pub kind: &'static str,
    pub replies: Vec<Reply>,
    pub place: Place,
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct Counts {
    pub received: usize,
    pub placed: usize,
    pub exact: usize,
    pub changed: usize,
    pub paragraph: usize,
    pub near: usize,
    pub replies: usize,
}

#[derive(Debug, Serialize)]
pub struct Feedback {
    /// Le relecteur : l'auteur le plus fréquent des commentaires.
    pub reviewer: String,
    pub files: Vec<PathBuf>,
    pub comments: Vec<Imported>,
    pub counts: Counts,
    /// Suivis de modifications : mots insérés ou supprimés, déplacements,
    /// mises en forme.
    pub changes: usize,
    pub moves: usize,
    pub formats: usize,
    /// Date du dernier commentaire (ISO 8601).
    pub last_date: String,
}

fn position(text: &str, byte: usize) -> (usize, usize) {
    let byte = byte.min(text.len());
    let before = &text[..byte];
    let line = before.matches('\n').count();
    let start = before.rfind('\n').map_or(0, |i| i + 1);
    (line, text[start..byte].chars().map(char::len_utf16).sum())
}

/// Octets de la ligne qui contient `byte`, blancs de tête et de fin ôtés.
fn line_span(text: &str, byte: usize) -> (usize, usize) {
    let byte = byte.min(text.len());
    let start = text[..byte].rfind('\n').map_or(0, |i| i + 1);
    let end = text[byte..].find('\n').map_or(text.len(), |i| byte + i);
    let line = &text[start..end];
    let lead = line.len() - line.trim_start().len();
    (start + lead, start + line.trim_end().len())
}

/// Le plus gros groupe de mots du .tex qui se suivent (même fichier, écarts
/// de 8 mots au plus).
fn cluster(mapped: &mut [usize], tex: &[TexToken]) -> Option<(usize, usize, usize)> {
    mapped.sort_unstable();
    let mut best: Option<(usize, usize, usize)> = None; // (premier, dernier, taille)
    let mut i = 0;
    while i < mapped.len() {
        let mut j = i;
        while j + 1 < mapped.len()
            && mapped[j + 1] - mapped[j] <= 8
            && tex[mapped[j + 1]].file == tex[mapped[i]].file
        {
            j += 1;
        }
        let size = j - i + 1;
        if best.is_none_or(|b| size > b.2) {
            best = Some((mapped[i], mapped[j], size));
        }
        i = j + 1;
    }
    best
}

fn kind_of(text: &str) -> &'static str {
    if text.contains('?') {
        "question"
    } else {
        "remark"
    }
}

/// Paragraphe (w14:paraId) de chaque commentaire, et ceux posés dans une
/// équation : le modèle ne suit pas les commentaires à l'intérieur des
/// équations (OMML).
#[derive(Debug, Default)]
pub struct Marks {
    pub para: HashMap<u32, String>,
    pub in_math: HashSet<u32>,
}

pub fn marks(document_xml: &str) -> Marks {
    let mut out = Marks::default();
    let Ok(doc) = xml::parse(document_xml) else {
        return out;
    };
    for node in doc.descendants().filter(|n| {
        n.tag_name().namespace() == Some(W)
            && matches!(
                n.tag_name().name(),
                "commentRangeStart" | "commentReference"
            )
    }) {
        let Some(id) = node
            .attribute((W, "id"))
            .and_then(|v| v.parse::<u32>().ok())
        else {
            continue;
        };
        if node
            .ancestors()
            .any(|a| a.tag_name().namespace() == Some(M) && a.tag_name().name() == "oMath")
        {
            out.in_math.insert(id);
        }
        if let Some(pid) = node
            .ancestors()
            .find(|a| a.tag_name().namespace() == Some(W) && a.tag_name().name() == "p")
            .and_then(|p| p.attribute((W14, "paraId")))
        {
            out.para.entry(id).or_insert_with(|| pid.to_string());
        }
    }
    out
}

/// Lit le retour du relecteur et place ses commentaires dans le .tex.
pub fn import(docx: &mut Docx, tex: &TexText) -> Result<Feedback> {
    let model = docx.model()?;
    let marks = marks(docx.document_xml());
    Ok(place(&model, &marks, tex))
}

/// Place les commentaires du relecteur dans le .tex. Les réponses (fils de
/// commentaires) suivent leur commentaire.
pub fn place(model: &DocModel, marks: &Marks, tex: &TexText) -> Feedback {
    let doc = doc_text(model);
    let by_para_id: HashMap<&str, usize> = model
        .paragraphs
        .iter()
        .enumerate()
        .filter_map(|(i, p)| p.para_id.as_deref().map(|id| (id, i)))
        .collect();
    let a: Vec<&str> = doc.tokens.iter().map(|t| t.word.as_str()).collect();
    let b: Vec<&str> = tex.tokens.iter().map(|t| t.word.as_str()).collect();
    let map = align(&a, &b);
    let para_index: HashMap<&str, usize> = model
        .paragraphs
        .iter()
        .enumerate()
        .map(|(i, p)| (p.id.as_str(), i))
        .collect();

    let mut by_author: HashMap<&str, usize> = HashMap::new();
    for c in &model.comments {
        *by_author.entry(c.author.as_str()).or_default() += 1;
    }
    let reviewer = by_author
        .iter()
        .max_by_key(|(n, k)| (**k, std::cmp::Reverse(**n)))
        .map(|(n, _)| n.to_string())
        .unwrap_or_default();

    let range = |first: usize, last: usize, fit: Fit| -> Place {
        let t0 = &tex.tokens[first];
        let t1 = &tex.tokens[last];
        let text = &tex.files[t0.file].text;
        let (start, end) = if t1.file == t0.file && t1.end >= t0.start {
            (t0.start, t1.end)
        } else {
            (t0.start, t0.end)
        };
        let (start, end) = if matches!(fit, Fit::Paragraph | Fit::Near) {
            line_span(text, start)
        } else {
            (start, end)
        };
        Place {
            file: t0.file,
            start,
            end,
            from: position(text, start),
            to: position(text, end),
            text: text[start..end].to_string(),
            fit,
        }
    };
    // Mots alignés d'un paragraphe du .docx.
    let para_hits = |pi: usize| -> Vec<usize> {
        (doc.para_start[pi]..doc.para_start[pi + 1])
            .filter_map(|k| map[k])
            .collect()
    };

    let place_one = |c: &Comment| -> Place {
        if tex.tokens.is_empty() {
            return Place {
                file: 0,
                start: 0,
                end: 0,
                from: (0, 0),
                to: (0, 0),
                text: String::new(),
                fit: Fit::Near,
            };
        }
        let anchor = doc.anchors.get(&c.id).cloned().unwrap_or_default();
        let mut mapped: Vec<usize> = anchor.iter().filter_map(|k| map[*k]).collect();
        let enough = mapped.len() >= 2 || (anchor.len() <= 2 && !mapped.is_empty());
        if enough && let Some((first, last, size)) = cluster(&mut mapped, &tex.tokens) {
            let fit = if size == anchor.len() {
                Fit::Exact
            } else {
                Fit::Changed
            };
            return range(first, last, fit);
        }
        let seen = doc.first.get(&c.id).copied();
        let para = anchor
            .first()
            .map(|k| doc.tokens[*k].para)
            .or(seen.map(|s| s.1))
            .or_else(|| {
                marks
                    .para
                    .get(&c.id)
                    .and_then(|p| by_para_id.get(p.as_str()).copied())
            })
            .or_else(|| {
                c.paragraph
                    .as_deref()
                    .and_then(|p| para_index.get(p).copied())
            })
            .unwrap_or(0);
        // La phrase la plus proche dans son paragraphe : le dernier mot aligné
        // avant son passage (ou au début de son passage), sinon le premier
        // aligné du paragraphe. Une équation seule suffit à situer son
        // paragraphe.
        let start = anchor
            .first()
            .copied()
            .or(seen.filter(|s| s.1 == para).map(|s| s.0))
            .unwrap_or(doc.para_start[para + 1]);
        let hits = para_hits(para);
        let words = doc.para_start[para + 1] - doc.para_start[para];
        if !hits.is_empty() && hits.len() >= words.min(3) {
            let k = (doc.para_start[para]..=start.min(doc.para_start[para + 1].saturating_sub(1)))
                .rev()
                .find_map(|k| map[k])
                .unwrap_or(hits[0]);
            return range(k, k, Fit::Paragraph);
        }
        // Paragraphe sans texte retrouvé (image, paragraphe réécrit) : le plus
        // proche qui en a, la légende d'une figure d'abord.
        let n = model.paragraphs.len();
        for d in 1..n.max(1) {
            let mut order = Vec::new();
            if doc.has_image.get(para).copied().unwrap_or(false) {
                order.extend([para + d, para.wrapping_sub(d)]);
            } else {
                order.extend([para.wrapping_sub(d), para + d]);
            }
            for q in order.into_iter().filter(|q| *q < n) {
                let hits = para_hits(q);
                if hits.len() >= 3 {
                    let k = if q < para {
                        *hits.iter().max().unwrap()
                    } else {
                        *hits.iter().min().unwrap()
                    };
                    return range(k, k, Fit::Near);
                }
            }
        }
        range(0, 0, Fit::Near)
    };

    let mut comments = Vec::new();
    let mut counts = Counts {
        received: model.comments.len(),
        ..Counts::default()
    };
    for c in model.comments.iter().filter(|c| c.parent.is_none()) {
        let place = place_one(c);
        match place.fit {
            Fit::Exact => counts.exact += 1,
            Fit::Changed => counts.changed += 1,
            Fit::Paragraph => counts.paragraph += 1,
            Fit::Near => counts.near += 1,
        }
        let anchor_len = doc.anchors.get(&c.id).map_or(0, Vec::len);
        let para = doc
            .first
            .get(&c.id)
            .map(|s| s.1)
            .or_else(|| {
                marks
                    .para
                    .get(&c.id)
                    .and_then(|p| by_para_id.get(p.as_str()).copied())
            })
            .or_else(|| {
                c.paragraph
                    .as_deref()
                    .and_then(|p| para_index.get(p).copied())
            });
        let on = if doc.only_math.contains(&c.id)
            || (anchor_len == 0 && marks.in_math.contains(&c.id))
        {
            "equation"
        } else if anchor_len == 0
            && para.is_some_and(|p| doc.has_image[p])
            && !c.quote.chars().any(char::is_alphanumeric)
        {
            "figure"
        } else if anchor_len == 0 && c.quote.chars().any(char::is_alphanumeric) {
            "inserted"
        } else if anchor_len == 0 {
            "point"
        } else {
            "text"
        };
        let replies: Vec<Reply> = model
            .comments
            .iter()
            .filter(|r| r.parent == Some(c.id))
            .map(|r| Reply {
                id: r.id,
                author: r.author.clone(),
                date: r.date.clone(),
                text: r.text.clone(),
            })
            .collect();
        counts.replies += replies.len();
        comments.push(Imported {
            id: c.id,
            author: c.author.clone(),
            initials: c.initials.clone(),
            date: c.date.clone(),
            text: c.text.clone(),
            done: c.done,
            quote: c.quote.clone(),
            on,
            kind: kind_of(&c.text),
            replies,
            place,
        });
    }
    // Réponse dont le parent manque : traitée comme un commentaire.
    counts.placed = comments.len() + counts.replies;
    Feedback {
        reviewer,
        files: tex.files.iter().map(|f| f.path.clone()).collect(),
        comments,
        counts,
        changes: model
            .changes
            .iter()
            .filter(|c| matches!(c.kind.as_str(), "ins" | "del"))
            .count(),
        moves: model
            .changes
            .iter()
            .filter(|c| c.kind == "moveFrom")
            .count(),
        formats: model.changes.iter().filter(|c| c.kind == "format").count(),
        last_date: model
            .comments
            .iter()
            .map(|c| c.date.as_str())
            .max()
            .unwrap_or("")
            .to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tex_of(files: &[(&str, &str)], main: &str) -> TexText {
        let map: HashMap<PathBuf, String> = files
            .iter()
            .map(|(p, t)| (PathBuf::from(p), t.to_string()))
            .collect();
        read_tex(Path::new(main), &move |p: &Path| map.get(p).cloned())
    }

    fn words_of(t: &TexText) -> Vec<&str> {
        t.tokens.iter().map(|t| t.word.as_str()).collect()
    }

    #[test]
    fn tex_tokens_drop_commands_and_reduce_cites_and_math() {
        let t = tex_of(
            &[(
                "/p/main.tex",
                "\\documentclass{article}\n\\usepackage{x}\n\\begin{document}\n\\section{MODIS albedo}\\label{s:a}\n\
                 Following \\citet{stroeve2006,Ren_2021}, values below $0.05$ or above 0.99 % commentaire\n\
                 are removed (Fig.~\\ref{f1}).\n\\iffalse caché \\fi\n\\begin{equation}a=b\\end{equation}\n\\end{document}\nfin",
            )],
            "/p/main.tex",
        );
        assert_eq!(
            words_of(&t),
            [
                "modis",
                "albedo",
                "following",
                "citestroeve2006",
                "citeren2021",
                "values",
                "below",
                "math",
                "or",
                "above",
                "0",
                "99",
                "are",
                "removed",
                "fig",
                "math"
            ]
        );
        let cite = &t.tokens[3];
        assert_eq!(&t.files[0].text[cite.start..cite.end], "stroeve2006");
    }

    #[test]
    fn inputs_unroll_in_place_once() {
        let t = tex_of(
            &[
                (
                    "/p/main.tex",
                    "\\input{sections/idees}\n\\begin{document}\nAlpha \\input{sections/a}\nOmega\n\\end{document}",
                ),
                (
                    "/p/sections/a.tex",
                    "\\def\\Load{\\input{main}\\endinput}\nBeta gamma",
                ),
                ("/p/sections/idees.tex", "jamais lu"),
            ],
            "/p/main.tex",
        );
        assert_eq!(words_of(&t), ["alpha", "beta", "gamma", "omega"]);
        assert_eq!(t.files.len(), 2);
        assert_eq!(t.tokens[1].file, 1);
    }

    #[test]
    fn patience_aligns_around_edits() {
        let a: Vec<&str> = "the quick brown fox jumps over the lazy dog today"
            .split(' ')
            .collect();
        let b: Vec<&str> = "the quick red fox leaps over the lazy dog"
            .split(' ')
            .collect();
        let m = align(&a, &b);
        assert_eq!(m[0], Some(0));
        assert_eq!(m[2], None); // brown
        assert_eq!(m[3], Some(3)); // fox
        assert_eq!(m[4], None); // jumps
        assert_eq!(m[8], Some(8)); // dog
        assert_eq!(m[9], None);
    }

    #[test]
    fn line_span_trims() {
        let text = "a\n   hello world  \nb";
        let (s, e) = line_span(text, 8);
        assert_eq!(&text[s..e], "hello world");
        assert_eq!(position(text, s), (1, 3));
    }
}
