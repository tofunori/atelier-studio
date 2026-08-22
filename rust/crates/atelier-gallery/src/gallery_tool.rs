//! Port de `sidecar/gallery_tool_cli.mjs` — l'outil que l'agent appelle par
//! son terminal pour afficher des fichiers dans la galerie. Dernier
//! consommateur du runtime Node embarqué (le wrapper shell
//! `sidecar/atelier-gallery-tool` pointait sur `../node-runtime/bin/node`) ;
//! porté le 2026-08-22 pour que l'app ne livre plus aucun Node.

use serde::Serialize;
use std::path::{Path, PathBuf};

pub const MAX_RELS: usize = 100;
const MAX_REL_LENGTH: usize = 2048;
const USAGE: &str =
    "usage: atelier-gallery-tool <show|open|compare|reset> [--project-root PATH] -- [FILE...]";

/// Commande envoyée au serveur — même forme JSON que la version Node.
#[derive(Debug, Serialize)]
pub struct GalleryCommand {
    pub action: String,
    pub mode: String,
    #[serde(rename = "projectRoot")]
    pub project_root: String,
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub rels: Vec<String>,
}

fn mode_for(action: &str) -> Option<&'static str> {
    match action {
        "show" => Some("focus"),
        "open" => Some("viewer"),
        "compare" => Some("selection"),
        "reset" => Some("all"),
        _ => None,
    }
}

/// `realpathSync` avec repli sur `resolve` — miroir de `canonical`.
fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| absolutize(path))
}

fn absolutize(path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/")).join(path)
    }
}

/// Miroir de `buildGalleryCommand` : valide l'action et le compte de
/// fichiers, puis rend chaque chemin relatif au projet (refus hors projet).
pub fn build_gallery_command(
    argv: &[&str],
    cwd: &Path,
    request_id: &str,
) -> Result<GalleryCommand, String> {
    let mut args = argv.iter().copied();
    let action = args.next().unwrap_or("");
    let mode = mode_for(action).ok_or(USAGE)?;
    let mut rest: Vec<&str> = args.collect();

    let mut project_root = cwd.to_path_buf();
    if rest.first() == Some(&"--project-root") {
        rest.remove(0);
        let value = if rest.is_empty() { String::new() } else { rest.remove(0).to_string() };
        if value.is_empty() {
            return Err("project-root invalide ou trop de fichiers".to_string());
        }
        project_root = PathBuf::from(value);
    }
    if rest.first() == Some(&"--") {
        rest.remove(0);
    }
    if rest.len() > MAX_RELS {
        return Err("project-root invalide ou trop de fichiers".to_string());
    }
    match action {
        "reset" if !rest.is_empty() => return Err("reset ne prend aucun fichier".to_string()),
        "show" if rest.is_empty() => return Err("show requiert au moins un fichier".to_string()),
        "open" if rest.len() != 1 => return Err("open requiert exactement un fichier".to_string()),
        "compare" if rest.len() < 2 => {
            return Err("compare requiert au moins deux fichiers".to_string())
        }
        _ => {}
    }

    let root = canonical(&project_root);
    let mut rels: Vec<String> = Vec::new();
    for input in rest {
        let candidate = if Path::new(input).is_absolute() {
            PathBuf::from(input)
        } else {
            root.join(input)
        };
        let absolute = canonical(&candidate);
        let rel = absolute
            .strip_prefix(&root)
            .map(|r| r.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/"))
            .unwrap_or_default();
        if rel.is_empty() || rel == ".." || rel.starts_with("../") || rel.len() > MAX_REL_LENGTH {
            return Err(format!("fichier hors projet refusé: {input}"));
        }
        if !rels.iter().any(|seen| seen == &rel) {
            rels.push(rel);
        }
    }
    if action == "compare" && rels.len() < 2 {
        return Err("compare requiert deux fichiers distincts".to_string());
    }
    Ok(GalleryCommand {
        action: action.to_string(),
        mode: mode.to_string(),
        project_root: root.to_string_lossy().into_owned(),
        request_id: request_id.to_string(),
        rels,
    })
}

/// Port et jeton du serveur local, lus dans `sidecar.lock`.
pub fn parse_lock(raw: &str) -> Result<(u16, String), String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|_| "sidecar.lock invalide".to_string())?;
    let port = value.get("port").and_then(serde_json::Value::as_u64).unwrap_or(0);
    let token = value.get("token").and_then(serde_json::Value::as_str).unwrap_or("");
    if port == 0 || port > 65535 || token.is_empty() {
        return Err("sidecar.lock invalide".to_string());
    }
    Ok((port as u16, token.to_string()))
}

fn default_lock_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    Path::new(&home)
        .join("Library")
        .join("Application Support")
        .join("atelier-studio")
        .join("sidecar.lock")
}

/// UUID v4 sans dépendance dédiée (le serveur ne l'utilise que comme
/// corrélateur opaque).
fn request_id() -> String {
    use rand::Rng;
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32])
}

fn post_gallery_command(command: &GalleryCommand) -> Result<String, String> {
    let raw = std::fs::read_to_string(default_lock_path())
        .map_err(|e| format!("sidecar.lock illisible: {e}"))?;
    let (port, token) = parse_lock(&raw)?;
    let response = ureq::post(&format!("http://127.0.0.1:{port}/gallery-command"))
        .set("content-type", "application/json")
        .set("x-atelier-token", &token)
        .send_json(serde_json::to_value(command).map_err(|e| e.to_string())?);
    match response {
        Ok(ok) => ok.into_string().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code, body)) => {
            let text = body.into_string().unwrap_or_default();
            Err(if text.is_empty() { format!("gallery-command HTTP {code}") } else { text })
        }
        Err(other) => Err(other.to_string()),
    }
}

/// Point d'entrée du binaire : rend le code de sortie du process.
pub fn run(argv: Vec<String>) -> i32 {
    let refs: Vec<&str> = argv.iter().map(String::as_str).collect();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let result = build_gallery_command(&refs, &cwd, &request_id())
        .and_then(|command| post_gallery_command(&command));
    match result {
        Ok(body) => {
            println!("{body}");
            0
        }
        Err(error) => {
            eprintln!("atelier-gallery-tool: {error}");
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn root_with(files: &[&str]) -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        for rel in files {
            let path = dir.path().join(rel);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, b"x").unwrap();
        }
        dir
    }

    fn build(root: &std::path::Path, argv: &[&str]) -> Result<GalleryCommand, String> {
        build_gallery_command(argv, root, "req-fixe")
    }

    #[test]
    fn chaque_action_porte_son_mode() {
        let dir = root_with(&["a.png", "b.png"]);
        let root = dir.path();
        assert_eq!(build(root, &["show", "--", "a.png"]).unwrap().mode, "focus");
        assert_eq!(build(root, &["open", "--", "a.png"]).unwrap().mode, "viewer");
        assert_eq!(build(root, &["compare", "--", "a.png", "b.png"]).unwrap().mode, "selection");
        assert_eq!(build(root, &["reset"]).unwrap().mode, "all");
    }

    #[test]
    fn action_inconnue_rend_l_usage() {
        let dir = root_with(&[]);
        let err = build(dir.path(), &["montre", "--", "a.png"]).unwrap_err();
        assert!(err.starts_with("usage: atelier-gallery-tool"), "err={err}");
        assert!(build(dir.path(), &[]).is_err());
    }

    #[test]
    fn chaque_action_impose_son_compte_de_fichiers() {
        let dir = root_with(&["a.png", "b.png"]);
        let root = dir.path();
        assert!(build(root, &["reset", "--", "a.png"]).is_err(), "reset ne prend aucun fichier");
        assert!(build(root, &["show"]).is_err(), "show exige au moins un fichier");
        assert!(build(root, &["open", "--", "a.png", "b.png"]).is_err(), "open en exige exactement un");
        assert!(build(root, &["compare", "--", "a.png"]).is_err(), "compare en exige deux");
    }

    #[test]
    fn les_chemins_deviennent_relatifs_au_projet_et_dedoublonnes() {
        let dir = root_with(&["fig/a.png", "b.png"]);
        let root = dir.path();
        let absolute = root.join("b.png");
        let command = build(
            root,
            &["compare", "--", "fig/a.png", &absolute.to_string_lossy(), "fig/a.png"],
        )
        .unwrap();
        // séparateurs normalisés en `/`, doublon retiré, ordre préservé
        assert_eq!(command.rels, vec!["fig/a.png".to_string(), "b.png".to_string()]);
        assert_eq!(command.action, "compare");
        assert_eq!(command.request_id, "req-fixe");
    }

    #[test]
    fn un_fichier_hors_projet_est_refuse() {
        let dir = root_with(&["a.png"]);
        let outside = tempdir().unwrap();
        std::fs::write(outside.path().join("vole.png"), b"x").unwrap();
        let err = build(dir.path(), &["show", "--", &outside.path().join("vole.png").to_string_lossy()])
            .unwrap_err();
        assert!(err.contains("hors projet refusé"), "err={err}");
        assert!(build(dir.path(), &["show", "--", "../evade.png"]).is_err());
    }

    #[test]
    fn project_root_explicite_est_lu_avant_les_fichiers() {
        let dir = root_with(&["sous/a.png"]);
        let sous = dir.path().join("sous");
        let command = build(
            dir.path(),
            &["show", "--project-root", &sous.to_string_lossy(), "--", "a.png"],
        )
        .unwrap();
        assert_eq!(command.rels, vec!["a.png".to_string()]);
        assert!(command.project_root.ends_with("sous"), "root={}", command.project_root);
    }

    #[test]
    fn trop_de_fichiers_est_refuse_avant_toute_resolution() {
        let dir = root_with(&["a.png"]);
        let mut argv = vec!["show", "--"];
        let many: Vec<String> = (0..=MAX_RELS).map(|i| format!("f{i}.png")).collect();
        argv.extend(many.iter().map(String::as_str));
        assert!(build(dir.path(), &argv).is_err());
    }

    #[test]
    fn le_verrou_du_serveur_est_valide_avant_tout_appel() {
        assert!(parse_lock(r#"{"port":8123,"token":"abc"}"#).is_ok());
        assert!(parse_lock(r#"{"port":0,"token":"abc"}"#).is_err());
        assert!(parse_lock(r#"{"port":70000,"token":"abc"}"#).is_err());
        assert!(parse_lock(r#"{"port":8123}"#).is_err());
        assert!(parse_lock("pas du json").is_err());
    }
}
