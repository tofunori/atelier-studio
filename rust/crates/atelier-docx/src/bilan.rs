//! Bilan des commentaires d'un relecteur (Thierry, 2026-11-16 : « après
//! toutes mes corrections, Claude regarde si on a avancé »).
//!
//! La version reçue du relecteur reste gardée par l'historique
//! ([`crate::history`]) même après « Accepter » ou un commentaire effacé :
//! elle est comparée au document d'aujourd'hui, commentaire par
//! commentaire. Le moteur ne juge pas : il rassemble, pour chaque
//! commentaire, ce que l'agent doit voir pour dire « traité », « partiel »
//! ou « pas traité » (passage d'alors et d'aujourd'hui, état du fil,
//! réponses, sort des suivis du relecteur dans ce paragraphe).

use crate::feedback::align;
use crate::model::{Change, Comment, DocModel, Para};
use crate::{Docx, DocxError, Result, history};
use std::collections::HashMap;
use std::fmt::Write as _;
use std::path::Path;

/// Commentaires rendus par appel (le reste se demande avec `start`).
pub const PAGE: usize = 40;
/// Longueur maximale d'un passage montré.
const SHOWN_MAX: usize = 700;

/// Auteur d'un relecteur retenu : `author` donné (nom ou initiales,
/// sans casse), sinon tout auteur qui n'est ni l'utilisateur ni un agent.
pub fn reviewer_filter<'a>(author: Option<&'a str>, user: &'a str) -> impl Fn(&str) -> bool + 'a {
    let wanted = author.map(|a| a.trim().to_lowercase()).filter(|a| !a.is_empty());
    let user = user.trim().to_lowercase();
    move |name: &str| {
        let n = name.trim().to_lowercase();
        match &wanted {
            Some(w) => n.contains(w.as_str()) || initials(&n) == *w,
            None => !n.is_empty() && n != user && !is_agent(&n),
        }
    }
}

fn initials(name: &str) -> String {
    name.split_whitespace().filter_map(|w| w.chars().next()).collect()
}

fn is_agent(name: &str) -> bool {
    ["claude", "codex", "kimi", "grok", "opencode", "agent"].iter().any(|a| name == *a || name.starts_with(&format!("{a} ")))
}

/// La plus ancienne version reçue gardée par l'historique qui porte des
/// commentaires du relecteur : (date d'arrivée, modèle).
pub fn received_with_comments(path: &Path, keep: &dyn Fn(&str) -> bool) -> Result<(String, DocModel)> {
    let j = history::load(path);
    for b in &j.bases {
        let Ok(bytes) = history::base_bytes(path, &b.revision) else { continue };
        let Ok(mut d) = Docx::from_bytes(bytes) else { continue };
        let Ok(model) = d.model() else { continue };
        if model.comments.iter().any(|c| c.parent.is_none() && keep(&c.author)) {
            return Ok((b.at.clone(), model));
        }
    }
    Err(DocxError(
        "aucune version reçue avec ces commentaires dans l'historique d'Atelier : donne `since`, une copie du fichier tel qu'il est arrivé, dans le projet".into(),
    ))
}

/// Ce que devient un commentaire du relecteur.
#[derive(Debug, Clone)]
pub struct Item {
    pub then: Comment,
    /// Le commentaire encore dans le document (même auteur, même texte).
    pub now: Option<Comment>,
    /// Réponses d'aujourd'hui (ou d'alors, s'il a été effacé).
    pub replies: Vec<(String, String)>,
    /// Paragraphe d'alors (`p12`) et d'aujourd'hui, s'il se retrouve.
    pub then_para: Option<String>,
    pub now_para: Option<String>,
    /// Texte d'alors, suivis du relecteur refusés (ce qu'il a lu).
    pub before: String,
    /// Texte d'alors, suivis du relecteur acceptés (ce qu'il proposait).
    pub proposed: String,
    /// Texte d'aujourd'hui, ses suivis encore en attente refusés (les
    /// autres compris, ceux de l'utilisateur aussi).
    pub after: Option<String>,
    pub marks: Tally,
}

/// Sort des suivis du relecteur.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Tally {
    pub accepted: usize,
    pub rejected: usize,
    pub pending: usize,
    /// Décidés, sans pouvoir dire lequel (texte trop court, paragraphe perdu).
    pub decided: usize,
}

impl Tally {
    fn add(&mut self, o: &Tally) {
        self.accepted += o.accepted;
        self.rejected += o.rejected;
        self.pending += o.pending;
        self.decided += o.decided;
    }
    fn total(&self) -> usize {
        self.accepted + self.rejected + self.pending + self.decided
    }
}

#[derive(Debug, Clone)]
pub struct Report {
    pub reviewers: Vec<String>,
    pub items: Vec<Item>,
    /// Tous ses suivis, commentés ou non.
    pub marks: Tally,
}

fn norm(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn words(s: &str) -> Vec<String> {
    s.split_whitespace().map(|w| w.to_lowercase()).collect()
}

/// (ce que le relecteur a lu, ce qu'il proposait) pour un paragraphe d'alors.
fn views(p: &Para, changes: &HashMap<u32, &Change>, keep: &dyn Fn(&str) -> bool) -> (String, String) {
    let (mut before, mut proposed) = (String::new(), String::new());
    for s in &p.segments {
        let text = if s.text.is_empty() { s.latex.as_ref().map(|l| format!("{{{l}}}")).unwrap_or_default() } else { s.text.clone() };
        let his = s.change.and_then(|id| changes.get(&id)).is_some_and(|c| keep(&c.author));
        match s.rev {
            Some("ins") | Some("moveTo") => {
                proposed.push_str(&text);
                if !his {
                    before.push_str(&text);
                }
            }
            Some("del") | Some("moveFrom") => {
                if his {
                    before.push_str(&text);
                }
            }
            _ => {
                before.push_str(&text);
                proposed.push_str(&text);
            }
        }
    }
    (norm(&before), norm(&proposed))
}

/// Le paragraphe d'alors avec le suivi `target` accepté ou refusé, les
/// autres suivis du relecteur tous acceptés (`others`) ou tous refusés ;
/// rend aussi où commence et finit la portion du suivi.
fn variant(p: &Para, target: u32, accept: bool, others: bool, changes: &HashMap<u32, &Change>, keep: &dyn Fn(&str) -> bool) -> (String, usize, usize) {
    let (mut out, mut start, mut end) = (String::new(), None, 0);
    for s in &p.segments {
        let text = if s.text.is_empty() { s.latex.as_ref().map(|l| format!("{{{l}}}")).unwrap_or_default() } else { s.text.clone() };
        let his = s.change.and_then(|id| changes.get(&id)).is_some_and(|c| keep(&c.author));
        let mine = s.change == Some(target);
        let take = |accepting: bool| match s.rev {
            Some("ins") | Some("moveTo") => accepting,
            Some("del") | Some("moveFrom") => !accepting,
            _ => true,
        };
        let keep_it = if mine { take(accept) } else if his { take(others) } else { take(true) };
        if mine && start.is_none() {
            start = Some(out.len());
        }
        if keep_it {
            out.push_str(&text);
        }
        if mine {
            end = out.len();
        }
    }
    let start = start.unwrap_or(out.len());
    (out, start, end.max(start))
}

/// Le suivi `target` a-t-il été accepté (Some(true)) ou refusé : le
/// passage d'aujourd'hui contient-il le texte autour, suivi accepté ou
/// refusé ? None quand rien ne tranche.
fn decided(p: &Para, target: u32, changes: &HashMap<u32, &Change>, keep: &dyn Fn(&str) -> bool, now: &str) -> Option<bool> {
    const AROUND: usize = 24;
    let window = |s: &str, a: usize, b: usize| -> String {
        let lo = s[..a].char_indices().rev().nth(AROUND - 1).map(|(i, _)| i).unwrap_or(0);
        let hi = s[b..].char_indices().nth(AROUND).map(|(i, _)| b + i).unwrap_or(s.len());
        norm(&s[lo..hi]).to_lowercase()
    };
    let mut yes = false;
    let mut no = false;
    for others in [true, false] {
        let (a, a0, a1) = variant(p, target, true, others, changes, keep);
        let (r, r0, r1) = variant(p, target, false, others, changes, keep);
        let (wa, wr) = (window(&a, a0, a1), window(&r, r0, r1));
        if wa == wr {
            continue;
        }
        yes |= !wa.is_empty() && now.contains(&wa);
        no |= !wr.is_empty() && now.contains(&wr);
    }
    match (yes, no) {
        (true, false) => Some(true),
        (false, true) => Some(false),
        _ => None,
    }
}

/// Paragraphe d'aujourd'hui de chaque paragraphe d'alors, par alignement
/// des mots du document entier (le plus de mots en commun gagne).
fn map_paragraphs(then: &[Para], now: &[Para]) -> Vec<Option<usize>> {
    let mut a = Vec::new();
    let mut a_of = Vec::new();
    for (i, p) in then.iter().enumerate() {
        for w in words(&p.text) {
            a.push(w);
            a_of.push(i);
        }
    }
    let mut b = Vec::new();
    let mut b_of = Vec::new();
    for (j, p) in now.iter().enumerate() {
        for w in words(&p.text) {
            b.push(w);
            b_of.push(j);
        }
    }
    let ar: Vec<&str> = a.iter().map(String::as_str).collect();
    let br: Vec<&str> = b.iter().map(String::as_str).collect();
    let pairs = align(&ar, &br);
    let mut votes: Vec<HashMap<usize, usize>> = vec![HashMap::new(); then.len()];
    let mut size = vec![0usize; then.len()];
    for (k, m) in pairs.iter().enumerate() {
        size[a_of[k]] += 1;
        if let Some(m) = m {
            *votes[a_of[k]].entry(b_of[*m]).or_default() += 1;
        }
    }
    votes
        .iter()
        .zip(&size)
        .map(|(v, &n)| {
            let (&j, &best) = v.iter().max_by_key(|(j, c)| (**c, std::cmp::Reverse(**j)))?;
            (best * 5 >= n * 2 || best >= 8).then_some(j)
        })
        .collect()
}

fn para_index(id: &str) -> Option<usize> {
    id.strip_prefix('p')?.parse().ok()
}

/// Le paragraphe `id` (corps, note, en-tête) d'un modèle.
fn find_para<'m>(m: &'m DocModel, id: &str) -> Option<&'m Para> {
    if let Some(i) = para_index(id) {
        return m.paragraphs.get(i);
    }
    m.notes.iter().flat_map(|n| &n.paragraphs).chain(m.headers.iter().flat_map(|h| &h.paragraphs)).find(|p| p.id == id)
}

/// Compare la version d'alors à celle d'aujourd'hui pour les commentaires
/// des auteurs retenus par `keep`.
pub fn compare(then: &DocModel, now: &DocModel, keep: &dyn Fn(&str) -> bool) -> Report {
    let changes: HashMap<u32, &Change> = then.changes.iter().map(|c| (c.id, c)).collect();
    let now_changes: HashMap<u32, &Change> = now.changes.iter().map(|c| (c.id, c)).collect();
    let map = map_paragraphs(&then.paragraphs, &now.paragraphs);
    let now_id = |then_id: &str| -> Option<String> {
        match para_index(then_id) {
            Some(i) => map.get(i).copied().flatten().map(|j| format!("p{j}")),
            None => find_para(now, then_id).map(|p| p.id.clone()),
        }
    };
    // Sort de chaque suivi du relecteur, rangé par paragraphe d'alors.
    let mut by_para: HashMap<String, Tally> = HashMap::new();
    let mut marks = Tally::default();
    for c in then.changes.iter().filter(|c| keep(&c.author)) {
        let mut t = Tally::default();
        let still = now.changes.iter().any(|n| n.author == c.author && n.kind == c.kind && n.date == c.date && norm(&n.text) == norm(&c.text));
        let here = c.paragraph.as_deref().and_then(now_id).and_then(|id| find_para(now, &id).map(|p| norm(&p.text).to_lowercase()));
        let then_p = c.paragraph.as_deref().and_then(|id| find_para(then, id));
        if still {
            t.pending = 1;
        } else {
            match (here, then_p, matches!(c.kind.as_str(), "ins" | "moveTo" | "del" | "moveFrom")) {
                (Some(here), Some(p), true) => match decided(p, c.id, &changes, keep, &here) {
                    Some(true) => t.accepted = 1,
                    Some(false) => t.rejected = 1,
                    None => t.decided = 1,
                },
                _ => t.decided = 1,
            }
        }
        marks.add(&t);
        if let Some(p) = &c.paragraph {
            by_para.entry(p.clone()).or_default().add(&t);
        }
    }
    let mut reviewers: Vec<String> = Vec::new();
    let mut items = Vec::new();
    for c in then.comments.iter().filter(|c| c.parent.is_none() && keep(&c.author)) {
        if !reviewers.contains(&c.author) {
            reviewers.push(c.author.clone());
        }
        let same = |n: &&Comment| n.parent.is_none() && n.author == c.author && norm(&n.text) == norm(&c.text);
        let now_c = now.comments.iter().find(|n| same(n) && n.date == c.date).or_else(|| now.comments.iter().find(same)).cloned();
        let replies_of = |m: &DocModel, id: u32| -> Vec<(String, String)> {
            m.comments.iter().filter(|r| r.parent == Some(id)).map(|r| (r.author.clone(), r.text.clone())).collect()
        };
        let replies = match &now_c {
            Some(n) => replies_of(now, n.id),
            None => replies_of(then, c.id),
        };
        let then_p = c.paragraph.as_deref().and_then(|id| find_para(then, id));
        let (before, proposed) = then_p.map(|p| views(p, &changes, keep)).unwrap_or_default();
        let now_para = now_c.as_ref().and_then(|n| n.paragraph.clone()).or_else(|| c.paragraph.as_deref().and_then(now_id));
        // Ses suivis encore en attente comptés à part : le passage
        // d'aujourd'hui se lit comme lui l'a lu, sans eux.
        let after = now_para.as_deref().and_then(|id| find_para(now, id)).map(|p| views(p, &now_changes, keep).0);
        let marks = c.paragraph.as_ref().and_then(|p| by_para.get(p)).cloned().unwrap_or_default();
        items.push(Item { then: c.clone(), now: now_c, replies, then_para: c.paragraph.clone(), now_para, before, proposed, after, marks });
    }
    Report { reviewers, items, marks }
}

/// Bilan de `path` depuis la version reçue la plus ancienne qui porte ces
/// commentaires, ou depuis `since` (une copie du fichier reçu).
pub fn report(path: &Path, since: Option<&Path>, keep: &dyn Fn(&str) -> bool) -> Result<(String, Report)> {
    let (label, then) = match since {
        Some(s) => {
            let mut d = Docx::open(s)?;
            (format!("le fichier {}", s.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()), d.model()?)
        }
        None => {
            let (at, m) = received_with_comments(path, keep)?;
            (format!("la version reçue le {}", at.get(..10).unwrap_or(&at)), m)
        }
    };
    let now = crate::open_settled(path)?.model()?;
    let r = compare(&then, &now, keep);
    if r.items.is_empty() {
        return Err(DocxError(format!("aucun commentaire de cet auteur dans {label}")));
    }
    Ok((label, r))
}

fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

/// Différence mot à mot, les longues portions inchangées raccourcies :
/// `…mots [-retirés-] [+ajoutés+] mots…`.
pub fn word_diff(before: &str, after: &str) -> String {
    let a: Vec<&str> = before.split_whitespace().collect();
    let b: Vec<&str> = after.split_whitespace().collect();
    let pairs = align(&a, &b);
    let add = |k: char, w: &str, parts: &mut Vec<(char, Vec<String>)>| match parts.last_mut() {
        Some((last, ws)) if *last == k => ws.push(w.to_string()),
        _ => parts.push((k, vec![w.to_string()])),
    };
    let mut out_parts: Vec<(char, Vec<String>)> = Vec::new();
    let mut j = 0;
    for (i, m) in pairs.iter().enumerate() {
        match m {
            Some(m) if *m >= j => {
                while j < *m {
                    add('+', b[j], &mut out_parts);
                    j += 1;
                }
                add('=', a[i], &mut out_parts);
                j = m + 1;
            }
            _ => add('-', a[i], &mut out_parts),
        }
    }
    while j < b.len() {
        add('+', b[j], &mut out_parts);
        j += 1;
    }
    let last = out_parts.len().saturating_sub(1);
    let mut out = String::new();
    for (k, (kind, ws)) in out_parts.iter().enumerate() {
        if !out.is_empty() {
            out.push(' ');
        }
        match kind {
            '+' => {
                let _ = write!(out, "[+{}+]", ws.join(" "));
            }
            '-' => {
                let _ = write!(out, "[-{}-]", ws.join(" "));
            }
            _ => {
                const KEEP: usize = 6;
                let (head, tail) = (k > 0, k < last);
                if ws.len() <= KEEP * 2 + 1 || (head && tail && ws.len() <= KEEP * 3) {
                    out.push_str(&ws.join(" "));
                } else if head && tail {
                    let _ = write!(out, "{} … {}", ws[..KEEP].join(" "), ws[ws.len() - KEEP..].join(" "));
                } else if head {
                    let _ = write!(out, "{} …", ws[..KEEP].join(" "));
                } else {
                    let _ = write!(out, "… {}", ws[ws.len() - KEEP..].join(" "));
                }
            }
        }
    }
    out
}

fn tally_text(t: &Tally) -> String {
    let mut parts = Vec::new();
    let mut put = |n: usize, one: &str, many: &str| {
        if n > 0 {
            parts.push(format!("{n} {}", if n == 1 { one } else { many }));
        }
    };
    put(t.accepted, "accepté", "acceptés");
    put(t.rejected, "refusé", "refusés");
    put(t.pending, "en attente", "en attente");
    put(t.decided, "décidé", "décidés");
    parts.join(", ")
}

fn num(id: &Option<String>) -> String {
    match id {
        Some(p) => p.clone(),
        None => "introuvable".into(),
    }
}

/// Texte rendu à l'agent : les totaux, puis `PAGE` commentaires à partir
/// du `start`-ième (1 = le premier).
pub fn render(r: &Report, file: &str, label: &str, start: usize) -> String {
    let n = r.items.len();
    let gone = r.items.iter().filter(|i| i.now.is_none()).count();
    let done = r.items.iter().filter(|i| i.now.as_ref().is_some_and(|c| c.done)).count();
    let untouched = r.items.iter().filter(|i| i.after.as_deref() == Some(i.before.as_str())).count();
    let mut out = String::new();
    let _ = writeln!(out, "Bilan des commentaires de {} : {file}, depuis {label} (copie gardée par Atelier, même après Accepter).", r.reviewers.join(", "));
    let _ = writeln!(
        out,
        "{n} commentaires. Encore dans le document : {} (résolus : {done}, ouverts : {}). Effacés : {gone}. Passage resté identique : {untouched}.",
        n - gone,
        n - gone - done
    );
    if r.marks.total() > 0 {
        let _ = writeln!(out, "Ses suivis de modifications : {} ({}).", r.marks.total(), tally_text(&r.marks));
    }
    let from = start.max(1) - 1;
    let to = (from + PAGE).min(n);
    for it in r.items.iter().skip(from).take(PAGE) {
        let c = &it.then;
        let state = match &it.now {
            None => "effacé du document".to_string(),
            Some(n) if n.done => "résolu".into(),
            Some(_) => "ouvert".into(),
        };
        let name = match &it.now {
            Some(n) if n.id == c.id => format!("c{}", n.id),
            Some(n) => format!("c{} (c{} dans la version reçue)", n.id, c.id),
            None => format!("c{} de la version reçue", c.id),
        };
        let _ = writeln!(
            out,
            "\n{name} · {} → aujourd'hui {} · {}, {} · {state}{}",
            num(&it.then_para),
            num(&it.now_para),
            c.author,
            c.date.get(..10).unwrap_or(""),
            if it.replies.is_empty() { ", sans réponse" } else { "" }
        );
        let _ = writeln!(out, "  Commentaire : {}", clip(&norm(&c.text), SHOWN_MAX));
        if !c.quote.trim().is_empty() {
            let _ = writeln!(out, "  Sur : « {} »", clip(&norm(&c.quote), 240));
        }
        for (who, text) in &it.replies {
            let _ = writeln!(out, "  Réponse de {who} : {}", clip(&norm(text), 300));
        }
        match &it.after {
            None => {
                let _ = writeln!(out, "  Passage d'alors : {} (introuvable aujourd'hui : réécrit ou supprimé)", clip(&it.before, SHOWN_MAX));
            }
            Some(after) if *after == it.before => {
                let _ = writeln!(out, "  Passage : identique à la version reçue.");
            }
            Some(after) => {
                if it.proposed != it.before && *after == it.proposed {
                    let _ = writeln!(out, "  Passage : devenu exactement ce que proposaient ses suivis.");
                }
                let _ = writeln!(out, "  Passage, de la version reçue à aujourd'hui : {}", clip(&word_diff(&it.before, after), SHOWN_MAX * 2));
            }
        }
        if it.marks.total() > 0 {
            let _ = writeln!(out, "  Ses suivis dans ce paragraphe : {}", tally_text(&it.marks));
        }
    }
    if to < n {
        let _ = writeln!(out, "\n… commentaires {}-{n} : relire avec start={}.", to + 1, to + 1);
    }
    out
}
