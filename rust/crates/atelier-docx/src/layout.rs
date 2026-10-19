//! Mise en page résolue comme Word la calcule : valeurs par défaut du
//! document (`w:docDefaults`), chaîne des styles (`w:basedOn`, style de
//! paragraphe par défaut), puis propriétés directes du paragraphe. Tout est
//! rendu en points pour que le panneau dessine la page à l'échelle, avec la
//! section (format, marges, numéros de ligne).

use crate::xml::{self, is_w, w_attr, w_child};
use roxmltree::Node;
use serde::Serialize;
use std::collections::HashMap;

/// Apparence d'un paragraphe : chaque champ absent garde le rendu par
/// défaut du panneau.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Look {
    /// left, center, right, both
    #[serde(skip_serializing_if = "Option::is_none")]
    pub align: Option<String>,
    /// Espace avant et après, en points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<f32>,
    /// Interligne multiple (1 = simple, 2 = double).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<f32>,
    /// Interligne exact ou minimum, en points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_exact: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_min: Option<f32>,
    /// Retraits gauche et droit, en points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub left: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right: Option<f32>,
    /// Retrait de première ligne, négatif pour une ligne en sommaire.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub b: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub i: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caps: Option<bool>,
    /// Taille en points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// Couleur `RRGGBB` du texte.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Paragraphe exclu de la numérotation des lignes.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub no_ln: bool,
    /// Enchaînement : garder avec le suivant, lignes solidaires, saut de
    /// page avant ; contrôle des veuves et orphelines coupé.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub keep_next: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub keep_lines: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub page_break_before: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub widow_off: bool,
    /// Pas d'espace entre paragraphes du même style.
    #[serde(skip)]
    pub contextual: bool,
}

#[derive(Clone, Debug, Default)]
struct Partial {
    align: Option<String>,
    before: Option<f32>,
    after: Option<f32>,
    line: Option<Line>,
    left: Option<f32>,
    right: Option<f32>,
    first: Option<f32>,
    contextual: Option<bool>,
    no_ln: Option<bool>,
    keep_next: Option<bool>,
    keep_lines: Option<bool>,
    page_break_before: Option<bool>,
    widow: Option<bool>,
    run: Run,
}

#[derive(Clone, Copy, Debug)]
enum Line {
    Auto(f32),
    Exact(f32),
    Min(f32),
}

/// Propriétés de caractère héritables.
#[derive(Clone, Debug, Default)]
pub(crate) struct Run {
    pub b: Option<bool>,
    pub i: Option<bool>,
    pub caps: Option<bool>,
    pub size: Option<f32>,
    pub font: Option<String>,
    pub color: Option<String>,
}

impl Run {
    fn over(&mut self, o: &Run) {
        macro_rules! take {
            ($($f:ident),*) => { $( if o.$f.is_some() { self.$f = o.$f.clone(); } )* };
        }
        take!(b, i, caps, size, font, color);
    }
}

impl Partial {
    fn over(&mut self, o: &Partial) {
        macro_rules! take {
            ($($f:ident),*) => { $( if o.$f.is_some() { self.$f = o.$f.clone(); } )* };
        }
        take!(align, before, after, line, left, right, first, contextual, no_ln, keep_next, keep_lines, page_break_before, widow);
        self.run.over(&o.run);
    }

    fn look(&self) -> Look {
        let (line, line_exact, line_min) = match self.line {
            Some(Line::Auto(m)) => (Some(m), None, None),
            Some(Line::Exact(p)) => (None, Some(p), None),
            Some(Line::Min(p)) => (None, None, Some(p)),
            None => (None, None, None),
        };
        Look {
            align: self.align.clone(),
            before: self.before,
            after: self.after,
            line,
            line_exact,
            line_min,
            left: self.left,
            right: self.right,
            first: self.first,
            b: self.run.b,
            i: self.run.i,
            caps: self.run.caps,
            size: self.run.size,
            font: self.run.font.clone(),
            color: self.run.color.clone(),
            no_ln: self.no_ln.unwrap_or(false),
            keep_next: self.keep_next.unwrap_or(false),
            keep_lines: self.keep_lines.unwrap_or(false),
            page_break_before: self.page_break_before.unwrap_or(false),
            // Word contrôle les veuves sauf réglage contraire.
            widow_off: self.widow == Some(false),
            contextual: self.contextual.unwrap_or(false),
        }
    }
}

fn twips(n: Node, attr: &str) -> Option<f32> {
    w_attr(n, attr).and_then(|v| v.trim().parse::<f32>().ok()).map(|v| v / 20.0)
}

fn on(n: Option<Node>) -> Option<bool> {
    n.map(|n| !matches!(w_attr(n, "val"), Some("0" | "false" | "off" | "none")))
}

/// Polices du thème (`minorHAnsi`, `majorHAnsi`).
#[derive(Default)]
struct Theme {
    major: Option<String>,
    minor: Option<String>,
}

fn run_of(rpr: Option<Node>, theme: &Theme) -> Run {
    let Some(r) = rpr else { return Run::default() };
    let font = w_child(r, "rFonts").and_then(|f| {
        w_attr(f, "ascii").or(w_attr(f, "hAnsi")).map(str::to_string).or_else(|| {
            let t = w_attr(f, "asciiTheme").or(w_attr(f, "hAnsiTheme"))?;
            if t.starts_with("major") { theme.major.clone() } else { theme.minor.clone() }
        })
    });
    Run {
        b: on(w_child(r, "b")),
        i: on(w_child(r, "i")),
        caps: on(w_child(r, "caps")),
        size: w_child(r, "sz").and_then(|n| w_attr(n, "val")).and_then(|v| v.parse::<f32>().ok()).map(|v| v / 2.0),
        font,
        color: w_child(r, "color").and_then(|n| w_attr(n, "val")).filter(|v| *v != "auto" && v.len() == 6).map(str::to_string),
    }
}

fn partial_of(ppr: Option<Node>, rpr: Option<Node>, theme: &Theme) -> Partial {
    let mut p = Partial { run: run_of(rpr, theme), ..Default::default() };
    let Some(n) = ppr else { return p };
    p.align = w_child(n, "jc").and_then(|j| w_attr(j, "val")).map(|v| {
        match v {
            "start" => "left",
            "end" => "right",
            "distribute" => "both",
            v => v,
        }
        .to_string()
    });
    if let Some(s) = w_child(n, "spacing") {
        // Espacement automatique « HTML » : Word compte 14 points.
        let auto = |a: &str| w_attr(s, a).is_some_and(|v| v == "1" || v == "true");
        p.before = if auto("beforeAutospacing") { Some(14.0) } else { twips(s, "before") };
        p.after = if auto("afterAutospacing") { Some(14.0) } else { twips(s, "after") };
        if let Some(v) = w_attr(s, "line").and_then(|v| v.trim().parse::<f32>().ok()) {
            p.line = Some(match w_attr(s, "lineRule") {
                Some("exact") => Line::Exact(v / 20.0),
                Some("atLeast") => Line::Min(v / 20.0),
                _ => Line::Auto(v / 240.0),
            });
        }
    }
    if let Some(i) = w_child(n, "ind") {
        p.left = twips(i, "left").or_else(|| twips(i, "start"));
        p.right = twips(i, "right").or_else(|| twips(i, "end"));
        p.first = twips(i, "hanging").map(|h| -h).or_else(|| twips(i, "firstLine"));
    }
    p.contextual = on(w_child(n, "contextualSpacing"));
    p.no_ln = on(w_child(n, "suppressLineNumbers"));
    p.keep_next = on(w_child(n, "keepNext"));
    p.keep_lines = on(w_child(n, "keepLines"));
    p.page_break_before = on(w_child(n, "pageBreakBefore"));
    p.widow = on(w_child(n, "widowControl"));
    p
}

struct StyleDef {
    based_on: Option<String>,
    props: Partial,
}

/// Styles du document, prêts à résoudre.
#[derive(Default)]
pub struct Styles {
    defaults: Partial,
    by_id: HashMap<String, StyleDef>,
    default_para: Option<String>,
    /// Style de caractère des numéros de ligne (`line number`).
    line_number: Option<String>,
}

impl Styles {
    pub fn parse(styles_xml: Option<&str>, theme_xml: Option<&str>) -> Styles {
        let mut theme = Theme::default();
        if let Some(t) = theme_xml.and_then(|t| xml::parse(t).ok()) {
            let face = |tag: &str| {
                t.descendants()
                    .find(|n| n.tag_name().name() == tag)
                    .and_then(|f| f.children().find(|c| c.tag_name().name() == "latin"))
                    .and_then(|l| l.attribute("typeface"))
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
            };
            theme.major = face("majorFont");
            theme.minor = face("minorFont");
        }
        let mut out = Styles::default();
        let Some(doc) = styles_xml.and_then(|s| xml::parse(s).ok()) else {
            out.theme_fonts(theme);
            return out;
        };
        let root = doc.root_element();
        if let Some(d) = w_child(root, "docDefaults") {
            let ppr = w_child(d, "pPrDefault").and_then(|n| w_child(n, "pPr"));
            let rpr = w_child(d, "rPrDefault").and_then(|n| w_child(n, "rPr"));
            out.defaults = partial_of(ppr, rpr, &theme);
        }
        for st in root.children().filter(|n| is_w(*n, "style")) {
            let Some(id) = w_attr(st, "styleId") else { continue };
            let kind = w_attr(st, "type").unwrap_or("paragraph");
            let name = w_child(st, "name").and_then(|n| w_attr(n, "val")).unwrap_or("").to_lowercase();
            if kind == "paragraph" && matches!(w_attr(st, "default"), Some("1" | "true")) {
                out.default_para = Some(id.to_string());
            }
            if kind == "character" && name == "line number" {
                out.line_number = Some(id.to_string());
            }
            out.by_id.insert(
                id.to_string(),
                StyleDef {
                    based_on: w_child(st, "basedOn").and_then(|n| w_attr(n, "val")).map(str::to_string),
                    props: partial_of(w_child(st, "pPr"), w_child(st, "rPr"), &theme),
                },
            );
        }
        out.theme_fonts(theme);
        out
    }

    fn theme_fonts(&mut self, theme: Theme) {
        // Sans police nulle part, Word prend celle du thème, puis Times New
        // Roman ; sans taille, 10 points.
        if self.defaults.run.font.is_none() {
            self.defaults.run.font = Some(theme.minor.unwrap_or_else(|| "Times New Roman".into()));
        }
        self.defaults.run.size.get_or_insert(10.0);
    }

    /// Propriétés cumulées d'un style et de ses parents.
    fn chain(&self, id: &str) -> Partial {
        let mut ids = Vec::new();
        let mut cur = Some(id.to_string());
        while let Some(c) = cur {
            if ids.contains(&c) || ids.len() > 20 {
                break;
            }
            cur = self.by_id.get(&c).and_then(|s| s.based_on.clone());
            ids.push(c);
        }
        let mut p = Partial::default();
        for id in ids.iter().rev() {
            if let Some(s) = self.by_id.get(id) {
                p.over(&s.props);
            }
        }
        p
    }

    /// Apparence d'un paragraphe (`w:p`).
    pub fn paragraph(&self, p: Node) -> Look {
        let ppr = w_child(p, "pPr");
        let style = ppr.and_then(|n| w_child(n, "pStyle")).and_then(|n| w_attr(n, "val")).map(str::to_string).or_else(|| self.default_para.clone());
        let mut acc = self.defaults.clone();
        if let Some(s) = style {
            acc.over(&self.chain(&s));
        }
        // Propriétés directes ; le `w:rPr` de `w:pPr` ne vaut que pour la marque ¶.
        acc.over(&partial_of(ppr, None, &Theme::default()));
        acc.look()
    }

    /// Mise en forme d'un style de caractère (`w:rStyle`).
    pub(crate) fn character(&self, id: &str) -> Run {
        self.chain(id).run
    }

    /// Police et taille des numéros de ligne.
    fn line_number_run(&self) -> Run {
        let mut r = self.defaults.run.clone();
        if let Some(d) = &self.default_para {
            r.over(&self.chain(d).run);
        }
        if let Some(l) = &self.line_number {
            r.over(&self.chain(l).run);
        }
        r
    }
}

/// Format de la page et numérotation des lignes (dernière section du corps).
#[derive(Clone, Debug, Serialize)]
pub struct Page {
    /// Dimensions et marges, en points.
    pub width: f32,
    pub height: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
    /// Distance de l'en-tête au haut de la page, du pied au bas, en points.
    pub header: f32,
    pub footer: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_numbers: Option<LineNumbers>,
}

#[derive(Clone, Debug, Serialize)]
pub struct LineNumbers {
    /// Un numéro toutes les `count_by` lignes.
    pub count_by: u32,
    /// Premier numéro.
    pub start: u32,
    /// Écart entre le numéro et le texte, en points.
    pub distance: f32,
    /// newPage, newSection, continuous
    pub restart: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
}

pub fn page(document_xml: &str, styles: &Styles) -> Option<Page> {
    let doc = xml::parse(document_xml).ok()?;
    let body = w_child(doc.root_element(), "body")?;
    let sect = body.children().rfind(|n| is_w(*n, "sectPr"))?;
    // Lettre US par défaut, marges de 1 po, comme Word.
    let size = w_child(sect, "pgSz");
    let mar = w_child(sect, "pgMar");
    let get = |n: Option<Node>, a: &str, d: f32| n.and_then(|n| twips(n, a)).unwrap_or(d);
    let line_numbers = w_child(sect, "lnNumType").map(|l| {
        let run = styles.line_number_run();
        LineNumbers {
            count_by: w_attr(l, "countBy").and_then(|v| v.parse().ok()).filter(|v| *v > 0).unwrap_or(1),
            start: w_attr(l, "start").and_then(|v| v.parse::<u32>().ok()).unwrap_or(0) + 1,
            // « Auto » : un quart de pouce.
            distance: twips(l, "distance").unwrap_or(18.0),
            restart: w_attr(l, "restart").unwrap_or("newPage").to_string(),
            font: run.font,
            size: run.size,
        }
    });
    Some(Page {
        width: get(size, "w", 612.0),
        height: get(size, "h", 792.0),
        top: get(mar, "top", 72.0).abs(),
        right: get(mar, "right", 72.0),
        bottom: get(mar, "bottom", 72.0).abs(),
        left: get(mar, "left", 72.0),
        header: get(mar, "header", 36.0),
        footer: get(mar, "footer", 36.0),
        line_numbers,
    })
}
