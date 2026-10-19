//! Commentaires : ajouter, répondre, résoudre, supprimer.
//!
//! Le texte est dans word/comments.xml, l'ancrage dans document.xml
//! (`commentRangeStart`, `commentRangeEnd`, appel `commentReference`), le fil
//! de réponses et l'état « résolu » dans word/commentsExtended.xml (Word 2013+),
//! reliés par le `w14:paraId` du dernier paragraphe de chaque commentaire.

use crate::edit::{cut, find_in, next_ids, run_len, run_starts, run_xml, target};
use crate::xml::{self, W14, W15, escape_attr, escape_text, id_of, is_w};
use crate::{COMMENTS, COMMENTS_EXT, Docx, Result, Signature, err};
use std::collections::BTreeMap;
use std::ops::Range;

const CT_COMMENTS: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";
const REL_COMMENTS: &str = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const CT_COMMENTS_EXT: &str = "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml";
const REL_COMMENTS_EXT: &str = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended";
const NS_W: &str = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

fn reference_run(id: u32) -> String {
    format!("<w:commentRangeEnd w:id=\"{id}\"/><w:r><w:commentReference w:id=\"{id}\"/></w:r>")
}

/// Ajoute le commentaire au texte de comments.xml (créé au besoin) et rend
/// le paraId de son paragraphe.
fn append_comment(docx: &mut Docx, id: u32, text: &str, sig: &Signature) -> Result<String> {
    let existing = docx.part(COMMENTS)?;
    let para_id = xml::new_para_id(&format!("{id}{text}{}", sig.date), id);
    let paras: String = text
        .split('\n')
        .enumerate()
        .map(|(i, line)| {
            let last = i == text.split('\n').count() - 1;
            let pid = if last { format!(" w14:paraId=\"{para_id}\" w14:textId=\"77777777\"") } else { String::new() };
            let mark = if i == 0 { "<w:r><w:annotationRef/></w:r>" } else { "" };
            format!("<w:p{pid}>{mark}<w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>", escape_text(line))
        })
        .collect();
    let comment = format!(
        "<w:comment w:id=\"{id}\" w:author=\"{}\" w:date=\"{}\" w:initials=\"{}\">{paras}</w:comment>",
        escape_attr(&sig.author),
        escape_attr(&sig.date),
        escape_attr(&sig.initials)
    );
    match existing {
        Some(text) => {
            let text = ensure_root_ns(&text, "w14", W14)?;
            let close = text.rfind("</w:comments>").ok_or_else(|| crate::DocxError("comments.xml illisible".into()))?;
            docx.set_part(COMMENTS, format!("{}{comment}{}", &text[..close], &text[close..]));
        }
        None => {
            let body = format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w:comments xmlns:w=\"{NS_W}\" xmlns:w14=\"{W14}\">{comment}</w:comments>"
            );
            docx.create_part(COMMENTS, CT_COMMENTS, REL_COMMENTS, body)?;
        }
    }
    Ok(para_id)
}

/// Ajoute `xmlns:<prefix>` à l'élément racine s'il manque.
fn ensure_root_ns(text: &str, prefix: &str, uri: &str) -> Result<String> {
    let doc = xml::parse(text)?;
    if doc.root_element().lookup_prefix(uri) == Some(prefix) {
        return Ok(text.to_string());
    }
    let root = doc.root_element().range();
    let tag_end = text[root.start..].find('>').map(|i| root.start + i).ok_or_else(|| crate::DocxError("racine XML illisible".into()))?;
    let at = if text[..tag_end].ends_with('/') { tag_end - 1 } else { tag_end };
    Ok(format!("{} xmlns:{prefix}=\"{uri}\"{}", &text[..at], &text[at..]))
}

/// paraId du dernier paragraphe du commentaire `id` ; en pose un s'il manque.
fn comment_para_id(docx: &mut Docx, id: u32) -> Result<String> {
    let text = docx.part(COMMENTS)?.ok_or_else(|| crate::DocxError("aucun commentaire dans ce document".into()))?;
    let doc = xml::parse(&text)?;
    let Some(c) = doc.root_element().children().find(|n| is_w(*n, "comment") && id_of(*n) == Some(id)) else {
        return err(format!("commentaire {id} introuvable"));
    };
    let Some(last) = c.children().rfind(|n| is_w(*n, "p")) else { return err("commentaire sans paragraphe") };
    if let Some(pid) = last.attribute((W14, "paraId")) {
        return Ok(pid.to_string());
    }
    let pid = xml::new_para_id(&format!("comment{id}"), id);
    let at = last.range().start + "<w:p".len();
    drop(doc);
    let text = format!("{} w14:paraId=\"{pid}\"{}", &text[..at], &text[at..]);
    let text = ensure_root_ns(&text, "w14", W14)?;
    docx.set_part(COMMENTS, text);
    Ok(pid)
}

/// Pose ou met à jour l'entrée commentsExtended du paraId donné.
fn set_ext(docx: &mut Docx, para_id: &str, parent: Option<&str>, done: Option<bool>) -> Result<()> {
    let text = match docx.part(COMMENTS_EXT)? {
        Some(t) => t,
        None => {
            let body = format!("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n<w15:commentsEx xmlns:w15=\"{W15}\"></w15:commentsEx>");
            docx.create_part(COMMENTS_EXT, CT_COMMENTS_EXT, REL_COMMENTS_EXT, body.clone())?;
            body
        }
    };
    let doc = xml::parse(&text)?;
    let prefix = doc.root_element().lookup_prefix(W15).unwrap_or("w15").to_string();
    let existing = doc.descendants().find(|n| n.tag_name().name() == "commentEx" && n.attribute((W15, "paraId")) == Some(para_id));
    let new_text = match existing {
        Some(node) => {
            let range = node.range();
            let mut tag = text[range.clone()].to_string();
            if let Some(d) = done {
                let v = if d { "1" } else { "0" };
                match node.attribute((W15, "done")) {
                    Some(_) => {
                        let attr = node.attributes().find(|a| a.namespace() == Some(W15) && a.name() == "done").unwrap();
                        let vr = attr.range_value();
                        let (vs, ve) = (vr.start - range.start, vr.end - range.start);
                        tag.replace_range(vs..ve, v);
                    }
                    None => {
                        let at = tag.rfind("/>").unwrap_or(tag.len());
                        tag.insert_str(at, &format!(" {prefix}:done=\"{v}\""));
                    }
                }
            }
            xml::splice(&text, vec![(range, tag)])?
        }
        None => {
            let parent_attr = parent.map(|p| format!(" {prefix}:paraIdParent=\"{p}\"")).unwrap_or_default();
            let done_v = if done == Some(true) { "1" } else { "0" };
            let entry = format!("<{prefix}:commentEx {prefix}:paraId=\"{para_id}\"{parent_attr} {prefix}:done=\"{done_v}\"/>");
            let root = doc.root_element().range();
            let raw = &text[root.clone()];
            if raw.ends_with("/>") {
                let at = root.end - 2;
                let name = raw[1..].split(|c: char| c.is_whitespace() || c == '/').next().unwrap_or("w15:commentsEx");
                format!("{}>{entry}</{name}>{}", &text[..at], &text[root.end..])
            } else {
                let close = root.start + raw.rfind("</").unwrap_or(raw.len());
                format!("{}{entry}{}", &text[..close], &text[close..])
            }
        }
    };
    docx.set_part(COMMENTS_EXT, new_text);
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct CommentResult {
    pub id: u32,
}

/// Commente le passage `find` du paragraphe.
pub fn add(docx: &mut Docx, paragraph: &str, find: &str, occurrence: Option<usize>, text: &str, sig: &Signature) -> Result<CommentResult> {
    let (_, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    let t = target(&src, &doc, paragraph)?;
    let (s, e) = find_in(&t.text, find, occurrence, paragraph)?;
    drop(doc);
    add_range(docx, paragraph, s, e, text, sig)
}

/// Commente les caractères [start, end) du texte courant (sélection du panneau).
pub fn add_range(docx: &mut Docx, paragraph: &str, s: usize, e: usize, text: &str, sig: &Signature) -> Result<CommentResult> {
    let (story, src) = docx.story_src(paragraph)?;
    let doc = xml::parse(&src)?;
    xml::require_w_prefix(&doc)?;
    let t = target(&src, &doc, paragraph)?;
    if s > e || e > t.text.chars().count() {
        return err("passage au-delà de la fin du paragraphe");
    }
    let id = next_ids(docx, 1)?[0];
    let starts = run_starts(&t);

    // Où poser chaque borne : dans un run retouchable (découpé au besoin),
    // sinon au bord de l'élément de premier niveau qui contient le morceau.
    enum Loc {
        At(usize),
        Split(usize, usize),
    }
    let locate = |pos: usize, is_start: bool| -> Loc {
        for (piece, span) in t.inline.pieces.iter().zip(&t.spans) {
            let Some((ps, pe)) = *span else { continue };
            let inside = if is_start { ps <= pos && pos < pe } else { ps < pos && pos <= pe };
            if !inside {
                continue;
            }
            return match piece.run {
                Some((ri, _)) => {
                    let rel = pos - starts[ri].unwrap_or(0);
                    if rel == 0 {
                        Loc::At(t.inline.runs[ri].range.start)
                    } else if rel >= run_len(&t, ri) {
                        Loc::At(t.inline.runs[ri].range.end)
                    } else {
                        Loc::Split(ri, rel)
                    }
                }
                None => Loc::At(if is_start { piece.top.start } else { piece.top.end }),
            };
        }
        Loc::At(t.p_inner_end.unwrap_or(t.p_range.end))
    };
    let start_tag = format!("<w:commentRangeStart w:id=\"{id}\"/>");
    let end_tag = reference_run(id);
    let mut edits: Vec<(Range<usize>, String)> = Vec::new();
    let mut splits: BTreeMap<usize, Vec<(usize, String)>> = BTreeMap::new();
    for (loc, tag) in [(locate(s, true), start_tag), (locate(e, false), end_tag)] {
        match loc {
            Loc::At(at) => edits.push((at..at, tag)),
            Loc::Split(ri, rel) => splits.entry(ri).or_default().push((rel, tag)),
        }
    }
    for (ri, cuts) in splits {
        let run = &t.inline.runs[ri];
        let mut out = String::new();
        let mut from = 0;
        for (rel, tag) in &cuts {
            let (_, mid, _) = cut(&run.toks, from, *rel);
            if !mid.is_empty() {
                out.push_str(&run_xml(&run.start_tag, &run.rpr, &mid, false));
            }
            out.push_str(tag);
            from = *rel;
        }
        let (_, rest, _) = cut(&run.toks, from, run_len(&t, ri));
        if !rest.is_empty() {
            out.push_str(&run_xml(&run.start_tag, &run.rpr, &rest, false));
        }
        edits.push((run.range.clone(), out));
    }
    // Deux insertions au même point : la borne de début avant la fin.
    edits.sort_by_key(|(r, txt)| (r.start, r.end, !txt.starts_with("<w:commentRangeStart")));
    let mut merged: Vec<(Range<usize>, String)> = Vec::new();
    for (r, txt) in edits {
        match merged.last_mut() {
            Some((lr, lt)) if lr.start == r.start && lr.end == lr.start && r.end == r.start => lt.push_str(&txt),
            _ => merged.push((r, txt)),
        }
    }
    drop(doc);
    let out = xml::splice(&src, merged)?;
    docx.set_part(&story.part, out);
    let pid = append_comment(docx, id, text, sig)?;
    set_ext(docx, &pid, None, Some(false))?;
    Ok(CommentResult { id })
}

/// Répond au commentaire `parent` (fil de discussion de Word).
pub fn reply(docx: &mut Docx, parent: u32, text: &str, sig: &Signature) -> Result<CommentResult> {
    let parent_pid = comment_para_id(docx, parent)?;
    let id = next_ids(docx, 1)?[0];
    // L'ancrage du commentaire peut être dans le corps, une note, un en-tête.
    let mut anchored = false;
    for part in docx.story_parts() {
        let Some(src) = docx.part(&part)? else { continue };
        let doc = xml::parse(&src)?;
        let find = |name: &str| doc.descendants().find(|n| is_w(*n, name) && id_of(*n) == Some(parent));
        let after_ref = doc
            .descendants()
            .find(|n| is_w(*n, "commentReference") && id_of(*n) == Some(parent))
            .and_then(|r| r.parent().filter(|p| is_w(*p, "r")))
            .map(|r| r.range().end)
            .or_else(|| find("commentRangeEnd").map(|n| n.range().end));
        let Some(at) = after_ref else { continue };
        xml::require_w_prefix(&doc)?;
        let mut edits = Vec::new();
        if let Some(start) = find("commentRangeStart") {
            let s = start.range().end;
            edits.push((s..s, format!("<w:commentRangeStart w:id=\"{id}\"/>")));
        }
        edits.push((at..at, reference_run(id)));
        drop(doc);
        let out = xml::splice(&src, edits)?;
        docx.set_part(&part, out);
        anchored = true;
        break;
    }
    if !anchored {
        return err(format!("ancrage du commentaire {parent} introuvable"));
    }
    let pid = append_comment(docx, id, text, sig)?;
    set_ext(docx, &parent_pid, None, None)?;
    set_ext(docx, &pid, Some(&parent_pid), Some(false))?;
    Ok(CommentResult { id })
}

/// Marque le commentaire (et son fil) comme résolu, ou le rouvre.
pub fn resolve(docx: &mut Docx, id: u32, done: bool) -> Result<()> {
    let pid = comment_para_id(docx, id)?;
    set_ext(docx, &pid, None, Some(done))
}

/// Supprime un commentaire, ses réponses et leurs ancrages.
pub fn delete(docx: &mut Docx, id: u32) -> Result<()> {
    let model = docx.model()?;
    let mut ids: Vec<u32> = vec![id];
    let mut i = 0;
    while i < ids.len() {
        let p = ids[i];
        ids.extend(model.comments.iter().filter(|c| c.parent == Some(p)).map(|c| c.id));
        i += 1;
    }
    if !model.comments.iter().any(|c| c.id == id) {
        return err(format!("commentaire {id} introuvable"));
    }
    for part in docx.story_parts() {
        let Some(src) = docx.part(&part)? else { continue };
        let doc = xml::parse(&src)?;
        let mut edits = Vec::new();
        for n in doc.descendants().filter(|n| n.is_element() && id_of(*n).is_some_and(|i| ids.contains(&i))) {
            if is_w(n, "commentRangeStart") || is_w(n, "commentRangeEnd") {
                edits.push((n.range(), String::new()));
            } else if is_w(n, "commentReference") {
                let run = n.parent().filter(|p| is_w(*p, "r"));
                let alone = run.is_some_and(|r| r.children().filter(|c| c.is_element() && !is_w(*c, "rPr")).count() == 1);
                edits.push((if alone { run.unwrap().range() } else { n.range() }, String::new()));
            }
        }
        if edits.is_empty() {
            continue;
        }
        drop(doc);
        let out = xml::splice(&src, edits)?;
        docx.set_part(&part, out);
    }

    let ctext = docx.part(COMMENTS)?.unwrap_or_default();
    let cdoc = xml::parse(&ctext)?;
    let mut pids = Vec::new();
    let mut edits = Vec::new();
    for c in cdoc.root_element().children().filter(|n| is_w(*n, "comment") && id_of(*n).is_some_and(|i| ids.contains(&i))) {
        if let Some(pid) = c.children().rfind(|n| is_w(*n, "p")).and_then(|p| p.attribute((W14, "paraId"))) {
            pids.push(pid.to_string());
        }
        edits.push((c.range(), String::new()));
    }
    drop(cdoc);
    let out = xml::splice(&ctext, edits)?;
    docx.set_part(COMMENTS, out);
    if let Some(ext) = docx.part(COMMENTS_EXT)? {
        let edoc = xml::parse(&ext)?;
        let edits: Vec<_> = edoc
            .descendants()
            .filter(|n| n.tag_name().name() == "commentEx" && n.attribute((W15, "paraId")).is_some_and(|p| pids.iter().any(|x| x == p)))
            .map(|n| (n.range(), String::new()))
            .collect();
        drop(edoc);
        let out = xml::splice(&ext, edits)?;
        docx.set_part(COMMENTS_EXT, out);
    }
    Ok(())
}
