//! Retour d'un relecteur en Word, posé dans le LaTeX (`POST /review/import`).
//!
//! Le relecteur (le directeur de Thierry) commente dans Word le .docx tiré
//! du .tex. L'éditeur LaTeX envoie ce .docx ; ses commentaires deviennent des
//! notes du .tex (`tex-comments:<chemin>`, `by: "reviewer"`), chacune sur
//! son passage (`atelier_docx::feedback`). Le .tex n'est jamais modifié.
//!
//! Réimporter le même fichier n'ajoute rien : l'identifiant d'une note tient
//! à la révision du .docx et au numéro du commentaire. Une copie du .docx est
//! gardée dans `.fig_thumbs/retours/` (le renvoi en aura besoin), et chaque
//! import est noté dans l'entrée `tex-review:<racine>` du store.

use atelier_core::{find_tex_root, pdf_annots, safe_project_path};
use atelier_docx::Docx;
use atelier_docx::feedback::{self, Feedback, Fit};
use axum::{
    Json,
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::{AppState, request_allowed};

/// Valeur de `by` des notes du relecteur.
pub const REVIEWER_BY: &str = "reviewer";
pub const MAX_DOCX_BYTES: usize = 64 * 1024 * 1024;

fn json_error(status: StatusCode, message: impl Into<String>) -> axum::response::Response {
    (status, Json(json!({"error": message.into()}))).into_response()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Deserialize)]
pub struct ImportQuery {
    /// Fichier ouvert dans l'éditeur (son chemin tel que l'éditeur le garde).
    path: String,
    /// Nom du .docx choisi.
    #[serde(default)]
    name: String,
}

fn fit_name(fit: Fit) -> &'static str {
    match fit {
        Fit::Exact => "exact",
        Fit::Changed => "changed",
        Fit::Paragraph => "paragraph",
        Fit::Near => "near",
    }
}

/// Nom de fichier sûr pour la copie gardée du .docx.
fn safe_name(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("retour.docx");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.to_ascii_lowercase().ends_with(".docx") {
        cleaned
    } else {
        format!("{cleaned}.docx")
    }
}

/// Notes du store, par entrée `tex-comments:`, tirées du retour.
pub fn notes_of(
    feedback: &Feedback,
    keys: &[String],
    source: &str,
    rev: &str,
    imported: u64,
) -> BTreeMap<String, Vec<Value>> {
    let mut out: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    for c in &feedback.comments {
        let Some(key) = keys.get(c.place.file) else {
            continue;
        };
        let replies: Vec<Value> = c
            .replies
            .iter()
            .map(|r| json!({"id": r.id, "author": r.author, "date": r.date, "text": r.text}))
            .collect();
        let note = json!({
            "id": format!("rv{}-{}", &rev[..rev.len().min(8)], c.id),
            "from": {"line": c.place.from.0, "ch": c.place.from.1},
            "to": {"line": c.place.to.0, "ch": c.place.to.1},
            "text": c.place.text,
            "comment": c.text,
            "by": REVIEWER_BY,
            "author": c.author,
            "at": imported,
            "review": {
                "source": source,
                "rev": rev,
                "cid": c.id,
                "date": c.date,
                "initials": c.initials,
                "quote": c.quote,
                "on": c.on,
                "kind": c.kind,
                "fit": fit_name(c.place.fit),
                "state": if c.done { "done" } else { "todo" },
                "replies": replies,
            },
        });
        out.entry(key.clone()).or_default().push(note);
    }
    // Ses modifications suivies, phrase par phrase (lot 2) : `kind: edit`,
    // sa version en LaTeX prête à accepter quand le .tex n'a pas bougé ; ce
    // qu'il a tapé en français devient un commentaire.
    let short = &rev[..rev.len().min(8)];
    for e in &feedback.edits {
        let Some(key) = keys.get(e.place.file) else {
            continue;
        };
        let initials = feedback
            .comments
            .iter()
            .find(|c| c.author == e.author)
            .map(|c| c.initials.clone())
            .unwrap_or_else(|| {
                e.author
                    .split_whitespace()
                    .filter_map(|w| w.chars().next())
                    .collect()
            });
        let note_only = e.status == "note";
        let mut review = json!({
            "source": source,
            "rev": rev,
            "eid": e.n,
            "date": e.date,
            "initials": initials,
            "quote": e.before,
            "on": if note_only { "inserted" } else { "text" },
            "kind": if note_only { "remark" } else { "edit" },
            "fit": fit_name(e.place.fit),
            "state": if e.status == "done" { "done" } else { "todo" },
            "replies": [],
        });
        if !note_only {
            review["edit"] = json!({
                "status": e.status,
                "before": e.before,
                "after": e.after,
                "diff": e.diff.iter().map(|(op, t)| json!([op, t])).collect::<Vec<_>>(),
                "latex": e.latex,
            });
        }
        let note = json!({
            "id": format!("rv{short}-e{}", e.n),
            "from": {"line": e.place.from.0, "ch": e.place.from.1},
            "to": {"line": e.place.to.0, "ch": e.place.to.1},
            "text": e.place.text,
            "comment": e.after,
            "by": REVIEWER_BY,
            "author": e.author,
            "at": imported,
            "review": review,
        });
        out.entry(key.clone()).or_default().push(note);
    }
    out
}

/// Ajoute les notes absentes du store ; renvoie (ajoutées, déjà là).
pub fn merge(
    store: &mut Map<String, Value>,
    notes: BTreeMap<String, Vec<Value>>,
) -> Result<(usize, usize), String> {
    let (mut added, mut known) = (0, 0);
    for (key, fresh) in notes {
        let list = store
            .entry(key.clone())
            .or_insert_with(|| json!([]))
            .as_array_mut()
            .ok_or_else(|| format!("annotations de {key} illisibles"))?;
        for note in fresh {
            let id = note.get("id").and_then(Value::as_str).unwrap_or("");
            if list
                .iter()
                .any(|n| n.get("id").and_then(Value::as_str) == Some(id))
            {
                known += 1;
            } else {
                list.push(note);
                added += 1;
            }
        }
    }
    Ok((added, known))
}

/// Chemin d'un fichier tel que l'éditeur le nomme : celui qu'il a donné pour
/// le fichier ouvert, le dossier du projet tel qu'Atelier le nomme pour les
/// autres (les clés du store en dépendent).
fn shown_path(
    project: &Path,
    real_project: &Path,
    current: &Path,
    editor_path: &str,
    p: &Path,
) -> PathBuf {
    if p == current {
        PathBuf::from(editor_path)
    } else {
        match p.strip_prefix(real_project) {
            Ok(rel) => project.join(rel),
            Err(_) => p.to_path_buf(),
        }
    }
}

/// Entrée `tex-review:<racine>` des retours importés pour le document du
/// fichier ouvert.
fn review_key(project: &Path, editor_path: &str) -> Result<String, String> {
    let current =
        safe_project_path(project, editor_path).map_err(|_| "outside the project".to_string())?;
    let root = find_tex_root(&current);
    let root = safe_project_path(project, &root.to_string_lossy())
        .map_err(|_| "outside the project".to_string())?;
    let real_project = std::fs::canonicalize(project).unwrap_or_else(|_| project.to_path_buf());
    Ok(format!(
        "tex-review:{}",
        shown_path(project, &real_project, &current, editor_path, &root).to_string_lossy()
    ))
}

/// Les retours du document et l'état de chacun de leurs commentaires, tous
/// fichiers confondus : avancement et ordre du jour du panneau.
pub fn status_of(store: &Map<String, Value>, root_key: &str) -> Value {
    let rounds = store
        .get(root_key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let revs: Vec<&str> = rounds
        .iter()
        .filter_map(|r| r.get("rev").and_then(Value::as_str))
        .collect();
    let mut notes = Vec::new();
    for (key, list) in store {
        let Some(path) = key.strip_prefix("tex-comments:") else {
            continue;
        };
        for note in list.as_array().into_iter().flatten() {
            if note.get("by").and_then(Value::as_str) != Some(REVIEWER_BY) {
                continue;
            }
            let review = note.get("review").cloned().unwrap_or(Value::Null);
            if !revs.contains(&review.get("rev").and_then(Value::as_str).unwrap_or("")) {
                continue;
            }
            let thread = note
                .get("thread")
                .and_then(Value::as_array)
                .map_or(0, Vec::len);
            notes.push(json!({
                "path": path,
                "id": note.get("id"),
                "number": note.get("number"),
                "line": note.pointer("/from/line").and_then(Value::as_u64).map(|l| l + 1),
                "comment": note.get("comment"),
                "author": note.get("author"),
                "text": note.get("text"),
                "state": review.get("state").and_then(Value::as_str).unwrap_or("todo"),
                "kind": review.get("kind"),
                "edit": review.pointer("/edit/status"),
                "refused": review.get("refused").is_some_and(|v| v.as_u64().unwrap_or(0) > 0),
                "accepted": review.get("accepted").is_some_and(|v| v.as_u64().unwrap_or(0) > 0),
                "fit": review.get("fit"),
                "rev": review.get("rev"),
                "thread": thread,
                "quote": review.get("quote"),
                "likely": likely_settled(note),
                "assessed": review.get("likely").is_some(),
                "chat": review.get("chatAt").is_some(),
            }));
        }
    }
    // Ses retouches de texte se comptent à part (« Ses modifications »).
    let (edits, comments): (Vec<&Value>, Vec<&Value>) =
        notes.iter().partition(|n| n["kind"] == "edit");
    let edit_count = |status: &str| {
        edits
            .iter()
            .filter(|n| n["state"] == "todo" && n["edit"] == status)
            .count()
    };
    let edit_counts = json!({
        "total": edits.len(),
        "apply": edit_count("apply"),
        "changed": edit_count("changed"),
        "done": edits.iter().filter(|n| n["state"] == "done").count(),
        "todo": edits.iter().filter(|n| n["state"] == "todo").count(),
    });
    let notes_all = notes.clone();
    let notes: Vec<Value> = comments.into_iter().cloned().collect();
    let count = |state: &str| notes.iter().filter(|n| n["state"] == state).count();
    let counts = json!({
        "edits": edit_counts,
        "total": notes.len(),
        "todo": count("todo"),
        "agenda": count("agenda"),
        "done": count("done"),
        "discussing": notes.iter().filter(|n| n["state"] == "todo" && n["thread"].as_u64().unwrap_or(0) > 0).count(),
        "likely": notes.iter().filter(|n| n["state"] == "todo" && n["likely"] == true).count(),
        // passages retouchés depuis son retour que Claude n'a pas encore jugés
        "unassessed": notes.iter().filter(|n| n["state"] == "todo" && n["fit"] == "changed" && n["assessed"] == false).count(),
    });
    json!({"ok": true, "rounds": rounds, "notes": notes_all, "counts": counts})
}

#[derive(Deserialize)]
pub struct StatusQuery {
    path: String,
}

/// `GET /review/status?path=` — retours importés pour le document du fichier
/// ouvert, avec l'état de chaque commentaire.
pub async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<StatusQuery>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let project = state.root.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<Value, (StatusCode, String)> {
        let key = review_key(&project, &q.path).map_err(|e| (StatusCode::FORBIDDEN, e))?;
        let store = pdf_annots::read(&project.join(".fig_thumbs"))
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok(status_of(&store, &key))
    })
    .await;
    match result {
        Ok(Ok(value)) => (StatusCode::OK, Json(value)).into_response(),
        Ok(Err((status, message))) => json_error(status, message),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "lecture interrompue"),
    }
}

struct Imported {
    feedback: Feedback,
    keys: Vec<String>,
    added: usize,
    known: usize,
    rev: String,
    root_key: String,
}

fn run(
    project: &Path,
    editor_path: &str,
    name: &str,
    bytes: Vec<u8>,
) -> Result<Imported, (StatusCode, String)> {
    let forbid = |_| (StatusCode::FORBIDDEN, "outside the project".to_string());
    let current = safe_project_path(project, editor_path).map_err(forbid)?;
    let root = find_tex_root(&current);
    let root = safe_project_path(project, &root.to_string_lossy()).map_err(forbid)?;
    let real_project = std::fs::canonicalize(project).unwrap_or_else(|_| project.to_path_buf());
    let mut docx = Docx::from_bytes(bytes).map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("fichier .docx illisible : {}", e.0),
        )
    })?;
    let rev = docx.revision();
    let read = |p: &Path| -> Option<String> {
        let safe = safe_project_path(project, &p.to_string_lossy()).ok()?;
        std::fs::read_to_string(safe).ok()
    };
    let tex = feedback::read_tex(&root, &read);
    if tex.tokens.is_empty() {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            "aucun texte LaTeX lisible à partir de ce fichier".into(),
        ));
    }
    let fb = feedback::import(&mut docx, &tex).map_err(|e| (StatusCode::BAD_REQUEST, e.0))?;
    let key_of = |p: &Path| {
        format!(
            "tex-comments:{}",
            shown_path(project, &real_project, &current, editor_path, p).to_string_lossy()
        )
    };
    let keys: Vec<String> = fb.files.iter().map(|p| key_of(p)).collect();
    let root_key = review_key(project, editor_path).map_err(|e| (StatusCode::FORBIDDEN, e))?;
    let imported = now_ms();
    let source = safe_name(name);
    let notes = notes_of(&fb, &keys, &source, &rev, imported);
    let store_dir = project.join(".fig_thumbs");
    // Copie du .docx (le renvoi repartira de ses commentaires).
    let copies = store_dir.join("retours");
    let copy = copies.join(format!("{}-{source}", &rev[..8.min(rev.len())]));
    if !copy.exists() {
        let _ = std::fs::create_dir_all(&copies);
        let _ = std::fs::write(&copy, docx.to_bytes().unwrap_or_default());
    }
    let counts = serde_json::to_value(&fb.counts).unwrap_or(Value::Null);
    let record = json!({
        "id": format!("rv{}", &rev[..8.min(rev.len())]),
        "rev": rev,
        "source": source,
        "reviewer": fb.reviewer,
        "date": fb.last_date,
        "imported": imported,
        "counts": counts,
        "changes": fb.changes,
        "copy": copy.strip_prefix(project).map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        // ordre de lecture du document : « Suivant » parcourt ses commentaires dans cet ordre
        "files": keys.iter().map(|k| k.trim_start_matches("tex-comments:")).collect::<Vec<_>>(),
    });
    let (added, known) = pdf_annots::with_store(
        &store_dir,
        |store| -> Result<((usize, usize), bool), String> {
            let (added, known) = merge(store, notes)?;
            let rounds = store
                .entry(root_key.clone())
                .or_insert_with(|| json!([]))
                .as_array_mut()
                .ok_or("historique des retours illisible")?;
            let fresh_round = !rounds
                .iter()
                .any(|r| r.get("rev").and_then(Value::as_str) == Some(rev.as_str()));
            if fresh_round {
                rounds.push(record);
            }
            Ok(((added, known), added > 0 || fresh_round))
        },
    )
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Imported {
        feedback: fb,
        keys,
        added,
        known,
        rev,
        root_key,
    })
}

/// `POST /review/import?path=&name=` — corps : le .docx du relecteur.
pub async fn import(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ImportQuery>,
    body: Bytes,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    if body.is_empty() {
        return json_error(StatusCode::BAD_REQUEST, "aucun fichier reçu");
    }
    if body.len() > MAX_DOCX_BYTES {
        return json_error(StatusCode::PAYLOAD_TOO_LARGE, "fichier trop gros");
    }
    let project = state.root.clone();
    let result =
        tokio::task::spawn_blocking(move || run(&project, &q.path, &q.name, body.to_vec())).await;
    match result {
        Ok(Ok(done)) => {
            let fb = &done.feedback;
            let mut per_file: BTreeMap<&str, usize> = BTreeMap::new();
            for c in &fb.comments {
                if let Some(k) = done.keys.get(c.place.file) {
                    *per_file
                        .entry(k.trim_start_matches("tex-comments:"))
                        .or_default() += 1;
                }
            }
            let kinds = |on: &str| fb.comments.iter().filter(|c| c.on == on).count();
            (
                StatusCode::OK,
                Json(json!({
                    "ok": true,
                    "review": format!("rv{}", &done.rev[..8.min(done.rev.len())]),
                    "reviewer": fb.reviewer,
                    "date": fb.last_date,
                    "counts": fb.counts,
                    "added": done.added,
                    "known": done.known,
                    "changes": fb.changes,
                    "moves": fb.moves,
                    "formats": fb.formats,
                    "edits": {
                        "apply": fb.edits.iter().filter(|e| e.status == "apply").count(),
                        "changed": fb.edits.iter().filter(|e| e.status == "changed").count(),
                        "done": fb.edits.iter().filter(|e| e.status == "done").count(),
                        "notes": fb.edits.iter().filter(|e| e.status == "note").count(),
                    },
                    "on": {"equation": kinds("equation"), "figure": kinds("figure"), "inserted": kinds("inserted"), "point": kinds("point")},
                    "files": per_file.into_iter().map(|(path, notes)| json!({"path": path, "notes": notes})).collect::<Vec<_>>(),
                    "rounds": done.root_key,
                })),
            )
                .into_response()
        }
        Ok(Err((status, message))) => json_error(status, message),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "import interrompu"),
    }
}

/// L'agent a jugé que la retouche de Thierry règle déjà ce commentaire
/// (`atelier_annotate`, action `assess`). Thierry confirme d'un clic.
fn likely_settled(note: &Value) -> bool {
    note.pointer("/review/likely/settled")
        .and_then(Value::as_bool)
        == Some(true)
}

/// Les commentaires du relecteur dans l'ordre du document : fichiers dans
/// l'ordre de lecture du dernier import, puis ligne et colonne.
fn ordered(store: &Map<String, Value>, root_key: &str) -> Vec<(String, Value)> {
    let rounds = store
        .get(root_key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let revs: Vec<String> = rounds
        .iter()
        .filter_map(|r| r.get("rev").and_then(Value::as_str).map(str::to_string))
        .collect();
    let files: Vec<String> = rounds
        .iter()
        .rev()
        .find_map(|r| r.get("files").and_then(Value::as_array).cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|f| f.as_str().map(str::to_string))
        .collect();
    let mut out = Vec::new();
    for (key, list) in store {
        let Some(path) = key.strip_prefix("tex-comments:") else {
            continue;
        };
        for note in list.as_array().into_iter().flatten() {
            let rev = note
                .pointer("/review/rev")
                .and_then(Value::as_str)
                .unwrap_or("");
            if note.get("by").and_then(Value::as_str) == Some(REVIEWER_BY)
                && revs.iter().any(|r| r == rev)
            {
                out.push((path.to_string(), note.clone()));
            }
        }
    }
    let rank = |path: &str| files.iter().position(|f| f == path).unwrap_or(usize::MAX);
    let at = |note: &Value, field: &str| note.pointer(field).and_then(Value::as_u64).unwrap_or(0);
    out.sort_by(|(pa, a), (pb, b)| {
        (
            rank(pa),
            pa.as_str(),
            at(a, "/from/line"),
            at(a, "/from/ch"),
        )
            .cmp(&(
                rank(pb),
                pb.as_str(),
                at(b, "/from/line"),
                at(b, "/from/ch"),
            ))
    });
    out
}

fn state_of(note: &Value) -> &str {
    note.pointer("/review/state")
        .and_then(Value::as_str)
        .unwrap_or("todo")
}

/// Ce que le chat montre d'un commentaire : sa carte et ce que l'agent lit.
fn comment_payload(path: &str, note: &Value, n: usize, total: usize) -> Value {
    json!({
        "path": path,
        "id": note.get("id"),
        "n": n,
        "total": total,
        "author": note.get("author"),
        "comment": note.get("comment"),
        "quote": note.pointer("/review/quote"),
        "now": note.get("text"),
        "line": note.pointer("/from/line").and_then(Value::as_u64).map(|l| l + 1),
        "fit": note.pointer("/review/fit"),
        "kind": note.pointer("/review/kind"),
        "on": note.pointer("/review/on"),
        "state": state_of(note),
        "likely": note.pointer("/review/likely").cloned().unwrap_or(Value::Null),
        "edit": note.pointer("/review/edit").map(|e| json!({
            "status": e.get("status"),
            "before": e.get("before"),
            "after": e.get("after"),
            "ready": e.get("latex").is_some_and(|l| !l.is_null()),
        })),
    })
}

fn is_edit(note: &Value) -> bool {
    note.pointer("/review/kind").and_then(Value::as_str) == Some("edit")
}

/// Commentaire demandé (`at`), sinon le prochain à faire après `after`
/// (en reprenant au début) : `likely` ne parcourt que ceux que l'agent juge
/// déjà réglés, `open` saute ceux-là.
pub fn next_of(
    store: &Map<String, Value>,
    root_key: &str,
    after: &str,
    at: &str,
    mode: &str,
) -> Value {
    // Ses retouches (`edit`) et ses commentaires se parcourent séparément.
    let all = ordered(store, root_key);
    let edits = match all
        .iter()
        .find(|(_, n)| !at.is_empty() && n.get("id").and_then(Value::as_str) == Some(at))
    {
        Some((_, n)) => is_edit(n),
        None => mode == "edit",
    };
    let list: Vec<(String, Value)> = all
        .into_iter()
        .filter(|(_, n)| is_edit(n) == edits)
        .collect();
    let total = list.len();
    let id_of = |note: &Value| {
        note.get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    if !at.is_empty() {
        return match list.iter().position(|(_, note)| id_of(note) == at) {
            Some(i) => {
                json!({"ok": true, "note": comment_payload(&list[i].0, &list[i].1, i + 1, total)})
            }
            None => json!({"ok": false, "error": "commentaire introuvable"}),
        };
    }
    let wanted = |note: &Value| {
        state_of(note) == "todo"
            && match mode {
                "likely" => likely_settled(note),
                "open" => !likely_settled(note),
                _ => true,
            }
    };
    let start = list
        .iter()
        .position(|(_, note)| id_of(note) == after)
        .map_or(0, |i| i + 1);
    let remaining = list
        .iter()
        .filter(|(_, note)| wanted(note) && id_of(note) != after)
        .count();
    let found = (0..total)
        .map(|k| (start + k) % total.max(1))
        .find(|&i| wanted(&list[i].1) && id_of(&list[i].1) != after);
    match found {
        Some(i) => {
            json!({"ok": true, "note": comment_payload(&list[i].0, &list[i].1, i + 1, total), "remaining": remaining})
        }
        None => json!({"ok": true, "note": Value::Null, "remaining": 0, "total": total}),
    }
}

#[derive(Deserialize)]
pub struct NextQuery {
    path: String,
    #[serde(default)]
    after: String,
    #[serde(default)]
    at: String,
    #[serde(default)]
    mode: String,
}

/// `GET /review/next?path=&after=&at=&mode=` — le commentaire à discuter
/// ensuite (ou celui demandé), pour le chat.
pub async fn next(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<NextQuery>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let project = state.root.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<Value, (StatusCode, String)> {
        let key = review_key(&project, &q.path).map_err(|e| (StatusCode::FORBIDDEN, e))?;
        let store = pdf_annots::read(&project.join(".fig_thumbs"))
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok(next_of(&store, &key, &q.after, &q.at, &q.mode))
    })
    .await;
    match result {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, message))) => json_error(status, message),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "lecture interrompue"),
    }
}

#[derive(Deserialize)]
pub struct StateBody {
    /// Fichier ouvert dans l'éditeur (pour retrouver le document).
    path: String,
    /// Fichier du commentaire (clé `tex-comments:` sans le préfixe).
    file: String,
    id: String,
    #[serde(default)]
    state: Option<String>,
    /// Le commentaire part dans le chat : « Dans le chat » sur le texte.
    #[serde(default)]
    chat: bool,
    /// « Garder mon texte » sur une de ses retouches : sa version tombe.
    #[serde(default)]
    refused: bool,
}

/// Change l'état d'un commentaire du relecteur (ou le marque « dans le
/// chat ») ; refuse toute autre note. `stateAt`/`chatAt` datent le geste :
/// une sauvegarde plus ancienne de l'éditeur ne le défait pas.
pub fn set_state(
    store: &mut Map<String, Value>,
    root_key: &str,
    file: &str,
    id: &str,
    wanted: Option<&str>,
    chat: bool,
) -> Result<bool, String> {
    if let Some(wanted) = wanted
        && !matches!(wanted, "todo" | "agenda" | "done")
    {
        return Err(format!("état inconnu : {wanted}"));
    }
    if !ordered(store, root_key)
        .iter()
        .any(|(p, n)| p == file && n.get("id").and_then(Value::as_str) == Some(id))
    {
        return Err("commentaire introuvable dans ce retour".into());
    }
    let list = store
        .get_mut(&format!("tex-comments:{file}"))
        .and_then(Value::as_array_mut)
        .ok_or("fichier introuvable")?;
    let note = list
        .iter_mut()
        .find(|n| n.get("id").and_then(Value::as_str) == Some(id))
        .ok_or("commentaire introuvable")?;
    let review = note
        .get_mut("review")
        .and_then(Value::as_object_mut)
        .ok_or("commentaire illisible")?;
    let at = now_ms();
    let mut changed = false;
    if let Some(wanted) = wanted {
        changed = review
            .get("state")
            .and_then(Value::as_str)
            .unwrap_or("todo")
            != wanted;
        review.insert("state".into(), json!(wanted));
        review.insert("stateAt".into(), json!(at));
    }
    if chat {
        review.insert("chatAt".into(), json!(at));
        changed = true;
    }
    Ok(changed)
}

/// `POST /review/state` — Réglé / À voir avec lui / à faire, depuis le chat
/// ou le panneau, pour un commentaire de n'importe quel fichier du document.
pub async fn set_review_state(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<StateBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let project = state.root.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<Value, (StatusCode, String)> {
        let key = review_key(&project, &body.path).map_err(|e| (StatusCode::FORBIDDEN, e))?;
        pdf_annots::with_store(&project.join(".fig_thumbs"), |store| {
            set_state(
                store,
                &key,
                &body.file,
                &body.id,
                body.state.as_deref(),
                body.chat,
            )
            .map(|changed| {
                if body.refused {
                    stamp(store, &body.file, &body.id, "refused");
                }
                (json!({"ok": true}), changed || body.refused)
            })
        })
        .map_err(|e| (StatusCode::BAD_REQUEST, e))
    })
    .await;
    match result {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, message))) => json_error(status, message),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "écriture interrompue"),
    }
}

/// Octet de (ligne, colonne UTF-16) dans `text`.
fn offset_of(text: &str, line: usize, ch: usize) -> Option<usize> {
    let start = if line == 0 {
        0
    } else {
        text.match_indices('\n').nth(line - 1)?.0 + 1
    };
    let rest = &text[start..];
    let mut units = 0;
    for (i, c) in rest.char_indices() {
        if units >= ch || c == '\n' {
            return (units == ch).then_some(start + i);
        }
        units += c.len_utf16();
    }
    (units == ch).then_some(start + rest.len())
}

fn position_of(text: &str, byte: usize) -> (usize, usize) {
    let before = &text[..byte];
    let line = before.matches('\n').count();
    let start = before.rfind('\n').map_or(0, |i| i + 1);
    (line, text[start..byte].chars().map(char::len_utf16).sum())
}

/// Date un geste (`refused`, `accepted`) dans le `review` d'une note.
fn stamp(store: &mut Map<String, Value>, file: &str, id: &str, field: &str) {
    if let Some(review) = store
        .get_mut(&format!("tex-comments:{file}"))
        .and_then(Value::as_array_mut)
        .and_then(|l| l.iter_mut().find(|n| n.get("id").and_then(Value::as_str) == Some(id)))
        .and_then(|n| n.get_mut("review"))
        .and_then(Value::as_object_mut)
    {
        review.insert(field.into(), json!(now_ms()));
    }
}

/// Ce qu'« Accepter » écrit, comme l'éditeur (`reviewerSuggestion`) : la
/// dernière correction de Claude non refusée (une fusion), sinon sa version
/// prête à appliquer, sauf si elle a été refusée.
fn edit_text(note: &Value) -> Option<String> {
    let refused = note.pointer("/review/refused").and_then(Value::as_u64).unwrap_or(0);
    let thread = note.get("thread").and_then(Value::as_array);
    if let Some(message) = thread.and_then(|t| t.iter().rev().find(|m| m.pointer("/suggest/text").and_then(Value::as_str).is_some())) {
        if refused >= message.get("at").and_then(Value::as_u64).unwrap_or(0) {
            return None;
        }
        return message.pointer("/suggest/text").and_then(Value::as_str).map(str::to_string);
    }
    if refused > 0 {
        return None;
    }
    note.pointer("/review/edit/latex").and_then(Value::as_str).map(str::to_string)
}

/// Accepte une de ses retouches dans un fichier que l'éditeur n'a pas
/// ouvert : son passage, s'il n'a pas changé, devient sa version ; la note
/// reste, réglée, sur le passage réécrit. Renvoie le nouveau texte du fichier.
pub fn apply_edit(
    store: &mut Map<String, Value>,
    root_key: &str,
    file: &str,
    id: &str,
    text: &str,
) -> Result<String, String> {
    if !ordered(store, root_key)
        .iter()
        .any(|(p, n)| p == file && n.get("id").and_then(Value::as_str) == Some(id) && is_edit(n))
    {
        return Err("retouche introuvable dans ce retour".into());
    }
    let note = store
        .get_mut(&format!("tex-comments:{file}"))
        .and_then(Value::as_array_mut)
        .and_then(|l| {
            l.iter_mut()
                .find(|n| n.get("id").and_then(Value::as_str) == Some(id))
        })
        .ok_or("retouche introuvable")?;
    let latex = edit_text(note).ok_or("cette retouche demande une fusion : rien à appliquer tel quel")?;
    let quoted = note
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let at = |field: &str| {
        note.pointer(field)
            .and_then(Value::as_u64)
            .map(|v| v as usize)
    };
    let start = match (at("/from/line"), at("/from/ch")) {
        (Some(l), Some(c)) => offset_of(text, l, c),
        _ => None,
    };
    let start = match start {
        Some(s) if text[s..].starts_with(&quoted) => s,
        // le passage a glissé (lignes ajoutées plus haut) : le retrouver seul
        _ if !quoted.trim().is_empty() && text.matches(&quoted).count() == 1 => {
            text.find(&quoted).unwrap_or(0)
        }
        _ => return Err("le passage a changé depuis son retour".into()),
    };
    let mut out = String::with_capacity(text.len() + latex.len());
    out.push_str(&text[..start]);
    out.push_str(&latex);
    out.push_str(&text[start + quoted.len()..]);
    let from = position_of(&out, start);
    let to = position_of(&out, start + latex.len());
    note["from"] = json!({"line": from.0, "ch": from.1});
    note["to"] = json!({"line": to.0, "ch": to.1});
    note["text"] = json!(latex);
    if let Some(review) = note.get_mut("review").and_then(Value::as_object_mut) {
        review.insert("state".into(), json!("done"));
        review.insert("stateAt".into(), json!(now_ms()));
        review.insert("accepted".into(), json!(now_ms()));
    }
    Ok(out)
}

#[derive(Deserialize)]
pub struct ApplyBody {
    path: String,
    file: String,
    id: String,
}

/// `POST /review/apply` — « Accepter » une retouche du relecteur depuis le
/// chat, quand son fichier n'est pas celui de l'éditeur qui la porte.
pub async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<ApplyBody>,
) -> impl IntoResponse {
    if !request_allowed(&headers, &state) {
        return json_error(StatusCode::FORBIDDEN, "cross-origin blocked");
    }
    let project = state.root.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<Value, (StatusCode, String)> {
        let key = review_key(&project, &body.path).map_err(|e| (StatusCode::FORBIDDEN, e))?;
        let target = safe_project_path(&project, &body.file)
            .map_err(|_| (StatusCode::FORBIDDEN, "outside the project".to_string()))?;
        let text =
            std::fs::read_to_string(&target).map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
        let mut written = String::new();
        pdf_annots::with_store(&project.join(".fig_thumbs"), |store| {
            written = apply_edit(store, &key, &body.file, &body.id, &text)?;
            Ok((json!({"ok": true}), true))
        })
        .map_err(|e| (StatusCode::CONFLICT, e))?;
        std::fs::write(&target, &written)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Ok(json!({"ok": true}))
    })
    .await;
    match result {
        Ok(Ok(v)) => (StatusCode::OK, Json(v)).into_response(),
        Ok(Err((status, message))) => json_error(status, message),
        Err(_) => json_error(StatusCode::INTERNAL_SERVER_ERROR, "écriture interrompue"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// Le .docx de test d'atelier-docx (`tests/fixtures/retour`), zippé.
    fn fixture_docx() -> Vec<u8> {
        let dir =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../atelier-docx/tests/fixtures/retour");
        let mut files = Vec::new();
        fn walk(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) {
            for e in std::fs::read_dir(dir).unwrap().flatten() {
                let p = e.path();
                if p.is_dir() {
                    walk(root, &p, out);
                } else {
                    out.push((
                        p.strip_prefix(root)
                            .unwrap()
                            .to_string_lossy()
                            .replace('\\', "/"),
                        p,
                    ));
                }
            }
        }
        walk(&dir, &dir, &mut files);
        files.sort_by_key(|(rel, _)| (rel != "[Content_Types].xml", rel.clone()));
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (rel, path) in files {
            zip.start_file(rel, zip::write::SimpleFileOptions::default().last_modified_time(zip::DateTime::default()))
                .unwrap();
            zip.write_all(&std::fs::read(path).unwrap()).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }

    fn project() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("sections")).unwrap();
        std::fs::write(
            root.join("main.tex"),
            "\\documentclass{article}\n\\begin{document}\n\\section{Methods}\n\\input{sections/methods}\n\\begin{figure}\n\\caption{Observed and modelled albedo.}\n\\end{figure}\n\\end{document}\n",
        )
        .unwrap();
        std::fs::write(
            root.join("sections/methods.tex"),
            "Values below 0.05 or above 0.99 are removed.\nFollowing \\citet{stroeve2006}, we remove images with a solar zenith angle greater than $70^\\circ$.\n\nSummer albedo is the mean over June to August.\n\nThe model is $x = a + b$ fitted to all zones.\n",
        )
        .unwrap();
        dir
    }

    #[test]
    fn import_writes_reviewer_notes_once_and_keeps_a_copy() {
        let dir = project();
        let root = dir.path();
        let main = root.join("main.tex").to_string_lossy().to_string();
        let done = run(root, &main, "revCK.docx", fixture_docx()).unwrap();
        // 5 commentaires + 2 de ses retouches, changées depuis dans le .tex
        assert_eq!(done.added, 7);
        assert_eq!(done.known, 0);
        let store = pdf_annots::read(&root.join(".fig_thumbs")).unwrap();
        let section = format!(
            "tex-comments:{}",
            root.join("sections/methods.tex").to_string_lossy()
        );
        let notes = store[&section].as_array().unwrap();
        assert_eq!(notes.len(), 6);
        let edits: Vec<&Value> = notes
            .iter()
            .filter(|n| n["review"]["kind"] == "edit")
            .collect();
        assert_eq!(edits.len(), 2);
        // ses mots autour d'une équation Word : prêt à accepter, l'équation
        // du .tex gardée telle quelle ; « 70° » contre `$70^\circ$` : à fusionner
        assert_eq!(edits[0]["review"]["edit"]["status"], "changed");
        assert!(edits[0]["review"]["edit"]["latex"].is_null());
        assert_eq!(edits[1]["review"]["edit"]["status"], "apply");
        assert_eq!(
            edits[1]["review"]["edit"]["latex"],
            "The model is $x = a + b$ with care fitted to all zones."
        );
        assert_eq!(
            edits[0]["id"],
            format!(
                "{}-e1",
                notes[0]["id"].as_str().unwrap().split('-').next().unwrap()
            )
        );
        let first = notes.iter().find(|n| n["review"]["cid"] == 1).unwrap();
        assert_eq!(first["by"], REVIEWER_BY);
        assert_eq!(first["author"], "Christophe Kinnard");
        assert_eq!(first["text"], "solar zenith angle");
        assert_eq!(first["review"]["fit"], "exact");
        assert_eq!(first["review"]["state"], "todo");
        assert_eq!(first["review"]["replies"][0]["author"], "Thierry");
        // la note de la figure va dans le fichier ouvert, sous la clé de l'éditeur
        assert_eq!(
            store[&format!("tex-comments:{main}")]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        let rounds = store[&done.root_key].as_array().unwrap();
        assert_eq!(rounds.len(), 1);
        assert_eq!(rounds[0]["reviewer"], "Christophe Kinnard");
        let copy = root.join(rounds[0]["copy"].as_str().unwrap());
        assert!(copy.is_file());
        let status = status_of(&store, &done.root_key);
        assert_eq!(status["counts"]["total"], 5);
        assert_eq!(status["counts"]["todo"], 5);
        assert_eq!(status["notes"].as_array().unwrap().len(), 7);
        assert_eq!(status["counts"]["edits"]["apply"], 1);
        assert_eq!(status["counts"]["edits"]["changed"], 1);
        assert_eq!(review_key(root, &main).unwrap(), done.root_key);
        // réimporter n'ajoute rien
        let again = run(root, &main, "revCK.docx", fixture_docx()).unwrap();
        assert_eq!((again.added, again.known), (0, 7));
        let store = pdf_annots::read(&root.join(".fig_thumbs")).unwrap();
        assert_eq!(store[&section].as_array().unwrap().len(), 6);
        assert_eq!(store[&done.root_key].as_array().unwrap().len(), 1);
    }

    #[test]
    fn his_edits_walk_apart_and_accept_writes_the_file() {
        let dir = project();
        let root = dir.path();
        let main = root.join("main.tex").to_string_lossy().to_string();
        let methods = root
            .join("sections/methods.tex")
            .to_string_lossy()
            .to_string();
        let done = run(root, &main, "revCK.docx", fixture_docx()).unwrap();
        let mut store = pdf_annots::read(&root.join(".fig_thumbs")).unwrap();
        let key = done.root_key.clone();
        // le parcours des retouches ne montre qu'elles, numérotées entre elles
        let first = next_of(&store, &key, "", "", "edit");
        assert_eq!(first["note"]["total"], 2);
        assert_eq!(first["note"]["edit"]["status"], "changed");
        let second = next_of(
            &store,
            &key,
            first["note"]["id"].as_str().unwrap(),
            "",
            "edit",
        );
        assert_eq!(second["note"]["n"], 2);
        assert_eq!(second["note"]["edit"]["ready"], true);
        let id = second["note"]["id"].as_str().unwrap().to_string();
        // une retouche à fusionner ne s'applique pas telle quelle
        let text = std::fs::read_to_string(&methods).unwrap();
        assert!(
            apply_edit(
                &mut store,
                &key,
                &methods,
                first["note"]["id"].as_str().unwrap(),
                &text
            )
            .is_err()
        );
        // le passage a glissé de deux lignes : retrouvé quand même
        let shifted = format!("% a\n% b\n{text}");
        let out = apply_edit(&mut store, &key, &methods, &id, &shifted).unwrap();
        assert!(
            out.contains("The model is $x = a + b$ with care fitted to all zones.\n"),
            "{out}"
        );
        assert!(out.starts_with("% a\n% b\nValues below"));
        let note = store[&format!("tex-comments:{methods}")]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] == id.as_str())
            .unwrap()
            .clone();
        assert_eq!(note["review"]["state"], "done");
        assert_eq!(note["from"]["line"], 7);
        // une seconde fois : le passage n'est plus le sien
        assert!(apply_edit(&mut store, &key, &methods, &id, &shifted).is_err());
        // à fusionner : la correction de Claude s'applique, pas sa version
        let merge = first["note"]["id"].as_str().unwrap().to_string();
        if let Some(n) = store
            .get_mut(&format!("tex-comments:{methods}"))
            .and_then(Value::as_array_mut)
            .and_then(|l| l.iter_mut().find(|n| n["id"] == merge.as_str()))
        {
            n["thread"] = json!([{"text": "Fusion.", "at": 5, "suggest": {"text": "Following \\citet{stroeve2006}, we remove images with a solar zenith angle above $70^\\circ$."}}]);
        }
        let merged = apply_edit(&mut store, &key, &methods, &merge, &out).unwrap();
        assert!(merged.contains("angle above $70^\\circ$."), "{merged}");
        // un commentaire n'est pas une retouche
        let comment = next_of(&store, &key, "", "", "")["note"]["id"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(apply_edit(&mut store, &key, &methods, &comment, &text).is_err());
    }

    #[test]
    fn utf16_positions_round_trip() {
        let text = "ab\nçé😀x\n";
        let at = offset_of(text, 1, 4).unwrap();
        assert_eq!(&text[at..], "x\n");
        assert_eq!(position_of(text, at), (1, 4));
        assert_eq!(offset_of(text, 1, 3), None);
        assert_eq!(offset_of(text, 2, 0), Some(text.len()));
    }

    #[test]
    fn import_refuses_files_outside_the_project_and_bad_docx() {
        let dir = project();
        let root = dir.path();
        let main = root.join("main.tex").to_string_lossy().to_string();
        assert_eq!(
            run(root, "/etc/passwd", "x.docx", fixture_docx())
                .err()
                .unwrap()
                .0,
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            run(root, &main, "x.docx", b"pas un zip".to_vec())
                .err()
                .unwrap()
                .0,
            StatusCode::BAD_REQUEST
        );
    }
    #[test]
    fn next_walks_the_document_and_state_only_touches_reviewer_notes() {
        let dir = project();
        let root = dir.path();
        let main = root.join("main.tex").to_string_lossy().to_string();
        let methods = root
            .join("sections/methods.tex")
            .to_string_lossy()
            .to_string();
        let done = run(root, &main, "revCK.docx", fixture_docx()).unwrap();
        let mut store = pdf_annots::read(&root.join(".fig_thumbs")).unwrap();
        let key = done.root_key.clone();
        // ordre du document : fichiers dans l'ordre de lecture, puis lignes
        let order: Vec<(String, u64)> = ordered(&store, &key)
            .iter()
            .map(|(p, n)| {
                (
                    p.clone(),
                    n.pointer("/from/line").and_then(Value::as_u64).unwrap_or(0),
                )
            })
            .collect();
        assert_eq!(order.len(), 7);
        let files = store[&key][0]["files"].as_array().unwrap().clone();
        let rank = |p: &str| files.iter().position(|f| f == p).unwrap();
        assert!(
            order
                .windows(2)
                .all(|w| (rank(&w[0].0), w[0].1) <= (rank(&w[1].0), w[1].1))
        );

        let first = next_of(&store, &key, "", "", "");
        assert_eq!(first["note"]["n"], 1);
        assert_eq!(first["note"]["total"], 5);
        assert_eq!(first["remaining"], 5);
        let first_id = first["note"]["id"].as_str().unwrap().to_string();
        let first_file = first["note"]["path"].as_str().unwrap().to_string();
        let second = next_of(&store, &key, &first_id, "", "");
        assert_eq!(second["note"]["n"], 2);
        assert_eq!(second["remaining"], 4);
        // `at` rend le commentaire demandé, quel que soit son état
        assert_eq!(
            next_of(&store, &key, "", &first_id, "")["note"]["id"],
            first_id.as_str()
        );

        // Réglé : il sort du parcours ; une note de Thierry est refusée
        assert!(
            set_state(
                &mut store,
                &key,
                &first_file,
                &first_id,
                Some("done"),
                false
            )
            .unwrap()
        );
        assert!(
            !set_state(
                &mut store,
                &key,
                &first_file,
                &first_id,
                Some("done"),
                false
            )
            .unwrap()
        );
        assert!(
            set_state(
                &mut store,
                &key,
                &first_file,
                &first_id,
                Some("fini"),
                false
            )
            .is_err()
        );
        assert!(set_state(&mut store, &key, &first_file, &first_id, None, true).unwrap());
        store
            .get_mut(&format!("tex-comments:{methods}"))
            .unwrap()
            .as_array_mut()
            .unwrap()
            .push(json!({"id": "c1", "by": "user", "text": "x", "comment": "à moi"}));
        assert!(set_state(&mut store, &key, &methods, "c1", Some("done"), false).is_err());
        assert_eq!(next_of(&store, &key, "", "", "")["note"]["n"], 2);
        assert_eq!(next_of(&store, &key, "", "", "")["remaining"], 4);

        // L'agent en juge un déjà réglé : « open » le saute, « likely » ne voit que lui
        let likely_id = second["note"]["id"].as_str().unwrap().to_string();
        let likely_file = second["note"]["path"].as_str().unwrap().to_string();
        let note = store
            .get_mut(&format!("tex-comments:{likely_file}"))
            .unwrap()
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|n| n["id"] == likely_id.as_str())
            .unwrap();
        note["review"]["likely"] =
            json!({"settled": true, "reason": "la phrase dit maintenant 70°"});
        assert_eq!(next_of(&store, &key, "", "", "open")["note"]["n"], 3);
        let only = next_of(&store, &key, "", "", "likely");
        assert_eq!(only["note"]["id"], likely_id.as_str());
        assert_eq!(only["remaining"], 1);
        assert_eq!(status_of(&store, &key)["counts"]["likely"], 1);
        let status = status_of(&store, &key);
        let first_status = status["notes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] == first_id.as_str())
            .unwrap();
        assert_eq!(first_status["chat"], true);
        assert_eq!(first_status["state"], "done");
        assert!(next_of(&store, &key, &likely_id, "", "likely")["note"].is_null());
    }
}
