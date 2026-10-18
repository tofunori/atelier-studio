//! Un processus noyau : lancement, protocole ligne à ligne, cellules.

use crate::envs::PyEnv;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, watch};

/// Sortie gardée par cellule, flux par flux. Le pilote borne déjà ce que
/// Python écrit ; ce plafond couvre ce qu'une bibliothèque C écrit à côté.
const STREAM_KEEP: usize = 256 * 1024;
const READY_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelInfo {
    pub pid: u32,
    pub python_version: String,
    pub executable: String,
    pub env: PyEnv,
    pub cwd: PathBuf,
    #[serde(skip)]
    pub started: Instant,
    pub started_at: String,
}

#[derive(Debug, Clone, Default)]
pub struct CellProgress {
    pub stdout: String,
    pub stderr: String,
    pub result: Option<String>,
    pub error: Option<Value>,
    pub files_read: Vec<String>,
    pub files_written: Vec<String>,
    /// PNG des figures matplotlib laissées ouvertes par la cellule.
    pub figures: Vec<String>,
    pub duration_ms: Option<u64>,
    pub truncated: u64,
    pub finished: bool,
}

pub struct Cell {
    pub id: u64,
    pub code: String,
    pub started: Instant,
    pub started_at: String,
    progress: Mutex<CellProgress>,
    done: watch::Sender<bool>,
}

impl Cell {
    fn new(id: u64, code: String) -> Arc<Self> {
        Arc::new(Self {
            id,
            code,
            started: Instant::now(),
            started_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            progress: Mutex::new(CellProgress::default()),
            done: watch::channel(false).0,
        })
    }

    pub fn snapshot(&self) -> CellProgress {
        self.progress
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Attend la fin de la cellule, au plus `delai`. Rend vrai si elle est finie.
    pub async fn wait(&self, delai: Duration) -> bool {
        let mut rx = self.done.subscribe();
        if *rx.borrow() {
            return true;
        }
        tokio::time::timeout(delai, rx.wait_for(|fini| *fini))
            .await
            .map(|r| r.is_ok())
            .unwrap_or(false)
    }

    fn append(&self, name: &str, text: &str) {
        let mut p = self.progress.lock().unwrap_or_else(|e| e.into_inner());
        let target = if name == "stderr" {
            &mut p.stderr
        } else {
            &mut p.stdout
        };
        let room = STREAM_KEEP.saturating_sub(target.len());
        if room == 0 {
            p.truncated += text.len() as u64;
            return;
        }
        if text.len() <= room {
            target.push_str(text);
        } else {
            let mut cut = room;
            while !text.is_char_boundary(cut) {
                cut -= 1;
            }
            target.push_str(&text[..cut]);
            p.truncated += (text.len() - cut) as u64;
        }
    }

    fn finish(&self, f: impl FnOnce(&mut CellProgress)) {
        {
            let mut p = self.progress.lock().unwrap_or_else(|e| e.into_inner());
            if p.finished {
                return;
            }
            f(&mut p);
            if p.duration_ms.is_none() {
                p.duration_ms = Some(self.started.elapsed().as_millis() as u64);
            }
            p.finished = true;
        }
        self.done.send_replace(true);
    }
}

#[derive(Default)]
struct Shared {
    running: Mutex<Option<Arc<Cell>>>,
    vars: Mutex<HashMap<u64, oneshot::Sender<Value>>>,
    /// Fin du processus, avec sa cause. `None` tant qu'il vit.
    exit: Mutex<Option<String>>,
    stderr_tail: Mutex<String>,
}

impl Shared {
    fn running(&self) -> Option<Arc<Cell>> {
        self.running
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
}

pub struct Kernel {
    pub info: KernelInfo,
    stdin: tokio::sync::Mutex<ChildStdin>,
    child: tokio::sync::Mutex<Child>,
    shared: Arc<Shared>,
    next_vars: std::sync::atomic::AtomicU64,
}

/// Variables d'environnement d'un env conda « activé » : ce que les scripts
/// d'activation posent et dont les paquets géo ont besoin (PROJ, GDAL).
fn activation_env(env: &PyEnv) -> Vec<(String, String)> {
    let mut vars = Vec::new();
    let bin = env.prefix.join("bin");
    let path = std::env::var("PATH").unwrap_or_default();
    vars.push(("PATH".into(), format!("{}:{path}", bin.display())));
    if env.prefix.join("conda-meta").is_dir() {
        vars.push(("CONDA_PREFIX".into(), env.prefix.display().to_string()));
        vars.push(("CONDA_DEFAULT_ENV".into(), env.name.clone()));
    } else if env.prefix.join("pyvenv.cfg").is_file() {
        vars.push(("VIRTUAL_ENV".into(), env.prefix.display().to_string()));
    }
    for (var, rel) in [
        ("PROJ_DATA", "share/proj"),
        ("PROJ_LIB", "share/proj"),
        ("GDAL_DATA", "share/gdal"),
    ] {
        let dir = env.prefix.join(rel);
        if dir.is_dir() {
            vars.push((var.into(), dir.display().to_string()));
        }
    }
    vars
}

impl Kernel {
    pub async fn start(env: &PyEnv, cwd: &Path, driver_dir: &Path) -> Result<Kernel, String> {
        let mut cmd = Command::new(&env.python);
        cmd.arg("-u")
            .arg("-c")
            .arg(
                "import os as _o, sys as _s; _s.path.insert(0, _o.environ.pop('ATELIER_NOYAU_DIR')); \
import atelier_noyau as _m; _m.main()",
            )
            .current_dir(cwd)
            .env("ATELIER_NOYAU_DIR", driver_dir)
            .env("ATELIER_NOYAU", "1")
            .env("MPLBACKEND", "Agg")
            .env("PYTHONUNBUFFERED", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .env_remove("PYTHONHOME")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        for (k, v) in activation_env(env) {
            cmd.env(k, v);
        }
        // Groupe à part : l'arrêt tue aussi les processus que le code lance
        // (multiprocessing, sous-commandes), et Ctrl-C du terminal d'Atelier
        // ne l'atteint pas.
        #[cfg(unix)]
        cmd.process_group(0);
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("lancement de {} impossible : {e}", env.python.display()))?;
        let pid = child.id().unwrap_or(0);
        let stdin = child.stdin.take().ok_or("stdin du noyau absent")?;
        let stdout = child.stdout.take().ok_or("stdout du noyau absent")?;
        let stderr = child.stderr.take().ok_or("stderr du noyau absent")?;
        let shared = Arc::new(Shared::default());
        let (ready_tx, ready_rx) = oneshot::channel::<Value>();

        // stderr : rattaché à la cellule en cours, sinon gardé pour expliquer
        // un échec de démarrage.
        let s = shared.clone();
        tokio::spawn(async move {
            let mut stderr = stderr;
            let mut buf = vec![0u8; 8192];
            loop {
                let n = match stderr.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                let text = String::from_utf8_lossy(&buf[..n]).to_string();
                if let Some(cell) = s.running() {
                    cell.append("stderr", &text);
                } else {
                    let mut tail = s.stderr_tail.lock().unwrap_or_else(|e| e.into_inner());
                    tail.push_str(&text);
                    if tail.len() > 8192 {
                        let mut cut = tail.len() - 8192;
                        while !tail.is_char_boundary(cut) {
                            cut += 1;
                        }
                        tail.drain(..cut);
                    }
                }
            }
        });

        let s = shared.clone();
        tokio::spawn(async move {
            let mut ready = Some(ready_tx);
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(msg) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                match msg["t"].as_str().unwrap_or("") {
                    "ready" => {
                        if let Some(tx) = ready.take() {
                            let _ = tx.send(msg);
                        }
                    }
                    "stream" => {
                        if let Some(cell) = s.running() {
                            if msg["id"].as_u64() == Some(cell.id) {
                                cell.append(
                                    msg["name"].as_str().unwrap_or("stdout"),
                                    msg["text"].as_str().unwrap_or(""),
                                );
                            }
                        }
                    }
                    "done" => {
                        let cell = {
                            let mut running = s.running.lock().unwrap_or_else(|e| e.into_inner());
                            match running.as_ref() {
                                Some(c) if msg["id"].as_u64() == Some(c.id) => running.take(),
                                _ => None,
                            }
                        };
                        if let Some(cell) = cell {
                            cell.finish(|p| {
                                p.result = msg["result"].as_str().map(str::to_string);
                                p.error = msg.get("error").filter(|e| !e.is_null()).cloned();
                                p.truncated += msg["truncated"].as_u64().unwrap_or(0);
                                p.duration_ms = msg["duration_ms"].as_u64();
                                p.files_read = strings(&msg["files"]["read"]);
                                p.files_written = strings(&msg["files"]["written"]);
                                p.figures = strings(&msg["figures"]);
                            });
                        }
                    }
                    "vars" => {
                        let waiter = msg["id"].as_u64().and_then(|id| {
                            s.vars.lock().unwrap_or_else(|e| e.into_inner()).remove(&id)
                        });
                        if let Some(tx) = waiter {
                            let _ = tx.send(msg["vars"].clone());
                        }
                    }
                    _ => {}
                }
            }
            // Fin de flux = processus mort (ou arrêté). Une cellule en cours
            // ne doit pas attendre pour toujours.
            let cause = "le noyau s'est arrêté".to_string();
            *s.exit.lock().unwrap_or_else(|e| e.into_inner()) = Some(cause.clone());
            let cell = s.running.lock().unwrap_or_else(|e| e.into_inner()).take();
            if let Some(cell) = cell {
                // Laisse au lecteur de stderr le temps de rattacher la fin
                // de la trace (MemoryError, segfault) à la cellule.
                tokio::time::sleep(Duration::from_millis(100)).await;
                cell.finish(|p| {
                    p.error = Some(json!({
                        "ename": "NoyauArrete",
                        "evalue": format!("{cause} pendant la cellule (mémoire épuisée, plantage d'une bibliothèque C ou arrêt demandé). Les variables sont perdues ; la prochaine cellule relance un noyau neuf."),
                        "traceback": "",
                    }));
                });
            }
            s.vars.lock().unwrap_or_else(|e| e.into_inner()).clear();
        });

        let ready = match tokio::time::timeout(READY_TIMEOUT, ready_rx).await {
            Ok(Ok(msg)) => msg,
            _ => {
                let _ = child.start_kill();
                tokio::time::sleep(Duration::from_millis(50)).await;
                let tail = shared
                    .stderr_tail
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone();
                return Err(format!(
                    "le noyau n'a pas démarré avec {}{}",
                    env.python.display(),
                    if tail.trim().is_empty() {
                        String::new()
                    } else {
                        format!(" : {}", tail.trim())
                    }
                ));
            }
        };
        let version = ready["python"].as_str().unwrap_or("").to_string();
        if !version_ok(&version) {
            let _ = child.start_kill();
            return Err(format!(
                "Python {version} trop ancien : le noyau demande Python 3.8 ou plus"
            ));
        }
        Ok(Kernel {
            info: KernelInfo {
                pid,
                python_version: version,
                executable: ready["executable"].as_str().unwrap_or("").to_string(),
                env: env.clone(),
                cwd: cwd.to_path_buf(),
                started: Instant::now(),
                started_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            },
            stdin: tokio::sync::Mutex::new(stdin),
            child: tokio::sync::Mutex::new(child),
            shared,
            next_vars: std::sync::atomic::AtomicU64::new(1),
        })
    }

    pub fn is_alive(&self) -> bool {
        self.shared
            .exit
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_none()
    }

    pub fn running(&self) -> Option<Arc<Cell>> {
        self.shared.running()
    }

    async fn write(&self, msg: Value) -> Result<(), String> {
        let mut line = serde_json::to_vec(&msg).map_err(|e| e.to_string())?;
        line.push(b'\n');
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(&line)
            .await
            .map_err(|_| "le noyau ne répond plus".to_string())?;
        stdin
            .flush()
            .await
            .map_err(|_| "le noyau ne répond plus".to_string())
    }

    /// Lance une cellule. Refuse si une autre tourne : le noyau est séquentiel.
    /// `figures` : dossier où le pilote enregistre les figures de la cellule.
    pub async fn submit(
        &self,
        id: u64,
        code: &str,
        figures: Option<&Path>,
    ) -> Result<Arc<Cell>, String> {
        if !self.is_alive() {
            return Err("le noyau s'est arrêté".into());
        }
        let cell = Cell::new(id, code.to_string());
        {
            let mut running = self
                .shared
                .running
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if let Some(busy) = running.as_ref() {
                return Err(format!("busy:{}", busy.id));
            }
            *running = Some(cell.clone());
        }
        if let Err(e) = self
            .write(json!({"op": "exec", "id": id, "code": code, "figdir": figures}))
            .await
        {
            self.shared
                .running
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take();
            return Err(e);
        }
        Ok(cell)
    }

    pub async fn variables(&self, delai: Duration) -> Result<Value, String> {
        if let Some(busy) = self.running() {
            return Err(format!("busy:{}", busy.id));
        }
        let id = self
            .next_vars
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.shared
            .vars
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, tx);
        self.write(json!({"op": "vars", "id": id})).await?;
        match tokio::time::timeout(delai, rx).await {
            Ok(Ok(vars)) => Ok(vars),
            _ => {
                self.shared
                    .vars
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&id);
                Err("le noyau n'a pas listé ses variables à temps".into())
            }
        }
    }

    /// Ctrl-C dans la cellule en cours (KeyboardInterrupt côté Python).
    pub fn interrupt(&self) {
        #[cfg(unix)]
        if self.info.pid > 0 {
            // SAFETY: kill(2) sur le pid de notre propre enfant.
            unsafe {
                libc::kill(self.info.pid as libc::pid_t, libc::SIGINT);
            }
        }
    }

    /// Arrêt propre, puis forcé : le groupe entier part, enfants compris.
    pub async fn shutdown(&self) {
        let _ = self.write(json!({"op": "shutdown"})).await;
        let mut child = self.child.lock().await;
        if tokio::time::timeout(Duration::from_secs(2), child.wait())
            .await
            .is_err()
        {
            #[cfg(unix)]
            if self.info.pid > 0 {
                // SAFETY: le noyau est chef de son propre groupe (process_group(0)).
                unsafe {
                    libc::killpg(self.info.pid as libc::pid_t, libc::SIGKILL);
                }
            }
            let _ = child.start_kill();
            let _ = tokio::time::timeout(Duration::from_secs(2), child.wait()).await;
        }
        #[cfg(unix)]
        if self.info.pid > 0 {
            // Les enfants restés dans le groupe après la sortie du noyau.
            unsafe {
                libc::killpg(self.info.pid as libc::pid_t, libc::SIGKILL);
            }
        }
    }
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn version_ok(version: &str) -> bool {
    let mut parts = version.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
    let (major, minor) = (parts.next().unwrap_or(0), parts.next().unwrap_or(0));
    major > 3 || (major == 3 && minor >= 8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn la_version_minimale_est_python_3_8() {
        assert!(version_ok("3.8.0"));
        assert!(version_ok("3.13.1"));
        assert!(!version_ok("3.7.9"));
        assert!(!version_ok("2.7.18"));
        assert!(!version_ok(""));
    }

    #[test]
    fn une_sortie_trop_longue_est_coupee_sans_casser_un_caractere() {
        let cell = Cell::new(1, String::new());
        cell.append("stdout", &"é".repeat(STREAM_KEEP));
        let p = cell.snapshot();
        assert!(p.stdout.len() <= STREAM_KEEP);
        assert!(p.truncated > 0);
    }
}
