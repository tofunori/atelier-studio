//! `atelier-pdf <text|bbox|xml> <fichier.pdf>` : écrit sur stdout la sortie
//! de `pdftotext`, `pdftotext -bbox-layout -cropbox` ou `pdftohtml -xml
//! -zoom 1`, lue par PDFium. Sans PDFium (développement sans
//! `scripts/fetch-pdfium.sh`), passe la main à poppler s'il est installé.
//!
//! `atelier-pdf thumb <taille> <dossier> <fichier.pdf>` : vignette PNG de la
//! première page (voir `thumb.rs`), au contrat de `qlmanage -t`.
//!
//! `atelier-pdf corrige <source.pdf> <copie.pdf> <commentaires.json>` :
//! copie corrigée, commentaires imprimés dans une marge (voir `corrige.rs`).
//! Écrit sur stdout `{"comments":…,"pages":…,"removed":…}`.

use atelier_pdf::{corrige, emit, engine, layout, thumb, tool};
use std::io::Write;
use std::path::Path;
use std::process::ExitCode;

fn usage() -> ExitCode {
    eprintln!("usage : atelier-pdf <text|bbox|xml> <fichier.pdf>");
    eprintln!("        atelier-pdf thumb <taille> <dossier> <fichier.pdf>");
    eprintln!("        atelier-pdf corrige <source.pdf> <copie.pdf> <commentaires.json>");
    ExitCode::from(2)
}

/// `thumb` : PDFium d'abord ; sans lui (développement sans
/// `scripts/fetch-pdfium.sh`), Quick Look sur macOS, comme avant.
fn thumbnail(size: &str, dir: &str, file: &str) -> ExitCode {
    let Ok(size) = size.parse::<u16>() else {
        return usage();
    };
    let (pdf, dir) = (Path::new(file), Path::new(dir));
    if !pdf.is_file() || !dir.is_dir() {
        eprintln!("PDF ou dossier introuvable : {} → {}", pdf.display(), dir.display());
        return ExitCode::from(1);
    }
    match thumb::write(pdf, dir, size) {
        Ok(_) => ExitCode::SUCCESS,
        Err(error) if error.starts_with("PDFium") && cfg!(target_os = "macos") => {
            let status = std::process::Command::new("qlmanage")
                .args(["-t", "-s", &size.to_string(), "-o"])
                .arg(dir)
                .arg(pdf)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
            if status.is_ok_and(|s| s.success()) { ExitCode::SUCCESS } else { ExitCode::from(1) }
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}

/// PDFium absent : même sortie par poppler, si poppler est là.
fn poppler_fallback(output: tool::Output, pdf: &Path, why: &str) -> ExitCode {
    let program = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]
        .iter()
        .map(|dir| Path::new(dir).join(match output {
            tool::Output::Reading => "pdftohtml",
            _ => "pdftotext",
        }))
        .find(|p| p.is_file());
    let Some(program) = program else {
        eprintln!("{why}");
        return ExitCode::from(1);
    };
    let mut cmd = std::process::Command::new(&program);
    match output {
        tool::Output::Text => cmd.args(["-enc", "UTF-8"]).arg(pdf).arg("-"),
        tool::Output::WordBoxes => {
            cmd.args(["-bbox-layout", "-cropbox", "-enc", "UTF-8", "-q"]).arg(pdf).arg("-")
        }
        tool::Output::Reading => cmd.args(["-xml", "-zoom", "1", "-stdout", "-q"]).arg(pdf),
    };
    match cmd.status() {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(_) => ExitCode::from(1),
        Err(error) => {
            eprintln!("{why} ; {} : {error}", program.display());
            ExitCode::from(1)
        }
    }
}

fn corrected(src: &str, out: &str, comments: &str) -> ExitCode {
    let request = std::fs::read_to_string(comments)
        .map_err(|e| format!("commentaires illisibles : {e}"))
        .and_then(|raw| serde_json::from_str::<corrige::Request>(&raw).map_err(|e| format!("commentaires invalides : {e}")));
    let result = request.and_then(|request| corrige::write(Path::new(src), Path::new(out), &request));
    match result {
        Ok(report) => {
            println!(r#"{{"comments":{},"pages":{},"removed":{}}}"#, report.comments, report.pages, report.removed);
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("{error}");
            ExitCode::from(1)
        }
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let [kind, a, b, c] = args.as_slice() {
        match kind.as_str() {
            "thumb" => return thumbnail(a, b, c),
            "corrige" => return corrected(a, b, c),
            _ => {}
        }
    }
    let [kind, file] = args.as_slice() else {
        return usage();
    };
    let output = match kind.as_str() {
        "text" => tool::Output::Text,
        "bbox" => tool::Output::WordBoxes,
        "xml" => tool::Output::Reading,
        _ => return usage(),
    };
    let pdf = Path::new(file);
    if !pdf.is_file() {
        eprintln!("PDF introuvable : {}", pdf.display());
        return ExitCode::from(1);
    }
    let doc = match engine::read(pdf) {
        Ok(doc) => doc,
        Err(error) if error.starts_with("PDFium") => return poppler_fallback(output, pdf, &error),
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    let pages = layout::layout(&doc);
    let body = match output {
        tool::Output::Text => emit::text(&pages),
        tool::Output::WordBoxes => emit::bbox_layout(&pages),
        tool::Output::Reading => emit::pdf2xml(&pages, &doc.fonts),
    };
    let mut stdout = std::io::stdout().lock();
    if stdout.write_all(body.as_bytes()).and_then(|_| stdout.flush()).is_err() {
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}
