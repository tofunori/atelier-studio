//! Côté appelants : quel programme lancer pour lire un PDF, et avec quels
//! arguments. L'outil `atelier-pdf` d'abord ; `pdftotext`/`pdftohtml` de
//! poppler seulement s'il manque (le serveur des annotations compilé seul,
//! une installation partielle).

use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Output {
    /// Texte brut, pages séparées par `\f` (`pdftotext`).
    Text,
    /// Mots et leurs cadres (`pdftotext -bbox-layout -cropbox`).
    WordBoxes,
    /// Morceaux de lignes, polices et images (`pdftohtml -xml -zoom 1`).
    Reading,
}

impl Output {
    pub fn subcommand(self) -> &'static str {
        match self {
            Output::Text => "text",
            Output::WordBoxes => "bbox",
            Output::Reading => "xml",
        }
    }

    fn poppler_bin(self) -> &'static str {
        match self {
            Output::Text | Output::WordBoxes => "pdftotext",
            Output::Reading => "pdftohtml",
        }
    }

    /// Variable qui impose un programme au format de poppler (tests : faux
    /// outil lent, compteur d'appels).
    fn override_env(self) -> &'static str {
        match self {
            Output::Text | Output::WordBoxes => "ATELIER_PDFTOTEXT",
            Output::Reading => "ATELIER_PDFTOHTML",
        }
    }
}

/// Dossiers des serveurs d'Atelier installé.
pub fn installed_app_dirs() -> Vec<PathBuf> {
    let mut apps = vec![PathBuf::from("/Applications/Atelier.app")];
    if let Some(home) = std::env::var_os("HOME") {
        apps.push(PathBuf::from(home).join("Applications/Atelier.app"));
    }
    apps.into_iter()
        .map(|app| app.join("Contents/Resources/rust-server"))
        .collect()
}

const TOOL: &str = "atelier-pdf";

/// L'outil `atelier-pdf` : variable `ATELIER_PDF_TOOL`, à côté de
/// l'exécutable courant (le .app les pose ensemble, cargo aussi), un cran
/// au-dessus (exécutables de test dans `target/<profil>/deps/`), le profil
/// au-dessus de `build/` (nouvelle disposition de cargo), puis dans
/// Atelier installé.
pub fn locate_tool() -> Option<PathBuf> {
    if let Some(value) = std::env::var_os("ATELIER_PDF_TOOL").filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(value));
    }
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        let exe = exe.canonicalize().unwrap_or(exe);
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
            if let Some(parent) = dir.parent() {
                dirs.push(parent.to_path_buf());
            }
            // Nouvelle disposition de cargo (build-dir) : les exécutables de
            // test vivent dans `target/<profil>/build/<paquet>/<hash>/out/`.
            let build = dir.ancestors().take(5).find(|a| a.file_name() == Some("build".as_ref()));
            if let Some(profile) = build.and_then(Path::parent) {
                dirs.push(profile.to_path_buf());
            }
        }
    }
    dirs.extend(installed_app_dirs());
    dirs.into_iter()
        .map(|dir| dir.join(TOOL))
        .find(|path| path.is_file())
}

/// Qui rend les vignettes de PDF (première page, PNG).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Thumbnailer {
    /// `atelier-pdf thumb` : PDFium dans un processus sans interface.
    Tool(PathBuf),
    /// `qlmanage -t` de macOS, faute d'outil. macOS l'affiche dans le Dock
    /// (« Running in Background ») le temps de chaque rendu.
    QuickLook,
}

impl Thumbnailer {
    /// L'outil d'Atelier d'abord, Quick Look seulement sur macOS.
    pub fn locate() -> Option<Self> {
        locate_tool()
            .map(Self::Tool)
            .or_else(|| cfg!(target_os = "macos").then_some(Self::QuickLook))
    }

    /// Commande qui écrit `<dir>/<nom du pdf>.png`, son plus grand côté à
    /// `size` pixels (contrat de `qlmanage -t -s <size> -o <dir> <pdf>`).
    pub fn command(&self, pdf: &Path, dir: &Path, size: u16) -> Command {
        let mut cmd;
        match self {
            Self::Tool(path) => {
                cmd = Command::new(path);
                cmd.arg("thumb").arg(size.to_string()).arg(dir).arg(pdf);
            }
            Self::QuickLook => {
                cmd = Command::new("qlmanage");
                cmd.args(["-t", "-s", &size.to_string(), "-o"]).arg(dir).arg(pdf);
            }
        }
        cmd
    }
}

/// Commande `atelier-pdf corrige` : écrit la copie corrigée `out` de `src`
/// avec les commentaires de `comments` (JSON de `corrige::Request`). PDFium
/// tourne dans ce processus à part, comme pour les vignettes.
pub fn corrected_copy_command(src: &Path, out: &Path, comments: &Path) -> Option<Command> {
    let tool = locate_tool()?;
    let mut cmd = Command::new(tool);
    cmd.arg("corrige").arg(src).arg(out).arg(comments);
    Some(cmd)
}

/// Commande `atelier-pdf page` de l'outil `tool` (voir [`locate_tool`]) :
/// la page `page` (à partir de 1) de `pdf` en PNG de `width` pixels de
/// large, écrite dans `out`. PDFium tourne dans ce processus à part, comme
/// pour les vignettes.
pub fn page_command(tool: &Path, pdf: &Path, page: u32, width: u16, out: &Path) -> Command {
    let mut cmd = Command::new(tool);
    cmd.arg("page").arg(pdf).arg(page.to_string()).arg(width.to_string()).arg(out);
    cmd
}

/// Page 1 d'un PDF gardé en mémoire (page PDF collée dans une image de
/// Word, voir `atelier_docx::objects::pdf_in_emf`), en PNG de `width` px de
/// large : `atelier-pdf page` dans un dossier temporaire, effacé ensuite.
/// Au-delà de `timeout`, le rendu est arrêté.
pub fn memory_page_png(tool: &Path, pdf: &[u8], width: u16, timeout: std::time::Duration) -> Result<Vec<u8>, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("atelier-pdfpage-{}-{stamp}-{}", std::process::id(), SEQ.fetch_add(1, Ordering::Relaxed)));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let result = (|| {
        let (src, out) = (dir.join("page.pdf"), dir.join("page.png"));
        std::fs::write(&src, pdf).map_err(|e| e.to_string())?;
        let mut child = page_command(tool, &src, 1, width, &out)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("atelier-pdf : {e}"))?;
        let started = std::time::Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if started.elapsed() < timeout => std::thread::sleep(std::time::Duration::from_millis(20)),
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("rendu de la page arrêté après {} s", timeout.as_secs()));
                }
            }
        };
        if !status.success() {
            let mut problem = String::new();
            if let Some(mut e) = child.stderr.take() {
                let _ = std::io::Read::read_to_string(&mut e, &mut problem);
            }
            return Err(if problem.trim().is_empty() { "rendu de la page impossible".into() } else { problem.trim().to_string() });
        }
        std::fs::read(&out).map_err(|e| format!("rendu de la page : {e}"))
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

fn poppler_path(bin: &str) -> PathBuf {
    // Claude Desktop lance ses serveurs avec un PATH réduit : Homebrew n'y
    // est pas.
    ["/opt/homebrew/bin", "/usr/local/bin"]
        .into_iter()
        .map(|dir| Path::new(dir).join(bin))
        .find(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from(bin))
}

/// D'où vient le programme lancé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    /// `ATELIER_PDFTOTEXT` / `ATELIER_PDFTOHTML` : programme imposé, au
    /// format de poppler (tests).
    Forced,
    /// L'outil `atelier-pdf` d'Atelier.
    Tool,
    /// `pdftotext`/`pdftohtml` de poppler, faute d'outil.
    Poppler,
}

#[derive(Debug, Clone)]
pub struct Program {
    pub path: PathBuf,
    pub source: Source,
}

impl Program {
    /// Arguments de poppler plutôt que la sous-commande de l'outil.
    pub fn poppler_syntax(&self) -> bool {
        self.source != Source::Tool
    }
}

pub fn resolve(output: Output) -> Program {
    if let Some(value) = std::env::var_os(output.override_env()).filter(|v| !v.is_empty()) {
        return Program { path: PathBuf::from(value), source: Source::Forced };
    }
    if let Some(path) = locate_tool() {
        return Program { path, source: Source::Tool };
    }
    Program { path: poppler_path(output.poppler_bin()), source: Source::Poppler }
}

fn poppler_args(cmd: &mut Command, output: Output, pdf: &Path, layout: bool) {
    match output {
        Output::Text => {
            if layout {
                cmd.arg("-layout");
            }
            cmd.args(["-enc", "UTF-8"]).arg(pdf).arg("-");
        }
        Output::WordBoxes => {
            cmd.args(["-bbox-layout", "-cropbox", "-enc", "UTF-8", "-q"]).arg(pdf).arg("-");
        }
        Output::Reading => {
            cmd.args(["-xml", "-zoom", "1", "-stdout", "-q"]).arg(pdf);
        }
    }
}

/// Commande qui écrit la sortie voulue sur stdout. L'appelant règle les
/// tuyaux, l'échéance et le groupe de processus.
pub fn command(output: Output, pdf: &Path) -> (Command, Program) {
    let program = resolve(output);
    let mut cmd = Command::new(&program.path);
    if program.poppler_syntax() {
        poppler_args(&mut cmd, output, pdf, false);
    } else {
        cmd.arg(output.subcommand()).arg(pdf);
    }
    (cmd, program)
}

/// Message quand le programme n'a pas pu démarrer.
pub fn spawn_error(program: &Program, error: &std::io::Error) -> String {
    let path = program.path.display();
    if error.kind() != std::io::ErrorKind::NotFound {
        return format!("lecture du PDF impossible ({path}) : {error}");
    }
    match program.source {
        Source::Poppler => format!(
            "lecture du PDF impossible : l'outil atelier-pdf manque (réinstaller Atelier) et {path} est introuvable"
        ),
        Source::Tool | Source::Forced => format!("lecture du PDF impossible : {path} introuvable"),
    }
}

fn run(mut cmd: Command, program: &Program) -> Result<String, String> {
    let out = cmd
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| spawn_error(program, &e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() { "Extraction PDF impossible".to_string() } else { stderr });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Texte brut d'un PDF (`pdftotext -enc UTF-8`, pages séparées par `\f`),
/// attendu jusqu'au bout. Par poppler, un PDF sans texte est relu une fois
/// en `-layout`, comme le faisait la base d'articles.
pub fn extract_text(pdf: &Path) -> Result<String, String> {
    let (cmd, program) = command(Output::Text, pdf);
    let text = run(cmd, &program)?;
    if program.poppler_syntax() && text.trim().is_empty() {
        let mut cmd = Command::new(&program.path);
        poppler_args(&mut cmd, Output::Text, pdf, true);
        return run(cmd, &program);
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(cmd: &Command) -> Vec<String> {
        cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn the_tool_takes_a_subcommand_and_poppler_its_usual_flags() {
        let pdf = Path::new("a.pdf");
        let mut cmd = Command::new("pdftohtml");
        poppler_args(&mut cmd, Output::Reading, pdf, false);
        assert_eq!(args(&cmd), ["-xml", "-zoom", "1", "-stdout", "-q", "a.pdf"]);
        let mut cmd = Command::new("pdftotext");
        poppler_args(&mut cmd, Output::WordBoxes, pdf, false);
        assert_eq!(args(&cmd), ["-bbox-layout", "-cropbox", "-enc", "UTF-8", "-q", "a.pdf", "-"]);
        let mut cmd = Command::new("pdftotext");
        poppler_args(&mut cmd, Output::Text, pdf, true);
        assert_eq!(args(&cmd), ["-layout", "-enc", "UTF-8", "a.pdf", "-"]);
        assert_eq!(
            [Output::Text, Output::WordBoxes, Output::Reading].map(Output::subcommand),
            ["text", "bbox", "xml"]
        );
    }

    /// Faux `atelier-pdf` : `page <pdf> <n> <largeur> <png>` recopie le PDF
    /// et ses arguments dans le PNG (ou échoue si le PDF dit « casse »).
    #[cfg(unix)]
    #[test]
    fn a_pdf_held_in_memory_renders_its_first_page_then_leaves_no_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("atelier-pdf-fake-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let tool = dir.join("atelier-pdf");
        std::fs::write(&tool, "#!/bin/sh\nif grep -q casse \"$2\"; then echo 'PDF illisible' >&2; exit 3; fi\n{ cat \"$2\"; echo \" $1 $3 $4\"; } > \"$5\"\n").unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();
        let timeout = std::time::Duration::from_secs(10);
        let png = memory_page_png(&tool, b"%PDF-1.4 ok", 900, timeout).unwrap();
        assert_eq!(String::from_utf8(png).unwrap(), "%PDF-1.4 ok page 1 900\n");
        let err = memory_page_png(&tool, b"%PDF-1.4 casse", 900, timeout).unwrap_err();
        assert_eq!(err, "PDF illisible");
        let left = std::fs::read_dir(std::env::temp_dir()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with(&format!("atelier-pdfpage-{}-", std::process::id()))).count();
        assert_eq!(left, 0, "dossiers temporaires effacés");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_tool_says_to_reinstall() {
        let missing = std::io::Error::from(std::io::ErrorKind::NotFound);
        let poppler = Program { path: PathBuf::from("pdftotext"), source: Source::Poppler };
        assert!(spawn_error(&poppler, &missing).contains("réinstaller Atelier"));
        let forced = Program { path: PathBuf::from("/nulle/part/pdftohtml"), source: Source::Forced };
        let message = spawn_error(&forced, &missing);
        assert!(message.contains("/nulle/part/pdftohtml") && !message.contains("réinstaller"));
    }
}
