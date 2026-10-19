//! Journaux durables et tournants des serveurs d'Atelier, et panic hook qui
//! y écrit.
//!
//! Problème 13 de l'audit du 2026-10-18. Le stderr d'`atelier-studio-server`
//! était un pipe lu par `tauri-app`. Le fil lecteur mourait si sa troncature
//! à 12 000 octets coupait un caractère accentué, et le pipe était mort à
//! coup sûr quand une nouvelle instance de l'app réutilisait (lock-reuse) un
//! serveur lancé par la précédente, après un ⌘Q. Chaque `eprintln!` ou log
//! `tracing` paniquait ensuite sur EPIPE, et rien n'était conservé.
//!
//! Le contrat, désormais :
//! - le parent ouvre le journal avec [`ChildLog::open`] et le donne comme
//!   stderr à l'enfant : un FICHIER, jamais un pipe, avec son chemin dans
//!   [`LOG_FILE_ENV`]. Un serveur réutilisé par une autre instance de l'app
//!   écrit donc toujours dans un fichier vivant ;
//! - l'enfant appelle [`ServerLog::from_env`] : si son stderr est bien ce
//!   fichier (la variable seule, héritée par les petits-enfants, ne suffit
//!   pas), il le reprend pour
//!   son fd 2 (et son fd 1 après sa ligne de démarrage), le fait tourner au
//!   delà de [`Rotation::max_bytes`] en gardant [`Rotation::keep`] anciens
//!   fichiers, et installe un panic hook qui y écrit la pile ;
//! - sur macOS, les journaux vivent dans `~/Library/Logs/Atelier/`.
//!
//! Écrire un journal ne doit jamais casser un serveur : les écritures sont
//! best-effort et rien dans ce crate ne panique.

use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Chemin du journal que le parent a ouvert pour l'enfant.
pub const LOG_FILE_ENV: &str = "ATELIER_LOG_FILE";
/// Remplace le dossier des journaux (tests, diagnostic).
pub const LOG_DIR_ENV: &str = "ATELIER_LOG_DIR";
/// Période du fil qui fait tourner le journal quand seuls des `eprintln!`
/// (qui contournent [`RotatingLog::append`]) l'ont fait grossir.
pub const WATCHDOG_EVERY: Duration = Duration::from_secs(30);

/// Taille bornée d'un journal : un fichier courant d'au plus `max_bytes`
/// octets (à un enregistrement près) et `keep` anciens fichiers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rotation {
    pub max_bytes: u64,
    pub keep: usize,
}

impl Rotation {
    /// 5 Mio par fichier et 3 anciens : au plus 20 Mio par journal.
    pub const DEFAULT: Rotation = Rotation {
        max_bytes: 5 * 1024 * 1024,
        keep: 3,
    };
}

impl Default for Rotation {
    fn default() -> Self {
        Self::DEFAULT
    }
}

fn non_empty(value: Option<OsString>) -> Option<OsString> {
    value.filter(|value| !value.is_empty())
}

/// Chemin du journal transmis par le parent (`ATELIER_LOG_FILE`), s'il est
/// défini et non vide. Ne lance rien et ne modifie pas l'environnement.
pub fn log_file_from_env() -> Option<PathBuf> {
    non_empty(std::env::var_os(LOG_FILE_ENV)).map(PathBuf::from)
}

/// Dossier des journaux : `ATELIER_LOG_DIR` s'il est défini, sinon
/// `~/Library/Logs/Atelier` sur macOS, `$XDG_STATE_HOME/atelier/logs` ou
/// `~/.local/state/atelier/logs` ailleurs.
pub fn log_dir() -> Option<PathBuf> {
    log_dir_from(
        std::env::var_os(LOG_DIR_ENV),
        std::env::var_os("HOME"),
        std::env::var_os("XDG_STATE_HOME"),
        cfg!(target_os = "macos"),
    )
}

/// Version pure de [`log_dir`], pour les tests.
pub fn log_dir_from(
    explicit: Option<OsString>,
    home: Option<OsString>,
    xdg_state: Option<OsString>,
    macos: bool,
) -> Option<PathBuf> {
    if let Some(dir) = non_empty(explicit) {
        return Some(PathBuf::from(dir));
    }
    if !macos {
        if let Some(state) = non_empty(xdg_state)
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
        {
            return Some(state.join("atelier").join("logs"));
        }
    }
    let home = non_empty(home)
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())?;
    Some(if macos {
        home.join("Library").join("Logs").join("Atelier")
    } else {
        home.join(".local")
            .join("state")
            .join("atelier")
            .join("logs")
    })
}

/// Un nom de journal est un seul composant de chemin : lettres ASCII,
/// chiffres, `-` et `_`.
pub fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// `<dossier des journaux>/<name>.log`, ou `None` si le nom est invalide ou
/// le dossier introuvable.
pub fn log_path(name: &str) -> Option<PathBuf> {
    if !is_valid_name(name) {
        return None;
    }
    log_dir().map(|dir| dir.join(format!("{name}.log")))
}

/// `studio-server.log` → `studio-server.<index>.log` (l'extension reste
/// `.log` pour Console.app et les éditeurs).
pub fn rotated_path(path: &Path, index: usize) -> PathBuf {
    match (path.file_stem(), path.extension()) {
        (Some(stem), Some(ext)) => {
            let mut name = stem.to_os_string();
            name.push(format!(".{index}."));
            name.push(ext);
            path.with_file_name(name)
        }
        _ => {
            let mut name = path
                .file_name()
                .map(|name| name.to_os_string())
                .unwrap_or_default();
            name.push(format!(".{index}"));
            path.with_file_name(name)
        }
    }
}

fn ignore_missing(result: io::Result<()>) -> io::Result<()> {
    match result {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

/// Décale les fichiers : le plus ancien (`.<keep>`) est supprimé, chaque
/// `.<i>` devient `.<i+1>` et le fichier courant devient `.1`. Un fichier
/// absent de la chaîne n'est pas une erreur.
pub fn rotate(path: &Path, keep: usize) -> io::Result<()> {
    if keep == 0 {
        return ignore_missing(std::fs::remove_file(path));
    }
    ignore_missing(std::fs::remove_file(rotated_path(path, keep)))?;
    for index in (1..keep).rev() {
        ignore_missing(std::fs::rename(
            rotated_path(path, index),
            rotated_path(path, index + 1),
        ))?;
    }
    ignore_missing(std::fs::rename(path, rotated_path(path, 1)))
}

/// Fait tourner `path` s'il a atteint `rotation.max_bytes`. Vrai si une
/// rotation a eu lieu.
pub fn rotate_if_needed(path: &Path, rotation: Rotation) -> io::Result<bool> {
    match std::fs::metadata(path) {
        Ok(meta) if meta.len() > 0 && meta.len() >= rotation.max_bytes => {
            rotate(path, rotation.keep).map(|()| true)
        }
        Ok(_) => Ok(false),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

/// Ouvre `path` en ajout (créé en 0600 avec ses dossiers parents). Un
/// fichier préexistant est remis en 0600 : un journal peut citer des chemins
/// et des titres de fils.
pub fn open_append(path: &Path) -> io::Result<File> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(std::fs::Permissions::from_mode(0o600));
    }
    Ok(file)
}

/// Plus grand indice `<= max` qui tombe sur une frontière de caractère.
pub fn floor_char_boundary(text: &str, max: usize) -> usize {
    if max >= text.len() {
        return text.len();
    }
    let mut index = max;
    while !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

/// `String::truncate` qui ne panique jamais : coupe sur la frontière de
/// caractère qui précède `max_bytes`.
pub fn truncate_on_char_boundary(text: &mut String, max_bytes: usize) {
    let end = floor_char_boundary(text, max_bytes);
    text.truncate(end);
}

/// Les `max_bytes` derniers octets de `bytes`, en texte. Le début saute les
/// octets de continuation d'un caractère coupé, au lieu de produire un
/// U+FFFD.
pub fn tail_utf8(bytes: &[u8], max_bytes: usize) -> String {
    let mut start = bytes.len().saturating_sub(max_bytes);
    let mut skipped = 0;
    // Un caractère UTF-8 a au plus trois octets de continuation.
    while start < bytes.len() && skipped < 3 && (bytes[start] & 0xC0) == 0x80 {
        start += 1;
        skipped += 1;
    }
    String::from_utf8_lossy(&bytes[start..]).into_owned()
}

/// Ce qui a été écrit dans `path` depuis l'octet `offset`, borné aux
/// `max_bytes` derniers octets (précédés de « … » s'il a fallu couper). Si le
/// fichier a tourné ou rétréci depuis, lit le fichier courant entier.
pub fn read_since(path: &Path, offset: u64, max_bytes: usize) -> String {
    let Ok(mut file) = File::open(path) else {
        return String::new();
    };
    let len = file.metadata().map(|meta| meta.len()).unwrap_or(0);
    let from = if offset > len { 0 } else { offset };
    let limit = max_bytes as u64;
    let start = from.max(len.saturating_sub(limit));
    if file.seek(SeekFrom::Start(start)).is_err() {
        return String::new();
    }
    let mut bytes = Vec::new();
    let _ = file.take(limit).read_to_end(&mut bytes);
    let text = tail_utf8(&bytes, max_bytes);
    let text = text.trim();
    if start > from && !text.is_empty() {
        format!("… {text}")
    } else {
        text.to_string()
    }
}

/// Horodatage UTC `AAAA-MM-JJTHH:MM:SSZ`, sans dépendance.
pub fn utc_timestamp(at: SystemTime) -> String {
    let secs = at
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0);
    let (year, month, day) = civil_from_days((secs / 86_400) as i64);
    let rem = secs % 86_400;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3_600,
        (rem % 3_600) / 60,
        rem % 60
    )
}

/// Jours depuis 1970-01-01 → date civile (algorithme de H. Hinnant).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe as i64 + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// Côté parent : le journal d'un enfant, ouvert avant le spawn.
pub struct ChildLog {
    path: PathBuf,
    file: File,
    start: u64,
}

impl ChildLog {
    /// Ouvre `<dossier des journaux>/<name>.log` (rotation faite d'abord si
    /// le fichier est plein).
    pub fn open(name: &str) -> io::Result<Self> {
        let path = log_path(name).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("journal « {name} » : nom invalide ou dossier des journaux introuvable"),
            )
        })?;
        Self::open_at(path, Rotation::DEFAULT)
    }

    pub fn open_at(path: impl Into<PathBuf>, rotation: Rotation) -> io::Result<Self> {
        let path = path.into();
        let _ = rotate_if_needed(&path, rotation);
        let file = open_append(&path)?;
        let start = file.metadata().map(|meta| meta.len()).unwrap_or(0);
        Ok(Self { path, file, start })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Écrit une ligne repère horodatée (début de session). La sortie de
    /// l'enfant renvoyée par [`ChildLog::output_since_open`] commence après.
    pub fn mark(&mut self, text: &str) {
        let line = format!("{} ==== {text} ====\n", utc_timestamp(SystemTime::now()));
        let _ = self.file.write_all(line.as_bytes());
        self.start = self
            .file
            .metadata()
            .map(|meta| meta.len())
            .unwrap_or(self.start);
    }

    /// Branche ce fichier sur le stderr de `cmd` et transmet son chemin dans
    /// [`LOG_FILE_ENV`]. Si le descripteur ne peut pas être dupliqué, stderr
    /// part vers /dev/null (jamais vers un pipe) et la fonction rend faux.
    pub fn attach(&self, cmd: &mut Command) -> bool {
        match self.file.try_clone() {
            Ok(file) => {
                cmd.env(LOG_FILE_ENV, &self.path).stderr(Stdio::from(file));
                true
            }
            Err(_) => {
                cmd.stderr(Stdio::null());
                false
            }
        }
    }

    /// Branche aussi le stdout de `cmd` sur ce fichier.
    pub fn attach_stdout(&self, cmd: &mut Command) -> bool {
        match self.file.try_clone() {
            Ok(file) => {
                cmd.stdout(Stdio::from(file));
                true
            }
            Err(_) => {
                cmd.stdout(Stdio::null());
                false
            }
        }
    }

    /// Ce que l'enfant a écrit depuis l'ouverture (ou le dernier repère),
    /// borné à `max_bytes` et coupé sur une frontière de caractère.
    pub fn output_since_open(&self, max_bytes: usize) -> String {
        read_since(&self.path, self.start, max_bytes)
    }
}

struct LogState {
    file: File,
    /// Descripteurs du processus (2, 1) qui pointent sur le fichier courant
    /// et doivent le suivre à chaque rotation.
    adopted: Vec<i32>,
}

/// Côté serveur : journal à taille bornée, partagé entre fils.
pub struct RotatingLog {
    path: PathBuf,
    rotation: Rotation,
    state: Mutex<LogState>,
    stderr_adopted: AtomicBool,
}

impl RotatingLog {
    pub fn open(path: impl Into<PathBuf>, rotation: Rotation) -> io::Result<Self> {
        let path = path.into();
        let _ = rotate_if_needed(&path, rotation);
        let file = open_append(&path)?;
        Ok(Self {
            path,
            rotation,
            state: Mutex::new(LogState {
                file,
                adopted: Vec::new(),
            }),
            stderr_adopted: AtomicBool::new(false),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn state(&self) -> MutexGuard<'_, LogState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Ajoute un enregistrement, après une rotation si le fichier courant
    /// dépasserait sa taille bornée.
    pub fn append(&self, bytes: &[u8]) -> io::Result<()> {
        if bytes.is_empty() {
            return Ok(());
        }
        let mut state = self.state();
        let len = state.file.metadata().map(|meta| meta.len()).unwrap_or(0);
        if len > 0 && len.saturating_add(bytes.len() as u64) > self.rotation.max_bytes {
            let _ = self.rotate_locked(&mut state);
        }
        state.file.write_all(bytes)
    }

    /// Écrit une ligne horodatée.
    pub fn line(&self, text: &str) {
        let line = format!("{} {text}\n", utc_timestamp(SystemTime::now()));
        let _ = self.append(line.as_bytes());
    }

    /// Écrit sans prendre le verrou, par un descripteur neuf : sert au panic
    /// hook, qui peut se déclencher dans un fil qui tient déjà ce verrou.
    pub fn append_unlocked(&self, bytes: &[u8]) -> io::Result<()> {
        open_append(&self.path)?.write_all(bytes)
    }

    /// Tâche de fond : rotation si des écritures directes sur les
    /// descripteurs adoptés ont rempli le fichier, réouverture si le
    /// fichier a été supprimé ou remplacé. Vrai si le fichier a changé.
    pub fn maintain(&self) -> io::Result<bool> {
        let mut state = self.state();
        let len = state.file.metadata()?.len();
        if len > 0 && len >= self.rotation.max_bytes {
            self.rotate_locked(&mut state)?;
            return Ok(true);
        }
        if !same_file(&state.file, &self.path) {
            self.reopen_locked(&mut state)?;
            return Ok(true);
        }
        Ok(false)
    }

    fn rotate_locked(&self, state: &mut LogState) -> io::Result<()> {
        rotate(&self.path, self.rotation.keep)?;
        self.reopen_locked(state)
    }

    fn reopen_locked(&self, state: &mut LogState) -> io::Result<()> {
        let file = open_append(&self.path)?;
        #[cfg(unix)]
        for fd in &state.adopted {
            let _ = dup_onto(&file, *fd);
        }
        state.file = file;
        Ok(())
    }

    /// Fait pointer le descripteur `fd` du processus (2 = stderr, 1 =
    /// stdout) sur ce journal, et le garde à jour aux rotations suivantes.
    #[cfg(unix)]
    pub fn adopt_fd(&self, fd: i32) -> io::Result<()> {
        let mut state = self.state();
        dup_onto(&state.file, fd)?;
        if !state.adopted.contains(&fd) {
            state.adopted.push(fd);
        }
        if fd == 2 {
            self.stderr_adopted.store(true, Ordering::SeqCst);
        }
        Ok(())
    }

    /// Vrai si le stderr du processus est ce journal.
    pub fn stderr_adopted(&self) -> bool {
        self.stderr_adopted.load(Ordering::SeqCst)
    }
}

#[cfg(unix)]
fn dup_onto(file: &File, fd: i32) -> io::Result<()> {
    use std::os::unix::io::AsRawFd;
    // SAFETY: dup2 remplace l'entrée `fd` de la table des descripteurs par
    // une copie de celui de `file`, qui reste ouvert pendant l'appel. Aucune
    // mémoire n'est partagée avec Rust.
    if unsafe { libc::dup2(file.as_raw_fd(), fd) } < 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

/// Vrai si le descripteur 2 du processus est le fichier `path` (même
/// périphérique et même inode). Faux si `path` n'existe pas, si fd 2 est un
/// pipe, un terminal, /dev/null ou un autre fichier.
pub fn stderr_is(path: &Path) -> bool {
    fd_is(2, path)
}

#[cfg(unix)]
fn fd_is(fd: i32, path: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Ok(on_disk) = std::fs::metadata(path) else {
        return false;
    };
    // SAFETY: fstat remplit la structure `stat` fournie, de taille correcte,
    // à partir d'un descripteur entier ; un descripteur fermé rend -1.
    let mut st: libc::stat = unsafe { std::mem::zeroed() };
    if unsafe { libc::fstat(fd, &mut st) } != 0 {
        return false;
    }
    st.st_dev as u64 == on_disk.dev() && st.st_ino as u64 == on_disk.ino()
}

#[cfg(not(unix))]
fn fd_is(_fd: i32, _path: &Path) -> bool {
    false
}

fn same_file(file: &File, path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        match (file.metadata(), std::fs::metadata(path)) {
            (Ok(open), Ok(on_disk)) => open.dev() == on_disk.dev() && open.ino() == on_disk.ino(),
            _ => false,
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (file, path);
        true
    }
}

/// `io::Write` vers un [`RotatingLog`], pour `tracing_subscriber` (toute
/// fermeture `Fn() -> W` où `W: io::Write` est un `MakeWriter`). N'échoue
/// jamais : un journal plein ou illisible ne doit pas casser le serveur, ni
/// faire écrire à tracing une erreur interne sur stderr.
#[derive(Clone)]
pub struct LogWriter {
    log: Arc<RotatingLog>,
}

impl Write for LogWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let _ = self.log.append(buf);
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

/// Journal d'un binaire serveur.
#[derive(Clone)]
pub struct ServerLog {
    log: Arc<RotatingLog>,
}

impl ServerLog {
    /// Journal demandé par le parent ([`LOG_FILE_ENV`]) : stderr adopté et
    /// fil de maintenance lancé. `None` sans la variable (tests, `cargo
    /// run`) : le serveur garde alors son stderr tel quel.
    ///
    /// La variable seule ne suffit pas : les CLI d'agent lancés par le
    /// serveur de chat en héritent, et avec eux tout ce qu'ils lancent (un
    /// `atelier-gallery-server` de test, par exemple). Le journal n'est
    /// adopté que si le stderr actuel (fd 2) EST ce fichier, preuve que le
    /// parent l'y a branché ([`ChildLog::attach`]) ; sinon la variable est
    /// ignorée et rien n'est écrit dans le journal d'un autre processus.
    pub fn from_env() -> Option<Self> {
        Self::adopt_path(log_file_from_env()?)
    }

    /// Comme [`ServerLog::from_env`], pour un chemin déjà lu (et la variable
    /// déjà retirée de l'environnement par l'appelant, avant que le fil de
    /// maintenance ne démarre : modifier l'environnement n'est sûr que dans
    /// un processus à un seul fil).
    pub fn adopt_path(path: PathBuf) -> Option<Self> {
        if !stderr_is(&path) {
            return None;
        }
        let log = Self::open(path, Rotation::DEFAULT).ok()?;
        let _ = log.adopt_stderr();
        log.spawn_watchdog(WATCHDOG_EVERY);
        Some(log)
    }

    pub fn open(path: impl Into<PathBuf>, rotation: Rotation) -> io::Result<Self> {
        Ok(Self {
            log: Arc::new(RotatingLog::open(path, rotation)?),
        })
    }

    pub fn path(&self) -> &Path {
        self.log.path()
    }

    pub fn rotating(&self) -> &RotatingLog {
        &self.log
    }

    pub fn line(&self, text: &str) {
        self.log.line(text);
    }

    pub fn writer(&self) -> LogWriter {
        LogWriter {
            log: Arc::clone(&self.log),
        }
    }

    /// Fabrique d'écrivains pour `tracing_subscriber::fmt().with_writer(…)`.
    pub fn make_writer(&self) -> impl Fn() -> LogWriter + Send + Sync + 'static {
        let log = Arc::clone(&self.log);
        move || LogWriter {
            log: Arc::clone(&log),
        }
    }

    /// stderr (fd 2) → ce journal : `eprintln!`, le hook par défaut et les
    /// enfants qui héritent de stderr y écrivent, plus jamais dans un pipe.
    pub fn adopt_stderr(&self) -> io::Result<()> {
        #[cfg(unix)]
        {
            self.log.adopt_fd(2)
        }
        #[cfg(not(unix))]
        {
            Err(io::Error::new(io::ErrorKind::Unsupported, "unix seulement"))
        }
    }

    /// stdout (fd 1) → ce journal. À appeler APRÈS la ligne de démarrage
    /// que le parent lit sur stdout : le pipe de stdout meurt avec lui.
    pub fn adopt_stdout(&self) -> io::Result<()> {
        let _ = io::stdout().flush();
        #[cfg(unix)]
        {
            self.log.adopt_fd(1)
        }
        #[cfg(not(unix))]
        {
            Err(io::Error::new(io::ErrorKind::Unsupported, "unix seulement"))
        }
    }

    /// Lance le fil de maintenance ([`RotatingLog::maintain`]).
    pub fn spawn_watchdog(&self, every: Duration) {
        let log = Arc::clone(&self.log);
        let _ = std::thread::Builder::new()
            .name("atelier-logs".into())
            .spawn(move || loop {
                std::thread::sleep(every);
                let _ = log.maintain();
            });
    }

    /// Panic hook : écrit lieu, message et pile dans le journal, puis passe
    /// la main au hook précédent sauf si stderr est déjà ce journal (il y
    /// écrirait la même chose une deuxième fois).
    pub fn install_panic_hook(&self, program: &str) {
        let log = Arc::clone(&self.log);
        let program = program.to_string();
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let thread = std::thread::current();
            let record = PanicRecord {
                at: SystemTime::now(),
                program: program.clone(),
                pid: std::process::id(),
                thread: thread.name().unwrap_or("sans nom").to_string(),
                location: info
                    .location()
                    .map(|loc| format!("{}:{}:{}", loc.file(), loc.line(), loc.column())),
                message: panic_message(info.payload()),
                backtrace: std::backtrace::Backtrace::force_capture().to_string(),
            };
            let written = log
                .append_unlocked(format_panic(&record).as_bytes())
                .is_ok();
            if !written || !log.stderr_adopted() {
                previous(info);
            }
        }));
    }
}

/// Message d'une panique (`panic!("…")` donne un `&str` ou un `String`).
pub fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(text) = payload.downcast_ref::<&str>() {
        (*text).to_string()
    } else if let Some(text) = payload.downcast_ref::<String>() {
        text.clone()
    } else {
        "(message non textuel)".into()
    }
}

/// Ce que le panic hook écrit.
pub struct PanicRecord {
    pub at: SystemTime,
    pub program: String,
    pub pid: u32,
    pub thread: String,
    pub location: Option<String>,
    pub message: String,
    pub backtrace: String,
}

pub fn format_panic(record: &PanicRecord) -> String {
    format!(
        "{at} ==== PANIQUE dans {program} (pid {pid}, fil « {thread} ») ====\n\
         lieu : {location}\n\
         message : {message}\n\
         pile :\n{backtrace}\n\
         ==== fin de la panique ====\n",
        at = utc_timestamp(record.at),
        program = record.program,
        pid = record.pid,
        thread = record.thread,
        location = record.location.as_deref().unwrap_or("inconnu"),
        message = record.message,
        backtrace = record.backtrace.trim_end(),
    )
}

#[cfg(test)]
mod tests;
