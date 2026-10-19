//! Skills installés sur le Mac, vus par Claude Code et par Codex (spécialistes,
//! plan specialistes-2026-10-18). Un fil qui porte un spécialiste ne garde
//! que les skills de sa fiche, comme dans Claude Science ; il faut donc savoir
//! lesquels chaque CLI voit, et d'où copier ceux qui manquent.
//!
//! Dossiers lus (relevé sur le Mac de Thierry le 2026-10-19) :
//! - Claude Code : `<projet>/.claude/skills`, `~/.claude/skills`, et les skills
//!   du compte claude.ai synchronisés dans `~/.claude/skills/synced/<org>_<id>/`
//!   (le CLI les nomme `anthropic-skills:<nom>`) ;
//! - Codex : `<projet>/.agents/skills`, `<projet>/.codex/skills`,
//!   `~/.agents/skills`, `$CODEX_HOME/skills` (`.system` exclu : les outils
//!   livrés avec Codex restent branchés) ;
//! - Claude Science (sources de copie seulement) :
//!   `<data_dir>/orgs/<org>/skills` puis `<data_dir>/skills`.
//!
//! Un dossier qui commence par `.` ou `_` (`_archive`) n'est pas un skill.

use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::cle_mcp;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillDuMac {
    /// Nom du skill (`name:` du SKILL.md, sinon le dossier).
    pub nom: String,
    pub source: &'static str,
    pub dossier: PathBuf,
}

/// Nom de skill tel que l'interface l'affiche, avec les CLI qui le voient.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SkillVu {
    pub nom: String,
    pub claude: bool,
    pub codex: bool,
}

fn nom_du_skill(dossier: &Path) -> Option<String> {
    let texte = std::fs::read_to_string(dossier.join("SKILL.md")).ok()?;
    let nom_dossier = dossier.file_name()?.to_string_lossy().to_string();
    let mut lignes = texte.lines();
    if lignes.next().map(str::trim) != Some("---") {
        return Some(nom_dossier);
    }
    for ligne in lignes {
        let ligne = ligne.trim();
        if ligne == "---" {
            break;
        }
        if let Some(valeur) = ligne.strip_prefix("name:") {
            let valeur = valeur.trim().trim_matches('"').trim_matches('\'').trim();
            if !valeur.is_empty() {
                return Some(valeur.to_string());
            }
        }
    }
    Some(nom_dossier)
}

fn lire_racine(racine: &Path, source: &'static str, sortie: &mut Vec<SkillDuMac>) {
    let Ok(entrees) = std::fs::read_dir(racine) else { return };
    let mut dossiers: Vec<PathBuf> = entrees
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| {
            let nom = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            !nom.starts_with('.') && !nom.starts_with('_') && p.join("SKILL.md").is_file()
        })
        .collect();
    dossiers.sort();
    for dossier in dossiers {
        let Some(nom) = nom_du_skill(&dossier) else { continue };
        if sortie.iter().any(|s| cle_mcp(&s.nom) == cle_mcp(&nom)) {
            continue;
        }
        sortie.push(SkillDuMac { nom, source, dossier });
    }
}

fn sous_dossiers(racine: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(racine)
        .map(|it| it.filter_map(Result::ok).map(|e| e.path()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default();
    v.sort();
    v
}

/// Skills que Claude Code charge pour un fil, le plus prioritaire d'abord.
pub fn skills_claude(home: &Path, cwd: Option<&Path>) -> Vec<SkillDuMac> {
    let mut sortie = Vec::new();
    if let Some(cwd) = cwd {
        lire_racine(&cwd.join(".claude/skills"), "projet", &mut sortie);
    }
    lire_racine(&home.join(".claude/skills"), "claude", &mut sortie);
    for compte in sous_dossiers(&home.join(".claude/skills/synced")) {
        lire_racine(&compte, "compte", &mut sortie);
    }
    sortie
}

/// Skills que Codex charge pour un fil.
pub fn skills_codex(home: &Path, codex_home: &Path, cwd: Option<&Path>) -> Vec<SkillDuMac> {
    let mut sortie = Vec::new();
    if let Some(cwd) = cwd {
        lire_racine(&cwd.join(".agents/skills"), "projet", &mut sortie);
        lire_racine(&cwd.join(".codex/skills"), "projet", &mut sortie);
    }
    lire_racine(&home.join(".agents/skills"), "agents", &mut sortie);
    lire_racine(&codex_home.join("skills"), "codex", &mut sortie);
    sortie
}

/// Skills de Claude Science (organisation la plus récente, puis l'ensemble
/// livré), sources possibles d'une copie.
pub fn skills_claude_science(home: &Path) -> Vec<SkillDuMac> {
    let data_dir = crate::claude_science_data_dir(home);
    let mut sortie = Vec::new();
    if let Some(base) = crate::find_claude_science_db(&data_dir) {
        if let Some(org) = base.parent() {
            lire_racine(&org.join("skills"), "claude-science", &mut sortie);
        }
    }
    lire_racine(&data_dir.join("skills"), "claude-science", &mut sortie);
    sortie
}

/// Tous les skills du Mac, pour la fiche d'un spécialiste.
pub fn skills_du_mac(home: &Path, codex_home: &Path) -> Vec<SkillVu> {
    let claude = skills_claude(home, None);
    let codex = skills_codex(home, codex_home, None);
    let mut liste: Vec<SkillVu> = Vec::new();
    for (s, est_claude) in claude.iter().map(|s| (s, true)).chain(codex.iter().map(|s| (s, false))) {
        match liste.iter_mut().find(|v| cle_mcp(&v.nom) == cle_mcp(&s.nom)) {
            Some(v) if est_claude => v.claude = true,
            Some(v) => v.codex = true,
            None => liste.push(SkillVu { nom: s.nom.clone(), claude: est_claude, codex: !est_claude }),
        }
    }
    liste.sort_by_key(|v| cle_mcp(&v.nom));
    liste
}

/// Ce qu'une copie a fait pour un skill.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCopie {
    pub nom: String,
    /// `claude` (`~/.claude/skills`) ou `codex` (`~/.agents/skills`).
    pub pour: String,
    pub depuis: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BilanCopieSkills {
    pub copies: Vec<SkillCopie>,
    /// Introuvables sur le Mac (ni compte claude.ai, ni Claude Science).
    pub introuvables: Vec<String>,
}

fn copier_dossier(depuis: &Path, vers: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(vers)?;
    for entree in std::fs::read_dir(depuis)? {
        let entree = entree?;
        let cible = vers.join(entree.file_name());
        let type_ = entree.file_type()?;
        if type_.is_dir() {
            copier_dossier(&entree.path(), &cible)?;
        } else if type_.is_file() {
            std::fs::copy(entree.path(), &cible)?;
        }
    }
    Ok(())
}

/// Copie les skills `voulus` qui manquent à Claude Code (vers
/// `~/.claude/skills`) ou à Codex (vers `~/.agents/skills`), depuis les skills
/// du compte synchronisés par Claude Code ou depuis Claude Science. N'écrase
/// jamais un dossier existant ; une copie à moitié faite est retirée.
pub fn copier_skills_manquants(home: &Path, codex_home: &Path, voulus: &[String]) -> BilanCopieSkills {
    let mut bilan = BilanCopieSkills::default();
    let science = skills_claude_science(home);
    for voulu in voulus {
        let cle = cle_mcp(voulu);
        if cle.is_empty() {
            continue;
        }
        let claude = skills_claude(home, None);
        let codex = skills_codex(home, codex_home, None);
        let trouver = |liste: &[SkillDuMac]| liste.iter().find(|s| cle_mcp(&s.nom) == cle).cloned();
        let source = trouver(&claude).or_else(|| trouver(&codex)).or_else(|| trouver(&science));
        let Some(source) = source else {
            bilan.introuvables.push(voulu.clone());
            continue;
        };
        let nom_dossier = source.dossier.file_name().map(|n| n.to_os_string()).unwrap_or_default();
        for (pour, manque, racine) in [
            ("claude", trouver(&claude).is_none(), home.join(".claude/skills")),
            ("codex", trouver(&codex).is_none(), home.join(".agents/skills")),
        ] {
            if !manque {
                continue;
            }
            let cible = racine.join(&nom_dossier);
            if cible.exists() {
                continue;
            }
            match copier_dossier(&source.dossier, &cible) {
                Ok(()) => bilan.copies.push(SkillCopie {
                    nom: source.nom.clone(),
                    pour: pour.into(),
                    depuis: source.source.into(),
                }),
                Err(_) => {
                    let _ = std::fs::remove_dir_all(&cible);
                }
            }
        }
    }
    bilan
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill(racine: &Path, dossier: &str, nom: Option<&str>) {
        let d = racine.join(dossier);
        std::fs::create_dir_all(&d).unwrap();
        let texte = match nom {
            Some(n) => format!("---\nname: {n}\ndescription: x\n---\ncorps"),
            None => "corps sans en-tête".to_string(),
        };
        std::fs::write(d.join("SKILL.md"), texte).unwrap();
    }

    #[test]
    fn claude_et_codex_lisent_leurs_dossiers() {
        let home = tempfile::tempdir().unwrap();
        let codex = tempfile::tempdir().unwrap();
        let h = home.path();
        skill(&h.join(".claude/skills"), "concis", None);
        skill(&h.join(".claude/skills"), "_archive", None);
        skill(&h.join(".claude/skills/synced/org_1"), "chaine-donnees-albedo", Some("chaine-donnees-albedo"));
        skill(&h.join(".agents/skills"), "write", Some("write"));
        skill(&codex.path().join("skills"), ".system", None);
        skill(&codex.path().join("skills"), "kami", Some("Kami"));
        let c: Vec<_> = skills_claude(h, None).into_iter().map(|s| (s.nom, s.source)).collect();
        assert_eq!(c, [("concis".to_string(), "claude"), ("chaine-donnees-albedo".to_string(), "compte")]);
        let x: Vec<_> = skills_codex(h, codex.path(), None).into_iter().map(|s| s.nom).collect();
        assert_eq!(x, ["write", "Kami"]);
        let vus = skills_du_mac(h, codex.path());
        assert!(vus.contains(&SkillVu { nom: "chaine-donnees-albedo".into(), claude: true, codex: false }));
        assert!(vus.contains(&SkillVu { nom: "write".into(), claude: false, codex: true }));
    }

    #[test]
    fn la_copie_complete_ce_qui_manque_sans_rien_ecraser() {
        let home = tempfile::tempdir().unwrap();
        let codex = tempfile::tempdir().unwrap();
        let h = home.path();
        skill(&h.join(".claude/skills/synced/org_1"), "bilan-energie-fonte", Some("bilan-energie-fonte"));
        std::fs::create_dir_all(h.join(".claude/skills/synced/org_1/bilan-energie-fonte/refs")).unwrap();
        std::fs::write(h.join(".claude/skills/synced/org_1/bilan-energie-fonte/refs/a.md"), "ref").unwrap();
        std::fs::write(
            h.join(".claude-science/config.toml").tap_mkdir(),
            format!("data_dir = \"{}\"\n", h.join("CS").display()),
        )
        .unwrap();
        std::fs::create_dir_all(h.join("CS/orgs/o1")).unwrap();
        std::fs::write(h.join("CS/orgs/o1/operon-cli.db"), b"").unwrap();
        skill(&h.join("CS/orgs/o1/skills"), "literature-review", Some("literature-review"));
        skill(&h.join(".agents/skills"), "write", Some("write"));

        let voulus = vec!["bilan-energie-fonte".to_string(), "literature-review".into(), "write".into(), "absent".into()];
        let bilan = copier_skills_manquants(h, codex.path(), &voulus);
        let faits: Vec<_> = bilan.copies.iter().map(|c| (c.nom.as_str(), c.pour.as_str(), c.depuis.as_str())).collect();
        assert_eq!(
            faits,
            [
                ("bilan-energie-fonte", "codex", "compte"),
                ("literature-review", "claude", "claude-science"),
                ("literature-review", "codex", "claude-science"),
                ("write", "claude", "agents"),
            ]
        );
        assert_eq!(bilan.introuvables, ["absent"]);
        assert_eq!(std::fs::read_to_string(h.join(".agents/skills/bilan-energie-fonte/refs/a.md")).unwrap(), "ref");
        // Deuxième passage : plus rien à copier.
        assert!(copier_skills_manquants(h, codex.path(), &voulus).copies.is_empty());
    }

    trait TapMkdir {
        fn tap_mkdir(self) -> Self;
    }
    impl TapMkdir for PathBuf {
        fn tap_mkdir(self) -> Self {
            std::fs::create_dir_all(self.parent().unwrap()).unwrap();
            self
        }
    }
}
