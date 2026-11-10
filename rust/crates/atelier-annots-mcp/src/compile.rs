//! Compilation LaTeX et aperçu PDF pour l'éditeur de l'artefact (outils
//! réservés aux vues : `compile_tex`, `render_pdf_page`).
//!
//! - `compile_tex` lance latexmk (MacTeX) dans le dossier du fichier
//!   principal, sans shell et sans `\write18` (`-no-shell-escape`), avec un
//!   budget de temps ; les erreurs et avertissements sont lus dans le `.log`
//!   (`-file-line-error`) et rendus avec leur fichier et leur ligne.
//! - `render_pdf_page` rend une page du PDF en PNG par PDFium, dans un
//!   processus enfant (`--render-page`) : PDFium ne se lie qu'une fois par
//!   processus, et un PDF qui fait planter le moteur ne tue pas le
//!   connecteur.

use crate::revision;
use base64::Engine as _;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant, UNIX_EPOCH};

const COMPILE_BUDGET: Duration = Duration::from_secs(180);
const RENDER_BUDGET: Duration = Duration::from_secs(30);
const WIDTH_MIN: u16 = 200;
const WIDTH_MAX: u16 = 2400;
const ISSUES_MAX: usize = 60;
const LOG_TAIL: usize = 6000;

/// Où chercher latexmk quand le PATH est réduit (connecteur lancé par une
/// app, pas par un terminal).
const TEX_DIRS: [&str; 4] = [
    "/Library/TeX/texbin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
];

static COMPILING: Mutex<Option<HashSet<PathBuf>>> = Mutex::new(None);

/// Une compilation à la fois par fichier principal.
struct Running(PathBuf);

impl Running {
    fn start(main: &Path) -> Option<Self> {
        let mut set = COMPILING.lock().unwrap_or_else(|e| e.into_inner());
        let set = set.get_or_insert_with(HashSet::new);
        set.insert(main.to_path_buf())
            .then(|| Running(main.to_path_buf()))
    }
}

impl Drop for Running {
    fn drop(&mut self) {
        let mut set = COMPILING.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(set) = set.as_mut() {
            set.remove(&self.0);
        }
    }
}

fn mtime_ms(path: &Path) -> Option<u64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

fn latexmk() -> Option<PathBuf> {
    if let Some(forced) = std::env::var_os("ATELIER_LATEXMK").filter(|v| !v.is_empty()) {
        return Some(PathBuf::from(forced));
    }
    let mut dirs: Vec<PathBuf> = TEX_DIRS.iter().take(1).map(PathBuf::from).collect();
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    dirs.extend(TEX_DIRS.iter().skip(1).map(PathBuf::from));
    dirs.into_iter()
        .map(|d| d.join("latexmk"))
        .find(|p| p.is_file())
}

/// PATH de l'enfant : le dossier de latexmk et ceux de TeX d'abord, pour
/// que pdflatex, bibtex et biber se trouvent même avec un PATH réduit.
fn child_path(latexmk: &Path) -> std::ffi::OsString {
    let mut dirs: Vec<PathBuf> = latexmk
        .parent()
        .map(Path::to_path_buf)
        .into_iter()
        .collect();
    dirs.extend(TEX_DIRS.iter().map(PathBuf::from));
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    std::env::join_paths(dirs).unwrap_or_default()
}

/// Attend la fin de l'enfant, ou le tue (lui et son groupe : pdflatex,
/// bibtex) passé le budget. `None` : budget dépassé.
fn wait_within(
    child: &mut std::process::Child,
    budget: Duration,
) -> Option<std::process::ExitStatus> {
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Some(status),
            Ok(None) if start.elapsed() < budget => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                #[cfg(unix)]
                {
                    let _ = Command::new("kill")
                        .args(["-9", &format!("-{}", child.id())])
                        .stderr(Stdio::null())
                        .status();
                }
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn temp_file(role: &str) -> PathBuf {
    let nonce: u64 = rand::random();
    std::env::temp_dir().join(format!(
        "atelier-{role}-{}-{nonce:016x}",
        std::process::id()
    ))
}

/// Le `.tex` principal à compiler.
fn main_tex(args: &Value) -> Result<PathBuf, String> {
    let raw = revision::str_arg(args, "path").trim().to_string();
    if raw.is_empty() {
        return Err("path manquant : le chemin absolu du fichier .tex principal".into());
    }
    let path = revision::expand_home(&raw);
    if !path.is_absolute() || !path.is_file() {
        return Err(format!("{raw} : fichier introuvable"));
    }
    if !path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("tex"))
    {
        return Err(format!("{raw} : seul un fichier .tex se compile"));
    }
    let name = revision::file_name(&path);
    if name.starts_with('-') {
        return Err(format!("{raw} : nom de fichier refusé"));
    }
    Ok(path)
}

fn latexmk_args(name: &str, force: bool) -> Vec<String> {
    let mut args: Vec<String> = [
        "-pdf",
        "-synctex=1",
        "-interaction=nonstopmode",
        "-file-line-error",
        "-halt-on-error",
        // Pas de \write18, même si un latexmkrc le demande : la ligne de
        // commande passe après les fichiers de configuration.
        "-pdflatex=pdflatex -no-shell-escape -file-line-error -interaction=nonstopmode -synctex=1 %O %S",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    if force {
        args.push("-g".into());
    }
    args.push(format!("./{name}"));
    args
}

/// `compile_tex` : compile le fichier principal et rend les erreurs.
pub fn compile(args: &Value) -> Result<Value, String> {
    let main = main_tex(args)?;
    let force = args.get("force").and_then(Value::as_bool).unwrap_or(false);
    let Some(_running) = Running::start(&main) else {
        return Ok(json!({
            "content": [{"type": "text", "text": "Compilation déjà en cours."}],
            "structuredContent": {"ok": false, "busy": true},
            "isError": false,
        }));
    };
    let Some(latexmk) = latexmk() else {
        return Err(
            "LaTeX introuvable : latexmk manque (installer MacTeX ou BasicTeX avec latexmk)".into(),
        );
    };
    let cwd = main.parent().unwrap_or(Path::new("/")).to_path_buf();
    let name = revision::file_name(&main);
    let pdf = main.with_extension("pdf");
    let log_path = main.with_extension("log");
    let pdf_before = mtime_ms(&pdf);
    let out_path = temp_file("latexmk");
    let out = std::fs::File::create(&out_path).map_err(|e| format!("journal temporaire : {e}"))?;
    let err = out.try_clone().map_err(|e| e.to_string())?;
    let mut cmd = Command::new(&latexmk);
    cmd.args(latexmk_args(&name, force))
        .current_dir(&cwd)
        .env("PATH", child_path(&latexmk))
        // Lignes du .log non coupées à 79 colonnes : chemins et messages
        // entiers.
        .env("max_print_line", "1000")
        .env("error_line", "254")
        .env("half_error_line", "238")
        .stdin(Stdio::null())
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(err));
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let started = Instant::now();
    let spawned = cmd.spawn();
    let status = match spawned {
        Ok(mut child) => wait_within(&mut child, COMPILE_BUDGET),
        Err(e) => {
            let _ = std::fs::remove_file(&out_path);
            return Err(format!("{} : {e}", latexmk.display()));
        }
    };
    let seconds = (started.elapsed().as_millis() as f64 / 100.0).round() / 10.0;
    let console = std::fs::read(&out_path).unwrap_or_default();
    let _ = std::fs::remove_file(&out_path);
    let console = String::from_utf8_lossy(&console).into_owned();
    let log = std::fs::read(&log_path)
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default();
    let (mut errors, warnings) = parse_log(&log, &cwd);
    let pdf_after = mtime_ms(&pdf);
    let fresh = pdf_after.is_some() && pdf_after != pdf_before;
    let timed_out = status.is_none();
    let ok = status.is_some_and(|s| s.success()) && pdf_after.is_some() && errors.is_empty();
    if !ok && errors.is_empty() {
        let message = if timed_out {
            format!("compilation arrêtée après {} s", COMPILE_BUDGET.as_secs())
        } else {
            console_error(&console)
                .unwrap_or_else(|| "la compilation a échoué (voir le journal)".into())
        };
        errors.push(json!({"path": Value::Null, "line": Value::Null, "message": message}));
    }
    let tail: String = {
        let text = if log.is_empty() { &console } else { &log };
        let count = text.chars().count();
        text.chars().skip(count.saturating_sub(LOG_TAIL)).collect()
    };
    let summary = if ok {
        format!(
            "Compilé en {seconds} s, {} avertissement(s).",
            warnings.len()
        )
    } else {
        format!(
            "Échec de la compilation : {}",
            errors[0]["message"].as_str().unwrap_or("")
        )
    };
    Ok(json!({
        "content": [{"type": "text", "text": summary}],
        "structuredContent": {
            "ok": ok,
            "pdf": pdf_after.map(|_| pdf.display().to_string()),
            "pdfMtime": pdf_after,
            "fresh": fresh,
            "stale": !ok && pdf_after.is_some() && !fresh,
            "seconds": seconds,
            "errors": errors,
            "warnings": warnings,
            "log": tail,
        },
        "isError": false,
    }))
}

/// Faute de `.log` utile : la ligne de latexmk qui dit ce qui manque.
fn console_error(console: &str) -> Option<String> {
    console
        .lines()
        .rev()
        .find(|l| {
            let l = l.trim();
            l.starts_with("Latexmk:")
                && (l.contains("rror") || l.contains("issing") || l.contains("not"))
                || l.starts_with('!')
        })
        .map(|l| l.trim().to_string())
}

/// Chemin lu dans le journal, rendu absolu et sans `./`.
fn resolve(cwd: &Path, raw: &str) -> PathBuf {
    let joined = if Path::new(raw).is_absolute() {
        PathBuf::from(raw)
    } else {
        cwd.join(raw)
    };
    let mut out = PathBuf::new();
    for part in joined.components() {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

const SOURCE_EXT: [&str; 7] = [".tex", ".sty", ".cls", ".ltx", ".tikz", ".bbl", ".bib"];

/// `./sections/a.tex:12: Undefined control sequence.` → (fichier, ligne,
/// message).
fn file_line_error(line: &str) -> Option<(&str, u32, &str)> {
    for ext in SOURCE_EXT {
        let mut from = 0;
        while let Some(at) = line[from..].find(&format!("{ext}:")) {
            let end = from + at + ext.len();
            let rest = &line[end + 1..];
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            if !digits.is_empty() && rest[digits.len()..].starts_with(": ") {
                let file = &line[..end];
                let message = rest[digits.len() + 2..].trim();
                return Some((file, digits.parse().ok()?, message));
            }
            from = end;
        }
    }
    None
}

/// Le fichier en cours d'après les parenthèses du journal (TeX écrit
/// `(./sections/a.tex` en ouvrant un fichier et `)` en le refermant).
fn track_files(line: &str, stack: &mut Vec<Option<String>>) {
    let bytes: Vec<char> = line.chars().collect();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            '(' => {
                let token: String = bytes[i + 1..]
                    .iter()
                    .take_while(|c| !c.is_whitespace() && **c != '(' && **c != ')')
                    .collect();
                let is_file = token.len() > 2
                    && (token.starts_with("./") || token.starts_with('/') || token.contains('.'))
                    && token.rsplit_once('.').is_some_and(|(_, e)| {
                        (1..=5).contains(&e.len()) && e.chars().all(|c| c.is_ascii_alphanumeric())
                    });
                stack.push(is_file.then_some(token.clone()));
                i += 1 + token.chars().count();
                continue;
            }
            ')' => {
                stack.pop();
            }
            _ => {}
        }
        i += 1;
    }
}

fn current_tex(stack: &[Option<String>]) -> Option<&str> {
    stack
        .iter()
        .rev()
        .flatten()
        .find(|f| f.ends_with(".tex"))
        .map(String::as_str)
}

/// `on input line 17.` → 17.
fn input_line(text: &str) -> Option<u32> {
    let at = text.find("input line ")?;
    text[at + 11..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .ok()
}

/// Erreurs et avertissements du `.log`, avec fichier et ligne.
pub fn parse_log(log: &str, cwd: &Path) -> (Vec<Value>, Vec<Value>) {
    let lines: Vec<&str> = log.lines().collect();
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut seen = HashSet::new();
    let mut stack: Vec<Option<String>> = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if let Some((file, number, message)) = file_line_error(line) {
            let context = lines[i + 1..]
                .iter()
                .take(4)
                .find(|l| l.starts_with("l."))
                .map(|l| l.trim().to_string());
            if errors.len() < ISSUES_MAX && seen.insert(format!("{file}:{number}:{message}")) {
                errors.push(json!({
                    "path": resolve(cwd, file).display().to_string(),
                    "line": number,
                    "message": message,
                    "context": context,
                }));
            }
            continue;
        }
        if line.starts_with("! ") && errors.is_empty() {
            errors.push(json!({"path": Value::Null, "line": Value::Null,
                "message": line[2..].trim()}));
            continue;
        }
        let warning = line.find(" Warning: ").filter(|_| {
            line.starts_with("LaTeX ")
                || line.starts_with("Package ")
                || line.starts_with("Class ")
                || line.starts_with("pdfTeX ")
        });
        if let Some(at) = warning {
            let mut message = line[at + 10..].trim().to_string();
            // Suite d'un avertissement de paquet : `(natbib)    …`.
            for next in lines[i + 1..].iter().take(6) {
                let t = next.trim_start();
                if t.starts_with('(')
                    && t.contains(')')
                    && !t.contains(".tex")
                    && !next.trim().is_empty()
                {
                    if let Some((_, rest)) = t.split_once(')') {
                        message.push(' ');
                        message.push_str(rest.trim());
                        continue;
                    }
                }
                break;
            }
            let number = input_line(&message);
            let file = number
                .and(current_tex(&stack))
                .map(|f| resolve(cwd, f).display().to_string());
            if warnings.len() < ISSUES_MAX && seen.insert(format!("w:{message}")) {
                warnings.push(json!({"path": file, "line": number, "message": message}));
            }
        }
        track_files(line, &mut stack);
    }
    (errors, warnings)
}

/// `render_pdf_page` : une page du PDF en PNG, `width` pixels de large.
pub fn render_page(args: &Value) -> Result<Value, String> {
    let raw = revision::str_arg(args, "path").trim().to_string();
    let pdf = revision::expand_home(&raw);
    if !pdf.is_absolute() || !pdf.is_file() {
        return Err(format!("{raw} : PDF introuvable"));
    }
    if !pdf
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
    {
        return Err(format!("{raw} : ce n'est pas un PDF"));
    }
    let page = args.get("page").and_then(Value::as_u64).unwrap_or(1).max(1);
    let width = args
        .get("width")
        .and_then(Value::as_u64)
        .unwrap_or(1200)
        .clamp(u64::from(WIDTH_MIN), u64::from(WIDTH_MAX));
    let mtime = mtime_ms(&pdf);
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let png_path = temp_file("page");
    let mut child = Command::new(exe)
        .arg("--render-page")
        .arg(&pdf)
        .arg(page.to_string())
        .arg(width.to_string())
        .arg(&png_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let status = wait_within(&mut child, RENDER_BUDGET);
    let mut header = String::new();
    let mut problem = String::new();
    use std::io::Read;
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut header);
    }
    if let Some(mut err) = child.stderr.take() {
        let _ = err.read_to_string(&mut problem);
    }
    let png = std::fs::read(&png_path);
    let _ = std::fs::remove_file(&png_path);
    match status {
        None => {
            return Err(format!(
                "rendu de la page {page} arrêté après {} s",
                RENDER_BUDGET.as_secs()
            ))
        }
        Some(s) if !s.success() => {
            let problem = problem.trim().trim_start_matches("atelier-annots-mcp: ");
            return Err(if problem.is_empty() {
                format!("rendu de la page {page} impossible")
            } else {
                problem.to_string()
            });
        }
        _ => {}
    }
    let png = png.map_err(|e| format!("rendu de la page {page} : {e}"))?;
    let info: Value = serde_json::from_str(header.trim()).unwrap_or_else(|_| json!({}));
    Ok(json!({
        "content": [{"type": "image", "data": base64::engine::general_purpose::STANDARD.encode(&png), "mimeType": "image/png"}],
        "structuredContent": {
            "page": page,
            "pages": info["pages"],
            "width": info["width"],
            "height": info["height"],
            "pdfMtime": mtime,
            "bytes": png.len(),
        },
        "isError": false,
    }))
}

/// Processus enfant : `--render-page <pdf> <page> <largeur> <png>`. Écrit le
/// PNG et imprime `{pages, width, height}` sur la sortie standard.
pub fn render_child(args: &[String]) -> Result<(), String> {
    let [pdf, page, width, out] = args else {
        return Err("usage : --render-page <pdf> <page> <largeur> <png>".into());
    };
    let page: u32 = page.parse().map_err(|_| "page invalide")?;
    let width: u16 = width.parse().map_err(|_| "largeur invalide")?;
    let (pages, w, h, rgb) =
        atelier_pdf::engine::render_page(Path::new(pdf), page.saturating_sub(1), width)?;
    let png = atelier_pdf::thumb::encode_png_compact(w, h, &rgb)?;
    std::fs::write(out, png).map_err(|e| format!("{out} : {e}"))?;
    println!("{}", json!({"pages": pages, "width": w, "height": h}));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOG: &str = "This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2026)
(./main.tex
LaTeX2e <2025-11-01>
(/usr/local/texlive/2026/texmf-dist/tex/latex/base/article.cls
Document Class: article 2024/06/29 v1.4n Standard LaTeX document class
(/usr/local/texlive/2026/texmf-dist/tex/latex/base/size10.clo))
(./sections/introduction.tex
LaTeX Warning: Citation `nope2020' on page 1 undefined on input line 7.

) (./sections/resultats.tex
./sections/resultats.tex:12: Undefined control sequence.
l.12 \\foo
          {bar}
Package natbib Warning: Citation `x' on page 2 undefined on input line 17.

)
LaTeX Warning: There were undefined references.

";

    #[test]
    fn errors_and_warnings_carry_their_file_and_line() {
        let cwd = Path::new("/p/these");
        let (errors, warnings) = parse_log(LOG, cwd);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0]["path"], "/p/these/sections/resultats.tex");
        assert_eq!(errors[0]["line"], 12);
        assert_eq!(errors[0]["message"], "Undefined control sequence.");
        assert_eq!(errors[0]["context"], "l.12 \\foo");
        assert_eq!(warnings.len(), 3);
        assert_eq!(warnings[0]["path"], "/p/these/sections/introduction.tex");
        assert_eq!(warnings[0]["line"], 7);
        assert_eq!(warnings[1]["path"], "/p/these/sections/resultats.tex");
        assert_eq!(warnings[1]["line"], 17);
        assert_eq!(warnings[2]["line"], Value::Null);
        assert_eq!(warnings[2]["path"], Value::Null);
    }

    #[test]
    fn a_file_line_error_needs_a_source_extension_and_a_number() {
        assert_eq!(
            file_line_error("./a b.tex:3: LaTeX Error: File `x.sty' not found."),
            Some(("./a b.tex", 3, "LaTeX Error: File `x.sty' not found."))
        );
        assert_eq!(file_line_error("see main.tex: nothing"), None);
        assert_eq!(
            file_line_error("Output written on main.pdf (2 pages)."),
            None
        );
    }

    #[test]
    fn latexmk_never_allows_shell_escape_and_protects_the_name() {
        let args = latexmk_args("main.tex", false);
        assert!(args.iter().any(|a| a.contains("-no-shell-escape")));
        assert!(!args.iter().any(|a| a == "-shell-escape"));
        assert_eq!(args.last().unwrap(), "./main.tex");
        assert!(latexmk_args("main.tex", true).contains(&"-g".to_string()));
        assert!(main_tex(&json!({"path": "/nope/main.tex"})).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn compile_runs_latexmk_and_reports_the_log() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let main = dir.path().join("main.tex");
        std::fs::write(&main, "\\documentclass{article}\n").unwrap();
        let fake = dir.path().join("latexmk");
        std::fs::write(
            &fake,
            "#!/bin/sh\nprintf '(./main.tex\\n./main.tex:2: Missing $ inserted.\\nl.2 x^2\\n)' > main.log\nexit 12\n",
        )
        .unwrap();
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        // SAFETY: test seul à lire cette variable.
        unsafe { std::env::set_var("ATELIER_LATEXMK", &fake) };
        let out = compile(&json!({"path": main.display().to_string()})).unwrap();
        unsafe { std::env::remove_var("ATELIER_LATEXMK") };
        let s = &out["structuredContent"];
        assert_eq!(s["ok"], false);
        assert_eq!(s["errors"][0]["line"], 2);
        assert_eq!(s["errors"][0]["path"], main.display().to_string());
        assert_eq!(s["errors"][0]["message"], "Missing $ inserted.");
        assert_eq!(s["pdf"], Value::Null);
    }

    #[test]
    fn rendering_refuses_what_is_not_a_pdf() {
        let dir = tempfile::tempdir().unwrap();
        let tex = dir.path().join("a.tex");
        std::fs::write(&tex, "x").unwrap();
        assert!(render_page(&json!({"path": tex.display().to_string()})).is_err());
        assert!(render_page(&json!({"path": "/nope.pdf"})).is_err());
    }
}
