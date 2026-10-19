//! Parcours du corps du document : paragraphes dans l'ordre de lecture,
//! puis leur contenu en « morceaux » (texte, champ, objet) avec leur suivi,
//! leurs commentaires actifs et, pour le texte simple hors suivi, la
//! référence au run XML qui permettra de le retoucher.

use crate::story::Scope;
use crate::xml::{M, W, id_of, inner_range, is_w, start_tag, w_attr, w_child};
use roxmltree::{Document, Node};
use std::ops::Range;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RevKind {
    Ins,
    Del,
    MoveTo,
    MoveFrom,
}

impl RevKind {
    pub fn removes(self) -> bool {
        matches!(self, RevKind::Del | RevKind::MoveFrom)
    }
    pub fn name(self) -> &'static str {
        match self {
            RevKind::Ins => "ins",
            RevKind::Del => "del",
            RevKind::MoveTo => "moveTo",
            RevKind::MoveFrom => "moveFrom",
        }
    }
    pub(crate) fn of(node: Node) -> Option<Self> {
        if node.tag_name().namespace() != Some(W) {
            return None;
        }
        match node.tag_name().name() {
            "ins" => Some(RevKind::Ins),
            "del" => Some(RevKind::Del),
            "moveTo" => Some(RevKind::MoveTo),
            "moveFrom" => Some(RevKind::MoveFrom),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Fmt {
    pub b: bool,
    pub i: bool,
    pub u: bool,
    pub strike: bool,
    pub sup: bool,
    pub sub: bool,
    pub font: Option<String>,
    /// Taille en demi-points (`w:sz`).
    pub size: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Kind {
    Text,
    Tab,
    Break,
    /// Résultat affiché d'un champ (citation Zotero, renvoi…) : intouchable.
    Field(String),
    /// Image, équation, objet incorporé, appel de note : intouchable.
    Object(String),
}

#[derive(Clone, Debug)]
pub enum Tok {
    Text(String),
    Tab,
    Br,
    Cr,
    NoBreakHyphen,
    SoftHyphen,
}

impl Tok {
    pub fn text(&self) -> String {
        match self {
            Tok::Text(s) => s.clone(),
            Tok::Tab => "\t".into(),
            Tok::Br | Tok::Cr => "\n".into(),
            Tok::NoBreakHyphen => "\u{2011}".into(),
            Tok::SoftHyphen => String::new(),
        }
    }
}

/// Run « simple » (propriétés + texte, tabulations, sauts de ligne) hors de
/// tout suivi et de tout champ : le seul qu'on sache découper sans risque.
#[derive(Clone, Debug)]
pub struct RunInfo {
    pub range: Range<usize>,
    pub start_tag: String,
    pub rpr: String,
    pub toks: Vec<Tok>,
    /// Run d'une insertion en suivi (id, auteur) : retouchable par son auteur
    /// seulement, qui modifie alors son propre ajout sans nouveau suivi.
    pub ins: Option<(u32, String)>,
}

#[derive(Clone, Debug)]
pub struct Piece {
    pub text: String,
    pub kind: Kind,
    /// Suivi le plus intérieur qui enveloppe le morceau.
    pub rev: Option<(RevKind, u32)>,
    pub fmt: Fmt,
    pub comments: Vec<u32>,
    /// (indice dans `Inline::runs`, indice du jeton) si retouchable.
    pub run: Option<(usize, usize)>,
    /// Position de l'enfant direct du paragraphe qui contient le morceau.
    pub top: Range<usize>,
    /// Objet ou champ entier, supprimable d'un bloc (figure, appel de note,
    /// citation, équation) : sa position dans le XML.
    pub unit: Option<Range<usize>>,
    /// Objet ajouté en suivi : auteur de l'insertion qui l'enveloppe. Son
    /// auteur l'efface sans trace ; un autre doit refuser l'ajout.
    pub unit_ins: Option<String>,
    /// Image : relation vers le fichier, taille affichée.
    pub media: Option<Media>,
    /// Équation : son LaTeX.
    pub math: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Media {
    /// `r:embed` (ou `r:id` d'une image VML).
    pub rel: String,
    /// Taille en EMU (914 400 par pouce).
    pub cx: u64,
    pub cy: u64,
    pub descr: String,
}

#[derive(Default)]
pub struct Inline {
    pub pieces: Vec<Piece>,
    pub runs: Vec<RunInfo>,
    /// Commentaires dont l'appel (commentReference) est dans ce paragraphe.
    pub comment_refs: Vec<u32>,
    /// Commentaires ouverts dans ce paragraphe.
    pub comment_starts: Vec<u32>,
}

struct FieldFrame {
    instr: String,
    in_result: bool,
    kind: String,
    /// Run `begin` : début du champ, son parent, et le premier morceau du
    /// paragraphe produit par le champ (pour le supprimer d'un bloc).
    begin: usize,
    parent: Option<roxmltree::NodeId>,
    first_piece: usize,
    clean: bool,
}

/// État qui traverse les paragraphes : commentaires ouverts, champs ouverts
/// (une bibliographie Zotero couvre plusieurs paragraphes).
#[derive(Default)]
pub struct State {
    comments: Vec<u32>,
    fields: Vec<FieldFrame>,
}

pub struct ParaRef<'a, 'i> {
    pub node: Node<'a, 'i>,
    /// (tableau, ligne, cellule) pour un paragraphe de cellule.
    pub cell: Option<(u32, u32, u32)>,
}

/// Paragraphes d'une histoire (corps, note, en-tête…) dans l'ordre de
/// lecture (cellules comprises, zones de texte des dessins exclues).
pub(crate) fn paragraphs_in<'a, 'i>(doc: &'a Document<'i>, scope: &Scope) -> Vec<ParaRef<'a, 'i>> {
    let mut out = Vec::new();
    let mut tables = 0;
    if let Some(c) = crate::story::container(doc, scope) {
        blocks(c, None, &mut tables, &mut out);
    }
    out
}

fn blocks<'a, 'i>(parent: Node<'a, 'i>, cell: Option<(u32, u32, u32)>, tables: &mut u32, out: &mut Vec<ParaRef<'a, 'i>>) {
    for child in parent.children().filter(|n| n.is_element()) {
        if is_w(child, "p") {
            out.push(ParaRef { node: child, cell });
        } else if is_w(child, "tbl") {
            let t = *tables;
            *tables += 1;
            for (r, tr) in child.children().filter(|n| is_w(*n, "tr")).enumerate() {
                for (c, tc) in cells(tr).into_iter().enumerate() {
                    let here = cell.unwrap_or((t, r as u32, c as u32));
                    blocks(tc, Some(here), tables, out);
                }
            }
        } else if is_w(child, "sdt") {
            if let Some(content) = w_child(child, "sdtContent") {
                blocks(content, cell, tables, out);
            }
        } else if is_w(child, "customXml") {
            blocks(child, cell, tables, out);
        }
    }
}

fn cells<'a, 'i>(tr: Node<'a, 'i>) -> Vec<Node<'a, 'i>> {
    let mut out = Vec::new();
    for child in tr.children().filter(|n| n.is_element()) {
        if is_w(child, "tc") {
            out.push(child);
        } else if is_w(child, "sdt") || is_w(child, "customXml") {
            let inner = if is_w(child, "sdt") { w_child(child, "sdtContent") } else { Some(child) };
            if let Some(inner) = inner {
                out.extend(inner.children().filter(|n| is_w(*n, "tc")));
            }
        }
    }
    out
}

pub fn fmt_of(rpr: Option<Node>) -> Fmt {
    let mut f = Fmt::default();
    let Some(rpr) = rpr else { return f };
    let on = |name: &str| {
        w_child(rpr, name).is_some_and(|n| !matches!(w_attr(n, "val"), Some("0" | "false" | "off" | "none")))
    };
    f.b = on("b");
    f.i = on("i");
    f.u = on("u");
    f.strike = on("strike") || on("dstrike");
    f.font = w_child(rpr, "rFonts").and_then(|n| w_attr(n, "ascii").or(w_attr(n, "hAnsi"))).map(str::to_string);
    f.size = w_child(rpr, "sz").and_then(|n| w_attr(n, "val")).and_then(|v| v.parse().ok());
    if let Some(v) = w_child(rpr, "vertAlign").and_then(|n| w_attr(n, "val")) {
        f.sup = v == "superscript";
        f.sub = v == "subscript";
    }
    f
}

fn classify_field(instr: &str) -> String {
    let t = instr.trim();
    if t.contains("ZOTERO_") || t.contains("CSL_CITATION") {
        return if t.contains("BIBL") { "zotero-bibliographie".into() } else { "zotero".into() };
    }
    if t.contains("ADDIN EN.CITE") {
        return "endnote".into();
    }
    t.split_whitespace().next().unwrap_or("champ").to_lowercase()
}

struct Ctx<'s> {
    src: &'s str,
    revs: Vec<(RevKind, u32)>,
    rev_authors: Vec<String>,
    simple_field: Option<String>,
    top: Range<usize>,
    /// Le run est-il dans un conteneur où on accepte de le découper ?
    editable_parent: bool,
}

/// Parcourt le contenu d'un paragraphe.
pub fn inline(src: &str, p: Node, state: &mut State) -> Inline {
    let mut out = Inline::default();
    let mut ctx = Ctx { src, revs: Vec::new(), rev_authors: Vec::new(), simple_field: None, top: 0..0, editable_parent: true };
    for child in p.children().filter(|n| n.is_element()) {
        ctx.top = child.range();
        visit(child, &mut ctx, state, &mut out);
    }
    out
}

fn visit(node: Node, ctx: &mut Ctx, state: &mut State, out: &mut Inline) {
    let ns = node.tag_name().namespace();
    let name = node.tag_name().name();
    if ns == Some(M) && (name == "oMath" || name == "oMathPara") {
        let text: String = node.descendants().filter(|n| n.tag_name().namespace() == Some(M) && n.tag_name().name() == "t").filter_map(|n| n.text()).collect();
        push(ctx, state, out, text, Kind::Object("équation".into()), Fmt::default(), None);
        if let Some(last) = out.pieces.last_mut() {
            last.math = Some(crate::math::to_latex(node));
            if ctx.revs.is_empty() && ctx.top == node.range() {
                last.unit = Some(node.range());
            }
        }
        return;
    }
    if ns != Some(W) {
        // mc:AlternateContent et autres extensions : rien de lisible ici.
        return;
    }
    if let Some(kind) = RevKind::of(node) {
        ctx.revs.push((kind, id_of(node).unwrap_or(0)));
        ctx.rev_authors.push(w_attr(node, "author").unwrap_or("").to_string());
        for c in node.children().filter(|n| n.is_element()) {
            visit(c, ctx, state, out);
        }
        ctx.revs.pop();
        ctx.rev_authors.pop();
        return;
    }
    match name {
        "r" => run(node, ctx, state, out),
        "hyperlink" | "smartTag" | "customXml" | "dir" | "bdo" => {
            let keep = ctx.editable_parent;
            ctx.editable_parent = keep && name == "hyperlink";
            for c in node.children().filter(|n| n.is_element()) {
                visit(c, ctx, state, out);
            }
            ctx.editable_parent = keep;
        }
        "sdt" => {
            if let Some(content) = w_child(node, "sdtContent") {
                let keep = ctx.editable_parent;
                ctx.editable_parent = false;
                for c in content.children().filter(|n| n.is_element()) {
                    visit(c, ctx, state, out);
                }
                ctx.editable_parent = keep;
            }
        }
        "fldSimple" => {
            let prev = ctx.simple_field.replace(classify_field(w_attr(node, "instr").unwrap_or("")));
            let first = out.pieces.len();
            for c in node.children().filter(|n| n.is_element()) {
                visit(c, ctx, state, out);
            }
            ctx.simple_field = prev;
            if ctx.revs.is_empty() && ctx.simple_field.is_none() && state.fields.is_empty() {
                for p in &mut out.pieces[first..] {
                    p.unit = Some(node.range());
                }
            }
        }
        "commentRangeStart" => {
            if let Some(id) = id_of(node) {
                state.comments.push(id);
                out.comment_starts.push(id);
            }
        }
        "commentRangeEnd" => {
            if let Some(id) = id_of(node) {
                state.comments.retain(|c| *c != id);
            }
        }
        _ => {}
    }
}

fn run(r: Node, ctx: &mut Ctx, state: &mut State, out: &mut Inline) {
    let rpr = w_child(r, "rPr");
    let fmt = fmt_of(rpr);
    let mut toks = Vec::new();
    let in_ins = ctx.revs.len() == 1 && ctx.revs[0].0 == RevKind::Ins;
    let mut simple = (ctx.revs.is_empty() || in_ins) && ctx.simple_field.is_none() && state.fields.is_empty() && ctx.editable_parent;
    let mut pieces: Vec<(String, Kind, Option<usize>)> = Vec::new();
    let mut media = None;
    let mut whole = false;
    let mut field_unit: Option<Range<usize>> = None;
    for c in r.children().filter(|n| n.is_element()) {
        let ns = c.tag_name().namespace();
        let name = c.tag_name().name();
        if ns != Some(W) {
            simple = false;
            continue;
        }
        let tok = match name {
            "rPr" => continue,
            "t" | "delText" => Some(Tok::Text(c.text().unwrap_or("").to_string())),
            "tab" | "ptab" => Some(Tok::Tab),
            "br" => match w_attr(c, "type") {
                Some("page") | Some("column") => {
                    simple = false;
                    pieces.push(("\n".into(), Kind::Break, None));
                    None
                }
                _ => Some(Tok::Br),
            },
            "cr" => Some(Tok::Cr),
            "noBreakHyphen" => Some(Tok::NoBreakHyphen),
            "softHyphen" => Some(Tok::SoftHyphen),
            "lastRenderedPageBreak" => None,
            "fldChar" => {
                simple = false;
                match w_attr(c, "fldCharType") {
                    Some("begin") => state.fields.push(FieldFrame {
                        instr: String::new(),
                        in_result: false,
                        kind: String::new(),
                        begin: r.range().start,
                        parent: r.parent().map(|p| p.id()),
                        first_piece: out.pieces.len(),
                        clean: ctx.revs.is_empty() && ctx.simple_field.is_none(),
                    }),
                    Some("separate") => {
                        if let Some(f) = state.fields.last_mut() {
                            f.in_result = true;
                            f.kind = classify_field(&f.instr);
                        }
                    }
                    Some("end") => {
                        if let Some(f) = state.fields.pop()
                            && state.fields.is_empty() && f.clean && ctx.revs.is_empty() && f.parent == r.parent().map(|p| p.id()) && f.first_piece <= out.pieces.len() {
                                for p in &mut out.pieces[f.first_piece..] {
                                    p.unit = Some(f.begin..r.range().end);
                                }
                                // Les morceaux du résultat sont poussés après ce run : voir plus bas.
                                field_unit = Some(f.begin..r.range().end);
                            }
                    }
                    _ => {}
                }
                None
            }
            "instrText" | "delInstrText" => {
                simple = false;
                if let Some(f) = state.fields.last_mut().filter(|f| !f.in_result) {
                    f.instr.push_str(c.text().unwrap_or(""));
                }
                None
            }
            "drawing" | "pict" | "object" => {
                simple = false;
                media = media_of(c);
                let label = if name == "drawing" || media.is_some() { "image" } else { "objet" };
                // Un caractère de remplacement : la figure occupe une position.
                pieces.push(("\u{FFFC}".into(), Kind::Object(label.into()), None));
                whole = true;
                None
            }
            "footnoteReference" | "endnoteReference" => {
                simple = false;
                let n = w_attr(c, "id").unwrap_or("");
                let label = if name == "footnoteReference" { "note" } else { "note de fin" };
                pieces.push((n.to_string(), Kind::Object(label.into()), None));
                whole = true;
                None
            }
            "commentReference" => {
                simple = false;
                if let Some(id) = id_of(c) {
                    out.comment_refs.push(id);
                }
                None
            }
            "sym" => {
                simple = false;
                pieces.push(("\u{FFFD}".into(), Kind::Object("symbole".into()), None));
                whole = true;
                None
            }
            _ => {
                simple = false;
                None
            }
        };
        if let Some(tok) = tok {
            let kind = match tok {
                Tok::Tab => Kind::Tab,
                Tok::Br | Tok::Cr => Kind::Break,
                _ => Kind::Text,
            };
            pieces.push((tok.text(), kind, Some(toks.len())));
            toks.push(tok);
        }
    }
    let run_idx = if simple && !toks.is_empty() {
        out.runs.push(RunInfo {
            range: r.range(),
            start_tag: start_tag(ctx.src, r).to_string(),
            rpr: rpr.map(|n| ctx.src[n.range()].to_string()).unwrap_or_default(),
            toks,
            ins: in_ins.then(|| (ctx.revs[0].1, ctx.rev_authors[0].clone())),
        });
        Some(out.runs.len() - 1)
    } else {
        None
    };
    for (text, mut kind, tok) in pieces {
        if matches!(kind, Kind::Text | Kind::Tab | Kind::Break) {
            if let Some(f) = &ctx.simple_field {
                kind = Kind::Field(f.clone());
            } else if !state.fields.is_empty() {
                if state.fields.iter().any(|f| !f.in_result) {
                    continue; // texte d'instruction : caché
                }
                kind = Kind::Field(state.fields[0].kind.clone());
            }
        }
        let run_ref = run_idx.zip(tok);
        push(ctx, state, out, text, kind, fmt.clone(), run_ref);
        let last = out.pieces.last_mut().unwrap();
        last.media = media.clone();
        // Objet seul dans son run, hors suivi et hors champ : supprimable.
        let alone = r.children().filter(|n| n.is_element() && !is_w(*n, "rPr")).count() == 1;
        let plain = ctx.simple_field.is_none() && state.fields.is_empty();
        if whole && alone && ctx.revs.is_empty() && plain && ctx.editable_parent {
            last.unit = Some(r.range());
        } else if whole && alone && plain && ctx.revs.len() == 1 && ctx.revs[0].0 == RevKind::Ins {
            // Seul dans son w:ins : l'insertion entière part avec lui.
            let parent = r.parent().filter(|w| is_w(*w, "ins") && w.children().filter(|n| n.is_element()).count() == 1);
            last.unit = Some(parent.map_or(r.range(), |w| w.range()));
            last.unit_ins = Some(ctx.rev_authors[0].clone());
        }
        if let Some(u) = &field_unit {
            last.unit = Some(u.clone());
        }
    }
}

/// Image d'un dessin (DrawingML) ou d'une forme VML.
fn media_of(node: Node) -> Option<Media> {
    let rel_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    let blip = node.descendants().find(|n| n.tag_name().name() == "blip").and_then(|b| b.attribute((rel_ns, "embed")));
    let vml = node.descendants().find(|n| n.tag_name().name() == "imagedata").and_then(|b| b.attribute((rel_ns, "id")));
    let rel = blip.or(vml)?.to_string();
    let (mut cx, mut cy) = (0, 0);
    if let Some(ext) = node.descendants().find(|n| n.tag_name().name() == "extent") {
        cx = ext.attribute("cx").and_then(|v| v.parse().ok()).unwrap_or(0);
        cy = ext.attribute("cy").and_then(|v| v.parse().ok()).unwrap_or(0);
    } else if let Some(style) = node.descendants().find(|n| n.tag_name().name() == "shape").and_then(|s| s.attribute("style")) {
        // VML : « width:226.8pt;height:113.4pt »
        let pt = |key: &str| style.split(';').find_map(|kv| kv.trim().strip_prefix(key)).and_then(|v| v.trim_start_matches(':').trim().strip_suffix("pt")).and_then(|v| v.parse::<f64>().ok());
        cx = pt("width").map(|v| (v * 12_700.0) as u64).unwrap_or(0);
        cy = pt("height").map(|v| (v * 12_700.0) as u64).unwrap_or(0);
    }
    let descr = node.descendants().find(|n| n.tag_name().name() == "docPr").and_then(|d| d.attribute("descr").or(d.attribute("name"))).unwrap_or("").to_string();
    Some(Media { rel, cx, cy, descr })
}

fn push(ctx: &Ctx, state: &State, out: &mut Inline, text: String, kind: Kind, fmt: Fmt, run: Option<(usize, usize)>) {
    out.pieces.push(Piece {
        text,
        kind,
        rev: ctx.revs.last().copied(),
        fmt,
        comments: state.comments.clone(),
        run,
        top: ctx.top.clone(),
        unit: None,
        unit_ins: None,
        media: None,
        math: None,
    });
}

/// Suivi porté par la marque de paragraphe (`w:pPr/w:rPr/w:ins|del`).
pub fn mark_rev<'a, 'i>(p: Node<'a, 'i>) -> Option<(RevKind, u32, Node<'a, 'i>)> {
    let rpr = w_child(w_child(p, "pPr")?, "rPr")?;
    rpr.children().find_map(|c| RevKind::of(c).map(|k| (k, id_of(c).unwrap_or(0), c)))
}

/// Contenu du paragraphe sans ses propriétés (`w:pPr`).
pub fn content_after_ppr(p: Node) -> Option<Range<usize>> {
    let inner = inner_range(p)?;
    match w_child(p, "pPr") {
        Some(ppr) => {
            let start = ppr.range().end;
            (start < inner.end).then_some(start..inner.end)
        }
        None => Some(inner),
    }
}
