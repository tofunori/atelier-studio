//! Diagnostic de l'environnement (premier lancement, Réglages > Environnement) :
//! les outils externes dont dépendent des fonctions d'Atelier, trouvés ou non,
//! et de quoi les installer. Données seulement : libellés et explications
//! vivent côté interface. Résolution sans sous-processus (PATH + dossiers
//! Homebrew et MacTeX), sauf `xcode-select -p` pour git sur macOS.

use super::*;
use std::path::{Path, PathBuf};

/// Installation officielle des CLI d'agents (premier lancement).
pub(super) fn agent_install_command(id: &str) -> Option<&'static str> {
    match id {
        "claude" => Some("curl -fsSL https://claude.ai/install.sh | bash"),
        "codex" => Some("brew install --cask codex"),
        _ => None,
    }
}

const HOMEBREW_INSTALL: &str =
    r#"/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)""#;

/// Dossiers fouillés après le PATH : l'app lancée depuis le Finder n'a pas
/// toujours ceux de Homebrew ni de MacTeX.
const EXTRA_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/Library/TeX/texbin"];

struct ProbeContext {
    dirs: Vec<PathBuf>,
    /// `xcode-select -p` réussit (outils de ligne de commande présents).
    /// `None` hors macOS : git se cherche alors comme les autres.
    command_line_tools: Option<bool>,
    zotero_dir: PathBuf,
}

impl ProbeContext {
    fn current(app_dir: &Path) -> Self {
        let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
            .map(|path| std::env::split_paths(&path).collect())
            .unwrap_or_default();
        dirs.extend(EXTRA_DIRS.iter().map(PathBuf::from));
        let command_line_tools = cfg!(target_os = "macos").then(|| {
            std::process::Command::new("xcode-select")
                .arg("-p")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .is_ok_and(|status| status.success())
        });
        Self {
            dirs,
            command_line_tools,
            zotero_dir: atelier_integrations::Integrations::load_from(app_dir).zotero_dir(),
        }
    }

    fn find(&self, name: &str) -> Option<PathBuf> {
        self.dirs
            .iter()
            .map(|dir| dir.join(name))
            .find(|path| is_executable(path))
    }
}

fn is_executable(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else { return false };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
    }
}

fn tool(
    id: &str,
    path: Option<&Path>,
    found: bool,
    detail: Option<&str>,
    install_command: Option<&str>,
    install_url: &str,
) -> Value {
    json!({
        "id": id,
        "found": found,
        "path": path.map(|p| p.to_string_lossy()),
        "detail": detail,
        "installCommand": install_command,
        "installUrl": install_url,
    })
}

fn probe_tools(ctx: &ProbeContext) -> Vec<Value> {
    let brew = ctx.find("brew");

    // Sur macOS, /usr/bin/git existe toujours mais n'est qu'un raccourci qui
    // propose l'installation : seuls les outils de ligne de commande comptent.
    let git = match ctx.command_line_tools {
        Some(false) => None,
        _ => ctx.find("git"),
    };

    let pdftotext = ctx.find("pdftotext");
    let pdftohtml = ctx.find("pdftohtml");
    let poppler_missing = match (&pdftotext, &pdftohtml) {
        (Some(_), None) => Some("pdftohtml"),
        (None, Some(_)) => Some("pdftotext"),
        _ => None,
    };

    let (tex, tex_variant) = match ctx.find("latexmk") {
        Some(path) => (Some(path), Some("latexmk")),
        None => match ctx.find("tectonic") {
            Some(path) => (Some(path), Some("tectonic")),
            None => (None, None),
        },
    };

    let zotero_found = ctx.zotero_dir.join("zotero.sqlite").is_file();

    vec![
        tool("homebrew", brew.as_deref(), brew.is_some(), None, Some(HOMEBREW_INSTALL), "https://brew.sh"),
        tool(
            "git",
            git.as_deref(),
            git.is_some(),
            None,
            Some("xcode-select --install"),
            "https://developer.apple.com/xcode/resources/",
        ),
        tool(
            "poppler",
            pdftotext.as_deref(),
            pdftotext.is_some() && pdftohtml.is_some(),
            poppler_missing,
            Some("brew install poppler"),
            "https://poppler.freedesktop.org/",
        ),
        tool(
            "tex",
            tex.as_deref(),
            tex.is_some(),
            tex_variant,
            Some("brew install tectonic"),
            "https://tectonic-typesetting.github.io/",
        ),
        tool(
            "zotero",
            Some(&ctx.zotero_dir),
            zotero_found,
            None,
            None,
            "https://www.zotero.org/download/",
        ),
    ]
}

/// `environmentStatus` : relu à chaque demande (quelques `stat`, un
/// `xcode-select`), donc « Revérifier » voit tout de suite une installation.
pub(super) async fn handle_environment_status(state: &AppState) -> Vec<String> {
    let app_dir = state.app_dir().to_path_buf();
    match crate::ws_dispatch::blocking(move || probe_tools(&ProbeContext::current(&app_dir))).await {
        Ok(tools) => vec![json_msg(json!({"type": "environmentStatus", "tools": tools}))],
        Err(error) => vec![err(format!("diagnostic de l'environnement impossible : {error}"))],
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn install(dir: &Path, name: &str) {
        let path = dir.join(name);
        std::fs::write(&path, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    fn by_id<'a>(tools: &'a [Value], id: &str) -> &'a Value {
        tools.iter().find(|tool| tool["id"] == id).unwrap()
    }

    #[test]
    fn a_bare_machine_lists_every_tool_as_missing_with_its_install() {
        let bin = tempfile::tempdir().unwrap();
        let zotero = tempfile::tempdir().unwrap();
        let ctx = ProbeContext {
            dirs: vec![bin.path().to_path_buf()],
            command_line_tools: Some(false),
            zotero_dir: zotero.path().to_path_buf(),
        };
        let tools = probe_tools(&ctx);
        let ids: Vec<&str> = tools.iter().map(|tool| tool["id"].as_str().unwrap()).collect();
        assert_eq!(ids, ["homebrew", "git", "poppler", "tex", "zotero"]);
        for tool in &tools {
            assert_eq!(tool["found"], false, "{tool}");
            assert!(tool["installUrl"].as_str().is_some_and(|url| url.starts_with("https://")));
        }
        assert_eq!(by_id(&tools, "poppler")["installCommand"], "brew install poppler");
        assert_eq!(by_id(&tools, "git")["installCommand"], "xcode-select --install");
    }

    #[test]
    fn installed_tools_are_found_and_git_needs_the_command_line_tools() {
        let bin = tempfile::tempdir().unwrap();
        for name in ["brew", "git", "pdftotext", "pdftohtml", "tectonic"] {
            install(bin.path(), name);
        }
        let zotero = tempfile::tempdir().unwrap();
        std::fs::write(zotero.path().join("zotero.sqlite"), b"").unwrap();
        let mut ctx = ProbeContext {
            dirs: vec![bin.path().to_path_buf()],
            command_line_tools: Some(true),
            zotero_dir: zotero.path().to_path_buf(),
        };
        let tools = probe_tools(&ctx);
        for tool in &tools {
            assert_eq!(tool["found"], true, "{tool}");
        }
        assert_eq!(by_id(&tools, "tex")["detail"], "tectonic");
        assert_eq!(
            by_id(&tools, "poppler")["path"],
            bin.path().join("pdftotext").to_string_lossy().as_ref()
        );

        ctx.command_line_tools = Some(false);
        assert_eq!(by_id(&probe_tools(&ctx), "git")["found"], false);
    }

    #[test]
    fn half_of_poppler_is_not_enough_and_says_which_half() {
        let bin = tempfile::tempdir().unwrap();
        install(bin.path(), "pdftotext");
        // présent mais pas exécutable : ne compte pas
        std::fs::write(bin.path().join("pdftohtml"), "").unwrap();
        let ctx = ProbeContext {
            dirs: vec![bin.path().to_path_buf()],
            command_line_tools: None,
            zotero_dir: bin.path().to_path_buf(),
        };
        let poppler = by_id(&probe_tools(&ctx), "poppler").clone();
        assert_eq!(poppler["found"], false);
        assert_eq!(poppler["detail"], "pdftohtml");
    }

    #[test]
    fn latexmk_wins_over_tectonic() {
        let bin = tempfile::tempdir().unwrap();
        install(bin.path(), "latexmk");
        install(bin.path(), "tectonic");
        let ctx = ProbeContext {
            dirs: vec![bin.path().to_path_buf()],
            command_line_tools: None,
            zotero_dir: bin.path().to_path_buf(),
        };
        assert_eq!(by_id(&probe_tools(&ctx), "tex")["detail"], "latexmk");
    }

    #[test]
    fn agent_installs_are_official_commands() {
        assert!(agent_install_command("claude").unwrap().contains("https://claude.ai/install.sh"));
        assert_eq!(agent_install_command("codex"), Some("brew install --cask codex"));
        assert_eq!(agent_install_command("kimi"), None);
    }
}
