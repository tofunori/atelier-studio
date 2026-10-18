//! Calculs lancés par l'agent (plan rattrapage-claude-science, chantier 4).
//!
//! Ce module ne décide RIEN : il valide une demande, estime son coût, puis,
//! une fois l'accord donné sur la carte du fil (côté runtime), la soumet, la
//! sonde et l'annule. Trois chemins, tous sans invite interactive :
//! - Mac : `atelier-run` détaché (manifeste lu par la surface Calculs) ;
//! - NAS : le même `atelier-run`, déposé et lancé par ssh avec `setsid nohup` ;
//! - grappes Slurm (Narval, Rorqual) : `sbatch` par la passerelle réglée dans
//!   Réglages › Intégrations (le relais du NAS).
//!
//! Le script de l'agent voyage en base64 : aucun caractère qu'il contient ne
//! peut sortir de la commande distante. Tout le reste (dossier, ressources,
//! libellé) est validé caractère par caractère avant de toucher un shell.

use super::exec::{classify_ssh_failure, shell_quote, Exec, ExecError, SSH_OPTIONS};
use super::local::{parse_manifest, pid_alive};
use super::types::{HostError, RunState};
use super::ComputeConfig;
use crate::narval::NarvalProfile;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Le lanceur partagé par le Mac et le NAS : un seul fichier, versionné ici.
const ATELIER_RUN: &str = include_str!("../../../../../scripts/atelier-run");
pub const SCRIPT_MAX: usize = 64 * 1024;
pub const LABEL_MAX: usize = 80;
const SSH_TIMEOUT: Duration = Duration::from_secs(30);

/// Hôte visé par une tâche. Rorqual n'a pas de filtre dans Calculs, mais on
/// peut y soumettre : même protocole que Narval.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Target {
    Mac,
    Nas,
    Narval,
    Rorqual,
}

impl Target {
    pub const ALL: [Target; 4] = [Target::Mac, Target::Nas, Target::Narval, Target::Rorqual];

    pub fn parse(raw: &str) -> Option<Target> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "mac" | "local" => Some(Target::Mac),
            "nas" => Some(Target::Nas),
            "narval" => Some(Target::Narval),
            "rorqual" => Some(Target::Rorqual),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Target::Mac => "mac",
            Target::Nas => "nas",
            Target::Narval => "narval",
            Target::Rorqual => "rorqual",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Target::Mac => "Mac",
            Target::Nas => "NAS",
            Target::Narval => "Narval",
            Target::Rorqual => "Rorqual",
        }
    }

    pub fn is_slurm(self) -> bool {
        matches!(self, Target::Narval | Target::Rorqual)
    }
}

/// Ressources demandées. Seules les grappes les lisent ; sur le Mac et le
/// NAS, la tâche prend ce que la machine a.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Resources {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpus: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpus: Option<u32>,
    /// `--mem` Slurm : `16G`, `4000M`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mem: Option<String>,
    /// `--time` Slurm : `90`, `2:00:00`, `1-12:00`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub partition: Option<String>,
}

/// Demande validée : c'est elle, et elle seule, que la carte montre et que
/// le clic Lancer soumet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSpec {
    pub host: Target,
    pub label: String,
    pub work_dir: String,
    pub script: String,
    #[serde(default)]
    pub resources: Resources,
}

/// Coût estimé, affiché sur la carte. `None` partout sur le Mac et le NAS
/// (pas de quota) ; heures-cœur et heures-GPU sur une grappe.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Estimate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wall_hours: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_hours: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpu_hours: Option<f64>,
}

/// Ce que la soumission a obtenu : de quoi retrouver la tâche dans Calculs,
/// la sonder et l'annuler.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Launched {
    /// Identifiant de la surface Calculs (`local:…`, `nas:local:…`, `slurm:…`).
    pub run_id: String,
    /// Numéro de tâche Slurm, sinon l'identifiant du dossier de run.
    pub remote_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub log_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatus {
    pub state: RunState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
    /// État brut de l'hôte (`OUT_OF_MEMORY`, `TIMEOUT`, « processus disparu »).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

fn invalid(host: Target, message: impl Into<String>) -> HostError {
    HostError::new(host.as_str(), "invalid_job", message)
}

/// Identifiant d'une tâche : 12 hexadécimaux, la forme des runs `atelier-run`.
pub fn new_job_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..12].to_string()
}

pub fn valid_job_id(id: &str) -> bool {
    id.len() == 12 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn safe_word(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b',' | b'-'))
}

/// Durée Slurm en heures : `minutes`, `minutes:secondes`,
/// `heures:minutes:secondes`, `jours-heures`, `jours-heures:minutes`,
/// `jours-heures:minutes:secondes`. `None` si la forme est autre.
pub fn slurm_time_hours(raw: &str) -> Option<f64> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 16 || !raw.bytes().all(|b| b.is_ascii_digit() || b == b':' || b == b'-') {
        return None;
    }
    let num = |s: &str| -> Option<f64> {
        (!s.is_empty() && s.len() <= 5).then(|| s.parse::<f64>().ok()).flatten()
    };
    let (days, rest) = match raw.split_once('-') {
        Some((days, rest)) => (num(days)?, Some(rest)),
        None => (0.0, None),
    };
    let hours = match rest {
        Some(rest) => {
            let parts: Vec<&str> = rest.split(':').collect();
            match parts.as_slice() {
                [h] => num(h)?,
                [h, m] => num(h)? + num(m)? / 60.0,
                [h, m, s] => num(h)? + num(m)? / 60.0 + num(s)? / 3600.0,
                _ => return None,
            }
        }
        None => {
            let parts: Vec<&str> = raw.split(':').collect();
            match parts.as_slice() {
                [m] => num(m)? / 60.0,
                [m, s] => num(m)? / 60.0 + num(s)? / 3600.0,
                [h, m, s] => num(h)? + num(m)? / 60.0 + num(s)? / 3600.0,
                _ => return None,
            }
        }
    };
    Some(days * 24.0 + hours)
}

fn valid_mem(raw: &str) -> bool {
    let digits = raw.trim_end_matches(['K', 'M', 'G', 'T', 'k', 'm', 'g', 't']);
    !digits.is_empty()
        && digits.len() <= 7
        && digits.bytes().all(|b| b.is_ascii_digit())
        && raw.len() - digits.len() <= 1
}

/// Dossier de travail : absolu ou `~/…`, sans `..`, sans caractère de
/// contrôle. Les grappes le restreignent en plus à leurs racines.
fn valid_work_dir(raw: &str) -> bool {
    let path = raw.strip_prefix("~/").map(|rest| format!("/{rest}")).unwrap_or_else(|| raw.to_string());
    (raw.starts_with('/') || raw.starts_with("~/") || raw == "~")
        && raw.len() <= 1024
        && !raw.chars().any(char::is_control)
        && !Path::new(&path)
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
}

/// Chemin distant cité pour le shell : `~/x` devient `"$HOME"/'x'`.
fn remote_path(raw: &str) -> String {
    if raw == "~" {
        return "\"$HOME\"".into();
    }
    match raw.strip_prefix("~/") {
        Some(rest) => format!("\"$HOME\"/{}", shell_quote(rest)),
        None => shell_quote(raw),
    }
}

fn local_path(raw: &str, home: &Path) -> PathBuf {
    if raw == "~" {
        return home.to_path_buf();
    }
    match raw.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None => PathBuf::from(raw),
    }
}

/// Valide et normalise une demande de l'agent. Ce qui est refusé l'est avec
/// un message qu'il peut lire et corriger.
pub fn validate(raw: &Value) -> Result<JobSpec, HostError> {
    let text = |key: &str| raw.get(key).and_then(Value::as_str).unwrap_or("").trim().to_string();
    let host_raw = text("host");
    let host = Target::parse(&host_raw).ok_or_else(|| {
        HostError::new(&host_raw, "invalid_job", "hôte inconnu : mac, nas, narval ou rorqual")
    })?;
    let script = raw.get("script").and_then(Value::as_str).unwrap_or("").to_string();
    if script.trim().is_empty() {
        return Err(invalid(host, "script manquant"));
    }
    if script.len() > SCRIPT_MAX {
        return Err(invalid(host, "script trop long (64 Ko au plus)"));
    }
    if script.contains('\0') {
        return Err(invalid(host, "le script contient un octet nul"));
    }
    let work_dir = text("workDir");
    if !valid_work_dir(&work_dir) {
        return Err(invalid(host, "workDir : chemin absolu ou ~/… attendu, sans .."));
    }
    let label: String = text("label").chars().filter(|c| !c.is_control()).take(LABEL_MAX).collect();
    let label = if label.trim().is_empty() { "calcul".to_string() } else { label.trim().to_string() };

    let res = raw.get("resources").cloned().unwrap_or(Value::Null);
    let opt_text = |key: &str| {
        res.get(key)
            .and_then(|v| v.as_str().map(str::to_string).or_else(|| v.as_u64().map(|n| n.to_string())))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    let opt_num = |key: &str| res.get(key).and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok())));
    let mut resources = Resources {
        cpus: opt_num("cpus").map(|n| n as u32),
        gpus: opt_num("gpus").map(|n| n as u32),
        mem: opt_text("mem"),
        time: opt_text("time"),
        account: opt_text("account"),
        partition: opt_text("partition"),
    };
    if host.is_slurm() {
        if resources.cpus.is_some_and(|n| n == 0 || n > 192) {
            return Err(invalid(host, "cpus : de 1 à 192"));
        }
        if resources.gpus.is_some_and(|n| n > 8) {
            return Err(invalid(host, "gpus : de 0 à 8"));
        }
        if resources.gpus == Some(0) {
            resources.gpus = None;
        }
        let time = resources
            .time
            .as_deref()
            .ok_or_else(|| invalid(host, "resources.time requis sur une grappe (ex. 2:00:00)"))?;
        if slurm_time_hours(time).is_none_or(|h| h <= 0.0) {
            return Err(invalid(host, "resources.time : forme Slurm attendue (90, 2:00:00, 1-12:00)"));
        }
        if resources.mem.as_deref().is_some_and(|m| !valid_mem(m)) {
            return Err(invalid(host, "resources.mem : forme 16G ou 4000M"));
        }
        for (name, value) in [("account", &resources.account), ("partition", &resources.partition)] {
            if value.as_deref().is_some_and(|v| !safe_word(v, 64)) {
                return Err(invalid(host, format!("resources.{name} : lettres, chiffres, _ . , - seulement")));
            }
        }
    } else {
        // Le Mac et le NAS n'ont pas d'ordonnanceur : rien à transmettre.
        resources = Resources::default();
    }
    Ok(JobSpec { host, label, work_dir, script, resources })
}

pub fn estimate(spec: &JobSpec) -> Estimate {
    if !spec.host.is_slurm() {
        return Estimate::default();
    }
    let round = |x: f64| (x * 10.0).round() / 10.0;
    let wall = spec.resources.time.as_deref().and_then(slurm_time_hours);
    Estimate {
        wall_hours: wall.map(round),
        cpu_hours: wall.map(|h| round(h * f64::from(spec.resources.cpus.unwrap_or(1)))),
        gpu_hours: wall.zip(spec.resources.gpus).map(|(h, g)| round(h * f64::from(g))),
    }
}

/// Nom de tâche Slurm tiré du libellé (`--job-name` n'accepte pas tout).
fn job_name(label: &str) -> String {
    let name: String = label
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-') { c } else { '_' })
        .take(40)
        .collect();
    if name.trim_matches('_').is_empty() { "atelier".into() } else { name }
}

fn b64(text: &str) -> String {
    base64::engine::general_purpose::STANDARD.encode(text.as_bytes())
}

fn ssh_error(host: Target, output_stderr: &str) -> HostError {
    let (code, message) = classify_ssh_failure(output_stderr);
    let message = if code == "auth" && host.is_slurm() {
        // Narval exige Duo : le relais doit avoir une connexion ouverte.
        // On le dit, sans réessayer (plan, chantier 4).
        format!(
            "{} refuse la connexion (authentification Duo requise) : ouvre une session sur le relais, puis relance depuis la carte",
            host.label()
        )
    } else {
        message
    };
    HostError::new(host.as_str(), &code, message)
}

fn run_ssh(exec: &dyn Exec, host: Target, target: &str, command: &str) -> Result<String, HostError> {
    let mut args: Vec<&str> = SSH_OPTIONS.to_vec();
    args.push(target);
    args.push(command);
    match exec.run("ssh", &args, SSH_TIMEOUT) {
        Ok(output) if output.success => Ok(output.stdout),
        Ok(output) => Err(ssh_error(host, &output.stderr)),
        Err(ExecError { code, message }) => Err(HostError::new(host.as_str(), &code, message)),
    }
}

/// Résolution d'une grappe (alias, passerelle, racines) : par défaut le
/// réglage des intégrations ; les tests en passent une fabriquée.
pub type ClusterResolver<'a> = &'a dyn Fn(Target) -> Result<NarvalProfile, HostError>;

pub fn resolve_cluster(host: Target) -> Result<NarvalProfile, HostError> {
    NarvalProfile::from_env(host.as_str())
        .map_err(|error| HostError::new(host.as_str(), &error.code, error.message))
}

/// Soumet une tâche validée. Appelé seulement après le clic Lancer (ou le
/// réglage « Lancer sans demander » de cet hôte).
pub fn submit(
    cfg: &ComputeConfig,
    spec: &JobSpec,
    job_id: &str,
    exec: &dyn Exec,
    clusters: ClusterResolver,
) -> Result<Launched, HostError> {
    if !valid_job_id(job_id) {
        return Err(invalid(spec.host, "identifiant de tâche invalide"));
    }
    match spec.host {
        Target::Mac => submit_mac(cfg, spec, job_id, exec),
        Target::Nas => submit_nas(cfg, spec, job_id, exec),
        Target::Narval | Target::Rorqual => submit_slurm(&clusters(spec.host)?, spec, job_id, exec),
    }
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

fn write_executable(path: &Path, content: &str) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    if std::fs::read_to_string(path).ok().as_deref() != Some(content) {
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, content)?;
        std::fs::rename(&tmp, path)?;
    }
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
}

fn submit_mac(cfg: &ComputeConfig, spec: &JobSpec, job_id: &str, exec: &dyn Exec) -> Result<Launched, HostError> {
    let host = Target::Mac;
    let io = |what: &str, error: std::io::Error| HostError::new(host.as_str(), "io", format!("{what} : {error}"));
    let work_dir = local_path(&spec.work_dir, &home_dir());
    if !work_dir.is_dir() {
        return Err(invalid(host, format!("dossier de travail introuvable : {}", work_dir.display())));
    }
    let run_dir = cfg.runs_dir.join(job_id);
    std::fs::create_dir_all(&run_dir).map_err(|e| io("création du dossier du run", e))?;
    let script = run_dir.join("job.sh");
    write_executable(&script, &spec.script).map_err(|e| io("écriture du script", e))?;
    let bin_dir = cfg.runs_dir.parent().unwrap_or(&cfg.runs_dir).join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| io("création de ~/.atelier/bin", e))?;
    let runner = bin_dir.join("atelier-run");
    write_executable(&runner, ATELIER_RUN).map_err(|e| io("dépôt d'atelier-run", e))?;
    let (runner, runs_dir, script) = (
        runner.to_string_lossy().into_owned(),
        cfg.runs_dir.to_string_lossy().into_owned(),
        script.to_string_lossy().into_owned(),
    );
    exec.spawn_detached(
        "python3",
        &[&runner, "--run-id", job_id, "--label", &spec.label, "--runs-dir", &runs_dir, "--", "/bin/bash", &script],
        &work_dir,
    )
    .map_err(|ExecError { code, message }| HostError::new(host.as_str(), &code, message))?;
    Ok(Launched {
        run_id: format!("local:{job_id}"),
        remote_id: job_id.to_string(),
        log_path: Some(run_dir.join("log.txt").to_string_lossy().into_owned()),
    })
}

/// Commande distante du NAS : dépose `atelier-run` et le script, entre dans
/// le dossier de travail, lance le tout hors de la session ssh. Sortie :
/// `::LAUNCHED <pid>`.
pub fn nas_launch_command(spec: &JobSpec, job_id: &str) -> String {
    format!(
        "set -e; d=\"$HOME\"/.atelier/runs/{id}; b=\"$HOME\"/.atelier/bin; mkdir -p \"$d\" \"$b\"; \
         printf %s {runner} | base64 -d > \"$b/atelier-run.{id}\"; mv -f \"$b/atelier-run.{id}\" \"$b/atelier-run\"; chmod 755 \"$b/atelier-run\"; \
         printf %s {script} | base64 -d > \"$d/job.sh\"; chmod 755 \"$d/job.sh\"; \
         cd -- {wd}; \
         setsid nohup python3 \"$b/atelier-run\" --run-id {id} --label {label} -- /bin/bash \"$d/job.sh\" </dev/null >/dev/null 2>&1 & \
         printf '::LAUNCHED %s\\n' \"$!\"",
        id = job_id,
        runner = shell_quote(&b64(ATELIER_RUN)),
        script = shell_quote(&b64(&spec.script)),
        wd = remote_path(&spec.work_dir),
        label = shell_quote(&spec.label),
    )
}

fn submit_nas(cfg: &ComputeConfig, spec: &JobSpec, job_id: &str, exec: &dyn Exec) -> Result<Launched, HostError> {
    let host = Target::Nas;
    let alias = cfg
        .nas_alias
        .clone()
        .ok_or_else(|| HostError::new(host.as_str(), "not_configured", "NAS non configuré (Réglages › Intégrations)"))?;
    let out = run_ssh(exec, host, &alias, &nas_launch_command(spec, job_id))?;
    if !out.lines().any(|line| line.starts_with("::LAUNCHED")) {
        return Err(HostError::new(host.as_str(), "command_failed", "le NAS n'a pas confirmé le lancement"));
    }
    Ok(Launched {
        run_id: format!("nas:local:{job_id}"),
        remote_id: job_id.to_string(),
        log_path: Some(format!("~/.atelier/runs/{job_id}/log.txt")),
    })
}

/// Commande `sbatch` : le script est déposé dans `<workDir>/.atelier/`, la
/// sortie va à côté (`job-<id>-<numéro>.out`). `--parsable` rend le numéro.
pub fn sbatch_command(spec: &JobSpec, job_id: &str, work_dir: &str) -> String {
    let wd = shell_quote(work_dir);
    let mut options = vec![
        "--parsable".to_string(),
        format!("--job-name={}", job_name(&spec.label)),
        format!("--output=\"$d\"/job-{job_id}-%j.out"),
    ];
    let r = &spec.resources;
    if let Some(time) = &r.time {
        options.push(format!("--time={time}"));
    }
    if let Some(cpus) = r.cpus {
        options.push(format!("--cpus-per-task={cpus}"));
    }
    if let Some(mem) = &r.mem {
        options.push(format!("--mem={mem}"));
    }
    if let Some(gpus) = r.gpus {
        options.push(format!("--gpus={gpus}"));
    }
    if let Some(account) = &r.account {
        options.push(format!("--account={account}"));
    }
    if let Some(partition) = &r.partition {
        options.push(format!("--partition={partition}"));
    }
    // sbatch exige un interpréteur en tête de script.
    let script = if spec.script.starts_with("#!") {
        spec.script.clone()
    } else {
        format!("#!/bin/bash\n{}", spec.script)
    };
    format!(
        "set -e; d={wd}/.atelier; mkdir -p \"$d\"; printf %s {script} | base64 -d > \"$d/job-{job_id}.sh\"; \
         cd -- {wd}; sbatch {options} \"$d/job-{job_id}.sh\"",
        script = shell_quote(&b64(&script)),
        options = options.join(" "),
    )
}

/// `12345` ou `12345;narval` → `12345`.
pub fn parse_sbatch(stdout: &str) -> Option<String> {
    let first = stdout.lines().map(str::trim).find(|line| !line.is_empty())?;
    let id = first.split(';').next()?.trim();
    (!id.is_empty() && id.len() <= 20 && id.bytes().all(|b| b.is_ascii_digit())).then(|| id.to_string())
}

fn submit_slurm(profile: &NarvalProfile, spec: &JobSpec, job_id: &str, exec: &dyn Exec) -> Result<Launched, HostError> {
    let host = spec.host;
    let work_dir = if let Some(rest) = spec.work_dir.strip_prefix("~/") {
        // Les grappes Alliance ont toutes leur $HOME sous /home/<compte>.
        return Err(invalid(host, format!("sur {}, donne un chemin absolu (ex. /scratch/…/{rest})", host.label())));
    } else {
        profile
            .validate_path(&spec.work_dir)
            .map_err(|error| HostError::new(host.as_str(), "invalid_job", error.message))?
    };
    let (target, command) = profile.ssh_invocation(&sbatch_command(spec, job_id, &work_dir));
    let out = run_ssh(exec, host, &target, &command)?;
    let job = parse_sbatch(&out)
        .ok_or_else(|| HostError::new(host.as_str(), "command_failed", format!("réponse de sbatch illisible : {}", out.trim())))?;
    Ok(Launched {
        run_id: format!("slurm:{job}"),
        remote_id: job.clone(),
        log_path: Some(format!("{work_dir}/.atelier/job-{job_id}-{job}.out")),
    })
}

fn status_from_manifest(raw: &str, alive: Option<bool>) -> Option<JobStatus> {
    let manifest = parse_manifest(raw)?;
    let exit_code = serde_json::from_str::<Value>(raw.trim())
        .ok()
        .and_then(|v| v.get("exit_code").and_then(Value::as_i64))
        .map(|c| c as i32);
    let state = RunState::parse(&manifest.state);
    // Un manifeste « en cours » dont le processus a disparu : tué ou
    // machine redémarrée. On le dit plutôt que de sonder à l'infini.
    if state.is_live() && alive == Some(false) {
        return Some(JobStatus {
            state: RunState::Failed,
            exit_code,
            detail: Some("processus disparu (tué ou machine redémarrée)".into()),
        });
    }
    Some(JobStatus { state, exit_code, detail: None })
}

/// Sonde l'état d'une tâche lancée.
pub fn poll(
    cfg: &ComputeConfig,
    host: Target,
    launched: &Launched,
    exec: &dyn Exec,
    clusters: ClusterResolver,
) -> Result<JobStatus, HostError> {
    match host {
        Target::Mac => {
            if !valid_job_id(&launched.remote_id) {
                return Err(invalid(host, "identifiant de tâche invalide"));
            }
            let path = cfg.runs_dir.join(&launched.remote_id).join("run.json");
            let Ok(raw) = std::fs::read_to_string(&path) else {
                // atelier-run n'a pas encore écrit son manifeste
                return Ok(JobStatus { state: RunState::Queued, exit_code: None, detail: None });
            };
            let alive = parse_manifest(&raw).and_then(|m| m.pid).map(pid_alive);
            status_from_manifest(&raw, alive)
                .ok_or_else(|| HostError::new(host.as_str(), "command_failed", "manifeste illisible"))
        }
        Target::Nas => {
            if !valid_job_id(&launched.remote_id) {
                return Err(invalid(host, "identifiant de tâche invalide"));
            }
            let alias = cfg.nas_alias.clone().ok_or_else(|| {
                HostError::new(host.as_str(), "not_configured", "NAS non configuré (Réglages › Intégrations)")
            })?;
            let command = format!(
                "f=\"$HOME\"/.atelier/runs/{id}/run.json; if [ -f \"$f\" ]; then cat \"$f\"; \
                 p=$(sed -n 's/^ *\"pid\": *\\([0-9][0-9]*\\).*/\\1/p' \"$f\" | head -n 1); \
                 if [ -n \"$p\" ] && kill -0 \"$p\" 2>/dev/null; then printf '\\n::ALIVE\\n'; else printf '\\n::DEAD\\n'; fi; \
                 else printf '::MISSING\\n'; fi",
                id = launched.remote_id
            );
            let out = run_ssh(exec, host, &alias, &command)?;
            if out.trim() == "::MISSING" {
                return Ok(JobStatus { state: RunState::Queued, exit_code: None, detail: None });
            }
            let (json, marker) = out.rsplit_once("\n::").unwrap_or((out.as_str(), ""));
            let alive = match marker.trim() {
                "ALIVE" => Some(true),
                "DEAD" => Some(false),
                _ => None,
            };
            status_from_manifest(json, alive)
                .ok_or_else(|| HostError::new(host.as_str(), "command_failed", "manifeste du NAS illisible"))
        }
        Target::Narval | Target::Rorqual => {
            let job = &launched.remote_id;
            if job.is_empty() || !job.bytes().all(|b| b.is_ascii_digit()) {
                return Err(invalid(host, "numéro de tâche Slurm invalide"));
            }
            let profile = clusters(host)?;
            let (target, command) = profile.ssh_invocation(&format!(
                "sacct -j {job} -X -n -P -o State,ExitCode 2>/dev/null | head -n 1"
            ));
            let out = run_ssh(exec, host, &target, &command)?;
            Ok(parse_sacct(&out))
        }
    }
}

/// `COMPLETED|0:0`, `FAILED|2:0`, `CANCELLED by 123|0:15`, ou rien (tâche
/// pas encore connue de sacct) → en attente.
pub fn parse_sacct(stdout: &str) -> JobStatus {
    let line = stdout.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("");
    if line.is_empty() {
        return JobStatus { state: RunState::Queued, exit_code: None, detail: None };
    }
    let (raw_state, exit) = line.split_once('|').unwrap_or((line, ""));
    let raw_state = raw_state.split_whitespace().next().unwrap_or("").trim_end_matches('+');
    let state = super::slurm::normalize_slurm_state(raw_state);
    let exit_code = exit.split(':').next().and_then(|c| c.trim().parse::<i32>().ok());
    let detail = (state == RunState::Failed || state == RunState::Unknown).then(|| raw_state.to_string());
    JobStatus { state, exit_code, detail }
}

/// Annule une tâche (après confirmation sur la carte). Rien n'est supprimé :
/// le dossier, le script et le journal restent.
pub fn cancel(
    cfg: &ComputeConfig,
    host: Target,
    launched: &Launched,
    exec: &dyn Exec,
    clusters: ClusterResolver,
) -> Result<(), HostError> {
    match host {
        Target::Mac => {
            if !valid_job_id(&launched.remote_id) {
                return Err(invalid(host, "identifiant de tâche invalide"));
            }
            let raw = std::fs::read_to_string(cfg.runs_dir.join(&launched.remote_id).join("run.json"))
                .map_err(|_| HostError::new(host.as_str(), "not_found", "manifeste introuvable"))?;
            let pid = parse_manifest(&raw)
                .and_then(|m| m.pid)
                .filter(|pid| *pid > 1 && *pid <= i32::MAX as u32)
                .ok_or_else(|| HostError::new(host.as_str(), "not_found", "la tâche n'a pas de processus"))?;
            // atelier-run lance l'enfant dans sa propre session : on vise le
            // groupe entier (ses sous-processus compris).
            // SAFETY : simple envoi de signal à un groupe de processus.
            let rc = unsafe { libc::kill(-(pid as libc::pid_t), libc::SIGTERM) };
            if rc != 0 {
                return Err(HostError::new(host.as_str(), "not_found", "le processus n'existe plus"));
            }
            Ok(())
        }
        Target::Nas => {
            if !valid_job_id(&launched.remote_id) {
                return Err(invalid(host, "identifiant de tâche invalide"));
            }
            let alias = cfg.nas_alias.clone().ok_or_else(|| {
                HostError::new(host.as_str(), "not_configured", "NAS non configuré (Réglages › Intégrations)")
            })?;
            let command = format!(
                "f=\"$HOME\"/.atelier/runs/{id}/run.json; \
                 p=$(sed -n 's/^ *\"pid\": *\\([0-9][0-9]*\\).*/\\1/p' \"$f\" 2>/dev/null | head -n 1); \
                 if [ -n \"$p\" ] && kill -TERM -- -\"$p\" 2>/dev/null; then echo ::KILLED; else echo ::GONE; fi",
                id = launched.remote_id
            );
            let out = run_ssh(exec, host, &alias, &command)?;
            if out.contains("::KILLED") {
                Ok(())
            } else {
                Err(HostError::new(host.as_str(), "not_found", "le processus n'existe plus sur le NAS"))
            }
        }
        Target::Narval | Target::Rorqual => {
            let job = &launched.remote_id;
            if job.is_empty() || !job.bytes().all(|b| b.is_ascii_digit()) {
                return Err(invalid(host, "numéro de tâche Slurm invalide"));
            }
            let profile = clusters(host)?;
            let (target, command) = profile.ssh_invocation(&format!("scancel {job}"));
            run_ssh(exec, host, &target, &command).map(|_| ())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compute::exec::{FakeExec, Output};
    use serde_json::json;

    fn cfg(runs_dir: &Path) -> ComputeConfig {
        ComputeConfig {
            runs_dir: runs_dir.to_path_buf(),
            nas_alias: Some("nas".into()),
            nas_excluded: vec![],
            slurm_profile: "narval".into(),
            slurm_enabled: true,
        }
    }

    fn narval(_: Target) -> Result<NarvalProfile, HostError> {
        Ok(NarvalProfile {
            id: "narval".into(),
            host: "narval".into(),
            gateway: Some("nas".into()),
            roots: vec!["/home".into(), "/scratch".into(), "/project".into()],
        })
    }

    fn slurm_job() -> Value {
        json!({"host":"narval","label":"Ajustement M42 (JJA)","workDir":"/scratch/tofunori/m42",
               "script":"module load python\npython fit.py --region all\n",
               "resources":{"cpus":16,"time":"2:00:00","mem":"32G","account":"def-ckinnard_cpu"}})
    }

    #[test]
    fn une_demande_de_grappe_est_validee_et_chiffree() {
        let spec = validate(&slurm_job()).unwrap();
        assert_eq!(spec.host, Target::Narval);
        assert_eq!(spec.resources.cpus, Some(16));
        let cost = estimate(&spec);
        assert_eq!(cost.wall_hours, Some(2.0));
        assert_eq!(cost.cpu_hours, Some(32.0));
        assert_eq!(cost.gpu_hours, None);
        // Mac et NAS : pas d'ordonnanceur, pas de coût, ressources ignorées
        let mut nas = slurm_job();
        nas["host"] = json!("NAS");
        nas["workDir"] = json!("~/albedo");
        let spec = validate(&nas).unwrap();
        assert_eq!(spec.resources, Resources::default());
        assert_eq!(estimate(&spec), Estimate::default());
    }

    #[test]
    fn les_demandes_douteuses_sont_refusees_avant_tout_shell() {
        let cas: Vec<(Value, &str)> = vec![
            (json!({"host":"pluton","script":"x","workDir":"/a"}), "hôte inconnu"),
            (json!({"host":"nas","script":"  ","workDir":"/a"}), "script manquant"),
            (json!({"host":"nas","script":"x","workDir":"relatif"}), "workDir"),
            (json!({"host":"nas","script":"x","workDir":"/a/../../etc"}), "workDir"),
            (json!({"host":"nas","script":"x","workDir":"/a\nb"}), "workDir"),
            (json!({"host":"nas","script":"x".repeat(SCRIPT_MAX + 1),"workDir":"/a"}), "trop long"),
            (json!({"host":"narval","script":"x","workDir":"/scratch/a"}), "time requis"),
            (json!({"host":"narval","script":"x","workDir":"/scratch/a","resources":{"time":"2h"}}), "forme Slurm"),
            (json!({"host":"narval","script":"x","workDir":"/scratch/a","resources":{"time":"1:00:00","mem":"8GB"}}), "mem"),
            (json!({"host":"narval","script":"x","workDir":"/scratch/a","resources":{"time":"1:00:00","account":"a;rm -rf /"}}), "account"),
            (json!({"host":"narval","script":"x","workDir":"/scratch/a","resources":{"time":"1:00:00","cpus":0}}), "cpus"),
        ];
        for (demande, attendu) in cas {
            let err = validate(&demande).unwrap_err();
            assert_eq!(err.code, "invalid_job");
            assert!(err.message.contains(attendu), "{demande} → {}", err.message);
        }
    }

    #[test]
    fn les_durees_slurm_sont_lues_dans_toutes_leurs_formes() {
        for (raw, h) in [("90", 1.5), ("30:00", 0.5), ("2:00:00", 2.0), ("1-12", 36.0), ("1-0:30", 24.5), ("2-01:00:00", 49.0)] {
            assert_eq!(slurm_time_hours(raw), Some(h), "{raw}");
        }
        for bad in ["", "2h", "1:2:3:4", "-1", "1-", "a"] {
            assert_eq!(slurm_time_hours(bad), None, "{bad}");
        }
    }

    #[test]
    fn sbatch_passe_par_la_passerelle_avec_le_script_en_base64() {
        let spec = validate(&slurm_job()).unwrap();
        let exec = FakeExec::new().on("sbatch", Ok(Output::ok("65700123;narval\n")));
        let dir = tempfile::tempdir().unwrap();
        let launched = submit(&cfg(dir.path()), &spec, "0123456789ab", &exec, &narval).unwrap();
        assert_eq!(launched.run_id, "slurm:65700123");
        assert_eq!(launched.remote_id, "65700123");
        assert_eq!(
            launched.log_path.as_deref(),
            Some("/scratch/tofunori/m42/.atelier/job-0123456789ab-65700123.out")
        );
        let call = &exec.calls()[0];
        assert!(call.starts_with("ssh -o BatchMode=yes"), "{call}");
        assert!(call.contains(" -- nas ssh "), "rebond par le relais du NAS : {call}");
        for option in ["--time=2:00:00", "--cpus-per-task=16", "--mem=32G", "--account=def-ckinnard_cpu", "--job-name=Ajustement_M42__JJA_", "--parsable"] {
            assert!(call.contains(option), "{option} absent : {call}");
        }
        assert!(!call.contains("python fit.py"), "le script ne voyage qu'en base64");
        let b64 = b64("#!/bin/bash\nmodule load python\npython fit.py --region all\n");
        assert!(call.contains(&b64), "shebang ajouté puis encodé");
    }

    #[test]
    fn une_grappe_refuse_un_dossier_hors_de_ses_racines_ou_relatif_au_home() {
        let mut job = slurm_job();
        job["workDir"] = json!("/etc/cron.d");
        let spec = validate(&job).unwrap();
        let exec = FakeExec::new();
        let dir = tempfile::tempdir().unwrap();
        let err = submit(&cfg(dir.path()), &spec, "0123456789ab", &exec, &narval).unwrap_err();
        assert_eq!(err.code, "invalid_job");
        job["workDir"] = json!("~/m42");
        let spec = validate(&job).unwrap();
        assert!(submit(&cfg(dir.path()), &spec, "0123456789ab", &exec, &narval)
            .unwrap_err()
            .message
            .contains("chemin absolu"));
        assert!(exec.calls().is_empty(), "aucun ssh pour une demande refusée");
    }

    #[test]
    fn un_refus_duo_est_dit_sans_reessayer() {
        let spec = validate(&slurm_job()).unwrap();
        let exec = FakeExec::new().on(
            "ssh",
            Ok(Output::failed(255, "tofunori@narval: Permission denied (keyboard-interactive,hostbased).")),
        );
        let dir = tempfile::tempdir().unwrap();
        let err = submit(&cfg(dir.path()), &spec, "0123456789ab", &exec, &narval).unwrap_err();
        assert_eq!(err.code, "auth");
        assert!(err.message.contains("Duo"), "{}", err.message);
        assert_eq!(exec.calls().len(), 1, "une seule tentative");
        let illisible = FakeExec::new().on("sbatch", Ok(Output::ok("Submitted batch job\n")));
        assert_eq!(
            submit(&cfg(dir.path()), &spec, "0123456789ab", &illisible, &narval).unwrap_err().code,
            "command_failed"
        );
    }

    #[test]
    fn le_nas_recoit_atelier_run_et_le_script_puis_lance_hors_session() {
        let spec = validate(&json!({"host":"nas","label":"tendances 'albédo'","workDir":"~/albedo",
                                     "script":"python3 trends.py; echo $HOME"})).unwrap();
        let exec = FakeExec::new().on("::LAUNCHED", Ok(Output::ok("::LAUNCHED 31337\n")));
        let dir = tempfile::tempdir().unwrap();
        let launched = submit(&cfg(dir.path()), &spec, "a1b2c3d4e5f6", &exec, &narval).unwrap();
        assert_eq!(launched.run_id, "nas:local:a1b2c3d4e5f6", "visible dans Calculs comme un run NAS");
        let call = &exec.calls()[0];
        assert!(call.contains(" nas "), "{call}");
        assert!(call.contains("setsid nohup python3"), "{call}");
        assert!(call.contains("--run-id a1b2c3d4e5f6"));
        assert!(call.contains("cd -- \"$HOME\"/'albedo'"), "{call}");
        assert!(call.contains("--label 'tendances '\\''albédo'\\'''"), "libellé cité : {call}");
        assert!(!call.contains("trends.py"), "script en base64 seulement");
        assert!(call.contains(&b64(ATELIER_RUN)), "le lanceur voyage avec la tâche");
        let muet = FakeExec::new().on("ssh", Ok(Output::ok("")));
        assert_eq!(
            submit(&cfg(dir.path()), &spec, "a1b2c3d4e5f6", &muet, &narval).unwrap_err().code,
            "command_failed"
        );
    }

    #[test]
    fn le_mac_lance_atelier_run_detache_dans_le_dossier_de_travail() {
        let runs = tempfile::tempdir().unwrap();
        let work = tempfile::tempdir().unwrap();
        let runs_dir = runs.path().join("runs");
        let spec = validate(&json!({"host":"mac","label":"essai","workDir":work.path().to_string_lossy(),
                                     "script":"echo bonjour"})).unwrap();
        let exec = FakeExec::new();
        let launched = submit(&cfg(&runs_dir), &spec, "00aa11bb22cc", &exec, &narval).unwrap();
        assert_eq!(launched.run_id, "local:00aa11bb22cc");
        assert_eq!(std::fs::read_to_string(runs_dir.join("00aa11bb22cc/job.sh")).unwrap(), "echo bonjour");
        assert_eq!(std::fs::read_to_string(runs.path().join("bin/atelier-run")).unwrap(), ATELIER_RUN);
        let call = &exec.calls()[0];
        assert!(call.starts_with(&format!("detached[{}] python3 ", work.path().display())), "{call}");
        assert!(call.contains("--run-id 00aa11bb22cc --label essai --runs-dir"), "{call}");
        assert!(call.ends_with(&format!("-- /bin/bash {}", runs_dir.join("00aa11bb22cc/job.sh").display())));
        // dossier absent : refus avant d'écrire quoi que ce soit
        let spec = validate(&json!({"host":"mac","workDir":"/nulle/part","script":"x"})).unwrap();
        assert!(submit(&cfg(&runs_dir), &spec, "00aa11bb22cd", &exec, &narval).is_err());
        assert!(!runs_dir.join("00aa11bb22cd").exists());
        assert!(submit(&cfg(&runs_dir), &spec, "../evil", &exec, &narval).is_err());
    }

    #[test]
    fn la_sonde_lit_manifestes_et_sacct() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = cfg(dir.path());
        let mac = Launched { run_id: "local:00aa11bb22cc".into(), remote_id: "00aa11bb22cc".into(), log_path: None };
        let exec = FakeExec::new();
        assert_eq!(poll(&cfg, Target::Mac, &mac, &exec, &narval).unwrap().state, RunState::Queued, "pas encore de manifeste");
        std::fs::create_dir_all(dir.path().join("00aa11bb22cc")).unwrap();
        std::fs::write(
            dir.path().join("00aa11bb22cc/run.json"),
            r#"{"version":1,"id":"00aa11bb22cc","state":"failed","pid":null,"exit_code":3}"#,
        )
        .unwrap();
        let status = poll(&cfg, Target::Mac, &mac, &exec, &narval).unwrap();
        assert_eq!((status.state, status.exit_code), (RunState::Failed, Some(3)));

        let nas = Launched { run_id: "nas:local:a1b2c3d4e5f6".into(), remote_id: "a1b2c3d4e5f6".into(), log_path: None };
        let manifest = "{\n  \"version\": 1,\n  \"id\": \"a1b2c3d4e5f6\",\n  \"pid\": 77,\n  \"state\": \"running\"\n}";
        let exec = FakeExec::new().on("ssh", Ok(Output::ok(format!("{manifest}\n::DEAD\n"))));
        let status = poll(&cfg, Target::Nas, &nas, &exec, &narval).unwrap();
        assert_eq!(status.state, RunState::Failed, "en cours mais processus disparu");
        assert!(status.detail.unwrap().contains("disparu"));
        let exec = FakeExec::new().on("ssh", Ok(Output::ok(format!("{manifest}\n::ALIVE\n"))));
        assert_eq!(poll(&cfg, Target::Nas, &nas, &exec, &narval).unwrap().state, RunState::Running);

        let slurm = Launched { run_id: "slurm:65700123".into(), remote_id: "65700123".into(), log_path: None };
        let exec = FakeExec::new().on("sacct -j 65700123", Ok(Output::ok("OUT_OF_MEMORY|0:125\n")));
        let status = poll(&cfg, Target::Narval, &slurm, &exec, &narval).unwrap();
        assert_eq!(status.state, RunState::Failed);
        assert_eq!(status.detail.as_deref(), Some("OUT_OF_MEMORY"));
        assert!(exec.calls()[0].contains(" -- nas ssh "), "la sonde passe aussi par le relais");
        assert_eq!(parse_sacct("COMPLETED|0:0").state, RunState::Completed);
        assert_eq!(parse_sacct("CANCELLED by 3001|0:15").state, RunState::Failed);
        assert_eq!(parse_sacct("").state, RunState::Queued);
        assert_eq!(parse_sacct("RUNNING|0:0").exit_code, Some(0));
    }

    #[test]
    fn l_annulation_vise_la_bonne_tache_et_ne_supprime_rien() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = cfg(dir.path());
        let slurm = Launched { run_id: "slurm:65700123".into(), remote_id: "65700123".into(), log_path: None };
        let exec = FakeExec::new().on("scancel 65700123", Ok(Output::ok("")));
        cancel(&cfg, Target::Narval, &slurm, &exec, &narval).unwrap();
        let nas = Launched { run_id: "nas:local:a1b2c3d4e5f6".into(), remote_id: "a1b2c3d4e5f6".into(), log_path: None };
        let exec = FakeExec::new().on("ssh", Ok(Output::ok("::KILLED\n")));
        cancel(&cfg, Target::Nas, &nas, &exec, &narval).unwrap();
        assert!(exec.calls()[0].contains("kill -TERM -- -\"$p\""));
        assert!(!exec.calls()[0].contains("rm "), "rien n'est supprimé");
        let exec = FakeExec::new().on("ssh", Ok(Output::ok("::GONE\n")));
        assert_eq!(cancel(&cfg, Target::Nas, &nas, &exec, &narval).unwrap_err().code, "not_found");
        let forged = Launched { run_id: "slurm:1;rm".into(), remote_id: "1;rm -rf /".into(), log_path: None };
        let exec = FakeExec::new();
        assert!(cancel(&cfg, Target::Narval, &forged, &exec, &narval).is_err());
        assert!(poll(&cfg, Target::Narval, &forged, &exec, &narval).is_err());
        assert!(exec.calls().is_empty());
    }

    #[test]
    fn une_vraie_tache_mac_tourne_jusqu_au_bout() {
        // Bout en bout avec le vrai lanceur : seulement si python3 existe.
        if std::process::Command::new("python3").arg("--version").output().is_err() {
            return;
        }
        let runs = tempfile::tempdir().unwrap();
        let work = tempfile::tempdir().unwrap();
        let cfg = cfg(&runs.path().join("runs"));
        let spec = validate(&json!({"host":"mac","label":"bout","workDir":work.path().to_string_lossy(),
                                     "script":"pwd > here.txt; echo fini; exit 4"})).unwrap();
        let exec = crate::compute::exec::SystemExec;
        let launched = submit(&cfg, &spec, "abcdefabcdef", &exec, &narval).unwrap();
        let mut status = poll(&cfg, Target::Mac, &launched, &exec, &narval).unwrap();
        for _ in 0..100 {
            if !status.state.is_live() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
            status = poll(&cfg, Target::Mac, &launched, &exec, &narval).unwrap();
        }
        assert_eq!((status.state, status.exit_code), (RunState::Failed, Some(4)));
        let here = std::fs::read_to_string(work.path().join("here.txt")).unwrap();
        assert_eq!(std::fs::canonicalize(here.trim()).unwrap(), std::fs::canonicalize(work.path()).unwrap());
        let log = std::fs::read_to_string(launched.log_path.unwrap()).unwrap();
        assert!(log.contains("fini"));
    }
}
