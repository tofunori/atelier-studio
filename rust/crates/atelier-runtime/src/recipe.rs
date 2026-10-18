//! Recette d'un fichier produit (chantier 2b du rattrapage Claude Science,
//! 2026-10-18) : le script et son empreinte, la commande exacte, les fichiers
//! d'entrée avec leur empreinte et l'environnement (env conda, versions des
//! paquets importés par le script).
//!
//! Tout est lu sans lancer de processus : la commande vient des événements
//! outils du tour, les entrées des arguments de la commande et des chaînes
//! littérales du script, les versions des dossiers `*.dist-info` de l'env.
//! Rien n'est copié : on garde des chemins, des tailles et des empreintes.

use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::{Path, PathBuf};

/// Extensions des fichiers de données qu'une recette peut citer comme entrée.
/// Les fichiers sans extension (`.env`, clés SSH…) n'y entrent jamais.
const DATA_EXTS: [&str; 34] = [
    "csv", "tsv", "txt", "dat", "json", "geojson", "gpkg", "shp", "nc", "nc4", "h5", "hdf5",
    "hdf", "he5", "tif", "tiff", "parquet", "feather", "arrow", "xlsx", "xls", "npz", "npy",
    "pkl", "pickle", "rds", "rdata", "rda", "mat", "zarr", "bib", "yaml", "yml", "toml",
];
/// Scripts susceptibles d'avoir produit un fichier (même liste que `prov.rs`).
pub const SCRIPT_EXTS: [&str; 6] = ["py", "r", "jl", "sh", "tex", "mjs"];
const INPUTS_MAX: usize = 30;
const PACKAGES_MAX: usize = 30;
/// Un script plus gros n'est pas lu pour y chercher ses entrées.
const SCRIPT_SCAN_MAX_BYTES: u64 = 1 << 20;
/// Empreinte complète jusqu'à 64 Mo par fichier et 256 Mo par tour : au-delà
/// (gros NetCDF du NAS), on garde taille et date, ce qui suffit à voir qu'un
/// fichier a changé sans relire des gigaoctets à chaque tour.
const HASH_FILE_MAX_BYTES: u64 = 64 << 20;
const HASH_TURN_BUDGET_BYTES: u64 = 256 << 20;

fn extension_lower(path: &str) -> Option<String> {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

pub fn is_script_path(path: &str) -> bool {
    extension_lower(path).is_some_and(|ext| SCRIPT_EXTS.contains(&ext.as_str()))
}

fn is_data_path(path: &str) -> bool {
    !path.ends_with(".prov.json")
        && extension_lower(path).is_some_and(|ext| DATA_EXTS.contains(&ext.as_str()))
}

fn stem_of(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

fn file_name_of(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
}

/// Découpe une ligne de shell en mots : guillemets simples et doubles,
/// antislash, et séparateurs `; | & ( ) < >` qui coupent aussi les mots.
/// `--entree=data.csv` donne `--entree=data.csv` puis `data.csv` : la valeur
/// d'une option est un mot comme un autre.
fn shell_words(command: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut chars = command.chars().peekable();
    let flush = |current: &mut String, words: &mut Vec<String>| {
        if !current.is_empty() {
            if let Some((_, value)) = current.split_once('=') {
                if current.starts_with('-') && !value.is_empty() {
                    words.push(current.clone());
                    words.push(value.to_string());
                    current.clear();
                    return;
                }
            }
            words.push(std::mem::take(current));
        }
    };
    while let Some(c) = chars.next() {
        match quote {
            Some(q) if c == q => quote = None,
            Some('"') if c == '\\' => {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            }
            Some(_) => current.push(c),
            None => match c {
                '\'' | '"' => quote = Some(c),
                '\\' => {
                    if let Some(next) = chars.next() {
                        current.push(next);
                    }
                }
                c if c.is_whitespace() => flush(&mut current, &mut words),
                ';' | '|' | '&' | '(' | ')' | '<' | '>' => {
                    flush(&mut current, &mut words);
                    words.push(c.to_string());
                }
                _ => current.push(c),
            },
        }
    }
    flush(&mut current, &mut words);
    words
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn expand(word: &str, base: &Path) -> PathBuf {
    if let Some(rest) = word.strip_prefix("~/") {
        if let Some(home) = home() {
            return home.join(rest);
        }
    }
    let path = Path::new(word);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    }
}

/// Chemin tel qu'il s'affiche : relatif à la racine du projet quand il y vit,
/// absolu sinon (données du NAS).
pub fn display_path(root: &Path, abs: &Path) -> String {
    match abs.strip_prefix(root) {
        Ok(rel) => rel.to_string_lossy().to_string(),
        Err(_) => abs.to_string_lossy().to_string(),
    }
}

/// Retire les `./` et `..` purement lexicaux, sans toucher au disque.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Ce qu'une commande touche, vu de ses arguments.
#[derive(Debug, Default, Clone)]
pub struct CommandFacts {
    pub text: String,
    /// Fichiers existants cités par la commande (chemins absolus normalisés).
    pub files: Vec<PathBuf>,
    /// Préfixe de l'environnement qui exécute la commande, s'il se lit.
    pub env_prefix: Option<PathBuf>,
    /// Nom d'env conda cité (`conda run -n albedo`, `conda activate albedo`).
    pub env_name: Option<String>,
}

pub fn command_facts(root: &Path, command: &str) -> CommandFacts {
    let words = shell_words(command);
    let mut facts = CommandFacts {
        text: command.to_string(),
        ..CommandFacts::default()
    };
    let mut base = root.to_path_buf();
    let mut i = 0;
    while i < words.len() {
        let word = words[i].as_str();
        let next = words.get(i + 1).map(String::as_str);
        // `cd dossier && python plot.py` : la suite se lit depuis `dossier`.
        if word == "cd" {
            if let Some(dir) = next {
                let target = normalize(&expand(dir, &base));
                if target.is_dir() {
                    base = target;
                }
                i += 2;
                continue;
            }
        }
        if matches!(word, "-n" | "--name") && facts.env_name.is_none() {
            if let Some(name) = next {
                let runner = words[..i].iter().any(|w| {
                    matches!(w.as_str(), "conda" | "mamba" | "micromamba")
                        || w.ends_with("/conda")
                        || w.ends_with("/mamba")
                        || w.ends_with("/micromamba")
                });
                if runner {
                    facts.env_name = Some(name.to_string());
                }
            }
        }
        if matches!(word, "-p" | "--prefix") && facts.env_prefix.is_none() {
            if let Some(prefix) = next {
                let prefix = normalize(&expand(prefix, &base));
                if prefix.join("conda-meta").is_dir() {
                    facts.env_prefix = Some(prefix);
                }
            }
        }
        if word == "activate" && facts.env_name.is_none() {
            if let Some(name) = next.filter(|n| !n.starts_with('-')) {
                if name.contains('/') {
                    facts.env_prefix = Some(normalize(&expand(name, &base)));
                } else {
                    facts.env_name = Some(name.to_string());
                }
            }
        }
        if !word.starts_with('-') && word.len() > 1 {
            let path = normalize(&expand(word, &base));
            // Interpréteur d'un env : `…/envs/albedo/bin/python3`.
            if facts.env_prefix.is_none() {
                let name = file_name_of(word);
                if name.starts_with("python") || name == "Rscript" || name == "R" {
                    if let Some(bin) = path.parent().filter(|p| p.ends_with("bin")) {
                        if let Some(prefix) = bin.parent() {
                            if prefix.join("lib").is_dir() {
                                facts.env_prefix = Some(prefix.to_path_buf());
                            }
                        }
                    }
                }
            }
            if path.is_file() && !facts.files.contains(&path) {
                facts.files.push(path);
            }
        }
        i += 1;
    }
    facts
}

/// Dossiers où chercher un env conda par son nom : la liste que conda tient
/// lui-même (`~/.conda/environments.txt`), puis les installations courantes.
fn conda_env_by_name(name: &str) -> Option<PathBuf> {
    let home = home()?;
    if let Ok(list) = std::fs::read_to_string(home.join(".conda/environments.txt")) {
        for line in list.lines().map(str::trim).filter(|l| !l.is_empty()) {
            let prefix = PathBuf::from(line);
            let base_named = name == "base" && !line.contains("/envs/");
            if base_named || prefix.file_name().and_then(|n| n.to_str()) == Some(name) {
                if prefix.is_dir() {
                    return Some(prefix);
                }
            }
        }
    }
    let bases = [
        home.join("miniforge3"),
        home.join("miniconda3"),
        home.join("anaconda3"),
        home.join("mambaforge"),
        home.join("micromamba"),
        home.join("opt/miniconda3"),
        home.join("opt/anaconda3"),
        PathBuf::from("/opt/miniconda3"),
        PathBuf::from("/opt/anaconda3"),
        PathBuf::from("/opt/homebrew/Caskroom/miniforge/base"),
        PathBuf::from("/opt/homebrew/anaconda3"),
    ];
    bases.into_iter().find_map(|base| {
        let prefix = if name == "base" { base } else { base.join("envs").join(name) };
        prefix.join("conda-meta").is_dir().then_some(prefix)
    })
}

pub fn resolve_env_prefix(facts: &CommandFacts) -> Option<PathBuf> {
    facts
        .env_prefix
        .clone()
        .or_else(|| facts.env_name.as_deref().and_then(conda_env_by_name))
}

/// Modules importés par un script Python (`import a.b`, `from a import b`).
pub fn python_imports(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |module: &str| {
        let top = module.trim().split('.').next().unwrap_or("").trim();
        if !top.is_empty()
            && top.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
            && !out.iter().any(|m| m == top)
        {
            out.push(top.to_string());
        }
    };
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("import ") {
            for part in rest.split(',') {
                push(part.split_whitespace().next().unwrap_or(""));
            }
        } else if let Some(rest) = line.strip_prefix("from ") {
            let module = rest.split_whitespace().next().unwrap_or("");
            if !module.starts_with('.') {
                push(module);
            }
        }
    }
    out
}

/// Paquets chargés par un script R (`library(x)`, `require("x")`).
pub fn r_libraries(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for call in ["library(", "require(", "requireNamespace("] {
        let mut rest = text;
        while let Some(at) = rest.find(call) {
            rest = &rest[at + call.len()..];
            let name: String = rest
                .trim_start_matches(['"', '\''])
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '.' || *c == '_')
                .collect();
            if !name.is_empty() && !out.contains(&name) {
                out.push(name);
            }
        }
    }
    out
}

/// Nom de distribution d'un module quand il diffère (`sklearn` →
/// `scikit-learn`). Le reste se retrouve par son propre nom.
fn distribution_for(module: &str) -> &str {
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

fn normalize_dist(name: &str) -> String {
    name.to_ascii_lowercase().replace(['-', '.'], "_")
}

/// Versions installées dans un env, lues des dossiers `*.dist-info`.
fn installed_python_packages(prefix: &Path) -> (Option<String>, HashMap<String, String>) {
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

fn r_package_version(prefix: Option<&Path>, package: &str) -> Option<String> {
    let mut libraries = Vec::new();
    if let Some(prefix) = prefix {
        libraries.push(prefix.join("lib/R/library"));
    }
    libraries.push(PathBuf::from(
        "/Library/Frameworks/R.framework/Resources/library",
    ));
    libraries.into_iter().find_map(|lib| {
        let text = std::fs::read_to_string(lib.join(package).join("DESCRIPTION")).ok()?;
        text.lines()
            .find_map(|l| l.strip_prefix("Version:"))
            .map(|v| v.trim().to_string())
    })
}

/// Environnement d'une recette : env conda, version de Python et versions
/// des paquets que le script importe.
pub fn environment(prefix: Option<&Path>, script: Option<(&str, &str)>) -> Value {
    let mut env = serde_json::Map::new();
    if let Some(prefix) = prefix {
        env.insert("prefix".into(), json!(prefix.to_string_lossy()));
        if let Some(name) = prefix.file_name().and_then(|n| n.to_str()) {
            if prefix.join("conda-meta").is_dir() {
                env.insert("conda".into(), json!(name));
            }
        }
    }
    let mut packages = BTreeMap::new();
    if let Some((path, text)) = script {
        match extension_lower(path).as_deref() {
            Some("py") => {
                let (python, installed) = prefix
                    .map(installed_python_packages)
                    .unwrap_or_default();
                if let Some(python) = python {
                    env.insert("python".into(), json!(python));
                }
                for module in python_imports(text) {
                    let dist = normalize_dist(distribution_for(&module));
                    if let Some(version) = installed.get(&dist) {
                        packages.insert(module, version.clone());
                    }
                    if packages.len() >= PACKAGES_MAX {
                        break;
                    }
                }
            }
            Some("r") => {
                for package in r_libraries(text) {
                    if let Some(version) = r_package_version(prefix, &package) {
                        packages.insert(package, version);
                    }
                    if packages.len() >= PACKAGES_MAX {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    if !packages.is_empty() {
        env.insert("packages".into(), json!(packages));
    }
    Value::Object(env)
}

/// Chaînes littérales d'un script qui désignent un fichier de données
/// existant (`pd.read_csv("data/panel.csv")`). Les chemins construits
/// (f-strings, `os.path.join`, motifs `*`) ne sont pas devinés.
pub fn script_literal_inputs(root: &Path, script_abs: &Path, text: &str) -> Vec<PathBuf> {
    let script_dir = script_abs.parent().unwrap_or(root);
    let mut out = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') || trimmed.starts_with('%') {
            continue;
        }
        let mut rest = line;
        while let Some(start) = rest.find(['"', '\'']) {
            let quote = rest[start..].chars().next().unwrap_or('"');
            let after = &rest[start + 1..];
            let Some(end) = after.find(quote) else { break };
            let literal = &after[..end];
            rest = &after[end + 1..];
            if literal.is_empty()
                || literal.len() > 512
                || literal.contains(['{', '}', '*', '?', '$', '\n'])
                || !is_data_path(literal)
            {
                continue;
            }
            let candidates = [expand(literal, root), expand(literal, script_dir)];
            if let Some(found) = candidates.iter().map(|p| normalize(p)).find(|p| p.is_file()) {
                if !out.contains(&found) {
                    out.push(found);
                }
            }
            if out.len() >= INPUTS_MAX {
                return out;
            }
        }
    }
    out
}

/// Empreintes des fichiers, calculées une fois par tour même si plusieurs
/// fichiers produits partagent les mêmes entrées.
pub struct Fingerprints {
    cache: HashMap<PathBuf, Value>,
    budget: u64,
}

impl Default for Fingerprints {
    fn default() -> Self {
        Self {
            cache: HashMap::new(),
            budget: HASH_TURN_BUDGET_BYTES,
        }
    }
}

impl Fingerprints {
    /// `{path, size, mtime, sha256}` ; `sha256` manque quand le fichier
    /// dépasse les plafonds ou ne se lit pas.
    pub fn of(&mut self, root: &Path, abs: &Path) -> Option<Value> {
        if let Some(found) = self.cache.get(abs) {
            return Some(found.clone());
        }
        let meta = std::fs::metadata(abs).ok().filter(|m| m.is_file())?;
        let size = meta.len();
        let mut value = json!({"path": display_path(root, abs), "size": size});
        if let Ok(modified) = meta.modified() {
            let at: chrono::DateTime<chrono::Utc> = modified.into();
            value["mtime"] = json!(at.format("%Y-%m-%dT%H:%M:%SZ").to_string());
        }
        if size <= HASH_FILE_MAX_BYTES && size <= self.budget {
            if let Some(hash) = sha256_file(abs) {
                self.budget -= size;
                value["sha256"] = json!(hash);
            }
        }
        self.cache.insert(abs.to_path_buf(), value.clone());
        Some(value)
    }
}

fn sha256_file(path: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(hex::encode(hasher.finalize()))
}

/// Masque les secrets visibles dans une commande (`TOKEN=…`, `--password x`,
/// `Bearer …`, `user:motdepasse@hôte`). La commande reste rejouable à l'œil ;
/// le secret n'atterrit ni dans le journal ni à côté des figures.
pub fn redact_command(command: &str) -> String {
    const HINTS: [&str; 8] = [
        "TOKEN", "SECRET", "PASSWORD", "PASSWD", "API_KEY", "APIKEY", "ACCESS_KEY", "PRIVATE_KEY",
    ];
    const FLAGS: [&str; 6] = [
        "--password", "--passwd", "--token", "--api-key", "--secret", "--access-key",
    ];
    let mut changed = false;
    let mut mask_next = false;
    let mut parts: Vec<String> = Vec::new();
    for word in command.split(' ') {
        if mask_next && !word.is_empty() {
            parts.push("***".into());
            mask_next = false;
            changed = true;
            continue;
        }
        let lower = word.to_ascii_lowercase();
        if FLAGS.contains(&lower.as_str()) || lower == "bearer" {
            mask_next = true;
            parts.push(word.to_string());
            continue;
        }
        if let Some((key, value)) = word.split_once('=') {
            let upper = key.trim_start_matches('-').to_ascii_uppercase().replace('-', "_");
            if !value.is_empty() && HINTS.iter().any(|hint| upper.contains(hint)) {
                parts.push(format!("{key}=***"));
                changed = true;
                continue;
            }
        }
        // `https://user:secret@hôte/…`
        if let Some(scheme_end) = word.find("://") {
            let after = &word[scheme_end + 3..];
            if let Some(at) = after.find('@') {
                if let Some(colon) = after[..at].find(':') {
                    let user = &after[..colon];
                    parts.push(format!(
                        "{}{user}:***{}",
                        &word[..scheme_end + 3],
                        &after[at..]
                    ));
                    changed = true;
                    continue;
                }
            }
        }
        parts.push(word.to_string());
    }
    if changed {
        parts.join(" ")
    } else {
        command.to_string()
    }
}

/// Recette d'un fichier produit pendant un tour.
pub struct Recipe {
    pub scripts: Vec<String>,
    pub script_versions: Vec<Value>,
    pub command: Option<String>,
    pub inputs: Vec<Value>,
    pub env: Value,
}

/// Bâtit la recette de `output_rel` à partir des commandes du tour et des
/// scripts qu'il a modifiés.
///
/// Commande retenue, par ordre de force : celle qui cite le fichier produit,
/// puis celle qui lance un script du même nom, puis la dernière qui lance un
/// script. À force égale, la plus tardive gagne : la génération réussie vient
/// après les essais.
pub fn build(
    root: &Path,
    output_rel: &str,
    commands: &[CommandFacts],
    changed_scripts: &[String],
    fingerprints: &mut Fingerprints,
) -> Recipe {
    let output_abs = normalize(&root.join(output_rel));
    let output_name = file_name_of(output_rel);
    let output_stem = stem_of(output_rel);
    let scripts_of = |facts: &CommandFacts| -> Vec<PathBuf> {
        facts
            .files
            .iter()
            .filter(|p| is_script_path(&p.to_string_lossy()))
            .cloned()
            .collect()
    };
    let score = |facts: &CommandFacts| -> u8 {
        let mentions_output = facts.files.contains(&output_abs)
            || shell_words(&facts.text)
                .iter()
                .any(|w| !output_name.is_empty() && file_name_of(w) == output_name);
        let scripts = scripts_of(facts);
        if mentions_output {
            3
        } else if scripts.iter().any(|s| stem_of(&s.to_string_lossy()) == output_stem) {
            2
        } else if !scripts.is_empty() {
            1
        } else {
            0
        }
    };
    let chosen = commands
        .iter()
        .map(|facts| (score(facts), facts))
        .filter(|(s, _)| *s > 0)
        .fold(None::<(u8, &CommandFacts)>, |best, (s, facts)| match best {
            Some((b, _)) if b > s => best,
            _ => Some((s, facts)),
        })
        .map(|(_, facts)| facts);

    let mut scripts: Vec<PathBuf> = Vec::new();
    let push_script = |path: PathBuf, scripts: &mut Vec<PathBuf>| {
        if path != output_abs && !scripts.contains(&path) && scripts.len() < 20 {
            scripts.push(path);
        }
    };
    if let Some(facts) = chosen {
        let mut own = scripts_of(facts);
        own.sort_by_key(|p| stem_of(&p.to_string_lossy()) != output_stem);
        for path in own {
            push_script(path, &mut scripts);
        }
    }
    let mut changed: Vec<&String> = changed_scripts.iter().collect();
    changed.sort_by_key(|rel| stem_of(rel) != output_stem);
    for rel in changed {
        push_script(normalize(&root.join(rel)), &mut scripts);
    }

    let main_script = scripts.first().cloned();
    let main_text = main_script.as_ref().and_then(|path| {
        let meta = std::fs::metadata(path).ok()?;
        (meta.len() <= SCRIPT_SCAN_MAX_BYTES)
            .then(|| std::fs::read_to_string(path).ok())
            .flatten()
    });

    let mut input_paths: Vec<PathBuf> = Vec::new();
    if let Some(facts) = chosen {
        for path in &facts.files {
            if is_data_path(&path.to_string_lossy()) {
                input_paths.push(path.clone());
            }
        }
    }
    if let (Some(path), Some(text)) = (main_script.as_ref(), main_text.as_deref()) {
        if extension_lower(&path.to_string_lossy()).as_deref() != Some("tex") {
            input_paths.extend(script_literal_inputs(root, path, text));
        }
    }
    let mut inputs = Vec::new();
    let mut seen = Vec::new();
    for path in input_paths {
        if path == output_abs || seen.contains(&path) || inputs.len() >= INPUTS_MAX {
            continue;
        }
        seen.push(path.clone());
        if let Some(print) = fingerprints.of(root, &path) {
            inputs.push(print);
        }
    }

    let script_versions = scripts
        .iter()
        .filter_map(|path| fingerprints.of(root, path))
        .collect();

    let prefix = chosen
        .and_then(resolve_env_prefix)
        .or_else(|| commands.iter().find_map(resolve_env_prefix))
        .or_else(|| std::env::var_os("CONDA_PREFIX").map(PathBuf::from));
    let script_for_env = main_script
        .as_ref()
        .zip(main_text.as_deref())
        .map(|(path, text)| (path.to_string_lossy().to_string(), text));
    let env = environment(
        prefix.as_deref(),
        script_for_env.as_ref().map(|(p, t)| (p.as_str(), *t)),
    );

    Recipe {
        scripts: scripts.iter().map(|p| display_path(root, p)).collect(),
        script_versions,
        command: chosen.map(|facts| facts.text.clone()),
        inputs,
        env,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn touch(root: &Path, rel: &str, body: &str) -> PathBuf {
        let path = root.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn mots_de_shell() {
        assert_eq!(
            shell_words("cd src && python3 'mon script.py' --in=data/a.csv|tee log"),
            vec!["cd", "src", "&", "&", "python3", "mon script.py", "--in=data/a.csv", "data/a.csv", "|", "tee", "log"]
        );
    }

    #[test]
    fn commande_lit_fichiers_cd_et_env() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "scripts/plot.py", "");
        touch(root, "data/panel.csv", "a,b\n");
        std::fs::create_dir_all(root.join("envs/albedo/lib")).unwrap();
        std::fs::create_dir_all(root.join("envs/albedo/conda-meta")).unwrap();
        let facts = command_facts(
            root,
            "cd scripts && ../envs/albedo/bin/python plot.py --data ../data/panel.csv",
        );
        assert_eq!(
            facts.files,
            vec![root.join("scripts/plot.py"), root.join("data/panel.csv")]
        );
        assert_eq!(facts.env_prefix, Some(root.join("envs/albedo")));
        let named = command_facts(root, "conda run -n albedo python plot.py");
        assert_eq!(named.env_name.as_deref(), Some("albedo"));
    }

    #[test]
    fn imports_python_et_r() {
        let py = "import numpy as np, xarray\nfrom matplotlib import pyplot\nfrom . import local\nimport os.path\n";
        assert_eq!(python_imports(py), vec!["numpy", "xarray", "matplotlib", "os"]);
        let r = "library(ggplot2)\nrequire(\"data.table\")\n";
        assert_eq!(r_libraries(r), vec!["ggplot2", "data.table"]);
    }

    #[test]
    fn versions_lues_dans_l_env() {
        let dir = tempdir().unwrap();
        let prefix = dir.path().join("envs/albedo");
        std::fs::create_dir_all(prefix.join("conda-meta")).unwrap();
        std::fs::write(prefix.join("conda-meta/python-3.12.4-h99_0.json"), "{}").unwrap();
        let site = prefix.join("lib/python3.12/site-packages");
        std::fs::create_dir_all(site.join("numpy-1.26.4.dist-info")).unwrap();
        std::fs::create_dir_all(site.join("scikit_learn-1.5.0.dist-info")).unwrap();
        let env = environment(
            Some(&prefix),
            Some(("plot.py", "import numpy\nfrom sklearn import linear_model\nimport json\n")),
        );
        assert_eq!(env["conda"], "albedo");
        assert_eq!(env["python"], "3.12.4");
        assert_eq!(env["packages"], json!({"numpy": "1.26.4", "sklearn": "1.5.0"}));
    }

    #[test]
    fn entrees_litterales_du_script() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "data/panel.csv", "x");
        touch(root, "scripts/aux.nc", "x");
        let script = touch(
            root,
            "scripts/plot.py",
            "df = pd.read_csv('data/panel.csv')\n# open('data/oublie.csv')\nds = xr.open_dataset(\"aux.nc\")\nf\"{x}.csv\"\nplt.savefig('fig.png')\n",
        );
        let text = std::fs::read_to_string(&script).unwrap();
        assert_eq!(
            script_literal_inputs(root, &script, &text),
            vec![root.join("data/panel.csv"), root.join("scripts/aux.nc")]
        );
    }

    #[test]
    fn recette_choisit_la_commande_qui_cite_le_fichier() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "scripts/plot_trend.py", "import json\nd = open('data/in.csv')\n");
        touch(root, "scripts/other.py", "");
        touch(root, "data/in.csv", "1\n");
        touch(root, "figures/trend.png", "png");
        let commands: Vec<CommandFacts> = [
            "python3 scripts/other.py",
            "python3 scripts/plot_trend.py --out figures/trend.png",
            "ls figures",
        ]
        .iter()
        .map(|c| command_facts(root, c))
        .collect();
        let mut prints = Fingerprints::default();
        let recipe = build(root, "figures/trend.png", &commands, &[], &mut prints);
        assert_eq!(
            recipe.command.as_deref(),
            Some("python3 scripts/plot_trend.py --out figures/trend.png")
        );
        assert_eq!(recipe.scripts, vec!["scripts/plot_trend.py"]);
        assert_eq!(recipe.script_versions[0]["path"], "scripts/plot_trend.py");
        assert_eq!(recipe.script_versions[0]["sha256"].as_str().unwrap().len(), 64);
        assert_eq!(recipe.inputs.len(), 1);
        assert_eq!(recipe.inputs[0]["path"], "data/in.csv");
        assert_eq!(recipe.inputs[0]["size"], 2);
        assert_eq!(
            recipe.inputs[0]["sha256"],
            "4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865"
        );
    }

    #[test]
    fn recette_sans_commande_garde_les_scripts_modifies() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        touch(root, "notes/resume.md", "x");
        let mut prints = Fingerprints::default();
        let recipe = build(root, "notes/resume.md", &[command_facts(root, "ls")], &[], &mut prints);
        assert!(recipe.command.is_none());
        assert!(recipe.scripts.is_empty());
        assert!(recipe.inputs.is_empty());
    }

    #[test]
    fn secrets_masques_dans_les_commandes() {
        assert_eq!(
            redact_command("GITHUB_TOKEN=abc123 curl -H Authorization: Bearer xyz https://u:pw@h/x"),
            "GITHUB_TOKEN=*** curl -H Authorization: Bearer *** https://u:***@h/x"
        );
        assert_eq!(redact_command("tool --password hunter2 run"), "tool --password *** run");
        assert_eq!(redact_command("python3 plot.py --region=sask"), "python3 plot.py --region=sask");
    }
}
