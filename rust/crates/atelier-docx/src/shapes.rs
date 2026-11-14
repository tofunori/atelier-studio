//! Zones de texte et formes dessinées sur la page.
//!
//! Word range une zone de texte, un trait ou un groupe de formes dans un
//! `mc:AlternateContent` : le dessin moderne (DrawingML : `wps:wsp`,
//! `wpg:wgp`, `wpc:wpc`) dans `mc:Choice`, sa copie ancienne (VML : `v:rect`,
//! `v:shape`, `v:textbox`…) dans `mc:Fallback`. Un document passé par un
//! vieux Word ne porte que le VML, dans un `w:pict`. Ces dessins flottent
//! par-dessus le texte et les images : un élève y écrit ses propres valeurs
//! sur le schéma d'un exemple (2026-11-14, un TP noté à tort « schéma
//! copié » parce que ni la page ni l'agent ne montraient ses zones de texte).
//!
//! Ici on les lit : cadre (position par rapport à la colonne et au
//! paragraphe d'ancrage, taille, habillage), pièces (rectangle, ellipse,
//! trait, tracé, image d'un groupe) avec leur trait, leur fond et leur
//! texte. Le panneau les pose à leur place ; [`compose`] les dessine en SVG
//! par-dessus la figure qu'elles recouvrent, pour que l'agent voie la page
//! comme elle est. Lecture seule : rien ici ne retouche le document.

use crate::layout::{Look, Page, Styles};
use crate::xml::{M, R, W, is_w, w_attr, w_child};
use roxmltree::Node;
use serde::Serialize;
use std::fmt::Write as _;

const V: &str = "urn:schemas-microsoft-com:vml";
/// Unités de DrawingML (EMU) par point.
const EMU: f32 = 12_700.0;
/// Marges intérieures d'une zone de texte, par défaut : 0,1 po et 0,05 po.
const INSET: [f32; 4] = [7.2, 3.6, 7.2, 3.6];
/// Garde-fous : pièces par dessin, profondeur des groupes.
const MAX_PARTS: usize = 400;
const MAX_DEPTH: usize = 12;

/// Un dessin ancré à un paragraphe : son cadre et ses pièces.
#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct Shape {
    /// Coin haut-gauche, en points : `x` depuis le bord gauche de la
    /// colonne du paragraphe d'ancrage, `y` depuis le haut de son texte
    /// (ou depuis le haut de la feuille si `page_y`).
    pub x: f32,
    pub y: f32,
    /// Taille du cadre, en points.
    pub w: f32,
    pub h: f32,
    /// Habillage : `front` (devant le texte), `behind` (derrière), `square`
    /// (le texte l'entoure), `topAndBottom` (texte au-dessus et en dessous),
    /// `inline` (dans la ligne, comme un caractère).
    pub wrap: &'static str,
    /// `center` ou `right` : alignement dans la colonne quand sa largeur
    /// n'est pas connue ici (cellule de tableau).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub align: Option<&'static str>,
    /// `y` compté depuis le haut de la feuille (ancrage à la page ou à la marge).
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub page_y: bool,
    /// Ordre d'empilement de Word (`relativeHeight`).
    pub z: i64,
    /// Segment du paragraphe devant lequel le dessin est ancré.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seg: Option<usize>,
    pub parts: Vec<Part>,
}

/// Une pièce d'un dessin.
#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct Part {
    /// `rect`, `round` (coins arrondis), `ellipse`, `path` (trait, flèche,
    /// polygone ou tracé libre : voir `d`), `image` (voir `media`).
    pub geom: &'static str,
    /// Place dans le cadre, en points.
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    /// Rotation en degrés, sens horaire.
    #[serde(skip_serializing_if = "is_zero")]
    pub rot: f32,
    /// Fond `RRGGBB` (absent : transparent).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    /// Trait `RRGGBB` (absent : aucun) et son épaisseur en points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
    #[serde(skip_serializing_if = "is_zero")]
    pub line_w: f32,
    /// `dash`, `dot` ou `dashdot`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dash: Option<&'static str>,
    /// Tracé SVG (`d`), en points depuis le coin de la pièce.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub d: Option<String>,
    /// Pointes de flèche, en tracé plein de la couleur du trait.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heads: Option<String>,
    /// Marges intérieures du texte : gauche, haut, droite, bas, en points.
    pub inset: [f32; 4],
    /// `top`, `middle`, `bottom` : place du texte dans la hauteur.
    pub valign: &'static str,
    /// Couleur `RRGGBB` du texte par défaut (absent : celle de la page).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ink: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub text: Vec<TextPara>,
    /// Image d'un groupe : relation (`/docx/media?rel=`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<String>,
}

fn is_zero(v: &f32) -> bool {
    *v == 0.0
}

/// Un paragraphe d'une zone de texte.
#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct TextPara {
    pub look: Look,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub list: bool,
    pub runs: Vec<TextRun>,
}

#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct TextRun {
    pub text: String,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub b: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub i: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub u: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub strike: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub sup: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub sub: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// Taille en points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<f32>,
    /// Couleur `RRGGBB`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight: Option<String>,
}

impl Shape {
    /// Le dessin flotte-t-il par-dessus la page (hors du fil du texte) ?
    pub fn floats(&self) -> bool {
        matches!(self.wrap, "front" | "behind")
    }

    /// Texte de ses zones de texte, un paragraphe par ligne.
    pub fn text(&self) -> String {
        let mut out: Vec<String> = Vec::new();
        for part in &self.parts {
            for p in &part.text {
                let t: String = p.runs.iter().map(|r| r.text.as_str()).collect();
                let t = t.replace(['\n', '\t'], " ");
                if !t.trim().is_empty() {
                    out.push(t.trim().to_string());
                }
            }
        }
        out.join("\n")
    }

    /// Ce que c'est, en un mot, pour l'agent.
    pub fn label(&self) -> &'static str {
        if self.parts.iter().any(|p| !p.text.is_empty()) {
            "zone de texte"
        } else if self.parts.len() > 1 {
            "dessin"
        } else {
            match self.parts.first() {
                Some(p) if p.geom == "image" => "image",
                Some(p) if p.geom == "path" && p.fill.is_none() => "trait",
                _ => "forme",
            }
        }
    }
}

// ------------------------------------------------------------ contexte

/// Couleurs et épaisseurs de trait du thème du document.
pub(crate) struct Palette {
    colors: crate::chart::Theme,
    /// Épaisseurs des trois traits du thème (`a:lnStyleLst`), en points.
    line_w: [f32; 3],
}

impl Palette {
    pub(crate) fn read(theme_xml: Option<&str>) -> Palette {
        let colors = theme_xml.and_then(|t| crate::chart::Theme::read(t.as_bytes())).unwrap_or_default();
        // Thème d'Office 2013 et suivants ; celui de 2007-2010 dit 0,75 / 2 / 3 points.
        let mut line_w = [0.5, 1.0, 1.5];
        if let Some(doc) = theme_xml.and_then(|t| crate::xml::parse(t).ok())
            && let Some(list) = doc.descendants().find(|n| local(*n) == "lnStyleLst")
        {
            for (i, ln) in list.children().filter(|n| n.is_element() && local(*n) == "ln").take(3).enumerate() {
                if let Some(w) = ln.attribute("w").and_then(|w| w.trim().parse::<f32>().ok()).filter(|w| *w > 0.0) {
                    line_w[i] = w / EMU;
                }
            }
        }
        Palette { colors, line_w }
    }
}

/// Ce qu'il faut pour lire un dessin : styles (texte des zones), thème
/// (couleurs), page (ancrages à la page et aux marges).
pub(crate) struct Cx<'a> {
    pub styles: &'a Styles,
    pub palette: &'a Palette,
    pub page: Option<&'a Page>,
}

impl Cx<'_> {
    /// Couleur d'un élément dont l'enfant est `a:srgbClr`, `a:schemeClr`…
    fn color(&self, holder: Node) -> Option<String> {
        crate::chart::color_with(holder, &|name| self.palette.colors.scheme_color(name)).filter(|c| is_hex(c))
    }
}

fn is_hex(c: &str) -> bool {
    c.len() == 6 && c.bytes().all(|b| b.is_ascii_hexdigit())
}

fn local<'a>(n: Node<'a, '_>) -> &'a str {
    n.tag_name().name()
}

fn kid<'a, 'i>(n: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    n.children().find(|c| c.is_element() && c.tag_name().name() == name)
}

fn emu(n: Node, attr: &str) -> f32 {
    n.attribute(attr).and_then(|v| v.trim().parse::<f64>().ok()).map_or(0.0, |v| v as f32 / EMU)
}

fn truthy(v: Option<&str>) -> bool {
    matches!(v, Some("1" | "true" | "t" | "on"))
}

/// Repère d'un groupe : mise à l'échelle puis décalage, en points.
#[derive(Clone, Copy)]
struct Tf {
    sx: f32,
    sy: f32,
    dx: f32,
    dy: f32,
}

impl Tf {
    const ID: Tf = Tf { sx: 1.0, sy: 1.0, dx: 0.0, dy: 0.0 };

    fn rect(&self, [x, y, w, h]: [f32; 4]) -> [f32; 4] {
        [x * self.sx + self.dx, y * self.sy + self.dy, w * self.sx, h * self.sy]
    }

    /// Les enfants d'un groupe vivent dans `inner` (origine et étendue de
    /// leurs coordonnées), posé sur `outer` (place du groupe chez son parent).
    fn group(&self, outer: [f32; 4], inner: [f32; 4]) -> Tf {
        let sx = if inner[2] > 0.0 { outer[2] / inner[2] } else { 1.0 };
        let sy = if inner[3] > 0.0 { outer[3] / inner[3] } else { 1.0 };
        Tf { sx: sx * self.sx, sy: sy * self.sy, dx: (outer[0] - inner[0] * sx) * self.sx + self.dx, dy: (outer[1] - inner[1] * sy) * self.sy + self.dy }
    }
}

// ------------------------------------------------------------ lecture

/// Lit le dessin porté par `node` : un `mc:AlternateContent`, un
/// `w:drawing` ou un `w:pict`. `None` : rien qu'on sache dessiner.
pub(crate) fn read(node: Node, cx: &Cx, in_cell: bool) -> Option<Shape> {
    match local(node) {
        "AlternateContent" => {
            for choice in node.children().filter(|c| c.is_element() && local(*c) == "Choice") {
                if let Some(s) = choice.descendants().find(|n| is_w(*n, "drawing")).and_then(|d| drawing(d, cx, in_cell)) {
                    return Some(s);
                }
            }
            let fallback = kid(node, "Fallback")?;
            let old = fallback.descendants().find(|n| is_w(*n, "drawing") || is_w(*n, "pict") || is_w(*n, "object"))?;
            if is_w(old, "drawing") { drawing(old, cx, in_cell) } else { vml(old, cx, in_cell) }
        }
        "drawing" => drawing(node, cx, in_cell),
        "pict" | "object" => vml(node, cx, in_cell),
        _ => None,
    }
}

enum Pos<'a> {
    Offset(f32),
    Align(&'a str),
}

/// Place le cadre d'après son ancrage : horizontal (`hf` = d'où part la
/// mesure) et vertical (`vf`).
fn place(s: &mut Shape, hf: &str, hp: Pos, vf: &str, vp: Pos, cx: &Cx, in_cell: bool) {
    // Dans une cellule, Word mesure depuis la cellule : sa largeur n'est pas connue ici.
    let span = cx.page.filter(|_| !in_cell).map(|p| {
        let colw = p.width - p.left - p.right;
        match hf {
            "page" => (-p.left, p.width - p.left),
            "leftMargin" | "insideMargin" => (-p.left, 0.0),
            "rightMargin" | "outsideMargin" => (colw, colw + p.right),
            _ => (0.0, colw),
        }
    });
    match (hp, span) {
        (Pos::Offset(o), Some((l, _))) => s.x = l + o,
        (Pos::Offset(o), None) => s.x = o,
        (Pos::Align(a), Some((l, r))) => {
            s.x = match a {
                "center" => l + (r - l - s.w) / 2.0,
                "right" | "outside" => r - s.w,
                _ => l,
            }
        }
        (Pos::Align(a), None) => {
            s.align = match a {
                "center" => Some("center"),
                "right" | "outside" => Some("right"),
                _ => None,
            }
        }
    }
    match (vf, cx.page) {
        ("paragraph" | "line" | "character", _) | (_, None) => {
            if let Pos::Offset(o) = vp {
                s.y = o;
            }
        }
        (from, Some(p)) => {
            let (t, b) = match from {
                "page" => (0.0, p.height),
                "topMargin" | "insideMargin" => (0.0, p.top),
                "bottomMargin" | "outsideMargin" => (p.height - p.bottom, p.height),
                _ => (p.top, p.height - p.bottom),
            };
            s.y = match vp {
                Pos::Offset(o) => t + o,
                Pos::Align("center") => t + (b - t - s.h) / 2.0,
                Pos::Align("bottom" | "outside") => b - s.h,
                Pos::Align(_) => t,
            };
            s.page_y = true;
        }
    }
}

// ------------------------------------------------------------ DrawingML

fn drawing(d: Node, cx: &Cx, in_cell: bool) -> Option<Shape> {
    let host = d.children().find(|c| c.is_element() && matches!(local(*c), "anchor" | "inline"))?;
    let ext = kid(host, "extent")?;
    let (w, h) = (emu(ext, "cx"), emu(ext, "cy"));
    let data = kid(host, "graphic").and_then(|g| kid(g, "graphicData"))?;
    let mut parts = Vec::new();
    dml_children(data, Tf::ID, (w, h), cx, &mut parts, 0);
    if parts.is_empty() {
        return None;
    }
    let mut s = Shape { w, h, wrap: "inline", parts, ..Default::default() };
    if local(host) == "inline" {
        return Some(s);
    }
    s.z = host.attribute("relativeHeight").and_then(|v| v.parse().ok()).unwrap_or(0);
    let behind = truthy(host.attribute("behindDoc"));
    s.wrap = match host.children().filter(|c| c.is_element()).map(local).find(|n| n.starts_with("wrap")) {
        Some("wrapSquare" | "wrapTight" | "wrapThrough") => "square",
        Some("wrapTopAndBottom") => "topAndBottom",
        _ if behind => "behind",
        _ => "front",
    };
    let pos = |name: &str| -> (String, Option<f32>, Option<String>) {
        let Some(p) = kid(host, name) else { return (String::new(), Some(0.0), None) };
        let from = p.attribute("relativeFrom").unwrap_or("").to_string();
        let offset = kid(p, "posOffset").and_then(|o| o.text()).and_then(|t| t.trim().parse::<f64>().ok()).map(|v| v as f32 / EMU);
        let align = kid(p, "align").and_then(|a| a.text()).map(|t| t.trim().to_string());
        (from, offset, align)
    };
    let (hf, ho, ha) = pos("positionH");
    let (vf, vo, va) = pos("positionV");
    let hp = match (&ha, ho) {
        (Some(a), None) => Pos::Align(a),
        (_, o) => Pos::Offset(o.unwrap_or(0.0)),
    };
    let vp = match (&va, vo) {
        (Some(a), None) => Pos::Align(a),
        (_, o) => Pos::Offset(o.unwrap_or(0.0)),
    };
    place(&mut s, &hf, hp, &vf, vp, cx, in_cell);
    Some(s)
}

/// `a:off` et `a:ext` d'un `a:xfrm`, en points.
fn off_ext(xfrm: Node, off: &str, ext: &str) -> [f32; 4] {
    let o = kid(xfrm, off);
    let e = kid(xfrm, ext);
    [o.map_or(0.0, |n| emu(n, "x")), o.map_or(0.0, |n| emu(n, "y")), e.map_or(0.0, |n| emu(n, "cx")), e.map_or(0.0, |n| emu(n, "cy"))]
}

fn dml_children(parent: Node, tf: Tf, frame: (f32, f32), cx: &Cx, out: &mut Vec<Part>, depth: usize) {
    for c in parent.children().filter(|n| n.is_element()) {
        if out.len() >= MAX_PARTS || depth > MAX_DEPTH {
            return;
        }
        match local(c) {
            "wsp" => out.push(dml_shape(c, tf, frame, depth == 0, cx)),
            // Image d'un groupe ; seule dans son dessin, c'est une figure ordinaire (`walk`).
            "pic" if depth > 0 => {
                if let Some(p) = dml_pic(c, tf) {
                    out.push(p);
                }
            }
            "wgp" | "grpSp" => {
                let t = match kid(c, "grpSpPr").and_then(|g| kid(g, "xfrm")) {
                    Some(x) => {
                        let mut outer = off_ext(x, "off", "ext");
                        if depth == 0 {
                            // Le groupe entier occupe le cadre du dessin.
                            outer = [0.0, 0.0, frame.0, frame.1];
                        }
                        tf.group(outer, off_ext(x, "chOff", "chExt"))
                    }
                    None => tf,
                };
                dml_children(c, t, frame, cx, out, depth + 1);
            }
            "wpc" => dml_children(c, tf, frame, cx, out, depth + 1),
            _ => {}
        }
    }
}

fn dml_pic(pic: Node, tf: Tf) -> Option<Part> {
    let rel = pic.descendants().find(|n| local(*n) == "blip").and_then(|b| b.attribute((R, "embed")))?;
    let xfrm = kid(pic, "spPr").and_then(|s| kid(s, "xfrm"))?;
    let [x, y, w, h] = tf.rect(off_ext(xfrm, "off", "ext"));
    Some(Part { geom: "image", x, y, w, h, rot: rot_of(xfrm), inset: INSET, valign: "top", media: Some(rel.to_string()), ..Default::default() })
}

fn rot_of(xfrm: Node) -> f32 {
    xfrm.attribute("rot").and_then(|r| r.trim().parse::<f32>().ok()).map_or(0.0, |r| r / 60_000.0)
}

fn dml_shape(sp: Node, tf: Tf, frame: (f32, f32), alone: bool, cx: &Cx) -> Part {
    let sppr = kid(sp, "spPr");
    let xfrm = sppr.and_then(|s| kid(s, "xfrm"));
    // Seule dans son dessin, la forme occupe tout le cadre.
    let rect = xfrm.filter(|_| !alone).map_or([0.0, 0.0, frame.0, frame.1], |x| off_ext(x, "off", "ext"));
    let [x, y, w, h] = tf.rect(rect);
    let (flip_h, flip_v) = (xfrm.is_some_and(|x| truthy(x.attribute("flipH"))), xfrm.is_some_and(|x| truthy(x.attribute("flipV"))));
    let style = kid(sp, "style");
    let sref = |name: &str| style.and_then(|s| kid(s, name)).filter(|r| r.attribute("idx").is_some_and(|i| i != "0"));

    // Fond : celui de la forme, sinon celui de son style (couleur du thème).
    let own_fill = sppr.and_then(|s| s.children().find(|c| c.is_element() && matches!(local(*c), "noFill" | "solidFill" | "gradFill" | "pattFill" | "blipFill" | "grpFill")));
    let mut fill = match own_fill {
        Some(f) => match local(f) {
            "solidFill" => cx.color(f),
            // Dégradé : sa première couleur.
            "gradFill" => f.descendants().find(|n| local(*n) == "gs").and_then(|g| cx.color(g)),
            "pattFill" => kid(f, "bgClr").and_then(|c| cx.color(c)),
            _ => None,
        },
        None => sref("fillRef").and_then(|r| cx.color(r)),
    };

    // Trait : `a:ln`, sinon le trait du style (épaisseur du thème).
    let ln = sppr.and_then(|s| kid(s, "ln"));
    let lref = sref("lnRef");
    let ref_w = lref.and_then(|r| r.attribute("idx")).and_then(|i| i.parse::<usize>().ok()).filter(|i| (1..=3).contains(i)).map(|i| cx.palette.line_w[i - 1]);
    let (line, line_w) = match ln {
        Some(l) if kid(l, "noFill").is_some() => (None, 0.0),
        Some(l) => {
            let color = kid(l, "solidFill")
                .and_then(|f| cx.color(f))
                .or_else(|| l.descendants().find(|n| local(*n) == "gs").and_then(|g| cx.color(g)))
                .or_else(|| lref.and_then(|r| cx.color(r)))
                .unwrap_or_else(|| "000000".into());
            let w = l.attribute("w").and_then(|w| w.trim().parse::<f32>().ok()).map(|w| w / EMU).or(ref_w).unwrap_or(0.75);
            (Some(color), w)
        }
        None => match lref.and_then(|r| cx.color(r)) {
            Some(c) => (Some(c), ref_w.unwrap_or(0.75)),
            None => (None, 0.0),
        },
    };
    let dash = ln.and_then(|l| kid(l, "prstDash")).and_then(|d| d.attribute("val")).and_then(dash_of);
    let arrow = |name: &str| ln.and_then(|l| kid(l, name)).and_then(|e| e.attribute("type")).is_some_and(|t| t != "none");
    let (head, tail) = (arrow("headEnd"), arrow("tailEnd"));

    let prst = sppr.and_then(|s| kid(s, "prstGeom")).and_then(|g| g.attribute("prst")).unwrap_or("rect");
    let cust = sppr.and_then(|s| kid(s, "custGeom"));
    let connector = kid(sp, "cNvCnPr").is_some();
    let (mut geom, mut d, mut heads) = ("rect", None, None);
    if let Some(path) = cust.and_then(|c| custom_path(c, rect[2], rect[3], w, h, flip_h, flip_v)) {
        geom = "path";
        d = Some(path);
    } else if connector || prst == "line" || prst.contains("Connector") {
        let (x1, x2) = if flip_h { (w, 0.0) } else { (0.0, w) };
        let (y1, y2) = if flip_v { (h, 0.0) } else { (0.0, h) };
        geom = "path";
        d = Some(format!("M{x1:.2} {y1:.2}L{x2:.2} {y2:.2}"));
        heads = arrow_heads([x1, y1], [x2, y2], line_w, head, tail);
        fill = None;
    } else if let Some(points) = preset_points(prst, w, h) {
        geom = "path";
        d = Some(poly(&points, w, h, flip_h, flip_v));
    } else {
        geom = match prst {
            "roundRect" | "flowChartAlternateProcess" => "round",
            "ellipse" | "flowChartConnector" => "ellipse",
            _ => geom,
        };
    }

    let text = kid(sp, "txbx").and_then(|t| kid(t, "txbxContent")).map(|c| paragraphs(c, cx)).unwrap_or_default();
    let body = kid(sp, "bodyPr");
    let ins = |attr: &str, default: f32| body.and_then(|b| b.attribute(attr)).and_then(|v| v.trim().parse::<f32>().ok()).map_or(default, |v| v / EMU);
    let inset = [ins("lIns", INSET[0]), ins("tIns", INSET[1]), ins("rIns", INSET[2]), ins("bIns", INSET[3])];
    let valign = match body.and_then(|b| b.attribute("anchor")) {
        Some("ctr") => "middle",
        Some("b") => "bottom",
        _ => "top",
    };
    let ink = if text.is_empty() { None } else { sref("fontRef").and_then(|r| cx.color(r)) };
    Part { geom, x, y, w, h, rot: xfrm.map_or(0.0, rot_of), fill, line, line_w, dash, d, heads, inset, valign, ink, text, media: None }
}

fn dash_of(v: &str) -> Option<&'static str> {
    match v {
        "solid" => None,
        "dot" | "sysDot" => Some("dot"),
        v if v.contains("DashDot") || v == "dashDot" => Some("dashdot"),
        _ => Some("dash"),
    }
}

/// Polygone d'une forme prédéfinie courante, en points ; les autres se
/// dessinent comme leur cadre.
fn preset_points(prst: &str, w: f32, h: f32) -> Option<Vec<[f32; 2]>> {
    let s = (w.min(h) * 0.5).min(w).min(h);
    let (a, b) = (h * 0.25, w * 0.25);
    Some(match prst {
        "triangle" | "flowChartExtract" => vec![[w / 2.0, 0.0], [w, h], [0.0, h]],
        "rtTriangle" => vec![[0.0, 0.0], [w, h], [0.0, h]],
        "diamond" | "flowChartDecision" => vec![[w / 2.0, 0.0], [w, h / 2.0], [w / 2.0, h], [0.0, h / 2.0]],
        "parallelogram" => vec![[s / 2.0, 0.0], [w, 0.0], [w - s / 2.0, h], [0.0, h]],
        "rightArrow" => vec![[0.0, a], [w - s, a], [w - s, 0.0], [w, h / 2.0], [w - s, h], [w - s, h - a], [0.0, h - a]],
        "leftArrow" => vec![[w, a], [s, a], [s, 0.0], [0.0, h / 2.0], [s, h], [s, h - a], [w, h - a]],
        "downArrow" => vec![[b, 0.0], [b, h - s], [0.0, h - s], [w / 2.0, h], [w, h - s], [w - b, h - s], [w - b, 0.0]],
        "upArrow" => vec![[b, h], [b, s], [0.0, s], [w / 2.0, 0.0], [w, s], [w - b, s], [w - b, h]],
        "leftRightArrow" => vec![[0.0, h / 2.0], [s, 0.0], [s, a], [w - s, a], [w - s, 0.0], [w, h / 2.0], [w - s, h], [w - s, h - a], [s, h - a], [s, h]],
        _ => return None,
    })
}

fn poly(points: &[[f32; 2]], w: f32, h: f32, flip_h: bool, flip_v: bool) -> String {
    let mut d = String::new();
    for (i, [x, y]) in points.iter().enumerate() {
        let (x, y) = (if flip_h { w - x } else { *x }, if flip_v { h - y } else { *y });
        let _ = write!(d, "{}{x:.2} {y:.2}", if i == 0 { 'M' } else { 'L' });
    }
    d.push('Z');
    d
}

/// Pointes de flèche d'un trait de `from` à `to` : au départ (`head`) et à
/// l'arrivée (`tail`), comme les nomme DrawingML.
fn arrow_heads(from: [f32; 2], to: [f32; 2], line_w: f32, head: bool, tail: bool) -> Option<String> {
    let (dx, dy) = (to[0] - from[0], to[1] - from[1]);
    let len = (dx * dx + dy * dy).sqrt();
    if len < 0.01 || !(head || tail) {
        return None;
    }
    let (ux, uy) = (dx / len, dy / len);
    let size = (line_w.max(0.75) * 3.5).max(6.0).min(len);
    let half = size * 0.4;
    let mut d = String::new();
    let mut tip = |[x, y]: [f32; 2], sign: f32| {
        let (bx, by) = (x - sign * ux * size, y - sign * uy * size);
        let _ = write!(d, "M{x:.2} {y:.2}L{:.2} {:.2}L{:.2} {:.2}Z", bx - uy * half, by + ux * half, bx + uy * half, by - ux * half);
    };
    if tail {
        tip(to, 1.0);
    }
    if head {
        tip(from, -1.0);
    }
    Some(d)
}

/// Tracé libre (`a:custGeom`) en `d` de SVG, à l'échelle de la pièce.
/// `ew`, `eh` : étendue de la forme dans ses propres unités (points avant
/// la mise à l'échelle du groupe).
fn custom_path(cust: Node, ew: f32, eh: f32, w: f32, h: f32, flip_h: bool, flip_v: bool) -> Option<String> {
    let list = kid(cust, "pathLst")?;
    let mut d = String::new();
    for path in list.children().filter(|n| n.is_element() && local(*n) == "path") {
        // Sans `w`/`h`, les points sont en EMU dans l'étendue de la forme.
        let num = |a: &str| path.attribute(a).and_then(|v| v.trim().parse::<f32>().ok()).filter(|v| *v > 0.0);
        let (pw, ph) = (num("w").unwrap_or(ew * EMU), num("h").unwrap_or(eh * EMU));
        if pw <= 0.0 || ph <= 0.0 {
            continue;
        }
        let (sx, sy) = (w / pw, h / ph);
        let at = |pt: Node| -> Option<[f32; 2]> {
            let x = pt.attribute("x")?.trim().parse::<f32>().ok()? * sx;
            let y = pt.attribute("y")?.trim().parse::<f32>().ok()? * sy;
            Some([if flip_h { w - x } else { x }, if flip_v { h - y } else { y }])
        };
        let mut cur: Option<[f32; 2]> = None;
        for cmd in path.children().filter(|n| n.is_element()) {
            let pts: Vec<[f32; 2]> = cmd.children().filter(|n| n.is_element() && local(*n) == "pt").filter_map(at).collect();
            let letter = match (local(cmd), pts.len()) {
                ("moveTo", 1) => 'M',
                ("lnTo", 1) => 'L',
                ("quadBezTo", 2) => 'Q',
                ("cubicBezTo", 3) => 'C',
                ("close", _) => {
                    d.push('Z');
                    continue;
                }
                ("arcTo", _) => {
                    // Arc d'ellipse depuis le point courant : rayons et angles en 60 000es de degré.
                    let f = |a: &str| cmd.attribute(a).and_then(|v| v.trim().parse::<f32>().ok());
                    if let (Some([x0, y0]), Some(wr), Some(hr), Some(st), Some(sw)) = (cur, f("wR"), f("hR"), f("stAng"), f("swAng")) {
                        let (rx, ry) = (wr * sx, hr * sy);
                        let (a0, a1) = ((st / 60_000.0).to_radians(), ((st + sw) / 60_000.0).to_radians());
                        let (fx, fy) = (if flip_h { -1.0 } else { 1.0 }, if flip_v { -1.0 } else { 1.0 });
                        let (cx0, cy0) = (x0 - fx * rx * a0.cos(), y0 - fy * ry * a0.sin());
                        let (x1, y1) = (cx0 + fx * rx * a1.cos(), cy0 + fy * ry * a1.sin());
                        let large = (sw.abs() / 60_000.0 > 180.0) as u8;
                        let sweep = ((sw > 0.0) == (flip_h == flip_v)) as u8;
                        let _ = write!(d, "A{rx:.2} {ry:.2} 0 {large} {sweep} {x1:.2} {y1:.2}");
                        cur = Some([x1, y1]);
                    }
                    continue;
                }
                _ => continue,
            };
            d.push(letter);
            for (i, [x, y]) in pts.iter().enumerate() {
                let _ = write!(d, "{}{x:.2} {y:.2}", if i == 0 { "" } else { " " });
            }
            cur = pts.last().copied();
        }
    }
    d.starts_with('M').then_some(d)
}

// ------------------------------------------------------------ VML

/// Propriétés d'un attribut `style` de VML (`position:absolute;width:…`).
struct Css<'a>(Vec<(&'a str, &'a str)>);

impl<'a> Css<'a> {
    fn parse(style: &'a str) -> Self {
        Css(style.split(';').filter_map(|kv| kv.split_once(':')).map(|(k, v)| (k.trim(), v.trim())).collect())
    }
    fn get(&self, key: &str) -> Option<&'a str> {
        self.0.iter().rev().find(|(k, _)| k.eq_ignore_ascii_case(key)).map(|(_, v)| *v)
    }
    /// Longueur en points.
    fn pt(&self, key: &str) -> Option<f32> {
        self.get(key).and_then(len_pt)
    }
    /// Nombre nu, dans les unités d'un groupe.
    fn num(&self, key: &str) -> Option<f32> {
        self.get(key).and_then(|v| leading_number(v).map(|(n, _)| n))
    }
}

fn leading_number(v: &str) -> Option<(f32, &str)> {
    let v = v.trim();
    let end = v.find(|c: char| !(c.is_ascii_digit() || matches!(c, '.' | '-' | '+'))).unwrap_or(v.len());
    let n = if v[..end].starts_with('.') { format!("0{}", &v[..end]) } else { v[..end].to_string() };
    n.parse::<f32>().ok().map(|n| (n, v[end..].trim()))
}

/// Longueur de VML ou de CSS en points (`87.05pt`, `1in`, `2.5cm`, `120px`).
fn len_pt(v: &str) -> Option<f32> {
    let (n, unit) = leading_number(v)?;
    Some(match unit {
        "pt" => n,
        "in" => n * 72.0,
        "cm" => n * 72.0 / 2.54,
        "mm" => n * 72.0 / 25.4,
        "pc" => n * 12.0,
        "emu" => n / EMU,
        // « px » ou rien : pixels à 96 ppp.
        _ => n * 0.75,
    })
}

/// Couleur de VML : `#f79646`, `#fff`, `white [3201]`, `red`.
fn vml_color(v: &str) -> Option<String> {
    let v = v.split_whitespace().next()?.to_ascii_lowercase();
    if let Some(hex) = v.strip_prefix('#') {
        let full = match hex.len() {
            3 => hex.chars().flat_map(|c| [c, c]).collect::<String>(),
            _ => hex.to_string(),
        };
        return is_hex(&full).then(|| full.to_ascii_uppercase());
    }
    Some(
        match v.as_str() {
            "black" | "windowtext" => "000000",
            "white" | "window" => "FFFFFF",
            "red" => "FF0000",
            "green" => "008000",
            "lime" => "00FF00",
            "blue" => "0000FF",
            "yellow" => "FFFF00",
            "orange" => "FFA500",
            "gray" | "grey" => "808080",
            "silver" => "C0C0C0",
            "maroon" => "800000",
            "navy" => "000080",
            "purple" => "800080",
            "teal" => "008080",
            "olive" => "808000",
            "aqua" | "cyan" => "00FFFF",
            "fuchsia" | "magenta" => "FF00FF",
            _ => return None,
        }
        .to_string(),
    )
}

fn is_vml_shape(n: Node) -> bool {
    n.is_element() && n.tag_name().namespace() == Some(V) && matches!(local(n), "rect" | "roundrect" | "oval" | "line" | "shape" | "group" | "polyline")
}

fn vml(pict: Node, cx: &Cx, in_cell: bool) -> Option<Shape> {
    let el = pict.children().find(|c| is_vml_shape(*c))?;
    let st = Css::parse(el.attribute("style").unwrap_or(""));
    let (mut w, mut h) = (st.pt("width").unwrap_or(0.0), st.pt("height").unwrap_or(0.0));
    let (mut x, mut y) = (st.pt("margin-left").or(st.pt("left")).unwrap_or(0.0), st.pt("margin-top").or(st.pt("top")).unwrap_or(0.0));
    let mut parts = Vec::new();
    if local(el) == "group" {
        vml_group(el, Tf::ID, [0.0, 0.0, w, h], cx, &mut parts, 0);
    } else if local(el) == "line" {
        // Trait : ses deux bouts, mesurés depuis l'ancrage.
        let [x1, y1, x2, y2] = line_ends(el, len_pt)?;
        (x, y, w, h) = (x + x1.min(x2), y + y1.min(y2), (x2 - x1).abs(), (y2 - y1).abs());
        parts.push(vml_line(el, [x1 - x1.min(x2), y1 - y1.min(y2), x2 - x1.min(x2), y2 - y1.min(y2)], [0.0, 0.0, w, h]));
    } else if let Some(p) = vml_part(el, [0.0, 0.0, w, h], cx) {
        parts.push(p);
    }
    if parts.is_empty() || (w <= 0.0 && h <= 0.0) {
        return None;
    }
    let mut s = Shape { w, h, wrap: "inline", parts, ..Default::default() };
    if !st.get("position").is_some_and(|p| p.eq_ignore_ascii_case("absolute")) {
        return Some(s);
    }
    s.z = st.get("z-index").and_then(|z| z.parse().ok()).unwrap_or(0);
    let wrap = el.children().find(|c| c.is_element() && local(*c) == "wrap");
    s.wrap = match wrap.and_then(|w| w.attribute("type")) {
        Some("square" | "tight" | "through") => "square",
        Some("topAndBottom") => "topAndBottom",
        _ if s.z < 0 => "behind",
        _ => "front",
    };
    let rel = |v: Option<&str>| match v.map(str::to_ascii_lowercase).as_deref() {
        Some("page") => "page",
        Some("margin") => "margin",
        Some("left-margin-area" | "inner-margin-area") => "leftMargin",
        Some("right-margin-area" | "outer-margin-area") => "rightMargin",
        Some("top-margin-area") => "topMargin",
        Some("bottom-margin-area") => "bottomMargin",
        _ => "paragraph",
    };
    let (hf, vf) = (rel(st.get("mso-position-horizontal-relative")), rel(st.get("mso-position-vertical-relative")));
    let hp = match st.get("mso-position-horizontal") {
        Some(a @ ("left" | "center" | "right" | "inside" | "outside")) => Pos::Align(a),
        _ => Pos::Offset(x),
    };
    let vp = match st.get("mso-position-vertical") {
        Some(a @ ("top" | "center" | "bottom" | "inside" | "outside")) => Pos::Align(a),
        _ => Pos::Offset(y),
    };
    place(&mut s, if hf == "paragraph" { "column" } else { hf }, hp, vf, vp, cx, in_cell);
    Some(s)
}

/// Bouts d'un `v:line` (`from="9pt,10.9pt" to="153pt,10.9pt"`).
fn line_ends(el: Node, unit: impl Fn(&str) -> Option<f32>) -> Option<[f32; 4]> {
    let pair = |attr: &str| -> Option<(f32, f32)> {
        let (a, b) = el.attribute(attr)?.split_once(',')?;
        Some((unit(a)?, unit(b)?))
    };
    let ((x1, y1), (x2, y2)) = (pair("from")?, pair("to")?);
    Some([x1, y1, x2, y2])
}

fn vml_group(group: Node, tf: Tf, outer: [f32; 4], cx: &Cx, out: &mut Vec<Part>, depth: usize) {
    let pair = |attr: &str, default: (f32, f32)| group.attribute(attr).and_then(|v| v.split_once(',')).and_then(|(a, b)| Some((a.trim().parse::<f32>().ok()?, b.trim().parse::<f32>().ok()?))).unwrap_or(default);
    let (ox, oy) = pair("coordorigin", (0.0, 0.0));
    let (cw, ch) = pair("coordsize", (1000.0, 1000.0));
    let t = tf.group(outer, [ox, oy, cw, ch]);
    for c in group.children().filter(|c| is_vml_shape(*c)) {
        if out.len() >= MAX_PARTS || depth > MAX_DEPTH {
            return;
        }
        let st = Css::parse(c.attribute("style").unwrap_or(""));
        let rect = [st.num("left").unwrap_or(0.0), st.num("top").unwrap_or(0.0), st.num("width").unwrap_or(0.0), st.num("height").unwrap_or(0.0)];
        match local(c) {
            "group" => vml_group(c, t, rect, cx, out, depth + 1),
            "line" => {
                if let Some([x1, y1, x2, y2]) = line_ends(c, |v| leading_number(v).map(|(n, _)| n)) {
                    let [a, b, _, _] = t.rect([x1, y1, 0.0, 0.0]);
                    let [e, f, _, _] = t.rect([x2, y2, 0.0, 0.0]);
                    let (l, tp) = (a.min(e), b.min(f));
                    out.push(vml_line(c, [a - l, b - tp, e - l, f - tp], [l, tp, (e - a).abs(), (f - b).abs()]));
                }
            }
            _ => {
                if let Some(p) = vml_part(c, t.rect(rect), cx) {
                    out.push(p);
                }
            }
        }
    }
}

/// Trait et fond d'une forme VML : blanc bordé de noir (0,75 pt) par défaut.
fn vml_paint(el: Node) -> (Option<String>, Option<String>, f32, Option<&'static str>, bool, bool) {
    let off = |v: Option<&str>| matches!(v, Some("f" | "false" | "0"));
    let fill_el = kid(el, "fill");
    let fill = if off(el.attribute("filled")) || fill_el.is_some_and(|f| off(f.attribute("on"))) {
        None
    } else {
        el.attribute("fillcolor").or(fill_el.and_then(|f| f.attribute("color"))).map_or(Some("FFFFFF".into()), vml_color)
    };
    let stroke_el = kid(el, "stroke");
    let (line, line_w) = if off(el.attribute("stroked")) || stroke_el.is_some_and(|s| off(s.attribute("on"))) {
        (None, 0.0)
    } else {
        let color = el.attribute("strokecolor").and_then(vml_color).unwrap_or_else(|| "000000".into());
        (Some(color), el.attribute("strokeweight").and_then(len_pt).unwrap_or(0.75))
    };
    let dash = stroke_el.and_then(|s| s.attribute("dashstyle")).and_then(|d| match d.to_ascii_lowercase().as_str() {
        "solid" => None,
        "dot" | "1 1" | "shortdot" | "sysdot" => Some("dot"),
        d if d.contains("dashdot") => Some("dashdot"),
        _ => Some("dash"),
    });
    let arrow = |a: &str| stroke_el.and_then(|s| s.attribute(a)).is_some_and(|t| t != "none");
    (fill, line, line_w, dash, arrow("startarrow"), arrow("endarrow"))
}

fn vml_line(el: Node, [x1, y1, x2, y2]: [f32; 4], [x, y, w, h]: [f32; 4]) -> Part {
    let (_, line, line_w, dash, head, tail) = vml_paint(el);
    Part {
        geom: "path",
        x,
        y,
        w,
        h,
        line,
        line_w,
        dash,
        d: Some(format!("M{x1:.2} {y1:.2}L{x2:.2} {y2:.2}")),
        heads: arrow_heads([x1, y1], [x2, y2], line_w, head, tail),
        inset: INSET,
        valign: "top",
        ..Default::default()
    }
}

fn vml_part(el: Node, [x, y, w, h]: [f32; 4], cx: &Cx) -> Option<Part> {
    let st = Css::parse(el.attribute("style").unwrap_or(""));
    let rot = st.get("rotation").and_then(|r| leading_number(r)).map_or(0.0, |(n, _)| n);
    if let Some(rel) = kid(el, "imagedata").and_then(|i| i.attribute((R, "id"))) {
        return Some(Part { geom: "image", x, y, w, h, rot, inset: INSET, valign: "top", media: Some(rel.to_string()), ..Default::default() });
    }
    let (fill, line, line_w, dash, _, _) = vml_paint(el);
    let geom = match local(el) {
        "roundrect" => "round",
        "oval" => "ellipse",
        _ => "rect",
    };
    let boxed = kid(el, "textbox");
    let text = boxed.and_then(|t| t.children().find(|c| is_w(*c, "txbxContent"))).map(|c| paragraphs(c, cx)).unwrap_or_default();
    let mut inset = INSET;
    if let Some(v) = boxed.and_then(|t| t.attribute("inset")) {
        for (i, part) in v.split(',').take(4).enumerate() {
            if let Some(p) = len_pt(part) {
                inset[i] = p;
            }
        }
    }
    let valign = match st.get("v-text-anchor") {
        Some("middle") => "middle",
        Some("bottom") => "bottom",
        _ => "top",
    };
    Some(Part { geom, x, y, w, h, rot, fill, line, line_w, dash, inset, valign, text, ..Default::default() })
}

// ------------------------------------------------------------ texte

/// Paragraphes d'un `w:txbxContent` (tableaux et contrôles traversés).
fn paragraphs(content: Node, cx: &Cx) -> Vec<TextPara> {
    fn blocks(parent: Node, cx: &Cx, out: &mut Vec<TextPara>, depth: usize) {
        for c in parent.children().filter(|n| n.is_element()) {
            if is_w(c, "p") {
                out.push(para(c, cx));
            } else if depth < MAX_DEPTH && ["tbl", "tr", "tc", "sdt", "sdtContent", "customXml"].iter().any(|t| is_w(c, t)) {
                blocks(c, cx, out, depth + 1);
            }
        }
    }
    let mut out = Vec::new();
    blocks(content, cx, &mut out, 0);
    out
}

fn para(p: Node, cx: &Cx) -> TextPara {
    let mut runs: Vec<TextRun> = Vec::new();
    // Champs ouverts : vrai tant qu'on lit leur instruction (cachée).
    let mut fields: Vec<bool> = Vec::new();
    inline(p, cx, &mut runs, &mut fields, 0);
    let mut merged: Vec<TextRun> = Vec::new();
    for r in runs {
        match merged.last_mut() {
            Some(last) if TextRun { text: String::new(), ..last.clone() } == TextRun { text: String::new(), ..r.clone() } => last.text.push_str(&r.text),
            _ => merged.push(r),
        }
    }
    TextPara { look: cx.styles.paragraph(p), list: w_child(p, "pPr").and_then(|n| w_child(n, "numPr")).is_some(), runs: merged }
}

fn inline(node: Node, cx: &Cx, runs: &mut Vec<TextRun>, fields: &mut Vec<bool>, depth: usize) {
    for c in node.children().filter(|n| n.is_element()) {
        let (ns, name) = (c.tag_name().namespace(), local(c));
        if ns == Some(M) && (name == "oMath" || name == "oMathPara") {
            let text: String = c.descendants().filter(|n| n.tag_name().namespace() == Some(M) && local(*n) == "t").filter_map(|n| n.text()).collect();
            if !text.is_empty() {
                runs.push(TextRun { text, ..Default::default() });
            }
            continue;
        }
        if ns != Some(W) {
            continue;
        }
        match name {
            "r" => run(c, cx, runs, fields),
            "ins" | "moveTo" | "hyperlink" | "smartTag" | "customXml" | "fldSimple" | "sdt" | "sdtContent" | "dir" | "bdo" if depth < MAX_DEPTH => inline(c, cx, runs, fields, depth + 1),
            // Suppressions en suivi : hors du texte courant.
            _ => {}
        }
    }
}

fn run(r: Node, cx: &Cx, runs: &mut Vec<TextRun>, fields: &mut Vec<bool>) {
    let rpr = w_child(r, "rPr");
    let f = crate::walk::fmt_of(rpr);
    let cs = f.style.as_deref().map(|id| cx.styles.character(id)).unwrap_or_default();
    let color = rpr
        .and_then(|n| w_child(n, "color"))
        .and_then(|n| w_attr(n, "val"))
        .filter(|v| is_hex(v))
        .map(str::to_ascii_uppercase)
        .or(cs.color.filter(|c| is_hex(c)));
    let mut text = String::new();
    for c in r.children().filter(|n| n.is_element() && n.tag_name().namespace() == Some(W)) {
        let shown = fields.iter().all(|instr| !instr);
        match local(c) {
            "t" if shown => text.push_str(c.text().unwrap_or("")),
            "tab" | "ptab" if shown => text.push('\t'),
            "br" | "cr" if shown => text.push('\n'),
            "noBreakHyphen" if shown => text.push('\u{2011}'),
            "fldChar" => match w_attr(c, "fldCharType") {
                Some("begin") => fields.push(true),
                Some("separate") => {
                    if let Some(last) = fields.last_mut() {
                        *last = false;
                    }
                }
                Some("end") => {
                    fields.pop();
                }
                _ => {}
            },
            _ => {}
        }
    }
    if text.is_empty() {
        return;
    }
    runs.push(TextRun {
        text,
        b: f.b || cs.b == Some(true),
        i: f.i || cs.i == Some(true),
        u: f.u,
        strike: f.strike,
        sup: f.sup,
        sub: f.sub,
        font: f.font.or(cs.font),
        size: f.size.map(|s| s as f32 / 2.0).or(cs.size),
        color,
        highlight: f.highlight,
    });
}

// ------------------------------------------------------------ rendu SVG

/// Figure sur laquelle les dessins sont posés : ses octets (PNG, JPEG, GIF,
/// WebP ou SVG) et sa place, en points, dans le repère des dessins.
pub struct Backdrop<'a> {
    pub bytes: &'a [u8],
    pub mime: &'a str,
    pub rect: [f32; 4],
}

/// Images des groupes, déjà lisibles (PNG, JPEG…) : relation → (octets, type).
pub type Pictures = std::collections::HashMap<String, (Vec<u8>, &'static str)>;

/// La figure d'un paragraphe qui ne contient qu'elle : son segment et sa
/// place, en points, dans le repère des dessins du paragraphe (bord gauche
/// de la colonne, haut du texte). Les zones de texte qu'un auteur pose sur
/// un schéma sont ancrées à ce paragraphe : c'est sur cette figure qu'elles
/// se dessinent. `None` : paragraphe de cellule, texte ou autre figure à
/// côté, on ne sait pas où elle tombe.
pub fn lone_figure(para: &crate::model::Para, page: Option<&Page>) -> Option<(usize, [f32; 4])> {
    if para.cell.is_some() {
        return None;
    }
    let mut found = None;
    for (i, s) in para.segments.iter().enumerate() {
        if matches!(s.rev, Some("del" | "moveFrom")) {
            continue;
        }
        if s.media.is_some() {
            if found.replace(i).is_some() {
                return None;
            }
        } else if let Some(k) = s.shape {
            // Un dessin dans la ligne pousse la figure ; flottant, non.
            if para.shapes.get(k).is_none_or(|sh| !sh.floats()) {
                return None;
            }
        } else if !s.text.trim().is_empty() {
            return None;
        }
    }
    let i = found?;
    let s = &para.segments[i];
    let (w, h) = (s.width? as f32 * 0.75, s.height? as f32 * 0.75);
    let (left, right) = (para.look.left.unwrap_or(0.0), para.look.right.unwrap_or(0.0));
    let x = match (para.look.align.as_deref(), page) {
        (Some("center"), Some(p)) => left + (p.width - p.left - p.right - left - right - w) / 2.0,
        (Some("right"), Some(p)) => p.width - p.left - p.right - right - w,
        (Some("center" | "right"), None) => return None,
        _ => left + para.look.first.unwrap_or(0.0),
    };
    Some((i, [x, 0.0, w, h]))
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Largeur approchée d'un signe, en cadratins (police sans empattement).
fn char_em(c: char) -> f32 {
    match c {
        ' ' | '\u{a0}' => 0.29,
        'i' | 'j' | 'l' | '.' | ',' | ';' | ':' | '\'' | '\u{2019}' | '!' | '|' | 'I' => 0.28,
        'f' | 't' | 'r' | '(' | ')' | '[' | ']' | '-' | '\u{2011}' | '/' | '"' => 0.36,
        'm' | 'w' => 0.84,
        'M' | 'W' => 0.9,
        '\u{2013}' | '=' | '+' | '<' | '>' | '~' => 0.6,
        '\u{2014}' => 1.0,
        c if c.is_ascii_digit() => 0.58,
        c if c.is_uppercase() => 0.7,
        _ => 0.56,
    }
}

struct Chunk<'a> {
    text: String,
    run: &'a TextRun,
    width: f32,
}

struct Line<'a> {
    chunks: Vec<Chunk<'a>>,
    /// Haut de la ligne et sa hauteur, en points depuis le haut du texte.
    top: f32,
    height: f32,
    size: f32,
    align: &'static str,
    /// Apparence du paragraphe de la ligne (police, gras, couleur).
    look: &'a Look,
}

fn run_size(r: &TextRun, default: f32) -> f32 {
    let s = r.size.unwrap_or(default);
    if r.sup || r.sub { s * 0.65 } else { s }
}

/// Ferme la ligne en cours : la range dans `lines` et descend d'une ligne.
fn close<'a>(cur: &mut Vec<Chunk<'a>>, cur_w: &mut f32, y: &mut f32, lines: &mut Vec<Line<'a>>, p: &'a TextPara, default: f32, align: &'static str) {
    // Les espaces de fin de ligne ne comptent pas.
    while cur.last().is_some_and(|c| c.text.trim().is_empty()) {
        let c = cur.pop().unwrap();
        *cur_w -= c.width;
    }
    let size = cur.iter().map(|c| run_size(c.run, default)).fold(0.0f32, f32::max).max(if cur.is_empty() { default } else { 0.0 });
    let height = p.look.line_exact.unwrap_or_else(|| (size * 1.2 * p.look.line.unwrap_or(1.0)).max(p.look.line_min.unwrap_or(0.0)));
    lines.push(Line { chunks: std::mem::take(cur), top: *y, height, size, align, look: &p.look });
    *y += height;
    *cur_w = 0.0;
}

/// Coupe le texte d'une zone en lignes qui tiennent dans `width` points.
/// Rend les lignes et la hauteur totale.
fn lay_out(text: &[TextPara], width: f32) -> (Vec<Line<'_>>, f32) {
    let mut lines: Vec<Line> = Vec::new();
    let mut y = 0.0f32;
    for (k, p) in text.iter().enumerate() {
        let default = p.look.size.unwrap_or(10.0).max(1.0);
        let align = match p.look.align.as_deref() {
            Some("center") => "middle",
            Some("right") => "end",
            _ => "start",
        };
        y += p.look.before.unwrap_or(0.0);
        let mut cur: Vec<Chunk> = Vec::new();
        let mut cur_w = 0.0f32;
        if p.list {
            static BULLET: std::sync::OnceLock<TextRun> = std::sync::OnceLock::new();
            let b = BULLET.get_or_init(TextRun::default);
            let w = default * 0.9;
            cur.push(Chunk { text: "\u{2022} ".into(), run: b, width: w });
            cur_w += w;
        }
        for r in &p.runs {
            let size = run_size(r, default);
            let em = |s: &str| s.chars().map(char_em).sum::<f32>() * size * if r.b || p.look.b == Some(true) { 1.07 } else { 1.0 };
            // Mots et blancs, tour à tour ; un saut de ligne ferme la ligne.
            let mut rest = r.text.as_str();
            while !rest.is_empty() {
                let first = rest.chars().next().unwrap();
                if first == '\n' {
                    close(&mut cur, &mut cur_w, &mut y, &mut lines, p, default, align);
                    rest = &rest[1..];
                    continue;
                }
                let blank = first == ' ' || first == '\t';
                let end = rest.find(|c: char| c == '\n' || ((c == ' ' || c == '\t') != blank)).unwrap_or(rest.len());
                let piece = rest[..end].replace('\t', "    ");
                rest = &rest[end..];
                let w = em(&piece);
                if !blank && cur_w + w > width && !cur.is_empty() {
                    close(&mut cur, &mut cur_w, &mut y, &mut lines, p, default, align);
                }
                if blank && cur.is_empty() {
                    continue; // pas de blanc en tête de ligne coupée
                }
                match cur.last_mut() {
                    Some(last) if std::ptr::eq(last.run, r) => {
                        last.text.push_str(&piece);
                        last.width += w;
                    }
                    _ => cur.push(Chunk { text: piece, run: r, width: w }),
                }
                cur_w += w;
            }
        }
        close(&mut cur, &mut cur_w, &mut y, &mut lines, p, default, align);
        // L'espace après le dernier paragraphe ne compte pas dans la zone.
        if k + 1 < text.len() {
            y += p.look.after.unwrap_or(0.0);
        }
    }
    (lines, y)
}

fn paint(fill: Option<&str>, line: Option<&str>, line_w: f32, dash: Option<&str>) -> String {
    let mut a = match fill {
        Some(f) => format!(r##"fill="#{f}""##),
        None => r#"fill="none""#.to_string(),
    };
    match line {
        Some(c) => {
            let w = line_w.max(0.25);
            let _ = write!(a, r##" stroke="#{c}" stroke-width="{w:.2}""##);
            let pattern = match dash {
                Some("dot") => Some(format!("{:.2} {:.2}", w, w * 2.0)),
                Some("dashdot") => Some(format!("{:.2} {:.2} {:.2} {:.2}", w * 4.0, w * 2.0, w, w * 2.0)),
                Some(_) => Some(format!("{:.2} {:.2}", w * 4.0, w * 3.0)),
                None => None,
            };
            if let Some(p) = pattern {
                let _ = write!(a, r#" stroke-dasharray="{p}""#);
            }
        }
        None => a.push_str(r#" stroke="none""#),
    }
    a
}

/// Texte d'une pièce : ses lignes et la hauteur qu'il lui faut.
fn part_text(part: &Part) -> (Vec<Line<'_>>, f32) {
    if part.text.is_empty() {
        return (Vec::new(), 0.0);
    }
    let width = (part.w - part.inset[0] - part.inset[2]).max(12.0);
    lay_out(&part.text, width)
}

/// Hauteur d'une pièce une fois son texte logé (une zone de texte trop
/// petite pour la police de repli s'allonge plutôt que de couper le texte).
fn grown(part: &Part) -> f32 {
    let (_, th) = part_text(part);
    if part.text.is_empty() { part.h } else { part.h.max(th + part.inset[1] + part.inset[3]) }
}

fn draw_part(svg: &mut String, part: &Part, ox: f32, oy: f32, pictures: &Pictures) {
    let (x, y, w) = (ox + part.x, oy + part.y, part.w);
    let h = grown(part);
    let _ = write!(svg, r#"<g transform="translate({x:.2} {y:.2})"#);
    if part.rot != 0.0 {
        let _ = write!(svg, " rotate({:.2} {:.2} {:.2})", part.rot, w / 2.0, h / 2.0);
    }
    svg.push_str(r#"">"#);
    let style = paint(part.fill.as_deref(), part.line.as_deref(), part.line_w, part.dash);
    match part.geom {
        "ellipse" => {
            let _ = write!(svg, r#"<ellipse cx="{:.2}" cy="{:.2}" rx="{:.2}" ry="{:.2}" {style}/>"#, w / 2.0, h / 2.0, w / 2.0, h / 2.0);
        }
        "round" => {
            let _ = write!(svg, r#"<rect width="{w:.2}" height="{h:.2}" rx="{:.2}" {style}/>"#, w.min(h) / 6.0);
        }
        "path" => {
            if let Some(d) = &part.d {
                let _ = write!(svg, r#"<path d="{}" {style}/>"#, esc(d));
            }
            if let (Some(d), Some(c)) = (&part.heads, &part.line) {
                let _ = write!(svg, r##"<path d="{}" fill="#{c}" stroke="none"/>"##, esc(d));
            }
        }
        // Image d'un groupe : celle que l'appelant a chargée, sinon son cadre en pointillé.
        "image" => match part.media.as_deref().and_then(|rel| pictures.get(rel)) {
            Some((bytes, mime)) => {
                use base64::Engine as _;
                let data = base64::engine::general_purpose::STANDARD.encode(bytes);
                let _ = write!(svg, r#"<image href="data:{};base64,{data}" width="{w:.2}" height="{h:.2}" preserveAspectRatio="none"/>"#, esc(mime));
            }
            None => {
                let _ = write!(svg, r##"<rect width="{w:.2}" height="{h:.2}" fill="none" stroke="#7F7F7F" stroke-width="0.75" stroke-dasharray="3 3"/>"##);
            }
        },
        _ => {
            let _ = write!(svg, r#"<rect width="{w:.2}" height="{h:.2}" {style}/>"#);
        }
    }
    let (lines, th) = part_text(part);
    if !lines.is_empty() {
        let inner_w = (w - part.inset[0] - part.inset[2]).max(12.0);
        let room = h - part.inset[1] - part.inset[3];
        let top = part.inset[1]
            + match part.valign {
                "middle" => ((room - th) / 2.0).max(0.0),
                "bottom" => (room - th).max(0.0),
                _ => 0.0,
            };
        let ink = part.ink.as_deref().unwrap_or("000000");
        for l in &lines {
            if l.chunks.is_empty() {
                continue;
            }
            let tx = part.inset[0]
                + match l.align {
                    "middle" => inner_w / 2.0,
                    "end" => inner_w,
                    _ => 0.0,
                };
            let base = top + l.top + (l.height - l.size) / 2.0 + l.size * 0.8;
            let font = l.look.font.as_deref();
            let ink = l.look.color.as_deref().filter(|c| is_hex(c)).unwrap_or(ink);
            let family = match font.filter(|f| !f.is_empty()) {
                Some(f) => format!("{}, Arial, Helvetica, sans-serif", esc(f)),
                None => "Arial, Helvetica, sans-serif".to_string(),
            };
            let _ = write!(svg, r#"<text xml:space="preserve" x="{tx:.2}" y="{base:.2}" text-anchor="{}" font-family="{family}" font-size="{:.2}">"#, l.align, l.size);
            for c in &l.chunks {
                let r = c.run;
                let _ = write!(svg, r##"<tspan fill="#{}""##, r.color.as_deref().unwrap_or(ink));
                if let Some(f) = r.font.as_deref().filter(|f| font != Some(*f)) {
                    let _ = write!(svg, r#" font-family="{}, Arial, Helvetica, sans-serif""#, esc(f));
                }
                let size = run_size(r, l.size);
                if (size - l.size).abs() > 0.01 {
                    let _ = write!(svg, r#" font-size="{size:.2}""#);
                }
                if r.b || l.look.b == Some(true) {
                    svg.push_str(r#" font-weight="bold""#);
                }
                if r.i || l.look.i == Some(true) {
                    svg.push_str(r#" font-style="italic""#);
                }
                if r.u || r.strike {
                    let _ = write!(svg, r#" text-decoration="{}""#, if r.u { "underline" } else { "line-through" });
                }
                if r.sup || r.sub {
                    let _ = write!(svg, r#" dy="{:.2}""#, if r.sup { -l.size * 0.33 } else { l.size * 0.15 });
                }
                let shown = if l.look.caps == Some(true) { c.text.to_uppercase() } else { c.text.clone() };
                let _ = write!(svg, ">{}</tspan>", esc(&shown));
                if r.sup || r.sub {
                    // Retour à la ligne de base pour la suite.
                    let _ = write!(svg, r#"<tspan dy="{:.2}"></tspan>"#, if r.sup { l.size * 0.33 } else { -l.size * 0.15 });
                }
            }
            svg.push_str("</text>");
        }
    }
    svg.push_str("</g>");
}

/// Dessine les dessins d'un paragraphe en SVG, par-dessus la figure `back`
/// quand ils la recouvrent. Les dessins qui flottent gardent leur place ;
/// ceux du fil du texte (ou ancrés à la page) sont rangés dessous, l'un
/// sous l'autre. Rend le SVG et sa taille en pixels (96 ppp), ou `None`
/// s'il n'y a rien à dessiner.
pub fn compose(shapes: &[&Shape], back: Option<Backdrop>, pictures: &Pictures) -> Option<(String, f64, f64)> {
    use base64::Engine as _;
    if shapes.is_empty() {
        return None;
    }
    let tall = |s: &Shape| s.parts.iter().map(|p| p.y + grown(p)).fold(s.h, f32::max);
    // Cadre de la figure et des dessins qui flottent.
    let (mut l, mut t, mut r, mut b) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    let mut grow = |x: f32, y: f32, w: f32, h: f32| {
        l = l.min(x);
        t = t.min(y);
        r = r.max(x + w);
        b = b.max(y + h);
    };
    if let Some(bk) = &back {
        grow(bk.rect[0], bk.rect[1], bk.rect[2], bk.rect[3]);
    }
    let placed = |s: &Shape| s.floats() && !s.page_y;
    for s in shapes.iter().filter(|s| placed(s)) {
        grow(s.x, s.y, s.w, tall(s));
    }
    if l > r {
        (l, t, r, b) = (0.0, 0.0, 0.0, 0.0);
    }
    // Les autres : sous le reste, l'un sous l'autre.
    let mut stacked: Vec<(&Shape, f32)> = Vec::new();
    let mut cursor = if b > t { b + 8.0 } else { t };
    for s in shapes.iter().filter(|s| !placed(s)) {
        stacked.push((s, cursor));
        r = r.max(l + s.w);
        cursor += tall(s) + 8.0;
        b = cursor - 8.0;
    }
    let pad = 4.0;
    let (vx, vy, vw, vh) = (l - pad, t - pad, (r - l) + 2.0 * pad, (b - t) + 2.0 * pad);
    if !(vw.is_finite() && vh.is_finite()) || vw <= 2.0 * pad || vh <= 2.0 * pad {
        return None;
    }
    let (pw, ph) = ((vw * 4.0 / 3.0) as f64, (vh * 4.0 / 3.0) as f64);
    let mut svg = format!(r#"<svg xmlns="http://www.w3.org/2000/svg" width="{pw:.0}" height="{ph:.0}" viewBox="{vx:.2} {vy:.2} {vw:.2} {vh:.2}">"#);
    let _ = write!(svg, r##"<rect x="{vx:.2}" y="{vy:.2}" width="{vw:.2}" height="{vh:.2}" fill="#FFFFFF"/>"##);
    let mut order: Vec<&&Shape> = shapes.iter().filter(|s| placed(s)).collect();
    order.sort_by_key(|s| s.z);
    let draw = |svg: &mut String, s: &Shape, x: f32, y: f32| {
        for p in &s.parts {
            draw_part(svg, p, x, y, pictures);
        }
    };
    for s in order.iter().filter(|s| s.wrap == "behind") {
        draw(&mut svg, s, s.x, s.y);
    }
    if let Some(bk) = &back {
        let data = base64::engine::general_purpose::STANDARD.encode(bk.bytes);
        let [x, y, w, h] = bk.rect;
        let _ = write!(svg, r#"<image href="data:{};base64,{data}" x="{x:.2}" y="{y:.2}" width="{w:.2}" height="{h:.2}" preserveAspectRatio="none"/>"#, esc(bk.mime));
    }
    for s in order.iter().filter(|s| s.wrap != "behind") {
        draw(&mut svg, s, s.x, s.y);
    }
    for (s, y) in stacked {
        draw(&mut svg, s, l, y);
    }
    svg.push_str("</svg>");
    Some((svg, pw, ph))
}

#[cfg(test)]
mod tests {
    use super::*;

    const NS: &str = r#"xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word""#;

    fn page() -> Page {
        Page { width: 612.0, height: 792.0, top: 46.35, right: 72.0, bottom: 56.75, left: 72.0, header: 28.35, footer: 30.45, line_numbers: None }
    }

    /// Lit le premier dessin de `xml` (un fragment placé dans un `w:r`).
    fn first(xml: &str, in_cell: bool) -> Option<Shape> {
        let text = format!("<w:document {NS}><w:body><w:p><w:r>{xml}</w:r></w:p></w:body></w:document>");
        let doc = crate::xml::parse(&text).unwrap();
        let styles = Styles::parse(None, None);
        let palette = Palette::read(Some(r#"<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:accent6><a:srgbClr val="F79646"/></a:accent6></a:clrScheme><a:fmtScheme><a:lnStyleLst><a:ln w="9525"/><a:ln w="25400"/><a:ln w="38100"/></a:lnStyleLst></a:fmtScheme></a:themeElements></a:theme>"#));
        let pg = page();
        let cx = Cx { styles: &styles, palette: &palette, page: Some(&pg) };
        let run = doc.descendants().find(|n| is_w(*n, "r")).unwrap();
        let node = run.children().find(|n| n.is_element()).unwrap();
        read(node, &cx, in_cell)
    }

    fn anchor(h: &str, v: &str, cx: u32, cy: u32, inner: &str) -> String {
        format!(
            r#"<w:drawing><wp:anchor behindDoc="0" relativeHeight="251661312">{h}{v}<wp:extent cx="{cx}" cy="{cy}"/><wp:wrapNone/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">{inner}</a:graphicData></a:graphic></wp:anchor></w:drawing>"#
        )
    }

    /// Une zone de texte comme Word l'écrit : trait et fond pris au style
    /// de forme (thème), texte centré.
    fn styled_box(text: &str) -> String {
        format!(
            r#"<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2893671" cy="630821"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr><wps:style><a:lnRef idx="2"><a:schemeClr val="accent6"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="lt1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent6"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="dk1"/></a:fontRef></wps:style><wps:txbx><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="00B050"/></w:rPr><w:t>{text}</w:t></w:r></w:p><w:p><w:r><w:t>= 12,5 m</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="ctr"><a:noAutofit/></wps:bodyPr></wps:wsp>"#
        )
    }

    fn alt(choice: &str, fallback: &str) -> String {
        format!(r#"<mc:AlternateContent><mc:Choice Requires="wps">{choice}</mc:Choice><mc:Fallback>{fallback}</mc:Fallback></mc:AlternateContent>"#)
    }

    #[test]
    fn zone_de_texte_ancree_a_la_colonne_et_au_paragraphe() {
        let h = r#"<wp:positionH relativeFrom="column"><wp:posOffset>1105382</wp:posOffset></wp:positionH>"#;
        let v = r#"<wp:positionV relativeFrom="paragraph"><wp:posOffset>4737598</wp:posOffset></wp:positionV>"#;
        let s = first(&alt(&anchor(h, v, 2893671, 630821, &styled_box("Niveau initial")), "<w:pict/>"), false).unwrap();
        assert_eq!(s.wrap, "front");
        assert!((s.x - 87.04).abs() < 0.01 && (s.y - 373.04).abs() < 0.01, "{s:?}");
        assert!((s.w - 227.85).abs() < 0.01 && (s.h - 49.67).abs() < 0.01);
        assert_eq!(s.z, 251661312);
        let p = &s.parts[0];
        assert_eq!((p.geom, p.fill.as_deref(), p.line.as_deref(), p.line_w), ("rect", Some("FFFFFF"), Some("F79646"), 2.0));
        assert_eq!((p.valign, p.ink.as_deref()), ("middle", Some("000000")));
        assert_eq!(p.text[0].look.align.as_deref(), Some("center"));
        assert_eq!(p.text[0].runs[0].color.as_deref(), Some("00B050"));
        assert_eq!(s.text(), "Niveau initial\n= 12,5 m");
        assert_eq!(s.label(), "zone de texte");
    }

    #[test]
    fn alignements_dans_la_marge_et_la_page() {
        let v = r#"<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>"#;
        let center = r#"<wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>"#;
        let s = first(&alt(&anchor(center, v, 2025312, 885464, &styled_box("a")), ""), false).unwrap();
        assert!((s.x - (468.0 - 159.47) / 2.0).abs() < 0.01, "{}", s.x);
        // Dans la marge de gauche, collée au texte : à gauche de la colonne.
        let left = r#"<wp:positionH relativeFrom="leftMargin"><wp:align>right</wp:align></wp:positionH>"#;
        let s = first(&alt(&anchor(left, v, 680085, 241300, &styled_box("T1/H1")), ""), false).unwrap();
        assert!((s.x + 53.55).abs() < 0.01, "{}", s.x);
        // Dans une cellule : la largeur n'est pas connue, l'alignement est laissé au panneau.
        let s = first(&alt(&anchor(center, v, 2025312, 885464, &styled_box("a")), ""), true).unwrap();
        assert_eq!((s.x, s.align), (0.0, Some("center")));
        // Ancrage vertical à la page : depuis le haut de la feuille.
        let page_v = r#"<wp:positionV relativeFrom="page"><wp:posOffset>1270000</wp:posOffset></wp:positionV>"#;
        let s = first(&alt(&anchor(center, page_v, 2025312, 885464, &styled_box("a")), ""), false).unwrap();
        assert!(s.page_y && (s.y - 100.0).abs() < 0.01);
    }

    #[test]
    fn trait_avec_fleche_et_groupe() {
        let line = r#"<wps:wsp><wps:cNvCnPr/><wps:spPr><a:xfrm flipV="1"><a:off x="0" y="0"/><a:ext cx="1270000" cy="635000"/></a:xfrm><a:prstGeom prst="straightConnector1"/><a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:prstDash val="dash"/><a:tailEnd type="triangle"/></a:ln></wps:spPr><wps:bodyPr/></wps:wsp>"#;
        let h = r#"<wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH>"#;
        let v = r#"<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>"#;
        let s = first(&alt(&anchor(h, v, 1270000, 635000, line), ""), false).unwrap();
        let p = &s.parts[0];
        assert_eq!((p.geom, p.d.as_deref(), p.fill.as_deref(), p.dash), ("path", Some("M0.00 50.00L100.00 0.00"), None, Some("dash")));
        assert!(p.heads.as_deref().is_some_and(|d| d.starts_with("M100.00 0.00")), "{:?}", p.heads);
        assert_eq!(s.label(), "trait");

        // Groupe : les enfants vivent dans le repère du groupe, mis à l'échelle du cadre.
        let group = r#"<wpg:wgp><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2540000" cy="1270000"/><a:chOff x="1000" y="1000"/><a:chExt cx="5080000" cy="2540000"/></a:xfrm></wpg:grpSpPr><wps:wsp><wps:spPr><a:xfrm><a:off x="2541000" y="1271000"/><a:ext cx="2540000" cy="1270000"/></a:xfrm><a:prstGeom prst="ellipse"/><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:ln><a:noFill/></a:ln></wps:spPr><wps:bodyPr/></wps:wsp><pic:pic><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill><pic:spPr><a:xfrm><a:off x="1000" y="1000"/><a:ext cx="2540000" cy="1270000"/></a:xfrm></pic:spPr></pic:pic></wpg:wgp>"#;
        let s = first(&alt(&anchor(h, v, 2540000, 1270000, group), ""), false).unwrap();
        assert_eq!(s.parts.len(), 2);
        let e = &s.parts[0];
        assert_eq!((e.geom, e.fill.as_deref(), e.line.as_deref()), ("ellipse", Some("00FF00"), None));
        assert!((e.x - 100.0).abs() < 0.01 && (e.y - 50.0).abs() < 0.01 && (e.w - 100.0).abs() < 0.01 && (e.h - 50.0).abs() < 0.01, "{e:?}");
        assert_eq!((s.parts[1].geom, s.parts[1].media.as_deref()), ("image", Some("rId9")));
        assert_eq!(s.label(), "dessin");
    }

    #[test]
    fn vml_seul_et_repli() {
        let vml = r##"<w:pict><v:shapetype id="_x0000_t202"/><v:rect style="position:absolute;margin-left:87.05pt;margin-top:373.05pt;width:227.85pt;height:49.65pt;z-index:251661312;mso-position-horizontal-relative:text;mso-position-vertical-relative:text;v-text-anchor:middle" fillcolor="white [3201]" strokecolor="#f79646 [3209]" strokeweight="2pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>Ancien Word</w:t></w:r></w:p></w:txbxContent></v:textbox></v:rect></w:pict>"##;
        let s = first(vml, false).unwrap();
        assert_eq!((s.wrap, s.x, s.y, s.w, s.h), ("front", 87.05, 373.05, 227.85, 49.65));
        let p = &s.parts[0];
        assert_eq!((p.fill.as_deref(), p.line.as_deref(), p.line_w, p.valign), (Some("FFFFFF"), Some("F79646"), 2.0, "middle"));
        assert_eq!(s.text(), "Ancien Word");
        // Un choix qu'on ne sait pas lire (encre, graphique récent) : le repli VML sert.
        let s = first(&alt(r#"<w:drawing><wp:inline><wp:extent cx="1" cy="1"/><a:graphic><a:graphicData uri="x"/></a:graphic></wp:inline></w:drawing>"#, vml), false).unwrap();
        assert_eq!(s.text(), "Ancien Word");
        // Sans position absolue : dans la ligne.
        let inline = r#"<w:pict><v:oval style="width:1in;height:36pt" filled="f"><v:textbox inset="0,0,0,0"><w:txbxContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:txbxContent></v:textbox></v:oval></w:pict>"#;
        let s = first(inline, false).unwrap();
        assert_eq!((s.wrap, s.w, s.h, s.parts[0].geom, s.parts[0].fill.as_deref(), s.parts[0].inset), ("inline", 72.0, 36.0, "ellipse", None, [0.0; 4]));
    }

    #[test]
    fn texte_des_champs_et_des_suppressions() {
        let content = r#"<wps:wsp><wps:spPr><a:prstGeom prst="rect"/></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>PAGE</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>3</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:del w:id="1" w:author="x"><w:r><w:delText>ôté</w:delText></w:r></w:del><w:ins w:id="2" w:author="x"><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t> ajouté</w:t></w:r></w:ins></w:p></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp>"#;
        let s = first(&alt(&format!(r#"<w:drawing><wp:inline><wp:extent cx="1270000" cy="635000"/><a:graphic><a:graphicData>{content}</a:graphicData></a:graphic></wp:inline></w:drawing>"#), ""), false).unwrap();
        assert_eq!((s.wrap, s.w, s.h), ("inline", 100.0, 50.0));
        assert_eq!(s.text(), "Page 3 ajouté");
        let runs = &s.parts[0].text[0].runs;
        assert_eq!((runs.len(), runs[1].b, runs[1].size), (2, true, Some(14.0)));
        // Sans trait ni fond déclarés, ni style : rien n'est dessiné autour du texte.
        assert_eq!((s.parts[0].fill.as_deref(), s.parts[0].line.as_deref()), (None, None));
    }

    #[test]
    fn dessin_en_svg_par_dessus_la_figure() {
        let h = r#"<wp:positionH relativeFrom="column"><wp:posOffset>1270000</wp:posOffset></wp:positionH>"#;
        let v = r#"<wp:positionV relativeFrom="paragraph"><wp:posOffset>635000</wp:posOffset></wp:positionV>"#;
        let s = first(&alt(&anchor(h, v, 1270000, 254000, &styled_box("Niveau d'eau au temps 4080 sec = 26,825 m de profondeur. &lt;&amp;&gt;")), ""), false).unwrap();
        let (svg, w, h) = compose(&[&s], Some(Backdrop { bytes: b"png", mime: "image/png", rect: [0.0, 0.0, 300.0, 200.0] }), &Pictures::new()).unwrap();
        // Le cadre couvre la figure et la zone de texte, marge comprise, en pixels.
        assert_eq!((w.round(), h.round()), (411.0, 277.0));
        let image = svg.find("<image href=\"data:image/png;base64,cG5n\"").unwrap();
        let rect = svg.find(r##"fill="#FFFFFF" stroke="#F79646" stroke-width="2.00""##).unwrap();
        assert!(image < rect, "la zone de texte se dessine par-dessus la figure");
        // Texte coupé en lignes dans la largeur de la zone, échappé, à sa couleur.
        assert!(svg.matches("<text ").count() >= 3, "{svg}");
        assert!(svg.contains("&lt;&amp;&gt;") && svg.contains(r##"<tspan fill="#00B050">"##) && svg.contains(r##"<tspan fill="#000000">= 12,5 m"##), "{svg}");
        assert!(svg.contains(r#"text-anchor="middle""#));
        // La zone s'allonge pour loger tout son texte : rien n'est coupé.
        let grown = grown(&s.parts[0]);
        assert!(grown > s.parts[0].h + 10.0, "{grown}");
        // Seul, sans figure : le dessin dans son propre cadre.
        let (alone, _, _) = compose(&[&s], None, &Pictures::new()).unwrap();
        assert!(!alone.contains("<image"));
        assert!(compose(&[], None, &Pictures::new()).is_none());
    }
}
