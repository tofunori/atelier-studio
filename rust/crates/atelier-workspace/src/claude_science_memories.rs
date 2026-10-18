//! Souvenirs de Claude Science, lus en LECTURE SEULE pour l'import dans la
//! mémoire d'Atelier (Réglages › Mémoire, chantier 3 du plan
//! rattrapage-claude-science-2026-10-18).
//!
//! Même base que les spécialistes (`claude_science.rs`) : table `memories`
//! (`body`, `subject_project_id`, `evidence`, `superseded_by`, `created_at`
//! en millisecondes) et `projects` pour leur nom. Seuls les souvenirs encore
//! actifs (`superseded_by IS NULL`) sont rendus. On n'y écrit jamais.

use crate::claude_science::{claude_science_data_dir, find_claude_science_db};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeScienceMemoryProject {
    /// `projects.id` ; vide pour les souvenirs sans projet.
    pub id: String,
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeScienceMemoryOverview {
    pub base: String,
    pub projects: Vec<ClaudeScienceMemoryProject>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaudeScienceMemory {
    pub id: String,
    pub body: String,
    /// Vide quand le souvenir n'a pas de projet.
    pub project_id: String,
    pub project_name: Option<String>,
    pub evidence: Option<String>,
    /// ISO 8601, comme les dates d'Atelier.
    pub created_at: String,
}

fn ouvrir(base: &Path) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(
        base,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("base Claude Science illisible : {e}"))?;
    let _ = conn.busy_timeout(std::time::Duration::from_secs(3));
    let a_la_table = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='memories'",
            [],
            |_| Ok(()),
        )
        .is_ok();
    if !a_la_table {
        return Err("base Claude Science sans table memories".into());
    }
    Ok(conn)
}

fn base_de(home: &Path) -> Result<PathBuf, String> {
    let data_dir = claude_science_data_dir(home);
    find_claude_science_db(&data_dir).ok_or_else(|| {
        format!(
            "Aucune base Claude Science trouvée dans {}",
            data_dir.join("orgs").display()
        )
    })
}

fn iso_ms(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .map(|d| d.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
        .unwrap_or_default()
}

/// Projets qui ont des souvenirs actifs, les plus fournis d'abord.
pub fn claude_science_memory_projects(
    base: &Path,
) -> Result<Vec<ClaudeScienceMemoryProject>, String> {
    let conn = ouvrir(base)?;
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(m.subject_project_id, ''), p.name, COUNT(*)
             FROM memories m LEFT JOIN projects p ON p.id = m.subject_project_id
             WHERE m.superseded_by IS NULL
             GROUP BY 1 ORDER BY 3 DESC, 2",
        )
        .map_err(|e| e.to_string())?;
    let lignes = stmt
        .query_map([], |r| {
            Ok(ClaudeScienceMemoryProject {
                id: r.get::<_, String>(0)?,
                name: r.get::<_, Option<String>>(1)?.unwrap_or_default(),
                count: r.get::<_, i64>(2)?.max(0) as usize,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(lignes)
}

/// Aperçu depuis le dossier personnel : où est la base, quels projets.
pub fn claude_science_memory_overview(home: &Path) -> Result<ClaudeScienceMemoryOverview, String> {
    let base = base_de(home)?;
    let projects = claude_science_memory_projects(&base)?;
    Ok(ClaudeScienceMemoryOverview {
        base: base.display().to_string(),
        projects,
    })
}

/// Souvenirs actifs des projets demandés (`""` = sans projet), plus anciens
/// d'abord.
pub fn read_claude_science_memories(
    base: &Path,
    project_ids: &[String],
) -> Result<Vec<ClaudeScienceMemory>, String> {
    if project_ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = ouvrir(base)?;
    let mut stmt = conn
        .prepare(
            "SELECT m.id, m.body, COALESCE(m.subject_project_id, ''), p.name, m.evidence, m.created_at
             FROM memories m LEFT JOIN projects p ON p.id = m.subject_project_id
             WHERE m.superseded_by IS NULL
             ORDER BY m.created_at, m.id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ClaudeScienceMemory {
                id: r.get(0)?,
                body: r.get::<_, String>(1)?.trim().to_string(),
                project_id: r.get(2)?,
                project_name: r.get::<_, Option<String>>(3)?,
                evidence: r.get::<_, Option<String>>(4)?,
                created_at: iso_ms(r.get::<_, Option<i64>>(5)?.unwrap_or(0)),
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let m = row.map_err(|e| e.to_string())?;
        if !m.body.is_empty() && project_ids.contains(&m.project_id) {
            out.push(m);
        }
    }
    Ok(out)
}

/// Lecture depuis le dossier personnel (pour le routeur).
pub fn import_claude_science_memories(
    home: &Path,
    project_ids: &[String],
) -> Result<Vec<ClaudeScienceMemory>, String> {
    read_claude_science_memories(&base_de(home)?, project_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_de_test(dir: &Path) -> PathBuf {
        let org = dir.join("orgs").join("org-1");
        std::fs::create_dir_all(&org).unwrap();
        let base = org.join("operon-cli.db");
        let conn = Connection::open(&base).unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER, updated_at INTEGER);
            CREATE TABLE memories (id TEXT PRIMARY KEY, user_id TEXT, body TEXT NOT NULL,
              subject_project_id TEXT, subject_artifact_id TEXT, origin TEXT, evidence TEXT,
              superseded_by TEXT, created_at INTEGER, updated_at INTEGER);
            INSERT INTO projects VALUES ('p1','Analyses Feux-Albédo',0,0), ('p2','Demande de bourse',0,0);
            INSERT INTO memories VALUES
              ('m1','u','Le dépôt vient de FireWork moins noFire.','p1',NULL,'extractor','observed',NULL,1786056704010,0),
              ('m2','u','Ancienne fenêtre JJA.','p1',NULL,'extractor','stated','m3',1786056704011,0),
              ('m3','u','Fenêtre JJA confirmée.','p1',NULL,'agent_tool','stated',NULL,1786056704012,0),
              ('m4','u','Budget de la bourse : 17 500 $.','p2',NULL,'extractor','stated',NULL,1786056704013,0),
              ('m5','u','Thierry écrit en français.',NULL,NULL,'extractor','stated',NULL,1786056704014,0),
              ('m6','u','   ','p1',NULL,'extractor','stated',NULL,1786056704015,0);
            "#,
        )
        .unwrap();
        base
    }

    #[test]
    fn les_projets_comptent_les_souvenirs_actifs() {
        let dir = tempfile::tempdir().unwrap();
        let base = base_de_test(dir.path());
        let projets = claude_science_memory_projects(&base).unwrap();
        assert_eq!(
            projets,
            vec![
                ClaudeScienceMemoryProject {
                    id: "p1".into(),
                    name: "Analyses Feux-Albédo".into(),
                    count: 3
                },
                ClaudeScienceMemoryProject {
                    id: "".into(),
                    name: "".into(),
                    count: 1
                },
                ClaudeScienceMemoryProject {
                    id: "p2".into(),
                    name: "Demande de bourse".into(),
                    count: 1
                },
            ]
        );
    }

    #[test]
    fn seuls_les_souvenirs_actifs_des_projets_choisis_sont_lus() {
        let dir = tempfile::tempdir().unwrap();
        let base = base_de_test(dir.path());
        let lus = read_claude_science_memories(&base, &["p1".into(), "".into()]).unwrap();
        let ids: Vec<&str> = lus.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(
            ids,
            ["m1", "m3", "m5"],
            "m2 est remplacé, m6 est vide, m4 n'est pas demandé"
        );
        assert_eq!(lus[0].project_name.as_deref(), Some("Analyses Feux-Albédo"));
        assert_eq!(lus[0].evidence.as_deref(), Some("observed"));
        assert!(
            lus[0].created_at.starts_with("2026-08-"),
            "{}",
            lus[0].created_at
        );
        assert_eq!(lus[2].project_id, "");
        assert!(read_claude_science_memories(&base, &[]).unwrap().is_empty());
    }

    #[test]
    fn la_base_n_est_jamais_modifiee() {
        let dir = tempfile::tempdir().unwrap();
        let base = base_de_test(dir.path());
        let avant = std::fs::read(&base).unwrap();
        claude_science_memory_projects(&base).unwrap();
        read_claude_science_memories(&base, &["p1".into()]).unwrap();
        assert_eq!(std::fs::read(&base).unwrap(), avant);
    }

    #[test]
    fn depuis_le_dossier_personnel() {
        let home = tempfile::tempdir().unwrap();
        base_de_test(&home.path().join("Documents").join("Claude Science"));
        let apercu = claude_science_memory_overview(home.path()).unwrap();
        assert!(apercu.base.ends_with("operon-cli.db"));
        assert_eq!(apercu.projects.len(), 3);
        let lus = import_claude_science_memories(home.path(), &["p2".into()]).unwrap();
        assert_eq!(lus.len(), 1);
        let vide = tempfile::tempdir().unwrap();
        assert!(claude_science_memory_overview(vide.path())
            .unwrap_err()
            .contains("Aucune base Claude Science"));
    }
}
