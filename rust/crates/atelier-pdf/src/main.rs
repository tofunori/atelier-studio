//! `atelier-pdf <text|bbox|xml> <fichier.pdf>` : écrit sur stdout la sortie
//! de `pdftotext`, `pdftotext -bbox-layout -cropbox` ou `pdftohtml -xml
//! -zoom 1`, lue par PDFium. Sans PDFium (développement sans
//! `scripts/fetch-pdfium.sh`), passe la main à poppler s'il est installé.

use atelier_pdf::{emit, engine, layout, tool};
use std::io::Write;
use std::path::Path;
use std::process::ExitCode;

fn usage() -> ExitCode {
    eprintln!("usage : atelier-pdf <text|bbox|xml> <fichier.pdf>");
    ExitCode::from(2)
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

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
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
