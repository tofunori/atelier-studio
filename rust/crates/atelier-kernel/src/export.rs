//! Export du noyau d'un fil : script `.py` (cellules `# %%`) ou cahier
//! `.ipynb`, avec en-tête de preuves (env, versions, empreintes des données
//! lues, état de la chaîne du journal, dernier rejeu). Pour l'annexe d'une
//! thèse ou un dépôt Code Ocean.

use crate::journal::{ChainCheck, CellRecord};
use crate::packages::EnvSnapshot;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub struct ExportInput<'a> {
    pub thread_title: &'a str,
    /// Cellules réussies de la session, dans l'ordre.
    pub cells: &'a [CellRecord],
    /// Cellules en erreur laissées de côté.
    pub skipped: usize,
    pub env: Option<&'a EnvSnapshot>,
    pub chain: &'a ChainCheck,
    pub exported_at: &'a str,
}

fn short(sha: &str) -> &str {
    &sha[..sha.len().min(12)]
}

fn size(bytes: u64) -> String {
    match bytes {
        b if b >= 1 << 30 => format!("{:.1} Go", b as f64 / (1u64 << 30) as f64),
        b if b >= 1 << 20 => format!("{:.1} Mo", b as f64 / (1u64 << 20) as f64),
        b if b >= 1 << 10 => format!("{:.1} Ko", b as f64 / 1024.0),
        b => format!("{b} o"),
    }
}

/// Lignes d'en-tête communes aux deux formats.
fn header(input: &ExportInput) -> Vec<String> {
    let mut lines = vec![
        format!("Cahier du noyau Python d'Atelier : « {} »", input.thread_title),
        format!("Exporté le {}", input.exported_at),
    ];
    if let Some(first) = input.cells.first() {
        lines.push(format!("Env : {} · Python {} ({})", first.env, first.python_version, first.python));
        lines.push(format!("Dossier de travail : {}", first.cwd));
    }
    if let Some(env) = input.env {
        lines.push(format!(
            "Instantané d'env : sha256 {} ({} paquets)",
            short(&env.sha256),
            env.packages.len()
        ));
        let imports = input.cells.last().map(|c| c.imports.clone()).unwrap_or_default();
        let versions = env.versions(&imports);
        if !versions.is_empty() {
            lines.push(format!(
                "Paquets chargés : {}",
                versions.iter().map(|(k, v)| format!("{k} {v}")).collect::<Vec<_>>().join(", ")
            ));
        }
    }
    let mut inputs: BTreeMap<String, String> = BTreeMap::new();
    for cell in input.cells {
        for p in cell.prints.iter().filter(|p| cell.files_read.contains(&p.path)) {
            let sha = p.sha256.as_deref().map(short).unwrap_or("non haché (trop gros)");
            inputs.entry(p.path.clone()).or_insert(format!("sha256 {sha} · {}", size(p.size)));
        }
    }
    if !inputs.is_empty() {
        lines.push("Données lues :".into());
        for (path, print) in inputs {
            lines.push(format!("  {path}  ({print})"));
        }
    }
    lines.push(match input.chain.broken_at {
        None => format!("Journal : chaîne d'empreintes intacte ({} lignes vérifiées)", input.chain.checked),
        Some(id) => format!("Journal : chaîne d'empreintes ROMPUE à la cellule {id}"),
    });
    let replayed: Vec<&str> = input
        .cells
        .iter()
        .filter_map(|c| c.replay.as_ref().map(|r| r.status.as_str()))
        .collect();
    if !replayed.is_empty() {
        let same = replayed.iter().filter(|s| **s == "same").count();
        lines.push(format!(
            "Dernier rejeu à neuf : {same} cellule(s) reproduite(s) sur {}",
            input.cells.len()
        ));
    }
    if input.skipped > 0 {
        lines.push(format!("{} cellule(s) en erreur laissée(s) de côté", input.skipped));
    }
    lines
}

fn cell_title(cell: &CellRecord) -> String {
    let mut title = format!("[{}]", cell.id);
    if let Some(p) = &cell.purpose {
        title.push(' ');
        title.push_str(p);
    }
    if cell.author.as_deref() == Some("user") {
        title.push_str(&match (&cell.resumed_from, cell.from_cell) {
            (Some(r), _) => format!(" (reprise du fil « {} », [{}])", r.title, r.cell),
            (None, Some(n)) => format!(" (modifiée à la main d'après [{n}])"),
            (None, None) => " (écrite à la main)".into(),
        });
    }
    title.push_str(&format!(" · {} · code sha256 {}", cell.started_at, short(&cell.code_sha256)));
    title
}

pub fn to_py(input: &ExportInput) -> String {
    let mut out = String::new();
    for line in header(input) {
        out.push_str(&format!("# {line}\n"));
    }
    for cell in input.cells {
        out.push_str(&format!("\n# %% {}\n", cell_title(cell)));
        out.push_str(cell.code.trim_end());
        out.push('\n');
    }
    out
}

fn source_lines(text: &str) -> Value {
    let lines: Vec<String> = text.split_inclusive('\n').map(str::to_string).collect();
    json!(lines)
}

pub fn to_ipynb(input: &ExportInput) -> String {
    let mut cells = vec![json!({
        "cell_type": "markdown",
        "metadata": {},
        "source": source_lines(&header(input).iter().map(|l| format!("{l}  \n")).collect::<String>()),
    })];
    for cell in input.cells {
        let mut outputs = Vec::new();
        if !cell.stdout.is_empty() {
            outputs.push(json!({"output_type": "stream", "name": "stdout", "text": source_lines(&cell.stdout)}));
        }
        if !cell.stderr.trim().is_empty() {
            outputs.push(json!({"output_type": "stream", "name": "stderr", "text": source_lines(&cell.stderr)}));
        }
        if let Some(result) = &cell.result {
            outputs.push(json!({
                "output_type": "execute_result",
                "execution_count": cell.id,
                "metadata": {},
                "data": {"text/plain": source_lines(result)},
            }));
        }
        cells.push(json!({
            "cell_type": "code",
            "execution_count": cell.id,
            "metadata": {"atelier": {
                "title": cell_title(cell),
                "id": cell.id,
                "purpose": cell.purpose,
                "codeSha256": cell.code_sha256,
                "author": cell.author,
                "fromCell": cell.from_cell,
                "replay": cell.replay,
            }},
            "source": source_lines(cell.code.trim_end()),
            "outputs": outputs,
        }));
    }
    let python = input.cells.first().map(|c| c.python_version.clone()).unwrap_or_default();
    let doc = json!({
        "nbformat": 4,
        "nbformat_minor": 5,
        "metadata": {
            "kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"},
            "language_info": {"name": "python", "version": python},
        },
        "cells": cells,
    });
    // Les cahiers Jupyter portent un identifiant par cellule depuis 4.5.
    let mut doc = doc;
    if let Some(list) = doc["cells"].as_array_mut() {
        for (i, c) in list.iter_mut().enumerate() {
            c["id"] = json!(format!("atelier-{i}"));
        }
    }
    serde_json::to_string_pretty(&doc).unwrap_or_default() + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prints::FilePrint;

    #[test]
    fn script_et_cahier_portent_l_en_tete_de_preuves() {
        let cells = vec![CellRecord {
            id: 29,
            code: "print(1)\n".into(),
            code_sha256: "d1567e8272b24899".into(),
            stdout: "1\n".into(),
            env: "pymc-albedo".into(),
            python_version: "3.12.13".into(),
            purpose: Some("Comparer 2012 et 2022".into()),
            files_read: vec!["/p/panel.csv".into()],
            prints: vec![FilePrint { path: "/p/panel.csv".into(), size: 2048, mtime_ms: 0, sha256: Some("4e1a09c2aaaabbbb".into()) }],
            ..Default::default()
        }];
        let chain = ChainCheck { checked: 28, broken_at: None };
        let input = ExportInput { thread_title: "Noyau", cells: &cells, skipped: 1, env: None, chain: &chain, exported_at: "2026-10-20" };
        let py = to_py(&input);
        assert!(py.contains("# %% [29] Comparer 2012 et 2022"), "{py}");
        assert!(py.contains("/p/panel.csv  (sha256 4e1a09c2aaaa · 2.0 Ko)"), "{py}");
        assert!(py.contains("chaîne d'empreintes intacte (28"));
        assert!(py.contains("1 cellule(s) en erreur"));
        let nb: Value = serde_json::from_str(&to_ipynb(&input)).unwrap();
        assert_eq!(nb["nbformat"], 4);
        assert_eq!(nb["cells"][1]["source"][0], "print(1)");
        assert_eq!(nb["cells"][1]["outputs"][0]["text"][0], "1\n");
    }
}
