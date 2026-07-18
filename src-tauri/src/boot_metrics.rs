use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const METRICS_SCHEMA_VERSION: u8 = 1;
const MAX_RUNS: usize = 100;
const MAX_PAYLOAD_BYTES: usize = 64 * 1024;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const ALLOWED_MARKS: [&str; 7] = [
    "frontendEvaluated",
    "uiStateHydrated",
    "reactCommitted",
    "firstMeaningfulPaint",
    "sidecarReady",
    "wsReady",
    "galleryReady",
];

static METRICS_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub struct BootClock {
    started_at: Instant,
}

impl BootClock {
    pub fn new() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }

    fn elapsed(&self) -> Duration {
        self.started_at.elapsed()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct BootMetricsV1 {
    schema_version: u8,
    app_version: String,
    boot_id: String,
    /// Ajouté par le backend au premier enregistrement du run. Le frontend ne
    /// fournit jamais cette valeur : elle sert de preuve calendaire au soak.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    recorded_at_unix_ms: Option<u64>,
    native_process_elapsed_at_frontend_eval_ms: f64,
    marks_ms: BTreeMap<String, f64>,
    flags: BootMetricFlags,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BootMetricFlags {
    ui_state_source: UiStateSource,
    sidecar_path: SidecarPath,
    gateway_deferred: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
enum UiStateSource {
    #[serde(rename = "native")]
    Native,
    #[serde(rename = "localStorage-fallback")]
    LocalStorageFallback,
    #[serde(rename = "legacy-http")]
    LegacyHttp,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
enum SidecarPath {
    #[serde(rename = "in-process")]
    InProcess,
    #[serde(rename = "lock-reuse")]
    LockReuse,
    #[serde(rename = "spawn")]
    Spawn,
    #[serde(rename = "unknown")]
    Unknown,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BootMetricsFileV1 {
    schema_version: u8,
    runs: Vec<BootMetricsV1>,
}

impl BootMetricsFileV1 {
    fn empty() -> Self {
        Self {
            schema_version: METRICS_SCHEMA_VERSION,
            runs: Vec::new(),
        }
    }
}

#[tauri::command]
pub fn boot_clock_elapsed_ms(clock: tauri::State<'_, BootClock>) -> f64 {
    clock.elapsed().as_secs_f64() * 1000.0
}

#[tauri::command]
pub fn record_boot_metrics(payload: BootMetricsV1) -> Result<(), String> {
    let path = boot_metrics_path()?;
    record_boot_metrics_at(&path, payload)
}

fn boot_metrics_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join("Library/Application Support/atelier-studio/boot-metrics.json"))
        .ok_or_else(|| "répertoire utilisateur introuvable pour boot-metrics.json".to_string())
}

fn validate_payload(payload: &BootMetricsV1) -> Result<(), String> {
    if payload.schema_version != METRICS_SCHEMA_VERSION {
        return Err(format!(
            "schéma boot metrics inconnu: {}",
            payload.schema_version
        ));
    }
    if payload.boot_id.is_empty() || payload.boot_id.len() > 128 {
        return Err("bootId vide ou trop long".into());
    }
    if payload.app_version.is_empty() || payload.app_version.len() > 64 {
        return Err("appVersion vide ou trop longue".into());
    }
    if !payload
        .native_process_elapsed_at_frontend_eval_ms
        .is_finite()
        || payload.native_process_elapsed_at_frontend_eval_ms < 0.0
    {
        return Err("offset natif invalide".into());
    }
    for (name, value) in &payload.marks_ms {
        if !ALLOWED_MARKS.contains(&name.as_str()) {
            return Err(format!("marque boot inconnue: {name}"));
        }
        if !value.is_finite() || *value < 0.0 {
            return Err(format!("durée boot invalide pour {name}"));
        }
    }
    let encoded = serde_json::to_vec(payload).map_err(|e| format!("encode boot metrics: {e}"))?;
    if encoded.len() > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "payload boot metrics surdimensionné: {} octets",
            encoded.len()
        ));
    }
    Ok(())
}

fn invalid_backup_path(path: &Path) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    path.with_file_name(format!(
        "boot-metrics.invalid-{stamp}-{}.json",
        std::process::id()
    ))
}

fn load_metrics_file(path: &Path) -> Result<BootMetricsFileV1, String> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(BootMetricsFileV1::empty())
        }
        Err(error) => return Err(format!("stat {}: {error}", path.display())),
    };
    if metadata.len() > MAX_FILE_BYTES {
        let backup = invalid_backup_path(path);
        fs::rename(path, &backup).map_err(|e| {
            format!(
                "sauvegarde métriques surdimensionnées {} -> {}: {e}",
                path.display(),
                backup.display()
            )
        })?;
        return Ok(BootMetricsFileV1::empty());
    }
    let raw = fs::read(path).map_err(|e| format!("lecture {}: {e}", path.display()))?;
    match serde_json::from_slice::<BootMetricsFileV1>(&raw) {
        Ok(file) if file.schema_version == METRICS_SCHEMA_VERSION => Ok(file),
        Ok(_) | Err(_) => {
            let backup = invalid_backup_path(path);
            fs::rename(path, &backup).map_err(|e| {
                format!(
                    "sauvegarde métriques invalides {} -> {}: {e}",
                    path.display(),
                    backup.display()
                )
            })?;
            Ok(BootMetricsFileV1::empty())
        }
    }
}

fn write_metrics_file_atomic(path: &Path, file: &BootMetricsFileV1) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("chemin métriques invalide: {}", path.display()))?;
    fs::create_dir_all(parent).map_err(|e| format!("création {}: {e}", parent.display()))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temp = parent.join(format!(".boot-metrics.{}-{stamp}.tmp", std::process::id()));
    let bytes = serde_json::to_vec_pretty(file).map_err(|e| format!("encode métriques: {e}"))?;
    let mut handle = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)
        .map_err(|e| format!("création temporaire {}: {e}", temp.display()))?;
    handle
        .write_all(&bytes)
        .and_then(|_| handle.sync_all())
        .map_err(|e| format!("écriture temporaire {}: {e}", temp.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temp, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("permissions {}: {e}", temp.display()))?;
    }
    fs::rename(&temp, path)
        .map_err(|e| format!("remplacement atomique {}: {e}", path.display()))?;
    Ok(())
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn record_boot_metrics_at(path: &Path, payload: BootMetricsV1) -> Result<(), String> {
    record_boot_metrics_at_time(path, payload, unix_time_ms())
}

fn record_boot_metrics_at_time(
    path: &Path,
    mut payload: BootMetricsV1,
    recorded_at_unix_ms: u64,
) -> Result<(), String> {
    validate_payload(&payload)?;
    let _guard = METRICS_WRITE_LOCK
        .lock()
        .map_err(|_| "verrou boot metrics empoisonné".to_string())?;
    let mut file = load_metrics_file(path)?;
    // Une marque de boot est persistée plusieurs fois pendant la convergence.
    // Conserver la date du premier write empêche un run lent de changer de
    // journée et ignore toute date éventuellement injectée par le frontend.
    let first_recorded_at = file
        .runs
        .iter()
        .find(|run| run.boot_id == payload.boot_id)
        .and_then(|run| run.recorded_at_unix_ms)
        .unwrap_or(recorded_at_unix_ms);
    payload.recorded_at_unix_ms = Some(first_recorded_at);
    file.runs.retain(|run| run.boot_id != payload.boot_id);
    file.runs.push(payload);
    if file.runs.len() > MAX_RUNS {
        let remove = file.runs.len() - MAX_RUNS;
        file.runs.drain(0..remove);
    }
    write_metrics_file_atomic(path, &file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn payload(id: &str, elapsed: f64) -> BootMetricsV1 {
        BootMetricsV1 {
            schema_version: 1,
            app_version: "1.3.1".into(),
            boot_id: id.into(),
            recorded_at_unix_ms: None,
            native_process_elapsed_at_frontend_eval_ms: elapsed,
            marks_ms: BTreeMap::from([
                ("frontendEvaluated".into(), elapsed),
                ("reactCommitted".into(), elapsed + 4.0),
            ]),
            flags: BootMetricFlags {
                ui_state_source: UiStateSource::LegacyHttp,
                sidecar_path: SidecarPath::Spawn,
                gateway_deferred: false,
            },
        }
    }

    #[test]
    fn rejects_unknown_schema_and_mark() {
        let mut bad_schema = payload("bad-schema", 4.0);
        bad_schema.schema_version = 2;
        assert!(validate_payload(&bad_schema)
            .unwrap_err()
            .contains("schéma"));

        let mut bad_mark = payload("bad-mark", 4.0);
        bad_mark.marks_ms.insert("prompt".into(), 8.0);
        assert!(validate_payload(&bad_mark)
            .unwrap_err()
            .contains("inconnue"));
    }

    #[test]
    fn upserts_and_caps_runs_at_one_hundred() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("boot-metrics.json");
        for index in 0..105 {
            record_boot_metrics_at(&path, payload(&format!("boot-{index}"), index as f64)).unwrap();
        }
        record_boot_metrics_at(&path, payload("boot-104", 999.0)).unwrap();
        let file: BootMetricsFileV1 = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(file.runs.len(), 100);
        assert_eq!(file.runs.first().unwrap().boot_id, "boot-5");
        assert_eq!(file.runs.last().unwrap().boot_id, "boot-104");
        assert_eq!(
            file.runs
                .last()
                .unwrap()
                .native_process_elapsed_at_frontend_eval_ms,
            999.0
        );
        assert!(file
            .runs
            .iter()
            .all(|run| run.recorded_at_unix_ms.is_some()));
    }

    #[test]
    fn native_timestamp_is_added_once_and_preserved_on_upsert() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("boot-metrics.json");
        let mut spoofed = payload("dated", 4.0);
        spoofed.recorded_at_unix_ms = Some(1);
        record_boot_metrics_at_time(&path, spoofed, 1_000).unwrap();
        record_boot_metrics_at_time(&path, payload("dated", 9.0), 2_000).unwrap();

        let file: BootMetricsFileV1 = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(file.runs.len(), 1);
        assert_eq!(file.runs[0].recorded_at_unix_ms, Some(1_000));
        assert_eq!(file.runs[0].native_process_elapsed_at_frontend_eval_ms, 9.0);
    }

    #[test]
    fn invalid_file_is_preserved_before_recreation() {
        let temp = tempdir().unwrap();
        let path = temp.path().join("boot-metrics.json");
        fs::write(&path, b"not-json").unwrap();
        record_boot_metrics_at(&path, payload("fresh", 3.0)).unwrap();
        let backups = fs::read_dir(temp.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("boot-metrics.invalid-")
            })
            .count();
        assert_eq!(backups, 1);
        let file: BootMetricsFileV1 = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(file.runs.len(), 1);
    }
}
