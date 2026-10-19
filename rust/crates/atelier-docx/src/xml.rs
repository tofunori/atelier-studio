//! Outils XML : épissures sur le texte d'origine, échappement, recherche.

use crate::{DocxError, Result, err};
use roxmltree::{Document, Node, ParsingOptions};
use std::ops::Range;

pub const W: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
pub const W14: &str = "http://schemas.microsoft.com/office/word/2010/wordml";
pub const W15: &str = "http://schemas.microsoft.com/office/word/2012/wordml";
pub const M: &str = "http://schemas.openxmlformats.org/officeDocument/2006/math";

pub fn parse(text: &str) -> Result<Document<'_>> {
    let opts = ParsingOptions { allow_dtd: false, ..ParsingOptions::default() };
    Document::parse_with_options(text, opts).map_err(|e| DocxError(format!("XML illisible : {e}")))
}

/// Élément `w:<name>` ?
pub fn is_w(node: Node, name: &str) -> bool {
    node.is_element() && node.tag_name().name() == name && node.tag_name().namespace() == Some(W)
}

pub fn w_attr<'a>(node: Node<'a, '_>, name: &str) -> Option<&'a str> {
    node.attribute((W, name))
}

pub fn w_child<'a, 'i>(node: Node<'a, 'i>, name: &str) -> Option<Node<'a, 'i>> {
    node.children().find(|c| is_w(*c, name))
}

pub fn id_of(node: Node) -> Option<u32> {
    w_attr(node, "id").and_then(|v| v.trim().parse().ok())
}

/// Position du contenu d'un élément (entre balises), ou `None` s'il est vide.
pub fn inner_range(node: Node) -> Option<Range<usize>> {
    let first = node.first_child()?;
    let last = node.last_child()?;
    Some(first.range().start..last.range().end)
}

/// Balise ouvrante telle qu'écrite (attributs compris), sans le `/>` d'un
/// élément vide.
pub fn start_tag<'a>(src: &'a str, node: Node) -> &'a str {
    let r = node.range();
    match node.first_child() {
        Some(c) => &src[r.start..c.range().start],
        None => {
            let t = &src[r.clone()];
            let end = t.strip_suffix("/>").map(|s| s.len()).unwrap_or(t.len());
            let t = &t[..end];
            // `<w:p ...></w:p>` sans enfant : couper avant la fermeture.
            match t.find('>') {
                Some(i) if i + 1 < t.len() => &t[..=i],
                _ => t,
            }
        }
    }
}

/// Balise ouvrante complète, refermée par `>` même si l'élément était vide.
pub fn open_tag(src: &str, node: Node) -> String {
    let t = start_tag(src, node);
    if t.ends_with('>') { t.to_string() } else { format!("{t}>") }
}

pub fn escape_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(c),
        }
    }
    out
}

pub fn escape_attr(s: &str) -> String {
    escape_text(s).replace('"', "&quot;")
}

/// Applique des remplacements disjoints sur le texte d'origine.
pub fn splice(src: &str, mut edits: Vec<(Range<usize>, String)>) -> Result<String> {
    edits.sort_by_key(|(r, _)| (r.start, r.end));
    for pair in edits.windows(2) {
        if pair[0].0.end > pair[1].0.start {
            return err("retouches qui se chevauchent dans le XML");
        }
    }
    let mut out = String::with_capacity(src.len() + 256);
    let mut at = 0;
    for (r, text) in edits {
        out.push_str(&src[at..r.start]);
        out.push_str(&text);
        at = r.end;
    }
    out.push_str(&src[at..]);
    Ok(out)
}

/// Le document utilise-t-il le préfixe `w` ? (Word, LibreOffice et Google
/// Docs : toujours.) Nos fragments écrits en dépendent.
pub fn require_w_prefix(doc: &Document) -> Result<()> {
    match doc.root_element().lookup_prefix(W) {
        Some("w") => Ok(()),
        _ => err("préfixe XML inhabituel pour WordprocessingML : retouche refusée par prudence"),
    }
}

/// Plus grand `w:id` numérique d'un texte XML (suivis, commentaires,
/// signets partagent en pratique cet espace chez Word).
pub fn max_w_id(text: &str) -> u32 {
    let mut max = 0;
    for (i, _) in text.match_indices("w:id=\"") {
        let rest = &text[i + 6..];
        let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = digits.parse::<u32>() {
            max = max.max(n);
        }
    }
    max
}

/// Nouvel identifiant de paragraphe `w14:paraId` (8 chiffres hexadécimaux,
/// inférieur à 0x80000000 comme l'exige Word).
pub fn new_para_id(seed: &str, salt: u32) -> String {
    use sha2::{Digest, Sha256};
    let h = Sha256::digest(format!("{seed}{salt}").as_bytes());
    let v = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) & 0x7FFF_FFFF;
    format!("{:08X}", v.max(1))
}
