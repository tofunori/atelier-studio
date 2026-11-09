//! Compteur de mots du manuscrit et relevé des choses à faire (barre du bas
//! de l'éditeur LaTeX).
//!
//! - `POST /tex/manuscript` : à partir du fichier ouvert, remonte au document
//!   racine (`find_tex_root`), déplie ses `\input`/`\include`/`\subfile`, et
//!   rend le compte par section, le total, l'écart du jour et la liste des
//!   `% TODO`, `% FIXME`, `% XXX`, `\todo{}` et `\missingfigure{}`. Le texte
//!   non sauvegardé du fichier ouvert peut être passé dans `text` : il remplace
//!   le disque pour ce fichier, le compte suit donc la frappe.
//! - `POST /tex/wordcount` : compte d'un extrait (la sélection).
//! - `POST /tex/manuscript/prefs` : légendes, notes de bas de page, limites
//!   de mots par section. Les réglages et la base du jour vivent sur disque,
//!   `.fig_thumbs/manuscript/<md5(racine)>.json` (piège connu n°1 : le
//!   `localStorage` du WebView ne survit pas à la relance).
//!
//! Règles du compte (proches de texcount) : seul le corps du document compte
//! (`\begin{document}` … `\end{document}` quand la racine les porte) ; les
//! titres, commandes, références, équations, tableaux, commentaires et la
//! bibliographie sont exclus ; les légendes et les notes de bas de page sont
//! des réglages. Un mot est un morceau entre blancs qui porte au moins une
//! lettre ou un chiffre (« 2002--2023 » et « light-absorbing » comptent pour
//! un).

use atelier_core::{atomic_write_text, find_tex_root, safe_project_path};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use md5::{Digest, Md5};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::{AppState, request_allowed};

const MAX_FILES: usize = 200;
const MAX_DEPTH: usize = 20;
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_TEXT_BYTES: usize = 5 * 1024 * 1024;
const MAX_TODO_TEXT: usize = 300;
const MAX_LIMITS: usize = 200;

#[derive(Clone, Copy, Debug)]
pub struct CountOptions {
    pub captions: bool,
    pub footnotes: bool,
}

impl Default for CountOptions {
    fn default() -> Self {
        Self { captions: true, footnotes: false }
    }
}

// ---------------------------------------------------------------------------
// Compte des mots
// ---------------------------------------------------------------------------

/// Environnements dont rien ne compte (formules, code, tableaux, figures TikZ,
/// bibliographie).
const SKIP_ENVS: &[&str] = &[
    "equation", "equation*", "align", "align*", "alignat", "alignat*", "gather", "gather*",
    "multline", "multline*", "eqnarray", "eqnarray*", "math", "displaymath", "flalign",
    "flalign*", "split", "verbatim", "verbatim*", "Verbatim", "lstlisting", "minted", "comment",
    "tikzpicture", "thebibliography", "tabular", "tabular*", "tabularx", "longtable", "array",
    "filecontents", "filecontents*",
];

/// Flottants : seule la légende compte (si le réglage le veut).
const FLOAT_ENVS: &[&str] = &[
    "figure", "figure*", "table", "table*", "wrapfigure", "wraptable", "sidewaysfigure",
    "sidewaystable", "subfigure", "subtable",
];

/// Arguments obligatoires à sauter après `\begin{env}` (largeurs, placements).
fn env_arity(env: &str) -> usize {
    match env {
        "minipage" | "multicols" | "subfigure" | "subtable" => 1,
        "wrapfigure" | "wraptable" => 2,
        _ => 0,
    }
}

/// Commandes retirées avec leurs arguments : (nom, nombre d'arguments `{}`).
fn drop_arity(name: &str) -> Option<usize> {
    Some(match name {
        "cite" | "citep" | "citet" | "citealp" | "citealt" | "citeauthor" | "citeyear"
        | "citeyearpar" | "parencite" | "textcite" | "autocite" | "footcite" | "nocite"
        | "Citep" | "Citet" | "Cite" | "ref" | "eqref" | "cref" | "Cref" | "autoref" | "pageref"
        | "nameref" | "label" | "url" | "includegraphics" | "input" | "include" | "subfile"
        | "bibliography" | "bibliographystyle" | "addbibresource" | "usepackage" | "RequirePackage"
        | "documentclass" | "todo" | "missingfigure" | "part" | "chapter" | "section"
        | "subsection" | "subsubsection" | "paragraph" | "subparagraph" | "title" | "author"
        | "date" | "thanks" | "affiliation" | "affil" | "address" | "email" | "keywords"
        | "vspace" | "hspace" | "vskip" | "hskip" | "color" | "pagecolor" | "hypersetup"
        | "graphicspath" | "pagestyle" | "thispagestyle" | "pagenumbering" | "linenumbers"
        | "includeonly" | "doi" | "orcid" | "correspondence" | "begin" | "end" | "verb" => 1,
        "setlength" | "addtolength" | "setcounter" | "addtocounter" | "newcommand"
        | "renewcommand" | "providecommand" | "DeclareMathOperator" | "definecolor"
        | "captionof" | "newtheorem" | "subimport" | "import" => 2,
        "newenvironment" | "renewenvironment" => 3,
        _ => return None,
    })
}

struct Walker<'a> {
    chars: &'a [char],
    opts: CountOptions,
    out: String,
}

impl Walker<'_> {
    fn skip_spaces(&self, mut i: usize) -> usize {
        while i < self.chars.len() && matches!(self.chars[i], ' ' | '\t' | '\n' | '\r') {
            i += 1;
        }
        i
    }

    /// Fin (exclusive) d'un groupe qui commence à `i` sur `open`.
    fn group_end(&self, i: usize, open: char, close: char) -> usize {
        let mut depth = 0usize;
        let mut j = i;
        while j < self.chars.len() {
            let c = self.chars[j];
            if c == '\\' {
                j += 2;
                continue;
            }
            if c == open {
                depth += 1;
            } else if c == close {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return j + 1;
                }
            }
            j += 1;
        }
        self.chars.len()
    }

    /// Saute les `[...]` qui suivent (sans blanc devant, comme LaTeX les lit).
    fn skip_optionals(&self, mut i: usize) -> usize {
        while i < self.chars.len() && self.chars[i] == '[' {
            i = self.group_end(i, '[', ']');
        }
        i
    }

    /// Argument `{...}` à partir de `i` (blancs permis devant) : (début du
    /// contenu, fin du contenu, position après l'argument).
    fn argument(&self, i: usize) -> Option<(usize, usize, usize)> {
        let j = self.skip_spaces(i);
        if j < self.chars.len() && self.chars[j] == '{' {
            let end = self.group_end(j, '{', '}');
            let inner_end = if end > j + 1 && self.chars.get(end - 1) == Some(&'}') { end - 1 } else { end };
            return Some((j + 1, inner_end, end));
        }
        None
    }

    fn skip_arguments(&self, mut i: usize, count: usize) -> usize {
        for _ in 0..count {
            i = self.skip_optionals(i);
            match self.argument(i) {
                Some((_, _, after)) => i = after,
                None => break,
            }
        }
        self.skip_optionals(i)
    }

    fn command_name(&self, i: usize) -> (String, usize) {
        // `i` pointe juste après la barre oblique.
        let mut j = i;
        while j < self.chars.len() && self.chars[j].is_ascii_alphabetic() {
            j += 1;
        }
        if j == i {
            return (self.chars.get(i).map(|c| c.to_string()).unwrap_or_default(), (i + 1).min(self.chars.len()));
        }
        let mut name: String = self.chars[i..j].iter().collect();
        if j < self.chars.len() && self.chars[j] == '*' {
            name.push('*');
            j += 1;
        }
        (name, j)
    }

    /// Cherche `\end{env}` qui ferme l'environnement ouvert avant `i`.
    fn env_end(&self, i: usize, env: &str) -> (usize, usize) {
        let begin: Vec<char> = format!("\\begin{{{env}}}").chars().collect();
        let end: Vec<char> = format!("\\end{{{env}}}").chars().collect();
        let mut depth = 1usize;
        let mut j = i;
        while j < self.chars.len() {
            if self.chars[j..].starts_with(&begin) {
                depth += 1;
                j += begin.len();
                continue;
            }
            if self.chars[j..].starts_with(&end) {
                depth -= 1;
                if depth == 0 {
                    return (j, j + end.len());
                }
                j += end.len();
                continue;
            }
            j += 1;
        }
        (self.chars.len(), self.chars.len())
    }

    fn push_space(&mut self) {
        if !self.out.ends_with(' ') {
            self.out.push(' ');
        }
    }

    /// Parcourt `[start, end)`. `emit` : le texte compte-t-il ici ?
    fn walk(&mut self, start: usize, end: usize, emit: bool) {
        let mut i = start;
        while i < end {
            let c = self.chars[i];
            match c {
                '\\' => {
                    if i + 1 >= end {
                        i += 1;
                        continue;
                    }
                    let next = self.chars[i + 1];
                    match next {
                        '[' => {
                            i = self.find_seq(i + 2, end, &['\\', ']']);
                            self.push_space();
                            continue;
                        }
                        '(' => {
                            i = self.find_seq(i + 2, end, &['\\', ')']);
                            self.push_space();
                            continue;
                        }
                        ',' | '!' => {
                            i += 2;
                            continue;
                        }
                        '\\' | ';' | ':' | ' ' | '\n' => {
                            self.push_space();
                            i += 2;
                            // `\\[2pt]` : l'espacement optionnel n'est pas du texte.
                            if next == '\\' {
                                i = self.skip_optionals(i);
                            }
                            continue;
                        }
                        c2 if !c2.is_ascii_alphabetic() => {
                            // `\%`, `\&`, `\_`, `\$`… : le caractère lui-même.
                            if emit {
                                self.out.push(c2);
                            }
                            i += 2;
                            continue;
                        }
                        _ => {}
                    }
                    let (name, after) = self.command_name(i + 1);
                    i = self.command(&name, after, end, emit);
                }
                '%' => {
                    while i < end && self.chars[i] != '\n' {
                        i += 1;
                    }
                }
                '$' => {
                    if i + 1 < end && self.chars[i + 1] == '$' {
                        i = self.find_seq(i + 2, end, &['$', '$']);
                    } else {
                        i = self.find_seq(i + 1, end, &['$']);
                    }
                    self.push_space();
                }
                '{' | '}' => i += 1,
                '~' => {
                    self.push_space();
                    i += 1;
                }
                _ => {
                    if emit {
                        self.out.push(c);
                    } else if c.is_whitespace() {
                        self.push_space();
                    }
                    i += 1;
                }
            }
        }
    }

    /// Position juste après la séquence `seq` (non échappée) à partir de `i`.
    fn find_seq(&self, mut i: usize, end: usize, seq: &[char]) -> usize {
        while i < end {
            if self.chars[i] == '\\' && seq[0] != '\\' {
                i += 2;
                continue;
            }
            if self.chars[i..end].starts_with(seq) {
                return i + seq.len();
            }
            i += 1;
        }
        end
    }

    fn command(&mut self, name: &str, after: usize, end: usize, emit: bool) -> usize {
        match name {
            "begin" => {
                let Some((s, e, next)) = self.argument(after) else { return after };
                let env: String = self.chars[s..e].iter().collect();
                let env = env.trim().to_string();
                if SKIP_ENVS.contains(&env.as_str()) {
                    let (_, past) = self.env_end(next, &env);
                    self.push_space();
                    return past;
                }
                let next = self.skip_arguments(self.skip_optionals(next), env_arity(&env));
                if FLOAT_ENVS.contains(&env.as_str()) {
                    let (inner_end, past) = self.env_end(next, &env);
                    let inner_end = inner_end.min(end);
                    self.push_space();
                    // Seules les légendes parlent dans un flottant.
                    self.walk(next, inner_end, false);
                    self.push_space();
                    return past;
                }
                self.push_space();
                next
            }
            "end" => {
                self.push_space();
                self.argument(after).map(|(_, _, next)| next).unwrap_or(after)
            }
            "verb" | "verb*" => {
                // \verb|...| : le délimiteur est le premier caractère.
                let Some(&delim) = self.chars.get(after) else { return after };
                let mut j = after + 1;
                while j < end && self.chars[j] != delim {
                    j += 1;
                }
                self.push_space();
                (j + 1).min(end)
            }
            "caption" | "caption*" => self.text_argument(after, emit_or(self.opts.captions)),
            "footnote" | "footnotetext" => self.text_argument(after, emit && self.opts.footnotes),
            "href" => {
                let next = self.skip_arguments(after, 1);
                self.text_argument(next, emit)
            }
            "textcolor" | "colorbox" => {
                let next = self.skip_arguments(after, 1);
                self.text_argument(next, emit)
            }
            _ => {
                let base = name.trim_end_matches('*');
                if let Some(arity) = drop_arity(base) {
                    self.push_space();
                    return self.skip_arguments(after, arity);
                }
                // Commande inconnue (\emph, \textbf, \SI…) : son nom part,
                // ses options aussi, ses arguments restent du texte.
                self.skip_optionals(after)
            }
        }
    }

    fn text_argument(&mut self, after: usize, emit: bool) -> usize {
        let i = self.skip_optionals(after);
        match self.argument(i) {
            Some((s, e, next)) => {
                self.push_space();
                self.walk(s, e, emit);
                self.push_space();
                next
            }
            None => i,
        }
    }
}

/// Une légende compte si le réglage le veut, même dans un flottant (où le
/// texte courant, lui, ne compte pas).
fn emit_or(captions: bool) -> bool {
    captions
}

/// Texte lisible d'un extrait LaTeX (ce qui compte comme prose).
pub fn prose(tex: &str, opts: CountOptions) -> String {
    let chars: Vec<char> = tex.chars().collect();
    let mut walker = Walker { chars: &chars, opts, out: String::with_capacity(tex.len()) };
    walker.walk(0, chars.len(), true);
    walker.out
}

fn count_tokens(text: &str) -> usize {
    text.split_whitespace()
        .filter(|token| token.chars().any(char::is_alphanumeric))
        .count()
}

/// Nombre de mots d'un extrait LaTeX.
pub fn count_words(tex: &str, opts: CountOptions) -> usize {
    count_tokens(&prose(tex, opts))
}

// ---------------------------------------------------------------------------
// Lignes, commentaires, inclusions
// ---------------------------------------------------------------------------

/// Index (en octets) du premier `%` non échappé de la ligne.
fn comment_start(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'%' => return Some(i),
            _ => i += 1,
        }
    }
    None
}

fn strip_comment(line: &str) -> &str {
    match comment_start(line) {
        Some(index) => &line[..index],
        None => line,
    }
}

/// Premier `\name{arg}` de la ligne (sans commentaire) pour une liste de
/// noms : (nom, étoilé, argument, position de la barre, fin de l'appel).
fn find_command<'a>(line: &'a str, names: &[&str]) -> Option<(String, bool, &'a str, usize, usize)> {
    let mut from = 0;
    while let Some(rel) = line[from..].find('\\') {
        let at = from + rel;
        let rest = &line[at + 1..];
        let name_len = rest.bytes().take_while(u8::is_ascii_alphabetic).count();
        let name = &rest[..name_len];
        if names.contains(&name) {
            let mut cursor = at + 1 + name_len;
            let starred = line[cursor..].starts_with('*');
            if starred {
                cursor += 1;
            }
            // options
            while line[cursor..].starts_with('[') {
                match line[cursor..].find(']') {
                    Some(close) => cursor += close + 1,
                    None => break,
                }
            }
            let trimmed = line[cursor..].trim_start();
            cursor = line.len() - trimmed.len();
            if trimmed.starts_with('{') {
                let mut depth = 0usize;
                let mut end = None;
                for (offset, ch) in trimmed.char_indices() {
                    match ch {
                        '{' => depth += 1,
                        '}' => {
                            depth -= 1;
                            if depth == 0 {
                                end = Some(offset);
                                break;
                            }
                        }
                        _ => {}
                    }
                }
                let (arg, stop) = match end {
                    Some(close) => (&trimmed[1..close], cursor + close + 1),
                    None => (&trimmed[1..], line.len()),
                };
                return Some((name.to_string(), starred, arg, at, stop));
            }
        }
        // Pas de nom (`\\`, `\é`…) : avancer d'un caractère entier.
        let step = if name_len > 0 { name_len } else { rest.chars().next().map_or(0, char::len_utf8) };
        from = at + 1 + step;
        if from >= line.len() {
            break;
        }
    }
    None
}

#[derive(Debug)]
struct SourceLine {
    file: usize,
    line: usize,
    text: String,
}

struct Flattener<'a> {
    project: &'a Path,
    root_dir: PathBuf,
    override_path: Option<PathBuf>,
    override_text: Option<&'a str>,
    files: Vec<PathBuf>,
    seen: HashSet<PathBuf>,
    lines: Vec<SourceLine>,
}

impl Flattener<'_> {
    fn read(&self, path: &Path) -> Option<String> {
        if self.override_path.as_deref() == Some(path)
            && let Some(text) = self.override_text
        {
            return Some(text.to_string());
        }
        let meta = fs::metadata(path).ok()?;
        if meta.len() > MAX_FILE_BYTES {
            return None;
        }
        fs::read_to_string(path).ok()
    }

    fn resolve_include(&self, arg: &str) -> Option<PathBuf> {
        let arg = arg.trim();
        if arg.is_empty() {
            return None;
        }
        let base = self.root_dir.join(arg);
        let mut candidates = vec![base.clone()];
        if base.extension().is_none_or(|ext| ext != "tex") {
            let mut with_ext = base.into_os_string();
            with_ext.push(".tex");
            candidates.insert(0, PathBuf::from(with_ext));
        }
        candidates.into_iter().find_map(|candidate| {
            if !candidate.is_file() {
                return None;
            }
            safe_project_path(self.project, &candidate.to_string_lossy()).ok()
        })
    }

    fn visit(&mut self, path: PathBuf, depth: usize) {
        if depth > MAX_DEPTH || self.files.len() >= MAX_FILES || !self.seen.insert(path.clone()) {
            return;
        }
        let Some(text) = self.read(&path) else { return };
        let file = self.files.len();
        self.files.push(path);
        for (index, raw) in text.lines().enumerate() {
            let code = strip_comment(raw);
            if let Some((_, _, arg, at, stop)) = find_command(code, &["input", "include", "subfile"]) {
                // La ligne garde ce qui entoure l'inclusion ; le fichier
                // inclus s'insère juste après elle.
                let mut kept = String::with_capacity(raw.len());
                kept.push_str(&raw[..at]);
                kept.push(' ');
                kept.push_str(&raw[stop..]);
                self.lines.push(SourceLine { file, line: index, text: kept });
                if let Some(target) = self.resolve_include(arg) {
                    self.visit(target, depth + 1);
                }
                continue;
            }
            self.lines.push(SourceLine { file, line: index, text: raw.to_string() });
        }
    }
}

// ---------------------------------------------------------------------------
// Choses à faire
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
pub struct Todo {
    pub kind: String,
    pub text: String,
}

fn clip(text: &str) -> String {
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() <= MAX_TODO_TEXT {
        return text;
    }
    let mut cut: String = text.chars().take(MAX_TODO_TEXT).collect();
    cut.push('…');
    cut
}

/// Les marques d'une ligne : `% TODO …`, `% FIXME …`, `% XXX …` en tête de
/// commentaire, `\todo{…}` et `\missingfigure{…}` dans le code.
pub fn scan_todos(line: &str) -> Vec<Todo> {
    let mut found = Vec::new();
    let code = strip_comment(line);
    let mut rest = code;
    while let Some((name, _, arg, _, stop)) = find_command(rest, &["todo", "missingfigure"]) {
        found.push(Todo { kind: format!("\\{name}"), text: clip(arg) });
        rest = &rest[stop..];
    }
    if let Some(start) = comment_start(line) {
        let comment = line[start..].trim_start_matches('%').trim_start();
        for keyword in ["TODO", "FIXME", "XXX"] {
            if let Some(after) = comment.strip_prefix(keyword) {
                let boundary = after.chars().next().is_none_or(|c| !c.is_alphanumeric() && c != '_');
                if !boundary {
                    continue;
                }
                // « TODO(thierry): … », « TODO : … », « TODO - … »
                let mut text = after.trim_start();
                if text.starts_with('(')
                    && let Some(close) = text.find(')')
                {
                    text = text[close + 1..].trim_start();
                }
                let text = text.trim_start_matches([':', '-', '–', '—']).trim_start();
                found.push(Todo { kind: keyword.to_string(), text: clip(text) });
                break;
            }
        }
    }
    found
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct Bucket {
    key: String,
    title: String,
    number: Option<String>,
    kind: &'static str,
    file: usize,
    line: usize,
    text: String,
}

fn letters(index: usize) -> String {
    let mut n = index;
    let mut out = String::new();
    loop {
        out.insert(0, (b'A' + (n % 26) as u8) as char);
        if n < 26 {
            break;
        }
        n = n / 26 - 1;
    }
    out
}

fn clean_title(arg: &str) -> String {
    let opts = CountOptions { captions: true, footnotes: false };
    prose(arg, opts).split_whitespace().collect::<Vec<_>>().join(" ")
}

pub struct Stats {
    pub value: Value,
    pub total: usize,
}

/// Compte du manuscrit déplié depuis `root`.
fn manuscript_stats(
    project: &Path,
    root: &Path,
    current: &Path,
    override_text: Option<&str>,
    opts: CountOptions,
    limits: &Map<String, Value>,
) -> Stats {
    let mut flat = Flattener {
        project,
        root_dir: root.parent().map(Path::to_path_buf).unwrap_or_default(),
        override_path: Some(current.to_path_buf()),
        override_text,
        files: Vec::new(),
        seen: HashSet::new(),
        lines: Vec::new(),
    };
    flat.visit(root.to_path_buf(), 0);
    let lines = flat.lines;
    let files = flat.files;

    // Corps du document : seulement si la racine le délimite.
    let begin = lines.iter().position(|l| strip_comment(&l.text).contains("\\begin{document}"));
    let finish = lines.iter().position(|l| strip_comment(&l.text).contains("\\end{document}"));
    let body_start = begin.map(|i| i + 1).unwrap_or(0);
    let body_end = finish.filter(|&end| end >= body_start).unwrap_or(lines.len());
    let top = if lines[body_start..body_end]
        .iter()
        .any(|l| find_command(strip_comment(&l.text), &["chapter"]).is_some())
    {
        "chapter"
    } else {
        "section"
    };

    let mut buckets: Vec<Bucket> = vec![Bucket {
        key: "front".into(),
        title: "Avant la première section".into(),
        number: None,
        kind: "front",
        file: lines.get(body_start).map(|l| l.file).unwrap_or(0),
        line: lines.get(body_start).map(|l| l.line).unwrap_or(0),
        text: String::new(),
    }];
    let mut current_bucket = 0usize;
    let mut before_abstract = 0usize;
    let mut numbered = 0usize;
    let mut appendix: Option<usize> = None;
    // (fichier, ligne, section) à chaque changement ; -1 = préambule.
    let mut marks: Vec<(usize, usize, i64)> = Vec::new();
    let mut last_mark: Option<(usize, i64)> = None;
    let mut todos: Vec<Value> = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        let in_body = index >= body_start && index < body_end;
        let code = strip_comment(&line.text);
        if in_body {
            if code.contains("\\appendix") {
                appendix = Some(0);
            }
            if let Some((_, starred, arg, _, _)) = find_command(code, &[top]) {
                let title = clean_title(arg);
                let number = if starred {
                    None
                } else if let Some(count) = appendix.as_mut() {
                    *count += 1;
                    Some(letters(*count - 1))
                } else {
                    numbered += 1;
                    Some(numbered.to_string())
                };
                buckets.push(Bucket {
                    key: title.clone(),
                    title,
                    number,
                    kind: top,
                    file: line.file,
                    line: line.line,
                    text: String::new(),
                });
                current_bucket = buckets.len() - 1;
            } else if code.contains("\\begin{abstract}") {
                before_abstract = current_bucket;
                buckets.push(Bucket {
                    key: "abstract".into(),
                    title: "Résumé".into(),
                    number: None,
                    kind: "abstract",
                    file: line.file,
                    line: line.line,
                    text: String::new(),
                });
                current_bucket = buckets.len() - 1;
            }
        }
        let section = if in_body { current_bucket as i64 } else { -1 };
        if last_mark != Some((line.file, section)) {
            marks.push((line.file, line.line, section));
            last_mark = Some((line.file, section));
        }
        if in_body {
            let bucket = &mut buckets[current_bucket];
            bucket.text.push_str(&line.text);
            bucket.text.push('\n');
            if buckets[current_bucket].kind == "abstract" && code.contains("\\end{abstract}") {
                current_bucket = before_abstract;
            }
        }
        for todo in scan_todos(&line.text) {
            todos.push(json!({
                "file": line.file,
                "line": line.line + 1,
                "kind": todo.kind,
                "text": todo.text,
                "section": section,
            }));
        }
    }

    let mut total = 0usize;
    let mut sections = Vec::new();
    for (index, bucket) in buckets.iter().enumerate() {
        let words = count_words(&bucket.text, opts);
        total += words;
        if index == 0 && words == 0 {
            // L'avant-première-section vide n'a rien à dire.
            sections.push(Value::Null);
            continue;
        }
        sections.push(json!({
            "key": bucket.key,
            "title": bucket.title,
            "number": bucket.number,
            "kind": bucket.kind,
            "words": words,
            "limit": limits.get(&bucket.key).and_then(Value::as_u64),
            "file": bucket.file,
            "line": bucket.line,
        }));
    }
    let files_json: Vec<Value> = files
        .iter()
        .map(|path| {
            json!({
                "rel": path.strip_prefix(project).unwrap_or(path).to_string_lossy(),
                "path": path.to_string_lossy(),
                "current": path == current,
            })
        })
        .collect();
    let marks_json: Vec<Value> = marks
        .into_iter()
        .map(|(file, line, section)| json!([file, line, section]))
        .collect();
    Stats {
        total,
        value: json!({
            "root": root.strip_prefix(project).unwrap_or(root).to_string_lossy(),
            "total": total,
            "sections": sections,
            "files": files_json,
            "marks": marks_json,
            "todos": todos,
            "captions": opts.captions,
            "footnotes": opts.footnotes,
        }),
    }
}

// ---------------------------------------------------------------------------
// Réglages et base du jour (disque)
// ---------------------------------------------------------------------------

fn prefs_file(project: &Path, root: &Path) -> PathBuf {
    let mut hasher = Md5::new();
    hasher.update(root.to_string_lossy().as_bytes());
    project
        .join(".fig_thumbs")
        .join("manuscript")
        .join(format!("{}.json", hex::encode(hasher.finalize())))
}

fn read_prefs(file: &Path) -> Map<String, Value> {
    fs::read(file)
        .ok()
        .and_then(|raw| serde_json::from_slice::<Value>(&raw).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

fn write_prefs(file: &Path, prefs: &Map<String, Value>) -> bool {
    if let Some(parent) = file.parent()
        && fs::create_dir_all(parent).is_err()
    {
        return false;
    }
    atomic_write_text(file, &Value::Object(prefs.clone()).to_string()).is_ok()
}

fn options_from(prefs: &Map<String, Value>) -> CountOptions {
    let defaults = CountOptions::default();
    CountOptions {
        captions: prefs.get("captions").and_then(Value::as_bool).unwrap_or(defaults.captions),
        footnotes: prefs.get("footnotes").and_then(Value::as_bool).unwrap_or(defaults.footnotes),
    }
}

fn valid_day(day: &str) -> bool {
    day.len() == 10
        && day.bytes().enumerate().all(|(i, b)| if i == 4 || i == 7 { b == b'-' } else { b.is_ascii_digit() })
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"ok": false, "error": message.into()}))).into_response()
}

#[derive(Deserialize)]
pub struct ManuscriptBody {
    path: String,
    #[serde(default)]
    text: Option<String>,
    /// Date locale du client (AAAA-MM-JJ) : le serveur ne connaît pas le
    /// fuseau de l'utilisateur.
    #[serde(default)]
    day: Option<String>,
}

/// Racine et fichier courant, tous deux sous le projet.
fn locate(state: &AppState, path: &str) -> Result<(PathBuf, PathBuf), axum::response::Response> {
    let current = safe_project_path(&state.root, path)
        .map_err(|_| json_error(StatusCode::FORBIDDEN, "outside the project"))?;
    let root = find_tex_root(&current);
    let root = safe_project_path(&state.root, &root.to_string_lossy())
        .map_err(|_| json_error(StatusCode::FORBIDDEN, "root outside the project"))?;
    Ok((root, current))
}

fn project_dir(state: &AppState) -> PathBuf {
    fs::canonicalize(&state.root).unwrap_or_else(|_| state.root.clone())
}

pub async fn manuscript(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ManuscriptBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if body.text.as_ref().is_some_and(|text| text.len() > MAX_TEXT_BYTES) {
        return json_error(StatusCode::PAYLOAD_TOO_LARGE, "text too large");
    }
    let (root, current) = match locate(&state, &body.path) {
        Ok(found) => found,
        Err(response) => return response,
    };
    let project = project_dir(&state);
    let result = tokio::task::spawn_blocking(move || {
        let file = prefs_file(&project, &root);
        let mut prefs = read_prefs(&file);
        let limits = prefs.get("limits").and_then(Value::as_object).cloned().unwrap_or_default();
        let stats = manuscript_stats(&project, &root, &current, body.text.as_deref(), options_from(&prefs), &limits);
        let mut value = stats.value;
        if let Some(day) = body.day.as_deref().filter(|day| valid_day(day)) {
            let same_day = prefs.get("day").and_then(Value::as_str) == Some(day);
            let base = prefs.get("dayBase").and_then(Value::as_u64);
            let base = match (same_day, base) {
                (true, Some(base)) => base,
                _ => {
                    prefs.insert("root".into(), json!(root.to_string_lossy()));
                    prefs.insert("day".into(), json!(day));
                    prefs.insert("dayBase".into(), json!(stats.total));
                    write_prefs(&file, &prefs);
                    stats.total as u64
                }
            };
            value["today"] = json!(stats.total as i64 - base as i64);
        }
        value["ok"] = json!(true);
        value
    })
    .await;
    match result {
        Ok(value) => (StatusCode::OK, Json(value)).into_response(),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "count failed"),
    }
}

#[derive(Deserialize)]
pub struct WordCountBody {
    text: String,
}

/// Compte d'un extrait (la sélection) : légendes et notes comptent, puisque
/// c'est l'utilisateur qui a choisi le passage.
pub async fn wordcount(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<WordCountBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if body.text.len() > MAX_TEXT_BYTES {
        return json_error(StatusCode::PAYLOAD_TOO_LARGE, "text too large");
    }
    let words = count_words(&body.text, CountOptions { captions: true, footnotes: true });
    (StatusCode::OK, Json(json!({"ok": true, "words": words}))).into_response()
}

#[derive(Deserialize)]
pub struct PrefsBody {
    path: String,
    #[serde(default)]
    captions: Option<bool>,
    #[serde(default)]
    footnotes: Option<bool>,
    /// Limite par section (clé = `key` de la section) ; `null` ou 0 la retire.
    #[serde(default)]
    limits: Option<BTreeMap<String, Option<u64>>>,
}

pub async fn prefs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<PrefsBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let (root, _) = match locate(&state, &body.path) {
        Ok(found) => found,
        Err(response) => return response,
    };
    let project = project_dir(&state);
    let file = prefs_file(&project, &root);
    let mut prefs = read_prefs(&file);
    prefs.insert("root".into(), json!(root.to_string_lossy()));
    if let Some(captions) = body.captions {
        prefs.insert("captions".into(), json!(captions));
    }
    if let Some(footnotes) = body.footnotes {
        prefs.insert("footnotes".into(), json!(footnotes));
    }
    if let Some(changes) = body.limits {
        let mut limits = prefs.get("limits").and_then(Value::as_object).cloned().unwrap_or_default();
        for (key, limit) in changes {
            let key: String = key.chars().take(200).collect();
            match limit.filter(|&n| n > 0) {
                Some(n) if limits.len() < MAX_LIMITS || limits.contains_key(&key) => {
                    limits.insert(key, json!(n.min(1_000_000)));
                }
                Some(_) => {}
                None => {
                    limits.remove(&key);
                }
            }
        }
        prefs.insert("limits".into(), Value::Object(limits));
    }
    if !write_prefs(&file, &prefs) {
        return json_error(StatusCode::INTERNAL_SERVER_ERROR, "prefs not saved");
    }
    (StatusCode::OK, Json(json!({"ok": true}))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(tex: &str) -> usize {
        count_words(tex, CountOptions::default())
    }

    #[test]
    fn plain_prose_counts_words_and_hyphenated_compounds_once() {
        assert_eq!(words("Wildfire smoke deposits light-absorbing particles."), 5);
        assert_eq!(words("for 2002--2023 over 1\\,200 glaciers"), 5);
        assert_eq!(words("-- --- , ."), 0);
    }

    #[test]
    fn commands_references_and_math_are_not_words() {
        assert_eq!(words("in western Canada \\citep{hall2021}."), 3);
        assert_eq!(words("Figure~\\ref{fig:cycle} shows the cycle"), 4);
        assert_eq!(words("an \\emph{important} result"), 3);
        assert_eq!(words("where $a = b + c$ holds and \\(x\\) too"), 4);
        assert_eq!(words("before \\[ E = mc^2 \\] after"), 2);
        assert_eq!(words("a\n\\begin{equation}\nx = y\n\\end{equation}\nb"), 2);
        assert_eq!(words("a \\begin{align*} x &= y \\\\ z &= w \\end{align*} b"), 2);
        assert_eq!(words("text % a comment with words\nmore"), 2);
        assert_eq!(words("costs 5\\% more"), 3);
        assert_eq!(words("\\section{Data and methods}\nWe use"), 2);
    }

    #[test]
    fn floats_count_only_their_caption_when_asked() {
        let fig = "\\begin{figure}[t]\n\\centering\n\\includegraphics[width=\\linewidth]{fig/cycle.pdf}\n\\caption{Seasonal cycle of albedo.}\n\\label{fig:cycle}\n\\end{figure}";
        assert_eq!(count_words(fig, CountOptions { captions: true, footnotes: false }), 4);
        assert_eq!(count_words(fig, CountOptions { captions: false, footnotes: false }), 0);
        let table = "\\begin{table}\\caption{Sites}\\begin{tabular}{lr} a & 1 \\\\ \\end{tabular}\\end{table} after";
        assert_eq!(count_words(table, CountOptions::default()), 2);
    }

    #[test]
    fn footnotes_follow_the_setting() {
        let tex = "Albedo drops\\footnote{See the appendix for details.} sharply.";
        assert_eq!(count_words(tex, CountOptions { captions: true, footnotes: false }), 3);
        assert_eq!(count_words(tex, CountOptions { captions: true, footnotes: true }), 8);
    }

    #[test]
    fn todo_markers_are_found_in_comments_and_commands() {
        assert_eq!(
            scan_todos("% TODO ajouter la référence du seuil de 0,02 (Williamson ?)"),
            vec![Todo { kind: "TODO".into(), text: "ajouter la référence du seuil de 0,02 (Williamson ?)".into() }]
        );
        assert_eq!(scan_todos("  % FIXME: légende trop longue")[0].text, "légende trop longue");
        assert_eq!(scan_todos("text % XXX vérifier")[0].kind, "XXX");
        assert_eq!(scan_todos("\\todo[inline]{Préciser la résolution {FireWork}}")[0].text, "Préciser la résolution {FireWork}");
        assert_eq!(scan_todos("\\missingfigure{Sensibilité au seuil}")[0].kind, "\\missingfigure");
        assert!(scan_todos("% TODOS ne compte pas").is_empty());
        assert!(scan_todos("% je note un TODO plus loin").is_empty());
        assert!(scan_todos("costs 5\\% TODO no").is_empty());
        assert!(scan_todos("% \\todo{commenté}").is_empty());
    }

    #[test]
    fn manuscript_follows_inputs_and_splits_by_section() {
        let dir = tempfile::tempdir().unwrap();
        let project = fs::canonicalize(dir.path()).unwrap();
        fs::create_dir_all(project.join("sections")).unwrap();
        fs::write(
            project.join("main.tex"),
            "\\documentclass{article}\n% TODO dans le préambule\n\\title{Ignored title words}\n\\begin{document}\n\\maketitle\n\\begin{abstract}\nGlacier albedo drops after fires.\n\\end{abstract}\n\\section{Introduction}\nOne two three.\n\\input{sections/discussion}\n\\appendix\n\\section{Extra}\nFour five.\n\\end{document}\nAfter end ignored.\n",
        )
        .unwrap();
        fs::write(
            project.join("sections/discussion.tex"),
            "\\section*{Discussion}\nSix seven eight nine.\n\\todo{Comparer avec Aubry-Wake}\n",
        )
        .unwrap();
        let root = project.join("main.tex");
        let current = project.join("sections/discussion.tex");
        let stats = manuscript_stats(&project, &root, &current, None, CountOptions::default(), &Map::new());
        let value = stats.value;
        assert_eq!(value["total"], 5 + 3 + 4 + 2);
        let sections: Vec<&Value> = value["sections"].as_array().unwrap().iter().filter(|s| !s.is_null()).collect();
        let titles: Vec<String> = sections
            .iter()
            .map(|s| format!("{}|{}|{}", s["number"].as_str().unwrap_or("-"), s["title"].as_str().unwrap(), s["words"]))
            .collect();
        assert_eq!(titles, vec!["-|Résumé|5", "1|Introduction|3", "-|Discussion|4", "A|Extra|2"]);
        let todos = value["todos"].as_array().unwrap();
        assert_eq!(todos.len(), 2);
        assert_eq!(todos[0]["section"], -1);
        assert_eq!(todos[1]["kind"], "\\todo");
        assert_eq!(todos[1]["line"], 3);
        let files = value["files"].as_array().unwrap();
        assert_eq!(files[1]["rel"], "sections/discussion.tex");
        assert_eq!(files[1]["current"], true);
        assert_eq!(todos[1]["file"], 1);
    }

    #[test]
    fn unsaved_text_replaces_the_disk_for_the_open_file() {
        let dir = tempfile::tempdir().unwrap();
        let project = fs::canonicalize(dir.path()).unwrap();
        fs::write(project.join("main.tex"), "\\begin{document}\nOne.\n\\end{document}\n").unwrap();
        let root = project.join("main.tex");
        let stats = manuscript_stats(
            &project,
            &root,
            &root,
            Some("\\begin{document}\nOne two three.\n\\end{document}\n"),
            CountOptions::default(),
            &Map::new(),
        );
        assert_eq!(stats.total, 3);
    }

    #[test]
    fn appendix_letters_go_past_z() {
        assert_eq!(letters(0), "A");
        assert_eq!(letters(25), "Z");
        assert_eq!(letters(26), "AA");
    }
}
