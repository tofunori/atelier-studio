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
                "line": note.pointer("/from/line").and_then(Value::as_u64).map(|l| l + 1),
                "comment": note.get("comment"),
                "author": note.get("author"),
                "text": note.get("text"),
                "state": review.get("state").and_then(Value::as_str).unwrap_or("todo"),
                "kind": review.get("kind"),
                "fit": review.get("fit"),
                "rev": review.get("rev"),
                "thread": thread,
            }));
        }
    }
    let count = |state: &str| notes.iter().filter(|n| n["state"] == state).count();
    let counts = json!({
        "total": notes.len(),
        "todo": count("todo"),
        "agenda": count("agenda"),
        "done": count("done"),
        "discussing": notes.iter().filter(|n| n["state"] == "todo" && n["thread"].as_u64().unwrap_or(0) > 0).count(),
    });
    json!({"ok": true, "rounds": rounds, "notes": notes, "counts": counts})
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
            zip.start_file(rel, zip::write::SimpleFileOptions::default())
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
        assert_eq!(done.added, 5);
        assert_eq!(done.known, 0);
        let store = pdf_annots::read(&root.join(".fig_thumbs")).unwrap();
        let section = format!(
            "tex-comments:{}",
            root.join("sections/methods.tex").to_string_lossy()
        );
        let notes = store[&section].as_array().unwrap();
        assert_eq!(notes.len(), 4);
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
        assert_eq!(status["notes"].as_array().unwrap().len(), 5);
        assert_eq!(review_key(root, &main).unwrap(), done.root_key);
        // réimporter n'ajoute rien
        let again = run(root, &main, "revCK.docx", fixture_docx()).unwrap();
        assert_eq!((again.added, again.known), (0, 5));
        let store = pdf_annots::read(&root.join(".fig_thumbs")).unwrap();
        assert_eq!(store[&section].as_array().unwrap().len(), 4);
        assert_eq!(store[&done.root_key].as_array().unwrap().len(), 1);
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
}
