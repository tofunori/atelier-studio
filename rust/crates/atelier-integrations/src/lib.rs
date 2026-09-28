//! Intégrations facultatives d'Atelier : Ragdoc, gbrain, surface Calculs (NAS,
//! grappes Slurm), contact Crossref et dossier Zotero.
//!
//! Avant ce module, chaque crate lisait sa variable d'environnement avec une
//! valeur par défaut propre à l'installation de l'auteur (`ssh rorqual`,
//! `ssh nas`, `narval-vpn`, courriel Crossref) : sur tout autre Mac, Atelier
//! ouvrait des connexions SSH vers des alias qui ne lui appartenaient pas. La
//! règle est désormais : **aucune valeur par défaut personnelle**. Une
//! intégration n'existe que si `integrations.json` (Réglages > Intégrations)
//! ou une variable d'environnement historique la configure.
//!
//! Priorité : variable d'environnement (tests, dev) > fichier > rien. Le
//! fichier est relu à chaque appel (quelques centaines d'octets) : un réglage
//! enregistré s'applique sans redémarrer, y compris dans les binaires
//! compagnons (`atelier-kb-rs`, serveur galerie, MCP des annotations).

pub mod tectonic;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub const FILE_NAME: &str = "integrations.json";
pub const RAGDOC_NOT_CONFIGURED: &str =
    "Ragdoc n'est pas configuré (Réglages > Intégrations)";
pub const GBRAIN_NOT_CONFIGURED: &str =
    "gbrain n'est pas configuré (Réglages > Intégrations)";
/// Grappes Slurm connues de la surface Calculs.
pub const CLUSTERS: &[&str] = &["narval", "rorqual"];

/// Variables d'environnement historiques encore honorées. Une variable
/// DÉFINIE mais vide garde son sens d'origine (`ATELIER_GBRAIN_SSH_HOST=""`
/// = binaire gbrain local, `ATELIER_NARVAL_GATEWAY=""` = connexion directe).
const ENV_KEYS: &[&str] = &[
    "ATELIER_RAGDOC_HOST",
    "ATELIER_RAGDOC_ROOT",
    "ATELIER_RAGDOC_LOCAL_ROOT",
    "ATELIER_GBRAIN_SSH_HOST",
    "ATELIER_TEST_GBRAIN",
    "ATELIER_NAS_HOST",
    "ATELIER_NARVAL_HOST",
    "ATELIER_NARVAL_GATEWAY",
    "ATELIER_RORQUAL_HOST",
    "ATELIER_RORQUAL_GATEWAY",
    "ATELIER_CROSSREF_MAILTO",
    "ATELIER_ZOTERO_DIR",
];

/// Valeurs de l'installation de l'auteur, appliquées UNE fois par
/// [`migrate_legacy`] quand l'app porte la trace d'un usage réussi de Ragdoc
/// ou de gbrain — jamais comme défaut.
fn legacy_config() -> Value {
    json!({
        "version": 1,
        "seededFrom": "defaults-2.0.0",
        "ragdoc": {"host": "rorqual", "root": "/volume1/Services/mcp/ragdoc"},
        "gbrain": {"sshHost": "nas"},
        "compute": {
            "nasHost": "nas",
            "clusterGateway": "nas",
            "clusters": {"narval": "narval-vpn", "rorqual": "rorqual-vpn"}
        }
    })
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// `$ATELIER_APP_DIR`, à défaut `~/Library/Application Support/atelier-studio`
/// (même règle que `AppPaths` du runtime et `default_knowledge_dir` de la KB).
pub fn app_dir() -> PathBuf {
    std::env::var("ATELIER_APP_DIR")
        .ok()
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join("Library/Application Support/atelier-studio"))
}

pub fn file_path(app_dir: &Path) -> PathBuf {
    app_dir.join(FILE_NAME)
}

/// Contenu normalisé du fichier ; absent ou illisible → configuration vide.
pub fn read_config(app_dir: &Path) -> Value {
    std::fs::read(file_path(app_dir))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .and_then(|value| normalize(&value).ok())
        .unwrap_or_else(|| json!({"version": 1}))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RagdocTarget {
    pub host: String,
    pub root: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GbrainTarget {
    /// Binaire `gbrain` de ce Mac.
    Local,
    /// `ssh <host> gbrain …`.
    Ssh(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClusterTarget {
    pub host: String,
    pub gateway: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZoteroSource {
    Env,
    Config,
    ZoteroPrefs,
    Default,
}

impl ZoteroSource {
    pub fn as_str(self) -> &'static str {
        match self {
            ZoteroSource::Env => "env",
            ZoteroSource::Config => "config",
            ZoteroSource::ZoteroPrefs => "zotero-prefs",
            ZoteroSource::Default => "default",
        }
    }
}

/// Réglages résolus : fichier + variables d'environnement, figés au chargement.
#[derive(Debug, Clone)]
pub struct Integrations {
    config: Value,
    env: BTreeMap<String, String>,
    home: PathBuf,
}

impl Integrations {
    /// Réglages de l'app courante (`app_dir()`, environnement du process).
    pub fn load() -> Self {
        Self::load_from(&app_dir())
    }

    pub fn load_from(app_dir: &Path) -> Self {
        let env = ENV_KEYS
            .iter()
            .filter_map(|key| std::env::var(key).ok().map(|value| (key.to_string(), value)))
            .collect();
        Self::from_parts(read_config(app_dir), env, home_dir())
    }

    /// Construction explicite (tests) : aucune lecture d'environnement.
    pub fn from_parts(config: Value, env: BTreeMap<String, String>, home: PathBuf) -> Self {
        Self {
            config: normalize(&config).unwrap_or_else(|_| json!({"version": 1})),
            env,
            home,
        }
    }

    pub fn config(&self) -> &Value {
        &self.config
    }

    fn env_set(&self, key: &str) -> Option<&str> {
        self.env.get(key).map(|value| value.trim())
    }

    fn env_value(&self, key: &str) -> Option<&str> {
        self.env_set(key).filter(|value| !value.is_empty())
    }

    fn config_str(&self, pointer: &str) -> Option<&str> {
        self.config
            .pointer(pointer)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }

    pub fn ragdoc(&self) -> Option<RagdocTarget> {
        let host = self
            .env_value("ATELIER_RAGDOC_HOST")
            .or_else(|| self.config_str("/ragdoc/host"))?;
        let root = self
            .env_value("ATELIER_RAGDOC_ROOT")
            .or_else(|| self.config_str("/ragdoc/root"))?;
        (valid_ssh_host(host) && valid_absolute(root)).then(|| RagdocTarget {
            host: host.to_string(),
            root: root.to_string(),
        })
    }

    /// Dépôt local des convertisseurs Ragdrop (utilisé seulement quand Ragdoc
    /// est configuré).
    pub fn ragdoc_local_root(&self) -> PathBuf {
        self.env_value("ATELIER_RAGDOC_LOCAL_ROOT")
            .or_else(|| self.config_str("/ragdoc/localRoot"))
            .map(PathBuf::from)
            .unwrap_or_else(|| self.home.join("Documents/Ragdoc"))
    }

    pub fn gbrain(&self) -> Option<GbrainTarget> {
        // Hook de test des fixtures kb_parity : toujours le binaire local.
        if self.env_value("ATELIER_TEST_GBRAIN").is_some() {
            return Some(GbrainTarget::Local);
        }
        let host = match self.env_set("ATELIER_GBRAIN_SSH_HOST") {
            Some(value) => value,
            None => self
                .config
                .pointer("/gbrain/sshHost")
                .and_then(Value::as_str)
                .map(str::trim)?,
        };
        if host.is_empty() {
            Some(GbrainTarget::Local)
        } else {
            valid_ssh_host(host).then(|| GbrainTarget::Ssh(host.to_string()))
        }
    }

    pub fn nas_host(&self) -> Option<String> {
        self.env_value("ATELIER_NAS_HOST")
            .or_else(|| self.config_str("/compute/nasHost"))
            .filter(|host| valid_ssh_host(host))
            .map(str::to_string)
    }

    pub fn cluster(&self, id: &str) -> Option<ClusterTarget> {
        if !CLUSTERS.contains(&id) {
            return None;
        }
        let prefix = format!("ATELIER_{}", id.to_uppercase());
        let host = self
            .env_value(&format!("{prefix}_HOST"))
            .or_else(|| self.config_str(&format!("/compute/clusters/{id}")))
            .filter(|host| valid_ssh_host(host))?;
        let gateway = match self.env_set(&format!("{prefix}_GATEWAY")) {
            Some(value) => Some(value),
            None => self.config_str("/compute/clusterGateway"),
        }
        .filter(|value| !value.is_empty());
        if gateway.is_some_and(|value| !valid_ssh_host(value)) {
            return None;
        }
        Some(ClusterTarget {
            host: host.to_string(),
            gateway: gateway.map(str::to_string),
        })
    }

    pub fn crossref_mailto(&self) -> Option<String> {
        self.env_value("ATELIER_CROSSREF_MAILTO")
            .or_else(|| self.config_str("/crossrefMailto"))
            .filter(|mail| valid_email(mail))
            .map(str::to_string)
    }

    /// Dossier de données Zotero : variable, réglage, préférences de Zotero
    /// (dossier personnalisé), puis `~/Zotero`.
    pub fn zotero(&self) -> (PathBuf, ZoteroSource) {
        if let Some(dir) = self.env_value("ATELIER_ZOTERO_DIR") {
            return (PathBuf::from(dir), ZoteroSource::Env);
        }
        if let Some(dir) = self.config_str("/zoteroDir") {
            return (expand_home(dir, &self.home), ZoteroSource::Config);
        }
        if let Some(dir) = zotero_prefs_data_dir(&self.home) {
            return (dir, ZoteroSource::ZoteroPrefs);
        }
        (self.home.join("Zotero"), ZoteroSource::Default)
    }

    pub fn zotero_dir(&self) -> PathBuf {
        self.zotero().0
    }

    /// Ce qui s'applique vraiment, pour l'interface (message `integrations`).
    pub fn effective_json(&self) -> Value {
        let (zotero_dir, source) = self.zotero();
        let cluster = |id: &str| {
            self.cluster(id)
                .map(|c| json!({"host": c.host, "gateway": c.gateway}))
                .unwrap_or(Value::Null)
        };
        json!({
            "ragdoc": self.ragdoc().is_some(),
            "gbrain": match self.gbrain() {
                Some(GbrainTarget::Local) => json!("local"),
                Some(GbrainTarget::Ssh(_)) => json!("ssh"),
                None => Value::Null,
            },
            "nasHost": self.nas_host(),
            "clusters": {"narval": cluster("narval"), "rorqual": cluster("rorqual")},
            "crossref": self.crossref_mailto().is_some(),
            "zoteroDir": zotero_dir.display().to_string(),
            "zoteroFound": zotero_dir.join("zotero.sqlite").is_file(),
            "zoteroSource": source.as_str(),
        })
    }
}

fn expand_home(path: &str, home: &Path) -> PathBuf {
    match path.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None if path == "~" => home.to_path_buf(),
        None => PathBuf::from(path),
    }
}

/// Alias ou hôte SSH passé comme UN argument à `ssh` : jamais d'option
/// (`-…`), jamais d'espace ni de caractère de shell.
pub fn valid_ssh_host(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 253
        && !value.starts_with('-')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b'@'))
}

fn valid_absolute(value: &str) -> bool {
    value.starts_with('/') && !value.chars().any(char::is_control)
}

fn valid_email(value: &str) -> bool {
    let mut parts = value.split('@');
    let (Some(user), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    !user.is_empty()
        && domain.contains('.')
        && value.len() <= 254
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_' | b'+' | b'@'))
}

fn clean(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Valide et normalise une configuration reçue de l'interface. Les champs
/// vides disparaissent ; une section sans champ utile aussi. Erreur = premier
/// champ invalide, en clair.
pub fn normalize(input: &Value) -> Result<Value, String> {
    let mut out = Map::new();
    out.insert("version".into(), json!(1));
    if let Some(seed) = clean(input.get("seededFrom")) {
        out.insert("seededFrom".into(), json!(seed));
    }
    if let Some(ragdoc) = input.get("ragdoc").filter(|v| v.is_object()) {
        let host = clean(ragdoc.get("host"));
        let root = clean(ragdoc.get("root"));
        let local_root = clean(ragdoc.get("localRoot"));
        match (&host, &root) {
            (Some(host), Some(root)) => {
                if !valid_ssh_host(host) {
                    return Err(format!("Hôte SSH Ragdoc invalide : {host}"));
                }
                if !valid_absolute(root) {
                    return Err("Le dossier Ragdoc doit être un chemin absolu".into());
                }
                let mut section = json!({"host": host, "root": root});
                if let Some(local) = local_root {
                    if !valid_absolute(&local) {
                        return Err("Le dépôt Ragdoc local doit être un chemin absolu".into());
                    }
                    section["localRoot"] = json!(local);
                }
                out.insert("ragdoc".into(), section);
            }
            (None, None) => {}
            _ => return Err("Ragdoc demande un hôte SSH ET un dossier distant".into()),
        }
    }
    if let Some(gbrain) = input.get("gbrain").filter(|v| v.is_object()) {
        let host = gbrain
            .get("sshHost")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("");
        if !host.is_empty() && !valid_ssh_host(host) {
            return Err(format!("Hôte SSH gbrain invalide : {host}"));
        }
        out.insert("gbrain".into(), json!({"sshHost": host}));
    }
    if let Some(compute) = input.get("compute").filter(|v| v.is_object()) {
        let mut section = Map::new();
        for key in ["nasHost", "clusterGateway"] {
            if let Some(host) = clean(compute.get(key)) {
                if !valid_ssh_host(&host) {
                    return Err(format!("Hôte SSH invalide : {host}"));
                }
                section.insert(key.into(), json!(host));
            }
        }
        let mut clusters = Map::new();
        for id in CLUSTERS {
            if let Some(host) = clean(compute.pointer(&format!("/clusters/{id}"))) {
                if !valid_ssh_host(&host) {
                    return Err(format!("Alias SSH de grappe invalide : {host}"));
                }
                clusters.insert(id.to_string(), json!(host));
            }
        }
        if !clusters.is_empty() {
            section.insert("clusters".into(), Value::Object(clusters));
        }
        if !section.is_empty() {
            out.insert("compute".into(), Value::Object(section));
        }
    }
    if let Some(mail) = clean(input.get("crossrefMailto")) {
        if !valid_email(&mail) {
            return Err(format!("Courriel Crossref invalide : {mail}"));
        }
        out.insert("crossrefMailto".into(), json!(mail));
    }
    if let Some(dir) = clean(input.get("zoteroDir")) {
        if !(valid_absolute(&dir) || dir == "~" || dir.starts_with("~/")) {
            return Err("Le dossier Zotero doit être un chemin absolu".into());
        }
        out.insert("zoteroDir".into(), json!(dir));
    }
    Ok(Value::Object(out))
}

/// Enregistre une configuration validée (écriture atomique) et la renvoie
/// normalisée.
pub fn save(app_dir: &Path, input: &Value) -> Result<Value, String> {
    let config = normalize(input)?;
    write_atomic(app_dir, &config).map_err(|e| format!("Enregistrement impossible : {e}"))?;
    Ok(config)
}

fn write_atomic(app_dir: &Path, config: &Value) -> std::io::Result<()> {
    std::fs::create_dir_all(app_dir)?;
    let target = file_path(app_dir);
    let tmp = app_dir.join(format!(".{FILE_NAME}.tmp-{}", std::process::id()));
    let mut bytes = serde_json::to_vec_pretty(config).map_err(std::io::Error::other)?;
    bytes.push(b'\n');
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, &target)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Migration {
    /// Le fichier existait déjà : rien n'est touché.
    AlreadyPresent,
    /// Trace d'usage trouvée : les anciennes valeurs sont reprises.
    Legacy,
    /// Installation neuve : aucune intégration.
    Empty,
}

/// Premier démarrage après la mise à jour : crée `integrations.json`. Les
/// anciennes valeurs (rorqual, nas, grappes) ne sont reprises que si l'app
/// porte la trace d'un usage RÉUSSI de Ragdoc ou de gbrain — un brouillon
/// d'import seul ne compte pas, il se crée sans aucune connexion.
pub fn migrate_legacy(app_dir: &Path) -> std::io::Result<Migration> {
    migrate_legacy_in(app_dir, &home_dir())
}

fn migrate_legacy_in(app_dir: &Path, home: &Path) -> std::io::Result<Migration> {
    if file_path(app_dir).exists() {
        return Ok(Migration::AlreadyPresent);
    }
    if has_legacy_usage(app_dir, home) {
        write_atomic(app_dir, &legacy_config())?;
        Ok(Migration::Legacy)
    } else {
        write_atomic(app_dir, &json!({"version": 1}))?;
        Ok(Migration::Empty)
    }
}

fn has_legacy_usage(app_dir: &Path, home: &Path) -> bool {
    // Dépôt local de Ragdoc (convertisseur PDF, `ragdoc_local_root`) : propre
    // à l'installation de l'auteur, il suffit même si la base de connaissances
    // ne garde aucune trace d'un appel réussi.
    if home.join("Documents/Ragdoc").is_dir() {
        return true;
    }
    let knowledge = app_dir.join("knowledge");
    let registry_used = std::fs::read(knowledge.join("knowledge.json"))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .is_some_and(|value| mentions_remote_corpus(&value, "kind"));
    let receipt = std::fs::read_dir(knowledge.join("article-drafts"))
        .map(|entries| {
            entries.flatten().any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".indexed.json")
            })
        })
        .unwrap_or(false);
    let evidence = std::fs::read_dir(app_dir.join("evidence"))
        .map(|entries| {
            entries.flatten().any(|entry| {
                std::fs::read(entry.path())
                    .ok()
                    .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                    .is_some_and(|value| mentions_remote_corpus(&value, "source"))
            })
        })
        .unwrap_or(false);
    registry_used || receipt || evidence
}

fn mentions_remote_corpus(value: &Value, key: &str) -> bool {
    match value {
        Value::Object(map) => {
            map.get(key)
                .and_then(Value::as_str)
                .is_some_and(|kind| kind == "ragdoc" || kind == "gbrain")
                || map.values().any(|child| mentions_remote_corpus(child, key))
        }
        Value::Array(list) => list.iter().any(|child| mentions_remote_corpus(child, key)),
        _ => false,
    }
}

/// Dossier de données choisi dans Zotero (Réglages > Avancé > Fichiers et
/// dossiers), lu dans `prefs.js` du profil : `extensions.zotero.useDataDir`
/// à `true` et `extensions.zotero.dataDir` non vide.
pub fn zotero_prefs_data_dir(home: &Path) -> Option<PathBuf> {
    let roots = [
        home.join("Library/Application Support/Zotero/Profiles"),
        home.join(".zotero/zotero"),
    ];
    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        let mut profiles: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
        profiles.sort();
        for profile in profiles {
            let Ok(text) = std::fs::read_to_string(profile.join("prefs.js")) else {
                continue;
            };
            if let Some(dir) = data_dir_from_prefs(&text) {
                return Some(dir);
            }
        }
    }
    None
}

fn data_dir_from_prefs(text: &str) -> Option<PathBuf> {
    let mut use_data_dir = false;
    let mut data_dir = None;
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("user_pref(\"extensions.zotero.useDataDir\",") {
            use_data_dir = rest.trim_start().starts_with("true");
        } else if let Some(rest) = line.strip_prefix("user_pref(\"extensions.zotero.dataDir\",") {
            data_dir = js_string(rest.trim_start());
        }
    }
    data_dir
        .filter(|dir| use_data_dir && dir.starts_with('/'))
        .map(PathBuf::from)
}

/// Premier littéral de chaîne JavaScript de `text` (`"…"`), échappements
/// `\\`, `\"` et `\uXXXX` décodés.
fn js_string(text: &str) -> Option<String> {
    let mut chars = text.strip_prefix('"')?.chars();
    let mut out = String::new();
    while let Some(c) = chars.next() {
        match c {
            '"' => return Some(out),
            '\\' => match chars.next()? {
                'u' => {
                    let code: String = chars.by_ref().take(4).collect();
                    out.push(char::from_u32(u32::from_str_radix(&code, 16).ok()?)?);
                }
                'n' => out.push('\n'),
                other => out.push(other),
            },
            other => out.push(other),
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with(config: Value, env: &[(&str, &str)]) -> Integrations {
        Integrations::from_parts(
            config,
            env.iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            PathBuf::from("/nonexistent-home"),
        )
    }

    #[test]
    fn nothing_is_configured_by_default() {
        let integrations = with(json!({}), &[]);
        assert_eq!(integrations.ragdoc(), None);
        assert_eq!(integrations.gbrain(), None);
        assert_eq!(integrations.nas_host(), None);
        assert_eq!(integrations.cluster("narval"), None);
        assert_eq!(integrations.cluster("rorqual"), None);
        assert_eq!(integrations.crossref_mailto(), None);
        let effective = integrations.effective_json();
        assert_eq!(effective["ragdoc"], false);
        assert_eq!(effective["gbrain"], Value::Null);
        assert_eq!(effective["zoteroSource"], "default");
        assert_eq!(effective["zoteroDir"], "/nonexistent-home/Zotero");
    }

    #[test]
    fn legacy_values_come_back_only_through_the_file() {
        let integrations = with(legacy_config(), &[]);
        assert_eq!(
            integrations.ragdoc(),
            Some(RagdocTarget {
                host: "rorqual".into(),
                root: "/volume1/Services/mcp/ragdoc".into()
            })
        );
        assert_eq!(integrations.gbrain(), Some(GbrainTarget::Ssh("nas".into())));
        assert_eq!(integrations.nas_host().as_deref(), Some("nas"));
        assert_eq!(
            integrations.cluster("narval"),
            Some(ClusterTarget {
                host: "narval-vpn".into(),
                gateway: Some("nas".into())
            })
        );
    }

    #[test]
    fn environment_wins_over_the_file() {
        let integrations = with(
            legacy_config(),
            &[
                ("ATELIER_GBRAIN_SSH_HOST", ""),
                ("ATELIER_NAS_HOST", "other"),
                ("ATELIER_NARVAL_GATEWAY", ""),
                ("ATELIER_ZOTERO_DIR", "/fixtures/zotero"),
            ],
        );
        assert_eq!(integrations.gbrain(), Some(GbrainTarget::Local));
        assert_eq!(integrations.nas_host().as_deref(), Some("other"));
        assert_eq!(integrations.cluster("narval").unwrap().gateway, None);
        assert_eq!(
            integrations.zotero(),
            (PathBuf::from("/fixtures/zotero"), ZoteroSource::Env)
        );
    }

    #[test]
    fn test_gbrain_hook_forces_the_local_binary() {
        let integrations = with(json!({}), &[("ATELIER_TEST_GBRAIN", "/tmp/fake")]);
        assert_eq!(integrations.gbrain(), Some(GbrainTarget::Local));
    }

    #[test]
    fn empty_gbrain_host_in_file_means_local_binary() {
        assert_eq!(
            with(json!({"gbrain": {"sshHost": ""}}), &[]).gbrain(),
            Some(GbrainTarget::Local)
        );
    }

    #[test]
    fn option_like_hosts_are_never_used() {
        let integrations = with(
            json!({"ragdoc": {"host": "-oProxyCommand=x", "root": "/r"}}),
            &[("ATELIER_NAS_HOST", "-x")],
        );
        assert_eq!(integrations.ragdoc(), None);
        assert_eq!(integrations.nas_host(), None);
    }

    #[test]
    fn normalize_drops_empty_fields_and_rejects_bad_ones() {
        let normalized = normalize(&json!({
            "ragdoc": {"host": "", "root": ""},
            "gbrain": {"sshHost": "nas"},
            "compute": {"nasHost": " ", "clusters": {"narval": "narval", "rorqual": ""}},
            "crossrefMailto": "",
            "zoteroDir": "~/Dropbox/Zotero"
        }))
        .unwrap();
        assert_eq!(
            normalized,
            json!({
                "version": 1,
                "gbrain": {"sshHost": "nas"},
                "compute": {"clusters": {"narval": "narval"}},
                "zoteroDir": "~/Dropbox/Zotero"
            })
        );
        assert!(normalize(&json!({"ragdoc": {"host": "rorqual"}})).is_err());
        assert!(normalize(&json!({"ragdoc": {"host": "a b", "root": "/r"}})).is_err());
        assert!(normalize(&json!({"ragdoc": {"host": "h", "root": "relative"}})).is_err());
        assert!(normalize(&json!({"crossrefMailto": "not-an-email"})).is_err());
        assert!(normalize(&json!({"compute": {"nasHost": "--help"}})).is_err());
    }

    #[test]
    fn config_zotero_dir_expands_home() {
        let integrations = Integrations::from_parts(
            json!({"zoteroDir": "~/Dropbox/Zotero"}),
            BTreeMap::new(),
            PathBuf::from("/Users/someone"),
        );
        assert_eq!(
            integrations.zotero(),
            (PathBuf::from("/Users/someone/Dropbox/Zotero"), ZoteroSource::Config)
        );
    }

    #[test]
    fn zotero_prefs_custom_data_dir_is_detected() {
        let home = tempfile::tempdir().unwrap();
        let profile = home
            .path()
            .join("Library/Application Support/Zotero/Profiles/abcd.default");
        std::fs::create_dir_all(&profile).unwrap();
        std::fs::write(
            profile.join("prefs.js"),
            "user_pref(\"extensions.zotero.dataDir\", \"/Users/x/Dropbox/Zot\\u00e9ro\");\n\
             user_pref(\"extensions.zotero.useDataDir\", true);\n",
        )
        .unwrap();
        assert_eq!(
            zotero_prefs_data_dir(home.path()),
            Some(PathBuf::from("/Users/x/Dropbox/Zotéro"))
        );
        let integrations =
            Integrations::from_parts(json!({}), BTreeMap::new(), home.path().to_path_buf());
        assert_eq!(integrations.zotero().1, ZoteroSource::ZoteroPrefs);
    }

    #[test]
    fn zotero_prefs_without_use_data_dir_are_ignored() {
        assert_eq!(
            data_dir_from_prefs("user_pref(\"extensions.zotero.dataDir\", \"/x\");\n"),
            None
        );
    }

    /// Dossier personnel vide : les tests ne dépendent pas du Mac qui les lance.
    fn no_home() -> PathBuf {
        std::env::temp_dir().join("atelier-integrations-no-home")
    }

    #[test]
    fn a_local_ragdoc_checkout_restores_the_previous_setup() {
        let dir = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(home.path().join("Documents/Ragdoc/scripts")).unwrap();
        assert_eq!(migrate_legacy_in(dir.path(), home.path()).unwrap(), Migration::Legacy);
        let integrations =
            Integrations::from_parts(read_config(dir.path()), BTreeMap::new(), home.path().into());
        assert_eq!(integrations.ragdoc().map(|target| target.host).as_deref(), Some("rorqual"));
        assert!(integrations.gbrain().is_some());
        assert_eq!(integrations.cluster("narval").map(|c| c.host).as_deref(), Some("narval-vpn"));
    }

    #[test]
    fn fresh_install_gets_an_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(migrate_legacy_in(dir.path(), &no_home()).unwrap(), Migration::Empty);
        assert_eq!(read_config(dir.path()), json!({"version": 1}));
        assert_eq!(migrate_legacy_in(dir.path(), &no_home()).unwrap(), Migration::AlreadyPresent);
    }

    #[test]
    fn a_draft_alone_is_not_evidence_of_usage() {
        let dir = tempfile::tempdir().unwrap();
        let drafts = dir.path().join("knowledge/article-drafts");
        std::fs::create_dir_all(&drafts).unwrap();
        std::fs::write(drafts.join("abc.ragdoc.json"), "{}").unwrap();
        assert_eq!(migrate_legacy_in(dir.path(), &no_home()).unwrap(), Migration::Empty);
    }

    #[test]
    fn remote_corpus_sources_restore_the_previous_setup() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("knowledge")).unwrap();
        std::fs::write(
            dir.path().join("knowledge/knowledge.json"),
            r#"{"sources":{"a":{"id":"a","kind":"pdf"},"b":{"id":"b","kind":"ragdoc"}}}"#,
        )
        .unwrap();
        assert_eq!(migrate_legacy_in(dir.path(), &no_home()).unwrap(), Migration::Legacy);
        let integrations =
            Integrations::from_parts(read_config(dir.path()), BTreeMap::new(), PathBuf::from("/h"));
        assert!(integrations.ragdoc().is_some());
        assert_eq!(integrations.nas_host().as_deref(), Some("nas"));
    }

    #[test]
    fn indexed_receipts_and_evidence_pins_also_count() {
        let receipts = tempfile::tempdir().unwrap();
        let drafts = receipts.path().join("knowledge/article-drafts");
        std::fs::create_dir_all(&drafts).unwrap();
        std::fs::write(drafts.join("abc.indexed.json"), "{}").unwrap();
        assert_eq!(migrate_legacy_in(receipts.path(), &no_home()).unwrap(), Migration::Legacy);

        let pins = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(pins.path().join("evidence")).unwrap();
        std::fs::write(
            pins.path().join("evidence/p.json"),
            r#"[{"source":"gbrain","quote":"q"}]"#,
        )
        .unwrap();
        assert_eq!(migrate_legacy_in(pins.path(), &no_home()).unwrap(), Migration::Legacy);
    }

    #[test]
    fn save_round_trips_through_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let saved = save(dir.path(), &json!({"compute": {"nasHost": "box"}})).unwrap();
        assert_eq!(read_config(dir.path()), saved);
        assert!(save(dir.path(), &json!({"compute": {"nasHost": "a;b"}})).is_err());
        assert_eq!(read_config(dir.path()), saved);
    }
}
