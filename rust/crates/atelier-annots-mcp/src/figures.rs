//! Les figures d'un projet LaTeX dans l'éditeur de l'artefact : où chacune
//! est citée (`\includegraphics`, fichier et ligne), son aperçu, et les notes
//! que l'utilisateur y pose (un cadre ou un point, avec un texte).
//!
//! - `list_tex_figures` : les figures du dossier, leurs citations, leurs notes ;
//! - `render_figure` : l'aperçu en PNG (PDF par PDFium, PNG et JPEG réduits
//!   ici, SVG tel quel) ;
//! - `save_figure_notes` : les notes d'une figure, et leur envoi à Claude avec
//!   l'image annotée telle que l'utilisateur la voit ;
//! - `get_figure_notes` (visible de Claude) : les notes envoyées, avec l'image.
//!
//! Les notes vivent dans `$ATELIER_APP_DIR/figure-notes.json` et les images
//! envoyées dans `$ATELIER_APP_DIR/figure-notes/` : rien n'est jamais écrit
//! dans le dossier du projet.

use crate::project::{self, Entry};
use crate::revision;
use base64::Engine as _;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

const NOTES_FILE: &str = "figure-notes.json";
const SNAP_DIR: &str = "figure-notes";
const MAX_NOTES: usize = 100;
const MAX_TEXT: usize = 4_000;
const MAX_USES: usize = 40;
const MAX_SNAPSHOT: usize = 8 * 1024 * 1024;
/// Un PNG ou un JPEG plus petit que ceci, et pas plus large qu'il ne faut,
/// part tel quel : le réduire coûterait plus qu'il ne rapporte.
const RAW_MAX: usize = 1_500_000;
const SVG_MAX: u64 = 4 * 1024 * 1024;
const MAX_PIXELS: u64 = 80_000_000;
const MAX_TEX_BYTES: u64 = 4_000_000;
const MAX_FIGURES_SENT: usize = 4;
/// Ordre où pdflatex essaie les extensions d'un `\includegraphics{nom}`.
const EXT_ORDER: [&str; 6] = ["pdf", "png", "jpg", "jpeg", "eps", "svg"];

static LOCK: Mutex<()> = Mutex::new(());

// ——— Citations dans le texte ———

/// Une ligne sans son commentaire (`%` non échappé).
fn strip_comment(line: &str) -> &str {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 2,
            b'%' => return &line[..i],
            _ => i += 1,
        }
    }
    line
}

/// L'argument entre accolades qui commence à `open` (`s[open] == '{'`), et
/// l'indice qui suit l'accolade fermante.
fn braced(s: &str, open: usize) -> Option<(&str, usize)> {
    let bytes = s.as_bytes();
    if bytes.get(open) != Some(&b'{') {
        return None;
    }
    let mut depth = 0usize;
    let mut i = open;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i += 1,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some((&s[open + 1..i], i + 1));
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

fn skip_blank(s: &str, mut i: usize) -> usize {
    let bytes = s.as_bytes();
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    i
}

/// Les `\includegraphics` d'un texte : (ligne, nom tel qu'écrit).
pub(crate) fn includes(text: &str) -> Vec<(usize, String)> {
    let code: String = text
        .lines()
        .map(strip_comment)
        .collect::<Vec<_>>()
        .join("\n");
    let mut out = Vec::new();
    let needle = "\\includegraphics";
    let mut from = 0;
    while let Some(found) = code[from..].find(needle) {
        let start = from + found;
        let mut i = start + needle.len();
        from = i;
        // \includegraphicsfoo est une autre commande.
        if code[i..]
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
        {
            continue;
        }
        if code[i..].starts_with('*') {
            i += 1;
        }
        i = skip_blank(&code, i);
        while code[i..].starts_with('[') {
            let Some(close) = code[i..].find(']') else {
                break;
            };
            i = skip_blank(&code, i + close + 1);
        }
        if let Some((name, end)) = braced(&code, i) {
            let name = name.trim();
            if !name.is_empty() {
                let line = code[..start].matches('\n').count() + 1;
                out.push((line, name.to_string()));
            }
            from = end;
        }
    }
    out
}

/// Les dossiers de `\graphicspath{{a/}{b/}}`.
fn graphics_paths(text: &str) -> Vec<String> {
    let code: String = text
        .lines()
        .map(strip_comment)
        .collect::<Vec<_>>()
        .join("\n");
    let mut out = Vec::new();
    let needle = "\\graphicspath";
    let mut from = 0;
    while let Some(found) = code[from..].find(needle) {
        let i = skip_blank(&code, from + found + needle.len());
        from = from + found + needle.len();
        let Some((inner, end)) = braced(&code, i) else {
            continue;
        };
        from = end;
        let mut j = 0;
        while let Some((dir, next)) = braced(inner, skip_blank(inner, j)) {
            let dir = dir.trim();
            if !dir.is_empty() {
                out.push(dir.to_string());
            }
            j = next;
        }
    }
    out
}

/// `a/./b/../c` → `a/c`, sans toucher au disque.
fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
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

fn without_ext(path: &Path) -> PathBuf {
    path.with_extension("")
}

fn rank(ext: &str) -> usize {
    EXT_ORDER
        .iter()
        .position(|e| *e == ext)
        .unwrap_or(EXT_ORDER.len())
}

/// La figure que désigne `name`, cité depuis `tex` : d'abord comme LaTeX la
/// cherche (dossier du fichier principal, puis `\graphicspath`), puis par
/// le dossier du fichier qui la cite, enfin par la fin du chemin si une
/// seule figure correspond.
fn resolve<'a>(
    name: &str,
    tex: &Path,
    main_dir: &Path,
    base: &Path,
    gpaths: &[String],
    by_stem: &HashMap<PathBuf, Vec<&'a Entry>>,
    by_path: &HashMap<PathBuf, &'a Entry>,
) -> Option<&'a Entry> {
    let name = name.trim_matches('"');
    let wanted = Path::new(name);
    let has_ext = wanted
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EXT_ORDER.contains(&e.to_ascii_lowercase().as_str()));
    let tex_dir = tex.parent().unwrap_or(base);
    let mut dirs: Vec<PathBuf> = vec![main_dir.to_path_buf()];
    dirs.extend(gpaths.iter().map(|g| main_dir.join(g)));
    dirs.push(tex_dir.to_path_buf());
    dirs.extend(gpaths.iter().map(|g| tex_dir.join(g)));
    dirs.push(base.to_path_buf());
    for dir in &dirs {
        let candidate = normalize(&dir.join(wanted));
        if has_ext {
            if let Some(found) = by_path.get(&candidate) {
                return Some(found);
            }
        }
        if let Some(list) = by_stem.get(&without_ext(&candidate)) {
            if let Some(best) = list.iter().min_by_key(|e| rank(&project::ext_of(&e.path))) {
                return Some(best);
            }
        }
    }
    // Dernier recours : une seule figure dont le chemin finit par le nom.
    let tail = name.trim_start_matches("./");
    let tail = if has_ext {
        tail.to_string()
    } else {
        without_ext(Path::new(tail)).to_string_lossy().to_string()
    };
    let suffix = format!("/{tail}");
    let mut hits: Vec<&&Entry> = by_path
        .values()
        .filter(|e| {
            let p = if has_ext {
                e.path.clone()
            } else {
                without_ext(&e.path)
            };
            p.to_string_lossy().ends_with(&suffix)
        })
        .collect();
    hits.sort_by_key(|e| rank(&project::ext_of(&e.path)));
    let first = hits.first()?;
    let same_stem = hits
        .iter()
        .all(|e| without_ext(&e.path) == without_ext(&first.path));
    same_stem.then_some(**first)
}

// ——— Notes ———

fn store_file(app_dir: &Path) -> PathBuf {
    app_dir.join(NOTES_FILE)
}

fn read_store(app_dir: &Path) -> Map<String, Value> {
    std::fs::read_to_string(store_file(app_dir))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| v.get("figures").and_then(Value::as_object).cloned())
        .unwrap_or_default()
}

fn write_store(app_dir: &Path, figures: &Map<String, Value>) -> Result<(), String> {
    std::fs::create_dir_all(app_dir).map_err(|e| format!("écriture impossible ({e})"))?;
    let tmp = app_dir.join(format!(".{NOTES_FILE}.tmp"));
    let raw = serde_json::to_string_pretty(&json!({"version": 1, "figures": figures}))
        .map_err(|e| e.to_string())?;
    std::fs::write(&tmp, raw).map_err(|e| format!("écriture impossible ({e})"))?;
    std::fs::rename(&tmp, store_file(app_dir)).map_err(|e| format!("écriture impossible ({e})"))
}

fn snapshot_stem(path: &str) -> String {
    let digest = Sha256::digest(path.as_bytes());
    digest.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

fn frac(v: &Value, key: &str) -> f64 {
    v.get(key)
        .and_then(Value::as_f64)
        .filter(|x| x.is_finite())
        .unwrap_or(0.0)
        .clamp(0.0, 1.0)
}

fn round4(x: f64) -> f64 {
    (x * 10_000.0).round() / 10_000.0
}

/// Une note reçue de la page, bornée et renumérotée.
fn clean_note(raw: &Value, index: usize, now: u64) -> Option<Value> {
    let text: String = raw
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .chars()
        .take(MAX_TEXT)
        .collect();
    let kind = if raw.get("kind").and_then(Value::as_str) == Some("box") {
        "box"
    } else {
        "point"
    };
    let x = frac(raw, "x");
    let y = frac(raw, "y");
    let (w, h) = if kind == "box" {
        (frac(raw, "w").min(1.0 - x), frac(raw, "h").min(1.0 - y))
    } else {
        (0.0, 0.0)
    };
    let id: String = raw
        .get("id")
        .and_then(Value::as_str)
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 64
                && s.chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        })
        .map(str::to_string)
        .unwrap_or_else(|| format!("n{now}-{index}"));
    let status = if raw.get("status").and_then(Value::as_str) == Some("sent") {
        "sent"
    } else {
        "draft"
    };
    let t = raw.get("t").and_then(Value::as_u64).unwrap_or(now);
    Some(json!({
        "id": id, "n": index + 1, "kind": kind,
        "x": round4(x), "y": round4(y), "w": round4(w), "h": round4(h),
        "text": text, "status": status, "t": t,
    }))
}

fn clean_uses(raw: Option<&Value>) -> Vec<Value> {
    raw.and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|u| {
            let rel: String = u
                .get("rel")
                .and_then(Value::as_str)?
                .chars()
                .take(400)
                .collect();
            let line = u.get("line").and_then(Value::as_u64)?;
            Some(json!({"rel": rel, "line": line}))
        })
        .take(MAX_USES)
        .collect()
}

fn decode_snapshot(raw: &str) -> Result<(Vec<u8>, &'static str), String> {
    let data = raw.split_once(',').map_or(raw, |(_, d)| d);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|_| "image de la figure illisible".to_string())?;
    if bytes.len() > MAX_SNAPSHOT {
        return Err("image de la figure trop lourde".into());
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Ok((bytes, "png"))
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Ok((bytes, "jpg"))
    } else {
        Err("l'image de la figure doit être un PNG ou un JPEG".into())
    }
}

fn record_out(path: &str, rec: Option<&Value>) -> Value {
    let rec = rec.cloned().unwrap_or_else(|| json!({}));
    json!({
        "path": path,
        "notes": rec.get("notes").cloned().unwrap_or_else(|| json!([])),
        "uses": rec.get("uses").cloned().unwrap_or_else(|| json!([])),
        "sentAt": rec.get("sentAt").cloned().unwrap_or(Value::Null),
        "seenAt": rec.get("seenAt").cloned().unwrap_or(Value::Null),
    })
}

/// `save_figure_notes` (réservé à l'éditeur) : remplace les notes d'une
/// figure. `send` les marque envoyées à Claude et garde `image`, la figure
/// annotée telle que l'utilisateur la voit.
pub fn save(app_dir: &Path, args: &Value) -> Result<Value, String> {
    let raw = revision::str_arg(args, "path").trim().to_string();
    let path = revision::expand_home(&raw);
    if !path.is_absolute() || !path.is_file() {
        return Err(format!("{raw} : figure introuvable"));
    }
    let key = path.display().to_string();
    let list = args
        .get("notes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if list.len() > MAX_NOTES {
        return Err(format!("{MAX_NOTES} notes au plus par figure"));
    }
    let now = project::now_ms();
    let mut notes: Vec<Value> = list
        .iter()
        .enumerate()
        .filter_map(|(i, n)| clean_note(n, i, now))
        .collect();
    let send = args.get("send").and_then(Value::as_bool).unwrap_or(false);
    let snapshot = match (send, args.get("image").and_then(Value::as_str)) {
        (true, Some(image)) => Some(decode_snapshot(image)?),
        _ => None,
    };
    if send
        && !notes
            .iter()
            .any(|n| !n["text"].as_str().unwrap_or("").is_empty())
    {
        return Err("aucune note à envoyer : écris d'abord une note sur la figure".into());
    }
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut figures = read_store(app_dir);
    let stem = snapshot_stem(&key);
    let snap_dir = app_dir.join(SNAP_DIR);
    if notes.is_empty() {
        figures.remove(&key);
        for ext in ["png", "jpg"] {
            let _ = std::fs::remove_file(snap_dir.join(format!("{stem}.{ext}")));
        }
        write_store(app_dir, &figures)?;
        return Ok(json!({
            "content": [{"type": "text", "text": "Notes de la figure effacées."}],
            "structuredContent": record_out(&key, None),
            "isError": false,
        }));
    }
    let mut rec = figures.get(&key).cloned().unwrap_or_else(|| json!({}));
    if let Some(uses) = args.get("uses") {
        rec["uses"] = json!(clean_uses(Some(uses)));
    }
    if send {
        for note in notes.iter_mut() {
            if !note["text"].as_str().unwrap_or("").is_empty() {
                note["status"] = json!("sent");
            }
        }
        if let Some((bytes, ext)) = &snapshot {
            std::fs::create_dir_all(&snap_dir).map_err(|e| format!("écriture impossible ({e})"))?;
            for old in ["png", "jpg"] {
                let _ = std::fs::remove_file(snap_dir.join(format!("{stem}.{old}")));
            }
            let file = format!("{stem}.{ext}");
            std::fs::write(snap_dir.join(&file), bytes)
                .map_err(|e| format!("écriture impossible ({e})"))?;
            rec["snapshot"] = json!(file);
        }
        rec["sentAt"] = json!(now);
        rec["seenAt"] = Value::Null;
    }
    rec["notes"] = json!(notes);
    rec["t"] = json!(now);
    figures.insert(key.clone(), rec.clone());
    write_store(app_dir, &figures)?;
    let text = if send {
        "Notes envoyées : Claude les lit avec get_figure_notes."
    } else {
        "Notes de la figure gardées."
    };
    Ok(json!({
        "content": [{"type": "text", "text": text}],
        "structuredContent": record_out(&key, Some(&rec)),
        "isError": false,
    }))
}

fn pct(x: f64) -> String {
    format!("{}", (x * 100.0).round() as i64)
}

fn describe(note: &Value) -> String {
    let (x, y, w, h) = (
        note["x"].as_f64().unwrap_or(0.0),
        note["y"].as_f64().unwrap_or(0.0),
        note["w"].as_f64().unwrap_or(0.0),
        note["h"].as_f64().unwrap_or(0.0),
    );
    let place = if note["kind"] == "box" {
        format!(
            "cadre x {}–{} %, y {}–{} %",
            pct(x),
            pct(x + w),
            pct(y),
            pct(y + h)
        )
    } else {
        format!("point x {} %, y {} %", pct(x), pct(y))
    };
    let draft = if note["status"] == "sent" {
        ""
    } else {
        " (brouillon, pas encore envoyée)"
    };
    format!(
        "{}. [{place}]{draft} {}",
        note["n"],
        note["text"].as_str().unwrap_or("")
    )
}

/// `get_figure_notes` (visible de Claude) : les notes que l'utilisateur a
/// envoyées depuis l'éditeur, avec l'image annotée. Sans `path`, les envois
/// pas encore lus (sinon le dernier) ; les envois rendus sont marqués lus.
pub fn get(app_dir: &Path, args: &Value, roots: Option<&[PathBuf]>) -> Result<Value, String> {
    let wanted = revision::str_arg(args, "path").trim().to_string();
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut figures = read_store(app_dir);
    let allowed = |path: &str| roots.is_none_or(|r| revision::within_roots(path, r).is_ok());
    let mut keys: Vec<String> = if !wanted.is_empty() {
        let key = revision::expand_home(&wanted).display().to_string();
        if !figures.contains_key(&key) {
            return Err(format!("{wanted} : aucune note sur cette figure"));
        }
        vec![key]
    } else {
        let sent = |rec: &Value| rec["sentAt"].as_u64();
        let mut fresh: Vec<(u64, String)> = figures
            .iter()
            .filter(|(k, rec)| {
                allowed(k)
                    && sent(rec).is_some_and(|s| rec["seenAt"].as_u64().is_none_or(|seen| seen < s))
            })
            .map(|(k, rec)| (sent(rec).unwrap_or(0), k.clone()))
            .collect();
        if fresh.is_empty() {
            fresh = figures
                .iter()
                .filter(|(k, rec)| allowed(k) && sent(rec).is_some())
                .map(|(k, rec)| (sent(rec).unwrap_or(0), k.clone()))
                .max_by_key(|(s, _)| *s)
                .into_iter()
                .collect();
        }
        fresh.sort_by_key(|e| std::cmp::Reverse(e.0));
        fresh
            .into_iter()
            .take(MAX_FIGURES_SENT)
            .map(|(_, k)| k)
            .collect()
    };
    keys.retain(|k| allowed(k));
    if keys.is_empty() {
        return Ok(json!({
            "content": [{"type": "text", "text": "Aucune note de figure envoyée. L'utilisateur pose ses notes dans l'onglet Figures de l'éditeur LaTeX, puis clique « Envoyer à Claude »."}],
            "isError": false,
        }));
    }
    let now = project::now_ms();
    let mut content = Vec::new();
    for key in &keys {
        let Some(rec) = figures.get_mut(key) else {
            continue;
        };
        let only_sent = wanted.is_empty();
        let notes: Vec<String> = rec["notes"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|n| !only_sent || n["status"] == "sent")
            .map(describe)
            .collect();
        let uses: Vec<String> = rec["uses"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|u| Some(format!("{}:{}", u["rel"].as_str()?, u["line"].as_u64()?)))
            .collect();
        let mut text = format!("Figure : {key}\n");
        text.push_str(&if uses.is_empty() {
            "Citée dans : aucun \\includegraphics trouvé\n".to_string()
        } else {
            format!("Citée dans : {}\n", uses.join(", "))
        });
        text.push_str("Notes de l'utilisateur (numéros = pastilles sur l'image ; positions en % de la largeur et de la hauteur, depuis le coin haut gauche) :\n");
        text.push_str(&notes.join("\n"));
        content.push(json!({"type": "text", "text": text}));
        if let Some(file) = rec["snapshot"].as_str() {
            if let Ok(bytes) = std::fs::read(app_dir.join(SNAP_DIR).join(file)) {
                let mime = if file.ends_with(".png") {
                    "image/png"
                } else {
                    "image/jpeg"
                };
                content.push(json!({"type": "image", "data": base64::engine::general_purpose::STANDARD.encode(&bytes), "mimeType": mime}));
            }
        }
        if rec["sentAt"].is_u64() {
            rec["seenAt"] = json!(now);
        }
    }
    write_store(app_dir, &figures)?;
    content.push(json!({"type": "text", "text": "Réponds à chaque note par son numéro : ce qu'il faut changer dans la figure ou dans le script qui la produit. Si la note porte sur le texte qui cite la figure, lis le fichier (read_tex_file) et propose la retouche avec propose_revision."}));
    Ok(json!({"content": content, "isError": false}))
}

// ——— Liste ———

/// `list_tex_figures` (réservé à l'éditeur) : les figures du dossier, où
/// chacune est citée, et leurs notes.
pub fn list(app_dir: &Path, args: &Value, roots: Option<&[PathBuf]>) -> Result<Value, String> {
    let dir = revision::str_arg(args, "dir").trim();
    let base = revision::expand_home(dir);
    if dir.is_empty() || !base.is_absolute() || !base.is_dir() {
        return Err(format!("{dir} : dossier introuvable"));
    }
    if let Some(roots) = roots {
        if !project::dir_allowed(&base, roots) {
            return Err(format!("{dir} : hors des dossiers ouverts au connecteur"));
        }
    }
    let mut entries = Vec::new();
    let mut truncated = false;
    project::walk(&base, &base, 0, &mut entries, &mut truncated);
    let main_dir = project::main_file(&entries)
        .and_then(|m| m.path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| base.clone());
    let figures: Vec<&Entry> = entries.iter().filter(|e| e.kind == "figure").collect();
    let by_path: HashMap<PathBuf, &Entry> =
        figures.iter().map(|e| (normalize(&e.path), *e)).collect();
    let mut by_stem: HashMap<PathBuf, Vec<&Entry>> = HashMap::new();
    for e in &figures {
        by_stem
            .entry(without_ext(&normalize(&e.path)))
            .or_default()
            .push(e);
    }
    let texts: Vec<(&Entry, String)> = entries
        .iter()
        .filter(|e| e.kind == "tex" && e.size <= MAX_TEX_BYTES)
        .filter_map(|e| {
            std::fs::read(&e.path)
                .ok()
                .map(|b| (e, String::from_utf8_lossy(&b).into_owned()))
        })
        .collect();
    let gpaths: Vec<String> = texts.iter().flat_map(|(_, t)| graphics_paths(t)).collect();
    let mut uses: HashMap<PathBuf, Vec<Value>> = HashMap::new();
    let mut unresolved = 0usize;
    for (tex, text) in &texts {
        for (line, name) in includes(text) {
            match resolve(
                &name, &tex.path, &main_dir, &base, &gpaths, &by_stem, &by_path,
            ) {
                Some(fig) => uses.entry(fig.path.clone()).or_default().push(json!({
                    "path": tex.path.display().to_string(),
                    "rel": tex.rel,
                    "line": line,
                })),
                None => unresolved += 1,
            }
        }
    }
    let store = read_store(app_dir);
    let out: Vec<Value> = figures
        .iter()
        .map(|e| {
            let key = e.path.display().to_string();
            let rec = store.get(&key);
            let mut list = uses.remove(&e.path).unwrap_or_default();
            list.truncate(MAX_USES);
            json!({
                "path": key,
                "rel": e.rel,
                "ext": project::ext_of(&e.path),
                "size": e.size,
                "mtime": crate::compile::mtime_ms(&e.path),
                "uses": list,
                "notes": rec.and_then(|r| r.get("notes")).cloned().unwrap_or_else(|| json!([])),
                "sentAt": rec.and_then(|r| r.get("sentAt")).cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    let used = out
        .iter()
        .filter(|f| f["uses"].as_array().is_some_and(|u| !u.is_empty()))
        .count();
    Ok(json!({
        "content": [{"type": "text", "text": format!("{} figures, dont {used} citées.", out.len())}],
        "structuredContent": {"dir": base.display().to_string(), "figures": out, "unresolved": unresolved, "truncated": truncated},
        "isError": false,
    }))
}

// ——— Aperçu ———

fn rgb_from(data: &[u8], channels: usize, alpha: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(data.len() / channels * 3);
    for px in data.chunks_exact(channels) {
        let (r, g, b) = if channels >= 3 {
            (px[0], px[1], px[2])
        } else {
            (px[0], px[0], px[0])
        };
        if alpha {
            let a = u32::from(px[channels - 1]);
            let mix = |c: u8| ((u32::from(c) * a + 255 * (255 - a) + 127) / 255) as u8;
            out.extend_from_slice(&[mix(r), mix(g), mix(b)]);
        } else {
            out.extend_from_slice(&[r, g, b]);
        }
    }
    out
}

fn png_size(bytes: &[u8]) -> Result<(u32, u32), String> {
    let decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    let reader = decoder
        .read_info()
        .map_err(|e| format!("PNG illisible ({e})"))?;
    let info = reader.info();
    Ok((info.width, info.height))
}

fn decode_png(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder
        .read_info()
        .map_err(|e| format!("PNG illisible ({e})"))?;
    let (w, h) = (reader.info().width, reader.info().height);
    if u64::from(w) * u64::from(h) > MAX_PIXELS {
        return Err("image trop grande pour l'aperçu".into());
    }
    let mut buf = vec![0; reader.output_buffer_size()];
    let frame = reader
        .next_frame(&mut buf)
        .map_err(|e| format!("PNG illisible ({e})"))?;
    let data = &buf[..frame.buffer_size()];
    let rgb = match frame.color_type {
        png::ColorType::Grayscale => rgb_from(data, 1, false),
        png::ColorType::GrayscaleAlpha => rgb_from(data, 2, true),
        png::ColorType::Rgb => data.to_vec(),
        png::ColorType::Rgba => rgb_from(data, 4, true),
        png::ColorType::Indexed => return Err("PNG à palette non pris en charge".into()),
    };
    Ok((frame.width, frame.height, rgb))
}

fn jpeg_size(bytes: &[u8]) -> Result<(u32, u32), String> {
    let mut decoder = jpeg_decoder::Decoder::new(std::io::Cursor::new(bytes));
    decoder
        .read_info()
        .map_err(|e| format!("JPEG illisible ({e})"))?;
    let info = decoder.info().ok_or("JPEG illisible")?;
    Ok((u32::from(info.width), u32::from(info.height)))
}

fn decode_jpeg(bytes: &[u8], width: u32) -> Result<(u32, u32, Vec<u8>), String> {
    let mut decoder = jpeg_decoder::Decoder::new(std::io::Cursor::new(bytes));
    decoder
        .read_info()
        .map_err(|e| format!("JPEG illisible ({e})"))?;
    let info = decoder.info().ok_or("JPEG illisible")?;
    if u64::from(info.width) * u64::from(info.height) > MAX_PIXELS {
        return Err("image trop grande pour l'aperçu".into());
    }
    // Le décodeur réduit lui-même par 2, 4 ou 8 : moins de mémoire.
    let want_h = (u32::from(info.height) * width / u32::from(info.width).max(1)).max(1);
    let (w, h) = decoder
        .scale(
            width.min(u32::from(u16::MAX)) as u16,
            want_h.min(u32::from(u16::MAX)) as u16,
        )
        .map_err(|e| format!("JPEG illisible ({e})"))?;
    let pixels = decoder
        .decode()
        .map_err(|e| format!("JPEG illisible ({e})"))?;
    let info = decoder.info().ok_or("JPEG illisible")?;
    let rgb = match info.pixel_format {
        jpeg_decoder::PixelFormat::L8 => rgb_from(&pixels, 1, false),
        jpeg_decoder::PixelFormat::L16 => {
            let high: Vec<u8> = pixels.chunks_exact(2).map(|p| p[0]).collect();
            rgb_from(&high, 1, false)
        }
        jpeg_decoder::PixelFormat::RGB24 => pixels,
        jpeg_decoder::PixelFormat::CMYK32 => pixels
            .chunks_exact(4)
            .flat_map(|p| {
                let k = u32::from(p[3]);
                let c = |v: u8| ((u32::from(v) * k) / 255) as u8;
                [c(p[0]), c(p[1]), c(p[2])]
            })
            .collect(),
    };
    Ok((u32::from(w), u32::from(h), rgb))
}

/// Réduction par moyenne de zone (jamais d'agrandissement).
fn shrink(w: u32, h: u32, rgb: &[u8], target: u32) -> (u32, u32, Vec<u8>) {
    if w <= target {
        return (w, h, rgb.to_vec());
    }
    let tw = target.max(1);
    let th = ((u64::from(h) * u64::from(tw) + u64::from(w) / 2) / u64::from(w)).max(1) as u32;
    let span = |o: u32, out: u32, src: u32| {
        let a = (u64::from(o) * u64::from(src) / u64::from(out)) as usize;
        let b = ((u64::from(o + 1) * u64::from(src) / u64::from(out)) as usize).max(a + 1);
        (a, b.min(src as usize))
    };
    let mut out = vec![0u8; (tw * th * 3) as usize];
    for oy in 0..th {
        let (y0, y1) = span(oy, th, h);
        for ox in 0..tw {
            let (x0, x1) = span(ox, tw, w);
            let mut sum = [0u32; 3];
            for y in y0..y1 {
                let row = y * w as usize * 3;
                for x in x0..x1 {
                    let i = row + x * 3;
                    sum[0] += u32::from(rgb[i]);
                    sum[1] += u32::from(rgb[i + 1]);
                    sum[2] += u32::from(rgb[i + 2]);
                }
            }
            let n = ((y1 - y0) * (x1 - x0)).max(1) as u32;
            let o = ((oy * tw + ox) * 3) as usize;
            for c in 0..3 {
                out[o + c] = ((sum[c] + n / 2) / n) as u8;
            }
        }
    }
    (tw, th, out)
}

fn image_reply(bytes: &[u8], mime: &str, info: Value) -> Value {
    json!({
        "content": [{"type": "image", "data": base64::engine::general_purpose::STANDARD.encode(bytes), "mimeType": mime}],
        "structuredContent": info,
        "isError": false,
    })
}

/// `render_figure` (réservé à l'éditeur) : l'aperçu d'une figure, `width`
/// pixels de large au plus.
pub fn render(args: &Value) -> Result<Value, String> {
    let raw = revision::str_arg(args, "path").trim().to_string();
    let path = revision::expand_home(&raw);
    if !path.is_absolute() || !path.is_file() {
        return Err(format!("{raw} : figure introuvable"));
    }
    let ext = project::ext_of(&path);
    let width = args
        .get("width")
        .and_then(Value::as_u64)
        .unwrap_or(800)
        .clamp(80, 2400) as u32;
    let mtime = crate::compile::mtime_ms(&path);
    match ext.as_str() {
        "pdf" => {
            let page = args.get("page").and_then(Value::as_u64).unwrap_or(1).max(1);
            let mut out = crate::compile::render_page(
                &json!({"path": raw, "page": page, "width": width.max(200)}),
            )?;
            out["structuredContent"]["mtime"] = json!(mtime);
            Ok(out)
        }
        "png" | "jpg" | "jpeg" => {
            let bytes = std::fs::read(&path).map_err(|e| format!("{raw} : {e}"))?;
            let png = ext == "png";
            let (w, h) = if png {
                png_size(&bytes)?
            } else {
                jpeg_size(&bytes)?
            };
            let mime = if png { "image/png" } else { "image/jpeg" };
            if bytes.len() <= RAW_MAX && u64::from(w) * 4 <= u64::from(width) * 5 {
                return Ok(image_reply(
                    &bytes,
                    mime,
                    json!({"width": w, "height": h, "mtime": mtime, "bytes": bytes.len()}),
                ));
            }
            let (dw, dh, rgb) = if png {
                decode_png(&bytes)?
            } else {
                decode_jpeg(&bytes, width)?
            };
            let (tw, th, small) = shrink(dw, dh, &rgb, width);
            let out = atelier_pdf::thumb::encode_png_compact(tw, th, &small)?;
            Ok(image_reply(
                &out,
                "image/png",
                json!({"width": tw, "height": th, "sourceWidth": w, "sourceHeight": h, "mtime": mtime, "bytes": out.len()}),
            ))
        }
        "svg" => {
            let size = std::fs::metadata(&path)
                .map(|m| m.len())
                .unwrap_or(u64::MAX);
            if size > SVG_MAX {
                return Err(format!("{raw} : SVG trop lourd pour l'aperçu"));
            }
            let bytes = std::fs::read(&path).map_err(|e| format!("{raw} : {e}"))?;
            Ok(image_reply(
                &bytes,
                "image/svg+xml",
                json!({"mtime": mtime, "bytes": bytes.len()}),
            ))
        }
        other => Err(format!("{raw} : pas d'aperçu pour un fichier .{other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_includegraphics_with_options_and_comments() {
        let text = "\\begin{figure}\n  \\includegraphics[width=\\linewidth]{figures/main/fig1}\n% \\includegraphics{old}\n  \\includegraphics*[trim=0 0 0 0, clip]\n    {fig2.png} % fin\n\\includegraphicsx{no}\n\\end{figure}";
        assert_eq!(
            includes(text),
            vec![
                (2, "figures/main/fig1".to_string()),
                (4, "fig2.png".to_string())
            ]
        );
    }

    #[test]
    fn reads_graphicspath() {
        assert_eq!(
            graphics_paths("\\graphicspath{{figures/}{img/main/}} % {x/}"),
            vec!["figures/", "img/main/"]
        );
    }

    fn write(dir: &Path, rel: &str, body: &[u8]) -> PathBuf {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, body).unwrap();
        p
    }

    #[test]
    fn lists_figures_with_their_citations() {
        let dir = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "manuscrit/main.tex", b"\\documentclass{article}\n\\graphicspath{{figures/}}\n\\begin{document}\n\\input{sections/results}\n\\end{document}\n");
        write(root, "manuscrit/sections/results.tex", b"Text.\n\\includegraphics[width=3in]{main/fig1}\n\\includegraphics{figures/supp/s1.png}\n%\\includegraphics{main/fig2}\n\\includegraphics{missing}\n");
        write(root, "manuscrit/figures/main/fig1.pdf", b"%PDF-1.4");
        write(root, "manuscrit/figures/main/fig1.png", b"png");
        write(root, "manuscrit/figures/main/fig2.pdf", b"%PDF-1.4");
        write(root, "manuscrit/figures/supp/s1.png", b"png");
        let out = list(
            app.path(),
            &json!({"dir": root.display().to_string()}),
            None,
        )
        .unwrap();
        let figs = out["structuredContent"]["figures"].as_array().unwrap();
        let find = |rel: &str| figs.iter().find(|f| f["rel"] == rel).unwrap().clone();
        let fig1 = find("manuscrit/figures/main/fig1.pdf");
        assert_eq!(fig1["uses"][0]["rel"], "manuscrit/sections/results.tex");
        assert_eq!(fig1["uses"][0]["line"], 2);
        // pdflatex prend le PDF avant le PNG du même nom.
        assert_eq!(find("manuscrit/figures/main/fig1.png")["uses"], json!([]));
        assert_eq!(find("manuscrit/figures/main/fig2.pdf")["uses"], json!([]));
        assert_eq!(find("manuscrit/figures/supp/s1.png")["uses"][0]["line"], 3);
        assert_eq!(out["structuredContent"]["unresolved"], 1);
    }

    #[test]
    fn refuses_a_folder_outside_the_roots() {
        let dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let err = list(
            app.path(),
            &json!({"dir": other.path().display().to_string()}),
            Some(&[dir.path().to_path_buf()]),
        )
        .unwrap_err();
        assert!(err.contains("hors des dossiers"), "{err}");
    }

    fn tiny_png() -> Vec<u8> {
        let rgba: Vec<u8> = (0..4 * 3)
            .flat_map(|i| [i as u8 * 10, 100, 200, if i == 0 { 0 } else { 255 }])
            .collect();
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, 4, 3);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            enc.write_header().unwrap().write_image_data(&rgba).unwrap();
        }
        out
    }

    #[test]
    fn saves_sends_and_reads_back_notes_outside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let fig = write(dir.path(), "figures/fig1.pdf", b"%PDF-1.4");
        let path = fig.display().to_string();
        let notes = json!([
            {"kind": "box", "x": 0.1, "y": 0.2, "w": 0.95, "h": 0.3, "text": "Légende trop petite"},
            {"kind": "point", "x": 0.5, "y": 0.5, "w": 0.4, "text": "  "},
        ]);
        let saved = save(app.path(), &json!({"path": path, "notes": notes})).unwrap();
        let first = &saved["structuredContent"]["notes"][0];
        assert_eq!(first["status"], "draft");
        assert_eq!(first["w"], 0.9, "le cadre reste dans la figure");
        assert_eq!(saved["structuredContent"]["notes"][1]["w"], 0.0);
        // Rien de nouveau tant que rien n'est envoyé.
        let none = get(app.path(), &json!({}), None).unwrap();
        assert!(none["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Aucune note"));

        let image = base64::engine::general_purpose::STANDARD.encode(tiny_png());
        let sent = save(
            app.path(),
            &json!({
                "path": path, "notes": saved["structuredContent"]["notes"], "send": true,
                "image": format!("data:image/png;base64,{image}"),
                "uses": [{"rel": "results.tex", "line": 64}],
            }),
        )
        .unwrap();
        assert_eq!(sent["structuredContent"]["notes"][0]["status"], "sent");
        assert_eq!(
            sent["structuredContent"]["notes"][1]["status"], "draft",
            "une note vide ne part pas"
        );
        assert!(
            std::fs::read_dir(dir.path()).unwrap().count() == 1,
            "rien d'écrit dans le projet"
        );

        let read = get(app.path(), &json!({}), None).unwrap();
        let text = read["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("results.tex:64"), "{text}");
        assert!(
            text.contains("1. [cadre x 10–100 %, y 20–50 %] Légende trop petite"),
            "{text}"
        );
        assert!(!text.contains("2."), "{text}");
        assert_eq!(read["content"][1]["type"], "image");
        // Lu : le prochain appel sans chemin rend encore le dernier envoi, sans le perdre.
        let again = get(app.path(), &json!({}), None).unwrap();
        assert!(again["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Légende trop petite"));
        // Hors des dossiers ouverts : rien.
        let other = tempfile::tempdir().unwrap();
        let hidden = get(app.path(), &json!({}), Some(&[other.path().to_path_buf()])).unwrap();
        assert!(hidden["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Aucune note"));

        // Effacer toutes les notes retire la figure et son image.
        save(app.path(), &json!({"path": path, "notes": []})).unwrap();
        assert!(read_store(app.path()).is_empty());
        assert_eq!(
            std::fs::read_dir(app.path().join(SNAP_DIR))
                .unwrap()
                .count(),
            0
        );
    }

    #[test]
    fn refuses_to_send_without_text_or_with_a_bad_image() {
        let dir = tempfile::tempdir().unwrap();
        let app = tempfile::tempdir().unwrap();
        let fig = write(dir.path(), "f.png", b"x").display().to_string();
        let err = save(
            app.path(),
            &json!({"path": fig, "notes": [{"kind": "point", "text": ""}], "send": true}),
        )
        .unwrap_err();
        assert!(err.contains("aucune note"), "{err}");
        let err = save(
            app.path(),
            &json!({"path": fig, "notes": [{"text": "a"}], "send": true, "image": "aGVsbG8="}),
        )
        .unwrap_err();
        assert!(err.contains("PNG ou un JPEG"), "{err}");
    }

    #[test]
    fn renders_a_png_and_shrinks_a_large_one() {
        let dir = tempfile::tempdir().unwrap();
        let small = write(dir.path(), "small.png", &tiny_png());
        let out = render(&json!({"path": small.display().to_string(), "width": 400})).unwrap();
        assert_eq!(out["content"][0]["mimeType"], "image/png");
        assert_eq!(out["structuredContent"]["width"], 4);
        // Une image plus large que demandé est réduite et recodée.
        let (w, h) = (1000u32, 500u32);
        let mut out_png = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out_png, w, h);
            enc.set_color(png::ColorType::Grayscale);
            enc.set_depth(png::BitDepth::Eight);
            let data: Vec<u8> = (0..w * h).map(|i| (i % 256) as u8).collect();
            enc.write_header().unwrap().write_image_data(&data).unwrap();
        }
        let big = write(dir.path(), "big.png", &out_png);
        let out = render(&json!({"path": big.display().to_string(), "width": 200})).unwrap();
        assert_eq!(out["structuredContent"]["width"], 200);
        assert_eq!(out["structuredContent"]["height"], 100);
        assert_eq!(out["structuredContent"]["sourceWidth"], 1000);
        let err =
            render(&json!({"path": write(dir.path(), "f.eps", b"%!PS").display().to_string()}))
                .unwrap_err();
        assert!(err.contains("pas d'aperçu"), "{err}");
    }

    #[test]
    fn shrink_averages_blocks() {
        let rgb = [0, 0, 0, 255, 255, 255, 10, 10, 10, 30, 30, 30];
        let (w, h, out) = shrink(4, 1, &rgb, 2);
        assert_eq!((w, h), (2, 1));
        assert_eq!(out, vec![128, 128, 128, 20, 20, 20]);
    }
}
