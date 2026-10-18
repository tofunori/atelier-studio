//! Spécialistes de Claude Science, lus en LECTURE SEULE pour l'import dans
//! Atelier (Réglages › Spécialistes, plan specialistes-2026-10-18).
//!
//! Claude Science range ses données dans le dossier nommé par
//! `~/.claude-science/config.toml` (`data_dir = "…"`), une base SQLite par
//! organisation : `<data_dir>/orgs/<org>/operon-cli.db`. Les spécialistes
//! créés par l'utilisateur vivent dans `user_agents` ; leurs connecteurs dans
//! `mcp_agent_assignments` (→ `custom_mcp_servers.name`). La base fait
//! plusieurs Go et l'app peut tourner : on l'ouvre en lecture seule, sans la
//! copier, et on n'y écrit jamais.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Spécialiste par défaut de Claude Science : ce n'est pas une fiche de
/// l'utilisateur, il n'est pas importé.
const AGENT_PAR_DEFAUT: &str = "OPERON";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeScienceSpecialist {
    /// Identifiant stable côté Claude Science (`user_agents.name`).
    pub cle: String,
    pub nom: String,
    pub role: String,
    pub instructions: String,
    pub skills: Vec<String>,
    /// `unrestricted = 1` : le spécialiste a accès à tous les skills.
    pub tous_skills: bool,
    pub connecteurs: Vec<String>,
    pub actif: bool,
    pub modifie_le: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeScienceImport {
    pub base: String,
    pub specialistes: Vec<ClaudeScienceSpecialist>,
}

/// `data_dir` de `config.toml`, sinon le dossier par défaut de l'app.
pub fn claude_science_data_dir(home: &Path) -> PathBuf {
    let config = home.join(".claude-science").join("config.toml");
    std::fs::read_to_string(config)
        .ok()
        .and_then(|texte| data_dir_de(&texte))
        .map(|dir| expand_home(&dir, home))
        .unwrap_or_else(|| home.join("Documents").join("Claude Science"))
}

/// Lecture minimale de `data_dir = "…"` : une clé de premier niveau, sans
/// dépendre d'un analyseur TOML complet pour une seule valeur.
fn data_dir_de(config: &str) -> Option<String> {
    let mut dans_table = false;
    for ligne in config.lines() {
        let ligne = ligne.trim();
        if ligne.starts_with('[') {
            dans_table = true;
            continue;
        }
        if dans_table || ligne.starts_with('#') {
            continue;
        }
        let Some((cle, valeur)) = ligne.split_once('=') else {
            continue;
        };
        if cle.trim() != "data_dir" {
            continue;
        }
        let valeur = valeur.trim();
        let valeur = valeur
            .strip_prefix('"')
            .and_then(|v| v.split_once('"').map(|(dedans, _)| dedans))
            .or_else(|| {
                valeur
                    .strip_prefix('\'')
                    .and_then(|v| v.split_once('\'').map(|(dedans, _)| dedans))
            })?;
        let valeur = valeur.replace("\\\\", "\\").replace("\\\"", "\"");
        return (!valeur.trim().is_empty()).then_some(valeur);
    }
    None
}

fn expand_home(dir: &str, home: &Path) -> PathBuf {
    match dir.strip_prefix("~/") {
        Some(reste) => home.join(reste),
        None if dir == "~" => home.to_path_buf(),
        None => PathBuf::from(dir),
    }
}

/// Base de l'organisation la plus récemment modifiée (un compte n'en a
/// d'ordinaire qu'une).
pub fn find_claude_science_db(data_dir: &Path) -> Option<PathBuf> {
    let orgs = std::fs::read_dir(data_dir.join("orgs")).ok()?;
    orgs.filter_map(Result::ok)
        .map(|entree| entree.path().join("operon-cli.db"))
        .filter(|base| base.is_file())
        .max_by_key(|base| {
            let wal = base.with_extension("db-wal");
            [base.as_path(), wal.as_path()]
                .iter()
                .filter_map(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok())
                .max()
        })
}

/// Import complet depuis le dossier personnel : trouve la base, la lit.
pub fn import_claude_science(home: &Path) -> Result<ClaudeScienceImport, String> {
    let data_dir = claude_science_data_dir(home);
    let base = find_claude_science_db(&data_dir).ok_or_else(|| {
        format!(
            "Aucune base Claude Science trouvée dans {}",
            data_dir.join("orgs").display()
        )
    })?;
    let specialistes = read_claude_science_specialists(&base)?;
    Ok(ClaudeScienceImport {
        base: base.display().to_string(),
        specialistes,
    })
}

fn liste_json(texte: Option<String>) -> Vec<String> {
    texte
        .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn table_existe(conn: &Connection, table: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
        [table],
        |_| Ok(()),
    )
    .is_ok()
}

/// Lit les spécialistes de l'utilisateur dans une base `operon-cli.db`.
pub fn read_claude_science_specialists(
    base: &Path,
) -> Result<Vec<ClaudeScienceSpecialist>, String> {
    let conn = Connection::open_with_flags(
        base,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("base Claude Science illisible : {e}"))?;
    let _ = conn.busy_timeout(std::time::Duration::from_secs(3));
    if !table_existe(&conn, "user_agents") {
        return Err("base Claude Science sans table user_agents".into());
    }
    let mut stmt = conn
        .prepare(
            "SELECT name, display_name, description, system_prompt, skill_names,
                    unrestricted, enabled, updated_at, connector_tombstones
             FROM user_agents WHERE name != ?1 ORDER BY created_at, name",
        )
        .map_err(|e| e.to_string())?;
    let lignes = stmt
        .query_map([AGENT_PAR_DEFAUT], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<i64>>(5)?,
                r.get::<_, Option<i64>>(6)?,
                r.get::<_, Option<rusqlite::types::Value>>(7)?,
                r.get::<_, Option<String>>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let avec_connecteurs = table_existe(&conn, "mcp_agent_assignments");
    let avec_noms = table_existe(&conn, "custom_mcp_servers");
    let mut out = Vec::with_capacity(lignes.len());
    for (cle, nom, role, instructions, skills, unrestricted, enabled, modifie, tombes) in lignes {
        let exclus = liste_json(tombes);
        let connecteurs = if avec_connecteurs {
            connecteurs_de(&conn, &cle, avec_noms)?
                .into_iter()
                .filter(|c| !exclus.contains(c))
                .collect()
        } else {
            Vec::new()
        };
        let modifie_le = match modifie {
            Some(rusqlite::types::Value::Text(t)) => t,
            Some(rusqlite::types::Value::Integer(n)) => n.to_string(),
            Some(rusqlite::types::Value::Real(f)) => f.to_string(),
            _ => String::new(),
        };
        out.push(ClaudeScienceSpecialist {
            nom: nom.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| cle.clone()),
            cle,
            role: role.unwrap_or_default().trim().to_string(),
            instructions: instructions.unwrap_or_default().trim().to_string(),
            skills: liste_json(skills),
            tous_skills: unrestricted.unwrap_or(0) != 0,
            connecteurs,
            actif: enabled.unwrap_or(1) != 0,
            modifie_le,
        });
    }
    Ok(out)
}

fn connecteurs_de(conn: &Connection, agent: &str, avec_noms: bool) -> Result<Vec<String>, String> {
    let sql = if avec_noms {
        "SELECT COALESCE(s.name, a.mcp_server_id) FROM mcp_agent_assignments a
         LEFT JOIN custom_mcp_servers s ON s.id = a.mcp_server_id
         WHERE a.agent_name = ?1 ORDER BY 1"
    } else {
        "SELECT mcp_server_id FROM mcp_agent_assignments WHERE agent_name = ?1 ORDER BY 1"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let noms = stmt
        .query_map([agent], |r| r.get::<_, Option<String>>(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .flatten()
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .collect::<Vec<_>>();
    let mut uniques = noms;
    uniques.dedup();
    Ok(uniques)
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
            CREATE TABLE user_agents (id TEXT, user_id TEXT, name TEXT, display_name TEXT,
              description TEXT, system_prompt TEXT, skill_names TEXT, enabled INTEGER,
              created_at TEXT, updated_at TEXT, skill_tombstones TEXT,
              connector_tombstones TEXT, unrestricted INTEGER);
            CREATE TABLE custom_mcp_servers (id TEXT, name TEXT);
            CREATE TABLE mcp_agent_assignments (id TEXT, mcp_server_id TEXT, agent_name TEXT,
              user_id TEXT, created_at TEXT, excluded_tools TEXT);
            INSERT INTO user_agents VALUES ('1','u','OPERON','Operon','défaut','...','[]',1,'2026-01-01','2026-01-01',NULL,NULL,1);
            INSERT INTO user_agents VALUES ('2','u','GLACIOLOGUE_ALBEDO','Glaciologue albédo',
              'Albédo des glaciers','Tu es glaciologue.','["chaine-donnees-albedo","bilan-energie-fonte"]',
              1,'2026-02-01','2026-10-01',NULL,NULL,0);
            INSERT INTO user_agents VALUES ('3','u','PAPER_WRITER','Paper Writer',NULL,'Write papers.',NULL,
              0,'2026-03-01','2026-03-02',NULL,'["gbrain"]',1);
            INSERT INTO custom_mcp_servers VALUES ('srv-1','scholar');
            INSERT INTO custom_mcp_servers VALUES ('srv-2','gbrain');
            INSERT INTO mcp_agent_assignments VALUES ('a1','srv-1','GLACIOLOGUE_ALBEDO','u','2026',NULL);
            INSERT INTO mcp_agent_assignments VALUES ('a2','srv-2','PAPER_WRITER','u','2026',NULL);
            "#,
        )
        .unwrap();
        base
    }

    #[test]
    fn lit_les_specialistes_de_l_utilisateur_sans_le_defaut() {
        let dir = tempfile::tempdir().unwrap();
        let base = base_de_test(dir.path());
        let lus = read_claude_science_specialists(&base).unwrap();
        assert_eq!(lus.len(), 2, "OPERON n'est pas une fiche de l'utilisateur");
        let glacio = &lus[0];
        assert_eq!(glacio.cle, "GLACIOLOGUE_ALBEDO");
        assert_eq!(glacio.nom, "Glaciologue albédo");
        assert_eq!(glacio.role, "Albédo des glaciers");
        assert_eq!(glacio.instructions, "Tu es glaciologue.");
        assert_eq!(glacio.skills, ["chaine-donnees-albedo", "bilan-energie-fonte"]);
        assert!(!glacio.tous_skills);
        assert_eq!(glacio.connecteurs, ["scholar"]);
        assert!(glacio.actif);
        assert_eq!(glacio.modifie_le, "2026-10-01");
    }

    #[test]
    fn un_connecteur_exclu_et_un_specialiste_inactif_sont_rendus_tels_quels() {
        let dir = tempfile::tempdir().unwrap();
        let base = base_de_test(dir.path());
        let lus = read_claude_science_specialists(&base).unwrap();
        let paper = &lus[1];
        assert!(!paper.actif);
        assert!(paper.tous_skills);
        assert!(paper.skills.is_empty());
        assert!(paper.connecteurs.is_empty(), "gbrain est dans connector_tombstones");
        assert_eq!(paper.role, "");
    }

    #[test]
    fn la_base_n_est_jamais_modifiee() {
        let dir = tempfile::tempdir().unwrap();
        let base = base_de_test(dir.path());
        let avant = std::fs::read(&base).unwrap();
        read_claude_science_specialists(&base).unwrap();
        assert_eq!(std::fs::read(&base).unwrap(), avant);
    }

    #[test]
    fn le_dossier_vient_de_config_toml() {
        let home = tempfile::tempdir().unwrap();
        let config = home.path().join(".claude-science");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::write(
            config.join("config.toml"),
            "# réglages\ndata_dir = \"~/Docs/Claude Science\"\n\n[ui]\ndata_dir = \"/faux\"\n",
        )
        .unwrap();
        assert_eq!(
            claude_science_data_dir(home.path()),
            home.path().join("Docs/Claude Science")
        );
        std::fs::write(config.join("config.toml"), "[ui]\ndata_dir = \"/faux\"\n").unwrap();
        assert_eq!(
            claude_science_data_dir(home.path()),
            home.path().join("Documents/Claude Science"),
            "une clé d'une table n'est pas la clé de premier niveau"
        );
    }

    #[test]
    fn import_complet_depuis_le_dossier_personnel() {
        let home = tempfile::tempdir().unwrap();
        let data = home.path().join("Science");
        base_de_test(&data);
        let config = home.path().join(".claude-science");
        std::fs::create_dir_all(&config).unwrap();
        std::fs::write(
            config.join("config.toml"),
            format!("data_dir = \"{}\"\n", data.display()),
        )
        .unwrap();
        let import = import_claude_science(home.path()).unwrap();
        assert!(import.base.ends_with("operon-cli.db"));
        assert_eq!(import.specialistes.len(), 2);
    }

    #[test]
    fn sans_claude_science_l_erreur_le_dit() {
        let home = tempfile::tempdir().unwrap();
        let erreur = import_claude_science(home.path()).unwrap_err();
        assert!(erreur.contains("Aucune base Claude Science"), "{erreur}");
    }

    #[test]
    fn la_serialisation_suit_le_front() {
        let s = ClaudeScienceSpecialist {
            cle: "K".into(),
            nom: "N".into(),
            role: String::new(),
            instructions: String::new(),
            skills: vec![],
            tous_skills: true,
            connecteurs: vec![],
            actif: true,
            modifie_le: String::new(),
        };
        let v = serde_json::to_value(&s).unwrap();
        assert_eq!(v["tousSkills"], true);
        assert!(v.get("modifieLe").is_some());
    }
}
