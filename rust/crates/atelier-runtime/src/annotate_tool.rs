//! Outil `atelier_annotate` : l'agent du chat pose lui-même des notes, comme
//! un relecteur dans les commentaires d'un document partagé.
//!
//! - Dans un fichier texte ouvert dans l'éditeur LaTeX (.tex surtout) : une
//!   note accrochée au passage cité, éventuellement avec une proposition de
//!   réécriture. Entrée `tex-comments:<chemin absolu>` du store du projet,
//!   celle que l'éditeur lit et écrit.
//! - Dans un PDF (thèse compilée, PDF du projet, article Zotero) : le passage
//!   cité est surligné ou souligné (`atelier_pdf::passage`), la note va dans
//!   `memo`. Entrée `<chemin relatif au projet>` du store du projet, ou
//!   `zotero/<clé>/<fichier>` du store partagé.
//!
//! L'agent ne modifie jamais le fichier : seul l'utilisateur accepte une
//! proposition. Il ne touche qu'à ses propres notes (`by: "agent"`), jamais à
//! celles de l'utilisateur. Une réponse s'ajoute au fil de la note
//! (`thread`) ; le serveur galerie fusionne les fils par id de message, pour
//! qu'une sauvegarde de l'éditeur n'efface pas une réponse arrivée entre-temps.

use atelier_store::pdf_annots;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::state::AppState;

/// Valeur de `by` des notes de l'agent du chat (Claude Desktop écrit `claude`).
pub const AGENT_BY: &str = "agent";
const COMMENT_MAX: usize = 2_000;
const TEXT_MAX: usize = 20_000;
const NOTES_MAX: usize = 30;
const THREAD_MAX: usize = 100;
const HL_COLORS: [(&str, &str); 6] = [
    ("jaune", "rgba(255,213,74,.40)"),
    ("vert", "rgba(120,220,140,.40)"),
    ("bleu", "rgba(120,170,255,.40)"),
    ("rose", "rgba(255,140,160,.40)"),
    ("orange", "rgba(255,160,80,.40)"),
    ("violet", "rgba(185,150,255,.40)"),
];

fn str_arg<'a>(req: &'a Value, key: &str) -> Option<&'a str> {
    req.get(key).and_then(Value::as_str)
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn by_agent(a: &Value) -> bool {
    matches!(a.get("by").and_then(Value::as_str), Some(AGENT_BY) | Some("claude"))
}

fn short(text: &str) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.len() <= 10 { words.join(" ") } else { format!("{} …", words[..10].join(" ")) }
}

// ---------------------------------------------------------------------------
// Où écrire
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Kind {
    Text,
    Pdf,
}

/// Le fichier annoté, l'entrée du store qui le porte et le dossier du store.
#[derive(Debug, Clone)]
pub struct Target {
    pub kind: Kind,
    pub file: PathBuf,
    pub rel: String,
    pub store_dir: PathBuf,
}

/// Racine de la galerie qui sert `file` : le projet du fil quand le fichier y
/// est, sinon le dossier parent le plus proche qui porte déjà un store
/// d'annotations (`.fig_thumbs/pdf_annots.json`).
fn gallery_root(project_root: &Path, file: &Path) -> Option<PathBuf> {
    if !project_root.as_os_str().is_empty() && file.starts_with(project_root) {
        return Some(project_root.to_path_buf());
    }
    file.ancestors()
        .skip(1)
        .find(|dir| dir.join(".fig_thumbs").join(pdf_annots::STORE_NAME).is_file())
        .map(Path::to_path_buf)
}

/// `…/storage/<clé>/<fichier>.pdf` de Zotero → `zotero/<clé>/<fichier>.pdf`.
fn zotero_rel(file: &Path, zotero_storage: &Path) -> Option<String> {
    let rest = file.strip_prefix(zotero_storage).ok()?;
    let parts: Vec<String> = rest.iter().map(|p| p.to_string_lossy().to_string()).collect();
    match parts.as_slice() {
        [key, name] if key.len() == 8 && key.chars().all(|c| c.is_ascii_alphanumeric()) => {
            Some(format!("zotero/{key}/{name}"))
        }
        _ => None,
    }
}

pub fn resolve(project_root: &str, app_dir: &Path, zotero_storage: &Path, requested: &str) -> Result<Target, String> {
    let requested = requested.trim();
    if requested.is_empty() {
        return Err("path manquant : le chemin du fichier à annoter (.tex ou .pdf)".into());
    }
    let root = PathBuf::from(project_root);
    let file = if let Some(rest) = requested.strip_prefix("zotero/") {
        zotero_storage.join(rest)
    } else if Path::new(requested).is_absolute() {
        PathBuf::from(requested)
    } else {
        root.join(requested)
    };
    if !file.is_file() {
        return Err(format!("fichier introuvable : {requested}"));
    }
    let ext = file.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if ext == "pdf" {
        let storage = zotero_storage.canonicalize().unwrap_or_else(|_| zotero_storage.to_path_buf());
        let real = file.canonicalize().unwrap_or_else(|_| file.clone());
        if let Some(rel) = zotero_rel(&file, zotero_storage).or_else(|| zotero_rel(&real, &storage)) {
            return Ok(Target { kind: Kind::Pdf, file, rel, store_dir: app_dir.to_path_buf() });
        }
    }
    if matches!(ext.as_str(), "md" | "markdown" | "docx" | "doc" | "png" | "jpg" | "jpeg" | "svg" | "html") {
        return Err(format!(
            "les fichiers .{ext} ne prennent pas encore les notes de l'agent : .tex (ou tout fichier texte de l'éditeur LaTeX) et .pdf seulement"
        ));
    }
    let gallery = gallery_root(&root, &file)
        .ok_or_else(|| format!("{requested} est hors du projet ouvert dans Atelier : rien n'est annoté"))?;
    let store_dir = gallery.join(".fig_thumbs");
    if ext == "pdf" {
        let rel = file.strip_prefix(&gallery).map_err(|_| "chemin hors du projet".to_string())?;
        let rel = rel.to_string_lossy().replace('\\', "/");
        return Ok(Target { kind: Kind::Pdf, file, rel, store_dir });
    }
    let rel = format!("tex-comments:{}", file.to_string_lossy());
    Ok(Target { kind: Kind::Text, file, rel, store_dir })
}

// ---------------------------------------------------------------------------
// Passage dans un fichier texte
// ---------------------------------------------------------------------------

/// Position de CodeMirror : ligne (0…) et colonne en unités UTF-16.
fn position(text: &str, byte: usize) -> Value {
    let before = &text[..byte];
    let line = before.matches('\n').count();
    let start = before.rfind('\n').map_or(0, |i| i + 1);
    let ch: usize = text[start..byte].chars().map(char::len_utf16).sum();
    json!({"line": line, "ch": ch})
}

fn line_of(text: &str, byte: usize) -> usize {
    text[..byte].matches('\n').count()
}

/// Passage cité retrouvé : octets de début et de fin dans le fichier, et
/// nombre d'endroits où il apparaît. Exact d'abord ; sinon en ramenant toute
/// suite de blancs à une espace (la citation recopiée sans ses retours à la
/// ligne), comme `findAnnotationRange` de l'éditeur. Plusieurs endroits : le
/// plus proche de `line` (1…), sinon le premier.
pub fn find_in_text(text: &str, quote: &str, line: Option<usize>) -> Result<(usize, usize, usize), String> {
    let quote = quote.trim();
    if quote.chars().count() < 4 {
        return Err("citation trop courte : recopie quelques mots exacts du passage".into());
    }
    let mut spans: Vec<(usize, usize)> = text.match_indices(quote).map(|(i, m)| (i, i + m.len())).take(200).collect();
    if spans.is_empty() {
        // texte réduit (blancs → une espace) et, pour chaque caractère gardé,
        // son octet dans le fichier
        let mut reduced = String::new();
        let mut map: Vec<usize> = Vec::new();
        let mut last_space = true;
        for (i, c) in text.char_indices() {
            if c.is_whitespace() {
                if !last_space {
                    reduced.push(' ');
                    map.push(i);
                }
                last_space = true;
            } else {
                reduced.push(c);
                for _ in 0..c.len_utf8() {
                    map.push(i);
                }
                last_space = false;
            }
        }
        let wanted: String = quote.split_whitespace().collect::<Vec<_>>().join(" ");
        for (i, m) in reduced.match_indices(&wanted).take(200) {
            let start = map[i];
            let last = map[i + m.len() - 1];
            let end = last + text[last..].chars().next().map_or(1, char::len_utf8);
            spans.push((start, end));
        }
    }
    let count = spans.len();
    let best = match line {
        Some(l) => spans.into_iter().min_by_key(|(s, _)| (line_of(text, *s) as i64 - l.saturating_sub(1) as i64).abs()),
        None => spans.into_iter().next(),
    };
    best.map(|(s, e)| (s, e, count)).ok_or_else(|| "passage introuvable dans le fichier : recopie-le exactement".into())
}

// ---------------------------------------------------------------------------
// Une note demandée
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct NoteRequest {
    pub quote: String,
    pub comment: String,
    pub text: Option<String>,
    pub reason: String,
    pub line: Option<usize>,
    pub page: Option<u32>,
    pub style: String,
    pub color: String,
}

fn note_of(v: &Value, defaults: &Value) -> Result<NoteRequest, String> {
    let get = |k: &str| str_arg(v, k).or_else(|| str_arg(defaults, k));
    let quote = get("quote").unwrap_or("").to_string();
    let comment = get("comment").unwrap_or("").trim().to_string();
    let text = str_arg(v, "text").map(str::to_string);
    if comment.is_empty() && text.as_deref().is_none_or(|t| t.trim().is_empty()) {
        return Err("comment manquant : ce que tu veux dire sur ce passage".into());
    }
    if comment.chars().count() > COMMENT_MAX {
        return Err(format!("comment trop long (plus de {COMMENT_MAX} caractères) : une note reste courte"));
    }
    if text.as_deref().is_some_and(|t| t.chars().count() > TEXT_MAX) {
        return Err(format!("text trop long (plus de {TEXT_MAX} caractères)"));
    }
    let num = |k: &str| v.get(k).or_else(|| defaults.get(k)).and_then(Value::as_u64);
    let style = match get("style").unwrap_or("").trim().to_lowercase().as_str() {
        "" | "surligner" | "highlight" | "hl" => "hl",
        "souligner" | "underline" | "ul" => "ul",
        other => return Err(format!("style inconnu « {other} » : surligner ou souligner")),
    }
    .to_string();
    let color_name = get("color").unwrap_or("jaune").trim().to_lowercase();
    let color = HL_COLORS
        .iter()
        .find(|(name, _)| *name == color_name)
        .map(|(_, value)| value.to_string())
        .ok_or_else(|| format!("couleur inconnue « {color_name} » : jaune, vert, bleu, rose, orange ou violet"))?;
    Ok(NoteRequest {
        quote,
        comment,
        text,
        reason: get("reason").unwrap_or("").trim().to_string(),
        line: num("line").map(|n| n as usize),
        page: num("page").map(|n| n as u32),
        style,
        color,
    })
}

/// Les notes de l'appel : la liste `notes`, ou l'appel lui-même.
pub fn notes_of(req: &Value) -> Result<Vec<NoteRequest>, String> {
    match req.get("notes").and_then(Value::as_array) {
        Some(list) if list.is_empty() => Err("notes vide".into()),
        Some(list) if list.len() > NOTES_MAX => Err(format!("au plus {NOTES_MAX} notes par appel")),
        Some(list) => list.iter().map(|n| note_of(n, req)).collect(),
        None => Ok(vec![note_of(req, &Value::Null)?]),
    }
}

fn entries_mut<'a>(store: &'a mut Map<String, Value>, rel: &str) -> Result<&'a mut Vec<Value>, String> {
    store
        .entry(rel.to_string())
        .or_insert_with(|| json!([]))
        .as_array_mut()
        .ok_or_else(|| format!("annotations de {rel} illisibles"))
}

/// Note dans un fichier texte. Renvoie le compte rendu de chaque note.
pub fn add_text_notes(target: &Target, author: &str, notes: &[NoteRequest]) -> Result<Vec<String>, String> {
    let source = std::fs::read_to_string(&target.file).map_err(|e| format!("lecture impossible : {e}"))?;
    let stamp = now_ms();
    let mut report = Vec::new();
    let mut fresh = Vec::new();
    for (i, n) in notes.iter().enumerate() {
        let label = short(&n.quote);
        let (start, end, count) = match find_in_text(&source, &n.quote, n.line) {
            Ok(found) => found,
            Err(e) => {
                report.push(format!("- « {label} » : {e}"));
                continue;
            }
        };
        let id = format!("a{stamp}-{i}");
        let mut note = json!({
            "id": id,
            "from": position(&source, start),
            "to": position(&source, end),
            "text": &source[start..end],
            "comment": n.comment,
            "by": AGENT_BY,
            "author": author,
            "at": stamp,
        });
        if let Some(text) = n.text.as_deref().filter(|t| !t.trim().is_empty()) {
            note["suggest"] = json!({"text": text, "reason": n.reason});
        }
        let line = line_of(&source, start) + 1;
        let mut line_report = format!("- [{id}] ligne {line} « {label} » : {}", if note.get("suggest").is_some() { "proposition posée" } else { "note posée" });
        if count > 1 {
            line_report.push_str(&format!(" ({count} occurrences ; donne `line` pour en viser une autre)"));
        }
        report.push(line_report);
        fresh.push(note);
    }
    if !fresh.is_empty() {
        pdf_annots::with_store(&target.store_dir, |store| -> Result<((), bool), String> {
            entries_mut(store, &target.rel)?.extend(fresh);
            Ok(((), true))
        })?;
    }
    Ok(report)
}

/// Note dans un PDF : un marquage par page couverte, la note sur la première.
pub fn add_pdf_notes(target: &Target, author: &str, notes: &[NoteRequest]) -> Result<Vec<String>, String> {
    if notes.iter().any(|n| n.text.is_some()) {
        return Err("text (réécriture) seulement dans un fichier texte : dans un PDF, dis-le dans comment".into());
    }
    let pages = atelier_pdf::passage::read_pdf(&target.file)?;
    let stamp = now_ms();
    let mut report = Vec::new();
    let mut fresh: Vec<Value> = Vec::new();
    for (i, n) in notes.iter().enumerate() {
        let label = short(&n.quote);
        let found = match atelier_pdf::passage::find(&pages, &n.quote, n.page) {
            Ok(found) => found,
            Err(e) => {
                report.push(format!("- « {label} » : {e}"));
                continue;
            }
        };
        let parts = atelier_pdf::passage::parts(&pages, &found);
        let Some(first) = parts.first() else {
            report.push(format!("- « {label} » : passage introuvable"));
            continue;
        };
        let id = format!("a{stamp}-{i}p{}", first.page);
        let where_ = parts.iter().map(|p| p.page.to_string()).collect::<Vec<_>>().join("-");
        let mut line = format!("- [{id}] p. {where_} « {label} » : note posée");
        if !found.exact {
            line.push_str(" (début et fin retrouvés, milieu différent : vérifier)");
        }
        report.push(line);
        for (k, part) in parts.iter().enumerate() {
            let mut annot = json!({
                "id": if k == 0 { id.clone() } else { format!("a{stamp}-{i}p{}-{k}", part.page) },
                "page": part.page,
                "rects": part.rects,
                "text": part.text,
                "kind": n.style,
                "color": n.color,
                "note": "",
                "by": AGENT_BY,
                "author": author,
                "at": stamp,
            });
            if k == 0 && !n.comment.is_empty() {
                annot["memo"] = json!(n.comment);
            }
            fresh.push(annot);
        }
    }
    if !fresh.is_empty() {
        pdf_annots::with_store(&target.store_dir, |store| -> Result<((), bool), String> {
            entries_mut(store, &target.rel)?.extend(fresh);
            Ok(((), true))
        })?;
    }
    Ok(report)
}

/// Groupe d'un marquage PDF sur plusieurs pages (`a…-ip3`, `a…-ip4-1`).
fn pdf_group(id: &str) -> &str {
    id.rfind('p').map_or(id, |i| &id[..i])
}

/// Réponse de l'agent dans le fil d'une de ses notes.
pub fn reply(target: &Target, author: &str, id: &str, text: &str, suggestion: Option<&str>) -> Result<Value, String> {
    let text = text.trim();
    if text.is_empty() && suggestion.is_none_or(|s| s.trim().is_empty()) {
        return Err("text manquant : ta réponse".into());
    }
    if text.chars().count() > COMMENT_MAX {
        return Err(format!("réponse trop longue (plus de {COMMENT_MAX} caractères)"));
    }
    if suggestion.is_some() && target.kind == Kind::Pdf {
        return Err("suggestion seulement dans un fichier texte".into());
    }
    if suggestion.is_some_and(|s| s.chars().count() > TEXT_MAX) {
        return Err(format!("suggestion trop longue (plus de {TEXT_MAX} caractères)"));
    }
    let at = now_ms();
    let message_id = format!("m{at}");
    pdf_annots::with_store(&target.store_dir, |store| -> Result<(Value, bool), String> {
        let list = entries_mut(store, &target.rel)?;
        let note = list
            .iter_mut()
            .find(|a| a.get("id").and_then(Value::as_str) == Some(id))
            .ok_or_else(|| format!("note {id} introuvable dans ce fichier (résolue ou retirée ?)"))?;
        if !by_agent(note) {
            return Err("cette note est celle de l'utilisateur : réponds-lui dans le chat, ou avec atelier_revision pendant une ronde".into());
        }
        let thread = note
            .as_object_mut()
            .ok_or("note illisible")?
            .entry("thread")
            .or_insert_with(|| json!([]));
        let thread = thread.as_array_mut().ok_or("fil illisible")?;
        if thread.len() >= THREAD_MAX {
            return Err("fil trop long : propose de résoudre la note et d'en ouvrir une autre".into());
        }
        let mut message = json!({"id": message_id, "by": AGENT_BY, "author": author, "text": text, "at": at});
        if let Some(s) = suggestion.filter(|s| !s.trim().is_empty()) {
            message["suggest"] = json!({"text": s});
        }
        thread.push(message);
        Ok((json!({"ok": true, "message": message_id}), true))
    })
}

/// Les notes de l'agent dans ce fichier, et celles qui attendent sa réponse.
pub fn list(target: &Target) -> Result<Value, String> {
    let store = pdf_annots::read(&target.store_dir).map_err(|e| e.to_string())?;
    let empty = vec![];
    let list = store.get(&target.rel).and_then(Value::as_array).unwrap_or(&empty);
    let notes: Vec<Value> = list
        .iter()
        .filter(|a| by_agent(a))
        // un marquage PDF sur plusieurs pages ne compte qu'une fois
        .filter(|a| {
            let id = a.get("id").and_then(Value::as_str).unwrap_or("");
            target.kind == Kind::Text || id.rfind('p').is_none_or(|i| !id[i..].contains('-'))
        })
        .map(|a| {
            let thread = a.get("thread").and_then(Value::as_array).cloned().unwrap_or_default();
            let waiting = thread.last().is_some_and(|m| m.get("by").and_then(Value::as_str) == Some("user"));
            let mut out = json!({
                "id": a.get("id"),
                "quote": short(a.get("text").and_then(Value::as_str).unwrap_or("")),
                "comment": a.get("comment").or_else(|| a.get("memo")),
                "thread": thread.iter().map(|m| json!({"by": m.get("by"), "text": m.get("text")})).collect::<Vec<_>>(),
                "waitingForYou": waiting,
            });
            if target.kind == Kind::Text {
                out["line"] = json!(a.pointer("/from/line").and_then(Value::as_u64).map(|l| l + 1));
            } else {
                out["page"] = a.get("page").cloned().unwrap_or(Value::Null);
            }
            out
        })
        .collect();
    let mine = list.iter().filter(|a| !by_agent(a)).count();
    Ok(json!({"ok": true, "file": target.file, "notes": notes, "userNotes": mine}))
}

/// Retire des notes de l'agent (jamais celles de l'utilisateur).
pub fn remove(target: &Target, ids: &[String]) -> Result<Value, String> {
    if ids.is_empty() {
        return Err("id manquant".into());
    }
    pdf_annots::with_store(&target.store_dir, |store| -> Result<(Value, bool), String> {
        let list = entries_mut(store, &target.rel)?;
        let mut refused = Vec::new();
        let mut groups = Vec::new();
        for id in ids {
            match list.iter().find(|a| a.get("id").and_then(Value::as_str) == Some(id.as_str())) {
                Some(a) if by_agent(a) => groups.push(if target.kind == Kind::Pdf { pdf_group(id).to_string() } else { id.clone() }),
                Some(_) => refused.push(format!("{id} (note de l'utilisateur)")),
                None => refused.push(format!("{id} (introuvable)")),
            }
        }
        let before = list.len();
        list.retain(|a| {
            let id = a.get("id").and_then(Value::as_str).unwrap_or("");
            let key = if target.kind == Kind::Pdf { pdf_group(id) } else { id };
            !(by_agent(a) && groups.iter().any(|g| g == key))
        });
        let removed = before - list.len();
        Ok((json!({"ok": refused.is_empty(), "removed": removed, "refused": refused}), removed > 0))
    })
}

// ---------------------------------------------------------------------------
// Pont
// ---------------------------------------------------------------------------

fn run(project_root: &str, app_dir: &Path, zotero_storage: &Path, author: &str, action: &str, req: &Value) -> Result<Value, String> {
    let target = resolve(project_root, app_dir, zotero_storage, str_arg(req, "path").unwrap_or(""))?;
    match action {
        "note" => {
            let notes = notes_of(req)?;
            let report = match target.kind {
                Kind::Text => add_text_notes(&target, author, &notes)?,
                Kind::Pdf => add_pdf_notes(&target, author, &notes)?,
            };
            let placed = report.iter().filter(|l| l.starts_with("- [")).count();
            Ok(json!({
                "ok": placed > 0,
                "placed": placed,
                "report": report.join("\n"),
                "note": "Visible sur place dans Atelier en quelques secondes si le fichier est ouvert. Le fichier n'est pas modifié. \
                         Les réponses de l'utilisateur arrivent dans le chat avec l'id de la note : réponds avec action reply.",
            }))
        }
        "reply" => reply(
            &target,
            author,
            str_arg(req, "id").unwrap_or("").trim(),
            str_arg(req, "text").unwrap_or(""),
            str_arg(req, "suggestion"),
        ),
        "list" => list(&target),
        "remove" => {
            let ids: Vec<String> = match req.get("ids").and_then(Value::as_array) {
                Some(list) => list.iter().filter_map(Value::as_str).map(str::to_string).collect(),
                None => str_arg(req, "id").map(|s| vec![s.trim().to_string()]).unwrap_or_default(),
            };
            remove(&target, &ids)
        }
        other => Err(format!("action inconnue : {other} (note, reply, list, remove)")),
    }
}

/// Point d'entrée du pont : `annotate_note`, `annotate_reply`, `annotate_list`,
/// `annotate_remove`.
pub async fn action(state: &AppState, caller_id: &str, action: &str, req: &Value) -> Result<Value, String> {
    let (project_root, provider) = {
        let store = state.threads().lock().await;
        let caller = store
            .get(caller_id)
            .ok_or_else(|| atelier_protocol::agent_mcp_errors::CALLER_UNKNOWN.to_string())?;
        (caller.project_root.clone(), caller.provider.clone())
    };
    let author = crate::docx_tool::author_for(&provider).to_string();
    let app_dir = state.app_dir().to_path_buf();
    let action = action.trim_start_matches("annotate_").to_string();
    let req = req.clone();
    let job = move || {
        let zotero = atelier_integrations::Integrations::load().zotero_dir().join("storage");
        run(&project_root, &app_dir, &zotero, &author, &action, &req)
    };
    match tokio::task::spawn_blocking(job).await {
        Ok(Ok(v)) => Ok(v),
        // Un refus n'est pas une panne : l'agent lit la raison et corrige.
        Ok(Err(message)) => Ok(json!({"ok": false, "error": message})),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture {
        project: tempfile::TempDir,
        app: tempfile::TempDir,
        zotero: tempfile::TempDir,
    }

    impl Fixture {
        fn new() -> Self {
            let f = Fixture { project: tempfile::tempdir().unwrap(), app: tempfile::tempdir().unwrap(), zotero: tempfile::tempdir().unwrap() };
            std::fs::create_dir_all(f.project.path().join(".fig_thumbs")).unwrap();
            f
        }
        fn root(&self) -> String {
            self.project.path().canonicalize().unwrap().to_string_lossy().to_string()
        }
        fn run(&self, action: &str, req: Value) -> Result<Value, String> {
            run(&self.root(), self.app.path(), self.zotero.path(), "Claude", action, &req)
        }
        fn store(&self) -> Map<String, Value> {
            pdf_annots::read(&self.project.path().join(".fig_thumbs")).unwrap()
        }
    }

    const TEX: &str = "\\section{Data}\nWe retain 1\\,200 glaciers larger than\n0.5 km$^2$ with at least ten clear-sky observations.\nÉté : albédo.\n";

    #[test]
    fn a_note_lands_where_the_editor_reads_it_and_the_file_is_untouched() {
        let f = Fixture::new();
        std::fs::write(f.project.path().join("main.tex"), TEX).unwrap();
        let r = f.run("note", json!({"path": "main.tex", "quote": "1\\,200 glaciers", "comment": "1 180 dans le résumé ?"})).unwrap();
        assert_eq!(r["placed"], 1, "{r}");
        let store = f.store();
        let (rel, notes) = store.iter().next().unwrap();
        assert!(rel.starts_with("tex-comments:/") && rel.ends_with("main.tex"), "{rel}");
        let note = &notes[0];
        assert_eq!(note["by"], "agent");
        assert_eq!(note["author"], "Claude");
        assert_eq!(note["text"], "1\\,200 glaciers");
        assert_eq!(note["from"], json!({"line": 1, "ch": 10}));
        assert_eq!(note["to"], json!({"line": 1, "ch": 25}));
        assert_eq!(std::fs::read_to_string(f.project.path().join("main.tex")).unwrap(), TEX);
    }

    #[test]
    fn a_quote_copied_without_its_line_breaks_is_found_and_keeps_the_source_text() {
        let (s, e, n) = find_in_text(TEX, "larger than 0.5 km$^2$", None).unwrap();
        assert_eq!(&TEX[s..e], "larger than\n0.5 km$^2$");
        assert_eq!(n, 1);
        // colonnes en UTF-16, comme CodeMirror
        let (s, _, _) = find_in_text(TEX, "albédo", None).unwrap();
        assert_eq!(position(TEX, s), json!({"line": 3, "ch": 6}));
        assert!(find_in_text(TEX, "absent passage", None).is_err());
    }

    #[test]
    fn the_line_hint_picks_the_nearest_occurrence() {
        let text = "albedo drops\nother\nalbedo drops\n";
        let (s, _, n) = find_in_text(text, "albedo drops", Some(3)).unwrap();
        assert_eq!((line_of(text, s), n), (2, 2));
    }

    #[test]
    fn a_suggestion_a_reply_and_the_list_round_trip() {
        let f = Fixture::new();
        std::fs::write(f.project.path().join("main.tex"), TEX).unwrap();
        f.run("note", json!({"path": "main.tex", "notes": [
            {"quote": "ten clear-sky observations", "comment": "Plus court.", "text": "ten clear-sky scenes"},
            {"quote": "nowhere to be found", "comment": "x"}
        ]})).unwrap();
        let store = f.store();
        let note = &store.values().next().unwrap()[0];
        assert_eq!(note["suggest"]["text"], "ten clear-sky scenes");
        let id = note["id"].as_str().unwrap().to_string();
        let r = f.run("reply", json!({"path": "main.tex", "id": id, "text": "Alors ainsi.", "suggestion": "ten scenes"})).unwrap();
        assert_eq!(r["ok"], true, "{r}");
        let listed = f.run("list", json!({"path": "main.tex"})).unwrap();
        assert_eq!(listed["notes"][0]["line"], 3);
        assert_eq!(listed["notes"][0]["thread"][0]["text"], "Alors ainsi.");
        assert_eq!(listed["notes"][0]["waitingForYou"], false);
        let store = f.store();
        let thread = &store.values().next().unwrap()[0]["thread"];
        assert_eq!(thread[0]["suggest"]["text"], "ten scenes");
    }

    #[test]
    fn the_agent_never_touches_the_users_notes() {
        let f = Fixture::new();
        std::fs::write(f.project.path().join("main.tex"), TEX).unwrap();
        let rel = format!("tex-comments:{}/main.tex", f.root());
        pdf_annots::with_store(&f.project.path().join(".fig_thumbs"), |s| -> Result<((), bool), String> {
            s.insert(rel.clone(), json!([{"id": "c1", "text": "Data", "comment": "à moi"}]));
            Ok(((), true))
        }).unwrap();
        let e = f.run("reply", json!({"path": "main.tex", "id": "c1", "text": "x"})).unwrap_err();
        assert!(e.contains("utilisateur"), "{e}");
        let r = f.run("remove", json!({"path": "main.tex", "id": "c1"})).unwrap();
        assert_eq!(r["removed"], 0);
        assert_eq!(f.store()[&rel].as_array().unwrap().len(), 1);
    }

    #[test]
    fn remove_takes_only_the_agents_note() {
        let f = Fixture::new();
        std::fs::write(f.project.path().join("main.tex"), TEX).unwrap();
        f.run("note", json!({"path": "main.tex", "quote": "Data", "comment": "Titre trop court."})).unwrap();
        let id = f.store().values().next().unwrap()[0]["id"].as_str().unwrap().to_string();
        let r = f.run("remove", json!({"path": "main.tex", "id": id})).unwrap();
        assert_eq!(r["removed"], 1);
        assert!(f.store().values().next().unwrap().as_array().unwrap().is_empty());
    }

    #[test]
    fn targets_resolve_to_the_store_the_viewers_read() {
        let f = Fixture::new();
        std::fs::create_dir_all(f.project.path().join("build")).unwrap();
        std::fs::write(f.project.path().join("build/these.pdf"), b"%PDF").unwrap();
        let key_dir = f.zotero.path().join("ABCD1234");
        std::fs::create_dir_all(&key_dir).unwrap();
        std::fs::write(key_dir.join("article.pdf"), b"%PDF").unwrap();
        let t = resolve(&f.root(), f.app.path(), f.zotero.path(), "build/these.pdf").unwrap();
        assert_eq!((t.kind, t.rel.as_str()), (Kind::Pdf, "build/these.pdf"));
        assert!(t.store_dir.ends_with(".fig_thumbs"));
        let t = resolve(&f.root(), f.app.path(), f.zotero.path(), key_dir.join("article.pdf").to_str().unwrap()).unwrap();
        assert_eq!(t.rel, "zotero/ABCD1234/article.pdf");
        assert_eq!(t.store_dir, f.app.path());
        let t = resolve(&f.root(), f.app.path(), f.zotero.path(), "zotero/ABCD1234/article.pdf").unwrap();
        assert_eq!(t.rel, "zotero/ABCD1234/article.pdf");
        std::fs::write(f.project.path().join("notes.md"), "x").unwrap();
        assert!(resolve(&f.root(), f.app.path(), f.zotero.path(), "notes.md").unwrap_err().contains(".md"));
        assert!(resolve(&f.root(), f.app.path(), f.zotero.path(), "absent.tex").is_err());
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("x.tex"), "x").unwrap();
        assert!(resolve(&f.root(), f.app.path(), f.zotero.path(), outside.path().join("x.tex").to_str().unwrap()).is_err());
    }

    #[test]
    fn a_pdf_note_highlights_the_quoted_passage_with_the_note_on_it() {
        let program = atelier_pdf::tool::resolve(atelier_pdf::tool::Output::WordBoxes);
        if program.source == atelier_pdf::tool::Source::Poppler && !program.path.is_file() {
            eprintln!("ni atelier-pdf ni pdftotext : test sauté");
            return;
        }
        let f = Fixture::new();
        std::fs::copy(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../atelier-gallery/tests/fixtures/reflow/twocol.pdf"),
            f.project.path().join("paper.pdf"),
        )
        .unwrap();
        let r = f.run("note", json!({"path": "paper.pdf", "color": "bleu", "notes": [
            {"quote": "Integer sapien est, iaculis in, pretium quis, viverra ac, nunc.", "comment": "Ce passage dit que…"},
            {"quote": "a sentence that this article never contains anywhere", "comment": "x"}
        ]})).unwrap();
        assert_eq!(r["placed"], 1, "{r}");
        assert!(r["report"].as_str().unwrap().contains("introuvable"), "{r}");
        let store = f.store();
        let annots = store["paper.pdf"].as_array().unwrap();
        assert_eq!(annots[0]["by"], "agent");
        assert_eq!(annots[0]["memo"], "Ce passage dit que…");
        assert_eq!(annots[0]["color"], "rgba(120,170,255,.40)");
        assert!(!annots[0]["rects"].as_array().unwrap().is_empty());
        let id = annots[0]["id"].as_str().unwrap().to_string();
        f.run("reply", json!({"path": "paper.pdf", "id": id, "text": "Oui."})).unwrap();
        let listed = f.run("list", json!({"path": "paper.pdf"})).unwrap();
        assert_eq!(listed["notes"].as_array().unwrap().len(), 1);
        assert_eq!(listed["notes"][0]["page"], 1);
        let r = f.run("remove", json!({"path": "paper.pdf", "id": id})).unwrap();
        assert!(r["removed"].as_u64().unwrap() >= 1);
        assert!(f.store()["paper.pdf"].as_array().unwrap().is_empty());
    }

    #[test]
    fn a_pdf_note_without_text_layer_reports_instead_of_writing() {
        let f = Fixture::new();
        std::fs::write(f.project.path().join("x.pdf"), b"not a pdf").unwrap();
        let r = f.run("note", json!({"path": "x.pdf", "quote": "something long enough", "comment": "x"}));
        // sans outil PDF (CI sans atelier-pdf ni poppler) ou PDF illisible : refus lisible, rien d'écrit
        assert!(r.is_err() || r.as_ref().unwrap()["placed"] == 0);
        assert!(f.store().is_empty());
        let e = f.run("note", json!({"path": "x.pdf", "quote": "something", "comment": "x", "text": "y"})).unwrap_err();
        assert!(e.contains("fichier texte"), "{e}");
    }

    #[test]
    fn bad_arguments_are_refused_with_a_readable_reason() {
        assert!(notes_of(&json!({"quote": "abc def"})).unwrap_err().contains("comment"));
        assert!(notes_of(&json!({"quote": "abc def", "comment": "x", "color": "noir"})).unwrap_err().contains("couleur"));
        assert!(notes_of(&json!({"notes": []})).is_err());
        let n = notes_of(&json!({"quote": "abc def", "comment": "x", "color": "vert", "style": "souligner", "page": 4})).unwrap();
        assert_eq!((n[0].style.as_str(), n[0].page), ("ul", Some(4)));
    }
}
