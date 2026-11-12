//! Révisions de fichiers .tex proposées depuis Claude Desktop (prototype
//! « MCP App »).
//!
//! Claude ne modifie jamais le fichier lui-même : `propose_revision` vérifie
//! que le passage cité existe une seule fois et renvoie la proposition à la
//! vue d'Atelier (`app_view.rs`), qui l'affiche dans la conversation avec
//! Accepter / Refuser. Seul le clic de l'utilisateur dans la vue appelle
//! `apply_revision` (outil réservé à la vue), qui revérifie le passage avant
//! d'écrire. `undo_revision` remet le texte d'origine.
//!
//! Chaque écriture garde une copie du fichier d'avant dans
//! `$ATELIER_APP_DIR/mcp-revisions/` (les 500 dernières), avec son origine :
//! l'historique de l'éditeur (`list_tex_versions`, `load_tex_version`) les
//! relit.

use serde_json::{json, Value};
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const QUOTE_MAX: usize = 20_000;
pub const TEXT_MAX: usize = 20_000;
pub const REASON_MAX: usize = 600;
const BACKUPS_KEPT: usize = 500;
/// Versions rendues par `list_tex_versions`, les plus récentes d'abord.
const VERSIONS_LISTED: usize = 200;
const READ_DEFAULT_LINES: usize = 400;
const READ_MAX_LINES: usize = 2_000;
const OPEN_MAX_LINES: usize = 8_000;
/// Taille maximale d'un fichier ouvert dans l'éditeur de l'artefact.
const EDIT_MAX_BYTES: usize = 2_000_000;

/// Connecteur distant : le fichier doit se trouver sous l'un des dossiers
/// permis (après résolution des liens et des `..`).
pub fn within_roots(raw: &str, roots: &[PathBuf]) -> Result<(), String> {
    let path = abs_file(raw)?;
    let real = path
        .canonicalize()
        .map_err(|e| format!("{raw} : chemin illisible ({e})"))?;
    let allowed = roots.iter().any(|root| {
        root.canonicalize()
            .map(|root| real.starts_with(root))
            .unwrap_or(false)
    });
    if allowed {
        Ok(())
    } else {
        Err(format!(
            "{raw} : hors des dossiers ouverts au connecteur ({})",
            roots
                .iter()
                .map(|r| r.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        ))
    }
}

/// Fichiers texte d'un projet LaTeX que l'éditeur de l'artefact ouvre et
/// enregistre.
pub const EDITABLE_EXT: [&str; 7] = ["tex", "bib", "sty", "cls", "bst", "ltx", "tikz"];

/// Un fichier existant, donné par un chemin absolu (`~/` accepté).
fn abs_file(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("path manquant : le chemin absolu du fichier .tex".into());
    }
    let expanded = expand_home(raw);
    if !expanded.is_absolute() {
        return Err(format!("{raw} : donne le chemin absolu du fichier"));
    }
    if !expanded.is_file() {
        return Err(format!("{raw} : fichier introuvable"));
    }
    Ok(expanded)
}

pub(crate) fn expand_home(raw: &str) -> PathBuf {
    match raw.strip_prefix("~/") {
        Some(rest) => PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(rest),
        None => PathBuf::from(raw),
    }
}

fn has_ext(path: &Path, allowed: &[&str]) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| allowed.iter().any(|a| e.eq_ignore_ascii_case(a)))
}

/// Un fichier .tex existant, donné par un chemin absolu.
fn tex_path(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("path manquant : le chemin absolu du fichier .tex".into());
    }
    let expanded = expand_home(raw);
    if !expanded.is_absolute() {
        return Err(format!("{raw} : donne le chemin absolu du fichier"));
    }
    if !has_ext(&expanded, &["tex"]) {
        return Err(format!(
            "{raw} : seuls les fichiers .tex sont pris en charge"
        ));
    }
    if !expanded.is_file() {
        return Err(format!("{raw} : fichier introuvable"));
    }
    Ok(expanded)
}

/// Un fichier que l'éditeur de l'artefact peut ouvrir : .tex, .bib, styles.
fn editable_path(raw: &str) -> Result<PathBuf, String> {
    let path = abs_file(raw)?;
    if !has_ext(&path, &EDITABLE_EXT) {
        return Err(format!(
            "{} : l'éditeur ouvre les fichiers .tex, .bib et de style",
            raw.trim()
        ));
    }
    Ok(path)
}

pub(crate) fn read(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| format!("{} : lecture impossible ({e})", path.display()))
}

/// Ligne (à partir de 1) de l'octet `at`.
pub(crate) fn line_of(content: &str, at: usize) -> usize {
    content[..at].bytes().filter(|b| *b == b'\n').count() + 1
}

/// Toutes les positions de `needle`, à l'identique, puis, s'il n'y en a
/// aucune, en traitant toute suite de blancs (espaces, retours à la ligne)
/// comme un seul blanc : une citation recopiée d'un paragraphe LaTeX dont
/// les lignes sont coupées autrement reste reconnue.
fn find_all(content: &str, needle: &str) -> Vec<Range<usize>> {
    let exact: Vec<Range<usize>> = content
        .match_indices(needle)
        .map(|(i, m)| i..i + m.len())
        .collect();
    if !exact.is_empty() {
        return exact;
    }
    let words: Vec<&str> = needle.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(off) = content[from..].find(words[0]) {
        let start = from + off;
        let mut pos = start + words[0].len();
        let mut ok = true;
        for word in &words[1..] {
            let rest = &content[pos..];
            let trimmed = rest.trim_start();
            let gap = rest.len() - trimmed.len();
            if gap == 0 || !trimmed.starts_with(word) {
                ok = false;
                break;
            }
            pos += gap + word.len();
        }
        if ok {
            out.push(start..pos);
        }
        from = start + words[0].len();
    }
    out
}

pub(crate) fn find_unique(content: &str, needle: &str, what: &str) -> Result<Range<usize>, String> {
    let hits = find_all(content, needle);
    match hits.len() {
        1 => Ok(hits[0].clone()),
        0 => Err(format!("{what} introuvable dans le fichier : recopie-le mot pour mot (lis le fichier avec read_tex_file)")),
        n => Err(format!("{what} présent {n} fois dans le fichier : cite une phrase de plus pour qu'il soit unique")),
    }
}

pub(crate) fn str_arg<'a>(args: &'a Value, key: &str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or("")
}

pub(crate) fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// `read_tex_file` : les lignes d'un fichier .tex, numérotées.
pub fn read_tex_file(args: &Value) -> Result<String, String> {
    let path = tex_path(str_arg(args, "path"))?;
    let content = read(&path)?;
    let total = content.lines().count();
    let from = args
        .get("from_line")
        .and_then(Value::as_u64)
        .unwrap_or(1)
        .max(1) as usize;
    let count = args
        .get("lines")
        .and_then(Value::as_u64)
        .map(|n| (n as usize).clamp(1, READ_MAX_LINES))
        .unwrap_or(READ_DEFAULT_LINES);
    let mut out = format!(
        "{} : lignes {from} à {} sur {total}\n",
        path.display(),
        (from + count - 1).min(total)
    );
    for (i, line) in content.lines().enumerate().skip(from - 1).take(count) {
        out.push_str(&format!("{:>5}  {line}\n", i + 1));
    }
    if from + count - 1 < total {
        out.push_str(&format!("… suite : from_line {}\n", from + count));
    }
    Ok(out)
}

/// `open_tex_file` : envoie le fichier à la carte « lecteur » d'Atelier, où
/// l'utilisateur sélectionne et note des passages avant de les envoyer à
/// Claude. Rien n'est écrit.
pub fn open_tex(args: &Value) -> Result<Value, String> {
    let path = tex_path(str_arg(args, "path"))?;
    let content = read(&path)?;
    let all: Vec<&str> = content.lines().collect();
    let total = all.len();
    let shown = total.min(OPEN_MAX_LINES);
    let file = file_name(&path);
    let mut note = format!(
        "{file} est ouvert dans la carte d'Atelier ({total} lignes). L'utilisateur peut y sélectionner et noter \
des passages, puis te les envoyer : réponds alors par propose_revision, un appel par passage."
    );
    if shown < total {
        note.push_str(&format!(
            " Seules les {shown} premières lignes sont affichées dans la carte."
        ));
    }
    Ok(json!({
        "content": [{"type": "text", "text": note}],
        "structuredContent": {
            "path": path.display().to_string(),
            "file": file,
            "total": total,
            "lines": all[..shown],
        },
        "isError": false,
    }))
}

fn sha256_hex(text: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(text.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// `load_tex_file` (réservé aux vues) : le texte exact du fichier et son
/// empreinte, pour l'éditeur de l'artefact. `save_tex_file` exige cette
/// empreinte : on n'écrase jamais une version que l'éditeur n'a pas vue.
pub fn load_for_edit(args: &Value) -> Result<Value, String> {
    let path = editable_path(str_arg(args, "path"))?;
    let content = read(&path)?;
    if content.len() > EDIT_MAX_BYTES {
        return Err(format!(
            "{} : fichier trop gros pour l'éditeur",
            file_name(&path)
        ));
    }
    let total = content.lines().count();
    Ok(json!({
        "content": [{"type": "text", "text": format!("{} chargé ({total} lignes).", file_name(&path))}],
        "structuredContent": {
            "path": path.display().to_string(),
            "file": file_name(&path),
            "text": content,
            "sha256": sha256_hex(&content),
            "total": total,
        },
        "isError": false,
    }))
}

/// `save_tex_file` (réservé aux vues) : enregistre le texte tapé à la main
/// dans l'éditeur de l'artefact. Refuse si le fichier a changé depuis le
/// chargement (`base_sha256`), garde une copie avant d'écrire, écrit d'un bloc.
pub fn save_from_editor(app_dir: &Path, args: &Value) -> Result<Value, String> {
    let path = editable_path(str_arg(args, "path"))?;
    let text = args
        .get("text")
        .and_then(Value::as_str)
        .ok_or("text manquant : le contenu complet du fichier")?;
    let base = str_arg(args, "base_sha256").trim();
    if base.is_empty() {
        return Err("base_sha256 manquant : l'empreinte reçue au chargement".into());
    }
    if text.len() > EDIT_MAX_BYTES {
        return Err("texte trop long pour l'éditeur".into());
    }
    let content = read(&path)?;
    let current = sha256_hex(&content);
    if current != base {
        return Ok(json!({
            "content": [{"type": "text", "text": format!(
                "{} a changé depuis son ouverture dans l'éditeur : rien n'est écrit. Recharge le fichier.",
                file_name(&path))}],
            "structuredContent": {"ok": false, "conflict": true, "sha256": current},
            "isError": true,
        }));
    }
    let sha = sha256_hex(text);
    if text != content {
        let origin = if str_arg(args, "origin") == "restore" {
            "restore"
        } else {
            "save"
        };
        backup(app_dir, &path, &content, origin)?;
        write_atomic(&path, text)?;
    }
    Ok(json!({
        "content": [{"type": "text", "text": format!("{} enregistré.", file_name(&path))}],
        "structuredContent": {"ok": true, "sha256": sha, "total": text.lines().count(), "unchanged": text == content},
        "isError": false,
    }))
}

/// `propose_revision` : vérifie la proposition et la renvoie à la vue.
/// Rien n'est écrit.
pub fn propose(args: &Value) -> Result<Value, String> {
    let path = tex_path(str_arg(args, "path"))?;
    let quote = str_arg(args, "quote");
    let text = str_arg(args, "text");
    let reason = str_arg(args, "reason").trim();
    if quote.trim().is_empty() {
        return Err("quote manquant : le passage actuel, recopié mot pour mot du fichier".into());
    }
    if text.trim().is_empty() {
        return Err("text manquant : le passage réécrit qui remplacerait quote".into());
    }
    if quote.len() > QUOTE_MAX || text.len() > TEXT_MAX {
        return Err(format!("passage trop long : {QUOTE_MAX} caractères au plus ; découpe en plusieurs propositions"));
    }
    if reason.chars().count() > REASON_MAX {
        return Err(format!(
            "reason trop longue : une ou deux phrases ({REASON_MAX} caractères au plus)"
        ));
    }
    if quote.trim() == text.trim() {
        return Err("text identique à quote : rien à proposer".into());
    }
    let content = read(&path)?;
    let range = find_unique(&content, quote, "Le passage cité")?;
    let line = line_of(&content, range.start);
    let original = &content[range.clone()];
    let created = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    Ok(json!({
        "content": [{"type": "text", "text": format!(
            "Proposition affichée à l'utilisateur dans la carte d'Atelier ({}, ligne {line}). \
    Rien n'est écrit tant qu'il n'a pas cliqué sur Accepter ; ne pas la redemander ni la répéter en texte.",
            file_name(&path))}],
        "structuredContent": {
            "path": path.to_string_lossy(),
            "file": file_name(&path),
            "line": line,
            "quote": original,
            "text": text,
            "reason": reason,
            "createdAt": created,
        },
        "isError": false,
    }))
}

/// Remplace `find` (présent une seule fois) par `replace`, avec une copie
/// de sauvegarde. Sert à `apply_revision` et, à l'envers, à `undo_revision`.
pub fn replace_once(app_dir: &Path, args: &Value, undo: bool) -> Result<Value, String> {
    let path = tex_path(str_arg(args, "path"))?;
    let (find, replace) = if undo {
        (str_arg(args, "text"), str_arg(args, "quote"))
    } else {
        (str_arg(args, "quote"), str_arg(args, "text"))
    };
    if find.trim().is_empty() || replace.trim().is_empty() {
        return Err("quote et text sont requis".into());
    }
    let content = read(&path)?;
    let what = if undo {
        "Le passage révisé"
    } else {
        "Le passage d'origine"
    };
    let range = match find_unique(&content, find, what) {
        Ok(r) => r,
        Err(e) => {
            // Déjà fait (double clic, ou fichier déjà modifié dans ce sens) :
            // le dire au lieu d'échouer.
            if find_all(&content, replace).len() == 1 {
                let line = line_of(&content, find_all(&content, replace)[0].start);
                return Ok(done(&path, line, undo, true));
            }
            return Err(format!(
                "{e}. Le fichier a sans doute changé depuis la proposition."
            ));
        }
    };
    let line = line_of(&content, range.start);
    backup(
        app_dir,
        &path,
        &content,
        if undo { "undo" } else { "claude" },
    )?;
    let mut next = String::with_capacity(content.len() + replace.len());
    next.push_str(&content[..range.start]);
    next.push_str(replace);
    next.push_str(&content[range.end..]);
    write_atomic(&path, &next)?;
    Ok(done(&path, line, undo, false))
}

fn done(path: &Path, line: usize, undo: bool, already: bool) -> Value {
    let verb = if undo {
        "Texte d'origine remis"
    } else {
        "Révision écrite"
    };
    let note = if already {
        " (c'était déjà fait)"
    } else {
        ""
    };
    json!({
        "content": [{"type": "text", "text": format!("{verb} dans {}, ligne {line}{note}.", file_name(path))}],
        "structuredContent": {"ok": true, "undone": undo, "line": line, "already": already},
        "isError": false,
    })
}

/// Clé d'un fichier dans `mcp-revisions` : deux `introduction.tex` de
/// dossiers différents ne se mélangent pas.
fn path_key(path: &Path) -> String {
    let real = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    sha256_hex(&real.to_string_lossy())[..12].to_string()
}

/// Copie du fichier d'avant une écriture : `{horodatage}-{clé}-{origine}-{nom}`.
/// Origine : `save` (enregistré dans l'éditeur), `claude` (proposition
/// acceptée), `undo` (proposition annulée).
fn backup(app_dir: &Path, path: &Path, content: &str, origin: &str) -> Result<(), String> {
    let dir = app_dir.join("mcp-revisions");
    std::fs::create_dir_all(&dir).map_err(|e| format!("sauvegarde impossible ({e})"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let name = format!(
        "{stamp:020}-{}-{origin}-{}",
        path_key(path),
        file_name(path)
    );
    std::fs::write(dir.join(name), content).map_err(|e| format!("sauvegarde impossible ({e})"))?;
    let mut kept: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|it| it.filter_map(|e| e.ok().map(|e| e.path())).collect())
        .unwrap_or_default();
    if kept.len() > BACKUPS_KEPT {
        kept.sort();
        for old in &kept[..kept.len() - BACKUPS_KEPT] {
            let _ = std::fs::remove_file(old);
        }
    }
    Ok(())
}

struct Version {
    id: String,
    nanos: u128,
    origin: String,
}

/// Une copie de ce fichier-ci (nom au format de `backup`), sinon rien.
fn parse_version(name: &str, key: &str) -> Option<Version> {
    let mut parts = name.splitn(4, '-');
    let stamp = parts.next()?;
    if parts.next()? != key {
        return None;
    }
    let origin = parts.next()?;
    parts.next()?;
    if stamp.len() != 20 || !stamp.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    if !matches!(origin, "save" | "claude" | "undo" | "restore") {
        return None;
    }
    Some(Version {
        id: name.to_string(),
        nanos: stamp.parse().ok()?,
        origin: origin.to_string(),
    })
}

/// `list_tex_versions` (réservé aux vues) : les copies gardées d'un fichier,
/// les plus récentes d'abord. Chaque copie est le fichier tel qu'il était
/// juste avant une écriture.
pub fn list_versions(app_dir: &Path, args: &Value) -> Result<Value, String> {
    let path = editable_path(str_arg(args, "path"))?;
    let key = path_key(&path);
    let dir = app_dir.join("mcp-revisions");
    let mut found: Vec<(Version, u64)> = std::fs::read_dir(&dir)
        .map(|it| {
            it.filter_map(|e| e.ok())
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().into_owned();
                    let size = e.metadata().ok()?.len();
                    parse_version(&name, &key).map(|v| (v, size))
                })
                .collect()
        })
        .unwrap_or_default();
    found.sort_by_key(|v| std::cmp::Reverse(v.0.nanos));
    found.truncate(VERSIONS_LISTED);
    let versions: Vec<Value> = found
        .iter()
        .map(|(v, size)| {
            json!({"id": v.id, "time": (v.nanos / 1_000_000) as u64, "origin": v.origin, "size": size})
        })
        .collect();
    let n = versions.len();
    Ok(json!({
        "content": [{"type": "text", "text": format!("{n} version(s) gardée(s) de {}.", file_name(&path))}],
        "structuredContent": {"path": path.display().to_string(), "versions": versions},
        "isError": false,
    }))
}

/// `load_tex_version` (réservé aux vues) : le texte d'une copie gardée, pour
/// la comparer au fichier ou la restaurer (par `save_tex_file`, qui garde à
/// son tour une copie : rien ne se perd).
pub fn load_version(app_dir: &Path, args: &Value) -> Result<Value, String> {
    let path = editable_path(str_arg(args, "path"))?;
    let id = str_arg(args, "id").trim();
    let version = parse_version(id, &path_key(&path))
        .filter(|_| !id.contains('/') && !id.contains('\\'))
        .ok_or("version inconnue pour ce fichier")?;
    let text = std::fs::read_to_string(app_dir.join("mcp-revisions").join(id))
        .map_err(|_| "cette version n'est plus gardée".to_string())?;
    Ok(json!({
        "content": [{"type": "text", "text": format!("Version de {} chargée.", file_name(&path))}],
        "structuredContent": {
            "path": path.display().to_string(),
            "id": version.id,
            "time": (version.nanos / 1_000_000) as u64,
            "origin": version.origin,
            "text": text,
            "sha256": sha256_hex(&text),
        },
        "isError": false,
    }))
}

/// Écrit à côté puis renomme : l'éditeur ne voit jamais un fichier à moitié
/// écrit. Les droits du fichier d'origine sont gardés.
fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    let dir = path.parent().ok_or("dossier du fichier introuvable")?;
    let tmp = dir.join(format!(".{}.atelier-tmp", file_name(path)));
    std::fs::write(&tmp, content).map_err(|e| format!("écriture impossible ({e})"))?;
    if let Ok(meta) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("écriture impossible ({e})")
    })
}

/// `get_selection` : le passage sélectionné dans l'éditeur d'Atelier.
///
/// La galerie publie la sélection courante dans `~/.claude/fig-selection.json`
/// (`POST /selinfo` : `text`, `rel` = chemin absolu, `page` = « L12-14 »,
/// `ts` en secondes) et retire le fichier quand la sélection est vide. On ne
/// lit ce fichier que lorsque l'utilisateur le demande (« ma sélection »).
pub fn get_selection(home: &Path, now_secs: f64) -> Result<String, String> {
    let path = home.join(".claude").join("fig-selection.json");
    let none = || {
        "Aucune sélection dans Atelier : sélectionne un passage dans l'éditeur LaTeX d'Atelier, puis redemande.".to_string()
    };
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(_) => return Err(none()),
    };
    let sel: Value = serde_json::from_str(&raw).map_err(|_| none())?;
    let text = sel["text"].as_str().unwrap_or("");
    if text.trim().is_empty() {
        return Err(none());
    }
    let file = sel["rel"].as_str().unwrap_or("").trim();
    let lines = sel["page"].as_str().unwrap_or("").trim();
    let mut out = String::new();
    if !file.is_empty() {
        out.push_str(&format!("Fichier : {file}\n"));
    }
    if let Some(range) = lines.strip_prefix('L') {
        out.push_str(&format!("Lignes : {range}\n"));
    }
    if let Some(ts) = sel["ts"].as_f64() {
        // Anciennes versions : millisecondes.
        let ts = if ts > 1e11 { ts / 1000.0 } else { ts };
        let minutes = ((now_secs - ts).max(0.0) / 60.0).round() as u64;
        out.push_str(&format!(
            "Sélectionné il y a {}\n",
            if minutes == 0 {
                "moins d'une minute".to_string()
            } else {
                format!("{minutes} min")
            }
        ));
    }
    let is_tex = Path::new(file)
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("tex"));
    if !is_tex {
        out.push_str("(Ce n'est pas un fichier .tex : la carte de révision ne s'applique pas.)\n");
    }
    out.push_str("Passage :\n");
    out.push_str(text);
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEX: &str = "\\section{Results}\nIn the years with large wildfire\nseasons, albedo was lower \\citep{Painter2013}.\nAnother paragraph.\n";

    fn file(dir: &Path) -> PathBuf {
        let p = dir.join("chapitre1.tex");
        std::fs::write(&p, TEX).unwrap();
        p
    }

    #[test]
    fn finds_quote_across_line_breaks() {
        let hits = find_all(TEX, "In the years with large wildfire seasons, albedo");
        assert_eq!(hits.len(), 1);
        assert!(TEX[hits[0].clone()].contains("wildfire\nseasons"));
        assert_eq!(line_of(TEX, hits[0].start), 2);
        assert!(find_all(TEX, "with  large").len() == 1);
        assert!(find_all(TEX, "glacier").is_empty());
    }

    #[test]
    fn propose_checks_then_apply_and_undo() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(dir.path());
        let p = path.to_string_lossy().to_string();
        let quote = "In the years with large wildfire seasons, albedo was lower";
        let text = "In large wildfire years, albedo was lower";
        let res =
            propose(&json!({"path": p, "quote": quote, "text": text, "reason": "Plus court."}))
                .unwrap();
        let sc = &res["structuredContent"];
        assert_eq!(sc["line"], 2);
        assert_eq!(sc["file"], "chapitre1.tex");
        // La vue renvoie le passage tel qu'il est dans le fichier.
        let original = sc["quote"].as_str().unwrap().to_string();
        assert!(original.contains('\n'));
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            TEX,
            "proposer n'écrit rien"
        );

        let args = json!({"path": p, "quote": original, "text": text});
        let applied = replace_once(dir.path(), &args, false).unwrap();
        assert_eq!(applied["structuredContent"]["ok"], true);
        let now = std::fs::read_to_string(&path).unwrap();
        assert!(now.contains("In large wildfire years, albedo was lower \\citep"));
        // Double clic : déjà fait, pas d'erreur, pas de seconde écriture.
        let again = replace_once(dir.path(), &args, false).unwrap();
        assert_eq!(again["structuredContent"]["already"], true);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), now);

        replace_once(dir.path(), &args, true).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), TEX);
        assert_eq!(
            std::fs::read_dir(dir.path().join("mcp-revisions"))
                .unwrap()
                .count(),
            2
        );
        assert!(!dir.path().join(".chapitre1.tex.atelier-tmp").exists());
    }

    #[test]
    fn refuses_bad_proposals() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(dir.path());
        let p = path.to_string_lossy().to_string();
        assert!(propose(&json!({"path": p, "quote": "absent", "text": "x"}))
            .unwrap_err()
            .contains("introuvable"));
        assert!(propose(&json!({"path": p, "quote": "a", "text": "b"}))
            .unwrap_err()
            .contains("fois"));
        assert!(
            propose(&json!({"path": "relatif.tex", "quote": "a", "text": "b"}))
                .unwrap_err()
                .contains("absolu")
        );
        let md = dir.path().join("notes.md");
        std::fs::write(&md, "x").unwrap();
        assert!(propose(&json!({"path": md, "quote": "x", "text": "y"}))
            .unwrap_err()
            .contains(".tex"));
        // Le fichier a changé entre la proposition et le clic.
        let args = json!({"path": p, "quote": "Another paragraph, edited.", "text": "Other."});
        assert!(replace_once(dir.path(), &args, false)
            .unwrap_err()
            .contains("changé"));
    }

    #[test]
    fn editor_loads_then_saves_only_the_version_it_saw() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("app");
        let path = file(dir.path());
        let p = path.to_string_lossy().to_string();
        let loaded = load_for_edit(&json!({"path": p})).unwrap();
        let sc = &loaded["structuredContent"];
        let original = sc["text"].as_str().unwrap().to_string();
        assert_eq!(original, std::fs::read_to_string(&path).unwrap());
        let base = sc["sha256"].as_str().unwrap().to_string();
        assert_eq!(base.len(), 64);
        let edited = original.replace("Another", "One more");
        let saved = save_from_editor(
            &app,
            &json!({"path": p, "text": edited, "base_sha256": base}),
        )
        .unwrap();
        assert_eq!(saved["structuredContent"]["ok"], true);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), edited);
        assert_eq!(
            std::fs::read_dir(app.join("mcp-revisions"))
                .unwrap()
                .count(),
            1
        );
        // L'ancienne empreinte ne vaut plus : rien n'est écrasé.
        let stale =
            save_from_editor(&app, &json!({"path": p, "text": "x", "base_sha256": base})).unwrap();
        assert_eq!(stale["isError"], true);
        assert_eq!(stale["structuredContent"]["conflict"], true);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), edited);
        assert!(save_from_editor(&app, &json!({"path": p, "text": "x"})).is_err());
        assert!(load_for_edit(&json!({"path": "/tmp/a.txt"})).is_err());
    }

    #[test]
    fn every_write_keeps_a_version_the_editor_can_restore() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("app");
        let path = file(dir.path());
        // Un fichier du même nom ailleurs : ses versions ne se mélangent pas.
        std::fs::create_dir_all(dir.path().join("autre")).unwrap();
        let other = dir.path().join("autre").join(path.file_name().unwrap());
        std::fs::write(&other, "autre\n").unwrap();
        let p = path.to_string_lossy().to_string();
        let first = std::fs::read_to_string(&path).unwrap();
        let sha = |p: &str| {
            load_for_edit(&json!({"path": p})).unwrap()["structuredContent"]["sha256"]
                .as_str()
                .unwrap()
                .to_string()
        };
        save_from_editor(
            &app,
            &json!({"path": p, "text": "deux\n", "base_sha256": sha(&p)}),
        )
        .unwrap();
        let o = other.to_string_lossy().to_string();
        save_from_editor(
            &app,
            &json!({"path": o, "text": "x\n", "base_sha256": sha(&o)}),
        )
        .unwrap();
        save_from_editor(
            &app,
            &json!({"path": p, "text": "trois\n", "base_sha256": sha(&p)}),
        )
        .unwrap();

        let listed = list_versions(&app, &json!({"path": p})).unwrap();
        let versions = listed["structuredContent"]["versions"]
            .as_array()
            .unwrap()
            .clone();
        assert_eq!(versions.len(), 2, "{versions:?}");
        assert_eq!(versions[0]["origin"], "save");
        assert!(versions[0]["time"].as_u64() >= versions[1]["time"].as_u64());
        let id = |i: usize| versions[i]["id"].as_str().unwrap().to_string();
        let newest = load_version(&app, &json!({"path": p, "id": id(0)})).unwrap();
        assert_eq!(newest["structuredContent"]["text"], "deux\n");
        let oldest = load_version(&app, &json!({"path": p, "id": id(1)})).unwrap();
        assert_eq!(oldest["structuredContent"]["text"], first);

        // Restaurer = enregistrer l'ancien texte : l'état d'avant est gardé.
        save_from_editor(
            &app,
            &json!({"path": p, "text": first, "base_sha256": sha(&p), "origin": "restore"}),
        )
        .unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), first);
        let after = list_versions(&app, &json!({"path": p})).unwrap();
        let top = &after["structuredContent"]["versions"][0];
        assert_eq!(top["origin"], "restore");
        let kept = load_version(&app, &json!({"path": p, "id": top["id"]})).unwrap();
        assert_eq!(kept["structuredContent"]["text"], "trois\n");

        // Une version d'un autre fichier, ou un chemin glissé dans l'id, est refusée.
        let theirs = list_versions(&app, &json!({"path": o})).unwrap();
        let their_id = theirs["structuredContent"]["versions"][0]["id"].clone();
        assert!(load_version(&app, &json!({"path": p, "id": their_id})).is_err());
        assert!(load_version(&app, &json!({"path": p, "id": format!("../{}", id(0))})).is_err());
    }

    #[test]
    fn reads_numbered_lines() {
        let dir = tempfile::tempdir().unwrap();
        let path = file(dir.path());
        let out = read_tex_file(&json!({"path": path, "from_line": 2, "lines": 2})).unwrap();
        assert!(out.contains("    2  In the years"));
        assert!(out.contains("    3  seasons"));
        assert!(!out.contains("Another"));
        assert!(out.contains("from_line 4"));
    }

    #[test]
    fn selection_from_the_editor() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let err = get_selection(home, 1000.0).unwrap_err();
        assert!(err.contains("Aucune sélection"), "{err}");
        std::fs::create_dir_all(home.join(".claude")).unwrap();
        std::fs::write(
            home.join(".claude/fig-selection.json"),
            r#"{"lines":2,"words":5,"text":"In the years with\nlarge fires","rel":"/u/t/ch1.tex","name":"ch1.tex","page":"L12-13","ts":880.5}"#,
        )
        .unwrap();
        let out = get_selection(home, 1000.0).unwrap();
        assert!(out.contains("Fichier : /u/t/ch1.tex"), "{out}");
        assert!(out.contains("Lignes : 12-13"), "{out}");
        assert!(out.contains("il y a 2 min"), "{out}");
        assert!(out.ends_with("In the years with\nlarge fires"), "{out}");
        assert!(!out.contains("pas un fichier .tex"), "{out}");
        std::fs::write(
            home.join(".claude/fig-selection.json"),
            r#"{"text":"x","rel":"/u/a.pdf","page":"3","ts":1000000}"#,
        )
        .unwrap();
        let out = get_selection(home, 1000.0).unwrap();
        assert!(
            out.contains("pas un fichier .tex") && out.contains("moins d'une minute"),
            "{out}"
        );
    }

    #[test]
    fn open_sends_the_lines_to_the_reader() {
        let dir = tempfile::tempdir().unwrap();
        let tex = dir.path().join("ch1.tex");
        std::fs::write(&tex, "\\section{A}\nLigne deux\n").unwrap();
        let out = open_tex(&json!({"path": tex.display().to_string()})).unwrap();
        assert_eq!(out["structuredContent"]["total"], 2);
        assert_eq!(out["structuredContent"]["lines"][1], "Ligne deux");
        assert_eq!(out["structuredContent"]["file"], "ch1.tex");
        assert!(out["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("propose_revision"));
        assert!(open_tex(&json!({"path": "relatif.tex"})).is_err());
    }

    #[test]
    fn remote_files_must_be_under_the_roots() {
        let dir = tempfile::tempdir().unwrap();
        let inside = dir.path().join("docs");
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::write(inside.join("a.tex"), "x").unwrap();
        std::fs::write(dir.path().join("b.tex"), "x").unwrap();
        let roots = vec![inside.clone()];
        assert!(within_roots(inside.join("a.tex").to_str().unwrap(), &roots).is_ok());
        let out = dir.path().join("b.tex");
        assert!(within_roots(out.to_str().unwrap(), &roots).is_err());
        let sneaky = inside.join("../b.tex");
        assert!(within_roots(sneaky.to_str().unwrap(), &roots).is_err());
    }
}
