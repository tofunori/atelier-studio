//! Propositions de révisions par cellule soumises par un agent du chat.
//!
//! Comme pour `atelier_docx`, une retouche proposée par l'agent via
//! `atelier_notebook` ne réécrit pas silencieusement le cahier de
//! l'utilisateur : elle crée une proposition ancrée sur la cellule (`Edit`,
//! `InsertAfter`, `Delete`) avec son mini-diff ligne à ligne et son diagnostic
//! amont/aval. L'utilisateur l'accepte (avec ou sans exécution immédiate) ou
//! l'écarte dans l'interface.

use crate::context::{
    analyze_neighborhood, line_diff, validate_proposed_code, DiffLine, EditDiagnostics,
};
use crate::nbformat::{make_cell_id, sha256_hex, CellKind, NotebookCell, NotebookDocument};
use serde::{Deserialize, Serialize};
use serde_json::Map;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProposalKind {
    Edit,
    InsertAfter,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellProposal {
    pub id: String,
    pub kind: ProposalKind,
    /// `id` de la cellule ciblée (ou `""` pour une insertion en tête de cahier).
    pub target_cell_id: String,
    pub cell_type: CellKind,
    pub original_source: String,
    pub proposed_source: String,
    pub purpose: String,
    pub author: String,
    pub created_at: String,
    pub added_lines: usize,
    pub removed_lines: usize,
    pub diff_lines: Vec<DiffLine>,
    pub diagnostics: EditDiagnostics,
    pub upstream_summary: String,
    pub downstream_summary: String,
}

impl CellProposal {
    pub fn build_edit(
        doc: &NotebookDocument,
        cell_idx: usize,
        proposed_source: String,
        purpose: String,
        author: String,
    ) -> Option<Self> {
        let cell = doc.cells.get(cell_idx)?;
        let (diff_lines, added_lines, removed_lines) = line_diff(&cell.source, &proposed_source);
        let diagnostics = if cell.cell_type == CellKind::Code {
            validate_proposed_code(doc, cell_idx, &proposed_source)
        } else {
            EditDiagnostics::default()
        };
        let (upstream_summary, downstream_summary) = summarize_context(doc, cell_idx, &diagnostics);
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let id = format!(
            "prop-{}",
            &sha256_hex(format!("{}:{}:{now}", cell.id, proposed_source).as_bytes())[..10]
        );
        Some(Self {
            id,
            kind: ProposalKind::Edit,
            target_cell_id: cell.id.clone(),
            cell_type: cell.cell_type,
            original_source: cell.source.clone(),
            proposed_source,
            purpose,
            author,
            created_at: now,
            added_lines,
            removed_lines,
            diff_lines,
            diagnostics,
            upstream_summary,
            downstream_summary,
        })
    }

    pub fn build_insert(
        doc: &NotebookDocument,
        after_idx: Option<usize>,
        cell_type: CellKind,
        proposed_source: String,
        purpose: String,
        author: String,
    ) -> Self {
        let target_cell_id = after_idx
            .and_then(|i| doc.cells.get(i))
            .map(|c| c.id.clone())
            .unwrap_or_default();
        let (diff_lines, added_lines, removed_lines) = line_diff("", &proposed_source);
        let virtual_idx = after_idx.map(|i| i + 1).unwrap_or(0);
        let diagnostics = if cell_type == CellKind::Code && !doc.cells.is_empty() {
            // Vérifie les imports déjà présents avant le point d'insertion.
            let check_idx = after_idx.unwrap_or(0).min(doc.cells.len() - 1);
            let mut d = validate_proposed_code(doc, check_idx, &proposed_source);
            d.broken_downstream_symbols.clear();
            d
        } else {
            EditDiagnostics::default()
        };
        let upstream_count = virtual_idx.min(doc.cells.len());
        let upstream_summary = if upstream_count == 0 {
            "Insertion en tête du cahier".into()
        } else {
            format!("Amont [1..{upstream_count}] vérifié")
        };
        let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
        let id = format!(
            "prop-{}",
            &sha256_hex(format!("ins:{target_cell_id}:{proposed_source}:{now}").as_bytes())[..10]
        );
        Self {
            id,
            kind: ProposalKind::InsertAfter,
            target_cell_id,
            cell_type,
            original_source: String::new(),
            proposed_source,
            purpose,
            author,
            created_at: now,
            added_lines,
            removed_lines,
            diff_lines,
            diagnostics,
            upstream_summary,
            downstream_summary: "Nouvelle cellule".into(),
        }
    }

    /// Applique la proposition au document en mémoire et rend l'identifiant de la cellule affectée.
    pub fn apply_to(&self, doc: &mut NotebookDocument) -> Option<String> {
        match self.kind {
            ProposalKind::Edit => {
                let idx = doc.cells.iter().position(|c| c.id == self.target_cell_id)?;
                let cell = &mut doc.cells[idx];
                cell.source = self.proposed_source.clone();
                if !self.purpose.trim().is_empty() {
                    let atelier_meta = cell
                        .metadata
                        .entry("atelier".to_string())
                        .or_insert_with(|| serde_json::json!({}));
                    if let Some(obj) = atelier_meta.as_object_mut() {
                        obj.insert("purpose".into(), serde_json::json!(self.purpose));
                    }
                }
                Some(cell.id.clone())
            }
            ProposalKind::InsertAfter => {
                let insert_at = if self.target_cell_id.is_empty() {
                    0
                } else {
                    doc.cells
                        .iter()
                        .position(|c| c.id == self.target_cell_id)
                        .map(|i| i + 1)
                        .unwrap_or(doc.cells.len())
                };
                let new_id = make_cell_id(&format!("{}:{}", self.id, self.proposed_source), insert_at);
                let mut metadata = Map::new();
                if !self.purpose.trim().is_empty() {
                    metadata.insert(
                        "atelier".into(),
                        serde_json::json!({ "purpose": self.purpose }),
                    );
                }
                doc.cells.insert(
                    insert_at,
                    NotebookCell {
                        id: new_id.clone(),
                        cell_type: self.cell_type,
                        source: self.proposed_source.clone(),
                        metadata,
                        execution_count: None,
                        outputs: Vec::new(),
                        extra: Map::new(),
                    },
                );
                Some(new_id)
            }
            ProposalKind::Delete => {
                let idx = doc.cells.iter().position(|c| c.id == self.target_cell_id)?;
                let removed = doc.cells.remove(idx);
                Some(removed.id)
            }
        }
    }
}

fn summarize_context(
    doc: &NotebookDocument,
    cell_idx: usize,
    diag: &EditDiagnostics,
) -> (String, String) {
    let Some(nbh) = analyze_neighborhood(doc, cell_idx) else {
        return (String::new(), String::new());
    };
    let upstream = if cell_idx == 0 {
        "Première cellule du cahier".into()
    } else if diag.redundant_imports.is_empty() {
        if nbh.upstream_imports.is_empty() {
            format!("Amont [1..{cell_idx}] vérifié")
        } else {
            format!("Amont [1..{cell_idx}] pris en compte (aucun import redondant)")
        }
    } else {
        diag.redundant_imports.join(" · ")
    };

    let downstream = if cell_idx + 1 >= doc.cells.len() {
        "Dernière cellule du cahier".into()
    } else if diag.broken_downstream_symbols.is_empty() {
        if nbh.downstream_consumers.is_empty() {
            format!("Aval [{}..{}] intact", cell_idx + 2, doc.cells.len())
        } else {
            let names: Vec<&str> = nbh
                .downstream_consumers
                .iter()
                .take(3)
                .map(|c| c.symbol.as_str())
                .collect();
            format!("Aval vérifié ({} préservé)", names.join(", "))
        }
    } else {
        let broken: Vec<String> = diag
            .broken_downstream_symbols
            .iter()
            .map(|c| format!("`{}` lu en {:?}", c.symbol, c.used_in_cells))
            .collect();
        format!("Attention aval : {}", broken.join(", "))
    };

    (upstream, downstream)
}
