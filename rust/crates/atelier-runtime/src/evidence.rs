//! Store d'épingles « Preuves » par projet — `app_dir/evidence/<sha256(project_root)>.json`.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use crate::atomic::write_file_atomic;

/// Une épingle : un passage cité (quote), soit d'un PDF Zotero (`source:
/// "zotero"`, champs `zotero_key`/`pdf_key`/`pdf_file`/`page` renseignés),
/// soit d'une page du dépôt gbrain (`source: "gbrain"`, `gbrain_slug`
/// renseigné, champs zotero vides) — éventuellement reliée à un extrait de la
/// Lecture/de l'éditeur de code (`supports`).
///
/// `source` par défaut à `"zotero"` à la désérialisation : les épingles v1
/// (avant la tâche 6) n'ont jamais eu ce champ sur disque, et doivent
/// continuer à se lire comme des passages Zotero. Les champs zotero sont
/// `#[serde(default)]` (chaîne vide / 0) pour tolérer leur absence côté
/// gbrain — `EvidencePin` reste néanmoins stricte sur `quote`/`cite_label`
/// (la validation par source vit dans `ws_router::handle_pin_passage`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EvidencePin {
    pub id: String,
    pub ts: u64,
    pub quote: String,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default)]
    pub zotero_key: String,
    #[serde(default)]
    pub pdf_key: String,
    #[serde(default)]
    pub pdf_file: String,
    #[serde(default)]
    pub page: u32,
    pub cite_label: String,
    #[serde(default)]
    pub gbrain_slug: Option<String>,
    pub supports: Option<EvidenceSupports>,
    pub thread_id: Option<String>,
    pub provider: Option<String>,
}

/// Valeur par défaut de `EvidencePin.source` à la désérialisation — épingles
/// v1 (sans ce champ sur disque) : toujours Zotero.
pub fn default_source() -> String {
    "zotero".to_string()
}

/// Valide un `gbrain_slug` — MÊME RÈGLE que `parseGbrainPassageRef` côté
/// TypeScript (`src/components/chat/md.tsx`) : le backend ne doit jamais
/// accepter ce que le frontend refuse. Les slugs gbrain réels sont
/// hiérarchiques (`papers/acp-19-1393-2019`) et parfois riches en points
/// (`articles/bair-e.-h.-stillinger`) — segments `[A-Za-z0-9._-]+` séparés
/// par `/`, sans slash de tête ni de queue, aucun segment vide, aucun
/// segment `.`/`..` (garde anti-traversée), longueur totale ≤ 200.
///
/// PAS le même validateur que `atelier_kb::gbrain::is_valid_gbrain_slug`
/// (docs/CONTRATS_KB_RUST.md) : celui-ci garde la LECTURE d'un lien de
/// passage déjà émis (`#atelier-gbrain-passage?slug=…`, traversée interdite)
/// ; celui de `atelier-kb` valide le slug CIBLE d'une ÉCRITURE
/// (`promote-page --slug`, `article-write --slug`), miroir exact de
/// `GBRAIN_SLUG_RE` côté Node (`sidecar/knowledge.mjs`) qui, lui, n'exclut
/// PAS `..`/segments vides — le fusionner romprait la parité Node de la KB.
/// Voir `tests::deux_validateurs_de_slug_gbrain_sont_distincts_par_design`
/// (ci-dessous) pour la frontière exacte entre les deux.
pub fn is_valid_gbrain_slug(slug: &str) -> bool {
    if slug.is_empty() || slug.len() > 200 {
        return false;
    }
    if slug.starts_with('/') || slug.ends_with('/') {
        return false;
    }
    slug.split('/').all(|seg| {
        seg != "."
            && seg != ".."
            && !seg.is_empty()
            && seg.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
    })
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
/// `id` vide → uuid généré ; `ts` à 0 → horodatage courant. Dédup PAR SOURCE
/// (ré-épingler le même passage ne duplique pas, il remonte en tête — le
/// doublon précédent est retiré) : Zotero sur `(pdf_key, page, quote)`,
/// gbrain sur `(gbrain_slug, quote)`. Les deux sources ne se confondent
/// jamais entre elles.
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
    let is_gbrain = pin.source == "gbrain";
    pins.retain(|p| {
        if (p.source == "gbrain") != is_gbrain {
            return true;
        }
        if is_gbrain {
            !(p.gbrain_slug == pin.gbrain_slug && p.quote == pin.quote)
        } else {
            !(p.pdf_key == pin.pdf_key && p.page == pin.page && p.quote == pin.quote)
        }
    });
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
            source: "zotero".into(),
            zotero_key: "ABC123".into(),
            pdf_key: "PDF456".into(),
            pdf_file: "Williamson 2021.pdf".into(),
            page: 7,
            cite_label: "Williamson 2021".into(),
            gbrain_slug: None,
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
    fn evidence_pin_deserializes_legacy_json_without_source_field() {
        // épingles v1 (avant la tâche 6) : pas de champ "source" du tout —
        // doit désérialiser en "zotero" par défaut, gbrainSlug à None.
        let json = r#"{
            "id":"p1","ts":1,"quote":"q",
            "zoteroKey":"Z","pdfKey":"P","pdfFile":"a.pdf","page":3,"citeLabel":"C",
            "supports":null,"threadId":null,"provider":null
        }"#;
        let pin: EvidencePin = serde_json::from_str(json).unwrap();
        assert_eq!(pin.source, "zotero");
        assert_eq!(pin.gbrain_slug, None);
        assert_eq!(pin.zotero_key, "Z");
    }

    #[test]
    fn is_valid_gbrain_slug_accepts_real_hierarchical_slugs() {
        assert!(is_valid_gbrain_slug("papers/acp-19-1393-2019"));
        assert!(is_valid_gbrain_slug("articles/bair-e.-h.-stillinger"));
        assert!(is_valid_gbrain_slug("williamson-2021-fire-aerosol"));
    }

    #[test]
    fn is_valid_gbrain_slug_rejects_path_traversal_and_malformed_input() {
        assert!(!is_valid_gbrain_slug(""));
        assert!(!is_valid_gbrain_slug("a/../b"), "remontée de répertoire");
        assert!(!is_valid_gbrain_slug("a/./b"), "segment .");
        assert!(!is_valid_gbrain_slug(".."));
        assert!(!is_valid_gbrain_slug("/tete"), "slash de tête");
        assert!(!is_valid_gbrain_slug("fin/"), "slash de queue");
        assert!(!is_valid_gbrain_slug("a//b"), "segment vide");
        assert!(!is_valid_gbrain_slug("a b"), "espace hors alphabet");
        assert!(!is_valid_gbrain_slug(&"a".repeat(201)), "> 200 caractères");
    }

    // Note de passation (2026-08-16, plan 065 vague 5) : « trois
    // implémentations de validation de slug gbrain = interdit » — ce test
    // vérifie qu'il n'y EN A PAS trois. `atelier_kb::gbrain::is_valid_gbrain_slug`
    // (miroir de `GBRAIN_SLUG_RE`, sidecar/knowledge.mjs) et
    // `evidence::is_valid_gbrain_slug` (miroir de `parseGbrainPassageRef`,
    // src/components/chat/md.tsx) sont les deux SEULES implémentations Rust,
    // une par concern (écriture d'un slug cible vs lecture d'un lien de
    // passage déjà émis) — chacune avec son propre mirror source de vérité
    // (Node pour la première, TS pour la seconde). Les fusionner *romprait*
    // la parité Node de la KB : ce test fige la frontière (où elles
    // divergent PAR CONCEPTION) pour qu'un futur refactor ne les confonde
    // pas silencieusement.
    #[test]
    fn deux_validateurs_de_slug_gbrain_sont_distincts_par_design() {
        use atelier_kb::gbrain::is_valid_gbrain_slug as kb_write_slug;
        use is_valid_gbrain_slug as evidence_read_slug;

        // Accord sur les cas réels usuels (les deux acceptent).
        for slug in ["papers/acp-19-1393-2019", "articles/aoki-2022-melting-alpine-glaciers-under"] {
            assert!(kb_write_slug(slug) && evidence_read_slug(slug), "cas réel accepté par les deux: {slug}");
        }

        // Divergence délibérée : `evidence` (lecture d'un lien déjà émis)
        // garde contre la traversée et les segments vides — `atelier-kb`
        // (validation d'un --slug d'écriture, miroir Node) ne le fait PAS,
        // parce que Node ne le fait pas non plus (GBRAIN_SLUG_RE : premier
        // caractère alnum exigé, mais rien n'interdit `..`, un segment vide
        // ou un `/` de queue ensuite).
        for slug in ["a/../b", "a/./b", "a//b", "fin/"] {
            assert!(
                kb_write_slug(slug) && !evidence_read_slug(slug),
                "{slug}: attendu accepté en écriture (parité Node) mais rejeté en lecture (anti-traversée) — \
                 si ce n'est plus vrai, un des deux validateurs a changé sans mise à jour de ce test"
            );
        }

        // Accord (les deux rejettent) : un slash de tête casse même la
        // contrainte "premier caractère alphanumérique" de GBRAIN_SLUG_RE —
        // ce n'est PAS une divergence, juste une coïncidence de résultat.
        assert!(!kb_write_slug("/tete") && !evidence_read_slug("/tete"));
    }

    #[test]
    fn add_pin_gbrain_dedups_on_slug_and_quote_not_pdf_key() {
        let dir = std::env::temp_dir().join(format!("evidence-test-gbrain-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let pin = EvidencePin {
            id: String::new(),
            ts: 0,
            quote: "fire aerosol deposition reduces albedo".into(),
            source: "gbrain".into(),
            zotero_key: String::new(),
            pdf_key: String::new(),
            pdf_file: String::new(),
            page: 0,
            cite_label: "Williamson 2021 Fire Aerosol".into(),
            gbrain_slug: Some("williamson-2021-fire-aerosol".into()),
            supports: None,
            thread_id: None,
            provider: None,
        };
        let pins = add_pin(&dir, "/proj/g", pin.clone()).unwrap();
        assert_eq!(pins.len(), 1);
        assert_eq!(pins[0].source, "gbrain");
        assert_eq!(pins[0].gbrain_slug.as_deref(), Some("williamson-2021-fire-aerosol"));
        // dédup sur (gbrain_slug, quote), pas (pdf_key vide, page 0, quote) : toujours 1
        assert_eq!(add_pin(&dir, "/proj/g", pin.clone()).unwrap().len(), 1);

        // un pin zotero avec des champs zotero vides et la même quote ne se
        // confond pas avec le pin gbrain (sources distinctes → pas de dédup croisé)
        let zotero_empty = EvidencePin {
            source: "zotero".into(),
            gbrain_slug: None,
            id: String::new(),
            ts: 0,
            ..pin
        };
        let pins = add_pin(&dir, "/proj/g", zotero_empty).unwrap();
        assert_eq!(pins.len(), 2, "sources distinctes : pas de dédup croisé");
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
