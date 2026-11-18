//! Lecture, manipulation et réécriture sans perte des cahiers `.ipynb`
//! (`nbformat` v4.0 à v4.5).
//!
//! Un cahier existant peut contenir des métadonnées d'outils tiers (Jupytext,
//! Colab, Quarto, widgets, tags de cellules). Seuls les champs structurés sont
//! interprétés ; toutes les clés inconnues (`metadata`, champs additionnels)
//! sont conservées telles quelles lors de l'enregistrement.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum NotebookError {
    #[error("lecture impossible : {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON .ipynb invalide : {0}")]
    Json(#[from] serde_json::Error),
    #[error("version nbformat non supportée : {0} (nbformat v4 attendu)")]
    UnsupportedFormat(i64),
    #[error("{0}")]
    Invalid(String),
}

pub type Result<T> = std::result::Result<T, NotebookError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CellKind {
    Code,
    Markdown,
    Raw,
}

impl CellKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Code => "code",
            Self::Markdown => "markdown",
            Self::Raw => "raw",
        }
    }
}

/// Sortie normalisée d'une cellule de code Jupyter.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "output_type", rename_all = "snake_case")]
pub enum CellOutput {
    Stream {
        name: String,
        text: String,
    },
    ExecuteResult {
        #[serde(skip_serializing_if = "Option::is_none")]
        execution_count: Option<u64>,
        data: Map<String, Value>,
        #[serde(default)]
        metadata: Map<String, Value>,
    },
    DisplayData {
        data: Map<String, Value>,
        #[serde(default)]
        metadata: Map<String, Value>,
        /// Identifiant transitoire (`transient.display_id` sur `iopub`) pour
        /// mettre à jour une barre de progression en place (`update_display_data`).
        #[serde(skip)]
        display_id: Option<String>,
    },
    Error {
        ename: String,
        evalue: String,
        traceback: Vec<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookCell {
    pub id: String,
    pub cell_type: CellKind,
    pub source: String,
    #[serde(default)]
    pub metadata: Map<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_count: Option<u64>,
    #[serde(default)]
    pub outputs: Vec<CellOutput>,
    /// Clés additionnelles éventuelles du JSON d'origine (`attachments`, etc.).
    #[serde(skip)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotebookDocument {
    pub nbformat: i64,
    pub nbformat_minor: i64,
    pub metadata: Map<String, Value>,
    pub cells: Vec<NotebookCell>,
}

/// Vue envoyée à l'interface React (légère, normalisée, avec révision SHA-256).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiCell {
    /// Numéro 1-based dans le cahier.
    pub index: usize,
    pub id: String,
    pub cell_type: CellKind,
    pub source: String,
    pub execution_count: Option<u64>,
    pub title: Option<String>,
    pub outputs: Vec<UiOutput>,
}

#[derive(Debug, Clone, Serialize)]
// `rename_all_fields` : l'interface lit `textPlain`, `imagePng`… (sans lui,
// les champs des variantes restaient en snake_case et rien ne s'affichait).
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum UiOutput {
    Stream {
        name: String,
        text: String,
    },
    Data {
        execution_count: Option<u64>,
        text_plain: Option<String>,
        text_html: Option<String>,
        text_markdown: Option<String>,
        text_latex: Option<String>,
        image_svg: Option<String>,
        image_png: Option<String>,
        image_jpeg: Option<String>,
        application_json: Option<Value>,
        display_id: Option<String>,
    },
    Error {
        ename: String,
        evalue: String,
        traceback: String,
    },
}

/// Retire les séquences ANSI CSI (`\x1b[...m`, curseur, etc.) des tracebacks et flux.
pub fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&c) = chars.peek() {
                    chars.next();
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
                continue;
            }
        }
        out.push(ch);
    }
    out
}

/// Convertit un champ Jupyter `source` ou `text` (`"abc"` ou `["a\n", "b"]`) en `String`.
pub fn multiline_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Array(lines) => {
            let mut out = String::new();
            for item in lines {
                if let Value::String(s) = item {
                    out.push_str(s);
                }
            }
            out
        }
        _ => String::new(),
    }
}

/// Sérialise un texte en tableau de lignes `nbformat` (`split_inclusive('\n')`).
pub fn string_to_multiline(text: &str) -> Value {
    if text.is_empty() {
        return json!([]);
    }
    let lines: Vec<String> = text.split_inclusive('\n').map(str::to_string).collect();
    json!(lines)
}

/// Empreinte courte déterministe pour identifier une révision ou générer un `cell.id`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub fn make_cell_id(seed: &str, index: usize) -> String {
    let digest = sha256_hex(format!("{seed}:{index}").as_bytes());
    format!("cell-{}", &digest[..12])
}

fn parse_output(raw: &Value) -> Option<CellOutput> {
    let obj = raw.as_object()?;
    match obj.get("output_type").and_then(Value::as_str)? {
        "stream" => Some(CellOutput::Stream {
            name: obj
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("stdout")
                .to_string(),
            text: obj.get("text").map(multiline_to_string).unwrap_or_default(),
        }),
        "execute_result" => Some(CellOutput::ExecuteResult {
            execution_count: obj.get("execution_count").and_then(Value::as_u64),
            data: normalize_mime_bundle(obj.get("data")),
            metadata: obj
                .get("metadata")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
        }),
        "display_data" => Some(CellOutput::DisplayData {
            data: normalize_mime_bundle(obj.get("data")),
            metadata: obj
                .get("metadata")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default(),
            display_id: obj
                .get("transient")
                .and_then(|t| t.get("display_id"))
                .and_then(Value::as_str)
                .map(str::to_string),
        }),
        "error" => {
            let tb = obj
                .get("traceback")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            Some(CellOutput::Error {
                ename: obj
                    .get("ename")
                    .and_then(Value::as_str)
                    .unwrap_or("Error")
                    .to_string(),
                evalue: obj
                    .get("evalue")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                traceback: tb,
            })
        }
        _ => None,
    }
}

/// Normalise un paquet MIME (`text/plain`, `image/svg+xml`, etc. peuvent être des tableaux de lignes dans `.ipynb`).
pub fn normalize_mime_bundle(raw: Option<&Value>) -> Map<String, Value> {
    let Some(obj) = raw.and_then(Value::as_object) else {
        return Map::new();
    };
    let mut out = Map::new();
    for (mime, val) in obj {
        if mime.starts_with("text/") || mime == "image/svg+xml" || mime.starts_with("image/") {
            match val {
                Value::Array(_) => {
                    out.insert(mime.clone(), Value::String(multiline_to_string(val)));
                }
                Value::String(s) => {
                    out.insert(mime.clone(), Value::String(s.clone()));
                }
                other => {
                    out.insert(mime.clone(), other.clone());
                }
            }
        } else {
            out.insert(mime.clone(), val.clone());
        }
    }
    out
}

fn serialize_mime_bundle(bundle: &Map<String, Value>) -> Value {
    let mut out = Map::new();
    for (mime, val) in bundle {
        match val {
            Value::String(s) if mime.starts_with("text/") || mime == "image/svg+xml" => {
                out.insert(mime.clone(), string_to_multiline(s));
            }
            Value::String(s) if mime == "image/png" || mime == "image/jpeg" => {
                out.insert(mime.clone(), Value::String(s.trim().to_string()));
            }
            other => {
                out.insert(mime.clone(), other.clone());
            }
        }
    }
    Value::Object(out)
}

fn serialize_output(output: &CellOutput) -> Value {
    match output {
        CellOutput::Stream { name, text } => json!({
            "output_type": "stream",
            "name": name,
            "text": string_to_multiline(text),
        }),
        CellOutput::ExecuteResult {
            execution_count,
            data,
            metadata,
        } => json!({
            "output_type": "execute_result",
            "execution_count": execution_count,
            "data": serialize_mime_bundle(data),
            "metadata": metadata,
        }),
        CellOutput::DisplayData { data, metadata, .. } => json!({
            "output_type": "display_data",
            "data": serialize_mime_bundle(data),
            "metadata": metadata,
        }),
        CellOutput::Error {
            ename,
            evalue,
            traceback,
        } => json!({
            "output_type": "error",
            "ename": ename,
            "evalue": evalue,
            "traceback": traceback,
        }),
    }
}

impl NotebookCell {
    /// Titre court de la cellule : métadonnée Atelier/Jupyter `title`, ou premier commentaire `# ...` en tête.
    pub fn inferred_title(&self) -> Option<String> {
        if let Some(t) = self
            .metadata
            .get("atelier")
            .and_then(|a| a.get("purpose").or_else(|| a.get("title")))
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
        {
            return Some(t.trim().to_string());
        }
        if let Some(t) = self
            .metadata
            .get("title")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
        {
            return Some(t.trim().to_string());
        }
        if self.cell_type == CellKind::Code {
            if let Some(first) = self.source.lines().find(|l| !l.trim().is_empty()) {
                let trimmed = first.trim();
                if let Some(comment) = trimmed.strip_prefix('#') {
                    let clean = comment.trim_start_matches(['%', ' ', '-']).trim();
                    if !clean.is_empty() && clean.chars().count() <= 90 {
                        return Some(clean.to_string());
                    }
                }
            }
        }
        None
    }

    pub fn to_ui(&self, index: usize) -> UiCell {
        UiCell {
            index,
            id: self.id.clone(),
            cell_type: self.cell_type,
            source: self.source.clone(),
            execution_count: self.execution_count,
            title: self.inferred_title(),
            outputs: self.outputs.iter().map(output_to_ui).collect(),
        }
    }

    /// Applique un événement `iopub` en direct à la liste des sorties de la cellule.
    pub fn apply_iopub_output(&mut self, msg_type: &str, content: &Value, transient: Option<&Value>) {
        match msg_type {
            "stream" => {
                let name = content
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("stdout");
                let chunk = content
                    .get("text")
                    .map(multiline_to_string)
                    .unwrap_or_default();
                if let Some(CellOutput::Stream {
                    name: prev_name,
                    text: prev_text,
                }) = self.outputs.last_mut()
                {
                    if prev_name == name {
                        append_carriage_aware(prev_text, &chunk);
                        return;
                    }
                }
                let mut text = String::new();
                append_carriage_aware(&mut text, &chunk);
                self.outputs.push(CellOutput::Stream {
                    name: name.to_string(),
                    text,
                });
            }
            "display_data" => {
                let data = normalize_mime_bundle(content.get("data"));
                let metadata = content
                    .get("metadata")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                let display_id = transient
                    .and_then(|t| t.get("display_id"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
                self.outputs.push(CellOutput::DisplayData {
                    data,
                    metadata,
                    display_id,
                });
            }
            "update_display_data" => {
                let Some(target_id) = transient
                    .and_then(|t| t.get("display_id"))
                    .and_then(Value::as_str)
                else {
                    return;
                };
                let new_data = normalize_mime_bundle(content.get("data"));
                let new_meta = content
                    .get("metadata")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                let mut updated = false;
                for out in &mut self.outputs {
                    if let CellOutput::DisplayData {
                        data,
                        metadata,
                        display_id: Some(id),
                    } = out
                    {
                        if id == target_id {
                            *data = new_data.clone();
                            *metadata = new_meta.clone();
                            updated = true;
                        }
                    }
                }
                if !updated {
                    self.outputs.push(CellOutput::DisplayData {
                        data: new_data,
                        metadata: new_meta,
                        display_id: Some(target_id.to_string()),
                    });
                }
            }
            "execute_result" => {
                let count = content.get("execution_count").and_then(Value::as_u64);
                if count.is_some() {
                    self.execution_count = count;
                }
                self.outputs.push(CellOutput::ExecuteResult {
                    execution_count: count,
                    data: normalize_mime_bundle(content.get("data")),
                    metadata: content
                        .get("metadata")
                        .and_then(Value::as_object)
                        .cloned()
                        .unwrap_or_default(),
                });
            }
            "clear_output" => {
                self.outputs.clear();
            }
            "error" => {
                let tb = content
                    .get("traceback")
                    .and_then(Value::as_array)
                    .map(|a| {
                        a.iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                self.outputs.push(CellOutput::Error {
                    ename: content
                        .get("ename")
                        .and_then(Value::as_str)
                        .unwrap_or("Error")
                        .to_string(),
                    evalue: content
                        .get("evalue")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    traceback: tb,
                });
            }
            _ => {}
        }
    }
}

/// Gère `\r` des barres de progression texte (`tqdm` sur `stderr`/`stdout`) sans empiler 500 lignes.
fn append_carriage_aware(buf: &mut String, chunk: &str) {
    for ch in chunk.chars() {
        if ch == '\r' {
            // On ne rembobine que si le caractère suivant n'est pas '\n' :
            // on marque la position en effaçant la dernière ligne à l'arrivée du prochain caractère imprimable.
            buf.push('\r');
        } else if ch == '\n' {
            if buf.ends_with('\r') {
                buf.pop();
            }
            buf.push('\n');
        } else {
            if buf.ends_with('\r') {
                buf.pop();
                if let Some(nl) = buf.rfind('\n') {
                    buf.truncate(nl + 1);
                } else {
                    buf.clear();
                }
            }
            buf.push(ch);
        }
    }
}

pub fn output_to_ui(output: &CellOutput) -> UiOutput {
    match output {
        CellOutput::Stream { name, text } => UiOutput::Stream {
            name: name.clone(),
            text: strip_ansi(text),
        },
        CellOutput::ExecuteResult {
            execution_count,
            data,
            ..
        } => mime_to_ui(*execution_count, data, None),
        CellOutput::DisplayData {
            data, display_id, ..
        } => mime_to_ui(None, data, display_id.clone()),
        CellOutput::Error {
            ename,
            evalue,
            traceback,
        } => {
            let joined = if traceback.is_empty() {
                format!("{ename}: {evalue}")
            } else {
                strip_ansi(&traceback.join("\n"))
            };
            UiOutput::Error {
                ename: ename.clone(),
                evalue: strip_ansi(evalue),
                traceback: joined,
            }
        }
    }
}

fn mime_str(data: &Map<String, Value>, key: &str) -> Option<String> {
    data.get(key)
        .map(multiline_to_string)
        .filter(|s| !s.is_empty())
}

fn mime_to_ui(
    execution_count: Option<u64>,
    data: &Map<String, Value>,
    display_id: Option<String>,
) -> UiOutput {
    UiOutput::Data {
        execution_count,
        text_plain: mime_str(data, "text/plain").map(|s| strip_ansi(&s)),
        text_html: mime_str(data, "text/html"),
        text_markdown: mime_str(data, "text/markdown"),
        text_latex: mime_str(data, "text/latex"),
        image_svg: mime_str(data, "image/svg+xml"),
        image_png: mime_str(data, "image/png").map(|s| s.trim().to_string()),
        image_jpeg: mime_str(data, "image/jpeg").map(|s| s.trim().to_string()),
        application_json: data.get("application/json").cloned(),
        display_id,
    }
}

impl NotebookDocument {
    pub fn parse_str(raw: &str) -> Result<Self> {
        let root: Value = serde_json::from_str(raw)?;
        let obj = root
            .as_object()
            .ok_or_else(|| NotebookError::Invalid("racine JSON .ipynb non-objet".into()))?;
        let nbformat = obj.get("nbformat").and_then(Value::as_i64).unwrap_or(4);
        if nbformat != 4 {
            return Err(NotebookError::UnsupportedFormat(nbformat));
        }
        let nbformat_minor = obj
            .get("nbformat_minor")
            .and_then(Value::as_i64)
            .unwrap_or(5)
            .max(5);
        let metadata = obj
            .get("metadata")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let raw_cells = obj
            .get("cells")
            .and_then(Value::as_array)
            .ok_or_else(|| NotebookError::Invalid("champ `cells` manquant dans le .ipynb".into()))?;

        let mut seen_ids = std::collections::HashSet::new();
        let mut cells = Vec::with_capacity(raw_cells.len());
        for (idx, item) in raw_cells.iter().enumerate() {
            let Some(cell_obj) = item.as_object() else {
                continue;
            };
            let cell_type = match cell_obj.get("cell_type").and_then(Value::as_str) {
                Some("markdown") => CellKind::Markdown,
                Some("raw") => CellKind::Raw,
                _ => CellKind::Code,
            };
            let source = cell_obj
                .get("source")
                .map(multiline_to_string)
                .unwrap_or_default();
            let raw_id = cell_obj
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .unwrap_or_else(|| make_cell_id(&source, idx));
            let id = if seen_ids.insert(raw_id.clone()) {
                raw_id
            } else {
                let fallback = make_cell_id(&format!("{raw_id}:{idx}"), idx);
                seen_ids.insert(fallback.clone());
                fallback
            };
            let cell_meta = cell_obj
                .get("metadata")
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            let execution_count = if cell_type == CellKind::Code {
                cell_obj.get("execution_count").and_then(Value::as_u64)
            } else {
                None
            };
            let outputs = if cell_type == CellKind::Code {
                cell_obj
                    .get("outputs")
                    .and_then(Value::as_array)
                    .map(|arr| arr.iter().filter_map(parse_output).collect())
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            let mut extra = Map::new();
            for (k, v) in cell_obj {
                if !matches!(
                    k.as_str(),
                    "id" | "cell_type" | "source" | "metadata" | "execution_count" | "outputs"
                ) {
                    extra.insert(k.clone(), v.clone());
                }
            }
            cells.push(NotebookCell {
                id,
                cell_type,
                source,
                metadata: cell_meta,
                execution_count,
                outputs,
                extra,
            });
        }
        Ok(Self {
            nbformat,
            nbformat_minor,
            metadata,
            cells,
        })
    }

    pub fn open(path: &Path) -> Result<Self> {
        let raw = std::fs::read_to_string(path)?;
        Self::parse_str(&raw)
    }

    pub fn to_ipynb_string(&self) -> Result<String> {
        let cells_json: Vec<Value> = self
            .cells
            .iter()
            .map(|cell| {
                let mut m = Map::new();
                m.insert("cell_type".into(), json!(cell.cell_type.as_str()));
                m.insert("id".into(), json!(cell.id));
                m.insert("metadata".into(), Value::Object(cell.metadata.clone()));
                if cell.cell_type == CellKind::Code {
                    m.insert(
                        "execution_count".into(),
                        match cell.execution_count {
                            Some(n) => json!(n),
                            None => Value::Null,
                        },
                    );
                    m.insert(
                        "outputs".into(),
                        Value::Array(cell.outputs.iter().map(serialize_output).collect()),
                    );
                }
                m.insert("source".into(), string_to_multiline(&cell.source));
                for (k, v) in &cell.extra {
                    m.entry(k.clone()).or_insert_with(|| v.clone());
                }
                Value::Object(m)
            })
            .collect();

        let doc = json!({
            "cells": cells_json,
            "metadata": self.metadata,
            "nbformat": 4,
            "nbformat_minor": self.nbformat_minor.max(5),
        });
        Ok(serde_json::to_string_pretty(&doc)? + "\n")
    }

    /// Écriture atomique sur disque (fichier temporaire voisin + `rename`).
    pub fn save_atomic(&self, path: &Path) -> Result<()> {
        let serialized = self.to_ipynb_string()?;
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("notebook.ipynb");
        let tmp = parent.join(format!(".{name}.{}.tmp", std::process::id()));
        {
            let mut file = std::fs::File::create(&tmp)?;
            file.write_all(serialized.as_bytes())?;
            file.sync_all()?;
        }
        if let Ok(meta) = std::fs::metadata(path) {
            let _ = std::fs::set_permissions(&tmp, meta.permissions());
        }
        if let Err(err) = std::fs::rename(&tmp, path) {
            let _ = std::fs::remove_file(&tmp);
            return Err(NotebookError::Io(err));
        }
        Ok(())
    }

    /// Empreinte de contenu (indépendante du formatage JSON) pour détecter les conflits d'édition.
    pub fn revision(&self) -> String {
        let mut h = Sha256::new();
        for c in &self.cells {
            h.update(c.id.as_bytes());
            h.update(b":");
            h.update(c.cell_type.as_str().as_bytes());
            h.update(b":");
            h.update(c.source.as_bytes());
            h.update(b"\0");
        }
        hex::encode(h.finalize())[..16].to_string()
    }

    /// Langage principal déclaré dans `metadata.kernelspec` ou `metadata.language_info`.
    pub fn language(&self) -> String {
        self.metadata
            .get("kernelspec")
            .and_then(|k| k.get("language"))
            .and_then(Value::as_str)
            .or_else(|| {
                self.metadata
                    .get("language_info")
                    .and_then(|l| l.get("name"))
                    .and_then(Value::as_str)
            })
            .unwrap_or("python")
            .to_lowercase()
    }

    /// Nom du `kernelspec` préféré enregistré dans le `.ipynb`, s'il existe.
    pub fn preferred_kernelspec(&self) -> Option<String> {
        self.metadata
            .get("kernelspec")
            .and_then(|k| k.get("name"))
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .map(str::to_string)
    }

    pub fn find_cell_index(&self, id_or_1based: &str) -> Option<usize> {
        if let Some(pos) = self.cells.iter().position(|c| c.id == id_or_1based) {
            return Some(pos);
        }
        if let Ok(one_based) = id_or_1based.trim_matches(['[', ']']).parse::<usize>() {
            if one_based >= 1 && one_based <= self.cells.len() {
                return Some(one_based - 1);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_preserves_metadata_attachments_and_outputs() {
        let sample = json!({
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {
                "kernelspec": { "name": "pymc-albedo", "display_name": "Python 3.12", "language": "python" },
                "jupytext": { "formats": "ipynb,py:percent" }
            },
            "cells": [
                {
                    "id": "intro-md",
                    "cell_type": "markdown",
                    "metadata": { "tags": ["header"] },
                    "attachments": { "eq.png": { "image/png": "AAAA" } },
                    "source": ["# Modèle Mundlak\n", "Équation principale."]
                },
                {
                    "id": "fit-1",
                    "cell_type": "code",
                    "execution_count": 3,
                    "metadata": { "atelier": { "purpose": "Ajustement bayésien" } },
                    "source": ["import pymc as pm\n", "x = 42"],
                    "outputs": [
                        { "output_type": "stream", "name": "stdout", "text": ["ok\n"] },
                        {
                            "output_type": "execute_result",
                            "execution_count": 3,
                            "metadata": {},
                            "data": { "text/plain": ["42"], "text/html": ["<b>42</b>"] }
                        }
                    ]
                }
            ]
        });
        let doc = NotebookDocument::parse_str(&sample.to_string()).unwrap();
        assert_eq!(doc.language(), "python");
        assert_eq!(doc.preferred_kernelspec().as_deref(), Some("pymc-albedo"));
        assert_eq!(doc.cells.len(), 2);
        assert_eq!(doc.cells[0].source, "# Modèle Mundlak\nÉquation principale.");
        assert_eq!(
            doc.cells[1].inferred_title().as_deref(),
            Some("Ajustement bayésien")
        );

        let saved = doc.to_ipynb_string().unwrap();
        let reparsed: Value = serde_json::from_str(&saved).unwrap();
        assert_eq!(reparsed["metadata"]["jupytext"]["formats"], "ipynb,py:percent");
        assert_eq!(reparsed["cells"][0]["attachments"]["eq.png"]["image/png"], "AAAA");
        assert_eq!(reparsed["cells"][1]["execution_count"], 3);
    }

    #[test]
    fn carriage_return_progress_overwrites_in_place() {
        let mut cell = NotebookCell {
            id: "c1".into(),
            cell_type: CellKind::Code,
            source: String::new(),
            metadata: Map::new(),
            execution_count: None,
            outputs: Vec::new(),
            extra: Map::new(),
        };
        cell.apply_iopub_output("stream", &json!({"name": "stderr", "text": "10%|#   |"}), None);
        cell.apply_iopub_output("stream", &json!({"name": "stderr", "text": "\r50%|#####|"}), None);
        cell.apply_iopub_output("stream", &json!({"name": "stderr", "text": "\r100%|#####|\nDone\n"}), None);
        assert_eq!(cell.outputs.len(), 1);
        if let CellOutput::Stream { text, .. } = &cell.outputs[0] {
            assert_eq!(text, "100%|#####|\nDone\n");
        } else {
            panic!("stream attendu");
        }
    }

    #[test]
    fn strip_ansi_removes_escape_codes() {
        let dirty = "\u{1b}[0;31mValueError\u{1b}[0m: bad \u{1b}[1mshape\u{1b}[0m";
        assert_eq!(strip_ansi(dirty), "ValueError: bad shape");
    }
}

#[cfg(test)]
mod ui_output_serde_tests {
    use super::UiOutput;

    /// L'onglet lit `textPlain`, `imagePng`, `executionCount` : un champ resté
    /// en snake_case n'affichait ni résultat, ni tableau, ni figure.
    #[test]
    fn data_output_fields_are_camel_case() {
        let out = UiOutput::Data {
            execution_count: Some(3),
            text_plain: Some("42".into()),
            text_html: None,
            text_markdown: None,
            text_latex: None,
            image_svg: None,
            image_png: Some("iVBOR".into()),
            image_jpeg: None,
            application_json: None,
            display_id: None,
        };
        let v = serde_json::to_value(&out).unwrap();
        assert_eq!(v["kind"], "data");
        assert_eq!(v["textPlain"], "42");
        assert_eq!(v["imagePng"], "iVBOR");
        assert_eq!(v["executionCount"], 3);
        assert!(v.get("text_plain").is_none());
    }
}
