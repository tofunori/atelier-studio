//! Store d'épingles « Preuves » par projet — `app_dir/evidence/<sha256(project_root)>.json`.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::atomic::write_file_atomic;

/// Une épingle : un passage cité (quote) d'un PDF Zotero, éventuellement relié
/// à un extrait de la Lecture/de l'éditeur de code (`supports`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePin {
    pub id: String,
    pub ts: u64,
    pub quote: String,
    pub zotero_key: String,
    pub pdf_key: String,
    pub pdf_file: String,
    pub page: u32,
    pub cite_label: String,
    pub supports: Option<EvidenceSupports>,
    pub thread_id: Option<String>,
    pub provider: Option<String>,
}

/// Extrait de contexte (sélection Lecture/éditeur) appuyant l'épingle.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSupports {
    pub text: String,
    pub file: Option<String>,
    pub lines: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct EvidenceFile {
    version: u32,
    pins: Vec<EvidencePin>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `app_dir/evidence/<sha256(project_root)>.json`.
fn store_path(app_dir: &Path, project_root: &str) -> PathBuf {
    let hash = format!("{:x}", Sha256::digest(project_root.as_bytes()));
    app_dir.join("evidence").join(format!("{hash}.json"))
}

/// Charge les épingles du projet. Tolérant : fichier absent ou corrompu → vide.
fn load(app_dir: &Path, project_root: &str) -> Vec<EvidencePin> {
    let path = store_path(app_dir, project_root);
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    match serde_json::from_str::<EvidenceFile>(&raw) {
        Ok(f) => f.pins,
        Err(_) => Vec::new(),
    }
}

/// Trie ts desc et écrit atomiquement.
fn save(
    app_dir: &Path,
    project_root: &str,
    mut pins: Vec<EvidencePin>,
) -> std::io::Result<Vec<EvidencePin>> {
    pins.sort_by(|a, b| b.ts.cmp(&a.ts));
    let file = EvidenceFile {
        version: 1,
        pins: pins.clone(),
    };
    let data = serde_json::to_vec_pretty(&file)
        .unwrap_or_else(|_| b"{\"version\":1,\"pins\":[]}".to_vec());
    write_file_atomic(&store_path(app_dir, project_root), data)?;
    Ok(pins)
}

/// Liste les épingles du projet, triées ts desc.
pub fn list_pins(app_dir: &Path, project_root: &str) -> Vec<EvidencePin> {
    let mut pins = load(app_dir, project_root);
    pins.sort_by(|a, b| b.ts.cmp(&a.ts));
    pins
}

/// Ajoute (ou fait remonter en tête si déjà épinglé) une épingle pour le projet.
///
/// `id` vide → uuid généré ; `ts` à 0 → horodatage courant. Dédup sur
/// `(pdf_key, page, quote)` : ré-épingler le même passage ne duplique pas,
/// il remonte en tête (le doublon précédent est retiré).
pub fn add_pin(
    app_dir: &Path,
    project_root: &str,
    mut pin: EvidencePin,
) -> std::io::Result<Vec<EvidencePin>> {
    if pin.id.is_empty() {
        pin.id = Uuid::new_v4().to_string();
    }
    if pin.ts == 0 {
        pin.ts = now_ms();
    }
    let mut pins = load(app_dir, project_root);
    pins.retain(|p| !(p.pdf_key == pin.pdf_key && p.page == pin.page && p.quote == pin.quote));
    pins.push(pin);
    save(app_dir, project_root, pins)
}

/// Retire une épingle par id.
pub fn remove_pin(
    app_dir: &Path,
    project_root: &str,
    pin_id: &str,
) -> std::io::Result<Vec<EvidencePin>> {
    let mut pins = load(app_dir, project_root);
    pins.retain(|p| p.id != pin_id);
    save(app_dir, project_root, pins)
}

#[derive(Debug, Deserialize)]
struct FigSelectionRaw {
    #[serde(default)]
    text: String,
    #[serde(default)]
    rel: String,
    #[serde(default)]
    lines: Option<String>,
    #[serde(default)]
    ts: u64,
}

/// Parse pur (testable) du contenu de `~/.claude/fig-selection.json`.
///
/// Retourne `None` si `text` est vide ou si `ts` (en millisecondes) est plus
/// vieux que `max_age_secs` par rapport à `now_ms`.
pub fn parse_fig_selection(json: &str, max_age_secs: u64, now_ms: u64) -> Option<EvidenceSupports> {
    let raw: FigSelectionRaw = serde_json::from_str(json).ok()?;
    if raw.text.trim().is_empty() {
        return None;
    }
    let max_age_ms = max_age_secs.saturating_mul(1000);
    if now_ms.saturating_sub(raw.ts) > max_age_ms {
        return None;
    }
    Some(EvidenceSupports {
        text: raw.text,
        file: if raw.rel.is_empty() {
            None
        } else {
            Some(raw.rel)
        },
        lines: raw.lines,
    })
}

/// Lit `~/.claude/fig-selection.json` et retourne les `supports` si présents,
/// non vides, et pas plus vieux que `max_age_secs` (appelant : 900).
pub fn fig_selection_supports(max_age_secs: u64) -> Option<EvidenceSupports> {
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let path = home.join(".claude").join("fig-selection.json");
    let raw = std::fs::read_to_string(path).ok()?;
    parse_fig_selection(&raw, max_age_secs, now_ms())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_list_remove_roundtrip() {
        let dir = std::env::temp_dir().join(format!("evidence-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let pin = EvidencePin {
            id: String::new(),
            ts: 0,
            quote: "reducing summer albedo by 0.05".into(),
            zotero_key: "ABC123".into(),
            pdf_key: "PDF456".into(),
            pdf_file: "Williamson 2021.pdf".into(),
            page: 7,
            cite_label: "Williamson 2021".into(),
            supports: Some(EvidenceSupports {
                text: "Les aérosols abaissent l'albédo.".into(),
                file: Some("intro.tex".into()),
                lines: Some("L42".into()),
            }),
            thread_id: None,
            provider: Some("claude".into()),
        };
        let pins = add_pin(&dir, "/proj/a", pin.clone()).unwrap();
        assert_eq!(pins.len(), 1);
        assert!(!pins[0].id.is_empty() && pins[0].ts > 0);
        // dédup : même (pdf_key, page, quote) → toujours 1
        assert_eq!(add_pin(&dir, "/proj/a", pin).unwrap().len(), 1);
        // isolation par projet
        assert!(list_pins(&dir, "/proj/b").is_empty());
        let id = list_pins(&dir, "/proj/a")[0].id.clone();
        assert!(remove_pin(&dir, "/proj/a", &id).unwrap().is_empty());
    }

    #[test]
    fn fig_selection_stale_returns_none() {
        // pas de fichier / ts périmé → None (on ne peut pas écrire dans ~/.claude
        // depuis le test : couvrir le chemin "absent" suffit ici, le parsing est
        // couvert par un test unitaire de parse_fig_selection sur une chaîne)
        let parsed = parse_fig_selection(
            r#"{"text":"phrase","rel":"intro.tex","lines":"L42","ts":0}"#,
            900,
            10_000_000_000,
        );
        assert!(parsed.is_none()); // ts=0 trop vieux vs now=10^10 ms
        let fresh = parse_fig_selection(
            r#"{"text":"phrase","rel":"intro.tex","lines":"L42","ts":9999999999000}"#,
            900,
            9_999_999_999_500,
        );
        assert_eq!(fresh.unwrap().text, "phrase");
    }
}
