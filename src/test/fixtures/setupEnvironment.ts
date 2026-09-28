// Messages serveur du premier lancement (setupStatus, environmentStatus),
// partagés par les tests du store, de la section Environnement et de
// l'accueil. Formes exactes du contrat Rust (ws_router/environment.rs).
export const CLAUDE_READY = {
  id: "claude", label: "Claude Code", kind: "cli", installed: true, version: "2.1.283",
  binPath: "/Users/t/.local/bin/claude", auth: "ready", models: 4, loginCommand: "claude auth login",
  installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
};
export const CODEX_READY = {
  id: "codex", label: "Codex", kind: "cli", installed: true, version: "0.155.1",
  binPath: "/opt/homebrew/bin/codex", auth: "ready", models: 3, loginCommand: "codex login",
  installCommand: "brew install --cask codex",
};
export const CLAUDE_MISSING = { ...CLAUDE_READY, installed: false, version: null, binPath: null, auth: "not_installed" };
export const CODEX_MISSING = { ...CODEX_READY, installed: false, version: null, binPath: null, auth: "not_installed" };
export const CODEX_LOGGED_OUT = { ...CODEX_READY, auth: "login_needed" };

export function setupStatus(providers: unknown[]) {
  return {
    type: "setupStatus",
    status: {
      runtime: { node: "rust", version: "1.0.0", bundled: false },
      sidecar: { pid: 1, startedAt: "", appVersion: "1.0.0", bundleHash: "x", dir: "/x" },
      providers,
    },
  };
}

export const TOOLS = [
  { id: "homebrew", found: false, path: null, detail: null,
    installCommand: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    installUrl: "https://brew.sh" },
  { id: "git", found: true, path: "/usr/bin/git", detail: null, installCommand: "xcode-select --install",
    installUrl: "https://developer.apple.com/xcode/resources/" },
  { id: "tex", found: true, path: "/opt/homebrew/bin/tectonic", detail: "tectonic", installCommand: null,
    installUrl: "https://tectonic-typesetting.github.io/" },
  { id: "zotero", found: false, path: "/Users/t/Zotero", detail: null, installCommand: null,
    installUrl: "https://www.zotero.org/download/" },
];

/** Ni MacTeX ni tectonic : la première compilation téléchargera tectonic. */
export const TEX_ON_DEMAND = { id: "tex", found: false, path: null, detail: "on-demand", installCommand: null,
  installUrl: "https://tectonic-typesetting.github.io/" };

