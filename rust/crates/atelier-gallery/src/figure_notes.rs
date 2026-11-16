//! Notes posées sur une figure dans la visionneuse : où tombe chaque marque et
//! comment le dire à l'agent.
//!
//! Le repère est celui des notes de figure du connecteur
//! (`atelier-annots-mcp/src/figures.rs`) : des fractions de l'image, origine en
//! haut à gauche. L'agent lit donc « cadre x 62–78 %, y 40–55 % » au lieu de
//! chercher à l'œil où tombe la pastille 3.
//!
//! Depuis le lot 3 (2026-11-16) les notes sont durables : elles vivent dans la
//! base de l'historique des figures (`figure_versions.rs`), rangées par
//! l'empreinte de la version où elles ont été posées. Même modèle que les
//! notes du connecteur (`id, n, kind, x, y, w, h, text, status, t`), avec un
//! troisième statut : `draft` (à envoyer), `sent` (envoyée), `done` (réglée).

use crate::{AppState, figure_versions::database, request_allowed};
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    time::{SystemTime, UNIX_EPOCH},
};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

/// Notes lues par envoi, comme `agent::normalize_notes`.
const MAX_NOTES: usize = 100;
/// Un recadrage est une petite image : au-delà, il est ignoré, la note part
/// quand même avec sa position.
const MAX_CROP_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Box,
    Ellipse,
    Arrow,
    Point,
}

/// Une marque, en fractions de l'image. Cadre et ellipse : coin haut-gauche et
/// taille. Flèche : queue en (x, y), pointe en (x + w, y + h). Point : (x, y).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Region {
    pub kind: Kind,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

fn unit(value: f64) -> f64 {
    value.clamp(0.0, 1.0)
}

impl Region {
    /// Lit `{kind, x, y, w, h}` ; `None` si la marque n'a pas de position
    /// lisible (ancien client, valeurs absentes ou non finies).
    pub fn parse(note: &Value) -> Option<Self> {
        let kind = match note.get("kind")?.as_str()? {
            "box" => Kind::Box,
            "ellipse" => Kind::Ellipse,
            "arrow" => Kind::Arrow,
            "point" => Kind::Point,
            _ => return None,
        };
        let number = |key: &str| note.get(key).and_then(Value::as_f64).filter(|v| v.is_finite());
        let (x, y) = (unit(number("x")?), unit(number("y")?));
        let (w, h) = (number("w").unwrap_or(0.0), number("h").unwrap_or(0.0));
        let (w, h) = match kind {
            Kind::Point => (0.0, 0.0),
            // La pointe d'une flèche reste dans l'image, dans les deux sens.
            Kind::Arrow => (unit(x + w) - x, unit(y + h) - y),
            Kind::Box | Kind::Ellipse => (unit(x + w.max(0.0)) - x, unit(y + h.max(0.0)) - y),
        };
        Some(Self { kind, x, y, w, h })
    }

    /// « cadre x 62–78 %, y 40–55 % » : les mots du connecteur.
    pub fn describe(self) -> String {
        let pct = |value: f64| (value * 100.0).round() as i64;
        let span = |name: &str| {
            format!(
                "{name} x {}–{} %, y {}–{} %",
                pct(self.x),
                pct(self.x + self.w),
                pct(self.y),
                pct(self.y + self.h)
            )
        };
        match self.kind {
            Kind::Box => span("cadre"),
            Kind::Ellipse => span("ellipse"),
            Kind::Arrow => format!(
                "flèche de x {} %, y {} % vers x {} %, y {} %",
                pct(self.x),
                pct(self.y),
                pct(self.x + self.w),
                pct(self.y + self.h)
            ),
            Kind::Point => format!("point x {} %, y {} %", pct(self.x), pct(self.y)),
        }
    }

    pub fn to_json(self) -> Value {
        let kind = match self.kind {
            Kind::Box => "box",
            Kind::Ellipse => "ellipse",
            Kind::Arrow => "arrow",
            Kind::Point => "point",
        };
        json!({"kind": kind, "x": self.x, "y": self.y, "w": self.w, "h": self.h})
    }
}

/// Une note telle qu'elle part à l'agent.
#[derive(Debug, Clone, PartialEq)]
pub struct SentNote {
    pub n: Value,
    pub text: String,
    pub region: Option<Region>,
    /// Recadrage de la zone, PNG décodé, à écrire à côté de l'image annotée.
    pub crop: Option<Vec<u8>>,
}

impl SentNote {
    /// Numéro de la note, s'il est entier : il nomme le fichier du recadrage.
    pub fn number(&self) -> Option<u64> {
        self.n.as_u64()
    }
}

fn crop_bytes(note: &Value) -> Option<Vec<u8>> {
    let (prefix, encoded) = note.get("crop")?.as_str()?.split_once(',')?;
    if !prefix.starts_with("data:image/png;base64") {
        return None;
    }
    let raw = BASE64.decode(encoded).ok()?;
    (!raw.is_empty() && raw.len() <= MAX_CROP_BYTES).then_some(raw)
}

/// Lit `notes` d'une requête `/save` : mêmes bornes que
/// `agent::normalize_notes` (100 notes, 2 000 caractères), plus la position et
/// le recadrage de chacune quand le client les donne.
pub fn parse(value: Option<&Value>) -> Vec<SentNote> {
    let Some(list) = value.and_then(Value::as_array) else {
        return Vec::new();
    };
    list.iter()
        .take(MAX_NOTES)
        .filter_map(|raw| {
            let text = raw.as_object()?.get("text")?.as_str()?;
            Some(SentNote {
                n: raw.get("n").cloned().unwrap_or(Value::Null),
                text: text.chars().take(2000).collect(),
                region: Region::parse(raw),
                crop: crop_bytes(raw),
            })
        })
        .collect()
}

/// Lignes « Note N : cadre … ; détail <chemin> », une par note qui a une
/// position. `crops` : chemin du recadrage écrit pour la note de même rang.
pub fn position_lines(notes: &[SentNote], crops: &[Option<String>]) -> Vec<String> {
    notes
        .iter()
        .zip(crops)
        .filter_map(|(note, crop)| {
            let region = note.region?;
            let number = note.n.to_string();
            let mut line = format!("Note {} : {}", number.trim_matches('"'), region.describe());
            if let Some(path) = crop {
                line.push_str(" ; détail ");
                line.push_str(path);
            }
            Some(line)
        })
        .collect()
}

/// Notes de l'événement lu par l'agent : `{n, text}` comme avant, plus
/// `region` et `crop` (chemin dans le projet) quand ils existent.
pub fn agent_notes(notes: &[SentNote], crops: &[Option<String>]) -> Value {
    Value::Array(
        notes
            .iter()
            .zip(crops)
            .map(|(note, crop)| {
                let mut out = json!({"n": note.n, "text": note.text});
                if let Some(region) = note.region {
                    out["region"] = region.to_json();
                }
                if let Some(path) = crop {
                    out["crop"] = json!(path);
                }
                out
            })
            .collect(),
    )
}

// ---- Notes durables -------------------------------------------------------

/// Texte d'une note gardée : comme à l'envoi.
const MAX_TEXT: usize = 2000;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

fn round4(value: f64) -> f64 {
    (value * 1e4).round() / 1e4
}

fn valid_hash(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
}

fn valid_id(id: &str) -> bool {
    (1..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b':'))
}

fn valid_status(status: &str) -> bool {
    matches!(status, "draft" | "sent" | "done")
}

/// Une note telle qu'elle est gardée avec sa version.
#[derive(Debug, Clone, PartialEq)]
struct StoredNote {
    id: String,
    n: i64,
    region: Region,
    text: String,
    status: String,
    t: i64,
    sent: Option<i64>,
    done: Option<i64>,
}

impl StoredNote {
    /// Lit une note envoyée par la visionneuse. `None` : sans identifiant,
    /// sans texte ou sans position lisible, elle n'est pas gardée.
    fn clean(raw: &Value, rank: usize, now: i64) -> Option<Self> {
        let id = raw.get("id")?.as_str()?;
        let text: String = raw.get("text")?.as_str()?.trim().chars().take(MAX_TEXT).collect();
        if !valid_id(id) || text.is_empty() {
            return None;
        }
        let region = Region::parse(raw)?;
        let region = Region {
            x: round4(region.x),
            y: round4(region.y),
            w: round4(region.w),
            h: round4(region.h),
            ..region
        };
        let time = |key: &str| raw.get(key).and_then(Value::as_i64).filter(|v| *v > 0);
        let status = raw
            .get("status")
            .and_then(Value::as_str)
            .filter(|s| valid_status(s))
            .unwrap_or("draft");
        Some(Self {
            id: id.to_string(),
            n: raw
                .get("n")
                .and_then(Value::as_i64)
                .filter(|n| (1..=999).contains(n))
                .unwrap_or(rank as i64 + 1),
            region,
            text,
            // Une note à envoyer n'a pas de date d'envoi ; une note réglée a
            // toujours la sienne.
            sent: (status != "draft").then(|| time("sentAt").unwrap_or(now)),
            done: (status == "done").then(|| time("doneAt").unwrap_or(now)),
            status: status.to_string(),
            t: time("t").unwrap_or(now),
        })
    }
}

fn kind_name(kind: Kind) -> &'static str {
    match kind {
        Kind::Box => "box",
        Kind::Ellipse => "ellipse",
        Kind::Arrow => "arrow",
        Kind::Point => "point",
    }
}

/// Notes gardées avec la version `hash`, dans l'ordre de leurs numéros.
pub(crate) fn stored(db: &Connection, hash: &str) -> Result<Vec<Value>> {
    let mut query = db.prepare_cached(
        "SELECT id, n, kind, x, y, w, h, text, status, t, sent, done FROM figure_notes
         WHERE hash=?1 ORDER BY n, t, id",
    )?;
    let rows = query.query_map([hash], |r| {
        let kind: String = r.get(2)?;
        Ok(json!({
            "id": r.get::<_, String>(0)?, "n": r.get::<_, i64>(1)?, "kind": kind,
            "x": r.get::<_, f64>(3)?, "y": r.get::<_, f64>(4)?,
            "w": r.get::<_, f64>(5)?, "h": r.get::<_, f64>(6)?,
            "text": r.get::<_, String>(7)?, "status": r.get::<_, String>(8)?,
            "t": r.get::<_, i64>(9)?,
            "sentAt": r.get::<_, Option<i64>>(10)?, "doneAt": r.get::<_, Option<i64>>(11)?,
        }))
    })?;
    let mut notes = Vec::new();
    for row in rows {
        let mut note = row?;
        // Comme le connecteur : pas de champ vide dans une note.
        for key in ["sentAt", "doneAt"] {
            if note[key].is_null() {
                note.as_object_mut().map(|o| o.remove(key));
            }
        }
        notes.push(note);
    }
    Ok(notes)
}

fn known_version(db: &Connection, hash: &str) -> Result<bool> {
    Ok(db
        .query_row("SELECT 1 FROM figure_versions WHERE hash=?1 LIMIT 1", [hash], |_| Ok(()))
        .optional()?
        .is_some())
}

/// Remplace les notes de la version `hash` par `notes` (celles de la
/// visionneuse, qui en tient la liste entière) et rend ce qui est gardé.
fn replace(db: &mut Connection, hash: &str, notes: &[Value], now: i64) -> Result<Vec<Value>> {
    if !valid_hash(hash) {
        return Err("Version inconnue".into());
    }
    let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
    if !known_version(&tx, hash)? {
        return Err("Version inconnue".into());
    }
    tx.execute("DELETE FROM figure_notes WHERE hash=?1", [hash])?;
    let mut seen = HashSet::new();
    for (rank, raw) in notes.iter().take(MAX_NOTES).enumerate() {
        let Some(note) = StoredNote::clean(raw, rank, now) else {
            continue;
        };
        if !seen.insert(note.id.clone()) {
            continue;
        }
        tx.execute(
            "INSERT INTO figure_notes VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                hash,
                note.id,
                note.n,
                kind_name(note.region.kind),
                note.region.x,
                note.region.y,
                note.region.w,
                note.region.h,
                note.text,
                note.status,
                note.t,
                note.sent,
                note.done
            ],
        )?;
    }
    let kept = stored(&tx, hash)?;
    tx.commit()?;
    Ok(kept)
}

/// Change le statut d'une note sans toucher aux autres, depuis la version
/// suivante comme depuis la sienne : `done` la dit réglée, `sent` la rouvre
/// (elle garde sa date d'envoi), `resent` la renvoie (la date d'envoi avance).
/// `Ok(None)` : la note n'existe pas, ou plus.
fn set_status(db: &Connection, hash: &str, id: &str, status: &str, now: i64) -> Result<Option<Value>> {
    if !valid_hash(hash) || !valid_id(id) {
        return Err("Statut invalide".into());
    }
    let sql = match status {
        "done" => "UPDATE figure_notes SET status='done', done=?3, sent=COALESCE(sent, ?3) WHERE hash=?1 AND id=?2",
        "sent" => "UPDATE figure_notes SET status='sent', done=NULL, sent=COALESCE(sent, ?3) WHERE hash=?1 AND id=?2",
        "resent" => "UPDATE figure_notes SET status='sent', done=NULL, sent=?3 WHERE hash=?1 AND id=?2",
        _ => return Err("Statut invalide".into()),
    };
    if db.execute(sql, params![hash, id, now])? == 0 {
        return Ok(None);
    }
    Ok(stored(db, hash)?.into_iter().find(|note| note["id"] == id))
}

#[derive(Deserialize)]
pub struct NotesBody {
    hash: String,
    notes: Vec<Value>,
}

#[derive(Deserialize)]
pub struct StatusBody {
    hash: String,
    id: String,
    status: String,
}

fn unavailable(message: &str) -> Response {
    (StatusCode::CONFLICT, Json(json!({"error": message}))).into_response()
}

/// `POST /figure-notes` : la visionneuse enregistre les notes d'une version.
pub async fn save(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<NotesBody>) -> Response {
    if !request_allowed(&headers, &state) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let kept = tokio::task::spawn_blocking(move || -> Result<Vec<Value>> {
        let mut db = database(&state.root)?;
        replace(&mut db, &body.hash, &body.notes, now_ms())
    })
    .await;
    match kept {
        Ok(Ok(notes)) => ([("Cache-Control", "no-store")], Json(json!({"notes": notes}))).into_response(),
        _ => unavailable("Notes non enregistrées : version inconnue ou stockage inaccessible."),
    }
}

/// `POST /figure-note-status` : une note est réglée, rouverte ou renvoyée.
pub async fn status(State(state): State<AppState>, headers: HeaderMap, Json(body): Json<StatusBody>) -> Response {
    if !request_allowed(&headers, &state) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let changed = tokio::task::spawn_blocking(move || -> Result<Option<Value>> {
        let db = database(&state.root)?;
        set_status(&db, &body.hash, &body.id, &body.status, now_ms())
    })
    .await;
    match changed {
        Ok(Ok(Some(note))) => ([("Cache-Control", "no-store")], Json(json!({"note": note}))).into_response(),
        Ok(Ok(None)) => StatusCode::NOT_FOUND.into_response(),
        _ => unavailable("Statut non enregistré."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn une_marque_se_dit_en_pourcentages_comme_dans_le_connecteur() {
        let read = |value: Value| Region::parse(&value).map(|region| region.describe());
        assert_eq!(
            read(json!({"kind":"box","x":0.62,"y":0.4,"w":0.16,"h":0.15})).as_deref(),
            Some("cadre x 62–78 %, y 40–55 %")
        );
        assert_eq!(
            read(json!({"kind":"ellipse","x":0.1,"y":0.2,"w":0.3,"h":0.4})).as_deref(),
            Some("ellipse x 10–40 %, y 20–60 %")
        );
        assert_eq!(
            read(json!({"kind":"point","x":0.5,"y":0.25,"w":9,"h":9})).as_deref(),
            Some("point x 50 %, y 25 %")
        );
        // Une flèche vers la gauche garde son sens : la pointe est la cible.
        assert_eq!(
            read(json!({"kind":"arrow","x":0.8,"y":0.3,"w":-0.3,"h":0.2})).as_deref(),
            Some("flèche de x 80 %, y 30 % vers x 50 %, y 50 %")
        );
    }

    #[test]
    fn une_position_reste_dans_l_image_et_une_marque_illisible_n_en_a_pas() {
        let region = Region::parse(&json!({"kind":"box","x":0.9,"y":-1,"w":0.5,"h":3})).unwrap();
        assert_eq!((region.x, region.y), (0.9, 0.0));
        assert!((region.x + region.w - 1.0).abs() < 1e-9 && (region.h - 1.0).abs() < 1e-9);
        let arrow = Region::parse(&json!({"kind":"arrow","x":0.2,"y":0.2,"w":-5,"h":5})).unwrap();
        assert_eq!((arrow.x + arrow.w, arrow.y + arrow.h), (0.0, 1.0));
        for bad in [
            json!({"x":0.1,"y":0.1}),
            json!({"kind":"star","x":0.1,"y":0.1}),
            json!({"kind":"box","x":"a","y":0.1}),
            json!({"kind":"box","y":0.1}),
        ] {
            assert_eq!(Region::parse(&bad), None, "{bad}");
        }
    }

    #[test]
    fn les_notes_gardent_les_bornes_d_avant_et_gagnent_position_et_recadrage() {
        let png = "data:image/png;base64,iVBORw0KGgo=";
        let notes = parse(Some(&json!([
            {"n":1,"text":"axe y en log","kind":"box","x":0.1,"y":0.2,"w":0.3,"h":0.4,"crop":png},
            {"n":2,"text":"sans position"},
            "pas un objet",
            {"n":3},
            {"n":4,"text":"x".repeat(2500),"kind":"point","x":0.5,"y":0.5,"crop":"data:text/plain;base64,QQ=="},
        ])));
        assert_eq!(notes.len(), 3);
        assert_eq!(notes[0].number(), Some(1));
        assert!(notes[0].crop.is_some() && notes[0].region.is_some());
        assert!(notes[1].region.is_none() && notes[1].crop.is_none());
        assert_eq!(notes[2].text.chars().count(), 2000);
        assert!(notes[2].crop.is_none(), "un recadrage qui n'est pas un PNG est ignoré");

        let crops = vec![Some("a/b_note1.png".to_string()), None, None];
        assert_eq!(
            position_lines(&notes, &crops),
            vec![
                "Note 1 : cadre x 10–40 %, y 20–60 % ; détail a/b_note1.png".to_string(),
                "Note 4 : point x 50 %, y 50 %".to_string(),
            ]
        );
        let sent = agent_notes(&notes, &crops);
        assert_eq!(sent[0]["crop"], "a/b_note1.png");
        assert_eq!(sent[0]["region"]["kind"], "box");
        assert_eq!(sent[1], json!({"n":2,"text":"sans position"}));
    }

    fn version(db: &Connection, hash: &str) {
        db.execute(
            "INSERT INTO figure_versions VALUES (?1, 1, ?2, 1, 'image/png', x'00')",
            params![format!("/figure-{hash}.png"), hash],
        )
        .unwrap();
    }

    #[test]
    fn les_notes_restent_avec_leur_version_et_survivent_a_la_reouverture() {
        let root = tempfile::tempdir().unwrap();
        let (v4, v5) = ("a".repeat(64), "b".repeat(64));
        let mut db = database(root.path()).unwrap();
        version(&db, &v4);
        version(&db, &v5);
        let kept = replace(
            &mut db,
            &v4,
            &[
                json!({"id":"n-1","n":1,"kind":"box","x":0.62004,"y":0.4,"w":0.16,"h":0.15,"text":"  Étiqueter le creux  ","t":10}),
                json!({"id":"n-2","n":2,"kind":"arrow","x":0.8,"y":0.3,"w":-0.3,"h":0.2,"text":"Barres en orange","status":"sent","t":11,"sentAt":20}),
                json!({"id":"n-2","n":3,"kind":"point","x":0.1,"y":0.1,"text":"doublon","t":12}),
                json!({"id":"sans texte","n":4,"kind":"point","x":0.1,"y":0.1,"text":"x"}),
                json!({"id":"n-5","n":5,"kind":"point","x":0.1,"y":0.1,"text":"   "}),
                json!({"id":"n-6","n":6,"text":"sans position"}),
            ],
            99,
        )
        .unwrap();
        assert_eq!(kept.len(), 2, "doublon, identifiant invalide, texte vide et note sans position sont écartés");
        assert_eq!(
            kept[0],
            json!({"id":"n-1","n":1,"kind":"box","x":0.62,"y":0.4,"w":0.16,"h":0.15,"text":"Étiqueter le creux","status":"draft","t":10})
        );
        assert_eq!(kept[1]["status"], "sent");
        assert_eq!(kept[1]["sentAt"], 20);
        assert_eq!((kept[1]["w"].as_f64(), kept[1]["h"].as_f64()), (Some(-0.3), Some(0.2)));
        drop(db);

        // Une autre vue, plus tard : les notes sont là, sur v4 seulement.
        let db = database(root.path()).unwrap();
        assert_eq!(stored(&db, &v4).unwrap(), kept);
        assert!(stored(&db, &v5).unwrap().is_empty());
    }

    #[test]
    fn enregistrer_remplace_la_liste_et_refuse_une_version_inconnue() {
        let root = tempfile::tempdir().unwrap();
        let hash = "c".repeat(64);
        let mut db = database(root.path()).unwrap();
        version(&db, &hash);
        let note = |id: &str, n: i64| json!({"id":id,"n":n,"kind":"point","x":0.5,"y":0.5,"text":format!("note {n}")});
        replace(&mut db, &hash, &[note("a", 1), note("b", 2)], 1).unwrap();
        let kept = replace(&mut db, &hash, &[note("b", 1)], 2).unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0]["id"], "b");
        assert!(replace(&mut db, &"d".repeat(64), &[note("a", 1)], 3).is_err());
        assert!(replace(&mut db, "pas une empreinte", &[], 3).is_err());
        assert_eq!(stored(&db, &hash).unwrap().len(), 1, "un refus ne touche à rien");
        assert!(replace(&mut db, &hash, &[], 4).unwrap().is_empty());
    }

    #[test]
    fn une_note_se_regle_se_rouvre_et_se_renvoie_sans_toucher_aux_autres() {
        let root = tempfile::tempdir().unwrap();
        let hash = "e".repeat(64);
        let mut db = database(root.path()).unwrap();
        version(&db, &hash);
        replace(
            &mut db,
            &hash,
            &[
                json!({"id":"a","n":1,"kind":"point","x":0.5,"y":0.5,"text":"un","status":"sent","sentAt":100}),
                json!({"id":"b","n":2,"kind":"point","x":0.5,"y":0.5,"text":"deux","status":"sent","sentAt":100}),
            ],
            100,
        )
        .unwrap();
        let done = set_status(&db, &hash, "a", "done", 200).unwrap().unwrap();
        assert_eq!((done["status"].as_str(), done["doneAt"].as_i64(), done["sentAt"].as_i64()), (Some("done"), Some(200), Some(100)));
        let reopened = set_status(&db, &hash, "a", "sent", 300).unwrap().unwrap();
        assert_eq!(reopened["status"], "sent");
        assert!(reopened.get("doneAt").is_none());
        assert_eq!(reopened["sentAt"], 100, "rouvrir ne change pas la date d'envoi");
        let resent = set_status(&db, &hash, "a", "resent", 400).unwrap().unwrap();
        assert_eq!((resent["status"].as_str(), resent["sentAt"].as_i64()), (Some("sent"), Some(400)));
        assert_eq!(stored(&db, &hash).unwrap()[1]["sentAt"], 100, "l'autre note n'a pas bougé");
        assert_eq!(set_status(&db, &hash, "absente", "done", 500).unwrap(), None);
        assert!(set_status(&db, &hash, "a", "draft", 500).is_err());
        assert!(set_status(&db, &hash, "a b", "done", 500).is_err());
    }
}
