//! Découverte unifiée des noyaux Jupyter (`kernelspec` `kernel.json` :
//! `ipykernel`, `IRkernel`, `IJulia`, etc.) et des environnements Python
//! d'Atelier (Pixi, `.venv`, Conda, Claude Science, Python système).
//!
//! Lorsqu'un environnement Python possède `ipykernel`, Atelier le lance en
//! vrai noyau Jupyter ZeroMQ 5 canaux (`python -m ipykernel_launcher -f {connection_file}`).
//! Lorsqu'un environnement Python léger n'a pas `ipykernel` installé, il reste
//! immédiatement exécutable grâce au moteur Python intégré d'Atelier (`atelier-kernel`),
//! sans forcer l'installation préalable d'un paquet.

use atelier_kernel::{discover_envs_with, PyEnv};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum KernelBackendKind {
    /// Noyau Jupyter standard parlant ZMTP 3.x sur 5 sockets (`ipykernel`, `IRkernel`, `IJulia`…).
    ZmqKernelspec,
    /// Noyau Python persistant d'Atelier (`atelier_noyau.py`) pour un env Python sans `ipykernel`.
    AtelierPythonFallback,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredKernel {
    /// Identifiant unique stable pour la sélection (`zmq:python3`, `env:pymc-albedo`, etc.).
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub language: String,
    /// Origine affichée dans le menu (`Pixi`, `Conda`, `Jupyter`, `Projet`, `Système`).
    pub source: String,
    pub backend: KernelBackendKind,
    /// Ligne de commande modèle contenant `{connection_file}` pour `ZmqKernelspec`.
    pub argv: Vec<String>,
    #[serde(default)]
    pub env_vars: HashMap<String, String>,
    pub prefix: Option<PathBuf>,
    pub python_executable: Option<PathBuf>,
}

/// Dossiers standards de `kernelspec` Jupyter sur macOS et Linux.
pub fn standard_jupyter_kernel_dirs(home: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(jpath) = std::env::var("JUPYTER_PATH") {
        for part in jpath.split(':').filter(|s| !s.is_empty()) {
            dirs.push(Path::new(part).join("kernels"));
        }
    }
    // Dossier de données de l'utilisateur : forcé, puis macOS, puis Linux
    // (XDG_DATA_HOME, `~/.local/share` par défaut), comme `jupyter --paths`.
    if let Some(data) = std::env::var_os("JUPYTER_DATA_DIR").filter(|v| !v.is_empty()) {
        dirs.push(PathBuf::from(data).join("kernels"));
    }
    dirs.push(home.join("Library/Jupyter/kernels"));
    if let Some(xdg) = std::env::var_os("XDG_DATA_HOME").filter(|v| !v.is_empty()) {
        dirs.push(PathBuf::from(xdg).join("jupyter/kernels"));
    }
    dirs.push(home.join(".local/share/jupyter/kernels"));
    dirs.push(PathBuf::from("/opt/homebrew/share/jupyter/kernels"));
    dirs.push(PathBuf::from("/usr/local/share/jupyter/kernels"));
    dirs.push(PathBuf::from("/usr/share/jupyter/kernels"));
    // XDG_DATA_HOME vaut souvent `~/.local/share` : un dossier vu deux fois
    // listerait ses noyaux en double.
    let mut seen = HashSet::new();
    dirs.retain(|d| seen.insert(d.clone()));
    dirs
}

/// Vérifie rapidement si `ipykernel` est présent dans le `site-packages` d'un préfixe Python
/// sans lancer de sous-processus au simple survol du menu.
pub fn env_has_ipykernel(prefix: &Path) -> bool {
    let lib = prefix.join("lib");
    if let Ok(entries) = std::fs::read_dir(&lib) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let s = name.to_string_lossy();
            if s.starts_with("python") {
                let sp = entry.path().join("site-packages/ipykernel");
                if sp.is_dir() {
                    return true;
                }
            }
        }
    }
    // Windows / schémas alternatifs éventuels
    prefix.join("Lib/site-packages/ipykernel").is_dir()
}

fn read_kernelspec_dir(spec_dir: &Path, source: &str) -> Option<DiscoveredKernel> {
    let kernel_json = spec_dir.join("kernel.json");
    let text = std::fs::read_to_string(&kernel_json).ok()?;
    let val: Value = serde_json::from_str(&text).ok()?;
    let argv: Vec<String> = val
        .get("argv")?
        .as_array()?
        .iter()
        .filter_map(Value::as_str)
        .map(str::to_string)
        .collect();
    if argv.is_empty() {
        return None;
    }
    let first_bin = Path::new(&argv[0]);
    if first_bin.is_absolute() && !first_bin.is_file() {
        return None;
    }
    let name = spec_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "kernel".into());
    let display_name = val
        .get("display_name")
        .and_then(Value::as_str)
        .unwrap_or(&name)
        .to_string();
    let language = val
        .get("language")
        .and_then(Value::as_str)
        .unwrap_or("python")
        .to_lowercase();
    let env_vars: HashMap<String, String> = val
        .get("env")
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                .collect()
        })
        .unwrap_or_default();

    Some(DiscoveredKernel {
        id: format!("spec:{}", spec_dir.display()),
        name,
        display_name,
        language,
        source: source.to_string(),
        backend: KernelBackendKind::ZmqKernelspec,
        argv,
        env_vars,
        prefix: None,
        python_executable: None,
    })
}

fn friendly_source(src: &str) -> &'static str {
    match src {
        "pixi" => "Pixi projet",
        "atelier" => "Pixi Atelier",
        "projet" => "Venv projet",
        "conda" => "Conda",
        "claude-science" => "Claude Science",
        "systeme" => "Système",
        _ => "Python",
    }
}

pub(crate) fn pyenv_to_kernel(env: PyEnv) -> DiscoveredKernel {
    let has_ipy = env_has_ipykernel(&env.prefix);
    let source_label = friendly_source(&env.source);
    let backend = if has_ipy {
        KernelBackendKind::ZmqKernelspec
    } else {
        KernelBackendKind::AtelierPythonFallback
    };
    let argv = if has_ipy {
        vec![
            env.python.display().to_string(),
            "-m".into(),
            "ipykernel_launcher".into(),
            "-f".into(),
            "{connection_file}".into(),
        ]
    } else {
        Vec::new()
    };
    let mut env_vars = HashMap::new();
    let bin = env.prefix.join("bin");
    if let Ok(path) = std::env::var("PATH") {
        env_vars.insert("PATH".into(), format!("{}:{path}", bin.display()));
    }
    if env.prefix.join("conda-meta").is_dir() {
        env_vars.insert("CONDA_PREFIX".into(), env.prefix.display().to_string());
        env_vars.insert("CONDA_DEFAULT_ENV".into(), env.name.clone());
    } else if env.prefix.join("pyvenv.cfg").is_file() {
        env_vars.insert("VIRTUAL_ENV".into(), env.prefix.display().to_string());
    }
    for (var, rel) in [
        ("PROJ_DATA", "share/proj"),
        ("PROJ_LIB", "share/proj"),
        ("GDAL_DATA", "share/gdal"),
    ] {
        let dir = env.prefix.join(rel);
        if dir.is_dir() {
            env_vars.insert(var.into(), dir.display().to_string());
        }
    }

    DiscoveredKernel {
        id: format!("pyenv:{}", env.name),
        display_name: env.name.clone(),
        name: env.name,
        language: "python".into(),
        source: if has_ipy {
            format!("{source_label} · ZMQ")
        } else {
            source_label.to_string()
        },
        backend,
        argv,
        env_vars,
        prefix: Some(env.prefix),
        python_executable: Some(env.python),
    }
}

/// Découvre l'ensemble des noyaux utilisables pour un projet :
/// 1. Environnements Python du projet et d'Atelier (`discover_envs_with`) ;
/// 2. `kernelspec` supplémentaires installés dans ces environnements (ex. `ir` / R `IRkernel`, `julia`) ;
/// 3. `kernelspec` globaux de l'utilisateur (`~/Library/Jupyter/kernels`, etc.).
pub fn discover_kernels(
    home: &Path,
    project_root: Option<&Path>,
    atelier_kernel_dir: Option<&Path>,
) -> Vec<DiscoveredKernel> {
    let pixi_present = atelier_kernel::pixi::find_pixi(home).is_some();
    let py_envs = discover_envs_with(home, project_root, atelier_kernel_dir, pixi_present);
    discover_kernels_from(home, py_envs)
}

/// Comme `discover_kernels`, à partir d'une liste d'envs déjà faite (celle
/// du `KernelManager` d'Atelier : env « atelier » compris, proposé même avant
/// d'exister quand pixi est là ou téléchargeable).
pub fn discover_kernels_from(home: &Path, py_envs: Vec<PyEnv>) -> Vec<DiscoveredKernel> {
    let mut out = Vec::new();
    let mut seen_bins = HashSet::new();

    // 1. Envs Python découverts par Atelier (+ leurs kernelspecs non-Python comme R / Julia)
    for env in py_envs {
        let extra_specs_dir = env.prefix.join("share/jupyter/kernels");
        let k = pyenv_to_kernel(env);
        if let Some(py) = &k.python_executable {
            seen_bins.insert(py.clone());
        }
        out.push(k);

        if let Ok(rd) = std::fs::read_dir(extra_specs_dir) {
            for entry in rd.flatten() {
                if let Some(spec) = read_kernelspec_dir(&entry.path(), "Kernelspec env") {
                    if spec.language != "python" {
                        out.push(spec);
                    }
                }
            }
        }
    }

    // 2. Kernelspecs globaux de la machine
    for dir in standard_jupyter_kernel_dirs(home) {
        let Ok(rd) = std::fs::read_dir(&dir) else {
            continue;
        };
        let mut subdirs: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
        subdirs.sort();
        for spec_dir in subdirs {
            if let Some(spec) = read_kernelspec_dir(&spec_dir, "Jupyter") {
                let dup = spec
                    .argv
                    .first()
                    .map(PathBuf::from)
                    .is_some_and(|b| seen_bins.contains(&b));
                if !dup {
                    out.push(spec);
                }
            }
        }
    }

    out
}

/// Choisit le meilleur noyau par défaut pour un cahier `.ipynb`.
pub fn select_default_kernel(
    kernels: &[DiscoveredKernel],
    preferred_name: Option<&str>,
    language: &str,
) -> Option<DiscoveredKernel> {
    if let Some(pref) = preferred_name {
        if let Some(found) = kernels
            .iter()
            .find(|k| k.id == pref || k.name.eq_ignore_ascii_case(pref))
        {
            return Some(found.clone());
        }
    }
    if let Some(lang_match) = kernels
        .iter()
        .find(|k| k.language.eq_ignore_ascii_case(language))
    {
        return Some(lang_match.clone());
    }
    kernels.first().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_custom_r_and_python_kernelspecs() {
        let tmp = tempfile::tempdir().unwrap();
        let r_dir = tmp.path().join("ir");
        std::fs::create_dir_all(&r_dir).unwrap();
        std::fs::write(
            r_dir.join("kernel.json"),
            r#"{"argv": ["R", "--slave", "-e", "IRkernel::main()", "--args", "{connection_file}"], "display_name": "R 4.4 (brms)", "language": "R"}"#,
        )
        .unwrap();

        let spec = read_kernelspec_dir(&r_dir, "Jupyter").unwrap();
        assert_eq!(spec.language, "r");
        assert_eq!(spec.display_name, "R 4.4 (brms)");
        assert_eq!(spec.backend, KernelBackendKind::ZmqKernelspec);
    }
}

#[cfg(test)]
mod linux_dirs_tests {
    use super::standard_jupyter_kernel_dirs;
    use std::path::Path;

    /// Linux : les noyaux installés par `python -m ipykernel install --user`
    /// vont dans `~/.local/share/jupyter/kernels` ; listés une seule fois.
    #[test]
    fn linux_user_kernel_dir_is_listed_once() {
        let home = Path::new("/home/thierry");
        let dirs = standard_jupyter_kernel_dirs(home);
        let local = home.join(".local/share/jupyter/kernels");
        assert_eq!(dirs.iter().filter(|d| **d == local).count(), 1);
        assert!(dirs.contains(&Path::new("/usr/share/jupyter/kernels").to_path_buf()));
    }
}
