//! Aperçu d'un cahier Jupyter (.ipynb) pour la carte de la galerie : la
//! première figure PNG produite par le cahier, sinon le début de ses cellules
//! en texte lisible (pas le JSON brut). Pur Rust, aucun outil externe : même
//! comportement sur macOS et Linux.

use base64::Engine;
use serde_json::Value;

/// Texte d'une source nbformat : chaîne, ou liste de lignes.
fn joined(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Array(parts) => parts.iter().filter_map(Value::as_str).collect(),
        _ => String::new(),
    }
}

/// Première image PNG des sorties (dans l'ordre des cellules), décodée.
pub fn first_png(raw: &str) -> Option<Vec<u8>> {
    let doc: Value = serde_json::from_str(raw).ok()?;
    for cell in doc.get("cells")?.as_array()? {
        let Some(outputs) = cell.get("outputs").and_then(Value::as_array) else {
            continue;
        };
        for out in outputs {
            let Some(png) = out.get("data").and_then(|d| d.get("image/png")) else {
                continue;
            };
            let b64: String = joined(png).chars().filter(|c| !c.is_whitespace()).collect();
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                if bytes.starts_with(b"\x89PNG") {
                    return Some(bytes);
                }
            }
        }
    }
    None
}

/// Début lisible du cahier : sources des cellules, séparées par une ligne
/// vide. Un fichier illisible comme cahier est rendu tel quel.
pub fn preview_text(raw: &str) -> String {
    let Ok(doc) = serde_json::from_str::<Value>(raw) else {
        return raw.to_string();
    };
    let Some(cells) = doc.get("cells").and_then(Value::as_array) else {
        return raw.to_string();
    };
    cells
        .iter()
        .filter_map(|c| c.get("source").map(joined))
        .map(|s| s.trim_end().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PNG_1PX: &str = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    fn nb(cells: Value) -> String {
        json!({"nbformat": 4, "nbformat_minor": 5, "metadata": {}, "cells": cells}).to_string()
    }

    #[test]
    fn first_png_is_found_after_text_outputs() {
        // base64 coupé en lignes, comme l'écrit Jupyter
        let (a, b) = PNG_1PX.split_at(20);
        let raw = nb(json!([
            {"cell_type": "markdown", "source": ["# Titre"]},
            {"cell_type": "code", "source": "print(1)", "outputs": [{"output_type": "stream", "text": "1\n"}]},
            {"cell_type": "code", "source": "plt.plot()", "outputs": [
                {"output_type": "display_data", "data": {"image/png": [format!("{a}\n"), b], "text/plain": "<Figure>"}}
            ]}
        ]));
        let png = first_png(&raw).expect("figure");
        assert!(png.starts_with(b"\x89PNG"));
    }

    #[test]
    fn notebook_without_figure_has_none() {
        let raw = nb(json!([{"cell_type": "code", "source": "x = 1", "outputs": []}]));
        assert!(first_png(&raw).is_none());
        assert!(first_png("pas du json").is_none());
    }

    #[test]
    fn preview_text_reads_cells_not_json() {
        let raw = nb(json!([
            {"cell_type": "markdown", "source": ["# Tendances d'albédo\n", "MODIS"]},
            {"cell_type": "code", "source": "", "outputs": []},
            {"cell_type": "code", "source": "import pandas as pd\n", "outputs": []}
        ]));
        assert_eq!(preview_text(&raw), "# Tendances d'albédo\nMODIS\n\nimport pandas as pd");
        assert_eq!(preview_text("brut"), "brut");
    }
}
