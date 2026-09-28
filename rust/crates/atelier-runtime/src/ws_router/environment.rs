//! Diagnostic de l'environnement (premier lancement, Réglages > Environnement) :
//! les outils externes dont dépendent des fonctions d'Atelier, trouvés ou non,
//! et de quoi les installer. Données seulement : libellés et explications
//! vivent côté interface. Résolution sans sous-processus (PATH + dossiers
//! Homebrew et MacTeX), sauf `xcode-select -p` pour git sur macOS.
//!
//! La lecture des PDF (PDFium, outil `atelier-pdf`) est livrée avec l'app et
//! n'a plus de rangée ; LaTeX n'est jamais « manquant » : faute de MacTeX ou
//! de tectonic, Atelier télécharge tectonic au premier « Compiler ».

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

const HOMEBREW_INSTALL: &str = r#"/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)""#;

/// Dossiers fouillés après le PATH : l'app lancée depuis le Finder n'a pas
/// toujours ceux de Homebrew ni de MacTeX.
const EXTRA_DIRS: &[&str] = &["/opt/homebrew/bin", "/usr/local/bin", "/Library/TeX/texbin"];

struct ProbeContext {
    dirs: Vec<PathBuf>,
    /// `xcode-select -p` réussit (outils de ligne de commande présents).
    /// `None` hors macOS : git se cherche alors comme les autres.
    command_line_tools: Option<bool>,
    zotero_dir: PathBuf,
    /// tectonic téléchargé par Atelier (voir `atelier_integrations::tectonic`).
    tectonic_download: PathBuf,
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
            tectonic_download: atelier_integrations::tectonic::installed_path(app_dir),
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
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
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

    // Sans rien d'installé, `detail` dit « au besoin » : la compilation
    // télécharge tectonic elle-même, il n'y a rien à proposer.
    let (tex, tex_variant) = if let Some(path) = ctx.find("latexmk") {
        (Some(path), "latexmk")
    } else if let Some(path) = ctx.find("tectonic") {
        (Some(path), "tectonic")
    } else if is_executable(&ctx.tectonic_download) {
        (Some(ctx.tectonic_download.clone()), "tectonic")
    } else {
        (None, "on-demand")
    };

    let zotero_found = ctx.zotero_dir.join("zotero.sqlite").is_file();

    vec![
        tool(
            "homebrew",
            brew.as_deref(),
            brew.is_some(),
            None,
            Some(HOMEBREW_INSTALL),
            "https://brew.sh",
        ),
        tool(
            "git",
            git.as_deref(),
            git.is_some(),
            None,
            Some("xcode-select --install"),
            "https://developer.apple.com/xcode/resources/",
        ),
        tool(
            "tex",
            tex.as_deref(),
            tex.is_some(),
            Some(tex_variant),
            None,
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
    match crate::ws_dispatch::blocking(move || probe_tools(&ProbeContext::current(&app_dir))).await
    {
        Ok(tools) => vec![json_msg(
            json!({"type": "environmentStatus", "tools": tools}),
        )],
        Err(error) => vec![err(format!(
            "diagnostic de l'environnement impossible : {error}"
        ))],
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

    fn context(bin: &Path, command_line_tools: Option<bool>, zotero: &Path) -> ProbeContext {
        ProbeContext {
            dirs: vec![bin.to_path_buf()],
            command_line_tools,
            zotero_dir: zotero.to_path_buf(),
            tectonic_download: atelier_integrations::tectonic::installed_path(&bin.join("app")),
        }
    }

    #[test]
    fn a_bare_machine_lists_every_tool_as_missing_with_its_install() {
        let bin = tempfile::tempdir().unwrap();
        let zotero = tempfile::tempdir().unwrap();
        let ctx = context(bin.path(), Some(false), zotero.path());
        let tools = probe_tools(&ctx);
        let ids: Vec<&str> = tools
            .iter()
            .map(|tool| tool["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["homebrew", "git", "tex", "zotero"]);
        for tool in &tools {
            assert_eq!(tool["found"], false, "{tool}");
            assert!(tool["installUrl"]
                .as_str()
                .is_some_and(|url| url.starts_with("https://")));
        }
        assert_eq!(
            by_id(&tools, "git")["installCommand"],
            "xcode-select --install"
        );
        // LaTeX : rien à installer, tectonic viendra au premier « Compiler ».
        let tex = by_id(&tools, "tex");
        assert_eq!(tex["detail"], "on-demand");
        assert!(tex["installCommand"].is_null(), "{tex}");
    }

    #[test]
    fn installed_tools_are_found_and_git_needs_the_command_line_tools() {
        let bin = tempfile::tempdir().unwrap();
        for name in ["brew", "git", "tectonic"] {
            install(bin.path(), name);
        }
        let zotero = tempfile::tempdir().unwrap();
        std::fs::write(zotero.path().join("zotero.sqlite"), b"").unwrap();
        let mut ctx = context(bin.path(), Some(true), zotero.path());
        let tools = probe_tools(&ctx);
        for tool in &tools {
            assert_eq!(tool["found"], true, "{tool}");
        }
        assert_eq!(by_id(&tools, "tex")["detail"], "tectonic");
        assert_eq!(
            by_id(&tools, "tex")["path"],
            bin.path().join("tectonic").to_string_lossy().as_ref()
        );

        ctx.command_line_tools = Some(false);
        assert_eq!(by_id(&probe_tools(&ctx), "git")["found"], false);
    }

    #[test]
    fn the_tectonic_atelier_downloaded_counts_as_latex() {
        let bin = tempfile::tempdir().unwrap();
        let ctx = context(bin.path(), None, bin.path());
        let downloaded = ctx.tectonic_download.clone();
        std::fs::create_dir_all(downloaded.parent().unwrap()).unwrap();
        // présent mais pas exécutable (téléchargement interrompu) : ne compte pas
        std::fs::write(&downloaded, "").unwrap();
        assert_eq!(by_id(&probe_tools(&ctx), "tex")["found"], false);
        std::fs::set_permissions(&downloaded, std::fs::Permissions::from_mode(0o755)).unwrap();
        let tex = by_id(&probe_tools(&ctx), "tex").clone();
        assert_eq!(tex["found"], true);
        assert_eq!(tex["detail"], "tectonic");
        assert_eq!(tex["path"], downloaded.to_string_lossy().as_ref());
    }

    #[test]
    fn latexmk_wins_over_tectonic() {
        let bin = tempfile::tempdir().unwrap();
        install(bin.path(), "latexmk");
        install(bin.path(), "tectonic");
        let ctx = context(bin.path(), None, bin.path());
        assert_eq!(by_id(&probe_tools(&ctx), "tex")["detail"], "latexmk");
    }

    #[test]
    fn agent_installs_are_official_commands() {
        assert!(agent_install_command("claude")
            .unwrap()
            .contains("https://claude.ai/install.sh"));
        assert_eq!(
            agent_install_command("codex"),
            Some("brew install --cask codex")
        );
        assert_eq!(agent_install_command("kimi"), None);
    }
}
