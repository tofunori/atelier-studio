//! Découverte des environnements Python où lancer le noyau.
//!
//! Par défaut, le noyau tourne dans l'env « atelier » : un seul env pour
//! toutes les analyses, géré par pixi dans le dossier de l'app (voir
//! `pixi.rs`). Deux choses passent avant lui : `ATELIER_KERNEL_PYTHON`, et
//! l'env que le projet porte lui-même (`pixi.toml`, `.venv`). Les envs conda
//! et mamba, et ceux de Claude Science (`~/.claude-science/conda/envs`),
//! restent listés et utilisables à la demande, mais ne sont plus pris par
//! défaut dès que pixi est là. Sans pixi, un env pixi n'est proposé que s'il
//! est déjà installé ; sinon l'ordre d'avant vaut toujours.

use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PyEnv {
    /// Nom à donner à l'outil (`env: "pymc-albedo"`).
    pub name: String,
    /// Racine de l'env (`CONDA_PREFIX`), ou dossier du venv.
    pub prefix: PathBuf,
    pub python: PathBuf,
    /// D'où vient l'env : `atelier` (env d'Atelier, géré par pixi), `pixi`
    /// (env pixi du projet), `projet` (venv du projet), `variable`, `conda`,
    /// `claude-science`, `systeme`.
    pub source: String,
}

/// Racines conda/mamba connues, relatives au dossier personnel.
const CONDA_ROOTS: &[&str] = &[
    "miniforge3",
    "mambaforge",
    "miniconda3",
    "anaconda3",
    "micromamba",
    ".mamba",
    ".local/share/mamba",
    "opt/miniconda3",
];

fn python_of(prefix: &Path) -> Option<PathBuf> {
    ["bin/python", "bin/python3"]
        .iter()
        .map(|rel| prefix.join(rel))
        .find(|p| p.is_file())
}

fn canon(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

struct Collecte {
    envs: Vec<PyEnv>,
    vus: HashSet<PathBuf>,
}

impl Collecte {
    fn ajouter(&mut self, name: String, prefix: &Path, source: &str) {
        let Some(python) = python_of(prefix) else {
            return;
        };
        self.pousser(name, prefix, python, source);
    }

    fn pousser(&mut self, name: String, prefix: &Path, python: PathBuf, source: &str) {
        if !self.vus.insert(canon(prefix)) {
            return;
        }
        // Deux envs de même nom (miniforge et Claude Science) : le second
        // prend sa source en suffixe pour rester désignable sans ambiguïté.
        let name = if self.envs.iter().any(|e| e.name == name) {
            format!("{name} ({source})")
        } else {
            name
        };
        self.envs.push(PyEnv {
            name,
            prefix: prefix.to_path_buf(),
            python,
            source: source.to_string(),
        });
    }

    /// Env par défaut d'un projet pixi. Listé dès que pixi est là, même pas
    /// encore installé : le premier noyau qui y démarre le crée.
    fn env_pixi(&mut self, name: &str, project: &Path, source: &str, pixi_present: bool) {
        let prefix = crate::pixi::env_prefix(project);
        match python_of(&prefix) {
            Some(python) => self.pousser(name.to_string(), &prefix, python, source),
            None if pixi_present => {
                self.pousser(name.to_string(), &prefix, prefix.join("bin/python"), source)
            }
            None => {}
        }
    }

    fn racine_conda(&mut self, root: &Path, source: &str) {
        if !root.is_dir() {
            return;
        }
        let base = root
            .file_name()
            .map(|n| n.to_string_lossy().trim_start_matches('.').to_string())
            .unwrap_or_default();
        self.ajouter(format!("base ({base})"), root, source);
        let Ok(rd) = std::fs::read_dir(root.join("envs")) else {
            return;
        };
        let mut noms: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
        noms.sort();
        for prefix in noms {
            if let Some(name) = prefix.file_name().map(|n| n.to_string_lossy().to_string()) {
                self.ajouter(name, &prefix, source);
            }
        }
    }
}

/// Liste les envs disponibles, dans l'ordre de préférence par défaut, sans
/// l'env d'Atelier (voir `discover_envs_with`).
pub fn discover_envs(home: &Path, project_root: Option<&Path>) -> Vec<PyEnv> {
    discover_envs_with(home, project_root, None, false)
}

/// Liste les envs disponibles, dans l'ordre de préférence par défaut :
/// `ATELIER_KERNEL_PYTHON`, l'env pixi du projet, ses venvs, l'env « atelier »
/// (`atelier_dir` : son projet pixi), puis conda, Claude Science et le Python
/// système. `pixi_present` : pixi est sur la machine, donc un env pixi pas
/// encore installé peut être proposé.
pub fn discover_envs_with(
    home: &Path,
    project_root: Option<&Path>,
    atelier_dir: Option<&Path>,
    pixi_present: bool,
) -> Vec<PyEnv> {
    let mut c = Collecte {
        envs: Vec::new(),
        vus: HashSet::new(),
    };
    if let Ok(explicite) = std::env::var("ATELIER_KERNEL_PYTHON") {
        let python = PathBuf::from(&explicite);
        if python.is_file() {
            // …/bin/python → préfixe = deux crans au-dessus.
            let prefix = python
                .parent()
                .and_then(Path::parent)
                .map(Path::to_path_buf)
                .unwrap_or_else(|| python.clone());
            c.vus.insert(canon(&prefix));
            c.envs.push(PyEnv {
                name: "ATELIER_KERNEL_PYTHON".into(),
                prefix,
                python,
                source: "variable".into(),
            });
        }
    }
    if let Some(root) = project_root {
        // Un projet qui déclare ses dépendances garde la main.
        if root.join("pixi.toml").is_file() {
            c.env_pixi("pixi (projet)", root, crate::pixi::SOURCE_PROJECT, pixi_present);
        }
        for venv in [".venv", "venv", "env"] {
            let prefix = root.join(venv);
            if prefix.join("pyvenv.cfg").is_file() {
                c.ajouter(format!("{venv} (projet)"), &prefix, "projet");
            }
        }
    }
    if let Some(dir) = atelier_dir {
        c.env_pixi(crate::pixi::ATELIER_ENV, dir, crate::pixi::SOURCE_ATELIER, pixi_present);
    }
    for root in CONDA_ROOTS {
        c.racine_conda(&home.join(root), "conda");
    }
    // Envs créés ailleurs (`conda create -p …`) : conda les note ici.
    if let Ok(txt) = std::fs::read_to_string(home.join(".conda/environments.txt")) {
        for line in txt.lines().map(str::trim).filter(|l| !l.is_empty()) {
            let prefix = PathBuf::from(line);
            let name = prefix
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| line.to_string());
            c.ajouter(name, &prefix, "conda");
        }
    }
    c.racine_conda(&home.join(".claude-science/conda"), "claude-science");
    for python in [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ] {
        let python = PathBuf::from(python);
        if python.is_file() && !c.envs.iter().any(|e| e.source == "systeme") {
            c.envs.push(PyEnv {
                name: "python3 (système)".into(),
                prefix: python
                    .parent()
                    .and_then(Path::parent)
                    .map(Path::to_path_buf)
                    .unwrap_or_default(),
                python,
                source: "systeme".into(),
            });
        }
    }
    c.envs
}

/// Choisit l'env : par nom exact, par chemin (python ou préfixe), ou le
/// premier de la liste quand rien n'est demandé.
pub fn resolve_env(envs: &[PyEnv], demande: Option<&str>) -> Result<PyEnv, String> {
    let Some(demande) = demande.map(str::trim).filter(|d| !d.is_empty()) else {
        return envs
            .first()
            .cloned()
            .ok_or_else(|| "aucun Python trouvé sur cette machine".to_string());
    };
    if let Some(env) = envs.iter().find(|e| e.name == demande) {
        return Ok(env.clone());
    }
    // Nom court sans le suffixe de source : « pymc-albedo » trouve
    // « pymc-albedo (claude-science) » quand il est le seul de ce nom.
    let proches: Vec<&PyEnv> = envs
        .iter()
        .filter(|e| e.name.split(" (").next() == Some(demande))
        .collect();
    if proches.len() == 1 {
        return Ok(proches[0].clone());
    }
    let chemin = PathBuf::from(demande);
    if chemin.is_absolute() {
        if chemin.is_file() {
            let prefix = chemin
                .parent()
                .and_then(Path::parent)
                .map(Path::to_path_buf)
                .unwrap_or_default();
            return Ok(PyEnv {
                name: demande.to_string(),
                prefix,
                python: chemin,
                source: "chemin".into(),
            });
        }
        if let Some(python) = python_of(&chemin) {
            return Ok(PyEnv {
                name: demande.to_string(),
                prefix: chemin,
                python,
                source: "chemin".into(),
            });
        }
    }
    Err(format!(
        "env inconnu : {demande}. Envs disponibles : {}",
        envs.iter()
            .map(|e| e.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn faux_env(prefix: &Path) {
        std::fs::create_dir_all(prefix.join("bin")).unwrap();
        std::fs::write(prefix.join("bin/python"), "").unwrap();
    }

    #[test]
    fn trouve_les_envs_conda_le_venv_du_projet_et_ceux_de_claude_science() {
        let home = tempfile::tempdir().unwrap();
        let projet = tempfile::tempdir().unwrap();
        faux_env(&home.path().join("miniforge3"));
        faux_env(&home.path().join("miniforge3/envs/pymc-albedo"));
        faux_env(&home.path().join(".claude-science/conda/envs/pymc-albedo"));
        faux_env(&home.path().join(".claude-science/conda/envs/figures"));
        faux_env(&projet.path().join(".venv"));
        std::fs::write(projet.path().join(".venv/pyvenv.cfg"), "").unwrap();

        let envs = discover_envs(home.path(), Some(projet.path()));
        let noms: Vec<&str> = envs.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(
            noms[0], ".venv (projet)",
            "le venv du projet passe en premier"
        );
        assert!(noms.contains(&"base (miniforge3)"));
        assert!(noms.contains(&"pymc-albedo"));
        assert!(noms.contains(&"pymc-albedo (claude-science)"), "{noms:?}");
        assert!(noms.contains(&"figures"));
    }

    #[test]
    fn l_env_atelier_passe_avant_conda_mais_apres_l_env_du_projet() {
        let home = tempfile::tempdir().unwrap();
        let projet = tempfile::tempdir().unwrap();
        let atelier = home.path().join("app/python");
        faux_env(&home.path().join("miniforge3/envs/pymc-albedo"));
        faux_env(&home.path().join(".claude-science/conda/envs/figures"));
        // Hors `ATELIER_KERNEL_PYTHON` et Python système, qui dépendent de la
        // machine : le premier passe avant tout, le second après tout.
        let liste = |projet: Option<&Path>, pixi: bool| -> Vec<PyEnv> {
            discover_envs_with(home.path(), projet, Some(&atelier), pixi)
                .into_iter()
                .filter(|e| e.source != "variable" && e.source != "systeme")
                .collect()
        };
        let sources = |projet: Option<&Path>, pixi: bool| -> Vec<String> {
            liste(projet, pixi)
                .iter()
                .map(|e| format!("{}:{}", e.source, e.name))
                .collect()
        };

        // pixi là : « atelier » est le défaut, même pas encore installé ;
        // conda et Claude Science restent listés, derrière.
        assert_eq!(
            sources(None, true),
            ["atelier:atelier", "conda:pymc-albedo", "claude-science:figures"]
        );
        let envs = liste(None, true);
        let defaut = resolve_env(&envs, None).unwrap();
        assert_eq!(defaut.source, "atelier");
        assert_eq!(defaut.python, atelier.join(".pixi/envs/default/bin/python"));
        // À la demande, un env conda se prend toujours par son nom.
        assert_eq!(resolve_env(&envs, Some("pymc-albedo")).unwrap().source, "conda");

        // Sans pixi et sans env installé : l'ordre d'avant, sans « atelier ».
        assert_eq!(sources(None, false), ["conda:pymc-albedo", "claude-science:figures"]);
        // Sans pixi mais env déjà installé : il reste utilisable.
        faux_env(&atelier.join(".pixi/envs/default"));
        assert_eq!(sources(None, false)[0], "atelier:atelier");

        // Le projet garde la main : son pixi.toml, puis son .venv.
        faux_env(&projet.path().join(".venv"));
        std::fs::write(projet.path().join(".venv/pyvenv.cfg"), "").unwrap();
        assert_eq!(sources(Some(projet.path()), true)[..2], ["projet:.venv (projet)", "atelier:atelier"]);
        std::fs::write(projet.path().join("pixi.toml"), "[workspace]\n").unwrap();
        assert_eq!(
            sources(Some(projet.path()), true)[..3],
            ["pixi:pixi (projet)", "projet:.venv (projet)", "atelier:atelier"]
        );
        // Env pixi du projet pas installé et pas de pixi : il n'est pas proposé.
        assert_eq!(sources(Some(projet.path()), false)[0], "projet:.venv (projet)");

        // Un env conda qui s'appellerait « atelier » reste désignable.
        faux_env(&home.path().join("miniforge3/envs/atelier"));
        assert!(sources(None, true).contains(&"conda:atelier (conda)".to_string()));
    }

    #[test]
    fn un_env_sans_python_est_ignore() {
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join("miniforge3/envs/vide")).unwrap();
        let envs = discover_envs(home.path(), None);
        assert!(envs.iter().all(|e| e.name != "vide"));
    }

    #[test]
    fn resout_par_nom_par_nom_court_et_refuse_l_inconnu() {
        let home = tempfile::tempdir().unwrap();
        faux_env(&home.path().join(".claude-science/conda/envs/snicar"));
        let envs = discover_envs(home.path(), None);
        assert_eq!(resolve_env(&envs, Some("snicar")).unwrap().name, "snicar");
        let err = resolve_env(&envs, Some("absent")).unwrap_err();
        assert!(err.contains("snicar"), "l'erreur liste les envs : {err}");
    }
}
