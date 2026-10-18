//! Fiches d'hôte (plan rattrapage-claude-science, lot 4a) : ce que l'agent
//! doit savoir avant d'écrire une tâche pour le NAS, Narval ou Rorqual
//! (ressources, venvs, pièges, quotas), plus le réglage « Lancer sans
//! demander » de chaque hôte.
//!
//! Le fichier `compute_hosts.json` du dossier de l'app n'a qu'un écrivain :
//! le serveur. Les fiches peuvent être importées de Claude Science, dont la
//! base (`compute_providers.memory_md`) est ouverte en LECTURE SEULE, sans
//! copie, jamais écrite.

use super::submit::Target;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "compute_hosts.json";
pub const NOTES_MAX: usize = 32 * 1024;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HostSheet {
    pub notes: String,
    /// `claude-science:<nom>` quand la fiche vient d'un import.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Coché depuis la carte (« Toujours pour cet hôte ») ou décoché dans
    /// Calculs › Hôtes. Faux par défaut : chaque tâche attend son clic.
    pub auto_launch: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct HostBook {
    pub hosts: BTreeMap<String, HostSheet>,
}

impl HostBook {
    pub fn path(app_dir: &Path) -> PathBuf {
        app_dir.join(FILE_NAME)
    }

    /// Fichier absent ou abîmé → carnet vide (jamais d'erreur bloquante).
    pub fn load(app_dir: &Path) -> Self {
        std::fs::read_to_string(Self::path(app_dir))
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, app_dir: &Path) -> std::io::Result<()> {
        let path = Self::path(app_dir);
        let tmp = path.with_extension("json.tmp");
        std::fs::create_dir_all(app_dir)?;
        std::fs::write(&tmp, serde_json::to_vec_pretty(self).unwrap_or_default())?;
        std::fs::rename(tmp, path)
    }

    pub fn sheet(&self, host: Target) -> HostSheet {
        self.hosts.get(host.as_str()).cloned().unwrap_or_default()
    }

    pub fn auto_launch(&self, host: Target) -> bool {
        self.hosts.get(host.as_str()).is_some_and(|s| s.auto_launch)
    }

    pub fn set_notes(&mut self, host: Target, notes: &str, source: Option<String>, now: &str) {
        let sheet = self.hosts.entry(host.as_str().into()).or_default();
        sheet.notes = clamp_notes(notes);
        sheet.source = source;
        sheet.updated_at = Some(now.into());
    }

    pub fn set_auto_launch(&mut self, host: Target, on: bool) {
        self.hosts.entry(host.as_str().into()).or_default().auto_launch = on;
    }
}

fn clamp_notes(notes: &str) -> String {
    let mut out: String = notes.chars().filter(|c| *c == '\n' || *c == '\t' || !c.is_control()).collect();
    if out.len() > NOTES_MAX {
        let mut cut = NOTES_MAX;
        while !out.is_char_boundary(cut) {
            cut -= 1;
        }
        out.truncate(cut);
    }
    out.trim().to_string()
}

/// Fiche lue dans Claude Science, avec l'hôte d'Atelier qu'elle décrit.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSheet {
    pub host: Target,
    /// Nom côté Claude Science (`ssh:narval-science`).
    pub name: String,
    pub notes: String,
}

/// `ssh:nas-science` → NAS, `ssh:narval-science` → Narval… Les fournisseurs
/// sans équivalent (Modal) sont ignorés.
pub fn target_for_provider(name: &str) -> Option<Target> {
    let lower = name.to_ascii_lowercase();
    let bare = lower.split(':').next_back().unwrap_or(&lower);
    [Target::Narval, Target::Rorqual, Target::Nas]
        .into_iter()
        .find(|t| bare.split(['-', '_', '.']).any(|part| part == t.as_str()))
}

/// `data_dir` de `~/.claude-science/config.toml`, sinon le dossier par défaut.
pub fn claude_science_data_dir(home: &Path) -> PathBuf {
    let from_config = std::fs::read_to_string(home.join(".claude-science").join("config.toml"))
        .ok()
        .and_then(|config| {
            config
                .lines()
                .take_while(|line| !line.trim_start().starts_with('['))
                .find_map(|line| {
                    let (key, value) = line.split_once('=')?;
                    (key.trim() == "data_dir").then(|| value.trim().trim_matches(['"', '\'']).to_string())
                })
        })
        .filter(|dir| !dir.is_empty());
    match from_config {
        Some(dir) if dir == "~" => home.to_path_buf(),
        Some(dir) => dir.strip_prefix("~/").map(|rest| home.join(rest)).unwrap_or_else(|| PathBuf::from(dir)),
        None => home.join("Documents").join("Claude Science"),
    }
}

/// Base de l'organisation la plus récemment modifiée.
pub fn find_claude_science_db(data_dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(data_dir.join("orgs"))
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("operon-cli.db"))
        .filter(|db| db.is_file())
        .max_by_key(|db| std::fs::metadata(db).and_then(|m| m.modified()).ok())
}

/// Lit les fiches d'hôte d'une base `operon-cli.db`, en lecture seule.
pub fn read_claude_science_sheets(db: &Path) -> Result<Vec<ImportedSheet>, String> {
    let conn = Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)
        .map_err(|e| format!("base Claude Science illisible : {e}"))?;
    let _ = conn.busy_timeout(std::time::Duration::from_secs(3));
    let mut stmt = conn
        .prepare("SELECT name, memory_md FROM compute_providers WHERE enabled != 0 ORDER BY name")
        .map_err(|e| format!("table compute_providers absente ou illisible : {e}"))?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let mut sheets: Vec<ImportedSheet> = Vec::new();
    for (name, notes) in rows {
        let Some(host) = target_for_provider(&name) else { continue };
        let notes = clamp_notes(&notes.unwrap_or_default());
        if notes.is_empty() || sheets.iter().any(|s| s.host == host) {
            continue;
        }
        sheets.push(ImportedSheet { host, name, notes });
    }
    Ok(sheets)
}

/// Import complet depuis le dossier personnel.
pub fn import_claude_science_sheets(home: &Path) -> Result<Vec<ImportedSheet>, String> {
    let data_dir = claude_science_data_dir(home);
    let db = find_claude_science_db(&data_dir)
        .ok_or_else(|| format!("aucune base Claude Science dans {}", data_dir.join("orgs").display()))?;
    read_claude_science_sheets(&db)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_fournisseurs_de_claude_science_trouvent_leur_hote() {
        assert_eq!(target_for_provider("ssh:nas-science"), Some(Target::Nas));
        assert_eq!(target_for_provider("ssh:narval-science"), Some(Target::Narval));
        assert_eq!(target_for_provider("ssh:rorqual-science"), Some(Target::Rorqual));
        assert_eq!(target_for_provider("byoc:modal"), None);
        assert_eq!(target_for_provider("ssh:canasta"), None, "un mot entier, pas une sous-chaîne");
    }

    #[test]
    fn la_base_est_lue_sans_etre_modifiee() {
        let home = tempfile::tempdir().unwrap();
        let data = home.path().join("Science");
        std::fs::create_dir_all(home.path().join(".claude-science")).unwrap();
        std::fs::write(
            home.path().join(".claude-science/config.toml"),
            "data_dir = \"~/Science\"\n[ui]\ndata_dir = \"ignoré\"\n",
        )
        .unwrap();
        let org = data.join("orgs/ccb04172");
        std::fs::create_dir_all(&org).unwrap();
        let db = org.join("operon-cli.db");
        let conn = Connection::open(&db).unwrap();
        conn.execute_batch(
            "CREATE TABLE compute_providers (name TEXT PRIMARY KEY, family TEXT, memory_md TEXT DEFAULT '', enabled INTEGER DEFAULT 1);
             INSERT INTO compute_providers VALUES ('ssh:nas-science','ssh','## Resources\ncpus: 16',1);
             INSERT INTO compute_providers VALUES ('ssh:narval-science','ssh','## Slurm\naccounts: def-x_cpu',1);
             INSERT INTO compute_providers VALUES ('ssh:rorqual-science','ssh','',1);
             INSERT INTO compute_providers VALUES ('byoc:modal','byoc','gpu',1);",
        )
        .unwrap();
        drop(conn);
        let before = std::fs::read(&db).unwrap();
        let sheets = import_claude_science_sheets(home.path()).unwrap();
        assert_eq!(std::fs::read(&db).unwrap(), before, "base intacte");
        let hosts: Vec<Target> = sheets.iter().map(|s| s.host).collect();
        assert_eq!(hosts, vec![Target::Narval, Target::Nas], "fiche vide et Modal ignorées, ordre des noms");
        assert_eq!(sheets[0].notes, "## Slurm\naccounts: def-x_cpu");
        assert!(import_claude_science_sheets(&home.path().join("ailleurs")).unwrap_err().contains("aucune base"));
    }

    #[test]
    fn le_carnet_garde_fiches_et_accords_permanents() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(HostBook::load(dir.path()), HostBook::default());
        let mut book = HostBook::default();
        book.set_notes(Target::Narval, "  venv: ~/envs/albedo\u{7}\n", Some("claude-science:ssh:narval-science".into()), "2026-10-18T03:00:00Z");
        book.set_auto_launch(Target::Nas, true);
        book.save(dir.path()).unwrap();
        let back = HostBook::load(dir.path());
        assert_eq!(back.sheet(Target::Narval).notes, "venv: ~/envs/albedo", "caractères de contrôle retirés");
        assert!(back.auto_launch(Target::Nas));
        assert!(!back.auto_launch(Target::Narval));
        std::fs::write(HostBook::path(dir.path()), "{pas du json").unwrap();
        assert_eq!(HostBook::load(dir.path()), HostBook::default());
        let long = "é".repeat(NOTES_MAX);
        assert!(clamp_notes(&long).len() <= NOTES_MAX);
    }
}
