//! Projection complète sans bruit pour les agents du chat, analyse statique
//! amont/aval des imports et variables, et diff sémantique cellule par cellule.

use crate::nbformat::{strip_ansi, CellKind, CellOutput, NotebookCell, NotebookDocument};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

const OUTPUT_TEXT_PREVIEW_CHARS: usize = 1_200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBinding {
    /// Numéro 1-based de la cellule où l'import apparaît.
    pub cell: usize,
    /// Nom local lié dans l'espace de noms (`pl`, `pm`, `Path`, `brms`…).
    pub alias: String,
    /// Ligne d'import d'origine nettoyée.
    pub statement: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownstreamConsumer {
    pub symbol: String,
    /// Numéros 1-based des cellules en aval qui lisent ce symbole.
    pub used_in_cells: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellNeighborhood {
    pub target_cell: usize,
    pub target_id: String,
    pub upstream_imports: Vec<ImportBinding>,
    pub upstream_defined: Vec<String>,
    pub target_defines: Vec<String>,
    pub downstream_consumers: Vec<DownstreamConsumer>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditDiagnostics {
    /// Imports redondants ajoutés dans la cellule alors qu'ils sont déjà chargés plus haut.
    pub redundant_imports: Vec<String>,
    /// Variables définies auparavant par la cellule, lues en aval, mais absentes du code proposé.
    pub broken_downstream_symbols: Vec<DownstreamConsumer>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// `"same"`, `"add"` ou `"del"`.
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellDiffEntry {
    pub cell_id: String,
    pub index: Option<usize>,
    pub base_index: Option<usize>,
    pub cell_type: CellKind,
    pub title: Option<String>,
    /// `"modified"`, `"added"` ou `"removed"`.
    pub status: String,
    pub added_lines: usize,
    pub removed_lines: usize,
    pub outputs_changed: bool,
    pub lines: Vec<DiffLine>,
}

fn truncate_chars(s: &str, max: usize) -> String {
    match s.char_indices().nth(max) {
        Some((idx, _)) => format!("{}… [tronqué]", &s[..idx]),
        None => s.to_string(),
    }
}

/// Résume une sortie sans jamais inclure les octets base64 des figures ni le HTML lourd.
pub fn compact_output_summary(output: &CellOutput) -> Value {
    match output {
        CellOutput::Stream { name, text } => json!({
            "type": "stream",
            "name": name,
            "text": truncate_chars(&strip_ansi(text), OUTPUT_TEXT_PREVIEW_CHARS),
        }),
        CellOutput::ExecuteResult {
            execution_count,
            data,
            ..
        } => {
            let mut summary = serde_json::Map::new();
            summary.insert("type".into(), json!("execute_result"));
            if let Some(c) = execution_count {
                summary.insert("executionCount".into(), json!(c));
            }
            summarize_mime_map(data, &mut summary);
            Value::Object(summary)
        }
        CellOutput::DisplayData { data, .. } => {
            let mut summary = serde_json::Map::new();
            summary.insert("type".into(), json!("display_data"));
            summarize_mime_map(data, &mut summary);
            Value::Object(summary)
        }
        CellOutput::Error {
            ename,
            evalue,
            traceback,
        } => {
            let tail: Vec<String> = traceback
                .iter()
                .rev()
                .take(6)
                .rev()
                .map(|l| strip_ansi(l))
                .collect();
            json!({
                "type": "error",
                "ename": ename,
                "evalue": strip_ansi(evalue),
                "tracebackTail": truncate_chars(&tail.join("\n"), OUTPUT_TEXT_PREVIEW_CHARS),
            })
        }
    }
}

fn summarize_mime_map(
    data: &serde_json::Map<String, Value>,
    out: &mut serde_json::Map<String, Value>,
) {
    if let Some(Value::String(plain)) = data.get("text/plain") {
        out.insert(
            "text".into(),
            json!(truncate_chars(&strip_ansi(plain), OUTPUT_TEXT_PREVIEW_CHARS)),
        );
    }
    let mut figures = Vec::new();
    for mime in ["image/png", "image/jpeg", "image/svg+xml"] {
        if let Some(Value::String(payload)) = data.get(mime) {
            let approx_kb = (payload.len() * 3 / 4).max(1) / 1024;
            figures.push(format!("{mime} (~{} Ko)", approx_kb.max(1)));
        }
    }
    if !figures.is_empty() {
        out.insert("figures".into(), json!(figures));
    }
    if data.contains_key("text/html") && !data.contains_key("text/plain") {
        out.insert("hasHtml".into(), json!(true));
    }
}

/// Détecte les cellules exécutées hors de l'ordre du haut vers le bas.
pub fn out_of_order_cells(doc: &NotebookDocument) -> Vec<usize> {
    let mut bad = Vec::new();
    let mut max_seen: Option<u64> = None;
    for (i, cell) in doc.cells.iter().enumerate() {
        if let Some(cnt) = cell.execution_count {
            if let Some(prev_max) = max_seen {
                if cnt < prev_max {
                    bad.push(i + 1);
                }
            }
            max_seen = Some(max_seen.map_or(cnt, |m| m.max(cnt)));
        }
    }
    bad
}

/// Construit la projection complète, légère et sans base64 du cahier pour l'agent.
pub fn project_for_agent(
    doc: &NotebookDocument,
    from_1based: Option<usize>,
    to_1based: Option<usize>,
    include_outputs: bool,
) -> Value {
    let total = doc.cells.len();
    let start = from_1based.unwrap_or(1).clamp(1, total.max(1));
    let end = to_1based.unwrap_or(total).clamp(start, total.max(start));

    let mut all_imports = Vec::new();
    for (idx, cell) in doc.cells.iter().enumerate() {
        if cell.cell_type == CellKind::Code {
            all_imports.extend(extract_imports(&cell.source, idx + 1));
        }
    }

    let cells_view: Vec<Value> = if total == 0 {
        Vec::new()
    } else {
        doc.cells[(start - 1)..end]
            .iter()
            .enumerate()
            .map(|(offset, cell)| {
                let index = start + offset;
                let mut obj = serde_json::Map::new();
                obj.insert("cell".into(), json!(index));
                obj.insert("id".into(), json!(cell.id));
                obj.insert("type".into(), json!(cell.cell_type.as_str()));
                if let Some(title) = cell.inferred_title() {
                    obj.insert("title".into(), json!(title));
                }
                if let Some(cnt) = cell.execution_count {
                    obj.insert("executionCount".into(), json!(cnt));
                }
                obj.insert("source".into(), json!(cell.source));
                if include_outputs && !cell.outputs.is_empty() {
                    let outs: Vec<Value> =
                        cell.outputs.iter().map(compact_output_summary).collect();
                    obj.insert("outputs".into(), json!(outs));
                }
                Value::Object(obj)
            })
            .collect()
    };

    json!({
        "revision": doc.revision(),
        "language": doc.language(),
        "kernelspec": doc.preferred_kernelspec(),
        "cellCount": total,
        "shownRange": if total == 0 { Value::Null } else { json!([start, end]) },
        "outOfOrderCells": out_of_order_cells(doc),
        "importsInNotebook": all_imports,
        "cells": cells_view,
    })
}

fn is_ident_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}

fn is_ident_continue(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

fn is_python_keyword(word: &str) -> bool {
    matches!(
        word,
        "False"
            | "None"
            | "True"
            | "and"
            | "as"
            | "assert"
            | "async"
            | "await"
            | "break"
            | "class"
            | "continue"
            | "def"
            | "del"
            | "elif"
            | "else"
            | "except"
            | "finally"
            | "for"
            | "from"
            | "global"
            | "if"
            | "import"
            | "in"
            | "is"
            | "lambda"
            | "nonlocal"
            | "not"
            | "or"
            | "pass"
            | "raise"
            | "return"
            | "try"
            | "while"
            | "with"
            | "yield"
    )
}

/// Retire commentaires `# ...` et contenu des chaînes littérales d'une ligne
/// afin de ne pas confondre un mot dans une chaîne avec une variable lue.
fn strip_comments_and_strings(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();
    let mut in_quote: Option<char> = None;
    while let Some(ch) = chars.next() {
        if let Some(q) = in_quote {
            if ch == '\\' {
                chars.next();
            } else if ch == q {
                in_quote = None;
                out.push(' ');
            }
            continue;
        }
        if ch == '#' {
            break;
        }
        if ch == '\'' || ch == '"' {
            in_quote = Some(ch);
            out.push(' ');
            continue;
        }
        out.push(ch);
    }
    out
}

/// Extrait les imports Python / R / Julia d'une cellule de code.
pub fn extract_imports(source: &str, cell_1based: usize) -> Vec<ImportBinding> {
    let mut out = Vec::new();
    let mut joined_lines: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut paren_depth: i32 = 0;

    for raw_line in source.lines() {
        let clean = strip_comments_and_strings(raw_line);
        let trimmed = clean.trim();
        if trimmed.is_empty() && paren_depth == 0 {
            continue;
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(trimmed);
        for c in trimmed.chars() {
            if c == '(' {
                paren_depth += 1;
            } else if c == ')' {
                paren_depth = (paren_depth - 1).max(0);
            }
        }
        if paren_depth == 0 && !trimmed.ends_with('\\') {
            joined_lines.push(std::mem::take(&mut current));
        }
    }
    if !current.trim().is_empty() {
        joined_lines.push(current);
    }

    for stmt in joined_lines {
        let s = stmt.trim().trim_end_matches(';');
        if let Some(rest) = s.strip_prefix("import ") {
            for part in rest.split(',') {
                let item = part.trim();
                if item.is_empty() {
                    continue;
                }
                let alias = if let Some((_, a)) = item.split_once(" as ") {
                    a.trim()
                } else {
                    item.split('.').next().unwrap_or(item).trim()
                };
                if is_valid_ident(alias) {
                    out.push(ImportBinding {
                        cell: cell_1based,
                        alias: alias.to_string(),
                        statement: s.to_string(),
                    });
                }
            }
        } else if let Some(rest) = s.strip_prefix("from ") {
            if let Some((_, imported)) = rest.split_once(" import ") {
                let inner = imported.trim().trim_start_matches('(').trim_end_matches(')');
                for part in inner.split(',') {
                    let item = part.trim();
                    if item.is_empty() || item == "*" {
                        continue;
                    }
                    let alias = if let Some((_, a)) = item.split_once(" as ") {
                        a.trim()
                    } else {
                        item
                    };
                    if is_valid_ident(alias) {
                        out.push(ImportBinding {
                            cell: cell_1based,
                            alias: alias.to_string(),
                            statement: s.to_string(),
                        });
                    }
                }
            }
        } else if let Some(rest) = s.strip_prefix("library(").or_else(|| s.strip_prefix("require("))
        {
            if let Some(pkg) = rest.split(')').next() {
                let clean = pkg.trim().trim_matches(['"', '\'']);
                if !clean.is_empty() {
                    out.push(ImportBinding {
                        cell: cell_1based,
                        alias: clean.to_string(),
                        statement: s.to_string(),
                    });
                }
            }
        } else if let Some(rest) = s.strip_prefix("using ") {
            for part in rest.split(',') {
                let pkg = part.split(':').next().unwrap_or(part).trim();
                if is_valid_ident(pkg) {
                    out.push(ImportBinding {
                        cell: cell_1based,
                        alias: pkg.to_string(),
                        statement: s.to_string(),
                    });
                }
            }
        }
    }
    out
}

fn is_valid_ident(s: &str) -> bool {
    let mut chars = s.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    is_ident_start(first) && chars.all(is_ident_continue) && !is_python_keyword(s)
}

/// Extrait les symboles définis (`x = ...`, `def f`, `class C`, `with ... as m:`) dans une cellule.
pub fn extract_definitions(source: &str) -> BTreeSet<String> {
    let mut defs = BTreeSet::new();
    for raw_line in source.lines() {
        let clean = strip_comments_and_strings(raw_line);
        let trimmed = clean.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(rest) = trimmed
            .strip_prefix("def ")
            .or_else(|| trimmed.strip_prefix("async def "))
            .or_else(|| trimmed.strip_prefix("class "))
        {
            let name: String = rest.chars().take_while(|&c| is_ident_continue(c)).collect();
            if is_valid_ident(&name) {
                defs.insert(name);
            }
            continue;
        }
        // `with ... as alias:`
        if trimmed.starts_with("with ") && trimmed.ends_with(':') {
            if let Some((_, after_as)) = trimmed[..trimmed.len() - 1].rsplit_once(" as ") {
                let alias = after_as.trim();
                if is_valid_ident(alias) {
                    defs.insert(alias.to_string());
                }
            }
        }
        // Affectation `lhs = rhs` (hors `==`, `!=`, `<=`, `>=`, appels mot-clé indentés dans parenthèses)
        // On ne retient que les affectations de niveau 0 ou 4 espaces (bloc `with`).
        let indent = clean.chars().take_while(|c| *c == ' ').count();
        if indent <= 8 {
            if let Some(eq_pos) = find_assignment_equals(trimmed) {
                let lhs = trimmed[..eq_pos].trim();
                for part in lhs.trim_matches(['(', ')', '[', ']']).split(',') {
                    let candidate = part.split(':').next().unwrap_or(part).trim();
                    if is_valid_ident(candidate) {
                        defs.insert(candidate.to_string());
                    }
                }
            }
        }
    }
    defs
}

fn find_assignment_equals(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut paren = 0i32;
    let mut bracket = 0i32;
    for i in 0..bytes.len() {
        match bytes[i] {
            b'(' => paren += 1,
            b')' => paren = (paren - 1).max(0),
            b'[' => bracket += 1,
            b']' => bracket = (bracket - 1).max(0),
            b'=' if paren == 0 && bracket == 0 => {
                let prev = if i > 0 { bytes[i - 1] } else { b' ' };
                let next = if i + 1 < bytes.len() {
                    bytes[i + 1]
                } else {
                    b' '
                };
                if next == b'=' || matches!(prev, b'=' | b'!' | b'<' | b'>') {
                    return None;
                }
                return Some(i);
            }
            _ => {}
        }
    }
    None
}

/// Tous les identifiants référencés dans le code (hors attributs `.attr`).
pub fn extract_referenced_identifiers(source: &str) -> BTreeSet<String> {
    let mut refs = BTreeSet::new();
    for raw_line in source.lines() {
        let clean = strip_comments_and_strings(raw_line);
        let bytes = clean.as_bytes();
        let mut i = 0;
        while i < bytes.len() {
            let ch = bytes[i] as char;
            if is_ident_start(ch) {
                let prev_dot = i > 0 && bytes[i - 1] == b'.';
                let start = i;
                i += 1;
                while i < bytes.len() && is_ident_continue(bytes[i] as char) {
                    i += 1;
                }
                if !prev_dot {
                    let word = &clean[start..i];
                    if !is_python_keyword(word) {
                        refs.insert(word.to_string());
                    }
                }
            } else {
                i += 1;
            }
        }
    }
    refs
}

/// Analyse complète de l'amont et de l'aval autour de `target_idx` (0-based).
pub fn analyze_neighborhood(doc: &NotebookDocument, target_idx: usize) -> Option<CellNeighborhood> {
    let target = doc.cells.get(target_idx)?;
    let mut upstream_imports = Vec::new();
    let mut upstream_defined = BTreeSet::new();

    for (i, cell) in doc.cells[..target_idx].iter().enumerate() {
        if cell.cell_type != CellKind::Code {
            continue;
        }
        let imps = extract_imports(&cell.source, i + 1);
        for imp in &imps {
            upstream_defined.insert(imp.alias.clone());
        }
        upstream_imports.extend(imps);
        upstream_defined.extend(extract_definitions(&cell.source));
    }

    let target_defines: Vec<String> = if target.cell_type == CellKind::Code {
        let mut d = extract_definitions(&target.source);
        for imp in extract_imports(&target.source, target_idx + 1) {
            d.insert(imp.alias);
        }
        d.into_iter().collect()
    } else {
        Vec::new()
    };

    let mut consumers_map: BTreeMap<String, Vec<usize>> = BTreeMap::new();
    if !target_defines.is_empty() && target_idx + 1 < doc.cells.len() {
        for (offset, later) in doc.cells[(target_idx + 1)..].iter().enumerate() {
            if later.cell_type != CellKind::Code {
                continue;
            }
            let later_cell_num = target_idx + 2 + offset;
            let refs = extract_referenced_identifiers(&later.source);
            for sym in &target_defines {
                if refs.contains(sym) {
                    consumers_map
                        .entry(sym.clone())
                        .or_default()
                        .push(later_cell_num);
                }
            }
        }
    }

    let downstream_consumers = consumers_map
        .into_iter()
        .map(|(symbol, used_in_cells)| DownstreamConsumer {
            symbol,
            used_in_cells,
        })
        .collect();

    Some(CellNeighborhood {
        target_cell: target_idx + 1,
        target_id: target.id.clone(),
        upstream_imports,
        upstream_defined: upstream_defined.into_iter().collect(),
        target_defines,
        downstream_consumers,
    })
}

/// Vérifie qu'un code proposé sur `target_idx` ne ré-importe pas un module déjà
/// chargé en amont et ne supprime pas une variable attendue par les cellules en aval.
pub fn validate_proposed_code(
    doc: &NotebookDocument,
    target_idx: usize,
    proposed_code: &str,
) -> EditDiagnostics {
    let Some(nbh) = analyze_neighborhood(doc, target_idx) else {
        return EditDiagnostics::default();
    };
    let upstream_by_alias: BTreeMap<&str, &ImportBinding> = nbh
        .upstream_imports
        .iter()
        .map(|b| (b.alias.as_str(), b))
        .collect();

    let mut redundant_imports = Vec::new();
    for imp in extract_imports(proposed_code, target_idx + 1) {
        if let Some(prev) = upstream_by_alias.get(imp.alias.as_str()) {
            redundant_imports.push(format!(
                "`{}` est déjà importé dans la cellule [{}] (`{}`)",
                imp.alias, prev.cell, prev.statement
            ));
        }
    }

    let mut new_defs = extract_definitions(proposed_code);
    for imp in extract_imports(proposed_code, target_idx + 1) {
        new_defs.insert(imp.alias);
    }

    let mut broken_downstream_symbols = Vec::new();
    for consumer in nbh.downstream_consumers {
        if !new_defs.contains(&consumer.symbol) {
            broken_downstream_symbols.push(consumer);
        }
    }

    EditDiagnostics {
        redundant_imports,
        broken_downstream_symbols,
    }
}

/// Diff ligne à ligne par plus longue sous-séquence commune (LCS).
pub fn line_diff(old: &str, new: &str) -> (Vec<DiffLine>, usize, usize) {
    let a: Vec<&str> = old.lines().collect();
    let b: Vec<&str> = new.lines().collect();
    let n = a.len();
    let m = b.len();

    // Garde-fou quadratique sur de très grosses cellules (> 600 lignes).
    if n * m > 360_000 {
        let mut lines = Vec::with_capacity(n + m);
        for l in &a {
            lines.push(DiffLine {
                kind: "del".into(),
                text: (*l).to_string(),
            });
        }
        for l in &b {
            lines.push(DiffLine {
                kind: "add".into(),
                text: (*l).to_string(),
            });
        }
        return (lines, m, n);
    }

    let mut dp = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[i][j] = if a[i] == b[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }

    let mut out = Vec::new();
    let mut added = 0usize;
    let mut removed = 0usize;
    let (mut i, mut j) = (0, 0);
    while i < n && j < m {
        if a[i] == b[j] {
            out.push(DiffLine {
                kind: "same".into(),
                text: a[i].to_string(),
            });
            i += 1;
            j += 1;
        } else if dp[i + 1][j] >= dp[i][j + 1] {
            out.push(DiffLine {
                kind: "del".into(),
                text: a[i].to_string(),
            });
            removed += 1;
            i += 1;
        } else {
            out.push(DiffLine {
                kind: "add".into(),
                text: b[j].to_string(),
            });
            added += 1;
            j += 1;
        }
    }
    while i < n {
        out.push(DiffLine {
            kind: "del".into(),
            text: a[i].to_string(),
        });
        removed += 1;
        i += 1;
    }
    while j < m {
        out.push(DiffLine {
            kind: "add".into(),
            text: b[j].to_string(),
        });
        added += 1;
        j += 1;
    }
    (out, added, removed)
}

fn outputs_fingerprint(cell: &NotebookCell) -> String {
    let summaries: Vec<Value> = cell.outputs.iter().map(compact_output_summary).collect();
    serde_json::to_string(&summaries).unwrap_or_default()
}

/// Diff sémantique cellule par cellule entre deux versions d'un `.ipynb` (ex. `HEAD` vs disque).
pub fn diff_notebooks(base: &NotebookDocument, current: &NotebookDocument) -> Vec<CellDiffEntry> {
    let base_by_id: BTreeMap<&str, (usize, &NotebookCell)> = base
        .cells
        .iter()
        .enumerate()
        .map(|(i, c)| (c.id.as_str(), (i + 1, c)))
        .collect();
    let curr_ids: BTreeSet<&str> = current.cells.iter().map(|c| c.id.as_str()).collect();

    let mut entries = Vec::new();

    for (i, cell) in base.cells.iter().enumerate() {
        if !curr_ids.contains(cell.id.as_str()) {
            let (lines, added, removed) = line_diff(&cell.source, "");
            entries.push(CellDiffEntry {
                cell_id: cell.id.clone(),
                index: None,
                base_index: Some(i + 1),
                cell_type: cell.cell_type,
                title: cell.inferred_title(),
                status: "removed".into(),
                added_lines: added,
                removed_lines: removed,
                outputs_changed: false,
                lines,
            });
        }
    }

    for (i, cell) in current.cells.iter().enumerate() {
        match base_by_id.get(cell.id.as_str()) {
            Some((base_idx, old_cell)) => {
                let code_changed = old_cell.source != cell.source || old_cell.cell_type != cell.cell_type;
                let outputs_changed = outputs_fingerprint(old_cell) != outputs_fingerprint(cell);
                if code_changed || outputs_changed {
                    let (lines, added, removed) = line_diff(&old_cell.source, &cell.source);
                    entries.push(CellDiffEntry {
                        cell_id: cell.id.clone(),
                        index: Some(i + 1),
                        base_index: Some(*base_idx),
                        cell_type: cell.cell_type,
                        title: cell.inferred_title(),
                        status: "modified".into(),
                        added_lines: added,
                        removed_lines: removed,
                        outputs_changed,
                        lines,
                    });
                }
            }
            None => {
                let (lines, added, removed) = line_diff("", &cell.source);
                entries.push(CellDiffEntry {
                    cell_id: cell.id.clone(),
                    index: Some(i + 1),
                    base_index: None,
                    cell_type: cell.cell_type,
                    title: cell.inferred_title(),
                    status: "added".into(),
                    added_lines: added,
                    removed_lines: removed,
                    outputs_changed: !cell.outputs.is_empty(),
                    lines,
                });
            }
        }
    }

    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_notebook() -> NotebookDocument {
        let raw = json!({
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {},
            "cells": [
                {
                    "id": "c1",
                    "cell_type": "code",
                    "execution_count": 1,
                    "source": [
                        "import polars as pl, numpy as np\n",
                        "import pymc as pm, arviz as az\n",
                        "panel_m80 = pl.read_parquet('data/panel.parquet')\n"
                    ],
                    "outputs": []
                },
                {
                    "id": "c2",
                    "cell_type": "code",
                    "execution_count": 2,
                    "source": [
                        "with pm.Model() as m_mundlak:\n",
                        "    beta_intra = pm.Normal('beta_intra', 0, 0.05)\n",
                        "    idata_mundlak = pm.sample(1000)\n"
                    ],
                    "outputs": [
                        {
                            "output_type": "display_data",
                            "metadata": {},
                            "data": { "image/png": "iVBORw0KGgoAAAANSUhEUgAAAAUA" }
                        }
                    ]
                },
                {
                    "id": "c3",
                    "cell_type": "code",
                    "execution_count": 3,
                    "source": [
                        "draws = idata_mundlak.posterior['beta_intra'].values\n",
                        "print(np.mean(draws))\n"
                    ],
                    "outputs": []
                }
            ]
        });
        NotebookDocument::parse_str(&raw.to_string()).unwrap()
    }

    #[test]
    fn projection_strips_base64_and_lists_imports() {
        let doc = sample_notebook();
        let proj = project_for_agent(&doc, None, None, true);
        let text = proj.to_string();
        assert!(!text.contains("iVBORw0KGgo"), "le base64 doit être retiré : {text}");
        assert!(text.contains("image/png"), "la présence de la figure reste signalée");
        let imports = proj["importsInNotebook"].as_array().unwrap();
        assert!(imports.iter().any(|i| i["alias"] == "pm" && i["cell"] == 1));
    }

    #[test]
    fn detects_redundant_upstream_imports_and_broken_downstream_variables() {
        let doc = sample_notebook();
        let bad_edit = "import pymc as pm\nwith pm.Model() as m_mundlak:\n    renamed_trace = pm.sample(1000)\n";
        let diag = validate_proposed_code(&doc, 1, bad_edit);
        assert_eq!(diag.redundant_imports.len(), 1);
        assert!(diag.redundant_imports[0].contains("pm"));
        assert_eq!(diag.broken_downstream_symbols.len(), 1);
        assert_eq!(diag.broken_downstream_symbols[0].symbol, "idata_mundlak");
        assert_eq!(diag.broken_downstream_symbols[0].used_in_cells, vec![3]);

        let clean_edit = "with pm.Model() as m_mundlak:\n    nu = pm.Gamma('nu', 2, 0.1)\n    idata_mundlak = pm.sample(2000)\n";
        let ok_diag = validate_proposed_code(&doc, 1, clean_edit);
        assert!(ok_diag.redundant_imports.is_empty());
        assert!(ok_diag.broken_downstream_symbols.is_empty());
    }
}
