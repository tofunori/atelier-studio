//! Découverte des environnements Python de l'utilisateur.
//!
//! Le noyau tourne dans un env existant, jamais dans un Python fourni par
//! Atelier : c'est là que sont les paquets de la thèse (PyMC, xarray,
//! rasterio…). On cherche les envs conda et mamba aux endroits habituels,
//! ceux de Claude Science (`~/.claude-science/conda/envs`), le `.venv` du
//! projet, et `ATELIER_KERNEL_PYTHON` qui l'emporte sur tout.

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
    /// D'où vient l'env : `conda`, `claude-science`, `projet`, `variable`, `systeme`.
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

/// Liste les envs disponibles, dans l'ordre de préférence par défaut.
pub fn discover_envs(home: &Path, project_root: Option<&Path>) -> Vec<PyEnv> {
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
        for venv in [".venv", "venv", "env"] {
            let prefix = root.join(venv);
            if prefix.join("pyvenv.cfg").is_file() {
                c.ajouter(format!("{venv} (projet)"), &prefix, "projet");
            }
        }
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
