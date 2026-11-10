//! L'env « atelier » : un seul environnement Python pour toutes les analyses,
//! géré par pixi (https://pixi.sh).
//!
//! Un projet pixi dans le dossier de l'app (`<app>/python/`) : `pixi.toml`
//! (lisible, modifiable à la main), `pixi.lock` (versions exactes, dont
//! l'empreinte entre dans l'instantané d'env et la recette des fichiers
//! produits) et l'env lui-même dans `.pixi/envs/default`. Les paquets
//! viennent de conda-forge ; pixi les lie depuis son cache, donc deux envs
//! qui partagent un paquet ne le stockent qu'une fois.
//!
//! Atelier ne télécharge pas pixi : absent, l'erreur donne la ligne
//! d'installation. Atelier ne crée jamais d'env conda et ne touche pas aux
//! envs des autres (conda, Claude Science, système) : `add` et `remove` n'y
//! sont pas permis.

use crate::envs::PyEnv;
use crate::manager::KernelManager;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Nom de l'env d'Atelier dans la liste des envs (`env: "atelier"`).
pub const ATELIER_ENV: &str = "atelier";
/// Source de l'env d'Atelier, et celle de l'env pixi d'un projet.
pub const SOURCE_ATELIER: &str = "atelier";
pub const SOURCE_PROJECT: &str = "pixi";
/// Ligne d'installation de pixi (README de prefix-dev/pixi).
pub const INSTALL_LINE: &str = "curl -fsSL https://pixi.sh/install.sh | sh";

/// Python de l'env neuf. Écrit une fois dans `pixi.toml`, où il se change.
const PYTHON_PIN: &str = "3.12.*";
/// Une installation lourde (PyMC, GDAL) prend des minutes, pas des heures.
const PIXI_TIMEOUT: Duration = Duration::from_secs(30 * 60);
/// Fin de la sortie de pixi gardée dans un message d'erreur.
const OUTPUT_TAIL: usize = 2000;
const MAX_SPECS: usize = 20;
const MAX_SPEC_LEN: usize = 100;
/// Paquets listés au plus pour un env qu'Atelier ne gère pas.
const UNMANAGED_LIST_MAX: usize = 80;
/// Changements de paquets rappelés par l'action `packages`.
const RECENT_CHANGES: usize = 5;

/// Dossiers où chercher pixi après le PATH : une app lancée depuis le Dock
/// n'a pas le PATH du terminal.
fn usual_dirs(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".pixi/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]
}

/// Préfixe de l'env par défaut d'un projet pixi.
pub fn env_prefix(project: &Path) -> PathBuf {
    project.join(".pixi/envs/default")
}

/// Dossier du projet pixi d'un préfixe `<projet>/.pixi/envs/<nom>`.
pub fn project_of_prefix(prefix: &Path) -> Option<PathBuf> {
    let envs = prefix.parent()?;
    let dot = envs.parent()?;
    (envs.file_name() == Some(OsStr::new("envs")) && dot.file_name() == Some(OsStr::new(".pixi")))
        .then(|| dot.parent().map(Path::to_path_buf))
        .flatten()
}

/// Projet pixi d'un env qu'Atelier a le droit de modifier : le sien, ou celui
/// du projet de l'utilisateur. Les autres envs ne se modifient pas d'ici.
pub fn managed_project(env: &PyEnv) -> Option<PathBuf> {
    matches!(env.source.as_str(), SOURCE_ATELIER | SOURCE_PROJECT)
        .then(|| project_of_prefix(&env.prefix))
        .flatten()
}

/// Empreinte du verrou d'un env pixi : chemin de `pixi.lock` et son sha256.
pub fn lock_print(prefix: &Path) -> Option<(String, String)> {
    let lock = project_of_prefix(prefix)?.join("pixi.lock");
    let bytes = std::fs::read(&lock).ok()?;
    Some((lock.display().to_string(), hex::encode(Sha256::digest(&bytes))))
}

fn executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(path)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// Cherche pixi : `ATELIER_PIXI`, puis le PATH, puis les endroits habituels.
pub fn find_pixi(home: &Path) -> Option<PathBuf> {
    find_pixi_in(
        std::env::var_os("ATELIER_PIXI").as_deref(),
        std::env::var_os("PATH").as_deref(),
        &usual_dirs(home),
    )
}

fn find_pixi_in(explicit: Option<&OsStr>, path: Option<&OsStr>, usual: &[PathBuf]) -> Option<PathBuf> {
    if let Some(explicit) = explicit.filter(|e| !e.is_empty()) {
        // Variable posée : elle seule compte. Fausse, pixi est « absent » et
        // l'erreur le dit, plutôt que de prendre un autre binaire en douce.
        let binary = PathBuf::from(explicit);
        return executable(&binary).then_some(binary);
    }
    path.map(std::env::split_paths)
        .into_iter()
        .flatten()
        .chain(usual.iter().cloned())
        .map(|dir| dir.join("pixi"))
        .find(|binary| executable(binary))
}

/// Phrase d'erreur quand pixi manque : où on a cherché, comment l'installer.
pub fn missing_message() -> String {
    format!(
        "pixi est introuvable (cherché : variable ATELIER_PIXI, PATH, ~/.pixi/bin, /opt/homebrew/bin, /usr/local/bin). \
L'env « {ATELIER_ENV} » en a besoin. Demande à l'utilisateur de l'installer depuis son terminal : \
`{INSTALL_LINE}` (ou `brew install pixi`), puis réessaie. Atelier ne télécharge rien lui-même."
    )
}

/// Plateforme conda de cette machine, écrite dans le `pixi.toml` neuf.
fn conda_platform() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("osx-arm64"),
        ("macos", "x86_64") => Some("osx-64"),
        ("linux", "x86_64") => Some("linux-64"),
        ("linux", "aarch64") => Some("linux-aarch64"),
        _ => None,
    }
}

fn manifest_text(platform: &str) -> String {
    format!(
        "# Environnement Python d'Atelier Studio : un seul env pour toutes les analyses.\n\
# Géré par pixi (https://pixi.sh), paquets de conda-forge. pixi.lock, à côté,\n\
# fixe les versions exactes ; l'env lui-même est dans .pixi/ (se reconstruit\n\
# avec `pixi install`).\n\
#\n\
# Ce fichier se modifie à la main : le noyau remet l'env d'accord à son\n\
# prochain démarrage. Depuis le chat, l'agent ajoute et retire des paquets\n\
# avec les actions add et remove de l'outil atelier_python.\n\
\n\
[workspace]\n\
name = \"{ATELIER_ENV}\"\n\
channels = [\"conda-forge\"]\n\
platforms = [\"{platform}\"]\n\
\n\
[dependencies]\n\
python = \"{PYTHON_PIN}\"\n"
    )
}

/// Ajout ou retrait de paquets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChangeKind {
    Add,
    Remove,
}

impl ChangeKind {
    pub fn verb(self) -> &'static str {
        match self {
            Self::Add => "add",
            Self::Remove => "remove",
        }
    }
}

fn name_ok(name: &str) -> bool {
    let mut chars = name.chars();
    // Jamais de tiret en tête : ce serait une option pour pixi.
    chars.next().is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

fn version_ok(version: &str) -> bool {
    // Une ou plusieurs contraintes séparées par des virgules : `>=2.1,<3`.
    !version.is_empty()
        && version.split(',').all(|part| {
            let v = part.trim_start_matches(|c| matches!(c, '=' | '<' | '>' | '!' | '~'));
            part.len() - v.len() <= 2
                && v.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
                && v.chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '*' | '+' | '_' | '-' | '!'))
        })
}

/// Vérifie un nom de paquet avec, pour `add`, une contrainte de version
/// facultative (`xarray`, `numpy>=2.1,<3`, `python=3.12`, et `pymc[jax]` pour
/// PyPI). Rien d'autre ne passe : ni option, ni chemin, ni URL, ni espace.
fn check_spec(spec: &str, kind: ChangeKind, pypi: bool) -> Result<(), String> {
    let refuse = |why: &str| Err(format!("« {spec} » : {why}"));
    if spec.is_empty() || spec.len() > MAX_SPEC_LEN {
        return refuse("nom de paquet vide ou trop long");
    }
    let split = spec.find(['=', '<', '>', '!', '~']).unwrap_or(spec.len());
    let (name, version) = spec.split_at(split);
    let name = match name.split_once('[') {
        Some((base, extras)) if pypi => {
            let ok = extras
                .strip_suffix(']')
                .is_some_and(|list| !list.is_empty() && list.split(',').all(name_ok));
            if !ok {
                return refuse("extras mal formés (attendu : paquet[extra1,extra2])");
            }
            base
        }
        Some(_) => return refuse("les extras ne valent que pour PyPI (pypi: true)"),
        None => name,
    };
    if !name_ok(name) {
        return refuse(
            "nom de paquet invalide (lettres, chiffres, point, tiret, souligné ; ni option, ni chemin, ni URL)",
        );
    }
    match (kind, version.is_empty()) {
        (_, true) => Ok(()),
        (ChangeKind::Remove, false) => refuse("pour retirer un paquet, donne son nom seul"),
        (ChangeKind::Add, false) if version_ok(version) => Ok(()),
        (ChangeKind::Add, false) => refuse("contrainte de version invalide (exemples : >=2.1,<3 ou =3.12)"),
    }
}

/// Valide la liste de paquets d'un `add` ou d'un `remove`.
pub fn validate_specs(specs: &[String], kind: ChangeKind, pypi: bool) -> Result<Vec<String>, String> {
    let specs: Vec<String> = specs.iter().map(|s| s.trim().to_string()).collect();
    if specs.is_empty() {
        return Err("aucun paquet donné (packages : liste de noms)".into());
    }
    if specs.len() > MAX_SPECS {
        return Err(format!("trop de paquets d'un coup ({} ; {MAX_SPECS} au plus)", specs.len()));
    }
    for spec in &specs {
        check_spec(spec, kind, pypi)?;
    }
    Ok(specs)
}

/// Une ligne de `pixi list --json`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Package {
    pub name: String,
    pub version: String,
    /// `conda` ou `pypi`.
    #[serde(default)]
    pub kind: String,
    /// Demandé dans `pixi.toml` (les autres sont des dépendances).
    #[serde(default, rename(deserialize = "is_explicit"))]
    pub explicit: bool,
}

/// Changement de paquets lancé par un fil : en cours tant que `result` est
/// vide.
struct PendingChange {
    action: &'static str,
    packages: Vec<String>,
    started: Instant,
    result: Option<Result<Value, String>>,
}

/// pixi et l'env d'Atelier. Une seule commande pixi à la fois par projet.
pub struct Pixi {
    home: PathBuf,
    atelier_dir: PathBuf,
    /// Binaire imposé (`Some(None)` : pixi tenu pour absent). Sert aux tests.
    forced: Mutex<Option<Option<PathBuf>>>,
    locks: Mutex<HashMap<PathBuf, Arc<tokio::sync::Mutex<()>>>>,
    /// Dernier changement de paquets de chaque fil, tant qu'il reste à
    /// suivre (une installation plus longue que l'attente de l'appel).
    changes: Mutex<HashMap<String, PendingChange>>,
}

impl Pixi {
    /// `app_dir` : dossier d'Atelier ; l'env vit dans `<app_dir>/python`.
    pub fn new(app_dir: &Path, home: &Path) -> Self {
        Self {
            home: home.to_path_buf(),
            atelier_dir: app_dir.join("python"),
            forced: Mutex::new(None),
            locks: Mutex::new(HashMap::new()),
            changes: Mutex::new(HashMap::new()),
        }
    }

    /// Note qu'un fil lance un changement de paquets. Refusé tant que le
    /// précédent du même fil n'a pas fini.
    pub fn begin_change(&self, thread_id: &str, kind: ChangeKind, specs: &[String]) -> Result<(), String> {
        let mut changes = self.changes.lock().unwrap_or_else(|e| e.into_inner());
        if changes.get(thread_id).is_some_and(|c| c.result.is_none()) {
            return Err(
                "kernel_packages_busy — un changement de paquets tourne déjà dans ce fil. Suis-le avec action=packages."
                    .into(),
            );
        }
        changes.insert(
            thread_id.to_string(),
            PendingChange {
                action: kind.verb(),
                packages: specs.to_vec(),
                started: Instant::now(),
                result: None,
            },
        );
        Ok(())
    }

    /// Range le résultat du changement en cours du fil.
    pub fn end_change(&self, thread_id: &str, result: Result<Value, String>) {
        if let Some(change) = self.changes.lock().unwrap_or_else(|e| e.into_inner()).get_mut(thread_id) {
            change.result = Some(result);
        }
    }

    /// Oublie le changement du fil : son résultat a été rendu, ou le fil
    /// est supprimé.
    pub fn forget_change(&self, thread_id: &str) {
        self.changes.lock().unwrap_or_else(|e| e.into_inner()).remove(thread_id);
    }

    /// Changement de paquets du fil resté en arrière-plan : en cours, ou
    /// fini avec son résultat.
    pub fn change_view(&self, thread_id: &str) -> Option<Value> {
        let changes = self.changes.lock().unwrap_or_else(|e| e.into_inner());
        let change = changes.get(thread_id)?;
        let mut view = json!({"action": change.action, "packages": change.packages});
        match &change.result {
            None => {
                view["status"] = json!("running");
                view["elapsedMs"] = json!(change.started.elapsed().as_millis() as u64);
            }
            Some(Ok(result)) => {
                view["status"] = json!("done");
                view["result"] = result.clone();
            }
            Some(Err(error)) => {
                view["status"] = json!("error");
                view["error"] = json!(error);
            }
        }
        Some(view)
    }

    /// Dossier du projet pixi d'Atelier (`pixi.toml`, `pixi.lock`, `.pixi/`).
    pub fn atelier_dir(&self) -> &Path {
        &self.atelier_dir
    }

    /// Impose le binaire pixi, ou son absence, au lieu de le chercher.
    pub fn set_binary(&self, binary: Option<PathBuf>) {
        *self.forced.lock().unwrap_or_else(|e| e.into_inner()) = Some(binary);
    }

    pub fn binary(&self) -> Option<PathBuf> {
        let forced = self.forced.lock().unwrap_or_else(|e| e.into_inner()).clone();
        match forced {
            Some(binary) => binary,
            None => find_pixi(&self.home),
        }
    }

    /// Env demandé par son nom mais absent de la liste : si c'est celui
    /// d'Atelier et que pixi manque, l'erreur utile est celle de pixi.
    pub(crate) fn explain_unknown(&self, asked: Option<&str>, error: String) -> String {
        if asked.map(str::trim) == Some(ATELIER_ENV) && self.binary().is_none() {
            return missing_message();
        }
        error
    }

    fn write_manifest(&self) -> Result<(), String> {
        let manifest = self.atelier_dir.join("pixi.toml");
        if manifest.is_file() {
            return Ok(());
        }
        let platform = conda_platform().ok_or_else(|| {
            format!(
                "plateforme {}-{} non prise en charge pour l'env « {ATELIER_ENV} »",
                std::env::consts::OS,
                std::env::consts::ARCH
            )
        })?;
        std::fs::create_dir_all(&self.atelier_dir)
            .and_then(|_| std::fs::write(&manifest, manifest_text(platform)))
            .map_err(|e| format!("écriture de {} impossible : {e}", manifest.display()))
    }

    /// Lance `pixi <args>` sur un projet et rend la fin de sa sortie. La
    /// commande tourne dans une tâche à part : un appel abandonné en route
    /// (délai du pont) ne coupe pas une installation à moitié faite, et
    /// l'appel suivant attend son tour puis trouve l'env à jour.
    async fn run(&self, project: &Path, args: Vec<String>) -> Result<String, String> {
        let binary = self.binary().ok_or_else(missing_message)?;
        let lock = self
            .locks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(project.to_path_buf())
            .or_default()
            .clone();
        let project = project.to_path_buf();
        tokio::spawn(async move {
            let _guard = lock.lock_owned().await;
            let verb = args.first().cloned().unwrap_or_default();
            let mut cmd = tokio::process::Command::new(&binary);
            // Les arguments partent un à un, sans shell ; `--` ferme les
            // options avant les noms de paquets.
            cmd.arg(&verb)
                .arg("--manifest-path")
                .arg(&project)
                .args(["--no-progress", "--color", "never"])
                .args(&args[1..])
                .current_dir(&project)
                .stdin(std::process::Stdio::null())
                .kill_on_drop(true);
            let output = tokio::time::timeout(PIXI_TIMEOUT, cmd.output())
                .await
                .map_err(|_| format!("pixi {verb} n'a pas fini en {} min", PIXI_TIMEOUT.as_secs() / 60))?
                .map_err(|e| format!("lancement de {} impossible : {e}", binary.display()))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if output.status.success() {
                return Ok(stdout);
            }
            let stderr = String::from_utf8_lossy(&output.stderr);
            let text = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
            Err(format!("pixi {verb} a échoué : {}", tail(text, OUTPUT_TAIL)))
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Installe un env pixi avant d'y lancer un noyau. Celui d'Atelier est
    /// créé au premier usage et remis d'accord avec son `pixi.toml` ; celui
    /// d'un projet suit son verrou, sans le réécrire. Sans effet (et sans
    /// réseau) quand l'env est à jour, et pour les envs qui ne sont pas pixi.
    pub async fn prepare(&self, env: &PyEnv) -> Result<(), String> {
        let Some(project) = managed_project(env) else {
            return Ok(());
        };
        if self.binary().is_none() {
            // Env déjà installé : il sert tel quel ; pixi ne manque que
            // pour le créer ou le modifier.
            return if env.python.is_file() { Ok(()) } else { Err(missing_message()) };
        }
        let mut args = vec!["install".to_string()];
        if env.source == SOURCE_ATELIER {
            self.write_manifest()?;
        } else if project.join("pixi.lock").is_file() {
            // Env du projet de l'utilisateur : installé tel que son verrou
            // le fixe. Démarrer un noyau ne réécrit pas le `pixi.lock` d'un
            // projet ; seuls `add` et `remove`, demandés, le font.
            args.push("--frozen".into());
        }
        self.run(&project, args).await.map(|_| ())
    }

    /// `pixi add` ou `pixi remove` : met à jour `pixi.toml`, `pixi.lock` et
    /// l'env. `specs` doit sortir de `validate_specs`.
    async fn change(&self, project: &Path, kind: ChangeKind, specs: &[String], pypi: bool) -> Result<String, String> {
        let mut args = vec![kind.verb().to_string()];
        if pypi {
            args.push("--pypi".into());
        }
        args.push("--".into());
        args.extend(specs.iter().cloned());
        self.run(project, args).await
    }

    /// Paquets du verrou, lus sans rien installer ni résoudre. Vide quand le
    /// projet n'a pas encore de verrou.
    async fn list(&self, project: &Path) -> Result<Vec<Package>, String> {
        if !project.join("pixi.lock").is_file() {
            return Ok(Vec::new());
        }
        let args = ["list", "--json", "--frozen", "--no-install"].map(String::from).to_vec();
        let out = self.run(project, args).await?;
        serde_json::from_str(&out).map_err(|e| format!("sortie de pixi list illisible : {e}"))
    }

    async fn version(&self) -> Option<String> {
        let binary = self.binary()?;
        let out = tokio::process::Command::new(binary)
            .arg("--version")
            .stdin(std::process::Stdio::null())
            .output()
            .await
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
        (out.status.success() && !text.is_empty()).then_some(text)
    }
}

fn tail(text: &str, max: usize) -> &str {
    if text.len() <= max {
        return text;
    }
    let mut cut = text.len() - max;
    while !text.is_char_boundary(cut) {
        cut += 1;
    }
    &text[cut..]
}

#[cfg(unix)]
fn file_id(meta: &std::fs::Metadata) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    Some((meta.dev(), meta.ino()))
}

#[cfg(not(unix))]
fn file_id(_: &std::fs::Metadata) -> Option<(u64, u64)> {
    None
}

/// Octets des fichiers d'un dossier, chaque fichier compté une fois (les
/// liens durs ne comptent pas double), sans suivre les liens symboliques.
pub fn dir_size(root: &Path) -> u64 {
    let mut seen: HashSet<(u64, u64)> = HashSet::new();
    let mut total = 0;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() && !file_id(&meta).is_some_and(|id| !seen.insert(id)) {
                total += meta.len();
            }
        }
    }
    total
}

fn human_size(bytes: u64) -> String {
    const GO: f64 = 1024.0 * 1024.0 * 1024.0;
    const MO: f64 = 1024.0 * 1024.0;
    let b = bytes as f64;
    if b >= GO {
        format!("{:.1} Go", b / GO)
    } else {
        format!("{:.0} Mo", b / MO)
    }
}

/// Trace d'un changement de paquets, gardée par fil à côté du journal des
/// cellules (`kernel/packages/<fil>.jsonl`). Elle n'entre pas dans le journal
/// des cellules : une ligne qui n'est pas du code Python y serait rejouée et
/// exportée comme une cellule.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageChange {
    pub at: String,
    pub thread_id: String,
    /// `add` ou `remove`.
    pub action: String,
    pub packages: Vec<String>,
    #[serde(default)]
    pub pypi: bool,
    pub env: String,
    pub manifest: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock_before: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lock_after: Option<String>,
    /// Paquets arrivés dans l'env (dépendances comprises) : nom → version.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub added: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub removed: BTreeMap<String, String>,
    /// Paquets dont la version a changé : nom → [avant, après].
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub updated: BTreeMap<String, [String; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn log_path(kernel_dir: &Path, thread_id: &str) -> PathBuf {
    kernel_dir
        .join("packages")
        .join(format!("{}.jsonl", crate::journal::thread_key(thread_id)))
}

fn log_change(kernel_dir: &Path, change: &PackageChange) -> std::io::Result<()> {
    use std::io::Write;
    let path = log_path(kernel_dir, &change.thread_id);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut line = serde_json::to_vec(change)?;
    line.push(b'\n');
    std::fs::OpenOptions::new().create(true).append(true).open(path)?.write_all(&line)
}

/// Changements de paquets d'un fil, du plus ancien au plus récent.
pub fn package_changes(kernel_dir: &Path, thread_id: &str) -> Vec<PackageChange> {
    std::fs::read_to_string(log_path(kernel_dir, thread_id))
        .unwrap_or_default()
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect()
}

/// Efface la trace des paquets d'un fil supprimé.
pub fn delete_package_changes(kernel_dir: &Path, thread_id: &str) {
    let _ = std::fs::remove_file(log_path(kernel_dir, thread_id));
}

fn by_name(packages: &[Package]) -> BTreeMap<String, String> {
    packages.iter().map(|p| (p.name.clone(), p.version.clone())).collect()
}

fn not_managed(env: &PyEnv, pixi_missing: bool) -> String {
    let next = if pixi_missing {
        format!("L'env « {ATELIER_ENV} », où les paquets s'ajoutent, n'existe pas encore : {}", missing_message())
    } else {
        format!(
            "Pour ajouter un paquet, passe à l'env « {ATELIER_ENV} » (action restart, env=\"{ATELIER_ENV}\") ; \
l'utilisateur gère lui-même ses envs conda, venv et système."
        )
    };
    format!(
        "kernel_env_not_managed — l'env « {} » (source {}) n'est pas géré par Atelier : ses paquets ne se modifient pas d'ici. {next}",
        env.name, env.source
    )
}

/// Modules déjà chargés dans un noyau dont le paquet vient de changer de
/// version ou de partir : le noyau garde l'ancien en mémoire.
fn stale_modules(loaded: &[String], touched: &HashSet<String>) -> Vec<String> {
    loaded
        .iter()
        .filter(|m| {
            touched.contains(&crate::packages::normalize_dist(crate::packages::distribution_for(m)))
                || touched.contains(&crate::packages::normalize_dist(m))
        })
        .cloned()
        .collect()
}

impl KernelManager {
    /// Env visé par `add`, `remove` et `packages` : celui demandé, sinon
    /// celui du noyau vivant du fil, sinon celui qu'un démarrage prendrait.
    pub fn target_env(
        &self,
        thread_id: &str,
        cwd: Option<&Path>,
        env: Option<&str>,
        default_env: Option<&str>,
    ) -> Result<PyEnv, String> {
        if env.is_none() {
            if let Some(info) = self.status(thread_id).kernel {
                return Ok(info.env);
            }
        }
        let asked = env.or(default_env);
        crate::envs::resolve_env(&self.envs(cwd), asked)
            .map_err(|e| format!("kernel_env — {}", self.pixi().explain_unknown(asked, e)))
    }

    /// Ajoute ou retire des paquets dans un env pixi (celui d'Atelier ou
    /// celui du projet), reprend l'instantané des noyaux qui y tournent et
    /// laisse une trace dans le fil. Refusé sur tout autre env.
    pub async fn change_packages(
        &self,
        thread_id: &str,
        env: &PyEnv,
        kind: ChangeKind,
        specs: &[String],
        pypi: bool,
    ) -> Result<Value, String> {
        let project = managed_project(env)
            .ok_or_else(|| not_managed(env, self.pixi().binary().is_none()))?;
        let specs = validate_specs(specs, kind, pypi).map_err(|e| format!("kernel_bad_package — {e}"))?;
        if kind == ChangeKind::Remove && env.source == SOURCE_ATELIER && specs.iter().any(|s| s == "python") {
            return Err(format!(
                "kernel_bad_package — python ne se retire pas de l'env « {ATELIER_ENV} » : le noyau en a besoin. \
Pour changer de version : action add avec python=3.13."
            ));
        }
        let pixi = self.pixi();
        if pixi.binary().is_none() {
            return Err(format!("pixi_missing — {}", missing_message()));
        }
        if env.source == SOURCE_ATELIER {
            pixi.write_manifest().map_err(|e| format!("kernel_packages_failed — {e}"))?;
        }
        let lock_before = lock_print(&env.prefix).map(|(_, sha)| sha);
        let before = by_name(&pixi.list(&project).await.unwrap_or_default());
        let outcome = pixi.change(&project, kind, &specs, pypi).await;
        let lock_after = lock_print(&env.prefix).map(|(_, sha)| sha);
        let after = by_name(&pixi.list(&project).await.unwrap_or_default());
        let mut change = PackageChange {
            at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            thread_id: thread_id.to_string(),
            action: kind.verb().to_string(),
            packages: specs.clone(),
            pypi,
            env: env.name.clone(),
            manifest: project.join("pixi.toml").display().to_string(),
            lock_before,
            lock_after: lock_after.clone(),
            added: BTreeMap::new(),
            removed: BTreeMap::new(),
            updated: BTreeMap::new(),
            error: outcome.as_ref().err().cloned(),
        };
        for (name, version) in &after {
            match before.get(name) {
                None => {
                    change.added.insert(name.clone(), version.clone());
                }
                Some(old) if old != version => {
                    change.updated.insert(name.clone(), [old.clone(), version.clone()]);
                }
                Some(_) => {}
            }
        }
        for (name, version) in &before {
            if !after.contains_key(name) {
                change.removed.insert(name.clone(), version.clone());
            }
        }
        let (dir, logged) = (self.kernel_dir().to_path_buf(), change.clone());
        let _ = tokio::task::spawn_blocking(move || log_change(&dir, &logged)).await;
        // Même après un échec : pixi a pu toucher l'env avant de s'arrêter.
        let kernels = self.resnapshot(&env.prefix).await;
        outcome.map_err(|e| format!("kernel_packages_failed — {e}"))?;

        // Ce que le noyau du fil a déjà chargé garde son ancienne version en
        // mémoire jusqu'au redémarrage.
        let loaded: Vec<String> = kernels
            .iter()
            .find(|(id, _)| id == thread_id)
            .map(|(_, imports)| imports.clone())
            .unwrap_or_default();
        let touched: HashSet<String> = change
            .updated
            .keys()
            .chain(change.removed.keys())
            .map(|n| crate::packages::normalize_dist(n))
            .collect();
        let stale = stale_modules(&loaded, &touched);
        let running = kernels.iter().any(|(id, _)| id == thread_id);
        let restart = (running && touched.contains("python")) || !stale.is_empty();
        let note = if !running {
            "Aucun noyau ne tourne dans ce fil : la prochaine cellule démarre dans l'env à jour.".to_string()
        } else if restart {
            format!(
                "Le noyau en cours garde en mémoire l'ancienne version de ce qu'il a déjà chargé ({}) : \
appelle restart pour prendre l'env à jour (les variables seront perdues).",
                if stale.is_empty() { "python".to_string() } else { stale.join(", ") }
            )
        } else if kind == ChangeKind::Add {
            "Le noyau en cours n'a pas besoin de redémarrer : les paquets ajoutés s'importent dès la prochaine cellule, les variables restent.".to_string()
        } else {
            "Le noyau en cours n'a pas besoin de redémarrer.".to_string()
        };
        Ok(json!({
            "status": "ok",
            "action": change.action,
            "packages": change.packages,
            "env": env.name,
            "added": change.added,
            "removed": change.removed,
            "updated": change.updated,
            "lockSha256": lock_after,
            "restartNeeded": restart,
            "note": note,
            "kernels": kernels.iter().map(|(id, _)| id.clone()).collect::<Vec<_>>(),
        }))
    }

    /// Liste courte des paquets d'un env : ceux demandés dans `pixi.toml`
    /// pour un env pixi (avec le total, l'empreinte du verrou et la taille
    /// sur le disque) ; ceux installés pour un autre env, en lecture seule.
    pub async fn packages(&self, thread_id: &str, env: &PyEnv) -> Result<Value, String> {
        let mut out = json!({
            "env": {"name": env.name, "source": env.source, "prefix": env.prefix},
        });
        let Some(project) = managed_project(env) else {
            let prefix = env.prefix.clone();
            let (python, installed) =
                tokio::task::spawn_blocking(move || crate::packages::installed_python_packages(&prefix))
                    .await
                    .map_err(|e| e.to_string())?;
            let installed: BTreeMap<String, String> = installed.into_iter().collect();
            out["managed"] = json!(false);
            out["python"] = json!(python);
            out["total"] = json!(installed.len());
            out["packages"] = json!(installed
                .iter()
                .take(UNMANAGED_LIST_MAX)
                .map(|(name, version)| json!({"name": name, "version": version}))
                .collect::<Vec<_>>());
            out["note"] = json!(format!(
                "Env en lecture seule : Atelier ne modifie pas un env {}. Les actions add et remove valent pour l'env « {ATELIER_ENV} ».",
                env.source
            ));
            return Ok(out);
        };
        let pixi = self.pixi();
        out["managed"] = json!(true);
        out["manifest"] = json!(project.join("pixi.toml"));
        out["installed"] = json!(env.python.is_file());
        match pixi.binary() {
            Some(binary) => {
                out["pixi"] = json!({"path": binary, "version": pixi.version().await});
                let all = pixi.list(&project).await.map_err(|e| format!("kernel_packages_failed — {e}"))?;
                out["total"] = json!(all.len());
                out["packages"] = json!(all
                    .iter()
                    .filter(|p| p.explicit)
                    .map(|p| json!({"name": p.name, "version": p.version, "kind": p.kind}))
                    .collect::<Vec<_>>());
            }
            None => {
                out["pixi"] = Value::Null;
                out["note"] = json!(missing_message());
            }
        }
        if let Some((file, sha)) = lock_print(&env.prefix) {
            out["lock"] = json!({"file": file, "sha256": sha});
        }
        if env.prefix.is_dir() {
            let prefix = env.prefix.clone();
            let bytes = tokio::task::spawn_blocking(move || dir_size(&prefix))
                .await
                .map_err(|e| e.to_string())?;
            out["sizeBytes"] = json!(bytes);
            out["size"] = json!(human_size(bytes));
            out["sizeNote"] = json!("Taille apparente de l'env. pixi lie les fichiers depuis son cache : un paquet présent dans plusieurs envs n'occupe le disque qu'une fois.");
        }
        let dir = self.kernel_dir().to_path_buf();
        let id = thread_id.to_string();
        let changes = tokio::task::spawn_blocking(move || package_changes(&dir, &id))
            .await
            .unwrap_or_default();
        if !changes.is_empty() {
            let from = changes.len().saturating_sub(RECENT_CHANGES);
            out["recentChanges"] = json!(changes[from..]);
        }
        Ok(out)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Faux pixi : un script qui note ses appels (sauf `list`, qui ne change
    /// rien) dans `<projet>/appels.log` et imite `install`, `add`, `remove` et `list --json` sur les fichiers
    /// du projet. `python` : interpréteur que lance `bin/python` de l'env,
    /// pour y démarrer un vrai noyau.
    pub(crate) fn faux_pixi(dir: &Path, python: Option<&Path>) -> PathBuf {
        let python = python.map(|p| p.display().to_string()).unwrap_or_default();
        let script = format!(
            r#"#!/bin/sh
if [ "$1" = "--version" ]; then echo "pixi 0.0.0-faux"; exit 0; fi
verbe="$1"; shift
projet=""; pypi=0; noms=""; gele=""
while [ $# -gt 0 ]; do
  case "$1" in
    --manifest-path) projet="$2"; shift ;;
    --color) shift ;;
    --pypi) pypi=1 ;;
    --frozen) gele=" --frozen" ;;
    --) shift; noms="$*"; break ;;
  esac
  shift
done
[ "$verbe" = list ] || echo "$verbe$gele pypi=$pypi $noms" >> "$projet/appels.log"
env="$projet/.pixi/envs/default"
site="$env/lib/python3.12/site-packages"
verrou() {{ {{ cat "$projet/pixi.toml"; ls "$site"; }} > "$projet/pixi.lock"; }}
case "$verbe" in
  install)
    grep -q "paquet-casse" "$projet/pixi.toml" && {{ echo "Error: manifeste invalide" >&2; exit 1; }}
    mkdir -p "$env/bin" "$env/conda-meta" "$site"
    if [ -n "{python}" ] && [ ! -e "$env/bin/python" ]; then
      printf '#!/bin/sh\nexec "%s" "$@"\n' "{python}" > "$env/bin/python"; chmod +x "$env/bin/python"
    fi
    [ -e "$env/bin/python" ] || : > "$env/bin/python"
    verrou ;;
  add)
    for n in $noms; do
      [ "$n" = "introuvable" ] && {{ echo "Error: No candidates were found for introuvable" >&2; exit 1; }}
      nom=$(echo "$n" | sed 's/[=<>!~\[].*//')
      mkdir -p "$site/$nom-1.0.dist-info"
      echo "$nom = \"*\"" >> "$projet/pixi.toml"
    done
    verrou ;;
  remove)
    for n in $noms; do
      rm -rf "$site/$n-1.0.dist-info"
      grep -v "^$n = " "$projet/pixi.toml" > "$projet/pixi.toml.tmp"; mv "$projet/pixi.toml.tmp" "$projet/pixi.toml"
    done
    verrou ;;
  list)
    printf '[{{"name":"python","version":"3.12.0","kind":"conda","is_explicit":true}}'
    for d in "$site"/*.dist-info; do
      [ -d "$d" ] || continue
      nom=$(basename "$d" | sed 's/-1.0.dist-info//')
      printf ',{{"name":"%s","version":"1.0","kind":"conda","is_explicit":true}}' "$nom"
    done
    printf ',{{"name":"libzlib","version":"1.3","kind":"conda","is_explicit":false}}]\n' ;;
esac
"#
        );
        std::fs::create_dir_all(dir).unwrap();
        let path = dir.join("pixi");
        ecrire_script(&path, &script);
        path
    }

    /// Écrit un script exécutable sans l'ouvrir en écriture dans ce
    /// processus : un `fork` lancé par un autre test pendant l'écriture
    /// garderait le fichier ouvert, et son lancement échouerait (« Text file
    /// busy »). Un `sh` l'écrit donc à notre place.
    fn ecrire_script(path: &Path, script: &str) {
        use std::io::Write;
        let mut sh = std::process::Command::new("/bin/sh")
            .args(["-c", "cat > \"$1\" && chmod 755 \"$1\"", "sh"])
            .arg(path)
            .stdin(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        sh.stdin.take().unwrap().write_all(script.as_bytes()).unwrap();
        assert!(sh.wait().unwrap().success());
    }

    fn appels(project: &Path) -> Vec<String> {
        std::fs::read_to_string(project.join("appels.log"))
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect()
    }

    fn atelier_env(m: &KernelManager) -> PyEnv {
        m.envs(None).into_iter().find(|e| e.source == SOURCE_ATELIER).unwrap()
    }

    #[test]
    fn pixi_se_trouve_par_la_variable_le_path_puis_les_endroits_habituels() {
        let dir = tempfile::tempdir().unwrap();
        let usual = [dir.path().join("home/.pixi/bin"), dir.path().join("systeme/bin")];
        let ailleurs = faux_pixi(&dir.path().join("ailleurs"), None);
        let du_path = faux_pixi(&dir.path().join("bin"), None);
        std::fs::create_dir_all(dir.path().join("vide")).unwrap();
        let path = std::env::join_paths([dir.path().join("vide"), dir.path().join("bin")]).unwrap();
        let path_vide = dir.path().join("vide").into_os_string();

        // Rien nulle part.
        assert_eq!(find_pixi_in(None, None, &usual), None);
        // Hors du PATH : ce que trouve une app lancée depuis le Dock.
        let systeme = faux_pixi(&usual[1], None);
        assert_eq!(find_pixi_in(None, Some(&path_vide), &usual), Some(systeme));
        let perso = faux_pixi(&usual[0], None);
        assert_eq!(find_pixi_in(None, Some(&path_vide), &usual), Some(perso));
        // Le PATH passe avant, la variable avant tout.
        assert_eq!(find_pixi_in(None, Some(&path), &usual), Some(du_path.clone()));
        assert_eq!(find_pixi_in(Some(ailleurs.as_os_str()), Some(&path), &usual), Some(ailleurs));
        // Variable fausse : pas de bascule en douce sur un autre binaire.
        assert_eq!(find_pixi_in(Some(OsStr::new("/nulle/part/pixi")), Some(&path), &usual), None);
        // Un fichier non exécutable n'est pas pixi.
        std::fs::write(dir.path().join("vide/pixi"), "").unwrap();
        assert_eq!(find_pixi_in(None, Some(&path), &usual), Some(du_path));

        let message = missing_message();
        assert!(message.contains(INSTALL_LINE) && message.contains("ATELIER_PIXI"), "{message}");
    }

    #[test]
    fn les_noms_de_paquets_sont_valides_strictement() {
        let ok = |specs: &[&str], kind, pypi| {
            validate_specs(&specs.iter().map(|s| s.to_string()).collect::<Vec<_>>(), kind, pypi)
        };
        assert_eq!(
            ok(&["xarray", " numpy>=2.1,<3 ", "python=3.12", "scikit-learn==1.5.*", "ruamel.yaml"], ChangeKind::Add, false)
                .unwrap()[1],
            "numpy>=2.1,<3"
        );
        assert!(ok(&["pymc[jax,numpyro]>=5"], ChangeKind::Add, true).is_ok());
        for refuse in [
            "--pypi",
            "-e",
            "--index=https://exemple.org",
            "https://exemple.org/paquet.whl",
            "git+https://exemple.org/depot",
            "./paquet",
            "../paquet",
            "/tmp/paquet",
            "paquet @ file:///tmp/x",
            "numpy; rm -rf ~",
            "numpy && id",
            "$(id)",
            "numpy rasterio",
            "conda-forge::numpy",
            "numpy>=",
            "numpy>=2,",
            "numpy===2",
            "pymc[jax]",
            "",
        ] {
            assert!(ok(&[refuse], ChangeKind::Add, false).is_err(), "{refuse:?} aurait dû être refusé");
        }
        for refuse in ["paquet[", "paquet[]", "paquet[a b]", "paquet[a]x", "paquet @ https://exemple.org/p.whl"] {
            assert!(ok(&[refuse], ChangeKind::Add, true).is_err(), "{refuse:?} aurait dû être refusé");
        }
        // Retrait : un nom seul.
        assert!(ok(&["numpy"], ChangeKind::Remove, false).is_ok());
        assert!(ok(&["numpy>=2"], ChangeKind::Remove, false).is_err());
        assert!(ok(&[], ChangeKind::Add, false).is_err());
        let trop: Vec<String> = (0..=MAX_SPECS).map(|i| format!("p{i}")).collect();
        assert!(validate_specs(&trop, ChangeKind::Add, false).is_err());
    }

    #[tokio::test]
    async fn demarrer_un_noyau_ne_reecrit_pas_le_verrou_d_un_projet() {
        let app = tempfile::tempdir().unwrap();
        let m = KernelManager::new(app.path(), app.path());
        m.pixi().set_binary(Some(faux_pixi(&app.path().join("outils"), None)));
        let projet = app.path().join("these");
        std::fs::create_dir_all(&projet).unwrap();
        std::fs::write(projet.join("pixi.toml"), "[workspace]\n").unwrap();
        let env = m
            .envs(Some(&projet))
            .into_iter()
            .find(|e| e.source == SOURCE_PROJECT)
            .unwrap();
        // Pas encore de verrou : pixi le crée. Ensuite l'env le suit, sans
        // le réécrire.
        m.pixi().prepare(&env).await.unwrap();
        m.pixi().prepare(&env).await.unwrap();
        assert_eq!(appels(&projet), ["install pypi=0 ", "install --frozen pypi=0 "]);

        // L'env d'Atelier, lui, se remet d'accord avec son manifeste.
        let atelier = atelier_env(&m);
        m.pixi().prepare(&atelier).await.unwrap();
        m.pixi().prepare(&atelier).await.unwrap();
        assert_eq!(appels(&app.path().join("python")), ["install pypi=0 ", "install pypi=0 "]);
    }

    #[tokio::test]
    async fn l_env_atelier_est_cree_au_premier_usage_pas_avant() {
        let app = tempfile::tempdir().unwrap();
        let m = KernelManager::new(app.path(), app.path());
        m.pixi().set_binary(Some(faux_pixi(&app.path().join("outils"), None)));
        let projet = app.path().join("python");

        // Listé (c'est le défaut) mais rien n'est encore sur le disque.
        let env = atelier_env(&m);
        assert_eq!(env.name, ATELIER_ENV);
        assert_eq!(env.prefix, projet.join(".pixi/envs/default"));
        assert!(!projet.exists(), "rien n'est créé tant que l'env ne sert pas");

        m.pixi().prepare(&env).await.unwrap();
        let manifeste = std::fs::read_to_string(projet.join("pixi.toml")).unwrap();
        assert!(manifeste.contains("channels = [\"conda-forge\"]"), "{manifeste}");
        assert!(manifeste.contains(&format!("python = \"{PYTHON_PIN}\"")), "{manifeste}");
        assert!(manifeste.contains(&format!("platforms = [\"{}\"]", conda_platform().unwrap())));
        assert!(env.python.exists() && projet.join("pixi.lock").is_file());
        assert_eq!(appels(&projet), ["install pypi=0 "]);

        // Un manifeste retouché à la main n'est jamais réécrit ; l'env est
        // remis d'accord au démarrage suivant, et une erreur de pixi remonte.
        std::fs::write(projet.join("pixi.toml"), format!("{manifeste}# à moi\n")).unwrap();
        m.pixi().prepare(&env).await.unwrap();
        assert!(std::fs::read_to_string(projet.join("pixi.toml")).unwrap().ends_with("# à moi\n"));
        assert_eq!(appels(&projet).len(), 2);
        std::fs::write(projet.join("pixi.toml"), format!("{manifeste}paquet-casse = \"*\"\n")).unwrap();
        let err = m.pixi().prepare(&env).await.unwrap_err();
        assert!(err.contains("pixi install a échoué") && err.contains("manifeste invalide"), "{err}");

        // Un env conda n'est jamais préparé : pixi n'y touche pas.
        let conda = PyEnv {
            name: "pymc-albedo".into(),
            prefix: app.path().join("miniforge3/envs/pymc-albedo"),
            python: app.path().join("miniforge3/envs/pymc-albedo/bin/python"),
            source: "conda".into(),
        };
        m.pixi().prepare(&conda).await.unwrap();
        assert_eq!(appels(&projet).len(), 3);
    }

    #[tokio::test]
    async fn sans_pixi_l_erreur_donne_la_ligne_d_installation() {
        let app = tempfile::tempdir().unwrap();
        let m = KernelManager::new(app.path(), app.path());
        m.pixi().set_binary(None);
        // L'env d'Atelier n'est pas proposé : le défaut reste celui d'avant.
        assert!(m.envs(None).iter().all(|e| e.source != SOURCE_ATELIER));
        // Demandé par son nom, l'erreur est celle de pixi, pas « env inconnu ».
        let err = m.target_env("fil", None, Some(ATELIER_ENV), None).unwrap_err();
        assert!(err.contains(INSTALL_LINE), "{err}");
        let env = PyEnv {
            name: ATELIER_ENV.into(),
            prefix: env_prefix(m.pixi().atelier_dir()),
            python: env_prefix(m.pixi().atelier_dir()).join("bin/python"),
            source: SOURCE_ATELIER.into(),
        };
        let err = m.pixi().prepare(&env).await.unwrap_err();
        assert!(err.contains(INSTALL_LINE), "{err}");
        let err = m
            .change_packages("fil", &env, ChangeKind::Add, &["xarray".into()], false)
            .await
            .unwrap_err();
        assert!(err.starts_with("pixi_missing") && err.contains(INSTALL_LINE), "{err}");
        assert!(!m.pixi().atelier_dir().exists(), "rien n'est créé sans pixi");
    }

    #[tokio::test]
    async fn add_et_remove_passent_par_pixi_et_laissent_une_trace() {
        let app = tempfile::tempdir().unwrap();
        let m = KernelManager::new(app.path(), app.path());
        m.pixi().set_binary(Some(faux_pixi(&app.path().join("outils"), None)));
        let projet = app.path().join("python");
        let env = atelier_env(&m);

        // `add` sur un env pas encore créé le crée.
        let out = m
            .change_packages("fil", &env, ChangeKind::Add, &["xarray".into(), "numpy>=2".into()], false)
            .await
            .unwrap();
        assert_eq!((&out["added"]["numpy"], &out["added"]["xarray"]), (&json!("1.0"), &json!("1.0")), "{out}");
        assert_eq!(out["restartNeeded"], false);
        assert!(out["note"].as_str().unwrap().contains("Aucun noyau"), "{out}");
        let verrou = lock_print(&env.prefix).unwrap().1;
        assert_eq!(out["lockSha256"], json!(verrou));
        // Les noms partent un à un, après `--`.
        assert_eq!(appels(&projet), ["add pypi=0 xarray numpy>=2"]);

        // PyPI sur demande seulement.
        m.change_packages("fil", &env, ChangeKind::Add, &["pymc[jax]".into()], true).await.unwrap();
        assert_eq!(appels(&projet)[1], "add pypi=1 pymc[jax]");

        let out = m.change_packages("fil", &env, ChangeKind::Remove, &["xarray".into()], false).await.unwrap();
        assert_eq!(out["removed"], json!({"xarray": "1.0"}), "{out}");
        assert_ne!(out["lockSha256"], json!(verrou), "le verrou a changé");

        // Échec de pixi : l'erreur remonte, la trace le garde.
        let err = m
            .change_packages("fil", &env, ChangeKind::Add, &["introuvable".into()], false)
            .await
            .unwrap_err();
        assert!(err.starts_with("kernel_packages_failed") && err.contains("No candidates"), "{err}");

        // Refus avant tout appel à pixi.
        let avant = appels(&projet).len();
        for (specs, attendu) in [
            (vec!["--pypi".to_string()], "kernel_bad_package"),
            (vec!["https://exemple.org/p.whl".to_string()], "kernel_bad_package"),
            (vec!["numpy; rm -rf ~".to_string()], "kernel_bad_package"),
        ] {
            let err = m.change_packages("fil", &env, ChangeKind::Add, &specs, false).await.unwrap_err();
            assert!(err.starts_with(attendu), "{err}");
        }
        let err = m.change_packages("fil", &env, ChangeKind::Remove, &["python".into()], false).await.unwrap_err();
        assert!(err.starts_with("kernel_bad_package"), "{err}");
        assert_eq!(appels(&projet).len(), avant, "pixi n'a pas été appelé");

        let trace = package_changes(m.kernel_dir(), "fil");
        assert_eq!(trace.len(), 4);
        assert_eq!((trace[0].action.as_str(), trace[0].lock_before.as_deref()), ("add", None));
        assert_eq!(trace[0].lock_after.as_deref(), Some(verrou.as_str()));
        assert!(trace[1].pypi);
        assert_eq!(trace[2].action, "remove");
        assert!(trace[3].error.as_deref().unwrap().contains("No candidates"));
        assert!(package_changes(m.kernel_dir(), "autre-fil").is_empty());

        // Liste courte : les paquets demandés, le total, le verrou, la taille.
        let liste = m.packages("fil", &env).await.unwrap();
        let noms: Vec<&str> = liste["packages"].as_array().unwrap().iter().map(|p| p["name"].as_str().unwrap()).collect();
        assert_eq!(noms, ["python", "numpy", "pymc"], "{liste}");
        assert_eq!(liste["total"], 4, "dépendances comprises");
        assert_eq!(liste["managed"], true);
        assert_eq!(liste["lock"]["sha256"], out["lockSha256"]);
        assert!(liste["sizeBytes"].is_u64() && liste["size"].is_string(), "{liste}");
        assert_eq!(liste["recentChanges"].as_array().unwrap().len(), 4);
        assert_eq!(liste["pixi"]["version"], "pixi 0.0.0-faux");

        delete_package_changes(m.kernel_dir(), "fil");
        assert!(package_changes(m.kernel_dir(), "fil").is_empty());
    }

    #[tokio::test]
    async fn les_envs_des_autres_ne_se_modifient_pas() {
        let app = tempfile::tempdir().unwrap();
        let m = KernelManager::new(app.path(), app.path());
        m.pixi().set_binary(Some(faux_pixi(&app.path().join("outils"), None)));
        let prefix = app.path().join("miniforge3/envs/pymc-albedo");
        std::fs::create_dir_all(prefix.join("lib/python3.11/site-packages/pymc-5.16.0.dist-info")).unwrap();
        for source in ["conda", "claude-science", "systeme", "projet", "variable", "chemin"] {
            let env = PyEnv {
                name: "pymc-albedo".into(),
                prefix: prefix.clone(),
                python: prefix.join("bin/python"),
                source: source.into(),
            };
            for kind in [ChangeKind::Add, ChangeKind::Remove] {
                let err = m.change_packages("fil", &env, kind, &["xarray".into()], false).await.unwrap_err();
                assert!(err.starts_with("kernel_env_not_managed") && err.contains(source), "{err}");
            }
        }
        // Un préfixe pixi désigné par son chemin n'est pas géré non plus :
        // seuls l'env d'Atelier et celui du projet le sont.
        let chemin = PyEnv {
            name: "x".into(),
            prefix: env_prefix(&app.path().join("ailleurs")),
            python: env_prefix(&app.path().join("ailleurs")).join("bin/python"),
            source: "chemin".into(),
        };
        assert!(m.change_packages("fil", &chemin, ChangeKind::Add, &["xarray".into()], false).await.is_err());
        assert!(!app.path().join("python").exists() && !app.path().join("ailleurs").exists());

        // La lecture reste permise, sans pixi.
        let conda = PyEnv { name: "pymc-albedo".into(), prefix: prefix.clone(), python: prefix.join("bin/python"), source: "conda".into() };
        let liste = m.packages("fil", &conda).await.unwrap();
        assert_eq!(liste["managed"], false);
        assert_eq!(liste["packages"][0], json!({"name": "pymc", "version": "5.16.0"}));
        assert!(liste["note"].as_str().unwrap().contains("lecture seule"));
    }

    #[test]
    fn la_taille_compte_chaque_fichier_une_fois() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("a/b")).unwrap();
        std::fs::write(dir.path().join("a/un"), vec![0u8; 1000]).unwrap();
        std::fs::write(dir.path().join("a/b/deux"), vec![0u8; 500]).unwrap();
        std::fs::hard_link(dir.path().join("a/un"), dir.path().join("a/b/lien")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("a/un"), dir.path().join("symbolique")).unwrap();
        assert_eq!(dir_size(dir.path()), 1500);
        assert_eq!(human_size(1500), "0 Mo");
        assert_eq!(human_size(300 * 1024 * 1024), "300 Mo");
        assert_eq!(human_size(5 * 1024 * 1024 * 1024 / 2), "2.5 Go");
    }

    #[test]
    fn le_projet_pixi_se_retrouve_depuis_le_prefixe() {
        assert_eq!(project_of_prefix(Path::new("/app/python/.pixi/envs/default")), Some(PathBuf::from("/app/python")));
        assert_eq!(project_of_prefix(Path::new("/home/t/miniforge3/envs/pymc")), None);
        assert_eq!(project_of_prefix(Path::new("/p/.venv")), None);
        let dir = tempfile::tempdir().unwrap();
        let prefix = env_prefix(dir.path());
        assert_eq!(lock_print(&prefix), None);
        std::fs::write(dir.path().join("pixi.lock"), "version: 7\n").unwrap();
        let (file, sha) = lock_print(&prefix).unwrap();
        assert!(file.ends_with("pixi.lock"));
        assert_eq!(sha, hex::encode(Sha256::digest(b"version: 7\n")));
    }

    #[test]
    fn un_module_deja_charge_dont_le_paquet_change_demande_un_redemarrage() {
        let loaded = vec!["numpy".to_string(), "sklearn".to_string(), "xarray".to_string()];
        let touched: HashSet<String> = ["scikit_learn".to_string(), "pandas".to_string()].into();
        assert_eq!(stale_modules(&loaded, &touched), ["sklearn"]);
        assert!(stale_modules(&loaded, &HashSet::new()).is_empty());
    }

    fn python() -> Option<PathBuf> {
        let out = std::process::Command::new("python3")
            .args(["-c", "import sys; print(sys.executable)"])
            .output()
            .ok()?;
        let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
        p.is_file().then_some(p)
    }

    fn cellule<'a>(cwd: &'a Path, env: Option<&'a str>, code: &'a str) -> crate::RunRequest<'a> {
        crate::RunRequest {
            thread_id: "fil",
            cwd,
            env,
            default_env: None,
            code,
            wait: Duration::from_secs(20),
            turn_id: None,
            purpose: None,
            author: None,
            from_cell: None,
            resumed_from: None,
        }
    }

    /// Faux pixi, vrai Python : le chemin complet du noyau, sans réseau.
    #[tokio::test]
    async fn sans_env_demande_le_noyau_demarre_dans_l_env_atelier_et_suit_un_ajout() {
        let Some(py) = python() else {
            eprintln!("pas de python3 : test sauté");
            return;
        };
        let app = tempfile::tempdir().unwrap();
        let projet = tempfile::tempdir().unwrap();
        let m = KernelManager::new(app.path(), app.path());
        m.pixi().set_binary(Some(faux_pixi(&app.path().join("outils"), Some(&py))));
        let atelier = app.path().join("python");

        // Rien demandé : l'env « atelier », créé à ce moment-là.
        let r = m.run(cellule(projet.path(), None, "x = 20\nx")).await.unwrap();
        assert_eq!(r.cell["result"], "20", "{}", r.cell);
        assert!(r.note.as_deref().unwrap().contains("« atelier »"), "{:?}", r.note);
        let info = m.status("fil").kernel.unwrap();
        assert_eq!(info.env.source, SOURCE_ATELIER);
        assert_eq!(info.env.prefix, env_prefix(&atelier));
        assert_eq!(appels(&atelier), ["install pypi=0 "]);
        let avant = m.journal().get("fil", 1).unwrap();
        let snap = m.env_snapshot(avant.env_sha256.as_deref().unwrap()).unwrap();
        assert_eq!(snap.lock_sha256, lock_print(&info.env.prefix).map(|(_, sha)| sha));

        // Ajout pendant que le noyau tourne : pas de redémarrage, les
        // variables restent, et l'instantané d'env est repris.
        let env = m.target_env("fil", Some(projet.path()), None, None).unwrap();
        assert_eq!(env, info.env);
        let out = m.change_packages("fil", &env, ChangeKind::Add, &["xarray".into()], false).await.unwrap();
        assert_eq!(out["restartNeeded"], false, "{out}");
        assert!(out["note"].as_str().unwrap().contains("n'a pas besoin de redémarrer"), "{out}");
        assert_eq!(out["kernels"], json!(["fil"]));
        let r = m.run(cellule(projet.path(), None, "x + 1")).await.unwrap();
        assert_eq!(r.cell["result"], "21", "{}", r.cell);
        assert!(r.note.is_none(), "même noyau");

        let apres = m.journal().get("fil", 2).unwrap();
        assert_ne!(apres.env_sha256, avant.env_sha256);
        assert_eq!(m.status("fil").env_sha256, apres.env_sha256);
        let snap = m.env_snapshot(apres.env_sha256.as_deref().unwrap()).unwrap();
        assert_eq!(snap.packages.get("xarray").map(String::as_str), Some("1.0"));
        assert_eq!(json!(snap.lock_sha256), out["lockSha256"]);

        // La recette d'un fichier écrit par cette cellule porte le verrou.
        let recette = crate::recipe::cell_recipe(m.kernel_dir(), &apres, |p| p.display().to_string());
        assert_eq!(recette["env"]["pixi"], ATELIER_ENV);
        assert_eq!(recette["env"]["lock"]["sha256"], out["lockSha256"]);

        // Un env demandé par son nom l'emporte toujours sur le défaut.
        let py = py.display().to_string();
        let err = m.run(cellule(projet.path(), Some(&py), "1")).await.unwrap_err();
        assert!(matches!(err, crate::KernelError::OtherEnv { .. }), "{err:?}");
        let info = m.restart("fil", projet.path(), Some(&py), None, true).await.unwrap();
        assert_eq!(info.env.source, "chemin");
        // Et ses paquets ne se modifient pas d'ici.
        let env = m.target_env("fil", Some(projet.path()), None, None).unwrap();
        let err = m.change_packages("fil", &env, ChangeKind::Add, &["xarray".into()], false).await.unwrap_err();
        assert!(err.starts_with("kernel_env_not_managed"), "{err}");
        m.shutdown_all().await;
    }
}
