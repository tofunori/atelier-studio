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
//! `$ATELIER_APP_DIR/mcp-revisions/` (les 100 dernières).

use serde_json::{json, Value};
use std::ops::Range;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const QUOTE_MAX: usize = 20_000;
pub const TEXT_MAX: usize = 20_000;
pub const REASON_MAX: usize = 600;
const BACKUPS_KEPT: usize = 100;
const READ_DEFAULT_LINES: usize = 400;
const READ_MAX_LINES: usize = 2_000;

/// Un fichier .tex existant, donné par un chemin absolu.
fn tex_path(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("path manquant : le chemin absolu du fichier .tex".into());
    }
    let expanded = match raw.strip_prefix("~/") {
        Some(rest) => PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(rest),
        None => PathBuf::from(raw),
    };
    if !expanded.is_absolute() {
        return Err(format!("{raw} : donne le chemin absolu du fichier"));
    }
    let is_tex = expanded
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("tex"));
    if !is_tex {
        return Err(format!(
            "{raw} : seuls les fichiers .tex sont pris en charge"
        ));
    }
    if !expanded.is_file() {
        return Err(format!("{raw} : fichier introuvable"));
    }
    Ok(expanded)
}

fn read(path: &Path) -> Result<String, String> {
    std::fs::read_to_string(path)
        .map_err(|e| format!("{} : lecture impossible ({e})", path.display()))
}

/// Ligne (à partir de 1) de l'octet `at`.
fn line_of(content: &str, at: usize) -> usize {
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

fn find_unique(content: &str, needle: &str, what: &str) -> Result<Range<usize>, String> {
    let hits = find_all(content, needle);
    match hits.len() {
        1 => Ok(hits[0].clone()),
        0 => Err(format!("{what} introuvable dans le fichier : recopie-le mot pour mot (lis le fichier avec read_tex_file)")),
        n => Err(format!("{what} présent {n} fois dans le fichier : cite une phrase de plus pour qu'il soit unique")),
    }
}

fn str_arg<'a>(args: &'a Value, key: &str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or("")
}

fn file_name(path: &Path) -> String {
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
    backup(app_dir, &path, &content)?;
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

fn backup(app_dir: &Path, path: &Path, content: &str) -> Result<(), String> {
    let dir = app_dir.join("mcp-revisions");
    std::fs::create_dir_all(&dir).map_err(|e| format!("sauvegarde impossible ({e})"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let name = format!("{stamp:020}-{}", file_name(path));
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
}
