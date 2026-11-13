//! Graphiques d'Excel intégrés à un .docx (`c:chart`, partie
//! `word/charts/chartN.xml`). Word les redessine à partir des valeurs gardées
//! en cache dans la partie (`c:numCache`, `c:strCache`) ; aucun navigateur ne
//! sait le faire. On les rejoue ici en SVG, à la taille du cadre : nuage de
//! points, courbes, barres et secteurs, axes linéaires ou logarithmiques,
//! quadrillage, titres, légende, courbes de tendance avec leur équation et
//! leur R² (2026-11-13, des TP où la figure H/Ho en fonction du temps restait
//! un petit cadre vide).
//!
//! Les couleurs sont celles que porte la partie ; à défaut, celles du thème
//! Office par défaut, comme Word.

use roxmltree::{Document, Node};
use std::fmt::Write as _;

/// Espace de noms des graphiques DrawingML (`c:`).
pub const NS: &str = "http://schemas.openxmlformats.org/drawingml/2006/chart";

/// Type MIME interne d'une partie graphique avant son rendu.
pub const MIME: &str = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";

/// SVG d'un graphique, à la taille donnée en pixels (96 ppp), avec les
/// couleurs et la police du thème du document (`word/theme/theme1.xml`).
/// `None` si la partie n'est pas un graphique lisible.
pub fn to_svg(xml: &[u8], theme: Option<&[u8]>, width: f64, height: f64) -> Option<String> {
    THEME.with(|t| *t.borrow_mut() = theme.and_then(Theme::read).unwrap_or_default());
    let text = std::str::from_utf8(xml).ok()?;
    let doc = Document::parse_with_options(text, roxmltree::ParsingOptions { allow_dtd: false, ..Default::default() }).ok()?;
    let space = doc.root_element();
    if space.tag_name().name() != "chartSpace" {
        return None;
    }
    let (w, h) = (if width >= 40.0 { width } else { 480.0 }, if height >= 30.0 { height } else { 288.0 });
    let chart = child(space, "chart")?;
    let plot = child(chart, "plotArea")?;
    let base = TextStyle::of(child(space, "txPr"), TextStyle { size: 13.333, bold: false, color: "595959".into() });
    let mut c = Chart::read(chart, plot, &base)?;
    Some(c.draw(space, chart, plot, w, h, &base))
}

/// Cadre neutre pour un graphique que l'on ne sait pas dessiner (graphique
/// « moderne » `cx:chart` d'Excel 2016, par exemple) : le texte reste lisible.
pub fn placeholder(w: f64, h: f64) -> String {
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0} {h:.0}" width="{w:.0}" height="{h:.0}"><rect x="0.5" y="0.5" width="{:.0}" height="{:.0}" fill="#F7F7F7" stroke="#D9D9D9"/><text x="{:.0}" y="{:.0}" text-anchor="middle" font-family="Calibri, Carlito, Arial, sans-serif" font-size="13" fill="#7F7F7F">Graphique Excel (à ouvrir dans Word)</text></svg>"##,
        w - 1.0,
        h - 1.0,
        w / 2.0,
        h / 2.0
    )
}

/// Partie XML qui ressemble à un graphique (`c:chartSpace`) ?
pub fn looks_like_chart(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(600)];
    String::from_utf8_lossy(head).contains("chartSpace")
}

// ------------------------------------------------------------ XML

fn child<'a, 'i>(n: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    n.children().find(|c| c.is_element() && c.tag_name().name() == name)
}

fn children<'a, 'i>(n: Node<'a, 'i>, name: &'static str) -> impl Iterator<Item = Node<'a, 'i>> {
    n.children().filter(move |c| c.is_element() && c.tag_name().name() == name)
}

fn path<'a, 'i>(n: Node<'a, 'i>, names: &[&str]) -> Option<Node<'a, 'i>> {
    names.iter().try_fold(n, |n, name| child(n, name))
}

/// Attribut `val` d'un enfant (`<c:logBase val="10"/>`).
fn val<'a>(n: Node<'a, '_>, name: &str) -> Option<&'a str> {
    child(n, name).and_then(|c| c.attribute("val"))
}

fn num(n: Node, name: &str) -> Option<f64> {
    val(n, name).and_then(|v| v.trim().parse().ok()).filter(|v: &f64| v.is_finite())
}

/// Booléen OOXML : un élément présent sans `val` vaut vrai.
fn flag(n: Node, name: &str) -> Option<bool> {
    child(n, name).map(|c| !matches!(c.attribute("val"), Some("0" | "false")))
}

/// Texte riche d'un titre (`c:tx/c:rich//a:t`) ou d'une référence (`c:strCache`).
fn tx_text(n: Node) -> Option<String> {
    let tx = child(n, "tx")?;
    if let Some(rich) = child(tx, "rich") {
        let paras: Vec<String> = children(rich, "p")
            .map(|p| p.descendants().filter(|d| d.tag_name().name() == "t").filter_map(|t| t.text()).collect::<String>())
            .collect();
        let s = paras.join("\n");
        return (!s.trim().is_empty()).then_some(s);
    }
    if let Some(v) = child(tx, "v").and_then(|v| v.text()) {
        return Some(v.to_string());
    }
    let cache = tx.descendants().find(|d| d.tag_name().name() == "strCache")?;
    let s: Vec<&str> = children(cache, "pt").filter_map(|p| child(p, "v").and_then(|v| v.text())).collect();
    (!s.is_empty()).then(|| s.join(" "))
}

/// Valeurs numériques en cache (`numCache` ou `numLit`), par indice.
fn numbers(n: Node) -> (Vec<Option<f64>>, Option<String>) {
    let Some(cache) = n.descendants().find(|d| matches!(d.tag_name().name(), "numCache" | "numLit")) else {
        return (Vec::new(), None);
    };
    let count = num(cache, "ptCount").map(|c| c as usize).unwrap_or(0);
    let code = child(cache, "formatCode").and_then(|f| f.text()).map(str::to_string);
    let mut out = vec![None; count];
    for p in children(cache, "pt") {
        let Some(i) = p.attribute("idx").and_then(|i| i.parse::<usize>().ok()) else { continue };
        let v = child(p, "v").and_then(|v| v.text()).and_then(|t| t.trim().parse::<f64>().ok()).filter(|v| v.is_finite());
        if i >= out.len() {
            out.resize(i + 1, None);
        }
        out[i] = v;
    }
    (out, code)
}

/// Étiquettes en cache (`strCache` ou `strLit`), ou les nombres mis en texte.
fn labels(n: Node) -> Vec<String> {
    if let Some(cache) = n.descendants().find(|d| matches!(d.tag_name().name(), "strCache" | "strLit")) {
        let count = num(cache, "ptCount").map(|c| c as usize).unwrap_or(0);
        let mut out = vec![String::new(); count];
        for p in children(cache, "pt") {
            let Some(i) = p.attribute("idx").and_then(|i| i.parse::<usize>().ok()) else { continue };
            if i >= out.len() {
                out.resize(i + 1, String::new());
            }
            out[i] = child(p, "v").and_then(|v| v.text()).unwrap_or("").to_string();
        }
        return out;
    }
    let (v, code) = numbers(n);
    v.iter().map(|x| x.map(|x| fmt_num(x, code.as_deref().unwrap_or("General"))).unwrap_or_default()).collect()
}

// ------------------------------------------------------------ couleurs

/// Couleurs et police du thème (Office 2013-2022 par défaut).
#[derive(Clone)]
struct Theme {
    /// dk1, lt1, dk2, lt2, accent1 à accent6, hlink.
    colors: [String; 11],
    font: String,
}

impl Default for Theme {
    fn default() -> Self {
        let c = ["000000", "FFFFFF", "44546A", "E7E6E6", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1"];
        Theme { colors: c.map(str::to_string), font: "Calibri".into() }
    }
}

impl Theme {
    fn read(xml: &[u8]) -> Option<Theme> {
        let text = std::str::from_utf8(xml).ok()?;
        let doc = Document::parse_with_options(text, roxmltree::ParsingOptions { allow_dtd: false, ..Default::default() }).ok()?;
        let mut t = Theme::default();
        let scheme = doc.descendants().find(|n| n.tag_name().name() == "clrScheme")?;
        for (i, name) in ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink"].iter().enumerate() {
            let Some(c) = child(scheme, name).and_then(|n| n.children().find(|c| c.is_element())) else { continue };
            let hex = match c.tag_name().name() {
                "srgbClr" => c.attribute("val"),
                "sysClr" => c.attribute("lastClr"),
                _ => None,
            };
            if let Some(h) = hex.filter(|h| h.len() == 6) {
                t.colors[i] = h.to_ascii_uppercase();
            }
        }
        if let Some(f) = doc.descendants().find(|n| n.tag_name().name() == "minorFont").and_then(|m| child(m, "latin")).and_then(|l| l.attribute("typeface")).filter(|f| !f.trim().is_empty()) {
            t.font = f.to_string();
        }
        Some(t)
    }
}

thread_local! {
    static THEME: std::cell::RefCell<Theme> = std::cell::RefCell::new(Theme::default());
}

fn accent(i: usize) -> String {
    THEME.with(|t| t.borrow().colors[4 + i % 6].clone())
}

fn scheme(name: &str) -> String {
    let i = match name {
        "tx1" | "dk1" => 0,
        "bg1" | "lt1" => 1,
        "tx2" | "dk2" => 2,
        "bg2" | "lt2" => 3,
        "accent1" => 4,
        "accent2" => 5,
        "accent3" => 6,
        "accent4" => 7,
        "accent5" => 8,
        "accent6" => 9,
        "hlink" | "folHlink" => 10,
        _ => 0,
    };
    THEME.with(|t| t.borrow().colors[i].clone())
}

/// Couleur d'un remplissage (`a:srgbClr`, `a:schemeClr`, `a:sysClr`,
/// `a:prstClr`) avec ses retouches de luminance (`lumMod`, `lumOff`,
/// `shade`, `tint`).
fn color_of(fill: Node) -> Option<String> {
    let c = fill.children().find(|c| c.is_element())?;
    let hex = match c.tag_name().name() {
        "srgbClr" => c.attribute("val")?.to_string(),
        "schemeClr" => scheme(c.attribute("val")?),
        "sysClr" => c.attribute("lastClr").unwrap_or("000000").to_string(),
        "prstClr" => match c.attribute("val")? {
            "white" => "FFFFFF",
            "red" => "FF0000",
            "green" => "00FF00",
            "blue" => "0000FF",
            "yellow" => "FFFF00",
            "gray" | "grey" => "808080",
            _ => "000000",
        }
        .to_string(),
        _ => return None,
    };
    let mut rgb = parse_hex(&hex)?;
    let pct = |name: &str| c.children().find(|m| m.tag_name().name() == name).and_then(|m| m.attribute("val")).and_then(|v| v.parse::<f64>().ok()).map(|v| v / 100_000.0);
    if let Some(s) = pct("shade") {
        rgb = rgb.map(|v| v * s);
    }
    if let Some(t) = pct("tint") {
        rgb = rgb.map(|v| v * t + (1.0 - t));
    }
    if pct("lumMod").is_some() || pct("lumOff").is_some() {
        let (hh, ss, ll) = to_hsl(rgb);
        let l = (ll * pct("lumMod").unwrap_or(1.0) + pct("lumOff").unwrap_or(0.0)).clamp(0.0, 1.0);
        rgb = from_hsl(hh, ss, l);
    }
    Some(rgb.iter().map(|v| format!("{:02X}", (v.clamp(0.0, 1.0) * 255.0).round() as u8)).collect())
}

fn parse_hex(h: &str) -> Option<[f64; 3]> {
    if h.len() != 6 {
        return None;
    }
    let b = |i: usize| u8::from_str_radix(&h[i..i + 2], 16).ok().map(|v| v as f64 / 255.0);
    Some([b(0)?, b(2)?, b(4)?])
}

fn to_hsl([r, g, b]: [f64; 3]) -> (f64, f64, f64) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if max == min {
        return (0.0, 0.0, l);
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h = if max == r {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if max == g {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };
    (h / 6.0, s, l)
}

fn from_hsl(h: f64, s: f64, l: f64) -> [f64; 3] {
    if s == 0.0 {
        return [l, l, l];
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let f = |mut t: f64| {
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            p + (q - p) * 6.0 * t
        } else if t < 0.5 {
            q
        } else if t < 2.0 / 3.0 {
            p + (q - p) * (2.0 / 3.0 - t) * 6.0
        } else {
            p
        }
    };
    [f(h + 1.0 / 3.0), f(h), f(h - 1.0 / 3.0)]
}

/// Remplissage d'un `c:spPr` : `Some(None)` = aucun (`a:noFill`).
fn fill(sp: Option<Node>) -> Option<Option<String>> {
    let sp = sp?;
    if child(sp, "noFill").is_some() {
        return Some(None);
    }
    child(sp, "solidFill").and_then(color_of).map(Some)
}

/// Trait d'un `c:spPr/a:ln` : couleur (`None` = aucun), épaisseur en px, tirets.
#[derive(Clone)]
struct Stroke {
    color: Option<String>,
    width: f64,
    dash: Option<&'static str>,
    /// Bouts ronds (`a:ln cap="rnd"`) : les pointillés d'Excel sont des points ronds.
    round: bool,
}

/// Pointillé « points » : un point rond d'une largeur de trait tous les deux traits.
const DOTS: &str = "0.01 2";

fn stroke(sp: Option<Node>, default: Stroke) -> Stroke {
    let Some(ln) = sp.and_then(|s| child(s, "ln")) else { return default };
    if child(ln, "noFill").is_some() {
        return Stroke { color: None, ..default };
    }
    let color = child(ln, "solidFill").and_then(color_of).or(default.color);
    let width = ln.attribute("w").and_then(|w| w.parse::<f64>().ok()).map(|w| w / 9525.0).unwrap_or(default.width);
    let dash = match val(ln, "prstDash") {
        Some("dash" | "sysDash") => Some("4 3"),
        Some("dot" | "sysDot") => Some(DOTS),
        Some("dashDot" | "sysDashDot") => Some("4 2 1.2 2"),
        Some("lgDash") => Some("8 3"),
        Some("lgDashDot" | "lgDashDotDot" | "sysDashDotDot") => Some("8 3 1.2 3"),
        Some(_) => None,
        None => default.dash,
    };
    let round = match ln.attribute("cap") {
        Some("rnd") => true,
        Some(_) => false,
        None => default.round,
    };
    Stroke { color, width, dash, round }
}

fn stroke_attrs(s: &Stroke) -> String {
    let Some(c) = &s.color else { return r#"stroke="none""#.into() };
    let mut a = format!(r##"stroke="#{c}" stroke-width="{:.2}""##, s.width.max(0.5));
    if s.round || s.dash == Some(DOTS) {
        a.push_str(r#" stroke-linecap="round""#);
    }
    if let Some(d) = s.dash {
        let scale = s.width.max(1.0);
        let d: Vec<String> = d.split(' ').map(|v| format!("{:.2}", v.parse::<f64>().unwrap_or(1.0) * scale)).collect();
        let _ = write!(a, r#" stroke-dasharray="{}""#, d.join(" "));
    }
    a
}

// ------------------------------------------------------------ texte

#[derive(Clone)]
struct TextStyle {
    /// Taille en px.
    size: f64,
    bold: bool,
    color: String,
}

impl TextStyle {
    /// Style d'un `c:txPr` (ou d'un `c:rich`) : `a:defRPr` ou premier `a:rPr`.
    fn of(tx: Option<Node>, base: TextStyle) -> TextStyle {
        let Some(tx) = tx else { return base };
        let r = tx.descendants().find(|d| matches!(d.tag_name().name(), "defRPr" | "rPr"));
        let Some(r) = r else { return base };
        let size = r.attribute("sz").and_then(|s| s.parse::<f64>().ok()).map(|s| s / 100.0 * 96.0 / 72.0).unwrap_or(base.size);
        let bold = r.attribute("b").map(|b| b == "1" || b == "true").unwrap_or(base.bold);
        let color = child(r, "solidFill").and_then(color_of).unwrap_or(base.color);
        TextStyle { size, bold, color }
    }

    fn attrs(&self) -> String {
        format!(r##"font-size="{:.2}" fill="#{}"{}"##, self.size, self.color, if self.bold { r#" font-weight="600""# } else { "" })
    }

    /// Largeur approchée (Calibri : environ un demi-cadratin par signe).
    fn width(&self, s: &str) -> f64 {
        // Calibri n'est pas toujours installée : on compte large (Helvetica).
        s.chars().count() as f64 * self.size * if self.bold { 0.6 } else { 0.55 }
    }
}

/// Coupe un texte en lignes qui tiennent dans `max` px, aux espaces.
fn wrap(text: &str, st: &TextStyle, max: f64) -> Vec<String> {
    let mut lines = Vec::new();
    let mut cur = String::new();
    for word in text.split_whitespace() {
        let next = if cur.is_empty() { word.to_string() } else { format!("{cur} {word}") };
        if st.width(&next) > max && !cur.is_empty() {
            lines.push(std::mem::take(&mut cur));
            cur = word.to_string();
        } else {
            cur = next;
        }
    }
    if !cur.is_empty() || lines.is_empty() {
        lines.push(cur);
    }
    lines
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Nombre selon un format d'Excel, à la française (virgule décimale).
fn fmt_num(v: f64, code: &str) -> String {
    let code = code.split(';').next().unwrap_or("General");
    // Texte entre guillemets, couleurs et conditions entre crochets : ignorés.
    let mut clean = String::new();
    let mut quoted = false;
    let mut bracket = false;
    for ch in code.chars() {
        match ch {
            '"' => quoted = !quoted,
            '[' if !quoted => bracket = true,
            ']' if !quoted => bracket = false,
            '\\' | '_' | '*' => {}
            _ if quoted || bracket => {}
            _ => clean.push(ch),
        }
    }
    let lower = clean.to_ascii_lowercase();
    if lower.trim().is_empty() || lower.contains("general") || lower.contains("standard") || !clean.contains(['0', '#']) {
        return general(v);
    }
    let percent = clean.contains('%');
    let v = if percent { v * 100.0 } else { v };
    let decimals = |s: &str| s.split('.').nth(1).map(|d| d.chars().take_while(|c| matches!(c, '0' | '#')).count()).unwrap_or(0);
    if let Some(e) = clean.to_ascii_uppercase().find('E') {
        let mant = &clean[..e];
        let d = decimals(mant);
        let s = format!("{v:.d$E}");
        let (m, x) = s.split_once('E').unwrap_or((&s, "0"));
        let x: i32 = x.parse().unwrap_or(0);
        return format!("{}E{}{:02}", m.replace('.', ","), if x < 0 { '-' } else { '+' }, x.abs());
    }
    let d = decimals(&clean);
    let optional = clean.split('.').nth(1).map(|t| t.chars().take_while(|c| matches!(c, '0' | '#')).filter(|c| *c == '#').count()).unwrap_or(0);
    let mut s = format!("{:.*}", d, v.abs());
    if optional > 0 && s.contains('.') {
        let keep = d - optional;
        while s.ends_with('0') && s.split('.').nth(1).map(|t| t.len()).unwrap_or(0) > keep {
            s.pop();
        }
        if s.ends_with('.') {
            s.pop();
        }
    }
    let (int, frac) = s.split_once('.').map(|(a, b)| (a.to_string(), Some(b.to_string()))).unwrap_or((s.clone(), None));
    let grouped = if clean.split('.').next().unwrap_or("").contains(',') { group(&int) } else { int };
    let mut out = String::new();
    if v < 0.0 && s.chars().any(|c| c.is_ascii_digit() && c != '0') {
        out.push('-');
    }
    out.push_str(&grouped);
    if let Some(f) = frac {
        out.push(',');
        out.push_str(&f);
    }
    if percent {
        out.push_str(" %");
    }
    out
}

/// Milliers séparés d'une espace fine insécable.
fn group(int: &str) -> String {
    let digits: Vec<char> = int.chars().collect();
    let mut out = String::new();
    for (i, c) in digits.iter().enumerate() {
        if i > 0 && (digits.len() - i).is_multiple_of(3) {
            out.push('\u{202F}');
        }
        out.push(*c);
    }
    out
}

/// Format « Standard » d'Excel : au plus dix chiffres significatifs,
/// notation scientifique pour les très petits et très grands nombres.
fn general(v: f64) -> String {
    if v == 0.0 {
        return "0".into();
    }
    let a = v.abs();
    if !(1e-4..1e11).contains(&a) {
        let s = format!("{v:.4E}");
        let (m, x) = s.split_once('E').unwrap_or((&s, "0"));
        let m = m.trim_end_matches('0').trim_end_matches('.');
        let x: i32 = x.parse().unwrap_or(0);
        return format!("{}E{}{:02}", m.replace('.', ","), if x < 0 { '-' } else { '+' }, x.abs());
    }
    let digits = (10 - (a.log10().floor() as i32 + 1)).clamp(0, 10) as usize;
    let mut s = format!("{v:.digits$}");
    if s.contains('.') {
        s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    }
    s.replace('.', ",")
}

/// Coefficient d'équation : quatre chiffres significatifs, comme Excel.
fn coef(v: f64) -> String {
    if v == 0.0 || !v.is_finite() {
        return "0".into();
    }
    let a = v.abs();
    if !(1e-4..1e7).contains(&a) {
        let s = format!("{v:.3E}");
        let (m, x) = s.split_once('E').unwrap_or((&s, "0"));
        let m = m.trim_end_matches('0').trim_end_matches('.');
        let x: i32 = x.parse().unwrap_or(0);
        return format!("{}E{}{:02}", m.replace('.', ","), if x < 0 { '-' } else { '+' }, x.abs());
    }
    let digits = (4 - (a.log10().floor() as i32 + 1)).clamp(0, 8) as usize;
    let mut s = format!("{v:.digits$}");
    if s.contains('.') {
        s = s.trim_end_matches('0').trim_end_matches('.').to_string();
    }
    s.replace('.', ",")
}

// ------------------------------------------------------------ modèle

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Scatter,
    Line,
    Bar { horizontal: bool, stacked: bool, percent: bool },
    Area,
    Pie,
}

#[derive(Clone, Copy, PartialEq)]
enum Fit {
    Linear,
    Exp,
    Log,
    Power,
    Poly(usize),
    Moving(usize),
}

struct Trend {
    fit: Fit,
    name: Option<String>,
    stroke: Stroke,
    show_eq: bool,
    show_r2: bool,
    forward: f64,
    backward: f64,
    label: Option<TextStyle>,
}

/// Marqueur : symbole, taille en px, remplissage, contour.
type Mark = (String, f64, Option<String>, Option<String>);

/// Entrée de légende : nom, remplissage, trait, marqueur.
type Entry = (String, Option<String>, Stroke, Option<Mark>);

struct Series {
    name: String,
    xs: Vec<Option<f64>>,
    cats: Vec<String>,
    ys: Vec<Option<f64>>,
    color: String,
    line: Stroke,
    marker: Option<Mark>,
    smooth: bool,
    fill: Option<String>,
    trends: Vec<Trend>,
    values_shown: bool,
    code: Option<String>,
    xcode: Option<String>,
}

struct Chart {
    kind: Kind,
    series: Vec<Series>,
    axes: Vec<Axis>,
}

#[derive(Clone)]
struct Axis {
    category: bool,
    horizontal: bool,
    deleted: bool,
    log: Option<f64>,
    min: Option<f64>,
    max: Option<f64>,
    reverse: bool,
    major: Option<f64>,
    minor_unit: Option<f64>,
    grid: Option<Stroke>,
    title: Option<(String, TextStyle)>,
    /// Coin haut-gauche du titre placé à la main (fractions du graphique).
    title_at: Option<(f64, f64)>,
    minor: &'static str,
    code: Option<String>,
    linked: bool,
    style: TextStyle,
    line: Stroke,
    ticks: &'static str,
    labels: &'static str,
    crosses: &'static str,
    crosses_at: Option<f64>,
    between: bool,
    // Échelle calculée.
    lo: f64,
    hi: f64,
    step: f64,
}

impl Chart {
    fn read(chart: Node, plot: Node, base: &TextStyle) -> Option<Chart> {
        let group = plot.children().find(|c| {
            c.is_element() && matches!(c.tag_name().name(), "scatterChart" | "lineChart" | "line3DChart" | "barChart" | "bar3DChart" | "areaChart" | "pieChart" | "pie3DChart" | "doughnutChart")
        })?;
        let kind = match group.tag_name().name() {
            "scatterChart" => Kind::Scatter,
            "lineChart" | "line3DChart" => Kind::Line,
            "areaChart" => Kind::Area,
            "pieChart" | "pie3DChart" | "doughnutChart" => Kind::Pie,
            _ => {
                let g = val(group, "grouping").unwrap_or("clustered");
                Kind::Bar { horizontal: val(group, "barDir") == Some("bar"), stacked: g != "clustered" && g != "standard", percent: g == "percentStacked" }
            }
        };
        let style = val(group, "scatterStyle").unwrap_or("lineMarker");
        let vary = flag(group, "varyColors").unwrap_or(false);
        let mut series = Vec::new();
        for (i, ser) in children(group, "ser").enumerate() {
            let idx = num(ser, "idx").map(|v| v as usize).unwrap_or(i);
            let accent = accent(idx);
            let sp = child(ser, "spPr");
            let color = fill(sp).flatten().or_else(|| stroke(sp, Stroke { color: None, width: 0.0, dash: None, round: false }).color).unwrap_or_else(|| accent.clone());
            let (yv, xv) = if kind == Kind::Scatter { (child(ser, "yVal"), child(ser, "xVal")) } else { (child(ser, "val"), child(ser, "cat")) };
            let (ys, code) = yv.map(numbers).unwrap_or_default();
            let numeric_x = xv.is_some_and(|x| x.descendants().any(|d| matches!(d.tag_name().name(), "numCache" | "numLit")));
            // Abscisses en texte (nombres stockés comme du texte dans Excel) :
            // Excel trace alors le rang du point, 1 à N, et Word aussi.
            let (xs, xcode) = if kind == Kind::Scatter && numeric_x { xv.map(numbers).unwrap_or_default() } else { ((1..=ys.len()).map(|i| Some(i as f64)).collect(), None) };
            let cats = xv.map(labels).unwrap_or_default();
            let default_line = match kind {
                Kind::Scatter if matches!(style, "marker" | "none") => Stroke { color: None, width: 2.0, dash: None, round: true },
                Kind::Scatter | Kind::Line => Stroke { color: Some(color.clone()), width: 2.0, dash: None, round: true },
                _ => Stroke { color: None, width: 1.0, dash: None, round: false },
            };
            let line = stroke(sp, default_line);
            let marker = if matches!(kind, Kind::Scatter | Kind::Line) {
                let m = child(ser, "marker");
                let symbol = m.and_then(|m| val(m, "symbol")).unwrap_or(if kind == Kind::Scatter && matches!(style, "line" | "smooth" | "none") { "none" } else { "auto" });
                if symbol == "none" {
                    None
                } else {
                    let symbol = if symbol == "auto" { ["diamond", "square", "triangle", "x", "star", "circle"][idx % 6] } else { symbol };
                    let symbol = if kind == Kind::Scatter && m.and_then(|m| val(m, "symbol")).is_none() { "circle" } else { symbol };
                    let size = m.and_then(|m| num(m, "size")).unwrap_or(5.0) * 96.0 / 72.0;
                    let msp = m.and_then(|m| child(m, "spPr"));
                    let mfill = match fill(msp) {
                        Some(f) => f,
                        None => Some(color.clone()),
                    };
                    let mline = stroke(msp, Stroke { color: Some(color.clone()), width: 1.0, dash: None, round: false }).color;
                    Some((symbol.to_string(), size, mfill, mline))
                }
            } else {
                None
            };
            let smooth = flag(ser, "smooth").unwrap_or(kind == Kind::Scatter && matches!(style, "smooth" | "smoothMarker"));
            let trends = children(ser, "trendline")
                .filter_map(|t| {
                    let fit = match val(t, "trendlineType")? {
                        "linear" => Fit::Linear,
                        "exp" => Fit::Exp,
                        "log" => Fit::Log,
                        "power" => Fit::Power,
                        "poly" => Fit::Poly(num(t, "order").map(|o| o as usize).unwrap_or(2).clamp(2, 6)),
                        "movingAvg" => Fit::Moving(num(t, "period").map(|o| o as usize).unwrap_or(2).max(2)),
                        _ => return None,
                    };
                    let lbl = child(t, "trendlineLbl");
                    Some(Trend {
                        fit,
                        name: child(t, "name").and_then(|n| n.text()).map(str::to_string),
                        stroke: stroke(child(t, "spPr"), Stroke { color: Some(color.clone()), width: 2.0, dash: Some(DOTS), round: true }),
                        show_eq: flag(t, "dispEq").unwrap_or(false),
                        show_r2: flag(t, "dispRSqr").unwrap_or(false),
                        forward: num(t, "forward").unwrap_or(0.0),
                        backward: num(t, "backward").unwrap_or(0.0),
                        label: lbl.map(|l| TextStyle::of(child(l, "txPr"), TextStyle { size: base.size * 0.9, ..base.clone() })),
                    })
                })
                .collect();
            let values_shown = child(ser, "dLbls").or_else(|| child(group, "dLbls")).and_then(|d| flag(d, "showVal")).unwrap_or(false);
            let name = tx_text(ser).unwrap_or_else(|| format!("Série{}", idx + 1));
            series.push(Series {
                name,
                xs,
                cats,
                ys,
                color: color.clone(),
                line,
                marker,
                smooth,
                fill: if matches!(kind, Kind::Bar { .. } | Kind::Area | Kind::Pie) { fill(sp).unwrap_or(Some(color)) } else { None },
                trends,
                values_shown,
                code,
                xcode,
            });
        }
        if series.is_empty() {
            return None;
        }
        // Secteurs d'une seule série : une couleur par point (varyColors).
        if kind == Kind::Pie && !vary {
            // Word varie quand même les couleurs des secteurs par défaut.
        }
        let ids: Vec<String> = children(group, "axId").filter_map(|a| a.attribute("val").map(str::to_string)).collect();
        let mut axes = Vec::new();
        for ax in plot.children().filter(|c| c.is_element() && matches!(c.tag_name().name(), "valAx" | "catAx" | "dateAx" | "serAx")) {
            let id = val(ax, "axId").unwrap_or("").to_string();
            if !ids.is_empty() && !ids.contains(&id) {
                continue;
            }
            let scaling = child(ax, "scaling");
            let pos = val(ax, "axPos").unwrap_or("b");
            let style = TextStyle::of(child(ax, "txPr"), base.clone());
            let title = child(ax, "title").map(|t| {
                let st = TextStyle::of(path(t, &["tx", "rich"]).or(child(t, "txPr")), TextStyle { bold: false, ..base.clone() });
                (tx_text(t).unwrap_or_else(|| "Titre de l'axe".into()), st)
            });
            let tick = |name: &str| match val(ax, name) {
                Some("none") => "none",
                Some("in") => "in",
                Some("cross") => "cross",
                Some("out") => "out",
                _ => "none",
            };
            axes.push(Axis {
                category: ax.tag_name().name() != "valAx",
                horizontal: matches!(pos, "b" | "t"),
                deleted: flag(ax, "delete").unwrap_or(false),
                log: scaling.and_then(|s| num(s, "logBase")).filter(|b| *b >= 2.0),
                min: scaling.and_then(|s| num(s, "min")),
                max: scaling.and_then(|s| num(s, "max")),
                reverse: scaling.and_then(|s| val(s, "orientation")) == Some("maxMin"),
                major: num(ax, "majorUnit").filter(|u| *u > 0.0),
                minor_unit: num(ax, "minorUnit").filter(|u| *u > 0.0),
                grid: child(ax, "majorGridlines").map(|g| stroke(child(g, "spPr"), Stroke { color: Some("D9D9D9".into()), width: 1.0, dash: None, round: false })),
                title,
                code: child(ax, "numFmt").and_then(|f| f.attribute("formatCode")).map(str::to_string),
                linked: child(ax, "numFmt").and_then(|f| f.attribute("sourceLinked")).is_none_or(|v| v == "1"),
                style,
                line: stroke(child(ax, "spPr"), Stroke { color: Some("BFBFBF".into()), width: 1.0, dash: None, round: false }),
                ticks: if child(ax, "majorTickMark").is_some() { tick("majorTickMark") } else { "out" },
                minor: tick("minorTickMark"),
                title_at: path(ax, &["title", "layout", "manualLayout"])
                    .filter(|m| val(*m, "xMode") == Some("edge") && val(*m, "yMode") == Some("edge"))
                    .and_then(|m| Some((num(m, "x")?, num(m, "y")?)))
                    .filter(|(x, y)| (0.0..1.0).contains(x) && (0.0..1.0).contains(y)),
                labels: match val(ax, "tickLblPos") {
                    Some("none") => "none",
                    Some("low") => "low",
                    Some("high") => "high",
                    _ => "nextTo",
                },
                crosses: match val(ax, "crosses") {
                    Some("min") => "min",
                    Some("max") => "max",
                    _ => "autoZero",
                },
                crosses_at: num(ax, "crossesAt"),
                between: false,
                lo: 0.0,
                hi: 1.0,
                step: 1.0,
            });
        }
        let between = val(group, "crossBetween").or_else(|| plot.descendants().find(|d| d.tag_name().name() == "crossBetween").and_then(|d| d.attribute("val")));
        // Catégories : points au milieu de chaque case, sauf « midCat ».
        for a in &mut axes {
            a.between = a.category && (between != Some("midCat") || matches!(kind, Kind::Bar { .. }));
        }
        let _ = chart;
        Some(Chart { kind, series, axes })
    }

    fn draw(&mut self, space: Node, chart: Node, plot: Node, w: f64, h: f64, base: &TextStyle) -> String {
        let mut svg = String::new();
        let _ = write!(
            svg,
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2} {h:.2}" width="{w:.2}" height="{h:.2}" font-family="{}, Calibri, Carlito, 'Helvetica Neue', Arial, sans-serif">"#,
            esc(&THEME.with(|t| t.borrow().font.clone())).replace("&quot;", "")
        );
        // Zone du graphique : fond et cadre.
        let sp = child(space, "spPr");
        let bg = fill(sp).unwrap_or(Some("FFFFFF".into()));
        let border = stroke(sp, Stroke { color: Some("D9D9D9".into()), width: 1.0, dash: None, round: false });
        let rounded = flag(space, "roundedCorners").unwrap_or(false);
        let _ = write!(
            svg,
            r#"<rect x="0.5" y="0.5" width="{:.2}" height="{:.2}"{} fill="{}" {}/>"#,
            w - 1.0,
            h - 1.0,
            if rounded { r#" rx="8""# } else { "" },
            bg.map(|c| format!("#{c}")).unwrap_or("none".into()),
            stroke_attrs(&border)
        );
        let pad = 9.0;
        let mut top = pad;
        let mut bottom = h - pad;
        let mut left = pad;
        let mut right = w - pad;

        // Titre.
        let auto_deleted = flag(chart, "autoTitleDeleted").unwrap_or(false);
        if let Some(t) = child(chart, "title") {
            let st = TextStyle::of(path(t, &["tx", "rich"]).or(child(t, "txPr")), TextStyle { size: base.size * 1.4, bold: false, ..base.clone() });
            let text = tx_text(t).unwrap_or_else(|| if self.series.len() == 1 { self.series[0].name.clone() } else { "Titre du graphique".into() });
            for line in text.lines().flat_map(|l| wrap(l, &st, w * 0.8)) {
                top += st.size;
                let _ = write!(svg, r#"<text x="{:.2}" y="{:.2}" text-anchor="middle" {}>{}</text>"#, w / 2.0, top, st.attrs(), esc(&line));
                top += st.size * 0.25;
            }
            top += 6.0;
        } else if !auto_deleted && self.series.len() == 1 && self.kind == Kind::Pie {
            let st = TextStyle { size: base.size * 1.4, ..base.clone() };
            top += st.size;
            let _ = write!(svg, r#"<text x="{:.2}" y="{:.2}" text-anchor="middle" {}>{}</text>"#, w / 2.0, top, st.attrs(), esc(&self.series[0].name));
            top += 8.0;
        }

        // Légende.
        let legend = child(chart, "legend");
        let mut entries: Vec<Entry> = Vec::new();
        if let Some(lg) = legend {
            let hidden: Vec<usize> = children(lg, "legendEntry").filter(|e| flag(*e, "delete").unwrap_or(false)).filter_map(|e| num(e, "idx").map(|v| v as usize)).collect();
            if self.kind == Kind::Pie {
                let s = &self.series[0];
                for (i, c) in s.cats.iter().enumerate() {
                    entries.push((c.clone(), Some(accent(i)), Stroke { color: None, width: 0.0, dash: None, round: false }, None));
                }
            } else {
                for s in &self.series {
                    entries.push((s.name.clone(), s.fill.clone(), s.line.clone(), s.marker.clone()));
                }
                for s in &self.series {
                    for t in &s.trends {
                        let label = t.name.clone().unwrap_or_else(|| {
                            let kind = match t.fit {
                                Fit::Linear => "Linéaire".to_string(),
                                Fit::Exp => "Exponentielle".to_string(),
                                Fit::Log => "Logarithmique".to_string(),
                                Fit::Power => "Puissance".to_string(),
                                Fit::Poly(_) => "Poly.".to_string(),
                                Fit::Moving(p) => format!("Moy. mobile sur {p} pér."),
                            };
                            format!("{kind} ({})", s.name)
                        });
                        entries.push((label, None, t.stroke.clone(), None));
                    }
                }
            }
            let mut i = 0;
            entries.retain(|_| {
                i += 1;
                !hidden.contains(&(i - 1))
            });
            let st = TextStyle::of(child(lg, "txPr"), base.clone());
            let pos = val(lg, "legendPos").unwrap_or("r");
            let sym = 22.0;
            let row = st.size * 1.35;
            if !entries.is_empty() {
                let item_w = |e: &Entry| sym + 4.0 + st.width(&e.0);
                match pos {
                    "b" | "t" => {
                        // Rangées centrées, retour à la ligne si trop large.
                        let mut rows: Vec<Vec<usize>> = vec![Vec::new()];
                        let mut cur = 0.0;
                        for (k, e) in entries.iter().enumerate() {
                            let iw = item_w(e) + 12.0;
                            if cur + iw > right - left && !rows.last().unwrap().is_empty() {
                                rows.push(Vec::new());
                                cur = 0.0;
                            }
                            rows.last_mut().unwrap().push(k);
                            cur += iw;
                        }
                        let total = rows.len() as f64 * row;
                        let mut y = if pos == "b" { bottom - total } else { top };
                        for r in &rows {
                            let rw: f64 = r.iter().map(|k| item_w(&entries[*k]) + 12.0).sum::<f64>() - 12.0;
                            let mut x = (left + right - rw) / 2.0;
                            for k in r {
                                legend_item(&mut svg, &entries[*k], x, y + row / 2.0, &st, sym);
                                x += item_w(&entries[*k]) + 12.0;
                            }
                            y += row;
                        }
                        if pos == "b" {
                            bottom -= total + 6.0;
                        } else {
                            top += total + 6.0;
                        }
                    }
                    _ => {
                        let lw = entries.iter().map(item_w).fold(0.0, f64::max).min((right - left) * 0.45);
                        let total = entries.len() as f64 * row;
                        let x = if pos == "l" { left } else { right - lw };
                        let mut y = if pos == "tr" { top } else { (top + bottom - total) / 2.0 };
                        for e in &entries {
                            legend_item(&mut svg, e, x, y + row / 2.0, &st, sym);
                            y += row;
                        }
                        if pos == "l" {
                            left += lw + 10.0;
                        } else {
                            right -= lw + 10.0;
                        }
                    }
                }
            }
        }

        if self.kind == Kind::Pie {
            self.pie(&mut svg, left, top, right, bottom, base);
            svg.push_str("</svg>");
            return svg;
        }

        // Axes : lequel est horizontal, lequel vertical.
        let horiz = self.axes.iter().position(|a| a.horizontal);
        let vert = self.axes.iter().position(|a| !a.horizontal);
        let (Some(hi), Some(vi)) = (horiz, vert) else {
            svg.push_str("</svg>");
            return svg;
        };
        let bar_h = matches!(self.kind, Kind::Bar { horizontal: true, .. });
        // Le domaine de chaque axe.
        let (xs, ys) = self.domains();
        let (cat_i, val_i) = if bar_h { (vi, hi) } else { (hi, vi) };
        let n_cats = self.series.iter().map(|s| s.ys.len()).max().unwrap_or(0).max(1);
        let ser_code = self.series[0].code.clone();
        let ser_xcode = self.series[0].xcode.clone();
        // Libellés des graduations : leur place réduit la zone de traçage.
        let plot_layout = path(plot, &["layout", "manualLayout"]);
        for (i, data) in [(hi, if bar_h { ys.clone() } else { xs.clone() }), (vi, if bar_h { xs.clone() } else { ys.clone() })] {
            let a = &mut self.axes[i];
            if a.category && self.kind != Kind::Scatter {
                a.lo = 0.0;
                a.hi = n_cats as f64;
                a.step = 1.0;
            } else {
                let len = if a.horizontal { right - left } else { bottom - top };
                scale(a, &data, len);
            }
        }
        let tick_labels = |a: &Axis, cats: &[String], code: &Option<String>| -> Vec<(f64, String)> {
            if a.deleted || a.labels == "none" {
                return Vec::new();
            }
            if a.category && !cats.is_empty() {
                return cats.iter().enumerate().map(|(i, c)| (i as f64 + if a.between { 0.5 } else { 0.0 }, c.clone())).collect();
            }
            let fmt = if a.linked { code.clone().or(a.code.clone()) } else { a.code.clone() };
            ticks(a).into_iter().map(|v| (v, fmt_num(v, fmt.as_deref().unwrap_or("General")))).collect()
        };
        let cats = self.series[0].cats.clone();
        // Format lié à la source : celui des abscisses pour l'axe des x d'un nuage de points.
        let (hcode, vcode) = if self.kind == Kind::Scatter { (&ser_xcode, &ser_code) } else if bar_h { (&ser_code, &None) } else { (&None, &ser_code) };
        let hlabels = tick_labels(&self.axes[hi], if hi == cat_i { &cats } else { &[] }, hcode);
        let vlabels = tick_labels(&self.axes[vi], if vi == cat_i { &cats } else { &[] }, vcode);
        let _ = val_i;
        let (hax, vax) = (self.axes[hi].clone(), self.axes[vi].clone());
        // Titres d'axe : à leur place automatique, ou là où l'auteur les a posés.
        if let Some((t, st)) = &hax.title {
            if let Some((x, y)) = hax.title_at {
                let _ = write!(svg, r#"<text x="{:.2}" y="{:.2}" {}>{}</text>"#, x * w + 4.0, y * h + st.size * 1.05, st.attrs(), esc(t));
            } else {
                let y = bottom - st.size * 0.25;
                let _ = write!(svg, r#"<text x="__HX__" y="{:.2}" text-anchor="middle" {}>{}</text>"#, y, st.attrs(), esc(t));
            }
            bottom -= st.size * 1.3 + 4.0;
        }
        if let Some((t, st)) = &vax.title {
            if let Some((x, y)) = vax.title_at {
                // Cadre déjà tourné : sa hauteur est la longueur du texte.
                let cy = y * h + 4.0 + st.width(t) / 2.0;
                let _ = write!(svg, r#"<text transform="translate({:.2} {:.2}) rotate(-90)" text-anchor="middle" {}>{}</text>"#, x * w + st.size * 1.05, cy, st.attrs(), esc(t));
            } else {
                let x = left + st.size;
                let _ = write!(svg, r#"<text transform="translate({:.2} __VY__) rotate(-90)" text-anchor="middle" {}>{}</text>"#, x, st.attrs(), esc(t));
            }
            left += st.size * 1.3 + 4.0;
        }
        // Libellés hors de la zone de traçage seulement s'ils sont à son bord :
        // « bas »/« haut », ou l'axe croise au bord ; sinon ils restent dans la
        // zone, près de l'axe (comme Excel), et ne prennent pas de place.
        let at_edge = |a: &Axis, other: &Axis| -> (bool, bool) {
            match a.labels {
                "low" => (true, false),
                "high" => (false, true),
                _ => {
                    let t = frac(other, cross_of(self.kind, other));
                    (t <= 1e-6, t >= 1.0 - 1e-6)
                }
            }
        };
        let vlab_w = vlabels.iter().map(|(_, s)| vax.style.width(s)).fold(0.0, f64::max);
        let hlab_h = if hlabels.is_empty() { 0.0 } else { hax.style.size * 1.3 };
        let (h_low, h_high) = at_edge(&hax, &vax);
        let (v_low, v_high) = at_edge(&vax, &hax);
        if !hlabels.is_empty() {
            if h_low {
                bottom -= hlab_h + 4.0;
            } else if h_high && hax.labels == "high" {
                top += hlab_h + 4.0;
            }
        }
        if !vlabels.is_empty() {
            if v_low {
                left += vlab_w + 8.0;
            } else if v_high && vax.labels == "high" {
                right -= vlab_w + 8.0;
            }
        }
        // Le dernier libellé des x déborde de la moitié de sa largeur.
        let last = hlabels.last().map(|(_, s)| hax.style.width(s) / 2.0).unwrap_or(0.0);
        right -= last.max(6.0);
        top += 4.0;
        if let Some(ml) = plot_layout {
            // Disposition manuelle de la zone de traçage (fractions du graphique).
            let f = |k: &str| num(ml, k);
            if let (Some(x), Some(y), Some(ww), Some(hh)) = (f("x"), f("y"), f("w"), f("h"))
                && val(ml, "layoutTarget") == Some("inner")
                && ww > 0.05
                && hh > 0.05
            {
                {
                    left = left.max(x * w);
                    top = top.max(y * h);
                    right = right.min((x + ww) * w);
                    bottom = bottom.min((y + hh) * h);
                }
            }
        }
        if right - left < 20.0 || bottom - top < 20.0 {
            svg.push_str("</svg>");
            return svg;
        }
        svg = svg.replace("__HX__", &format!("{:.2}", (left + right) / 2.0)).replace("__VY__", &format!("{:.2}", (top + bottom) / 2.0));
        let px = |a: &Axis, v: f64| -> f64 { pos(a, v, left, right) };
        let py = |a: &Axis, v: f64| -> f64 { pos(a, v, bottom, top) };

        // Fond de la zone de traçage.
        if let Some(Some(c)) = fill(child(plot, "spPr")) {
            let _ = write!(svg, r##"<rect x="{left:.2}" y="{top:.2}" width="{:.2}" height="{:.2}" fill="#{c}"/>"##, right - left, bottom - top);
        }
        // Quadrillage.
        for (a, horizontal) in [(&hax, true), (&vax, false)] {
            let Some(g) = &a.grid else { continue };
            if g.color.is_none() {
                continue;
            }
            let vals: Vec<f64> = if a.category && self.kind != Kind::Scatter { (0..=n_cats).map(|i| i as f64).collect() } else { ticks(a) };
            for v in vals {
                if horizontal {
                    let x = px(a, v);
                    let _ = write!(svg, r#"<line x1="{x:.2}" y1="{top:.2}" x2="{x:.2}" y2="{bottom:.2}" {}/>"#, stroke_attrs(g));
                } else {
                    let y = py(a, v);
                    let _ = write!(svg, r#"<line x1="{left:.2}" y1="{y:.2}" x2="{right:.2}" y2="{y:.2}" {}/>"#, stroke_attrs(g));
                }
            }
        }
        // L'axe horizontal est tracé à la hauteur où il croise l'axe vertical.
        let h_at = py(&vax, cross_of(self.kind, &vax)).clamp(top, bottom);
        let v_at = px(&hax, cross_of(self.kind, &hax)).clamp(left, right);

        // Séries.
        // Les traits s'arrêtent au bord de la zone ; les marqueurs peuvent déborder.
        let _ = write!(
            svg,
            r#"<clipPath id="pl"><rect x="{left:.2}" y="{top:.2}" width="{:.2}" height="{:.2}"/></clipPath><clipPath id="pm"><rect x="{:.2}" y="{:.2}" width="{:.2}" height="{:.2}"/></clipPath>"#,
            right - left,
            bottom - top,
            left - 8.0,
            top - 8.0,
            right - left + 16.0,
            bottom - top + 16.0
        );
        let mut marks = String::new();
        svg.push_str(r#"<g clip-path="url(#pl)">"#);
        let n_series = self.series.len();
        for (si, s) in self.series.iter().enumerate() {
            match self.kind {
                Kind::Bar { horizontal, stacked, percent } => {
                    let (ca, va) = if horizontal { (&vax, &hax) } else { (&hax, &vax) };
                    let groups = if stacked { 1 } else { n_series };
                    for (i, y) in s.ys.iter().enumerate() {
                        let Some(y) = *y else { continue };
                        let (from, to) = if stacked {
                            let below: f64 = self.series[..si].iter().filter_map(|o| o.ys.get(i).copied().flatten()).sum();
                            let total: f64 = self.series.iter().filter_map(|o| o.ys.get(i).copied().flatten()).sum();
                            if percent && total != 0.0 { (below / total, (below + y) / total) } else { (below, below + y) }
                        } else {
                            (0.0, y)
                        };
                        let slot = 1.0 / (groups as f64 + 1.5);
                        let start = i as f64 + slot * 0.75 + if stacked { 0.0 } else { slot * si as f64 };
                        let fillc = s.fill.clone().unwrap_or(s.color.clone());
                        if horizontal {
                            let (y0, y1) = (pos(ca, start, bottom, top), pos(ca, start + slot, bottom, top));
                            let (x0, x1) = (pos(va, from, left, right), pos(va, to, left, right));
                            let _ = write!(svg, r##"<rect x="{:.2}" y="{:.2}" width="{:.2}" height="{:.2}" fill="#{fillc}"/>"##, x0.min(x1), y0.min(y1), (x1 - x0).abs(), (y1 - y0).abs());
                        } else {
                            let (x0, x1) = (pos(ca, start, left, right), pos(ca, start + slot, left, right));
                            let (y0, y1) = (pos(va, from, bottom, top), pos(va, to, bottom, top));
                            let _ = write!(svg, r##"<rect x="{:.2}" y="{:.2}" width="{:.2}" height="{:.2}" fill="#{fillc}"/>"##, x0.min(x1), y0.min(y1), (x1 - x0).abs(), (y1 - y0).abs());
                        }
                    }
                }
                _ => {
                    let pts: Vec<(f64, f64)> = s
                        .xs
                        .iter()
                        .zip(&s.ys)
                        .filter_map(|(x, y)| Some((x.or(None)?, (*y)?)))
                        .filter(|(x, y)| (hax.log.is_none() || *x > 0.0) && (vax.log.is_none() || *y > 0.0))
                        .collect();
                    let screen: Vec<(f64, f64)> = pts
                        .iter()
                        .map(|(x, y)| {
                            let x = if self.kind == Kind::Scatter { *x } else { *x - 1.0 + if hax.between { 0.5 } else { 0.0 } };
                            (px(&hax, x), py(&vax, *y))
                        })
                        .collect();
                    if self.kind == Kind::Area && screen.len() > 1 {
                        let mut d = format!("M{:.2} {:.2}", screen[0].0, h_at);
                        for (x, y) in &screen {
                            let _ = write!(d, " L{x:.2} {y:.2}");
                        }
                        let _ = write!(d, " L{:.2} {:.2} Z", screen.last().unwrap().0, h_at);
                        let _ = write!(svg, r##"<path d="{d}" fill="#{}" fill-opacity="0.85"/>"##, s.fill.clone().unwrap_or(s.color.clone()));
                    }
                    if s.line.color.is_some() && screen.len() > 1 && self.kind != Kind::Area {
                        let d = if s.smooth { smooth_path(&screen) } else { poly_path(&screen) };
                        let _ = write!(svg, r#"<path d="{d}" fill="none" stroke-linejoin="round" {}/>"#, stroke_attrs(&s.line));
                    }
                    for t in &s.trends {
                        draw_trend(&mut svg, t, &pts, &hax, &vax, (left, top, right, bottom), self.kind == Kind::Scatter);
                    }
                    if let Some((sym, size, mfill, mline)) = &s.marker {
                        for (x, y) in &screen {
                            marker(&mut marks, sym, *x, *y, *size, mfill.as_deref(), mline.as_deref());
                        }
                    }
                    if s.values_shown {
                        for ((x, y), (_, v)) in screen.iter().zip(&pts) {
                            let _ = write!(marks, r#"<text x="{x:.2}" y="{:.2}" text-anchor="middle" {}>{}</text>"#, y - 6.0, TextStyle { size: base.size * 0.9, ..base.clone() }.attrs(), esc(&fmt_num(*v, s.code.as_deref().unwrap_or("General"))));
                        }
                    }
                }
            }
        }
        svg.push_str("</g>");
        let _ = write!(svg, r#"<g clip-path="url(#pm)">{marks}</g>"#);

        // Axes et graduations.
        for (a, horizontal) in [(&hax, true), (&vax, false)] {
            if a.deleted {
                continue;
            }
            let at = if horizontal { h_at } else { v_at };
            if a.line.color.is_some() {
                if horizontal {
                    let _ = write!(svg, r#"<line x1="{left:.2}" y1="{at:.2}" x2="{right:.2}" y2="{at:.2}" {}/>"#, stroke_attrs(&a.line));
                } else {
                    let _ = write!(svg, r#"<line x1="{at:.2}" y1="{top:.2}" x2="{at:.2}" y2="{bottom:.2}" {}/>"#, stroke_attrs(&a.line));
                }
            }
            if a.ticks != "none" && a.line.color.is_some() {
                let vals: Vec<f64> = if a.category && self.kind != Kind::Scatter { (0..=n_cats).map(|i| i as f64).collect() } else { ticks(a) };
                let (o, i) = match a.ticks {
                    "in" => (0.0, 4.0),
                    "cross" => (4.0, 4.0),
                    _ => (4.0, 0.0),
                };
                for v in vals {
                    if horizontal {
                        let x = px(a, v);
                        let _ = write!(svg, r#"<line x1="{x:.2}" y1="{:.2}" x2="{x:.2}" y2="{:.2}" {}/>"#, at - i, at + o, stroke_attrs(&a.line));
                    } else {
                        let y = py(a, v);
                        let _ = write!(svg, r#"<line x1="{:.2}" y1="{y:.2}" x2="{:.2}" y2="{y:.2}" {}/>"#, at - o, at + i, stroke_attrs(&a.line));
                    }
                }
            }
            // Petites graduations, plus courtes, entre les grandes.
            if a.minor != "none" && a.line.color.is_some() && !(a.category && self.kind != Kind::Scatter) {
                let (o, i) = match a.minor {
                    "in" => (0.0, 2.5),
                    "cross" => (2.5, 2.5),
                    _ => (2.5, 0.0),
                };
                for v in minor_ticks(a) {
                    if horizontal {
                        let x = px(a, v);
                        let _ = write!(svg, r#"<line x1="{x:.2}" y1="{:.2}" x2="{x:.2}" y2="{:.2}" {}/>"#, at - i, at + o, stroke_attrs(&a.line));
                    } else {
                        let y = py(a, v);
                        let _ = write!(svg, r#"<line x1="{:.2}" y1="{y:.2}" x2="{:.2}" y2="{y:.2}" {}/>"#, at - o, at + i, stroke_attrs(&a.line));
                    }
                }
            }
            let labels = if horizontal { &hlabels } else { &vlabels };
            let place = match a.labels {
                "low" => if horizontal { bottom } else { left },
                "high" => if horizontal { top } else { right },
                _ => at,
            };
            let below_min = if horizontal { a.reverse } else { !a.reverse };
            let _ = below_min;
            for (v, s) in labels {
                if horizontal {
                    let x = px(a, *v);
                    let y = if a.labels == "high" { place - 6.0 } else { place + a.style.size + 3.0 };
                    let _ = write!(svg, r#"<text x="{x:.2}" y="{y:.2}" text-anchor="middle" {}>{}</text>"#, a.style.attrs(), esc(s));
                } else {
                    let y = py(a, *v) + a.style.size * 0.35;
                    let (x, anchor) = if a.labels == "high" { (place + 6.0, "start") } else { (place - 6.0, "end") };
                    let _ = write!(svg, r#"<text x="{x:.2}" y="{y:.2}" text-anchor="{anchor}" {}>{}</text>"#, a.style.attrs(), esc(s));
                }
            }
        }
        svg.push_str("</svg>");
        svg
    }

    /// Valeurs portées par chaque direction (x puis y), courbes de tendance prolongées comprises.
    fn domains(&self) -> (Vec<f64>, Vec<f64>) {
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        let stacked = matches!(self.kind, Kind::Bar { stacked: true, .. });
        let percent = matches!(self.kind, Kind::Bar { percent: true, .. });
        for s in &self.series {
            for (x, y) in s.xs.iter().zip(&s.ys) {
                if let (Some(x), Some(y)) = (x, y) {
                    xs.push(*x);
                    if !stacked {
                        ys.push(*y);
                    }
                }
            }
            for t in &s.trends {
                let xv: Vec<f64> = s.xs.iter().zip(&s.ys).filter_map(|(x, y)| y.and(*x)).collect();
                if let (Some(lo), Some(hi)) = (xv.iter().copied().reduce(f64::min), xv.iter().copied().reduce(f64::max)) {
                    xs.push(lo - t.backward);
                    xs.push(hi + t.forward);
                }
            }
        }
        if stacked {
            let n = self.series.iter().map(|s| s.ys.len()).max().unwrap_or(0);
            for i in 0..n {
                let pos: f64 = self.series.iter().filter_map(|s| s.ys.get(i).copied().flatten()).filter(|v| *v > 0.0).sum();
                let neg: f64 = self.series.iter().filter_map(|s| s.ys.get(i).copied().flatten()).filter(|v| *v < 0.0).sum();
                if percent {
                    ys.push(if pos > 0.0 { 1.0 } else { 0.0 });
                    ys.push(if neg < 0.0 { -1.0 } else { 0.0 });
                } else {
                    ys.push(pos);
                    ys.push(neg);
                }
            }
        }
        if matches!(self.kind, Kind::Bar { .. } | Kind::Area) {
            ys.push(0.0);
        }
        (xs, ys)
    }

    fn pie(&self, svg: &mut String, left: f64, top: f64, right: f64, bottom: f64, base: &TextStyle) {
        let s = &self.series[0];
        let vals: Vec<f64> = s.ys.iter().map(|v| v.unwrap_or(0.0).max(0.0)).collect();
        let total: f64 = vals.iter().sum();
        if total <= 0.0 {
            return;
        }
        let r = ((right - left).min(bottom - top) / 2.0 - 4.0).max(4.0);
        let (cx, cy) = ((left + right) / 2.0, (top + bottom) / 2.0);
        let mut a0 = -std::f64::consts::FRAC_PI_2;
        for (i, v) in vals.iter().enumerate() {
            if *v <= 0.0 {
                continue;
            }
            let a1 = a0 + v / total * std::f64::consts::TAU;
            let (x0, y0) = (cx + r * a0.cos(), cy + r * a0.sin());
            let (x1, y1) = (cx + r * a1.cos(), cy + r * a1.sin());
            let large = if a1 - a0 > std::f64::consts::PI { 1 } else { 0 };
            let c = accent(i);
            if (a1 - a0 - std::f64::consts::TAU).abs() < 1e-9 {
                let _ = write!(svg, r##"<circle cx="{cx:.2}" cy="{cy:.2}" r="{r:.2}" fill="#{c}" stroke="#FFFFFF" stroke-width="1"/>"##);
            } else {
                let _ = write!(svg, r##"<path d="M{cx:.2} {cy:.2} L{x0:.2} {y0:.2} A{r:.2} {r:.2} 0 {large} 1 {x1:.2} {y1:.2} Z" fill="#{c}" stroke="#FFFFFF" stroke-width="1"/>"##);
            }
            if s.values_shown {
                let am = (a0 + a1) / 2.0;
                let st = TextStyle { color: "FFFFFF".into(), ..base.clone() };
                let _ = write!(svg, r#"<text x="{:.2}" y="{:.2}" text-anchor="middle" {}>{}</text>"#, cx + r * 0.65 * am.cos(), cy + r * 0.65 * am.sin() + st.size * 0.35, st.attrs(), esc(&fmt_num(*v, s.code.as_deref().unwrap_or("General"))));
            }
            a0 = a1;
        }
    }
}

fn legend_item(svg: &mut String, e: &Entry, x: f64, y: f64, st: &TextStyle, sym: f64) {
    let (name, fillc, line, mark) = e;
    if line.color.is_some() {
        let _ = write!(svg, r#"<line x1="{x:.2}" y1="{y:.2}" x2="{:.2}" y2="{y:.2}" {}/>"#, x + sym, stroke_attrs(line));
    }
    if let Some((s, size, mf, ml)) = mark {
        marker(svg, s, x + sym / 2.0, y, *size, mf.as_deref(), ml.as_deref());
    } else if line.color.is_none()
        && let Some(c) = fillc
    {
        let _ = write!(svg, r##"<rect x="{:.2}" y="{:.2}" width="7" height="7" fill="#{c}"/>"##, x + sym / 2.0 - 3.5, y - 3.5);
    }
    let _ = write!(svg, r#"<text x="{:.2}" y="{:.2}" {}>{}</text>"#, x + sym + 4.0, y + st.size * 0.35, st.attrs(), esc(name));
}

fn marker(svg: &mut String, sym: &str, x: f64, y: f64, size: f64, fillc: Option<&str>, line: Option<&str>) {
    let r = size / 2.0;
    let f = fillc.map(|c| format!("#{c}")).unwrap_or("none".into());
    let s = line.map(|c| format!(r##"stroke="#{c}" stroke-width="0.9""##)).unwrap_or(r#"stroke="none""#.into());
    let _ = match sym {
        "square" => write!(svg, r#"<rect x="{:.2}" y="{:.2}" width="{size:.2}" height="{size:.2}" fill="{f}" {s}/>"#, x - r, y - r),
        "diamond" => write!(svg, r#"<path d="M{x:.2} {:.2} L{:.2} {y:.2} L{x:.2} {:.2} L{:.2} {y:.2} Z" fill="{f}" {s}/>"#, y - r * 1.2, x + r * 1.2, y + r * 1.2, x - r * 1.2),
        "triangle" => write!(svg, r#"<path d="M{x:.2} {:.2} L{:.2} {:.2} L{:.2} {:.2} Z" fill="{f}" {s}/>"#, y - r * 1.15, x + r * 1.1, y + r * 0.85, x - r * 1.1, y + r * 0.85),
        "x" | "star" | "plus" => {
            let c = line.or(fillc).unwrap_or("000000");
            let st = format!(r##"stroke="#{c}" stroke-width="1.2""##);
            let mut d = String::new();
            if sym != "plus" {
                let _ = write!(d, "M{:.2} {:.2} L{:.2} {:.2} M{:.2} {:.2} L{:.2} {:.2}", x - r, y - r, x + r, y + r, x - r, y + r, x + r, y - r);
            }
            if sym != "x" {
                let _ = write!(d, " M{:.2} {y:.2} L{:.2} {y:.2} M{x:.2} {:.2} L{x:.2} {:.2}", x - r, x + r, y - r, y + r);
            }
            write!(svg, r#"<path d="{d}" fill="none" {st}/>"#)
        }
        "dash" => write!(svg, r#"<rect x="{:.2}" y="{:.2}" width="{size:.2}" height="{:.2}" fill="{f}" {s}/>"#, x - r, y - r * 0.25, r * 0.5),
        "dot" => write!(svg, r#"<circle cx="{x:.2}" cy="{y:.2}" r="{:.2}" fill="{f}" {s}/>"#, r * 0.5),
        _ => write!(svg, r#"<circle cx="{x:.2}" cy="{y:.2}" r="{r:.2}" fill="{f}" {s}/>"#),
    };
}

fn poly_path(p: &[(f64, f64)]) -> String {
    let mut d = String::new();
    for (i, (x, y)) in p.iter().enumerate() {
        let _ = write!(d, "{}{x:.2} {y:.2}", if i == 0 { "M" } else { " L" });
    }
    d
}

/// Courbe lissée (Catmull-Rom vers Bézier), proche du lissage d'Excel.
fn smooth_path(p: &[(f64, f64)]) -> String {
    let mut d = format!("M{:.2} {:.2}", p[0].0, p[0].1);
    for i in 0..p.len() - 1 {
        let p0 = if i == 0 { p[0] } else { p[i - 1] };
        let (p1, p2) = (p[i], p[i + 1]);
        let p3 = if i + 2 < p.len() { p[i + 2] } else { p2 };
        let t = 1.0 / 6.0;
        let _ = write!(
            d,
            " C{:.2} {:.2} {:.2} {:.2} {:.2} {:.2}",
            p1.0 + (p2.0 - p0.0) * t,
            p1.1 + (p2.1 - p0.1) * t,
            p2.0 - (p3.0 - p1.0) * t,
            p2.1 - (p3.1 - p1.1) * t,
            p2.0,
            p2.1
        );
    }
    d
}

// ------------------------------------------------------------ échelles

/// Bornes et pas d'un axe de valeurs, comme Excel : zéro inclus quand
/// l'écart le justifie, pas « rond » (1, 2 ou 5 × 10ⁿ).
fn scale(a: &mut Axis, data: &[f64], len: f64) {
    let data: Vec<f64> = data.iter().copied().filter(|v| v.is_finite() && (a.log.is_none() || *v > 0.0)).collect();
    let (mut lo, mut hi) = (data.iter().copied().fold(f64::INFINITY, f64::min), data.iter().copied().fold(f64::NEG_INFINITY, f64::max));
    if !lo.is_finite() {
        (lo, hi) = (0.0, 1.0);
    }
    if let Some(b) = a.log {
        let lb = |v: f64| v.ln() / b.ln();
        let lo2 = a.min.filter(|v| *v > 0.0).unwrap_or_else(|| b.powf(lb(lo).floor()));
        let mut hi2 = a.max.filter(|v| *v > 0.0).unwrap_or_else(|| b.powf(lb(hi).ceil()));
        if hi2 <= lo2 {
            hi2 = lo2 * b;
        }
        a.lo = lo2;
        a.hi = hi2;
        a.step = a.major.unwrap_or(b);
        return;
    }
    if a.min.is_none() && lo > 0.0 && hi - lo > hi / 6.0 {
        lo = 0.0;
    }
    if a.max.is_none() && hi < 0.0 && hi - lo > -lo / 6.0 {
        hi = 0.0;
    }
    if let Some(m) = a.min {
        lo = m;
    }
    if let Some(m) = a.max {
        hi = m;
    }
    if hi <= lo {
        let d = if lo == 0.0 { 1.0 } else { lo.abs() * 0.1 };
        if a.max.is_none() {
            hi = lo + d;
        } else {
            lo = hi - d;
        }
    }
    // Excel serre davantage les graduations verticales (une ligne de texte)
    // que les horizontales (la largeur d'un libellé).
    let max_ticks = (len / if a.horizontal { 40.0 } else { 27.0 }).clamp(3.0, 10.0);
    let step = a.major.unwrap_or_else(|| nice((hi - lo) / max_ticks));
    // Excel laisse un peu d'air (5 % de l'étendue) au-delà des points
    // extrêmes, sauf au zéro, puis arrondit au pas.
    let air = (hi - lo) * 0.05;
    let top = if hi > 0.0 && data.contains(&hi) { hi + air } else { hi };
    let bottom = if lo < 0.0 && data.contains(&lo) { lo - air } else { lo };
    let l2 = if a.min.is_some() { lo } else { (bottom / step).floor() * step };
    let h2 = if a.max.is_some() { hi } else { (top / step - 1e-9).ceil() * step };
    a.lo = l2;
    a.hi = h2.max(l2 + step * 0.5);
    a.step = step;
}

fn nice(raw: f64) -> f64 {
    if raw <= 0.0 || !raw.is_finite() {
        return 1.0;
    }
    let p = 10f64.powf(raw.log10().floor());
    let f = raw / p;
    let n = if f <= 1.0 {
        1.0
    } else if f <= 2.0 {
        2.0
    } else if f <= 5.0 {
        5.0
    } else {
        10.0
    };
    n * p
}

fn ticks(a: &Axis) -> Vec<f64> {
    let mut out = Vec::new();
    if let Some(b) = a.log {
        let mut v = a.lo;
        let factor = if a.step > 1.0 { a.step } else { b };
        while v <= a.hi * (1.0 + 1e-9) && out.len() < 64 {
            out.push(v);
            v *= factor;
        }
        return out;
    }
    let n = ((a.hi - a.lo) / a.step).round() as i64;
    for i in 0..=n.clamp(0, 200) {
        let v = a.lo + a.step * i as f64;
        // Arrondi : 0,30000000000000004 → 0,3.
        let v = (v / a.step).round() * a.step;
        let v = if v.abs() < a.step * 1e-9 { 0.0 } else { v };
        if v <= a.hi + a.step * 1e-9 {
            out.push(v);
        }
    }
    out
}

/// Petites graduations : 2..9 × 10ⁿ en log, un cinquième du pas sinon.
fn minor_ticks(a: &Axis) -> Vec<f64> {
    let major = ticks(a);
    let mut out = Vec::new();
    if let Some(b) = a.log {
        let n = b.round() as i64;
        for w in major.windows(2) {
            for k in 2..n.max(2) {
                out.push(w[0] * k as f64);
            }
        }
        return out;
    }
    let unit = a.minor_unit.unwrap_or(a.step / 5.0);
    if unit <= 0.0 || (a.hi - a.lo) / unit > 400.0 {
        return out;
    }
    let mut v = (a.lo / unit).ceil() * unit;
    while v <= a.hi + unit * 1e-9 {
        let on_major = ((v - a.lo) / a.step - ((v - a.lo) / a.step).round()).abs() < 1e-6;
        if !on_major {
            out.push(v);
        }
        v += unit;
    }
    out
}

/// Valeur où l'autre axe croise `other` (`crosses`, `crossesAt`).
fn cross_of(kind: Kind, other: &Axis) -> f64 {
    if let Some(v) = other.crosses_at {
        return v;
    }
    match other.crosses {
        "min" => other.lo,
        "max" => other.hi,
        _ if other.category && kind != Kind::Scatter => other.lo,
        _ if other.log.is_some() => other.lo,
        _ if 0.0 >= other.lo.min(other.hi) && 0.0 <= other.lo.max(other.hi) => 0.0,
        _ if other.lo.abs() < other.hi.abs() => other.lo,
        _ => other.hi,
    }
}

/// Fraction (0 au début, 1 à la fin de l'axe) d'une valeur.
fn frac(a: &Axis, v: f64) -> f64 {
    pos(a, v, 0.0, 1.0)
}

/// Position à l'écran d'une valeur sur un axe (de `from` à `to`).
fn pos(a: &Axis, v: f64, from: f64, to: f64) -> f64 {
    let t = match a.log {
        Some(_) if v > 0.0 && a.lo > 0.0 => (v.ln() - a.lo.ln()) / (a.hi.ln() - a.lo.ln()),
        Some(_) => -1.0,
        None => (v - a.lo) / (a.hi - a.lo),
    };
    let t = if a.reverse { 1.0 - t } else { t };
    from + (to - from) * t
}

// ------------------------------------------------------------ tendances

/// Coefficients d'une régression et son R², comme Excel (sur ln y pour les
/// ajustements exponentiel et puissance).
fn regress(fit: Fit, pts: &[(f64, f64)]) -> Option<(Vec<f64>, f64)> {
    let pick: Vec<(f64, f64)> = pts
        .iter()
        .copied()
        .filter(|(x, y)| match fit {
            Fit::Exp => *y > 0.0,
            Fit::Log => *x > 0.0,
            Fit::Power => *x > 0.0 && *y > 0.0,
            _ => true,
        })
        .map(|(x, y)| match fit {
            Fit::Exp => (x, y.ln()),
            Fit::Log => (x.ln(), y),
            Fit::Power => (x.ln(), y.ln()),
            _ => (x, y),
        })
        .collect();
    let order = match fit {
        Fit::Poly(n) => n,
        Fit::Moving(_) => return None,
        _ => 1,
    };
    if pick.len() <= order {
        return None;
    }
    // Moindres carrés : équations normales, élimination de Gauss.
    let m = order + 1;
    let mut a = vec![vec![0.0; m + 1]; m];
    for (x, y) in &pick {
        let pw: Vec<f64> = (0..2 * m).map(|k| x.powi(k as i32)).collect();
        for r in 0..m {
            for c in 0..m {
                a[r][c] += pw[r + c];
            }
            a[r][m] += y * pw[r];
        }
    }
    for col in 0..m {
        let piv = (col..m).max_by(|i, j| a[*i][col].abs().total_cmp(&a[*j][col].abs()))?;
        if a[piv][col].abs() < 1e-300 {
            return None;
        }
        a.swap(col, piv);
        for r in 0..m {
            if r != col {
                let f = a[r][col] / a[col][col];
                let pivot = a[col].clone();
                for (c, v) in a[r].iter_mut().enumerate().skip(col) {
                    *v -= f * pivot[c];
                }
            }
        }
    }
    let beta: Vec<f64> = (0..m).map(|i| a[i][m] / a[i][i]).collect();
    let eval = |x: f64| beta.iter().enumerate().map(|(k, b)| b * x.powi(k as i32)).sum::<f64>();
    let mean = pick.iter().map(|p| p.1).sum::<f64>() / pick.len() as f64;
    let ss_tot: f64 = pick.iter().map(|p| (p.1 - mean).powi(2)).sum();
    let ss_res: f64 = pick.iter().map(|p| (p.1 - eval(p.0)).powi(2)).sum();
    let r2 = if ss_tot > 0.0 { 1.0 - ss_res / ss_tot } else { 1.0 };
    if beta.iter().any(|b| !b.is_finite()) {
        return None;
    }
    Some((beta, r2))
}

fn trend_y(fit: Fit, beta: &[f64], x: f64) -> Option<f64> {
    let y = match fit {
        Fit::Linear | Fit::Poly(_) => beta.iter().enumerate().map(|(k, b)| b * x.powi(k as i32)).sum(),
        Fit::Exp => beta[0].exp() * (beta[1] * x).exp(),
        Fit::Log if x > 0.0 => beta[0] + beta[1] * x.ln(),
        Fit::Power if x > 0.0 => beta[0].exp() * x.powf(beta[1]),
        _ => return None,
    };
    y.is_finite().then_some(y)
}

/// Équation affichée par Excel, en morceaux (texte, exposant ?).
fn equation(fit: Fit, beta: &[f64]) -> Vec<(String, bool)> {
    let signed = |v: f64, first: bool| -> String {
        if first {
            coef(v)
        } else if v < 0.0 {
            format!(" - {}", coef(-v))
        } else {
            format!(" + {}", coef(v))
        }
    };
    match fit {
        Fit::Linear => vec![(format!("y = {}x{}", coef(beta[1]), signed(beta[0], false)), false)],
        Fit::Exp => vec![(format!("y = {}e", coef(beta[0].exp())), false), (format!("{}x", coef(beta[1])), true)],
        Fit::Log => vec![(format!("y = {}ln(x){}", coef(beta[1]), signed(beta[0], false)), false)],
        Fit::Power => vec![(format!("y = {}x", coef(beta[0].exp())), false), (coef(beta[1]), true)],
        Fit::Poly(n) => {
            let mut out = vec![("y = ".to_string(), false)];
            for k in (0..=n).rev() {
                let b = beta[k];
                let first = k == n;
                let txt = signed(b, first);
                match k {
                    0 => out.push((txt, false)),
                    1 => out.push((format!("{txt}x"), false)),
                    _ => {
                        out.push((format!("{txt}x"), false));
                        out.push((k.to_string(), true));
                    }
                }
            }
            out
        }
        Fit::Moving(_) => Vec::new(),
    }
}

fn draw_trend(svg: &mut String, t: &Trend, pts: &[(f64, f64)], hax: &Axis, vax: &Axis, (left, top, right, bottom): (f64, f64, f64, f64), numeric_x: bool) {
    let mut pts: Vec<(f64, f64)> = pts.to_vec();
    pts.sort_by(|a, b| a.0.total_cmp(&b.0));
    if pts.len() < 2 {
        return;
    }
    let to_screen = |x: f64, y: f64| {
        let x = if numeric_x { x } else { x - 1.0 + if hax.between { 0.5 } else { 0.0 } };
        (pos(hax, x, left, right), pos(vax, y, bottom, top))
    };
    if let Fit::Moving(p) = t.fit {
        let mut avg = Vec::new();
        for i in p - 1..pts.len() {
            let y = pts[i + 1 - p..=i].iter().map(|q| q.1).sum::<f64>() / p as f64;
            avg.push(to_screen(pts[i].0, y));
        }
        if avg.len() > 1 {
            let _ = write!(svg, r#"<path d="{}" fill="none" {}/>"#, poly_path(&avg), stroke_attrs(&t.stroke));
        }
        return;
    }
    let Some((beta, r2)) = regress(t.fit, &pts) else { return };
    let x0 = pts[0].0 - t.backward;
    let x1 = pts[pts.len() - 1].0 + t.forward;
    let line: Vec<(f64, f64)> = (0..=120)
        .filter_map(|i| {
            let x = x0 + (x1 - x0) * i as f64 / 120.0;
            if hax.log.is_some() && x <= 0.0 {
                return None;
            }
            let y = trend_y(t.fit, &beta, x)?;
            if vax.log.is_some() && y <= 0.0 {
                return None;
            }
            Some(to_screen(x, y))
        })
        .filter(|(x, y)| x.is_finite() && y.is_finite() && *y > top - 2000.0 && *y < bottom + 2000.0)
        .collect();
    if line.len() > 1 && t.stroke.color.is_some() {
        let _ = write!(svg, r#"<path d="{}" fill="none" {}/>"#, poly_path(&line), stroke_attrs(&t.stroke));
    }
    if !(t.show_eq || t.show_r2) {
        return;
    }
    let st = t.label.clone().unwrap_or(TextStyle { size: 12.0, bold: false, color: "595959".into() });
    // Près de la fin de la courbe, comme Excel, sans sortir de la zone.
    let (ex, ey) = line.last().copied().unwrap_or((right, top));
    let lines = (t.show_eq as usize + t.show_r2 as usize) as f64;
    let mut eq = String::new();
    if t.show_eq {
        for (s, sup) in equation(t.fit, &beta) {
            if sup {
                let _ = write!(eq, r#"<tspan dy="-{:.2}" font-size="{:.2}">{}</tspan><tspan dy="{:.2}"></tspan>"#, st.size * 0.35, st.size * 0.75, esc(&s), st.size * 0.35);
            } else {
                eq.push_str(&esc(&s));
            }
        }
    }
    let width = st.width(&equation(t.fit, &beta).iter().map(|p| p.0.as_str()).collect::<String>()).max(st.width("R² = 0,0000"));
    let x = (ex - width - 6.0).clamp(left + 4.0, (right - width - 4.0).max(left + 4.0));
    let y = (ey - st.size * lines - 6.0).clamp(top + st.size, (bottom - st.size * lines).max(top + st.size));
    let mut row = y;
    if t.show_eq {
        let _ = write!(svg, r#"<text x="{x:.2}" y="{row:.2}" {}>{eq}</text>"#, st.attrs());
        row += st.size * 1.25;
    }
    if t.show_r2 {
        let _ = write!(svg, r#"<text x="{x:.2}" y="{row:.2}" {}>R² = {}</text>"#, st.attrs(), esc(&format!("{r2:.4}").replace('.', ",")));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_a_la_francaise() {
        assert_eq!(fmt_num(0.25, "General"), "0,25");
        assert_eq!(fmt_num(1234.5, "#,##0.0"), "1\u{202F}234,5");
        assert_eq!(fmt_num(0.000_036_9, "0.00E+00"), "3,69E-05");
        assert_eq!(fmt_num(0.5, "0%"), "50 %");
        assert_eq!(fmt_num(2.0, "0.0#"), "2,0");
        assert_eq!(general(0.000_01), "1E-05");
        assert_eq!(coef(-0.001_234_6), "-0,001235");
    }

    #[test]
    fn regression_exponentielle_comme_excel() {
        let pts: Vec<(f64, f64)> = (0..10).map(|i| (i as f64 * 100.0, 2.0 * (-0.003 * i as f64 * 100.0f64).exp())).collect();
        let (b, r2) = regress(Fit::Exp, &pts).unwrap();
        assert!((b[0].exp() - 2.0).abs() < 1e-9 && (b[1] + 0.003).abs() < 1e-12);
        assert!((r2 - 1.0).abs() < 1e-12);
        let eq: String = equation(Fit::Exp, &b).into_iter().map(|p| p.0).collect();
        assert_eq!(eq, "y = 2e-0,003x");
    }

    #[test]
    fn echelle_ronde() {
        let mut a = Axis {
            category: false,
            horizontal: true,
            deleted: false,
            log: None,
            min: None,
            max: None,
            reverse: false,
            major: None,
            minor_unit: None,
            grid: None,
            title: None,
            title_at: None,
            minor: "none",
            code: None,
            linked: true,
            style: TextStyle { size: 12.0, bold: false, color: "000000".into() },
            line: Stroke { color: None, width: 1.0, dash: None, round: false },
            ticks: "none",
            labels: "nextTo",
            crosses: "autoZero",
            crosses_at: None,
            between: false,
            lo: 0.0,
            hi: 0.0,
            step: 0.0,
        };
        scale(&mut a, &[120.0, 4680.0], 400.0);
        assert_eq!((a.lo, a.hi, a.step), (0.0, 5000.0, 500.0));
        a.log = Some(10.0);
        scale(&mut a, &[0.038, 1.0], 300.0);
        assert!((a.lo - 0.01).abs() < 1e-12 && (a.hi - 1.0).abs() < 1e-12);
        assert_eq!(ticks(&a).len(), 3);
        // Pas d'Excel : 1, 2 ou 5 × 10ⁿ, jamais 2,5.
        a.log = None;
        scale(&mut a, &[1.0, 21.0], 400.0);
        assert!(a.step == 2.0 || a.step == 5.0, "pas {}", a.step);
    }
}
