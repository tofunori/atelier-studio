//! Équations de Word (OMML) ↔ LaTeX.
//!
//! Lecture : chaque `m:oMath` devient une chaîne LaTeX que le panneau
//! affiche avec KaTeX et que l'on corrige comme dans un .tex. Écriture : le
//! LaTeX corrigé redevient de l'OMML que Word ouvre et modifie normalement.
//! Le sous-ensemble couvre ce qu'on écrit dans un article : indices,
//! exposants, fractions, racines, sommes et intégrales, délimiteurs,
//! accents, fonctions, matrices et lignes alignées. La mise en forme fine
//! d'une équation (police, couleur) n'est pas gardée quand on la réécrit.

use crate::xml::{M, escape_text};
use roxmltree::Node;

/// Lettres grecques et symboles : Unicode (OMML) ↔ commande LaTeX.
const SYMBOLS: &[(&str, &str)] = &[
    ("α", "alpha"), ("β", "beta"), ("γ", "gamma"), ("δ", "delta"), ("ε", "epsilon"), ("ϵ", "varepsilon"),
    ("ζ", "zeta"), ("η", "eta"), ("θ", "theta"), ("ϑ", "vartheta"), ("ι", "iota"), ("κ", "kappa"),
    ("λ", "lambda"), ("μ", "mu"), ("ν", "nu"), ("ξ", "xi"), ("π", "pi"), ("ρ", "rho"), ("σ", "sigma"),
    ("τ", "tau"), ("υ", "upsilon"), ("φ", "phi"), ("ϕ", "varphi"), ("χ", "chi"), ("ψ", "psi"), ("ω", "omega"),
    ("Γ", "Gamma"), ("Δ", "Delta"), ("Θ", "Theta"), ("Λ", "Lambda"), ("Ξ", "Xi"), ("Π", "Pi"), ("Σ", "Sigma"),
    ("Υ", "Upsilon"), ("Φ", "Phi"), ("Ψ", "Psi"), ("Ω", "Omega"),
    ("∞", "infty"), ("∂", "partial"), ("∇", "nabla"), ("±", "pm"), ("∓", "mp"), ("×", "times"), ("÷", "div"),
    ("·", "cdot"), ("⋅", "cdot"), ("≤", "leq"), ("≥", "geq"), ("≠", "neq"), ("≈", "approx"), ("≡", "equiv"),
    ("∝", "propto"), ("∼", "sim"), ("→", "to"), ("←", "leftarrow"), ("⇒", "Rightarrow"), ("⇔", "Leftrightarrow"),
    ("∈", "in"), ("∉", "notin"), ("⊂", "subset"), ("⊆", "subseteq"), ("∪", "cup"), ("∩", "cap"), ("∀", "forall"),
    ("∃", "exists"), ("°", "circ"), ("…", "ldots"), ("⋯", "cdots"), ("ℓ", "ell"), ("ℝ", "mathbb{R}"),
];

const NARY: &[(&str, &str)] = &[("∑", "sum"), ("∏", "prod"), ("∫", "int"), ("∬", "iint"), ("∭", "iiint"), ("∮", "oint"), ("⋃", "bigcup"), ("⋂", "bigcap")];
const ACCENTS: &[(&str, &str)] = &[("\u{302}", "hat"), ("\u{303}", "tilde"), ("\u{304}", "bar"), ("\u{305}", "bar"), ("\u{307}", "dot"), ("\u{308}", "ddot"), ("\u{20D7}", "vec")];
const FUNCS: &[&str] = &["sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "exp", "lim", "max", "min", "sup", "inf", "det", "arg"];

// ------------------------------------------------------------ OMML → LaTeX

fn is_m(n: Node, name: &str) -> bool {
    n.is_element() && n.tag_name().namespace() == Some(M) && n.tag_name().name() == name
}

fn child<'a, 'i>(n: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    n.children().find(|c| is_m(*c, name))
}

fn val(n: Option<Node>, prop: &str) -> Option<String> {
    let p = n?.children().find(|c| is_m(*c, prop))?;
    p.attribute((M, "val")).map(str::to_string)
}

fn sym_to_latex(text: &str) -> String {
    let mut out = String::new();
    for ch in text.chars() {
        let s = ch.to_string();
        match SYMBOLS.iter().find(|(u, _)| *u == s) {
            Some((_, cmd)) => {
                out.push('\\');
                out.push_str(cmd);
                out.push(' ');
            }
            None => match ch {
                '{' | '}' | '%' | '#' | '&' | '_' | '$' => {
                    out.push('\\');
                    out.push(ch);
                }
                '\u{2009}' => out.push_str("\\,"),
                '\u{2003}' => out.push_str("\\quad "),
                _ => out.push(ch),
            },
        }
    }
    out
}

/// Une base courte se passe d'accolades : `x_1`, `\rho_1`.
fn atom(s: &str) -> String {
    let t = s.trim();
    let single = t.chars().count() == 1 || (t.starts_with('\\') && t[1..].chars().all(|c| c.is_ascii_alphabetic()) && t.len() > 1);
    if single { t.to_string() } else { format!("{{{t}}}") }
}

fn arg(n: Option<Node>) -> String {
    n.map(seq).unwrap_or_default().trim().to_string()
}

fn seq(n: Node) -> String {
    let mut out = String::new();
    for c in n.children().filter(|c| c.is_element()) {
        let s = elem(c);
        // Deux commandes collées : garder l'espace qui les sépare.
        if out.ends_with(|ch: char| ch.is_ascii_alphabetic()) && out.contains('\\') && s.starts_with(|ch: char| ch.is_ascii_alphabetic()) {
            let tail = out.rsplit('\\').next().unwrap_or("");
            if tail.chars().all(|ch| ch.is_ascii_alphabetic()) {
                out.push(' ');
            }
        }
        out.push_str(&s);
    }
    out
}

fn elem(n: Node) -> String {
    if n.tag_name().namespace() != Some(M) {
        // w:r dans une équation (texte ordinaire), suivis : on lit le texte.
        return n.descendants().filter(|d| d.tag_name().name() == "t").filter_map(|d| d.text()).collect::<String>();
    }
    match n.tag_name().name() {
        "r" => {
            let text: String = n.children().filter(|c| is_m(*c, "t")).filter_map(|c| c.text()).collect();
            let plain = val(child(n, "rPr"), "sty").as_deref() == Some("p") || child(n, "rPr").and_then(|p| child(p, "nor")).is_some();
            let word = text.chars().all(|c| c.is_ascii_alphabetic()) && text.len() > 1;
            if plain && word && FUNCS.contains(&text.as_str()) {
                format!("\\{text} ")
            } else if plain && word {
                format!("\\mathrm{{{text}}}")
            } else if child(n, "rPr").and_then(|p| child(p, "nor")).is_some() && !text.trim().is_empty() {
                format!("\\text{{{}}}", text.replace(['{', '}'], ""))
            } else {
                sym_to_latex(&text)
            }
        }
        "sSub" => format!("{}_{{{}}}", atom(&arg(child(n, "e"))), arg(child(n, "sub"))),
        "sSup" => format!("{}^{{{}}}", atom(&arg(child(n, "e"))), arg(child(n, "sup"))),
        "sSubSup" => format!("{}_{{{}}}^{{{}}}", atom(&arg(child(n, "e"))), arg(child(n, "sub")), arg(child(n, "sup"))),
        "sPre" => format!("{{}}_{{{}}}^{{{}}}{}", arg(child(n, "sub")), arg(child(n, "sup")), atom(&arg(child(n, "e")))),
        "f" => {
            if val(child(n, "fPr"), "type").as_deref() == Some("lin") {
                format!("{}/{}", atom(&arg(child(n, "num"))), atom(&arg(child(n, "den"))))
            } else {
                format!("\\frac{{{}}}{{{}}}", arg(child(n, "num")), arg(child(n, "den")))
            }
        }
        "rad" => {
            let hide = val(child(n, "radPr"), "degHide").is_some_and(|v| v == "1" || v == "on" || v == "true");
            let deg = arg(child(n, "deg"));
            if hide || deg.is_empty() { format!("\\sqrt{{{}}}", arg(child(n, "e"))) } else { format!("\\sqrt[{deg}]{{{}}}", arg(child(n, "e"))) }
        }
        "d" => {
            let pr = child(n, "dPr");
            let beg = val(pr, "begChr").unwrap_or_else(|| "(".into());
            let end = val(pr, "endChr").unwrap_or_else(|| ")".into());
            let sep = val(pr, "sepChr").unwrap_or_else(|| "|".into());
            let parts: Vec<String> = n.children().filter(|c| is_m(*c, "e")).map(seq).collect();
            let delim = |c: &str| match c {
                "" => ".".to_string(),
                "{" => "\\{".into(),
                "}" => "\\}".into(),
                "⟨" | "〈" => "\\langle".into(),
                "⟩" | "〉" => "\\rangle".into(),
                "‖" => "\\|".into(),
                "⌊" => "\\lfloor".into(),
                "⌋" => "\\rfloor".into(),
                "⌈" => "\\lceil".into(),
                "⌉" => "\\rceil".into(),
                c => c.into(),
            };
            format!("\\left{} {} \\right{}", delim(&beg), parts.join(&format!(" {} ", sym_to_latex(&sep).trim())), delim(&end))
        }
        "nary" => {
            let pr = child(n, "naryPr");
            let chr = val(pr, "chr").unwrap_or_else(|| "∫".into());
            let cmd = NARY.iter().find(|(u, _)| *u == chr).map(|(_, c)| format!("\\{c}")).unwrap_or_else(|| sym_to_latex(&chr));
            let mut s = cmd;
            let hidden = |k: &str| val(pr, k).is_some_and(|v| v == "1" || v == "on" || v == "true");
            let sub = arg(child(n, "sub"));
            let sup = arg(child(n, "sup"));
            if !hidden("subHide") && !sub.is_empty() {
                s.push_str(&format!("_{{{sub}}}"));
            }
            if !hidden("supHide") && !sup.is_empty() {
                s.push_str(&format!("^{{{sup}}}"));
            }
            format!("{s} {}", arg(child(n, "e")))
        }
        "func" => {
            let name = arg(child(n, "fName"));
            format!("{}{}", if name.starts_with('\\') { name } else { format!("\\operatorname{{{name}}}") }, atom(&arg(child(n, "e"))))
        }
        "acc" => {
            let chr = val(child(n, "accPr"), "chr").unwrap_or_else(|| "\u{302}".into());
            let cmd = ACCENTS.iter().find(|(u, _)| *u == chr).map_or("hat", |(_, c)| c);
            format!("\\{cmd}{{{}}}", arg(child(n, "e")))
        }
        "bar" => {
            let top = val(child(n, "barPr"), "pos").as_deref() == Some("top");
            format!("\\{}{{{}}}", if top { "overline" } else { "underline" }, arg(child(n, "e")))
        }
        "groupChr" => {
            let chr = val(child(n, "groupChrPr"), "chr").unwrap_or_else(|| "⏟".into());
            format!("\\{}{{{}}}", if chr == "⏞" { "overbrace" } else { "underbrace" }, arg(child(n, "e")))
        }
        "limLow" => {
            let e = arg(child(n, "e"));
            let lim = arg(child(n, "lim"));
            if e.trim_end() == "\\lim" || e == "\\mathrm{lim}" { format!("\\lim_{{{lim}}}") } else { format!("\\underset{{{lim}}}{{{e}}}") }
        }
        "limUpp" => format!("\\overset{{{}}}{{{}}}", arg(child(n, "lim")), arg(child(n, "e"))),
        "m" => {
            let rows: Vec<String> = n.children().filter(|c| is_m(*c, "mr")).map(|r| r.children().filter(|c| is_m(*c, "e")).map(seq).collect::<Vec<_>>().join(" & ")).collect();
            format!("\\begin{{matrix}}{}\\end{{matrix}}", rows.join(" \\\\ "))
        }
        "eqArr" => {
            let rows: Vec<String> = n.children().filter(|c| is_m(*c, "e")).map(seq).collect();
            format!("\\begin{{aligned}}{}\\end{{aligned}}", rows.join(" \\\\ "))
        }
        "oMath" | "e" | "box" | "borderBox" | "phant" | "num" | "den" | "sub" | "sup" | "deg" | "lim" | "fName" => seq(n),
        "oMathPara" => n.children().filter(|c| is_m(*c, "oMath")).map(seq).collect::<Vec<_>>().join(" \\\\ "),
        // Propriétés et marques sans contenu affiché.
        _ => String::new(),
    }
}

/// LaTeX d'une équation (`m:oMath` ou `m:oMathPara`).
pub fn to_latex(n: Node) -> String {
    let s = elem(n);
    // Espaces doubles laissés par les commandes.
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch == ' ' && out.ends_with(' ') {
            continue;
        }
        out.push(ch);
    }
    out.trim().to_string()
}

// ------------------------------------------------------------ LaTeX → OMML

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Cmd(String),
    Ch(char),
    Open,
    Close,
    Sub,
    Sup,
    Amp,
    Row,
    OpenOpt,
    CloseOpt,
}

fn tokenize(s: &str) -> Vec<Tok> {
    let mut out = Vec::new();
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '\\' => {
                let mut name = String::new();
                while let Some(&n) = it.peek() {
                    if n.is_ascii_alphabetic() {
                        name.push(n);
                        it.next();
                    } else {
                        break;
                    }
                }
                if name.is_empty() {
                    match it.next() {
                        Some('\\') => out.push(Tok::Row),
                        Some(',') => out.push(Tok::Ch('\u{2009}')),
                        Some(';') | Some(':') | Some(' ') => out.push(Tok::Ch(' ')),
                        Some('!') => {}
                        Some('|') => out.push(Tok::Ch('‖')),
                        Some(o) => out.push(Tok::Ch(o)),
                        None => {}
                    }
                } else {
                    out.push(Tok::Cmd(name));
                }
            }
            '{' => out.push(Tok::Open),
            '}' => out.push(Tok::Close),
            '_' => out.push(Tok::Sub),
            '^' => out.push(Tok::Sup),
            '&' => out.push(Tok::Amp),
            '[' => out.push(Tok::OpenOpt),
            ']' => out.push(Tok::CloseOpt),
            c if c.is_whitespace() => {}
            c => out.push(Tok::Ch(c)),
        }
    }
    out
}

struct Parser {
    toks: Vec<Tok>,
    i: usize,
}

fn r(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let space = if text.starts_with(' ') || text.ends_with(' ') { r#" xml:space="preserve""# } else { "" };
    format!("<m:r><m:t{space}>{}</m:t></m:r>", escape_text(text))
}

fn r_plain(text: &str) -> String {
    let space = if text.contains(' ') { r#" xml:space="preserve""# } else { "" };
    format!(r#"<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t{space}>{}</m:t></m:r>"#, escape_text(text))
}

impl Parser {
    fn peek(&self) -> Option<&Tok> {
        self.toks.get(self.i)
    }

    fn next(&mut self) -> Option<Tok> {
        let t = self.toks.get(self.i).cloned();
        self.i += 1;
        t
    }

    /// Suite d'éléments jusqu'à `}` / `]` / `&` / `\\` / `\right` / `\end`.
    fn seq(&mut self, stop_opt: bool) -> String {
        let mut out = String::new();
        let mut text = String::new();
        loop {
            match self.peek() {
                None | Some(Tok::Close) | Some(Tok::Amp) | Some(Tok::Row) => break,
                Some(Tok::CloseOpt) if stop_opt => break,
                Some(Tok::Cmd(c)) if c == "right" || c == "end" => break,
                _ => {}
            }
            let (base, plain_char) = self.atom();
            // Indice et exposant collés à la base.
            let mut sub = None;
            let mut sup = None;
            loop {
                match self.peek() {
                    Some(Tok::Sub) if sub.is_none() => {
                        self.next();
                        sub = Some(self.group());
                    }
                    Some(Tok::Sup) if sup.is_none() => {
                        self.next();
                        sup = Some(self.group());
                    }
                    _ => break,
                }
            }
            if sub.is_none() && sup.is_none() {
                if let Some(c) = plain_char {
                    text.push(c);
                    continue;
                }
                out.push_str(&r(&std::mem::take(&mut text)));
                out.push_str(&base);
                continue;
            }
            out.push_str(&r(&std::mem::take(&mut text)));
            let base = plain_char.map(|c| r(&c.to_string())).unwrap_or(base);
            out.push_str(&match (sub, sup) {
                (Some(b), Some(p)) => format!("<m:sSubSup><m:e>{base}</m:e><m:sub>{b}</m:sub><m:sup>{p}</m:sup></m:sSubSup>"),
                (Some(b), None) => format!("<m:sSub><m:e>{base}</m:e><m:sub>{b}</m:sub></m:sSub>"),
                (None, Some(p)) => format!("<m:sSup><m:e>{base}</m:e><m:sup>{p}</m:sup></m:sSup>"),
                (None, None) => unreachable!(),
            });
        }
        out.push_str(&r(&text));
        out
    }

    /// Argument entre accolades (ou un seul élément).
    fn group(&mut self) -> String {
        if self.peek() == Some(&Tok::Open) {
            self.next();
            let s = self.seq(false);
            if self.peek() == Some(&Tok::Close) {
                self.next();
            }
            s
        } else {
            let (s, c) = self.atom();
            c.map(|c| r(&c.to_string())).unwrap_or(s)
        }
    }

    /// Texte brut d'un argument (`\mathrm{abc}`, `\text{…}`).
    fn raw_group(&mut self) -> String {
        let mut s = String::new();
        if self.peek() != Some(&Tok::Open) {
            return s;
        }
        self.next();
        let mut depth = 0;
        while let Some(t) = self.next() {
            match t {
                Tok::Open => depth += 1,
                Tok::Close if depth == 0 => break,
                Tok::Close => depth -= 1,
                Tok::Ch(c) => s.push(c),
                Tok::Cmd(c) => s.push_str(&c),
                _ => {}
            }
        }
        s
    }

    /// Un élément ; un simple caractère est rendu à part pour être fusionné
    /// avec ses voisins dans un même `m:r`.
    fn atom(&mut self) -> (String, Option<char>) {
        match self.next() {
            None => (String::new(), None),
            Some(Tok::Ch(c)) => (String::new(), Some(c)),
            Some(Tok::Open) => {
                let s = self.seq(false);
                if self.peek() == Some(&Tok::Close) {
                    self.next();
                }
                (s, None)
            }
            Some(Tok::OpenOpt) => (String::new(), Some('[')),
            Some(Tok::CloseOpt) => (String::new(), Some(']')),
            Some(Tok::Cmd(c)) => (self.command(&c), None),
            Some(_) => (String::new(), None),
        }
    }

    fn delim(&mut self) -> String {
        match self.next() {
            Some(Tok::Ch('.')) => String::new(),
            Some(Tok::Ch(c)) => c.to_string(),
            Some(Tok::OpenOpt) => "[".into(),
            Some(Tok::CloseOpt) => "]".into(),
            Some(Tok::Cmd(c)) => match c.as_str() {
                "langle" => "⟨".into(),
                "rangle" => "⟩".into(),
                "lfloor" => "⌊".into(),
                "rfloor" => "⌋".into(),
                "lceil" => "⌈".into(),
                "rceil" => "⌉".into(),
                "vert" => "|".into(),
                "Vert" => "‖".into(),
                _ => String::new(),
            },
            _ => String::new(),
        }
    }

    fn command(&mut self, c: &str) -> String {
        if let Some((u, _)) = SYMBOLS.iter().find(|(_, cmd)| *cmd == c) {
            return r(u);
        }
        if let Some((u, _)) = NARY.iter().find(|(_, cmd)| *cmd == c) {
            let (mut sub, mut sup) = (None, None);
            loop {
                match self.peek() {
                    Some(Tok::Sub) if sub.is_none() => {
                        self.next();
                        sub = Some(self.group());
                    }
                    Some(Tok::Sup) if sup.is_none() => {
                        self.next();
                        sup = Some(self.group());
                    }
                    _ => break,
                }
            }
            let e = self.group();
            let hide = |v: &Option<String>, k: &str| if v.is_none() { format!(r#"<m:{k} m:val="1"/>"#) } else { String::new() };
            return format!(
                r#"<m:nary><m:naryPr><m:chr m:val="{u}"/>{}{}</m:naryPr><m:sub>{}</m:sub><m:sup>{}</m:sup><m:e>{e}</m:e></m:nary>"#,
                hide(&sub, "subHide"),
                hide(&sup, "supHide"),
                sub.clone().unwrap_or_default(),
                sup.clone().unwrap_or_default()
            );
        }
        if let Some((u, _)) = ACCENTS.iter().find(|(_, cmd)| *cmd == c) {
            let e = self.group();
            return format!(r#"<m:acc><m:accPr><m:chr m:val="{u}"/></m:accPr><m:e>{e}</m:e></m:acc>"#);
        }
        if FUNCS.contains(&c) {
            if c == "lim" && self.peek() == Some(&Tok::Sub) {
                self.next();
                let lim = self.group();
                let e = self.group();
                return format!("<m:func><m:fName><m:limLow><m:e>{}</m:e><m:lim>{lim}</m:lim></m:limLow></m:fName><m:e>{e}</m:e></m:func>", r_plain("lim"));
            }
            let e = self.group();
            return format!("<m:func><m:fName>{}</m:fName><m:e>{e}</m:e></m:func>", r_plain(c));
        }
        match c {
            "frac" | "dfrac" | "tfrac" => {
                let num = self.group();
                let den = self.group();
                format!("<m:f><m:num>{num}</m:num><m:den>{den}</m:den></m:f>")
            }
            "sqrt" => {
                let mut deg = String::new();
                if self.peek() == Some(&Tok::OpenOpt) {
                    self.next();
                    deg = self.seq(true);
                    if self.peek() == Some(&Tok::CloseOpt) {
                        self.next();
                    }
                }
                let e = self.group();
                let pr = if deg.is_empty() { r#"<m:radPr><m:degHide m:val="1"/></m:radPr>"# } else { "" };
                format!("<m:rad>{pr}<m:deg>{deg}</m:deg><m:e>{e}</m:e></m:rad>")
            }
            "left" => {
                let beg = self.delim();
                let mut parts = vec![self.seq(false)];
                while matches!(self.peek(), Some(Tok::Ch('|'))) {
                    self.next();
                    parts.push(self.seq(false));
                }
                let end = if self.peek() == Some(&Tok::Cmd("right".into())) {
                    self.next();
                    self.delim()
                } else {
                    ")".into()
                };
                let es: String = parts.iter().map(|p| format!("<m:e>{p}</m:e>")).collect();
                format!(r#"<m:d><m:dPr><m:begChr m:val="{}"/><m:endChr m:val="{}"/></m:dPr>{es}</m:d>"#, crate::xml::escape_attr(&beg), crate::xml::escape_attr(&end))
            }
            "overline" | "underline" => {
                let e = self.group();
                format!(r#"<m:bar><m:barPr><m:pos m:val="{}"/></m:barPr><m:e>{e}</m:e></m:bar>"#, if c == "overline" { "top" } else { "bot" })
            }
            "overbrace" | "underbrace" => {
                let e = self.group();
                let (chr, pos) = if c == "overbrace" { ("⏞", "top") } else { ("⏟", "bot") };
                format!(r#"<m:groupChr><m:groupChrPr><m:chr m:val="{chr}"/><m:pos m:val="{pos}"/></m:groupChrPr><m:e>{e}</m:e></m:groupChr>"#)
            }
            "underset" | "overset" => {
                let lim = self.group();
                let e = self.group();
                let tag = if c == "underset" { "limLow" } else { "limUpp" };
                format!("<m:{tag}><m:e>{e}</m:e><m:lim>{lim}</m:lim></m:{tag}>")
            }
            "mathrm" | "operatorname" | "mathit" | "mathbf" => {
                let t = self.raw_group();
                if c == "mathit" { r(&t) } else { r_plain(&t) }
            }
            "text" | "textrm" | "mbox" => {
                let t = self.raw_group();
                format!(r#"<m:r><m:rPr><m:nor/></m:rPr><m:t xml:space="preserve">{}</m:t></m:r>"#, escape_text(&t))
            }
            "mathbb" => {
                let t = self.raw_group();
                r(&t.replace('R', "ℝ").replace('N', "ℕ").replace('Z', "ℤ").replace('Q', "ℚ").replace('C', "ℂ"))
            }
            "quad" | "qquad" => r("\u{2003}"),
            "begin" => {
                let env = self.raw_group();
                let mut rows: Vec<Vec<String>> = vec![vec![]];
                loop {
                    let cell = self.seq(false);
                    rows.last_mut().unwrap().push(cell);
                    match self.next() {
                        Some(Tok::Amp) => {}
                        Some(Tok::Row) => rows.push(vec![]),
                        Some(Tok::Cmd(e)) if e == "end" => {
                            self.raw_group();
                            break;
                        }
                        None => break,
                        _ => {}
                    }
                }
                if rows.last().is_some_and(|r| r.len() == 1 && r[0].is_empty()) && rows.len() > 1 {
                    rows.pop();
                }
                if env == "aligned" || env == "align" || env == "gathered" || env == "cases" {
                    let es: String = rows.iter().map(|r| format!("<m:e>{}</m:e>", r.join(""))).collect();
                    let arr = format!("<m:eqArr>{es}</m:eqArr>");
                    return if env == "cases" { format!(r#"<m:d><m:dPr><m:begChr m:val="{{"/><m:endChr m:val=""/></m:dPr><m:e>{arr}</m:e></m:d>"#) } else { arr };
                }
                let mrs: String = rows.iter().map(|r| format!("<m:mr>{}</m:mr>", r.iter().map(|c| format!("<m:e>{c}</m:e>")).collect::<String>())).collect();
                let m = format!("<m:m>{mrs}</m:m>");
                match env.as_str() {
                    "pmatrix" => format!(r#"<m:d><m:e>{m}</m:e></m:d>"#),
                    "bmatrix" => format!(r#"<m:d><m:dPr><m:begChr m:val="["/><m:endChr m:val="]"/></m:dPr><m:e>{m}</m:e></m:d>"#),
                    "vmatrix" => format!(r#"<m:d><m:dPr><m:begChr m:val="|"/><m:endChr m:val="|"/></m:dPr><m:e>{m}</m:e></m:d>"#),
                    _ => m,
                }
            }
            "{" => r("{"),
            "}" => r("}"),
            other => r(&format!("\\{other}")),
        }
    }
}

/// OMML d'une équation écrite en LaTeX (`m:oMath`, espace de noms déclaré).
pub fn from_latex(latex: &str) -> String {
    let mut p = Parser { toks: tokenize(latex), i: 0 };
    let mut body = String::new();
    while p.peek().is_some() {
        body.push_str(&p.seq(false));
        // Accolade fermante ou séparateur orphelin : on le passe.
        p.next();
    }
    format!(r#"<m:oMath xmlns:m="{M}">{body}</m:oMath>"#)
}

/// Texte affiché d'une équation (positions du panneau) : celui des `m:t`.
pub fn text_of(omml: &str) -> String {
    let doc = match roxmltree::Document::parse(omml) {
        Ok(d) => d,
        Err(_) => return String::new(),
    };
    doc.descendants().filter(|n| is_m(*n, "t")).filter_map(|n| n.text()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn latex_of(omml: &str) -> String {
        let doc = roxmltree::Document::parse(omml).unwrap();
        to_latex(doc.root_element())
    }

    #[test]
    fn aller_retour_des_formes_courantes() {
        for src in [
            r"\alpha =0,356\rho_{1}+0,130\rho_{2}",
            r"\frac{a+b}{2}",
            r"\sqrt{x^{2}+1}",
            r"\sqrt[3]{x}",
            r"\sum_{i=1}^{n} x_{i}",
            r"\int_{0}^{1} f",
            r"\left( a+b \right)",
            r"\hat{x}",
            r"\sin x",
            r"\mathrm{NDSI}",
            r"\begin{matrix}a & b \\ c & d\end{matrix}",
            r"x_{1}^{2}",
        ] {
            let omml = from_latex(src);
            let back = latex_of(&omml);
            let again = latex_of(&from_latex(&back));
            assert_eq!(back, again, "{src} → {omml}");
            roxmltree::Document::parse(&omml).unwrap();
        }
        assert_eq!(latex_of(&from_latex(r"\frac{a}{b}")), r"\frac{a}{b}");
        assert_eq!(latex_of(&from_latex(r"\rho_1")), r"\rho_{1}");
        assert_eq!(text_of(&from_latex(r"\alpha=0,3")), "α=0,3");
    }

    #[test]
    fn equation_de_word() {
        let omml = format!(r#"<m:oMath xmlns:m="{M}"><m:r><m:t>α=0,356</m:t></m:r><m:sSub><m:e><m:r><m:t>ρ</m:t></m:r></m:e><m:sub><m:r><m:t>1</m:t></m:r></m:sub></m:sSub></m:oMath>"#);
        assert_eq!(latex_of(&omml), r"\alpha =0,356\rho_{1}");
    }
}
