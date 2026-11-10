//! Paquets installés dans un env Python, lus des dossiers `*.dist-info` sans
//! lancer de processus. Sert à l'instantané d'env du noyau (versions des
//! paquets au démarrage) et aux recettes des scripts (`atelier-runtime`).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;

/// Nom de distribution d'un module quand il diffère (`sklearn` →
/// `scikit-learn`). Le reste se retrouve par son propre nom.
pub fn distribution_for(module: &str) -> &str {
    match module {
        "sklearn" => "scikit_learn",
        "skimage" => "scikit_image",
        "PIL" => "pillow",
        "cv2" => "opencv_python",
        "yaml" => "pyyaml",
        "bs4" => "beautifulsoup4",
        "osgeo" => "gdal",
        "mpl_toolkits" => "matplotlib",
        "dateutil" => "python_dateutil",
        "netCDF4" => "netcdf4",
        "Bio" => "biopython",
        "attr" => "attrs",
        "jose" => "python_jose",
        other => other,
    }
}

pub fn normalize_dist(name: &str) -> String {
    name.to_ascii_lowercase().replace(['-', '.'], "_")
}

/// Versions installées dans un env, lues des dossiers `*.dist-info`, et la
/// version de Python quand elle se lit (conda-meta ou `lib/pythonX.Y`).
pub fn installed_python_packages(prefix: &Path) -> (Option<String>, HashMap<String, String>) {
    let mut packages = HashMap::new();
    let mut python = None;
    if let Ok(meta) = std::fs::read_dir(prefix.join("conda-meta")) {
        for entry in meta.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(rest) = name.strip_prefix("python-") {
                if rest.starts_with(|c: char| c.is_ascii_digit()) {
                    python = rest.split('-').next().map(str::to_string);
                }
            }
        }
    }
    let Ok(lib) = std::fs::read_dir(prefix.join("lib")) else {
        return (python, packages);
    };
    for dir in lib.flatten() {
        let dir_name = dir.file_name().to_string_lossy().to_string();
        let Some(version) = dir_name.strip_prefix("python") else { continue };
        if python.is_none() && version.starts_with(|c: char| c.is_ascii_digit()) {
            python = Some(version.to_string());
        }
        let Ok(site) = std::fs::read_dir(dir.path().join("site-packages")) else { continue };
        for entry in site.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let Some(stem) = name
                .strip_suffix(".dist-info")
                .or_else(|| name.strip_suffix(".egg-info"))
            else {
                continue;
            };
            if let Some((dist, version)) = stem.split_once('-') {
                let version = version.split('-').next().unwrap_or(version);
                packages.insert(normalize_dist(dist), version.to_string());
            }
        }
    }
    (python, packages)
}

/// Instantané de l'env d'un noyau, pris à son démarrage et repris quand
/// l'outil y ajoute ou retire un paquet : de quoi dire, des
/// mois plus tard, avec quelles versions une cellule a calculé.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvSnapshot {
    pub name: String,
    pub prefix: String,
    pub python: String,
    /// Distribution normalisée → version.
    pub packages: BTreeMap<String, String>,
    /// sha256 de la liste triée `nom==version`, préfixée de Python et suivie
    /// de l'empreinte du verrou quand l'env en a un.
    pub sha256: String,
    /// Verrou d'un env pixi (`pixi.lock`) et son sha256 : il fixe tout l'env,
    /// bibliothèques non Python comprises (GDAL, compilateurs).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock_sha256: Option<String>,
}

impl EnvSnapshot {
    pub fn read(name: &str, prefix: &Path, python: &str) -> Self {
        let (_, installed) = installed_python_packages(prefix);
        let packages: BTreeMap<String, String> = installed.into_iter().collect();
        let lock = crate::pixi::lock_print(prefix);
        let mut h = Sha256::new();
        h.update(format!("python=={python}\n"));
        for (k, v) in &packages {
            h.update(format!("{k}=={v}\n"));
        }
        // Sans verrou, l'empreinte reste celle d'avant.
        if let Some((_, sha)) = &lock {
            h.update(format!("lock=={sha}\n"));
        }
        let (lock_file, lock_sha256) = lock.unzip();
        Self {
            name: name.to_string(),
            prefix: prefix.display().to_string(),
            python: python.to_string(),
            packages,
            sha256: hex::encode(h.finalize()),
            lock_file,
            lock_sha256,
        }
    }

    /// Version du paquet qui fournit ce module importé, s'il est connu.
    pub fn version_of(&self, module: &str) -> Option<&String> {
        self.packages
            .get(&normalize_dist(distribution_for(module)))
            .or_else(|| self.packages.get(&normalize_dist(module)))
    }

    /// Modules importés avec la version de leur paquet ; ceux dont la
    /// version ne se lit pas (modules du projet) sont laissés de côté.
    pub fn versions(&self, modules: &[String]) -> BTreeMap<String, String> {
        modules
            .iter()
            .filter_map(|m| self.version_of(m).map(|v| (m.clone(), v.clone())))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instantane_et_versions_des_modules() {
        let dir = tempfile::tempdir().unwrap();
        let site = dir.path().join("lib/python3.12/site-packages");
        std::fs::create_dir_all(site.join("numpy-2.1.3.dist-info")).unwrap();
        std::fs::create_dir_all(site.join("scikit_learn-1.5.0.dist-info")).unwrap();
        let snap = EnvSnapshot::read("albedo", dir.path(), "3.12.13");
        assert_eq!(snap.packages.len(), 2);
        let v = snap.versions(&["numpy".into(), "sklearn".into(), "monprojet".into()]);
        assert_eq!(v.get("numpy").map(String::as_str), Some("2.1.3"));
        assert_eq!(v.get("sklearn").map(String::as_str), Some("1.5.0"));
        assert!(!v.contains_key("monprojet"));
        assert_eq!(snap.sha256, EnvSnapshot::read("x", dir.path(), "3.12.13").sha256);
        assert_ne!(snap.sha256, EnvSnapshot::read("x", dir.path(), "3.12.14").sha256);
        assert_eq!((&snap.lock_file, &snap.lock_sha256), (&None, &None));
    }

    #[test]
    fn le_verrou_pixi_entre_dans_l_instantane() {
        let dir = tempfile::tempdir().unwrap();
        let prefix = crate::pixi::env_prefix(dir.path());
        std::fs::create_dir_all(prefix.join("lib/python3.12/site-packages/numpy-2.1.3.dist-info")).unwrap();
        let sans = EnvSnapshot::read("atelier", &prefix, "3.12.13");
        assert_eq!(sans.lock_sha256, None);

        std::fs::write(dir.path().join("pixi.lock"), "version: 7\npackages: [gdal 3.9]\n").unwrap();
        let avec = EnvSnapshot::read("atelier", &prefix, "3.12.13");
        assert!(avec.lock_file.as_deref().unwrap().ends_with("pixi.lock"));
        assert_eq!(avec.lock_sha256.as_deref().map(str::len), Some(64));
        assert_ne!(avec.sha256, sans.sha256);

        // Un paquet non Python de plus (rien ne bouge dans site-packages) :
        // seul le verrou le voit, et l'empreinte de l'instantané suit.
        std::fs::write(dir.path().join("pixi.lock"), "version: 7\npackages: [gdal 3.10]\n").unwrap();
        let apres = EnvSnapshot::read("atelier", &prefix, "3.12.13");
        assert_eq!(apres.packages, avec.packages);
        assert_ne!(apres.sha256, avec.sha256);

        // Un instantané d'avant, sans verrou, se relit toujours.
        let ancien = serde_json::json!({"name": "x", "prefix": "/p", "python": "3.12", "packages": {}, "sha256": "ab"});
        let relu: EnvSnapshot = serde_json::from_value(ancien).unwrap();
        assert_eq!(relu.lock_sha256, None);
        assert!(!serde_json::to_string(&relu).unwrap().contains("lock"));
        assert!(serde_json::to_string(&avec).unwrap().contains("lockSha256"));
    }
}
