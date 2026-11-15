//! Figures retouchées à la main dans le panneau (Thierry, 2026-11-15) :
//! déplacer une figure et sa légende entre deux paragraphes, changer sa
//! taille par un coin, écrire son texte de remplacement.
//!
//! Déplacer : la figure doit être seule dans son paragraphe ; sa légende
//! (le paragraphe voisin au style de légende, ou qui commence par
//! « Figure N ») la suit. Hors suivi, les deux paragraphes sont coupés puis
//! collés. En suivi, on écrit ce que Word écrit pour un couper-coller :
//! l'ancienne place barrée (`w:del`, marques de paragraphe supprimées) et
//! la nouvelle ajoutée (`w:ins`, marques insérées). Les signets (renvois
//! « voir figure 3 ») et les commentaires suivent la copie neuve. Le modèle
//! reconnaît la paire et la présente comme un seul geste ([`pair`]), que
//! [`settle`] accepte ou refuse d'un bloc : refusée, la figure retrouve sa
//! place avec ses signets.
//!
//! Word ne suit ni la taille d'une image ni son texte de remplacement :
//! ces deux retouches s'écrivent toujours hors suivi.

use crate::model::{Change, Para, Segment, change_kind};
use crate::objects::EMU_PX;
use crate::review::{self, Decision};
use crate::story::{Scope, local_index, parse_ref};
use crate::walk::{self, RevKind, mark_rev};
use crate::xml::{self, W, W14, escape_attr, id_of, inner_range, is_w, open_tag, w_attr, w_child};
use crate::{DOCUMENT, Docx, Result, Signature, edit, err};
use roxmltree::{Node, NodeId};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::{BTreeSet, HashMap, HashSet};
use std::ops::Range;

/// Figure qui se déplace d'un bloc.
#[derive(Serialize, Debug, Clone, PartialEq, Default)]
pub struct FigureBlock {
    /// Paragraphe de légende (juste après, sinon juste avant) qui la suit.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub caption: Option<String>,
}

// ------------------------------------------------------------- lecture

/// Identifiants des styles de légende du document (« caption » de Word,
/// « Image Caption » de pandoc).
pub(crate) fn caption_styles(styles_xml: Option<&str>) -> HashSet<String> {
    let mut out = HashSet::new();
    let Some(text) = styles_xml else { return out };
    let Ok(doc) = xml::parse(text) else { return out };
    for st in doc.root_element().children().filter(|n| is_w(*n, "style")) {
        let Some(id) = w_attr(st, "styleId") else { continue };
        let name = w_child(st, "name").and_then(|n| w_attr(n, "val")).unwrap_or("").to_lowercase();
        let lid = id.to_lowercase();
        if matches!(name.as_str(), "caption" | "image caption" | "légende" | "legende") || matches!(lid.as_str(), "caption" | "imagecaption" | "lgende" | "légende" | "legende") {
            out.insert(id.to_string());
        }
    }
    out
}

/// Le texte commence-t-il comme une légende de figure (« Figure 3 »,
/// « Fig. 2.4 », « Figure S1 ») ? Sans style de légende (`strict`), le
/// numéro doit être suivi d'une ponctuation : « Figure 3 montre que… » est
/// une phrase du texte.
fn caption_text(text: &str, strict: bool) -> bool {
    let lower = text.trim_start().to_lowercase();
    ["figure", "fig.", "fig", "figura", "abbildung", "abb."].iter().any(|key| {
        let Some(rest) = lower.strip_prefix(key) else { return false };
        let after = rest.trim_start();
        // « Figures 3 et 4 » : le mot continue.
        if after.len() == rest.len() && !key.ends_with('.') && !rest.starts_with(|c: char| c.is_ascii_digit()) {
            return false;
        }
        let number: String = after.chars().take_while(|c| c.is_alphanumeric() || matches!(c, '.' | '-')).collect();
        if number.chars().count() > 8 || !number.chars().any(|c| c.is_ascii_digit()) {
            return false;
        }
        if !strict {
            return true;
        }
        let tail = after[number.len()..].trim_start();
        number.ends_with(['.', '-']) || tail.is_empty() || tail.starts_with(['.', ':', '–', '—', '-', '|', ')'])
    })
}

fn live(s: &Segment) -> bool {
    !matches!(s.rev, Some("del" | "moveFrom"))
}

/// Paragraphe de figure : `Some(true)` si la figure y est seule,
/// `Some(false)` si sa légende est écrite dans le même paragraphe.
fn figure_kind(p: &Para) -> Option<bool> {
    if !p.segments.iter().any(|s| live(s) && s.media.is_some()) {
        return None;
    }
    let mut other = String::new();
    for s in p.segments.iter().filter(|s| live(s) && s.media.is_none() && s.shape.is_none()) {
        // Une équation, une note : du contenu, pas un blanc.
        other.push_str(if s.kind == "object" { "x" } else { &s.text });
    }
    if other.trim().is_empty() {
        Some(true)
    } else if caption_text(&other, true) {
        Some(false)
    } else {
        None
    }
}

/// Repère les figures du corps qui se déplacent d'un bloc, et leur légende.
pub(crate) fn blocks(paragraphs: &mut [Para], parents: &[Option<NodeId>], captions: &HashSet<String>, changes: &[Change]) {
    let gone_marks: HashSet<u32> = changes.iter().filter(|c| c.kind == "paragraph-del").map(|c| c.id).collect();
    let gone = |p: &Para| p.mark_change.is_some_and(|m| gone_marks.contains(&m));
    let styled = |p: &Para| p.style.as_ref().is_some_and(|s| captions.contains(s));
    let n = paragraphs.len();
    let mut found: Vec<(usize, Option<usize>)> = Vec::new();
    let mut taken: Option<usize> = None;
    for i in 0..n {
        let p = &paragraphs[i];
        if gone(p) {
            continue;
        }
        let Some(alone) = figure_kind(p) else { continue };
        let mut caption = None;
        if alone {
            let near = |j: usize| {
                let q = &paragraphs[j];
                parents.get(j) == parents.get(i) && q.cell == p.cell && !gone(q) && figure_kind(q).is_none() && !q.text.trim().is_empty()
            };
            if i + 1 < n && near(i + 1) && {
                let q = &paragraphs[i + 1];
                (styled(q) && !q.text.trim_start().to_lowercase().starts_with("tab")) || caption_text(&q.text, true)
            } {
                caption = Some(i + 1);
            } else if i > 0 && taken != Some(i - 1) && near(i - 1) && styled(&paragraphs[i - 1]) && caption_text(&paragraphs[i - 1].text, false) {
                caption = Some(i - 1);
            }
        }
        taken = caption.or(taken);
        found.push((i, caption));
    }
    for (i, caption) in found {
        let caption = caption.map(|j| paragraphs[j].id.clone());
        paragraphs[i].figure = Some(FigureBlock { caption });
    }
}

/// Suite de paragraphes entièrement barrés (ou entièrement ajoutés) par un
/// même auteur, avec au moins une figure.
struct Run {
    removed: bool,
    author: String,
    first: usize,
    last: usize,
    ids: BTreeSet<u32>,
    rels: Vec<String>,
    lead: Option<u32>,
}

/// Reconnaît une figure déplacée en suivi : un bloc barré et un bloc ajouté
/// par le même auteur, avec la même image. Leurs suivis reçoivent le même
/// `group`. Tient aussi après un passage par Word, qui renumérote les suivis.
pub(crate) fn pair(paragraphs: &[Para], changes: &mut [Change]) {
    let by_id: HashMap<u32, usize> = changes.iter().enumerate().map(|(i, c)| (c.id, i)).collect();
    // Barré : tout le paragraphe l'est, par l'auteur de la marque. Ajouté :
    // la marque et les figures sont de lui, et rien n'y est du texte
    // d'origine (un autre a pu y retoucher la légende depuis).
    let whole = |p: &Para| -> Option<(bool, String)> {
        let mark = &changes[*by_id.get(&p.mark_change?)?];
        let removed = match mark.kind.as_str() {
            "paragraph-del" => true,
            "paragraph-ins" => false,
            _ => return None,
        };
        if p.segments.is_empty() {
            return None;
        }
        for s in &p.segments {
            let c = &changes[*by_id.get(&s.change?)?];
            let his = s.rev == Some(if removed { "del" } else { "ins" }) && c.author == mark.author;
            if !his && (removed || s.media.is_some()) {
                return None;
            }
        }
        Some((removed, mark.author.clone()))
    };
    let mut runs: Vec<Run> = Vec::new();
    for (i, p) in paragraphs.iter().enumerate() {
        let Some((removed, author)) = whole(p) else { continue };
        let joins = runs.last().is_some_and(|r| r.last + 1 == i && r.removed == removed && r.author == author && paragraphs[r.last].cell == p.cell);
        if !joins {
            runs.push(Run { removed, author, first: i, last: i, ids: BTreeSet::new(), rels: Vec::new(), lead: None });
        }
        let r = runs.last_mut().unwrap();
        r.last = i;
        r.ids.extend(p.mark_change);
        for s in &p.segments {
            // Les retouches d'un autre dans la légende déplacée ne sont pas du geste.
            let his = s.change.and_then(|c| by_id.get(&c)).is_some_and(|i| changes[*i].author == r.author && matches!(changes[*i].kind.as_str(), "ins" | "del"));
            if !his {
                continue;
            }
            r.ids.extend(s.change);
            if let Some(rel) = &s.media {
                r.rels.push(rel.clone());
                r.lead = r.lead.or(s.change);
            }
        }
    }
    runs.retain(|r| !r.rels.is_empty());
    let key = |r: &Run| {
        let mut k = r.rels.clone();
        k.sort();
        (r.author.clone(), k)
    };
    for old in runs.iter().filter(|r| r.removed) {
        let twins: Vec<&Run> = runs.iter().filter(|r| !r.removed && key(r) == key(old)).collect();
        let [new] = twins[..] else { continue };
        if runs.iter().filter(|r| r.removed && key(r) == key(old)).count() != 1 {
            continue;
        }
        let ids: BTreeSet<u32> = old.ids.union(&new.ids).copied().collect();
        // Un identifiant partagé avec une retouche d'ailleurs (LibreOffice
        // en réutilise) : on ne groupe pas, rien ne doit être caché.
        let inside = |i: usize| (old.first..=old.last).contains(&i) || (new.first..=new.last).contains(&i);
        let elsewhere = paragraphs.iter().enumerate().filter(|(i, _)| !inside(*i)).any(|(_, p)| p.mark_change.is_some_and(|m| ids.contains(&m)) || p.segments.iter().any(|s| s.change.is_some_and(|c| ids.contains(&c))));
        if elsewhere {
            continue;
        }
        let lead = new.lead.or_else(|| new.ids.first().copied());
        for id in &ids {
            if let Some(&i) = by_id.get(id) {
                changes[i].group = lead;
            }
        }
    }
}

// ----------------------------------------------------------- déplacer

/// Début d'élément `<w:nom …>` : son nom qualifié, pour le refermer.
fn tag_name(open: &str) -> String {
    open[1..].chars().take_while(|c| !c.is_whitespace() && *c != '>' && *c != '/').collect()
}

/// Remplace (ou ajoute) l'attribut sans préfixe `name` de `node`.
fn attr_edit(src: &str, node: Node, name: &str, value: &str) -> Option<(Range<usize>, String)> {
    let tag = xml::start_tag(src, node);
    let base = node.range().start;
    let pat = format!("{name}=\"");
    for (i, _) in tag.match_indices(&pat) {
        if !tag[..i].ends_with(|c: char| c.is_whitespace()) {
            continue;
        }
        let from = i + pat.len();
        let to = from + tag[from..].find('"')?;
        return Some((base + from..base + to, value.to_string()));
    }
    // Absent : juste après le nom de l'élément.
    if tag.contains(&format!("{name}='")) {
        return None;
    }
    let at = 1 + tag_name(tag).len();
    Some((base + at..base + at, format!(" {name}=\"{value}\"")))
}

/// Applique à la portion `range` de `src` des retouches données en
/// positions absolues.
fn splice_within(src: &str, range: Range<usize>, edits: Vec<(Range<usize>, String)>) -> Result<String> {
    let shifted = edits.into_iter().map(|(r, t)| (r.start - range.start..r.end - range.start, t)).collect();
    xml::splice(&src[range], shifted)
}

/// Run effacé en suivi : son texte devient `w:delText` (celui d'une zone
/// de texte posée sur la figure, dans le dessin, reste tel quel).
fn deleted_run(src: &str, r: Node) -> String {
    let mut out = open_tag(src, r);
    for c in r.children() {
        let text = &src[c.range()];
        let (from, to) = if is_w(c, "t") {
            ("w:t", "w:delText")
        } else if is_w(c, "instrText") {
            ("w:instrText", "w:delInstrText")
        } else {
            out.push_str(text);
            continue;
        };
        let body = text.strip_prefix(&format!("<{from}")).unwrap_or(text);
        let body = body.strip_suffix(&format!("</{from}>")).map(|b| format!("{b}</{to}>")).unwrap_or_else(|| body.to_string());
        out.push_str(&format!("<{to}{body}"));
    }
    out.push_str("</w:r>");
    out
}

/// Propriétés du paragraphe avec un suivi sur sa marque.
fn ppr_with_mark(src: &str, ppr: Option<Node>, mark: &str) -> String {
    let Some(ppr) = ppr else { return format!("<w:pPr><w:rPr>{mark}</w:rPr></w:pPr>") };
    let mut out = open_tag(src, ppr);
    let mut placed = false;
    for c in ppr.children().filter(|n| n.is_element()) {
        if is_w(c, "rPr") && !placed {
            out.push_str(&open_tag(src, c));
            out.push_str(mark);
            if let Some(r) = inner_range(c) {
                out.push_str(&src[r]);
            }
            out.push_str("</w:rPr>");
            placed = true;
            continue;
        }
        // rPr se place avant sectPr et pPrChange.
        if !placed && (is_w(c, "sectPr") || is_w(c, "pPrChange")) {
            out.push_str(&format!("<w:rPr>{mark}</w:rPr>"));
            placed = true;
        }
        out.push_str(&src[c.range()]);
    }
    if !placed {
        out.push_str(&format!("<w:rPr>{mark}</w:rPr>"));
    }
    out.push_str("</w:pPr>");
    out
}

/// Écrit la copie barrée (ancienne place) ou la copie ajoutée (nouvelle
/// place) d'un paragraphe.
struct Copier<'a> {
    src: &'a str,
    del: bool,
    open: String,
    close: &'static str,
    author: &'a str,
    /// Bornes de signet ou de commentaire (et appels de commentaire) qui
    /// débordent du bloc : elles restent à l'ancienne place.
    stays: &'a HashSet<NodeId>,
    /// Dernier `wp:docPr/@id` attribué : chaque dessin a le sien.
    docpr: u64,
}

impl Copier<'_> {
    /// Copie telle quelle, les dessins renumérotés (copie ajoutée).
    fn fresh(&mut self, node: Node) -> String {
        let mut edits = Vec::new();
        for d in node.descendants().filter(|n| n.is_element() && n.tag_name().name() == "docPr" && n.attribute("id").is_some()) {
            self.docpr += 1;
            edits.extend(attr_edit(self.src, d, "id", &self.docpr.to_string()));
        }
        splice_within(self.src, node.range(), edits).unwrap_or_else(|_| self.src[node.range()].to_string())
    }

    fn children(&mut self, parent: Node, out: &mut String) {
        let mut wrapped = false;
        for c in parent.children().filter(|n| n.is_element()) {
            let name = if c.tag_name().namespace() == Some(W) { c.tag_name().name() } else { "" };
            if name == "pPr" && is_w(parent, "p") {
                continue;
            }
            let call = name == "r" && w_child(c, "commentReference").is_some();
            if name == "r" && !call {
                if !wrapped {
                    out.push_str(&self.open);
                    wrapped = true;
                }
                let run = if self.del { deleted_run(self.src, c) } else { self.fresh(c) };
                out.push_str(&run);
                continue;
            }
            if wrapped {
                out.push_str(self.close);
                wrapped = false;
            }
            if call || matches!(name, "bookmarkStart" | "bookmarkEnd" | "commentRangeStart" | "commentRangeEnd") {
                if self.stays.contains(&c.id()) == self.del {
                    out.push_str(&self.src[c.range()]);
                }
            } else if name == "ins" && w_attr(c, "author") == Some(self.author) {
                // Son propre ajout encore en suivi : il part sans trace de
                // l'ancienne place et garde son suivi à la nouvelle.
                if !self.del {
                    let own = self.fresh(c);
                    out.push_str(&own);
                }
            } else if matches!(name, "hyperlink" | "fldSimple" | "smartTag" | "customXml" | "dir" | "bdo" | "sdt" | "sdtContent") && c.has_children() {
                let open = open_tag(self.src, c);
                out.push_str(&open);
                self.children(c, out);
                out.push_str(&format!("</{}>", tag_name(&open)));
            } else if name == "proofErr" {
                if self.del {
                    out.push_str(&self.src[c.range()]);
                }
            } else {
                out.push_str(&self.src[c.range()]);
            }
        }
        if wrapped {
            out.push_str(self.close);
        }
    }

    fn paragraph(&mut self, p: Node, mark: &str, para_id: Option<&str>) -> String {
        let mut out = open_tag(self.src, p);
        if let (Some(new), Some(old)) = (para_id, p.attribute((W14, "paraId"))) {
            out = out.replacen(&format!("w14:paraId=\"{old}\""), &format!("w14:paraId=\"{new}\""), 1);
        }
        out.push_str(&ppr_with_mark(self.src, w_child(p, "pPr"), mark));
        self.children(p, &mut out);
        out.push_str("</w:p>");
        out
    }
}

/// Suivis portés par un paragraphe (zones de texte du dessin comprises).
fn revisions<'a, 'i>(p: Node<'a, 'i>) -> impl Iterator<Item = Node<'a, 'i>> {
    p.descendants().filter(|n| n.is_element() && change_kind(*n).is_some())
}

/// Runs du paragraphe lui-même (pas ceux d'une zone de texte dessinée).
fn own_runs<'a, 'i>(p: Node<'a, 'i>) -> impl Iterator<Item = Node<'a, 'i>> {
    p.descendants().filter(move |n| is_w(*n, "r") && !n.ancestors().skip(1).take_while(|a| *a != p).any(|a| is_w(a, "p") || is_w(a, "r")))
}

/// Paragraphe entièrement ajouté en suivi par `author` (marque comprise) :
/// il se déplace tel quel, sans nouveau suivi.
fn own_insertion(p: Node, author: &str) -> bool {
    let marked = mark_rev(p).is_some_and(|(k, _, m)| k == RevKind::Ins && w_attr(m, "author") == Some(author));
    marked
        && revisions(p).all(|n| matches!(change_kind(n).as_deref(), Some("ins" | "paragraph-ins")) && w_attr(n, "author") == Some(author))
        && own_runs(p).filter(|r| w_child(*r, "commentReference").is_none()).all(|r| r.ancestors().skip(1).take_while(|a| *a != p).any(|a| is_w(a, "ins")))
}

/// Déplace la figure du paragraphe `paragraph` du corps, avec sa légende,
/// devant le paragraphe `to` (ou juste après lui). Rend le nouveau rang du
/// paragraphe de la figure et les suivis créés.
pub fn move_figure(docx: &mut Docx, paragraph: &str, to: &str, after: bool, tracked: bool, sig: &Signature) -> Result<Value> {
    let (from, dest) = (parse_ref(paragraph)?, parse_ref(to)?);
    if from.scope != Scope::Body || dest.scope != Scope::Body {
        return err("une figure se déplace dans le corps du document ; dans une note, un en-tête ou un pied de page, la déplacer dans Word");
    }
    let model = docx.model()?;
    let src = docx.part(DOCUMENT)?.unwrap_or_default();
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let paras = walk::paragraphs_in(&doc, &Scope::Body);
    let Some(fi) = local_index(&paras, &from.local) else { return err(format!("paragraphe {paragraph} introuvable")) };
    let Some(di) = local_index(&paras, &dest.local) else { return err(format!("paragraphe {to} introuvable")) };
    let Some(block) = model.paragraphs.get(fi).and_then(|p| p.figure.clone()) else {
        return err("cette figure ne se déplace pas d'un bloc : elle doit être seule dans son paragraphe (sa légende juste dessous). Dans une ligne de texte, la couper-coller dans Word");
    };
    let ci = block.caption.as_deref().and_then(|c| c.strip_prefix('p')).and_then(|n| n.parse::<usize>().ok()).filter(|c| *c < paras.len() && c.abs_diff(fi) == 1);
    let (a, b) = (fi.min(ci.unwrap_or(fi)), fi.max(ci.unwrap_or(fi)));
    let slot = if after { di + 1 } else { di };
    if (a..=b + 1).contains(&slot) {
        return Ok(json!({"moved": false, "paragraph": format!("p{fi}"), "changes": []}));
    }
    let nodes: Vec<Node> = paras[a..=b].iter().map(|p| p.node).collect();
    let target = paras[di].node;
    if nodes.iter().any(|n| n.parent() != target.parent()) {
        return err("la figure reste dans son conteneur (le corps du texte, ou sa cellule de tableau) : pour l'en sortir, la couper-coller dans Word");
    }
    if nodes.iter().any(|n| w_child(*n, "pPr").and_then(|p| w_child(p, "sectPr")).is_some()) {
        return err("ce paragraphe porte un saut de section : déplacer la figure dans Word");
    }
    let at = if after { target.range().end } else { target.range().start };
    let own = nodes.iter().all(|n| own_insertion(*n, &sig.author));
    let as_is = !tracked || own;
    let span = nodes[0].range().start..nodes[nodes.len() - 1].range().end;
    let in_block = |n: Node| if as_is { span.start <= n.range().start && n.range().end <= span.end } else { nodes.iter().any(|p| p.range().start <= n.range().start && n.range().end <= p.range().end) };

    // Signets et commentaires : ceux qui tiennent dans le bloc le suivent,
    // ceux qui en débordent restent où ils sont.
    let key = |n: Node| -> Option<(bool, String)> {
        if n.tag_name().namespace() != Some(W) {
            return None;
        }
        match n.tag_name().name() {
            "bookmarkStart" | "bookmarkEnd" => Some((false, w_attr(n, "id")?.to_string())),
            "commentRangeStart" | "commentRangeEnd" | "commentReference" => Some((true, w_attr(n, "id")?.to_string())),
            _ => None,
        }
    };
    let mut out_of_block: HashSet<(bool, String)> = HashSet::new();
    for n in doc.descendants().filter(|n| n.is_element()) {
        if let Some(k) = key(n)
            && !in_block(n) {
                out_of_block.insert(k);
            }
    }
    let mut stays: HashSet<NodeId> = HashSet::new();
    let mut stay_ranges: Vec<Range<usize>> = Vec::new();
    for n in nodes.iter().flat_map(|p| p.descendants()).chain(nodes[0].next_siblings().take_while(|s| s.range().end <= span.end)).filter(|n| n.is_element()) {
        let Some(k) = key(n) else { continue };
        if !out_of_block.contains(&k) || !in_block(n) {
            continue;
        }
        // L'appel d'un commentaire est un run entier.
        let whole = if is_w(n, "commentReference") { n.parent().filter(|r| is_w(*r, "r")).unwrap_or(n) } else { n };
        if stays.insert(whole.id()) {
            if as_is && is_w(n, "commentReference") {
                return err("un commentaire couvre à la fois cette figure et le texte voisin : activer le suivi pour la déplacer, ou déplacer d'abord le commentaire");
            }
            stay_ranges.push(whole.range());
        }
    }

    let len = b - a + 1;
    if as_is {
        // Coupé puis collé tel quel (hors suivi, ou son propre ajout).
        let moved = splice_within(&src, span.clone(), stay_ranges.iter().map(|r| (r.clone(), String::new())).collect())?;
        let left: String = stay_ranges.iter().map(|r| &src[r.clone()]).collect();
        let out = xml::splice(&src, vec![(span, left), (at..at, moved)])?;
        drop(doc);
        docx.set_part(DOCUMENT, out);
        let first = if slot <= a { slot } else { slot - len };
        return Ok(json!({"moved": true, "paragraph": format!("p{}", first + fi - a), "changes": []}));
    }

    // En suivi : rien d'autre en attente dans le bloc que ses propres ajouts.
    if nodes.iter().flat_map(|p| revisions(*p)).any(|n| change_kind(n).as_deref() != Some("ins") || w_attr(n, "author") != Some(sig.author.as_str())) {
        return err("cette figure ou sa légende porte des modifications en attente : les accepter ou les refuser d'abord, ou la déplacer sans le suivi");
    }
    if nodes.iter().flat_map(|p| p.descendants()).any(|n| is_w(n, "footnoteReference") || is_w(n, "endnoteReference")) {
        return err("la légende appelle une note : déplacer la figure sans le suivi, ou dans Word");
    }
    if nodes.iter().flat_map(|p| p.descendants()).any(|n| n.tag_name().namespace() == Some(xml::M) && n.tag_name().name() == "oMath") {
        return err("la légende contient une équation : déplacer la figure sans le suivi, ou dans Word");
    }
    let ids = edit::next_ids(docx, 4)?;
    let (del, del_mark, ins, ins_mark) = (ids[0], ids[1], ids[2], ids[3]);
    let who = format!("w:author=\"{}\" w:date=\"{}\"", escape_attr(&sig.author), escape_attr(&sig.date));
    let docpr = crate::objects::max_docpr(docx)?;
    let mut para_ids: Vec<String> = Vec::new();
    for (k, p) in nodes.iter().enumerate() {
        let seed = format!("{}{}{k}{ins}", p.attribute((W14, "paraId")).unwrap_or(""), sig.date);
        let mut pid = edit::fresh_para_id(docx, &seed)?;
        let mut salt = 0;
        while para_ids.contains(&pid) {
            salt += 1;
            pid = edit::fresh_para_id(docx, &format!("{seed}/{salt}"))?;
        }
        para_ids.push(pid);
    }
    let mut old = Copier { src: &src, del: true, open: format!("<w:del w:id=\"{del}\" {who}>"), close: "</w:del>", author: &sig.author, stays: &stays, docpr };
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    for p in &nodes {
        edits.push((p.range(), old.paragraph(*p, &format!("<w:del w:id=\"{del_mark}\" {who}/>"), None)));
    }
    let mut new = Copier { src: &src, del: false, open: format!("<w:ins w:id=\"{ins}\" {who}>"), close: "</w:ins>", author: &sig.author, stays: &stays, docpr };
    let mut pasted = String::new();
    for (p, pid) in nodes.iter().zip(&para_ids) {
        pasted.push_str(&new.paragraph(*p, &format!("<w:ins w:id=\"{ins_mark}\" {who}/>"), Some(pid)));
    }
    edits.push((at..at, pasted));
    let out = xml::splice(&src, edits)?;
    drop(doc);
    docx.set_part(DOCUMENT, out);
    Ok(json!({"moved": true, "paragraph": format!("p{}", slot + fi - a), "changes": [del, del_mark, ins, ins_mark]}))
}

// ------------------------------------------------- accepter ou refuser

/// Paragraphe sans ses suivis `ids` : ajouts déballés, marque rendue.
fn settled(src: &str, p: Node, ids: &BTreeSet<u32>) -> Result<String> {
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    for n in revisions(p).filter(|n| id_of(*n).is_some_and(|id| ids.contains(&id))) {
        match change_kind(n).as_deref() {
            Some("ins") => match (n.first_child(), n.last_child()) {
                (Some(first), Some(last)) => {
                    edits.push((n.range().start..first.range().start, String::new()));
                    edits.push((last.range().end..n.range().end, String::new()));
                }
                _ => edits.push((n.range(), String::new())),
            },
            Some("paragraph-ins") => {
                // La marque, et les enveloppes qu'elle laisse vides.
                let only = |x: Node| x.children().filter(|c| c.is_element()).count() == 1;
                let rpr = n.parent().filter(|r| is_w(*r, "rPr") && only(*r));
                let ppr = rpr.and_then(|r| r.parent()).filter(|q| is_w(*q, "pPr") && only(*q));
                edits.push((ppr.or(rpr).unwrap_or(n).range(), String::new()));
            }
            _ => return err("suivi inattendu dans une figure déplacée"),
        }
    }
    splice_within(src, p.range(), edits)
}

/// Le geste « figure déplacée » dont `id` fait partie : ses suivis, les
/// paragraphes de l'ancienne place et ceux de la nouvelle.
fn group_of(model: &crate::model::DocModel, id: u32) -> Option<(Vec<u32>, Vec<usize>, Vec<usize>)> {
    let lead = model.changes.iter().find(|c| c.id == id)?.group?;
    let ids: Vec<u32> = model.changes.iter().filter(|c| c.group == Some(lead)).map(|c| c.id).collect();
    let kind = |m: u32| model.changes.iter().find(|c| c.id == m).map(|c| c.kind.as_str());
    let of = |k: &str| -> Vec<usize> { model.paragraphs.iter().enumerate().filter(|(_, p)| p.mark_change.is_some_and(|m| ids.contains(&m) && kind(m) == Some(k))).map(|(i, _)| i).collect() };
    let (old, new) = (of("paragraph-del"), of("paragraph-ins"));
    (!old.is_empty() && !new.is_empty()).then_some((ids, old, new))
}

/// Accepte ou refuse d'un bloc la figure déplacée dont le suivi `id` fait
/// partie ; `None` si `id` n'est pas d'un tel geste. Refusée, la copie
/// neuve (avec ses signets et ses commentaires) reprend l'ancienne place.
pub(crate) fn settle(docx: &mut Docx, id: u32, decision: Decision) -> Result<Option<Vec<u32>>> {
    // Contrôle rapide avant de lire tout le modèle : le suivi est dans un
    // paragraphe à marque suivie, près d'un dessin.
    let Some(src) = docx.part(DOCUMENT)? else { return Ok(None) };
    {
        let doc = xml::parse(&src)?;
        let Some(node) = doc.descendants().find(|n| n.is_element() && id_of(*n) == Some(id) && change_kind(*n).is_some()) else { return Ok(None) };
        let Some(p) = node.ancestors().find(|a| is_w(*a, "p")) else { return Ok(None) };
        let marked = |q: &Node| is_w(*q, "p") && mark_rev(*q).is_some();
        let drawn = |q: Node| q.descendants().any(|n| is_w(n, "drawing") || is_w(n, "pict") || is_w(n, "object"));
        if !marked(&p) || !(drawn(p) || p.next_siblings().skip(1).filter(|n| n.is_element()).take_while(marked).any(drawn) || p.prev_siblings().skip(1).filter(|n| n.is_element()).take_while(marked).any(drawn)) {
            return Ok(None);
        }
    }
    let model = docx.model()?;
    let Some((ids, old, new)) = group_of(&model, id) else { return Ok(None) };
    if !settle_block(docx, &src, &ids, &old, &new, decision)? {
        // Retouché depuis (frappe dans la légende déplacée, signet resté à
        // l'ancienne place) : chaque suivi se décide comme d'habitude.
        for other in &ids {
            if let Err(e) = review::decide_one(docx, *other, decision)
                && !e.0.contains("introuvable") {
                    return Err(e);
                }
        }
    }
    Ok(Some(ids))
}

/// Décide le geste d'un bloc si rien d'autre n'y a été retouché.
fn settle_block(docx: &mut Docx, src: &str, ids: &[u32], old: &[usize], new: &[usize], decision: Decision) -> Result<bool> {
    let doc = xml::parse(src)?;
    xml::require_w_prefix(&doc)?;
    let paras = walk::paragraphs_in(&doc, &Scope::Body);
    let set: BTreeSet<u32> = ids.iter().copied().collect();
    let pick = |list: &[usize]| -> Option<Vec<Node>> { list.iter().map(|i| paras.get(*i).map(|p| p.node)).collect() };
    let (Some(old), Some(new)) = (pick(old), pick(new)) else { return Ok(false) };
    let pure = |p: &Node| revisions(*p).all(|n| id_of(n).is_some_and(|id| set.contains(&id)));
    let anchored = |p: &Node| p.descendants().any(|n| matches!(n.tag_name().name(), "bookmarkStart" | "bookmarkEnd" | "commentRangeStart" | "commentRangeEnd" | "commentReference") && n.tag_name().namespace() == Some(W));
    if !old.iter().chain(&new).all(pure) || old.iter().any(anchored) {
        return Ok(false);
    }
    let mut kept = String::new();
    for p in &new {
        kept.push_str(&settled(src, *p, &set)?);
    }
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    match decision {
        // L'ancienne place disparaît, la nouvelle perd ses marques.
        Decision::Accept => {
            edits.extend(old.iter().map(|p| (p.range(), String::new())));
            edits.push((new[0].range(), kept));
            edits.extend(new.iter().skip(1).map(|p| (p.range(), String::new())));
        }
        // La figure revient : la copie neuve reprend l'ancienne place.
        Decision::Reject => {
            edits.push((old[0].range(), kept));
            edits.extend(old.iter().skip(1).map(|p| (p.range(), String::new())));
            edits.extend(new.iter().map(|p| (p.range(), String::new())));
        }
    }
    let out = xml::splice(src, edits)?;
    drop(doc);
    docx.set_part(DOCUMENT, out);
    Ok(true)
}

/// Décide d'un bloc toutes les figures déplacées (de `author`, si
/// précisé) ; rend le nombre de suivis ainsi réglés. Celles qui ont été
/// retouchées depuis restent au traitement général.
pub(crate) fn settle_all(docx: &mut Docx, decision: Decision, author: Option<&str>) -> Result<usize> {
    let mut done = 0;
    let mut tried: BTreeSet<u32> = BTreeSet::new();
    for _ in 0..10_000 {
        let Some(src) = docx.part(DOCUMENT)? else { break };
        if !src.contains("<w:drawing") && !src.contains("<w:pict") {
            break;
        }
        let model = docx.model()?;
        let next = model.changes.iter().find(|c| c.group == Some(c.id) && !tried.contains(&c.id) && author.is_none_or(|a| c.author == a));
        let Some(lead) = next.map(|c| c.id) else { break };
        tried.insert(lead);
        if let Some((ids, old, new)) = group_of(&model, lead)
            && settle_block(docx, &src, &ids, &old, &new, decision)? {
                done += ids.len();
            }
    }
    Ok(done)
}

// ------------------------------------------- taille, texte de remplacement

/// Le dessin (`w:drawing`, `w:pict`) de la `index`-ième figure non barrée
/// du paragraphe, comptée comme `replace_image`.
fn nth_drawing<'a, 'i>(src: &str, doc: &'a roxmltree::Document<'i>, paragraph: &str, index: usize) -> Result<Node<'a, 'i>> {
    let t = edit::target(src, doc, paragraph)?;
    let figures: Vec<&walk::Media> = t.inline.pieces.iter().zip(&t.spans).filter(|(_, sp)| sp.is_some()).filter_map(|(p, _)| p.media.as_ref()).collect();
    let Some(m) = figures.get(index) else {
        return err(format!("pas de figure {} dans {paragraph}", index + 1));
    };
    doc.descendants().find(|n| n.is_element() && n.range() == m.at).ok_or_else(|| crate::DocxError("figure introuvable dans le document".into()))
}

/// Donne à la `index`-ième figure du paragraphe la largeur `width` (pixels
/// à 96 ppp), proportions gardées, sans dépasser la largeur du texte.
pub fn resize(docx: &mut Docx, paragraph: &str, index: usize, width: u32) -> Result<Value> {
    let (story, src) = docx.story_src(paragraph)?;
    let max = crate::objects::text_width(docx)?;
    let doc = xml::parse(&src)?;
    let node = nth_drawing(&src, &doc, paragraph, index)?;
    let num = |n: Node, a: &str| n.attribute(a).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
    let Some(ext) = node.descendants().find(|n| n.is_element() && n.tag_name().name() == "extent") else {
        return err("cette image vient d'un ancien Word (dessin VML) : changer sa taille dans Word");
    };
    let (cx, cy) = (num(ext, "cx"), num(ext, "cy"));
    if cx == 0 || cy == 0 {
        return err("taille de la figure illisible : la changer dans Word");
    }
    let floor = 24 * EMU_PX;
    let new_cx = (width as u64 * EMU_PX).clamp(floor, max.max(floor));
    let scale = |v: u64| ((v as u128 * new_cx as u128 / cx as u128) as u64).max(1);
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    let set = |n: Node, edits: &mut Vec<(Range<usize>, String)>| {
        edits.extend(attr_edit(&src, n, "cx", &scale(num(n, "cx")).to_string()));
        edits.extend(attr_edit(&src, n, "cy", &scale(num(n, "cy")).to_string()));
    };
    set(ext, &mut edits);
    // Taille de l'image dans son cadre (pic:spPr/a:xfrm/a:ext).
    for n in node.descendants().filter(|n| n.is_element() && n.tag_name().name() == "ext" && n.attribute("cx").is_some()) {
        if n.parent().is_some_and(|x| x.tag_name().name() == "xfrm" && x.parent().is_some_and(|s| s.tag_name().name() == "spPr")) {
            set(n, &mut edits);
        }
    }
    let out = xml::splice(&src, edits)?;
    drop(doc);
    docx.set_part(&story.part, out);
    Ok(json!({"tracked": false, "width": new_cx / EMU_PX, "height": scale(cy) / EMU_PX}))
}

/// Écrit le texte de remplacement de la `index`-ième figure du paragraphe.
pub fn set_alt(docx: &mut Docx, paragraph: &str, index: usize, alt: &str) -> Result<Value> {
    let (story, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    let node = nth_drawing(&src, &doc, paragraph, index)?;
    let Some(pr) = node.descendants().find(|n| n.is_element() && n.tag_name().name() == "docPr") else {
        return err("cette image vient d'un ancien Word (dessin VML) : écrire son texte de remplacement dans Word");
    };
    let Some(e) = attr_edit(&src, pr, "descr", &escape_attr(alt.trim())) else {
        return err("texte de remplacement illisible : le changer dans Word");
    };
    let out = xml::splice(&src, vec![e])?;
    drop(doc);
    docx.set_part(&story.part, out);
    Ok(json!({"tracked": false}))
}
