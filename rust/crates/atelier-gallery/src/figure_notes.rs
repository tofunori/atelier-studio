//! Notes posées sur une figure dans la visionneuse : où tombe chaque marque et
//! comment le dire à l'agent.
//!
//! Le repère est celui des notes de figure du connecteur
//! (`atelier-annots-mcp/src/figures.rs`) : des fractions de l'image, origine en
//! haut à gauche. L'agent lit donc « cadre x 62–78 %, y 40–55 % » au lieu de
//! chercher à l'œil où tombe la pastille 3.

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde_json::{Value, json};

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
}
